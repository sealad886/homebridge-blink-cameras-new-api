import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { SettingsValidator } from '../../src/homebridge-ui/settings-validation';

const html = readFileSync(join(__dirname, '../../src/homebridge-ui/public/index.html'), 'utf8');
const accountGuard = html.slice(html.indexOf('  function beginAccountAction()'), html.indexOf('  async function saveTokenOnlyConfig('));
const section = (start: string, end: string) => accountGuard + html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));

it('blocks token-only saves and lock or restart actions before any account request while a connection test owns the page', async () => {
  let lock: () => Promise<void>;
  const context = {
    connectionTestInFlight: true, settings: { beginAccountAction: jest.fn() }, showError: jest.fn(),
    lockAuthBtn: { addEventListener: (_event: string, handler: typeof lock) => { lock = handler; } },
    homebridge: { request: jest.fn(), updatePluginConfig: jest.fn(), savePluginConfig: jest.fn() },
  };
  runInNewContext(section('  async function saveTokenOnlyConfig(', '  async function handleAuthResponse('), context);
  const restart = runInNewContext(section("  lockAuthBtn.addEventListener('click'", "  unlockAuthBtn.addEventListener('click'") + '\nrestartAuthentication', context);
  await expect((context as typeof context & { saveTokenOnlyConfig: (data: unknown) => Promise<void> }).saveTokenOnlyConfig({})).rejects.toThrow();
  await lock!(); await restart();
  expect(context.settings.beginAccountAction).not.toHaveBeenCalled();
  expect(context.homebridge.request).not.toHaveBeenCalled();
  expect(context.homebridge.updatePluginConfig).not.toHaveBeenCalled();
  expect(context.homebridge.savePluginConfig).not.toHaveBeenCalled();
  expect(context.showError).toHaveBeenCalledTimes(3);
});

it('auth completion preserves settings edited since boot and sanitizes only auth fields', async () => {
  const latest = [{ platform: 'BlinkCameras', pollInterval: 120, excludedNetworks: ['2'], password: 'synthetic' }, { platform: 'Other', name: 'kept' }];
  const homebridge = {
    getPluginConfig: jest.fn().mockResolvedValue(latest),
    updatePluginConfig: jest.fn(), savePluginConfig: jest.fn(),
  };
  const context = { connectionTestInFlight: false,
    homebridge, getLatestPluginConfig: homebridge.getPluginConfig, pluginConfig: [{ platform: 'BlinkCameras', pollInterval: 60 }],
    deviceIdValue: 'synthetic-device', updateLockUI: jest.fn(), settings: { draft: { index: 0 }, beginAccountAction: () => ({ blocks: structuredClone(latest), finish: jest.fn() }), replaceBaseline: jest.fn() },
  };
  runInNewContext(section('  async function saveTokenOnlyConfig(', '  async function handleAuthResponse('), context);
  await (context as typeof context & { saveTokenOnlyConfig: (data: unknown) => Promise<void> }).saveTokenOnlyConfig({ tier: 'e999' });
  expect(homebridge.updatePluginConfig).toHaveBeenCalledWith([
    { platform: 'BlinkCameras', pollInterval: 120, excludedNetworks: ['2'], deviceId: 'synthetic-device', tier: 'e999', persistAuth: true, authLocked: true },
    { platform: 'Other', name: 'kept' },
  ]);
  expect(latest[0].password).toBe('synthetic');
  expect(homebridge.savePluginConfig).toHaveBeenCalledTimes(1);
});

it.each(['client', 'account'])('keeps %s verification reachable when config save fails', async type => {
  const classes = { add: jest.fn(), remove: jest.fn() };
  const data = { authenticated: true, [type === 'client' ? 'requiresClientVerification' : 'requiresAccountVerification']: true };
  const context = { connectionTestInFlight: false,
    settings: { setAccountReady: jest.fn() }, pendingAuthConfig: null, saveTokenOnlyConfig: jest.fn().mockRejectedValue(new Error('synthetic failure')),
    document: { getElementById: () => ({ classList: classes }) },
    homebridge: { showSchemaForm: jest.fn(), toast: { warning: jest.fn(), success: jest.fn() } },
    setAuthLockVisibility: jest.fn(), showConnectionStatus: jest.fn(), showStep: jest.fn(), showError: jest.fn(), handleVerificationRequired: jest.fn(),
  };
  runInNewContext(section('  async function handleAuthResponse(', '  async function refreshAuthStatus()'), context);
  await (context as typeof context & { handleAuthResponse: (data: unknown) => Promise<void> }).handleAuthResponse(data);
  expect(context.handleVerificationRequired).toHaveBeenCalledWith(type, data);
  expect(classes.remove).toHaveBeenCalledWith('hidden');
  expect(context.pendingAuthConfig).toEqual(data);
  expect(context.showStep).not.toHaveBeenCalledWith('success');
});

