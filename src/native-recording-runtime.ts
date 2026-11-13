import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { BlinkEarlyNotificationNotConfirmedError, BlinkOperationNotStartedError, type BlinkApi, type BlinkRemoteOperationOwnership } from './blink-api/client';
import { BlinkHttpError } from './blink-api/http';
import { supportsEarlyNotificationControl } from './blink-api/domain-validation';
import { FcmEventSource, type FcmEventSourceOptions } from './blink-api/fcm/source';
import type { FcmNotification, FcmReceiverState, FcmScope, FirebaseConfig } from './blink-api/fcm/types';
import { decodeBlinkMotionMessage, isBlinkMotionDevice, isNativeMotionDevice, type BlinkMotionDevice, type NativeMotionDevice } from './blink-api/motion-events';
import { matchNativeClip } from './blink-api/native-clip-matcher';
import { NativeStorageOwner, type NativeStorageCatalog, type NativeStorageScope, type NativeStorageState, type NativeStoredMedia } from './blink-api/native-storage';
import { readOwnerOnlyJsonFile, writeOwnerOnlyJsonFile } from './blink-api/secure-json-file';
import { NativeRecordingCoordinator, type NativeRecordingAcquisition, type NativeRecordingAcquisitionResult,
  type NativeRecordingObservation, type NativeRecordingState } from './native-recording-coordinator';
import type { NativeRecordingConfig, NativeRecordingDevicePolicy } from './native-recording-config';
import type { NativeRecordingDelegate, NativeRecordingPolicy, NativeRecordingDeliveryEvent } from './accessories/native-recording-delegate';
import { isRemoteOperationLeaseActive, OperationTimeoutError, REMOTE_OPERATION_LEASE_MS, withinRequestBudget, type RequestOptions } from './operation-budget';
import type { BlinkCameraKind } from './types';

export interface NativeRuntimeDevice {
  binding: BlinkMotionDevice;
  /** Provider model identity, separate from the camera/owl endpoint family. */
  rawType?: string;
  nativeStorage?: { moduleId: string; syncModuleId: number };
  settings: NativeRecordingDevicePolicy;
  motion(): void;
  recording(): NativeRecordingDelegate | undefined;
}
type RuntimeClient = Pick<BlinkApi, 'getCachedIdentity' | 'registerMotionNotificationKey' | 'createNativeStorageTransport'
  | 'withNativeStorageAdmission' | 'setNativeStorageOwner' | 'configureRemoteOperationOwnership' | 'reconcileKnownStateCommand'
  | 'reconcileKnownLiveViews' | 'getRemoteOperationState' | 'setDeviceEarlyNotification' | 'retryRemoteOperationPersistence'>;
interface EarlyNotificationOriginal {
  kind: BlinkCameraKind;
  networkId: number;
  deviceId: number;
  rawType: string;
  original: boolean;
}
interface EarlyNotificationOriginals {
  version: 2;
  scope: { accountId: number; tier: string };
  devices: EarlyNotificationOriginal[];
}
export interface NativeRecordingLogContext { camera?: string; flow?: string; attempt?: number; }
const preferenceFailure = (error: unknown): string => {
  if (error instanceof BlinkEarlyNotificationNotConfirmedError) return 'readback-unconfirmed';
  if (error instanceof OperationTimeoutError) return 'timeout';
  if (error instanceof BlinkOperationNotStartedError) {
    return ['storage-pending', 'liveview-pending', 'ownership-unavailable', 'invalid-native-route'].includes(error.reason)
      ? `not-started-${error.reason}` : 'not-started';
  }
  if (error instanceof BlinkHttpError) {
    if (error.failure === 'network') return 'network';
    if (error.failure === 'response') return 'invalid-response';
    return Number.isInteger(error.status) && error.status >= 100 && error.status <= 599 ? `http-${error.status}` : 'http';
  }
  return 'unexpected';
};

interface DownloadedAsset {
  logFlow?: string;
  reference: string; bytes: number; sha256: string; identity: string; capturedAt: string;
  moduleId: string; cameraId: string; jobId: string; policyEpoch: number; cameraGeneration: number;
}
export interface NativeRecordingRuntimeState {
  version: 1;
  scope: FcmScope;
  core?: NativeRecordingState;
  push?: FcmReceiverState;
  nativeByModule: Record<string, { scope: NativeStorageScope; state: NativeStorageState }>;
  remoteOperations?: BlinkRemoteOperationOwnership;
  consumed: string[];
  catalogStartedAt: Record<string, number>;
  /** Conservative local backoff after definite provider refusal, not a vendor limit. */
  refusedUntil: Record<string, number>;
  downloads: DownloadedAsset[];
}
export interface NativeRecordingRuntimeOptions {
  client: RuntimeClient;
  scope: FcmScope;
  devices: readonly NativeRuntimeDevice[];
  /** Complete discovered native identity inventory, including excluded and recording-disabled cameras. */
  matchingDevices: readonly NativeMotionDevice[];
  storagePath: string;
  config: NativeRecordingConfig;
  firebase: FirebaseConfig;
  appVersion: string;
  report(event: string, context?: NativeRecordingLogContext): void;
  /** Explicit offline transport qualification; production uses the isolated receiver. */
  eventSourceFactory?: (options: FcmEventSourceOptions) => Pick<FcmEventSource, 'setDemand' | 'reconnect' | 'stop'>;
}

const MAX_STATE_BYTES = 4 * 1024 * 1024;
/** Serialize actual file replacement across runtime generations, including late writes. */
const stateFileWrites = new Map<string, Promise<void>>();
// Exact names promoted/temporarily written by BlinkApi.downloadNativeMedia().
const CACHE_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const CACHE_ARTIFACT = new RegExp(`^(?:native-${CACHE_UUID}\\.mp4|\\.native-${CACHE_UUID}\\.partial)$`);
const clone = <T>(value: T): T => globalThis.structuredClone(value);
const bindingKey = (binding: BlinkMotionDevice): string => JSON.stringify([binding.providerId, binding.target, binding.networkId]);
const observationKey = (event: NativeRecordingObservation): string => JSON.stringify([event.moduleId, event.cameraId, event.eventId]);
const settingKey = (device: Pick<EarlyNotificationOriginal, 'kind' | 'networkId' | 'deviceId'>): string =>
  JSON.stringify([device.kind, device.networkId, device.deviceId]);

