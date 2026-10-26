import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { test } from '@jest/globals';
import { BlinkCameraSource, createCameraControllerOptions, resolveStreamingConfig, type BlinkCameraStreamingConfigInput } from '../src/accessories/camera-source';
import { createOwnedMediaSession, type OwnedMediaSession } from '../src/accessories/media-session';
import { loadPackagedMediaWorker } from '../src/accessories/media-worker-artifact';
import { ImmisProxyServer } from '../src/blink-api/immis-proxy';
import { OwnedRtspBroker } from '../src/blink-api/rtsp-broker';
import type { BlinkApi } from '../src/blink-api';
import type { HAP, PrepareStreamRequest, StreamingRequest } from 'homebridge';
import { createHap } from './helpers/homebridge';
import type { OutputQualityProfile } from '../src/accessories/stream-quality';

jest.mock('../src/accessories/media-session', () => ({ createOwnedMediaSession: jest.fn() }));
jest.mock('../src/accessories/media-worker-artifact', () => ({ loadPackagedMediaWorker: jest.fn(() => '/verified/worker') }));
jest.mock('node:child_process', () => ({ spawn: jest.fn(() => { throw new Error('Unexpected media CLI'); }) }));
jest.mock('../src/blink-api/immis-proxy', () => ({ ImmisProxyServer: jest.fn() }));
jest.mock('../src/blink-api/rtsp-broker', () => ({ OwnedRtspBroker: jest.fn() }));
jest.mock('node:dgram', () => {
  let port = 40000;
  return { createSocket: () => ({ once: jest.fn(), bind: (_port: number, callback: () => void) => globalThis.queueMicrotask(callback),
    address: () => ({ port: port++ }), close: (callback?: () => void) => callback?.() }) };
});

function setup(audio = false, outputQuality: OutputQualityProfile = 'auto', beforeLiveview?: () => Promise<void>) {
  let closed!: () => void;
  const whenClosed = new Promise<void>(resolve => { closed = resolve; });
  const native: OwnedMediaSession = { whenClosed, failed: false,
    audioTiming: { initialPaddingSamples: 0, skipStartSamples: 0, skipEndSamples: 0 },
    write: jest.fn(async () => {}), end: jest.fn(async () => {}), stop: jest.fn(async () => { closed(); }) };
  (createOwnedMediaSession as jest.Mock).mockResolvedValue(native);
  (loadPackagedMediaWorker as jest.Mock).mockReturnValue('/verified/worker');
  let transportClosed!: () => void;
  const transport = Object.assign(new EventEmitter(), { whenClosed: new Promise<void>(resolve => { transportClosed = resolve; }),
    start: jest.fn(async () => 'pipe:0'), attachConsumer: jest.fn(), retire: jest.fn(() => transportClosed()), stop: jest.fn(() => transportClosed()) });
  (ImmisProxyServer as unknown as jest.Mock).mockImplementation(() => transport);
  let brokerClosed!: () => void;
  const broker = { whenClosed: new Promise<void>(resolve => { brokerClosed = resolve; }),
    start: jest.fn(async () => {}), stop: jest.fn(async () => { brokerClosed(); }) };
  (OwnedRtspBroker as unknown as jest.Mock).mockImplementation(() => broker);
  const api = { startCameraLiveview: jest.fn(async () => ({ server: 'immis://8.8.8.8:443/private?client_id=1&token=DUMMY_CAPABILITY', command_id: 7 })),
    completeCommand: jest.fn(async () => ({})), getCommandStatus: jest.fn(async () => ({ complete: false, status: 'running' })),
    continueCommand: jest.fn(async () => ({})) };
  const log = jest.fn(); const observed = jest.fn();
  const source = new BlinkCameraSource(api as unknown as BlinkApi, createHap() as unknown as HAP, 1, 2, 'camera', 'serial',
    () => undefined, () => true, log, { audio: { enabled: audio }, video: { outputQuality } }, log, beforeLiveview, observed);
  const request = { sessionID: 'secure-generation', targetAddress: '192.168.1.5', addressVersion: 'ipv4',
    video: { port: 5000, srtpCryptoSuite: 0, srtp_key: Buffer.alloc(16, 7), srtp_salt: Buffer.alloc(14, 9) },
    audio: { port: 5002, srtpCryptoSuite: 0, srtp_key: Buffer.alloc(16, 3), srtp_salt: Buffer.alloc(14, 5) } } as unknown as PrepareStreamRequest;
  const start = { type: 'start', sessionID: request.sessionID,
    video: { width: 640, height: 360, fps: 15, max_bit_rate: 300, pt: 99, mtu: 1378, profile: 0, level: 0 },
    ...(audio ? { audio: { codec: 'OPUS', sample_rate: 16, channel: 1, max_bit_rate: 32, pt: 110, packet_time: 20 } } : {}) } as unknown as Extract<StreamingRequest, { type: 'start' }>;
  const prepare = () => new Promise<void>((resolve, reject) => source.prepareStream(request, error => error ? reject(error) : resolve()));
  const run = () => new Promise<Error | undefined>(resolve => source.handleStreamRequest(start, error => resolve(error)));
  const stop = () => new Promise<void>(resolve => source.handleStreamRequest({ type: 'stop', sessionID: request.sessionID } as unknown as StreamingRequest, () => resolve()));
  return { native, transport, broker, api, log, observed, source, request, start, prepare, run, stop };
}

