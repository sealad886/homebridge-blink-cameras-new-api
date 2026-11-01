# Blink Debug Logging Specification

Last reviewed: 30 October 2026.

This spec defines HomeKit bridge audit records and diagnostic information for authentication, HTTP, and streaming while protecting sensitive data.

## Logging Controls

- `debugAuth` (config): Enables verbose auth + HTTP diagnostics in `src/blink-api/auth.ts` and `src/blink-api/http.ts`.
- `mediaDebug` (config): Enables bounded, redacted streaming detail in `src/accessories/camera-source.ts`.
- `logger` (internal API): `BlinkLogger` interface used by auth + HTTP layers (defaults to no-op when absent); this is not a JSON configuration field.
- HomeKit bridge audit records use **info** regardless of `debugAuth`, `mediaDebug`, or Homebridge debug mode. They have no separate configuration switch.

## Required Log Levels

- **info**: HomeKit bridge audit records, motion/ring events and high-level lifecycle events (login success, token refresh success, request start/end when `debugAuth` is enabled).
- **warn**: Non-fatal but actionable events (configuration warnings, degraded retries).
- **error**: Unexpected HTTP failures and camera/stream failures. HTTP diagnostics
  retain method, redacted URL, numeric status, and a bounded failure category.
- **debug**: Additional polling/transport diagnostics and bounded media detail when enabled. Debug output is supplementary to the always-on HomeKit audit.

## HomeKit Bridge Audit

Each audit entry starts with `[HomeKit audit] ` and contains one bounded JSON
object. `datetime` is an explicit ISO 8601 UTC timestamp ending in `Z`, independent
of the host's local timestamp prefix. `accessory` identifies the camera or other
Blink accessory by its friendly name. Known serials and identifiers are removed
from names; labels are length-bounded and control characters are sanitized.

For example, this synthetic entry records a motion observation processed by the
bridge:

```text
[HomeKit audit] {"datetime":"2026-10-30T12:34:56.789Z","accessory":"Front door","direction":"Blink -> bridge","event":"Motion detected","service":"Motion Sensor","characteristic":"MotionDetected","value":true,"outcome":"observed"}
```

The audit covers these boundaries:

- Every processed motion trigger emits `Motion detected`, including a repeated
  trigger while its motion sensor remains active. Expiry of the existing motion
  timer emits `Motion cleared`. Doorbell rings have their own `Doorbell ring`
  entry. These timestamps describe processing by the plugin, rather than the
  original physical movement or clip capture time.
- Characteristic reads and writes reaching the plugin/HAP characteristic layer
  record a request and its successful or failed result, including cached or
  unchanged reads, write responses and numeric HAP failures. HomeKit requests
  have a connection; local programmatic reads/writes have separate direction
  labels and are not reported as incoming controller requests.
- Characteristic changes and forced events record submission to HAP. Ordinary
  unchanged status-poll assignments that HAP would suppress do not create fake
  notification entries. Repeated motion observations still retain their explicit
  source-event entries. Logging does not change notification or timer behavior.
- Aggregate subscription activation/deactivation is recorded when HAP's
  subscriber count crosses zero. The hooks do not identify individual
  controllers or record every controller's subscription request.
- Camera snapshot, stream preparation and start/reconfigure/stop delegates
  record requests and callback outcomes. Snapshots distinguish fresh images,
  cache responses, unavailable cameras and failures. Media retirement and
  transport endings have fixed lifecycle entries. Safe dimensions, byte counts
  and audio flags may be included. Talkback remains disabled and is reported as
  `false` where applicable; logging does not enable it.

Directions identify processing boundaries: `HomeKit -> bridge`,
`bridge -> HomeKit`, `bridge -> HAP`, and `Blink -> bridge`. A callback response
or a state submitted to HAP is not an acknowledgment that a paired controller
received or displayed it. HAP still applies subscriber filtering, originator
exclusion and notification queue rules.

