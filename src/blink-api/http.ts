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
import { BlinkConfig, BlinkLogger, HttpMethod, nullLogger } from '../types';
import { randomUUID } from 'node:crypto';
import { isSensitiveDiagnosticKey, redactDiagnosticText as redactText, redactDiagnosticUrl as redactUrlForLogging } from './redaction';

/**
 * Standard headers for all Blink API requests
 * Source: API Dossier Section 2.3 - Added by HeadersInterceptor.smali
 * - APP-BUILD: App build number (version code)
 * - User-Agent: Custom UA string
 * - LOCALE: Device locale
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Redact authorization headers for logging
 */
function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (isSensitiveDiagnosticKey(key)) {
      result[key] = '<redacted>';
    } else {
      result[key] = redactText(value);
    }
  }
  return result;
}

function redactBody(body: unknown): unknown {
  if (typeof body === 'string') {
    return redactText(body);
  }

  if (Array.isArray(body)) {
    return body.map((item) => redactBody(item));
  }

  if (!body || typeof body !== 'object') {
    return body;
  }

  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([key, value]) => {
      if (isSensitiveDiagnosticKey(key)) {
        return [key, '<redacted>'];
      }
      return [key, redactBody(value)];
    }),
  );
}

/**
 * Custom error for HTTP failures with diagnostics
 */
export class BlinkHttpError extends Error {
  public readonly statusText = '';
  public readonly responseBody: string | undefined = undefined;
  public readonly responseHeaders: Record<string, string> | undefined = undefined;
  public readonly url: string;

  constructor(
    message: string,
    public readonly status: number,
    statusText: string,
    url: string,
    public readonly method: string,
    _responseBody?: string,
    responseHeaders?: Record<string, string>,
    public readonly failure: 'http' | 'network' | 'response' = 'http',
  ) {
    const untrustedFragments = [
      statusText,
      ...Object.entries(responseHeaders ?? {}).flatMap(([key, value]) => [key, value]),
    ];
    let safeMessage = message;
    for (const fragment of untrustedFragments) {
      if (fragment) {
        safeMessage = safeMessage.split(fragment).join('');
      }
    }
    super(safeMessage.replace(/\s+/g, ' ').trim() || 'Blink API request failed.');
    this.name = 'BlinkHttpError';
    this.url = redactUrlForLogging(url);
  }

  toLogString(): string {
    const lines = [
      `\n${'─'.repeat(60)}`,
      `BLINK API ERROR`,
      `${'─'.repeat(60)}`,
      `${this.method} ${this.url}`,
      `Status: ${this.status}`,
      `Failure: ${this.failure}`,
    ];

    lines.push(`${'─'.repeat(60)}\n`);
    return lines.join('\n');
  }
}

export class BlinkHttp {
  private baseUrl: string;
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

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
    this.logDebug(`Updated base URL to ${redactUrlForLogging(baseUrl)}`);
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

  async post<T>(path: string, body?: unknown, expectedErrorStatuses: readonly number[] = []): Promise<T> {
    return this.request<T>('POST', path, body, 0, true, expectedErrorStatuses);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  /**
   * Execute HTTP request with retry logic and authentication handling
   *
   * Retry strategy:
   * - 401: Refresh token and retry (token expired)
   * - 403: Refresh token and retry (session invalid)
   * - 429: Exponential backoff (rate limited)
   * - 5xx: Linear backoff (server error)
   *
   * Source: API Dossier Section 2.3 - X-Blink-Time-Zone header required
   * Evidence: smali_classes10/com/immediasemi/blink/network/HeadersInterceptor.smali
   */
  private async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    attempt = 0,
    runPreflight = true,
    expectedErrorStatuses: readonly number[] = [],
  ): Promise<T> {
    if (runPreflight) {
      await this.auth.ensureValidToken();
    }

    const url = this.buildUrl(path);
    const safeUrl = redactUrlForLogging(url);
    const safePath = safeUrl.startsWith(this.baseUrl)
      ? safeUrl.slice(this.baseUrl.length)
      : '<redacted-path>';
    const requestId = randomUUID();
    const headers: Record<string, string> = {
      ...buildDefaultHeaders(),
      'Content-Type': 'application/json',
      ...this.auth.getAuthHeaders(),
    };

    if (this.debug && attempt === 0) {
      this.logDebug(`[${requestId}] ${method} ${safeUrl}`);
      this.logDebug(`[${requestId}] Request headers:`, redactHeaders(headers));
      if (body) {
        this.logDebug(`[${requestId}] Request body:`, JSON.stringify(redactBody(body), null, 2));
      }
    } else if (this.debug) {
      this.logDebug(`[${requestId}] ${method} ${safeUrl} (retry attempt ${attempt})`);
    }

    const startTime = Date.now();
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(url, {
        method,
        redirect: 'error',
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: globalThis.AbortSignal.timeout(30_000),
      });
    } catch {
      const error = new BlinkHttpError('Blink API network request failed or timed out.', 0, '', safeUrl, method,
        undefined, undefined, 'network');
      this.log.error(error.toLogString());
      throw error;
    }
    const elapsed = Date.now() - startTime;

    this.logDebug(`[${requestId}] Response status: ${response.status} (${elapsed}ms)`);

    // Token expired or session invalid - refresh once and retry
    if ((response.status === 401 || response.status === 403) && attempt < 1) {
      this.logDebug(`[${requestId}] Authentication rejected (${response.status}), refreshing and retrying...`);
      await response.body?.cancel().catch(() => undefined);
      await this.auth.refreshTokens();
      return this.request<T>(method, path, body, attempt + 1, false, expectedErrorStatuses);
    }

    // Rate limited - exponential backoff
    if (response.status === 429 && attempt < 3) {
      const delay = 1000 * Math.pow(2, attempt);
      this.logDebug(`[${requestId}] Rate limited (429), waiting ${delay}ms before retry...`);
      await response.body?.cancel().catch(() => undefined);
      await sleep(delay);
      return this.request<T>(method, path, body, attempt + 1, false, expectedErrorStatuses);
    }

    // Server error - linear backoff
    if (response.status >= 500 && attempt < 2) {
      const delay = 500 * (attempt + 1);
      this.logDebug(`[${requestId}] Server error (${response.status}), waiting ${delay}ms before retry...`);
      await response.body?.cancel().catch(() => undefined);
      await sleep(delay);
      return this.request<T>(method, path, body, attempt + 1, false, expectedErrorStatuses);
    }

    if (!response.ok) {
      const error = new BlinkHttpError(
        `Blink API ${method} ${safePath} failed: ${response.status}`,
        response.status,
        '',
        safeUrl,
        method,
      );

      await response.body?.cancel().catch(() => undefined);
      if (!expectedErrorStatuses.includes(response.status)) {
        this.log.error(error.toLogString());
      }
      throw error;
    }

    let responseData: T;
    try {
      responseData = (await response.json()) as T;
    } catch {
      const error = new BlinkHttpError('Blink API returned an unreadable JSON response.', response.status, '', safeUrl, method,
        undefined, undefined, 'response');
      this.log.error(error.toLogString());
      throw error;
    }

    if (this.debug) {
      // Only log response body in debug mode (can be verbose)
      this.logDebug(`[${requestId}] Response body:`, JSON.stringify(redactBody(responseData), null, 2).slice(0, 500) + '...');
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
