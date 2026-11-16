/** Pipe-only live codec process. Vendor transport, keys and UDP remain owned by the parent. */
import { Buffer } from 'node:buffer';
import type { ChildProcess } from 'node:child_process';
import type { Readable } from 'node:stream';
import { withinRequestBudget } from '../operation-budget';
import { EXTERNAL_FFMPEG_LIMITS, probeExternalFfmpeg, spawnExternalFfmpeg, type ExternalFfmpegProcessOptions } from './external-ffmpeg';
import { readFfmpegPackets, type CodecPacket, type SourceVideoInfo } from './ffmpeg-packets';

export interface ExternalLiveCodecOptions {
  ffmpegPath: string; protectionPath: string;
  video: { width: number; height: number; fps: number; bitrate: number; maxFrames: number;
    profile: 0 | 1 | 2; level: 0 | 1 | 2; softwarePreset?: 'veryfast' | 'ultrafast' };
  audio?: { codec: 'opus' | 'pcma' | 'pcmu'; rate: 8000 | 16000 | 24000; bitrate: number; mtu: number; packetTime?: 10 | 20 | 40 | 60 };
}
export interface ExternalLiveCodecCallbacks {
  packet(packet: CodecPacket, signal: globalThis.AbortSignal): Promise<void>;
  sourceInfo?(info: SourceVideoInfo): void;
}
export interface ExternalLiveCodec {
  readonly whenClosed: Promise<void>; readonly failed: boolean;
  write(bytes: Buffer): Promise<void>; end(): Promise<void>; stop(): Promise<void>;
}
export interface ExternalLiveCodecDependencies {
  launch?: ExternalFfmpegProcessOptions['launch'];
  probe?: typeof probeExternalFfmpeg;
}
const unavailable = (): Error => new Error('External live codec unavailable');

export function liveFfmpegArguments(options: ExternalLiveCodecOptions): string[] {
  const { video: v, audio: a } = options;
  const filter = `showinfo@blink_source=checksum=0,select='isnan(prev_selected_t)+gte(t-start_t,selected_n/${v.fps}-0.000001)',` +
    `scale=${v.width}:${v.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${v.width}:${v.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`;
  return ['-hide_banner', '-nostdin', '-loglevel', 'info', '-xerror', '-max_alloc', '67108864', '-copyts', '-threads', '1', '-filter_threads', '1',
    '-protocol_whitelist', 'pipe', '-format_whitelist', 'mpegts', '-codec_whitelist', 'h264,aac,aac_latm',
    '-probesize', '65536', '-analyzeduration', '1000000', '-max_probe_packets', '32', '-max_streams', '8', '-max_pixels', '8388608', '-f', 'mpegts', '-i', 'pipe:0',
    '-map', '0:v:0', ...(a ? ['-map', '0:a:0'] : ['-an']), '-vf', filter,
    '-c:v', 'libx264', '-threads:v', '1', '-preset', v.softwarePreset ?? 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p', '-bf', '0',
    '-profile:v', ['baseline', 'main', 'high'][v.profile], '-level:v', ['3.1', '3.2', '4.0'][v.level],
    '-b:v', String(v.bitrate), '-maxrate:v', String(v.bitrate), '-bufsize:v', String(v.bitrate * 2),
    '-g', String(v.fps * 2), '-x264-params', 'scenecut=0:repeat-headers=1:annexb=1', '-frames:v', String(v.maxFrames),
    '-enc_time_base:v', '1/90000', '-fps_mode:v', 'passthrough',
    ...(a ? ['-c:a', { opus: 'libopus', pcma: 'pcm_alaw', pcmu: 'pcm_mulaw' }[a.codec], '-threads:a', '1', '-ar', String(a.rate), '-ac', '1',
      '-b:a', String(a.bitrate), '-af', `aresample=${a.rate}:async=0${a.codec === 'opus' ? '' : `,asetnsamples=n=${a.rate / 50}:p=0`}`,
      ...(a.codec === 'opus' ? ['-frame_duration', String(a.packetTime ?? 20), ...(v.softwarePreset === 'ultrafast' ? ['-compression_level', '3'] : [])] : [])] : []),
    '-f', 'tee', `[select=v:f=data:flush_packets=1]pipe:3|${a ? '[select=a:f=data:flush_packets=1]pipe:4|' : ''}[f=framecrc:flush_packets=1]pipe:5`];
}

