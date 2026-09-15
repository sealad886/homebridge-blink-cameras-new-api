import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { BlinkAuthState, BlinkAuthStorage } from '../types';
import { invalidateAuthStorageGeneration, withAuthStorageLock } from './auth-storage-lock';
import { InvalidAuthStateError, isPersistedAuthState } from './auth-state';
import {
  readOwnerOnlyTextFile,
  removeOwnerOnlyFile,
  writeOwnerOnlyJsonFile,
} from './secure-json-file';

export class AuthStateChangedError extends Error {
  constructor() {
    super('Stored Blink authentication changed. Restart the child bridge to use the current sign-in.');
    this.name = 'AuthStateChangedError';
  }
}

const fingerprint = (text: string | null): string | null => text === null
  ? null
  : createHash('sha256').update(text).digest('hex');

function parseState(text: string): BlinkAuthState {
  let state: unknown;
  try {
    state = JSON.parse(text);
  } catch {
    throw new InvalidAuthStateError();
  }
  if (!isPersistedAuthState(state)) throw new InvalidAuthStateError();
  return state;
}

const sessionContents = (state: BlinkAuthState): string => JSON.stringify(
  Object.entries(state)
    .filter(([key, value]) => key !== 'updatedAt' && value != null)
    .sort(([left], [right]) => left.localeCompare(right)),
);

/** Atomic writes alone cannot stop a stale child bridge overwriting a new login. */
export class FileAuthStorage implements BlinkAuthStorage {
  private expected: string | null | undefined;

  constructor(private readonly filePath: string, private readonly legacyPath?: string) {}

  private async currentFingerprint(text = this.readText()): Promise<string | null> {
    const primary = await text;
    const legacy = primary === null && this.legacyPath ? await this.readText(this.legacyPath) : null;
    return fingerprint(JSON.stringify([primary, legacy, await this.readText(`${this.filePath}.generation.json`)]));
  }

  private async readText(filePath = this.filePath): Promise<string | null> {
    try {
      return await readOwnerOnlyTextFile(filePath);
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return null;
      throw error;
    }
  }

  async load(): Promise<BlinkAuthState | null> {
    return withAuthStorageLock(this.filePath, async () => {
      let text = await this.readText();
      this.expected = await this.currentFingerprint(Promise.resolve(text));
      try {
        if (text === null && this.legacyPath) {
          const legacy = await this.readText(this.legacyPath);
          if (legacy !== null) {
            const state = parseState(legacy);
            // Copy the same session before cleanup, so cleanup failures never
            // remove the only durable credentials.
            await writeOwnerOnlyJsonFile(this.filePath, state);
            await this.removeLegacy();
            text = await this.readText();
          }
        }
        return text === null ? null : parseState(text);
      } finally {
        this.expected = await this.currentFingerprint();
      }
    });
  }

  async hasChanged(): Promise<boolean> {
    return withAuthStorageLock(this.filePath, async () => (
      this.expected !== undefined && await this.currentFingerprint() !== this.expected
    ));
  }

  async save(state: BlinkAuthState): Promise<void> {
    if (!isPersistedAuthState(state)) throw new InvalidAuthStateError();
    await withAuthStorageLock(this.filePath, async () => {
      const current = await this.currentFingerprint();
      if (this.expected === undefined || current !== this.expected) {
        throw new AuthStateChangedError();
      }
      const existing = await this.readText();
      if (existing !== null && sessionContents(parseState(existing)) === sessionContents(state)) {
        // A connection test must not invalidate a running bridge just to update a timestamp.
        return;
      }
      await writeOwnerOnlyJsonFile(this.filePath, state);
      this.expected = await this.currentFingerprint();
    });
  }

  /** Only a newly authenticated login may replace a different durable session. */
  async replace(state: BlinkAuthState): Promise<void> {
    if (!isPersistedAuthState(state)) throw new InvalidAuthStateError();
    await withAuthStorageLock(this.filePath, async () => {
      if (this.expected === undefined || await this.currentFingerprint() !== this.expected) {
        throw new AuthStateChangedError();
      }
      try {
        const previous = await this.readText();
        const previousPath = previous === null && this.legacyPath ? this.legacyPath : this.filePath;
        const previousContents = previous === null && this.legacyPath ? await this.readText(this.legacyPath) : previous;
        let previousState: BlinkAuthState | undefined;
        if (previousContents !== null) {
          try {
            previousState = parseState(previousContents);
          } catch {
            // Preserve exact damaged contents as an owner-only JSON string.
            await writeOwnerOnlyJsonFile(`${previousPath}.invalid-${randomUUID()}.json`, previousContents);
          }
        }
        if (previous === null && previousState) {
          // Establish the old session at the primary path before deleting its
          // legacy source. A later failure must not activate the new session.
          await writeOwnerOnlyJsonFile(this.filePath, previousState);
        }
        await this.removeLegacy();
        await writeOwnerOnlyJsonFile(this.filePath, state);
      } finally {
        // Cleanup or migration may have changed storage even when replacement
        // fails. Keep this instance's compare-and-swap baseline consistent.
        this.expected = await this.currentFingerprint();
      }
    });
  }

  async clear(): Promise<void> {
    await withAuthStorageLock(this.filePath, async () => {
      await invalidateAuthStorageGeneration(this.filePath);
      await removeOwnerOnlyFile(this.filePath);
      await this.removeLegacy();
      this.expected = await this.currentFingerprint();
    });
  }

  private async removeLegacy(): Promise<void> {
    if (!this.legacyPath) return;
    await removeOwnerOnlyFile(this.legacyPath);
    try {
      await fs.rmdir(path.dirname(this.legacyPath));
    } catch {
      // The directory may contain unrelated files; preserve them.
    }
  }
}
