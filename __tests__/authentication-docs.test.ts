import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readText = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), 'utf8');

describe('authentication documentation', () => {
  it('documents hosted Blink OAuth without obsolete credential-flow guidance', () => {
    const docs = [
      readText('README.md'),
      readText('docs/adr/001-authentication.md'),
      readText('docs/integration_checklist.md'),
    ].join('\n');

    expect(docs).toContain('Paste Blink Result and Finish');
    expect(docs).toContain('https://applinks.blink.com/signin/callback');
    expect(docs).toContain('oauthClientId');
    expect(docs).not.toMatch(/password grant/i);
    expect(docs).not.toMatch(/enter your Blink password (?:in|into) Homebridge/i);
    expect(docs).not.toMatch(/Homebridge.*OAuth MFA code/i);
  });
});
