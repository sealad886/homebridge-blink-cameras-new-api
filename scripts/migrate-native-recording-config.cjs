#!/usr/bin/env node
'use strict';

// Explicit local migration only. This tool never discovers a host, contacts Blink, or restarts a service.
const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const { Buffer } = require('node:buffer');
const { randomUUID } = require('node:crypto');
const { TextDecoder } = require('node:util');

const MAX_BYTES = 4 * 1024 * 1024;
const OBSOLETE_RECORDING_KEYS = ['hksvSource', 'syncModuleRecording', 'syncModuleFeedLimits'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (value, key) => Object.hasOwn(value, key);
const selector = value => typeof value === 'string' && /\S/.test(value);
const qualified = value => /^(camera|owl|doorbell):([1-9][0-9]*)$/.exec(value);

class MigrationError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/** Only shapes verified in the preserved implementation are converted. Reports contain no configuration values. */
function convert(document) {
  if (!object(document) || has(document, 'platform') ||
    (document.platforms !== undefined && !Array.isArray(document.platforms))) throw new MigrationError('invalid-document');
  const summary = { platforms: 0, changedPlatforms: 0, motionSettings: 0, hsvSettings: 0,
    explicitChoicesPreserved: 0, retiredKeys: 0, removedKeys: [] };
  const issues = [];
  let changed = false;
  const platforms = (document.platforms ?? []).map((entry, platformIndex) => {
    if (!object(entry) || entry.platform !== 'BlinkCameras') return entry;
    summary.platforms++;
    const next = { ...entry };
    const retire = key => {
      delete next[key]; summary.retiredKeys++;
      if (!summary.removedKeys.includes(key)) summary.removedKeys.push(key);
    };
    const issue = (code, severity = 'conflict') => {
      if (!issues.some(row => row.platformIndex === platformIndex && row.code === code)) {
        issues.push({ platformIndex, code, severity });
      }
    };
    if (has(next, 'hksv')) issue('unverified-hksv-shape');
    if (has(next, 'exposeMotionDetected') && typeof next.exposeMotionDetected !== 'boolean') issue('invalid-motion-choice');
    if (has(next, 'enableMotionPolling')) {
      if (typeof next.enableMotionPolling !== 'boolean') issue('invalid-legacy-motion-choice');
      else {
        if (!has(next, 'exposeMotionDetected')) { next.exposeMotionDetected = next.enableMotionPolling; summary.motionSettings++; }
        else summary.explicitChoicesPreserved++;
        retire('enableMotionPolling');
      }
    }
    const overrides = next.deviceSettingOverrides;
    const rowsValid = overrides === undefined || (Array.isArray(overrides) && overrides.every(row => object(row)
      && selector(row.deviceIdentifier) && ['exposeMotionDetected', 'homeKitSecureVideo']
        .every(key => !has(row, key) || typeof row[key] === 'boolean')));
    if (!rowsValid) issue('invalid-device-overrides');
    else if (overrides && new Set(overrides.map(row => row.deviceIdentifier)).size !== overrides.length) issue('duplicate-device-overrides');
    if (has(next, 'hksvCameras')) {
      if (!Array.isArray(next.hksvCameras) || !next.hksvCameras.every(selector) ||
        new Set(next.hksvCameras).size !== next.hksvCameras.length) issue('invalid-legacy-hsv-selection');
      else if (rowsValid) {
        const rows = (overrides ?? []).map(row => ({ ...row }));
        for (const camera of next.hksvCameras) {
          const exact = rows.find(row => row.deviceIdentifier === camera);
          const key = qualified(camera);
          const aliases = rows.filter(row => row.deviceIdentifier !== camera &&
            ((key && row.deviceIdentifier === key[2]) ||
              (/^[1-9][0-9]*$/.test(camera) && qualified(row.deviceIdentifier)?.[2] === camera)));
          if (aliases.length) issue('qualified-and-raw-id-collision');
          if (rows.some(row => row.deviceIdentifier !== camera &&
            (!qualified(row.deviceIdentifier) && !/^[1-9][0-9]*$/.test(row.deviceIdentifier) ||
              !key && !/^[1-9][0-9]*$/.test(camera)))) issue('unresolved-camera-aliases', 'warning');
          if (exact) {
            if (!has(exact, 'homeKitSecureVideo')) { exact.homeKitSecureVideo = true; summary.hsvSettings++; }
            else summary.explicitChoicesPreserved++;
          } else { rows.push({ deviceIdentifier: camera, homeKitSecureVideo: true }); summary.hsvSettings++; }
        }
        if (rows.length || overrides !== undefined) next.deviceSettingOverrides = rows;
        retire('hksvCameras');
      }
    }
    for (const key of OBSOLETE_RECORDING_KEYS) if (has(next, key)) retire(key);
    if (JSON.stringify(next) !== JSON.stringify(entry)) { changed = true; summary.changedPlatforms++; }
    return next;
  });
  return { changed, document: changed ? { ...document, platforms } : document, summary, issues,
    conflicts: issues.filter(issue => issue.severity === 'conflict').length };
}

function readBounded(descriptor) {
  const bytes = Buffer.alloc(MAX_BYTES + 1);
  let length = 0;
  for (;;) {
    const count = fs.readSync(descriptor, bytes, length, bytes.length - length, length);
    length += count;
    if (length > MAX_BYTES) throw new MigrationError('oversized-input');
    if (!count) return bytes.subarray(0, length);
  }
}

function sameVersion(a, b) {
  return a.isFile() && b.isFile() && ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'mode', 'uid', 'gid']
    .every(key => a[key] === b[key]);
}

