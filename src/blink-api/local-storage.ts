import { requireRemoteId } from './domain-validation';

export interface NativeStorageModule {
  networkId: number;
  syncModuleId: number;
}

export interface NativeStorageCommand {
  commandId: number;
}

export interface NativeClipDescriptor {
  clipId: string;
  cameraToken: string;
  capturedAt: string;
  /** Provider KiB-scale estimate; never an exact binary response length. */
  sizeKiB: number;
}

export interface NativeStorageCatalog {
  manifestId: string;
  clips: NativeClipDescriptor[];
}

export type NativeStorageManifestResult = { state: 'pending' } | { state: 'ready'; catalog: NativeStorageCatalog };

export class NativeStorageResponseError extends Error {
  constructor() {
    super('Blink returned invalid native storage metadata.');
    this.name = 'NativeStorageResponseError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NativeStorageResponseError();
  return value as Record<string, unknown>;
}

export function requireNativeStorageModule(value: unknown): NativeStorageModule {
  const module = record(value);
  return { networkId: requireRemoteId(module.networkId), syncModuleId: requireRemoteId(module.syncModuleId) };
}

export function parseNativeStorageCommand(value: unknown, networkId: number): NativeStorageCommand {
  try {
    requireRemoteId(networkId);
    const command = record(value);
    if (requireRemoteId(command.network_id) !== networkId) throw new NativeStorageResponseError();
    return { commandId: requireRemoteId(command.id) };
  } catch { throw new NativeStorageResponseError(); }
}

/** Only the matching acknowledgement is known to be pending; malformed catalogs are errors. */
export function parseNativeStorageManifest(value: unknown, networkId: number, requestId: number): NativeStorageManifestResult {
  requireRemoteId(networkId);
  requireRemoteId(requestId);
  const response = record(value);
  if (response.network_id !== undefined && requireRemoteId(response.network_id) !== networkId) throw new NativeStorageResponseError();
  if ('manifest_id' in response || 'clips' in response) return { state: 'ready', catalog: parseNativeStorageCatalog(response) };
  if (Object.keys(response).some(key => key !== 'id' && key !== 'network_id')
    || parseNativeStorageCommand(response, networkId).commandId !== requestId) throw new NativeStorageResponseError();
  return { state: 'pending' };
}

export function requireNativeManifestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/.test(value)) throw new NativeStorageResponseError();
  return value;
}

export function requireNativeClipId(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,63}$/.test(value)) throw new NativeStorageResponseError();
  return value;
}

/** Blink's provider token retains Unicode letters/numbers and underscores (Python \w semantics). */
export function normalizeNativeCameraToken(value: string): string {
  if (typeof value !== 'string' || value.length > 4096) throw new NativeStorageResponseError();
  const token = value.replace(/[^\p{L}\p{N}_]/gu, '');
  if (!token || [...token].length > 256) throw new NativeStorageResponseError();
  return token;
}

function captureTimestamp(value: unknown): string {
  if (typeof value !== 'string') throw new NativeStorageResponseError();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) throw new NativeStorageResponseError();
  const [, y, m, d, h, minute, second, , oh, om] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(h) > 23
    || Number(minute) > 59 || Number(second) > 59 || Number(oh ?? 0) > 23 || Number(om ?? 0) > 59
    || !Number.isFinite(Date.parse(value))) throw new NativeStorageResponseError();
  return value;
}

export function parseNativeStorageCatalog(value: unknown): NativeStorageCatalog {
  const catalog = record(value);
  const manifestId = requireNativeManifestId(catalog.manifest_id);
  if (typeof catalog.version !== 'string' || !/^[A-Za-z0-9._-]{1,32}$/.test(catalog.version)
    || !Array.isArray(catalog.clips) || catalog.clips.length > 1000) throw new NativeStorageResponseError();
  return {
    manifestId,
    clips: catalog.clips.map(value => {
      const clip = record(value);
      const clipId = requireNativeClipId(clip.id);
      if (typeof clip.size !== 'string' || !/^[1-9][0-9]{0,9}$/.test(clip.size)
        || BigInt(clip.size) > 32n * 1024n
        || typeof clip.camera_name !== 'string' || normalizeNativeCameraToken(clip.camera_name) !== clip.camera_name) throw new NativeStorageResponseError();
      return { clipId, cameraToken: clip.camera_name, capturedAt: captureTimestamp(clip.created_at), sizeKiB: Number(BigInt(clip.size)) };
    }),
  };
}
