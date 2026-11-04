import { Buffer } from 'node:buffer';
import type { CameraRecordingConfiguration, CameraRecordingDelegate, CameraRecordingOptions, RecordingPacket } from 'homebridge';
import type { VideoMotionEvent } from './media-worker';
import type { RecordingSource } from '../settings';
import type { PreparedSavedClip } from './saved-clip-preparation';
import type { NativeClipCameraTarget, NativeClipDeliveryMetadata, NativeClipDeliveryResult, NativeClipPolicySnapshot } from '../native-clip-recorder';
import { observedHomeBoolean, unknownHomeRecordingObservation, type HomeRecordingObservation } from '../recording-readiness';
import {
  RecordingBufferBudget, RecordingBufferError, RecordingFragmentBuffer, sharedRecordingBufferBudget,
  type RecordingBufferPin, type RecordingFragment,
} from './recording-buffer';

export type { RecordingFragment } from './recording-buffer';

export interface RecordingSession {
  readonly whenClosed: Promise<void>;
  stop(): Promise<void>;
}
export interface RecordingSessionCallbacks {
  initialization(data: Buffer): void;
  fragment(fragment: RecordingFragment): Promise<void>;
  motion(event: VideoMotionEvent): void;
  failed(reason: string): void;
}
export type StartRecordingSession = (
  configuration: CameraRecordingConfiguration,
  audioActive: boolean,
  callbacks: RecordingSessionCallbacks,
  signal: globalThis.AbortSignal,
) => Promise<RecordingSession>;

export type RecordingState = 'off' | 'warming' | 'ready' | 'recording' | 'fault';
export type RecordingFailure = 'invalid_configuration' | 'capture_failed' | 'startup_timeout' | 'buffer_exhausted' |
  'invalid_media' | 'discontinuity' | 'recording_timeout' | 'shutdown_timeout';
export interface RecordingStatus { state: RecordingState; reason?: RecordingFailure; }
export interface CameraRecordingDelegateOptions {
  source?: RecordingSource;
  policyChanged?: () => void;
  replayMotion?: (active: boolean, metadata: NativeClipDeliveryMetadata) => void;
  status?: (status: RecordingStatus) => void;
  videoMotion?: () => void;
  budget?: RecordingBufferBudget;
  retryMs?: number;
}

export const CAMERA_RECORDING_LIMITS = Object.freeze({
  startupMs: 10000, closeMs: 2000, retryMs: 30000, unopenedEventMs: 8000, acknowledgeMs: 8000,
});

/** Advertise only formats produced by the private recording worker. */
export function createRecordingOptions(): CameraRecordingOptions {
  return {
    prebufferLength: 4000,
    mediaContainerConfiguration: { type: 0, fragmentLength: 4000 },
    video: { type: 0, parameters: { profiles: [0, 1, 2], levels: [0, 1, 2] },
      resolutions: [[1920, 1080, 30], [1920, 1080, 15], [1280, 720, 30], [1280, 720, 15], [640, 360, 15]] },
    audio: { codecs: [{ type: 0, audioChannels: 1, bitrateMode: 0, samplerate: [1, 2] }] },
  };
}

function configurationCopy(configuration: CameraRecordingConfiguration): CameraRecordingConfiguration {
  const c = configuration;
  const v = c?.videoCodec, a = c?.audioCodec, p = v?.parameters, r = v?.resolution;
  const integer = (n: number, low: number, high: number) => Number.isInteger(n) && n >= low && n <= high;
  if (!c || !integer(c.prebufferLength, 0, 4000) || !Array.isArray(c.eventTriggerTypes) ||
      c.eventTriggerTypes.some(t => t !== 1 && t !== 2) || c.mediaContainerConfiguration?.type !== 0 ||
      c.mediaContainerConfiguration.fragmentLength !== 4000 || v?.type !== 0 ||
      !p || !integer(p.profile, 0, 2) || !integer(p.level, 0, 2) || !integer(p.bitRate, 20, 8000) ||
      !integer(p.iFrameInterval, 1000, 4000) || p.iFrameInterval > c.mediaContainerConfiguration.fragmentLength ||
      !Array.isArray(r) || r.length !== 3 || !integer(r[0], 2, 1920) || !integer(r[1], 2, 1080) ||
      (r[0] & 1) || (r[1] & 1) || !integer(r[2], 1, 30) || a?.type !== 0 ||
      ![1, 2].includes(a.samplerate) || (a.audioChannels !== undefined && a.audioChannels !== 1) ||
      (a.bitrateMode !== undefined && ![0, 1].includes(a.bitrateMode)) || !integer(a.bitrate, 8, 128)) {
    throw new Error('Recording configuration unavailable');
  }
  const blocks = Math.ceil(r[0] / 16) * Math.ceil(r[1] / 16);
  if (blocks > [3600, 5120, 8192][p.level] || blocks * r[2] > [108000, 216000, 245760][p.level]) {
    throw new Error('Recording configuration unavailable');
  }
  return { prebufferLength: c.prebufferLength, eventTriggerTypes: [...c.eventTriggerTypes],
    mediaContainerConfiguration: { ...c.mediaContainerConfiguration },
    videoCodec: { type: v.type, parameters: { ...p }, resolution: [...r] }, audioCodec: { ...a } };
}

