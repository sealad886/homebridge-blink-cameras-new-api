import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FileAuthStorage, AuthStateChangedError } from '../../src/blink-api/auth-storage';
import { withAuthStorageLock } from '../../src/blink-api/auth-storage-lock';
import * as secureFiles from '../../src/blink-api/secure-json-file';
import { readOwnerOnlyJsonFile, writeOwnerOnlyJsonFile } from '../../src/blink-api/secure-json-file';
import { InvalidAuthStateError } from '../../src/blink-api/auth-state';
import { fork } from 'node:child_process';

describe('credential storage authority', () => {
  let directory: string;
  let filePath: string;
  const state = (accessToken: string) => ({ accessToken, oauthClientId: 'android' as const });

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-auth-authority-'));
    filePath = path.join(directory, '.blink-auth.json');
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('rejects an old writer after logout, without restoring credentials', async () => {
    await writeOwnerOnlyJsonFile(filePath, state('A'));
    const old = new FileAuthStorage(filePath);
    await old.load();
    await new FileAuthStorage(filePath).clear();
    expect(await old.hasChanged()).toBe(true);
    await expect(old.save(state('A-refreshed'))).rejects.toThrow(AuthStateChangedError);
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects old-account writes after another process replaces the account', async () => {
    await writeOwnerOnlyJsonFile(filePath, state('A'));
    const old = new FileAuthStorage(filePath);
    await old.load();
    const replacement = new FileAuthStorage(filePath);
    await replacement.load();
    await replacement.replace(state('B'));
    await expect(old.save(state('A-refreshed'))).rejects.toThrow(AuthStateChangedError);
    expect(await readOwnerOnlyJsonFile(filePath)).toEqual(state('B'));
  });

  it('allows exactly one competing refresh to commit and keeps subsequent writes consistent', async () => {
    await writeOwnerOnlyJsonFile(filePath, state('initial'));
    const first = new FileAuthStorage(filePath);
    const second = new FileAuthStorage(filePath);
    await Promise.all([first.load(), second.load()]);
    const results = await Promise.allSettled([first.save(state('first')), second.save(state('second'))]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const winner = results[0].status === 'fulfilled' ? first : second;
    await winner.save(state('next'));
    expect(await readOwnerOnlyJsonFile(filePath)).toEqual(state('next'));
  });

  it('keeps the running bridge valid when a connection test only changes the save timestamp', async () => {
    await writeOwnerOnlyJsonFile(filePath, { ...state('same'), updatedAt: '2026-09-15T00:00:00.000Z' });
    const bridge = new FileAuthStorage(filePath);
    const ui = new FileAuthStorage(filePath);
    await bridge.load();
    await ui.load();
    await ui.save({ ...state('same'), updatedAt: '2026-09-15T01:00:00.000Z', region: null });
    expect(await bridge.hasChanged()).toBe(false);
    await expect(bridge.save(state('refreshed'))).resolves.toBeUndefined();
  });

  it('invalidates a pending first login when logout occurs before any tokens exist', async () => {
    const pendingLogin = new FileAuthStorage(filePath);
    await pendingLogin.load();
    await new FileAuthStorage(filePath).clear();
    await expect(pendingLogin.replace(state('late-login'))).rejects.toThrow(AuthStateChangedError);
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['broken JSON with synthetic-secret', '{"accessToken":123}'])(
    'backs up invalid state before a new authenticated session replaces it', async contents => {
      await fs.writeFile(filePath, contents, { mode: 0o600 });
      const storage = new FileAuthStorage(filePath);
      await expect(storage.load()).rejects.toThrow(InvalidAuthStateError);
      await storage.replace(state('new'));
      const backups = (await fs.readdir(directory)).filter(name => name.includes('.invalid-'));
      expect(backups).toHaveLength(1);
      const backup = path.join(directory, backups[0]);
      expect(await readOwnerOnlyJsonFile(backup)).toBe(contents);
      if (process.platform !== 'win32') expect((await fs.stat(backup)).mode & 0o777).toBe(0o600);
      expect(await storage.load()).toEqual(state('new'));
    },
  );

  it('does not follow unsafe state files when replacing a session', async () => {
    const target = path.join(directory, 'target');
    await fs.writeFile(target, 'private', { mode: 0o600 });
    await fs.symlink(target, filePath);
    const storage = new FileAuthStorage(filePath);
    await expect(storage.load()).rejects.toThrow('symlink');
    expect(await fs.readFile(target, 'utf8')).toBe('private');
  });

  it('recovers malformed legacy storage with a backup before removing the legacy source', async () => {
    const legacy = path.join(directory, 'blink-auth', 'auth-state.json');
    await fs.mkdir(path.dirname(legacy));
    await fs.writeFile(legacy, 'damaged legacy contents', { mode: 0o600 });
    const storage = new FileAuthStorage(filePath, legacy);
    await expect(storage.load()).rejects.toThrow(InvalidAuthStateError);
    await storage.replace(state('new'));
    expect(await storage.load()).toEqual(state('new'));
    const backups = (await fs.readdir(path.dirname(legacy))).filter(name => name.includes('.invalid-'));
    expect(backups).toHaveLength(1);
    expect(await readOwnerOnlyJsonFile(path.join(path.dirname(legacy), backups[0]))).toBe('damaged legacy contents');
    await expect(fs.stat(legacy)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects failed legacy cleanup before committing a replacement and allows retry', async () => {
    const legacy = path.join(directory, 'legacy', 'auth.json');
    await writeOwnerOnlyJsonFile(filePath, state('old'));
    await writeOwnerOnlyJsonFile(legacy, state('legacy'));
    const storage = new FileAuthStorage(filePath, legacy);
    await storage.load();
    const remove = jest.spyOn(secureFiles, 'removeOwnerOnlyFile').mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(storage.replace(state('new'))).rejects.toThrow('cleanup failed');
    expect(await readOwnerOnlyJsonFile(filePath)).toEqual(state('old'));
    expect(await storage.hasChanged()).toBe(false);
    remove.mockRestore();
    await storage.replace(state('new'));
    expect(await readOwnerOnlyJsonFile(filePath)).toEqual(state('new'));
  });

  it('preserves the migrated session and its writer baseline when legacy cleanup fails', async () => {
    const legacy = path.join(directory, 'legacy', 'auth.json');
    await writeOwnerOnlyJsonFile(legacy, state('old'));
    const storage = new FileAuthStorage(filePath, legacy);
    const remove = jest.spyOn(secureFiles, 'removeOwnerOnlyFile').mockRejectedValue(new Error('cleanup failed'));
    await expect(storage.load()).rejects.toThrow('cleanup failed');
    expect(await readOwnerOnlyJsonFile(filePath)).toEqual(state('old'));
    expect(await readOwnerOnlyJsonFile(legacy)).toEqual(state('old'));
    expect(await storage.hasChanged()).toBe(false);
    await expect(storage.replace(state('new'))).rejects.toThrow('cleanup failed');
    expect(await readOwnerOnlyJsonFile(filePath)).toEqual(state('old'));
    remove.mockRestore();
    await storage.replace(state('new'));
    expect(await readOwnerOnlyJsonFile(filePath)).toEqual(state('new'));
  });

  it('preserves a sole valid legacy session if replacement fails after migrating it', async () => {
    const legacy = path.join(directory, 'legacy', 'auth.json');
    await writeOwnerOnlyJsonFile(legacy, state('old'));
    const storage = new FileAuthStorage(filePath, legacy);
    const realWrite = secureFiles.writeOwnerOnlyJsonFile;
    const write = jest.spyOn(secureFiles, 'writeOwnerOnlyJsonFile').mockRejectedValueOnce(new Error('migration failed'));
    await expect(storage.load()).rejects.toThrow('migration failed');
    expect(await readOwnerOnlyJsonFile(legacy)).toEqual(state('old'));
    write.mockRestore();
    const replacementWrite = jest.spyOn(secureFiles, 'writeOwnerOnlyJsonFile').mockImplementation(async (target, value) => {
      if ((value as { accessToken?: string }).accessToken === 'new') throw new Error('replacement failed');
      await realWrite(target, value);
    });
    await expect(storage.replace(state('new'))).rejects.toThrow('replacement failed');
    expect(await readOwnerOnlyJsonFile(filePath)).toEqual(state('old'));
    expect(await storage.hasChanged()).toBe(false);
    replacementWrite.mockRestore();
    await storage.replace(state('new'));
    expect(await readOwnerOnlyJsonFile(filePath)).toEqual(state('new'));
  });

  it('backs up usable legacy credentials without activating them when malformed primary replacement fails', async () => {
    const legacy = path.join(directory, 'legacy', 'auth.json');
    await fs.writeFile(filePath, 'broken primary', { mode: 0o600 });
    await writeOwnerOnlyJsonFile(legacy, state('legacy-account'));
    const legacyContents = await fs.readFile(legacy, 'utf8');
    const storage = new FileAuthStorage(filePath, legacy);
    await expect(storage.load()).rejects.toThrow(InvalidAuthStateError);
    const realWrite = secureFiles.writeOwnerOnlyJsonFile;
    jest.spyOn(secureFiles, 'writeOwnerOnlyJsonFile').mockImplementation(async (target, value) => {
      if (target === filePath) throw new Error('replacement write failed');
      await realWrite(target, value);
    });
    await expect(storage.replace(state('new-account'))).rejects.toThrow('replacement write failed');
    expect(await fs.readFile(filePath, 'utf8')).toBe('broken primary');
    const backups = (await fs.readdir(path.dirname(legacy))).filter(name => name.includes('.recovery-'));
    expect(backups).toHaveLength(1);
    const backup = path.join(path.dirname(legacy), backups[0]);
    expect(await readOwnerOnlyJsonFile(backup)).toBe(legacyContents);
    if (process.platform !== 'win32') expect((await fs.stat(backup)).mode & 0o777).toBe(0o600);
    expect(await storage.hasChanged()).toBe(false);
    await expect(storage.load()).rejects.toThrow(InvalidAuthStateError);
  });

  it('keeps old primary credentials when replacement write fails after legacy cleanup', async () => {
    const legacy = path.join(directory, 'legacy', 'auth.json');
    await writeOwnerOnlyJsonFile(filePath, state('old'));
    await writeOwnerOnlyJsonFile(legacy, state('legacy'));
    const storage = new FileAuthStorage(filePath, legacy);
    await storage.load();
    const write = jest.spyOn(secureFiles, 'writeOwnerOnlyJsonFile').mockRejectedValueOnce(new Error('write failed'));
    await expect(storage.replace(state('new'))).rejects.toThrow('write failed');
    expect(await readOwnerOnlyJsonFile(filePath)).toEqual(state('old'));
    await expect(fs.stat(legacy)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await storage.hasChanged()).toBe(false);
    write.mockRestore();
    await storage.replace(state('new'));
    expect(await readOwnerOnlyJsonFile(filePath)).toEqual(state('new'));
  });

  it('does not resurrect leftover legacy credentials after a partially failed logout', async () => {
    const legacy = path.join(directory, 'legacy', 'auth.json');
    await writeOwnerOnlyJsonFile(filePath, state('old'));
    await writeOwnerOnlyJsonFile(legacy, state('old-legacy'));
    const realRemove = secureFiles.removeOwnerOnlyFile;
    const remove = jest.spyOn(secureFiles, 'removeOwnerOnlyFile').mockImplementation(async target => {
      if (target === legacy) throw new Error('legacy cleanup failed');
      await realRemove(target);
    });
    await expect(new FileAuthStorage(filePath, legacy).clear()).rejects.toThrow('legacy cleanup failed');
    const next = new FileAuthStorage(filePath, legacy);
    await expect(next.load()).resolves.toBeNull();
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(next.replace(state('new'))).rejects.toThrow('legacy cleanup failed');
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    remove.mockRestore();
    await next.replace(state('new'));
    await expect(new FileAuthStorage(filePath, legacy).load()).resolves.toEqual(state('new'));
  });

  it('releases a storage lock after an operation rejects', async () => {
    await expect(withAuthStorageLock(filePath, async () => { throw new Error('failure'); })).rejects.toThrow('failure');
    await expect(withAuthStorageLock(filePath, async () => 7)).resolves.toBe(7);
    expect((await fs.readdir(directory)).filter(name => name.endsWith('.lock'))).toEqual([]);
  });

  it('prevents a separate child process from recreating credentials after logout', async () => {
    await writeOwnerOnlyJsonFile(filePath, state('initial'));
    const runner = path.join(directory, 'writer.cjs');
    const root = path.resolve(__dirname, '../..');
    await fs.writeFile(runner, `
const fs = require('node:fs');
const ts = require(${JSON.stringify(require.resolve('typescript'))});
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }
).outputText, filename);
const { FileAuthStorage } = require(${JSON.stringify(path.join(root, 'src/blink-api/auth-storage.ts'))});
const storage = new FileAuthStorage(process.argv[2]);
storage.load().then(() => {
  process.send('loaded');
  process.once('message', async () => {
    try { await storage.save({ accessToken: 'stale' }); process.send('saved'); }
    catch (error) { process.send(error.name); }
    finally { process.disconnect(); }
  });
}).catch(() => { process.send('setup-failed'); process.disconnect(); });
`);
    const child = fork(runner, [filePath], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const nextMessage = () => new Promise<unknown>((resolve, reject) => {
      child.once('message', resolve);
      child.once('error', reject);
    });
    try {
      expect(await nextMessage()).toBe('loaded');
      await new FileAuthStorage(filePath).clear();
      const result = nextMessage();
      child.send('save');
      expect(await result).toBe('AuthStateChangedError');
      await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      child.kill();
    }
  });
});
