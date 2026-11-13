import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';

const script = resolve('scripts/postinstall.cjs');
const load = createRequire(resolve('package.json'));
const installer = load(script) as { run(environment?: Record<string, string>, packageRoot?: string): { action: string; code?: string } };
const describePosix = process.platform === 'win32' ? describe.skip : describe;

describePosix('one-time installed configuration migration', () => {
  let directory: string;
  const file = () => join(directory, 'config.json');
  const backups = () => fs.readdirSync(directory).filter(name => name.includes('.native-recording-backup-'));
  beforeEach(() => { directory = fs.mkdtempSync(join(tmpdir(), 'blink-postinstall-')); });
  afterEach(() => { jest.restoreAllMocks(); fs.rmSync(directory, { recursive: true, force: true }); });

  it('persists canonical choices at every scope, preserves exact private backup and is idempotent', () => {
    const input = { bridge: { keep: 'PRIVATE_CONFIG_VALUE' }, platforms: [
      { platform: 'Other', disableEarlyNotification: 'keep' },
      { platform: 'BlinkCameras', disableEarlyNotification: true, extension: { keep: 1 },
        syncModuleSettingOverrides: [{ syncModuleId: '20', disableEarlyNotification: false }],
        deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', earlyNotificationMode: 'on', disableEarlyNotification: true }] },
    ] };
    const bytes = JSON.stringify(input); fs.writeFileSync(file(), bytes, { mode: 0o640 });
    const result = installer.run({ UIX_STORAGE_PATH: directory });
    expect(result).toEqual({ action: 'Applied' });
    expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toEqual({ bridge: input.bridge, platforms: [input.platforms[0],
      { platform: 'BlinkCameras', earlyNotificationMode: 'off', extension: { keep: 1 },
        syncModuleSettingOverrides: [{ syncModuleId: '20', earlyNotificationMode: 'unmanaged' }],
        deviceSettingOverrides: [{ deviceIdentifier: 'camera:1', earlyNotificationMode: 'on' }] }] });
    expect(backups()).toHaveLength(1);
    const backup = join(directory, backups()[0]); expect(fs.readFileSync(backup, 'utf8')).toBe(bytes);
    expect(fs.statSync(backup).mode & 0o777).toBe(0o600); expect(fs.statSync(file()).mode & 0o777).toBe(0o600);
    expect(fs.statSync(backup).uid).toBe(fs.statSync(file()).uid);
    expect(installer.run({ UIX_STORAGE_PATH: directory })).toEqual({ action: 'Unchanged' });
    expect(backups()).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CONFIG_VALUE');
  });

  it('uses only the config beside its exact installed local scoped package prefix', () => {
    fs.writeFileSync(file(), JSON.stringify({ platforms: [{ platform: 'BlinkCameras', disableEarlyNotification: false }] }));
    const packageRoot = join(directory, 'node_modules/@sealad886/homebridge-blink-cameras-new-api');
    expect(installer.run({}, packageRoot)).toEqual({ action: 'Applied' });
    expect(JSON.parse(fs.readFileSync(file(), 'utf8')).platforms[0])
      .toEqual({ platform: 'BlinkCameras', earlyNotificationMode: 'unmanaged' });
  });

  it('gives the explicit Homebridge storage path priority over an installed package prefix', () => {
    const other = join(directory, 'other'); fs.mkdirSync(other);
    fs.writeFileSync(file(), JSON.stringify({ platforms: [{ platform: 'BlinkCameras', disableEarlyNotification: true }] }));
    const otherFile = join(other, 'config.json'), otherBytes = JSON.stringify({ platforms: [{ platform: 'BlinkCameras', disableEarlyNotification: false }] });
    fs.writeFileSync(otherFile, otherBytes);
    expect(installer.run({ UIX_STORAGE_PATH: directory }, join(other, 'node_modules/@sealad886/homebridge-blink-cameras-new-api'))).toEqual({ action: 'Applied' });
    expect(fs.readFileSync(otherFile, 'utf8')).toBe(otherBytes);
  });

  it('does not discover HOME, INIT_CWD or standard host paths during a source install', () => {
    const probe = jest.spyOn(fs, 'lstatSync');
    expect(installer.run({ HOME: directory, INIT_CWD: directory }, directory))
      .toEqual({ action: 'Skipped', code: 'storage-path-unavailable' });
    expect(probe).not.toHaveBeenCalled();
    expect(fs.readdirSync(directory)).toEqual([]);
  });

  it('runs without compiled output when no host configuration exists', () => {
    const source = join(directory, 'checkout/scripts'); fs.mkdirSync(source, { recursive: true });
    fs.copyFileSync(script, join(source, 'postinstall.cjs'));
    const result = spawnSync(process.execPath, [join(source, 'postinstall.cjs')], {
      cwd: directory, env: { PATH: process.env.PATH, UIX_STORAGE_PATH: directory }, encoding: 'utf8',
    });
    expect(result.status).toBe(0); expect(JSON.parse(result.stdout)).toEqual({ action: 'Skipped', code: 'config-absent' });
    expect(fs.readdirSync(directory)).toEqual(['checkout']);
  });

  it.each(['not-json', JSON.stringify({ platforms: [{ platform: 'BlinkCameras', disableEarlyNotification: 'false' }] }),
    JSON.stringify({ platforms: [{ platform: 'BlinkCameras', hksv: { unverified: true } }] })])('fails without changing malformed or conflicted configuration: %s', bytes => {
    fs.writeFileSync(file(), bytes);
    const result = installer.run({ UIX_STORAGE_PATH: directory });
    expect(result.action).toBe('Failed'); expect(fs.readFileSync(file(), 'utf8')).toBe(bytes); expect(backups()).toEqual([]);
  });

  it('refuses a symlinked config without changing the target', () => {
    const target = join(directory, 'private.json'), bytes = JSON.stringify({ platforms: [{ platform: 'BlinkCameras', disableEarlyNotification: true }] });
    fs.writeFileSync(target, bytes); fs.symlinkSync(target, file());
    expect(installer.run({ UIX_STORAGE_PATH: directory })).toEqual({ action: 'Failed', code: 'regular-file-required' });
    expect(fs.readFileSync(target, 'utf8')).toBe(bytes); expect(backups()).toEqual([]);
  });

  it('rejects relative explicit storage and reports failures without private config values or paths', () => {
    expect(installer.run({ UIX_STORAGE_PATH: '.' })).toEqual({ action: 'Failed', code: 'absolute-storage-path-required' });
    const bytes = '{"password":"PRIVATE_CONFIG_VALUE"'; fs.writeFileSync(file(), bytes);
    const result = spawnSync(process.execPath, [script], { env: { PATH: process.env.PATH, UIX_STORAGE_PATH: directory }, encoding: 'utf8' });
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
    runInNewContext(fs.readFileSync(script, 'utf8'), { module, __dirname: dirname(script),
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
