import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

const script = resolve(process.cwd(), 'scripts/migrate-secure-media-config.cjs');
const describePosix = process.platform === 'win32' ? describe.skip : describe;

describePosix('explicit secure media configuration migration', () => {
  let directory: string;
  let file: string;
  beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'blink-config-migration-')); file = join(directory, 'config.json'); });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));
  const run = (path: string) => spawnSync(process.execPath, [script, path], { encoding: 'utf8' });

  it('backs up exact original bytes privately and rewrites only Blink settings', () => {
    const other = { platform: 'OtherPlugin', ffmpegDebug: true, username: 'secret-user', audioCodec: 'aac-eld' };
    const original = { bridge: { pin: 'secret-pin' }, platforms: [other, { platform: 'BlinkCameras',
      password: 'secret-password', ffmpegPath: '/old/ffmpeg', ffmpegDebug: true, rtspTransport: 'udp',
      rtpSsrcMode: 'signed', twoWayAudio: true, verifyImmisTls: false, videoEncoder: 'h264_nvenc',
      audioCodec: 'aac-eld', softwareEncodingPreset: 'ultrafast',
      audio: { codec: 'aac-eld', aacEldEncoder: 'libfdk_aac', twoWay: true, enabled: true, bitrate: 24 },
      video: { encoder: 'auto', outputQuality: '720p15', maxBitrate: 4000 }, custom: { preserve: true } }] };
    const bytes = JSON.stringify(original, null, 4) + '\n';
    writeFileSync(file, bytes); chmodSync(file, 0o640);
    const before = statSync(file);
    const result = run(file);
    expect(result.status).toBe(0);
    const backups = readdirSync(directory).filter(name => name.includes('.secure-media-backup-'));
    expect(backups).toHaveLength(1);
    const backup = join(directory, backups[0]);
    expect(readFileSync(backup, 'utf8')).toBe(bytes);
    for (const path of [backup, file]) {
      const stat = statSync(path);
      expect(stat.mode & 0o777).toBe(0o600);
      expect([stat.uid, stat.gid]).toEqual([before.uid, before.gid]);
    }
    const migrated = JSON.parse(readFileSync(file, 'utf8'));
    expect(migrated.bridge).toEqual(original.bridge);
    expect(migrated.platforms[0]).toEqual(other);
    expect(migrated.platforms[1]).toEqual({ platform: 'BlinkCameras', password: 'secret-password', mediaDebug: true,
      audioCodec: 'opus', softwareEncodingPreset: 'ultrafast',
      audio: { codec: 'opus', enabled: true, bitrate: 24 }, video: { outputQuality: '720p15', maxBitrate: 4000 },
      custom: { preserve: true } });
    expect(result.stdout + result.stderr).not.toMatch(/secret-(?:pin|user|password)/);
    expect(run(file).status).toBe(0);
    expect(readdirSync(directory).filter(name => name.includes('.secure-media-backup-'))).toEqual(backups);
  });

  it('preserves an explicit new diagnostics choice and creates unique backups on separate migrations', () => {
    const bytes = JSON.stringify({ platforms: [{ platform: 'BlinkCameras', mediaDebug: false, ffmpegDebug: true }] });
    writeFileSync(file, bytes);
    expect(run(file).status).toBe(0);
    expect(JSON.parse(readFileSync(file, 'utf8')).platforms[0].mediaDebug).toBe(false);
    writeFileSync(file, bytes);
    expect(run(file).status).toBe(0);
    expect(readdirSync(directory).filter(name => name.includes('.secure-media-backup-'))).toHaveLength(2);
  });

  it('leaves unrelated-only configuration byte-identical and creates no backup', () => {
    const bytes = '{ "platforms": [{"platform":"OtherPlugin", "ffmpegPath":"keep"}] }\n';
    writeFileSync(file, bytes);
    expect(run(file).status).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(bytes);
    expect(readdirSync(directory)).toEqual(['config.json']);
  });

  it('refuses malformed documents and symlinks without exposing source content', () => {
    writeFileSync(file, '{"password":"secret-parse-error"');
    const invalid = run(file);
    expect(invalid.status).not.toBe(0);
    expect(invalid.stdout + invalid.stderr).not.toContain('secret-parse-error');
    expect(readdirSync(directory)).toEqual(['config.json']);
    const link = join(directory, 'alias.json'); symlinkSync(file, link);
    expect(run(link).status).not.toBe(0);
    expect(readFileSync(file, 'utf8')).toBe('{"password":"secret-parse-error"');
  });

  it('refuses oversized input and requires an explicit file without changing data', () => {
    const bytes = Buffer.alloc(4 * 1024 * 1024 + 1, 0x20);
    writeFileSync(file, bytes);
    expect(run(file).status).not.toBe(0);
    expect(readFileSync(file).equals(bytes)).toBe(true);
    expect(readdirSync(directory)).toEqual(['config.json']);
    expect(spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' }).status).toBe(2);
    expect(readdirSync(directory)).toEqual(['config.json']);
  });
});
