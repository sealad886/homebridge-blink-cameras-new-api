import { Buffer } from 'node:buffer';
import { createECDH, createHash } from 'node:crypto';
import { FcmEventSource, type FcmEventSourceOptions } from '../../../src/blink-api/fcm/source';
import { FCM_BUNDLE_ID, FCM_LIMITS, type Credentials, type FcmAudit, type FcmReceiverState,
  type FcmWorkerHandle, type WorkerCommand } from '../../../src/blink-api/fcm/types';

const scope = { accountId: 1, clientId: 2, tier: 'u034' };
const firebase = { projectId: 'test-project', appId: '1:123:android:fixture', apiKey: 'public-test-key', messagingSenderId: '123' };
const fixtureKey = createECDH('prime256v1');
fixtureKey.setPrivateKey(Buffer.alloc(32, 1));
const fixtureKeys = { privateKey: fixtureKey.getPrivateKey('base64'), publicKey: fixtureKey.getPublicKey('base64'), authSecret: Buffer.alloc(16, 2).toString('base64') };
const credentials = (token = 'owned-fcm-token'): Credentials => ({
  gcm: { androidId: '12345', securityToken: '67890', appId: 'owned-instance', token: 'owned-gcm-token' },
  fcm: { token, installation: { token: 'installation-auth', refreshToken: 'installation-refresh', fid: 'owned-fid',
    createdAt: 1, expiresIn: 604800000 } },
  keys: fixtureKeys,
  config: { projectId: firebase.projectId, bundleId: FCM_BUNDLE_ID, vapidKey: '' },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class FakeWorker implements FcmWorkerHandle {
  private message?: (value: unknown) => void;
  private exit?: () => void;
  readonly send = jest.fn<void, [WorkerCommand]>();
  readonly stop = jest.fn(async () => { this.exit?.(); });
  onMessage(listener: (value: unknown) => void) { this.message = listener; }
  onExit(listener: () => void) { this.exit = listener; }
  emit(value: unknown) { this.message?.(value); }
  crash() { this.exit?.(); }
}
async function flush() { await jest.advanceTimersByTimeAsync(0); }
function fixture(overrides: Partial<FcmEventSourceOptions> = {}) {
  const workers: FakeWorker[] = [];
  const saved: FcmReceiverState[] = [];
  const audit: FcmAudit[] = [];
  const saveState = jest.fn(async (state: FcmReceiverState) => { saved.push(state); });
  const bind = jest.fn<Promise<void>, [string, globalThis.AbortSignal]>().mockResolvedValue();
  const notification = jest.fn<Promise<void>, [unknown, globalThis.AbortSignal]>().mockResolvedValue();
  const options: FcmEventSourceOptions = { scope, firebase, saveState, bindOwnedClientToken: bind,
    onNotification: notification, random: () => 0.5, onAudit: event => audit.push(event),
    spawnWorker: () => { const worker = new FakeWorker(); workers.push(worker); return worker; }, ...overrides };
  return { source: new FcmEventSource(options), workers, saved, audit, saveState, bind, notification };
}
async function ready(f: ReturnType<typeof fixture>, value = credentials()) {
  await f.source.setDemand({ motionAccessory: true, hsv: false });
  const worker = f.workers.at(-1)!;
  worker.emit({ type: 'credentials', credentials: value }); await flush();
  worker.emit({ type: 'ready' }); await flush();
  return worker;
}
const message = (id = 'motion-1', createdAt = Date.now()) => ({ type: 'notification', persistentId: id,
  receivedAt: Date.now(), data: { category: 'motion', event_type: 'cam2sm_motion', created_at: new Date(createdAt).toISOString() } });

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-09T10:00:00Z')); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it('does no work while inactive and uses one subscription for motion OR HSV demand', async () => {
  const f = fixture();
  await f.source.setDemand({ motionAccessory: false, hsv: false });
  await jest.advanceTimersByTimeAsync(86400000);
  expect(f.workers).toHaveLength(0); expect(f.bind).not.toHaveBeenCalled();
  await f.source.setDemand({ motionAccessory: true, hsv: false });
  await f.source.setDemand({ motionAccessory: false, hsv: true });
  expect(f.workers).toHaveLength(1);
  await f.source.setDemand({ motionAccessory: false, hsv: false });
  expect(f.workers[0].stop).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(86400000);
  expect(f.workers).toHaveLength(1);
  await f.source.stop();
});

