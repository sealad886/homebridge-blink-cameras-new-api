/** HAP0.14 finite-file recording delivery, independent of Blink acquisition. */
import { Buffer } from 'node:buffer';
import type { CameraRecordingConfiguration, CameraRecordingDelegate, HDSProtocolSpecificErrorReason, RecordingPacket } from 'homebridge';
import { prepareNativeRecording, snapshotNativeRecordingConfiguration, type NativeRecordingPreparationOptions,
  type NativeRecordingSource, type PreparedNativeRecording } from './native-recording-preparation';

export interface NativeRecordingDeliveryMetadata {
  logFlow?: string;
  jobId: string;
  clipIdentity: string;
  capturedAt: string;
  /** Capture before acquisition, not after a delayed download finishes. */
  policyEpoch: number;
}
export interface NativeRecordingPolicy {
  epoch: number;
  configurationRevision: number;
  recordingActive: boolean;
  cameraActive: boolean;
  audioActive: boolean;
  configured: boolean;
  allowed: boolean;
}
export type NativeRecordingOfferResult = { status: 'ready' } | { status: 'uncertain'; reason: 'motion-publication-failed' | 'policy-changed-after-offer' } |
  { status: 'not-offered'; reason: 'disabled' | 'busy' | 'duplicate' | 'policy-changed' | 'preparation-failed' };
export type NativeRecordingDeliveryOutcome = 'request-rejected' | 'requested' | 'transfer-finished' | 'transport-acknowledged' | 'closed' | 'cancelled' | 'not-requested' | 'uncertain';
export interface NativeRecordingDeliveryEvent { metadata?: NativeRecordingDeliveryMetadata; outcome: NativeRecordingDeliveryOutcome; }
export interface NativeRecordingDelegateOptions {
  preparation: NativeRecordingPreparationOptions;
  /** Internal HSV trigger only. Do not feed this signal back into provider acquisition. */
  readyMotion(active: boolean): void;
  policyChanged?(policy: NativeRecordingPolicy): void | Promise<void>;
  deliveryOutcome?(event: NativeRecordingDeliveryEvent): void | Promise<void>;
  offerTimeoutMs?: number;
  acknowledgementTimeoutMs?: number;
  /** Explicit local-media test/qualification injection. Normal use runs the finite converter. */
  prepare?: typeof prepareNativeRecording;
}
interface Offer {
  metadata: NativeRecordingDeliveryMetadata;
  prepared: PreparedNativeRecording;
  epoch: number;
  revision: number;
  current?: () => boolean;
}
interface RecordingStream extends Offer {
  streamId: number;
  owner: globalThis.AbortController;
  closed: boolean;
  finalSent: boolean;
  generatorFinished: boolean;
}

