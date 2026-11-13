import Ajv, { type ErrorObject } from 'ajv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveNativeRecordingConfig, validateSyncModuleSettingOverrides } from '../native-recording-config';
import { migrateEarlyNotificationConfig } from '../early-notification-config';
import { deriveFeedCapacity, matchesCameraIdentifier, SettingsConstraintError,
  validateModuleFeedLimits, type FeedCapacity, type SettingsInventory } from '../settings-inventory';

interface FieldMessage { path: string; code: string; message: string }
export interface SettingsValidationResult {
  revision: number;
  valid: boolean;
  errors: FieldMessage[];
  warnings: FieldMessage[];
  capacity?: FeedCapacity;
}

// Homebridge adds presentation keywords to a standard inner JSON schema. Ignore
// only unknown keywords; all type, enum, required and numeric constraints remain.
// eslint-disable-next-line no-undef -- published as CommonJS from dist/homebridge-ui.
const schema = JSON.parse(readFileSync(resolve(__dirname, '../../config.schema.json'), 'utf8')).schema;
const validateSchema = new Ajv({ strict: false, allErrors: true, useDefaults: false, coerceTypes: false, removeAdditional: false }).compile(schema);

function schemaError(error: ErrorObject): FieldMessage {
  const missing = error.keyword === 'required' && typeof error.params.missingProperty === 'string'
    ? `/${error.params.missingProperty.replace(/~/g, '~0').replace(/\//g, '~1')}` : '';
  return { path: error.instancePath + missing, code: error.keyword, message: error.message ?? 'Invalid setting.' };
}

/** Pure full-draft validation against the canonical schema and a server-owned snapshot. */
export class SettingsValidator {
  constructor(private readonly getInventory: () => SettingsInventory | undefined) {}

