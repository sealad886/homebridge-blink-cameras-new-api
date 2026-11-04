# Blink API Targets and Dynamic URL Construction

Last reviewed: 4 November 2026.

This maintained implementation map describes the plugin's URL construction.
Its original authentication evidence came from Blink Android 57.1 and release
`0.9.1`; those bounded observations remain identified below. The canonical current
static catalog is [Android 59.2](docs/api-contract/README.md). The
[historical dossier](docs/blink_api_dossier.md) preserves the original decompiled
evidence. Neither catalog replaces current typed runtime contracts or live proof.

Blink's OAuth and REST interfaces are private and undocumented. Treat every
host and request shape below as observed behavior, not a public compatibility
guarantee.

## Construction at a glance

```text
production OAuth environment
  -> https://api.oauth.blink.com/oauth/v2/authorize
  -> https://applinks.blink.com/signin/callback
  -> https://api.oauth.blink.com/oauth/token
  -> https://rest-{bootstrap-tier}.immedia-semi.com/api/v1/users/tier_info
  -> persist returned account_id + tier
  -> https://rest-{tier}.immedia-semi.com/api/v2/users/info
  -> https://rest-{shared_tier}.immedia-semi.com/api/v4/accounts/{account_id}/homescreen
```

All production account regions use the same production OAuth host. Geography
is resolved only after tokens exist, through the dynamically tiered REST host.

## Hosted authorization and token exchange

Blink Android's current sign-in path is AppAuth authorization-code flow with
PKCE. The supported Homebridge UI launches that same Blink-hosted sign-in
surface; credentials and hosted MFA are entered only on Blink's page.

### 1. Authorization request

The APK appends `/oauth/v2/authorize` to the environment-specific OAuth base.
For production, the resulting target is:

```text
https://api.oauth.blink.com/oauth/v2/authorize
```

The request dynamically adds:

- `client_id=android` on non-Amazon Android devices;
- `client_id=amazon` when `Build.MANUFACTURER == "Amazon"`;
- redirect URI `https://applinks.blink.com/signin/callback`;
- response type `code`, scope `client`, and prompt `login`;
- independent state plus an S256 PKCE challenge;
- stable hardware ID and app/device metadata.

Homebridge deliberately implements the non-Amazon Android profile. The client
selection is a device-manufacturer decision, not an EU/US/AP/AU account-region
decision.

### 2. Callback

Blink redirects to the registered HTTPS App Link:

```text
https://applinks.blink.com/signin/callback
```

The Homebridge custom UI accepts the complete final address, while the Pi owns
and validates the pending flow, state, expiry, origin, path, and PKCE verifier.
Callback query values are one-time secrets and must not enter configuration or
logs.

### 3. Authorization-code exchange

AppAuth's `AuthorizationResponse.createTokenExchangeRequest` and
`NoClientAuthentication` produce exactly five form fields:

```text
POST https://api.oauth.blink.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
redirect_uri=https://applinks.blink.com/signin/callback
code=<one-time authorization code>
code_verifier=<PKCE verifier>
client_id=android
```

There is no client secret. The native code exchange does not add scope,
hardware ID, app brand, cookies, Blink REST headers, or browser user-agent
metadata.

### 4. Refresh

Refresh uses `OauthApi.postRefreshTokens`, not the AppAuth code-exchange form:

```text
POST https://api.oauth.blink.com/oauth/token
Content-Type: application/x-www-form-urlencoded

refresh_token=<refresh token>
grant_type=refresh_token
client_id=android
scope=client
```

The observed `RefreshTokensResponse` contains access token, refresh token,
expiry, scope, and token type. It does not contain the account region or tier.

## OAuth environment targets

The APK starts with `https://api.{env}oauth.blink.com/` and replaces `{env}`
from the persisted OAuth environment:

| Environment | `{env}` | OAuth base |
|---|---:|---|
| Production | empty | `https://api.oauth.blink.com/` |
| Staging | `qa.` | `https://api.qa.oauth.blink.com/` |
| Development | `dev.` | `https://api.dev.oauth.blink.com/` |

