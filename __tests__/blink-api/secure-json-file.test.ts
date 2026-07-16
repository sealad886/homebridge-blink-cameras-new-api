import {
  hardenOwnerOnlyFileMode,
  readOwnerOnlyJsonFile,
  removeOwnerOnlyFile,
  SecureJsonFileSecurityError,
  writeOwnerOnlyJsonFile,
} from '../../src/blink-api/secure-json-file';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('owner-only JSON files', () => {
  let directory: string;
  let filePath: string;
  const itIfPosix = process.platform === 'win32' ? it.skip : it;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-secure-json-'));
    filePath = path.join(directory, '.state.json');
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('atomically writes and reads a regular owner-only file', async () => {
    await writeOwnerOnlyJsonFile(filePath, { value: 7 });
    expect(await readOwnerOnlyJsonFile<{ value: number }>(filePath)).toEqual({ value: 7 });
    if (process.platform !== 'win32') {
      expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
    }
    expect((await fs.readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('rejects a symlink without reading its target', async () => {
    const target = path.join(directory, 'target.json');
    await fs.writeFile(target, JSON.stringify({ secret: true }), { mode: 0o600 });
    await fs.symlink(target, filePath);
    await expect(readOwnerOnlyJsonFile(filePath)).rejects.toThrow(SecureJsonFileSecurityError);
  });

  it('rejects a regular file not owned by the effective process user', async () => {
    await fs.writeFile(filePath, JSON.stringify({ value: 1 }), { mode: 0o600 });
    if (process.platform === 'win32' || typeof process.getuid !== 'function') return;
    const fileUid = (await fs.stat(filePath)).uid;
    jest.spyOn(process, 'getuid').mockReturnValue(fileUid + 1);
    await expect(readOwnerOnlyJsonFile(filePath)).rejects.toThrow('not owned by the current process user');
  });

  itIfPosix('hardens path targets through an opened handle', async () => {
    const swapTarget = path.join(directory, 'swap-target.json');
    await fs.writeFile(filePath, JSON.stringify({ value: 1 }), { mode: 0o644 });
    await fs.writeFile(swapTarget, JSON.stringify({ secret: true }), { mode: 0o644 });
    const realChmod = fs.chmod.bind(fs);
    const pathChmodSpy = jest.spyOn(fs, 'chmod').mockImplementation(async (target, mode) => {
      await fs.unlink(filePath);
      await fs.symlink(swapTarget, filePath);
      await realChmod(target, mode);
    });

    await hardenOwnerOnlyFileMode(filePath);

    expect(pathChmodSpy).not.toHaveBeenCalled();
    expect((await fs.lstat(filePath)).isSymbolicLink()).toBe(false);
    expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
    expect((await fs.stat(swapTarget)).mode & 0o777).toBe(0o644);
  });

  it('removes an existing file and ignores ENOENT', async () => {
    await writeOwnerOnlyJsonFile(filePath, { value: 1 });
    await removeOwnerOnlyFile(filePath);
    await removeOwnerOnlyFile(filePath);
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