  validate(payload: unknown): SettingsValidationResult {
    const request = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
    const revision = typeof request.revision === 'number' && Number.isSafeInteger(request.revision) && request.revision >= 0 ? request.revision : 0;
    const result: SettingsValidationResult = { revision, valid: false, errors: [], warnings: [] };
    if (request.revision !== revision || !request.config || typeof request.config !== 'object' || Array.isArray(request.config)) {
      result.errors.push({ path: '', code: 'request', message: 'Invalid settings validation request.' }); return result;
    }
    const config = request.config as Record<string, unknown>;
    try {
      const migration = migrateEarlyNotificationConfig(config);
      if (migration.changed) result.errors.push({ path: '', code: 'migration_required', message: 'Migrate the saved Early Notification choices before saving.' });
    } catch (error) {
      result.errors.push({ path: error instanceof SettingsConstraintError ? error.path : '', code: 'early_notification',
        message: 'Use on, off, or unmanaged for Early Notification; legacy choices must be booleans.' });
    }
    if (!validateSchema(config)) result.errors.push(...(validateSchema.errors ?? []).map(schemaError));
    const nativeRetired = ['enableMotionPolling', 'hksvCameras', 'hksvSource', 'syncModuleRecording'];
    for (const key of nativeRetired) if (Object.hasOwn(config, key)) {
      result.errors.push({ path: `/${key}`, code: 'retired',
        message: 'Run scripts/migrate-native-recording-config.cjs with the explicit config path to preview, then repeat with --apply.' });
    }
    if (!result.errors.some(error => error.path.startsWith('/nativeRecording'))) {
      try { resolveNativeRecordingConfig(config.nativeRecording as Parameters<typeof resolveNativeRecordingConfig>[0]); }
      catch (error) {
        const field = error instanceof Error ? /nativeRecording\.([A-Za-z]+)/.exec(error.message)?.[1] : undefined;
        result.errors.push({ path: `/nativeRecording${field ? `/${field}` : ''}`, code: 'native_recording',
          message: 'Use valid native recording limits; maximum job age must cover the initial delay.' });
      }
    }
    const retired = ['ffmpegPath', 'ffmpegDebug', 'rtpSsrcMode', 'rtspTransport', 'videoEncoder', 'twoWayAudio', 'verifyImmisTls'];
    for (const key of retired) if (Object.hasOwn(config, key)) {
      result.errors.push({ path: `/${key}`, code: 'retired', message: 'Run scripts/migrate-secure-media-config.cjs with the explicit full config path; it backs up locally before replacement.' });
    }
    if (Boolean(typeof config.username === 'string' && config.username.trim()) !== Boolean(typeof config.password === 'string' && config.password.trim())) {
      result.errors.push({ path: '/username', code: 'credentials', message: 'Username and password must be provided together.' });
    }
    const inventory = this.getInventory();
    try {
      const limits = validateModuleFeedLimits(config.syncModuleFeedLimits);
      if (inventory) {
        result.capacity = deriveFeedCapacity(inventory, config);
        if (request.inventoryRevision !== undefined && request.inventoryRevision !== inventory.revision) {
          result.warnings.push({ path: '', code: 'inventory_changed', message: 'Camera discovery has changed. Review the current camera list.' });
        }
      } else if (limits.length) {
        result.errors.push({ path: '/syncModuleFeedLimits', code: 'inventory_unavailable', message: 'Refresh camera discovery before saving Sync Module feed limits.' });
      }
    } catch (error) {
      result.errors.push({ path: error instanceof SettingsConstraintError ? error.path : '/syncModuleFeedLimits',
        code: 'feed_limit', message: error instanceof SettingsConstraintError ? error.message : 'Invalid camera feed limits.' });
    }
    if (!result.errors.some(error => error.path.startsWith('/syncModuleSettingOverrides'))) {
      try {
        validateSyncModuleSettingOverrides(config.syncModuleSettingOverrides).forEach((row, index) => {
          if (!inventory?.syncModules.some(module => module.id === row.syncModuleId)) {
            result.warnings.push({ path: `/syncModuleSettingOverrides/${index}/syncModuleId`, code: 'unresolved_selector',
              message: !inventory ? 'Discovery is unavailable; this saved Sync Module setting is preserved.'
                : 'This saved Sync Module setting is not in current discovery and is preserved.' });
          }
        });
      } catch (error) {
        result.errors.push({ path: error instanceof SettingsConstraintError ? error.path : '/syncModuleSettingOverrides',
          code: 'sync_module_setting', message: error instanceof SettingsConstraintError ? error.message : 'Invalid Sync Module settings.' });
      }
    }
    for (const key of ['excludeDevices'] as const) {
      const entries = config[key];
      if (!Array.isArray(entries)) continue;
      entries.forEach((entry, index) => {
        if (typeof entry !== 'string' || !entry.trim()) return;
        const matches = inventory?.cameras.filter(camera => matchesCameraIdentifier(camera, entry));
        if (!matches || matches.length !== 1) result.warnings.push({ path: `/${key}/${index}`,
          code: matches && matches.length > 1 ? 'ambiguous_selector' : 'unresolved_selector',
          message: !inventory ? 'Discovery is unavailable; this saved selection is preserved.'
            : matches && matches.length > 1 ? 'This saved selector matches multiple cameras. Choose a specific camera.'
              : 'This saved selection is not in current discovery and is preserved.' });
      });
    }
    if (Array.isArray(config.deviceSettingOverrides)) {
      config.deviceSettingOverrides.forEach((value, index) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return;
        const row = value as Record<string, unknown>;
        if (typeof row.deviceIdentifier !== 'string' || !row.deviceIdentifier.trim()) return;
        const matches = inventory?.cameras.filter(camera => matchesCameraIdentifier(camera, row.deviceIdentifier as string));
        if (!matches || matches.length !== 1) result.warnings.push({ path: `/deviceSettingOverrides/${index}/deviceIdentifier`,
          code: matches && matches.length > 1 ? 'ambiguous_selector' : 'unresolved_selector',
          message: !inventory ? 'Discovery is unavailable; this saved camera setting is preserved.'
            : matches && matches.length > 1 ? 'This saved setting matches multiple cameras. Choose a specific camera.'
              : 'This saved camera setting is not in current discovery and is preserved.' });
        else if (row.homeKitSecureVideo === true && matches[0].moduleAssociation.state !== 'unique') {
          result.warnings.push({ path: `/deviceSettingOverrides/${index}/homeKitSecureVideo`, code: 'storage_association',
            message: 'Automatic native recording needs one unambiguous Sync Module association for this camera.' });
        }
      });
    }
    result.valid = result.errors.length === 0;
    return result;
  }
}
