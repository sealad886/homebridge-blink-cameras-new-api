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

const calculateEtaMs = (
  startedAt: number,
  processed: number,
  total: number,
  nowMs: () => number,
): number => {
  if (processed <= 0 || processed >= total) {
    return 0;
  }
  const elapsed = Math.max(0, nowMs() - startedAt);
  return Math.max(0, Math.round((elapsed / processed) * (total - processed)));
};

export async function loadPersistedAuthStateFromFiles(
  filePaths: string[],
  logDebug: (message: string) => void,
  nowMs = Date.now,
): Promise<PersistedAuthStateLoadResult> {
  let ignoredMessage: string | undefined;
  const total = filePaths.length;
  const startedAt = nowMs();
  let processed = 0;

  const logProgress = (filePath: string, index: number): void => {
    const percent = total === 0 ? 100 : Math.round((index / total) * 100);
    const etaMs = calculateEtaMs(startedAt, index, total, nowMs);
    logDebug(
      `Persisted Blink auth scan progress: ${index}/${total} (${percent}%) `
      + `file=${describeUiFilePath(filePath)} ETA ${etaMs}ms`,
    );
  };

  const complete = (): void => {
    logDebug(
      `Persisted Blink auth scan complete: ${processed}/${total} (100%) ETA 0ms`,
    );
  };

  // Only an absent primary permits legacy lookup. Invalid or unreadable
  // primary state remains authoritative; do not silently select another account.
  for (const [index, filePath] of filePaths.entries()) {
    processed = index + 1;
    logProgress(filePath, processed);
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
            complete();
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
      complete();
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
        complete();
        return { state: null, message };
      }

      ignoredMessage = `Persisted Blink authentication was ignored: failed to read ${uiFilePath}`;
      logDebug(`Persisted Blink authentication was ignored: failed to read ${uiFilePath}`);
      break;
    }
  }
  complete();
  return { state: null, message: ignoredMessage };
}
