import { NativeStorageOwner, type NativeStorageCatalog, type NativeStorageClipRequest,
  type NativeStorageContext, type NativeStorageOwnerOptions, type NativeStorageState,
  type NativeStorageTransport, type NativeStorageRoute, type NativeStorageRequestOptions } from '../../src/blink-api/native-storage';
import { OperationTimeoutError, type RequestOptions } from '../../src/operation-budget';
import { URL } from 'node:url';
import { BlinkHttpError } from '../../src/blink-api/http';

const { AbortController } = globalThis;

const context: NativeStorageContext = { operationId: 'event-1:catalog', accountId: 1, networkId: 2, syncModuleId: 3 };
const location = 'https://rest-u000.immedia-semi.com/api/v1/accounts/1/networks/2/sync_modules/3/local_storage/manifest/303/clip/request/404/';
const wireCatalog = () => ({ manifest_id: 303, page_size: 1000, pagination_key: '', media: [
  { id: 404, network_id: 2, device_name: 'Entry_ABC', created_at: '2026-11-09T04:00:00+00:00', media: location },
] });
const file = () => ({ reference: 'owned-native-clip-404', bytes: 1024, sha256: 'a'.repeat(64) });
const clipRequest = (): NativeStorageClipRequest => ({ manifestId: 303, clip: { clipId: 404, networkId: 2,
  deviceName: 'Entry_ABC', capturedAt: '2026-11-09T04:00:00+00:00', mediaUrl: location } });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function fixture(overrides: Partial<NativeStorageOwnerOptions> = {}) {
  const saved: NativeStorageState[] = [];
  const transport: jest.Mocked<NativeStorageTransport> = {
    postEmpty: jest.fn<Promise<unknown>, [NativeStorageRoute, NativeStorageRequestOptions]>().mockResolvedValue({ id: 101 }),
    getJson: jest.fn<Promise<unknown>, [NativeStorageRoute, NativeStorageRequestOptions]>().mockImplementation(async route => route.base === 'root' ?
      { complete: true, status: 0, commands: [{ id: 202 }, { id: 999 }] } : wireCatalog()),
    validateMediaUrl: jest.fn((value: string) => {
      if (new URL(value).origin !== 'https://rest-u000.immedia-semi.com') throw new Error('Untrusted media host');
      return value;
    }),
    downloadMedia: jest.fn<ReturnType<NativeStorageTransport['downloadMedia']>,
      Parameters<NativeStorageTransport['downloadMedia']>>().mockImplementation(async () => file()),
  };
  const admit = jest.fn(async (work: () => Promise<unknown>) => work());
  const saveState = jest.fn(async (value: NativeStorageState) => {
    await overrides.saveState?.(value);
    saved.push(copy(value));
  });
  const delay = jest.fn<Promise<void>, [number, RequestOptions]>().mockResolvedValue(undefined);
  const options: NativeStorageOwnerOptions = { transport, admit: async <T>(work: () => Promise<T>) => await admit(work) as T,
    delay, ...overrides, saveState };
  const owner = new NativeStorageOwner(options);
  return { owner, transport, admit, saveState, delay, saved, options,
    restart: () => new NativeStorageOwner({ ...options, restoredState: saved.at(-1) }) };
}

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it('discards a revoked prepared operation locally without catalog or media retrieval', async () => {
  const f = fixture({ restoredState: { version: 1, operation: { ...context, kind: 'catalog', phase: 'prepared',
    commandId: 101, resultCommandId: 202, statusReads: 1 } } });
  expect(await f.owner.reconcilePending()).toBe('terminal');
  expect(f.owner.snapshot().operation?.result).toEqual({ status: 'failed', reason: 'discarded' });
  expect(await f.owner.reconcilePending()).toBe('none');
  expect(f.transport.getJson).not.toHaveBeenCalled();
  expect(f.transport.postEmpty).not.toHaveBeenCalled();
  expect(f.transport.downloadMedia).not.toHaveBeenCalled();
});

