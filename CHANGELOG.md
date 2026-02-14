# Changelog

All notable changes to this project will be documented in this file.

## [0.5.1] - 2026-02-14

### Fixed

- Remove duplicate authentication settings UI by keeping auth inputs only in custom UI and removing credential/code fields from `config.schema.json`.
- Align token persistence to a single auth state file so custom UI login persists across restarts without requiring credentials in `config.json`.
- Harden custom UI auth logging/validation to reduce risk of secret leakage.

### Added

- Regression test to prevent reintroducing schema credential fields while custom UI auth is enabled.
