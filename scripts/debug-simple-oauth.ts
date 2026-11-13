#!/usr/bin/env npx ts-node
/* global process, console, URL, Buffer */
/**
 * Simple OAuth flow debug - step by step, no auto-redirect
 */

import { buildOAuthHeaders, OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI, OAUTH_SCOPE } from '../src/blink-api/headers';
import { getOAuthAuthorizeUrl, getOAuthSigninUrl } from '../src/blink-api/urls';
import { generatePKCEPair } from '../src/blink-api/oauth-pkce';
import * as https from 'https';
import { diagnosticRequest, diagnosticUrl, isDiagnosticCallback } from './oauth-diagnostic-transport';

const email = process.env.BLINK_EMAIL!;
const password = process.env.BLINK_PASSWORD!;
const hardwareId = 'test-device-' + Date.now();

// Cookie storage
let cookieJar: string[] = [];

function mergeCookies(setCookieHeaders: string[] | undefined): void {
  if (!setCookieHeaders) return;
  for (const setCookie of setCookieHeaders) {
    const cookiePart = setCookie.split(';')[0];
    const [name] = cookiePart.split('=');
    if (!name) continue;
    cookieJar = cookieJar.filter(c => !c.startsWith(name.trim() + '='));
    cookieJar.push(cookiePart);
  }
}

function getCookieHeader(): string {
  return cookieJar.join('; ');
}

function extractCsrfToken(html: string): string | null {
  const match = html.match(/<script\s+id="oauth-args"[^>]*type="application\/json"[^>]*>([^<]+)<\/script>/i);
  if (match?.[1]) {
    try {
      const oauthArgs = JSON.parse(match[1]) as { 'csrf-token'?: string };
      return oauthArgs['csrf-token'] ?? null;
    } catch { /* ignore */ }
  }
  return null;
}

function request(url: string, opts: https.RequestOptions, body?: string): Promise<{status: number, location: string | null, cookies: string[], body: string, requestUrl: string}> {
  if (isDiagnosticCallback(url)) {
    return Promise.resolve({ status: 302, location: url, cookies: [], body: '', requestUrl: url });
  }
  return diagnosticRequest(url, opts, body).then(res => ({
    status: res.statusCode, location: res.headers.location || null,
    cookies: res.rawSetCookies, body: res.body, requestUrl: url,
  }));
}

