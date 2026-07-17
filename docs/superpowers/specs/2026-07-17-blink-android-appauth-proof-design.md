# Blink Android AppAuth Proof Design

## Status

Approved on 2026-07-17 under the operator's standing authorization to continue
reversible OAuth experiments without a separate approval gate for each run.

## Objective

Determine whether Blink Android 57.1 succeeds because authorization, App-Link
receipt, PKCE state, and token exchange all remain inside Android AppAuth on one
device. Use the result to finish the Homebridge hosted flow without adopting a
tablet companion as a production dependency.

## Context

The APK and repository agree on the production authorize and token endpoints,
the registered HTTPS callback, Android public-client form, PKCE S256, prompt,
scope, and device metadata. An earlier EU/Ireland protocol proof exchanged and
refreshed usable tokens. Two packaged Homebridge callbacks later returned
`invalid_grant`. The matched-egress experiment validated its transport and
rollback but ended before the Pi made a token request, so egress binding remains
untested.

The remaining material differences are Android AppAuth state handling, Android
browser/App-Link ownership, Android `HttpURLConnection` transport, and the APK's
manufacturer-dependent client ID. The tablet is not currently visible over USB
or paired wireless ADB, but the harness can be built and verified before it
reconnects.

## Considered Approaches

### Minimal native AppAuth harness (selected)

Build a unique, git-ignored Java application that uses AppAuth 0.11.1 without a
custom connection builder. AppAuth creates state and PKCE, launches a Custom
Tab, receives Blink's exact HTTPS callback, derives the token request from the
`AuthorizationResponse`, and performs the exchange through Android's default
network stack.

This changes the fewest unknowns and matches the APK control flow most closely.
It requires temporary, reversible App-Link association because Blink's domain
is verified for Blink's signed packages, not the debug harness.

### Repeat Homebridge transport emulation

Repeat the existing Mac-egress relay with a more robust tab sequence, then vary
HTTP headers or transport if it still fails. This remains useful and can proceed
while the tablet is unavailable, but it cannot isolate Android AppAuth itself.

### Instrument or replace the official Blink APK

Hook the signed app, replace its package, or inspect live secrets. This would
create signing, account-state, and secret-handling risks while changing more
variables than the harness. It is rejected.

## Project Isolation

Harness source and build output live under:

```text
logs/blink-oauth-appauth-harness/
```

`logs/` is repository-ignored. The npm package must not include harness source,
APKs, build output, debug signing material, callback artifacts, or test results.
The application ID is `com.sealad886.blinkoauthprobe`; it must never reuse or
replace Blink's production or beta package name.

The harness uses the locally cached Android Gradle Plugin 8.11.0, Gradle 8.14.3,
Android SDK 36, Build Tools 36, and Android Studio's JDK. Android's compatibility
table requires Gradle 8.13+, Build Tools 35+, JDK 17+, and supports API 36, so
that toolchain remains inside the documented compatibility envelope.

## Components

### `BlinkOAuthProfile`

Pure Java value construction for:

- production authorization and token endpoints;
- exact HTTPS callback;
- client ID selected by exact manufacturer equality (`Amazon` or `android`);
- `client` scope, `login` prompt, null nonce;
- APK-derived device/app metadata;
- a stable random hardware UUID stored in private preferences.

It never accepts account credentials, callback values, codes, verifier values,
or tokens as persistent input.

### `ProbeOutcome`

Closed, secret-free outcome categories only:

```text
READY_PROFILE_ANDROID
READY_PROFILE_AMAZON
AUTH_CANCELLED
AUTH_PROTOCOL_ERROR
TOKEN_SUCCESS_ACCESS_AND_REFRESH
TOKEN_SUCCESS_ACCESS_ONLY
TOKEN_INVALID_GRANT
TOKEN_OTHER_OAUTH_ERROR
TOKEN_NETWORK_ERROR
TOKEN_PROTOCOL_ERROR
```

No upstream description, URI, intent, request, response, exception message,
identifier, or token is rendered or logged.

### `MainActivity`

A small programmatic UI displays the selected native profile, link-routing
preflight state, a start button, and the bounded result. It constructs an
`AuthorizationRequest`, launches AppAuth, extracts the response with AppAuth's
`fromIntent` methods, and calls `response.createTokenExchangeRequest()` followed
by `performTokenRequest()`.

The activity retains no `AuthState`. On success it checks only whether access
and refresh fields are present, displays a bounded category, and drops the
response reference. It does not call Blink REST APIs or persist tokens.

### AppAuth redirect receiver

The manifest replaces AppAuth's receiver filter with Blink's exact callback:

```text
https://applinks.blink.com/signin/callback
```

No custom callback scheme is used because that would no longer test Blink's
registered Android redirect contract.

