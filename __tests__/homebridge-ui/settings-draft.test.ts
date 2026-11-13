import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import Ajv from 'ajv';
import { migrateEarlyNotificationConfig } from '../../src/early-notification-config';
import { SettingsValidator } from '../../src/homebridge-ui/settings-validation';

function load() {
  const context = { module: { exports: {} }, structuredClone, setTimeout, clearTimeout };
  runInNewContext(readFileSync(join(__dirname, '../../src/homebridge-ui/public/settings-state.js'), 'utf8'), context);
  return context.module.exports as any;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const valid = (revision: number) => ({ revision, valid: true, errors: [], warnings: [] });

it('stages canonical startup migration as an unsaved change while preserving original baseline and sibling blocks', async () => {
  const { Draft } = load();
  const original = [{ platform: 'Other', keep: true }, { platform: 'BlinkCameras', disableEarlyNotification: true, extension: { keep: 1 } }];
  const migrated = migrateEarlyNotificationConfig(original[1]);
  const host = { validate: jest.fn(async ({ revision }: any) => valid(revision)), stage: jest.fn(), saveEnabled: jest.fn(), changed: jest.fn() };
  const draft = new Draft(original, host, migrated.config);
  draft.retry(); await draft.flush();
  expect(draft.state.dirty).toBe(true);
  expect(JSON.parse(draft.baseline)).toEqual(original);
  expect(draft.blocks[0]).toEqual(original[0]);
  expect(draft.config).toEqual({ platform: 'BlinkCameras', earlyNotificationMode: 'off', extension: { keep: 1 } });
  expect(host.stage).toHaveBeenCalledWith([original[0], draft.config]);
  expect(original[1]).toHaveProperty('disableEarlyNotification', true);
});

it('allows migration-only auth recovery without discovery while blocking pending validation, user edits and overlapping actions', async () => {
  const { Draft } = load();
  const original = [{ platform: 'BlinkCameras', name: 'Blink', disableEarlyNotification: true,
    syncModuleFeedLimits: [{ syncModuleId: '20', maxFeeds: 1 }] }];
  const validator = new SettingsValidator(() => undefined);
  const host = { validate: jest.fn(async (payload: unknown) => validator.validate(payload)),
    stage: jest.fn(), saveEnabled: jest.fn(), changed: jest.fn() };
  const draft = new Draft(original, host, migrateEarlyNotificationConfig(original[0]).config);
  draft.retry();
  expect(draft.beginAccountAction()).toBeNull();
  await draft.flush();
  expect(draft.state).toMatchObject({ dirty: true, pending: false,
    errors: [expect.objectContaining({ code: 'inventory_unavailable' })] });
  expect(host.stage).not.toHaveBeenCalled();
  expect(host.saveEnabled).not.toHaveBeenCalledWith(true);
  expect(draft.hasUserChanges()).toBe(false);
  expect(draft.canRunAccountAction()).toBe(true);
  draft.set('name', 'User edit'); await draft.flush();
  expect(draft.beginAccountAction()).toBeNull();
  expect(() => draft.replaceBaseline(original)).toThrow('Save or discard');
  draft.set('name', 'Blink'); await draft.flush();
  const action = draft.beginAccountAction();
  expect(action.blocks).toEqual(draft.blocks);
  expect(draft.beginAccountAction()).toBeNull();
  expect(draft.set('name', 'Blocked edit')).toBe(false);
  expect(draft.config.name).toBe('Blink');
  action.finish(); await draft.flush();
  expect(draft.canRunAccountAction()).toBe(true);
});

it('preserves the final raw edit, unknown fields and other blocks, gating Save until staging acknowledges', async () => {
  const { Draft } = load();
  let finishStage: (() => void) | undefined;
  const host = { validate: jest.fn(async ({ revision }: any) => valid(revision)),
    stage: jest.fn(() => new Promise<void>(resolve => { finishStage = resolve; })), saveEnabled: jest.fn(), changed: jest.fn() };
  const original = [{ platform: 'Other', keep: true }, { platform: 'BlinkCameras', name: 'Blink', privateExtension: { keep: 1 }, _bridge: { username: 'synthetic' } }];
  const draft = new Draft(original, host);
  draft.set('name', 'Last keystroke');
  expect(draft.config.name).toBe('Last keystroke');
  expect(host.saveEnabled).toHaveBeenLastCalledWith(false);
  await tick();
  expect(host.stage).toHaveBeenLastCalledWith([{ platform: 'Other', keep: true }, expect.objectContaining({ name: 'Last keystroke', privateExtension: { keep: 1 }, _bridge: original[1]._bridge })]);
  expect(host.saveEnabled).not.toHaveBeenCalledWith(true);
  finishStage!(); await draft.flush();
  expect(host.saveEnabled).toHaveBeenLastCalledWith(true);
  expect(original[1].name).toBe('Blink');
  expect(draft.canRunAccountAction()).toBe(false);
});

it('ignores stale validation and never enables Save from an old staging acknowledgement', async () => {
  const { Draft } = load();
  const replies: Array<(value: any) => void> = [];
  const stages: Array<() => void> = [];
  const host = { validate: jest.fn(() => new Promise(resolve => replies.push(resolve))),
    stage: jest.fn(() => new Promise<void>(resolve => stages.push(resolve))), saveEnabled: jest.fn(), changed: jest.fn() };
  const draft = new Draft([{ platform: 'BlinkCameras', name: 'Blink' }], host);
  draft.set('name', 'First'); await tick();
  draft.set('name', 'Second'); replies.shift()!(valid(1)); await tick();
  expect(host.stage).not.toHaveBeenCalled();
  replies.shift()!(valid(2)); await tick();
  draft.set('name', 'Final'); stages.shift()!(); await tick();
  expect(host.saveEnabled).not.toHaveBeenCalledWith(true);
  replies.shift()!(valid(3)); await tick(); stages.shift()!(); await draft.flush();
  expect(host.stage).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'Final' })]);
  expect(host.saveEnabled).toHaveBeenLastCalledWith(true);
});

