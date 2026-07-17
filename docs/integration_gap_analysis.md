# Blink API Integration Gap Analysis

This document captures the remaining parity gaps against
`docs/blink_api_dossier.md` and the Homebridge plugin implementation.

## Addressed in this pass

- **Hosted authentication aligned**: The supported custom UI now launches
  Blink-hosted Android-profile OAuth with Pi-owned PKCE/state and stores no
  account credential or hosted-MFA field in plugin configuration.
- **Tier coverage expanded**: URL validation accepts APK-known and safe
  service-returned four-character tiers. Fresh hosted discovery advances only
  through the ordinary production defaults `prod`, `prde`, `prsg`, and `a001`
  after HTTP 406; it excludes the APK's special `cemp` regression and `srf1`
  refurbishment targets.
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

- `docs/blink_api_dossier.md` (E1–E95)
- `docs/integration_checklist.md`

## Handoff Notes

- If implementing EventStream, keep payloads out of logs and reuse existing redaction rules.
- Local onboarding endpoints remain out of scope unless explicitly requested.