class LiveCodec implements ExternalLiveCodec {
  readonly whenClosed: Promise<void>;
  #failed = false; get failed(): boolean { return this.#failed; }
  #cancel = new globalThis.AbortController(); #stopping = false; #ended = false; #writing = false; #bytes = 0;
  #child: ChildProcess; #ownerAbort: () => void;
  constructor(options: ExternalLiveCodecOptions, callbacks: ExternalLiveCodecCallbacks, private readonly owner: globalThis.AbortSignal,
    dependencies: ExternalLiveCodecDependencies) {
    this.#ownerAbort = () => { void this.stop(); }; owner.addEventListener('abort', this.#ownerAbort, { once: true });
    try { this.#child = spawnExternalFfmpeg(options.ffmpegPath, liveFfmpegArguments(options), {
      protectionPath: options.protectionPath, signal: this.#cancel.signal, launch: dependencies.launch,
      stdio: ['pipe', 'ignore', 'pipe', 'pipe', options.audio ? 'pipe' : 'ignore', 'pipe'],
    }); } catch { owner.removeEventListener('abort', this.#ownerAbort); throw unavailable(); }
    const child = this.#child;
    let timeBase: [number, number] = [0, 1], firstPts: bigint | undefined, observed = false, sourceComplete = false, tail = '';
    child.stderr?.on('data', (bytes: Buffer) => {
      // Only numeric pre-scale source observations survive; all other stderr is discarded.
      const text = tail + bytes.toString('utf8'); const lines = text.split('\n'); tail = lines.pop()!.slice(-2048);
      for (const line of lines) {
        if (sourceComplete || line.length > 2048 || !line.includes('[showinfo@blink_source @')) continue;
        const base = /config in time_base:\s*(\d+)\/(\d+)/.exec(line);
        if (base && Number(base[1]) > 0 && Number(base[1]) <= 1000000 && Number(base[2]) > 0 && Number(base[2]) <= 1000000) timeBase = [Number(base[1]), Number(base[2])];
        const size = /\bs:(\d+)x(\d+)\s/.exec(line);
        if (size && Number(size[1]) > 0 && Number(size[2]) > 0 && Number(size[1]) <= 4096 && Number(size[2]) <= 4096 && Number(size[1]) * Number(size[2]) <= 8388608) {
          const timestamp = /\bpts:\s*(-?\d+)\s/.exec(line); let numerator = 0, denominator = 1;
          if (timestamp && timeBase[0]) {
            const pts = BigInt(timestamp[1]);
            if (firstPts !== undefined && pts > firstPts && pts - firstPts <= 1000000n) {
              numerator = timeBase[1]; denominator = Number(pts - firstPts) * timeBase[0];
              const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a; const divisor = gcd(numerator, denominator);
              numerator /= divisor; denominator /= divisor; sourceComplete = true;
            }
            firstPts ??= pts;
          }
          if (observed && !sourceComplete) continue; observed = true;
          try { callbacks.sourceInfo?.({ width: Number(size[1]), height: Number(size[2]), fpsNumerator: numerator, fpsDenominator: denominator }); }
          catch { this.#failed = true; this.#cancel.abort(); }
        }
      }
    });
    const readable = (index: number): Readable => {
      const stream = child.stdio[index]; if (!stream || !('read' in stream)) throw unavailable(); return stream as Readable;
    };
    const closed = new Promise<number | null>(resolve => { child.once('close', resolve); });
    child.on('error', () => { if (!this.#stopping) this.#failed = true; this.#cancel.abort(); });
    child.stdin?.on('error', () => { if (!this.#stopping) this.#failed = true; this.#cancel.abort(); });
    const packets = readFfmpegPackets(readable(3), options.audio ? readable(4) : undefined, readable(5),
      { ...options.video, audio: options.audio }, callbacks.packet, this.#cancel.signal)
      .catch(() => { if (!this.#stopping) this.#failed = true; this.#cancel.abort(); });
    this.whenClosed = Promise.all([closed, packets]).then(([code]) => {
      if (!this.#stopping && (code !== 0 || !this.#ended)) this.#failed = true;
      this.owner.removeEventListener('abort', this.#ownerAbort);
    });
    if (owner.aborted) void this.stop();
  }
  async write(bytes: Buffer): Promise<void> {
    if (this.#stopping || this.#ended || this.#writing || this.owner.aborted || this.#failed || !bytes.length ||
        bytes.length > EXTERNAL_FFMPEG_LIMITS.inputBytes || this.#bytes + bytes.length > EXTERNAL_FFMPEG_LIMITS.liveInputBytes) throw unavailable();
    this.#writing = true; this.#bytes += bytes.length;
    try {
      await withinRequestBudget(new Promise<void>((resolve, reject) => {
        if (!this.#child.stdin) { reject(unavailable()); return; }
        this.#child.stdin.write(bytes, error => error ? reject(unavailable()) : resolve());
      }), { signal: this.#cancel.signal, deadline: Date.now() + EXTERNAL_FFMPEG_LIMITS.requestMs });
      if (this.#failed || this.#stopping || this.owner.aborted) throw unavailable();
    } catch { if (!this.#stopping) this.#failed = true; await this.stop(); throw unavailable(); }
    finally { this.#writing = false; }
  }
  async end(): Promise<void> {
    if (this.#stopping || this.#ended || this.#writing || this.#failed || this.owner.aborted) throw unavailable();
    this.#ended = true; this.#child.stdin?.end();
    try {
      await withinRequestBudget(this.whenClosed, { signal: this.#cancel.signal, deadline: Date.now() + EXTERNAL_FFMPEG_LIMITS.requestMs });
      if (this.#failed || this.owner.aborted) throw unavailable();
    } catch { if (!this.#stopping) this.#failed = true; await this.stop(); throw unavailable(); }
  }
  stop(): Promise<void> { this.#stopping = true; this.#cancel.abort(); return this.whenClosed; }
}

export async function createExternalLiveCodec(options: ExternalLiveCodecOptions, callbacks: ExternalLiveCodecCallbacks,
  signal: globalThis.AbortSignal, dependencies: ExternalLiveCodecDependencies = {}): Promise<ExternalLiveCodec> {
  signal.throwIfAborted();
  await (dependencies.probe ?? probeExternalFfmpeg)(options.ffmpegPath, options.protectionPath, signal, dependencies.launch);
  signal.throwIfAborted(); return new LiveCodec(options, callbacks, signal, dependencies);
}
