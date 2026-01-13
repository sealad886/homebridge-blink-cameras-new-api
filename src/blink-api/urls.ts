/**
 * Blink API URL Builders
 *
 * Source: API Dossier Section 1.1 (Primary API Endpoints)
 * Evidence: smali_classes9/com/immediasemi/blink/core/api/BaseUrls.smali
 */

import { BlinkConfig } from '../types';

const DEFAULT_TIER = 'prod';

const normalizeBase = (base: string): string => (base.endsWith('/') ? base : `${base}/`);

/**
 * Resolve tier identifier from configuration
 * Source: API Dossier Section 1.2 - {tier} token placeholder
 * Evidence: smali_classes9/com/immediasemi/blink/core/api/RestApiKt.smali
 */
const resolveTier = (tier?: string): string => {
  if (!tier) {
    return DEFAULT_TIER;
  }

  const normalized = tier.toLowerCase();
  if (['prod', 'sqa1', 'cemp'].includes(normalized)) {
    return normalized;
  }

  return DEFAULT_TIER;
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
 * Build OAuth token endpoint URL
 * Source: API Dossier Section 1.1 - OAuth API: https://api.{env}oauth.blink.com/
 * Source: API Dossier Section 2.1 - POST oauth/token endpoint
 * Evidence: smali_classes9/com/immediasemi/blink/common/account/auth/OauthApi.smali
 */
export const getOAuthTokenUrl = (config: BlinkConfig): string => {
  const tier = resolveTier(config.tier);
  const env = tier === 'sqa1' ? 'stg' : 'pd';
  const base = normalizeBase(`https://api.${env}oauth.blink.com/`);
  return `${base}oauth/token`;
};
