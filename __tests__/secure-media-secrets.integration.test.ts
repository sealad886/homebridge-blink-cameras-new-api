import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve, join } from 'node:path';
import process from 'node:process';
import { test } from '@jest/globals';
import type { HAP, PrepareStreamRequest, StreamingRequest } from 'homebridge';
import { BlinkCameraSource } from '../src/accessories/camera-source';
import { createOwnedMediaSession, type OwnedMediaSession } from '../src/accessories/media-session';
import { loadPackagedMediaWorker } from '../src/accessories/media-worker-artifact';
import { PrivateMediaWorker, type WorkerSpawner } from '../src/accessories/media-worker';
import { ImmisProxyServer } from '../src/blink-api/immis-proxy';
import type { BlinkApi } from '../src/blink-api';
import { createHap } from './helpers/homebridge';

// Only provider transport, artifact selection and LAN sockets are synthetic.
// Camera/session/IPC code and the native process execute their real implementations.
jest.mock('../src/accessories/media-session', () => {
  const actual = jest.requireActual<typeof import('../src/accessories/media-session')>('../src/accessories/media-session');
  return { ...actual, createOwnedMediaSession: jest.fn(actual.createOwnedMediaSession) };
});
jest.mock('../src/accessories/media-worker-artifact', () => ({ loadPackagedMediaWorker: jest.fn() }));
jest.mock('../src/blink-api/immis-proxy', () => ({ ImmisProxyServer: jest.fn() }));
jest.mock('node:dgram', () => {
  let port = 41000;
  return { createSocket: () => ({ once: jest.fn(), bind: (_port: number, ready: () => void) => globalThis.queueMicrotask(ready),
    address: () => ({ port: port++ }), close: (closed?: () => void) => closed?.() }) };
});

const realSession = jest.requireActual<typeof import('../src/accessories/media-session')>('../src/accessories/media-session').createOwnedMediaSession;
const configuredWorker = process.env.BLINK_MEDIA_TEST_WORKER_PATH;
const vendorCanary = 'F05_VENDOR_CAPABILITY_CANARY';
const vendorUrl = `immis://8.8.8.8:443/private?client_id=1&token=${vendorCanary}`;
const videoKey = Buffer.from('F05VideoKey12345');
const videoSalt = Buffer.from('F05VideoSalt12');
const audioKey = Buffer.from('F05AudioKey12345');
const audioSalt = Buffer.from('F05AudioSalt12');
const secrets = [Buffer.from(vendorCanary), Buffer.from(vendorUrl), videoKey, videoSalt, audioKey, audioSalt,
  Buffer.concat([videoKey, videoSalt]), Buffer.concat([audioKey, audioSalt])];
const forms = secrets.flatMap(value => [value, Buffer.from(value.toString('hex')), Buffer.from(value.toString('base64'))]);
function assertSecretFree(bytes: Buffer): void {
  // Fixed failure text: even a failed canary assertion must not dump its payload.
  if (forms.some(value => bytes.includes(value))) throw new Error('Secret canary crossed a public diagnostic boundary');
}

test('secrecy detector refuses raw, hexadecimal and base64 key/capability leaks', () => {
  for (const value of forms) expect(() => assertSecretFree(Buffer.concat([Buffer.from('diagnostic: '), value]))).toThrow('Secret canary crossed');
  expect(() => assertSecretFree(Buffer.from('Media session unavailable'))).not.toThrow();
});

