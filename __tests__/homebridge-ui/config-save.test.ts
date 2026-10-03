import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const html = readFileSync(join(__dirname, '../../src/homebridge-ui/public/index.html'), 'utf8');
const section = (start: string, end: string) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));

it('auth completion preserves settings edited since boot and sanitizes only auth fields', async () => {
  const latest = [{ platform: 'BlinkCameras', pollInterval: 120, excludedNetworks: ['2'], password: 'synthetic' }, { platform: 'Other', name: 'kept' }];
  const homebridge = {
    getPluginConfig: jest.fn().mockResolvedValue(latest),
    updatePluginConfig: jest.fn(), savePluginConfig: jest.fn(),
  };
  const context = {
    homebridge, pluginConfig: [{ platform: 'BlinkCameras', pollInterval: 60 }],
    deviceIdValue: 'synthetic-device', updateLockUI: jest.fn(),
  };
  runInNewContext(section('  async function saveTokenOnlyConfig(data) {', '  async function handleAuthResponse('), context);
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
  const context = {
    pendingAuthConfig: null, saveTokenOnlyConfig: jest.fn().mockRejectedValue(new Error('synthetic failure')),
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
  const context = {
    verifyForm: { addEventListener: (_event: string, handler: typeof submit) => { submit = handler; } },
    document: { getElementById: () => codeInput }, homebridge, verifyType: 'client', verifyBtn: {},
    hideError: jest.fn(), setButtonBusy: jest.fn(), handleAuthResponse: jest.fn(), showError: jest.fn(),
  };
  runInNewContext(section("  verifyForm.addEventListener('submit'", '  async function testStoredConnection('), context);
  await submit!({ preventDefault: jest.fn() });
  expect(homebridge.request).toHaveBeenCalledWith('/verify', { code: 'synthetic', type: 'client', trustDevice: trustDevice !== false });
});
