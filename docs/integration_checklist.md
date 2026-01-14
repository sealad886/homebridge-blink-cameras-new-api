# Blink API Integration Checklist

This checklist is derived from APK evidence summarized in `docs/blink_api_dossier.md`. Use it to validate that the Homebridge plugin matches the current Blink Android behavior.

## Base URLs & Routing

- [ ] REST base uses `https://rest-{tier}.immedia-semi.com/api/` with `{tier}` from account tier (fallback to `prod`).
- [ ] Shared REST base uses `https://rest-{shared_tier}.immedia-semi.com/api/` for endpoints listed as shared in the dossier.
- [ ] OAuth base uses `https://api.{env}oauth.blink.com/` with `{env}` derived from tier (e.g., `sqa1` → staging) or explicit env mapping.
- [ ] Blink host detection only applies auth headers to Blink hosts (`*.immedia-semi.com`).

## Authentication & Headers

- [ ] OAuth password grant: `POST oauth/token` with `username`, `password`, `grant_type=password`, `client_id`, `scope=client` and headers `hardware_id`, `2fa-code` (optional).
- [ ] OAuth refresh grant: `POST oauth/token` with `refresh_token`, `grant_type=refresh_token`, `client_id`, `scope`.
- [ ] Standard headers applied to REST calls: `APP-BUILD`, `User-Agent`, `LOCALE`, `X-Blink-Time-Zone`.
- [ ] Auth headers applied to Blink REST requests: `Authorization: Bearer <token>` and `TOKEN-AUTH`.

## Core Device & Network Operations

- [ ] Homescreen: `GET v4/accounts/{account_id}/homescreen`.
- [ ] Arm/disarm: `POST v1/accounts/{account_id}/networks/{networkId}/state/{arm|disarm}`.
- [ ] Camera motion enable/disable: `POST accounts/{account_id}/networks/{networkId}/cameras/{cameraId}/{enable|disable}`.
- [ ] Doorbell motion enable/disable: `POST v1/accounts/{account_id}/networks/{networkId}/doorbells/{doorbellId}/{enable|disable}`.
- [ ] Owl (Mini) motion enable/disable: `POST v1/accounts/{account_id}/networks/{networkId}/owls/{owlId}/{enable|disable}`.
- [ ] Thumbnail requests:
  - Camera: `POST accounts/{account_id}/networks/{networkId}/cameras/{cameraId}/thumbnail`
  - Doorbell: `POST v1/accounts/{account_id}/networks/{networkId}/doorbells/{doorbellId}/thumbnail`
  - Owl: `POST v1/accounts/{account_id}/networks/{networkId}/owls/{owlId}/thumbnail`
- [ ] Live view start:
  - Camera: `POST v6/accounts/{account_id}/networks/{networkId}/cameras/{cameraId}/liveview`
  - Doorbell: `POST v2/accounts/{account_id}/networks/{networkId}/doorbells/{doorbellId}/liveview`
  - Owl: `POST v2/accounts/{account_id}/networks/{networkId}/owls/{owlId}/liveview`
- [ ] Command polling: `GET /accounts/{account_id}/networks/{networkId}/commands/{commandId}`.
- [ ] Command update/done:
  - `POST /accounts/{account_id}/networks/{networkId}/commands/{commandId}/update`
  - `POST /accounts/{account_id}/networks/{networkId}/commands/{commandId}/done`

## Media & Events

- [ ] Media list: `POST v4/accounts/{account_id}/media` with time range and pagination key (preferred), or supported GET equivalent.
- [ ] Unwatched media: `GET v4/accounts/{account_id}/unwatched_media`.
- [ ] Motion event handling (if used) matches dossier and does not rely on undocumented endpoints.

## Reliability & Retry Behavior

- [ ] 401 refresh → retry once.
- [ ] 403 re-login → retry once.
- [ ] 429 exponential backoff.
- [ ] 5xx linear backoff.
- [ ] Command polling interval respects `polling_interval` response; live view defaults to 1s when missing.

## Optional / Out-of-Scope (document explicitly)

- [ ] EventStream (`prod.eventstream.immedia-semi.com`, subgroup `blink.mobile.app`) is either implemented or explicitly out of scope.
- [ ] Local Sync Module onboarding (`http://172.16.97.199/`) is out of scope for Homebridge unless explicitly supported.

## Evidence References

- Base URLs, headers, OAuth flow: `docs/blink_api_dossier.md` (E1–E16).
- Core endpoints: `docs/blink_api_dossier.md` (E19–E72).
- EventStream: `docs/blink_api_dossier.md` (E24, E28, E46, E91–E92).
