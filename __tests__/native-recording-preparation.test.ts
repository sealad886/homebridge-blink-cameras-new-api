import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import type { CameraRecordingConfiguration } from 'homebridge';
import { NativeRecordingMemoryBudget, NativeRecordingSource, prepareNativeRecording,
  snapshotNativeRecordingConfiguration } from '../src/accessories/native-recording-preparation';
import { loadPackagedMediaWorker } from '../src/accessories/media-worker-artifact';

jest.mock('../src/accessories/media-worker-artifact', () => ({ loadPackagedMediaWorker: jest.fn() }));

const suffix = process.platform === 'win32' ? '.exe' : '';
const workerPath = path.resolve('native/build/blink-codec-worker' + suffix);
const fixturePath = path.resolve('native/build/fixture' + suffix);
const checkerPath = path.resolve('native/build/check-recording' + suffix);
const mediaTest = [workerPath, fixturePath, checkerPath].every(existsSync) ? it : it.skip;
const posixPermissionTest = typeof process.getuid === 'function' ? it : it.skip;
const configuration = (): CameraRecordingConfiguration => ({
  prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: 1000 },
  videoCodec: { type: 0, resolution: [320, 180, 15], parameters: { profile: 0, level: 0, bitRate: 300, iFrameInterval: 1000 } },
  audioCodec: { type: 0, samplerate: 1, audioChannels: 1, bitrateMode: 0, bitrate: 32 },
});
let directory: string;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'native-recording-media-'));
  jest.mocked(loadPackagedMediaWorker).mockReturnValue(workerPath); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
