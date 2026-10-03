#!/usr/bin/env npx ts-node
/* global process, console, URL, Buffer */
/**
 * Full OAuth flow debug script
 * Trying to match blinkpy's session-based approach
 */

import { buildOAuthHeaders, OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI, OAUTH_SCOPE } from '../src/blink-api/headers';
import { getOAuthAuthorizeUrl, getOAuthSigninUrl } from '../src/blink-api/urls';
import { generatePKCEPair } from '../src/blink-api/oauth-pkce';
import * as https from 'https';
import { IncomingMessage } from 'http';
import { diagnosticRequest, diagnosticUrl, isDiagnosticCallback } from './oauth-diagnostic-transport';

const email = process.env.BLINK_EMAIL!;
const password = process.env.BLINK_PASSWORD!;
const hardwareId = 'test-device-debug-' + Math.random().toString(36).substring(7);

// Cookie storage - using raw cookie strings
let cookieJar: string[] = [];

function mergeCookies(setCookieHeaders: string[] | undefined): void {
  if (!setCookieHeaders) return;
  
  for (const setCookie of setCookieHeaders) {
    const cookiePart = setCookie.split(';')[0];
    const [name] = cookiePart.split('=');
    if (!name) continue;
    
    // Remove any existing cookie with same name
    const oldCount = cookieJar.length;
    cookieJar = cookieJar.filter(c => !c.startsWith(name.trim() + '='));
    // Add new cookie
    cookieJar.push(cookiePart);
    
    if (oldCount !== cookieJar.length - 1) {
      console.log(`      🍪 Updated ${'<redacted>'} cookie`);
    }
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
    } catch {
      console.log('  ⚠️ Failed to parse oauth-args JSON');
    }
  }
  return null;
}

// Follow redirects while collecting cookies
async function httpsRequestWithRedirects(url: string, options: https.RequestOptions, body?: string, maxRedirects = 5): Promise<{statusCode: number, headers: IncomingMessage['headers'], body: string, rawSetCookies: string[], finalUrl: string}> {
  let currentUrl = url;
  let allSetCookies: string[] = [];
  
  for (let i = 0; i < maxRedirects; i++) {
    const res = await diagnosticRequest(currentUrl, {
      ...options,
      headers: {
        ...options.headers as Record<string, string>,
        'Cookie': getCookieHeader(),
      },
    }, body);
    
    // Collect cookies from this response
    allSetCookies = [...allSetCookies, ...res.rawSetCookies];
    mergeCookies(res.rawSetCookies);
    
    if (res.rawSetCookies.length > 0) {
      console.log(`    [Redirect ${i}] Got ${res.rawSetCookies.length} cookies`);
    }
    
    // Check if we need to follow a redirect
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
      const location = res.headers.location as string;
      if (isDiagnosticCallback(location)) {
        return { ...res, rawSetCookies: allSetCookies, finalUrl: location };
      }
      currentUrl = diagnosticUrl(location, currentUrl).toString();
      console.log(`    [Redirect ${i}] ${res.statusCode} -> ${'<redacted>'}...`);
      
      // For 303, change to GET
      if (res.statusCode === 303 || ([301, 302].includes(res.statusCode) && options.method === 'POST')) {
        options.method = 'GET';
        body = undefined;
        options = { ...options, headers: { ...options.headers as Record<string, string> } };
        for (const key of Object.keys(options.headers!)) {
          if (['content-length', 'content-type'].includes(key.toLowerCase())) {
            delete (options.headers as Record<string, string>)[key];
          }
        }
      }
      continue;
    }
    
    // No redirect, return the response
    return {
      ...res,
      rawSetCookies: allSetCookies,
      finalUrl: currentUrl,
    };
  }
  
  throw new Error('Too many redirects');
}