test('camera streaming routes private media and keys through owned capabilities without a media CLI', async () => {
  jest.clearAllMocks(); const f = setup();
  try {
    await f.prepare(); expect(await f.run()).toBeUndefined();
    expect(createOwnedMediaSession).toHaveBeenCalledTimes(1);
    const options = (createOwnedMediaSession as jest.Mock).mock.calls[0][0];
    expect(options.workerPath).toBe('/verified/worker');
    expect(options.video.output.key).toEqual(Buffer.alloc(16, 7));
    expect(options.video.output.salt).toEqual(Buffer.alloc(14, 9));
    expect(JSON.stringify(options)).not.toContain('DUMMY_CAPABILITY');
    expect(f.transport.attachConsumer).toHaveBeenCalledTimes(1);
    expect(spawn).not.toHaveBeenCalled(); expect(JSON.stringify(f.log.mock.calls)).not.toContain('DUMMY_CAPABILITY');
  } finally { await f.stop(); }
});
test('native codec advertisement is independent of external CLI capability metadata', () => {
  const hap = createHap() as unknown as HAP;
  const delegate = { prepareStream: jest.fn(), handleStreamRequest: jest.fn(), handleSnapshotRequest: jest.fn() };
  const options = createCameraControllerOptions(hap, delegate,
    { audio: { enabled: true, codec: 'opus', aacEldEncoder: 'libfdk_aac' } } as unknown as BlinkCameraStreamingConfigInput);
  expect(options.streamingOptions?.audio?.codecs?.map(codec => codec.type)).toEqual([hap.AudioStreamingCodecType.OPUS]);
  expect(options.streamingOptions?.audio?.twoWayAudio).toBe(false);
});
test.each(['aac-eld', 'unsupported'])('unsupported preference %s requires explicit configuration migration', codec => {
  expect(() => resolveStreamingConfig({ audio: { codec } } as unknown as BlinkCameraStreamingConfigInput)).toThrow('Unsupported audio codec');
});
test('a missing or modified packaged worker is refused before vendor allocation', async () => {
  jest.clearAllMocks(); const f = setup();
  (loadPackagedMediaWorker as jest.Mock).mockImplementation(() => { throw new Error('Packaged media worker unavailable'); });
  try {
    await f.prepare(); expect(await f.run()).toBeInstanceOf(Error);
    expect(f.api.startCameraLiveview).not.toHaveBeenCalled(); expect(createOwnedMediaSession).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  } finally { await f.stop(); }
});
test('restored AAC-ELD selection is refused before a vendor command', async () => {
  jest.clearAllMocks(); const f = setup(true); f.start.audio.codec = (createHap() as unknown as HAP).AudioStreamingCodecType.AAC_ELD;
  try {
    await f.prepare(); expect(await f.run()).toBeInstanceOf(Error);
    expect(f.api.startCameraLiveview).not.toHaveBeenCalled(); expect(createOwnedMediaSession).not.toHaveBeenCalled();
  } finally { await f.stop(); }
});
test('RTSPS capabilities reach only the owned broker and retire with their generation', async () => {
  jest.clearAllMocks(); const f = setup();
  f.api.startCameraLiveview.mockResolvedValue({ server: 'rtsps://8.8.8.8:332/private?blinkRTSP=1&token=DUMMY_CAPABILITY', command_id: 7 });
  try {
    await f.prepare(); expect(await f.run()).toBeUndefined();
    expect(OwnedRtspBroker).toHaveBeenCalledTimes(1); expect(ImmisProxyServer).not.toHaveBeenCalled();
    expect(f.broker.start).toHaveBeenCalledTimes(1); expect(spawn).not.toHaveBeenCalled();
    await f.stop(); expect(f.broker.stop).toHaveBeenCalled(); expect(f.native.stop).toHaveBeenCalled();
    expect(JSON.stringify(f.log.mock.calls)).not.toContain('DUMMY_CAPABILITY');
  } finally { await f.stop(); }
});
test('source geometry reaches its current owner and late observations are fenced', async () => {
  jest.clearAllMocks(); const f = setup();
  try {
    await f.prepare(); expect(await f.run()).toBeUndefined();
    const options = (createOwnedMediaSession as jest.Mock).mock.calls[0][0];
    options.onSourceInfo({ width: 2560, height: 1440, fpsNumerator: 30, fpsDenominator: 1 });
    expect(f.observed).toHaveBeenCalledWith({ width: 2560, height: 1440, fps: 30 });
    await f.stop(); options.onSourceInfo({ width: 640, height: 360, fpsNumerator: 15, fpsDenominator: 1 });
    expect(f.observed).toHaveBeenCalledTimes(1);
  } finally { await f.stop(); }
});
test('STOP during codec startup fences a late owner and preserves the occupied generation until closure', async () => {
  jest.clearAllMocks(); const f = setup(); let finish!: (session: OwnedMediaSession) => void;
  (createOwnedMediaSession as jest.Mock).mockImplementation(() => new Promise<OwnedMediaSession>(resolve => { finish = resolve; }));
  try {
    await f.prepare(); const started = f.run();
    for (let i = 0; i < 16; i++) await Promise.resolve();
    expect(createOwnedMediaSession).toHaveBeenCalledTimes(1);
    await f.stop(); expect(await started).toBeInstanceOf(Error);
    await expect(f.prepare()).rejects.toThrow('already owned');
    finish(f.native);
    for (let i = 0; i < 24; i++) await Promise.resolve();
    expect(f.native.stop).toHaveBeenCalled(); expect(f.api.startCameraLiveview).not.toHaveBeenCalled();
    await f.prepare();
  } finally { await f.stop(); }
});
test.each(['720p15', '360p15'] as const)('%s caps the owned encoder at 15 fps for a valid 30 fps selection', async profile => {
  jest.clearAllMocks(); const f = setup(false, profile);
  f.start.video.width = profile === '720p15' ? 1280 : 640;
  f.start.video.height = profile === '720p15' ? 720 : 360; f.start.video.fps = 30;
  try {
    await f.prepare(); expect(await f.run()).toBeUndefined();
    expect((createOwnedMediaSession as jest.Mock).mock.calls[0][0].video.output.fps).toBe(15);
  } finally { await f.stop(); }
});
test('STOP during source configuration prevents late vendor allocation', async () => {
  jest.clearAllMocks(); let release!: () => void;
  const configure = jest.fn(() => new Promise<void>(resolve => { release = resolve; }));
  const f = setup(false, 'auto', configure);
  try {
    await f.prepare(); const started = f.run(); expect(configure).toHaveBeenCalledTimes(1);
    await f.stop(); expect(await started).toBeInstanceOf(Error); release();
    for (let i = 0; i < 16; i++) await Promise.resolve();
    expect(createOwnedMediaSession).not.toHaveBeenCalled(); expect(f.api.startCameraLiveview).not.toHaveBeenCalled();
  } finally { await f.stop(); }
});
test.each(['OPUS', 'PCMA', 'PCMU'] as const)('%s selection carries only private native audio configuration', async selected => {
  jest.clearAllMocks(); const f = setup(true);
  const hap = createHap() as unknown as HAP;
  const codecs = { OPUS: hap.AudioStreamingCodecType.OPUS, PCMA: hap.AudioStreamingCodecType.PCMA, PCMU: hap.AudioStreamingCodecType.PCMU };
  f.start.audio.codec = codecs[selected];
  try {
    await f.prepare(); expect(await f.run()).toBeUndefined();
    const options = (createOwnedMediaSession as jest.Mock).mock.calls[0][0];
    expect(options.audio.codec).toBe(selected.toLowerCase());
    expect(options.audio.rate).toBe(selected === 'OPUS' ? 16000 : 8000);
    expect(options.audio.output.key).toEqual(Buffer.alloc(16, 3));
    expect(options.audio.output.salt).toEqual(Buffer.alloc(14, 5));
    expect(options.audio.packetTime).toBe(selected === 'OPUS' ? 20 : undefined);
    expect(spawn).not.toHaveBeenCalled();
  } finally { await f.stop(); }
});
test('unsupported crypto and audio channel selections acquire no vendor capability', async () => {
  for (const invalid of ['crypto', 'channels'] as const) {
    jest.clearAllMocks(); const f = setup(true);
    if (invalid === 'crypto') f.request.audio.srtpCryptoSuite = (createHap() as unknown as HAP).SRTPCryptoSuites.AES_CM_256_HMAC_SHA1_80;
    else f.start.audio.channel = 2;
    try {
      await f.prepare(); expect(await f.run()).toBeInstanceOf(Error);
      expect(createOwnedMediaSession).not.toHaveBeenCalled(); expect(f.api.startCameraLiveview).not.toHaveBeenCalled();
    } finally { await f.stop(); }
  }
});
test('codec startup errors expose fixed diagnostics and retire without remote allocation', async () => {
  jest.clearAllMocks(); const f = setup();
  (createOwnedMediaSession as jest.Mock).mockRejectedValue(new Error('DUMMY_PRIVATE_ERROR'));
  try {
    await f.prepare(); const error = await f.run(); expect(error).toBeInstanceOf(Error);
    expect(error?.message).not.toContain('DUMMY_PRIVATE_ERROR'); expect(JSON.stringify(f.log.mock.calls)).not.toContain('DUMMY_PRIVATE_ERROR');
    expect(f.api.startCameraLiveview).not.toHaveBeenCalled(); await f.prepare();
  } finally { await f.stop(); }
});
test('natural codec closure retires its transport and remote command', async () => {
  jest.clearAllMocks(); const f = setup();
  try {
    await f.prepare(); expect(await f.run()).toBeUndefined();
    await f.native.stop();
    for (let i = 0; i < 24; i++) await Promise.resolve();
    expect(f.transport.retire).toHaveBeenCalled(); expect(f.api.completeCommand).toHaveBeenCalledTimes(1);
    await f.prepare();
  } finally { await f.stop(); }
});
