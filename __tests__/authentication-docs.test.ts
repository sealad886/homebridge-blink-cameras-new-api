import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readText = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), 'utf8');

const expectProductionOAuthTargets = (doc: string): void => {
  expect(doc).toMatch(/same production OAuth host/i);
  expect(doc).toContain('https://api.oauth.blink.com/oauth/v2/authorize');
  expect(doc).toContain('https://api.oauth.blink.com/oauth/token');
};

const expectManufacturerRouting = (doc: string): void => {
  expect(doc).toContain('Build.MANUFACTURER');
  expect(doc).toMatch(/manufacturer gate/i);
  expect(doc).toContain('client_id=amazon');
  expect(doc).toContain('client_id=android');
};

const expectBoundedLiveEvidence = (doc: string): void => {
  expect(doc).toMatch(/EU\/Ireland/i);
  expect(doc).toMatch(/non-EU accounts are not\s+live-validated/i);
  expect(doc).toMatch(/(?:native|Android)\s+AppAuth/i);
  expect(doc).toMatch(/Android-profile/i);
  expect(doc).toMatch(/fresh packaged[\s\S]{0,240}(?:remains open|still requires)/i);
};

describe('authentication documentation', () => {
  it('documents hosted Blink OAuth without obsolete credential-flow guidance', () => {
    const readme = readText('README.md');
    const adr = readText('docs/adr/001-authentication.md');
    const checklist = readText('docs/integration_checklist.md');
    const docs = [readme, adr, checklist].join('\n');

    expect(docs).toContain('Paste Blink Result and Finish');
    expect(docs).toContain('https://applinks.blink.com/signin/callback');
    expect(docs).toContain('oauthClientId');
    expect(readme).toMatch(/clipboard cleanup after completion is best effort/i);
    expect(adr).toMatch(/clipboard cleanup\s+is best effort/i);
    expect(docs).not.toMatch(/password grant/i);
    expect(docs).not.toMatch(/enter your Blink password (?:in|into) Homebridge/i);
    expect(docs).not.toMatch(/Homebridge.*OAuth MFA code/i);
  });

  it('separates APK routing evidence from bounded live-account evidence', () => {
    const readme = readText('README.md');
    const adr = readText('docs/adr/001-authentication.md');
    const dossier = readText('docs/blink_api_dossier.md');
    const apiMap = readText('blink_api_map.md');
    const checklist = readText('docs/integration_checklist.md');
    const changelog = readText('CHANGELOG.md');
    const corpus = [readme, adr, dossier, apiMap, checklist, changelog].join('\n');

    expectProductionOAuthTargets(readme);
    expectProductionOAuthTargets(adr);
    expectProductionOAuthTargets(dossier);
    expectProductionOAuthTargets(apiMap);
    expectProductionOAuthTargets(checklist);

    expectManufacturerRouting(readme);
    expectManufacturerRouting(adr);
    expectManufacturerRouting(dossier);
    expectManufacturerRouting(checklist);
    expectManufacturerRouting(changelog);

    expectBoundedLiveEvidence(readme);
    expectBoundedLiveEvidence(adr);
    expectBoundedLiveEvidence(dossier);
    expectBoundedLiveEvidence(apiMap);
    expectBoundedLiveEvidence(checklist);
    expectBoundedLiveEvidence(changelog);

    expect(corpus).not.toMatch(
      /non-EU accounts (?:are|were|have been) live-(?:validated|tested)/i,
    );
    expect(corpus).not.toContain('reserved for Task 8');
    expect(corpus).not.toContain('acceptance remains Task 8');
    expect(corpus).not.toContain('resolver-compatible `amazon` identities');
    expect(corpus).not.toMatch(/matched-egress/i);
    expect(corpus).not.toMatch(/operationally\s+inconclusive/i);
  });

  it('documents APK-grounded regional bootstrap without a universal prod claim', () => {
    const readme = readText('README.md');
    const adr = readText('docs/adr/001-authentication.md');
    const dossier = readText('docs/blink_api_dossier.md');
    const apiMap = readText('blink_api_map.md');
    const docs = [readme, adr, dossier, apiMap].join('\n');

    expect(docs).toMatch(/OAuth (?:token )?response[s]?[^.]*no account region or tier/i);
    for (const tier of ['prod', 'prde', 'prsg', 'a001']) {
      expect(docs).toContain(`\`${tier}\``);
    }
    expect(docs).toMatch(/HTTP 406/i);
    expect(docs).toMatch(/`cemp`[^.]*regression/i);
    expect(docs).toMatch(/`srf1`[^.]*refurbishment/i);
    expect(docs).toMatch(/explicit(?:ly configured)? safe tier[\s\S]{0,180}single-target bootstrap/i);
    expect(docs).not.toMatch(/(?:always|universally) (?:uses|starts from) `?rest-prod/i);
  });

  it('keeps the documented post-token workflow aligned with APK persistence and auth headers', () => {
    const readme = readText('README.md');
    const adr = readText('docs/adr/001-authentication.md');
    const dossier = readText('docs/blink_api_dossier.md');
    const apiMap = readText('blink_api_map.md');

    expect(dossier).toContain('TierInfo persistence writes account_id, then tier');
    expect(dossier).toMatch(/setTierInfo[\s\S]*immediately persists\s+both `account_id` and `tier`/i);
    expect(dossier).not.toContain('TierInfo persistence writes account_id only');
    expect(dossier).toMatch(/adds `TOKEN-AUTH` only when registration-token state exists/i);
    expect(dossier).not.toContain('Bearer + TOKEN-AUTH');

    expect(adr).toMatch(/Shared REST\s+defaults to the same discovered tier/i);
    expect(adr).toMatch(/`sharedTier` is only an\s+advanced manual\s+override/i);
    expect(adr).toMatch(/hidden,\s+deprecated manual fallback/i);

    expect(readme).toMatch(/Keep `deviceId` stable/i);
    expect(readme).not.toMatch(/Regenerate a unique `deviceId`/i);

    expect(apiMap).toMatch(/current sign-in path is AppAuth authorization-code flow/i);
    expect(apiMap).toMatch(/direct credential-shaped[\s\S]{0,160}alternate\/legacy evidence/i);
    expect(apiMap).toMatch(/adds `TOKEN-AUTH` only when\s+registration-token state\s+exists/i);
    expect(apiMap).not.toMatch(/### Login Flow[\s\S]{0,400}grant_type[^\n]*password/i);
  });
});
