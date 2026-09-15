import { URL } from 'node:url';

const SENSITIVE_DIAGNOSTIC_KEYS = new Set([
  'accesstoken',
  'liveviewtoken',
  'liveview',
  'liveviewurl',
  'thumbnail',
  'thumbnailurl',
  'server',
  'refreshtoken',
  'idtoken',
  'token',
  'tokenauth',
  'authorization',
  'proxyauthorization',
  'cookie',
  'setcookie',
  'password',
  'currentpassword',
  'newpassword',
  'oldpassword',
  'passwordconfirmation',
  'pin',
  'verificationpin',
  '2facode',
  'twofactorcode',
  'mfa',
  'mfacode',
  'otp',
  'verificationcode',
  'clientverificationcode',
  'accountverificationcode',
  'code',
  'authorizationcode',
  'codeverifier',
  'codechallenge',
  'csrf',
  'csrftoken',
  'secret',
  'clientsecret',
  'apikey',
  'state',
  'hardwareid',
  'hardwareuuid',
  'deviceid',
  'deviceidentifier',
  'serial',
  'serialnumber',
  'email',
  'emailaddress',
  'useremail',
  'username',
  'phone',
  'phonenumber',
  'phonelastfour',
  'phonenumberlastfour',
  'mobilenumber',
]);

/**
 * Return whether a diagnostic field name carries a secret or stable user/device
 * identifier and therefore must be fully redacted before logging. Classification
 * is an exact allowlist of sensitive names after punctuation normalization; safe
 * fields such as status_code, error_code, country_code, and codec remain useful.
 */
export function isSensitiveDiagnosticKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_DIAGNOSTIC_KEYS.has(normalized)
    || (normalized.startsWith('x') && SENSITIVE_DIAGNOSTIC_KEYS.has(normalized.slice(1)));
}

/** Remove capability-bearing URL components before diagnostic formatting. */
export function redactDiagnosticUrl(value: string): string {
  try {
    const url = new URL(value);
    if (['immis:', 'rtsp:', 'rtsps:'].includes(url.protocol)) {
      return `${url.protocol}//<redacted>`;
    }
    url.username = '';
    url.password = '';
    url.hash = '';
    for (const key of [...new Set(url.searchParams.keys())]) {
      if (isSensitiveDiagnosticKey(key) || /^(?:error|error_description)$/i.test(key)) {
        url.searchParams.set(key, '<redacted>');
      }
    }
    return url.toString();
  } catch {
    return '<redacted-url>';
  }
}

export function redactDiagnosticText(value: string): string {
  return value
    .replace(/\b(?:https?|immis|rtsps?):\/\/[^\s'"<>]+/gi, redactDiagnosticUrl)
    .replace(/\b((?:x-)?(?:proxy-)?authorization\s*[:=]\s*)[^\r\n]*/gi, '$1<redacted>')
    .replace(/\b((?:set-)?cookie\s*[:=]\s*)[^\r\n]*/gi, '$1<redacted>')
    .replace(/(Bearer\s+)[^\s,;]+/gi, '$1<redacted>')
    .replace(
      /(["']?)([A-Za-z0-9_][A-Za-z0-9_-]*)\1(\s*[=:]\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,;}&]+)/g,
      (match, quote: string, key: string, separator: string, rawValue: string) => {
        if (!isSensitiveDiagnosticKey(key)) {
          return match;
        }
        const valueQuote = rawValue.startsWith('"') ? '"' : rawValue.startsWith("'") ? "'" : '';
        return `${quote}${key}${quote}${separator}${valueQuote}<redacted>${valueQuote}`;
      },
    );
}
