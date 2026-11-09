/* global __dirname */
import process from 'node:process';
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { parseBlinkOffsetTimestamp } from '../motion-events';
import { boundedJson, FCM_LIMITS, validCredentials, validData, validFirebase, validPersistentId, validScope,
  type FcmAudit, type FcmFailure, type FcmNotification, type FcmReceiverState, type FcmScope,
  type FcmWorkerHandle, type FirebaseConfig, type WorkerCommand, type WorkerEvent, type FcmSourceStatus } from './types';

export interface FcmEventSourceOptions {
  scope: FcmScope;
  /** Public application parameters, not Firebase owner/sender credentials. */
  firebase: FirebaseConfig;
  restoredState?: FcmReceiverState;
  saveState(state: FcmReceiverState): Promise<void>;
  /** Updates only this scope's authenticated Homebridge-owned Blink client. */
  bindOwnedClientToken(token: string, signal: globalThis.AbortSignal): Promise<void>;
  /** Resolve only after any accepted motion job is durably committed. */
  onNotification(notification: FcmNotification, signal: globalThis.AbortSignal): Promise<void>;
  onAudit?(event: FcmAudit): void;
  spawnWorker?(): FcmWorkerHandle;
  now?: () => number;
  random?: () => number;
  initializationMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  maxFailures?: number;
}

/**
 * Trust chain: verified Google TLS/project -> receiver-owned identity -> exact
 * Blink account/client cache -> caller's canonical device binding. Credentials
 * never enter audit events. The isolated child receives no Blink auth or URL.
 */
export class FcmEventSource {
  private state: FcmReceiverState;
  private active = false;
  private stopped = false;
  private epoch = 0;
  private activatedAt = 0;
  private worker?: FcmWorkerHandle;
  private controller = new globalThis.AbortController();
  private queue: Promise<void> = Promise.resolve();
  private retry?: ReturnType<typeof globalThis.setTimeout>;
  private initialization?: ReturnType<typeof globalThis.setTimeout>;
  private failures = 0;
  private readyAt?: number;
  private credentialsAccepted = false;
  private queuedMessages = 0;
  private lastMessageAt?: number;
  private lastHandoffAt?: number;
  private faulted = false;
  private closing?: Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly initializationMs: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly maxFailures: number;

  constructor(private readonly options: FcmEventSourceOptions) {
    if (!validScope(options.scope) || !validFirebase(options.firebase)) throw new Error('Invalid FCM receiver scope/configuration');
    this.options = { ...options, scope: { ...options.scope }, firebase: {
      projectId: options.firebase.projectId, appId: options.firebase.appId,
      apiKey: options.firebase.apiKey, messagingSenderId: options.firebase.messagingSenderId,
    } };
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.initializationMs = limit(options.initializationMs ?? 60_000, 1000, 90_000);
    this.retryBaseMs = limit(options.retryBaseMs ?? 5000, 100, 60_000);
    this.retryMaxMs = limit(options.retryMaxMs ?? 300_000, this.retryBaseMs, 900_000);
    this.maxFailures = limit(options.maxFailures ?? 8, 1, 32);
    const firebase = { projectId: options.firebase.projectId, appId: options.firebase.appId, messagingSenderId: options.firebase.messagingSenderId };
    const state = options.restoredState ?? { version: 1, scope: { ...options.scope }, firebase, persistentIds: [] };
    if (!boundedJson(state, FCM_LIMITS.stateBytes) || state.version !== 1 || !validScope(state.scope)
      || state.scope.accountId !== options.scope.accountId || state.scope.clientId !== options.scope.clientId || state.scope.tier !== options.scope.tier
      || !state.firebase || state.firebase.projectId !== firebase.projectId || state.firebase.appId !== firebase.appId
      || state.firebase.messagingSenderId !== firebase.messagingSenderId
      || !Array.isArray(state.persistentIds) || state.persistentIds.length > FCM_LIMITS.persistentIds
      || state.persistentIds.some(id => !validPersistentId(id)) || new Set(state.persistentIds).size !== state.persistentIds.length
      || (state.credentials !== undefined && !validCredentials(state.credentials, options.firebase))
      || (state.boundTokenSha256 !== undefined && (!/^[a-f0-9]{64}$/.test(state.boundTokenSha256) || !state.credentials))) {
      throw new Error('FCM receiver state does not belong to this account/client/configuration');
    }
    this.state = clone(state);
  }

