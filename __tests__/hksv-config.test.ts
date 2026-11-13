import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import type { API, Logger, PlatformConfig } from 'homebridge';
import { BlinkCamerasPlatform } from '../src/platform';
import { BlinkApi } from '../src/blink-api';
import { CameraAccessory, DoorbellAccessory, OwlAccessory, NetworkAccessory } from '../src/accessories';
import { NetworkAccessory as RealNetworkAccessory } from '../src/accessories/network';
import type { BlinkHomescreen } from '../src/types';
import { projectSettingsInventory } from '../src/settings-inventory';
import { createApi, createLogger } from './helpers/homebridge';
import { nativeRecordingDevicePolicy } from '../src/native-recording-config';

jest.mock('../src/blink-api');
jest.mock('timers', () => ({ ...jest.requireActual('timers'),
  setInterval: (callback: () => void, delay: number) => globalThis.setInterval(callback, delay),
  clearInterval: (timer: ReturnType<typeof globalThis.setInterval>) => globalThis.clearInterval(timer),
}));
jest.mock('../src/accessories', () => ({
  CameraAccessory: jest.fn(), DoorbellAccessory: jest.fn(), OwlAccessory: jest.fn(), NetworkAccessory: jest.fn(),
}));

const schema = JSON.parse(readFileSync(resolve(process.cwd(), 'config.schema.json'), 'utf8')).schema;
const validate = new Ajv({ strict: false }).compile(schema);
const homescreen: BlinkHomescreen = {
  account: { account_id: 1 }, networks: [], sync_modules: [],
  cameras: [{ id: 1, network_id: 10, name: 'Camera', enabled: true }],
  doorbells: [{ id: 2, network_id: 10, name: 'Doorbell', enabled: true }],
  owls: [{ id: 3, network_id: 10, name: 'Mini', enabled: true }],
};
const handler = () => ({
  shutdown: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  updateAvailability: jest.fn(), updateState: jest.fn(), triggerMotion: jest.fn(),
});
const register = (platform: BlinkCamerasPlatform) =>
  (platform as unknown as { registerDevices(screen: BlinkHomescreen): Promise<void> }).registerDevices(homescreen);

