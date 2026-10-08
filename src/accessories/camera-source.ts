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
import { withResponseBudget, RequestOptions, checkRequestBudget, budgetedDelay } from '../operation-budget';
import { toHapError } from '../hap-errors';
import { BlinkApi } from '../blink-api/client';
import { readBoundedBody } from '../blink-api/response-body';
import { BlinkHttpError } from '../blink-api/http';
import {
  recordSecurityBoundaryEvent,
  describeNetworkFailure,
  formatNetworkFailureDiagnostic,
  NetworkFailureDiagnostic,
} from '../blink-api/network-diagnostics';
import { redactDiagnosticText } from '../blink-api/redaction';
import { ImmisProxyServer } from '../blink-api/immis-proxy';
import { Buffer } from 'node:buffer';
import { ChildProcess, ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as dgram from 'node:dgram';

import { URL } from 'node:url';

export type DeviceType = 'camera' | 'owl' | 'doorbell';
export type AudioCodecPreference = 'opus' | 'aac-eld' | 'pcma' | 'pcmu';
export type VideoEncoderPreference =
  | 'auto'
  | 'libx264'
  | 'h264_v4l2m2m'
  | 'h264_videotoolbox'
  | 'h264_qsv'
  | 'h264_nvenc'
  | 'h264_vaapi';

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
    encoder: VideoEncoderPreference;
  };
  verifyImmisTls: boolean;
  /** Path to save debug stream recordings (MPEG-TS files) */
  debugStreamPath?: string;
  /** Snapshot cache TTL in seconds (0 = always request fresh, default 60) */
  snapshotCacheTTL?: number;
  /** Keep last successful snapshot indefinitely until manually refreshed */
  persistSnapshotCache?: boolean;
}

export type BlinkCameraStreamingConfigInput = Omit<
  Partial<BlinkCameraStreamingConfig>,
  'audio' | 'video'
> & {
  audio?: Partial<BlinkCameraStreamingConfig['audio']>;
  video?: Partial<BlinkCameraStreamingConfig['video']>;
};

const SOFTWARE_VIDEO_ENCODER: VideoEncoderPreference = 'libx264';
const MAX_FFMPEG_STDERR_BUFFER_CHARS = 64 * 1024;

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
  video: {
    encoder: 'auto',
  },
  verifyImmisTls: true,
  snapshotCacheTTL: 60,
  persistSnapshotCache: false,
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
    verifyImmisTls: true,
    snapshotCacheTTL: config?.snapshotCacheTTL ?? DEFAULT_STREAMING_CONFIG.snapshotCacheTTL,
    persistSnapshotCache: config?.persistSnapshotCache ?? DEFAULT_STREAMING_CONFIG.persistSnapshotCache,
    audio: {
      enabled: audio.enabled ?? DEFAULT_STREAMING_CONFIG.audio.enabled,
      twoWay,
      codec: audio.codec ?? DEFAULT_STREAMING_CONFIG.audio.codec,
      bitrate: audio.bitrate ?? DEFAULT_STREAMING_CONFIG.audio.bitrate,
    },
    video: {
      maxBitrate: video.maxBitrate ?? DEFAULT_STREAMING_CONFIG.video.maxBitrate,
      encoder: video.encoder ?? DEFAULT_STREAMING_CONFIG.video.encoder,
    },
  };
};

type SessionPhase = 'PREPARING' | 'PREPARED' | 'STARTING' | 'RUNNING' | 'RETIRING' | 'CLOSED';
interface SessionOwner {
  phase: SessionPhase;
  preparing: boolean;
  ports: Set<number>;
  abort: globalThis.AbortController;
  expiry?: ReturnType<typeof setTimeout>;
  retirement?: Promise<void>;
  children: Set<ChildProcess>;
  cancelStart?: () => void;
  localStarting?: boolean;
  transportClosed?: boolean;
  release?: () => void;
}

interface PendingStreamSession {
  owner?: SessionOwner;
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
  keepAliveTimer?: ReturnType<typeof setTimeout> | null;
  stopped?: boolean;
  immisProxy?: ImmisProxyServer;
  selectedVideoEncoder?: VideoEncoderPreference;
  fallbackVideoEncoderTried?: boolean;
  readyNotified?: boolean;
  ffmpegStderrBuffer?: string;
  ffmpegStderrBufferTruncated?: boolean;
}

interface FfmpegStderrState {
  ffmpegStderrBuffer?: string;
  ffmpegStderrBufferTruncated?: boolean;
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
    } else {
      redacted[i] = redactStreamUrl(redacted[i]);
    }
  }
  return redacted;
};

