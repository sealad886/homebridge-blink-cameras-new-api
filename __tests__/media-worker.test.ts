import { test } from '@jest/globals';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { PrivateMediaWorker, MEDIA_WORKER_LIMITS, type WorkerSpawner } from '../src/accessories/media-worker';
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
    const config = worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0]); const check = expect(config).rejects.toThrow();
    await expect(worker.media(Buffer.alloc(1))).rejects.toThrow(); expect(f.writes.length).toBe(1);
    await jest.advanceTimersByTimeAsync(MEDIA_WORKER_LIMITS.requestMs); await check; await worker.whenClosed;
  } finally { jest.useRealTimers(); }
});
test('codec metadata preserved; STOP aborts held consumer and fences late packet', async () => {
  const f = fixture(); let signal: globalThis.AbortSignal | undefined; let release!: () => void;
  const packet = jest.fn((_packet: unknown, s: globalThis.AbortSignal) => { signal = s; return new Promise<void>(resolve => { release = resolve; }); });
  const worker = new PrivateMediaWorker('/verified/worker', { packet }, f.launch); await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0]);
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
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0]); await worker.endMedia();
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
    const worker = new PrivateMediaWorker('/verified/worker', { packet }, f.launch); await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0]);
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
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0]); await worker.endMedia(); f.child.stdout.write(output(3, Buffer.alloc(0)));
  const request = p.protectRtp(Buffer.alloc(12)); await flush(); const reply = Buffer.alloc(30); reply.writeUInt32BE(1); reply.writeUInt32BE(1, 4);
  f.child.stdout.write(output(11, reply)); await request;
  const closed = worker.finishInput(); f.child.stdout.end(); f.child.emit('close', 0); await closed;
  expect(f.child.kill).not.toHaveBeenCalled(); await expect(worker.media(Buffer.alloc(1))).rejects.toThrow();
});
test('codec callback can await protection on same pipe without parser deadlock', async () => {
  const f = fixture(); let p: Awaited<ReturnType<PrivateMediaWorker['initialize']>>;
  let done!: () => void; const completed = new Promise<void>(resolve => { done = resolve; });
  const consumed: Buffer[] = []; const worker = new PrivateMediaWorker('/verified/worker', { packet: async packet => { consumed.push(await p.protectRtp(Buffer.alloc(12, packet.data[0]))); done(); } }, f.launch);
  p = await protector(f, worker); await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0]);
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
function codecBody(dataBytes = 1): Buffer {
  const body = Buffer.alloc(48 + dataBytes, 0x65); body.fill(0, 0, 48);
  body.writeUInt32BE(1, 28); body.writeUInt32BE(1, 32); body.writeUInt32BE(1000000, 36); return body;
}
test('maximum codec frame tail coalesced with next frame remains valid across arbitrary fragments', async () => {
  const f = fixture(); const seen: Buffer[] = []; const worker = new PrivateMediaWorker('/verified/worker', { packet: async packet => { seen.push(Buffer.from(packet.data)); } }, f.launch);
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0]);
  const large = output(2, codecBody(MEDIA_WORKER_LIMITS.frameBytes - 60)); const status = Buffer.alloc(8); status.writeUInt32BE(1); status.writeUInt32BE(1, 4);
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
  const worker = new PrivateMediaWorker('/verified/worker', { packet }, f.launch); await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0]);
  f.child.stdout.write(output(2, codecBody())); f.child.stdout.write(output(2, codecBody()));
  await worker.endMedia(); f.child.stdout.write(output(3, Buffer.alloc(0))); f.child.emit('close', 0);
  await worker.whenClosed; expect(worker.failed).toBe(true); expect(signal?.aborted).toBe(true); expect(packet).toHaveBeenCalledTimes(1);
});
test('fully consumed codec output and END permits successful natural closure', async () => {
  const f = fixture(); const worker = new PrivateMediaWorker('/verified/worker', { packet: async () => {} }, f.launch);
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0]); f.child.stdout.write(output(2, codecBody())); await flush();
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
  p = await protector(f, worker); await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0]);
  const media = worker.media(Buffer.alloc(16)); f.child.stdout.write(output(2, codecBody())); await flush();
  expect(worker.failed).toBe(false); expect(f.writes.map(b => b.readUInt32BE(4))).toEqual([10, 1, 2]);
  await expect(worker.media(Buffer.alloc(16))).rejects.toThrow();
  releaseMedia(); await media; await flush(); expect(f.writes.map(b => b.readUInt32BE(4))).toEqual([10, 1, 2, 11]);
  const reply = Buffer.alloc(30); reply.writeUInt32BE(1); reply.writeUInt32BE(1, 4); f.child.stdout.write(output(11, reply)); await consumed;
  expect(worker.failed).toBe(false); await worker.stop();
});
test('STOP rejects reserved protection write and fences delayed MEDIA write completion', async () => {
  const f = fixture(); let releaseMedia!: () => void;
  f.child.stdin = new Writable({ write(bytes, _encoding, callback) {
    f.writes.push(Buffer.from(bytes)); if (bytes.readUInt32BE(4) === 2) { releaseMedia = () => callback(); } else { callback(); }
  } });
  const worker = new PrivateMediaWorker('/verified/worker', {}, f.launch); const p = await protector(f, worker);
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0]); const media = worker.media(Buffer.alloc(16)); const mediaCheck = expect(media).rejects.toThrow();
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
  p = await protector(f, worker); await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0]);
  const firstMedia = worker.media(Buffer.alloc(16));
  // Rejected END must not commit EOF state; caller can retry after sequential admission.
  await expect(worker.endMedia()).rejects.toThrow();
  f.child.stdout.write(output(2, codecBody())); await flush(); releaseFirst(); await firstMedia;
  const next = kind === 'MEDIA' ? worker.media(Buffer.alloc(16)) : worker.endMedia();
  await expect(worker.media(Buffer.alloc(16))).rejects.toThrow(); await flush();
  expect(worker.failed).toBe(false); expect(f.writes.map(b => b.readUInt32BE(4))).toEqual([10, 1, 2, 11]);
  releaseControl(); await next; await flush();
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
  await worker.configure([2, 2, 1, 20000, 1, 0, 0, 0, 0, 0]);
  const protection = p.protectRtp(Buffer.alloc(12)); const protectionCheck = expect(protection).rejects.toThrow(); await flush();
  const producer = worker.media(Buffer.alloc(16)); const producerCheck = expect(producer).rejects.toThrow();
  await worker.stop(); await protectionCheck; await producerCheck; releaseControl(); await flush();
  expect(f.writes.map(b => b.readUInt32BE(4))).toEqual([10, 1, 11]);
});
