import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  BlinkAuth,
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
    fetchMock.mockResolvedValueOnce(successfulTokenResponse());

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
      accountId: 42,
      clientId: 100,
      region: 'eu',
      tier: 'prde',
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

  it('rejects completion and restores all nine prior fields when persistence fails', async () => {
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
    };
    const storageError = new Error(STORAGE_FAILURE);
    const storage = createStorage(previousState, async () => {
      throw storageError;
    });
    const { logger, entries } = createLogger();
    const consumeSpy = jest.spyOn(HostedOAuthCoordinator.prototype, 'consumeCallback');
    const auth = new BlinkAuth(makeConfig(storage, logger));
    const { pending, callbackUrl } = await startHostedLogin(auth);
    fetchMock.mockResolvedValueOnce(successfulTokenResponse());

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
    });
    const { logger, entries } = createLogger();
    const auth = new BlinkAuth(makeConfig(storage, logger));
    fetchMock.mockResolvedValueOnce(successfulTokenResponse());

    await auth.refreshTokens();

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
    }));
    expect(auth.getAuthHeaders()).toEqual({ Authorization: `Bearer ${ACCESS_TOKEN}` });
    expectSecretsAbsent(entries.join('\n'), [ACCESS_TOKEN, REFRESH_TOKEN, TOKEN_AUTH]);
  });

  it('maps hosted refresh persistence failure to fixed reauthentication and restores memory', async () => {
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

    expect(caught).toBeInstanceOf(BlinkHostedReauthenticationRequiredError);
    expect((caught as Error).message).toBe(HOSTED_REAUTH_ERROR);
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
      'Blink OAuth refresh failed: 400 Bad Request',
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
    expect((caught as Error).message).toBe(
      'Blink sign-in could not be completed. Start sign-in again.',
    );
    expectSecretsAbsent(`${(caught as Error).message}\n${entries.join('\n')}`, [
      AUTHORIZATION_CODE,
      CODE_VERIFIER,
      ACCESS_TOKEN,
      REFRESH_TOKEN,
      TOKEN_AUTH,
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
});
