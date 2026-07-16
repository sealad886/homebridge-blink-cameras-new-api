/* global console, module, process, require */

import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';

import type { BlinkHostedOAuthStart, BlinkLogger } from '../types';
import { isBlinkHostedOAuthSupportCode } from '../blink-api/auth';
import {
  type AuthStatus,
  type HostedAuthCompleteRequest,
  HostedAuthService,
  HostedAuthServiceError,
  type HostedAuthStartRequest,
  type VerifyRequest,
} from './hosted-auth-service';

const EXPECTED_CATEGORIES = new Set([
  'invalid_request',
  'authentication',
  'storage',
  'internal',
]);

export function redactSecrets(message: string): string {
  return message
    .replace(
      /((?:^|[?&\s]|%26)(?:code|state|error_description)(?:=|%3D))([^&\s]*?)(?=(?:&|%26|\s|$))/gi,
      '$1<redacted>',
    )
    .replace(
      /((?:password|pass|pwd|token-auth|access_token|refresh_token|authorization)\s*(?:=|:|%3D)\s*)([^\s,;&]+)/gi,
      '$1<redacted>',
    )
    .replace(
      /((?:two[_-]?factor|verification|otp|code|state|error_description)\s*[=:]\s*)([^\s,;&]+)/gi,
      '$1<redacted>',
    );
}

class UiLogger implements BlinkLogger {
  constructor(private readonly server: BlinkUiServer) {}

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

export class BlinkUiServer extends HomebridgePluginUiServer {
  private readonly hostedAuthService: HostedAuthService;
  private readonly debugEnabled: boolean;

  constructor() {
    super();

    this.debugEnabled = this.resolveDebugEnabled();
    this.hostedAuthService = new HostedAuthService({
      storageRoot: this.homebridgeStoragePath ?? '.',
      logger: new UiLogger(this),
    });

    this.logDebug('Custom UI server starting.');
    this.registerRequest('/auth/start', this.handleAuthStart.bind(this));
    this.registerRequest('/auth/complete', this.handleAuthComplete.bind(this));
    this.registerRequest('/verify', this.handleVerify.bind(this));
    this.registerRequest('/status', this.handleStatus.bind(this));
    this.registerRequest('/logout', this.handleLogout.bind(this));
    this.registerRequest('/lock', this.handleLock.bind(this));
    this.registerRequest('/unlock', this.handleUnlock.bind(this));
    this.registerRequest('/test-connection', this.handleTestConnection.bind(this));
    this.ready();
    this.logDebug('Custom UI server ready.');
  }

  pushLog(level: string, message: string): void {
    this.pushEvent('log', {
      level,
      message: redactSecrets(message),
      timestamp: new Date().toISOString(),
    });
  }

  async handleAuthStart(payload: unknown): Promise<BlinkHostedOAuthStart> {
    return this.hostedAuthService.start(payload as HostedAuthStartRequest);
  }

  async handleAuthComplete(payload: unknown): Promise<AuthStatus> {
    return this.hostedAuthService.complete(payload as HostedAuthCompleteRequest);
  }

  async handleVerify(payload: unknown): Promise<AuthStatus> {
    return this.hostedAuthService.verify(payload as VerifyRequest);
  }

  async handleStatus(payload: unknown): Promise<AuthStatus> {
    this.requireEmptyPayload(payload);
    return this.hostedAuthService.status();
  }

  async handleLogout(payload: unknown): Promise<{ success: boolean }> {
    this.requireEmptyPayload(payload);
    await this.hostedAuthService.clear();
    return { success: true };
  }

  async handleLock(payload: unknown): Promise<{ success: boolean }> {
    this.requireEmptyPayload(payload);
    this.logDebug('Locking authentication state.');
    return { success: true };
  }

  async handleUnlock(payload: unknown): Promise<{ success: boolean }> {
    this.requireEmptyPayload(payload);
    await this.hostedAuthService.clear();
    return { success: true };
  }

  async handleTestConnection(payload: unknown): Promise<{ success: boolean; message: string }> {
    return this.hostedAuthService.testConnection(payload as { deviceId?: string });
  }

  private requireEmptyPayload(payload: unknown): void {
    if (payload === undefined) {
      return;
    }
    if (
      typeof payload !== 'object'
      || payload === null
      || Array.isArray(payload)
      || Object.keys(payload).length !== 0
    ) {
      throw new HostedAuthServiceError(
        'Invalid Blink authentication request.',
        'invalid_request',
        400,
      );
    }
  }

  private registerRequest<TResult>(
    route: string,
    handler: (payload: unknown) => Promise<TResult>,
  ): void {
    this.onRequest(route, async (payload: unknown) => {
      this.logDebug(`Request received: ${route}`);
      try {
        const result = await handler(payload);
        this.logDebug(`Request completed: ${route}`);
        return result as Record<string, unknown>;
      } catch (error) {
        const requestError = this.toRequestError(error);
        const category = this.requestCategory(requestError);
        this.logDebug(`Request failed: ${route} category=${category}`);
        throw requestError;
      }
    });
  }

  private toRequestError(error: unknown): RequestError {
    if (error instanceof RequestError) {
      return error;
    }
    if (error instanceof HostedAuthServiceError) {
      return new RequestError(error.message, {
        status: error.status,
        category: error.category,
        ...(isBlinkHostedOAuthSupportCode(error.supportCode)
          ? { supportCode: error.supportCode }
          : {}),
      });
    }
    return new RequestError('Blink authentication request failed. Try again.', {
      status: 500,
      category: 'internal',
    });
  }

  private requestCategory(error: RequestError): string {
    const requestError = error.requestError as { category?: unknown } | null;
    return typeof requestError?.category === 'string'
      && EXPECTED_CATEGORIES.has(requestError.category)
      ? requestError.category
      : 'internal';
  }

  private resolveDebugEnabled(): boolean {
    const env = process.env.HOMEBRIDGE_DEBUG;
    if (env && ['1', 'true', 'yes'].includes(env.toLowerCase())) {
      return true;
    }
    return /blink|homebridge/i.test(process.env.DEBUG ?? '');
  }

  private logDebug(message: string): void {
    if (this.debugEnabled) {
      console.log(`[Blink UI] ${message}`);
    }
  }
}

if (require.main === module) {
  new BlinkUiServer();
}
