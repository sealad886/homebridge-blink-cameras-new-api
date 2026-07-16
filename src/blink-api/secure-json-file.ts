import { randomUUID } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import type { Stats } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import * as path from 'node:path';
import process from 'node:process';

const OWNER_ONLY_FILE_MODE = 0o600;
const POSIX_MODE_MASK = 0o777;
const noFollowFlag = fsConstants.O_NOFOLLOW ?? 0;
const nonBlockingFlag = fsConstants.O_NONBLOCK ?? 0;
const secureReadOpenFlags = fsConstants.O_RDONLY | noFollowFlag | nonBlockingFlag;

const isNodeError = (error: unknown, code: string): boolean => {
  return (error as { code?: string }).code === code;
};

const isSameFile = (
  pathStats: Awaited<ReturnType<typeof fs.lstat>>,
  handleStats: Awaited<ReturnType<FileHandle['stat']>>,
): boolean => {
  return pathStats.dev === handleStats.dev && pathStats.ino === handleStats.ino;
};

const formatFileMode = (mode: number): string => {
  return `0${(mode & POSIX_MODE_MASK).toString(8)}`;
};

const hasOwnerOnlyFileMode = (mode: number): boolean => {
  return (mode & POSIX_MODE_MASK) === OWNER_ONLY_FILE_MODE;
};

const requireCurrentProcessOwner = (stats: Pick<Stats, 'uid'>, filePath: string): void => {
  if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
    throw new SecureJsonFileSecurityError(
      `Persisted auth state file is not owned by the current process user: ${filePath}`,
    );
  }
};

export class SecureJsonFileSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecureJsonFileSecurityError';
  }
}

async function hardenOpenedOwnerOnlyFileMode(
  target: Pick<FileHandle, 'chmod' | 'stat'>,
  filePath: string,
): Promise<void> {
  const originalStats = await target.stat();
  if (originalStats.isSymbolicLink()) {
    throw new SecureJsonFileSecurityError(`Refusing to harden symlinked auth state file: ${filePath}`);
  }
  if (!originalStats.isFile()) {
    throw new SecureJsonFileSecurityError(`Auth state path is not a regular file: ${filePath}`);
  }

  const originalMode = originalStats.mode;
  if (hasOwnerOnlyFileMode(originalMode)) {
    return;
  }

  try {
    await target.chmod(OWNER_ONLY_FILE_MODE);
  } catch {
    if (process.platform !== 'win32') {
      throw new SecureJsonFileSecurityError(
        `Persisted auth state file permissions are ${formatFileMode(originalMode)} ` +
        `and could not be tightened to ${formatFileMode(OWNER_ONLY_FILE_MODE)}: ${filePath}`,
      );
    }
    return;
  }

  if (process.platform === 'win32') {
    return;
  }

  const hardenedMode = (await target.stat()).mode;
  if (!hasOwnerOnlyFileMode(hardenedMode)) {
    throw new SecureJsonFileSecurityError(
      `Persisted auth state file permissions remain ${formatFileMode(hardenedMode)} ` +
      `after tightening to ${formatFileMode(OWNER_ONLY_FILE_MODE)}: ${filePath}`,
    );
  }
}

export async function hardenOwnerOnlyFileMode(
  target: string | Pick<FileHandle, 'chmod' | 'stat'>,
  filePath = typeof target === 'string' ? target : 'auth state file',
): Promise<void> {
  if (typeof target !== 'string') {
    await hardenOpenedOwnerOnlyFileMode(target, filePath);
    return;
  }

  let handle: FileHandle | null = null;
  try {
    const initialStats = await fs.lstat(target);
    if (initialStats.isSymbolicLink()) {
      throw new SecureJsonFileSecurityError(`Refusing to harden symlinked auth state file: ${filePath}`);
    }
    if (!initialStats.isFile()) {
      throw new SecureJsonFileSecurityError(`Auth state path is not a regular file: ${filePath}`);
    }

    handle = await fs.open(target, secureReadOpenFlags);
    const [pathStats, handleStats] = await Promise.all([
      fs.lstat(target),
      handle.stat(),
    ]);
    if (pathStats.isSymbolicLink()) {
      throw new SecureJsonFileSecurityError(`Refusing to harden symlinked auth state file: ${filePath}`);
    }
    if (!pathStats.isFile() || !handleStats.isFile()) {
      throw new SecureJsonFileSecurityError(`Auth state path is not a regular file: ${filePath}`);
    }
    if (!isSameFile(pathStats, handleStats)) {
      throw new SecureJsonFileSecurityError(`Auth state file changed while opening: ${filePath}`);
    }
    requireCurrentProcessOwner(handleStats, filePath);

    await hardenOpenedOwnerOnlyFileMode(handle, filePath);
  } catch (error) {
    if (isNodeError(error, 'ELOOP')) {
      throw new SecureJsonFileSecurityError(`Refusing to harden symlinked auth state file: ${filePath}`);
    }
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function readOwnerOnlyJsonFile<T>(filePath: string): Promise<T> {
  let handle: FileHandle | null = null;
  try {
    const initialStats = await fs.lstat(filePath);
    if (initialStats.isSymbolicLink()) {
      throw new SecureJsonFileSecurityError(`Refusing to use symlinked auth state file: ${filePath}`);
    }
    if (!initialStats.isFile()) {
      throw new SecureJsonFileSecurityError(`Auth state path is not a regular file: ${filePath}`);
    }

    handle = await fs.open(filePath, secureReadOpenFlags);
    const [pathStats, handleStats] = await Promise.all([
      fs.lstat(filePath),
      handle.stat(),
    ]);
    if (pathStats.isSymbolicLink()) {
      throw new SecureJsonFileSecurityError(`Refusing to use symlinked auth state file: ${filePath}`);
    }
    if (!pathStats.isFile() || !handleStats.isFile()) {
      throw new SecureJsonFileSecurityError(`Auth state path is not a regular file: ${filePath}`);
    }
    if (!isSameFile(pathStats, handleStats)) {
      throw new SecureJsonFileSecurityError(`Auth state file changed while opening: ${filePath}`);
    }
    requireCurrentProcessOwner(handleStats, filePath);

    await hardenOwnerOnlyFileMode(handle, filePath);
    const contents = await handle.readFile({ encoding: 'utf8' });
    return JSON.parse(contents) as T;
  } catch (error) {
    if (isNodeError(error, 'ELOOP')) {
      throw new SecureJsonFileSecurityError(`Refusing to use symlinked auth state file: ${filePath}`);
    }
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function writeOwnerOnlyJsonFile<T>(filePath: string, value: T): Promise<void> {
  const payload = JSON.stringify(value, null, 2);
  if (payload === undefined) {
    throw new TypeError('Owner-only JSON file value is not JSON-serializable');
  }

  const directory = path.dirname(filePath);
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  let handle: FileHandle | null = null;
  let ownsTempFile = false;

  try {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    handle = await fs.open(
      tempPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollowFlag,
      OWNER_ONLY_FILE_MODE,
    );
    ownsTempFile = true;
    await handle.writeFile(payload, { encoding: 'utf8' });
    await hardenOwnerOnlyFileMode(handle, tempPath);
    await handle.close();
    handle = null;
    await fs.rename(tempPath, filePath);
    ownsTempFile = false;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (ownsTempFile) {
      await fs.unlink(tempPath).catch(() => undefined);
    }
    throw error;
  }
}

export async function removeOwnerOnlyFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (!isNodeError(error, 'ENOENT')) {
      throw error;
    }
  }
}
