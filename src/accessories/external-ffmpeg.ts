/** External codec execution. The packaged helper restricts dumps before exec; no media URL or key is an argument. */
import { spawn, type ChildProcess, type SpawnOptions, type StdioOptions } from 'node:child_process';
import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { configuredFfmpegPath } from './ffmpeg-config';

const SETUP_MESSAGES = {
  missing: 'FFmpeg is not installed or executable. Install FFmpeg 6.1 or later and set ffmpegPath.',
  version: 'FFmpeg 6.1 or later is required. Upgrade FFmpeg and restart the Blink child bridge.',
  capabilities: 'FFmpeg lacks required codec, filter, format or pipe support. Install a full FFmpeg build with libx264 and libopus.',
  probe: 'FFmpeg could not complete its bounded capability check. Check the installation and restart the Blink child bridge.',
} as const;
export class ExternalFfmpegSetupError extends Error {
  constructor(readonly code: keyof typeof SETUP_MESSAGES) { super(SETUP_MESSAGES[code]); this.name = 'ExternalFfmpegSetupError'; }
}
export const EXTERNAL_FFMPEG_LIMITS = Object.freeze({ requestMs: 2000, stopMs: 1000, lifetimeMs: 300000,
  inputBytes: 65536, liveInputBytes: 128 * 1024 * 1024, outputBytes: 64 * 1024 * 1024, packetBytes: 1024 * 1024,
  probeBytes: 256 * 1024, probeMs: 5000 });

export function resolveExternalFfmpegPath(configured: unknown = 'ffmpeg'): string {
  let value: string;
  try { value = configuredFfmpegPath(configured); } catch { throw new ExternalFfmpegSetupError('missing'); }
  const candidates = isAbsolute(value) ? [value] : (process.env.PATH ?? '').split(delimiter).filter(isAbsolute)
    .flatMap(directory => process.platform === 'win32' && !value.toLowerCase().endsWith('.exe')
      ? [join(directory, `${value}.exe`), join(directory, value)] : [join(directory, value)]);
  for (const candidate of candidates) {
    try { const resolved = realpathSync(candidate); if (!statSync(resolved).isFile()) continue; accessSync(resolved, constants.X_OK); return resolved; }
    catch { /* Try the next ordinary PATH entry without exposing filesystem diagnostics. */ }
  }
  throw new ExternalFfmpegSetupError('missing');
}

export interface ExternalFfmpegProcessOptions {
  protectionPath: string;
  signal?: globalThis.AbortSignal;
  stdio?: StdioOptions;
  timeoutMs?: number;
  /** Test seam; production always executes through the packaged protection helper. */
  launch?: (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
}
export function spawnExternalFfmpeg(ffmpegPath: string, args: readonly string[], options: ExternalFfmpegProcessOptions): ChildProcess {
  const timeout = options.timeoutMs ?? EXTERNAL_FFMPEG_LIMITS.lifetimeMs;
  if (![ffmpegPath, options.protectionPath].every(value => isAbsolute(value) && !value.includes('\0')) ||
      !Number.isInteger(timeout) || timeout < 1 || timeout > EXTERNAL_FFMPEG_LIMITS.lifetimeMs ||
      args.some(value => typeof value !== 'string' || value.includes('\0')) || options.signal?.aborted) throw new Error('External FFmpeg unavailable');
  let child: ChildProcess;
  try { child = (options.launch ?? spawn)(options.protectionPath, ['--exec', ffmpegPath, ...args],
    { env: {}, stdio: options.stdio ?? ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true }); }
  catch { throw new Error('External FFmpeg unavailable'); }
  let kill: ReturnType<typeof globalThis.setTimeout> | undefined, closed = false;
  const stop = () => {
    if (closed || kill) return;
    child.kill('SIGTERM'); kill = globalThis.setTimeout(() => { if (!closed) child.kill('SIGKILL'); }, EXTERNAL_FFMPEG_LIMITS.stopMs);
  };
  const life = globalThis.setTimeout(stop, timeout);
  options.signal?.addEventListener('abort', stop, { once: true });
  // Raw codec diagnostics may contain media metadata. They are never public errors or logs.
  child.stderr?.on('data', () => undefined); child.stderr?.on('error', () => undefined);
  child.stdin?.on('error', () => undefined); child.on('error', () => undefined);
  child.once('close', () => { closed = true; globalThis.clearTimeout(life); globalThis.clearTimeout(kill); options.signal?.removeEventListener('abort', stop); });
  if (options.signal?.aborted) stop();
  return child;
}

async function capture(ffmpegPath: string, protectionPath: string, args: string[], signal?: globalThis.AbortSignal,
  launch?: ExternalFfmpegProcessOptions['launch']): Promise<string> {
  const controller = new globalThis.AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) controller.abort();
  const expiresAt = globalThis.performance.now() + EXTERNAL_FFMPEG_LIMITS.probeMs;
  const deadline = globalThis.setTimeout(abort, EXTERNAL_FFMPEG_LIMITS.probeMs);
  try {
    let child: ChildProcess;
    try { child = spawnExternalFfmpeg(ffmpegPath, args, { protectionPath, signal: controller.signal, timeoutMs: EXTERNAL_FFMPEG_LIMITS.probeMs,
      stdio: ['ignore', 'pipe', 'pipe'], launch }); } catch { throw new ExternalFfmpegSetupError('probe'); }
    return await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = []; let length = 0, failed = false;
      child.stdout?.on('data', (bytes: Buffer) => {
        if ((length += bytes.length) > EXTERNAL_FFMPEG_LIMITS.probeBytes) { failed = true; controller.abort(); return; }
        chunks.push(Buffer.from(bytes));
      });
      child.on('error', () => { failed = true; });
      child.once('close', code => code === 0 && !failed && !controller.signal.aborted && globalThis.performance.now() < expiresAt
        ? resolve(Buffer.concat(chunks).toString('utf8')) : reject(new ExternalFfmpegSetupError('probe')));
    });
  } finally {
    globalThis.clearTimeout(deadline);
    signal?.removeEventListener('abort', abort);
  }
}