function wait(milliseconds: number, signal: globalThis.AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('Recording wait cancelled'));
  return new Promise((resolve, reject) => {
    const cancel = () => { globalThis.clearTimeout(timer); reject(new Error('Recording wait cancelled')); };
    const timer = globalThis.setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, milliseconds);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

/** One prepared/active clip per camera. The caller owns any downloaded-file backlog. */
export class NativeRecordingDelegate implements CameraRecordingDelegate {
  private recordingActive = false;
  private cameraActive = true;
  private audioActive = false;
  private configuration?: CameraRecordingConfiguration;
  private configurationRevision = 0;
  private epoch = 0;
  private stopped = false;
  private motion = false;
  private preparing?: { owner: globalThis.AbortController; done: Promise<NativeRecordingOfferResult> };
  private ready?: Offer;
  private stream?: RecordingStream;
  private offerTimer?: ReturnType<typeof globalThis.setTimeout>;
  private acknowledgementTimer?: ReturnType<typeof globalThis.setTimeout>;
  private readonly offered = new Set<string>();
  private readonly offerTimeout: number;
  private readonly acknowledgementTimeout: number;

  constructor(private readonly options: NativeRecordingDelegateOptions) {
    this.offerTimeout = options.offerTimeoutMs ?? 30000;
    this.acknowledgementTimeout = options.acknowledgementTimeoutMs ?? 15000;
    if (typeof options.readyMotion !== 'function' || ![this.offerTimeout, this.acknowledgementTimeout]
      .every(value => Number.isInteger(value) && value >= 1000 && value <= 120000)) throw new Error('Invalid finite recording delivery options');
  }

  get policy(): NativeRecordingPolicy {
    return { epoch: this.epoch, configurationRevision: this.configurationRevision, recordingActive: this.recordingActive,
      cameraActive: this.cameraActive, audioActive: this.audioActive, configured: !!this.configuration,
      allowed: !this.stopped && this.recordingActive && this.cameraActive && !!this.configuration };
  }
  get available(): boolean { return this.policy.allowed && !this.preparing && !this.ready && !this.stream; }
  snapshot(): { policy: NativeRecordingPolicy; state: 'stopped' | 'disabled' | 'idle' | 'preparing' | 'ready' | 'streaming' | 'awaiting-ack'; bytes: number } {
    return { policy: this.policy,
      state: this.stopped ? 'stopped' : !this.policy.allowed ? 'disabled' : this.preparing ? 'preparing' : this.ready ? 'ready' :
        this.stream ? this.stream.generatorFinished ? 'awaiting-ack' : 'streaming' : 'idle',
      bytes: this.ready?.prepared.bytes ?? this.stream?.prepared.bytes ?? 0 };
  }

  updateRecordingActive(active: boolean): void {
    if (this.recordingActive === active || this.stopped) return;
    this.recordingActive = active; this.epoch++;
    this.cancelPending();
    if (!active) this.cancelStream();
    this.notifyPolicy();
  }
  updateCameraActive(active: boolean): void {
    if (this.cameraActive === active || this.stopped) return;
    this.cameraActive = active; this.epoch++;
    this.cancelPending();
    if (!active) this.cancelStream();
    this.notifyPolicy();
  }
  updateRecordingAudioActive(active: boolean): void {
    if (this.audioActive === active || this.stopped) return;
    this.audioActive = active; this.epoch++;
    this.cancelPending();
    if (!active && this.stream?.prepared.audioActive) this.cancelStream();
    this.notifyPolicy();
  }
  updateRecordingConfiguration(configuration: CameraRecordingConfiguration | undefined): void {
    if (this.stopped) return;
    let selected: CameraRecordingConfiguration | undefined;
    try { selected = configuration ? snapshotNativeRecordingConfiguration(configuration) : undefined; }
    catch { selected = undefined; }
    if (JSON.stringify(selected) === JSON.stringify(this.configuration)) return;
    this.configuration = selected; this.configurationRevision++;
    this.cancelPending();
    if (!selected) { this.epoch++; this.cancelStream(); }
    // Ordinary changes apply to the next stream; the current stream owns its snapshot.
    this.notifyPolicy();
  }

  async offerDownloaded(source: NativeRecordingSource, metadata: NativeRecordingDeliveryMetadata,
    current?: () => boolean): Promise<NativeRecordingOfferResult> {
    if (!this.policy.allowed) return { status: 'not-offered', reason: 'disabled' };
    if (!this.isCurrent(current)) return { status: 'not-offered', reason: 'policy-changed' };
    if (!metadata || !metadata.jobId || metadata.jobId.length > 256 || !metadata.clipIdentity || metadata.clipIdentity.length > 1024 ||
        !Number.isFinite(Date.parse(metadata.capturedAt)) || metadata.policyEpoch !== this.epoch) return { status: 'not-offered', reason: 'policy-changed' };
    if (this.offered.has(metadata.clipIdentity)) return { status: 'not-offered', reason: 'duplicate' };
    if (!this.available) return { status: 'not-offered', reason: 'busy' };
    const owner = new globalThis.AbortController(), epoch = this.epoch, revision = this.configurationRevision;
    const selected = this.configuration!, audioActive = this.audioActive;
    const detached = Object.freeze({ ...metadata });
    const run = (async (): Promise<NativeRecordingOfferResult> => {
      let prepared: PreparedNativeRecording | undefined;
      try {
        prepared = await (this.options.prepare ?? prepareNativeRecording)(source, selected, audioActive, owner.signal, this.options.preparation);
        if (owner.signal.aborted || !this.policy.allowed || epoch !== this.epoch || revision !== this.configurationRevision
          || prepared.disposed || !this.isCurrent(current)) {
          prepared.dispose(); return { status: 'not-offered', reason: 'policy-changed' };
        }
        const offered: Offer = { metadata: detached, prepared, epoch, revision, current };
        this.ready = offered;
        this.offered.add(detached.clipIdentity);
        while (this.offered.size > 128) this.offered.delete(this.offered.values().next().value!);
        try { this.setMotion(true); }
        catch {
          const offer = this.ready; this.ready = undefined;
          if (offer) { offer.prepared.dispose(); this.report(offer, 'uncertain'); }
          this.setMotionSafely(false);
          return { status: 'uncertain', reason: 'motion-publication-failed' };
        }
        if (!this.isCurrent(current)) {
          this.cancelPending(); this.cancelStream();
          return { status: 'uncertain', reason: 'policy-changed-after-offer' };
        }
        if (this.ready !== offered && this.stream?.prepared !== prepared) return { status: 'uncertain', reason: 'policy-changed-after-offer' };
        if (this.ready === offered) {
          const timer = globalThis.setTimeout(() => {
            if (this.offerTimer === timer) this.offerTimer = undefined;
            if (this.ready !== offered) return;
            this.ready = undefined; offered.prepared.dispose(); this.setMotionSafely(false); this.report(offered, 'not-requested');
          }, this.offerTimeout);
          this.offerTimer = timer;
        }
        return { status: 'ready' };
      } catch {
        prepared?.dispose();
        return { status: 'not-offered', reason: owner.signal.aborted ? 'policy-changed' : 'preparation-failed' };
      }
    })();
    this.preparing = { owner, done: run };
    try { return await run; }
    finally { if (this.preparing?.owner === owner) this.preparing = undefined; }
  }

  async *handleRecordingStreamRequest(streamId: number): AsyncGenerator<RecordingPacket> {
    const offer = this.ready;
    const current = offer && this.isCurrent(offer.current);
    if (!this.policy.allowed || !offer || !current || this.stream || offer.epoch !== this.epoch
      || offer.revision !== this.configurationRevision || offer.prepared.disposed) {
      if (offer && !current) this.cancelPending();
      this.report(offer, 'request-rejected');
      throw new Error('No permitted prepared native recording is available');
    }
    this.ready = undefined;
    if (this.offerTimer) globalThis.clearTimeout(this.offerTimer);
    this.offerTimer = undefined;
    const stream: RecordingStream = { ...offer, streamId, owner: new globalThis.AbortController(), closed: false, finalSent: false, generatorFinished: false };
    this.stream = stream;
    this.report(stream, 'requested');
    const startedAt = Date.now();
    const allowed = () => !this.stopped && this.recordingActive && this.cameraActive && (!stream.prepared.audioActive || this.audioActive)
      && this.isCurrent(stream.current);
    try {
      yield { data: Buffer.from(stream.prepared.initialization), isLast: false };
      for (let index = 0; index < stream.prepared.fragments.length; index++) {
        const fragment = stream.prepared.fragments[index];
        const delay = startedAt + fragment.startMs - Date.now();
        if (delay > 0 && !stream.owner.signal.aborted) {
          try { await wait(delay, stream.owner.signal); } catch { /* Closing and policy checks below decide the outcome. */ }
        }
        if (stream.closed) return;
        if (!allowed() || stream.owner.signal.aborted || stream.prepared.disposed) throw new Error('Native recording permission was revoked');
        const isLast = index === stream.prepared.fragments.length - 1;
        if (isLast) stream.finalSent = true;
        yield { data: Buffer.from(fragment.data), isLast };
      }
    } finally {
      stream.generatorFinished = true;
      if (this.stream === stream) {
        this.setMotionSafely(false);
        if (!stream.finalSent) this.finishStream(stream, stream.closed ? 'closed' : 'uncertain');
        else {
          this.report(stream, 'transfer-finished');
          this.acknowledgementTimer = globalThis.setTimeout(() => this.finishStream(stream, 'uncertain'), this.acknowledgementTimeout);
        }
      }
    }
  }

  acknowledgeStream(streamId: number): void {
    const stream = this.stream;
    if (stream?.streamId === streamId && stream.finalSent) this.finishStream(stream, 'transport-acknowledged');
  }
  closeRecordingStream(streamId: number, reason: HDSProtocolSpecificErrorReason | undefined): void {
    const stream = this.stream;
    if (!stream || stream.streamId !== streamId) return;
    stream.closed = true; this.finishStream(stream, reason === 0 ? 'closed' : 'uncertain');
  }

  /** Retire one runtime's media without changing HomeKit's explicit configuration or privacy choices. */
  async invalidateDelivery(): Promise<void> {
    this.epoch++;
    const pending = this.preparing?.done;
    this.cancelPending(); this.cancelStream();
    await pending;
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true; this.recordingActive = false;
    await this.invalidateDelivery();
    this.notifyPolicy();
  }

  private cancelPending(): void {
    this.preparing?.owner.abort();
    if (this.offerTimer) globalThis.clearTimeout(this.offerTimer);
    this.offerTimer = undefined;
    const offer = this.ready; this.ready = undefined;
    if (offer) { offer.prepared.dispose(); this.setMotionSafely(false); this.report(offer, 'cancelled'); }
  }
  private isCurrent(current?: () => boolean): boolean {
    try { return current?.() ?? true; }
    catch { return false; }
  }
  private cancelStream(): void {
    const stream = this.stream;
    if (stream) this.finishStream(stream, 'cancelled');
  }
  private finishStream(stream: RecordingStream, outcome: NativeRecordingDeliveryOutcome): void {
    if (this.stream !== stream) return;
    this.stream = undefined; stream.owner.abort();
    if (this.acknowledgementTimer) globalThis.clearTimeout(this.acknowledgementTimer);
    this.acknowledgementTimer = undefined;
    stream.prepared.dispose(); this.setMotionSafely(false); this.report(stream, outcome);
  }
  private setMotion(active: boolean): void {
    if (this.motion === active) return;
    this.motion = active; this.options.readyMotion(active);
  }
  private setMotionSafely(active: boolean): void { try { this.setMotion(active); } catch { /* Media still retires if a HAP observer fails. */ } }
  private notifyPolicy(): void {
    try { void Promise.resolve(this.options.policyChanged?.(this.policy)).catch(() => undefined); }
    catch { /* Local privacy fences are already applied. */ }
  }
  private report(offer: Offer | undefined, outcome: NativeRecordingDeliveryOutcome): void {
    try { void Promise.resolve(this.options.deliveryOutcome?.({ metadata: offer?.metadata, outcome })).catch(() => undefined); }
    catch { /* Observers cannot retain media resources. */ }
  }
}
