import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import type { BlinkApi, BlinkRemoteOperationOwnership } from './blink-api/client';
import { FcmEventSource, type FcmEventSourceOptions } from './blink-api/fcm/source';
import type { FcmNotification, FcmReceiverState, FcmScope, FirebaseConfig } from './blink-api/fcm/types';
import { decodeBlinkMotionMessage, isBlinkMotionDevice, isNativeMotionDevice, type BlinkMotionDevice, type NativeMotionDevice } from './blink-api/motion-events';
import { matchNativeClip } from './blink-api/native-clip-matcher';
import { NativeStorageOwner, type NativeStorageCatalog, type NativeStorageScope, type NativeStorageState } from './blink-api/native-storage';
import { readOwnerOnlyJsonFile, writeOwnerOnlyJsonFile } from './blink-api/secure-json-file';
import { NativeRecordingCoordinator, type NativeRecordingAcquisition, type NativeRecordingAcquisitionResult,
  type NativeRecordingObservation, type NativeRecordingState } from './native-recording-coordinator';
import type { NativeRecordingConfig, NativeRecordingDevicePolicy } from './native-recording-config';
import type { NativeRecordingDelegate, NativeRecordingPolicy } from './accessories/native-recording-delegate';

export interface NativeRuntimeDevice {
  binding: BlinkMotionDevice;
  nativeStorage?: { moduleId: string; syncModuleId: number };
  settings: NativeRecordingDevicePolicy;
  motion(): void;
  recording(): NativeRecordingDelegate | undefined;
}
type RuntimeClient = Pick<BlinkApi, 'getCachedIdentity' | 'registerMotionNotificationKey' | 'createNativeStorageTransport'
  | 'withNativeStorageAdmission' | 'setNativeStorageOwner' | 'configureRemoteOperationOwnership' | 'reconcileKnownStateCommand'
  | 'getRemoteOperationState'>;
interface DownloadedAsset {
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
  report(event: string): void;
  /** Explicit offline transport qualification; production uses the isolated receiver. */
  eventSourceFactory?: (options: FcmEventSourceOptions) => Pick<FcmEventSource, 'setDemand' | 'stop'>;
}

const MAX_STATE_BYTES = 4 * 1024 * 1024;
const clone = <T>(value: T): T => globalThis.structuredClone(value);
const bindingKey = (binding: BlinkMotionDevice): string => JSON.stringify([binding.providerId, binding.target, binding.networkId]);
const observationKey = (event: NativeRecordingObservation): string => JSON.stringify([event.moduleId, event.cameraId, event.eventId]);

/** Account composition: one writer, one FIFO, per-module protocol owners, no idle catalogs. */
export class NativeRecordingRuntime {
  private state!: NativeRecordingRuntimeState;
  private core!: NativeRecordingCoordinator;
  private source!: Pick<FcmEventSource, 'setDemand' | 'stop'>;
  private readonly owners = new Map<string, NativeStorageOwner>();
  private readonly devices = new Map<string, NativeRuntimeDevice>();
  private readonly matchingDevices: readonly NativeMotionDevice[];
  private readonly catalogs = new Map<string, NativeStorageCatalog>();
  private readonly epochs = new Map<string, number>();
  private readonly enabledSince = new Map<string, number>();
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
  private cacheBytes = 0;
  private releaseOwnership?: () => Promise<void>;
  readonly directory: string;
  private cachePath: string;
  get cacheDirectory(): string { return this.cachePath; }
  private readonly statePath: string;

