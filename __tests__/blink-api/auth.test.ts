import {
  AuthStateFileSecurityError,
  BlinkAuth,
  Blink2FARequiredError,
  BlinkAuthenticationError,
  hardenAuthStateFileMode,
  readPersistedAuthStateFile,
} from '../../src/blink-api/auth';
import {
  BlinkAuthState,
  BlinkAuthStorage,
  BlinkConfig,
  BlinkLogger,
} from '../../src/types';
import { URL } from 'node:url';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { inspect } from 'node:util';

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

  const createCapturingLogger = (): { logger: BlinkLogger; entries: string[] } => {
    const entries: string[] = [];
    const record = (message: string, ...parameters: unknown[]): void => {
      entries.push([message, ...parameters.map((parameter) => String(parameter))].join(' '));
    };
    return {
      entries,
      logger: { debug: record, info: record, warn: record, error: record },
    };
  };

  const expectSecretAbsent = (log: string, secret: string): void => {
    expect(log).not.toContain(secret);
    expect(log).not.toContain(`${secret.slice(0, 2)}...${secret.slice(-2)}`);
    expect(log).not.toContain(`${secret.slice(0, 4)}...${secret.slice(-4)}`);
    expect(log).not.toContain(`${secret.slice(0, 10)}...${secret.slice(-4)}`);
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fully redacts OAuth and stable identity parameters while preserving safe query values', () => {
    const auth = new BlinkAuth(baseConfig);
    const hardwareId = 'hardwareIdentifierSecret_4Wd7Kp';
    const email = 'privateAddressSecret_8Fm2Qv@example.com';
    const sanitized = (
      auth as unknown as { redactUrlForLogging(value: string): string }
    ).redactUrlForLogging(
      `https://example.com/callback?code=code-secret&state=state-secret&error=error-secret&error_description=description-secret&hardware_id=${hardwareId}&email=${encodeURIComponent(email)}&code_challenge_method=S256&safe=value`,
    );
    const parsed = new URL(sanitized);

    expect(parsed.searchParams.get('code')).toBe('<redacted>');
    expect(parsed.searchParams.get('state')).toBe('<redacted>');
    expect(parsed.searchParams.get('error')).toBe('<redacted>');
    expect(parsed.searchParams.get('error_description')).toBe('<redacted>');
    expect(parsed.searchParams.get('hardware_id')).toBe('<redacted>');
    expect(parsed.searchParams.get('email')).toBe('<redacted>');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('safe')).toBe('value');
    expect(sanitized).not.toContain('code-secret');
    expect(sanitized).not.toContain('state-secret');
    expect(sanitized).not.toContain('error-secret');
    expect(sanitized).not.toContain('description-secret');
    expect(sanitized).not.toContain(hardwareId);
    expect(sanitized).not.toContain(email);
  });

  it('fully redacts stable identity values from authentication forms and headers', () => {
    const auth = new BlinkAuth(baseConfig);
    const hardwareId = 'hardwareFormSecret_3Hs8Nx';
    const deviceIdentifier = 'deviceIdentifierSecret_9Jt5Lp';
    const email = 'privateFormSecret_7Rc4Vm@example.com';
    const phone = '+353860001234';
    const form = (
      auth as unknown as { redactFormBody(value: string): string }
    ).redactFormBody(new URLSearchParams({
      hardware_id: hardwareId,
      device_identifier: deviceIdentifier,
      username: email,
      phone_number: phone,
      grant_type: 'authorization_code',
      status_code: 'safe-status-code',
      error_code: 'safe-error-code',
      country_code: 'safe-country-code',
      codec: 'safe-codec',
    }).toString());
    const headers = (
      auth as unknown as { redactHeaders(value: Headers): Record<string, string> }
    ).redactHeaders(new Headers({
      hardware_id: hardwareId,
      'x-device-identifier': deviceIdentifier,
      'x-safe-header': 'safe-value',
    }));
    const diagnostic = `${form}\n${JSON.stringify(headers)}`;

    expect(diagnostic).not.toContain(hardwareId);
    expect(diagnostic).not.toContain(deviceIdentifier);
    expect(diagnostic).not.toContain(email);
    expect(diagnostic).not.toContain(phone);
    expect(new URLSearchParams(form).get('grant_type')).toBe('authorization_code');
    expect(new URLSearchParams(form).get('status_code')).toBe('safe-status-code');
    expect(new URLSearchParams(form).get('error_code')).toBe('safe-error-code');
    expect(new URLSearchParams(form).get('country_code')).toBe('safe-country-code');
    expect(new URLSearchParams(form).get('codec')).toBe('safe-codec');
    expect(headers['x-safe-header']).toBe('safe-value');
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

    it('waits for legacy token persistence before login resolves', async () => {
      const fetchMock = mockFetch();
      let releaseSave = (): void => undefined;
      const saveGate = new Promise<void>((resolve) => {
        releaseSave = resolve;
      });
      let markSaveStarted = (): void => undefined;
      const saveStarted = new Promise<void>((resolve) => {
        markSaveStarted = resolve;
      });
      const save = jest.fn(async (_state: BlinkAuthState) => {
        markSaveStarted();
        await saveGate;
      });
      const authStorage: BlinkAuthStorage = {
        load: jest.fn(async () => null),
        save,
        clear: jest.fn(async () => undefined),
      };

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
            access_token: 'legacy-access-token',
            refresh_token: 'legacy-refresh-token',
            expires_in: 3600,
            token_type: 'Bearer' as const,
          }),
          headers: createMockHeaders({ 'token-auth': 'legacy-token-auth' }),
        });

      const auth = new BlinkAuth({ ...baseConfig, authStorage });
      let settled = false;
      const login = auth.login();
      void login.then(
        () => { settled = true; },
        () => { settled = true; },
      );
      await saveStarted;
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(settled).toBe(false);
      releaseSave();
      await login;
      expect(save).toHaveBeenCalledWith(expect.objectContaining({
        accessToken: 'legacy-access-token',
        refreshToken: 'legacy-refresh-token',
        tokenAuth: 'legacy-token-auth',
        oauthClientId: 'ios',
      }));
    });

    it('fully redacts legacy OAuth state, redirect code, CSRF, and token values from debug logs', async () => {
      const fetchMock = mockFetch();
      const { logger, entries } = createCapturingLogger();
      const csrfToken = 'legacyCsrfSentinel_4Lp8Qx';
      const authorizationCode = 'legacyCodeSentinel_5Mq7Pw';
      const accessToken = 'legacyAccessSentinel_6Nr6Ov';
      const refreshToken = 'legacyRefreshSentinel_7Os5Nu';
      const tokenAuth = 'legacyTokenAuthSentinel_8Pt4Mt';
      const email = 'legacyEmailSentinel_9Qu3Ls@example.com';
      let generatedState = '';
      let auth!: BlinkAuth;

      fetchMock
        .mockImplementationOnce(async () => {
          generatedState = auth.getOAuthSession()?.state ?? '';
          return { ok: true, status: 302, headers: createMockHeaders() };
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => `<input name="_token" value="${csrfToken}">`,
          headers: createMockHeaders(),
        })
        .mockImplementationOnce(async () => {
          return {
            ok: true,
            status: 302,
            headers: createMockHeaders({
              location: `immedia-blink://applinks.blink.com/signin/callback?code=${authorizationCode}&state=${generatedState}`,
            }),
          };
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 3600,
            token_type: 'Bearer' as const,
          }),
          headers: createMockHeaders({ 'token-auth': tokenAuth }),
        });

      auth = new BlinkAuth({
        ...baseConfig,
        email,
        debugAuth: true,
        logger,
      });
      await auth.login();

      expect(generatedState).not.toBe('');
      const log = entries.join('\n');
      for (const secret of [
        generatedState,
        csrfToken,
        authorizationCode,
        accessToken,
        refreshToken,
        tokenAuth,
        email,
      ]) {
        expectSecretAbsent(log, secret);
      }
      expect(log).not.toContain(`${email.slice(0, 3)}...${email.slice(-3)}`);
    });
  });

  describe('2FA flow', () => {
    it('throws Blink2FARequiredError when 2FA is needed', async () => {
      const fetchMock = mockFetch();
      const email = 'legacyTwoFaEmailSecret_4Vn8Qp@example.com';

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

      const auth = new BlinkAuth({ ...baseConfig, email });
      let caught: unknown;
      try {
        await auth.login();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Blink2FARequiredError);
      expect(inspect(caught)).not.toContain(email);
      expect(JSON.stringify(caught)).not.toContain(email);
      expect((caught as Blink2FARequiredError).email).toBeUndefined();
      expect(auth.is2FAPending()).toBe(true);
    });

    it('auto-uses 2FA code from config', async () => {
      const fetchMock = mockFetch();
      const { logger, entries } = createCapturingLogger();
      const pin = 'legacyPinSentinel_9Qu3Ls';
      const configWith2FA = {
        ...baseConfig,
        twoFactorCode: pin,
        debugAuth: true,
        logger,
      };

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
      expect(verifyBody.get('2fa_code')).toBe(pin);
      expectSecretAbsent(entries.join('\n'), pin);
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

    it('keeps signin-page failure status and response headers out of errors and logs', async () => {
      const fetchMock = mockFetch();
      const { logger, entries } = createCapturingLogger();
      const statusSecret = 'signinPageStatusSecret_1At9Xq';
      const headerNameSecret = 'x-signin-page-header-secret';
      const headerValueSecret = 'signinPageHeaderValueSecret_2Bu8Wp';

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 302,
          statusText: 'Found',
          headers: createMockHeaders(),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: statusSecret,
          headers: createMockHeaders({ [headerNameSecret]: headerValueSecret }),
        });

      const auth = new BlinkAuth({ ...baseConfig, debugAuth: true, logger });
      let caught: unknown;
      try {
        await auth.login();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('Failed to fetch signin page (status 500).');
      const diagnostics = `${(caught as Error).message}\n${entries.join('\n')}`;
      for (const secret of [statusSecret, headerNameSecret, headerValueSecret]) {
        expectSecretAbsent(diagnostics, secret);
      }
    });

    it('keeps signin failure bodies and credential-flow secrets out of errors and logs', async () => {
      const fetchMock = mockFetch();
      const { logger, entries } = createCapturingLogger();
      const password = 'passwordSecret_3Cv7Vo';
      const csrf = 'csrfSecret_4Dw6Un';
      const cookie = 'cookieSecret_5Ex5Tm';
      const callback = 'callbackSecret_6Fy4Sl';
      const code = 'codeSecret_7Gz3Rk';
      const body = `signinBodySecret_8Ha2Qj ${callback} ${code}`;
      const statusSecret = 'signinStatusSecret_9Ib1Pi';
      let generatedState = '';
      let auth!: BlinkAuth;

      fetchMock
        .mockImplementationOnce(async () => {
          generatedState = auth.getOAuthSession()?.state ?? '';
          return {
            ok: true,
            status: 302,
            statusText: 'Found',
            headers: createMockHeaders({ 'set-cookie': `session=${cookie}` }),
          };
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => `<input name="_token" value="${csrf}">`,
          headers: createMockHeaders(),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: statusSecret,
          text: async () => body,
          headers: createMockHeaders(),
        });

      auth = new BlinkAuth({
        ...baseConfig,
        password,
        debugAuth: true,
        logger,
      });
      let caught: unknown;
      try {
        await auth.login();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('Blink sign-in failed (status 401).');
      expect(generatedState).not.toBe('');
      const diagnostics = `${(caught as Error).message}\n${entries.join('\n')}`;
      for (const secret of [
        password,
        csrf,
        cookie,
        callback,
        code,
        body,
        statusSecret,
        generatedState,
      ]) {
        expectSecretAbsent(diagnostics, secret);
      }
    });

    it('keeps failed 2FA response bodies and MFA-flow secrets out of errors and logs', async () => {
      const fetchMock = mockFetch();
      const { logger, entries } = createCapturingLogger();
      const password = 'twoFaPasswordSecret_0Jc9Oh';
      const pin = 'twoFaPinSecret_1Kd8Ng';
      const csrf = 'twoFaCsrfSecret_2Le7Mf';
      const cookie = 'twoFaCookieSecret_3Mf6Le';
      const callback = 'twoFaCallbackSecret_4Ng5Kd';
      const code = 'twoFaCodeSecret_5Oh4Jc';
      const body = `twoFaBodySecret_6Pi3Ib ${callback} ${code}`;
      const statusSecret = 'twoFaStatusSecret_7Qj2Ha';
      let generatedState = '';
      let auth!: BlinkAuth;

      fetchMock
        .mockImplementationOnce(async () => {
          generatedState = auth.getOAuthSession()?.state ?? '';
          return {
            ok: true,
            status: 302,
            statusText: 'Found',
            headers: createMockHeaders({ 'set-cookie': `session=${cookie}` }),
          };
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => `<input name="_token" value="${csrf}">`,
          headers: createMockHeaders(),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => '<html>2FA verification code required</html>',
          headers: createMockHeaders(),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: statusSecret,
          text: async () => body,
          headers: createMockHeaders(),
        });

      auth = new BlinkAuth({
        ...baseConfig,
        password,
        debugAuth: true,
        logger,
      });
      await expect(auth.login()).rejects.toBeInstanceOf(Blink2FARequiredError);

      let caught: unknown;
      try {
        await auth.complete2FA(pin);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('Blink 2FA verification failed (status 401).');
      expect(generatedState).not.toBe('');
      const diagnostics = `${(caught as Error).message}\n${entries.join('\n')}`;
      for (const secret of [
        password,
        pin,
        csrf,
        cookie,
        callback,
        code,
        body,
        statusSecret,
        generatedState,
      ]) {
        expectSecretAbsent(diagnostics, secret);
      }
    });

    it('throws error when CSRF token cannot be extracted', async () => {
      const fetchMock = mockFetch();
      const { logger, entries } = createCapturingLogger();
      const csrfToken = 'unparsedCsrfSentinel_9Qu3Ns';

      fetchMock
        .mockResolvedValueOnce({ ok: true, status: 302, headers: createMockHeaders() })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => `<html data-diagnostic="${csrfToken}">No token field here</html>`,
          headers: createMockHeaders(),
        });

      const auth = new BlinkAuth({ ...baseConfig, debugAuth: true, logger });
      await expect(auth.login()).rejects.toThrow('Could not extract CSRF token');
      expectSecretAbsent(entries.join('\n'), csrfToken);
    });

    it('throws when getAuthHeaders called before login', () => {
      const auth = new BlinkAuth(baseConfig);
      expect(() => auth.getAuthHeaders()).toThrow('Access token not set. Call login first.');
    });

    it('throws when refreshing without prior login', async () => {
      const auth = new BlinkAuth(baseConfig);
      await expect(auth.refreshTokens()).rejects.toThrow('Cannot refresh token before login');
    });

    it('redacts secrets from authentication error logs', () => {
      const error = new BlinkAuthenticationError('Auth failed', {
        status: 401,
        statusText: 'statusTextSecret_8Rk1Gz',
        message: 'verification required',
        requires2FA: true,
        headers: {
          authorization: 'Bearer secret-token',
          cookie: 'session=abc123',
          'token-auth': 'token-auth-secret',
          'x-headerNameSecret_9Sl0Fy': 'headerValueSecret_0Tm9Ex',
        },
        responseBody: {
          access_token: 'secret-token',
          refresh_token: 'refresh-secret',
          verification_code: '654321',
        },
      });

      const log = error.toLogString();

      expect(log).toContain('Status: 401');
      expect(log).not.toContain('secret-token');
      expect(log).not.toContain('refresh-secret');
      expect(log).not.toContain('654321');
      expect(log).not.toContain('session=abc123');
      expect(log).not.toContain('statusTextSecret_8Rk1Gz');
      expect(log).not.toContain('headerNameSecret_9Sl0Fy');
      expect(log).not.toContain('headerValueSecret_0Tm9Ex');
      expect(error.details.statusText).not.toContain('statusTextSecret_8Rk1Gz');
      expect(JSON.stringify(error.details.headers)).not.toContain('headerValueSecret_0Tm9Ex');
    });
  });
});

