/* global require, module */
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { FCM_LIMITS, boundedJson, validCredentials, validFirebase, validPersistentId,
  type FcmFailure, type WorkerCommand, type WorkerEvent } from './types';
import { McsConnection } from './wire';
import { registerGoogleIdentity } from './registration';

/** The worker has no Blink credential, URL or SDK dependency. */
export function runFcmWorker(): void {
  let started = false, finished = false;
  let transport: McsConnection | undefined;
  let credentialsTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let registrationTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  const controller = new globalThis.AbortController();
  const send = (message: WorkerEvent) => {
    if (!process.connected || !boundedJson(message, FCM_LIMITS.ipcBytes)) { finish(); return; }
    process.send?.(message, error => { if (error) finish(); });
  };
  const finish = (reason?: FcmFailure, retryable = true) => {
    if (finished) return;
    finished = true;
    controller.abort();
    if (registrationTimer) globalThis.clearTimeout(registrationTimer);
    if (credentialsTimer) globalThis.clearTimeout(credentialsTimer);
    transport?.stop();
    if (reason && process.connected) process.send?.({ type: 'failure', reason, retryable } satisfies WorkerEvent, () => process.exit(1));
    else process.exit(reason ? 1 : 0);
    setTimeout(() => process.exit(reason ? 1 : 0), 100).unref();
  };

  process.on('disconnect', () => finish());
  process.on('SIGTERM', () => finish());
  process.on('uncaughtException', () => finish('protocol-error', false));
  process.on('unhandledRejection', () => finish('protocol-error', false));
  process.on('message', async value => {
    if (finished || !value || typeof value !== 'object' || !boundedJson(value, FCM_LIMITS.ipcBytes)) { finish('protocol-error', false); return; }
    const message = value as WorkerCommand;
    if (message.type === 'stop') { finish(); return; }
    if (message.type === 'ack') {
      if (!validPersistentId(message.persistentId)) { finish('protocol-error', false); return; }
      transport?.acknowledge(message.persistentId); return;
    }
    if (message.type === 'credentials-accepted') {
      if (!transport || !credentialsTimer) { finish('protocol-error', false); return; }
      globalThis.clearTimeout(credentialsTimer); credentialsTimer = undefined;
      try { transport.start(); } catch { finish('transport-error'); }
      return;
    }
    if (message.type !== 'start' || started || !validFirebase(message.firebase)
      || !Array.isArray(message.persistentIds) || message.persistentIds.length > FCM_LIMITS.persistentIds
      || message.persistentIds.some(id => !validPersistentId(id))
      || (message.credentials !== undefined && !validCredentials(message.credentials, message.firebase))) {
      finish('protocol-error', false); return;
    }
    started = true;
    installGoogleRequestBudget(controller.signal, finish);
    registrationTimer = globalThis.setTimeout(() => finish('registration-budget'), FCM_LIMITS.registrationMs);
    try {
      const credentials = await registerGoogleIdentity(message.firebase, message.credentials, message.persistentIds);
      if (finished) return;
      if (!validCredentials(credentials, message.firebase)) { finish('registration-rejected', false); return; }
      globalThis.clearTimeout(registrationTimer); registrationTimer = undefined;
      transport = new McsConnection({ credentials, persistentIds: message.persistentIds, senderId: message.firebase.messagingSenderId,
        onReady: () => send({ type: 'ready' }), onNotification: event => send({ type: 'notification', ...event }),
        onFailure: reason => finish(reason) });
      credentialsTimer = globalThis.setTimeout(() => finish('initialization-timeout'), 30_000);
      send({ type: 'credentials', credentials });
    } catch { finish('registration-unavailable'); }
  });
}

/** Bound the dependency's otherwise unbounded network retries inside this owned process. */
export function installGoogleRequestBudget(signal: globalThis.AbortSignal, fail: (reason: FcmFailure, retryable?: boolean) => void): void {
  const fetch = globalThis.fetch;
  const allowed = new Set(['android.clients.google.com', 'firebaseinstallations.googleapis.com', 'fcmregistrations.googleapis.com']);
  let count = 0;
  let failed = false;
  const reject = (reason: FcmFailure, retryable = true) => { if (!failed) { failed = true; fail(reason, retryable); } };
  globalThis.fetch = async (input, options = {}) => {
    const url = new globalThis.URL(typeof input === 'string' ? input : input instanceof globalThis.URL ? input.href : input.url);
    if (url.protocol !== 'https:' || !allowed.has(url.hostname) || url.username || url.password || url.port
      || ++count > FCM_LIMITS.registrationRequests || signal.aborted || failed || options.method !== 'POST') {
      reject('registration-budget', false); throw new Error('Google registration budget rejected');
    }
    const bodyBytes = typeof options.body === 'string' ? Buffer.byteLength(options.body)
      : options.body instanceof Uint8Array ? options.body.byteLength : Infinity;
    if (bodyBytes > 32 * 1024) { reject('registration-budget', false); throw new Error('Google registration body rejected'); }
    try {
      const response = await fetch(input, { ...options, redirect: 'error',
        signal: globalThis.globalThis.AbortSignal.any([signal, globalThis.AbortSignal.timeout(10_000), ...(options.signal ? [options.signal] : [])]) });
      if (!response.ok) {
        reject(response.status >= 400 && response.status < 500 && response.status !== 429 ? 'registration-rejected' : 'registration-unavailable',
          response.status === 429 || response.status >= 500);
        throw new Error('Google registration rejected');
      }
      // Registration bodies are small; cap buffering before passing them to the dependency.
      const reader = response.body?.getReader();
      const chunks: Buffer[] = [];
      let bytes = 0;
      if (reader) {
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 64 * 1024) {
              void reader.cancel().catch(() => undefined);
              reject('registration-budget', false); throw new Error('Google response budget rejected');
            }
            chunks.push(Buffer.from(chunk.value));
          }
        } finally { reader.releaseLock(); }
      }
      return new globalThis.Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) { if (!signal.aborted) reject('registration-unavailable'); throw error; }
  };
}

if (require.main === module) runFcmWorker();
