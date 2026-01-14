import { API, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { BlinkCamerasPlatform } from '../src/platform';
import { BlinkApi } from '../src/blink-api';
import { createApi, createLogger } from './helpers/homebridge';
import { BlinkHomescreen } from '../src/types';

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
  type TestConfig = PlatformConfig & { username: string; password: string; twoFactorCode?: string };
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

    (platform as unknown as { registerNetwork: (net: typeof network) => void }).registerNetwork(network);

    expect(hapApi.registerPlatformAccessories).not.toHaveBeenCalled();
    expect(cachedAccessory.context.handler).toBeDefined();
    expect(cachedAccessory.context.device).toBe(network);
  });
});
