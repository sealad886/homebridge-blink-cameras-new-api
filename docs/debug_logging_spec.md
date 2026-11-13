# Blink Debug Logging Specification

Last reviewed: 13 November 2026.

This spec defines bounded operational diagnostics for authentication, HTTP, and streaming while protecting sensitive data.

## Logging Controls

- `debugAuth` (config): Enables bounded auth + HTTP diagnostics in `src/blink-api/auth.ts` and `src/blink-api/http.ts`.
- `mediaDebug` (config): Enables bounded, redacted streaming detail in `src/accessories/camera-source.ts`.
- `logger` (internal API): `BlinkLogger` interface used by auth + HTTP layers (defaults to no-op when absent); this is not a JSON configuration field.

## Required Log Levels

- **info**: High-level lifecycle events (login success, token refresh success, request start/end when `debugAuth` is enabled).
- **warn**: Non-fatal but actionable events (configuration warnings, degraded retries).
- **error**: Unexpected HTTP failures and camera/stream failures. HTTP diagnostics
  retain method, redacted URL, numeric status, and a bounded failure category.
- **debug**: Additional polling/transport diagnostics and bounded media detail when enabled. Debug output remains bounded and excludes state and payload dumps.

## Camera and HomeKit State

The plugin does not install characteristic read/write/change audit hooks or
emit blanket motion/ring characteristic audit records. Push motion and recording
handoffs have the operational receipts described below. Camera snapshots and stream
callbacks retain their ordinary bounded operational diagnostics; they do not
serialize camera, system, characteristic, or controller state.

## HTTP Diagnostics (debugAuth only)

- Log method + redacted URL for each request with a per-request correlation ID.
- Log response status + elapsed time and bounded retry outcomes (include correlation ID).
- Never log request headers, request bodies, or decoded provider-response payloads.
  Error response bodies are discarded rather than included in exception diagnostics.

## Authentication Diagnostics (debugAuth only)

- Log OAuth step, method, redacted URL, redirect policy, status, and elapsed time.
- Never log OAuth request headers or form bodies.
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

- HTTP errors retain method, redacted URL, numeric status, failure category,
  and the bounded network metadata described below. Untrusted status text,
  response-header names/values, and response bodies are discarded rather than
  copied into exception diagnostics.
- Auth errors retain numeric status, allowlisted error categories, and boolean
  update/2FA guidance. They discard untrusted headers and response bodies.
- Do not log raw tokens, credentials, verification values, or stable identity
  fields in error contexts.
- Network errors retain a bounded transport category, an allowlisted native
  error code when recognized, elapsed milliseconds, and the destination hostname.
  Classification inspects a bounded cause chain; raw native messages, causes,
  addresses, and request values are never copied into diagnostics. Unknown
  failures remain classified as network failures rather than guessed causes.
- Body-decoding errors discard native error messages and causes, which may
  contain response snippets or request values.
- Command-update and command-completion 404s are expected and do not emit error
  banners. Other failures remain visible.
- Hosted UI warnings/errors go to both the UI event stream and process console.

## Streaming Diagnostics

Operator settings, recording locations and codec behavior are owned by the
[streaming guide](streaming.md).

- `mediaDebug` controls bounded parent diagnostic emission. Private worker stderr
  is drained and discarded; raw native/library errors never cross the public error surface.
- Each media child/proxy has finite detail and error allowances, bounded line
  lengths and suppression reporting. Operational failure receipts remain visible.
  Input-format observation continues after the detail allowance is exhausted.
- Streaming logs must not include raw stream tokens, liveview URLs, SRTP keys, or device serials unless redacted.
- Debug stream recordings must avoid raw camera serials in filenames and use owner-only file permissions.
- Camera and proxy failures use Homebridge's error level even when debug is off.
  Routine parent traces remain debug output; worker stderr is never logged.
- Authenticated thumbnails are restricted to HTTPS regional Blink REST hosts,
  without userinfo or nonstandard ports; redirects are rejected. Their transport
  and body failures use safe messages.

## EventStream Diagnostics (If Implemented)

- Log only queue size, batch sizes, and success/failure statuses.
- Do not log event payloads or identifiers without redaction.

## Implementation Pointers

- Camera delegate diagnostics: `src/accessories/camera-source.ts`.
- Canonical sensitive-key and URL/text redaction: `src/blink-api/redaction.ts`.
- HTTP outcomes and errors: `src/blink-api/http.ts`.
- Auth outcomes and URL redaction: `src/blink-api/auth.ts` (`redactUrlForLogging`).
- Error formatting: `BlinkHttpError.toLogString`, `BlinkAuthenticationError.toLogString`.

## Push and HomeKit Secure Video lifecycle

Normal logs show push receipt and motion decoding, then either an explicit HSV
suppression reason or acquisition queue/attempt/outcome. Suppression reasons
include disabled HSV, inactive Home recording permission, non-local events,
missing storage module and stale events. No notification payload is logged.

Each real camera offers its saved Blink clip through its own HomeKit recording
delegate. Normal logs cover catalog requests, download, preparation, offer,
Home request, transfer completion and acknowledgement/close/cancel/expiry.
Camera names are sanitized and bounded; opaque process-local flow labels connect
handoffs without exposing provider event identifiers. Logging failures cannot
change acquisition, persistence or delivery ownership.

An offer means a prepared clip is available. Transfer completion means the
finite stream was emitted; transport acknowledgement means Home acknowledged
that stream. None proves iCloud retention. Blink clips remain saved footage,
with acquisition delay; there is no synthetic replay camera in the plugin.

Routine credential persistence and cache maintenance remain debug diagnostics.
Footage, frames, native diagnostic text, recording initialization data,
fragments, capability URLs and HomeKit stream identifiers are never logged.
