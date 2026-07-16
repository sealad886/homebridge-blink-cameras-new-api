# ADR-001: Authentication Flow

## Status

Accepted; revalidated against Blink Android 57.1 on 2026-07-16.

## Context

Blink's current Android login is OAuth 2.0 authorization-code flow with PKCE. `LoginFragment` opens hosted `/oauth/v2/authorize`; Blink's UI handles passwords, MFA, passkeys, and other challenges. AppAuth exchanges the callback code at `/oauth/token`, stores access and refresh tokens securely, then the app fetches `v1/users/tier_info`.

The APK retains an `OauthApi.postLogin()` password-grant declaration, but no current interactive-login callsite was traced. `TOKEN-AUTH` is also not an OAuth response token: it is an optional registration token used during account creation/upgrade.

## Decision

- Use authorization-code + PKCE for interactive authentication.
- Keep credentials and verification challenges inside hosted Blink sign-in.
- Persist access and refresh tokens in the owner-only Homebridge auth file; never persist the user's password after successful custom-UI sign-in.
- Exchange the code, store tokens, then fetch and persist `tier_info` before normal regional REST work.
- Refresh through `grant_type=refresh_token`; replace both tokens on success and retry the failed request at most once.
- Attach bearer credentials only after exact-domain/subdomain-suffix allowlisting. Explicitly exclude OAuth hosts.
- Send `TOKEN-AUTH` only when a registration token exists; do not derive it from OAuth token responses.
- On logout, revoke the client session when possible, then clear local authentication state.

## Consequences

- Users complete password, MFA, and passkey steps in Blink-controlled UI rather than Homebridge configuration fields.
- Restart authentication can use persisted refresh tokens without storing plaintext credentials.
- Tier discovery remains part of login completion, so non-EU and EU accounts share one routing workflow.
- Refresh and host checks must prevent loops and credential leakage.

## Evidence

- `com/ring/android/unifiedsignin/UnifiedSignInUtils.java`
- `net/openid/appauth/AuthorizationRequest.java`
- `com/immediasemi/blink/common/account/auth/AuthorizationRepository.java`
- `com/immediasemi/blink/account/auth/LoginViewModel.java`
- `com/immediasemi/blink/common/account/auth/CredentialRepository.java`
- `com/immediasemi/blink/common/account/auth/RefreshTokensUseCase.java`
- `com/immediasemi/blink/network/BlinkAuthInterceptor.java`
- `com/immediasemi/blink/network/BlinkAuthenticator.java`
- `com/immediasemi/blink/core/api/AuthorizationHelper.java`
- `com/immediasemi/blink/common/account/auth/LogoutUseCase.java`

See `docs/blink_api_dossier.md` evidence E93-E95 for traced details.
