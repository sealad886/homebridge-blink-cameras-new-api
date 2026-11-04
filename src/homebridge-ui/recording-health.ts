import { Buffer } from 'node:buffer';
import { constants, promises as fs } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import Ajv from 'ajv';
import { RECORDING_ACTIVITY_REASONS, RECORDING_JOB_STATES, RECORDING_READINESS_STAGES, type RecordingReadinessReport } from '../recording-readiness';
import { RECORDING_STORAGE_DIRECTORY } from '../settings';

/** This local route reads one bounded report; it never reads the job ledger or queries Blink. */
export interface RecordingHealthResult {
  state: 'available' | 'stale' | 'missing' | 'unavailable' | 'unsupported';
  reason?: 'restart-required'; checkedAt: string; health?: RecordingReadinessReport;
}
const MAX_BYTES = 1024 * 1024, STALE_MS = 10 * 60 * 1000;
const count = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const time = { type: 'string', format: 'iso-date' };
const identity = { id: { type: 'string', pattern: '^[a-f0-9]{16}$' },
  label: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[^\\p{Cc}]+$' } };
const reason = { enum: RECORDING_ACTIVITY_REASONS };
const baseline = { enum: ['pending', 'complete', 'not-applicable'] };
const jobTimes = Object.fromEntries(['capturedAt', 'discoveredAt', 'downloadedAt', 'preparedAt', 'offeredAt', 'acknowledgedAt', 'expiredAt'].map(key => [key, time]));
const object = (required: string[], properties: Record<string, unknown>) => ({ type: 'object', required, properties, additionalProperties: false });
const home = object(['configuration', 'recordingActive', 'cameraActive', 'audioActive', 'triggerTypes', 'effectiveAudioActive'], {
  configuration: { enum: ['unknown', 'not-configured', 'configured', 'invalid'] },
  ...Object.fromEntries(['recordingActive', 'cameraActive', 'audioActive'].map(key => [key, { type: ['boolean', 'null'] }])),
  triggerTypes: { anyOf: [{ type: 'null' }, { type: 'array', maxItems: 2, uniqueItems: true, items: { enum: [1, 2] } }] },
  effectiveAudioActive: { type: 'boolean' },
});
const job = object(['id', 'state', 'capturedAt', 'discoveredAt'], { id: identity.id, state: { enum: RECORDING_JOB_STATES }, ...jobTimes, reason });
const camera = object(['id', 'label', 'selection', 'source', 'available', 'home', 'baseline', 'stage', 'canTriggerFreshTest',
  'nativeStorage', 'retainedInHomeKit', 'queued', 'delivered', 'uncertain'], {
  ...identity, selection: { enum: ['available', 'excluded', 'unresolved', 'ambiguous', 'unavailable'] }, source: { enum: ['saved-clips', 'continuous'] },
  available: { type: 'boolean' }, availabilityReason: { enum: ['module-unavailable', 'camera-name-ambiguous', 'camera-unavailable',
    'inventory-unavailable', 'camera-excluded', 'camera-unresolved', 'camera-selector-ambiguous'] },
  module: object(['id', 'label'], identity), home, baseline, baselineCompletedAt: time,
  stage: { enum: RECORDING_READINESS_STAGES }, reason, canTriggerFreshTest: { type: 'boolean' },
  nativeStorage: { enum: ['unverified', 'native-clip-observed'] }, nativeStorageObservedAt: time,
  retainedInHomeKit: { const: 'unconfirmed' }, queued: count, delivered: count, uncertain: count,
  lastNativeClipAt: time, lastExpiredAt: time, lastExpiredReason: { const: 'expired' }, job,
  continuousState: { enum: ['off', 'warming', 'ready', 'recording', 'fault'] },
});
const validate = new Ajv({ strict: false, allErrors: false, removeAdditional: 'all' })
  .addFormat('iso-date', value => typeof value === 'string' && value.length === 24 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value)
  .compile<RecordingReadinessReport>(object(['version', 'settingsRevision', 'updatedAt', 'runtime', 'inventory', 'retainedInHomeKit',
    'queue', 'active', 'mediaBytes', 'reservedBytes', 'preparationLimit', 'modules', 'cameras'], {
    version: { const: 2 }, settingsRevision: { type: 'string', pattern: '^[a-f0-9]{24}$' }, updatedAt: time,
    runtime: { enum: ['starting', 'running', 'unavailable', 'stopped'] }, inventory: { enum: ['available', 'unknown'] },
    retainedInHomeKit: { const: 'unconfirmed' }, queue: count, active: count, mediaBytes: count, reservedBytes: count,
    preparationLimit: { type: 'integer', minimum: 1, maximum: 2 },
    modules: { type: 'array', maxItems: 8192, items: object(['id', 'label', 'baseline'], { ...identity, baseline, lastCatalogAt: time, reason }) },
    cameras: { type: 'array', maxItems: 8192, items: camera },
  }));
class UnsupportedReport extends Error {}

/** Failure is report availability/restart guidance, never a configuration validation error. */
export async function readRecordingHealth(storageRoot: string, now = Date.now()): Promise<RecordingHealthResult> {
  const checkedAt = new Date(now).toISOString();
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    const file = join(storageRoot, RECORDING_STORAGE_DIRECTORY, 'native-clips', 'health.json');
    handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES || (typeof process.getuid === 'function' && stat.uid !== process.getuid())
      || (process.platform !== 'win32' && (stat.mode & 0o777) !== 0o600)) throw new Error('Invalid report file');
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    for (;;) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
      length += bytesRead;
      if (length > MAX_BYTES) throw new Error('Activity report too large');
      if (!bytesRead) break;
    }
    let health: unknown;
    try { health = JSON.parse(bytes.subarray(0, length).toString('utf8')); } catch { throw new UnsupportedReport(); }
    if (!validate(health)) throw new UnsupportedReport();
    const age = now - Date.parse(health.updatedAt);
    return { state: age > STALE_MS || age < -60000 ? 'stale' : 'available', checkedAt, health };
  } catch (error) {
    return { state: error instanceof UnsupportedReport ? 'unsupported' : (error as { code?: string }).code === 'ENOENT' ? 'missing' : 'unavailable',
      ...(error instanceof UnsupportedReport ? { reason: 'restart-required' as const } : {}), checkedAt };
  } finally { await handle?.close().catch(() => undefined); }
}
