import { test } from '@jest/globals';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { EventEmitter, once } from 'node:events';
import { Writable } from 'node:stream';
import * as fs from 'node:fs';
import { promises as files } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as tls from 'node:tls';
import { lookup } from 'node:dns/promises';
import { ImmisProxyServer } from '../src/blink-api/immis-proxy';

// Synthetic provider transport only. Recorder filesystem, owned session and
// dedicated external-codec tests cover the separate process/output bounds.
jest.mock('node:dns/promises', () => ({ lookup: jest.fn(async () => [{ address: '8.8.8.8', family: 4 }]) }));
jest.mock('node:tls', () => ({
  ...jest.requireActual('node:tls'),
  connect: jest.fn((_options: tls.ConnectionOptions, connected: () => void) => {
    const events = new EventEmitter();
    const socket = Object.assign(events, {
      authorized: true, destroyed: false, writableLength: 0, writableEnded: false,
      write: () => true, pause: () => {}, resume: () => {},
      destroy() { if (!this.destroyed) { this.destroyed = true; globalThis.queueMicrotask(() => events.emit('close')); } },
    });
    globalThis.queueMicrotask(connected); return socket;
  }),
}));

const CAPTURE_LIMIT = 64 * 1024 * 1024;
// Freeze executing test/source identities before running any fixture or await.
// eslint-disable-next-line no-undef -- Jest executes this test as CommonJS.
const testSha256 = createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
const sourceSha256 = Object.fromEntries(['src/blink-api/immis-proxy.ts', 'src/accessories/media-session.ts', 'src/accessories/external-live-codec.ts'].map(name => {
  // eslint-disable-next-line no-undef -- Static repository-relative source identities only.
  return [name, createHash('sha256').update(fs.readFileSync(resolve(__dirname, '..', name))).digest('hex')];
}));
const receipt: Record<string, unknown> = { schemaVersion: 1, synthetic: true,
  baseRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 5000 }).trim(),
  workingTree: Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8', timeout: 5000 }).trim()),
  testSha256, sourceSha256, platform: process.platform, arch: process.arch, recording: [],
  codecResourceEvidence: 'external live codec tests and installed runtime qualification' };
const recordings: Array<Record<string, number | string | boolean>> = [];
const turn = () => new Promise<void>(done => globalThis.setImmediate(done));
async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer!: ReturnType<typeof globalThis.setTimeout>;
  try { return await Promise.race([operation, new Promise<never>((_done, reject) => {
    timer = globalThis.setTimeout(() => reject(new Error('Resource fixture deadline exceeded')), 2000);
  })]); } finally { globalThis.clearTimeout(timer); }
}
function mediaFrame(payload: Buffer): Buffer {
  const header = Buffer.alloc(9); header.writeUInt32BE(payload.length, 5); return Buffer.concat([header, payload]);
}
async function recordingFixture() {
  const directory = await files.mkdtemp(join(tmpdir(), 'blink-resource-bound-'));
  await files.chmod(directory, 0o700);
  const actualFs = jest.requireActual<typeof import('node:fs')>('node:fs');
  const original = actualFs.createWriteStream;
  let writer: fs.WriteStream | undefined;
  const created = jest.spyOn(actualFs, 'createWriteStream').mockImplementation((...args: Parameters<typeof original>) => {
    writer = original(...args); return writer;
  });
  const proxy = new ImmisProxyServer({ immisUrl: 'immis://stream.immedia-semi.com/session?client_id=1', serial: 'SYNTHETIC', storagePath: directory, saveStreamPath: directory });
  let consumed = 0;
  const output = new Writable({ highWaterMark: 1024 * 1024, write(bytes, _encoding, done) { consumed += bytes.length; done(); } });
  proxy.on('error', () => {});
  try {
    await proxy.start();
    expect(writer).toBeDefined();
    proxy.attachConsumer(output); await turn();
    const socket = jest.mocked(tls.connect).mock.results.at(-1)!.value as tls.TLSSocket;
    const options = jest.mocked(tls.connect).mock.calls.at(-1)![0] as tls.ConnectionOptions;
    expect(options.host).toBe('8.8.8.8'); expect(options.port).toBe(443); expect(options.rejectUnauthorized).toBe(true);
    const entries = (await files.readdir(join(directory, 'blink-stream-recordings'))).filter(name => name.endsWith('.ts'));
    expect(entries).toHaveLength(1);
    const filename = join(directory, 'blink-stream-recordings', entries[0]);
    return { proxy, writer: writer!, filename, socket, consumed: () => consumed,
      close: async () => { proxy.stop(); output.destroy(); await proxy.whenClosed; created.mockRestore(); await files.rm(directory, { recursive: true, force: true }); } };
  } catch (error) {
    proxy.stop(); output.destroy(); await proxy.whenClosed; created.mockRestore(); await files.rm(directory, { recursive: true, force: true }); throw error;
  }
}

