#!/usr/bin/env node
'use strict';

// Explicit one-off local conversion. Never discover a Homebridge host/config or restart a service.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Buffer } = require('node:buffer');
const process = require('node:process');
const { TextDecoder } = require('node:util');

const LIMIT = 4 * 1024 * 1024;
const retired = ['ffmpegPath', 'rtpSsrcMode', 'rtspTransport', 'videoEncoder', 'twoWayAudio', 'verifyImmisTls'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function transform(document) {
  if (!object(document) || (document.platforms !== undefined && !Array.isArray(document.platforms))) {
    throw new Error('Invalid configuration document');
  }
  let changed = false;
  const platforms = (document.platforms ?? []).map(entry => {
    if (!object(entry) || entry.platform !== 'BlinkCameras') return entry;
    const next = { ...entry };
    if (!Object.hasOwn(next, 'hksvSource')) next.hksvSource = 'saved-clips';
    for (const key of retired) delete next[key];
    if (Object.hasOwn(next, 'ffmpegDebug')) {
      if (!Object.hasOwn(next, 'mediaDebug')) next.mediaDebug = next.ffmpegDebug;
      delete next.ffmpegDebug;
    }
    if (next.audioCodec === 'aac-eld') next.audioCodec = 'opus';
    if (object(next.audio)) {
      next.audio = { ...next.audio };
      delete next.audio.aacEldEncoder;
      delete next.audio.twoWay;
      if (next.audio.codec === 'aac-eld') next.audio.codec = 'opus';
    }
    if (object(next.video)) {
      next.video = { ...next.video };
      delete next.video.encoder;
    }
    changed ||= JSON.stringify(next) !== JSON.stringify(entry);
    return next;
  });
  return { changed, document: changed ? { ...document, platforms } : document };
}

function readBounded(descriptor) {
  const bytes = Buffer.alloc(LIMIT + 1);
  let length = 0;
  for (;;) {
    const count = fs.readSync(descriptor, bytes, length, bytes.length - length, length);
    length += count;
    if (length > LIMIT) throw new Error('Configuration exceeds fixed limit');
    if (!count) return bytes.subarray(0, length);
  }
}

function writePrivate(filename, bytes, owner) {
  const descriptor = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL |
    (fs.constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    fs.fchownSync(descriptor, owner.uid, owner.gid);
    fs.fchmodSync(descriptor, 0o600);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function migrate(filename, apply) {
  if (process.platform === 'win32') {
    const error = new Error('POSIX owner-only permissions required');
    error.code = 'UNSUPPORTED_HOST';
    throw error;
  }
  const config = path.resolve(filename);
  const original = fs.lstatSync(config);
  if (!original.isFile()) throw new Error('Regular configuration file required');
  const descriptor = fs.openSync(config, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  let temporary;
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== original.dev || opened.ino !== original.ino) throw new Error('Configuration changed');
    const bytes = readBounded(descriptor);
    const result = transform(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    if (!result.changed) return false;
    if (!apply) return true;
    // The exclusive backup is fully written and synced before any replacement is attempted.
    writePrivate(config + '.secure-media-backup-' + randomUUID() + '.json', bytes, opened);
    const destination = path.join(path.dirname(config), '.' + path.basename(config) + '.secure-media-' + randomUUID() + '.tmp');
    writePrivate(destination, Buffer.from(JSON.stringify(result.document, null, 2) + '\n'), opened);
    temporary = destination;
    const current = fs.lstatSync(config);
    if (!current.isFile() || current.dev !== opened.dev || current.ino !== opened.ino || !readBounded(descriptor).equals(bytes)) {
      throw new Error('Configuration changed before replacement');
    }
    fs.renameSync(temporary, config);
    temporary = undefined;
    return true;
  } finally {
    fs.closeSync(descriptor);
    if (temporary !== undefined) fs.unlinkSync(temporary);
  }
}

const args = process.argv.slice(2);
const apply = args.length === 2 && args[1] === '--apply';
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write('Usage: node scripts/migrate-secure-media-config.cjs /explicit/config.json [--apply]\nDefault: preview only. --apply backs up exact bytes locally before atomic replacement (POSIX).\nImplicit recording sources become saved-clips; explicit continuous choices are preserved.\n');
} else if (!(args.length === 1 && !args[0].startsWith('--')) && !apply) {
  process.stderr.write('Supply exactly one explicit configuration file. Use --help for usage.\n');
  process.exitCode = 2;
} else {
  try {
    const changed = migrate(args[0], apply);
    process.stdout.write(changed ? apply ? 'Migration complete; owner-only backup is beside the configuration file.\n'
      : 'Preview: configuration changes are available. Review source behavior, then rerun with --apply to back up and replace this file.\n'
      : 'No migration needed; configuration unchanged.\n');
  } catch (error) {
    process.stderr.write(error.code === 'UNSUPPORTED_HOST' ? 'Migration unavailable: POSIX owner-only file permissions required.\n' :
      'Configuration migration failed; inspect local file permissions, JSON and any retained backup.\n');
    process.exitCode = 1;
  }
}
