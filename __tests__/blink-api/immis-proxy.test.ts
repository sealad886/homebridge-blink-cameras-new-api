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
      expect(filename).toMatch(/^blink-stream-[a-f0-9]{16}-/);

      await new Promise<void>((resolve, reject) => {
        streamFile?.once('open', () => resolve());
        streamFile?.once('error', reject);
      });
      const stats = await fs.stat(String(streamFile?.path));
      expect(stats.mode & 0o777).toBe(0o600);
      const dirStats = await fs.stat(tmpDir);
      expect(dirStats.mode & 0o777).toBe(0o700);
      await new Promise<void>((resolve) => streamFile?.end(resolve));
    } finally {
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
