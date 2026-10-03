/** Prototype only: externally verified executable; no discovery or runtime fallback. */
import { Buffer } from 'node:buffer';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { withinRequestBudget } from '../operation-budget';
import type { MediaPacketProtector } from './media-output';

export const MEDIA_WORKER_LIMITS = Object.freeze({ frameBytes: 1024 * 1024, inputBytes: 65536,
  outstanding: 1, requestMs: 2000, stopMs: 1000, lifetimeMs: 300000, lifetimeOutputBytes: 64 * 1024 * 1024 });
export interface CodecPacket {
  pts: bigint; dts: bigint; duration: bigint; stream: 1 | 2; keyframe: boolean;
  skipStart: number; skipEnd: number; data: Buffer;
}
export interface MediaWorkerCallbacks {
  packet?: (packet: CodecPacket, signal: globalThis.AbortSignal) => Promise<void>;
  audioInfo?: (info: { codec: number; rate: number; channels: number; padding: number; extradata: Buffer }) => void;
}
export type WorkerSpawner = (path: string, args: string[], options: { env: Record<string, string>; stdio: ['pipe', 'pipe', 'pipe']; shell: false }) => ChildProcessWithoutNullStreams;
interface QueuedWrite { type: number; payload: Buffer; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof globalThis.setTimeout>; }
interface Pending { type: number; stream: number; resolve: (data: Buffer) => void; reject: (error: Error) => void;
  timer: ReturnType<typeof globalThis.setTimeout>; bytes?: number; }
