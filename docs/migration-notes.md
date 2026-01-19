# Migration Notes (Phase 2)

> Note: Codanna MCP tools are not available in this environment, so this plan is derived from manual inspection + `rg`.

## Template reference (target feel)

The Homebridge plugin template repo lists these top-level items: `.github/`, `.vscode/`, `src/`, `test/hbConfig`, `.gitignore`, `.npmignore`, `config.schema.json`, `eslint.config.js`, `nodemon.json`, `package.json`, `tsconfig.json`, etc. It also documents `src/settings.ts`, `src/platform.ts`, and `src/platformAccessory.ts` as the canonical structure for dynamic platform plugins. The watch workflow uses `test/hbConfig/config.json` and `nodemon.json`.

The Homebridge custom UI docs recommend publishing UI assets under `homebridge-ui/` (with `public/index.html` and optional `server.js`) and enable via `customUi`/`customUiPath` in `config.schema.json`.

## Target structure (template-aligned)

Top-level (target):
- `.github/` (keep existing)
- `.vscode/` (add template-style settings/tasks)
- `src/` (restructured to template idioms)
- `homebridge-ui/` (custom UI source + built server)
- `test/hbConfig/` (template-style local Homebridge config)
- `config.schema.json`
- `nodemon.json`
- `eslint.config.js`
- `tsconfig.json`
- `package.json`
- `README.md`, `LICENSE`, etc.

`src/` (target layout):
- `src/index.ts` (registration)
- `src/settings.ts` (PLUGIN_NAME / PLATFORM_NAME constants)
- `src/platform.ts` (platform implementation)
- `src/accessories/` (camera, doorbell, owl, network)
- `src/accessories/camera-source.ts`
- `src/blink-api/`
- `src/types/`

## Move/rename map (planned)

| Current | Target | Notes |
|---|---|---|
| `src/index.ts` | `src/index.ts` | Adjust imports to use `settings.ts`.
| `src/platform.ts` | `src/platform.ts` | Update to import constants from `settings.ts`.
| `src/accessories/*` | `src/accessories/*` | Keep, but add adapter exports if needed.
| `src/homebridge-ui/server.ts` | `homebridge-ui/server.ts` (compiled to JS) | Align with plugin-ui-utils layout. Also emit `dist/homebridge-ui` for backward compatibility unless customUiPath changes.
| `src/homebridge-ui/public/*` | `homebridge-ui/public/*` | Align with UI layout. Build copies to `dist/homebridge-ui/public` as well.
| `dist/homebridge-ui/*` | keep | Preserve current `customUiPath` if not changed.
| `__tests__/` | keep + add `test/hbConfig` | Template uses `test/hbConfig` for local dev.

## Package/build alignment (planned)

- Add `src/settings.ts` and update `src/index.ts` + `src/platform.ts` accordingly.
- Add `nodemon.json` with template-style `npm run watch` (Homebridge dev loop) and update `package.json` scripts.
- Add `.vscode/` settings consistent with template.
- Ensure `package.json` `files` (or `.npmignore`) includes:
  - `dist/**`
  - `config.schema.json`
  - `homebridge-ui/**` (if we move UI source output)
- Keep `main` + `types` pointing to `dist/`.

## Custom UI strategy (planned)

- Publish UI under `homebridge-ui/` to match plugin-ui-utils conventions. citeturn0search0
- Decision: **Switch `customUiPath` to `./homebridge-ui`** and copy build outputs there, while still emitting `dist/homebridge-ui` for continuity. This matches plugin-ui-utils layout while preserving runtime behavior.

## Done criteria (per request)

- `npm run build` succeeds.
- `npm test` passes (or updated smoke tests pass).
- Lint/typecheck passes if configured.
- Plugin runs under Homebridge with same config keys.
- UI loads and shows all config items; custom UI endpoints function.
- `npm pack` includes schema + UI + runtime assets.

## Planned commits

1) Add template scaffolding
2) Move runtime code into template structure
3) Align build + entrypoints
4) Restore UI packaging and schema
5) Add tests + fixtures
6) Docs update
