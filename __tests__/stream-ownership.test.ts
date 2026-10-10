import { ImmisProxyServer } from '../src/blink-api/immis-proxy';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import * as tls from 'node:tls';
jest.mock('node:tls', () => ({ connect: jest.fn() }));
import { BlinkCameraSource } from '../src/accessories/camera-source';
import { createHap } from './helpers/homebridge';

jest.mock('node:child_process', () => ({ spawn: jest.fn(() => {
  const child = new EventEmitter() as any;
  child.stdin = new PassThrough(); child.stderr = new PassThrough();
  child.kill = jest.fn(); child.exitCode = null; return child;
}) }));
const prepare = (source: BlinkCameraSource, id = 's') => new Promise<any>((resolve, reject) => {
  source.prepareStream({ sessionID: id, targetAddress: '127.0.0.1', addressVersion: 'ipv4',
    video: { port: 5000, srtpCryptoSuite: 0, srtp_key: Buffer.alloc(16), srtp_salt: Buffer.alloc(14) },
    audio: { port: 5002, srtpCryptoSuite: 0, srtp_key: Buffer.alloc(16), srtp_salt: Buffer.alloc(14) },
  } as any, (error, response) => error ? reject(error) : resolve(response));
});
const request = { type: 'start', sessionID: 's', video: { fps: 15, width: 640, height: 480,
  max_bit_rate: 300, profile: 0, level: 0, pt: 99, mtu: 1378 } } as any;
const stop = (source: BlinkCameraSource) => new Promise<void>(resolve => source.handleStreamRequest({ type: 'stop', sessionID: 's' } as any, () => resolve()));
const make = (api: object) => new BlinkCameraSource(api as any, createHap() as any, 1, 2,
  'camera', 'serial', jest.fn(), () => true, jest.fn(), { audio: { enabled: false }, video: { encoder: 'libx264' } });

