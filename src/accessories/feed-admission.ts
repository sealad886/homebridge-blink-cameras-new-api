import { deriveFeedCapacity, type CameraKey, type FeedCapacity, type SettingsInventory } from '../settings-inventory';

export interface FeedLease { release(): void }
export class FeedAdmissionError extends Error {}

/** Admission counts upstream generations, independently of their live/HSV consumers. */
export class CameraFeedAdmission {
  private inventory?: SettingsInventory;
  private capacity?: FeedCapacity;
  private readonly active = new Map<CameraKey, string | undefined>();

  configure(inventory: SettingsInventory, config: Record<string, unknown>): void {
    // An invalid new policy must never leave a silently usable old policy.
    this.capacity = undefined;
    this.inventory = inventory;
    this.capacity = deriveFeedCapacity(inventory, config);
  }

  acquire(key: CameraKey): FeedLease {
    const capacity = this.capacity;
    if (!capacity || !this.inventory) throw new FeedAdmissionError('Camera feed inventory is unavailable or its limits are invalid');
    if (this.active.has(key)) throw new FeedAdmissionError('Camera upstream feed is already owned');
    const camera = this.inventory.cameras.find(entry => entry.key === key);
    if (!camera || !capacity.cameraKeys.includes(key)) throw new FeedAdmissionError('Camera is excluded or absent from feed inventory');
    if (this.active.size >= capacity.global) throw new FeedAdmissionError('Global camera feed capacity reached');
    const moduleId = camera.moduleAssociation.state === 'unique' ? camera.moduleAssociation.candidateIds[0] : undefined;
    if (moduleId) {
      const limit = capacity.modules.find(entry => entry.syncModuleId === moduleId);
      const used = [...this.active.values()].filter(value => value === moduleId).length;
      if (!limit || used >= limit.maxFeeds) throw new FeedAdmissionError('Sync Module camera feed capacity reached');
    }
    this.active.set(key, moduleId);
    let released = false;
    return { release: () => { if (!released) { released = true; this.active.delete(key); } } };
  }
}
