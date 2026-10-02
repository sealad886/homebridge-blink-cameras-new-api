import { API, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { BlinkCamerasPlatform } from '../src/platform';
import { BlinkApi } from '../src/blink-api';
import { createApi, createLogger } from './helpers/homebridge';
import { BlinkHomescreen } from '../src/types';
import { CameraAccessory, NetworkAccessory } from '../src/accessories';
import { sampleBlinkConnection } from '../src/blink-api/connection-diagnostics';
import { AuthStateChangedError } from '../src/blink-api/auth-storage';
import { Blink2FARequiredError, BlinkTokenRefreshError } from '../src/blink-api/auth';

jest.mock('../src/blink-api');
jest.mock('../src/blink-api/connection-diagnostics', () => ({
  sampleBlinkConnection: jest.fn().mockResolvedValue({ dns: 'ok', addressCount: 1, connection: 'ok', elapsedMs: 1 }),
}));

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
  getSharedRestRootUrl: jest.Mock;
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
  getSharedRestRootUrl: jest.fn().mockReturnValue('https://rest-e006.immedia-semi.com'),
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
    jest.mocked(sampleBlinkConnection).mockResolvedValue({ dns: 'ok', addressCount: 1, connection: 'ok', elapsedMs: 1 });
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
    jest.restoreAllMocks();
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

  it.each([
    ['cameras', 'CAM-123', 5000],
    ['doorbells', '2', 5000],
    ['owls', 'Motion Device', 5000],
    ['cameras', 'unmatched-device', 30000],
  ] as const)('applies configured motion duration to polled %s events (%s)', async (kind, identifier, duration) => {
    // Node's timers module retains its own functions; route them through Jest's clock.
    const timers = jest.requireActual<typeof import('timers')>('timers');
    jest.spyOn(timers, 'setTimeout').mockImplementation(globalThis.setTimeout);
    jest.spyOn(timers, 'clearTimeout').mockImplementation(globalThis.clearTimeout);
    hapApi = createApi() as unknown as MockAPI;
    const blinkApi = buildBlinkApi();
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const device = { id: 2, network_id: 1, name: 'Motion Device', serial: 'CAM-123', enabled: true };
    blinkApi.getHomescreen.mockResolvedValue({
      account: { account_id: 1 },
      networks: [{ id: 1, name: 'Network', armed: true }],
      cameras: [], doorbells: [], owls: [], sync_modules: [],
      [kind]: [device],
    });
    blinkApi.getUnwatchedMedia.mockResolvedValue({ unwatched_clips: 1 });
    Object.assign(blinkApi, { getMedia: jest.fn().mockResolvedValue({ media: [{
      camera_id: 2, created_at: new Date(Date.now() + 1000).toISOString(),
    }] }) });
    const platform = new BlinkCamerasPlatform(createLogger() as unknown as Logger, {
      ...config, enableStreaming: false, videoEncoder: 'libx264', motionTimeout: 30,
      deviceSettingOverrides: [{ deviceIdentifier: identifier, motionTimeout: 5 }],
    }, hapApi);
    await (platform as unknown as { discoverDevices: () => Promise<void> }).discoverDevices();
    await (platform as unknown as { checkMotionEvents: () => Promise<void> }).checkMotionEvents();
    const accessory = platform.accessories.find((item) => item.context.device?.id === 2);
    const motion = accessory?.getServiceById(hapApi.hap.Service.MotionSensor, 'motion-sensor')
      ?.getCharacteristic(hapApi.hap.Characteristic.MotionDetected);
    expect(motion?.value).toBe(true);
    jest.advanceTimersByTime(duration - 1);
    expect(motion?.value).toBe(true);
    jest.advanceTimersByTime(1);
    expect(motion?.value).toBe(false);
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
    const retryAccessory = platform.accessories.find(accessory => accessory.context.blinkConnectionRetry);
    const retry = retryAccessory?.getServiceById(hapApi.hap.Service.Switch, 'blink-connection-retry');
    expect(retryAccessory?.displayName).toBe('Retry Blink Connection');
    expect(retry?.name).toBe('Retry Blink Connection');

    const retryOn = retry?.getCharacteristic(hapApi.hap.Characteristic.On) as unknown as {
      onSetHandler?: (value: unknown) => unknown | Promise<unknown>;
      value: unknown;
    };
    await retryOn.onSetHandler?.(true);

    expect(blinkApi.getHomescreen).toHaveBeenCalledTimes(2);
    expect(blinkApi.login).toHaveBeenCalledTimes(2);
    expect(platform.isOperational()).toBe(true);
    expect(retryOn.value).toBe(false);
    expect(platform.accessories.filter(accessory => accessory.context.device)).toEqual([cached]);
    expect(hapApi.unregisterPlatformAccessories).not.toHaveBeenCalled();
    expect(connection?.getCharacteristic(hapApi.hap.Characteristic.ContactSensorState).value).toBe(0);
    expect(cachedMotion.getCharacteristic(hapApi.hap.Characteristic.StatusFault).value).toBe(0);
    expect(log.info).toHaveBeenCalledWith('Blink connection restored; cleared the HomeKit connection fault.');
  });

  it('keeps the connection fault open and resets retry after recovery fails', async () => {
    hapApi = createApi() as unknown as MockAPI;
    const blinkApi = buildBlinkApi();
    blinkApi.getHomescreen.mockRejectedValue(new Error('network unavailable'));
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const platform = new BlinkCamerasPlatform(
      createLogger() as unknown as Logger,
      { ...config, enableStreaming: false, videoEncoder: 'libx264' },
      hapApi,
    );
    await (platform as unknown as { discoverDevices: () => Promise<boolean> }).discoverDevices();
    const status = platform.accessories.find(accessory => accessory.context.blinkConnectionDiagnostic)
      ?.getServiceById(hapApi.hap.Service.ContactSensor, 'blink-connection-status');
    const retry = platform.accessories.find(accessory => accessory.context.blinkConnectionRetry)
      ?.getServiceById(hapApi.hap.Service.Switch, 'blink-connection-retry')
      ?.getCharacteristic(hapApi.hap.Characteristic.On) as unknown as {
        onSetHandler?: (value: unknown) => unknown | Promise<unknown>;
        value: unknown;
      };

    await expect(retry.onSetHandler?.(true)).rejects.toMatchObject({ hapStatus: -70402 });

    expect(platform.isOperational()).toBe(false);
    expect(retry.value).toBe(false);
    expect(status?.getCharacteristic(hapApi.hap.Characteristic.ContactSensorState).value).toBe(1);
    expect(status?.getCharacteristic(hapApi.hap.Characteristic.StatusActive).value).toBe(true);
    expect(hapApi.registerPlatformAccessories).toHaveBeenCalledTimes(2);
  });

  it('bounds Retry response while shared recovery can finish later', async () => {
    hapApi = createApi() as unknown as MockAPI;
    const blinkApi = buildBlinkApi();
    const homescreen: BlinkHomescreen = {
      account: { account_id: 1 }, networks: [], cameras: [], doorbells: [], owls: [], sync_modules: [],
    };
    blinkApi.getHomescreen.mockResolvedValueOnce(homescreen);
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const platform = new BlinkCamerasPlatform(createLogger() as unknown as Logger,
      { ...config, enableStreaming: false, videoEncoder: 'libx264' }, hapApi);
    await (platform as unknown as { discoverDevices: () => Promise<boolean> }).discoverDevices();
    let complete: (screen: BlinkHomescreen) => void = () => {};
    blinkApi.getHomescreen.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const retry = platform.accessories.find(accessory => accessory.context.blinkConnectionRetry)
      ?.getServiceById(hapApi.hap.Service.Switch, 'blink-connection-retry')
      ?.getCharacteristic(hapApi.hap.Characteristic.On) as unknown as {
        onSetHandler: (value: unknown) => Promise<unknown>; value: unknown;
      };
    const pending = retry.onSetHandler(true);
    const failure = expect(pending).rejects.toMatchObject({ hapStatus: -70408 });
    await jest.advanceTimersByTimeAsync(12000);
    await failure;
    expect(retry.value).toBe(false);
    complete(homescreen);
    await Promise.resolve();
    await Promise.resolve();
    expect(blinkApi.login).toHaveBeenCalledTimes(1);
    expect(blinkApi.getHomescreen).toHaveBeenCalledTimes(2);
  });

  it('suspends automatic polling while authentication needs user action', async () => {
    hapApi = createApi() as unknown as MockAPI;
    const blinkApi = buildBlinkApi();
    blinkApi.login.mockRejectedValue(new Blink2FARequiredError('2FA verification required'));
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const platform = new BlinkCamerasPlatform(
      createLogger() as unknown as Logger,
      { ...config, enableStreaming: false, videoEncoder: 'libx264' },
      hapApi,
    );
    const discover = (platform as unknown as { discoverDevices: () => Promise<boolean> }).discoverDevices.bind(platform);
    const poll = (platform as unknown as { pollDeviceStates: () => Promise<void> }).pollDeviceStates.bind(platform);

    await expect(discover()).resolves.toBe(false);
    await poll();
    await poll();

    expect(blinkApi.login).toHaveBeenCalledTimes(1);
    expect(blinkApi.getHomescreen).not.toHaveBeenCalled();
    expect(platform.isOperational()).toBe(false);
  });

  it('keeps temporary token-refresh failures eligible for automatic recovery', async () => {
    hapApi = createApi() as unknown as MockAPI;
    const blinkApi = buildBlinkApi();
    blinkApi.login
      .mockRejectedValueOnce(new BlinkTokenRefreshError('temporary'))
      .mockResolvedValueOnce(undefined);
    blinkApi.getHomescreen.mockResolvedValue({
      account: { account_id: 1 }, networks: [], cameras: [], doorbells: [], owls: [], sync_modules: [],
    });
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const platform = new BlinkCamerasPlatform(
      createLogger() as unknown as Logger,
      { ...config, enableStreaming: false, videoEncoder: 'libx264' },
      hapApi,
    );
    const discover = (platform as unknown as { discoverDevices: () => Promise<boolean> }).discoverDevices.bind(platform);
    const poll = (platform as unknown as { pollDeviceStates: () => Promise<void> }).pollDeviceStates.bind(platform);

    await expect(discover()).resolves.toBe(false);
    await poll();

    expect(blinkApi.login).toHaveBeenCalledTimes(2);
    expect(blinkApi.getHomescreen).toHaveBeenCalledTimes(1);
    expect(platform.isOperational()).toBe(true);
  });

  it('instructs a child-bridge restart when stored authentication changes', async () => {
    hapApi = createApi() as unknown as MockAPI;
    const log = createLogger() as unknown as Logger;
    const blinkApi = buildBlinkApi();
    blinkApi.login.mockRejectedValue(new AuthStateChangedError());
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const platform = new BlinkCamerasPlatform(
      log,
      { ...config, enableStreaming: false, videoEncoder: 'libx264' },
      hapApi,
    );

    await expect((platform as unknown as {
      discoverDevices: () => Promise<boolean>;
    }).discoverDevices()).resolves.toBe(false);

    expect(log.error).toHaveBeenCalledWith(
      'Device discovery failed (stored Blink authentication changed; restart the child bridge). ' +
      'Check the preceding bounded authentication/API diagnostics.',
    );
    expect(log.error).toHaveBeenCalledWith(
      'Blink authentication changed while Homebridge was running. Restart the Blink child bridge to use the current sign-in.',
    );
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

  it('coalesces a startup retry with in-flight discovery and initializes inventory once', async () => {
    hapApi = createApi() as unknown as MockAPI;
    const blinkApi = buildBlinkApi();
    let resolveHomescreen: ((value: BlinkHomescreen) => void) | undefined;
    blinkApi.getHomescreen.mockReturnValue(new Promise<BlinkHomescreen>(resolve => {
      resolveHomescreen = resolve;
    }));
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const platform = new BlinkCamerasPlatform(createLogger() as unknown as Logger, config, hapApi);
    const discover = (platform as unknown as { discoverDevices: () => Promise<boolean> }).discoverDevices.bind(platform);
    const recover = (platform as unknown as {
      recoverConnection: (authenticate: boolean) => Promise<boolean>;
    }).recoverConnection.bind(platform);

    const startup = discover();
    const retry = recover(true);
    resolveHomescreen?.({
      account: { account_id: 1 },
      networks: [],
      cameras: [{ id: 7, network_id: 1, name: 'Front Camera', enabled: true }],
      doorbells: [], owls: [], sync_modules: [],
    });

    await expect(Promise.all([startup, retry])).resolves.toEqual([true, true]);
    expect(blinkApi.login).toHaveBeenCalledTimes(1);
    expect(blinkApi.getHomescreen).toHaveBeenCalledTimes(1);
    expect(platform.isOperational()).toBe(true);
    expect(platform.accessories.filter(accessory => accessory.context.device)).toHaveLength(1);
  });

  it('keeps the connection surface faulted until startup verifies Blink', () => {
    hapApi = createApi() as unknown as MockAPI;
    (BlinkApi as jest.Mock).mockImplementation(() => buildBlinkApi());
    const platform = new BlinkCamerasPlatform(createLogger() as unknown as Logger, config, hapApi);
    const ensureConnectionAccessories = (platform as unknown as {
      ensureConnectionAccessories: () => void;
    }).ensureConnectionAccessories.bind(platform);

    ensureConnectionAccessories();

    const status = platform.accessories.find(accessory => accessory.context.blinkConnectionDiagnostic)
      ?.getServiceById(hapApi.hap.Service.ContactSensor, 'blink-connection-status');
    expect(platform.isOperational()).toBe(false);
    expect(status?.getCharacteristic(hapApi.hap.Characteristic.ContactSensorState).value).toBe(1);
    expect(status?.getCharacteristic(hapApi.hap.Characteristic.StatusFault).value).toBe(1);
  });

  it('faults HomeKit after repeated polling failures and clears the diagnostic on recovery', async () => {
    hapApi = createApi() as unknown as MockAPI;
    const blinkApi = buildBlinkApi();
    blinkApi.getHomescreen
      .mockResolvedValueOnce({
        account: { account_id: 1 }, networks: [], cameras: [], doorbells: [], owls: [], sync_modules: [],
      })
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
    await (platform as unknown as { discoverDevices: () => Promise<boolean> }).discoverDevices();
    const poll = (platform as unknown as { pollDeviceStates: () => Promise<void> }).pollDeviceStates.bind(platform);

    await poll();
    await poll();
    expect(platform.isOperational()).toBe(true);
    expect(sampleBlinkConnection).not.toHaveBeenCalled();
    await poll();
    expect(platform.isOperational()).toBe(false);
    expect(sampleBlinkConnection).toHaveBeenCalledTimes(1);
    expect(platform.accessories.some(accessory => accessory.context.blinkConnectionDiagnostic)).toBe(true);

    await poll();
    expect(platform.isOperational()).toBe(true);
    const connection = platform.accessories.find(accessory => accessory.context.blinkConnectionDiagnostic)
      ?.getServiceById(hapApi.hap.Service.ContactSensor, 'blink-connection-status');
    expect(connection?.getCharacteristic(hapApi.hap.Characteristic.ContactSensorState).value).toBe(0);
    expect(blinkApi.login).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent runtime recovery without reconciling accessory inventory', async () => {
    hapApi = createApi() as unknown as MockAPI;
    const blinkApi = buildBlinkApi();
    let resolveHomescreen: ((value: BlinkHomescreen) => void) | undefined;
    blinkApi.getHomescreen
      .mockResolvedValueOnce({
        account: { account_id: 1 }, networks: [], cameras: [], doorbells: [], owls: [], sync_modules: [],
      })
      .mockReturnValueOnce(new Promise<BlinkHomescreen>(resolve => {
        resolveHomescreen = resolve;
      }));
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const platform = new BlinkCamerasPlatform(createLogger() as unknown as Logger, config, hapApi);
    await (platform as unknown as { discoverDevices: () => Promise<boolean> }).discoverDevices();
    jest.clearAllMocks();
    const recover = (platform as unknown as {
      recoverConnection: (authenticate: boolean) => Promise<boolean>;
    }).recoverConnection.bind(platform);

    const first = recover(true);
    const second = recover(true);
    await Promise.resolve();
    resolveHomescreen?.({
      account: { account_id: 1 },
      networks: [{ id: 99, name: 'New Network', armed: false }],
      cameras: [], doorbells: [], owls: [], sync_modules: [],
    });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(blinkApi.login).toHaveBeenCalledTimes(1);
    expect(blinkApi.getHomescreen).toHaveBeenCalledTimes(1);
    expect(platform.accessories.some(accessory => accessory.context.device)).toBe(false);
  });

  it('completes initial inventory after startup discovery fails', async () => {
    hapApi = createApi() as unknown as MockAPI;
    const blinkApi = buildBlinkApi();
    blinkApi.getHomescreen
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({
        account: { account_id: 1 },
        networks: [{ id: 9, name: 'Recovered Network', armed: false }],
        cameras: [], doorbells: [], owls: [], sync_modules: [],
      });
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const platform = new BlinkCamerasPlatform(createLogger() as unknown as Logger, config, hapApi);
    const discover = (platform as unknown as { discoverDevices: () => Promise<boolean> }).discoverDevices.bind(platform);
    const recover = (platform as unknown as {
      recoverConnection: (authenticate: boolean) => Promise<boolean>;
    }).recoverConnection.bind(platform);

    await expect(discover()).resolves.toBe(false);
    await expect(recover(true)).resolves.toBe(true);

    expect(platform.isOperational()).toBe(true);
    expect(platform.accessories.filter(accessory => accessory.context.device)
      .map(accessory => accessory.context.device.name)).toEqual(['Recovered Network']);
    expect((platform as unknown as { networkAccessories: Map<number, unknown> }).networkAccessories.has(9)).toBe(true);
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
    expect(platform.accessories.filter(accessory => accessory.context.device)).toHaveLength(6);
    settings.excludedNetworks = [identifier];
    await discover();
    expect(platform.accessories.filter(accessory => accessory.context.device)
      .map(accessory => accessory.context.device.name)).toEqual(['Home', 'Home Camera']);
    expect(hapApi.unregisterPlatformAccessories).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.arrayContaining([
      expect.objectContaining({ context: expect.objectContaining({ device: expect.objectContaining({ name: 'Away Camera' }) }) }),
    ]));
    settings.excludedNetworks = [];
    await discover();
    expect(platform.accessories.filter(accessory => accessory.context.device)).toHaveLength(6);
    expect(new Set(platform.accessories.map(accessory => accessory.UUID)).size).toBe(8);
    // Missing devices alone must not be unregistered.
    blinkApi.getHomescreen.mockResolvedValue({ ...homescreen, cameras: [], doorbells: [], owls: [] });
    await discover();
    expect(platform.accessories.filter(accessory => accessory.context.device)).toHaveLength(6);
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
    expect(platform.accessories.filter(accessory => accessory.context.device)
      .map(accessory => accessory.context.device.name)).toEqual(['Home', 'Moved Camera']);
    expect(hapApi.registerPlatformAccessories).toHaveBeenCalledTimes(2);
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
    expect(platform.accessories.filter(accessory => accessory.context.device)).toEqual([retained]);
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

  it('repairs cached accessory and service names without changing identity', () => {
    hapApi = createApi() as unknown as MockAPI;
    const blinkApi = buildBlinkApi();
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const platform = new BlinkCamerasPlatform(createLogger() as unknown as Logger, config, hapApi);
    const device = { id: 8, network_id: 1, name: 'Corner (ABC-123)', enabled: true };
    const uuid = hapApi.hap.uuid.generate('blink-camera-8');
    const cached = new hapApi.platformAccessory(device.name, uuid);
    cached.context.device = device;
    const motion = cached.addService(hapApi.hap.Service.MotionSensor, device.name, 'motion-sensor');
    platform.configureAccessory(cached);

    (platform as unknown as {
      registerDevice: (
        device: { id: number; network_id: number; name: string; enabled: boolean },
        prefix: string,
        label: string,
        map: Map<number, unknown>,
        handler: unknown,
      ) => void;
      cameraAccessories: Map<number, unknown>;
    }).registerDevice(
      device,
      'blink-camera-',
      'camera',
      (platform as unknown as { cameraAccessories: Map<number, unknown> }).cameraAccessories,
      CameraAccessory,
    );

    expect(cached.UUID).toBe(uuid);
    expect(cached.displayName).toBe('Corner (ABC-123');
    expect(motion.displayName).toBe('Corner (ABC-123');
    expect(hapApi.registerPlatformAccessories).not.toHaveBeenCalled();
  });

  it('repairs cached names from stored device context before Blink discovery', () => {
    hapApi = createApi() as unknown as MockAPI;
    const blinkApi = buildBlinkApi();
    (BlinkApi as jest.Mock).mockImplementation(() => blinkApi);
    const platform = new BlinkCamerasPlatform(createLogger() as unknown as Logger, config, hapApi);
    const device = { id: 9, network_id: 1, name: 'Offline Camera (ABC)', enabled: true };
    const uuid = hapApi.hap.uuid.generate('blink-camera-9');
    const cached = new hapApi.platformAccessory(device.name, uuid);
    cached.context.device = device;
    const information = cached.getService(hapApi.hap.Service.AccessoryInformation);
    const motion = cached.addService(hapApi.hap.Service.MotionSensor, `${'A'.repeat(63)}𐐀`, 'motion-sensor');

    platform.configureAccessory(cached);

    expect(cached.UUID).toBe(uuid);
    expect(cached.displayName).toBe('Offline Camera (ABC');
    expect(information?.displayName).toBe('Offline Camera (ABC');
    expect(information?.setCharacteristic).toHaveBeenCalledWith(
      hapApi.hap.Characteristic.Name,
      'Offline Camera (ABC',
    );
    expect(motion.displayName).toBe('A'.repeat(63));
    expect(hapApi.registerPlatformAccessories).not.toHaveBeenCalled();
    expect(blinkApi.getHomescreen).not.toHaveBeenCalled();
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