it('does not start a worker when demand is disabled by a reentrant observer', async () => {
  let source!: FcmEventSource;
  const f = fixture({ onAudit: event => {
    if (event.event === 'starting') void source.setDemand({ motionAccessory: false, hsv: false });
  } });
  source = f.source;
  await source.setDemand({ motionAccessory: true, hsv: false }); await flush();
  expect(f.workers).toHaveLength(0); expect(f.bind).not.toHaveBeenCalled();
  await source.stop();
});

it('persists receiver credentials before binding and persists the binding before starting MCS', async () => {
  const gate = deferred<void>();
  const f = fixture();
  f.saveState.mockImplementationOnce(() => gate.promise);
  await f.source.setDemand({ motionAccessory: false, hsv: true });
  const worker = f.workers[0];
  worker.emit({ type: 'credentials', credentials: credentials() }); await flush();
  expect(f.bind).not.toHaveBeenCalled();
  expect(worker.send).toHaveBeenCalledTimes(1);
  gate.resolve(); await flush();
  expect(f.bind).toHaveBeenCalledTimes(1);
  expect(f.source.snapshot().credentials?.fcm.token).toBe('owned-fcm-token');
  expect(f.source.snapshot().boundTokenSha256).toBe(createHash('sha256').update('owned-fcm-token').digest('hex'));
  expect(worker.send).toHaveBeenLastCalledWith({ type: 'credentials-accepted' });
  await f.source.stop();
});

it('reuses an owned identity across reconnects and binds exactly once per token change', async () => {
  const f = fixture(); const worker = await ready(f);
  worker.emit({ type: 'credentials', credentials: credentials() }); await flush();
  expect(f.bind).toHaveBeenCalledTimes(1);
  worker.emit({ type: 'credentials', credentials: credentials('rotated-owned-token') }); await flush();
  expect(f.bind).toHaveBeenCalledTimes(2);
  worker.crash(); await flush(); await jest.advanceTimersByTimeAsync(5000);
  expect(f.workers).toHaveLength(2);
  expect(f.workers[1].send).toHaveBeenCalledWith(expect.objectContaining({
    type: 'start', credentials: expect.objectContaining({ fcm: expect.objectContaining({ token: 'rotated-owned-token' }) }),
  }));
  f.workers[1].emit({ type: 'credentials', credentials: credentials('rotated-owned-token') }); await flush();
  expect(f.bind).toHaveBeenCalledTimes(2);
  await f.source.stop();
});

it.each(['accountId', 'clientId', 'tier'] as const)('rejects a restored identity from a different %s before any worker starts', key => {
  const f = fixture(); const state = f.source.snapshot();
  const changed = { ...scope, [key]: key === 'tier' ? 'u999' : 99 };
  expect(() => fixture({ restoredState: { ...state, scope: changed } })).toThrow('does not belong');
  expect(f.workers).toHaveLength(0);
});

it('validates restored scope semantically rather than depending on JSON key order', async () => {
  const f = fixture(); const state = f.source.snapshot();
  state.scope = { tier: scope.tier, clientId: scope.clientId, accountId: scope.accountId };
  state.firebase = { messagingSenderId: firebase.messagingSenderId, appId: firebase.appId, projectId: firebase.projectId };
  const restored = fixture({ restoredState: state });
  await restored.source.setDemand({ motionAccessory: true, hsv: false });
  expect(restored.workers).toHaveLength(1); await restored.source.stop();
});

it('fails closed without binding when credential persistence fails', async () => {
  const f = fixture(); f.saveState.mockRejectedValue(new Error('disk unavailable'));
  await f.source.setDemand({ motionAccessory: true, hsv: false });
  f.workers[0].emit({ type: 'credentials', credentials: credentials() }); await flush();
  expect(f.bind).not.toHaveBeenCalled(); expect(f.workers[0].stop).toHaveBeenCalledTimes(1);
  expect(f.audit).toContainEqual({ event: 'faulted', reason: 'persistence-failed' });
  await jest.advanceTimersByTimeAsync(3600000); expect(f.workers).toHaveLength(1);
  await f.source.stop();
});

it('rejects credential/project substitution without issuing a Blink binding', async () => {
  const f = fixture(); await f.source.setDemand({ motionAccessory: true, hsv: false });
  f.workers[0].emit({ type: 'credentials', credentials: { ...credentials(), config: { ...credentials().config, projectId: 'another-project' } } }); await flush();
  expect(f.bind).not.toHaveBeenCalled();
  expect(f.audit).toContainEqual({ event: 'faulted', reason: 'protocol-error' });
  await f.source.stop();
});