  private constructor(private readonly options: NativeRecordingRuntimeOptions) {
    if (!Number.isSafeInteger(options.scope.accountId) || options.scope.accountId <= 0 || !Number.isSafeInteger(options.scope.clientId)
      || options.scope.clientId <= 0 || !/^[a-z0-9]{4}$/i.test(options.scope.tier)) throw new Error('Native recording requires a cached account/client scope');
    this.directory = path.join(options.storagePath, '.blink-native-recording', `${options.scope.accountId}-${options.scope.clientId}-${options.scope.tier}`);
    this.cachePath = path.join(this.directory, 'downloads');
    this.statePath = path.join(this.directory, 'state.json');
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
    await this.privateDirectory(path.join(this.options.storagePath, '.blink-native-recording'));
    await this.privateDirectory(this.directory);
    await this.privateDirectory(this.cacheDirectory);
    this.cachePath = await fs.realpath(this.cacheDirectory);
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
      earliestAcquisitionAt: event => this.earliest(event),
      acquire: (request, signal) => this.acquire(request, signal),
      saveState: core => this.commit(next => { next.core = clone(core); }),
      onError: () => this.options.report('acquisition-faulted'),
      onJobFinished: result => { this.epochs.delete(observationKey(result.observation)); this.options.report(`job-${result.outcome}`); },
    });
    // Old permission-period work is never republished on startup. Unknown remote
    // ownership stays represented by a cancelled head until terminal proof.
    for (const job of this.core.snapshot().queue) await this.core.cancelCamera(job.observation.moduleId, job.observation.cameraId);
    for (const asset of [...this.state.downloads]) await this.removeOwnedAsset(asset);
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
      onAudit: event => this.options.report(`push-${event.event}${event.reason ? `:${event.reason}` : ''}`
        + `${event.disposition ? `:${event.disposition}` : ''}${event.retryInMs !== undefined ? `:retry-ms=${event.retryInMs}` : ''}`),
    });
  }

  async start(): Promise<void> {
    if (this.stopped) throw new Error('Native runtime stopped');
    if (this.active) return;
    const ordinary = await this.options.client.reconcileKnownStateCommand();
    if (ordinary.commandId !== undefined && !ordinary.confirmed) this.options.report('ordinary-recovery-required');
    // Only existing command IDs may be examined during recovery; no new prepare.
    for (const owner of this.owners.values()) await owner.reconcilePending();
    const operation = this.core.snapshot().operation;
    if (operation) {
      const job = this.core.snapshot().queue[0];
      const state = this.owners.get(job.observation.moduleId)?.snapshot().operation;
      if (!state || state.phase === 'finished') {
        await this.core.resolveOperation({ moduleId: job.observation.moduleId, operationId: operation.operationId,
          status: 'verified-terminal', result: { status: 'skipped' } });
      } else this.options.report('recovery-required');
    }
    this.active = true;
    for (const device of this.devices.values()) {
      const policy = device.recording()?.policy;
      if (policy) this.policyEpochs.set(device.binding.cameraId, policy.epoch);
      if (policy?.allowed) this.enabledSince.set(device.binding.cameraId, Date.now());
    }
    await this.source.setDemand({ motionAccessory: [...this.devices.values()].some(device => device.settings.exposeMotionDetected),
      hsv: [...this.devices.values()].some(device => device.settings.homeKitSecureVideo) });
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

  deliveryOutcome(outcome: string): void { this.options.report(`home-${outcome}`); this.pumpDelivery(); }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopped = true; this.active = false;
    if (this.deliveryTimer) globalThis.clearTimeout(this.deliveryTimer);
    this.deliveryTimer = undefined;
    this.stopping = (async () => {
      const results = await Promise.allSettled([this.source?.stop(), this.core?.stop(),
        ...[...this.devices.values()].map(device => device.recording()?.invalidateDelivery()), ...this.policyChanges]);
      await this.delivery;
      await this.writes;
      const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failed) throw failed.reason;
      await this.releaseOwnership?.();
    })();
    return this.stopping;
  }

  private async receive(notification: FcmNotification, signal: globalThis.AbortSignal): Promise<void> {
    if (!this.active || this.stopped || this.failed || signal.aborted || !this.currentScope()
      || notification.scope.accountId !== this.options.scope.accountId || notification.scope.clientId !== this.options.scope.clientId
      || notification.scope.tier !== this.options.scope.tier) return;
    const decoded = decodeBlinkMotionMessage(notification, { accountId: this.options.scope.accountId, tier: this.options.scope.tier,
      resolveDevice: identity => {
        const candidates = [...this.devices.values()].filter(item => item.binding.providerId === identity.providerId
          && item.binding.target === identity.target && (identity.networkId === undefined || item.binding.networkId === identity.networkId));
        return candidates.length === 1 ? candidates[0].binding : undefined;
      } });
    if (decoded.status !== 'motion') { this.options.report(`motion-${decoded.reason}`); return; }
    const device = this.devices.get(bindingKey(decoded.device))!;
    if (device.settings.exposeMotionDetected) { try { device.motion(); } catch { this.options.report('public-motion-failed'); } }
    const recording = device.recording();
    if (!device.settings.homeKitSecureVideo || !recording?.policy.allowed || decoded.eventType !== 'native-usb' || !device.nativeStorage
      || decoded.observation.occurredAt < (this.enabledSince.get(decoded.device.cameraId) ?? Infinity)) return;
    const observation = { ...decoded.observation, moduleId: device.nativeStorage.moduleId };
    const key = observationKey(observation);
    const previousEpoch = this.epochs.get(key);
    if (previousEpoch === undefined) this.epochs.set(key, recording.policy.epoch);
    const result = await this.core.observe(observation, this.core.cameraGeneration(observation.moduleId, observation.cameraId));
    if (result !== 'accepted') { if (previousEpoch === undefined) this.epochs.delete(key); this.options.report(`motion-job-${result}`); }
  }

  private matching(event: NativeRecordingObservation) {
    const device = [...this.devices.values()].find(item => item.binding.cameraId === event.cameraId && item.nativeStorage?.moduleId === event.moduleId);
    const catalog = this.catalogs.get(event.moduleId);
    if (!device || !catalog) return { status: 'missing' as const };
    const camera: NativeMotionDevice = { ...device.binding, ...device.nativeStorage! };
    return matchNativeClip({ catalog, camera,
      devices: this.matchingDevices,
      scope: { ...camera }, occurredAt: event.occurredAt, toleranceMs: this.options.config.matchToleranceMs,
      consumedClipIdentities: new Set(this.state.consumed) });
  }

  private earliest(event: NativeRecordingObservation): number {
    if (!this.active) return Date.now() + 1000;
    const remote = this.options.client.getRemoteOperationState();
    if (remote.persistenceFailed || remote.liveView || remote.stateCommand || remote.storage.length || !this.currentScope()) return Date.now() + 1000;
    if ((this.state.refusedUntil[event.moduleId] ?? 0) > Date.now()) return this.state.refusedUntil[event.moduleId];
    const device = [...this.devices.values()].find(item => item.binding.cameraId === event.cameraId && item.nativeStorage?.moduleId === event.moduleId);
    if (!device?.recording()?.available || this.state.downloads.some(asset => asset.cameraId === event.cameraId)
      || this.cacheBytes + 32 * 1024 * 1024 > this.options.config.maxCachedBytes) return Date.now() + 1000;
    if (this.matching(event).status === 'matched') return Date.now();
    return Math.max(Date.now(), (this.state.catalogStartedAt[event.moduleId] ?? 0) + this.options.config.catalogRefreshMs);
  }

  private async acquire(request: NativeRecordingAcquisition, signal: globalThis.AbortSignal): Promise<NativeRecordingAcquisitionResult> {
    const event = request.observation;
    const device = [...this.devices.values()].find(item => item.binding.cameraId === event.cameraId && item.nativeStorage?.moduleId === event.moduleId);
    const owner = this.owners.get(event.moduleId), policyEpoch = this.epochs.get(observationKey(event));
    const allowed = () => this.active && !this.stopped && !this.failed && !signal.aborted && this.currentScope()
      && !!device?.recording()?.policy.allowed && device.recording()!.policy.epoch === policyEpoch
      && this.core.isCameraGenerationCurrent(event.moduleId, event.cameraId, request.cameraGeneration);
    if (!device || !owner || policyEpoch === undefined || !allowed()) return { status: 'skipped' };
    const context = { accountId: device.binding.accountId, networkId: device.binding.networkId, syncModuleId: device.nativeStorage!.syncModuleId };
    let match = this.matching(event);
    if (match.status !== 'matched') {
      const priorCatalogStart = this.state.catalogStartedAt[event.moduleId];
      await this.commit(next => { next.catalogStartedAt[event.moduleId] = Date.now(); });
      const result = await owner.readCatalog({ ...context, operationId: `${request.operationId}:catalog` }, { signal });
      if (result.status === 'unresolved') return { status: 'unresolved' };
      if (result.status !== 'ready') {
        this.options.report(`catalog-${result.reason}`);
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
      this.catalogs.set(event.moduleId, result.value);
      match = this.matching(event);
    }
    if (!allowed()) return { status: 'skipped' };
    if (match.status === 'missing') return { status: 'missing' };
    if (match.status !== 'matched') { this.options.report(`clip-${match.status}`); return { status: 'skipped' }; }
    if (match.captureTimeMs < (this.enabledSince.get(event.cameraId) ?? Infinity)) return { status: 'skipped' };
    const result = await owner.downloadClip({ ...context, operationId: `${request.operationId}:clip` },
      { manifestId: match.manifestId, clip: match.clip }, { signal });
    if (result.status === 'unresolved') return { status: 'unresolved' };
    if (result.status !== 'ready') {
      this.options.report(`download-${result.reason}`);
      if (result.reason === 'refused') await this.deferRefusal(event.moduleId);
      return { status: result.reason === 'not-started' || result.reason === 'refused' ? 'missing' : 'skipped' };
    }
    const asset: DownloadedAsset = { ...result.value, identity: match.identity, capturedAt: match.clip.capturedAt!, moduleId: event.moduleId,
      cameraId: event.cameraId, jobId: request.operationId, policyEpoch, cameraGeneration: request.cameraGeneration };
    await this.commit(next => { next.consumed = [...new Set([...next.consumed, asset.identity])].slice(-2048); next.downloads.push(asset); });
    this.cacheBytes += asset.bytes;
    this.options.report('downloaded');
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
        if (!recording?.policy.allowed || recording.policy.epoch !== asset.policyEpoch
          || !this.core.isCameraGenerationCurrent(asset.moduleId, asset.cameraId, asset.cameraGeneration)) { await this.removeOwnedAsset(asset); continue; }
        if (!recording.available) continue;
        const result = await recording.offerDownloaded({ filePath: asset.reference, expectedBytes: asset.bytes, expectedSha256: asset.sha256 },
          { jobId: asset.jobId, clipIdentity: asset.identity, capturedAt: asset.capturedAt, policyEpoch: asset.policyEpoch });
        if (result.status === 'ready' || result.status === 'uncertain') this.options.report('prepared');
        this.options.report(result.status === 'ready' ? 'offered' : `delivery-${result.status}-${result.reason}`);
        await this.removeOwnedAsset(asset);
      }
    })().catch(() => { this.failed = true; this.options.report('local-delivery-faulted'); }).finally(() => {
      this.delivering = false;
      if (this.delivery === delivery) this.delivery = undefined;
      if (this.state.downloads.length && !this.stopped && !this.failed) this.deliveryTimer = globalThis.setTimeout(() => {
        this.deliveryTimer = undefined; this.pumpDelivery();
      }, 1000);
    });
    this.delivery = delivery;
  }

  private async removeOwnedAsset(asset: DownloadedAsset): Promise<void> {
    if (typeof asset.reference !== 'string' || path.dirname(asset.reference) !== this.cacheDirectory || !Number.isSafeInteger(asset.bytes)
      || path.basename(asset.reference) === '.DS_Store' || asset.bytes < 1 || asset.bytes > 32 * 1024 * 1024
      || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error('Invalid owned recording cache entry');
    try {
      const stat = await fs.lstat(asset.reference);
      if (!stat.isFile() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid()) || stat.size !== asset.bytes) throw new Error('Recording cache identity changed');
      const handle = await fs.open(asset.reference, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const opened = await handle.stat(), hash = createHash('sha256'), block = Buffer.alloc(64 * 1024);
        if (opened.ino !== stat.ino || opened.dev !== stat.dev) throw new Error('Recording cache identity changed');
        for (let offset = 0; offset < asset.bytes;) {
          const { bytesRead } = await handle.read(block, 0, Math.min(block.length, asset.bytes - offset), offset);
          if (!bytesRead) throw new Error('Recording cache file changed');
          hash.update(block.subarray(0, bytesRead)); offset += bytesRead;
        }
        if (hash.digest('hex') !== asset.sha256) throw new Error('Recording cache content changed');
        const current = await fs.lstat(asset.reference);
        if (current.ino !== stat.ino || current.dev !== stat.dev || current.isSymbolicLink()) throw new Error('Recording cache identity changed');
      } finally { await handle.close(); }
      await fs.unlink(asset.reference);
    } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
    let removed = false;
    await this.commit(next => {
      removed = next.downloads.some(entry => entry.reference === asset.reference);
      next.downloads = next.downloads.filter(entry => entry.reference !== asset.reference);
    });
    if (removed) this.cacheBytes = Math.max(0, this.cacheBytes - asset.bytes);
  }

  private async countCache(): Promise<void> {
    this.cacheBytes = 0;
    for (const name of await fs.readdir(this.cacheDirectory)) {
      if (name === '.DS_Store') continue;
      const stat = await fs.lstat(path.join(this.cacheDirectory, name));
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsupported entry in owned recording cache');
      this.cacheBytes += stat.size;
    }
    if (this.cacheBytes > this.options.config.maxCachedBytes) this.options.report('cache-capacity-exceeded');
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
      const terminal = (state?: NativeStorageState) => state?.version === 1 && state.operation?.phase === 'finished'
        && ['ready', 'failed'].includes(state.operation.result?.status ?? '');
      const pendingNative = Object.entries(prior.nativeByModule).some(([moduleId, entry]) => !entry || !entry.scope || !entry.state
        || entry.scope.accountId !== this.options.scope.accountId || entry.state.version !== 1
        || !Number.isSafeInteger(entry.scope.networkId) || entry.scope.networkId <= 0
        || !Number.isSafeInteger(entry.scope.syncModuleId) || entry.scope.syncModuleId <= 0
        || moduleId !== `${entry.scope.networkId}:${entry.scope.syncModuleId}`
        || (entry.state.operation !== undefined && (!terminal(entry.state)
          || entry.state.operation.accountId !== entry.scope.accountId || entry.state.operation.networkId !== entry.scope.networkId
          || entry.state.operation.syncModuleId !== entry.scope.syncModuleId)));
      const queuedModule = prior.core?.queue?.[0]?.observation?.moduleId;
      if (prior.remoteOperations?.liveView !== undefined || prior.remoteOperations?.stateCommand !== undefined || pendingNative
        || (prior.core?.operation && (!queuedModule || !terminal(prior.nativeByModule[queuedModule]?.state)))) {
        throw new Error('Prior client/tier scope has unresolved Blink operation ownership');
      }
    }
  }

  private currentScope(): boolean {
    const scope = this.options.client.getCachedIdentity();
    return scope.accountId === this.options.scope.accountId && scope.clientId === this.options.scope.clientId && scope.tier === this.options.scope.tier;
  }

  private commit(update: (state: NativeRecordingRuntimeState) => void): Promise<void> {
    const write = this.writes.then(async () => {
      if (this.failed) throw new Error('Native recording persistence unavailable');
      const next = clone(this.state); update(next);
      if (Buffer.byteLength(JSON.stringify(next)) > MAX_STATE_BYTES) throw new Error('Native recording state budget exceeded');
      await writeOwnerOnlyJsonFile(this.statePath, next);
      this.state = next;
      // Every module survives every shared write; no finished owner erases another fence.
      for (const entry of Object.values(next.nativeByModule)) this.options.client.setNativeStorageOwner(entry.scope, entry.state);
    });
    this.writes = write.catch(() => { this.failed = true; this.options.report('persistence-faulted'); });
    return write;
  }
}
