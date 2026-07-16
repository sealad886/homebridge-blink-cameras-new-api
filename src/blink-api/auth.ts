/**
 * Blink OAuth 2.0 Authentication Module
 *
 * Implements OAuth 2.0 Authorization Code Flow with PKCE
 * Source: blinkpy/auth.py - Complete OAuth v2 implementation
 *
 * Flow:
 * 1. Generate PKCE pair (code_verifier, code_challenge)
 * 2. GET /oauth/v2/authorize - Initialize OAuth session
 * 3. GET /oauth/v2/signin - Fetch signin page, extract CSRF token
 * 4. POST /oauth/v2/signin - Submit credentials
 * 5. (Optional) POST /oauth/v2/2fa/verify - Submit 2FA PIN
 * 6. GET /oauth/v2/authorize - Follow redirect to get authorization code
 * 7. POST /oauth/token - Exchange code for access/refresh tokens
 */

import {
  BlinkAuthState,
  BlinkAuthStorage,
  BlinkConfig,
  BlinkHostedOAuthStart,
  BlinkHostedOAuthTokenRequest,
  BlinkLogger,
  BlinkOAuthClientId,
  BlinkOAuthSessionState,
  BlinkOAuthV2TokenResponse,
  nullLogger,
} from '../types';
import {
  buildOAuthHeaders,
  OAUTH_CLIENT_ID,
  OAUTH_REDIRECT_URI,
  OAUTH_SCOPE,
  APP_BUILD,
  APP_VERSION,
} from './headers';
import {
  getOAuthTokenUrl,
  getOAuthAuthorizeUrl,
  getOAuthSigninUrl,
  getOAuth2FAVerifyUrl,
} from './urls';
import { generatePKCEPair, generateOAuthState } from './oauth-pkce';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  hardenOwnerOnlyFileMode,
  readOwnerOnlyJsonFile,
  removeOwnerOnlyFile,
  SecureJsonFileSecurityError,
  writeOwnerOnlyJsonFile,
} from './secure-json-file';
import { HostedOAuthCoordinator } from './hosted-oauth';
import { buildRefreshForm, resolveOAuthProfile } from './oauth-profile';

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

interface CapturedTokenState {
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: Date | null;
  tokenAuth: string | null;
  oauthClientId: BlinkOAuthClientId | null;
  accountId: number | null;
  clientId: number | null;
  region: string | null;
  tier: string | null;
}

const TOKEN_EXPIRY_BUFFER_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_MAX_RETRIES = 2;
const REFRESH_RETRY_DELAYS_MS = [2000, 5000];
const HOSTED_OAUTH_NOT_CONFIGURED = 'Blink hosted sign-in is not configured.';
const HOSTED_TOKEN_EXCHANGE_FAILED =
  'Blink sign-in could not be completed. Start sign-in again.';
const AUTH_STATE_LOAD_FAILED = 'Blink authentication state could not be loaded.';
const LEGACY_TOKEN_RESPONSE_INVALID = 'Blink OAuth token response was invalid.';

const AUTH_ERROR_CATEGORIES = new Set([
  'account_verification_required',
  'app_update_required',
  'client_verification_required',
  'phone_verification_required',
  'two_factor_required',
  'update_required',
  'upgrade_required',
  'verification_required',
]);

const isNodeError = (error: unknown, code: string): boolean => {
  return (error as { code?: string }).code === code;
};

export { SecureJsonFileSecurityError as AuthStateFileSecurityError };
export const hardenAuthStateFileMode = hardenOwnerOnlyFileMode;
export const readPersistedAuthStateFile = readOwnerOnlyJsonFile<BlinkAuthState>;

class FileAuthStorage implements BlinkAuthStorage {
  /** Legacy directory-based path for migration (e.g. .../blink-auth/auth-state.json) */
  private readonly legacyPath: string | null;

  constructor(private readonly filePath: string, legacyPath?: string) {
    this.legacyPath = legacyPath ?? null;
  }

  async load(): Promise<BlinkAuthState | null> {
    // Try the primary (dot-file) path first
    const primary = await this.readJsonFile(this.filePath);
    if (primary) return primary;

    // Migrate from the legacy blink-auth/ directory if it exists
    if (this.legacyPath) {
      const legacy = await this.readJsonFile(this.legacyPath);
      if (legacy) {
        await this.save(legacy);
        await this.removeLegacy();
        return legacy;
      }
    }
    return null;
  }

  async save(state: BlinkAuthState): Promise<void> {
    await writeOwnerOnlyJsonFile(this.filePath, state);
  }

  async clear(): Promise<void> {
    await this.unlinkQuiet(this.filePath);
    if (this.legacyPath) {
      await this.removeLegacy();
    }
  }

  private async readJsonFile(filePath: string): Promise<BlinkAuthState | null> {
    try {
      return await readOwnerOnlyJsonFile<BlinkAuthState>(filePath);
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return null;
      throw error;
    }
  }

  private async unlinkQuiet(filePath: string): Promise<void> {
    await removeOwnerOnlyFile(filePath);
  }

  /** Remove the legacy auth-state.json and its parent blink-auth/ directory. */
  private async removeLegacy(): Promise<void> {
    if (!this.legacyPath) return;
    await this.unlinkQuiet(this.legacyPath);
    try {
      await fs.rmdir(path.dirname(this.legacyPath));
    } catch {
      // Directory not empty or already gone — ignore
    }
  }
}

function redact(value: string | undefined, showChars = 4): string {
  if (!value) return '<empty>';
  if (value.length <= showChars * 2) return '***';
  return `${value.slice(0, showChars)}...${value.slice(-showChars)}`;
}

function authErrorCategory(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return AUTH_ERROR_CATEGORIES.has(normalized) ? normalized : undefined;
}

function removeUntrustedFragments(message: string, fragments: readonly string[]): string {
  let sanitized = message;
  for (const fragment of fragments) {
    if (fragment) {
      sanitized = sanitized.split(fragment).join('');
    }
  }
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  return sanitized || 'Blink authentication failed.';
}

