import { HAP, PlatformAccessory, SnapshotRequest } from 'homebridge';
import { CameraAccessory } from '../src/accessories/camera';
import { DoorbellAccessory } from '../src/accessories/doorbell';
import { NetworkAccessory } from '../src/accessories/network';
import { OwlAccessory } from '../src/accessories/owl';
import { BlinkCamerasPlatform } from '../src/platform';
import { BlinkCamera, BlinkDoorbell, BlinkNetwork, BlinkOwl } from '../src/types';
import { createHap, createLogger, MockAccessory } from './helpers/homebridge';
import { BlinkCameraSource, resolveStreamingConfig } from '../src/accessories/camera-source';
import { BlinkApi } from '../src/blink-api';
import { Buffer } from 'node:buffer';

type PlatformStub = Pick<BlinkCamerasPlatform, 'Service' | 'Characteristic' | 'apiClient' | 'log' | 'api' | 'streamingConfig'>;
type CameraSourceFfmpegAccess = {
  buildFfmpegArgs: (input: string, request: unknown, session: unknown) => string[];
};

describe('Accessory handlers', () => {
  const buildPlatform = (streamingConfigOverrides: Partial<ReturnType<typeof resolveStreamingConfig>> = {}) => {
    const hap = createHap();
    const log = createLogger();
    const apiClient = {
      armNetwork: jest.fn().mockResolvedValue({ command_id: 123 }),
      disarmNetwork: jest.fn().mockResolvedValue({ command_id: 124 }),
      pollCommand: jest.fn().mockResolvedValue({ complete: true }),
      enableCameraMotion: jest.fn(),
      disableCameraMotion: jest.fn(),
      enableDoorbellMotion: jest.fn(),
      disableDoorbellMotion: jest.fn(),
      enableOwlMotion: jest.fn(),
      disableOwlMotion: jest.fn(),
      requestCameraThumbnail: jest.fn().mockResolvedValue({ command_id: 1 }),
      requestOwlThumbnail: jest.fn().mockResolvedValue({ command_id: 1 }),
      requestDoorbellThumbnail: jest.fn().mockResolvedValue({ command_id: 1 }),
    };

    const platform: PlatformStub = {
      Service: hap.Service as unknown as BlinkCamerasPlatform['Service'],
      Characteristic: hap.Characteristic as unknown as BlinkCamerasPlatform['Characteristic'],
      apiClient: apiClient as unknown as BlinkCamerasPlatform['apiClient'],
      log: log as unknown as BlinkCamerasPlatform['log'],
      api: { hap } as unknown as BlinkCamerasPlatform['api'],
      streamingConfig: resolveStreamingConfig({ enabled: false, ...streamingConfigOverrides }),
    };

    return { hap, apiClient, platform, log };
  };

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

    expect(apiClient.armNetwork).toHaveBeenCalledWith(1);
    expect(device.armed).toBe(true);
    expect(handler).toBeInstanceOf(NetworkAccessory);
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

    expect(apiClient.disarmNetwork).toHaveBeenCalledWith(1);
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

    expect(apiClient.enableCameraMotion).toHaveBeenCalledWith(1, 2);
    expect(apiClient.disableCameraMotion).toHaveBeenCalledWith(1, 2);
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

    expect(apiClient.disableDoorbellMotion).toHaveBeenCalledWith(1, 3);
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

    expect(apiClient.enableOwlMotion).toHaveBeenCalledWith(2, 4);
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

  it('includes local RTP ports in SRTP output URLs', () => {
    const hap = createHap();
    const logFn = jest.fn();
    const apiClient = {
      requestCameraThumbnail: jest.fn(),
      requestOwlThumbnail: jest.fn(),
      requestDoorbellThumbnail: jest.fn(),
      pollCommand: jest.fn(),
    };

    const source = new BlinkCameraSource(
      apiClient as unknown as BlinkApi,
      hap as unknown as HAP,
      1,
      2,
      'camera',
      'TEST_SERIAL',
      jest.fn(),
      () => true,
      logFn,
    );

    const session = {
      address: '192.168.1.50',
      addressVersion: 'ipv4',
      sessionId: 'session',
      videoPort: 5000,
      localVideoPort: 5100,
      localVideoRtcpPort: 5102,
      videoCryptoSuite: hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      videoSRTP: Buffer.alloc(30, 1),
      videoSSRC: 1234,
      audioPort: 5001,
      localAudioPort: 5101,
      localAudioRtcpPort: 5103,
      audioCryptoSuite: hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      audioSRTP: Buffer.alloc(30, 2),
      audioSSRC: 5678,
    };

    const request = {
      type: 'start',
      sessionID: 'session',
      video: {
        fps: 15,
        width: 640,
        height: 480,
        max_bit_rate: 300,
        profile: hap.H264Profile.BASELINE,
        level: hap.H264Level.LEVEL3_1,
        pt: 99,
        mtu: 1378,
      },
      audio: {
        codec: hap.AudioStreamingCodecType.OPUS,
        channel: 1,
        sample_rate: hap.AudioStreamingSamplerate.KHZ_24,
        max_bit_rate: 24,
        pt: 110,
      },
    };

    const ffmpegSource = source as unknown as CameraSourceFfmpegAccess;
    const args = ffmpegSource.buildFfmpegArgs('tcp://127.0.0.1:1234', request, session);
    const argString = args.join(' ');

    expect(argString).toContain('localrtpport=5100');
    expect(argString).toContain('localrtcpport=5102');
    expect(argString).toContain('localrtpport=5101');
    expect(argString).toContain('localrtcpport=5103');
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
      () => 'https://example.com/thumbnail.jpg',
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
      () => 'https://example.com/thumbnail.jpg',
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

  it('refreshSnapshotCache bypasses persistent cache and updates cached buffer', async () => {
    const hap = createHap();
    const logFn = jest.fn();
    const apiClient = {
      requestCameraThumbnail: jest.fn().mockResolvedValue({ command_id: 10 }),
      requestOwlThumbnail: jest.fn(),
      requestDoorbellThumbnail: jest.fn(),
      pollCommand: jest.fn().mockResolvedValue({ complete: true }),
      getAuthHeaders: jest.fn().mockReturnValue({ Authorization: 'Bearer token' }),
      getSharedRestRootUrl: jest.fn().mockReturnValue('https://rest-e006.immedia-semi.com/'),
    };
    const freshBuffer = Buffer.from('fresh-image');
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        freshBuffer.buffer.slice(freshBuffer.byteOffset, freshBuffer.byteOffset + freshBuffer.byteLength),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const source = new BlinkCameraSource(
        apiClient as unknown as BlinkApi,
        hap as unknown as HAP,
        1,
        2,
        'camera',
        'TEST_SERIAL',
        () => 'https://example.com/thumbnail.jpg',
        () => true,
        logFn,
        { enabled: false, persistSnapshotCache: true },
      );

      const testSource = source as unknown as { cachedSnapshot: Buffer | null; cachedSnapshotTime: number };
      testSource.cachedSnapshot = Buffer.from('old-image');
      testSource.cachedSnapshotTime = Date.now() - 1000 * 60 * 60;

      await source.refreshSnapshotCache();

      expect(apiClient.requestCameraThumbnail).toHaveBeenCalledWith(1, 2);
      expect(apiClient.pollCommand).toHaveBeenCalledWith(1, 10);
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
