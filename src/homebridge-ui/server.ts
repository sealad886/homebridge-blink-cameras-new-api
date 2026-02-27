/* global console, process */
/**
 * Homebridge Plugin UI Server
 *
 * Server-side script for handling Blink authentication flow in the custom UI.
 * Uses @homebridge/plugin-ui-utils to provide API endpoints for:
 * - Login initiation
 * - 2FA verification
 * - Client verification
 * - Account verification
 * - Token status checking
 */

import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import { Blink2FARequiredError, BlinkAuthenticationError } from '../blink-api/auth';
import { BlinkApi } from '../blink-api/client';
import { BlinkAuthState, BlinkConfig, BlinkLogger } from '../types';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

interface LoginRequest {
  username: string;
  password: string;
  deviceId?: string;
  tier?: string;
}

interface VerifyRequest {
  code: string;
  type: '2fa' | 'client' | 'account';
  trustDevice?: boolean;
}

interface AuthStatus {
  authenticated: boolean;
  requires2FA?: boolean;
  requiresClientVerification?: boolean;
  requiresAccountVerification?: boolean;
  phoneLastFour?: string;
  email?: string;
  accountId?: number;
  tier?: string;
  message?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFY_CODE_PATTERN = /^[A-Za-z0-9-]{4,12}$/;

function redactSecrets(message: string): string {
  return message
    .replace(/(password|pass|pwd)\s*[=:]\s*[^\s,;]+/gi, '$1=<redacted>')
    .replace(/(token-auth|access_token|refresh_token|authorization)\s*[=:]\s*[^\s,;]+/gi, '$1=<redacted>')
    .replace(/(two[_-]?factor|verification|otp|code)\s*[=:]\s*[^\s,;]+/gi, '$1=<redacted>');
}

// Logger that sends messages to the UI
class UiLogger implements BlinkLogger {
  private server: BlinkUiServer;

  constructor(server: BlinkUiServer) {
    this.server = server;
  }

  debug(message: string): void {
    this.server.pushLog('debug', message);
  }

  info(message: string): void {
    this.server.pushLog('info', message);
  }

  warn(message: string): void {
    this.server.pushLog('warn', message);
  }

  error(message: string): void {
    this.server.pushLog('error', message);
  }
}

class BlinkUiServer extends HomebridgePluginUiServer {
  private blinkApi: BlinkApi | null = null;
  private pendingConfig: BlinkConfig | null = null;
  private authStatus: AuthStatus = { authenticated: false };
  private lastAccountId: number | null = null;
  private readonly debugEnabled: boolean;

  constructor() {
    super();

    this.debugEnabled = this.resolveDebugEnabled();
    this.logDebug('Custom UI server starting.');
    this.logDebug(`Storage path: ${this.homebridgeStoragePath ?? 'unknown'}`);
    this.logDebug(`Config path: ${this.homebridgeConfigPath ?? 'unknown'}`);

    // Register request handlers
    this.registerRequest('/login', this.handleLogin.bind(this));
    this.registerRequest('/verify', this.handleVerify.bind(this));
    this.registerRequest('/status', this.handleStatus.bind(this));
    this.registerRequest('/logout', this.handleLogout.bind(this));
    this.registerRequest('/lock', this.handleLock.bind(this));
    this.registerRequest('/unlock', this.handleUnlock.bind(this));
    this.registerRequest('/test-connection', this.handleTestConnection.bind(this));

    // Signal ready
    this.ready();
    this.logDebug('Custom UI server ready.');
  }

  /**
   * Push log messages to the UI for display
   */
  pushLog(level: string, message: string): void {
    this.pushEvent('log', {
      level,
      message: redactSecrets(message),
      timestamp: new Date().toISOString(),
    });
  }

  private resolveDebugEnabled(): boolean {
    const env = process.env.HOMEBRIDGE_DEBUG;
    if (env && ['1', 'true', 'yes'].includes(env.toLowerCase())) {
      return true;
    }
    const debug = process.env.DEBUG ?? '';
    return /blink|homebridge/i.test(debug);
  }

  private logDebug(message: string): void {
    if (!this.debugEnabled) {
      return;
    }
    console.log(`[Blink UI] ${message}`);
  }

  private registerRequest<TPayload, TResult>(
    path: string,
    handler: (payload: TPayload) => Promise<TResult>,
  ): void {
    this.onRequest(path, async (payload: unknown) => {
      this.logDebug(`Request received: ${path}`);
      try {
        const result = await handler(payload as TPayload);
        this.logDebug(`Request completed: ${path}`);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logDebug(`Request failed: ${path} (${message})`);
        throw error;
      }
    });
  }

  /**
   * Get the auth storage path for this Homebridge instance.
   * Single dot-file in the storage root — no custom subdirectory needed.
   * Must match the path computed by platform.ts buildAuthStoragePath().
   */
  private getAuthStoragePath(): string {
    const storagePath = this.homebridgeStoragePath ?? '.';
    return path.join(storagePath, '.blink-auth.json');
  }

