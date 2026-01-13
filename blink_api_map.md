# Blink Cloud API Surface (from decompiled APK)

Sources are linked to their decompiled locations under `jadx-out/…`.

---

## Implementation Guide for Companion Apps

### Base URLs & Environment Configuration

| Environment | REST API Base | OAuth Base | Notes |
|-------------|---------------|------------|-------|
| Production (default) | `https://rest-prod.immedia-semi.com/api/` | `https://api.pdoauth.blink.com/` | Primary production tier |
| SQA1 (staging) | `https://rest-sqa1.immedia-semi.com/api/` | `https://api.stgoauth.blink.com/` | Staging/test environment |
| CEMP | `https://rest-cemp.immedia-semi.com/api/` | `https://api.pdoauth.blink.com/` | Production tier variant |

The tier code is a 4-character alphanumeric string (regex: `[a-zA-Z\d]{4}`). [TierRepository](jadx-out/sources/com/immediasemi/blink/common/network/tier/TierRepository.java)

### Required HTTP Headers (All Requests)

The app automatically injects these headers via `HeadersInterceptor`:

| Header | Value | Notes |
|--------|-------|-------|
| `APP-BUILD` | `ANDROID_<version_code>` | e.g., `ANDROID_29362618` |
| `User-Agent` | `Blink/<version> (<manufacturer> <model>; Android <os>)` | e.g., `Blink/49.1 (Samsung SM-G991B; Android 13)` |
| `LOCALE` | `<locale>` | e.g., `en_US` |
| `X-Blink-Time-Zone` | `<timezone_id>` | e.g., `America/New_York` |
| `Authorization` | `Bearer <access_token>` | After login |
| `TOKEN-AUTH` | `<token>` | Secondary auth token from login response |

[HeadersInterceptor](jadx-out/sources/com/immediasemi/blink/network/HeadersInterceptor.java) / [HttpHeader](jadx-out/sources/com/immediasemi/blink/core/api/HttpHeader.java)

### Path Injection (URL Placeholders)

The app uses interceptors to replace placeholders in URLs:

- `%7Binjected_account_id%7D` or `{injected_account_id}` → replaced with `account_id` from credentials
- `%7Binjected_client_id%7D` or `{injected_client_id}` → replaced with `client_id` from session

[ClientIdInterceptor](jadx-out/sources/com/immediasemi/blink/network/ClientIdInterceptor.java) / [AccountIdInterceptor](jadx-out/sources/com/immediasemi/blink/network/AccountIdInterceptor.java)

---

## Auth & Session

### Login Flow

**Endpoint:** `POST oauth/token` (on OAuth base URL)

**Request (form-urlencoded):**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `username` | string | Yes | - | Email address |
| `password` | string | Yes | - | Password |
| `grant_type` | string | Yes | `password` | OAuth grant type |
| `client_id` | string | Yes | - | `android` or `amazon` (based on device manufacturer) |
| `scope` | string | Yes | `client` | OAuth scope |

**Headers:**

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `2fa-code` | string | No | 2FA verification code if required |
| `hardware_id` | string | Yes | Persistent UUID (generate once, store forever) |

**Response Schema:**

```json
{
  "access_token": "string",
  "refresh_token": "string",
  "expires_in": 86400,
  "scope": "client",
  "token_type": "Bearer"
}
```

[OauthApi](jadx-out/sources/com/immediasemi/blink/common/account/auth/OauthApi.java) / [RefreshTokensResponse](jadx-out/sources/com/immediasemi/blink/common/account/auth/RefreshTokensResponse.java)

### Token Refresh

**Endpoint:** `POST oauth/token` (on OAuth base URL)

**Request (form-urlencoded):**

| Field | Value |
|-------|-------|
| `refresh_token` | `<refresh_token>` |
| `grant_type` | `refresh_token` |
| `client_id` | `android` or `amazon` |
| `scope` | `client` |

### Client Type Detection

```javascript
// BuildUtils.getClientType() logic
function getClientType() {
  return deviceManufacturer === "Amazon" ? "amazon" : "android";
}
```

[BuildUtils](jadx-out/sources/com/immediasemi/blink/common/util/BuildUtils.java)

### Additional Auth Endpoints

- `POST v7/users/register` - User registration
- `POST v3/users/validate_email` - Email validation
- `POST v3/users/validate_password` - Password validation
  [AuthApi](jadx-out/sources/com/immediasemi/blink/common/account/auth/AuthApi.java)
