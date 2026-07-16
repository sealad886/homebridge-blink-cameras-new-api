# Blink Hosted Authentication Integration Checklist

Use this checklist to validate the `0.9.0` hosted-authentication release against
the implementation, Blink Android 57.1 evidence, and the authorized Ireland
account. The earlier protocol proof is not acceptance of this packaged build;
the live sections remain unchecked until Task 8.

## Automated release gates

- [ ] Focused authentication documentation regression passes.
- [ ] Full Jest suite passes serially.
- [ ] ESLint and TypeScript/custom-UI build pass.
- [ ] `npm audit --omit=dev` reports no known production vulnerability.
- [ ] Package dry-run contains `dist/` and `config.schema.json`, and contains no
  APK, decompilation output, local auth file, callback/token artifact, log, or
  editor directory.
- [ ] Secret scan contains only protocol field names and synthetic fixtures;
  every match is classified and no live value appears.
- [ ] Package, lockfile, and changelog consistently report `0.9.0`.

## Android 57.1 protocol contract

- [ ] `/auth/start` creates a 15-minute Pi-owned transaction with a 64-byte
  verifier, S256 challenge, independent 32-byte state and flow ID, stable
  hardware ID, `client_id=android`, scope `client`, and prompt `login`.
- [ ] Authorize metadata matches `UnifiedSignInUtils.signInIntent`; redirect is
  exactly `https://applinks.blink.com/signin/callback`.
- [ ] `/auth/complete` enforces the 2,048-byte limit, exact HTTPS origin/path,
  duplicate-parameter rules, flow/TTL checks, and constant-time state match.
- [ ] Structurally malformed/partial input retains pending state; security
  mismatch, expiry, OAuth error, valid callback, replacement, logout, and unlock
  consume it before any exchange retry is possible.
- [ ] Code exchange posts exactly `grant_type`, `redirect_uri`, `code`,
  `code_verifier`, and `client_id`; it sends no scope, secret, cookie, app/device
  metadata, Blink REST header, or browser user agent.
- [ ] Hosted refresh posts exactly `refresh_token`, `grant_type=refresh_token`,
  `client_id=android`, and `scope=client`.
- [ ] Hosted REST requests use bearer authentication without requiring
  `TOKEN-AUTH`.

## Remote Homebridge and Brave flow

- [ ] Open the remote Homebridge Config UI in Brave and enter this plugin's
  settings; do not use a local Homebridge process as the acceptance target.
- [ ] **Sign in securely with Blink** opens a no-opener Blink-hosted tab, or the
  safe **Open Blink Sign-In** fallback link if popup creation is blocked.
- [ ] Account credentials and hosted MFA are entered only on Blink's page.
- [ ] Copy the full final App-Link from Brave's address bar and choose **Paste
  Blink Result and Finish**.
- [ ] When clipboard read is unavailable, paste the same full address and choose
  **Finish with Pasted Address**.
- [ ] Callback-bearing JavaScript values and the manual field clear when the
  completion request starts; no callback, code, state, or token enters config,
  logs, UI events, toasts, or browser storage.
- [ ] Success saves only token-oriented config (`deviceId`, discovered `tier`,
  forced `persistAuth=true`, `authLocked=true`) and removes legacy
  credential/code fields; an ephemeral hosted-UI session is not supported.

## Owner-only persistence and recovery

- [ ] `.blink-auth-pending.json` is an atomic regular file owned by the
  Homebridge service user with mode `0600` and survives a custom-UI process or
  full Homebridge restart only within the 15-minute TTL.
- [ ] A valid callback consumes the pending file before token exchange; an
  exchange failure requires a new hosted sign-in. Success durably writes
  `.blink-auth.json` with mode `0600` before reporting completion.
- [ ] Final state records `oauthClientId=android`, expiry, hardware ID, and
  discovered account/client/region/tier metadata without exposing token values.
- [ ] **Unlock & Re-authenticate** clears current, legacy, and pending state;
  the server `/logout` route has the same local cleanup contract, and neither
  action claims Blink-side token revocation.
- [ ] A connection or verification failure after token issuance retains durable
  authentication and exposes bounded retry/client/account guidance.

## EU/Ireland live acceptance for Task 8

- [ ] Install the unique local `0.9.0` acceptance package on
  `raspberrypi.local`; verify service, child bridge, plugin UI, and installed
  package identity before sign-in.
- [ ] Complete Blink-hosted sign-in with only the owner's authorized Ireland
  account and confirm the service returns tier `prde`.
- [ ] Confirm post-token user info, client/account verification when requested,
  homescreen, and camera/device discovery without printing identifiers or
  secrets.
- [ ] Restart Homebridge and confirm the same account/device inventory loads
  without credentials in config.
- [ ] Exercise an Android refresh and confirm the exact Android form plus
  successful homescreen/device access after refresh.

## Restart and legacy refresh compatibility

- [ ] Hosted state restarts with `oauthClientId=android` and Android scope.
- [ ] Profile-less state defaults to the legacy iOS refresh form rather than
  being relabeled Android.
- [ ] Explicit `ios` and resolver-compatible `amazon` identities remain on the
  legacy iOS contract (`client_id=ios`, no refresh scope, legacy headers when
  applicable).
- [ ] A failed hosted refresh requests fresh hosted sign-in and does not fall
  back to credential submission.

## Rollback safety

- [ ] Before deployment, back up existing Pi auth state without reading or
  printing it; preserve owner and mode metadata.
- [ ] Record the currently installed plugin version and package identity.
- [ ] If acceptance fails, reinstall `0.8.1`, restore the untouched auth backup,
  restart Homebridge, and confirm the prior device inventory returns.
- [ ] If acceptance succeeds, retain the new hosted token state and remove only
  disposable package/backup artifacts according to the approved Task 8 plan.

## Best-effort non-EU coverage

- [ ] Parameterized URL tests cover APK production tiers `prod`, `prde`,
  `prsg`, `a001`, `cemp`, and `srf1`.
- [ ] Tests accept safe service-returned four-alphanumeric tiers, including
  numbered e-tier examples, and reject unsafe tier text.
- [ ] Each tier authorizes through the same production hosted flow; only the
  post-token `rest-{tier}` and `rest-{shared_tier}` hosts change.
- [ ] Documentation labels every target other than the observed Ireland `prde`
  account as APK-evidenced and mocked/parameterized, not live-account tested.

## Residual risk

- [ ] Release notes state that Blink OAuth, verification, tier, and REST APIs
  are private/undocumented and may change independently of this plugin.

## Evidence references

- `docs/blink_api_dossier.md`: Android 57.1 source trace and target matrix.
- `docs/adr/001-authentication.md`: canonical trust boundary, protocol, and
  persistence decision.
- `__tests__/blink-api/hosted-oauth.test.ts`,
  `__tests__/blink-api/auth-hosted.test.ts`, `__tests__/blink-api/client.test.ts`,
  `__tests__/blink-api/urls.test.ts`, `__tests__/homebridge-ui/hosted-auth-service.test.ts`,
  `__tests__/platform.test.ts`, and `__tests__/schema-auth-ui.test.ts`.
