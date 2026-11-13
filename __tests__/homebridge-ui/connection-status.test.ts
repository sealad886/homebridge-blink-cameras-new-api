import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const html = readFileSync(join(__dirname, '../../src/homebridge-ui/public/index.html'), 'utf8');
function section(start: string, end: string) { return html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start))); }
const node = () => ({ textContent: '', dataset: {} as Record<string, string>, classList: { toggle: jest.fn(), add: jest.fn(), remove: jest.fn() } });

it('clears stale success icons while checking, when unavailable, and after a failed connection test', () => {
  const context = {
    successStatusBadge: node(), connectionStatusIcon: node(), successEmail: node(), successTier: node(),
    successStatusLabel: node(), successTitle: node(), successSummary: node(), authStatusBadge: node(),
    pluginConfig: [], settings: { draft: { index: 0 } }, hideStatusError: jest.fn(), showStatusError: jest.fn(),
  };
  const show = runInNewContext(section('  function showConnectionStatus(', '  async function saveTokenOnlyConfig(') + '\nshowConnectionStatus', context);
  show('verified', { email: 'Synthetic account' });
  expect(context.connectionStatusIcon.textContent).toBe('✓');
  for (const state of ['checking', 'unavailable', 'unchecked']) {
    show(state);
    expect(context.connectionStatusIcon.textContent).toBe('');
    expect(context.successStatusBadge.dataset.state).toBe(state);
  }
  show('failed');
  expect(context.connectionStatusIcon.textContent).toBe('✕');
  expect(context.successStatusBadge.dataset.state).toBe('failed');
});

it.each(['login', 'callback', 'verify'])('invalidates the previous connection result when entering %s', step => {
  const context = {
    successStatusBadge: { ...node(), hidden: false }, connectionStatusIcon: { ...node(), textContent: '✓' },
    steps: Object.fromEntries(['login', 'callback', 'verify', 'success'].map(key => [key, { ...node(), querySelector: () => undefined }])),
    document: { getElementById: () => node() }, hideError: jest.fn(),
  };
  const show = runInNewContext(section('  function showStep(step)', '  function showError(') + '\nshowStep', context);
  show(step);
  expect(context.successStatusBadge.hidden).toBe(true);
  expect(context.successStatusBadge.dataset.state).toBe('unchecked');
  expect(context.connectionStatusIcon.textContent).toBe('');
});

function connectionFixture() {
  const context = {
    settings: { draft: { state: { accountAction: false }, index: 0 } }, connectionTestInFlight: false,
    testConnectionButton: {}, verifyTestConnectionButton: {}, successEmail: { textContent: 'Synthetic account' }, successTier: { textContent: 'prod' },
    homebridge: { request: jest.fn().mockResolvedValue({ success: true }), showSpinner: jest.fn(), hideSpinner: jest.fn(), updatePluginConfig: jest.fn(), savePluginConfig: jest.fn() },
    window: { BlinkSettings: { deadline: jest.fn((promise: Promise<unknown>) => promise) } },
    hideError: jest.fn(), setButtonBusy: jest.fn(), showConnectionStatus: jest.fn(), refreshAuthStatus: jest.fn().mockResolvedValue({ authenticated: true, verified: true }),
    showStatusError: jest.fn(), showError: jest.fn(), deviceIdValue: 'synthetic-device', pluginConfig: [],
  };
  const test = runInNewContext(section('  async function testStoredConnection(', "  verifyTestConnectionButton.addEventListener(") + '\ntestStoredConnection', context);
  return { context, test };
}

it('coalesces concurrent connection tests, bounds the request, and releases both buttons without saving configuration', async () => {
  const { context, test } = connectionFixture();
  let release: (value: unknown) => void;
  context.homebridge.request.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const first = test(context.testConnectionButton);
  await test(context.verifyTestConnectionButton);
  expect(context.homebridge.request).toHaveBeenCalledTimes(1);
  expect(context.window.BlinkSettings.deadline).toHaveBeenCalledTimes(1);
  for (const button of [context.testConnectionButton, context.verifyTestConnectionButton]) {
    expect(context.setButtonBusy).toHaveBeenCalledWith(button, true, 'Testing…', 'Test Connection');
  }
  release!({ success: true }); await first;
  expect(context.connectionTestInFlight).toBe(false);
  for (const button of [context.testConnectionButton, context.verifyTestConnectionButton]) {
    expect(context.setButtonBusy).toHaveBeenCalledWith(button, false, 'Testing…', 'Test Connection');
  }
  expect(context.homebridge.updatePluginConfig).not.toHaveBeenCalled();
  expect(context.homebridge.savePluginConfig).not.toHaveBeenCalled();
});

it.each(['failed response', 'request rejection', 'busy response'])('marks %s as failed and allows a later retry', async failure => {
  const { context, test } = connectionFixture();
  if (failure === 'failed response') {
    context.homebridge.request.mockResolvedValue({ success: false });
    context.refreshAuthStatus.mockResolvedValue({ authenticated: true, verified: false });
  } else context.homebridge.request.mockRejectedValue(failure === 'busy response'
    ? { error: { status: 409, category: 'authentication' } } : new Error('Synthetic timeout'));
  await test(context.testConnectionButton);
  expect(context.showConnectionStatus).toHaveBeenCalledWith('failed', expect.anything());
  expect(context.connectionTestInFlight).toBe(false);
  if (failure !== 'failed response') expect(context.refreshAuthStatus).not.toHaveBeenCalled();
  context.homebridge.request.mockResolvedValue({ success: true });
  context.refreshAuthStatus.mockResolvedValue({ authenticated: true, verified: true });
  await test(context.testConnectionButton);
  expect(context.homebridge.request).toHaveBeenCalledTimes(2);
});

it.each([{ authenticated: false }, { authenticated: true, requiresClientVerification: true }, { authenticated: true, requiresAccountVerification: true }])('retains failed test results independently of the current sign-in step (%j)', async status => {
  const { context, test } = connectionFixture();
  context.homebridge.request.mockResolvedValue({ success: false });
  context.refreshAuthStatus.mockResolvedValue(status);
  await test(context.testConnectionButton);
  expect(context.showConnectionStatus).toHaveBeenLastCalledWith('failed', status);
});

it('refreshes authentication metadata without triggering token-only configuration persistence', async () => {
  const context = {
    hideStatusError: jest.fn(), homebridge: { request: jest.fn().mockResolvedValue({ authenticated: true, verified: true }) },
    window: { BlinkSettings: { deadline: (promise: Promise<unknown>) => promise } }, handleAuthResponse: jest.fn(),
  };
  const refresh = runInNewContext(section('  async function refreshAuthStatus()', '  function addLog(') + '\nrefreshAuthStatus', context);
  await refresh();
  expect(context.handleAuthResponse).toHaveBeenCalledWith({ authenticated: true, verified: true }, { persistConfig: false, notify: false });
});
