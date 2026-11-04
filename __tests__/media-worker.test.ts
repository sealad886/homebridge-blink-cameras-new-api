import { test } from '@jest/globals';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrivateMediaWorker, MEDIA_WORKER_LIMITS, type WorkerSpawner, type RecordingFragment } from '../src/accessories/media-worker';
function output(type: number, payload: Buffer): Buffer {
  const h = Buffer.alloc(12); h.write('BMO1'); h.writeUInt32BE(type, 4); h.writeUInt32BE(payload.length, 8); return Buffer.concat([h, payload]);
}
function fixture(stalled = false) {
  const child = new EventEmitter() as ChildProcessWithoutNullStreams & { stdout: PassThrough; stderr: PassThrough }; const writes: Buffer[] = [];
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.stdin = new Writable({ write(bytes, _encoding, callback) { writes.push(Buffer.from(bytes)); if (!stalled) { callback(); } } });
  child.kill = jest.fn(() => { globalThis.queueMicrotask(() => child.emit('close', null)); return true; });
  const launch = jest.fn(() => child) as unknown as jest.MockedFunction<WorkerSpawner>;
  return { child, writes, launch };
}
const flush = async () => { for (let i = 0; i < 4; i++) { await Promise.resolve(); } };
function consumptionAck(bytes: number): Buffer { const body = Buffer.alloc(4); body.writeUInt32BE(bytes); return output(6, body); }
function status(fps = 1): Buffer { const body = Buffer.alloc(8); body.writeUInt32BE(4); body.writeUInt32BE(fps, 4); return output(1, body); }
function sourceInfo(width: number, height: number, numerator = 0, denominator = 1): Buffer {
  const body = Buffer.alloc(16); [width, height, numerator, denominator].forEach((n, i) => body.writeUInt32BE(n, i * 4)); return output(7, body);
}
test('source info delivers bounded non-sensitive actual geometry once, including unknown source fps', async () => {
  const f = fixture(); const info = jest.fn(); const worker = new PrivateMediaWorker('/verified/worker', { sourceInfo: info }, f.launch);
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  f.child.stdout.write(sourceInfo(2560, 1440)); expect(info).toHaveBeenCalledWith({ width: 2560, height: 1440, fpsNumerator: 0, fpsDenominator: 1 });
  f.child.stdout.write(sourceInfo(2560, 1440)); await worker.whenClosed; expect(worker.failed).toBe(true); expect(info).toHaveBeenCalledTimes(1);
});
test.each([[4097, 16, 0, 1], [4096, 2050, 0, 1], [1920, 1080, 121, 1], [16, 16, 0, 0], [16, 16, 0, 2]])('invalid source info %p retires owner', async (width, height, numerator, denominator) => {
  const f = fixture(); const info = jest.fn(); const worker = new PrivateMediaWorker('/verified/worker', { sourceInfo: info }, f.launch);
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); f.child.stdout.write(sourceInfo(width, height, numerator, denominator));
  await worker.whenClosed; expect(worker.failed).toBe(true); expect(info).not.toHaveBeenCalled();
});
test('source observer exception retires owner after validated rational frame rate', async () => {
  const f = fixture(); const info = jest.fn(() => { throw new Error('dummy-private-hook-value'); });
  const worker = new PrivateMediaWorker('/verified/worker', { sourceInfo: info }, f.launch);
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); f.child.stdout.write(sourceInfo(1920, 1080, 30000, 1001));
  await worker.whenClosed; expect(worker.failed).toBe(true);
  expect(info).toHaveBeenCalledWith({ width: 1920, height: 1080, fpsNumerator: 30000, fpsDenominator: 1001 });
});
test('ready observes validated STATUS and media drain waits for codec callbacks after END', async () => {
  const f = fixture(); let release!: () => void;
  const worker = new PrivateMediaWorker('/verified/worker', { packet: () => new Promise<void>(resolve => { release = resolve; }) }, f.launch);
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  let ready = false; worker.whenReady.then(() => { ready = true; }); await flush(); expect(ready).toBe(false);
  f.child.stdout.write(status()); await worker.whenReady;
  f.child.stdout.write(output(2, codecBody())); await worker.endMedia();
  let drained = false; worker.whenMediaDrained.then(() => { drained = true; }); f.child.stdout.write(output(3, Buffer.alloc(0)));
  await flush(); expect(drained).toBe(false); release(); await worker.whenMediaDrained; expect(drained).toBe(true);
  const closed = worker.finishInput(); f.child.emit('close', 0); await closed; expect(worker.failed).toBe(false);
});
test('STOP rejects ready and media drain observers', async () => {
  const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch);
  const ready = expect(worker.whenReady).rejects.toThrow(); const drained = expect(worker.whenMediaDrained).rejects.toThrow();
  await worker.stop(); await ready; await drained;
});
test.each(['ready', 'drain'])('missing %s has a bounded deadline', async phase => {
  jest.useFakeTimers(); try {
    const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch);
    await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const observed = expect(phase === 'ready' ? worker.whenReady : worker.whenMediaDrained).rejects.toThrow();
    if (phase === 'drain') { f.child.stdout.write(status()); await worker.endMedia(); }
    await jest.advanceTimersByTimeAsync(MEDIA_WORKER_LIMITS.requestMs); await observed; await worker.whenClosed;
  } finally { jest.useRealTimers(); }
});
test('MEDIA admission waits for native consumption and leaves control independent', async () => {
  const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch);
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  let complete = false; const media = worker.media(Buffer.alloc(65536)).then(() => { complete = true; });
  await flush(); expect(complete).toBe(false);
  await expect(worker.media(Buffer.alloc(1))).rejects.toThrow(); await expect(worker.endMedia()).rejects.toThrow();
  const p = await protector(f, worker); expect(p).toBeDefined();
  f.child.stdout.write(consumptionAck(32768)); await flush(); expect(complete).toBe(false);
  f.child.stdout.write(consumptionAck(65536)); await media; expect(complete).toBe(true); await worker.stop();
});
test.each([0, 17])('invalid native consumption count %i retires owner and rejects MEDIA', async bytes => {
  const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch);
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const media = worker.media(Buffer.alloc(16)); const checked = expect(media).rejects.toThrow(); await flush();
  f.child.stdout.write(consumptionAck(bytes)); await checked; await worker.whenClosed; expect(worker.failed).toBe(true);
});
test('duplicate cumulative consumption cannot release a later media chunk', async () => {
  const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch);
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); f.child.stdout.write(status());
  try {
    const first = worker.media(Buffer.alloc(16)); await flush(); f.child.stdout.write(consumptionAck(16)); await first;
    const second = worker.media(Buffer.alloc(16)); const rejected = expect(second).rejects.toThrow(); await flush();
    f.child.stdout.write(consumptionAck(16)); await rejected; await worker.whenClosed; expect(worker.failed).toBe(true);
  } finally { await worker.stop(); }
});
test('missing native consumption expires and STOP rejects consumption wait', async () => {
  jest.useFakeTimers(); try {
    const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch);
    await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const media = worker.media(Buffer.alloc(16)); const checked = expect(media).rejects.toThrow();
    await jest.advanceTimersByTimeAsync(MEDIA_WORKER_LIMITS.requestMs); await checked; await worker.whenClosed;
  } finally { jest.useRealTimers(); }
});
async function protector(f: ReturnType<typeof fixture>, worker: PrivateMediaWorker) {
  const init = worker.initialize(1, 7, Buffer.alloc(16, 9), Buffer.alloc(14, 8)); await flush();
  const ack = Buffer.alloc(4); ack.writeUInt32BE(1); f.child.stdout.write(output(10, ack)); return init;
}
test('executable only, scrubbed env and private pipes; init secrets only in stdin', async () => {
  const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch);
  const p = await protector(f, worker);
  expect(f.launch).toHaveBeenCalledWith('/verified/worker', [], { env: {}, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
  expect(f.writes[0].subarray(0, 4).toString()).toBe('BMI1'); expect(f.writes[0].readUInt32BE(8)).toBe(42);
  expect(f.writes[0].subarray(24, 40)).toEqual(Buffer.alloc(16, 9)); p.close(); await worker.whenClosed;
});
test('fragmented correlated protection replies and duplicate reply retirement', async () => {
  const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch); const p = await protector(f, worker);
  const request = p.protectRtp(Buffer.alloc(12)); await flush(); const sent = f.writes[1]; const reply = Buffer.alloc(30, 3);
  sent.copy(reply, 0, 12, 20); const bytes = output(11, reply);
  for (const byte of bytes) { f.child.stdout.write(Buffer.from([byte])); }
  expect(await request).toEqual(reply.subarray(8));
  f.child.stdout.write(bytes); await worker.whenClosed; await expect(p.protectRtp(Buffer.alloc(12))).rejects.toThrow();
});
test.each([['wrong magic', Buffer.from('BAD!00000000')], ['oversize header', (() => { const b = output(11, Buffer.alloc(0)); b.writeUInt32BE(0xffffffff, 8); return b; })()],
  ['unknown type', output(100, Buffer.alloc(0))]])('malformed output retires owner: %s', async (_name, bytes) => {
  const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch);
  f.child.stdout.write(bytes); await worker.whenClosed; expect(f.child.kill).toHaveBeenCalled();
});
test('unacknowledged request expires, rejects and closes owner', async () => {
  jest.useFakeTimers(); try {
    const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch);
    const init = worker.initialize(1, 7, Buffer.alloc(16), Buffer.alloc(14)); const check = expect(init).rejects.toThrow();
    await jest.advanceTimersByTimeAsync(MEDIA_WORKER_LIMITS.requestMs); await check; await worker.whenClosed;
  } finally { jest.useRealTimers(); }
});
test('same-stream request cap rejects extra without growing pipe queue', async () => {
  const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch); const p = await protector(f, worker);
  const request = p.protectRtp(Buffer.alloc(12)); request.catch(() => {}); await flush();
  await expect(p.protectRtp(Buffer.alloc(12))).rejects.toThrow(); expect(f.writes.length).toBe(2);
  await worker.stop(); await expect(request).rejects.toThrow();
});
test('stdin backpressure expires rather than accumulating writes', async () => {
  jest.useFakeTimers(); try {
    const f = fixture(true); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch);
    const config = worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); const check = expect(config).rejects.toThrow();
    await expect(worker.media(Buffer.alloc(1))).rejects.toThrow(); expect(f.writes.length).toBe(1);
    await jest.advanceTimersByTimeAsync(MEDIA_WORKER_LIMITS.requestMs); await check; await worker.whenClosed;
  } finally { jest.useRealTimers(); }
});
test('codec metadata preserved; STOP aborts held consumer and fences late packet', async () => {
  const f = fixture(); let signal: globalThis.AbortSignal | undefined; let release!: () => void;
  const packet = jest.fn((_packet: unknown, s: globalThis.AbortSignal) => { signal = s; return new Promise<void>(resolve => { release = resolve; }); });
  const worker = new PrivateMediaWorker('/verified/worker', { packet }, f.launch); await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const payload = Buffer.alloc(49); payload.writeBigInt64BE(123n); payload.writeBigInt64BE(100n, 8); payload.writeBigInt64BE(33333n, 16);
  payload.writeUInt32BE(1, 24); payload.writeUInt32BE(1, 28); payload.writeUInt32BE(1, 32); payload.writeUInt32BE(1000000, 36); payload[48] = 0x65;
  f.child.stdout.write(output(2, payload)); expect(packet).toHaveBeenCalledTimes(1);
  expect((packet.mock.calls[0][0] as { pts: bigint }).pts).toBe(123n); await worker.stop(); expect(signal?.aborted).toBe(true);
  release(); await flush(); f.child.stdout.write(output(2, payload)); expect(packet).toHaveBeenCalledTimes(1);
});
test('partial frame EOF and fatal exit reject pending callers without raw stderr', async () => {
  const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch);
  const pending = worker.initialize(1, 7, Buffer.alloc(16), Buffer.alloc(14)); const check = expect(pending).rejects.toThrow('Media protection initialization failed');
  f.child.stderr.write('secret dummy credentials'); f.child.stdout.end(Buffer.from('BMO1')); await worker.whenClosed; await check;
});
test('clean protocol END plus close releases owner', async () => {
  const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch);
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); await worker.endMedia();
  f.child.stdout.write(output(3, Buffer.alloc(0))); f.child.stdout.end(); f.child.emit('close', 0); await worker.whenClosed;
  expect(f.child.kill).not.toHaveBeenCalled();
});
test('partial output deadline closes stalled frame', async () => {
  jest.useFakeTimers(); try {
    const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch);
    f.child.stdout.write(Buffer.from('BMO1')); await jest.advanceTimersByTimeAsync(MEDIA_WORKER_LIMITS.requestMs);
    await worker.whenClosed; expect(f.child.kill).toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});
