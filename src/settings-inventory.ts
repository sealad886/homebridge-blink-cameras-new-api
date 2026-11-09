import { createHash } from 'node:crypto';
import { validateHomescreen } from './blink-api/domain-validation';
import type { BlinkCameraKind, BlinkHomescreen } from './types';

export type CameraKey = `${BlinkCameraKind}:${string}`;
export interface ModuleFeedLimit { syncModuleId: string; maxFeeds: number }
export interface SettingsCamera {
  key: CameraKey;
  id: string;
  kind: BlinkCameraKind;
  name: string;
  networkId: string;
  enabled: boolean;
  status?: string;
  serial?: string;
  excluded: boolean;
  moduleAssociation: {
    state: 'unique' | 'noneReported' | 'ambiguous' | 'unavailable';
    source: 'network_id';
    candidateIds: string[];
  };
}
export interface SettingsInventory {
  revision: string;
  fetchedAt: string;
  networks: Array<{ id: string; name: string; armed: boolean }>;
  syncModules: Array<{ id: string; networkId: string; name?: string; status: string; associatedCameraKeys: CameraKey[] }>;
  cameras: SettingsCamera[];
  globalFeedCapacity: number;
}
export interface FeedCapacity {
  global: number;
  cameraKeys: CameraKey[];
  modules: Array<{ syncModuleId: string; maxFeeds: number; cameraCount: number }>;
}
export class SettingsConstraintError extends Error {
  constructor(public readonly path: string, message: string) { super(message); }
}

export function cameraKey(kind: BlinkCameraKind, id: number | string): CameraKey { return `${kind}:${id}`; }

export function matchesDeviceIdentifier(
  device: { id: number | string; name?: string; serial?: string }, identifier: string, kind?: BlinkCameraKind,
): boolean {
  if (typeof identifier !== 'string' || !identifier.trim()) return false;
  if (/^(?:camera|owl|doorbell):/.test(identifier)) {
    return kind !== undefined && identifier === cameraKey(kind, device.id);
  }
  return identifier === device.name || identifier === String(device.id) || identifier === device.serial;
}

export function matchesCameraIdentifier(camera: SettingsCamera, identifier: string): boolean {
  return matchesDeviceIdentifier(camera, identifier, camera.kind);
}

const strings = (config: Record<string, unknown>, key: string): string[] =>
  Array.isArray(config[key]) ? config[key].filter((entry: unknown): entry is string => typeof entry === 'string') : [];

export function isInventoryCameraExcluded(camera: SettingsCamera, inventory: SettingsInventory, config: Record<string, unknown>): boolean {
  const excludedDevices = strings(config, 'excludeDevices');
  const excludedNetworks = strings(config, 'excludedNetworks');
  const network = inventory.networks.find(entry => entry.id === camera.networkId);
  return excludedDevices.some(entry => matchesCameraIdentifier(camera, entry)) || excludedNetworks.includes(camera.networkId)
    || (network !== undefined && (excludedNetworks.includes(network.name)
      || excludedDevices.some(entry => matchesDeviceIdentifier(network, entry))));
}

