/**
 * Blink OAuth Authentication Module
 *
 * Implements OAuth 2.0 password grant flow as documented in the API dossier.
 * Source: API Dossier Section 2.1 (OAuth Flow)
 * Evidence: smali_classes9/com/immediasemi/blink/common/account/auth/OauthApi.smali
 */

import { BlinkConfig, BlinkLogger, BlinkOAuthResponse } from '../types';
import { getOAuthTokenUrl } from './urls';

/**
 * Default client ID for OAuth requests
 * Source: API Dossier Section 2.1 - client_id field
 */
const DEFAULT_CLIENT_ID = 'android';

/**
 * Buffer time before token expiry to trigger refresh
 * Ensures we refresh tokens before they actually expire
 */
const TOKEN_EXPIRY_BUFFER_MS = 60 * 60 * 1000; // 1 hour

/**
 * App version info for diagnostics
 */
const APP_VERSION = '51.0';
const APP_BUILD = '29426569';

/**
 * Null logger that discards all output
 */
const nullLogger: BlinkLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Redact sensitive values for safe logging
 */
function redact(value: string | undefined, showChars = 4): string {
  if (!value) return '<empty>';
  if (value.length <= showChars * 2) return '***';
  return `${value.slice(0, showChars)}...${value.slice(-showChars)}`;
}

/**
 * Format headers for logging (redacts sensitive values)
 */
function formatHeadersForLog(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'authorization' || lowerKey === 'token-auth' || lowerKey === '2fa-code') {
      result[key] = redact(value);
    } else {
      result[key] = value;
    }
  });
  return result;
}

/**
 * Extract error details from API response
 */
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

/**
 * Custom error class with rich diagnostic information
 */
export class BlinkAuthenticationError extends Error {
  public readonly details: BlinkAuthErrorDetail;

  constructor(message: string, details: BlinkAuthErrorDetail) {
    super(message);
    this.name = 'BlinkAuthenticationException';
    this.details = details;
  }

