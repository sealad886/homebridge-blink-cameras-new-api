import { recordingSettingsRevision, projectRecordingSelections, type SettingsInventory } from '../src/settings-inventory';
import { composeRecordingReadiness, unknownHomeRecordingObservation } from '../src/recording-readiness';
import type { NativeClipActivity } from '../src/native-clip-recorder';

const inventory = (): SettingsInventory => ({ revision: 'fixture', fetchedAt: new Date().toISOString(), globalFeedCapacity: 2,
  networks: [{ id: '1', name: 'Home', armed: true }],
  syncModules: [{ id: '10', networkId: '1', status: 'online', associatedCameraKeys: ['camera:2', 'camera:3'] }],
  cameras: [2, 3].map(id => ({ key: `camera:${id}`, id: String(id), kind: 'camera', name: `Camera ${id}`, networkId: '1',
    enabled: true, excluded: false, moduleAssociation: { state: 'unique', source: 'network_id', candidateIds: ['10'] } })),
});

test('composed readiness waits for observed Home permissions and the camera baseline, supports video-only, and reports continuous truthfully', () => {
  const config = { hksvCameras: ['camera:2', 'Old Camera'] };
  const home = { ...unknownHomeRecordingObservation(), configuration: 'configured' as const, recordingActive: true,
    cameraActive: true, audioActive: false, triggerTypes: [1] };
  const activity: NativeClipActivity = { updatedAt: '2026-11-04T00:00:00.000Z', queue: 0, active: 0, mediaBytes: 0, reservedBytes: 0, preparationLimit: 2,
    modules: [], cameras: [{ id: '0000000000000000', key: 'camera:2', label: 'Camera', queued: 0, delivered: 0, uncertain: 0, baseline: 'pending' }] };
  const make = (observation = home) => composeRecordingReadiness({ config, inventory: inventory(), runtime: 'running', activity,
    observations: new Map([['camera:2', { home: observation, status: { state: 'off' as const } }]]) });
  expect(make().cameras[0]).toMatchObject({ stage: 'baseline-pending', canTriggerFreshTest: false, nativeStorage: 'unverified' });
  activity.cameras[0].baseline = 'complete';
  expect(make().cameras[0]).toMatchObject({ stage: 'waiting-for-native-clip', canTriggerFreshTest: true, retainedInHomeKit: 'unconfirmed' });
  expect(make().cameras[0].nativeStorage).toBe('unverified');
  activity.cameras[0].nativeStorageObservedAt = '2026-11-04T00:00:05.000Z';
  expect(make().cameras[0]).toMatchObject({ nativeStorage: 'native-clip-observed', nativeStorageObservedAt: '2026-11-04T00:00:05.000Z', retainedInHomeKit: 'unconfirmed' });
  expect(make({ ...home, cameraActive: false }).cameras[0]).toMatchObject({ stage: 'home-camera-off', canTriggerFreshTest: false });
  expect(make({ ...home, triggerTypes: [2] }).cameras[0]).toMatchObject({ stage: 'unsupported-trigger-policy', canTriggerFreshTest: false });
  expect(make().cameras[1]).toMatchObject({ stage: 'camera-unresolved', baseline: 'not-applicable', canTriggerFreshTest: false });
  const continuous = composeRecordingReadiness({ config: { hksvCameras: ['camera:2'], hksvSource: 'continuous' }, inventory: inventory(), runtime: 'running',
    observations: new Map([['camera:2', { home: { ...home, triggerTypes: [2] }, status: { state: 'warming' } }]]) });
  expect(continuous.cameras[0]).toMatchObject({ source: 'continuous', stage: 'continuous-warming', baseline: 'not-applicable', canTriggerFreshTest: false });
});

test('selected projection deduplicates known camera aliases and retains excluded and unresolved selections', () => {
  const config = { hksvCameras: ['Camera 2', 'camera:2', 'camera:3', 'Old Camera'], excludeDevices: ['camera:3'] };
  const rows = projectRecordingSelections(inventory(), config);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatchObject({ cameraKey: 'camera:2', selection: 'available', source: 'saved-clips', syncModuleId: '10' });
  expect(rows[1]).toMatchObject({ cameraKey: 'camera:3', selection: 'excluded', available: false, reason: 'camera-excluded' });
  expect(rows[2]).toMatchObject({ selection: 'unresolved', available: false, reason: 'camera-unresolved', label: 'Old Camera' });
  expect(projectRecordingSelections(undefined, config).every(row => row.reason === 'inventory-unavailable')).toBe(true);
});

test('recording revision canonicalizes unordered selectors/defaults and changes for source, exclusions and audio gates only', () => {
  const base = { hksvCameras: ['camera:3', 'camera:2'], username: 'private-a', debug: true };
  expect(recordingSettingsRevision(base)).toBe(recordingSettingsRevision({ hksvCameras: ['camera:2', 'camera:3'],
    username: 'private-b', hksvSource: 'saved-clips', enableAudio: true, syncModuleRecording: [], excludeDevices: [] }));
  for (const change of [{ hksvSource: 'continuous' }, { enableAudio: false }, { excludeDevices: ['camera:2'] },
    { excludedNetworks: ['1'] }, { syncModuleRecording: [{ syncModuleId: '10', source: 'continuous' }] }]) {
    expect(recordingSettingsRevision({ ...base, ...change })).not.toBe(recordingSettingsRevision(base));
  }
});
