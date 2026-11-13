import { redactDiagnosticText, redactDiagnosticUrl } from '../../src/blink-api/redaction';

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
    '{"notification_key":"secret-one","fcm_credentials":"secret-two"}',
    'registration_token=secret-one; security_token=secret-two',
    '{"android_id":"secret-one","installation_auth_token":"secret-two"}',
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

describe('diagnostic URL redaction', () => {
  it('fully redacts OAuth and stable identity parameters while preserving safe query values', () => {
    const hardwareId = 'hardwareIdentifierSecret_4Wd7Kp';
    const email = 'privateAddressSecret_8Fm2Qv@example.com';
    const sanitized = redactDiagnosticUrl(
      `https://user-secret:password-secret@example.com/callback?code=code-secret&state=state-secret&error=error-secret&error_description=description-secret&hardware_id=${hardwareId}&email=${encodeURIComponent(email)}&code_challenge_method=S256&safe=value#fragment-secret`,
    );
    const parsed = new URL(sanitized);

    expect(parsed.searchParams.get('code')).toBe('<redacted>');
    expect(parsed.searchParams.get('state')).toBe('<redacted>');
    expect(parsed.searchParams.get('error')).toBe('<redacted>');
    expect(parsed.searchParams.get('error_description')).toBe('<redacted>');
    expect(parsed.searchParams.get('hardware_id')).toBe('<redacted>');
    expect(parsed.searchParams.get('email')).toBe('<redacted>');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('safe')).toBe('value');
    expect(parsed.username).toBe('');
    expect(parsed.password).toBe('');
    expect(parsed.hash).toBe('');
    expect(sanitized).not.toContain('fragment-secret');
    expect(sanitized).not.toContain('code-secret');
    expect(sanitized).not.toContain('state-secret');
    expect(sanitized).not.toContain('error-secret');
    expect(sanitized).not.toContain('description-secret');
    expect(sanitized).not.toContain(hardwareId);
    expect(sanitized).not.toContain(email);
  });
});
