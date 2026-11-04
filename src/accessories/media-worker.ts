/** Private codec IPC for a verified executable; no discovery or runtime fallback. */
import { Buffer } from 'node:buffer';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { withinRequestBudget } from '../operation-budget';
import type { MediaPacketProtector } from './media-output';

export const MEDIA_WORKER_LIMITS = Object.freeze({ frameBytes: 1024 * 1024, inputBytes: 65536,
  finiteInputBytes: 32 * 1024 * 1024, finiteProcessingMs: 120000,
  recordingInitBytes: 256 * 1024, recordingFragmentBytes: 8 * 1024 * 1024, recordingQueueBytes: 16 * 1024 * 1024,
  outstanding: 1, requestMs: 2000, stopMs: 1000, lifetimeMs: 300000, lifetimeOutputBytes: 64 * 1024 * 1024 });
export interface CodecPacket {
  pts: bigint; dts: bigint; duration: bigint; stream: 1 | 2; keyframe: boolean;
  skipStart: number; skipEnd: number; data: Buffer;
}
export interface MediaWorkerCallbacks {
  packet?: (packet: CodecPacket, signal: globalThis.AbortSignal) => Promise<void>;
  audioInfo?: (info: { codec: number; rate: number; channels: number; padding: number; extradata: Buffer }) => void;
  sourceInfo?: (info: SourceVideoInfo) => void;
  motion?: (event: VideoMotionEvent, signal: globalThis.AbortSignal) => void;
  /** Borrowed media: copy retained data; buffers are erased after callback completion or abort. */
  recordingInit?: (data: Buffer, signal: globalThis.AbortSignal) => Promise<void>;
  /** Borrowed media: copy retained data; buffers are erased after callback completion or abort. */
  recordingFragment?: (fragment: RecordingFragment, signal: globalThis.AbortSignal) => Promise<void>;
  recordingSummary?: (summary: RecordingSourceSummary) => void;
}
export type MediaInputFormat = 'mpegts' | 'mp4';
export type AudioTailPolicy = 'strict' | 'pad-bounded';
export interface RecordingSourceSummary {
  decodedVideoFrames: number; selectedVideoFrames: number; encodedVideoFrames: number;
  generatedAudioSamples: number; audioRate: number; inputFormat: 'mp4';
  preparedSpanUpperBoundUs: number;
}
export interface VideoMotionEvent { atUs: number; score: number; }
export interface RecordingFragment { sequence: number; startUs: number; durationUs: number; keyframeStart: true; data: Buffer; }
export interface RecordingWorkerConfiguration {
  width: number; height: number; fps: number; bitrate: number; maxFrames: number; preset: 0 | 1; profile: 0 | 1 | 2; level: 0 | 1 | 2;
  audioCodec: 0 | 4; audioRate: 0 | 16000 | 24000; audioBitrate: number; fragmentMs: number; iFrameIntervalMs: number;
  inputFormat?: MediaInputFormat; audioTailPolicy?: AudioTailPolicy;
}
type RecordingOutput = { data: Buffer; fragment?: RecordingFragment };
export interface SourceVideoInfo { width: number; height: number; fpsNumerator: number; fpsDenominator: number; }
export type WorkerSpawner = (path: string, args: string[], options: { env: Record<string, string>; stdio: ['pipe', 'pipe', 'pipe']; shell: false }) => ChildProcessWithoutNullStreams;
interface QueuedWrite { type: number; payload: Buffer; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof globalThis.setTimeout>; }
interface Pending { type: number; stream: number; resolve: (data: Buffer) => void; reject: (error: Error) => void;
  timer: ReturnType<typeof globalThis.setTimeout>; bytes?: number; }
interface MediaConsumption { remaining: number; dispatched: boolean; resolve: () => void; reject: (error: Error) => void;
  timer: ReturnType<typeof globalThis.setTimeout>; }
