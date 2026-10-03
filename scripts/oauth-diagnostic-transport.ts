import * as https from 'node:https';
import { IncomingHttpHeaders } from 'node:http';
import { OAUTH_REDIRECT_URI } from '../src/blink-api/headers';
import { RESPONSE_BODY_LIMITS } from '../src/blink-api/response-body';

const ORIGIN = 'https://api.oauth.blink.com';
const DEADLINE_MS = 15_000;
const failure = () => new Error('OAuth diagnostic transport failed');

export function diagnosticUrl(input: string, base = ORIGIN): URL {
  let url: URL;
  try { url = new URL(input, base); } catch { throw failure(); }
  if (url.origin !== ORIGIN || url.username || url.password) throw failure();
  return url;
}

export function isDiagnosticCallback(input: string): boolean {
  try {
    const url = new URL(input);
    const callback = new URL(OAUTH_REDIRECT_URI);
    return url.protocol === callback.protocol && url.host === callback.host &&
      url.pathname === callback.pathname && !url.username && !url.password;
  } catch { return false; }
}

export interface DiagnosticResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: string;
  rawSetCookies: string[];
}

/** Only fixed OAuth HTTPS origin may receive credentials or cookies. */
export function diagnosticRequest(input: string, options: https.RequestOptions, body?: string): Promise<DiagnosticResponse> {
  const url = diagnosticUrl(input);
  return new Promise<DiagnosticResponse>((resolve, reject) => {
    let settled = false;
    let bytes = 0;
    const chunks: Buffer[] = [];
    const finish = (error?: Error, result?: DiagnosticResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(failure()); else resolve(result!);
    };
    const req = https.request({
      protocol: 'https:', hostname: url.hostname, port: 443,
      path: url.pathname + url.search, method: options.method,
      headers: options.headers, rejectUnauthorized: true, agent: false,
    }, res => {
      const contentType = String(res.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
      const isJson = contentType === 'application/json' || contentType.endsWith('+json');
      const limit = RESPONSE_BODY_LIMITS[
        isJson || (res.statusCode || 0) >= 400 || url.pathname === '/oauth/token'
          ? 'oauth-json' : 'oauth-html'
      ];
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > limit) { finish(failure()); res.destroy(); req.destroy(); return; }
        chunks.push(Buffer.from(chunk));
      });
      res.on('error', () => finish(failure()));
      res.on('aborted', () => finish(failure()));
      res.on('end', () => finish(undefined, {
        statusCode: res.statusCode || 0, headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'), rawSetCookies: res.headers['set-cookie'] || [],
      }));
    });
    const timer = setTimeout(() => { finish(failure()); req.destroy(); }, DEADLINE_MS);
    req.on('error', () => finish(failure()));
    req.end(body);
  }).catch(() => { throw failure(); });
}
