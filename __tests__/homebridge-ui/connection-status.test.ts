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
    settings: { draft: { state: { accountAction: false }, index: 0 }, beginAccountAction: jest.fn(() => ({ finish: jest.fn() })) }, connectionTestInFlight: false,
    testConnectionButton: {}, verifyTestConnectionButton: {}, successEmail: { textContent: 'Synthetic account' }, successTier: { textContent: 'prod' },
    homebridge: { request: jest.fn().mockResolvedValue({ success: true }), showSpinner: jest.fn(), hideSpinner: jest.fn(), updatePluginConfig: jest.fn(), savePluginConfig: jest.fn() },
    window: { BlinkSettings: { deadline: jest.fn((promise: Promise<unknown>) => promise) } },
    hideError: jest.fn(), setButtonBusy: jest.fn(), showConnectionStatus: jest.fn(), refreshAuthStatus: jest.fn().mockResolvedValue({ authenticated: true, verified: true }),
    showStatusError: jest.fn(), showError: jest.fn(), deviceIdValue: 'synthetic-device', pluginConfig: [],
  };
  const test = runInNewContext(section('  async function testStoredConnection(', "  verifyTestConnectionButton.addEventListener(") + '\ntestStoredConnection', context);
  return { context, test };
}

function accountAction(context: object) {
  return runInNewContext(section('  function beginAccountAction()', '  async function saveTokenOnlyConfig(') + '\nbeginAccountAction', context);
}

it('keeps account actions out through connection testing and the subsequent status refresh, then allows them after completion', async () => {
  const { context, test } = connectionFixture();
  const begin = accountAction(context);
  let releaseRequest: (value: unknown) => void;
  let releaseStatus: (value: unknown) => void;
  context.homebridge.request.mockImplementation(() => new Promise(resolve => { releaseRequest = resolve; }));
  context.refreshAuthStatus.mockImplementation(() => new Promise(resolve => { releaseStatus = resolve; }));
  const operation = test(context.testConnectionButton);
  expect(begin()).toBeNull();
  expect(context.settings.beginAccountAction).not.toHaveBeenCalled();
  expect(context.showError).toHaveBeenCalledWith(expect.stringMatching(/check is in progress/i));
  releaseRequest!({ success: true });
  await new Promise(resolve => setImmediate(resolve));
  expect(context.refreshAuthStatus).toHaveBeenCalledTimes(1);
  expect(begin()).toBeNull();
  expect(context.settings.beginAccountAction).not.toHaveBeenCalled();
  releaseStatus!({ authenticated: true, verified: true }); await operation;
  expect(begin()).toEqual(expect.objectContaining({ finish: expect.any(Function) }));
  expect(context.settings.beginAccountAction).toHaveBeenCalledTimes(1);
});

it('releases the account-action guard on the UI deadline while the underlying connection request is still unresolved', async () => {
  jest.useFakeTimers();
  try {
    const { context, test } = connectionFixture();
    const timers = { module: { exports: {} }, structuredClone, setTimeout, clearTimeout };
    runInNewContext(readFileSync(join(__dirname, '../../src/homebridge-ui/public/settings-state.js'), 'utf8'), timers);
    context.window.BlinkSettings.deadline.mockImplementation((timers.module.exports as any).deadline);
    context.homebridge.request.mockImplementation(() => new Promise(() => {}));
    const begin = accountAction(context);
    const operation = test(context.testConnectionButton);
    expect(begin()).toBeNull();
    expect(context.settings.beginAccountAction).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(12000); await operation;
    expect(context.connectionTestInFlight).toBe(false);
    expect(context.refreshAuthStatus).not.toHaveBeenCalled();
    expect(begin()).toEqual(expect.objectContaining({ finish: expect.any(Function) }));
  } finally { jest.useRealTimers(); }
});

it('refuses a connection test while an account action already owns the page', async () => {
  const { context, test } = connectionFixture();
  context.settings.draft.state.accountAction = true;
  await test(context.testConnectionButton);
  expect(context.homebridge.request).not.toHaveBeenCalled();
  expect(context.connectionTestInFlight).toBe(false);
});

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
