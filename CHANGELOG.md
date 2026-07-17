# Changelog

All notable changes to this project will be documented in this file.

## [0.9.1] - 2026-07-17

### Fixed

- Made hosted post-token discovery advance through the APK's ordinary
  production account-region defaults (`prod`, `prde`, `prsg`, `a001`) only
  when `tier_info` rejects a gateway with HTTP 406. The first successful
  response supplies the service-authoritative account tier used thereafter.
- Excluded the APK's regression (`cemp`) and refurbishment (`srf1`) targets from
  ordinary account bootstrap attempts, and kept authentication, rate-limit,
  transport, and server failures from triggering region fallback.
- Preserved explicitly configured QA, regression, refurbishment, and safe
  numbered/custom tiers as single-target bootstraps instead of silently
  resetting them to the ordinary production search.
- Fully redacted stable authentication identifiers (`hardware_id`,
  `device_identifier`, username/email, and phone fields) from OAuth and HTTP
  debug diagnostics, including request/error URL query parameters. Legacy 2FA
  errors no longer retain contact hints or pass raw error objects to the
  platform logger.

### Changed

- Corrected the authentication documentation: OAuth token responses do not
  provide a Blink account region/tier, while the native app already has a
  persistent default tier before it calls `tier_info`.
- Added APK-grounded and parameterized US/EU/AP/AU bootstrap coverage while
  retaining service-returned four-character tier validation.
- Replaced the stale root API map and removed the obsolete migration audit so
  the maintained documentation consistently describes hosted AppAuth,
  conditional `TOKEN-AUTH`, immediate tier persistence, and the bounded live
  evidence.

### Validation status

- A secret-blind native AppAuth harness reproduced Blink Android 57.1's exact
  request and reached Blink's hosted sign-in page on Android. This proves the
  native hosted surface and request construction, not a fresh packaged
  Homebridge code exchange.
- With the authorized EU/Ireland account, a valid legacy refresh session was
  accepted by Blink's exact Android cross-client refresh form. The resulting
  Android-profile state rotated again through the installed plugin, reached
  user information and homescreen/device discovery, and survived two clean
  Homebridge restarts without credentials in configuration.
- A live Android-token `tier_info` probe returned HTTP 406 from `prod` and
  `a001`, and HTTP 200 with a valid authoritative tier from `prde` and `prsg`.
  Fresh packaged hosted code-exchange acceptance remains open. Non-EU accounts
  are not live-validated; their account-region behavior remains APK-evidenced
  and mocked/parameterized.

## [0.9.0] - 2026-07-16

### Added

- Added Blink-hosted OAuth authorization-code sign-in with Pi-owned PKCE/state,
  the registered Blink App-Link, clipboard-assisted completion, and a manual
  paste fallback for browsers that deny clipboard access.
- Added owner-only, 15-minute pending-transaction persistence that can recover
  across process restarts, is consumed before exchange, and records durable
  OAuth profile metadata only after success.

### Changed

- Made new hosted sessions use Blink's Android OAuth profile, including the
  exact Android refresh form (`client_id=android`, `scope=client`).
- Made hosted completion save token-only configuration with
  `persistAuth=true` and `authLocked=true`; ephemeral hosted-UI sessions are not
  supported.
- Made post-token `tier_info` discovery authoritative for regional and shared
  REST routing, with APK-derived and parameterized coverage for non-EU targets.
- Documented that EU, US, AP, and AU use the same production OAuth host and that
  the APK's `Build.MANUFACTURER == "Amazon"` manufacturer gate selects
  `client_id=amazon` instead of the normal `client_id=android`; this gate is not
  account-region routing, and Homebridge uses the non-Amazon Android branch.
- Revalidated the authentication workflow, dynamically constructed targets,
  trust boundary, recovery behavior, and operator instructions against Blink
  Android 57.1 and the implemented custom UI.

### Removed

- Removed direct Blink credential and hosted-MFA collection from the supported
  Homebridge UI flow; those values are entered only on Blink's hosted page.

### Validation status

- An earlier authorized EU/Ireland-account proof established hosted code
  exchange, refresh, `prde` routing, and homescreen access. Two later packaged
  flows reached token exchange but returned `BHO-HTTP-INVALID-GRANT`.
- Packaged end-to-end acceptance remains open. Non-EU accounts are not
  live-validated; those targets have APK/static and mocked coverage only.

## [0.8.1] - 2026-07-16

### Fixed

- Made the custom authentication UI transition reliably to Blink's emailed or
  device verification-code step when the requirement is returned by the login
  or verification request.

## [0.8.0] - 2026-07-16

### Added

- Added secure-by-default IMMIS TLS certificate verification with an explicit
  `verifyImmisTls` compatibility opt-out for confirmed self-signed endpoints.
- Added stream-concurrency enforcement before requesting a Blink live-view
  session.

### Changed

- Hardened persisted authentication state and debug stream recordings against
  symlink, path-swap, and unsafe-permission attacks.
- Isolated debug captures under an owner-only `blink-stream-recordings`
  directory and made capture names collision-resistant without exposing camera
  serial numbers.
- Updated audited development dependencies to patched transitive versions.

### Fixed

- Redacted Blink live-view URLs, SRTP parameters, and talkback SDP keys from
  bounded FFmpeg debug diagnostics, including values split across stderr
  chunks.
- Prevented stopping sessions from incorrectly consuming the configured stream
  concurrency limit.
- Preserved active authentication verification status and removed absolute
  auth-state paths from UI-facing status messages.

## [0.7.0] - 2026-04-02

### Added

