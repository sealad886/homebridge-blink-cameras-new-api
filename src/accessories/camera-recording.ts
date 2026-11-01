import { Buffer } from 'node:buffer';
import type { CameraRecordingConfiguration, CameraRecordingDelegate, CameraRecordingOptions, RecordingPacket } from 'homebridge';
import type { VideoMotionEvent } from './media-worker';
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

/** Owns one continuously buffered generation and one bounded, pinned recording event. */
export class BlinkCameraRecordingDelegate implements CameraRecordingDelegate {
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
  readonly #budget: RecordingBufferBudget;
  readonly #retryMs: number;

  constructor(private readonly startSession: StartRecordingSession, private readonly options: CameraRecordingDelegateOptions = {}) {
    this.#budget = options.budget ?? sharedRecordingBufferBudget;
    const retry = options.retryMs ?? CAMERA_RECORDING_LIMITS.retryMs;
    this.#retryMs = Number.isInteger(retry) && retry >= 1 ? retry : CAMERA_RECORDING_LIMITS.retryMs;
  }

  get status(): Readonly<RecordingStatus> { return { ...this.#status }; }
  get ready(): boolean { return !!this.#generation?.buffer.ready; }
  /** Suppress delayed provider clips whenever local recording motion owns capture. */
  get videoMotionActive(): boolean { return this.#allowed(); }

  updateRecordingActive(active: boolean): void {
    this.#active = active;
    if (!active) this.#cancel();
    this.#schedule();
  }
  updateRecordingConfiguration(configuration: CameraRecordingConfiguration | undefined): void {
    if (configuration === undefined) {
      this.#configuration = undefined; this.#cancel(); this.#setStatus({ state: 'off' });
    } else {
      try { this.#configuration = configurationCopy(configuration); }
      catch { this.#configuration = undefined; this.#cancel(); this.#setStatus({ state: 'fault', reason: 'invalid_configuration' }); return; }
    }
    this.#schedule();
  }
  setCameraActive(active: boolean): void {
    if (active === this.#cameraActive) return;
    this.#cameraActive = active;
    if (!active) this.#cancel();
    this.#schedule();
  }
  setAudioActive(active: boolean): void {
    if (active === this.#audioActive) return;
    this.#audioActive = active;
    // Revocation is immediate; newly permitted audio applies after an existing event.
    if (!active) this.#cancel();
    this.#schedule();
  }
  setDeviceAvailable(available: boolean): void {
    if (available === this.#available) return;
    this.#available = available;
    if (!available) this.#cancel();
    this.#schedule();
  }

  /** Pin before publishing the motion characteristic, so HDS cannot race capture. */
  notifyMotion(): boolean { return this.#notify(1); }
  notifyDoorbell(): boolean { return this.#notify(2); }
  #notify(trigger: 1 | 2): boolean {
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
    const event = this.#event;
    if (!event || event.finished || event.ended) return;
    event.ended = true;
    // Include the fragment currently being captured, not only the last completed one.
    event.endAfterSequence = (event.generation.buffer.lastSequence ?? 0) + 1;
    this.#wake(event);
  }

  async *handleRecordingStreamRequest(streamId: number): AsyncGenerator<RecordingPacket> {
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
    const event = this.#event;
    if (event?.started && event.finished && event.streamId === streamId) this.#releaseEvent(event);
  }
  closeRecordingStream(streamId: number, reason?: unknown): void {
    void reason;
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

  #allowed(): boolean { return !this.#stopped && this.#active && this.#cameraActive && this.#available && !!this.#configuration; }
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
