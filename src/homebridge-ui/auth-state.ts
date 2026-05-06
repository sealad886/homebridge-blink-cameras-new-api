import {
  AuthStateFileSecurityError,
  readPersistedAuthStateFile,
} from '../blink-api/auth';
import { BlinkAuthState } from '../types';

export interface PersistedAuthStateLoadResult {
  state: BlinkAuthState | null;
  message?: string;
}

const isNodeError = (error: unknown, code: string): boolean => {
  return (error as { code?: string }).code === code;
};

const describeError = (error: unknown): string => {
  return error instanceof Error ? error.message : 'Unknown error';
};

export async function loadPersistedAuthStateFromFiles(
  filePaths: string[],
  logDebug: (message: string) => void,
  nowMs = Date.now,
): Promise<PersistedAuthStateLoadResult> {
  for (const filePath of filePaths) {
    try {
      const state = await readPersistedAuthStateFile(filePath);
      if (!state?.accessToken) continue;
      if (state.tokenExpiry) {
        const expiry = new Date(state.tokenExpiry);
        if (!Number.isNaN(expiry.getTime()) && expiry.getTime() <= nowMs()) {
          logDebug(`Persisted auth state at ${filePath} has expired token; skipping`);
          continue;
        }
      }
      logDebug(`Loaded valid persisted auth state from ${filePath}`);
      return { state };
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) {
        continue;
      }

      if (error instanceof AuthStateFileSecurityError) {
        const message = `Persisted Blink authentication was ignored: ${error.message}`;
        logDebug(message);
        return { state: null, message };
      }

      logDebug(`Failed to read persisted auth state from ${filePath}: ${describeError(error)}`);
    }
  }
  return { state: null };
}
