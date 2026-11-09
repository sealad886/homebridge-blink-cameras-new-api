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
import { execFileSync, spawn } from 'node:child_process';
import * as tls from 'node:tls';
import { lookup } from 'node:dns/promises';
import { ImmisProxyServer } from '../src/blink-api/immis-proxy';
import { createOwnedMediaSession } from '../src/accessories/media-session';
import { PrivateMediaWorker, type WorkerSpawner } from '../src/accessories/media-worker';
import type { MediaOutputOptions } from '../src/accessories/media-output';

// Synthetic provider transport only. Recorder filesystem, owned session and
// optionally native codec/protection IPC execute their production implementations.
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
const sourceSha256 = Object.fromEntries(['src/blink-api/immis-proxy.ts', 'src/accessories/media-session.ts', 'src/accessories/media-worker.ts'].map(name => {
  // eslint-disable-next-line no-undef -- Static repository-relative source identities only.
  return [name, createHash('sha256').update(fs.readFileSync(resolve(__dirname, '..', name))).digest('hex')];
}));
const receipt: Record<string, unknown> = { schemaVersion: 1, synthetic: true,
  baseRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 5000 }).trim(),
  workingTree: Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8', timeout: 5000 }).trim()),
  testSha256, sourceSha256, platform: process.platform, arch: process.arch, recording: [],
  native: { status: 'not-run', reason: 'worker-not-configured' } };
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
  const proxy = new ImmisProxyServer({ immisUrl: 'immis://stream.immedia-semi.com/session?client_id=1', serial: 'SYNTHETIC', saveStreamPath: directory });
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
  receipt.status = recordings.length === 3 && (!configuredWorker || (receipt.native as { status: string }).status === 'passed') ? 'passed' : 'incomplete';
  receipt.nativeRequired = Boolean(configuredWorker);
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

