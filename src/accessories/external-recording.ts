/** External finite codec work. Only already-owned regular descriptors and byte pipes cross the boundary. */
import { Buffer } from 'node:buffer';
import type { FileHandle } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import type { CameraRecordingConfiguration } from 'homebridge';
import { spawnExternalFfmpeg } from './external-ffmpeg';
import { FfmpegByteQueue, parseFrameCrcPacket, packetAdler32 } from './ffmpeg-packets';

const codes = ['MEDIA', 'DECODE', 'VIDEO_FRAME_COUNT', 'VIDEO_DISCONTINUITY', 'VIDEO_TIMESTAMP', 'AUDIO_MISSING',
  'AUDIO_DISCONTINUITY', 'OUTPUT_LIMIT', 'FRAGMENT_LIMIT', 'TIME_LIMIT', 'EXTERNAL_FFMPEG'] as const;
export type RecordingFailureCode = typeof codes[number];
export function isRecordingFailureCode(value: unknown): value is RecordingFailureCode {
  return typeof value === 'string' && (codes as readonly string[]).includes(value);
}
export class ExternalRecordingError extends Error {
  constructor(readonly code: RecordingFailureCode) { super('External recording conversion failed'); }
}
export interface ExternalRecordingContext {
  ffmpegPath: string; protectionPath: string; signal: globalThis.AbortSignal; deadline: number;
  /** A fresh read-only description of the private, content-verified snapshot; its offset starts at zero. */
  open(): Promise<FileHandle>;
}
interface Picture { pts: number; duration: number; }
export interface ExternalRecordingPlan {
  pictures: readonly Picture[]; selected: readonly Picture[]; durationUs: number; originUs: number;
  metadata: number; corrections: readonly { at: number; offset: number }[];
}
const failure = (code: RecordingFailureCode = 'DECODE'): never => { throw new ExternalRecordingError(code); };
function micros(value: bigint, numerator: bigint, denominator: bigint): number {
  const product = value * numerator * 1000000n;
  const result = product < 0n ? -((-product + denominator / 2n) / denominator) : (product + denominator / 2n) / denominator;
  if (result < -300000000n || result > 300000000n) failure('VIDEO_TIMESTAMP');
  return Number(result);
}
async function lines(stream: Readable, consume: (line: string) => Promise<void> | void): Promise<void> {
  let tail = '';
  for await (const value of stream) {
    const bytes: Buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
    if (bytes.some(byte => (byte < 32 && byte !== 10 && byte !== 13) || byte > 126)) failure();
    const all = (tail + bytes.toString('ascii')).split('\n'); tail = all.pop()!;
    for (const line of all) { if (line.length > 1024) failure(); await consume(line.endsWith('\r') ? line.slice(0, -1) : line); }
    if (tail.length > 1024) failure();
  }
  if (tail) failure();
}
function readable(value: unknown): Readable {
  if (!value || typeof value !== 'object' || !('read' in value)) failure('EXTERNAL_FFMPEG');
  return value as Readable;
}
function launch(context: ExternalRecordingContext, args: string[], stdio: Parameters<typeof spawnExternalFfmpeg>[2]['stdio']) {
  context.signal.throwIfAborted();
  const remaining = Math.ceil(context.deadline - Date.now()); if (remaining < 1) failure('TIME_LIMIT');
  return spawnExternalFfmpeg(context.ffmpegPath, args, { protectionPath: context.protectionPath, signal: context.signal,
    timeoutMs: remaining, stdio });
}
const inputArguments = ['-hide_banner', '-nostdin', '-loglevel', 'repeat+error', '-max_alloc', '67108864', '-copyts', '-start_at_zero', '-threads', '1',
  '-filter_threads', '1', '-max_pixels', '8388608', '-protocol_whitelist', 'fd,pipe', '-format_whitelist', 'mov,mp4,m4a,3gp,3g2,mj2',
  '-codec_whitelist', 'h264,aac', '-probesize', '65536', '-analyzeduration', '1000000', '-max_probe_packets', '32',
  '-max_streams', '8', '-f', 'mp4', '-i', 'fd:'];

