import { migrateEarlyNotificationConfig } from '../src/early-notification-config';
import { nativeRecordingDevicePolicy } from '../src/native-recording-config';

describe('canonical Early Notification migration', () => {
  it('preserves legacy management and explicit opt-outs at every scope without mutating the source', () => {
    const input = { disableEarlyNotification: true, extension: { keep: 1 },
      syncModuleSettingOverrides: [{ syncModuleId: '20', disableEarlyNotification: false, extension: 2 }],
      deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', disableEarlyNotification: true }, { deviceIdentifier: 'camera:2' }] };
    const before = structuredClone(input), migrated = migrateEarlyNotificationConfig(input);
    expect(input).toEqual(before);
    expect(migrated).toEqual({ changed: true, config: { earlyNotificationMode: 'off', extension: { keep: 1 },
      syncModuleSettingOverrides: [{ syncModuleId: '20', earlyNotificationMode: 'unmanaged', extension: 2 }],
      deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', earlyNotificationMode: 'off' }, { deviceIdentifier: 'camera:2' }] } });
    expect(migrateEarlyNotificationConfig(migrated.config)).toEqual({ changed: false, config: migrated.config });
  });

  it('keeps valid new choices authoritative and preserves absent inheritance', () => {
    expect(migrateEarlyNotificationConfig({ earlyNotificationMode: 'on', disableEarlyNotification: true }).config)
      .toEqual({ earlyNotificationMode: 'on' });
    expect(migrateEarlyNotificationConfig({ deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', future: true }] }).changed).toBe(false);
  });

  it.each([
    { disableEarlyNotification: 'false' }, { earlyNotificationMode: 'on', disableEarlyNotification: 1 },
    { earlyNotificationMode: false }, { earlyNotificationMode: null },
    { deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', disableEarlyNotification: null }] },
    { syncModuleSettingOverrides: [{ syncModuleId: '20', earlyNotificationMode: 'invalid' }] },
  ])('rejects malformed choices without losing them: %j', input => {
    const before = structuredClone(input);
    expect(() => migrateEarlyNotificationConfig(input)).toThrow(); expect(input).toEqual(before);
  });

  it('resolves force On, force Off, explicit unmanaged, and inheritance independently', () => {
    const device = { id: 1, kind: 'camera' as const, moduleAssociation: { state: 'unique' as const, source: 'network_id' as const, candidateIds: ['20'] } };
    for (const mode of ['on', 'off', 'unmanaged'] as const) {
      expect(nativeRecordingDevicePolicy({ earlyNotificationMode: 'off', syncModuleSettingOverrides: [{ syncModuleId: '20', earlyNotificationMode: 'on' }],
        deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', earlyNotificationMode: mode }] }, device).earlyNotificationMode).toBe(mode);
    }
    expect(nativeRecordingDevicePolicy({ earlyNotificationMode: 'off', syncModuleSettingOverrides: [{ syncModuleId: '20', earlyNotificationMode: 'on' }] }, device)
      .earlyNotificationMode).toBe('on');
  });
});