interface Generation {
  token: symbol;
  configuration: CameraRecordingConfiguration;
  audio: boolean;
  abort: globalThis.AbortController;
  buffer: RecordingFragmentBuffer;
  start: Promise<RecordingSession | undefined>;
  session?: RecordingSession;
  startupTimer?: ReturnType<typeof globalThis.setTimeout>;
  retired?: Promise<void>;
}
interface Event {
  generation: Generation;
  pin: RecordingBufferPin;
  streamId?: number;
  started: boolean;
  finished: boolean;
  cancelled: boolean;
  ended: boolean;
  endAfterSequence?: number;
  error?: Error;
  waiters: Set<() => void>;
  unopenedTimer?: ReturnType<typeof globalThis.setTimeout>;
  acknowledgeTimer?: ReturnType<typeof globalThis.setTimeout>;
}
interface SavedEvent {
  prepared: PreparedSavedClip;
  metadata: NativeClipDeliveryMetadata;
  epoch: string | number;
  signal: globalThis.AbortSignal;
  cancel: () => void;
  resolve: (result: NativeClipDeliveryResult) => void;
  streamId?: number;
  started: boolean;
  finished: boolean;
  held: boolean;
  transportUncertain: boolean;
  acknowledgedAt?: string;
  error?: Error;
  unopened?: ReturnType<typeof globalThis.setTimeout>;
  acknowledge?: ReturnType<typeof globalThis.setTimeout>;
  hold?: ReturnType<typeof globalThis.setTimeout>;
}

/** Owns one continuously buffered generation and one bounded, pinned recording event. */
export class BlinkCameraRecordingDelegate implements CameraRecordingDelegate, NativeClipCameraTarget {
  #active = false;
  #cameraActive = true;
  #audioActive = false;
  #available = true;
  #stopped = false;
  #configuration?: CameraRecordingConfiguration;
  #generation?: Generation;
  #event?: Event;
  #status: RecordingStatus = { state: 'off' };
  #operations: Promise<void> = Promise.resolve();
  #retirement: Promise<void> = Promise.resolve();
  #retry?: ReturnType<typeof globalThis.setTimeout>;
  #source: RecordingSource;
  #sourceAvailable = true;
  #permissionEpoch = 0;
  #configurationRevision = 0;
  #saved?: SavedEvent;
  #home = unknownHomeRecordingObservation();
  #lastValidMotionAllowed: boolean | null = null;
  readonly #budget: RecordingBufferBudget;
  readonly #retryMs: number;

  constructor(private readonly startSession: StartRecordingSession, private readonly options: CameraRecordingDelegateOptions = {}) {
    this.#source = options.source ?? 'continuous';
    this.#budget = options.budget ?? sharedRecordingBufferBudget;
    const retry = options.retryMs ?? CAMERA_RECORDING_LIMITS.retryMs;
    this.#retryMs = Number.isInteger(retry) && retry >= 1 ? retry : CAMERA_RECORDING_LIMITS.retryMs;
  }