function parseTokenResponse(
  value: unknown,
  options: { requireRefreshToken: boolean },
): BlinkOAuthV2TokenResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;

  if (typeof body.access_token !== 'string' || body.access_token.trim().length === 0) {
    return null;
  }
  if (typeof body.expires_in !== 'number'
      || !Number.isFinite(body.expires_in)
      || body.expires_in <= 0) {
    return null;
  }
  if (body.token_type !== 'Bearer') return null;

  const refreshToken = body.refresh_token;
  if (refreshToken !== undefined
      && (typeof refreshToken !== 'string' || refreshToken.trim().length === 0)) {
    return null;
  }
  if (options.requireRefreshToken && typeof refreshToken !== 'string') return null;

  for (const key of ['scope', 'id_token', 'region', 'tier'] as const) {
    const optionalString = body[key];
    if (optionalString !== undefined
        && (typeof optionalString !== 'string' || optionalString.trim().length === 0)) {
      return null;
    }
  }
  for (const key of ['account_id', 'client_id'] as const) {
    const optionalNumber = body[key];
    if (optionalNumber !== undefined
        && (typeof optionalNumber !== 'number'
          || !Number.isSafeInteger(optionalNumber)
          || optionalNumber <= 0)) {
      return null;
    }
  }

  return body as unknown as BlinkOAuthV2TokenResponse;
}

interface BlinkAuthErrorDetail {
  status: number;
  statusText: string;
  message?: string;
  errorType?: string;
  requiresUpdate?: boolean;
  requires2FA?: boolean;
  headers: Record<string, string>;
  responseBody?: unknown;
}

export class BlinkAuthenticationError extends Error {
  public readonly details: BlinkAuthErrorDetail;

  constructor(message: string, details: BlinkAuthErrorDetail) {
    const untrustedHeaderFragments = Object.entries(details.headers).flatMap(([key, value]) => [
      key,
      value,
    ]);
    super(removeUntrustedFragments(message, [details.statusText, ...untrustedHeaderFragments]));
    this.name = 'BlinkAuthenticationException';
    this.details = {
      status: Number.isSafeInteger(details.status) ? details.status : 0,
      statusText: '',
      message: authErrorCategory(details.message),
      errorType: authErrorCategory(details.errorType),
      requiresUpdate: details.requiresUpdate === true,
      requires2FA: details.requires2FA === true,
      headers: {},
    };
  }

  toLogString(): string {
    const lines = [
      `\n${'='.repeat(60)}`,
      `BLINK AUTHENTICATION ERROR`,
      `${'='.repeat(60)}`,
      `Error: ${this.message}`,
      `Status: ${this.details.status}`,
    ];

    if (this.details.errorType) {
      lines.push(`Error Type: ${this.details.errorType}`);
    }
    if (this.details.message) {
      lines.push(`Server Message: ${this.details.message}`);
    }
    if (this.details.requiresUpdate) {
      lines.push(`\n⚠️  APP UPDATE REQUIRED - The Blink API rejected this app version.`);
      lines.push(`   Current: Blink/${APP_VERSION} (Build ${APP_BUILD})`);
    }
    if (this.details.requires2FA) {
      lines.push(`\n⚠️  2FA VERIFICATION REQUIRED`);
      lines.push(`   Check your email/phone for a verification code.`);
      lines.push(`   Call complete2FA(pin) with the PIN to continue.`);
    }

    lines.push(`${'='.repeat(60)}\n`);
    return lines.join('\n');
  }
}

/**
 * Custom error for 2FA requirement
 */
export class Blink2FARequiredError extends Error {
  public readonly phoneLastFour?: string;
  public readonly email?: string;
  public readonly allowResendSeconds?: number;

  constructor(message: string, options?: {
    phoneLastFour?: string;
    email?: string;
    allowResendSeconds?: number;
  }) {
    super(message);
    this.name = 'Blink2FARequiredError';
    this.phoneLastFour = options?.phoneLastFour;
    this.email = options?.email;
    this.allowResendSeconds = options?.allowResendSeconds;
  }
}

export class BlinkHostedReauthenticationRequiredError extends Error {
  constructor() {
    super('Blink sign-in has expired. Open the plugin settings and sign in securely with Blink again.');
    this.name = 'BlinkHostedReauthenticationRequiredError';
  }
}

export class BlinkAuth {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private tokenAuth: string | null = null;
  private oauthClientId: BlinkOAuthClientId | null;
  private accountId: number | null = null;
  private clientId: number | null = null;
  private region: string | null = null;
  private tier: string | null = null;
  private readonly log: BlinkLogger;
  private readonly debug: boolean;
  private readonly storage?: BlinkAuthStorage;
  private readonly hostedOAuthCoordinator?: HostedOAuthCoordinator;
  private stateLoaded = false;
  private stateLoadPromise: Promise<void> | null = null;
  private tokenTransitionTail: Promise<void> = Promise.resolve();
  private refreshInFlight: Promise<void> | null = null;

  // OAuth v2 session state (persisted for 2FA flow)
  private oauthSession: BlinkOAuthSessionState | null = null;
  private sessionCookies: string = '';

  constructor(private readonly config: BlinkConfig) {
    this.log = config.logger ?? nullLogger;
    this.debug = config.debugAuth ?? false;
    this.oauthClientId = config.oauthClientId ?? null;
    if (config.authStorage) {
      this.storage = config.authStorage;
    } else if (config.authStoragePath) {
      this.storage = new FileAuthStorage(config.authStoragePath, config.legacyAuthStoragePath);
    }
    if (config.hostedOAuthPendingPath) {
      this.hostedOAuthCoordinator = new HostedOAuthCoordinator({
        pendingFilePath: config.hostedOAuthPendingPath,
        hardwareId: config.hardwareId,
        tier: config.tier,
      });
    }
  }

  private logDebug(message: string, ...args: unknown[]): void {
    if (this.debug) {
      this.log.info(`[Auth Debug] ${message}`, ...args);
    }
  }

  /**
   * Redact sensitive form body fields for logging
   */
  private redactFormBody(body: string): string {
    const params = new URLSearchParams(body);
    const redacted = new URLSearchParams();
    for (const [key, value] of params.entries()) {
      if (/(?:password|refresh_token|access_token|authorization|token-auth|cookie|pin|code|csrf-token|2fa_code|secret)/i.test(key)) {
        redacted.set(key, '<redacted>');
      } else {
        redacted.set(key, value);
      }
    }
    return redacted.toString();
  }

