import { testResponse } from './helpers/response';
import { HAP, PlatformAccessory, PrepareStreamRequest, PrepareStreamResponse, SnapshotRequest, StreamingRequest } from 'homebridge';
import { CameraAccessory } from '../src/accessories/camera';
import { DoorbellAccessory } from '../src/accessories/doorbell';
import { NetworkAccessory } from '../src/accessories/network';
import { OwlAccessory } from '../src/accessories/owl';
import { BlinkCamerasPlatform } from '../src/platform';
import { BlinkCamera, BlinkDoorbell, BlinkNetwork, BlinkOwl } from '../src/types';
import { createHap, createLogger, MockAccessory } from './helpers/homebridge';
import { BlinkCameraSource, createCameraControllerOptions, resolveStreamingConfig } from '../src/accessories/camera-source';
import { BlinkApi } from '../src/blink-api';
import { ImmisProxyServer } from '../src/blink-api/immis-proxy';
import { AuthStateChangedError } from '../src/blink-api/auth-storage';
import { BlinkTokenRefreshError } from '../src/blink-api/auth';
import { BlinkHttpError } from '../src/blink-api/http';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createOwnedMediaSession, type OwnedMediaSession } from '../src/accessories/media-session';
import { loadPackagedMediaWorker } from '../src/accessories/media-worker-artifact';
import { Characteristic as HapCharacteristic } from 'hap-nodejs';
import { setImmediate as nextTurn } from 'node:timers/promises';

jest.mock('../src/accessories/media-session', () => ({ createOwnedMediaSession: jest.fn() }));
jest.mock('../src/accessories/media-worker-artifact', () => ({ loadPackagedMediaWorker: jest.fn() }));
jest.mock('../src/blink-api/immis-proxy', () => ({ ImmisProxyServer: jest.fn() }));
jest.mock('node:child_process', () => ({ spawn: jest.fn(() => { throw new Error('Unexpected media CLI'); }) }));
jest.mock('node:dgram', () => {
  let port = 40000;
  return { createSocket: () => ({ once: jest.fn(),
    bind: (_port: number, callback: () => void) => globalThis.queueMicrotask(callback),
    address: () => ({ port: port++ }), close: (callback?: () => void) => callback?.() }) };
});

type PlatformStub = Pick<BlinkCamerasPlatform,
  'Service' | 'Characteristic' | 'apiClient' | 'log' | 'api' | 'streamingConfig' | 'isOperational' | 'getDeviceInputQuality' | 'isTemperatureEnabled'>;

// Capabilities stand in for the native codec and vendor transport. Public HAP
// callbacks still own preparation, selection, cancellation and reservation.
function streamingRuntime(source: BlinkCameraSource) {
  const state = { closeMedia: true };
  const media: Array<{ session: OwnedMediaSession; close: () => void }> = [];
  const transports: Array<ReturnType<typeof transport>> = [];
  const ids = new Set<string>();
  function transport() {
    let close!: () => void;
    return Object.assign(new EventEmitter(), {
      whenClosed: new Promise<void>(resolve => { close = resolve; }),
      start: jest.fn(async () => 'pipe:0'), attachConsumer: jest.fn(),
      retire: jest.fn(() => close()), stop: jest.fn(() => close()),
    });
  }
  jest.mocked(loadPackagedMediaWorker).mockReturnValue('/verified/worker');
  jest.mocked(createOwnedMediaSession).mockImplementation(async () => {
    let close!: () => void;
    const session: OwnedMediaSession = {
      whenClosed: new Promise<void>(resolve => { close = resolve; }), failed: false,
      audioTiming: { initialPaddingSamples: 0, skipStartSamples: 0, skipEndSamples: 0 },
      write: jest.fn(async () => {}), end: jest.fn(async () => {}),
      stop: jest.fn(async () => { if (state.closeMedia) close(); }),
    };
    media.push({ session, close: () => close() });
    return session;
  });
  (ImmisProxyServer as unknown as jest.Mock).mockImplementation(() => {
    const proxy = transport(); transports.push(proxy); return proxy;
  });
  const prepare = (id = 'session') => {
    ids.add(id);
    return new Promise<PrepareStreamResponse>((resolve, reject) => source.prepareStream({ sessionID: id,
      targetAddress: '192.168.1.50', addressVersion: 'ipv4',
      video: { port: 5000, srtpCryptoSuite: 0, srtp_key: Buffer.alloc(16, 1), srtp_salt: Buffer.alloc(14, 2) },
      audio: { port: 5001, srtpCryptoSuite: 0, srtp_key: Buffer.alloc(16, 3), srtp_salt: Buffer.alloc(14, 4) },
    } as unknown as PrepareStreamRequest, (error, response) => error ? reject(error) : resolve(response!)));
  };
  const start = (id = 'session', audio = false) => new Promise<Error | undefined>(resolve => source.handleStreamRequest({
    type: 'start', sessionID: id,
    video: { width: 640, height: 360, fps: 15, max_bit_rate: 300, pt: 99, mtu: 1378, profile: 0, level: 0 },
    ...(audio ? { audio: { codec: 'OPUS', channel: 1, sample_rate: 24, packet_time: 40, max_bit_rate: 24, pt: 110 } } : {}),
  } as unknown as StreamingRequest, error => resolve(error)));
  const stop = (id = 'session') => new Promise<void>(resolve => source.handleStreamRequest({ type: 'stop', sessionID: id } as StreamingRequest, () => resolve()));
  return { state, media, transports, prepare, start, stop, async cleanup() {
    media.forEach(item => item.close()); transports.forEach(proxy => proxy.stop());
    for (const id of ids) await stop(id);
  } };
}

