/** Bounded private libSRTP IPC. Codec/media bytes never enter this helper. */
import { Buffer } from 'node:buffer';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { isAbsolute } from 'node:path';
import type { MediaPacketProtector } from './media-output';

export const PROTECTION_WORKER_LIMITS = Object.freeze({ packetBytes: 2048, requestMs: 2000,
  stopMs: 1000, lifetimeMs: 300000, lifetimeOutputBytes: 64 * 1024 * 1024 });
export type ProtectionSpawner = (path: string, args: string[], options: {
  env: Record<string, string>; stdio: ['pipe', 'pipe', 'pipe']; shell: false;
}) => ChildProcessWithoutNullStreams;
interface Pending { type: number; stream: number; bytes: number; resolve: (bytes: Buffer) => void;
  reject: (error: Error) => void; timer: ReturnType<typeof globalThis.setTimeout>; }
function frame(type: number, payload: Buffer): Buffer {
  const bytes = Buffer.alloc(12 + payload.length); bytes.write('BMI1'); bytes.writeUInt32BE(type, 4);
  bytes.writeUInt32BE(payload.length, 8); payload.copy(bytes, 12); return bytes;
}
export class PrivateProtectionWorker {
  readonly whenClosed: Promise<void>;
  #child: ChildProcessWithoutNullStreams;
  #finish!: () => void; #failed = false; #stopping = false; #closed = false;
  #pending = new Map<number, Pending>(); #initialized = new Set<number>(); #initializing = new Set<number>();
  #request = 0; #buffer = Buffer.alloc(0); #outputBytes = 0;
  #life: ReturnType<typeof globalThis.setTimeout>; #kill?: ReturnType<typeof globalThis.setTimeout>;
  #frameTimer?: ReturnType<typeof globalThis.setTimeout>;
  get failed(): boolean { return this.#failed; }
  constructor(path: string, launch: ProtectionSpawner = spawn) {
    if (!isAbsolute(path) || path.includes('\0')) throw new Error('Verified protection worker path required');
    this.whenClosed = new Promise(resolve => { this.#finish = resolve; });
    this.#child = launch(path, [], { env: {}, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    this.#life = globalThis.setTimeout(() => this.#fail(), PROTECTION_WORKER_LIMITS.lifetimeMs);
    this.#child.stdout.on('data', (bytes: Buffer) => this.#receive(bytes));
    this.#child.stdout.on('end', () => { if (!this.#stopping) this.#fail(); });
    this.#child.stdout.on('error', () => this.#fail()); this.#child.stdin.on('error', () => this.#fail());
    // Native diagnostics contain no secrets, but never propagate arbitrary stderr.
    this.#child.stderr.resume(); this.#child.stderr.on('error', () => this.#fail());
    this.#child.on('error', () => this.#fail());
    this.#child.on('close', () => {
      if (!this.#stopping) this.#failed = true;
      this.#closed = true; this.#stopping = true; this.#rejectAll();
      this.#buffer.fill(0); this.#buffer = Buffer.alloc(0);
      globalThis.clearTimeout(this.#life); globalThis.clearTimeout(this.#kill); globalThis.clearTimeout(this.#frameTimer);
      this.#finish();
    });
  }
  #rejectAll(): void {
    for (const request of this.#pending.values()) {
      globalThis.clearTimeout(request.timer); request.reject(new Error('Protection worker unavailable'));
    }
    this.#pending.clear();
  }
  #fail(): void { this.#failed = true; this.#rejectAll(); void this.stop(); }
  async #send(id: number, type: number, stream: number, payload: Buffer, bytes = 0): Promise<Buffer> {
    if (this.#stopping || this.#closed || this.#pending.size) throw new Error('Protection admission rejected');
    const result = new Promise<Buffer>((resolve, reject) => {
      const timer = globalThis.setTimeout(() => this.#fail(), PROTECTION_WORKER_LIMITS.requestMs);
      this.#pending.set(id, { type, stream, bytes, resolve, reject, timer });
    });
    result.catch(() => undefined);
    const input = frame(type, payload);
    try {
      await new Promise<void>((resolve, reject) => {
        const closed = () => { cleanup(); reject(new Error('Protection worker unavailable')); };
        const cleanup = () => this.#child.removeListener('close', closed);
        this.#child.once('close', closed);
        this.#child.stdin.write(input, error => {
          cleanup();
          if (error || this.#stopping) reject(new Error('Protection write failed')); else resolve();
        });
      });
      return await result;
    } catch { this.#fail(); throw new Error('Media protection failed'); }
    finally { input.fill(0); }
  }
  async initialize(stream: 1 | 2, ssrc: number, key: Buffer, salt: Buffer): Promise<MediaPacketProtector> {
    if (![1, 2].includes(stream) || !Number.isInteger(ssrc) || ssrc < 1 || ssrc > 0xffffffff || key.length !== 16 || salt.length !== 14 ||
        this.#initialized.has(stream) || this.#initializing.has(stream)) throw new Error('Invalid protection initialization');
    this.#initializing.add(stream);
    const payload = Buffer.alloc(42); payload.writeUInt32BE(stream); payload.writeUInt32BE(ssrc, 4);
    payload.writeUInt32BE(1, 8); key.copy(payload, 12); salt.copy(payload, 28);
    try { await this.#send(-stream, 10, stream, payload); this.#initialized.add(stream); }
    finally { payload.fill(0); this.#initializing.delete(stream); }
    return { protectRtp: bytes => this.#protect(11, stream, bytes), protectRtcp: bytes => this.#protect(12, stream, bytes),
      close: () => { void this.stop(); } };
  }
  async #protect(type: number, stream: number, packet: Buffer): Promise<Buffer> {
    if (!this.#initialized.has(stream) || packet.length < (type === 11 ? 12 : 8) || packet.length > PROTECTION_WORKER_LIMITS.packetBytes) {
      throw new Error('Protection admission rejected');
    }
    if (this.#request === 0xffffffff) { this.#fail(); throw new Error('Protection request IDs exhausted'); }
    const id = ++this.#request, payload = Buffer.alloc(8 + packet.length);
    payload.writeUInt32BE(id); payload.writeUInt32BE(stream, 4); packet.copy(payload, 8);
    try { return await this.#send(id, type, stream, payload, packet.length); }
    finally { payload.fill(0); }
  }
  #receive(chunk: Buffer): void {
    if (this.#stopping) return;
    this.#outputBytes += chunk.length;
    if (this.#outputBytes > PROTECTION_WORKER_LIMITS.lifetimeOutputBytes) { this.#fail(); return; }
    let offset = 0;
    while (offset < chunk.length && !this.#stopping) {
      const target = this.#buffer.length < 12 ? 12 : 12 + this.#buffer.readUInt32BE(8);
      if (target > 2082 || target <= this.#buffer.length) { this.#fail(); return; }
      const take = Math.min(target - this.#buffer.length, chunk.length - offset);
      this.#buffer = Buffer.concat([this.#buffer, chunk.subarray(offset, offset + take)]); offset += take;
      if (!this.#frameTimer) this.#frameTimer = globalThis.setTimeout(() => this.#fail(), PROTECTION_WORKER_LIMITS.requestMs);
      if (this.#buffer.length < 12) continue;
      const type = this.#buffer.readUInt32BE(4), size = this.#buffer.readUInt32BE(8);
      if (this.#buffer.toString('ascii', 0, 4) !== 'BMO1' || ![10, 11, 12].includes(type) || size > (type === 10 ? 4 : type === 11 ? 2066 : 2070)) { this.#fail(); return; }
      if (this.#buffer.length < 12 + size) continue;
      const body = this.#buffer.subarray(12), stream = body.length >= (type === 10 ? 4 : 8) ? body.readUInt32BE(type === 10 ? 0 : 4) : 0;
      const id = type === 10 ? -stream : body.length >= 8 ? body.readUInt32BE(0) : 0, pending = this.#pending.get(id);
      if (!pending || pending.type !== type || pending.stream !== stream || size !== (type === 10 ? 4 : 8 + pending.bytes + (type === 11 ? 10 : 14))) { this.#fail(); return; }
      this.#pending.delete(id); globalThis.clearTimeout(pending.timer); globalThis.clearTimeout(this.#frameTimer); this.#frameTimer = undefined;
      const result = Buffer.from(body.subarray(type === 10 ? 4 : 8)); this.#buffer.fill(0); this.#buffer = Buffer.alloc(0); pending.resolve(result);
    }
  }
  stop(): Promise<void> {
    if (!this.#closed && !this.#stopping) {
      this.#stopping = true; this.#rejectAll(); globalThis.clearTimeout(this.#frameTimer);
      this.#child.stdin.end(frame(4, Buffer.alloc(0))); this.#child.kill('SIGTERM'); this.#child.stdout.resume();
      this.#kill = globalThis.setTimeout(() => { if (!this.#closed) this.#child.kill('SIGKILL'); }, PROTECTION_WORKER_LIMITS.stopMs);
    }
    return this.whenClosed;
  }
}
