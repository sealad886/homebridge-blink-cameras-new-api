import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { NATIVE_RECORDING_CONFIG_FIELDS, resolveNativeRecordingConfig } from '../src/native-recording-config';

const document = JSON.parse(readFileSync('config.schema.json', 'utf8'));
const validate = new Ajv({ strict: false, useDefaults: true }).compile(document.schema);

it('defaults motion sensors on and per-camera HSV off while preserving global motion inheritance', () => {
  const config = { name: 'Blink', exposeMotionDetected: false,
    deviceSettingOverrides: [{ deviceIdentifier: 'camera:12' }] };
  expect(validate(config)).toBe(true);
  expect(config).toMatchObject({ exposeMotionDetected: false, deviceSettingOverrides: [{ homeKitSecureVideo: false }] });
  expect(config.deviceSettingOverrides[0]).not.toHaveProperty('exposeMotionDetected');
  const defaults = { name: 'Blink' }; expect(validate(defaults)).toBe(true);
  expect(defaults).toHaveProperty('exposeMotionDetected', true);
});

it('validates explicit per-camera choices and rejects invalid motion/HSV values', () => {
  expect(validate({ name: 'Blink', deviceSettingOverrides: [{ deviceIdentifier: 'Entry',
    exposeMotionDetected: false, homeKitSecureVideo: true }] })).toBe(true);
  for (const invalid of [{ exposeMotionDetected: 'true' },
    { deviceSettingOverrides: [{ deviceIdentifier: 'Entry', homeKitSecureVideo: 'true' }] },
    { deviceSettingOverrides: [{ deviceIdentifier: 'Entry', exposeMotionDetected: 'false' }] },
    { deviceSettingOverrides: [{ deviceIdentifier: ' ' }] }]) {
    expect(validate({ name: 'Blink', ...invalid })).toBe(false);
  }
});

it.each(Object.entries(NATIVE_RECORDING_CONFIG_FIELDS))('keeps %s defaults and range consistent with runtime validation', (key, rule) => {
  const defaults: Record<string, unknown> = { name: 'Blink', nativeRecording: {} };
  expect(validate(defaults)).toBe(true);
  expect(defaults.nativeRecording).toMatchObject({ [key]: rule.default });
  for (const accepted of [rule.minimum, rule.maximum]) {
    const input = { initialDelaySeconds: 0, maxJobAgeSeconds: 86400, [key]: accepted };
    expect(validate({ name: 'Blink', nativeRecording: input })).toBe(true);
    expect(() => resolveNativeRecordingConfig(input)).not.toThrow();
  }
  for (const rejected of [rule.minimum - 1, rule.maximum + 1, rule.default + 0.5, 'invalid']) {
    expect(validate({ name: 'Blink', nativeRecording: { [key]: rejected } })).toBe(false);
    expect(() => resolveNativeRecordingConfig({ [key]: rejected } as never)).toThrow();
  }
});
