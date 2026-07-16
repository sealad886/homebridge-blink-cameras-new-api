import { Buffer } from 'node:buffer';
import * as path from 'node:path';

import { BlinkHostedReauthenticationRequiredError } from '../blink-api/auth';
import {
  BlinkApi,
  BlinkRestVerificationRequiredError,
} from '../blink-api/client';
import {
  readOwnerOnlyJsonFile,
  removeOwnerOnlyFile,
} from '../blink-api/secure-json-file';
import type {
  BlinkAuthState,
  BlinkConfig,
  BlinkHostedLoginResult,
  BlinkHostedOAuthStart,
  BlinkLogger,
  BlinkOAuthClientId,
} from '../types';
import { loadPersistedAuthStateFromFiles } from './auth-state';

const DEFAULT_HARDWARE_ID = 'homebridge-blink';
const DEVICE_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const FLOW_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const VERIFICATION_CODE_PATTERN = /^[A-Za-z0-9-]{4,12}$/;
const TIER_PATTERN = /^[A-Za-z0-9]{4}$/;
const SAFE_EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_{}|~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const MAX_CALLBACK_BYTES = 2048;

const INVALID_REQUEST_MESSAGE = 'Invalid Blink authentication request.';
const SIGN_IN_FAILED_MESSAGE = 'Blink sign-in could not be completed. Start sign-in again.';
const VERIFY_FAILED_MESSAGE = 'Blink verification could not be completed. Request a new code and try again.';
const NO_STORED_AUTH_MESSAGE = 'No stored Blink authentication was found. Sign in securely with Blink.';
const CLEAR_FAILED_MESSAGE = 'Blink authentication could not be fully cleared.';
const REAUTHENTICATION_MESSAGE =
  'Blink sign-in has expired. Open the plugin settings and sign in securely with Blink again.';

export interface HostedAuthStartRequest {
  deviceId?: string;
}

export interface HostedAuthCompleteRequest {
  flowId: string;
  callbackUrl: string;
}

export interface VerifyRequest {
  code: string;
  type: 'client' | 'account';
  trustDevice?: boolean;
}

export interface AuthStatus {
  authenticated: boolean;
  verified?: boolean;
  requiresClientVerification?: boolean;
  requiresAccountVerification?: boolean;
  email?: string;
  accountId?: number;
  tier?: string;
  message?: string;
}

export class HostedAuthServiceError extends Error {
  constructor(
    message: string,
    public readonly category: 'invalid_request' | 'authentication' | 'storage' | 'internal',
    public readonly status: number,
  ) {
    super(message);
    this.name = 'HostedAuthServiceError';
  }
}

interface HostedAuthServiceOptions {
  storageRoot: string;
  logger: BlinkLogger;
  apiFactory?: (config: BlinkConfig) => BlinkApi;
}

interface PersistedApiContext {
  api: BlinkApi;
  state: Pick<BlinkAuthState, 'email' | 'accountId' | 'tier'>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const hasExactKeys = (value: Record<string, unknown>, allowedKeys: readonly string[]): boolean => {
  const keys = Object.keys(value);
  return keys.length <= allowedKeys.length && keys.every(key => allowedKeys.includes(key));
};

const normalizeHardwareId = (value: unknown, allowDefault: boolean): string => {
  if (value === undefined && allowDefault) {
    return DEFAULT_HARDWARE_ID;
  }
  if (typeof value !== 'string') {
    throw new HostedAuthServiceError(INVALID_REQUEST_MESSAGE, 'invalid_request', 400);
  }
  const hardwareId = value.trim();
  if (!DEVICE_ID_PATTERN.test(hardwareId)) {
    throw new HostedAuthServiceError(INVALID_REQUEST_MESSAGE, 'invalid_request', 400);
  }
  return hardwareId;
};

const normalizeTier = (value: unknown): string => {
  return typeof value === 'string' && TIER_PATTERN.test(value) ? value.toLowerCase() : 'prod';
};

const normalizeOAuthClientId = (value: unknown): BlinkOAuthClientId => {
  if (value === 'android' || value === 'amazon' || value === 'ios') {
    return value;
  }
  return 'ios';
};

const safeMetadata = (state: Pick<BlinkAuthState, 'email' | 'accountId' | 'tier'>): Pick<
  AuthStatus,
  'email' | 'accountId' | 'tier'
> => {
  const metadata: Pick<AuthStatus, 'email' | 'accountId' | 'tier'> = {};
  if (
    typeof state.email === 'string'
    && state.email.length <= 320
    && SAFE_EMAIL_PATTERN.test(state.email)
  ) {
    metadata.email = state.email;
  }
  if (Number.isSafeInteger(state.accountId) && (state.accountId as number) > 0) {
    metadata.accountId = state.accountId as number;
  }
  if (typeof state.tier === 'string' && TIER_PATTERN.test(state.tier)) {
    metadata.tier = state.tier.toLowerCase();
  }
  return metadata;
};

export class HostedAuthService {
  private readonly apiFactory: (config: BlinkConfig) => BlinkApi;
  private api: BlinkApi | null = null;
  private lastStatus: AuthStatus | null = null;

