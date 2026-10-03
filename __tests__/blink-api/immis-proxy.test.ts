import { getSecurityBoundaryCounters } from '../../src/blink-api/network-diagnostics';
import { parseLatmFrames, ImmisProxyServer } from '../../src/blink-api/immis-proxy';
import { Writable } from 'node:stream';
import { promises as fs } from 'node:fs';
import type { WriteStream } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as tls from 'node:tls';
import { lookup } from 'node:dns/promises';
jest.mock('node:dns/promises', () => ({ lookup: jest.fn(async () => [{ address: '8.8.8.8', family: 4 }]) }));
const flushResolution = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
import { spawn, ChildProcess } from 'node:child_process';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';

jest.mock('node:tls', () => {
  const actual = jest.requireActual('node:tls') as typeof import('node:tls');
  const { EventEmitter: MockEventEmitter } = jest.requireActual('node:events') as typeof import('node:events');
  return {
    ...actual,
    connect: jest.fn((_options: tls.ConnectionOptions, callback?: () => void) => {
      const socket = new MockEventEmitter() as tls.TLSSocket & {
        write: jest.Mock;
        destroyed: boolean;
        destroy: jest.Mock;
      };
      socket.write = jest.fn();
      socket.destroyed = false;
      socket.destroy = jest.fn();
      if (callback) {
        setImmediate(callback);
      }
      return socket;
    }),
  };
});

const buildLoasFrame = (payload: Buffer): Buffer => {
  const length = payload.length;
  const header = Buffer.alloc(3);
  header[0] = 0x56;
  header[1] = 0xe0 | ((length >> 8) & 0x1f);
  header[2] = length & 0xff;
  return Buffer.concat([header, payload]);
};

describe('parseLatmFrames', () => {
  it('extracts complete LOAS frames and preserves remainder', () => {
    const frameA = buildLoasFrame(Buffer.from([0x01, 0x02, 0x03]));
    const frameB = buildLoasFrame(Buffer.from([0x04, 0x05]));
    const partial = buildLoasFrame(Buffer.from([0x06, 0x07, 0x08]));
    const partialCut = partial.subarray(0, 4);

    const buffer = Buffer.concat([frameA, frameB, partialCut]);
    const result = parseLatmFrames(buffer);

    expect(result.frames).toHaveLength(2);
    expect(result.frames[0]).toEqual(frameA);
    expect(result.frames[1]).toEqual(frameB);
    expect(result.remainder).toEqual(partialCut);
  });

  it('discards bytes before syncword', () => {
    const frame = buildLoasFrame(Buffer.from([0x09, 0x0a]));
    const buffer = Buffer.concat([Buffer.from([0x00, 0x11, 0x22]), frame]);
    const result = parseLatmFrames(buffer);

    expect(result.discardedBytes).toBe(3);
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]).toEqual(frame);
    expect(result.remainder.length).toBe(0);
  });
});

const packet = (payload: Buffer, declaredLength = payload.length): Buffer => {
  const header = Buffer.alloc(9);
  header.writeUInt32BE(declaredLength, 5);
  return Buffer.concat([header, payload]);
};
const consumer = () => new Writable({ write(_chunk, _encoding, callback) { callback(); } });
const latestSocket = (): tls.TLSSocket => (tls.connect as unknown as jest.Mock).mock.results.at(-1)?.value;