it('retains invalid raw values across reading/navigation and recovers from validation/staging failure', async () => {
  const { Draft } = load();
  const host = { validate: jest.fn(async ({ revision }: any) => ({ revision, valid: false, errors: [{ path: '/pollInterval', code: 'type', message: 'Enter an integer.' }] })),
    stage: jest.fn().mockRejectedValue(new Error('synthetic stage failure')), saveEnabled: jest.fn(), changed: jest.fn() };
  const draft = new Draft([{ platform: 'BlinkCameras', name: 'Blink' }], host);
  draft.set('pollInterval', '1e'); await draft.flush();
  expect(draft.config.pollInterval).toBe('1e'); expect(host.stage).not.toHaveBeenCalled();
  host.validate.mockImplementation(async ({ revision }: any) => valid(revision));
  draft.set('pollInterval', 120); await draft.flush();
  expect(host.saveEnabled).toHaveBeenLastCalledWith(false);
  expect(draft.state.error).toMatch(/stage|Homebridge/i);
  host.stage.mockResolvedValue(undefined); draft.retry(); await draft.flush();
  expect(host.saveEnabled).toHaveBeenLastCalledWith(true);
});

it('distinguishes kind collisions and preserves unavailable selectors while changing a discovered camera', () => {
  const { resolveSelector, toggleSelection } = load();
  const cameras = [{ key: 'camera:1', id: '1', kind: 'camera', name: 'Same' }, { key: 'owl:1', id: '1', kind: 'owl', name: 'Same' }];
  expect(resolveSelector('1', cameras)).toHaveLength(2);
  expect(resolveSelector('camera:1', cameras)).toEqual([cameras[0]]);
  expect(toggleSelection(['missing-camera'], cameras[1], true, cameras)).toEqual(['missing-camera', 'owl:1']);
  expect(toggleSelection(['missing-camera', 'owl:1'], cameras[1], false, cameras)).toEqual(['missing-camera']);
});

it('does not bind missing or malformed selectors to a sole camera without a serial', () => {
  const { resolveSelector, toggleSelection } = load();
  const camera = { key: 'camera:1', id: '1', kind: 'camera', name: 'Camera' };
  for (const selector of [undefined, null, '', '  ', false, 0, {}, []]) {
    expect(resolveSelector(selector, [camera])).toEqual([]);
  }
  expect(resolveSelector('camera:1', [camera])).toEqual([camera]);
  expect(resolveSelector('1', [camera])).toEqual([camera]);
  expect(resolveSelector('Camera', [camera])).toEqual([camera]);
  expect(resolveSelector('serial-1', [{ ...camera, serial: 'serial-1' }])).toEqual([{ ...camera, serial: 'serial-1' }]);
  expect(toggleSelection([undefined, 'missing-camera', 'camera:1'], camera, false, [camera])).toEqual([undefined, 'missing-camera']);
});

it('allows six recording cameras and enforces positive exact module limits through the canonical schema', () => {
  const schema = JSON.parse(readFileSync(join(__dirname, '../../config.schema.json'), 'utf8')).schema;
  const validate = new Ajv({ strict: false }).compile(schema);
  const config = { name: 'Blink', deviceSettingOverrides: Array.from({ length: 6 }, (_, n) => ({ deviceIdentifier: `camera:${n}`, homeKitSecureVideo: true })), syncModuleFeedLimits: [{ syncModuleId: '10', maxFeeds: 6 }] };
  expect(validate(config)).toBe(true);
  for (const maxFeeds of [0, -1, 1.5, '2']) expect(validate({ ...config, syncModuleFeedLimits: [{ syncModuleId: '10', maxFeeds }] })).toBe(false);
});

it('uses HTML patterns valid under the browser Unicode sets flag', () => {
  const html = readFileSync(join(__dirname, '../../src/homebridge-ui/public/index.html'), 'utf8');
  for (const [, pattern] of html.matchAll(/\bpattern="([^"]*)"/g)) expect(() => new RegExp(pattern, 'v')).not.toThrow();
});