  constructor(private readonly options: HostedAuthServiceOptions) {
    this.apiFactory = options.apiFactory ?? ((config: BlinkConfig) => new BlinkApi(config));
  }

  async start(payload: HostedAuthStartRequest): Promise<BlinkHostedOAuthStart> {
    const request = this.requirePayload(payload, ['deviceId']);
    const hardwareId = normalizeHardwareId(request.deviceId, true);
    const api = this.apiFactory(this.buildConfig(hardwareId, 'prod', 'android'));
    try {
      const result = await api.beginHostedLogin();
      this.api = api;
      this.lastStatus = null;
      return {
        authorizationUrl: result.authorizationUrl,
        flowId: result.flowId,
        expiresAt: result.expiresAt,
      };
    } catch {
      this.options.logger.warn('[Hosted Auth] Blink sign-in start failed.');
      throw new HostedAuthServiceError(
        'Blink sign-in could not be started. Try again.',
        'authentication',
        400,
      );
    }
  }

  async complete(payload: HostedAuthCompleteRequest): Promise<AuthStatus> {
    const request = this.requirePayload(payload, ['flowId', 'callbackUrl']);
    if (
      typeof request.flowId !== 'string'
      || !FLOW_ID_PATTERN.test(request.flowId)
      || typeof request.callbackUrl !== 'string'
      || request.callbackUrl.trim().length === 0
      || Buffer.byteLength(request.callbackUrl, 'utf8') > MAX_CALLBACK_BYTES
    ) {
      throw new HostedAuthServiceError(INVALID_REQUEST_MESSAGE, 'invalid_request', 400);
    }

    try {
      const api = this.api ?? await this.createApiFromPendingTransaction();
      const result = await api.completeHostedLogin(request.flowId, request.callbackUrl);
      this.api = api;
      this.lastStatus = this.mapHostedResult(result);
      return { ...this.lastStatus };
    } catch (error) {
      if (error instanceof HostedAuthServiceError) {
        throw error;
      }
      this.options.logger.warn('[Hosted Auth] Blink sign-in completion failed.');
      throw new HostedAuthServiceError(SIGN_IN_FAILED_MESSAGE, 'authentication', 400);
    }
  }

  async status(): Promise<AuthStatus> {
    if (this.lastStatus) {
      return { ...this.lastStatus };
    }

    const loaded = await loadPersistedAuthStateFromFiles(
      [this.authStoragePath, this.legacyAuthStoragePath],
      message => this.options.logger.debug(message),
    );
    if (!loaded.state) {
      return {
        authenticated: false,
        message: loaded.message ?? NO_STORED_AUTH_MESSAGE,
      };
    }

    const metadata = safeMetadata(loaded.state);
    if (!loaded.requiresRefresh) {
      return {
        authenticated: true,
        ...metadata,
        message: 'Blink tokens are stored.',
      };
    }

    try {
      const api = this.createApiFromState(loaded.state);
      this.api = api;
      await api.login();
      const refreshed = await loadPersistedAuthStateFromFiles(
        [this.authStoragePath, this.legacyAuthStoragePath],
        message => this.options.logger.debug(message),
      );
      const refreshedMetadata = safeMetadata(refreshed.state ?? loaded.state);
      this.lastStatus = {
        authenticated: true,
        verified: true,
        ...refreshedMetadata,
        message: 'Blink tokens refreshed and connection verified.',
      };
      return { ...this.lastStatus };
    } catch (error) {
      if (error instanceof BlinkRestVerificationRequiredError) {
        this.lastStatus = this.mapVerificationRequirement(error.type, loaded.state);
        return { ...this.lastStatus };
      }
      if (error instanceof BlinkHostedReauthenticationRequiredError) {
        return { authenticated: false, message: REAUTHENTICATION_MESSAGE };
      }
      this.options.logger.warn('[Hosted Auth] Stored authentication refresh failed.');
      return {
        authenticated: false,
        message: 'Stored Blink authentication could not be refreshed. Sign in securely with Blink again.',
      };
    }
  }