function childMetadata(child: ChildProcessWithoutNullStreams, worker: string): Buffer {
  const pid = child.pid;
  if (!Number.isSafeInteger(pid) || !pid || pid < 1) throw new Error('Native child PID unavailable');
  if (process.platform === 'win32') {
    const windowsRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
    if (!windowsRoot) throw new Error('Windows metadata tool unavailable');
    // Only an observed numeric PID enters PowerShell; no URL, key or media bytes.
    const command = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($null -eq $p) { throw 'Missing native child' }; $p | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress`;
    const bytes = execFileSync(join(windowsRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { timeout: 5000, maxBuffer: 65536 });
    const metadata = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) as { ProcessId: number; ExecutablePath: string; CommandLine: string };
    expect(metadata.ProcessId === pid).toBe(true);
    expect(resolve(metadata.ExecutablePath).toLowerCase() === resolve(worker).toLowerCase()).toBe(true);
    expect([worker, `"${worker}"`].includes(metadata.CommandLine.trim())).toBe(true);
    // CIM exposes argv/executable, not environment. The real launch env is also
    // asserted below; no Windows process-memory/environment inspection is claimed.
    return bytes;
  }
  const command = execFileSync('/bin/ps', ['-ww', '-p', String(pid), '-o', 'command='], { timeout: 5000, maxBuffer: 65536 });
  expect(command.toString('utf8').trim() === worker).toBe(true);
  const environment = execFileSync('/bin/ps', ['eww', '-p', String(pid), '-o', 'command='], { timeout: 5000, maxBuffer: 65536 });
  return Buffer.concat([command, environment]);
}

(configuredWorker ? test : test.skip).each(['vendor-start-error', 'vendor-event-error', 'malformed-media', 'unexpected-exit'] as const)(
  'real camera/native private-pipe path withholds secrets through %s', async failure => {
    const worker = resolve(configuredWorker!);
    const inherited = process.env.BLINK_MEDIA_INHERITED_SECRET_CANARY;
    process.env.BLINK_MEDIA_INHERITED_SECRET_CANARY = vendorUrl;
    const pipes: Buffer[] = []; const diagnostics: Buffer[] = []; const publicErrors: string[] = [];
    let child: ChildProcessWithoutNullStreams | undefined; let session: OwnedMediaSession | undefined;
    let bytesSeen = 0; let closeTransport!: () => void;
    const transport = Object.assign(new EventEmitter(), { whenClosed: new Promise<void>(done => { closeTransport = done; }),
      start: async () => 'pipe:0', attachConsumer: jest.fn(), retire: () => closeTransport(), stop: () => closeTransport() });
    const launch: WorkerSpawner = (path, args, options) => {
      expect(path === worker).toBe(true); expect(args.length).toBe(0); expect(options.env).toEqual({}); expect(options.shell).toBe(false);
      const launched = spawn(path, args, options); child = launched;
      expect(launched.spawnargs.length).toBe(1);
      const write = launched.stdin.write.bind(launched.stdin);
      launched.stdin.write = ((...values: Parameters<typeof launched.stdin.write>) => {
        const value = values[0];
        if (!Buffer.isBuffer(value)) throw new Error('Private worker pipe must carry framed bytes');
        pipes.push(Buffer.from(value));
        return write(...values);
      }) as typeof launched.stdin.write;
      const capture = (bytes: Buffer) => { bytesSeen += bytes.length; if (bytesSeen <= 65536) diagnostics.push(Buffer.from(bytes)); };
      child.stdout.on('data', capture); child.stderr.on('data', capture);
      return child;
    };
    jest.mocked(loadPackagedMediaWorker).mockReturnValue(worker);
    (ImmisProxyServer as unknown as jest.Mock).mockImplementation(() => transport);
    jest.mocked(createOwnedMediaSession).mockImplementation(async (options, signal) => {
      session = await realSession(options, signal, {
        createWorker: (path, callbacks) => new PrivateMediaWorker(path, callbacks, launch),
        openSocket: async () => {
          let close!: () => void; const whenClosed = new Promise<void>(done => { close = done; });
          return { whenClosed, close, send: async () => {} };
        },
      });
      return session;
    });
    const metadata = (): void => { diagnostics.push(childMetadata(child!, worker)); };
    const privateFailure = Buffer.concat(forms).toString('utf8');
    const api = { startCameraLiveview: jest.fn(async () => {
      if (failure === 'vendor-start-error') { metadata(); throw new Error(privateFailure); }
      return { server: vendorUrl, command_id: 7 };
    }), completeCommand: jest.fn(async () => ({})), getCommandStatus: jest.fn(async () => ({ status: 'running' })) };
    const log = (text: string) => diagnostics.push(Buffer.from(text));
    const source = new BlinkCameraSource(api as unknown as BlinkApi, createHap() as unknown as HAP,
      1, 2, 'camera', 'synthetic-serial', () => undefined, () => true, log,
      { audio: { enabled: true } }, log);
    const prepare = { sessionID: 'secrecy-canary', targetAddress: '192.168.1.5', addressVersion: 'ipv4',
      video: { port: 5000, srtpCryptoSuite: 0, srtp_key: videoKey, srtp_salt: videoSalt },
      audio: { port: 5002, srtpCryptoSuite: 0, srtp_key: audioKey, srtp_salt: audioSalt } } as unknown as PrepareStreamRequest;
    const selected = { type: 'start', sessionID: prepare.sessionID,
      video: { width: 640, height: 360, fps: 15, max_bit_rate: 300, profile: 0, level: 0, pt: 99, mtu: 1378 },
      audio: { codec: 'OPUS', sample_rate: 16, channel: 1, max_bit_rate: 32, pt: 110, packet_time: 20 },
    } as unknown as StreamingRequest;
    const callback = jest.fn((error?: Error) => { if (error) publicErrors.push(error.message); });
    const stop = () => new Promise<void>(done => source.handleStreamRequest({ type: 'stop', sessionID: prepare.sessionID } as StreamingRequest, () => done()));
    try {
      await new Promise<void>((done, reject) => source.prepareStream(prepare, error => error ? reject(error) : done()));
      await new Promise<void>(done => source.handleStreamRequest(selected, error => { callback(error); done(); }));
      expect(api.startCameraLiveview).toHaveBeenCalledTimes(1); expect(child?.pid !== undefined).toBe(true);
      // Both independently acknowledged native SRTP initializations contain the
      // exact controller material inside BMI1 stdin frames, never vendor URLs.
      const initializations = pipes.filter(bytes => bytes.length >= 12 && bytes.readUInt32BE(4) === 10);
      expect(initializations.length).toBe(2);
      expect(initializations[0].subarray(24).equals(Buffer.concat([videoKey, videoSalt]))).toBe(true);
      expect(initializations[1].subarray(24).equals(Buffer.concat([audioKey, audioSalt]))).toBe(true);
      expect(Buffer.concat(pipes).includes(Buffer.from(vendorCanary))).toBe(false);
      if (failure !== 'vendor-start-error') {
        expect(callback.mock.calls[0][0]).toBeUndefined(); metadata();
        if (failure === 'vendor-event-error') transport.emit('error', new Error(privateFailure));
        if (failure === 'unexpected-exit') expect(child!.kill('SIGKILL')).toBe(true);
        if (failure === 'malformed-media') {
          await session!.write(Buffer.concat([Buffer.from(privateFailure), Buffer.alloc(4096)]));
          await session!.end().catch(error => publicErrors.push((error as Error).message));
          expect(session!.failed).toBe(true);
        }
      } else expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
      await session!.whenClosed; await stop();
      expect(callback).toHaveBeenCalledTimes(1); expect(bytesSeen <= 65536).toBe(true);
      assertSecretFree(Buffer.concat([...diagnostics, Buffer.from(publicErrors.join('\n'))]));
    } finally {
      await stop(); await session?.stop(); child?.kill('SIGKILL');
      if (inherited === undefined) delete process.env.BLINK_MEDIA_INHERITED_SECRET_CANARY;
      else process.env.BLINK_MEDIA_INHERITED_SECRET_CANARY = inherited;
      for (const bytes of [...pipes, ...diagnostics]) bytes.fill(0);
    }
  }, 15000);
