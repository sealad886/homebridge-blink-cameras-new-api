/**
 * Blink Camera Source
 *
 * Implements CameraStreamingDelegate for HomeKit camera snapshot + live streaming support.
 * Live streaming uses Blink RTSPS URLs and FFmpeg to transcode to HomeKit SRTP.
 *
 * Source: API Dossier Sections 3.3, 3.4, 3.5 (Thumbnail endpoints)
 * Source: API Dossier Section 4.2 (LiveVideoResponse)
 */

import {
  CameraControllerOptions,
  CameraStreamingDelegate,
  HAP,
  PrepareStreamCallback,
  PrepareStreamRequest,
  PrepareStreamResponse,
  SnapshotRequest,
  SnapshotRequestCallback,
  StreamRequestCallback,
  StreamingRequest,
} from 'homebridge';
import { BlinkApi } from '../blink-api/client';
import { ImmisProxyServer } from '../blink-api/immis-proxy';
import { Buffer } from 'node:buffer';
import { ChildProcess, ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as dgram from 'node:dgram';
import { setInterval, clearInterval, setTimeout } from 'node:timers';
import { URL } from 'node:url';

export type DeviceType = 'camera' | 'owl' | 'doorbell';
export type AudioCodecPreference = 'opus' | 'aac-eld' | 'pcma' | 'pcmu';

export interface BlinkCameraStreamingConfig {
  enabled: boolean;
  ffmpegPath: string;
  ffmpegDebug: boolean;
  rtspTransport: 'tcp' | 'udp';
  maxStreams: number;
  audio: {
    enabled: boolean;
    twoWay: boolean;
    codec: AudioCodecPreference;
    bitrate: number;
  };
  video: {
    maxBitrate?: number;
  };
  /** Path to save debug stream recordings (MPEG-TS files) */
  debugStreamPath?: string;
  /** Snapshot cache TTL in seconds (0 = always request fresh, default 60) */
  snapshotCacheTTL?: number;
}

export type BlinkCameraStreamingConfigInput = Omit<
  Partial<BlinkCameraStreamingConfig>,
  'audio' | 'video'
> & {
  audio?: Partial<BlinkCameraStreamingConfig['audio']>;
  video?: Partial<BlinkCameraStreamingConfig['video']>;
};

const DEFAULT_STREAMING_CONFIG: BlinkCameraStreamingConfig = {
  enabled: true,
  ffmpegPath: 'ffmpeg',
  ffmpegDebug: false,
  rtspTransport: 'tcp',
  maxStreams: 1,
  audio: {
    enabled: true,
    twoWay: false,
    codec: 'opus',
    bitrate: 32,
  },
  video: {},
  snapshotCacheTTL: 60,
};

export const resolveStreamingConfig = (
  config?: BlinkCameraStreamingConfigInput,
): BlinkCameraStreamingConfig => {
  const audio: Partial<BlinkCameraStreamingConfig['audio']> = config?.audio ?? {};
  const video: Partial<BlinkCameraStreamingConfig['video']> = config?.video ?? {};
  // Two-way talkback is intentionally disabled until uplink framing is validated.
  const twoWay = false;

  return {
    enabled: config?.enabled ?? DEFAULT_STREAMING_CONFIG.enabled,
    ffmpegPath: config?.ffmpegPath ?? DEFAULT_STREAMING_CONFIG.ffmpegPath,
    ffmpegDebug: config?.ffmpegDebug ?? DEFAULT_STREAMING_CONFIG.ffmpegDebug,
    rtspTransport: config?.rtspTransport ?? DEFAULT_STREAMING_CONFIG.rtspTransport,
    maxStreams: Math.max(1, config?.maxStreams ?? DEFAULT_STREAMING_CONFIG.maxStreams),
    debugStreamPath: config?.debugStreamPath,
    snapshotCacheTTL: config?.snapshotCacheTTL ?? DEFAULT_STREAMING_CONFIG.snapshotCacheTTL,
    audio: {
      enabled: audio.enabled ?? DEFAULT_STREAMING_CONFIG.audio.enabled,
      twoWay,
      codec: audio.codec ?? DEFAULT_STREAMING_CONFIG.audio.codec,
      bitrate: audio.bitrate ?? DEFAULT_STREAMING_CONFIG.audio.bitrate,
    },
    video: {
      maxBitrate: video.maxBitrate ?? DEFAULT_STREAMING_CONFIG.video.maxBitrate,
    },
  };
};

interface PendingStreamSession {
  address: string;
  addressVersion: 'ipv4' | 'ipv6';
  sessionId: string;
  videoPort: number;
  localVideoPort: number;
  localVideoRtcpPort?: number;
  videoCryptoSuite: number;
  videoSRTP: Buffer;
  videoSSRC: number;
  audioPort?: number;
  localAudioPort?: number;
  localAudioRtcpPort?: number;
  audioCryptoSuite?: number;
  audioSRTP?: Buffer;
  audioSSRC?: number;
}

interface ActiveStreamSession extends PendingStreamSession {
  ffmpeg?: ChildProcessWithoutNullStreams;
  talkback?: ChildProcess;
  commandId?: number;
  liveviewUrl?: string;
  keepAliveTimer?: ReturnType<typeof setInterval> | null;
  stopped?: boolean;
  immisProxy?: ImmisProxyServer;
}

const usedPorts = new Set<number>();

/**
 * Convert unsigned 32-bit SSRC to signed 32-bit for FFmpeg.
 * FFmpeg's RTP muxer expects signed int32 (-2147483648 to 2147483647).
 * HomeKit provides/expects unsigned uint32 (0 to 4294967295).
 * Values above INT32_MAX (2147483647) need to be converted to negative.
 */
const ssrcToSigned = (ssrc: number): number => {
  if (ssrc > 0x7FFFFFFF) {
    return ssrc - 0x100000000;
  }
  return ssrc;
};

const redactFfmpegArgs = (args: string[]): string[] => {
  const redacted = [...args];
  for (let i = 0; i < redacted.length; i++) {
    const flag = redacted[i];
    if (flag === '-srtp_out_params' || flag === '-srtp_in_params') {
      if (i + 1 < redacted.length) {
        redacted[i + 1] = '<redacted>';
      }
    }
  }
  return redacted;
};

const allocatePort = async (): Promise<number> => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const port = await new Promise<number>((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      socket.once('error', (error) => {
        socket.close();
        reject(error);
      });
      socket.bind(0, () => {
        const address = socket.address();
        if (typeof address === 'string') {
          socket.close();
          reject(new Error('Unexpected UDP socket address type'));
          return;
        }
        const allocated = address.port;
        socket.close(() => resolve(allocated));
      });
    });

    if (!usedPorts.has(port)) {
      usedPorts.add(port);
      return port;
    }
  }

  throw new Error('Unable to allocate UDP port');
};

