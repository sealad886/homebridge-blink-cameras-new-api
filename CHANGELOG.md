# Changelog

All notable changes to this project will be documented in this file.

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
