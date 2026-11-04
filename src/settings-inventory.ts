import { createHash } from 'node:crypto';
import { validateHomescreen } from './blink-api/domain-validation';
import type { BlinkCameraKind, BlinkHomescreen } from './types';
import { normalizeNativeCameraToken } from './blink-api/local-storage';
import { DEFAULT_RECORDING_POLL_SECONDS, DEFAULT_RECORDING_SOURCE, type RecordingSource } from './settings';

export type CameraKey = `${BlinkCameraKind}:${string}`;
export interface ModuleFeedLimit { syncModuleId: string; maxFeeds: number }
export interface ModuleRecording { syncModuleId: string; source?: RecordingSource; pollIntervalSeconds?: number }
export interface CameraRecordingSelection {
  source: RecordingSource; pollIntervalSeconds: number; syncModuleId?: string; available: boolean;
  reason?: 'module-unavailable' | 'camera-name-ambiguous' | 'camera-unavailable';
}
export type RecordingSelectionReason = NonNullable<CameraRecordingSelection['reason']> | 'inventory-unavailable' |
  'camera-excluded' | 'camera-unresolved' | 'camera-selector-ambiguous';
export interface RecordingSelection extends Omit<CameraRecordingSelection, 'reason'> {
  id: string; label: string; cameraKey?: CameraKey; moduleLabel?: string;
  selection: 'available' | 'excluded' | 'unresolved' | 'ambiguous' | 'unavailable'; reason?: RecordingSelectionReason;
}

/** Shared local identity; the public report never exposes provider IDs or selectors. */
export function recordingIdentity(value: string): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

/** Configuration applicability only; credentials, logging and inventory refresh times are excluded. */
export function recordingSettingsRevision(config: Record<string, unknown>): string {
  const source = validateRecordingSource(config.hksvSource);
  const list = (key: string) => [...new Set(strings(config, key))].sort();
  const overrides = validateModuleRecording(config.syncModuleRecording).map(row => ({ syncModuleId: row.syncModuleId,
    source: row.source ?? source, pollIntervalSeconds: row.pollIntervalSeconds ?? DEFAULT_RECORDING_POLL_SECONDS,
  })).sort((a, b) => a.syncModuleId.localeCompare(b.syncModuleId));
  return createHash('sha256').update(JSON.stringify({ selected: list('hksvCameras'), source, overrides,
    excludedDevices: list('excludeDevices'), excludedNetworks: list('excludedNetworks'), audio: config.enableAudio !== false,
  })).digest('hex').slice(0, 24);
}

/** Every saved selection is represented; aliases for one known camera share one row. */
export function projectRecordingSelections(inventory: SettingsInventory | undefined, config: Record<string, unknown>): RecordingSelection[] {
  const source = validateRecordingSource(config.hksvSource), rows = new Map<string, RecordingSelection>();
  for (const selector of strings(config, 'hksvCameras')) {
    const matches = inventory?.cameras.filter(camera => matchesCameraIdentifier(camera, selector));
    const camera = matches?.length === 1 ? matches[0] : undefined;
    const id = recordingIdentity(camera?.key ?? `selector:${selector}`);
    if (rows.has(id)) continue;
    if (!camera) {
      rows.set(id, { id, label: selector.replace(/\p{Cc}/gu, '').slice(0, 128) || 'Unavailable camera', source,
        pollIntervalSeconds: DEFAULT_RECORDING_POLL_SECONDS, available: false,
        selection: matches && matches.length > 1 ? 'ambiguous' : 'unresolved',
        reason: !inventory ? 'inventory-unavailable' : matches && matches.length > 1 ? 'camera-selector-ambiguous' : 'camera-unresolved' });
      continue;
    }
    const resolved = resolveCameraRecording(inventory!, camera.key, config);
    const excluded = isInventoryCameraExcluded(camera, inventory!, config);
    const module = inventory!.syncModules.find(value => value.id === resolved.syncModuleId);
    rows.set(id, { ...resolved, id, label: camera.name.replace(/\p{Cc}/gu, '').slice(0, 128) || 'Camera', cameraKey: camera.key,
      ...(module ? { moduleLabel: module.name ?? 'Sync Module' } : {}), available: resolved.available && !excluded,
      selection: excluded ? 'excluded' : resolved.available ? 'available' : 'unavailable',
      ...(excluded ? { reason: 'camera-excluded' as const } : {}) });
  }
  return [...rows.values()];
}
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