  /** Legacy path from pre-0.6 releases for automatic migration. */
  private getLegacyAuthStoragePath(): string {
    const storagePath = this.homebridgeStoragePath ?? '.';
    return path.join(storagePath, 'blink-auth', 'auth-state.json');
  }

  /**
   * Generate a unique device ID if not provided
   */
  private generateDeviceId(): string {
    return `homebridge-${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Extract account ID from API response after login
   */
  private async extractAccountId(api: BlinkApi): Promise<number | undefined> {
    try {
      const homescreen = await api.getHomescreen();
      const accountId = homescreen.account?.account_id;
      if (accountId) {
        this.lastAccountId = accountId;
        return accountId;
      }
    } catch {
      // Ignore errors, account ID is optional
    }
    return this.lastAccountId ?? undefined;
  }

  /**
   * Handle login request - initiates OAuth flow
   */
  async handleLogin(payload: LoginRequest): Promise<AuthStatus> {
    const username = payload.username?.trim();
    const password = payload.password?.trim();
    const deviceId = payload.deviceId?.trim();
    const tier = payload.tier?.trim();

    if (!username || !password) {
      throw new RequestError('Username and password are required', { status: 400 });
    }

    if (!EMAIL_PATTERN.test(username)) {
      throw new RequestError('A valid email address is required', { status: 400 });
    }

    // Build config for Blink API
    const config: BlinkConfig = {
      email: username,
      password: password,
      hardwareId: deviceId || this.generateDeviceId(),
      tier: tier || 'prod',
      authStoragePath: this.getAuthStoragePath(),
      legacyAuthStoragePath: this.getLegacyAuthStoragePath(),
      debugAuth: false,
      logger: new UiLogger(this),
    };

    this.pendingConfig = config;
    this.blinkApi = new BlinkApi(config);

    try {
      await this.blinkApi.login();

      // Login successful - get account info
      const accountId = await this.extractAccountId(this.blinkApi);

      this.authStatus = {
        authenticated: true,
        email: username,
        accountId: accountId,
        tier: config.tier,
        message: 'Successfully authenticated with Blink',
      };

      this.pushEvent('auth-success', this.authStatus);
      return this.authStatus;

    } catch (error) {
      if (error instanceof Blink2FARequiredError) {
        this.authStatus = {
          authenticated: false,
          requires2FA: true,
          phoneLastFour: error.phoneLastFour,
          email: username,
          message: '2FA verification required. Check your email/phone for a code.',
        };
        this.pushEvent('auth-2fa-required', this.authStatus);
        return this.authStatus;
      }

      if (error instanceof BlinkAuthenticationError) {
        const details = error.details;

        // Check for client verification requirement
        if (details.message?.includes('client_verification_required') ||
            (details.responseBody && typeof details.responseBody === 'object' &&
            'client_verification_required' in details.responseBody)) {
          this.authStatus = {
            authenticated: false,
            requiresClientVerification: true,
            email: username,
            message: 'New device verification required. Check your email for a code.',
          };
          this.pushEvent('auth-client-verification-required', this.authStatus);
          return this.authStatus;
        }

        throw new RequestError(error.message, {
          status: details.status,
          details: details.message,
        });
      }

      // Check for verification requirements in error message
      if (error instanceof Error) {
        if (error.message.includes('client verification required')) {
          this.authStatus = {
            authenticated: false,
            requiresClientVerification: true,
            email: username,
            message: 'New device verification required. Check your email for a code.',
          };
          this.pushEvent('auth-client-verification-required', this.authStatus);
          return this.authStatus;
        }

        if (error.message.includes('account verification required')) {
          this.authStatus = {
            authenticated: false,
            requiresAccountVerification: true,
            email: username,
            message: 'Account verification required. Check your email/phone for a code.',
          };
          this.pushEvent('auth-account-verification-required', this.authStatus);
          return this.authStatus;
        }
      }

      throw new RequestError(
        error instanceof Error ? error.message : 'Login failed',
        { status: 401 },
      );
    }
  }

  /**
   * Handle verification code submission
   */
  async handleVerify(payload: VerifyRequest): Promise<AuthStatus> {
    const code = payload.code?.trim();
    const type = payload.type;
    const trustDevice = payload.trustDevice;

    if (!code) {
      throw new RequestError('Verification code is required', { status: 400 });
    }

    if (!VERIFY_CODE_PATTERN.test(code)) {
      throw new RequestError('Verification code must be 4-12 alphanumeric characters', { status: 400 });
    }

    if (!this.blinkApi || !this.pendingConfig) {
      throw new RequestError('No pending authentication. Please login first.', { status: 400 });
    }

    try {
      switch (type) {
        case '2fa':
          await this.blinkApi.complete2FA(code);
          break;

        case 'client':
          this.pendingConfig.clientVerificationCode = code;
          this.pendingConfig.trustDevice = trustDevice ?? true;
          // Re-create API with verification code
          this.blinkApi = new BlinkApi(this.pendingConfig);
          await this.blinkApi.login();
          break;

        case 'account':
          this.pendingConfig.accountVerificationCode = code;
          // Re-create API with verification code
          this.blinkApi = new BlinkApi(this.pendingConfig);
          await this.blinkApi.login();
          break;

        default:
          throw new RequestError(`Unknown verification type: ${type}`, { status: 400 });
      }

      // Verification successful - get account info
      const accountId = await this.extractAccountId(this.blinkApi);

      this.authStatus = {
        authenticated: true,
        email: this.pendingConfig.email,
        accountId: accountId,
        tier: this.pendingConfig.tier,
        message: 'Verification successful! Authentication complete.',
      };

      this.pushEvent('auth-success', this.authStatus);
      return this.authStatus;

    } catch (error) {
      // Check if another verification step is required
      if (error instanceof Error) {
        if (error.message.includes('client verification required')) {
          this.authStatus = {
            authenticated: false,
            requiresClientVerification: true,
            message: 'New device verification required. Check your email for a code.',
          };
          this.pushEvent('auth-client-verification-required', this.authStatus);
          return this.authStatus;
        }

        if (error.message.includes('account verification required')) {
          this.authStatus = {
            authenticated: false,
            requiresAccountVerification: true,
            message: 'Account verification required. Check your email/phone for a code.',
          };
          this.pushEvent('auth-account-verification-required', this.authStatus);
          return this.authStatus;
        }
      }

      throw new RequestError(
        error instanceof Error ? error.message : 'Verification failed',
        { status: 401 },
      );
    }
  }

  /**
   * Check current authentication status.
   *
   * If we have no in-memory session (e.g. after a Homebridge restart), try to
   * rehydrate from the persisted auth-state file written by captureTokens().
   * This lets the UI show "Authenticated" without forcing a re-login.
   */
  async handleStatus(): Promise<AuthStatus> {
    if (!this.authStatus.authenticated) {
      const diskState = await this.loadPersistedAuthState();
      if (diskState) {
        this.authStatus = {
          authenticated: true,
          email: diskState.email ?? undefined,
          accountId: diskState.accountId ?? undefined,
          tier: diskState.tier ?? undefined,
          message: 'Restored from persisted auth state',
        };
      }
    }
    return this.authStatus;
  }

  /**
   * Read the on-disk .blink-auth.json (or legacy blink-auth/auth-state.json)
   * and return it if it looks valid (has an access token and is not expired).
   */
  private async loadPersistedAuthState(): Promise<BlinkAuthState | null> {
    // Try primary dot-file first, then fall back to legacy subdirectory path
    for (const filePath of [this.getAuthStoragePath(), this.getLegacyAuthStoragePath()]) {
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const state = JSON.parse(raw) as BlinkAuthState;
        if (!state?.accessToken) continue;
        if (state.tokenExpiry) {
          const expiry = new Date(state.tokenExpiry);
          if (!Number.isNaN(expiry.getTime()) && expiry.getTime() <= Date.now()) {
            this.logDebug(`Persisted auth state at ${filePath} has expired token; skipping`);
            continue;
          }
        }
        this.logDebug(`Loaded valid persisted auth state from ${filePath}`);
        return state;
      } catch {
        // File doesn't exist or is unreadable — try next
      }
    }
    return null;
  }

  /**
   * Clear authentication state
   */
  async handleLogout(): Promise<{ success: boolean }> {
    this.blinkApi = null;
    this.pendingConfig = null;
    this.authStatus = { authenticated: false };
    return { success: true };
  }

  /**
   * Lock authentication — clears stored verification codes
   */
  async handleLock(): Promise<{ success: boolean }> {
    this.logDebug('Locking authentication state');
    return { success: true };
  }

  /**
   * Unlock authentication — allows re-authentication
   */
  async handleUnlock(): Promise<{ success: boolean }> {
    this.logDebug('Unlocking authentication state');
    this.blinkApi = null;
    this.pendingConfig = null;
    this.authStatus = { authenticated: false };
    return { success: true };
  }

  /**
   * Test connection with current config
   */
  async handleTestConnection(payload: LoginRequest): Promise<{ success: boolean; message: string }> {
    const { username, password, deviceId, tier } = payload;

    if (!username || !password) {
      throw new RequestError('Username and password are required', { status: 400 });
    }

    const config: BlinkConfig = {
      email: username,
      password: password,
      hardwareId: deviceId || this.generateDeviceId(),
      tier: tier || 'prod',
      authStoragePath: this.getAuthStoragePath(),
      legacyAuthStoragePath: this.getLegacyAuthStoragePath(),
      logger: new UiLogger(this),
    };

    const api = new BlinkApi(config);

    try {
      await api.login();
      const homescreen = await api.getHomescreen();
      const networkCount = homescreen.networks?.length ?? 0;
      const cameraCount = homescreen.cameras?.length ?? 0;

      return {
        success: true,
        message: `Connected! Found ${networkCount} network(s) and ${cameraCount} camera(s).`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }
}

// Start the server
(() => new BlinkUiServer())();