async function main() {
  console.log('🔍 OAuth Flow (Step-by-Step, No Auto-Redirect)');
  console.log('===============================================\n');

  const { codeVerifier, codeChallenge } = generatePKCEPair();
  const baseHeaders = buildOAuthHeaders();

  // Step 1: Hit /authorize
  console.log('📡 Step 1: GET /authorize');
  const authorizeUrl = new URL(getOAuthAuthorizeUrl({}));
  authorizeUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('scope', OAUTH_SCOPE);
  authorizeUrl.searchParams.set('app_brand', 'blink');
  authorizeUrl.searchParams.set('app_version', '50.1');
  authorizeUrl.searchParams.set('device_brand', 'Apple');
  authorizeUrl.searchParams.set('device_model', 'iPhone16,1');
  authorizeUrl.searchParams.set('device_os_version', '26.1');
  authorizeUrl.searchParams.set('hardware_id', hardwareId);

  let res = await request(authorizeUrl.toString(), { method: 'GET', headers: baseHeaders });
  console.log(`  Status: ${res.status}, Cookies: ${res.cookies.length}`);
  mergeCookies(res.cookies);

  // Step 2: If redirected, follow to signin
  if (res.status === 302 && res.location?.includes('/signin')) {
    console.log('\n📡 Step 2: Follow redirect to /signin');
    const signinUrl = diagnosticUrl(res.location, res.requestUrl).toString();

    res = await request(signinUrl, {
      method: 'GET',
      headers: { ...baseHeaders, 'Cookie': getCookieHeader() },
    });
    console.log(`  Status: ${res.status}, Cookies: ${res.cookies.length}`);
    mergeCookies(res.cookies);
  }

  // If ANOTHER redirect, follow it too
  if (res.status === 302 && res.location) {
    console.log('\n📡 Step 2b: Follow another redirect');
    const url = isDiagnosticCallback(res.location) ? res.location : diagnosticUrl(res.location, res.requestUrl).toString();

    res = await request(url, {
      method: 'GET',
      headers: { ...baseHeaders, 'Cookie': getCookieHeader() },
    });
    console.log(`  Status: ${res.status}, Cookies: ${res.cookies.length}`);
    mergeCookies(res.cookies);
  }

  // Now we should have the signin page
  if (res.status !== 200) {
    console.log(`\n❌ Expected 200 at signin page, got ${res.status}`);
    return;
  }

  console.log('\n📡 Step 3: Parse signin page');

  console.log('  Looking for oauth-args script...');
  const oauthArgsMatch = res.body.match(/<script\s+id="oauth-args"[^>]*>([^<]+)<\/script>/i);
  if (oauthArgsMatch) {
    console.log('  Found oauth-args script');
  } else {
    console.log('  ❌ No oauth-args script found');
  }

  const csrfToken = extractCsrfToken(res.body);
  console.log(`  Cookies in jar: ${cookieJar.length}`);

  if (!csrfToken) {
    console.log('❌ No CSRF token found');
    return;
  }

  // Step 4: POST credentials
  console.log('\n📡 Step 4: POST credentials to /signin');
  const signinUrl = getOAuthSigninUrl({});
  const formData = new URLSearchParams({
    username: email,
    password: password,
    'csrf-token': csrfToken,
  }).toString();

  res = await request(signinUrl, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(formData).toString(),
      'Origin': 'https://api.oauth.blink.com',
      'Referer': signinUrl,
      'Cookie': getCookieHeader(),
    },
  }, formData);

  console.log(`  Status: ${res.status}`);
  console.log(`  Cookies: ${res.cookies.length}`);
  mergeCookies(res.cookies);

  if (res.status >= 400 && res.status !== 412) {
    return;
  }

  if (res.status === 412) {
    console.log('\n🔐 2FA Required!');

    // Read 2FA code from stdin
    console.log('\n  Enter 2FA code: ');
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const twoFaCode = await new Promise<string>((resolve) => {
      rl.question('  > ', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });

    console.log(`\n📡 Step 5: Verify 2FA code`);
    const twoFaUrl = 'https://api.oauth.blink.com/oauth/v2/2fa/verify';
    const twoFaFormData = new URLSearchParams({
      '2fa_code': twoFaCode,
      'csrf-token': csrfToken,
      'remember_me': 'false',
    }).toString();

    res = await request(twoFaUrl, {
      method: 'POST',
      headers: {
        ...baseHeaders,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(twoFaFormData).toString(),
        'Origin': 'https://api.oauth.blink.com',
        'Referer': signinUrl,
        'Cookie': getCookieHeader(),
      },
    }, twoFaFormData);

    console.log(`  Status: ${res.status}`);
    console.log(`  Cookies: ${res.cookies.length}`);
    mergeCookies(res.cookies);

    if (res.status >= 400) {
      return;
    }

    if (res.status === 201) {
      console.log('  ✅ 2FA verification successful!');

      // After 2FA, go back to authorize WITHOUT params - session remembers the original request
      console.log('\n📡 Step 6: Get authorization code');
      const bareAuthorizeUrl = 'https://api.oauth.blink.com/oauth/v2/authorize';

      res = await request(bareAuthorizeUrl, {
        method: 'GET',
        headers: { ...baseHeaders, 'Cookie': getCookieHeader() },
      });
      console.log(`  Status: ${res.status}`);

      // Check if the location contains the code (successful redirect to app)
      let codeMatch = (res.location || '').match(/[?&]code=([^&]+)/);

      // If redirected back to signin (not to app callback), try full URL
      if (!codeMatch && res.status === 302 && res.location?.includes('/signin')) {
        console.log('  ⚠️ Redirected back to signin - trying full authorize URL');

        res = await request(authorizeUrl.toString(), {
          method: 'GET',
          headers: { ...baseHeaders, 'Cookie': getCookieHeader() },
        });
        console.log(`  Status: ${res.status}`);
        codeMatch = (res.location || '').match(/[?&]code=([^&]+)/);
      }

      // The redirect should contain the code
      if (codeMatch) {
        const authCode = codeMatch[1];
        console.log('\n🎉 Authorization code received');

        // Step 7: Exchange for token
        console.log('\n📡 Step 7: Exchange code for tokens');
        const tokenData = new URLSearchParams({
          grant_type: 'authorization_code',
          code: authCode,
          code_verifier: codeVerifier,
          client_id: OAUTH_CLIENT_ID,
          redirect_uri: OAUTH_REDIRECT_URI,
          scope: OAUTH_SCOPE,
          hardware_id: hardwareId,
          app_brand: 'blink',
        }).toString();

        res = await request('https://api.oauth.blink.com/oauth/token', {
          method: 'POST',
          headers: {
            ...baseHeaders,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(tokenData).toString(),
          },
        }, tokenData);

        console.log(`  Status: ${res.status}`);

        if (res.status === 200) {
          console.log('\n✅ OAuth flow complete! Tokens received.');
        }
      } else {
        console.log('  ⚠️ No authorization code in redirect');
      }
    }
  }

  // Check for redirect to 2FA or back to authorize
  if ([301, 302, 303].includes(res.status)) {
    console.log('\n✅ Redirect received');

    if (res.location?.includes('2fa') || res.location?.includes('verify')) {
      console.log('🔐 2FA verification needed');
      return;
    }

    // If redirected to authorize, follow to get the code
    if (res.location?.includes('/authorize') || res.location?.includes('code=')) {
      console.log('\n📡 Step 5: Follow redirect to get auth code');
      const url = isDiagnosticCallback(res.location) ? res.location : diagnosticUrl(res.location, res.requestUrl).toString();

      res = await request(url, {
        method: 'GET',
        headers: { ...baseHeaders, 'Cookie': getCookieHeader() },
      });
      console.log(`  Status: ${res.status}`);

      // Extract code from location or body
      const codeMatch = (res.location || '').match(/[?&]code=([^&]+)/);
      if (codeMatch) {
        console.log('\n🎉 Authorization code received');

        // Step 6: Exchange for token
        console.log('\n📡 Step 6: Exchange code for tokens');
        const tokenData = new URLSearchParams({
          grant_type: 'authorization_code',
          code: codeMatch[1],
          code_verifier: codeVerifier,
          client_id: OAUTH_CLIENT_ID,
          redirect_uri: OAUTH_REDIRECT_URI,
          scope: OAUTH_SCOPE,
          hardware_id: hardwareId,
          app_brand: 'blink',
        }).toString();

        res = await request('https://api.oauth.blink.com/oauth/token', {
          method: 'POST',
          headers: {
            ...baseHeaders,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(tokenData).toString(),
          },
        }, tokenData);

        console.log(`  Status: ${res.status}`);
      }
    }
  }
}

main().catch(() => {
  console.error('OAuth diagnostic request failed. Raw errors and response data are withheld.');
  process.exitCode = 1;
});
