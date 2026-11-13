import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { URL } from 'node:url';
import { BlinkApi, BlinkOperationNotStartedError, type BlinkLiveViewOwnership, type BlinkRemoteOperationOwnership,
  type BlinkStateCommandOwnership } from '../../src/blink-api/client';
import { BlinkAuth } from '../../src/blink-api/auth';
import { BlinkHttp, BlinkHttpError } from '../../src/blink-api/http';
import { NativeStorageOwner, type NativeStorageScope, type NativeStorageState,
  type NativeStorageOperation, type NativeStorageRequestOptions } from '../../src/blink-api/native-storage';
import { OperationTimeoutError, withinRequestBudget } from '../../src/operation-budget';

const { Response } = globalThis;
type RequestInit = NonNullable<Parameters<typeof globalThis.fetch>[1]>;

const scope: NativeStorageScope = { accountId: 10, networkId: 20, syncModuleId: 30 };
const modulePath = 'v1/accounts/10/networks/20/sync_modules/30/local_storage';
const sharedRoot = 'https://rest-e001.immedia-semi.com/';
const mediaUrl = `${sharedRoot}api/${modulePath}/manifest/303/clip/request/404/?signature=opaque%2Bdata&part=1`;
const clip = { clipId: 404, networkId: 20, deviceName: 'Entry_ABC', capturedAt: '2026-11-09T04:00:00+00:00', mediaUrl };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status,
  headers: { 'content-type': 'application/json' } });
const request: NativeStorageRequestOptions = { retry: false, maxBytes: 1024 * 1024 };
const pending = (overrides: Partial<NativeStorageOperation> = {}): NativeStorageState => ({ version: 1,
  operation: { ...scope, operationId: 'pending-a', kind: 'catalog', phase: 'accepted', commandId: 101,
    statusReads: 1, expiresAt: Date.now() + 120_000, ...overrides } });
const live = (overrides: Partial<BlinkLiveViewOwnership> = {}): BlinkLiveViewOwnership => ({
  reservationId: 'owned-liveview', accountId: 10, networkId: 20, deviceId: 40, kind: 'camera',
  phase: 'active', commandId: 707, retirementAcknowledged: false, expiresAt: Date.now() + 120_000, ...overrides,
});

function fixture(restoredLive?: BlinkLiveViewOwnership, restoredCommand?: BlinkStateCommandOwnership) {
  const messages: unknown[][] = [];
  const log = (...args: unknown[]) => { messages.push(args); };
  const api = new BlinkApi({ email: '', password: '', hardwareId: 'owned-plugin', tier: 'u001', sharedTier: 'e001',
    debugAuth: true, logger: { info: log, debug: log, warn: log, error: log } });
  const internals = api as unknown as { auth: BlinkAuth };
  jest.spyOn(internals.auth, 'ensureValidToken').mockResolvedValue(undefined);
  jest.spyOn(internals.auth, 'getPersistedTier').mockResolvedValue('u001');
  jest.spyOn(internals.auth, 'getAccountId').mockReturnValue(10);
  jest.spyOn(internals.auth, 'getClientId').mockReturnValue(90);
  jest.spyOn(internals.auth, 'getAuthHeaders').mockReturnValue({ Authorization: 'Bearer fixture-auth' });
  const savedLive: Array<BlinkLiveViewOwnership | undefined> = [];
  const savedRemote: BlinkRemoteOperationOwnership[] = [];
  const saveLive = jest.fn(async (state: BlinkRemoteOperationOwnership) => {
    savedRemote.push(copy(state));
    savedLive.push(state.liveView ? copy(state.liveView) : undefined);
  });
  const release = api.configureRemoteOperationOwnership({ restoredState: { liveView: restoredLive, stateCommand: restoredCommand }, saveState: saveLive });
  return { api, auth: internals.auth, messages, savedLive, savedRemote, saveLive, release };
}

