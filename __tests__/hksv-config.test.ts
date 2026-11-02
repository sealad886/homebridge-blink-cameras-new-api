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
  usesVideoMotion: jest.fn().mockReturnValue(false),
});
const register = (platform: BlinkCamerasPlatform) =>
  (platform as unknown as { registerDevices(screen: BlinkHomescreen): Promise<void> }).registerDevices(homescreen);

describe('HomeKit Secure Video configuration and platform ownership', () => {
  let api: ReturnType<typeof createApi>;
  let log: ReturnType<typeof createLogger>;
  let camera: ReturnType<typeof handler>;
  let doorbell: ReturnType<typeof handler>;
  let owl: ReturnType<typeof handler>;
  let client: { login: jest.Mock; getHomescreen: jest.Mock; getUnwatchedMedia: jest.Mock; getMedia: jest.Mock };

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
      getUnwatchedMedia: jest.fn().mockResolvedValue({ unwatched_clips: 0 }), getMedia: jest.fn().mockResolvedValue({ media: [] }) };
    (BlinkApi as jest.Mock).mockImplementation(() => client);
    (CameraAccessory as jest.Mock).mockImplementation(() => camera);
    (DoorbellAccessory as jest.Mock).mockImplementation(() => doorbell);
    (OwlAccessory as jest.Mock).mockImplementation(() => owl);
    (NetworkAccessory as jest.Mock).mockImplementation((platform, accessory, device) => new RealNetworkAccessory(platform, accessory, device));
  });

  afterEach(() => { api.emit('shutdown'); });

  it('defaults recording off and selects only exact Blink names, numeric IDs, or serials', () => {
    expect(build().isHksvEnabled({ id: 1, name: 'Camera', serial: 'serial-1' })).toBe(false);
    const platform = build({ hksvCameras: ['Camera', '2', 'serial-3'] });
    expect(platform.isHksvEnabled({ id: 1, name: 'Camera' })).toBe(true);
    expect(platform.isHksvEnabled({ id: 2, name: 'Other' })).toBe(true);
    expect(platform.isHksvEnabled({ id: 3, serial: 'serial-3' })).toBe(true);
    expect(platform.isHksvEnabled({ id: 4, name: 'camera', serial: 'other' })).toBe(false);
  });

  it.each([
    '1', null, [''], ['  '], [1], ['1', '1'],
  ])('rejects invalid recording camera selections in runtime and UI schema: %j', hksvCameras => {
    expect(() => build({ hksvCameras })).toThrow(/hksvCameras/);
    expect(BlinkApi).not.toHaveBeenCalled();
    expect(validate({ name: 'Blink', hksvCameras })).toBe(false);
  });

  it('accepts six recording cameras and matches qualified identities without kind collisions', () => {
    const settings = { hksvCameras: ['camera:1', 'camera:2', 'camera:3', 'camera:4', 'camera:5', 'owl:1'] };
    const platform = build(settings);
    expect(validate({ name: 'Blink', ...settings })).toBe(true);
    expect(platform.isHksvEnabled({ id: 1 }, 'camera')).toBe(true);
    expect(platform.isHksvEnabled({ id: 1 }, 'owl')).toBe(true);
    expect(platform.isHksvEnabled({ id: 1 }, 'doorbell')).toBe(false);
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

  it('keeps temperature inheritance when an orphaned settings row has no camera identifier', () => {
    const platform = build({ exposeTemperature: true,
      deviceSettingOverrides: [
        { exposeTemperature: false, inputQuality: 'auto' },
        { deviceIdentifier: 'camera:2', exposeTemperature: false, inputQuality: 'saver', motionTimeout: 17 },
      ],
    });
    const serialless = { id: 1, name: 'Camera' };
    expect(platform.isTemperatureEnabled(serialless, 'camera')).toBe(true);
    expect(platform.getDeviceInputQuality(serialless, 'camera')).toBe('auto');
    expect(platform.isTemperatureEnabled({ id: 2, name: 'Other camera' }, 'camera')).toBe(false);
    expect(platform.getDeviceInputQuality({ id: 2 }, 'camera')).toBe('saver');
    expect(platform.getDeviceMotionTimeout({ id: 2 }, 'camera')).toBe(17000);
  });

  it('reserves qualified camera selectors even when a different device has that name or serial', async () => {
    const misleading = { id: 7, network_id: 10, name: 'owl:123', serial: 'doorbell:123', enabled: true };
    const selectedOwl = { id: 123, network_id: 10, name: 'Mini', enabled: true };
    const selectedDoorbell = { id: 123, network_id: 10, name: 'Front door', enabled: true };
    const platform = build({ hksvCameras: ['owl:123', 'doorbell:123'],
      deviceNameOverrides: [{ deviceIdentifier: 'owl:123', customName: 'Named Mini' }],
      deviceSettingOverrides: [{ deviceIdentifier: 'owl:123', inputQuality: 'saver', exposeTemperature: true, motionTimeout: 17 }],
    });
    expect(platform.isHksvEnabled(misleading, 'camera')).toBe(false);
    expect(platform.isHksvEnabled(selectedOwl, 'owl')).toBe(true);
    expect(platform.isHksvEnabled(selectedDoorbell, 'doorbell')).toBe(true);
    expect(platform.getDeviceInputQuality(misleading, 'camera')).toBe('auto');
    expect(platform.isTemperatureEnabled(misleading, 'camera')).toBe(false);
    expect(platform.getDeviceInputQuality(selectedOwl, 'owl')).toBe('saver');
    expect(platform.getDeviceMotionTimeout(selectedOwl, 'owl')).toBe(17000);

    const data = { ...homescreen, networks: [{ id: 10, name: 'owl:123', armed: true }],
      cameras: [misleading], owls: [selectedOwl], doorbells: [selectedDoorbell] };
    await (platform as unknown as { registerDevices(screen: BlinkHomescreen): Promise<void> }).registerDevices(data);
    expect(platform.accessories.find(accessory => accessory.context.device?.id === 7)?.displayName).toBe('owl:123');
    expect(platform.accessories.find(accessory => accessory.displayName === 'Named Mini')).toBeDefined();

    const exclusions = { excludeDevices: ['owl:123', 'doorbell:123'] };
    const inventory = projectSettingsInventory(data, exclusions);
    expect(inventory.cameras.filter(camera => !camera.excluded).map(camera => camera.key)).toEqual(['camera:7']);
    expect(inventory.globalFeedCapacity).toBe(1);
    platform.config.excludeDevices = exclusions.excludeDevices;
    await (platform as unknown as { registerDevices(screen: BlinkHomescreen): Promise<void> }).registerDevices(data);
    expect(platform.accessories.some(accessory => accessory.context.device?.id === 7)).toBe(true);
    expect(platform.accessories.some(accessory => accessory.context.device?.id === 123)).toBe(false);
  });

  it('supports local recording motion with provider motion polling disabled, independently of live viewing', () => {
    expect(() => build({ hksvCameras: ['1'], enableMotionPolling: false })).not.toThrow();
    expect(validate({ name: 'Blink', hksvCameras: ['1'], enableMotionPolling: false })).toBe(true);
    expect(() => build({ hksvCameras: [], enableMotionPolling: false })).not.toThrow();
    expect(validate({ name: 'Blink', hksvCameras: [], enableMotionPolling: false })).toBe(true);
    const settings = { hksvCameras: ['1', '2', '3', '4'], enableStreaming: false };
    expect(build(settings).isHksvEnabled({ id: 1 })).toBe(true);
    expect(validate({ name: 'Blink', ...settings })).toBe(true);
  });

  it('suppresses delayed provider clips while local recording motion owns the camera', async () => {
    jest.useFakeTimers();
    try {
      build({ hksvCameras: ['1', '2'], enableMotionPolling: true, pollInterval: 15 });
      camera.usesVideoMotion.mockReturnValue(true); doorbell.usesVideoMotion.mockReturnValue(true);
      client.getUnwatchedMedia.mockResolvedValue({ unwatched_clips: 3 });
      client.getMedia.mockImplementation(async () => ({ media: [1, 2, 3].map(camera_id => ({ camera_id, created_at: new Date().toISOString() })) }));
      api.emit('didFinishLaunching'); await jest.advanceTimersByTimeAsync(0); await jest.advanceTimersByTimeAsync(15000);
      expect(camera.triggerMotion).not.toHaveBeenCalled(); expect(doorbell.triggerMotion).not.toHaveBeenCalled();
      expect(owl.triggerMotion).toHaveBeenCalledTimes(1);
      camera.usesVideoMotion.mockReturnValue(false); await jest.advanceTimersByTimeAsync(15000);
      expect(camera.triggerMotion).toHaveBeenCalledTimes(1); expect(owl.triggerMotion).toHaveBeenCalledTimes(2);
    } finally { api.emit('shutdown'); jest.useRealTimers(); }
  });

  it.each([false, true])('reads confirmed network arming and treats excluded networks as unavailable (excluded=%s)', async excluded => {
    jest.useFakeTimers();
    try {
      const platform = build({ excludedNetworks: excluded ? ['10'] : [], enableMotionPolling: false, pollInterval: 15 });
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
    const platform = build({ hksvCameras: ['1'] });
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