it.each([false, true, undefined])('verification honors current trust-device setting (%s)', async trustDevice => {
  let submit: (event: { preventDefault: () => void }) => Promise<void>;
  const codeInput = { value: 'synthetic' };
  const homebridge = {
    getPluginConfig: jest.fn().mockResolvedValue([{ trustDevice }]),
    request: jest.fn().mockResolvedValue({ authenticated: true }),
    showSpinner: jest.fn(), hideSpinner: jest.fn(),
  };
  const context = { connectionTestInFlight: false,
    settings: { draft: { index: 0 }, beginAccountAction: () => ({ blocks: [{ trustDevice }], finish: jest.fn() }) }, verifyForm: { addEventListener: (_event: string, handler: typeof submit) => { submit = handler; } },
    document: { getElementById: () => codeInput }, homebridge, getLatestPluginConfig: homebridge.getPluginConfig, verifyType: 'client', verifyBtn: {},
    hideError: jest.fn(), setButtonBusy: jest.fn(), handleAuthResponse: jest.fn(), showError: jest.fn(),
  };
  runInNewContext(section("  verifyForm.addEventListener('submit'", '  async function testStoredConnection('), context);
  await submit!({ preventDefault: jest.fn() });
  expect(homebridge.request).toHaveBeenCalledWith('/verify', { code: 'synthetic', type: 'client', trustDevice: trustDevice !== false });
});


it('refuses an immediate account save while settings have unsaved edits', async () => {
  const context = { connectionTestInFlight: false, settings: { beginAccountAction: () => null }, homebridge: { updatePluginConfig: jest.fn(), savePluginConfig: jest.fn() } };
  runInNewContext(section('  async function saveTokenOnlyConfig(', '  async function handleAuthResponse('), context);
  await expect((context as typeof context & { saveTokenOnlyConfig: (data: unknown) => Promise<void> }).saveTokenOnlyConfig({})).rejects.toThrow();
  expect(context.homebridge.updatePluginConfig).not.toHaveBeenCalled();
  expect(context.homebridge.savePluginConfig).not.toHaveBeenCalled();
});

it('reserves token-only persistence until host save settles and releases it after failure', async () => {
  const stateContext = { module: { exports: {} }, structuredClone, setTimeout, clearTimeout };
  runInNewContext(readFileSync(join(__dirname, '../../src/homebridge-ui/public/settings-state.js'), 'utf8'), stateContext);
  const { Draft } = stateContext.module.exports as any;
  let finishSave: (error: Error) => void;
  const homebridge = {
    updatePluginConfig: jest.fn().mockResolvedValue(undefined),
    savePluginConfig: jest.fn(() => new Promise((_resolve, reject) => { finishSave = reject; })),
  };
  const draft = new Draft([{ platform: 'BlinkCameras', pollInterval: 60 }], {
    validate: async ({ revision }: any) => ({ revision, valid: true }), stage: jest.fn(), changed: jest.fn(), saveEnabled: jest.fn(),
  });
  const context = { connectionTestInFlight: false,
    settings: { draft, beginAccountAction: () => draft.beginAccountAction(), replaceBaseline: (blocks: unknown[]) => draft.replaceBaseline(blocks) },
    homebridge, deviceIdValue: '', updateLockUI: jest.fn(), pluginConfig: [],
  };
  runInNewContext(section('  async function saveTokenOnlyConfig(', '  async function handleAuthResponse('), context);
  const operation = (context as typeof context & { saveTokenOnlyConfig: (data: unknown) => Promise<void> }).saveTokenOnlyConfig({});
  await new Promise(resolve => setImmediate(resolve));
  draft.set('pollInterval', 120);
  expect(draft.config.pollInterval).toBe(60);
  expect(draft.canRunAccountAction()).toBe(false);
  finishSave!(new Error('synthetic host save failure'));
  await expect(operation).rejects.toThrow(); await draft.flush();
  draft.set('pollInterval', 180); await draft.flush();
  expect(draft.config.pollInterval).toBe(180);
  expect(homebridge.updatePluginConfig).toHaveBeenCalledWith([expect.objectContaining({ pollInterval: 60 })]);
});