test('codec consumer deadline cancels paused output', async () => {
  jest.useFakeTimers(); try {
    const f = fixture(); const packet = jest.fn(() => new Promise<void>(() => {}));
    const worker = new PrivateMediaWorker('/verified/worker', { packet }, f.launch); await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const body = Buffer.alloc(49); body.writeUInt32BE(1, 28); body.writeUInt32BE(1, 32); body.writeUInt32BE(1000000, 36);
    f.child.stdout.write(output(2, body)); await jest.advanceTimersByTimeAsync(MEDIA_WORKER_LIMITS.requestMs);
    await worker.whenClosed; expect(packet).toHaveBeenCalledTimes(1);
  } finally { jest.useRealTimers(); }
});
test('mismatched stream and invalid protected length retire pending owner', async () => {
  const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch); const p = await protector(f, worker);
  const req = p.protectRtp(Buffer.alloc(12)); const check = expect(req).rejects.toThrow(); await flush();
  const reply = Buffer.alloc(30); reply.writeUInt32BE(1); reply.writeUInt32BE(2, 4);
  f.child.stdout.write(output(11, reply)); await check; await worker.whenClosed;
});
test('codec END allows final protected reply before graceful stdin close', async () => {
  const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch); const p = await protector(f, worker);
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); await worker.endMedia(); f.child.stdout.write(output(3, Buffer.alloc(0)));
  const request = p.protectRtp(Buffer.alloc(12)); await flush(); const reply = Buffer.alloc(30); reply.writeUInt32BE(1); reply.writeUInt32BE(1, 4);
  f.child.stdout.write(output(11, reply)); await request;
  const closed = worker.finishInput(); f.child.stdout.end(); f.child.emit('close', 0); await closed;
  expect(f.child.kill).not.toHaveBeenCalled(); await expect(worker.media(Buffer.alloc(1))).rejects.toThrow();
});
test('codec callback can await protection on same pipe without parser deadlock', async () => {
  const f = fixture(); let p: Awaited<ReturnType<PrivateMediaWorker['initialize']>>;
  let done!: () => void; const completed = new Promise<void>(resolve => { done = resolve; });
  const consumed: Buffer[] = []; const worker = new PrivateMediaWorker('/verified/worker', { packet: async packet => { consumed.push(await p.protectRtp(Buffer.alloc(12, packet.data[0]))); done(); } }, f.launch);
  p = await protector(f, worker); await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const body = Buffer.alloc(49); body.writeUInt32BE(1, 28); body.writeUInt32BE(1, 32); body.writeUInt32BE(1000000, 36); body[48] = 0x65;
  f.child.stdout.write(output(2, body)); await flush(); const reply = Buffer.alloc(30); reply.writeUInt32BE(1); reply.writeUInt32BE(1, 4);
  f.child.stdout.write(output(11, reply)); await completed; expect(consumed).toHaveLength(1); await worker.stop();
});
const realWorker = process.env.BLINK_MEDIA_TEST_WORKER_PATH;
(realWorker ? test : test.skip)('externally verified native worker matches published libsrtp RTP/SRTCP vectors', async () => {
  const worker = new PrivateMediaWorker(realWorker!);
  try {
    const p = await worker.initialize(1, 0xcafebabe, Buffer.from('e1f97a0d3e018be0d64fa32c06de4139', 'hex'), Buffer.from('0ec675ad498afeebb6960b3aabe6', 'hex'));
    const rtp = Buffer.from('800f1234decafbadcafebabeabababababababababababababababab', 'hex');
    expect((await p.protectRtp(rtp)).toString('hex')).toBe('800f1234decafbadcafebabe4e55dc4ce79978d88ca4d215949d2402b78d6acc99ea179b8dbb');
    const rtcp = Buffer.from('81c8000bcafebabeabababababababababababababababab', 'hex');
    expect((await p.protectRtcp(rtcp)).toString('hex')).toBe('81c8000bcafebabe7128035be487b9bdbef89041f977a5a880000001993e08cd54d6c1230798');
  } finally { await worker.stop(); }
});
(realWorker ? test : test.skip)('native consumption acknowledges fragmented MPEGTS while codec callback protects output', async () => {
  // eslint-disable-next-line no-undef -- Jest executes this test as CommonJS.
  const media = execFileSync(resolve(__dirname, `../native/build/fixture${process.platform === 'win32' ? '.exe' : ''}`));
  let complete!: () => void; const decoded = new Promise<void>(resolve => { complete = resolve; });
  let packets = 0; let p: Awaited<ReturnType<PrivateMediaWorker['initialize']>>;
  const worker = new PrivateMediaWorker(realWorker!, { packet: async () => {
    const rtp = Buffer.alloc(12); rtp[0] = 0x80; rtp.writeUInt16BE(packets, 2); rtp.writeUInt32BE(7, 8);
    expect((await p.protectRtp(rtp)).length).toBe(22);
    if (++packets === 4) { complete(); }
  } });
  try {
    p = await worker.initialize(1, 7, Buffer.alloc(16), Buffer.alloc(14));
    await worker.configure([16, 16, 15, 100000, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    await worker.whenReady;
    for (let i = 0; i < media.length; i += 37) { await worker.media(media.subarray(i, i + 37)); }
    await worker.endMedia(); await decoded; await worker.whenMediaDrained;
    await worker.finishInput(); expect(worker.failed).toBe(false);
  } finally { await worker.stop(); }
});
function codecBody(dataBytes = 1): Buffer {
  const body = Buffer.alloc(48 + dataBytes, 0x65); body.fill(0, 0, 48);
  body.writeUInt32BE(1, 28); body.writeUInt32BE(1, 32); body.writeUInt32BE(1000000, 36); return body;
}
function recordingBody(sequence = 0, dataBytes = 16): Buffer {
  const body = Buffer.alloc(24 + dataBytes); body.writeUInt32BE(sequence); body.writeBigInt64BE(BigInt(sequence * 1000000), 4);
  body.writeBigInt64BE(1000000n, 12); body.writeUInt32BE(1, 20); return body;
}
const recordingConfig = { width: 16, height: 16, fps: 15, bitrate: 100000, maxFrames: 9000, preset: 0 as const,
  profile: 0 as const, level: 0 as const, audioCodec: 0 as const, audioRate: 0 as const, audioBitrate: 0, fragmentMs: 4000, iFrameIntervalMs: 4000 };
test('finite recording explicitly selects MP4 and strict audio coverage on the private wire', async () => {
  const f=fixture(); const worker=new PrivateMediaWorker('/verified/worker',{},f.launch);
  try {
    const configuration={...recordingConfig,inputFormat:'mp4',audioTailPolicy:'strict'};
    await worker.configureRecording(configuration as typeof recordingConfig);
    expect(f.writes[0].readUInt32BE(8)).toBe(72);
    expect(f.writes[0].readUInt32BE(12+16*4)).toBe(1);
    expect(f.writes[0].readUInt32BE(12+17*4)).toBe(0);
  } finally { await worker.stop(); }
});
function recordingSummaryBody(changes: { decoded?: number; selected?: number; encoded?: number; generated?: number; rate?: number; format?: number; span?: bigint } = {}): Buffer {
  const body = Buffer.alloc(32);
  [changes.decoded ?? 90, changes.selected ?? 90, changes.encoded ?? 90, changes.generated ?? 0, changes.rate ?? 0, changes.format ?? 1]
    .forEach((n, i) => body.writeUInt32BE(n, i * 4));
  body.writeBigUInt64BE(changes.span ?? 6000000n, 24); return body;
}
test('finite processing starts after END with its fixed budget while live drain keeps its shorter deadline', async () => {
  jest.useFakeTimers(); try {
    const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch);
    await worker.configureRecording({ ...recordingConfig, inputFormat: 'mp4' }); f.child.stdout.write(status(15)); await worker.whenReady;
    const drained = expect(worker.whenMediaDrained).rejects.toThrow(); await worker.endMedia();
    await jest.advanceTimersByTimeAsync(MEDIA_WORKER_LIMITS.requestMs); expect(worker.failed).toBe(false);
    await jest.advanceTimersByTimeAsync(MEDIA_WORKER_LIMITS.finiteProcessingMs - MEDIA_WORKER_LIMITS.requestMs);
    await drained; await worker.whenClosed; expect(worker.failed).toBe(true);
  } finally { jest.useRealTimers(); }
});
test('finite summary reports validated counts, generated samples and conservative span before successful drain', async () => {
  const f = fixture(); const summary = jest.fn();
  const worker = new PrivateMediaWorker('/verified/worker', { recordingInit: async () => {}, recordingFragment: async () => {}, recordingSummary: summary }, f.launch);
  await worker.configureRecording({ ...recordingConfig, inputFormat: 'mp4', audioCodec: 4, audioRate: 16000, audioBitrate: 32000, audioTailPolicy: 'pad-bounded' });
  f.child.stdout.write(status(15)); await worker.endMedia();
  f.child.stdout.write(output(8, Buffer.alloc(16))); f.child.stdout.write(output(9, recordingBody()));
  f.child.stdout.write(output(14, recordingSummaryBody({ generated: 1600, rate: 16000, span: 6128000n })));
  f.child.stdout.write(output(3, Buffer.alloc(0))); await worker.whenMediaDrained;
  expect(summary).toHaveBeenCalledWith({ decodedVideoFrames: 90, selectedVideoFrames: 90, encodedVideoFrames: 90,
    generatedAudioSamples: 1600, audioRate: 16000, inputFormat: 'mp4', preparedSpanUpperBoundUs: 6128000 });
  const closed = worker.finishInput(); f.child.emit('close', 0); await closed; expect(worker.failed).toBe(false);
});
test.each(['missing', 'duplicate', 'decoded bound', 'selection', 'encoded mismatch', 'unexpected silence', 'wrong rate', 'wrong format', 'zero span', 'oversize span'])('finite summary rejects %s before successful media completion', async kind => {
  const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', { recordingInit: async () => {}, recordingFragment: async () => {} }, f.launch);
  await worker.configureRecording({ ...recordingConfig, inputFormat: 'mp4' }); f.child.stdout.write(status(15)); await worker.endMedia();
  f.child.stdout.write(output(8, Buffer.alloc(16))); f.child.stdout.write(output(9, recordingBody()));
  const changes = kind === 'decoded bound' ? { decoded: 9001 } : kind === 'selection' ? { selected: 91 } :
    kind === 'encoded mismatch' ? { encoded: 89 } : kind === 'unexpected silence' ? { generated: 1 } :
      kind === 'wrong rate' ? { rate: 16000 } : kind === 'wrong format' ? { format: 0 } :
        kind === 'zero span' ? { span: 0n } : kind === 'oversize span' ? { span: 92000001n } : {};
  if (kind !== 'missing') f.child.stdout.write(output(14, recordingSummaryBody(changes)));
  if (kind === 'duplicate') f.child.stdout.write(output(14, recordingSummaryBody()));
  f.child.stdout.write(output(3, Buffer.alloc(0))); await worker.whenClosed; expect(worker.failed).toBe(true);
});
test('old protocol STATUS cannot enable the current media worker contract', async () => {
  const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch);
  await worker.configureRecording(recordingConfig);
  const ready = expect(worker.whenReady).rejects.toThrow(); const old = status(15); old.writeUInt32BE(3, 12); f.child.stdout.write(old);
  await ready; await worker.whenClosed; expect(worker.failed).toBe(true);
});
(realWorker ? test : test.skip).each([false, true])('native recording IPC drains genuine independently decodable fMP4, audio=%p', async audio => {
  const media = execFileSync(resolve('native/build/fixture'), [audio ? 'audio-latm-bundled' : 'video', '16', '16', '15', '90']);
  let init: Buffer | undefined; const fragments: Buffer[] = [];
  const worker = new PrivateMediaWorker(realWorker!, { recordingInit: async data => { init = Buffer.from(data); },
    recordingFragment: async fragment => { fragments.push(Buffer.from(fragment.data)); } });
  try {
    await worker.configureRecording({ ...recordingConfig, audioCodec: audio ? 4 : 0, audioRate: audio ? 24000 : 0, audioBitrate: audio ? 32000 : 0 });
    await worker.whenReady;
    for (let offset = 0; offset < media.length; offset += 65536) { await worker.media(media.subarray(offset, offset + 65536)); }
    await worker.endMedia(); await worker.whenMediaDrained; await worker.finishInput();
    expect(worker.failed).toBe(false); expect(init).toBeDefined(); expect(fragments).toHaveLength(6);
    const decoded = JSON.parse(execFileSync(resolve('native/build/check-recording'), [], { input: Buffer.concat([init!, ...fragments]) }).toString());
    expect(decoded).toMatchObject({ videoFrames: 90, audioTracks: audio ? 1 : 0 });
  } finally { await worker.stop(); }
});
test('recording accepts complete fragments above raw frame cap and preserves ordered callbacks through drain', async () => {
  const f = fixture(); const order: string[] = []; let release!: () => void;
  const init = jest.fn(async () => { order.push('init'); await new Promise<void>(resolve => { release = resolve; }); });
  const fragment = jest.fn(async (_fragment: RecordingFragment) => { order.push('fragment'); });
  const worker = new PrivateMediaWorker('/verified/worker', { recordingInit: init, recordingFragment: fragment }, f.launch);
  await worker.configureRecording(recordingConfig); expect(f.writes[0].readUInt32BE(8)).toBe(72); expect(f.writes[0].readUInt32BE(64)).toBe(1);
  f.child.stdout.write(status(15)); f.child.stdout.write(output(8, Buffer.alloc(16)));
  const body = recordingBody(0, 2 * 1024 * 1024); const framed = output(9, body);
  for (let i = 0; i < framed.length; i += 65536) { f.child.stdout.write(framed.subarray(i, i + 65536)); }
  await worker.endMedia(); f.child.stdout.write(output(3, Buffer.alloc(0)));
  let drained = false; void worker.whenMediaDrained.then(() => { drained = true; }); await flush();
  expect(order).toEqual(['init']); expect(drained).toBe(false); release(); await worker.whenMediaDrained;
  expect(order).toEqual(['init', 'fragment']); expect(fragment.mock.calls[0][0]).toMatchObject({ sequence: 0, startUs: 0, durationUs: 1000000, keyframeStart: true });
  const closed = worker.finishInput(); f.child.emit('close', 0); await closed; expect(worker.failed).toBe(false);
});
test.each(['missing init', 'duplicate init', 'sequence gap', 'not keyframe', 'too long', 'raw packet'])('invalid recording %s fails explicitly', async kind => {
  const f = fixture(); const init = jest.fn(async () => {}); const fragment = jest.fn(async () => {});
  const worker = new PrivateMediaWorker('/verified/worker', { recordingInit: init, recordingFragment: fragment }, f.launch);
  await worker.configureRecording(recordingConfig); f.child.stdout.write(status(15));
  if (kind !== 'missing init') { f.child.stdout.write(output(8, Buffer.alloc(16))); }
  const body = recordingBody(kind === 'sequence gap' ? 1 : 0);
  if (kind === 'not keyframe') { body.writeUInt32BE(0, 20); }
  if (kind === 'too long') { body.writeBigInt64BE(4000001n, 12); }
  f.child.stdout.write(kind === 'duplicate init' ? output(8, Buffer.alloc(16)) : kind === 'raw packet' ? output(2, codecBody()) : output(9, body));
  await worker.whenClosed; expect(worker.failed).toBe(true); expect(fragment).not.toHaveBeenCalled();
});
test('recording backlog remains bounded while callback is stalled; STOP aborts consumer', async () => {
  const f = fixture(); let signal: globalThis.AbortSignal | undefined;
  const worker = new PrivateMediaWorker('/verified/worker', { recordingInit: async (_data, current) => { signal = current; await new Promise<void>(() => {}); }, recordingFragment: async () => {} }, f.launch);
  await worker.configureRecording(recordingConfig); f.child.stdout.write(status(15)); f.child.stdout.write(output(8, Buffer.alloc(16)));
  for (let sequence = 0; sequence < 2; sequence++) {
    const framed = output(9, recordingBody(sequence, MEDIA_WORKER_LIMITS.recordingFragmentBytes));
    for (let i = 0; i < framed.length; i += 65536) { f.child.stdout.write(framed.subarray(i, i + 65536)); }
  }
  await worker.whenClosed; expect(worker.failed).toBe(true); expect(signal?.aborted).toBe(true);
});
test('recording callback buffers are erased after consumption and immediately on STOP', async () => {
  const f = fixture(); let initialization: Buffer | undefined, active: Buffer | undefined;
  const worker = new PrivateMediaWorker('/verified/worker', { recordingInit: async data => { initialization = data; },
    recordingFragment: async fragment => { active = fragment.data; await new Promise<void>(() => {}); } }, f.launch);
  await worker.configureRecording(recordingConfig); f.child.stdout.write(status(15)); f.child.stdout.write(output(8, Buffer.alloc(16, 0x41)));
  await flush(); expect(initialization).toEqual(Buffer.alloc(16));
  const body = recordingBody(); body.fill(0x42, 24); f.child.stdout.write(output(9, body));
  expect(active).toEqual(Buffer.alloc(16, 0x42)); const stopped = worker.stop();
  expect(active).toEqual(Buffer.alloc(16)); await stopped;
});

