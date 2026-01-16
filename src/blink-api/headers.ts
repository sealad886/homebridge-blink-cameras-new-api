/**
 * Standard Blink headers shared across OAuth + REST requests.
 * Mirrors Android HeadersInterceptor behavior.
 */

export const APP_VERSION = '51.0';
export const APP_BUILD = '29426569';
export const APP_BUILD_HEADER = `ANDROID_${APP_BUILD}`;
export const USER_AGENT = `Blink/${APP_VERSION} (NodeJS; Homebridge)`;
export const DEFAULT_LOCALE = 'en_US';

export const buildDefaultHeaders = (): Record<string, string> => ({
  'APP-BUILD': APP_BUILD_HEADER,
  'User-Agent': USER_AGENT,
  LOCALE: DEFAULT_LOCALE,
  'X-Blink-Time-Zone': Intl.DateTimeFormat().resolvedOptions().timeZone,
});
