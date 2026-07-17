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

Always fully redact sensitive values in logs:

- `Authorization` (Bearer tokens)
- `TOKEN-AUTH`
- `refresh_token` / `access_token`
- `password`
- `hardware_id`
- `device_identifier`
- `2fa-code`
- username, email, and phone identifiers

Use the literal `<redacted>` marker. Stable identity values must not be partially
masked because even a prefix/suffix can correlate a Homebridge client or user
across diagnostic bundles.

## Error Logging Requirements

- HTTP errors retain only method, URL, and numeric status. Untrusted status
  text, response-header names/values, and response bodies are discarded rather
  than copied into exception diagnostics.
- Auth errors retain numeric status, allowlisted error categories, and boolean
  update/2FA guidance. They discard untrusted headers and response bodies.
- Do not log raw tokens, credentials, verification values, or stable identity
  fields in error contexts.

## Streaming Diagnostics

- `ffmpegDebug` should toggle FFmpeg loglevel (`debug` vs `info`).
- Streaming logs must not include raw stream tokens, liveview URLs, SRTP keys, or device serials unless redacted.
- Debug stream recordings must avoid raw camera serials in filenames and use owner-only file permissions.

## EventStream Diagnostics (If Implemented)

- Log only queue size, batch sizes, and success/failure statuses.
- Do not log event payloads or identifiers without redaction.

## Implementation Pointers

- Canonical sensitive-key classification:
  `src/blink-api/redaction.ts` (`isSensitiveDiagnosticKey`).
- HTTP redaction: `src/blink-api/http.ts` (`redactHeaders`, `redactText`,
  `redactBody`).
- Auth redaction: `src/blink-api/auth.ts` (`redactFormBody`, `redactHeaders`,
  `redactUrlForLogging`).
- Error formatting: `BlinkHttpError.toLogString`, `BlinkAuthenticationError.toLogString`.
