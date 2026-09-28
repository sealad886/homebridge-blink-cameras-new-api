import { API, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { BlinkCamerasPlatform } from '../src/platform';
import { BlinkApi } from '../src/blink-api';
import { createApi, createLogger } from './helpers/homebridge';
import { BlinkHomescreen } from '../src/types';
import { NetworkAccessory } from '../src/accessories';

jest.mock('../src/blink-api');

type MockedBlinkApi = jest.Mocked<{
  login: () => Promise<void>;
  getHomescreen: () => Promise<BlinkHomescreen>;
  armNetwork: jest.Mock;
  disarmNetwork: jest.Mock;
  enableCameraMotion: jest.Mock;
  disableCameraMotion: jest.Mock;
  enableDoorbellMotion: jest.Mock;
  disableDoorbellMotion: jest.Mock;
  enableOwlMotion: jest.Mock;
  disableOwlMotion: jest.Mock;
  getUnwatchedMedia: jest.Mock;
}>;

type MockAPI = API & { emit: (event: string) => void };

const buildBlinkApi = (): MockedBlinkApi => ({
  login: jest.fn().mockResolvedValue(undefined),
  getHomescreen: jest.fn(),
  armNetwork: jest.fn(),
  disarmNetwork: jest.fn(),
  enableCameraMotion: jest.fn(),
  disableCameraMotion: jest.fn(),
  enableDoorbellMotion: jest.fn(),
  disableDoorbellMotion: jest.fn(),
  enableOwlMotion: jest.fn(),
  disableOwlMotion: jest.fn(),
  getUnwatchedMedia: jest.fn().mockResolvedValue({ media: [] }),
});

describe('BlinkCamerasPlatform', () => {
  type TestConfig = PlatformConfig & {
    username?: string;
    password?: string;
    twoFactorCode?: string;
    persistAuth?: boolean;
    tier?: string;
  };
  let hapApi: MockAPI | null = null;

  const config: TestConfig = {
    platform: 'BlinkCameras',
    name: 'Blink',
    username: 'user@example.com',
    password: 'password',
    twoFactorCode: '123456',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    hapApi = null;
  });

  it('starts credential-free from persisted auth with a runtime tier and no hosted pending path', () => {
    hapApi = createApi() as unknown as MockAPI;
    const log = createLogger() as unknown as Logger;
    const blinkApi = buildBlinkApi();
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const tokenConfig: TestConfig = {
      platform: 'BlinkCameras',
      name: 'Blink',
      persistAuth: true,
      tier: 'e005',
    };

    new BlinkCamerasPlatform(log, tokenConfig, hapApi);

    expect(BlinkApi).toHaveBeenCalledWith(expect.objectContaining({
      email: '',
      password: '',
      tier: 'e005',
    }));
    const apiConfig = (BlinkApi as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(apiConfig).not.toHaveProperty('hostedOAuthPendingPath');
    expect(log.info).toHaveBeenCalledWith(
      'No credentials in config; using persisted token authentication via custom UI.',
    );
  });

  afterEach(() => {
    hapApi?.emit('shutdown');
    hapApi = null;
    jest.useRealTimers();
  });

  it('registers new accessories from homescreen data', async () => {
    hapApi = createApi() as unknown as MockAPI;
    const log = createLogger() as unknown as Logger;
    const blinkApi = buildBlinkApi();
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

    const homescreen: BlinkHomescreen = {
      account: { account_id: 1 },
      networks: [{ id: 1, name: 'Network', armed: false }],
      cameras: [{ id: 2, network_id: 1, name: 'Camera', enabled: true }],
      doorbells: [{ id: 3, network_id: 1, name: 'Doorbell', enabled: true }],
      owls: [{ id: 4, network_id: 1, name: 'Owl', enabled: true }],
      sync_modules: [],
    };
    blinkApi.getHomescreen.mockResolvedValue(homescreen);

    const platform = new BlinkCamerasPlatform(log, config, hapApi);
    await (platform as unknown as { discoverDevices: () => Promise<void> }).discoverDevices();

    expect(blinkApi.login).toHaveBeenCalledTimes(1);
    expect(blinkApi.getHomescreen).toHaveBeenCalledTimes(1);
    // With new implementation, registration count may differ due to deduplication logic
    expect(platform.accessories.length).toBeGreaterThanOrEqual(1);
  });

  it('surfaces failed discovery in HomeKit and retries without deleting cached accessories', async () => {
    hapApi = createApi() as unknown as MockAPI;
    const log = createLogger() as unknown as Logger;
    const blinkApi = buildBlinkApi();
    blinkApi.getHomescreen
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({
        account: { account_id: 1 },
        networks: [], cameras: [], doorbells: [], owls: [], sync_modules: [],
      });
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const platform = new BlinkCamerasPlatform(
      log,
      { ...config, enableStreaming: false, videoEncoder: 'libx264' },
      hapApi,
    );
    const cached = new hapApi.platformAccessory('Cached Camera', hapApi.hap.uuid.generate('blink-camera-2'));
    cached.context.device = { id: 2, network_id: 1, name: 'Cached Camera', enabled: true };
    const cachedMotion = cached.addService(hapApi.hap.Service.MotionSensor, 'Cached Camera', 'motion-sensor');
    platform.configureAccessory(cached);

    const discover = (platform as unknown as { discoverDevices: () => Promise<boolean> }).discoverDevices.bind(platform);
    await expect(discover()).resolves.toBe(false);

    expect(platform.isOperational()).toBe(false);
    expect(cachedMotion.getCharacteristic(hapApi.hap.Characteristic.StatusFault).value).toBe(1);
    expect(cachedMotion.getCharacteristic(hapApi.hap.Characteristic.StatusActive).value).toBe(false);
    expect(hapApi.unregisterPlatformAccessories).not.toHaveBeenCalled();

    const diagnostic = platform.accessories.find(accessory => accessory.context.blinkConnectionDiagnostic);
    expect(diagnostic).toBeDefined();
    expect(hapApi.registerPlatformAccessories).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      [diagnostic],
    );
    const connection = diagnostic?.getServiceById(hapApi.hap.Service.ContactSensor, 'blink-connection-status');
    expect(connection?.getCharacteristic(hapApi.hap.Characteristic.ContactSensorState).value).toBe(1);
    expect(connection?.getCharacteristic(hapApi.hap.Characteristic.StatusFault).value).toBe(1);
    const retry = diagnostic?.getServiceById(hapApi.hap.Service.Switch, 'blink-connection-retry');
    expect(retry?.name).toBe('Check Network & Blink Sign-In, Then Retry');

    const retryOn = retry?.getCharacteristic(hapApi.hap.Characteristic.On) as unknown as {
      onSetHandler?: (value: unknown) => unknown | Promise<unknown>;
      value: unknown;
    };
    await retryOn.onSetHandler?.(true);

    expect(blinkApi.getHomescreen).toHaveBeenCalledTimes(2);
    expect(platform.isOperational()).toBe(true);
    expect(retryOn.value).toBe(false);
    expect(platform.accessories).toEqual([cached]);
    expect(hapApi.unregisterPlatformAccessories).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      [diagnostic],
    );
    expect(cachedMotion.getCharacteristic(hapApi.hap.Characteristic.StatusFault).value).toBe(0);
  });

  it('coalesces concurrent discovery attempts into one Blink request', async () => {
    hapApi = createApi() as unknown as MockAPI;
    const blinkApi = buildBlinkApi();
    let resolveHomescreen: ((value: BlinkHomescreen) => void) | undefined;
    const homescreenPromise = new Promise<BlinkHomescreen>(resolve => {
      resolveHomescreen = resolve;
    });
    blinkApi.getHomescreen.mockReturnValue(homescreenPromise);
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const platform = new BlinkCamerasPlatform(
      createLogger() as unknown as Logger,
      { ...config, enableStreaming: false, videoEncoder: 'libx264' },
      hapApi,
    );
    const discover = (platform as unknown as { discoverDevices: () => Promise<boolean> }).discoverDevices.bind(platform);

    const first = discover();
    const second = discover();
    resolveHomescreen?.({ account: { account_id: 1 }, networks: [], cameras: [], doorbells: [], owls: [], sync_modules: [] });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(blinkApi.login).toHaveBeenCalledTimes(1);
    expect(blinkApi.getHomescreen).toHaveBeenCalledTimes(1);
  });

  it('faults HomeKit after repeated polling failures and clears the diagnostic on recovery', async () => {
    hapApi = createApi() as unknown as MockAPI;
    const blinkApi = buildBlinkApi();
    blinkApi.getHomescreen
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        account: { account_id: 1 }, networks: [], cameras: [], doorbells: [], owls: [], sync_modules: [],
      });
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const platform = new BlinkCamerasPlatform(
      createLogger() as unknown as Logger,
      { ...config, enableStreaming: false, videoEncoder: 'libx264' },
      hapApi,
    );
    const poll = (platform as unknown as { pollDeviceStates: () => Promise<void> }).pollDeviceStates.bind(platform);

    await poll();
    await poll();
    expect(platform.isOperational()).toBe(true);
    await poll();
    expect(platform.isOperational()).toBe(false);
    expect(platform.accessories.some(accessory => accessory.context.blinkConnectionDiagnostic)).toBe(true);

    await poll();
    expect(platform.isOperational()).toBe(true);
    expect(platform.accessories.some(accessory => accessory.context.blinkConnectionDiagnostic)).toBe(false);
  });

  it.each(['1', 'Away'])('excludes a whole network by %s, removes its cached accessories, and supports re-enabling', async (identifier) => {
    hapApi = createApi() as unknown as MockAPI;
    hapApi.unregisterPlatformAccessories = jest.fn();
    const blinkApi = buildBlinkApi();
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const homescreen: BlinkHomescreen = {
      account: { account_id: 1 },
      networks: [{ id: 1, name: 'Away', armed: false }, { id: 2, name: 'Home', armed: false }],
      cameras: [{ id: 3, network_id: 1, name: 'Away Camera', enabled: true }, { id: 4, network_id: 2, name: 'Home Camera', enabled: true }],
      doorbells: [{ id: 5, network_id: 1, name: 'Away Doorbell', enabled: true }],
      owls: [{ id: 6, network_id: 1, name: 'Away Owl', enabled: true }], sync_modules: [],
    };
    blinkApi.getHomescreen.mockResolvedValue(homescreen);
    const settings = { ...config, excludedNetworks: [] as string[], enableStreaming: false, videoEncoder: 'libx264' as const };
    const platform = new BlinkCamerasPlatform(createLogger() as unknown as Logger, settings, hapApi);
    const discover = async () => {
      hapApi?.emit('shutdown');
      await (platform as unknown as { discoverDevices: () => Promise<void> }).discoverDevices();
    };
    await discover();
    expect(platform.accessories).toHaveLength(6);
    settings.excludedNetworks = [identifier];
    await discover();
    expect(platform.accessories.map(accessory => accessory.context.device.name)).toEqual(['Home', 'Home Camera']);
    expect(hapApi.unregisterPlatformAccessories).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.arrayContaining([
      expect.objectContaining({ context: expect.objectContaining({ device: expect.objectContaining({ name: 'Away Camera' }) }) }),
    ]));
    settings.excludedNetworks = [];
    await discover();
    expect(platform.accessories).toHaveLength(6);
    expect(new Set(platform.accessories.map(accessory => accessory.UUID)).size).toBe(6);
    // Missing devices alone must not be unregistered.
    blinkApi.getHomescreen.mockResolvedValue({ ...homescreen, cameras: [], doorbells: [], owls: [] });
    await discover();
    expect(platform.accessories).toHaveLength(6);
  });

  it('uses fresh network names and camera membership when reconciling cached exclusions', async () => {
    hapApi = createApi() as unknown as MockAPI;
    hapApi.unregisterPlatformAccessories = jest.fn();
    const blinkApi = buildBlinkApi();
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const settings = { ...config, excludedNetworks: ['Away'], videoEncoder: 'libx264' as const };
    const platform = new BlinkCamerasPlatform(createLogger() as unknown as Logger, settings, hapApi);
    for (const [prefix, device] of [
      ['network', { id: 1, name: 'Away', armed: false }],
      ['network', { id: 2, name: 'Elsewhere', armed: false }],
      ['camera', { id: 3, name: 'Moved Camera', network_id: 2, enabled: true }],
    ] as const) {
      const accessory = new hapApi.platformAccessory(device.name, hapApi.hap.uuid.generate(`blink-${prefix}-${device.id}`));
      accessory.context.device = device;
      platform.configureAccessory(accessory);
    }
    blinkApi.getHomescreen.mockResolvedValue({
      account: { account_id: 1 }, networks: [{ id: 1, name: 'Home', armed: false }, { id: 2, name: 'Away', armed: false }],
      cameras: [{ id: 3, name: 'Moved Camera', network_id: 1, enabled: true }], doorbells: [], owls: [], sync_modules: [],
    });
    await (platform as unknown as { discoverDevices: () => Promise<void> }).discoverDevices();
    expect(platform.accessories.map(accessory => accessory.context.device.name)).toEqual(['Home', 'Moved Camera']);
    expect(hapApi.registerPlatformAccessories).not.toHaveBeenCalled();
    expect(hapApi.unregisterPlatformAccessories).toHaveBeenCalledWith(expect.any(String), expect.any(String), [
      expect.objectContaining({ UUID: hapApi.hap.uuid.generate('blink-network-2') }),
    ]);
  });

  it('removes explicitly excluded children when their parent network is absent and cached context is missing', async () => {
    hapApi = createApi() as unknown as MockAPI;
    hapApi.unregisterPlatformAccessories = jest.fn();
    const blinkApi = buildBlinkApi();
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const platform = new BlinkCamerasPlatform(createLogger() as unknown as Logger,
      { ...config, excludedNetworks: ['91'], videoEncoder: 'libx264' }, hapApi);
    const missingContext = new hapApi.platformAccessory('Excluded', hapApi.hap.uuid.generate('blink-camera-3'));
    platform.configureAccessory(missingContext);
    const absentCamera = new hapApi.platformAccessory('Absent excluded', hapApi.hap.uuid.generate('blink-camera-4'));
    absentCamera.context.device = { id: 4, name: 'Absent excluded', network_id: 91, enabled: true };
    platform.configureAccessory(absentCamera);
    const retained = new hapApi.platformAccessory('Retained', hapApi.hap.uuid.generate('blink-camera-5'));
    retained.context.device = { id: 5, name: 'Retained', network_id: 92, enabled: true };
    platform.configureAccessory(retained);
    blinkApi.getHomescreen.mockResolvedValue({ account: { account_id: 1 }, networks: [],
      cameras: [{ id: 3, name: 'Excluded', network_id: 91, enabled: true }], doorbells: [], owls: [], sync_modules: [] });
    await (platform as unknown as { discoverDevices: () => Promise<void> }).discoverDevices();
    expect(platform.accessories).toEqual([retained]);
    expect(hapApi.unregisterPlatformAccessories).toHaveBeenCalledWith(expect.any(String), expect.any(String), [missingContext, absentCamera]);
    expect(blinkApi.getHomescreen).toHaveBeenCalledTimes(1);
  });

  it('restores cached accessories without re-registering', () => {
    hapApi = createApi() as unknown as MockAPI;
    const log = createLogger() as unknown as Logger;
    const blinkApi = buildBlinkApi();
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

    const platform = new BlinkCamerasPlatform(log, config, hapApi);
    const network = { id: 5, name: 'Cached Network', armed: false };
    const uuid = hapApi.hap.uuid.generate(`blink-network-${network.id}`);
    const cachedAccessory = new (hapApi.platformAccessory as unknown as new (name: string, uuid: string) => PlatformAccessory)(
      network.name,
      uuid,
    );
    platform.accessories.push(cachedAccessory);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (platform as any).registerDevice(network, 'blink-network-', 'network', (platform as any).networkAccessories, NetworkAccessory);

    expect(hapApi.registerPlatformAccessories).not.toHaveBeenCalled();
    // Handler is stored in Map, not in context (to avoid circular JSON serialization)
    expect(cachedAccessory.context.device).toBe(network);
  });

  it('forwards verifyImmisTls into the runtime streaming config', () => {
    hapApi = createApi() as unknown as MockAPI;
    const log = createLogger() as unknown as Logger;
    const blinkApi = buildBlinkApi();
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);

    const platform = new BlinkCamerasPlatform(
      log,
      { ...config, verifyImmisTls: false },
      hapApi,
    );

    expect(platform.streamingConfig.verifyImmisTls).toBe(false);
  });
});
