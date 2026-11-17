import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { PrivateProtectionWorker, PROTECTION_WORKER_LIMITS, type ProtectionSpawner } from '../src/accessories/srtp-worker';
function fixture() {
  const child = new EventEmitter() as ChildProcessWithoutNullStreams & { stdout: PassThrough; stderr: PassThrough }, writes: Buffer[] = [];
  Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new Writable({ write(bytes, _encoding, done) { writes.push(Buffer.from(bytes)); done(); } }),
    kill: jest.fn(() => { queueMicrotask(() => child.emit('close', 0)); return true; }) });
  const launch = jest.fn<ReturnType<ProtectionSpawner>, Parameters<ProtectionSpawner>>(() => child);
  return { child, writes, launch };
}
function output(type: number, body: Buffer): Buffer {
  const frame = Buffer.alloc(12 + body.length); frame.write('BMO1'); frame.writeUInt32BE(type, 4); frame.writeUInt32BE(body.length, 8); body.copy(frame, 12); return frame;
}
const ack = () => { const body = Buffer.alloc(4); body.writeUInt32BE(1); return output(10, body); };
const flush = () => new Promise<void>(done => setImmediate(done));
it('keeps key material off argv/environment and accepts split bounded initialization replies', async () => {
  const f = fixture(), worker = new PrivateProtectionWorker('/verified/protection', f.launch);
  const initialized = worker.initialize(1, 7, Buffer.alloc(16, 9), Buffer.alloc(14, 8));
  await flush(); expect(f.launch).toHaveBeenCalledWith('/verified/protection', [], { env: {}, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
  expect(f.writes[0].subarray(24, 40)).toEqual(Buffer.alloc(16, 9));
  const bytes = ack(); f.child.stdout.write(bytes.subarray(0, 5)); f.child.stdout.write(bytes.subarray(5));
  const protector = await initialized;
  const packet = Buffer.from('806000010000000000000007', 'hex'); const protectedPacket = protector.protectRtp(packet);
  await flush(); const body = Buffer.alloc(30); body.writeUInt32BE(1); body.writeUInt32BE(1, 4); packet.copy(body, 8);
  f.child.stdout.write(output(11, body)); expect((await protectedPacket).length).toBe(22);
  await worker.stop(); expect(worker.failed).toBe(false);
});
it('rejects unsolicited or oversized protocol output and never exposes arbitrary diagnostics', async () => {
  for (const bytes of [Buffer.from('not-a-private-header'), output(1, Buffer.alloc(0)), output(11, Buffer.alloc(2071))]) {
    const f = fixture(), worker = new PrivateProtectionWorker('/verified/protection', f.launch);
    f.child.stderr.write('private credentials'); const pending = worker.initialize(1, 7, Buffer.alloc(16), Buffer.alloc(14));
    const result = expect(pending).rejects.toThrow(/^Media protection failed$/); f.child.stdout.write(bytes);
    await result; await worker.whenClosed; expect(worker.failed).toBe(true);
  }
});
it('expires a silent worker and closes outstanding promises', async () => {
  jest.useFakeTimers();
  try {
    const f = fixture(), worker = new PrivateProtectionWorker('/verified/protection', f.launch);
    const pending = worker.initialize(1, 7, Buffer.alloc(16), Buffer.alloc(14)); const rejected = expect(pending).rejects.toThrow();
    await jest.advanceTimersByTimeAsync(PROTECTION_WORKER_LIMITS.requestMs); await rejected; await worker.whenClosed;
    expect(worker.failed).toBe(true);
  } finally { jest.useRealTimers(); }
});
it('refuses invalid paths and protection parameters before dispatch', async () => {
  expect(() => new PrivateProtectionWorker('relative')).toThrow();
  const f = fixture(), worker = new PrivateProtectionWorker('/verified/protection', f.launch);
  await expect(worker.initialize(1, 0, Buffer.alloc(16), Buffer.alloc(14))).rejects.toThrow();
  await expect(worker.initialize(1, 7, Buffer.alloc(17), Buffer.alloc(14))).rejects.toThrow();
  expect(f.writes).toHaveLength(0); await worker.stop();
});
const binary = process.env.BLINK_PROTECTION_TEST_WORKER_PATH ?? resolve('native/build/blink-protection-worker' + (process.platform === 'win32' ? '.exe' : ''));
const checker = resolve('native/build/check-protection' + (process.platform === 'win32' ? '.exe' : ''));
(existsSync(binary) && existsSync(checker) ? it : it.skip)('protects actual RTP accepted by independent libSRTP receiver and rejects forged authentication', async () => {
  const worker = new PrivateProtectionWorker(binary);
  try {
    const protector = await worker.initialize(1, 7, Buffer.alloc(16, 9), Buffer.alloc(14, 8));
    const encrypted = await protector.protectRtp(Buffer.from('806000010000000000000007', 'hex'));
    expect(execFileSync(checker, [], { input: encrypted, env: {}, timeout: 5000 }).toString()).toContain('forged packet refused');
  } finally { await worker.stop(); }
});
