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
import { loadPackagedProtectionWorker } from '../src/accessories/protection-worker-artifact';

jest.mock('../src/accessories/external-ffmpeg', () => ({ ...jest.requireActual('../src/accessories/external-ffmpeg'),
  spawnExternalFfmpeg: jest.fn() }));
jest.mock('../src/accessories/protection-worker-artifact', () => ({ ...jest.requireActual('../src/accessories/protection-worker-artifact'),
  loadPackagedProtectionWorker: jest.fn() }));
beforeEach(() => {
  jest.mocked(spawnExternalFfmpeg).mockReset();
  // Source integration selects its built helper; installed qualification tests the real package resolver.
  jest.mocked(loadPackagedProtectionWorker).mockReturnValue(protection);
});

it('does not launch a codec when privacy is revoked during the asynchronous source open', async () => {
  const owner = new globalThis.AbortController(), close = jest.fn(async () => undefined);
  const input = { fd: 42, close } as unknown as FileHandle;
  const opening = async () => { await Promise.resolve(); owner.abort(); return input; };
  await expect(inspectExternalRecording({ ffmpegPath: '/verified/ffmpeg', protectionPath: '/verified/helper',
    signal: owner.signal, deadline: Date.now() + 1000, open: opening }, configuration())).rejects.toThrow();
  expect(spawnExternalFfmpeg).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
});
it.each(['compressed', 'cover-art', 'artwork-key', 'too-many-streams', 'truncated', 'oversized-header'])(
  'refuses %s source identity before launching a codec', async defect => {
    const box = (type: string, payload = Buffer.alloc(0)) => {
      const data = Buffer.alloc(8 + payload.length); data.writeUInt32BE(data.length); data.write(type, 4); payload.copy(data, 8); return data;
    };
    const track = box('trak', box('mdia', box('hdlr', Buffer.concat([Buffer.alloc(8), Buffer.from('vide')]))));
    let body = track;
    if (defect === 'compressed') body = box('cmov');
    else if (defect === 'cover-art') body = Buffer.concat([track, box('udta', box('meta', Buffer.concat([
      Buffer.alloc(4), box('ilst', box('covr'))])))]);
    else if (defect === 'artwork-key') {
      const key = Buffer.from('com.apple.quicktime.artwork'), entry = Buffer.alloc(8 + key.length);
      entry.writeUInt32BE(entry.length); entry.write('mdta', 4); key.copy(entry, 8);
      const count = Buffer.alloc(8); count.writeUInt32BE(1, 4);
      body = Buffer.concat([track, box('udta', box('meta', Buffer.concat([Buffer.alloc(4), box('keys', Buffer.concat([count, entry]))])))]);
    } else if (defect === 'too-many-streams') body = Buffer.concat(Array.from({ length: 9 }, () => track));
    let source = box('moov', body);
    if (defect === 'truncated') { source = box('moov'); source.writeUInt32BE(16); }
    else if (defect === 'oversized-header') { source = Buffer.alloc(16); source.writeUInt32BE(1); source.write('moov', 4); source.writeBigUInt64BE(1n << 63n, 8); }
    const directory = await fs.mkdtemp(join(tmpdir(), 'blink-stream-identity-')), path = join(directory, 'source.mp4');
    let input: FileHandle | undefined;
    try {
      await fs.writeFile(path, source, { mode: 0o600 }); input = await fs.open(path, 'r');
      await expect(inspectExternalRecording({ ffmpegPath: '/verified/ffmpeg', protectionPath: '/verified/helper',
        signal: new globalThis.AbortController().signal, deadline: Date.now() + 1000, open: async () => input! }, configuration()))
        .rejects.toMatchObject({ code: 'MEDIA' });
      expect(spawnExternalFfmpeg).not.toHaveBeenCalled(); await expect(input.stat()).rejects.toThrow();
    } finally { await input?.close(); await fs.rm(directory, { recursive: true, force: true }); }
  });
it.each(['privacy', 'deadline'])('rechecks %s after an asynchronous identity read', async reason => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'blink-stream-cancel-')), path = join(directory, 'source.mp4');
  const owner = new globalThis.AbortController(); let clock: jest.SpyInstance | undefined, input: FileHandle | undefined;
  try {
    const source = Buffer.alloc(8); source.writeUInt32BE(8); source.write('moov', 4);
    await fs.writeFile(path, source, { mode: 0o600 }); input = await fs.open(path, 'r');
    const read = input.read.bind(input), deadline = Date.now() + 1000;
    jest.spyOn(input, 'read').mockImplementation(async (...args) => {
      const result = await read(...args);
      if (reason === 'privacy') owner.abort(); else clock = jest.spyOn(Date, 'now').mockReturnValue(deadline);
      return result;
    });
    const pending = inspectExternalRecording({ ffmpegPath: '/verified/ffmpeg', protectionPath: '/verified/helper',
      signal: owner.signal, deadline, open: async () => input! }, configuration());
    if (reason === 'privacy') await expect(pending).rejects.toThrow();
    else await expect(pending).rejects.toMatchObject({ code: 'TIME_LIMIT' });
    expect(spawnExternalFfmpeg).not.toHaveBeenCalled(); await expect(input.stat()).rejects.toThrow();
  } finally { clock?.mockRestore(); await input?.close(); await fs.rm(directory, { recursive: true, force: true }); }
});
it.each([['unexpected', 'unexpected decoder error'], ['NULL decoder error', '[NULL @ 0x123] no frame!'],
  ['overlong', `[h264 @ 0x${'a'.repeat(1024)}] no frame!`],
  ['wrong-stream', '[vist#0:1/h264 @ 0x123] Error submitting packet to decoder: Invalid data found when processing input']])(
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
      originUs: 0, metadata: 512, corrections: [], videoStreamIndex: 0 }, false, false, () => undefined)).rejects.toMatchObject({ code: 'DECODE' });
    expect(close).toHaveBeenCalledTimes(1);
  });
