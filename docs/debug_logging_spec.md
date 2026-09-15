# Blink Debug Logging Specification

This spec defines how the Homebridge Blink plugin should log diagnostic information for authentication, HTTP, and streaming while protecting sensitive data.

## Logging Controls

- `debugAuth` (config): Enables verbose auth + HTTP diagnostics in `src/blink-api/auth.ts` and `src/blink-api/http.ts`.
- `ffmpegDebug` (config): Enables FFmpeg debug output for live streaming in `src/accessories/camera-source.ts`.
- `logger` (config): `BlinkLogger` interface used by auth + HTTP layers (defaults to no-op when absent).

## Required Log Levels

- **info**: High-level lifecycle events (login success, token refresh success, request start/end when `debugAuth` is enabled).
- **warn**: Non-fatal but actionable events (configuration warnings, degraded retries).
- **error**: Unexpected HTTP failures and camera/stream failures. HTTP diagnostics
  retain method, redacted URL, numeric status, and a bounded failure category.
- **debug**: Device-level events (motion detection toggles, accessory state changes) and FFmpeg debug output when enabled.

## HTTP Diagnostics (debugAuth only)

- Log method + URL for each request with a per-request correlation ID.
- Log request headers with redaction applied.
- Format and log request bodies only when debug is enabled.
- Log response status + elapsed time (include correlation ID).
- Log response body only in debug mode and truncate to a safe length (current behavior uses 500 chars).

## Authentication Diagnostics (debugAuth only)

- Log OAuth grant type, URL, and redacted identifiers.
- Log token expiry timing and refresh attempts.
- On failure, emit bounded status, allowlisted error category, and update/2FA
  hints. Raw server messages and response bodies are not error diagnostics.
- Refresh transport/429/5xx failures are temporary; malformed responses and
  persistence failures have distinct safe categories. Only a rejected refresh
  grant or missing refresh credential requires hosted sign-in again.
- OAuth and REST requests have a 30-second request deadline. Token POSTs and
  REST requests reject redirects; legacy OAuth navigation handles redirects
  explicitly. Discarded REST and refresh-retry bodies are canceled.

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
- liveview tokens, server URLs, thumbnail URLs, and embedded IMMIS/RTSP capability
  paths and query parameters

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
- Network and body-decoding errors discard native error messages and causes,
  which may contain response snippets or request values.
- Command-update and command-completion 404s are expected and do not emit error
  banners. Other failures remain visible.
- Hosted UI warnings/errors go to both the UI event stream and process console.

## Streaming Diagnostics

- `ffmpegDebug` should toggle FFmpeg loglevel (`debug` vs `info`).
- Streaming logs must not include raw stream tokens, liveview URLs, SRTP keys, or device serials unless redacted.
- Debug stream recordings must avoid raw camera serials in filenames and use owner-only file permissions.
- Camera and proxy failures use Homebridge's error level even when debug is off.
  Routine traces and FFmpeg stderr remain debug output.
- Authenticated thumbnails are restricted to HTTPS regional Blink REST hosts,
  without userinfo or nonstandard ports; redirects are rejected. Their transport
  and body failures use safe messages.

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