## Data Flow

1. Harness loads or generates a private stable hardware UUID.
2. It derives `amazon` only when `Build.MANUFACTURER` equals `Amazon`; otherwise
   it selects `android`.
3. AppAuth creates state, verifier, challenge, and authorization request.
4. A Custom Tab opens Blink's production hosted sign-in.
5. Blink alone receives credentials and hosted MFA.
6. Android resolves the exact App Link to AppAuth's receiver.
7. AppAuth validates and reconstructs the authorization response.
8. AppAuth creates and performs the code exchange on the same device.
9. Harness reports one bounded category and retains no tokens.

## App-Link Preparation and Rollback

Android permits only one associated application per domain. Before changing
anything, capture bounded link state for Blink and the harness and verify the
current resolver without printing certificate fingerprints or device IDs.

When needed, temporarily disassociate Blink from the callback domain and select
the harness using supported Android app-link controls. Do not clear Blink data,
disable or uninstall Blink, change its package, or alter its credentials.

After every run, restore Blink's original link-handling state, verify the
callback resolver again, and uninstall only the harness after evidence is
recorded. If the device's documented commands cannot perform a reversible
selection, use the Android Open-by-default settings screen; do not use
undocumented force commands.

## Secret and Safety Boundaries

The harness and build must never print, log, display, copy, persist, or commit:

- authorization URL query values;
- callback URI or parameters;
- OAuth state or PKCE material;
- authorization code;
- access or refresh token;
- token response JSON;
- account, email, phone, device, network, or certificate identifiers;
- upstream OAuth descriptions or exception text.

Do not use broad `adb logcat` during login. Crash inspection may use only the
crash buffer after confirming it contains no serialized intents or URIs.

Credentials and hosted MFA may be entered only into Blink's hosted UI under the
operator's existing authorization. A CAPTCHA remains an action-time human
confirmation boundary.

## Test Strategy

Implementation follows red-green-refactor:

1. Unit tests first establish exact manufacturer selection, endpoint/callback
   constants, metadata keys, and bounded outcome classification.
2. The tests must fail because production classes are absent.
3. Add the smallest pure Java implementation that makes them pass.
4. Add manifest/source security checks that reject logging calls, AuthState
   persistence, secret-bearing display strings, wrong redirect filters, and a
   Blink package-name collision.
5. Run unit tests, Android lint, assemble the debug APK, inspect its manifest,
   and scan packaged strings before installation.
6. On device, verify package identity and callback resolution before login.

## Experiment Matrix

Run the native manufacturer-derived profile first. Each row uses a new AppAuth
transaction and a one-time code.

| Result | Interpretation | Next action |
|---|---|---|
| Native `android` succeeds | Android/AppAuth or same-device context explains the packaged difference | Compare sanitized transport/request shape and implement the narrow Homebridge equivalent |
| Native `amazon` succeeds | Native Fire OS path works, but Android client remains untested | Run one fresh forced-`android` comparison without changing other fields |
| Native profile returns `invalid_grant` | AppAuth alone does not solve rejection | Recheck link ownership, client profile, and authorization metadata before further live runs |
| Callback resolves outside harness | Routing setup failed; OAuth result is not evidence | Restore routing, correct association, and retry with a fresh transaction |
| Network/protocol error | Transport setup failed; OAuth result is not evidence | Fix offline with bounded diagnostics before retrying |

The existing matched-egress Homebridge experiment may be repeated while the
tablet is unavailable. Its result is complementary: it tests egress while the
harness tests Android AppAuth and same-device behavior.

## Homebridge Completion Rule

The probe is diagnostic, never a production dependency. Final completion still
requires the normal end-user surface:

- Homebridge UI starts Blink-hosted sign-in;
- Brave handles credentials and hosted MFA;
- Homebridge exchanges and stores usable tokens on the Pi;
- tier discovery, verification, homescreen, and device discovery succeed;
- an unproxied restart reconnects from durable state;
- no tablet, ADB, relay, harness, callback paste artifact, or manual token import
  is required for subsequent users.

Any finding from the harness must be translated into the smallest tested
Homebridge change, deployed to `raspberrypi.local`, and verified through that
full workflow before the parent issue can close.

## Primary References

- AppAuth Android 0.11.1 README:
  `https://github.com/openid/AppAuth-Android/blob/0.11.1/README.md`
- Android App Links verification and user association:
  `https://developer.android.com/training/app-links/verify-applinks`
- Android Gradle Plugin 8.11 compatibility:
  `https://developer.android.com/build/releases/agp-8-11-0-release-notes`
- Blink Android 57.1 JADX/apktool evidence under
  `logs/blink-apk/57.1-29715642/decompiled/`
