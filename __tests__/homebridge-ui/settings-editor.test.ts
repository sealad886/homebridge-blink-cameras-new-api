import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext, Script } from 'node:vm';
import { execFileSync } from 'node:child_process';
import { SettingsValidator } from '../../src/homebridge-ui/settings-validation';

class Element {
  children: Element[] = [];
  handlers: Record<string, () => unknown> = {};
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  classList = { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() };
  hidden = false; checked = false; disabled = false; value = ''; textContent = ''; id = ''; type = ''; inputMode = ''; className = ''; htmlFor = '';
  constructor(public tag = 'div') {}
  append(...children: Element[]): void { this.children.push(...children); }
  replaceChildren(): void { this.children = []; }
  addEventListener(event: string, handler: () => unknown): void { this.handlers[event] = handler; }
  setAttribute(key: string, value: string): void { this.attributes[key] = value; }
  focus(): void {}
  set innerHTML(_value: string) { throw new Error('Provider data must never be parsed as HTML.'); }
  querySelectorAll(selector: string): Element[] {
    return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(child => selector === '*' || child.tag === selector || selector === '[data-setting]' && child.dataset.setting);
  }
  querySelector(selector: string): Element | undefined { return this.querySelectorAll(selector)[0]; }
}
const source = (name: string) => readFileSync(join(__dirname, '../../src/homebridge-ui/public', name), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const cameras = [{ key: 'camera:1', kind: 'camera', id: '1', name: 'Same', networkId: '10', status: 'online', enabled: true, moduleAssociation: { state: 'unique', source: 'network_id', candidateIds: ['100'] } },
  { key: 'owl:1', kind: 'owl', id: '1', name: 'Same', networkId: '10', status: 'offline', enabled: true, moduleAssociation: { state: 'noneReported', source: 'network_id', candidateIds: [] } }];
function mount(config: Record<string, unknown>, validate?: (payload: unknown) => unknown) {
  const elements = new Map(['settingsNavigation', 'sectionFields', 'connectionFlow', 'accountMaintenance', 'sectionTitle', 'draftStatus', 'settingsErrors', 'inventoryStatus', 'retrySettings', 'accountDraftWarning', 'settingsWarnings'].map(id => [id, new Element()]));
  const document = { createElement: (tag: string) => new Element(tag), getElementById: (id: string) => elements.get(id) };
  const context: any = { window: {}, document, structuredClone, setTimeout, clearTimeout };
  runInNewContext(source('settings-state.js'), context);
  runInNewContext(source('settings-ui.js'), context);
  const homebridge = {
    request: jest.fn(async (path: string, payload?: any) => path === '/settings/inventory'
      ? { revision: '1', fetchedAt: '2026-11-02T00:00:00Z', networks: [{ id: '10', name: 'Home', armed: true }], syncModules: [{ id: '100', networkId: '10', status: 'online' }], cameras }
      : validate ? validate(JSON.parse(JSON.stringify(payload))) : { revision: payload.revision, valid: true, errors: [], warnings: [] }),
    updatePluginConfig: jest.fn().mockResolvedValue(undefined), enableSaveButton: jest.fn(), disableSaveButton: jest.fn(),
  };
  const schema = JSON.parse(readFileSync(join(__dirname, '../../config.schema.json'), 'utf8'));
  const editor = context.window.BlinkSettingsUI.mount(homebridge, schema, [{ platform: 'BlinkCameras', name: 'Blink', ...config }]);
  return { editor, homebridge, elements, schema };
}
function earlyNotificationControl(parent: Element): Element {
  const label = parent.querySelectorAll('label').find(item => item.textContent === 'Early Notification')!;
  return parent.querySelectorAll('select').find(input => input.id === label.htmlFor)!;
}

it('opens, discovers cameras and retries validation without notifying Homebridge of configuration changes', async () => {
  const { editor, homebridge, elements } = mount({ pollInterval: 60, extension: { keep: true } });
  await editor.draft.flush();
  editor.setAccountReady(true); await tick(); await editor.draft.flush();
  await editor.refreshInventory(); await editor.draft.flush();
  editor.showSection(1); editor.showSection(4);
  expect(editor.draft.state.dirty).toBe(false);
  expect(elements.get('draftStatus')!.dataset.state).toBe('clean');
  expect(homebridge.updatePluginConfig).not.toHaveBeenCalled();
  expect(homebridge.enableSaveButton).not.toHaveBeenCalled();
  editor.draft.set('pollInterval', 120); await editor.draft.flush();
  expect(homebridge.updatePluginConfig).toHaveBeenCalledTimes(1);
  expect(editor.draft.state.dirty).toBe(true);
  editor.draft.set('pollInterval', 60); await editor.draft.flush();
  expect(homebridge.updatePluginConfig).toHaveBeenCalledTimes(2);
  expect(editor.draft.state.dirty).toBe(false);
  expect(elements.get('draftStatus')!.dataset.state).toBe('clean');
});

it('identifies every blocking field and stages only after canonical validation succeeds', async () => {
  const validator = new SettingsValidator(() => undefined);
  const { editor, homebridge, elements, schema } = mount({ enableMotionPolling: false, hksvCameras: ['camera:1'],
    deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', homeKitSecureVideo: 'yes' }] }, payload => validator.validate(payload));
  editor.draft.set('name', 'Updated Blink'); await editor.draft.flush();
  const paths = editor.draft.state.errors.map((error: { path: string }) => error.path);
  const nestedPath = '/deviceSettingOverrides/0/homeKitSecureVideo';
  expect(paths).toEqual(expect.arrayContaining(['/enableMotionPolling', '/hksvCameras', nestedPath]));
  const messages = elements.get('settingsErrors')!.querySelectorAll('p').map(item => item.textContent);
  for (const path of paths) expect(messages.some(message => message.includes(path))).toBe(true);
  expect(messages.find(message => message.includes(nestedPath))).toContain(schema.schema.properties.deviceSettingOverrides.title);
  expect(elements.get('draftStatus')!.textContent).toContain(String(paths.length));
  expect(elements.get('draftStatus')!.textContent).not.toMatch(/Unsaved changes/);
  expect(homebridge.updatePluginConfig).not.toHaveBeenCalled();
  expect(homebridge.enableSaveButton).not.toHaveBeenCalled();
  expect(homebridge.disableSaveButton).toHaveBeenCalled();

  editor.draft.set('enableMotionPolling', undefined);
  editor.draft.set('hksvCameras', undefined);
  editor.draft.set('deviceSettingOverrides', [{ deviceIdentifier: 'camera:1', homeKitSecureVideo: true }]);
  await editor.draft.flush();
  expect(editor.draft.state.errors).toEqual([]);
  expect(elements.get('settingsErrors')!.hidden).toBe(true);
  expect(homebridge.updatePluginConfig).toHaveBeenCalledTimes(1);
  expect(homebridge.updatePluginConfig).toHaveBeenLastCalledWith([expect.objectContaining({
    name: 'Updated Blink', deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', homeKitSecureVideo: true }],
  })]);
  expect(homebridge.enableSaveButton).toHaveBeenCalledTimes(1);
});

it('renders a valid zero-selection recording picker without adding a blank selector', async () => {
  const { editor, homebridge, elements } = mount({ unrelated: 'kept' });
  editor.setAccountReady(true); await tick(); await editor.draft.flush();
  editor.showSection(2);
  const checkboxes = elements.get('sectionFields')!.querySelectorAll('input').filter(input => input.type === 'checkbox');
  expect(checkboxes).toHaveLength(2); expect(checkboxes.every(input => !input.checked)).toBe(true);
  expect(editor.draft.config).not.toHaveProperty('deviceSettingOverrides');
  editor.draft.set('pollInterval', 120); await editor.draft.flush();
  expect(homebridge.updatePluginConfig).toHaveBeenLastCalledWith([expect.objectContaining({ unrelated: 'kept', pollInterval: 120 })]);
  expect(homebridge.updatePluginConfig.mock.calls.at(-1)![0][0]).not.toHaveProperty('deviceSettingOverrides');
});

it('offers positive plugin Early Notification choices without writing an absent default', async () => {
  const { editor, homebridge, elements } = mount({ extension: true });
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(2);
  const control = earlyNotificationControl(elements.get('sectionFields')!);
  expect(control.value).toBe('unmanaged');
  expect(editor.draft.config).not.toHaveProperty('earlyNotificationMode');
  for (const [choice, value] of [['on', 'on'], ['off', 'off'], ['unmanaged', 'unmanaged']] as const) {
    control.value = choice; control.handlers.change(); await editor.draft.flush();
    expect(editor.draft.config.earlyNotificationMode).toBe(value);
  }
  control.value = 'unmanaged'; control.handlers.change(); await editor.draft.flush();
  expect(editor.draft.config.earlyNotificationMode).toBe('unmanaged');
  expect(homebridge.updatePluginConfig.mock.calls.at(-1)![0][0].earlyNotificationMode).toBe('unmanaged');
  expect(editor.draft.config.extension).toBe(true);
  expect(editor.draft.config).not.toHaveProperty('syncModuleSettingOverrides');
  expect(editor.draft.config).not.toHaveProperty('deviceSettingOverrides');
});

it.each(['camera', 'module'])('edits and unsets %s Early Notification without losing other settings or parent choices', async level => {
  const { editor, elements } = mount({ earlyNotificationMode: 'off',
    syncModuleFeedLimits: [{ syncModuleId: '100', maxFeeds: 1 }],
    syncModuleSettingOverrides: [{ syncModuleId: '100', vendorExtension: 8 }, { syncModuleId: 'missing', earlyNotificationMode: 'unmanaged' }],
    deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', homeKitSecureVideo: true, vendorExtension: 7 }, { deviceIdentifier: 'missing', homeKitSecureVideo: true }] });
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(1);
  const fields = elements.get('sectionFields')!;
  const card = fields.querySelectorAll('details').find(item => item.querySelectorAll('p').some(text => text.textContent === 'camera:1'))!;
  const control = level === 'camera' ? earlyNotificationControl(card)
    : fields.querySelectorAll('select').find(input => input.dataset.setting === 'syncModuleSettingOverrides')!;
  const key = level === 'camera' ? 'deviceSettingOverrides' : 'syncModuleSettingOverrides';
  const selector = level === 'camera' ? 'deviceIdentifier' : 'syncModuleId';
  const id = level === 'camera' ? 'camera:1' : '100';
  expect(control.value).toBe('inherit');
  for (const [choice, value] of [['on', 'on'], ['off', 'off'], ['unmanaged', 'unmanaged']] as const) {
    control.value = choice; control.handlers.change(); await editor.draft.flush();
    expect(editor.draft.config[key].find((row: Record<string, unknown>) => row[selector] === id).earlyNotificationMode).toBe(value);
    expect(editor.draft.config.earlyNotificationMode).toBe('off');
  }
  control.value = 'inherit'; control.handlers.change(); await editor.draft.flush();
  expect(editor.draft.config[key].find((row: Record<string, unknown>) => row[selector] === id)).not.toHaveProperty('earlyNotificationMode');
  expect(editor.draft.config.deviceSettingOverrides).toHaveLength(2);
  expect(editor.draft.config.deviceSettingOverrides).toEqual(expect.arrayContaining([{ deviceIdentifier: 'missing', homeKitSecureVideo: true }, { deviceIdentifier: 'camera:1', homeKitSecureVideo: true, vendorExtension: 7 }]));
  expect(editor.draft.config.syncModuleFeedLimits).toEqual([{ syncModuleId: '100', maxFeeds: 1 }]);
  expect(editor.draft.config.syncModuleSettingOverrides).toEqual(expect.arrayContaining([{ syncModuleId: '100', vendorExtension: 8 }, { syncModuleId: 'missing', earlyNotificationMode: 'unmanaged' }]));
});

it.each(['camera', 'module'])('removes a selector-only %s override when its Early Notification choice is unset', async level => {
  const { editor, elements } = mount({ earlyNotificationMode: 'off',
    deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', earlyNotificationMode: 'unmanaged' }],
    syncModuleSettingOverrides: [{ syncModuleId: '100', earlyNotificationMode: 'unmanaged' }] });
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(1);
  const fields = elements.get('sectionFields')!;
  const card = fields.querySelectorAll('details').find(item => item.querySelectorAll('p').some(text => text.textContent === 'camera:1'))!;
  const control = level === 'camera' ? earlyNotificationControl(card)
    : fields.querySelectorAll('select').find(input => input.dataset.setting === 'syncModuleSettingOverrides')!;
  control.value = 'inherit'; control.handlers.change(); await editor.draft.flush();
  expect(editor.draft.config[level === 'camera' ? 'deviceSettingOverrides' : 'syncModuleSettingOverrides']).toEqual([]);
  expect(editor.draft.config.earlyNotificationMode).toBe('off');
});

it('preserves and allows removal of unavailable module settings when discovery fails', async () => {
  const { editor, homebridge, elements } = mount({ syncModuleSettingOverrides: [{ syncModuleId: 'missing', earlyNotificationMode: 'unmanaged' }],
    syncModuleFeedLimits: [{ syncModuleId: 'missing', maxFeeds: 2 }] });
  await editor.draft.flush();
  homebridge.request.mockImplementation(async (path, payload?: any) => {
    if (path === '/settings/inventory') throw new Error('synthetic unavailable');
    return { revision: payload.revision, valid: true, errors: [], warnings: [] };
  });
  editor.setAccountReady(true); await tick(); editor.showSection(1);
  const fields = elements.get('sectionFields')!;
  const saved = fields.querySelectorAll('details').find(item => item.querySelectorAll('span').some(node => node.textContent === 'missing'))!;
  saved.querySelectorAll('button').find(button => button.textContent === 'Remove selection')!.handlers.click();
  await editor.draft.flush();
  expect(editor.draft.config.syncModuleSettingOverrides).toEqual([]);
  expect(editor.draft.config.syncModuleFeedLimits).toEqual([{ syncModuleId: 'missing', maxFeeds: 2 }]);
});

it('keeps excluded cameras discoverable and re-includes one while preserving unavailable exclusions', async () => {
  const { editor, elements } = mount({ excludeDevices: ['camera:1', 'unavailable'], extension: true });
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(1);
  const card = elements.get('sectionFields')!.querySelectorAll('details').find(item => item.querySelectorAll('p').some(text => text.textContent === 'camera:1'))!;
  const included = card.querySelector('input')!;
  expect(included.checked).toBe(false);
  included.checked = true; included.handlers.change(); await editor.draft.flush();
  expect(editor.draft.config.excludeDevices).toEqual(['unavailable']); expect(editor.draft.config.extension).toBe(true);
});

it('shows unavailable system exclusions and allows removing one without changing other selections', async () => {
  const { editor, elements } = mount({ excludedNetworks: ['10', 'missing-system'], extension: true });
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(1);
  const fields = elements.get('sectionFields')!;
  expect(fields.querySelectorAll('span').some(item => item.textContent === 'missing-system')).toBe(true);
  const details = fields.querySelectorAll('details').find(item => item.querySelectorAll('span').some(node => node.textContent === 'missing-system'))!;
  details.querySelectorAll('button').find(button => button.textContent === 'Remove selection')!.handlers.click();
  await editor.draft.flush();
  expect(editor.draft.config.excludedNetworks).toEqual(['10']);
  expect(editor.draft.config.extension).toBe(true);
});

it('reserves qualified camera exclusions even when a Blink system has the same name', async () => {
  const { editor, homebridge, elements } = mount({ excludeDevices: ['owl:1'] });
  const request = homebridge.request;
  request.mockImplementation(async (path, payload?: any) => path === '/settings/inventory'
    ? { revision: '2', fetchedAt: '2026-11-02T00:00:00Z', networks: [{ id: '10', name: 'owl:1', armed: true }], syncModules: [{ id: '100', networkId: '10', status: 'online' }], cameras }
    : { revision: payload.revision, valid: true, errors: [], warnings: [] });
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(2);
  const checks = elements.get('sectionFields')!.querySelectorAll('input').filter(input => input.type === 'checkbox');
  expect(checks[0].disabled).toBe(false);
  expect(checks[1].disabled).toBe(true);
});

it('offers explicit temperature inheritance and preserves unknown per-camera keys when editing overrides', async () => {
  const { editor, elements } = mount({ exposeTemperature: true, deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', vendorExtension: 7, motionTimeout: 45 }] });
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(1);
  const fields = elements.get('sectionFields')!;
  const label = fields.querySelectorAll('label').find(item => item.textContent === 'Temperature in Home')!;
  const temperature = fields.querySelectorAll('select').find(input => input.id === label.htmlFor)!;
  expect(temperature.value).toBe('inherit');
  temperature.value = 'no'; temperature.handlers.change(); await editor.draft.flush();
  expect(editor.draft.config.deviceSettingOverrides).toEqual([{ deviceIdentifier: 'camera:1', vendorExtension: 7, motionTimeout: 45, exposeTemperature: false }]);
  temperature.value = 'inherit'; temperature.handlers.change(); await editor.draft.flush();
  expect(editor.draft.config.deviceSettingOverrides).toEqual([{ deviceIdentifier: 'camera:1', vendorExtension: 7, motionTimeout: 45 }]);
});

it('retains the last camera list and selectors when discovery fails', async () => {
  const { editor, homebridge, elements } = mount({ deviceSettingOverrides: [{ deviceIdentifier: 'missing', homeKitSecureVideo: true }, { deviceIdentifier: 'owl:1', homeKitSecureVideo: true }] });
  editor.setAccountReady(true); await tick(); await editor.draft.flush();
  homebridge.request.mockImplementation(async () => { throw new Error('synthetic discovery failure'); });
  await editor.refreshInventory(); editor.showSection(2);
  expect(editor.draft.config.deviceSettingOverrides).toEqual([{ deviceIdentifier: 'missing', homeKitSecureVideo: true }, { deviceIdentifier: 'owl:1', homeKitSecureVideo: true }]);
  expect(elements.get('sectionFields')!.querySelectorAll('input').filter(input => input.type === 'checkbox')).toHaveLength(2);
  expect(elements.get('inventoryStatus')!.textContent).toMatch(/preserved/i);
});

it.each(['/lock', '/unlock'])('keeps edits and a second account action out of %s through navigation and host save', async path => {
  const { editor, homebridge, elements } = mount({ pollInterval: 60 });
  editor.setAccountReady(true); await tick(); await editor.draft.flush();
  let releaseRequest: () => void;
  let releaseSave: () => void;
  const request = homebridge.request;
  request.mockImplementation(async (requestPath, payload?: any) => requestPath === path
    ? new Promise<any>(resolve => { releaseRequest = () => resolve({}); })
    : { revision: payload.revision, valid: true, errors: [], warnings: [] });
  const save = jest.fn(() => new Promise<void>(resolve => { releaseSave = resolve; }));
  Object.assign(homebridge, { savePluginConfig: save, toast: { success: jest.fn(), info: jest.fn() } });
  const lock = new Element();
  const context = {
    connectionTestInFlight: false,
    settings: editor, homebridge, lockAuthBtn: lock, getLatestPluginConfig: async () => editor.blocks,
    pluginConfig: editor.blocks, updateLockUI: jest.fn(), showError: jest.fn(),
    setAuthLockVisibility: jest.fn(), pendingAuthConfig: null, resetHostedFlow: jest.fn(),
    document: { getElementById: () => new Element() },
  };
  const html = source('index.html');
  const accountGuard = html.slice(html.indexOf('  function beginAccountAction()'), html.indexOf('  async function saveTokenOnlyConfig('));
  const unlock = runInNewContext(accountGuard + html.slice(html.indexOf("  lockAuthBtn.addEventListener('click'"), html.indexOf("  unlockAuthBtn.addEventListener('click'")) + '\nrestartAuthentication', context) as () => Promise<void>;
  const operation = (path === '/lock' ? lock.handlers.click() : unlock()) as Promise<void>;
  editor.draft.set('pollInterval', 120);
  editor.showSection(4);
  const input = elements.get('sectionFields')!.querySelectorAll('[data-setting]').find(item => item.dataset.setting === 'pollInterval')!;
  expect(input.disabled).toBe(true);
  input.value = '180'; input.handlers.input();
  await lock.handlers.click();
  expect(request.mock.calls.filter(([requestPath]) => requestPath === '/lock' || requestPath === '/unlock')).toHaveLength(1);
  releaseRequest!(); await tick();
  expect(save).toHaveBeenCalledTimes(1);
  editor.draft.set('pollInterval', 240);
  releaseSave!(); await operation; await editor.draft.flush();
  expect(homebridge.updatePluginConfig).toHaveBeenLastCalledWith([expect.objectContaining({ pollInterval: 60, authLocked: path === '/lock' })]);
  expect(editor.draft.config.pollInterval).toBe(60);
  expect(context.showError).not.toHaveBeenCalled();
  editor.draft.set('pollInterval', 300); await editor.draft.flush();
  expect(editor.draft.config.pollInterval).toBe(300);
});

it('renders provider names as inert text and allows resetting a module override', async () => {
  const previous = cameras[0].name;
  cameras[0].name = '<img src=x onerror=alert(1)>';
  try {
    const { editor, elements } = mount({ syncModuleFeedLimits: [{ syncModuleId: '100', maxFeeds: 1 }, { syncModuleId: 'unavailable', maxFeeds: 2 }] });
    editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(1);
    expect(elements.get('sectionFields')!.querySelectorAll('summary').some(item => item.textContent.includes('<img src=x'))).toBe(true);
    expect(elements.get('sectionFields')!.querySelectorAll('img')).toHaveLength(0);
    const reset = elements.get('sectionFields')!.querySelectorAll('button').find(button => button.textContent === 'Use discovered default')!;
    expect(reset.disabled).toBe(false); reset.handlers.click(); await editor.draft.flush();
    expect(editor.draft.config.syncModuleFeedLimits).toEqual([{ syncModuleId: 'unavailable', maxFeeds: 2 }]);
  } finally { cameras[0].name = previous; }
});

it('makes snapshot expiry inactive while manual-refresh persistence is enabled without overwriting its duration', async () => {
  const { editor, elements } = mount({ persistSnapshotCache: true, snapshotCacheTTL: 300 });
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(4);
  const ttl = elements.get('sectionFields')!.querySelectorAll('[data-setting]').find(input => input.dataset.setting === 'snapshotCacheTTL')!;
  expect(ttl.disabled).toBe(true); expect(ttl.value).toBe('300');
  const persistent = elements.get('sectionFields')!.querySelectorAll('[data-setting]').find(input => input.dataset.setting === 'persistSnapshotCache')!;
  persistent.checked = false; persistent.handlers.change(); await editor.draft.flush();
  const next = elements.get('sectionFields')!.querySelectorAll('[data-setting]').find(input => input.dataset.setting === 'snapshotCacheTTL')!;
  expect(next.disabled).toBe(false); expect(next.value).toBe('300'); expect(editor.draft.config.snapshotCacheTTL).toBe(300);
  const persistenceAgain = elements.get('sectionFields')!.querySelectorAll('[data-setting]').find(input => input.dataset.setting === 'persistSnapshotCache')!;
  persistenceAgain.checked = true; persistenceAgain.handlers.change(); await editor.draft.flush();
  const inactive = elements.get('sectionFields')!.querySelectorAll('[data-setting]').find(input => input.dataset.setting === 'snapshotCacheTTL')!;
  expect(inactive.disabled).toBe(true); expect(inactive.value).toBe('300'); expect(editor.draft.config.snapshotCacheTTL).toBe(300);
});

it('offers compact help beside controls without making the help button toggle a checkbox', async () => {
  const { editor, elements } = mount({});
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(1);
  const fields = elements.get('sectionFields')!;
  const input = fields.querySelectorAll('[data-setting]').find(item => item.dataset.setting === 'exposeTemperature')!;
  const button = fields.querySelectorAll('button').find(item => item.attributes['aria-describedby'] === input.attributes['aria-describedby'])!;
  const tip = fields.querySelectorAll('span').find(item => item.id === input.attributes['aria-describedby'])!;
  expect(button.attributes['aria-label']).toMatch(/help/i);
  expect(fields.querySelectorAll('label').some(label => label.querySelectorAll('button').includes(button))).toBe(false);
  expect(tip.hidden).toBe(true); button.handlers.focus(); expect(tip.hidden).toBe(false);
  button.handlers.blur(); expect(tip.hidden).toBe(true);
  button.handlers.click(); expect(tip.hidden).toBe(false);
  button.handlers.click(); expect(tip.hidden).toBe(true);
  expect(input.checked).toBe(false); expect(editor.draft.config).not.toHaveProperty('exposeTemperature');
});

it('keeps motion and temperature exposure together and marks unsaved changes as a warning state', async () => {
  const { editor, elements } = mount({});
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(1);
  const keys = elements.get('sectionFields')!.querySelectorAll('[data-setting]').map(input => input.dataset.setting);
  expect(keys).toEqual(expect.arrayContaining(['exposeMotionDetected', 'exposeTemperature']));
  editor.draft.set('name', 'Changed'); await editor.draft.flush();
  expect(elements.get('draftStatus')!.dataset.state).toBe('dirty');
  editor.showSection(4);
  expect(elements.get('sectionFields')!.querySelectorAll('[data-setting]').some(input => input.dataset.setting === 'exposeTemperature')).toBe(false);
});

it('presents cache bytes as exact MiB and preserves existing bytes and unknown settings until edited', async () => {
  const originalBytes = 134217729;
  const { editor, homebridge, elements } = mount({ nativeRecording: { maxCachedBytes: originalBytes, extension: 'kept' } });
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(2);
  const cache = elements.get('sectionFields')!.querySelectorAll('[data-setting]').find(input => input.dataset.setting === 'nativeRecording/maxCachedBytes')!;
  expect(Number(cache.value) * 1048576).toBe(originalBytes);
  cache.handlers.input(); await editor.draft.flush();
  expect(editor.draft.config.nativeRecording.maxCachedBytes).toBe(originalBytes);
  editor.draft.set('name', 'Changed'); await editor.draft.flush();
  expect(homebridge.updatePluginConfig.mock.calls.at(-1)![0][0].nativeRecording).toEqual({ maxCachedBytes: originalBytes, extension: 'kept' });
  for (const [text, bytes] of [['32', 33554432], ['128.5', 134742016], ['1024', 1073741824]] as const) {
    cache.value = text; cache.handlers.input(); await editor.draft.flush();
    expect(editor.draft.config.nativeRecording).toEqual({ maxCachedBytes: bytes, extension: 'kept' });
  }
  cache.value = ''; cache.handlers.input(); await editor.draft.flush();
  expect(editor.draft.config.nativeRecording).toEqual({ extension: 'kept' });
});

it.each(['31', '1025', '32.0000001', '32.000000000000000001', '-32', 'NaN', '1e2'])('keeps invalid MiB input %s visible and blocks staging', async text => {
  const validator = new SettingsValidator(() => undefined);
  const { editor, homebridge, elements } = mount({}, payload => validator.validate(payload));
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(2);
  const cache = elements.get('sectionFields')!.querySelectorAll('[data-setting]').find(input => input.dataset.setting === 'nativeRecording/maxCachedBytes')!;
  const staged = homebridge.updatePluginConfig.mock.calls.length;
  cache.value = text; cache.handlers.input(); await editor.draft.flush();
  expect(cache.value).toBe(text); expect(editor.draft.config.nativeRecording.maxCachedBytes).toBe(text);
  expect(editor.draft.state.errors.length).toBeGreaterThan(0);
  expect(homebridge.updatePluginConfig).toHaveBeenCalledTimes(staged);
});

it('allows removing an explicit module limit even when initial discovery is unavailable', async () => {
  const { editor, homebridge, elements } = mount({ syncModuleFeedLimits: [{ syncModuleId: 'unavailable', maxFeeds: 2 }] });
  await editor.draft.flush();
  homebridge.request.mockImplementation(async (path, payload?: any) => {
    if (path === '/settings/inventory') throw new Error('synthetic unavailable');
    return { revision: payload.revision, valid: true, errors: [], warnings: [] };
  });
  editor.setAccountReady(true); await tick(); editor.showSection(1);
  const remove = elements.get('sectionFields')!.querySelectorAll('button').find(button => button.textContent === 'Remove override')!;
  expect(remove.disabled).toBe(false); remove.handlers.click(); await editor.draft.flush();
  expect(editor.draft.config.syncModuleFeedLimits).toEqual([]);
});

it('keeps an invalid oversized integer raw across section navigation rather than rounding it', async () => {
  const { editor, elements } = mount({});
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(4);
  const input = elements.get('sectionFields')!.querySelectorAll('[data-setting]').find(item => item.dataset.setting === 'pollInterval')!;
  input.value = '9007199254740993'; input.handlers.input();
  editor.showSection(0); editor.showSection(4);
  expect(editor.draft.config.pollInterval).toBe('9007199254740993');
  expect(elements.get('sectionFields')!.querySelectorAll('[data-setting]').find(item => item.dataset.setting === 'pollInterval')!.value).toBe('9007199254740993');
  await editor.draft.flush();
});

it('records an unrelated browser error after a settled editor without claiming an action failed or disabling valid Save', async () => {
  const { editor, homebridge } = mount({}); await editor.draft.flush();
  editor.draft.set('name', 'Updated Blink'); await editor.draft.flush();
  const diagnostic = new Element();
  const html = source('index.html');
  const start = html.indexOf('  let browserDiagnosticCount =');
  const end = html.indexOf('  function fatal(', start);
  const context: any = { document: { getElementById: () => diagnostic } };
  runInNewContext(html.slice(start, end), context);
  context.recordBrowserDiagnostic({ type: 'error', error: { name: 'SyntaxError', message: 'do not echo this private detail' } });
  expect(diagnostic.textContent).toContain('origin unattributed');
  expect(diagnostic.textContent).not.toContain('private detail');
  expect(editor.draft.state.error).toBe(''); expect(homebridge.enableSaveButton).toHaveBeenCalled();
});

it('parses the canonical production scripts and resolves every local asset beside a packaged plugin entry point', () => {
  const html = source('index.html');
  for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (script.trim()) expect(() => new Script(script)).not.toThrow();
  const base = 'http://homebridge.invalid/plugins/settings-ui/plugin-name/public/index.html?v=1.0.0-beta1';
  for (const [, asset] of html.matchAll(/(?:src|href)="(settings[^"#]+)"/g)) {
    expect(new URL(asset, base).pathname).toBe(`/plugins/settings-ui/plugin-name/public/${asset}`);
    if (asset.endsWith('.js')) expect(() => new Script(source(asset))).not.toThrow(); else expect(source(asset).length).toBeGreaterThan(0);
  }
});

it('parses the generated synthetic host adapter before starting any preview server', () => {
  expect(execFileSync(process.execPath, [join(__dirname, '../../scripts/preview-plugin-ui.mjs'), '--check'], { encoding: 'utf8' })).toMatch(/parse/);
});

it('ends Loading and hides account/settings actions when the required host API is missing', () => {
  const ids = ['bootError', 'bootErrorMessage', 'draftStatus', 'settingsNavigation', 'connectionFlow', 'sectionFields', 'accountMaintenance', 'retryLoad'];
  const nodes = new Map(ids.map(id => [id, new Element()]));
  const html = source('index.html');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).filter(code => code.trim());
  runInNewContext(scripts[0], { window: {}, document: { getElementById: (id: string) => nodes.get(id) } });
  expect(nodes.get('draftStatus')!.textContent).not.toMatch(/Loading/);
  for (const id of ['settingsNavigation', 'connectionFlow', 'sectionFields', 'accountMaintenance']) expect(nodes.get(id)!.hidden).toBe(true);
  expect(nodes.get('retryLoad')!.hidden).toBe(false);
});


it('saves HSV through a qualified per-camera override without losing other camera settings', async () => {
  const { editor, elements } = mount({ deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', exposeTemperature: true, vendorExtension: 7 }] });
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(2);
  const choices = elements.get('sectionFields')!.querySelectorAll('input').filter(input => input.type === 'checkbox');
  choices[0].checked = true; choices[0].handlers.change(); await editor.draft.flush();
  expect(editor.draft.config.deviceSettingOverrides).toEqual([{ deviceIdentifier: 'camera:1', exposeTemperature: true, vendorExtension: 7, homeKitSecureVideo: true }]);
  expect(editor.draft.config).not.toHaveProperty('hksvCameras');
});

it('edits nested native recording bounds without creating empty camera selector rows', async () => {
  const { editor, elements } = mount({ nativeRecording: { initialDelaySeconds: 90 }, unrelated: true });
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(2);
  const retry = elements.get('sectionFields')!.querySelectorAll('input').find(input => input.dataset.setting === 'nativeRecording/maxRetries')!;
  retry.value = '0'; retry.handlers.input(); await editor.draft.flush();
  expect(editor.draft.config.nativeRecording).toEqual({ initialDelaySeconds: 90, maxRetries: 0 });
  expect(editor.draft.config.unrelated).toBe(true);
  expect(editor.draft.config).not.toHaveProperty('deviceSettingOverrides');
});


it('changes per-camera motion exposure independently of HSV and preserves inheritance', async () => {
  const { editor, elements } = mount({ exposeMotionDetected: false,
    deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', homeKitSecureVideo: true, inputQuality: 'saver' }] });
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(1);
  const card = elements.get('sectionFields')!.querySelectorAll('details').find(item => item.querySelectorAll('p').some(text => text.textContent === 'camera:1'))!;
  const label = card.querySelectorAll('label').find(item => item.textContent === 'Motion Detected in Home')!;
  const motion = card.querySelectorAll('select').find(input => input.id === label.htmlFor)!;
  motion.value = 'yes'; motion.handlers.change(); await editor.draft.flush();
  expect(editor.draft.config.deviceSettingOverrides).toEqual([{ deviceIdentifier: 'camera:1', homeKitSecureVideo: true, inputQuality: 'saver', exposeMotionDetected: true }]);
  motion.value = 'inherit'; motion.handlers.change(); await editor.draft.flush();
  expect(editor.draft.config.deviceSettingOverrides).toEqual([{ deviceIdentifier: 'camera:1', homeKitSecureVideo: true, inputQuality: 'saver' }]);
  expect(editor.draft.config.exposeMotionDetected).toBe(false);
});