async function main() {
  console.log('🔍 Full OAuth Flow Debug (Native HTTPS + Proper Redirects)');
  console.log('===========================================================\n');

  const { codeChallenge } = generatePKCEPair();

  console.log(`📧 Email: ${'<redacted>'}`);
  console.log(`🔑 Hardware ID: ${'<redacted>'}`);
  console.log(`📝 Code Challenge: ${'<redacted>'}`);

  const baseHeaders = buildOAuthHeaders();

  // Step 1: Authorize request (follow redirects)
  console.log('\n📡 Step 1: Authorize Request');
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

  console.log(`  URL: ${'<redacted>'}...`);

  const authorizeRes = await httpsRequestWithRedirects(authorizeUrl.toString(), {
    method: 'GET',
    headers: baseHeaders,
  });

  console.log(`  Final status: ${authorizeRes.statusCode}`);
  console.log(`  Final URL: ${'<redacted>'}...`);
  console.log(`  Total cookies: ${cookieJar.length}`);

  // Step 2: Get signin page (follow redirects)
  console.log('\n📡 Step 2: Get Signin Page');
  const signinUrl = getOAuthSigninUrl({});
  console.log(`  URL: ${'<redacted>'}`);

  const signinPageRes = await httpsRequestWithRedirects(signinUrl, {
    method: 'GET',
    headers: baseHeaders,
  });

  console.log(`  Final status: ${signinPageRes.statusCode}`);
  console.log(`  Total cookies: ${cookieJar.length}`);

  const csrfToken = extractCsrfToken(signinPageRes.body);
  console.log(`  CSRF Token: ${'<redacted>'}...`);

  if (!csrfToken) {
    console.error('❌ Failed to extract CSRF token');
    console.log('  HTML snippet:', '<redacted>');
    return;
  }

  // Step 3: Submit credentials (follow redirects)
  console.log('\n📡 Step 3: Submit Credentials');
  const formData = new URLSearchParams({
    username: email,
    password: password,
    'csrf-token': csrfToken,
  }).toString();

  console.log(`  Cookie count: ${cookieJar.length}`);

  const signinRes = await httpsRequestWithRedirects(signinUrl, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(formData).toString(),
      'Origin': 'https://api.oauth.blink.com',
      'Referer': signinUrl,
    },
  }, formData);

  console.log(`  Final status: ${signinRes.statusCode}`);
  console.log(`  Final URL: ${'<redacted>'}`);

  if (signinRes.statusCode >= 400) {
    console.log(`  Body: ${'<redacted>'}`);
    return;
  }

  // Check if we got redirected to 2FA
  if (signinRes.finalUrl.includes('2fa') || signinRes.finalUrl.includes('verify')) {
    console.log('\n🔐 2FA Required! Redirected to verification page.');
    return;
  }

  // Check if the auth code is in the final URL (native app redirect)
  const codeMatch = signinRes.finalUrl.match(/[?&]code=([^&]+)/);
  if (codeMatch) {
    console.log(`\n🎉 Authorization Code: ${'<redacted>'}...`);
    return;
  }

  // Maybe we're on a success page and need to go back to authorize
  console.log('\n📡 Step 4: Re-requesting authorization (to get code)');
  const authCodeRes = await httpsRequestWithRedirects(authorizeUrl.toString(), {
    method: 'GET',
    headers: baseHeaders,
  });
  
  console.log(`  Final status: ${authCodeRes.statusCode}`);
  console.log(`  Final URL: ${'<redacted>'}`);

  const codeMatch2 = authCodeRes.finalUrl.match(/[?&]code=([^&]+)/);
  if (codeMatch2) {
    console.log(`\n🎉 Authorization Code: ${'<redacted>'}...`);
    return;
  }

  console.log('\n⚠️ Flow completed but no auth code found');
  console.log(`  Body snippet: ${'<redacted>'}`);
}

main().catch(() => {
  console.error('OAuth diagnostic request failed. Raw errors and response data are withheld.');
  process.exitCode = 1;
});
