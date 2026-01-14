# Blink Debug Logging Specification

This spec defines how the Homebridge Blink plugin should log diagnostic information for authentication, HTTP, and streaming while protecting sensitive data.

## Logging Controls

- `debugAuth` (config): Enables verbose auth + HTTP diagnostics in `src/blink-api/auth.ts` and `src/blink-api/http.ts`.
- `ffmpegDebug` (config): Enables FFmpeg debug output for live streaming in `src/accessories/camera-source.ts`.
- `logger` (config): `BlinkLogger` interface used by auth + HTTP layers (defaults to no-op when absent).

## Required Log Levels

- **info**: High-level lifecycle events (login success, token refresh success, request start/end when `debugAuth` is enabled).
- **warn**: Non-fatal but actionable events (configuration warnings, degraded retries).
- **error**: Auth or HTTP failures (always log rich error details via `toLogString`).
- **debug**: Device-level events (motion detection toggles, accessory state changes) and FFmpeg debug output when enabled.

## HTTP Diagnostics (debugAuth only)

- Log method + URL for each request with a per-request correlation ID.
- Log request headers with redaction applied.
- Log request body (JSON) only when debug is enabled.
- Log response status + elapsed time (include correlation ID).
- Log response body only in debug mode and truncate to a safe length (current behavior uses 500 chars).

## Authentication Diagnostics (debugAuth only)

- Log OAuth grant type, URL, and redacted identifiers.
- Log token expiry timing and refresh attempts.
- On failure, emit `BlinkAuthenticationError.toLogString()` details (status, error code, server message, update/2FA hints).

## Redaction Rules (Required)

Always redact or partially mask sensitive values in logs:

- `Authorization` (Bearer tokens)
- `TOKEN-AUTH`
- `refresh_token` / `access_token`
- `password`
- `hardware_id`
- `2fa-code`
- user email / phone identifiers

Recommended redaction pattern: show first 3–4 chars and last 3–4 chars, otherwise `***`.

## Error Logging Requirements

- HTTP errors must log method + URL, status, headers, and response body when safe.
- Auth errors must include update/2FA guidance when present.
- Do not log raw tokens or passwords in error contexts.

## Streaming Diagnostics

- `ffmpegDebug` should toggle FFmpeg loglevel (`debug` vs `error`).
- Streaming logs must not include raw stream tokens or device serials unless redacted.

## EventStream Diagnostics (If Implemented)

- Log only queue size, batch sizes, and success/failure statuses.
- Do not log event payloads or identifiers without redaction.

## Implementation Pointers

- HTTP redaction: `src/blink-api/http.ts` (`redactHeaders`).
- Auth redaction: `src/blink-api/auth.ts` (`redact`, `formatHeadersForLog`).
- Error formatting: `BlinkHttpError.toLogString`, `BlinkAuthenticationError.toLogString`.
