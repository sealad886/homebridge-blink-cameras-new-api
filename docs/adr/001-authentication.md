# ADR-001: Authentication Flow

## Status

Accepted

## Context

Blink Home Monitor uses OAuth 2.0 authentication with the following characteristics:

1. **Password Grant**: Initial authentication uses username/password with `grant_type=password`
2. **Two-Factor Authentication**: Optional 2FA via `2fa-code` header
3. **Hardware ID**: Requires a `hardware_id` header to identify the client device
4. **Token Refresh**: Supports `refresh_token` grant for token renewal
5. **TOKEN-AUTH Header**: Server returns a special header used for subsequent API calls

The Blink API is undocumented, so all knowledge comes from reverse engineering the Android app.

## Decision

We implement OAuth authentication with the following approach:

### Token Storage

- Access token, refresh token, and expiry are stored in memory
- No persistent storage - tokens are re-obtained on each Homebridge restart
- This avoids complexity of secure credential storage

### Two-Factor Authentication

- 2FA code is provided via the Homebridge config (`twoFactorCode` field)
- Users must manually enter the code received via SMS/email
- The code is used only for initial login; subsequent logins use refresh tokens

### Token Refresh Strategy

- Proactive refresh: tokens are refreshed 1 hour before expiry
- The `ensureValidToken()` method checks expiry before each API call
- If refresh fails, a full re-login is attempted

### Hardware ID

- Users can provide a custom `deviceId` or `deviceName` in config
- Defaults to `'homebridge-blink'` if not specified
- This identifies the Homebridge instance to Blink's servers

### Request Authentication

- The TOKEN-AUTH header from OAuth response is used for all API calls
- Format: `Authorization: Bearer {access_token}` (some endpoints)
- Format: `TOKEN-AUTH: {token_auth}` (most endpoints)

## Consequences

### Positive

- Simple implementation without persistent token storage
- Automatic token refresh minimizes authentication failures
- Clear 2FA flow through config option

### Negative

- Users must handle 2FA manually on first setup
- Credentials are stored in plaintext in Homebridge config
- Token refresh during long polling intervals may cause brief interruptions

### Risks

- Blink may change OAuth flow without notice (API is undocumented)
- Rate limiting on auth endpoints could block re-login attempts
- 2FA codes have limited validity (~10 minutes)

## References

- API Dossier Section 2.1 (OAuth Flow)
- Evidence: `smali_classes9/com/immediasemi/blink/common/account/auth/OauthApi.smali`
