import { isEarlyNotificationMode, type EarlyNotificationMode } from './early-notification-config';
import { matchesDeviceIdentifier, SettingsConstraintError, type SettingsCamera } from './settings-inventory';

export interface NativeRecordingConfigInput {
  initialDelaySeconds?: number;
  retryIntervalSeconds?: number;
  maxRetries?: number;
  matchToleranceSeconds?: number;
  catalogRefreshSeconds?: number;
  maxQueuedJobs?: number;
  maxJobAgeSeconds?: number;
  maxCachedBytes?: number;
}

export interface NativeRecordingConfig {
  initialDelayMs: number;
  retryIntervalMs: number;
  maxRetries: number;
  matchToleranceMs: number;
  catalogRefreshMs: number;
  maxQueuedJobs: number;
  maxJobAgeMs: number;
  maxCachedBytes: number;
}

export interface NativeRecordingDeviceOverride {
  deviceIdentifier: string;
  exposeMotionDetected?: boolean;
  homeKitSecureVideo?: boolean;
  earlyNotificationMode?: EarlyNotificationMode;
}
export interface NativeRecordingSyncModuleOverride {
  syncModuleId: string;
  earlyNotificationMode?: EarlyNotificationMode;
}
export interface NativeRecordingPolicyConfig {
  exposeMotionDetected?: boolean;
  earlyNotificationMode?: EarlyNotificationMode;
  deviceSettingOverrides?: readonly NativeRecordingDeviceOverride[];
  syncModuleSettingOverrides?: readonly NativeRecordingSyncModuleOverride[];
}
export interface NativeRecordingDevicePolicy {
  exposeMotionDetected: boolean;
  homeKitSecureVideo: boolean;
  earlyNotificationMode: EarlyNotificationMode;
}

export const NATIVE_RECORDING_CONFIG_FIELDS = Object.freeze({
  initialDelaySeconds: { default: 60, minimum: 0, maximum: 3_600 },
  retryIntervalSeconds: { default: 5, minimum: 1, maximum: 300 },
  maxRetries: { default: 10, minimum: 0, maximum: 100 },
  matchToleranceSeconds: { default: 15, minimum: 0, maximum: 300 },
  catalogRefreshSeconds: { default: 60, minimum: 60, maximum: 3_600 },
  maxQueuedJobs: { default: 128, minimum: 1, maximum: 1_024 },
  maxJobAgeSeconds: { default: 900, minimum: 1, maximum: 86_400 },
  maxCachedBytes: { default: 128 * 1024 * 1024, minimum: 32 * 1024 * 1024, maximum: 1024 * 1024 * 1024 },
});

const integer = (value: unknown, fallback: number, minimum: number, maximum: number, field: string): number => {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'number' || !Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new Error(`Invalid nativeRecording.${field}: expected an integer from ${minimum} to ${maximum}`);
  }
  return result;
};

export function resolveNativeRecordingConfig(input: NativeRecordingConfigInput | undefined): NativeRecordingConfig {
  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) throw new Error('Invalid nativeRecording configuration');
  const config = input ?? {};
  const number = (key: keyof NativeRecordingConfigInput): number => {
    const rule = NATIVE_RECORDING_CONFIG_FIELDS[key];
    return integer(config[key], rule.default, rule.minimum, rule.maximum, key);
  };
  const result: NativeRecordingConfig = {
    initialDelayMs: number('initialDelaySeconds') * 1000, retryIntervalMs: number('retryIntervalSeconds') * 1000,
    maxRetries: number('maxRetries'), matchToleranceMs: number('matchToleranceSeconds') * 1000,
    catalogRefreshMs: number('catalogRefreshSeconds') * 1000, maxQueuedJobs: number('maxQueuedJobs'),
    maxJobAgeMs: number('maxJobAgeSeconds') * 1000, maxCachedBytes: number('maxCachedBytes'),
  };
  if (result.maxJobAgeMs < result.initialDelayMs) throw new Error('nativeRecording.maxJobAgeSeconds must cover the initial delay');
  return result;
}

export function validateSyncModuleSettingOverrides(value: unknown): NativeRecordingSyncModuleOverride[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new SettingsConstraintError('/syncModuleSettingOverrides', 'Sync Module settings must be a list.');
  const seen = new Set<string>();
  return value.map((entry: unknown, index) => {
    const path = `/syncModuleSettingOverrides/${index}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new SettingsConstraintError(path, 'Invalid Sync Module setting.');
    const row = entry as Record<string, unknown>;
    if (typeof row.syncModuleId !== 'string' || !row.syncModuleId.trim()) throw new SettingsConstraintError(`${path}/syncModuleId`, 'Choose a Sync Module.');
    if (seen.has(row.syncModuleId)) throw new SettingsConstraintError(`${path}/syncModuleId`, 'A Sync Module can have only one settings row.');
    if (row.earlyNotificationMode !== undefined && !isEarlyNotificationMode(row.earlyNotificationMode)) {
      throw new SettingsConstraintError(`${path}/earlyNotificationMode`, 'Early Notification must be on, off, or unmanaged.');
    }
    seen.add(row.syncModuleId);
    return { syncModuleId: row.syncModuleId,
      ...(row.earlyNotificationMode === undefined ? {} : { earlyNotificationMode: row.earlyNotificationMode }) };
  });
}

/** More-specific explicit choices win; only a unique discovered module can supply inheritance. */
export function nativeRecordingDevicePolicy(config: NativeRecordingPolicyConfig | undefined,
  device: { id: number; name?: string; serial?: string; kind?: 'camera' | 'owl' | 'doorbell';
    moduleAssociation?: SettingsCamera['moduleAssociation'] }): NativeRecordingDevicePolicy {
  const { deviceSettingOverrides: overrides, exposeMotionDetected = true, earlyNotificationMode = 'unmanaged' } = config ?? {};
  if (typeof exposeMotionDetected !== 'boolean') throw new Error('Invalid exposeMotionDetected');
  if (!isEarlyNotificationMode(earlyNotificationMode)) throw new Error('Invalid earlyNotificationMode');
  if (overrides !== undefined && !Array.isArray(overrides)) throw new Error('Invalid per-camera settings list');
  for (const row of overrides ?? []) {
    if (!row || typeof row.deviceIdentifier !== 'string' || !row.deviceIdentifier.trim()) throw new Error('Invalid per-camera deviceIdentifier');
    for (const key of ['exposeMotionDetected', 'homeKitSecureVideo'] as const) {
      if (row[key] !== undefined && typeof row[key] !== 'boolean') throw new Error(`Invalid per-camera ${key}`);
    }
  }
  for (const row of overrides ?? []) if (row.earlyNotificationMode !== undefined && !isEarlyNotificationMode(row.earlyNotificationMode)) throw new Error('Invalid per-camera earlyNotificationMode');
  const modules = validateSyncModuleSettingOverrides(config?.syncModuleSettingOverrides);
  const association = device.moduleAssociation;
  const module = association?.state === 'unique' && association.candidateIds.length === 1
    ? modules.find(entry => entry.syncModuleId === association.candidateIds[0]) : undefined;
  const row = overrides?.find(entry => matchesDeviceIdentifier(device, entry.deviceIdentifier, device.kind));
  return { exposeMotionDetected: row?.exposeMotionDetected ?? exposeMotionDetected, homeKitSecureVideo: row?.homeKitSecureVideo ?? false,
    earlyNotificationMode: row?.earlyNotificationMode ?? module?.earlyNotificationMode ?? earlyNotificationMode };
}