function motionBody(atUs = 2000000n, score = 120, event = 1): Buffer {
  const body = Buffer.alloc(16); body.writeBigUInt64BE(atUs); body.writeUInt32BE(score, 8); body.writeUInt32BE(event, 12); return body;
}
test('confirmed recording motion exposes bounded metadata with cancellation, never frame bytes', async () => {
  const f = fixture(), motion = jest.fn();
  const worker = new PrivateMediaWorker('/verified/worker', { motion }, f.launch);
  await worker.configureRecording(recordingConfig); f.child.stdout.write(status(15));
  f.child.stdout.write(output(13, motionBody())); f.child.stdout.write(output(13, motionBody(3000000n, 40)));
  expect(motion).toHaveBeenCalledTimes(2);
  expect(motion.mock.calls[0][0]).toEqual({ atUs: 2000000, score: 120 });
  const signal = motion.mock.calls[0][1] as globalThis.AbortSignal;
  await worker.stop(); expect(signal.aborted).toBe(true);
  f.child.stdout.write(output(13, motionBody(4000000n))); expect(motion).toHaveBeenCalledTimes(2);
});
test.each(['stdin', 'stdout', 'stderr'] as const)('a broken %s pipe cancels recording callbacks and erases borrowed media', async pipe => {
  const f = fixture(); let borrowed: Buffer | undefined, signal: globalThis.AbortSignal | undefined;
  const worker = new PrivateMediaWorker('/verified/worker', {
    recordingInit: async () => {}, recordingFragment: async (fragment, owner) => {
      borrowed = fragment.data; signal = owner; await new Promise<void>(() => {});
    },
  }, f.launch);
  await worker.configureRecording(recordingConfig); f.child.stdout.write(status(15));
  f.child.stdout.write(output(8, Buffer.alloc(16))); await flush();
  const data = recordingBody(); data.fill(0x41, 24); f.child.stdout.write(output(9, data));
  expect(borrowed?.some(byte => byte !== 0)).toBe(true);
  f.child[pipe].emit('error', new Error('untrusted private diagnostics'));
  await worker.whenClosed; expect(worker.failed).toBe(true); expect(signal?.aborted).toBe(true);
  expect(borrowed?.every(byte => byte === 0)).toBe(true);
});
test.each(['unready', 'live mode', 'short', 'invalid event', 'invalid score', 'unsafe timestamp', 'too frequent', 'regression'])(
  'recording motion rejects %s instead of dispatching an invalid trigger', async kind => {
    const f = fixture(), motion = jest.fn();
    const worker = new PrivateMediaWorker('/verified/worker', { motion }, f.launch);
    if (kind === 'live mode') await worker.configure([2, 2, 15, 20000, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    else await worker.configureRecording(recordingConfig);
    if (kind !== 'unready') f.child.stdout.write(status(15));
    if (kind === 'too frequent' || kind === 'regression') f.child.stdout.write(output(13, motionBody()));
    const body = kind === 'short' ? Buffer.alloc(15) : kind === 'invalid event' ? motionBody(2000000n, 120, 0) :
      kind === 'invalid score' ? motionBody(2000000n, 1001) : kind === 'unsafe timestamp' ? motionBody(9007199254740992n) :
      kind === 'too frequent' ? motionBody(2999999n) : kind === 'regression' ? motionBody(1000000n) : motionBody();
    f.child.stdout.write(output(13, body)); await worker.whenClosed; expect(worker.failed).toBe(true);
    expect(motion).toHaveBeenCalledTimes(kind === 'too frequent' || kind === 'regression' ? 1 : 0);
  },
);
test('maximum codec frame tail coalesced with next frame remains valid across arbitrary fragments', async () => {
  const f = fixture(); const seen: Buffer[] = []; const worker = new PrivateMediaWorker('/verified/worker', { packet: async packet => { seen.push(Buffer.from(packet.data)); } }, f.launch);
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const large = output(2, codecBody(MEDIA_WORKER_LIMITS.frameBytes - 60)); const status = Buffer.alloc(8); status.writeUInt32BE(4); status.writeUInt32BE(1, 4);
  const next = output(1, status);
  f.child.stdout.write(large.subarray(0, large.length - 20));
  f.child.stdout.write(Buffer.concat([large.subarray(large.length - 20), next.subarray(0, 5)]));
  for (const byte of next.subarray(5)) { f.child.stdout.write(Buffer.from([byte])); }
  await flush(); expect(seen).toHaveLength(1); expect(seen[0].length).toBe(MEDIA_WORKER_LIMITS.frameBytes - 60);
  expect(worker.failed).toBe(false); expect(f.child.kill).not.toHaveBeenCalled(); await worker.stop();
});
test('natural zero exit after END with accepted active and queued codec packets records failure', async () => {
  const f = fixture(); let signal: globalThis.AbortSignal | undefined;
  const packet = jest.fn((_packet: unknown, s: globalThis.AbortSignal) => { signal = s; return new Promise<void>(() => {}); });
  const worker = new PrivateMediaWorker('/verified/worker', { packet }, f.launch); await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  f.child.stdout.write(output(2, codecBody())); f.child.stdout.write(output(2, codecBody()));
  await worker.endMedia(); f.child.stdout.write(output(3, Buffer.alloc(0))); f.child.emit('close', 0);
  await worker.whenClosed; expect(worker.failed).toBe(true); expect(signal?.aborted).toBe(true); expect(packet).toHaveBeenCalledTimes(1);
});
test('fully consumed codec output and END permits successful natural closure', async () => {
  const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', { packet: async () => {} }, f.launch);
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); f.child.stdout.write(output(2, codecBody())); await flush();
  await worker.endMedia(); f.child.stdout.write(output(3, Buffer.alloc(0))); f.child.emit('close', 0); await worker.whenClosed;
  expect(worker.failed).toBe(false);
});
test('protection control reserves one bounded write behind active MEDIA', async () => {
  const f = fixture(); let releaseMedia!: () => void;
  f.child.stdin = new Writable({ write(bytes, _encoding, callback) {
    f.writes.push(Buffer.from(bytes)); if (bytes.readUInt32BE(4) === 2) { releaseMedia = () => callback(); } else { callback(); }
  } });
  let p: Awaited<ReturnType<PrivateMediaWorker['initialize']>>; let done!: () => void;
  const consumed = new Promise<void>(resolve => { done = resolve; });
  const worker = new PrivateMediaWorker('/verified/worker', { packet: async () => { await p.protectRtp(Buffer.alloc(12)); done(); } }, f.launch);
  p = await protector(f, worker); await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const media = worker.media(Buffer.alloc(16)); f.child.stdout.write(output(2, codecBody())); await flush();
  expect(worker.failed).toBe(false); expect(f.writes.map(b => b.readUInt32BE(4))).toEqual([10, 1, 2]);
  await expect(worker.media(Buffer.alloc(16))).rejects.toThrow();
  releaseMedia(); f.child.stdout.write(consumptionAck(16)); await media; await flush(); expect(f.writes.map(b => b.readUInt32BE(4))).toEqual([10, 1, 2, 11]);
  const reply = Buffer.alloc(30); reply.writeUInt32BE(1); reply.writeUInt32BE(1, 4); f.child.stdout.write(output(11, reply)); await consumed;
  expect(worker.failed).toBe(false); await worker.stop();
});
test('STOP rejects reserved protection write and fences delayed MEDIA write completion', async () => {
  const f = fixture(); let releaseMedia!: () => void;
  f.child.stdin = new Writable({ write(bytes, _encoding, callback) {
    f.writes.push(Buffer.from(bytes)); if (bytes.readUInt32BE(4) === 2) { releaseMedia = () => callback(); } else { callback(); }
  } });
  const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch); const p = await protector(f, worker);
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); const media = worker.media(Buffer.alloc(16)); const mediaCheck = expect(media).rejects.toThrow();
  const protection = p.protectRtp(Buffer.alloc(12)); const protectionCheck = expect(protection).rejects.toThrow(); await flush();
  await worker.stop(); await mediaCheck; await protectionCheck; releaseMedia(); await flush();
  expect(f.writes.map(b => b.readUInt32BE(4))).toEqual([10, 1, 2]);
});
test.each(['MEDIA', 'END'])('sequential %s producer waits bounded behind reserved active protection', async kind => {
  const f = fixture(); let releaseFirst!: () => void; let releaseControl!: () => void; let first = true;
  f.child.stdin = new Writable({ write(bytes, _encoding, callback) {
    f.writes.push(Buffer.from(bytes)); const type = bytes.readUInt32BE(4);
    if (type === 2 && first) { first = false; releaseFirst = () => callback(); }
    else if (type === 11) { releaseControl = () => callback(); } else { callback(); }
  } });
  let p: Awaited<ReturnType<PrivateMediaWorker['initialize']>>; let done!: () => void;
  const consumed = new Promise<void>(resolve => { done = resolve; });
  const worker = new PrivateMediaWorker('/verified/worker', { packet: async () => { await p.protectRtp(Buffer.alloc(12)); done(); } }, f.launch);
  p = await protector(f, worker); await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const firstMedia = worker.media(Buffer.alloc(16));
  // Rejected END must not commit EOF state; caller can retry after sequential admission.
  await expect(worker.endMedia()).rejects.toThrow();
  f.child.stdout.write(output(2, codecBody())); await flush(); releaseFirst(); f.child.stdout.write(consumptionAck(16)); await firstMedia;
  const next = kind === 'MEDIA' ? worker.media(Buffer.alloc(16)) : worker.endMedia();
  await expect(worker.media(Buffer.alloc(16))).rejects.toThrow(); await flush();
  expect(worker.failed).toBe(false); expect(f.writes.map(b => b.readUInt32BE(4))).toEqual([10, 1, 2, 11]);
  releaseControl(); await flush(); if (kind === 'MEDIA') { f.child.stdout.write(consumptionAck(32)); } await next; await flush();
  expect(f.writes.map(b => b.readUInt32BE(4))).toEqual([10, 1, 2, 11, kind === 'MEDIA' ? 2 : 3]);
  const reply = Buffer.alloc(30); reply.writeUInt32BE(1); reply.writeUInt32BE(1, 4); f.child.stdout.write(output(11, reply)); await consumed;
  expect(worker.failed).toBe(false); await worker.stop();
});
test('STOP cancels bounded producer queued behind active protection', async () => {
  const f = fixture(); let releaseControl!: () => void;
  f.child.stdin = new Writable({ write(bytes, _encoding, callback) {
    f.writes.push(Buffer.from(bytes)); if (bytes.readUInt32BE(4) === 11) { releaseControl = () => callback(); } else { callback(); }
  } });
  const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch); const p = await protector(f, worker);
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const protection = p.protectRtp(Buffer.alloc(12)); const protectionCheck = expect(protection).rejects.toThrow(); await flush();
  const producer = worker.media(Buffer.alloc(16)); const producerCheck = expect(producer).rejects.toThrow();
  await worker.stop(); await protectionCheck; await producerCheck; releaseControl(); await flush();
  expect(f.writes.map(b => b.readUInt32BE(4))).toEqual([10, 1, 11]);
});