- `POST v1/users/authenticate_password`, `POST v4/clients/{client}/logout`, token upgrade `POST v1/identity/token`. [AccountApi](jadx-out/sources/com/immediasemi/blink/common/account/AccountApi.java)
- PIN flows: `POST v4/users/pin/resend|verify`, `POST v4/clients/{client}/pin/verify`. [AccountApi](jadx-out/sources/com/immediasemi/blink/common/account/AccountApi.java)
- Password reset/change: `POST v4/users/password_change` (+pin generate/verify) and client-scoped change `POST v4/clients/{client}/password_change`. [PasswordResetApi](jadx-out/sources/com/immediasemi/blink/account/password/PasswordResetApi.java) / [PasswordChangeApi](jadx-out/sources/com/immediasemi/blink/settings/password/PasswordChangeApi.java)
- Interceptors the app adds automatically: `APP-BUILD`, `User-Agent`, `LOCALE`, `X-Blink-Time-Zone` (HeadersInterceptor); path injection for `{client}`/`{account}` (ClientIdInterceptor/AccountIdInterceptor); token refresh on 401 (BlinkAuthenticator). [HeadersInterceptor](jadx-out/sources/com/immediasemi/blink/network/HeadersInterceptor.java) / [ClientIdInterceptor](jadx-out/sources/com/immediasemi/blink/network/ClientIdInterceptor.java) / [BlinkAuthenticator](jadx-out/sources/com/immediasemi/blink/network/BlinkAuthenticator.java)

### Account, Preferences, Notifications

- `GET v2/users/info`, `GET v1/users/options|preferences`, `POST v1/users/preferences`. [AccountApi](jadx-out/sources/com/immediasemi/blink/common/account/AccountApi.java)
- Notification prefs `GET/POST v1/notifications/preferences`. [AccountApi](jadx-out/sources/com/immediasemi/blink/common/account/AccountApi.java)
- Country updates `POST v1/countries/update`, `POST v1/users/countries/update`. [AccountApi](jadx-out/sources/com/immediasemi/blink/common/account/AccountApi.java)
- Delete account `POST /users/delete`. [AccountApi](jadx-out/sources/com/immediasemi/blink/common/account/AccountApi.java)

### Sharing / Household Access

- Invitations: send `POST v1/shared/invitations/send`, accept/decline/revoke; summary `GET v1/shared/summary`, check `GET v1/shared/check_authorization`.
- Authorizations: `PATCH v1/shared/authorizations/{authorizationId}`, remove/revoke endpoints.
  [AccessApi](jadx-out/sources/com/immediasemi/blink/common/account/AccessApi.java)

### Subscriptions / Entitlements

- Plans & entitlements: `GET v2/v3 accounts/{account}/subscriptions/plans`, `GET v2/accounts/{account}/subscriptions/entitlements`.
- Trials/attach/renew/cancel: `POST v1/subscriptions/plans/{subscriptionId}/attach`, `POST v1/subscriptions/plans/create_trial`, `…/renew_trial`, `…/cancel_trial`.
- Link/unlink account: `POST v1/subscriptions/link/link_account|unlink_account`.
  [ReadSubscriptionApi](jadx-out/sources/com/immediasemi/blink/common/subscription/ReadSubscriptionApi.java), [WriteSubscriptionApi](jadx-out/sources/com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java)

### Home, Events, Notifications

- Homescreen snapshot `GET v4/accounts/{account}/homescreen`. [HomeScreenApi](jadx-out/sources/com/immediasemi/blink/utils/sync/HomeScreenApi.java)
- App events `POST v1/events/app`. [EventApi](jadx-out/sources/com/immediasemi/blink/common/track/event/EventApi.java)
- Notification ack `POST v2/notification`. [NotificationApi](jadx-out/sources/com/immediasemi/blink/notification/NotificationApi.java)

#### HomeScreen Response Schema

The homescreen endpoint is the primary data source for listing all devices:

```json
{
  "changed": true,
  "networks": [
    {
      "id": 12345,
      "name": "Home Network",
      "armed": true,
      "lv_save": false
    }
  ],
  "sync_modules": [
    {
      "id": 67890,
      "network_id": 12345,
      "serial": "ABC123",
      "status": "online",
      "fw_version": "2.0.0",
      "local_storage_enabled": true,
      "local_storage_status": "ready"
    }
  ],
  "cameras": [
    {
      "id": 11111,
      "network_id": 12345,
      "name": "Front Door",
      "type": "mini",
      "enabled": true,
      "thumbnail": "/media/production/account/12345/network/12345/camera/11111/thumbnail.jpg"
    }
  ],
  "owls": [
    {
      "id": 22222,
      "network_id": 12345,
      "name": "Indoor Cam",
      "type": "owl",
      "enabled": true
    }
  ],
  "doorbells": [
    {
      "id": 33333,
      "network_id": 12345,
      "name": "Doorbell",
      "type": "doorbell",
      "enabled": true
    }
  ],
  "video_stats": {
    "storage": 1024,
    "auto_delete_days": 60
  },
  "device_limits": {
    "camera": 10,
    "owl": 5,
    "doorbell": 2
  },
  "account": {
    "id": 12345,
    "email_verified": true,
    "email_verification_required": false
  },
  "subscriptions": {},
  "entitlements": {},
  "access": {},
  "tiv_lock_status": {},
  "accessories": []
}
```