/** Parse only access-unit framing and bounded SEI syntax, never decode pictures in JavaScript. */
function picturePacket(data: Buffer): boolean {
  const starts: Array<{ at: number; prefix: number }> = [];
  for (let at = 0; at + 2 < data.length; at++) {
    if (data[at] || data[at + 1]) continue;
    const prefix = data[at + 2] === 1 ? 3 : at + 3 < data.length && data[at + 2] === 0 && data[at + 3] === 1 ? 4 : 0;
    if (prefix) { starts.push({ at, prefix }); at += prefix - 1; }
  }
  if (!starts.length || starts.length > 2048 || data.subarray(0, starts[0].at).some(byte => byte)) failure();
  let picture = false, onlySei = true;
  for (let index = 0; index < starts.length; index++) {
    const start = starts[index].at + starts[index].prefix;
    let end = starts[index + 1]?.at ?? data.length;
    while (end > start && data[end - 1] === 0) end--;
    if (end <= start || data[start] & 128) failure();
    const type = data[start] & 31;
    if (!type || type > 23) failure();
    picture ||= type >= 1 && type <= 5; onlySei &&= type === 6;
    if (type !== 6) continue;
    const rbsp: number[] = []; let zeros = 0;
    for (let at = start + 1; at < end; at++) {
      if (zeros === 2 && data[at] === 3) {
        if (at + 1 >= end || data[at + 1] > 3) failure(); zeros = 0; continue;
      }
      rbsp.push(data[at]); zeros = data[at] === 0 ? zeros + 1 : 0;
    }
    if (rbsp.at(-1) !== 128) failure();
    let at = 0;
    while (at < rbsp.length - 1) {
      while (at < rbsp.length - 1 && rbsp[at] === 255) at++;
      if (at >= rbsp.length - 1) failure(); at++;
      let length = 0;
      while (at < rbsp.length - 1 && rbsp[at] === 255) { length += 255; at++; }
      if (at >= rbsp.length - 1) failure(); length += rbsp[at++];
      if (length > rbsp.length - 1 - at) failure(); at += length;
    }
    if (at !== rbsp.length - 1) failure();
  }
  if (!picture && !onlySei) failure();
  return picture;
}

