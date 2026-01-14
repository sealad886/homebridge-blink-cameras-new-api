import { BlinkHttp } from '../../src/blink-api/http';
import { BlinkAuth } from '../../src/blink-api/auth';
import { BlinkConfig } from '../../src/types';

describe('BlinkHttp', () => {
  const mockAuth = () => {
    const auth = {
      ensureValidToken: jest.fn().mockResolvedValue(undefined),
      refreshTokens: jest.fn().mockResolvedValue(undefined),
      login: jest.fn().mockResolvedValue(undefined),
      getAuthHeaders: jest.fn().mockReturnValue({ Authorization: 'Bearer token', 'TOKEN-AUTH': 'auth' }),
    } as unknown as BlinkAuth;
    return auth;
  };

  const mockConfig: BlinkConfig = {
    email: 'test@example.com',
    password: 'password',
    hardwareId: 'test-hw-id',
    tier: 'prod',
  };

  const response = (status: number, body: unknown = {}) => ({
    status,
    statusText: status >= 400 ? 'Bad Request' : 'OK',
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers({ 'content-type': 'application/json' }),
  });

  beforeEach(() => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends requests with required headers and base URL', async () => {
    const auth = mockAuth();
    const http = new BlinkHttp(auth, mockConfig);
    (fetch as jest.Mock).mockResolvedValue(response(200, { ok: true }));

    await http.get('v1/example');

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://rest-prod.immedia-semi.com/api/v1/example');
    const headers = options.headers as Record<string, string>;
    expect(headers['APP-BUILD']).toBe('ANDROID_29426569');
    expect(headers.Authorization).toBe('Bearer token');
    expect(auth.ensureValidToken).toHaveBeenCalled();
  });

  it('refreshes tokens and retries on 401', async () => {
    const auth = mockAuth();
    const http = new BlinkHttp(auth, mockConfig);
    (fetch as jest.Mock)
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, { ok: true }));

    await http.get('v1/needs-refresh');

    expect(auth.refreshTokens).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('re-authenticates and retries on 403', async () => {
    const auth = mockAuth();
    const http = new BlinkHttp(auth, mockConfig);
    (fetch as jest.Mock)
      .mockResolvedValueOnce(response(403))
      .mockResolvedValueOnce(response(200, { ok: true }));

    await http.get('v1/needs-login');

    expect(auth.login).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('backs off and retries on 429', async () => {
    const auth = mockAuth();
    const http = new BlinkHttp(auth, mockConfig);
    (fetch as jest.Mock)
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(200, { ok: true }));

    await http.get('v1/rate-limited');

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws with status text when request fails', async () => {
    const auth = mockAuth();
    const http = new BlinkHttp(auth, mockConfig);
    (fetch as jest.Mock).mockResolvedValue(response(400, { message: 'bad' }));

    await expect(http.get('v1/fail')).rejects.toThrow('Blink API GET v1/fail failed: 400 Bad Request');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
