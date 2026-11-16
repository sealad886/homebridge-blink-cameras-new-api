import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CameraRecordingConfiguration } from 'homebridge';
import { convertExternalRecording, inspectExternalRecording, ExternalRecordingError,
  type RecordingFailureCode } from '../src/accessories/external-recording';
import { NativeRecordingMemoryBudget, prepareNativeRecording } from '../src/accessories/native-recording-preparation';
import { ExternalFfmpegSetupError, resolveExternalFfmpegPath } from '../src/accessories/external-ffmpeg';

jest.mock('../src/accessories/protection-worker-artifact', () => ({ loadPackagedProtectionWorker: () => '/verified/helper' }));
jest.mock('../src/accessories/external-ffmpeg', () => ({ ...jest.requireActual('../src/accessories/external-ffmpeg'),
  resolveExternalFfmpegPath: jest.fn(() => '/verified/ffmpeg'), probeExternalFfmpeg: async () => ({ version: '9.0' }) }));
jest.mock('../src/accessories/external-recording', () => ({ ...jest.requireActual('../src/accessories/external-recording'),
  inspectExternalRecording: jest.fn(), convertExternalRecording: jest.fn(), validateExternalRecording: jest.fn() }));
const selected = (): CameraRecordingConfiguration => ({ prebufferLength: 4000, eventTriggerTypes: [1],
  mediaContainerConfiguration: { type: 0, fragmentLength: 1000 },
  videoCodec: { type: 0, resolution: [320, 180, 15], parameters: { profile: 0, level: 0, bitRate: 300, iFrameInterval: 1000 } },
  audioCodec: { type: 0, samplerate: 1, audioChannels: 1, bitrateMode: 0, bitrate: 32 } });
let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(join(tmpdir(), 'blink-recovery-unit-'));
  jest.mocked(convertExternalRecording).mockReset(); jest.mocked(inspectExternalRecording).mockReset();
  jest.mocked(resolveExternalFfmpegPath).mockReset().mockReturnValue('/verified/ffmpeg');
  jest.mocked(inspectExternalRecording).mockResolvedValue({ pictures: [{ pts: 0, duration: 100000 }],
    selected: [{ pts: 0, duration: 100000 }], durationUs: 100000, originUs: 0, metadata: 0, corrections: [] });
});
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
async function input() {
  const bytes = Buffer.from('private-synthetic-source'), filePath = join(directory, 'source.mp4');
  await fs.writeFile(filePath, bytes, { mode: 0o600 });
  return { filePath, expectedBytes: bytes.length, expectedSha256: createHash('sha256').update(bytes).digest('hex') };
}
function failures(codes: Array<RecordingFailureCode | undefined>, memory: NativeRecordingMemoryBudget,
  hook?: (index: number, signal: globalThis.AbortSignal) => Promise<void>) {
  let active = 0; const modes: boolean[] = [], late: Array<() => void> = [];
  jest.mocked(convertExternalRecording).mockImplementation(async (context, _configuration, _plan, _audio, silence, collect) => {
    expect(active).toBe(0); expect(memory.bytes).toBe(0); active++;
    const index = modes.length; modes.push(silence); late.push(() => collect(Buffer.alloc(16, 65)));
    try {
      collect(Buffer.alloc(16, 65)); await hook?.(index, context.signal);
      if (codes[index]) throw new ExternalRecordingError(codes[index]!);
      throw new Error('private arbitrary external failure');
    } finally { active--; }
  });
  return { modes, late, active: () => active };
}
async function cleaned() { expect(await fs.readdir(directory)).toEqual(['source.mp4']); }

