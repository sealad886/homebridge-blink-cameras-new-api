import { SettingsConstraintError } from './settings-inventory';

export type EarlyNotificationMode = 'on' | 'off' | 'unmanaged';
export const EARLY_NOTIFICATION_MODES: readonly EarlyNotificationMode[] = ['on', 'off', 'unmanaged'];

export function isEarlyNotificationMode(value: unknown): value is EarlyNotificationMode {
  return EARLY_NOTIFICATION_MODES.includes(value as EarlyNotificationMode);
}

/** Runtime/settings accept only persisted canonical values; conversion belongs to installation. */
export function assertCanonicalEarlyNotificationConfig(input: unknown): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SettingsConstraintError('', 'Invalid Blink configuration.');
  const check = (value: Record<string, unknown>, path: string): void => {
    if (Object.hasOwn(value, 'disableEarlyNotification')) {
      throw new SettingsConstraintError(`${path}/disableEarlyNotification`,
        'Run scripts/migrate-native-recording-config.cjs with the explicit config path and --apply before starting.');
    }
    if (value.earlyNotificationMode !== undefined && !isEarlyNotificationMode(value.earlyNotificationMode)) {
      throw new SettingsConstraintError(`${path}/earlyNotificationMode`, 'Early Notification must be on, off, or unmanaged.');
    }
  };
  const config = input as Record<string, unknown>;
  check(config, '');
  for (const key of ['deviceSettingOverrides', 'syncModuleSettingOverrides']) {
    if (config[key] === undefined) continue;
    if (!Array.isArray(config[key])) throw new SettingsConstraintError(`/${key}`, 'Settings overrides must be a list.');
    (config[key] as unknown[]).forEach((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new SettingsConstraintError(`/${key}/${index}`, 'Invalid settings override.');
      check(row as Record<string, unknown>, `/${key}/${index}`);
    });
  }
}

/** Pure, idempotent migration of one Blink platform. Unknown fields and explicit choices are retained. */
export function migrateEarlyNotificationConfig(input: unknown): { config: Record<string, unknown>; changed: boolean } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SettingsConstraintError('', 'Invalid Blink configuration.');
  let changed = false;
  const migrate = (value: Record<string, unknown>, path: string): Record<string, unknown> => {
    if (value.earlyNotificationMode !== undefined && !isEarlyNotificationMode(value.earlyNotificationMode)) {
      throw new SettingsConstraintError(`${path}/earlyNotificationMode`, 'Early Notification must be on, off, or unmanaged.');
    }
    if (!Object.hasOwn(value, 'disableEarlyNotification')) return value;
    if (typeof value.disableEarlyNotification !== 'boolean') {
      throw new SettingsConstraintError(`${path}/disableEarlyNotification`, 'Legacy Early Notification choice must be a boolean.');
    }
    const next: Record<string, unknown> = { ...value, earlyNotificationMode: value.earlyNotificationMode ?? (value.disableEarlyNotification ? 'off' : 'unmanaged') };
    delete next.disableEarlyNotification;
    changed = true;
    return next;
  };
  const original = input as Record<string, unknown>;
  const config = { ...migrate(original, '') };
  for (const key of ['deviceSettingOverrides', 'syncModuleSettingOverrides']) {
    if (config[key] === undefined) continue;
    if (!Array.isArray(config[key])) throw new SettingsConstraintError(`/${key}`, 'Settings overrides must be a list.');
    config[key] = (config[key] as unknown[]).map((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new SettingsConstraintError(`/${key}/${index}`, 'Invalid settings override.');
      return migrate(row as Record<string, unknown>, `/${key}/${index}`);
    });
  }
  return { config: changed ? config : original, changed };
}
