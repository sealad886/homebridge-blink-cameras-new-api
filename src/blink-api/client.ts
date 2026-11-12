import { isBlinkVideoQuality, requireRemoteId, supportsEarlyNotificationControl, validateCameraTemperature,
  validateEarlyNotificationState, validateHomescreen, validateVideoQualityState } from './domain-validation';
import { constants as fsConstants, promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import * as path from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { removeOwnerOnlyFile } from './secure-json-file';
import type { NativeStorageScope, NativeStorageState, NativeStorageTransport, NativeStorageRoute,
  NativeStorageRequestOptions } from './native-storage';
/**
 * Blink API Client
 *
 * High-level client for interacting with Blink Home Monitor REST API.
 * All methods reference the API dossier for endpoint documentation.
 *
 * Source: API Dossier - /base-apk/docs/api_dossier.md
 */

import { BlinkAuth } from './auth';
import { RequestOptions, OperationTimeoutError, checkRequestBudget, withinRequestBudget, budgetedDelay,
  REMOTE_OPERATION_LEASE_MS, isRemoteOperationLeaseActive } from '../operation-budget';
import { BlinkHttp, BlinkHttpError, isBlinkPostRefusal, type BlinkHttpRequestOptions } from './http';
import {
  BLINK_PRODUCTION_BOOTSTRAP_TIERS,
  getRestBaseUrl,
  getRestRootUrl,
  getSharedRestBaseUrl,
  getSharedRestRootUrl,
  normalizeBlinkTier,
} from './urls';
import {
  BlinkAccountInfo,
  BlinkCommandResponse,
  BlinkCommandStatus,
  BlinkConfig,
  BlinkCameraKind,
  BlinkInputQuality,
  BlinkVideoQualityState,
  BlinkGeneratePinResponse,
  BlinkHostedLoginResult,
  BlinkHostedOAuthStart,
  BlinkHomescreen,
  BlinkLiveVideoResponse,
  BlinkLogger,
  BlinkMediaResponse,
  BlinkMediaQuery,
  BlinkPinVerificationResponse,
  BlinkResendPinResponse,
  BlinkTierInfo,
  BlinkUnwatchedMediaResponse,
  BlinkVerifyPinResponse,
} from '../types';

export class BlinkRestVerificationRequiredError extends Error {
  constructor(
    public readonly type: 'client' | 'account',
    message = `Blink ${type} verification required`,
  ) {
    super(message);
    this.name = 'BlinkRestVerificationRequiredError';
  }
}

export interface BlinkCaptureResult extends BlinkCommandResponse {
  captureOutcome: 'completed' | 'existing-thumbnail';
  thumbnail?: string;
}

export interface BlinkEarlyNotificationState {
  supported: boolean;
  compatible?: boolean;
  current?: boolean;
  changed: boolean;
}

export interface BlinkEarlyNotificationOptions extends RequestOptions {
  /** Persist the original value before the owned mutation can be dispatched. */
  beforeChange?: (current: boolean) => Promise<void>;
  /** A restoration must leave a subsequently changed vendor value alone. */
  expectedCurrent?: boolean;
}

interface ConflictResolution<T> { resolved: boolean; value?: T }

export class BlinkOperationNotStartedError extends Error {
  readonly dispatched = false;
  constructor(public readonly reason: 'storage-pending' | 'liveview-pending' | 'ownership-unavailable' | 'invalid-native-route') {
    super(`Blink operation was not started: ${reason}.`);
    this.name = 'BlinkOperationNotStartedError';
  }
}

/** An unsent follow-up read cannot establish that its preceding mutation was unsent. */
function afterDispatchFailure(error: unknown): unknown {
  if (!(error instanceof Error) || (error as Error & { dispatched?: boolean }).dispatched !== false) return error;
  const timeout = error instanceof OperationTimeoutError;
  const failure = timeout ? new OperationTimeoutError()
    : new Error('Blink operation was dispatched; its outcome could not be confirmed.', { cause: error });
  if (!timeout) failure.name = 'BlinkOperationOutcomeUnknownError';
  Object.defineProperty(failure, 'dispatched', { value: true, configurable: true });
  return failure;
}
export interface BlinkMotionClientMetadata { appVersion: string; osVersion: string; clientName: string; }
export interface BlinkLiveViewOwnership {
  reservationId: string;
  accountId: number;
  networkId: number;
  deviceId: number;
  kind: BlinkCameraKind;
  phase: 'starting' | 'active' | 'retiring' | 'unresolved';
  commandId?: number;
  retirementAcknowledged: boolean;
  expiresAt?: number;
}
export interface BlinkStateCommandOwnership {
  reservationId: string;
  accountId: number;
  networkId: number;
  deviceId?: number;
  kind: 'arm' | 'disarm' | 'motion' | 'capture' | 'quality' | 'early-notification';
  phase: 'starting' | 'accepted' | 'unresolved';
  commandId?: number;
  /** Total wire status reads, retained across timeouts and restart. */
  statusReads: number;
  expiresAt?: number;
}
export interface BlinkAbandonedOperation {
  reservationId: string;
  accountId: number;
  networkId: number;
  kind: 'liveview' | BlinkStateCommandOwnership['kind'] | 'catalog' | 'clip';
  commandId?: number;
  abandonedAt: number;
  reason: 'lease-expired' | 'legacy-owner';
}
export interface BlinkRemoteOperationOwnership {
  liveView?: BlinkLiveViewOwnership;
  stateCommand?: BlinkStateCommandOwnership;
  abandoned?: BlinkAbandonedOperation[];
}
interface RemoteOperationScope { accountId: number; clientId: number; tier: string; }
interface RemoteOperationWriter {
  scope?: RemoteOperationScope;
  releasing?: Promise<void>;
  released: boolean;
}
interface NativeStorageFence extends NativeStorageScope {
  operationId: string;
  kind: 'catalog' | 'clip';
  phase: string;
  commandId?: number;
  expiresAt?: number;
  clip?: { manifestId: number; clipId: number; mediaUrl: string | null };
}
interface CommandAdmission {
  kind: 'state' | 'storage' | 'liveview' | 'retire' | 'update';
  operationId?: string;
  scope?: NativeStorageScope;
  networkId?: number;
  commandId?: number;
}
interface CommandRequestOptions extends RequestOptions {
  generation: number;
  mutationAcknowledged: boolean;
  beforeDispatch(): void;
}

export class BlinkApi {
  private stateCommandTail: Promise<void> = Promise.resolve();
  private hasSentStateCommand = false;
  private readonly auth: BlinkAuth;
  private readonly http: BlinkHttp;
  private readonly sharedHttp: BlinkHttp;
  private readonly sharedRootHttp: BlinkHttp;
  private readonly regionalRootHttp: BlinkHttp;
  private readonly log: BlinkLogger;
  private readonly debug: boolean;
  private accountId: number | null = null;
  private clientId: number | null = null;
  private readonly nativeStorageFences = new Map<string, NativeStorageFence>();
  private activeNativeAdmission?: { operationId: string; scope: NativeStorageScope; canPost: boolean; expiresAt: number };
  private liveViewOwner?: BlinkLiveViewOwnership;
  private stateCommandOwner?: BlinkStateCommandOwnership;
  private liveViewRevision = 0;
  private stateCommandRevision = 0;
  private saveRemoteOperationState?: (state: BlinkRemoteOperationOwnership) => Promise<void>;
  private remoteOperationWriter?: RemoteOperationWriter;
  private queuedStateCommands = 0;
  private stateCommandReconciliation?: Promise<void>;
  private reconcilingStateCommand = false;
  private stateCommandRunning?: string;
  private ownershipPersistenceFailed = false;
  private writerGeneration = 0;
  private pendingOwnershipWrite?: Promise<void>;
  private queuedOwnershipWrite?: { state: BlinkRemoteOperationOwnership; generation: number;
    save: (state: BlinkRemoteOperationOwnership) => Promise<void> };
  private abandonedOperations: BlinkAbandonedOperation[] = [];

  constructor(private readonly config: BlinkConfig) {
    this.auth = new BlinkAuth(config);
    this.http = new BlinkHttp(this.auth, config);
    this.sharedHttp = new BlinkHttp(this.auth, config, getSharedRestBaseUrl(config));
    this.sharedRootHttp = new BlinkHttp(this.auth, config, getSharedRestRootUrl(config));
    this.regionalRootHttp = new BlinkHttp(this.auth, config, getRestRootUrl(config));
    this.log = config.logger ?? { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
    this.debug = config.debugAuth ?? false;
  }

  private logDebug(message: string): void {
    if (this.debug) {
      this.log.info(`[Client Debug] ${message}`);
    }
  }

  /** Serialize remote capture and mutations, including command completion. */
  private queueStateCommand<T>(
    label: 'Motion' | 'Network' | 'Capture' | 'Quality' | 'EarlyNotification' | 'NativeStorage' | 'LiveView' | 'Retirement' | 'CommandUpdate',
    send: (options: CommandRequestOptions) => Promise<T>,
    retryDelays: number[],
    conflictResolution?: (options: RequestOptions) => Promise<ConflictResolution<T>>,
    options: RequestOptions = {},
    admission: CommandAdmission = { kind: 'state' },
  ): Promise<T> {
    this.expireOperationOwners();
    const live = this.liveViewOwner;
    const ownerExpiresAt = (admission.kind === 'retire' || admission.kind === 'update') && live
      && live.networkId === admission.networkId && live.commandId === admission.commandId
      ? live.expiresAt ?? Date.now() : undefined;
    const generation = this.writerGeneration;
    this.queuedStateCommands++;
    let started = false;
    let queueTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const command = this.stateCommandTail.then(async () => {
      const checkQueued = () => {
        if (generation !== this.writerGeneration) throw new BlinkOperationNotStartedError('ownership-unavailable');
        options.signal?.throwIfAborted();
        if (options.queueDeadline !== undefined && options.queueDeadline <= Date.now()) throw new OperationTimeoutError();
        if (ownerExpiresAt !== undefined && ownerExpiresAt <= Date.now()) throw new OperationTimeoutError();
      };
      checkQueued();
      this.assertCommandAdmission(admission);
      if (this.hasSentStateCommand) await budgetedDelay(300, options);
      checkQueued();
      this.assertCommandAdmission(admission);
      started = true;
      if (queueTimer) globalThis.clearTimeout(queueTimer);
      this.hasSentStateCommand = true;
      const execution: CommandRequestOptions = { ...options, generation, mutationAcknowledged: false, deadline: Math.min(options.deadline ?? Infinity,
        ownerExpiresAt ?? Infinity, Date.now() + (admission.kind === 'storage' ? 120_000 : 60_000)),
      beforeDispatch: () => {
        checkRequestBudget(execution);
        if (generation !== this.writerGeneration) throw new BlinkOperationNotStartedError('ownership-unavailable');
      } };
      for (let attempt = 0; ; attempt++) {
        execution.beforeDispatch();
        this.assertCommandAdmission(admission);
        try {
          const sent = send(execution);
          const native = this.activeNativeAdmission;
          try {
            const result = await withinRequestBudget(sent, execution);
            execution.beforeDispatch();
            return result;
          }
          finally {
            if (native && this.activeNativeAdmission === native) this.activeNativeAdmission = undefined;
            this.expireOperationOwners();
          }
        } catch (error) {
          // Preserve mutation dispatch proof through status and public readback failures.
          if (execution.mutationAcknowledged) throw afterDispatchFailure(error);
          if (!isBlinkPostRefusal(error) || error.status !== 409) throw error;
          const reconciled = await conflictResolution?.(execution);
          execution.beforeDispatch();
          if (reconciled?.resolved) {
            this.log.info(`[${label}] Requested state verified after conflict (attempt ${attempt + 1}).`);
            return reconciled.value as T;
          }
          const delay = retryDelays[attempt];
          if (delay === undefined) throw error;
          this.log.warn(`[${label}] State conflict; retry in ${delay}ms (attempt ${attempt + 1}/${retryDelays.length}).`);
          await budgetedDelay(delay, execution);
        }
      }
    });
    const settled = () => { if (generation === this.writerGeneration) this.queuedStateCommands--; };
    this.stateCommandTail = command.then(settled, settled);
    if (options.queueDeadline === undefined) return command;
    return new Promise<T>((resolve, reject) => {
      queueTimer = globalThis.setTimeout(() => {
        if (!started) reject(new OperationTimeoutError());
      }, Math.max(0, options.queueDeadline! - Date.now()));
      command.then(resolve, reject).finally(() => {
        if (queueTimer) globalThis.clearTimeout(queueTimer);
      });
    });
  }

  private nativeScopeKey(scope: NativeStorageScope): string {
    requireRemoteId(scope.accountId); requireRemoteId(scope.networkId); requireRemoteId(scope.syncModuleId);
    return `${scope.accountId}/${scope.networkId}/${scope.syncModuleId}`;
  }

  private remoteOperationSnapshot(): BlinkRemoteOperationOwnership {
    return { ...(this.liveViewOwner ? { liveView: { ...this.liveViewOwner } } : {}),
      ...(this.stateCommandOwner ? { stateCommand: { ...this.stateCommandOwner } } : {}),
      ...(this.abandonedOperations.length ? { abandoned: this.abandonedOperations.map(owner => ({ ...owner })) } : {}) };
  }

  private expireOperationOwners(): void {
    let changed = false;
    const abandon = (owner: { accountId: number; networkId: number; expiresAt?: number; commandId?: number },
      reservationId: string, kind: BlinkAbandonedOperation['kind']) => {
      if (!this.abandonedOperations.some(receipt => receipt.reservationId === reservationId && receipt.kind === kind
        && receipt.accountId === owner.accountId && receipt.networkId === owner.networkId)) {
        this.abandonedOperations.push({ reservationId, accountId: owner.accountId, networkId: owner.networkId, kind,
          ...(owner.commandId ? { commandId: owner.commandId } : {}), abandonedAt: Date.now(),
          reason: owner.expiresAt === undefined ? 'legacy-owner' : 'lease-expired' });
        this.abandonedOperations = this.abandonedOperations.slice(-32);
        this.log.warn(`[Command] Local ${kind} exclusion expired; remote outcome remains unknown.`);
      }
      changed = true;
    };
    if (this.liveViewOwner && !isRemoteOperationLeaseActive(this.liveViewOwner.expiresAt)) {
      abandon(this.liveViewOwner, this.liveViewOwner.reservationId, 'liveview');
      this.liveViewOwner = undefined;
    }
    if (this.stateCommandOwner && !isRemoteOperationLeaseActive(this.stateCommandOwner.expiresAt)) {
      if (this.stateCommandRunning === this.stateCommandOwner.reservationId) this.stateCommandRunning = undefined;
      abandon(this.stateCommandOwner, this.stateCommandOwner.reservationId, this.stateCommandOwner.kind);
      this.stateCommandOwner = undefined;
    }
    for (const [key, owner] of this.nativeStorageFences) {
      if (!isRemoteOperationLeaseActive(owner.expiresAt)) {
        abandon(owner, owner.operationId, owner.kind); this.nativeStorageFences.delete(key);
      }
    }
    if (changed && this.saveRemoteOperationState) void this.writeRemoteOperationState(this.remoteOperationSnapshot());
  }

  private assertCommandAdmission(admission: CommandAdmission): void {
    this.expireOperationOwners();
    const live = this.liveViewOwner;
    const matchesLive = Boolean(live?.commandId && live.networkId === admission.networkId && live.commandId === admission.commandId);
    if (this.stateCommandOwner) throw new BlinkOperationNotStartedError('ownership-unavailable');
    // Closing an owned view can resolve a restored conflict; never clean up an unrelated command.
    if (admission.kind === 'retire' && matchesLive) return;
    for (const fence of this.nativeStorageFences.values()) {
      if (admission.kind !== 'storage' || !admission.scope || fence.operationId !== admission.operationId ||
        this.nativeScopeKey(fence) !== this.nativeScopeKey(admission.scope)) {
        throw new BlinkOperationNotStartedError('storage-pending');
      }
    }
    if (live && !(admission.kind === 'update' && matchesLive && live.phase === 'active')) {
      throw new BlinkOperationNotStartedError('liveview-pending');
    }
  }

  /** Call after the shared account-state writer has committed this exact module's state. */
  setNativeStorageOwner(scope: NativeStorageScope, state: NativeStorageState): void {
    const key = this.nativeScopeKey(scope);
    const fence = this.nativeStorageFence(scope, state);
    if (fence) this.nativeStorageFences.set(key, fence);
    else this.nativeStorageFences.delete(key);
  }

  private nativeStorageFence(scope: NativeStorageScope, state: NativeStorageState): NativeStorageFence | undefined {
    const key = this.nativeScopeKey(scope);
    if (state.version !== 1) throw new Error('Invalid native ownership state.');
    const owner = state.operation;
    if (owner === undefined) return;
    if (!owner || typeof owner !== 'object' || this.nativeScopeKey(owner) !== key ||
      !['catalog', 'clip'].includes(owner.kind) || !['intent', 'accepted', 'prepared', 'finished', 'abandoned'].includes(owner.phase) ||
      typeof owner.operationId !== 'string' || !owner.operationId) throw new Error('Invalid native ownership state.');
    if (owner.commandId !== undefined) requireRemoteId(owner.commandId);
    if (owner.phase === 'abandoned') return;
    if (owner.phase === 'finished') {
      if (!owner.result || !['ready', 'failed'].includes(owner.result.status)) throw new Error('Missing native completion proof.');
      return;
    }
    if (!isRemoteOperationLeaseActive(owner.expiresAt)) return;
    return { ...scope, operationId: owner.operationId, kind: owner.kind,
      phase: owner.phase, expiresAt: owner.expiresAt, ...(owner.commandId ? { commandId: owner.commandId } : {}),
      ...(owner.clip ? { clip: { manifestId: owner.clip.manifestId, clipId: owner.clip.clip.clipId,
        mediaUrl: owner.clip.clip.mediaUrl } } : {}) };
  }

  withNativeStorageAdmission<T>(operationId: string, work: () => Promise<T>, options: RequestOptions,
    scope: NativeStorageScope): Promise<T> {
    this.nativeScopeKey(scope);
    return this.queueStateCommand('NativeStorage', async execution => {
      this.expireOperationOwners();
      const reservation = { operationId, scope: { ...scope }, canPost: this.nativeStorageFences.size === 0,
        expiresAt: execution.deadline! };
      this.activeNativeAdmission = reservation;
      try { return await work(); }
      finally { if (this.activeNativeAdmission === reservation) this.activeNativeAdmission = undefined; }
    }, [], undefined, options, { kind: 'storage', operationId, scope });
  }

  /** Return a shutdown lease. Released writers remain usable for late owned cleanup until a validated handoff. */
  configureRemoteOperationOwnership(options: { restoredState?: BlinkRemoteOperationOwnership;
    restoredNativeStorage?: readonly { scope: NativeStorageScope; state: NativeStorageState }[];
    scope?: RemoteOperationScope; saveState: (state: BlinkRemoteOperationOwnership) => Promise<void> }): (options?: RequestOptions) => Promise<void> {
    this.expireOperationOwners();
    if ((!this.remoteOperationWriter?.released && (this.activeNativeAdmission || this.queuedStateCommands || this.stateCommandRunning || this.reconcilingStateCommand))
      || (this.saveRemoteOperationState && !this.remoteOperationWriter?.released)) {
      throw new Error('Cannot replace active operation ownership.');
    }
    if (options.restoredState !== undefined && (!options.restoredState || typeof options.restoredState !== 'object'
      || Array.isArray(options.restoredState))) throw new Error('Invalid remote operation ownership.');
    const live = options.restoredState?.liveView;
    const command = options.restoredState?.stateCommand;
    if (live !== undefined) this.validateLiveViewOwner(live);
    if (command !== undefined) this.validateStateCommandOwner(command);
    if (live && command) throw new Error('Conflicting remote operation ownership.');
    const archived = options.restoredState?.abandoned ?? [];
    if (!Array.isArray(archived) || archived.length > 32 || archived.some(owner => !owner || typeof owner !== 'object'
      || typeof owner.reservationId !== 'string' || !owner.reservationId || owner.reservationId.length > 256
      || !['liveview', 'arm', 'disarm', 'motion', 'capture', 'quality', 'early-notification', 'catalog', 'clip'].includes(owner.kind)
      || !['legacy-owner', 'lease-expired'].includes(owner.reason) || !Number.isSafeInteger(owner.abandonedAt)
      || owner.abandonedAt < 0 || !Number.isSafeInteger(owner.accountId) || owner.accountId <= 0
      || !Number.isSafeInteger(owner.networkId) || owner.networkId <= 0
      || (owner.commandId !== undefined && (!Number.isSafeInteger(owner.commandId) || owner.commandId <= 0)))) {
      throw new Error('Invalid abandoned operation evidence.');
    }
    const authenticated = this.getCachedIdentity();
    const identity = options.scope ?? authenticated;
    const scope = identity.accountId && identity.clientId
      ? { accountId: identity.accountId, clientId: identity.clientId, tier: identity.tier } : undefined;
    if (scope) { requireRemoteId(scope.accountId); requireRemoteId(scope.clientId); }
    if (options.scope && (!scope || !/^[a-z0-9]{4}$/i.test(scope.tier))) throw new Error('Invalid operation ownership scope.');
    if (options.scope && (!scope || scope.accountId !== authenticated.accountId || scope.clientId !== authenticated.clientId
      || scope.tier !== authenticated.tier)) throw new Error('Operation ownership scope changed.');
    if (scope && ((live && live.accountId !== scope.accountId) || (command && command.accountId !== scope.accountId)
      || options.restoredNativeStorage?.some(entry => entry.scope.accountId !== scope.accountId))) {
      throw new Error('Foreign restored operation ownership.');
    }
    const existing = this.remoteOperationWriter;
    const sameScope = Boolean(existing && JSON.stringify(existing.scope) === JSON.stringify(scope));
    const retained = Boolean(this.liveViewOwner || this.stateCommandOwner || this.nativeStorageFences.size);
    if (retained && existing && JSON.stringify(existing.scope) !== JSON.stringify(scope)) {
      throw new Error('Cannot transfer unresolved operation ownership to another scope.');
    }
    const liveKey = (owner?: BlinkLiveViewOwnership) => owner && isRemoteOperationLeaseActive(owner.expiresAt) ? [owner.reservationId, owner.accountId, owner.networkId,
      owner.deviceId, owner.kind, owner.phase, owner.commandId, owner.retirementAcknowledged, owner.expiresAt] : undefined;
    const commandKey = (owner?: BlinkStateCommandOwnership) => owner && isRemoteOperationLeaseActive(owner.expiresAt) ? [owner.reservationId, owner.accountId,
      owner.networkId, owner.deviceId, owner.kind, owner.phase, owner.commandId, owner.statusReads, owner.expiresAt] : undefined;
    if (((this.liveViewOwner || sameScope) && JSON.stringify(liveKey(this.liveViewOwner)) !== JSON.stringify(liveKey(live)))
      || ((this.stateCommandOwner || sameScope) && JSON.stringify(commandKey(this.stateCommandOwner)) !== JSON.stringify(commandKey(command)))) {
      throw new Error('Restored operation ownership does not retain the current owner.');
    }
    const restoredFences = new Map((options.restoredNativeStorage ?? []).map(entry =>
      [this.nativeScopeKey(entry.scope), this.nativeStorageFence(entry.scope, entry.state)]));
    const fenceKey = (fence?: NativeStorageFence) => fence && [fence.accountId, fence.networkId, fence.syncModuleId,
      fence.operationId, fence.kind, fence.phase, fence.commandId, fence.clip?.manifestId, fence.clip?.clipId, fence.clip?.mediaUrl, fence.expiresAt];
    for (const [key, fence] of this.nativeStorageFences) {
      if (JSON.stringify(fenceKey(fence)) !== JSON.stringify(fenceKey(restoredFences.get(key)))) {
        throw new Error('Restored native ownership does not retain the current owner.');
      }
    }
    if (sameScope && [...restoredFences].some(([key, fence]) => fence && !this.nativeStorageFences.has(key))) {
      throw new Error('Restored native ownership contains a stale owner.');
    }
    this.liveViewOwner = live ? { ...live } : undefined;
    this.stateCommandOwner = command ? { ...command } : undefined;
    this.abandonedOperations = [...archived, ...this.abandonedOperations].filter((owner, index, all) =>
      all.findIndex(other => other.reservationId === owner.reservationId && other.kind === owner.kind
        && other.accountId === owner.accountId && other.networkId === owner.networkId) === index).slice(-32).map(owner => ({ ...owner }));
    this.saveRemoteOperationState = options.saveState;
    const writer: RemoteOperationWriter = { scope, released: false };
    this.remoteOperationWriter = writer;
    this.writerGeneration++;
    this.stateCommandTail = Promise.resolve();
    this.queuedStateCommands = 0;
    this.stateCommandRunning = undefined;
    this.activeNativeAdmission = undefined;
    this.expireOperationOwners();
    if (this.pendingOwnershipWrite) void this.writeRemoteOperationState(this.remoteOperationSnapshot());
    return (request: RequestOptions = {}) => {
      if (this.remoteOperationWriter !== writer) return Promise.resolve();
      if (!writer.releasing) writer.releasing = (async () => {
        try {
          const budget = { ...request, deadline: Math.min(request.deadline ?? Infinity, Date.now() + REMOTE_OPERATION_LEASE_MS) };
          await withinRequestBudget(Promise.all([this.stateCommandTail, this.stateCommandReconciliation]), budget);
          if (this.pendingOwnershipWrite) await withinRequestBudget(this.pendingOwnershipWrite, budget);
        } catch { this.log.warn('[Command] Local ownership handoff deadline expired.'); }
        finally { writer.released = true; }
      })();
      return writer.releasing;
    };
  }

  private async writeRemoteOperationState(state: BlinkRemoteOperationOwnership): Promise<void> {
    const save = this.saveRemoteOperationState, generation = this.writerGeneration;
    const deadline = Date.now() + 1000;
    const degraded = (ownerGeneration: number) => {
      if (ownerGeneration !== this.writerGeneration) return;
      if (!this.ownershipPersistenceFailed) this.log.warn('[Command] Ownership journal unavailable; controls use bounded in-memory ownership.');
      this.ownershipPersistenceFailed = true;
    };
    if (!save) { degraded(generation); return; }
    this.queuedOwnershipWrite = { state, generation, save };
    this.pendingOwnershipWrite ??= Promise.resolve().then(async () => {
      try {
        while (this.queuedOwnershipWrite) {
          const next = this.queuedOwnershipWrite;
          this.queuedOwnershipWrite = undefined;
          if (next.generation !== this.writerGeneration) continue;
          try {
            // A caller timeout cannot cancel a file replacement; overlapping a newer save could let this stale write win later.
            await next.save(next.state);
            if (next.generation === this.writerGeneration) this.ownershipPersistenceFailed = false;
          } catch { degraded(next.generation); }
        }
      } finally { this.pendingOwnershipWrite = undefined; }
    });
    try { await withinRequestBudget(this.pendingOwnershipWrite, { deadline }); }
    catch { degraded(generation); }
  }

  /** Explicit recovery saves current memory through the same bounded, serialized journal writer. */
  async retryRemoteOperationPersistence(options: RequestOptions = {}): Promise<void> {
    const generation = this.writerGeneration, writer = this.remoteOperationWriter;
    const current = () => {
      checkRequestBudget(options);
      const identity = this.getCachedIdentity(), scope = writer?.scope;
      if (!writer || writer !== this.remoteOperationWriter || generation !== this.writerGeneration
        || (scope && (scope.accountId !== identity.accountId || scope.clientId !== identity.clientId || scope.tier !== identity.tier))) {
        throw new BlinkOperationNotStartedError('ownership-unavailable');
      }
    };
    current();
    this.expireOperationOwners();
    await withinRequestBudget(this.writeRemoteOperationState(this.remoteOperationSnapshot()), options);
    current();
    if (this.ownershipPersistenceFailed) throw new Error('Blink ownership journal unavailable.');
  }

  private assertOperationAuthority(kind: 'liveView' | 'stateCommand', reservationId: string, generation: number,
    accountId: number, cleared = false): void {
    const owner = kind === 'liveView' ? this.liveViewOwner : this.stateCommandOwner;
    if (generation !== this.writerGeneration || this.getCachedIdentity().accountId !== accountId
      || (cleared ? owner !== undefined : owner?.reservationId !== reservationId)) {
      throw new BlinkOperationNotStartedError('ownership-unavailable');
    }
  }

  private validateLiveViewOwner(owner: BlinkLiveViewOwnership): void {
    if (!owner || typeof owner !== 'object' || typeof owner.reservationId !== 'string' || !owner.reservationId ||
      !['camera', 'owl', 'doorbell'].includes(owner.kind) || !['starting', 'active', 'retiring', 'unresolved'].includes(owner.phase) ||
      typeof owner.retirementAcknowledged !== 'boolean') throw new Error('Invalid live view ownership.');
    requireRemoteId(owner.accountId); requireRemoteId(owner.networkId); requireRemoteId(owner.deviceId);
    if (owner.commandId !== undefined) requireRemoteId(owner.commandId);
    if (owner.expiresAt !== undefined && (!Number.isSafeInteger(owner.expiresAt) || owner.expiresAt < 0)) throw new Error('Invalid live view lease.');
  }

  private async persistLiveViewOwner(owner: BlinkLiveViewOwnership | undefined, expected?: string,
    generation = this.writerGeneration): Promise<boolean> {
    if (generation !== this.writerGeneration || (expected !== undefined && this.liveViewOwner?.reservationId !== expected)) return false;
    if (owner) this.validateLiveViewOwner(owner);
    this.liveViewOwner = owner ? { ...owner } : undefined;
    const revision = ++this.liveViewRevision;
    await this.writeRemoteOperationState(this.remoteOperationSnapshot());
    return generation === this.writerGeneration && revision === this.liveViewRevision;
  }

  private validateStateCommandOwner(owner: BlinkStateCommandOwnership): void {
    if (!owner || typeof owner !== 'object' || typeof owner.reservationId !== 'string' || !owner.reservationId
      || owner.reservationId.length > 256 || !['arm', 'disarm', 'motion', 'capture', 'quality', 'early-notification'].includes(owner.kind)
      || !['starting', 'accepted', 'unresolved'].includes(owner.phase)
      || !Number.isSafeInteger(owner.statusReads) || owner.statusReads < 0 || owner.statusReads > 60) {
      throw new Error('Invalid state command ownership.');
    }
    requireRemoteId(owner.accountId); requireRemoteId(owner.networkId);
    if (owner.deviceId !== undefined) requireRemoteId(owner.deviceId);
    if (owner.commandId !== undefined) requireRemoteId(owner.commandId);
    if (owner.expiresAt !== undefined && (!Number.isSafeInteger(owner.expiresAt) || owner.expiresAt < 0)) throw new Error('Invalid state command lease.');
    if ((owner.phase === 'accepted' && !owner.commandId) || (!owner.commandId && owner.statusReads !== 0)
      || (owner.phase === 'starting' && owner.commandId)) throw new Error('Invalid state command ownership.');
  }

  private async persistStateCommandOwner(owner: BlinkStateCommandOwnership | undefined, expected?: string,
    generation = this.writerGeneration): Promise<boolean> {
    if (generation !== this.writerGeneration || (expected !== undefined && this.stateCommandOwner?.reservationId !== expected)) return false;
    if (owner) this.validateStateCommandOwner(owner);
    this.stateCommandOwner = owner ? { ...owner } : undefined;
    const revision = ++this.stateCommandRevision;
    await this.writeRemoteOperationState(this.remoteOperationSnapshot());
    return generation === this.writerGeneration && revision === this.stateCommandRevision;
  }

  private async ownedStateCommand(kind: BlinkStateCommandOwnership['kind'], accountId: number, networkId: number,
    deviceId: number | undefined, send: (beforeDispatch: () => void) => Promise<BlinkCommandResponse>, options: CommandRequestOptions): Promise<BlinkCommandResponse> {
    options.beforeDispatch();
    const intent: BlinkStateCommandOwnership = { reservationId: randomUUID(), accountId, networkId, kind,
      phase: 'starting', statusReads: 0, expiresAt: Math.min(options.deadline ?? Infinity, Date.now() + REMOTE_OPERATION_LEASE_MS),
      ...(deviceId ? { deviceId } : {}) };
    const generation = options.generation;
    const current = () => {
      checkRequestBudget(options);
      if (generation !== this.writerGeneration || this.stateCommandOwner?.reservationId !== intent.reservationId
        || this.getCachedIdentity().accountId !== accountId) throw new BlinkOperationNotStartedError('ownership-unavailable');
    };
    this.stateCommandRunning = intent.reservationId;
    let dispatched = false;
    let acknowledged = false;
    let commandId: number | undefined;
    try {
      await this.persistStateCommandOwner(intent, undefined, generation);
      current();
      dispatched = true;
      const response = await send(current);
      acknowledged = options.mutationAcknowledged = true;
      commandId = requireRemoteId(response?.id ?? response?.command_id);
      current();
      await this.persistStateCommandOwner({ ...intent, phase: 'accepted', commandId }, intent.reservationId, generation);
      while (this.stateCommandOwner?.reservationId === intent.reservationId && this.stateCommandOwner.statusReads < 60) {
        current();
        const status = await this.readOwnedStateCommand(options);
        if (status !== undefined) {
          if (status !== 0) throw new Error(`Blink command failed with status ${status}.`);
          return response;
        }
        await budgetedDelay(1000, options);
      }
      throw new Error('Blink command status budget exhausted.');
    } catch (error) {
      const noSend = error instanceof Error && (error as Error & { dispatched?: boolean }).dispatched === false;
      if (generation === this.writerGeneration && this.stateCommandOwner?.reservationId === intent.reservationId) {
        if (!dispatched || (!acknowledged && (noSend || isBlinkPostRefusal(error)))) await this.persistStateCommandOwner(undefined, intent.reservationId, generation);
        else await this.persistStateCommandOwner({ ...this.stateCommandOwner, phase: 'unresolved',
          ...(commandId ? { commandId } : {}) }, intent.reservationId, generation);
      }
      throw error;
    } finally { if (this.stateCommandRunning === intent.reservationId) this.stateCommandRunning = undefined; }
  }

  /** One durable, no-retry status read. A local timeout is never remote completion. */
  private async readOwnedStateCommand(options: RequestOptions): Promise<number | undefined> {
    const owner = this.stateCommandOwner;
    const generation = this.writerGeneration;
    if (!owner?.commandId || owner.statusReads >= 60) throw new Error('No remaining owned command status budget.');
    checkRequestBudget(options);
    if (this.getCachedIdentity().accountId !== owner.accountId) throw new BlinkOperationNotStartedError('ownership-unavailable');
    await this.persistStateCommandOwner({ ...owner, statusReads: owner.statusReads + 1 }, owner.reservationId, generation);
    checkRequestBudget(options);
    const status = await withinRequestBudget(this.sharedRootHttp.get<{ complete?: unknown; status?: unknown }>(
      `accounts/${owner.accountId}/networks/${owner.networkId}/commands/${owner.commandId}`,
      { ...options, retry: false, responseKind: 'command', maxResponseBytes: 256 * 1024, beforeDispatch: () =>
        this.assertOperationAuthority('stateCommand', owner.reservationId, generation, owner.accountId) }), options);
    this.assertOperationAuthority('stateCommand', owner.reservationId, generation, owner.accountId);
    if (typeof status?.complete !== 'boolean' || typeof status.status !== 'number' || !Number.isSafeInteger(status.status)) {
      throw new Error('Blink command returned invalid terminal evidence.');
    }
    if (!status.complete) return undefined;
    if (!await this.persistStateCommandOwner(undefined, owner.reservationId, generation)) {
      throw new BlinkOperationNotStartedError('ownership-unavailable');
    }
    checkRequestBudget(options);
    this.assertOperationAuthority('stateCommand', owner.reservationId, generation, owner.accountId, true);
    return status.status;
  }

  /** Explicit recovery performs at most one GET for a known ordinary command; it never resends its POST. */
  async reconcileKnownStateCommand(options: RequestOptions = {}):
    Promise<{ commandId?: number; confirmed: boolean; remoteStatus?: number }> {
    this.expireOperationOwners();
    const owner = this.stateCommandOwner;
    if (!owner) return { confirmed: true };
    if (!owner.commandId || owner.statusReads >= 60 || this.stateCommandRunning || this.reconcilingStateCommand
      ) return { commandId: owner.commandId, confirmed: false };
    this.reconcilingStateCommand = true;
    let settled!: () => void;
    this.stateCommandReconciliation = new Promise<void>(resolve => { settled = resolve; });
    try {
      const remoteStatus = await this.readOwnedStateCommand({ ...options,
        deadline: Math.min(options.deadline ?? Infinity, Date.now() + 10_000) });
      return { commandId: owner.commandId, confirmed: remoteStatus !== undefined,
        ...(remoteStatus !== undefined ? { remoteStatus } : {}) };
    } catch { return { commandId: owner.commandId, confirmed: false }; }
    finally { this.reconcilingStateCommand = false; settled(); this.stateCommandReconciliation = undefined; }
  }

  getRemoteOperationState(): { storage: Omit<NativeStorageFence, 'clip'>[];
    liveView?: BlinkLiveViewOwnership; stateCommand?: BlinkStateCommandOwnership; persistenceFailed: boolean;
    abandoned?: BlinkAbandonedOperation[] } {
    this.expireOperationOwners();
    return { storage: [...this.nativeStorageFences.values()].map(fence => ({ accountId: fence.accountId,
      networkId: fence.networkId, syncModuleId: fence.syncModuleId, operationId: fence.operationId,
      kind: fence.kind, phase: fence.phase, expiresAt: fence.expiresAt, ...(fence.commandId ? { commandId: fence.commandId } : {}) })),
      ...(this.liveViewOwner ? { liveView: { ...this.liveViewOwner } } : {}),
      ...(this.stateCommandOwner ? { stateCommand: { ...this.stateCommandOwner } } : {}), persistenceFailed: this.ownershipPersistenceFailed,
      ...(this.abandonedOperations.length ? { abandoned: this.abandonedOperations.map(owner => ({ ...owner })) } : {}) };
  }

  /** Cached authenticated metadata only; this method never verifies against Blink. */
  getCachedIdentity(): { accountId: number | null; clientId: number | null; tier: string; sharedTier: string } {
    const tier = normalizeBlinkTier(this.config.tier) ?? 'prod';
    return { accountId: this.auth.getAccountId() ?? this.accountId, clientId: this.auth.getClientId() ?? this.clientId,
      tier, sharedTier: normalizeBlinkTier(this.config.sharedTier) ?? tier };
  }

  async registerMotionNotificationKey(token: string | null, metadata: BlinkMotionClientMetadata,
    options: RequestOptions = {}): Promise<void> {
    if (token !== null && (typeof token !== 'string' || !token || token.length > 8192 || /\s/.test(token))) {
      throw new Error('Invalid motion notification token.');
    }
    for (const value of [metadata.appVersion, metadata.osVersion, metadata.clientName]) {
      if (typeof value !== 'string' || !value || value.length > 256) throw new Error('Invalid motion client metadata.');
    }
    checkRequestBudget(options);
    const expected = this.getCachedIdentity();
    requireRemoteId(expected.accountId); requireRemoteId(expected.clientId);
    const checkScope = () => {
      const current = this.getCachedIdentity();
      if (current.accountId !== expected.accountId || current.clientId !== expected.clientId || current.tier !== expected.tier) {
        throw new BlinkOperationNotStartedError('ownership-unavailable');
      }
    };
    await withinRequestBudget(this.syncPersistedTierToConfig(), options);
    checkScope();
    await this.regionalRootHttp.post<void>(`clients/${expected.clientId}/update`, {
      app_version: metadata.appVersion, os_version: metadata.osVersion, client_name: metadata.clientName, notification_key: token,
    }, [], { ...options, retry: false, responseType: 'void', beforeDispatch: checkScope });
  }

  createNativeStorageTransport(options: { scope: NativeStorageScope; directory: string }): NativeStorageTransport {
    const scope = { ...options.scope };
    this.nativeScopeKey(scope);
    if (!path.isAbsolute(options.directory)) throw new Error('Native media storage must be an absolute private path.');
    const directory = path.resolve(options.directory);
    const validate = (location: string) => this.validateNativeMediaUrl(location, scope);
    return {
      validateMediaUrl: validate,
      postEmpty: async (route, request) => {
        const checked = this.nativeRoute(route, scope, 'POST');
        const reservation = this.activeNativeAdmission;
        const fence = this.nativeStorageFences.get(this.nativeScopeKey(scope));
        if (!reservation || !isRemoteOperationLeaseActive(reservation.expiresAt) || this.nativeScopeKey(reservation.scope) !== this.nativeScopeKey(scope) ||
          !reservation.canPost || !fence || fence.operationId !== reservation.operationId || fence.phase !== 'intent') {
          throw new BlinkOperationNotStartedError('storage-pending');
        }
        this.assertCommandAdmission({ kind: 'storage', scope, operationId: reservation.operationId });
        if (fence.clip?.mediaUrl) this.validateNativeMediaUrl(fence.clip.mediaUrl, scope, fence.clip);
        const expected = fence.kind === 'catalog' ? `${this.nativeModulePath(scope)}/manifest/request` :
          `${this.nativeModulePath(scope)}/manifest/${fence.clip?.manifestId}/clip/request/${fence.clip?.clipId}`;
        if (checked.path.split('?')[0].replace(/\/$/, '') !== expected) throw new BlinkOperationNotStartedError('invalid-native-route');
        checkRequestBudget(request);
        reservation.canPost = false;
        return checked.http.post(checked.path, undefined, [], { ...this.nativeHttpOptions(request, 'command'), beforeDispatch: () => {
          this.requireNativeAccount(scope);
          checkRequestBudget(request);
          if (this.activeNativeAdmission !== reservation || !isRemoteOperationLeaseActive(reservation.expiresAt)) {
            throw new BlinkOperationNotStartedError('storage-pending');
          }
          this.assertCommandAdmission({ kind: 'storage', scope, operationId: reservation.operationId });
        } });
      },
      getJson: async (route, request) => {
        const checked = this.nativeRoute(route, scope, 'GET');
        return checked.http.get(checked.path, { ...this.nativeHttpOptions(request, route.base === 'api' ? 'native-catalog' : 'command'),
          beforeDispatch: () => this.requireNativeAccount(scope) });
      },
      downloadMedia: async (location, request) => {
        const reservation = this.activeNativeAdmission;
        const fence = this.nativeStorageFences.get(this.nativeScopeKey(scope));
        if (!reservation || !isRemoteOperationLeaseActive(reservation.expiresAt) || this.nativeScopeKey(reservation.scope) !== this.nativeScopeKey(scope) ||
          !fence || fence.operationId !== reservation.operationId || fence.phase !== 'prepared' || !fence.clip) {
          throw new BlinkOperationNotStartedError('storage-pending');
        }
        this.assertCommandAdmission({ kind: 'storage', scope, operationId: reservation.operationId });
        const checked = new URL(this.validateNativeMediaUrl(location, scope, fence.clip));
        return this.downloadNativeMedia(checked.pathname.slice(1) + checked.search, directory, request);
      },
    };
  }

  private nativeHttpOptions(options: NativeStorageRequestOptions, responseKind: 'command' | 'native-catalog'): BlinkHttpRequestOptions {
    return { ...options, retry: false, maxResponseBytes: options.maxBytes, responseKind };
  }

  private requireNativeAccount(scope: NativeStorageScope): void {
    const current = this.getCachedIdentity().accountId;
    if (current !== scope.accountId) throw new BlinkOperationNotStartedError('ownership-unavailable');
  }

  private nativeModulePath(scope: NativeStorageScope): string {
    return `v1/accounts/${scope.accountId}/networks/${scope.networkId}/sync_modules/${scope.syncModuleId}/local_storage`;
  }

  private nativeRoute(route: NativeStorageRoute, scope: NativeStorageScope, method: 'GET' | 'POST'):
    { http: BlinkHttp; path: string } {
    this.requireNativeAccount(scope);
    if (!['api', 'root'].includes(route.base) || typeof route.path !== 'string' || route.path.length > 8192 ||
      route.path.startsWith('//') || /[\\#]/.test(route.path) || route.path.includes('://')) {
      throw new BlinkOperationNotStartedError('invalid-native-route');
    }
    const clean = route.path.startsWith('/') ? route.path.slice(1) : route.path;
    const pathname = clean.split('?')[0];
    const id = '([1-9][0-9]*)';
    const prefix = this.nativeModulePath(scope);
    let captures: RegExpMatchArray | null;
    if (route.base === 'root' && method === 'GET') {
      captures = pathname.match(new RegExp(`^accounts/${scope.accountId}/networks/${scope.networkId}/commands/${id}$`));
    } else if (route.base === 'api' && method === 'GET') {
      captures = pathname.match(new RegExp(`^${prefix}/media/${id}$`));
    } else if (route.base === 'api' && method === 'POST') {
      if (pathname === `${prefix}/manifest/request`) captures = [pathname] as RegExpMatchArray;
      else captures = pathname.match(new RegExp(`^${prefix}/manifest/${id}/clip/request/${id}/?$`));
    } else captures = null;
    if (!captures) throw new BlinkOperationNotStartedError('invalid-native-route');
    for (const value of captures.slice(1)) requireRemoteId(Number(value));
    return { http: route.base === 'api' ? this.sharedHttp : this.sharedRootHttp, path: clean };
  }

  private validateNativeMediaUrl(location: string, scope: NativeStorageScope,
    expected?: { manifestId: number; clipId: number }): string {
    this.requireNativeAccount(scope);
    if (typeof location !== 'string' || !location || location.length > 8192 || /[\s\\]/.test(location)) {
      throw new BlinkOperationNotStartedError('invalid-native-route');
    }
    const base = new URL(getSharedRestRootUrl(this.config));
    let url: URL;
    try { url = new URL(location, base); }
    catch { throw new BlinkOperationNotStartedError('invalid-native-route'); }
    const matches = url.pathname.match(new RegExp(`^/api/${this.nativeModulePath(scope)}/manifest/([1-9][0-9]*)/clip/request/([1-9][0-9]*)/?$`));
    if (url.protocol !== 'https:' || url.origin !== base.origin || url.username || url.password || url.hash || !matches) {
      throw new BlinkOperationNotStartedError('invalid-native-route');
    }
    const manifestId = requireRemoteId(Number(matches[1])), clipId = requireRemoteId(Number(matches[2]));
    if (expected && (manifestId !== expected.manifestId || clipId !== expected.clipId)) {
      throw new BlinkOperationNotStartedError('invalid-native-route');
    }
    return url.toString();
  }

  private async downloadNativeMedia(resourcePath: string, directory: string,
    options: NativeStorageRequestOptions): Promise<{ reference: string; bytes: number; sha256: string }> {
    checkRequestBudget(options);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const directoryStat = await fs.lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() ||
      (typeof process.getuid === 'function' && ((directoryStat.mode & 0o077) !== 0 || directoryStat.uid !== process.getuid()))) {
      throw new Error('Native media directory is not privately owned.');
    }
    const realDirectory = await fs.realpath(directory);
    const identity = randomUUID();
    const temporary = path.join(realDirectory, `.native-${identity}.partial`);
    const target = path.join(realDirectory, `native-${identity}.mp4`);
    const bytes = await this.sharedRootHttp.getBinary(resourcePath, { ...options, retry: false,
      maxResponseBytes: Math.min(options.maxBytes, 32 * 1024 * 1024) });
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    let promoted = false;
    try {
      checkRequestBudget(options);
      if (!bytes.byteLength) throw new Error('Native media response is empty.');
      handle = await fs.open(temporary, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
      await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = undefined;
      checkRequestBudget(options);
      // link is an atomic, no-overwrite promotion on the same filesystem.
      await fs.link(temporary, target); promoted = true;
      await removeOwnerOnlyFile(temporary);
      if (process.platform !== 'win32') {
        const parent = await fs.open(realDirectory, fsConstants.O_RDONLY);
        try { await parent.sync(); } finally { await parent.close(); }
      }
      return { reference: target, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await removeOwnerOnlyFile(temporary).catch(() => undefined);
      if (promoted) await removeOwnerOnlyFile(target).catch(() => undefined);
      throw error;
    } finally { bytes.fill(0); }
  }

  private async networkReachedState(networkId: number, armed: boolean, options: RequestOptions): Promise<boolean> {
    try {
      const homescreen = await this.getHomescreen(options);
      return homescreen.networks.some(network => network.id === networkId && network.armed === armed);
    } catch {
      checkRequestBudget(options);
      return false;
    }
  }

  private async motionReachedState(type: 'camera' | 'owl' | 'doorbell', networkId: number, deviceId: number,
    enabled: boolean, options: RequestOptions): Promise<ConflictResolution<void>> {
    try {
      const homescreen = await this.getHomescreen(options);
      const devices = type === 'camera' ? homescreen.cameras : type === 'owl' ? homescreen.owls : homescreen.doorbells;
      return { resolved: devices.some(device => device.id === deviceId && device.network_id === networkId && device.enabled === enabled) };
    } catch {
      checkRequestBudget(options);
      return { resolved: false };
    }
  }

  getSharedRestRootUrl(): string {
    return getSharedRestRootUrl(this.config);
  }

  /**
   * Get authentication headers for external requests (e.g., thumbnail image fetches).
   * Includes Bearer token and TOKEN-AUTH header if available.
   */
  getAuthHeaders(): Record<string, string> {
    return this.auth.getAuthHeaders();
  }

  async beginHostedLogin(): Promise<BlinkHostedOAuthStart> {
    return this.auth.beginHostedLogin();
  }

  async completeHostedLogin(
    flowId: string,
    callbackUrl: string,
  ): Promise<BlinkHostedLoginResult> {
    await this.auth.completeHostedLogin(flowId, callbackUrl);
    this.accountId = this.auth.getAccountId();
    this.clientId = this.auth.getClientId();

    try {
      await this.syncAccountInfoAndVerify({
        useProductionBootstrap: true,
        strictAccountInfo: true,
        persistMetadata: false,
      });
      const homescreen = await this.getHomescreen();
      await this.auth.persistCurrentState();
      return {
        authenticated: true,
        verified: true,
        ...this.buildHostedResultMetadata(),
        networkCount: homescreen.networks?.length ?? 0,
        cameraCount: homescreen.cameras?.length ?? 0,
      };
    } catch (error) {
      await this.auth.persistCurrentState();
      return this.buildUnverifiedHostedResult(error);
    }
  }

  async cancelHostedLogin(): Promise<void> {
    await this.auth.cancelHostedLogin();
  }

  private buildHostedResultMetadata(): Partial<Pick<
    BlinkHostedLoginResult,
    'accountId' | 'clientId' | 'email' | 'tier'
  >> {
    const metadata: Partial<Pick<
      BlinkHostedLoginResult,
      'accountId' | 'clientId' | 'email' | 'tier'
    >> = {};
    if (this.accountId !== null) metadata.accountId = this.accountId;
    if (this.clientId !== null) metadata.clientId = this.clientId;
    if (this.config.email) metadata.email = this.config.email;
    const tier = this.auth.getTier();
    if (tier) metadata.tier = tier;
    return metadata;
  }

  private buildUnverifiedHostedResult(error: unknown): BlinkHostedLoginResult {
    return {
      authenticated: true,
      verified: false,
      verificationRequirement: error instanceof BlinkRestVerificationRequiredError
        ? error.type
        : 'connection',
      ...this.buildHostedResultMetadata(),
      networkCount: 0,
      cameraCount: 0,
    };
  }

  /**
   * Authenticate with Blink API using OAuth 2.0 Authorization Code Flow with PKCE
   * 
   * @param twoFaCode - Optional 2FA code (if provided, will be used to complete pending 2FA)
   * @throws Blink2FARequiredError if 2FA is required but no code provided
   */
  async login(twoFaCode?: string): Promise<void> {
    this.logDebug('login → syncing persisted tier to config');
    await this.syncPersistedTierToConfig();

    // When auth is locked, skip 2FA/verification code auto-submission
    const effectiveTwoFaCode = this.config.authLocked ? undefined : (twoFaCode ?? this.config.twoFactorCode);

    if (effectiveTwoFaCode && this.auth.is2FAPending()) {
      this.logDebug('login → 2FA pending, completing with provided code');
      await this.auth.complete2FA(effectiveTwoFaCode);
    } else {
      if (this.config.authLocked && (twoFaCode ?? this.config.twoFactorCode)) {
        this.logDebug('login → authLocked=true, ignoring stored 2FA/verification codes');
      }
      this.logDebug('login → ensuring valid token');
      await this.auth.ensureValidToken();
    }
    this.accountId = this.auth.getAccountId();
    this.clientId = this.auth.getClientId();
    this.logDebug('login → authenticated; account/client metadata loaded');
    await this.syncAccountInfoAndVerify();
  }

  /**
   * Sync persisted tier from auth storage to config and update base URLs.
   * Called before any HTTP requests to ensure correct region routing.
   */
  private async syncPersistedTierToConfig(): Promise<void> {
    const persistedTier = await this.auth.getPersistedTier();
    this.logDebug(`syncPersistedTierToConfig → persisted tier: ${persistedTier ?? 'none'}, current: ${this.config.tier ?? 'prod'}`);
    if (persistedTier && persistedTier !== this.config.tier) {
      const previousTier = this.config.tier ?? 'prod';
      this.config.tier = persistedTier;
      if (!this.config.sharedTier || this.config.sharedTier === previousTier) {
        this.config.sharedTier = persistedTier;
      }
      this.updateBaseUrls();
      this.logDebug(`syncPersistedTierToConfig → updated tier ${previousTier} → ${persistedTier}`);
      this.config.logger?.info(`Restored persisted tier: ${persistedTier} (was ${previousTier})`);
    }
  }

  /**
   * Complete 2FA verification (call after login() throws Blink2FARequiredError)
   * 
   * @param pin - The 2FA PIN received via email/SMS
   */
  async complete2FA(pin: string): Promise<void> {
    await this.auth.complete2FA(pin);
    this.accountId = this.auth.getAccountId();
    this.clientId = this.auth.getClientId();
    await this.syncAccountInfoAndVerify();
  }

  /**
   * Fetch account info and handle any first-time verification requirements.
   */
  private async syncAccountInfoAndVerify(options: {
    useProductionBootstrap?: boolean;
    strictAccountInfo?: boolean;
    persistMetadata?: boolean;
  } = {}): Promise<void> {
    this.logDebug('syncAccountInfoAndVerify → syncing tier info');
    const tierInfo = await this.syncTierInfo(options.useProductionBootstrap ?? false);
    let discoveredTier = tierInfo?.tier ? normalizeBlinkTier(tierInfo.tier) : null;
    if (tierInfo?.account_id) {
      this.accountId = requireRemoteId(tierInfo.account_id);
    }

    this.logDebug('syncAccountInfoAndVerify → fetching account info');
    let accountInfo: BlinkAccountInfo | null = null;
    try {
      accountInfo = await this.getAccountInfo();
      this.logDebug('syncAccountInfoAndVerify → account info received');
    } catch (error) {
      if (options.strictAccountInfo) {
        throw error;
      }
      this.logDebug('syncAccountInfoAndVerify → account info fetch failed');
      this.config.logger?.warn(
        'Failed to fetch Blink account info. Continuing with fallback tier info.',
      );
    }

    if (accountInfo) {
      this.accountId = accountInfo.account_id ?? this.accountId;
      this.clientId = accountInfo.client_id ?? this.clientId;
      if (!discoveredTier && accountInfo.tier) {
        try {
          discoveredTier = normalizeBlinkTier(accountInfo.tier);
          if (!discoveredTier) {
            throw new Error('Invalid Blink account tier');
          }
          this.applyTier(discoveredTier);
        } catch {
          discoveredTier = null;
          this.config.logger?.warn(
            'Blink account info returned an invalid tier. Continuing with the bootstrap tier.',
          );
        }
      }
    }

    this.auth.setAccountMetadata({
      accountId: this.accountId,
      clientId: this.clientId,
      region: accountInfo?.region,
      tier: discoveredTier
        ?? (options.useProductionBootstrap ? undefined : this.config.tier ?? 'prod'),
      email: accountInfo?.email,
    });

    if (accountInfo?.client_verification_required) {
      this.logDebug('syncAccountInfoAndVerify → client verification required');
      await this.handleClientVerification(accountInfo);
    }

    if (accountInfo?.phone_verification_required || accountInfo?.account_verification_required) {
      this.logDebug('syncAccountInfoAndVerify → account/phone verification required');
      await this.handleAccountVerification(accountInfo);
    }
    if (options.persistMetadata ?? true) {
      await this.auth.persistCurrentState();
    }
    this.logDebug('syncAccountInfoAndVerify → complete');
  }

  private async handleClientVerification(accountInfo: BlinkAccountInfo): Promise<void> {
    const log = this.config.logger;
    const code = this.config.authLocked ? undefined : this.config.clientVerificationCode;

    if (this.config.authLocked && this.config.clientVerificationCode) {
      this.logDebug('handleClientVerification → authLocked=true, ignoring stored clientVerificationCode');
    }

    if (!code) {
      await this.requestClientVerificationPin();
      log?.warn('Blink client verification required. A verification code has been sent.');
      log?.warn('Add "clientVerificationCode" to your Homebridge config and restart.');
      throw new BlinkRestVerificationRequiredError('client');
    }

    const trustDevice = this.config.trustDevice ?? true;
    const trustDeviceEnabled = accountInfo.trust_device_enabled ?? true;
    await this.verifyClientVerificationPin(code, trustDeviceEnabled, trustDevice);
    log?.info('Blink client verification successful.');
  }

  private async handleAccountVerification(accountInfo: BlinkAccountInfo): Promise<void> {
    const log = this.config.logger;
    const code = this.config.authLocked ? undefined : this.config.accountVerificationCode;
    const requiredLabels: string[] = [];

    if (this.config.authLocked && this.config.accountVerificationCode) {
      this.logDebug('handleAccountVerification → authLocked=true, ignoring stored accountVerificationCode');
    }
    if (accountInfo.phone_verification_required) {
      requiredLabels.push('phone');
    }
    if (accountInfo.account_verification_required) {
      requiredLabels.push('account');
    }
    const requirement = requiredLabels.length > 0 ? requiredLabels.join(' & ') : 'account';

    if (!code) {
      const response = await this.requestAccountVerificationPin();
      const channel = response.phone_verification_channel ?? response.verification_channel;
      if (channel) {
        log?.warn(`Blink verification code sent via ${channel}.`);
      }
      log?.warn(`Blink requires ${requirement} verification (phone/email).`);
      log?.warn('Add "accountVerificationCode" to your Homebridge config and restart.');
      throw new BlinkRestVerificationRequiredError('account');
    }

    const response = await this.verifyAccountVerificationPin(code);
    if (!response.valid) {
      log?.warn('Blink account verification failed. Request a new code and try again.');
      throw new BlinkRestVerificationRequiredError(
        'account',
        'Blink account verification failed',
      );
    }
    if (response.require_new_pin) {
      log?.warn('Blink requires a new verification PIN. Request another code and retry.');
      throw new BlinkRestVerificationRequiredError(
        'account',
        'Blink account verification requires a new PIN',
      );
    }

    log?.info('Blink account verification successful.');
  }

  private updateBaseUrls(): void {
    this.http.setBaseUrl(getRestBaseUrl(this.config));
    this.sharedHttp.setBaseUrl(getSharedRestBaseUrl(this.config));
    this.sharedRootHttp.setBaseUrl(getSharedRestRootUrl(this.config));
    this.regionalRootHttp.setBaseUrl(getRestRootUrl(this.config));
  }

  private applyTier(tier: string): void {
    const previousTier = this.config.tier ?? 'prod';
    const previousSharedTier = this.config.sharedTier;
    this.config.tier = tier;
    if (!previousSharedTier || previousSharedTier === previousTier) {
      this.config.sharedTier = tier;
    }
    this.updateBaseUrls();
    if (tier !== previousTier) {
      this.config.logger?.info(`Blink tier updated from ${previousTier} to ${tier}.`);
    }
  }

  private async syncTierInfo(useProductionBootstrap: boolean): Promise<BlinkTierInfo | null> {
    const log = this.config.logger;
    const configuredTier = normalizeBlinkTier(this.config.tier) ?? 'prod';
    const usesOrdinaryProductionTier = BLINK_PRODUCTION_BOOTSTRAP_TIERS.some(
      (tier) => tier === configuredTier,
    );
    const bootstrapTiers = useProductionBootstrap
      ? usesOrdinaryProductionTier
        ? BLINK_PRODUCTION_BOOTSTRAP_TIERS
        : [configuredTier]
      : [configuredTier];

    for (const [index, bootstrapTier] of bootstrapTiers.entries()) {
      if (useProductionBootstrap) {
        this.applyTier(bootstrapTier);
      }
      try {
        const tierInfo = await this.getTierInfo();
        this.logDebug('syncTierInfo → received tier info');
        if (!tierInfo?.tier) {
          return tierInfo ?? null;
        }
        const normalizedTier = normalizeBlinkTier(tierInfo.tier);
        if (!normalizedTier) {
          return tierInfo ?? null;
        }
        this.applyTier(normalizedTier);
        this.auth.setAccountMetadata({
          accountId: tierInfo.account_id,
          tier: normalizedTier,
        });
        return tierInfo;
      } catch (error) {
        const hasAnotherProductionRegion = useProductionBootstrap
          && index < bootstrapTiers.length - 1;
        if (
          hasAnotherProductionRegion
          && error instanceof BlinkHttpError
          && error.status === 406
        ) {
          this.logDebug('syncTierInfo → production-region bootstrap rejected; trying next');
          continue;
        }
        log?.warn('Failed to fetch Blink tier info. Continuing with the bootstrap tier.');
        return null;
      }
    }

    return null;
  }

  /**
   * Get account info with verification flags.
   * Source: API Dossier Section 3.9 - GET v2/users/info
   */
  async getAccountInfo(): Promise<BlinkAccountInfo> {
    await this.auth.ensureValidToken();
    const info = await this.http.get<BlinkAccountInfo>('v2/users/info');
    if (!info || typeof info !== 'object') throw new Error('Blink returned invalid account metadata.');
    if (info.account_id !== undefined) requireRemoteId(info.account_id);
    if (info.client_id !== undefined) requireRemoteId(info.client_id);
    if (info?.account_id) {
      this.accountId = info.account_id;
    }
    if (info?.client_id) {
      this.clientId = info.client_id;
    }
    return info;
  }

  /**
   * Get tier info for the current account.
   * Source: API Dossier Section 3.9 - GET v1/users/tier_info
   */
  async getTierInfo(): Promise<BlinkTierInfo> {
    await this.auth.ensureValidToken();
    return this.http.get<BlinkTierInfo>('v1/users/tier_info');
  }

  /**
   * Trigger account/phone verification PIN resend.
   */
  async requestAccountVerificationPin(): Promise<BlinkGeneratePinResponse> {
    return this.http.post<BlinkGeneratePinResponse>('v4/users/pin/resend');
  }

  /**
   * Verify account/phone verification PIN.
   */
  async verifyAccountVerificationPin(pin: string): Promise<BlinkVerifyPinResponse> {
    return this.http.post<BlinkVerifyPinResponse>('v4/users/pin/verify', {
      pin,
      email: this.config.email,
      device_identifier: this.config.hardwareId,
      client_name: this.config.clientName ?? 'homebridge-blink',
    });
  }

  /**
   * Trigger a client verification PIN email/SMS.
   */
  async requestClientVerificationPin(): Promise<BlinkResendPinResponse> {
    const clientId = await this.ensureClientId();
    return this.http.post<BlinkResendPinResponse>(`v5/clients/${clientId}/client_verification/pin/resend`);
  }

  /**
   * Verify client verification PIN and optionally trust this device.
   */
  async verifyClientVerificationPin(
    pin: string,
    trustDeviceEnabled = true,
    trustDevice = true,
  ): Promise<BlinkPinVerificationResponse> {
    const clientId = await this.ensureClientId();
    if (trustDeviceEnabled) {
      return this.http.post<BlinkPinVerificationResponse>(`v5/clients/${clientId}/client_verification/pin/verify`, {
        pin,
        trusted: trustDevice,
      });
    }

    return this.http.post<BlinkPinVerificationResponse>(`v4/clients/${clientId}/pin/verify`, {
      pin,
      email: this.config.email,
      device_identifier: this.config.hardwareId,
      client_name: this.config.clientName ?? 'homebridge-blink',
    });
  }

  /**
   * Get homescreen data with all devices
   * Source: API Dossier Section 3.9 - GET v4/accounts/{account_id}/homescreen
   * Evidence: smali_classes10/com/immediasemi/blink/utils/sync/HomeScreenApi.smali
   */
  async getHomescreen(options?: RequestOptions & { retryTransient?: boolean }): Promise<BlinkHomescreen> {
    checkRequestBudget(options);
    await withinRequestBudget(this.auth.ensureValidToken(), options);
    checkRequestBudget(options);
    this.accountId = this.accountId ?? this.auth.getAccountId();
    const accountId = await withinRequestBudget(this.ensureAccountId(), options);
    for (let attempt = 0; ; attempt++) {
      checkRequestBudget(options);
      try {
        const path = `v4/accounts/${accountId}/homescreen`;
        const homescreen = await withinRequestBudget(options
          ? this.sharedHttp.get<BlinkHomescreen>(path, options)
          : this.sharedHttp.get<BlinkHomescreen>(path), options);
        validateHomescreen(homescreen);
        this.accountId = homescreen.account?.account_id ?? accountId;
        return homescreen;
      } catch (error) {
        const transientCodes = ['UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'UND_ERR_SOCKET'];
        if (attempt !== 0 || !options?.retryTransient || !(error instanceof BlinkHttpError)
          || error.failure !== 'network' || !transientCodes.includes(error.networkDiagnostic?.code ?? '')) throw error;
        await budgetedDelay(500 + Math.floor(Math.random() * 501), options);
      }
    }
  }

  /**
   * Arm a network (enable motion detection for all devices)
   * Source: API Dossier Section 3.7 - POST v1/accounts/{account_id}/networks/{networkId}/state/arm
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/network/NetworkApi.smali
   */
  async armNetwork(networkId: number, options?: RequestOptions): Promise<BlinkCommandResponse> {
    requireRemoteId(networkId);
    return this.queueStateCommand('Network', async execution => {
      const accountId = await withinRequestBudget(this.ensureAccountId(), execution);
      return this.ownedStateCommand('arm', accountId, networkId, undefined, beforeDispatch => this.sharedHttp.post<BlinkCommandResponse>(
        `v1/accounts/${accountId}/networks/${networkId}/state/arm`, undefined, [409], { ...execution, retry: false, beforeDispatch }), execution);
    }, [1000, 2000, 4000], async execution => ({ resolved: await this.networkReachedState(networkId, true, execution), value: {} }), options);
  }

  /**
   * Disarm a network (disable motion detection for all devices)
   * Source: API Dossier Section 3.7 - POST v1/accounts/{account_id}/networks/{network_id}/state/disarm
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/network/NetworkApi.smali
   */
  async disarmNetwork(networkId: number, options?: RequestOptions): Promise<BlinkCommandResponse> {
    requireRemoteId(networkId);
    return this.queueStateCommand('Network', async execution => {
      const accountId = await withinRequestBudget(this.ensureAccountId(), execution);
      return this.ownedStateCommand('disarm', accountId, networkId, undefined, beforeDispatch => this.sharedHttp.post<BlinkCommandResponse>(
        `v1/accounts/${accountId}/networks/${networkId}/state/disarm`, undefined, [409], { ...execution, retry: false, beforeDispatch }), execution);
    }, [1000, 2000, 4000], async execution => ({ resolved: await this.networkReachedState(networkId, false, execution), value: {} }), options);
  }

  /** Config endpoints and quality wire values recovered from Blink Android 59.2. */
  private deviceConfigPath(type: BlinkCameraKind, accountId: number, networkId: number, deviceId: number): string {
    if (type !== 'camera' && type !== 'owl' && type !== 'doorbell') throw new Error('Invalid Blink camera kind.');
    const kind = type === 'camera' ? 'cameras' : type === 'owl' ? 'owls' : 'doorbells';
    return `v${type === 'camera' ? 2 : 1}/accounts/${accountId}/networks/${networkId}/${kind}/${deviceId}/config`;
  }

  private async getDeviceConfig(type: BlinkCameraKind, networkId: number, deviceId: number,
    options: RequestOptions): Promise<unknown> {
    requireRemoteId(networkId);
    requireRemoteId(deviceId);
    // Validate the kind before authentication, alongside the path identifiers.
    this.deviceConfigPath(type, 1, networkId, deviceId);
    const accountId = await withinRequestBudget(this.ensureAccountId(), options);
    checkRequestBudget(options);
    return this.sharedHttp.get<unknown>(this.deviceConfigPath(type, accountId, networkId, deviceId), options);
  }

  /** Read cached server-side metadata; never wake or calibrate the camera. */
  async getCameraTemperature(networkId: number, deviceId: number, options: RequestOptions = {}): Promise<number | undefined> {
    return validateCameraTemperature(await this.getDeviceConfig('camera', networkId, deviceId, options));
  }

  async getDeviceVideoQuality(type: BlinkCameraKind, networkId: number, deviceId: number,
    options: RequestOptions = {}): Promise<BlinkVideoQualityState> {
    return validateVideoQualityState(await this.getDeviceConfig(type, networkId, deviceId, options), type);
  }

  private async readDeviceEarlyNotification(type: BlinkCameraKind, networkId: number, deviceId: number,
    rawType: unknown, options: RequestOptions): Promise<BlinkEarlyNotificationState> {
    if (!supportsEarlyNotificationControl(rawType)) return { supported: false, changed: false };
    const observed = validateEarlyNotificationState(await this.getDeviceConfig(type, networkId, deviceId, options), type);
    return { supported: observed.compatible, compatible: observed.compatible, changed: false,
      ...(observed.compatible ? { current: observed.current } : {}) };
  }

  /** Read fresh vendor state in the same account queue as mutations. */
  async getDeviceEarlyNotification(type: BlinkCameraKind, networkId: number, deviceId: number,
    rawType: unknown, options: RequestOptions = {}): Promise<BlinkEarlyNotificationState> {
    requireRemoteId(networkId); requireRemoteId(deviceId);
    this.deviceConfigPath(type, 1, networkId, deviceId);
    return this.queueStateCommand('EarlyNotification', execution =>
      this.readDeviceEarlyNotification(type, networkId, deviceId, rawType, execution), [], undefined, options);
  }

  /** One owned config mutation; a durable original can be committed before its POST. */
  async setDeviceEarlyNotification(type: BlinkCameraKind, networkId: number, deviceId: number,
    rawType: unknown, enabled: boolean, options: BlinkEarlyNotificationOptions = {}): Promise<BlinkEarlyNotificationState> {
    requireRemoteId(networkId); requireRemoteId(deviceId);
    this.deviceConfigPath(type, 1, networkId, deviceId);
    if (typeof enabled !== 'boolean' || (options.expectedCurrent !== undefined && typeof options.expectedCurrent !== 'boolean')) {
      throw new Error('Invalid Blink Early Notification setting.');
    }
    const { beforeChange, expectedCurrent, ...requestOptions } = options;
    return this.queueStateCommand('EarlyNotification', async execution => {
      const current = await this.readDeviceEarlyNotification(type, networkId, deviceId, rawType, execution);
      if (!current.supported || typeof current.current !== 'boolean' || current.current === enabled
        || (expectedCurrent !== undefined && current.current !== expectedCurrent)) return current;
      await beforeChange?.(current.current);
      const accountId = await withinRequestBudget(this.ensureAccountId(), execution);
      checkRequestBudget(execution);
      await this.ownedStateCommand('early-notification', accountId, networkId, deviceId,
        beforeDispatch => this.sharedHttp.post<BlinkCommandResponse>(this.deviceConfigPath(type, accountId, networkId, deviceId),
          { early_notification: enabled }, [409], { ...execution, retry: false, beforeDispatch }), execution);
      const observed = await this.readDeviceEarlyNotification(type, networkId, deviceId, rawType, execution);
      if (!observed.supported || observed.current !== enabled) {
        throw new Error('Blink Early Notification was not confirmed after the command.');
      }
      return { ...observed, changed: true };
    }, [], undefined, requestOptions);
  }

  /** Auto preserves vendor state. Explicit capture quality changes also affect Blink recordings. */
  async setDeviceVideoQuality(type: BlinkCameraKind, networkId: number, deviceId: number,
    quality: BlinkInputQuality, options: RequestOptions = {}): Promise<BlinkVideoQualityState> {
    requireRemoteId(networkId);
    requireRemoteId(deviceId);
    this.deviceConfigPath(type, 1, networkId, deviceId);
    if (quality !== 'auto' && !isBlinkVideoQuality(quality)) throw new Error('Invalid Blink input quality.');
    if (quality === 'auto') return this.getDeviceVideoQuality(type, networkId, deviceId, options);
    return this.queueStateCommand('Quality', async execution => {
      const current = await this.getDeviceVideoQuality(type, networkId, deviceId, execution);
      if (current.supported && !current.supported.includes(quality)) throw new Error('Blink camera does not support the requested input quality.');
      if (current.restricted?.includes(quality)) throw new Error('Blink camera restricts the requested input quality.');
      if (current.quality === quality) return current;
      const accountId = await withinRequestBudget(this.ensureAccountId(), execution);
      checkRequestBudget(execution);
      await this.ownedStateCommand('quality', accountId, networkId, deviceId, beforeDispatch => this.sharedHttp.post<BlinkCommandResponse>(
        this.deviceConfigPath(type, accountId, networkId, deviceId), { video_quality: quality }, [409],
        { ...execution, retry: false, beforeDispatch },
      ), execution);
      for (let attempt = 0; attempt < 5; attempt++) {
        const observed = await this.getDeviceVideoQuality(type, networkId, deviceId, execution);
        if (observed.quality === quality) return observed;
        if (attempt < 4) await budgetedDelay(500, execution);
      }
      throw new Error('Blink input quality was not confirmed after the command.');
    }, [], async execution => {
      const observed = await this.getDeviceVideoQuality(type, networkId, deviceId, execution);
      return { resolved: observed.quality === quality, value: observed };
    }, options);
  }

  private setDeviceMotion(type: 'camera' | 'owl' | 'doorbell', networkId: number, deviceId: number,
    enabled: boolean, options?: RequestOptions): Promise<void> {
    requireRemoteId(networkId);
    requireRemoteId(deviceId);
    return this.queueStateCommand('Motion', async execution => {
      const accountId = await withinRequestBudget(this.ensureAccountId(), execution);
      checkRequestBudget(execution);
      const kind = type === 'camera' ? 'cameras' : type === 'owl' ? 'owls' : 'doorbells';
      const prefix = type === 'camera' ? '' : 'v1/';
      const http = type === 'camera' ? this.sharedRootHttp : this.sharedHttp;
      await this.ownedStateCommand('motion', accountId, networkId, deviceId, beforeDispatch => http.post<BlinkCommandResponse>(
        `${prefix}accounts/${accountId}/networks/${networkId}/${kind}/${deviceId}/${enabled ? 'enable' : 'disable'}`,
        undefined, [409], { ...execution, retry: false, beforeDispatch }), execution);
    }, [500, 1000], execution => this.motionReachedState(type, networkId, deviceId, enabled, execution), options);
  }

  /**
   * Enable motion detection for a camera
   * Source: API Dossier Section 3.3 - POST accounts/{account_id}/networks/{network}/cameras/{camera}/enable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/CameraApi.smali
   * Note: No version prefix - uses root URL (without /api/)
   */
  async enableCameraMotion(networkId: number, cameraId: number, options?: RequestOptions): Promise<void> {
    return this.setDeviceMotion('camera', networkId, cameraId, true, options);
  }

  /**
   * Disable motion detection for a camera
   * Source: API Dossier Section 3.3 - POST accounts/{account_id}/networks/{network}/cameras/{camera}/disable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/CameraApi.smali
   * Note: No version prefix - uses root URL (without /api/)
   */
  async disableCameraMotion(networkId: number, cameraId: number, options?: RequestOptions): Promise<void> {
    return this.setDeviceMotion('camera', networkId, cameraId, false, options);
  }

  /**
   * Enable motion detection for a doorbell
   * Source: API Dossier Section 3.5 - POST v1/accounts/{account_id}/networks/{network}/doorbells/{lotus}/enable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.smali
   */
  async enableDoorbellMotion(networkId: number, doorbellId: number, options?: RequestOptions): Promise<void> {
    return this.setDeviceMotion('doorbell', networkId, doorbellId, true, options);
  }

  /**
   * Disable motion detection for a doorbell
   * Source: API Dossier Section 3.5 - POST v1/accounts/{account_id}/networks/{network}/doorbells/{lotus}/disable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.smali
   */
  async disableDoorbellMotion(networkId: number, doorbellId: number, options?: RequestOptions): Promise<void> {
    return this.setDeviceMotion('doorbell', networkId, doorbellId, false, options);
  }

  /**
   * Enable motion detection for an owl (Mini camera)
   * Source: API Dossier Section 3.4 - POST v1/accounts/{account_id}/networks/{networkId}/owls/{owlId}/enable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/wired/OwlApi.smali
   */
  async enableOwlMotion(networkId: number, owlId: number, options?: RequestOptions): Promise<void> {
    return this.setDeviceMotion('owl', networkId, owlId, true, options);
  }

  /**
   * Disable motion detection for an owl (Mini camera)
   * Source: API Dossier Section 3.4 - POST v1/accounts/{account_id}/networks/{networkId}/owls/{owlId}/disable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/wired/OwlApi.smali
   */
  async disableOwlMotion(networkId: number, owlId: number, options?: RequestOptions): Promise<void> {
    return this.setDeviceMotion('owl', networkId, owlId, false, options);
  }

  /**
   * Get media clips (motion events)
   * Source: API Dossier Section 3.9 - GET v4/accounts/{account_id}/media
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/video/VideoApi.smali
   */
  async getMedia(query: BlinkMediaQuery = {}): Promise<BlinkMediaResponse> {
    const accountId = await this.ensureAccountId();
    const params = new URLSearchParams();
    if (query.startTime) params.set('start_time', query.startTime);
    if (query.endTime) params.set('end_time', query.endTime);
    if (query.paginationKey !== undefined && query.paginationKey !== null) {
      params.set('pagination_key', String(query.paginationKey));
    }

    const path = `v4/accounts/${accountId}/media${params.toString() ? `?${params}` : ''}`;
    const body = query.filters
      ? {
          filters: {
            types: query.filters.types ?? [],
            device_types: query.filters.deviceTypes ?? [],
            devices: query.filters.devices ?? undefined,
          },
        }
      : {};

    return this.sharedHttp.post<BlinkMediaResponse>(path, body);
  }

  /**
   * Get unwatched media count (check for new motion events)
   * Source: API Dossier - GET v4/accounts/{account_id}/unwatched_media
   * Evidence: jadx-out UnwatchedMediaResponse.java
   * Note: Returns only a count. Use getMedia() to fetch actual clips.
   */
  async getUnwatchedMedia(): Promise<BlinkUnwatchedMediaResponse> {
    const accountId = await this.ensureAccountId();
    return this.sharedHttp.get<BlinkUnwatchedMediaResponse>(`v4/accounts/${accountId}/unwatched_media`);
  }

  private captureThumbnail(type: 'camera' | 'owl' | 'doorbell', networkId: number, deviceId: number,
    options?: RequestOptions): Promise<BlinkCaptureResult> {
    requireRemoteId(networkId);
    requireRemoteId(deviceId);
    return this.queueStateCommand('Capture', async execution => {
      const accountId = await withinRequestBudget(this.ensureAccountId(), execution);
      checkRequestBudget(execution);
      const kind = type === 'camera' ? 'cameras' : type === 'owl' ? 'owls' : 'doorbells';
      const prefix = type === 'camera' ? '' : 'v1/';
      const http = type === 'camera' ? this.sharedRootHttp : this.sharedHttp;
      let response: BlinkCommandResponse = {};
      let captureOutcome: BlinkCaptureResult['captureOutcome'] = 'completed';
      try {
        response = await this.ownedStateCommand('capture', accountId, networkId, deviceId, beforeDispatch => http.post<BlinkCommandResponse>(
          `${prefix}accounts/${accountId}/networks/${networkId}/${kind}/${deviceId}/thumbnail`,
          undefined, [409], { ...execution, retry: false, beforeDispatch }), execution);
      } catch (error) {
        if (!isBlinkPostRefusal(error) || error.status !== 409) throw error;
        captureOutcome = 'existing-thumbnail';
      }
      const homescreen = await this.getHomescreen(execution);
      const devices = type === 'camera' ? homescreen.cameras : type === 'owl' ? homescreen.owls : homescreen.doorbells;
      const device = devices.find(device => device.id === deviceId && device.network_id === networkId);
      if (!device) throw new Error('Blink camera unavailable after capture.');
      return { ...response, captureOutcome, thumbnail: device.thumbnail };
    }, [], undefined, options);
  }

  /**
   * Request thumbnail capture for a camera
   * Source: API Dossier Section 3.3 - POST accounts/{account_id}/networks/{network}/cameras/{camera}/thumbnail
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/CameraApi.smali
   * Note: No version prefix - uses root URL (without /api/)
   */
  async requestCameraThumbnail(networkId: number, cameraId: number, options?: RequestOptions): Promise<BlinkCaptureResult> {
    return this.captureThumbnail('camera', networkId, cameraId, options);
  }

  /**
   * Request thumbnail capture for an owl (Mini camera)
   * Source: API Dossier Section 3.4 - POST v1/accounts/{account_id}/networks/{networkId}/owls/{owlId}/thumbnail
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/wired/OwlApi.smali
   */
  async requestOwlThumbnail(networkId: number, owlId: number, options?: RequestOptions): Promise<BlinkCaptureResult> {
    return this.captureThumbnail('owl', networkId, owlId, options);
  }

  /**
   * Request thumbnail capture for a doorbell
   * Source: API Dossier Section 3.5 - POST v1/accounts/{account_id}/networks/{network}/doorbells/{lotus}/thumbnail
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.smali
   */
  async requestDoorbellThumbnail(networkId: number, doorbellId: number, options?: RequestOptions): Promise<BlinkCaptureResult> {
    return this.captureThumbnail('doorbell', networkId, doorbellId, options);
  }

  /**
   * Start live view session for a camera
   * Source: API Dossier Section 3.3 - POST v6/accounts/{account_id}/networks/{networkId}/cameras/{cameraId}/liveview
   * Source: API Dossier Section 4.2 - LiveVideoResponse model
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/CameraApi.smali
   */
  async startCameraLiveview(
    networkId: number,
    cameraId: number,
    intent = 'liveview',
    motionEventStartTime?: string | null,
    options: RequestOptions = {},
  ): Promise<BlinkLiveVideoResponse> {
    return this.startOwnedLiveView('camera', networkId, cameraId, intent, motionEventStartTime, options);
  }

  /**
   * Start live view session for an owl (Mini camera)
   * Source: API Dossier Section 3.4 - POST v2/accounts/{account_id}/networks/{networkId}/owls/{owlId}/liveview
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/wired/OwlApi.smali
   */
  async startOwlLiveview(
    networkId: number,
    owlId: number,
    intent = 'liveview',
    motionEventStartTime?: string | null,
    options: RequestOptions = {},
  ): Promise<BlinkLiveVideoResponse> {
    return this.startOwnedLiveView('owl', networkId, owlId, intent, motionEventStartTime, options);
  }

  /**
   * Start live view session for a doorbell
   * Source: API Dossier Section 3.5 - POST v2/accounts/{account_id}/networks/{networkId}/doorbells/{doorbellId}/liveview
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.smali
   */
  async startDoorbellLiveview(
    networkId: number,
    doorbellId: number,
    intent = 'liveview',
    motionEventStartTime?: string | null,
    options: RequestOptions = {},
  ): Promise<BlinkLiveVideoResponse> {
    return this.startOwnedLiveView('doorbell', networkId, doorbellId, intent, motionEventStartTime, options);
  }

  private startOwnedLiveView(kind: BlinkCameraKind, networkId: number, deviceId: number, intent: string,
    motionEventStartTime: string | null | undefined, options: RequestOptions): Promise<BlinkLiveVideoResponse> {
    requireRemoteId(networkId); requireRemoteId(deviceId);
    return this.queueStateCommand('LiveView', async execution => {
      const accountId = await withinRequestBudget(this.ensureAccountId(), execution);
      execution.beforeDispatch();
      const owner: BlinkLiveViewOwnership = { reservationId: randomUUID(), accountId, networkId, deviceId, kind,
        phase: 'starting', retirementAcknowledged: false,
        expiresAt: Math.min(execution.deadline ?? Infinity, Date.now() + REMOTE_OPERATION_LEASE_MS) };
      const generation = execution.generation;
      const current = () => {
        checkRequestBudget(execution);
        if (generation !== this.writerGeneration || this.liveViewOwner?.reservationId !== owner.reservationId
          || this.getCachedIdentity().accountId !== accountId) throw new BlinkOperationNotStartedError('ownership-unavailable');
      };
      await this.persistLiveViewOwner(owner, undefined, generation);
      let dispatched = false;
      let acknowledged = false;
      let commandId: number | undefined;
      try {
        current();
        const segment = kind === 'camera' ? 'cameras' : kind === 'owl' ? 'owls' : 'doorbells';
        const version = kind === 'camera' ? 'v6' : 'v2';
        dispatched = true;
        const response = await this.sharedHttp.post<BlinkLiveVideoResponse>(
          `${version}/accounts/${accountId}/networks/${networkId}/${segment}/${deviceId}/liveview`,
          { intent, motion_event_start_time: motionEventStartTime ?? null }, [], { ...execution, retry: false, beforeDispatch: current });
        acknowledged = execution.mutationAcknowledged = true;
        commandId = requireRemoteId(response.command_id ?? response.id);
        current();
        await this.persistLiveViewOwner({ ...owner, phase: 'active', commandId }, owner.reservationId, generation);
        return response;
      } catch (error) {
        const noSend = error instanceof Error && (error as Error & { dispatched?: boolean }).dispatched === false;
        if (!dispatched || (!acknowledged && (noSend || isBlinkPostRefusal(error)))) {
          await this.persistLiveViewOwner(undefined, owner.reservationId, generation);
        } else await this.persistLiveViewOwner({ ...owner, phase: 'unresolved', ...(commandId ? { commandId } : {}) },
          owner.reservationId, generation);
        throw error;
      }
    }, [], undefined, options, { kind: 'liveview' });
  }

  /**
   * Get command status once
   * Source: API Dossier Section 3.10 - GET /accounts/{account_id}/networks/{network}/commands/{command}
   * Note: No version prefix - uses root URL (without /api/)
   */
  async getCommandStatus(networkId: number, commandId: number, options?: BlinkHttpRequestOptions): Promise<BlinkCommandStatus> {
    requireRemoteId(networkId);
    requireRemoteId(commandId);
    const accountId = await this.ensureAccountId();
    return this.sharedRootHttp.get<BlinkCommandStatus>(
      `accounts/${accountId}/networks/${networkId}/commands/${commandId}`,
      options,
    );
  }

  /**
   * Poll command status until complete
   * Source: API Dossier Section 3.10 - GET /accounts/{account_id}/networks/{network}/commands/{command}
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/network/command/CommandApi.smali
   */
  async pollCommand(
    networkId: number,
    commandId: number,
    maxAttempts = 10,
    fallbackIntervalSeconds = 5,
    options?: RequestOptions,
  ): Promise<BlinkCommandStatus> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      checkRequestBudget(options);
      const status = await withinRequestBudget(this.getCommandStatus(networkId, commandId, options), options);

      if (status.complete || status.status === 'complete') {
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(`Blink command ${commandId} failed`);
      }

      const delayMs = (status.polling_interval ?? fallbackIntervalSeconds) * 1000;
      await budgetedDelay(delayMs, options);
    }

    throw new Error(`Blink command ${commandId} timed out after ${maxAttempts} attempts`);
  }

  /**
    * Update an onboarding/status command
   * Source: API Dossier Section 3.10 - POST /accounts/{account_id}/networks/{network}/commands/{command}/update
   * Note: No version prefix - uses root URL (without /api/)
    *
    * Returns null if the command no longer exists (404).
   */
  async updateCommand(networkId: number, commandId: number): Promise<BlinkCommandStatus | null> {
    requireRemoteId(networkId);
    requireRemoteId(commandId);
    return this.queueStateCommand('CommandUpdate', async execution => {
      const accountId = await withinRequestBudget(this.ensureAccountId(), execution);
      try {
        return await this.sharedRootHttp.post<BlinkCommandStatus>(
          `accounts/${accountId}/networks/${networkId}/commands/${commandId}/update`, undefined, [404],
          { ...execution, retry: false });
      } catch (error) {
        if (error instanceof BlinkHttpError && error.status === 404) return null;
        throw error;
      }
    }, [], undefined, {}, { kind: 'update', networkId, commandId });
  }

  /**
   * Mark a command as done (e.g., end live view)
   * Source: API Dossier Section 3.10 - POST /accounts/{account_id}/networks/{network}/commands/{command}/done
   * Note: No version prefix - uses root URL (without /api/)
   *
   * Android 59.2 declares a Unit response. A missing command (404) is
   * reported separately from acknowledged completion.
   */
  async completeCommand(networkId: number, commandId: number, options?: RequestOptions): Promise<void | null> {
    requireRemoteId(networkId);
    requireRemoteId(commandId);
    checkRequestBudget(options);
    return this.queueStateCommand('Retirement', async execution => {
      const accountId = await withinRequestBudget(this.ensureAccountId(), execution);
      execution.beforeDispatch();
      const owned = this.liveViewOwner?.networkId === networkId && this.liveViewOwner.commandId === commandId
        ? this.liveViewOwner : undefined;
      const generation = execution.generation;
      const current = () => {
        checkRequestBudget(execution);
        if (generation !== this.writerGeneration || (owned && this.liveViewOwner?.reservationId !== owned.reservationId)) {
          throw new BlinkOperationNotStartedError('ownership-unavailable');
        }
      };
      if (owned && owned.accountId !== accountId) throw new BlinkOperationNotStartedError('ownership-unavailable');
      if (owned) await this.persistLiveViewOwner({ ...owned, phase: 'retiring' }, owned.reservationId, generation);
      let acknowledged = false;
      try {
        await this.sharedRootHttp.post<void>(`accounts/${accountId}/networks/${networkId}/commands/${commandId}/done`,
          undefined, [404], { ...execution, responseType: 'void', retry: false, beforeDispatch: current });
        acknowledged = execution.mutationAcknowledged = true;
        if (owned) {
          const receipt = { ...owned, phase: 'retiring' as const, retirementAcknowledged: true };
          current();
          await this.persistLiveViewOwner(receipt, owned.reservationId, generation);
          if (!await this.confirmLiveViewRetirement(receipt, execution)) {
            throw new Error('Blink live view retirement remains unconfirmed.');
          }
        }
      } catch (error) {
        if (owned) await this.persistLiveViewOwner({ ...owned, phase: 'unresolved',
          retirementAcknowledged: acknowledged || owned.retirementAcknowledged }, owned.reservationId, generation);
        if (!acknowledged && error instanceof BlinkHttpError && error.status === 404) return null;
        throw error;
      }
    }, [], undefined, options, { kind: 'retire', networkId, commandId });
  }

  private async confirmLiveViewRetirement(owner: BlinkLiveViewOwnership, options: CommandRequestOptions): Promise<boolean> {
    if (!owner.commandId || !owner.retirementAcknowledged) return false;
    const current = this.liveViewOwner;
    const generation = options.generation;
    options.beforeDispatch();
    if (!current || current.reservationId !== owner.reservationId) return false;
    if (this.getCachedIdentity().accountId !== owner.accountId) throw new BlinkOperationNotStartedError('ownership-unavailable');
    try {
      const response = await this.sharedRootHttp.get<{ complete?: unknown; status?: unknown }>(
        `accounts/${owner.accountId}/networks/${owner.networkId}/commands/${owner.commandId}`,
        { ...options, deadline: Math.min(options.deadline ?? Infinity, Date.now() + 10_000), retry: false,
          responseKind: 'command', maxResponseBytes: 256 * 1024, beforeDispatch: () =>
            this.assertOperationAuthority('liveView', owner.reservationId, generation, owner.accountId) });
      this.assertOperationAuthority('liveView', owner.reservationId, generation, owner.accountId);
      if (response.complete === true && response.status === 0) {
        if (!await this.persistLiveViewOwner(undefined, owner.reservationId, generation)) return false;
        options.beforeDispatch();
        this.assertOperationAuthority('liveView', owner.reservationId, generation, owner.accountId, true);
        return true;
      }
    } catch {
      // A failed bounded read leaves uncertainty until local lease expiry.
    }
    await this.persistLiveViewOwner({ ...owner, phase: 'unresolved' }, owner.reservationId, generation);
    return false;
  }

  /** Explicit on-demand reconciliation: one GET for an owned, acknowledged retirement; no new command or polling loop. */
  async reconcileKnownLiveViews(options: RequestOptions = {}): Promise<{ commandId?: number; confirmed: boolean }[]> {
    this.expireOperationOwners();
    const owner = this.liveViewOwner;
    if (!owner) return [];
    if (!owner.commandId || !owner.retirementAcknowledged) return [{ commandId: owner.commandId, confirmed: false }];
    return this.queueStateCommand('Retirement', async execution => [{ commandId: owner.commandId,
      confirmed: await this.confirmLiveViewRetirement(owner, execution) }], [], undefined, options,
    { kind: 'retire', networkId: owner.networkId, commandId: owner.commandId });
  }

  private async ensureAccountId(): Promise<number> {
    if (!this.accountId) {
      await this.login();
    }

    const accountId = this.accountId ?? this.auth.getAccountId();
    if (!accountId) {
      throw new Error('Blink account id is not set');
    }

    requireRemoteId(accountId);
    this.auth.setAccountId(accountId);
    return accountId;
  }

  private async ensureClientId(): Promise<number> {
    if (!this.clientId) {
      await this.getAccountInfo();
    }

    const clientId = this.clientId ?? this.auth.getClientId();
    if (!clientId) {
      throw new Error('Blink client id is not set');
    }

    requireRemoteId(clientId);
    this.auth.setClientId(clientId);
    return clientId;
  }
}