EU, US, AP, and AU are production account tiers, not OAuth environments. They
all use the production OAuth base.

## Regional REST bootstrap

### Native Android ordering

`TierRepository.getTier()` resolves the current REST tier in this order:

1. account preference `TIER`;
2. persistent-client preference `DEFAULT_TIER`;
3. APK build default `prod`.

After OAuth, Android calls `v1/users/tier_info` through that current tier.
`TierRepository.setTierInfo()` immediately persists both returned fields:

- `account_id` under the account-ID preference; and
- `tier` under `TIER`.

The subsequent `v2/users/info` request therefore already uses the
service-authoritative regional tier.

### Homebridge first-sign-in fallback

A new Homebridge installation does not have Android's earlier registration
region preference. For production hosted completion, the plugin tries only the
ordinary APK production account defaults in this deterministic order:

```text
prod -> prde -> prsg -> a001
```

It advances only when a bootstrap gateway rejects `v1/users/tier_info` with
HTTP 406. Authentication failures, rate limits, transport failures, and server
errors stop the search. The first successful response supplies the
authoritative four-alphanumeric tier and account identifier.

The fallback deliberately excludes:

- `cemp`, the APK regression target; and
- `srf1`, the APK refurbishment target.

An explicitly configured safe tier outside the ordinary production set stays
on one target. That includes QA tier `sqa1`, special `cemp`/`srf1`, and safe
four-alphanumeric numbered/custom tiers. Service-returned numbered `e` tiers
also remain valid final destinations, but none is blindly inserted into the
ordinary production bootstrap.

## REST and shared-REST construction

The APK defines tokenized bases and performs replacement in OkHttp immediately
before transmission:

```text
https://rest-{tier}.immedia-semi.com/api/
https://rest-{shared_tier}.immedia-semi.com/api/
```

`{tier}` comes from `TierRepository.getTier()`. `{shared_tier}` comes from
`getSharedTier()`, which falls back to the account tier when no separate shared
tier exists. The `tier_info` response itself does not contain a shared-tier
field. In Homebridge, `sharedTier` is an advanced manual override; otherwise it
uses the discovered account tier.

Relative Retrofit paths are combined with the tokenized base first. Other
interceptors then replace encoded placeholders such as
`%7Binjected_account_id%7D` and `%7Binjected_client_id%7D` with persisted
session metadata.

### Known production and special targets

| Tier | Role | Resulting REST base | OAuth base |
|---|---|---|---|
| `prod` | US/default production | `https://rest-prod.immedia-semi.com/api/` | production |
| `prde` | EU production | `https://rest-prde.immedia-semi.com/api/` | production |
| `prsg` | AP/Singapore production | `https://rest-prsg.immedia-semi.com/api/` | production |
| `a001` | AU production | `https://rest-a001.immedia-semi.com/api/` | production |
| `cemp` | regression target; not ordinary bootstrap | `https://rest-cemp.immedia-semi.com/api/` | production |
| `srf1` | refurbishment target; not ordinary bootstrap | `https://rest-srf1.immedia-semi.com/api/` | production |
| `sqa1` | staging/QA | `https://rest-sqa1.immedia-semi.com/api/` | staging |

## Authentication headers

The APK's general authenticated REST interceptor adds bearer authorization when
an access token exists. It adds `TOKEN-AUTH` only when registration-token state
exists; that header is conditional, not universal. The current Homebridge
Android-hosted profile uses bearer alone. Legacy persisted profiles can retain
`TOKEN-AUTH` when present.

Default REST metadata also includes the current `APP-BUILD`, Blink Android user
agent, locale, and time-zone headers. OAuth token exchange is a separate
unauthenticated client and does not use the REST bearer headers.

## Post-token verification and connection proof

Blink-hosted MFA ends before the App-Link callback. After tokens exist, the
REST API can separately require client verification or account/phone
verification. Homebridge handles those as post-token recovery states, retains
durable authentication, and uses user information plus the account homescreen
as the final connection/device-discovery proof.

