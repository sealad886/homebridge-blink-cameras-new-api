import { EventEmitter } from 'node:events';
import * as hap from '@homebridge/hap-nodejs';
import type { API, Logger } from 'homebridge';
import { BlinkCamerasPlatform } from '../src/platform';
import { BlinkApi } from '../src/blink-api';
import { NativeClipRecorder } from '../src/native-clip-recorder';
import type { NativeClipCameraTarget } from '../src/native-clip-recorder';
import type { BlinkCameraRecordingDelegate } from '../src/accessories/camera-recording';
import { startRecordingSession } from '../src/accessories/recording-session';
import { createLogger } from './helpers/homebridge';
import type { BlinkHomescreen } from '../src/types';
import { writeOwnerOnlyJsonFile } from '../src/blink-api/secure-json-file';

jest.mock('../src/blink-api');
jest.mock('../src/native-clip-recorder');
jest.mock('../src/accessories/recording-session', () => ({ startRecordingSession: jest.fn() }));
jest.mock('../src/blink-api/secure-json-file', () => ({ writeOwnerOnlyJsonFile: jest.fn().mockResolvedValue(undefined) }));
const tick = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
const screen = (): BlinkHomescreen => ({ account: { account_id: 1 }, networks: [{ id: 1, name: 'Home', armed: true }],
  sync_modules: [{ id: 10, network_id: 1, name: 'Module', status: 'online', local_storage_enabled: true }],
  cameras: [{ id: 2, network_id: 1, name: 'Provider Bedroom', enabled: true, status: 'online' }], owls: [], doorbells: [] });
class Accessory extends hap.Accessory { context: Record<string, unknown> = {}; }
function fixture(data = screen()) {
  const emitter = new EventEmitter();
  const api = Object.assign(emitter, { hap, user: { storagePath: () => '/private/fixture-homebridge' }, platformAccessory: Accessory,
    registerPlatformAccessories: jest.fn(), updatePlatformAccessories: jest.fn(), unregisterPlatformAccessories: jest.fn() });
  const client = { login: jest.fn().mockResolvedValue(undefined), getHomescreen: jest.fn().mockResolvedValue(data),
    getUnwatchedMedia: jest.fn().mockResolvedValue({ media: [] }), getCameraTemperature: jest.fn().mockResolvedValue(20) };
  jest.mocked(BlinkApi).mockImplementation(() => client as unknown as BlinkApi);
  const targets = new Map<string, NativeClipCameraTarget>(), policy: boolean[] = [];
  const recorder = { initialize: jest.fn().mockResolvedValue(undefined), start: jest.fn(), stop: jest.fn().mockResolvedValue(undefined),
    registerModule: jest.fn(), registerCamera: jest.fn((identity, target: NativeClipCameraTarget) => targets.set(identity.cameraKey, target)),
    unregisterCamera: jest.fn(async (key: string) => { targets.delete(key); }),
    notifyPolicyChanged: jest.fn(async (key: string) => { if (targets.has(key)) policy.push(targets.get(key)!.getPolicySnapshot().permission.recordingActive); }),
    getActivity: jest.fn() };
  jest.mocked(NativeClipRecorder).mockImplementation(() => recorder as unknown as NativeClipRecorder);
  const config = { platform: 'BlinkCameras', name: 'Blink', persistAuth: true, hksvCameras: ['camera:2'],
    hksvSource: 'saved-clips' as 'saved-clips' | 'continuous', deviceNameOverrides: [{ deviceIdentifier: 'camera:2', customName: 'Home Bedroom' }] };
  const platform = new BlinkCamerasPlatform(createLogger() as unknown as Logger, config, api as unknown as API);
  const launch = async () => { emitter.emit('didFinishLaunching'); await tick(); };
  const recover = () => (platform as unknown as { recoverConnection(authenticate: boolean): Promise<boolean> }).recoverConnection(false);
  return { platform, config, api, emitter, client, recorder, targets, policy, launch, recover };
}
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { jest.clearAllTimers(); jest.restoreAllMocks(); jest.useRealTimers(); });