const audioFailureDiagnostic = '[aac @ 0x123] Error decoding AAC frame header.\n' +
  '[aist#0:1/aac @ 0x456] Error submitting packet to decoder: Invalid data found when processing input\n';
it.each([
  ['generic failure', '', 1, 'DECODE'], ['empty output', '', 0, 'DECODE'],
  ['video failure', '[h264 @ 0x123] error while decoding MB 0 0, bytestream -3\n', 1, 'DECODE'],
  ['6.1 audio failure', audioFailureDiagnostic, 1, 'AUDIO_DISCONTINUITY'],
  ['9 audio failure', '[aac @ 0x123] Error decoding AAC frame header.\n[aist#0:1/aac @ 0x456] [dec:aac @ 0x789] Error submitting packet to decoder: Error number -50531338 occurred\n', 1, 'AUDIO_DISCONTINUITY'],
  ['AAC channel-element failure', '[aac @ 0x123] channel element 0.0 is not allocated\n[aist#0:1/aac @ 0x456] Error submitting packet to decoder: Invalid data found when processing input\n', 1, 'AUDIO_DISCONTINUITY'],
  ['missing audio map', "Stream map '0:a:0' matches no streams.\nTo ignore this, add a trailing '?' to the map.\n", 1, 'AUDIO_DISCONTINUITY'],
  ['AAC detail with proved decoder failure', '[aac @ 0x123] private decoder diagnostic\n' + audioFailureDiagnostic, 1, 'AUDIO_DISCONTINUITY'],
  ['audio plus generic failure', audioFailureDiagnostic + 'private unknown failure\n', 1, 'DECODE'],
  ['unknown AAC diagnostic', '[aac @ 0x123] private unknown failure\n', 1, 'DECODE'],
  ['audio plus video failure', audioFailureDiagnostic + '[h264 @ 0x123] error while decoding MB 0 0, bytestream -3\n', 1, 'DECODE'],
  ['audio plus excess metadata errors', audioFailureDiagnostic + '[h264 @ 0x123] no frame!\n', 1, 'DECODE'],
  ['audio plus overlong diagnostic', audioFailureDiagnostic + 'x'.repeat(1025) + '\n', 1, 'DECODE'],
  ['audio plus abnormal termination', audioFailureDiagnostic, null, 'DECODE'],
  ['unterminated audio failure', '[aac @ 0x123] Error decoding AAC frame header.', 1, 'DECODE'],
] as const)('classifies %s from evidence rather than the audio permission', async (_kind, diagnostic, code, expected) => {
  const child = new EventEmitter() as ChildProcess, stdout = new PassThrough(), stderr = new PassThrough();
  Object.assign(child, { stdout, stderr });
  const close = jest.fn(async () => undefined), input = { fd: 42, close } as unknown as FileHandle;
  jest.mocked(spawnExternalFfmpeg).mockImplementation(() => {
    globalThis.setImmediate(() => { stdout.end(); stderr.end(diagnostic); child.emit('close', code); }); return child;
  });
  const pending = convertExternalRecording({ ffmpegPath: '/verified/ffmpeg', protectionPath: '/verified/helper',
    signal: new globalThis.AbortController().signal, deadline: Date.now() + 1000, open: async () => input }, configuration(),
  { pictures: [{ pts: 0, duration: 66667 }], selected: [{ pts: 0, duration: 66667 }], durationUs: 66667,
    originUs: 0, audioOriginUs: 0, metadata: 0, corrections: [], videoStreamIndex: 0 }, true, false, () => undefined);
  await expect(pending).rejects.toMatchObject({ code: expected, message: 'External recording conversion failed' });
  expect(close).toHaveBeenCalledTimes(1);
});
it('reports an expired conversion deadline before classifying an audio failure', async () => {
  const child = new EventEmitter() as ChildProcess, stdout = new PassThrough(), stderr = new PassThrough();
  Object.assign(child, { stdout, stderr });
  const input = { fd: 42, close: jest.fn(async () => undefined) } as unknown as FileHandle, deadline = Date.now() + 1000;
  let clock: jest.SpyInstance | undefined;
  jest.mocked(spawnExternalFfmpeg).mockImplementation(() => {
    globalThis.setImmediate(() => {
      stdout.end(); stderr.end('[aac @ 0x123] Error decoding AAC frame header.\n');
      clock = jest.spyOn(Date, 'now').mockReturnValue(deadline); child.emit('close', null);
    }); return child;
  });
  try {
    await expect(convertExternalRecording({ ffmpegPath: '/verified/ffmpeg', protectionPath: '/verified/helper',
      signal: new globalThis.AbortController().signal, deadline, open: async () => input }, configuration(),
    { pictures: [{ pts: 0, duration: 66667 }], selected: [{ pts: 0, duration: 66667 }], durationUs: 66667,
      originUs: 0, metadata: 0, corrections: [], videoStreamIndex: 0 }, true, false, () => undefined)).rejects.toMatchObject({ code: 'TIME_LIMIT' });
  } finally { clock?.mockRestore(); }
});
it.each(['active', 'privacy', 'deadline'])('checks %s ownership before recovering proven source audio damage', async state => {
  const owner = new globalThis.AbortController(), open = jest.fn(), deadline = Date.now() + (state === 'deadline' ? -1 : 1000);
  if (state === 'privacy') owner.abort();
  const pending = convertExternalRecording({ ffmpegPath: '/verified/ffmpeg', protectionPath: '/verified/helper', signal: owner.signal,
    deadline, open }, configuration(), { pictures: [{ pts: 0, duration: 66667 }], selected: [{ pts: 0, duration: 66667 }], durationUs: 66667,
    originUs: 0, audioFailure: 'AUDIO_DISCONTINUITY', metadata: 0, corrections: [], videoStreamIndex: 0 }, true, false, () => undefined);
  if (state === 'privacy') await expect(pending).rejects.toThrow();
  else await expect(pending).rejects.toMatchObject({ code: state === 'deadline' ? 'TIME_LIMIT' : 'AUDIO_DISCONTINUITY' });
  expect(open).not.toHaveBeenCalled(); expect(spawnExternalFfmpeg).not.toHaveBeenCalled();
});

