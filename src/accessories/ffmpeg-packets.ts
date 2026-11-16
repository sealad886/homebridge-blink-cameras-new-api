/** Narrow framing for FFmpeg tee/data/framecrc outputs; byte pipes never imply packet boundaries. */
import { Buffer } from 'node:buffer';
import type { Readable } from 'node:stream';
import { EXTERNAL_FFMPEG_LIMITS } from './external-ffmpeg';

export interface CodecPacket { pts: bigint; dts: bigint; duration: bigint; stream: 1 | 2; keyframe: boolean; data: Buffer; }
export interface SourceVideoInfo { width: number; height: number; fpsNumerator: number; fpsDenominator: number; }
export interface FfmpegPacketOptions {
  width: number; height: number; maxFrames: number;
  audio?: { codec: 'opus' | 'pcma' | 'pcmu'; rate: number; mtu: number };
}
const unavailable = (): Error => new Error('External codec packets unavailable');

export class FfmpegByteQueue {
  #chunks: Buffer[] = []; #bytes = 0; #ended = false; #waiters = new Set<() => void>();
  constructor(private readonly signal: globalThis.AbortSignal) {}
  #notify(): void { for (const wake of this.#waiters) wake(); this.#waiters.clear(); }
  async #change(): Promise<void> {
    this.signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const wake = () => { cleanup(); resolve(); }, abort = () => { cleanup(); reject(unavailable()); };
      const cleanup = () => { this.#waiters.delete(wake); this.signal.removeEventListener('abort', abort); };
      this.#waiters.add(wake); this.signal.addEventListener('abort', abort, { once: true });
      if (this.signal.aborted) abort();
    });
  }
  async push(bytes: Buffer): Promise<void> {
    if (!bytes.length || bytes.length > EXTERNAL_FFMPEG_LIMITS.packetBytes) throw unavailable();
    for (let offset = 0; offset < bytes.length;) {
      this.signal.throwIfAborted(); if (this.#ended) throw unavailable();
      const size = Math.min(bytes.length - offset, EXTERNAL_FFMPEG_LIMITS.packetBytes - this.#bytes);
      if (!size) { await this.#change(); continue; }
      // A pipe chunk can straddle a near-limit packet. Admit its fitting prefix so take() can drain that packet.
      this.#chunks.push(Buffer.from(bytes.subarray(offset, offset + size))); this.#bytes += size; offset += size; this.#notify();
    }
  }
  async take(length: number): Promise<Buffer> {
    if (!Number.isInteger(length) || length < 1 || length > EXTERNAL_FFMPEG_LIMITS.packetBytes) throw unavailable();
    while (this.#bytes < length) { if (this.#ended) throw unavailable(); await this.#change(); }
    this.signal.throwIfAborted(); const result = Buffer.allocUnsafe(length); let used = 0;
    while (used < length) {
      const first = this.#chunks[0], size = Math.min(first.length, length - used);
      first.copy(result, used, 0, size); used += size; this.#bytes -= size;
      if (size === first.length) { first.fill(0); this.#chunks.shift(); }
      else { const retained = Buffer.from(first.subarray(size)); first.fill(0); this.#chunks[0] = retained; }
    }
    this.#notify(); return result;
  }
  end(): void { this.#ended = true; this.#notify(); }
  async finish(): Promise<void> { while (!this.#ended) await this.#change(); if (this.#bytes) throw unavailable(); }
  dispose(): void { for (const chunk of this.#chunks) chunk.fill(0); this.#chunks = []; this.#bytes = 0; this.#notify(); }
}
export function packetAdler32(bytes: Buffer): number {
  let a = 0, b = 0;
  for (const byte of bytes) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  return (b * 65536 + a) >>> 0;
}
interface Header { numerator?: bigint; denominator?: bigint; type?: string; codec?: string; width?: number; height?: number; rate?: number; mono?: boolean; }
export interface FrameCrcPacket {
  streamIndex: 0 | 1; dts: bigint; pts: bigint; duration: bigint; size: number; checksum: number; keyframe: boolean;
}
export function parseFrameCrcPacket(line: string, maximumBytes = EXTERNAL_FFMPEG_LIMITS.packetBytes - 48): FrameCrcPacket | undefined {
  if (!Number.isInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > EXTERNAL_FFMPEG_LIMITS.outputBytes) throw unavailable();
  if (line.length > 1024 || /[^\x20-\x7e]/.test(line)) throw unavailable();
  if (!line || line.startsWith('#')) return undefined;
  const match = /^([01]),\s*(-?\d+),\s*(-?\d+),\s*(\d+),\s*(\d+),\s*0x([a-fA-F0-9]{8})(.*)$/.exec(line);
  if (!match) throw unavailable();
  const dts = BigInt(match[2]), pts = BigInt(match[3]), duration = BigInt(match[4]), size = Number(match[5]);
  if ([dts, pts].some(value => value < -(1n << 62n) || value > (1n << 62n)) || duration > (1n << 62n) ||
      !Number.isSafeInteger(size) || size < 1 || size > maximumBytes) throw unavailable();
  const flags = /(?:^|,)\s*F=0x([a-fA-F0-9]+)(?:,|$)/.exec(match[7]);
  return { streamIndex: Number(match[1]) as 0 | 1, dts, pts, duration, size, checksum: Number.parseInt(match[6], 16),
    keyframe: flags ? !!(Number.parseInt(flags[1], 16) & 1) : true };
}

export async function readFfmpegPackets(video: Readable, audio: Readable | undefined, metadata: Readable,
  options: FfmpegPacketOptions, packet: (value: CodecPacket, signal: globalThis.AbortSignal) => Promise<void>,
  signal: globalThis.AbortSignal): Promise<void> {
  const controller = new globalThis.AbortController(), abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) controller.abort();
  const owner = controller.signal, queues = [new FfmpegByteQueue(owner), new FfmpegByteQueue(owner)], headers: Header[] = [{}, {}];
  let bytes = 0, frames = 0, records = 0; const previous: Array<bigint | undefined> = [undefined, undefined];
  const raw = async (readable: Readable | undefined, queue: FfmpegByteQueue): Promise<void> => {
    if (readable) for await (const value of readable) {
      owner.throwIfAborted(); const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      if ((bytes += chunk.length) > EXTERNAL_FFMPEG_LIMITS.outputBytes) throw unavailable();
      await queue.push(chunk);
    }
    queue.end();
  };
  const parse = async (line: string): Promise<void> => {
    if (!line) return;
    if (line.startsWith('#')) {
      if (records) throw unavailable();
      const item = /^#(tb|media_type|codec_id|dimensions|sample_rate|channel_layout_name|channel_layout) ([01]): (.+)$/.exec(line);
      if (!item) { if (!/^#(?:software: |extradata [01]: |sar [01]: \d+\/\d+$)/.test(line)) throw unavailable(); return; }
      const header = headers[Number(item[2])], value = item[3];
      switch (item[1]) {
        case 'tb': { const ratio = /^(\d+)\/(\d+)$/.exec(value); if (!ratio || header.numerator !== undefined) throw unavailable();
          header.numerator = BigInt(ratio[1]); header.denominator = BigInt(ratio[2]);
          if (header.numerator < 1n || header.numerator > 1000000n || header.denominator < 1n || header.denominator > 1000000000n) throw unavailable(); break; }
        case 'media_type': if (header.type !== undefined) throw unavailable(); header.type = value; break;
        case 'codec_id': if (header.codec !== undefined) throw unavailable(); header.codec = value; break;
        case 'dimensions': { const size = /^(\d+)x(\d+)$/.exec(value); if (!size || header.width !== undefined) throw unavailable(); header.width = Number(size[1]); header.height = Number(size[2]); break; }
        case 'sample_rate': if (header.rate !== undefined || !/^\d+$/.test(value)) throw unavailable(); header.rate = Number(value); break;
        default: if (header.mono !== undefined) throw unavailable(); header.mono = value === 'mono';
      }
      return;
    }
    // Numeric packet columns are stable; optional flags and diagnostic side-data suffixes are bounded and never logged.
    const decoded = parseFrameCrcPacket(line);
    if (!decoded || ++records > 100000) throw unavailable();
    const index = decoded.streamIndex, header = headers[index], selected = options.audio;
    if (!header.numerator || !header.denominator ||
        (index === 0 ? header.type !== 'video' || header.codec !== 'h264' || header.width !== options.width || header.height !== options.height
          : !selected || header.type !== 'audio' || header.codec !== ({ opus: 'opus', pcma: 'pcm_alaw', pcmu: 'pcm_mulaw' }[selected.codec]) ||
            header.rate !== selected.rate || header.mono !== true)) throw unavailable();
    const { dts, pts, duration, size: length, keyframe } = decoded;
    if (dts !== pts || pts < -(1n << 62n) || pts > (1n << 62n) || duration < 1n || !Number.isSafeInteger(length) ||
        length < 1 || length > EXTERNAL_FFMPEG_LIMITS.packetBytes - 48 || (index === 0 && ++frames > options.maxFrames)) throw unavailable();
    const micros = (value: bigint) => value * header.numerator! * 1000000n / header.denominator!;
    const time = micros(pts), period = micros(duration), last = previous[index];
    if (period <= 0n || period > 1000000n || (last !== undefined &&
        (time <= last || time - last > BigInt(EXTERNAL_FFMPEG_LIMITS.lifetimeMs) * 1000n))) throw unavailable();
    previous[index] = time;
    const data = await queues[index].take(length);
    try {
      if (packetAdler32(data) !== decoded.checksum) throw unavailable();
      if (index === 1 && selected!.codec !== 'opus') {
        // G.711 is one byte per sample. FFmpeg's arbitrary PCM packet size must not become an oversized RTP datagram.
        if (duration * header.numerator! * BigInt(selected!.rate) !== BigInt(length) * header.denominator!) throw unavailable();
        const maximum = Math.min(selected!.rate / 50, selected!.mtu - 22);
        if (!Number.isInteger(maximum) || maximum < 1) throw unavailable();
        for (let at = 0; at < data.length; at += maximum) {
          const part = data.subarray(at, at + maximum), offset = BigInt(at) * 1000000n / BigInt(selected!.rate);
          await packet({ stream: 2, pts: time + offset, dts: time + offset, duration: BigInt(part.length) * 1000000n / BigInt(selected!.rate), keyframe, data: part }, owner);
        }
      } else {
        if (index === 1 && data.length + 22 > selected!.mtu) throw unavailable();
        await packet({ stream: index === 0 ? 1 : 2, pts: time, dts: micros(dts), duration: period, keyframe, data }, owner);
      }
    } finally { data.fill(0); }
  };
  const meta = async (): Promise<void> => {
    let tail = '';
    for await (const value of metadata) {
      owner.throwIfAborted(); const chunk: Buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
      if (chunk.some(byte => (byte < 32 && byte !== 10 && byte !== 13) || byte > 126)) throw unavailable();
      const lines = (tail + chunk.toString('ascii')).split('\n'); tail = lines.pop()!;
      for (const line of lines) { if (line.length > 1024) throw unavailable(); await parse(line.endsWith('\r') ? line.slice(0, -1) : line); }
      if (tail.length > 1024) throw unavailable();
    }
    if (tail || !frames) throw unavailable();
    await Promise.all(queues.map(queue => queue.finish()));
  };
  const guard = async (work: Promise<void>) => { try { await work; } catch { controller.abort(); throw unavailable(); } };
  try { await Promise.all([guard(raw(video, queues[0])), guard(raw(audio, queues[1])), guard(meta())]); }
  finally { controller.abort(); signal.removeEventListener('abort', abort); for (const queue of queues) queue.dispose(); }
}