  get status(): Readonly<RecordingStatus> { return { ...this.#status }; }
  get ready(): boolean { return this.#source === 'saved-clips' ? this.#allowed() : !!this.#generation?.buffer.ready; }
  /** Suppress delayed provider clips whenever local recording motion owns capture. */
  get videoMotionActive(): boolean { return this.#source === 'continuous' && this.#allowed(); }
  get defersProviderMotion(): boolean { return this.#source === 'saved-clips' && this.#active && this.#cameraActive; }
  get source(): RecordingSource { return this.#source; }
  getHomeRecordingObservation(): HomeRecordingObservation {
    return { ...this.#home, triggerTypes: this.#home.triggerTypes ? [...this.#home.triggerTypes] : null,
      effectiveAudioActive: this.#audioActive };
  }

  getPolicySnapshot(): NativeClipPolicySnapshot {
    return { permission: { epoch: this.#permissionEpoch, recordingActive: this.#active && this.#source === 'saved-clips' && !this.#stopped,
      cameraActive: this.#cameraActive && this.#available && this.#sourceAvailable, audioActive: this.#audioActive,
      motionAllowed: this.#lastValidMotionAllowed === true },
    configuration: { revision: this.#configurationRevision,
      ...(this.#configuration ? { value: configurationCopy(this.#configuration) } : {}) } };
  }

  setRecordingSource(source: RecordingSource, available = true): void {
    if (source === this.#source && available === this.#sourceAvailable) return;
    this.#source = source; this.#sourceAvailable = available; this.#permissionEpoch++;
    this.#cancel(); this.#policyChanged(); this.#schedule();
  }

  deliverSavedClip(prepared: PreparedSavedClip, metadata: NativeClipDeliveryMetadata,
    policy: NativeClipPolicySnapshot, signal: globalThis.AbortSignal): Promise<NativeClipDeliveryResult> {
    if (this.#configuration && !this.#configuration.eventTriggerTypes.includes(1)) {
      return Promise.resolve({ status: 'not-offered', reason: 'unsupported-trigger-policy' });
    }
    if (this.#source !== 'saved-clips' || !this.#allowed() || this.#saved || this.#generation || signal.aborted || prepared.disposed) {
      return Promise.resolve({ status: 'not-offered', reason: 'busy' });
    }
    if (policy.permission.epoch !== this.#permissionEpoch || policy.configuration.revision !== this.#configurationRevision ||
        prepared.audioActive !== this.#audioActive || JSON.stringify(configurationCopy(prepared.configuration)) !== JSON.stringify(this.#configuration)) {
      return Promise.resolve({ status: 'not-offered', reason: 'configuration-changed' });
    }
    if (!this.#configuration!.eventTriggerTypes.includes(1) || !prepared.fragments.length ||
        prepared.preparedSpanUpperBoundUs <= 0n || prepared.preparedSpanUpperBoundUs > 92000000n || !this.options.replayMotion) {
      return Promise.resolve({ status: 'not-offered', reason: 'configuration-changed' });
    }
    return new Promise(resolve => {
      const event: SavedEvent = { prepared, metadata, epoch: this.#permissionEpoch, signal, resolve,
        cancel: () => this.#retireSaved(event, { status: 'uncertain' }, new Error('Recording unavailable')),
        started: false, finished: false, held: false, transportUncertain: false };
      this.#saved = event;
      signal.addEventListener('abort', event.cancel, { once: true });
      event.unopened = globalThis.setTimeout(() => this.#endSavedTransport(event), CAMERA_RECORDING_LIMITS.unopenedEventMs);
      event.hold = globalThis.setTimeout(() => {
        event.held = true;
        try { this.options.replayMotion?.(false, event.metadata); } catch { /* Motion observation cannot retain media. */ }
        if (event.transportUncertain) this.#retireSaved(event, { status: 'uncertain' });
        else if (event.acknowledgedAt) this.#retireSaved(event, { status: 'delivered', acknowledgedAt: event.acknowledgedAt });
      }, Number((prepared.preparedSpanUpperBoundUs + 999n) / 1000n));
      this.#setStatus({ state: 'recording' });
      try { this.options.replayMotion!(true, metadata); }
      catch { this.#retireSaved(event, { status: 'uncertain' }); }
    });
  }

  /** Transport cleanup does not shorten the planned replay-motion span. */
  #endSavedTransport(event: SavedEvent): void {
    if (this.#saved !== event || event.transportUncertain) return;
    event.transportUncertain = true; event.error = new Error('Recording unavailable');
    globalThis.clearTimeout(event.unopened); globalThis.clearTimeout(event.acknowledge);
    event.prepared.dispose();
    // Retain the owner abort listener and camera reservation through the hold.
    if (event.held) this.#retireSaved(event, { status: 'uncertain' });
  }

  #retireSaved(event: SavedEvent, result: NativeClipDeliveryResult, error?: Error): void {
    if (this.#saved !== event) return;
    this.#saved = undefined; event.error = error;
    globalThis.clearTimeout(event.unopened); globalThis.clearTimeout(event.acknowledge); globalThis.clearTimeout(event.hold);
    event.signal.removeEventListener('abort', event.cancel);
    if (!event.held) { try { this.options.replayMotion?.(false, event.metadata); } catch { /* Observer only. */ } }
    event.prepared.dispose(); event.resolve(result);
    this.#setStatus({ state: this.#allowed() ? 'ready' : 'off' });
  }

  async *#savedStream(event: SavedEvent, streamId: number): AsyncGenerator<RecordingPacket> {
    if (!Number.isSafeInteger(streamId) || streamId < 0 || event.started || event.transportUncertain || event.prepared.disposed || event.signal.aborted ||
        event.epoch !== this.#permissionEpoch || !this.#permissionAllowed()) throw new Error('Recording unavailable');
    event.started = true; event.streamId = streamId; globalThis.clearTimeout(event.unopened);
    const fragmentCount = event.prepared.fragments.length;
    try {
      yield { data: event.prepared.pin.initialization, isLast: false };
      for (let i = 0; i < fragmentCount; i++) {
        if (event.error) throw event.error;
        if (this.#saved !== event || !this.#permissionAllowed() || event.epoch !== this.#permissionEpoch) throw new Error('Recording unavailable');
        const fragment = event.prepared.fragments[i], last = i === fragmentCount - 1;
        if (last) {
          event.finished = true;
          event.acknowledge = globalThis.setTimeout(() => this.#endSavedTransport(event), CAMERA_RECORDING_LIMITS.acknowledgeMs);
        }
        yield { data: fragment.data, isLast: last };
      }
    } finally {
      if (!event.finished && this.#saved === event) this.#endSavedTransport(event);
    }
  }

  #policyChanged(): void { try { this.options.policyChanged?.(); } catch { /* Policy observer never owns capture. */ } }

  updateRecordingActive(value: unknown): void {
    const active = observedHomeBoolean(value); if (active === null) return;
    const first = this.#home.recordingActive !== active; this.#home.recordingActive = active;
    if (active === this.#active) { if (first) this.#policyChanged(); return; }
    this.#active = active;
    this.#permissionEpoch++; this.#policyChanged();
    if (!active) this.#cancel();
    this.#schedule();
  }
  updateRecordingConfiguration(configuration: CameraRecordingConfiguration | undefined): void {
    const before = JSON.stringify(this.#configuration);
    if (configuration === undefined) {
      this.#home.configuration = 'not-configured'; this.#home.triggerTypes = null;
      this.#configuration = undefined; if (this.#source === 'continuous') this.#cancel();
      if (!this.#saved) this.#setStatus({ state: 'off' });
    } else {
      try {
        this.#configuration = configurationCopy(configuration);
        this.#home.configuration = 'configured'; this.#home.triggerTypes = [...this.#configuration.eventTriggerTypes];
        const motion = this.#configuration.eventTriggerTypes.includes(1);
        if (this.#lastValidMotionAllowed !== null && motion !== this.#lastValidMotionAllowed) {
          this.#permissionEpoch++; if (!motion) this.#cancel();
        }
        this.#lastValidMotionAllowed = motion;
      }
      catch { this.#configuration = undefined; this.#home.configuration = 'invalid'; this.#home.triggerTypes = null;
        this.#cancel(); this.#setStatus({ state: 'fault', reason: 'invalid_configuration' });
        if (before !== undefined) this.#configurationRevision++; this.#policyChanged(); return; }
    }
    if (JSON.stringify(this.#configuration) !== before) this.#configurationRevision++;
    this.#policyChanged();
    this.#schedule();
  }
  setCameraActive(value: unknown): void {
    const active = observedHomeBoolean(value); if (active === null) return;
    const first = this.#home.cameraActive !== active; this.#home.cameraActive = active;
    if (active === this.#cameraActive) { if (first) this.#policyChanged(); return; }
    this.#cameraActive = active;
    this.#permissionEpoch++; this.#policyChanged();
    if (!active) this.#cancel();
    this.#schedule();
  }
  setAudioActive(value: unknown, pluginEnabled = true): void {
    const observed = observedHomeBoolean(value); if (observed === null) return;
    const first = this.#home.audioActive !== observed; this.#home.audioActive = observed;
    const active = observed && pluginEnabled;
    if (active === this.#audioActive) { if (first) this.#policyChanged(); return; }
    this.#audioActive = active;
    this.#permissionEpoch++; this.#policyChanged();
    // Revocation is immediate; newly permitted audio applies after an existing event.
    if (!active || this.#source === 'saved-clips') this.#cancel();
    this.#schedule();
  }
  setDeviceAvailable(available: boolean): void {
    if (available === this.#available) return;
    this.#available = available;
    this.#permissionEpoch++; this.#policyChanged();
    if (!available) this.#cancel();
    this.#schedule();
  }

  /** Pin before publishing the motion characteristic, so HDS cannot race capture. */
  notifyMotion(): boolean { return this.#notify(1); }
  notifyDoorbell(): boolean { return this.#notify(2); }
  #notify(trigger: 1 | 2): boolean {
    if (this.#source === 'saved-clips') return false;
    const generation = this.#generation;
    if (!this.#allowed() || !generation?.buffer.ready || !generation.configuration.eventTriggerTypes.includes(trigger)) return false;
    if (this.#event) {
      if (this.#event.finished) return false;
      this.#event.ended = false; this.#event.endAfterSequence = undefined;
      return true;
    }
    try {
      const event: Event = { generation, pin: generation.buffer.pin(), started: false, finished: false,
        cancelled: false, ended: false, waiters: new Set() };
      event.unopenedTimer = globalThis.setTimeout(() => {
        if (this.#event === event && !event.started) this.#releaseEvent(event);
      }, CAMERA_RECORDING_LIMITS.unopenedEventMs);
      this.#event = event;
      this.#setStatus({ state: 'recording' });
      return true;
    } catch { this.#fail(generation, 'buffer_exhausted'); return false; }
  }
  endMotion(): void {
    if (this.#source === 'saved-clips') return;
    const event = this.#event;
    if (!event || event.finished || event.ended) return;
    event.ended = true;
    // Include the fragment currently being captured, not only the last completed one.
    event.endAfterSequence = (event.generation.buffer.lastSequence ?? 0) + 1;
    this.#wake(event);
  }

  async *handleRecordingStreamRequest(streamId: number): AsyncGenerator<RecordingPacket> {
    if (this.#saved) { yield* this.#savedStream(this.#saved, streamId); return; }
    const event = this.#event;
    if (!Number.isSafeInteger(streamId) || streamId < 0 || !event || event.started || event.cancelled ||
        !this.#allowed() || event.generation !== this.#generation) throw new Error('Recording unavailable');
    event.started = true; event.streamId = streamId;
    globalThis.clearTimeout(event.unopenedTimer);
    let index = 0;
    try {
      yield { data: event.pin.initialization, isLast: false };
      for (;;) {
        if (event.error) throw event.error;
        if (event.cancelled || this.#event !== event || this.#generation !== event.generation || !this.#allowed()) return;
        const fragment = event.pin.fragments[index];
        if (!fragment) { await this.#wait(event); continue; }
        const last = event.ended && fragment.sequence >= (event.endAfterSequence ?? Number.MAX_SAFE_INTEGER);
        index++;
        if (last) {
          event.finished = true;
          event.acknowledgeTimer = globalThis.setTimeout(() => this.#releaseEvent(event), CAMERA_RECORDING_LIMITS.acknowledgeMs);
        }
        yield { data: fragment.data, isLast: last };
        if (last) return;
      }
    } finally {
      // Keep the last media packet retained until the hub acknowledges or closes it.
      if (!event.finished && this.#event === event) this.#releaseEvent(event);
    }
  }
  acknowledgeStream(streamId: number): void {
    const saved = this.#saved;
    if (saved?.finished && !saved.transportUncertain && saved.streamId === streamId) {
      saved.acknowledgedAt = new Date().toISOString(); globalThis.clearTimeout(saved.acknowledge);
      if (saved.held) this.#retireSaved(saved, { status: 'delivered', acknowledgedAt: saved.acknowledgedAt });
      return;
    }
    const event = this.#event;
    if (event?.started && event.finished && event.streamId === streamId) this.#releaseEvent(event);
  }
  closeRecordingStream(streamId: number, reason?: unknown): void {
    void reason;
    if (this.#saved?.streamId === streamId) {
      if (!this.#saved.acknowledgedAt) this.#endSavedTransport(this.#saved);
      return;
    }
    const event = this.#event;
    if (event?.started && event.streamId === streamId) this.#releaseEvent(event);
  }

  async stop(): Promise<void> {
    this.#stopped = true; this.#active = false;
    globalThis.clearTimeout(this.#retry); this.#retry = undefined;
    this.#cancel(); this.#setStatus({ state: 'off' });
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    try {
      await Promise.race([this.#retirement, new Promise<never>((_, reject) => {
        timer = globalThis.setTimeout(() => reject(new Error('Recording shutdown incomplete')), CAMERA_RECORDING_LIMITS.closeMs);
      })]);
    } catch { this.#setStatus({ state: 'fault', reason: 'shutdown_timeout' }); throw new Error('Recording shutdown incomplete'); }
    finally { globalThis.clearTimeout(timer); }
  }

  #permissionAllowed(): boolean { return !this.#stopped && this.#active && this.#cameraActive && this.#available && this.#sourceAvailable; }
  #allowed(): boolean { return this.#permissionAllowed() && !!this.#configuration; }
  #setStatus(status: RecordingStatus): void {
    if (this.#status.state === status.state && this.#status.reason === status.reason) return;
    this.#status = status;
    try { this.options.status?.({ ...status }); } catch { /* Observability never owns media. */ }
  }
  #schedule(): void {
    this.#operations = this.#operations.then(() => this.#reconcile()).catch(() => {
      const generation = this.#generation;
      if (generation) this.#fail(generation, 'capture_failed');
    });
  }
  async #reconcile(): Promise<void> {
    if (this.#source === 'saved-clips') {
      if (!this.#permissionAllowed()) this.#cancel();
      if (!this.#saved) this.#setStatus({ state: this.#allowed() ? 'ready' : 'off' });
      return;
    }
    if (!this.#allowed()) { this.#cancel(); this.#setStatus({ state: 'off' }); return; }
    if (this.#retry) return;
    const current = this.#generation;
    if (current && JSON.stringify(current.configuration) === JSON.stringify(this.#configuration) && current.audio === this.#audioActive) return;
    if (current && this.#event) return;
    if (current) this.#cancel();
    await this.#retirement;
    if (!this.#allowed() || this.#generation || this.#retry) return;
    const configuration = configurationCopy(this.#configuration!);
    const generation: Generation = { token: Symbol('recording'), configuration, audio: this.#audioActive,
      abort: new globalThis.AbortController(), buffer: new RecordingFragmentBuffer(this.#budget, undefined,
        configuration.mediaContainerConfiguration.fragmentLength), start: Promise.resolve(undefined) };
    this.#generation = generation; this.#setStatus({ state: 'warming' });
    generation.startupTimer = globalThis.setTimeout(() => this.#fail(generation, 'startup_timeout'), CAMERA_RECORDING_LIMITS.startupMs);
    generation.start = Promise.resolve().then(async () => {
      if (generation.abort.signal.aborted) return undefined;
      const session = await this.startSession(configurationCopy(configuration), generation.audio, {
        initialization: data => {
          if (this.#generation !== generation || generation.abort.signal.aborted) return;
          try { generation.buffer.initialize(data); }
          catch (error) { this.#fail(generation, error instanceof RecordingBufferError ? error.reason : 'invalid_media'); }
        },
        fragment: async fragment => {
          if (this.#generation !== generation || generation.abort.signal.aborted) throw new Error('Recording unavailable');
          try {
            generation.buffer.append(fragment);
            if (generation.buffer.ready) {
              globalThis.clearTimeout(generation.startupTimer);
              if (!this.#event) this.#setStatus({ state: 'ready' });
            }
            if (this.#event?.generation === generation) this.#wake(this.#event);
          } catch (error) {
            this.#fail(generation, error instanceof RecordingBufferError ? error.reason : 'invalid_media');
            throw new Error('Recording unavailable');
          }
        },
        motion: event => {
          if (this.#generation !== generation || generation.abort.signal.aborted || !this.#allowed() || !generation.buffer.ready) return;
          if (!Number.isSafeInteger(event.atUs) || event.atUs < 0 || !Number.isInteger(event.score) || event.score < 0 || event.score > 1000) {
            this.#fail(generation, 'invalid_media'); return;
          }
          try { this.options.videoMotion?.(); }
          catch { this.#fail(generation, 'capture_failed'); }
        },
        failed: () => this.#fail(generation, 'capture_failed'),
      }, generation.abort.signal);
      generation.session = session;
      void session.whenClosed.then(() => {
        if (this.#generation === generation && !generation.abort.signal.aborted) this.#fail(generation, 'discontinuity');
      }, () => this.#fail(generation, 'capture_failed'));
      return session;
    }).catch(() => { this.#fail(generation, 'capture_failed'); return undefined; });
  }
  #cancel(error?: Error): void {
    if (this.#saved) this.#retireSaved(this.#saved, { status: 'uncertain' }, error ?? new Error('Recording unavailable'));
    globalThis.clearTimeout(this.#retry); this.#retry = undefined;
    const event = this.#event;
    // HAP closes an interrupted recording when its generator throws. Returning
    // normally without isLast leaves a hub waiting for an end-of-stream marker.
    if (event) { event.error = error ?? new Error('Recording unavailable'); this.#releaseEvent(event, false); }
    const generation = this.#generation;
    if (!generation) return;
    this.#generation = undefined; generation.abort.abort();
    globalThis.clearTimeout(generation.startupTimer); generation.buffer.clear();
    const closeTimer = globalThis.setTimeout(() => this.#setStatus({ state: 'fault', reason: 'shutdown_timeout' }),
      CAMERA_RECORDING_LIMITS.closeMs);
    generation.retired = generation.start.then(async session => {
      if (session) {
        // stop() may fail or stall; only whenClosed is proof this owner released its capability.
        void Promise.resolve().then(() => session.stop()).catch(() => undefined);
        await session.whenClosed;
      }
    }).catch(() => undefined).finally(() => globalThis.clearTimeout(closeTimer));
    // Keep a timed-out owner reserved until actual closure; never start over it.
    this.#retirement = Promise.all([this.#retirement, generation.retired]).then(() => undefined);
  }
  #fail(generation: Generation, reason: RecordingFailure): void {
    if (this.#generation !== generation) return;
    this.#cancel(new Error('Recording unavailable'));
    this.#setStatus({ state: 'fault', reason });
    if (this.#allowed()) {
      this.#retry = globalThis.setTimeout(() => { this.#retry = undefined; this.#schedule(); }, this.#retryMs);
    }
  }
  #releaseEvent(event: Event, reconcile = true): void {
    if (this.#event !== event) return;
    this.#event = undefined; event.cancelled = true;
    globalThis.clearTimeout(event.unopenedTimer); globalThis.clearTimeout(event.acknowledgeTimer);
    event.pin.release(); this.#wake(event);
    if (reconcile) {
      if (this.#generation) this.#setStatus({ state: this.#generation.buffer.ready ? 'ready' : 'warming' });
      this.#schedule();
    }
  }
  #wake(event: Event): void { for (const wake of event.waiters) wake(); event.waiters.clear(); }
  #wait(event: Event): Promise<void> {
    return new Promise((resolve, reject) => {
      const finish = () => { globalThis.clearTimeout(timer); event.waiters.delete(finish); resolve(); };
      const timer = globalThis.setTimeout(() => {
        event.waiters.delete(finish); this.#fail(event.generation, 'recording_timeout'); reject(new Error('Recording unavailable'));
      }, event.generation.configuration.mediaContainerConfiguration.fragmentLength + 2000);
      event.waiters.add(finish);
    });
  }
}
