# ADR-001: Blink Hosted Authentication

## Status

Accepted for release `0.9.1` implementation. Native hosted-page launch and the
deployed Android refresh/restart path are live-proven; a fresh packaged
authorization-code exchange remains the bounded incomplete case recorded
below.

## Context

Blink's current Android application uses a hosted OAuth 2.0 authorization-code
flow with PKCE. Blink Android 57.1 (`versionCode` 29715642) is the protocol
authority for this integration. Blink's OAuth and REST interfaces are private
and undocumented, so they can change independently of this plugin.

The Homebridge instance is remote from the operator's browser. It must retain
the PKCE verifier and expected state, while the browser handles Blink-hosted
account-credential and MFA entry. Blink redirects to its registered Android App
Link, not to a callback controlled by this plugin.

## Decision

### Trust boundary and user journey

The Raspberry Pi owns the OAuth transaction. The Homebridge custom UI requests
a new transaction, opens Blink's hosted page in a no-opener Brave tab, and keeps
the settings tab open. Blink alone receives the account credentials and hosted
MFA code.

After Blink redirects to
`https://applinks.blink.com/signin/callback`, the operator copies the complete
address and returns it with **Paste Blink Result and Finish**. A manual paste
field is the fallback when clipboard permission is unavailable. No callback,
credential, MFA value, PKCE verifier, OAuth state, or token is written to
Homebridge configuration, browser storage, analytics, events, or logs.

The UI attempts to clear the clipboard after completion, but clipboard cleanup
is best effort. If the browser denies clipboard write access, the callback can
remain there and the operator must clear it manually.

There is no public callback relay, inbound port, companion app, or browser
extension. The callback travels only from Blink to Brave, then from the
operator's clipboard to the authenticated Homebridge Config UI request channel.

### Hosted Android profile and manufacturer gate

New sign-ins use `oauthClientId=android`, scope `client`, prompt `login`, and the
HTTPS App-Link redirect. The authorization URL includes the APK-derived
`hardware_id`, `app_brand`, app version, device brand/model, Android version,
dark-mode flag, PKCE S256 challenge, and opaque state. The stable hardware ID
comes from the plugin `deviceId`, defaulting to `homebridge-blink`.

The Pi generates a verifier from 64 random bytes plus independent 32-byte state
and flow identifiers. A transaction lasts exactly 15 minutes.

The APK does not choose its OAuth client by account geography. Its manufacturer
gate is `Build.MANUFACTURER == "Amazon"`: Amazon hardware uses
`client_id=amazon`, while all other Android hardware uses `client_id=android`.
Homebridge runs on a Raspberry Pi and deliberately models the ordinary
non-Amazon Android public client, so its hosted transaction uses `android` for
EU, US, AP, and AU accounts alike. Native Fire OS/`amazon` hosted sessions are
not claimed as a supported Homebridge flow.

### Callback validation and one-time use

The completion route accepts at most 2,048 UTF-8 bytes and requires all of the
following:

- HTTPS, exact host `applinks.blink.com`, and exact path `/signin/callback`;
- no user information, custom port, fragment, raw control, space, or fragment
  character;
- exactly one state parameter;
- exactly one non-empty code or one OAuth error, never both;
- no duplicate code, state, error, or error-description parameter;
- a canonical flow ID, unexpired transaction, matching stable hardware ID, and
  constant-time state equality.

A structurally malformed or partial paste keeps the pending transaction so the
operator can retry. Flow mismatch, state mismatch, expiry, OAuth error, a valid
callback, logout, unlock, or replacement by a new flow consumes it. Consumption
happens before token exchange, preventing replay even if exchange fails; an
exchange failure therefore requires a new hosted sign-in.

### Owner-only state lifecycle

One active transaction is atomically stored beside final state as
`.blink-auth-pending.json`, mode `0600`. A valid pending transaction can survive
a custom-UI process or full Homebridge restart only within its 15-minute TTL.
Malformed, expired, symlinked, non-regular, path-swapped, wrong-owner, or
group/world-accessible state is rejected or removed as appropriate.

