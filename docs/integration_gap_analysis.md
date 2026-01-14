# Blink API Integration Gap Analysis (Initial Pass)

This document captures the current parity review against `docs/blink_api_dossier.md` and the Homebridge plugin implementation.

## Addressed in this pass

- **Tier coverage expanded**: Added `prde`, `prsg`, `a001`, `srf1` to configuration and URL validation.
- **OAuth env mapping aligned**: OAuth base now matches APK behavior (`api.qa.oauth.blink.com` for `sqa1`, `api.oauth.blink.com` for production tiers).
- **Thumbnail base fixed**: Thumbnails now resolve against the configured REST root instead of hardcoded `rest-prod`.

## Remaining Gaps / Follow-ups

1. **EventStream**
   - APK uses EventStream (`prod.eventstream.immedia-semi.com`, subgroup `blink.mobile.app`).
   - Plugin does not implement EventStream ingestion or telemetry.
   - Decide whether to explicitly scope this out or implement a minimal client (non-payload logging only).

2. **Local Sync Module onboarding**
   - Local onboarding endpoints are not in scope; ensure docs and config explicitly state unsupported.

## References

- `docs/blink_api_dossier.md` (E1–E92)
- `docs/integration_checklist.md`

## Handoff Notes

- If implementing EventStream, keep payloads out of logs and reuse existing redaction rules.
- Local onboarding endpoints remain out of scope unless explicitly requested.
