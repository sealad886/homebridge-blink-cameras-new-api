# Repository Standards & Conventions

## 1. Scope and Purpose

- This file captures non-obvious, repo-specific rules that matter for correctness, maintainability, and team sanity.

## 2. Core Conventions

### Homebridge Plugin Identity Source

**Status:** REQUIRED

**Scope:** Installation and display of this plugin in Homebridge UI.

**Rule:** The Homebridge UI shows the publisher/handle only when the plugin is installed from the npm registry; local tarball installs will display `@` and omit the publisher handle.

**Rationale (Why this exists):**

- Homebridge pulls publisher info from npm registry metadata, not from the `author` field in `package.json`, when resolving plugin identity.
- Local tarball installs lack registry metadata, so the handle is blank by design.

**Examples:**

- Good: Publish to npm (e.g., `npm publish`) and install via `npm install @sealad886/homebridge-blink-cameras-new-api`; the UI shows the publisher handle.
- Bad: Install via `hb-service add ./sealad886-homebridge-blink-cameras-new-api-0.1.x.tgz`; the UI shows `@` because registry metadata is unavailable.

**Related Files / Modules:**

- `package.json` (version and metadata)

### CI-Owned NPM Release Path

**Status:** REQUIRED

**Scope:** Release tooling, version bumps, npm publication, and supported Pi deployment flows.

**Rule:** Supported releases must be published by pushing the version bump to `main` and letting `.github/workflows/publish.yml` publish from CI; repo scripts may validate or install published versions, but must not perform direct local `npm publish` or tarball-based bypasses as the supported workflow.

**Rationale (Why this exists):**

- The GitHub Actions workflow compares `package.json` against the registry before publishing, which avoids duplicate releases.
- CI derives the correct npm dist-tag for prereleases, which is easy to get wrong in ad hoc local publishing.
- Installing from the registry preserves npm metadata that Homebridge uses for plugin identity.

**Examples:**

- Good: Commit release-note changes, run `npm run release`, bump the version with `npm version ...`, and then push once the version bump commit is on `main`.
- Good: Use `scripts/deploy-to-pi.sh` only after the target version is live on npm.
- Bad: Reintroducing `npm run release -- --yes` or other direct `npm publish` paths in repo-managed scripts.
- Bad: Reintroducing a tarball deployment mode that bypasses the registry for the supported release/deploy flow.

**Related Files / Modules:**

- `.github/workflows/publish.yml`
- `docs/RELEASE.md`
- `scripts/release.mjs`
- `scripts/deploy-to-pi.sh`

### IMMIS Control-Plane Handling

**Status:** STRONGLY RECOMMENDED

**Scope:** All IMMIS transport interactions within `src/blink-api/*`.

**Rule:** Enumerate and log control-plane message types (`INLINE_COMMAND`, `ACCESSORY_MESSAGE`, `SESSION_COMMAND`, `SESSION_MESSAGE`) alongside `VIDEO`. Use wrapper methods for session lifecycle (`startAudio()`, `stopAudio()`) and centralize command emission via `sendSessionCommand()`.

**Rationale (Why this exists):**

- Control-plane observability is essential while reverse-engineering payloads and sequencing; logging avoids silent drops of important messages.
- Wrapper methods provide a single source of truth for Start/Stop audio semantics while payload structure is being finalized.
- Centralized emission keeps header construction consistent and reduces duplication during future protocol evolution.

**Examples:**

- Good: Use `startAudio()` to request two-way audio; `handleImmisData()` logs incoming `SESSION_MESSAGE` acks.
- Bad: Manually craft ad-hoc buffers in multiple modules for session commands; drop control-plane messages without telemetry.

**Related Files / Modules:**

- `src/blink-api/immis-proxy.ts`

### Two-Way Talk Status & Guardrails

**Status:** REQUIRED

**Scope:** Audio talkback features and configuration.

**Rule:** Two-way talk is disabled until IMMIS uplink framing and ACK handling are validated. Always force `twoWayAudio` off, hide the HomeKit microphone UI, and log a warning if users attempt to enable it.