beforeEach(() => {
  jest.mocked(lookup).mockClear(); jest.mocked(tls.connect).mockClear();
});
afterAll(async () => {
  receipt.recording = recordings;
  receipt.status = recordings.length === 3 ? 'passed' : 'incomplete';
  // Numeric observations only; generated test evidence, never runtime diagnostics.
  // eslint-disable-next-line no-undef -- Jest executes this test as CommonJS.
  const build = resolve(__dirname, '../native/build'); await files.mkdir(build, { recursive: true });
  await files.writeFile(join(build, 'queue-recording-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
});

test('actual recorder stores exactly 64 MiB, refuses byte +1 and keeps the media consumer active', async () => {
  const f = await recordingFixture();
  try {
    const chunk = Buffer.alloc(16 * 1024, 0x47), frame = mediaFrame(chunk);
    const expected = createHash('sha256'); let queueHighWaterBytes = 0;
    for (let bytes = 0; bytes < CAPTURE_LIMIT; bytes += chunk.length) {
      // A zero-byte completion barrier waits for actual preceding file writes.
      // Unlike drain, completion also works below Node's platform high-water mark.
      f.socket.emit('data', frame);
      queueHighWaterBytes = Math.max(queueHighWaterBytes, f.writer.writableLength);
      await bounded(new Promise<void>((done, reject) => f.writer.write(Buffer.alloc(0), error => error ? reject(error) : done()))); expected.update(chunk);
    }
    expect(f.proxy.isServing).toBe(true); expect(f.writer.destroyed).toBe(false);
    expect((await files.stat(f.filename)).size).toBe(CAPTURE_LIMIT);
    expect(f.consumed()).toBe(CAPTURE_LIMIT);
    const closed = once(f.writer, 'close'); f.socket.emit('data', mediaFrame(Buffer.from([0x47]))); await bounded(closed);
    expect(f.proxy.isServing).toBe(true); expect(f.consumed()).toBe(CAPTURE_LIMIT + 1);
    expect((await files.stat(f.filename)).size).toBe(CAPTURE_LIMIT);
    const observed = createHash('sha256');
    for await (const bytes of fs.createReadStream(f.filename)) observed.update(bytes);
    expect(observed.digest('hex')).toBe(expected.digest('hex'));
    expect(queueHighWaterBytes).toBeLessThanOrEqual(256 * 1024);
    recordings.push({ scenario: 'file-cap', admittedBytes: CAPTURE_LIMIT, offeredBytes: CAPTURE_LIMIT + 1,
      actualFileBytes: (await files.stat(f.filename)).size, consumerBytes: f.consumed(), queueHighWaterBytes, contentsVerified: true, closureConfirmed: true });
  } finally { await f.close(); }
}, 30_000);

test.each(['deadline', 'queue-limit'] as const)('blocked real recording stream closes at %s while consumer keeps receiving', async scenario => {
  const f = await recordingFixture();
  try {
    // Deliberately withhold filesystem writes at the public Writable boundary.
    // This simulates disk backpressure; it does not claim an OS disk failure.
    f.writer.cork(); jest.useFakeTimers();
    const chunk = Buffer.alloc(64 * 1024, 0x47), frame = mediaFrame(chunk);
    const count = scenario === 'deadline' ? 1 : 4;
    let queueHighWaterBytes = 0;
    for (let i = 0; i < count; i++) {
      f.socket.emit('data', frame); queueHighWaterBytes = Math.max(queueHighWaterBytes, f.writer.writableLength);
    }
    expect(f.writer.writableLength).toBe(count * chunk.length);
    expect(f.writer.destroyed).toBe(false);
    const closed = once(f.writer, 'close');
    if (scenario === 'deadline') { jest.advanceTimersByTime(1999); expect(f.writer.destroyed).toBe(false); jest.advanceTimersByTime(1); }
    else f.socket.emit('data', frame);
    expect(f.writer.destroyed).toBe(true); jest.useRealTimers(); await bounded(closed);
    f.socket.emit('data', frame);
    expect(f.proxy.isServing).toBe(true);
    expect(f.consumed()).toBe((count + (scenario === 'queue-limit' ? 2 : 1)) * chunk.length);
    expect((await files.stat(f.filename)).size).toBe(0);
    expect(queueHighWaterBytes).toBeLessThanOrEqual(256 * 1024);
    recordings.push({ scenario, queueHighWaterBytes, actualFileBytes: 0, consumerBytes: f.consumed() });
  } finally { jest.useRealTimers(); await f.close(); }
});