  /** Private credential-bearing persistence state; never publish it in logs or a UI. */
  snapshot(): FcmReceiverState { return clone(this.state); }
  getStatus(): FcmSourceStatus {
    return { active: this.active, connected: this.active && !this.faulted && !this.closing && !!this.worker && this.readyAt !== undefined,
      faulted: this.faulted, consecutiveFailures: this.failures,
      lastMessageAt: this.lastMessageAt, lastHandoffAt: this.lastHandoffAt };
  }

  async setDemand(demand: { motionAccessory: boolean; hsv: boolean }): Promise<void> {
    if (typeof demand?.motionAccessory !== 'boolean' || typeof demand?.hsv !== 'boolean') throw new Error('Invalid FCM demand');
    const enabled = demand.motionAccessory || demand.hsv;
    if (this.stopped && enabled) throw new Error('FCM source has stopped');
    if (this.active === enabled) return;
    this.active = enabled;
    this.epoch++;
    this.controller.abort();
    this.clearTimers();
    if (!enabled) {
      await this.closeWorker();
      this.audit({ event: 'inactive' });
      return;
    }
    this.activatedAt = this.now();
    this.failures = 0;
    this.faulted = false;
    this.controller = new globalThis.AbortController();
    await this.closeWorker();
    await this.queue;
    if (this.active && !this.stopped) this.launch(this.epoch);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.active = false;
    this.epoch++;
    this.controller.abort();
    this.clearTimers();
    await this.closeWorker();
  }

  /** Operator recovery of Google transport only; never resets native-storage ownership. */
  async reconnect(): Promise<void> {
    if (!this.active || this.stopped) throw new Error('FCM source is inactive');
    const epoch = ++this.epoch;
    this.controller.abort();
    this.clearTimers();
    try { await this.closeWorker(); }
    catch {
      this.faulted = true; this.audit({ event: 'faulted', reason: 'worker-stop-failed' });
      throw new Error('FCM worker did not stop');
    }
    await this.queue;
    if (!this.current(epoch)) return;
    this.failures = 0; this.faulted = false;
    this.launch(epoch);
  }

  private launch(epoch: number): void {
    if (!this.current(epoch) || this.worker || this.closing || this.faulted) return;
    this.audit({ event: 'starting' });
    if (!this.current(epoch)) return;
    this.controller = new globalThis.AbortController();
    this.readyAt = undefined;
    this.credentialsAccepted = false;
    try {
      const worker = (this.options.spawnWorker ?? spawnFcmWorker)();
      this.worker = worker;
      worker.onMessage(message => {
        if (!this.current(epoch) || this.worker !== worker) return;
        if (!boundedJson(message, FCM_LIMITS.ipcBytes) || this.queuedMessages >= 32) {
          void this.fail('protocol-error', false, worker, epoch); return;
        }
        this.queuedMessages++;
        this.queue = this.queue.then(async () => {
          if (this.current(epoch) && this.worker === worker) await this.handle(message, worker, epoch);
        }).catch(() => { void this.fail('notification-failed', true, worker, epoch); })
          .finally(() => { this.queuedMessages--; });
      });
      worker.onExit(() => {
        if (this.worker !== worker) return;
        if (this.current(epoch)) void this.fail('worker-exited', true, worker, epoch);
      });
      this.initialization = globalThis.setTimeout(() => { void this.fail('initialization-timeout', true, worker, epoch); }, this.initializationMs);
      this.initialization.unref?.();
      worker.send({ type: 'start', firebase: clone(this.options.firebase), credentials: clone(this.state.credentials), persistentIds: [...this.state.persistentIds] });
    } catch { void this.fail('worker-exited', true, this.worker, epoch); }
  }

