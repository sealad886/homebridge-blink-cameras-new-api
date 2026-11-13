import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

const script = resolve('scripts/migrate-native-recording-config.cjs');
const load = createRequire(resolve('package.json'));
const migration = load(script) as { inspect(filename: string): unknown; apply(plan: unknown): boolean };
const describePosix = process.platform === 'win32' ? describe.skip : describe;

describePosix('explicit native recording configuration migration', () => {
  let directory: string;
  let file: string;
  beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'blink-native-config-')); file = join(directory, 'config.json'); });
  afterEach(() => { jest.restoreAllMocks(); rmSync(directory, { recursive: true, force: true }); });
  const run = (apply = false, extra: string[] = []) => spawnSync(process.execPath, [...extra, script, file, ...(apply ? ['--apply'] : [])], { encoding: 'utf8' });
  const backups = () => readdirSync(directory).filter(name => name.includes('.native-recording-backup-'));

  it('migrates Early Notification choices with the canonical helper, backing up exact original bytes', () => {
    const input = { platforms: [{ platform: 'Other', disableEarlyNotification: 'keep' }, { platform: 'BlinkCameras', disableEarlyNotification: true,
      syncModuleSettingOverrides: [{ syncModuleId: '20', disableEarlyNotification: false, future: 3 }],
      deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', earlyNotificationMode: 'on', disableEarlyNotification: true }] }] };
    const bytes = JSON.stringify(input); writeFileSync(file, bytes);
    expect(run().status).toBe(0); expect(readFileSync(file, 'utf8')).toBe(bytes); expect(backups()).toEqual([]);
    expect(run(true).status).toBe(0);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ platforms: [input.platforms[0], { platform: 'BlinkCameras', earlyNotificationMode: 'off',
      syncModuleSettingOverrides: [{ syncModuleId: '20', earlyNotificationMode: 'unmanaged', future: 3 }],
      deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', earlyNotificationMode: 'on' }] }] });
    expect(readFileSync(join(directory, backups()[0]), 'utf8')).toBe(bytes);
    expect(run(true).status).toBe(0); expect(backups()).toHaveLength(1);
  });

  it('refuses malformed legacy Early Notification even alongside a valid explicit mode', () => {
    const bytes = JSON.stringify({ platforms: [{ platform: 'BlinkCameras', earlyNotificationMode: 'on', disableEarlyNotification: 'false' }] });
    writeFileSync(file, bytes);
    expect(run(true).status).toBe(2); expect(readFileSync(file, 'utf8')).toBe(bytes); expect(backups()).toEqual([]);
  });

  it('previews changes by default without rewriting the file or creating backup data', () => {
    const bytes = '{ "platforms": [{"platform":"BlinkCameras", "enableMotionPolling":false,"hksvCameras":["camera:12"]}] }\n';
    writeFileSync(file, bytes);
    const result = run();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ action: 'Preview', motionSettings: 1, hsvSettings: 1 });
    expect(readFileSync(file, 'utf8')).toBe(bytes);
    expect(readdirSync(directory)).toEqual(['config.json']);
  });

  it('converts verified legacy intent, merges exact rows, and preserves explicit new choices and unknown settings', () => {
    const other = { platform: 'OtherPlugin', enableMotionPolling: false, hksvCameras: ['preserve'] };
    const nativeRecording = { maxRetries: 4, customLimit: 'preserve' };
    const source = { bridge: { pin: 'private-pin' }, custom: { untouched: true }, platforms: [other,
      { platform: 'BlinkCameras', enableMotionPolling: false, hksvCameras: ['camera:12', 'owl:12', 'Entry'],
        nativeRecording, password: 'private-password',
        deviceSettingOverrides: [{ deviceIdentifier: 'camera:12', inputQuality: 'best', custom: 7 },
          { deviceIdentifier: 'owl:12', homeKitSecureVideo: false, exposeMotionDetected: false }] },
      { platform: 'BlinkCameras', enableMotionPolling: false, exposeMotionDetected: true, hksvCameras: [] }] };
    const bytes = JSON.stringify(source, null, 4) + '\n'; writeFileSync(file, bytes); fs.chmodSync(file, 0o640);
    const before = statSync(file);
    const result = run(true);
    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ ...source, platforms: [other,
      { platform: 'BlinkCameras', exposeMotionDetected: false, nativeRecording,
        password: 'private-password', deviceSettingOverrides: [
          { deviceIdentifier: 'camera:12', inputQuality: 'best', custom: 7, homeKitSecureVideo: true },
          { deviceIdentifier: 'owl:12', homeKitSecureVideo: false, exposeMotionDetected: false },
          { deviceIdentifier: 'Entry', homeKitSecureVideo: true },
        ] }, { platform: 'BlinkCameras', exposeMotionDetected: true }] });
    expect(backups()).toHaveLength(1);
    const backup = join(directory, backups()[0]);
    expect(readFileSync(backup, 'utf8')).toBe(bytes);
    for (const filename of [file, backup]) {
      const stats = statSync(filename);
      expect(stats.mode & 0o777).toBe(0o600);
      expect([stats.uid, stats.gid]).toEqual([before.uid, before.gid]);
    }
    expect(result.stdout + result.stderr).not.toMatch(/private-(pin|password)|camera:12|owl:12|Entry/);
    expect(readdirSync(directory).some(name => name.endsWith('.tmp'))).toBe(false);
  });

  it('leaves current and unrelated-only configurations byte-identical without another backup', () => {
    const bytes = '{ "platforms": [{"platform":"BlinkCameras", "exposeMotionDetected":false, "deviceSettingOverrides":[{"deviceIdentifier":"12","homeKitSecureVideo":true}]}] }\n';
    writeFileSync(file, bytes);
    expect(run(true).status).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(bytes); expect(backups()).toEqual([]);
    writeFileSync(file, '{ "platforms": [{"platform":"Unrelated", "enableMotionPolling":true}] }\n');
    const unrelated = readFileSync(file, 'utf8');
    expect(run(true).status).toBe(0); expect(readFileSync(file, 'utf8')).toBe(unrelated); expect(backups()).toEqual([]);
  });

  it('is idempotent after a successful application', () => {
    writeFileSync(file, JSON.stringify({ platforms: [{ platform: 'BlinkCameras', enableMotionPolling: true,
      hksvCameras: ['Entry'] }] }));
    expect(run(true).status).toBe(0); const first = readFileSync(file, 'utf8'); const backupNames = backups();
    expect(run(true).status).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(first); expect(backups()).toEqual(backupNames);
  });

  it.each([
    { hksv: { cameras: ['private-selector'] } },
    { enableMotionPolling: 'private-invalid-value' },
    { exposeMotionDetected: 'private-invalid-value' },
    { hksvCameras: ['camera:12'], deviceSettingOverrides: [{ deviceIdentifier: '12', inputQuality: 'best' }] },
    { hksvCameras: ['12'], deviceSettingOverrides: [{ deviceIdentifier: 'doorbell:12' }] },
    { hksvCameras: ['12', '12'] },
    { hksvCameras: ['12'], deviceSettingOverrides: [{ deviceIdentifier: '12' }, { deviceIdentifier: '12' }] },
    { hksvCameras: ['12'], deviceSettingOverrides: [{ deviceIdentifier: '12', homeKitSecureVideo: 'private-invalid-value' }] },
  ])('blocks conflicts without partially applying another conversion: %j', config => {
    const bytes = JSON.stringify({ platforms: [{ platform: 'BlinkCameras', enableMotionPolling: true, ...config }] });
    writeFileSync(file, bytes);
    const result = run(true);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ action: 'Blocked' });
    expect(readFileSync(file, 'utf8')).toBe(bytes); expect(backups()).toEqual([]);
    expect(result.stdout + result.stderr).not.toContain('private-');
  });

  it('flags unproven aliases and removes verified obsolete recording options after preserving their backup', () => {
    const source = { platforms: [{ platform: 'BlinkCameras', hksvCameras: ['camera:12'], hksvSource: 'continuous',
      syncModuleRecording: [{ syncModuleId: '30', source: 'continuous' }], syncModuleFeedLimits: [{ syncModuleId: '30', maxFeeds: 4 }],
      deviceSettingOverrides: [{ deviceIdentifier: 'private-serial-alias', motionTimeout: 15 }] }] };
    writeFileSync(file, JSON.stringify(source));
    const preview = run();
    expect(preview.status).toBe(0);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(source);
    const result = run(true);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).issues).toEqual(expect.arrayContaining([
      { platformIndex: 0, code: 'unresolved-camera-aliases', severity: 'warning' },
    ]));
    expect(JSON.parse(result.stdout).removedKeys).toEqual(expect.arrayContaining(['hksvCameras', 'hksvSource', 'syncModuleRecording']));
    expect(JSON.parse(result.stdout).removedKeys).not.toContain('syncModuleFeedLimits');
    expect(result.stdout + result.stderr).not.toContain('private-serial-alias');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ platforms: [{ platform: 'BlinkCameras',
      syncModuleFeedLimits: source.platforms[0].syncModuleFeedLimits, deviceSettingOverrides: [
      { deviceIdentifier: 'private-serial-alias', motionTimeout: 15 },
      { deviceIdentifier: 'camera:12', homeKitSecureVideo: true },
    ] }] });
    expect(JSON.parse(readFileSync(join(directory, backups()[0]), 'utf8'))).toEqual(source);
  });

  it.each(['content', 'replacement'])('rejects a concurrent %s change between inspection and application', change => {
    const bytes = JSON.stringify({ platforms: [{ platform: 'BlinkCameras', enableMotionPolling: true }] });
    writeFileSync(file, bytes); const plan = migration.inspect(file);
    const newer = JSON.stringify({ platforms: [{ platform: 'BlinkCameras', enableMotionPolling: false }], updated: true });
    if (change === 'replacement') { const replacement = join(directory, 'newer.json'); writeFileSync(replacement, newer); fs.renameSync(replacement, file); }
    else writeFileSync(file, newer);
    expect(() => migration.apply(plan)).toThrow('concurrent-change');
    expect(readFileSync(file, 'utf8')).toBe(newer); expect(backups()).toEqual([]);
  });

  it('replaces the directory entry atomically while an open reader retains the exact original file', () => {
    const bytes = JSON.stringify({ platforms: [{ platform: 'BlinkCameras', enableMotionPolling: true }] });
    writeFileSync(file, bytes); const descriptor = fs.openSync(file, 'r');
    try {
      expect(migration.apply(migration.inspect(file))).toBe(true);
      expect(fs.fstatSync(descriptor).ino).not.toBe(statSync(file).ino);
      expect(readFileSync(descriptor, 'utf8')).toBe(bytes);
      expect(JSON.parse(readFileSync(file, 'utf8')).platforms[0]).toEqual({ platform: 'BlinkCameras', exposeMotionDetected: true });
    } finally { fs.closeSync(descriptor); }
  });

  it('preserves the original and its completed backup if atomic promotion fails', () => {
    const bytes = JSON.stringify({ platforms: [{ platform: 'BlinkCameras', enableMotionPolling: true }] });
    writeFileSync(file, bytes); const plan = migration.inspect(file);
    jest.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('fixture rename failure'); });
    expect(() => migration.apply(plan)).toThrow('fixture rename failure');
    expect(readFileSync(file, 'utf8')).toBe(bytes);
    expect(backups()).toHaveLength(1); expect(readFileSync(join(directory, backups()[0]), 'utf8')).toBe(bytes);
    expect(readdirSync(directory).some(name => name.endsWith('.tmp'))).toBe(false);
  });

  it('never requests network access or uploads data while applying the migration', () => {
    writeFileSync(file, JSON.stringify({ platforms: [{ platform: 'BlinkCameras', enableMotionPolling: true, hksvCameras: ['camera:12'] }] }));
    const preload = join(directory, 'deny-network.cjs');
    writeFileSync(preload, "const fail = () => { process.exitCode = 99; throw new Error('network access denied'); };\n"
      + "globalThis.fetch = fail;\nfor (const name of ['node:http', 'node:https']) { const api = require(name); api.request = api.get = fail; }\n"
      + "for (const name of ['node:net', 'node:tls']) { const api = require(name); api.connect = api.createConnection = fail; }\n");
    expect(run(true, ['--require', preload]).status).toBe(0);
    expect(JSON.parse(readFileSync(file, 'utf8')).platforms[0]).toEqual({ platform: 'BlinkCameras', exposeMotionDetected: true,
      deviceSettingOverrides: [{ deviceIdentifier: 'camera:12', homeKitSecureVideo: true }] });
  });

  it('requires explicit input and refuses symlinks, invalid JSON, and oversized data without exposing contents', () => {
    writeFileSync(file, '{"password":"private-parse-value"');
    const result = run(true); expect(result.status).toBe(1); expect(result.stdout + result.stderr).not.toContain('private-parse-value');
    const link = join(directory, 'alias.json'); fs.symlinkSync(file, link);
    expect(spawnSync(process.execPath, [script, link, '--apply'], { encoding: 'utf8' }).status).toBe(1);
    expect(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status).toBe(2);
    writeFileSync(file, ' '.repeat(4 * 1024 * 1024 + 1));
    expect(run(true).status).toBe(1); expect(backups()).toEqual([]);
  });
});
