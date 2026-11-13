/**
 * Blink Camera Source
 *
 * Implements CameraStreamingDelegate for HomeKit camera snapshot + live streaming support.
 * Live streaming uses owned vendor transports and a private codec worker for HomeKit SRTP.
 *
 * Source: API Dossier Sections 3.3, 3.4, 3.5 (Thumbnail endpoints)
 * Source: API Dossier Section 4.2 (LiveVideoResponse)
 */

import {
  CameraControllerOptions,
  CameraStreamingDelegate,
  HAP,
  Service,
  PrepareStreamCallback,
  PrepareStreamRequest,
  PrepareStreamResponse,
  SnapshotRequest,
  SnapshotRequestCallback,
  StreamRequestCallback,
  StreamingRequest,
} from 'homebridge';
import { withResponseBudget, withinRequestBudget, RequestOptions, checkRequestBudget } from '../operation-budget';
import { toHapError } from '../hap-errors';
import { BlinkApi } from '../blink-api/client';
import { FeedAdmissionError, type FeedLease } from './feed-admission';
import { readBoundedBody } from '../blink-api/response-body';
import { BlinkHttpError } from '../blink-api/http';
import {
  recordSecurityBoundaryEvent,
  describeNetworkFailure,
  formatNetworkFailureDiagnostic,
  NetworkFailureDiagnostic,
} from '../blink-api/network-diagnostics';
import { redactDiagnosticText } from '../blink-api/redaction';
import { StreamDiagnosticBudget } from '../blink-api/stream-diagnostics';
import { ImmisProxyServer } from '../blink-api/immis-proxy';
import { effectiveOutputFps, isSupportedOutputVideo, outputH264Levels, outputResolutions, OutputQualityProfile, resolveOutputQuality } from './stream-quality';
import { createOwnedMediaSession, type OwnedMediaSession, type MediaSessionOptions } from './media-session';
import { loadPackagedMediaWorker } from './media-worker-artifact';
import { OwnedRtspBroker } from '../blink-api/rtsp-broker';
import { Writable } from 'node:stream';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { SharedCameraFeed, type FeedHandle, type FeedSink, type FeedSubscription } from './shared-feed';
import * as dgram from 'node:dgram';

import { URL } from 'node:url';

export type DeviceType = 'camera' | 'owl' | 'doorbell';
export type AudioCodecPreference = 'opus' | 'pcma' | 'pcmu';
export interface InputVideoObservation { width: number; height: number; fps?: number; }
export interface BlinkCameraStreamingConfig {
  enabled: boolean;
  mediaDebug: boolean;
  maxStreams: number;
  audio: {
    enabled: boolean;
    codec: AudioCodecPreference;
    bitrate: number;
  };
  video: {
    outputQuality: OutputQualityProfile;
    maxBitrate?: number;
    softwarePreset?: 'veryfast' | 'ultrafast';
  };
  /** Path to save debug stream recordings (MPEG-TS files) */
  debugStreamPath?: string;
  /** Snapshot cache TTL in seconds (0 = always request fresh, default 60) */
  snapshotCacheTTL?: number;
  /** Keep last successful snapshot indefinitely until manually refreshed */
  persistSnapshotCache?: boolean;
  /** Automatic HomeKit snapshots reuse the existing Blink thumbnail without a capture command. */
  passiveSnapshots?: boolean;
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
  mediaDebug: false,
  maxStreams: 1,
  audio: {
    enabled: true,
    codec: 'opus',
    bitrate: 32,
  },
  video: {
    outputQuality: 'auto',
    softwarePreset: 'veryfast',
  },
  snapshotCacheTTL: 60,
  persistSnapshotCache: false,
  passiveSnapshots: false,
};

