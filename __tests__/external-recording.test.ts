import type { FileHandle } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { execFileSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { PassThrough } from 'node:stream';
import { pathToFileURL } from 'node:url';
import type { CameraRecordingConfiguration } from 'homebridge';
import { convertExternalRecording, inspectExternalRecording, validateExternalRecording } from '../src/accessories/external-recording';
import { resolveExternalFfmpegPath, spawnExternalFfmpeg } from '../src/accessories/external-ffmpeg';
import { NativeRecordingMemoryBudget, prepareNativeRecording } from '../src/accessories/native-recording-preparation';

jest.mock('../src/accessories/external-ffmpeg', () => ({ ...jest.requireActual('../src/accessories/external-ffmpeg'),
  spawnExternalFfmpeg: jest.fn() }));
beforeEach(() => jest.mocked(spawnExternalFfmpeg).mockReset());

it('does not launch a codec when privacy is revoked during the asynchronous source open', async () => {
  const owner = new globalThis.AbortController(), close = jest.fn(async () => undefined);
  const input = { fd: 42, close } as unknown as FileHandle;
  const opening = async () => { await Promise.resolve(); owner.abort(); return input; };
  await expect(inspectExternalRecording({ ffmpegPath: '/verified/ffmpeg', protectionPath: '/verified/helper',
    signal: owner.signal, deadline: Date.now() + 1000, open: opening }, 15)).rejects.toThrow();
  expect(spawnExternalFfmpeg).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
});
it.each([['unexpected', 'unexpected decoder error'], ['overlong', `[h264 @ 0x${'a'.repeat(1024)}] no frame!`]])(
  'refuses %s diagnostics even at the maximum metadata allowance', async (_kind, diagnostic) => {
    const child = new EventEmitter() as ChildProcess, stdout = new PassThrough(), stderr = new PassThrough();
    Object.assign(child, { stdout, stderr });
    const close = jest.fn(async () => undefined), input = { fd: 42, close } as unknown as FileHandle;
    jest.mocked(spawnExternalFfmpeg).mockImplementation(() => {
      globalThis.setImmediate(() => { stdout.end(Buffer.from([1])); stderr.end(diagnostic + '\n'); child.emit('close', 0); });
      return child;
    });
    await expect(convertExternalRecording({ ffmpegPath: '/verified/ffmpeg', protectionPath: '/verified/helper',
      signal: new globalThis.AbortController().signal, deadline: Date.now() + 1000, open: async () => input }, configuration(),
    { pictures: [{ pts: 0, duration: 66667 }], selected: [{ pts: 0, duration: 66667 }], durationUs: 66667,
      originUs: 0, metadata: 512, corrections: [] }, false, false, () => undefined)).rejects.toMatchObject({ code: 'DECODE' });
    expect(close).toHaveBeenCalledTimes(1);
  });

const ffmpeg = (() => { try { return resolveExternalFfmpegPath(process.env.BLINK_FFMPEG_TEST_PATH ??
  (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg')); } catch { return undefined; } })();
const protection = process.env.BLINK_PROTECTION_TEST_WORKER_PATH ?? join(process.cwd(), 'native/build/blink-protection-worker');
const media = ffmpeg && existsSync(protection) ? test : test.skip;
const execute = (args: string[], input?: Buffer) => execFileSync(ffmpeg!, ['-hide_banner', '-nostdin', '-v', 'error', ...args],
  { input, timeout: 15000, maxBuffer: 32 * 1024 * 1024 });
const configuration = (rate = 16000): CameraRecordingConfiguration => ({ prebufferLength: 4000, eventTriggerTypes: [1],
  mediaContainerConfiguration: { type: 0, fragmentLength: 1000 },
  videoCodec: { type: 0, resolution: [16, 16, 15], parameters: { profile: 0, level: 0, bitRate: 300, iFrameInterval: 1000 } },
  audioCodec: { type: 0, samplerate: rate === 16000 ? 1 : 2, audioChannels: 1, bitrateMode: 0, bitrate: 32 } });
async function recording(source: Buffer, audio: boolean, rate = 16000, silence = false) {
  jest.mocked(spawnExternalFfmpeg).mockImplementation(jest.requireActual('../src/accessories/external-ffmpeg').spawnExternalFfmpeg);
  const directory = await fs.mkdtemp(join(tmpdir(), 'blink-recording-clock-')), file = join(directory, 'source.mp4');
  try {
    await fs.writeFile(file, source, { mode: 0o600 });
    const context = { ffmpegPath: ffmpeg!, protectionPath: protection, signal: new globalThis.AbortController().signal,
      deadline: Date.now() + 15000, open: () => fs.open(file, 'r') };
    const plan = await inspectExternalRecording(context, 15, audio), selected = configuration(rate), chunks: Buffer[] = [];
    await convertExternalRecording(context, selected, plan, audio, silence, bytes => chunks.push(Buffer.from(bytes)));
    const output = Buffer.concat(chunks);
    await validateExternalRecording(context, output, selected, plan, audio, silence);
    return { plan, output };
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
media.each([512, 513])('enforces the %s-metadata source boundary through complete recording preparation', async metadata => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'blink-recording-metadata-')), file = join(directory, 'source.mp4');
  try {
    const count = metadata * 2 + 2;
    execute(['-f', 'lavfi', '-i', 'testsrc2=size=16x16:rate=15', '-frames:v', String(count), '-an', '-c:v', 'libx264',
      '-threads', '1', '-preset', 'ultrafast', '-bf', '0', '-f', 'mp4', file]);
    const mutator = pathToFileURL(join(process.cwd(), '.github/scripts/external-recording-check.mjs')).href;
    const source = execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { readFileSync } from 'node:fs'; import { mutateRecordingFixture } from ${JSON.stringify(mutator)};` +
      'process.stdout.write(mutateRecordingFixture(readFileSync(0), { metadataEvery: 2 }));'],
    { input: await fs.readFile(file), timeout: 10000, maxBuffer: 32 * 1024 * 1024 });
    jest.mocked(spawnExternalFfmpeg).mockImplementation(jest.requireActual('../src/accessories/external-ffmpeg').spawnExternalFfmpeg);
    await fs.writeFile(file, source, { mode: 0o600 }); await fs.chmod(file, 0o600);
    const expectedSha256 = createHash('sha256').update(source).digest('hex'), memory = new NativeRecordingMemoryBudget();
    const pending = prepareNativeRecording({ filePath: file, expectedBytes: source.length, expectedSha256 }, configuration(), false,
      new globalThis.AbortController().signal, { ffmpegPath: ffmpeg!, memory, admit: work => work() });
    if (metadata === 513) {
      await expect(pending).rejects.toMatchObject({ diagnostic: { phase: 'input', workerCode: 'VIDEO_DISCONTINUITY' } });
    } else {
      const prepared = await pending;
      try {
        const output = Buffer.concat([prepared.initialization, ...prepared.fragments.map(fragment => fragment.data)]);
        const decoded = execute(['-i', 'pipe:0', '-map', '0:v:0', '-threads', '1', '-fps_mode:v', 'passthrough',
          '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1'], output);
        expect(decoded.length).toBe(count * 16 * 16);
        expect(Math.abs(prepared.durationMs - count * 1000 / 15)).toBeLessThan(1);
        expect(createHash('sha256').update(output).digest('hex')).toBe(prepared.preparedSha256);
        output.fill(0);
      } finally { prepared.dispose(); }
    }
    expect(memory.bytes).toBe(0); expect(await fs.readdir(directory)).toEqual(['source.mp4']);
    expect(createHash('sha256').update(await fs.readFile(file)).digest('hex')).toBe(expectedSha256); source.fill(0);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}, 30000);
media.each(['missing', 'corrupt'])('keeps %s source audio eligible for silence recovery after origin inspection', async defect => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'blink-recording-audio-')), file = join(directory, 'source.mp4');
  try {
    execute(['-f', 'lavfi', '-i', 'testsrc2=size=16x16:rate=15:duration=2', ...(defect === 'missing' ? [] :
      ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000:duration=2']), '-c:v', 'libx264', '-threads', '1',
    '-preset', 'ultrafast', '-bf', '0', ...(defect === 'missing' ? ['-an'] : ['-c:a', 'aac', '-ar', '16000', '-ac', '1']), '-f', 'mp4', file]);
    const mutator = pathToFileURL(join(process.cwd(), '.github/scripts/external-recording-check.mjs')).href;
    const source = defect === 'missing' ? await fs.readFile(file) : execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { readFileSync } from 'node:fs'; import { mutateRecordingFixture } from ${JSON.stringify(mutator)};` +
      'process.stdout.write(mutateRecordingFixture(readFileSync(0), { corruptAudio: true }));'],
    { input: await fs.readFile(file), timeout: 10000, maxBuffer: 32 * 1024 * 1024 });
    await expect(recording(source, true)).rejects.toMatchObject({ code: 'AUDIO_DISCONTINUITY' });
    const { output } = await recording(source, true, 16000, true);
    const pcm = execute(['-i', 'pipe:0', '-map', '0:a:0', '-ar', '16000', '-ac', '1', '-f', 'f32le', 'pipe:1'], output);
    expect(pcm.every(byte => byte === 0)).toBe(true); output.fill(0); source.fill(0);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}, 20000);
media.each([16000, 24000])('preserves an audio-leading source offset at %s Hz without silence recovery', async rate => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'blink-recording-offset-')), file = join(directory, 'source.mp4');
  try {
    execute(['-f', 'lavfi', '-i', 'testsrc2=size=16x16:rate=15:duration=2', '-f', 'lavfi', '-i',
      'sine=frequency=440:sample_rate=16000:duration=2.3', '-vf', 'settb=1/1000000,setpts=PTS+200000',
      '-fps_mode:v', 'passthrough', '-enc_time_base:v', '1/1000000', '-c:v', 'libx264', '-threads', '1',
      '-preset', 'ultrafast', '-bf', '0', '-c:a', 'aac', '-ar', '16000', '-ac', '1', '-f', 'mp4', file]);
    const { plan, output } = await recording(await fs.readFile(file), true, rate);
    expect(plan.originUs).toBe(200000); expect(plan.audioOriginUs).toBe(0);
    const pcm = execute(['-i', 'pipe:0', '-map', '0:a:0', '-ar', String(rate), '-ac', '1', '-f', 'f32le', 'pipe:1'], output);
    expect(Array.from({ length: pcm.length / 4 }, (_, index) => Math.abs(pcm.readFloatLE(index * 4))).some(value => value > 0.01)).toBe(true);
    output.fill(0);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}, 20000);
