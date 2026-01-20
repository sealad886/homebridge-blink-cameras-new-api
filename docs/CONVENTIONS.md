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
- `scripts/deploy-to-pi.sh` (local tarball installs bypass registry metadata)

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

## 3. Rationale and Examples

- See individual conventions above.

## 4. Known Exceptions

- Local development and Pi deployments often use tarballs; handle will appear blank (`@`). This is expected.

## 5. Change History (Human-Readable)

- 2026-01-20: Two-way talk is now forced off; HomeKit microphone UI is hidden and any config attempts log warnings.
- 2026-01-17: Added convention clarifying npm registry requirement for publisher handle in Homebridge UI.
- 2026-01-18: Added two-way talk status guardrails and experimental designation.