const redactFfmpegOutput = (value: string): string => {
  return value
    .replace(/\b(?:immis|rtsps?):\/\/[^\s'"]+/gi, (url) => redactStreamUrl(url))
    .replace(/(-srtp_(?:out|in)_params\s+)(\S+)/gi, '$1<redacted>')
    .replace(/(\bsrtp_(?:out|in)_params[=:])(\S+)/gi, '$1<redacted>')
    .replace(/(\binline:)([^\s|]+)/gi, '$1<redacted>');
};

const redactStreamUrl = (value: string): string => {
  try {
    const parsed = new URL(value);
    if (!['immis:', 'rtsp:', 'rtsps:'].includes(parsed.protocol)) {
      return value;
    }
    return `${parsed.protocol}//${parsed.host}/<redacted>`;
  } catch {
    return value;
  }
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


// HomeKit may ask for the same camera snapshot several times within a few
// seconds. Keep transport failures from turning that retry burst into an
// equivalent burst of thumbnail commands.
const SNAPSHOT_FAILURE_COOLDOWN_MS = 15_000;

class SnapshotNetworkError extends Error {
  constructor(readonly diagnostic: NetworkFailureDiagnostic) {
    super('Blink thumbnail request failed or timed out.');
  }
}

export class BlinkCameraSource implements CameraStreamingDelegate {
  private readonly streamingConfig: BlinkCameraStreamingConfig;
  private readonly sessionOwners = new Map<string, SessionOwner>();
  private readonly pendingSessions = new Map<string, PendingStreamSession>();
  private readonly ongoingSessions = new Map<string, ActiveStreamSession>();
  private cachedSnapshot: Buffer | null = null;
  private cachedSnapshotTime = 0;
  private lastSuccessfulCaptureTime = 0;
  private freshSnapshotPromise: Promise<Buffer> | null = null;
  private snapshotFailureCooldownUntil = 0;
  private snapshotFailure: Error | null = null;
  private streamFailureCooldownUntil = 0;

  constructor(
    private readonly api: BlinkApi,
    private readonly hap: HAP,
    private readonly networkId: number,
    private readonly deviceId: number,
    private readonly deviceType: DeviceType,
    private readonly serial: string,
    private readonly getThumbnailUrl: () => string | undefined,
    private readonly isDeviceAvailable: () => boolean = () => true,
    private readonly log: (message: string) => void,
    streamingConfig?: BlinkCameraStreamingConfigInput,
    private readonly errorLog: (message: string) => void = log,
  ) {
    this.streamingConfig = resolveStreamingConfig(streamingConfig);
  }

  private logError(message: string): void {
    this.errorLog(redactDiagnosticText(redactFfmpegOutput(message)));
  }

  /**
   * Handle snapshot request from HomeKit.
   * Returns cached snapshots when valid/persistent; otherwise requests a fresh
   * thumbnail from Blink and returns it as a JPEG buffer.
   *
   * @param request - Snapshot request with width/height
   * @param callback - Callback to return image buffer or error
   */
  async handleSnapshotRequest(
    request: SnapshotRequest,
    callback: SnapshotRequestCallback,
  ): Promise<void> {
    this.log(`Snapshot requested (${request.width}x${request.height})`);

    if (!this.isDeviceAvailable()) {
      this.cachedSnapshot = null;
      this.cachedSnapshotTime = 0;
      callback(new Error('Camera is unavailable/offline'));
      return;
    }

    const persistSnapshotCache = this.streamingConfig.persistSnapshotCache ?? false;
    if (this.cachedSnapshot && persistSnapshotCache) {
      this.log(`Snapshot returned from persistent cache (${this.cachedSnapshot.length} bytes, download age ${Math.round((Date.now() - this.cachedSnapshotTime) / 1000)}s, capture age ${this.lastSuccessfulCaptureTime ? Math.round((Date.now() - this.lastSuccessfulCaptureTime) / 1000) + 's' : 'unknown'})`);
      callback(undefined, this.cachedSnapshot);
      return;
    }

    const cacheTTL = (this.streamingConfig.snapshotCacheTTL ?? 60) * 1000;
    const cacheAge = Date.now() - this.cachedSnapshotTime;

    // Return cached snapshot if still valid by TTL
    if (this.cachedSnapshot && cacheTTL > 0 && cacheAge < cacheTTL) {
      this.log(`Snapshot returned from cache (${this.cachedSnapshot.length} bytes, age ${Math.round(cacheAge / 1000)}s)`);
      callback(undefined, this.cachedSnapshot);
      return;
    }

    try {
      const buffer = await withResponseBudget(this.fetchFreshSnapshot());

      this.log(`Snapshot returned (${buffer.length} bytes)`);
      callback(undefined, buffer);
    } catch (error) {
      callback(toHapError(this.hap, error));
    }
  }

  /**
   * Force a fresh snapshot fetch and update in-memory cache.
   * Used by manual refresh controls when persistent caching is enabled.
   */
  async refreshSnapshotCache(): Promise<void> {
    if (!this.isDeviceAvailable()) {
      throw new Error('Camera is unavailable/offline');
    }

    const buffer = await this.fetchFreshSnapshot();
    this.log(`Snapshot cache refreshed manually (${buffer.length} bytes)`);
  }

  private fetchFreshSnapshot(): Promise<Buffer> {
    if (this.freshSnapshotPromise) return this.freshSnapshotPromise;

    if (this.snapshotFailure && Date.now() < this.snapshotFailureCooldownUntil) {
      return Promise.reject(this.snapshotFailure);
    }

    this.snapshotFailure = null;
    this.snapshotFailureCooldownUntil = 0;

    const request = (async () => {
      try {
        const buffer = await withResponseBudget(this.fetchSnapshotBuffer(Date.now() + 60_000), 60_000);
        this.cacheSnapshot(buffer);
        this.snapshotFailure = null;
        this.snapshotFailureCooldownUntil = 0;
        return buffer;
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        if (failure instanceof SnapshotNetworkError) {
          // The formatter emits only fixed labels and allowlisted bounded values.
          this.errorLog(`Snapshot network failure: ${formatNetworkFailureDiagnostic(failure.diagnostic)}`);
        } else {
          this.logError(`Snapshot error: ${failure}`);
        }
        // Availability already prevents outbound work. Let a camera that comes
        // back online recover immediately instead of inheriting a network cooldown.
        if (this.isDeviceAvailable()) {
          this.snapshotFailure = failure;
          this.snapshotFailureCooldownUntil = Date.now() + SNAPSHOT_FAILURE_COOLDOWN_MS;
        }
        throw failure;
      } finally {
        this.freshSnapshotPromise = null;
      }
    })();

    this.freshSnapshotPromise = request;
    return request;
  }

  private cacheSnapshot(buffer: Buffer): void {
    // Status polling can report the camera offline while its image is downloading.
    // Never publish or retain that late response as an available snapshot.
    if (!this.isDeviceAvailable()) {
      this.cachedSnapshot = null;
      this.cachedSnapshotTime = 0;
      throw new Error('Camera is unavailable/offline');
    }
    this.cachedSnapshot = buffer;
    this.cachedSnapshotTime = Date.now();
  }

  private async fetchSnapshotBuffer(deadline: number): Promise<Buffer> {
    const capture = await this.requestThumbnail({ deadline });
    checkRequestBudget({ deadline });
    const url = capture.thumbnail;
    if (capture.completed) {
      this.lastSuccessfulCaptureTime = Date.now();
      this.log('Thumbnail capture completed');
    } else {
      this.log('Thumbnail capture busy; downloading existing thumbnail');
    }
    if (!url) {
      throw new Error('No thumbnail URL available');
    }

    // Blink thumbnail resources use the regional REST origin. Never attach
    // account credentials to an arbitrary resource URL or follow its redirects.
    let resourceUrl: URL;
    try {
      try {
        resourceUrl = new URL(url);
      } catch {
        resourceUrl = new URL(url, this.api.getSharedRestRootUrl());
      }
    } catch {
      throw new Error('Blink returned an invalid thumbnail URL.');
    }
    if (resourceUrl.protocol !== 'https:'
      || !/^rest-[a-z0-9]{4}\.immedia-semi\.com$/.test(resourceUrl.hostname)
      || resourceUrl.username || resourceUrl.password || resourceUrl.port) {
      recordSecurityBoundaryEvent('destination_rejection');
      throw new Error('Blink returned an untrusted thumbnail destination.');
    }

    let response: Awaited<ReturnType<typeof fetch>>;
    const startedAtMs = Date.now();
    try {
      response = await fetch(resourceUrl.toString(), {
        headers: this.api.getAuthHeaders(),
        redirect: 'error',
        signal: globalThis.AbortSignal.timeout(Math.max(1, Math.min(30_000, deadline - Date.now()))),
      });
    } catch (error) {
      throw new SnapshotNetworkError(describeNetworkFailure(error, resourceUrl, startedAtMs));
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Failed to fetch thumbnail: ${response.status}`);
    }
    try {
      const buffer = await readBoundedBody(response, { kind: 'thumbnail', deadline });
      checkRequestBudget({ deadline });
      return buffer;
    } catch {
      checkRequestBudget({ deadline });
      throw new Error('Blink thumbnail response could not be read.');
    }
  }

  /**
   * Request a fresh thumbnail from Blink API.
   * Uses the appropriate endpoint based on device type.
   */
  private async requestThumbnail(options: RequestOptions): Promise<{ completed: boolean; thumbnail?: string }> {
    try {
      const response = this.deviceType === 'camera'
        ? await this.api.requestCameraThumbnail(this.networkId, this.deviceId, options)
        : this.deviceType === 'owl'
          ? await this.api.requestOwlThumbnail(this.networkId, this.deviceId, options)
          : await this.api.requestDoorbellThumbnail(this.networkId, this.deviceId, options);
      return { completed: response.captureOutcome === 'completed', thumbnail: response.thumbnail };
    } catch (error) {
      if (error instanceof BlinkHttpError && error.failure === 'http' && error.status === 409) {
        return { completed: false, thumbnail: this.getThumbnailUrl() };
      }
      throw error;
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
    const sessionId = request.sessionID;
    if (this.sessionOwners.has(sessionId) || this.sessionOwners.size >= this.streamingConfig.maxStreams * 2) {
      callback(new Error('Streaming preparation capacity reached or session already owned'));
      return;
    }
    const owner: SessionOwner = { phase: 'PREPARING', preparing: true, ports: new Set(), abort: new globalThis.AbortController(), children: new Set() };
    this.sessionOwners.set(sessionId, owner);
    const allocateOwned = async (): Promise<number> => {
      const port = await allocatePort();
      owner.ports.add(port); // Adopt late allocations before checking cancellation.
      if (owner.abort.signal.aborted) {
        releasePort(port);
        owner.ports.delete(port);
        throw new Error('Streaming preparation cancelled');
      }
      return port;
    };
    owner.expiry = setTimeout(() => { void this.stopStream(sessionId); }, 30_000);
    owner.expiry.unref?.();
    try {
      const videoSSRC = randomBytes(4).readUInt32BE(0);
      const localVideoPort = await allocateOwned();

      const session: PendingStreamSession = {
        owner,
        address: request.targetAddress,
        addressVersion: request.addressVersion,
        sessionId,
        videoPort: request.video.port,
        localVideoPort,
        localVideoRtcpPort: await allocateOwned(),
        videoCryptoSuite: request.video.srtpCryptoSuite,
        videoSRTP: Buffer.concat([request.video.srtp_key, request.video.srtp_salt]),
        videoSSRC,
      };

      if (this.streamingConfig.audio.enabled) {
        const audioSSRC = randomBytes(4).readUInt32BE(0);
        const localAudioPort = await allocateOwned();
        const localAudioRtcpPort = await allocateOwned();
        session.audioPort = request.audio.port;
        session.localAudioPort = localAudioPort;
        session.localAudioRtcpPort = localAudioRtcpPort;
        session.audioCryptoSuite = request.audio.srtpCryptoSuite;
        session.audioSRTP = Buffer.concat([request.audio.srtp_key, request.audio.srtp_salt]);
        session.audioSSRC = audioSSRC;
      }

      owner.preparing = false;
      owner.phase = 'PREPARED';
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
      owner.preparing = false;
      owner.retirement = undefined;
      await this.stopStream(sessionId);
      this.logError(`Stream preparation failed: ${error}`);
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

    if (Date.now() < this.streamFailureCooldownUntil) {
      await this.stopStream(sessionId, pending.owner);
      callback(new Error('Streaming startup is temporarily unavailable'));
      return;
    }

    const activeStreamCount = Array.from(this.ongoingSessions.values())
      .filter((session) => session.owner?.phase !== 'CLOSED')
      .length;
    if (activeStreamCount >= this.streamingConfig.maxStreams) {
      this.log(
        `Stream start rejected for session ${sessionId}: maxStreams=${this.streamingConfig.maxStreams} already reached`,
      );
      await this.stopStream(sessionId, pending.owner);
      callback(new Error(`Maximum live stream count (${this.streamingConfig.maxStreams}) reached`));
      return;
    }

    const owner = pending.owner!;
    globalThis.clearTimeout(owner.expiry);
    owner.phase = 'STARTING';
    const originalCallback = callback;
    let callbackDone = false;
    callback = (error) => { if (!callbackDone) { callbackDone = true; originalCallback(error); } };
    owner.cancelStart = () => callback(new Error('Streaming startup cancelled'));
    const active: ActiveStreamSession = {
      ...pending,
      keepAliveTimer: null,
    };
    this.pendingSessions.delete(sessionId);
    this.ongoingSessions.set(sessionId, active);

    try {
      const liveview = await this.requestLiveView();
      active.commandId = liveview.command_id ?? liveview.id;
      if (!this.ownsSession(sessionId, active)) {
        if (active.commandId) void this.completeLiveview(active.commandId);
        throw new Error('Streaming startup cancelled');
      }
      const originalUrl = liveview.server;
      if (!originalUrl) {
        throw new Error('Live view did not return a server URL');
      }

      const commandId = liveview.command_id ?? liveview.id;
      active.commandId = commandId;
      active.liveviewUrl = originalUrl;

      let ffmpegInputUrl: string;
      const readiness = commandId ? this.waitForLiveViewReady(commandId, originalUrl.startsWith('immis://') ? 2 : liveview.polling_interval ?? 5, originalUrl.startsWith('immis://') ? 30 : 6, owner) : Promise.resolve();
      readiness.catch(() => undefined);

      // Handle immis:// protocol using our proxy server
      if (originalUrl.startsWith('immis://')) {
        this.log(`Starting IMMIS proxy for proprietary stream protocol`);

        // Create a promise that resolves when the Blink command is ready.
        // This prevents the proxy from connecting to the immis server before
        // the camera has finished initializing, which would cause immediate disconnect.
        // For IMMIS streams, use aggressive polling (2s intervals, 30 attempts = 60s max)
        // because HomeKit has a ~10s timeout expectation for initial stream data.
        const readyPromise = readiness;

        const immisProxy = new ImmisProxyServer({
          immisUrl: originalUrl,
          serial: this.serial,
          log: (msg) => this.log(msg),
          errorLog: (msg) => this.logError(msg),
          debug: this.streamingConfig.ffmpegDebug,
          saveStreamPath: this.streamingConfig.debugStreamPath,
          verifyTls: this.streamingConfig.verifyImmisTls,
          waitForReady: readyPromise,
        });

        immisProxy.on('error', (error) => {
          if (active.immisProxy !== immisProxy || active.stopped) {
            return;
          }

          this.logError(`IMMIS proxy error for session ${sessionId}: ${error.message}`);
          this.markStreamFailure(sessionId, active);
          if (!active.readyNotified) {
            active.readyNotified = true;
            callback(error);
          }
          void this.stopStream(sessionId, owner);
        });

        active.immisProxy = immisProxy;
        owner.localStarting = true;
        try { ffmpegInputUrl = await immisProxy.start(); }
        finally {
          owner.localStarting = false;
          if (owner.abort.signal.aborted) {
            immisProxy.stop();
            void immisProxy.whenClosed.then(() => { owner.transportClosed = true; owner.release?.(); });
          }
        }
        if (!this.ownsSession(sessionId, active)) { immisProxy.stop(); throw new Error('Streaming startup cancelled'); }
        this.log(`IMMIS private transport ready`);
      } else {
        // Standard RTSPS URL - use directly
        ffmpegInputUrl = originalUrl;
      }

      if (!this.ownsSession(sessionId, active)) throw new Error('Streaming startup cancelled');
      this.startFfmpegStream(sessionId, ffmpegInputUrl, request, active, callback);

      // Start keep-alive and liveview polling in the BACKGROUND (non-blocking)
      // This must happen AFTER FFmpeg is spawned to avoid HomeKit timeout
      const isImmisStream = originalUrl.startsWith('immis://');
      if (commandId) {
        // For IMMIS streams, waitForLiveViewReady is already handled via the proxy's waitForReady promise
        // For non-IMMIS streams, poll for readiness in background
        // Start keep-alive immediately
        // Readiness owns status polling until complete; keepalive starts afterward.
        void readiness
          .then(() => { if (this.ownsSession(sessionId, active)) this.startKeepAlive(sessionId, commandId, liveview.continue_interval ?? liveview.polling_interval); })
          .catch(() => undefined);
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
      // Home may immediately resubmit START after a refusal. Keep remote POSTs bounded
      // while the previous vendor command retires; STOP cancellation is not a failure.
      this.markStreamFailure(sessionId, active);
      this.logError(`Failed to start stream ${sessionId}: ${error}`);
      await this.stopStream(sessionId, owner);
      callback(error as Error);
    }
  }

  private ownsSession(sessionId: string, active: ActiveStreamSession): boolean {
    return this.ongoingSessions.get(sessionId) === active && !active.stopped
      && !active.owner?.abort.signal.aborted;
  }

  private markStreamFailure(sessionId: string, active: ActiveStreamSession): void {
    if (this.ownsSession(sessionId, active)) this.streamFailureCooldownUntil = Date.now() + 30_000;
  }

  private async completeLiveview(commandId: number): Promise<void> {
    try {
      await withResponseBudget(this.api.completeCommand(this.networkId, commandId, { deadline: Date.now() + 5000 }), 5000);
    } catch { this.logError('Live view remote cleanup failed or timed out'); }
  }

  private async closeChild(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null && child.exitCode !== undefined) return;
    await new Promise<void>((resolve) => {
      let finished = false;
      const finish = (): void => { if (!finished) { finished = true; globalThis.clearTimeout(force); globalThis.clearTimeout(limit); resolve(); } };
      child.once('close', finish);
      const force = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* Observe close. */ } }, 1000);
      const limit = setTimeout(() => {
        // An unconfirmed child keeps its port reservation until actual close.
        recordSecurityBoundaryEvent('cleanup_timeout');
        this.logError('Media child cleanup timeout; reservation retained');
        finish();
      }, 3000);
      try { child.stdin?.end(); child.kill('SIGTERM'); } catch { /* Still observe closure. */ }
    });
  }

  private async stopStream(sessionId: string, expectedOwner?: SessionOwner): Promise<void> {
    const owner = this.sessionOwners.get(sessionId);
    const active = this.ongoingSessions.get(sessionId);
    const pending = this.pendingSessions.get(sessionId);
    if (!owner || (expectedOwner && owner !== expectedOwner)) return;
    if (owner.retirement) return owner.retirement;
    owner.phase = 'RETIRING';
    recordSecurityBoundaryEvent('cancellation');
    owner.abort.abort(new Error('Streaming session retired'));
    owner.cancelStart?.();
    globalThis.clearTimeout(owner.expiry);
    if (active) {
      active.stopped = true;
      if (active.keepAliveTimer) globalThis.clearTimeout(active.keepAliveTimer);
      active.keepAliveTimer = null;
      try { active.immisProxy?.stopAudio(); active.immisProxy?.stop(); } catch { this.logError('Media transport cleanup failed'); }
    }
    if (pending) this.pendingSessions.delete(sessionId);
    const transportClosure = active?.immisProxy?.whenClosed;
    owner.transportClosed = !transportClosure;
    owner.retirement = (async () => {
      await Promise.all([...owner.children].map(child => this.closeChild(child)));
      const release = (): void => {
        if (owner.children.size || owner.preparing || owner.localStarting || owner.transportClosed === false) return;
        for (const port of owner.ports) releasePort(port);
        owner.ports.clear(); owner.phase = 'CLOSED';
        if (this.sessionOwners.get(sessionId) === owner) this.sessionOwners.delete(sessionId);
        if (this.ongoingSessions.get(sessionId) === active) this.ongoingSessions.delete(sessionId);
      };
      owner.release = release;
      if (transportClosure) {
        void transportClosure.then(() => { owner.transportClosed = true; release(); });
        await withResponseBudget(transportClosure, 3000).catch(() => { recordSecurityBoundaryEvent('cleanup_timeout'); this.logError('Media transport cleanup timeout; reservation retained'); });
      }
      for (const child of owner.children) child.once('close', () => { owner.children.delete(child); release(); });
      release();
      if (active?.commandId) void this.completeLiveview(active.commandId);
    })();
    return owner.retirement;
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
    owner?: SessionOwner,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      owner?.abort.signal.throwIfAborted();
      const status = await this.api.getCommandStatus(this.networkId, commandId, { signal: owner?.abort.signal });
      owner?.abort.signal.throwIfAborted();
      if (status.complete || status.status === 'complete' || status.status === 'running') {
        return;
      }
      if (status.status === 'failed') {
        throw new Error(`Live view command ${commandId} failed`);
      }
      // Use the provided pollingInterval unless the response explicitly specifies one
      const delayMs = pollingInterval * 1000;
      await budgetedDelay(delayMs, { signal: owner?.abort.signal });
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

    const intervalMs = Math.max(5, Math.min(60, intervalSeconds - 2)) * 1000;
    const poll = async (): Promise<void> => {
      if (!this.ownsSession(sessionId, active)) return;
      try {
        const status = await this.api.getCommandStatus(this.networkId, commandId, { signal: active.owner?.abort.signal, deadline: Date.now() + 30_000 });
        if (!this.ownsSession(sessionId, active) || status.complete || status.status === 'complete' || status.status === 'failed') return;
      } catch { if (!this.ownsSession(sessionId, active)) return; this.logError('Live view polling failed'); }
      active.keepAliveTimer = setTimeout(() => { void poll(); }, intervalMs);
    };
    active.keepAliveTimer = setTimeout(() => { void poll(); }, intervalMs);
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
      this.logError(`Talkback SDP generation failed for session ${sessionId}`);
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
    const stderrState: FfmpegStderrState = {};
    talkback.stdin?.on('error', () => { if (active.talkback === talkback && this.ownsSession(sessionId, active)) void this.stopStream(sessionId, active.owner); });
    active.talkback = talkback;
    active.owner?.children.add(talkback);
    talkback.once('close', () => active.owner?.children.delete(talkback));
    talkback.stdin?.end(sdp);

    talkback.stderr.on('data', (data) => {
      this.handleFfmpegStderr(sessionId, stderrState, data, 'FFmpeg-talkback');
    });

    talkback.on('error', (error) => {
      this.flushFfmpegStderr(sessionId, stderrState, 'FFmpeg-talkback');
      this.logError(`Talkback FFmpeg error for session ${sessionId}: ${error.message}`);
    });

    talkback.on('exit', (code, signal) => {
      this.flushFfmpegStderr(sessionId, stderrState, 'FFmpeg-talkback');
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
      this.logError(`IMMIS talkback SDP generation failed for session ${sessionId}`);
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
    const stderrState: FfmpegStderrState = {};
    talkback.stdin?.on('error', () => { if (active.talkback === talkback && this.ownsSession(sessionId, active)) void this.stopStream(sessionId, active.owner); });
    active.talkback = talkback;
    active.owner?.children.add(talkback);
    talkback.once('close', () => active.owner?.children.delete(talkback));
    talkback.stdin?.end(sdp);

    // Attach FFmpeg stdout (LATM frames) to immis proxy
    try {
      active.immisProxy.attachAudioInput(talkback.stdout!);
      active.immisProxy.startAudio();
    } catch (error) {
      this.logError(`Failed to attach IMMIS audio input: ${error}`);
    }

    talkback.stderr.on('data', (data) => {
      this.handleFfmpegStderr(sessionId, stderrState, data, 'FFmpeg-immis-talkback');
    });

    talkback.on('error', (error) => {
      this.flushFfmpegStderr(sessionId, stderrState, 'FFmpeg-immis-talkback');
      this.logError(`IMMIS talkback FFmpeg error for session ${sessionId}: ${error.message}`);
    });

    talkback.on('exit', (code, signal) => {
      this.flushFfmpegStderr(sessionId, stderrState, 'FFmpeg-immis-talkback');
      if (code !== 0) {
        this.log(`IMMIS talkback FFmpeg exited for session ${sessionId} (code=${code}, signal=${signal})`);
      }
      try {
        active.immisProxy?.stopAudio();
      } catch (err) {
        this.logError(`IMMIS stopAudio error for session ${sessionId}: ${err}`);
      }
    });
  }

  private buildLatmEncoderArgs(audio: { codec: number | string; channel: number; sample_rate: number; max_bit_rate: number; }): string[] {
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

  private startFfmpegStream(
    sessionId: string,
    liveviewUrl: string,
    request: Extract<StreamingRequest, { type: 'start' }>,
    active: ActiveStreamSession,
    callback: StreamRequestCallback,
    useSoftwareFallback = false,
  ): void {
    if (active.owner && !this.ownsSession(sessionId, active)) return;
    const videoEncoder = useSoftwareFallback ? SOFTWARE_VIDEO_ENCODER : this.resolveVideoEncoder();
    const ffmpegArgs = this.buildFfmpegArgs(liveviewUrl, request, active, videoEncoder);
    active.selectedVideoEncoder = videoEncoder;

    this.log(`Starting stream ${sessionId} via FFmpeg using ${videoEncoder} with URL: ${redactStreamUrl(liveviewUrl)}`);
    if (this.streamingConfig.ffmpegDebug) {
      const safeArgs = redactFfmpegArgs(ffmpegArgs);
      this.log(`FFmpeg args: ${safeArgs.join(' ')}`);
    }

    const ffmpeg = spawn(this.streamingConfig.ffmpegPath, ffmpegArgs);
    ffmpeg.stdin.on('error', () => {
      if (active.ffmpeg === ffmpeg && this.ownsSession(sessionId, active)) {
        this.markStreamFailure(sessionId, active);
        void this.stopStream(sessionId, active.owner);
      }
    });
    active.ffmpeg = ffmpeg;
    active.owner?.children.add(ffmpeg);
    ffmpeg.once('close', () => active.owner?.children.delete(ffmpeg));
    if (liveviewUrl === 'pipe:0') active.immisProxy?.attachConsumer(ffmpeg.stdin);

    ffmpeg.on('spawn', () => {
      if (active.ffmpeg !== ffmpeg || active.stopped || (active.owner && !this.ownsSession(sessionId, active))) {
        return;
      }
      if (!active.readyNotified) {
        active.readyNotified = true;
        if (active.owner) active.owner.phase = 'RUNNING';
        this.log(`FFmpeg spawned for session ${sessionId}, signaling stream ready`);
        callback();
      }
    });

    ffmpeg.stderr.on('data', (data) => {
      if (active.stopped || active.ffmpeg !== ffmpeg) return;
      this.handleFfmpegStderr(sessionId, active, data);
    });

    ffmpeg.on('error', (error) => {
      if (active.ffmpeg !== ffmpeg || active.stopped || (active.owner && !this.ownsSession(sessionId, active))) {
        return;
      }
      this.flushFfmpegStderr(sessionId, active);

      recordSecurityBoundaryEvent('worker_failure');
      this.logError(`FFmpeg failed to start for session ${sessionId} using ${videoEncoder}: ${error.message}`);

      if (!ffmpeg.pid && !useSoftwareFallback && videoEncoder !== SOFTWARE_VIDEO_ENCODER && !active.fallbackVideoEncoderTried) {
        active.fallbackVideoEncoderTried = true;
        this.log(`Retrying stream ${sessionId} with software encoder ${SOFTWARE_VIDEO_ENCODER}`);
        this.startFfmpegStream(sessionId, liveviewUrl, request, active, callback, true);
        return;
      }

      this.markStreamFailure(sessionId, active);
      if (!active.readyNotified) {
        callback(error);
      }
      void this.stopStream(sessionId, active.owner);
    });

    ffmpeg.on('close', (code, signal) => {
      if (active.ffmpeg !== ffmpeg || active.stopped || (active.owner && !this.ownsSession(sessionId, active))) {
        return;
      }
      this.flushFfmpegStderr(sessionId, active);

      if (
        (code !== 0 || signal) &&
        !useSoftwareFallback &&
        videoEncoder !== SOFTWARE_VIDEO_ENCODER &&
        !active.fallbackVideoEncoderTried &&
        !active.stopped
      ) {
        active.fallbackVideoEncoderTried = true;
        this.log(
          `FFmpeg exited for session ${sessionId} using ${videoEncoder} (code=${code}, signal=${signal}); ` +
          `retrying with ${SOFTWARE_VIDEO_ENCODER}`,
        );
        this.startFfmpegStream(sessionId, liveviewUrl, request, active, callback, true);
        return;
      }

      if (!active.stopped && (code !== 0 || signal)) {
        this.markStreamFailure(sessionId, active);
        this.logError(`FFmpeg exited for session ${sessionId} (code=${code}, signal=${signal})`);
      }
      void this.stopStream(sessionId, active.owner);
    });
  }

  private handleFfmpegStderr(
    sessionId: string,
    state: FfmpegStderrState,
    data: Buffer,
    label = 'FFmpeg',
  ): void {
    if (!this.streamingConfig.ffmpegDebug) {
      return;
    }

    const chunk = data.toString('utf8');
    let lineStart = 0;

    for (let index = 0; index < chunk.length; index++) {
      const char = chunk.charCodeAt(index);
      if (char !== 10 && char !== 13) {
        continue;
      }

      this.appendFfmpegStderrSegment(state, chunk.slice(lineStart, index));
      this.flushFfmpegStderrLine(sessionId, state, label);

      if (char === 13 && chunk.charCodeAt(index + 1) === 10) {
        index++;
      }
      lineStart = index + 1;
    }

    this.appendFfmpegStderrSegment(state, chunk.slice(lineStart));
  }

  private flushFfmpegStderr(sessionId: string, state: FfmpegStderrState, label = 'FFmpeg'): void {
    if (!this.streamingConfig.ffmpegDebug) {
      return;
    }

    this.flushFfmpegStderrLine(sessionId, state, label);
  }

  private appendFfmpegStderrSegment(state: FfmpegStderrState, segment: string): void {
    if (!segment || state.ffmpegStderrBufferTruncated) {
      return;
    }

    const currentBuffer = state.ffmpegStderrBuffer ?? '';
    if (currentBuffer.length + segment.length <= MAX_FFMPEG_STDERR_BUFFER_CHARS) {
      state.ffmpegStderrBuffer = `${currentBuffer}${segment}`;
      return;
    }

    state.ffmpegStderrBuffer = '';
    state.ffmpegStderrBufferTruncated = true;
  }

  private flushFfmpegStderrLine(sessionId: string, state: FfmpegStderrState, label: string): void {
    if (state.ffmpegStderrBufferTruncated) {
      this.log(
        `${label}(${sessionId}): <stderr line omitted because it exceeded ${MAX_FFMPEG_STDERR_BUFFER_CHARS} characters>`,
      );
      state.ffmpegStderrBuffer = '';
      state.ffmpegStderrBufferTruncated = false;
      return;
    }

    if (!state.ffmpegStderrBuffer) {
      return;
    }

    this.logRedactedFfmpegLine(sessionId, state.ffmpegStderrBuffer, label);
    state.ffmpegStderrBuffer = '';
  }

  private logRedactedFfmpegLine(sessionId: string, line: string, label = 'FFmpeg'): void {
    const trimmed = line.trim();
    if (trimmed) {
      this.log(`${label}(${sessionId}): ${redactFfmpegOutput(trimmed)}`);
    }
  }

  private resolveVideoEncoder(): VideoEncoderPreference {
    const configuredEncoder = this.streamingConfig.video.encoder;
    if (configuredEncoder && configuredEncoder !== 'auto') {
      return configuredEncoder;
    }

    // Fallback heuristic if probe did not run (should not happen in normal operation)
    return SOFTWARE_VIDEO_ENCODER;
  }

  private buildVideoEncoderArgs(
    videoEncoder: VideoEncoderPreference,
    profileName: string,
    levelName: string,
  ): string[] {
    switch (videoEncoder) {
      case 'h264_videotoolbox':
        return [
          '-vcodec', videoEncoder,
          '-pix_fmt', 'yuv420p',
          '-profile:v', profileName,
          '-level:v', levelName,
          '-realtime', 'true',
        ];
      case 'h264_vaapi':
        return [
          '-vf', 'format=nv12,hwupload',
          '-vcodec', videoEncoder,
          '-profile:v', profileName,
          '-level:v', levelName,
        ];
      case 'h264_v4l2m2m':
        return [
          '-vcodec', videoEncoder,
          '-pix_fmt', 'yuv420p',
        ];
      case 'h264_qsv':
      case 'h264_nvenc':
        return [
          '-vcodec', videoEncoder,
          '-pix_fmt', 'yuv420p',
          '-profile:v', profileName,
          '-level:v', levelName,
        ];
      case 'auto':
      case 'libx264':
      default:
        return [
          '-vcodec', SOFTWARE_VIDEO_ENCODER,
          '-pix_fmt', 'yuv420p',
          '-profile:v', profileName,
          '-level:v', levelName,
          '-preset', 'veryfast',
          '-tune', 'zerolatency',
        ];
    }
  }

  private buildFfmpegArgs(
    liveviewUrl: string,
    request: Extract<StreamingRequest, { type: 'start' }>,
    session: ActiveStreamSession,
    videoEncoder: VideoEncoderPreference = this.resolveVideoEncoder(),
  ): string[] {
    const video = request.video;
    const suiteName = this.getSrtpSuiteName(session.videoCryptoSuite);
    const useSrtp = Boolean(suiteName);
    const videoParams = suiteName ? toSrtpParams(session.videoSRTP) : undefined;
    const bitrate = this.getVideoBitrate(video.max_bit_rate);

    const profileName = this.getH264ProfileName(video.profile);
    const levelName = this.getH264LevelName(video.level);
    const videoEncoderArgs = this.buildVideoEncoderArgs(videoEncoder, profileName, levelName);

    const args = [
      '-hide_banner',
      '-loglevel', this.streamingConfig.ffmpegDebug ? 'debug' : 'info',
    ];

    // Configure input based on URL type
    if (liveviewUrl === 'pipe:0') {
      args.push(
        '-fflags', 'nobuffer',
        '-flags', 'low_delay',
        '-f', 'mpegts',
        '-i', liveviewUrl,
      );
    } else {
      args.push(
        '-fflags', 'nobuffer',
        '-flags', 'low_delay',
        '-rtsp_transport', this.streamingConfig.rtspTransport,
        '-i', liveviewUrl,
      );
    }

    args.push(
      '-map', '0:v:0',
      ...videoEncoderArgs,
      '-r', `${video.fps}`,
      '-s', `${video.width}x${video.height}`,
      '-b:v', `${bitrate}k`,
      '-bufsize', `${bitrate}k`,
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
          [320, 180, 30],
          [320, 240, 30],
          [480, 270, 30],
          [480, 360, 30],
          [640, 360, 30],
          [640, 480, 30],
          [1280, 720, 30],
          [1920, 1080, 30],
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