  async verify(payload: VerifyRequest): Promise<AuthStatus> {
    const request = this.requirePayload(payload, ['code', 'type', 'trustDevice']);
    if (
      typeof request.code !== 'string'
      || !VERIFICATION_CODE_PATTERN.test(request.code.trim())
      || (request.type !== 'client' && request.type !== 'account')
      || (request.trustDevice !== undefined && typeof request.trustDevice !== 'boolean')
    ) {
      throw new HostedAuthServiceError(INVALID_REQUEST_MESSAGE, 'invalid_request', 400);
    }

    const code = request.code.trim();
    let context: PersistedApiContext | null = null;
    try {
      context = await this.getPersistedApiContext();
      if (request.type === 'client') {
        await context.api.verifyClientVerificationPin(code, true, request.trustDevice ?? true);
      } else {
        const response = await context.api.verifyAccountVerificationPin(code);
        if (!response.valid || response.require_new_pin) {
          throw new Error('verification rejected');
        }
      }
      await context.api.login();
      this.api = context.api;
      const metadata = this.lastStatus
        ? safeMetadata(this.lastStatus)
        : safeMetadata(context.state);
      this.lastStatus = {
        authenticated: true,
        verified: true,
        ...metadata,
        message: 'Blink verification completed.',
      };
      return { ...this.lastStatus };
    } catch (error) {
      if (error instanceof BlinkRestVerificationRequiredError && context) {
        this.lastStatus = this.mapVerificationRequirement(
          error.type,
          this.lastStatus ?? context.state,
        );
        return { ...this.lastStatus };
      }
      if (error instanceof HostedAuthServiceError) {
        throw error;
      }
      this.options.logger.warn('[Hosted Auth] Blink verification failed.');
      throw new HostedAuthServiceError(VERIFY_FAILED_MESSAGE, 'authentication', 400);
    }
  }

  async testConnection(payload: { deviceId?: string }): Promise<{ success: boolean; message: string }> {
    const request = this.requirePayload(payload, ['deviceId']);
    if (request.deviceId !== undefined) {
      normalizeHardwareId(request.deviceId, false);
    }
    try {
      const context = await this.getPersistedApiContext(request.deviceId);
      await context.api.login();
      await context.api.getHomescreen();
      this.api = context.api;
      return {
        success: true,
        message: 'Connected to Blink using stored tokens.',
      };
    } catch {
      this.options.logger.warn('[Hosted Auth] Stored token connection test failed.');
      return {
        success: false,
        message: 'Stored Blink tokens could not connect. Sign in securely with Blink again.',
      };
    }
  }

  async clear(): Promise<void> {
    try {
      await this.api?.cancelHostedLogin();
    } catch {
      this.options.logger.warn('[Hosted Auth] Pending sign-in cancellation failed; clearing files directly.');
    }
    const [currentResult, legacyResult, pendingResult] = await Promise.allSettled([
      removeOwnerOnlyFile(this.authStoragePath),
      removeOwnerOnlyFile(this.legacyAuthStoragePath),
      removeOwnerOnlyFile(this.pendingStoragePath),
    ]);
    this.api = null;
    this.lastStatus = null;
    if (
      currentResult.status === 'rejected'
      || legacyResult.status === 'rejected'
      || pendingResult.status === 'rejected'
    ) {
      this.options.logger.warn('[Hosted Auth] Authentication file cleanup failed.');
      throw new HostedAuthServiceError(CLEAR_FAILED_MESSAGE, 'storage', 500);
    }
  }

  private requirePayload(
    payload: unknown,
    allowedKeys: readonly string[],
  ): Record<string, unknown> {
    if (!isRecord(payload) || !hasExactKeys(payload, allowedKeys)) {
      throw new HostedAuthServiceError(INVALID_REQUEST_MESSAGE, 'invalid_request', 400);
    }
    return payload;
  }

