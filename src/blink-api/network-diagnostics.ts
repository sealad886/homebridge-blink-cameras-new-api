import { URL } from 'node:url';

export type NetworkFailureType =
  | 'dns'
  | 'connect-timeout'
  | 'timeout'
  | 'aborted'
  | 'connection'
  | 'tls'
  | 'socket'
  | 'network';

export interface NetworkFailureDiagnostic {
  type: NetworkFailureType;
  code?: string;
  elapsedMs: number;
  hostname: string;
}

/** Format only fixed labels and values already constrained by this module. */
export function formatNetworkFailureDiagnostic(diagnostic: NetworkFailureDiagnostic): string {
  const code = diagnostic.code ? ` code=${diagnostic.code}` : '';
  return `type=${diagnostic.type}${code} hostname=${diagnostic.hostname} elapsedMs=${diagnostic.elapsedMs}`;
}

const CODE_TYPES = new Map<string, NetworkFailureType>([
  ['ENOTFOUND', 'dns'],
  ['EAI_AGAIN', 'dns'],
  ['UND_ERR_CONNECT_TIMEOUT', 'connect-timeout'],
  ['ETIMEDOUT', 'timeout'],
  ['ECONNREFUSED', 'connection'],
  ['ECONNRESET', 'connection'],
  ['EHOSTUNREACH', 'connection'],
  ['ENETUNREACH', 'connection'],
  ['ERR_TLS_CERT_ALTNAME_INVALID', 'tls'],
  ['CERT_HAS_EXPIRED', 'tls'],
  ['DEPTH_ZERO_SELF_SIGNED_CERT', 'tls'],
  ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'tls'],
  ['UND_ERR_SOCKET', 'socket'],
]);

const MAX_VISITED_ERRORS = 12;
const MAX_ERROR_DEPTH = 4;
const MAX_ELAPSED_MS = 24 * 60 * 60 * 1000;

interface ErrorRecord {
  name?: unknown;
  code?: unknown;
  cause?: unknown;
  errors?: unknown;
}

function asErrorRecord(value: unknown): ErrorRecord | undefined {
  return value !== null && typeof value === 'object' ? value as ErrorRecord : undefined;
}

function classifyName(name: unknown): NetworkFailureType | undefined {
  if (name === 'AbortError') return 'aborted';
  if (name === 'TimeoutError') return 'timeout';
  return undefined;
}

/**
 * Extract bounded, allowlisted transport metadata without retaining the raw
 * exception, its message, socket addresses, or other provider-controlled data.
 */
export function describeNetworkFailure(
  error: unknown,
  requestUrl: string | URL,
  startedAtMs: number,
  nowMs = Date.now(),
): NetworkFailureDiagnostic {
  const queue: Array<{ value: unknown; depth: number }> = [{ value: error, depth: 0 }];
  const seen = new Set<object>();
  let visited = 0;
  let nameType: NetworkFailureType | undefined;

  while (queue.length > 0 && visited < MAX_VISITED_ERRORS) {
    const next = queue.shift()!;
    const record = asErrorRecord(next.value);
    if (!record || seen.has(record as object)) continue;
    seen.add(record as object);
    visited++;

    const code = typeof record.code === 'string' && CODE_TYPES.has(record.code)
      ? record.code
      : undefined;
    if (code) {
      return buildDiagnostic(CODE_TYPES.get(code)!, code, requestUrl, startedAtMs, nowMs);
    }
    nameType ??= classifyName(record.name);

    if (next.depth >= MAX_ERROR_DEPTH) continue;
    if (record.cause !== undefined) {
      queue.push({ value: record.cause, depth: next.depth + 1 });
    }
    if (Array.isArray(record.errors)) {
      for (const nested of record.errors.slice(0, MAX_VISITED_ERRORS - visited)) {
        queue.push({ value: nested, depth: next.depth + 1 });
      }
    }
  }

  return buildDiagnostic(nameType ?? 'network', undefined, requestUrl, startedAtMs, nowMs);
}

function buildDiagnostic(
  type: NetworkFailureType,
  code: string | undefined,
  requestUrl: string | URL,
  startedAtMs: number,
  nowMs: number,
): NetworkFailureDiagnostic {
  let hostname = '<unknown>';
  try {
    hostname = (requestUrl instanceof URL ? requestUrl : new URL(requestUrl)).hostname || '<unknown>';
  } catch {
    // Keep the fixed placeholder; never copy an invalid URL into diagnostics.
  }
  const rawElapsed = Number.isFinite(nowMs) && Number.isFinite(startedAtMs)
    ? nowMs - startedAtMs
    : 0;
  const elapsedMs = Math.min(MAX_ELAPSED_MS, Math.max(0, Math.round(rawElapsed)));
  return code ? { type, code, elapsedMs, hostname } : { type, elapsedMs, hostname };
}

/** Fixed cardinality counters: no URLs, credentials, media or session identifiers. */
export type SecurityBoundaryReason = 'overflow' | 'destination_rejection' | 'cancellation'
  | 'cleanup_timeout' | 'recorder_refusal' | 'worker_failure' | 'migration_failure';
const boundaryCounters: Record<SecurityBoundaryReason, number> = {
  overflow: 0, destination_rejection: 0, cancellation: 0, cleanup_timeout: 0,
  recorder_refusal: 0, worker_failure: 0, migration_failure: 0,
};
export function recordSecurityBoundaryEvent(reason: SecurityBoundaryReason): void {
  boundaryCounters[reason] = Math.min(Number.MAX_SAFE_INTEGER, boundaryCounters[reason] + 1);
}
export function getSecurityBoundaryCounters(): Readonly<Record<SecurityBoundaryReason, number>> {
  return { ...boundaryCounters };
}
