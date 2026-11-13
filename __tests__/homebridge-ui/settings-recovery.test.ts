import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { migrateEarlyNotificationConfig } from '../../src/early-notification-config';
import { SettingsConstraintError } from '../../src/settings-inventory';

const html = readFileSync(join(__dirname, '../../src/homebridge-ui/public/index.html'), 'utf8');
const section = (start: string, end: string) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
function fixture(config: Record<string, unknown>) {
  const nodes = new Map(['settingsRepair', 'settingsRepairField', 'settingsRepairGuidance'].map(id => [id, { hidden: true, textContent: '' }]));
  const blocks = [{ platform: 'Other', keep: 'unchanged' }, { platform: 'BlinkCameras', ...config, extension: { keep: true } }];
  const homebridge = {
    getPluginConfigSchema: jest.fn().mockResolvedValue({}), hideSchemaForm: jest.fn(), updatePluginConfig: jest.fn(), savePluginConfig: jest.fn(),
    request: jest.fn(async (_path, payload) => {
      try { return migrateEarlyNotificationConfig(payload.config); }
      catch (error) {
        if (!(error instanceof SettingsConstraintError)) throw error;
        throw { message: 'Saved Blink settings need repair.', error: { category: 'invalid_request', status: 400, path: error.path, message: error.message } };
      }
    }),
  };
  const context = {
    document: { getElementById: (id: string) => nodes.get(id) }, pluginConfig: blocks, homebridge,
    window: { BlinkSettings: { deadline: (promise: Promise<unknown>) => promise }, BlinkSettingsUI: { mount: jest.fn() } },
    showBootError: jest.fn(),
  };
  runInNewContext(section('  function showSettingsRepair(', "  document.getElementById('retryLoad')"), context);
  const load = () => runInNewContext('async function load() {\n' + section('  let settings;', '\n  deviceIdValue =') + '\n}\nload()', context);
  return { nodes, blocks, homebridge, context, load };
}

it.each([
  [{ earlyNotificationMode: 'ON' }, '/earlyNotificationMode', /lowercase/],
  [{ disableEarlyNotification: 'false' }, '/disableEarlyNotification', /JSON boolean/],
  [{ deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', disableEarlyNotification: 'false', extension: 'kept' }] }, '/deviceSettingOverrides/0/disableEarlyNotification', /JSON boolean/],
  [{ syncModuleSettingOverrides: { syncModuleId: '10', extension: 'kept' } }, '/syncModuleSettingOverrides', /arrays of objects/],
] as const)('provides a field-specific JSON Config repair path for malformed saved choices (%j)', async (config, path, guidance) => {
  const { nodes, blocks, homebridge, context, load } = fixture(config);
  const original = structuredClone(blocks);
  await load();
  expect(nodes.get('settingsRepair')!.hidden).toBe(false);
  expect(nodes.get('settingsRepairField')!.textContent).toContain(path);
  expect(nodes.get('settingsRepairGuidance')!.textContent).toMatch(guidance);
  expect(context.showBootError).toHaveBeenCalledWith(expect.stringMatching(/repair/i));
  expect(context.window.BlinkSettingsUI.mount).not.toHaveBeenCalled();
  expect(homebridge.updatePluginConfig).not.toHaveBeenCalled();
  expect(homebridge.savePluginConfig).not.toHaveBeenCalled();
  expect(blocks).toEqual(original);
});

it('keeps a transient migration-service failure separate from saved configuration repair', async () => {
  const { nodes, homebridge, context, load } = fixture({});
  homebridge.request.mockRejectedValue(new Error('Synthetic unavailable service'));
  await load();
  expect(nodes.get('settingsRepair')!.hidden).toBe(true);
  expect(context.showBootError).toHaveBeenCalledWith(expect.stringMatching(/retry/i));
  expect(context.window.BlinkSettingsUI.mount).not.toHaveBeenCalled();
  expect(homebridge.updatePluginConfig).not.toHaveBeenCalled();
  expect(homebridge.savePluginConfig).not.toHaveBeenCalled();
});
