#!/usr/bin/env node
'use strict';

// Pure persisted-settings conversion. Both CLIs use the guarded native migration writer.
const process = require('node:process');
const retired = ['ffmpegPath', 'rtpSsrcMode', 'rtspTransport', 'videoEncoder', 'twoWayAudio', 'verifyImmisTls'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function convertSecureMediaSettings(entry) {
  const next = { ...entry };
  for (const key of retired) delete next[key];
  if (Object.hasOwn(next, 'ffmpegDebug')) {
    if (typeof next.ffmpegDebug !== 'boolean' ||
      (Object.hasOwn(next, 'mediaDebug') && typeof next.mediaDebug !== 'boolean')) {
      throw new Error('invalid-media-debug-choice');
    }
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
  return next;
}

module.exports = { convertSecureMediaSettings };
// Historical entrypoint retained, now preview-only unless --apply is supplied.
// Load the canonical CLI only during execution, avoiding a circular module dependency.
if (require.main === module) process.exitCode = require('./migrate-native-recording-config.cjs').main(process.argv.slice(2));
