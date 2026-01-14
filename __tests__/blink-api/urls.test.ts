import { getOAuthTokenUrl, getRestBaseUrl, getSharedRestBaseUrl, getSharedRestRootUrl } from '../../src/blink-api/urls';
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

  it('maps OAuth env subdomain for sqa1', () => {
    const config: BlinkConfig = { ...baseConfig, tier: 'sqa1' };
    expect(getOAuthTokenUrl(config)).toBe('https://api.qa.oauth.blink.com/oauth/token');
  });

  it('uses production OAuth base for prod tiers', () => {
    const config: BlinkConfig = { ...baseConfig, tier: 'prod' };
    expect(getOAuthTokenUrl(config)).toBe('https://api.oauth.blink.com/oauth/token');
  });
});