it('admits at most one sequential silence fallback and erases partial output without deleting the original', async () => {
  const file = await input(), original = await fs.readFile(file.filePath), memory = new NativeRecordingMemoryBudget();
  const mock = failures(['AUDIO_DISCONTINUITY', 'DECODE'], memory), admit = jest.fn(work => work());
  await expect(prepareNativeRecording(file, selected(), true, new globalThis.AbortController().signal, { memory, admit }))
    .rejects.toMatchObject({ diagnostic: { phase: 'output', workerCode: 'DECODE', salvageAttempted: true } });
  expect(mock.modes).toEqual([false, true]); expect(admit).toHaveBeenCalledTimes(1); expect(mock.active()).toBe(0);
  expect(memory.bytes).toBe(0); expect(await fs.readFile(file.filePath)).toEqual(original); await cleaned();
});
it.each(['TIME_LIMIT', 'OUTPUT_LIMIT', 'DECODE', 'MEDIA', 'EXTERNAL_FFMPEG', 'VIDEO_DISCONTINUITY', undefined] as const)(
  'does not repeat hard or unclassified failure %s', async code => {
    const file = await input(), memory = new NativeRecordingMemoryBudget(), mock = failures([code], memory);
    await expect(prepareNativeRecording(file, selected(), true, new globalThis.AbortController().signal,
      { memory, admit: work => work() })).rejects.toThrow();
    expect(mock.modes).toEqual([false]); expect(memory.bytes).toBe(0); expect(mock.active()).toBe(0); await cleaned();
  });
it('never introduces silent audio when recording audio is disabled', async () => {
  const file = await input(), memory = new NativeRecordingMemoryBudget(), mock = failures(['AUDIO_DISCONTINUITY'], memory);
  await expect(prepareNativeRecording(file, selected(), false, new globalThis.AbortController().signal,
    { memory, admit: work => work() })).rejects.toThrow();
  expect(mock.modes).toEqual([false]); await cleaned();
});
it('does not retry exhausted owned-output memory', async () => {
  const file = await input(), memory = new NativeRecordingMemoryBudget(8), mock = failures(['AUDIO_DISCONTINUITY'], memory);
  await expect(prepareNativeRecording(file, selected(), true, new globalThis.AbortController().signal,
    { memory, admit: work => work() })).rejects.toThrow('Recording output exhausted');
  expect(mock.modes).toEqual([false]); expect(memory.bytes).toBe(0); await cleaned();
});
it('keeps the seekable child snapshot bound to verified bytes and refuses a changed original', async () => {
  const file = await input(), original = await fs.readFile(file.filePath), memory = new NativeRecordingMemoryBudget();
  jest.mocked(convertExternalRecording).mockImplementation(async (context, _configuration, _plan, _audio, _silence, collect) => {
    const descriptor = await context.open();
    try { expect(await descriptor.readFile()).toEqual(original); } finally { await descriptor.close(); }
    collect(Buffer.alloc(16)); await fs.writeFile(file.filePath, 'changed'); throw new ExternalRecordingError('AUDIO_DISCONTINUITY');
  });
  await expect(prepareNativeRecording(file, selected(), true, new globalThis.AbortController().signal,
    { memory, admit: work => work() })).rejects.toThrow('source integrity');
  expect(convertExternalRecording).toHaveBeenCalledTimes(1); expect(memory.bytes).toBe(0); await cleaned();
});
it('privacy cancellation between attempts prevents fallback and late collection', async () => {
  const file = await input(), memory = new NativeRecordingMemoryBudget(), owner = new globalThis.AbortController();
  const mock = failures(['AUDIO_DISCONTINUITY'], memory, async () => { owner.abort(); });
  await expect(prepareNativeRecording(file, selected(), true, owner.signal, { memory, admit: work => work() })).rejects.toThrow('cancelled');
  expect(mock.modes).toEqual([false]); expect(() => mock.late[0]()).toThrow(); expect(memory.bytes).toBe(0); await cleaned();
});
it('shares one deadline across primary conversion and fallback instead of renewing it', async () => {
  const file = await input(), memory = new NativeRecordingMemoryBudget();
  const mock = failures(['AUDIO_DISCONTINUITY', 'DECODE'], memory, async (index, signal) => {
    if (index === 0) await new Promise(resolve => globalThis.setTimeout(resolve, 600));
    else await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
  });
  const start = Date.now();
  await expect(prepareNativeRecording(file, selected(), true, new globalThis.AbortController().signal,
    { memory, timeoutMs: 1000, admit: work => work() })).rejects.toThrow('cancelled');
  expect(mock.modes).toEqual([false, true]); expect(Date.now() - start).toBeLessThan(1700);
  expect(memory.bytes).toBe(0); expect(mock.active()).toBe(0); await cleaned();
});
it('cancels fallback in flight and rejects subsequently arriving media', async () => {
  const file = await input(), memory = new NativeRecordingMemoryBudget(), owner = new globalThis.AbortController();
  const mock = failures(['AUDIO_DISCONTINUITY', 'DECODE'], memory, async index => { if (index === 1) owner.abort(); });
  await expect(prepareNativeRecording(file, selected(), true, owner.signal, { memory, admit: work => work() })).rejects.toThrow('cancelled');
  expect(mock.modes).toEqual([false, true]); expect(() => mock.late[1]()).toThrow();
  expect(memory.bytes).toBe(0); expect(mock.active()).toBe(0); await cleaned();
});

