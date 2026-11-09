import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import type { CameraRecordingConfiguration } from 'homebridge';
import { NativeRecordingMemoryBudget, NativeRecordingSource, prepareNativeRecording,
  snapshotNativeRecordingConfiguration } from '../src/accessories/native-recording-preparation';

const ffmpeg = process.env.TEST_FFMPEG_PATH ?? 'ffmpeg';
const hasFfmpeg = spawnSync(ffmpeg, ['-hide_banner', '-version'], { stdio: 'ignore' }).status === 0;
const mediaTest = hasFfmpeg ? it : it.skip;
const configuration = (): CameraRecordingConfiguration => ({
  prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: 1000 },
  videoCodec: { type: 0, resolution: [320, 180, 15], parameters: { profile: 0, level: 0, bitRate: 300, iFrameInterval: 1000 } },
  audioCodec: { type: 0, samplerate: 1, audioChannels: 1, bitrateMode: 0, bitrate: 32 },
});
let directory: string;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'native-recording-media-')); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
const admit = <T>(work: () => Promise<T>) => work();
async function source(bytes = Buffer.from('not a media file')): Promise<NativeRecordingSource> {
  const filePath = path.join(directory, 'source.mp4');
  await fs.writeFile(filePath, bytes, { mode: 0o600 });
  return { filePath, expectedBytes: bytes.length, expectedSha256: createHash('sha256').update(bytes).digest('hex') };
}
async function fixture(): Promise<NativeRecordingSource> {
  const filePath = path.join(directory, 'source.mp4');
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=15',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '2.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', filePath], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Local FFmpeg test fixture could not be generated: ' + result.stderr);
  await fs.chmod(filePath, 0o600);
  const bytes = await fs.readFile(filePath);
  return { filePath, expectedBytes: bytes.length, expectedSha256: createHash('sha256').update(bytes).digest('hex') };
}

it('takes a detached supported configuration and rejects invalid codec/resolution/duration requests', () => {
  const original = configuration(), selected = snapshotNativeRecordingConfiguration(original);
  original.videoCodec.resolution[0] = 640;
  expect(selected.videoCodec.resolution[0]).toBe(320);
  expect(() => snapshotNativeRecordingConfiguration({ ...configuration(), mediaContainerConfiguration: { type: 0, fragmentLength: 0 } })).toThrow();
  const large = configuration(); large.videoCodec.resolution = [1920, 1080, 30];
  expect(() => snapshotNativeRecordingConfiguration(large)).toThrow();
  large.videoCodec.parameters.level = 2;
  expect(snapshotNativeRecordingConfiguration(large).videoCodec.resolution).toEqual([1920, 1080, 30]);
});

it('bounds and accounts owned media allocations', () => {
  const memory = new NativeRecordingMemoryBudget(10);
  memory.reserve(6);
  expect(() => memory.reserve(5)).toThrow();
  expect(memory.bytes).toBe(6);
  memory.release(6);
  expect(memory.bytes).toBe(0);
  expect(() => memory.release(1)).toThrow();
});

it('rejects nonlocal paths, unexpected bytes and integrity changes without offering media', async () => {
  const file = await source();
  const options = { ffmpegPath: 'converter-must-not-start', admit };
  await expect(prepareNativeRecording({ ...file, filePath: 'https://example.invalid/clip.mp4' }, configuration(), false, new globalThis.AbortController().signal, options)).rejects.toThrow('Invalid local');
  await expect(prepareNativeRecording({ ...file, expectedBytes: file.expectedBytes + 1 }, configuration(), false, new globalThis.AbortController().signal, options)).rejects.toThrow('private regular');
  await expect(prepareNativeRecording({ ...file, expectedSha256: 'a'.repeat(64) }, configuration(), false, new globalThis.AbortController().signal, options)).rejects.toThrow('integrity');
  await expect(prepareNativeRecording({ ...file, expectedBytes: 33 * 1024 * 1024 }, configuration(), false, new globalThis.AbortController().signal, options)).rejects.toThrow('Invalid local');
});

it('refuses symlinks, nonprivate files and nonprivate parent directories', async () => {
  const file = await source(), link = path.join(directory, 'link.mp4');
  await fs.symlink(file.filePath, link);
  await expect(prepareNativeRecording({ ...file, filePath: link }, configuration(), false, new globalThis.AbortController().signal, { ffmpegPath: ffmpeg, admit })).rejects.toThrow();
  await fs.chmod(file.filePath, 0o644);
  await expect(prepareNativeRecording(file, configuration(), false, new globalThis.AbortController().signal, { ffmpegPath: ffmpeg, admit })).rejects.toThrow('private regular');
  await fs.chmod(file.filePath, 0o600); await fs.chmod(directory, 0o755);
  await expect(prepareNativeRecording(file, configuration(), false, new globalThis.AbortController().signal, { ffmpegPath: ffmpeg, admit })).rejects.toThrow('directory is not private');
  await fs.chmod(directory, 0o700);
});

it('cancels before shared CPU admission and prevents late admission from starting work', async () => {
  const controller = new globalThis.AbortController();
  let run!: () => Promise<unknown>;
  const pending = prepareNativeRecording(await source(), configuration(), false, controller.signal, {
    ffmpegPath: 'converter-must-not-start', admit: <T>(work: () => Promise<T>) => { run = work; return new Promise<T>(() => undefined); },
  });
  controller.abort();
  await expect(pending).rejects.toThrow('cancelled before admission');
  await expect(run()).rejects.toThrow();
});