it('rejects malformed or mismatched key material and zero GCM identities before any network use', () => {
  const state = fixture().source.snapshot();
  for (const invalid of [
    { ...credentials(), gcm: { ...credentials().gcm, androidId: '0' } },
    { ...credentials(), gcm: { ...credentials().gcm, securityToken: '18446744073709551616' } },
    { ...credentials(), keys: { ...fixtureKeys, privateKey: 'broken' } },
    { ...credentials(), keys: { ...fixtureKeys, publicKey: Buffer.alloc(65, 3).toString('base64') } },
  ]) expect(() => fixture({ restoredState: { ...state, credentials: invalid } })).toThrow('does not belong');
});

it('acknowledges a message only after downstream acceptance and receiver state are durable', async () => {
  const f = fixture(); const worker = await ready(f); const accepted = deferred<void>();
  f.notification.mockImplementationOnce(() => accepted.promise);
  worker.emit(message()); await flush();
  expect(worker.send).not.toHaveBeenCalledWith({ type: 'ack', persistentId: 'motion-1' });
  accepted.resolve(); await flush();
  expect(f.source.snapshot().persistentIds).toContain('motion-1');
  expect(worker.send).toHaveBeenLastCalledWith({ type: 'ack', persistentId: 'motion-1' });
  worker.emit(message()); await flush();
  expect(f.notification).toHaveBeenCalledTimes(1);
  expect(f.notification).toHaveBeenCalledWith(expect.objectContaining({ scope, activatedAt: Date.now() }), expect.anything());
  await f.source.stop();
});

it('does not acknowledge downstream/persistence failures and fences late callbacks after disable', async () => {
  const f = fixture(); const worker = await ready(f); const accepted = deferred<void>();
  f.notification.mockImplementationOnce(() => accepted.promise);
  worker.emit(message()); await flush();
  const signal = f.notification.mock.calls[0][1];
  await f.source.setDemand({ motionAccessory: false, hsv: false });
  expect(signal.aborted).toBe(true);
  accepted.resolve(); await flush();
  expect(worker.send).not.toHaveBeenCalledWith({ type: 'ack', persistentId: 'motion-1' });
  expect(f.source.snapshot().persistentIds).not.toContain('motion-1');
  await f.source.stop();
});

it('does not replay the disabled period or invalid/future notification timestamps', async () => {
  const f = fixture(); const worker = await ready(f);
  worker.emit(message('old', Date.now() - 1000));
  worker.emit(message('future', Date.now() + 61000));
  worker.emit({ ...message('invalid'), data: { created_at: 'not-an-offset-time' } }); await flush();
  expect(f.notification).not.toHaveBeenCalled();
  expect(f.source.snapshot().persistentIds).toEqual(['old', 'future', 'invalid']);
  await f.source.stop();
});

it('bounds the durable message history without evicting pending unacknowledged work', async () => {
  const f = fixture(); const worker = await ready(f);
  for (let i = 0; i < FCM_LIMITS.persistentIds + 3; i++) { worker.emit(message(`motion-${i}`)); await flush(); }
  const ids = f.source.snapshot().persistentIds;
  expect(ids).toHaveLength(FCM_LIMITS.persistentIds); expect(ids[0]).toBe('motion-3');
  expect(ids.at(-1)).toBe(`motion-${FCM_LIMITS.persistentIds + 2}`);
  await f.source.stop();
});

it('uses bounded exponential backoff and stops after repeated short-lived failures', async () => {
  const f = fixture({ maxFailures: 3 }); await f.source.setDemand({ motionAccessory: false, hsv: true });
  f.workers[0].emit({ type: 'failure', reason: 'transport-error', retryable: true }); await flush();
  await jest.advanceTimersByTimeAsync(4999); expect(f.workers).toHaveLength(1);
  await jest.advanceTimersByTimeAsync(1); expect(f.workers).toHaveLength(2);
  f.workers[1].emit({ type: 'failure', reason: 'transport-error', retryable: true }); await flush();
  await jest.advanceTimersByTimeAsync(9999); expect(f.workers).toHaveLength(2);
  await jest.advanceTimersByTimeAsync(1); expect(f.workers).toHaveLength(3);
  f.workers[2].emit({ type: 'failure', reason: 'transport-error', retryable: true }); await flush();
  await jest.advanceTimersByTimeAsync(3600000); expect(f.workers).toHaveLength(3);
  expect(f.audit).toContainEqual({ event: 'faulted', reason: 'transport-error' });
  await f.source.stop();
});

