import {
  AuthStateFileSecurityError,
  readPersistedAuthStateFile,
} from '../blink-api/auth';
import { BlinkAuthState } from '../types';
import * as path from 'node:path';

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

const describeUiFilePath = (filePath: string): string => {
  return path.basename(filePath) || 'auth state file';
};

const describeUiError = (error: unknown, filePath: string): string => {
  return describeError(error).split(filePath).join(describeUiFilePath(filePath));
};

export async function loadPersistedAuthStateFromFiles(
  filePaths: string[],
  logDebug: (message: string) => void,
  nowMs = Date.now,
): Promise<PersistedAuthStateLoadResult> {
  let ignoredMessage: string | undefined;

  for (const filePath of filePaths) {
    const uiFilePath = describeUiFilePath(filePath);
    try {
      const state = await readPersistedAuthStateFile(filePath);
      if (!state?.accessToken) {
        ignoredMessage = `Persisted Blink authentication was ignored: ${uiFilePath} does not contain an access token`;
        logDebug(`Persisted Blink authentication was ignored: ${filePath} does not contain an access token`);
        continue;
      }
      if (state.tokenExpiry) {
        const expiry = new Date(state.tokenExpiry);
        const expiryMs = expiry.getTime();
        if (Number.isNaN(expiryMs)) {
          ignoredMessage = `Persisted Blink authentication was ignored: saved token in ${uiFilePath} has invalid expiry ${state.tokenExpiry}`;
          logDebug(
            `Persisted Blink authentication was ignored: saved token at ${filePath} has invalid expiry ${state.tokenExpiry}`,
          );
          continue;
        }
        if (expiryMs <= nowMs()) {
          ignoredMessage = `Persisted Blink authentication was ignored: saved token in ${uiFilePath} expired at ${state.tokenExpiry}`;
          logDebug(
            `Persisted Blink authentication was ignored: saved token at ${filePath} expired at ${state.tokenExpiry}`,
          );
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
        const message = `Persisted Blink authentication was ignored: ${describeUiError(error, filePath)}`;
        logDebug(`Persisted Blink authentication was ignored: ${error.message}`);
        return { state: null, message };
      }

      ignoredMessage = `Persisted Blink authentication was ignored: failed to read ${uiFilePath}: ${describeUiError(error, filePath)}`;
      logDebug(`Persisted Blink authentication was ignored: failed to read ${filePath}: ${describeError(error)}`);
    }
  }
  return { state: null, message: ignoredMessage };
}
