import { AuthStateChangedError, FileAuthStorage } from '../../src/blink-api/auth-storage';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  BlinkAuth,
  BlinkAuthenticationError,
  Blink2FARequiredError,
  BlinkTokenRefreshError,
  BlinkHostedTokenExchangeError,
  BlinkHostedReauthenticationRequiredError,
} from '../../src/blink-api/auth';
import { HostedOAuthCoordinator } from '../../src/blink-api/hosted-oauth';
import {
  readOwnerOnlyJsonFile,
  writeOwnerOnlyJsonFile,
} from '../../src/blink-api/secure-json-file';
import type {
  BlinkAuthState,
  BlinkAuthStorage,
  BlinkConfig,
  BlinkHostedOAuthTransaction,
  BlinkLogger,
  BlinkOAuthClientId,
} from '../../src/types';

const CALLBACK_BASE = 'https://applinks.blink.com/signin/callback';
const HOSTED_CONFIG_ERROR = 'Blink hosted sign-in is not configured.';
const HOSTED_REAUTH_ERROR =
  'Blink sign-in has expired. Open the plugin settings and sign in securely with Blink again.';

const AUTHORIZATION_CODE = 'codeSentinel_7QpLm4Xn';
const VERIFIER_SOURCE = 'verifierSentinel_6Fv4Us'.padEnd(64, 'Q');
const CODE_VERIFIER = Buffer.from(VERIFIER_SOURCE).toString('base64url');
const ACCESS_TOKEN = 'accessSentinel_1Aq9Zx';
const REFRESH_TOKEN = 'refreshSentinel_2Br8Yw';
const TOKEN_AUTH = 'tokenAuthSentinel_3Cs7Xv';
const UPSTREAM_BODY = 'upstreamBodySentinel_4Dt6Wu';
const STORAGE_FAILURE = 'storageFailureSentinel_5Eu5Vt';
const STORAGE_LOAD_FAILURE = 'storageLoadFailureSentinel_6Fv4Us';
const AUTH_STATE_LOAD_FAILED = 'Blink authentication state could not be loaded.';

type FetchMock = jest.MockedFunction<typeof fetch>;

interface MutableTokenState {
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: Date | null;
  tokenAuth: string | null;
  oauthClientId: BlinkOAuthClientId | null;
  accountId: number | null;
  clientId: number | null;
  region: string | null;
  tier: string | null;
}

interface TestStorage extends BlinkAuthStorage {
  load: jest.MockedFunction<BlinkAuthStorage['load']>;
  save: jest.MockedFunction<BlinkAuthStorage['save']>;
  clear: jest.MockedFunction<BlinkAuthStorage['clear']>;
}

const createStorage = (
  initialState: BlinkAuthState | null,
  saveImplementation: BlinkAuthStorage['save'] = async () => undefined,
): TestStorage => ({
  load: jest.fn(async () => initialState),
  save: jest.fn(saveImplementation),
  clear: jest.fn(async () => undefined),
});

const createLogger = (): { logger: BlinkLogger; entries: string[] } => {
  const entries: string[] = [];
  const record = (message: string, ...parameters: unknown[]): void => {
    entries.push([message, ...parameters.map((parameter) => String(parameter))].join(' '));
  };
  return {
    entries,
    logger: {
      debug: record,
      info: record,
      warn: record,
      error: record,
    },
  };
};

const successfulTokenResponse = (
  overrides: Partial<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    account_id: number;
    client_id: number;
    region: string;
    tier: string;
  }> = {},
): Response => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: new Headers({ 'TOKEN-AUTH': TOKEN_AUTH }),
  json: async () => ({
    access_token: ACCESS_TOKEN,
    refresh_token: REFRESH_TOKEN,
    expires_in: 14_400,
    token_type: 'Bearer',
    account_id: 42,
    client_id: 100,
    region: 'eu',
    tier: 'prde',
    ...overrides,
  }),
  text: async () => '',
}) as unknown as Response;

const failedTokenResponse = (status = 400): Response => ({
  ok: false,
  status,
  statusText: status === 401 ? 'Unauthorized' : 'Bad Request',
  headers: new Headers({
    'Content-Type': 'application/json',
    'TOKEN-AUTH': TOKEN_AUTH,
  }),
  json: async () => ({ error: 'invalid_grant', error_description: UPSTREAM_BODY }),
  text: async () => JSON.stringify({
    error: 'invalid_grant',
    error_description: UPSTREAM_BODY,
  }),
}) as unknown as Response;

const tokenResponse = (
  body: unknown,
  options: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
  } = {},
): Response => {
  const status = options.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: options.statusText ?? (status >= 400 ? 'Bad Request' : 'OK'),
    headers: new Headers(options.headers),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
};

const validTokenBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  access_token: ACCESS_TOKEN,
  refresh_token: REFRESH_TOKEN,
  expires_in: 14_400,
  token_type: 'Bearer',
  account_id: 42,
  client_id: 100,
  region: 'eu',
  tier: 'prde',
  ...overrides,
});

const exactHostedTokenResponse = (): Response => tokenResponse({
  access_token: ACCESS_TOKEN,
  refresh_token: REFRESH_TOKEN,
  expires_in: 14_400,
  token_type: 'Bearer',
  scope: 'client',
});

const responseHeaders = (values: Record<string, string> = {}): Headers => {
  const headers = new Headers(values);
  (headers as unknown as { getSetCookie: () => string[] }).getSetCookie = () => (
    values['set-cookie'] ? [values['set-cookie']] : []
  );
  return headers;
};

const queueLegacyLoginResponses = (
  fetchMock: FetchMock,
  tokenBody: Record<string, unknown> = validTokenBody({
    access_token: 'replacementAccess_4Pd7Ku',
    refresh_token: 'replacementRefresh_5Qe6Jt',
    expires_in: 7_200,
  }),
): void => {
  fetchMock
    .mockResolvedValueOnce({
      ok: true,
      status: 302,
      statusText: 'Found',
      headers: responseHeaders(),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '<input name="_token" value="replacement-csrf">',
      headers: responseHeaders(),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      status: 302,
      statusText: 'Found',
      headers: responseHeaders({ location: 'immedia-blink://applinks.blink.com/signin/callback?code=replacement-code' }),
    } as Response)
    .mockResolvedValueOnce({
      ...tokenResponse(tokenBody),
      headers: responseHeaders({ 'token-auth': 'replacement-token-auth' }),
    } as Response);
};

const tokenState = (auth: BlinkAuth): MutableTokenState => {
  const state = auth as unknown as MutableTokenState;
  return {
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    tokenExpiry: state.tokenExpiry,
    tokenAuth: state.tokenAuth,
    oauthClientId: state.oauthClientId,
    accountId: state.accountId,
    clientId: state.clientId,
    region: state.region,
    tier: state.tier,
  };
};

const expectSecretsAbsent = (value: string, secrets: readonly string[]): void => {
  for (const secret of secrets) {
    expect(value).not.toContain(secret);
    expect(value).not.toContain(`${secret.slice(0, 3)}...${secret.slice(-3)}`);
    expect(value).not.toContain(`${secret.slice(0, 4)}...${secret.slice(-4)}`);
    expect(value).not.toContain(`${secret.slice(0, 10)}...${secret.slice(-4)}`);
  }
};