When an incoming characteristic request has an authenticated HAP connection, its
request and result include `controllerPairing` and `controllerConnection` aliases.
These use the forms `pairing-<opaque hex>` and `connection-<opaque hex>`. The
pairing alias is derived with a process-random keyed HMAC from HAP's authenticated
pairing username; the connection alias identifies only that in-memory connection.
The same pairing can reconnect with a new connection alias. Aliases are shared
across this runtime's accessory audit instances and change after a restart; no
identity mapping or key is persisted. Missing or unauthenticated pairing metadata
is reported as `unknown`. Request/results retain the origin captured at request
start. A characteristic change is attributed only when HAP supplies its actual
originator; motion, polling, timers, camera callbacks and subscription transitions
without an originator omit the fields.

These are pseudonymous correlation labels, not requester names or independent
identity proofs. A pairing may be shared by several devices through an Apple ID,
and the immediate peer may be a Home hub. HAP supplies no reliable friendly device
name, model, person or automation origin here. Verified pairing usernames are
used only in memory to derive aliases and are never logged or persisted. Session
identifiers, network endpoints and controller keys are not inspected.

Characteristic request observation is isolated in `src/homekit-audit.ts` because
installed Homebridge 1.11.1 / hap-nodejs 0.14.0 marks its request entry points
private. Real-HAP regression tests verify this dependency. A bounded warning
reports incomplete coverage when required hooks are unavailable. Instrumentation
is limited to plugin-owned instances and follows restored, new and dynamically
added services/characteristics; it does not patch global HAP prototypes.

Permission/admin/timed-write rejections before characteristic processing,
encrypted transport packets, individual-controller delivery receipts, media
payloads and raw error contents are outside this audit. Characteristic TLVs,
strings, objects and buffers are opaque and use `<redacted>` summaries; ordinary
finite numeric and boolean state remains visible. Camera requests/responses are
never serialized. Session identifiers, addresses, URLs, SRTP material and image
or audio/video bytes are omitted.

Audit records cannot reconstruct events the plugin never processed. In
particular, disabling `enableMotionPolling` still disables media-based motion
polling. Review both audit events and connection/polling diagnostics when
investigating a gap. Logging failures are observational and must not interrupt
HomeKit operations.

## HTTP Diagnostics (debugAuth only)

- Log method + URL for each request with a per-request correlation ID.
- Log request headers with redaction applied; debug output remains sensitive operational evidence.
- Format and log request bodies only when debug is enabled.
- Log response status + elapsed time (include correlation ID).
- Successful decoded response summaries are redacted and truncated to 500 characters in debug mode. This does not authorize raw provider-body collection or attaching debug logs without review. Error response bodies are discarded rather than included in exception diagnostics.

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

- HomeKit writer and characteristic observation: `src/homekit-audit.ts`.
- Camera delegate and explicit motion/ring events:
  `src/accessories/camera-source.ts`, `motion-base.ts`, and `doorbell.ts`.
- Canonical sensitive-key classification:
  `src/blink-api/redaction.ts` (`isSensitiveDiagnosticKey`).
- HTTP redaction: `src/blink-api/http.ts` (`redactHeaders`, `redactText`,
  `redactBody`).
- Auth redaction: `src/blink-api/auth.ts` (`redactFormBody`, `redactHeaders`,
  `redactUrlForLogging`).
- Error formatting: `BlinkHttpError.toLogString`, `BlinkAuthenticationError.toLogString`.

## HomeKit Secure Video state

Opted-in cameras log HSV state transitions as `off`, `warming`, `ready`,
`recording` or `fault`. Faults are warnings at the ordinary log level; other
transitions require debug logging. Reasons are fixed categories such as
`capture_failed`, `discontinuity`, `buffer_exhausted` or `startup_timeout`.
Footage, native diagnostic text, recording initialization data, fragments,
capability URLs and HomeKit stream identifiers are never included.

A `ready` state means the local buffer contains enough complete fragments.
It does not confirm that a Home hub requested, acknowledged or saved a clip in
iCloud. A discontinuity cancels the affected recording and rewarms the buffer;
it cannot restore missing upstream footage.
