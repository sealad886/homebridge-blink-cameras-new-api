/**
 * Blink HTTP Client
 *
 * Handles all REST API requests with authentication, standard headers, and retry logic.
 * Source: API Dossier Section 2.3 (Standard Request Headers)
 * Evidence: smali_classes10/com/immediasemi/blink/network/HeadersInterceptor.smali
 */

import { BlinkAuth } from './auth';
import { buildDefaultHeaders } from './headers';
import { getRestBaseUrl } from './urls';
import { BlinkConfig, BlinkLogger, HttpMethod } from '../types';
import { randomUUID } from 'node:crypto';

/**
 * Standard headers for all Blink API requests
 * Source: API Dossier Section 2.3 - Added by HeadersInterceptor.smali
 * - APP-BUILD: App build number (version code)
 * - User-Agent: Custom UA string
 * - LOCALE: Device locale
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
 * Redact authorization headers for logging
 */
function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'authorization' || lowerKey === 'token-auth') {
      result[key] = value.length > 20 ? `${value.slice(0, 10)}...${value.slice(-4)}` : '***';
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Custom error for HTTP failures with diagnostics
 */
export class BlinkHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly url: string,
    public readonly method: string,
    public readonly responseBody?: string,
    public readonly responseHeaders?: Record<string, string>,
  ) {
    super(message);
    this.name = 'BlinkHttpError';
  }

  toLogString(): string {
    const lines = [
      `\n${'─'.repeat(60)}`,
      `BLINK API ERROR`,
      `${'─'.repeat(60)}`,
      `${this.method} ${this.url}`,
      `Status: ${this.status} ${this.statusText}`,
    ];

    if (this.responseHeaders) {
      lines.push(`\nResponse Headers:`);
      for (const [key, value] of Object.entries(this.responseHeaders)) {
        lines.push(`  ${key}: ${value}`);
      }
    }

    if (this.responseBody) {
      lines.push(`\nResponse Body:`);
      try {
        const parsed = JSON.parse(this.responseBody);
        lines.push(JSON.stringify(parsed, null, 2));
      } catch {
        lines.push(this.responseBody);
      }
    }

    lines.push(`${'─'.repeat(60)}\n`);
    return lines.join('\n');
  }
}

export class BlinkHttp {
  private readonly baseUrl: string;
  private readonly log: BlinkLogger;
  private readonly debug: boolean;

  constructor(
    private readonly auth: BlinkAuth,
    config: BlinkConfig,
    baseUrlOverride?: string,
  ) {
    this.baseUrl = baseUrlOverride ?? getRestBaseUrl(config);
    this.log = config.logger ?? nullLogger;
    this.debug = config.debugAuth ?? false;
  }

  /**
   * Log diagnostic message if debug is enabled
   */
  private logDebug(message: string, ...args: unknown[]): void {
    if (this.debug) {
      this.log.info(`[HTTP Debug] ${message}`, ...args);
    }
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  /**
   * Execute HTTP request with retry logic and authentication handling
   *
   * Retry strategy:
   * - 401: Refresh token and retry (token expired)
   * - 403: Re-login and retry (session invalid)
   * - 429: Exponential backoff (rate limited)
   * - 5xx: Linear backoff (server error)
   *
   * Source: API Dossier Section 2.3 - X-Blink-Time-Zone header required
   * Evidence: smali_classes10/com/immediasemi/blink/network/HeadersInterceptor.smali
   */
  private async request<T>(method: HttpMethod, path: string, body?: unknown, attempt = 0): Promise<T> {
    await this.auth.ensureValidToken();

    const url = this.buildUrl(path);
    const requestId = randomUUID();
    const headers: Record<string, string> = {
      ...buildDefaultHeaders(),
      'Content-Type': 'application/json',
      ...this.auth.getAuthHeaders(),
    };

    if (attempt === 0) {
      this.logDebug(`[${requestId}] ${method} ${url}`);
      this.logDebug(`[${requestId}] Request headers:`, redactHeaders(headers));
      if (body) {
        this.logDebug(`[${requestId}] Request body:`, JSON.stringify(body, null, 2));
      }
    } else {
      this.logDebug(`[${requestId}] ${method} ${url} (retry attempt ${attempt})`);
    }

    const startTime = Date.now();
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const elapsed = Date.now() - startTime;

    this.logDebug(`[${requestId}] Response: ${response.status} ${response.statusText} (${elapsed}ms)`);

    // Token expired - refresh and retry
    if (response.status === 401 && attempt < 1) {
      this.logDebug(`[${requestId}] Token expired (401), refreshing and retrying...`);
      await this.auth.refreshTokens();
      return this.request<T>(method, path, body, attempt + 1);
    }

    // Session invalid - re-login and retry
    if (response.status === 403 && attempt < 1) {
      this.logDebug(`[${requestId}] Session invalid (403), re-logging in and retrying...`);
      await this.auth.login();
      return this.request<T>(method, path, body, attempt + 1);
    }

    // Rate limited - exponential backoff
    if (response.status === 429 && attempt < 3) {
      const delay = 1000 * Math.pow(2, attempt);
      this.logDebug(`[${requestId}] Rate limited (429), waiting ${delay}ms before retry...`);
      await sleep(delay);
      return this.request<T>(method, path, body, attempt + 1);
    }

    // Server error - linear backoff
    if (response.status >= 500 && attempt < 2) {
      const delay = 500 * (attempt + 1);
      this.logDebug(`[${requestId}] Server error (${response.status}), waiting ${delay}ms before retry...`);
      await sleep(delay);
      return this.request<T>(method, path, body, attempt + 1);
    }

    if (!response.ok) {
      const text = await response.text();
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const error = new BlinkHttpError(
        `Blink API ${method} ${path} failed: ${response.status} ${response.statusText}`,
        response.status,
        response.statusText,
        url,
        method,
        text,
        responseHeaders,
      );

      // Always log HTTP errors
      this.log.error(error.toLogString());
      throw error;
    }

    const responseData = (await response.json()) as T;

    if (this.debug) {
      // Only log response body in debug mode (can be verbose)
      this.logDebug(`[${requestId}] Response body:`, JSON.stringify(responseData, null, 2).slice(0, 500) + '...');
    }

    return responseData;
  }

  /**
   * Build full URL from path
   * Source: API Dossier Section 1.1 - REST API base URL pattern
   */
  private buildUrl(path: string): string {
    const cleaned = path.startsWith('/') ? path.substring(1) : path;
    return `${this.baseUrl}${cleaned}`;
  }
}
