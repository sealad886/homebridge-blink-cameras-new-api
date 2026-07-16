import { Buffer } from 'node:buffer';
import { createHash, timingSafeEqual } from 'node:crypto';
import { URL } from 'node:url';

import type {
  BlinkHostedOAuthStart,
  BlinkHostedOAuthTokenRequest,
  BlinkHostedOAuthTransaction,
} from '../types';
import {
  buildHostedAuthorizationUrl,
  HOSTED_ANDROID_OAUTH_PROFILE,
} from './oauth-profile';
import {
  generateOAuthFlowId,
  generateOAuthState,
  generatePKCEPair,
} from './oauth-pkce';
import {
  readOwnerOnlyJsonFile,
  removeOwnerOnlyFile,
  writeOwnerOnlyJsonFile,
} from './secure-json-file';

export const HOSTED_OAUTH_TTL_MS = 15 * 60 * 1000;
export const MAX_HOSTED_CALLBACK_BYTES = 2048;
const FLOW_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CALLBACK_AUTHORITY = 'applinks.blink.com';
const CALLBACK_PATH = '/signin/callback';
const CALLBACK_QUERY_PREFIX = `https://${CALLBACK_AUTHORITY}${CALLBACK_PATH}?`;
const TRANSACTION_KEYS = [
  'codeChallenge',
  'codeVerifier',
  'createdAt',
  'expiresAt',
  'flowId',
  'hardwareId',
  'oauthClientId',
  'redirectUri',
  'state',
  'version',
] as const;

const MALFORMED_MESSAGE =
  'Blink sign-in callback is incomplete or invalid. Copy the complete callback URL and try again.';
const SECURITY_MESSAGE =
  'Blink sign-in transaction could not be verified. Start sign-in again.';
const EXPIRED_MESSAGE =
  'Blink sign-in transaction expired. Start sign-in again.';
const OAUTH_MESSAGE =
  'Blink sign-in was not completed. Start sign-in again.';
const MISSING_MESSAGE =
  'No pending Blink sign-in transaction was found. Start sign-in again.';

interface ParsedHostedCallback {
  state: string;
  authorizationCode: string | null;
  hasOAuthError: boolean;
}

const pendingFileOperations = new Map<string, Promise<void>>();

const isNodeError = (error: unknown, code: string): boolean => {
  return (error as { code?: string }).code === code;
};

const hasExactKeys = (value: Record<string, unknown>): boolean => {
  const keys = Object.keys(value).sort();
  return keys.length === TRANSACTION_KEYS.length
    && keys.every((key, index) => key === TRANSACTION_KEYS[index]);
};

const isCanonicalBase64Url = (
  value: unknown,
  encodedLength: number,
  decodedLength: number,
): value is string => {
  if (
    typeof value !== 'string'
    || value.length !== encodedLength
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return false;
  }
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === decodedLength && decoded.toString('base64url') === value;
};

const parseCanonicalTimestamp = (value: unknown): number | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    return null;
  }
  return timestamp;
};

const hasForbiddenRawCallbackCharacter = (callbackUrl: string): boolean => {
  for (let index = 0; index < callbackUrl.length; index += 1) {
    const codeUnit = callbackUrl.charCodeAt(index);
    if (codeUnit <= 0x20 || codeUnit === 0x23 || codeUnit === 0x7f) {
      return true;
    }
  }
  return false;
};

const throwValidation = (
  category: HostedOAuthValidationError['category'],
  message: string,
): never => {
  throw new HostedOAuthValidationError(message, category);
};

async function withPendingFileLock<T>(
  pendingFilePath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = pendingFileOperations.get(pendingFilePath) ?? Promise.resolve();
  let release = (): void => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  pendingFileOperations.set(pendingFilePath, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (pendingFileOperations.get(pendingFilePath) === queued) {
      pendingFileOperations.delete(pendingFilePath);
    }
  }
}

export class HostedOAuthValidationError extends Error {
  constructor(
    message: string,
    public readonly category: 'malformed' | 'security' | 'expired' | 'oauth' | 'missing',
  ) {
    super(message);
    this.name = 'HostedOAuthValidationError';
  }
}

export class HostedOAuthCoordinator {
  constructor(private readonly options: {
    pendingFilePath: string;
    hardwareId: string;
    tier?: string;
    now?: () => number;
  }) {}

