# Changelog

All notable changes to this project will be documented in this file.

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