describe('BlinkAuth hosted OAuth', () => {
  let directory: string;
  let pendingPath: string;
  let fetchMock: FetchMock;

  const makeConfig = (
    storage: BlinkAuthStorage,
    logger: BlinkLogger,
    overrides: Partial<BlinkConfig> = {},
  ): BlinkConfig => ({
    email: '',
    password: '',
    hardwareId: 'homebridge-blink',
    hostedOAuthPendingPath: pendingPath,
    authStorage: storage,
    debugAuth: true,
    logger,
    ...overrides,
  });

  const startHostedLogin = async (
    auth: BlinkAuth,
  ): Promise<{ pending: BlinkHostedOAuthTransaction; callbackUrl: string }> => {
    const start = await auth.beginHostedLogin();
    const pending = await readOwnerOnlyJsonFile<BlinkHostedOAuthTransaction>(pendingPath);

    // Keep a valid real coordinator transaction while making the verifier a known
    // sentinel whose prefixes and suffixes can be checked against debug output.
    pending.codeVerifier = CODE_VERIFIER;
    pending.codeChallenge = createHash('sha256').update(CODE_VERIFIER).digest('base64url');
    await writeOwnerOnlyJsonFile(pendingPath, pending);

    const callback = new URL(CALLBACK_BASE);
    callback.searchParams.set('state', pending.state);
    callback.searchParams.set('code', AUTHORIZATION_CODE);
    expect(start.flowId).toBe(pending.flowId);
    return { pending, callbackUrl: callback.toString() };
  };

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-auth-hosted-'));
    pendingPath = path.join(directory, '.blink-hosted-oauth.json');
    fetchMock = jest.fn() as FetchMock;
    globalThis.fetch = fetchMock;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('consumes once before the exact exchange and waits for durable persistence', async () => {
    let releaseSave = (): void => undefined;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    let markSaveStarted = (): void => undefined;
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });
    const storage = createStorage(null, async () => {
      markSaveStarted();
      await saveGate;
    });
    const { logger, entries } = createLogger();
    const consumeSpy = jest.spyOn(HostedOAuthCoordinator.prototype, 'consumeCallback');
    const auth = new BlinkAuth(makeConfig(storage, logger));
    const { pending, callbackUrl } = await startHostedLogin(auth);
    fetchMock.mockResolvedValueOnce(exactHostedTokenResponse());

    let settled = false;
    const completion = auth.completeHostedLogin(pending.flowId, callbackUrl);
    void completion.then(
      () => { settled = true; },
      () => { settled = true; },
    );
    await saveStarted;
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(settled).toBe(false);
    expect(storage.load).toHaveBeenCalledTimes(1);
    expect(consumeSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storage.load.mock.invocationCallOrder[0]).toBeLessThan(
      consumeSpy.mock.invocationCallOrder[0],
    );
    expect(consumeSpy.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0],
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.oauth.blink.com/oauth/token');
    expect(init.headers).toEqual(expect.any(Headers));
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
      grant_type: 'authorization_code',
      redirect_uri: 'https://applinks.blink.com/signin/callback',
      code: AUTHORIZATION_CODE,
      code_verifier: pending.codeVerifier,
      client_id: 'android',
    });
    expect((init.headers as Headers).get('content-type')).toBe(
      'application/x-www-form-urlencoded',
    );
    expect((init.headers as Headers).get('accept')).toBe('application/json');
    expect(Array.from((init.headers as Headers).keys()).sort()).toEqual([
      'accept',
      'content-type',
    ]);

    releaseSave();
    await completion;

    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      tokenAuth: null,
      oauthClientId: 'android',
      accountId: null,
      clientId: null,
      region: null,
      tier: null,
      email: null,
    }));
    expect(auth.getAuthHeaders()).toEqual({ Authorization: `Bearer ${ACCESS_TOKEN}` });
    expectSecretsAbsent(entries.join('\n'), [
      AUTHORIZATION_CODE,
      CODE_VERIFIER,
      ACCESS_TOKEN,
      REFRESH_TOKEN,
      TOKEN_AUTH,
    ]);
  });

  it('restores the complete prior session when the first hosted token save fails', async () => {
    const previousEmail = 'prior-account@example.com';
    const previousState: BlinkAuthState = {
      accessToken: 'priorAccess_8Gw3Ts',
      refreshToken: 'priorRefresh_9Hx2Sr',
      tokenAuth: 'priorTokenAuth_0Jy1Rq',
      tokenExpiry: '2026-12-31T00:00:00.000Z',
      oauthClientId: 'ios',
      accountId: 11,
      clientId: 22,
      region: 'us',
      tier: 'prod',
      email: previousEmail,
    };
    const storageError = new Error(STORAGE_FAILURE);
    const storage = createStorage(previousState, async (_state) => {
      throw storageError;
    });
    const { logger, entries } = createLogger();
    const consumeSpy = jest.spyOn(HostedOAuthCoordinator.prototype, 'consumeCallback');
    const runtimeConfig = makeConfig(storage, logger, { email: previousEmail });
    const auth = new BlinkAuth(runtimeConfig);
    const { pending, callbackUrl } = await startHostedLogin(auth);
    fetchMock.mockResolvedValueOnce(exactHostedTokenResponse());

    await expect(auth.completeHostedLogin(pending.flowId, callbackUrl)).rejects.toBe(storageError);

    expect(storage.load).toHaveBeenCalledTimes(1);
    expect(consumeSpy).toHaveBeenCalledTimes(1);
    expect(storage.load.mock.invocationCallOrder[0]).toBeLessThan(
      consumeSpy.mock.invocationCallOrder[0],
    );
    expect(tokenState(auth)).toEqual({
      accessToken: previousState.accessToken,
      refreshToken: previousState.refreshToken,
      tokenExpiry: new Date(previousState.tokenExpiry as string),
      tokenAuth: previousState.tokenAuth,
      oauthClientId: 'ios',
      accountId: previousState.accountId,
      clientId: previousState.clientId,
      region: previousState.region,
      tier: previousState.tier,
    });
    expect(runtimeConfig.email).toBe(previousEmail);
    expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      accountId: null,
      clientId: null,
      region: null,
      tier: null,
      email: null,
    }));
    expect(entries.filter((entry) => entry.includes('persist auth state'))).toEqual([
      '[Auth] Failed to persist auth state.',
    ]);
    expect(entries.join('\n')).not.toContain(STORAGE_FAILURE);
    expectSecretsAbsent(entries.join('\n'), [ACCESS_TOKEN, REFRESH_TOKEN, TOKEN_AUTH]);
  });

  it('retains the one-shot callback when existing auth state cannot be loaded safely', async () => {
    const storage = createStorage(null);
    storage.load.mockRejectedValueOnce(new Error(STORAGE_LOAD_FAILURE));
    const { logger, entries } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    const { pending, callbackUrl } = await startHostedLogin(auth);
    fetchMock.mockResolvedValueOnce(successfulTokenResponse());

    await expect(auth.completeHostedLogin(pending.flowId, callbackUrl)).rejects.toThrow(
      'Blink authentication state could not be loaded.',
    );

    await expect(readOwnerOnlyJsonFile<BlinkHostedOAuthTransaction>(pendingPath)).resolves.toEqual(
      pending,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(entries.filter((entry) => entry.includes('load persisted auth state'))).toEqual([
      '[Auth] Failed to load persisted auth state.',
    ]);
    expectSecretsAbsent(entries.join('\n'), [
      STORAGE_LOAD_FAILURE,
      AUTHORIZATION_CODE,
      CODE_VERIFIER,
    ]);
  });

  it('uses the exact Android refresh form and omits TOKEN-AUTH from hosted bearer headers', async () => {
    const currentEmail = 'current-account@example.com';
    const storage = createStorage({
      accessToken: 'oldHostedAccess_1Ka9Pz',
      refreshToken: REFRESH_TOKEN,
      tokenAuth: 'staleHostedTokenAuth_2Lb8Oy',
      tokenExpiry: '2026-01-01T00:00:00.000Z',
      oauthClientId: 'android',
      accountId: 42,
      clientId: 100,
      region: 'eu',
      tier: 'prde',
      email: currentEmail,
    });
    const { logger, entries } = createLogger();
    const runtimeConfig = makeConfig(storage, logger);
    const auth = new BlinkAuth(runtimeConfig);
    fetchMock.mockResolvedValueOnce(exactHostedTokenResponse());

    await auth.refreshTokens();

    expect(runtimeConfig.email).toBe(currentEmail);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.oauth.blink.com/oauth/token');
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
      client_id: 'android',
      scope: 'client',
    });
    expect(init.headers).toEqual(expect.any(Headers));
    expect(Array.from((init.headers as Headers).keys()).sort()).toEqual([
      'accept',
      'content-type',
    ]);
    expect((init.headers as Headers).get('content-type')).toBe(
      'application/x-www-form-urlencoded',
    );
    expect((init.headers as Headers).get('accept')).toBe('application/json');
    expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({
      oauthClientId: 'android',
      tokenAuth: null,
      accountId: 42,
      clientId: 100,
      region: 'eu',
      tier: 'prde',
      email: currentEmail,
    }));
    expect(auth.getAuthHeaders()).toEqual({ Authorization: `Bearer ${ACCESS_TOKEN}` });
    expectSecretsAbsent(entries.join('\n'), [ACCESS_TOKEN, REFRESH_TOKEN, TOKEN_AUTH]);
  });

  it.each([null, ''])(
    'keeps an explicitly configured email when persisted email is %p',
    async (persistedEmail) => {
      const configuredEmail = 'configured-account@example.com';
      const storage = createStorage({
        accessToken: 'currentAccess_1Xg8Qr',
        refreshToken: 'currentRefresh_2Yh7Ps',
        tokenExpiry: '2026-12-31T00:00:00.000Z',
        oauthClientId: 'android',
        accountId: 42,
        clientId: 100,
        region: 'eu',
        tier: 'prde',
        email: persistedEmail,
      });
      const { logger } = createLogger();
      const runtimeConfig = makeConfig(storage, logger, { email: configuredEmail });
      const auth = new BlinkAuth(runtimeConfig);

      await auth.getPersistedTier();
      await auth.persistCurrentState();

      expect(runtimeConfig.email).toBe(configuredEmail);
      expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({
        email: configuredEmail,
      }));
    },
  );

  it('clears explicitly null account metadata while preserving omitted properties', async () => {
    const currentEmail = 'current-account@example.com';
    const storage = createStorage({
      accessToken: 'currentAccess_1Xg8Qr',
      refreshToken: 'currentRefresh_2Yh7Ps',
      tokenExpiry: '2026-12-31T00:00:00.000Z',
      oauthClientId: 'android',
      accountId: 42,
      clientId: 100,
      region: 'eu',
      tier: 'prde',
      email: currentEmail,
    });
    const { logger } = createLogger();
    const runtimeConfig = makeConfig(storage, logger, { email: currentEmail });
    const auth = new BlinkAuth(runtimeConfig);
    await auth.getPersistedTier();

    auth.setAccountMetadata({ accountId: null, email: null });

    expect(auth.getAccountId()).toBeNull();
    expect(auth.getClientId()).toBe(100);
    expect(auth.getRegion()).toBe('eu');
    expect(auth.getTier()).toBe('prde');
    expect(runtimeConfig.email).toBe('');

    auth.setAccountMetadata({ clientId: null, region: null, tier: null });
    await auth.persistCurrentState();

    expect(auth.getClientId()).toBeNull();
    expect(auth.getRegion()).toBeNull();
    expect(auth.getTier()).toBeNull();
    expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({
      accountId: null,
      clientId: null,
      region: null,
      tier: null,
      email: null,
    }));
  });

  it('classifies hosted refresh persistence failure as storage failure and restores memory', async () => {
    const previousState: BlinkAuthState = {
      accessToken: 'priorHostedAccess_2Mb7Ny',
      refreshToken: 'priorHostedRefresh_3Nc6Mx',
      tokenAuth: null,
      tokenExpiry: '2026-01-01T00:00:00.000Z',
      oauthClientId: 'android',
      accountId: 12,
      clientId: 23,
      region: 'eu',
      tier: 'prde',
    };
    const storage = createStorage(previousState, async () => {
      throw new Error(STORAGE_FAILURE);
    });
    const { logger, entries } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    fetchMock.mockResolvedValueOnce(successfulTokenResponse());

    let caught: unknown;
    try {
      await auth.refreshTokens();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BlinkTokenRefreshError);
    expect(caught).toMatchObject({ category: 'storage' });
    expect(tokenState(auth)).toEqual({
      accessToken: previousState.accessToken,
      refreshToken: previousState.refreshToken,
      tokenExpiry: new Date(previousState.tokenExpiry as string),
      tokenAuth: previousState.tokenAuth,
      oauthClientId: previousState.oauthClientId,
      accountId: previousState.accountId,
      clientId: previousState.clientId,
      region: previousState.region,
      tier: previousState.tier,
    });
    expect(entries.join('\n')).not.toContain(STORAGE_FAILURE);
    expectSecretsAbsent(entries.join('\n'), [ACCESS_TOKEN, REFRESH_TOKEN, TOKEN_AUTH]);
  });

  it('defaults loaded profile-less state to the exact legacy iOS refresh contract', async () => {
    const legacyRefresh = 'legacyRefreshSentinel_3Mc7Nx';
    const legacyTokenAuth = 'legacyTokenAuthSentinel_4Nd6Mw';
    const storage = createStorage({
      accessToken: 'legacyAccessSentinel_5Oe5Lv',
      refreshToken: legacyRefresh,
      tokenExpiry: '2026-01-01T00:00:00.000Z',
    });
    const { logger, entries } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    fetchMock.mockResolvedValueOnce({
      ...successfulTokenResponse({ refresh_token: legacyRefresh }),
      headers: new Headers({ 'TOKEN-AUTH': legacyTokenAuth }),
    } as Response);

    await auth.refreshTokens();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
      refresh_token: legacyRefresh,
      grant_type: 'refresh_token',
      client_id: 'ios',
    });
    expect(new URLSearchParams(init.body as string).has('scope')).toBe(false);
    expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({
      oauthClientId: 'ios',
      tokenAuth: legacyTokenAuth,
    }));
    expect(auth.getAuthHeaders()).toEqual({
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'TOKEN-AUTH': legacyTokenAuth,
    });
    expectSecretsAbsent(entries.join('\n'), [
      ACCESS_TOKEN,
      legacyRefresh,
      legacyTokenAuth,
    ]);
  });

  it.each([
    ['expired', '2026-01-01T00:00:00.000Z'],
    ['proactively expiring', new Date(Date.now() + 30 * 60 * 1000).toISOString()],
  ])(
    'raises the fixed hosted reauthentication error for an %s token without direct login',
    async (_description, tokenExpiry) => {
      const storage = createStorage({
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
        tokenExpiry,
        oauthClientId: 'android',
      });
      const { logger, entries } = createLogger();
      const auth = new BlinkAuth(makeConfig(storage, logger));
      const loginSpy = jest.spyOn(auth, 'login');
      fetchMock.mockResolvedValueOnce(failedTokenResponse(401));

      let caught: unknown;
      try {
        await auth.ensureValidToken();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(BlinkHostedReauthenticationRequiredError);
      expect((caught as Error).message).toBe(HOSTED_REAUTH_ERROR);
      expect(loginSpy).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expectSecretsAbsent(`${(caught as Error).message}\n${entries.join('\n')}`, [
        ACCESS_TOKEN,
        REFRESH_TOKEN,
        TOKEN_AUTH,
        UPSTREAM_BODY,
      ]);
    },
  );

  it('propagates legacy refresh failure when credentials are missing', async () => {
    const storage = createStorage({
      accessToken: 'legacyAccessSentinel_6Pf4Ku',
      refreshToken: 'legacyRefreshSentinel_7Qg3Jt',
      tokenExpiry: '2026-01-01T00:00:00.000Z',
    });
    const { logger, entries } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    const loginSpy = jest.spyOn(auth, 'login');
    fetchMock.mockResolvedValueOnce(failedTokenResponse());

    await expect(auth.ensureValidToken()).rejects.toThrow(
      'Blink OAuth refresh failed: 400',
    );

    expect(loginSpy).not.toHaveBeenCalled();
    expect(entries.join('\n')).not.toContain(UPSTREAM_BODY);
  });

  it('allows legacy direct-login fallback only with nonempty credentials', async () => {
    const storage = createStorage({
      accessToken: 'legacyAccessSentinel_8Rh2Is',
      refreshToken: 'legacyRefreshSentinel_9Si1Hr',
      tokenExpiry: '2026-01-01T00:00:00.000Z',
    });
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger, {
      email: 'legacy@example.com',
      password: 'legacy-password',
    }));
    const loginSpy = jest.spyOn(auth, 'login').mockResolvedValueOnce(undefined);
    fetchMock.mockResolvedValueOnce(failedTokenResponse());

    await auth.ensureValidToken();

    expect(loginSpy).toHaveBeenCalledTimes(1);
  });

  it('does not expose an upstream token response body in hosted completion errors or logs', async () => {
    const storage = createStorage(null);
    const { logger, entries } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    const { pending, callbackUrl } = await startHostedLogin(auth);
    fetchMock.mockResolvedValueOnce(failedTokenResponse());

    await expect(auth.completeHostedLogin(pending.flowId, callbackUrl)).rejects.toThrow(
      'Blink sign-in could not be completed. Start sign-in again.',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectSecretsAbsent(entries.join('\n'), [
      AUTHORIZATION_CODE,
      CODE_VERIFIER,
      TOKEN_AUTH,
      UPSTREAM_BODY,
    ]);
  });

  it.each([
    [
      'an invalid-grant rejection',
      () => failedTokenResponse(401),
      'BHO-HTTP-INVALID-GRANT',
    ],
    [
      'a successful response with an incompatible expiry',
      () => tokenResponse(validTokenBody({ expires_in: '14400' })),
      'BHO-SCHEMA-EXPIRY',
    ],
  ])('classifies %s with a bounded secret-free support code', async (
    _description,
    responseFactory,
    diagnosticCode,
  ) => {
    const storage = createStorage(null);
    const { logger, entries } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    const { pending, callbackUrl } = await startHostedLogin(auth);
    fetchMock.mockResolvedValueOnce(responseFactory());

    let caught: unknown;
    try {
      await auth.completeHostedLogin(pending.flowId, callbackUrl);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BlinkHostedTokenExchangeError);
    expect(caught).toMatchObject({
      message: 'Blink sign-in could not be completed. Start sign-in again.',
      diagnosticCode,
    });
    expectSecretsAbsent(JSON.stringify(caught), [
      AUTHORIZATION_CODE,
      CODE_VERIFIER,
      ACCESS_TOKEN,
      REFRESH_TOKEN,
      TOKEN_AUTH,
      UPSTREAM_BODY,
    ]);
    expectSecretsAbsent(entries.join('\n'), [
      AUTHORIZATION_CODE,
      CODE_VERIFIER,
      ACCESS_TOKEN,
      REFRESH_TOKEN,
      TOKEN_AUTH,
      UPSTREAM_BODY,
    ]);
  });

  it('keeps hosted fetch-rejection diagnostics fixed and free of callback and token secrets', async () => {
    const storage = createStorage(null);
    const { logger, entries } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    const { pending, callbackUrl } = await startHostedLogin(auth);
    const networkError = new Error([
      AUTHORIZATION_CODE,
      CODE_VERIFIER,
      ACCESS_TOKEN,
      REFRESH_TOKEN,
      UPSTREAM_BODY,
    ].join('|'));
    networkError.cause = new Error(TOKEN_AUTH);
    fetchMock.mockRejectedValueOnce(networkError);

    let caught: unknown;
    try {
      await auth.completeHostedLogin(pending.flowId, callbackUrl);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).toBeInstanceOf(BlinkHostedTokenExchangeError);
    expect(caught).toMatchObject({
      message: 'Blink sign-in could not be completed. Start sign-in again.',
      diagnosticCode: 'BHO-NETWORK',
    });
    expectSecretsAbsent(`${(caught as Error).message}\n${entries.join('\n')}`, [
      AUTHORIZATION_CODE,
      CODE_VERIFIER,
      ACCESS_TOKEN,
      REFRESH_TOKEN,
      TOKEN_AUTH,
      UPSTREAM_BODY,
    ]);
  });

  it('classifies a secret-bearing JSON decoder failure without retaining its cause', async () => {
    const storage = createStorage(null);
    const { logger, entries } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    const { pending, callbackUrl } = await startHostedLogin(auth);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => {
        throw new Error(`${UPSTREAM_BODY}|${ACCESS_TOKEN}|${REFRESH_TOKEN}`);
      },
    } as unknown as Response);

    let caught: unknown;
    try {
      await auth.completeHostedLogin(pending.flowId, callbackUrl);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BlinkHostedTokenExchangeError);
    expect(caught).toMatchObject({ diagnosticCode: 'BHO-JSON' });
    expect(caught).not.toHaveProperty('cause');
    expectSecretsAbsent(`${String(caught)}\n${JSON.stringify(caught)}\n${entries.join('\n')}`, [
      AUTHORIZATION_CODE,
      CODE_VERIFIER,
      ACCESS_TOKEN,
      REFRESH_TOKEN,
      UPSTREAM_BODY,
    ]);
  });

  it('propagates explicit persistence failure after one fixed log line', async () => {
    const storageError = new Error(STORAGE_FAILURE);
    const storage = createStorage({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      tokenExpiry: '2026-12-31T00:00:00.000Z',
      oauthClientId: 'android',
    }, async () => {
      throw storageError;
    });
    const { logger, entries } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    await auth.getPersistedTier();

    await expect(auth.persistCurrentState()).rejects.toBe(storageError);

    expect(entries.filter((entry) => entry.includes('persist auth state'))).toEqual([
      '[Auth] Failed to persist auth state.',
    ]);
    expect(entries.join('\n')).not.toContain(STORAGE_FAILURE);
  });

  it('cancels a pending hosted transaction', async () => {
    const storage = createStorage(null);
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    await auth.beginHostedLogin();

    await auth.cancelHostedLogin();

    await expect(fs.access(pendingPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails coordinator methods with one fixed error when hosted OAuth is not configured', async () => {
    const storage = createStorage(null);
    const { logger, entries } = createLogger();
    const auth = new BlinkAuth({
      email: '',
      password: '',
      hardwareId: 'homebridge-blink',
      authStorage: storage,
      debugAuth: true,
      logger,
    });
    const secretCallback = `${CALLBACK_BASE}?code=${AUTHORIZATION_CODE}&state=stateSentinel_0Tj9Gq`;

    await expect(auth.beginHostedLogin()).rejects.toThrow(HOSTED_CONFIG_ERROR);
    await expect(auth.cancelHostedLogin()).rejects.toThrow(HOSTED_CONFIG_ERROR);
    await expect(auth.completeHostedLogin('flowSentinel_1Uk8Fp', secretCallback)).rejects.toThrow(
      HOSTED_CONFIG_ERROR,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expectSecretsAbsent(entries.join('\n'), [AUTHORIZATION_CODE, CODE_VERIFIER, secretCallback]);
  });

  it('rejects hosted start and completion before transaction mutation when auth storage is absent', async () => {
    const { logger, entries } = createLogger();
    const auth = new BlinkAuth({
      email: '',
      password: '',
      hardwareId: 'homebridge-blink',
      hostedOAuthPendingPath: pendingPath,
      debugAuth: true,
      logger,
    });

    await expect(auth.beginHostedLogin()).rejects.toThrow(HOSTED_CONFIG_ERROR);
    await expect(fs.access(pendingPath)).rejects.toMatchObject({ code: 'ENOENT' });

    const coordinator = new HostedOAuthCoordinator({
      pendingFilePath: pendingPath,
      hardwareId: 'homebridge-blink',
    });
    const start = await coordinator.start();
    const pending = await readOwnerOnlyJsonFile<BlinkHostedOAuthTransaction>(pendingPath);
    const callback = new URL(CALLBACK_BASE);
    callback.searchParams.set('state', pending.state);
    callback.searchParams.set('code', AUTHORIZATION_CODE);

    await expect(
      auth.completeHostedLogin(start.flowId, callback.toString()),
    ).rejects.toThrow(HOSTED_CONFIG_ERROR);

    await expect(readOwnerOnlyJsonFile<BlinkHostedOAuthTransaction>(pendingPath)).resolves.toEqual(
      pending,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expectSecretsAbsent(entries.join('\n'), [
      AUTHORIZATION_CODE,
      pending.codeVerifier,
      callback.toString(),
    ]);
  });

  it.each([
    ['null response', null],
    ['array response', []],
    ['blank access token', validTokenBody({ access_token: '   ' })],
    ['wrong access token type', validTokenBody({ access_token: 42 })],
    ['zero expiry', validTokenBody({ expires_in: 0 })],
    ['non-finite expiry', validTokenBody({ expires_in: Number.POSITIVE_INFINITY })],
    ['wrong token type', validTokenBody({ token_type: 'MAC' })],
    ['missing hosted refresh token', (() => {
      const body = validTokenBody();
      delete body.refresh_token;
      return body;
    })()],
    ['blank hosted refresh token', validTokenBody({ refresh_token: '   ' })],
    ['wrong hosted refresh token type', validTokenBody({ refresh_token: 123 })],
    ['invalid optional metadata', validTokenBody({ account_id: '42' })],
  ])('rejects %s without relabeling or mutating a legacy token set', async (_description, body) => {
    const previousState: BlinkAuthState = {
      accessToken: 'legacyAccess_2Nf8Ls',
      refreshToken: 'legacyRefresh_3Og7Kr',
      tokenAuth: 'legacyTokenAuth_4Ph6Jq',
      tokenExpiry: '2026-12-31T00:00:00.000Z',
      oauthClientId: 'ios',
      accountId: 11,
      clientId: 22,
      region: 'us',
      tier: 'prod',
    };
    const storage = createStorage(previousState);
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    const { pending, callbackUrl } = await startHostedLogin(auth);
    fetchMock.mockResolvedValueOnce(tokenResponse(body));

    await expect(auth.completeHostedLogin(pending.flowId, callbackUrl)).rejects.toThrow(
      'Blink sign-in could not be completed. Start sign-in again.',
    );

    expect(tokenState(auth)).toEqual({
      accessToken: previousState.accessToken,
      refreshToken: previousState.refreshToken,
      tokenExpiry: new Date(previousState.tokenExpiry as string),
      tokenAuth: previousState.tokenAuth,
      oauthClientId: previousState.oauthClientId,
      accountId: previousState.accountId,
      clientId: previousState.clientId,
      region: previousState.region,
      tier: previousState.tier,
    });
    expect(storage.save).not.toHaveBeenCalled();
  });

  it.each([
    ['blank access token', validTokenBody({ access_token: '   ' })],
    ['wrong access token type', validTokenBody({ access_token: false })],
    ['negative expiry', validTokenBody({ expires_in: -1 })],
    ['wrong token type', validTokenBody({ token_type: 'bearer' })],
    ['blank refresh token', validTokenBody({ refresh_token: '   ' })],
    ['wrong refresh token type', validTokenBody({ refresh_token: 123 })],
    ['invalid optional metadata', validTokenBody({ tier: '' })],
  ])('classifies Android refresh %s as invalid response without mutation', async (_description, body) => {
    const previousState: BlinkAuthState = {
      accessToken: 'hostedAccess_5Qi5Ip',
      refreshToken: 'hostedRefresh_6Rh4Ho',
      tokenAuth: null,
      tokenExpiry: '2026-12-31T00:00:00.000Z',
      oauthClientId: 'android',
      accountId: 12,
      clientId: 23,
      region: 'eu',
      tier: 'prde',
    };
    const storage = createStorage(previousState);
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    fetchMock.mockResolvedValueOnce(tokenResponse(body));

    await expect(auth.refreshTokens()).rejects.toBeInstanceOf(
      BlinkTokenRefreshError,
    );

    expect(tokenState(auth)).toEqual({
      accessToken: previousState.accessToken,
      refreshToken: previousState.refreshToken,
      tokenExpiry: new Date(previousState.tokenExpiry as string),
      tokenAuth: previousState.tokenAuth,
      oauthClientId: previousState.oauthClientId,
      accountId: previousState.accountId,
      clientId: previousState.clientId,
      region: previousState.region,
      tier: previousState.tier,
    });
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('allows an Android refresh to retain its existing nonblank refresh token', async () => {
    const retainedRefreshToken = 'retainedHostedRefresh_7Sg3Gn';
    const storage = createStorage({
      accessToken: 'oldHostedAccess_8Tf2Fm',
      refreshToken: retainedRefreshToken,
      tokenExpiry: '2026-12-31T00:00:00.000Z',
      oauthClientId: 'android',
    });
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    const body = validTokenBody({ access_token: 'rotatedHostedAccess_9Ue1El' });
    delete body.refresh_token;
    fetchMock.mockResolvedValueOnce(tokenResponse(body));

    await auth.refreshTokens();

    expect(auth.getRefreshToken()).toBe(retainedRefreshToken);
    expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({
      refreshToken: retainedRefreshToken,
      oauthClientId: 'android',
    }));
  });

  it.each([
    [
      'client verification',
      401,
      { client_verification_required: true, message: 'bodySecret_0Vd9Dk' },
      'client_verification_required',
      false,
      true,
    ],
    [
      'app update',
      426,
      { message: 'bodySecret_1Wc8Cj' },
      'app_update_required',
      true,
      false,
    ],
    [
      'two-factor verification',
      401,
      { error: 'two_factor_required', error_description: 'bodySecret_2Xb7Bi' },
      'two_factor_required',
      false,
      true,
    ],
  ])(
    'preserves allow-listed %s classification without retaining upstream diagnostics',
    async (_description, status, body, expectedCategory, requiresUpdate, requires2FA) => {
      const upstreamNumericCode = 654321;
      const statusSecret = 'statusTextSecret_3Ya6Ah';
      const headerNameSecret = 'x-header-name-secret-4z';
      const headerValueSecret = 'headerValueSecret_5Aa4Yf';
      const bodySecret = Object.values(body).find((value) => (
        typeof value === 'string' && value.startsWith('bodySecret_')
      )) as string;
      const storage = createStorage({
        accessToken: 'legacyAccess_6Bb3Xe',
        refreshToken: 'legacyRefresh_7Cc2Wd',
        tokenExpiry: '2026-01-01T00:00:00.000Z',
        oauthClientId: 'ios',
      });
      const { logger, entries } = createLogger();
      const auth = new BlinkAuth(makeConfig(storage, logger));
      fetchMock.mockResolvedValueOnce(tokenResponse({ ...body, code: upstreamNumericCode }, {
        status,
        statusText: statusSecret,
        headers: { [headerNameSecret]: headerValueSecret },
      }));

      let caught: unknown;
      try {
        await auth.refreshTokens();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(BlinkAuthenticationError);
      const authenticationError = caught as BlinkAuthenticationError;
      expect(authenticationError.details.message).toBe(expectedCategory);
      expect(authenticationError.details.requiresUpdate ?? false).toBe(requiresUpdate);
      expect(authenticationError.details.requires2FA ?? false).toBe(requires2FA);
      expect(authenticationError.details.responseBody).toBeUndefined();
      expect(authenticationError.details).not.toHaveProperty('code');
      const diagnostics = [
        authenticationError.message,
        authenticationError.toLogString(),
        JSON.stringify(authenticationError.details),
        JSON.stringify(authenticationError),
        String(authenticationError),
        entries.join('\n'),
      ].join('\n');
      expect(diagnostics).not.toContain(String(upstreamNumericCode));
      expectSecretsAbsent(diagnostics, [
        statusSecret,
        headerNameSecret,
        headerValueSecret,
        bodySecret,
      ]);
    },
  );

  it('single-flights concurrent refresh callers through one token request and save', async () => {
    const storage = createStorage({
      accessToken: 'oldHostedAccess_8Dd1Vc',
      refreshToken: 'oldHostedRefresh_9Ee0Ub',
      tokenExpiry: '2026-01-01T00:00:00.000Z',
      oauthClientId: 'android',
    });
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    fetchMock.mockResolvedValue(tokenResponse(validTokenBody()));

    await Promise.all([auth.refreshTokens(), auth.refreshTokens(), auth.refreshTokens()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  it('serializes public persistence behind token capture without deadlocking', async () => {
    let releaseSave = (): void => undefined;
    const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
    let markSaveStarted = (): void => undefined;
    const saveStarted = new Promise<void>((resolve) => { markSaveStarted = resolve; });
    const storage = createStorage({
      accessToken: 'oldHostedAccess_0Ff9Ta',
      refreshToken: 'oldHostedRefresh_1Gg8Sz',
      tokenExpiry: '2026-01-01T00:00:00.000Z',
      oauthClientId: 'android',
    }, async () => {
      markSaveStarted();
      await saveGate;
    });
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    fetchMock.mockResolvedValueOnce(tokenResponse(validTokenBody()));

    const refresh = auth.refreshTokens();
    await saveStarted;
    const persistence = auth.persistCurrentState();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const savesBeforeRelease = storage.save.mock.calls.length;
    releaseSave();
    await Promise.all([refresh, persistence]);

    expect(savesBeforeRelease).toBe(1);
    expect(storage.save).toHaveBeenCalledTimes(2);
  });

  it('keeps newest hosted completion durable when an older refresh save rejects', async () => {
    let rejectOlderSave = (_error: Error): void => undefined;
    const olderSaveGate = new Promise<void>((_resolve, reject) => { rejectOlderSave = reject; });
    let markOlderSaveStarted = (): void => undefined;
    const olderSaveStarted = new Promise<void>((resolve) => { markOlderSaveStarted = resolve; });
    let saveCount = 0;
    let durableState: BlinkAuthState | null = null;
    const initialState: BlinkAuthState = {
      accessToken: 'initialHostedAccess_2Hh7Ry',
      refreshToken: 'initialHostedRefresh_3Ii6Qx',
      tokenExpiry: '2026-01-01T00:00:00.000Z',
      oauthClientId: 'android',
    };
    const storage = createStorage(initialState, async (state) => {
      saveCount += 1;
      if (saveCount === 1) {
        markOlderSaveStarted();
        await olderSaveGate;
      }
      durableState = { ...state };
    });
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    const { pending, callbackUrl } = await startHostedLogin(auth);
    fetchMock
      .mockResolvedValueOnce(tokenResponse(validTokenBody({
        access_token: 'olderRefreshAccess_4Jj5Pw',
        refresh_token: 'olderRefreshToken_5Kk4Ov',
      })))
      .mockResolvedValueOnce(tokenResponse(validTokenBody({
        access_token: 'newerHostedAccess_6Ll3Nu',
        refresh_token: 'newerHostedRefresh_7Mm2Mt',
      })));

    const olderRefresh = auth.refreshTokens();
    const olderOutcome = olderRefresh.then(
      () => null,
      (error: unknown) => error,
    );
    await olderSaveStarted;
    const newerCompletion = auth.completeHostedLogin(pending.flowId, callbackUrl);
    await new Promise<void>((resolve) => setImmediate(resolve));
    rejectOlderSave(new Error('older-save-rejected'));

    expect(await olderOutcome).toMatchObject({ category: 'storage' });
    await newerCompletion;
    expect(auth.getAccessToken()).toBe('newerHostedAccess_6Ll3Nu');
    expect(auth.getRefreshToken()).toBe('newerHostedRefresh_7Mm2Mt');
    expect(durableState).toEqual(expect.objectContaining({
      accessToken: 'newerHostedAccess_6Ll3Nu',
      refreshToken: 'newerHostedRefresh_7Mm2Mt',
      oauthClientId: 'android',
    }));
  });

  it('serializes hosted completion after an in-flight refresh network transition', async () => {
    let releaseRefreshResponse = (_response: Response): void => undefined;
    const refreshResponseGate = new Promise<Response>((resolve) => {
      releaseRefreshResponse = resolve;
    });
    let markRefreshFetchStarted = (): void => undefined;
    const refreshFetchStarted = new Promise<void>((resolve) => {
      markRefreshFetchStarted = resolve;
    });
    let durableState: BlinkAuthState | null = null;
    const storage = createStorage({
      accessToken: 'initialHostedAccess_8Nn1Ls',
      refreshToken: 'initialHostedRefresh_9Oo0Kr',
      tokenExpiry: '2026-01-01T00:00:00.000Z',
      oauthClientId: 'android',
    }, async (state) => { durableState = { ...state }; });
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    const { pending, callbackUrl } = await startHostedLogin(auth);
    fetchMock
      .mockImplementationOnce(async () => {
        markRefreshFetchStarted();
        return refreshResponseGate;
      })
      .mockResolvedValueOnce(tokenResponse(validTokenBody({
        access_token: 'newestHostedAccess_0Pp9Jq',
        refresh_token: 'newestHostedRefresh_1Qq8Ip',
      })));

    const refresh = auth.refreshTokens();
    await refreshFetchStarted;
    const completion = auth.completeHostedLogin(pending.flowId, callbackUrl);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const fetchesBeforeRefreshReleased = fetchMock.mock.calls.length;
    releaseRefreshResponse(tokenResponse(validTokenBody({
      access_token: 'olderRefreshAccess_2Rr7Ho',
      refresh_token: 'olderRefreshToken_3Ss6Gn',
    })));

    await Promise.all([refresh, completion]);
    expect(fetchesBeforeRefreshReleased).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(auth.getAccessToken()).toBe('newestHostedAccess_0Pp9Jq');
    expect(auth.getRefreshToken()).toBe('newestHostedRefresh_1Qq8Ip');
    expect(durableState).toEqual(expect.objectContaining({
      accessToken: 'newestHostedAccess_0Pp9Jq',
      refreshToken: 'newestHostedRefresh_1Qq8Ip',
      oauthClientId: 'android',
    }));
  });

  it.each([
    ['profile-less', undefined],
    ['explicit iOS', 'ios' as const],
  ])(
    'recovers a failed legacy state load for %s configuration and persists one replacement',
    async (_description, oauthClientId) => {
      const storage = createStorage(null);
      storage.load.mockRejectedValue(new Error(STORAGE_LOAD_FAILURE));
      const { logger, entries } = createLogger();
      const auth = new BlinkAuth(makeConfig(storage, logger, {
        email: ' legacy@example.com ',
        password: 'legacy-password',
        ...(oauthClientId === undefined ? {} : { oauthClientId }),
      }));
      queueLegacyLoginResponses(fetchMock);

      await auth.ensureValidToken();
      await auth.ensureValidToken();

      expect(storage.load).toHaveBeenCalledTimes(1);
      expect(storage.save).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(auth.getAccessToken()).toBe('replacementAccess_4Pd7Ku');
      expect(entries.join('\n')).not.toContain(STORAGE_LOAD_FAILURE);
    },
  );

  it('keeps failed state loads strict for configured Android despite legacy credentials', async () => {
    const storage = createStorage(null);
    storage.load.mockRejectedValue(new Error(STORAGE_LOAD_FAILURE));
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger, {
      email: ' legacy@example.com ',
      password: 'legacy-password',
      oauthClientId: 'android',
    }));
    const loginSpy = jest.spyOn(auth, 'login').mockResolvedValue(undefined);

    await expect(auth.ensureValidToken()).rejects.toThrow(AUTH_STATE_LOAD_FAILED);

    expect(loginSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps persisted-tier loading strict for configured Android despite legacy credentials', async () => {
    const storage = createStorage(null);
    storage.load.mockRejectedValue(new Error(STORAGE_LOAD_FAILURE));
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger, {
      email: 'legacy@example.com',
      password: 'legacy-password',
      oauthClientId: 'android',
    }));

    await expect(auth.getPersistedTier()).rejects.toThrow(AUTH_STATE_LOAD_FAILED);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps failed state loads fatal without legacy credentials', async () => {
    const storage = createStorage(null);
    storage.load.mockRejectedValueOnce(new Error(STORAGE_LOAD_FAILURE));
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));

    await expect(auth.ensureValidToken()).rejects.toThrow(
      AUTH_STATE_LOAD_FAILED,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not report legacy load recovery success when replacement persistence fails', async () => {
    const storageError = new Error(STORAGE_FAILURE);
    const storage = createStorage(null, async () => { throw storageError; });
    storage.load.mockRejectedValueOnce(new Error(STORAGE_LOAD_FAILURE));
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger, {
      email: 'legacy@example.com',
      password: 'legacy-password',
    }));
    queueLegacyLoginResponses(fetchMock);

    await expect(auth.ensureValidToken()).rejects.toBe(storageError);
    expect(auth.getAccessToken()).toBeNull();
    expect(storage.save).toHaveBeenCalledTimes(1);
  });
  it.each([
    { accessToken: 123 }, { refreshToken: {} }, { tier: {} },
    { oauthClientId: 'amazon' }, { oauthClientId: 'unknown' },
    { tokenExpiry: 'invalid' }, { accountId: -1 },
  ])('rejects malformed persisted state before token use: %j', async (invalid) => {
    const storage = createStorage({
      accessToken: ACCESS_TOKEN, tokenExpiry: new Date(Date.now() + 86_400_000).toISOString(),
      ...invalid,
    } as BlinkAuthState);
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    await expect(auth.ensureValidToken()).rejects.toThrow(AUTH_STATE_LOAD_FAILED);
    expect(auth.getAccessToken()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([429, 503])('retains unexpired hosted token during temporary refresh HTTP %s', async (status) => {
    jest.useFakeTimers();
    try {
      const storage = createStorage({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN,
        oauthClientId: 'android', tokenExpiry: new Date(Date.now() + 1_800_000).toISOString() });
      const { logger } = createLogger();
      const auth = new BlinkAuth(makeConfig(storage, logger));
      fetchMock.mockImplementation(async () => tokenResponse({}, { status }));
      const result = auth.ensureValidToken();
      await jest.runAllTimersAsync();
      await expect(result).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(auth.getAccessToken()).toBe(ACCESS_TOKEN);
      expect(storage.save).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });

  it('does not relogin or use an expired token during a transport outage', async () => {
    jest.useFakeTimers();
    try {
      const storage = createStorage({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN,
        oauthClientId: 'android', tokenExpiry: new Date(Date.now() - 1).toISOString() });
      const { logger } = createLogger();
      const auth = new BlinkAuth(makeConfig(storage, logger));
      fetchMock.mockRejectedValue(new Error('transport secret'));
      const result = auth.ensureValidToken().catch(error => error);
      await jest.runAllTimersAsync();
      expect(await result).toMatchObject({ category: 'temporary' });
      expect(storage.save).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });

  it('single-flights concurrent legacy login without overwriting the PKCE session', async () => {
    const storage = createStorage(null);
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger, {
      email: 'legacy@example.com', password: 'legacy-password',
    }));
    queueLegacyLoginResponses(fetchMock);
    await Promise.all([auth.login(), auth.login(), auth.login()]);
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(auth.getAccessToken()).toBe('replacementAccess_4Pd7Ku');
  });

  it.each(['headers', 'body'])('bounds a stalled OAuth %s request and releases refresh single-flight', async (phase) => {
    jest.useFakeTimers();
    try {
      const storage = createStorage({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN,
        oauthClientId: 'android', tokenExpiry: new Date(Date.now() - 1).toISOString() });
      const { logger } = createLogger();
      const auth = new BlinkAuth(makeConfig(storage, logger));
      fetchMock.mockImplementation(async () => phase === 'headers'
        ? new Promise<Response>(() => undefined)
        : { ok: true, status: 200, json: () => new Promise(() => undefined) } as unknown as Response);
      const failed = auth.refreshTokens().catch(error => error);
      await jest.runAllTimersAsync();
      expect(await failed).toBeInstanceOf(BlinkTokenRefreshError);
      fetchMock.mockResolvedValueOnce(successfulTokenResponse());
      await expect(auth.refreshTokens()).resolves.toBeUndefined();
      expect(storage.save).toHaveBeenCalledTimes(1);
    } finally { jest.useRealTimers(); }
  });

  it('recovers malformed durable auth through a new hosted sign-in and preserves a backup', async () => {
    const authPath = path.join(directory, '.blink-auth.json');
    await fs.writeFile(authPath, '{broken-json', { mode: 0o600 });
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(createStorage(null), logger, {
      authStorage: undefined, authStoragePath: authPath,
    }));
    const { pending, callbackUrl } = await startHostedLogin(auth);
    fetchMock.mockResolvedValueOnce(successfulTokenResponse());
    await auth.completeHostedLogin(pending.flowId, callbackUrl);
    expect(await readOwnerOnlyJsonFile<BlinkAuthState>(authPath)).toMatchObject({ accessToken: ACCESS_TOKEN });
    const backups = (await fs.readdir(directory)).filter(name => name.includes('.invalid-'));
    expect(backups).toHaveLength(1);
    expect(await readOwnerOnlyJsonFile(path.join(directory, backups[0]))).toBe('{broken-json');
    expect((await fs.stat(path.join(directory, backups[0]))).mode & 0o777).toBe(0o600);
  });

  it('honors clear during an initial legacy sign-in even while the auth file is absent', async () => {
    const authPath = path.join(directory, '.blink-auth.json');
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(createStorage(null), logger, {
      authStorage: undefined, authStoragePath: authPath,
      email: 'legacy@example.com', password: 'legacy-password',
    }));
    let started!: () => void;
    let release!: () => void;
    const startedPromise = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    queueLegacyLoginResponses(fetchMock);
    // Gate the first queued response by wrapping the mock, preserving its response sequence.
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      const response = fetchMock(...args);
      if (fetchMock.mock.calls.length === 1) { started(); await gate; }
      return response;
    }) as typeof fetch;
    const outcome = auth.login().catch(error => error);
    await startedPromise;
    await new FileAuthStorage(authPath).clear();
    release();
    expect(await outcome).toBeInstanceOf(AuthStateChangedError);
    await expect(fs.access(authPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(auth.getAccessToken()).toBeNull();
  });

  it('rejects an unsupported configured OAuth profile rather than submitting iOS credentials', async () => {
    const storage = createStorage(null);
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger, {
      oauthClientId: 'amazon', email: 'legacy@example.com', password: 'legacy-password',
    }));
    await expect(auth.ensureValidToken()).rejects.toThrow('Unsupported Blink OAuth client profile');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects token endpoint redirects while preserving manual legacy authorization redirects', async () => {
    const storage = createStorage(null);
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger, { email: 'legacy@example.com', password: 'legacy-password' }));
    queueLegacyLoginResponses(fetchMock);
    await auth.login();
    const tokenRequests = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/oauth/token'));
    expect(tokenRequests).toHaveLength(1);
    expect(tokenRequests[0][1]).toMatchObject({ method: 'POST', redirect: 'error' });
    const authorizeRequests = fetchMock.mock.calls.filter(([url]) => String(url).includes('/oauth/v2/authorize'));
    expect(authorizeRequests[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it.each([new Error('response-body-secret'), new SyntaxError('response-body-secret')])(
    'never exposes a rejected legacy response body read: %s', async (failure) => {
      const storage = createStorage(null);
      const { logger, entries } = createLogger();
      const auth = new BlinkAuth(makeConfig(storage, logger, { email: 'legacy@example.com', password: 'legacy-password' }));
      fetchMock.mockResolvedValueOnce({ ok: true, status: 302, headers: responseHeaders() } as Response);
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, headers: responseHeaders(),
        text: async () => { throw failure; } } as unknown as Response);
      const outcome = await auth.login().catch(error => error);
      expect(outcome).toBeInstanceOf(BlinkTokenRefreshError);
      expect(outcome.category).toBe(failure instanceof SyntaxError ? 'response' : 'temporary');
      expect(`${String(outcome)} ${JSON.stringify(outcome)} ${entries.join(' ')}`).not.toContain('response-body-secret');
    },
  );

  it('cancels unused refresh response bodies before retrying', async () => {
    jest.useFakeTimers();
    try {
      const storage = createStorage({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN,
        oauthClientId: 'android', tokenExpiry: new Date(Date.now() - 1).toISOString() });
      const { logger } = createLogger();
      const auth = new BlinkAuth(makeConfig(storage, logger));
      let canceled = false;
      fetchMock.mockResolvedValueOnce({ ok: false, status: 503,
        body: { cancel: async () => { canceled = true; } } } as unknown as Response);
      fetchMock.mockImplementationOnce(async () => {
        expect(canceled).toBe(true);
        return successfulTokenResponse();
      });
      const result = auth.refreshTokens();
      await jest.runAllTimersAsync();
      await result;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally { jest.useRealTimers(); }
  });

  it('shares concurrent 2FA completion and login without resetting the active challenge', async () => {
    const storage = createStorage(null);
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger, { email: 'legacy@example.com', password: 'legacy-password' }));
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 302, headers: responseHeaders() } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: responseHeaders(),
        text: async () => '<input name="_token" value="csrf">' } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: responseHeaders(),
        text: async () => '<input name="_token" value="csrf2">2FA verification code' } as Response);
    await expect(auth.login()).rejects.toBeInstanceOf(Blink2FARequiredError);
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 302, headers: responseHeaders({ location: '/oauth/v2/authorize' }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 302, headers: responseHeaders({ location: 'immedia-blink://applinks.blink.com/signin/callback?code=abc' }) } as Response)
      .mockResolvedValueOnce(successfulTokenResponse());
    await Promise.all([auth.complete2FA('123456'), auth.complete2FA('123456'), auth.login()]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/2fa/verify'))).toHaveLength(1);
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(auth.getAccessToken()).toBe(ACCESS_TOKEN);
  });

  it.each([
    'https://attacker.example/callback?code=callback-secret',
    'immedia-blink://attacker.example/signin/callback?code=callback-secret',
    'immedia-blink://applinks.blink.com/wrong?code=callback-secret',
    'immedia-blink://user:password@applinks.blink.com/signin/callback?code=callback-secret',
    'immedia-blink://applinks.blink.com/signin/callback?code=callback-secret#fragment',
    'immedia-blink://applinks.blink.com/signin/callback?code=callback-secret&code=other',
    'immedia-blink://applinks.blink.com/signin/callback?code=callback-secret&state=a&state=b',
    'immedia-blink://applinks.blink.com/signin/callback?code=callback-secret&state=mismatch',
    'callback?code=callback-secret',
  ])('rejects an untrusted legacy callback before token exchange: %s', async (location) => {
    const storage = createStorage(null);
    const { logger, entries } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger, { email: 'legacy@example.com', password: 'legacy-password' }));
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 302, headers: responseHeaders() } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: responseHeaders(),
        text: async () => '<input name="_token" value="csrf">' } as Response)
      .mockResolvedValueOnce({ ok: true, status: 302, headers: responseHeaders({ location }) } as Response);
    await expect(auth.login()).rejects.toThrow('Invalid Blink OAuth callback');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(storage.save).not.toHaveBeenCalled();
    expect(entries.join(' ')).not.toContain('callback-secret');
  });

  it('discards unused manual redirect bodies during a successful legacy login', async () => {
    const storage = createStorage(null);
    const { logger } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger, { email: 'legacy@example.com', password: 'legacy-password' }));
    const discarded: string[] = [];
    const body = (name: string) => ({ cancel: async () => { discarded.push(name); } });
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 302, headers: responseHeaders(), body: body('initial authorize') } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: responseHeaders(),
        text: async () => '<input name="_token" value="csrf">' } as Response)
      .mockResolvedValueOnce({ ok: true, status: 302, headers: responseHeaders({ location: '/oauth/v2/authorize' }), body: body('signin') } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 302,
        headers: responseHeaders({ location: 'immedia-blink://applinks.blink.com/signin/callback?code=abc' }), body: body('final authorize') } as unknown as Response)
      .mockResolvedValueOnce(successfulTokenResponse());
    await auth.login();
    expect(discarded).toEqual(['initial authorize', 'signin', 'final authorize']);
    expect(storage.save).toHaveBeenCalledTimes(1);
  });

});