const MAX_CACHED_PROBES = 16;
const completedProbes = new Map<string, string>();

function probeIdentity(ffmpegPath: string, protectionPath: string): string {
  try {
    return JSON.stringify([ffmpegPath, protectionPath].map(path => {
      if (!isAbsolute(path) || path.includes('\0')) throw new Error();
      const stat = statSync(path, { bigint: true });
      if (!stat.isFile()) throw new Error();
      return [path, stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String);
    }));
  } catch { throw new ExternalFfmpegSetupError('missing'); }
}

export async function probeExternalFfmpeg(ffmpegPath: string, protectionPath: string, signal?: globalThis.AbortSignal,
  launch?: ExternalFfmpegProcessOptions['launch']): Promise<{ version: string }> {
  signal?.throwIfAborted();
  const identity = probeIdentity(ffmpegPath, protectionPath);
  if (launch) return inspect();
  const cachedVersion = completedProbes.get(identity);
  if (cachedVersion !== undefined) return { version: cachedVersion };

  // Unfinished inspections belong to the initiating request, including its abort signal.
  const result = await inspect();
  signal?.throwIfAborted();
  if (probeIdentity(ffmpegPath, protectionPath) !== identity) throw new ExternalFfmpegSetupError('probe');
  completedProbes.set(identity, result.version);
  if (completedProbes.size > MAX_CACHED_PROBES) {
    const oldest = completedProbes.keys().next();
    if (!oldest.done) completedProbes.delete(oldest.value);
  }
  return result;

  async function inspect(): Promise<{ version: string }> {
    const versionText = await capture(ffmpegPath, protectionPath, ['-hide_banner', '-version'], signal, launch);
    const match = /^ffmpeg version\s+n?(\d+)\.(\d+)(?:\.\d+)?[^\r\n]*/m.exec(versionText);
    if (!match || Number(match[1]) < 6 || (Number(match[1]) === 6 && Number(match[2]) < 1)) throw new ExternalFfmpegSetupError('version');
    const requirements: Array<[string, string[]]> = [
      ['-protocols', ['pipe', 'fd']], ['-demuxers', ['mpegts', 'mov', 'mp4', 'lavfi']],
      ['-decoders', ['h264', 'aac', 'aac_latm']],
      ['-encoders', ['libx264', 'libopus', 'pcm_alaw', 'pcm_mulaw', 'aac', 'rawvideo', 'pcm_f32le']],
      ['-muxers', ['tee', 'data', 'framecrc', 'mp4']], ['-bsfs', ['h264_mp4toannexb', 'setts']],
      ['-filters', ['scale', 'pad', 'select', 'aresample', 'asetnsamples', 'anullsrc', 'showinfo', 'format', 'settb', 'setpts', 'setsar']],
    ];
    for (const [flag, names] of requirements) {
      const output = await capture(ffmpegPath, protectionPath, ['-hide_banner', flag], signal, launch);
      const available = new Set(output.split(/\r?\n/).flatMap(line => {
        if (flag === '-protocols' || flag === '-bsfs') return /^[a-z0-9_]+$/.test(line.trim()) ? [line.trim()] : [];
        const entry = /^\s*[A-Z.]{1,6}\s+(?:d\s+)?([a-z0-9_,]+)\s/.exec(line);
        return entry ? entry[1].split(',') : [];
      }));
      if (names.some(name => !available.has(name))) throw new ExternalFfmpegSetupError('capabilities');
    }
    return { version: `${match[1]}.${match[2]}` };
  }
}
