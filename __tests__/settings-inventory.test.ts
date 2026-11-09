import { projectSettingsInventory, deriveFeedCapacity, matchesCameraIdentifier } from '../src/settings-inventory';
import { CameraFeedAdmission } from '../src/accessories/feed-admission';
import type { BlinkHomescreen } from '../src/types';

const screen = (): BlinkHomescreen => ({
  account: { account_id: 1 },
  networks: [{ id: 10, name: 'First system', armed: true }, { id: 20, name: 'Second system', armed: false }],
  sync_modules: [{ id: 101, network_id: 10, status: 'online' }, { id: 202, network_id: 20, status: 'online' }],
  cameras: Array.from({ length: 6 }, (_, i) => ({ id: i + 1, network_id: i < 3 ? 10 : 20,
    name: i < 2 ? 'Same name' : `Camera ${i}`, enabled: true, status: i === 5 ? 'offline' : 'online' })),
  owls: [{ id: 1, network_id: 30, name: 'Standalone', enabled: true }], doorbells: [],
});

describe('settings inventory and shared feed capacity', () => {
  it('distinguishes device kinds, keeps offline cameras and joins real module IDs', () => {
    const inventory = projectSettingsInventory(screen());
    expect(inventory.cameras.map(camera => camera.key)).toEqual([
      'camera:1', 'camera:2', 'camera:3', 'camera:4', 'camera:5', 'camera:6', 'owl:1',
    ]);
    expect(inventory.globalFeedCapacity).toBe(7);
    expect(inventory.cameras[0].moduleAssociation.candidateIds).toEqual(['101']);
    expect(inventory.cameras[6].moduleAssociation.state).toBe('noneReported');
    expect(matchesCameraIdentifier(inventory.cameras[0], 'owl:1')).toBe(false);
    expect(matchesCameraIdentifier(inventory.cameras[6], 'owl:1')).toBe(true);
    expect(matchesCameraIdentifier(inventory.cameras[0], 'Same name')).toBe(true);
  });

  it('derives capacity from draft exclusions and validates independently bounded module overrides', () => {
    const inventory = projectSettingsInventory(screen());
    const excludedInventory = projectSettingsInventory(screen(), { excludeDevices: ['camera:1'] });
    expect(excludedInventory.cameras).toHaveLength(7);
    expect(excludedInventory.cameras[0].excluded).toBe(true);
    expect(excludedInventory.globalFeedCapacity).toBe(6);
    const capacity = deriveFeedCapacity(inventory, { excludeDevices: ['camera:1'],
      syncModuleFeedLimits: [{ syncModuleId: '101', maxFeeds: 1 }] });
    expect(capacity.global).toBe(6);
    expect(capacity.modules).toEqual([
      { syncModuleId: '101', maxFeeds: 1, cameraCount: 2 },
      { syncModuleId: '202', maxFeeds: 3, cameraCount: 3 },
    ]);
    expect(() => deriveFeedCapacity(inventory, { syncModuleFeedLimits: [{ syncModuleId: '101', maxFeeds: 4 }] })).toThrow(/associated cameras/);
    expect(() => deriveFeedCapacity(inventory, { syncModuleFeedLimits: [{ syncModuleId: 'unknown', maxFeeds: 1 }] })).toThrow(/unknown/);
    for (const maxFeeds of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1']) {
      expect(() => deriveFeedCapacity(inventory, { syncModuleFeedLimits: [{ syncModuleId: '101', maxFeeds }] })).toThrow();
    }
  });

  it('rejects explicit overrides for ambiguous membership instead of inventing an assignment', () => {
    const data = screen(); data.sync_modules.push({ id: 102, network_id: 10, status: 'online' });
    const inventory = projectSettingsInventory(data);
    expect(inventory.cameras[0].moduleAssociation.state).toBe('ambiguous');
    expect(() => deriveFeedCapacity(inventory, { syncModuleFeedLimits: [{ syncModuleId: '101', maxFeeds: 1 }] })).toThrow(/ambiguous/);
    expect(deriveFeedCapacity(inventory, {}).global).toBe(7);
  });

  it('validates module metadata without returning provider secrets in errors', () => {
    const data = screen(); data.sync_modules[0].id = -1;
    expect(() => projectSettingsInventory(data)).toThrow(/invalid/);
  });

  it('rejects duplicate provider identities and marks missing module metadata unavailable', () => {
    const duplicateCamera = screen(); duplicateCamera.cameras.push({ ...duplicateCamera.cameras[0] });
    expect(() => projectSettingsInventory(duplicateCamera)).toThrow(/duplicate/);
    const duplicateModule = screen(); duplicateModule.sync_modules.push({ ...duplicateModule.sync_modules[0] });
    expect(() => projectSettingsInventory(duplicateModule)).toThrow(/duplicate/);
    const missing = { ...screen(), sync_modules: undefined } as unknown as BlinkHomescreen;
    expect(projectSettingsInventory(missing).cameras[0].moduleAssociation.state).toBe('unavailable');
  });

  it('admits six distinct feeds, isolates modules and releases a lease only once', () => {
    const inventory = projectSettingsInventory(screen());
    const admission = new CameraFeedAdmission(); admission.configure(inventory, {});
    const leases = inventory.cameras.slice(0, 6).map(camera => admission.acquire(camera.key));
    expect(() => admission.acquire('camera:1')).toThrow(/already/);
    leases.forEach(lease => { lease.release(); lease.release(); });
    admission.configure(inventory, { syncModuleFeedLimits: [{ syncModuleId: '101', maxFeeds: 1 }] });
    const first = admission.acquire('camera:1');
    expect(() => admission.acquire('camera:2')).toThrow(/module/i);
    const independent = admission.acquire('camera:4');
    first.release(); expect(() => admission.acquire('camera:2')).not.toThrow(); independent.release();
  });

  it('fails admission without inventory and retains active leases when capacity changes', () => {
    const admission = new CameraFeedAdmission();
    expect(() => admission.acquire('camera:1')).toThrow(/inventory/i);
    const inventory = projectSettingsInventory(screen()); admission.configure(inventory, {});
    const held = admission.acquire('camera:1');
    admission.configure(inventory, { excludedNetworks: ['10'] });
    expect(() => admission.acquire('camera:2')).toThrow(/excluded/);
    expect(() => admission.acquire('camera:1')).toThrow();
    held.release();
    expect(() => admission.acquire('camera:4')).not.toThrow();
  });
});
