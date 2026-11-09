import { Buffer } from 'node:buffer';
import { createECDH } from 'node:crypto';
import type { Credentials, FirebaseConfig } from '@eneris/push-receiver/dist/types';

export type { Credentials, FirebaseConfig };

export const FCM_BUNDLE_ID = 'homebridge.blink.motion';
export const FCM_LIMITS = Object.freeze({ ipcBytes: 96 * 1024, stateBytes: 96 * 1024, frameBytes: 64 * 1024,
  notificationBytes: 32 * 1024, persistentIds: 256, pendingMessages: 16, registrationRequests: 8,
  registrationMs: 30_000, connectMs: 20_000, heartbeatMs: 300_000, acknowledgmentMs: 30_000 });

export interface FcmScope { accountId: number; clientId: number; tier: string; }
export interface FcmReceiverState {
  version: 1;
  scope: FcmScope;
  firebase: Pick<FirebaseConfig, 'projectId' | 'appId' | 'messagingSenderId'>;
  credentials?: Credentials;
  boundTokenSha256?: string;
  persistentIds: string[];
}
export interface FcmNotification {
  persistentMessageId: string;
  data: Readonly<Record<string, string>>;
  receivedAt: number;
  /** Only messages created during this activation may enter acquisition. */
  activatedAt: number;
  scope: FcmScope;
}
export type FcmFailure = 'registration-unavailable' | 'registration-rejected' | 'registration-budget'
  | 'transport-error' | 'protocol-error' | 'initialization-timeout' | 'acknowledgment-timeout'
  | 'binding-failed' | 'persistence-failed' | 'notification-failed' | 'worker-exited' | 'worker-stop-failed';
export type FcmAudit = { event: 'inactive' | 'starting' | 'credentials-saved' | 'client-bound' | 'ready'
  | 'message-accepted' | 'message-ignored' | 'retrying' | 'faulted'; reason?: FcmFailure; retryInMs?: number;
  disposition?: 'duplicate' | 'invalid-payload' | 'invalid-timestamp' | 'pre-activation' | 'future-timestamp' };
export interface FcmSourceStatus {
  active: boolean;
  connected: boolean;
  faulted: boolean;
  consecutiveFailures: number;
  lastMessageAt?: number;
  lastHandoffAt?: number;
}

export type WorkerCommand = { type: 'start'; firebase: FirebaseConfig; credentials?: Credentials; persistentIds: string[] }
  | { type: 'credentials-accepted' } | { type: 'ack'; persistentId: string } | { type: 'stop' };
export type WorkerEvent = { type: 'credentials'; credentials: Credentials }
  | { type: 'ready' }
  | { type: 'notification'; persistentId: string; data: Record<string, string> | null; receivedAt: number }
  | { type: 'failure'; reason: FcmFailure; retryable: boolean };

export interface FcmWorkerHandle {
  onMessage(listener: (message: unknown) => void): void;
  onExit(listener: () => void): void;
  send(message: WorkerCommand): void;
  /** Resolves only after the owned process has exited. */
  stop(): Promise<void>;
}

export function boundedJson(value: unknown, bytes: number): boolean {
  try { return Buffer.byteLength(JSON.stringify(value)) <= bytes; } catch { return false; }
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 8192): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && !/\p{Cc}/u.test(value);
export const validPersistentId = (value: unknown): value is string => text(value, 256) && !/\p{Cc}/u.test(value);

export function validFirebase(value: unknown): value is FirebaseConfig {
  if (!record(value)) return false;
  return text(value.projectId, 128) && /^[a-z0-9-]+$/.test(value.projectId)
    && text(value.appId, 256) && text(value.apiKey, 256)
    && text(value.messagingSenderId, 32) && /^\d+$/.test(value.messagingSenderId);
}
export function validScope(value: unknown): value is FcmScope {
  if (!record(value)) return false;
  return Number.isSafeInteger(value.accountId) && Number(value.accountId) > 0
    && Number.isSafeInteger(value.clientId) && Number(value.clientId) > 0
    && typeof value.tier === 'string' && /^[a-z0-9]{4}$/i.test(value.tier);
}
export function validCredentials(value: unknown, firebase: FirebaseConfig): value is Credentials {
  if (!record(value) || !boundedJson(value, 64 * 1024)) return false;
  const { gcm, fcm, keys, config } = value;
  if (!record(gcm) || !record(fcm) || !record(keys) || !record(config) || !record(fcm.installation)) return false;
  const installation = fcm.installation;
  return uint64(gcm.androidId) && uint64(gcm.securityToken) && text(gcm.appId) && text(gcm.token)
    && text(fcm.token) && text(keys.privateKey) && text(keys.publicKey) && text(keys.authSecret)
    && validKeys(keys.privateKey, keys.publicKey, keys.authSecret)
    && text(installation.token) && text(installation.refreshToken) && text(installation.fid, 128)
    && Number.isFinite(installation.createdAt) && Number(installation.createdAt) > 0
    && Number.isFinite(installation.expiresIn) && Number(installation.expiresIn) > 0
    && config.projectId === firebase.projectId && config.bundleId === FCM_BUNDLE_ID && config.vapidKey === '';
}
function uint64(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= 0xffffffffffffffffn;
}
function validKeys(privateKey: string, publicKey: string, authSecret: string): boolean {
  try {
    const material = [privateKey, publicKey, authSecret].map(value => {
      // The pinned receiver creates unpadded base64url material. Accept only a
      // canonical encoding so malformed or truncated credentials stay rejected.
      const encoding = /^[A-Za-z0-9_-]+$/.test(value) ? 'base64url' : 'base64';
      const bytes = Buffer.from(value, encoding);
      if (bytes.toString(encoding) !== value) throw new Error('Invalid key encoding');
      return bytes;
    });
    if (material[0].length !== 32 || material[1].length !== 65 || material[2].length !== 16) return false;
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(material[0]);
    return ecdh.getPublicKey().equals(material[1]);
  } catch { return false; }
}
export function validData(value: unknown): value is Record<string, string> {
  return record(value) && boundedJson(value, FCM_LIMITS.notificationBytes)
    && Object.keys(value).length <= 64 && Object.entries(value).every(([key, item]) => text(key, 128)
      && !['__proto__', 'prototype', 'constructor'].includes(key) && typeof item === 'string' && item.length <= 4096);
}
