import { parseLatmFrames, ImmisProxyServer } from '../../src/blink-api/immis-proxy';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import type { WriteStream } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as tls from 'node:tls';

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

describe('ImmisProxyServer idle reconnect grace', () => {
  class MockSocket extends EventEmitter {
    public destroyed = false;
  }

  it('schedules a grace window instead of stopping immediately when the last client disconnects', () => {
    const proxy = new ImmisProxyServer({
      immisUrl: 'immis://example.com/session?client_id=1',
      serial: 'TEST_SERIAL',
    });

    const stop = jest.spyOn(proxy, 'stop').mockImplementation(() => undefined);
    jest.spyOn(proxy as unknown as { connectToImmisServer: () => void }, 'connectToImmisServer').mockImplementation(() => undefined);
    const client = new MockSocket();

    (proxy as unknown as { isRunning: boolean }).isRunning = true;
    (proxy as unknown as { handleClient: (socket: MockSocket) => void }).handleClient(client);

    client.emit('close');

    expect(stop).not.toHaveBeenCalled();

    const idleShutdownTimeout = (proxy as unknown as { idleShutdownTimeout: ReturnType<typeof setTimeout> | null }).idleShutdownTimeout;
    expect(idleShutdownTimeout).toBeTruthy();

    if (idleShutdownTimeout) {
      clearTimeout(idleShutdownTimeout);
      (proxy as unknown as { idleShutdownTimeout: null }).idleShutdownTimeout = null;
    }
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

    (proxy as unknown as { connectToImmisServer: () => void }).connectToImmisServer();

    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'stream.immedia-semi.com',
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

  it('allows upstream IMMIS TLS verification to be disabled explicitly', async () => {
    const connectMock = tls.connect as unknown as jest.Mock;
    connectMock.mockClear();

    const proxy = new ImmisProxyServer({
      immisUrl: 'immis://stream.immedia-semi.com/session?client_id=1',
      serial: 'TEST_SERIAL',
      verifyTls: false,
    });

    (proxy as unknown as { connectToImmisServer: () => void }).connectToImmisServer();

    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'stream.immedia-semi.com',
        port: 443,
        rejectUnauthorized: false,
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
    const lstatSpy = jest.spyOn(fs, 'lstat').mockImplementation(async (filePath) => {
      const stats = await realLstat(filePath);
      if (String(filePath) === recordingDir) {
        await fs.rm(recordingDir, { recursive: true, force: true });
        await fs.mkdir(targetDir, { recursive: true });
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
