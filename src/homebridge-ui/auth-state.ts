import { isPersistedAuthState } from '../blink-api/auth-state';
import {
  readOwnerOnlyJsonFile,
  SecureJsonFileSecurityError,
} from '../blink-api/secure-json-file';
import { BlinkAuthState } from '../types';
import * as path from 'node:path';

export interface PersistedAuthStateLoadResult {
  state: BlinkAuthState | null;
  requiresRefresh?: boolean;
  message?: string;
}

const isNodeError = (error: unknown, code: string): boolean => {
  return (error as { code?: string }).code === code;
};

const describeUiFilePath = (filePath: string): string => {
  return path.basename(filePath) || 'auth state file';
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export async function loadPersistedAuthStateFromFiles(
  filePaths: string[],
  logDebug: (message: string) => void,
  nowMs = Date.now,
): Promise<PersistedAuthStateLoadResult> {
  let ignoredMessage: string | undefined;
  // Only an absent primary permits legacy lookup. Invalid or unreadable
  // primary state remains authoritative; do not silently select another account.
  for (const filePath of filePaths) {
    const uiFilePath = describeUiFilePath(filePath);
    try {
      const value = await readOwnerOnlyJsonFile<unknown>(filePath);
      if (!isRecord(value) || typeof value.accessToken !== 'string' || value.accessToken.trim().length === 0) {
        ignoredMessage = `Persisted Blink authentication was ignored: ${uiFilePath} does not contain an access token`;
        logDebug(`Persisted Blink authentication was ignored: ${uiFilePath} does not contain an access token`);
        break;
      }
      if (!isPersistedAuthState(value)) {
        ignoredMessage = `Persisted Blink authentication was ignored: ${uiFilePath} contains invalid authentication data`;
        logDebug(`Persisted Blink authentication was ignored: ${uiFilePath} contains invalid authentication data`);
        break;
      }
      const state = value;
      if (state.tokenExpiry) {
        const expiry = new Date(state.tokenExpiry);
        const expiryMs = expiry.getTime();
        if (Number.isNaN(expiryMs)) {
          ignoredMessage = `Persisted Blink authentication was ignored: saved token in ${uiFilePath} has invalid expiry`;
          logDebug(
            `Persisted Blink authentication was ignored: saved token in ${uiFilePath} has invalid expiry`,
          );
          break;
        }
        if (expiryMs <= nowMs()) {
          if (typeof state.refreshToken === 'string' && state.refreshToken.trim().length > 0) {
            logDebug(`Persisted Blink authentication in ${uiFilePath} requires token refresh`);
            return { state, requiresRefresh: true };
          }
          ignoredMessage = `Persisted Blink authentication was ignored: saved token in ${uiFilePath} is expired`;
          logDebug(
            `Persisted Blink authentication was ignored: saved token in ${uiFilePath} is expired`,
          );
          break;
        }
      }
      logDebug(`Loaded valid persisted auth state from ${uiFilePath}`);
      return { state };
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) {
        continue;
      }

      if (error instanceof SecureJsonFileSecurityError) {
        const issue = error.message.includes('symlink')
          ? 'symlinked auth state file'
          : 'unsafe auth state file';
        const message = `Persisted Blink authentication was ignored: ${issue}: ${uiFilePath}`;
        logDebug(message);
        return { state: null, message };
      }

      ignoredMessage = `Persisted Blink authentication was ignored: failed to read ${uiFilePath}`;
      logDebug(`Persisted Blink authentication was ignored: failed to read ${uiFilePath}`);
      break;
    }
  }
  return { state: null, message: ignoredMessage };
}
