import type { NativeStorageCatalog, NativeStorageClip, NativeStorageScope } from './native-storage';
import { isNativeMotionDevice, parseBlinkOffsetTimestamp, type NativeMotionDevice } from './motion-events';

export interface NativeClipCatalogScope extends NativeStorageScope { moduleId: string; }

export interface NativeClipMatchOptions {
  catalog: NativeStorageCatalog;
  /** Scope of the accepted catalog workflow, not inferred from a media URL. */
  scope: NativeClipCatalogScope;
  camera: NativeMotionDevice;
  /** All known devices, including devices not enabled for HSV, detect name collisions. */
  devices: readonly NativeMotionDevice[];
  occurredAt: number;
  toleranceMs: number;
  consumedClipIdentities?: ReadonlySet<string>;
}

export type NativeClipMatchResult = {
  status: 'matched';
  clip: NativeStorageClip;
  manifestId: number;
  identity: string;
  captureTimeMs: number;
  deltaMs: number;
} | { status: 'missing' }
  | { status: 'ambiguous'; reason: 'duplicate-device-name' | 'conflicting-clip-identity' | 'equidistant-clips' }
  | { status: 'invalid'; reason: 'scope-mismatch' | 'unknown-camera' | 'invalid-input' };

const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;
const validScope = (scope: NativeClipCatalogScope): boolean => !!scope && positiveId(scope.accountId) && positiveId(scope.networkId)
  && positiveId(scope.syncModuleId) && text(scope.moduleId);
const sameScope = (scope: NativeClipCatalogScope, device: NativeMotionDevice): boolean => device.accountId === scope.accountId
  && device.networkId === scope.networkId && device.syncModuleId === scope.syncModuleId && device.moduleId === scope.moduleId;
const deviceIdentity = (device: NativeMotionDevice): string => JSON.stringify([device.providerId, device.target]);

/** Stable across catalog refreshes and equivalent timestamp-offset spellings. */
export function nativeClipIdentity(scope: NativeClipCatalogScope, clip: NativeStorageClip): string | null {
  if (!clip || typeof clip !== 'object') return null;
  const capturedAt = parseBlinkOffsetTimestamp(clip.capturedAt);
  if (!validScope(scope) || !positiveId(clip.clipId) || clip.networkId !== scope.networkId || !text(clip.deviceName) || capturedAt === null) return null;
  return JSON.stringify([scope.accountId, scope.networkId, scope.syncModuleId, clip.clipId, clip.deviceName, capturedAt]);
}

/**
 * Matches available metadata only. URLs remain opaque, native names are exact,
 * and notification-created_at is not promoted to a measured physical PIR time.
 */
export function matchNativeClip(options: NativeClipMatchOptions): NativeClipMatchResult {
  const { catalog, scope, camera } = options;
  if (!validScope(scope) || !isNativeMotionDevice(camera) || !sameScope(scope, camera)) return { status: 'invalid', reason: 'scope-mismatch' };
  if (!catalog || !Array.isArray(catalog.clips) || catalog.clips.length > 1_000 || !Array.isArray(options.devices)
    || options.devices.length > 1_000 || options.devices.some(device => !isNativeMotionDevice(device))
    || !Number.isSafeInteger(options.occurredAt) || options.occurredAt < 0
    || !Number.isSafeInteger(options.toleranceMs) || options.toleranceMs < 0) return { status: 'invalid', reason: 'invalid-input' };
  const devices = options.devices.filter(device => isNativeMotionDevice(device) && sameScope(scope, device));
  if (!devices.some(device => deviceIdentity(device) === deviceIdentity(camera) && device.cameraId === camera.cameraId && device.nativeName === camera.nativeName)) {
    return { status: 'invalid', reason: 'unknown-camera' };
  }
  const sameName = new Set(devices.filter(device => device.nativeName === camera.nativeName).map(deviceIdentity));
  if (sameName.size > 1) return { status: 'ambiguous', reason: 'duplicate-device-name' };
  if (!catalog.clips.length) return { status: 'missing' };
  if (!positiveId(catalog.manifestId)) return { status: 'invalid', reason: 'invalid-input' };

  const fingerprints = new Map<number, string>();
  const collisions = new Set<number>();
  for (const clip of catalog.clips) {
    if (!clip || !positiveId(clip.clipId) || clip.networkId !== scope.networkId) continue;
    const signature = JSON.stringify([clip.deviceName, parseBlinkOffsetTimestamp(clip.capturedAt), clip.mediaUrl]);
    if (fingerprints.has(clip.clipId) && fingerprints.get(clip.clipId) !== signature) collisions.add(clip.clipId);
    else fingerprints.set(clip.clipId, signature);
  }

  const candidates = new Map<string, { clip: NativeStorageClip; captureTimeMs: number; deltaMs: number }>();
  for (const clip of catalog.clips) {
    if (!clip || clip.deviceName !== camera.nativeName || clip.networkId !== scope.networkId
      || typeof clip.mediaUrl !== 'string' || !clip.mediaUrl.length || clip.mediaUrl.length > 8_192) continue;
    const identity = nativeClipIdentity(scope, clip);
    const captureTimeMs = parseBlinkOffsetTimestamp(clip.capturedAt);
    if (!identity || captureTimeMs === null || options.consumedClipIdentities?.has(identity)) continue;
    const deltaMs = captureTimeMs - options.occurredAt;
    if (Math.abs(deltaMs) > options.toleranceMs) continue;
    if (collisions.has(clip.clipId)) return { status: 'ambiguous', reason: 'conflicting-clip-identity' };
    candidates.set(identity, { clip, captureTimeMs, deltaMs });
  }
  const ordered = [...candidates].sort((a, b) => Math.abs(a[1].deltaMs) - Math.abs(b[1].deltaMs));
  if (!ordered.length) return { status: 'missing' };
  if (ordered[1] && Math.abs(ordered[0][1].deltaMs) === Math.abs(ordered[1][1].deltaMs)) return { status: 'ambiguous', reason: 'equidistant-clips' };
  const [identity, selected] = ordered[0];
  return {
    status: 'matched', clip: { ...selected.clip }, manifestId: catalog.manifestId,
    identity, captureTimeMs: selected.captureTimeMs, deltaMs: selected.deltaMs,
  };
}
