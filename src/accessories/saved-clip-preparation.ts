/** Finite MP4 ingress through the packaged private worker and canonical recording buffer. */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { CameraRecordingConfiguration } from 'homebridge';
import { PrivateMediaWorker, MEDIA_WORKER_LIMITS, type MediaWorkerCallbacks,
  type RecordingSourceSummary, type SourceVideoInfo } from './media-worker';
import { loadPackagedMediaWorker } from './media-worker-artifact';
import { RecordingBufferBudget, RecordingFragmentBuffer, RECORDING_BUFFER_LIMITS, sharedRecordingBufferBudget,
  type RecordingBufferPin, type RetainedRecordingFragment } from './recording-buffer';
import { recordingWorkerConfiguration } from './recording-session';

/** Borrowed input; the caller retains the original and owns filesystem admission. */
export interface SavedClipSource { bytes: Buffer; expectedBytes: number; expectedSha256: string; }
export type SavedClipMediaWorker = Pick<PrivateMediaWorker, 'whenReady' | 'whenMediaDrained' | 'whenClosed' | 'failed' |
  'configureRecording' | 'media' | 'endMedia' | 'finishInput' | 'stop'>;
/** Explicit test/host qualification injection; normal use always loads the verified package artifact. */
export type SavedClipWorkerFactory = (callbacks: MediaWorkerCallbacks) => SavedClipMediaWorker;
export interface SavedClipPreparationOptions { budget?: RecordingBufferBudget; workerFactory?: SavedClipWorkerFactory; }
export interface PreparedSavedClip {
  readonly buffer: RecordingFragmentBuffer;
  readonly pin: RecordingBufferPin;
  readonly fragments: readonly RetainedRecordingFragment[];
  readonly configuration: CameraRecordingConfiguration;
  readonly audioActive: boolean;
  readonly sourceInfo: Readonly<SourceVideoInfo>;
  readonly summary: Readonly<RecordingSourceSummary>;
  readonly sourceSha256: string;
  readonly preparedSha256: string;
  /** Conservative native timeline bound, including possible AAC padding; not exact container duration. */
  readonly preparedSpanUpperBoundUs: bigint;
  readonly disposed: boolean;
  dispose(): void;
}

/** Both source copies and retained output count once against camera and shared bounds. */
class PreparationBudget extends RecordingBufferBudget {
  constructor(private readonly aggregate: RecordingBufferBudget) { super(RECORDING_BUFFER_LIMITS.cameraBytes); }
  override reserve(bytes: number): void {
    super.reserve(bytes);
    try { this.aggregate.reserve(bytes); }
    catch (error) { super.release(bytes); throw error; }
  }
  override release(bytes: number): void { super.release(bytes); this.aggregate.release(bytes); }
}

function snapshot(configuration: CameraRecordingConfiguration): CameraRecordingConfiguration {
  const copied: CameraRecordingConfiguration = {
    prebufferLength: configuration.prebufferLength, eventTriggerTypes: [...configuration.eventTriggerTypes],
    mediaContainerConfiguration: { ...configuration.mediaContainerConfiguration },
    videoCodec: { ...configuration.videoCodec, parameters: { ...configuration.videoCodec.parameters },
      resolution: [...configuration.videoCodec.resolution] }, audioCodec: { ...configuration.audioCodec },
  };
  Object.freeze(copied.eventTriggerTypes); Object.freeze(copied.mediaContainerConfiguration);
  Object.freeze(copied.videoCodec.resolution); Object.freeze(copied.videoCodec.parameters);
  Object.freeze(copied.videoCodec); Object.freeze(copied.audioCodec); return Object.freeze(copied);
}

function validSummary(value: RecordingSourceSummary, audioRate: number): boolean {
  return value.inputFormat === 'mp4' &&
    [value.decodedVideoFrames, value.selectedVideoFrames, value.encodedVideoFrames, value.generatedAudioSamples,
      value.audioRate, value.preparedSpanUpperBoundUs].every(Number.isSafeInteger) &&
    value.decodedVideoFrames > 0 && value.decodedVideoFrames <= 9000 && value.selectedVideoFrames > 0 &&
    value.selectedVideoFrames <= value.decodedVideoFrames && value.encodedVideoFrames === value.selectedVideoFrames &&
    value.audioRate === audioRate && value.generatedAudioSamples >= 0 && value.generatedAudioSamples <= 2 * audioRate &&
    value.preparedSpanUpperBoundUs > 0 && value.preparedSpanUpperBoundUs <= 92000000;
}

function validSourceInfo(info: SourceVideoInfo): boolean {
  return [info.width, info.height, info.fpsNumerator, info.fpsDenominator].every(Number.isSafeInteger) &&
    info.width > 0 && info.width <= 4096 && info.height > 0 && info.height <= 4096 && info.width * info.height <= 8388608 &&
    info.fpsNumerator >= 0 && info.fpsNumerator <= 0x7fffffff && info.fpsDenominator > 0 && info.fpsDenominator <= 0x7fffffff &&
    info.fpsNumerator <= 120 * info.fpsDenominator && (info.fpsNumerator !== 0 || info.fpsDenominator === 1);
}

