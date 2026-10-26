import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers';
import type { Writable } from 'node:stream';
import type { HAP, PrepareStreamRequest, PrepareStreamResponse, StreamingRequest } from 'homebridge';
import type { BlinkApi } from '../src/blink-api';
import { BlinkCameraSource, type BlinkCameraStreamingConfigInput } from '../src/accessories/camera-source';
import { createOwnedMediaSession, type OwnedMediaSession } from '../src/accessories/media-session';
import { loadPackagedMediaWorker } from '../src/accessories/media-worker-artifact';
import { ImmisProxyServer } from '../src/blink-api/immis-proxy';
import { OwnedRtspBroker } from '../src/blink-api/rtsp-broker';
import { createHap } from './helpers/homebridge';

jest.mock('../src/accessories/media-session', () => ({ createOwnedMediaSession: jest.fn() }));
jest.mock('../src/accessories/media-worker-artifact', () => ({ loadPackagedMediaWorker: jest.fn(() => '/verified/worker') }));
jest.mock('../src/blink-api/immis-proxy', () => ({ ImmisProxyServer: jest.fn() }));
jest.mock('../src/blink-api/rtsp-broker', () => ({ OwnedRtspBroker: jest.fn() }));
let mockPort = 40000;
let mockDelayBind = false;
const mockBinds: Array<() => void> = [];
jest.mock('node:dgram', () => ({ createSocket: () => ({ once: jest.fn(),
  bind: (_port: number, callback: () => void) => mockDelayBind ? mockBinds.push(callback) : globalThis.queueMicrotask(callback),
  address: () => ({ port: mockPort++ }), close: (callback?: () => void) => callback?.() }) }));

const immis = 'immis://8.8.8.8:443/private?client_id=1&token=DUMMY_CAPABILITY';
const rtsps = 'rtsps://8.8.8.8:332/private?blinkRTSP=1&token=DUMMY_CAPABILITY';
const flush = async () => { for (let i = 0; i < 32; i++) await Promise.resolve(); await new Promise<void>(resolve => setImmediate(resolve)); };
const fakeTime = () => jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] });

function ownedMedia(autoClose: () => boolean) {
  let close!: () => void; let failed = false;
  const session: OwnedMediaSession = { whenClosed: new Promise<void>(resolve => { close = resolve; }), get failed() { return failed; },
    audioTiming: { initialPaddingSamples: 0, skipStartSamples: 0, skipEndSamples: 0 },
    write: jest.fn(async () => {}), end: jest.fn(async () => {}), stop: jest.fn(async () => { if (autoClose()) close(); }) };
  return { session, close: () => close(), fail: () => { failed = true; close(); } };
}
function ownedTransport(autoClose: () => boolean) {
  let close!: () => void;
  const consumers: Writable[] = [];
  const transport = Object.assign(new EventEmitter(), {
    whenClosed: new Promise<void>(resolve => { close = resolve; }),
    start: jest.fn(async () => 'pipe:0'), attachConsumer: jest.fn((consumer: Writable) => { consumers.push(consumer); }),
    retire: jest.fn(() => { if (autoClose()) close(); }), stop: jest.fn(() => { if (autoClose()) close(); }),
    startAudio: jest.fn(), stopAudio: jest.fn(), attachAudioInput: jest.fn(),
  });
  return { transport, consumers, close: () => close() };
}

