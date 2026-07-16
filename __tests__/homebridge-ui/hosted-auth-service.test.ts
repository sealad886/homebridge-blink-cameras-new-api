import {
  AuthStatus,
  HostedAuthService,
  HostedAuthServiceError,
} from '../../src/homebridge-ui/hosted-auth-service';
import { BlinkHostedReauthenticationRequiredError } from '../../src/blink-api/auth';
import {
  BlinkApi,
  BlinkRestVerificationRequiredError,
} from '../../src/blink-api/client';
import {
  BlinkAuthState,
  BlinkConfig,
  BlinkHostedLoginResult,
  BlinkLogger,
} from '../../src/types';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let mockUiStorageRoot = '.';
const mockUiHandlers = new Map<string, (payload: unknown) => Promise<unknown>>();
const mockUiEvents: Array<{ event: string; data: unknown }> = [];

jest.mock('@homebridge/plugin-ui-utils', () => {
  class MockHomebridgePluginUiServer {
    get homebridgeStoragePath(): string {
      return mockUiStorageRoot;
    }

    get homebridgeConfigPath(): string {
      return path.join(mockUiStorageRoot, 'config.json');
    }

    onRequest(route: string, handler: (payload: unknown) => Promise<unknown>): void {
      mockUiHandlers.set(route, handler);
    }

    pushEvent(event: string, data: unknown): void {
      mockUiEvents.push({ event, data });
    }

    ready(): void {}
  }

  class MockRequestError extends Error {
    constructor(message: string, public readonly requestError: unknown) {
      super(message);
      this.name = 'RequestError';
    }
  }

  return {
    HomebridgePluginUiServer: MockHomebridgePluginUiServer,
    RequestError: MockRequestError,
  };
});

const {
  BlinkUiServer,
  redactSecrets,
} = require('../../src/homebridge-ui/server') as typeof import('../../src/homebridge-ui/server');
const { RequestError } = jest.requireMock('@homebridge/plugin-ui-utils') as {
  RequestError: new (message: string, requestError: unknown) => Error & { requestError: unknown };
};

interface ApiDouble {
  beginHostedLogin: jest.Mock;
  completeHostedLogin: jest.Mock;
  login: jest.Mock;
  verifyClientVerificationPin: jest.Mock;
  verifyAccountVerificationPin: jest.Mock;
  getHomescreen: jest.Mock;
  cancelHostedLogin: jest.Mock;
}

const createApiDouble = (result: BlinkHostedLoginResult = {
  authenticated: true,
  verified: true,
  email: 'persisted@example.com',
  accountId: 123,
  tier: 'prde',
  networkCount: 1,
  cameraCount: 2,
}): ApiDouble => ({
  beginHostedLogin: jest.fn().mockResolvedValue({
    authorizationUrl: 'https://api.oauth.blink.com/oauth/v2/authorize?safe=1',
    flowId: 'opaque-flow-id',
    expiresAt: '2026-07-16T12:15:00.000Z',
  }),
  completeHostedLogin: jest.fn().mockResolvedValue(result),
  login: jest.fn().mockResolvedValue(undefined),
  verifyClientVerificationPin: jest.fn().mockResolvedValue({
    valid: true,
    message: 'verified',
  }),
  verifyAccountVerificationPin: jest.fn().mockResolvedValue({
    valid: true,
    token: null,
    require_new_pin: false,
    code: 200,
    message: 'verified',
  }),
  getHomescreen: jest.fn().mockResolvedValue({
    account: { account_id: 123 },
    networks: [],
    cameras: [],
  }),
  cancelHostedLogin: jest.fn().mockResolvedValue(undefined),
});

const asBlinkApi = (api: ApiDouble): BlinkApi => api as unknown as BlinkApi;

const createLogger = (): { logger: BlinkLogger; entries: string[] } => {
  const entries: string[] = [];
  const capture = (message: string, ...parameters: unknown[]): void => {
    entries.push([message, ...parameters.map(String)].join(' '));
  };
  return {
    logger: {
      debug: capture,
      info: capture,
      warn: capture,
      error: capture,
    },
    entries,
  };
};

const persistedState = (overrides: Partial<BlinkAuthState> = {}): BlinkAuthState => ({
  accessToken: 'accessTokenSentinel_8Qs2',
  refreshToken: 'refreshTokenSentinel_4Kp7',
  tokenAuth: null,
  tokenExpiry: '2099-07-16T14:00:00.000Z',
  oauthClientId: 'android',
  email: 'persisted@example.com',
  hardwareId: 'saved-device-id',
  accountId: 123,
  clientId: 456,
  region: 'eu',
  tier: 'prde',
  updatedAt: '2026-07-16T10:00:00.000Z',
  ...overrides,
});

