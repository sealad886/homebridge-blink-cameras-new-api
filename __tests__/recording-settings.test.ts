import { resolveCameraRecording, validateModuleRecording, validateRecordingSource, type SettingsInventory } from '../src/settings-inventory';

const inventory = (): SettingsInventory => ({ revision: 'test', fetchedAt: new Date().toISOString(), globalFeedCapacity: 2,
  networks: [{ id: '1', name: 'Home', armed: true }],
  syncModules: [{ id: '10', networkId: '1', status: 'online', associatedCameraKeys: ['camera:2', 'camera:3'] }],
  cameras: [2, 3].map(id => ({ key: `camera:${id}`, id: String(id), kind: 'camera', name: `Camera ${id}`, networkId: '1',
    enabled: true, excluded: false, moduleAssociation: { state: 'unique', source: 'network_id', candidateIds: ['10'] } })),
});
test('saved clips and implicit module controls are valid defaults, without blank entries', () => {
  expect(validateRecordingSource(undefined)).toBe('saved-clips');
  expect(validateModuleRecording(undefined)).toEqual([]); expect(validateModuleRecording([])).toEqual([]);
  expect(resolveCameraRecording(inventory(), 'camera:2', {})).toMatchObject({ source: 'saved-clips', pollIntervalSeconds: 30, available: true, syncModuleId: '10' });
});
test('explicit per-module source/poll overrides inherit missing settings without changing live limits', () => {
  expect(resolveCameraRecording(inventory(), 'camera:2', { hksvSource: 'continuous', syncModuleRecording: [{ syncModuleId: '10', pollIntervalSeconds: 15 }] }))
    .toMatchObject({ source: 'continuous', pollIntervalSeconds: 15, available: true });
  expect(resolveCameraRecording(inventory(), 'camera:2', { syncModuleRecording: [{ syncModuleId: '10', source: 'continuous' }] }).source).toBe('continuous');
});
test.each([[{}], [{ syncModuleId: '' }], [{ syncModuleId: '10', pollIntervalSeconds: 14 }],
  [{ syncModuleId: '10', source: 'other' }], [{ syncModuleId: '10' }, { syncModuleId: '10' }]].map(rows => ({ rows })))('rejects invalid optional rows: %p', ({ rows }) => {
  expect(() => validateModuleRecording(rows)).toThrow();
});
test('ambiguous saved module binding and namesakes in excluded inventory are unavailable', () => {
  const i = inventory(); i.cameras[0].moduleAssociation = { state: 'ambiguous', source: 'network_id', candidateIds: ['10', '11'] };
  expect(resolveCameraRecording(i, 'camera:2', {})).toMatchObject({ source: 'saved-clips', available: false, reason: 'module-unavailable' });
  const collision = inventory(); collision.cameras[0].name = 'Garden_Camera'; collision.cameras[1].name = 'Garden_ Camera';
  collision.cameras[1].excluded = true;
  expect(resolveCameraRecording(collision, 'camera:2', {})).toMatchObject({ available: false, reason: 'camera-name-ambiguous' });
});