describe('native recording configuration and platform ownership', () => {
  let api: ReturnType<typeof createApi>;
  let log: ReturnType<typeof createLogger>;
  let camera: ReturnType<typeof handler>;
  let doorbell: ReturnType<typeof handler>;
  let owl: ReturnType<typeof handler>;
  let client: { login: jest.Mock; getHomescreen: jest.Mock; getUnwatchedMedia: jest.Mock; getCachedIdentity: jest.Mock };
  const build = (settings: Record<string, unknown> = {}) => new BlinkCamerasPlatform(
    log as unknown as Logger,
    { platform: 'BlinkCameras', name: 'Blink', ...settings } as PlatformConfig,
    api as unknown as API,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    api = createApi(); log = createLogger();
    camera = handler(); doorbell = handler(); owl = handler();
    client = { login: jest.fn().mockResolvedValue(undefined), getHomescreen: jest.fn().mockResolvedValue(homescreen),
      getUnwatchedMedia: jest.fn(), getCachedIdentity: jest.fn().mockReturnValue({ accountId: null, clientId: null }) };
    (BlinkApi as jest.Mock).mockImplementation(() => client);
    (CameraAccessory as jest.Mock).mockImplementation(() => camera);
    (DoorbellAccessory as jest.Mock).mockImplementation(() => doorbell);
    (OwlAccessory as jest.Mock).mockImplementation(() => owl);
    (NetworkAccessory as jest.Mock).mockImplementation((platform, accessory, device) => new RealNetworkAccessory(platform, accessory, device));
  });
  afterEach(() => { api.emit('shutdown'); });

  it('defaults HSV off and selects qualified per-camera policies without kind collisions', () => {
    expect(nativeRecordingDevicePolicy(undefined, { id: 1, kind: 'camera' })).toEqual({ exposeMotionDetected: true, homeKitSecureVideo: false, earlyNotificationMode: 'unmanaged' });
    const deviceSettingOverrides = ['camera:1', 'camera:2', 'camera:3', 'camera:4', 'camera:5', 'owl:1']
      .map(deviceIdentifier => ({ deviceIdentifier, homeKitSecureVideo: true }));
    expect(() => build({ deviceSettingOverrides })).not.toThrow();
    expect(validate({ name: 'Blink', deviceSettingOverrides })).toBe(true);
    expect(nativeRecordingDevicePolicy({ deviceSettingOverrides }, { id: 1, kind: 'camera' }).homeKitSecureVideo).toBe(true);
    expect(nativeRecordingDevicePolicy({ deviceSettingOverrides }, { id: 1, kind: 'owl' }).homeKitSecureVideo).toBe(true);
    expect(nativeRecordingDevicePolicy({ deviceSettingOverrides }, { id: 1, kind: 'doorbell' }).homeKitSecureVideo).toBe(false);
  });

  it.each(['1', null, [{}], [{ deviceIdentifier: '' }], [{ deviceIdentifier: ' ' }], [{ deviceIdentifier: 1 }]])(
    'rejects missing/blank/invalid device selection in runtime and schema: %j', deviceSettingOverrides => {
      expect(() => build({ deviceSettingOverrides })).toThrow();
      expect(BlinkApi).not.toHaveBeenCalled();
      expect(validate({ name: 'Blink', deviceSettingOverrides })).toBe(false);
    });

  it.each(['enableMotionPolling', 'hksvCameras', 'hksvSource', 'syncModuleRecording'])(
    'requires the explicit native migration for obsolete %s before constructing a client', key => {
      expect(() => build({ [key]: key === 'enableMotionPolling' ? false : [] })).toThrow('migrate-native-recording-config.cjs');
      expect(BlinkApi).not.toHaveBeenCalled();
    });

  it('supports recording selection while live viewing is disabled and public motion is hidden', () => {
    const deviceSettingOverrides = [{ deviceIdentifier: 'camera:1', homeKitSecureVideo: true, exposeMotionDetected: false }];
    expect(() => build({ deviceSettingOverrides, exposeMotionDetected: false, enableStreaming: false })).not.toThrow();
    expect(validate({ name: 'Blink', deviceSettingOverrides, exposeMotionDetected: false, enableStreaming: false })).toBe(true);
    expect(nativeRecordingDevicePolicy({ deviceSettingOverrides, exposeMotionDetected: false }, { id: 1, kind: 'camera' }))
      .toEqual({ exposeMotionDetected: false, homeKitSecureVideo: true, earlyNotificationMode: 'unmanaged' });
  });

  it('reserves qualified identifiers rather than matching a different camera name or serial', () => {
    const rows = [{ deviceIdentifier: 'owl:123', homeKitSecureVideo: true, exposeMotionDetected: false },
      { deviceIdentifier: 'doorbell:123', homeKitSecureVideo: true }];
    const misleading = { id: 7, kind: 'camera' as const, name: 'owl:123', serial: 'doorbell:123' };
    expect(nativeRecordingDevicePolicy({ deviceSettingOverrides: rows }, misleading)).toEqual({ exposeMotionDetected: true, homeKitSecureVideo: false, earlyNotificationMode: 'unmanaged' });
    expect(nativeRecordingDevicePolicy({ deviceSettingOverrides: rows }, { id: 123, kind: 'owl' })).toEqual({ exposeMotionDetected: false, homeKitSecureVideo: true, earlyNotificationMode: 'unmanaged' });
    expect(nativeRecordingDevicePolicy({ deviceSettingOverrides: rows }, { id: 123, kind: 'doorbell' }).homeKitSecureVideo).toBe(true);
  });

  it('accepts optional early notification choices without schema defaults or feed-limit migration', () => {
    const config = { name: 'Blink', earlyNotificationMode: 'off',
      syncModuleSettingOverrides: [{ syncModuleId: '20' }, { syncModuleId: '30', earlyNotificationMode: 'unmanaged' }],
      deviceSettingOverrides: [{ deviceIdentifier: 'camera:1' }, { deviceIdentifier: 'owl:1', earlyNotificationMode: 'unmanaged' }],
      syncModuleFeedLimits: [{ syncModuleId: '20', maxFeeds: 1 }] };
    const before = structuredClone(config);
    expect(validate(config)).toBe(true);
    expect(() => build(config)).not.toThrow();
    expect(config).toEqual(before);
  });

  it.each([
    { earlyNotificationMode: 'invalid' },
    { syncModuleSettingOverrides: [{ syncModuleId: '' }] },
    { syncModuleSettingOverrides: [{ syncModuleId: ' ' }] },
    { syncModuleSettingOverrides: [{ syncModuleId: 20 }] },
    { syncModuleSettingOverrides: [{ syncModuleId: '20', earlyNotificationMode: 'invalid' }] },
    { deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', earlyNotificationMode: 'invalid' }] },
  ])('rejects invalid early notification values in schema and before client construction: %j', config => {
    expect(validate({ name: 'Blink', ...config })).toBe(false);
    expect(() => build(config)).toThrow();
    expect(BlinkApi).not.toHaveBeenCalled();
  });

  it('rejects duplicate Sync Module settings before constructing a client', () => {
    expect(() => build({ syncModuleSettingOverrides: [
      { syncModuleId: '20', earlyNotificationMode: 'off' }, { syncModuleId: '20', earlyNotificationMode: 'unmanaged' },
    ] })).toThrow(/only one settings row/);
    expect(BlinkApi).not.toHaveBeenCalled();
  });

  it('uses qualified selectors for camera names, settings and exclusions across kind collisions', async () => {
    const platform = build({ excludeDevices: ['camera:1'],
      deviceNameOverrides: [{ deviceIdentifier: 'owl:1', customName: 'Named Mini' }],
      deviceSettingOverrides: [{ deviceIdentifier: 'owl:1', inputQuality: 'saver', exposeTemperature: false, motionTimeout: 17 }],
    });
    const data = { ...homescreen, cameras: [{ id: 1, network_id: 10, name: 'Camera', enabled: true }],
      owls: [{ id: 1, network_id: 10, name: 'Mini', enabled: true }] };
    await (platform as unknown as { registerDevices(screen: BlinkHomescreen): Promise<void> }).registerDevices(data);
    expect(CameraAccessory).not.toHaveBeenCalled(); expect(OwlAccessory).toHaveBeenCalledTimes(1);
    expect(platform.accessories.find(accessory => accessory.displayName === 'Named Mini')).toBeDefined();
    expect(platform.getDeviceInputQuality({ id: 1 }, 'owl')).toBe('saver');
    expect(platform.getDeviceInputQuality({ id: 1 }, 'camera')).toBe('auto');
    expect(platform.getDeviceMotionTimeout({ id: 1 }, 'owl')).toBe(17000);
  });

  it.each([false, true])('reads confirmed network arming and treats excluded networks as unavailable (excluded=%s)', async excluded => {
    jest.useFakeTimers();
    try {
      const platform = build({ excludedNetworks: excluded ? ['10'] : [], pollInterval: 15 });
      expect(platform.isNetworkArmed(10)).toBe(false);
      client.getHomescreen.mockResolvedValue({ ...homescreen, networks: [{ id: 10, name: 'Network', armed: true }] });
      api.emit('didFinishLaunching'); await jest.advanceTimersByTimeAsync(0);
      expect(platform.isNetworkArmed(10)).toBe(!excluded); expect(platform.isNetworkArmed(999)).toBe(false);
      client.getHomescreen.mockResolvedValue({ ...homescreen, networks: [{ id: 10, name: 'Network', armed: false }] });
      await jest.advanceTimersByTimeAsync(15000); expect(platform.isNetworkArmed(10)).toBe(false);
    } finally { api.emit('shutdown'); jest.useRealTimers(); }
  });

  it('stops every motion-capable handler on platform shutdown and contains cleanup failures', async () => {
    const platform = build();
    await register(platform);
    camera.shutdown.mockRejectedValueOnce(new Error('sensitive upstream context'));
    api.emit('shutdown');
    await Promise.resolve(); await Promise.resolve();
    expect(camera.shutdown).toHaveBeenCalledTimes(1);
    expect(doorbell.shutdown).toHaveBeenCalledTimes(1);
    expect(owl.shutdown).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalled();
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('sensitive upstream context');
  });

  it('finishes owned media cleanup before unregistering an explicitly excluded camera', async () => {
    const platform = build();
    await register(platform);
    let finish!: () => void;
    camera.shutdown.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    platform.config.excludeDevices = ['1'];
    const removal = register(platform);
    await Promise.resolve();
    expect(camera.shutdown).toHaveBeenCalledTimes(1);
    expect(api.unregisterPlatformAccessories).not.toHaveBeenCalled();
    finish(); await removal;
    expect(api.unregisterPlatformAccessories).toHaveBeenCalledTimes(1);
    expect(platform.accessories.some(accessory => accessory.context.device?.id === 1)).toBe(false);
    expect(doorbell.shutdown).not.toHaveBeenCalled();
    expect(owl.shutdown).not.toHaveBeenCalled();
  });

  it('does not construct camera handlers when discovery returns after shutdown', async () => {
    const platform = build({ deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', homeKitSecureVideo: true }] });
    let respond!: (screen: BlinkHomescreen) => void;
    client.getHomescreen.mockReturnValueOnce(new Promise<BlinkHomescreen>(resolve => { respond = resolve; }));
    const discovery = (platform as unknown as { discoverDevices(): Promise<boolean> }).discoverDevices();
    await Promise.resolve();
    api.emit('shutdown'); respond(homescreen);
    await expect(discovery).resolves.toBe(false);
    expect(CameraAccessory).not.toHaveBeenCalled();
    expect(DoorbellAccessory).not.toHaveBeenCalled();
    expect(OwlAccessory).not.toHaveBeenCalled();
    expect(api.registerPlatformAccessories).not.toHaveBeenCalled();
  });

});
