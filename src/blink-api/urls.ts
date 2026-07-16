/**
 * Blink API URL Builders
 *
 * Source: API Dossier Section 1.1 (Primary API Endpoints)
 * Evidence: smali_classes9/com/immediasemi/blink/core/api/BaseUrls.smali
 */

import { BlinkConfig } from '../types';

const DEFAULT_TIER = 'prod';
type OAuthTierConfig = Pick<BlinkConfig, 'tier'>;
const TIER_PATTERN = /^[A-Za-z0-9]{4}$/;

const normalizeBase = (base: string): string => (base.endsWith('/') ? base : `${base}/`);

/**
 * Resolve tier identifier from configuration
 * Source: Blink Android 57.1 TierRepository.isTierValid
 * Evidence: TierRepository.java uses Regex("[a-zA-Z\\d]{4}")
 */
export const normalizeBlinkTier = (tier?: string | null): string | null => {
  const normalized = tier?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (!TIER_PATTERN.test(normalized)) {
    throw new Error('Invalid Blink tier.');
  }

  return normalized;
};

const resolveTier = (tier?: string): string => normalizeBlinkTier(tier) ?? DEFAULT_TIER;

const resolveSharedTier = (tier?: string, sharedTier?: string): string => {
  return resolveTier(sharedTier ?? tier);
};

/**
 * Build REST API base URL
 * Source: API Dossier Section 1.1 - REST API pattern: https://rest-{tier}.immedia-semi.com/api/
 * Evidence: smali_classes9/com/immediasemi/blink/core/api/BaseUrls.smali
 */
export const getRestBaseUrl = (config: BlinkConfig): string => {
  const tier = resolveTier(config.tier);
  return normalizeBase(`https://rest-${tier}.immedia-semi.com/api/`);
};

/**
 * Build shared REST API base URL
 * Source: API Dossier Section 1.1 - shared REST base: https://rest-{shared_tier}.immedia-semi.com/api/
 */
export const getSharedRestBaseUrl = (config: BlinkConfig): string => {
  const sharedTier = resolveSharedTier(config.tier, config.sharedTier);
  return normalizeBase(`https://rest-${sharedTier}.immedia-semi.com/api/`);
};

/**
 * Build REST root URL (without /api) for resource URLs like thumbnails
 */
export const getRestRootUrl = (config: BlinkConfig): string => {
  const tier = resolveTier(config.tier);
  return normalizeBase(`https://rest-${tier}.immedia-semi.com/`);
};

/**
 * Build shared REST root URL (without /api)
 */
export const getSharedRestRootUrl = (config: BlinkConfig): string => {
  const sharedTier = resolveSharedTier(config.tier, config.sharedTier);
  return normalizeBase(`https://rest-${sharedTier}.immedia-semi.com/`);
};

/**
 * Build OAuth base URL
 * Source: Blink Android 57.1 BaseUrls.OAUTH and TierRepository.getEnvSubdomain
 * Evidence: production uses an empty subdomain; sqa1 uses staging "qa."
 */
const getOAuthBaseUrl = (config: OAuthTierConfig): string => {
  const tier = resolveTier(config.tier);
  const envSubdomain = tier === 'sqa1' ? 'qa.' : '';
  return normalizeBase(`https://api.${envSubdomain}oauth.blink.com/`);
};

/**
 * Build OAuth token endpoint URL
 * Source: blinkpy - OAUTH_TOKEN_URL = f"https://{OAUTH_HOST}/oauth/token"
 * Evidence: Used for both authorization_code and refresh_token grants
 */
export const getOAuthTokenUrl = (config: OAuthTierConfig): string => {
  return `${getOAuthBaseUrl(config)}oauth/token`;
};

/**
 * Build OAuth v2 authorize endpoint URL
 * Source: blinkpy - OAUTH_AUTHORIZE_URL = f"https://{OAUTH_HOST}/oauth/v2/authorize"
 * Evidence: Initiates Authorization Code + PKCE flow
 */
export const getOAuthAuthorizeUrl = (config: OAuthTierConfig): string => {
  return `${getOAuthBaseUrl(config)}oauth/v2/authorize`;
};

/**
 * Build OAuth v2 signin page URL
 * Source: blinkpy - OAUTH_SIGNIN_URL = f"https://{OAUTH_HOST}/oauth/v2/signin"
 * Evidence: Web-based credential submission with CSRF token
 */
export const getOAuthSigninUrl = (config: OAuthTierConfig): string => {
  return `${getOAuthBaseUrl(config)}oauth/v2/signin`;
};

/**
 * Build OAuth v2 2FA verification URL
 * Source: blinkpy - OAUTH_2FA_VERIFY_URL = f"https://{OAUTH_HOST}/oauth/v2/2fa/verify"
 * Evidence: Used when 2FA PIN is required
 */
export const getOAuth2FAVerifyUrl = (config: OAuthTierConfig): string => {
  return `${getOAuthBaseUrl(config)}oauth/v2/2fa/verify`;
};
