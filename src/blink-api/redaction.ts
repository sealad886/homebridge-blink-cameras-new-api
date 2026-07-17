const SENSITIVE_DIAGNOSTIC_KEYS = new Set([
  'accesstoken',
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
