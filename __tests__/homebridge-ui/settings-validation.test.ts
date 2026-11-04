import { SettingsValidator } from '../../src/homebridge-ui/settings-validation';
import { projectSettingsInventory, recordingSettingsRevision } from '../../src/settings-inventory';
import type { BlinkHomescreen } from '../../src/types';

const inventory = projectSettingsInventory({ networks: [{ id: 10, name: 'System', armed: true }],
  sync_modules: [{ id: 20, network_id: 10, status: 'online' }], account: { account_id: 1 },
  cameras: Array.from({ length: 6 }, (_, id) => ({ id: id + 1, network_id: 10, name: `Camera ${id}`, enabled: true })),
  owls: [], doorbells: [],
} as BlinkHomescreen);

describe('full settings draft validation', () => {
  const validator = new SettingsValidator(() => inventory);

  it('returns the server-computed desired recording revision and selection without making missing runtime health a Save error', () => {
    const config = { name: 'Blink', hksvCameras: ['camera:1', 'Old Camera'], enableAudio: false };
    const result = validator.validate({ revision: 47, config, health: { state: 'unsupported' } });
    expect(result.valid).toBe(true); expect(result.revision).toBe(47);
    expect(result.recording?.settingsRevision).toBe(recordingSettingsRevision(config));
    expect(result.recording?.selections).toEqual(expect.arrayContaining([
      expect.objectContaining({ cameraKey: 'camera:1', available: true }),
      expect.objectContaining({ label: 'Old Camera', available: false, reason: 'camera-unresolved' }),
    ]));
    expect(new SettingsValidator(() => undefined).validate({ revision: 1, config }).valid).toBe(true);
  });

  it('accepts six qualified recording cameras, absent/empty recording selection and unknown fields without mutation', () => {
    const config = { name: 'Blink', hksvCameras: inventory.cameras.map(camera => camera.key),
      _bridge: { username: 'private-existing-value' }, futureSetting: { keep: true } };
    const original = structuredClone(config);
    expect(validator.validate({ revision: 1, config }).valid).toBe(true);
    expect(config).toEqual(original);
    expect(validator.validate({ revision: 2, config: { name: 'Blink' } }).valid).toBe(true);
    expect(validator.validate({ revision: 3, config: { name: 'Blink', hksvCameras: [] } }).valid).toBe(true);
  });

  it('rejects invalid values in any section without coercion or defaults', () => {
    const config = { name: 'Blink', videoBitrate: '1200', pollInterval: 1, hksvCameras: [' '], enableAudio: 'false' };
    const before = structuredClone(config);
    const result = validator.validate({ revision: 9, config });
    expect(result.revision).toBe(9); expect(result.valid).toBe(false);
    expect(result.errors.map(error => error.path)).toEqual(expect.arrayContaining(['/videoBitrate', '/pollInterval', '/hksvCameras/0', '/enableAudio']));
    expect(config).toEqual(before);
    expect(JSON.stringify(result)).not.toContain('1200');
  });

  it('validates recording source and per-module overrides without materializing defaults', () => {
    for (const config of [{ name: 'Blink' }, { name: 'Blink', syncModuleRecording: [] },
      { name: 'Blink', hksvSource: 'continuous', syncModuleRecording: [{ syncModuleId: '20', source: 'saved-clips', pollIntervalSeconds: 15 }] },
      { name: 'Blink', syncModuleRecording: [{ syncModuleId: '999', pollIntervalSeconds: 300 }] }]) {
      const before = structuredClone(config);
      expect(validator.validate({ revision: 1, config }).valid).toBe(true);
      expect(config).toEqual(before);
    }
    for (const config of [{ name: 'Blink', hksvSource: 'live' },
      { name: 'Blink', syncModuleRecording: [{}] },
      { name: 'Blink', syncModuleRecording: [{ syncModuleId: '20', source: 'unknown' }] },
      { name: 'Blink', syncModuleRecording: [{ syncModuleId: '20', pollIntervalSeconds: 14 }] },
      { name: 'Blink', syncModuleRecording: [{ syncModuleId: '20', pollIntervalSeconds: 301 }] },
      { name: 'Blink', syncModuleRecording: [{ syncModuleId: '20' }, { syncModuleId: '20', source: 'continuous' }] }]) {
      expect(validator.validate({ revision: 1, config }).valid).toBe(false);
    }
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
    expect(unavailable.validate({ revision: 1, config: { name: 'Blink', hksvCameras: ['existing-camera'] } }).valid).toBe(true);
    const stale = validator.validate({ revision: 2, inventoryRevision: 'stale', config: { name: 'Blink', hksvCameras: ['existing-camera'] } });
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
});
