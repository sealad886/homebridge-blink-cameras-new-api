# Blink API Integration Checklist

This checklist is derived from APK evidence summarized in `docs/blink_api_dossier.md`. Use it to validate that the Homebridge plugin matches the current Blink Android behavior.

## Base URLs & Routing

- [ ] REST base uses `https://rest-{tier}.immedia-semi.com/api/` with `{tier}` from account tier (fallback to `prod`).
- [ ] Shared REST base uses `https://rest-{shared_tier}.immedia-semi.com/api/` for endpoints listed as shared in the dossier.
- [ ] `sharedTier` override is honored when configured; defaults to `tier` when unset.
- [ ] Retrofit relative routes are joined to tokenized bases before OkHttp rewrites `{tier}`, `{shared_tier}`, and `{env}` on the complete request URL.
- [ ] OAuth base uses `https://api.{env}oauth.blink.com/`, where production `{env}` is `""`, staging is `qa.`, and development is `dev.`.
- [ ] OAuth targets resolve to `api.oauth.blink.com` in production and `api.qa.oauth.blink.com` for `sqa1`; do not use legacy `api.pdoauth` or `api.stgoauth` forms.
- [ ] API Gateway uses `https://api.{env}blink.com/blink/`, resolving to `https://api.blink.com/blink/` in production.
- [ ] Auth host detection uses exact-domain/subdomain-suffix checks, explicitly excludes OAuth hosts, and never uses substring matching.

## Authentication & Headers

- [ ] Interactive login opens `GET oauth/v2/authorize` with `response_type=code`, client ID, scope `client`, prompt `login`, callback, hardware/app/device metadata (including app brand `blink`), and AppAuth-generated PKCE challenge.
- [ ] Credentials, MFA, passkeys, and other sign-in challenges remain inside hosted authorization UI; no current app login call sends a `2fa-code` header.
- [ ] Authorization callback is exchanged at `POST oauth/token` with `grant_type=authorization_code`, authorization code, redirect URI, client ID, and PKCE verifier.
- [ ] Access and refresh tokens are stored securely; authenticated `GET v1/users/tier_info` runs next and its result is persisted.
- [ ] OAuth refresh grant: `POST oauth/token` with `refresh_token`, `grant_type=refresh_token`, `client_id`, `scope`.
- [ ] Standard headers applied to REST calls: `APP-BUILD`, `User-Agent`, `LOCALE`, `X-Blink-Time-Zone`.
- [ ] Authenticated allowlisted requests receive bearer access token; optional `TOKEN-AUTH` uses registration token, not OAuth response data.
- [ ] Refresh retries the original request at most once; missing refresh token or refresh 401 wipes local state and returns to login.
- [ ] Logout calls `POST v4/clients/{client}/logout`; successful response precedes local wipe, signaling shutdown, and login navigation.

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
- [ ] Thumbnail URLs replace `{tier}` with shared tier, remove the REST `/api/` suffix, then append the backend path and `.jpg`.
- [ ] Clip/video downloads treat the media response's address as an absolute `@Url`; do not prepend the REST base a second time.
- [ ] Motion event handling (if used) matches dossier and does not rely on undocumented endpoints.

## Reliability & Retry Behavior

- [ ] 401 refresh → retry once.
- [ ] Non-refreshable authentication failures return to login; do not assume a generic 403 retry.
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