The final `.blink-auth.json` is also atomically replaced with mode `0600` before
the completion route reports success. It contains token expiry and refresh
material plus account ID, client ID, region, tier, email metadata, hardware ID,
`oauthClientId`, and update time. Access and refresh tokens never return to
browser JavaScript. Logout and unlock clear current, legacy, and pending auth
files locally; neither route revokes tokens at Blink. Hosted completion also
writes token-only plugin configuration with `persistAuth=true` and
`authLocked=true`. An ephemeral `persistAuth=false` hosted-UI session is not a
supported completion mode.

### Exact token contracts

The hosted code exchange posts form-encoded data to
`https://api.oauth.blink.com/oauth/token` with exactly these five fields:

```text
grant_type=authorization_code
redirect_uri=https://applinks.blink.com/signin/callback
code=<one-time code>
code_verifier=<Pi-owned verifier>
client_id=android
```

It sends no scope, client secret, cookie, app metadata, hardware ID, Blink REST
header, or browser user agent. AppAuth's `TokenRequest` constructs the four
grant-specific fields, and `NoClientAuthentication` supplies `client_id` as a
form field rather than client-secret authentication.

Hosted refresh uses the APK's separate Retrofit contract:

```text
refresh_token=<refresh token>
grant_type=refresh_token
client_id=android
scope=client
```

Hosted REST calls use the bearer token; this flow neither issues nor requires a
`TOKEN-AUTH` value.

All production regions use the same production OAuth host. Both the authorize
and token requests above resolve through `api.oauth.blink.com`; the APK's
`qa.` and `dev.` substitutions are deployment-environment choices, not EU/US/AP/AU
region choices.

### Tier-first account discovery

OAuth authorization is region-independent for production accounts. EU, US, AP,
and AU accounts all start at `https://api.oauth.blink.com/oauth/v2/authorize`
and exchange at `https://api.oauth.blink.com/oauth/token`. The OAuth response
does not supply the Blink account region or tier. Android already has a
four-character default before `tier_info`: `TierRepository.getTier()` uses the
account `TIER`, then persistent-client `DEFAULT_TIER`, then APK default `prod`.
The app calls `v1/users/tier_info` through that current default and immediately
persists both the returned account identifier and authoritative tier before
loading `v2/users/info`.

A Homebridge server does not participate in Android's native registration
region selection. Hosted completion therefore tries only the APK's ordinary
production account-region defaults in deterministic order: `prod`, `prde`,
`prsg`, then `a001`. It advances only when a gateway rejects `tier_info` with
HTTP 406. Authentication, rate-limit, transport, and server failures stop the
search. The APK's `cemp` regression target and `srf1` refurbishment target are
never probed for an ordinary account. The first successful response supplies
the authoritative four-alphanumeric tier used for account information and all
later REST calls.

An explicitly configured safe tier outside the ordinary production set remains
a single-target bootstrap. This preserves APK QA/special targets (`sqa1`,
`cemp`, `srf1`) and safe numbered/custom tiers without blindly inserting them
into the normal account-region search.

Shared REST defaults to the same discovered tier; `sharedTier` is only an
advanced manual override and is not a separate field returned by `tier_info`.
The client then handles any post-token client/account verification requirement
and requests the account homescreen as the connection proof. Failures after
token issuance keep durable authentication and report an
authenticated-but-unverified status for recovery. The user journey does not
change by region; only post-token REST routing changes.

### Post-token verification

Blink-hosted MFA is complete before the App-Link callback. A later Blink REST
response may still require client or account/phone verification. Only those two
post-token code types use Homebridge's `/verify` route. Codes are not persisted
in plugin configuration. A client-verification success can be followed by an
account-verification requirement without discarding the token session.

### Legacy migration

New hosted state persists the Android profile. Older state without
`oauthClientId` defaults to the legacy iOS refresh form so an existing token is
not relabeled. Explicit `ios` state remains on that legacy contract:
`client_id=ios`, no refresh `scope`, and legacy headers when applicable.

In the authorized EU/Ireland test, Blink also accepted a valid legacy refresh
token submitted with the exact Android form, rotated it, and allowed the
resulting Android-profile state to refresh again. This is live evidence for a
cross-client migration path on that account, not a documented Blink guarantee.
The runtime therefore does not automatically relabel or cross-grade legacy
state for every user.

