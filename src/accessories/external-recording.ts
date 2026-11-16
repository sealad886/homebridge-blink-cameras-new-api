/** External finite codec work. Only already-owned regular descriptors and byte pipes cross the boundary. */
import { Buffer } from 'node:buffer';
import type { FileHandle } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import type { CameraRecordingConfiguration } from 'homebridge';
import { spawnExternalFfmpeg } from './external-ffmpeg';
import { FfmpegByteQueue, parseFrameCrcPacket, packetAdler32 } from './ffmpeg-packets';
import { squarePixelLetterboxFilter } from './ffmpeg-video-filter';

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
/** Microseconds: corrected PTS relative to the first corrected video picture, and positive picture duration. */
interface Picture { pts: number; duration: number; }
export interface ExternalRecordingPlan {
  /** First video track's input stream index, derived from the verified ordinary MP4 track inventory. */
  videoStreamIndex: number;
  pictures: readonly Picture[]; selected: readonly Picture[];
  /** Corrected video end relative to originUs; selection does not change the source duration. */
  durationUs: number;
  /** First corrected video PTS on the shared input timeline after copyts/start_at_zero. */
  originUs: number;
  /** First decoded audio PTS on that input timeline, after AAC priming/edit handling; undefined if unobserved. */
  audioOriginUs?: number;
  /** Proven AAC failure from the isolated source-audio decode, eligible for the single silence retry. */
  audioFailure?: 'AUDIO_DISCONTINUITY';
  metadata: number;
  /** Raw input-microsecond breakpoints and the cumulative metadata duration to subtract from video PTS. */
  corrections: readonly { at: number; offset: number }[];
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
  // Ordinary MP4 headers supply stream parameters. Probing otherwise decodes
  // unused AAC before input -an applies; actual output has its own decoder pass.
  '-max_streams', '8', '-nofind_stream_info', '-f', 'mp4', '-i', 'fd:'];

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

const MAX_METADATA_SAMPLES = 512;
const MAX_METADATA_DIAGNOSTIC_LINE_BYTES = 1024;
// Per admitted metadata sample: at most two missing-picture lines, one
// no-frame line and one decoder-submission line, each including its newline.
const MAX_METADATA_DIAGNOSTIC_BYTES = MAX_METADATA_SAMPLES * 4 * (MAX_METADATA_DIAGNOSTIC_LINE_BYTES + 1);

/** MOV creates one input stream per trak, in encounter order. Read only bounded
 * box headers/handler types; never infer stream identity from decoder errors. */
