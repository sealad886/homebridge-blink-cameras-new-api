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

/** Aggregate first-exclusion counts for a catalog with no eligible clip. */
export interface NativeClipEligibility {
  rows: number;
  wrongNetwork: number;
  otherName: number;
  invalidMetadata: number;
  outsideWindow: number;
  consumed: number;
}

export type NativeClipMatchResult = {
  status: 'matched';
  clip: NativeStorageClip;
  manifestId: number;
  identity: string;
  captureTimeMs: number;
  deltaMs: number;
} | { status: 'missing'; eligibility: NativeClipEligibility }
  | { status: 'ambiguous'; reason: 'duplicate-device-name' | 'conflicting-clip-identity' | 'equidistant-clips' }
  | { status: 'invalid'; reason: 'scope-mismatch' | 'unknown-camera' | 'invalid-input' };

const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;
const validScope = (scope: NativeClipCatalogScope): boolean => !!scope && positiveId(scope.accountId) && positiveId(scope.networkId)
  && positiveId(scope.syncModuleId) && text(scope.moduleId);
const sameScope = (scope: NativeClipCatalogScope, device: NativeMotionDevice): boolean => device.accountId === scope.accountId
  && device.networkId === scope.networkId && device.syncModuleId === scope.syncModuleId && device.moduleId === scope.moduleId;
const deviceIdentity = (device: NativeMotionDevice): string => JSON.stringify([device.providerId, device.target]);
// Observed USB catalog names retain only ASCII alphanumerics from the full provider name.
const catalogNames = (name: string): string[] => [name, name.replace(/[^a-zA-Z0-9]/g, '')].filter(Boolean);

/** Stable across catalog refreshes and equivalent timestamp-offset spellings. */
export function nativeClipIdentity(scope: NativeClipCatalogScope, clip: NativeStorageClip): string | null {
  if (!clip || typeof clip !== 'object') return null;
  const capturedAt = parseBlinkOffsetTimestamp(clip.capturedAt);
  if (!validScope(scope) || !positiveId(clip.clipId) || clip.networkId !== scope.networkId || !text(clip.deviceName) || capturedAt === null) return null;
  return JSON.stringify([scope.accountId, scope.networkId, scope.syncModuleId, clip.clipId, clip.deviceName, capturedAt]);
}

/**
 * Matches exact raw or compacted authoritative names only. URLs remain opaque,
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
  const names = new Set(catalogNames(camera.nativeName));
  const sameName = new Set(devices.filter(device => catalogNames(device.nativeName).some(name => names.has(name))).map(deviceIdentity));
  if (sameName.size > 1) return { status: 'ambiguous', reason: 'duplicate-device-name' };
  const eligibility: NativeClipEligibility = { rows: catalog.clips.length, wrongNetwork: 0, otherName: 0,
    invalidMetadata: 0, outsideWindow: 0, consumed: 0 };
  if (!eligibility.rows) return { status: 'missing', eligibility };
  const manifestId = catalog.manifestId;
  if (!positiveId(manifestId)) return { status: 'invalid', reason: 'invalid-input' };

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
    if (!clip || typeof clip.deviceName !== 'string') { eligibility.invalidMetadata++; continue; }
    if (clip.networkId !== scope.networkId) { eligibility.wrongNetwork++; continue; }
    if (!names.has(clip.deviceName)) { eligibility.otherName++; continue; }
    const identity = nativeClipIdentity(scope, clip);
    const captureTimeMs = parseBlinkOffsetTimestamp(clip.capturedAt);
    if (!identity || captureTimeMs === null || typeof clip.mediaUrl !== 'string' || !clip.mediaUrl.length || clip.mediaUrl.length > 8_192) {
      eligibility.invalidMetadata++; continue;
    }
    const deltaMs = captureTimeMs - options.occurredAt;
    if (Math.abs(deltaMs) > options.toleranceMs) { eligibility.outsideWindow++; continue; }
    if (options.consumedClipIdentities?.has(identity)) { eligibility.consumed++; continue; }
    if (collisions.has(clip.clipId)) return { status: 'ambiguous', reason: 'conflicting-clip-identity' };
    candidates.set(identity, { clip, captureTimeMs, deltaMs });
  }
  const ordered = [...candidates].sort((a, b) => Math.abs(a[1].deltaMs) - Math.abs(b[1].deltaMs));
  if (!ordered.length) return { status: 'missing', eligibility };
  if (ordered[1] && Math.abs(ordered[0][1].deltaMs) === Math.abs(ordered[1][1].deltaMs)) return { status: 'ambiguous', reason: 'equidistant-clips' };
  const [identity, selected] = ordered[0];
  return {
    status: 'matched', clip: { ...selected.clip }, manifestId,
    identity, captureTimeMs: selected.captureTimeMs, deltaMs: selected.deltaMs,
  };
}
