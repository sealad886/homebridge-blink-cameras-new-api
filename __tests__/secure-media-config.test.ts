import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const document = JSON.parse(readFileSync(resolve(process.cwd(), 'config.schema.json'), 'utf8'));
const validate = new Ajv({ strict: false }).compile(document.schema);

describe('secure media public configuration', () => {
  it.each(['opus', 'pcma', 'pcmu'])('accepts supported native audio %s and current stream controls', audioCodec => {
    expect(validate({ name: 'Blink', audioCodec, mediaDebug: true, enableAudio: true,
      outputQuality: '720p15', videoBitrate: 8000, softwareEncodingPreset: 'ultrafast',
      snapshotCacheTTL: 60, maxStreams: 2 })).toBe(true);
  });

  it.each(['aac-eld', 'aac', 'unknown'])('rejects unsupported audio %s', audioCodec => {
    expect(validate({ name: 'Blink', audioCodec })).toBe(false);
  });

  it.each(['debugStreamPath', 'ffmpegDebug', 'rtpSsrcMode', 'rtspTransport', 'videoEncoder', 'twoWayAudio', 'verifyImmisTls'])(
    'requires one-off migration of retired setting %s', key => {
      expect(validate({ name: 'Blink', [key]: false })).toBe(false);
    });

  it.each(['', 'blink-streams', '/private/recordings'])('rejects retired raw capture path %p', debugStreamPath => {
    expect(validate({ name: 'Blink', debugStreamPath })).toBe(false);
  });

  it('validates native diagnostics and bounded software preset choices', () => {
    expect(validate({ name: 'Blink', mediaDebug: 'true' })).toBe(false);
    expect(validate({ name: 'Blink', softwareEncodingPreset: 'placebo' })).toBe(false);
  });

  it('accepts external FFmpeg configuration without requiring a local executable during schema validation', () => {
    expect(validate({ name: 'Blink', ffmpegPath: 'ffmpeg' })).toBe(true);
    expect(validate({ name: 'Blink', ffmpegPath: '/opt/media tools/ffmpeg' })).toBe(true);
    expect(validate({ name: 'Blink', ffmpegPath: false })).toBe(false);
    expect(validate({ name: 'Blink', ffmpegPath: '' })).toBe(false);
  });
});
