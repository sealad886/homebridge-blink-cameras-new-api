import Ajv, { type ErrorObject } from 'ajv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    if (!validateSchema(config)) result.errors.push(...(validateSchema.errors ?? []).map(schemaError));
    if (Array.isArray(config.hksvCameras)) {
      config.hksvCameras.forEach((entry, index) => {
        if (typeof entry === 'string' && !entry.trim()) result.errors.push({ path: `/hksvCameras/${index}`, code: 'selector', message: 'Choose a camera or remove the empty entry.' });
      });
    }
    const retired = ['ffmpegPath', 'ffmpegDebug', 'rtpSsrcMode', 'rtspTransport', 'videoEncoder', 'twoWayAudio', 'verifyImmisTls'];
    for (const key of retired) if (Object.hasOwn(config, key)) {
      result.errors.push({ path: `/${key}`, code: 'retired', message: 'This retired setting requires the secure-media configuration migration.' });
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
    for (const key of ['hksvCameras', 'excludeDevices'] as const) {
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
    result.valid = result.errors.length === 0;
    return result;
  }
}
