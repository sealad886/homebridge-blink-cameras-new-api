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

const isOptionalString = (value: unknown): boolean => {
  return value === undefined || value === null || typeof value === 'string';
};

const isPersistedAuthState = (value: unknown): value is BlinkAuthState => {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.accessToken === 'string'
    && value.accessToken.trim().length > 0
    && isOptionalString(value.refreshToken)
    && isOptionalString(value.tokenAuth)
    && isOptionalString(value.tokenExpiry)
    && isOptionalString(value.oauthClientId)
    && isOptionalString(value.email)
    && isOptionalString(value.hardwareId)
    && isOptionalString(value.region)
    && isOptionalString(value.tier)
    && (value.accountId === undefined || value.accountId === null || Number.isSafeInteger(value.accountId))
    && (value.clientId === undefined || value.clientId === null || Number.isSafeInteger(value.clientId))
    && isOptionalString(value.updatedAt);
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

  for (const [index, filePath] of filePaths.entries()) {
    processed = index + 1;
    logProgress(filePath, processed);
    const uiFilePath = describeUiFilePath(filePath);
    try {
      const value = await readOwnerOnlyJsonFile<unknown>(filePath);
      if (!isRecord(value) || typeof value.accessToken !== 'string' || value.accessToken.trim().length === 0) {
        ignoredMessage = `Persisted Blink authentication was ignored: ${uiFilePath} does not contain an access token`;
        logDebug(`Persisted Blink authentication was ignored: ${uiFilePath} does not contain an access token`);
        continue;
      }
      if (!isPersistedAuthState(value)) {
        ignoredMessage = `Persisted Blink authentication was ignored: ${uiFilePath} contains invalid authentication data`;
        logDebug(`Persisted Blink authentication was ignored: ${uiFilePath} contains invalid authentication data`);
        continue;
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
          continue;
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
          continue;
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
    }
  }
  complete();
  return { state: null, message: ignoredMessage };
}