The repository's persisted-state type also accepts `amazon`, but the hosted UI
never creates that value and the current resolver treats every non-`android`
identity as legacy iOS compatibility state. This is not APK-equivalent Fire OS
support and must not be presented as such. The runtime also retains a hidden,
deprecated manual fallback: paired `username` and `password` configuration can
perform a legacy iOS-profile credential sign-in when compatible state is absent
or unusable. It is not exposed by, or part of, the supported hosted UI; unlike
hosted sign-in, that fallback necessarily gives the credentials to Homebridge.

## Evidence boundary

An earlier protocol proof on 2026-07-16 used the owner's authorized EU/Ireland
account. It observed hosted sign-in and MFA in Brave, the exact App-Link,
successful token exchange and refresh, `prde` discovery, user information, and
homescreen access without recording secret values. A later secret-blind native
AppAuth harness reproduced Blink Android 57.1's exact authorization request on
Android and reached the hosted sign-in page. Together these establish that
Blink's own hosted UI is a real native surface; neither is acceptance of a
fresh packaged `0.9.1` Homebridge code exchange.

Two subsequent fresh packaged-flow callbacks were submitted once and promptly;
both reached the production token endpoint and returned
`BHO-HTTP-INVALID-GRANT`. A fixed invalid-code probe sent the exact Android
five-field form and also received `invalid_grant`. This is consistent with
request parsing, but it does not independently validate the client or form;
those failures therefore do not by themselves prove a wrong host or an
extra/missing field.

For the current deployed proof, a still-valid legacy EU refresh session was
exchanged with the exact Android refresh form. The resulting Android-profile
state rotated through the installed plugin, reached user information and
homescreen/device discovery, and survived two clean Homebridge restarts with
no credential fields in configuration. A live Android-token gateway probe
returned HTTP 406 from `prod` and `a001`, and HTTP 200 plus the same valid
service-authoritative tier from `prde` and `prsg`; hosted completion stops at
the first success (`prde` for this account).

Fresh packaged end-to-end acceptance still requires an authorized EU/Ireland
flow that reaches the authorization-code exchange. The later refresh,
persistence, restart, homescreen, and device-discovery legs are now proven.
Non-EU accounts are not live-validated; their production defaults remain
APK-evidenced and mocked/parameterized.

## Consequences

### Positive

- During the supported hosted-UI flow, Homebridge never receives or stores the
  Blink account credentials or hosted MFA code.
- PKCE/state and durable tokens stay on the remote Pi with owner-only storage.
- Restart and refresh work without credential fields in plugin configuration.
- The same user flow supports APK-known production defaults and
  service-returned account tiers without asking the operator to choose a
  region.

### Trade-offs and risks

- Desktop Brave cannot claim Blink's Android App Link, so the operator must copy
  the final address back to Homebridge.
- APK AppAuth performs browser authorization and native token exchange on one
  Android device. Homebridge splits those legs between Brave and the Pi; two
  fresh packaged exchanges have returned `invalid_grant`, so that split remains
  the unresolved compatibility boundary.
- EU/AP/AU accounts may require up to four read-only `tier_info` attempts during
  first hosted completion. Fallback is limited to HTTP 406 and stops as soon as
  Blink returns the authoritative account tier.
- Clipboard read permission can fail, requiring the manual paste fallback;
  clipboard write permission can also prevent best-effort cleanup and require
  the operator to clear the callback manually.
- Blink's private OAuth, verification, tier, and REST behavior can change
  without a compatibility notice.
- Non-EU behavior has static/APK and mocked coverage only until account owners
  validate those tiers.

## References

- Blink Android 57.1: `UnifiedSignInUtils.signInIntent`,
  `AppLinkUrls.SIGN_IN_CALLBACK`, AppAuth `TokenRequest` and
  `NoClientAuthentication`, `OauthApi.postRefreshTokens`, `BaseUrls`,
  `ProductionTier`, and `TierRepository`.
- `docs/blink_api_dossier.md`
- `docs/superpowers/specs/2026-07-16-blink-hosted-oauth-design.md`
