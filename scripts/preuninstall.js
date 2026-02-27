#!/usr/bin/env node
/* global console, process, require */
/**
 * Pre-uninstall cleanup for homebridge-blink-cameras.
 *
 * Removes the persisted auth state dot-file and any legacy blink-auth/
 * directory from the Homebridge storage root. Runs via npm's preuninstall
 * lifecycle hook so that `hb-service remove` leaves no residual files.
 *
 * Detection strategy (in order):
 *   1. $UIX_STORAGE_PATH (set by hb-service / homebridge-config-ui-x)
 *   2. /var/lib/homebridge   (standard Linux / hb-service default)
 *   3. ~/.homebridge          (Homebridge default on macOS / manual installs)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const AUTH_DOT_FILE = '.blink-auth.json';
const LEGACY_DIR = 'blink-auth';

function resolveStoragePaths() {
  const candidates = [];
  if (process.env.UIX_STORAGE_PATH) {
    candidates.push(process.env.UIX_STORAGE_PATH);
  }
  candidates.push('/var/lib/homebridge');
  candidates.push(path.join(os.homedir(), '.homebridge'));
  return candidates;
}

function tryRemoveFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[Blink cleanup] Removed ${filePath}`);
      return true;
    }
  } catch (err) {
    console.warn(`[Blink cleanup] Could not remove ${filePath}: ${err.message}`);
  }
  return false;
}

function tryRemoveDir(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`[Blink cleanup] Removed ${dirPath}`);
      return true;
    }
  } catch (err) {
    console.warn(`[Blink cleanup] Could not remove ${dirPath}: ${err.message}`);
  }
  return false;
}

let cleaned = false;
for (const storagePath of resolveStoragePaths()) {
  if (!fs.existsSync(storagePath)) continue;

  const dotFile = path.join(storagePath, AUTH_DOT_FILE);
  const legacyDir = path.join(storagePath, LEGACY_DIR);

  if (tryRemoveFile(dotFile)) cleaned = true;
  if (tryRemoveDir(legacyDir)) cleaned = true;
}

if (!cleaned) {
  console.log('[Blink cleanup] No auth state files found to clean up.');
}