function frame(type: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(12); header.write('BMI1'); header.writeUInt32BE(type, 4); header.writeUInt32BE(payload.length, 8);
  return Buffer.concat([header, payload]);
}
export class PrivateMediaWorker {
  readonly whenClosed: Promise<void>;
  readonly whenReady: Promise<void>;
  readonly whenMediaDrained: Promise<void>;
  #failed = false;
  get failed(): boolean { return this.#failed; }
  #child: ChildProcessWithoutNullStreams; #closed = false; #stopping = false; #ended = false; #configured = false; #inputEnded = false; #inputBytes = 0;
  #buffer = Buffer.alloc(0); #processing = false; #pending = new Map<number, Pending>();
  #initialized = new Set<number>(); #initializing = new Set<number>(); #request = 0; #writing = false;
  #writingType = 0; #control?: QueuedWrite; #producer?: QueuedWrite;
  #mediaConsumption?: MediaConsumption; #consumedBytes = 0;
  #ready = false; #fps = 0;
  #sourceSeen = false;
  #lastMotionAt?: number; #motionEvents = 0; #maximumMotionEvents = 0;
  #recording = false; #fragmentMs = 0; #recordingInitSeen = false; #fragmentSequence = 0; #fragmentEnd?: number;
  #finiteInput = false; #padAudioTail = false; #audioRate = 0; #summarySeen = false;
  #recordingQueue: RecordingOutput[] = []; #recordingBytes = 0;
  #activeRecording?: RecordingOutput;
  #resolveReady!: () => void; #rejectReady!: (error: Error) => void;
  #resolveDrained!: () => void; #rejectDrained!: (error: Error) => void;
  #readyTimer?: ReturnType<typeof globalThis.setTimeout>; #drainTimer?: ReturnType<typeof globalThis.setTimeout>;
  #codecQueue: CodecPacket[] = []; #codecBytes = 0; #consuming = false;
  #cancel = new globalThis.AbortController(); #outputBytes = 0; #finish!: () => void;
  #life: ReturnType<typeof globalThis.setTimeout>; #frameTimer?: ReturnType<typeof globalThis.setTimeout>; #kill?: ReturnType<typeof globalThis.setTimeout>;
  constructor(path: string, private readonly callbacks: MediaWorkerCallbacks = {}, launch: WorkerSpawner = spawn) {
    if (!isAbsolute(path) || path.includes('\0')) { throw new Error('Verified worker path required'); }
    this.whenClosed = new Promise(resolve => { this.#finish = resolve; });
    this.whenReady = new Promise((resolve, reject) => { this.#resolveReady = resolve; this.#rejectReady = reject; });
    this.whenMediaDrained = new Promise((resolve, reject) => { this.#resolveDrained = resolve; this.#rejectDrained = reject; });
    // Observers retain rejection semantics without requiring every stop-only caller to await them.
    this.whenReady.catch(() => undefined); this.whenMediaDrained.catch(() => undefined);
    this.#child = launch(path, [], { env: {}, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    this.#life = globalThis.setTimeout(() => this.#fail(), MEDIA_WORKER_LIMITS.lifetimeMs);
    this.#child.stdout.on('data', (chunk: Buffer) => this.#receive(chunk));
    this.#child.stdout.on('end', () => { if (!this.#stopping && (!this.#ended || this.#buffer.length)) { this.#fail(); } });
    this.#child.stdout.on('error', () => this.#fail()); this.#child.stdin.on('error', () => this.#fail());
    // Drain and discard: native diagnostics never cross this client's public error surface.
    this.#child.stderr.on('data', () => {}); this.#child.stderr.on('error', () => this.#fail());
    this.#child.on('error', () => this.#fail());
    this.#child.on('close', (code: number | null) => {
      if (!this.#stopping && (code !== 0 || !this.#ended || this.#buffer.length || this.#pending.size || this.#mediaConsumption || this.#consuming || this.#codecQueue.length || this.#recordingQueue.length || this.#writing || this.#control || this.#producer)) { this.#failed = true; this.#rejectAll(); }
      this.#closed = true; this.#stopping = true; this.#cancel.abort(); this.#buffer.fill(0); this.#dropCodec(); this.#buffer = Buffer.alloc(0); this.#rejectAll();
      globalThis.clearTimeout(this.#frameTimer); globalThis.clearTimeout(this.#life); globalThis.clearTimeout(this.#kill); this.#finish();
    });
  }
  #dropCodec(): void {
    for (const packet of this.#codecQueue.splice(0)) { this.#codecBytes -= packet.data.length + 48; }
    for (const item of this.#recordingQueue.splice(0)) { item.data.fill(0); this.#recordingBytes -= item.data.length + (item.fragment ? 24 : 0); }
    this.#activeRecording?.data.fill(0);
  }
  #rejectAll(): void {
    globalThis.clearTimeout(this.#readyTimer); globalThis.clearTimeout(this.#drainTimer);
    this.#rejectReady(new Error('Media worker unavailable')); this.#rejectDrained(new Error('Media worker unavailable'));
    if (this.#mediaConsumption) {
      globalThis.clearTimeout(this.#mediaConsumption.timer); this.#mediaConsumption.reject(new Error('Media worker unavailable')); this.#mediaConsumption = undefined;
    }
    for (const queued of [this.#control, this.#producer]) {
      if (queued) { globalThis.clearTimeout(queued.timer); queued.payload.fill(0); queued.reject(new Error('Media worker unavailable')); }
    }
    this.#control = undefined; this.#producer = undefined;
    for (const pending of this.#pending.values()) { globalThis.clearTimeout(pending.timer); pending.reject(new Error('Media worker unavailable')); }
    this.#pending.clear();
  }
  #fail(): void { this.#failed = true; this.#rejectAll(); void this.stop(); }
  #write(type: number, payload: Buffer): Promise<void> {
    if (this.#stopping || this.#closed || payload.length > MEDIA_WORKER_LIMITS.inputBytes) {
      throw new Error('Media worker admission rejected');
    }
    if (this.#writing) {
      const control = [10, 11, 12].includes(type);
      const producer = [2, 3].includes(type) && [10, 11, 12].includes(this.#writingType);
      if ((!control && !producer) || (control ? this.#control : this.#producer)) { throw new Error('Media worker admission rejected'); }
      return new Promise<void>((resolve, reject) => {
        const timer = globalThis.setTimeout(() => this.#fail(), MEDIA_WORKER_LIMITS.requestMs);
        const queued = { type, payload: Buffer.from(payload), resolve, reject, timer };
        if (control) { this.#control = queued; } else { this.#producer = queued; }
      });
    }
    return this.#performWrite(type, payload);
  }
  async #performWrite(type: number, payload: Buffer): Promise<void> {
    this.#writing = true; this.#writingType = type; const bytes = frame(type, payload);
    if (type === 2 && this.#mediaConsumption) { this.#mediaConsumption.dispatched = true; }
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = globalThis.setTimeout(() => { cleanup(); this.#fail(); reject(new Error('Media worker write expired')); }, MEDIA_WORKER_LIMITS.requestMs);
        const closed = () => { cleanup(); reject(new Error('Media worker unavailable')); };
        const cleanup = () => { globalThis.clearTimeout(timer); this.#child.removeListener('close', closed); };
        this.#child.once('close', closed);
        this.#child.stdin.write(bytes, error => { cleanup(); if (this.#stopping || error) { reject(new Error('Media worker write failed')); } else { resolve(); } });
      });
    } finally {
      bytes.fill(0); this.#writing = false;
      const next = this.#control ?? this.#producer;
      if (next === this.#control) { this.#control = undefined; } else { this.#producer = undefined; }
      if (next) {
        globalThis.clearTimeout(next.timer);
        if (this.#stopping || this.#closed) { next.payload.fill(0); next.reject(new Error('Media worker unavailable')); }
        else {
          void this.#performWrite(next.type, next.payload).then(() => { next.payload.fill(0); next.resolve(); }, error => { next.payload.fill(0); next.reject(error); });
        }
      }
    }
  }
  async configure(values: readonly number[], input: { format?: MediaInputFormat; audioTailPolicy?: AudioTailPolicy } = {}): Promise<void> {
    const format = input.format ?? 'mpegts', tail = input.audioTailPolicy ?? 'strict';
    if (this.#configured || values.length !== 16 || values.some(n => !Number.isInteger(n) || n < 0 || n > 0xffffffff) || values[13] > 1) {
      throw new Error('Invalid codec configuration');
    }
    if (!['mpegts', 'mp4'].includes(format) || !['strict', 'pad-bounded'].includes(tail) ||
        (format === 'mp4' && values[13] !== 1) || (tail === 'pad-bounded' && (format !== 'mp4' || values[6] !== 4))) {
      throw new Error('Invalid finite input configuration');
    }
    const payload = Buffer.alloc(72);
    [...values, format === 'mp4' ? 1 : 0, tail === 'pad-bounded' ? 1 : 0].forEach((value, i) => payload.writeUInt32BE(value, i * 4));
    const write = this.#write(1, payload); this.#configured = true; this.#fps = values[2]; this.#recording = values[13] === 1; this.#fragmentMs = values[14];
    this.#finiteInput = format === 'mp4'; this.#padAudioTail = tail === 'pad-bounded'; this.#audioRate = values[7];
    this.#maximumMotionEvents = values[4];
    this.#readyTimer = globalThis.setTimeout(() => this.#fail(), MEDIA_WORKER_LIMITS.requestMs); await write;
  }
  configureRecording(config: RecordingWorkerConfiguration): Promise<void> {
    return this.configure([config.width, config.height, config.fps, config.bitrate, config.maxFrames, config.preset,
      config.audioCodec, config.audioRate, config.audioCodec ? 1 : 0, config.audioBitrate, config.profile, config.level,
      0, 1, config.fragmentMs, config.iFrameIntervalMs], { format: config.inputFormat, audioTailPolicy: config.audioTailPolicy });
  }
  async media(bytes: Buffer): Promise<void> {
    if (!this.#configured || this.#inputEnded || this.#mediaConsumption || !bytes.length || bytes.length > MEDIA_WORKER_LIMITS.inputBytes || this.#inputBytes + bytes.length > (this.#finiteInput ? MEDIA_WORKER_LIMITS.finiteInputBytes : 128 * 1024 * 1024)) { throw new Error('Invalid media input'); }
    let pending!: MediaConsumption;
    const consumed = new Promise<void>((resolve, reject) => {
      pending = { remaining: bytes.length, dispatched: false, resolve, reject,
        timer: globalThis.setTimeout(() => this.#fail(), MEDIA_WORKER_LIMITS.requestMs) };
      this.#mediaConsumption = pending;
    });
    consumed.catch(() => undefined);
    try {
      const write = this.#write(2, bytes); this.#inputBytes += bytes.length;
      await Promise.all([write, consumed]);
    } finally {
      globalThis.clearTimeout(pending.timer);
      if (this.#mediaConsumption === pending) { this.#mediaConsumption = undefined; }
    }
  }
  async endMedia(): Promise<void> {
    if (!this.#configured || this.#inputEnded || this.#mediaConsumption) { throw new Error('Invalid media EOF'); }
    const write = this.#write(3, Buffer.alloc(0)); this.#inputEnded = true;
    this.#drainTimer = globalThis.setTimeout(() => this.#fail(), this.#finiteInput ? MEDIA_WORKER_LIMITS.finiteProcessingMs : MEDIA_WORKER_LIMITS.requestMs); await write;
  }
  #mediaDrained(): void {
    if (this.#ended && !this.#consuming && !this.#codecQueue.length && !this.#recordingQueue.length && !this.#stopping) {
      globalThis.clearTimeout(this.#drainTimer); this.#resolveDrained();
    }
  }
  finishInput(): Promise<void> {
    if (!this.#ended || this.#pending.size || this.#mediaConsumption || this.#writing || this.#control || this.#producer || this.#stopping || this.#consuming || this.#codecQueue.length || this.#recordingQueue.length) { throw new Error('Media worker not drained'); }
    this.#child.stdin.end(); return this.whenClosed;
  }
  #expect(id: number, type: number, stream: number, bytes?: number): Promise<Buffer> {
    if (this.#pending.size >= MEDIA_WORKER_LIMITS.outstanding || this.#stopping || this.#closed) { return Promise.reject(new Error('Media worker admission rejected')); }
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => this.#fail(), MEDIA_WORKER_LIMITS.requestMs);
      this.#pending.set(id, { type, stream, resolve, reject, timer, bytes });
    });
  }
  async initialize(stream: 1 | 2, ssrc: number, key: Buffer, salt: Buffer): Promise<MediaPacketProtector> {
    if (![1, 2].includes(stream) || !Number.isInteger(ssrc) || ssrc < 1 || ssrc > 0xffffffff || key.length !== 16 || salt.length !== 14
        || this.#stopping || this.#closed || this.#pending.size >= MEDIA_WORKER_LIMITS.outstanding
        || this.#initialized.has(stream) || this.#initializing.has(stream)) { throw new Error('Invalid protection initialization'); }
    this.#initializing.add(stream); const payload = Buffer.alloc(42); payload.writeUInt32BE(stream); payload.writeUInt32BE(ssrc, 4);
    payload.writeUInt32BE(1, 8); key.copy(payload, 12); salt.copy(payload, 28);
    const ack = this.#expect(-stream, 10, stream); ack.catch(() => undefined);
    try { await this.#write(10, payload); await ack; this.#initialized.add(stream); }
    catch { this.#fail(); throw new Error('Media protection initialization failed'); }
    finally { payload.fill(0); this.#initializing.delete(stream); }
    return { protectRtp: packet => this.#protect(11, stream, packet), protectRtcp: packet => this.#protect(12, stream, packet), close: () => { void this.stop(); } };
  }
  async #protect(type: number, stream: number, packet: Buffer): Promise<Buffer> {
    if (!this.#initialized.has(stream) || packet.length < (type === 11 ? 12 : 8) || packet.length > 2048
        || this.#pending.size >= MEDIA_WORKER_LIMITS.outstanding || [...this.#pending.values()].some(p => p.stream === stream)) {
      throw new Error('Protection admission rejected');
    }
    if (this.#request === 0xffffffff) { this.#fail(); throw new Error('Protection request IDs exhausted'); }
    const id = ++this.#request; const payload = Buffer.alloc(8 + packet.length); payload.writeUInt32BE(id); payload.writeUInt32BE(stream, 4); packet.copy(payload, 8);
    const result = this.#expect(id, type, stream, packet.length); result.catch(() => undefined);
    try { await this.#write(type, payload); return await result; }
    catch { this.#fail(); throw new Error('Media protection failed'); }
    finally { payload.fill(0); }
  }
  #receive(chunk: Buffer): void {
    if (this.#stopping || this.#closed) { return; }
    this.#outputBytes += chunk.length;
    if (this.#outputBytes > MEDIA_WORKER_LIMITS.lifetimeOutputBytes) { this.#fail(); return; }
    let offset = 0;
    while (offset < chunk.length && !this.#stopping) {
      // Append only the missing bytes of this frame. A chunk may finish one frame and start another.
      const target = this.#buffer.length < 12 ? 12 : 12 + this.#buffer.readUInt32BE(8);
      const length = Math.min(target - this.#buffer.length, chunk.length - offset);
      const maximum = this.#buffer.length < 12 ? 12 : this.#maximum(this.#buffer.readUInt32BE(4));
      if (length <= 0 || maximum === undefined || target > 12 + maximum) { this.#fail(); return; }
      this.#buffer = Buffer.concat([this.#buffer, chunk.subarray(offset, offset + length)]); offset += length;
      if (!this.#frameTimer) { this.#frameTimer = globalThis.setTimeout(() => this.#fail(), MEDIA_WORKER_LIMITS.requestMs); }
      void this.#parse();
    }
  }
  #maximum(type: number): number | undefined {
    return ({ 1: 8, 2: MEDIA_WORKER_LIMITS.frameBytes - 12, 3: 0, 4: MEDIA_WORKER_LIMITS.frameBytes - 12,
      5: 4116, 6: 4, 7: 16, 8: MEDIA_WORKER_LIMITS.recordingInitBytes, 9: MEDIA_WORKER_LIMITS.recordingFragmentBytes + 24,
      10: 4, 11: 2066, 12: 2070, 13: 16, 14: 32 } as Record<number, number>)[type];
  }
  async #parse(): Promise<void> {
    if (this.#processing || this.#stopping) { return; } this.#processing = true;
    try {
      while (!this.#stopping && this.#buffer.length >= 12) {
        if (this.#buffer.toString('ascii', 0, 4) !== 'BMO1') { throw new Error(); }
        const type = this.#buffer.readUInt32BE(4); const size = this.#buffer.readUInt32BE(8);
        const maximum = this.#maximum(type);
        if (maximum === undefined || size > maximum) { throw new Error(); }
        if (this.#buffer.length < 12 + size) { break; }
        globalThis.clearTimeout(this.#frameTimer); this.#frameTimer = undefined;
        const body = Buffer.from(this.#buffer.subarray(12, 12 + size)); this.#buffer = Buffer.from(this.#buffer.subarray(12 + size));
        if (type === 10 || type === 11 || type === 12) {
          if (size < (type === 10 ? 4 : 8)) { throw new Error(); }
          const stream = body.readUInt32BE(type === 10 ? 0 : 4); const id = type === 10 ? -stream : body.readUInt32BE(0);
          const pending = this.#pending.get(id);
          if ((type !== 10 && size < 30) || !pending || pending.type !== type || pending.stream !== stream || (type === 10 && size !== 4) || (type !== 10 && size !== 8 + pending.bytes! + (type === 11 ? 10 : 14))) { throw new Error(); }
          this.#pending.delete(id); globalThis.clearTimeout(pending.timer); pending.resolve(body.subarray(type === 10 ? 4 : 8));
        } else if (type === 6) {
          const pending = this.#mediaConsumption; const total = size === 4 ? body.readUInt32BE(0) : 0;
          const bytes = total - this.#consumedBytes;
          if (!pending?.dispatched || bytes <= 0 || bytes > pending.remaining || total > this.#inputBytes) { throw new Error(); }
          this.#consumedBytes = total; pending.remaining -= bytes; if (!pending.remaining) { pending.resolve(); }
        } else if (type === 7) {
          if (size !== 16 || !this.#configured || this.#ended || this.#sourceSeen) { throw new Error(); }
          const width = body.readUInt32BE(0), height = body.readUInt32BE(4), fpsNumerator = body.readUInt32BE(8), fpsDenominator = body.readUInt32BE(12);
          if (!width || !height || width > 4096 || height > 4096 || width * height > 8388608 || !fpsDenominator ||
              fpsNumerator > 0x7fffffff || fpsDenominator > 0x7fffffff || fpsNumerator > 120 * fpsDenominator || (!fpsNumerator && fpsDenominator !== 1)) { throw new Error(); }
          this.#sourceSeen = true; this.callbacks.sourceInfo?.({ width, height, fpsNumerator, fpsDenominator });
        } else if (type === 13) {
          if (!this.#recording || !this.#ready || this.#ended || size !== 16 ||
              body.readUInt32BE(12) !== 1 || this.#motionEvents >= this.#maximumMotionEvents) { throw new Error(); }
          const atUs = Number(body.readBigUInt64BE(0)), score = body.readUInt32BE(8);
          if (!Number.isSafeInteger(atUs) || score > 1000 ||
              (this.#lastMotionAt !== undefined && atUs - this.#lastMotionAt < 1000000)) { throw new Error(); }
          this.#lastMotionAt = atUs; this.#motionEvents++;
          this.callbacks.motion?.({ atUs, score }, this.#cancel.signal);
        } else if (type === 14) {
          if (!this.#finiteInput || !this.#recording || !this.#ready || !this.#inputEnded || this.#ended || this.#summarySeen || size !== 32) { throw new Error(); }
          const decodedVideoFrames = body.readUInt32BE(0), selectedVideoFrames = body.readUInt32BE(4), encodedVideoFrames = body.readUInt32BE(8);
          const generatedAudioSamples = body.readUInt32BE(12), audioRate = body.readUInt32BE(16);
          const preparedSpan = body.readBigUInt64BE(24);
          if (!decodedVideoFrames || decodedVideoFrames > this.#maximumMotionEvents || !selectedVideoFrames || selectedVideoFrames > decodedVideoFrames ||
              encodedVideoFrames !== selectedVideoFrames || audioRate !== this.#audioRate || body.readUInt32BE(20) !== 1 ||
              generatedAudioSamples > 2 * audioRate || (!this.#padAudioTail && generatedAudioSamples) || preparedSpan < 1n || preparedSpan > 92000000n) { throw new Error(); }
          this.#summarySeen = true;
          this.callbacks.recordingSummary?.({ decodedVideoFrames, selectedVideoFrames, encodedVideoFrames, generatedAudioSamples, audioRate, inputFormat: 'mp4', preparedSpanUpperBoundUs: Number(preparedSpan) });
        } else if (type === 8 || type === 9) {
          if (!this.#recording || !this.#ready || this.#ended || !size || this.#recordingQueue.length >= 256 || this.#recordingBytes + size > MEDIA_WORKER_LIMITS.recordingQueueBytes) { throw new Error(); }
          let item: RecordingOutput;
          if (type === 8) {
            if (this.#recordingInitSeen || !this.callbacks.recordingInit || size < 16) { throw new Error(); }
            this.#recordingInitSeen = true; item = { data: body };
          } else {
            if (!this.#recordingInitSeen || !this.callbacks.recordingFragment || size <= 24) { throw new Error(); }
            const sequence = body.readUInt32BE(0), startUs = Number(body.readBigInt64BE(4)), durationUs = Number(body.readBigInt64BE(12));
            if (sequence !== this.#fragmentSequence || body.readUInt32BE(20) !== 1 || !Number.isSafeInteger(startUs) || !Number.isSafeInteger(durationUs) || durationUs <= 0 || durationUs > this.#fragmentMs * 1000 || (this.#fragmentEnd !== undefined && startUs < this.#fragmentEnd - 1000000 / this.#fps)) { throw new Error(); }
            this.#fragmentSequence++; this.#fragmentEnd = startUs + durationUs;
            const fragment: RecordingFragment = { sequence, startUs, durationUs, keyframeStart: true, data: body.subarray(24) };
            item = { data: fragment.data, fragment };
          }
          this.#recordingBytes += size; this.#recordingQueue.push(item); void this.#consume();
        } else if (type === 2 || type === 4) {
          if (this.#recording || this.#ended || !this.#configured || size <= 48 || body.readUInt32BE(28) !== (type === 2 ? 1 : 2) || body.readUInt32BE(24) > 1
              || body.readUInt32BE(32) !== 1 || body.readUInt32BE(36) !== 1000000) { throw new Error(); }
          if (!this.callbacks.packet || this.#codecBytes + size > MEDIA_WORKER_LIMITS.frameBytes || this.#codecQueue.length >= 256) { throw new Error(); }
          this.#codecBytes += size;
          this.#codecQueue.push({ pts: body.readBigInt64BE(0), dts: body.readBigInt64BE(8), duration: body.readBigInt64BE(16),
            stream: type === 2 ? 1 : 2, keyframe: body.readUInt32BE(24) === 1, skipStart: body.readUInt32BE(40), skipEnd: body.readUInt32BE(44), data: body.subarray(48) });
          void this.#consume();
        } else if (type === 1) {
          if (size !== 8 || !this.#configured || this.#ready || body.readUInt32BE(0) !== 4 || this.#fps < 1 || this.#fps > 30 || body.readUInt32BE(4) !== this.#fps) { throw new Error(); }
          this.#ready = true; globalThis.clearTimeout(this.#readyTimer); this.#resolveReady();
        } else if (type === 3) {
          if (size || this.#ended || !this.#inputEnded || (this.#recording && !this.#fragmentSequence) || (this.#finiteInput && !this.#summarySeen)) { throw new Error(); }
          this.#ended = true; this.#mediaDrained();
        }
        else if (type === 5) {
          if (this.#recording || size < 20 || body.readUInt32BE(16) !== size - 20 || ![1, 2, 3].includes(body.readUInt32BE(0))
              || body.readUInt32BE(8) !== 1 || ![8000, 16000, 24000].includes(body.readUInt32BE(4))) { throw new Error(); }
          this.callbacks.audioInfo?.({ codec: body.readUInt32BE(0), rate: body.readUInt32BE(4), channels: body.readUInt32BE(8), padding: body.readUInt32BE(12), extradata: body.subarray(20) });
        }
      }
    } catch { this.#fail(); } finally {
      this.#processing = false;
      if (this.#buffer.length && !this.#frameTimer && !this.#stopping) { this.#frameTimer = globalThis.setTimeout(() => this.#fail(), MEDIA_WORKER_LIMITS.requestMs); }
    }
  }
  async #consume(): Promise<void> {
    if (this.#consuming || this.#stopping) { return; }
    const packet = this.#codecQueue.shift(), recording = this.#recordingQueue.shift(); if (!packet && !recording) { return; } this.#consuming = true; this.#activeRecording = recording;
    try {
      const consumed = packet ? this.callbacks.packet!(packet, this.#cancel.signal) : recording!.fragment ?
        this.callbacks.recordingFragment!(recording!.fragment, this.#cancel.signal) : this.callbacks.recordingInit!(recording!.data, this.#cancel.signal);
      await withinRequestBudget(consumed, {
        signal: this.#cancel.signal, deadline: Date.now() + MEDIA_WORKER_LIMITS.requestMs,
      });
    } catch { this.#fail(); }
    finally {
      if (packet) { this.#codecBytes -= packet.data.length + 48; }
      if (recording) { recording.data.fill(0); this.#recordingBytes -= recording.data.length + (recording.fragment ? 24 : 0); }
      this.#activeRecording = undefined;
      this.#consuming = false; void this.#consume(); this.#mediaDrained();
    }
  }
  stop(): Promise<void> {
    if (!this.#stopping && !this.#closed) {
      this.#stopping = true; globalThis.clearTimeout(this.#frameTimer); this.#cancel.abort(); this.#buffer.fill(0); this.#dropCodec(); this.#rejectAll(); this.#buffer = Buffer.alloc(0);
      // A backlogged pipe must not delay termination. Native STOP is opportunistic; process signal is owner fallback.
      if (!this.#writing) { this.#child.stdin.write(frame(4, Buffer.alloc(0)), () => {}); }
      this.#child.kill('SIGTERM'); this.#child.stdout.resume();
      this.#kill = globalThis.setTimeout(() => { if (!this.#closed) { this.#child.kill('SIGKILL'); } }, MEDIA_WORKER_LIMITS.stopMs);
    }
    return this.whenClosed;
  }
}