const releasePort = (port?: number): void => {
  if (port) {
    usedPorts.delete(port);
  }
};

const formatAddress = (address: string): string => {
  if (address.includes(':') && !address.startsWith('[')) {
    return `[${address}]`;
  }
  return address;
};

const buildRtpUrl = (
  address: string,
  port: number,
  localRtpPort?: number,
  localRtcpPort?: number,
  mtu?: number,
  useSrtp = true,
): string => {
  const scheme = useSrtp ? 'srtp' : 'rtp';
  const params = new URLSearchParams();
  params.set('rtcpport', `${port}`);
  if (localRtpPort) {
    params.set('localrtpport', `${localRtpPort}`);
  }
  if (localRtcpPort) {
    params.set('localrtcpport', `${localRtcpPort}`);
  }
  if (mtu) {
    params.set('pkt_size', `${mtu}`);
  }
  return `${scheme}://${formatAddress(address)}:${port}?${params.toString()}`;
};

const toSrtpParams = (srtp: Buffer): string => srtp.toString('base64');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class BlinkCameraSource implements CameraStreamingDelegate {
  private readonly streamingConfig: BlinkCameraStreamingConfig;
  private readonly pendingSessions = new Map<string, PendingStreamSession>();
  private readonly ongoingSessions = new Map<string, ActiveStreamSession>();
  private cachedSnapshot: Buffer | null = null;
  private cachedSnapshotTime = 0;

  constructor(
    private readonly api: BlinkApi,
    private readonly hap: HAP,
    private readonly networkId: number,
    private readonly deviceId: number,
    private readonly deviceType: DeviceType,
    private readonly serial: string,
    private readonly getThumbnailUrl: () => string | undefined,
    private readonly getDeviceStatus: () => string | undefined,
    private readonly log: (message: string) => void,
    streamingConfig?: BlinkCameraStreamingConfigInput,
  ) {
    this.streamingConfig = resolveStreamingConfig(streamingConfig);
  }

  /**
   * Handle snapshot request from HomeKit.
   * Requests a fresh thumbnail from Blink and returns it as a JPEG buffer.
   *
   * @param request - Snapshot request with width/height
   * @param callback - Callback to return image buffer or error
   */
  async handleSnapshotRequest(
    request: SnapshotRequest,
    callback: SnapshotRequestCallback,
  ): Promise<void> {
    this.log(`Snapshot requested (${request.width}x${request.height})`);

    // Check if camera is online before attempting to retrieve snapshot
    const deviceStatus = this.getDeviceStatus();
      if (deviceStatus !== undefined && deviceStatus !== 'done') {
      this.log(`Camera is offline (status: ${deviceStatus}), cannot provide snapshot`);
      callback(new Error('Camera is offline or unavailable'));
      return;
    }

    const cacheTTL = (this.streamingConfig.snapshotCacheTTL ?? 60) * 1000;
    const cacheAge = Date.now() - this.cachedSnapshotTime;

    // Return cached snapshot if still valid
    if (this.cachedSnapshot && cacheTTL > 0 && cacheAge < cacheTTL) {
      this.log(`Snapshot returned from cache (${this.cachedSnapshot.length} bytes, age ${Math.round(cacheAge / 1000)}s)`);
      callback(undefined, this.cachedSnapshot);
      return;
    }

    try {
      // Request fresh thumbnail from Blink only if cache is stale
      await this.requestThumbnail();

      // Get thumbnail URL from device data
      const url = this.getThumbnailUrl();
      if (!url) {
        throw new Error('No thumbnail URL available');
      }

      // Build full URL (thumbnails may be relative paths)
      const fullUrl = url.startsWith('http')
        ? url
        : new URL(url, this.api.getSharedRestRootUrl()).toString();

      // Fetch the thumbnail image with auth headers
      const response = await fetch(fullUrl, {
        headers: this.api.getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch thumbnail: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Cache the snapshot
      this.cachedSnapshot = buffer;
      this.cachedSnapshotTime = Date.now();

      this.log(`Snapshot returned (${buffer.length} bytes)`);
      callback(undefined, buffer);
    } catch (error) {
      this.log(`Snapshot error: ${error}`);
      callback(error as Error);
    }
  }

  /**
   * Request a fresh thumbnail from Blink API.
   * Uses the appropriate endpoint based on device type.
   */
  private async requestThumbnail(): Promise<void> {
    try {
      let response;

      switch (this.deviceType) {
        case 'camera':
          response = await this.api.requestCameraThumbnail(this.networkId, this.deviceId);
          break;
        case 'owl':
          response = await this.api.requestOwlThumbnail(this.networkId, this.deviceId);
          break;
        case 'doorbell':
          response = await this.api.requestDoorbellThumbnail(this.networkId, this.deviceId);
          break;
      }

      // Poll for command completion
      if (response) {
        const commandId = response.id ?? response.command_id;
        if (commandId) {
          await this.api.pollCommand(this.networkId, commandId);
        }
      }
    } catch (error) {
      // Log but don't fail - we may still have a cached thumbnail
      // 409 Conflict means camera is busy (e.g., during live view) - this is expected
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('409')) {
        // Camera busy - don't log as error, just skip this refresh
        return;
      }
      this.log(`Thumbnail request failed: ${error}`);
    }
  }

  /**
   * Prepare stream - allocate ports and SRTP parameters for HomeKit.
   */
  prepareStream(request: PrepareStreamRequest, callback: PrepareStreamCallback): void {
    if (!this.streamingConfig.enabled) {
      this.log('Stream preparation requested but streaming is disabled');
      callback(new Error('Live streaming disabled'));
      return;
    }

    void this.prepareStreamInternal(request, callback);
  }

  private async prepareStreamInternal(
    request: PrepareStreamRequest,
    callback: PrepareStreamCallback,
  ): Promise<void> {
    try {
      const sessionId = request.sessionID;
      const videoSSRC = randomBytes(4).readUInt32BE(0);
      const localVideoPort = await allocatePort();

      const session: PendingStreamSession = {
        address: request.targetAddress,
        addressVersion: request.addressVersion,
        sessionId,
        videoPort: request.video.port,
        localVideoPort,
        localVideoRtcpPort: await allocatePort(),
        videoCryptoSuite: request.video.srtpCryptoSuite,
        videoSRTP: Buffer.concat([request.video.srtp_key, request.video.srtp_salt]),
        videoSSRC,
      };

      if (this.streamingConfig.audio.enabled) {
        const audioSSRC = randomBytes(4).readUInt32BE(0);
        const localAudioPort = await allocatePort();
        const localAudioRtcpPort = await allocatePort();
        session.audioPort = request.audio.port;
        session.localAudioPort = localAudioPort;
        session.localAudioRtcpPort = localAudioRtcpPort;
        session.audioCryptoSuite = request.audio.srtpCryptoSuite;
        session.audioSRTP = Buffer.concat([request.audio.srtp_key, request.audio.srtp_salt]);
        session.audioSSRC = audioSSRC;
      }

      this.pendingSessions.set(sessionId, session);

      const response: PrepareStreamResponse = {
        video: {
          port: localVideoPort,
          ssrc: videoSSRC,
          srtp_key: request.video.srtp_key,
          srtp_salt: request.video.srtp_salt,
        },
      };

      if (this.streamingConfig.audio.enabled && session.audioPort && session.audioSSRC && session.audioSRTP) {
        response.audio = {
          port: session.localAudioPort ?? session.audioPort,
          ssrc: session.audioSSRC,
          srtp_key: request.audio.srtp_key,
          srtp_salt: request.audio.srtp_salt,
        };
      }

      const audioDetails = this.streamingConfig.audio.enabled && session.audioPort && session.localAudioPort
        ? ` audio target=${session.audioPort} local=${session.localAudioPort}/${session.localAudioRtcpPort ?? 'n/a'}`
        : '';
      this.log(
        `Prepared stream session ${sessionId} target=${request.targetAddress} (${request.addressVersion}) ` +
        `video target=${request.video.port} local=${localVideoPort}/${session.localVideoRtcpPort ?? 'n/a'}${audioDetails}`,
      );
      callback(undefined, response);
    } catch (error) {
      this.log(`Stream preparation failed: ${error}`);
      callback(error as Error);
    }
  }

  /**
   * Handle stream request - start/stop streaming via FFmpeg.
   */
  handleStreamRequest(request: StreamingRequest, callback: StreamRequestCallback): void {
    if (!this.streamingConfig.enabled) {
      this.log('Stream request received but streaming is disabled');
      callback();
      return;
    }

    const sessionId = request.sessionID;

    switch (request.type) {
      case 'start':
        void this.startStream(sessionId, request, callback);
        break;
      case 'reconfigure':
        this.log(`Stream reconfigure requested for session ${sessionId} (unsupported)`);
        callback();
        break;
      case 'stop':
        this.log(`Stream stop requested for session ${sessionId}`);
        void this.stopStream(sessionId).finally(() => callback());
        break;
    }
  }

  private async startStream(
    sessionId: string,
    request: Extract<StreamingRequest, { type: 'start' }>,
    callback: StreamRequestCallback,
  ): Promise<void> {
    const pending = this.pendingSessions.get(sessionId);
    if (!pending) {
      this.log(`No pending session for ${sessionId}`);
      callback(new Error('No pending streaming session'));
      return;
    }

    const active: ActiveStreamSession = {
      ...pending,
      keepAliveTimer: null,
    };
    this.pendingSessions.delete(sessionId);
    this.ongoingSessions.set(sessionId, active);

    try {
      const liveview = await this.requestLiveView();
      const originalUrl = liveview.server;
      if (!originalUrl) {
        throw new Error('Live view did not return a server URL');
      }

      const commandId = liveview.command_id ?? liveview.id;
      active.commandId = commandId;
      active.liveviewUrl = originalUrl;

      let ffmpegInputUrl: string;

      // Handle immis:// protocol using our proxy server
      if (originalUrl.startsWith('immis://')) {
        this.log(`Starting IMMIS proxy for proprietary stream protocol`);

        // Create a promise that resolves when the Blink command is ready.
        // This prevents the proxy from connecting to the immis server before
        // the camera has finished initializing, which would cause immediate disconnect.
        // For IMMIS streams, use aggressive polling (2s intervals, 30 attempts = 60s max)
        // because HomeKit has a ~10s timeout expectation for initial stream data.
        const readyPromise = commandId
          ? this.waitForLiveViewReady(commandId, 2, 30)
          : Promise.resolve();

        const immisProxy = new ImmisProxyServer({
          immisUrl: originalUrl,
          serial: this.serial,
          log: (msg) => this.log(msg),
          debug: this.streamingConfig.ffmpegDebug,
          saveStreamPath: this.streamingConfig.debugStreamPath,
          waitForReady: readyPromise,
        });

        active.immisProxy = immisProxy;
        ffmpegInputUrl = await immisProxy.start();
        this.log(`IMMIS proxy ready at ${ffmpegInputUrl}`);
      } else {
        // Standard RTSPS URL - use directly
        ffmpegInputUrl = originalUrl;
      }

      // CRITICAL: Start FFmpeg IMMEDIATELY after proxy is ready.
      // HomeKit has a ~10s timeout. waitForLiveViewReady can take up to 30s,
      // which would cause HomeKit to timeout and send a stop request before
      // FFmpeg even connects, killing the proxy.
      const ffmpegArgs = this.buildFfmpegArgs(ffmpegInputUrl, request, active);
      this.log(`Starting stream ${sessionId} via FFmpeg with URL: ${ffmpegInputUrl}`);
      if (this.streamingConfig.ffmpegDebug) {
        const safeArgs = redactFfmpegArgs(ffmpegArgs);
        this.log(`FFmpeg args: ${safeArgs.join(' ')}`);
      }

      const ffmpeg = spawn(this.streamingConfig.ffmpegPath, ffmpegArgs);
      active.ffmpeg = ffmpeg;

      // CRITICAL FIX: Call the callback IMMEDIATELY after FFmpeg spawns.
      // The callback signals to HomeKit that we are ready to receive RTP data,
      // not that video has started playing. Previously we waited for stderr output
      // which only works with -loglevel debug. Without debug output, HomeKit would
      // timeout and SIGKILL FFmpeg after ~8 seconds before it even started encoding.
      //
      // The ffmpeg 'spawn' event confirms the process started successfully.
      // HomeKit will then wait for actual video frames on the RTP socket.
      ffmpeg.on('spawn', () => {
        this.log(`FFmpeg spawned for session ${sessionId}, signaling stream ready`);
        callback();
      });

      ffmpeg.stderr.on('data', (data) => {
        if (this.streamingConfig.ffmpegDebug) {
          this.log(`FFmpeg(${sessionId}): ${data.toString('utf8').trim()}`);
        }
      });

      ffmpeg.on('error', (error) => {
        this.log(`FFmpeg failed to start for session ${sessionId}: ${error.message}`);
        // Note: If spawn failed, the spawn event won't fire so callback wasn't called yet.
        // We rely on HomeKit to handle the error gracefully when RTP data doesn't arrive.
      });

      ffmpeg.on('exit', (code, signal) => {
        if (code !== 0 || signal) {
          this.log(`FFmpeg exited for session ${sessionId} (code=${code}, signal=${signal})`);
        }
        // Clean up the session - HomeKit will detect the stream ended via RTP timeout
        void this.stopStream(sessionId);
      });

      // Start keep-alive and liveview polling in the BACKGROUND (non-blocking)
      // This must happen AFTER FFmpeg is spawned to avoid HomeKit timeout
      const isImmisStream = originalUrl.startsWith('immis://');
      if (commandId) {
        // For IMMIS streams, waitForLiveViewReady is already handled via the proxy's waitForReady promise
        // For non-IMMIS streams, poll for readiness in background
        if (!isImmisStream) {
          this.waitForLiveViewReady(commandId, liveview.polling_interval ?? 5)
            .catch((error) => {
              this.log(`Live view readiness check failed: ${error}`);
            });
        }
        // Start keep-alive immediately
        this.startKeepAlive(sessionId, commandId, liveview.continue_interval ?? liveview.polling_interval);
      }

      // Two-way audio handling
      if (this.streamingConfig.audio.enabled && this.streamingConfig.audio.twoWay) {
        if (!isImmisStream) {
          // Standard RTSP talkback
          this.startTalkback(sessionId, request, active);
        } else if (isImmisStream && active.immisProxy) {
          // IMMIS talkback via proxy using AAC-LATM uplink (experimental)
          this.startImmisTalkback(sessionId, request, active);
        }
      }
    } catch (error) {
      this.log(`Failed to start stream ${sessionId}: ${error}`);
      await this.stopStream(sessionId);
      callback(error as Error);
    }
  }

  private async stopStream(sessionId: string): Promise<void> {
    const pending = this.pendingSessions.get(sessionId);
    if (pending) {
      releasePort(pending.localVideoPort);
      releasePort(pending.localVideoRtcpPort);
      releasePort(pending.localAudioPort);
      releasePort(pending.localAudioRtcpPort);
      this.pendingSessions.delete(sessionId);
    }

    const active = this.ongoingSessions.get(sessionId);
    if (!active || active.stopped) {
      return;
    }

    active.stopped = true;

    if (active.keepAliveTimer) {
      clearInterval(active.keepAliveTimer);
      active.keepAliveTimer = null;
    }

    try {
      active.ffmpeg?.kill('SIGKILL');
    } catch (error) {
      this.log(`Error stopping FFmpeg for session ${sessionId}: ${error}`);
    }

    try {
      active.talkback?.kill('SIGKILL');
    } catch (error) {
      this.log(`Error stopping talkback FFmpeg for session ${sessionId}: ${error}`);
    }

    // Signal IMMIS audio stop if applicable
    try {
      active.immisProxy?.stopAudio?.();
    } catch (error) {
      this.log(`Error sending IMMIS stopAudio for session ${sessionId}: ${error}`);
    }

    // Stop the IMMIS proxy if it was used
    if (active.immisProxy) {
      try {
        active.immisProxy.stop();
      } catch (error) {
        this.log(`Error stopping IMMIS proxy for session ${sessionId}: ${error}`);
      }
    }

    releasePort(active.localVideoPort);
    releasePort(active.localVideoRtcpPort);
    releasePort(active.localAudioPort);
    releasePort(active.localAudioRtcpPort);

    if (active.commandId) {
      try {
        await this.api.completeCommand(this.networkId, active.commandId);
      } catch (error) {
        this.log(`Failed to end live view command ${active.commandId}: ${error}`);
      }
    }

    this.ongoingSessions.delete(sessionId);
    this.log(`Stopped stream session ${sessionId}`);
  }

  private async requestLiveView(): Promise<{ server: string; command_id?: number; polling_interval?: number; continue_interval?: number; id?: number; }> {
    switch (this.deviceType) {
      case 'camera':
        return this.api.startCameraLiveview(this.networkId, this.deviceId);
      case 'owl':
        return this.api.startOwlLiveview(this.networkId, this.deviceId);
      case 'doorbell':
        return this.api.startDoorbellLiveview(this.networkId, this.deviceId);
    }
  }

  private async waitForLiveViewReady(
    commandId: number,
    pollingInterval: number,
    maxAttempts: number = 6,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.api.getCommandStatus(this.networkId, commandId);
      if (status.complete || status.status === 'complete' || status.status === 'running') {
        return;
      }
      if (status.status === 'failed') {
        throw new Error(`Live view command ${commandId} failed`);
      }
      // Use the provided pollingInterval unless the response explicitly specifies one
      const delayMs = pollingInterval * 1000;
      await sleep(delayMs);
    }
  }

  private startKeepAlive(sessionId: string, commandId: number, intervalSeconds?: number): void {
    if (!intervalSeconds || intervalSeconds <= 0) {
      return;
    }

    const active = this.ongoingSessions.get(sessionId);
    if (!active) {
      return;
    }

    const intervalMs = Math.max(5, intervalSeconds - 2) * 1000;
    active.keepAliveTimer = setInterval(async () => {
      try {
        const result = await this.api.updateCommand(this.networkId, commandId);
        // If result is null, command no longer exists - stop the keep-alive
        if (result === null) {
          if (active.keepAliveTimer) {
            clearInterval(active.keepAliveTimer);
            active.keepAliveTimer = null;
          }
        }
      } catch (error) {
        this.log(`Failed to extend live view command ${commandId}: ${error}`);
      }
    }, intervalMs);
  }

  private buildTalkbackSdp(
    audio: { codec: number | string; channel: number; sample_rate: number; pt: number },
    session: ActiveStreamSession,
  ): string | undefined {
    const codec = typeof audio.codec === 'string' ? audio.codec.toUpperCase() : audio.codec;
    const channels = audio.channel || 1;
    const sampleRateKhz = this.getAudioSampleRate(audio.sample_rate);
    const sampleRateHz = sampleRateKhz * 1000;
    const suiteName = this.getSrtpSuiteName(
      session.audioCryptoSuite ?? this.hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
    );

    if (!suiteName || !session.audioSRTP || !session.localAudioPort) {
      return undefined;
    }

    let rtpmap: string | undefined;
    let fmtp: string | undefined;

    switch (codec) {
      case 'AAC-ELD':
      case this.hap.AudioStreamingCodecType.AAC_ELD: {
        if (sampleRateKhz !== 16) {
          this.log(`Talkback AAC-ELD expected 16 kHz; got ${sampleRateKhz} kHz (using 16 kHz SDP).`);
        }
        rtpmap = `MPEG4-GENERIC/16000/${channels}`;
        fmtp =
          'profile-level-id=1;mode=AAC-hbr;sizelength=13;indexlength=3;indexdeltalength=3;config=F8F0212C00BC00';
        break;
      }
      case 'OPUS':
      case this.hap.AudioStreamingCodecType.OPUS: {
        rtpmap = `OPUS/48000/${channels}`;
        fmtp = `minptime=10;useinbandfec=1;sprop-maxcapturerate=${sampleRateHz}`;
        break;
      }
      case 'PCMA':
      case this.hap.AudioStreamingCodecType.PCMA:
        rtpmap = `PCMA/8000/${channels}`;
        break;
      case 'PCMU':
      case this.hap.AudioStreamingCodecType.PCMU:
        rtpmap = `PCMU/8000/${channels}`;
        break;
      default:
        this.log(`Talkback codec not supported for SDP: ${audio.codec}`);
        return undefined;
    }

    const ipVersion = session.addressVersion === 'ipv6' ? 'IP6' : 'IP4';
    const ipAddress = session.addressVersion === 'ipv6' ? '::' : '0.0.0.0';

    const lines = [
      'v=0',
      `o=- 0 0 IN ${ipVersion} ${ipAddress}`,
      's=HomeKit Talkback',
      `c=IN ${ipVersion} ${ipAddress}`,
      't=0 0',
      `m=audio ${session.localAudioPort} RTP/SAVP ${audio.pt}`,
      `a=rtpmap:${audio.pt} ${rtpmap}`,
      fmtp ? `a=fmtp:${audio.pt} ${fmtp}` : '',
      'a=rtcp-mux',
      `a=crypto:1 ${suiteName} inline:${toSrtpParams(session.audioSRTP)}`,
    ].filter(Boolean);

    return `${lines.join('\r\n')}\r\n`;
  }

  private startTalkback(
    sessionId: string,
    request: Extract<StreamingRequest, { type: 'start' }>,
    active: ActiveStreamSession,
  ): void {
    if (!active.audioPort || !active.audioSRTP || !active.localAudioPort || !active.liveviewUrl) {
      return;
    }

    const sdp = this.buildTalkbackSdp(request.audio, active);
    if (!sdp) {
      this.log(`Talkback SDP generation failed for session ${sessionId}`);
      return;
    }

    const audioArgs = this.buildAudioEncoderArgs(request.audio);
    const ffmpegArgs = [
      '-hide_banner',
      '-loglevel', this.streamingConfig.ffmpegDebug ? 'debug' : 'info',
      '-protocol_whitelist', 'pipe,udp,rtp,srtp,crypto,file',
      '-f', 'sdp',
      '-i', 'pipe:0',
      '-vn',
      ...audioArgs,
      '-rtsp_transport', this.streamingConfig.rtspTransport,
      '-f', 'rtsp',
      active.liveviewUrl,
    ];

    this.log(`Starting talkback audio for session ${sessionId}`);
    const talkback = spawn(this.streamingConfig.ffmpegPath, ffmpegArgs, {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    active.talkback = talkback;
    talkback.stdin?.end(sdp);

    talkback.stderr.on('data', (data) => {
      if (this.streamingConfig.ffmpegDebug) {
        this.log(`FFmpeg-talkback(${sessionId}): ${data.toString('utf8').trim()}`);
      }
    });

    talkback.on('error', (error) => {
      this.log(`Talkback FFmpeg error for session ${sessionId}: ${error.message}`);
    });

    talkback.on('exit', (code, signal) => {
      if (code !== 0) {
        this.log(`Talkback FFmpeg exited for session ${sessionId} (code=${code}, signal=${signal})`);
      }
    });
  }

  private startImmisTalkback(
    sessionId: string,
    request: Extract<StreamingRequest, { type: 'start' }>,
    active: ActiveStreamSession,
  ): void {
    if (!active.audioPort || !active.audioSRTP || !active.localAudioPort || !active.immisProxy) {
      return;
    }

    const sdp = this.buildTalkbackSdp(request.audio, active);
    if (!sdp) {
      this.log(`IMMIS talkback SDP generation failed for session ${sessionId}`);
      return;
    }

    const latmArgs = this.buildLatmEncoderArgs(request.audio);
    const ffmpegArgs = [
      '-hide_banner',
      '-loglevel', this.streamingConfig.ffmpegDebug ? 'debug' : 'info',
      '-protocol_whitelist', 'pipe,udp,rtp,srtp,crypto,file',
      '-f', 'sdp',
      '-i', 'pipe:0',
      '-vn',
      ...latmArgs,
      '-f', 'latm',
      '-muxdelay', '0',
      '-muxpreload', '0',
      'pipe:1',
    ];

    this.log(`Starting IMMIS talkback (LATM uplink) for session ${sessionId}`);
    const talkback = spawn(this.streamingConfig.ffmpegPath, ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    active.talkback = talkback;
    talkback.stdin?.end(sdp);

    // Attach FFmpeg stdout (LATM frames) to immis proxy
    try {
      active.immisProxy.attachAudioInput(talkback.stdout!);
      active.immisProxy.startAudio();
    } catch (error) {
      this.log(`Failed to attach IMMIS audio input: ${error}`);
    }

    talkback.stderr.on('data', (data) => {
      if (this.streamingConfig.ffmpegDebug) {
        this.log(`FFmpeg-immis-talkback(${sessionId}): ${data.toString('utf8').trim()}`);
      }
    });

    talkback.on('error', (error) => {
      this.log(`IMMIS talkback FFmpeg error for session ${sessionId}: ${error.message}`);
    });

    talkback.on('exit', (code, signal) => {
      if (code !== 0) {
        this.log(`IMMIS talkback FFmpeg exited for session ${sessionId} (code=${code}, signal=${signal})`);
      }
      try {
        active.immisProxy?.stopAudio();
      } catch (err) {
        this.log(`IMMIS stopAudio error for session ${sessionId}: ${err}`);
      }
    });
  }

  private buildLatmEncoderArgs(audio: { codec: number | string; channel: number; sample_rate: number; max_bit_rate: number; }): string[] {
    // Blink IMMIS expects AAC-LATM (LOAS/LATM)
    const channels = audio.channel || 1;
    const sampleRateKhz = this.getAudioSampleRate(audio.sample_rate);
    const bitrate = this.getAudioBitrate(audio.max_bit_rate);
    const sampleRateHz = sampleRateKhz * 1000;
    return [
      '-acodec', 'aac',
      '-ar', `${sampleRateHz}`,
      '-ac', `${channels}`,
      '-b:a', `${bitrate}k`,
    ];
  }

  private buildFfmpegArgs(
    liveviewUrl: string,
    request: Extract<StreamingRequest, { type: 'start' }>,
    session: ActiveStreamSession,
  ): string[] {
    const video = request.video;
    const suiteName = this.getSrtpSuiteName(session.videoCryptoSuite);
    const useSrtp = Boolean(suiteName);
    const videoParams = suiteName ? toSrtpParams(session.videoSRTP) : undefined;
    const bitrate = this.getVideoBitrate(video.max_bit_rate);

    const profileName = this.getH264ProfileName(video.profile);
    const levelName = this.getH264LevelName(video.level);

    // Use 'info' loglevel to ensure FFmpeg outputs stream info at startup.
    // This triggers the stderr 'data' event, signaling HomeKit that the stream is ready.
    // Without immediate stderr output, HomeKit times out waiting for video data.
    const args = [
      '-hide_banner',
      '-loglevel', this.streamingConfig.ffmpegDebug ? 'debug' : 'info',
    ];

    // Configure input based on URL type
    if (liveviewUrl.startsWith('tcp://')) {
      // MPEG-TS stream from our IMMIS proxy
      args.push(
        '-f', 'mpegts',
        '-i', liveviewUrl,
      );
    } else {
      // Standard RTSPS stream
      args.push(
        '-rtsp_transport', this.streamingConfig.rtspTransport,
        '-i', liveviewUrl,
      );
    }

    args.push(
      '-map', '0:v:0',
      '-vcodec', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-r', `${video.fps}`,
      '-s', `${video.width}x${video.height}`,
      '-b:v', `${bitrate}k`,
      '-bufsize', `${bitrate}k`,
      '-profile:v', profileName,
      '-level:v', levelName,
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-payload_type', `${video.pt}`,
      '-ssrc', `${ssrcToSigned(session.videoSSRC)}`,
      '-f', 'rtp',
    );

    if (suiteName && videoParams) {
      args.push('-srtp_out_suite', suiteName, '-srtp_out_params', videoParams);
    }

    args.push(buildRtpUrl(
      session.address,
      session.videoPort,
      session.localVideoPort,
      session.localVideoRtcpPort ?? session.localVideoPort,
      video.mtu,
      useSrtp,
    ));

    if (this.streamingConfig.audio.enabled && session.audioPort && session.audioSSRC && request.audio) {
      const audio = request.audio;
      const audioSuiteName = this.getSrtpSuiteName(session.audioCryptoSuite ?? this.hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80);
      const audioUseSrtp = Boolean(audioSuiteName);
      const audioParams = audioSuiteName && session.audioSRTP ? toSrtpParams(session.audioSRTP) : undefined;
      const audioArgs = this.buildAudioEncoderArgs(audio);

      args.push(
        '-map', '0:a:0?',
        ...audioArgs,
        '-payload_type', `${audio.pt}`,
        '-ssrc', `${ssrcToSigned(session.audioSSRC)}`,
        '-f', 'rtp',
      );

      if (audioSuiteName && audioParams) {
        args.push('-srtp_out_suite', audioSuiteName, '-srtp_out_params', audioParams);
      }

      args.push(buildRtpUrl(
        session.address,
        session.audioPort,
        session.localAudioPort,
        session.localAudioRtcpPort ?? session.localAudioPort,
        video.mtu,
        audioUseSrtp,
      ));
    }

    return args;
  }

  private buildAudioEncoderArgs(audio: { codec: number | string; channel: number; sample_rate: number; max_bit_rate: number; }): string[] {
    const codec = typeof audio.codec === 'string'
      ? audio.codec.toUpperCase()
      : audio.codec;
    const channels = audio.channel || 1;
    const sampleRate = this.getAudioSampleRate(audio.sample_rate);
    const bitrate = this.getAudioBitrate(audio.max_bit_rate);

    switch (codec) {
      case 'AAC-ELD':
      case this.hap.AudioStreamingCodecType.AAC_ELD:
        return [
          '-acodec', 'aac',
          '-profile:a', 'aac_eld',
          '-ar', `${sampleRate}k`,
          '-ac', `${channels}`,
          '-b:a', `${bitrate}k`,
        ];
      case 'PCMA':
      case this.hap.AudioStreamingCodecType.PCMA:
        return [
          '-acodec', 'pcm_alaw',
          '-ar', '8k',
          '-ac', `${channels}`,
          '-b:a', `${bitrate}k`,
        ];
      case 'PCMU':
      case this.hap.AudioStreamingCodecType.PCMU:
        return [
          '-acodec', 'pcm_mulaw',
          '-ar', '8k',
          '-ac', `${channels}`,
          '-b:a', `${bitrate}k`,
        ];
      case 'OPUS':
      case this.hap.AudioStreamingCodecType.OPUS:
      default:
        return [
          '-acodec', 'libopus',
          '-ar', `${sampleRate * 1000}`,
          '-ac', `${channels}`,
          '-b:a', `${bitrate}k`,
        ];
    }
  }

  private getAudioSampleRate(sampleRate: number): number {
    switch (sampleRate) {
      case this.hap.AudioStreamingSamplerate.KHZ_8:
        return 8;
      case this.hap.AudioStreamingSamplerate.KHZ_16:
        return 16;
      case this.hap.AudioStreamingSamplerate.KHZ_24:
        return 24;
      default:
        return 16;
    }
  }

  private getAudioBitrate(requested: number): number {
    if (requested > 0) {
      return requested;
    }
    return this.streamingConfig.audio.bitrate;
  }

  private getVideoBitrate(requested: number): number {
    if (this.streamingConfig.video.maxBitrate) {
      return Math.min(this.streamingConfig.video.maxBitrate, requested || this.streamingConfig.video.maxBitrate);
    }
    return requested || 3000;
  }

  private getH264ProfileName(profile: number): string {
    if (profile === this.hap.H264Profile.MAIN) {
      return 'main';
    }
    if (profile === this.hap.H264Profile.HIGH) {
      return 'high';
    }
    return 'baseline';
  }

  private getH264LevelName(level: number): string {
    if (level === this.hap.H264Level.LEVEL3_2) {
      return '3.2';
    }
    if (level === this.hap.H264Level.LEVEL4_0) {
      return '4.0';
    }
    return '3.1';
  }

  private getSrtpSuiteName(suite: number): string | undefined {
    switch (suite) {
      case this.hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80:
        return 'AES_CM_128_HMAC_SHA1_80';
      case this.hap.SRTPCryptoSuites.AES_CM_256_HMAC_SHA1_80:
        return 'AES_CM_256_HMAC_SHA1_80';
      default:
        return undefined;
    }
  }
}

/**
 * Create CameraController options for snapshot/streaming support.
 *
 * @param hap - HAP API for CameraController
 * @param delegate - Camera streaming delegate (BlinkCameraSource)
 * @param streamingConfig - Streaming configuration overrides
 * @returns Controller options for configureController()
 */
export function createCameraControllerOptions(
  hap: HAP,
  delegate: CameraStreamingDelegate,
  streamingConfig?: BlinkCameraStreamingConfigInput,
): CameraControllerOptions {
  const resolved = resolveStreamingConfig(streamingConfig);
  const streamingEnabled = resolved.enabled;
  const audioEnabled = streamingEnabled && resolved.audio.enabled;

  const audioCodecs = audioEnabled ? [
    resolved.audio.codec === 'aac-eld'
      ? { type: hap.AudioStreamingCodecType.AAC_ELD, samplerate: [hap.AudioStreamingSamplerate.KHZ_16, hap.AudioStreamingSamplerate.KHZ_24] }
      : resolved.audio.codec === 'pcma'
        ? { type: hap.AudioStreamingCodecType.PCMA, samplerate: hap.AudioStreamingSamplerate.KHZ_8 }
        : resolved.audio.codec === 'pcmu'
          ? { type: hap.AudioStreamingCodecType.PCMU, samplerate: hap.AudioStreamingSamplerate.KHZ_8 }
          : { type: hap.AudioStreamingCodecType.OPUS, samplerate: [hap.AudioStreamingSamplerate.KHZ_16, hap.AudioStreamingSamplerate.KHZ_24] },
  ] : [];

  return {
    cameraStreamCount: streamingEnabled ? resolved.maxStreams : 0,
    delegate,
    streamingOptions: {
      supportedCryptoSuites: [hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
      video: {
        resolutions: [
          [320, 180, 15],
          [320, 240, 15],
          [480, 270, 15],
          [480, 360, 15],
          [640, 360, 15],
          [640, 480, 15],
          [1280, 720, 15],
          [1920, 1080, 15],
        ],
        codec: {
          profiles: [hap.H264Profile.BASELINE, hap.H264Profile.MAIN, hap.H264Profile.HIGH],
          levels: [hap.H264Level.LEVEL3_1, hap.H264Level.LEVEL3_2, hap.H264Level.LEVEL4_0],
        },
      },
      audio: audioEnabled ? {
        twoWayAudio: resolved.audio.twoWay,
        codecs: audioCodecs,
      } : undefined,
    },
  };
}

/**
 * Backwards-compatible snapshot-only options.
 */
export function createSnapshotControllerOptions(
  hap: HAP,
  delegate: CameraStreamingDelegate,
): CameraControllerOptions {
  return createCameraControllerOptions(hap, delegate, { enabled: false });
}