it('does not enter admission with an already cancelled owner and handles synchronous admission refusal', async () => {
  const controller = new globalThis.AbortController(); controller.abort();
  let entered = false;
  const gate = <T>(work: () => Promise<T>) => { entered = true; return work(); };
  const file = await source();
  await expect(prepareNativeRecording(file, configuration(), false, controller.signal,
    { ffmpegPath: 'converter-must-not-start', admit: gate })).rejects.toThrow();
  expect(entered).toBe(false);
  await expect(prepareNativeRecording(file, configuration(), false, new globalThis.AbortController().signal,
    { ffmpegPath: 'converter-must-not-start', admit: () => { throw new Error('Local conversion capacity unavailable'); } })).rejects.toThrow('capacity unavailable');
});

mediaTest('prepares real finite MP4 into continuous keyframe fragments with selected audio and no source deletion', async () => {
  const file = await fixture(), memory = new NativeRecordingMemoryBudget();
  const prepared = await prepareNativeRecording(file, configuration(), true, new globalThis.AbortController().signal, { ffmpegPath: ffmpeg, admit, memory });
  expect(prepared.initialization.toString('ascii', 4, 8)).toBe('ftyp');
  expect(prepared.fragments.length).toBeGreaterThan(1);
  expect(prepared.fragments.every(fragment => fragment.durationMs > 0 && fragment.durationMs <= 1000.01)).toBe(true);
  expect(prepared.durationMs).toBeGreaterThan(2000);
  expect(prepared.durationMs).toBeLessThan(2300);
  expect(prepared.audioActive).toBe(true);
  expect(memory.bytes).toBe(prepared.bytes);
  expect(await fs.stat(file.filePath)).toMatchObject({ size: file.expectedBytes });
  const outputPath = path.join(directory, 'prepared.mp4');
  await fs.writeFile(outputPath, Buffer.concat([prepared.initialization, ...prepared.fragments.map(fragment => fragment.data)]), { mode: 0o600 });
  const decode = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file,pipe', '-i', outputPath, '-f', 'null', '-'], { encoding: 'utf8' });
  expect(decode.status).toBe(0); expect(decode.stderr).toBe('');
  const probe = spawnSync(ffmpeg.replace(/ffmpeg$/, 'ffprobe'), ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,avg_frame_rate,sample_rate,channels', '-of', 'json', outputPath], { encoding: 'utf8' });
  expect(probe.status).toBe(0);
  const streams = JSON.parse(probe.stdout).streams as { codec_name: string; width?: number; height?: number; avg_frame_rate?: string; sample_rate?: string; channels?: number }[];
  expect(streams.find(stream => stream.codec_name === 'h264')).toMatchObject({ width: 320, height: 180, avg_frame_rate: '15/1' });
  expect(streams.find(stream => stream.codec_name === 'aac')).toMatchObject({ sample_rate: '16000', channels: 1 });
  const initialization = prepared.initialization;
  prepared.dispose(); prepared.dispose();
  expect(initialization.every(byte => byte === 0)).toBe(true);
  expect(memory.bytes).toBe(0);
});

mediaTest('excludes audio when recording audio permission is off', async () => {
  const file = await fixture();
  const prepared = await prepareNativeRecording(file, configuration(), false, new globalThis.AbortController().signal, { ffmpegPath: ffmpeg, admit });
  // The parser verifies there is exactly one video track and zero audio tracks.
  expect(prepared.audioActive).toBe(false);
  expect(prepared.initialization.includes(Buffer.from('soun'))).toBe(false);
  prepared.dispose();
});

mediaTest('fails closed on corrupt input and releases its owned media budget', async () => {
  const memory = new NativeRecordingMemoryBudget();
  await expect(prepareNativeRecording(await source(), configuration(), false, new globalThis.AbortController().signal,
    { ffmpegPath: ffmpeg, admit, memory })).rejects.toThrow('conversion failed');
  expect(memory.bytes).toBe(0);
});

mediaTest('stops output when the shared owned-media budget is exhausted', async () => {
  const memory = new NativeRecordingMemoryBudget(100);
  await expect(prepareNativeRecording(await fixture(), configuration(), false, new globalThis.AbortController().signal,
    { ffmpegPath: ffmpeg, admit, memory })).rejects.toThrow('output exhausted');
  expect(memory.bytes).toBe(0);
});

it('retires an uncooperative owned converter before cancellation resolves', async () => {
  const file = await source(), converter = path.join(directory, 'test-converter'), pidFile = path.join(directory, 'child.pid');
  await fs.writeFile(converter, '#!/usr/bin/env node\n' +
    `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));\n` +
    'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);\n', { mode: 0o700 });
  const controller = new globalThis.AbortController();
  const pending = prepareNativeRecording(file, configuration(), false, controller.signal, { ffmpegPath: converter, admit });
  const failed = expect(pending).rejects.toThrow('cancelled');
  let pid = 0;
  try {
    for (let attempt = 0; attempt < 400 && !pid; attempt++) {
      try { pid = Number(await fs.readFile(pidFile, 'utf8')); } catch { await new Promise(resolve => globalThis.setTimeout(resolve, 10)); }
    }
    expect(pid).toBeGreaterThan(0);
  } finally {
    controller.abort(); await failed;
  }
  expect(() => process.kill(pid, 0)).toThrow();
}, 10000);