const writeOwnerOnlyState = async (
  filePath: string,
  state: BlinkAuthState,
): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state), { mode: 0o600 });
  await fs.chmod(filePath, 0o600);
};

const containsSecret = (value: unknown, secret: string): boolean => {
  return String(value).includes(secret) || JSON.stringify(value).includes(secret);
};

describe('HostedAuthService', () => {
  let storageRoot: string;
  let authStoragePath: string;
  let legacyAuthStoragePath: string;
  let pendingStoragePath: string;

  beforeEach(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-hosted-ui-'));
    authStoragePath = path.join(storageRoot, '.blink-auth.json');
    legacyAuthStoragePath = path.join(storageRoot, 'blink-auth', 'auth-state.json');
    pendingStoragePath = path.join(storageRoot, '.blink-auth-pending.json');
  });

  afterEach(async () => {
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it('starts hosted authentication with normalized credential-free configuration', async () => {
    const { logger } = createLogger();
    const api = createApiDouble();
    const apiFactory = jest.fn((_config: BlinkConfig) => asBlinkApi(api));
    const service = new HostedAuthService({ storageRoot, logger, apiFactory });

    await expect(service.start({ deviceId: ' homebridge-blink ' })).resolves.toEqual({
      authorizationUrl: 'https://api.oauth.blink.com/oauth/v2/authorize?safe=1',
      flowId: 'opaque-flow-id',
      expiresAt: '2026-07-16T12:15:00.000Z',
    });
    expect(apiFactory).toHaveBeenCalledWith(expect.objectContaining({
      email: '',
      password: '',
      hardwareId: 'homebridge-blink',
      oauthClientId: 'android',
      tier: 'prod',
      authStoragePath,
      hostedOAuthPendingPath: pendingStoragePath,
      legacyAuthStoragePath,
    }));
    expect(api.beginHostedLogin).toHaveBeenCalledTimes(1);
  });

  it('defaults an omitted device ID to the stable Homebridge identifier', async () => {
    const { logger } = createLogger();
    const apiFactory = jest.fn((_config: BlinkConfig) => asBlinkApi(createApiDouble()));
    const service = new HostedAuthService({ storageRoot, logger, apiFactory });

    await service.start({});

    expect(apiFactory).toHaveBeenCalledWith(expect.objectContaining({
      hardwareId: 'homebridge-blink',
    }));
  });

  it.each([
    null,
    [],
    'payload',
    { deviceId: '' },
    { deviceId: 'contains/slash' },
    { deviceId: 'x'.repeat(129) },
    { deviceId: 'valid-device', username: 'credentialSentinel@example.com' },
  ])('rejects invalid or credential-bearing start payload %#', async (payload) => {
    const { logger } = createLogger();
    const apiFactory = jest.fn((_config: BlinkConfig) => asBlinkApi(createApiDouble()));
    const service = new HostedAuthService({ storageRoot, logger, apiFactory });

    await expect(service.start(payload as never)).rejects.toMatchObject({
      category: 'invalid_request',
      status: 400,
    });
    expect(apiFactory).not.toHaveBeenCalled();
  });

  it('retains one API instance from start through verified completion', async () => {
    const { logger } = createLogger();
    const api = createApiDouble();
    const apiFactory = jest.fn((_config: BlinkConfig) => asBlinkApi(api));
    const service = new HostedAuthService({ storageRoot, logger, apiFactory });

    await service.start({ deviceId: 'same-api-device' });
    const status = await service.complete({
      flowId: 'opaque-flow-id',
      callbackUrl: 'https://applinks.blink.com/signin/callback?code=hidden&state=hidden',
    });

    expect(apiFactory).toHaveBeenCalledTimes(1);
    expect(api.completeHostedLogin).toHaveBeenCalledTimes(1);
    expect(status).toEqual({
      authenticated: true,
      verified: true,
      email: 'persisted@example.com',
      accountId: 123,
      tier: 'prde',
      message: 'Blink tokens stored and connection verified.',
    });
  });

  it.each([
    null,
    [],
    {},
    { flowId: 42, callbackUrl: 'https://example.invalid' },
    { flowId: '', callbackUrl: 'https://example.invalid' },
    { flowId: 'bad flow', callbackUrl: 'https://example.invalid' },
    { flowId: 'x'.repeat(129), callbackUrl: 'https://example.invalid' },
    { flowId: 'opaque-flow', callbackUrl: '' },
    { flowId: 'opaque-flow', callbackUrl: 42 },
    { flowId: 'opaque-flow', callbackUrl: `https://example.invalid/?code=${'x'.repeat(2049)}` },
    { flowId: 'opaque-flow', callbackUrl: 'https://example.invalid', extra: true },
  ])('rejects invalid complete payload %# before API use', async (payload) => {
    const { logger } = createLogger();
    const api = createApiDouble();
    const service = new HostedAuthService({
      storageRoot,
      logger,
      apiFactory: () => asBlinkApi(api),
    });

    await expect(service.complete(payload as never)).rejects.toMatchObject({
      category: 'invalid_request',
      status: 400,
    });
    expect(api.completeHostedLogin).not.toHaveBeenCalled();
  });

  it.each<{
    requirement: BlinkHostedLoginResult['verificationRequirement'];
    expected: AuthStatus;
  }>([
    {
      requirement: 'client',
      expected: {
        authenticated: true,
        verified: false,
        requiresClientVerification: true,
        email: 'persisted@example.com',
        accountId: 123,
        tier: 'prde',
        message: 'Blink signed in. Enter the client verification code sent by Blink.',
      },
    },
    {
      requirement: 'account',
      expected: {
        authenticated: true,
        verified: false,
        requiresAccountVerification: true,
        email: 'persisted@example.com',
        accountId: 123,
        tier: 'prde',
        message: 'Blink signed in. Enter the account verification code sent by Blink.',
      },
    },
    {
      requirement: 'connection',
      expected: {
        authenticated: true,
        verified: false,
        email: 'persisted@example.com',
        accountId: 123,
        tier: 'prde',
        message: 'tokens stored; connection verification failed',
      },
    },
  ])('maps signed-in $requirement result without raw errors', async ({ requirement, expected }) => {
    const { logger } = createLogger();
    const api = createApiDouble({
      authenticated: true,
      verified: false,
      verificationRequirement: requirement,
      email: 'persisted@example.com',
      accountId: 123,
      tier: 'prde',
      networkCount: 0,
      cameraCount: 0,
    });
    const service = new HostedAuthService({
      storageRoot,
      logger,
      apiFactory: () => asBlinkApi(api),
    });

    await service.start({ deviceId: 'same-api-device' });
    await expect(service.complete({
      flowId: 'opaque-flow-id',
      callbackUrl: 'https://applinks.blink.com/signin/callback?code=hidden&state=hidden',
    })).resolves.toEqual(expected);
  });

  it('maps completion failures to a bounded secret-free error', async () => {
    const callbackSentinel = 'callbackCodeStateSentinel_2Pw9';
    const tokenSentinel = 'upstreamTokenSentinel_7Hd4';
    const { logger, entries } = createLogger();
    const api = createApiDouble();
    api.completeHostedLogin.mockRejectedValue(
      new Error(`upstream ${callbackSentinel} ${tokenSentinel}`),
    );
    const service = new HostedAuthService({
      storageRoot,
      logger,
      apiFactory: () => asBlinkApi(api),
    });
    await service.start({});

    let caught: unknown;
    try {
      await service.complete({
        flowId: 'opaque-flow-id',
        callbackUrl: `https://applinks.blink.com/signin/callback?code=${callbackSentinel}&state=${callbackSentinel}`,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HostedAuthServiceError);
    expect(caught).toMatchObject({ category: 'authentication', status: 400 });
    expect(containsSecret(caught, callbackSentinel)).toBe(false);
    expect(containsSecret(caught, tokenSentinel)).toBe(false);
    expect(entries.join('\n')).not.toContain(callbackSentinel);
    expect(entries.join('\n')).not.toContain(tokenSentinel);
  });

  it('omits invalid upstream email metadata from completion results and logs', async () => {
    const emailSecret = 'upstreamEmailSentinel_4Mv8';
    const { logger, entries } = createLogger();
    const api = createApiDouble({
      authenticated: true,
      verified: true,
      email: emailSecret,
      accountId: 123,
      tier: 'prde',
      networkCount: 1,
      cameraCount: 2,
    });
    const service = new HostedAuthService({
      storageRoot,
      logger,
      apiFactory: () => asBlinkApi(api),
    });
    await service.start({});

    const status = await service.complete({
      flowId: 'opaque-flow-id',
      callbackUrl: 'https://applinks.blink.com/signin/callback?code=hidden&state=hidden',
    });

    expect(status).not.toHaveProperty('email');
    expect(containsSecret(status, emailSecret)).toBe(false);
    expect(entries.join('\n')).not.toContain(emailSecret);
  });

  it('reports no stored authentication without constructing an API', async () => {
    const { logger } = createLogger();
    const apiFactory = jest.fn((_config: BlinkConfig) => asBlinkApi(createApiDouble()));
    const service = new HostedAuthService({ storageRoot, logger, apiFactory });

    await expect(service.status()).resolves.toEqual({
      authenticated: false,
      message: 'No stored Blink authentication was found. Sign in securely with Blink.',
    });
    expect(apiFactory).not.toHaveBeenCalled();
  });

  it('returns only redacted metadata for a fresh valid persisted state', async () => {
    await writeOwnerOnlyState(authStoragePath, persistedState());
    const { logger } = createLogger();
    const apiFactory = jest.fn((_config: BlinkConfig) => asBlinkApi(createApiDouble()));
    const service = new HostedAuthService({ storageRoot, logger, apiFactory });

    const status = await service.status();

    expect(status).toEqual({
      authenticated: true,
      email: 'persisted@example.com',
      accountId: 123,
      tier: 'prde',
      message: 'Blink tokens are stored.',
    });
    expect(JSON.stringify(status)).not.toContain('accessTokenSentinel_8Qs2');
    expect(JSON.stringify(status)).not.toContain('refreshTokenSentinel_4Kp7');
    expect(apiFactory).not.toHaveBeenCalled();
  });

  it('omits invalid persisted email metadata from status and logs', async () => {
    const emailSecret = 'persistedEmailSentinel_7Lq2';
    await writeOwnerOnlyState(authStoragePath, persistedState({ email: emailSecret }));
    const { logger, entries } = createLogger();
    const service = new HostedAuthService({ storageRoot, logger });

    const status = await service.status();

    expect(status).not.toHaveProperty('email');
    expect(containsSecret(status, emailSecret)).toBe(false);
    expect(entries.join('\n')).not.toContain(emailSecret);
  });

  it('refreshes and rediscovers an expired hosted state without credentials after restart', async () => {
    await writeOwnerOnlyState(authStoragePath, persistedState({
      tokenExpiry: '2026-07-15T00:00:00.000Z',
    }));
    const { logger } = createLogger();
    const api = createApiDouble();
    api.login.mockImplementation(async () => {
      await writeOwnerOnlyState(authStoragePath, persistedState({
        tokenExpiry: '2099-07-16T14:00:00.000Z',
      }));
    });
    const apiFactory = jest.fn((_config: BlinkConfig) => asBlinkApi(api));
    const service = new HostedAuthService({ storageRoot, logger, apiFactory });

    await expect(service.status()).resolves.toEqual({
      authenticated: true,
      verified: true,
      email: 'persisted@example.com',
      accountId: 123,
      tier: 'prde',
      message: 'Blink tokens refreshed and connection verified.',
    });
    expect(apiFactory).toHaveBeenCalledWith(expect.objectContaining({
      email: '',
      password: '',
      hardwareId: 'saved-device-id',
      oauthClientId: 'android',
      tier: 'prde',
      authStoragePath,
      hostedOAuthPendingPath: pendingStoragePath,
      legacyAuthStoragePath,
    }));
    expect(api.login).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['profile-less legacy', null, 'ios'],
    ['resolver-compatible Amazon', 'amazon', 'amazon'],
  ] as const)('restores the %s OAuth profile for token refresh', async (
    _label,
    oauthClientId,
    expectedClientId,
  ) => {
    await writeOwnerOnlyState(authStoragePath, persistedState({
      oauthClientId,
      tokenExpiry: '2026-07-15T00:00:00.000Z',
    }));
    const { logger } = createLogger();
    const api = createApiDouble();
    const apiFactory = jest.fn((_config: BlinkConfig) => asBlinkApi(api));
    const service = new HostedAuthService({ storageRoot, logger, apiFactory });

    await service.status();

    expect(apiFactory).toHaveBeenCalledWith(expect.objectContaining({
      oauthClientId: expectedClientId,
    }));
  });

  it('returns the fixed signed-out instruction when hosted refresh requires reauthentication', async () => {
    await writeOwnerOnlyState(authStoragePath, persistedState({
      tokenExpiry: '2026-07-15T00:00:00.000Z',
    }));
    const { logger } = createLogger();
    const api = createApiDouble();
    api.login.mockRejectedValue(new BlinkHostedReauthenticationRequiredError());
    const service = new HostedAuthService({
      storageRoot,
      logger,
      apiFactory: () => asBlinkApi(api),
    });

    await expect(service.status()).resolves.toEqual({
      authenticated: false,
      message: 'Blink sign-in has expired. Open the plugin settings and sign in securely with Blink again.',
    });
  });

  it.each<{
    requirement: 'client' | 'account';
    expectedFlag: 'requiresClientVerification' | 'requiresAccountVerification';
    expectedMessage: string;
  }>([
    {
      requirement: 'client',
      expectedFlag: 'requiresClientVerification',
      expectedMessage: 'Blink signed in. Enter the client verification code sent by Blink.',
    },
    {
      requirement: 'account',
      expectedFlag: 'requiresAccountVerification',
      expectedMessage: 'Blink signed in. Enter the account verification code sent by Blink.',
    },
  ])('keeps expired-state refresh authenticated when $requirement verification is required', async ({
    requirement,
    expectedFlag,
    expectedMessage,
  }) => {
    await writeOwnerOnlyState(authStoragePath, persistedState({
      tokenExpiry: '2026-07-15T00:00:00.000Z',
    }));
    const { logger } = createLogger();
    const api = createApiDouble();
    api.login.mockRejectedValue(
      new BlinkRestVerificationRequiredError(requirement, 'secret upstream text'),
    );
    const service = new HostedAuthService({
      storageRoot,
      logger,
      apiFactory: () => asBlinkApi(api),
    });

    await expect(service.status()).resolves.toEqual({
      authenticated: true,
      verified: false,
      [expectedFlag]: true,
      email: 'persisted@example.com',
      accountId: 123,
      tier: 'prde',
      message: expectedMessage,
    });
  });

  it('bounds non-reauthentication refresh failures without leaking upstream text', async () => {
    const secret = 'refreshFailureSentinel_3Xs6';
    await writeOwnerOnlyState(authStoragePath, persistedState({
      tokenExpiry: '2026-07-15T00:00:00.000Z',
    }));
    const { logger, entries } = createLogger();
    const api = createApiDouble();
    api.login.mockRejectedValue(new Error(secret));
    const service = new HostedAuthService({
      storageRoot,
      logger,
      apiFactory: () => asBlinkApi(api),
    });

    const status = await service.status();

    expect(status).toEqual({
      authenticated: false,
      message: 'Stored Blink authentication could not be refreshed. Sign in securely with Blink again.',
    });
    expect(containsSecret(status, secret)).toBe(false);
    expect(entries.join('\n')).not.toContain(secret);
  });

  it('uses the pending transaction hardware ID when completion resumes in a new child process', async () => {
    const { logger } = createLogger();
    const starter = new HostedAuthService({ storageRoot, logger });
    const start = await starter.start({ deviceId: 'saved.custom-device' });
    const api = createApiDouble();
    const apiFactory = jest.fn((_config: BlinkConfig) => asBlinkApi(api));
    const restarted = new HostedAuthService({ storageRoot, logger, apiFactory });

    await restarted.complete({
      flowId: start.flowId,
      callbackUrl: 'https://applinks.blink.com/signin/callback?code=hidden&state=hidden',
    });

    expect(apiFactory).toHaveBeenCalledWith(expect.objectContaining({
      email: '',
      password: '',
      hardwareId: 'saved.custom-device',
      oauthClientId: 'android',
      tier: 'prod',
    }));
    expect(api.completeHostedLogin).toHaveBeenCalledWith(
      start.flowId,
      'https://applinks.blink.com/signin/callback?code=hidden&state=hidden',
    );
  });

  it('removes malformed pending recovery state without returning or logging its contents', async () => {
    const pendingSecret = 'pendingHardwareSentinel_8Bx4/invalid';
    await fs.writeFile(pendingStoragePath, JSON.stringify({
      oauthClientId: 'android',
      flowId: 'opaque-flow-id',
      hardwareId: pendingSecret,
    }), { mode: 0o600 });
    await fs.chmod(pendingStoragePath, 0o600);
    const { logger, entries } = createLogger();
    const service = new HostedAuthService({ storageRoot, logger });

    let caught: unknown;
    try {
      await service.complete({
        flowId: 'opaque-flow-id',
        callbackUrl: 'https://applinks.blink.com/signin/callback?code=hidden&state=hidden',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      message: 'Blink sign-in could not be completed. Start sign-in again.',
      category: 'storage',
      status: 400,
    });
    expect(containsSecret(caught, pendingSecret)).toBe(false);
    expect(entries.join('\n')).not.toContain(pendingSecret);
    await expect(fs.stat(pendingStoragePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('verifies a client code on the immediate API without accepting credentials or 2FA', async () => {
    const { logger } = createLogger();
    const api = createApiDouble({
      authenticated: true,
      verified: false,
      verificationRequirement: 'client',
      email: 'persisted@example.com',
      accountId: 123,
      tier: 'prde',
      networkCount: 0,
      cameraCount: 0,
    });
    const service = new HostedAuthService({
      storageRoot,
      logger,
      apiFactory: () => asBlinkApi(api),
    });
    await service.start({});
    await service.complete({
      flowId: 'opaque-flow-id',
      callbackUrl: 'https://applinks.blink.com/signin/callback?code=hidden&state=hidden',
    });

    await expect(service.verify({
      type: 'client',
      code: 'ABCD-1234',
      trustDevice: false,
    })).resolves.toEqual(expect.objectContaining({
      authenticated: true,
      verified: true,
      message: 'Blink verification completed.',
    }));
    expect(api.verifyClientVerificationPin).toHaveBeenCalledWith('ABCD-1234', true, false);
    expect(api.login).toHaveBeenCalledTimes(1);

    await expect(service.verify({ type: '2fa', code: '123456' } as never)).rejects.toMatchObject({
      category: 'invalid_request',
      status: 400,
    });
    await expect(service.verify({
      type: 'client',
      code: '123456',
      password: 'credentialSentinel',
    } as never)).rejects.toMatchObject({ category: 'invalid_request' });
  });

  it('keeps the same API authenticated when client verification advances to account verification', async () => {
    const { logger } = createLogger();
    const api = createApiDouble({
      authenticated: true,
      verified: false,
      verificationRequirement: 'client',
      email: 'persisted@example.com',
      accountId: 123,
      tier: 'prde',
      networkCount: 0,
      cameraCount: 0,
    });
    const service = new HostedAuthService({
      storageRoot,
      logger,
      apiFactory: () => asBlinkApi(api),
    });
    await service.start({});
    await service.complete({
      flowId: 'opaque-flow-id',
      callbackUrl: 'https://applinks.blink.com/signin/callback?code=hidden&state=hidden',
    });
    api.login.mockRejectedValue(
      new BlinkRestVerificationRequiredError('account', 'secret upstream text'),
    );

    await expect(service.verify({
      type: 'client',
      code: 'ABCD-1234',
      trustDevice: true,
    })).resolves.toEqual({
      authenticated: true,
      verified: false,
      requiresAccountVerification: true,
      email: 'persisted@example.com',
      accountId: 123,
      tier: 'prde',
      message: 'Blink signed in. Enter the account verification code sent by Blink.',
    });
    expect(api.verifyClientVerificationPin).toHaveBeenCalledTimes(1);
    expect(api.login).toHaveBeenCalledTimes(1);
  });

  it('reconstructs a credential-free API for account verification after restart', async () => {
    await writeOwnerOnlyState(authStoragePath, persistedState());
    const { logger } = createLogger();
    const api = createApiDouble();
    const apiFactory = jest.fn((_config: BlinkConfig) => asBlinkApi(api));
    const service = new HostedAuthService({ storageRoot, logger, apiFactory });

    await expect(service.verify({ type: 'account', code: '987654' })).resolves.toEqual({
      authenticated: true,
      verified: true,
      email: 'persisted@example.com',
      accountId: 123,
      tier: 'prde',
      message: 'Blink verification completed.',
    });
    expect(apiFactory).toHaveBeenCalledWith(expect.objectContaining({
      email: '',
      password: '',
      hardwareId: 'saved-device-id',
      oauthClientId: 'android',
    }));
    expect(api.verifyAccountVerificationPin).toHaveBeenCalledWith('987654');
    expect(api.login).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    [],
    { type: 'client', code: '' },
    { type: 'client', code: '123' },
    { type: 'client', code: 'x'.repeat(13) },
    { type: 'client', code: 'bad code' },
    { type: 'account', code: '123456', trustDevice: 'yes' },
    { type: 'unknown', code: '123456' },
    { type: 'account', code: '123456', extra: true },
  ])('rejects invalid verification payload %#', async (payload) => {
    const { logger } = createLogger();
    const api = createApiDouble();
    const service = new HostedAuthService({
      storageRoot,
      logger,
      apiFactory: () => asBlinkApi(api),
    });

    await expect(service.verify(payload as never)).rejects.toMatchObject({
      category: 'invalid_request',
      status: 400,
    });
    expect(api.verifyClientVerificationPin).not.toHaveBeenCalled();
    expect(api.verifyAccountVerificationPin).not.toHaveBeenCalled();
  });

  it('tests connection using stored tokens without username or password', async () => {
    await writeOwnerOnlyState(authStoragePath, persistedState());
    const { logger } = createLogger();
    const api = createApiDouble();
    const apiFactory = jest.fn((_config: BlinkConfig) => asBlinkApi(api));
    const service = new HostedAuthService({ storageRoot, logger, apiFactory });

    await expect(service.testConnection({})).resolves.toEqual({
      success: true,
      message: 'Connected to Blink using stored tokens.',
    });
    expect(apiFactory).toHaveBeenCalledWith(expect.objectContaining({
      email: '',
      password: '',
      hardwareId: 'saved-device-id',
    }));
    expect(api.login).toHaveBeenCalledTimes(1);
    expect(api.getHomescreen).toHaveBeenCalledTimes(1);
  });

  it('rejects credential-bearing connection payloads and bounds connection failures', async () => {
    await writeOwnerOnlyState(authStoragePath, persistedState());
    const secret = 'connectionFailureSentinel_5Jt8';
    const { logger, entries } = createLogger();
    const api = createApiDouble();
    api.getHomescreen.mockRejectedValue(new Error(secret));
    const service = new HostedAuthService({
      storageRoot,
      logger,
      apiFactory: () => asBlinkApi(api),
    });

    await expect(service.testConnection({ username: 'credentialSentinel' } as never))
      .rejects.toMatchObject({ category: 'invalid_request' });
    await expect(service.testConnection({ deviceId: 'contains/slash' }))
      .rejects.toMatchObject({ category: 'invalid_request' });
    const result = await service.testConnection({});
    expect(result).toEqual({
      success: false,
      message: 'Stored Blink tokens could not connect. Sign in securely with Blink again.',
    });
    expect(containsSecret(result, secret)).toBe(false);
    expect(entries.join('\n')).not.toContain(secret);
  });

  it('clears current, legacy, and pending owner-only files without a silent file loop', async () => {
    await writeOwnerOnlyState(authStoragePath, persistedState());
    await writeOwnerOnlyState(legacyAuthStoragePath, persistedState());
    await fs.writeFile(pendingStoragePath, '{}', { mode: 0o600 });
    await fs.chmod(pendingStoragePath, 0o600);
    const { logger } = createLogger();
    const service = new HostedAuthService({ storageRoot, logger });

    await service.clear();

    await expect(fs.stat(authStoragePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(legacyAuthStoragePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(pendingStoragePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('still removes pending authentication when another explicit cleanup target fails', async () => {
    await writeOwnerOnlyState(authStoragePath, persistedState());
    await fs.mkdir(legacyAuthStoragePath, { recursive: true });
    await fs.writeFile(pendingStoragePath, '{}', { mode: 0o600 });
    await fs.chmod(pendingStoragePath, 0o600);
    const { logger } = createLogger();
    const service = new HostedAuthService({ storageRoot, logger });

    await expect(service.clear()).rejects.toMatchObject({
      message: 'Blink authentication could not be fully cleared.',
      category: 'storage',
      status: 500,
    });
    await expect(fs.stat(authStoragePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(pendingStoragePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('BlinkUiServer hosted authentication routes', () => {
  let serverStorageRoot: string;
  let previousHomebridgeDebug: string | undefined;

  beforeEach(async () => {
    serverStorageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-ui-server-'));
    mockUiStorageRoot = serverStorageRoot;
    mockUiHandlers.clear();
    mockUiEvents.length = 0;
    previousHomebridgeDebug = process.env.HOMEBRIDGE_DEBUG;
    delete process.env.HOMEBRIDGE_DEBUG;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (previousHomebridgeDebug === undefined) {
      delete process.env.HOMEBRIDGE_DEBUG;
    } else {
      process.env.HOMEBRIDGE_DEBUG = previousHomebridgeDebug;
    }
    await fs.rm(serverStorageRoot, { recursive: true, force: true });
  });

  it('registers exactly the hosted and token-only route set without /login', () => {
    new BlinkUiServer();

    expect([...mockUiHandlers.keys()]).toEqual([
      '/auth/start',
      '/auth/complete',
      '/verify',
      '/status',
      '/logout',
      '/lock',
      '/unlock',
      '/test-connection',
    ]);
    expect(mockUiHandlers.has('/login')).toBe(false);
  });

  it('delegates hosted start, complete, status, verify, and token-only connection requests', async () => {
    const start = jest.spyOn(HostedAuthService.prototype, 'start').mockResolvedValue({
      authorizationUrl: 'https://api.oauth.blink.com/oauth/v2/authorize?safe=1',
      flowId: 'opaque-flow-id',
      expiresAt: '2026-07-16T12:15:00.000Z',
    });
    const complete = jest.spyOn(HostedAuthService.prototype, 'complete').mockResolvedValue({
      authenticated: true,
      verified: true,
    });
    const status = jest.spyOn(HostedAuthService.prototype, 'status').mockResolvedValue({
      authenticated: true,
    });
    const verify = jest.spyOn(HostedAuthService.prototype, 'verify').mockResolvedValue({
      authenticated: true,
      verified: true,
    });
    const testConnection = jest.spyOn(HostedAuthService.prototype, 'testConnection').mockResolvedValue({
      success: true,
      message: 'Connected to Blink using stored tokens.',
    });
    new BlinkUiServer();

    const startPayload = { deviceId: 'homebridge-blink' };
    const completePayload = { flowId: 'opaque-flow-id', callbackUrl: 'callbackSentinel' };
    const verifyPayload = { type: 'client', code: '123456', trustDevice: true };
    await mockUiHandlers.get('/auth/start')?.(startPayload);
    await mockUiHandlers.get('/auth/complete')?.(completePayload);
    await mockUiHandlers.get('/status')?.(undefined);
    await mockUiHandlers.get('/status')?.({});
    await mockUiHandlers.get('/verify')?.(verifyPayload);
    await mockUiHandlers.get('/test-connection')?.({});

    expect(start).toHaveBeenCalledWith(startPayload);
    expect(complete).toHaveBeenCalledWith(completePayload);
    expect(status).toHaveBeenCalledTimes(2);
    expect(verify).toHaveBeenCalledWith(verifyPayload);
    expect(testConnection).toHaveBeenCalledWith({});
  });

  it.each([
    null,
    [],
    { unexpected: true },
  ])('rejects invalid empty-route payload %# as a RequestError', async (payload) => {
    new BlinkUiServer();

    await expect(mockUiHandlers.get('/status')?.(payload)).rejects.toMatchObject({
      message: 'Invalid Blink authentication request.',
      requestError: { status: 400, category: 'invalid_request' },
    });
  });

  it('rejects legacy 2fa verification as a RequestError at runtime', async () => {
    new BlinkUiServer();

    let caught: unknown;
    try {
      await mockUiHandlers.get('/verify')?.({ type: '2fa', code: '123456' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RequestError);
    expect(caught).toMatchObject({
      message: 'Invalid Blink authentication request.',
      requestError: { status: 400, category: 'invalid_request' },
    });
  });

  it('wraps unexpected failures in bounded RequestError diagnostics without logging secrets', async () => {
    const callbackSentinel = 'callbackCodeStateSentinel_6Df2';
    process.env.HOMEBRIDGE_DEBUG = 'true';
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(HostedAuthService.prototype, 'complete').mockRejectedValue(
      new Error(`upstream callback=${callbackSentinel}`),
    );
    new BlinkUiServer();

    let caught: unknown;
    try {
      await mockUiHandlers.get('/auth/complete')?.({
        flowId: 'opaque-flow-id',
        callbackUrl: `https://applinks.blink.com/signin/callback?code=${callbackSentinel}&state=${callbackSentinel}`,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RequestError);
    expect(caught).toMatchObject({
      message: 'Blink authentication request failed. Try again.',
      requestError: { status: 500, category: 'internal' },
    });
    expect(containsSecret(caught, callbackSentinel)).toBe(false);
    expect(consoleLog.mock.calls.flat().join('\n')).not.toContain(callbackSentinel);
    expect(consoleLog).toHaveBeenCalledWith(
      '[Blink UI] Request failed: /auth/complete category=internal',
    );
  });

  it('redacts query, bare-query, URL-encoded, credential, and token sentinels', () => {
    const sentinels = [
      'queryCodeSentinel_1Ab2',
      'queryStateSentinel_3Cd4',
      'queryDescriptionSentinel_5Ef6',
      'encodedCodeSentinel_7Gh8',
      'encodedStateSentinel_9Jk0',
      'encodedDescriptionSentinel_2Lm3',
      'passwordSentinel_4Np5',
      'tokenSentinel_6Qr7',
    ];
    const message = [
      `https://example.invalid/callback?code=${sentinels[0]}&state=${sentinels[1]}&error_description=${sentinels[2]}`,
      `code%3D${sentinels[3]}%26state%3D${sentinels[4]}%26error_description%3D${sentinels[5]}`,
      `password=${sentinels[6]} access_token=${sentinels[7]}`,
    ].join(' ');

    const redacted = redactSecrets(message);

    for (const sentinel of sentinels) {
      expect(redacted).not.toContain(sentinel);
    }
    expect(redacted).toContain('<redacted>');
  });

  it('returns an authorization URL only as the route response, never as a log event', async () => {
    const authorizationUrl = 'https://api.oauth.blink.com/oauth/v2/authorize?state=authorizationStateSentinel';
    jest.spyOn(HostedAuthService.prototype, 'start').mockResolvedValue({
      authorizationUrl,
      flowId: 'opaque-flow-id',
      expiresAt: '2026-07-16T12:15:00.000Z',
    });
    new BlinkUiServer();

    await expect(mockUiHandlers.get('/auth/start')?.({})).resolves.toEqual(expect.objectContaining({
      authorizationUrl,
    }));
    expect(JSON.stringify(mockUiEvents)).not.toContain(authorizationUrl);
    expect(JSON.stringify(mockUiEvents)).not.toContain('authorizationStateSentinel');
  });

  it('uses clear for logout and unlock while lock retains stored authentication', async () => {
    const clear = jest.spyOn(HostedAuthService.prototype, 'clear').mockResolvedValue(undefined);
    new BlinkUiServer();

    await expect(mockUiHandlers.get('/logout')?.(undefined)).resolves.toEqual({ success: true });
    await expect(mockUiHandlers.get('/lock')?.(undefined)).resolves.toEqual({ success: true });
    await expect(mockUiHandlers.get('/unlock')?.(undefined)).resolves.toEqual({ success: true });

    expect(clear).toHaveBeenCalledTimes(2);
  });
});
