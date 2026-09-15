import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readOwnerOnlyTextFile, writeOwnerOnlyJsonFile } from './secure-json-file';

/** Called while holding the auth-file lock, including when no tokens exist yet. */
export async function invalidateAuthStorageGeneration(filePath: string): Promise<void> {
  await writeOwnerOnlyJsonFile(`${filePath}.generation.json`, randomUUID());
}

/** Once logout invalidates storage, leftover legacy files cannot restore it. */
export async function legacyAuthStorageAllowed(filePath: string): Promise<boolean> {
  try {
    await readOwnerOnlyTextFile(`${filePath}.generation.json`);
    return false;
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return true;
    throw error;
  }
}

/** Coordinate short credential-file operations between the UI and child bridge. */
export async function withAuthStorageLock<T>(
  filePath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lockPath = `${path.resolve(filePath)}.lock`;
  await fs.mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      await fs.mkdir(lockPath, { mode: 0o700 });
      break;
    } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) {
        // Never steal an active lock or guess whether its owning process died.
        throw new Error('Blink authentication storage is busy. If this persists, stop both Homebridge processes and remove the auth storage lock directory.');
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  try {
    return await operation();
  } finally {
    await fs.rmdir(lockPath);
  }
}
