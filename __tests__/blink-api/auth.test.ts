import { BlinkAuth, Blink2FARequiredError, BlinkAuthenticationError } from '../../src/blink-api/auth';
import { BlinkConfig } from '../../src/types';
import { URL } from 'node:url';

// RequestInit is a global type in Node.js 18+ but may need explicit typing in tests
type FetchOptions = Parameters<typeof fetch>[1];

/**
 * Tests for OAuth 2.0 Authorization Code Flow with PKCE
 *
 * The new authentication flow involves multiple HTTP requests:
 * 1. GET /oauth/v2/authorize - Initialize OAuth session
 * 2. GET /oauth/v2/signin - Fetch signin page, extract CSRF token
 * 3. POST /oauth/v2/signin - Submit credentials
 * 4. GET /oauth/v2/authorize - Get authorization code from redirect
 * 5. POST /oauth/token - Exchange code for tokens
 */
describe('BlinkAuth OAuth 2.0 PKCE Flow', () => {
  const baseConfig: BlinkConfig = {
    email: 'user@example.com',
    password: 'password',
    hardwareId: 'hardware-id',
  };

  const mockFetch = () => {
    const fn = jest.fn();
    globalThis.fetch = fn as unknown as typeof fetch;
    return fn;
  };

  const createMockHeaders = (headers: Record<string, string> = {}): Headers => {
    const h = new Headers(headers);
    // Mock getSetCookie for cookie handling
    (h as unknown as { getSetCookie: () => string[] }).getSetCookie = () =>
      headers['set-cookie'] ? [headers['set-cookie']] : [];
    return h;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('successful login flow', () => {
    it('completes full OAuth flow and stores tokens', async () => {
      const fetchMock = mockFetch();

      // Step 1: GET /oauth/v2/authorize
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 302,
        headers: createMockHeaders({ 'set-cookie': 'session=abc123' }),
      });

      // Step 2: GET /oauth/v2/signin
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html><input name="_token" value="csrf_token_123"></html>',
        headers: createMockHeaders({ 'set-cookie': 'csrf=xyz789' }),
      });

      // Step 3: POST /oauth/v2/signin (success - redirects with code)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 302,
        headers: createMockHeaders({
          location: 'immedia-blink://applinks.blink.com/signin/callback?code=auth_code_456',
        }),
      });

      // Step 5: POST /oauth/token
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'access-token-jwt',
          refresh_token: 'refresh-token-123',
          expires_in: 3600,
          token_type: 'Bearer' as const,
          account_id: 42,
          client_id: 100,
        }),
        headers: createMockHeaders({ 'token-auth': 'token-auth-header' }),
      });

      const auth = new BlinkAuth(baseConfig);
      await auth.login();

      expect(fetchMock).toHaveBeenCalledTimes(4);

      // Verify token exchange request
      const tokenExchangeCall = fetchMock.mock.calls[3];
      const tokenUrl = tokenExchangeCall[0] as string;
      expect(tokenUrl).toContain('oauth/token');

      const tokenOptions = tokenExchangeCall[1] as FetchOptions;
      const tokenBody = new URLSearchParams(tokenOptions!.body as string);
      expect(tokenBody.get('grant_type')).toBe('authorization_code');
      expect(tokenBody.get('code')).toBe('auth_code_456');
      expect(tokenBody.get('client_id')).toBe('ios');

      // Verify captured tokens
      expect(auth.getAuthHeaders()).toEqual({
        Authorization: 'Bearer access-token-jwt',
        'TOKEN-AUTH': 'token-auth-header',
      });
      expect(auth.getAccountId()).toBe(42);
      expect(auth.getClientId()).toBe(100);
    });

    it('uses PKCE with S256 code challenge method', async () => {
      const fetchMock = mockFetch();

      // Step 1: GET /oauth/v2/authorize
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 302,
        headers: createMockHeaders(),
      });

      // Step 2: GET /oauth/v2/signin
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<input name="_token" value="csrf">',
        headers: createMockHeaders(),
      });

      // Step 3: POST /oauth/v2/signin
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 302,
        headers: createMockHeaders({ location: 'callback?code=abc' }),
      });

      // Step 5: POST /oauth/token
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'token',
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'Bearer' as const,
        }),
        headers: createMockHeaders(),
      });

      const auth = new BlinkAuth(baseConfig);
      await auth.login();

      // Verify authorize request has PKCE parameters
      const authorizeCall = fetchMock.mock.calls[0];
      const authorizeUrl = new URL(authorizeCall[0] as string);
      expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
      expect(authorizeUrl.searchParams.get('code_challenge')).toBeTruthy();
      expect(authorizeUrl.searchParams.get('client_id')).toBe('ios');
      expect(authorizeUrl.searchParams.get('response_type')).toBe('code');

      // Verify token exchange includes code_verifier
      const tokenCall = fetchMock.mock.calls[3];
      const tokenBody = new URLSearchParams((tokenCall[1] as FetchOptions)!.body as string);
      expect(tokenBody.get('code_verifier')).toBeTruthy();
      expect(tokenBody.get('grant_type')).toBe('authorization_code');
    });
  });

  describe('2FA flow', () => {
    it('throws Blink2FARequiredError when 2FA is needed', async () => {
      const fetchMock = mockFetch();

      // Step 1: GET /oauth/v2/authorize
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 302,
        headers: createMockHeaders(),
      });

      // Step 2: GET /oauth/v2/signin
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<input name="_token" value="csrf">',
        headers: createMockHeaders(),
      });

      // Step 3: POST /oauth/v2/signin - indicates 2FA required
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html>Please enter your 2FA verification code</html>',
        headers: createMockHeaders(),
      });

      const auth = new BlinkAuth(baseConfig);
      await expect(auth.login()).rejects.toThrow(Blink2FARequiredError);
      expect(auth.is2FAPending()).toBe(true);
    });

    it('auto-uses 2FA code from config', async () => {
      const fetchMock = mockFetch();
      const configWith2FA = { ...baseConfig, twoFactorCode: '123456' };

      // Step 1: GET /oauth/v2/authorize
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 302,
        headers: createMockHeaders(),
      });

      // Step 2: GET /oauth/v2/signin
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<input name="_token" value="csrf">',
        headers: createMockHeaders(),
      });

      // Step 3: POST /oauth/v2/signin - indicates 2FA required
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<input name="_token" value="csrf2">2FA verification code',
        headers: createMockHeaders(),
      });

      // Step 4: POST /oauth/v2/2fa/verify
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 302,
        headers: createMockHeaders({ location: '/oauth/v2/authorize' }),
      });

      // Step 5: GET /oauth/v2/authorize (get code)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 302,
        headers: createMockHeaders({ location: 'callback?code=abc' }),
      });

      // Step 6: POST /oauth/token
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'token',
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'Bearer' as const,
        }),
        headers: createMockHeaders(),
      });

      const auth = new BlinkAuth(configWith2FA);
      await auth.login();

      // Verify 2FA verification was called with the PIN
      const verifyCall = fetchMock.mock.calls[3];
      const verifyBody = new URLSearchParams((verifyCall[1] as FetchOptions)!.body as string);
      expect(verifyBody.get('2fa_code')).toBe('123456');
    });
  });

  describe('token refresh', () => {
    it('refreshes tokens using refresh_token grant', async () => {
      const fetchMock = mockFetch();

      // Setup: Complete initial login first
      // Step 1-4 for initial login...
      fetchMock
        .mockResolvedValueOnce({ ok: true, status: 302, headers: createMockHeaders() })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '<input name="_token" value="csrf">',
          headers: createMockHeaders(),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 302,
          headers: createMockHeaders({ location: 'callback?code=abc' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'original-token',
            refresh_token: 'original-refresh',
            expires_in: 3600,
            token_type: 'Bearer' as const,
          }),
          headers: createMockHeaders(),
        });

      const auth = new BlinkAuth(baseConfig);
      await auth.login();

      // Now test refresh
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 7200,
          token_type: 'Bearer' as const,
        }),
        headers: createMockHeaders({ 'token-auth': 'new-token-auth' }),
      });

      await auth.refreshTokens();

      // Verify refresh request
      const refreshCall = fetchMock.mock.calls[4];
      const refreshBody = new URLSearchParams((refreshCall[1] as FetchOptions)!.body as string);
      expect(refreshBody.get('grant_type')).toBe('refresh_token');
      expect(refreshBody.get('refresh_token')).toBe('original-refresh');
      expect(refreshBody.get('client_id')).toBe('ios');

      // Verify new tokens
      expect(auth.getAuthHeaders()).toEqual({
        Authorization: 'Bearer new-access-token',
        'TOKEN-AUTH': 'new-token-auth',
      });
    });
  });

  describe('error handling', () => {
    it('throws error when signin page fails to load', async () => {
      const fetchMock = mockFetch();

      fetchMock
        .mockResolvedValueOnce({ ok: true, status: 302, headers: createMockHeaders() })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: createMockHeaders(),
        });

      const auth = new BlinkAuth(baseConfig);
      await expect(auth.login()).rejects.toThrow('Failed to fetch signin page');
    });

    it('throws error when CSRF token cannot be extracted', async () => {
      const fetchMock = mockFetch();

      fetchMock
        .mockResolvedValueOnce({ ok: true, status: 302, headers: createMockHeaders() })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '<html>No CSRF token here</html>',
          headers: createMockHeaders(),
        });

      const auth = new BlinkAuth(baseConfig);
      await expect(auth.login()).rejects.toThrow('Could not extract CSRF token');
    });

    it('throws when getAuthHeaders called before login', () => {
      const auth = new BlinkAuth(baseConfig);
      expect(() => auth.getAuthHeaders()).toThrow('Access token not set. Call login first.');
    });

    it('throws when refreshing without prior login', async () => {
      const auth = new BlinkAuth(baseConfig);
      await expect(auth.refreshTokens()).rejects.toThrow('Cannot refresh token before login');
    });

    it('times out OAuth requests when remote endpoint hangs', async () => {
      const fetchMock = mockFetch();
      fetchMock.mockImplementation((_url: string, options?: FetchOptions) => {
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        });
      });

      const auth = new BlinkAuth({
        ...baseConfig,
        requestTimeoutMs: 25,
      });

      await expect(auth.login()).rejects.toThrow('timed out');
    });

    it('redacts sensitive fields in auth error logs', () => {
      const error = new BlinkAuthenticationError('Auth failed', {
        status: 401,
        statusText: 'Unauthorized',
        headers: {
          Authorization: 'Bearer super-secret-access-token',
          'TOKEN-AUTH': 'sensitive-token-auth-value',
        },
        responseBody: {
          access_token: 'sensitive-access-token',
          refresh_token: 'sensitive-refresh-token',
          password: 'plain-password',
          email: 'user@example.com',
          nested: {
            phone: '+1-555-1234',
          },
        },
      });

      const logString = error.toLogString();
      expect(logString).not.toContain('super-secret-access-token');
      expect(logString).not.toContain('sensitive-token-auth-value');
      expect(logString).not.toContain('sensitive-access-token');
      expect(logString).not.toContain('sensitive-refresh-token');
      expect(logString).not.toContain('plain-password');
      expect(logString).not.toContain('user@example.com');
      expect(logString).not.toContain('+1-555-1234');
    });
  });

  describe('state compatibility and concurrency', () => {
    it('ignores incompatible persisted state and forces fresh login', async () => {
      const storage = {
        load: jest.fn().mockResolvedValue({
          accessToken: 'persisted-token',
          refreshToken: 'persisted-refresh',
          tokenExpiry: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          email: 'different@example.com',
          hardwareId: 'hardware-id',
        }),
        save: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined),
      };

      const auth = new BlinkAuth({
        ...baseConfig,
        email: 'user@example.com',
        authStorage: storage,
      });

      const login = jest.spyOn(auth, 'login').mockResolvedValue(undefined);

      await auth.ensureValidToken();

      expect(storage.clear).toHaveBeenCalledTimes(1);
      expect(login).toHaveBeenCalledTimes(1);
    });

    it('coalesces concurrent ensureValidToken calls into one login', async () => {
      const auth = new BlinkAuth(baseConfig);
      const login = jest.spyOn(auth, 'login').mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        (auth as unknown as { accessToken: string }).accessToken = 'token';
        (auth as unknown as { tokenExpiry: Date }).tokenExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000);
      });

      await Promise.all([
        auth.ensureValidToken(),
        auth.ensureValidToken(),
        auth.ensureValidToken(),
      ]);

      expect(login).toHaveBeenCalledTimes(1);
    });
  });
});