it.each([0, 7])('discards a revoked accepted operation only after one verified terminal status %s', async status => {
  const f = fixture({ restoredState: { version: 1, operation: { ...context, kind: 'clip', phase: 'accepted',
    commandId: 101, statusReads: 1, clip: clipRequest() } } });
  f.transport.getJson.mockResolvedValue({ complete: true, status });
  expect(await f.owner.reconcilePending()).toBe('terminal');
  expect(f.owner.snapshot().operation?.result).toEqual({ status: 'failed', reason: 'discarded', remoteStatus: status });
  expect(f.transport.getJson.mock.calls.map(([route]) => route)).toEqual([
    { base: 'root', path: 'accounts/1/networks/2/commands/101' },
  ]);
  expect(f.transport.postEmpty).not.toHaveBeenCalled(); expect(f.transport.downloadMedia).not.toHaveBeenCalled();
  expect(f.admit).not.toHaveBeenCalled();
});

it('keeps revoked pending and lost-ack operations fenced without replacing commands or renewing budgets', async () => {
  const f = fixture({ maxStatusReads: 2, restoredState: { version: 1, operation: { ...context, kind: 'catalog',
    phase: 'accepted', commandId: 101, statusReads: 1 } } });
  f.transport.getJson.mockResolvedValue({ complete: false, status: 0 });
  expect(await f.owner.reconcilePending()).toBe('unresolved');
  expect(await f.restart().reconcilePending()).toBe('unresolved');
  expect(f.transport.getJson).toHaveBeenCalledTimes(1);
  const lost = fixture({ restoredState: { version: 1, operation: { ...context, kind: 'catalog', phase: 'intent', statusReads: 0 } } });
  expect(await lost.owner.reconcilePending()).toBe('unresolved');
  expect(lost.transport.getJson).not.toHaveBeenCalled(); expect(lost.transport.postEmpty).not.toHaveBeenCalled();
});

it('records a definite SDK no-send refusal as not-started so it can be retried as a new job', async () => {
  const f = fixture();
  f.transport.postEmpty.mockRejectedValue(Object.assign(new Error('Canonical admission refused before dispatch'), { dispatched: false }));
  expect(await f.owner.readCatalog(context)).toEqual({ status: 'failed', reason: 'not-started' });
  expect(f.owner.snapshot().operation).toMatchObject({ phase: 'finished', result: { reason: 'not-started' } });
  f.transport.postEmpty.mockResolvedValue({ id: 101 });
  expect(await f.owner.readCatalog({ ...context, operationId: 'next-job' })).toMatchObject({ status: 'ready' });
  expect(f.transport.getJson).toHaveBeenCalledTimes(2);
});

it.each(['catalog', 'clip'] as const)('records an explicit refused %s POST without owning a nonexistent command', async kind => {
  const f = fixture();
  f.transport.postEmpty.mockRejectedValue(new BlinkHttpError('Busy', 409, '', location, 'POST'));
  const result = kind === 'catalog' ? await f.owner.readCatalog(context) : await f.owner.downloadClip(context, clipRequest());
  expect(result).toEqual({ status: 'failed', reason: 'refused', httpStatus: 409 });
  expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
  expect(f.transport.getJson).not.toHaveBeenCalled();
  expect(f.owner.snapshot().operation).toMatchObject({ phase: 'finished', statusReads: 0 });
  expect(f.owner.snapshot().operation?.commandId).toBeUndefined();
  f.transport.postEmpty.mockResolvedValue({ id: 101 });
  await expect(f.restart().readCatalog({ ...context, operationId: 'later-event' })).resolves.toMatchObject({ status: 'ready' });
  expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
});

it('retains an accepted preparation when its status GET returns the same busy status', async () => {
  const f = fixture();
  f.transport.getJson.mockRejectedValue(new BlinkHttpError('Busy', 409, '', location, 'GET'));
  await expect(f.owner.readCatalog(context)).resolves.toMatchObject({ status: 'unresolved' });
  expect(f.owner.snapshot().operation).toMatchObject({ phase: 'accepted', commandId: 101 });
  await expect(f.restart().readCatalog({ ...context, operationId: 'later-event' }))
    .resolves.toMatchObject({ status: 'unresolved', reason: 'operation-in-progress' });
  expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
});

