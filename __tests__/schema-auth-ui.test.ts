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