## Native USB clip discovery and download

The upcoming saved-clip path uses the authenticated shared REST client. Its
relative base is
`v1/accounts/{account}/networks/{network}/sync_modules/{module}/local_storage`.
The canonical methods in [`src/blink-api/client.ts`](src/blink-api/client.ts)
perform this sequence under the recorder's persisted request context:

| Stage | Relative route below that base |
| --- | --- |
| Request catalog | `POST manifest/request`, then poll the returned network command |
| Read catalog | `GET manifest/request/{requestId}`; a pending response is not a complete catalog |
| Prepare the exact clip | `POST manifest/{manifestId}/clip/request/{clipId}`, then poll its returned command |
| Download prepared original | `GET` the same matching clip-request path as binary media |

Do not replace this sequence with the older `local_storage/media/{commandId}`
route. A delayed response is recovered through its existing request context,
rather than blind duplicate POSTs. Native clips are never deleted by this path.

[`src/blink-api/local-storage.ts`](src/blink-api/local-storage.ts) owns parsing
and provider-name normalization. Clip IDs remain decimal strings; catalog size
is a KiB-scale estimate, not an exact binary length. Command completion uses the
actual `complete` value, not an assumed string status. Complete bounded binary
responses bypass JSON/debug-body logging. Original capture strings remain part
of native identity; the readiness projection alone normalizes display timestamps.

The catalog is capped at 1,000 entries and need not be globally sorted or
complete. The canonical recorder owns overlap, baselines, deduplication, cutovers
and retries. Static route declarations, connected USB or camera storage flags do
not prove a fresh file; see the [recording source evidence](docs/RECORDING.md#1-identify-the-native-storage-source)
and [qualification record](docs/audits/2026-11-04-hsv-readiness-qualification.md).
These references are not authorization for ad-hoc provider calls.

## Legacy authentication surfaces

The APK still contains a direct credential-shaped `OauthApi.postLogin` method;
it is alternate/legacy evidence, not the supported Homebridge workflow, because
decompilation did not establish it as the current Android sign-in entry point.

The plugin also retains a hidden, deprecated compatibility path for paired
manual `username` and `password` configuration. When compatible durable state
is absent or unusable, that path can submit credentials to an iOS-profile
legacy flow. It is not exposed by the custom UI and should not be confused with
the Blink-hosted Android path.

## Validation boundary

- An authorized EU-region test account is the only account region used for live
  authenticated testing.
- A native Android AppAuth harness reproduced the Android 57.1 authorization
  request and reached Blink's hosted identity page.
- A working EU token session proved Android-profile refresh, regional REST
  access, homescreen/device discovery, persistence, and clean restart behavior.
- A live gateway probe returned HTTP 406 from `prod` and `a001`, and a valid
  service-authoritative response from `prde` and `prsg`; ordinary fallback stops
  at the first success.
- Non-EU accounts are not live-validated; their behavior is APK-evidenced and
  parameterized/mocked.
- Fresh packaged `0.9.1` authorization-code exchange acceptance remains open;
  it is the outstanding end-to-end acceptance step.

## Canonical references

- [`docs/blink_api_dossier.md`](docs/blink_api_dossier.md): Android 57.1
  evidence excerpts, URL traces, and endpoint catalog.
- [`docs/adr/001-authentication.md`](docs/adr/001-authentication.md): supported
  Homebridge trust boundary and authentication lifecycle.
- [`docs/integration_checklist.md`](docs/integration_checklist.md): verified
  release evidence and the remaining acceptance boundary.
- [`src/blink-api/oauth-profile.ts`](src/blink-api/oauth-profile.ts): exact
  authorize and token request construction.
- [`src/blink-api/urls.ts`](src/blink-api/urls.ts): environment/tier mapping and
  production bootstrap list.
- [`src/blink-api/client.ts`](src/blink-api/client.ts): `tier_info` fallback,
  authoritative routing, and connection proof.
