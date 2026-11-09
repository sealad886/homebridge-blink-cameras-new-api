import { SettingsValidator } from '../../src/homebridge-ui/settings-validation';
import { projectSettingsInventory } from '../../src/settings-inventory';
import type { BlinkHomescreen } from '../../src/types';

const inventory = projectSettingsInventory({ networks: [{ id: 10, name: 'System', armed: true }],
  sync_modules: [{ id: 20, network_id: 10, status: 'online' }], account: { account_id: 1 },
  cameras: Array.from({ length: 6 }, (_, id) => ({ id: id + 1, network_id: 10, name: `Camera ${id}`, enabled: true })),
  owls: [], doorbells: [],
} as BlinkHomescreen);

describe('full settings draft validation', () => {
  const validator = new SettingsValidator(() => inventory);

  it('accepts six qualified recording cameras, absent/empty recording overrides and unknown fields without mutation', () => {
    const config = { name: 'Blink', deviceSettingOverrides: inventory.cameras.map(camera => ({ deviceIdentifier: camera.key, homeKitSecureVideo: true })),
      _bridge: { username: 'private-existing-value' }, futureSetting: { keep: true } };
    const original = structuredClone(config);
    expect(validator.validate({ revision: 1, config }).valid).toBe(true);
    expect(config).toEqual(original);
    expect(validator.validate({ revision: 2, config: { name: 'Blink' } }).valid).toBe(true);
    expect(validator.validate({ revision: 3, config: { name: 'Blink', deviceSettingOverrides: [] } }).valid).toBe(true);
  });

  it('rejects invalid values in any section without coercion or defaults', () => {
    const config = { name: 'Blink', videoBitrate: '1200', pollInterval: 1, deviceSettingOverrides: [{ deviceIdentifier: ' ' }], enableAudio: 'false' };
    const before = structuredClone(config);
    const result = validator.validate({ revision: 9, config });
    expect(result.revision).toBe(9); expect(result.valid).toBe(false);
    expect(result.errors.map(error => error.path)).toEqual(expect.arrayContaining(['/videoBitrate', '/pollInterval', '/deviceSettingOverrides/0/deviceIdentifier', '/enableAudio']));
    expect(config).toEqual(before);
    expect(JSON.stringify(result)).not.toContain('1200');
  });

  it('validates module identity, duplicate IDs and inventory bounds using the server snapshot', () => {
    for (const limits of [
      [{ syncModuleId: 'unknown', maxFeeds: 1 }],
      [{ syncModuleId: '20', maxFeeds: 7 }],
      [{ syncModuleId: '20', maxFeeds: 1 }, { syncModuleId: '20', maxFeeds: 2 }],
    ]) expect(validator.validate({ revision: 1, config: { name: 'Blink', syncModuleFeedLimits: limits } }).valid).toBe(false);
    const result = validator.validate({ revision: 2, config: { name: 'Blink', syncModuleFeedLimits: [{ syncModuleId: '20', maxFeeds: 2 }] } });
    expect(result.valid).toBe(true); expect(result.capacity?.global).toBe(6);
  });

  it('keeps unresolved saved selectors as warnings, but cannot validate explicit module limits without discovery', () => {
    const unavailable = new SettingsValidator(() => undefined);
    expect(unavailable.validate({ revision: 1, config: { name: 'Blink', deviceSettingOverrides: [{ deviceIdentifier: 'existing-camera', homeKitSecureVideo: true }] } }).valid).toBe(true);
    const stale = validator.validate({ revision: 2, inventoryRevision: 'stale', config: { name: 'Blink', deviceSettingOverrides: [{ deviceIdentifier: 'existing-camera', homeKitSecureVideo: true }] } });
    expect(stale.warnings.length).toBeGreaterThan(0);
    expect(unavailable.validate({ revision: 3, config: { name: 'Blink', syncModuleFeedLimits: [{ syncModuleId: '20', maxFeeds: 1 }] } }).valid).toBe(false);
  });

  it('rejects malformed requests and runtime-invalid credential/retired settings without exposing values', () => {
    for (const payload of [null, [], { revision: -1, config: {} }, { revision: 1, config: null }]) {
      expect(validator.validate(payload)).toMatchObject({ valid: false, errors: [{ code: 'request' }] });
    }
    const result = validator.validate({ revision: 4, config: { name: 'Blink', username: 'private-user-value', ffmpegPath: 'private-path-value' } });
    expect(result.valid).toBe(false);
    expect(result.errors.map(error => error.code)).toEqual(expect.arrayContaining(['credentials', 'retired']));
    expect(JSON.stringify(result)).not.toContain('private-user-value'); expect(JSON.stringify(result)).not.toContain('private-path-value');
  });

  it('checks native retry/age bounds without mutating the draft', () => {
    const config = { name: 'Blink', nativeRecording: { initialDelaySeconds: 120, maxJobAgeSeconds: 60 } };
    const before = structuredClone(config);
    const result = validator.validate({ revision: 1, config });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ path: '/nativeRecording/maxJobAgeSeconds' })]));
    expect(config).toEqual(before);
  });

  it('shows the native migration path for old motion/recording settings', () => {
    const result = validator.validate({ revision: 1, config: { name: 'Blink', enableMotionPolling: false, hksvCameras: ['camera:1'] } });
    expect(result.valid).toBe(false);
    expect(result.errors.filter(error => error.code === 'retired').every(error => error.message.includes('migrate-native-recording-config.cjs'))).toBe(true);
  });

});
