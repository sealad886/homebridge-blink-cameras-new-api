import { redactDiagnosticText } from '../../src/blink-api/redaction';

describe('diagnostic text redaction', () => {
  it.each([
    'Authorization: Basic secret-one secret-two',
    'Proxy-Authorization=Digest secret-one secret-two',
    'Cookie: session=secret-one; second=secret-two',
    'Set-Cookie: session=secret-one; Path=/secret-two',
    '2fa_code=secret-one; _token=secret-two',
    '{"2fa_code":"secret-one","_token":"secret-two"}',
    "{'2fa_code': 'secret-one', '_token': 'secret-two'}",
    "{'password': 'secret-one with spaces secret-two'}",
    '{"password":"secret-one with \\"quoted\\" secret-two"}',
    'thumbnail available at https://rest-prod.immedia-semi.com/media/secret-one?opaque=secret-two',
    'stream available at https://secret-one.example/secret-two',
  ])('removes complete credential values from %s', value => {
    const result = redactDiagnosticText(value);
    expect(result).not.toContain('secret-one');
    expect(result).not.toContain('secret-two');
    expect(result).toContain('<redacted>');
  });

  it('preserves safe status on the next line after a sensitive header', () => {
    expect(redactDiagnosticText('Cookie: first=secret; second=secret\nStatus: 503'))
      .toBe('Cookie: <redacted>\nStatus: 503');
  });
});
