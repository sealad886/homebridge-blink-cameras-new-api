import { BlinkHttp, BlinkHttpError } from '../../src/blink-api/http';
import {
  BlinkAuth,
  BlinkHostedReauthenticationRequiredError,
} from '../../src/blink-api/auth';
import { BlinkAuthStorage, BlinkConfig, BlinkLogger } from '../../src/types';

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
    expect(headers['APP-BUILD']).toBe('ANDROID_29715642');
    expect(headers['User-Agent']).toBe('Blink/57.1 (samsung SM-G998B; Android 14)');
    expect(headers.Authorization).toBe('Bearer token');
    expect(headers['X-Blink-Time-Zone']).toBeTruthy();
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

  it('refreshes tokens and retries on 403 without direct login', async () => {
    const auth = mockAuth();
    const http = new BlinkHttp(auth, mockConfig);
    (fetch as jest.Mock)
      .mockResolvedValueOnce(response(403))
      .mockResolvedValueOnce(response(200, { ok: true }));

    await http.get('v1/needs-login');

    expect(auth.refreshTokens).toHaveBeenCalledTimes(1);
    expect(auth.login).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403])('bounds authentication retry to one refresh for HTTP %s', async (status) => {
    const auth = mockAuth();
    const http = new BlinkHttp(auth, mockConfig);
    (fetch as jest.Mock)
      .mockResolvedValueOnce(response(status))
      .mockResolvedValueOnce(response(status));

    await expect(http.get('v1/still-unauthorized')).rejects.toBeInstanceOf(BlinkHttpError);

    expect(auth.refreshTokens).toHaveBeenCalledTimes(1);
    expect(auth.login).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403])(
    'propagates the fixed hosted reauthentication error from HTTP %s refresh',
    async (status) => {
      const auth = mockAuth();
      const reauthenticationError = new BlinkHostedReauthenticationRequiredError();
      (auth.refreshTokens as jest.Mock).mockRejectedValueOnce(reauthenticationError);
      const http = new BlinkHttp(auth, mockConfig);
      (fetch as jest.Mock).mockResolvedValueOnce(response(status));

      await expect(http.get('v1/hosted-session-expired')).rejects.toBe(reauthenticationError);

      expect(auth.refreshTokens).toHaveBeenCalledTimes(1);
      expect(auth.login).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('backs off and retries on 429', async () => {
    const auth = mockAuth();
    const http = new BlinkHttp(auth, mockConfig);
    (fetch as jest.Mock)
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(200, { ok: true }));

    await http.get('v1/rate-limited');

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws with numeric status only when request fails', async () => {
    const auth = mockAuth();
    const http = new BlinkHttp(auth, mockConfig);
    (fetch as jest.Mock).mockResolvedValue(response(400, { message: 'bad' }));

    await expect(http.get('v1/fail')).rejects.toThrow('Blink API GET v1/fail failed: 400');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not preflight a REST retry after explicit refresh with a short-lived token', async () => {
    const storage: BlinkAuthStorage = {
      load: jest.fn(async () => ({
        accessToken: 'initial-hosted-access',
        refreshToken: 'initial-hosted-refresh',
        tokenExpiry: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        oauthClientId: 'android' as const,
      })),
      save: jest.fn(async () => undefined),
      clear: jest.fn(async () => undefined),
    };
    const auth = new BlinkAuth({
      ...mockConfig,
      email: '',
      password: '',
      authStorage: storage,
    });
    const http = new BlinkHttp(auth, mockConfig);
    let tokenRequests = 0;
    let restRequests = 0;
    (fetch as jest.Mock).mockImplementation(async (input: string) => {
      if (input === 'https://api.oauth.blink.com/oauth/token') {
        tokenRequests += 1;
        return {
          ...response(200, {
            access_token: `short-lived-access-${tokenRequests}`,
            refresh_token: `rotated-refresh-${tokenRequests}`,
            expires_in: 30,
            token_type: 'Bearer',
          }),
          headers: new Headers(),
        };
      }
      restRequests += 1;
      return restRequests === 1
        ? response(401)
        : response(200, { ok: true });
    });

    await http.get('v1/short-lived-retry');

    expect(tokenRequests).toBe(1);
    expect(restRequests).toBe(2);
    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  it('does not retain untrusted HTTP status text or response-header names and values', async () => {
    const statusSecret = 'httpStatusSecret_1Un8Dw';
    const headerNameSecret = 'x-http-header-name-secret';
    const headerValueSecret = 'httpHeaderValueSecret_2Vo7Cv';
    const bodySecret = 'httpReflectedBodySecret_3Wp6Bu';
    const entries: string[] = [];
    const record = (message: string, ...parameters: unknown[]): void => {
      entries.push([message, ...parameters.map(String)].join(' '));
    };
    const logger: BlinkLogger = {
      debug: record,
      info: record,
      warn: record,
      error: record,
    };
    const auth = mockAuth();
    const http = new BlinkHttp(auth, { ...mockConfig, debugAuth: true, logger });
    (fetch as jest.Mock).mockResolvedValue({
      ...response(400, { message: bodySecret }),
      statusText: statusSecret,
      headers: new Headers({ [headerNameSecret]: headerValueSecret }),
    });

    let caught: unknown;
    try {
      await http.get('v1/untrusted-diagnostics');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BlinkHttpError);
    const httpError = caught as BlinkHttpError;
    const diagnostics = [
      httpError.message,
      httpError.toLogString(),
      JSON.stringify(httpError),
      entries.join('\n'),
    ].join('\n');
    expect(diagnostics).not.toContain(statusSecret);
    expect(diagnostics).not.toContain(headerNameSecret);
    expect(diagnostics).not.toContain(headerValueSecret);
    expect(diagnostics).not.toContain(bodySecret);
  });

  it('redacts secrets from HTTP error logs', () => {
    const error = new BlinkHttpError(
      'request failed',
      401,
      'statusTextSecret_3Wp6Bu',
      'https://example.com/api',
      'POST',
      JSON.stringify({
        access_token: 'secret-token',
        pin: '123456',
        nested: { refresh_token: 'refresh-secret' },
        message: 'reflectedBodySecret_6Zs3Yr',
      }),
      {
        authorization: 'Bearer secret-token',
        'set-cookie': 'session=abc123',
        'x-headerNameSecret_4Xq5At': 'headerValueSecret_5Yr4Zs',
      },
    );

    const log = error.toLogString();

    expect(log).toContain('Status: 401');
    expect(log).not.toContain('secret-token');
    expect(log).not.toContain('refresh-secret');
    expect(log).not.toContain('123456');
    expect(log).not.toContain('session=abc123');
    expect(log).not.toContain('statusTextSecret_3Wp6Bu');
    expect(log).not.toContain('headerNameSecret_4Xq5At');
    expect(log).not.toContain('headerValueSecret_5Yr4Zs');
    expect(log).not.toContain('reflectedBodySecret_6Zs3Yr');
  });
});