async function sourceVideoStreamIndex(context: ExternalRecordingContext, input: FileHandle): Promise<number> {
  const check = () => { context.signal.throwIfAborted(); if (Date.now() >= context.deadline) failure('TIME_LIMIT'); };
  check(); const stat = await input.stat(); check();
  if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size < 8 || stat.size > 32 * 1024 * 1024) failure('MEDIA');
  const read = async (position: number, length: number): Promise<Buffer> => {
    const bytes = Buffer.alloc(length);
    for (let used = 0; used < length;) {
      check(); const result = await input.read(bytes, used, length - used, position + used); check();
      if (!result.bytesRead) failure('MEDIA'); used += result.bytesRead;
    }
    return bytes;
  };
  interface Box { type: string; payload: number; end: number; }
  let count = 0;
  const boxes = async (from: number, end: number): Promise<Box[]> => {
    const result: Box[] = [];
    for (let at = from; at < end;) {
      if (++count > 2048 || end - at < 8) failure('MEDIA');
      const header = await read(at, 8), type = header.toString('latin1', 4, 8); let size = header.readUInt32BE(0), length = 8;
      if (size === 1) {
        if (end - at < 16) failure('MEDIA');
        const large = (await read(at + 8, 8)).readBigUInt64BE();
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) failure('MEDIA'); size = Number(large); length = 16;
      } else if (!size) size = end - at;
      if (size < length || size > end - at) failure('MEDIA');
      result.push({ type, payload: at + length, end: at + size }); at += size;
    }
    return result;
  };
  const inventory = new Map<Box, Box[]>();
  const children = async (box: Box): Promise<Box[]> => {
    const cached = inventory.get(box); if (cached) return cached;
    const start = box.payload + (box.type === 'meta' ? 4 : 0); if (start > box.end) failure('MEDIA');
    const value = await boxes(start, box.end); inventory.set(box, value); return value;
  };
  const single = (values: Box[], type: string): Box => {
    const matches = values.filter(box => box.type === type); if (matches.length !== 1) failure('MEDIA'); return matches[0];
  };
  const roots = await boxes(0, stat.size), movie = single(roots, 'moov');
  // Compressed/cover-art layouts can add streams outside the ordinary trak
  // inventory. Refuse them explicitly rather than accepting the wrong index.
  if (roots.some(box => ['meta', 'cmov', 'covr'].includes(box.type))) failure('MEDIA');
  const inspectMetadata = async (values: Box[], depth: number): Promise<void> => {
    if (depth > 8) failure('MEDIA');
    for (const box of values) {
      if (['cmov', 'covr'].includes(box.type) || (box.type === 'trak' && depth !== 1)) failure('MEDIA');
      if (box.type === 'keys') {
        if (box.end - box.payload < 8) failure('MEDIA');
        const entries = (await read(box.payload + 4, 4)).readUInt32BE(); if (entries > 2048) failure('MEDIA');
        let at = box.payload + 8;
        for (let index = 0; index < entries; index++) {
          if (++count > 2048 || box.end - at < 8) failure('MEDIA');
          const entry = await read(at, 8), size = entry.readUInt32BE(); if (size < 8 || size > box.end - at) failure('MEDIA');
          const artwork = 'com.apple.quicktime.artwork';
          if (entry.toString('latin1', 4, 8) === 'mdta' && size - 8 === artwork.length &&
              (await read(at + 8, artwork.length)).toString('latin1') === artwork) failure('MEDIA');
          at += size;
        }
        if (at !== box.end) failure('MEDIA');
      }
      if (['moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'meta', 'ilst'].includes(box.type)) await inspectMetadata(await children(box), depth + 1);
    }
  };
  await inspectMetadata([movie], 0);
  const tracks = (await children(movie)).filter(box => box.type === 'trak'); if (!tracks.length || tracks.length > 8) failure('MEDIA');
  for (const [index, track] of tracks.entries()) {
    const media = single(await children(track), 'mdia'), handler = single(await children(media), 'hdlr');
    if (handler.end - handler.payload < 12) failure('MEDIA');
    if ((await read(handler.payload + 8, 4)).toString('latin1') === 'vide') return index;
  }
  return failure('MEDIA');
}

/** Classify failed operations by component; no diagnostic here can make output acceptable. */
function audioConversionDiagnostic(line: string): 'audio' | 'related' | undefined {
  const address = '(?:0x)?[0-9a-fA-F]+', error = '(?:Invalid data found when processing input|Error number -[0-9]+ occurred)';
  const decoder = `\\[aist#0:[0-7]/aac @ ${address}\\](?: \\[dec:aac @ ${address}\\])? `;
  if (new RegExp(`^${decoder}(?:Error (?:submitting (?:packet|EOF) to decoder|processing packet in decoder)|Decoding error): ${error}$`).test(line) ||
      line === "Stream map '0:a:0' matches no streams." ||
      line === "Failed to set value '0:a:0' for option 'map': Invalid argument") return 'audio';
  // AAC codec detail text varies by damaged bitstream. Its bounded component
  // prefix is related evidence, but a failed operation above must still prove
  // the audio cause. Unknown components and all video errors remain terminal.
  if (new RegExp(`^\\[aac @ ${address}\\] [\\x20-\\x7e]+$`).test(line) ||
      new RegExp(`^${decoder}(?:Task finished with error code: -[0-9]+|Terminating thread with return code -[0-9]+) \\(${error}\\)$`).test(line) ||
      ["Stream map '' matches no streams.", "To ignore this, add a trailing '?' to the map.",
        'Error parsing options for output file pipe:1.', 'Error opening output files: Invalid argument', 'Conversion failed!'].includes(line)) return 'related';
  return undefined;
}

/** Only these fixed decoder errors are tolerated, and only for prevalidated empty SEI access units. */
function observeMetadataErrors(stream: Readable, expected: () => number, videoStreamIndex: number, classifyAudio = false) {
  if (!Number.isInteger(videoStreamIndex) || videoStreamIndex < 0 || videoStreamIndex > 7) failure('MEDIA');
  const submitted = new RegExp(`^\\[vist#0:${videoStreamIndex}/h264 @ (?:0x)?[0-9a-fA-F]+\\](?: \\[dec:h264 @ (?:0x)?[0-9a-fA-F]+\\])? Error submitting packet to decoder: Invalid data found when processing input$`);
  let tail = '', invalid = false, otherFailure = false, audioFailure = false, noFrame = 0, submission = 0, missing = 0, total = 0;
  stream.on('data', (bytes: Buffer) => {
    if ((total += bytes.length) > MAX_METADATA_DIAGNOSTIC_BYTES) { invalid = otherFailure = true; return; }
    const all = (tail + bytes.toString('utf8')).split('\n'); tail = all.pop()!;
    for (const line of all) {
      if (!line) continue;
      if (line.length > MAX_METADATA_DIAGNOSTIC_LINE_BYTES) { invalid = otherFailure = true; continue; }
      // Without stream-info decoding, the H.264 parser can retain its NULL
      // codec context label. Only the same fixed missing-picture text is allowed.
      if (/^\[(?:h264|NULL) @ (?:0x)?[0-9a-fA-F]+\] missing picture in access unit with size \d+$/.test(line)) missing++;
      else if (/^\[h264 @ (?:0x)?[0-9a-fA-F]+\] no frame!$/.test(line)) noFrame++;
      else if (submitted.test(line)) submission++;
      else {
        invalid = true;
        const category = classifyAudio ? audioConversionDiagnostic(line) : undefined;
        if (category === 'audio') audioFailure = true; else if (category !== 'related') otherFailure = true;
      }
    }
    if (tail.length > MAX_METADATA_DIAGNOSTIC_LINE_BYTES) invalid = otherFailure = true;
  });
  const metadataValid = () => !tail && missing <= expected() * 2 && noFrame <= expected() && submission <= expected();
  return { valid: () => !invalid && metadataValid(), audioFailed: () => audioFailure && !otherFailure && metadataValid() };
}

type AudioOriginObservation = { kind: 'decoded'; originUs: number } | { kind: 'damaged' } | { kind: 'unobserved' };
const MAX_AUDIO_OBSERVATION_BYTES = 2 * 1024 * 1024;
// The shortest valid PCM framecrc row plus newline occupies 21 bytes.
const MAX_AUDIO_OBSERVATION_ROWS = Math.floor(MAX_AUDIO_OBSERVATION_BYTES / 21);
/** Validate source audio through the selected video end without encoding video.
 * Retain the first decoded PTS so AAC priming/edit lists preserve the A/V offset. */
async function inspectSourceAudio(context: ExternalRecordingContext, videoStreamIndex: number, endUs: number): Promise<AudioOriginObservation> {
  const input = await context.open(), controller = new globalThis.AbortController(), abort = () => controller.abort();
  context.signal.addEventListener('abort', abort, { once: true }); if (context.signal.aborted) controller.abort();
  let closed: Promise<number | null> | undefined;
  try {
    const child = launch({ ...context, signal: controller.signal }, [...inputArguments.slice(0, -2), '-vn', ...inputArguments.slice(-2),
      '-map', '0:a:0?', '-vn', '-c:a', 'pcm_f32le', '-threads:a', '1', '-ac', '1', '-t', String(endUs / 1000000),
      '-f', 'framecrc', 'pipe:1'], [input.fd, 'pipe', 'pipe']);
    const okay = observeMetadataErrors(readable(child.stderr), () => 0, videoStreamIndex, true);
    closed = new Promise<number | null>(resolve => { child.once('close', resolve); child.once('error', () => resolve(null)); });
    let numerator = 0n, denominator = 0n, bytes = 0, rows = 0, origin: number | undefined;
    const parsed = lines(readable(child.stdout), line => {
      if ((bytes += line.length + 1) > MAX_AUDIO_OBSERVATION_BYTES) failure('OUTPUT_LIMIT');
      const tb = /^#tb 0: (\d+)\/(\d+)$/.exec(line);
      if (tb) { numerator = BigInt(tb[1]); denominator = BigInt(tb[2]);
        if (!numerator || !denominator || numerator > 1000000n || denominator > 1000000000n) failure(); }
      const row = parseFrameCrcPacket(line, 8192 * 4); if (!row) return;
      if (++rows > MAX_AUDIO_OBSERVATION_ROWS) failure('OUTPUT_LIMIT');
      if (row.streamIndex !== 0 || !numerator || !denominator || row.size % 4 || row.duration <= 0n ||
          micros(row.duration, numerator, denominator) > 1000000) failure();
      const pts = micros(row.pts, numerator, denominator); origin ??= pts;
    });
    const [code] = await Promise.all([closed, parsed]); context.signal.throwIfAborted();
    if (Date.now() >= context.deadline) failure('TIME_LIMIT');
    if (code !== null && okay.audioFailed()) return { kind: 'damaged' };
    return code === 0 && okay.valid() && origin !== undefined ? { kind: 'decoded', originUs: origin } : { kind: 'unobserved' };
  } catch (error) {
    controller.abort(); await closed; context.signal.throwIfAborted();
    if (Date.now() >= context.deadline) failure('TIME_LIMIT');
    if (error instanceof ExternalRecordingError && error.code === 'OUTPUT_LIMIT') throw error;
    // Missing or undecodable source audio must still reach the existing bounded silence fallback.
    return { kind: 'unobserved' };
  } finally { controller.abort(); await closed; context.signal.removeEventListener('abort', abort); await input.close(); }
}

export async function inspectExternalRecording(context: ExternalRecordingContext, fps: number, audioActive = false): Promise<ExternalRecordingPlan> {
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
    const videoStreamIndex = await sourceVideoStreamIndex(context, input);
    const child = launch({ ...context, signal: controller.signal }, [...inputArguments, '-map', '0:v:0', '-an', '-c:v', 'copy',
      '-bsf:v', 'h264_mp4toannexb', '-f', 'tee', '[f=data:flush_packets=1]pipe:1|[f=framecrc:flush_packets=1]pipe:3'], [input.fd, 'pipe', 'pipe', 'pipe']);
    const okay = observeMetadataErrors(readable(child.stderr), () => metadata, videoStreamIndex);
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
          if (++metadata > MAX_METADATA_SAMPLES || row.pts !== row.dts || previousEnd === undefined || row.dts !== previousEnd) failure('VIDEO_DISCONTINUITY');
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
    await queue.finish(); context.signal.throwIfAborted(); if (!okay.valid() || !pictures.length || pictures.length > 9000) failure();
    pictures.sort((a, b) => a.pts - b.pts); const origin = pictures[0].pts;
    for (let i = 0; i < pictures.length; i++) {
      pictures[i].pts -= origin;
      if (i && pictures[i].pts <= pictures[i - 1].pts) failure('VIDEO_TIMESTAMP');
    }
    const selected: Picture[] = []; let bucket = -1;
    for (const picture of pictures) { const next = Math.floor(picture.pts * fps / 1000000 + 0.0001);
      if (next > bucket) { selected.push(picture); bucket = next; } }
    // Selection changes cadence, never the corrected source end. Retain the
    // complete picture inventory so a dropped tail cannot shorten the clip or
    // an output interval extend it beyond the finite-source limit.
    const durationUs = pictures.reduce((end, picture) => Math.max(end, picture.pts + picture.duration), 0);
    if (durationUs < 1 || durationUs > 90000000) failure('VIDEO_TIMESTAMP');
    const audio = audioActive ? await inspectSourceAudio(context, videoStreamIndex, origin + durationUs) : undefined;
    return { pictures, selected, durationUs, originUs: origin,
      ...(audio?.kind === 'decoded' ? { audioOriginUs: audio.originUs } : {}),
      ...(audio?.kind === 'damaged' ? { audioFailure: 'AUDIO_DISCONTINUITY' as const } : {}), metadata, corrections, videoStreamIndex };
  } finally { controller.abort(); await closure; queue.dispose(); context.signal.removeEventListener('abort', abort); await input.close(); }
}

