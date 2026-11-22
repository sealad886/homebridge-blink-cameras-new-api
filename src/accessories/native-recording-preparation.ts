/** Finite local MP4 preparation. This module has no provider or live-view transport. */
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import type { CameraRecordingConfiguration } from 'homebridge';
import { loadPackagedProtectionWorker } from './protection-worker-artifact';
import { probeExternalFfmpeg, resolveExternalFfmpegPath, ExternalFfmpegSetupError } from './external-ffmpeg';
import { convertExternalRecording, inspectExternalRecording, validateExternalRecording, ExternalRecordingError,
  isRecordingFailureCode, type RecordingFailureCode } from './external-recording';
export { isRecordingFailureCode } from './external-recording';

const PREPARATION_PHASES = ['admission', 'configuration', 'input', 'output', 'closure', 'validation'] as const;
type PreparationPhase = typeof PREPARATION_PHASES[number];
export function isNativeRecordingPreparationPhase(value: unknown): value is PreparationPhase {
  return PREPARATION_PHASES.some(phase => value === phase);
}

export interface NativeRecordingPreparationDiagnostic {
  phase: PreparationPhase;
  workerCode?: RecordingFailureCode;
  salvageAttempted?: true;
  deadlineExceeded?: true;
}
export interface NativeRecordingRecovery {
  readonly flags: number;
  readonly attempts: 1 | 2;
  readonly initialWorkerCode?: RecordingFailureCode;
}
export class NativeRecordingPreparationError extends Error {
  readonly diagnostic: Readonly<NativeRecordingPreparationDiagnostic>;
  constructor(diagnostic: NativeRecordingPreparationDiagnostic) {
    if (!isNativeRecordingPreparationPhase(diagnostic.phase) ||
        (diagnostic.workerCode !== undefined && !isRecordingFailureCode(diagnostic.workerCode)) ||
        (diagnostic.salvageAttempted !== undefined && diagnostic.salvageAttempted !== true) ||
        (diagnostic.deadlineExceeded !== undefined && diagnostic.deadlineExceeded !== true)) {
      throw new Error('Invalid recording preparation diagnostic');
    }
    super(`Recording conversion failed during ${diagnostic.phase}`);
    this.diagnostic = Object.freeze({ phase: diagnostic.phase,
      ...(diagnostic.workerCode ? { workerCode: diagnostic.workerCode } : {}),
      ...(diagnostic.salvageAttempted ? { salvageAttempted: true } : {}),
      ...(diagnostic.deadlineExceeded ? { deadlineExceeded: true } : {}) });
  }
}

export const NATIVE_RECORDING_MEDIA_LIMITS = Object.freeze({
  sourceBytes: 32 * 1024 * 1024,
  outputBytes: 32 * 1024 * 1024,
  memoryBytes: 64 * 1024 * 1024,
  initializationBytes: 1024 * 1024,
  fragmentBytes: 8 * 1024 * 1024,
  fragments: 512,
  durationMs: 90_000,
  preparationMs: 120_000,
});

/** The caller owns the source file and its eventual removal. */
export interface NativeRecordingSource { filePath: string; expectedBytes: number; expectedSha256: string; }
export interface NativeRecordingFragment { readonly data: Buffer; readonly startMs: number; readonly durationMs: number; }
export interface PreparedNativeRecording {
  readonly initialization: Buffer;
  readonly fragments: readonly NativeRecordingFragment[];
  readonly configuration: CameraRecordingConfiguration;
  readonly audioActive: boolean;
  readonly bytes: number;
  readonly durationMs: number;
  readonly sourceSha256: string;
  readonly preparedSha256: string;
  readonly disposed: boolean;
  readonly recovery?: Readonly<NativeRecordingRecovery>;
  dispose(): void;
}

/** Retained output and temporary concatenation copies share this explicit bound. */
export class NativeRecordingMemoryBudget {
  private used = 0;
  constructor(readonly maximum = NATIVE_RECORDING_MEDIA_LIMITS.memoryBytes) {
    if (!Number.isSafeInteger(maximum) || maximum < 1) throw new Error('Invalid recording memory bound');
  }
  get bytes(): number { return this.used; }
  reserve(bytes: number): void {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || this.used + bytes > this.maximum) throw new Error('Recording memory exhausted');
    this.used += bytes;
  }
  release(bytes: number): void {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > this.used) throw new Error('Recording memory accounting failed');
    this.used -= bytes;
  }
}
const sharedMemory = new NativeRecordingMemoryBudget();
export interface NativeRecordingPreparationOptions {
  /** Configured executable name or absolute path, resolved lazily when recording actually starts. */
  ffmpegPath?: string;
  /** One shared local conversion admission gate across all cameras. */
  admit<T>(work: () => Promise<T>, signal: globalThis.AbortSignal): Promise<T>;
  memory?: NativeRecordingMemoryBudget;
  timeoutMs?: number;
}