describe('FileAuthStorage via BlinkAuth persistence', () => {
  let tmpDir: string;
  let dotFilePath: string;
  let legacyDir: string;
  let legacyFilePath: string;

  const sampleState: BlinkAuthState = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    tokenAuth: 'test-token-auth',
    tokenExpiry: '2026-12-31T00:00:00.000Z',
    accountId: 42,
    clientId: 100,
    region: 'us-east-1',
    tier: 'prod',
    email: 'user@example.com',
    hardwareId: 'hw-id',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  function getStorage(auth: BlinkAuth): BlinkAuthStorage {
    return (auth as unknown as { storage: BlinkAuthStorage }).storage;
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-auth-test-'));
    dotFilePath = path.join(tmpDir, '.blink-auth-state.json');
    legacyDir = path.join(tmpDir, 'blink-auth');
    legacyFilePath = path.join(legacyDir, 'auth-state.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeAuth(opts?: { withLegacy?: boolean }): BlinkAuth {
    const config: BlinkConfig = {
      email: 'user@example.com',
      password: 'password',
      hardwareId: 'hw-id',
      authStoragePath: dotFilePath,
      ...(opts?.withLegacy ? { legacyAuthStoragePath: legacyFilePath } : {}),
    };
    return new BlinkAuth(config);
  }

  it('keeps auth-state security helpers source-compatible', async () => {
    await fs.writeFile(dotFilePath, JSON.stringify(sampleState, null, 2), { mode: 0o644 });

    await hardenAuthStateFileMode(dotFilePath);

    await expect(readPersistedAuthStateFile(dotFilePath)).resolves.toEqual(sampleState);
    expect(new AuthStateFileSecurityError('test')).toBeInstanceOf(Error);
  });

  it('save() writes state to the dot-file path with owner-only permissions', async () => {
    const storage = getStorage(makeAuth());
    await storage.save(sampleState);

    const raw = await fs.readFile(dotFilePath, 'utf8');
    expect(JSON.parse(raw)).toEqual(sampleState);

    const stats = await fs.stat(dotFilePath);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('save() replaces existing auth state during token refresh', async () => {
    const storage = getStorage(makeAuth());
    const refreshedState = {
      ...sampleState,
      accessToken: 'refreshed-access-token',
      refreshToken: 'refreshed-refresh-token',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };

    await storage.save(sampleState);
    await storage.save(refreshedState);

    const raw = await fs.readFile(dotFilePath, 'utf8');
    expect(JSON.parse(raw)).toEqual(refreshedState);
    expect(await fs.readdir(tmpDir)).toEqual(['.blink-auth-state.json']);
  });

  it('load() reads state from the dot-file path', async () => {
    await fs.writeFile(dotFilePath, JSON.stringify(sampleState, null, 2), 'utf8');

    const storage = getStorage(makeAuth());
    const loaded = await storage.load();
    expect(loaded).toEqual(sampleState);
  });

  it('load() hardens an existing primary auth file to owner-only permissions', async () => {
    await fs.writeFile(dotFilePath, JSON.stringify(sampleState, null, 2), 'utf8');
    await fs.chmod(dotFilePath, 0o644);

    const storage = getStorage(makeAuth());
    await storage.load();

    const stats = await fs.stat(dotFilePath);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('load() returns already owner-only state without chmodding', async () => {
    await fs.writeFile(dotFilePath, JSON.stringify(sampleState, null, 2), 'utf8');
    await fs.chmod(dotFilePath, 0o600);
    const realOpen = fs.open.bind(fs);
    const chmodMocks: Array<jest.SpiedFunction<Awaited<ReturnType<typeof fs.open>>['chmod']>> = [];
    const openSpy = jest.spyOn(fs, 'open').mockImplementation(async (filePath, flags, mode) => {
      const handle = await realOpen(filePath, flags, mode);
      chmodMocks.push(jest.spyOn(handle, 'chmod').mockRejectedValueOnce(new Error('chmod unsupported')));
      return handle;
    });

    try {
      const storage = getStorage(makeAuth());
      const loaded = await storage.load();

      expect(loaded).toEqual(sampleState);
      expect(openSpy).toHaveBeenCalledWith(dotFilePath, expect.any(Number));
      expect(chmodMocks).toHaveLength(1);
      expect(chmodMocks[0]).not.toHaveBeenCalled();
    } finally {
      openSpy.mockRestore();
    }
  });

  const itIfPosix = process.platform === 'win32' ? it.skip : it;

  itIfPosix('load() rejects shared-readable auth files when POSIX permission hardening fails', async () => {
    await fs.writeFile(dotFilePath, JSON.stringify(sampleState, null, 2), 'utf8');
    await fs.chmod(dotFilePath, 0o644);
    const realOpen = fs.open.bind(fs);
    const openSpy = jest.spyOn(fs, 'open').mockImplementation(async (filePath, flags, mode) => {
      const handle = await realOpen(filePath, flags, mode);
      jest.spyOn(handle, 'chmod').mockRejectedValueOnce(new Error('chmod denied'));
      return handle;
    });

    try {
      const storage = getStorage(makeAuth());

      await expect(storage.load()).rejects.toThrow(AuthStateFileSecurityError);
      await expect(storage.load()).rejects.toThrow('could not be tightened to 0600');
    } finally {
      openSpy.mockRestore();
    }
  });

  it('load() rejects symlinked auth files before hardening permissions', async () => {
    const targetPath = path.join(tmpDir, 'target-auth-state.json');
    await fs.writeFile(targetPath, JSON.stringify(sampleState, null, 2), 'utf8');
    await fs.symlink(targetPath, dotFilePath);
    const chmodSpy = jest.spyOn(fs, 'chmod');

    try {
      const storage = getStorage(makeAuth());

      await expect(storage.load()).rejects.toThrow('symlinked auth state file');
      expect(chmodSpy).not.toHaveBeenCalled();
    } finally {
      chmodSpy.mockRestore();
    }
  });

  it('save() replaces a symlinked auth path without writing through it', async () => {
    const targetPath = path.join(tmpDir, 'target-auth-state.json');
    await fs.writeFile(targetPath, 'do-not-overwrite', 'utf8');
    await fs.symlink(targetPath, dotFilePath);

    const storage = getStorage(makeAuth());
    await storage.save(sampleState);

    expect(await fs.readFile(targetPath, 'utf8')).toBe('do-not-overwrite');
    expect((await fs.lstat(dotFilePath)).isSymbolicLink()).toBe(false);
    expect(JSON.parse(await fs.readFile(dotFilePath, 'utf8'))).toEqual(sampleState);
  });

  it('load() returns null when no file exists', async () => {
    const storage = getStorage(makeAuth());
    const loaded = await storage.load();
    expect(loaded).toBeNull();
  });

  it('load() migrates from legacy path to dot-file', async () => {
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(legacyFilePath, JSON.stringify(sampleState, null, 2), 'utf8');

    const storage = getStorage(makeAuth({ withLegacy: true }));
    const loaded = await storage.load();

    expect(loaded).toEqual(sampleState);

    // Dot-file was written with the migrated state
    const primary = JSON.parse(await fs.readFile(dotFilePath, 'utf8'));
    expect(primary).toEqual(sampleState);

    // Legacy file was removed
    await expect(fs.access(legacyFilePath)).rejects.toThrow();

    // Legacy directory was removed (it was empty)
    await expect(fs.access(legacyDir)).rejects.toThrow();
  });

  it('load() returns primary even when legacy exists (no migration)', async () => {
    const primaryState = { ...sampleState, accessToken: 'primary-token' };
    const legacyState = { ...sampleState, accessToken: 'legacy-token' };

    await fs.writeFile(dotFilePath, JSON.stringify(primaryState, null, 2), 'utf8');
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(legacyFilePath, JSON.stringify(legacyState, null, 2), 'utf8');

    const storage = getStorage(makeAuth({ withLegacy: true }));
    const loaded = await storage.load();

    expect(loaded).toEqual(primaryState);

    // Legacy file is untouched — no migration occurred
    const legacyStillExists = await fs.readFile(legacyFilePath, 'utf8');
    expect(JSON.parse(legacyStillExists)).toEqual(legacyState);
  });

  it('clear() removes the dot-file', async () => {
    await fs.writeFile(dotFilePath, JSON.stringify(sampleState), 'utf8');

    const storage = getStorage(makeAuth());
    await storage.clear();

    await expect(fs.access(dotFilePath)).rejects.toThrow();
  });

  it('clear() removes both dot-file and legacy path', async () => {
    await fs.writeFile(dotFilePath, JSON.stringify(sampleState), 'utf8');
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(legacyFilePath, JSON.stringify(sampleState), 'utf8');

    const storage = getStorage(makeAuth({ withLegacy: true }));
    await storage.clear();

    await expect(fs.access(dotFilePath)).rejects.toThrow();
    await expect(fs.access(legacyFilePath)).rejects.toThrow();
    await expect(fs.access(legacyDir)).rejects.toThrow();
  });

  it('load() with corrupted JSON throws (not ENOENT)', async () => {
    await fs.writeFile(dotFilePath, '{not-valid-json!!!', 'utf8');

    const storage = getStorage(makeAuth());
    await expect(storage.load()).rejects.toThrow();
  });
});
