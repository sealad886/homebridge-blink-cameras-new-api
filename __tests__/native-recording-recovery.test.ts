import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CameraRecordingConfiguration } from 'homebridge';
import { PrivateMediaWorker, type MediaWorkerCallbacks, type MediaWorkerFailureCode } from '../src/accessories/media-worker';
import { NativeRecordingMemoryBudget, prepareNativeRecording } from '../src/accessories/native-recording-preparation';

jest.mock('../src/accessories/media-worker-artifact', () => ({ loadPackagedMediaWorker: () => '/verified/worker' }));
jest.mock('../src/accessories/media-worker', () => ({ ...jest.requireActual('../src/accessories/media-worker'), PrivateMediaWorker: jest.fn() }));
const selected = (): CameraRecordingConfiguration => ({ prebufferLength: 4000, eventTriggerTypes: [1],
  mediaContainerConfiguration: { type: 0, fragmentLength: 1000 },
  videoCodec: { type: 0, resolution: [320, 180, 15], parameters: { profile: 0, level: 0, bitRate: 300, iFrameInterval: 1000 } },
  audioCodec: { type: 0, samplerate: 1, audioChannels: 1, bitrateMode: 0, bitrate: 32 } });
let directory: string;
beforeEach(async () => { directory = await fs.mkdtemp(join(tmpdir(), 'blink-recovery-unit-')); jest.mocked(PrivateMediaWorker).mockReset(); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
async function input() {
  const bytes = Buffer.from('private-synthetic-source'), filePath = join(directory, 'source.mp4');
  await fs.writeFile(filePath, bytes, { mode: 0o600 });
  return { filePath, expectedBytes: bytes.length, expectedSha256: createHash('sha256').update(bytes).digest('hex') };
}
function workers(codes: (MediaWorkerFailureCode | undefined)[], memory: NativeRecordingMemoryBudget,
  hook?: (event: 'stop' | 'end', index: number) => Promise<void>) {
  let active = 0; const modes: boolean[] = [], partials: Buffer[] = [], emitters: (() => Promise<void>)[] = [];
  jest.mocked(PrivateMediaWorker).mockImplementation(((_path: string, callbacks: MediaWorkerCallbacks) => {
    const index = modes.length; expect(active).toBe(0); expect(memory.bytes).toBe(0); active++;
    emitters.push(async () => { await callbacks.recordingInit?.(Buffer.alloc(16), new globalThis.AbortController().signal); });
    let closed = false, cancelEnd: ((error: Error) => void) | undefined;
    return { failureCode: codes[index], failed: true, whenReady: Promise.resolve(), whenMediaDrained: Promise.resolve(),
      configureRecording: async (config: { salvage?: boolean }) => { modes.push(!!config.salvage); }, media: async () => {},
      endMedia: async () => {
        const partial = Buffer.alloc(16, 0x41); partials.push(partial); await callbacks.recordingInit?.(partial, new globalThis.AbortController().signal);
        if (hook) await Promise.race([hook('end', index), new Promise<never>((_, reject) => { cancelEnd = reject; })]);
        throw new Error('private native failure');
      },
      finishInput: async () => {}, stop: async () => {
        if (!closed) { closed = true; active--; cancelEnd?.(new Error('stopped')); await hook?.('stop', index); }
      } } as unknown as PrivateMediaWorker;
  }) as never);
  return { modes, partials, emitters, active: () => active };
}
it('runs at most one sequential salvage attempt, releasing partial output while retaining the original', async () => {
  const file = await input(), original = await fs.readFile(file.filePath), memory = new NativeRecordingMemoryBudget();
  const mock = workers(['FRAGMENT_LIMIT', 'AUDIO_DECODE'], memory); const admit = jest.fn(work => work());
  await expect(prepareNativeRecording(file, selected(), true, new globalThis.AbortController().signal, { memory, admit }))
    .rejects.toMatchObject({ diagnostic: { phase: 'output', workerCode: 'AUDIO_DECODE', salvageAttempted: true } });
  expect(mock.modes).toEqual([false, true]); expect(admit).toHaveBeenCalledTimes(1); expect(mock.active()).toBe(0);
  expect(memory.bytes).toBe(0); expect(await fs.readFile(file.filePath)).toEqual(original);
});
it.each(['MEMORY', 'TIME_LIMIT', 'AUDIO_LIMIT', 'OUTPUT_LIMIT', 'CONFIG', 'VERSION', undefined] as const)(
  'does not retry hard/protocol/unclassified failure %s', async code => {
    const file = await input(), memory = new NativeRecordingMemoryBudget(), mock = workers([code], memory);
    await expect(prepareNativeRecording(file, selected(), true, new globalThis.AbortController().signal, { memory, admit: work => work() })).rejects.toThrow();
    expect(mock.modes).toEqual([false]); expect(memory.bytes).toBe(0); expect(mock.active()).toBe(0);
  });
it('does not retry exhausted output memory', async () => {
  const file = await input(), memory = new NativeRecordingMemoryBudget(8), mock = workers(['FRAGMENT_LIMIT'], memory);
  await expect(prepareNativeRecording(file, selected(), true, new globalThis.AbortController().signal, { memory, admit: work => work() })).rejects.toThrow('Recording output exhausted');
  expect(mock.modes).toEqual([false]); expect(memory.bytes).toBe(0);
});
it('checks the verified original again before salvage and rejects changes', async () => {
  const file = await input(), memory = new NativeRecordingMemoryBudget();
  const mock = workers(['FRAGMENT_LIMIT'], memory, async event => { if (event === 'stop') await fs.writeFile(file.filePath, 'changed'); });
  await expect(prepareNativeRecording(file, selected(), true, new globalThis.AbortController().signal, { memory, admit: work => work() })).rejects.toThrow('source integrity');
  expect(mock.modes).toEqual([false]); expect(memory.bytes).toBe(0);
});
it('privacy cancellation between attempts prevents salvage', async () => {
  const file = await input(), memory = new NativeRecordingMemoryBudget(), control = new globalThis.AbortController();
  const mock = workers(['FRAGMENT_LIMIT'], memory, async event => { if (event === 'stop') control.abort(); });
  await expect(prepareNativeRecording(file, selected(), true, control.signal, { memory, admit: work => work() })).rejects.toThrow();
  expect(mock.modes).toEqual([false]); expect(memory.bytes).toBe(0);
});
it('shares one deadline across primary work and salvage instead of renewing it', async () => {
  const file = await input(), memory = new NativeRecordingMemoryBudget();
  const mock = workers(['FRAGMENT_LIMIT', 'AUDIO_DECODE'], memory, async (event, index) => {
    if (event === 'end') await new Promise<void>(resolve => { if (index === 0) setTimeout(resolve, 600); });
  });
  const started = Date.now();
  await expect(prepareNativeRecording(file, selected(), true, new globalThis.AbortController().signal,
    { memory, timeoutMs: 1000, admit: work => work() })).rejects.toThrow('cancelled');
  expect(mock.modes).toEqual([false, true]); expect(Date.now() - started).toBeLessThan(1700);
  expect(memory.bytes).toBe(0); expect(mock.active()).toBe(0);
});

it('cancels salvage in flight and rejects output arriving after privacy cancellation', async () => {
  const file = await input(), memory = new NativeRecordingMemoryBudget(), control = new globalThis.AbortController();
  const mock = workers(['FRAGMENT_LIMIT', 'AUDIO_DECODE'], memory, async (event, index) => {
    if (event === 'end' && index === 1) control.abort();
  });
  await expect(prepareNativeRecording(file, selected(), true, control.signal, { memory, admit: work => work() }))
    .rejects.toThrow('cancelled');
  expect(mock.modes).toEqual([false, true]); expect(mock.active()).toBe(0); expect(memory.bytes).toBe(0);
  await expect(mock.emitters[1]()).rejects.toThrow(); expect(memory.bytes).toBe(0);
});
