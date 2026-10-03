import { EventEmitter } from 'node:events';
import * as https from 'node:https';
import { diagnosticRequest, diagnosticUrl, isDiagnosticCallback } from '../scripts/oauth-diagnostic-transport';

jest.mock('node:https', () => ({ request: jest.fn() }));

describe('OAuth diagnostic transport boundary', () => {
  let req: EventEmitter & { end: jest.Mock; destroy: jest.Mock };
  let res: EventEmitter & { headers: object; statusCode: number; destroy: jest.Mock };
  beforeEach(() => {
    req = Object.assign(new EventEmitter(), { end: jest.fn(), destroy: jest.fn() });
    res = Object.assign(new EventEmitter(), { headers: { 'set-cookie': ['session=secret'] }, statusCode: 200, destroy: jest.fn() });
    (https.request as jest.Mock).mockImplementation((_options, callback) => {
      queueMicrotask(() => callback(res));
      return req;
    });
  });
  it.each(['http://api.oauth.blink.com/signin', 'https://evil.test/signin', '//evil.test/signin',
    'https://api.oauth.blink.com:444/signin', 'https://user:secret@api.oauth.blink.com/signin'])('rejects forbidden target before request: %s', url => {
    expect(() => diagnosticRequest(url, { headers: { Cookie: 'secret' } })).toThrow();
    expect(https.request).not.toHaveBeenCalled();
  });
  it('resolves relative redirects against current URL and recognizes only exact callback', () => {
    expect(diagnosticUrl('signin', 'https://api.oauth.blink.com/oauth/v2/authorize').pathname).toBe('/oauth/v2/signin');
    expect(isDiagnosticCallback('immedia-blink://applinks.blink.com/signin/callback?code=secret')).toBe(true);
    expect(isDiagnosticCallback('immedia-blink://evil.test/signin/callback?code=secret')).toBe(false);
  });
  it('returns bounded response and ignores insecure caller transport overrides', async () => {
    const pending = diagnosticRequest('https://api.oauth.blink.com/signin', {
      method: 'POST', rejectUnauthorized: false, hostname: 'evil.test', headers: { Cookie: 'session=secret' },
    }, 'password=secret');
    await Promise.resolve();
    res.emit('data', Buffer.from('ok')); res.emit('end');
    expect((await pending).body).toBe('ok');
    expect(https.request).toHaveBeenCalledWith(expect.objectContaining({
      hostname: 'api.oauth.blink.com', rejectUnauthorized: true, port: 443, agent: false,
    }), expect.any(Function));
    expect(req.end).toHaveBeenCalledWith('password=secret');
  });
  it.each([
    ['html', '/signin', 200, 'text/html', 512 * 1024],
    ['json', '/signin', 200, 'application/json; charset=utf-8', 64 * 1024],
    ['json suffix', '/signin', 200, 'application/problem+json', 64 * 1024],
    ['token', '/oauth/token', 200, 'text/plain', 64 * 1024],
    ['error', '/signin', 500, 'text/html', 64 * 1024],
  ])('accepts exact %s limit and destroys limit plus one', async (_kind, path, status, type, limit) => {
    res.headers = { 'content-type': type }; res.statusCode = status as number;
    const pending = diagnosticRequest(`https://api.oauth.blink.com${path}`, {});
    await Promise.resolve();
    res.emit('data', Buffer.alloc(limit as number)); res.emit('end');
    expect(Buffer.byteLength((await pending).body)).toBe(limit);
    res = Object.assign(new EventEmitter(), { headers: { 'content-type': type }, statusCode: status as number, destroy: jest.fn() });
    const oversized = diagnosticRequest(`https://api.oauth.blink.com${path}`, {});
    await Promise.resolve();
    res.emit('data', Buffer.alloc(limit as number));
    res.emit('data', Buffer.alloc(1));
    await expect(oversized).rejects.toThrow('OAuth diagnostic transport failed');
    expect(req.destroy).toHaveBeenCalled(); expect(res.destroy).toHaveBeenCalled();
  });
  it('aborts wall-clock deadline even without response', async () => {
    jest.useFakeTimers();
    const pending = diagnosticRequest('https://api.oauth.blink.com/signin', {});
    const rejected = expect(pending).rejects.toThrow('OAuth diagnostic transport failed');
    jest.advanceTimersByTime(15_000);
    await rejected;
    expect(req.destroy).toHaveBeenCalled();
    jest.useRealTimers();
  });
  it('withholds request errors containing credentials', async () => {
    const pending = diagnosticRequest('https://api.oauth.blink.com/signin', {});
    req.emit('error', new Error('password=secret'));
    await expect(pending).rejects.toThrow('OAuth diagnostic transport failed');
  });
});

it('preserves relative redirect path and query across successive request URLs', () => {
  const first = diagnosticUrl('signin', 'https://api.oauth.blink.com/oauth/v2/authorize?state=one');
  const second = diagnosticUrl('?state=two', first.toString());
  expect(second.pathname).toBe('/oauth/v2/signin');
  expect(second.searchParams.get('state')).toBe('two');
  expect(() => diagnosticUrl('//evil.test/signin', second.toString())).toThrow();
});
