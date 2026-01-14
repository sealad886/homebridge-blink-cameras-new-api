/**
 * Blink HTTP Client
 *
 * Handles all REST API requests with authentication, standard headers, and retry logic.
 * Source: API Dossier Section 2.3 (Standard Request Headers)
 * Evidence: smali_classes10/com/immediasemi/blink/network/HeadersInterceptor.smali
 */

import { BlinkAuth } from './auth';
import { getRestBaseUrl } from './urls';
import { BlinkConfig, HttpMethod } from '../types';

/**
 * Standard headers for all Blink API requests
 * Source: API Dossier Section 2.3 - Added by HeadersInterceptor.smali
 * - APP-BUILD: App build number (version code)
 * - User-Agent: Custom UA string
 * - LOCALE: Device locale
 */
const DEFAULT_HEADERS = {
  'APP-BUILD': 'ANDROID_29426569',
  'User-Agent': 'Blink/51.0 (NodeJS; Homebridge)',
  LOCALE: 'en_US',
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class BlinkHttp {
  private readonly restBaseUrl: string;

  constructor(private readonly auth: BlinkAuth, config: BlinkConfig) {
    this.restBaseUrl = getRestBaseUrl(config);
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
    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      // X-Blink-Time-Zone required per API Dossier Section 2.3
      'X-Blink-Time-Zone': Intl.DateTimeFormat().resolvedOptions().timeZone,
      'Content-Type': 'application/json',
      ...this.auth.getAuthHeaders(),
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Token expired - refresh and retry
    if (response.status === 401 && attempt < 1) {
      await this.auth.refreshTokens();
      return this.request<T>(method, path, body, attempt + 1);
    }

    // Session invalid - re-login and retry
    if (response.status === 403 && attempt < 1) {
      await this.auth.login();
      return this.request<T>(method, path, body, attempt + 1);
    }

    // Rate limited - exponential backoff
    if (response.status === 429 && attempt < 3) {
      await sleep(1000 * Math.pow(2, attempt));
      return this.request<T>(method, path, body, attempt + 1);
    }

    // Server error - linear backoff
    if (response.status >= 500 && attempt < 2) {
      await sleep(500 * (attempt + 1));
      return this.request<T>(method, path, body, attempt + 1);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Blink HTTP ${response.status}: ${text}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Build full URL from path
   * Source: API Dossier Section 1.1 - REST API base URL pattern
   */
  private buildUrl(path: string): string {
    const cleaned = path.startsWith('/') ? path.substring(1) : path;
    return `${this.restBaseUrl}${cleaned}`;
  }
}