**Rationale (Why this exists):**

- Device and locale differences affect IMMIS uplink behavior; robust ACK parsing is still in progress.
- Exposing the HomeKit microphone advertises a feature that is not yet reliable.
- Clear runtime messaging avoids user confusion while the feature is gated.

**Examples:**

- Good: Config contains `twoWayAudio: true` but logs warn that talk is disabled and microphone UI stays hidden.
- Good: LOAS/LATM framing work continues behind the scenes without advertising talkback to HomeKit.
- Bad: Surfacing the microphone tile or passing through `twoWayAudio` to streaming delegates.

**Related Files / Modules:**

- `src/accessories/camera-source.ts`
- `src/blink-api/immis-proxy.ts`

### Custom UI Packaging Path

**Status:** REQUIRED

**Scope:** Custom UI build, publish, and runtime packaging.

**Rule:** Source assets live in `src/homebridge-ui/public` and must be copied to `homebridge-ui/public` (runtime path) and `dist/homebridge-ui/public` during `npm run build`; `config.schema.json` expects `customUiPath: "./homebridge-ui"`, so publish must include that folder.

**Rationale (Why this exists):**

- Homebridge Custom UI loads assets from `customUiPath`; if the folder is empty, the config modal spins forever with 404s instead of rendering the form.
- The build step must succeed in a clean checkout; copying from the wrong source path (`homebridge-ui/public`) fails and yields an empty npm tarball.
- Publishing relies on `prepublishOnly` to build; ensuring the correct source path prevents regressions when cutting releases.

**Examples:**

- Good:
  - `npm run build` copies `src/homebridge-ui/public` → `dist/homebridge-ui/public` and `homebridge-ui/public`, then publishes including those assets.
- Bad:
  - Copying from `homebridge-ui/public` (nonexistent in a clean repo) causes `cp: homebridge-ui/public/*: No such file or directory`, leaving the custom UI missing from the package and causing an infinite spinner in Homebridge UI.

**Related Files / Modules:**

- `config.schema.json`
- `package.json` (`copy-ui-assets` script)
- `src/homebridge-ui/public/index.html`

### Authentication UI Single Source of Truth

**Status:** REQUIRED

**Scope:** Homebridge settings UX and authentication configuration.

**Rule:** When `homebridge.customUi` is enabled for this plugin, credential and verification-code inputs must exist only in the custom UI and must not be defined in `config.schema.json` properties/layout.

**Rationale (Why this exists):**

- Config UI X renders both schema fields and custom UI in plugin settings; defining auth fields in both creates duplicate and conflicting login flows.
- Keeping credentials out of schema avoids persisting passwords and one-time verification codes in `config.json`.
- Token persistence already exists via `blink-auth/auth-state.json`, so the custom UI can remain the single auth entry point.

**Examples:**

- Good: `config.schema.json` keeps non-secret platform settings only, while `src/homebridge-ui/public/index.html` contains the sign-in + verification workflow.
- Bad: Reintroducing `username`, `password`, `twoFactorCode`, `clientVerificationCode`, or `accountVerificationCode` into schema properties or layout.

**Related Files / Modules:**

- `config.schema.json`
- `homebridge-ui/public/index.html`
- `src/homebridge-ui/server.ts`

## 3. Rationale and Examples

- See individual conventions above.

## 4. Known Exceptions

- Manual tarball installs outside the repo-managed scripts still show a blank publisher handle (`@`). This is expected, but that path is not part of the supported release or Pi deployment workflow.

## 5. Change History (Human-Readable)

- 2026-04-01: Added required convention that npm releases are CI-owned and removed supported local publish/tarball bypasses from repo-managed scripts.
- 2026-02-14: Added required convention that auth credentials/codes must not be exposed in schema when custom UI auth is enabled.
- 2026-01-20: Two-way talk is now forced off; HomeKit microphone UI is hidden and any config attempts log warnings.
- 2026-01-17: Added convention clarifying npm registry requirement for publisher handle in Homebridge UI.
- 2026-01-18: Added two-way talk status guardrails and experimental designation.
