import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';

const script = resolve('scripts/postinstall.cjs');
const load = createRequire(resolve('package.json'));
const installer = load(script) as { run(environment?: Record<string, string>, packageRoot?: string): { action: string; code?: string } };
const describePosix = process.platform === 'win32' ? describe.skip : describe;

describePosix('one-time installed configuration migration', () => {
  let directory: string;
  const file = () => join(directory, 'config.json');
  const installedRoot = () => join(directory, 'node_modules/@sealad886/homebridge-blink-cameras-new-api');
  const backups = () => fs.readdirSync(directory).filter(name => name.includes('.native-recording-backup-'));
  beforeEach(() => { directory = fs.mkdtempSync(join(tmpdir(), 'blink-postinstall-')); });
  afterEach(() => { jest.restoreAllMocks(); fs.rmSync(directory, { recursive: true, force: true }); });

  it.each([0o600, 0o640])('persists canonical choices and config access mode %o with an exact private backup, idempotently', mode => {
    const input = { bridge: { keep: 'PRIVATE_CONFIG_VALUE' }, platforms: [
      { platform: 'Other', disableEarlyNotification: 'keep' },
      { platform: 'BlinkCameras', disableEarlyNotification: true, extension: { keep: 1 },
        syncModuleSettingOverrides: [{ syncModuleId: '20', disableEarlyNotification: false }],
        deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', earlyNotificationMode: 'on', disableEarlyNotification: true }] },
    ] };
    const bytes = JSON.stringify(input); fs.writeFileSync(file(), bytes, { mode }); fs.chmodSync(file(), mode);
    const result = installer.run({ UIX_STORAGE_PATH: directory }, installedRoot());
    expect(result).toEqual({ action: 'Applied' });
    expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toEqual({ bridge: input.bridge, platforms: [input.platforms[0],
      { platform: 'BlinkCameras', earlyNotificationMode: 'off', extension: { keep: 1 },
        syncModuleSettingOverrides: [{ syncModuleId: '20', earlyNotificationMode: 'unmanaged' }],
        deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', earlyNotificationMode: 'on' }] }] });
    expect(backups()).toHaveLength(1);
    const backup = join(directory, backups()[0]); expect(fs.readFileSync(backup, 'utf8')).toBe(bytes);
    expect(fs.statSync(backup).mode & 0o777).toBe(0o600); expect(fs.statSync(file()).mode & 0o777).toBe(mode);
    expect(fs.statSync(backup).uid).toBe(fs.statSync(file()).uid);
    expect(installer.run({ UIX_STORAGE_PATH: directory }, installedRoot())).toEqual({ action: 'Unchanged' });
    expect(backups()).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CONFIG_VALUE');
  });

  it('never inspects adjacent package-prefix config when active Homebridge storage is unidentified', () => {
    const bytes = JSON.stringify({ platforms: [{ platform: 'BlinkCameras', disableEarlyNotification: false }] });
    fs.writeFileSync(file(), bytes);
    const probe = jest.spyOn(fs, 'lstatSync');
    const result = installer.run({}, installedRoot());
    expect(result).toMatchObject({ action: 'Skipped', code: 'storage-path-unavailable',
      message: expect.stringContaining('UIX_STORAGE_PATH') });
    expect(result).toHaveProperty('message', expect.stringContaining('docs/native-recording-config-migration.md'));
    expect(probe).not.toHaveBeenCalled();
    expect(fs.readFileSync(file(), 'utf8')).toBe(bytes); expect(backups()).toEqual([]);
  });

  it('uses explicit Homebridge storage without changing adjacent package-prefix config', () => {
    const other = join(directory, 'other'); fs.mkdirSync(other);
    fs.writeFileSync(file(), JSON.stringify({ platforms: [{ platform: 'BlinkCameras', disableEarlyNotification: true }] }));
    const otherFile = join(other, 'config.json'), otherBytes = JSON.stringify({ platforms: [{ platform: 'BlinkCameras', disableEarlyNotification: false }] });
    fs.writeFileSync(otherFile, otherBytes);
    expect(installer.run({ UIX_STORAGE_PATH: directory }, join(other, 'node_modules/@sealad886/homebridge-blink-cameras-new-api'))).toEqual({ action: 'Applied' });
    expect(fs.readFileSync(otherFile, 'utf8')).toBe(otherBytes);
  });

  it('does not inspect inherited Homebridge storage or discover other paths during a source install', () => {
    const bytes = JSON.stringify({ platforms: [{ platform: 'BlinkCameras', disableEarlyNotification: true }] });
    fs.writeFileSync(file(), bytes);
    const probe = jest.spyOn(fs, 'lstatSync');
    expect(installer.run({ HOME: directory, INIT_CWD: directory, UIX_STORAGE_PATH: directory }, directory))
      .toEqual({ action: 'Skipped', code: 'storage-path-unavailable' });
    expect(probe).not.toHaveBeenCalled();
    expect(fs.readFileSync(file(), 'utf8')).toBe(bytes);
    expect(fs.readdirSync(directory)).toEqual(['config.json']);
  });

  it('skips an installed package with no host configuration before loading compiled output', () => {
    const source = join(installedRoot(), 'scripts'); fs.mkdirSync(source, { recursive: true });
    fs.copyFileSync(script, join(source, 'postinstall.cjs'));
    const result = spawnSync(process.execPath, [join(source, 'postinstall.cjs')], {
      cwd: directory, env: { PATH: process.env.PATH, UIX_STORAGE_PATH: directory }, encoding: 'utf8',
    });
    expect(result.status).toBe(0); expect(JSON.parse(result.stdout)).toMatchObject({ action: 'Skipped', code: 'config-absent',
      message: expect.stringContaining('docs/native-recording-config-migration.md') });
    expect(fs.readdirSync(directory)).toEqual(['node_modules']);
  });

  it.each([
    { platform: 'BlinkCameras', earlyNotificationMode: 'off' },
    { platform: 'BlinkCameras', disableEarlyNotification: true },
  ])('skips a clean source checkout with inherited storage and existing config, without compiled output: %s', config => {
    const source = join(directory, 'checkout/scripts'), storage = join(directory, 'homebridge');
    fs.mkdirSync(source, { recursive: true }); fs.mkdirSync(storage);
    fs.copyFileSync(script, join(source, 'postinstall.cjs'));
    const target = join(storage, 'config.json'), bytes = JSON.stringify({ platforms: [config] }); fs.writeFileSync(target, bytes);
    const result = spawnSync(process.execPath, [join(source, 'postinstall.cjs')], {
      cwd: join(directory, 'checkout'), env: { PATH: process.env.PATH, UIX_STORAGE_PATH: storage }, encoding: 'utf8',
    });
    expect(result.status).toBe(0); expect(JSON.parse(result.stdout)).toEqual({ action: 'Skipped', code: 'storage-path-unavailable' });
    expect(fs.readFileSync(target, 'utf8')).toBe(bytes); expect(fs.readdirSync(storage)).toEqual(['config.json']);
    expect(fs.readdirSync(join(directory, 'checkout'))).toEqual(['scripts']);
  });

  it.each(['not-json', JSON.stringify({ platforms: [{ platform: 'BlinkCameras', disableEarlyNotification: 'false' }] }),
    JSON.stringify({ platforms: [{ platform: 'BlinkCameras', hksv: { unverified: true } }] })])('fails without changing malformed or conflicted configuration: %s', bytes => {
    fs.writeFileSync(file(), bytes);
    const result = installer.run({ UIX_STORAGE_PATH: directory }, installedRoot());
    expect(result.action).toBe('Failed'); expect(fs.readFileSync(file(), 'utf8')).toBe(bytes); expect(backups()).toEqual([]);
  });

  it('refuses a symlinked config without changing the target', () => {
    const target = join(directory, 'private.json'), bytes = JSON.stringify({ platforms: [{ platform: 'BlinkCameras', disableEarlyNotification: true }] });
    fs.writeFileSync(target, bytes); fs.symlinkSync(target, file());
    expect(installer.run({ UIX_STORAGE_PATH: directory }, installedRoot())).toEqual({ action: 'Failed', code: 'regular-file-required' });
    expect(fs.readFileSync(target, 'utf8')).toBe(bytes); expect(backups()).toEqual([]);
  });

  it('rejects relative explicit storage and reports failures without private config values or paths', () => {
    expect(installer.run({ UIX_STORAGE_PATH: '.' }, installedRoot())).toEqual({ action: 'Failed', code: 'absolute-storage-path-required' });
    const bytes = '{"password":"PRIVATE_CONFIG_VALUE"'; fs.writeFileSync(file(), bytes);
    const scripts = join(installedRoot(), 'scripts'); fs.mkdirSync(scripts, { recursive: true });
    fs.copyFileSync(script, join(scripts, 'postinstall.cjs'));
    fs.copyFileSync(resolve('scripts/migrate-native-recording-config.cjs'), join(scripts, 'migrate-native-recording-config.cjs'));
    fs.symlinkSync(resolve('dist'), join(installedRoot(), 'dist'), 'dir');
    const result = spawnSync(process.execPath, [join(scripts, 'postinstall.cjs')], { env: { PATH: process.env.PATH, UIX_STORAGE_PATH: directory }, encoding: 'utf8' });
    expect(result.status).toBe(1); expect(result.stderr).toContain('invalid-json');
    expect(result.stderr).not.toContain('PRIVATE_CONFIG_VALUE'); expect(result.stderr).not.toContain(directory);
    expect(fs.readFileSync(file(), 'utf8')).toBe(bytes);
  });
});

it.each([
  { platform: 'BlinkCameras', earlyNotificationMode: 'off' },
  { platform: 'BlinkCameras', disableEarlyNotification: true },
])('leaves Windows config untouched and reports manual migration without loading POSIX code: %s', config => {
  const directory = fs.mkdtempSync(join(tmpdir(), 'blink-windows-install-'));
  try {
    const file = join(directory, 'config.json'), bytes = JSON.stringify({ platforms: [config] });
    fs.writeFileSync(file, bytes);
    const module = { exports: {} as typeof installer };
    runInNewContext(fs.readFileSync(script, 'utf8'), { module, __dirname: join(directory, 'node_modules/@sealad886/homebridge-blink-cameras-new-api/scripts'),
      process: { platform: 'win32', env: {} },
      require: (name: string) => {
        if (name.startsWith('.')) throw new Error('POSIX migration must not load on Windows');
        return load(name);
      },
    });
    expect(module.exports.run({ UIX_STORAGE_PATH: directory })).toMatchObject({ action: 'Skipped',
      code: 'windows-manual-migration-required', message: expect.stringContaining('canonical JSON') });
    expect(fs.readFileSync(file, 'utf8')).toBe(bytes); expect(fs.readdirSync(directory)).toEqual(['config.json']);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