/** Keep inspection and application separate so callers can detect changes after previewing a plan. */
function inspect(filename) {
  if (process.platform === 'win32') throw new MigrationError('posix-required');
  const config = path.resolve(filename);
  const original = fs.lstatSync(config);
  if (!original.isFile() || original.isSymbolicLink()) throw new MigrationError('regular-file-required');
  const descriptor = fs.openSync(config, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const opened = fs.fstatSync(descriptor);
    if (!sameVersion(original, opened)) throw new MigrationError('concurrent-change');
    const bytes = readBounded(descriptor);
    if (!sameVersion(opened, fs.fstatSync(descriptor)) || !sameVersion(opened, fs.lstatSync(config))) {
      throw new MigrationError('concurrent-change');
    }
    let document;
    try { document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new MigrationError('invalid-json'); }
    return { config, original: opened, bytes, conversion: convert(document) };
  } finally { fs.closeSync(descriptor); }
}

function verifyUnchanged(plan) {
  const current = fs.lstatSync(plan.config);
  if (!sameVersion(plan.original, current)) throw new MigrationError('concurrent-change');
  const descriptor = fs.openSync(plan.config, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  try {
    if (!sameVersion(plan.original, fs.fstatSync(descriptor)) || !readBounded(descriptor).equals(plan.bytes) ||
      !sameVersion(plan.original, fs.fstatSync(descriptor)) || !sameVersion(plan.original, fs.lstatSync(plan.config))) {
      throw new MigrationError('concurrent-change');
    }
  } finally { fs.closeSync(descriptor); }
}

function writePrivate(filename, bytes, owner) {
  const descriptor = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL |
    (fs.constants.O_NOFOLLOW ?? 0), 0o600);
  let complete = false;
  try {
    fs.fchownSync(descriptor, owner.uid, owner.gid); fs.fchmodSync(descriptor, 0o600);
    fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); complete = true;
  } finally {
    fs.closeSync(descriptor);
    if (!complete) fs.unlinkSync(filename);
  }
}

function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

function apply(plan) {
  if (plan.conversion.conflicts) throw new MigrationError('conversion-conflict');
  if (!plan.conversion.changed) return false;
  verifyUnchanged(plan);
  const directory = path.dirname(plan.config);
  const identity = randomUUID();
  const backup = `${plan.config}.native-recording-backup-${identity}.json`;
  const temporary = path.join(directory, `.${path.basename(plan.config)}.native-recording-${identity}.tmp`);
  let staged = false;
  try {
    writePrivate(backup, plan.bytes, plan.original);
    syncDirectory(directory); // Preserve the backup before the configuration's directory entry changes.
    writePrivate(temporary, Buffer.from(JSON.stringify(plan.conversion.document, null, 2) + '\n'), plan.original);
    staged = true;
    verifyUnchanged(plan);
    fs.renameSync(temporary, plan.config); staged = false;
    try { syncDirectory(directory); }
    catch { throw new MigrationError('replaced-directory-sync-failed'); }
    return true;
  } finally { if (staged) fs.unlinkSync(temporary); }
}

function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: node scripts/migrate-native-recording-config.cjs /explicit/config.json [--apply]\n'
      + 'Default: preview only. --apply preserves exact original bytes in a private local backup before atomic replacement.\n'
      + 'Converts enableMotionPolling and verified hksvCameras selectors.\n'
      + 'Removes obsolete hksvSource, syncModuleRecording, and syncModuleFeedLimits after backup.\n'
      + 'Does not contact Blink or restart Homebridge.\n');
    return 0;
  }
  const applying = args.length === 2 && args[1] === '--apply';
  if (!((args.length === 1 || applying) && args[0] && !args[0].startsWith('--'))) {
    process.stderr.write('Supply one explicit configuration file and optional --apply. Use --help for usage.\n'); return 2;
  }
  try {
    const plan = inspect(args[0]);
    const result = plan.conversion;
    const action = result.conflicts ? 'Blocked' : !result.changed ? 'Unchanged' : applying ? 'Applied' : 'Preview';
    if (applying && !result.conflicts) apply(plan);
    process.stdout.write(JSON.stringify({ action, ...result.summary, issues: result.issues }) + '\n');
    return result.conflicts ? 2 : 0;
  } catch (error) {
    const code = error instanceof MigrationError ? error.code : 'file-operation-failed';
    process.stderr.write(JSON.stringify({ action: 'Failed', code }) + '\n'); return 1;
  }
}

module.exports = { convert, inspect, apply, MigrationError };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