const admit = <T>(work: () => Promise<T>) => work();
async function source(bytes = Buffer.from('not a media file')): Promise<NativeRecordingSource> {
  const filePath = path.join(directory, 'source.mp4');
  await fs.writeFile(filePath, bytes, { mode: 0o600 });
  return { filePath, expectedBytes: bytes.length, expectedSha256: createHash('sha256').update(bytes).digest('hex') };
}
async function fixture(): Promise<NativeRecordingSource> {
  const filePath = path.join(directory, 'source.mp4');
  const result = spawnSync(fixturePath, ['audio-mp4', '320', '180', '15', '33'], { maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('Native synthetic MP4 fixture could not be generated');
  await fs.writeFile(filePath, result.stdout, { mode: 0o600 });
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
  const options = { admit };
  await expect(prepareNativeRecording({ ...file, filePath: 'https://example.invalid/clip.mp4' }, configuration(), false, new globalThis.AbortController().signal, options)).rejects.toThrow('Invalid local');
  await expect(prepareNativeRecording({ ...file, expectedBytes: file.expectedBytes + 1 }, configuration(), false, new globalThis.AbortController().signal, options)).rejects.toThrow('private regular');
  await expect(prepareNativeRecording({ ...file, expectedSha256: 'a'.repeat(64) }, configuration(), false, new globalThis.AbortController().signal, options)).rejects.toThrow('integrity');
  await expect(prepareNativeRecording({ ...file, expectedBytes: 33 * 1024 * 1024 }, configuration(), false, new globalThis.AbortController().signal, options)).rejects.toThrow('Invalid local');
});

it('refuses symlinks and nonregular local sources on every platform', async () => {
  const file = await source(), link = path.join(directory, 'link.mp4');
  await fs.symlink(file.filePath, link);
  await expect(prepareNativeRecording({ ...file, filePath: link }, configuration(), false, new globalThis.AbortController().signal, { admit })).rejects.toThrow();
  const nonregular = path.join(directory, 'not-a-file'); await fs.mkdir(nonregular, { mode: 0o700 });
  await expect(prepareNativeRecording({ ...file, filePath: nonregular }, configuration(), false, new globalThis.AbortController().signal,
    { admit })).rejects.toThrow('private regular');
});

posixPermissionTest('refuses public POSIX source-file and parent-directory modes', async () => {
  const file = await source();
  await fs.chmod(file.filePath, 0o644);
  await expect(prepareNativeRecording(file, configuration(), false, new globalThis.AbortController().signal, { admit })).rejects.toThrow('private regular');
  await fs.chmod(file.filePath, 0o600); await fs.chmod(directory, 0o755);
  await expect(prepareNativeRecording(file, configuration(), false, new globalThis.AbortController().signal, { admit })).rejects.toThrow('directory is not private');
  await fs.chmod(directory, 0o700);
});

it('cancels before shared CPU admission and prevents late admission from starting work', async () => {
  const controller = new globalThis.AbortController();
  let run!: () => Promise<unknown>;
  const pending = prepareNativeRecording(await source(), configuration(), false, controller.signal, {
    admit: <T>(work: () => Promise<T>) => { run = work; return new Promise<T>(() => undefined); },
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
    { admit: gate })).rejects.toThrow();
  expect(entered).toBe(false);
  await expect(prepareNativeRecording(file, configuration(), false, new globalThis.AbortController().signal,
    { admit: () => { throw new Error('Local conversion capacity unavailable'); } })).rejects.toThrow('capacity unavailable');
});

mediaTest.each([1, 2] as const)('prepares finite MP4 with negotiated audio rate %s and preserves the source', async samplerate => {
  const file = await fixture(), memory = new NativeRecordingMemoryBudget(), selected = configuration();
  selected.audioCodec.samplerate = samplerate;
  const prepared = await prepareNativeRecording(file, selected, true, new globalThis.AbortController().signal, { admit, memory });
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
  const decode = spawnSync(checkerPath, [], { input: await fs.readFile(outputPath), encoding: 'utf8' });
  expect(decode.status).toBe(0); expect(decode.stderr).toBe('');
  expect(JSON.parse(decode.stdout)).toMatchObject({ videoFrames: 33, videoWidth: 320, videoHeight: 180,
    audioTracks: 1, audioSampleRate: samplerate === 1 ? 16000 : 24000, audioChannels: 1 });
  const initialization = prepared.initialization;
  prepared.dispose(); prepared.dispose();
  expect(initialization.every(byte => byte === 0)).toBe(true);
  expect(memory.bytes).toBe(0);
});

mediaTest('excludes audio when recording audio permission is off', async () => {
  const file = await fixture();
  const prepared = await prepareNativeRecording(file, configuration(), false, new globalThis.AbortController().signal, { admit });
  // The parser verifies there is exactly one video track and zero audio tracks.
  expect(prepared.audioActive).toBe(false);
  expect(prepared.initialization.includes(Buffer.from('soun'))).toBe(false);
  prepared.dispose();
});

mediaTest('preserves a sixty-second 30fps source when HomeKit selects 15fps output', async () => {
  const result = spawnSync(fixturePath, ['video-mp4', '16', '16', '30', '1800'], { maxBuffer: 32 * 1024 * 1024 });
  expect(result.status).toBe(0);
  const selected = configuration(); selected.videoCodec.resolution = [16, 16, 15];
  const prepared = await prepareNativeRecording(await source(result.stdout), selected, false,
    new globalThis.AbortController().signal, { admit });
  try {
    expect(prepared.durationMs).toBeCloseTo(60000, 1);
    const decode = spawnSync(checkerPath, [], { input: Buffer.concat([prepared.initialization,
      ...prepared.fragments.map(fragment => fragment.data)]), encoding: 'utf8' });
    expect(decode.status).toBe(0);
    expect(JSON.parse(decode.stdout)).toMatchObject({ videoFrames: 900, videoWidth: 16, videoHeight: 16, audioTracks: 0 });
  } finally { prepared.dispose(); }
});

mediaTest('fails closed on corrupt input and releases its owned media budget', async () => {
  const memory = new NativeRecordingMemoryBudget();
  await expect(prepareNativeRecording(await source(), configuration(), false, new globalThis.AbortController().signal,
    { admit, memory })).rejects.toThrow('conversion failed');
  expect(memory.bytes).toBe(0);
});

mediaTest('stops output when the shared owned-media budget is exhausted', async () => {
  const memory = new NativeRecordingMemoryBudget(100);
  await expect(prepareNativeRecording(await fixture(), configuration(), false, new globalThis.AbortController().signal,
    { admit, memory })).rejects.toThrow('output exhausted');
  expect(memory.bytes).toBe(0);
});
