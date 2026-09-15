import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

class Element {
  children: Element[] = [];
  handlers: Record<string, () => Promise<void>> = {};
  classList = { toggle: jest.fn() };
  checked = false;
  value = '';
  textContent = '';
  disabled = false;
  append(...children: Element[]): void { this.children.push(...children); }
  replaceChildren(): void { this.children = []; }
  addEventListener(event: string, handler: () => Promise<void>): void { this.handlers[event] = handler; }
}

it('saves stable network IDs, preserves unrelated config and unavailable exclusions, and re-enables selections', async () => {
  const elements = new Map(['loadNetworks', 'saveNetworks', 'blinkNetworkList'].map(id => [id, new Element()]));
  const original = [{ platform: 'BlinkCameras', deviceId: 'kept', excludedNetworks: ['Away', 'unavailable'] }, { platform: 'Other' }];
  const homebridge = {
    getPluginConfig: jest.fn().mockResolvedValue(original),
    request: jest.fn().mockResolvedValue([{ id: '1', name: 'Home' }, { id: '2', name: 'Away' }]),
    updatePluginConfig: jest.fn().mockResolvedValue(undefined),
    savePluginConfig: jest.fn().mockResolvedValue(undefined),
    toast: { success: jest.fn() },
  };
  const showError = jest.fn();
  const document = {
    getElementById: (id: string) => elements.get(id),
    createElement: () => new Element(),
    querySelectorAll: () => elements.get('blinkNetworkList')!.children.map(row => row.children[0]).filter(input => input.checked),
  };
  const html = readFileSync(join(__dirname, '../..', 'src/homebridge-ui/public/index.html'), 'utf8');
  const script = html.slice(html.indexOf('  let discoveredNetworks ='), html.indexOf('  function addLog('));
  runInNewContext(script, { document, homebridge, pluginConfig: original, showError });
  await elements.get('loadNetworks')!.handlers.click();
  const inputs = elements.get('blinkNetworkList')!.children.map(row => row.children[0]);
  expect(inputs.map(input => input.checked)).toEqual([false, true]);
  homebridge.getPluginConfig.mockResolvedValue([{ ...original[0], deviceId: 'newer-setting' }, { platform: 'NewerOther' }]);
  await elements.get('saveNetworks')!.handlers.click();
  expect(homebridge.updatePluginConfig).toHaveBeenLastCalledWith([
    { platform: 'BlinkCameras', deviceId: 'newer-setting', excludedNetworks: ['unavailable', '2'] }, { platform: 'NewerOther' },
  ]);
  inputs[1].checked = false;
  await elements.get('saveNetworks')!.handlers.click();
  expect(homebridge.updatePluginConfig).toHaveBeenLastCalledWith([
    { platform: 'BlinkCameras', deviceId: 'newer-setting', excludedNetworks: ['unavailable'] }, { platform: 'NewerOther' },
  ]);
  homebridge.savePluginConfig.mockRejectedValue(new Error('backend failed'));
  await elements.get('saveNetworks')!.handlers.click();
  expect(showError).toHaveBeenCalled();
  expect(elements.get('saveNetworks')!.disabled).toBe(false);
});
