import { Buffer } from 'node:buffer';
import { readBoundedBody, readBoundedJson, type ResponseBodyKind } from './response-body';
/**
 * Blink HTTP Client
 *
 * Handles all REST API requests with authentication, standard headers, and retry logic.
 * Source: API Dossier Section 2.3 (Standard Request Headers)
 * Evidence: smali_classes10/com/immediasemi/blink/network/HeadersInterceptor.smali
 */

import { BlinkAuth } from './auth';
import { RequestOptions, checkRequestBudget, withinRequestBudget, budgetedDelay } from '../operation-budget';
import { buildDefaultHeaders } from './headers';
import { getRestBaseUrl } from './urls';
import { BlinkConfig, BlinkLogger, HttpMethod, nullLogger } from '../types';
import { randomUUID } from 'node:crypto';
import { redactDiagnosticUrl as redactUrlForLogging } from './redaction';
import {
  describeNetworkFailure,
  formatNetworkFailureDiagnostic,
  NetworkFailureDiagnostic,
} from './network-diagnostics';

export interface BlinkHttpRequestOptions extends RequestOptions {
  /** A single wire attempt: no authentication, rate-limit, refusal or server-error replay. */
  retry?: false;
  maxResponseBytes?: number;
  responseKind?: ResponseBodyKind;
  /** Unit-returning endpoints do not require JSON. Body limits still apply. */
  responseType?: 'void' | 'binary';
  /** Recheck a captured client scope after async authentication and immediately before dispatch. */
  beforeDispatch?: () => void;
  /** An explicit bootstrap probe; ordinary SDK requests follow committed auth routing. */
  tierOverride?: string;
}

/**
 * Standard headers for all Blink API requests
 * Source: API Dossier Section 2.3 - Added by HeadersInterceptor.smali
 * - APP-BUILD: App build number (version code)
 * - User-Agent: Custom UA string
 * - LOCALE: Device locale
 */


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
    public readonly networkDiagnostic?: NetworkFailureDiagnostic,
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

    if (this.networkDiagnostic) {
      lines.push(`Network: ${formatNetworkFailureDiagnostic(this.networkDiagnostic)}`);
    }

    lines.push(`${'─'.repeat(60)}\n`);
    return lines.join('\n');
  }
}

/** A typed refusal of a new POST is different from an accepted command's failed GET. */
export function isBlinkPostRefusal(error: unknown): error is BlinkHttpError {
  return error instanceof BlinkHttpError && (error as BlinkHttpError & { dispatched?: boolean }).dispatched !== false
    && error.failure === 'http' && error.method === 'POST'
    && error.status >= 400 && error.status < 500 && error.status !== 408;
}

/** Dispatch evidence belongs to this request, never to a shared auth failure or AbortSignal reason. */
function requestLocalError(error: Error, dispatched?: boolean): Error {
  const local = error instanceof globalThis.DOMException ? new globalThis.DOMException(error.message, error.name) : new Error(error.message);
  Object.setPrototypeOf(local, Object.getPrototypeOf(error));
  const properties: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(error);
  delete properties.cause;
  delete properties.dispatched;
  Object.defineProperties(local, properties);
  Object.defineProperties(local, {
    cause: { value: error, configurable: true },
    dispatched: { value: dispatched, configurable: true },
  });
  return local;
}

export class BlinkHttp {
  private baseUrl: string;
  private readonly log: BlinkLogger;
  private readonly debug: boolean;

  constructor(
    private readonly auth: BlinkAuth,
    config: BlinkConfig,
    baseUrlOverride?: string,
    private readonly prepareRequest?: (path: string, options: BlinkHttpRequestOptions) => void,
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
  private logDebug(message: string): void {
    if (this.debug) {
      this.log.info(`[HTTP Debug] ${message}`);
    }
  }

  async get<T>(path: string, options?: BlinkHttpRequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, 0, true, [], options);
  }