  /**
   * Format error for logging
   */
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
      lines.push(`   Action: Update the plugin or check for a newer APK version.`);
    }
    if (this.details.requires2FA) {
      lines.push(`\n⚠️  2FA VERIFICATION REQUIRED`);
      lines.push(`   Check your email/phone for a verification code.`);
      lines.push(`   Add the code to config as "twoFactorCode" and restart.`);
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

export class BlinkAuth {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private tokenAuth: string | null = null;
  private accountId: number | null = null;
  private readonly log: BlinkLogger;
  private readonly debug: boolean;

  constructor(private readonly config: BlinkConfig) {
    this.log = config.logger ?? nullLogger;
    this.debug = config.debugAuth ?? false;
  }

  /**
   * Log diagnostic message if debug is enabled
   */
  private logDebug(message: string, ...args: unknown[]): void {
    if (this.debug) {
      this.log.info(`[Auth Debug] ${message}`, ...args);
    }
  }

  /**
   * Login with username/password (password grant)
   * Source: API Dossier Section 2.1 - Login Request (Password Grant)
   * Parameters: username, password, grant_type='password', client_id, scope='client'
   * Headers: hardware_id (required), 2fa-code (optional)
   * Evidence: smali_classes9/com/immediasemi/blink/common/account/auth/OauthApi.smali
   */
  async login(twoFaCode?: string): Promise<void> {
    const clientId: string = this.config.clientId ?? DEFAULT_CLIENT_ID;
    const url = getOAuthTokenUrl(this.config);

    this.logDebug('Starting OAuth login...');
    this.logDebug(`  URL: ${url}`);
    this.logDebug(`  Email: ${redact(this.config.email, 3)}`);
    this.logDebug(`  Client ID: ${clientId}`);
    this.logDebug(`  Hardware ID: ${this.config.hardwareId}`);
    this.logDebug(`  2FA Code: ${twoFaCode || this.config.twoFactorCode ? 'provided' : 'not provided'}`);

    const params = new URLSearchParams({
      username: String(this.config.email ?? ''),
      password: String(this.config.password ?? ''),
      grant_type: 'password',
      client_id: String(clientId),
      scope: 'client',
    });

    const headers = new Headers({
      'Content-Type': 'application/x-www-form-urlencoded',
      hardware_id: String(this.config.hardwareId ?? ''),
    });

    // 2FA code support - API Dossier Section 2.1: Optional header for 2FA
    if (twoFaCode ?? this.config.twoFactorCode) {
      headers.set('2fa-code', twoFaCode ?? this.config.twoFactorCode ?? '');
    }

    this.logDebug('Request headers:', formatHeadersForLog(headers));

    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: params.toString(),
    });
    const elapsed = Date.now() - startTime;

    this.logDebug(`Response received in ${elapsed}ms`);
    this.logDebug(`  Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      await this.handleAuthError('login', response);
    }

    const body = (await response.json()) as BlinkOAuthResponse;
    this.logDebug('Login successful');
    this.logDebug(`  Account ID: ${body.account_id}`);
    this.logDebug(`  Region: ${body.region ?? 'not provided'}`);
    this.logDebug(`  Token expires in: ${body.expires_in} seconds`);

    this.captureTokens(body, response.headers.get('TOKEN-AUTH'));
  }

  /**
   * Refresh tokens using refresh_token grant
   * Source: API Dossier Section 2.1 - Token Refresh Request
   * Parameters: refresh_token, grant_type='refresh_token', client_id, scope
   * Evidence: smali_classes9/com/immediasemi/blink/common/account/auth/OauthApi.smali
   */
  async refreshTokens(): Promise<void> {
    if (!this.refreshToken) {
      this.logDebug('Cannot refresh: no refresh token available');
      throw new Error('Cannot refresh token before login');
    }

    const clientId: string = this.config.clientId ?? DEFAULT_CLIENT_ID;
    const url = getOAuthTokenUrl(this.config);

    this.logDebug('Starting token refresh...');
    this.logDebug(`  URL: ${url}`);
    this.logDebug(`  Refresh token: ${redact(this.refreshToken)}`);

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: String(this.refreshToken ?? ''),
      client_id: String(clientId),
      scope: 'client',
    });

    const headers = new Headers({
      'Content-Type': 'application/x-www-form-urlencoded',
      hardware_id: String(this.config.hardwareId ?? ''),
    });

    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: params.toString(),
    });
    const elapsed = Date.now() - startTime;

    this.logDebug(`Response received in ${elapsed}ms`);
    this.logDebug(`  Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      await this.handleAuthError('refresh', response);
    }

    const body = (await response.json()) as BlinkOAuthResponse;
    this.logDebug('Token refresh successful');
    this.logDebug(`  Token expires in: ${body.expires_in} seconds`);

    this.captureTokens(body, response.headers.get('TOKEN-AUTH'));
  }

  /**
   * Handle authentication errors with detailed diagnostics
   */
  private async handleAuthError(operation: 'login' | 'refresh', response: Response): Promise<never> {
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
        // Extract error details from common Blink error formats
        if (typeof responseBody === 'object' && responseBody !== null) {
          const body = responseBody as Record<string, unknown>;
          errorMessage = (body.message ?? body.error ?? body.error_description) as string | undefined;
          errorCode = body.code as number | undefined;
          errorType = body.error as string | undefined;
        }
      } catch {
        responseBody = text;
        errorMessage = text;
      }
    } catch {
      responseBody = '<could not read response body>';
    }

    // Detect specific error conditions
    const requiresUpdate =
      response.status === 426 ||
      (errorMessage?.toLowerCase().includes('update') ?? false) ||
      (errorMessage?.toLowerCase().includes('upgrade') ?? false) ||
      (errorType?.toLowerCase().includes('update') ?? false);

    const requires2FA =
      response.status === 401 &&
      ((errorMessage?.toLowerCase().includes('verification') ?? false) ||
        (errorMessage?.toLowerCase().includes('2fa') ?? false) ||
        (errorType?.toLowerCase().includes('verification') ?? false));

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

    // Always log auth errors (not just in debug mode)
    this.log.error(error.toLogString());

    // Additional debug info
    if (this.debug) {
      this.logDebug('Full error details:', JSON.stringify(details, null, 2));
      this.logDebug(`Current app version: Blink/${APP_VERSION} (Build ${APP_BUILD})`);
      this.logDebug(`Tier: ${this.config.tier ?? 'prod'}`);
    }

    throw error;
  }

  async ensureValidToken(): Promise<void> {
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
    if (!this.tokenExpiry) {
      return true;
    }
    return Date.now() >= this.tokenExpiry.getTime();
  }

  private isTokenExpiringSoon(): boolean {
    if (!this.tokenExpiry) {
      return true;
    }
    return this.tokenExpiry.getTime() - Date.now() < TOKEN_EXPIRY_BUFFER_MS;
  }

  /**
   * Get authorization headers for API requests
   * Source: API Dossier Section 2.2 - Authorization Header Format: 'Bearer {token}'
   * Evidence: smali_classes9/com/immediasemi/blink/core/api/RestApiKt.smali
   */
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

  private captureTokens(body: BlinkOAuthResponse, tokenAuthHeader: string | null): void {
    this.accessToken = body.access_token;
    this.refreshToken = body.refresh_token;
    this.tokenExpiry = new Date(Date.now() + body.expires_in * 1000);
    this.tokenAuth = tokenAuthHeader;
    this.accountId = body.account_id ?? this.accountId;

    this.logDebug('Tokens captured successfully');
    this.logDebug(`  Access token: ${redact(this.accessToken)}`);
    this.logDebug(`  Refresh token: ${redact(this.refreshToken ?? '')}`);
    this.logDebug(`  Expiry: ${this.tokenExpiry.toISOString()}`);
  }
}
