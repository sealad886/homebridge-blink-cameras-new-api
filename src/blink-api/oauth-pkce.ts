/**
 * OAuth 2.0 PKCE (Proof Key for Code Exchange) Utilities
 *
 * Implements RFC 7636 PKCE for secure OAuth authorization code flow.
 * Used by Blink's iOS OAuth v2 authentication.
 *
 * Source: blinkpy/auth.py - generate_pkce_pair()
 * Evidence: OAuth 2.0 Authorization Code Flow with PKCE is the new Blink standard
 */

import * as crypto from 'node:crypto';

/**
 * Generate a cryptographically random code verifier for PKCE
 *
 * RFC 7636 Section 4.1:
 * - code_verifier = high-entropy cryptographic random string
 * - Using unreserved characters [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 * - Minimum length: 43 characters, Maximum: 128 characters
 *
 * @returns Base64URL-encoded random string (43 characters)
 */
export function generateCodeVerifier(): string {
  // Generate 32 random bytes (256 bits of entropy)
  const randomBytes = crypto.randomBytes(32);
  // Convert to base64url (RFC 4648 Section 5)
  return randomBytes.toString('base64url');
}

/**
 * Generate code challenge from code verifier using S256 method
 *
 * RFC 7636 Section 4.2:
 * code_challenge = BASE64URL(SHA256(code_verifier))
 *
 * @param codeVerifier - The code verifier string
 * @returns Base64URL-encoded SHA256 hash of the verifier
 */
export function generateCodeChallenge(codeVerifier: string): string {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return hash.toString('base64url');
}

/**
 * Generate a PKCE code verifier and challenge pair
 *
 * @returns Object containing code_verifier and code_challenge
 */
export function generatePKCEPair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge };
}

/**
 * Generate a random state parameter for OAuth flow
 * Used to prevent CSRF attacks
 *
 * @returns Base64URL-encoded random string
 */
export function generateOAuthState(): string {
  return crypto.randomBytes(16).toString('base64url');
}
