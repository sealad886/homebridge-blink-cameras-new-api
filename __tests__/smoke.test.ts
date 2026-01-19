import { API, Logger, PlatformConfig } from 'homebridge';
import { BlinkCamerasPlatform } from '../src/platform';
import { BlinkApi } from '../src/blink-api';
import { createApi, createLogger } from './helpers/homebridge';

jest.mock('../src/blink-api');

type MockAPI = API & { emit: (event: string) => void };

describe('smoke', () => {
  const config: PlatformConfig & { username: string; password: string } = {
    platform: 'BlinkCameras',
    name: 'Blink',
    username: 'user@example.com',
    password: 'password',
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('initializes and starts discovery on launch', () => {
    const api = createApi() as unknown as MockAPI;
    const log = createLogger() as unknown as Logger;
    (BlinkApi as jest.Mock).mockImplementation(() => ({
      login: jest.fn().mockResolvedValue(undefined),
      getHomescreen: jest.fn().mockResolvedValue({
        account: { account_id: 1 },
        networks: [],
        cameras: [],
        doorbells: [],
        owls: [],
        sync_modules: [],
      }),
    }));

    const platform = new BlinkCamerasPlatform(log, config, api);
    const discoverSpy = jest
      .spyOn(platform as unknown as { discoverDevices: () => Promise<void> }, 'discoverDevices')
      .mockResolvedValue(undefined);

    api.emit('didFinishLaunching');

    expect(log.info).toHaveBeenCalledWith('Finished launching; starting Blink discovery');
    expect(discoverSpy).toHaveBeenCalled();
  });
});
