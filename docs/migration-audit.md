# Migration Audit (Phase 1)

> Note: Codanna MCP tools are not available in this environment, so this audit uses `rg` + manual code inspection as a fallback.
> Snapshot note: This audit captures the repo state at the start of the migration; paths noted here may move in later phases.

## Current directory structure (top-level)

- `.github/` — CI/workflows and instructions.
- `src/` — TypeScript plugin implementation.
- `dist/` — Compiled JS output, including UI server + assets.
- `config.schema.json` — Homebridge config schema (custom UI enabled).
- `docs/` — design docs, ADRs, API dossier, debug specs.
- `__tests__/`, `__mocks__/` — Jest tests and helpers.
- `scripts/` — release helpers.
- `package.json`, `tsconfig.json`, `eslint.config.js`, `jest.config.js` — build/test/lint.
- `homebridge-*.tgz` — packaged artifacts (release archives).
- `node_modules/`, `coverage/` — dev artifacts.

## Plugin type

- **Dynamic platform plugin** (`implements DynamicPlatformPlugin`).
  - File: `src/platform.ts`.

## Entry points & registration

- Homebridge registration is in `src/index.ts`:
  - `api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, BlinkCamerasPlatform)`.
- `package.json` points to `dist/index.js` and `dist/index.d.ts` as runtime entrypoints.

## Core modules & interactions

- `src/index.ts` — Homebridge registration.
- `src/platform.ts` — main platform lifecycle, config validation, Blink API wiring, device discovery, polling, accessories, auth storage path resolution.
- `src/accessories/*` — per-device accessories and camera streaming delegate.
- `src/blink-api/*` — Blink OAuth/auth, HTTP client, API calls, URL building, streaming proxy.
- `src/types/*` — domain model & config types.
- `src/homebridge-ui/` — custom config UI (server + static client).
  - `server.ts`: custom UI backend via `@homebridge/plugin-ui-utils`.
  - `public/index.html`: UI, auth flow, config persistence, display.

## Config keys used (runtime)

**Homebridge config (platform config) keys read in runtime code:**

| Key | Location(s) | Purpose |
|---|---|---|
| `name` | platform config (schema/UI) | Display name for platform instance. |
| `username` | `src/platform.ts`, UI | Blink account email (required). |
| `password` | `src/platform.ts`, UI | Blink account password (required). |
| `deviceId` | `src/platform.ts`, UI | Hardware ID override sent to Blink. |
| `deviceName` | `src/platform.ts` | Client name/hardware ID fallback. |
| `twoFactorCode` | `src/platform.ts` | 2FA PIN for login. |
| `clientVerificationCode` | `src/platform.ts` | New device verification PIN. |
| `accountVerificationCode` | `src/platform.ts` | Account/phone verification PIN. |
| `persistAuth` | `src/platform.ts` | Enable/disable persisted auth storage. |
| `trustDevice` | `src/platform.ts` | Trust device during verification. |
| `tier` | `src/platform.ts`, `src/blink-api/urls.ts` | API tier/region selection. |
| `sharedTier` | `src/platform.ts`, `src/blink-api/urls.ts` | Shared REST tier override. |
| `pollInterval` | `src/platform.ts` | Polling interval (seconds). |
| `motionTimeout` | `src/platform.ts` | Motion reset timeout. |
| `enableMotionPolling` | `src/platform.ts` | Enable polling for motion state. |
| `excludeDevices` | `src/platform.ts` | Exclude by name/id/serial. |
| `deviceNames` | `src/platform.ts` | Custom display names per device. |
| `deviceSettings` | `src/platform.ts` | Per-device overrides (motion). |
| `enableStreaming` | `src/platform.ts`, `src/accessories/camera-source.ts` | Enable live view streaming. |
| `ffmpegPath` | `src/platform.ts`, `src/accessories/camera-source.ts` | Path to ffmpeg. |
| `ffmpegDebug` | `src/platform.ts`, `src/accessories/camera-source.ts` | Verbose ffmpeg logging. |
| `rtspTransport` | `src/platform.ts`, `src/accessories/camera-source.ts` | RTSP transport mode. |
| `maxStreams` | `src/platform.ts`, `src/accessories/camera-source.ts` | Max concurrent streams. |
| `enableAudio` | `src/platform.ts`, `src/accessories/camera-source.ts` | Enable audio. |
| `twoWayAudio` | `src/platform.ts`, `src/accessories/camera-source.ts` | Talkback flag (currently forced off/ignored). |
| `audioCodec` | `src/platform.ts`, `src/accessories/camera-source.ts` | Preferred codec. |
| `audioBitrate` | `src/platform.ts`, `src/accessories/camera-source.ts` | Audio bitrate. |
| `videoBitrate` | `src/platform.ts`, `src/accessories/camera-source.ts` | Max video bitrate. |
| `debugAuth` | `src/platform.ts`, `src/blink-api/auth.ts`, `src/blink-api/http.ts` | Verbose auth logging. |
| `debugStreamPath` | `src/platform.ts`, `src/accessories/camera-source.ts` | Optional TS capture path. |
| `snapshotCacheTTL` | `src/platform.ts`, `src/accessories/camera-source.ts` | Snapshot cache TTL. |

**Config schema coverage:**
- All keys above are defined in `config.schema.json` with defaults/validation.

**Non-config internal settings:**
- `BlinkConfig` (internal) includes `clientId`, `clientName`, `authStoragePath`, etc. (not user config).

## UI assets & wiring

- `config.schema.json` uses `customUi: true` and `customUiPath: "./dist/homebridge-ui"`.
- Custom UI client: `src/homebridge-ui/public/index.html` (copied to dist during build).
- Custom UI server: `src/homebridge-ui/server.ts` compiled to `dist/homebridge-ui/server.js`.
- UI communicates with server via `@homebridge/plugin-ui-utils` (`homebridge.request`, `homebridge.addEventListener`).

## Runtime data files & persistence

- Auth state storage (platform runtime):
  - Path built in `src/platform.ts` via `api.user.persistPath()`.
  - Stored under `<persistBase>/blink-auth/<sha1(username|deviceId)>.json`.
- UI server auth state storage:
  - `src/homebridge-ui/server.ts` uses `homebridgeStoragePath` and writes to `../blink-auth/auth-state.json`.
- Debug stream recordings:
  - `debugStreamPath` -> saved as `blink-stream-<serial>-<timestamp>.ts` via `src/blink-api/immis-proxy.ts`.

## Build + output layout

- Build script: `npm run build` => `tsc` + `copy-ui-assets`.
- Output dir: `dist/` with subfolders:
  - `dist/index.js`, `dist/platform.js`, etc.
  - `dist/homebridge-ui/server.js` + `dist/homebridge-ui/public/index.html`.
- Package `files` includes `dist/` and `config.schema.json`.

## Tests & tooling

- Tests in `__tests__/` (Jest).
- Lint via `eslint.config.js`.
- `tsconfig.json` + `tsconfig.test.json` for builds/tests.

## Notes for migration

- Template alignment needs to keep existing `customUiPath` (or move while preserving behavior).
- Persisted auth paths are used in two places (platform + UI server); must preserve file locations.
- `deviceSettings` supports per-device overrides; schema currently documents only motion fields.
- Dist contents are currently relied upon by `customUiPath` and `main`.
