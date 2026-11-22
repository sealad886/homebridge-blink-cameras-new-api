import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import type { CameraRecordingConfiguration } from 'homebridge';
import { NativeRecordingMemoryBudget, NativeRecordingSource, prepareNativeRecording,
  snapshotNativeRecordingConfiguration, NativeRecordingPreparationError } from '../src/accessories/native-recording-preparation';
import { loadPackagedProtectionWorker } from '../src/accessories/protection-worker-artifact';
import * as externalFfmpeg from '../src/accessories/external-ffmpeg';
import * as externalRecording from '../src/accessories/external-recording';

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
  expect(() => new NativeRecordingPreparationError({ phase: 'output', deadlineExceeded: 'private-data' } as never)).toThrow('Invalid recording preparation diagnostic');
  expect(new NativeRecordingPreparationError({ phase: 'output', salvageAttempted: true }).diagnostic).toEqual({ phase: 'output', salvageAttempted: true });
});

it('closes a reopened snapshot when descriptor validation rejects without exposing the underlying error', async () => {
  const file = await source(), memory = new NativeRecordingMemoryBudget(), open = fs.open.bind(fs);
  let snapshot: Awaited<ReturnType<typeof fs.open>> | undefined, closed: jest.SpyInstance | undefined;
  const resolve = jest.spyOn(externalFfmpeg, 'resolveExternalFfmpegPath').mockReturnValue('/verified/ffmpeg');
  const probe = jest.spyOn(externalFfmpeg, 'probeExternalFfmpeg').mockResolvedValue({ version: '9.0' });
  const opening = jest.spyOn(fs, 'open').mockImplementation(async (target, flags, mode) => {
    const handle = await open(target, flags, mode);
    if (path.basename(String(target)).startsWith('.native-') && flags === (constants.O_RDONLY | constants.O_NOFOLLOW)) {
      snapshot = handle; closed = jest.spyOn(handle, 'close');
      jest.spyOn(handle, 'stat').mockRejectedValue(new Error('private snapshot stat failure'));
    }
    return handle;
  });
  try {
    await expect(prepareNativeRecording(file, configuration(), false, new globalThis.AbortController().signal,
      { memory, admit })).rejects.toMatchObject({ message: 'Recording conversion failed during input',
      diagnostic: { phase: 'input', workerCode: 'MEDIA' } });
    expect(snapshot).toBeDefined(); expect(closed).toHaveBeenCalledTimes(1); expect(snapshot!.fd).toBe(-1);
    expect(memory.bytes).toBe(0); expect(await fs.readdir(directory)).toEqual(['source.mp4']);
    expect(createHash('sha256').update(await fs.readFile(file.filePath)).digest('hex')).toBe(file.expectedSha256);
  } finally { opening.mockRestore(); resolve.mockRestore(); probe.mockRestore(); await snapshot?.close(); }
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

it('identifies expiration while waiting for admission and still fences late admission', async () => {
  const file = await source(), controller = new globalThis.AbortController();
  let run!: () => Promise<unknown>;
  jest.useFakeTimers();
  try {
    const pending = prepareNativeRecording(file, configuration(), false, controller.signal, {
      timeoutMs: 1000,
      admit: <T>(work: () => Promise<T>) => { run = work; return new Promise<T>(() => undefined); },
    });
    const rejection = expect(pending).rejects.toMatchObject({ diagnostic: { phase: 'admission', deadlineExceeded: true } });
    await jest.advanceTimersByTimeAsync(1000);
    await rejection;
    await expect(run()).rejects.toThrow();
  } finally { jest.useRealTimers(); }
});

it('identifies expiration during input inspection and removes the private working copy', async () => {
  const file = await source(), controller = new globalThis.AbortController(), memory = new NativeRecordingMemoryBudget();
  const resolve = jest.spyOn(externalFfmpeg, 'resolveExternalFfmpegPath').mockReturnValue('/verified/ffmpeg');
  const probe = jest.spyOn(externalFfmpeg, 'probeExternalFfmpeg').mockResolvedValue({ version: '9.0' });
  let onStart!: () => void;
  const started = new Promise<void>(done => { onStart = done; });
  const inspect = jest.spyOn(externalRecording, 'inspectExternalRecording').mockImplementation(async context => {
    onStart();
    await new Promise((_resolve, reject) => context.signal.addEventListener('abort', () => reject(new Error('private input detail')),
      { once: true }));
    throw new Error('Inspection unexpectedly continued');
  });
  jest.useFakeTimers();
  try {
    const pending = prepareNativeRecording(file, configuration(), false, controller.signal, { admit, memory, timeoutMs: 1000 });
    const rejection = expect(pending).rejects.toMatchObject({ message: 'Recording conversion failed during input',
      diagnostic: { phase: 'input', deadlineExceeded: true } });
    await started;
    await jest.advanceTimersByTimeAsync(1000);
    await rejection;
    expect(await fs.readdir(directory)).toEqual(['source.mp4']);
    expect(memory.bytes).toBe(0);
  } finally { jest.useRealTimers(); inspect.mockRestore(); resolve.mockRestore(); probe.mockRestore(); }
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