/** Account composition: one writer, one FIFO, per-module protocol owners, no idle catalogs. */
export class NativeRecordingRuntime {
  private readonly logSalt = randomUUID();
  private state!: NativeRecordingRuntimeState;
  private core!: NativeRecordingCoordinator;
  private source!: Pick<FcmEventSource, 'setDemand' | 'reconnect' | 'stop'>;
  private readonly owners = new Map<string, NativeStorageOwner>();
  private readonly devices = new Map<string, NativeRuntimeDevice>();
  private readonly matchingDevices: readonly NativeMotionDevice[];
  private readonly catalogs = new Map<string, { catalog: NativeStorageCatalog; startedAt: number }>();
  private readonly epochs = new Map<string, number>();
  private readonly enabledSince = new Map<string, number>();
  private readonly earlyNotificationOffSince = new Map<string, number>();
  private earlyNotificationOriginals?: EarlyNotificationOriginals;
  private readonly policyEpochs = new Map<string, number>();
  private readonly policyChanges = new Set<Promise<void>>();
  private writes: Promise<void> = Promise.resolve();
  private stopped = false;
  private active = false;
  private failed = false;
  private deliveryTimer?: ReturnType<typeof globalThis.setTimeout>;
  private delivering = false;
  private delivery?: Promise<void>;
  private stopping?: Promise<void>;
  private recovery?: Promise<void>;
  private persistenceRecovery?: Promise<void>;
  private preferences?: Promise<void>;
  private cacheBytes = 0;
  private releaseOwnership?: (options?: RequestOptions) => Promise<void>;
  private writerReleased = false;
  readonly directory: string;
  private cachePath: string;
  get cacheDirectory(): string { return this.cachePath; }
  private readonly statePath: string;
  private readonly earlyNotificationPath: string;

  private constructor(private readonly options: NativeRecordingRuntimeOptions) {
    if (!Number.isSafeInteger(options.scope.accountId) || options.scope.accountId <= 0 || !Number.isSafeInteger(options.scope.clientId)
      || options.scope.clientId <= 0 || !/^[a-z0-9]{4}$/i.test(options.scope.tier)) throw new Error('Native recording requires a cached account/client scope');
    this.directory = path.join(options.storagePath, '.blink-native-recording', `${options.scope.accountId}-${options.scope.clientId}-${options.scope.tier}`);
    this.cachePath = path.join(this.directory, 'downloads');
    this.statePath = path.join(this.directory, 'state.json');
    // Originals belong to the account, not the replaceable authenticated client.
    this.earlyNotificationPath = path.join(path.dirname(this.directory), `.early-notification-${options.scope.accountId}-${options.scope.tier}.json`);
    if (!Array.isArray(options.matchingDevices) || options.matchingDevices.length > 1000
      || options.matchingDevices.some(device => !isNativeMotionDevice(device) || device.accountId !== options.scope.accountId
        || device.moduleId !== `${device.networkId}:${device.syncModuleId}`)) throw new Error('Invalid native matching inventory');
    this.matchingDevices = options.matchingDevices.map(device => ({ ...device }));
    for (const device of options.devices) {
      const key = bindingKey(device.binding);
      if (!isBlinkMotionDevice(device.binding) || this.devices.has(key) || device.binding.accountId !== options.scope.accountId) throw new Error('Ambiguous native device binding');
      if (device.nativeStorage && (!Number.isSafeInteger(device.nativeStorage.syncModuleId) || device.nativeStorage.syncModuleId <= 0
        || device.nativeStorage.moduleId !== `${device.binding.networkId}:${device.nativeStorage.syncModuleId}`)) throw new Error('Invalid native module binding');
      this.devices.set(key, device);
    }
  }

  static async create(options: NativeRecordingRuntimeOptions): Promise<NativeRecordingRuntime> {
    await fs.mkdir(options.storagePath, { recursive: true, mode: 0o700 });
    const runtime = new NativeRecordingRuntime({ ...options, storagePath: await fs.realpath(options.storagePath) });
    try { await runtime.initialize(); return runtime; }
    catch (error) { await runtime.stop().catch(() => undefined); throw error; }
  }