[HomeScreen](jadx-out/sources/com/immediasemi/blink/utils/sync/HomeScreen.java)

---

## Live View (Critical for Companion Apps)

Live view is one of the most complex flows to implement. It involves starting a live stream, polling for command status, and connecting to a media server.

### Live View Endpoints by Device Type

| Device Type | Endpoint | Version |
|-------------|----------|---------|
| Camera (Mini) | `POST v6/accounts/{account}/networks/{network}/cameras/{camera}/liveview` | v6 |
| Doorbell (Lotus) | `POST v2/accounts/{account}/networks/{network}/doorbells/{doorbell}/liveview` | v2 |
| Owl (Wired) | `POST v2/accounts/{account}/networks/{network}/owls/{owl}/liveview` | v2 |

### Live View Request Body

```json
{
  "intent": "liveview",
  "motion_event_start_time": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `intent` | string | No | Purpose of live view request (e.g., `"liveview"`) |
| `motion_event_start_time` | string | No | ISO timestamp if triggered by motion event |

### Live View Response Schema

```json
{
  "command_id": 123456789,
  "parent_command_id": null,
  "server": "rtsps://lv.prod.immedia-semi.com:443/abc123def456",
  "video_id": 789012345,
  "media_id": 456789012,
  "polling_interval": 5,
  "duration": 300,
  "continue_interval": 60,
  "continue_warning": 30,
  "extended_duration": 600,
  "is_mclv": false,
  "type": "camera",
  "first_joiner": true,
  "liveview_token": "eyJ0eXAiOiJKV1Qi..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `command_id` | long | ID for polling command status |
| `parent_command_id` | long? | Parent command for multi-client sessions |
| `server` | string | **RTSPS stream URL** - Connect here for video |
| `video_id` | long | Video session identifier |
| `media_id` | long | Media identifier for recording |
| `polling_interval` | long | Seconds between status polls (typically 5) |
| `duration` | int? | Max session duration in seconds |
| `continue_interval` | int | Seconds before "continue" prompt |
| `continue_warning` | int? | Seconds of warning before timeout |
| `extended_duration` | int | Extended session duration (subscription feature) |
| `is_mclv` | boolean | Multi-client live view session |
| `type` | string? | Device type identifier |
| `first_joiner` | boolean | Whether this client started the session |
| `liveview_token` | string? | JWT token for extended session features |

### Live View Flow

```text
┌─────────────┐     POST /liveview      ┌─────────────┐
│  Companion  │ ──────────────────────► │ Blink Cloud │
│     App     │ ◄────────────────────── │             │
└─────────────┘   command_id, server    └─────────────┘
       │                                       │
       │ GET /commands/{command_id}            │
       │ (poll every polling_interval)         │
       │ ◄─────────────────────────────────────│
       │        status: "running"              │
       │                                       │
       ▼                                       
┌─────────────┐                         ┌─────────────┐
│  RTSPS/RTSP │ ◄─────────────────────► │ Media Server│
│   Client    │    Video/Audio Stream   │  (server)   │
└─────────────┘                         └─────────────┘
```

1. **Start Live View**: POST to the appropriate liveview endpoint
2. **Get Stream URL**: Response contains `server` field with RTSPS URL
3. **Poll Status**: GET `/accounts/{account}/networks/{network}/commands/{command_id}` every `polling_interval` seconds
4. **Connect to Stream**: Use RTSPS client to connect to the `server` URL
5. **Extend Session**: Before `continue_warning`, call update endpoint to extend
6. **End Session**: POST `/accounts/{account}/networks/{network}/commands/{command_id}/done`

### Command Polling

**Endpoint:** `GET /accounts/{account}/networks/{network}/commands/{command_id}`

Poll this endpoint every `polling_interval` seconds to check if the live view session is still active.

**Response states:**

- `"running"` - Stream is active
- `"complete"` - Stream ended normally
- `"failed"` - Stream failed to start

### Extending Live View Session

**Endpoint:** `POST /accounts/{account}/networks/{network}/commands/{command_id}/update`

Call this before the session times out to extend it.

[CameraApi](jadx-out/sources/com/immediasemi/blink/common/device/camera/CameraApi.java) / [DoorbellApi](jadx-out/sources/com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java) / [OwlApi](jadx-out/sources/com/immediasemi/blink/common/device/camera/wired/OwlApi.java) / [LiveViewCommandPostBody](jadx-out/sources/com/immediasemi/blink/common/device/camera/video/live/LiveViewCommandPostBody.java) / [LiveViewCommandResponse](jadx-out/sources/com/immediasemi/blink/common/device/camera/video/live/LiveViewCommandResponse.java)

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | App Behavior |
|------|---------|--------------|
| `200` | Success | Continue normally |
| `401` | Unauthorized | Trigger token refresh via `BlinkAuthenticator` |
| `403` | Forbidden (Shared Tier) | Re-authenticate and redirect to home |
| `426` | Upgrade Required | **Navigate to app update** - API version too old |
| `429` | Rate Limited | Back off and retry |
| `5xx` | Server Error | Retry with exponential backoff |

### Token Refresh on 401

The app uses `BlinkAuthenticator` to automatically refresh tokens on 401 responses:

1. Detect 401 response
2. Call `POST oauth/token` with `refresh_token` grant type
3. Store new tokens
4. Retry original request with new tokens

[BlinkAuthenticator](jadx-out/sources/com/immediasemi/blink/network/BlinkAuthenticator.java)

### Host Validation

The app only adds authentication headers for Blink hosts. Use `isBlinkHost()` logic:

```javascript
function isBlinkHost(hostname) {
  return hostname.includes("immedia-semi.com") || hostname.includes("blink.com");
}
```

[RestApiKt](jadx-out/sources/com/immediasemi/blink/core/api/RestApiKt.java)

---

## Complete Endpoint Reference

### Endpoint Path Conventions

**CRITICAL**: Understanding the path structure is essential for successful API calls.

1. **Version Prefixes**: Most endpoints have a version prefix (`v1/`, `v2/`, `v4/`, `v6/`). Some legacy endpoints have NO version prefix (start with `/accounts/...`).

2. **Account ID Placeholder**: In the Android app, paths use `%7Binjected_account_id%7D` (URL-encoded `{injected_account_id}`) which is replaced by `AccountIdInterceptor` at runtime. For your implementation, substitute your actual account ID.

3. **Client ID Placeholder**: Logout and some client endpoints use `%7Binjected_client_id%7D`, replaced by `ClientIdInterceptor`.

4. **Base URL Construction**: Final URL = `https://rest-{tier}.immedia-semi.com/api/` + path
   - Example: `https://rest-prod.immedia-semi.com/api/v4/accounts/12345/homescreen`

### Authentication Endpoints (OAuth Base URL)

> **Base URL**: `https://api.{env}oauth.blink.com/` where `{env}` = `pd` (production) or `stg` (staging)

| Method | Path | Description | Verified |
|--------|------|-------------|----------|
| `POST` | `oauth/token` | Login (grant_type=password) or refresh (grant_type=refresh_token) | ✅ |

### Account Endpoints (REST Base URL)

| Method | Path | Description | Verified |
|--------|------|-------------|----------|
| `GET` | `v2/users/info` | Get user info | ✅ |
| `GET` | `v1/users/options` | Get user options | ✅ |
| `GET` | `v1/users/preferences` | Get user preferences | ✅ |
| `POST` | `v1/users/preferences` | Update preferences | ✅ |
| `POST` | `v4/clients/{client}/logout` | Logout client | ✅ |
| `POST` | `v1/identity/token` | Token upgrade | ✅ |
| `POST` | `v4/users/pin/resend` | Resend PIN | ✅ |
| `POST` | `v4/users/pin/verify` | Verify PIN | ✅ |
| `POST` | `v4/clients/{client}/pin/verify` | Verify client PIN | ✅ |
| `POST` | `v4/users/password_change` | Change password | ✅ |
| `POST` | `/users/delete` | Delete account | ✅ |

### HomeScreen Endpoints

| Method | Path | Description | Verified |
|--------|------|-------------|----------|
| `GET` | `v4/accounts/{account}/homescreen` | Get all devices/networks | ✅ |

### Camera Endpoints

> **Note**: All `{account}` placeholders are internally URL-encoded as `%7Binjected_account_id%7D` and replaced by the AccountIdInterceptor at runtime.

| Method | Path | Description | Verified |
|--------|------|-------------|----------|
| `POST` | `/accounts/{account}/networks/{network}/cameras/add` | Add camera to network | ✅ |
| `GET` | `v2/accounts/{account}/networks/{network}/cameras/{camera}/config` | Get camera config | ✅ |
| `POST` | `v2/accounts/{account}/networks/{network}/cameras/{camera}/config` | Update camera config | ✅ |
| `GET` | `v2/accounts/{account}/networks/{network}/cameras/{camera}/zones` | Get motion zones v2 | ✅ |
| `POST` | `v2/accounts/{account}/networks/{network}/cameras/{camera}/zones` | Set motion zones v2 | ✅ |
| `POST` | `v6/accounts/{account}/networks/{network}/cameras/{camera}/liveview` | Start live view | ✅ |
| `POST` | `/accounts/{account}/networks/{network}/cameras/{camera}/thumbnail` | Request thumbnail | ✅ |
| `POST` | `/accounts/{account}/networks/{network}/cameras/{camera}/enable` | Enable motion | ✅ |
| `POST` | `/accounts/{account}/networks/{network}/cameras/{camera}/disable` | Disable motion | ✅ |
| `POST` | `/accounts/{account}/networks/{network}/cameras/{camera}/status` | Get status | ✅ |
| `POST` | `/accounts/{account}/networks/{network}/cameras/{camera}/delete` | Delete camera | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/cameras/{camera}/snooze` | Snooze camera | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/cameras/{camera}/unsnooze` | Unsnooze camera | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/cameras/{camera}/calibrate` | Calibrate camera | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/cameras/{camera}/temp_alert/enable` | Enable temp alerts | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/cameras/{camera}/temp_alert/disable` | Disable temp alerts | ✅ |

### Doorbell Endpoints

| Method | Path | Description | Verified |
|--------|------|-------------|----------|
| `POST` | `v1/accounts/{account}/networks/{network}/doorbells/add` | Add doorbell | ✅ |
| `GET` | `v1/accounts/{account}/networks/{network}/doorbells/{doorbell}/config` | Get doorbell config | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/doorbells/{doorbell}/config` | Update config | ✅ |
| `POST` | `v2/accounts/{account}/networks/{network}/doorbells/{doorbell}/liveview` | Start live view | ✅ |
| `GET` | `v1/accounts/{account}/networks/{network}/doorbells/{doorbell}/zones` | Get motion zones v1 | ✅ |
| `GET` | `v2/accounts/{account}/networks/{network}/doorbells/{doorbell}/zones` | Get motion zones v2 | ✅ |
| `POST` | `v2/accounts/{account}/networks/{network}/doorbells/{doorbell}/zones` | Set motion zones v2 | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/doorbells/{doorbell}/thumbnail` | Request thumbnail | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/doorbells/{doorbell}/enable` | Enable motion | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/doorbells/{doorbell}/disable` | Disable motion | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/doorbells/{doorbell}/delete` | Delete doorbell | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/doorbells/{doorbell}/snooze` | Snooze | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/doorbells/{doorbell}/unsnooze` | Unsnooze | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/doorbells/{doorbell}/status` | Get status | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/doorbells/{doorbell}/stay_awake` | Keep awake | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/doorbells/{doorbell}/power_test` | Test power | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/doorbells/{doorbell}/change_mode` | Change mode | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/doorbells/{doorbell}/change_wifi` | Change WiFi | ✅ |
| `GET` | `v1/accounts/{account}/doorbells/{serial}/fw_update` | Get firmware update | ✅ |

### Owl (Wired Camera) Endpoints

| Method | Path | Description | Verified |
|--------|------|-------------|----------|
| `POST` | `v1/accounts/{account}/networks/{network}/owls/add` | Add owl | ✅ |
| `GET` | `v1/accounts/{account}/networks/{network}/owls/{owl}/config` | Get owl config | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/owls/{owl}/config` | Update config | ✅ |
| `POST` | `v2/accounts/{account}/networks/{network}/owls/{owl}/liveview` | Start live view | ✅ |
| `GET` | `v2/accounts/{account}/networks/{network}/owls/{owl}/zones` | Get motion zones v2 | ✅ |
| `POST` | `v2/accounts/{account}/networks/{network}/owls/{owl}/zones` | Set motion zones v2 | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/owls/{owl}/thumbnail` | Request thumbnail | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/owls/{owl}/status` | Get status | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/owls/{owl}/delete` | Delete owl | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/owls/{owl}/change_wifi` | Change WiFi | ✅ |
| `GET` | `v1/accounts/{account}/owls/{serial}/fw_update` | Get firmware update | ✅ |

### Network Endpoints

| Method | Path | Description | Verified |
|--------|------|-------------|----------|
| `POST` | `v1/accounts/{account}/networks/{network}/state/arm` | Arm network | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/state/disarm` | Disarm network | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/snooze` | Snooze network | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/unsnooze` | Unsnooze network | ✅ |

### Sync Module Endpoints

| Method | Path | Description | Verified |
|--------|------|-------------|----------|
| `POST` | `v1/accounts/{account}/networks/{network}/sync_modules/{module}/delete` | Delete module | ✅ |
| `GET` | `v1/accounts/{account}/networks/{network}/sync_modules/{module}/fw_update` | Firmware info | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/sync_modules/{module}/local_storage/eject` | Eject storage | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/sync_modules/{module}/local_storage/format` | Format storage | ✅ |
| `POST` | `v1/accounts/{account}/networks/{network}/sync_modules/{module}/local_storage/mount` | Mount storage | ✅ |
| `GET` | `v1/accounts/{account}/networks/{network}/sync_modules/{module}/local_storage/status` | Storage status | ✅ |

### Media Endpoints

| Method | Path | Description | Verified |
|--------|------|-------------|----------|
| `GET` | `v4/accounts/{account}/media_settings` | Get media settings | ✅ |
| `PATCH` | `v4/accounts/{account}/media_settings` | Update media settings | ✅ |
| `GET` | `v4/accounts/{account}/unwatched_media` | Get unwatched clips | ✅ |
| `POST` | `v4/accounts/{account}/media` | Query/create media | ✅ |
| `DELETE` | `v4/accounts/{account}/media/{media}/delete` | Delete single clip | ✅ |
| `POST` | `v4/accounts/{account}/media/delete` | Bulk delete clips | ✅ |
| `POST` | `v4/accounts/{account}/media/mark_viewed` | Mark clip viewed | ✅ |
| `POST` | `v4/accounts/{account}/media/mark_all_viewed` | Mark all viewed | ✅ |

### Command Endpoints

> **Note**: Command endpoints have NO version prefix. The account placeholder is URL-encoded.

| Method | Path | Description | Verified |
|--------|------|-------------|----------|
| `GET` | `/accounts/{account}/networks/{network}/commands/{command}` | Poll command status | ✅ |
| `POST` | `/accounts/{account}/networks/{network}/commands/{command}/update` | Update/extend command | ✅ |
| `POST` | `/accounts/{account}/networks/{network}/commands/{command}/done` | End command | ✅ |

---

### Media & Clips

- Lists/settings: `GET v4/accounts/{account}/media_settings`, `PATCH` same; `GET v4/accounts/{account}/unwatched_media`.
- Clip actions: `POST v4/accounts/{account}/media` (create), mark viewed/mark all, delete single `DELETE v4/accounts/{account}/media/{mediaId}/delete` or bulk `POST v4/accounts/{account}/media/delete`.
- Local storage (sync module): request manifest and clips, delete, status, eject/format/mount under `v1/accounts/{account}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/...`.
  [MediaApi](jadx-out/sources/com/immediasemi/blink/video/clip/media/MediaApi.java)
- Raw video download: `GET <signed URL>` via VideoApi, optional cache-check header. [VideoApi](jadx-out/sources/com/immediasemi/blink/video/VideoApi.java)

### Networks, Arming, Programs

- Network state: arm/disarm/snooze/unsnooze via `v1/accounts/{account}/networks/{networkId}/state/{type}`, `…/snooze`, `…/unsnooze`.
- Programs (schedules): list/create/update/enable/disable/delete under `v1/accounts/{account}/networks/{network}/programs`.
  [NetworkApi](jadx-out/sources/com/immediasemi/blink/device/network/NetworkApi.java), [ProgramApi](jadx-out/sources/com/immediasemi/blink/device/network/program/ProgramApi.java)

### Devices

#### Cameras (wired "owl")

- Config `GET v2/accounts/{account}/networks/{networkId}/cameras/{cameraId}/config`; zones v2; temp alerts enable/disable; calibrate; snooze/unsnooze.
- Light accessories control `v2/.../light_accessories/{accessoryId}/lights/{lightControl}`.
  [CameraApi](jadx-out/sources/com/immediasemi/blink/common/device/camera/CameraApi.java)

#### Doorbells ("lotus")

- Add/delete, config, chime config, power test, change wifi/mode, clear creds, stay awake, thumbnails, status, zones (v1/v2), snooze/unsnooze, temp alerts, live view `v2/.../doorbells/{doorbellId}/liveview`, firmware update `v1/.../doorbells/{serial}/fw_update`.
  [DoorbellApi](jadx-out/sources/com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java)

#### Owls (wired cams)

- Add/delete, config, change wifi, status, thumbnail, zones v2, live view `v2/.../owls/{owlId}/liveview`, firmware update `v1/.../owls/{serial}/fw_update`.
  [OwlApi](jadx-out/sources/com/immediasemi/blink/common/device/camera/wired/OwlApi.java)

#### Accessories

- Add/delete network accessories, rosie calibrate, camera accessory delete. [AccessoryApi](jadx-out/sources/com/immediasemi/blink/device/accessory/AccessoryApi.java)

#### Sync Modules (cloud)

- Delete module, firmware update info, local storage controls (eject/format/mount/status). [SyncModuleApi](jadx-out/sources/com/immediasemi/blink/device/sync/SyncModuleApi.java)

### Commands (long-running actions)

- Poll command status (generic/supervisor/live view/camera action): `GET /accounts/{account}/networks/{network}/commands/{command}`.
- Update/done: `POST …/commands/{command}/update` or `/done`.
- Onboarding terminate uses same update endpoint with special body.
  [CommandApi](jadx-out/sources/com/immediasemi/blink/common/device/network/command/CommandApi.java)

### Alexa Linking

- `GET v1/alexa/link_status`, `POST v1/alexa/authorization`, `POST/DELETE v1/alexa/link`. Redirect URI `https://applinks.blink.com/a2a/blink`.
  [AlexaLinkingApi](jadx-out/sources/com/immediasemi/blink/settings/account/alexa/AlexaLinkingApi.java)

### Data & Privacy

- DSAR/EUDA create, list, third-party revoke under `v1/data_request/...`.
  [ManageDataApi](jadx-out/sources/com/immediasemi/blink/settings/account/managedata/ManageDataApi.java)

### Feature Flags

- `GET v1/accounts/{account}/feature_flags/enabled`. [FeatureFlagApi](jadx-out/sources/com/immediasemi/blink/common/flag/FeatureFlagApi.java)

### Event Stream (Ring library)

- WebSocket/SSE against `https://prod.eventstream.immedia-semi.com/`; AuthInfoProvider currently returns null token. [LibraryModule](jadx-out/sources/com/immediasemi/blink/inject/LibraryModule.java)

### Local Onboarding (Sync Module AP, HTTP)

- `GET api/get_fw_version`, `GET api/ssids`
- `POST api/set/key` (encryption seed), `POST api/set/ssid` (Wi‑Fi creds)
- `GET api/version`, `GET api/logs`
- `POST /api/set/app_fw_update` with `X-Blink-FW-Signature`
  [WifiApi](jadx-out/sources/com/immediasemi/blink/device/wifi/WifiApi.java), [WifiSecureApi](jadx-out/sources/com/immediasemi/blink/device/wifi/WifiSecureApi.java), [SyncModuleService](jadx-out/sources/com/immediasemi/blink/api/retrofit/SyncModuleService.java)

### Security Observations

- Cloud calls use HTTPS; bearer + TOKEN-AUTH headers injected only for Blink hosts (see `RestApiKt.isBlinkHost`).  
- Tier/env placeholders are swapped in interceptors to avoid hardcoding per build.  
- Local onboarding traffic is plain HTTP; payload optionally encrypted via `EncryptionInterceptor`, but no TLS — treat as untrusted network exposure.  
- 426 responses trigger app-update navigation; 403 on shared tier triggers re-auth + redirect to home.  
- Logging interceptor set to BODY level in debug, so avoid shipping with verbose logs in production.

---

## Workflow Examples (fully wired to app constants)

### Prereq values (from code)

- `client_id`: `BuildUtils.getClientType()` → `"android"` or `"amazon"`. [BuildUtils](jadx-out/sources/com/immediasemi/blink/common/util/BuildUtils.java)
- `hardware_id`: UUID from `GetDeviceUniqueIdUseCase` (`pref_device_unique_id`, created once and cached). [GetDeviceUniqueIdUseCase](jadx-out/sources/com/immediasemi/blink/common/account/client/GetDeviceUniqueIdUseCase.java)
- `scope`: `"client"` (OauthApi defaults). [OauthApi](jadx-out/sources/com/immediasemi/blink/common/account/auth/OauthApi.java)
- REST base: `https://rest-{tier}.immedia-semi.com/api/` where `{tier}` comes from `TierRepository` (prod default; other codes include `sqa1`, `cemp`). [TierRepository](jadx-out/sources/com/immediasemi/blink/common/network/tier/TierRepository.java)
- OAuth base: `https://api.{env}oauth.blink.com/` where `{env}` is derived from tier’s `OauthEnvironment` (prod vs staging). [NetworkModule](jadx-out/sources/com/immediasemi/blink/inject/NetworkModule.java)
- App-added headers you may want to replicate: `APP-BUILD`=`BuildUtils.getVersionCodeHeader()`, `User-Agent`=`BuildUtils.getUserAgent()`, `LOCALE`, `X-Blink-Time-Zone`. [HeadersInterceptor](jadx-out/sources/com/immediasemi/blink/network/HeadersInterceptor.java)

### Python (requests)

```python
import os, uuid, requests

CLIENT_ID = "android"  # or "amazon" per BuildUtils.getClientType()
HARDWARE_ID = os.environ.get("BLINK_HWID", str(uuid.uuid4()))  # mirror GetDeviceUniqueIdUseCase
SCOPE = "client"
TIER = "prod"  # replace with actual from TierRepository if known
ENV = "pd" if TIER == "prod" else "stg"  # heuristic matching OauthEnvironment
BASE = f"https://rest-{TIER}.immedia-semi.com/api/"
OAUTH = f"https://api.{ENV}oauth.blink.com/"

def login(email, password, twofa=""):
    r = requests.post(
        OAUTH + "oauth/token",
        data={
            "username": email,
            "password": password,
            "grant_type": "password",
            "client_id": CLIENT_ID,
            "scope": SCOPE,
        },
        headers={"2fa-code": twofa, "hardware_id": HARDWARE_ID},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()

def homescreen(tokens, account_id):
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        # TOKEN-AUTH (second token) is stored in CredentialRepository in-app; include if your backend returns it.
    }
    r = requests.get(BASE + f"v4/accounts/{account_id}/homescreen", headers=headers, timeout=15)
    r.raise_for_status()
    return r.json()

def start_liveview(tokens, account_id, network_id, doorbell_id):
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    cmd = requests.post(
        BASE + f"v2/accounts/{account_id}/networks/{network_id}/doorbells/{doorbell_id}/liveview",
        headers=headers, timeout=15
    ).json()
    command_id = cmd["command_id"]
    status = requests.get(
        BASE + f"accounts/{account_id}/networks/{network_id}/commands/{command_id}",
        headers=headers, timeout=15
    ).json()
    return status

if __name__ == "__main__":
    tok = login("user@example.com", "pass", twofa="123456")
    print(homescreen(tok, "YOUR_ACCOUNT_ID"))
```

### TypeScript (fetch, Node 18+)

```ts
import { randomUUID } from "crypto";

const CLIENT_ID = "android"; // or "amazon" per BuildUtils.getClientType
const HARDWARE_ID = process.env.BLINK_HWID ?? randomUUID(); // mirrors GetDeviceUniqueIdUseCase
const SCOPE = "client";
const TIER = "prod"; // from TierRepository
const ENV = TIER === "prod" ? "pd" : "stg";
const BASE = `https://rest-${TIER}.immedia-semi.com/api/`;
const OAUTH = `https://api.${ENV}oauth.blink.com/`;

async function login(email: string, password: string, twofa = "") {
  const body = new URLSearchParams({
    username: email,
    password,
    grant_type: "password",
    client_id: CLIENT_ID,
    scope: SCOPE,
  });
  const res = await fetch(OAUTH + "oauth/token", {
    method: "POST",
    headers: { "2fa-code": twofa, hardware_id: HARDWARE_ID },
    body,
  });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  return res.json() as Promise<{ access_token: string; refresh_token: string }>;
}

async function getUnwatched(accessToken: string, accountId: string) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const res = await fetch(BASE + `v4/accounts/${accountId}/unwatched_media`, { headers });
  if (!res.ok) throw new Error(`unwatched ${res.status}`);
  return res.json();
}

(async () => {
  const tokens = await login("user@example.com", "pass", "123456");
  const clips = await getUnwatched(tokens.access_token, "YOUR_ACCOUNT_ID");
  console.log(clips);
})();
```

### Local Onboarding (Python)

```python
import requests, json

sm_base = "http://192.168.4.1/"  # sync module AP IP
requests.post(sm_base + "api/set/key", data=b"...encrypted_key...")
requests.post(sm_base + "api/set/ssid", json={"ssid": "HomeWiFi", "password": "secretpass"})
fw = requests.get(sm_base + "api/get_fw_version").json()
print(fw)
```

### Notes for Practical Use

- Replace `{account_id}`, `{network_id}`, `{cameraId}` placeholders with real IDs returned from homescreen/metadata calls.
- Keep both bearer and TOKEN-AUTH headers; some endpoints (shared tier) rely on the latter.
- Respect 401/403/426 handling similar to app: refresh tokens, redirect user, or force upgrade.
- For production, pin hosts to `immedia-semi.com` to match app’s `isBlinkHost` safeguard.