function receiverFrame(type: number, body = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(12); header.write('BMR1'); header.writeUInt32BE(type, 4); header.writeUInt32BE(body.length, 8);
  return Buffer.concat([header, body]);
}
function output(ssrc: number): MediaOutputOptions {
  return { address: '192.168.1.5', addressVersion: 'ipv4', port: 5000 + ssrc, suite: 'AES_CM_128_HMAC_SHA1_80',
    key: Buffer.alloc(16, 1), salt: Buffer.alloc(14, 2), ssrc, payloadType: ssrc === 7 ? 99 : 110, mtu: 1200, fps: 15, rtcpInterval: 0.1 };
}
const configuredWorker = process.env.BLINK_MEDIA_TEST_WORKER_PATH;
(configuredWorker ? test : test.skip)('real native IPC admits at most one 64 KiB MEDIA frame until exact consumption credits and receiver decode', async () => {
  // eslint-disable-next-line no-undef -- Jest executes this test as CommonJS.
  const build = resolve(__dirname, '../native/build'), suffix = process.platform === 'win32' ? '.exe' : '';
  const workerSha256 = createHash('sha256').update(await files.readFile(configuredWorker!)).digest('hex');
  const media = execFileSync(join(build, `fixture${suffix}`), ['audio-latm-bundled'], { env: {}, timeout: 5000, maxBuffer: 1024 * 1024 });
  expect(media.length).toBeGreaterThan(65536); expect(media.length).toBeLessThanOrEqual(1024 * 1024);
  let admittedBytes = 0, consumedBytes = 0, outstanding = 0, outstandingHighWater = 0, queueHighWaterBytes = 0, frames = 0, creditMessages = 0;
  let metadataViolation = false;
  // Observe intentional IPC metadata only. Skip codec/protection payloads without
  // retaining them; the native stdout observer owns just a header and credit word.
  const header = Buffer.alloc(12), credit = Buffer.alloc(4);
  let headerBytes = 0, bodyLeft = 0, bodyBytes = 0, type = 0;
  const observeOutput = (bytes: Buffer): void => {
    let offset = 0;
    while (offset < bytes.length) {
      if (headerBytes < 12) {
        const length = Math.min(12 - headerBytes, bytes.length - offset);
        bytes.copy(header, headerBytes, offset, offset + length); headerBytes += length; offset += length;
        if (headerBytes < 12) continue;
        type = header.readUInt32BE(4); bodyLeft = header.readUInt32BE(8); bodyBytes = 0;
        if (header.toString('ascii', 0, 4) !== 'BMO1' || bodyLeft > 1024 * 1024 || (type === 6 && bodyLeft !== 4)) { metadataViolation = true; return; }
        if (!bodyLeft) { headerBytes = 0; continue; }
      }
      const length = Math.min(bodyLeft, bytes.length - offset);
      if (type === 6) bytes.copy(credit, bodyBytes, offset, offset + length);
      offset += length; bodyLeft -= length; bodyBytes += length;
      if (bodyLeft) continue;
      if (type === 6) {
        const total = credit.readUInt32BE(); creditMessages++;
        if (outstanding !== 1 || total <= consumedBytes || total > admittedBytes) metadataViolation = true;
        consumedBytes = total;
        if (consumedBytes === admittedBytes) outstanding--;
      }
      headerBytes = 0;
    }
  };
  const launch: WorkerSpawner = (path, args, options) => {
    expect(args).toEqual([]); expect(options.env).toEqual({}); expect(options.shell).toBe(false);
    const child = spawn(path, args, options), write = child.stdin.write.bind(child.stdin);
    child.stdin.write = ((...values: Parameters<typeof child.stdin.write>) => {
      const bytes = values[0];
      if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.toString('ascii', 0, 4) !== 'BMI1' || bytes.readUInt32BE(8) !== bytes.length - 12) {
        throw new Error('Unexpected private IPC frame');
      }
      if (bytes.readUInt32BE(4) === 2) {
        const length = bytes.readUInt32BE(8); admittedBytes += length; outstanding++; frames++;
        queueHighWaterBytes = Math.max(queueHighWaterBytes, admittedBytes - consumedBytes);
        outstandingHighWater = Math.max(outstandingHighWater, outstanding);
        if (!length || length > 65536 || outstanding > 1 || admittedBytes - consumedBytes > 65536) metadataViolation = true;
      }
      return write(...values);
    }) as typeof child.stdin.write;
    child.stdout.on('data', observeOutput); return child;
  };
  const datagrams: Array<{ stream: number; bytes: Buffer }> = [];
  let outputBytes = 0, native: PrivateMediaWorker | undefined;
  const source = jest.fn();
  const negotiation = { workerPath: resolve(configuredWorker!), onSourceInfo: source,
    video: { output: { ...output(7), mtu: 128 }, localPort: 6000, width: 16, height: 16, bitrate: 100000, maxFrames: 100,
      profile: 0 as const, level: 0 as const, softwarePreset: 'ultrafast' as const },
    audio: { output: output(8), localPort: 6001, codec: 'opus' as const, rate: 16000 as const, bitrate: 24000 } };
  receipt.native = { status: 'running' };
  const session = await createOwnedMediaSession(negotiation, new globalThis.AbortController().signal, {
    createWorker: (path, callbacks) => { native = new PrivateMediaWorker(path, callbacks, launch); return native; },
    openSocket: async admitted => {
      let close!: () => void; const whenClosed = new Promise<void>(done => { close = done; });
      return { whenClosed, close, send: async bytes => {
        outputBytes += bytes.length; if (outputBytes > 1024 * 1024) throw new Error('Synthetic receiver budget exceeded');
        datagrams.push({ stream: admitted.ssrc === 7 ? 1 : 2, bytes: Buffer.from(bytes) });
      } };
    },
  });
  try {
    await expect(native!.media(Buffer.alloc(65537))).rejects.toThrow('Invalid media input');
    expect(admittedBytes).toBe(0);
    const feeding = session.write(media);
    await expect(session.write(Buffer.from([0x47]))).rejects.toThrow('Media session unavailable');
    await expect(native!.media(Buffer.from([0x47]))).rejects.toThrow('Invalid media input');
    await feeding; expect(session.failed).toBe(false); expect(native!.failed).toBe(false);
    await session.end(); await session.whenClosed;
    expect(session.failed).toBe(false); expect(native!.failed).toBe(false);
    expect(metadataViolation).toBe(false); expect(headerBytes).toBe(0);
    expect(admittedBytes).toBe(media.length); expect(consumedBytes).toBe(media.length); expect(outstanding).toBe(0);
    expect(frames).toBeGreaterThan(1); expect(creditMessages).toBeGreaterThanOrEqual(frames);
    expect(queueHighWaterBytes).toBe(65536); expect(outstandingHighWater).toBe(1);
    expect(source).toHaveBeenCalledWith(expect.objectContaining({ width: 16, height: 16 }));
    const config = Buffer.alloc(40);
    [16, 16, 30, 15, 1, 16000, session.audioTiming.initialPaddingSamples, 20, 99, 110].forEach((n, i) => config.writeUInt32BE(n, i * 4));
    const input = [receiverFrame(1, config)];
    for (const [stream, capability] of [[1, negotiation.video.output], [2, negotiation.audio.output]] as const) {
      const init = Buffer.alloc(42); init.writeUInt32BE(stream); init.writeUInt32BE(capability.ssrc, 4); init.writeUInt32BE(1, 8);
      capability.key.copy(init, 12); capability.salt.copy(init, 28); input.push(receiverFrame(10, init));
    }
    for (const datagram of datagrams) {
      const body = Buffer.alloc(4 + datagram.bytes.length); body.writeUInt32BE(datagram.stream); datagram.bytes.copy(body, 4);
      input.push(receiverFrame(datagram.bytes[1] === 200 ? 12 : 11, body));
    }
    input.push(receiverFrame(3));
    expect(execFileSync(join(build, `check-rtp${suffix}`), [], { input: Buffer.concat(input), env: {}, timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).toString()).toBe('receiver verified\n');
    expect(createHash('sha256').update(await files.readFile(configuredWorker!)).digest('hex')).toBe(workerSha256);
    receipt.native = { status: 'passed', workerSha256,
      admittedBytes, consumedBytes, frames, creditMessages, queueHighWaterBytes, outstandingHighWater, outstandingAtClose: outstanding,
      receiverVerified: true, outputDatagrams: datagrams.length, outputBytes };
  } finally { await session.stop(); }
}, 10_000);