  private buildConfig(
    hardwareId: string,
    tier: string,
    oauthClientId: BlinkOAuthClientId,
  ): BlinkConfig {
    return {
      email: '',
      password: '',
      hardwareId,
      oauthClientId,
      tier,
      authStoragePath: this.authStoragePath,
      hostedOAuthPendingPath: this.pendingStoragePath,
      legacyAuthStoragePath: this.legacyAuthStoragePath,
      authLocked: true,
      debugAuth: false,
      logger: this.options.logger,
    };
  }

  private createApiFromState(state: BlinkAuthState, fallbackHardwareId?: unknown): BlinkApi {
    const hardwareId = typeof state.hardwareId === 'string' && DEVICE_ID_PATTERN.test(state.hardwareId)
      ? state.hardwareId
      : normalizeHardwareId(fallbackHardwareId, true);
    return this.apiFactory(this.buildConfig(
      hardwareId,
      normalizeTier(state.tier),
      normalizeOAuthClientId(state.oauthClientId),
    ));
  }

  private async createApiFromPendingTransaction(): Promise<BlinkApi> {
    let value: unknown;
    try {
      value = await readOwnerOnlyJsonFile<unknown>(this.pendingStoragePath);
    } catch {
      return this.rejectPendingRecovery();
    }
    if (
      !isRecord(value)
      || value.oauthClientId !== 'android'
      || typeof value.flowId !== 'string'
      || !FLOW_ID_PATTERN.test(value.flowId)
      || typeof value.hardwareId !== 'string'
      || !DEVICE_ID_PATTERN.test(value.hardwareId)
    ) {
      return this.rejectPendingRecovery();
    }
    return this.apiFactory(this.buildConfig(value.hardwareId, 'prod', 'android'));
  }

  private async rejectPendingRecovery(): Promise<never> {
    try {
      await removeOwnerOnlyFile(this.pendingStoragePath);
    } catch {
      this.options.logger.warn('[Hosted Auth] Malformed pending sign-in cleanup failed.');
    }
    throw new HostedAuthServiceError(SIGN_IN_FAILED_MESSAGE, 'storage', 400);
  }

  private async getPersistedApiContext(fallbackHardwareId?: unknown): Promise<PersistedApiContext> {
    const loaded = await loadPersistedAuthStateFromFiles(
      [this.authStoragePath, this.legacyAuthStoragePath],
      message => this.options.logger.debug(message),
    );
    if (!loaded.state) {
      if (this.api && this.lastStatus) {
        return { api: this.api, state: this.lastStatus };
      }
      throw new HostedAuthServiceError(NO_STORED_AUTH_MESSAGE, 'storage', 400);
    }
    if (this.api) {
      return { api: this.api, state: loaded.state };
    }
    return {
      api: this.createApiFromState(loaded.state, fallbackHardwareId),
      state: loaded.state,
    };
  }

  private mapHostedResult(result: BlinkHostedLoginResult): AuthStatus {
    const metadata = safeMetadata(result);
    if (result.verified) {
      return {
        authenticated: true,
        verified: true,
        ...metadata,
        message: 'Blink tokens stored and connection verified.',
      };
    }
    if (result.verificationRequirement === 'client') {
      return this.mapVerificationRequirement('client', metadata);
    }
    if (result.verificationRequirement === 'account') {
      return this.mapVerificationRequirement('account', metadata);
    }
    return {
      authenticated: true,
      verified: false,
      ...metadata,
      message: 'tokens stored; connection verification failed',
    };
  }

  private mapVerificationRequirement(
    requirement: 'client' | 'account',
    state: Pick<BlinkAuthState, 'email' | 'accountId' | 'tier'>,
  ): AuthStatus {
    const metadata = safeMetadata(state);
    if (requirement === 'client') {
      return {
        authenticated: true,
        verified: false,
        requiresClientVerification: true,
        ...metadata,
        message: 'Blink signed in. Enter the client verification code sent by Blink.',
      };
    }
    return {
      authenticated: true,
      verified: false,
      requiresAccountVerification: true,
      ...metadata,
      message: 'Blink signed in. Enter the account verification code sent by Blink.',
    };
  }

  private get authStoragePath(): string {
    return path.join(this.options.storageRoot, '.blink-auth.json');
  }

  private get pendingStoragePath(): string {
    return path.join(this.options.storageRoot, '.blink-auth-pending.json');
  }

  private get legacyAuthStoragePath(): string {
    return path.join(this.options.storageRoot, 'blink-auth', 'auth-state.json');
  }
}
