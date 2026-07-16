import { BlinkApi } from '../../src/blink-api/client';
import { BlinkAuth } from '../../src/blink-api/auth';
import { BlinkAuthState, BlinkAuthStorage, BlinkConfig } from '../../src/types';

type RoutedHttpDouble = {
  get: jest.Mock;
  post: jest.Mock;
  setBaseUrl: jest.Mock;
};

type MutableBlinkApi = {
  login: BlinkApi['login'];
  getHomescreen: BlinkApi['getHomescreen'];
  armNetwork: BlinkApi['armNetwork'];
  disarmNetwork: BlinkApi['disarmNetwork'];
  pollCommand: BlinkApi['pollCommand'];
  auth: {
    login: jest.Mock;
    ensureValidToken: jest.Mock;
    getPersistedTier: jest.Mock;
    getAccountId: jest.Mock;
    getClientId: jest.Mock;
    is2FAPending: jest.Mock;
    complete2FA: jest.Mock;
    beginHostedLogin: jest.Mock;
    completeHostedLogin: jest.Mock;
    cancelHostedLogin: jest.Mock;
    persistCurrentState: jest.Mock;
    setAccountId: jest.Mock;
    setClientId: jest.Mock;
    setAccountMetadata: jest.Mock;
  };
  http: RoutedHttpDouble;
  sharedHttp: RoutedHttpDouble;
  sharedRootHttp: RoutedHttpDouble;
  accountId: number | null;
};

type HostedBlinkApi = {
  beginHostedLogin: () => Promise<{ authorizationUrl: string; flowId: string; expiresAt: string }>;
  completeHostedLogin: (flowId: string, callbackUrl: string) => Promise<{
    authenticated: true;
    verified: boolean;
    verificationRequirement?: 'client' | 'account' | 'connection';
    accountId?: number;
    clientId?: number;
    email?: string;
    tier?: string;
    networkCount: number;
    cameraCount: number;
  }>;
  cancelHostedLogin: () => Promise<void>;
};

type ActualBlinkApiInternals = {
  auth: BlinkAuth;
  http: RoutedHttpDouble;
  sharedHttp: RoutedHttpDouble;
  sharedRootHttp: RoutedHttpDouble;
};