export const resolveStreamingConfig = (
  config?: BlinkCameraStreamingConfigInput,
): BlinkCameraStreamingConfig => {
  const audio: Partial<BlinkCameraStreamingConfig['audio']> = config?.audio ?? {};
  const video: Partial<BlinkCameraStreamingConfig['video']> = config?.video ?? {};
  if (audio.codec !== undefined && !['opus', 'pcma', 'pcmu'].includes(audio.codec)) {
    throw new Error('Unsupported audio codec; run the secure media configuration migration');
  }

  return {
    enabled: config?.enabled ?? DEFAULT_STREAMING_CONFIG.enabled,
    mediaDebug: config?.mediaDebug ?? DEFAULT_STREAMING_CONFIG.mediaDebug,
    maxStreams: Math.max(1, config?.maxStreams ?? DEFAULT_STREAMING_CONFIG.maxStreams),
    debugStreamPath: config?.debugStreamPath,
    snapshotCacheTTL: config?.snapshotCacheTTL ?? DEFAULT_STREAMING_CONFIG.snapshotCacheTTL,
    persistSnapshotCache: config?.persistSnapshotCache ?? DEFAULT_STREAMING_CONFIG.persistSnapshotCache,
    passiveSnapshots: config?.passiveSnapshots ?? DEFAULT_STREAMING_CONFIG.passiveSnapshots,
    audio: {
      enabled: audio.enabled ?? DEFAULT_STREAMING_CONFIG.audio.enabled,
      codec: audio.codec ?? DEFAULT_STREAMING_CONFIG.audio.codec,
      bitrate: audio.bitrate ?? DEFAULT_STREAMING_CONFIG.audio.bitrate,
    },
    video: {
      outputQuality: resolveOutputQuality(video.outputQuality),
      maxBitrate: video.maxBitrate ?? DEFAULT_STREAMING_CONFIG.video.maxBitrate,
      softwarePreset: video.softwarePreset === 'ultrafast' ? 'ultrafast' : 'veryfast',
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
  mediaClosed?: boolean;
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
  videoCryptoSuite: number;
  videoSRTP: Buffer;
  videoSSRC: number;
  audioPort?: number;
  localAudioPort?: number;
  audioCryptoSuite?: number;
  audioSRTP?: Buffer;
  audioSSRC?: number;
}

interface ActiveStreamSession extends PendingStreamSession {
  media?: OwnedMediaSession;
  stopped?: boolean;
  readyNotified?: boolean;
  feed?: FeedSubscription;
}

const usedPorts = new Set<number>();

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
  private readonly sharedFeed: SharedCameraFeed;
  private readonly sessionOwners = new Map<string, SessionOwner>();
  private readonly pendingSessions = new Map<string, PendingStreamSession>();
  private readonly ongoingSessions = new Map<string, ActiveStreamSession>();
  private cachedSnapshot: Buffer | null = null;
  private cameraActive = true;
  private cameraEpoch = 0;
  private snapshotAbort = new globalThis.AbortController();
  private cachedSnapshotTime = 0;
  private freshSnapshotPromise: Promise<Buffer> | null = null;
  private freshSnapshotCaptures = false;
  private manualSnapshotPromise: Promise<Buffer> | null = null;
  private snapshotFailureCooldownUntil = 0;
  private snapshotFailure: Error | null = null;
  private snapshotFailureCaptured = false;
  private streamFailureCooldownUntil = 0;
  private remoteRetirement: Promise<void> = Promise.resolve();
  private feedRetirement: Promise<void> = Promise.resolve();
  private readonly remoteAllocations = new Set<Promise<void>>();
  private retirementReceiptBudget = 8;
  private readonly negotiationDiagnostics = new StreamDiagnosticBudget(32, 8);

  private logNegotiation(message: string, error = false): void {
    if (this.negotiationDiagnostics.admit(error)) this.log(message);
  }
  private inputVideoObserved = false;

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
    private readonly beforeLiveview?: (options: RequestOptions) => Promise<void>,
    private readonly onInputObservation?: (observation: InputVideoObservation) => void,
    private readonly acquireFeed?: () => FeedLease,
  ) {
    // Diagnostics must not interrupt HomeKit callbacks or media cleanup.
    this.log = message => { try { log(message); } catch { /* Ignore logger failure. */ } };
    this.errorLog = message => { try { errorLog(message); } catch { /* Ignore logger failure. */ } };
    this.streamingConfig = resolveStreamingConfig(streamingConfig);
    this.sharedFeed = new SharedCameraFeed((sink, signal) => this.startVendorFeed(sink, signal));
  }

  private logError(message: string): void {
    this.errorLog(redactDiagnosticText(message));
  }

  /** HomeKit camera-off applies to every live and recording consumer. */
  setCameraActive(active: boolean): void {
    if (active === this.cameraActive) return;
    this.cameraActive = active; this.cameraEpoch++;
    this.snapshotFailure = null; this.snapshotFailureCooldownUntil = 0;
    if (!active) {
      this.snapshotAbort.abort(); this.freshSnapshotPromise = null;
      this.freshSnapshotCaptures = false; this.manualSnapshotPromise = null;
      this.cachedSnapshot?.fill(0); this.cachedSnapshot = null; this.cachedSnapshotTime = 0;
      for (const [id, owner] of this.sessionOwners) void this.stopStream(id, owner);
    } else { this.snapshotAbort = new globalThis.AbortController(); }
  }

  /**
   * Handle snapshot request from HomeKit.
   * Returns cached snapshots when valid/persistent. Native recording automatic
   * cache misses download the existing thumbnail without a capture command.
   *
   * @param request - Snapshot request with width/height
   * @param callback - Callback to return image buffer or error
   */
  async handleSnapshotRequest(
    request: SnapshotRequest,
    callback: SnapshotRequestCallback,
  ): Promise<void> {
    if (!this.cameraActive || !this.isDeviceAvailable()) {
      this.cachedSnapshot = null;
      this.cachedSnapshotTime = 0;
      callback(new Error('Camera is unavailable/offline'));
      return;
    }

    const persistSnapshotCache = this.streamingConfig.persistSnapshotCache ?? false;
    if (this.cachedSnapshot && persistSnapshotCache) {
      callback(undefined, this.cachedSnapshot);
      return;
    }

    const cacheTTL = (this.streamingConfig.snapshotCacheTTL ?? 60) * 1000;
    const cacheAge = Date.now() - this.cachedSnapshotTime;

    // Return cached snapshot if still valid by TTL
    if (this.cachedSnapshot && cacheTTL > 0 && cacheAge < cacheTTL) {
      callback(undefined, this.cachedSnapshot);
      return;
    }

    let buffer: Buffer;
    try {
      buffer = await withResponseBudget(this.fetchFreshSnapshot());
    } catch (error) {
      callback(toHapError(this.hap, error));
      return;
    }
    callback(undefined, buffer);
  }

  /**
   * Force a fresh snapshot fetch and update in-memory cache.
   * Used by manual refresh controls when persistent caching is enabled.
   */
  async refreshSnapshotCache(): Promise<void> {
    if (!this.cameraActive || !this.isDeviceAvailable()) {
      throw new Error('Camera is unavailable/offline');
    }

    await this.fetchFreshSnapshot(true);
  }

  private fetchFreshSnapshot(capture = !this.streamingConfig.passiveSnapshots): Promise<Buffer> {
    if (!this.cameraActive || !this.isDeviceAvailable()) return Promise.reject(new Error('Camera is unavailable/offline'));
    if (this.freshSnapshotPromise) {
      if (!capture || this.freshSnapshotCaptures) return this.freshSnapshotPromise;
      // A manual refresh still needs one capture after an automatic read already
      // in progress. Revoke queued work if camera privacy changes in between.
      const epoch = this.cameraEpoch;
      const manual = this.manualSnapshotPromise ?? this.freshSnapshotPromise.catch(() => undefined).then(() => {
        if (epoch !== this.cameraEpoch || !this.cameraActive || !this.isDeviceAvailable()) throw new Error('Camera is unavailable/offline');
        return this.fetchFreshSnapshot(true);
      }).finally(() => { if (this.manualSnapshotPromise === manual) this.manualSnapshotPromise = null; });
      this.manualSnapshotPromise = manual;
      return manual;
    }

    if (this.snapshotFailure && Date.now() < this.snapshotFailureCooldownUntil
        && (!capture || this.snapshotFailureCaptured)) {
      return Promise.reject(this.snapshotFailure);
    }

    this.snapshotFailure = null;
    this.snapshotFailureCooldownUntil = 0;

    const epoch = this.cameraEpoch, signal = this.snapshotAbort.signal;
    const request: Promise<Buffer> = (async () => {
      try {
        const buffer = await withResponseBudget(this.fetchSnapshotBuffer(Date.now() + 60_000, signal, capture), 60_000);
        if (epoch !== this.cameraEpoch || !this.cameraActive) { buffer.fill(0); throw new Error('Camera is unavailable/offline'); }
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
        if (epoch === this.cameraEpoch && this.cameraActive && this.isDeviceAvailable()) {
          this.snapshotFailure = failure;
          this.snapshotFailureCaptured = capture;
          this.snapshotFailureCooldownUntil = Date.now() + SNAPSHOT_FAILURE_COOLDOWN_MS;
        }
        throw failure;
      } finally {
        if (epoch === this.cameraEpoch) { this.freshSnapshotPromise = null; this.freshSnapshotCaptures = false; }
      }
    })();

    this.freshSnapshotPromise = request;
    this.freshSnapshotCaptures = capture;
    return request;
  }

  private cacheSnapshot(buffer: Buffer): void {
    // Status polling can report the camera offline while its image is downloading.
    // Never publish or retain that late response as an available snapshot.
    if (!this.cameraActive || !this.isDeviceAvailable()) {
      buffer.fill(0);
      this.cachedSnapshot = null;
      this.cachedSnapshotTime = 0;
      throw new Error('Camera is unavailable/offline');
    }
    this.cachedSnapshot = buffer;
    this.cachedSnapshotTime = Date.now();
  }

  private async fetchSnapshotBuffer(deadline: number, signal: globalThis.AbortSignal, requestCapture: boolean): Promise<Buffer> {
    const capture = requestCapture ? await this.requestThumbnail({ deadline, signal })
      : { completed: false, thumbnail: this.getThumbnailUrl() };
    checkRequestBudget({ deadline, signal });
    const url = capture.thumbnail;
    if (capture.completed) {
      this.log('Thumbnail capture completed');
    } else if (requestCapture) {
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
        signal: globalThis.AbortSignal.any([signal, globalThis.AbortSignal.timeout(Math.max(1, Math.min(30_000, deadline - Date.now())))]),
      });
    } catch (error) {
      throw new SnapshotNetworkError(describeNetworkFailure(error, resourceUrl, startedAtMs));
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Failed to fetch thumbnail: ${response.status}`);
    }
    try {
      const buffer = await readBoundedBody(response, { kind: 'thumbnail', deadline, signal });
      checkRequestBudget({ deadline, signal });
      return buffer;
    } catch {
      checkRequestBudget({ deadline, signal });
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
    if (!this.cameraActive || !this.streamingConfig.enabled) {
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
    const owner: SessionOwner = { phase: 'PREPARING', preparing: true, ports: new Set(), abort: new globalThis.AbortController() };
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
    let response: PrepareStreamResponse;
    try {
      const videoSSRC = randomBytes(4).readUInt32BE(0) || 1;
      const localVideoPort = await allocateOwned();

      const session: PendingStreamSession = {
        owner,
        address: request.targetAddress,
        addressVersion: request.addressVersion,
        sessionId,
        videoPort: request.video.port,
        localVideoPort,
        videoCryptoSuite: request.video.srtpCryptoSuite,
        videoSRTP: Buffer.concat([request.video.srtp_key, request.video.srtp_salt]),
        videoSSRC,
      };

      if (this.streamingConfig.audio.enabled) {
        const audioSSRC = randomBytes(4).readUInt32BE(0) || 1;
        const localAudioPort = await allocateOwned();
        session.audioPort = request.audio.port;
        session.localAudioPort = localAudioPort;
        session.audioCryptoSuite = request.audio.srtpCryptoSuite;
        session.audioSRTP = Buffer.concat([request.audio.srtp_key, request.audio.srtp_salt]);
        session.audioSSRC = audioSSRC;
      }

      owner.preparing = false;
      owner.phase = 'PREPARED';
      this.pendingSessions.set(sessionId, session);

      response = {
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

      this.logNegotiation('Stream prepared');
    } catch {
      const message = owner.abort.signal.aborted ? 'Streaming preparation cancelled' : 'Stream preparation failed';
      owner.preparing = false;
      owner.retirement = undefined;
      await this.stopStream(sessionId);
      this.logError(message);
      callback(new Error(message));
      return;
    }
    callback(undefined, response);
  }

  /**
   * Handle generation-owned private media streaming.
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

    // Restored clients can retain old capabilities after a profile change.
    // Keep geometry strict; a selected frame rate is capped by the output profile.
    if (!isSupportedOutputVideo(this.streamingConfig.video.outputQuality, request.video)) {
      const numeric = (value: number): string => Number.isSafeInteger(value) && value >= 0 && value <= 65535 ? String(value) : 'invalid';
      this.logNegotiation(`Stream selection rejected: profile=${this.streamingConfig.video.outputQuality}, width=${numeric(request.video.width)}, height=${numeric(request.video.height)}, requestedFps=${numeric(request.video.fps)}, level=${numeric(request.video.level)}`, true);
      await this.stopStream(sessionId, pending.owner);
      callback(new Error('Selected video quality is not supported by the output profile'));
      return;
    }

    if (Date.now() < this.streamFailureCooldownUntil) {
      await this.stopStream(sessionId, pending.owner);
      callback(new Error('Streaming startup is temporarily unavailable'));
      return;
    }

    this.logNegotiation(`Stream output: profile=${this.streamingConfig.video.outputQuality}, width=${request.video.width}, height=${request.video.height}, requestedFps=${request.video.fps}, effectiveFps=${effectiveOutputFps(this.streamingConfig.video.outputQuality, request.video.fps)}`);

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
    const active: ActiveStreamSession = { ...pending };
    this.pendingSessions.delete(sessionId);
    this.ongoingSessions.set(sessionId, active);

    try {
      // Resolve shipped bytes and validate negotiation before acquiring a vendor capability.
      const mediaOptions = this.buildNativeMediaOptions(request, active);
      owner.localStarting = true;
      owner.mediaClosed = false;
      try {
        const media = await createOwnedMediaSession(mediaOptions, owner.abort.signal);
        active.media = media;
        void media.whenClosed.then(() => {
          owner.mediaClosed = true; owner.release?.();
          if (this.ownsSession(sessionId, active)) {
            if (media.failed) this.markStreamFailure(sessionId, active);
            void this.stopStream(sessionId, owner);
          }
        });
        if (!this.ownsSession(sessionId, active)) { void media.stop(); throw new Error('Streaming startup cancelled'); }
      } finally {
        owner.localStarting = false;
        if (!active.media) owner.mediaClosed = true;
        owner.release?.();
      }
      owner.localStarting = true;
      try {
        const media = active.media!;
        active.feed = await this.sharedFeed.subscribe({
          write: bytes => media.write(bytes),
          end: () => media.end(),
          fail: () => {
            if (!this.ownsSession(sessionId, active)) return;
            this.markStreamFailure(sessionId, active);
            void this.stopStream(sessionId, owner);
          },
        }, owner.abort.signal);
        if (!this.ownsSession(sessionId, active)) { await active.feed.stop(); throw new Error('Streaming startup cancelled'); }
      } finally {
        owner.localStarting = false;
        if (owner.abort.signal.aborted) {
          void active.feed?.whenClosed.then(() => { owner.transportClosed = true; owner.release?.(); });
        }
        owner.release?.();
      }
      if (!this.ownsSession(sessionId, active)) throw new Error('Streaming startup cancelled');
      active.readyNotified = true; owner.phase = 'RUNNING'; callback();

    } catch {
      // Home may immediately resubmit START after a refusal. Keep remote POSTs bounded
      // while the previous vendor command retires; STOP cancellation is not a failure.
      this.markStreamFailure(sessionId, active);
      this.logError('Private streaming startup failed');
      await this.stopStream(sessionId, owner);
      callback(new Error('Private streaming startup failed'));
    }
  }

  private ownsSession(sessionId: string, active: ActiveStreamSession): boolean {
    return this.ongoingSessions.get(sessionId) === active && !active.stopped
      && !active.owner?.abort.signal.aborted;
  }

  private markStreamFailure(sessionId: string, active: ActiveStreamSession): void {
    if (this.ownsSession(sessionId, active)) this.streamFailureCooldownUntil = Date.now() + 30_000;
  }

  private completeLiveview(commandId: number): Promise<void> {
    const retirement = this.remoteRetirement.then(async () => {
      let outcome: string;
      try {
        const result = await withResponseBudget(
          this.api.completeCommand(this.networkId, commandId, { deadline: Date.now() + 5000 }), 5000);
        outcome = result === null ? 'not_found' : 'acknowledged';
      } catch (error) {
        outcome = error instanceof BlinkHttpError ? `http_${error.status}` : 'timeout_or_failure';
        this.logError('Live view remote cleanup failed or timed out');
      }
      if (this.retirementReceiptBudget > 0) {
        this.retirementReceiptBudget--;
        this.log(`Live view retirement: ${outcome}`);
      }
    });
    this.remoteRetirement = retirement;
    return retirement;
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
      try { void active.feed?.stop(); void active.media?.stop(); }
      catch { this.logError('Media transport cleanup failed'); }
    }
    if (pending) this.pendingSessions.delete(sessionId);
    const transportClosure = active?.feed?.whenClosed;
    owner.transportClosed = !transportClosure;
    owner.retirement = (async () => {
      const release = (): void => {
        if (owner.preparing || owner.localStarting || owner.mediaClosed === false || owner.transportClosed === false) return;
        for (const port of owner.ports) releasePort(port);
        owner.ports.clear(); owner.phase = 'CLOSED';
        const session = active ?? pending;
        session?.videoSRTP.fill(0); session?.audioSRTP?.fill(0);
        if (this.sessionOwners.get(sessionId) === owner) this.sessionOwners.delete(sessionId);
        if (this.ongoingSessions.get(sessionId) === active) this.ongoingSessions.delete(sessionId);
      };
      owner.release = release;
      if (transportClosure) {
        void transportClosure.then(() => { owner.transportClosed = true; release(); });
        await withResponseBudget(transportClosure, 3000).catch(() => { recordSecurityBoundaryEvent('cleanup_timeout'); this.logError('Media transport cleanup timeout; reservation retained'); });
      }
      if (active?.media) {
        await withResponseBudget(active.media.whenClosed, 3000).catch(() => {
          recordSecurityBoundaryEvent('cleanup_timeout'); this.logError('Private media cleanup timeout; reservation retained');
        });
      }
      release();
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

  /** One authenticated vendor transport shared by simultaneous live viewers. */
  private async startVendorFeed(sink: FeedSink, signal: globalThis.AbortSignal): Promise<FeedHandle> {
    signal.throwIfAborted();
    if (!this.cameraActive || !this.isDeviceAvailable()) throw new Error('Camera feed unavailable');
    let lease: FeedLease | undefined;
    const abort = new globalThis.AbortController();
    let proxy: ImmisProxyServer | undefined;
    let broker: OwnedRtspBroker | undefined;
    let consumer: Writable | undefined;
    let commandId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopping: Promise<void> | undefined;
    let allocationDuty: Promise<void> | undefined;
    let commandRetirement: Promise<void> | undefined;
    const retireCommand = (): Promise<void> => commandId
      ? commandRetirement ??= this.completeLiveview(commandId) : Promise.resolve();
    let finish!: () => void;
    const whenClosed = new Promise<void>(resolve => { finish = resolve; });
    const stop = (): Promise<void> => {
      if (stopping) return stopping;
      abort.abort(); globalThis.clearTimeout(timer);
      signal.removeEventListener('abort', cancelled);
      stopping = (async () => {
        proxy?.retire(); void broker?.stop(); consumer?.destroy();
        await Promise.all([proxy?.whenClosed, broker?.whenClosed]);
        if (commandId) void retireCommand();
        finish();
      })();
      // Local transport closure releases HomeKit ports independently. The
      // upstream lease additionally owns any still-pending vendor allocation.
      const leaseRetirement = stopping.then(async () => {
        await allocationDuty;
        await retireCommand();
        lease?.release();
      });
      this.feedRetirement = Promise.all([this.feedRetirement, leaseRetirement]).then(() => undefined);
      void this.feedRetirement.catch(() => undefined);
      return stopping;
    };
    const cancelled = (): void => { void stop(); };
    const failed = (): void => {
      if (abort.signal.aborted) return;
      this.logError('Private media transport failed');
      try { sink.fail(); } finally { void stop(); }
    };
    signal.addEventListener('abort', cancelled, { once: true });
    try {
      if (this.beforeLiveview) {
        const options = { signal: abort.signal, deadline: Date.now() + 12_000 };
        await withinRequestBudget(this.beforeLiveview(options), options);
      }
      await withinRequestBudget(Promise.all([this.remoteRetirement, this.feedRetirement, ...this.remoteAllocations]),
        { signal: abort.signal, deadline: Date.now() + 4000 });
      abort.signal.throwIfAborted();
      lease = this.acquireFeed?.();
      const allocation = this.requestLiveView().then(async liveview => {
        commandId = liveview.command_id ?? liveview.id;
        if (abort.signal.aborted) {
          await retireCommand();
          throw new Error('Camera feed cancelled');
        }
        return liveview;
      });
      const duty = allocation.then(() => undefined, () => undefined);
      allocationDuty = duty;
      this.remoteAllocations.add(duty);
      void duty.then(() => this.remoteAllocations.delete(duty));
      const liveview = await withinRequestBudget(allocation, { signal: abort.signal, deadline: Date.now() + 25000 });
      abort.signal.throwIfAborted();
      if (!liveview.server) throw new Error('Camera feed unavailable');
      if (liveview.server.startsWith('immis://')) {
        proxy = new ImmisProxyServer({ immisUrl: liveview.server, serial: this.serial,
          log: message => this.log(message), errorLog: message => this.logError(message),
          debug: this.streamingConfig.mediaDebug, saveStreamPath: this.streamingConfig.debugStreamPath, verifyTls: true });
        proxy.on('error', failed);
        consumer = new Writable({ write(bytes: Buffer, _encoding, done) {
          void sink.write(bytes).then(() => done(), () => done(new Error('Private media unavailable')));
        } });
        consumer.on('error', failed);
        await proxy.start(); abort.signal.throwIfAborted(); proxy.attachConsumer(consumer);
        void proxy.whenClosed.then(() => { if (!abort.signal.aborted) failed(); });
      } else {
        broker = new OwnedRtspBroker(liveview.server, { write: bytes => sink.write(bytes), close: () => sink.end() },
          { error: failed }, abort.signal);
        await broker.start(); abort.signal.throwIfAborted();
        void broker.whenClosed.then(() => { if (!abort.signal.aborted) failed(); });
      }
      if (commandId) {
        const ownedCommand = commandId;
        const interval = Math.max(1, Math.min(60, Number.isFinite(liveview.polling_interval) && liveview.polling_interval! > 0 ? liveview.polling_interval! : 5)) * 1000;
        const poll = async (): Promise<void> => {
          if (abort.signal.aborted) return;
          try {
            const status = await this.api.getCommandStatus(this.networkId, ownedCommand, { signal: abort.signal, deadline: Date.now() + 30_000 });
            if (abort.signal.aborted || status.complete || status.status === 'complete' || status.status === 'failed') return;
          } catch { if (abort.signal.aborted) return; this.logError('Live view polling failed'); }
          timer = setTimeout(() => { void poll(); }, interval);
        };
        void poll();
      }
      return { whenClosed, stop };
    } catch (error) {
      if (error instanceof FeedAdmissionError) this.logError(error.message);
      await stop();
      throw new Error('Camera feed unavailable');
    }
  }

  async shutdown(): Promise<void> {
    this.setCameraActive(false);
    await Promise.all([...this.sessionOwners].map(([id, owner]) => this.stopStream(id, owner)));
    await this.sharedFeed.stop();
  }

  private buildNativeMediaOptions(request: Extract<StreamingRequest, { type: 'start' }>, active: ActiveStreamSession): MediaSessionOptions {
    // eslint-disable-next-line no-undef -- This plugin is published as CommonJS.
    const workerPath = loadPackagedMediaWorker(resolve(__dirname, '../..'));
    if (active.videoCryptoSuite !== this.hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80 || active.videoSRTP.length !== 30) {
      throw new Error('Unsupported media cryptography');
    }
    const output = (port: number, ssrc: number, material: Buffer, pt: number, rtcpInterval = 0.5) => ({
      address: active.address, addressVersion: active.addressVersion, port, ssrc, payloadType: pt,
      suite: 'AES_CM_128_HMAC_SHA1_80' as const, key: material.subarray(0, 16), salt: material.subarray(16),
      mtu: request.video.mtu, fps: effectiveOutputFps(this.streamingConfig.video.outputQuality, request.video.fps), rtcpInterval,
    });
    const options: MediaSessionOptions = { workerPath, video: {
      output: output(active.videoPort, active.videoSSRC, active.videoSRTP, request.video.pt, request.video.rtcp_interval),
      localPort: active.localVideoPort, width: request.video.width, height: request.video.height,
      bitrate: this.getVideoBitrate(request.video.max_bit_rate) * 1000, maxFrames: 9000,
      profile: request.video.profile as 0 | 1 | 2, level: request.video.level as 0 | 1 | 2,
      softwarePreset: this.streamingConfig.video.softwarePreset,
    }, onSourceInfo: info => {
      if (!this.ownsSession(active.sessionId, active)) return;
      const observation = { width: info.width, height: info.height,
        ...(info.fpsNumerator ? { fps: info.fpsNumerator / info.fpsDenominator } : {}) };
      this.onInputObservation?.(observation);
      if (!this.inputVideoObserved) { this.inputVideoObserved = true; this.logNegotiation(`Input video: ${info.width}x${info.height}`); }
    } };
    if (this.streamingConfig.audio.enabled && request.audio) {
      const audio = request.audio;
      if (!active.audioPort || !active.localAudioPort || !active.audioSSRC || active.audioSRTP?.length !== 30 ||
          active.audioCryptoSuite !== this.hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80 || (audio.channel && audio.channel !== 1)) {
        throw new Error('Unsupported audio negotiation');
      }
      const selected = typeof audio.codec === 'string' ? audio.codec.toUpperCase() : audio.codec;
      const codec = selected === 'OPUS' || selected === this.hap.AudioStreamingCodecType.OPUS ? 'opus'
        : selected === 'PCMA' || selected === this.hap.AudioStreamingCodecType.PCMA ? 'pcma'
          : selected === 'PCMU' || selected === this.hap.AudioStreamingCodecType.PCMU ? 'pcmu' : undefined;
      if (!codec) throw new Error('Unsupported selected audio codec');
      const rate = codec === 'opus' ? this.getAudioSampleRate(audio.sample_rate) * 1000 : 8000;
      options.audio = { output: output(active.audioPort, active.audioSSRC, active.audioSRTP, audio.pt, audio.rtcp_interval),
        localPort: active.localAudioPort, codec, rate: rate as 8000 | 16000 | 24000,
        bitrate: this.getAudioBitrate(audio.max_bit_rate) * 1000,
        ...(codec === 'opus' ? { packetTime: (audio.packet_time ?? 20) as 10 | 20 | 40 | 60 } : {}) };
    }
    return options;
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
    resolved.audio.codec === 'pcma'
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
        resolutions: outputResolutions(resolved.video.outputQuality),
        codec: {
          profiles: [hap.H264Profile.BASELINE, hap.H264Profile.MAIN, hap.H264Profile.HIGH],
          levels: outputH264Levels(resolved.video.outputQuality),
        },
      },
      audio: audioEnabled ? {
        twoWayAudio: false,
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

/** Refresh HAP's configuration identity when a restored audio offer changes.
 * HAP excludes characteristic values from its config hash. The public
 * description carries a stable identity for the actual advertised TLV, while
 * the service event schedules the normal bridge configuration advertisement.
 */
export function refreshCameraAudioCapabilities(hap: HAP, services: readonly Service[]): void {
  for (const service of services) {
    if (service.UUID !== hap.Service.CameraRTPStreamManagement.UUID) continue;
    const characteristic = service.getCharacteristic(hap.Characteristic.SupportedAudioStreamConfiguration);
    if (typeof characteristic.value !== 'string') continue;
    const digest = createHash('sha256').update(characteristic.value).digest('hex');
    const description = `Supported Audio Stream Configuration: ${digest}`;
    if (characteristic.props.description === description) continue;
    characteristic.setProps({ description });
    service.emit('service-configurationChange');
  }
}
