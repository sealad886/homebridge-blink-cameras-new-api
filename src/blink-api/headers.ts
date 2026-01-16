/**
 * Standard Blink headers shared across OAuth + REST requests.
 * Mirrors Android HeadersInterceptor behavior for REST API,
 * and iOS Safari for OAuth v2 flow.
 *
 * REST API User-Agent MUST match Android app format per APK evidence E7:
 *   Blink/VERSION (MANUFACTURER MODEL; Android OS_VERSION)
 *
 * OAuth v2 flow uses iOS client credentials and Safari User-Agent
 * Source: blinkpy/helpers/constants.py
 */

// Android client constants (for REST API)
export const APP_VERSION = '51.0';
export const APP_BUILD = '29426569';
export const APP_BUILD_HEADER = `ANDROID_${APP_BUILD}`;
export const USER_AGENT = `Blink/${APP_VERSION} (samsung SM-G998B; Android 14)`;
export const DEFAULT_LOCALE = 'en_US';

// iOS OAuth v2 client constants
// Source: blinkpy - OAUTH_V2_CLIENT_ID = "ios"
export const OAUTH_CLIENT_ID = 'ios';

// Source: blinkpy - OAUTH_REDIRECT_URI
export const OAUTH_REDIRECT_URI = 'immedia-blink://applinks.blink.com/signin/callback';

// iOS Safari User-Agent for OAuth v2 web flow
// Source: blinkpy - OAUTH_USER_AGENT (mimics iOS Safari)
export const OAUTH_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1';

// OAuth v2 scope
// Source: blinkpy - OAUTH_SCOPE (note: for v2 flow, blinkpy still uses "client")
export const OAUTH_SCOPE = 'client';

/**
 * Build default headers for REST API requests
 * Uses Android client identity
 */
export const buildDefaultHeaders = (): Record<string, string> => ({
  'APP-BUILD': APP_BUILD_HEADER,
  'User-Agent': USER_AGENT,
  LOCALE: DEFAULT_LOCALE,
  'X-Blink-Time-Zone': Intl.DateTimeFormat().resolvedOptions().timeZone,
});

/**
 * Build headers for OAuth v2 web flow requests
 * Uses iOS Safari identity (required for OAuth v2)
 */
export const buildOAuthHeaders = (): Record<string, string> => ({
  'User-Agent': OAUTH_USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
});