- Cross-platform `videoEncoder` selection with automatic hardware acceleration on supported hosts and safe fallback to `libx264`. At startup the plugin probes available hardware encoders (VideoToolbox on macOS, V4L2 on Raspberry Pi / ARM Linux, NVENC, VAAPI, QSV) via a dry-run FFmpeg test and selects the first working one.

### Changed

- Tuned HomeKit live streaming for smoother playback by preferring 30 fps profiles and lower-latency FFmpeg input flags.
- Removed `peerDependencies` for `homebridge`; the `engines.homebridge` field declares the required version and `devDependencies` provides it for local development. This resolves the Homebridge plugin verification check that was failing because npm 7+ auto-installs peer dependencies.

### Fixed

- Raspberry Pi hardware streaming now avoids passing incompatible `-profile:v high` / `-level:v 4.0` options to `h264_v4l2m2m`, which was causing FFmpeg to abort before hardware encoding could start.
- The IMMIS proxy now stays alive briefly when FFmpeg falls back from hardware encoding to `libx264`, preventing the immediate `tcp://127.0.0.1` reconnect failure seen in HomeKit stream startup logs.
- The custom UI no longer writes the plaintext Blink password back into the saved Homebridge platform config.
- Persisted auth tokens are now written with owner-only file permissions, and logout/unlock clears saved auth state cleanly.
- Authentication and HTTP error logging now redact tokens, cookies, PINs, and verification codes more consistently.

## [0.7.0-alpha.3] - 2026-04-02

### Fixed

- Removed `peerDependencies` for `homebridge` to pass the Homebridge plugin verification check. The `engines.homebridge` field already declares the required version; the old `peerDependencies` entry caused npm 7+ to auto-install `homebridge` and `hap-nodejs` into `node_modules`, failing the verification bot's filesystem check.

## [0.7.0-alpha.2] - 2026-04-02

### Fixed

- Verified runtime FFmpeg hardware encoder detection and fallback behavior across test suites.

## [0.7.0-alpha.1] - 2026-04-01

### Fixed

- Raspberry Pi hardware streaming now avoids passing incompatible `-profile:v high` / `-level:v 4.0` options to `h264_v4l2m2m`, which was causing FFmpeg to abort before hardware encoding could start.
- The IMMIS proxy now stays alive briefly when FFmpeg falls back from hardware encoding to `libx264`, preventing the immediate `tcp://127.0.0.1` reconnect failure seen in HomeKit stream startup logs.

## [0.7.0-alpha.0] - 2026-04-01

### Added

- Cross-platform `videoEncoder` selection with automatic hardware acceleration on supported hosts and safe fallback to `libx264`.

### Changed

- Tuned HomeKit live streaming for smoother playback by preferring 30 fps profiles and lower-latency FFmpeg input flags.
- Prepared the package and CI workflow for the next Homebridge verification pass and prerelease publishing flow.

### Fixed

- The custom UI no longer writes the plaintext Blink password back into the saved Homebridge platform config.
- Persisted auth tokens are now written with owner-only file permissions, and logout/unlock clears saved auth state cleanly.
- Authentication and HTTP error logging now redact tokens, cookies, PINs, and verification codes more consistently.

## [0.6.0] - 2026-03-04

### Changed

- Promoted the `0.6.0-alpha` prerelease line to stable `0.6.0` for general
  availability.

## [0.6.0-alpha.3] - 2026-03-04

### Removed

- Removed legacy `TODO.md`; deferred and future work continues to be tracked in
  project docs/issues.

## [0.6.0-alpha.1] - 2026-02-27

### Changed

- **Auth storage location**: Migrated from `blink-auth/auth-state.json` subdirectory to
  a single `.blink-auth.json` dot-file in the Homebridge storage root. This follows
  Homebridge ecosystem conventions (e.g. homebridge-ring's `.ring.json`) and eliminates
  the need for `mkdir` calls.
- On first load, existing tokens are automatically migrated from the legacy
  `blink-auth/` directory to the new dot-file location. The legacy directory is
  removed after successful migration.

### Added

- `preuninstall` lifecycle hook that cleans up the `.blink-auth.json` dot-file and
  legacy `blink-auth/` directory when the plugin is uninstalled.
- Unit tests for `FileAuthStorage` persistence: save, load, migration, clear, and
  error handling.

## [0.5.9] - 2026-02-27

### Fixed

- Plugin settings page no longer forces a re-login after Homebridge restarts.
  The UI server's `/status` endpoint now rehydrates from the persisted
  `auth-state.json` file when it has no in-memory session, so the Custom UI
  shows "Authenticated" and skips the login form when valid tokens exist on disk.

## [0.5.8] - 2026-02-27

### Fixed

- Auth tokens no longer fail to persist after UI login. The custom UI server was computing
  a storage path one directory level too high (e.g. `/var/lib/blink-auth`) instead of
  inside Homebridge's own storage directory (e.g. `/var/lib/homebridge/blink-auth`),
  causing an EACCES permission error on every `save()` call. The path now matches the
  one used by the platform at runtime so tokens written by the UI are found on restart.
  Fixes the "No credentials available" / 401 restart loop reported in issue #1.

## [0.5.1] - 2026-02-14

### Fixed

- Remove duplicate authentication settings UI by keeping auth inputs only in custom UI and removing credential/code fields from `config.schema.json`.
- Align token persistence to a single auth state file so custom UI login persists across restarts without requiring credentials in `config.json`.
- Harden custom UI auth logging/validation to reduce risk of secret leakage.

### Added

- Regression test to prevent reintroducing schema credential fields while custom UI auth is enabled.
