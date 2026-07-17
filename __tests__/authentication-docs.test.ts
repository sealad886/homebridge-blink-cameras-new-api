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
  expect(doc).toMatch(/matched-egress/i);
  expect(doc).toMatch(/no token exchange occurred/i);
  expect(doc).toMatch(/operationally\s+inconclusive/i);
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
    const checklist = readText('docs/integration_checklist.md');
    const changelog = readText('CHANGELOG.md');
    const corpus = [readme, adr, dossier, checklist, changelog].join('\n');

    expectProductionOAuthTargets(readme);
    expectProductionOAuthTargets(adr);
    expectProductionOAuthTargets(dossier);
    expectProductionOAuthTargets(checklist);

    expectManufacturerRouting(readme);
    expectManufacturerRouting(adr);
    expectManufacturerRouting(dossier);
    expectManufacturerRouting(checklist);
    expectManufacturerRouting(changelog);

    expectBoundedLiveEvidence(readme);
    expectBoundedLiveEvidence(adr);
    expectBoundedLiveEvidence(dossier);
    expectBoundedLiveEvidence(checklist);
    expectBoundedLiveEvidence(changelog);

    expect(corpus).not.toMatch(
      /non-EU accounts (?:are|were|have been) live-(?:validated|tested)/i,
    );
    expect(corpus).not.toContain('reserved for Task 8');
    expect(corpus).not.toContain('acceptance remains Task 8');
    expect(corpus).not.toContain('resolver-compatible `amazon` identities');
  });
});