  private async handle(value: unknown, worker: FcmWorkerHandle, epoch: number): Promise<void> {
    if (!value || typeof value !== 'object' || !boundedJson(value, FCM_LIMITS.ipcBytes)) {
      await this.fail('protocol-error', false, worker, epoch); return;
    }
    const message = value as WorkerEvent;
    if (message.type === 'credentials') {
      if (!validCredentials(message.credentials, this.options.firebase)) {
        await this.fail('protocol-error', false, worker, epoch); return;
      }
      try {
        await this.persist({ ...this.state, credentials: clone(message.credentials) });
      } catch { await this.fail('persistence-failed', false, worker, epoch); return; }
      if (!this.owns(epoch, worker)) return;
      this.audit({ event: 'credentials-saved' });
      if (!this.owns(epoch, worker)) return;
      const token = message.credentials.fcm.token;
      const hash = createHash('sha256').update(token).digest('hex');
      if (this.state.boundTokenSha256 !== hash) {
        try { await abortable(this.options.bindOwnedClientToken(token, this.controller.signal), this.controller.signal); }
        catch { if (this.current(epoch)) await this.fail('binding-failed', true, worker, epoch); return; }
        if (!this.owns(epoch, worker)) return;
        try { await this.persist({ ...this.state, boundTokenSha256: hash }); }
        catch { await this.fail('persistence-failed', false, worker, epoch); return; }
        this.audit({ event: 'client-bound' });
      }
      if (this.owns(epoch, worker)) {
        this.credentialsAccepted = true;
        worker.send({ type: 'credentials-accepted' });
      }
    } else if (message.type === 'ready') {
      if (this.readyAt !== undefined || !this.credentialsAccepted || !this.state.credentials || !this.state.boundTokenSha256) { await this.fail('protocol-error', false, worker, epoch); return; }
      if (this.initialization) globalThis.clearTimeout(this.initialization);
      this.initialization = undefined;
      this.readyAt = this.now();
      this.audit({ event: 'ready' });
    } else if (message.type === 'notification') {
      if (this.readyAt === undefined || !this.state.credentials || !validPersistentId(message.persistentId) || !Number.isFinite(message.receivedAt)
        || (message.data !== null && !validData(message.data))) { await this.fail('protocol-error', false, worker, epoch); return; }
      const duplicate = this.state.persistentIds.includes(message.persistentId);
      const created = message.data && parseBlinkOffsetTimestamp(message.data.created_at);
      this.lastMessageAt = this.now();
      const deliver = !duplicate && message.data !== null && created !== null && created !== undefined
        && created >= this.activatedAt && created <= this.now() + 60_000;
      if (deliver) {
        try {
          await abortable(this.options.onNotification({ persistentMessageId: message.persistentId, data: clone(message.data!),
            receivedAt: message.receivedAt, activatedAt: this.activatedAt, scope: { ...this.options.scope } }, this.controller.signal), this.controller.signal);
        } catch { if (this.current(epoch)) await this.fail('notification-failed', true, worker, epoch); return; }
        if (this.owns(epoch, worker)) this.lastHandoffAt = this.now();
      }
      if (!this.owns(epoch, worker)) return;
      if (!duplicate) {
        const persistentIds = [...this.state.persistentIds, message.persistentId].slice(-FCM_LIMITS.persistentIds);
        try { await this.persist({ ...this.state, persistentIds }); }
        catch { await this.fail('persistence-failed', false, worker, epoch); return; }
      }
      if (this.owns(epoch, worker)) {
        worker.send({ type: 'ack', persistentId: message.persistentId });
        this.audit(deliver ? { event: 'message-accepted' } : { event: 'message-ignored', disposition: duplicate ? 'duplicate'
          : message.data === null ? 'invalid-payload' : created === null || created === undefined ? 'invalid-timestamp'
            : created < this.activatedAt ? 'pre-activation' : 'future-timestamp' });
      }
    } else if (message.type === 'failure' && failures.has(message.reason) && typeof message.retryable === 'boolean') {
      await this.fail(message.reason, message.retryable, worker, epoch);
    } else { await this.fail('protocol-error', false, worker, epoch); }
  }

  private async persist(next: FcmReceiverState): Promise<void> {
    if (!boundedJson(next, FCM_LIMITS.stateBytes)) throw new Error('FCM state budget exceeded');
    await this.options.saveState(clone(next));
    this.state = clone(next);
  }