describe('ImmisProxyServer private consumer', () => {
  let proxy: ImmisProxyServer;
  beforeEach(() => {
    jest.useFakeTimers();
    (lookup as jest.Mock).mockReset().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    (tls.connect as unknown as jest.Mock).mockClear();
    proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/session?client_id=1', serial: 'TEST' });
  });
  afterEach(() => { proxy.stop(); jest.useRealTimers(); });

  it('starts without a listener or upstream connection and connects only for an attached child', async () => {
    await expect(proxy.start()).resolves.toBe('pipe:0');
    expect(proxy.url).toBe('pipe:0');
    expect(tls.connect).not.toHaveBeenCalled();
    proxy.attachConsumer(consumer()); await flushResolution();
    expect(tls.connect).toHaveBeenCalledTimes(1);
  });

  it('cancels pending DNS on STOP and prevents duplicate resolution', async () => {
    let answer!: (value: { address: string; family: number }[]) => void;
    (lookup as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
    await proxy.start();
    proxy.attachConsumer(consumer()); await flushResolution();
    proxy.attachConsumer(consumer()); await flushResolution();
    expect(lookup).toHaveBeenCalledTimes(1);
    proxy.stop();
    await proxy.whenClosed;
    answer([{ address: '8.8.8.8', family: 4 }]); await flushResolution();
    expect(tls.connect).not.toHaveBeenCalled();
  });

  it('resolves each reconnect and refuses a later private DNS answer before TLS', async () => {
    (lookup as jest.Mock).mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    expect(tls.connect).toHaveBeenCalledWith(expect.objectContaining({ host: '8.8.8.8',
      servername: 'media.immedia-semi.com', rejectUnauthorized: true }), expect.any(Function));
    latestSocket().emit('close');
    jest.advanceTimersByTime(2000); await flushResolution();
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(tls.connect).toHaveBeenCalledTimes(1);
    await proxy.whenClosed;
  });

  it.each(['immis://evil.test/?client_id=1', 'immis://media.immedia-semi.com:444/?client_id=1',
    'https://media.immedia-semi.com/?client_id=1'])('rejects invalid upstream before DNS or TLS', raw => {
    expect(() => new ImmisProxyServer({ immisUrl: raw, serial: 'TEST' })).toThrow();
    expect(lookup).not.toHaveBeenCalled(); expect(tls.connect).not.toHaveBeenCalled();
  });

  it('waits for command readiness before opening TLS for the attached child', async () => {
    let ready!: () => void;
    proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/?client_id=1', serial: 'TEST',
      waitForReady: new Promise<void>(resolve => { ready = resolve; }) });
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    expect(tls.connect).not.toHaveBeenCalled();
    ready(); await flushResolution();
    expect(tls.connect).toHaveBeenCalledTimes(1);
  });

  it('does not connect when readiness resolves after stop', async () => {
    let ready!: () => void;
    proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/?client_id=1', serial: 'TEST',
      waitForReady: new Promise<void>(resolve => { ready = resolve; }) });
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    proxy.stop(); ready(); await flushResolution();
    await proxy.whenClosed;
    expect(tls.connect).not.toHaveBeenCalled();
    expect(proxy.isServing).toBe(false);
  });

  it('does not count or emit a worker failure when pending readiness rejects after STOP', async () => {
    let rejectReady!: (reason: Error) => void;
    proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/?client_id=1', serial: 'TEST',
      waitForReady: new Promise<void>((_resolve, reject) => { rejectReady = reject; }) });
    const errors = jest.fn(); proxy.on('error', errors);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    const before = getSecurityBoundaryCounters().worker_failure;
    proxy.stop(); await proxy.whenClosed;
    rejectReady(new Error('Streaming session retired')); await Promise.resolve(); await Promise.resolve();
    expect(errors).not.toHaveBeenCalled();
    expect(getSecurityBoundaryCounters().worker_failure).toBe(before);
    expect(tls.connect).not.toHaveBeenCalled();
    expect(proxy.isServing).toBe(false);
    await expect(proxy.start()).rejects.toThrow('readiness failed');
  });

  it('fails closed when command readiness rejects and contains callback errors', async () => {
    let rejectReady!: (reason: Error) => void;
    proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/?client_id=1', serial: 'TEST',
      waitForReady: new Promise<void>((_resolve, reject) => { rejectReady = reject; }) });
    proxy.on('error', () => { throw new Error('listener'); });
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    const before = getSecurityBoundaryCounters().worker_failure;
    rejectReady(new Error('provider secret')); await Promise.resolve(); await Promise.resolve();
    expect(tls.connect).not.toHaveBeenCalled();
    expect(proxy.isServing).toBe(false);
    expect(getSecurityBoundaryCounters().worker_failure).toBe(before + 1);
    await expect(proxy.start()).rejects.toThrow('readiness failed');
  });

  it('keeps transport closure pending after destroy until TLS confirms close', async () => {
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    const socket = latestSocket(); proxy.stop();
    let closed = false;
    const closure = proxy.whenClosed.then(() => { closed = true; });
    await Promise.resolve(); expect(closed).toBe(false);
    socket.emit('close'); await closure;
    expect(closed).toBe(true);
  });

  it('keeps upstream alive for encoder replacement, then stops after grace expires', async () => {
    await proxy.start();
    const first = consumer();
    proxy.attachConsumer(first); await flushResolution();
    first.emit('close');
    jest.advanceTimersByTime(1000);
    expect(proxy.isServing).toBe(true);
    proxy.attachConsumer(consumer()); await flushResolution();
    jest.advanceTimersByTime(2000);
    expect(proxy.isServing).toBe(true);
    expect(tls.connect).toHaveBeenCalledTimes(1);
    proxy.detachConsumer();
    jest.advanceTimersByTime(2000);
    expect(proxy.isServing).toBe(false);
  });

  it('delivers fragmented and coalesced video frames through child stdin', async () => {
    await proxy.start();
    const chunks: Buffer[] = [];
    proxy.attachConsumer(new Writable({ write(chunk, _encoding, cb) { chunks.push(Buffer.from(chunk)); cb(); } })); await flushResolution();
    const bytes = Buffer.concat([packet(Buffer.from([0x47, 1])), packet(Buffer.from([0x47, 2]))]);
    latestSocket().emit('data', bytes.subarray(0, 7));
    latestSocket().emit('data', bytes.subarray(7));
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([0x47, 1, 0x47, 2]));
  });

  it('rejects oversized declared frames before collecting their payload', async () => {
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    const error = jest.fn(); proxy.on('error', error);
    latestSocket().emit('data', packet(Buffer.alloc(0), 1024 * 1024 + 1));
    expect(error).toHaveBeenCalled(); expect(proxy.isServing).toBe(false);
  });

  it('rejects oversized buffered input and incomplete frames after five seconds', async () => {
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    latestSocket().emit('data', Buffer.alloc(2 * 1024 * 1024 + 1));
    expect(proxy.isServing).toBe(false);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    latestSocket().emit('data', Buffer.from([0]));
    jest.advanceTimersByTime(5000);
    expect(proxy.isServing).toBe(false);
  });

  it('stops stalled child writers after two seconds without drain', async () => {
    await proxy.start();
    proxy.attachConsumer(new Writable({ highWaterMark: 1, write() { /* stalled */ } })); await flushResolution();
    latestSocket().emit('data', packet(Buffer.from([0x47, 1])));
    jest.advanceTimersByTime(2000);
    expect(proxy.isServing).toBe(false);
  });

  it('bounds queued child video even when writes keep arriving before the drain deadline', async () => {
    await proxy.start();
    proxy.attachConsumer(new Writable({ write() { /* stalled */ } })); await flushResolution();
    const payload = Buffer.alloc(600 * 1024, 0x47);
    latestSocket().emit('data', packet(payload));
    latestSocket().emit('data', packet(payload));
    expect(proxy.isServing).toBe(false);
  });

  it('bounds stalled upstream control and talkback writes', async () => {
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    const socket = latestSocket();
    (socket.write as jest.Mock).mockReturnValue(false);
    proxy.startAudio();
    jest.advanceTimersByTime(2000);
    expect(proxy.isServing).toBe(false);
  });

  it('recovers child writes when drain arrives before its deadline', async () => {
    await proxy.start();
    let complete!: () => void;
    const writer = new Writable({ highWaterMark: 1, write(_chunk, _encoding, cb) { complete = cb; } });
    proxy.attachConsumer(writer); await flushResolution();
    latestSocket().emit('data', packet(Buffer.from([0x47])));
    complete(); writer.emit('drain');
    jest.advanceTimersByTime(2000);
    expect(proxy.isServing).toBe(true);
  });

  it('contains logger and event callback exceptions', async () => {
    proxy.on('data', () => { throw new Error('callback'); });
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    expect(() => latestSocket().emit('data', packet(Buffer.from([0x47])))).not.toThrow();
    expect(proxy.isServing).toBe(true);
  });

  it.each(['-1', '1.0', '01', '1x', '4294967296', ''])('rejects noncanonical client_id %s before TLS', (id) => {
    expect(() => new ImmisProxyServer({ immisUrl: `immis://media.immedia-semi.com/?client_id=${id}`, serial: 'TEST' })).toThrow(/uint32/);
    expect(tls.connect).not.toHaveBeenCalled();
  });
});