describe('BlinkApi', () => {
  const config: BlinkConfig = {
    email: 'user@example.com',
    password: 'password',
    hardwareId: 'hardware-id',
  };

  const createApi = (overrides: Partial<BlinkConfig> = {}) => {
    const runtimeConfig = { ...config, ...overrides };
    const api = new BlinkApi(runtimeConfig) as unknown as MutableBlinkApi;
    api.auth.login = jest.fn().mockResolvedValue(undefined);
    api.auth.ensureValidToken = jest.fn().mockResolvedValue(undefined);
    api.auth.getPersistedTier = jest.fn().mockResolvedValue(overrides.tier ?? null);
    api.auth.getAccountId = jest.fn().mockReturnValue(10);
    api.auth.getClientId = jest.fn().mockReturnValue(12345);
    api.auth.is2FAPending = jest.fn().mockReturnValue(false);
    api.auth.complete2FA = jest.fn().mockResolvedValue(undefined);
    api.auth.beginHostedLogin = jest.fn();
    api.auth.completeHostedLogin = jest.fn().mockResolvedValue(undefined);
    api.auth.cancelHostedLogin = jest.fn().mockResolvedValue(undefined);
    api.auth.persistCurrentState = jest.fn().mockResolvedValue(undefined);
    api.auth.setAccountId = jest.fn();
    api.auth.setClientId = jest.fn();
    api.auth.setAccountMetadata = jest.fn();
    api.http = {
      get: jest.fn(),
      post: jest.fn(),
      setBaseUrl: jest.fn(),
    };
    api.sharedHttp = api.http;
    api.sharedRootHttp = api.http;
    return { api, auth: api.auth, http: api.http, runtimeConfig };
  };

  const createRoutedHttp = (
    initialBaseUrl: string,
    events: string[],
    getResponse: (path: string) => unknown | Promise<unknown>,
  ): RoutedHttpDouble => {
    let baseUrl = initialBaseUrl;
    return {
      get: jest.fn(async (path: string) => {
        events.push(`${baseUrl}${path}`);
        return getResponse(path);
      }),
      post: jest.fn().mockResolvedValue({}),
      setBaseUrl: jest.fn((nextBaseUrl: string) => {
        baseUrl = nextBaseUrl;
      }),
    };
  };

  const createSeededHostedApi = async (configOverrides: Partial<BlinkConfig> = {}) => {
    const events: string[] = [];
    const savedStates: BlinkAuthState[] = [];
    const seededState: BlinkAuthState = {
      accessToken: 'durable-access-token',
      refreshToken: 'durable-refresh-token',
      tokenExpiry: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      oauthClientId: 'android',
      accountId: null,
      clientId: null,
      region: 'us',
      tier: 'prod',
      email: 'old@example.com',
      hardwareId: 'hosted-hardware-id',
    };
    const storage: BlinkAuthStorage = {
      load: jest.fn(async () => ({ ...seededState })),
      save: jest.fn(async (state: BlinkAuthState) => {
        savedStates.push({ ...state });
        events.push('persist');
      }),
      clear: jest.fn(async () => undefined),
    };
    const api = new BlinkApi({
      email: 'old@example.com',
      password: '',
      hardwareId: 'hosted-hardware-id',
      oauthClientId: 'android',
      authStorage: storage,
      tier: 'prod',
      ...configOverrides,
    });
    const internals = api as unknown as ActualBlinkApiInternals;
    await internals.auth.ensureValidToken();
    const hostedCompletion = jest
      .spyOn(internals.auth, 'completeHostedLogin')
      .mockResolvedValue(undefined);
    return {
      api: api as unknown as HostedBlinkApi,
      internals,
      events,
      savedStates,
      hostedCompletion,
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs in and stores account id', async () => {
    const { api, auth } = createApi();
    auth.getAccountId.mockReturnValue(99);

    await api.login();

    expect(auth.ensureValidToken).toHaveBeenCalled();
    expect((api as unknown as { accountId: number | null }).accountId).toBe(99);
  });

  it('preserves a legacy session tier when temporary discovery calls fail', async () => {
    const { api, auth, http, runtimeConfig } = createApi({ tier: 'prde' });
    http.get.mockRejectedValue(new Error('temporaryConnectionFailure_9Qm4Ls'));

    await api.login();

    expect(runtimeConfig.tier).toBe('prde');
    expect(auth.setAccountMetadata).toHaveBeenCalledWith(expect.objectContaining({
      tier: 'prde',
    }));
  });

  it('preserves the legacy failed-account-verification error message', async () => {
    const { api, http } = createApi({ accountVerificationCode: 'invalid-pin' });
    http.get
      .mockResolvedValueOnce({ account_id: 10, tier: 'prod' })
      .mockResolvedValueOnce({
        account_id: 10,
        client_id: 12345,
        account_verification_required: true,
      });
    http.post.mockResolvedValue({ valid: false });

    await expect(api.login()).rejects.toThrow('Blink account verification failed');
  });

  it('delegates hosted login start and cancellation to BlinkAuth', async () => {
    const { api, auth } = createApi();
    const hostedApi = api as unknown as HostedBlinkApi;
    const start = {
      authorizationUrl: 'https://api.oauth.blink.com/oauth/v2/authorize?redacted=true',
      flowId: 'opaque-flow-id',
      expiresAt: '2030-01-01T00:00:00.000Z',
    };
    auth.beginHostedLogin.mockResolvedValue(start);

    await expect(hostedApi.beginHostedLogin()).resolves.toEqual(start);
    await hostedApi.cancelHostedLogin();

    expect(auth.beginHostedLogin).toHaveBeenCalledTimes(1);
    expect(auth.cancelHostedLogin).toHaveBeenCalledTimes(1);
  });

  it('discovers the tier before account and homescreen calls, then durably persists metadata', async () => {
    const { api, internals, events, savedStates, hostedCompletion } = await createSeededHostedApi();
    internals.http = createRoutedHttp(
      'https://rest-prod.immedia-semi.com/api/',
      events,
      async (path) => {
        if (path === 'v1/users/tier_info') {
          return { account_id: 42, tier: 'prde' };
        }
        if (path === 'v2/users/info') {
          return {
            account_id: 42,
            client_id: 99,
            email: 'hosted@example.com',
            region: 'eu',
            tier: 'prde',
          };
        }
        throw new Error(`Unexpected REST path: ${path}`);
      },
    );
    internals.sharedHttp = createRoutedHttp(
      'https://rest-prod.immedia-semi.com/api/',
      events,
      async () => ({
        account: { account_id: 42 },
        networks: [{ id: 1 }, { id: 2 }],
        cameras: [{ id: 3 }],
        doorbells: [],
        owls: [],
        sync_modules: [],
      }),
    );
    internals.sharedRootHttp = createRoutedHttp(
      'https://rest-prod.immedia-semi.com/',
      events,
      async () => ({}),
    );

    const result = await api.completeHostedLogin('opaque-flow', 'https://callback.invalid/redacted');

    expect(events).toEqual([
      'https://rest-prod.immedia-semi.com/api/v1/users/tier_info',
      'https://rest-prde.immedia-semi.com/api/v2/users/info',
      'https://rest-prde.immedia-semi.com/api/v4/accounts/42/homescreen',
      'persist',
    ]);
    expect(hostedCompletion).toHaveBeenCalledWith(
      'opaque-flow',
      'https://callback.invalid/redacted',
    );
    expect(internals.http.setBaseUrl).toHaveBeenLastCalledWith(
      'https://rest-prde.immedia-semi.com/api/',
    );
    expect(internals.sharedHttp.setBaseUrl).toHaveBeenLastCalledWith(
      'https://rest-prde.immedia-semi.com/api/',
    );
    expect(internals.sharedRootHttp.setBaseUrl).toHaveBeenLastCalledWith(
      'https://rest-prde.immedia-semi.com/',
    );
    expect(result).toEqual({
      authenticated: true,
      verified: true,
      accountId: 42,
      clientId: 99,
      email: 'hosted@example.com',
      tier: 'prde',
      networkCount: 2,
      cameraCount: 1,
    });
    expect(savedStates).toHaveLength(1);
    expect(savedStates[0]).toEqual(expect.objectContaining({
      accessToken: 'durable-access-token',
      refreshToken: 'durable-refresh-token',
      accountId: 42,
      clientId: 99,
      region: 'eu',
      tier: 'prde',
      email: 'hosted@example.com',
    }));
  });

  it('preserves an explicitly different shared tier while discovering the account tier', async () => {
    const { api, internals, events } = await createSeededHostedApi({ sharedTier: 'e005' });
    internals.http = createRoutedHttp(
      'https://rest-prod.immedia-semi.com/api/',
      events,
      async (path) => path === 'v1/users/tier_info'
        ? { account_id: 42, tier: 'prde' }
        : { account_id: 42, client_id: 99, region: 'eu', tier: 'prde' },
    );
    internals.sharedHttp = createRoutedHttp(
      'https://rest-e005.immedia-semi.com/api/',
      events,
      async () => ({
        account: { account_id: 42 },
        networks: [],
        cameras: [],
        doorbells: [],
        owls: [],
        sync_modules: [],
      }),
    );
    internals.sharedRootHttp = createRoutedHttp(
      'https://rest-e005.immedia-semi.com/',
      events,
      async () => ({}),
    );

    await api.completeHostedLogin('opaque-flow', 'https://callback.invalid/redacted');

    expect(events).toEqual([
      'https://rest-prod.immedia-semi.com/api/v1/users/tier_info',
      'https://rest-prde.immedia-semi.com/api/v2/users/info',
      'https://rest-e005.immedia-semi.com/api/v4/accounts/42/homescreen',
      'persist',
    ]);
  });

  it.each([
    ['client', { client_verification_required: true }],
    ['account', { account_verification_required: true }],
  ] as const)(
    'returns authenticated but unverified when %s verification is required',
    async (requirement, verificationFlags) => {
      const { api, internals, events, savedStates } = await createSeededHostedApi();
      internals.http = createRoutedHttp(
        'https://rest-prod.immedia-semi.com/api/',
        events,
        async (path) => path === 'v1/users/tier_info'
          ? { account_id: 42, tier: 'prde' }
          : {
            account_id: 42,
            client_id: 99,
            email: 'hosted@example.com',
            region: 'eu',
            tier: 'prde',
            ...verificationFlags,
          },
      );
      internals.sharedHttp = createRoutedHttp(
        'https://rest-prod.immedia-semi.com/api/',
        events,
        async () => {
          throw new Error('homescreenShouldNotRun_4Jd8Wq');
        },
      );
      internals.sharedRootHttp = createRoutedHttp(
        'https://rest-prod.immedia-semi.com/',
        events,
        async () => ({}),
      );

      const result = await api.completeHostedLogin('opaque-flow', 'https://callback.invalid/redacted');

      expect(result).toEqual(expect.objectContaining({
        authenticated: true,
        verified: false,
        verificationRequirement: requirement,
        networkCount: 0,
        cameraCount: 0,
      }));
      expect(JSON.stringify(result)).not.toContain(`Blink ${requirement} verification required`);
      expect(internals.sharedHttp.get).not.toHaveBeenCalled();
      expect(savedStates.at(-1)?.accessToken).toBe('durable-access-token');
    },
  );

  it('returns a redacted connection result when homescreen verification fails without losing tokens', async () => {
    const upstreamSecret = 'homescreenUpstreamSecret_6Ny2Zp';
    const { api, internals, events, savedStates } = await createSeededHostedApi();
    internals.http = createRoutedHttp(
      'https://rest-prod.immedia-semi.com/api/',
      events,
      async (path) => path === 'v1/users/tier_info'
        ? { account_id: 42, tier: 'prde' }
        : { account_id: 42, client_id: 99, email: 'hosted@example.com', region: 'eu', tier: 'prde' },
    );
    internals.sharedHttp = createRoutedHttp(
      'https://rest-prod.immedia-semi.com/api/',
      events,
      async () => {
        throw new Error(upstreamSecret);
      },
    );
    internals.sharedRootHttp = createRoutedHttp(
      'https://rest-prod.immedia-semi.com/',
      events,
      async () => ({}),
    );

    const result = await api.completeHostedLogin('opaque-flow', 'https://callback.invalid/redacted');

    expect(result).toEqual(expect.objectContaining({
      authenticated: true,
      verified: false,
      verificationRequirement: 'connection',
      networkCount: 0,
      cameraCount: 0,
    }));
    expect(JSON.stringify(result)).not.toContain(upstreamSecret);
    expect(savedStates.at(-1)?.accessToken).toBe('durable-access-token');
  });

  it('does not hide account-info failure as a verified hosted login', async () => {
    const upstreamSecret = 'accountInfoUpstreamSecret_8Vt1Cx';
    const { api, internals, events, savedStates } = await createSeededHostedApi();
    internals.http = createRoutedHttp(
      'https://rest-prod.immedia-semi.com/api/',
      events,
      async (path) => {
        if (path === 'v1/users/tier_info') {
          return { account_id: 42, tier: 'prde' };
        }
        throw new Error(upstreamSecret);
      },
    );
    internals.sharedHttp = createRoutedHttp(
      'https://rest-prod.immedia-semi.com/api/',
      events,
      async () => ({ account: { account_id: 42 }, networks: [], cameras: [] }),
    );
    internals.sharedRootHttp = createRoutedHttp(
      'https://rest-prod.immedia-semi.com/',
      events,
      async () => ({}),
    );

    const result = await api.completeHostedLogin('opaque-flow', 'https://callback.invalid/redacted');

    expect(result.verificationRequirement).toBe('connection');
    expect(result.verified).toBe(false);
    expect(JSON.stringify(result)).not.toContain(upstreamSecret);
    expect(internals.sharedHttp.get).not.toHaveBeenCalled();
    expect(savedStates.at(-1)?.accessToken).toBe('durable-access-token');
  });

  it('recovers through BlinkApi.login when persisted tier loading fails but credentials exist', async () => {
    const storage: BlinkAuthStorage = {
      load: jest.fn(async () => { throw new Error('persistedTierLoadSecret_1At9Xq'); }),
      save: jest.fn(async (_state: BlinkAuthState) => undefined),
      clear: jest.fn(async () => undefined),
    };
    const headers = (values: Record<string, string> = {}): Headers => {
      const result = new Headers(values);
      (result as unknown as { getSetCookie: () => string[] }).getSetCookie = () => [];
      return result;
    };
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 302, statusText: 'Found', headers: headers() })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '<input name="_token" value="replacement-csrf">',
        headers: headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 302,
        statusText: 'Found',
        headers: headers({ location: 'callback?code=replacement-code' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          access_token: 'replacement-access',
          refresh_token: 'replacement-refresh',
          expires_in: 7_200,
          token_type: 'Bearer',
          account_id: 10,
          client_id: 12345,
        }),
        headers: headers({ 'token-auth': 'replacement-token-auth' }),
      }) as unknown as typeof fetch;
    const api = new BlinkApi({
      ...config,
      authStorage: storage,
    });
    jest.spyOn(
      api as unknown as { syncAccountInfoAndVerify: () => Promise<void> },
      'syncAccountInfoAndVerify',
    ).mockResolvedValue(undefined);

    await api.login();

    expect(storage.load).toHaveBeenCalledTimes(2);
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it('does not start legacy authorization when Android persisted-tier loading fails', async () => {
    const storage: BlinkAuthStorage = {
      load: jest.fn(async () => { throw new Error('androidPersistedTierLoadSecret_2Bu8Wr'); }),
      save: jest.fn(async (_state: BlinkAuthState) => undefined),
      clear: jest.fn(async () => undefined),
    };
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    const api = new BlinkApi({
      ...config,
      oauthClientId: 'android',
      authStorage: storage,
    });
    const accountSync = jest.spyOn(
      api as unknown as { syncAccountInfoAndVerify: () => Promise<void> },
      'syncAccountInfoAndVerify',
    ).mockResolvedValue(undefined);

    await expect(api.login()).rejects.toThrow('Blink authentication state could not be loaded.');

    expect(storage.load).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(accountSync).not.toHaveBeenCalled();
  });

  it('fetches homescreen and updates account id from response', async () => {
    const { api, auth, http } = createApi();
    auth.getAccountId.mockReturnValue(7);
    http.get.mockResolvedValue({
      account: { account_id: 55 },
      networks: [],
      cameras: [],
      doorbells: [],
      owls: [],
      sync_modules: [],
    });

    const homescreen = await api.getHomescreen();

    expect(http.get).toHaveBeenCalledWith('v4/accounts/7/homescreen');
    expect(homescreen.account.account_id).toBe(55);
    expect((api as unknown as { accountId: number | null }).accountId).toBe(55);
  });

  it('arms and disarms networks using ensured account id', async () => {
    const { api, auth, http } = createApi();
    auth.getAccountId.mockReturnValue(3);
    http.post.mockResolvedValue({ command_id: 1 });

    await api.armNetwork(5);
    await api.disarmNetwork(5);

    expect(auth.ensureValidToken).toHaveBeenCalled();
    expect(http.post).toHaveBeenCalledWith('v1/accounts/3/networks/5/state/arm');
    expect(http.post).toHaveBeenCalledWith('v1/accounts/3/networks/5/state/disarm');
  });

  it('polls command status until completion', async () => {
    const { api, http } = createApi();
    (api as unknown as { accountId: number | null }).accountId = 1;
    http.get
      .mockResolvedValueOnce({ status: 'running', polling_interval: 0 })
      .mockResolvedValueOnce({ status: 'complete', complete: true });

    const status = await api.pollCommand(4, 99, 2);

    expect(http.get).toHaveBeenCalledTimes(2);
    expect(status.complete).toBe(true);
  });

  it('throws if command reports failure', async () => {
    const { api, http } = createApi();
    (api as unknown as { accountId: number | null }).accountId = 1;
    http.get.mockResolvedValue({ status: 'failed' });

    await expect(api.pollCommand(1, 2, 1)).rejects.toThrow('Blink command 2 failed');
  });
});
