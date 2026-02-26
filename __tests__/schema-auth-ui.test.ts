import * as fs from 'node:fs';
import * as path from 'node:path';

type SchemaDocument = {
  customUi?: boolean;
  customUiPath?: string;
  schema?: {
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

const readJson = <T>(relativePath: string): T => {
  const absolutePath = path.join(repoRoot, relativePath);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as T;
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

describe('schema auth UI regression', () => {
  it('keeps custom UI enabled in package and schema metadata', () => {
    const pkg = readJson<PackageDocument>('package.json');
    const schema = readJson<SchemaDocument>('config.schema.json');

    expect(pkg.homebridge?.schema).toBe('config.schema.json');
    expect(pkg.homebridge?.customUi).toBe('dist/homebridge-ui/server.js');
    expect(schema.customUi).toBe(true);
    expect(schema.customUiPath).toBe('./dist/homebridge-ui');
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
});
