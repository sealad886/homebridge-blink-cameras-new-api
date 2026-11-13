import { nativeRecordingDevicePolicy, resolveNativeRecordingConfig, type NativeRecordingPolicyConfig } from '../src/native-recording-config';
import { projectSettingsInventory } from '../src/settings-inventory';
import type { BlinkHomescreen } from '../src/types';

const inventory = projectSettingsInventory({ account: { account_id: 1 }, networks: [{ id: 10, name: 'Home', armed: true }],
  sync_modules: [{ id: 20, network_id: 10, status: 'online' }],
  cameras: [{ id: 1, network_id: 10, name: 'Camera', enabled: true }], owls: [], doorbells: [],
} as BlinkHomescreen);
const device = { id: 1, kind: 'camera' as const, moduleAssociation: inventory.cameras[0].moduleAssociation };

describe('native recording configuration', () => {
  it('defaults to delayed bounded jobs and a separate conservative catalog cooldown', () => {
    expect(resolveNativeRecordingConfig(undefined)).toEqual({ initialDelayMs: 60_000, retryIntervalMs: 5_000, maxRetries: 10,
      matchToleranceMs: 15_000, catalogRefreshMs: 60_000, maxQueuedJobs: 128, maxJobAgeMs: 900_000, maxCachedBytes: 134_217_728 });
  });
  it('applies configured units while rejecting unsafe/unbounded policy', () => {
    expect(resolveNativeRecordingConfig({ initialDelaySeconds: 10, retryIntervalSeconds: 2, maxRetries: 0, catalogRefreshSeconds: 90 }).catalogRefreshMs).toBe(90_000);
    for (const invalid of [{ catalogRefreshSeconds: 5 }, { retryIntervalSeconds: 0 }, { maxRetries: -1 },
      { maxCachedBytes: 1 }, { initialDelaySeconds: 1.5 }, { initialDelaySeconds: 100, maxJobAgeSeconds: 50 }]) {
      expect(() => resolveNativeRecordingConfig(invalid)).toThrow();
    }
  });
  it('defaults motion exposure on and HSV off, with independent per-device OR demand', () => {
    expect(nativeRecordingDevicePolicy(undefined, { id: 1 })).toEqual({ exposeMotionDetected: true, homeKitSecureVideo: false, earlyNotificationMode: 'unmanaged' });
    expect(nativeRecordingDevicePolicy({ exposeMotionDetected: false,
      deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', homeKitSecureVideo: true }] }, { id: 1, kind: 'camera' }))
      .toEqual({ exposeMotionDetected: false, homeKitSecureVideo: true, earlyNotificationMode: 'unmanaged' });
  });
  it('uses kind-qualified selectors without conflating equal IDs, retaining first-row precedence', () => {
    const rows = [{ deviceIdentifier: 'camera:1', homeKitSecureVideo: true }, { deviceIdentifier: '1', exposeMotionDetected: false }];
    expect(nativeRecordingDevicePolicy({ deviceSettingOverrides: rows }, { id: 1, kind: 'camera' }))
      .toEqual({ exposeMotionDetected: true, homeKitSecureVideo: true, earlyNotificationMode: 'unmanaged' });
    expect(nativeRecordingDevicePolicy({ deviceSettingOverrides: rows }, { id: 1, kind: 'doorbell' }))
      .toEqual({ exposeMotionDetected: false, homeKitSecureVideo: false, earlyNotificationMode: 'unmanaged' });
  });
  it('validates feature booleans even on unmatched rows', () => {
    expect(() => nativeRecordingDevicePolicy({ deviceSettingOverrides: [{ deviceIdentifier: 'other', homeKitSecureVideo: 'yes' as unknown as boolean }] }, { id: 1 })).toThrow();
    expect(() => nativeRecordingDevicePolicy({ exposeMotionDetected: 'yes' as unknown as boolean }, { id: 1 })).toThrow();
  });
  it.each([
    { root: undefined, module: undefined, camera: undefined, expected: 'unmanaged' },
    { root: 'off' as const, module: undefined, camera: undefined, expected: 'off' },
    { root: 'unmanaged' as const, module: 'off' as const, camera: undefined, expected: 'off' },
    { root: 'off' as const, module: 'unmanaged' as const, camera: undefined, expected: 'unmanaged' },
    { root: 'off' as const, module: 'off' as const, camera: 'unmanaged' as const, expected: 'unmanaged' },
    { root: 'unmanaged' as const, module: 'unmanaged' as const, camera: 'off' as const, expected: 'off' },
    { root: 'off' as const, module: undefined, camera: 'unmanaged' as const, expected: 'unmanaged' },
    { root: 'unmanaged' as const, module: undefined, camera: 'off' as const, expected: 'off' },
  ])('resolves explicit camera > unique module > plugin choices: %j', ({ root, module, camera, expected }) => {
    const config = { earlyNotificationMode: root,
      syncModuleSettingOverrides: [{ syncModuleId: '20', earlyNotificationMode: module }],
      deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', earlyNotificationMode: camera }] };
    const original = structuredClone(config);
    expect(nativeRecordingDevicePolicy(config, device).earlyNotificationMode).toBe(expected);
    expect(config).toEqual(original);
  });
  it.each(['ambiguous', 'noneReported', 'unavailable'] as const)('ignores %s module associations while retaining plugin inheritance', state => {
    const camera = { ...device, moduleAssociation: { state, source: 'network_id' as const, candidateIds: ['20'] } };
    expect(nativeRecordingDevicePolicy({ syncModuleSettingOverrides: [{ syncModuleId: '20', earlyNotificationMode: 'off' }] }, camera)
      .earlyNotificationMode).toBe('unmanaged');
    expect(nativeRecordingDevicePolicy({ earlyNotificationMode: 'off',
      syncModuleSettingOverrides: [{ syncModuleId: '20', earlyNotificationMode: 'unmanaged' }] }, camera).earlyNotificationMode).toBe('off');
  });
  it('inherits parent management after an explicit child choice is unset', () => {
    const config: NativeRecordingPolicyConfig = { earlyNotificationMode: 'off',
      syncModuleSettingOverrides: [{ syncModuleId: '20', earlyNotificationMode: 'unmanaged' }],
      deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', earlyNotificationMode: 'unmanaged' }] };
    expect(nativeRecordingDevicePolicy(config, device).earlyNotificationMode).toBe('unmanaged');
    delete config.deviceSettingOverrides![0].earlyNotificationMode;
    expect(nativeRecordingDevicePolicy(config, device).earlyNotificationMode).toBe('unmanaged');
    delete config.syncModuleSettingOverrides![0].earlyNotificationMode;
    expect(nativeRecordingDevicePolicy(config, device).earlyNotificationMode).toBe('off');
  });
  it.each([
    { earlyNotificationMode: 'yes' },
    { deviceSettingOverrides: [{ deviceIdentifier: 'other', earlyNotificationMode: 'yes' }] },
    { syncModuleSettingOverrides: '20' },
    { syncModuleSettingOverrides: [{ syncModuleId: ' ' }] },
    { syncModuleSettingOverrides: [{ syncModuleId: 20 }] },
    { syncModuleSettingOverrides: [{ syncModuleId: 'other', earlyNotificationMode: 'yes' }] },
    { syncModuleSettingOverrides: [{ syncModuleId: '20', earlyNotificationMode: 'off' }, { syncModuleId: '20', earlyNotificationMode: 'unmanaged' }] },
  ])('rejects invalid early notification settings even when unmatched: %j', invalid => {
    expect(() => nativeRecordingDevicePolicy(invalid as unknown as NativeRecordingPolicyConfig, device)).toThrow();
  });
});