/** Project only settings metadata. Raw provider data and credentials never leave this boundary. */
export function projectSettingsInventory(value: BlinkHomescreen, config: Record<string, unknown> = {}): SettingsInventory {
  const homescreen = validateHomescreen(value);
  const modulesKnown = Array.isArray(homescreen.sync_modules);
  const syncModules: SettingsInventory['syncModules'] = (homescreen.sync_modules ?? []).map(module => ({
    id: String(module.id), networkId: String(module.network_id), status: module.status,
    ...(module.name === undefined ? {} : { name: module.name }), associatedCameraKeys: [],
  }));
  const networks = homescreen.networks.map(network => ({ id: String(network.id), name: network.name, armed: network.armed === true }));
  const cameras: SettingsCamera[] = [];
  for (const [kind, list] of [['camera', homescreen.cameras], ['owl', homescreen.owls], ['doorbell', homescreen.doorbells]] as const) {
    for (const camera of list) {
      const candidateIds = syncModules.filter(module => module.networkId === String(camera.network_id)).map(module => module.id);
      const state = !modulesKnown ? 'unavailable' : candidateIds.length === 1 ? 'unique' : candidateIds.length ? 'ambiguous' : 'noneReported';
      cameras.push({ key: cameraKey(kind, camera.id), kind, id: String(camera.id), name: camera.name,
        networkId: String(camera.network_id), enabled: camera.enabled === true, excluded: false,
        ...(typeof camera.status === 'string' ? { status: camera.status } : {}),
        ...(typeof camera.serial === 'string' ? { serial: camera.serial } : {}),
        moduleAssociation: { state, candidateIds, source: 'network_id' } });
    }
  }
  const identities = cameras.map(camera => camera.key);
  if (new Set(identities).size !== identities.length || new Set(syncModules.map(module => module.id)).size !== syncModules.length) {
    throw new Error('Blink returned duplicate inventory identifiers.');
  }
  const inventory: SettingsInventory = { revision: '', fetchedAt: new Date().toISOString(), networks, syncModules, cameras, globalFeedCapacity: 0 };
  for (const camera of cameras) {
    camera.excluded = isInventoryCameraExcluded(camera, inventory, config);
    if (camera.moduleAssociation.state === 'unique') {
      syncModules.find(module => module.id === camera.moduleAssociation.candidateIds[0])?.associatedCameraKeys.push(camera.key);
    }
  }
  inventory.globalFeedCapacity = cameras.filter(camera => !camera.excluded).length;
  inventory.revision = createHash('sha256').update(JSON.stringify({ networks, syncModules, cameras })).digest('hex').slice(0, 24);
  return inventory;
}

export function validateModuleFeedLimits(value: unknown): ModuleFeedLimit[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new SettingsConstraintError('/syncModuleFeedLimits', 'Sync Module feed limits must be a list.');
  const seen = new Set<string>();
  return value.map((entry: unknown, index) => {
    const location = `/syncModuleFeedLimits/${index}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new SettingsConstraintError(location, 'Invalid Sync Module feed limit.');
    const row = entry as Record<string, unknown>;
    if (typeof row.syncModuleId !== 'string' || !row.syncModuleId.trim()) throw new SettingsConstraintError(`${location}/syncModuleId`, 'Choose a Sync Module.');
    if (seen.has(row.syncModuleId)) throw new SettingsConstraintError(`${location}/syncModuleId`, 'A Sync Module can have only one feed limit.');
    if (typeof row.maxFeeds !== 'number' || !Number.isSafeInteger(row.maxFeeds) || row.maxFeeds < 1) {
      throw new SettingsConstraintError(`${location}/maxFeeds`, 'Feed limit must be a positive safe integer.');
    }
    seen.add(row.syncModuleId);
    return { syncModuleId: row.syncModuleId, maxFeeds: row.maxFeeds };
  });
}

/** Shared runtime/editor rules. No mutation, defaults, network calls or hidden fallback caps. */
export function deriveFeedCapacity(inventory: SettingsInventory, config: Record<string, unknown>): FeedCapacity {
  const overrides = validateModuleFeedLimits(config.syncModuleFeedLimits);
  const included = inventory.cameras.filter(camera => !isInventoryCameraExcluded(camera, inventory, config));
  const modules = inventory.syncModules.map(module => {
    const cameras = included.filter(camera => camera.moduleAssociation.state === 'unique' && camera.moduleAssociation.candidateIds[0] === module.id);
    return { syncModuleId: module.id, maxFeeds: cameras.length, cameraCount: cameras.length };
  });
  for (const [index, override] of overrides.entries()) {
    const module = modules.find(entry => entry.syncModuleId === override.syncModuleId);
    const location = `/syncModuleFeedLimits/${index}`;
    if (!module) throw new SettingsConstraintError(`${location}/syncModuleId`, 'The selected Sync Module is unknown. Refresh camera discovery.');
    if (included.some(camera => camera.moduleAssociation.candidateIds.includes(override.syncModuleId) && camera.moduleAssociation.state !== 'unique')) {
      throw new SettingsConstraintError(`${location}/syncModuleId`, 'Camera association with this Sync Module is ambiguous. Remove its explicit limit.');
    }
    if (override.maxFeeds > module.cameraCount || override.maxFeeds > included.length) {
      throw new SettingsConstraintError(`${location}/maxFeeds`, 'Feed limit exceeds the available associated cameras.');
    }
    module.maxFeeds = override.maxFeeds;
  }
  return { global: included.length, cameraKeys: included.map(camera => camera.key), modules };
}
