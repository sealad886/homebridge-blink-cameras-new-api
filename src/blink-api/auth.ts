/**
 * Blink OAuth Authentication Module
 *
 * Implements OAuth 2.0 password grant flow as documented in the API dossier.
 * Source: API Dossier Section 2.1 (OAuth Flow)
 * Evidence: smali_classes9/com/immediasemi/blink/common/account/auth/OauthApi.smali
 */

import { BlinkConfig, BlinkOAuthResponse } from '../types';
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

export class BlinkAuth {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private tokenAuth: string | null = null;
  private accountId: number | null = null;

  constructor(private readonly config: BlinkConfig) {}

  /**
   * Login with username/password (password grant)
   * Source: API Dossier Section 2.1 - Login Request (Password Grant)
   * Parameters: username, password, grant_type='password', client_id, scope='client'
   * Headers: hardware_id (required), 2fa-code (optional)
   * Evidence: smali_classes9/com/immediasemi/blink/common/account/auth/OauthApi.smali
   */
  async login(twoFaCode?: string): Promise<void> {
    const clientId: string = this.config.clientId ?? DEFAULT_CLIENT_ID;
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

    const response = await fetch(getOAuthTokenUrl(this.config), {
      method: 'POST',
      headers,
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Blink OAuth login failed with status ${response.status}`);
    }

    const body = (await response.json()) as BlinkOAuthResponse;
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
      throw new Error('Cannot refresh token before login');
    }

    const clientId: string = this.config.clientId ?? DEFAULT_CLIENT_ID;
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

    const response = await fetch(getOAuthTokenUrl(this.config), {
      method: 'POST',
      headers,
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Blink OAuth refresh failed with status ${response.status}`);
    }

    const body = (await response.json()) as BlinkOAuthResponse;
    this.captureTokens(body, response.headers.get('TOKEN-AUTH'));
  }

  async ensureValidToken(): Promise<void> {
    if (!this.accessToken) {
      await this.login();
      return;
    }

    if (this.isTokenExpired() || this.isTokenExpiringSoon()) {
      await this.refreshTokens();
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
  }
}