describe('ImmisProxyServer security controls', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('verifies upstream IMMIS TLS by default', async () => {
    const connectMock = tls.connect as unknown as jest.Mock;
    connectMock.mockClear();

    const proxy = new ImmisProxyServer({
      immisUrl: 'immis://stream.immedia-semi.com/session?client_id=1',
      serial: 'TEST_SERIAL',
    });

    await proxy.start();
    proxy.attachConsumer(consumer()); await flushResolution();

    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '8.8.8.8',
        port: 443,
        rejectUnauthorized: true,
        servername: 'stream.immedia-semi.com',
        minVersion: 'TLSv1.2',
      }),
      expect.any(Function),
    );

    await new Promise((resolve) => setImmediate(resolve));
    (proxy as unknown as { isRunning: boolean }).isRunning = true;
    proxy.stop();
  });

  it('requires upstream IMMIS TLS verification despite obsolete bypass setting', async () => {
    const connectMock = tls.connect as unknown as jest.Mock;
    connectMock.mockClear();

    const proxy = new ImmisProxyServer({
      immisUrl: 'immis://stream.immedia-semi.com/session?client_id=1',
      serial: 'TEST_SERIAL',
      verifyTls: false,
    });

    await proxy.start();
    proxy.attachConsumer(consumer()); await flushResolution();

    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '8.8.8.8',
        port: 443,
        rejectUnauthorized: true,
        servername: 'stream.immedia-semi.com',
        minVersion: 'TLSv1.2',
      }),
      expect.any(Function),
    );

    await new Promise((resolve) => setImmediate(resolve));
    (proxy as unknown as { isRunning: boolean }).isRunning = true;
    proxy.stop();
  });

  it('keeps debug stream recordings owner-only and omits raw serials from filenames', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-immis-recording-'));
    await fs.chmod(tmpDir, 0o755);
    const proxy = new ImmisProxyServer({
      immisUrl: 'immis://stream.immedia-semi.com/session?client_id=1',
      serial: 'TEST_SERIAL',
      saveStreamPath: tmpDir,
    });

    try {
      await (proxy as unknown as { startStreamRecording: () => Promise<void> }).startStreamRecording();
      const streamFile = (proxy as unknown as { streamFile: WriteStream | null }).streamFile;
      expect(streamFile).toBeTruthy();

      const filename = path.basename(String(streamFile?.path));
      expect(filename).not.toContain('TEST_SERIAL');
      expect(filename).toMatch(/^blink-stream-[a-f0-9]{16}-.+-[a-f0-9]{16}\.ts$/);

      const stats = await fs.stat(String(streamFile?.path));
      expect(stats.mode & 0o777).toBe(0o600);
      const rootStats = await fs.stat(tmpDir);
      expect(rootStats.mode & 0o777).toBe(0o755);
      const recordingDir = path.dirname(String(streamFile?.path));
      expect(path.basename(recordingDir)).toBe('blink-stream-recordings');
      const dirStats = await fs.stat(recordingDir);
      expect(dirStats.mode & 0o777).toBe(0o700);
      await new Promise<void>((resolve) => streamFile?.end(resolve));
    } finally {
      (proxy as unknown as { stopStreamRecording: () => void }).stopStreamRecording();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('uses collision-resistant debug stream recording filenames for same-timestamp viewers', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-immis-recording-'));
    const timestampSpy = jest
      .spyOn(Date.prototype, 'toISOString')
      .mockReturnValue('2026-05-05T21:00:00.000Z');
    const proxyA = new ImmisProxyServer({
      immisUrl: 'immis://stream.immedia-semi.com/session?client_id=1',
      serial: 'TEST_SERIAL',
      saveStreamPath: tmpDir,
    });
    const proxyB = new ImmisProxyServer({
      immisUrl: 'immis://stream.immedia-semi.com/session?client_id=1',
      serial: 'TEST_SERIAL',
      saveStreamPath: tmpDir,
    });

    try {
      await (proxyA as unknown as { startStreamRecording: () => Promise<void> }).startStreamRecording();
      await (proxyB as unknown as { startStreamRecording: () => Promise<void> }).startStreamRecording();
      const streamFileA = (proxyA as unknown as { streamFile: WriteStream | null }).streamFile;
      const streamFileB = (proxyB as unknown as { streamFile: WriteStream | null }).streamFile;
      expect(streamFileA).toBeTruthy();
      expect(streamFileB).toBeTruthy();

      const filenameA = path.basename(String(streamFileA?.path));
      const filenameB = path.basename(String(streamFileB?.path));
      expect(filenameA).toMatch(/^blink-stream-[a-f0-9]{16}-2026-05-05T21-00-00-000Z-[a-f0-9]{16}\.ts$/);
      expect(filenameB).toMatch(/^blink-stream-[a-f0-9]{16}-2026-05-05T21-00-00-000Z-[a-f0-9]{16}\.ts$/);
      expect(filenameA).not.toBe(filenameB);

      await Promise.all([
        new Promise<void>((resolve, reject) => {
          streamFileA?.once('error', reject);
          streamFileA?.end(resolve);
        }),
        new Promise<void>((resolve, reject) => {
          streamFileB?.once('error', reject);
          streamFileB?.end(resolve);
        }),
      ]);
    } finally {
      timestampSpy.mockRestore();
      (proxyA as unknown as { stopStreamRecording: () => void }).stopStreamRecording();
      (proxyB as unknown as { stopStreamRecording: () => void }).stopStreamRecording();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('continues debug stream recording when directory chmod is unsupported', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-immis-recording-'));
    const log = jest.fn();
    const realOpen = fs.open.bind(fs);
    const dirHandleChmod = jest.fn().mockRejectedValueOnce(new Error('chmod unsupported'));
    const openSpy = jest.spyOn(fs, 'open').mockImplementation(async (filePath, flags, mode) => {
      const handle = await realOpen(filePath, flags, mode);
      if (String(filePath).endsWith('blink-stream-recordings')) {
        jest.spyOn(handle, 'chmod').mockImplementation(dirHandleChmod);
      }
      return handle;
    });
    const pathChmodSpy = jest.spyOn(fs, 'chmod');
    const proxy = new ImmisProxyServer({
      immisUrl: 'immis://stream.immedia-semi.com/session?client_id=1',
      serial: 'TEST_SERIAL',
      saveStreamPath: tmpDir,
      log,
    });

    try {
      await (proxy as unknown as { startStreamRecording: () => Promise<void> }).startStreamRecording();
      const streamFile = (proxy as unknown as { streamFile: WriteStream | null }).streamFile;
      expect(streamFile).toBeTruthy();
      expect(dirHandleChmod).toHaveBeenCalledWith(0o700);
      expect(pathChmodSpy).not.toHaveBeenCalledWith(expect.stringContaining('blink-stream-recordings'), 0o700);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Failed to set debug recording directory permissions'),
      );

      await new Promise<void>((resolve) => streamFile?.end(resolve));
    } finally {
      openSpy.mockRestore();
      pathChmodSpy.mockRestore();
      (proxy as unknown as { stopStreamRecording: () => void }).stopStreamRecording();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects symlinked debug stream recording directories', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-immis-recording-'));
    const targetDir = path.join(tmpDir, 'target');
    const linkDir = path.join(tmpDir, 'blink-stream-recordings');
    await fs.mkdir(targetDir);
    await fs.symlink(targetDir, linkDir, 'dir');
    const log = jest.fn();
    const proxy = new ImmisProxyServer({
      immisUrl: 'immis://stream.immedia-semi.com/session?client_id=1',
      serial: 'TEST_SERIAL',
      saveStreamPath: tmpDir,
      log,
    });

    try {
      await (proxy as unknown as { startStreamRecording: () => Promise<void> }).startStreamRecording();
      expect((proxy as unknown as { streamFile: WriteStream | null }).streamFile).toBeNull();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Failed to start stream recording'));
    } finally {
      (proxy as unknown as { stopStreamRecording: () => void }).stopStreamRecording();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects debug stream recording directory swaps before using the capture file', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-immis-recording-'));
    const recordingDir = path.join(tmpDir, 'blink-stream-recordings');
    const targetDir = path.join(tmpDir, 'target');
    const log = jest.fn();
    const realLstat = fs.lstat.bind(fs);
    let recordingDirLstatCount = 0;
    const lstatSpy = jest.spyOn(fs, 'lstat').mockImplementation(async (filePath) => {
      if (String(filePath) === recordingDir) {
        recordingDirLstatCount += 1;
        if (recordingDirLstatCount === 1) {
          await fs.rm(recordingDir, { recursive: true, force: true });
          await fs.mkdir(targetDir, { recursive: true });
          await fs.symlink(targetDir, recordingDir, 'dir');
        }
      }
      return realLstat(filePath);
    });
    const proxy = new ImmisProxyServer({
      immisUrl: 'immis://stream.immedia-semi.com/session?client_id=1',
      serial: 'TEST_SERIAL',
      saveStreamPath: tmpDir,
      log,
    });

    try {
      await (proxy as unknown as { startStreamRecording: () => Promise<void> }).startStreamRecording();
      expect((proxy as unknown as { streamFile: WriteStream | null }).streamFile).toBeNull();
      expect(lstatSpy).toHaveBeenCalledWith(recordingDir);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Failed to start stream recording'));
      expect(await fs.readdir(targetDir)).toHaveLength(0);
    } finally {
      lstatSpy.mockRestore();
      (proxy as unknown as { stopStreamRecording: () => void }).stopStreamRecording();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('does not chmod a swapped debug recording directory before verifying its identity', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-immis-recording-'));
    const recordingDir = path.join(tmpDir, 'blink-stream-recordings');
    const targetDir = path.join(tmpDir, 'target');
    const log = jest.fn();
    const realLstat = fs.lstat.bind(fs);
    const realOpen = fs.open.bind(fs);
    const dirHandleChmod = jest.fn();
    await fs.mkdir(targetDir, { recursive: true });
    const lstatSpy = jest.spyOn(fs, 'lstat').mockImplementation(async (filePath) => {
      const stats = await realLstat(filePath);
      if (String(filePath) === recordingDir) {
        await fs.rm(recordingDir, { recursive: true, force: true });
        await fs.symlink(targetDir, recordingDir, 'dir');
      }
      return stats;
    });
    const openSpy = jest.spyOn(fs, 'open').mockImplementation(async (filePath, flags, mode) => {
      if (String(filePath) === recordingDir) {
        const handle = await realOpen(targetDir, flags, mode);
        jest.spyOn(handle, 'chmod').mockImplementation(dirHandleChmod);
        return handle;
      }
      return realOpen(filePath, flags, mode);
    });
    const proxy = new ImmisProxyServer({
      immisUrl: 'immis://stream.immedia-semi.com/session?client_id=1',
      serial: 'TEST_SERIAL',
      saveStreamPath: tmpDir,
      log,
    });

    try {
      await (proxy as unknown as { startStreamRecording: () => Promise<void> }).startStreamRecording();
      expect((proxy as unknown as { streamFile: WriteStream | null }).streamFile).toBeNull();
      expect(dirHandleChmod).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Failed to start stream recording'));
    } finally {
      lstatSpy.mockRestore();
      openSpy.mockRestore();
      (proxy as unknown as { stopStreamRecording: () => void }).stopStreamRecording();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('does not unlink an existing recording file when exclusive open fails before creation', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-immis-recording-'));
    const log = jest.fn();
    let attemptedFilename: string | null = null;
    const nodeFs = jest.requireActual<typeof import('node:fs')>('node:fs');
    const openSpy = jest.spyOn(nodeFs, 'open').mockImplementation(
      ((filePath, _flags, modeOrCallback, maybeCallback) => {
        const callback = typeof modeOrCallback === 'function' ? modeOrCallback : maybeCallback;
        if (!callback) {
          throw new Error('fs.open callback missing');
        }
        attemptedFilename = String(filePath);
        void fs.mkdir(path.dirname(attemptedFilename), { recursive: true })
          .then(() => fs.writeFile(String(attemptedFilename), 'existing recording', 'utf8'))
          .then(() => {
            const error = Object.assign(new Error('recording already exists'), { code: 'EEXIST' });
            callback(error, 0);
          });
      }) as typeof nodeFs.open,
    );
    const proxy = new ImmisProxyServer({
      immisUrl: 'immis://stream.immedia-semi.com/session?client_id=1',
      serial: 'TEST_SERIAL',
      saveStreamPath: tmpDir,
      log,
    });

    try {
      await (proxy as unknown as { startStreamRecording: () => Promise<void> }).startStreamRecording();
      expect((proxy as unknown as { streamFile: WriteStream | null }).streamFile).toBeNull();
      expect(attemptedFilename).toBeTruthy();
      await expect(fs.readFile(String(attemptedFilename), 'utf8')).resolves.toBe('existing recording');
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Failed to start stream recording'));
    } finally {
      openSpy.mockRestore();
      (proxy as unknown as { stopStreamRecording: () => void }).stopStreamRecording();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('refuses recording when plugin-owned captures exhaust the aggregate budget and preserves existing files', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-immis-quota-'));
    const recordingDir = path.join(tmpDir, 'blink-stream-recordings');
    await fs.mkdir(recordingDir);
    const existing = path.join(recordingDir, 'blink-stream-0123456789abcdef-old-0123456789abcdef.ts');
    await fs.writeFile(existing, '');
    await fs.truncate(existing, 256 * 1024 * 1024);
    const proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/?client_id=1', serial: 'TEST', saveStreamPath: tmpDir });
    try {
      await proxy.start();
      expect((proxy as unknown as { streamFile: WriteStream | null }).streamFile).toBeNull();
      expect((await fs.stat(existing)).size).toBe(256 * 1024 * 1024);
      expect(await fs.readdir(recordingDir)).toEqual([path.basename(existing)]);
    } finally { proxy.stop(); await fs.rm(tmpDir, { recursive: true, force: true }); }
  });

  it('serializes recorder admission across simultaneous sessions', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-immis-reservation-'));
    const proxies = Array.from({ length: 5 }, () => new ImmisProxyServer({
      immisUrl: 'immis://media.immedia-semi.com/?client_id=1', serial: 'TEST', saveStreamPath: tmpDir,
    }));
    try {
      await Promise.all(proxies.map((proxy) => proxy.start()));
      const files = await fs.readdir(path.join(tmpDir, 'blink-stream-recordings'));
      expect(files.filter(file => file.endsWith('.ts'))).toHaveLength(4);
      expect(files.filter(file => file.endsWith('.reserve'))).toHaveLength(4);
      expect(proxies.filter((proxy) => (proxy as unknown as { streamFile: WriteStream | null }).streamFile)).toHaveLength(4);
    } finally {
      for (const proxy of proxies) proxy.stop();
      await Promise.all(proxies.map(proxy => proxy.whenClosed));
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('enforces the same directory quota across independent plugin processes', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-immis-process-quota-'));
    const runtime = path.join(tmpDir, 'runtime');
    await fs.mkdir(runtime);
    const children: ChildProcess[] = [];
    const nextMessage = (child: ChildProcess): Promise<void> => new Promise((resolve, reject) => {
      child.once('message', () => resolve());
      child.once('error', reject);
      child.once('exit', code => { if (code) reject(new Error(`Test recorder exited ${code}`)); });
    });
    const launch = async (): Promise<ChildProcess> => {
      const child = spawn(process.execPath, ['-e', `
        const { ImmisProxyServer } = require(process.argv[1]);
        const proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/?client_id=1', serial: 'TEST', saveStreamPath: process.argv[2] });
        process.on('message', async message => {
          if (message === 'stop') { proxy.stop(); await proxy.whenClosed; process.send('closed'); process.disconnect(); }
        });
        proxy.start().then(() => process.send('ready')).catch(() => process.exit(2));
      `, path.join(runtime, 'immis-proxy.js'), tmpDir], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
      children.push(child); await nextMessage(child); return child;
    };
    const finish = async (child: ChildProcess): Promise<void> => {
      if (!child.connected) return;
      const stopped = nextMessage(child); child.send('stop'); await stopped;
    };
    const captures = async () => (await fs.readdir(path.join(tmpDir, 'blink-stream-recordings'))).filter(file => file.endsWith('.ts'));
    try {
      for (const name of ['immis-proxy', 'network-diagnostics', 'media-destination', 'bounded-dns']) {
        const source = await fs.readFile(path.join(__dirname, '../../src/blink-api', `${name}.ts`), 'utf8');
        await fs.writeFile(path.join(runtime, `${name}.js`), transpileModule(source, {
          compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
        }).outputText);
      }
      const first = await launch(); await launch(); await launch(); await launch();
      expect(await captures()).toHaveLength(4);
      await launch(); expect(await captures()).toHaveLength(4);
      const entries = await fs.readdir(path.join(tmpDir, 'blink-stream-recordings'));
      for (const marker of entries.filter(file => file.endsWith('.reserve'))) {
        expect((await fs.stat(path.join(tmpDir, 'blink-stream-recordings', marker))).mode & 0o777).toBe(0o600);
      }
      await finish(first);
      await launch(); expect(await captures()).toHaveLength(5);
    } finally {
      await Promise.all(children.map(child => finish(child)));
      for (const child of children) if (child.exitCode === null) child.kill();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it.each(['file', 'symlink'])('refuses an existing %s admission lock without waiting or deleting it', async kind => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-immis-stale-lock-'));
    const directory = path.join(tmpDir, 'blink-stream-recordings'); await fs.mkdir(directory);
    const lock = path.join(directory, '.admission.lock');
    const target = path.join(tmpDir, 'lock-target');
    if (kind === 'symlink') { await fs.writeFile(target, 'owner'); await fs.symlink(target, lock); }
    else await fs.writeFile(lock, 'owner');
    const proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/?client_id=1', serial: 'TEST', saveStreamPath: tmpDir });
    try {
      await proxy.start();
      expect(await fs.readdir(directory)).toEqual(['.admission.lock']);
      expect(await fs.readFile(lock, 'utf8')).toBe('owner');
      expect(proxy.isServing).toBe(true);
    } finally { proxy.stop(); await proxy.whenClosed; await fs.rm(tmpDir, { recursive: true, force: true }); }
  });

  it('keeps abandoned capture reservations charged without deleting them', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-immis-stale-reserve-'));
    const directory = path.join(tmpDir, 'blink-stream-recordings'); await fs.mkdir(directory);
    const markers = Array.from({ length: 4 }, (_, index) => `blink-stream-0123456789abcdef-old${index}-0123456789abcdef.ts.reserve`);
    for (const marker of markers) await fs.writeFile(path.join(directory, marker), '');
    const proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/?client_id=1', serial: 'TEST', saveStreamPath: tmpDir });
    try {
      await proxy.start(); expect((await fs.readdir(directory)).sort()).toEqual(markers.sort());
      expect(proxy.isServing).toBe(true);
    } finally { proxy.stop(); await proxy.whenClosed; await fs.rm(tmpDir, { recursive: true, force: true }); }
  });

  it('retains closure while recording startup is pending and closes its late file', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-immis-start-close-'));
    const realOpen = fs.open.bind(fs);
    let resume!: () => void;
    let opened!: () => void;
    const reached = new Promise<void>(resolve => { opened = resolve; });
    const gate = new Promise<void>(resolve => { resume = resolve; });
    const openSpy = jest.spyOn(fs, 'open').mockImplementation(async (filePath, flags, mode) => {
      if (String(filePath).endsWith('blink-stream-recordings')) { opened(); await gate; }
      return realOpen(filePath, flags, mode);
    });
    const proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/?client_id=1', serial: 'TEST', saveStreamPath: tmpDir });
    try {
      const startup = proxy.start();
      const rejected = expect(startup).rejects.toThrow('stopped during startup');
      await reached; proxy.stop();
      let closed = false;
      const closure = proxy.whenClosed.then(() => { closed = true; });
      await Promise.resolve(); expect(closed).toBe(false);
      resume(); await rejected; await closure;
      expect(closed).toBe(true);
      expect((proxy as unknown as { streamFile: WriteStream | null }).streamFile).toBeNull();
    } finally { resume(); openSpy.mockRestore(); proxy.stop(); await fs.rm(tmpDir, { recursive: true, force: true }); }
  });

  it('stops recording after five minutes while leaving the media session active', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-immis-duration-'));
    const proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/?client_id=1', serial: 'TEST', saveStreamPath: tmpDir });
    jest.useFakeTimers();
    try {
      await proxy.start();
      expect((proxy as unknown as { streamFile: WriteStream | null }).streamFile).not.toBeNull();
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect((proxy as unknown as { streamFile: WriteStream | null }).streamFile).toBeNull();
      expect(proxy.isServing).toBe(true);
    } finally { proxy.stop(); jest.useRealTimers(); await fs.rm(tmpDir, { recursive: true, force: true }); }
  });

  it('redacts IMMIS auth identifiers from proxy debug logs', () => {
    const log = jest.fn();
    const proxy = new ImmisProxyServer({
      immisUrl: 'immis://stream.immedia-semi.com/session/conn-secret__suffix?client_id=12345',
      serial: 'TEST_SERIAL',
      debug: true,
      log,
    });

    (proxy as unknown as { buildAuthHeader: () => Buffer }).buildAuthHeader();

    const logs = log.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logs).toContain('Client ID: <redacted>');
    expect(logs).toContain('Connection ID: <redacted>');
    expect(logs).not.toContain('12345');
    expect(logs).not.toContain('conn-secret');
  });
});