export function snapshotNativeRecordingConfiguration(value: CameraRecordingConfiguration): CameraRecordingConfiguration {
  const copy = globalThis.structuredClone(value);
  const video = copy?.videoCodec;
  const [width, height, fps] = video?.resolution ?? [];
  const profile = video?.parameters?.profile, level = video?.parameters?.level;
  const fragment = copy?.mediaContainerConfiguration?.fragmentLength;
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  const levelBounds = [[3600, 108000], [5120, 216000], [8192, 245760]][level];
  if (copy?.mediaContainerConfiguration?.type !== 0 || video?.type !== 0 ||
      ![width, height, fps, fragment, video?.parameters?.bitRate, video?.parameters?.iFrameInterval].every(Number.isInteger) ||
      width < 16 || width > 1920 || height < 16 || height > 1080 || width % 2 || height % 2 ||
      ![15, 24, 30].includes(fps) || ![0, 1, 2].includes(profile) || !levelBounds ||
      macroblocks > levelBounds[0] || macroblocks * fps > levelBounds[1] ||
      fragment < 1000 || fragment > 4000 || video.parameters.iFrameInterval < 1000 || video.parameters.iFrameInterval > 4000 ||
      video.parameters.bitRate < 16 || video.parameters.bitRate > 8000 ||
      !Array.isArray(copy.eventTriggerTypes) || !copy.eventTriggerTypes.includes(1)) {
    throw new Error('Unsupported native recording configuration');
  }
  Object.freeze(copy.eventTriggerTypes); Object.freeze(copy.mediaContainerConfiguration);
  Object.freeze(copy.videoCodec.parameters); Object.freeze(copy.videoCodec.resolution); Object.freeze(copy.videoCodec);
  Object.freeze(copy.audioCodec); return Object.freeze(copy);
}