export function validateRecordingSource(value: unknown, location = '/hksvSource'): RecordingSource {
  if (value === undefined) return DEFAULT_RECORDING_SOURCE;
  if (value !== 'saved-clips' && value !== 'continuous') throw new SettingsConstraintError(location, 'Choose a supported recording source.');
  return value;
}

export function validateModuleRecording(value: unknown): ModuleRecording[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new SettingsConstraintError('/syncModuleRecording', 'Sync Module recording settings must be a list.');
  const seen = new Set<string>();
  return value.map((entry: unknown, index) => {
    const location = `/syncModuleRecording/${index}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new SettingsConstraintError(location, 'Invalid Sync Module recording settings.');
    const row = entry as Record<string, unknown>;
    if (typeof row.syncModuleId !== 'string' || !/^[1-9][0-9]{0,15}$/.test(row.syncModuleId) || !Number.isSafeInteger(Number(row.syncModuleId))) {
      throw new SettingsConstraintError(`${location}/syncModuleId`, 'Choose a Sync Module.');
    }
    if (seen.has(row.syncModuleId)) throw new SettingsConstraintError(`${location}/syncModuleId`, 'A Sync Module can have only one recording override.');
    const source = row.source === undefined ? undefined : validateRecordingSource(row.source, `${location}/source`);
    const poll = row.pollIntervalSeconds;
    if (poll !== undefined && (typeof poll !== 'number' || !Number.isInteger(poll) || poll < 15 || poll > 300)) {
      throw new SettingsConstraintError(`${location}/pollIntervalSeconds`, 'Clip polling must be between 15 and 300 seconds.');
    }
    seen.add(row.syncModuleId);
    return { syncModuleId: row.syncModuleId, ...(source === undefined ? {} : { source }),
      ...(poll === undefined ? {} : { pollIntervalSeconds: poll as number }) };
  });
}

/** Runtime and editor share source selection and full-inventory provider-name ambiguity checks. */
export function resolveCameraRecording(inventory: SettingsInventory, key: string, config: Record<string, unknown>): CameraRecordingSelection {
  const global = validateRecordingSource(config.hksvSource), overrides = validateModuleRecording(config.syncModuleRecording);
  const camera = inventory.cameras.find(value => value.key === key);
  const moduleId = camera?.moduleAssociation.state === 'unique' ? camera.moduleAssociation.candidateIds[0] : undefined;
  const override = overrides.find(value => value.syncModuleId === moduleId);
  const source = override?.source ?? global, pollIntervalSeconds = override?.pollIntervalSeconds ?? DEFAULT_RECORDING_POLL_SECONDS;
  const result: CameraRecordingSelection = { source, pollIntervalSeconds, ...(moduleId ? { syncModuleId: moduleId } : {}), available: true };
  if (!camera || isInventoryCameraExcluded(camera, inventory, config)) return { ...result, available: false, reason: 'camera-unavailable' };
  if (!moduleId && (source === 'saved-clips' || overrides.some(value => camera.moduleAssociation.candidateIds.includes(value.syncModuleId) && value.source !== undefined))) {
    return { ...result, available: false, reason: 'module-unavailable' };
  }
  if (source === 'saved-clips') {
    try {
      const token = normalizeNativeCameraToken(camera.name);
      const matches = inventory.cameras.filter(value => value.networkId === camera.networkId &&
        value.moduleAssociation.candidateIds.includes(moduleId!) && normalizeNativeCameraToken(value.name) === token);
      if (matches.length !== 1) return { ...result, available: false, reason: 'camera-name-ambiguous' };
    } catch { return { ...result, available: false, reason: 'camera-name-ambiguous' }; }
  }
  return result;
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