function frame(type: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(12); header.write('BMI1'); header.writeUInt32BE(type, 4); header.writeUInt32BE(payload.length, 8);
  return Buffer.concat([header, payload]);
}
export class PrivateMediaWorker {
  readonly whenClosed: Promise<void>;
  #failed = false;
  get failed(): boolean { return this.#failed; }
  #child: ChildProcessWithoutNullStreams; #closed = false; #stopping = false; #ended = false; #configured = false; #inputEnded = false; #inputBytes = 0;
  #buffer = Buffer.alloc(0); #processing = false; #pending = new Map<number, Pending>();
  #initialized = new Set<number>(); #initializing = new Set<number>(); #request = 0; #writing = false;
  #writingType = 0; #control?: QueuedWrite; #producer?: QueuedWrite;
  #codecQueue: CodecPacket[] = []; #codecBytes = 0; #consuming = false;
  #cancel = new globalThis.AbortController(); #outputBytes = 0; #finish!: () => void;
  #life: ReturnType<typeof globalThis.setTimeout>; #frameTimer?: ReturnType<typeof globalThis.setTimeout>; #kill?: ReturnType<typeof globalThis.setTimeout>;
  constructor(path: string, private readonly callbacks: MediaWorkerCallbacks = {}, launch: WorkerSpawner = spawn) {
    if (!isAbsolute(path) || path.includes('\0')) { throw new Error('Verified worker path required'); }
    this.whenClosed = new Promise(resolve => { this.#finish = resolve; });
    this.#child = launch(path, [], { env: {}, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    this.#life = globalThis.setTimeout(() => this.#fail(), MEDIA_WORKER_LIMITS.lifetimeMs);
    this.#child.stdout.on('data', (chunk: Buffer) => this.#receive(chunk));
    this.#child.stdout.on('end', () => { if (!this.#stopping && (!this.#ended || this.#buffer.length)) { this.#fail(); } });
    this.#child.stdout.on('error', () => this.#fail()); this.#child.stdin.on('error', () => this.#fail());
    // Drain and discard: native diagnostics never cross this client's public error surface.
    this.#child.stderr.on('data', () => {}); this.#child.stderr.on('error', () => this.#fail());
    this.#child.on('error', () => this.#fail());
    this.#child.on('close', (code: number | null) => {
      if (!this.#stopping && (code !== 0 || !this.#ended || this.#buffer.length || this.#pending.size || this.#consuming || this.#codecQueue.length || this.#writing || this.#control || this.#producer)) { this.#failed = true; this.#rejectAll(); }
      this.#closed = true; this.#stopping = true; this.#cancel.abort(); this.#dropCodec(); this.#buffer = Buffer.alloc(0); this.#rejectAll();
      globalThis.clearTimeout(this.#frameTimer); globalThis.clearTimeout(this.#life); globalThis.clearTimeout(this.#kill); this.#finish();
    });
  }
  #dropCodec(): void { for (const packet of this.#codecQueue.splice(0)) { this.#codecBytes -= packet.data.length + 48; } }
  #rejectAll(): void {
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
  async configure(values: readonly number[]): Promise<void> {
    if (this.#configured || values.length !== 10 || values.some(n => !Number.isInteger(n) || n < 0 || n > 0xffffffff)) {
      throw new Error('Invalid codec configuration');
    }
    const payload = Buffer.alloc(40); values.forEach((value, i) => payload.writeUInt32BE(value, i * 4));
    const write = this.#write(1, payload); this.#configured = true; await write;
  }
  async media(bytes: Buffer): Promise<void> {
    if (!this.#configured || this.#inputEnded || !bytes.length || this.#inputBytes + bytes.length > 128 * 1024 * 1024) { throw new Error('Invalid media input'); }
    const write = this.#write(2, bytes); this.#inputBytes += bytes.length; await write;
  }
  async endMedia(): Promise<void> { if (!this.#configured || this.#inputEnded) { throw new Error('Invalid media EOF'); } const write = this.#write(3, Buffer.alloc(0)); this.#inputEnded = true; await write; }
  finishInput(): Promise<void> {
    if (!this.#ended || this.#pending.size || this.#writing || this.#control || this.#producer || this.#stopping || this.#consuming || this.#codecQueue.length) { throw new Error('Media worker not drained'); }
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
      if (length <= 0 || target > MEDIA_WORKER_LIMITS.frameBytes) { this.#fail(); return; }
      this.#buffer = Buffer.concat([this.#buffer, chunk.subarray(offset, offset + length)]); offset += length;
      if (!this.#frameTimer) { this.#frameTimer = globalThis.setTimeout(() => this.#fail(), MEDIA_WORKER_LIMITS.requestMs); }
      void this.#parse();
    }
  }
  async #parse(): Promise<void> {
    if (this.#processing || this.#stopping) { return; } this.#processing = true;
    try {
      while (!this.#stopping && this.#buffer.length >= 12) {
        if (this.#buffer.toString('ascii', 0, 4) !== 'BMO1') { throw new Error(); }
        const type = this.#buffer.readUInt32BE(4); const size = this.#buffer.readUInt32BE(8);
        const maximum = ({ 1: 8, 2: MEDIA_WORKER_LIMITS.frameBytes - 12, 3: 0, 4: MEDIA_WORKER_LIMITS.frameBytes - 12,
          5: 4116, 10: 4, 11: 2066, 12: 2070 } as Record<number, number>)[type];
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
        } else if (type === 2 || type === 4) {
          if (this.#ended || !this.#configured || size <= 48 || body.readUInt32BE(28) !== (type === 2 ? 1 : 2) || body.readUInt32BE(24) > 1
              || body.readUInt32BE(32) !== 1 || body.readUInt32BE(36) !== 1000000) { throw new Error(); }
          if (!this.callbacks.packet || this.#codecBytes + size > MEDIA_WORKER_LIMITS.frameBytes || this.#codecQueue.length >= 256) { throw new Error(); }
          this.#codecBytes += size;
          this.#codecQueue.push({ pts: body.readBigInt64BE(0), dts: body.readBigInt64BE(8), duration: body.readBigInt64BE(16),
            stream: type === 2 ? 1 : 2, keyframe: body.readUInt32BE(24) === 1, skipStart: body.readUInt32BE(40), skipEnd: body.readUInt32BE(44), data: body.subarray(48) });
          void this.#consume();
        } else if (type === 1) { if (size !== 8 || body.readUInt32BE(0) !== 1 || body.readUInt32BE(4) < 1 || body.readUInt32BE(4) > 30) { throw new Error(); } }
        else if (type === 3) { if (size || this.#ended || !this.#inputEnded) { throw new Error(); } this.#ended = true; }
        else if (type === 5) {
          if (size < 20 || body.readUInt32BE(16) !== size - 20 || ![1, 2, 3].includes(body.readUInt32BE(0))
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
    const packet = this.#codecQueue.shift(); if (!packet) { return; } this.#consuming = true;
    try {
      await withinRequestBudget(this.callbacks.packet!(packet, this.#cancel.signal), {
        signal: this.#cancel.signal, deadline: Date.now() + MEDIA_WORKER_LIMITS.requestMs,
      });
    } catch { this.#fail(); }
    finally { this.#codecBytes -= packet.data.length + 48; this.#consuming = false; void this.#consume(); }
  }
  stop(): Promise<void> {
    if (!this.#stopping && !this.#closed) {
      this.#stopping = true; globalThis.clearTimeout(this.#frameTimer); this.#cancel.abort(); this.#dropCodec(); this.#rejectAll(); this.#buffer = Buffer.alloc(0);
      // A backlogged pipe must not delay termination. Native STOP is opportunistic; process signal is owner fallback.
      if (!this.#writing) { this.#child.stdin.write(frame(4, Buffer.alloc(0)), () => {}); }
      this.#child.kill('SIGTERM'); this.#child.stdout.resume();
      this.#kill = globalThis.setTimeout(() => { if (!this.#closed) { this.#child.kill('SIGKILL'); } }, MEDIA_WORKER_LIMITS.stopMs);
    }
    return this.whenClosed;
  }
}