describe('Accessory handlers', () => {
  beforeEach(() => { jest.clearAllMocks(); });
  it('keeps the balanced software preset for absent or invalid settings', () => {
    expect(resolveStreamingConfig().video.softwarePreset).toBe('veryfast');
    const invalid = { video: { softwarePreset: 'veryfast' as const } };
    Reflect.set(invalid.video, 'softwarePreset', 'invalid');
    expect(resolveStreamingConfig(invalid).video.softwarePreset).toBe('veryfast');
  });
  it.each([
    new BlinkTokenRefreshError('temporary'),
    new BlinkTokenRefreshError('storage'),
    new BlinkHttpError('Unauthorized', 401, '', 'https://rest-prod.immedia-semi.com/', 'POST'),
    new Error('Unrelated failure containing 409'),
  ])('stops thumbnail download when refresh fails with %s', async (error) => {
    const headers = jest.fn();
    const source = new BlinkCameraSource({
      requestCameraThumbnail: jest.fn().mockRejectedValue(error), getAuthHeaders: headers,
    } as unknown as BlinkApi, createHap() as unknown as HAP, 1, 2, 'camera', 'serial',
    () => 'https://rest-prod.immedia-semi.com/thumbnail.jpg', () => true, jest.fn());
    const callback = jest.fn();
    await source.handleSnapshotRequest({ width: 640, height: 480 } as SnapshotRequest, callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ hapStatus: -70402 }));
    expect(headers).not.toHaveBeenCalled();
  });

  it('downloads the existing thumbnail only for a typed busy response', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue(testResponse({ ok: true, arrayBuffer: async () => new Uint8Array([7]).buffer }));
    try {
      const source = new BlinkCameraSource({
        requestCameraThumbnail: jest.fn().mockRejectedValue(new BlinkHttpError('Busy', 409, '',
          'https://rest-prod.immedia-semi.com/', 'POST')),
        getAuthHeaders: jest.fn().mockReturnValue({}),
      } as unknown as BlinkApi, createHap() as unknown as HAP, 1, 2, 'camera', 'serial',
      () => 'https://rest-prod.immedia-semi.com/thumbnail.jpg', () => true, jest.fn());
      const callback = jest.fn();
      await source.handleSnapshotRequest({ width: 640, height: 480 } as SnapshotRequest, callback);
      expect(callback).toHaveBeenCalledWith(undefined, Buffer.from([7]));
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('coalesces concurrent HomeKit and manual snapshot refreshes', async () => {
    let finishThumbnailRequest!: (value: { command_id: number; captureOutcome: string; thumbnail: string }) => void;
    const thumbnailRequest = new Promise<{ command_id: number; captureOutcome: string; thumbnail: string }>((resolve) => {
      finishThumbnailRequest = resolve;
    });
    const requestCameraThumbnail = jest.fn().mockReturnValue(thumbnailRequest);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue(testResponse({
      ok: true,
      arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer,
    })) as unknown as typeof fetch;

    try {
      const source = new BlinkCameraSource({
        requestCameraThumbnail,
        pollCommand: jest.fn().mockResolvedValue({ complete: true }),
        getAuthHeaders: jest.fn().mockReturnValue({}),
      } as unknown as BlinkApi, createHap() as unknown as HAP, 1, 2, 'camera', 'serial',
      () => 'https://rest-prod.immedia-semi.com/thumbnail.jpg', () => true, jest.fn(),
      { snapshotCacheTTL: 0 });
      const firstCallback = jest.fn();
      const secondCallback = jest.fn();

      const first = source.handleSnapshotRequest({ width: 640, height: 480 } as SnapshotRequest, firstCallback);
      const second = source.handleSnapshotRequest({ width: 320, height: 240 } as SnapshotRequest, secondCallback);
      const manual = source.refreshSnapshotCache();

      expect(requestCameraThumbnail).toHaveBeenCalledTimes(1);
      finishThumbnailRequest({ command_id: 10, captureOutcome: 'completed', thumbnail: 'https://rest-prod.immedia-semi.com/thumbnail.jpg' });
      await Promise.all([first, second, manual]);

      expect(requestCameraThumbnail).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(firstCallback).toHaveBeenCalledWith(undefined, Buffer.from([4, 5, 6]));
      expect(secondCallback).toHaveBeenCalledWith(undefined, Buffer.from([4, 5, 6]));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('shares snapshot failures, suppresses retry commands during cooldown, then recovers', async () => {
    let now = 1_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const failure = new Error('temporary transport failure');
    const requestCameraThumbnail = jest.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue({ command_id: 11, captureOutcome: 'completed', thumbnail: 'https://rest-prod.immedia-semi.com/thumbnail.jpg' });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue(testResponse({
      ok: true,
      arrayBuffer: async () => new Uint8Array([9]).buffer,
    })) as unknown as typeof fetch;

    try {
      const errorLog = jest.fn();
      const source = new BlinkCameraSource({
        requestCameraThumbnail,
        pollCommand: jest.fn().mockResolvedValue({ complete: true }),
        getAuthHeaders: jest.fn().mockReturnValue({}),
      } as unknown as BlinkApi, createHap() as unknown as HAP, 1, 2, 'camera', 'serial',
      () => 'https://rest-prod.immedia-semi.com/thumbnail.jpg', () => true, jest.fn(),
      { snapshotCacheTTL: 0 }, errorLog);
      const firstCallback = jest.fn();
      const secondCallback = jest.fn();
      const cooldownCallback = jest.fn();
      const recoveredCallback = jest.fn();

      await Promise.all([
        source.handleSnapshotRequest({ width: 640, height: 480 } as SnapshotRequest, firstCallback),
        source.handleSnapshotRequest({ width: 320, height: 240 } as SnapshotRequest, secondCallback),
      ]);

      expect(requestCameraThumbnail).toHaveBeenCalledTimes(1);
      expect(firstCallback).toHaveBeenCalledWith(expect.objectContaining({ hapStatus: -70402 }));
      expect(secondCallback).toHaveBeenCalledWith(expect.objectContaining({ hapStatus: -70402 }));
      expect(errorLog).toHaveBeenCalledTimes(1);

      now += 14_999;
      await source.handleSnapshotRequest({ width: 640, height: 480 } as SnapshotRequest, cooldownCallback);
      expect(cooldownCallback).toHaveBeenCalledWith(expect.objectContaining({ hapStatus: -70402 }));
      expect(requestCameraThumbnail).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalledTimes(1);
      await expect(source.refreshSnapshotCache()).rejects.toBe(failure);
      expect(requestCameraThumbnail).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalledTimes(1);

      now += 1;
      await source.handleSnapshotRequest({ width: 640, height: 480 } as SnapshotRequest, recoveredCallback);
      expect(requestCameraThumbnail).toHaveBeenCalledTimes(2);
      expect(recoveredCallback).toHaveBeenCalledWith(undefined, Buffer.from([9]));
    } finally {
      nowSpy.mockRestore();
      globalThis.fetch = originalFetch;
    }
  });

  it.each(['snapshot', 'manual refresh'])('rejects a late %s image after an offline update and recovers', async (operation) => {
    let available = true;
    let goOfflineDuringDownload = true;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockImplementation(async () => (testResponse({
      ok: true,
      arrayBuffer: async () => {
        if (goOfflineDuringDownload) {
          available = false;
        }
        return new Uint8Array([1, 2, 3]).buffer;
      },
    }))) as unknown as typeof fetch;
    const source = new BlinkCameraSource({
      requestCameraThumbnail: jest.fn().mockResolvedValue({ command_id: 10, captureOutcome: 'completed', thumbnail: 'https://rest-prod.immedia-semi.com/thumbnail.jpg' }),
      pollCommand: jest.fn().mockResolvedValue({ complete: true }),
      getAuthHeaders: jest.fn().mockReturnValue({}),
    } as unknown as BlinkApi, createHap() as unknown as HAP, 1, 2, 'camera', 'serial',
    () => 'https://rest-e006.immedia-semi.com/thumbnail.jpg', () => available, jest.fn(),
    { persistSnapshotCache: true });
    try {
      if (operation === 'snapshot') {
        const callback = jest.fn();
        await source.handleSnapshotRequest({ width: 640, height: 360 } as SnapshotRequest, callback);
        expect(callback).toHaveBeenCalledWith(expect.any(Error));
      } else {
        await expect(source.refreshSnapshotCache()).rejects.toThrow('unavailable');
      }
      available = true;
      goOfflineDuringDownload = false;
      const recovered = jest.fn();
      await source.handleSnapshotRequest({ width: 640, height: 360 } as SnapshotRequest, recovered);
      expect(recovered).toHaveBeenCalledWith(undefined, Buffer.from([1, 2, 3]));
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it.each([undefined, '', 'online', 'done', 'new-provider-status'])('does not infer offline from status %s and recovers after offline', (status) => {
    const { hap, platform } = buildPlatform();
    const accessory = new MockAccessory('Camera', 'uuid-camera', hap);
    const device: BlinkCamera = { id: 2, network_id: 1, name: 'Camera', enabled: true, status: 'offline' };
    const handler = new CameraAccessory(platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory, device);
    handler.updateState({ ...device, status });
    expect(accessory.getService(hap.Service.MotionSensor)
      ?.getCharacteristic(hap.Characteristic.StatusActive).value).toBe(true);
  });

  it('does not fetch a thumbnail with retained credentials after logout', async () => {
    const headers = jest.fn();
    const source = new BlinkCameraSource({
      requestCameraThumbnail: jest.fn().mockRejectedValue(new AuthStateChangedError()),
      getAuthHeaders: headers,
    } as unknown as BlinkApi, createHap() as unknown as HAP, 1, 2, 'camera', 'serial',
    () => 'https://rest-prod.immedia-semi.com/thumbnail.jpg', () => true, jest.fn());
    const callback = jest.fn();
    await source.handleSnapshotRequest({ width: 640, height: 480 } as SnapshotRequest, callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ hapStatus: -70402 }));
    expect(headers).not.toHaveBeenCalled();
  });
  it.each([
    'https://attacker.example/thumbnail.jpg',
    '//attacker.example/thumbnail.jpg',
    'http://rest-prod.immedia-semi.com/thumbnail.jpg',
    'https://user:password@rest-prod.immedia-semi.com/thumbnail.jpg',
    'https://rest-prod.immedia-semi.com:8443/thumbnail.jpg',
    'https://rest-prod.immedia-semi.com.attacker.example/thumbnail.jpg',
  ])('rejects an untrusted thumbnail destination before attaching credentials: %s', async (url) => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    try {
      const headers = jest.fn().mockReturnValue({ Authorization: 'Bearer secret' });
      const source = new BlinkCameraSource({
        requestCameraThumbnail: jest.fn().mockResolvedValue({ captureOutcome: 'completed', thumbnail: url }),
        getSharedRestRootUrl: () => 'https://rest-prod.immedia-semi.com/',
        getAuthHeaders: headers,
      } as unknown as BlinkApi, createHap() as unknown as HAP, 1, 2, 'camera', 'serial',
      () => url, () => true, jest.fn());
      const callback = jest.fn();
      await source.handleSnapshotRequest({ width: 640, height: 480 } as SnapshotRequest, callback);
      expect(callback).toHaveBeenCalledWith(expect.any(Error));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(headers).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('downloads relative REST thumbnails with redirects disabled and bounded safe failures', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn().mockRejectedValue(new Error('token=secret123'));
    globalThis.fetch = fetchMock;
    try {
      const errorLog = jest.fn();
      const source = new BlinkCameraSource({
        requestCameraThumbnail: jest.fn().mockResolvedValue({ captureOutcome: 'completed', thumbnail: '/media/thumbnail.jpg' }),
        getSharedRestRootUrl: () => 'https://rest-prde.immedia-semi.com/',
        getAuthHeaders: () => ({ Authorization: 'Bearer secret123' }),
      } as unknown as BlinkApi, createHap() as unknown as HAP, 1, 2, 'camera', 'serial',
      () => '/media/thumbnail.jpg', () => true, jest.fn(), {}, errorLog);
      const callback = jest.fn();
      await source.handleSnapshotRequest({ width: 640, height: 480 } as SnapshotRequest, callback);
      expect(fetchMock).toHaveBeenCalledWith('https://rest-prde.immedia-semi.com/media/thumbnail.jpg',
        expect.objectContaining({ redirect: 'error', signal: expect.any(globalThis.AbortSignal) }));
      expect(String(callback.mock.calls[0][0])).not.toContain('secret123');
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('secret123');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('reports bounded DNS diagnostics once when snapshot download retries are cooling down', async () => {
    const originalFetch = globalThis.fetch;
    const nativeFailure = Object.assign(new Error('getaddrinfo ENOTFOUND token=secret123'), {
      code: 'ENOTFOUND',
    });
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed', { cause: nativeFailure }));

    try {
      const errorLog = jest.fn();
      const source = new BlinkCameraSource({
        requestCameraThumbnail: jest.fn().mockResolvedValue({ captureOutcome: 'completed', thumbnail: 'https://rest-prde.immedia-semi.com/media/thumbnail.jpg?token=secret123' }),
        getAuthHeaders: jest.fn().mockReturnValue({}),
      } as unknown as BlinkApi, createHap() as unknown as HAP, 1, 2, 'camera', 'serial',
      () => 'https://rest-prde.immedia-semi.com/media/thumbnail.jpg?token=secret123',
      () => true, jest.fn(), { snapshotCacheTTL: 0 }, errorLog);
      const firstCallback = jest.fn();
      const cooldownCallback = jest.fn();

      await source.handleSnapshotRequest({ width: 640, height: 480 } as SnapshotRequest, firstCallback);
      await source.handleSnapshotRequest({ width: 640, height: 480 } as SnapshotRequest, cooldownCallback);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(firstCallback).toHaveBeenCalledWith(expect.any(Error));
      expect(cooldownCallback).toHaveBeenCalledWith(expect.objectContaining({ hapStatus: -70402 }));
      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining(
        'type=dns code=ENOTFOUND hostname=rest-prde.immedia-semi.com elapsedMs=',
      ));
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('secret123');
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('/media/thumbnail.jpg');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('reports snapshot failures outside debug logs while leaving routine traces in debug', async () => {
    const trace = jest.fn();
    const error = jest.fn();
    const source = new BlinkCameraSource(
      { requestCameraThumbnail: jest.fn().mockResolvedValue({ captureOutcome: 'completed', thumbnail: undefined }) } as unknown as BlinkApi,
      createHap() as unknown as HAP, 1, 2, 'camera', 'serial', () => undefined,
      () => true, trace, { mediaDebug: false }, error,
    );
    const callback = jest.fn();
    await source.handleSnapshotRequest({ width: 640, height: 480 } as SnapshotRequest, callback);
    expect(callback).toHaveBeenCalledWith(expect.any(Error));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('No thumbnail URL available'));
    expect(trace).toHaveBeenCalledWith(expect.stringContaining('Snapshot requested'));
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining('Snapshot requested'));
  });

  const buildPlatform = (streamingConfigOverrides: Partial<ReturnType<typeof resolveStreamingConfig>> = {}) => {
    const hap = createHap();
    const log = createLogger();
    const apiClient = {
      armNetwork: jest.fn().mockResolvedValue({ command_id: 123 }),
      disarmNetwork: jest.fn().mockResolvedValue({ command_id: 124 }),
      pollCommand: jest.fn().mockResolvedValue({ complete: true }),
      getDeviceVideoQuality: jest.fn().mockResolvedValue({ quality: 'standard' }),
      getCameraTemperature: jest.fn().mockResolvedValue(20),
      setDeviceVideoQuality: jest.fn().mockResolvedValue({ quality: 'best' }),
      startCameraLiveview: jest.fn().mockResolvedValue({}),
      enableCameraMotion: jest.fn(),
      disableCameraMotion: jest.fn(),
      enableDoorbellMotion: jest.fn(),
      disableDoorbellMotion: jest.fn(),
      enableOwlMotion: jest.fn(),
      disableOwlMotion: jest.fn(),
      requestCameraThumbnail: jest.fn().mockResolvedValue({ command_id: 1, captureOutcome: 'completed', thumbnail: 'https://rest-prod.immedia-semi.com/thumbnail.jpg' }),
      requestOwlThumbnail: jest.fn().mockResolvedValue({ command_id: 1, captureOutcome: 'completed', thumbnail: 'https://rest-prod.immedia-semi.com/thumbnail.jpg' }),
      requestDoorbellThumbnail: jest.fn().mockResolvedValue({ command_id: 1, captureOutcome: 'completed', thumbnail: 'https://rest-prod.immedia-semi.com/thumbnail.jpg' }),
    };

    const platform: PlatformStub = {
      Service: hap.Service as unknown as BlinkCamerasPlatform['Service'],
      Characteristic: hap.Characteristic as unknown as BlinkCamerasPlatform['Characteristic'],
      apiClient: apiClient as unknown as BlinkCamerasPlatform['apiClient'],
      log: log as unknown as BlinkCamerasPlatform['log'],
      api: { hap, updatePlatformAccessories: jest.fn() } as unknown as BlinkCamerasPlatform['api'],
      streamingConfig: resolveStreamingConfig({ enabled: false, ...streamingConfigOverrides }),
      isOperational: () => true,
      getDeviceInputQuality: jest.fn().mockReturnValue('auto'),
      isTemperatureEnabled: jest.fn().mockReturnValue(false),
    };

    return { hap, apiClient, platform, log };
  };

  it('exposes opted-in camera temperature from bounded metadata reads without motion or quality writes', async () => {
    const { hap, apiClient, platform } = buildPlatform();
    jest.mocked(platform.isTemperatureEnabled).mockReturnValue(true);
    const accessory = new MockAccessory('Garden', 'temperature-camera', hap);
    const device = { id: 2, network_id: 1, name: 'Camera', enabled: false };
    const camera = new CameraAccessory(platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory, device);
    await nextTurn();
    const sensor = accessory.getServiceById(hap.Service.TemperatureSensor, 'temperature');
    expect(sensor).toBeDefined();
    expect(sensor?.getCharacteristic(hap.Characteristic.CurrentTemperature).onGetHandler?.()).toBe(20);
    expect(sensor?.getCharacteristic(hap.Characteristic.StatusActive).value).toBe(true);
    expect(sensor?.getCharacteristic(hap.Characteristic.StatusFault).value).toBe(0);
    expect(apiClient.getCameraTemperature).toHaveBeenCalledWith(1, 2, expect.objectContaining({ deadline: expect.any(Number) }));
    expect(platform.api.updatePlatformAccessories).toHaveBeenCalledWith([accessory]);
    apiClient.getCameraTemperature.mockResolvedValue(-5);
    camera.updateState(device);
    await nextTurn();
    expect(sensor?.getCharacteristic(hap.Characteristic.CurrentTemperature).onGetHandler?.()).toBe(-5);
    expect(apiClient.getCameraTemperature).toHaveBeenCalledTimes(2);
    expect(apiClient.setDeviceVideoQuality).not.toHaveBeenCalled();
    expect(apiClient.enableCameraMotion).not.toHaveBeenCalled();
  });

  it.each([CameraAccessory, OwlAccessory, DoorbellAccessory])('makes no default temperature requests for %p', async Handler => {
    const { hap, apiClient, platform } = buildPlatform();
    const accessory = new MockAccessory('Camera', 'no-temperature', hap);
    new Handler(platform as unknown as BlinkCamerasPlatform, accessory as unknown as PlatformAccessory,
      { id: 2, network_id: 1, name: 'Camera', enabled: true });
    await nextTurn();
    expect(apiClient.getCameraTemperature).not.toHaveBeenCalled();
    expect(accessory.getService(hap.Service.TemperatureSensor)).toBeUndefined();
  });

  it.each([false, true])('removes a restored sensor when disabled or unsupported (owl: %s)', async owl => {
    const { hap, apiClient, platform } = buildPlatform();
    jest.mocked(platform.isTemperatureEnabled).mockReturnValue(owl);
    const accessory = new MockAccessory('Camera', 'restored-temperature', hap);
    accessory.addService(hap.Service.TemperatureSensor, 'Temperature', 'temperature');
    new CameraAccessory(platform as unknown as BlinkCamerasPlatform, accessory as unknown as PlatformAccessory,
      { id: 2, network_id: 1, name: 'Camera', enabled: true, type: owl ? 'owl' : 'camera' });
    await nextTurn();
    expect(accessory.getService(hap.Service.TemperatureSensor)).toBeUndefined();
    expect(apiClient.getCameraTemperature).not.toHaveBeenCalled();
    expect(platform.api.updatePlatformAccessories).toHaveBeenCalledWith([accessory]);
  });

  it('reuses a restored temperature sensor only after fresh metadata and coalesces poll reads', async () => {
    const { hap, apiClient, platform } = buildPlatform();
    jest.mocked(platform.isTemperatureEnabled).mockReturnValue(true);
    let finish!: (sample: number) => void;
    apiClient.getCameraTemperature.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const accessory = new MockAccessory('Camera', 'temperature-camera', hap);
    const sensor = accessory.addService(hap.Service.TemperatureSensor, 'Temperature', 'temperature');
    sensor.getCharacteristic(hap.Characteristic.CurrentTemperature).updateValue(99);
    const device = { id: 2, network_id: 1, name: 'Camera', enabled: true };
    const camera = new CameraAccessory(platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory, device);
    expect(() => sensor.getCharacteristic(hap.Characteristic.CurrentTemperature).onGetHandler?.())
      .toThrow(expect.objectContaining({ hapStatus: -70402 }));
    camera.updateState(device);
    camera.updateState(device);
    await nextTurn();
    expect(apiClient.getCameraTemperature).toHaveBeenCalledTimes(1);
    finish(0);
    await nextTurn();
    expect(accessory.getServiceById(hap.Service.TemperatureSensor, 'temperature')).toBe(sensor);
    expect(sensor.getCharacteristic(hap.Characteristic.CurrentTemperature).onGetHandler?.()).toBe(0);
    expect(apiClient.getCameraTemperature).toHaveBeenCalledTimes(1);
    expect(platform.api.updatePlatformAccessories).not.toHaveBeenCalled();
  });

  it.each(['missing', 'failed', 'offline', 'bridge outage'])('faults temperature independently and recovers after %s', async reason => {
    const { hap, apiClient, platform } = buildPlatform();
    jest.mocked(platform.isTemperatureEnabled).mockReturnValue(true);
    const accessory = new MockAccessory('Camera', 'temperature-camera', hap);
    const device = { id: 2, network_id: 1, name: 'Camera', enabled: false };
    const camera = new CameraAccessory(platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory, device);
    await nextTurn();
    const sensor = accessory.getServiceById(hap.Service.TemperatureSensor, 'temperature')!;
    if (reason === 'missing') apiClient.getCameraTemperature.mockResolvedValueOnce(undefined as never);
    if (reason === 'failed') apiClient.getCameraTemperature.mockRejectedValueOnce(new Error('private provider detail'));
    if (reason === 'bridge outage') platform.isOperational = () => false;
    camera.updateState({ ...device, status: reason === 'offline' ? 'offline' : 'online' });
    await nextTurn();
    expect(sensor.getCharacteristic(hap.Characteristic.StatusFault).value).toBe(1);
    expect(sensor.getCharacteristic(hap.Characteristic.StatusActive).value).toBe(false);
    expect(() => sensor.getCharacteristic(hap.Characteristic.CurrentTemperature).onGetHandler?.())
      .toThrow(expect.objectContaining({ hapStatus: -70402 }));
    expect(apiClient.getCameraTemperature).toHaveBeenCalledTimes(reason === 'offline' || reason === 'bridge outage' ? 1 : 2);
    if (reason === 'missing' || reason === 'failed') {
      expect(accessory.getServiceById(hap.Service.MotionSensor, 'motion-sensor')
        ?.getCharacteristic(hap.Characteristic.StatusFault).value).toBe(0);
    }
    platform.isOperational = () => true;
    apiClient.getCameraTemperature.mockResolvedValue(5);
    camera.updateState({ ...device, status: 'online' });
    await nextTurn();
    expect(sensor.getCharacteristic(hap.Characteristic.CurrentTemperature).onGetHandler?.()).toBe(5);
    expect(sensor.getCharacteristic(hap.Characteristic.StatusFault).value).toBe(0);
    expect(sensor.getCharacteristic(hap.Characteristic.StatusActive).value).toBe(true);
  });

  it('does not create a temperature sensor until metadata first becomes available', async () => {
    const { hap, apiClient, platform } = buildPlatform();
    jest.mocked(platform.isTemperatureEnabled).mockReturnValue(true);
    apiClient.getCameraTemperature.mockResolvedValueOnce(undefined as never);
    const accessory = new MockAccessory('Camera', 'temperature-camera', hap);
    const device = { id: 2, network_id: 1, name: 'Camera', enabled: true };
    const camera = new CameraAccessory(platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory, device);
    await nextTurn();
    expect(accessory.getService(hap.Service.TemperatureSensor)).toBeUndefined();
    camera.updateState(device);
    await nextTurn();
    expect(accessory.getService(hap.Service.TemperatureSensor)).toBeDefined();
  });

  it('bounds a hung temperature read and ignores its late sample after a newer read', async () => {
    jest.useFakeTimers();
    try {
      const { hap, apiClient, platform } = buildPlatform();
      jest.mocked(platform.isTemperatureEnabled).mockReturnValue(true);
      let finish!: (sample: number) => void;
      apiClient.getCameraTemperature.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
      const accessory = new MockAccessory('Camera', 'temperature-camera', hap);
      const device = { id: 2, network_id: 1, name: 'Camera', enabled: true };
      const camera = new CameraAccessory(platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory, device);
      await jest.advanceTimersByTimeAsync(10_000);
      expect(accessory.getService(hap.Service.TemperatureSensor)).toBeUndefined();
      apiClient.getCameraTemperature.mockResolvedValue(5);
      camera.updateState(device);
      await jest.advanceTimersByTimeAsync(0);
      const sensor = accessory.getService(hap.Service.TemperatureSensor)!;
      expect(sensor.getCharacteristic(hap.Characteristic.CurrentTemperature).onGetHandler?.()).toBe(5);
      finish(99);
      await jest.advanceTimersByTimeAsync(0);
      expect(sensor.getCharacteristic(hap.Characteristic.CurrentTemperature).onGetHandler?.()).toBe(5);
      expect(apiClient.getCameraTemperature).toHaveBeenCalledTimes(2);
    } finally { jest.useRealTimers(); }
  });

  it.each(['metadata', 'unavailable'])('auto input quality uses observation only when settings are %s', async (outcome) => {
    const { hap, apiClient, platform } = buildPlatform({ enabled: true });
    if (outcome === 'unavailable') apiClient.getDeviceVideoQuality.mockRejectedValue(new Error('settings unavailable'));
    const accessory = new MockAccessory('Camera', 'quality-camera', hap);
    const handler = new CameraAccessory(platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory, { id: 2, network_id: 1, name: 'Camera', enabled: true });
    const source = (handler as unknown as { cameraSource: BlinkCameraSource }).cameraSource;
    const runtime = streamingRuntime(source);
    try {
      await runtime.prepare(); await runtime.start();
      expect(apiClient.getDeviceVideoQuality).toHaveBeenCalledWith('camera', 1, 2,
        expect.objectContaining({ signal: expect.any(globalThis.AbortSignal), deadline: expect.any(Number) }));
      expect(apiClient.setDeviceVideoQuality).not.toHaveBeenCalled();
      // The vendor response lacks a URL; reaching allocation proves metadata
      // failure did not block the liveview command.
      expect(apiClient.startCameraLiveview).toHaveBeenCalledTimes(1);
      expect(accessory.context.initialInputQuality).toBe(outcome === 'metadata' ? 'standard' : undefined);
    } finally { await runtime.cleanup(); }
  });

  it('starts liveview while auto metadata hangs, coalesces reads and ignores an aborted late result', async () => {
    const { hap, apiClient, platform } = buildPlatform({ enabled: true });
    let finishMetadata!: (state: { quality: string }) => void;
    apiClient.getDeviceVideoQuality.mockReturnValue(new Promise(resolve => { finishMetadata = resolve; }));
    apiClient.startCameraLiveview.mockResolvedValue({ server: 'immis://8.8.8.8:443/private?client_id=1' });
    const accessory = new MockAccessory('Camera', 'quality-camera', hap);
    const handler = new CameraAccessory(platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory, { id: 2, network_id: 1, name: 'Camera', enabled: true });
    const source = (handler as unknown as { cameraSource: BlinkCameraSource }).cameraSource;
    const runtime = streamingRuntime(source);
    try {
      await runtime.prepare(); expect(await runtime.start()).toBeUndefined();
      expect(apiClient.startCameraLiveview).toHaveBeenCalledTimes(1);
      const signal = apiClient.getDeviceVideoQuality.mock.calls[0][3]?.signal;
      await runtime.stop(); expect(signal?.aborted).toBe(true);
      await runtime.prepare('replacement'); expect(await runtime.start('replacement')).toBeUndefined();
      expect(apiClient.getDeviceVideoQuality).toHaveBeenCalledTimes(1);
      finishMetadata({ quality: 'best' }); await nextTurn();
      expect(accessory.context.initialInputQuality).toBeUndefined();
      expect(platform.api.updatePlatformAccessories).not.toHaveBeenCalled(); expect(apiClient.setDeviceVideoQuality).not.toHaveBeenCalled();
    } finally { await runtime.cleanup(); }
  });

  it('blocks liveview allocation when an explicit input quality is not confirmed', async () => {
    const { hap, apiClient, platform } = buildPlatform({ enabled: true });
    (platform.getDeviceInputQuality as jest.Mock).mockReturnValue('best');
    apiClient.setDeviceVideoQuality.mockRejectedValue(new Error('requested quality was not confirmed'));
    const accessory = new MockAccessory('Camera', 'quality-camera', hap);
    const handler = new CameraAccessory(platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory, { id: 2, network_id: 1, name: 'Camera', enabled: true });
    const source = (handler as unknown as { cameraSource: BlinkCameraSource }).cameraSource;
    const runtime = streamingRuntime(source);
    try {
      await runtime.prepare(); expect(await runtime.start()).toBeInstanceOf(Error);
      expect(apiClient.setDeviceVideoQuality).toHaveBeenCalledWith('camera', 1, 2, 'best', expect.any(Object));
      expect(apiClient.startCameraLiveview).not.toHaveBeenCalled(); expect(createOwnedMediaSession).not.toHaveBeenCalled();
      expect(accessory.context.initialInputQuality).toBeUndefined();
    } finally { await runtime.cleanup(); }
  });

  it('retains first vendor quality and input geometry across accessory reconstruction', async () => {
    const { hap, apiClient, platform } = buildPlatform();
    const accessory = new MockAccessory('Camera', 'quality-camera', hap);
    const device: BlinkCamera = { id: 2, network_id: 1, name: 'Camera', enabled: true };
    type ObservationHooks = { beforeLiveview: (options: object) => Promise<void>;
      onInputObservation: (observation: { width: number; height: number; fps: number }) => void };
    const create = () => {
      const handler = new CameraAccessory(platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory, device);
      return (handler as unknown as { cameraSource: ObservationHooks }).cameraSource;
    };
    const first = create();
    await first.beforeLiveview({});
    first.onInputObservation({ width: 2560, height: 1440, fps: 30 });
    apiClient.getDeviceVideoQuality.mockResolvedValue({ quality: 'best' });
    const restarted = create();
    await restarted.beforeLiveview({});
    restarted.onInputObservation({ width: 1920, height: 1080, fps: 15 });
    expect(accessory.context.initialInputQuality).toBe('standard');
    expect(accessory.context.initialInputVideo).toEqual({ width: 2560, height: 1440, fps: 30 });
    expect(platform.api.updatePlatformAccessories).toHaveBeenCalledTimes(2);
    expect(apiClient.getDeviceVideoQuality).toHaveBeenCalledTimes(1);
    expect(apiClient.setDeviceVideoQuality).not.toHaveBeenCalled();
  });

  it('bounds each snapshot caller while allowing a shared capture to populate cache later', async () => {
    jest.useFakeTimers();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue(testResponse({ ok: true, arrayBuffer: async () => new Uint8Array([8]).buffer }));
    let finish!: (value: unknown) => void;
    const capture = new Promise(resolve => { finish = resolve; });
    const requestCameraThumbnail = jest.fn().mockReturnValue(capture);
    try {
      const source = new BlinkCameraSource({ requestCameraThumbnail, getAuthHeaders: () => ({}) } as unknown as BlinkApi,
        createHap() as unknown as HAP, 1, 2, 'camera', 'serial', () => undefined, () => true, jest.fn(),
        { persistSnapshotCache: true });
      const first = jest.fn();
      const second = jest.fn();
      const waiting = Promise.all([
        source.handleSnapshotRequest({ width: 640, height: 480 } as SnapshotRequest, first),
        source.handleSnapshotRequest({ width: 640, height: 480 } as SnapshotRequest, second),
      ]);
      await jest.advanceTimersByTimeAsync(12_000);
      await waiting;
      expect(first).toHaveBeenCalledWith(expect.objectContaining({ hapStatus: -70408 }));
      expect(second).toHaveBeenCalledWith(expect.objectContaining({ hapStatus: -70408 }));
      finish({ captureOutcome: 'completed', thumbnail: 'https://rest-prod.immedia-semi.com/new.jpg' });
      await jest.advanceTimersByTimeAsync(0);
      const cached = jest.fn();
      await source.handleSnapshotRequest({ width: 640, height: 480 } as SnapshotRequest, cached);
      expect(cached).toHaveBeenCalledWith(undefined, Buffer.from([8]));
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      expect(requestCameraThumbnail).toHaveBeenCalledTimes(1);
    } finally { globalThis.fetch = originalFetch; jest.useRealTimers(); }
  });

  it('keeps confirmed motion state after failure and clears its fault on verified polling', async () => {
    const { hap, apiClient, platform } = buildPlatform();
    apiClient.enableCameraMotion.mockRejectedValue(new Error('failed'));
    const accessory = new MockAccessory('Camera', 'uuid-camera', hap);
    const device: BlinkCamera = { id: 2, network_id: 1, name: 'Camera', enabled: false };
    const camera = new CameraAccessory(platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory, device);
    const on = accessory.getServiceById(hap.Service.Switch, 'motion-switch')?.getCharacteristic(hap.Characteristic.On);
    const fault = accessory.getServiceById(hap.Service.MotionSensor, 'motion-sensor')?.getCharacteristic(hap.Characteristic.StatusFault);
    await expect(on?.onSetHandler?.(true)).rejects.toMatchObject({ hapStatus: -70402 });
    expect(device.enabled).toBe(false);
    expect(fault?.value).toBe(1);
    camera.updateState({ ...device, enabled: true });
    expect(fault?.value).toBe(0);
  });

  it('times out a motion write without optimistic state, then accepts late confirmed success', async () => {
    jest.useFakeTimers();
    let finish!: () => void;
    try {
      const { hap, apiClient, platform } = buildPlatform();
      apiClient.enableCameraMotion.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
      const accessory = new MockAccessory('Camera', 'uuid-camera', hap);
      const device: BlinkCamera = { id: 2, network_id: 1, name: 'Camera', enabled: false };
      new CameraAccessory(platform as unknown as BlinkCamerasPlatform, accessory as unknown as PlatformAccessory, device);
      const on = accessory.getServiceById(hap.Service.Switch, 'motion-switch')?.getCharacteristic(hap.Characteristic.On);
      const fault = accessory.getServiceById(hap.Service.MotionSensor, 'motion-sensor')?.getCharacteristic(hap.Characteristic.StatusFault);
      const result = expect(on?.onSetHandler?.(true)).rejects.toMatchObject({ hapStatus: -70408 });
      await jest.advanceTimersByTimeAsync(12_000);
      await result;
      expect(device.enabled).toBe(false);
      expect(fault?.value).toBe(1);
      finish();
      await jest.advanceTimersByTimeAsync(0);
      expect(device.enabled).toBe(true);
      expect(fault?.value).toBe(0);
      expect(apiClient.enableCameraMotion).toHaveBeenCalledTimes(1);
    } finally { jest.useRealTimers(); }
  });

  it.each([['network', false], ['motion', false], ['network', true], ['motion', true]])(
    'preserves opposite %s intent after timeout (queued expiry: %s)', async (kind, expires) => {
    jest.useFakeTimers();
    try {
      const { hap, apiClient, platform } = buildPlatform();
      let finishFirst!: () => void;
      let finishSecond!: () => void;
      let rejectSecond!: (error: Error) => void;
      const first = new Promise<void>(resolve => { finishFirst = resolve; });
      const second = new Promise<void>((resolve, reject) => { finishSecond = resolve; rejectSecond = reject; });
      const accessory = new MockAccessory('Device', 'uuid-device', hap);
      let characteristic;
      let networkHandler: NetworkAccessory | undefined;
      const isNetwork = kind === 'network';
      if (isNetwork) {
        apiClient.armNetwork.mockReturnValue(first);
        apiClient.disarmNetwork.mockReturnValue(second);
        networkHandler = new NetworkAccessory(platform as unknown as BlinkCamerasPlatform, accessory as unknown as PlatformAccessory,
          { id: 1, name: 'Device', armed: false });
        characteristic = accessory.getService(hap.Service.SecuritySystem)?.getCharacteristic(hap.Characteristic.SecuritySystemTargetState);
      } else {
        apiClient.enableCameraMotion.mockReturnValue(first);
        apiClient.disableCameraMotion.mockReturnValue(second);
        new CameraAccessory(platform as unknown as BlinkCamerasPlatform, accessory as unknown as PlatformAccessory,
          { id: 2, network_id: 1, name: 'Device', enabled: false });
        characteristic = accessory.getServiceById(hap.Service.Switch, 'motion-switch')?.getCharacteristic(hap.Characteristic.On);
      }
      const timedOut = expect(characteristic?.onSetHandler?.(isNetwork ? 1 : true))
        .rejects.toMatchObject({ hapStatus: -70408 });
      await jest.advanceTimersByTimeAsync(12_000);
      await timedOut;
      const opposite = characteristic?.onSetHandler?.(isNetwork ? 3 : false);
      expect(isNetwork ? apiClient.disarmNetwork : apiClient.disableCameraMotion).toHaveBeenCalledTimes(1);
      characteristic?.updateValue(isNetwork ? 3 : false);
      if (expires) {
        const failure = expect(opposite).rejects.toMatchObject({ hapStatus: -70408 });
        rejectSecond(Object.assign(new Error('queued job expired'), { name: 'TimeoutError' }));
        await failure;
      }
      finishFirst();
      await jest.advanceTimersByTimeAsync(0);
      expect(characteristic?.value).toBe(isNetwork ? 3 : false);
      // Target reads retain unresolved network intent; motion reads remain confirmed.
      expect(characteristic?.onGetHandler?.()).toBe(isNetwork ? 3 : true);
      if (isNetwork) {
        expect(accessory.getService(hap.Service.SecuritySystem)
          ?.getCharacteristic(hap.Characteristic.SecuritySystemCurrentState).onGetHandler?.()).toBe(1);
      }
      if (expires) {
        const fault = isNetwork
          ? accessory.getService(hap.Service.SecuritySystem)?.getCharacteristic(hap.Characteristic.StatusFault)
          : accessory.getServiceById(hap.Service.MotionSensor, 'motion-sensor')?.getCharacteristic(hap.Characteristic.StatusFault);
        expect(fault?.value).toBe(1);
        expect(isNetwork ? apiClient.disarmNetwork : apiClient.disableCameraMotion).toHaveBeenCalledTimes(1);
        if (networkHandler) {
          networkHandler.updateState({ id: 1, name: 'Device', armed: true });
          expect(characteristic?.onGetHandler?.()).toBe(3);
          expect(fault?.value).toBe(1);
          networkHandler.updateState({ id: 1, name: 'Device', armed: false });
          expect(characteristic?.onGetHandler?.()).toBe(3);
          expect(fault?.value).toBe(0);
          networkHandler.updateState({ id: 1, name: 'Device', armed: true });
          expect(characteristic?.onGetHandler?.()).toBe(1);
        }
      } else {
        finishSecond();
        await opposite;
        expect(characteristic?.onGetHandler?.()).toBe(isNetwork ? 3 : false);
      }
    } finally { jest.useRealTimers(); }
  });

  it.each(['motion', 'refresh'])('keeps the %s fault through unrelated success and polling', async (failedOperation) => {
    const refresh = jest.spyOn(BlinkCameraSource.prototype, 'refreshSnapshotCache');
    try {
      const { hap, apiClient, platform } = buildPlatform({ persistSnapshotCache: true });
      const accessory = new MockAccessory('Camera', 'uuid-camera', hap);
      const device: BlinkCamera = { id: 2, network_id: 1, name: 'Camera', enabled: false };
      const camera = new CameraAccessory(platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory, device);
      const motion = accessory.getServiceById(hap.Service.Switch, 'motion-switch')?.getCharacteristic(hap.Characteristic.On);
      const snapshot = accessory.getServiceById(hap.Service.Switch, 'snapshot-refresh')?.getCharacteristic(hap.Characteristic.On);
      const fault = accessory.getServiceById(hap.Service.MotionSensor, 'motion-sensor')?.getCharacteristic(hap.Characteristic.StatusFault);
      if (failedOperation === 'motion') {
        apiClient.enableCameraMotion.mockRejectedValueOnce(new Error('motion failed'));
        await expect(motion?.onSetHandler?.(true)).rejects.toMatchObject({ hapStatus: -70402 });
        refresh.mockResolvedValue();
        await snapshot?.onSetHandler?.(true);
        camera.updateState({ ...device, enabled: false });
        expect(fault?.value).toBe(1);
        camera.updateState({ ...device, enabled: true });
      } else {
        refresh.mockRejectedValueOnce(new Error('refresh failed'));
        await expect(snapshot?.onSetHandler?.(true)).rejects.toMatchObject({ hapStatus: -70402 });
        apiClient.enableCameraMotion.mockResolvedValue(undefined);
        await motion?.onSetHandler?.(true);
        camera.updateState({ ...device, enabled: true });
        expect(fault?.value).toBe(1);
        refresh.mockResolvedValue();
        await snapshot?.onSetHandler?.(true);
      }
      expect(fault?.value).toBe(0);
    } finally { refresh.mockRestore(); }
  });

  it('returns controlled refresh failure and resets the momentary switch', async () => {
    const refresh = jest.spyOn(BlinkCameraSource.prototype, 'refreshSnapshotCache').mockRejectedValue(new Error('failed'));
    try {
      const { hap, platform } = buildPlatform({ persistSnapshotCache: true });
      const accessory = new MockAccessory('Camera', 'uuid-camera', hap);
      new CameraAccessory(platform as unknown as BlinkCamerasPlatform, accessory as unknown as PlatformAccessory,
        { id: 2, network_id: 1, name: 'Camera', enabled: true });
      const on = accessory.getServiceById(hap.Service.Switch, 'snapshot-refresh')?.getCharacteristic(hap.Characteristic.On);
      await expect(on?.onSetHandler?.(true)).rejects.toMatchObject({ hapStatus: -70402 });
      expect(on?.value).toBe(false);
    } finally { refresh.mockRestore(); }
  });

  it.each([
    [CameraAccessory, 'Camera'],
    [DoorbellAccessory, 'Doorbell'],
    [OwlAccessory, 'Mini'],
  ])('names new and restored %p services with the assigned camera prefix', (Handler, _kind) => {
    const { hap, platform } = buildPlatform({ persistSnapshotCache: true });
    const accessory = new MockAccessory('Front door', 'uuid-naming', hap);
    const device = { id: 2, network_id: 1, name: 'Vendor label', enabled: true };
    const original = accessory.addService(hap.Service.Switch, 'SwitchCorner', 'motion-switch');
    new Handler(platform as unknown as BlinkCamerasPlatform, accessory as unknown as PlatformAccessory, device);
    expect(accessory.getServiceById(hap.Service.Switch, 'motion-switch')).toBe(original);
    for (const [type, subtype, name] of [
      [hap.Service.Switch, 'motion-switch', 'Front door Motion Detection'],
      [hap.Service.MotionSensor, 'motion-sensor', 'Front door Motion Sensor'],
      [hap.Service.Switch, 'snapshot-refresh', 'Front door Refresh Snapshot'],
    ]) {
      const service = accessory.getServiceById(type, subtype)!;
      expect(service.setCharacteristic).toHaveBeenCalledWith(hap.Characteristic.Name, name);
      expect(service.setCharacteristic).toHaveBeenCalledWith(hap.Characteristic.ConfiguredName, name);
    }
  });

  it('toggles network arm state via SecuritySystem', async () => {
    const { hap, apiClient, platform } = buildPlatform();
    const accessory = new MockAccessory('Network', 'uuid-network', hap);
    const device: BlinkNetwork = { id: 1, name: 'Network', armed: false };

    const handler = new NetworkAccessory(
      platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory,
      device,
    );
    const characteristic = accessory.getService(hap.Service.SecuritySystem)?.getCharacteristic(hap.Characteristic.SecuritySystemTargetState);
    // 1 = AWAY_ARM in HomeKit
    await characteristic?.onSetHandler?.(1);

    expect(apiClient.armNetwork).toHaveBeenCalledWith(1, expect.objectContaining({ queueDeadline: expect.any(Number) }));
    expect(apiClient.pollCommand).not.toHaveBeenCalled();
    expect(accessory.getService(hap.Service.SecuritySystem)
      ?.getCharacteristic(hap.Characteristic.StatusFault).value).toBe(hap.Characteristic.StatusFault.NO_FAULT);
    expect(device.armed).toBe(true);
    expect(handler).toBeInstanceOf(NetworkAccessory);
  });

  it('surfaces a terminal arm failure as a HomeKit security-system fault', async () => {
    const { hap, apiClient, platform } = buildPlatform();
    apiClient.armNetwork.mockRejectedValueOnce(new Error('conflict retries exhausted'));
    const accessory = new MockAccessory('Network', 'uuid-network', hap);
    const device: BlinkNetwork = { id: 1, name: 'Network', armed: false };
    const handler = new NetworkAccessory(
      platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory,
      device,
    );
    const service = accessory.getService(hap.Service.SecuritySystem);

    await expect(service?.getCharacteristic(hap.Characteristic.SecuritySystemTargetState).onSetHandler?.(1))
      .rejects.toMatchObject({ hapStatus: hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE });
    expect(service?.getCharacteristic(hap.Characteristic.StatusFault).value)
      .toBe(hap.Characteristic.StatusFault.GENERAL_FAULT);
    expect(device.armed).toBe(false);

    handler.updateState({ ...device, armed: false });
    expect(service?.getCharacteristic(hap.Characteristic.StatusFault).value)
      .toBe(hap.Characteristic.StatusFault.GENERAL_FAULT);
    handler.updateState({ ...device, armed: true });
    expect(service?.getCharacteristic(hap.Characteristic.StatusFault).value)
      .toBe(hap.Characteristic.StatusFault.NO_FAULT);
  });

  it('resolves failed network intent when a new write selects the confirmed state', async () => {
    const { hap, apiClient, platform } = buildPlatform();
    apiClient.armNetwork.mockRejectedValueOnce(new Error('command failed'));
    const accessory = new MockAccessory('Network', 'uuid-network', hap);
    new NetworkAccessory(platform as unknown as BlinkCamerasPlatform, accessory as unknown as PlatformAccessory,
      { id: 1, name: 'Network', armed: false });
    const service = accessory.getService(hap.Service.SecuritySystem)!;
    const target = service.getCharacteristic(hap.Characteristic.SecuritySystemTargetState);
    await expect(target.onSetHandler?.(1)).rejects.toMatchObject({ hapStatus: -70402 });
    expect(target.onGetHandler?.()).toBe(1);
    expect(service.getCharacteristic(hap.Characteristic.SecuritySystemCurrentState).onGetHandler?.()).toBe(3);
    await target.onSetHandler?.(3);
    expect(target.onGetHandler?.()).toBe(3);
    expect(service.getCharacteristic(hap.Characteristic.StatusFault).value).toBe(0);
    expect(apiClient.armNetwork).toHaveBeenCalledTimes(1);
    expect(apiClient.disarmNetwork).not.toHaveBeenCalled();
  });

  it('bounds network writes while late completion updates confirmed state and preserves platform fault', async () => {
    jest.useFakeTimers();
    let finish!: (value: { command_id: number }) => void;
    try {
      const { hap, apiClient, platform } = buildPlatform();
      apiClient.armNetwork.mockReturnValue(new Promise(resolve => { finish = resolve; }));
      const accessory = new MockAccessory('Network', 'uuid-network', hap);
      const device: BlinkNetwork = { id: 1, name: 'Network', armed: false };
      const handler = new NetworkAccessory(platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory, device);
      const service = accessory.getService(hap.Service.SecuritySystem);
      const failure = expect(service?.getCharacteristic(hap.Characteristic.SecuritySystemTargetState).onSetHandler?.(1))
        .rejects.toMatchObject({ hapStatus: -70408 });
      await jest.advanceTimersByTimeAsync(12_000);
      await failure;
      expect(device.armed).toBe(false);
      expect(service?.getCharacteristic(hap.Characteristic.StatusFault).value).toBe(1);
      platform.isOperational = () => false;
      finish({ command_id: 1 });
      await jest.advanceTimersByTimeAsync(0);
      expect(device.armed).toBe(true);
      expect(service?.getCharacteristic(hap.Characteristic.SecuritySystemCurrentState).value).toBe(1);
      expect(service?.getCharacteristic(hap.Characteristic.StatusFault).value).toBe(1);
      platform.isOperational = () => true;
      handler.updateAvailability();
      expect(service?.getCharacteristic(hap.Characteristic.StatusFault).value).toBe(0);
      expect(apiClient.armNetwork).toHaveBeenCalledTimes(1);
    } finally { jest.useRealTimers(); }
  });

  it('disarms network via SecuritySystem', async () => {
    const { hap, apiClient, platform } = buildPlatform();
    const accessory = new MockAccessory('Network', 'uuid-network', hap);
    const device: BlinkNetwork = { id: 1, name: 'Network', armed: true };

    const handler = new NetworkAccessory(
      platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory,
      device,
    );
    const characteristic = accessory.getService(hap.Service.SecuritySystem)?.getCharacteristic(hap.Characteristic.SecuritySystemTargetState);
    // 3 = DISARM in HomeKit
    await characteristic?.onSetHandler?.(3);

    expect(apiClient.disarmNetwork).toHaveBeenCalledWith(1, expect.objectContaining({ queueDeadline: expect.any(Number) }));
    expect(device.armed).toBe(false);
    expect(handler).toBeInstanceOf(NetworkAccessory);
  });

  it('does not call API when network state is unchanged', async () => {
    const { hap, apiClient, platform } = buildPlatform();
    const accessory = new MockAccessory('Network', 'uuid-network', hap);
    const device: BlinkNetwork = { id: 1, name: 'Network', armed: true };

    const handler = new NetworkAccessory(
      platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory,
      device,
    );
    const characteristic = accessory.getService(hap.Service.SecuritySystem)?.getCharacteristic(hap.Characteristic.SecuritySystemTargetState);
    // 1 = AWAY_ARM in HomeKit (already armed)
    await characteristic?.onSetHandler?.(1);

    expect(apiClient.armNetwork).not.toHaveBeenCalled();
    expect(apiClient.disarmNetwork).not.toHaveBeenCalled();
    expect(device.armed).toBe(true);
    expect(handler).toBeInstanceOf(NetworkAccessory);
  });

  it('enables and disables camera motion', async () => {
    const { hap, apiClient, platform } = buildPlatform();
    const accessory = new MockAccessory('Camera', 'uuid-camera', hap);
    const device: BlinkCamera = { id: 2, network_id: 1, name: 'Camera', enabled: false };

    const handler = new CameraAccessory(
      platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory,
      device,
    );
    const characteristic = accessory.getService(hap.Service.Switch)?.getCharacteristic(hap.Characteristic.On);
    await characteristic?.onSetHandler?.(true);
    await characteristic?.onSetHandler?.(false);

    expect(apiClient.enableCameraMotion).toHaveBeenCalledWith(1, 2, expect.objectContaining({ queueDeadline: expect.any(Number) }));
    expect(apiClient.disableCameraMotion).toHaveBeenCalledWith(1, 2, expect.objectContaining({ queueDeadline: expect.any(Number) }));
    expect(device.enabled).toBe(false);
    expect(handler).toBeInstanceOf(CameraAccessory);
  });

  it('does not call API when camera state is unchanged', async () => {
    const { hap, apiClient, platform } = buildPlatform();
    const accessory = new MockAccessory('Camera', 'uuid-camera', hap);
    const device: BlinkCamera = { id: 2, network_id: 1, name: 'Camera', enabled: true };

    const handler = new CameraAccessory(
      platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory,
      device,
    );
    const characteristic = accessory.getService(hap.Service.Switch)?.getCharacteristic(hap.Characteristic.On);
    await characteristic?.onSetHandler?.(true);

    expect(apiClient.enableCameraMotion).not.toHaveBeenCalled();
    expect(apiClient.disableCameraMotion).not.toHaveBeenCalled();
    expect(device.enabled).toBe(true);
    expect(handler).toBeInstanceOf(CameraAccessory);
  });

  it('enables and disables doorbell motion', async () => {
    const { hap, apiClient, platform } = buildPlatform();
    const accessory = new MockAccessory('Doorbell', 'uuid-doorbell', hap);
    const device: BlinkDoorbell = { id: 3, network_id: 1, name: 'Doorbell', enabled: true };

    const handler = new DoorbellAccessory(
      platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory,
      device,
    );
    const characteristic = accessory.getService(hap.Service.Switch)?.getCharacteristic(hap.Characteristic.On);
    await characteristic?.onSetHandler?.(false);

    expect(apiClient.disableDoorbellMotion).toHaveBeenCalledWith(1, 3, expect.objectContaining({ queueDeadline: expect.any(Number) }));
    expect(device.enabled).toBe(false);
    expect(handler).toBeInstanceOf(DoorbellAccessory);
  });

  it('does not call API when doorbell state is unchanged', async () => {
    const { hap, apiClient, platform } = buildPlatform();
    const accessory = new MockAccessory('Doorbell', 'uuid-doorbell', hap);
    const device: BlinkDoorbell = { id: 3, network_id: 1, name: 'Doorbell', enabled: false };

    const handler = new DoorbellAccessory(
      platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory,
      device,
    );
    const characteristic = accessory.getService(hap.Service.Switch)?.getCharacteristic(hap.Characteristic.On);
    await characteristic?.onSetHandler?.(false);

    expect(apiClient.enableDoorbellMotion).not.toHaveBeenCalled();
    expect(apiClient.disableDoorbellMotion).not.toHaveBeenCalled();
    expect(device.enabled).toBe(false);
    expect(handler).toBeInstanceOf(DoorbellAccessory);
  });

  it('enables and disables owl motion', async () => {
    const { hap, apiClient, platform } = buildPlatform();
    const accessory = new MockAccessory('Owl', 'uuid-owl', hap);
    const device: BlinkOwl = { id: 4, network_id: 2, name: 'Owl', enabled: false };

    const handler = new OwlAccessory(
      platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory,
      device,
    );
    const characteristic = accessory.getService(hap.Service.Switch)?.getCharacteristic(hap.Characteristic.On);
    await characteristic?.onSetHandler?.(true);

    expect(apiClient.enableOwlMotion).toHaveBeenCalledWith(2, 4, expect.objectContaining({ queueDeadline: expect.any(Number) }));
    expect(device.enabled).toBe(true);
    expect(handler).toBeInstanceOf(OwlAccessory);
  });

  it('does not call API when owl state is unchanged', async () => {
    const { hap, apiClient, platform } = buildPlatform();
    const accessory = new MockAccessory('Owl', 'uuid-owl', hap);
    const device: BlinkOwl = { id: 4, network_id: 2, name: 'Owl', enabled: true };

    const handler = new OwlAccessory(
      platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory,
      device,
    );
    const characteristic = accessory.getService(hap.Service.Switch)?.getCharacteristic(hap.Characteristic.On);
    await characteristic?.onSetHandler?.(true);

    expect(apiClient.enableOwlMotion).not.toHaveBeenCalled();
    expect(apiClient.disableOwlMotion).not.toHaveBeenCalled();
    expect(device.enabled).toBe(true);
    expect(handler).toBeInstanceOf(OwlAccessory);
  });

  it.each(['veryfast', 'ultrafast'] as const)('carries prepared SSRCs, ports and selected audio into native media with preset %s', async softwarePreset => {
    const hap = createHap();
    const source = new BlinkCameraSource({ startCameraLiveview: jest.fn().mockResolvedValue({
      server: 'immis://8.8.8.8:443/private?client_id=1&token=DUMMY_CAPABILITY',
    }) } as unknown as BlinkApi, hap as unknown as HAP, 1, 2, 'camera', 'serial',
    () => undefined, () => true, jest.fn(), { audio: { enabled: true }, video: { softwarePreset } });
    const runtime = streamingRuntime(source);
    try {
      const prepared = await runtime.prepare(); expect(await runtime.start('session', true)).toBeUndefined();
      if (!('ssrc' in prepared.video) || !prepared.audio || !('ssrc' in prepared.audio)) {
        throw new Error('Expected direct SRTP preparation');
      }
      const options = jest.mocked(createOwnedMediaSession).mock.calls[0][0];
      expect(options.video.localPort).toBe(prepared.video.port);
      expect(options.video.output).toEqual(expect.objectContaining({ ssrc: prepared.video.ssrc, port: 5000, payloadType: 99 }));
      expect(options.video.bitrate).toBe(300_000); expect(options.video.softwarePreset).toBe(softwarePreset);
      expect(options.audio?.localPort).toBe(prepared.audio.port);
      expect(options.audio?.output).toEqual(expect.objectContaining({ ssrc: prepared.audio.ssrc, port: 5001, payloadType: 110 }));
      expect(options.audio).toEqual(expect.objectContaining({ codec: 'opus', rate: 24000, packetTime: 40, bitrate: 24000 }));
      for (const ssrc of [prepared.video.ssrc, prepared.audio.ssrc]) {
        expect(ssrc).toBeGreaterThan(0); expect(ssrc).toBeLessThanOrEqual(0xFFFFFFFF);
      }
      expect(spawn).not.toHaveBeenCalled();
    } finally { await runtime.cleanup(); }
  });

  it('retires an IMMIS transport error with fixed diagnostics and no unhandled error', async () => {
    const api = { startCameraLiveview: jest.fn().mockResolvedValue({
      server: 'immis://8.8.8.8:443/private?client_id=1&token=DUMMY_CAPABILITY', command_id: 456,
    }), getCommandStatus: jest.fn().mockResolvedValue({ status: 'running' }), completeCommand: jest.fn().mockResolvedValue({}) };
    const log = jest.fn();
    const source = new BlinkCameraSource(api as unknown as BlinkApi, createHap() as unknown as HAP,
      1, 2, 'camera', 'serial', () => undefined, () => true, log, { mediaDebug: true }, log);
    const runtime = streamingRuntime(source);
    try {
      await runtime.prepare(); expect(await runtime.start()).toBeUndefined();
      expect(() => runtime.transports[0].emit('error', new Error('DUMMY_PRIVATE_ERROR'))).not.toThrow();
      await runtime.stop(); await nextTurn();
      expect(runtime.transports[0].retire).toHaveBeenCalled(); expect(runtime.media[0].session.stop).toHaveBeenCalled();
      expect(api.completeCommand).toHaveBeenCalledWith(1, 456, expect.any(Object));
      expect(log).toHaveBeenCalledWith('Private media transport failed');
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/DUMMY_PRIVATE_ERROR|DUMMY_CAPABILITY/);
      await runtime.prepare('replacement');
    } finally { await runtime.cleanup(); }
  });

  it('rejects stream starts beyond configured maxStreams before requesting live view', async () => {
    const api = { startCameraLiveview: jest.fn().mockResolvedValue({ server: 'immis://8.8.8.8:443/private?client_id=1' }) };
    const source = new BlinkCameraSource(api as unknown as BlinkApi, createHap() as unknown as HAP,
      1, 2, 'camera', 'serial', () => undefined, () => true, jest.fn(), { maxStreams: 1 });
    const runtime = streamingRuntime(source);
    try {
      await runtime.prepare('first'); expect(await runtime.start('first')).toBeUndefined();
      await runtime.prepare('second'); expect(await runtime.start('second')).toBeInstanceOf(Error);
      expect(api.startCameraLiveview).toHaveBeenCalledTimes(1); expect(createOwnedMediaSession).toHaveBeenCalledTimes(1);
      await runtime.stop('first'); await runtime.prepare('replacement');
      expect(await runtime.start('replacement')).toBeUndefined(); expect(api.startCameraLiveview).toHaveBeenCalledTimes(2);
    } finally { await runtime.cleanup(); }
  });

  it('retains stopping streams against maxStreams until closure', async () => {
    const api = { startCameraLiveview: jest.fn().mockResolvedValue({ server: 'immis://8.8.8.8:443/private?client_id=1' }) };
    const source = new BlinkCameraSource(api as unknown as BlinkApi, createHap() as unknown as HAP,
      1, 2, 'camera', 'serial', () => undefined, () => true, jest.fn(), { maxStreams: 1 });
    const runtime = streamingRuntime(source); runtime.state.closeMedia = false;
    try {
      await runtime.prepare('first'); expect(await runtime.start('first')).toBeUndefined();
      const stopping = runtime.stop('first');
      await runtime.prepare('second'); expect(await runtime.start('second')).toBeInstanceOf(Error);
      expect(api.startCameraLiveview).toHaveBeenCalledTimes(1); expect(createOwnedMediaSession).toHaveBeenCalledTimes(1);
      runtime.media[0].close(); await stopping; runtime.state.closeMedia = true;
      await runtime.prepare('replacement'); expect(await runtime.start('replacement')).toBeUndefined();
      expect(api.startCameraLiveview).toHaveBeenCalledTimes(2);
    } finally { await runtime.cleanup(); }
  });

  it.each(['opus', 'pcma', 'pcmu'] as const)('advertises only preferred native %s with talkback disabled', codec => {
    const hap = createHap();
    const options = createCameraControllerOptions(hap as unknown as HAP, {} as never, { audio: { enabled: true, codec } });
    const types = { opus: hap.AudioStreamingCodecType.OPUS, pcma: hap.AudioStreamingCodecType.PCMA, pcmu: hap.AudioStreamingCodecType.PCMU };
    expect(options.streamingOptions?.audio?.codecs?.map(value => value.type)).toEqual([types[codec]]);
    expect(options.streamingOptions?.audio?.twoWayAudio).toBe(false);
  });

  it('advertises 30fps HomeKit streaming profiles for smoother playback', () => {
    const hap = createHap();
    const options = createCameraControllerOptions(
      hap as unknown as HAP,
      {} as never,
      { enabled: true },
    );

    expect(options.streamingOptions?.video?.resolutions).toContainEqual([1280, 720, 30]);
    expect(options.streamingOptions?.video?.resolutions).toContainEqual([1920, 1080, 30]);
  });

  it('marks motion service inactive when device status is offline', () => {
    const { hap, platform } = buildPlatform();
    const accessory = new MockAccessory('Camera', 'uuid-camera', hap);
    const device: BlinkCamera = { id: 2, network_id: 1, name: 'Camera', enabled: true, status: 'online' };

    const handler = new CameraAccessory(
      platform as unknown as BlinkCamerasPlatform,
      accessory as unknown as PlatformAccessory,
      device,
    );

    handler.updateState({ ...device, status: 'offline' });

    const statusActive = accessory
      .getService(hap.Service.MotionSensor)
      ?.getCharacteristic(hap.Characteristic.StatusActive)
      .value;

    expect(statusActive).toBe(false);
  });

  it('returns snapshot error when camera is offline even with cached image', async () => {
    const hap = createHap();
    const logFn = jest.fn();
    const apiClient = {
      requestCameraThumbnail: jest.fn(),
      requestOwlThumbnail: jest.fn(),
      requestDoorbellThumbnail: jest.fn(),
      pollCommand: jest.fn(),
      getAuthHeaders: jest.fn().mockReturnValue({ Authorization: 'Bearer token' }),
      getSharedRestRootUrl: jest.fn().mockReturnValue('https://rest-e006.immedia-semi.com/'),
    };

    const source = new BlinkCameraSource(
      apiClient as unknown as BlinkApi,
      hap as unknown as HAP,
      1,
      2,
      'camera',
      'TEST_SERIAL',
      () => 'https://rest-prod.immedia-semi.com/thumbnail.jpg',
      () => false,
      logFn,
      { enabled: false },
    );

    const testSource = source as unknown as { cachedSnapshot: Buffer | null; cachedSnapshotTime: number };
    testSource.cachedSnapshot = Buffer.from('cached');
    testSource.cachedSnapshotTime = Date.now();

    const callback = jest.fn();
    await source.handleSnapshotRequest({ width: 640, height: 360 } as SnapshotRequest, callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Error));
    expect(testSource.cachedSnapshot).toBeNull();
  });

  it('returns cached snapshot indefinitely when persistSnapshotCache is enabled', async () => {
    const hap = createHap();
    const logFn = jest.fn();
    const apiClient = {
      requestCameraThumbnail: jest.fn(),
      requestOwlThumbnail: jest.fn(),
      requestDoorbellThumbnail: jest.fn(),
      pollCommand: jest.fn(),
      getAuthHeaders: jest.fn().mockReturnValue({ Authorization: 'Bearer token' }),
      getSharedRestRootUrl: jest.fn().mockReturnValue('https://rest-e006.immedia-semi.com/'),
    };

    const source = new BlinkCameraSource(
      apiClient as unknown as BlinkApi,
      hap as unknown as HAP,
      1,
      2,
      'camera',
      'TEST_SERIAL',
      () => 'https://rest-prod.immedia-semi.com/thumbnail.jpg',
      () => true,
      logFn,
      { enabled: false, snapshotCacheTTL: 1, persistSnapshotCache: true },
    );

    const cached = Buffer.from('persisted');
    const testSource = source as unknown as { cachedSnapshot: Buffer | null; cachedSnapshotTime: number };
    testSource.cachedSnapshot = cached;
    testSource.cachedSnapshotTime = Date.now() - 10 * 60 * 1000;

    const callback = jest.fn();
    await source.handleSnapshotRequest({ width: 640, height: 360 } as SnapshotRequest, callback);

    expect(callback).toHaveBeenCalledWith(undefined, cached);
    expect(apiClient.requestCameraThumbnail).not.toHaveBeenCalled();
    expect(apiClient.pollCommand).not.toHaveBeenCalled();
  });

  it('refresh switch forces thumbnail refresh and resets to off', async () => {
    const refreshSpy = jest.spyOn(BlinkCameraSource.prototype, 'refreshSnapshotCache').mockResolvedValue();
    try {
      const { hap, platform } = buildPlatform({ persistSnapshotCache: true });
      const accessory = new MockAccessory('Camera', 'uuid-camera', hap);
      const device: BlinkCamera = { id: 2, network_id: 1, name: 'Camera', enabled: true };

      new CameraAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const refreshSwitch = accessory.getServiceById(hap.Service.Switch, 'snapshot-refresh');
      const characteristic = refreshSwitch?.getCharacteristic(hap.Characteristic.On);

      expect(refreshSwitch).toBeDefined();

      await characteristic?.onSetHandler?.(true);

      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(characteristic?.value).toBe(false);
    } finally {
      refreshSpy.mockRestore();
    }
  });

  it.each(['success', 'failure'])('resets the refresh switch after the actual HAP %s write commits', async (outcome) => {
    const refresh = jest.spyOn(BlinkCameraSource.prototype, 'refreshSnapshotCache');
    if (outcome === 'success') {
      refresh.mockResolvedValue();
    } else {
      refresh.mockRejectedValue(new Error('snapshot unavailable'));
    }
    try {
      const { hap, platform } = buildPlatform({ persistSnapshotCache: true });
      const accessory = new MockAccessory('Camera', 'uuid-camera', hap);
      new CameraAccessory(platform as unknown as BlinkCamerasPlatform, accessory as unknown as PlatformAccessory,
        { id: 2, network_id: 1, name: 'Camera', enabled: true });
      const service = accessory.getServiceById(hap.Service.Switch, 'snapshot-refresh')!;
      const handler = service.getCharacteristic(hap.Characteristic.On).onSetHandler!;
      // Exercise installed HAP's public write path, including its post-handler
      // value commit; invoking the handler alone cannot expose this regression.
      const characteristic = new HapCharacteristic.On();
      characteristic.onSet(handler as Parameters<typeof characteristic.onSet>[0]);
      jest.spyOn(service, 'getCharacteristic').mockReturnValue(characteristic as never);
      const changes: unknown[] = [];
      characteristic.on('change', change => changes.push(change.newValue));
      const writeError = await new Promise<unknown>(resolve => {
        characteristic.setValue(true, error => resolve(error ?? undefined));
      });
      await nextTurn();
      expect(Boolean(writeError)).toBe(outcome === 'failure');
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(characteristic.value).toBe(false);
      if (outcome === 'success') {
        expect(changes.slice(-2)).toEqual([true, false]);
      }
      characteristic.setValue(false);
      await nextTurn();
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(characteristic.value).toBe(false);
    } finally {
      refresh.mockRestore();
    }
  });

  it('refreshSnapshotCache bypasses persistent cache and updates cached buffer', async () => {
    const hap = createHap();
    const logFn = jest.fn();
    const apiClient = {
      requestCameraThumbnail: jest.fn().mockResolvedValue({ command_id: 10, captureOutcome: 'completed', thumbnail: 'https://rest-prod.immedia-semi.com/thumbnail.jpg' }),
      requestOwlThumbnail: jest.fn(),
      requestDoorbellThumbnail: jest.fn(),
      pollCommand: jest.fn().mockResolvedValue({ complete: true }),
      getAuthHeaders: jest.fn().mockReturnValue({ Authorization: 'Bearer token' }),
      getSharedRestRootUrl: jest.fn().mockReturnValue('https://rest-e006.immedia-semi.com/'),
    };
    const freshBuffer = Buffer.from('fresh-image');
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn().mockResolvedValue(testResponse({
      ok: true,
      arrayBuffer: async () =>
        freshBuffer.buffer.slice(freshBuffer.byteOffset, freshBuffer.byteOffset + freshBuffer.byteLength),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const source = new BlinkCameraSource(
        apiClient as unknown as BlinkApi,
        hap as unknown as HAP,
        1,
        2,
        'camera',
        'TEST_SERIAL',
        () => 'https://rest-prod.immedia-semi.com/thumbnail.jpg',
        () => true,
        logFn,
        { enabled: false, persistSnapshotCache: true },
      );

      const testSource = source as unknown as { cachedSnapshot: Buffer | null; cachedSnapshotTime: number };
      testSource.cachedSnapshot = Buffer.from('old-image');
      testSource.cachedSnapshotTime = Date.now() - 1000 * 60 * 60;

      await source.refreshSnapshotCache();

      expect(apiClient.requestCameraThumbnail).toHaveBeenCalledWith(1, 2, expect.objectContaining({ deadline: expect.any(Number) }));
      expect(apiClient.pollCommand).not.toHaveBeenCalled();
      expect(testSource.cachedSnapshot?.equals(freshBuffer)).toBe(true);

      const callback = jest.fn();
      await source.handleSnapshotRequest({ width: 640, height: 360 } as SnapshotRequest, callback);

      expect(apiClient.requestCameraThumbnail).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(undefined, expect.any(Buffer));
      const returnedBuffer = callback.mock.calls[0][1] as Buffer;
      expect(returnedBuffer.equals(freshBuffer)).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

});