function fixture(config: BlinkCameraStreamingConfigInput = {}) {
  const state = { closeMedia: true, closeTransport: true };
  const natives: ReturnType<typeof ownedMedia>[] = []; const transports: ReturnType<typeof ownedTransport>[] = [];
  const preparationCallbacks: jest.Mock[] = [];
  const ids = new Set<string>(); const log = jest.fn(); const errorLog = jest.fn(); const observed = jest.fn();
  (loadPackagedMediaWorker as jest.Mock).mockReturnValue('/verified/worker');
  jest.mocked(createOwnedMediaSession).mockImplementation(async () => {
    const native = ownedMedia(() => state.closeMedia); natives.push(native); return native.session;
  });
  (ImmisProxyServer as unknown as jest.Mock).mockImplementation(() => {
    const proxy = ownedTransport(() => state.closeTransport); transports.push(proxy); return proxy.transport;
  });
  (OwnedRtspBroker as unknown as jest.Mock).mockImplementation(() => {
    let close!: () => void;
    return { whenClosed: new Promise<void>(resolve => { close = resolve; }),
      start: jest.fn(async () => {}), stop: jest.fn(async () => { close(); }) };
  });
  const api = { startCameraLiveview: jest.fn<Promise<{ server: string; command_id?: number; polling_interval?: number; continue_interval?: number }>, []>()
    .mockResolvedValue({ server: immis }), completeCommand: jest.fn().mockResolvedValue(null),
  getCommandStatus: jest.fn().mockResolvedValue({ complete: false, status: 'running' }) };
  const source = new BlinkCameraSource(api as unknown as BlinkApi, createHap() as unknown as HAP,
    1, 2, 'camera', 'serial', () => undefined, () => true, log,
    { audio: { enabled: false }, ...config }, errorLog, undefined, observed);
  const selected = (id = 's') => ({ type: 'start', sessionID: id,
    video: { fps: 15, width: 640, height: 480, max_bit_rate: 300, profile: 0, level: 0, pt: 99, mtu: 1378 },
    ...(config.audio?.enabled ? { audio: { codec: 'OPUS', sample_rate: 16, channel: 1, max_bit_rate: 32, pt: 110, packet_time: 20 } } : {})
  }) as unknown as Extract<StreamingRequest, { type: 'start' }>;
  const prepare = (id = 's') => {
    ids.add(id);
    return new Promise<PrepareStreamResponse>((resolve, reject) => {
      const callback = jest.fn((error?: Error | null, response?: PrepareStreamResponse) => error ? reject(error) : resolve(response!));
      preparationCallbacks.push(callback);
      source.prepareStream({ sessionID: id,
      targetAddress: '192.168.1.5', addressVersion: 'ipv4',
      video: { port: 5000, srtpCryptoSuite: 0, srtp_key: Buffer.alloc(16), srtp_salt: Buffer.alloc(14) },
      audio: { port: 5002, srtpCryptoSuite: 0, srtp_key: Buffer.alloc(16), srtp_salt: Buffer.alloc(14) },
      } as unknown as PrepareStreamRequest, callback);
    });
  };
  const start = (id = 's') => new Promise<Error | undefined>(resolve => source.handleStreamRequest(selected(id), error => resolve(error)));
  const begin = (id = 's') => { const callback = jest.fn(); source.handleStreamRequest(selected(id), callback); return callback; };
  const stop = (id = 's') => new Promise<void>(resolve => source.handleStreamRequest({ type: 'stop', sessionID: id } as unknown as StreamingRequest, () => resolve()));
  return { state, source, api, log, errorLog, observed, natives, transports, preparationCallbacks, prepare, selected, start, begin, stop,
    async cleanup() {
      natives.forEach(native => native.close()); transports.forEach(proxy => proxy.close());
      for (const id of ids) await stop(id);
    },
  };
}