  /**
   * Redact authorization-related headers for logging
   */
  private redactHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (/(authorization|token-auth|cookie|set-cookie)/i.test(lowerKey)) {
        result[key] = '<redacted>';
      } else {
        result[key] = value;
      }
    });
    return result;
  }

  private redactUrlForLogging(value: string): string {
    try {
      const url = new URL(value);
      for (const key of [...new Set(url.searchParams.keys())]) {
        if (/^(?:access_token|authorization|code|code_verifier|error|error_description|id_token|password|pin|refresh_token|secret|state|token)$/i.test(key)) {
          url.searchParams.set(key, '<redacted>');
        }
      }
      return url.toString();
    } catch {
      return '<redacted-url>';
    }
  }

  /**
   * Centralized fetch wrapper for all OAuth requests.
   * Provides: request ID tracking, detailed debug logging, network error handling.
   */
  private async authFetch(
    stepLabel: string,
    url: string,
    init: globalThis.RequestInit,
  ): Promise<FetchResponse> {
    const requestId = randomUUID().slice(0, 8);
    const method = init.method ?? 'GET';

    this.logDebug(`[${requestId}] ── ${stepLabel} ──`);
    this.logDebug(`[${requestId}] ${method} ${this.redactUrlForLogging(url)}`);
    this.logDebug(`[${requestId}] Request headers: ${JSON.stringify(this.redactHeaders(init.headers as Headers))}`);
    if (init.body) {
      this.logDebug(`[${requestId}] Request body: ${this.redactFormBody(init.body as string)}`);
    }
    if (init.redirect) {
      this.logDebug(`[${requestId}] Redirect policy: ${init.redirect}`);
    }

    const startTime = Date.now();
    let response: FetchResponse;
    try {
      response = await fetch(url, init);
    } catch {
      const elapsed = Date.now() - startTime;
      this.log.error(`[Auth] [${requestId}] Network error during "${stepLabel}" after ${elapsed}ms.`);
      this.logDebug(`[${requestId}] Network request failed.`);
      throw new BlinkAuthenticationError(
        `Network error during ${stepLabel}`,
        {
          status: 0,
          statusText: 'Network Error',
          headers: {},
        },
      );
    }

    const elapsed = Date.now() - startTime;
    this.logDebug(`[${requestId}] Response status: ${response.status} (${elapsed}ms)`);
    this.logDebug(`[${requestId}] Response headers received.`);

    return response;
  }

  private async ensureStateLoaded(): Promise<void> {
    if (this.stateLoaded) return;
    if (this.stateLoadPromise) {
      await this.stateLoadPromise;
      return;
    }
    const loadPromise = this.loadStateFromStorage();
    this.stateLoadPromise = loadPromise;
    try {
      await loadPromise;
    } finally {
      if (this.stateLoadPromise === loadPromise) {
        this.stateLoadPromise = null;
      }
    }
  }

  private async loadStateFromStorage(): Promise<void> {
    if (!this.storage) {
      this.stateLoaded = true;
      return;
    }
    try {
      const state = await this.storage.load();
      if (state) {
        this.applyState(state);
        this.logDebug('Loaded persisted auth state');
      }
      this.stateLoaded = true;
    } catch {
      this.log.warn('[Auth] Failed to load persisted auth state.');
      throw new Error(AUTH_STATE_LOAD_FAILED);
    }
  }

  private applyState(state: BlinkAuthState): void {
    this.accessToken = state.accessToken ?? this.accessToken;
    this.refreshToken = state.refreshToken ?? this.refreshToken;
    this.tokenAuth = state.tokenAuth ?? this.tokenAuth;
    this.oauthClientId = state.oauthClientId ?? 'ios';
    this.accountId = state.accountId ?? this.accountId;
    this.clientId = state.clientId ?? this.clientId;
    this.region = state.region ?? this.region;
    this.tier = state.tier ?? this.tier;
    if (state.tokenExpiry) {
      const parsed = new Date(state.tokenExpiry);
      if (!Number.isNaN(parsed.getTime())) {
        this.tokenExpiry = parsed;
      }
    }
  }

  private enqueueTokenTransition<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tokenTransitionTail.then(operation, operation);
    this.tokenTransitionTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async persistCurrentState(): Promise<void> {
    await this.enqueueTokenTransition(() => this.persistCurrentStateUnlocked());
  }

  private async persistCurrentStateUnlocked(): Promise<void> {
    if (!this.storage || !this.accessToken) return;
    const state: BlinkAuthState = {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      tokenAuth: this.tokenAuth,
      tokenExpiry: this.tokenExpiry?.toISOString() ?? null,
      accountId: this.accountId,
      clientId: this.clientId,
      oauthClientId: this.oauthClientId,
      region: this.region,
      tier: this.tier,
      email: this.config.email ?? null,
      hardwareId: this.config.hardwareId ?? null,
      updatedAt: new Date().toISOString(),
    };
    try {
      await this.storage.save(state);
    } catch (error) {
      this.log.warn('[Auth] Failed to persist auth state.');
      throw error;
    }
  }

  async beginHostedLogin(): Promise<BlinkHostedOAuthStart> {
    return this.requireHostedOAuthCoordinator().start();
  }

  async completeHostedLogin(flowId: string, callbackUrl: string): Promise<void> {
    const coordinator = this.requireHostedOAuthCoordinator();
    await this.ensureStateLoaded();
    const request = await coordinator.consumeCallback(flowId, callbackUrl);
    await this.enqueueTokenTransition(() => this.exchangeHostedCode(request));
  }

  async cancelHostedLogin(): Promise<void> {
    await this.requireHostedOAuthCoordinator(false).cancel();
  }

  private requireHostedOAuthCoordinator(requireStorage = true): HostedOAuthCoordinator {
    if (!this.hostedOAuthCoordinator || (requireStorage && !this.storage)) {
      throw new Error(HOSTED_OAUTH_NOT_CONFIGURED);
    }
    return this.hostedOAuthCoordinator;
  }

  private async exchangeHostedCode(request: BlinkHostedOAuthTokenRequest): Promise<void> {
    const formData = new URLSearchParams({
      grant_type: 'authorization_code',
      redirect_uri: request.redirectUri,
      code: request.authorizationCode,
      code_verifier: request.codeVerifier,
      client_id: request.oauthClientId,
    });
    const headers = new Headers({
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    });

    let response: FetchResponse;
    try {
      response = await this.authFetch(
        'Hosted OAuth Token Exchange',
        getOAuthTokenUrl(this.config),
        { method: 'POST', headers, body: formData.toString() },
      );
    } catch {
      this.log.warn('[Auth] Blink hosted token exchange failed.');
      throw new Error(HOSTED_TOKEN_EXCHANGE_FAILED);
    }

    if (!response.ok) {
      this.log.warn('[Auth] Blink hosted token exchange failed.');
      throw new Error(HOSTED_TOKEN_EXCHANGE_FAILED);
    }

    let rawBody: unknown;
    try {
      rawBody = await response.json();
    } catch {
      this.log.warn('[Auth] Blink hosted token exchange failed.');
      throw new Error(HOSTED_TOKEN_EXCHANGE_FAILED);
    }
    const body = parseTokenResponse(rawBody, { requireRefreshToken: true });
    if (!body) {
      this.log.warn('[Auth] Blink hosted token exchange failed.');
      throw new Error(HOSTED_TOKEN_EXCHANGE_FAILED);
    }
    await this.captureTokensUnlocked(body, null, request.oauthClientId);
  }

  /**
   * Extract cookies from Set-Cookie headers and merge with existing
   */
  private extractAndMergeCookies(response: FetchResponse): void {
    const setCookies = response.headers.getSetCookie();
    if (!setCookies || setCookies.length === 0) return;

    const existingCookies = new Map<string, string>();

    // Parse existing cookies
    if (this.sessionCookies) {
      for (const cookie of this.sessionCookies.split('; ')) {
        const [name, ...valueParts] = cookie.split('=');
        if (name) {
          existingCookies.set(name.trim(), valueParts.join('='));
        }
      }
    }

    // Parse and merge new cookies
    for (const setCookie of setCookies) {
      const cookiePart = setCookie.split(';')[0];
      const [name, ...valueParts] = cookiePart.split('=');
      if (name) {
        existingCookies.set(name.trim(), valueParts.join('='));
      }
    }

    // Rebuild cookie string
    this.sessionCookies = Array.from(existingCookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');

    this.logDebug(`Cookies updated: ${this.sessionCookies.length} chars`);
  }

  /**
   * Extract CSRF token from HTML response
   * Looks for:
   * - JSON in <script id="oauth-args">{"csrf-token":"..."}</script>
   * - <input type="hidden" name="_token" value="...">
   * - <meta name="csrf-token" content="...">
   */
  private extractCsrfToken(html: string): string | null {
    // First, try to extract from oauth-args JSON (Blink's new SPA format)
    const oauthArgsMatch = html.match(/<script\s+id="oauth-args"[^>]*type="application\/json"[^>]*>([^<]+)<\/script>/i);
    if (oauthArgsMatch?.[1]) {
      try {
        const oauthArgs = JSON.parse(oauthArgsMatch[1]) as { 'csrf-token'?: string };
        if (oauthArgs['csrf-token']) {
          this.logDebug('Found CSRF token in oauth-args JSON');
          return oauthArgs['csrf-token'];
        }
      } catch {
        this.logDebug('Failed to parse oauth-args JSON');
      }
    }

    // Fallback to traditional HTML patterns
    const patterns = [
      /<input[^>]*name="_token"[^>]*value="([^"]+)"/i,
      /<input[^>]*value="([^"]+)"[^>]*name="_token"/i,
      /name="_token"[^>]*value="([^"]+)"/i,
      /<meta[^>]*name="csrf-token"[^>]*content="([^"]+)"/i,
      /"csrf-token"\s*:\s*"([^"]+)"/i, // JSON format in scripts
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        this.logDebug('Found CSRF token');
        return match[1];
      }
    }

    this.logDebug('No CSRF token found in HTML');
    return null;
  }

  /**
   * Extract authorization code from redirect URL
   */
  private extractAuthorizationCode(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.searchParams.get('code');
    } catch {
      // Try regex for non-standard URLs (like custom scheme)
      const match = url.match(/[?&]code=([^&]+)/);
      return match?.[1] ?? null;
    }
  }

  /**
   * Check if response indicates 2FA is required
   */
  private is2FARequired(html: string): boolean {
    const indicators = [
      '2fa',
      'two-factor',
      'verification code',
      'verify your identity',
      'enter the code',
      'pin',
    ];
    const lowerHtml = html.toLowerCase();
    return indicators.some(indicator => lowerHtml.includes(indicator));
  }

  /**
   * Step 1: Initialize OAuth session with PKCE
   * GET /oauth/v2/authorize
   */
  private async oauthAuthorizeRequest(): Promise<void> {
    const { codeVerifier, codeChallenge } = generatePKCEPair();
    const state = generateOAuthState();

    this.oauthSession = {
      codeVerifier,
      codeChallenge,
      state,
      createdAt: new Date().toISOString(),
    };

    const authorizeUrl = new URL(getOAuthAuthorizeUrl(this.config));
    // Required OAuth parameters
    authorizeUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
    authorizeUrl.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('code_challenge', codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    authorizeUrl.searchParams.set('scope', OAUTH_SCOPE);
    // App/device info (matching blinkpy)
    authorizeUrl.searchParams.set('app_brand', 'blink');
    authorizeUrl.searchParams.set('app_version', '50.1');
    authorizeUrl.searchParams.set('device_brand', 'Apple');
    authorizeUrl.searchParams.set('device_model', 'iPhone16,1');
    authorizeUrl.searchParams.set('device_os_version', '26.1');
    authorizeUrl.searchParams.set('hardware_id', this.config.hardwareId);

    const headers = new Headers({
      ...buildOAuthHeaders(),
    });

    if (this.sessionCookies) {
      headers.set('Cookie', this.sessionCookies);
    }

    const response = await this.authFetch('Step 1: OAuth Authorize (PKCE)', authorizeUrl.toString(), {
      method: 'GET',
      headers,
      redirect: 'manual',
    });

    this.extractAndMergeCookies(response);
  }

  /**
   * Step 2: Get signin page and extract CSRF token
   * GET /oauth/v2/signin
   */
  private async oauthGetSigninPage(): Promise<string> {
    const signinUrl = getOAuthSigninUrl(this.config);

    const headers = new Headers({
      ...buildOAuthHeaders(),
    });

    if (this.sessionCookies) {
      headers.set('Cookie', this.sessionCookies);
    }

    const response = await this.authFetch('Step 2: Get Signin Page', signinUrl, {
      method: 'GET',
      headers,
    });

    this.extractAndMergeCookies(response);

    if (!response.ok) {
      throw new Error(`Failed to fetch signin page (status ${response.status}).`);
    }

    const html = await response.text();
    const csrfToken = this.extractCsrfToken(html);

    if (!csrfToken) {
      throw new Error('Could not extract CSRF token from signin page');
    }

    if (this.oauthSession) {
      this.oauthSession.csrfToken = csrfToken;
      this.oauthSession.cookies = this.sessionCookies;
    }

    return csrfToken;
  }

  /**
   * Step 3: Submit credentials
   * POST /oauth/v2/signin
   *
   * Returns:
   * - true: Login successful, authorization code available
   * - false: 2FA required, need to call oauthVerify2FA
   *
   * Status codes:
   * - 302: Success (redirect to authorize)
   * - 412: 2FA required (JSON body with phone, user_id, etc.)
   */
  private async oauthSignin(csrfToken: string): Promise<boolean> {
    const signinUrl = getOAuthSigninUrl(this.config);

    // Use same field names as blinkpy: username, password, csrf-token
    const formData = new URLSearchParams({
      username: this.config.email,
      password: this.config.password,
      'csrf-token': csrfToken,
    });

    const headers = new Headers({
      ...buildOAuthHeaders(),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://api.oauth.blink.com',
      'Referer': getOAuthSigninUrl(this.config),
    });

    if (this.sessionCookies) {
      headers.set('Cookie', this.sessionCookies);
    }

    const response = await this.authFetch('Step 3: Submit Credentials', signinUrl, {
      method: 'POST',
      headers,
      body: formData.toString(),
      redirect: 'manual',
    });

    this.extractAndMergeCookies(response);

    // Status 412 = 2FA required (returns JSON with phone, user_id, etc.)
    if (response.status === 412) {
      this.logDebug('Status 412: 2FA required');
      if (this.oauthSession) {
        this.oauthSession.requires2FA = true;
      }
      return false; // 2FA required
    }

    // Check for redirect (success or 2FA required)
    const location = response.headers.get('location');
    if (location) {
      this.logDebug('OAuth sign-in redirect received');

      // Check if redirected to 2FA page
      if (location.includes('2fa') || location.includes('verify')) {
        if (this.oauthSession) {
          this.oauthSession.requires2FA = true;
        }
        return false; // 2FA required
      }

      // Check if redirected to callback (success!)
      if (location.includes('code=')) {
        const code = this.extractAuthorizationCode(location);
        if (code && this.oauthSession) {
          this.oauthSession.authorizationCode = code;
        }
        return true;
      }
    }

    // Check response body for 2FA indicators
    if (response.status === 200) {
      const html = await response.text();
      if (this.is2FARequired(html)) {
        if (this.oauthSession) {
          this.oauthSession.requires2FA = true;
          // Try to extract new CSRF token from 2FA page
          const newCsrfToken = this.extractCsrfToken(html);
          if (newCsrfToken) {
            this.oauthSession.csrfToken = newCsrfToken;
          }
        }
        return false; // 2FA required
      }
    }

    if (!response.ok && response.status !== 302) {
      throw new Error(`Blink sign-in failed (status ${response.status}).`);
    }

    return true;
  }

  /**
   * Step 4: Submit 2FA PIN
   * POST /oauth/v2/2fa/verify
   *
   * Field names verified against working flow:
   * - 2fa_code: The verification code
   * - csrf-token: The CSRF token from signin page
   * - remember_me: Whether to remember device
   *
   * Response:
   * - 201: Success, body contains {"status":"auth-completed"}
   * - 302: Success, redirect to authorize
   */
  private async oauthVerify2FA(pin: string): Promise<boolean> {
    if (!this.oauthSession?.csrfToken) {
      throw new Error('No OAuth session or CSRF token for 2FA verification');
    }

    const verifyUrl = getOAuth2FAVerifyUrl(this.config);

    // Field names match blinkpy: 2fa_code, csrf-token, remember_me
    const formData = new URLSearchParams({
      '2fa_code': pin,
      'csrf-token': this.oauthSession.csrfToken,
      'remember_me': 'false',
    });

    const headers = new Headers({
      ...buildOAuthHeaders(),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://api.oauth.blink.com',
      'Referer': getOAuthSigninUrl(this.config),
    });

    if (this.sessionCookies) {
      headers.set('Cookie', this.sessionCookies);
    }

    const response = await this.authFetch('Step 4: Verify 2FA', verifyUrl, {
      method: 'POST',
      headers,
      body: formData.toString(),
      redirect: 'manual',
    });

    this.extractAndMergeCookies(response);

    // Status 201 means auth-completed (success)
    if (response.status === 201) {
      this.logDebug('2FA verification successful (201)');
      return true;
    }

    const location = response.headers.get('location');
    if (location) {
      this.logDebug('OAuth 2FA redirect received');
      // Check if redirected back to authorize (success)
      if (location.includes('authorize') || location.includes('code=')) {
        return true;
      }
    }

    if (!response.ok && response.status !== 302) {
      throw new Error(`Blink 2FA verification failed (status ${response.status}).`);
    }

    return response.status === 302 || response.ok;
  }

  /**
   * Step 5: Get authorization code from redirect
   *
   * CRITICAL: After 2FA, use bare /oauth/v2/authorize URL WITHOUT params.
   * The server session remembers the original OAuth request parameters.
   * Sending params again causes redirect back to signin.
   */
  private async oauthGetAuthorizationCode(): Promise<string> {
    if (!this.oauthSession) {
      throw new Error('No OAuth session');
    }

    // If we already have the code from a previous step, return it
    if (this.oauthSession.authorizationCode) {
      return this.oauthSession.authorizationCode;
    }

    // Use bare authorize URL - session remembers the original OAuth request
    const authorizeUrl = getOAuthAuthorizeUrl(this.config);

    const headers = new Headers({
      ...buildOAuthHeaders(),
    });

    if (this.sessionCookies) {
      headers.set('Cookie', this.sessionCookies);
    }

    const response = await this.authFetch('Step 5: Get Authorization Code', authorizeUrl, {
      method: 'GET',
      headers,
      redirect: 'manual',
    });

    this.extractAndMergeCookies(response);

    const location = response.headers.get('location');
    if (location) {
      this.logDebug('OAuth authorization redirect received');
      const code = this.extractAuthorizationCode(location);
      if (code) {
        this.oauthSession.authorizationCode = code;
        return code;
      }
    }

    throw new Error(`Failed to get authorization code. Status: ${response.status}`);
  }

  /**
   * Step 6: Exchange authorization code for tokens
   * POST /oauth/token with grant_type=authorization_code
   *
   * Parameters validated against working flow:
   * - grant_type: authorization_code
   * - code: the authorization code
   * - code_verifier: PKCE verifier
   * - client_id: ios
   * - redirect_uri: the app callback URI
   * - scope: 'client' (CRITICAL - must match authorize request)
   * - hardware_id: device identifier
   * - app_brand: blink
   */
  private async oauthExchangeCode(authorizationCode: string): Promise<void> {
    await this.enqueueTokenTransition(() => this.oauthExchangeCodeUnlocked(authorizationCode));
  }

  private async oauthExchangeCodeUnlocked(authorizationCode: string): Promise<void> {
    if (!this.oauthSession) {
      throw new Error('No OAuth session');
    }

    const tokenUrl = getOAuthTokenUrl(this.config);

    const formData = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorizationCode,
      code_verifier: this.oauthSession.codeVerifier,
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT_URI,
      scope: OAUTH_SCOPE,
      hardware_id: this.config.hardwareId,
      app_brand: 'blink',
    });

    const headers = new Headers({
      ...buildOAuthHeaders(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    });

    if (this.sessionCookies) {
      headers.set('Cookie', this.sessionCookies);
    }

    const response = await this.authFetch('Step 6: Exchange Code for Tokens', tokenUrl, {
      method: 'POST',
      headers,
      body: formData.toString(),
    });

    if (!response.ok) {
      await this.handleAuthError('token_exchange', response);
    }

    let rawBody: unknown;
    try {
      rawBody = await response.json();
    } catch {
      throw new Error(LEGACY_TOKEN_RESPONSE_INVALID);
    }
    const body = parseTokenResponse(rawBody, { requireRefreshToken: true });
    if (!body) {
      throw new Error(LEGACY_TOKEN_RESPONSE_INVALID);
    }
    this.logDebug('Token exchange successful');
    this.logDebug(`  Token expires in: ${body.expires_in} seconds`);

    await this.captureTokensUnlocked(body, response.headers.get('TOKEN-AUTH'), 'ios');

    // Clear OAuth session after successful login
    this.oauthSession = null;
    this.sessionCookies = '';
  }

  /**
   * Login using OAuth 2.0 Authorization Code Flow with PKCE
   *
   * @throws Blink2FARequiredError if 2FA verification is needed
   */
  async login(): Promise<void> {
    if (!this.config.email || !this.config.password) {
      throw new Error(
        'No credentials available for OAuth login. '
        + 'Authenticate via the plugin Custom UI or add username/password to config.',
      );
    }

    this.logDebug('Starting OAuth 2.0 Authorization Code Flow with PKCE...');
    this.logDebug(`  Email: ${redact(this.config.email, 3)}`);
    this.logDebug(`  Client ID: ${OAUTH_CLIENT_ID} (iOS)`);

    // Reset session state
    this.sessionCookies = '';
    this.oauthSession = null;

    // Step 1: Initialize OAuth session with PKCE
    await this.oauthAuthorizeRequest();

    // Step 2: Get signin page and CSRF token
    const csrfToken = await this.oauthGetSigninPage();

    // Step 3: Submit credentials
    const signinSuccess = await this.oauthSignin(csrfToken);

    // Check if 2FA is required (oauthSession is set by oauthAuthorizeRequest)
    // TypeScript control-flow doesn't track this, so we use a non-null assertion
    const currentSession = this.oauthSession!;
    if (!signinSuccess && currentSession.requires2FA) {
      this.logDebug('login → signin returned false → 2FA required');

      // If a 2FA code was provided in config (and not locked), try it automatically
      if (this.config.twoFactorCode && !this.config.authLocked) {
        this.logDebug('login → auto-submitting 2FA code from config');
        await this.complete2FA(this.config.twoFactorCode);
        return;
      }

      if (this.config.authLocked) {
        this.logDebug('login → authLocked=true, not auto-submitting 2FA code');
      }

      this.logDebug('login → no usable 2FA code → throwing Blink2FARequiredError');
      throw new Blink2FARequiredError(
        '2FA verification required. Call complete2FA(pin) with the PIN sent to your device.',
        {
          phoneLastFour: currentSession.phoneLastFour,
          email: this.config.email,
        }
      );
    }

    this.logDebug('login → signin succeeded → getting authorization code');

    // Step 5: Get authorization code (if not already captured)
    const authorizationCode = await this.oauthGetAuthorizationCode();

    // Step 6: Exchange code for tokens
    await this.oauthExchangeCode(authorizationCode);
    this.stateLoaded = true;

    this.logDebug('login → OAuth 2.0 login completed successfully');
  }

  /**
   * Complete 2FA verification and finish login flow
   *
   * @param pin - The 2FA PIN received via email/SMS
   */
  async complete2FA(pin: string): Promise<void> {
    if (!this.oauthSession) {
      throw new Error('No OAuth session. Call login() first.');
    }

    this.logDebug('Completing 2FA verification');

    // Restore cookies from session if needed
    if (this.oauthSession.cookies && !this.sessionCookies) {
      this.sessionCookies = this.oauthSession.cookies;
    }

    // Step 4: Verify 2FA
    const verified = await this.oauthVerify2FA(pin);
    if (!verified) {
      throw new Error('2FA verification failed');
    }

    // Step 5: Get authorization code
    const authorizationCode = await this.oauthGetAuthorizationCode();

    // Step 6: Exchange code for tokens
    await this.oauthExchangeCode(authorizationCode);
    this.stateLoaded = true;

    this.logDebug('2FA verification and login completed successfully');
  }

  /**
   * Refresh tokens using refresh_token grant.
   * Retries transient network errors up to REFRESH_MAX_RETRIES times.
   */
  async refreshTokens(): Promise<void> {
    if (this.refreshInFlight) {
      await this.refreshInFlight;
      return;
    }

    const refresh = this.enqueueTokenTransition(() => this.refreshTokensUnlocked());
    this.refreshInFlight = refresh;
    try {
      await refresh;
    } finally {
      if (this.refreshInFlight === refresh) {
        this.refreshInFlight = null;
      }
    }
  }

  private async refreshTokensUnlocked(): Promise<void> {
    await this.ensureStateLoaded();
    if (!this.refreshToken) {
      this.logDebug('Cannot refresh: no refresh token available');
      if (this.oauthClientId === 'android') {
        throw new BlinkHostedReauthenticationRequiredError();
      }
      throw new Error('Cannot refresh token before login');
    }

    const refreshToken = this.refreshToken;
    const tokenUrl = getOAuthTokenUrl(this.config);
    const profile = resolveOAuthProfile(this.oauthClientId);
    const formData = buildRefreshForm(profile.clientId, refreshToken);
    const headers = profile.clientId === 'android'
      ? new Headers({
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      })
      : new Headers({
        ...buildOAuthHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      });

    for (let attempt = 0; attempt <= REFRESH_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = REFRESH_RETRY_DELAYS_MS[attempt - 1] ?? 5000;
        this.logDebug(`Token refresh retry ${attempt}/${REFRESH_MAX_RETRIES} after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      let response: FetchResponse;
      try {
        response = await this.authFetch(
          attempt === 0 ? 'Token Refresh' : `Token Refresh (retry ${attempt})`,
          tokenUrl,
          { method: 'POST', headers, body: formData.toString() },
        );
      } catch (error) {
        const requestError = error as Error;
        const isTransient = requestError instanceof BlinkAuthenticationError
          && requestError.details.status === 0;
        if (isTransient && attempt < REFRESH_MAX_RETRIES) {
          this.log.warn(`[Auth] Token refresh attempt ${attempt + 1} failed; retrying.`);
          continue;
        }
        if (profile.clientId === 'android') {
          throw new BlinkHostedReauthenticationRequiredError();
        }
        throw requestError;
      }

      if (!response.ok) {
        if (profile.clientId === 'android') {
          this.log.warn('[Auth] Blink hosted token refresh failed.');
          throw new BlinkHostedReauthenticationRequiredError();
        }
        await this.handleAuthError('refresh', response);
      }

      let rawBody: unknown;
      try {
        rawBody = await response.json();
      } catch {
        if (profile.clientId === 'android') {
          this.log.warn('[Auth] Blink hosted token refresh failed.');
          throw new BlinkHostedReauthenticationRequiredError();
        }
        throw new Error(LEGACY_TOKEN_RESPONSE_INVALID);
      }
      const body = parseTokenResponse(rawBody, { requireRefreshToken: false });
      if (!body) {
        if (profile.clientId === 'android') {
          this.log.warn('[Auth] Blink hosted token refresh failed.');
          throw new BlinkHostedReauthenticationRequiredError();
        }
        throw new Error(LEGACY_TOKEN_RESPONSE_INVALID);
      }
      this.logDebug('Token refresh successful');
      this.logDebug(`  Token expires in: ${body.expires_in} seconds`);
      try {
        await this.captureTokensUnlocked(
          body,
          profile.clientId === 'android' ? null : response.headers.get('TOKEN-AUTH'),
          profile.clientId,
        );
      } catch (error) {
        if (profile.clientId === 'android') {
          throw error instanceof BlinkHostedReauthenticationRequiredError
            ? error
            : new BlinkHostedReauthenticationRequiredError();
        }
        throw error;
      }
      return;
    }
  }

  private async handleAuthError(operation: string, response: FetchResponse): Promise<never> {
    let responseBody: Record<string, unknown> | null = null;
    try {
      const text = await response.text();
      if (text.length <= 16_384) {
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          responseBody = parsed as Record<string, unknown>;
        }
      }
    } catch {
      responseBody = null;
    }

    let category: string | undefined;
    if (responseBody?.client_verification_required === true) {
      category = 'client_verification_required';
    } else if (responseBody?.account_verification_required === true) {
      category = 'account_verification_required';
    } else if (responseBody?.phone_verification_required === true) {
      category = 'phone_verification_required';
    } else if (responseBody?.two_factor_required === true) {
      category = 'two_factor_required';
    } else {
      category = authErrorCategory(responseBody?.message)
        ?? authErrorCategory(responseBody?.error)
        ?? authErrorCategory(responseBody?.error_description);
    }
    if (response.status === 426 && !category) {
      category = 'app_update_required';
    }

    const requiresUpdate = response.status === 426
      || category === 'app_update_required'
      || category === 'update_required'
      || category === 'upgrade_required';
    const requires2FA = response.status === 401 && (
      category === 'account_verification_required'
      || category === 'client_verification_required'
      || category === 'phone_verification_required'
      || category === 'two_factor_required'
      || category === 'verification_required'
    );
    const details: BlinkAuthErrorDetail = {
      status: response.status,
      statusText: '',
      message: category,
      errorType: authErrorCategory(responseBody?.error),
      requiresUpdate,
      requires2FA,
      headers: {},
    };

    const error = new BlinkAuthenticationError(
      `Blink OAuth ${operation} failed: ${response.status}`,
      details,
    );

    this.log.error(error.toLogString());
    throw error;
  }

  async ensureValidToken(): Promise<void> {
    try {
      await this.ensureStateLoaded();
    } catch (error) {
      if (!this.canUseLegacyCredentialLogin()) {
        throw error;
      }
      this.log.warn('[Auth] Persisted auth state unavailable; replacing it through legacy sign-in.');
      await this.login();
      return;
    }
    if (!this.accessToken) {
      if (this.oauthClientId === 'android') {
        this.logDebug('ensureValidToken → hosted access token missing → refreshing');
        await this.refreshTokens();
        return;
      }
      if (!this.canUseLegacyCredentialLogin()) {
        throw new Error(
          'No credentials available for OAuth login. '
          + 'Authenticate via the plugin Custom UI or add username/password to config.',
        );
      }
      this.logDebug('ensureValidToken → no access token → initiating legacy login');
      await this.login();
      return;
    }

    if (this.isTokenExpired()) {
      this.logDebug('ensureValidToken → access token expired → refreshing');
      try {
        await this.refreshTokens();
      } catch (error) {
        if (this.oauthClientId === 'android') {
          throw error instanceof BlinkHostedReauthenticationRequiredError
            ? error
            : new BlinkHostedReauthenticationRequiredError();
        }
        if (!this.canUseLegacyCredentialLogin()) {
          throw error;
        }
        this.log.warn('[Auth] Token refresh failed; attempting legacy credential login.');
        this.logDebug('ensureValidToken → refresh failed → falling back to legacy login()');
        await this.login();
      }
    } else if (this.isTokenExpiringSoon()) {
      this.logDebug(`ensureValidToken → token expiring soon (expires ${this.tokenExpiry?.toISOString()}) → proactive refresh`);
      try {
        await this.refreshTokens();
      } catch (error) {
        if (this.oauthClientId === 'android') {
          throw error instanceof BlinkHostedReauthenticationRequiredError
            ? error
            : new BlinkHostedReauthenticationRequiredError();
        }
        if (!this.canUseLegacyCredentialLogin()) {
          throw error;
        }
        this.log.warn('[Auth] Proactive token refresh failed; continuing with current legacy token.');
        this.logDebug('ensureValidToken → proactive refresh failed → continuing with current token');
      }
    } else {
      this.logDebug(`ensureValidToken → token valid until ${this.tokenExpiry?.toISOString()}`);
    }
  }

  isTokenExpired(): boolean {
    if (!this.tokenExpiry) return true;
    return Date.now() >= this.tokenExpiry.getTime();
  }

  private isTokenExpiringSoon(): boolean {
    if (!this.tokenExpiry) return true;
    return this.tokenExpiry.getTime() - Date.now() < TOKEN_EXPIRY_BUFFER_MS;
  }

  private hasLegacyCredentials(): boolean {
    return this.config.email.trim().length > 0 && this.config.password.length > 0;
  }

  private canUseLegacyCredentialLogin(): boolean {
    return this.hasLegacyCredentials()
      && resolveOAuthProfile(this.oauthClientId).clientId === 'ios';
  }

  getAuthHeaders(): Record<string, string> {
    if (!this.accessToken) {
      throw new Error('Access token not set. Call login first.');
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
    };

    if (this.tokenAuth && this.oauthClientId !== 'android') {
      headers['TOKEN-AUTH'] = this.tokenAuth;
    }

    return headers;
  }

  getAccountId(): number | null {
    return this.accountId;
  }

  getClientId(): number | null {
    return this.clientId;
  }

  setAccountId(accountId: number | null): void {
    this.accountId = accountId ?? this.accountId;
  }

  setClientId(clientId: number | null): void {
    this.clientId = clientId ?? this.clientId;
  }

  /**
   * Get the current OAuth session state (for debugging/persistence)
   */
  getOAuthSession(): BlinkOAuthSessionState | null {
    return this.oauthSession;
  }

  /**
   * Get the current access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Get the current refresh token
   */
  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  /**
   * Get the account region
   */
  getRegion(): string | null {
    return this.region;
  }

  /**
   * Get the account tier
   */
  getTier(): string | null {
    return this.tier;
  }

  /**
   * Ensure state is loaded and return the persisted tier for config sync.
   * This allows callers to update config.tier BEFORE making HTTP requests.
   */
  async getPersistedTier(): Promise<string | null> {
    try {
      await this.ensureStateLoaded();
    } catch (error) {
      if (!this.canUseLegacyCredentialLogin()) {
        throw error;
      }
      this.log.warn('[Auth] Persisted tier unavailable; legacy sign-in will replace auth state.');
      return null;
    }
    return this.tier;
  }

  /**
   * Check if 2FA is pending
   */
  is2FAPending(): boolean {
    return this.oauthSession?.requires2FA ?? false;
  }

  private snapshotTokenState(): CapturedTokenState {
    return {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      tokenExpiry: this.tokenExpiry,
      tokenAuth: this.tokenAuth,
      oauthClientId: this.oauthClientId,
      accountId: this.accountId,
      clientId: this.clientId,
      region: this.region,
      tier: this.tier,
    };
  }

  private restoreTokenState(snapshot: CapturedTokenState): void {
    this.accessToken = snapshot.accessToken;
    this.refreshToken = snapshot.refreshToken;
    this.tokenExpiry = snapshot.tokenExpiry;
    this.tokenAuth = snapshot.tokenAuth;
    this.oauthClientId = snapshot.oauthClientId;
    this.accountId = snapshot.accountId;
    this.clientId = snapshot.clientId;
    this.region = snapshot.region;
    this.tier = snapshot.tier;
  }

  private async captureTokensUnlocked(
    body: BlinkOAuthV2TokenResponse,
    tokenAuthHeader: string | null,
    oauthClientId?: BlinkOAuthClientId,
  ): Promise<void> {
    const previous = this.snapshotTokenState();
    this.accessToken = body.access_token;
    this.refreshToken = body.refresh_token ?? this.refreshToken;
    this.tokenExpiry = new Date(Date.now() + body.expires_in * 1000);
    this.tokenAuth = tokenAuthHeader;
    this.oauthClientId = oauthClientId ?? this.oauthClientId ?? 'ios';
    this.accountId = body.account_id ?? this.accountId;
    this.clientId = body.client_id ?? this.clientId;
    this.region = body.region ?? this.region;
    this.tier = body.tier ?? this.tier;

    try {
      await this.persistCurrentStateUnlocked();
    } catch (error) {
      this.restoreTokenState(previous);
      throw error;
    }

    this.logDebug('Tokens captured successfully');
    this.logDebug(`  Expiry: ${this.tokenExpiry.toISOString()}`);
    if (this.accountId) {
      this.logDebug(`  Account ID: ${this.accountId}`);
    }
    if (this.clientId) {
      this.logDebug(`  Client ID: ${this.clientId}`);
    }
  }
}
