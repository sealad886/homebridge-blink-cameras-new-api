import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import type { CameraRecordingConfiguration } from 'homebridge';
import { NativeRecordingMemoryBudget, NativeRecordingSource, prepareNativeRecording,
  snapshotNativeRecordingConfiguration, NativeRecordingPreparationError } from '../src/accessories/native-recording-preparation';
import { loadPackagedProtectionWorker } from '../src/accessories/protection-worker-artifact';

jest.mock('../src/accessories/protection-worker-artifact', () => ({ loadPackagedProtectionWorker: jest.fn() }));

const posixPermissionTest = typeof process.getuid === 'function' ? it : it.skip;
const configuration = (): CameraRecordingConfiguration => ({
  prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: 1000 },
  videoCodec: { type: 0, resolution: [320, 180, 15], parameters: { profile: 0, level: 0, bitRate: 300, iFrameInterval: 1000 } },
  audioCodec: { type: 0, samplerate: 1, audioChannels: 1, bitrateMode: 0, bitrate: 32 },
});
let directory: string;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'native-recording-media-'));
  jest.mocked(loadPackagedProtectionWorker).mockReturnValue('/verified/helper'); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
const admit = <T>(work: () => Promise<T>) => work();
async function source(bytes = Buffer.from('not a media file')): Promise<NativeRecordingSource> {
  const filePath = path.join(directory, 'source.mp4');
  await fs.writeFile(filePath, bytes, { mode: 0o600 });
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

it('keeps preparation diagnostics detached, fixed and free of arbitrary error data', () => {
  const diagnostic = { phase: 'output' as const, workerCode: 'MEDIA' as const, privateValue: 'secret' };
  const error = new NativeRecordingPreparationError(diagnostic);
  expect(error.diagnostic).toEqual({ phase: 'output', workerCode: 'MEDIA' });
  expect(Object.isFrozen(error.diagnostic)).toBe(true);
  expect(() => new NativeRecordingPreparationError({ phase: 'private-source' } as never)).toThrow('Invalid recording preparation diagnostic');
  expect(() => new NativeRecordingPreparationError({ phase: 'output', workerCode: 'private-source' } as never)).toThrow('Invalid recording preparation diagnostic');
  expect(() => new NativeRecordingPreparationError({ phase: 'output', salvageAttempted: false } as never)).toThrow('Invalid recording preparation diagnostic');
  expect(new NativeRecordingPreparationError({ phase: 'output', salvageAttempted: true }).diagnostic).toEqual({ phase: 'output', salvageAttempted: true });
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
