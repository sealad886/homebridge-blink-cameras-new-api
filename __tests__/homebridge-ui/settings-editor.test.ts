import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext, Script } from 'node:vm';
import { execFileSync } from 'node:child_process';
import { SettingsValidator } from '../../src/homebridge-ui/settings-validation';
import type { SettingsInventory } from '../../src/settings-inventory';
import { composeRecordingReadiness, unknownHomeRecordingObservation } from '../../src/recording-readiness';
import type { NativeClipActivity } from '../../src/native-clip-recorder';

class Element {
  children: Element[] = [];
  handlers: Record<string, () => unknown> = {};
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  classList = { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() };
  hidden = false; open = false; checked = false; disabled = false; value = ''; textContent = ''; id = ''; type = ''; inputMode = ''; className = ''; htmlFor = '';
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
function mount(config: Record<string, unknown>) {
  const elements = new Map(['settingsNavigation', 'sectionFields', 'connectionFlow', 'accountMaintenance', 'sectionTitle', 'draftStatus', 'settingsErrors', 'inventoryStatus', 'retrySettings', 'accountDraftWarning', 'settingsWarnings'].map(id => [id, new Element()]));
  const document = { createElement: (tag: string) => new Element(tag), getElementById: (id: string) => elements.get(id) };
  // The real Homebridge page uses ordinary HTTP; neither WebCrypto nor a
  // browser-generated settings hash is available to this recording flow.
  const context: any = { window: { crypto: undefined }, crypto: undefined, document, structuredClone, setTimeout, clearTimeout };
  runInNewContext(source('settings-state.js'), context);
  runInNewContext(source('settings-ui.js'), context);
  const inventory = { revision: '1', fetchedAt: '2026-11-02T00:00:00Z', networks: [{ id: '10', name: 'Home', armed: true }],
    syncModules: [{ id: '100', networkId: '10', status: 'online' }], cameras } as SettingsInventory;
  const validator = new SettingsValidator(() => inventory);
  const homebridge = {
    request: jest.fn(async (path: string, payload?: any) => path === '/settings/inventory'
      ? { revision: '1', fetchedAt: '2026-11-02T00:00:00Z', networks: [{ id: '10', name: 'Home', armed: true }], syncModules: [{ id: '100', networkId: '10', status: 'online' }], cameras }
      : path === '/settings/recording-health' ? { state: 'missing', checkedAt: '2026-11-03T00:00:00Z' }
        : validator.validate(payload)),
    updatePluginConfig: jest.fn().mockResolvedValue(undefined), enableSaveButton: jest.fn(), disableSaveButton: jest.fn(),
  };
  const schema = JSON.parse(readFileSync(join(__dirname, '../../config.schema.json'), 'utf8'));
  const editor = context.window.BlinkSettingsUI.mount(homebridge, schema, [{ platform: 'BlinkCameras', name: 'Blink', ...config }]);
  return { editor, homebridge, elements, inventory };
}

it('enables a walk test only for applied current Home permissions and a complete camera baseline, while refresh preserves draft and opened details', async () => {
  const config = { hksvCameras: ['camera:1'] }, f = mount(config);
  const initial = f.homebridge.request.getMockImplementation()!;
  const activity: NativeClipActivity = { updatedAt: new Date().toISOString(), queue: 0, active: 0, mediaBytes: 0, reservedBytes: 0, preparationLimit: 1,
    modules: [], cameras: [{ id: '0000000000000000', key: 'camera:1', label: 'Same', baseline: 'pending', queued: 0, delivered: 0, uncertain: 0 }] };
  const home = { ...unknownHomeRecordingObservation(), configuration: 'configured' as const, recordingActive: true, cameraActive: true, audioActive: false, triggerTypes: [1] };
  let result: any;
  const update = () => { result = { state: 'available', health: composeRecordingReadiness({ config, inventory: f.inventory, runtime: 'running', activity,
    observations: new Map([['camera:1', { home, status: { state: 'off' } }]]) }) }; };
  update();
  f.homebridge.request.mockImplementation(async (path, payload) => path === '/settings/recording-health' ? result : initial(path, payload));
  f.editor.setAccountReady(true); await tick(); await f.editor.draft.flush(); f.editor.showSection(2); await tick();
  const fields = f.elements.get('sectionFields')!;
  const testButton = () => fields.querySelectorAll('button').find(button => button.dataset.walkTest)!;
  expect(testButton().disabled).toBe(true);
  activity.cameras[0].baseline = 'complete'; update(); await f.editor.refreshRecordingHealth();
  expect(testButton().disabled).toBe(false);
  for (const change of [{ state: 'stale' }, { state: 'missing' }, { state: 'unsupported' },
    { state: 'available', health: { ...result.health, version: 1 } },
    { state: 'available', health: { ...result.health, settingsRevision: 'old' } }]) {
    result = change; await f.editor.refreshRecordingHealth(); expect(testButton().disabled).toBe(true);
    expect(f.homebridge.enableSaveButton).toHaveBeenCalled();
  }
  home.cameraActive = false; update(); await f.editor.refreshRecordingHealth(); expect(testButton().disabled).toBe(true);
  home.cameraActive = true; home.triggerTypes = [2]; update(); await f.editor.refreshRecordingHealth(); expect(testButton().disabled).toBe(true);
  home.triggerTypes = [1]; update(); await f.editor.refreshRecordingHealth();
  const detail = fields.querySelectorAll('details').find(item => item.dataset.expansionKey)!; detail.open = true;
  f.editor.draft.set('pollInterval', 120); await f.editor.draft.flush();
  const before = structuredClone(f.editor.blocks); await f.editor.refreshRecordingHealth();
  expect(testButton().disabled).toBe(true); expect(f.editor.blocks).toEqual(before);
  expect(f.elements.get('sectionTitle')!.textContent).toMatch(/recording/i);
  expect(fields.querySelectorAll('details').find(item => item.dataset.expansionKey === detail.dataset.expansionKey)!.open).toBe(true);
});

it('renders a valid zero-selection recording picker without adding a blank selector', async () => {
  const { editor, homebridge, elements } = mount({ unrelated: 'kept' });
  editor.setAccountReady(true); await tick(); await editor.draft.flush();
  editor.showSection(2);
  const checkboxes = elements.get('sectionFields')!.querySelectorAll('input').filter(input => input.type === 'checkbox');
  expect(checkboxes).toHaveLength(2); expect(checkboxes.every(input => !input.checked)).toBe(true);
  expect(editor.draft.config).not.toHaveProperty('hksvCameras');
  editor.draft.set('pollInterval', 120); await editor.draft.flush();
  expect(homebridge.updatePluginConfig).toHaveBeenLastCalledWith([expect.objectContaining({ unrelated: 'kept', pollInterval: 120 })]);
  expect(homebridge.updatePluginConfig.mock.calls.at(-1)![0][0]).not.toHaveProperty('hksvCameras');
});

it('opens first-use setup, progressively discloses it for existing selections, and preserves an explicit expansion choice on refresh', async () => {
  const fresh = mount({}); fresh.editor.setAccountReady(true); await tick(); await fresh.editor.draft.flush(); fresh.editor.showSection(2); await tick();
  const setup = () => fresh.elements.get('sectionFields')!.querySelectorAll('details').find(item => item.dataset.expansionKey === 'recording:setup')!;
  expect(setup().open).toBe(true);
  setup().open = false; await fresh.editor.refreshRecordingHealth(); expect(setup().open).toBe(false);
  const selected = mount({ hksvCameras: ['camera:1'] }); selected.editor.setAccountReady(true); await tick(); await selected.editor.draft.flush(); selected.editor.showSection(2); await tick();
  const selectedSetup = () => selected.elements.get('sectionFields')!.querySelectorAll('details').find(item => item.dataset.expansionKey === 'recording:setup')!;
  expect(selectedSetup().open).toBe(false);
  selectedSetup().open = true; await selected.editor.refreshRecordingHealth(); expect(selectedSetup().open).toBe(true);
});

it('retains per-selected status rows for excluded and unresolved cameras without materializing invalid config', async () => {
  const { editor, elements } = mount({ hksvCameras: ['camera:1', 'owl:1', 'Unavailable camera'], excludeDevices: ['camera:1'] });
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(2); await tick();
  const buttons = elements.get('sectionFields')!.querySelectorAll('button').filter(button => button.dataset.walkTest);
  expect(buttons).toHaveLength(3); expect(buttons.every(button => button.disabled)).toBe(true);
  expect(editor.draft.state.recording.selections.map((row: { selection: string }) => row.selection)).toEqual(['excluded', 'unavailable', 'unresolved']);
  expect(editor.draft.state.valid).toBe(true);
  expect(editor.draft.config.hksvCameras).toEqual(['camera:1', 'owl:1', 'Unavailable camera']);
});

it('keeps recording defaults implicit through render, discovery and global source changes', async () => {
  const { editor, elements } = mount({ futureSetting: true });
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(2);
  expect(editor.draft.config).not.toHaveProperty('hksvSource');
  expect(editor.draft.config).not.toHaveProperty('syncModuleRecording');
  const sourceControl = elements.get('sectionFields')!.querySelectorAll('select').find(input => input.dataset.setting === 'hksvSource')!;
  expect(sourceControl.value).toBe('saved-clips');
  sourceControl.value = 'continuous'; sourceControl.handlers.change(); await editor.draft.flush();
  await editor.refreshInventory(); editor.showSection(1); editor.showSection(2);
  expect(editor.draft.config).toEqual({ platform: 'BlinkCameras', name: 'Blink', futureSetting: true, hksvSource: 'continuous' });
  expect(new SettingsValidator(() => undefined).validate({ revision: 1, config: editor.draft.config }).valid).toBe(true);
});

it('writes only explicit module recording fields and removes an override when all fields inherit', async () => {
  const { editor, elements } = mount({});
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(2);
  const moduleSource = () => elements.get('sectionFields')!.querySelectorAll('select').find(input => input.dataset.setting === 'syncModuleRecording')!;
  const poll = () => elements.get('sectionFields')!.querySelectorAll('input').find(input => input.dataset.setting === 'syncModuleRecording')!;
  expect(moduleSource().value).toBe('inherit');
  moduleSource().value = 'continuous'; moduleSource().handlers.change(); await editor.draft.flush();
  expect(editor.draft.config.syncModuleRecording).toEqual([{ syncModuleId: '100', source: 'continuous' }]);
  moduleSource().value = 'inherit'; moduleSource().handlers.change(); await editor.draft.flush();
  expect(editor.draft.config.syncModuleRecording).toEqual([]);
  poll().value = '45'; poll().handlers.input(); await editor.draft.flush();
  expect(editor.draft.config.syncModuleRecording).toEqual([{ syncModuleId: '100', pollIntervalSeconds: 45 }]);
  poll().value = ''; poll().handlers.input(); await editor.draft.flush();
  expect(editor.draft.config.syncModuleRecording).toEqual([]);
  expect(new SettingsValidator(() => undefined).validate({ revision: 1, config: editor.draft.config }).valid).toBe(true);
});

it('shows and removes only real unavailable recording overrides when discovery is unavailable', async () => {
  const { editor, homebridge, elements } = mount({ syncModuleRecording: [{ syncModuleId: '999', source: 'continuous' }], other: 'preserved' });
  homebridge.request.mockImplementation(async (path, payload?: any) => {
    if (path === '/settings/inventory') throw new Error('Discovery unavailable');
    if (path === '/settings/recording-health') return { state: 'missing', checkedAt: '2026-11-03T00:00:00Z' };
    return { revision: payload.revision, valid: true, errors: [], warnings: [] };
  });
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(2); await tick();
  const button = elements.get('sectionFields')!.querySelectorAll('button').find(item => item.dataset.recordingRemove === '999')!;
  button.handlers.click(); await editor.draft.flush();
  expect(editor.draft.config.syncModuleRecording).toEqual([]);
  expect(editor.draft.config.other).toBe('preserved');
  expect(elements.get('sectionFields')!.querySelectorAll('button').some(item => item.dataset.recordingRemove)).toBe(false);
});

it('keeps a valid Save and draft unchanged when recording health cannot be read', async () => {
  const { editor, homebridge, elements } = mount({});
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(2); await tick();
  const before = structuredClone(editor.blocks);
  homebridge.request.mockImplementation(async () => { throw new Error('private health details'); });
  await editor.refreshRecordingHealth();
  expect(editor.blocks).toEqual(before);
  expect(editor.draft.state.error).toBe('');
  expect(homebridge.enableSaveButton).toHaveBeenCalled();
  expect(elements.get('sectionFields')!.querySelectorAll('p').some(item => /could not be read/.test(item.textContent))).toBe(true);
  expect(elements.get('sectionFields')!.querySelectorAll('p').some(item => item.textContent.includes('private health details'))).toBe(false);
});

it('keeps excluded cameras discoverable and re-includes one while preserving unavailable exclusions', async () => {
  const { editor, elements } = mount({ excludeDevices: ['camera:1', 'unavailable'], extension: true });
  editor.setAccountReady(true); await tick(); await editor.draft.flush(); editor.showSection(1);
  const checks = elements.get('sectionFields')!.querySelectorAll('input').filter(input => input.type === 'checkbox');
  expect(checks).toHaveLength(3); expect(checks[1].checked).toBe(false);
  checks[1].checked = true; checks[1].handlers.change(); await editor.draft.flush();
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
  const temperature = elements.get('sectionFields')!.querySelectorAll('select').find(input => input.children.some(option => option.value === 'inherit'))!;
  expect(temperature.value).toBe('inherit');
  temperature.value = 'no'; temperature.handlers.change(); await editor.draft.flush();
  expect(editor.draft.config.deviceSettingOverrides).toEqual([{ deviceIdentifier: 'camera:1', vendorExtension: 7, motionTimeout: 45, exposeTemperature: false }]);
  temperature.value = 'inherit'; temperature.handlers.change(); await editor.draft.flush();
  expect(editor.draft.config.deviceSettingOverrides).toEqual([{ deviceIdentifier: 'camera:1', vendorExtension: 7, motionTimeout: 45 }]);
});

it('retains the last camera list and selectors when discovery fails', async () => {
  const { editor, homebridge, elements } = mount({ hksvCameras: ['missing', 'owl:1'] });
  editor.setAccountReady(true); await tick(); await editor.draft.flush();
  homebridge.request.mockImplementation(async () => { throw new Error('synthetic discovery failure'); });
  await editor.refreshInventory(); editor.showSection(2);
  expect(editor.draft.config.hksvCameras).toEqual(['missing', 'owl:1']);
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
    settings: editor, homebridge, lockAuthBtn: lock, getLatestPluginConfig: async () => editor.blocks,
    pluginConfig: editor.blocks, updateLockUI: jest.fn(), showError: jest.fn(),
    setAuthLockVisibility: jest.fn(), pendingAuthConfig: null, resetHostedFlow: jest.fn(),
    document: { getElementById: () => new Element() },
  };
  const html = source('index.html');
  const unlock = runInNewContext(html.slice(html.indexOf("  lockAuthBtn.addEventListener('click'"), html.indexOf("  unlockAuthBtn.addEventListener('click'")) + '\nrestartAuthentication', context) as () => Promise<void>;
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