it('stops a stalled initialization and cancels any queued restart on shutdown', async () => {
  const f = fixture(); await f.source.setDemand({ motionAccessory: true, hsv: false });
  await jest.advanceTimersByTimeAsync(60000);
  expect(f.workers[0].stop).toHaveBeenCalledTimes(1);
  await f.source.stop(); await jest.advanceTimersByTimeAsync(3600000);
  expect(f.workers).toHaveLength(1);
});

it('reconnects an owned stream without changing its enabled-period boundary or rebinding an unchanged token', async () => {
  const f = fixture(); const worker = await ready(f); const enabledAt = Date.now();
  worker.crash(); await flush(); await jest.advanceTimersByTimeAsync(1000);
  await f.source.reconnect();
  expect(f.workers).toHaveLength(2);
  const next = await ready(f);
  next.emit(message('delayed-during-outage', enabledAt)); await flush();
  expect(f.notification).toHaveBeenCalledTimes(1); expect(f.bind).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(5000); expect(f.workers).toHaveLength(2);
  await f.source.stop();
  await expect(f.source.reconnect()).rejects.toThrow('inactive');
});

it('does not reset backoff for a sequence of briefly ready connections', async () => {
  const f = fixture({ maxFailures: 3 });
  for (let attempt = 0; attempt < 3; attempt++) {
    const worker = await ready(f); worker.crash(); await flush();
    if (attempt < 2) await jest.advanceTimersByTimeAsync(5000 * 2 ** attempt);
  }
  await jest.advanceTimersByTimeAsync(3600000);
  expect(f.workers).toHaveLength(3); expect(f.bind).toHaveBeenCalledTimes(1);
  expect(f.audit).toContainEqual({ event: 'faulted', reason: 'worker-exited' });
  await f.source.stop();
});

it('preserves an unacknowledged event if downstream persistence rejects it', async () => {
  const f = fixture(); const worker = await ready(f);
  f.notification.mockRejectedValueOnce(new Error('queue write failed'));
  worker.emit(message()); await flush();
  expect(worker.send).not.toHaveBeenCalledWith({ type: 'ack', persistentId: 'motion-1' });
  expect(f.source.snapshot().persistentIds).not.toContain('motion-1');
  expect(worker.stop).toHaveBeenCalledTimes(1);
  await f.source.stop();
});

it('bounds queued IPC if a child floods events while a durable callback is pending', async () => {
  const f = fixture(); const worker = await ready(f);
  const accepted = deferred<void>(); f.notification.mockImplementationOnce(() => accepted.promise);
  worker.emit(message('held')); await flush();
  for (let i = 0; i < 40; i++) worker.emit(message(`flood-${i}`));
  await flush();
  expect(worker.stop).toHaveBeenCalledTimes(1);
  expect(f.audit).toContainEqual({ event: 'faulted', reason: 'protocol-error' });
  accepted.resolve(); await flush();
  expect(f.notification).toHaveBeenCalledTimes(1);
  await f.source.stop();
});

it('rejects oversized or premature messages and keeps credentials out of audit events', async () => {
  const f = fixture(); await f.source.setDemand({ motionAccessory: true, hsv: false });
  f.workers[0].emit(message()); await flush();
  expect(f.notification).not.toHaveBeenCalled(); expect(f.audit).toContainEqual({ event: 'faulted', reason: 'protocol-error' });
  const healthy = fixture(); const worker = await ready(healthy);
  worker.emit({ type: 'notification', persistentId: 'oversized', data: { text: 'x'.repeat(FCM_LIMITS.ipcBytes) }, receivedAt: Date.now() }); await flush();
  expect(healthy.notification).not.toHaveBeenCalled();
  expect(JSON.stringify(healthy.audit)).not.toMatch(/owned-private|owned-fcm|owned-auth|public-test-key/);
  expect(JSON.stringify(healthy.audit)).not.toContain(fixtureKeys.privateKey);
  expect(JSON.stringify(healthy.source.getStatus())).not.toContain(fixtureKeys.privateKey);
  await f.source.stop(); await healthy.source.stop();
});