it('reports a fixed actionable setup category and removes its private snapshot when FFmpeg is missing', async () => {
  const file = await input(), memory = new NativeRecordingMemoryBudget();
  jest.mocked(resolveExternalFfmpegPath).mockImplementation(() => { throw new ExternalFfmpegSetupError('missing'); });
  await expect(prepareNativeRecording(file, selected(), true, new globalThis.AbortController().signal,
    { memory, admit: work => work() })).rejects.toMatchObject({ diagnostic: { phase: 'configuration', workerCode: 'EXTERNAL_FFMPEG' } });
  expect(convertExternalRecording).not.toHaveBeenCalled(); expect(memory.bytes).toBe(0); await cleaned();
});

it('removes the content-bound snapshot and preserves the original when input inspection fails', async () => {
  const file = await input(), original = await fs.readFile(file.filePath), memory = new NativeRecordingMemoryBudget();
  jest.mocked(inspectExternalRecording).mockRejectedValue(new ExternalRecordingError('DECODE'));
  await expect(prepareNativeRecording(file, selected(), true, new globalThis.AbortController().signal,
    { memory, admit: work => work() })).rejects.toMatchObject({ diagnostic: { phase: 'input', workerCode: 'DECODE' } });
  expect(await fs.readFile(file.filePath)).toEqual(original); expect(memory.bytes).toBe(0); await cleaned();
});

it('erases provisional prepared output when final snapshot removal refuses cleanup', async () => {
  // Minimal container declaration isolates ownership transfer from codec behavior;
  // real decoding/content acceptance belongs to the portable installed corpus.
  const box = (type: string, payload: Buffer) => { const value = Buffer.alloc(8 + payload.length); value.writeUInt32BE(value.length); value.write(type, 4); payload.copy(value, 8); return value; };
  const field = (length: number, offset: number, value: number) => { const result = Buffer.alloc(length); result.writeUInt32BE(value, offset); return result; };
  const track = box('trak', Buffer.concat([box('tkhd', field(24, 12, 1)), box('mdia', Buffer.concat([
    box('hdlr', Buffer.concat([Buffer.alloc(8), Buffer.from('vide')])), box('mdhd', field(16, 12, 1000))]))]));
  const trex = field(24, 4, 1); trex.writeUInt32BE(1000, 12); trex.writeUInt32BE(0x02000000, 20);
  const media = Buffer.concat([box('ftyp', Buffer.alloc(0)), box('moov', Buffer.concat([track, box('mvex', box('trex', trex))])),
    box('moof', Buffer.concat([box('mfhd', field(8, 4, 1)), box('traf', Buffer.concat([
      box('tfhd', field(8, 4, 1)), box('tfdt', Buffer.alloc(8)), box('trun', field(8, 4, 1))]))])), box('mdat', Buffer.from([0]))]);
  const file = await input(), original = await fs.readFile(file.filePath), memory = new NativeRecordingMemoryBudget();
  jest.mocked(convertExternalRecording).mockImplementation(async (_context, _configuration, _plan, _audio, _silence, collect) => { collect(media); });
  const remove = fs.rm.bind(fs), refused = jest.spyOn(fs, 'rm').mockImplementation(async (target, options) => {
    if (String(target).includes('/.native-')) throw new Error('synthetic unlink refusal'); return remove(target, options);
  });
  try {
    await expect(prepareNativeRecording(file, selected(), false, new globalThis.AbortController().signal,
      { memory, admit: work => work() })).rejects.toThrow('Recording temporary cleanup failed');
    expect(memory.bytes).toBe(0); expect(await fs.readFile(file.filePath)).toEqual(original);
  } finally { refused.mockRestore(); }
});