  private async initialize(): Promise<void> {
    await withinRequestBudget(Promise.all([this.statePath, this.earlyNotificationPath].map(filename =>
      stateFileWrites.get(filename) ?? Promise.resolve())), { deadline: Date.now() + REMOTE_OPERATION_LEASE_MS });
    await this.privateDirectory(path.join(this.options.storagePath, '.blink-native-recording'));
    await this.privateDirectory(this.directory);
    await this.privateDirectory(this.cacheDirectory);
    this.cachePath = await fs.realpath(this.cacheDirectory);
    await this.loadEarlyNotificationOriginals();
    await this.assertPriorScopesSettled();
    try {
      const stat = await fs.lstat(this.statePath);
      const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_STATE_BYTES
        || (uid !== undefined && ((stat.mode & 0o777) !== 0o600 || stat.uid !== uid))) throw new Error('Unsafe native recording state');
      this.state = await readOwnerOnlyJsonFile<NativeRecordingRuntimeState>(this.statePath);
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
      this.state = { version: 1, scope: { ...this.options.scope }, nativeByModule: {}, consumed: [], catalogStartedAt: {}, refusedUntil: {}, downloads: [] };
    }
    if (!this.state || this.state.version !== 1 || !this.state.scope || this.state.scope.accountId !== this.options.scope.accountId
      || this.state.scope.clientId !== this.options.scope.clientId || this.state.scope.tier !== this.options.scope.tier
      || !this.state.nativeByModule || typeof this.state.nativeByModule !== 'object' || Array.isArray(this.state.nativeByModule)
      || !Array.isArray(this.state.consumed) || this.state.consumed.length > 2_048 || this.state.consumed.some(id => typeof id !== 'string' || id.length > 1024)
      || !this.state.catalogStartedAt || typeof this.state.catalogStartedAt !== 'object' || Array.isArray(this.state.catalogStartedAt)
      || Object.values(this.state.catalogStartedAt).some(at => !Number.isSafeInteger(at) || at < 0)
      || !this.state.refusedUntil || typeof this.state.refusedUntil !== 'object' || Array.isArray(this.state.refusedUntil)
      || Object.values(this.state.refusedUntil).some(at => !Number.isSafeInteger(at) || at < 0)
      || !Array.isArray(this.state.downloads) || this.state.downloads.length > this.options.config.maxQueuedJobs) throw new Error('Invalid scoped native recording state');
    this.releaseOwnership = this.options.client.configureRemoteOperationOwnership({ scope: this.options.scope,
      restoredState: this.state.remoteOperations, restoredNativeStorage: Object.values(this.state.nativeByModule),
      saveState: remoteOperations => this.commit(next => { next.remoteOperations = clone(remoteOperations); }) });
    for (const [moduleId, entry] of Object.entries(this.state.nativeByModule)) {
      if (!entry || !entry.scope || moduleId !== `${entry.scope.networkId}:${entry.scope.syncModuleId}`) throw new Error('Invalid persisted native module identity');
      this.options.client.setNativeStorageOwner(entry.scope, entry.state);
    }
    const moduleScopes = new Map<string, NativeStorageScope>();
    for (const [moduleId, entry] of Object.entries(this.state.nativeByModule)) moduleScopes.set(moduleId, entry.scope);
    for (const { binding, nativeStorage } of this.devices.values()) {
      if (nativeStorage) moduleScopes.set(nativeStorage.moduleId, { accountId: binding.accountId, networkId: binding.networkId, syncModuleId: nativeStorage.syncModuleId });
    }
    for (const [moduleId, scope] of moduleScopes) {
      if (scope.accountId !== this.options.scope.accountId) throw new Error('Foreign persisted native module');
      const owner = new NativeStorageOwner({
        transport: this.options.client.createNativeStorageTransport({ scope, directory: this.cacheDirectory }),
        admit: (work, request, operationId, operationScope) => this.options.client.withNativeStorageAdmission(operationId, work, request, operationScope),
        restoredState: this.state.nativeByModule[moduleId]?.state,
        saveState: state => this.commit(next => { next.nativeByModule[moduleId] = { scope, state: clone(state) }; }),
      });
      this.owners.set(moduleId, owner);
    }
    this.core = new NativeRecordingCoordinator({
      moduleIds: [...new Set([...moduleScopes.keys(), ...(this.state.core?.queue ?? []).map(job => job.observation.moduleId)])],
      restoredState: this.state.core, initialDelayMs: this.options.config.initialDelayMs,
      retryIntervalMs: this.options.config.retryIntervalMs, maxRetries: this.options.config.maxRetries,
      maxQueuedJobs: this.options.config.maxQueuedJobs, maxJobAgeMs: this.options.config.maxJobAgeMs,
      earliestAcquisitionAt: (event, fallbackAt) => this.earliest(event, fallbackAt),
      acquire: async (request, signal) => {
        const context = this.observationContext(request.observation, request.attempt);
        this.report('acquisition-attempt', context);
        const result = await this.acquire(request, signal);
        this.report(`acquisition-${result.status}`, context);
        return result;
      },
      saveState: core => this.commit(next => { next.core = clone(core); }),
      onError: () => this.report('acquisition-faulted'),
      onOperationAbandoned: async () => {
        for (const owner of this.owners.values()) await owner.abandonExpired();
        this.report('operation-locally-abandoned');
      },
      onJobFinished: result => { this.epochs.delete(observationKey(result.observation)); this.report(`job-${result.outcome}`, this.observationContext(result.observation, result.attempts)); },
    });
    // Old permission-period work is never republished. Its cancelled head retains
    // remote uncertainty only within the original finite local lease.
    for (const job of this.core.snapshot().queue) await this.core.cancelCamera(job.observation.moduleId, job.observation.cameraId);
    for (const asset of [...this.state.downloads]) await this.removeOwnedAsset(asset);
    await this.reconcileCache();
    await this.countCache();
    this.source = (this.options.eventSourceFactory ?? (config => new FcmEventSource(config)))({
      scope: this.options.scope, firebase: this.options.firebase, restoredState: this.state.push,
      saveState: push => this.commit(next => { next.push = clone(push); }),
      bindOwnedClientToken: async (token, signal) => {
        if (!this.currentScope() || signal.aborted) throw new Error('Push receiver account/client scope changed');
        await this.options.client.registerMotionNotificationKey(token,
          { appVersion: this.options.appVersion, osVersion: `Node ${process.versions.node}`, clientName: 'Homebridge Blink' }, { signal });
        if (!this.currentScope()) throw new Error('Push receiver account/client scope changed');
      },
      onNotification: (notification, signal) => this.receive(notification, signal),
      onAudit: event => this.report(`push-${event.event}${event.reason ? `:${event.reason}` : ''}`
        + `${event.disposition ? `:${event.disposition}` : ''}${event.retryInMs !== undefined ? `:retry-ms=${event.retryInMs}` : ''}`),
    });
  }

  async start(): Promise<void> {
    if (this.stopped) throw new Error('Native runtime stopped');
    if (this.active) return;
    await this.reconcileKnownOperations();
    if (this.stopped || this.active) return;
    this.active = true;
    for (const device of this.devices.values()) {
      const policy = device.recording()?.policy;
      if (policy) this.policyEpochs.set(device.binding.cameraId, policy.epoch);
      if (policy?.allowed) this.enabledSince.set(device.binding.cameraId, Date.now());
    }
    await this.source.setDemand({ motionAccessory: [...this.devices.values()].some(device => device.settings.exposeMotionDetected),
      hsv: [...this.devices.values()].some(device => device.settings.homeKitSecureVideo) });
    this.startPreferenceReconciliation();
  }

  private reconcileKnownOperations(): Promise<void> {
    this.recovery ??= this.performKnownRecovery().finally(() => { this.recovery = undefined; });
    return this.recovery;
  }

  private async performKnownRecovery(): Promise<void> {
    // Startup/operator retry may resolve known ownership, but never resends its POST.
    const liveViews = await this.options.client.reconcileKnownLiveViews();
    if (liveViews.some(owner => !owner.confirmed)) this.report('live-view-recovery-required');
    const ordinary = await this.options.client.reconcileKnownStateCommand();
    if (ordinary.commandId !== undefined && !ordinary.confirmed) this.report('ordinary-recovery-required');
    const operation = this.core.snapshot().operation;
    if (operation?.status === 'active') return;
    // Only existing command IDs may be examined during recovery; no new prepare.
    for (const owner of this.owners.values()) await owner.reconcilePending();
    if (operation?.status === 'unresolved') {
      const current = this.core.snapshot(), job = current.queue[0];
      if (current.operation?.operationId !== operation.operationId || current.operation.jobKey !== operation.jobKey
        || !job || observationKey(job.observation) !== operation.jobKey) return;
      const state = this.owners.get(job.observation.moduleId)?.snapshot().operation;
      if (!state || state.phase === 'finished' || state.phase === 'abandoned') {
        await this.core.resolveOperation({ moduleId: job.observation.moduleId, operationId: operation.operationId,
          status: state?.phase === 'abandoned' ? 'locally-abandoned' : 'verified-terminal', result: { status: 'skipped' } });
      } else this.report('recovery-required');
    }
  }

  private preferenceWorkAllowed(): boolean { return !this.stopped && !this.failed && this.currentScope(); }

  private startPreferenceReconciliation(): void {
    if (!this.preferenceWorkAllowed()) return;
    this.preferences ??= this.reconcileEarlyNotification().catch(error => this.report(`early-notification-${preferenceFailure(error)}-faulted`))
      .finally(() => { this.preferences = undefined; });
  }

  private async loadEarlyNotificationOriginals(): Promise<void> {
    try {
      const stat = await fs.lstat(this.earlyNotificationPath), uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_STATE_BYTES
        || (uid !== undefined && (stat.uid !== uid || (stat.mode & 0o777) !== 0o600))) throw new Error('Unsafe Early Notification originals');
      const state = await readOwnerOnlyJsonFile<EarlyNotificationOriginals>(this.earlyNotificationPath);
      if (!state || ![1, 2].includes(state.version) || state.scope?.accountId !== this.options.scope.accountId || state.scope?.tier !== this.options.scope.tier
        || !Array.isArray(state.devices) || state.devices.length > 1000
        || state.devices.some(device => !device || !['camera', 'owl', 'doorbell'].includes(device.kind)
          || !Number.isSafeInteger(device.networkId) || device.networkId <= 0 || !Number.isSafeInteger(device.deviceId) || device.deviceId <= 0
          || !supportsEarlyNotificationControl(device.rawType) || typeof device.original !== 'boolean' || (Number(state.version) === 1 && device.original !== true))
        || new Set(state.devices.map(settingKey)).size !== state.devices.length) throw new Error('Invalid Early Notification originals');
      this.earlyNotificationOriginals = { ...state, version: 2 };
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        this.earlyNotificationOriginals = { version: 2, scope: { accountId: this.options.scope.accountId, tier: this.options.scope.tier }, devices: [] };
      } else this.report('early-notification-state-faulted');
    }
  }

  private async saveEarlyNotificationOriginals(devices: EarlyNotificationOriginal[]): Promise<void> {
    if (!this.earlyNotificationOriginals || !this.preferenceWorkAllowed()) throw new Error('Early Notification originals unavailable');
    const next = { ...this.earlyNotificationOriginals, devices };
    await withinRequestBudget(this.writeStateFile(next, this.earlyNotificationPath), { deadline: Date.now() + REMOTE_OPERATION_LEASE_MS });
    if (!this.preferenceWorkAllowed()) throw new Error('Early Notification ownership changed');
    this.earlyNotificationOriginals = next;
  }

  /** Startup/configuration/operator retry only: never a per-motion preflight. */
  private async reconcileEarlyNotification(): Promise<void> {
    if (!this.earlyNotificationOriginals || !this.preferenceWorkAllowed()) return;
    const remote = this.options.client.getRemoteOperationState();
    if (remote.persistenceFailed || remote.liveView || remote.stateCommand || remote.storage.length) return;
    const desired = new Map<string, { device: NativeRuntimeDevice; identity: Omit<EarlyNotificationOriginal, 'original'> }>();
    for (const device of this.devices.values()) {
      if (device.settings.earlyNotificationMode !== 'on' && device.settings.earlyNotificationMode !== 'off') continue;
      const kind = device.binding.target;
      if (!['camera', 'owl', 'doorbell'].includes(kind) || !supportsEarlyNotificationControl(device.rawType)) {
        this.report('early-notification-unsupported', { camera: device.binding.nativeName }); continue;
      }
      const identity = { kind: kind as BlinkCameraKind, networkId: device.binding.networkId, deviceId: device.binding.providerId, rawType: device.rawType! };
      desired.set(settingKey(identity), { device, identity });
    }
    // Removed/excluded consumers still leave a durable original to restore.
    for (const original of [...this.earlyNotificationOriginals.devices]) {
      const selected = desired.get(settingKey(original));
      const camera = [...this.devices.values()].find(device => device.binding.target === original.kind
        && device.binding.providerId === original.deviceId && device.binding.networkId === original.networkId)?.binding.nativeName;
      if (selected && (selected.device.settings.earlyNotificationMode === 'on') !== original.original) continue;
      if (!this.preferenceWorkAllowed()) return;
      try {
        const result = await this.options.client.setDeviceEarlyNotification(original.kind, original.networkId, original.deviceId,
          original.rawType, original.original, { expectedCurrent: !original.original });
        if (result.supported && result.current === original.original) {
          await this.saveEarlyNotificationOriginals(this.earlyNotificationOriginals.devices.filter(row => settingKey(row) !== settingKey(original)));
          this.report('early-notification-restored', { camera });
        }
      } catch (error) { this.report(`early-notification-restore-${preferenceFailure(error)}-faulted`, { camera }); }
    }
    for (const [key, { device, identity }] of desired) {
      if (!this.preferenceWorkAllowed()) return;
      const enabled = device.settings.earlyNotificationMode === 'on';
      const binding = bindingKey(device.binding), previouslyOffSince = this.earlyNotificationOffSince.get(binding);
      this.earlyNotificationOffSince.delete(binding);
      let savedOriginal = false;
      try {
        const result = await this.options.client.setDeviceEarlyNotification(identity.kind, identity.networkId, identity.deviceId, identity.rawType, enabled, {
          beforeChange: async current => {
            if (!this.preferenceWorkAllowed() || current === enabled) throw new Error('Early Notification ownership changed');
            if (!this.earlyNotificationOriginals!.devices.some(row => settingKey(row) === key)) {
              await this.saveEarlyNotificationOriginals([...this.earlyNotificationOriginals!.devices, { ...identity, original: current }]);
              savedOriginal = true;
            }
            if (!this.preferenceWorkAllowed()) throw new Error('Early Notification ownership changed');
          },
        });
        // A refused POST reconciled by GET does not own another actor's change.
        if (savedOriginal && !result.changed) {
          await this.saveEarlyNotificationOriginals(this.earlyNotificationOriginals!.devices.filter(row => settingKey(row) !== key));
        }
        if (result.supported && result.compatible && result.current === enabled && this.preferenceWorkAllowed()) {
          if (!enabled) this.earlyNotificationOffSince.set(binding, result.changed ? Date.now() : previouslyOffSince ?? Date.now());
          this.report(enabled ? 'early-notification-confirmed-on' : 'early-notification-confirmed-off', { camera: device.binding.nativeName });
        } else this.report('early-notification-unsupported', { camera: device.binding.nativeName });
      } catch (error) { this.report(`early-notification-${preferenceFailure(error)}-faulted`, { camera: device.binding.nativeName }); }
    }
  }

  /** Explicit operator retry; ordinary status recovery keeps its current subscription. */
  async retryConnection(): Promise<void> {
    if (this.stopped) throw new Error('Native runtime stopped');
    await withinRequestBudget(Promise.allSettled([...this.policyChanges]), { deadline: Date.now() + REMOTE_OPERATION_LEASE_MS });
    if (this.failed) {
      this.persistenceRecovery ??= this.recoverPersistence().finally(() => { this.persistenceRecovery = undefined; });
      await this.persistenceRecovery;
    }
    await this.reconcileKnownOperations();
    if (this.stopped) return;
    if (this.active && [...this.devices.values()].some(device => device.settings.exposeMotionDetected || device.settings.homeKitSecureVideo)) {
      await this.source.reconnect();
    }
    this.startPreferenceReconciliation();
  }

  private async recoverPersistence(): Promise<void> {
    try {
      await this.commit(next => {
        next.core = this.core.snapshot();
        for (const [moduleId, owner] of this.owners) {
          if (next.nativeByModule[moduleId]) next.nativeByModule[moduleId].state = owner.snapshot();
        }
      });
      await this.options.client.retryRemoteOperationPersistence();
      for (const owner of this.owners.values()) await owner.retryPersistence();
      await this.core.retryPersistence();
      this.failed = false;
      this.report('persistence-recovered');
      this.pumpDelivery();
    } catch (error) { this.failed = true; throw error; }
  }

  policyChanged(cameraId: string, policy: NativeRecordingPolicy): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const change = this.applyPolicyChange(cameraId, policy);
    this.policyChanges.add(change);
    void change.then(() => this.policyChanges.delete(change), () => this.policyChanges.delete(change));
    return change;
  }

  private async applyPolicyChange(cameraId: string, policy: NativeRecordingPolicy): Promise<void> {
    const device = [...this.devices.values()].find(item => item.binding.cameraId === cameraId);
    if (!device) return;
    this.report(policy.allowed ? 'home-policy-allowed' : 'home-policy-inactive', { camera: device.binding.nativeName });
    const previousEpoch = this.policyEpochs.get(cameraId);
    this.policyEpochs.set(cameraId, policy.epoch);
    const cancel = !policy.allowed || (previousEpoch !== undefined && previousEpoch !== policy.epoch);
    const oldAssets = cancel ? this.state.downloads.filter(item => item.cameraId === cameraId) : [];
    if (cancel) this.enabledSince.delete(cameraId);
    // The permission period starts at the policy transition, before local I/O.
    if (policy.allowed && !this.enabledSince.has(cameraId)) this.enabledSince.set(cameraId, Date.now());
    if (cancel) {
      if (device.nativeStorage) await this.core.cancelCamera(device.nativeStorage.moduleId, cameraId);
      for (const asset of oldAssets) await this.removeOwnedAsset(asset);
    }
    this.pumpDelivery();
  }

  deliveryOutcome(outcome: string, cameraId?: string, event?: NativeRecordingDeliveryEvent): void {
    const device = [...this.devices.values()].find(item => item.binding.cameraId === cameraId);
    this.report(`home-${outcome}`, { camera: device?.binding.nativeName, flow: event?.metadata?.logFlow });
    this.pumpDelivery();
  }

  private observationContext(event: NativeRecordingObservation, attempt?: number): NativeRecordingLogContext {
    const device = [...this.devices.values()].find(item => item.binding.cameraId === event.cameraId);
    return { camera: device?.binding.nativeName,
      flow: `flow-${createHash('sha256').update(this.logSalt).update(observationKey(event)).digest('hex').slice(0, 10)}`, attempt };
  }

  private report(event: string, context?: NativeRecordingLogContext): void {
    try { this.options.report(event, context); }
    catch { /* Logging cannot change acquisition, delivery, or persistence ownership. */ }
  }

  /** New runtimes still pass the shared physical-write and SDK ownership guards. */
  get localWriterReleased(): boolean { return this.writerReleased; }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopped = true; this.active = false;
    if (this.deliveryTimer) globalThis.clearTimeout(this.deliveryTimer);
    this.deliveryTimer = undefined;
    this.stopping = (async () => {
      const deadline = Date.now() + REMOTE_OPERATION_LEASE_MS;
      try {
        await withinRequestBudget((async () => {
          const results = await Promise.allSettled([this.source?.stop(), this.recovery, this.persistenceRecovery, this.preferences,
            ...[...this.devices.values()].map(device => device.recording()?.invalidateDelivery()), ...this.policyChanges]);
          results.push(...await Promise.allSettled([this.core?.stop()]));
          await this.delivery;
          await this.writes;
          const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
          if (failed) throw failed.reason;
        })(), { deadline });
      } finally {
        try {
          await withinRequestBudget(this.releaseOwnership?.({ deadline }) ?? Promise.resolve(), { deadline });
        } finally {
          try { await withinRequestBudget(this.writes, { deadline }); }
          finally { this.writerReleased = true; }
        }
      }
    })();
    return this.stopping;
  }

  private async receive(notification: FcmNotification, signal: globalThis.AbortSignal): Promise<void> {
    this.report('push-received');
    if (!this.active || this.stopped || this.failed || signal.aborted || !this.currentScope()
      || notification.scope.accountId !== this.options.scope.accountId || notification.scope.clientId !== this.options.scope.clientId
      || notification.scope.tier !== this.options.scope.tier) { this.report('motion-suppressed-runtime-unavailable'); return; }
    const decoded = decodeBlinkMotionMessage(notification, { accountId: this.options.scope.accountId, tier: this.options.scope.tier,
      resolveDevice: identity => {
        const candidates = [...this.devices.values()].filter(item => item.binding.providerId === identity.providerId
          && item.binding.target === identity.target && (identity.networkId === undefined || item.binding.networkId === identity.networkId));
        return candidates.length === 1 ? candidates[0].binding : undefined;
      } });
    if (decoded.status !== 'motion') { this.report(`motion-${decoded.reason}`); return; }
    const device = this.devices.get(bindingKey(decoded.device))!;
    if (device.settings.exposeMotionDetected) { try { device.motion(); } catch { this.report('public-motion-failed'); } }
    const context = this.observationContext({ ...decoded.observation, moduleId: device.nativeStorage?.moduleId ?? '' });
    this.report('motion-decoded', context);
    const recording = device.recording();
    const suppression = !device.settings.homeKitSecureVideo ? 'hsv-disabled' : !recording?.policy.allowed ? 'home-policy-inactive'
      : decoded.eventType !== 'native-usb' ? 'event-not-native' : !device.nativeStorage ? 'missing-module'
        : decoded.observation.occurredAt < (this.enabledSince.get(decoded.device.cameraId) ?? Infinity) ? 'stale-permission-period' : undefined;
    if (suppression) { this.report(`motion-suppressed-${suppression}`, context); return; }
    if (!recording || !device.nativeStorage) return;
    const observation = { ...decoded.observation, moduleId: device.nativeStorage.moduleId };
    const key = observationKey(observation);
    const previousEpoch = this.epochs.get(key);
    if (previousEpoch === undefined) this.epochs.set(key, recording.policy.epoch);
    const confirmedOffSince = this.earlyNotificationOffSince.get(bindingKey(device.binding));
    const initialDelayMs = device.settings.earlyNotificationMode === 'off' && confirmedOffSince !== undefined && observation.occurredAt >= confirmedOffSince
      ? 0 : this.options.config.initialDelayMs;
    const fallbackAt = observation.occurredAt + this.options.config.initialDelayMs;
    const result = await this.core.observe(observation, this.core.cameraGeneration(observation.moduleId, observation.cameraId),
      { initialDelayMs, ...(initialDelayMs === 0 && fallbackAt > Date.now() ? { fallbackAt } : {}) });
    if (result !== 'accepted' && previousEpoch === undefined) this.epochs.delete(key);
    this.report(result === 'accepted' ? 'acquisition-queued' : `motion-job-${result}`, context);
  }

  private matching(event: NativeRecordingObservation, fallbackAt?: number) {
    const device = [...this.devices.values()].find(item => item.binding.cameraId === event.cameraId && item.nativeStorage?.moduleId === event.moduleId);
    const cached = this.catalogs.get(event.moduleId);
    if (!device || !cached) return { status: 'missing' as const };
    const camera: NativeMotionDevice = { ...device.binding, ...device.nativeStorage! };
    return matchNativeClip({ catalog: cached.catalog, camera,
      devices: this.matchingDevices,
      // The provider has not proved whether a late notification's timestamp is
      // the clip start. Before the ordinary delay, import only an exact match.
      scope: { ...camera }, occurredAt: event.occurredAt,
      // A refused newer request cannot make the old successful catalog fresh.
      toleranceMs: fallbackAt !== undefined && cached.startedAt < fallbackAt
        ? 0 : this.options.config.matchToleranceMs,
      consumedClipIdentities: new Set(this.state.consumed) });
  }

  private earliest(event: NativeRecordingObservation, fallbackAt?: number): number {
    if (!this.active || this.failed) return Date.now() + 1000;
    const remote = this.options.client.getRemoteOperationState();
    if ((remote.liveView && isRemoteOperationLeaseActive(remote.liveView.expiresAt))
      || (remote.stateCommand && isRemoteOperationLeaseActive(remote.stateCommand.expiresAt))
      || remote.storage.some(owner => isRemoteOperationLeaseActive(owner.expiresAt)) || !this.currentScope()) return Date.now() + 1000;
    if ((this.state.refusedUntil[event.moduleId] ?? 0) > Date.now()) return this.state.refusedUntil[event.moduleId];
    const device = [...this.devices.values()].find(item => item.binding.cameraId === event.cameraId && item.nativeStorage?.moduleId === event.moduleId);
    if (!device?.recording()?.available || this.state.downloads.some(asset => asset.cameraId === event.cameraId)
      || this.cacheBytes + 32 * 1024 * 1024 > this.options.config.maxCachedBytes) return Date.now() + 1000;
    if (this.matching(event, fallbackAt).status === 'matched') return Date.now();
    return Math.max(Date.now(), (this.state.catalogStartedAt[event.moduleId] ?? 0) + this.options.config.catalogRefreshMs);
  }

  private async acquire(request: NativeRecordingAcquisition, signal: globalThis.AbortSignal): Promise<NativeRecordingAcquisitionResult> {
    const event = request.observation;
    const device = [...this.devices.values()].find(item => item.binding.cameraId === event.cameraId && item.nativeStorage?.moduleId === event.moduleId);
    const owner = this.owners.get(event.moduleId), policyEpoch = this.epochs.get(observationKey(event));
    // A storage fault aborts execution without revoking the camera's permission period.
    const permitted = () => this.active && !this.stopped && this.currentScope()
      && !!device?.recording()?.policy.allowed && device.recording()!.policy.epoch === policyEpoch
      && this.core.cameraGeneration(event.moduleId, event.cameraId) === request.cameraGeneration;
    const allowed = () => permitted() && !this.failed && !signal.aborted
      && this.core.isCameraGenerationCurrent(event.moduleId, event.cameraId, request.cameraGeneration);
    const unresolved = (notDispatched?: true): NativeRecordingAcquisitionResult => {
      if (!notDispatched) return { status: 'unresolved' };
      return { status: permitted() ? 'deferred' : 'skipped' };
    };
    if (!device || !owner || policyEpoch === undefined || !permitted()) return { status: 'skipped' };
    if (this.failed) return { status: 'deferred' };
    if (!allowed()) return { status: 'skipped' };
    const context = { accountId: device.binding.accountId, networkId: device.binding.networkId, syncModuleId: device.nativeStorage!.syncModuleId };
    let match = this.matching(event, request.fallbackAt);
    if (match.status !== 'matched') {
      const priorCatalogStart = this.state.catalogStartedAt[event.moduleId];
      const startedAt = Date.now();
      try { await this.commit(next => { next.catalogStartedAt[event.moduleId] = startedAt; }); }
      catch (error) {
        if (this.failed && permitted()) return { status: 'deferred' };
        throw error;
      }
      if (!permitted()) return { status: 'skipped' };
      if (this.failed) return { status: 'deferred' };
      if (!allowed()) return { status: 'skipped' };
      this.report('catalog-requested', this.observationContext(event, request.attempt));
      const result = await owner.readCatalog({ ...context, operationId: `${request.operationId}:catalog` }, { signal, deadline: request.expiresAt });
      if (result.status === 'abandoned') return { status: 'abandoned' };
      if (result.status === 'unresolved') return unresolved(result.notDispatched);
      if (result.status !== 'ready') {
        this.report(`catalog-${result.reason}`, this.observationContext(event, request.attempt));
        if (result.reason === 'not-started') {
          // Definite local admission refusal allocated no provider operation.
          // Requeue within the existing attempt/age bound, without inventing a
          // remote cooldown for a request that was never dispatched.
          await this.commit(next => {
            if (priorCatalogStart === undefined) delete next.catalogStartedAt[event.moduleId];
            else next.catalogStartedAt[event.moduleId] = priorCatalogStart;
          });
          return { status: 'missing' };
        }
        if (result.reason === 'refused') {
          await this.deferRefusal(event.moduleId); return { status: 'missing' };
        }
        return { status: 'skipped' };
      }
      this.report('catalog-ready', this.observationContext(event, request.attempt));
      this.catalogs.set(event.moduleId, { catalog: result.value, startedAt });
      match = this.matching(event, request.fallbackAt);
    }
    if (!allowed()) return { status: 'skipped' };
    if (match.status === 'missing') return { status: 'missing' };
    if (match.status !== 'matched') { this.report(`clip-${match.status}`, this.observationContext(event, request.attempt)); return { status: 'skipped' }; }
    if (match.captureTimeMs < (this.enabledSince.get(event.cameraId) ?? Infinity)) return { status: 'skipped' };
    this.report('download-started', this.observationContext(event, request.attempt));
    const result = await owner.downloadClip({ ...context, operationId: `${request.operationId}:clip` },
      { manifestId: match.manifestId, clip: match.clip }, { signal, deadline: request.expiresAt });
    if (result.status === 'abandoned') return { status: 'abandoned' };
    if (result.status === 'unresolved') return unresolved(result.notDispatched);
    if (result.status !== 'ready') {
      this.report(`download-${result.reason}`, this.observationContext(event, request.attempt));
      if (result.reason === 'refused') await this.deferRefusal(event.moduleId);
      return { status: result.reason === 'not-started' || result.reason === 'refused' ? 'missing' : 'skipped' };
    }
    const asset: DownloadedAsset = { logFlow: this.observationContext(event).flow, ...result.value, identity: match.identity, capturedAt: match.clip.capturedAt!, moduleId: event.moduleId,
      cameraId: event.cameraId, jobId: request.operationId, policyEpoch, cameraGeneration: request.cameraGeneration };
    await this.commit(next => { next.consumed = [...new Set([...next.consumed, asset.identity])].slice(-2048); next.downloads.push(asset); });
    this.cacheBytes += asset.bytes;
    this.report('downloaded', this.observationContext(event, request.attempt));
    if (!allowed()) await this.removeOwnedAsset(asset);
    else this.pumpDelivery();
    return { status: 'retrieved' };
  }

  private deferRefusal(moduleId: string): Promise<void> {
    // Refusal and no-send races consume the same finite attempt budget as a
    // terminal no-match; neither permits an unbounded hidden retry loop.
    return this.commit(next => { next.refusedUntil[moduleId] = Date.now() + this.options.config.catalogRefreshMs; });
  }

  private pumpDelivery(): void {
    if (this.delivering || this.stopped || this.failed) return;
    this.delivering = true;
    const delivery = (async () => {
      for (const asset of [...this.state.downloads]) {
        const device = [...this.devices.values()].find(item => item.binding.cameraId === asset.cameraId && item.nativeStorage?.moduleId === asset.moduleId);
        const recording = device?.recording();
        const current = () => this.active && !this.stopped && this.currentScope() && !!recording?.policy.allowed
          && recording.policy.epoch === asset.policyEpoch
          && this.core.cameraGeneration(asset.moduleId, asset.cameraId) === asset.cameraGeneration;
        if (!recording || !current()) { await this.removeOwnedAsset(asset); continue; }
        if (!recording.available) continue;
        const context = { camera: device?.binding.nativeName, flow: asset.logFlow };
        this.report('preparation-started', context);
        const result = await recording.offerDownloaded({ filePath: asset.reference, expectedBytes: asset.bytes, expectedSha256: asset.sha256 },
          { logFlow: asset.logFlow, jobId: asset.jobId, clipIdentity: asset.identity, capturedAt: asset.capturedAt, policyEpoch: asset.policyEpoch }, current);
        if (result.status === 'ready' || result.status === 'uncertain') this.report('prepared', context);
        this.report(result.status === 'ready' ? 'offered' : `delivery-${result.status}-${result.reason}`, context);
        await this.removeOwnedAsset(asset);
      }
    })().catch(() => { this.failed = true; this.report('local-delivery-faulted'); }).finally(() => {
      this.delivering = false;
      if (this.delivery === delivery) this.delivery = undefined;
      if (this.state.downloads.length && !this.stopped && !this.failed) this.deliveryTimer = globalThis.setTimeout(() => {
        this.deliveryTimer = undefined; this.pumpDelivery();
      }, 1000);
    });
    this.delivery = delivery;
  }

  private async removeOwnedAsset(asset: DownloadedAsset): Promise<void> {
    await this.removeCacheFile(asset);
    let removed = false;
    await this.commit(next => {
      removed = next.downloads.some(entry => entry.reference === asset.reference);
      next.downloads = next.downloads.filter(entry => entry.reference !== asset.reference);
    });
    if (removed) this.cacheBytes = Math.max(0, this.cacheBytes - asset.bytes);
  }

  private async removeCacheFile(file: { reference: string; bytes: number; sha256?: string }): Promise<void> {
    const orphan = file.sha256 === undefined;
    if (typeof file.reference !== 'string' || path.dirname(file.reference) !== this.cacheDirectory || !Number.isSafeInteger(file.bytes)
      || path.basename(file.reference) === '.DS_Store' || file.bytes < (orphan ? 0 : 1) || file.bytes > 32 * 1024 * 1024
      || (orphan ? !CACHE_ARTIFACT.test(path.basename(file.reference)) : !/^[a-f0-9]{64}$/.test(file.sha256!))) {
      throw new Error('Invalid owned recording cache entry');
    }
    try {
      const stat = await fs.lstat(file.reference);
      if (!stat.isFile() || stat.isSymbolicLink() || (process.getuid && (stat.uid !== process.getuid() || (orphan && (stat.mode & 0o077) !== 0)))
        || stat.size !== file.bytes) throw new Error('Recording cache identity changed');
      const handle = await fs.open(file.reference, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const opened = await handle.stat();
        if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size !== stat.size) throw new Error('Recording cache identity changed');
        if (!orphan) {
          const hash = createHash('sha256'), block = Buffer.alloc(64 * 1024);
          for (let offset = 0; offset < file.bytes;) {
            const { bytesRead } = await handle.read(block, 0, Math.min(block.length, file.bytes - offset), offset);
            if (!bytesRead) throw new Error('Recording cache file changed');
            hash.update(block.subarray(0, bytesRead)); offset += bytesRead;
          }
          if (hash.digest('hex') !== file.sha256) throw new Error('Recording cache content changed');
        }
        const current = await fs.lstat(file.reference);
        if (current.ino !== stat.ino || current.dev !== stat.dev || current.size !== stat.size || current.isSymbolicLink()) throw new Error('Recording cache identity changed');
      } finally { await handle.close(); }
      await fs.unlink(file.reference);
    } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
  }

  private async reconcileCache(): Promise<void> {
    // The native owner's durable result can precede the runtime's downloads index.
    for (const { state } of Object.values(this.state.nativeByModule)) {
      const operation = state.operation;
      if (operation?.kind === 'clip' && operation.phase === 'finished' && operation.result?.status === 'ready') {
        await this.removeCacheFile(operation.result.value as NativeStoredMedia);
      }
    }
    // A crash can also precede that result receipt, including atomic-link promotion.
    // Retire only generated regular/private artifacts; leave unexpected names and all remote receipts intact.
    for (const name of await fs.readdir(this.cacheDirectory)) {
      if (!CACHE_ARTIFACT.test(name)) continue;
      const reference = path.join(this.cacheDirectory, name), stat = await fs.lstat(reference);
      await this.removeCacheFile({ reference, bytes: stat.size });
      this.report('orphan-cache-retired');
    }
  }

  private async countCache(): Promise<void> {
    this.cacheBytes = 0;
    for (const name of await fs.readdir(this.cacheDirectory)) {
      if (name === '.DS_Store') continue;
      const stat = await fs.lstat(path.join(this.cacheDirectory, name));
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsupported entry in owned recording cache');
      this.cacheBytes += stat.size;
    }
    if (this.cacheBytes > this.options.config.maxCachedBytes) this.report('cache-capacity-exceeded');
  }

  private async privateDirectory(directory: string): Promise<void> {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(directory);
    const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
    if (!stat.isDirectory() || stat.isSymbolicLink() || (uid !== undefined && ((stat.mode & 0o777) !== 0o700 || stat.uid !== uid))) {
      throw new Error('Native recording directory must be private and owned by this process');
    }
  }

  /** Client/tier rotation cannot hide another durable obligation for the same Blink account. */
  private async assertPriorScopesSettled(): Promise<void> {
    const parent = path.dirname(this.directory), names = await fs.readdir(parent);
    if (names.length > 1024) throw new Error('Native recording scope inventory exceeded');
    for (const name of names) {
      if (name === '.DS_Store' || name === path.basename(this.directory) || !name.startsWith(`${this.options.scope.accountId}-`)) continue;
      const priorDirectory = path.join(parent, name), match = /^([1-9][0-9]*)-([1-9][0-9]*)-([a-z0-9]{4})$/i.exec(name);
      if (!match) throw new Error('Invalid prior native recording scope');
      const stat = await fs.lstat(priorDirectory), uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
      if (!stat.isDirectory() || stat.isSymbolicLink() || (uid !== undefined && (stat.uid !== uid || (stat.mode & 0o777) !== 0o700))) {
        throw new Error('Unsafe prior native recording scope');
      }
      let prior: NativeRecordingRuntimeState;
      try {
        const filename = path.join(priorDirectory, 'state.json'), file = await fs.lstat(filename);
        if (!file.isFile() || file.isSymbolicLink() || file.size > MAX_STATE_BYTES
          || (uid !== undefined && (file.uid !== uid || (file.mode & 0o777) !== 0o600))) throw new Error('Unsafe prior native recording state');
        prior = await readOwnerOnlyJsonFile<NativeRecordingRuntimeState>(filename);
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') continue;
        throw error;
      }
      if (!prior || prior.version !== 1 || !prior.scope || prior.scope.accountId !== Number(match[1])
        || prior.scope.clientId !== Number(match[2]) || prior.scope.tier !== match[3]
        || !Number.isSafeInteger(prior.scope.clientId) || prior.scope.clientId <= 0
        || !prior.nativeByModule || typeof prior.nativeByModule !== 'object' || Array.isArray(prior.nativeByModule)
        || (prior.remoteOperations !== undefined && (!prior.remoteOperations || typeof prior.remoteOperations !== 'object'
          || Array.isArray(prior.remoteOperations)))
        || (prior.core !== undefined && (!prior.core || prior.core.version !== 1 || !Array.isArray(prior.core.queue)))) {
        throw new Error('Invalid prior native recording state');
      }
      const terminal = (state?: NativeStorageState) => state?.version === 1 && (!state.operation
        || state.operation.phase === 'abandoned' || !isRemoteOperationLeaseActive(state.operation.expiresAt)
        || (state.operation.phase === 'finished' && ['ready', 'failed'].includes(state.operation.result?.status ?? '')));
      const pendingNative = Object.entries(prior.nativeByModule).some(([moduleId, entry]) => !entry || !entry.scope || !entry.state
        || entry.scope.accountId !== this.options.scope.accountId || entry.state.version !== 1
        || !Number.isSafeInteger(entry.scope.networkId) || entry.scope.networkId <= 0
        || !Number.isSafeInteger(entry.scope.syncModuleId) || entry.scope.syncModuleId <= 0
        || moduleId !== `${entry.scope.networkId}:${entry.scope.syncModuleId}`
        || (entry.state.operation !== undefined && (!terminal(entry.state)
          || entry.state.operation.accountId !== entry.scope.accountId || entry.state.operation.networkId !== entry.scope.networkId
          || entry.state.operation.syncModuleId !== entry.scope.syncModuleId)));
      const queued = prior.core?.queue?.[0], queuedModule = queued?.observation?.moduleId;
      const coreLease = prior.core?.operation && queued ? Math.min(prior.core.operation.startedAt + REMOTE_OPERATION_LEASE_MS,
        queued.observation.occurredAt + this.options.config.maxJobAgeMs) : undefined;
      if (isRemoteOperationLeaseActive(prior.remoteOperations?.liveView?.expiresAt)
        || isRemoteOperationLeaseActive(prior.remoteOperations?.stateCommand?.expiresAt) || pendingNative
        || (isRemoteOperationLeaseActive(coreLease) && queuedModule && !terminal(prior.nativeByModule[queuedModule]?.state))) {
        throw new Error('Prior client/tier scope has unresolved Blink operation ownership');
      }
      if (prior.remoteOperations?.liveView || prior.remoteOperations?.stateCommand || prior.core?.operation) this.report('prior-scope-operation-advisory');
    }
  }

  private currentScope(): boolean {
    const scope = this.options.client.getCachedIdentity();
    return scope.accountId === this.options.scope.accountId && scope.clientId === this.options.scope.clientId && scope.tier === this.options.scope.tier;
  }

  private commit(update: (state: NativeRecordingRuntimeState) => void): Promise<void> {
    const write = this.writes.then(async () => {
      if ((this.failed && !this.persistenceRecovery) || this.writerReleased) throw new Error('Native recording persistence unavailable');
      const next = clone(this.state); update(next);
      if (Buffer.byteLength(JSON.stringify(next)) > MAX_STATE_BYTES) throw new Error('Native recording state budget exceeded');
      await withinRequestBudget(this.writeStateFile(next), { deadline: Date.now() + REMOTE_OPERATION_LEASE_MS });
      if (this.writerReleased) throw new Error('Native recording writer was released');
      this.state = next;
      // Every module survives every shared write; no finished owner erases another fence.
      for (const entry of Object.values(next.nativeByModule)) this.options.client.setNativeStorageOwner(entry.scope, entry.state);
    });
    this.writes = write.catch(() => { this.failed = true; this.report('persistence-faulted'); });
    return write;
  }

  private writeStateFile(next: NativeRecordingRuntimeState | EarlyNotificationOriginals, filename = this.statePath): Promise<void> {
    const previous = stateFileWrites.get(filename) ?? Promise.resolve();
    const write = previous.catch(() => undefined).then(async () => {
      if (this.writerReleased) throw new Error('Native recording writer was released');
      await writeOwnerOnlyJsonFile(filename, next);
    });
    stateFileWrites.set(filename, write);
    void write.finally(() => { if (stateFileWrites.get(filename) === write) stateFileWrites.delete(filename); }).catch(() => undefined);
    return write;
  }
}