const ffmpeg = (() => { try { return resolveExternalFfmpegPath(process.env.BLINK_FFMPEG_TEST_PATH ??
  (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg')); } catch { return undefined; } })();
const protection = process.env.BLINK_PROTECTION_TEST_WORKER_PATH ??
  join(process.cwd(), 'native/build/blink-protection-worker' + (process.platform === 'win32' ? '.exe' : ''));
const media = ffmpeg && existsSync(protection) ? test : test.skip;
const execute = (args: string[], input?: Buffer) => execFileSync(ffmpeg!, ['-hide_banner', '-nostdin', '-v', 'error', ...args],
  { input, timeout: 15000, maxBuffer: 32 * 1024 * 1024 });
const configuration = (rate = 16000): CameraRecordingConfiguration => ({ prebufferLength: 4000, eventTriggerTypes: [1],
  mediaContainerConfiguration: { type: 0, fragmentLength: 1000 },
  videoCodec: { type: 0, resolution: [16, 16, 15], parameters: { profile: 0, level: 0, bitRate: 300, iFrameInterval: 1000 } },
  audioCodec: { type: 0, samplerate: rate === 16000 ? 1 : 2, audioChannels: 1, bitrateMode: 0, bitrate: 32 } });
async function recording(source: Buffer, audio: boolean, rate = 16000, silence = false, dimensions?: readonly [number, number]) {
  jest.mocked(spawnExternalFfmpeg).mockImplementation(jest.requireActual('../src/accessories/external-ffmpeg').spawnExternalFfmpeg);
  const directory = await fs.mkdtemp(join(tmpdir(), 'blink-recording-clock-')), file = join(directory, 'source.mp4');
  try {
    await fs.writeFile(file, source, { mode: 0o600 });
    const context = { ffmpegPath: ffmpeg!, protectionPath: protection, signal: new globalThis.AbortController().signal,
      deadline: Date.now() + 15000, open: () => fs.open(file, 'r') };
    const selected = configuration(rate), chunks: Buffer[] = [];
    const plan = await inspectExternalRecording(context, selected, audio);
    if (dimensions) selected.videoCodec.resolution = [...dimensions, 15];
    await convertExternalRecording(context, selected, plan, audio, silence, bytes => chunks.push(Buffer.from(bytes)));
    const output = Buffer.concat(chunks);
    await validateExternalRecording(context, output, selected, plan, audio, silence);
    return { plan, output };
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
media.each([[1, 24], [90, 24], [1, 30]])('keeps a %s-second %s-fps source end independent of output frame selection', async (seconds, sourceFps) => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'blink-recording-source-end-')), file = join(directory, 'source.mp4');
  try {
    execute(['-f', 'lavfi', '-i', `testsrc2=size=16x16:rate=${sourceFps}:duration=${seconds}`, '-an', '-c:v', 'libx264',
      '-threads', '1', '-preset', 'ultrafast', '-bf', '0', '-f', 'mp4', file]);
    await fs.chmod(file, 0o600);
    const source = await fs.readFile(file), expectedSha256 = createHash('sha256').update(source).digest('hex');
    jest.mocked(spawnExternalFfmpeg).mockImplementation(jest.requireActual('../src/accessories/external-ffmpeg').spawnExternalFfmpeg);
    const context = { ffmpegPath: ffmpeg!, protectionPath: protection, signal: new globalThis.AbortController().signal,
      deadline: Date.now() + 15000, open: () => fs.open(file, 'r') };
    for (const fps of [15, 24]) {
      const selected = configuration(), memory = new NativeRecordingMemoryBudget();
      selected.videoCodec.resolution = [16, 16, fps];
      const plan = await inspectExternalRecording(context, selected);
      expect(plan.durationUs).toBe(seconds * 1000000);
      const prepared = await prepareNativeRecording({ filePath: file, expectedBytes: source.length, expectedSha256 }, selected, false,
        new globalThis.AbortController().signal, { ffmpegPath: ffmpeg!, memory, admit: work => work() });
      const output = Buffer.concat([prepared.initialization, ...prepared.fragments.map(fragment => fragment.data)]);
      try {
        // Read actual tfdt/trun timing through the public prepared timeline.
        // FFmpeg 6.1's fragmented-MOV reader substitutes nominal H.264 duration
        // for the final packet, even when the stored sample duration is exact.
        expect(prepared.durationMs).toBe(seconds * 1000);
        const metadata = execute(['-i', 'pipe:0', '-map', '0:v:0', '-an', '-c:v', 'rawvideo', '-threads:v', '1',
          '-fps_mode:v', 'passthrough', '-enc_time_base:v', '1/1000000', '-f', 'framecrc', 'pipe:1'], output).toString();
        const base = /^#tb 0: (\d+)\/(\d+)$/m.exec(metadata)!;
        const packets = metadata.split('\n').filter(line => /^0,/.test(line)).map(line => line.split(',').map(Number));
        expect(packets).toHaveLength(plan.selected.length);
        for (const [index, packet] of packets.entries()) {
          expect(Math.abs((packet[2] - packets[0][2]) * Number(base[1]) * 1000000 / Number(base[2]) - plan.selected[index].pts)).toBeLessThanOrEqual(12);
        }
      } finally { output.fill(0); prepared.dispose(); }
      expect(memory.bytes).toBe(0);
    }
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}, 20000);
media('refuses a source beyond 90 seconds even when output frame selection drops its final picture', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'blink-recording-source-limit-')), file = join(directory, 'source.mp4');
  try {
    execute(['-f', 'lavfi', '-i', 'testsrc2=size=16x16:rate=24', '-frames:v', '2162', '-an', '-c:v', 'libx264',
      '-threads', '1', '-preset', 'ultrafast', '-bf', '0', '-f', 'mp4', file]);
    jest.mocked(spawnExternalFfmpeg).mockImplementation(jest.requireActual('../src/accessories/external-ffmpeg').spawnExternalFfmpeg);
    await expect(inspectExternalRecording({ ffmpegPath: ffmpeg!, protectionPath: protection,
      signal: new globalThis.AbortController().signal, deadline: Date.now() + 15000, open: () => fs.open(file, 'r') }, configuration()))
      .rejects.toMatchObject({ code: 'VIDEO_TIMESTAMP' });
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}, 20000);
media('prepares audio-first metadata without depending on a packaged helper manifest', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'blink-recording-audio-first-')), file = join(directory, 'source.mp4');
  try {
    execute(['-f', 'lavfi', '-i', 'testsrc2=size=16x16:rate=15:duration=2', '-f', 'lavfi', '-i',
      'sine=frequency=440:sample_rate=16000:duration=2', '-map', '1:a:0', '-map', '0:v:0',
      '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-bf', '0', '-c:a', 'aac', '-ar', '16000', '-ac', '1', '-f', 'mp4', file]);
    const mutator = pathToFileURL(join(process.cwd(), '.github/scripts/external-recording-check.mjs')).href;
    const source = execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { readFileSync } from 'node:fs'; import { mutateRecordingFixture } from ${JSON.stringify(mutator)};` +
      'process.stdout.write(mutateRecordingFixture(readFileSync(0), { metadataEvery: 5 }));'],
    { input: await fs.readFile(file), timeout: 10000, maxBuffer: 32 * 1024 * 1024 });
    jest.mocked(spawnExternalFfmpeg).mockImplementation(jest.requireActual('../src/accessories/external-ffmpeg').spawnExternalFfmpeg);
    await fs.writeFile(file, source, { mode: 0o600 }); await fs.chmod(file, 0o600);
    const expectedSha256 = createHash('sha256').update(source).digest('hex'), memory = new NativeRecordingMemoryBudget();
    const prepared = await prepareNativeRecording({ filePath: file, expectedBytes: source.length, expectedSha256 }, configuration(), true,
      new globalThis.AbortController().signal, { ffmpegPath: ffmpeg!, memory, admit: work => work() });
    try {
      expect(prepared.recovery).toBeUndefined();
      const output = Buffer.concat([prepared.initialization, ...prepared.fragments.map(fragment => fragment.data)]);
      const decoded = execute(['-i', 'pipe:0', '-map', '0:v:0', '-threads', '1', '-fps_mode:v', 'passthrough', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1'], output);
      expect(decoded.length).toBe(30 * 16 * 16);
      const pcm = execute(['-i', 'pipe:0', '-map', '0:a:0', '-ac', '1', '-f', 'f32le', 'pipe:1'], output);
      expect(Array.from({ length: pcm.length / 4 }, (_, i) => Math.abs(pcm.readFloatLE(i * 4))).some(value => value > 0.01)).toBe(true);
      output.fill(0);
    } finally { prepared.dispose(); }
    expect(memory.bytes).toBe(0); expect(await fs.readdir(directory)).toEqual(['source.mp4']);
    expect(createHash('sha256').update(await fs.readFile(file)).digest('hex')).toBe(expectedSha256); source.fill(0);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}, 20000);
media('preserves finite display aspect before emitting square pixels', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'blink-recording-sar-')), file = join(directory, 'source.mp4');
  try {
    execute(['-f', 'lavfi', '-i', 'color=c=white:size=640x360:rate=15:duration=0.4', '-vf', 'setsar=2', '-an',
      '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-bf', '0', '-f', 'mp4', file]);
    const { output } = await recording(await fs.readFile(file), false, 16000, false, [640, 360]);
    const frames = execute(['-i', 'pipe:0', '-map', '0:v:0', '-frames:v', '1', '-c:v', 'rawvideo', '-f', 'framecrc', 'pipe:1'], output).toString();
    expect(frames).toMatch(/^#sar 0: 1\/1$/m);
    const pixels = execute(['-i', 'pipe:0', '-map', '0:v:0', '-frames:v', '1', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1'], output);
    let top = 0, bottom = 0;
    const dark = (row: number) => pixels.subarray(row * 640, (row + 1) * 640).every(value => value < 32);
    while (top < 360 && dark(top)) top++; while (bottom < 360 && dark(359 - bottom)) bottom++;
    expect(top).toBe(90); expect(bottom).toBe(90); expect(pixels.subarray(180 * 640, 181 * 640).every(value => value > 220)).toBe(true);
    output.fill(0);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}, 20000);
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
media.each(['missing', 'corrupt', 'zero-corrupt', 'first-corrupt'])('keeps %s source audio eligible for silence recovery after origin inspection', async defect => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'blink-recording-audio-')), file = join(directory, 'source.mp4');
  try {
    execute(['-f', 'lavfi', '-i', 'testsrc2=size=16x16:rate=15:duration=2', ...(defect === 'missing' ? [] :
      ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000:duration=2']), '-c:v', 'libx264', '-threads', '1',
    '-preset', 'ultrafast', '-bf', '0', ...(defect === 'missing' ? ['-an'] : ['-c:a', 'aac', '-ar', '16000', '-ac', '1']), '-f', 'mp4', file]);
    const mutator = pathToFileURL(join(process.cwd(), '.github/scripts/external-recording-check.mjs')).href;
    const original = await fs.readFile(file);
    const source = defect === 'missing' ? Buffer.from(original) : execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { readFileSync } from 'node:fs'; import { mutateRecordingFixture } from ${JSON.stringify(mutator)};` +
      `process.stdout.write(mutateRecordingFixture(readFileSync(0), { ${defect === 'first-corrupt' ? 'corruptFirstAudio' : 'corruptAudio'}: true }));`],
    { input: original, timeout: 10000, maxBuffer: 32 * 1024 * 1024 });
    if (defect === 'zero-corrupt') for (let at = 0; at < source.length; at++) if (source[at] !== original[at]) source[at] = 0;
    original.fill(0);
    await expect(recording(source, true)).rejects.toMatchObject({ code: 'AUDIO_DISCONTINUITY' });
    const { output } = await recording(source, true, 16000, true);
    const pcm = execute(['-i', 'pipe:0', '-map', '0:a:0', '-ar', '16000', '-ac', '1', '-f', 'f32le', 'pipe:1'], output);
    expect(pcm.every(byte => byte === 0)).toBe(true); output.fill(0);
    await fs.writeFile(file, source); await fs.chmod(file, 0o600);
    const expectedSha256 = createHash('sha256').update(source).digest('hex'), memory = new NativeRecordingMemoryBudget();
    jest.mocked(spawnExternalFfmpeg).mockClear();
    const prepared = await prepareNativeRecording({ filePath: file, expectedBytes: source.length, expectedSha256 }, configuration(), true,
      new globalThis.AbortController().signal, { ffmpegPath: ffmpeg!, memory, admit: work => work() });
    try {
      expect(prepared.recovery).toMatchObject({ attempts: 2, initialWorkerCode: 'AUDIO_DISCONTINUITY' });
      if (defect !== 'missing') expect(jest.mocked(spawnExternalFfmpeg).mock.calls.filter(([, args]) => args.includes('libx264'))).toHaveLength(1);
    }
    finally { prepared.dispose(); }
    expect(memory.bytes).toBe(0); expect(await fs.readdir(directory)).toEqual(['source.mp4']);
    expect(createHash('sha256').update(await fs.readFile(file)).digest('hex')).toBe(expectedSha256); source.fill(0);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}, 20000);
