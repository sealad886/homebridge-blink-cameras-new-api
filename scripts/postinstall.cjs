#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const manualMigration = 'Set UIX_STORAGE_PATH to the active Homebridge storage, or follow docs/native-recording-config-migration.md to convert the explicit config before starting with legacy settings.';

function run(environment = process.env, packageRoot = path.resolve(__dirname, '..')) {
  const scope = path.dirname(packageRoot), modules = path.dirname(scope);
  // Only an installed package may modify Homebridge configuration.
  if (path.basename(packageRoot) !== 'homebridge-blink-cameras-new-api'
    || path.basename(scope) !== '@sealad886' || path.basename(modules) !== 'node_modules') {
    return { action: 'Skipped', code: 'storage-path-unavailable' };
  }
  if (!environment.UIX_STORAGE_PATH) return { action: 'Skipped', code: 'storage-path-unavailable', message: manualMigration };
  if (!path.isAbsolute(environment.UIX_STORAGE_PATH)) return { action: 'Failed', code: 'absolute-storage-path-required' };
  const config = path.join(environment.UIX_STORAGE_PATH, 'config.json');
  let migration;
  try {
    try { fs.lstatSync(config); }
    catch (error) {
      if (error.code === 'ENOENT') return { action: 'Skipped', code: 'config-absent', message: manualMigration };
      throw error;
    }
    if (process.platform === 'win32') {
      return { action: 'Skipped', code: 'windows-manual-migration-required',
        message: 'Automatic configuration migration is unavailable on Windows. Convert legacy choices to canonical JSON before starting Homebridge.' };
    }
    migration = require('./migrate-native-recording-config.cjs');
    const plan = migration.inspect(config);
    if (plan.conversion.issues.some(issue => issue.code === 'unresolved-camera-aliases')) {
      return { action: 'Failed', code: 'unresolved-camera-aliases',
        message: 'Review camera aliases in the explicit migration preview before applying; see docs/native-recording-config-migration.md.' };
    }
    return { action: migration.apply(plan) ? 'Applied' : 'Unchanged' };
  } catch (error) {
    return { action: 'Failed', code: migration && error instanceof migration.MigrationError ? error.code : 'file-operation-failed' };
  }
}

module.exports = { run };
if (require.main === module) {
  const result = run();
  const failed = result.action === 'Failed';
  (failed ? process.stderr : process.stdout).write(JSON.stringify(result) + '\n');
  if (failed) {
    process.stderr.write('Blink configuration migration failed. Repair the saved configuration, then run scripts/migrate-native-recording-config.cjs with its explicit path and --apply.\n');
    process.exitCode = 1;
  }
}
