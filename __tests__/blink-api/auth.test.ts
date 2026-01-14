import { BlinkAuth } from '../../src/blink-api/auth';
import { BlinkConfig } from '../../src/types';

describe('BlinkAuth', () => {
  const baseConfig: BlinkConfig = {
    email: 'user@example.com',
    password: 'password',
    hardwareId: 'hardware-id',
    twoFactorCode: '246810',
  };

  const mockFetch = () => {
    const fn = jest.fn();
    globalThis.fetch = fn as unknown as typeof fetch;
    return fn;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs in and stores tokens with token-auth header', async () => {
    const fetchMock = mockFetch();
    const responseBody = {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      token_type: 'Bearer' as const,
      scope: 'client',
      account_id: 42,
    };

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => responseBody,
      headers: new Headers({ 'TOKEN-AUTH': 'token-auth-header' }),
    });

    const auth = new BlinkAuth(baseConfig);
    await auth.login('135790');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = options.headers as Headers;
    expect(headers.get('2fa-code')).toBe('135790');
    expect(headers.get('hardware_id')).toBe(baseConfig.hardwareId);

    expect(auth.getAuthHeaders()).toEqual({
      Authorization: 'Bearer access-token',
      'TOKEN-AUTH': 'token-auth-header',
    });
    expect(auth.getAccountId()).toBe(42);
  });

  it('throws when login fails', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: 'bad credentials' }),
      text: async () => JSON.stringify({ error: 'bad credentials' }),
      headers: new Headers(),
    });

    const auth = new BlinkAuth(baseConfig);
    await expect(auth.login()).rejects.toThrow('Blink OAuth login failed: 401 Unauthorized');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes tokens after login', async () => {
    const fetchMock = mockFetch();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          token_type: 'Bearer' as const,
          scope: 'client',
        }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 7200,
          token_type: 'Bearer' as const,
          scope: 'client',
        }),
        headers: new Headers({ 'TOKEN-AUTH': 'new-token-auth' }),
      });

    const auth = new BlinkAuth(baseConfig);
    await auth.login();
    await auth.refreshTokens();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(auth.getAuthHeaders()).toEqual({
      Authorization: 'Bearer new-access',
      'TOKEN-AUTH': 'new-token-auth',
    });
  });

  it('ensures token validity by refreshing when nearing expiry', async () => {
    const fetchMock = mockFetch();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 1,
          token_type: 'Bearer' as const,
          scope: 'client',
        }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'refreshed-token',
          refresh_token: 'refreshed-refresh',
          expires_in: 3600,
          token_type: 'Bearer' as const,
          scope: 'client',
        }),
        headers: new Headers(),
      });

    const auth = new BlinkAuth(baseConfig);
    await auth.login();
    (auth as unknown as { tokenExpiry: Date }).tokenExpiry = new Date(Date.now() + 500);
    await auth.ensureValidToken();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(auth.getAuthHeaders().Authorization).toBe('Bearer refreshed-token');
  });

  it('getAuthHeaders throws if not logged in', () => {
    const auth = new BlinkAuth(baseConfig);
    expect(() => auth.getAuthHeaders()).toThrow('Access token not set. Call login first.');
  });
});