media.each([false, true])('prepares usable video with a corrupt first AAC sample when audio permission is %s', async audioActive => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'blink-recording-first-aac-')), file = join(directory, 'source.mp4');
  try {
    execute(['-f', 'lavfi', '-i', 'testsrc2=size=16x16:rate=15:duration=2', '-f', 'lavfi', '-i',
      'sine=frequency=440:sample_rate=16000:duration=2', '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast',
      '-bf', '0', '-c:a', 'aac', '-ar', '16000', '-ac', '1', '-f', 'mp4', file]);
    const mutator = pathToFileURL(join(process.cwd(), '.github/scripts/external-recording-check.mjs')).href;
    const source = execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { readFileSync } from 'node:fs'; import { mutateRecordingFixture } from ${JSON.stringify(mutator)};` +
      'process.stdout.write(mutateRecordingFixture(readFileSync(0), { corruptFirstAudio: true }));'],
    { input: await fs.readFile(file), timeout: 10000, maxBuffer: 32 * 1024 * 1024 });
    await fs.writeFile(file, source); await fs.chmod(file, 0o600);
    jest.mocked(spawnExternalFfmpeg).mockImplementation(jest.requireActual('../src/accessories/external-ffmpeg').spawnExternalFfmpeg);
    const expectedSha256 = createHash('sha256').update(source).digest('hex'), memory = new NativeRecordingMemoryBudget();
    const prepared = await prepareNativeRecording({ filePath: file, expectedBytes: source.length, expectedSha256 }, configuration(), audioActive,
      new globalThis.AbortController().signal, { ffmpegPath: ffmpeg!, memory, admit: work => work() });
    try {
      expect(prepared.durationMs).toBeCloseTo(2000, 1); expect(prepared.audioActive).toBe(audioActive);
      const output = Buffer.concat([prepared.initialization, ...prepared.fragments.map(fragment => fragment.data)]);
      try {
        const decoded = execute(['-i', 'pipe:0', '-map', '0:v:0', '-an', '-c:v', 'rawvideo', '-f', 'framecrc', 'pipe:1'], output);
        expect(decoded.toString().split('\n').filter(line => /^0,/.test(line))).toHaveLength(30);
        if (audioActive) {
          expect(prepared.recovery).toMatchObject({ attempts: 2, initialWorkerCode: 'AUDIO_DISCONTINUITY' });
          const pcm = execute(['-i', 'pipe:0', '-map', '0:a:0', '-ar', '16000', '-ac', '1', '-f', 'f32le', 'pipe:1'], output);
          expect(pcm.length).toBeGreaterThan(0); expect(pcm.every(byte => byte === 0)).toBe(true);
        } else {
          expect(prepared.recovery).toBeUndefined();
          expect(jest.mocked(spawnExternalFfmpeg).mock.calls.some(([, args]) => args.includes('0:a:0?'))).toBe(false);
          const inventory = execute(['-i', 'pipe:0', '-map', '0', '-c', 'copy', '-f', 'framecrc', 'pipe:1'], output).toString();
          expect(inventory).toContain('#media_type 0: video'); expect(inventory).not.toMatch(/#media_type \d+: audio/);
        }
      } finally { output.fill(0); }
      expect(jest.mocked(spawnExternalFfmpeg).mock.calls.filter(([, args]) => args.includes('libx264'))).toHaveLength(1);
    } finally { prepared.dispose(); }
    expect(memory.bytes).toBe(0); expect(await fs.readdir(directory)).toEqual(['source.mp4']);
    expect(createHash('sha256').update(await fs.readFile(file)).digest('hex')).toBe(expectedSha256); source.fill(0);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}, 20000);
media('does not retry a late video decode failure as audio recovery', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'blink-recording-video-error-')), file = join(directory, 'source.mp4');
  try {
    execute(['-f', 'lavfi', '-i', 'testsrc2=size=64x64:rate=15:duration=2', '-f', 'lavfi', '-i',
      'sine=frequency=440:sample_rate=16000:duration=2', '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast',
      '-bf', '0', '-g', '1', '-c:a', 'aac', '-ar', '16000', '-ac', '1', '-f', 'mp4', file]);
    const mutator = pathToFileURL(join(process.cwd(), '.github/scripts/external-recording-check.mjs')).href;
    const source = execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { readFileSync } from 'node:fs'; import { mutateRecordingFixture } from ${JSON.stringify(mutator)};` +
      'process.stdout.write(mutateRecordingFixture(readFileSync(0), { corruptVideoPayload: true }));'],
    { input: await fs.readFile(file), timeout: 10000, maxBuffer: 32 * 1024 * 1024 });
    await fs.writeFile(file, source); await fs.chmod(file, 0o600);
    jest.mocked(spawnExternalFfmpeg).mockImplementation(jest.requireActual('../src/accessories/external-ffmpeg').spawnExternalFfmpeg);
    const expectedSha256 = createHash('sha256').update(source).digest('hex'), memory = new NativeRecordingMemoryBudget();
    let failure: unknown;
    try {
      const prepared = await prepareNativeRecording({ filePath: file, expectedBytes: source.length, expectedSha256 }, configuration(), true,
        new globalThis.AbortController().signal, { ffmpegPath: ffmpeg!, memory, admit: work => work() });
      prepared.dispose();
    } catch (error) { failure = error; }
    expect(failure).toMatchObject({ diagnostic: { phase: 'output', workerCode: 'DECODE' } });
    expect(failure).not.toHaveProperty('diagnostic.salvageAttempted');
    expect(jest.mocked(spawnExternalFfmpeg).mock.calls.filter(([, args]) => args.includes('libx264'))).toHaveLength(1);
    expect(memory.bytes).toBe(0); expect(await fs.readdir(directory)).toEqual(['source.mp4']);
    expect(createHash('sha256').update(await fs.readFile(file)).digest('hex')).toBe(expectedSha256); source.fill(0);
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