test('registers one existing accessory by original provider/module identity and preserves its controller during recovery', async () => {
  const f = fixture(); await f.launch();
  expect(NativeClipRecorder).toHaveBeenCalledTimes(1);
  expect(f.recorder.registerModule).toHaveBeenCalledWith(expect.objectContaining({ networkId: 1, syncModuleId: 10, pollIntervalMs: 30000 }));
  expect(f.recorder.registerCamera).toHaveBeenCalledWith(expect.objectContaining({ cameraKey: 'camera:2', cameraId: '2',
    networkId: 1, syncModuleId: 10, providerName: 'Provider Bedroom' }), expect.anything());
  const accessory = f.platform.accessories.find(value => value.context.device?.id === 2)!;
  expect(accessory.displayName).toBe('Home Bedroom');
  const target = f.targets.get('camera:2');
  await f.recover(); expect(f.targets.get('camera:2')).toBe(target);
  expect(f.platform.accessories.find(value => value.context.device?.id === 2)).toBe(accessory);
  expect(NativeClipRecorder).toHaveBeenCalledTimes(1); expect(startRecordingSession).not.toHaveBeenCalled();
  expect(f.platform.getNativeRecordingHealthPath()).toBe('/private/fixture-homebridge/blink-recording/native-clips/health.json');
  expect(f.platform.getNativeRecordingHealth().cameras[0].home).toMatchObject({ recordingActive: false, cameraActive: true, audioActive: false });
  f.emitter.emit('shutdown'); await tick(); expect(f.recorder.stop).toHaveBeenCalled();
});

test('full inventory name collision prevents recording registration even when the namesake is excluded', async () => {
  const data = screen(); data.cameras.push({ id: 3, network_id: 1, name: 'ProviderBedroom', enabled: true });
  const f = fixture(data); f.config.hksvCameras = ['camera:2'];
  Object.assign(f.config, { excludeDevices: ['camera:3'] });
  await f.launch(); expect(NativeClipRecorder).not.toHaveBeenCalled(); expect(startRecordingSession).not.toHaveBeenCalled();
  expect(f.platform.getRecordingSelection({ id: 2 }, 'camera')).toMatchObject({ available: false, reason: 'camera-name-ambiguous' });
  f.emitter.emit('shutdown'); await tick();
});

test('publishes one platform-composed report before inventory and with only unresolved or continuous selections', async () => {
  const f = fixture();
  expect(f.platform.getNativeRecordingHealth()).toMatchObject({ version: 2, inventory: 'unknown', cameras: [{ stage: 'inventory-unavailable' }] });
  f.config.hksvCameras = ['Old Camera']; await f.launch(); await f.platform.flushRecordingHealth();
  expect(NativeClipRecorder).not.toHaveBeenCalled();
  expect(f.platform.getNativeRecordingHealth()).toMatchObject({ version: 2, cameras: [{ label: 'Old Camera', stage: 'camera-unresolved' }] });
  expect(jest.mocked(writeOwnerOnlyJsonFile).mock.calls.at(-1)).toEqual([
    '/private/fixture-homebridge/blink-recording/native-clips/health.json', expect.objectContaining({ version: 2 })]);
  f.config.hksvCameras = ['camera:2']; f.config.hksvSource = 'continuous'; await f.recover();
  expect(f.platform.getNativeRecordingHealth().cameras[0]).toMatchObject({ source: 'continuous', baseline: 'not-applicable', canTriggerFreshTest: false });
  f.emitter.emit('shutdown'); await tick(); await f.platform.flushRecordingHealth();
});

test('an ambiguous saved selector cannot register multiple physical cameras behind an unavailable report row', async () => {
  const data = screen(); data.owls.push({ id: 2, network_id: 1, name: 'Inside', enabled: true });
  const f = fixture(data); f.config.hksvCameras = ['2']; await f.launch();
  expect(f.platform.getNativeRecordingHealth().cameras).toEqual([
    expect.objectContaining({ selection: 'ambiguous', stage: 'camera-selector-ambiguous', available: false }),
  ]);
  expect(NativeClipRecorder).not.toHaveBeenCalled();
  f.emitter.emit('shutdown'); await tick();
});

test('source switch persists a disabled selection boundary before unregister and restores the same accessory target', async () => {
  const f = fixture(); await f.launch(); const target = f.targets.get('camera:2')! as BlinkCameraRecordingDelegate;
  target.updateRecordingActive(true); await tick(); f.policy.length = 0;
  f.config.hksvSource = 'continuous'; await f.recover();
  expect(f.policy).toContain(false); expect(f.recorder.unregisterCamera).toHaveBeenCalledWith('camera:2');
  f.config.hksvSource = 'saved-clips'; await f.recover();
  expect(f.targets.get('camera:2')).toBe(target); expect(f.policy.at(-1)).toBe(true);
  f.emitter.emit('shutdown'); await tick();
});

test('ordinary shutdown stops the owner before retiring camera targets without terminally unregistering queued work', async () => {
  const f = fixture(); await f.launch(); const target = f.targets.get('camera:2')! as BlinkCameraRecordingDelegate;
  const stopped = jest.spyOn(target, 'stop'); let finish!: () => void;
  f.recorder.stop.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  f.emitter.emit('shutdown'); await tick(); expect(stopped).not.toHaveBeenCalled();
  finish(); await tick(); expect(stopped).toHaveBeenCalledTimes(1); expect(f.recorder.unregisterCamera).not.toHaveBeenCalled();
});