describe('generation-owned streaming', () => {
  beforeEach(() => (spawn as jest.Mock).mockClear());
  it('bounds repeated failed START requests without replaying liveview POSTs', async () => {
    const liveview = jest.fn().mockRejectedValue(new Error('provider refusal'));
    const source = make({ startCameraLiveview: liveview });
    const clock = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    try {
      const start = () => new Promise<Error | undefined>(resolve => source.handleStreamRequest(request, resolve));
      await prepare(source); expect(await start()).toBeInstanceOf(Error); await stop(source);
      for (let i = 0; i < 5; i++) {
        await prepare(source); expect(await start()).toBeInstanceOf(Error); await stop(source);
      }
      expect(liveview).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(130_000);
      await prepare(source); expect(await start()).toBeInstanceOf(Error);
      expect(liveview).toHaveBeenCalledTimes(2);
      expect(spawn).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); await stop(source); }
  });
  it('bounds retries after an asynchronous child spawn failure', async () => {
    const liveview = jest.fn().mockResolvedValue({ server: 'rtsps://vendor.example/live' });
    const source = make({ startCameraLiveview: liveview });
    await prepare(source); const callback = jest.fn(); source.handleStreamRequest(request, callback);
    await new Promise(resolve => setImmediate(resolve));
    const child = (spawn as jest.Mock).mock.results[0].value;
    child.emit('error', new Error('spawn failed')); child.emit('close', 1, null);
    await stop(source);
    await prepare(source);
    await new Promise<void>(resolve => source.handleStreamRequest(request, () => resolve()));
    await stop(source);
    expect(liveview).toHaveBeenCalledTimes(1);
  });
  it('opens verified IMMIS media while command monitoring is pending and fences late polling after STOP', async () => {
    const socket = new EventEmitter() as any;
    socket.authorized = true; socket.write = jest.fn(() => true);
    socket.destroy = jest.fn(() => { socket.emit('close'); return socket; });
    const connecting = (tls.connect as jest.Mock).mockImplementation(((_options: any, callback: () => void) => {
      void Promise.resolve().then(callback); return socket;
    }) as any);
    let finishPoll!: (value: any) => void;
    const getCommandStatus = jest.fn(() => new Promise(resolve => { finishPoll = resolve; }));
    const source = make({ startCameraLiveview: jest.fn().mockResolvedValue({
      server: 'immis://8.8.8.8:443/?client_id=1', command_id: 7, continue_interval: 7,
    }), getCommandStatus, completeCommand: jest.fn().mockResolvedValue(null) });
    try {
      await prepare(source); source.handleStreamRequest(request, jest.fn());
      await new Promise(resolve => setImmediate(resolve));
      const child = (spawn as jest.Mock).mock.results[0].value;
      expect(connecting).toHaveBeenCalledWith(expect.objectContaining({ rejectUnauthorized: true }), expect.any(Function));
      expect(socket.write).toHaveBeenCalled();
      const payload = Buffer.alloc(188, 0); payload[0] = 0x47;
      const header = Buffer.alloc(9); header.writeUInt32BE(payload.length, 5);
      socket.emit('data', Buffer.concat([header, payload]));
      expect(child.stdin.read()).toEqual(payload);
      // Advance the already scheduled polling timer without overlapping requests.
      await new Promise(resolve => setTimeout(resolve, 5100));
      expect(getCommandStatus).toHaveBeenCalledTimes(1);
      const stopping = stop(source); child.emit('close', 0, null); await stopping;
      finishPoll({ complete: false }); await new Promise(resolve => setImmediate(resolve));
      expect(getCommandStatus).toHaveBeenCalledTimes(1);
      expect(connecting).toHaveBeenCalledTimes(1);
    } finally { connecting.mockReset(); await stop(source); }
  }, 10_000);

  it('rejects duplicate preparations; STOP permits fresh generation', async () => {
    const source = make({}); await prepare(source);
    await expect(prepare(source)).rejects.toThrow('already owned');
    await stop(source); await prepare(source); await stop(source);
  });
  it('expires unused preparation after 30 seconds', async () => {
    const source = make({}); await prepare(source); jest.useFakeTimers();
    // Preparation timer was real: use a second generation created under fake timers.
    await stop(source); await prepare(source);
    await jest.advanceTimersByTimeAsync(30_000);
    await prepare(source); await stop(source); jest.useRealTimers();
  });
  it('late liveview completion cleans remote command without retiring newer generation', async () => {
    let finish!: (value: any) => void;
    const completeCommand = jest.fn().mockResolvedValue(null);
    const source = make({ startCameraLiveview: () => new Promise(resolve => { finish = resolve; }), completeCommand });
    await prepare(source); const callback = jest.fn(); source.handleStreamRequest(request, callback);
    await stop(source); await prepare(source);
    finish({ server: 'rtsps://vendor.example/live', command_id: 7 });
    await new Promise(resolve => setImmediate(resolve));
    expect(spawn).not.toHaveBeenCalled(); expect(callback).toHaveBeenCalledTimes(1);
    expect(completeCommand).toHaveBeenCalledWith(1, 7, expect.any(Object));
    await expect(prepare(source)).rejects.toThrow('already owned'); await stop(source);
  });
  it('retains reservation until child close and contains late spawn/stderr/stdin error', async () => {
    const source = make({ startCameraLiveview: jest.fn().mockResolvedValue({ server: 'rtsps://vendor.example/live' }) });
    await prepare(source); const callback = jest.fn(); source.handleStreamRequest(request, callback);
    await new Promise(resolve => setImmediate(resolve));
    const child = (spawn as jest.Mock).mock.results[0].value;
    const stopping = stop(source);
    await expect(prepare(source)).rejects.toThrow('already owned');
    child.emit('spawn'); child.stderr.emit('data', Buffer.from('late')); child.stdin.emit('error', new Error('EPIPE'));
    child.emit('close', 0, null); await stopping;
    expect(callback).toHaveBeenCalledTimes(1); await prepare(source); await stop(source);
  });
  it('releases owned maps across 100 confirmed synthetic start/stop cycles', async () => {
    const source = make({ startCameraLiveview: jest.fn().mockResolvedValue({ server: 'rtsps://vendor.example/live' }) });
    for (let cycle = 0; cycle < 100; cycle++) {
      await prepare(source); const callback = jest.fn(); source.handleStreamRequest(request, callback);
      await new Promise(resolve => setImmediate(resolve));
      const child = (spawn as jest.Mock).mock.results[cycle].value;
      child.emit('spawn'); const stopping = stop(source); child.emit('close', 0, null); await stopping;
      expect(callback).toHaveBeenCalledTimes(1);
      expect((source as any).sessionOwners.size).toBe(0);
      expect((source as any).ongoingSessions.size).toBe(0);
    }
  });

  it('STOP during private proxy startup adopts late resources without spawning media', async () => {
    let finish!: (value: string) => void;
    const starting = jest.spyOn(ImmisProxyServer.prototype, 'start').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    try {
      const source = make({ startCameraLiveview: jest.fn().mockResolvedValue({ server: 'immis://media.immedia-semi.com/live?client_id=1' }) });
      await prepare(source); const callback = jest.fn(); source.handleStreamRequest(request, callback);
      await new Promise(resolve => setImmediate(resolve)); await stop(source);
      await expect(prepare(source)).rejects.toThrow('already owned');
      finish('pipe:0'); await new Promise(resolve => setImmediate(resolve));
      expect(spawn).not.toHaveBeenCalled(); expect(callback).toHaveBeenCalledTimes(1);
      await prepare(source); await stop(source);
    } finally { starting.mockRestore(); }
  });

  it('retains ports and session identity until private transport confirms closure', async () => {
    let closeTransport!: () => void;
    const closure = new Promise<void>(resolve => { closeTransport = resolve; });
    const starting = jest.spyOn(ImmisProxyServer.prototype, 'start').mockResolvedValue('pipe:0');
    const attaching = jest.spyOn(ImmisProxyServer.prototype, 'attachConsumer').mockImplementation(() => undefined);
    const closed = jest.spyOn(ImmisProxyServer.prototype, 'whenClosed', 'get').mockReturnValue(closure);
    try {
      const source = make({ startCameraLiveview: jest.fn().mockResolvedValue({ server: 'immis://media.immedia-semi.com/live?client_id=1' }) });
      await prepare(source); const callback = jest.fn(); source.handleStreamRequest(request, callback);
      await new Promise(resolve => setImmediate(resolve));
      const child = (spawn as jest.Mock).mock.results[0].value;
      child.emit('spawn'); const stopping = stop(source); child.emit('close', 0, null);
      await expect(prepare(source)).rejects.toThrow('already owned');
      closeTransport(); await stopping;
      await prepare(source); await stop(source); expect(callback).toHaveBeenCalledTimes(1);
    } finally { starting.mockRestore(); attaching.mockRestore(); closed.mockRestore(); }
  });

});
