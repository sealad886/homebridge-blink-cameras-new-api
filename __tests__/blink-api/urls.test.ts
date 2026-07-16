import {
  getOAuthAuthorizeUrl,
  getOAuthTokenUrl,
  getRestBaseUrl,
  getSharedRestBaseUrl,
  getSharedRestRootUrl,
} from '../../src/blink-api/urls';
import { BlinkConfig } from '../../src/types';

describe('Blink API URL builders', () => {
  const baseConfig: BlinkConfig = {
    email: 'user@example.com',
    password: 'password',
    hardwareId: 'hw-id',
  };

  it('defaults to prod tier for REST base', () => {
    expect(getRestBaseUrl(baseConfig)).toBe('https://rest-prod.immedia-semi.com/api/');
  });

  it('uses sharedTier override for shared REST base', () => {
    const config: BlinkConfig = { ...baseConfig, tier: 'prod', sharedTier: 'prde' };
    expect(getSharedRestBaseUrl(config)).toBe('https://rest-prde.immedia-semi.com/api/');
    expect(getSharedRestRootUrl(config)).toBe('https://rest-prde.immedia-semi.com/');
  });

  it('falls back to tier when sharedTier is not set', () => {
    const config: BlinkConfig = { ...baseConfig, tier: 'prsg' };
    expect(getSharedRestBaseUrl(config)).toBe('https://rest-prsg.immedia-semi.com/api/');
  });

  // ProductionTier explicitly defines prod/prde/prsg/a001/cemp/srf1. The
  // numbered e001-e006 targets are best-effort routing cases accepted by
  // TierRepository's four-alphanumeric-character regex, not live validation.
  it.each([
    ['prod', 'https://rest-prod.immedia-semi.com/api/'],
    ['prde', 'https://rest-prde.immedia-semi.com/api/'],
    ['prsg', 'https://rest-prsg.immedia-semi.com/api/'],
    ['a001', 'https://rest-a001.immedia-semi.com/api/'],
    ['cemp', 'https://rest-cemp.immedia-semi.com/api/'],
    ['srf1', 'https://rest-srf1.immedia-semi.com/api/'],
    ['e001', 'https://rest-e001.immedia-semi.com/api/'],
    ['e002', 'https://rest-e002.immedia-semi.com/api/'],
    ['e003', 'https://rest-e003.immedia-semi.com/api/'],
    ['e004', 'https://rest-e004.immedia-semi.com/api/'],
    ['e005', 'https://rest-e005.immedia-semi.com/api/'],
    ['e006', 'https://rest-e006.immedia-semi.com/api/'],
  ])('routes APK-accepted tier %s to %s', (tier, expected) => {
    expect(getRestBaseUrl({ ...baseConfig, tier })).toBe(expected);
  });

  it.each([
    ['prod', 'https://api.oauth.blink.com/oauth/token'],
    ['prde', 'https://api.oauth.blink.com/oauth/token'],
    ['prsg', 'https://api.oauth.blink.com/oauth/token'],
    ['a001', 'https://api.oauth.blink.com/oauth/token'],
    ['cemp', 'https://api.oauth.blink.com/oauth/token'],
    ['srf1', 'https://api.oauth.blink.com/oauth/token'],
    ['e001', 'https://api.oauth.blink.com/oauth/token'],
    ['e002', 'https://api.oauth.blink.com/oauth/token'],
    ['e003', 'https://api.oauth.blink.com/oauth/token'],
    ['e004', 'https://api.oauth.blink.com/oauth/token'],
    ['e005', 'https://api.oauth.blink.com/oauth/token'],
    ['e006', 'https://api.oauth.blink.com/oauth/token'],
    ['sqa1', 'https://api.qa.oauth.blink.com/oauth/token'],
  ])('maps APK tier %s to OAuth endpoint %s', (tier, expected) => {
    const config: BlinkConfig = { ...baseConfig, tier };

    expect(getOAuthTokenUrl(config)).toBe(expected);
    expect(getOAuthAuthorizeUrl(config)).toBe(expected.replace('/oauth/token', '/oauth/v2/authorize'));
  });

  it.each([
    'prod.evil.example',
    '../x',
    'e01',
    'abcde',
    'pr_de',
  ])('rejects unsafe tier value %s before forming a host', (tier) => {
    expect(() => getRestBaseUrl({ ...baseConfig, tier })).toThrow('Invalid Blink tier');
    expect(() => getSharedRestBaseUrl({ ...baseConfig, sharedTier: tier })).toThrow('Invalid Blink tier');
  });
});
