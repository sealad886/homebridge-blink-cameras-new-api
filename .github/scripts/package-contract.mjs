/** Distribution metadata and explicit migration behavior required by Homebridge verification. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

export const MIGRATION_ENTRYPOINTS = Object.freeze(['scripts/migrate-native-recording-config.cjs', 'scripts/migrate-secure-media-config.cjs']);
const forbiddenHooks = ['preinstall', 'install', 'postinstall', 'preuninstall', 'uninstall', 'postuninstall'];
const retiredWrappers = ['scripts/postinstall.cjs', 'scripts/preuninstall.js'];
export function verifyPluginPackageContract(manifest, lock, paths) {
  assert(Array.isArray(manifest.keywords) && manifest.keywords.includes('homebridge-plugin') && manifest.keywords.includes('supports-hap'),
    'Package must declare Homebridge HAP transport support');
  for (const hook of forbiddenHooks) assert(!Object.hasOwn(manifest.scripts ?? {}, hook), `Automatic package lifecycle hook refused: ${hook}`);
  assert.equal(lock.packages?.['']?.hasInstallScript, undefined, 'Root lockfile must not advertise an install script');
  assert.deepEqual(lock.packages?.['']?.dependencies, manifest.dependencies, 'Locked production dependencies differ from manifest');
  assert.deepEqual(lock.packages?.['']?.devDependencies, manifest.devDependencies, 'Locked development dependencies differ from manifest');
  for (const path of retiredWrappers) assert(!paths.includes(path), `Retired automatic wrapper must not ship: ${path}`);
  for (const path of MIGRATION_ENTRYPOINTS) assert(paths.includes(path), `Package is missing explicit migration: ${path}`);
}

/** Exercise the scripts extracted from npm, with isolated synthetic files only.
 * Preview never writes; apply is an explicit command with private exact-byte backup.
 * Windows supports loading/conversion while the guarded POSIX writer refuses mutation. */
export function verifyPackagedMigrations(packageRoot) {
  const requireInstalled = createRequire(join(packageRoot, 'package.json'));
  const migration = requireInstalled(join(packageRoot, MIGRATION_ENTRYPOINTS[0]));
  const historical = requireInstalled(join(packageRoot, MIGRATION_ENTRYPOINTS[1]));
  for (const name of ['convert', 'inspect', 'apply', 'main']) assert.equal(typeof migration[name], 'function', `Missing packaged migration API: ${name}`);
  assert.equal(typeof historical.convertSecureMediaSettings, 'function');
  const scratch = mkdtempSync(join(tmpdir(), 'blink-packaged-migrations-'));
  try {
    for (const [index, entrypoint] of MIGRATION_ENTRYPOINTS.entries()) {
      const directory = join(scratch, String(index)); mkdirSync(directory, { mode: 0o700 });
      const file = join(directory, 'config.json');
      const bytes = Buffer.from('{ "platforms": [{"platform":"OtherPlugin","custom":true}, {"platform":"BlinkCameras","enableMotionPolling":false,"ffmpegDebug":true,"ffmpegPath":"/explicit/ffmpeg","hksvCameras":["camera:12"],"custom":"preserved"}] }\n');
      writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' });
      const script = join(packageRoot, entrypoint);
      const run = args => execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 10000,
        env: { UIX_STORAGE_PATH: directory }, stdio: ['ignore', 'pipe', 'pipe'] });
      const missing = (() => { try { run([]); return false; } catch (error) { return error.status === 2; } })();
      assert(missing, 'Migration requires an explicitly selected configuration');
      assert(readFileSync(file).equals(bytes)); assert.deepEqual(readdirSync(directory), ['config.json']);
      if (process.platform === 'win32') {
        assert.throws(() => migration.inspect(file), /posix-required/);
        assert.equal(migration.convert(JSON.parse(bytes)).conflicts, 0); continue;
      }
      assert.equal(JSON.parse(run([file])).action, 'Preview');
      assert(readFileSync(file).equals(bytes)); assert.deepEqual(readdirSync(directory), ['config.json']);
      assert.equal(JSON.parse(run([file, '--apply'])).action, 'Applied');
      const backup = readdirSync(directory).filter(name => name.includes('.native-recording-backup-'));
      assert.equal(backup.length, 1); assert(readFileSync(join(directory, backup[0])).equals(bytes));
      assert.equal(statSync(join(directory, backup[0])).mode & 0o777, 0o600);
      assert.deepEqual(JSON.parse(readFileSync(file)), { platforms: [{ platform: 'OtherPlugin', custom: true }, {
        platform: 'BlinkCameras', exposeMotionDetected: false, mediaDebug: true, ffmpegPath: '/explicit/ffmpeg',
        deviceSettingOverrides: [{ deviceIdentifier: 'camera:12', homeKitSecureVideo: true }], custom: 'preserved',
      }] });
      const migrated = readFileSync(file);
      assert.equal(JSON.parse(run([file, '--apply'])).action, 'Unchanged'); assert(readFileSync(file).equals(migrated));
      assert.deepEqual(readdirSync(directory).filter(name => name.includes('.native-recording-backup-')), backup);
    }
    return { entrypoints: MIGRATION_ENTRYPOINTS.length, mode: process.platform === 'win32' ? 'conversion-only-posix-writer-refused' : 'preview-apply-backup-idempotence' };
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