  async start(): Promise<BlinkHostedOAuthStart> {
    return withPendingFileLock(this.options.pendingFilePath, async () => {
      const now = this.currentTime();
      const { codeVerifier, codeChallenge } = generatePKCEPair();
      const transaction: BlinkHostedOAuthTransaction = {
        version: 1,
        flowId: generateOAuthFlowId(),
        state: generateOAuthState(),
        codeVerifier,
        codeChallenge,
        oauthClientId: HOSTED_ANDROID_OAUTH_PROFILE.clientId,
        redirectUri: HOSTED_ANDROID_OAUTH_PROFILE.redirectUri,
        hardwareId: this.options.hardwareId,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + HOSTED_OAUTH_TTL_MS).toISOString(),
      };
      const authorizationUrl = buildHostedAuthorizationUrl(transaction, this.options.tier);

      await writeOwnerOnlyJsonFile(this.options.pendingFilePath, transaction);
      return {
        authorizationUrl,
        flowId: transaction.flowId,
        expiresAt: transaction.expiresAt,
      };
    });
  }

  async consumeCallback(
    flowId: string,
    callbackUrl: string,
  ): Promise<BlinkHostedOAuthTokenRequest> {
    const callback = this.parseCallback(callbackUrl);

    return withPendingFileLock(this.options.pendingFilePath, async () => {
      const transaction = await this.loadTransaction();
      const expiry = Date.parse(transaction.expiresAt);

      if (this.currentTime() >= expiry) {
        await removeOwnerOnlyFile(this.options.pendingFilePath);
        throwValidation('expired', EXPIRED_MESSAGE);
      }

      if (!FLOW_ID_PATTERN.test(flowId) || flowId !== transaction.flowId) {
        await removeOwnerOnlyFile(this.options.pendingFilePath);
        throwValidation('security', SECURITY_MESSAGE);
      }

      const expectedState = Buffer.from(transaction.state, 'utf8');
      const suppliedState = Buffer.from(callback.state, 'utf8');
      const stateMatches = suppliedState.length === expectedState.length
        && timingSafeEqual(suppliedState, expectedState);
      if (!stateMatches) {
        await removeOwnerOnlyFile(this.options.pendingFilePath);
        throwValidation('security', SECURITY_MESSAGE);
      }

      await removeOwnerOnlyFile(this.options.pendingFilePath);
      if (callback.hasOAuthError) {
        throwValidation('oauth', OAUTH_MESSAGE);
      }

      return {
        authorizationCode: callback.authorizationCode as string,
        codeVerifier: transaction.codeVerifier,
        oauthClientId: transaction.oauthClientId,
        redirectUri: transaction.redirectUri,
      };
    });
  }

  async cancel(): Promise<void> {
    await withPendingFileLock(this.options.pendingFilePath, async () => {
      await removeOwnerOnlyFile(this.options.pendingFilePath);
    });
  }

  private currentTime(): number {
    return (this.options.now ?? Date.now)();
  }

  private parseCallback(callbackUrl: string): ParsedHostedCallback {
    if (
      typeof callbackUrl !== 'string'
      || callbackUrl.length === 0
      || Buffer.byteLength(callbackUrl, 'utf8') > MAX_HOSTED_CALLBACK_BYTES
      || !callbackUrl.startsWith(CALLBACK_QUERY_PREFIX)
      || hasForbiddenRawCallbackCharacter(callbackUrl)
    ) {
      throwValidation('malformed', MALFORMED_MESSAGE);
    }

    let url: URL;
    try {
      url = new URL(callbackUrl);
    } catch {
      throw new HostedOAuthValidationError(MALFORMED_MESSAGE, 'malformed');
    }

    if (
      url.protocol !== 'https:'
      || url.hostname !== CALLBACK_AUTHORITY
      || url.port !== ''
      || url.username !== ''
      || url.password !== ''
      || url.pathname !== CALLBACK_PATH
      || url.hash !== ''
    ) {
      throwValidation('malformed', MALFORMED_MESSAGE);
    }

    const states = url.searchParams.getAll('state');
    const codes = url.searchParams.getAll('code');
    const errors = url.searchParams.getAll('error');
    const errorDescriptions = url.searchParams.getAll('error_description');
    const hasSingleCode = codes.length === 1 && codes[0].length > 0;
    const hasSingleError = errors.length === 1 && errors[0].length > 0;

    if (
      states.length !== 1
      || codes.length > 1
      || errors.length > 1
      || errorDescriptions.length > 1
      || (!hasSingleCode && !hasSingleError)
      || (codes.length > 0 && errors.length > 0)
      || (errorDescriptions.length === 1 && !hasSingleError)
    ) {
      throwValidation('malformed', MALFORMED_MESSAGE);
    }

    return {
      state: states[0],
      authorizationCode: hasSingleCode ? codes[0] : null,
      hasOAuthError: hasSingleError,
    };
  }

  private async loadTransaction(): Promise<BlinkHostedOAuthTransaction> {
    let value: unknown;
    try {
      value = await readOwnerOnlyJsonFile<unknown>(this.options.pendingFilePath);
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) {
        throwValidation('missing', MISSING_MESSAGE);
      }
      if (error instanceof SyntaxError) {
        await removeOwnerOnlyFile(this.options.pendingFilePath);
        throwValidation('missing', MISSING_MESSAGE);
      }
      throw error;
    }

    if (!this.isValidTransaction(value)) {
      await removeOwnerOnlyFile(this.options.pendingFilePath);
      throw new HostedOAuthValidationError(MISSING_MESSAGE, 'missing');
    }
    return value;
  }

  private isValidTransaction(value: unknown): value is BlinkHostedOAuthTransaction {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }
    const transaction = value as Record<string, unknown>;
    if (
      !hasExactKeys(transaction)
      || transaction.version !== 1
      || transaction.oauthClientId !== HOSTED_ANDROID_OAUTH_PROFILE.clientId
      || transaction.redirectUri !== HOSTED_ANDROID_OAUTH_PROFILE.redirectUri
      || transaction.hardwareId !== this.options.hardwareId
      || !isCanonicalBase64Url(transaction.flowId, 43, 32)
      || !isCanonicalBase64Url(transaction.state, 43, 32)
      || !isCanonicalBase64Url(transaction.codeVerifier, 86, 64)
      || !isCanonicalBase64Url(transaction.codeChallenge, 43, 32)
    ) {
      return false;
    }

    const createdAt = parseCanonicalTimestamp(transaction.createdAt);
    const expiresAt = parseCanonicalTimestamp(transaction.expiresAt);
    if (
      createdAt === null
      || expiresAt === null
      || createdAt > this.currentTime()
      || expiresAt - createdAt !== HOSTED_OAUTH_TTL_MS
    ) {
      return false;
    }

    return createHash('sha256')
      .update(transaction.codeVerifier)
      .digest('base64url') === transaction.codeChallenge;
  }
}
