import {
  hardenOwnerOnlyFileMode,
  readOwnerOnlyJsonFile,
  removeOwnerOnlyFile,
  SecureJsonFileSecurityError,
  writeOwnerOnlyJsonFile,
} from '../../src/blink-api/secure-json-file';
import { execFileSync } from 'node:child_process';
import { constants as fsConstants, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('owner-only JSON files', () => {
  let directory: string;
  let filePath: string;
  const itIfPosix = process.platform === 'win32' ? it.skip : it;

  const captureFifoOutcome = async (
    operation: () => Promise<unknown>,
  ): Promise<{ error: unknown } | { resolved: true } | { timedOut: true }> => {
    const settledOperation: Promise<{ error: unknown } | { resolved: true }> = operation().then(
      () => ({ resolved: true as const }),
      (error: unknown) => ({ error }),
    );
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      settledOperation,
      new Promise<{ timedOut: true }>((resolve) => {
        timeout = setTimeout(() => resolve({ timedOut: true }), 500);
      }),
    ]);
    if (timeout) clearTimeout(timeout);

    if ('timedOut' in outcome) {
      const writer = await fs.open(filePath, fsConstants.O_WRONLY);
      try {
        await settledOperation;
      } finally {
        await writer.close();
      }
    }

    return outcome;
  };

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

  itIfPosix('normalizes an owner-only regular file to exact 0600', async () => {
    await fs.writeFile(filePath, JSON.stringify({ value: 1 }), { mode: 0o400 });

    await hardenOwnerOnlyFileMode(filePath);

    expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
  });

  itIfPosix('writes exact 0600 under a restrictive process umask', async () => {
    const previousUmask = process.umask(0o400);
    try {
      await writeOwnerOnlyJsonFile(filePath, { value: 1 });
    } finally {
      process.umask(previousUmask);
    }

    expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
  });

  itIfPosix('rejects a FIFO before string hardening can block', async () => {
    execFileSync('mkfifo', [filePath]);

    const outcome = await captureFifoOutcome(() => hardenOwnerOnlyFileMode(filePath));

    expect(outcome).toEqual({ error: expect.any(SecureJsonFileSecurityError) });
  });

  itIfPosix('rejects a FIFO before reading can block', async () => {
    execFileSync('mkfifo', [filePath]);

    const outcome = await captureFifoOutcome(() => readOwnerOnlyJsonFile(filePath));

    expect(outcome).toEqual({ error: expect.any(SecureJsonFileSecurityError) });
  });

  it('removes an existing file and ignores ENOENT', async () => {
    await writeOwnerOnlyJsonFile(filePath, { value: 1 });
    await removeOwnerOnlyFile(filePath);
    await removeOwnerOnlyFile(filePath);
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