  async post<T>(path: string, body?: unknown, expectedErrorStatuses: readonly number[] = [], options?: BlinkHttpRequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, 0, true, expectedErrorStatuses, options);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  async getBinary(path: string, options: BlinkHttpRequestOptions = {}): Promise<Buffer> {
    return this.request<Buffer>('GET', path, undefined, 0, true, [],
      { ...options, responseType: 'binary', responseKind: 'native-media' });
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
    options: BlinkHttpRequestOptions = {},
    retried406 = false,
  ): Promise<T> {
    let mayHaveDispatched = false;
    try {
      checkRequestBudget(options);
      if (options.maxResponseBytes !== undefined && (!Number.isSafeInteger(options.maxResponseBytes) || options.maxResponseBytes < 1)) {
        throw new Error('Blink response byte limit is invalid.');
      }
      let url = this.buildUrl(path);
      if (runPreflight) {
        await withinRequestBudget(this.auth.ensureValidToken(), options);
        checkRequestBudget(options);
      }

      this.prepareRequest?.(path, options);
      url = this.buildUrl(path);
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
      } else if (this.debug) {
        this.logDebug(`[${requestId}] ${method} ${safeUrl} (retry attempt ${attempt})`);
      }

      options.beforeDispatch?.(); checkRequestBudget(options);
      const startTime = Date.now();
      const timeoutMs = Math.max(1, Math.min(30_000, (options.deadline ?? startTime + 30_000) - startTime));
      const timeoutSignal = globalThis.AbortSignal.timeout(timeoutMs);
      const signal = options.signal ? globalThis.AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
      const requestBody = body ? JSON.stringify(body) : undefined;
      let response: Awaited<ReturnType<typeof fetch>>;
      try {
        mayHaveDispatched = true;
        response = await withinRequestBudget(fetch(url, {
          method,
          redirect: 'error',
          headers,
          body: requestBody,
          signal,
        }), options);
      } catch (cause) {
        // Only the explicit connection-establishment error proves no accepted operation.
        // Diagnostic traversal also finds nested/aggregate codes, which are not such proof.
        const transport = cause as { code?: unknown; cause?: { code?: unknown } } | null;
        if (!signal.aborted && (transport?.code === 'UND_ERR_CONNECT_TIMEOUT'
          || (transport?.code === undefined && transport?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT'))) {
          mayHaveDispatched = false;
        }
        checkRequestBudget(options);
        const diagnostic = describeNetworkFailure(cause, url, startTime);
        const error = new BlinkHttpError('Blink API network request failed or timed out.', 0, '', safeUrl, method,
          undefined, undefined, 'network', diagnostic);
        this.log.error(error.toLogString());
        throw error;
      }
      const elapsed = Date.now() - startTime;

      this.logDebug(`[${requestId}] Response status: ${response.status} (${elapsed}ms)`);

      // Token expired or session invalid - refresh once and retry
      if (options.retry !== false && (response.status === 401 || response.status === 403) && attempt < 1) {
        this.logDebug(`[${requestId}] Authentication rejected (${response.status}), refreshing and retrying...`);
        await response.body?.cancel().catch(() => undefined);
        await withinRequestBudget(this.auth.refreshTokens(), options);
        return this.request<T>(method, path, body, attempt + 1, false, expectedErrorStatuses, options, retried406);
      }

      // Observed provider 406 refusals can recover on the same read without
      // changing routing or authentication. Retry once; never replay a mutation.
      if (options.retry !== false && response.status === 406 && method === 'GET' && !retried406) {
        await response.body?.cancel().catch(() => undefined);
        await budgetedDelay(1000, options);
        return this.request<T>(method, path, body, attempt, false, expectedErrorStatuses, options, true);
      }

      // Rate limited - exponential backoff
      if (options.retry !== false && response.status === 429 && attempt < 3) {
        const delay = 1000 * Math.pow(2, attempt);
        this.logDebug(`[${requestId}] Rate limited (429), waiting ${delay}ms before retry...`);
        await response.body?.cancel().catch(() => undefined);
        await budgetedDelay(delay, options);
        return this.request<T>(method, path, body, attempt + 1, false, expectedErrorStatuses, options, retried406);
      }

      // Server error - linear backoff
      if (options.retry !== false && response.status >= 500 && attempt < 2) {
        const delay = 500 * (attempt + 1);
        this.logDebug(`[${requestId}] Server error (${response.status}), waiting ${delay}ms before retry...`);
        await response.body?.cancel().catch(() => undefined);
        await budgetedDelay(delay, options);
        return this.request<T>(method, path, body, attempt + 1, false, expectedErrorStatuses, options, retried406);
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

      const bodyOptions = { ...options, maxBytes: options.maxResponseBytes,
        deadline: Math.min(options.deadline ?? Infinity, startTime + timeoutMs), signal };
      if (options.responseType === 'void') {
        await readBoundedBody(response, { ...bodyOptions, kind: 'command' });
        return undefined as T;
      }
      if (options.responseType === 'binary') return await readBoundedBody(response, { ...bodyOptions, kind: 'native-media' }) as T;

      let responseData: T;
      try {
        responseData = (await readBoundedJson(response, { ...bodyOptions, kind: options.responseKind ??
          (/(?:\/homescreen|\/users\/(?:info|tier_info)|\/media(?:\?|$)|\/unwatched_media(?:\?|$))/.test(path) ? 'rest' : 'command') })) as T;
      } catch {
        checkRequestBudget(options);
        const error = new BlinkHttpError('Blink API returned an unreadable JSON response.', response.status, '', safeUrl, method,
          undefined, undefined, 'response');
        this.log.error(error.toLogString());
        throw error;
      }

      return responseData;
    } catch (error) {
      // A retry cannot establish that an earlier wire attempt was never accepted.
      if (error instanceof Error || error instanceof globalThis.DOMException) {
        if (!mayHaveDispatched && attempt === 0) throw requestLocalError(error, false);
        // A caller's/shared error cannot establish no-send proof for this dispatched request.
        if ((error as Error & { dispatched?: boolean }).dispatched === false) throw requestLocalError(error);
      }
      throw error;
    }
  }

  /**
   * Build full URL from path
   * Source: API Dossier Section 1.1 - REST API base URL pattern
   */
  private buildUrl(path: string): string {
    const cleaned = path.startsWith('/') ? path.substring(1) : path;
    const segments = cleaned.split('?')[0].split('/');
    for (let index = 0; index < segments.length - 1; index++) {
      if (['accounts', 'clients', 'networks', 'cameras', 'owls', 'doorbells', 'commands'].includes(segments[index])
        && (!/^[1-9][0-9]*$/.test(segments[index + 1]) || !Number.isSafeInteger(Number(segments[index + 1])))) throw new Error('Blink API path contains an invalid identifier.');
    }
    return `${this.baseUrl}${cleaned}`;
  }
}