media.each([...([500000, 700000, 1000000].flatMap(gapUs => [false, true].map(audio => ({ gapUs, audio, balanced: false })))),
  ...[false, true].map(audio => ({ gapUs: 700000, audio, balanced: true }))])(
  'bounds fragments around a $gapUs-us picture gap with audio $audio and balanced cadence $balanced', async ({ gapUs, audio, balanced }) => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'blink-recording-picture-gap-')), file = join(directory, 'source.mp4');
    const originUs = gapUs === 700000 ? 200000 : 0;
    try {
      execute(['-f', 'lavfi', '-i', 'testsrc2=size=16x16:rate=10:duration=3', '-f', 'lavfi', '-i',
        'sine=frequency=440:sample_rate=16000:duration=5', '-vf',
        `settb=1/1000000,setpts=PTS+if(gte(N\\,8)\\,${gapUs - 100000}\\,0)+${originUs}` +
          (balanced ? '-if(gte(N\\,9)\\,min((N-8)*30000\\,600000)\\,0)' : ''),
        '-fps_mode:v', 'passthrough', '-enc_time_base:v', '1/1000000', '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast',
        '-bf', '0', '-c:a', 'aac', '-ar', '16000', '-ac', '1', '-shortest', '-f', 'mp4', file]);
      await fs.chmod(file, 0o600);
      const source = await fs.readFile(file), expectedSha256 = createHash('sha256').update(source).digest('hex');
      const memory = new NativeRecordingMemoryBudget();
      jest.mocked(spawnExternalFfmpeg).mockImplementation(jest.requireActual('../src/accessories/external-ffmpeg').spawnExternalFfmpeg);
      const pending = prepareNativeRecording({ filePath: file, expectedBytes: source.length, expectedSha256 }, configuration(), audio,
        new globalThis.AbortController().signal, { ffmpegPath: ffmpeg!, memory, admit: work => work() });
      if (gapUs === 1000000) {
        await expect(pending).rejects.toMatchObject({ diagnostic: { phase: 'input', workerCode: 'FRAGMENT_LIMIT' } });
        expect(jest.mocked(spawnExternalFfmpeg).mock.calls.some(([, args]) => args.includes('libx264') || args.includes('0:a:0?'))).toBe(false);
      } else {
        const prepared = await pending;
        try {
          expect(prepared.recovery).toBeUndefined(); expect(prepared.durationMs).toBe(balanced ? 3000 : (3000000 + gapUs - 100000) / 1000);
          expect(prepared.fragments[0].durationMs).toBe(700);
          expect(prepared.fragments.every(fragment => fragment.durationMs > 0 && fragment.durationMs <= 1000)).toBe(true);
          const output = Buffer.concat([prepared.initialization, ...prepared.fragments.map(fragment => fragment.data)]);
          try {
            const metadata = execute(['-i', 'pipe:0', '-map', '0:v:0', '-an', '-c:v', 'rawvideo', '-threads:v', '1',
              '-fps_mode:v', 'passthrough', '-enc_time_base:v', '1/1000000', '-f', 'framecrc', 'pipe:1'], output).toString();
            const base = /^#tb 0: (\d+)\/(\d+)$/m.exec(metadata)!;
            const packets = metadata.split('\n').filter(line => /^0,/.test(line)).map(line => line.split(',').map(Number));
            expect(packets).toHaveLength(30);
            for (const [index, packet] of packets.entries()) {
              const expectedPts = index * 100000 + (index >= 8 ? gapUs - 100000 : 0) -
                (balanced && index >= 9 ? Math.min((index - 8) * 30000, 600000) : 0);
              expect((packet[2] - packets[0][2]) * Number(base[1]) * 1000000 / Number(base[2])).toBe(expectedPts);
            }
            if (audio) {
              const pcm = execute(['-i', 'pipe:0', '-map', '0:a:0', '-ac', '1', '-f', 'f32le', 'pipe:1'], output);
              expect(Array.from({ length: pcm.length / 4 }, (_, index) => Math.abs(pcm.readFloatLE(index * 4))).some(value => value > 0.01)).toBe(true);
            }
          } finally { output.fill(0); }
          expect(jest.mocked(spawnExternalFfmpeg).mock.calls.filter(([, args]) => args.includes('libx264'))).toHaveLength(1);
        } finally { prepared.dispose(); }
      }
      expect(memory.bytes).toBe(0); expect(await fs.readdir(directory)).toEqual(['source.mp4']);
      expect(createHash('sha256').update(await fs.readFile(file)).digest('hex')).toBe(expectedSha256); source.fill(0);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  }, 20000);

