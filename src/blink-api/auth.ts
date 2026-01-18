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
  BlinkLogger,
  BlinkOAuthSessionState,
  BlinkOAuthV2TokenResponse,
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

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

const TOKEN_EXPIRY_BUFFER_MS = 60 * 60 * 1000; // 1 hour

const nullLogger: BlinkLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

class FileAuthStorage implements BlinkAuthStorage {
  constructor(private readonly filePath: string) {}

  async load(): Promise<BlinkAuthState | null> {
    try {
      const contents = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(contents) as BlinkAuthState;
      return parsed ?? null;
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async save(state: BlinkAuthState): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(state, null, 2), 'utf8');
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

function redact(value: string | undefined, showChars = 4): string {
  if (!value) return '<empty>';
  if (value.length <= showChars * 2) return '***';
  return `${value.slice(0, showChars)}...${value.slice(-showChars)}`;
}

interface BlinkAuthErrorDetail {
  status: number;
  statusText: string;
  message?: string;
  code?: number;
  errorType?: string;
  requiresUpdate?: boolean;
  requires2FA?: boolean;
  headers: Record<string, string>;
  responseBody?: unknown;
}

export class BlinkAuthenticationError extends Error {
  public readonly details: BlinkAuthErrorDetail;

  constructor(message: string, details: BlinkAuthErrorDetail) {
    super(message);
    this.name = 'BlinkAuthenticationException';
    this.details = details;
  }

  toLogString(): string {
    const lines = [
      `\n${'='.repeat(60)}`,
      `BLINK AUTHENTICATION ERROR`,
      `${'='.repeat(60)}`,
      `Error: ${this.message}`,
      `Status: ${this.details.status} ${this.details.statusText}`,
    ];

    if (this.details.errorType) {
      lines.push(`Error Type: ${this.details.errorType}`);
    }
    if (this.details.code !== undefined) {
      lines.push(`Error Code: ${this.details.code}`);
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

    lines.push(`\nResponse Headers:`);
    for (const [key, value] of Object.entries(this.details.headers)) {
      lines.push(`  ${key}: ${value}`);
    }

    if (this.details.responseBody) {
      lines.push(`\nResponse Body:`);
      lines.push(JSON.stringify(this.details.responseBody, null, 2));
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

export class BlinkAuth {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private tokenAuth: string | null = null;
  private accountId: number | null = null;
  private clientId: number | null = null;
  private region: string | null = null;
  private tier: string | null = null;
  private readonly log: BlinkLogger;
  private readonly debug: boolean;
  private readonly storage?: BlinkAuthStorage;
  private stateLoaded = false;
  private stateLoadPromise: Promise<void> | null = null;

  // OAuth v2 session state (persisted for 2FA flow)
  private oauthSession: BlinkOAuthSessionState | null = null;
  private sessionCookies: string = '';

  constructor(private readonly config: BlinkConfig) {
    this.log = config.logger ?? nullLogger;
    this.debug = config.debugAuth ?? false;
    if (config.authStorage) {
      this.storage = config.authStorage;
    } else if (config.authStoragePath) {
      this.storage = new FileAuthStorage(config.authStoragePath);
    }
  }

  private logDebug(message: string, ...args: unknown[]): void {
    if (this.debug) {
      this.log.info(`[Auth Debug] ${message}`, ...args);
    }
  }

  private async ensureStateLoaded(): Promise<void> {
    if (this.stateLoaded) return;
    if (this.stateLoadPromise) {
      await this.stateLoadPromise;
      return;
    }
    this.stateLoadPromise = this.loadStateFromStorage();
    await this.stateLoadPromise;
    this.stateLoadPromise = null;
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
    } catch (error) {
      this.log.warn(`Failed to load persisted auth state: ${(error as Error).message}`);
    } finally {
      this.stateLoaded = true;
    }
  }

  private applyState(state: BlinkAuthState): void {
    this.accessToken = state.accessToken ?? this.accessToken;
    this.refreshToken = state.refreshToken ?? this.refreshToken;
    this.tokenAuth = state.tokenAuth ?? this.tokenAuth;
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

  private async persistState(): Promise<void> {
    if (!this.storage || !this.accessToken) return;
    const state: BlinkAuthState = {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      tokenAuth: this.tokenAuth,
      tokenExpiry: this.tokenExpiry?.toISOString() ?? null,
      accountId: this.accountId,
      clientId: this.clientId,
      region: this.region,
      tier: this.tier,
      email: this.config.email ?? null,
      hardwareId: this.config.hardwareId ?? null,
      updatedAt: new Date().toISOString(),
    };
    try {
      await this.storage.save(state);
    } catch (error) {
      this.log.warn(`Failed to persist auth state: ${(error as Error).message}`);
    }
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
          this.logDebug(`Found CSRF token in oauth-args JSON: ${redact(oauthArgs['csrf-token'])}`);
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
        this.logDebug(`Found CSRF token: ${redact(match[1])}`);
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

    this.logDebug(`OAuth authorize request: ${authorizeUrl.toString()}`);

    const headers = new Headers({
      ...buildOAuthHeaders(),
    });

    if (this.sessionCookies) {
      headers.set('Cookie', this.sessionCookies);
    }

    const response = await fetch(authorizeUrl.toString(), {
      method: 'GET',
      headers,
      redirect: 'manual', // Don't follow redirects automatically
    });

    this.extractAndMergeCookies(response);
    this.logDebug(`Authorize response: ${response.status}`);
  }

  /**
   * Step 2: Get signin page and extract CSRF token
   * GET /oauth/v2/signin
   */
  private async oauthGetSigninPage(): Promise<string> {
    const signinUrl = getOAuthSigninUrl(this.config);
    this.logDebug(`Fetching signin page: ${signinUrl}`);

    const headers = new Headers({
      ...buildOAuthHeaders(),
    });

    if (this.sessionCookies) {
      headers.set('Cookie', this.sessionCookies);
    }

    const response = await fetch(signinUrl, {
      method: 'GET',
      headers,
    });

    this.extractAndMergeCookies(response);

    if (!response.ok) {
      throw new Error(`Failed to fetch signin page: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const csrfToken = this.extractCsrfToken(html);

    if (!csrfToken) {
      this.logDebug('HTML content (first 500 chars):', html.substring(0, 500));
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
    this.logDebug(`Submitting credentials to: ${signinUrl}`);

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

    const response = await fetch(signinUrl, {
      method: 'POST',
      headers,
      body: formData.toString(),
      redirect: 'manual',
    });

    this.extractAndMergeCookies(response);
    this.logDebug(`Signin response: ${response.status}`);

    // Status 412 = 2FA required (returns JSON with phone, user_id, etc.)
    if (response.status === 412) {
      this.logDebug('Status 412: 2FA required');
      try {
        const twoFaData = await response.json() as {
          phone?: string;
          user_id?: number;
          tsv_state?: string;
          next_time_in_secs?: number;
        };
        if (this.oauthSession) {
          this.oauthSession.requires2FA = true;
          // Extract last 4 digits of phone if available
          if (twoFaData.phone) {
            const phoneMatch = twoFaData.phone.match(/(\d{2})$/);
            this.oauthSession.phoneLastFour = phoneMatch?.[1];
          }
        }
        this.logDebug(`  Phone: ${twoFaData.phone}`);
        this.logDebug(`  User ID: ${twoFaData.user_id}`);
      } catch {
        // JSON parse failed, still mark as 2FA required
        if (this.oauthSession) {
          this.oauthSession.requires2FA = true;
        }
      }
      return false; // 2FA required
    }

    // Check for redirect (success or 2FA required)
    const location = response.headers.get('location');
    if (location) {
      this.logDebug(`Redirect location: ${location}`);

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
      const text = await response.text();
      throw new Error(`Signin failed: ${response.status} - ${text.substring(0, 200)}`);
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
    this.logDebug(`Verifying 2FA at: ${verifyUrl}`);

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

    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers,
      body: formData.toString(),
      redirect: 'manual',
    });

    this.extractAndMergeCookies(response);
    this.logDebug(`2FA verify response: ${response.status}`);

    // Status 201 means auth-completed (success)
    if (response.status === 201) {
      this.logDebug('2FA verification successful (201)');
      return true;
    }

    const location = response.headers.get('location');
    if (location) {
      this.logDebug(`2FA redirect: ${location}`);
      // Check if redirected back to authorize (success)
      if (location.includes('authorize') || location.includes('code=')) {
        return true;
      }
    }

    if (!response.ok && response.status !== 302) {
      const text = await response.text();
      throw new Error(`2FA verification failed: ${response.status} - ${text.substring(0, 200)}`);
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

    this.logDebug(`Getting authorization code (bare URL): ${authorizeUrl}`);

    const headers = new Headers({
      ...buildOAuthHeaders(),
    });

    if (this.sessionCookies) {
      headers.set('Cookie', this.sessionCookies);
    }

    const response = await fetch(authorizeUrl, {
      method: 'GET',
      headers,
      redirect: 'manual',
    });

    this.extractAndMergeCookies(response);

    const location = response.headers.get('location');
    if (location) {
      this.logDebug(`Authorization redirect: ${location}`);
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
    if (!this.oauthSession) {
      throw new Error('No OAuth session');
    }

    const tokenUrl = getOAuthTokenUrl(this.config);
    this.logDebug(`Exchanging code for tokens: ${tokenUrl}`);

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

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers,
      body: formData.toString(),
    });

    if (!response.ok) {
      await this.handleAuthError('token_exchange', response);
    }

    const body = (await response.json()) as BlinkOAuthV2TokenResponse;
    this.logDebug('Token exchange successful');
    this.logDebug(`  Token expires in: ${body.expires_in} seconds`);

    this.captureTokens(body, response.headers.get('TOKEN-AUTH'));

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
      this.logDebug('2FA verification required');
      
      // If a 2FA code was provided in config, try it automatically
      if (this.config.twoFactorCode) {
        this.logDebug('Using 2FA code from config');
        await this.complete2FA(this.config.twoFactorCode);
        return;
      }

      throw new Blink2FARequiredError(
        '2FA verification required. Call complete2FA(pin) with the PIN sent to your device.',
        {
          phoneLastFour: currentSession.phoneLastFour,
          email: this.config.email,
        }
      );
    }

    // Step 5: Get authorization code (if not already captured)
    const authorizationCode = await this.oauthGetAuthorizationCode();

    // Step 6: Exchange code for tokens
    await this.oauthExchangeCode(authorizationCode);

    this.logDebug('OAuth 2.0 login completed successfully');
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

    this.logDebug(`Completing 2FA with PIN: ${redact(pin, 2)}`);

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

    this.logDebug('2FA verification and login completed successfully');
  }

  /**
   * Refresh tokens using refresh_token grant
   */
  async refreshTokens(): Promise<void> {
    await this.ensureStateLoaded();
    if (!this.refreshToken) {
      this.logDebug('Cannot refresh: no refresh token available');
      throw new Error('Cannot refresh token before login');
    }

    const tokenUrl = getOAuthTokenUrl(this.config);
    this.logDebug('Starting token refresh...');
    this.logDebug(`  URL: ${tokenUrl}`);
    this.logDebug(`  Refresh token: ${redact(this.refreshToken)}`);

    const formData = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
      client_id: OAUTH_CLIENT_ID,
    });

    const headers = new Headers({
      ...buildOAuthHeaders(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers,
      body: formData.toString(),
    });

    this.logDebug(`Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      await this.handleAuthError('refresh', response);
    }

    const body = (await response.json()) as BlinkOAuthV2TokenResponse;
    this.logDebug('Token refresh successful');
    this.logDebug(`  Token expires in: ${body.expires_in} seconds`);

    this.captureTokens(body, response.headers.get('TOKEN-AUTH'));
  }

  private async handleAuthError(operation: string, response: FetchResponse): Promise<never> {
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let responseBody: unknown;
    let errorMessage: string | undefined;
    let errorCode: number | undefined;
    let errorType: string | undefined;

    try {
      const text = await response.text();
      try {
        responseBody = JSON.parse(text);
        if (typeof responseBody === 'object' && responseBody !== null) {
          const body = responseBody as Record<string, unknown>;
          errorMessage = (body.message ?? body.error ?? body.error_description) as string | undefined;
          errorCode = body.code as number | undefined;
          errorType = body.error as string | undefined;
        }
      } catch {
        responseBody = text;
        errorMessage = text.substring(0, 200);
      }
    } catch {
      responseBody = '<could not read response body>';
    }

    const requiresUpdate =
      response.status === 426 ||
      (errorMessage?.toLowerCase().includes('update') ?? false) ||
      (errorMessage?.toLowerCase().includes('upgrade') ?? false);

    const requires2FA =
      response.status === 401 &&
      ((errorMessage?.toLowerCase().includes('verification') ?? false) ||
        (errorMessage?.toLowerCase().includes('2fa') ?? false));

    const details: BlinkAuthErrorDetail = {
      status: response.status,
      statusText: response.statusText,
      message: errorMessage,
      code: errorCode,
      errorType,
      requiresUpdate,
      requires2FA,
      headers: responseHeaders,
      responseBody,
    };

    const error = new BlinkAuthenticationError(
      `Blink OAuth ${operation} failed: ${response.status} ${response.statusText}${errorMessage ? ` - ${errorMessage}` : ''}`,
      details,
    );

    this.log.error(error.toLogString());
    throw error;
  }

  async ensureValidToken(): Promise<void> {
    await this.ensureStateLoaded();
    if (!this.accessToken) {
      this.logDebug('No access token, initiating login...');
      await this.login();
      return;
    }

    if (this.isTokenExpired()) {
      this.logDebug('Access token expired, refreshing...');
      await this.refreshTokens();
    } else if (this.isTokenExpiringSoon()) {
      this.logDebug('Access token expiring soon, refreshing proactively...');
      await this.refreshTokens();
    } else {
      this.logDebug(`Access token valid until ${this.tokenExpiry?.toISOString()}`);
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

  getAuthHeaders(): Record<string, string> {
    if (!this.accessToken) {
      throw new Error('Access token not set. Call login first.');
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
    };

    if (this.tokenAuth) {
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
    await this.ensureStateLoaded();
    return this.tier;
  }

  /**
   * Check if 2FA is pending
   */
  is2FAPending(): boolean {
    return this.oauthSession?.requires2FA ?? false;
  }

  private captureTokens(body: BlinkOAuthV2TokenResponse, tokenAuthHeader: string | null): void {
    this.accessToken = body.access_token;
    this.refreshToken = body.refresh_token ?? this.refreshToken;
    this.tokenExpiry = new Date(Date.now() + body.expires_in * 1000);
    this.tokenAuth = tokenAuthHeader;
    this.accountId = body.account_id ?? this.accountId;
    this.clientId = body.client_id ?? this.clientId;
    this.region = body.region ?? this.region;
    this.tier = body.tier ?? this.tier;

    this.logDebug('Tokens captured successfully');
    this.logDebug(`  Access token: ${redact(this.accessToken)}`);
    this.logDebug(`  Refresh token: ${redact(this.refreshToken ?? '')}`);
    this.logDebug(`  Expiry: ${this.tokenExpiry.toISOString()}`);
    if (this.accountId) {
      this.logDebug(`  Account ID: ${this.accountId}`);
    }
    if (this.clientId) {
      this.logDebug(`  Client ID: ${this.clientId}`);
    }
    void this.persistState();
  }
}
