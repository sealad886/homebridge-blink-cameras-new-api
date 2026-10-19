# Repository conventions

This document owns the non-obvious packaging and UI identity invariants.
Contributor setup and checks belong to [CONTRIBUTING](../CONTRIBUTING.md);
architecture, operations, and delivery have their own owners in the
[documentation map](README.md).

## Registry identity and release ownership

Homebridge's publisher identity depends on npm registry metadata. A local
archive can display a blank publisher handle (`@`); changing the package's
`author` field does not substitute for registry identity. Supported release and
installation paths use the published registry artifact.

The complete versioning, CI publication, artifact verification, and deployment
procedure is owned by the [release guide](RELEASE.md). Do not duplicate it in
scripts or replace CI publishing with local `npm publish` or a tarball bypass.

## Custom UI packaging

Custom UI assets are authored in `src/homebridge-ui/public` and copied to
`dist/homebridge-ui/public` by `npm run build`. `config.schema.json` declares
`customUiPath: "./dist/homebridge-ui"`; `package.json` declares the custom UI
server as `dist/homebridge-ui/server.js` and includes `dist` in the npm package.
These paths must agree in a clean build and the packed artifact. An empty asset
directory otherwise leaves Homebridge settings unable to render.

The executable owners are `package.json` (`build`, `copy-ui-assets`, and
`homebridge.customUi`), `config.schema.json`, and `src/homebridge-ui/`.
Validate the actual package using the [release gates](RELEASE.md), rather than
assuming an existing local `dist/` directory proves correct packaging.

## Authentication UI ownership

Blink sign-in has one entry point: the custom Homebridge UI. Credential and
verification-code inputs must not be added to schema properties or layout,
where they would create a second flow and risk persistence in `config.json`.
The schema owns non-secret platform settings. Authentication state and storage
are governed by [ADR-001](adr/001-authentication.md); user instructions belong
to the [authentication guide](authentication.md).

## Media lifecycle and diagnostics

Use the existing IMMIS command emission and session lifecycle owners rather than
constructing headers or adding competing coordinators. Command recovery is
owned by [ADR-003](adr/003-blink-command-recovery.md); generation ownership,
private transport, and confirmed retirement by
[ADR-004](adr/004-stream-session-ownership.md). Destination and native-worker
constraints are recorded in
[ADR-005](adr/005-secure-media-network-feasibility.md) and the
[security-hardening ledger](plans/security-hardening.md).

Diagnostics must follow the [logging specification](debug_logging_spec.md).
Do not log raw control-plane payloads, unbounded per-message traces, secrets, or
media while investigating IMMIS sequencing. Prefer bounded categories and
counters through the existing diagnostic owners.

Two-way talk remains disabled; the current user-visible status is owned by the
[streaming guide](streaming.md#two-way-talk-status). Protocol scaffolding in
`src/blink-api/immis-proxy.ts` does not authorize advertising a working talkback
feature. Changes must preserve the enforced configuration and HomeKit UI guards
until the corresponding acceptance requirements are verified.