it('performs no storage work or recurring timer while idle', async () => {
  jest.useFakeTimers();
  const f = fixture();
  await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
  expect(f.transport.postEmpty).not.toHaveBeenCalled();
  expect(f.transport.getJson).not.toHaveBeenCalled();
  expect(f.transport.downloadMedia).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

it('uses the accepted parent for status and first child for the official catalog route', async () => {
  const f = fixture();
  f.transport.postEmpty.mockImplementation(async () => {
    expect(f.saved.at(-1)?.operation).toMatchObject({ operationId: context.operationId, phase: 'intent' });
    return { id: 101 };
  });
  const result = await f.owner.readCatalog(context);
  expect(result).toEqual({ status: 'ready', value: { manifestId: 303, pageSize: 1000, paginationKey: '', clips: [
    { clipId: 404, networkId: 2, deviceName: 'Entry_ABC', capturedAt: '2026-11-09T04:00:00+00:00', mediaUrl: location },
  ] } });
  expect(f.transport.postEmpty).toHaveBeenCalledWith({ base: 'api',
    path: 'v1/accounts/1/networks/2/sync_modules/3/local_storage/manifest/request' },
  expect.objectContaining({ retry: false, maxBytes: 1024 * 1024 }));
  expect(f.transport.getJson.mock.calls.map(([route]) => route)).toEqual([
    { base: 'root', path: 'accounts/1/networks/2/commands/101' },
    { base: 'api', path: 'v1/accounts/1/networks/2/sync_modules/3/local_storage/media/202' },
  ]);
  expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
  expect(f.admit).toHaveBeenCalledTimes(1);
});

it('reuses the finished durable catalog receipt without another preparation or result GET', async () => {
  const f = fixture();
  const first = await f.owner.readCatalog(context);
  expect(await f.owner.readCatalog(context)).toEqual(first);
  expect(await f.restart().readCatalog(context)).toEqual(first);
  expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
  expect(f.transport.getJson).toHaveBeenCalledTimes(2);
});

it('polls only the accepted command at the official two-second interval', async () => {
  const f = fixture();
  f.transport.getJson.mockResolvedValueOnce({ complete: false, status: 0 })
    .mockResolvedValueOnce({ complete: false, status: 0 })
    .mockResolvedValueOnce({ complete: true, status: 0, commands: [{ id: 202 }] })
    .mockResolvedValueOnce(wireCatalog());
  expect(await f.owner.readCatalog(context)).toMatchObject({ status: 'ready' });
  expect(f.delay.mock.calls.map(call => call[0])).toEqual([2000, 2000]);
  expect(f.transport.getJson.mock.calls.filter(([route]) => route.base === 'root').map(([route]) => route.path))
    .toEqual(Array(3).fill('accounts/1/networks/2/commands/101'));
  expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
});

it('treats a complete nonzero numeric status as terminal failure without retrieving media', async () => {
  const f = fixture();
  f.transport.getJson.mockResolvedValue({ complete: true, status: 7, commands: [{ id: 202 }] });
  expect(await f.owner.readCatalog(context)).toEqual({ status: 'failed', reason: 'command-failed', remoteStatus: 7 });
  expect(f.transport.getJson).toHaveBeenCalledTimes(1);
  await f.owner.readCatalog({ ...context, operationId: 'event-2:catalog' });
  expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
});

it.each([
  { complete: true, status: '0', commands: [{ id: 202 }] },
  { complete: 'true', status: 0, commands: [{ id: 202 }] },
  { complete: true, status: 0.5, commands: [{ id: 202 }] },
])('does not infer success from malformed completion fields %p', async status => {
  const f = fixture(); f.transport.getJson.mockResolvedValue(status);
  expect(await f.owner.readCatalog(context)).toMatchObject({ status: 'unresolved', reason: 'invalid-command-status' });
  expect(await f.owner.readCatalog({ ...context, operationId: 'replacement' }))
    .toMatchObject({ status: 'unresolved', reason: 'operation-in-progress' });
  expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
  expect(f.transport.getJson).toHaveBeenCalledTimes(1);
});

it.each([undefined, [], [{ id: 0 }], [{ id: -1 }], [{ id: '202' }]])(
  'does not substitute the parent ID when the first result child is unusable: %p', async commands => {
    const f = fixture(); f.transport.getJson.mockResolvedValue({ complete: true, status: 0, commands });
    expect(await f.owner.readCatalog(context)).toMatchObject({ status: 'unresolved' });
    expect(f.transport.getJson).toHaveBeenCalledTimes(1);
    expect(f.transport.getJson.mock.calls.some(([route]) => route.base === 'api')).toBe(false);
  });

it('preserves the fence and total status-read budget through repeated calls and restart', async () => {
  const f = fixture({ maxStatusReads: 2 });
  f.transport.getJson.mockResolvedValue({ complete: false, status: 0 });
  expect(await f.owner.readCatalog(context)).toMatchObject({ status: 'unresolved', reason: 'status-budget-exhausted' });
  expect(await f.owner.readCatalog(context)).toMatchObject({ status: 'unresolved', reason: 'status-budget-exhausted' });
  expect(await f.restart().readCatalog(context)).toMatchObject({ status: 'unresolved', reason: 'status-budget-exhausted' });
  expect(await f.restart().readCatalog({ ...context, operationId: 'replacement' }))
    .toMatchObject({ status: 'unresolved', reason: 'operation-in-progress' });
  expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
  expect(f.transport.getJson).toHaveBeenCalledTimes(2);
});

it('never repeats a POST whose accepted acknowledgement may have been lost', async () => {
  const f = fixture(); f.transport.postEmpty.mockRejectedValue(new Error('Connection lost after dispatch'));
  expect(await f.owner.readCatalog(context)).toMatchObject({ status: 'unresolved' });
  expect(await f.owner.readCatalog(context)).toMatchObject({ status: 'unresolved', reason: 'acknowledgement-unknown' });
  expect(await f.restart().readCatalog(context)).toMatchObject({ status: 'unresolved', reason: 'acknowledgement-unknown' });
  expect(await f.restart().readCatalog({ ...context, operationId: 'replacement' }))
    .toMatchObject({ status: 'unresolved', reason: 'operation-in-progress' });
  expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
  expect(f.transport.getJson).not.toHaveBeenCalled();
});

it('rejects nonofficial acknowledgement aliases rather than creating another command', async () => {
  const f = fixture(); f.transport.postEmpty.mockResolvedValue({ command_id: 101 });
  expect(await f.owner.readCatalog(context)).toMatchObject({ status: 'unresolved' });
  expect(await f.restart().readCatalog(context)).toMatchObject({ status: 'unresolved' });
  expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
  expect(f.transport.getJson).not.toHaveBeenCalled();
});

it('resumes a prepared result GET after transport failure without another POST or status poll', async () => {
  const f = fixture();
  f.transport.getJson.mockImplementation(async route => {
    if (route.base === 'root') return { complete: true, status: 0, commands: [{ id: 202 }] };
    throw new Error('Result response unavailable');
  });
  expect(await f.owner.readCatalog(context)).toMatchObject({ status: 'unresolved' });
  f.transport.getJson.mockClear().mockResolvedValue(wireCatalog());
  expect(await f.restart().readCatalog(context)).toMatchObject({ status: 'ready' });
  expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
  expect(f.transport.getJson.mock.calls.map(([route]) => route.path))
    .toEqual(['v1/accounts/1/networks/2/sync_modules/3/local_storage/media/202']);
});

it('preserves accepted ownership on cancellation and resumes the same known command', async () => {
  const f = fixture(); const controller = new AbortController();
  f.transport.getJson.mockImplementationOnce(() => new Promise(() => undefined));
  const pending = f.owner.readCatalog(context, { signal: controller.signal });
  for (let i = 0; i < 20 && f.transport.getJson.mock.calls.length === 0; i += 1) await Promise.resolve();
  expect(f.transport.getJson).toHaveBeenCalledTimes(1);
  controller.abort();
  expect(await pending).toMatchObject({ status: 'unresolved' });
  expect(await f.restart().readCatalog(context)).toMatchObject({ status: 'ready' });
  expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
});

it('dispatches nothing if the durable intent cannot be saved', async () => {
  const saveState = jest.fn(async () => { throw new Error('Disk unavailable'); });
  const f = fixture({ saveState });
  expect(await f.owner.readCatalog(context)).toMatchObject({ status: 'unresolved', reason: 'persistence-failed' });
  expect(await f.owner.readCatalog({ ...context, operationId: 'replacement' }))
    .toMatchObject({ status: 'unresolved', reason: 'persistence-failed' });
  expect(f.transport.postEmpty).not.toHaveBeenCalled();
});

it('distinguishes a valid empty catalog from malformed or wrong-network media', async () => {
  const empty = fixture();
  empty.transport.getJson.mockImplementation(async route => route.base === 'root' ?
    { complete: true, status: 0, commands: [{ id: 202 }] } : { manifest_id: null, media: [], pagination_key: null, page_size: 1000 });
  expect(await empty.owner.readCatalog(context)).toEqual({ status: 'ready', value:
    { manifestId: null, clips: [], paginationKey: null, pageSize: 1000 } });
  const invalid = fixture(); const raw = wireCatalog(); raw.media[0].network_id = 9;
  invalid.transport.getJson.mockImplementation(async route => route.base === 'root' ?
    { complete: true, status: 0, commands: [{ id: 202 }] } : raw);
  expect(await invalid.owner.readCatalog(context)).toEqual({ status: 'failed', reason: 'invalid-result' });
});

it('enforces decoded JSON bounds and requests transport-enforced bounded bodies without retries', async () => {
  const f = fixture({ maxJsonBytes: 256 });
  f.transport.getJson.mockImplementation(async route => route.base === 'root' ?
    { complete: true, status: 0, commands: [{ id: 202 }] } : { padding: 'x'.repeat(300) });
  expect(await f.owner.readCatalog(context)).toMatchObject({ status: 'unresolved' });
  for (const [, options] of [...f.transport.postEmpty.mock.calls, ...f.transport.getJson.mock.calls]) {
    expect(options).toMatchObject({ maxBytes: 256, retry: false });
  }
  expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
});

it('prepares a selected clip once, then downloads its validated original media location', async () => {
  const f = fixture(); const request = clipRequest(); const clipContext = { ...context, operationId: 'event-1:clip' };
  // Clip playback uses the selected catalog record's media URL, not a guessed child-result route.
  f.transport.getJson.mockResolvedValue({ complete: true, status: 0 });
  expect(await f.owner.downloadClip(clipContext, request)).toEqual({ status: 'ready', value: file() });
  expect(f.transport.postEmpty).toHaveBeenCalledWith({ base: 'api',
    path: 'v1/accounts/1/networks/2/sync_modules/3/local_storage/manifest/303/clip/request/404' }, expect.anything());
  expect(f.transport.downloadMedia).toHaveBeenCalledWith(location,
    expect.objectContaining({ maxBytes: 32 * 1024 * 1024, retry: false }));
  expect(f.transport.getJson.mock.calls.map(([route]) => route.base)).toEqual(['root']);
  expect(await f.restart().downloadClip(clipContext, request)).toEqual({ status: 'ready', value: file() });
  expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
  expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
});

it.each([new Error('Media GET failed'), new OperationTimeoutError()])(
  'settles a failed prepared clip transfer locally without replaying or retaining its command: %s', async error => {
    const f = fixture(), clipContext = { ...context, operationId: 'event-1:clip' };
    f.transport.getJson.mockResolvedValueOnce({ complete: true, status: 0 });
    f.transport.downloadMedia.mockRejectedValueOnce(error);
    const result = await f.owner.downloadClip(clipContext, clipRequest());
    expect(result).toEqual({ status: 'failed', reason: 'invalid-media' });
    expect(f.owner.snapshot().operation).toMatchObject({ phase: 'finished', commandId: 101, statusReads: 1, result });
    expect(await f.restart().downloadClip(clipContext, clipRequest())).toEqual(result);
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
    expect(f.transport.getJson).toHaveBeenCalledTimes(1);
    expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
    expect(await f.owner.readCatalog({ ...context, operationId: 'next-event:catalog' })).toMatchObject({ status: 'ready' });
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
  });

it('validates media destinations before preparation and rejects invalid local download receipts', async () => {
  const untrusted = fixture(); const request = clipRequest(); request.clip.mediaUrl = 'https://attacker.invalid/video';
  expect(() => untrusted.owner.downloadClip(context, request)).toThrow('Untrusted media host');
  expect(untrusted.transport.postEmpty).not.toHaveBeenCalled();
  const oversized = fixture({ maxMediaBytes: 4 });
  oversized.transport.getJson.mockResolvedValue({ complete: true, status: 0 });
  expect(await oversized.owner.downloadClip(context, clipRequest()))
    .toEqual({ status: 'failed', reason: 'invalid-media' });
  expect(oversized.transport.downloadMedia).toHaveBeenCalledWith(location, expect.objectContaining({ maxBytes: 4 }));
});

it('does not confuse a cancelled queue wait with a dispatched remote command', async () => {
  const controller = new AbortController(); controller.abort();
  const f = fixture();
  expect(await f.owner.readCatalog(context, { signal: controller.signal })).toEqual({ status: 'failed', reason: 'not-started' });
  expect(f.transport.postEmpty).not.toHaveBeenCalled();
  expect(f.saveState).not.toHaveBeenCalled();
});

it('does not dispatch when cancellation arrives while the intent is being saved', async () => {
  let release!: () => void;
  const pendingSave = new Promise<void>(resolve => { release = resolve; });
  const controller = new AbortController();
  const saveState = jest.fn(async () => { await pendingSave; });
  const f = fixture({ saveState });
  const pending = f.owner.readCatalog(context, { signal: controller.signal });
  for (let i = 0; i < 20 && saveState.mock.calls.length === 0; i += 1) await Promise.resolve();
  controller.abort(); release();
  expect(await pending).toMatchObject({ status: 'unresolved' });
  expect(f.transport.postEmpty).not.toHaveBeenCalled();
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  expect(await f.owner.readCatalog(context)).toEqual({ status: 'failed', reason: 'not-started' });
  expect(await f.restart().readCatalog(context)).toEqual({ status: 'failed', reason: 'not-started' });
});

it('keeps admission singular and rejects concurrent callers without dispatching a second operation', async () => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const f = fixture({ admit: async <T>(work: () => Promise<T>) => { await waiting; return work(); } });
  const first = f.owner.readCatalog(context);
  expect(await f.owner.readCatalog({ ...context, operationId: 'other' }))
    .toMatchObject({ status: 'unresolved', reason: 'caller-in-progress' });
  release(); expect(await first).toMatchObject({ status: 'ready' });
  expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
});

it('refuses malformed restored ownership and returns detached snapshots', async () => {
  expect(() => fixture({ restoredState: { version: 2 } as unknown as NativeStorageState })).toThrow();
  const f = fixture(); await f.owner.readCatalog(context);
  const detached = f.owner.snapshot();
  detached.operation!.networkId = 999;
  const result = detached.operation!.result;
  if (result?.status === 'ready') (result.value as NativeStorageCatalog).clips[0].networkId = 999;
  expect(f.owner.snapshot().operation!.networkId).toBe(2);
  detached.operation!.networkId = 2;
  expect(() => fixture({ restoredState: detached })).toThrow();
});

it.each([null, false, 0, ''])('does not interpret a corrupt persisted owner as idle: %p', operation => {
  expect(() => fixture({ restoredState: { version: 1, operation } as unknown as NativeStorageState })).toThrow();
});
