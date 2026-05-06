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
  let ignoredMessage: string | undefined;

  for (const filePath of filePaths) {
    try {
      const state = await readPersistedAuthStateFile(filePath);
      if (!state?.accessToken) {
        ignoredMessage = `Persisted Blink authentication was ignored: ${filePath} does not contain an access token`;
        logDebug(ignoredMessage);
        continue;
      }
      if (state.tokenExpiry) {
        const expiry = new Date(state.tokenExpiry);
        const expiryMs = expiry.getTime();
        if (Number.isNaN(expiryMs)) {
          ignoredMessage = `Persisted Blink authentication was ignored: saved token at ${filePath} has invalid expiry ${state.tokenExpiry}`;
          logDebug(ignoredMessage);
          continue;
        }
        if (expiryMs <= nowMs()) {
          ignoredMessage = `Persisted Blink authentication was ignored: saved token at ${filePath} expired at ${state.tokenExpiry}`;
          logDebug(ignoredMessage);
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

      ignoredMessage = `Persisted Blink authentication was ignored: failed to read ${filePath}: ${describeError(error)}`;
      logDebug(ignoredMessage);
    }
  }
  return { state: null, message: ignoredMessage };
}
