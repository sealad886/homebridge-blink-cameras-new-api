import { URL } from 'node:url';
import { BlinkLogger } from '../types';

const SENSITIVE_LOG_KEY =
  /(authorization|token-auth|access[_-]?token|refresh[_-]?token|password|hardware[_-]?id|cookie|2fa|pin|email|phone|device_identifier|client_name|serial)/i;

/**
 * No-op logger that discards all output.
 * Used as default when configuration doesn't provide a logger.
 */
export const nullLogger: BlinkLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Conditionally log a debug message with an optional prefix.
 * Used by modules that support debug mode (debugAuth, etc).
 */
export function debugLog(log: BlinkLogger, debugEnabled: boolean, prefix: string, message: string, ...args: unknown[]): void {
  if (debugEnabled) {
    log.info(`[${prefix} Debug] ${message}`, ...args);
  }
}

export function redactValue(value: string | undefined, showChars = 4): string {
  if (!value) return '<empty>';
  if (value.length <= showChars * 2) return '***';
  return `${value.slice(0, showChars)}...${value.slice(-showChars)}`;
}

export function sanitizeForLog(value: unknown, keyHint?: string): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForLog(entry, keyHint));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sanitizeForLog(entry, key)]),
    );
  }

  if (typeof value === 'string' && keyHint && SENSITIVE_LOG_KEY.test(keyHint)) {
    return redactValue(value, 3);
  }

  return value;
}

export function sanitizeUrlForLog(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    const withoutQuery = rawUrl.split('?')[0];
    return withoutQuery.replace(/\/\/[^/@]+@/, '//<redacted>@');
  }
}