/** Preparation publishes no motion. Its complete bundle is the later delegate's admission unit. */
export async function prepareSavedClip(
  source: SavedClipSource,
  configuration: CameraRecordingConfiguration,
  audioActive: boolean,
  signal: globalThis.AbortSignal,
  options: SavedClipPreparationOptions = {},
): Promise<PreparedSavedClip> {
  const lease = new PreparationBudget(options.budget ?? sharedRecordingBufferBudget);
  const buffer = new RecordingFragmentBuffer(lease);
  let owned: Buffer | undefined, worker: SavedClipMediaWorker | undefined;
  let active = true, disposed = false, draining = false, succeeded = false;
  let pin: RecordingBufferPin | undefined, sourceInfo: SourceVideoInfo | undefined, summary: RecordingSourceSummary | undefined;
  const releaseSource = (): void => {
    if (!owned) return;
    const data = owned; owned = undefined; data.fill(0); lease.release(data.length);
  };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true; active = false; signal.removeEventListener('abort', cancel);
    releaseSource(); buffer.clear();
  };
  let rejectAbort!: (reason: Error) => void;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  aborted.catch(() => undefined);
  const cancel = (): void => { dispose(); rejectAbort(new Error('Saved clip preparation cancelled')); void worker?.stop(); };
  const guard = (): void => { signal.throwIfAborted(); if (!active) throw new Error('Saved clip preparation retired'); };
  const wait = <T>(pending: Promise<T>): Promise<T> => Promise.race([pending, aborted]);
  signal.addEventListener('abort', cancel, { once: true });
  try {
    guard();
    if (!source || !Buffer.isBuffer(source.bytes) || !source.bytes.length || source.bytes.length > MEDIA_WORKER_LIMITS.finiteInputBytes ||
        !Number.isSafeInteger(source.expectedBytes) || source.expectedBytes !== source.bytes.length ||
        typeof source.expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.expectedSha256)) {
      throw new Error('Saved clip source unavailable');
    }
    lease.reserve(source.bytes.length);
    try { owned = Buffer.from(source.bytes); } catch (error) { lease.release(source.bytes.length); throw error; }
    const sourceSha256 = createHash('sha256').update(owned).digest('hex');
    if (sourceSha256 !== source.expectedSha256) throw new Error('Saved clip source unavailable');
    const selected = snapshot(configuration), nativeConfiguration = recordingWorkerConfiguration(selected, audioActive);
    worker = (options.workerFactory ?? (callbacks => {
      // eslint-disable-next-line no-undef -- Published CommonJS module.
      return new PrivateMediaWorker(loadPackagedMediaWorker(resolve(__dirname, '../..')), callbacks);
    }))({
      sourceInfo: info => {
        guard();
        if (!draining || sourceInfo || !validSourceInfo(info)) throw new Error('Saved clip source metadata unavailable');
        sourceInfo = { ...info };
      },
      recordingInit: async data => { guard(); if (!draining) throw new Error('Unexpected saved clip output'); buffer.initialize(data); },
      recordingFragment: async fragment => {
        guard(); if (!draining) throw new Error('Unexpected saved clip output');
        buffer.append({ sequence: fragment.sequence, startUs: BigInt(fragment.startUs), durationUs: BigInt(fragment.durationUs),
          keyframe: fragment.keyframeStart, data: fragment.data });
        // Pin immediately on readiness: the next rolling append may otherwise erase the beginning.
        if (!pin && buffer.ready) pin = buffer.pin();
      },
      recordingSummary: value => {
        guard();
        if (!draining || summary || !validSummary(value, nativeConfiguration.audioRate)) throw new Error('Saved clip summary unavailable');
        summary = { ...value };
      },
    });
    await wait(worker.configureRecording({ ...nativeConfiguration, inputFormat: 'mp4', audioTailPolicy: audioActive ? 'pad-bounded' : 'strict' }));
    await wait(worker.whenReady); guard();
    for (let offset = 0; offset < owned.length; offset += MEDIA_WORKER_LIMITS.inputBytes) {
      guard(); await wait(worker.media(owned.subarray(offset, offset + MEDIA_WORKER_LIMITS.inputBytes)));
    }
    // Native MP4 input credit proves it owns every byte. Erase only our copy before decode/output starts.
    releaseSource(); draining = true;
    await wait(worker.endMedia()); await wait(worker.whenMediaDrained); guard();
    if (worker.failed || !sourceInfo || !summary) throw new Error('Saved clip media unavailable');
    pin = buffer.sealFinite();
    const digest = createHash('sha256').update(pin.initialization);
    for (const fragment of pin.fragments) digest.update(fragment.data);
    const preparedSha256 = digest.digest('hex');
    await wait(worker.finishInput()); guard();
    if (worker.failed) throw new Error('Saved clip media unavailable');
    active = false;
    const prepared = Object.freeze({ buffer, pin, fragments: pin.fragments, configuration: selected, audioActive,
      sourceInfo: Object.freeze(sourceInfo), summary: Object.freeze(summary), sourceSha256, preparedSha256,
      preparedSpanUpperBoundUs: BigInt(summary.preparedSpanUpperBoundUs), get disposed() { return disposed; }, dispose });
    succeeded = true;
    return prepared;
  } catch {
    throw new Error('Saved clip preparation unavailable');
  } finally {
    if (!succeeded) { dispose(); await worker?.stop(); }
  }
}
