import { BlinkApi } from '../../src/blink-api/client';
import { BlinkConfig } from '../../src/types';

type MutableBlinkApi = {
  login: BlinkApi['login'];
  getHomescreen: BlinkApi['getHomescreen'];
  armNetwork: BlinkApi['armNetwork'];
  disarmNetwork: BlinkApi['disarmNetwork'];
  pollCommand: BlinkApi['pollCommand'];
  auth: {
    login: jest.Mock;
    ensureValidToken: jest.Mock;
    getAccountId: jest.Mock;
    getClientId: jest.Mock;
    is2FAPending: jest.Mock;
    complete2FA: jest.Mock;
  };
  http: {
    get: jest.Mock;
    post: jest.Mock;
  };
  sharedHttp: {
    get: jest.Mock;
    post: jest.Mock;
  };
  sharedRootHttp: {
    get: jest.Mock;
    post: jest.Mock;
  };
  accountId: number | null;
};

describe('BlinkApi', () => {
  const config: BlinkConfig = {
    email: 'user@example.com',
    password: 'password',
    hardwareId: 'hardware-id',
  };

  const createApi = () => {
    const api = new BlinkApi(config) as unknown as MutableBlinkApi;
    api.auth.login = jest.fn().mockResolvedValue(undefined);
    api.auth.ensureValidToken = jest.fn().mockResolvedValue(undefined);
    api.auth.getAccountId = jest.fn().mockReturnValue(10);
    api.auth.getClientId = jest.fn().mockReturnValue(12345);
    api.auth.is2FAPending = jest.fn().mockReturnValue(false);
    api.auth.complete2FA = jest.fn().mockResolvedValue(undefined);
    api.http = { get: jest.fn(), post: jest.fn() } as MutableBlinkApi['http'];
    api.sharedHttp = api.http;
    api.sharedRootHttp = api.http;
    return { api, auth: api.auth, http: api.http };
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