media.each(['terminal', 'crop', 'crop-one-tick', 'leading-crop', 'repeat', 'sample-count', 'timing-count', 'media-duration'] as const)(
  'binds source timing to ordinary MP4 sample tables under %s control', async control => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'blink-recording-source-timing-')), file = join(directory, 'source.mp4');
    try {
      execute(['-f', 'lavfi', '-i', 'testsrc2=size=16x16:rate=10:duration=3', '-f', 'lavfi', '-i',
        'sine=frequency=440:sample_rate=16000:duration=5', '-vf',
        'settb=1/1000000,setpts=PTS+if(gte(N\\,8)\\,600000\\,0)+200000',
        '-fps_mode:v', 'passthrough', '-enc_time_base:v', '1/1000000', '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast',
        '-bf', '0', '-bsf:v', `setts=duration='if(eq(N,29),${control === 'crop-one-tick' ? 90001 : 90000},DURATION)'`,
        '-c:a', 'aac', '-ar', '16000', '-ac', '1',
        '-shortest', '-f', 'mp4', file]);
      const source = await fs.readFile(file);
      // These trusted generated fixtures use ordinary 32-bit boxes. Alter only
      // the declared field under test; public preparation owns all validation.
      interface Box { type: string; payload: number; end: number; }
      const boxes = (from = 0, end = source.length): Box[] => {
        const result: Box[] = [];
        for (let at = from; at < end;) {
          const size = source.readUInt32BE(at); if (size < 8 || at + size > end) throw new Error('Invalid synthetic box');
          result.push({ type: source.toString('ascii', at + 4, at + 8), payload: at + 8, end: at + size }); at += size;
        }
        return result;
      };
      const child = (box: Box, type: string): Box => boxes(box.payload, box.end).find(value => value.type === type)!;
      const movie = boxes().find(box => box.type === 'moov')!;
      const track = boxes(movie.payload, movie.end).find(box => box.type === 'trak' &&
        source.toString('ascii', child(child(box, 'mdia'), 'hdlr').payload + 8, child(child(box, 'mdia'), 'hdlr').payload + 12) === 'vide')!;
      const table = child(child(child(track, 'mdia'), 'minf'), 'stbl');
      if (control === 'crop' || control === 'crop-one-tick' || control === 'leading-crop' || control === 'repeat') {
        const edit = child(child(track, 'edts'), 'elst'); expect(source[edit.payload]).toBe(0);
        const last = edit.payload + 8 + (source.readUInt32BE(edit.payload + 4) - 1) * 12;
        const movieTimescale = source.readUInt32BE(child(movie, 'mvhd').payload + 12), segment = source.readUInt32BE(last);
        if (control === 'crop-one-tick') {
          // One movie tick below the integer ceiling cannot cover the exact
          // source extent, even when it differs by less than one microsecond.
          const whole = (3590001n * BigInt(movieTimescale) + 999999n) / 1000000n;
          source.writeUInt32BE(Number(whole) - 1, last);
        } else if (control === 'repeat') { expect(segment * 1000 / movieTimescale).toBe(3590); source.writeInt32BE(0, edit.payload + 12); }
        else {
          expect(segment * 1000 / movieTimescale).toBe(3590);
          source.writeUInt32BE(segment - movieTimescale / 10, last);
          if (control === 'leading-crop') source.writeInt32BE(100000, last + 4);
        }
      } else if (control === 'sample-count') {
        const sizes = child(table, 'stsz'); expect(source.readUInt32BE(sizes.payload + 8)).toBe(30); source.writeUInt32BE(31, sizes.payload + 8);
      } else if (control === 'timing-count') {
        const timing = child(table, 'stts'), last = timing.payload + 8 + (source.readUInt32BE(timing.payload + 4) - 1) * 8;
        source.writeUInt32BE(source.readUInt32BE(last) + 1, last);
      } else if (control === 'media-duration') {
        const header = child(child(track, 'mdia'), 'mdhd'); expect(source[header.payload]).toBe(0);
        const timescale = source.readUInt32BE(header.payload + 12), duration = source.readUInt32BE(header.payload + 16);
        expect(duration * 1000 / timescale).toBe(3590); source.writeUInt32BE(duration - timescale / 100, header.payload + 16);
      }
      await fs.writeFile(file, source); await fs.chmod(file, 0o600);
      const expectedSha256 = createHash('sha256').update(source).digest('hex'), memory = new NativeRecordingMemoryBudget();
      jest.mocked(spawnExternalFfmpeg).mockImplementation(jest.requireActual('../src/accessories/external-ffmpeg').spawnExternalFfmpeg);
      const pending = prepareNativeRecording({ filePath: file, expectedBytes: source.length, expectedSha256 }, configuration(), true,
        new globalThis.AbortController().signal, { ffmpegPath: ffmpeg!, memory, admit: work => work() });
      if (control === 'terminal') {
        const prepared = await pending;
        try { expect(prepared.durationMs).toBe(3590); expect(prepared.recovery).toBeUndefined(); }
        finally { prepared.dispose(); }
      } else {
        await expect(pending).rejects.toMatchObject({ diagnostic: { phase: 'input',
          workerCode: control === 'sample-count' || control === 'timing-count' ? 'MEDIA' : 'VIDEO_TIMESTAMP' } });
        expect(jest.mocked(spawnExternalFfmpeg).mock.calls.some(([, args]) => args.includes('libx264') || args.includes('0:a:0?'))).toBe(false);
      }
      expect(memory.bytes).toBe(0); expect(await fs.readdir(directory)).toEqual(['source.mp4']);
      expect(createHash('sha256').update(await fs.readFile(file)).digest('hex')).toBe(expectedSha256); source.fill(0);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  }, 20000);

media.each([false, true])('preserves reordered source pictures with signed offsets %s without terminal substitution', async signed => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'blink-recording-reordered-')), file = join(directory, 'source.mp4');
  try {
    execute(['-f', 'lavfi', '-i', 'testsrc2=size=16x16:rate=15:duration=2', '-f', 'lavfi', '-i',
      'sine=frequency=440:sample_rate=16000:duration=3', '-vf', 'setpts=PTS+0.2/TB', '-fps_mode:v', 'passthrough',
      '-c:v', 'libx264', '-threads', '1', '-preset', 'veryfast', '-bf', '2', '-c:a', 'aac', '-ar', '16000', '-ac', '1',
      ...(signed ? ['-movflags', '+negative_cts_offsets'] : []), '-shortest', '-f', 'mp4', file]);
    const { plan, output } = await recording(await fs.readFile(file), true);
    try { expect(plan.pictures).toHaveLength(30); expect(plan.originUs).toBe(200000); expect(plan.durationUs).toBe(2000000); }
    finally { output.fill(0); }
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}, 20000);