export function recordingFfmpegArguments(configuration: CameraRecordingConfiguration, plan: ExternalRecordingPlan,
  audioActive: boolean, silence: boolean): string[] {
  const v = configuration.videoCodec, [width, height, fps] = v.resolution;
  const rate = configuration.audioCodec.samplerate === 1 ? 16000 : 24000;
  // At most 512 corrections are admitted. A balanced threshold tree keeps
  // their expression depth logarithmic, below FFmpeg's parser recursion limit.
  const correctionAt = (from: number, to: number): string => {
    if (from === to) return String(from ? plan.corrections[from - 1].offset : 0);
    const middle = Math.floor((from + to) / 2);
    return `if(gte(PTS,${plan.corrections[middle].at}),${correctionAt(middle + 1, to)},${correctionAt(from, middle)})`;
  };
  const correction = correctionAt(0, plan.corrections.length);
  // Preserve the common source timeline. Resetting each track independently
  // would erase a real A/V offset and invert it after AAC encoder priming.
  const filter = `settb=1/1000000,setpts='PTS-(${correction})',` +
    `select='isnan(prev_selected_t)+gt(floor((t-start_t)*${fps}+0.0001),floor((prev_selected_t-start_t)*${fps}+0.0001))',` +
    squarePixelLetterboxFilter(width, height);
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
  context.signal.throwIfAborted();
  if (Date.now() >= context.deadline) failure('TIME_LIMIT');
  if (audioActive && !silence && plan.audioFailure === 'AUDIO_DISCONTINUITY') failure('AUDIO_DISCONTINUITY');
  const input = await context.open(), controller = new globalThis.AbortController(), abort = () => controller.abort();
  context.signal.addEventListener('abort', abort, { once: true }); if (context.signal.aborted) controller.abort();
  let closure: Promise<number | null> | undefined;
  try {
    const child = launch({ ...context, signal: controller.signal }, recordingFfmpegArguments(configuration, plan, audioActive, silence), [input.fd, 'pipe', 'pipe']);
    const okay = observeMetadataErrors(readable(child.stderr), () => plan.metadata, plan.videoStreamIndex, audioActive && !silence);
    const closed = closure = new Promise<number | null>(resolve => { child.once('close', resolve); child.once('error', () => resolve(null)); });
    let bytes = 0, failed = false;
    child.stdout?.on('data', (value: Buffer) => {
      try { context.signal.throwIfAborted(); if ((bytes += value.length) > 32 * 1024 * 1024) failure('OUTPUT_LIMIT'); collect(value); }
      catch { failed = true; controller.abort(); }
    });
    const code = await closed; context.signal.throwIfAborted();
    if (Date.now() >= context.deadline) failure('TIME_LIMIT');
    if (failed) failure('OUTPUT_LIMIT');
    if (code !== 0 || !okay.valid() || !bytes) failure(code !== null && okay.audioFailed() ? 'AUDIO_DISCONTINUITY' : 'DECODE');
  } finally { controller.abort(); await closure; context.signal.removeEventListener('abort', abort); await input.close(); }
}

/** A separate decoder pass validates actual pictures/audio clocks, not only MP4 container declarations. */
export async function validateExternalRecording(context: ExternalRecordingContext, data: Buffer,
  configuration: CameraRecordingConfiguration, plan: ExternalRecordingPlan, audioActive: boolean, silence = false): Promise<void> {
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
    const expectedAudioOffset = (silence ? 0 : plan.audioOriginUs ?? 0) - plan.originUs;
    if (audioActive && (audioFirst === undefined || Math.abs(audioFirst - videoOrigin! - expectedAudioOffset) > tolerance ||
        Math.abs(audioEnd - videoOrigin! - plan.durationUs) > tolerance)) failure('AUDIO_DISCONTINUITY');
  } catch (error) { controller.abort(); await closed; throw error; }
  finally { controller.abort(); context.signal.removeEventListener('abort', abort); }
}
