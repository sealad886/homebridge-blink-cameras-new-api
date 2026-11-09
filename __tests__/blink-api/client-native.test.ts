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
    statusReads: 1, ...overrides } });
const live = (overrides: Partial<BlinkLiveViewOwnership> = {}): BlinkLiveViewOwnership => ({
  reservationId: 'owned-liveview', accountId: 10, networkId: 20, deviceId: 40, kind: 'camera',
  phase: 'active', commandId: 707, retirementAcknowledged: false, ...overrides,
});

function fixture(restoredLive?: BlinkLiveViewOwnership, restoredCommand?: BlinkStateCommandOwnership) {
  const messages: unknown[][] = [];
  const log = (...args: unknown[]) => { messages.push(args); };
  const api = new BlinkApi({ email: '', password: '', hardwareId: 'owned-plugin', tier: 'u001', sharedTier: 'e001',
    debugAuth: true, logger: { info: log, debug: log, warn: log, error: log } });
  const internals = api as unknown as { auth: BlinkAuth; accountId: number | null };
  jest.spyOn(internals.auth, 'ensureValidToken').mockResolvedValue(undefined);
  jest.spyOn(internals.auth, 'getPersistedTier').mockResolvedValue('u001');
  jest.spyOn(internals.auth, 'getAccountId').mockReturnValue(10);
  jest.spyOn(internals.auth, 'getClientId').mockReturnValue(90);
  jest.spyOn(internals.auth, 'getAuthHeaders').mockReturnValue({ Authorization: 'Bearer fixture-auth' });
  internals.accountId = 10;
  const savedLive: Array<BlinkLiveViewOwnership | undefined> = [];
  const savedRemote: BlinkRemoteOperationOwnership[] = [];
  const saveLive = jest.fn(async (state: BlinkRemoteOperationOwnership) => {
    savedRemote.push(copy(state));
    savedLive.push(state.liveView ? copy(state.liveView) : undefined);
  });
  api.configureRemoteOperationOwnership({ restoredState: { liveView: restoredLive, stateCommand: restoredCommand }, saveState: saveLive });
  return { api, auth: internals.auth, messages, savedLive, savedRemote, saveLive };
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

  it('keeps an accepted ordinary command fenced through caller timeout and restart until one strict terminal read', async () => {
    jest.useFakeTimers();
    const f = fixture();
    (fetch as jest.Mock).mockImplementation(async (_url: string, request: RequestInit) => {
      if (request.method === 'POST') {
        expect(f.savedRemote.at(-1)?.stateCommand).toMatchObject({ phase: 'starting', kind: 'arm', statusReads: 0 });
        return json({ id: 101 });
      }
      expect(f.savedRemote.at(-1)?.stateCommand).toMatchObject({ phase: 'accepted', commandId: 101, statusReads: 1 });
      return json({ complete: false, status: 0 });
    });
    const arm = f.api.armNetwork(20, { deadline: Date.now() + 100 });
    const timedOut = expect(arm).rejects.toBeInstanceOf(OperationTimeoutError);
    await jest.advanceTimersByTimeAsync(101); await timedOut;
    const restored = f.savedRemote.at(-1)!.stateCommand!;
    expect(restored).toMatchObject({ commandId: 101, statusReads: 1, phase: 'unresolved' });
    await expect(f.api.withNativeStorageAdmission('event', async () => undefined, {}, scope))
      .rejects.toMatchObject({ dispatched: false, reason: 'ownership-unavailable' });
    expect(fetch).toHaveBeenCalledTimes(2);
    const restarted = fixture(undefined, restored);
    await expect(restarted.api.armNetwork(20)).rejects.toMatchObject({ dispatched: false });
    (fetch as jest.Mock).mockResolvedValueOnce(json({ complete: true, status: 'complete' }))
      .mockResolvedValueOnce(json({ complete: true, status: 7 }));
    await expect(restarted.api.reconcileKnownStateCommand()).resolves.toEqual({ commandId: 101, confirmed: false });
    expect(restarted.api.getRemoteOperationState().stateCommand).toMatchObject({ commandId: 101, statusReads: 2 });
    await expect(restarted.api.reconcileKnownStateCommand()).resolves.toEqual({ commandId: 101, confirmed: true, remoteStatus: 7 });
    expect(restarted.api.getRemoteOperationState().stateCommand).toBeUndefined();
    await expect(restarted.api.withNativeStorageAdmission('event', async () => 'admitted', {}, scope)).resolves.toBe('admitted');
    expect((fetch as jest.Mock).mock.calls.map(([, request]) => request.method)).toEqual(['POST', 'GET', 'GET', 'GET']);
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

  it('retains an accepted command when status authentication proves only that its GET was not sent', async () => {
    const f = fixture();
    (f.auth.ensureValidToken as jest.Mock).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('fixture auth unavailable'));
    (fetch as jest.Mock).mockResolvedValueOnce(json({ id: 101 }));
    await expect(f.api.armNetwork(20)).rejects.toThrow('fixture auth unavailable');
    expect(f.api.getRemoteOperationState().stateCommand).toMatchObject({ phase: 'unresolved', commandId: 101 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch an ordinary command without durable ownership or after a failed intent write', async () => {
    const f = fixture();
    f.saveLive.mockRejectedValue(new Error('fixture state disk unavailable'));
    await expect(f.api.disarmNetwork(20)).rejects.toThrow('could not be persisted');
    expect(f.api.getRemoteOperationState()).toMatchObject({ persistenceFailed: true, stateCommand: { phase: 'starting' } });
    expect(fetch).not.toHaveBeenCalled();
    const unconfigured = new BlinkApi({ email: '', password: '', hardwareId: 'offline-fixture', tier: 'u001' });
    const internals = unconfigured as unknown as { auth: BlinkAuth; accountId: number };
    internals.accountId = 10;
    jest.spyOn(internals.auth, 'getAccountId').mockReturnValue(10);
    await expect(unconfigured.startCameraLiveview(20, 40)).rejects.toMatchObject({ dispatched: false });
    await expect(unconfigured.armNetwork(20)).rejects.toMatchObject({ dispatched: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never renews an exhausted ordinary status-read budget on restart or explicit reconciliation', async () => {
    const f = fixture(undefined, { reservationId: 'owned-state', ...scope, kind: 'arm', phase: 'unresolved',
      commandId: 101, statusReads: 60 });
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

  it('holds the shared queue through actual callback settlement after its bounded caller returns', async () => {
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
    expect(fetch).not.toHaveBeenCalled();
    release(); await admitted; await jest.advanceTimersByTimeAsync(300); await arm;
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
    await expect(f.api.startCameraLiveview(20, 40)).rejects.toBe(failure);
    expect(f.api.getRemoteOperationState().liveView).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not dispatch a live view when its durable reservation cannot be written', async () => {
    const f = fixture(); f.saveLive.mockRejectedValue(new Error('fixture disk unavailable'));
    await expect(f.api.startCameraLiveview(20, 40)).rejects.toThrow('could not be persisted');
    await expect(f.api.withNativeStorageAdmission('event', async () => undefined, {}, scope))
      .rejects.toMatchObject({ dispatched: false, reason: 'ownership-unavailable' });
    expect(f.api.getRemoteOperationState()).toMatchObject({ persistenceFailed: true,
      liveView: { phase: 'starting' } });
    expect(fetch).not.toHaveBeenCalled();
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