/** Only these fixed decoder errors are tolerated, and only for prevalidated empty SEI access units. */
function observeMetadataErrors(stream: Readable, expected: () => number): () => boolean {
  let tail = '', invalid = false, noFrame = 0, submission = 0, missing = 0, total = 0;
  stream.on('data', (bytes: Buffer) => {
    if ((total += bytes.length) > 64 * 1024) { invalid = true; return; }
    const all = (tail + bytes.toString('utf8')).split('\n'); tail = all.pop()!;
    for (const line of all) {
      if (!line) continue;
      if (line.length > 1024) { invalid = true; continue; }
      if (/^\[h264 @ (?:0x)?[0-9a-fA-F]+\] missing picture in access unit with size \d+$/.test(line)) missing++;
      else if (/^\[h264 @ (?:0x)?[0-9a-fA-F]+\] no frame!$/.test(line)) noFrame++;
      else if (/^\[vist#0:0\/h264 @ (?:0x)?[0-9a-fA-F]+\](?: \[dec:h264 @ (?:0x)?[0-9a-fA-F]+\])? Error submitting packet to decoder: Invalid data found when processing input$/.test(line)) submission++;
      else invalid = true;
    }
    if (tail.length > 1024) invalid = true;
  });
  return () => !invalid && !tail && missing <= expected() * 2 && noFrame <= expected() && submission <= expected();
}

export async function inspectExternalRecording(context: ExternalRecordingContext, fps: number): Promise<ExternalRecordingPlan> {
  const input = await context.open(), controller = new globalThis.AbortController();
  const abort = () => controller.abort(); context.signal.addEventListener('abort', abort, { once: true });
  // Opening the regular snapshot can yield; replay revocation that preceded
  // listener registration before admitting any external process.
  if (context.signal.aborted) controller.abort();
  const queue = new FfmpegByteQueue(controller.signal), pictures: Picture[] = [], corrections: Array<{ at: number; offset: number }> = [];
  let metadata = 0, offset = 0n, previousEnd: bigint | undefined, pending = false, frames = 0, bytes = 0;
  let closure: Promise<number | null> | undefined;
  let numerator = 0n, denominator = 0n, header = false, dimensions = false;
  try {
    const child = launch({ ...context, signal: controller.signal }, [...inputArguments, '-map', '0:v:0', '-an', '-c:v', 'copy',
      '-bsf:v', 'h264_mp4toannexb', '-f', 'tee', '[f=data:flush_packets=1]pipe:1|[f=framecrc:flush_packets=1]pipe:3'], [input.fd, 'pipe', 'pipe', 'pipe']);
    const okay = observeMetadataErrors(readable(child.stderr), () => metadata);
    const closed = closure = new Promise<number | null>(resolve => { child.once('close', resolve); child.once('error', () => resolve(null)); });
    const raw = async () => { for await (const value of readable(child.stdout)) {
      const part: Buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
      if ((bytes += part.length) > 34 * 1024 * 1024) failure('OUTPUT_LIMIT'); await queue.push(part);
    } queue.end(); };
    const meta = lines(readable(child.stdio[3]), async line => {
      if (line.startsWith('#')) {
        if (frames) failure();
        const tb = /^#tb 0: (\d+)\/(\d+)$/.exec(line);
        if (tb) { numerator = BigInt(tb[1]); denominator = BigInt(tb[2]);
          if (!numerator || !denominator || numerator > 1000000n || denominator > 1000000000n) failure(); }
        if (line === '#codec_id 0: h264') header = true;
        const size = /^#dimensions 0: (\d+)x(\d+)$/.exec(line);
        if (size) { const width = Number(size[1]), height = Number(size[2]);
          if (width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 8388608) failure(); dimensions = true; }
        return;
      }
      const row = parseFrameCrcPacket(line); if (!row) return;
      if (!header || !dimensions || !numerator || !denominator || row.streamIndex !== 0 || ++frames > 10000 ||
          row.duration <= 0n || row.pts < -(1n << 62n) || row.pts > (1n << 62n)) failure();
      const data = await queue.take(row.size);
      try {
        if (packetAdler32(data) !== row.checksum) failure();
        const hasPicture = picturePacket(data), period = micros(row.duration, numerator, denominator);
        if (period < 1 || period > 1000000) failure('VIDEO_TIMESTAMP');
        if (!hasPicture) {
          if (++metadata > 512 || row.pts !== row.dts || previousEnd === undefined || row.dts !== previousEnd) failure('VIDEO_DISCONTINUITY');
          offset += row.duration; pending = true;
        } else {
          if (pending) {
            if (row.pts !== row.dts || row.dts !== previousEnd) failure('VIDEO_DISCONTINUITY');
            corrections.push({ at: micros(row.pts, numerator, denominator), offset: micros(offset, numerator, denominator) }); pending = false;
          }
          pictures.push({ pts: micros(row.pts - offset, numerator, denominator), duration: period });
        }
        previousEnd = row.dts + row.duration;
      } finally { data.fill(0); }
    });
    const guard = async (work: Promise<unknown>) => { try { await work; } catch (error) { controller.abort(); throw error; } };
    await Promise.all([guard(raw()), guard(meta), guard(closed.then(code => { if (code !== 0) failure('MEDIA'); }))]);
    await queue.finish(); context.signal.throwIfAborted(); if (!okay() || !pictures.length || pictures.length > 9000) failure();
    pictures.sort((a, b) => a.pts - b.pts); const origin = pictures[0].pts;
    for (let i = 0; i < pictures.length; i++) {
      pictures[i].pts -= origin;
      if (i && pictures[i].pts <= pictures[i - 1].pts) failure('VIDEO_TIMESTAMP');
    }
    const selected: Picture[] = []; let bucket = -1;
    for (const picture of pictures) { const next = Math.floor(picture.pts * fps / 1000000 + 0.0001);
      if (next > bucket) { selected.push(picture); bucket = next; } }
    const last = selected.at(-1)!;
    const durationUs = last.pts + Math.max(last.duration, Math.round(1000000 / fps));
    if (durationUs < 1 || durationUs > 90000000) failure('VIDEO_TIMESTAMP');
    return { pictures, selected, durationUs, originUs: origin, metadata, corrections };
  } finally { controller.abort(); await closure; queue.dispose(); context.signal.removeEventListener('abort', abort); await input.close(); }
}

export function recordingFfmpegArguments(configuration: CameraRecordingConfiguration, plan: ExternalRecordingPlan,
  audioActive: boolean, silence: boolean): string[] {
  const v = configuration.videoCodec, [width, height, fps] = v.resolution;
  const rate = configuration.audioCodec.samplerate === 1 ? 16000 : 24000;
  let correction = '0';
  for (const item of plan.corrections) correction = `if(gte(PTS,${item.at}),${item.offset},${correction})`;
  // Preserve the common source timeline. Resetting each track independently
  // would erase a real A/V offset and invert it after AAC encoder priming.
  const filter = `settb=1/1000000,setpts='PTS-(${correction})',` +
    `select='isnan(prev_selected_t)+gt(floor((t-start_t)*${fps}+0.0001),floor((prev_selected_t-start_t)*${fps}+0.0001))',` +
    `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`;
  const interval = Math.max(0.1, (Math.min(configuration.mediaContainerConfiguration.fragmentLength, v.parameters.iFrameInterval) - 200) / 1000);
  const sourceArguments = [...inputArguments.slice(0, -2), ...(!audioActive || silence ? ['-an'] : []), ...inputArguments.slice(-2)];
  return [...sourceArguments.slice(0, 6), ...(plan.metadata ? ['-err_detect', 'explode'] : ['-xerror', '-err_detect', 'explode']),
    ...sourceArguments.slice(6), ...(silence ? ['-f', 'lavfi', '-i', `anullsrc=r=${rate}:cl=mono`] : []),
    '-map', '0:v:0', ...(audioActive ? ['-map', silence ? '1:a:0' : '0:a:0'] : ['-an']),
    '-vf', filter, '-fps_mode:v', 'passthrough', '-enc_time_base:v', '1/1000000', '-c:v', 'libx264', '-threads:v', '1',
    '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p', '-bf', '0',
    '-profile:v', ['baseline', 'main', 'high'][v.parameters.profile], '-level:v', ['3.1', '3.2', '4.0'][v.parameters.level],
    '-b:v', String(v.parameters.bitRate * 1000), '-maxrate:v', String(v.parameters.bitRate * 1000), '-bufsize:v', String(v.parameters.bitRate * 1000),
    '-sc_threshold', '0', '-force_key_frames', `expr:gte(t,n_forced*${interval})`,
    '-bsf:v', `setts=duration='if(eq(N,${plan.selected.length - 1}),${plan.durationUs - plan.selected.at(-1)!.pts},DURATION)'`,
    ...(audioActive ? ['-c:a', 'aac', '-profile:a', 'aac_low', '-threads:a', '1', '-ar', String(rate), '-ac', '1',
      '-b:a', String(configuration.audioCodec.bitrate * 1000), '-af', 'aresample=async=1:min_comp=0.002:min_hard_comp=0.002'] : []),
    '-t', String((plan.originUs + plan.durationUs) / 1000000), '-avoid_negative_ts', 'disabled', '-use_editlist', '1',
    '-movflags', 'frag_keyframe+delay_moov+default_base_moof+skip_trailer', '-f', 'mp4', 'pipe:1'];
}

export async function convertExternalRecording(context: ExternalRecordingContext, configuration: CameraRecordingConfiguration,
  plan: ExternalRecordingPlan, audioActive: boolean, silence: boolean, collect: (bytes: Buffer) => void): Promise<void> {
  const input = await context.open(), controller = new globalThis.AbortController(), abort = () => controller.abort();
  context.signal.addEventListener('abort', abort, { once: true }); if (context.signal.aborted) controller.abort();
  let closure: Promise<number | null> | undefined;
  try {
    const child = launch({ ...context, signal: controller.signal }, recordingFfmpegArguments(configuration, plan, audioActive, silence), [input.fd, 'pipe', 'pipe']);
    const okay = observeMetadataErrors(readable(child.stderr), () => plan.metadata);
    const closed = closure = new Promise<number | null>(resolve => { child.once('close', resolve); child.once('error', () => resolve(null)); });
    let bytes = 0, failed = false;
    child.stdout?.on('data', (value: Buffer) => {
      try { context.signal.throwIfAborted(); if ((bytes += value.length) > 32 * 1024 * 1024) failure('OUTPUT_LIMIT'); collect(value); }
      catch { failed = true; controller.abort(); }
    });
    const code = await closed; context.signal.throwIfAborted();
    if (failed) failure('OUTPUT_LIMIT');
    if (code !== 0 || !okay() || !bytes) failure(silence ? 'DECODE' : audioActive ? 'AUDIO_DISCONTINUITY' : 'DECODE');
  } finally { controller.abort(); await closure; context.signal.removeEventListener('abort', abort); await input.close(); }
}

/** A separate decoder pass validates actual pictures/audio clocks, not only MP4 container declarations. */
export async function validateExternalRecording(context: ExternalRecordingContext, data: Buffer,
  configuration: CameraRecordingConfiguration, plan: ExternalRecordingPlan, audioActive: boolean): Promise<void> {
  const controller = new globalThis.AbortController(), abort = () => controller.abort();
  context.signal.addEventListener('abort', abort, { once: true }); if (context.signal.aborted) controller.abort();
  let closed: Promise<number | null> | undefined;
  try {
  const child = launch({ ...context, signal: controller.signal }, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-xerror', '-err_detect', 'explode', '-max_alloc', '67108864',
    '-threads', '1', '-protocol_whitelist', 'pipe', '-f', 'mp4', '-i', 'pipe:0', '-map', '0:v:0',
    ...(audioActive ? ['-map', '0:a:0'] : ['-an']), '-c:v', 'rawvideo', '-threads:v', '1', '-fps_mode:v', 'passthrough',
    '-enc_time_base:v', '1/1000000', '-c:a', 'pcm_f32le',
    '-f', 'framecrc', 'pipe:1'], ['pipe', 'pipe', 'pipe']);
  closed = new Promise<number | null>(resolve => { child.once('close', resolve); child.once('error', () => resolve(null)); });
  child.stdin?.on('error', () => undefined); child.stdin?.end(data);
  let count = 0, bytes = 0, videoOrigin: number | undefined, audioFirst: number | undefined, audioEnd = 0;
  let videoShape = false, audioRate = false, audioMono = false;
  const bases = [{ numerator: 0n, denominator: 0n }, { numerator: 0n, denominator: 0n }];
  const rate = configuration.audioCodec.samplerate === 1 ? 16000 : 24000;
  const parsed = lines(readable(child.stdout), line => {
    if ((bytes += line.length + 1) > 2 * 1024 * 1024) failure('OUTPUT_LIMIT');
    const tb = /^#tb ([01]): (\d+)\/(\d+)$/.exec(line);
    if (tb) { const base = bases[Number(tb[1])]; base.numerator = BigInt(tb[2]); base.denominator = BigInt(tb[3]); return; }
    const dimensions = /^#dimensions 0: (\d+)x(\d+)$/.exec(line);
    if (dimensions) { videoShape = Number(dimensions[1]) === configuration.videoCodec.resolution[0] &&
      Number(dimensions[2]) === configuration.videoCodec.resolution[1]; return; }
    if (line.startsWith('#sample_rate 1: ')) { audioRate = line === `#sample_rate 1: ${rate}`; return; }
    if (/^#channel_layout(?:_name)? 1: /.test(line)) { audioMono = /^#channel_layout(?:_name)? 1: mono$/.test(line); return; }
    const row = parseFrameCrcPacket(line, 1920 * 1080 * 4); if (!row) return;
    const base = bases[row.streamIndex]; if (!base?.numerator || !base.denominator) failure();
    const pts = micros(row.pts, base.numerator, base.denominator), duration = micros(row.duration, base.numerator, base.denominator);
    if (row.streamIndex === 0) {
      if (!videoShape) failure('DECODE');
      videoOrigin ??= pts; const picture = plan.selected[count++];
      if (!picture || Math.abs(pts - videoOrigin - picture.pts) > 12) failure('VIDEO_DISCONTINUITY');
    } else {
      if (!audioActive || !audioRate || !audioMono || row.size % 4 || row.size / 4 > 8192 || duration <= 0 || duration > 1000000 ||
          row.duration * base.numerator * BigInt(rate) * 4n !== BigInt(row.size) * base.denominator) failure('AUDIO_DISCONTINUITY');
      audioFirst ??= pts;
      if (audioEnd && Math.abs(pts - audioEnd) > 2000) failure('AUDIO_DISCONTINUITY');
      audioEnd = pts + duration;
    }
  });
    const [code] = await Promise.all([closed, parsed]); context.signal.throwIfAborted();
    if (code !== 0) failure('DECODE');
    if (count !== plan.selected.length || videoOrigin === undefined) failure('VIDEO_FRAME_COUNT');
    const tolerance = 2048 * 1000000 / rate + 2000;
    if (audioActive && (audioFirst === undefined || Math.abs(audioFirst - videoOrigin!) > tolerance ||
        Math.abs(audioEnd - videoOrigin! - plan.durationUs) > tolerance)) failure('AUDIO_DISCONTINUITY');
  } catch (error) { controller.abort(); await closed; throw error; }
  finally { controller.abort(); context.signal.removeEventListener('abort', abort); }
}
