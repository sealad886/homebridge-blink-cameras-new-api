import type {
  BlinkHostedOAuthTransaction,
  BlinkOAuthClientId,
} from '../types';
import { URL } from 'node:url';
import { getOAuthAuthorizeUrl } from './urls';

export const HOSTED_ANDROID_OAUTH_PROFILE = Object.freeze({
  clientId: 'android' as const,
  redirectUri: 'https://applinks.blink.com/signin/callback' as const,
  scope: 'client',
  refreshIncludesScope: true,
});

export const LEGACY_IOS_OAUTH_PROFILE = Object.freeze({
  clientId: 'ios' as const,
  redirectUri: 'immedia-blink://applinks.blink.com/signin/callback',
  scope: 'client',
  refreshIncludesScope: false,
});

export type BlinkOAuthProfile =
  | typeof HOSTED_ANDROID_OAUTH_PROFILE
  | typeof LEGACY_IOS_OAUTH_PROFILE;

/**
 * Resolve persisted OAuth identity without changing the legacy refresh contract.
 * Older state has no client identifier and therefore remains on iOS defaults.
 */
export function resolveOAuthProfile(
  clientId?: BlinkOAuthClientId | null,
): BlinkOAuthProfile {
  return clientId === 'android'
    ? HOSTED_ANDROID_OAUTH_PROFILE
    : LEGACY_IOS_OAUTH_PROFILE;
}

/**
 * Build the Android 57.1 UnifiedSignInUtils authorization request.
 */
export function buildHostedAuthorizationUrl(
  transaction: BlinkHostedOAuthTransaction,
  tier?: string,
): string {
  const url = new URL(getOAuthAuthorizeUrl({ tier }));
  const fields: ReadonlyArray<readonly [string, string]> = [
    ['client_id', HOSTED_ANDROID_OAUTH_PROFILE.clientId],
    ['redirect_uri', HOSTED_ANDROID_OAUTH_PROFILE.redirectUri],
    ['response_type', 'code'],
    ['scope', HOSTED_ANDROID_OAUTH_PROFILE.scope],
    ['state', transaction.state],
    ['code_challenge', transaction.codeChallenge],
    ['code_challenge_method', 'S256'],
    ['prompt', 'login'],
    ['hardware_id', transaction.hardwareId],
    ['app_brand', 'blink'],
    ['app_version', 'Version 57.1'],
    ['device_brand', 'Raspberry Pi'],
    ['device_model', 'Homebridge'],
    ['device_os_version', 'Android 14'],
    ['dark_mode', 'false'],
  ];

  for (const [name, value] of fields) {
    url.searchParams.set(name, value);
  }
  return url.toString();
}

/**
 * Build the profile-specific refresh form. Hosted Android requires scope;
 * legacy iOS refresh deliberately omits it.
 */
export function buildRefreshForm(
  clientId: BlinkOAuthClientId | null | undefined,
  refreshToken: string,
): URLSearchParams {
  const profile = resolveOAuthProfile(clientId);
  const form = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    client_id: profile.clientId,
  });
  if (profile.refreshIncludesScope) {
    form.set('scope', profile.scope);
  }
  return form;
}