interface Box { type: string; start: number; end: number; payload: number; }
function boxes(data: Buffer, start = 0, end = data.length): Box[] {
  const result: Box[] = [];
  for (let offset = start; offset < end;) {
    if (result.length >= 2048) throw new Error('Recording box count exceeded');
    if (end - offset < 8) throw new Error('Truncated recording box');
    let size = data.readUInt32BE(offset), header = 8;
    if (size === 1) {
      if (end - offset < 16) throw new Error('Truncated recording box');
      const large = data.readBigUInt64BE(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Oversized recording box');
      size = Number(large); header = 16;
    }
    if (size < header || size > end - offset) throw new Error('Invalid recording box');
    result.push({ type: data.toString('ascii', offset + 4, offset + 8), start: offset, end: offset + size, payload: offset + header });
    offset += size;
  }
  return result;
}
function child(data: Buffer, parent: Box, type: string): Box {
  const matches = boxes(data, parent.payload, parent.end).filter(box => box.type === type);
  if (matches.length !== 1) throw new Error('Missing recording metadata');
  return matches[0];
}
function uint(data: Buffer, box: Box, offset: number): number {
  if (box.payload + offset + 4 > box.end) throw new Error('Truncated recording metadata');
  return data.readUInt32BE(box.payload + offset);
}
function payloadFlags(data: Buffer, box: Box): number { return uint(data, box, 0) & 0xffffff; }

/** Validate the generated file independently of successful codec completion. */
function parsePrepared(data: Buffer, selected: CameraRecordingConfiguration, audioActive: boolean): {
  initialization: Buffer; fragments: NativeRecordingFragment[]; durationMs: number;
} {
  const top = boxes(data);
  if (top[0]?.type !== 'ftyp' || top[1]?.type !== 'moov' || top.length < 4 || (top.length - 2) % 2) throw new Error('Invalid fragmented recording');
  const moov = top[1];
  if (moov.end > NATIVE_RECORDING_MEDIA_LIMITS.initializationBytes) throw new Error('Recording initialization exhausted');
  let trackId = 0, timescale = 0, audioTracks = 0, videoTracks = 0;
  for (const trak of boxes(data, moov.payload, moov.end).filter(box => box.type === 'trak')) {
    const mdia = child(data, trak, 'mdia'), handler = child(data, mdia, 'hdlr');
    const kind = data.toString('ascii', handler.payload + 8, handler.payload + 12);
    if (kind === 'soun') audioTracks++;
    if (kind !== 'vide') continue;
    videoTracks++;
    const tkhd = child(data, trak, 'tkhd'), mdhd = child(data, mdia, 'mdhd');
    trackId = uint(data, tkhd, data[tkhd.payload] === 1 ? 20 : 12);
    timescale = uint(data, mdhd, data[mdhd.payload] === 1 ? 20 : 12);
  }
  if (videoTracks !== 1 || !trackId || !timescale || audioTracks !== (audioActive ? 1 : 0)) throw new Error('Recording tracks do not match policy');
  const trex = boxes(data, child(data, moov, 'mvex').payload, child(data, moov, 'mvex').end)
    .find(box => box.type === 'trex' && uint(data, box, 4) === trackId);
  if (!trex) throw new Error('Recording timing unavailable');
  const defaultDuration = uint(data, trex, 12), defaultFlags = uint(data, trex, 20);
  const fragments: NativeRecordingFragment[] = [];
  let firstStart: bigint | undefined, previousEnd: bigint | undefined, sequence = 0;
  for (let index = 2; index < top.length; index += 2) {
    const moof = top[index], mdat = top[index + 1];
    if (moof.type !== 'moof' || mdat.type !== 'mdat' || mdat.end - moof.start > NATIVE_RECORDING_MEDIA_LIMITS.fragmentBytes ||
        fragments.length >= NATIVE_RECORDING_MEDIA_LIMITS.fragments) throw new Error('Invalid recording fragment');
    const nextSequence = uint(data, child(data, moof, 'mfhd'), 4);
    if (nextSequence !== sequence + 1) throw new Error('Recording sequence discontinuity');
    sequence = nextSequence;
    const traf = boxes(data, moof.payload, moof.end).find(box => box.type === 'traf' && uint(data, child(data, box, 'tfhd'), 4) === trackId);
    if (!traf) throw new Error('Recording video fragment unavailable');
    const tfhd = child(data, traf, 'tfhd'), tfdt = child(data, traf, 'tfdt');
    const flags = payloadFlags(data, tfhd);
    let cursor = 8, sampleDuration = defaultDuration, sampleFlags = defaultFlags;
    if (flags & 1) cursor += 8;
    if (flags & 2) cursor += 4;
    if (flags & 8) { sampleDuration = uint(data, tfhd, cursor); cursor += 4; }
    if (flags & 16) cursor += 4;
    if (flags & 32) sampleFlags = uint(data, tfhd, cursor);
    const version = data[tfdt.payload];
    if (version > 1 || tfdt.payload + (version ? 12 : 8) > tfdt.end) throw new Error('Recording decode time unavailable');
    const start = version ? data.readBigUInt64BE(tfdt.payload + 4) : BigInt(uint(data, tfdt, 4));
    let duration = 0n, samples = 0, firstFlags: number | undefined;
    for (const trun of boxes(data, traf.payload, traf.end).filter(box => box.type === 'trun')) {
      const runFlags = payloadFlags(data, trun), count = uint(data, trun, 4);
      if (!count || count > 9000 || samples + count > 9000) throw new Error('Recording sample bound exceeded');
      let position = 8;
      if (runFlags & 1) position += 4;
      let runFirstFlags: number | undefined;
      if (runFlags & 4) { runFirstFlags = uint(data, trun, position); position += 4; }
      for (let sample = 0; sample < count; sample++) {
        let length = sampleDuration, currentFlags = sampleFlags;
        if (runFlags & 0x100) { length = uint(data, trun, position); position += 4; }
        if (runFlags & 0x200) position += 4;
        if (runFlags & 0x400) { currentFlags = uint(data, trun, position); position += 4; }
        else if (sample === 0 && runFirstFlags !== undefined) currentFlags = runFirstFlags;
        if (runFlags & 0x800) position += 4;
        if (!length || trun.payload + position > trun.end) throw new Error('Recording sample timing unavailable');
        if (firstFlags === undefined) firstFlags = currentFlags;
        duration += BigInt(length); samples++;
      }
    }
    if (!samples || firstFlags === undefined || (firstFlags & 0x10000) || ((firstFlags >>> 24) & 3) !== 2 ||
        (previousEnd !== undefined && start !== previousEnd)) throw new Error('Recording fragment is not continuous keyframe media');
    firstStart ??= start;
    const startMs = Number(start - firstStart) * 1000 / timescale;
    const durationMs = Number(duration) * 1000 / timescale;
    if (durationMs <= 0 || durationMs > selected.mediaContainerConfiguration.fragmentLength + 0.01 ||
        startMs + durationMs > NATIVE_RECORDING_MEDIA_LIMITS.durationMs + 0.01) throw new Error('Recording duration bound exceeded');
    previousEnd = start + duration;
    fragments.push(Object.freeze({ data: data.subarray(moof.start, mdat.end), startMs, durationMs }));
  }
  if (!fragments.length) throw new Error('Recording has no video');
  return { initialization: data.subarray(0, moov.end), fragments, durationMs: fragments.at(-1)!.startMs + fragments.at(-1)!.durationMs };
}

export async function prepareNativeRecording(source: NativeRecordingSource, configuration: CameraRecordingConfiguration,
  audioActive: boolean, signal: globalThis.AbortSignal, options: NativeRecordingPreparationOptions): Promise<PreparedNativeRecording> {
  signal.throwIfAborted();
  const selected = snapshotNativeRecordingConfiguration(configuration);
  const audio = selected.audioCodec;
  if (audioActive && (audio.type !== 0 || ![1, 2].includes(audio.samplerate) ||
      (audio.audioChannels ?? 1) !== 1 || !Number.isInteger(audio.bitrate) || audio.bitrate < 8 || audio.bitrate > 128)) {
    throw new Error('Unsupported recording audio');
  }
  if (typeof options.admit !== 'function') throw new Error('Recording preparation admission unavailable');
  const timeout = options.timeoutMs ?? NATIVE_RECORDING_MEDIA_LIMITS.preparationMs;
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > NATIVE_RECORDING_MEDIA_LIMITS.preparationMs) throw new Error('Invalid recording preparation deadline');
  const controller = new globalThis.AbortController();
  const cancelled = () => controller.abort();
  signal.addEventListener('abort', cancelled, { once: true });
  if (signal.aborted) controller.abort();
  const owner = controller.signal, memory = options.memory ?? sharedMemory;
  const deadline = Date.now() + timeout;
  let phase: PreparationPhase = 'admission';
  let deadlinePhase: PreparationPhase | undefined;
  const timer = globalThis.setTimeout(() => {
    if (owner.aborted) return;
    deadlinePhase = phase;
    controller.abort();
  }, timeout);
  let started = false;
  let rejectQueued!: (reason: Error) => void;
  const queuedAbort = new Promise<never>((_resolve, reject) => { rejectQueued = reject; });
  const abortQueued = () => { if (!started) rejectQueued(new Error('Recording preparation cancelled before admission')); };
  owner.addEventListener('abort', abortQueued, { once: true });
  const pending = Promise.resolve().then(() => options.admit(async () => {
    owner.throwIfAborted(); started = true;
    phase = 'input';
    if (!source || !path.isAbsolute(source.filePath) || !Number.isSafeInteger(source.expectedBytes) || source.expectedBytes < 1 ||
        source.expectedBytes > NATIVE_RECORDING_MEDIA_LIMITS.sourceBytes || !/^[a-f0-9]{64}$/.test(source.expectedSha256)) throw new Error('Invalid local recording source');
    const parent = await fs.lstat(path.dirname(source.filePath));
    if (!parent.isDirectory() || parent.isSymbolicLink() ||
        (typeof process.getuid === 'function' && ((parent.mode & 0o777) !== 0o700 || parent.uid !== process.getuid()))) throw new Error('Recording source directory is not private');
    const reference = await fs.lstat(source.filePath);
    if (!reference.isFile() || reference.isSymbolicLink()) throw new Error('Recording source is not a private regular file');
    const file = await fs.open(source.filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    let output: Buffer | undefined, retained = false;
    let snapshotPath: string | undefined, snapshotOwned = false;
    const chunks: Buffer[] = [];
    let collected = 0;
    try {
      const before = await file.stat();
      if (!before.isFile() || before.size !== source.expectedBytes || before.dev !== reference.dev || before.ino !== reference.ino ||
          (typeof process.getuid === 'function' && ((before.mode & 0o777) !== 0o600 || before.uid !== process.getuid()))) throw new Error('Recording source is not a private regular file');
      const hash = createHash('sha256'), block = Buffer.allocUnsafe(65536);
      // Reuse the runtime's generated-partial namespace so crash reconciliation
      // retires this private working copy as well as interrupted downloads.
      snapshotPath = path.join(path.dirname(source.filePath), `.native-${randomUUID()}.partial`);
      const snapshot = await fs.open(snapshotPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      snapshotOwned = true;
      try {
        for (let position = 0; position < before.size;) {
          owner.throwIfAborted();
          const { bytesRead } = await file.read(block, 0, Math.min(block.length, before.size - position), position);
          if (!bytesRead) throw new Error('Recording source changed');
          const value = block.subarray(0, bytesRead); hash.update(value); await snapshot.writeFile(value); position += bytesRead;
        }
      } finally { block.fill(0); await snapshot.close(); }
      const after = await file.stat();
      if (hash.digest('hex') !== source.expectedSha256 || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Recording source integrity mismatch');
      owner.throwIfAborted();
      // The private snapshot binds every external pass to the verified bytes.
      // Child processes receive only a read-only seekable descriptor, never its
      // path, provider capabilities, URLs, session keys or inherited environment.
      phase = 'configuration';
      // eslint-disable-next-line no-undef -- This plugin is published as CommonJS.
      const protectionPath = loadPackagedProtectionWorker(path.resolve(__dirname, '../..'));
      let ffmpegPath: string;
      try {
        ffmpegPath = resolveExternalFfmpegPath(options.ffmpegPath);
        await probeExternalFfmpeg(ffmpegPath, protectionPath, owner);
      } catch (error) {
        if (error instanceof ExternalFfmpegSetupError) throw new NativeRecordingPreparationError({ phase: 'configuration', workerCode: 'EXTERNAL_FFMPEG' });
        throw error;
      }
      const snapshotReference = await fs.lstat(snapshotPath);
      const context = { ffmpegPath, protectionPath, signal: owner, deadline,
        open: async () => {
          owner.throwIfAborted();
          const input = await fs.open(snapshotPath!, constants.O_RDONLY | constants.O_NOFOLLOW);
          try {
            const current = await input.stat();
            if (!current.isFile() || current.size !== source.expectedBytes || current.dev !== snapshotReference.dev || current.ino !== snapshotReference.ino ||
                current.mtimeMs !== snapshotReference.mtimeMs || current.ctimeMs !== snapshotReference.ctimeMs) {
              throw new Error('Recording source integrity mismatch');
            }
            return input;
          } catch (error) { await input.close().catch(() => undefined); throw error; }
        } };
      const unchanged = async (): Promise<void> => {
        const current = await file.stat(), named = await fs.lstat(source.filePath);
        if (!named.isFile() || named.dev !== before.dev || named.ino !== before.ino ||
            (['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'mode', 'uid', 'gid'] as const).some(key => current[key] !== before[key])) {
          throw new Error('Recording source integrity mismatch');
        }
      };
      let plan: Awaited<ReturnType<typeof inspectExternalRecording>>;
      phase = 'input';
      try { plan = await inspectExternalRecording(context, selected, audioActive); }
      catch (error) { if (owner.aborted) throw new Error('Recording conversion cancelled');
        throw new NativeRecordingPreparationError({ phase: 'input', workerCode: error instanceof ExternalRecordingError ? error.code : 'MEDIA' }); }
      let initialWorkerCode: RecordingFailureCode | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        phase = 'output';
        owner.throwIfAborted(); await unchanged();
        const audioOutput = attempt === 1 ? 'generated-silence' : audioActive ? 'source' : 'disabled';
        try {
          let outputFailure: Error | undefined;
          const collect = (value: Buffer): void => {
            owner.throwIfAborted();
            try {
              if (collected + value.length > NATIVE_RECORDING_MEDIA_LIMITS.outputBytes) throw new Error();
              memory.reserve(value.length);
            } catch { outputFailure = new Error('Recording output exhausted'); throw outputFailure; }
            let copy: Buffer;
            try { copy = Buffer.from(value); } catch (error) { memory.release(value.length); throw error; }
            chunks.push(copy); collected += copy.length;
          };
          try {
            await convertExternalRecording(context, selected, plan, audioOutput, collect);
            await unchanged();
          } catch (error) {
            if (owner.aborted) throw new Error('Recording conversion cancelled');
            if (outputFailure) throw outputFailure;
            if (error instanceof Error && /Recording (?:output exhausted|source)/.test(error.message)) throw error;
            throw new NativeRecordingPreparationError({ phase: 'output', workerCode: error instanceof ExternalRecordingError ? error.code : 'EXTERNAL_FFMPEG',
              ...(attempt === 1 ? { salvageAttempted: true as const } : {}) });
          }
          owner.throwIfAborted();
          if (!collected) throw new Error('Recording conversion produced no media');
          memory.reserve(collected);
          try { output = Buffer.concat(chunks, collected); } catch (error) { memory.release(collected); throw error; }
          for (const chunk of chunks) chunk.fill(0);
          chunks.length = 0; memory.release(collected);
          let parsed: ReturnType<typeof parsePrepared>;
          phase = 'validation';
          try {
            parsed = parsePrepared(output, selected, audioActive);
            await validateExternalRecording(context, output, selected, plan, audioOutput);
          } catch (error) { if (owner.aborted) throw new Error('Recording conversion cancelled');
            throw new NativeRecordingPreparationError({ phase: 'validation',
            ...(error instanceof ExternalRecordingError ? { workerCode: error.code } : {}), ...(attempt === 1 ? { salvageAttempted: true as const } : {}) }); }
          const bytes = output.length, preparedSha256 = createHash('sha256').update(output).digest('hex');
          const owned = output;
          let disposed = false;
          const prepared: PreparedNativeRecording = Object.freeze({ ...parsed, fragments: Object.freeze(parsed.fragments), configuration: selected,
            ...(attempt === 1 ? { recovery: Object.freeze({ flags: 2, attempts: 2 as const,
              ...(initialWorkerCode ? { initialWorkerCode } : {}) }) } : {}),
            audioActive, bytes, sourceSha256: source.expectedSha256, preparedSha256,
            get disposed() { return disposed; },
            dispose() { if (disposed) return; disposed = true; owned.fill(0); memory.release(bytes); },
          });
          retained = true; return prepared;
        } catch (error) {
          if (attempt !== 0 || !audioActive || owner.aborted || !(error instanceof NativeRecordingPreparationError) ||
              error.diagnostic.workerCode !== 'AUDIO_DISCONTINUITY') throw error;
          initialWorkerCode = error.diagnostic.workerCode;
        } finally {
          if (chunks.length) { for (const chunk of chunks) chunk.fill(0); memory.release(collected); chunks.length = 0; }
          collected = 0;
          if (output && !retained) { output.fill(0); memory.release(output.length); output = undefined; }
        }
      }
      throw new Error('Recording recovery exhausted');
    } finally {
      phase = 'closure';
      let cleanupSucceeded = false;
      try {
        try { await file.close(); }
        finally {
          if (snapshotOwned && snapshotPath) await fs.rm(snapshotPath, { force: true })
            .catch(() => { throw new Error('Recording temporary cleanup failed'); });
        }
        cleanupSucceeded = true;
      } finally {
        // A return value is not transferred to its caller until awaited cleanup
        // succeeds. A close/unlink failure must erase that provisional output.
        if (!cleanupSucceeded) retained = false;
        if (chunks.length) { for (const chunk of chunks) chunk.fill(0); memory.release(collected); }
        if (output && !retained) { output.fill(0); memory.release(output.length); }
      }
    }
  }, owner));
  try {
    const prepared = await Promise.race([pending, queuedAbort]);
    // Cleanup and admission may yield after validation; ownership transfers only
    // while the privacy owner and the original preparation deadline remain valid.
    if (owner.aborted || Date.now() >= deadline) {
      if (!owner.aborted) deadlinePhase = phase;
      prepared.dispose(); throw new Error('Recording conversion cancelled');
    }
    return prepared;
  }
  catch (error) {
    if (deadlinePhase !== undefined) throw new NativeRecordingPreparationError({ phase: deadlinePhase, deadlineExceeded: true });
    if (error instanceof NativeRecordingPreparationError && error.diagnostic.workerCode === 'TIME_LIMIT') {
      throw new NativeRecordingPreparationError({ ...error.diagnostic, deadlineExceeded: true });
    }
    throw error;
  }
  finally { globalThis.clearTimeout(timer); owner.removeEventListener('abort', abortQueued); signal.removeEventListener('abort', cancelled); }
}
