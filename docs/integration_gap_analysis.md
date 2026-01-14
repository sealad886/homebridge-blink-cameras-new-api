# Blink API Integration Gap Analysis (Initial Pass)

This document captures the current parity review against `docs/blink_api_dossier.md` and the Homebridge plugin implementation.

## Addressed in this pass

- **Tier coverage expanded**: Added `prde`, `prsg`, `a001`, `srf1` to configuration and URL validation.
- **OAuth env mapping aligned**: OAuth base now matches APK behavior (`api.qa.oauth.blink.com` for `sqa1`, `api.oauth.blink.com` for production tiers).
- **Thumbnail base fixed**: Thumbnails now resolve against the configured REST root instead of hardcoded `rest-prod`.

## Remaining Gaps / Follow-ups

1. **Shared REST base (`rest-{shared_tier}`)**
   - APK routes many device endpoints through the shared REST base.
   - Plugin currently uses only `rest-{tier}` for all endpoints.
   - Consider adding optional `sharedTier` config or automatic fallback to `tier` with explicit shared-base routing.

2. **Media list method**
   - APK uses `POST v4/accounts/{account_id}/media` with `MediaPostBody` and optional query params.
   - Plugin uses a `GET v4/accounts/{account_id}/media?page=` style call.
   - Confirm if GET is still accepted or update to POST with correct payload model.

3. **EventStream**
   - APK uses EventStream (`prod.eventstream.immedia-semi.com`, subgroup `blink.mobile.app`).
   - Plugin does not implement EventStream ingestion or telemetry.
   - Decide whether to explicitly scope this out or implement a minimal client (non-payload logging only).

4. **Local Sync Module onboarding**
   - Local onboarding endpoints are not in scope; ensure docs and config explicitly state unsupported.

## References

- `docs/blink_api_dossier.md` (E1–E92)
- `docs/integration_checklist.md`
