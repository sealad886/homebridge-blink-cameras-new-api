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

- Good: Publish to npm (e.g., `npm publish`) and install via `npm install homebridge-blink-cameras-new-api`; the UI shows the publisher handle.
- Bad: Install via `hb-service add ./homebridge-blink-cameras-new-api-0.1.x.tgz`; the UI shows `@` because registry metadata is unavailable.

**Related Files / Modules:**

- `package.json` (version and metadata)
- `scripts/deploy-to-pi.sh` (local tarball installs bypass registry metadata)

## 3. Rationale and Examples

- See individual conventions above.

## 4. Known Exceptions

- Local development and Pi deployments often use tarballs; handle will appear blank (`@`). This is expected.

## 5. Change History (Human-Readable)

- 2026-01-17: Added convention clarifying npm registry requirement for publisher handle in Homebridge UI.