describe('generation-owned streaming', () => {
  beforeEach(() => { jest.clearAllMocks(); mockDelayBind = false; mockBinds.length = 0; });
  afterEach(() => { jest.useRealTimers(); });

  it('stops one-way IMMIS by retiring its owned consumer without talkback commands', async () => {
    const f = fixture({ audio: { enabled: true } });
    try {
      await f.prepare(); expect(await f.start()).toBeUndefined();
      const proxy = f.transports[0]; expect(proxy.consumers).toHaveLength(1);
      await f.stop(); expect(proxy.transport.retire).toHaveBeenCalled();
      expect(proxy.transport.startAudio).not.toHaveBeenCalled(); expect(proxy.transport.stopAudio).not.toHaveBeenCalled();
      expect(proxy.transport.attachAudioInput).not.toHaveBeenCalled(); expect(f.natives[0].session.stop).toHaveBeenCalled();
    } finally { await f.cleanup(); }
  });

  it('observes structured source geometry while bounding diagnostics and withholding transport secrets', async () => {
    const f = fixture({ mediaDebug: true });
    try {
      await f.prepare(); expect(await f.start()).toBeUndefined();
      const options = jest.mocked(createOwnedMediaSession).mock.calls[0][0];
      for (let i = 0; i < 10000; i++) options.onSourceInfo!({ width: 1920, height: 1080, fpsNumerator: 30, fpsDenominator: 1 });
      expect(f.observed).toHaveBeenCalledWith({ width: 1920, height: 1080, fps: 30 }); expect(f.log.mock.calls.length).toBeLessThanOrEqual(64);
      for (let i = 0; i < 100; i++) f.transports[0].transport.emit('error', new Error('private vendor token'));
      await f.stop(); expect(f.errorLog).toHaveBeenCalledWith(expect.any(String));
      expect(f.errorLog.mock.calls.length).toBeLessThanOrEqual(8); expect(JSON.stringify(f.errorLog.mock.calls)).not.toContain('private vendor token');
    } finally { await f.cleanup(); }
  });

  it('bounds repeated failed START requests without replaying liveview POSTs', async () => {
    const f = fixture(); f.api.startCameraLiveview.mockRejectedValue(new Error('provider refusal'));
    const clock = jest.spyOn(Date, 'now').mockReturnValue(100000);
    try {
      for (let i = 0; i < 6; i++) { await f.prepare(); expect(await f.start()).toBeInstanceOf(Error); await f.stop(); }
      expect(f.api.startCameraLiveview).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(130000); await f.prepare(); expect(await f.start()).toBeInstanceOf(Error); expect(f.api.startCameraLiveview).toHaveBeenCalledTimes(2);
    } finally { clock.mockRestore(); await f.cleanup(); }
  });

  it('waits for prior remote retirement before allocating replacement media', async () => {
    const f = fixture(); let retire!: () => void;
    f.api.startCameraLiveview.mockResolvedValue({ server: immis, command_id: 7 });
    f.api.completeCommand.mockImplementationOnce(() => new Promise<void>(resolve => { retire = resolve; }));
    try {
      await f.prepare(); await f.start(); await f.stop(); await flush(); expect(f.api.completeCommand).toHaveBeenCalledTimes(1);
      await f.prepare(); const callback = f.begin(); await flush();
      expect(f.api.startCameraLiveview).toHaveBeenCalledTimes(1); expect(createOwnedMediaSession).toHaveBeenCalledTimes(1);
      retire(); await flush(); expect(f.api.startCameraLiveview).toHaveBeenCalledTimes(2); expect(callback).toHaveBeenCalledTimes(1);
    } finally { retire?.(); await f.cleanup(); }
  });

  it('holds reopen behind cancelled allocation and late command cleanup', async () => {
    const f = fixture(); let allocate!: (value: { server: string; command_id: number }) => void; let retire!: () => void;
    f.api.startCameraLiveview.mockImplementationOnce(() => new Promise(resolve => { allocate = resolve; })).mockResolvedValue({ server: immis, command_id: 8 });
    f.api.completeCommand.mockImplementationOnce(() => new Promise<void>(resolve => { retire = resolve; }));
    try {
      await f.prepare(); const first = f.begin(); await flush(); await f.stop(); await f.prepare(); f.begin(); await flush();
      expect(f.api.startCameraLiveview).toHaveBeenCalledTimes(1); allocate({ server: immis, command_id: 7 }); await flush();
      expect(f.api.completeCommand).toHaveBeenCalledWith(1, 7, expect.any(Object)); expect(f.api.startCameraLiveview).toHaveBeenCalledTimes(1);
      expect(ImmisProxyServer).not.toHaveBeenCalled(); retire(); await flush();
      expect(f.api.startCameraLiveview).toHaveBeenCalledTimes(2); expect(first).toHaveBeenCalledTimes(1);
    } finally { retire?.(); await f.cleanup(); }
  });

  it.each(['stop', 'timeout'])('does not revive reopen cancelled by %s while retirement is pending', async reason => {
    const f = fixture(); let retire!: () => void;
    if (reason === 'timeout') fakeTime();
    f.api.startCameraLiveview.mockResolvedValue({ server: immis, command_id: 7 });
    f.api.completeCommand.mockImplementationOnce(() => new Promise<void>(resolve => { retire = resolve; }));
    try {
      await f.prepare(); await f.start(); await f.stop(); await flush(); await f.prepare();
      const callback = f.begin(); await flush(); if (reason === 'stop') await f.stop(); else await jest.advanceTimersByTimeAsync(4100);
      retire(); await flush(); expect(f.api.startCameraLiveview).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1); expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
    } finally { retire?.(); await f.cleanup(); }
  });

  it('bounds retries after asynchronous owned media failure', async () => {
    const f = fixture();
    try {
      await f.prepare(); const callback = f.begin(); await flush(); f.natives[0].fail(); await flush(); await f.stop();
      await f.prepare(); expect(await f.start()).toBeInstanceOf(Error); await f.stop();
      expect(callback).toHaveBeenCalledTimes(1); expect(f.api.startCameraLiveview).toHaveBeenCalledTimes(1);
    } finally { await f.cleanup(); }
  });

  it('bounds factory startup failures before any provider allocation', async () => {
    const f = fixture(); jest.mocked(createOwnedMediaSession).mockRejectedValueOnce(new Error('native startup failed'));
    try {
      await f.prepare(); expect(await f.start()).toBeInstanceOf(Error); await f.stop();
      await f.prepare(); expect(await f.start()).toBeInstanceOf(Error); await f.stop();
      expect(createOwnedMediaSession).toHaveBeenCalledTimes(1); expect(f.api.startCameraLiveview).not.toHaveBeenCalled();
    } finally { await f.cleanup(); }
  });

  it('opens owned IMMIS while monitoring is pending and fences late polling after STOP', async () => {
    const f = fixture(); let finishPoll!: (value: { complete: boolean }) => void; fakeTime();
    f.api.startCameraLiveview.mockResolvedValue({ server: immis, command_id: 7, polling_interval: 1, continue_interval: 30 });
    f.api.getCommandStatus.mockImplementation(() => new Promise(resolve => { finishPoll = resolve; }));
    try {
      await f.prepare(); await f.start(); await flush(); expect(ImmisProxyServer).toHaveBeenCalledWith(expect.objectContaining({ verifyTls: true }));
      const payload = Buffer.alloc(188); payload[0] = 0x47;
      await new Promise<void>((resolve, reject) => f.transports[0].consumers[0].write(payload, error => error ? reject(error) : resolve()));
      expect(f.natives[0].session.write).toHaveBeenCalledWith(payload); expect(f.api.getCommandStatus).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1100); expect(f.api.getCommandStatus).toHaveBeenCalledTimes(1);
      await f.stop(); finishPoll({ complete: false }); await flush(); expect(f.api.getCommandStatus).toHaveBeenCalledTimes(1);
      expect(ImmisProxyServer).toHaveBeenCalledTimes(1);
    } finally { await f.cleanup(); }
  });

  it('rejects duplicate preparation and frees a stopped preparation', async () => {
    const f = fixture();
    try { await f.prepare(); await expect(f.prepare()).rejects.toThrow('already owned'); await f.stop(); await f.prepare(); }
    finally { await f.cleanup(); }
  });

  it('polls immediately then uses polling_interval rather than Continue-button interval', async () => {
    const f = fixture(); fakeTime();
    f.api.startCameraLiveview.mockResolvedValue({ server: immis, command_id: 7, polling_interval: 1, continue_interval: 30 });
    try {
      await f.prepare(); await f.start(); await flush(); expect(f.api.getCommandStatus).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1100); expect(f.api.getCommandStatus).toHaveBeenCalledTimes(2);
      await f.stop(); await jest.advanceTimersByTimeAsync(1100); expect(f.api.getCommandStatus).toHaveBeenCalledTimes(2);
    } finally { await f.cleanup(); }
  });

  it('expires unused preparation after 30 seconds', async () => {
    const f = fixture(); fakeTime();
    try { await f.prepare(); await jest.advanceTimersByTimeAsync(30000); await f.prepare(); }
    finally { await f.cleanup(); }
  });

  it('late liveview cleans its command without retiring a newer preparation', async () => {
    const f = fixture(); let finish!: (value: { server: string; command_id: number }) => void;
    f.api.startCameraLiveview.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    try {
      await f.prepare(); const callback = f.begin(); await flush(); await f.stop(); await f.prepare(); finish({ server: immis, command_id: 7 }); await flush();
      expect(ImmisProxyServer).not.toHaveBeenCalled(); expect(callback).toHaveBeenCalledTimes(1);
      expect(f.api.completeCommand).toHaveBeenCalledWith(1, 7, expect.any(Object)); await expect(f.prepare()).rejects.toThrow('already owned');
    } finally { await f.cleanup(); }
  });

  it('retains session until media confirms closure and fences retired-generation callbacks', async () => {
    const f = fixture(); f.state.closeMedia = false;
    try {
      await f.prepare(); const callback = f.begin(); await flush();
      const options = jest.mocked(createOwnedMediaSession).mock.calls[0][0]; const previousProxy = f.transports[0]; const stopping = f.stop();
      await expect(f.prepare()).rejects.toThrow('already owned'); options.onSourceInfo!({ width: 640, height: 480, fpsNumerator: 15, fpsDenominator: 1 });
      previousProxy.transport.emit('error', new Error('late retired transport')); f.natives[0].close(); await stopping;
      expect(callback).toHaveBeenCalledTimes(1); expect(f.observed).not.toHaveBeenCalled();
      f.state.closeMedia = true; await f.prepare(); expect(await f.start()).toBeUndefined();
      options.onSourceInfo!({ width: 320, height: 240, fpsNumerator: 15, fpsDenominator: 1 });
      previousProxy.transport.emit('error', new Error('stale generation')); await flush(); expect(f.observed).not.toHaveBeenCalled();
      await expect(f.prepare()).rejects.toThrow('already owned');
    } finally { await f.cleanup(); }
  });

  it('reuses public ownership capacity across 100 confirmed start/stop cycles', async () => {
    const f = fixture();
    try {
      for (let cycle = 0; cycle < 100; cycle++) { await f.prepare(); const callback = f.begin(); await flush(); await f.stop(); expect(callback).toHaveBeenCalledTimes(1); }
      expect(createOwnedMediaSession).toHaveBeenCalledTimes(100); expect(ImmisProxyServer).toHaveBeenCalledTimes(100);
    } finally { await f.cleanup(); }
  });

  it('STOP during proxy startup adopts late closure without attaching a media consumer', async () => {
    const f = fixture(); let finish!: (value: string) => void; const proxy = ownedTransport(() => true); f.transports.push(proxy);
    proxy.transport.start.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    (ImmisProxyServer as unknown as jest.Mock).mockImplementationOnce(() => proxy.transport);
    try {
      await f.prepare(); const callback = f.begin(); await flush(); await f.stop(); await expect(f.prepare()).rejects.toThrow('already owned');
      finish('pipe:0'); await flush(); expect(proxy.transport.attachConsumer).not.toHaveBeenCalled(); expect(callback).toHaveBeenCalledTimes(1); await f.prepare();
    } finally { finish?.('pipe:0'); await f.cleanup(); }
  });

  it('retains ports and identity until private transport confirms closure', async () => {
    const f = fixture(); f.state.closeTransport = false;
    try {
      await f.prepare(); const callback = f.begin(); await flush(); const stopping = f.stop(); await expect(f.prepare()).rejects.toThrow('already owned');
      f.transports[0].close(); await stopping; await f.prepare(); expect(callback).toHaveBeenCalledTimes(1);
    } finally { await f.cleanup(); }
  });

  it('STOP during delayed codec factory owns late media until actual closure', async () => {
    const f = fixture(); let finish!: (session: OwnedMediaSession) => void; const late = ownedMedia(() => false); f.natives.push(late);
    jest.mocked(createOwnedMediaSession).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    try {
      await f.prepare(); const callback = f.begin(); await flush(); await f.stop(); await expect(f.prepare()).rejects.toThrow('already owned');
      finish(late.session); await flush(); expect(late.session.stop).toHaveBeenCalled(); expect(f.api.startCameraLiveview).not.toHaveBeenCalled();
      await expect(f.prepare()).rejects.toThrow('already owned'); late.close(); await flush(); await f.prepare(); expect(callback).toHaveBeenCalledTimes(1);
    } finally { finish?.(late.session); await f.cleanup(); }
  });

  it('STOP during PREPARE owns and releases late port allocations', async () => {
    const f = fixture(); mockDelayBind = true;
    try {
      const prepared = f.prepare(); await flush(); await f.stop(); await expect(f.prepare()).rejects.toThrow('already owned'); expect(mockBinds).toHaveLength(1);
      mockDelayBind = false; mockBinds.shift()!(); await expect(prepared).rejects.toThrow('cancelled'); await f.prepare(); expect(createOwnedMediaSession).not.toHaveBeenCalled();
      expect(f.preparationCallbacks.every(callback => callback.mock.calls.length === 1)).toBe(true);
    } finally { mockDelayBind = false; mockBinds.splice(0).forEach(complete => complete()); await f.cleanup(); }
  });

  it('enforces maxStreams across IDs and admits replacement after actual closure', async () => {
    const f = fixture(); f.state.closeMedia = false;
    try {
      await f.prepare('first'); await f.start('first'); await f.prepare('second'); expect(await f.start('second')).toBeInstanceOf(Error);
      expect(f.api.startCameraLiveview).toHaveBeenCalledTimes(1); const stopping = f.stop('first'); await f.prepare('third');
      expect(await f.start('third')).toBeInstanceOf(Error); expect(createOwnedMediaSession).toHaveBeenCalledTimes(1);
      f.natives[0].close(); await stopping; f.state.closeMedia = true; await f.prepare('replacement'); expect(await f.start('replacement')).toBeUndefined();
    } finally { await f.cleanup(); }
  });

  it('RTSPS broker closure participates in generation reservation', async () => {
    const f = fixture(); f.api.startCameraLiveview.mockResolvedValue({ server: rtsps }); let finish!: () => void;
    const broker = { whenClosed: new Promise<void>(resolve => { finish = resolve; }), start: jest.fn(async () => {}), stop: jest.fn(async () => {}) };
    (OwnedRtspBroker as unknown as jest.Mock).mockImplementationOnce(() => broker);
    try {
      await f.prepare(); const callback = f.begin(); await flush(); const stopping = f.stop(); await expect(f.prepare()).rejects.toThrow('already owned');
      expect(broker.stop).toHaveBeenCalled(); finish(); await stopping; await f.prepare(); expect(callback).toHaveBeenCalledTimes(1);
    } finally { finish?.(); await f.cleanup(); }
  });
});