describe('owned native storage SDK', () => {
  const originalFetch = globalThis.fetch;
  let directory: string;
  beforeEach(async () => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-native-sdk-'));
    await fs.chmod(directory, 0o700);
  });
  afterEach(async () => {
    jest.useRealTimers(); jest.restoreAllMocks(); globalThis.fetch = originalFetch;
    await fs.rm(directory, { recursive: true, force: true });
  });

  it.each(['homescreen', 'arm', 'client-pin', 'tier'] as const)
  ('routes %s from committed Auth after a held capture wins over old SDK metadata', async action => {
    let release!: () => void, started!: () => void, saves = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const saving = new Promise<void>(resolve => { started = resolve; });
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'routing-fixture', tier: 'prod', sharedTier: 'prod',
      authStorage: { load: async () => ({ accessToken: 'prior-access', refreshToken: 'prior-refresh', tokenExpiry: '2099-01-01T00:00:00.000Z',
        accountId: 12, clientId: 23, tier: 'prod', oauthClientId: 'ios' }),
      save: async () => { if (++saves === 1) { started(); await gate; } }, clear: async () => undefined } });
    const internals = api as unknown as { auth: BlinkAuth };
    await internals.auth.getPersistedTier();
    const capture = (internals.auth as unknown as { captureTokensUnlocked(body: unknown, header: string): Promise<void> })
      .captureTokensUnlocked({ access_token: 'committed-access', refresh_token: 'committed-refresh', expires_in: 14400,
        account_id: action === 'tier' ? 12 : 42, client_id: action === 'tier' ? 23 : 100, tier: action === 'tier' ? 'prde' : 'prod' }, 'new-header');
    (fetch as jest.Mock).mockImplementation(async (_url: string, request: RequestInit) => request.method === 'POST'
      ? json({ id: 901 }) : json({ account: { account_id: internals.auth.getAccountId() }, networks: [], cameras: [], owls: [], doorbells: [], complete: true, status: 0 }));
    try {
      await saving;
      await api.getHomescreen(); // The old session's delayed metadata leaves its SDK cache at account 12.
      release(); await capture;
      expect(internals.auth.getAccountId()).toBe(action === 'tier' ? 12 : 42);
      (fetch as jest.Mock).mockClear();
      if (action === 'arm') {
        api.configureRemoteOperationOwnership({ scope: { accountId: 42, clientId: 100, tier: 'prod' }, saveState: async () => undefined });
        await expect(api.armNetwork(20)).resolves.toMatchObject({ id: 901 });
      } else if (action === 'client-pin') await api.requestClientVerificationPin();
      else await api.getHomescreen();
      const first = (fetch as jest.Mock).mock.calls[0];
      expect(first[1].headers.Authorization).toBe('Bearer committed-access');
      expect(first[0]).toBe(action === 'client-pin' ? 'https://rest-prod.immedia-semi.com/api/v5/clients/100/client_verification/pin/resend'
        : action === 'arm' ? 'https://rest-prod.immedia-semi.com/api/v1/accounts/42/networks/20/state/arm'
          : action === 'tier' ? 'https://rest-prde.immedia-semi.com/api/v4/accounts/12/homescreen'
            : 'https://rest-prod.immedia-semi.com/api/v4/accounts/42/homescreen');
      expect(internals.auth.getAccountId()).toBe(action === 'tier' ? 12 : 42);
      expect(internals.auth.getClientId()).toBe(action === 'tier' ? 23 : 100);
    } finally { release(); await capture; }
  });

  it('synchronizes routing when Auth commits a new tier inside HTTP authentication', async () => {
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'routing-preflight', tier: 'prod', sharedTier: 'prod' });
    const auth = (api as unknown as { auth: BlinkAuth }).auth;
    const capture = (tier: string) => (auth as unknown as { captureTokensUnlocked(body: unknown, header: string): Promise<void> })
      .captureTokensUnlocked({ access_token: `access-${tier}`, refresh_token: 'refresh-fixture', expires_in: 14400,
        account_id: 12, client_id: 23, tier }, 'header-fixture');
    await capture('prod');
    jest.spyOn(auth, 'ensureValidToken').mockResolvedValueOnce(undefined).mockImplementationOnce(async () => { await capture('prde'); });
    (fetch as jest.Mock).mockResolvedValueOnce(json({ account_id: 12, client_id: 23, tier: 'prde' }));
    await api.getAccountInfo();
    expect((fetch as jest.Mock).mock.calls[0][0]).toBe('https://rest-prde.immedia-semi.com/api/v2/users/info');
  });

  it('does not publish delayed old SDK discovery metadata over a newer committed Auth session', async () => {
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'routing-discovery', tier: 'prod', sharedTier: 'prod' });
    const internals = api as unknown as { auth: BlinkAuth };
    const capture = (accountId: number, clientId: number, tier: string) =>
      (internals.auth as unknown as { captureTokensUnlocked(body: unknown, header: string): Promise<void> })
        .captureTokensUnlocked({ access_token: `access-${accountId}`, refresh_token: 'refresh-fixture', expires_in: 14400,
          account_id: accountId, client_id: clientId, tier }, 'header-fixture');
    await capture(12, 23, 'prod');
    (fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.endsWith('/tier_info')) {
        await capture(42, 100, 'prde');
        return json({ account_id: 12, tier: 'prod' });
      }
      return json({ account_id: 12, client_id: 23, tier: 'prod' });
    });
    await api.login().catch(() => undefined);
    expect(internals.auth.getAccountId()).toBe(42);
    expect(internals.auth.getClientId()).toBe(100);
    expect(internals.auth.getTier()).toBe('prde');
    expect(api.getCachedIdentity()).toMatchObject({ accountId: 42, clientId: 100, tier: 'prde' });
  });

  it.each(['committed', 'pending', 'rejected'] as const)
  ('keeps failed discovery fallback scoped to its Auth session when a candidate is %s', async transition => {
    let saving!: () => void, releaseSave!: () => void, rejectSave!: (error: Error) => void;
    let requested!: () => void, rejectRead!: (error: Error) => void;
    const saveStarted = new Promise<void>(resolve => { saving = resolve; });
    const saveGate = new Promise<void>((resolve, reject) => { releaseSave = resolve; rejectSave = reject; });
    const readStarted = new Promise<void>(resolve => { requested = resolve; });
    const readGate = new Promise<Response>((_resolve, reject) => { rejectRead = reject; });
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'routing-failed-discovery', tier: 'prod', sharedTier: 'prod',
      authStorage: { load: async () => ({ accessToken: 'prior-access', refreshToken: 'prior-refresh', tokenExpiry: '2099-01-01T00:00:00.000Z',
        accountId: 12, clientId: 23, tier: 'prod', oauthClientId: 'ios' }),
      save: async state => { if (state.accessToken === 'candidate-access') { saving(); await saveGate; } }, clear: async () => undefined } });
    const auth = (api as unknown as { auth: BlinkAuth }).auth;
    await auth.getPersistedTier();
    (fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith('/tier_info')) return Promise.reject(new Error('fixture tier read failed'));
      requested(); return readGate;
    });
    const login = api.login().catch(error => error);
    await readStarted;
    const capture = (auth as unknown as { captureTokensUnlocked(body: unknown, header: null): Promise<void> })
      .captureTokensUnlocked({ access_token: 'candidate-access', refresh_token: 'candidate-refresh', expires_in: 14400,
        account_id: 42, client_id: 100, tier: 'prde' }, null).catch(error => error);
    try {
      await saveStarted;
      if (transition === 'committed') { releaseSave(); await capture; }
      else if (transition === 'rejected') { rejectSave(new Error('fixture candidate save failed')); await capture; }
      rejectRead(new Error('fixture old account read failed'));
      const result = await login;
      // Read Auth directly: getCachedIdentity would synchronize config and conceal a stale fallback tier.
      expect(auth.getTier()).toBe(transition === 'committed' ? 'prde' : 'prod');
      expect(auth.getAccountId()).toBe(transition === 'committed' ? 42 : 12);
      expect(auth.getClientId()).toBe(transition === 'committed' ? 100 : 23);
      if (transition === 'committed') expect(result).toMatchObject({ name: 'AuthMetadataChangedError' });
      else expect(result).toBeUndefined();
      expect((fetch as jest.Mock).mock.calls).toHaveLength(2);
    } finally { rejectSave(new Error('fixture cleanup')); await capture; }
  });

  it('does not resurrect SDK account/client IDs after a committed hosted account reset', async () => {
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'routing-reset', tier: 'prod' });
    const auth = (api as unknown as { auth: BlinkAuth }).auth;
    const capture = (options = {}) => (auth as unknown as { captureTokensUnlocked(body: unknown, header: null, profile: string, options: unknown): Promise<void> })
      .captureTokensUnlocked({ access_token: 'reset-token', refresh_token: 'refresh-fixture', expires_in: 14400,
        account_id: 12, client_id: 23, tier: 'prod' }, null, 'android', options);
    await capture(); expect(api.getCachedIdentity()).toMatchObject({ accountId: 12, clientId: 23 });
    await capture({ newAccountBoundary: true });
    expect(api.getCachedIdentity()).toMatchObject({ accountId: null, clientId: null });
  });

  it.each(['account', 'client'] as const)('blocks an old %s ID path if HTTP authentication commits another scope', async changed => {
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'routing-scope', tier: 'prod' });
    const auth = (api as unknown as { auth: BlinkAuth }).auth;
    const capture = (accountId: number, clientId: number) =>
      (auth as unknown as { captureTokensUnlocked(body: unknown, header: null): Promise<void> }).captureTokensUnlocked({
        access_token: `scope-${accountId}-${clientId}`, refresh_token: 'fixture-refresh', expires_in: 14400, account_id: accountId, client_id: clientId }, null);
    await capture(12, 23);
    jest.spyOn(auth, 'ensureValidToken').mockImplementationOnce(async () => { await capture(42, 100); });
    await expect(changed === 'account' ? api.getCameraTemperature(20, 40) : api.requestClientVerificationPin())
      .rejects.toMatchObject({ dispatched: false, reason: 'ownership-unavailable' });
    expect(fetch).not.toHaveBeenCalled();
    (fetch as jest.Mock).mockResolvedValueOnce(json(changed === 'account' ? { signals: { temp: 68 } } : {}));
    await (changed === 'account' ? api.getCameraTemperature(20, 40) : api.requestClientVerificationPin());
    expect((fetch as jest.Mock).mock.calls[0][0]).toContain(changed === 'account' ? '/accounts/42/' : '/clients/100/');
  });

  it.each([false, true])('rejects superseded metadata publication even with unchanged bearer text (reset=%s)', async reset => {
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'routing-revision', tier: 'prod' });
    const auth = (api as unknown as { auth: BlinkAuth }).auth;
    const capture = (accountId: number, options = {}) =>
      (auth as unknown as { captureTokensUnlocked(body: unknown, header: null, profile: string, options: unknown): Promise<void> }).captureTokensUnlocked({
        access_token: 'unchanged-token', refresh_token: 'fixture-refresh', expires_in: 14400, account_id: accountId, client_id: 100 }, null, 'android', options);
    await capture(12);
    (fetch as jest.Mock).mockImplementationOnce(async () => { await capture(42, reset ? { newAccountBoundary: true } : {}); return json({ account_id: 12, client_id: 23 }); });
    await expect(api.getAccountInfo()).rejects.toThrow('authentication changed');
    expect(auth.getAccountId()).toBe(reset ? null : 42);
    expect(auth.getClientId()).toBe(reset ? null : 100);
  });

  it('keeps production bootstrap probes explicit when committed Auth has another tier hint', async () => {
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'routing-bootstrap', tier: 'prod', sharedTier: 'prod' });
    const auth = (api as unknown as { auth: BlinkAuth }).auth;
    await (auth as unknown as { captureTokensUnlocked(body: unknown, header: null): Promise<void> }).captureTokensUnlocked({
      access_token: 'bootstrap-token', refresh_token: 'fixture-refresh', expires_in: 14400, account_id: 12, client_id: 23, tier: 'prde' }, null);
    jest.spyOn(auth, 'completeHostedLogin').mockResolvedValue(undefined);
    (fetch as jest.Mock).mockResolvedValueOnce(json({}, 406)).mockResolvedValueOnce(json({}, 406)).mockResolvedValueOnce(json({ account_id: 12, tier: 'prde' }))
      .mockResolvedValueOnce(json({ account_id: 12, client_id: 23, tier: 'prde' }))
      .mockResolvedValueOnce(json({ account: { account_id: 12 }, networks: [], cameras: [], owls: [], doorbells: [] }));
    await expect(api.completeHostedLogin('fixture-flow', 'fixture-callback')).resolves.toMatchObject({ verified: true });
    expect((fetch as jest.Mock).mock.calls.slice(0, 3).map(([url]) => url)).toEqual([
      'https://rest-prod.immedia-semi.com/api/v1/users/tier_info', 'https://rest-prod.immedia-semi.com/api/v1/users/tier_info',
      'https://rest-prde.immedia-semi.com/api/v1/users/tier_info']);
  });

  it('retains an explicit shared-tier override while syncing committed regional routing', async () => {
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'routing-shared', tier: 'prod', sharedTier: 'e001' });
    const auth = (api as unknown as { auth: BlinkAuth }).auth;
    await (auth as unknown as { captureTokensUnlocked(body: unknown, header: null): Promise<void> }).captureTokensUnlocked({
      access_token: 'shared-token', refresh_token: 'fixture-refresh', expires_in: 14400, account_id: 12, client_id: 23, tier: 'prde' }, null);
    (fetch as jest.Mock).mockResolvedValueOnce(json({ account: { account_id: 12 }, networks: [], cameras: [], owls: [], doorbells: [] }));
    await api.getHomescreen();
    expect((fetch as jest.Mock).mock.calls[0][0]).toBe('https://rest-e001.immedia-semi.com/api/v4/accounts/12/homescreen');
    expect(api.getCachedIdentity()).toMatchObject({ tier: 'prde', sharedTier: 'e001' });
  });

  it('does not publish a malformed tier-info account ID into canonical Auth', async () => {
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'routing-malformed', tier: 'prod' });
    const auth = (api as unknown as { auth: BlinkAuth }).auth;
    await (auth as unknown as { captureTokensUnlocked(body: unknown, header: null): Promise<void> }).captureTokensUnlocked({
      access_token: 'valid-account-token', refresh_token: 'fixture-refresh', expires_in: 14400, account_id: 12, client_id: 23, tier: 'prod' }, null);
    (fetch as jest.Mock).mockResolvedValueOnce(json({ account_id: 0, tier: 'prde' })).mockResolvedValueOnce(json({}));
    await api.login();
    expect(api.getCachedIdentity()).toMatchObject({ accountId: 12, clientId: 23, tier: 'prod' });
  });

  it('treats native signed URL query data as opaque during request identity validation', async () => {
    const f = fixture(), transport = f.api.createNativeStorageTransport({ scope, directory });
    f.api.setNativeStorageOwner(scope, pending({ operationId: 'clip', kind: 'clip', phase: 'prepared', clip: { manifestId: 303, clip }, commandId: 505 }));
    const opaque = `${mediaUrl}&opaque=/clients/999/accounts/999/`;
    (fetch as jest.Mock).mockResolvedValueOnce(new Response(Buffer.from('query fixture')));
    const result = await f.api.withNativeStorageAdmission('clip', () => transport.downloadMedia(opaque, request), {}, scope);
    expect((fetch as jest.Mock).mock.calls[0][0]).toBe(opaque);
    expect(await fs.readFile(result.reference)).toEqual(Buffer.from('query fixture'));
  });

  it('admits a fresh arm after a legacy unknown live view without replaying or confirming it', async () => {
    const f = fixture(live({ phase: 'unresolved', commandId: undefined, expiresAt: undefined }));
    (fetch as jest.Mock).mockResolvedValueOnce(json({ id: 901 })).mockResolvedValueOnce(json({ complete: true, status: 0 }));
    await expect(f.api.armNetwork(20)).resolves.toEqual({ id: 901 });
    expect(f.savedRemote.at(-1)).toMatchObject({ abandoned: [expect.objectContaining({
      reservationId: 'owned-liveview', kind: 'liveview', reason: 'legacy-owner',
    })] });
    expect((fetch as jest.Mock).mock.calls.map(([url, request]) => [new URL(url).pathname, request.method]))
      .toEqual([['/api/v1/accounts/10/networks/20/state/arm', 'POST'], ['/accounts/10/networks/20/commands/901', 'GET']]);
  });

  it('keeps a current lease bounded and archives uncertainty when it expires', async () => {
    jest.useFakeTimers();
    const owner = { ...live({ phase: 'unresolved', commandId: undefined }), expiresAt: Date.now() + 1000 };
    const f = fixture(owner);
    await expect(f.api.armNetwork(20)).rejects.toMatchObject({ reason: 'liveview-pending' });
    expect(fetch).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1001);
    (fetch as jest.Mock).mockResolvedValueOnce(json({ id: 902 })).mockResolvedValueOnce(json({ complete: true, status: 0 }));
    await expect(f.api.armNetwork(20)).resolves.toEqual({ id: 902 });
    expect(f.savedRemote.at(-1)).toMatchObject({ abandoned: [expect.objectContaining({ reason: 'lease-expired' })] });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps user controls available after journal persistence fails', async () => {
    const f = fixture();
    f.saveLive.mockRejectedValue(new Error('fixture journal unavailable'));
    (fetch as jest.Mock).mockImplementation(async (_url: string, request: RequestInit) => request.method === 'POST'
      ? json({ id: 903 }) : json({ complete: true, status: 0 }));
    await expect(f.api.armNetwork(20)).resolves.toEqual({ id: 903 });
    await expect(f.api.disarmNetwork(20)).resolves.toEqual({ id: 903 });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(f.api.getRemoteOperationState().persistenceFailed).toBe(true);
  });

  it('does not apply Early Notification after authentication changes the captured account', async () => {
    const f = fixture();
    let release!: () => void;
    const authentication = new Promise<void>(resolve => { release = resolve; });
    const token = f.auth.ensureValidToken as jest.Mock;
    token.mockResolvedValueOnce(undefined).mockReturnValueOnce(authentication);
    (fetch as jest.Mock).mockResolvedValueOnce(json({ camera: [{ early_notification: true, early_notification_compatible: true }] }));
    const setting = f.api.setDeviceEarlyNotification('camera', 20, 40, 'catalina', false);
    const failure = expect(setting).rejects.toMatchObject({ reason: 'ownership-unavailable' });
    while (token.mock.calls.length < 2) await new Promise(resolve => setImmediate(resolve));
    (f.auth.getAccountId as jest.Mock).mockReturnValue(11);
    release();
    await failure;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch as jest.Mock).mock.calls[0][1].method).toBe('GET');
  });

  it.each((['deadline', 'cancel'] as const).flatMap(limit =>
    (['error-cleanup', 'success-response'] as const).map(stage => [limit, stage] as const)))
  ('releases conflict readback and the command queue on %s during held %s', async (limit, stage) => {
    jest.useFakeTimers();
    const f = fixture(), controller = new globalThis.AbortController();
    let release!: () => void, entered!: () => void, reads = 0, settled = false;
    const held = new Promise<void>(resolve => { release = resolve; });
    const holding = new Promise<void>(resolve => { entered = resolve; });
    (fetch as jest.Mock).mockImplementation(async (url: string, request: RequestInit) => {
      if (url.endsWith('/config') && request.method === 'GET') {
        if (++reads === 1) return json({ camera: [{ early_notification: true, early_notification_compatible: true }] });
        if (stage === 'success-response') {
          entered(); await held;
          return json({ camera: [{ early_notification: false, early_notification_compatible: true }] });
        }
        const response = json({}, 503);
        jest.spyOn(response.body!, 'cancel').mockImplementation(async () => { entered(); await held; });
        return response;
      }
      if (url.endsWith('/config') && request.method === 'POST') return json({}, 409);
      if (request.method === 'POST') return json({ id: 991 });
      return json({ complete: true, status: 0 });
    });
    const operation = f.api.setDeviceEarlyNotification('camera', 20, 40, 'catalina', false,
      { deadline: Date.now() + 500, signal: controller.signal }).catch(error => error).finally(() => { settled = true; });
    try {
      await holding;
      if (limit === 'cancel') controller.abort(new Error('Operator cancelled'));
      await jest.advanceTimersByTimeAsync(limit === 'deadline' ? 501 : 0);
      expect(settled).toBe(true);
      expect(await operation).toBeInstanceOf(BlinkHttpError);
      expect(await operation).toMatchObject({ status: 409, method: 'POST' });
      expect(f.api.getRemoteOperationState().stateCommand).toBeUndefined();
      expect((fetch as jest.Mock).mock.calls.filter(([url, request]) => url.endsWith('/config') && request.method === 'POST')).toHaveLength(1);
      const next = f.api.armNetwork(20);
      await jest.advanceTimersByTimeAsync(301);
      await expect(next).resolves.toEqual({ id: 991 });
      expect(f.api.getRemoteOperationState().stateCommand).toBeUndefined();
    } finally { release(); await operation; await jest.advanceTimersByTimeAsync(0); }
  });

  it.each(['early-notification', 'liveview'] as const)('rejects a superseded %s generation before allocating ownership', async kind => {
    jest.useFakeTimers();
    const f = fixture(); await f.release();
    let releaseOld!: () => void, releaseStatus!: (value: Response) => void;
    const oldGate = new Promise<void>(resolve => { releaseOld = resolve; });
    const beforeChange = jest.fn(async () => oldGate);
    if (kind === 'liveview') {
      (f.auth.getAccountId as jest.Mock).mockReturnValue(null);
      jest.spyOn(f.api, 'login').mockImplementationOnce(async () => oldGate);
    }
    (fetch as jest.Mock).mockImplementation(async (url: string, request: RequestInit) => {
      if (url.endsWith('/config') && request.method === 'GET') return json({ camera: [{ early_notification: true, early_notification_compatible: true }] });
      if (request.method === 'POST') return json({ id: url.endsWith('/config') ? 994 : 991 });
      if (url.endsWith('/commands/991')) return new Promise<Response>(resolve => { releaseStatus = resolve; });
      return json({ complete: true, status: 0 });
    });
    const old = (kind === 'early-notification'
      ? f.api.setDeviceEarlyNotification('camera', 20, 40, 'catalina', false, { beforeChange })
      : f.api.startCameraLiveview(20, 40)).catch(error => error);
    await jest.advanceTimersByTimeAsync(0);
    if (kind === 'early-notification') expect(beforeChange).toHaveBeenCalledTimes(1);
    (f.auth.getAccountId as jest.Mock).mockReturnValue(10);
    f.api.configureRemoteOperationOwnership({ saveState: jest.fn().mockResolvedValue(undefined) });
    const arm = f.api.armNetwork(20);
    try {
      await jest.advanceTimersByTimeAsync(301);
      expect(f.api.getRemoteOperationState().stateCommand).toMatchObject({ kind: 'arm', commandId: 991 });
      releaseOld(); await jest.advanceTimersByTimeAsync(0);
      expect(await old).toBeInstanceOf(BlinkOperationNotStartedError);
      expect(f.api.getRemoteOperationState().stateCommand).toMatchObject({ kind: 'arm', commandId: 991 });
      expect(f.api.getRemoteOperationState().liveView).toBeUndefined();
      expect((fetch as jest.Mock).mock.calls.filter(([, request]) => request.method === 'POST')).toHaveLength(1);
    } finally {
      releaseOld(); releaseStatus?.(json({ complete: true, status: 0 }));
      await jest.advanceTimersByTimeAsync(1); await arm.catch(() => undefined); await old;
    }
  });

  it('persists each coalesced ownership snapshot before dispatch and before observing completion', async () => {
    jest.useFakeTimers();
    const f = fixture(live({ phase: 'unresolved', commandId: undefined, expiresAt: undefined }));
    let releaseArchive!: () => void, releaseIntent!: () => void, releaseAccepted!: () => void;
    const archive = new Promise<void>(resolve => { releaseArchive = resolve; });
    const intent = new Promise<void>(resolve => { releaseIntent = resolve; });
    const accepted = new Promise<void>(resolve => { releaseAccepted = resolve; });
    f.saveLive.mockImplementationOnce(async () => archive)
      .mockImplementationOnce(async () => intent).mockImplementationOnce(async () => accepted);
    (fetch as jest.Mock).mockImplementation(async (_url: string, request: RequestInit) => request.method === 'POST'
      ? json({ id: 992 }) : json({ complete: true, status: 0 }));
    const arm = f.api.armNetwork(20);
    try {
      await jest.advanceTimersByTimeAsync(0); expect(fetch).not.toHaveBeenCalled();
      releaseArchive(); await jest.advanceTimersByTimeAsync(0); expect(fetch).not.toHaveBeenCalled();
      releaseIntent(); await jest.advanceTimersByTimeAsync(0);
      expect((fetch as jest.Mock).mock.calls.map(([, request]) => request.method)).toEqual(['POST']);
      releaseAccepted(); await jest.advanceTimersByTimeAsync(0); await arm;
      expect((fetch as jest.Mock).mock.calls.map(([, request]) => request.method)).toEqual(['POST', 'GET']);
      expect(f.api.getRemoteOperationState().persistenceFailed).toBe(false);
    } finally {
      releaseArchive(); releaseIntent(); releaseAccepted();
      await jest.advanceTimersByTimeAsync(1); await arm.catch(() => undefined);
    }
  });

  it('warns at the fixed coalesced persistence budget before allowing degraded dispatch', async () => {
    jest.useFakeTimers();
    const f = fixture(live({ phase: 'unresolved', commandId: undefined, expiresAt: undefined }));
    let releaseArchive!: () => void;
    const archive = new Promise<void>(resolve => { releaseArchive = resolve; });
    f.saveLive.mockImplementationOnce(async () => archive);
    (fetch as jest.Mock).mockImplementation(async (_url: string, request: RequestInit) => {
      if (request.method === 'POST') {
        expect(f.api.getRemoteOperationState().persistenceFailed).toBe(true);
        expect(f.messages.some(message => String(message[0]).includes('Ownership journal unavailable'))).toBe(true);
        return json({ id: 995 });
      }
      return json({ complete: true, status: 0 });
    });
    const arm = f.api.armNetwork(20);
    try {
      await jest.advanceTimersByTimeAsync(999); expect(fetch).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1); expect(fetch).toHaveBeenCalledTimes(1);
      releaseArchive(); await jest.advanceTimersByTimeAsync(1); await arm;
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(f.api.getRemoteOperationState().persistenceFailed).toBe(false);
    } finally {
      releaseArchive(); await jest.advanceTimersByTimeAsync(3001); await arm.catch(() => undefined);
    }
  });

  it('keeps the journal fault set while a newer coalesced snapshot remains unsaved after caller budgets expire', async () => {
    jest.useFakeTimers();
    const f = fixture();
    const gates: Array<() => void> = [], started: BlinkRemoteOperationOwnership[] = [];
    let active = 0, maxActive = 0;
    f.saveLive.mockImplementation(async state => {
      active++; maxActive = Math.max(maxActive, active); started.push(copy(state));
      await new Promise<void>(resolve => { gates.push(resolve); });
      active--; f.savedRemote.push(copy(state));
    });
    (fetch as jest.Mock).mockResolvedValueOnce(json({ command_id: 707, server: 'immis://fixture.invalid' }));
    const older = f.api.retryRemoteOperationPersistence().catch(error => error);
    await jest.advanceTimersByTimeAsync(0);
    const liveView = f.api.startCameraLiveview(20, 40);
    try {
      await jest.advanceTimersByTimeAsync(2001);
      expect(await older).toBeInstanceOf(Error);
      await expect(liveView).resolves.toMatchObject({ command_id: 707 });
      expect(f.api.getRemoteOperationState().persistenceFailed).toBe(true);
      expect(started).toEqual([{}]);
      gates[0](); await jest.advanceTimersByTimeAsync(0);
      expect(started).toHaveLength(2);
      expect(started[1]).toEqual({ liveView: f.api.getRemoteOperationState().liveView });
      expect(f.api.getRemoteOperationState().persistenceFailed).toBe(true);
      await jest.advanceTimersByTimeAsync(2000);
      expect(f.api.getRemoteOperationState().persistenceFailed).toBe(true);
      expect(maxActive).toBe(1);
      gates[1](); await jest.advanceTimersByTimeAsync(0);
      expect(f.api.getRemoteOperationState().persistenceFailed).toBe(false);
      expect(f.savedRemote.at(-1)).toEqual(started[1]);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      for (const release of gates) release();
      await jest.advanceTimersByTimeAsync(1); await liveView.catch(() => undefined);
    }
  });

  it.each(['owned-retirement', 'unowned-retirement', 'command-update'] as const)
  ('rejects %s before dispatch if authentication changes its captured account', async action => {
    const f = fixture(action === 'owned-retirement' ? live() : undefined);
    let releaseAuthentication!: () => void;
    const authentication = new Promise<void>(resolve => { releaseAuthentication = resolve; });
    (f.auth.ensureValidToken as jest.Mock).mockReturnValueOnce(authentication);
    (fetch as jest.Mock).mockResolvedValueOnce(action === 'command-update' ? json({ complete: false }) : new Response(null, { status: 204 }))
      .mockResolvedValue(json({ complete: true, status: 0 }));
    const operation = action === 'command-update' ? f.api.updateCommand(20, 707) : f.api.completeCommand(20, 707);
    const rejected = expect(operation).rejects.toMatchObject({ reason: 'ownership-unavailable', dispatched: false });
    while (!(f.auth.ensureValidToken as jest.Mock).mock.calls.length) await new Promise(resolve => setImmediate(resolve));
    (f.auth.getAccountId as jest.Mock).mockReturnValue(11);
    releaseAuthentication();
    await rejected;
    expect(fetch).not.toHaveBeenCalled();
    if (action === 'owned-retirement') expect(f.api.getRemoteOperationState().liveView)
      .toMatchObject({ commandId: 707, phase: 'unresolved', retirementAcknowledged: false });
  });

  it.each((['owned-retirement', 'unowned-retirement', 'command-update'] as const).flatMap(action =>
    ([200, 404] as const).map(status => [action, status] as const)))
  ('rejects stale-account %s completion after its held POST returns HTTP%s', async (action, status) => {
    const f = fixture(action === 'owned-retirement' ? live() : undefined);
    let reply!: (value: Response) => void, sent!: () => void;
    const dispatched = new Promise<void>(resolve => { sent = resolve; });
    (fetch as jest.Mock).mockImplementationOnce(() => { sent(); return new Promise<Response>(resolve => { reply = resolve; }); });
    const operation = (action === 'command-update' ? f.api.updateCommand(20, 707) : f.api.completeCommand(20, 707)).catch(error => error);
    await dispatched;
    (f.auth.getAccountId as jest.Mock).mockReturnValue(11);
    reply(status === 404 ? json({}, 404) : action === 'command-update' ? json({ complete: false }) : new Response(null, { status: 204 }));
    const failure = await operation;
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(BlinkOperationNotStartedError);
    expect(failure).toMatchObject({ cause: { reason: 'ownership-unavailable' } });
    expect((failure as Error & { dispatched?: boolean }).dispatched).toBe(status === 404 ? undefined : true);
    if (action === 'owned-retirement') expect(f.api.getRemoteOperationState().liveView)
      .toMatchObject({ commandId: 707, phase: 'unresolved', retirementAcknowledged: status !== 404 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['owned-retirement', 'unowned-retirement', 'command-update'] as const)
  ('does not accept a prior authentication POST404 as %s missing-command proof', async action => {
    const f = fixture(action === 'owned-retirement' ? live() : undefined);
    (f.auth.ensureValidToken as jest.Mock).mockRejectedValueOnce(new BlinkHttpError('prior auth refusal', 404, '',
      'https://fixture.invalid/prior', 'POST'));
    await expect(action === 'command-update' ? f.api.updateCommand(20, 707) : f.api.completeCommand(20, 707))
      .rejects.toMatchObject({ dispatched: false, status: 404 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['liveview-save', 'early-readback', 'quality-readback', 'thumbnail-readback', 'native-callback', 'read-only'] as const)
  ('rejects late account rotation at the shared completion boundary for %s', async action => {
    const f = fixture();
    let reads = 0;
    const rotate = () => { (f.auth.getAccountId as jest.Mock).mockReturnValue(11); };
    f.saveLive.mockImplementation(async state => {
      if (action === 'liveview-save' && state.liveView?.phase === 'active') rotate();
    });
    (fetch as jest.Mock).mockImplementation(async (url: string, request: RequestInit) => {
      if (request.method === 'POST') return json(action === 'liveview-save' ? { command_id: 707, server: 'immis://fixture.invalid' } : { id: 101 });
      if (url.endsWith('/config')) {
        reads++;
        if (reads === 2 || action === 'read-only') rotate();
        return json({ camera: [{ early_notification: reads === 1, early_notification_compatible: true,
          video_quality: reads === 1 ? 'standard' : 'best', video_quality_support: ['standard', 'best'] }] });
      }
      if (url.endsWith('/homescreen')) {
        rotate();
        return json({ account: { account_id: 10 }, networks: [],
          cameras: [{ id: 40, network_id: 20, name: 'Camera', thumbnail: '/current.jpg' }], owls: [], doorbells: [] });
      }
      return json({ complete: true, status: 0 });
    });
    const operation = action === 'liveview-save' ? f.api.startCameraLiveview(20, 40)
      : action === 'early-readback' ? f.api.setDeviceEarlyNotification('camera', 20, 40, 'catalina', false)
        : action === 'quality-readback' ? f.api.setDeviceVideoQuality('camera', 20, 40, 'best')
          : action === 'thumbnail-readback' ? f.api.requestCameraThumbnail(20, 40)
            : action === 'read-only' ? f.api.getDeviceEarlyNotification('camera', 20, 40, 'catalina')
              : f.api.withNativeStorageAdmission('event', async () => { rotate(); return 'old-account-result'; }, {}, scope);
    const failure = await operation.catch(error => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ cause: { reason: 'ownership-unavailable' } });
    expect((failure as Error & { dispatched?: boolean }).dispatched).toBe(action === 'native-callback' || action === 'read-only' ? undefined : true);
    expect((fetch as jest.Mock).mock.calls.filter(([, request]) => request.method === 'POST'))
      .toHaveLength(action === 'native-callback' || action === 'read-only' ? 0 : 1);
  });

  it.each(['stable', 'authentication', 'response'] as const)('keeps a newly resolved account bound through its first resource %s', async phase => {
    const f = fixture();
    (f.auth.getAccountId as jest.Mock).mockReturnValue(null);
    const login = jest.spyOn(f.api, 'login').mockImplementation(async () => {
      (f.auth.getAccountId as jest.Mock).mockReturnValue(10);
    });
    (f.auth.ensureValidToken as jest.Mock).mockImplementationOnce(async () => {
      if (phase === 'authentication') (f.auth.getAccountId as jest.Mock).mockReturnValue(11);
    });
    (fetch as jest.Mock).mockImplementationOnce(async () => {
      if (phase === 'response') (f.auth.getAccountId as jest.Mock).mockReturnValue(11);
      return json({ camera: [{ early_notification: true, early_notification_compatible: true }] });
    });
    const operation = f.api.getDeviceEarlyNotification('camera', 20, 40, 'catalina');
    if (phase === 'authentication') {
      await expect(operation).rejects.toMatchObject({ dispatched: false, reason: 'ownership-unavailable' });
      expect(fetch).not.toHaveBeenCalled();
    } else if (phase === 'response') {
      const failure = await operation.catch(error => error);
      expect(failure).toMatchObject({ cause: { reason: 'ownership-unavailable' } });
      expect((failure as Error & { dispatched?: boolean }).dispatched).toBeUndefined();
      expect(fetch).toHaveBeenCalledTimes(1);
    } else {
      await expect(operation).resolves.toMatchObject({ current: true });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('rejects an account change during conflict reconciliation without retrying the refused mutation', async () => {
    const f = fixture();
    (fetch as jest.Mock).mockResolvedValueOnce(json({}, 409)).mockImplementationOnce(async () => {
      (f.auth.getAccountId as jest.Mock).mockReturnValue(11);
      return json({ account: { account_id: 10 }, networks: [{ id: 20, name: 'Home', armed: true }], cameras: [], owls: [], doorbells: [] });
    });
    const failure = await f.api.armNetwork(20).catch(error => error);
    expect(failure).toMatchObject({ cause: { reason: 'ownership-unavailable' } });
    expect((failure as Error & { dispatched?: boolean }).dispatched).toBeUndefined();
    expect(f.api.getRemoteOperationState().stateCommand).toBeUndefined();
    expect((fetch as jest.Mock).mock.calls.map(([, request]) => request.method)).toEqual(['POST', 'GET']);
  });

  it('keeps the native command account guard after authentication yields', async () => {
    const f = fixture(), transport = f.api.createNativeStorageTransport({ scope, directory });
    let releaseAuthentication!: () => void;
    const authentication = new Promise<void>(resolve => { releaseAuthentication = resolve; });
    (f.auth.ensureValidToken as jest.Mock).mockReturnValueOnce(authentication);
    const operation = f.api.withNativeStorageAdmission('pending-a', async () => {
      f.api.setNativeStorageOwner(scope, pending({ phase: 'intent', commandId: undefined, statusReads: 0 }));
      return transport.postEmpty({ base: 'api', path: `${modulePath}/manifest/request` }, request);
    }, {}, scope);
    const rejected = expect(operation).rejects.toMatchObject({ reason: 'ownership-unavailable', dispatched: false });
    while (!(f.auth.ensureValidToken as jest.Mock).mock.calls.length) await new Promise(resolve => setImmediate(resolve));
    (f.auth.getAccountId as jest.Mock).mockReturnValue(11);
    releaseAuthentication();
    await rejected;
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['retire', 'reconcile', 'queued-reconcile'] as const)('releases queued %s at the existing live-view lease deadline', async action => {
    jest.useFakeTimers();
    const f = fixture(live({ expiresAt: Date.now() + 1000, retirementAcknowledged: action !== 'retire' }));
    let releaseAuth!: () => void;
    const authentication = new Promise<void>(resolve => { releaseAuth = resolve; });
    (f.auth.ensureValidToken as jest.Mock).mockReturnValueOnce(authentication);
    (fetch as jest.Mock).mockImplementation(async (_url: string, request: RequestInit) => request.method === 'POST'
      ? json({ id: 993 }) : json({ complete: true, status: 0 }));
    const prior = action === 'queued-reconcile' ? f.api.updateCommand(20, 707).catch(error => error) : undefined;
    await jest.advanceTimersByTimeAsync(0);
    const retirement = (action === 'retire' ? f.api.completeCommand(20, 707) : f.api.reconcileKnownLiveViews()).catch(error => error);
    await jest.advanceTimersByTimeAsync(0);
    const arm = f.api.armNetwork(20);
    try {
      await jest.advanceTimersByTimeAsync(1301);
      expect((fetch as jest.Mock).mock.calls.map(([, request]) => request.method)).toEqual(['POST', 'GET']);
      await expect(arm).resolves.toEqual({ id: 993 });
      expect(f.api.getRemoteOperationState().abandoned).toEqual([expect.objectContaining({ kind: 'liveview', commandId: 707 })]);
    } finally {
      releaseAuth(); await jest.advanceTimersByTimeAsync(60_000);
      await arm.catch(() => undefined); await retirement; await prior;
    }
  });

  it.each(['retire', 'update'] as const)('allows explicit unowned %s after the old live-view lease has already expired', async action => {
    jest.useFakeTimers();
    const f = fixture(live({ expiresAt: Date.now() + 1000 }));
    await jest.advanceTimersByTimeAsync(1001);
    (fetch as jest.Mock).mockResolvedValueOnce(action === 'retire'
      ? new Response(null, { status: 204 }) : json({ complete: true, status: 0 }));
    await expect(action === 'retire' ? f.api.completeCommand(20, 707) : f.api.updateCommand(20, 707)).resolves.not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch as jest.Mock).mock.calls[0][0]).toBe(`${sharedRoot}accounts/10/networks/20/commands/707/${action === 'retire' ? 'done' : 'update'}`);
    expect(f.api.getRemoteOperationState().liveView).toBeUndefined();
    expect(f.api.getRemoteOperationState().abandoned).toEqual([expect.objectContaining({ kind: 'liveview', commandId: 707 })]);
  });

  it.each(['arm', 'liveview', 'retire'] as const)('does not claim an accepted %s was unstarted when the account changes after its POST', async action => {
    const f = fixture(action === 'retire' ? live() : undefined);
    (fetch as jest.Mock).mockImplementationOnce(async () => {
      (f.auth.getAccountId as jest.Mock).mockReturnValue(11);
      return action === 'retire' ? new Response(null, { status: 204 })
        : json(action === 'liveview' ? { command_id: 707, server: 'immis://fixture.invalid' } : { id: 101 });
    });
    const operation = action === 'arm' ? f.api.armNetwork(20)
      : action === 'liveview' ? f.api.startCameraLiveview(20, 40) : f.api.completeCommand(20, 707);
    const failure = await operation.catch(error => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error & { dispatched?: boolean }).dispatched).toBe(true);
    const state = f.api.getRemoteOperationState();
    if (action === 'arm') expect(state.stateCommand).toMatchObject({ phase: 'unresolved', commandId: 101 });
    else expect(state.liveView).toMatchObject({ phase: 'unresolved', commandId: 707, retirementAcknowledged: action === 'retire' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, -1, 240_000])('abandons an inactive restored ordinary owner without inventing terminal proof (%s)', async offset => {
    const f = fixture(undefined, { reservationId: 'old-known-arm', accountId: 10, networkId: 20, kind: 'arm',
      phase: 'unresolved', commandId: 711, statusReads: 60, ...(offset === undefined ? {} : { expiresAt: Date.now() + offset }) });
    (fetch as jest.Mock).mockResolvedValueOnce(json({ id: 712 })).mockResolvedValueOnce(json({ complete: true, status: 0 }));
    await expect(f.api.armNetwork(20)).resolves.toEqual({ id: 712 });
    expect(f.api.getRemoteOperationState()).toMatchObject({ abandoned: [expect.objectContaining({
      reservationId: 'old-known-arm', commandId: 711, kind: 'arm',
      reason: offset === undefined ? 'legacy-owner' : 'lease-expired',
    })] });
    expect((fetch as jest.Mock).mock.calls.map(([url]) => url)).not.toContain(`${sharedRoot}accounts/10/networks/20/commands/711`);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['update-post', 'native-work', 'read-only-native-work'] as const)
  ('does not claim %s was never sent after its callback completes under a replacement writer', async kind => {
    jest.useFakeTimers();
    const f = fixture();
    let releaseWork!: () => void;
    const gate = new Promise<void>(resolve => { releaseWork = resolve; });
    const entered = jest.fn();
    (fetch as jest.Mock).mockImplementation(async () => { entered(); await gate; return json({ complete: true, status: 0 }); });
    const operation = (kind === 'update-post' ? f.api.updateCommand(20, 707)
      : f.api.withNativeStorageAdmission('event', async () => {
        entered();
        if (kind === 'native-work') await fetch('https://fixture.invalid/native-command', { method: 'POST' });
        else await gate;
        return 'result';
      }, {}, scope)).catch(error => error);
    await jest.advanceTimersByTimeAsync(0);
    expect(entered).toHaveBeenCalled();
    const releasing = f.release({ deadline: Date.now() + 1 });
    await jest.advanceTimersByTimeAsync(2); await releasing;
    f.api.configureRemoteOperationOwnership({ saveState: jest.fn().mockResolvedValue(undefined) });
    releaseWork();
    const failure = await operation;
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(BlinkOperationNotStartedError);
    expect((failure as Error & { dispatched?: boolean }).dispatched).toBe(kind === 'update-post' ? true : undefined);
    expect(failure).toMatchObject({ cause: { reason: 'ownership-unavailable' } });
    expect(fetch).toHaveBeenCalledTimes(kind === 'read-only-native-work' ? 0 : 1);
  });

  it('rejects a stale arm conflict reconciliation after writer replacement without retrying its refused POST', async () => {
    jest.useFakeTimers();
    const f = fixture();
    let releaseRead!: (response: Response) => void;
    (fetch as jest.Mock).mockResolvedValueOnce(json({}, 409))
      .mockImplementationOnce(async () => new Promise<Response>(resolve => { releaseRead = resolve; }));
    const old = f.api.armNetwork(20).catch(error => error);
    await jest.advanceTimersByTimeAsync(0);
    expect(releaseRead).toBeDefined();
    const releasing = f.release({ deadline: Date.now() + 1 });
    await jest.advanceTimersByTimeAsync(2); await releasing;
    f.api.configureRemoteOperationOwnership({ saveState: jest.fn().mockResolvedValue(undefined) });
    releaseRead(json({ account: { account_id: 10 }, networks: [{ id: 20, name: 'Home', armed: true }],
      cameras: [], owls: [], doorbells: [] }));
    const failure = await old;
    expect(failure).toMatchObject({ cause: { reason: 'ownership-unavailable' } });
    expect((failure as Error & { dispatched?: boolean }).dispatched).toBeUndefined();
    expect(f.api.getRemoteOperationState().stateCommand).toBeUndefined();
    expect((fetch as jest.Mock).mock.calls.map(([, request]) => request.method)).toEqual(['POST', 'GET']);
  });

  it('rejects a Live View success when its accepted-owner save spans writer replacement', async () => {
    jest.useFakeTimers();
    const f = fixture();
    let releaseSave!: () => void;
    f.saveLive.mockImplementation(async state => {
      if (state.liveView?.phase === 'active') await new Promise<void>(resolve => { releaseSave = resolve; });
    });
    (fetch as jest.Mock).mockResolvedValueOnce(json({ command_id: 707, server: 'immis://fixture.invalid' }));
    const old = f.api.startCameraLiveview(20, 40).catch(error => error);
    await jest.advanceTimersByTimeAsync(0);
    expect(releaseSave).toBeDefined();
    const releasing = f.release({ deadline: Date.now() + 1 });
    await jest.advanceTimersByTimeAsync(2); await releasing;
    f.api.configureRemoteOperationOwnership({ restoredState: { liveView: f.api.getRemoteOperationState().liveView },
      saveState: jest.fn().mockResolvedValue(undefined) });
    releaseSave();
    await expect(old).resolves.toMatchObject({ dispatched: true, cause: { reason: 'ownership-unavailable' } });
    expect(f.api.getRemoteOperationState().liveView).toMatchObject({ phase: 'active', commandId: 707 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a late arm success after a successor reconciles and confirms disarm', async () => {
    jest.useFakeTimers();
    const f = fixture();
    let releaseOld!: (response: Response) => void;
    let firstStatus = true;
    (fetch as jest.Mock).mockImplementation(async (url: string, request: RequestInit) => {
      if (request.method === 'POST') return json({ id: url.endsWith('/arm') ? 101 : 102 });
      if (url.endsWith('/commands/101') && firstStatus) {
        firstStatus = false;
        return new Promise<Response>(resolve => { releaseOld = resolve; });
      }
      return json({ complete: true, status: 0 });
    });
    let confirmed = 'unknown';
    const oldArm = f.api.armNetwork(20).then(() => { confirmed = 'armed'; return undefined; }, error => error);
    await jest.advanceTimersByTimeAsync(0);
    expect(releaseOld).toBeDefined();
    const releasing = f.release({ deadline: Date.now() + 1 });
    await jest.advanceTimersByTimeAsync(2); await releasing;
    f.api.configureRemoteOperationOwnership({ restoredState: { stateCommand: f.api.getRemoteOperationState().stateCommand },
      saveState: jest.fn().mockResolvedValue(undefined) });
    await expect(f.api.reconcileKnownStateCommand()).resolves.toMatchObject({ confirmed: true, remoteStatus: 0 });
    const disarm = f.api.disarmNetwork(20);
    await jest.advanceTimersByTimeAsync(301); await disarm; confirmed = 'disarmed';
    releaseOld(json({ complete: true, status: 0 }));
    await expect(oldArm).resolves.toMatchObject({ dispatched: true });
    expect(confirmed).toBe('disarmed');
    expect(f.api.getRemoteOperationState().stateCommand).toBeUndefined();
    expect((fetch as jest.Mock).mock.calls.filter(([, request]) => request.method === 'POST')).toHaveLength(2);
  });

  it('does not confirm an old live-view retirement after a successor completes disarm', async () => {
    jest.useFakeTimers();
    const f = fixture(live({ retirementAcknowledged: true }));
    let releaseOld!: (response: Response) => void;
    let firstStatus = true;
    (fetch as jest.Mock).mockImplementation(async (url: string, request: RequestInit) => {
      if (request.method === 'POST') return json({ id: 102 });
      if (url.endsWith('/commands/707') && firstStatus) {
        firstStatus = false;
        return new Promise<Response>(resolve => { releaseOld = resolve; });
      }
      return json({ complete: true, status: 0 });
    });
    const oldRetirement = f.api.reconcileKnownLiveViews();
    await jest.advanceTimersByTimeAsync(0);
    expect(releaseOld).toBeDefined();
    const releasing = f.release({ deadline: Date.now() + 1 });
    await jest.advanceTimersByTimeAsync(2); await releasing;
    f.api.configureRemoteOperationOwnership({ restoredState: { liveView: f.api.getRemoteOperationState().liveView },
      saveState: jest.fn().mockResolvedValue(undefined) });
    const reconcile = f.api.reconcileKnownLiveViews();
    await jest.advanceTimersByTimeAsync(301);
    await expect(reconcile).resolves.toEqual([{ commandId: 707, confirmed: true }]);
    const disarm = f.api.disarmNetwork(20);
    await jest.advanceTimersByTimeAsync(301); await disarm;
    releaseOld(json({ complete: true, status: 0 }));
    await expect(oldRetirement).rejects.toMatchObject({ cause: { reason: 'ownership-unavailable' } });
    expect(f.api.getRemoteOperationState().liveView).toBeUndefined();
    expect((fetch as jest.Mock).mock.calls.filter(([, request]) => request.method === 'POST')).toHaveLength(1);
  });

  it.each(['arm', 'retirement'] as const)('rejects superseded %s terminal proof while its owner-clear save is pending', async kind => {
    jest.useFakeTimers();
    const f = fixture(kind === 'retirement' ? live({ retirementAcknowledged: true }) : undefined);
    let releaseSave!: () => void;
    f.saveLive.mockImplementationOnce(async state => {
      if (kind === 'retirement') await new Promise<void>(resolve => { releaseSave = resolve; });
      else f.savedRemote.push(copy(state));
    }).mockImplementation(async state => {
      if (!state.liveView && !state.stateCommand) await new Promise<void>(resolve => { releaseSave = resolve; });
    });
    (fetch as jest.Mock).mockImplementation(async (_url: string, request: RequestInit) => request.method === 'POST'
      ? json({ id: 101 }) : json({ complete: true, status: 0 }));
    const old = (kind === 'arm' ? f.api.armNetwork(20) : f.api.reconcileKnownLiveViews()).catch(error => error);
    await jest.advanceTimersByTimeAsync(0);
    expect(releaseSave).toBeDefined();
    const releasing = f.release({ deadline: Date.now() + 1 });
    await jest.advanceTimersByTimeAsync(2); await releasing;
    f.api.configureRemoteOperationOwnership({ saveState: jest.fn().mockResolvedValue(undefined) });
    releaseSave();
    if (kind === 'arm') await expect(old).resolves.toMatchObject({ dispatched: true });
    else await expect(old).resolves.toMatchObject({ cause: { reason: 'ownership-unavailable' } });
    expect(f.api.getRemoteOperationState().stateCommand).toBeUndefined();
    expect(f.api.getRemoteOperationState().liveView).toBeUndefined();
  });

  it.each(['lost', 'known'] as const)('flushes the newest %s acknowledgment receipt when journal persistence recovers', async acknowledgment => {
    const f = fixture();
    f.saveLive.mockRejectedValue(new Error('fixture disk unavailable'));
    const lost = new TypeError('fetch failed', { cause: { code: 'UND_ERR_SOCKET' } });
    if (acknowledgment === 'known') (fetch as jest.Mock).mockResolvedValueOnce(json({ id: 101 })).mockRejectedValueOnce(lost);
    else (fetch as jest.Mock).mockRejectedValueOnce(lost);
    await expect(f.api.armNetwork(20)).rejects.toThrow();
    const current = f.api.getRemoteOperationState().stateCommand;
    expect(current).toMatchObject({ phase: 'unresolved', ...(acknowledgment === 'known' ? { commandId: 101 } : {}) });
    expect(f.api.getRemoteOperationState().persistenceFailed).toBe(true);
    f.saveLive.mockImplementation(async state => { f.savedRemote.push(copy(state)); });
    await expect(f.api.retryRemoteOperationPersistence()).resolves.toBeUndefined();
    expect(f.savedRemote.at(-1)).toEqual({ stateCommand: current });
    expect(f.api.getRemoteOperationState().persistenceFailed).toBe(false);
    await expect(f.api.armNetwork(20)).rejects.toMatchObject({ reason: 'ownership-unavailable' });
    expect(fetch).toHaveBeenCalledTimes(acknowledgment === 'known' ? 2 : 1);
  });

  it('reports a failed explicit ownership flush without clearing the journal fault', async () => {
    const f = fixture();
    f.saveLive.mockRejectedValue(new Error('fixture disk unavailable'));
    await expect(f.api.retryRemoteOperationPersistence()).rejects.toThrow(/journal unavailable/);
    expect(f.api.getRemoteOperationState().persistenceFailed).toBe(true);
    f.saveLive.mockResolvedValue(undefined);
    await expect(f.api.retryRemoteOperationPersistence()).resolves.toBeUndefined();
    expect(f.api.getRemoteOperationState().persistenceFailed).toBe(false);
    await expect(f.api.withNativeStorageAdmission('event', async () => 'admitted', {}, scope)).resolves.toBe('admitted');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lets a fresh arm and writer handoff pass a hung old journal write, then flushes only the latest state', async () => {
    jest.useFakeTimers();
    const f = fixture();
    let releaseWrite!: () => void, releaseStatus!: (response: Response) => void;
    let physicalWrites = 0, maxPhysicalWrites = 0;
    f.saveLive.mockImplementationOnce(async () => {
      physicalWrites++; maxPhysicalWrites = Math.max(maxPhysicalWrites, physicalWrites);
      await new Promise<void>(resolve => { releaseWrite = resolve; });
      physicalWrites--;
    });
    const old = f.api.startCameraLiveview(20, 40, 'liveview', undefined, { deadline: Date.now() + 100 });
    const expired = expect(old).rejects.toBeInstanceOf(OperationTimeoutError);
    await jest.advanceTimersByTimeAsync(101); await expired;
    expect(fetch).not.toHaveBeenCalled();
    (fetch as jest.Mock).mockImplementation(async (_url: string, request: RequestInit) => request.method === 'POST'
      ? json({ id: 991 }) : new Promise<Response>(resolve => { releaseStatus = resolve; }));
    const arm = f.api.armNetwork(20);
    await jest.advanceTimersByTimeAsync(4000);
    expect(f.api.getRemoteOperationState().stateCommand).toMatchObject({ commandId: 991 });
    expect(fetch).toHaveBeenCalledTimes(2);
    releaseStatus(json({ complete: true, status: 0 })); await jest.advanceTimersByTimeAsync(1001); await arm;
    const releasing = f.release({ deadline: Date.now() + 100 });
    await jest.advanceTimersByTimeAsync(101); await releasing;
    const next = jest.fn(async () => {
      physicalWrites++; maxPhysicalWrites = Math.max(maxPhysicalWrites, physicalWrites);
      await Promise.resolve(); physicalWrites--;
    });
    f.api.configureRemoteOperationOwnership({ saveState: next });
    expect(next).not.toHaveBeenCalled();
    releaseWrite(); await jest.advanceTimersByTimeAsync(1);
    expect(f.api.getRemoteOperationState().liveView).toBeUndefined();
    expect(f.api.getRemoteOperationState().stateCommand).toBeUndefined();
    expect(next).toHaveBeenLastCalledWith(expect.objectContaining({ abandoned: [expect.objectContaining({ kind: 'liveview' })] }));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(maxPhysicalWrites).toBe(1);
  });

  it.each(['account', 'client', 'tier'] as const)
  ('rejects a stale %s-scoped writer before arm admission and resumes after a matching writer handoff', async changed => {
    const f = fixture();
    if (changed === 'account') {
      (f.auth.getAccountId as jest.Mock).mockReturnValue(11);
    } else if (changed === 'client') (f.auth.getClientId as jest.Mock).mockReturnValue(91);
    else (f.api as unknown as { config: { tier: string } }).config.tier = 'u002';
    (fetch as jest.Mock).mockImplementation(async (_url: string, request: RequestInit) => request.method === 'POST'
      ? json({ id: 901 }) : json({ complete: true, status: 0 }));
    await expect(f.api.armNetwork(20)).rejects.toMatchObject({ dispatched: false, reason: 'ownership-unavailable' });
    expect(fetch).not.toHaveBeenCalled();
    expect(f.saveLive).not.toHaveBeenCalled();
    expect(f.api.getRemoteOperationState().stateCommand).toBeUndefined();
    await f.release();
    const next = jest.fn().mockResolvedValue(undefined);
    f.api.configureRemoteOperationOwnership({ saveState: next });
    await expect(f.api.armNetwork(20)).resolves.toEqual({ id: 901 });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ stateCommand: expect.objectContaining({
      accountId: changed === 'account' ? 11 : 10, kind: 'arm',
    }) }));
    expect(f.saveLive).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('allows ordinary controls through an unscoped writer even while its journal is unavailable', async () => {
    const f = fixture(); await f.release();
    (f.auth.getClientId as jest.Mock).mockReturnValue(null);
    const save = jest.fn().mockRejectedValue(new Error('fixture journal unavailable'));
    f.api.configureRemoteOperationOwnership({ saveState: save });
    (f.auth.getClientId as jest.Mock).mockReturnValue(91);
    (f.auth.getAccountId as jest.Mock).mockReturnValue(11);
    (fetch as jest.Mock).mockImplementation(async (_url: string, request: RequestInit) => request.method === 'POST'
      ? json({ id: 902 }) : json({ complete: true, status: 0 }));
    await expect(f.api.armNetwork(20)).resolves.toEqual({ id: 902 });
    await expect(f.api.disarmNetwork(20)).resolves.toEqual({ id: 902 });
    expect(f.api.getRemoteOperationState().persistenceFailed).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('hands an idle writer to a replacement after shutdown and persists subsequent controls only through the replacement', async () => {
    const f = fixture(), next = jest.fn().mockResolvedValue(undefined);
    expect(() => f.api.configureRemoteOperationOwnership({ saveState: next })).toThrow('active operation ownership');
    await f.release();
    const releaseNext = f.api.configureRemoteOperationOwnership({ saveState: next });
    await f.release(); // An old lease cannot release its replacement.
    (fetch as jest.Mock).mockImplementation(async (_url: string, request: RequestInit) => request.method === 'POST'
      ? json({ id: 101 }) : json({ complete: true, status: 0 }));
    await expect(f.api.armNetwork(20)).resolves.toEqual({ id: 101 });
    expect(f.saveLive).not.toHaveBeenCalled(); expect(next).toHaveBeenCalled();
    expect(f.api.getRemoteOperationState()).toMatchObject({ persistenceFailed: false, storage: [] });
    await releaseNext();
  });

  it('drains an in-flight command before handoff without losing its final durable owner', async () => {
    const f = fixture(); let resolve!: (response: Response) => void;
    (fetch as jest.Mock).mockImplementation(async (_url: string, request: RequestInit) => request.method === 'POST'
      ? new Promise<Response>(yes => { resolve = yes; }) : json({ complete: true, status: 0 }));
    const arm = f.api.armNetwork(20);
    while (!resolve) await Promise.resolve();
    let released = false;
    const releasing = f.release().then(() => { released = true; });
    await Promise.resolve(); expect(released).toBe(false);
    expect(() => f.api.configureRemoteOperationOwnership({ saveState: jest.fn() })).toThrow('active operation ownership');
    resolve(json({ id: 101 })); await arm; await releasing;
    expect(f.savedRemote.at(-1)).toEqual({});
    expect(() => f.api.configureRemoteOperationOwnership({ saveState: jest.fn().mockResolvedValue(undefined) })).not.toThrow();
  });

  it('retains unknown native ownership on missing/foreign handoff and accepts an exact same-scope restore', async () => {
    const f = fixture(), state = pending({ phase: 'intent', commandId: undefined, statusReads: 0 });
    f.api.setNativeStorageOwner(scope, state); await f.release();
    const before = f.api.getRemoteOperationState();
    expect(() => f.api.configureRemoteOperationOwnership({ saveState: jest.fn() })).toThrow('retain the current owner');
    expect(() => f.api.configureRemoteOperationOwnership({ scope: { accountId: 10, clientId: 91, tier: 'u001' },
      restoredNativeStorage: [{ scope, state }], saveState: jest.fn() })).toThrow();
    const changedClient = jest.spyOn(f.api, 'getCachedIdentity').mockReturnValue({ accountId: 10, clientId: 91, tier: 'u001', sharedTier: 'e001' });
    expect(() => f.api.configureRemoteOperationOwnership({ restoredNativeStorage: [{ scope, state }], saveState: jest.fn() })).toThrow('another scope');
    changedClient.mockRestore();
    expect(f.api.getRemoteOperationState()).toEqual(before);
    const releaseNext = f.api.configureRemoteOperationOwnership({ restoredNativeStorage: [{ scope, state }],
      saveState: jest.fn().mockResolvedValue(undefined) });
    await expect(f.api.armNetwork(20)).rejects.toMatchObject({ dispatched: false, reason: 'storage-pending' });
    expect(f.api.getRemoteOperationState()).toEqual(before); expect(fetch).not.toHaveBeenCalled();
    await releaseNext();
  });

  it('keeps a lost ordinary acknowledgement fenced across same-instance writer replacement and refuses foreign restored state', async () => {
    const command: BlinkStateCommandOwnership = { reservationId: 'lost-arm', accountId: 10, networkId: 20,
      kind: 'arm', phase: 'unresolved', statusReads: 0, expiresAt: Date.now() + 120_000 };
    const f = fixture(undefined, command); await f.release();
    const before = f.api.getRemoteOperationState();
    expect(() => f.api.configureRemoteOperationOwnership({ saveState: jest.fn() })).toThrow();
    expect(() => f.api.configureRemoteOperationOwnership({ restoredState: { stateCommand: { ...command, accountId: 99 } },
      saveState: jest.fn() })).toThrow();
    expect(f.api.getRemoteOperationState()).toEqual(before);
    f.api.configureRemoteOperationOwnership({ restoredState: { stateCommand: command }, saveState: jest.fn().mockResolvedValue(undefined) });
    await expect(f.api.armNetwork(20)).rejects.toMatchObject({ dispatched: false });
    expect(f.api.getRemoteOperationState()).toEqual(before); expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves the last writer for owned live-view cleanup after shutdown and switches late cleanup to the replacement writer', async () => {
    const f = fixture(live()); await f.release();
    expect(() => f.api.configureRemoteOperationOwnership({ saveState: jest.fn() })).toThrow('retain the current owner');
    (fetch as jest.Mock).mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ complete: true, status: 0 }));
    await f.api.completeCommand(20, 707);
    expect(f.savedRemote.at(-1)).toEqual({}); expect(f.api.getRemoteOperationState().persistenceFailed).toBe(false);
    expect(() => f.api.configureRemoteOperationOwnership({ restoredState: { liveView: live() }, saveState: jest.fn() })).toThrow();
    const g = fixture(live()); await g.release();
    const next = jest.fn().mockResolvedValue(undefined);
    g.api.configureRemoteOperationOwnership({ restoredState: { liveView: g.api.getRemoteOperationState().liveView }, saveState: next });
    (fetch as jest.Mock).mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ complete: true, status: 0 }));
    await g.api.completeCommand(20, 707);
    expect(g.saveLive).not.toHaveBeenCalled(); expect(next).toHaveBeenCalled();
    expect(g.api.getRemoteOperationState()).toMatchObject({ persistenceFailed: false, storage: [] });
    expect(g.api.getRemoteOperationState().liveView).toBeUndefined();
  });

  it('registers only the authenticated client on its regional root with one bodyless-2xx request', async () => {
    const f = fixture();
    (fetch as jest.Mock).mockResolvedValue(new Response(null, { status: 204 }));
    const metadata = { appVersion: '61.0', osVersion: 'Android 16', clientName: 'Homebridge' };
    expect(f.api.getCachedIdentity()).toEqual({ accountId: 10, clientId: 90, tier: 'u001', sharedTier: 'e001' });
    await f.api.registerMotionNotificationKey('owned-fcm-secret', metadata);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://rest-u001.immedia-semi.com/clients/90/update');
    expect(options).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(JSON.parse(options.body)).toEqual({ app_version: '61.0', os_version: 'Android 16',
      client_name: 'Homebridge', notification_key: 'owned-fcm-secret' });
    expect(JSON.stringify(f.messages)).not.toContain('owned-fcm-secret');
    expect(JSON.stringify(f.messages)).not.toContain('fixture-auth');
  });

  it('refuses registration when account tier changes and rejects a missing authenticated client before sending', async () => {
    const f = fixture();
    (fetch as jest.Mock).mockResolvedValue(new Response(null, { status: 204 }));
    (f.auth.getPersistedTier as jest.Mock).mockResolvedValue('u002');
    await expect(f.api.registerMotionNotificationKey(null, { appVersion: '61.0', osVersion: '16', clientName: 'Homebridge' }))
      .rejects.toMatchObject({ dispatched: false });
    expect(fetch).not.toHaveBeenCalled();
    (f.auth.getClientId as jest.Mock).mockReturnValue(null);
    await expect(f.api.registerMotionNotificationKey('owned-token', { appVersion: '61.0', osVersion: '16', clientName: 'Homebridge' }))
      .rejects.toThrow('invalid remote identifier');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500])('does not replay notification registration at HTTP %s', async status => {
    const f = fixture();
    const refresh = jest.spyOn(f.auth, 'refreshTokens');
    (fetch as jest.Mock).mockResolvedValue(json({}, status));
    await expect(f.api.registerMotionNotificationKey('owned-token', { appVersion: '61.0', osVersion: '16', clientName: 'Homebridge' }))
      .rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rechecks notification account/client scope after asynchronous authentication without sending an old receiver token', async () => {
    const f = fixture();
    (f.auth.ensureValidToken as jest.Mock).mockImplementation(async () => {
      (f.auth.getClientId as jest.Mock).mockReturnValue(91);
    });
    await expect(f.api.registerMotionNotificationKey('owned-token', { appVersion: '61.0', osVersion: 'Node', clientName: 'Homebridge' }))
      .rejects.toMatchObject({ dispatched: false, reason: 'ownership-unavailable' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reconciles a known ordinary command within its finite lease without replaying its POST', async () => {
    const owner: BlinkStateCommandOwnership = { reservationId: 'accepted-arm', accountId: 10, networkId: 20,
      kind: 'arm', phase: 'unresolved', commandId: 101, statusReads: 1, expiresAt: Date.now() + 120_000 };
    const f = fixture(undefined, owner);
    await expect(f.api.withNativeStorageAdmission('event', async () => undefined, {}, scope))
      .rejects.toMatchObject({ dispatched: false, reason: 'ownership-unavailable' });
    (fetch as jest.Mock).mockResolvedValueOnce(json({ complete: true, status: 'complete' }))
      .mockResolvedValueOnce(json({ complete: true, status: 7 }));
    await expect(f.api.reconcileKnownStateCommand()).resolves.toEqual({ commandId: 101, confirmed: false });
    expect(f.api.getRemoteOperationState().stateCommand).toMatchObject({ commandId: 101, statusReads: 2 });
    await expect(f.api.reconcileKnownStateCommand()).resolves.toEqual({ commandId: 101, confirmed: true, remoteStatus: 7 });
    expect(f.api.getRemoteOperationState().stateCommand).toBeUndefined();
    await expect(f.api.withNativeStorageAdmission('event', async () => 'admitted', {}, scope)).resolves.toBe('admitted');
    expect((fetch as jest.Mock).mock.calls.map(([, request]) => request.method)).toEqual(['GET', 'GET']);
  });

  it.each([408, 500])('preserves a lost ordinary acknowledgement and never repeats its POST at HTTP %s', async status => {
    const f = fixture();
    (fetch as jest.Mock).mockResolvedValue(json({}, status));
    await expect(f.api.enableCameraMotion(20, 40)).rejects.toMatchObject({ status });
    const restored = f.savedRemote.at(-1)!.stateCommand!;
    expect(restored).toMatchObject({ phase: 'unresolved', kind: 'motion', statusReads: 0 });
    expect(restored.commandId).toBeUndefined();
    const restarted = fixture(undefined, restored);
    await expect(restarted.api.reconcileKnownStateCommand()).resolves.toEqual({ commandId: undefined, confirmed: false });
    await expect(restarted.api.withNativeStorageAdmission('event', async () => undefined, {}, scope))
      .rejects.toMatchObject({ dispatched: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([401, 404, 409, 429, 500])('does not clear an accepted ordinary command after a refused status GET at HTTP %s', async status => {
    const f = fixture();
    (fetch as jest.Mock).mockResolvedValueOnce(json({ id: 101 })).mockResolvedValueOnce(json({}, status));
    await expect(f.api.armNetwork(20)).rejects.toMatchObject({ status });
    expect(f.api.getRemoteOperationState().stateCommand).toMatchObject({ phase: 'unresolved', commandId: 101, statusReads: 1 });
    await expect(f.api.withNativeStorageAdmission('event', async () => undefined, {}, scope)).rejects.toMatchObject({ dispatched: false });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['shared-unsent-read', 'inherited-no-send', 'caller-connect-code'] as const)
  ('retains a dispatched arm uncertainty after abort with %s', async kind => {
    const f = fixture(), controller = new AbortController();
    const reason = Object.assign(new Error('operator cancelled'), kind === 'inherited-no-send' ? { dispatched: false }
      : kind === 'caller-connect-code' ? { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } } : {});
    let sent!: () => void;
    const dispatched = new Promise<void>(resolve => { sent = resolve; });
    (fetch as jest.Mock).mockImplementationOnce(() => { sent(); return new Promise(() => undefined); });
    const arm = f.api.armNetwork(20, { signal: controller.signal }).catch(error => error);
    await dispatched;
    controller.abort(reason);
    if (kind === 'shared-unsent-read') {
      const http = new BlinkHttp(f.auth, { email: '', password: '', hardwareId: 'fixture', tier: 'u001' });
      await expect(http.get('accounts/10/homescreen', { signal: controller.signal })).rejects.toMatchObject({ dispatched: false });
    }
    const failure = await arm;
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error & { dispatched?: boolean }).dispatched).not.toBe(false);
    await new Promise(resolve => setImmediate(resolve));
    expect(f.api.getRemoteOperationState().stateCommand).toMatchObject({ kind: 'arm', phase: 'unresolved', statusReads: 0 });
    expect(Object.hasOwn(reason, 'dispatched')).toBe(kind === 'inherited-no-send');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retains an accepted command when status authentication proves only that its GET was not sent', async () => {
    const f = fixture();
    const authenticationFailure = new Error('fixture auth unavailable');
    (f.auth.ensureValidToken as jest.Mock).mockResolvedValueOnce(undefined).mockRejectedValueOnce(authenticationFailure);
    (fetch as jest.Mock).mockResolvedValueOnce(json({ id: 101 }));
    await expect(f.api.armNetwork(20)).rejects.toMatchObject({ dispatched: true, cause: authenticationFailure });
    expect(f.api.getRemoteOperationState().stateCommand).toMatchObject({ phase: 'unresolved', commandId: 101 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retains an accepted arm when only its status GET fails to connect', async () => {
    const f = fixture();
    (fetch as jest.Mock).mockResolvedValueOnce(json({ id: 101 })).mockRejectedValueOnce(new TypeError('fetch failed', {
      cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
    }));
    await expect(f.api.armNetwork(20)).rejects.toMatchObject({ dispatched: true, cause: { failure: 'network', dispatched: false } });
    expect(f.api.getRemoteOperationState().stateCommand).toMatchObject({ phase: 'unresolved', commandId: 101 });
    await expect(f.api.armNetwork(20)).rejects.toMatchObject({ dispatched: false, reason: 'ownership-unavailable' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each((['early-notification', 'quality', 'thumbnail'] as const).flatMap(kind =>
    (['authentication', 'connection'] as const).map(failure => [kind, failure] as const)))
  ('does not report an accepted %s as unsent when its final read fails during %s', async (kind, failure) => {
    const f = fixture();
    const authenticationFailure = Object.assign(new Error('fixture readback authentication unavailable'), { dispatched: false });
    let completed = false;
    (fetch as jest.Mock).mockImplementation(async (url: string, request: RequestInit) => {
      if (request.method === 'POST') return json({ id: 101 });
      if (url.endsWith('/commands/101')) {
        completed = true;
        if (failure === 'authentication') (f.auth.ensureValidToken as jest.Mock).mockRejectedValueOnce(authenticationFailure);
        return json({ complete: true, status: 0 });
      }
      if (completed) throw new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
      return json({ camera: [{ early_notification: true, early_notification_compatible: true,
        video_quality: 'standard', video_quality_support: ['standard', 'best'] }] });
    });
    const command = kind === 'early-notification'
      ? f.api.setDeviceEarlyNotification('camera', 20, 40, 'catalina', false)
      : kind === 'quality' ? f.api.setDeviceVideoQuality('camera', 20, 40, 'best')
        : f.api.requestCameraThumbnail(20, 40);
    await expect(command).rejects.toMatchObject({ dispatched: true, cause: failure === 'authentication'
      ? authenticationFailure : { failure: 'network', dispatched: false } });
    expect(completed).toBe(true);
    expect(f.api.getRemoteOperationState().stateCommand).toBeUndefined();
    const calls = (fetch as jest.Mock).mock.calls as [string, RequestInit][];
    expect(calls.filter(([, request]) => request.method === 'POST')).toHaveLength(1);
    expect(calls.filter(([url]) => url.endsWith('/commands/101'))).toHaveLength(1);
    expect(calls.at(-1)?.[0]).toContain(failure === 'authentication' ? '/commands/101'
      : kind === 'thumbnail' ? '/homescreen' : '/config');
  });

  it.each(['early-notification', 'quality', 'thumbnail'] as const)
  ('keeps no-send proof when %s authentication fails before its mutation', async kind => {
    const f = fixture();
    (f.auth.ensureValidToken as jest.Mock).mockRejectedValueOnce(new Error('fixture authentication unavailable'));
    const command = kind === 'early-notification'
      ? f.api.setDeviceEarlyNotification('camera', 20, 40, 'catalina', false)
      : kind === 'quality' ? f.api.setDeviceVideoQuality('camera', 20, 40, 'best')
        : f.api.requestCameraThumbnail(20, 40);
    await expect(command).rejects.toMatchObject({ dispatched: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(f.api.getRemoteOperationState().stateCommand).toBeUndefined();
  });

  it('does not turn an accepted capture status refusal into a busy thumbnail fallback', async () => {
    const f = fixture();
    (fetch as jest.Mock).mockResolvedValueOnce(json({ id: 101 })).mockResolvedValueOnce(json({}, 409))
      .mockResolvedValueOnce(json({ account: { account_id: 10 }, networks: [],
        cameras: [{ id: 40, network_id: 20, name: 'Camera', thumbnail: '/current.jpg' }], doorbells: [], owls: [] }));
    await expect(f.api.requestCameraThumbnail(20, 40)).rejects.toMatchObject({ status: 409, method: 'GET' });
    expect(f.api.getRemoteOperationState().stateCommand).toMatchObject({ phase: 'unresolved', commandId: 101 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps no-send proof for a thumbnail read after the capture POST was definitively refused', async () => {
    const f = fixture();
    (fetch as jest.Mock).mockResolvedValueOnce(json({}, 409)).mockRejectedValueOnce(new TypeError('fetch failed', {
      cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
    }));
    await expect(f.api.requestCameraThumbnail(20, 40)).rejects.toMatchObject({ failure: 'network', dispatched: false });
    expect(f.api.getRemoteOperationState().stateCommand).toBeUndefined();
    expect((fetch as jest.Mock).mock.calls.map(([, request]) => request.method)).toEqual(['POST', 'GET']);
  });

  it('preserves timeout classification without false no-send proof after an accepted arm', async () => {
    const f = fixture();
    (f.auth.ensureValidToken as jest.Mock).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new OperationTimeoutError());
    (fetch as jest.Mock).mockResolvedValueOnce(json({ id: 101 }));
    const failure = await f.api.armNetwork(20).catch(error => error);
    expect(failure).toBeInstanceOf(OperationTimeoutError);
    expect((failure as Error & { dispatched?: boolean }).dispatched).toBe(true);
    expect(f.api.getRemoteOperationState().stateCommand).toMatchObject({ phase: 'unresolved', commandId: 101 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps ordinary controls available with bounded memory ownership when the journal is missing', async () => {
    const f = fixture();
    await f.release();
    (fetch as jest.Mock).mockImplementation(async (_url: string, request: RequestInit) => request.method === 'POST'
      ? json({ id: 904 }) : json({ complete: true, status: 0 }));
    await expect(f.api.disarmNetwork(20)).resolves.toEqual({ id: 904 });
    expect(f.api.getRemoteOperationState().stateCommand).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('never renews an exhausted ordinary status-read budget on restart or explicit reconciliation', async () => {
    const f = fixture(undefined, { reservationId: 'owned-state', ...scope, kind: 'arm', phase: 'unresolved',
      commandId: 101, statusReads: 60, expiresAt: Date.now() + 120_000 });
    await expect(f.api.reconcileKnownStateCommand()).resolves.toEqual({ commandId: 101, confirmed: false });
    await expect(f.api.withNativeStorageAdmission('event', async () => undefined, {}, scope)).rejects.toMatchObject({ dispatched: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('follows official parent/child and selected-clip workflows, then promotes one private hashed file', async () => {
    const f = fixture(); const saved: NativeStorageState[] = [];
    const transport = f.api.createNativeStorageTransport({ scope, directory });
    const owner = new NativeStorageOwner({ transport,
      admit: (work, options, id, binding) => f.api.withNativeStorageAdmission(id, work, options, binding),
      saveState: async state => { saved.push(copy(state)); f.api.setNativeStorageOwner(scope, state); } });
    const bytes = Buffer.from('synthetic-local-mp4-test-bytes');
    (fetch as jest.Mock).mockImplementation(async (url: string, options: RequestInit) => {
      const operation = saved.at(-1)?.operation;
      if (options.method === 'POST') {
        expect(options.body).toBeUndefined();
        expect(operation?.phase).toBe('intent');
        if (url.endsWith('/manifest/request')) return json({ id: 101 });
        if (url.endsWith('/manifest/303/clip/request/404')) return json({ id: 505 });
      }
      if (url.endsWith('/commands/101')) return json({ complete: true, status: 0, commands: [{ id: 202 }] });
      if (url.endsWith('/media/202')) return json({ manifest_id: 303, page_size: 1000, pagination_key: '',
        media: [{ id: clip.clipId, network_id: 20, device_name: clip.deviceName, created_at: clip.capturedAt, media: mediaUrl }] });
      if (url.endsWith('/commands/505')) return json({ complete: true, status: 0 });
      if (url === mediaUrl) { expect(operation?.phase).toBe('prepared'); return new Response(bytes); }
      throw new Error(`Unexpected offline fixture route: ${url}`);
    });
    const catalog = await owner.readCatalog({ ...scope, operationId: 'event:catalog' });
    expect(catalog).toMatchObject({ status: 'ready', value: { manifestId: 303, clips: [clip] } });
    const downloaded = await owner.downloadClip({ ...scope, operationId: 'event:clip' }, { manifestId: 303, clip });
    expect(downloaded.status).toBe('ready');
    if (downloaded.status !== 'ready') throw new Error('Expected media receipt');
    const receipt = downloaded.value;
    expect(path.isAbsolute(receipt.reference)).toBe(true);
    expect(path.dirname(receipt.reference)).toBe(await fs.realpath(directory));
    expect(await fs.readFile(receipt.reference)).toEqual(bytes);
    expect((await fs.stat(receipt.reference)).mode & 0o777).toBe(0o600);
    expect(receipt).toMatchObject({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    expect(await fs.readdir(directory)).toEqual([path.basename(receipt.reference)]);
    expect((fetch as jest.Mock).mock.calls.map(([url, options]) => [options.method, url])).toEqual([
      ['POST', `${sharedRoot}api/${modulePath}/manifest/request`],
      ['GET', `${sharedRoot}accounts/10/networks/20/commands/101`],
      ['GET', `${sharedRoot}api/${modulePath}/media/202`],
      ['POST', `${sharedRoot}api/${modulePath}/manifest/303/clip/request/404`],
      ['GET', `${sharedRoot}accounts/10/networks/20/commands/505`],
      ['GET', mediaUrl],
    ]);
    expect(f.api.getRemoteOperationState().storage).toEqual([]);
  });

  it.each(['catalog', 'clip'] as const)('releases a terminal native %s preparation after result GET failure so ordinary controls work without restart', async kind => {
    const f = fixture(), saved: NativeStorageState[] = [];
    const owner = new NativeStorageOwner({ transport: f.api.createNativeStorageTransport({ scope, directory }),
      admit: (work, options, id, binding) => f.api.withNativeStorageAdmission(id, work, options, binding),
      saveState: async state => { saved.push(copy(state)); f.api.setNativeStorageOwner(scope, state); } });
    const resultUrl = kind === 'clip' ? mediaUrl : `${sharedRoot}api/${modulePath}/media/202`;
    (fetch as jest.Mock).mockImplementation(async (url: string, options: RequestInit) => {
      if (url === resultUrl) return json({ error: 'result unavailable' }, 503);
      if (options.method === 'POST') return json({ id: url.endsWith('/state/arm') ? 606 : 505 });
      return json({ complete: true, status: 0, commands: [{ id: 202 }] });
    });
    const context = { ...scope, operationId: `failed-${kind}` };
    await expect(kind === 'clip' ? owner.downloadClip(context, { manifestId: 303, clip }) : owner.readCatalog(context))
      .resolves.toEqual({ status: 'failed', reason: kind === 'clip' ? 'invalid-media' : 'invalid-result' });
    expect(saved.at(-1)?.operation).toMatchObject({ phase: 'finished', commandId: 505, statusReads: 1 });
    expect(f.api.getRemoteOperationState().storage).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(3);
    await expect(f.api.armNetwork(20)).resolves.toEqual({ id: 606 });
    expect(fetch).toHaveBeenCalledTimes(5);
    expect((fetch as jest.Mock).mock.calls.filter(([url]) => url === resultUrl)).toHaveLength(1);
  });

  it.each([
    'https://evil.example/api/v1/accounts/10/networks/20/sync_modules/30/local_storage/manifest/303/clip/request/404/',
    mediaUrl.replace('/accounts/10/', '/accounts/11/'),
    mediaUrl.replace('/networks/20/', '/networks/21/'),
    mediaUrl.replace('/sync_modules/30/', '/sync_modules/31/'),
    mediaUrl.replace('https:', 'http:'),
    mediaUrl.replace('https://', 'https://user:password@'),
    `${mediaUrl}#fragment`,
    '//evil.example/clip',
  ])('rejects untrusted provider media without authentication or fetching: %s', location => {
    const f = fixture();
    const transport = f.api.createNativeStorageTransport({ scope, directory });
    expect(() => transport.validateMediaUrl(location)).toThrow(BlinkOperationNotStartedError);
    expect(f.auth.ensureValidToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts scoped absolute and relative media URLs while preserving opaque query data', () => {
    const f = fixture(); const transport = f.api.createNativeStorageTransport({ scope, directory });
    expect(transport.validateMediaUrl(mediaUrl)).toBe(mediaUrl);
    expect(transport.validateMediaUrl(new URL(mediaUrl).pathname + new URL(mediaUrl).search)).toBe(mediaUrl);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires a canonical admission and committed intent before an empty POST and never replays it', async () => {
    const f = fixture(); const transport = f.api.createNativeStorageTransport({ scope, directory });
    const route = { base: 'api' as const, path: `${modulePath}/manifest/request` };
    await expect(transport.postEmpty(route, request)).rejects.toMatchObject({ dispatched: false });
    await f.api.withNativeStorageAdmission('event', async () => {
      await expect(transport.postEmpty(route, request)).rejects.toMatchObject({ dispatched: false });
      f.api.setNativeStorageOwner(scope, pending({ operationId: 'event', phase: 'intent', commandId: undefined, statusReads: 0 }));
      (fetch as jest.Mock).mockResolvedValue(json({ id: 101 }));
      await expect(transport.postEmpty(route, request)).resolves.toEqual({ id: 101 });
      await expect(transport.postEmpty(route, request)).rejects.toMatchObject({ dispatched: false });
    }, {}, scope);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('resumes a committed accepted command after restart without replaying its preparation POST', async () => {
    const f = fixture(); const restored = pending(); f.api.setNativeStorageOwner(scope, restored);
    const owner = new NativeStorageOwner({ restoredState: restored,
      transport: f.api.createNativeStorageTransport({ scope, directory }),
      admit: (work, options, id, binding) => f.api.withNativeStorageAdmission(id, work, options, binding),
      saveState: async state => f.api.setNativeStorageOwner(scope, state) });
    (fetch as jest.Mock).mockResolvedValueOnce(json({ complete: true, status: 0, commands: [{ id: 202 }] }))
      .mockResolvedValueOnce(json({ manifest_id: null, page_size: 1000, pagination_key: null, media: [] }));
    await expect(owner.readCatalog({ ...scope, operationId: 'pending-a' })).resolves.toMatchObject({ status: 'ready' });
    expect((fetch as jest.Mock).mock.calls.map(([url, options]) => [options.method, url])).toEqual([
      ['GET', `${sharedRoot}accounts/10/networks/20/commands/101`],
      ['GET', `${sharedRoot}api/${modulePath}/media/202`],
    ]);
  });

  it('rejects a selected clip whose provider URL disagrees with its manifest before any POST', async () => {
    const f = fixture(); const transport = f.api.createNativeStorageTransport({ scope, directory });
    const owner = new NativeStorageOwner({ transport,
      admit: (work, options, id, binding) => f.api.withNativeStorageAdmission(id, work, options, binding),
      saveState: async state => f.api.setNativeStorageOwner(scope, state) });
    await expect(owner.downloadClip({ ...scope, operationId: 'bad-manifest' },
      { manifestId: 304, clip })).resolves.toEqual({ status: 'failed', reason: 'not-started' });
    expect(fetch).not.toHaveBeenCalled();
    expect(f.api.getRemoteOperationState().storage).toEqual([]);
  });

  it('keeps an unknown module A fenced when finished or empty module B is committed', async () => {
    const f = fixture(); const otherScope = { ...scope, syncModuleId: 31 };
    f.api.setNativeStorageOwner(scope, pending({ phase: 'intent', commandId: undefined, statusReads: 0 }));
    f.api.setNativeStorageOwner(otherScope, { version: 1 });
    f.api.setNativeStorageOwner(otherScope, { version: 1, operation: { ...pending().operation!, ...otherScope,
      phase: 'finished', result: { status: 'failed', reason: 'command-failed', remoteStatus: 7 } } });
    await expect(f.api.armNetwork(20)).rejects.toMatchObject({ dispatched: false, reason: 'storage-pending' });
    await expect(f.api.startCameraLiveview(20, 40)).rejects.toMatchObject({ dispatched: false, reason: 'storage-pending' });
    const work = jest.fn(async () => undefined);
    await expect(f.api.withNativeStorageAdmission('other', work, {}, otherScope)).rejects.toMatchObject({ dispatched: false });
    expect(work).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(f.api.getRemoteOperationState().storage).toEqual([expect.objectContaining({ syncModuleId: 30 })]);
  });

  it('rechecks pending ownership for already queued mutations before dispatch', async () => {
    const f = fixture();
    const arm = f.api.armNetwork(20);
    f.api.setNativeStorageOwner(scope, pending());
    await expect(arm).rejects.toMatchObject({ dispatched: false, reason: 'storage-pending' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('releases the shared queue when a storage callback exceeds its finite execution budget', async () => {
    jest.useFakeTimers();
    const f = fixture();
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const admitted = f.api.withNativeStorageAdmission('event', async () => blocked, { deadline: Date.now() + 100 }, scope);
    const caller = withinRequestBudget(admitted, { deadline: Date.now() + 100 });
    const failed = expect(caller).rejects.toBeInstanceOf(OperationTimeoutError);
    const arm = f.api.armNetwork(20);
    (fetch as jest.Mock).mockImplementation(async (_url: string, request: RequestInit) => json(
      request.method === 'POST' ? { id: 1 } : { complete: true, status: 0 }));
    await jest.advanceTimersByTimeAsync(1000); await failed;
    expect(fetch).toHaveBeenCalledTimes(2);
    release(); await expect(admitted).rejects.toBeInstanceOf(OperationTimeoutError); await arm;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('records a live view reservation before its POST and blocks storage after a lost acknowledgement', async () => {
    const f = fixture();
    (fetch as jest.Mock).mockImplementation(async () => {
      expect(f.savedLive.at(-1)).toMatchObject({ phase: 'starting', networkId: 20, deviceId: 40 });
      throw new TypeError('fixture transport lost');
    });
    await expect(f.api.startCameraLiveview(20, 40)).rejects.toThrow();
    expect(f.api.getRemoteOperationState().liveView).toMatchObject({ phase: 'unresolved', retirementAcknowledged: false });
    await expect(f.api.withNativeStorageAdmission('event', async () => undefined, {}, scope))
      .rejects.toMatchObject({ dispatched: false, reason: 'liveview-pending' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['liveview', 'arm'] as const)('releases a %s connection timeout before allowing a later arm', async operation => {
    const f = fixture();
    (fetch as jest.Mock).mockRejectedValueOnce(new TypeError('fetch failed', {
      cause: Object.assign(new Error('fixture connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' }),
    }));
    await expect(operation === 'liveview' ? f.api.startCameraLiveview(20, 40) : f.api.armNetwork(20))
      .rejects.toMatchObject({ failure: 'network', dispatched: false });
    expect(f.api.getRemoteOperationState()).toMatchObject({ storage: [], persistenceFailed: false });
    expect(f.api.getRemoteOperationState().liveView).toBeUndefined();
    expect(f.api.getRemoteOperationState().stateCommand).toBeUndefined();
    expect(f.savedRemote.at(-1)).toEqual({});
    expect(fetch).toHaveBeenCalledTimes(1);
    (fetch as jest.Mock).mockResolvedValueOnce(json({ id: 701 })).mockResolvedValueOnce(json({ complete: true, status: 0 }));
    await expect(f.api.armNetwork(20)).resolves.toMatchObject({ id: 701 });
    expect((fetch as jest.Mock).mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'POST', 'GET']);
  });

  it('clears a live view whose deadline expires after authentication without any request', async () => {
    const f = fixture(), now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    (f.auth.ensureValidToken as jest.Mock).mockImplementationOnce(async () => {
      await Promise.resolve();
      now.mockReturnValue(2_000);
    });
    await expect(f.api.startCameraLiveview(20, 40, 'liveview', undefined, { deadline: 2_000 }))
      .rejects.toMatchObject({ name: 'OperationTimeoutError', dispatched: false });
    expect(f.api.getRemoteOperationState().liveView).toBeUndefined();
    expect(f.savedRemote.at(-1)).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
    now.mockRestore();
    (fetch as jest.Mock).mockResolvedValueOnce(json({ id: 701 })).mockResolvedValueOnce(json({ complete: true, status: 0 }));
    await expect(f.api.armNetwork(20)).resolves.toMatchObject({ id: 701 });
    expect((fetch as jest.Mock).mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'GET']);
  });

  it.each(['UND_ERR_SOCKET', 'ECONNRESET', 'UND_ERR_HEADERS_TIMEOUT'])('keeps a live view fenced after ambiguous %s', async code => {
    const f = fixture();
    (fetch as jest.Mock).mockRejectedValueOnce(new TypeError('fetch failed', { cause: { code } }));
    await expect(f.api.startCameraLiveview(20, 40)).rejects.toMatchObject({ failure: 'network' });
    const owner = f.savedRemote.at(-1)!.liveView!;
    expect(owner).toMatchObject({ phase: 'unresolved', retirementAcknowledged: false });
    expect(owner.commandId).toBeUndefined();
    const restarted = fixture(owner);
    await expect(restarted.api.armNetwork(20)).rejects.toMatchObject({ dispatched: false, reason: 'liveview-pending' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([409, 429])('releases a definitively refused live view at HTTP %s without automatic replay', async status => {
    const f = fixture();
    (fetch as jest.Mock).mockResolvedValue(json({}, status));
    await expect(f.api.startCameraLiveview(20, 40)).rejects.toMatchObject({ status });
    expect(f.api.getRemoteOperationState().liveView).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(f.api.withNativeStorageAdmission('next-event', async () => 'admitted', {}, scope)).resolves.toBe('admitted');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([408, 500])('keeps an unacknowledged live view fenced at HTTP %s', async status => {
    const f = fixture();
    (fetch as jest.Mock).mockResolvedValue(json({}, status));
    await expect(f.api.startCameraLiveview(20, 40)).rejects.toMatchObject({ status });
    const saved = f.savedRemote.at(-1)!.liveView!;
    expect(saved).toMatchObject({ phase: 'unresolved' });
    expect(saved.commandId).toBeUndefined();
    const restarted = fixture(saved);
    await expect(restarted.api.withNativeStorageAdmission('next-event', async () => undefined, {}, scope))
      .rejects.toMatchObject({ dispatched: false, reason: 'liveview-pending' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['unreadable', 'missing-command'])('keeps a live view fenced after a %s successful response', async failure => {
    const f = fixture();
    (fetch as jest.Mock).mockResolvedValueOnce(failure === 'unreadable' ? new Response('invalid-json') : json({}));
    await expect(f.api.startCameraLiveview(20, 40)).rejects.toThrow();
    expect(f.api.getRemoteOperationState().liveView).toMatchObject({ phase: 'unresolved', retirementAcknowledged: false });
    await expect(f.api.armNetwork(20)).rejects.toMatchObject({ dispatched: false, reason: 'liveview-pending' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('allows a later ordinary command after a manifest POST was definitively refused', async () => {
    const f = fixture(), transport = f.api.createNativeStorageTransport({ scope, directory });
    const saved: NativeStorageState[] = [];
    const owner = new NativeStorageOwner({ transport,
      admit: (work, options, id, binding) => f.api.withNativeStorageAdmission(id, work, options, binding),
      saveState: async state => { saved.push(copy(state)); f.api.setNativeStorageOwner(scope, state); } });
    (fetch as jest.Mock).mockResolvedValueOnce(json({}, 409));
    await expect(owner.readCatalog({ ...scope, operationId: 'refused-manifest' }))
      .resolves.toEqual({ status: 'failed', reason: 'refused', httpStatus: 409 });
    expect(saved.at(-1)?.operation).toMatchObject({ phase: 'finished', statusReads: 0 });
    expect(f.api.getRemoteOperationState().storage).toEqual([]);
    (fetch as jest.Mock).mockResolvedValueOnce(json({ id: 701 })).mockResolvedValueOnce(json({ complete: true, status: 0 }));
    await expect(f.api.armNetwork(20)).resolves.toMatchObject({ id: 701 });
    expect((fetch as jest.Mock).mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'POST', 'GET']);
  });

  it('clears a live view reservation when authentication proves its resource request was never sent', async () => {
    const f = fixture(); const failure = new Error('fixture auth unavailable');
    (f.auth.ensureValidToken as jest.Mock).mockRejectedValue(failure);
    await expect(f.api.startCameraLiveview(20, 40)).rejects.toMatchObject({ cause: failure, dispatched: false });
    expect(Object.hasOwn(failure, 'dispatched')).toBe(false);
    expect(f.api.getRemoteOperationState().liveView).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses bounded memory ownership for a live view when its journal cannot be written', async () => {
    const f = fixture(); f.saveLive.mockRejectedValue(new Error('fixture disk unavailable'));
    (fetch as jest.Mock).mockResolvedValueOnce(json({ command_id: 707, server: 'immis://fixture.invalid' }));
    await expect(f.api.startCameraLiveview(20, 40)).resolves.toMatchObject({ command_id: 707 });
    await expect(f.api.withNativeStorageAdmission('event', async () => undefined, {}, scope))
      .rejects.toMatchObject({ dispatched: false, reason: 'liveview-pending' });
    expect(f.api.getRemoteOperationState()).toMatchObject({ persistenceFailed: true,
      liveView: { phase: 'active', commandId: 707, expiresAt: expect.any(Number) } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([404, 500])('does not release an owned view after /done HTTP %s', async status => {
    const f = fixture(live());
    (fetch as jest.Mock).mockResolvedValue(json({}, status));
    if (status === 404) await expect(f.api.completeCommand(20, 707)).resolves.toBeNull();
    else await expect(f.api.completeCommand(20, 707)).rejects.toMatchObject({ status });
    expect(f.api.getRemoteOperationState().liveView).toMatchObject({ phase: 'unresolved', commandId: 707 });
    await expect(f.api.armNetwork(20)).rejects.toMatchObject({ dispatched: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('requires one verified terminal read after a Unit /done acknowledgement', async () => {
    const f = fixture(live());
    (fetch as jest.Mock).mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ complete: true, status: 0 }));
    await expect(f.api.completeCommand(20, 707)).resolves.toBeUndefined();
    expect(f.api.getRemoteOperationState().liveView).toBeUndefined();
    expect((fetch as jest.Mock).mock.calls.map(([url, options]) => [options.method, url])).toEqual([
      ['POST', `${sharedRoot}accounts/10/networks/20/commands/707/done`],
      ['GET', `${sharedRoot}accounts/10/networks/20/commands/707`],
    ]);
    expect(f.savedLive).toEqual([expect.objectContaining({ phase: 'retiring', retirementAcknowledged: false }),
      expect.objectContaining({ phase: 'retiring', retirementAcknowledged: true }), undefined]);
  });

  it('retains an acknowledged but pending view, then reconciles once on explicit request without another POST', async () => {
    const f = fixture(live());
    (fetch as jest.Mock).mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ complete: false, status: 0 }))
      .mockResolvedValueOnce(json({ complete: true, status: 0 }));
    await expect(f.api.completeCommand(20, 707)).rejects.toThrow('unconfirmed');
    expect(f.api.getRemoteOperationState().liveView).toMatchObject({ phase: 'unresolved', retirementAcknowledged: true });
    await expect(f.api.reconcileKnownLiveViews()).resolves.toEqual([{ commandId: 707, confirmed: true }]);
    expect((fetch as jest.Mock).mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'GET', 'GET']);
    expect(f.api.getRemoteOperationState().liveView).toBeUndefined();
  });

  it('does not mistake live view startup completion for retirement', async () => {
    const f = fixture(live());
    await expect(f.api.reconcileKnownLiveViews()).resolves.toEqual([{ commandId: 707, confirmed: false }]);
    expect(fetch).not.toHaveBeenCalled();
    expect(f.api.getRemoteOperationState().liveView).toMatchObject({ commandId: 707 });
  });

  it.each((['catalog', 'clip'] as const).flatMap(kind =>
    (['authentication', 'response', 'ready-save'] as const).map(stage => [kind, stage] as const)))
  ('keeps prepared %s acquisition on committed auth while candidate persistence fails at %s', async (kind, stage) => {
    const f = fixture(), transport = f.api.createNativeStorageTransport({ scope, directory });
    (f.auth.getClientId as jest.Mock).mockRestore();
    const auth = f.auth as unknown as { clientId: number; persistCurrentStateUnlocked(): Promise<void>;
      captureTokensUnlocked(body: unknown, header: null): Promise<void> };
    auth.clientId = 90;
    let restore!: () => void, rollback = Promise.resolve(), candidate = false;
    const gate = new Promise<void>(resolve => { restore = resolve; });
    jest.spyOn(auth, 'persistCurrentStateUnlocked').mockImplementation(async () => { await gate; throw new Error('candidate auth persist failed'); });
    const rotate = () => {
      if (candidate) return;
      candidate = true;
      rollback = auth.captureTokensUnlocked({ access_token: 'fixture-candidate', refresh_token: 'fixture-refresh', expires_in: 3600,
        client_id: 91 }, null).catch(() => undefined);
    };
    const state = pending({ operationId: `same-result-${kind}`, kind, phase: 'prepared', statusReads: 1,
      ...(kind === 'catalog' ? { resultCommandId: 202 } : { clip: { manifestId: 303, clip } }) });
    const saved: NativeStorageState[] = [];
    const owner = new NativeStorageOwner({ transport, restoredState: state,
      admit: (work, options, id, context) => f.api.withNativeStorageAdmission(id, work, options, context),
      saveState: async next => {
        saved.push(copy(next)); f.api.setNativeStorageOwner(scope, next);
        if (stage === 'ready-save' && next.operation?.phase === 'finished' && next.operation.result?.status === 'ready') rotate();
      } });
    f.api.setNativeStorageOwner(scope, state);
    if (stage === 'authentication') (f.auth.ensureValidToken as jest.Mock).mockImplementationOnce(async () => { rotate(); });
    (fetch as jest.Mock).mockImplementation(async () => {
      if (stage === 'response') rotate();
      return kind === 'clip' ? new Response(Buffer.from('fixture clip')) : json({ manifest_id: 303,
        media: [{ id: 404, network_id: 20, device_name: 'Entry_ABC', media: mediaUrl }], page_size: 1000, pagination_key: null });
    });
    const context = { ...scope, operationId: state.operation!.operationId };
    const acquire = () => kind === 'catalog' ? owner.readCatalog(context) : owner.downloadClip(context, { manifestId: 303, clip });
    try {
      await expect(acquire()).resolves.toMatchObject({ status: 'ready' });
      expect(f.api.getCachedIdentity().clientId).toBe(90);
      expect(owner.snapshot().operation).toMatchObject({ operationId: context.operationId, phase: 'finished',
        statusReads: 1, expiresAt: state.operation!.expiresAt });
      expect(saved.some(next => next.operation?.phase === 'finished' && next.operation.result?.status === 'failed')).toBe(false);
      restore(); await rollback;
      expect(f.api.getCachedIdentity().clientId).toBe(90);
      await expect(acquire()).resolves.toMatchObject({ status: 'ready' });
      expect((fetch as jest.Mock).mock.calls.every(([url, request]) => request.method === 'GET' && (kind === 'catalog'
        ? url.endsWith('/media/202') : url === mediaUrl))).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(owner.snapshot().operation).toMatchObject({ operationId: context.operationId, expiresAt: state.operation!.expiresAt, statusReads: 1 });
    } finally { restore(); await rollback; }
  });

  it.each(['account', 'client', 'tier', 'writer', 'fence'] as const)
  ('blocks a native media GET when %s authority changes during authentication', async changed => {
    const f = fixture(), transport = f.api.createNativeStorageTransport({ scope, directory });
    const state = pending({ operationId: 'clip', kind: 'clip', phase: 'prepared', clip: { manifestId: 303, clip }, commandId: 505 });
    f.api.setNativeStorageOwner(scope, state);
    let release!: () => void;
    (f.auth.ensureValidToken as jest.Mock).mockReturnValueOnce(new Promise<void>(resolve => { release = resolve; }));
    (fetch as jest.Mock).mockResolvedValueOnce(new Response(Buffer.from('fixture clip')));
    const operation = f.api.withNativeStorageAdmission('clip', () => transport.downloadMedia(mediaUrl, request), {}, scope).catch(error => error);
    while (!(f.auth.ensureValidToken as jest.Mock).mock.calls.length) await new Promise(resolve => setImmediate(resolve));
    if (changed === 'account') (f.auth.getAccountId as jest.Mock).mockReturnValue(11);
    else if (changed === 'client') (f.auth.getClientId as jest.Mock).mockReturnValue(91);
    else if (changed === 'tier') (f.api as unknown as { config: { tier: string } }).config.tier = 'u002';
    else if (changed === 'fence') f.api.setNativeStorageOwner(scope, { ...state, operation: { ...state.operation!, operationId: 'successor' } });
    else {
      await f.release({ deadline: Date.now() + 1 });
      f.api.configureRemoteOperationOwnership({ restoredNativeStorage: [{ scope, state }], saveState: jest.fn().mockResolvedValue(undefined) });
    }
    release();
    expect(await operation).toBeInstanceOf(Error);
    expect(fetch).not.toHaveBeenCalled();
    expect(await fs.readdir(directory)).toEqual([]);
    expect(f.saveLive).not.toHaveBeenCalled();
  });

  it.each(['account', 'writer', 'fence'] as const)
  ('discards native media without promoting an asset when %s authority changes during its response', async changed => {
    const f = fixture(), transport = f.api.createNativeStorageTransport({ scope, directory });
    const state = pending({ operationId: 'clip', kind: 'clip', phase: 'prepared', clip: { manifestId: 303, clip }, commandId: 505 });
    f.api.setNativeStorageOwner(scope, state);
    (fetch as jest.Mock).mockImplementationOnce(async () => {
      if (changed === 'account') (f.auth.getAccountId as jest.Mock).mockReturnValue(11);
      else if (changed === 'fence') f.api.setNativeStorageOwner(scope, { ...state, operation: { ...state.operation!, operationId: 'successor' } });
      else {
        await f.release({ deadline: Date.now() + 1 });
        f.api.configureRemoteOperationOwnership({ restoredNativeStorage: [{ scope, state }], saveState: jest.fn().mockResolvedValue(undefined) });
      }
      return new Response(Buffer.from('fixture clip'));
    });
    const failure = await f.api.withNativeStorageAdmission('clip', () => transport.downloadMedia(mediaUrl, request), {}, scope).catch(error => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error & { dispatched?: boolean }).dispatched).toBeUndefined();
    expect(await fs.readdir(directory)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(f.saveLive).not.toHaveBeenCalled();
  });

  it('removes a promoted native asset when account authority changes during local promotion', async () => {
    const f = fixture(), transport = f.api.createNativeStorageTransport({ scope, directory });
    f.api.setNativeStorageOwner(scope, pending({ operationId: 'clip', kind: 'clip', phase: 'prepared', clip: { manifestId: 303, clip }, commandId: 505 }));
    const link = fs.link.bind(fs);
    jest.spyOn(fs, 'link').mockImplementationOnce(async (from, target) => {
      await link(from, target);
      (f.auth.getAccountId as jest.Mock).mockReturnValue(11);
    });
    (fetch as jest.Mock).mockResolvedValueOnce(new Response(Buffer.from('fixture clip')));
    const failure = await f.api.withNativeStorageAdmission('clip', () => transport.downloadMedia(mediaUrl, request), {}, scope).catch(error => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error & { dispatched?: boolean }).dispatched).toBeUndefined();
    expect(await fs.readdir(directory)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['client', 'writer'] as const)('preserves native POST acknowledgment proof when %s authority changes during its response', async changed => {
    const f = fixture(), transport = f.api.createNativeStorageTransport({ scope, directory });
    const state = pending({ operationId: 'event', phase: 'intent', commandId: undefined, statusReads: 0 });
    (fetch as jest.Mock).mockImplementationOnce(async () => {
      if (changed === 'client') (f.auth.getClientId as jest.Mock).mockReturnValue(91);
      else {
        await f.release({ deadline: Date.now() + 1 });
        f.api.configureRemoteOperationOwnership({ restoredNativeStorage: [{ scope, state }], saveState: jest.fn().mockResolvedValue(undefined) });
      }
      return json({ id: 101 });
    });
    const operation = f.api.withNativeStorageAdmission('event', async () => {
      f.api.setNativeStorageOwner(scope, state);
      return transport.postEmpty({ base: 'api', path: `${modulePath}/manifest/request` }, request);
    }, {}, scope);
    await expect(operation).rejects.toMatchObject({ dispatched: true });
    expect(f.api.getRemoteOperationState().storage).toEqual([expect.objectContaining({ operationId: 'event', phase: 'intent' })]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['client', 'writer'] as const)('blocks a native known-status GET when %s authority changes during authentication', async changed => {
    const f = fixture(), transport = f.api.createNativeStorageTransport({ scope, directory }), state = pending();
    f.api.setNativeStorageOwner(scope, state);
    let release!: () => void;
    (f.auth.ensureValidToken as jest.Mock).mockReturnValueOnce(new Promise<void>(resolve => { release = resolve; }));
    (fetch as jest.Mock).mockResolvedValueOnce(json({ complete: true, status: 0 }));
    const operation = transport.getJson({ base: 'root', path: 'accounts/10/networks/20/commands/101' }, request).catch(error => error);
    while (!(f.auth.ensureValidToken as jest.Mock).mock.calls.length) await new Promise(resolve => setImmediate(resolve));
    if (changed === 'client') (f.auth.getClientId as jest.Mock).mockReturnValue(91);
    else {
      await f.release();
      f.api.configureRemoteOperationOwnership({ restoredNativeStorage: [{ scope, state }], saveState: jest.fn().mockResolvedValue(undefined) });
    }
    release();
    await expect(operation).resolves.toMatchObject({ dispatched: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps native recovery uncertain when client authority changes during a known-status response', async () => {
    const f = fixture(), transport = f.api.createNativeStorageTransport({ scope, directory });
    const saved: NativeStorageState[] = [];
    const owner = new NativeStorageOwner({ transport, restoredState: pending(),
      admit: (work, options, operationId, context) => f.api.withNativeStorageAdmission(operationId, work, options, context),
      saveState: async state => { saved.push(copy(state)); f.api.setNativeStorageOwner(scope, state); } });
    f.api.setNativeStorageOwner(scope, owner.snapshot());
    (fetch as jest.Mock).mockImplementationOnce(async () => {
      (f.auth.getClientId as jest.Mock).mockReturnValue(91);
      return json({ complete: true, status: 0 });
    });
    await expect(owner.reconcilePending()).resolves.toBe('unresolved');
    expect(owner.snapshot().operation).toMatchObject({ phase: 'accepted', commandId: 101 });
    expect(saved.some(state => state.operation?.phase === 'finished')).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['wrong-clip', 'overflow', 'public-directory'])('rejects unsafe media download %s without promoting any file', async failure => {
    const f = fixture(); const transport = f.api.createNativeStorageTransport({ scope, directory });
    const state = pending({ operationId: 'clip', kind: 'clip', phase: 'prepared',
      clip: { manifestId: 303, clip }, commandId: 505 });
    f.api.setNativeStorageOwner(scope, state);
    (fetch as jest.Mock).mockResolvedValue(new Response(Buffer.alloc(20), { headers: { 'content-length': '1' } }));
    if (failure === 'public-directory') await fs.chmod(directory, 0o755);
    await expect(f.api.withNativeStorageAdmission('clip', async () => transport.downloadMedia(
      failure === 'wrong-clip' ? mediaUrl.replace('/404/', '/405/') : mediaUrl,
      { retry: false, maxBytes: 10 }), {}, scope)).rejects.toThrow();
    expect(await fs.readdir(directory)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(failure === 'overflow' ? 1 : 0);
  });

  it('rejects a symlink media directory before sending an authenticated download', async () => {
    const f = fixture(); const link = path.join(directory, 'unowned-link');
    await fs.symlink(directory, link);
    const transport = f.api.createNativeStorageTransport({ scope, directory: link });
    f.api.setNativeStorageOwner(scope, pending({ operationId: 'clip', kind: 'clip', phase: 'prepared',
      clip: { manifestId: 303, clip }, commandId: 505 }));
    await expect(f.api.withNativeStorageAdmission('clip', () => transport.downloadMedia(mediaUrl, request), {}, scope))
      .rejects.toThrow('privately owned');
    expect(fetch).not.toHaveBeenCalled();
    expect(await fs.readdir(directory)).toEqual(['unowned-link']);
  });

  it('downloads a scoped clip when the host cannot represent POSIX ownership and mode bits', async () => {
    const f = fixture(); const transport = f.api.createNativeStorageTransport({ scope, directory });
    f.api.setNativeStorageOwner(scope, pending({ operationId: 'clip', kind: 'clip', phase: 'prepared',
      clip: { manifestId: 303, clip }, commandId: 505 }));
    const bytes = Buffer.from('synthetic-owned-windows-clip');
    (fetch as jest.Mock).mockResolvedValue(new Response(bytes));
    await fs.chmod(directory, 0o777);
    const descriptor = Object.getOwnPropertyDescriptor(process, 'getuid');
    Object.defineProperty(process, 'getuid', { configurable: true, value: undefined });
    try {
      const result = await f.api.withNativeStorageAdmission('clip', () => transport.downloadMedia(mediaUrl, request), {}, scope);
      expect(await fs.readFile(result.reference)).toEqual(bytes);
      expect(result).toMatchObject({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      if (descriptor) Object.defineProperty(process, 'getuid', descriptor);
      else Reflect.deleteProperty(process, 'getuid');
    }
  });
});