  private async fail(reason: FcmFailure, retryable: boolean, worker: FcmWorkerHandle | undefined, epoch: number): Promise<void> {
    if (!this.current(epoch) || (worker && this.worker !== worker) || this.faulted) return;
    const nextEpoch = ++this.epoch;
    this.controller.abort();
    this.clearTimers();
    if (this.readyAt !== undefined && this.now() - this.readyAt >= 60_000) this.failures = 0;
    this.failures++;
    try { await this.closeWorker(); }
    catch { this.faulted = true; this.audit({ event: 'faulted', reason: 'worker-stop-failed' }); return; }
    if (!this.current(nextEpoch)) return;
    if (!retryable || this.failures >= this.maxFailures) {
      this.faulted = true; this.audit({ event: 'faulted', reason }); return;
    }
    const base = Math.min(this.retryMaxMs, this.retryBaseMs * 2 ** (this.failures - 1));
    const delay = Math.min(this.retryMaxMs, Math.round(base * (0.8 + Math.min(1, Math.max(0, this.random())) * 0.4)));
    this.audit({ event: 'retrying', reason, retryInMs: delay });
    if (!this.current(nextEpoch)) return;
    this.retry = globalThis.setTimeout(() => { this.retry = undefined; this.launch(nextEpoch); }, delay);
    this.retry.unref?.();
  }

  private closeWorker(): Promise<void> {
    if (this.closing) return this.closing;
    const worker = this.worker;
    if (!worker) return Promise.resolve();
    this.worker = undefined;
    const closing = Promise.resolve().then(() => worker.stop()).catch(error => { this.worker = worker; throw error; });
    this.closing = closing;
    void closing.finally(() => { if (this.closing === closing) this.closing = undefined; }).catch(() => undefined);
    return closing;
  }
  private current(epoch: number): boolean { return this.active && !this.stopped && this.epoch === epoch; }
  private owns(epoch: number, worker: FcmWorkerHandle): boolean { return this.current(epoch) && this.worker === worker; }
  private clearTimers(): void {
    if (this.retry) globalThis.clearTimeout(this.retry);
    if (this.initialization) globalThis.clearTimeout(this.initialization);
    this.retry = this.initialization = undefined;
  }
  private audit(event: FcmAudit): void { try { this.options.onAudit?.(event); } catch { /* Observers cannot alter ownership. */ } }
}

const failures = new Set<FcmFailure>(['registration-unavailable', 'registration-rejected', 'registration-budget', 'transport-error',
  'protocol-error', 'initialization-timeout', 'acknowledgment-timeout', 'binding-failed', 'persistence-failed', 'notification-failed', 'worker-exited', 'worker-stop-failed']);
function limit(value: number, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid FCM source limit');
  return value;
}
function clone<T>(value: T): T { return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T; }
function abortable<T>(promise: Promise<T>, signal: globalThis.AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('FCM source stopped'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort)).catch(() => undefined);
  });
}

export function spawnFcmWorker(): FcmWorkerHandle {
  const env = Object.fromEntries(['PATH', 'LANG', 'TZ', 'NODE_ENV'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []));
  const child = fork(path.join(__dirname, 'worker.js'), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    execArgv: ['--max-old-space-size=96'], env });
  let exited = false;
  let stopping: Promise<void> | undefined;
  child.once('exit', () => { exited = true; });
  child.once('close', () => { exited = true; });
  child.on('error', () => { /* Exit/initialization timeout owns retry. */ });
  return {
    onMessage: listener => { child.on('message', listener); },
    onExit: listener => { child.once('close', listener); },
    send: (message: WorkerCommand) => { if (!child.connected) throw new Error('FCM worker disconnected'); child.send(message); },
    stop: () => {
      if (stopping) return stopping;
      if (exited) return Promise.resolve();
      stopping = new Promise<void>((resolve, reject) => {
        const done = () => { globalThis.clearTimeout(term); globalThis.clearTimeout(kill); globalThis.clearTimeout(failed); resolve(); };
        child.once('exit', done);
        const term = globalThis.setTimeout(() => { child.kill('SIGTERM'); }, 500);
        const kill = globalThis.setTimeout(() => { child.kill('SIGKILL'); }, 1500);
        const failed = globalThis.setTimeout(() => { child.removeListener('exit', done); reject(new Error('FCM worker did not exit')); }, 3000);
        if (child.connected) child.send({ type: 'stop' }); else child.kill('SIGTERM');
      });
      return stopping;
    },
  };
}
