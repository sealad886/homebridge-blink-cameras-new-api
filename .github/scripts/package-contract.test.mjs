import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { MIGRATION_ENTRYPOINTS, verifyPluginPackageContract, verifyPackagedMigrations } from './package-contract.mjs';
function fixture() {
  const manifest = { keywords: ['homebridge-plugin', 'supports-hap'], scripts: { build: 'tsc', prepublishOnly: 'npm run build' },
    dependencies: { example: '1.0.0' }, devDependencies: {} };
  const lock = { packages: { '': { dependencies: { ...manifest.dependencies }, devDependencies: {} } } };
  return { manifest, lock, paths: [...MIGRATION_ENTRYPOINTS] };
}
test('accepts declared HAP support, explicit migration entrypoints and ordinary build scripts', () => {
  const f = fixture(); verifyPluginPackageContract(f.manifest, f.lock, f.paths);
});
for (const keyword of ['homebridge-plugin', 'supports-hap']) test(`refuses omitted ${keyword} discovery/transport declaration`, () => {
  const f = fixture(); f.manifest.keywords = f.manifest.keywords.filter(value => value !== keyword);
  assert.throws(() => verifyPluginPackageContract(f.manifest, f.lock, f.paths), /HAP transport/);
});
for (const hook of ['preinstall', 'install', 'postinstall', 'preuninstall', 'uninstall', 'postuninstall']) test(`refuses automatic ${hook}, including an empty command`, () => {
  for (const value of ['', 'node automatically-change-config.cjs']) {
    const f = fixture(); f.manifest.scripts[hook] = value;
    assert.throws(() => verifyPluginPackageContract(f.manifest, f.lock, f.paths), /lifecycle hook/);
  }
});
test('refuses root installation metadata and drifted dependencies', () => {
  const f = fixture(); f.lock.packages[''].hasInstallScript = true;
  assert.throws(() => verifyPluginPackageContract(f.manifest, f.lock, f.paths), /install script/);
  delete f.lock.packages[''].hasInstallScript; f.lock.packages[''].dependencies.example = '2.0.0';
  assert.throws(() => verifyPluginPackageContract(f.manifest, f.lock, f.paths), /production dependencies/);
});
for (const path of ['scripts/postinstall.cjs', 'scripts/preuninstall.js']) test(`refuses shipped obsolete wrapper ${path}`, () => {
  const f = fixture(); f.paths.push(path); assert.throws(() => verifyPluginPackageContract(f.manifest, f.lock, f.paths), /Retired automatic wrapper/);
});
for (const path of MIGRATION_ENTRYPOINTS) test(`requires packaged migration ${path}`, () => {
  const f = fixture(); f.paths = f.paths.filter(value => value !== path); assert.throws(() => verifyPluginPackageContract(f.manifest, f.lock, f.paths), /explicit migration/);
});
test('compiled package migration entrypoints preserve preview, explicit apply, exact backup and idempotence', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const result = verifyPackagedMigrations(root); assert.equal(result.entrypoints, 2);
  assert.equal(result.mode, process.platform === 'win32' ? 'conversion-only-posix-writer-refused' : 'preview-apply-backup-idempotence');
});
