# Blink OAuth Egress-Matched Acceptance Design

## Status

Approved for one live EU/Ireland account acceptance run on 2026-07-17.

## Context

Blink Android 57.1 uses the same production OAuth authorize and token host for
EU, US, AP, and AU accounts. The account's regional REST tier is discovered
only after token issuance. The current Homebridge implementation also matches
the APK's authorization-code token form: grant type, redirect URI,
authorization code, PKCE verifier, and public client identifier.

Three fresh browser authorization attempts reached Blink's registered callback,
but the token endpoint rejected the Pi-side exchange as `invalid_grant`. The
latest secret-safe runtime check found a material architectural difference:
the Mac browser and Raspberry Pi token exchanger currently use different public
IPv4 egresses in different countries. Blink's token endpoint does not permit a
browser-side exchange through CORS.

This experiment tests whether Blink binds an authorization grant to the
authorization-side network context. It is an acceptance diagnostic, not a
production proxy feature.

## Considered Approaches

### Reverse-SSH HTTPS relay (selected)

Run an HTTP `CONNECT` proxy on Mac loopback and expose it only on Raspberry Pi
loopback through an authenticated reverse SSH tunnel. During one hosted login,
Node's built-in HTTPS proxy support routes Blink HTTPS requests from Homebridge
through the Mac. TLS remains end to end between Node and Blink; the relay sees
only the destination authority and byte counts.

This approach preserves the actual Homebridge custom UI, the existing Brave
profile and saved-password flow, the Pi-owned PKCE transaction, and the plugin's
real token persistence path. It changes only the exchange egress for the brief
acceptance window.

### Separate local Brave harness

A temporary Brave profile could use an SSH SOCKS path through the Pi and perform
an isolated OAuth flow. This avoids changing the Homebridge service but does not
validate the plugin's persistence and bootstrap path, and it cannot cleanly
reuse the already-open Brave profile.

### Android AppAuth harness

A small Android app could reproduce AppAuth, Android device identity, and
Android network transport most faithfully. The tablet is currently unavailable
to `adb`, and Blink's verified HTTPS App Link would require a temporary,
user-visible association change. This remains a fallback if the egress-matched
Homebridge experiment still returns `invalid_grant`.

## Architecture

The local relay is a throwaway Node program under the git-ignored `logs/`
directory. It binds only to `127.0.0.1`, accepts only HTTP `CONNECT`, limits
request-header size, permits only port 443, and allowlists Blink OAuth and Blink
REST host patterns. It does not implement plain HTTP forwarding, TLS
interception, request-body inspection, authentication logging, or persistent
storage.

An SSH client on the Mac creates a reverse port forward from Pi loopback to the
Mac relay. The forward must use `ExitOnForwardFailure`, keepalives, and a
non-conflicting high port. Neither the proxy nor the SSH listener is reachable
from other network hosts.

The Raspberry Pi's Homebridge service temporarily starts with Node's documented
environment-proxy support enabled and `HTTPS_PROXY` pointing at the Pi-loopback
forward. `NO_PROXY` retains loopback and local Homebridge traffic. The service
runs Node 24.18.0, which supports this mechanism for global `fetch()`.

The relay allowlist permits the production OAuth host and the dynamically
selected `rest-{tier}.immedia-semi.com` host. Other destinations fail closed.
This can temporarily interrupt unrelated outbound HTTPS requests made by the
same Homebridge Node process, so the acceptance window must be short and the
override must be removed immediately afterward.

## Data Flow

1. Start and locally test the loopback relay without OAuth data.
2. Start the reverse SSH forward and verify that a harmless Pi-side HTTPS probe
   exits through the same network path as the Mac without displaying either IP.
3. Install a temporary systemd drop-in for the Homebridge service and preserve a
   byte-for-byte rollback copy outside the repository.
4. Restart Homebridge and verify the UI and Blink custom route are available.
5. Start one fresh hosted login in the existing Brave session.
6. The Pi generates and stores state and PKCE data, while Brave completes Blink's
   hosted credential and MFA UI.
7. The callback is submitted once. Homebridge sends the token exchange through
   the TLS relay and processes the response normally.
8. Capture only the existing bounded UI outcome and support code.
9. Remove the service override, reload systemd, restart Homebridge, stop the SSH
   forward and relay, and verify normal Pi egress and service health.

## Secret and Safety Boundaries

The relay must never decrypt TLS or log request bytes, headers, URLs, callback
data, OAuth form bodies, response bodies, credentials, MFA values, codes, PKCE
material, tokens, account identifiers, email addresses, device identifiers, or
Homebridge configuration.

The test reports only fixed categories, process health, equality or inequality
of network egress, and the plugin's existing allowlisted support code. The
authorization callback is copied and pasted through Computer Use without being
read or emitted.

The official Blink app, tablet state, Brave profile, Keychain records,
Homebridge configuration, and persisted auth files are not cleared or replaced.
The existing 0.8.1 rollback package and current 0.9.0 diagnostic package remain
intact.

## Failure Handling and Rollback

The test stops before login if the local proxy test, SSH forward, egress-match
probe, Homebridge restart, or UI health check fails. No OAuth attempt is made
through a partially working relay.

The systemd override is temporary and separately identifiable. Rollback removes
only that override, reloads systemd, restarts Homebridge, and verifies that the
service is active and no relay processes or listeners remain. Rollback occurs
after success, after any OAuth failure, or after interruption.

If Homebridge fails to restart after rollback, restore the captured pre-test
service metadata and the already-preserved plugin package, then verify the
installed runtime files against the known package hash.

## Verification

Before live use, the relay parser receives unit coverage for accepted Blink
authorities and rejected methods, ports, hostnames, oversized headers, and
malformed requests. A harmless HTTPS request from a one-off Pi Node process must
prove the tunnel works and that Mac and tunneled-Pi egress match, without
printing either address. A direct control probe must continue to show that the
unproxied Pi egress differs.

Live success requires all of the following:

- Blink's hosted UI reaches the registered callback without a CAPTCHA failure.
- Callback validation succeeds on the Pi.
- The token exchange no longer returns `invalid_grant`.
- Homebridge persists a usable access and refresh token without emitting them.
- Account bootstrap returns either verified success or the existing bounded
  authenticated-but-unverified outcome.
- After rollback, Homebridge is active and a credential-free reconnect uses the
  persisted state from the normal Pi egress.

If the matched-egress exchange still returns `invalid_grant`, the experiment
rules out the network split. The next comparison is the Android AppAuth harness,
including actual manufacturer-dependent `android` versus `amazon` client
selection, device metadata, Android browser identity, and AppAuth transport.

## Documentation Outcome

The canonical authentication documentation will distinguish APK evidence from
live evidence. It will state whether egress matching is required by observed
Blink behavior, retain the shared production OAuth-host conclusion for EU and
non-EU accounts, and avoid claiming full hosted-flow support until token
exchange and credential-free reconnect both pass.
