import * as fs from 'node:fs';
import * as path from 'node:path';

type SchemaDocument = {
  customUi?: boolean;
  customUiPath?: string;
  schema?: {
    required?: unknown;
    properties?: Record<string, unknown>;
  };
  layout?: Array<unknown>;
};

type PackageDocument = {
  homebridge?: {
    schema?: string;
    customUi?: string;
  };
};

const repoRoot = path.resolve('.');

const readText = (relativePath: string): string => {
  const absolutePath = path.join(repoRoot, relativePath);
  return fs.readFileSync(absolutePath, 'utf8');
};

const readJson = <T>(relativePath: string): T => {
  const absolutePath = path.join(repoRoot, relativePath);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as T;
};

const sectionBetween = (source: string, startMarker: string, endMarker: string): string => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Unable to find expected source section: ${startMarker}`);
  }
  return source.slice(start, end);
};

const findLayoutKeyReferences = (node: unknown, targetKeys: Set<string>, hits: string[] = []): string[] => {
  if (Array.isArray(node)) {
    for (const item of node) {
      findLayoutKeyReferences(item, targetKeys, hits);
    }
    return hits;
  }

  if (typeof node === 'string' && targetKeys.has(node)) {
    hits.push(node);
    return hits;
  }

  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record.key === 'string' && targetKeys.has(record.key)) {
      hits.push(record.key);
    }
    for (const value of Object.values(record)) {
      findLayoutKeyReferences(value, targetKeys, hits);
    }
  }

  return hits;
};

const collectAllLayoutKeys = (node: unknown, keys: string[] = []): string[] => {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectAllLayoutKeys(item, keys);
    }
    return keys;
  }

  if (typeof node === 'string') {
    // extract the top-level property key (strip array indexing and nested paths)
    const baseKey = node.split(/[.[]/)[0];
    keys.push(baseKey);
    return keys;
  }

  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record.key === 'string') {
      const baseKey = record.key.split(/[.[]/)[0];
      keys.push(baseKey);
      // skip nested items for array-type elements to avoid counting child paths as duplicates
      if (record.type === 'array') {
        return keys;
      }
    }
    if (record.items) {
      collectAllLayoutKeys(record.items, keys);
    }
  }

  return keys;
};

const collectBooleanRequiredPaths = (node: unknown, path = '$', hits: string[] = []): string[] => {
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) {
      collectBooleanRequiredPaths(item, `${path}[${index}]`, hits);
    }
    return hits;
  }

  if (!node || typeof node !== 'object') {
    return hits;
  }

  const record = node as Record<string, unknown>;
  if (typeof record.required === 'boolean') {
    hits.push(path);
  }

  for (const [key, value] of Object.entries(record)) {
    collectBooleanRequiredPaths(value, `${path}.${key}`, hits);
  }

  return hits;
};

describe('schema auth UI regression', () => {
  it('keeps custom UI enabled in package and schema metadata', () => {
    const pkg = readJson<PackageDocument>('package.json');
    const schema = readJson<SchemaDocument>('config.schema.json');

    expect(pkg.homebridge?.schema).toBe('config.schema.json');
    expect(pkg.homebridge?.customUi).toBe('dist/homebridge-ui/server.js');
    expect(schema.customUi).toBe(true);
    expect(schema.customUiPath).toBe('./dist/homebridge-ui');
  });

  it('uses Blink hosted authentication and removes every legacy credential surface', () => {
    const html = readText('src/homebridge-ui/public/index.html');

    expect(html).not.toMatch(/type=["']password["']/i);
    expect(html).not.toContain("homebridge.request('/login'");
    expect(html).not.toContain("type: '2fa'");
    expect(html).not.toMatch(/id=["']username["']/i);
    expect(html).toContain("homebridge.request('/auth/start'");
    expect(html).toContain("homebridge.request('/auth/complete'");
    expect(html).toContain("window.open('about:blank', '_blank'");
    expect(html).toContain('blinkWindow.opener = null');
    expect(html).toContain('navigator.clipboard.readText()');
    expect(html).toContain('manualCallbackForm');
    expect(html).toContain('callbackInput.value =');
    expect(html).toContain('delete config.username');
    expect(html).toContain('delete config.password');
    expect(html).toContain('delete config.twoFactorCode');
    expect(html).toContain('delete config.clientVerificationCode');
    expect(html).toContain('delete config.accountVerificationCode');
    expect(html).toContain('Blink tokens are stored');
    expect(html).toContain('data.verified === false');
    expect(html).not.toContain('Your credentials have been saved');
  });

  it('opens a no-opener popup before the first await and uses only the returned authorization URL', () => {
    const html = readText('src/homebridge-ui/public/index.html');
    const handler = sectionBetween(
      html,
      "startAuthButton.addEventListener('click', async () => {",
      "pasteCallbackButton.addEventListener('click', async () => {",
    );

    const popupIndex = handler.indexOf("window.open('about:blank', '_blank'");
    const openerIndex = handler.indexOf('blinkWindow.opener = null');
    const firstAwaitIndex = handler.indexOf('await ');
    expect(html).toContain('maxlength="128"');
    expect(html).toContain('pattern="[A-Za-z0-9._-]+"');
    expect(handler).toContain('/^[A-Za-z0-9._-]{1,128}$/.test(deviceIdValue)');
    expect(handler).toContain("deviceIdValue = document.getElementById('deviceId').value.trim() || 'homebridge-blink'");
    expect(handler).toContain('deviceId: deviceIdValue');
    expect(handler).not.toContain("deviceId: deviceIdValue || 'homebridge-blink'");
    expect(popupIndex).toBeGreaterThanOrEqual(0);
    expect(openerIndex).toBeGreaterThan(popupIndex);
    expect(firstAwaitIndex).toBeGreaterThan(openerIndex);
    expect(handler).toContain('blinkWindow.location.replace(response.authorizationUrl)');
    expect(handler.match(/fallbackLink\.href\s*=\s*[^;]+/g) ?? []).toEqual([
      'fallbackLink.href = response.authorizationUrl',
    ]);
  });

  it('reads the clipboard only in its click handler and clears callback values before awaiting completion', () => {
    const html = readText('src/homebridge-ui/public/index.html');
    const clipboardHandler = sectionBetween(
      html,
      "pasteCallbackButton.addEventListener('click', async () => {",
      "manualCallbackForm.addEventListener('submit', async (event) => {",
    );
    const completion = sectionBetween(
      html,
      'async function completeHostedAuth(callbackUrl) {',
      'function isPlausibleBlinkCallback(callbackUrl) {',
    );
    const manualHandler = sectionBetween(
      html,
      "manualCallbackForm.addEventListener('submit', async (event) => {",
      'async function completeHostedAuth(callbackUrl) {',
    );

    expect(html.match(/navigator\.clipboard\.readText\(\)/g) ?? []).toHaveLength(1);
    expect(clipboardHandler).toContain('navigator.clipboard.readText()');
    expect(clipboardHandler).toContain("manualCallbackForm.classList.remove('hidden')");
    expect(clipboardHandler).toContain('callbackInput.focus()');
    const guardSetIndex = clipboardHandler.indexOf('completionInFlight = true');
    const clipboardReadIndex = clipboardHandler.indexOf('navigator.clipboard.readText()');
    const guardResetIndex = clipboardHandler.indexOf('completionInFlight = false', clipboardReadIndex);
    expect(clipboardHandler).toContain('if (completionInFlight)');
    expect(guardSetIndex).toBeGreaterThanOrEqual(0);
    expect(clipboardReadIndex).toBeGreaterThan(guardSetIndex);
    expect(guardResetIndex).toBeGreaterThan(clipboardReadIndex);
    const completionCallIndex = clipboardHandler.indexOf('const completionPromise = completeHostedAuth(pastedResult)');
    const pastedClearIndex = clipboardHandler.indexOf("pastedResult = ''", completionCallIndex);
    const completionAwaitIndex = clipboardHandler.indexOf('await completionPromise', pastedClearIndex);
    expect(completionCallIndex).toBeGreaterThanOrEqual(0);
    expect(pastedClearIndex).toBeGreaterThan(completionCallIndex);
    expect(completionAwaitIndex).toBeGreaterThan(pastedClearIndex);
    expect(manualHandler).toContain('if (completionInFlight)');
    expect(manualHandler).toContain('completionInFlight = true');
    expect(manualHandler).toContain('await completeHostedAuth(callbackInput.value)');
    expect(manualHandler).toContain('completionInFlight = false');

    const requestIndex = completion.indexOf("homebridge.request('/auth/complete'");
    const submittedClearIndex = completion.indexOf("submitted = ''", requestIndex);
    const responseAwaitIndex = completion.indexOf('await completionRequest');
    expect(requestIndex).toBeGreaterThanOrEqual(0);
    expect(submittedClearIndex).toBeGreaterThan(requestIndex);
    expect(responseAwaitIndex).toBeGreaterThan(submittedClearIndex);
    expect(completion).not.toContain("await homebridge.request('/auth/complete'");
    expect(completion).toContain("callbackUrl = ''");
    expect(completion).toContain("callbackInput.value = ''");
    expect(completion.indexOf("activeFlowId = ''", responseAwaitIndex)).toBeGreaterThan(responseAwaitIndex);
  });

  it('keeps callbacks out of browser storage, plugin config, logs, and events', () => {
    const html = readText('src/homebridge-ui/public/index.html');

    expect(html).not.toMatch(/(?:localStorage|sessionStorage)\s*\.\s*setItem\s*\([^)]*(?:callback|code|state|token)/is);
    expect(html).not.toMatch(/config\.[A-Za-z0-9_]+\s*=\s*(?:callbackUrl|submitted|activeFlowId|callbackInput)/);
    expect(html).not.toMatch(/(?:console\.(?:log|warn|error)|addLog|dispatchEvent)\s*\([^)]*(?:callbackUrl|submitted|activeFlowId)/s);
  });

  it('retains only client/account verification and saves sanitized token-only config before success', () => {
    const html = readText('src/homebridge-ui/public/index.html');
    const saveConfig = sectionBetween(
      html,
      'async function saveTokenOnlyConfig(data) {',
      'async function handleAuthResponse(data) {',
    );
    const authResponse = sectionBetween(
      html,
      'async function handleAuthResponse(data) {',
      'async function refreshAuthStatus() {',
    );

    expect(html).toContain("type !== 'client' && type !== 'account'");
    expect(html).not.toContain("handleVerificationRequired('2fa'");
    expect(saveConfig).toContain("config.deviceId = deviceIdValue || config.deviceId || 'homebridge-blink'");
    expect(saveConfig).not.toContain("document.getElementById('deviceId').value.trim()");
    expect(saveConfig).toContain("config.tier = data.tier || config.tier || 'prod'");
    expect(saveConfig).toContain('config.persistAuth = true');
    expect(saveConfig).toContain('delete config.email');
    expect(saveConfig.indexOf('await homebridge.updatePluginConfig(pluginConfig)')).toBeGreaterThanOrEqual(0);
    expect(saveConfig.indexOf('await homebridge.savePluginConfig()')).toBeGreaterThan(
      saveConfig.indexOf('await homebridge.updatePluginConfig(pluginConfig)'),
    );
    expect(authResponse.indexOf('await saveTokenOnlyConfig(data)')).toBeLessThan(
      authResponse.indexOf("showStep('success')"),
    );
    expect(authResponse).toContain('if (data.verified === false)');
    expect(authResponse).toContain("handleVerificationRequired('client', data)");
    expect(authResponse).toContain("handleVerificationRequired('account', data)");
    expect(authResponse).toContain("showStep('success')");
  });

  it('locally rejects malformed callbacks while deferring OAuth state semantics to the server', () => {
    const html = readText('src/homebridge-ui/public/index.html');
    const validation = sectionBetween(
      html,
      'function isPlausibleBlinkCallback(callbackUrl) {',
      'function resetHostedFlow() {',
    );
    const completion = sectionBetween(
      html,
      'async function completeHostedAuth(callbackUrl) {',
      'function isPlausibleBlinkCallback(callbackUrl) {',
    );

    expect(validation).toContain("url.protocol !== 'https:'");
    expect(validation).toContain("url.hostname !== 'applinks.blink.com'");
    expect(validation).toContain("callbackUrl.startsWith('https://applinks.blink.com/signin/callback?')");
    expect(validation).toContain('new TextEncoder().encode(callbackUrl).length > 2048');
    expect(validation).toContain('codeUnit <= 0x20 || codeUnit === 0x23 || codeUnit === 0x7f');
    expect(validation).toContain("url.port !== ''");
    expect(validation).toContain("url.username !== ''");
    expect(validation).toContain("url.password !== ''");
    expect(validation).toContain("url.pathname !== '/signin/callback'");
    expect(validation).toContain("url.hash !== ''");
    expect(validation).toContain("url.searchParams.getAll('state')");
    expect(validation).toContain("url.searchParams.getAll('code')");
    expect(validation).toContain("url.searchParams.getAll('error')");
    expect(validation).toContain("url.searchParams.getAll('error_description')");
    expect(validation).toContain('codes.length > 0 && errors.length > 0');
    expect(validation).toContain('errorDescriptions.length === 1 && !hasError');
    expect(validation).not.toContain('states[0].length > 0');
    const validate = new Function(`${validation}\nreturn isPlausibleBlinkCallback;`)() as (value: string) => boolean;
    expect(validate('https://applinks.blink.com/signin/callback?state=opaque&code=one-time-code')).toBe(true);
    expect(validate('https://applinks.blink.com/signin/callback?state=&code=one-time-code')).toBe(true);
    expect(validate('https://applinks.blink.com/signin/callback?state=opaque&error=access_denied&error_description=denied')).toBe(true);
    for (const invalid of [
      'https://example.com/signin/callback?state=opaque&code=one-time-code',
      'HTTPS://applinks.blink.com/signin/callback?state=opaque&code=one-time-code',
      'https://applinks.blink.com/signin/./callback?state=opaque&code=one-time-code',
      'https://applinks.blink.com/signin/callback?code=one-time-code',
      'https://applinks.blink.com/signin/callback?state=opaque&state=duplicate&code=one-time-code',
      'https://applinks.blink.com/signin/callback?state=opaque&code=one-time-code&error=',
      'https://applinks.blink.com/signin/callback?state=opaque&code=one-time-code&error_description=denied',
      'https://applinks.blink.com/signin/callback?state=opaque&code=one-time-code#fragment',
      'https://applinks.blink.com/signin/callback?state=opaque&code=one-time-code\n',
    ]) {
      expect(validate(invalid)).toBe(false);
    }
    expect(completion).toContain('if (!isPlausibleBlinkCallback(callbackUrl))');
    const malformedBranch = sectionBetween(
      completion,
      'if (!isPlausibleBlinkCallback(callbackUrl))',
      'let submitted = callbackUrl;',
    );
    expect(malformedBranch).not.toContain("activeFlowId = ''");
    expect(malformedBranch).toContain("showStep('callback')");
    expect(completion).toContain('resetHostedFlow()');
  });

  it('does not expose auth credentials/codes in schema properties or layout', () => {
    const schema = readJson<SchemaDocument>('config.schema.json');
    const properties = schema.schema?.properties ?? {};

    const forbiddenFields = new Set([
      'username',
      'email',
      'password',
      'twoFactorCode',
      'clientVerificationCode',
      'accountVerificationCode',
    ]);

    for (const key of forbiddenFields) {
      expect(Object.prototype.hasOwnProperty.call(properties, key)).toBe(false);
    }

    const layoutReferences = findLayoutKeyReferences(schema.layout ?? [], forbiddenFields);
    expect(layoutReferences).toEqual([]);
  });
});

describe('schema layout integrity', () => {
  it('does not duplicate any field across layout sections', () => {
    const schema = readJson<SchemaDocument>('config.schema.json');
    const layout = schema.layout as Array<{ items?: unknown[] }>;
    const allKeys: string[] = [];

    for (const section of layout) {
      if (section.items) {
        collectAllLayoutKeys(section.items, allKeys);
      }
    }

    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const key of allKeys) {
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
  });

  it('does not expose sharedTier in schema properties or layout', () => {
    const schema = readJson<SchemaDocument>('config.schema.json');
    const properties = schema.schema?.properties ?? {};

    expect(Object.prototype.hasOwnProperty.call(properties, 'sharedTier')).toBe(false);

    const hits = findLayoutKeyReferences(schema.layout ?? [], new Set(['sharedTier']));
    expect(hits).toEqual([]);
  });

  it('exposes IMMIS TLS verification as secure-by-default streaming config', () => {
    const schema = readJson<SchemaDocument>('config.schema.json');
    const properties = schema.schema?.properties ?? {};
    const verifyImmisTls = properties.verifyImmisTls as Record<string, unknown>;

    expect(verifyImmisTls.type).toBe('boolean');
    expect(verifyImmisTls.default).toBe(true);

    const layoutReferences = findLayoutKeyReferences(schema.layout ?? [], new Set(['verifyImmisTls']));
    expect(layoutReferences).toEqual(['verifyImmisTls']);
  });

  it('uses array-based device customization instead of object additionalProperties', () => {
    const schema = readJson<SchemaDocument>('config.schema.json');
    const properties = schema.schema?.properties ?? {};

    // Old object-based patterns must not appear
    expect(Object.prototype.hasOwnProperty.call(properties, 'deviceNames')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(properties, 'deviceSettings')).toBe(false);

    // New array-based patterns must exist
    expect(Object.prototype.hasOwnProperty.call(properties, 'deviceNameOverrides')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(properties, 'deviceSettingOverrides')).toBe(true);

    const nameOverrides = properties.deviceNameOverrides as Record<string, unknown>;
    const settingOverrides = properties.deviceSettingOverrides as Record<string, unknown>;
    expect(nameOverrides.type).toBe('array');
    expect(settingOverrides.type).toBe('array');
  });

  it('uses object-level required arrays instead of per-property required booleans', () => {
    const schema = readJson<SchemaDocument>('config.schema.json');
    const rootSchema = schema.schema as Record<string, unknown>;
    const properties = (rootSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
    const nameOverrides = properties.deviceNameOverrides?.items as Record<string, unknown>;
    const settingOverrides = properties.deviceSettingOverrides?.items as Record<string, unknown>;

    expect(rootSchema.required).toEqual(['name']);
    expect(nameOverrides.required).toEqual(['deviceIdentifier', 'customName']);
    expect(settingOverrides.required).toEqual(['deviceIdentifier']);
    expect(collectBooleanRequiredPaths(schema)).toEqual([]);
  });
});