it.each([false, true])('preserves canonical settings during auth recovery and adopts baseline after host save (reserved: %s)', async reserved => {
  const stateContext = { module: { exports: {} }, structuredClone, setTimeout, clearTimeout };
  runInNewContext(readFileSync(join(__dirname, '../../src/homebridge-ui/public/settings-state.js'), 'utf8'), stateContext);
  const { Draft } = stateContext.module.exports as any;
  const original = [{ platform: 'Other', extension: { keep: true } }, { platform: 'BlinkCameras', name: 'Blink',
    earlyNotificationMode: 'off', syncModuleFeedLimits: [{ syncModuleId: '20', maxFeeds: 1 }],
    extension: { keep: true }, _bridge: { username: 'synthetic' }, trustDevice: false }];
  const validator = new SettingsValidator(() => undefined);
  const host = { validate: async (payload: unknown) => validator.validate(payload), stage: jest.fn(), changed: jest.fn(), saveEnabled: jest.fn() };
  const draft = new Draft(original, host);
  draft.retry(); await draft.flush();
  expect(draft.state.errors).toEqual([expect.objectContaining({ code: 'inventory_unavailable' })]);
  let finishSave: () => void;
  let submit: (event: { preventDefault: () => void }) => Promise<void>;
  const homebridge = {
    request: jest.fn().mockResolvedValue({ authenticated: true }),
    updatePluginConfig: jest.fn().mockResolvedValue(undefined),
    savePluginConfig: jest.fn(() => new Promise<void>(resolve => { finishSave = resolve; })),
    showSpinner: jest.fn(), hideSpinner: jest.fn(),
  };
  const context = { connectionTestInFlight: false,
    settings: { draft, beginAccountAction: () => draft.beginAccountAction(), replaceBaseline: (blocks: unknown[]) => draft.replaceBaseline(blocks) },
    homebridge, deviceIdValue: '', updateLockUI: jest.fn(), pluginConfig: [],
    verifyForm: { addEventListener: (_event: string, handler: typeof submit) => { submit = handler; } },
    document: { getElementById: () => ({ value: 'synthetic-code' }) }, verifyType: 'client', verifyBtn: {},
    hideError: jest.fn(), setButtonBusy: jest.fn(), showError: jest.fn(),
    handleAuthResponse: (data: unknown, { accountAction }: any) => save(data, accountAction),
  };
  runInNewContext(section('  async function saveTokenOnlyConfig(', '  async function handleAuthResponse('), context);
  const save = (context as typeof context & { saveTokenOnlyConfig: (data: unknown, action?: unknown) => Promise<void> }).saveTokenOnlyConfig;
  runInNewContext(section("  verifyForm.addEventListener('submit'", '  async function testStoredConnection('), context);
  const operation = reserved ? submit!({ preventDefault: jest.fn() }) : save({ authenticated: true });
  await new Promise(resolve => setImmediate(resolve));
  if (reserved) expect(homebridge.request).toHaveBeenCalledWith('/verify', { code: 'synthetic-code', type: 'client', trustDevice: false });
  expect(homebridge.savePluginConfig).toHaveBeenCalledTimes(1);
  expect(JSON.parse(draft.baseline)).toEqual(original);
  expect(draft.state.accountAction).toBe(true);
  expect(draft.set('name', 'Unsaved user edit')).toBe(false);
  expect(draft.beginAccountAction()).toBeNull();
  const saved = [original[0], { ...original[1],
    deviceId: 'homebridge-blink', tier: 'prod', persistAuth: true, authLocked: true }];
  expect(homebridge.updatePluginConfig).toHaveBeenCalledWith(saved);
  finishSave!(); await operation; await draft.flush();
  expect(context.showError).not.toHaveBeenCalled();
  expect(draft.blocks).toEqual(saved);
  expect(JSON.parse(draft.baseline)).toEqual(saved);
  expect(draft.state).toMatchObject({ dirty: false, accountAction: false });
  expect(draft.hasUserChanges()).toBe(false);
  expect(draft.canRunAccountAction()).toBe(true);
  expect(host.stage).not.toHaveBeenCalled();
  draft.set('name', 'User edit'); await draft.flush();
  expect(draft.canRunAccountAction()).toBe(false);
  expect(homebridge.savePluginConfig).toHaveBeenCalledTimes(1);
  expect(original[1]).toHaveProperty('earlyNotificationMode', 'off');
});
