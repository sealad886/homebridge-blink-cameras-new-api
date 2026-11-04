/** Durable native USB discovery and finite recording delivery; no camera wake/capture operations. */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { constants, promises as fs, type Stats } from 'node:fs';
import { availableParallelism } from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import type { CameraRecordingConfiguration } from 'homebridge';
import type { BlinkApi } from './blink-api/client';
import { normalizeNativeCameraToken, requireNativeStorageModule, type NativeStorageModule, type NativeClipDescriptor } from './blink-api/local-storage';
import { readOwnerOnlyJsonFile, writeOwnerOnlyJsonFile } from './blink-api/secure-json-file';
import { budgetedDelay, withinRequestBudget, type RequestOptions } from './operation-budget';
import { prepareSavedClip, type PreparedSavedClip } from './accessories/saved-clip-preparation';
import type { RecordingActivityReason, RecordingJobState } from './recording-readiness';

export const NATIVE_CLIP_LIMITS = Object.freeze({
  sourceBytes: 32 * 1024 * 1024, mediaBytes: 128 * 1024 * 1024, preparedMemoryBytes: 64 * 1024 * 1024,
  ledgerBytes: 4 * 1024 * 1024, queue: 64, cameraQueue: 16, moduleSeen: 2048, seen: 8192,
  maxAgeMs: 15 * 60 * 1000, commandMs: 120000, attempts: 5, pollMs: 30000,
});
export type NativeClipApi = Pick<BlinkApi, 'requestLocalStorageManifest' | 'getLocalStorageManifest' |
  'requestLocalStorageClip' | 'getPreparedLocalStorageClip' | 'getCommandStatus'>;
export interface NativeClipPolicySnapshot {
  permission: { epoch: string | number; recordingActive: boolean; cameraActive: boolean; audioActive: boolean; motionAllowed: boolean };
  configuration: { revision: string | number; value?: CameraRecordingConfiguration };
}
export interface NativeClipDeliveryMetadata {
  jobKey: string; cameraKey: string; capturedAt: string; clipIdentity: string;
}
export type NativeClipDeliveryResult = { status: 'delivered'; acknowledgedAt?: string } |
  { status: 'not-offered'; reason: 'busy' | 'configuration-changed' | 'unsupported-trigger-policy' } | { status: 'uncertain' };
export interface NativeClipCameraTarget {
  getPolicySnapshot(): NativeClipPolicySnapshot;
  /** Must return not-offered only when it has published no motion and sent no media. */
  deliverSavedClip(prepared: PreparedSavedClip, metadata: NativeClipDeliveryMetadata,
    policy: NativeClipPolicySnapshot, signal: globalThis.AbortSignal): Promise<NativeClipDeliveryResult>;
}
export interface NativeClipModule extends NativeStorageModule { label?: string; pollIntervalMs?: number; }
export interface NativeClipCamera extends NativeStorageModule {
  cameraKey: string; cameraId: string | number; providerName: string; label?: string;
}
export interface NativeClipRecorderOptions {
  /** Dedicated child directory is created here; other plugin data is never reclaimed. */
  storagePath: string;
  accountId: string | number;
  api: NativeClipApi;
  prepare?: typeof prepareSavedClip;
  now?: () => number;
  delay?: (ms: number, options: RequestOptions) => Promise<void>;
  logicalCpuCount?: number;
  /** Observer runs only after the ledger and its offer fence are durably persisted. */
  activityChanged?: (activity: NativeClipActivity) => void;
}
export type NativeClipJobState = RecordingJobState;
export type NativeClipReason = RecordingActivityReason;
type Reason = NativeClipReason;
interface CommandContext { startedAt: number; commandId?: number; }
interface ModuleState extends NativeStorageModule { request?: CommandContext; lastCatalogAt?: string; nextScanAt?: number; reason?: Reason; }
interface CameraState {
  identity: string; initialized: boolean; activatedAt: number; enabled: boolean; audioActive: boolean;
  generation: number; lastNativeClipAt?: string; lastDownloadAt?: string; lastPreparedAt?: string;
  lastOfferedAt?: string; lastAcknowledgedAt?: string; lastFailureAt?: string; reason?: Reason;
  baselineCompletedAt?: string; nativeStorageObservedAt?: string; lastExpiredAt?: string; lastExpiredReason?: 'expired';
}
interface Seen { moduleKey: string; cameraKey?: string; capturedAt: string; state: NativeClipJobState | 'observed'; }
interface Job {
  key: string; moduleKey: string; cameraKey: string; clip: NativeClipDescriptor; manifestId: string;
  generation: number; state: NativeClipJobState; createdAt: number; attempts: number; nextAttemptAt: number;
  request?: CommandContext; sourceBytes?: number; sourceSha256?: string; reason?: Reason;
  downloadedAt?: string; preparedAt?: string; offeredAt?: string; acknowledgedAt?: string; expiredAt?: string;
}
interface Ledger { version: 1; account: string; modules: Record<string, ModuleState>; cameras: Record<string, CameraState>;
  seen: Record<string, Seen>; jobs: Record<string, Job>; }
interface RegisteredCamera { identity: NativeClipCamera; token: string; target: NativeClipCameraTarget; epoch: string | number; }
interface Active { controller: globalThis.AbortController; promise: Promise<void>; reservation: number; preparedBytes: number; }
const terminal = (state: NativeClipJobState | 'observed') => ['observed', 'delivered', 'uncertain', 'failed', 'expired', 'cancelled'].includes(state);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const errno = (error: unknown, code: string) => (error as { code?: string })?.code === code;
const iso = (time: number) => new Date(time).toISOString();
const owner = (s: Stats) => typeof process.getuid !== 'function' || s.uid === process.getuid();

export interface NativeClipJobProgress {
  id: string; state: NativeClipJobState; capturedAt: string; discoveredAt: string;
  downloadedAt?: string; preparedAt?: string; offeredAt?: string; acknowledgedAt?: string; expiredAt?: string; reason?: NativeClipReason;
}
/** Detached activity snapshot. Only the platform composes/publishes the GUI report. */
export interface NativeClipActivity {
  updatedAt: string;
  queue: number; active: number; mediaBytes: number; reservedBytes: number; preparationLimit: number;
  modules: { id: string; key: string; label: string; baseline: 'pending' | 'complete'; lastCatalogAt?: string; reason?: Reason }[];
  cameras: { id: string; key: string; label: string; queued: number; delivered: number; uncertain: number; baseline: 'pending' | 'complete';
    baselineCompletedAt?: string; nativeStorageObservedAt?: string; job?: NativeClipJobProgress; lastExpiredAt?: string; lastExpiredReason?: 'expired';
    lastNativeClipAt?: string; lastDownloadAt?: string; lastPreparedAt?: string; lastOfferedAt?: string;
    lastAcknowledgedAt?: string; lastFailureAt?: string; reason?: Reason }[];
}

/** One owner per plugin/account. Call initialize before registration/start; stop before abandoning the owner. */
export class NativeClipRecorder {
  readonly preparationLimit: number;
  readonly directory: string;
  readonly ledgerPath: string;
  private ledger: Ledger;
  private readonly modules = new Map<string, NativeClipModule>();
  private readonly cameras = new Map<string, RegisteredCamera>();
  private readonly active = new Map<string, Active>();
  private readonly files = new Map<string, number>();
  private readonly moduleDownloads = new Set<string>();
  private readonly preparing = new Set<string>();
  private readonly progress = new Set<() => void>();
  private readonly now: () => number;
  private readonly delay: (ms: number, options: RequestOptions) => Promise<void>;
  private readonly prepare: typeof prepareSavedClip;
  private writes: Promise<void> = Promise.resolve();
  private scanPromise?: Promise<void>;
  private workPromise?: Promise<void>;
  private owner = new globalThis.AbortController();
  private initialized = false;
  private stopped = false;
  private automatic = false;
  private timer?: ReturnType<typeof globalThis.setTimeout>;
  private lastCamera = '';

  constructor(private readonly options: NativeClipRecorderOptions) {
    if (!/^[1-9][0-9]{0,63}$/.test(String(options.accountId))) throw new Error('Invalid native clip account');
    this.directory = path.join(path.resolve(options.storagePath), 'native-clips');
    this.ledgerPath = path.join(this.directory, 'ledger.json');
    this.ledger = { version: 1, account: String(options.accountId), modules: {}, cameras: {}, seen: {}, jobs: {} };
    this.now = options.now ?? Date.now; this.delay = options.delay ?? budgetedDelay; this.prepare = options.prepare ?? prepareSavedClip;
    this.preparationLimit = (options.logicalCpuCount ?? availableParallelism()) >= 4 ? 2 : 1;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const dir = await fs.lstat(this.directory);
    if (!dir.isDirectory() || dir.isSymbolicLink() || !owner(dir)) throw new Error('Native clip storage unavailable');
    await fs.chmod(this.directory, 0o700);
    try {
      const stats = await fs.lstat(this.ledgerPath);
      if (stats.size > NATIVE_CLIP_LIMITS.ledgerBytes) throw new Error('Native clip ledger unavailable');
      const value = await readOwnerOnlyJsonFile<Ledger>(this.ledgerPath);
      this.validateLedger(value); this.ledger = value;
    } catch (error) { if (!errno(error, 'ENOENT')) throw error; }
    for (const name of await fs.readdir(this.directory)) {
      if (name === '.DS_Store' || name === 'ledger.json' || name === 'health.json' || /^\.(ledger|health)\.json\.[a-f0-9-]+\.tmp$/.test(name)) continue;
      const stats = await fs.lstat(path.join(this.directory, name));
      if (!stats.isFile() || stats.isSymbolicLink() || !owner(stats) || (stats.mode & 0o777) !== 0o600) {
        throw new Error('Native clip storage unavailable');
      }
      // Unknown regular files consume capacity but are never removed by this owner.
      this.files.set(name, stats.size);
    }
    for (const job of Object.values(this.ledger.jobs)) {
      if (job.state === 'offered') { job.state = 'uncertain'; job.reason = 'delivery-uncertain'; this.updateSeen(job); }
      else if (!terminal(job.state)) job.state = 'queued';
      if (this.files.has(`${job.key}.partial`)) await this.removeOwned(job, 'partial');
    }
    this.initialized = true; await this.persist();
  }

  registerModule(module: NativeClipModule): void {
    this.requireInitialized(); const ids = requireNativeStorageModule(module);
    if (module.pollIntervalMs !== undefined && (!Number.isInteger(module.pollIntervalMs) || module.pollIntervalMs < 15000 || module.pollIntervalMs > 300000)) {
      throw new Error('Invalid native clip polling interval');
    }
    const key = this.moduleKey(ids); this.modules.set(key, { ...module, ...ids });
    this.ledger.modules[key] ??= { ...ids };
  }

  /** Platform must check canonical-token uniqueness against ALL physical cameras in this exact module, including excluded cameras. */
  registerCamera(camera: NativeClipCamera, target: NativeClipCameraTarget): void {
    this.requireInitialized(); requireNativeStorageModule(camera);
    if (typeof camera.cameraKey !== 'string' || !camera.cameraKey || camera.cameraKey.length > 128 ||
      !/^[1-9][0-9]{0,63}$/.test(String(camera.cameraId))) throw new Error('Invalid native clip camera');
    const token = normalizeNativeCameraToken(camera.providerName), policy = target.getPolicySnapshot();
    const identity = digest([this.ledger.account, camera.networkId, camera.syncModuleId, String(camera.cameraId)]);
    const previous = this.ledger.cameras[camera.cameraKey];
    if (previous && previous.identity !== identity) throw new Error('Native clip camera identity changed');
    this.cameras.set(camera.cameraKey, { identity: { ...camera }, token, target, epoch: policy.permission.epoch });
    this.ledger.cameras[camera.cameraKey] ??= { identity, initialized: false, activatedAt: this.now(),
      enabled: policy.permission.recordingActive && policy.permission.cameraActive && policy.permission.motionAllowed,
      audioActive: policy.permission.audioActive, generation: 0 };
  }

  async unregisterCamera(cameraKey: string): Promise<void> {
    await this.cancelCamera(cameraKey, 'camera-unregistered'); this.cameras.delete(cameraKey); await this.persist();
  }

  /** Call synchronously from each permission/config setter; abortion happens before this promise yields. */
  async notifyPolicyChanged(cameraKey: string): Promise<void> {
    const registered = this.cameras.get(cameraKey), camera = this.ledger.cameras[cameraKey];
    if (!registered || !camera) return;
    const policy = registered.target.getPolicySnapshot();
    const enabled = policy.permission.recordingActive && policy.permission.cameraActive && policy.permission.motionAllowed;
    const changed = registered.epoch !== policy.permission.epoch || enabled !== camera.enabled || policy.permission.audioActive !== camera.audioActive;
    registered.epoch = policy.permission.epoch;
    if (changed) {
      camera.generation++; camera.activatedAt = this.now(); camera.enabled = enabled; camera.audioActive = policy.permission.audioActive;
      await this.cancelCamera(cameraKey, 'permission-changed');
      await this.persist();
    }
    if (!policy.permission.motionAllowed) this.markReason(cameraKey, 'unsupported-trigger-policy');
  }

  start(): void {
    this.requireInitialized(); if (this.automatic) return;
    this.stopped = false; if (this.owner.signal.aborted) this.owner = new globalThis.AbortController();
    this.automatic = true; void this.tick();
  }

  async stop(): Promise<void> {
    this.automatic = false; this.stopped = true; if (this.timer) globalThis.clearTimeout(this.timer);
    this.owner.abort(); for (const value of this.active.values()) value.controller.abort();
    await Promise.allSettled([...(this.scanPromise ? [this.scanPromise] : []),
      ...(this.workPromise ? [this.workPromise] : []), ...[...this.active.values()].map(a => a.promise)]);
    await this.persist();
  }

  /** Explicit catalog sweep, also used by the automatic timer. No video capture or live-view requests. */
  async scan(force = true): Promise<void> {
    this.requireInitialized(); if (this.stopped) return;
    if (this.scanPromise) return this.scanPromise;
    const work = (async () => {
      for (const key of this.cameras.keys()) await this.notifyPolicyChanged(key);
      await Promise.all([...this.modules.keys()].map(key => this.scanModule(key, force)));
    })();
    this.scanPromise = work;
    try { await work; } finally { this.scanPromise = undefined; }
  }

  /** Drain eligible work; active camera locks and all byte reservations remain held through delivery. */
  async runPending(): Promise<void> {
    this.requireInitialized(); if (this.stopped) return;
    if (this.workPromise) return this.workPromise;
    const pending = this.drainPending(); this.workPromise = pending;
    try { await pending; } finally { this.workPromise = undefined; }
  }

  private async drainPending(): Promise<void> {
    for (const key of this.cameras.keys()) await this.notifyPolicyChanged(key);
    let launched = true;
    while (launched && !this.stopped) {
      launched = false; this.prune(); await this.reclaim(false);
      if (this.stopped || this.owner.signal.aborted) break;
      const locked = new Set([...this.active.keys()].map(key => this.ledger.jobs[key].cameraKey));
      const jobs = Object.values(this.ledger.jobs).filter(j => !terminal(j.state) && !this.active.has(j.key) &&
        !locked.has(j.cameraKey) && j.nextAttemptAt <= this.now()).sort((a, b) => a.clip.capturedAt.localeCompare(b.clip.capturedAt));
      // Rotate between cameras after each admission; preserve capture order within a camera.
      const order = [...new Set(jobs.map(j => j.cameraKey))].sort();
      const after = order.findIndex(k => k > this.lastCamera); if (after > 0) order.push(...order.splice(0, after));
      for (const cameraKey of order) {
        const job = jobs.find(j => j.cameraKey === cameraKey)!;
        if (!this.cameras.has(cameraKey) || !this.modules.has(job.moduleKey)) continue;
        if (this.expired(job)) { this.finish(job, 'expired', 'expired'); launched = true; continue; }
        if (!this.cameras.get(cameraKey)!.target.getPolicySnapshot().configuration.value) { this.markReason(cameraKey, 'configuration-unavailable'); continue; }
        const needed = (this.files.has(`${job.key}.mp4`) ? 0 : NATIVE_CLIP_LIMITS.sourceBytes) + NATIVE_CLIP_LIMITS.sourceBytes;
        if (this.mediaBytes() + needed > NATIVE_CLIP_LIMITS.mediaBytes) await this.reclaim(true);
        if (this.stopped || this.owner.signal.aborted) break;
        if (this.mediaBytes() + needed > NATIVE_CLIP_LIMITS.mediaBytes) { this.markReason(job.cameraKey, 'storage-pressure'); continue; }
        const controller = new globalThis.AbortController();
        const active: Active = { controller, promise: Promise.resolve(), reservation: needed, preparedBytes: 0 };
        this.active.set(job.key, active); this.lastCamera = cameraKey; launched = true;
        active.promise = this.runJob(job, active).finally(() => { this.active.delete(job.key); });
      }
      if (this.active.size) { await this.waitForProgress(); launched = true; }
    }
    await this.persist();
  }

  getActivity(): NativeClipActivity {
    const jobs = Object.values(this.ledger.jobs);
    return { updatedAt: iso(this.now()),
      queue: jobs.filter(j => !terminal(j.state)).length, active: this.active.size,
      mediaBytes: this.mediaBytes() - this.reservedBytes(), reservedBytes: this.reservedBytes(), preparationLimit: this.preparationLimit,
      modules: [...this.modules].map(([key, module]) => ({ id: digest(key).slice(0, 16), key, label: this.label(module.label, 'Sync Module'),
        baseline: [...this.cameras].filter(([, camera]) => this.moduleKey(camera.identity) === key)
          .every(([cameraKey]) => this.ledger.cameras[cameraKey].initialized) ? 'complete' : 'pending',
        lastCatalogAt: this.ledger.modules[key].lastCatalogAt, reason: this.ledger.modules[key].reason })),
      cameras: [...this.cameras].map(([key, camera]) => {
        const state = this.ledger.cameras[key], matching = jobs.filter(j => j.cameraKey === key);
        const current = matching.filter(job => !terminal(job.state)).sort((a, b) => a.createdAt - b.createdAt)[0]
          ?? matching.sort((a, b) => b.createdAt - a.createdAt)[0];
        const job: NativeClipJobProgress | undefined = current ? { id: current.key.slice(0, 16), state: current.state,
          capturedAt: current.clip.capturedAt, discoveredAt: iso(current.createdAt), downloadedAt: current.downloadedAt,
          preparedAt: current.preparedAt, offeredAt: current.offeredAt, acknowledgedAt: current.acknowledgedAt,
          expiredAt: current.expiredAt, reason: current.reason } : undefined;
        return { id: digest(key).slice(0, 16), key, label: this.label(camera.identity.label ?? camera.identity.providerName, 'Camera'),
          baseline: state.initialized ? 'complete' : 'pending', baselineCompletedAt: state.baselineCompletedAt, job,
          nativeStorageObservedAt: state.nativeStorageObservedAt,
          lastExpiredAt: state.lastExpiredAt, lastExpiredReason: state.lastExpiredReason,
          queued: matching.filter(j => !terminal(j.state)).length, delivered: matching.filter(j => j.state === 'delivered').length,
          uncertain: matching.filter(j => j.state === 'uncertain').length,
          lastNativeClipAt: state.lastNativeClipAt, lastDownloadAt: state.lastDownloadAt, lastPreparedAt: state.lastPreparedAt,
          lastOfferedAt: state.lastOfferedAt, lastAcknowledgedAt: state.lastAcknowledgedAt, lastFailureAt: state.lastFailureAt, reason: state.reason };
      }) };
  }

  private async tick(): Promise<void> {
    try {
      await this.scan(false);
      if (Object.values(this.ledger.jobs).some(job => !terminal(job.state))) void this.runPending().catch(() => undefined);
    } catch { /* Each domain records bounded failure reasons. */ }
    if (this.automatic) { this.timer = globalThis.setTimeout(() => { void this.tick(); }, 1000); this.timer.unref(); }
  }
  private async scanModule(key: string, force: boolean): Promise<void> {
    const state = this.ledger.modules[key];
    if (!force && !state.request && (state.nextScanAt ?? 0) > this.now()) return;
    const signal = this.owner.signal;
    try {
      if (!state.request) {
        state.request = { startedAt: this.now() }; await this.persist();
        const options = { signal, deadline: state.request.startedAt + NATIVE_CLIP_LIMITS.commandMs };
        const ack = await withinRequestBudget(this.options.api.requestLocalStorageManifest(state, options), options);
        state.request.commandId = ack.commandId; await this.persist();
      }
      if (!state.request.commandId) throw new Error('Ambiguous native manifest request');
      const options = { signal, deadline: state.request.startedAt + NATIVE_CLIP_LIMITS.commandMs };
      // A persisted completed request can be retrieved after its original polling deadline.
      if (options.deadline > this.now()) await this.poll(state.networkId, state.request.commandId, options);
      const getOptions = { signal, deadline: Math.max(options.deadline, this.now() + 30000) };
      const result = await withinRequestBudget(this.options.api.getLocalStorageManifest(state, state.request.commandId, getOptions), getOptions);
      if (result.state !== 'ready') throw new Error('Native manifest pending');
      state.reason = undefined; this.observe(key, result.catalog.manifestId, result.catalog.clips);
      state.lastCatalogAt = iso(this.now()); state.request = undefined;
      state.nextScanAt = this.now() + (this.modules.get(key)?.pollIntervalMs ?? NATIVE_CLIP_LIMITS.pollMs);
      await this.persist();
    } catch {
      if (!signal.aborted) {
        state.reason ??= state.request?.commandId ? 'command-pending' : 'provider-unavailable';
        // Never immediately repeat a POST whose acknowledgement may have been lost.
        if (state.request && this.now() - state.request.startedAt >= NATIVE_CLIP_LIMITS.commandMs) {
          state.request = undefined; state.nextScanAt = this.now() + NATIVE_CLIP_LIMITS.pollMs;
        }
        await this.persist();
      }
    }
  }

  private observe(moduleKey: string, manifestId: string, clips: NativeClipDescriptor[]): void {
    this.prune();
    const matches = new Map<string, string[]>();
    for (const [key, camera] of this.cameras) if (this.moduleKey(camera.identity) === moduleKey) {
      const previous = matches.get(camera.token) ?? []; previous.push(key); matches.set(camera.token, previous);
    }
    const additions: { key: string; seen: Seen; job?: Job }[] = [];
    for (const clip of clips) {
      const candidates = matches.get(clip.cameraToken) ?? [], cameraKey = candidates.length === 1 ? candidates[0] : undefined;
      const key = digest([this.ledger.account, moduleKey, cameraKey ? this.ledger.cameras[cameraKey].identity : clip.cameraToken,
        clip.clipId, clip.capturedAt]);
      if (this.ledger.seen[key] || additions.some(a => a.key === key)) continue;
      const camera = cameraKey ? this.ledger.cameras[cameraKey] : undefined;
      const seen: Seen = { moduleKey, cameraKey, capturedAt: clip.capturedAt, state: 'observed' };
      if (!cameraKey || !camera) { this.ledger.modules[moduleKey].reason = 'camera-unmatched'; additions.push({ key, seen }); continue; }
      if (!camera.lastNativeClipAt || Date.parse(clip.capturedAt) > Date.parse(camera.lastNativeClipAt)) camera.lastNativeClipAt = clip.capturedAt;
      const eligible = camera.initialized && camera.enabled && Date.parse(clip.capturedAt) >= camera.activatedAt &&
        this.now() - Date.parse(clip.capturedAt) <= NATIVE_CLIP_LIMITS.maxAgeMs && Date.parse(clip.capturedAt) <= this.now();
      if (!eligible) { additions.push({ key, seen }); continue; }
      const queued = [...Object.values(this.ledger.jobs), ...additions.flatMap(a => a.job ? [a.job] : [])].filter(j => !terminal(j.state));
      if (queued.length >= NATIVE_CLIP_LIMITS.queue || queued.filter(j => j.cameraKey === cameraKey).length >= NATIVE_CLIP_LIMITS.cameraQueue) {
        this.markReason(cameraKey, 'queue-pressure'); continue; // Unobserved: overlap retries after room becomes available.
      }
      seen.state = 'queued'; additions.push({ key, seen, job: { key, moduleKey, cameraKey, clip: { ...clip }, manifestId,
        generation: camera.generation, state: 'queued', createdAt: this.now(), attempts: 0, nextAttemptAt: 0 } });
    }
    if (Object.keys(this.ledger.seen).length + additions.length > NATIVE_CLIP_LIMITS.seen ||
      Object.values(this.ledger.seen).filter(s => s.moduleKey === moduleKey).length + additions.length > NATIVE_CLIP_LIMITS.moduleSeen) {
      this.ledger.modules[moduleKey].reason = 'metadata-pressure'; throw new Error('Native clip metadata pressure');
    }
    const candidate = { ...this.ledger, seen: { ...this.ledger.seen }, jobs: { ...this.ledger.jobs } };
    for (const addition of additions) { candidate.seen[addition.key] = addition.seen; if (addition.job) candidate.jobs[addition.key] = addition.job; }
    if (Buffer.byteLength(JSON.stringify(candidate)) > NATIVE_CLIP_LIMITS.ledgerBytes) {
      this.ledger.modules[moduleKey].reason = 'metadata-pressure'; throw new Error('Native clip metadata pressure');
    }
    this.ledger.seen = candidate.seen; this.ledger.jobs = candidate.jobs;
    for (const [key, camera] of this.cameras) if (this.moduleKey(camera.identity) === moduleKey) {
      const state = this.ledger.cameras[key];
      if (!state.initialized) state.baselineCompletedAt = iso(this.now());
      state.initialized = true;
    }
  }

  private async runJob(job: Job, active: Active): Promise<void> {
    let prepared: PreparedSavedClip | undefined;
    const signal = active.controller.signal;
    try {
      this.checkPolicy(job); signal.throwIfAborted(); job.attempts++; await this.persist();
      if (this.files.has(`${job.key}.partial`)) await this.removeOwned(job, 'partial');
      if (!this.files.has(`${job.key}.mp4`)) {
        await this.waitFor(() => !this.moduleDownloads.has(job.moduleKey), signal);
        this.moduleDownloads.add(job.moduleKey);
        try { await this.download(job, active); } finally { this.moduleDownloads.delete(job.moduleKey); }
      }
      this.checkPolicy(job); signal.throwIfAborted();
      await this.waitFor(() => this.preparing.size < this.preparationLimit && this.preparedBytes() +
        this.preparing.size * NATIVE_CLIP_LIMITS.sourceBytes + NATIVE_CLIP_LIMITS.sourceBytes <= NATIVE_CLIP_LIMITS.preparedMemoryBytes, signal);
      this.preparing.add(job.key);
      let selected!: NativeClipPolicySnapshot;
      try {
        selected = globalThis.structuredClone(this.checkPolicy(job)); if (!selected.configuration.value) throw new ClipFailure('configuration-unavailable', true);
        job.state = 'preparing-media'; await this.persist();
        const bytes = await this.readSource(job);
        try {
          prepared = await this.prepare({ bytes, expectedBytes: job.sourceBytes!, expectedSha256: job.sourceSha256! },
            selected.configuration.value, selected.permission.audioActive, signal);
        } finally { bytes.fill(0); }
      } finally { this.preparing.delete(job.key); }
      signal.throwIfAborted(); this.checkPolicy(job);
      active.preparedBytes = prepared.buffer.bytes; active.reservation = 0; this.signalProgress();
      job.state = 'ready'; job.preparedAt = iso(this.now()); this.ledger.cameras[job.cameraKey].lastPreparedAt = job.preparedAt; await this.persist();
      if (this.cameras.get(job.cameraKey)!.target.getPolicySnapshot().configuration.revision !== selected.configuration.revision) {
        throw new ClipFailure('configuration-changed', true);
      }
      this.checkPolicy(job); signal.throwIfAborted();
      // This durable fence precedes any replay motion. A crash afterward cannot safely auto-repeat.
      job.state = 'offered'; job.offeredAt = iso(this.now()); this.ledger.cameras[job.cameraKey].lastOfferedAt = job.offeredAt; await this.persist();
      const result = await withinRequestBudget(this.cameras.get(job.cameraKey)!.target.deliverSavedClip(prepared,
        { jobKey: job.key, cameraKey: job.cameraKey, capturedAt: job.clip.capturedAt, clipIdentity: job.key }, selected, signal),
      { signal, deadline: Math.min(this.now() + 180000, Date.parse(job.clip.capturedAt) + NATIVE_CLIP_LIMITS.maxAgeMs) });
      if (result.status === 'not-offered') {
        job.state = 'queued'; throw new ClipFailure(result.reason === 'busy' ? 'target-busy' : result.reason,
          result.reason !== 'unsupported-trigger-policy');
      }
      if (result.status === 'delivered') {
        this.finish(job, 'delivered');
        if (result.acknowledgedAt && Number.isFinite(Date.parse(result.acknowledgedAt))) {
          job.acknowledgedAt = result.acknowledgedAt; this.ledger.cameras[job.cameraKey].lastAcknowledgedAt = result.acknowledgedAt;
        }
      } else this.finish(job, 'uncertain', 'delivery-uncertain');
    } catch (error) {
      const reason: Reason = error instanceof ClipFailure ? error.reason : job.state === 'preparing-media' ? 'media-preparation-failed' : 'provider-unavailable';
      if (job.state === 'offered') this.finish(job, 'uncertain', 'delivery-uncertain');
      else if (terminal(job.state)) { /* A policy hook already persisted its terminal fence. */ }
      else if (this.stopped || this.owner.signal.aborted) { job.state = 'queued'; this.updateSeen(job); }
      else if (this.expired(job)) this.finish(job, 'expired', 'expired');
      else if (error instanceof ClipFailure && !error.retry) this.finish(job, 'failed', error.reason);
      else if (job.attempts >= NATIVE_CLIP_LIMITS.attempts) this.finish(job, 'failed', reason);
      else { job.state = 'queued'; job.reason = reason;
        job.nextAttemptAt = this.now() + [1000, 5000, 15000, 30000][Math.min(job.attempts - 1, 3)]; this.markReason(job.cameraKey, job.reason); }
    } finally {
      prepared?.dispose(); active.preparedBytes = 0; active.reservation = 0; this.updateSeen(job); await this.persist();
    }
  }

  private async download(job: Job, active: Active): Promise<void> {
    const module = this.ledger.modules[job.moduleKey], signal = active.controller.signal;
    const fetch = async (deadline: number) => {
      const options = { signal, deadline };
      this.checkPolicy(job); signal.throwIfAborted(); job.state = 'downloading'; await this.persist();
      return withinRequestBudget(this.options.api.getPreparedLocalStorageClip(module, job.manifestId, job.clip.clipId, options), options);
    };
    let bytes: Buffer | undefined;
    if (job.request?.commandId) {
      // Resume/late GET first. Never issue a second clip preparation POST for this identity.
      try { bytes = await fetch(this.now() + 30000); } catch { signal.throwIfAborted(); }
    }
    if (!bytes) {
      if (!job.request) {
        job.state = 'preparing-download'; job.request = { startedAt: this.now() }; await this.persist();
        const options = { signal, deadline: job.request.startedAt + NATIVE_CLIP_LIMITS.commandMs };
        const ack = await withinRequestBudget(this.options.api.requestLocalStorageClip(module, job.manifestId, job.clip.clipId, options), options);
        job.request.commandId = ack.commandId; await this.persist();
      }
      if (!job.request.commandId) throw new ClipFailure('ambiguous-request', false);
      const options = { signal, deadline: job.request.startedAt + NATIVE_CLIP_LIMITS.commandMs };
      await this.poll(module.networkId, job.request.commandId, options);
      bytes = await fetch(options.deadline);
    }
    try {
      this.checkPolicy(job); signal.throwIfAborted(); job.state = 'downloading'; await this.persist();
      if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > NATIVE_CLIP_LIMITS.sourceBytes) throw new ClipFailure('media-invalid', false);
      job.sourceBytes = bytes.length; job.sourceSha256 = createHash('sha256').update(bytes).digest('hex');
      active.reservation -= NATIVE_CLIP_LIMITS.sourceBytes - bytes.length; this.signalProgress();
      await this.persist(); await this.writeSource(job, bytes, active);
      job.downloadedAt = iso(this.now()); this.ledger.cameras[job.cameraKey].lastDownloadAt = job.downloadedAt;
      // This path is reachable only for a newly eligible post-baseline job, after
      // a complete admitted native response and private source-file promotion.
      this.ledger.cameras[job.cameraKey].nativeStorageObservedAt = job.downloadedAt; await this.persist();
    } finally { if (Buffer.isBuffer(bytes)) bytes.fill(0); }
  }

  private async poll(networkId: number, commandId: number, options: RequestOptions): Promise<void> {
    while (true) {
      const status = await withinRequestBudget(this.options.api.getCommandStatus(networkId, commandId, options), options);
      if (status.complete === true) return;
      if (status.status === 'failed') throw new Error('Native command failed');
      const requested = status.polling_interval === undefined ? 1000 : status.polling_interval * 1000;
      await this.delay(Math.min(15000, Math.max(250, requested)), options);
      options.signal?.throwIfAborted();
      if (options.deadline !== undefined && this.now() >= options.deadline) throw new Error('Native command pending');
    }
  }

  private checkPolicy(job: Job): NativeClipPolicySnapshot {
    const target = this.cameras.get(job.cameraKey), camera = this.ledger.cameras[job.cameraKey];
    if (!target || !camera || !camera.enabled || camera.generation !== job.generation) throw new ClipFailure('permission-changed', false);
    const policy = target.target.getPolicySnapshot();
    if (!policy.permission.motionAllowed || (policy.configuration.value && !policy.configuration.value.eventTriggerTypes.includes(1))) {
      throw new ClipFailure('unsupported-trigger-policy', false);
    }
    if (!policy.permission.recordingActive || !policy.permission.cameraActive || policy.permission.audioActive !== camera.audioActive ||
      target.epoch !== policy.permission.epoch) throw new ClipFailure('permission-changed', false);
    if (this.expired(job)) throw new ClipFailure('expired', false);
    return policy;
  }
  private async cancelCamera(key: string, reason: Reason): Promise<void> {
    for (const job of Object.values(this.ledger.jobs)) if (job.cameraKey === key && !terminal(job.state)) {
      const offered = job.state === 'offered'; this.finish(job, offered ? 'uncertain' : 'cancelled', offered ? 'delivery-uncertain' : reason);
      this.active.get(job.key)?.controller.abort();
    }
    const camera = this.ledger.cameras[key]; if (camera) { camera.activatedAt = this.now(); if (reason === 'camera-unregistered') camera.enabled = false; }
  }
  private expired(job: Job): boolean { return this.now() - Date.parse(job.clip.capturedAt) > NATIVE_CLIP_LIMITS.maxAgeMs; }
  private finish(job: Job, state: NativeClipJobState, reason?: Reason): void {
    if (state === 'expired') {
      job.expiredAt = iso(this.now()); this.ledger.cameras[job.cameraKey].lastExpiredAt = job.expiredAt;
      this.ledger.cameras[job.cameraKey].lastExpiredReason = 'expired';
    }
    job.state = state; job.reason = reason; this.updateSeen(job); if (reason) this.markReason(job.cameraKey, reason);
    else this.ledger.cameras[job.cameraKey].reason = undefined;
  }
  private updateSeen(job: Job): void { if (this.ledger.seen[job.key]) this.ledger.seen[job.key].state = job.state; }
  private markReason(key: string, reason: Reason): void {
    const camera = this.ledger.cameras[key]; if (camera) { camera.reason = reason; camera.lastFailureAt = iso(this.now()); }
  }
  private prune(): void {
    for (const [key, seen] of Object.entries(this.ledger.seen)) if (terminal(seen.state) &&
      this.now() - Date.parse(seen.capturedAt) > NATIVE_CLIP_LIMITS.maxAgeMs && !this.active.has(key) &&
      !this.files.has(`${key}.mp4`) && !this.files.has(`${key}.partial`)) { delete this.ledger.seen[key]; delete this.ledger.jobs[key]; }
  }
  private async reclaim(pressure: boolean): Promise<void> {
    for (const job of Object.values(this.ledger.jobs).sort((a, b) => a.createdAt - b.createdAt)) if (terminal(job.state) && !this.active.has(job.key) && (pressure || this.expired(job))) {
      await this.removeOwned(job, 'mp4'); await this.removeOwned(job, 'partial');
    }
    this.prune();
  }
  private async removeOwned(job: Job, extension: 'mp4' | 'partial'): Promise<void> {
    const name = `${job.key}.${extension}`; if (!this.files.has(name)) return;
    await this.openSource(name, async handle => { await handle.stat(); });
    await fs.unlink(path.join(this.directory, name)); this.files.delete(name);
  }
  private async writeSource(job: Job, bytes: Buffer, active: Active): Promise<void> {
    const partial = `${job.key}.partial`, final = `${job.key}.mp4`;
    const handle = await fs.open(path.join(this.directory, partial), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    this.files.set(partial, 0);
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally {
      try { const size = (await handle.stat()).size; this.files.set(partial, size); active.reservation -= size; }
      finally { await handle.close(); }
    }
    await fs.rename(path.join(this.directory, partial), path.join(this.directory, final));
    this.files.delete(partial); this.files.set(final, bytes.length);
  }
  private async readSource(job: Job): Promise<Buffer> {
    return this.openSource(`${job.key}.mp4`, async handle => {
      const stats = await handle.stat(); if (stats.size !== job.sourceBytes) throw new ClipFailure('media-invalid', false);
      const bytes = await handle.readFile();
      if (createHash('sha256').update(bytes).digest('hex') !== job.sourceSha256) { bytes.fill(0); throw new ClipFailure('media-invalid', false); }
      return bytes;
    });
  }
  private async openSource<T>(name: string, use: (handle: Awaited<ReturnType<typeof fs.open>>) => Promise<T>): Promise<T> {
    const filename = path.join(this.directory, name), before = await fs.lstat(filename);
    if (!before.isFile() || before.isSymbolicLink() || !owner(before) || (before.mode & 0o777) !== 0o600) throw new Error('Native clip storage unavailable');
    const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      const after = await handle.stat(); if (!after.isFile() || !owner(after) || before.ino !== after.ino || before.dev !== after.dev) throw new Error('Native clip storage changed');
      return await use(handle);
    } finally { await handle.close(); }
  }
  private signalProgress(): void { for (const wake of this.progress) wake(); }
  private async waitForProgress(): Promise<void> {
    let wake!: () => void;
    const changed = new Promise<void>(resolve => { wake = resolve; this.progress.add(wake); });
    try { await Promise.race([changed, ...[...this.active.values()].map(a => a.promise)]); }
    finally { this.progress.delete(wake); }
  }
  private async waitFor(ready: () => boolean, signal: globalThis.AbortSignal): Promise<void> {
    while (!ready()) { signal.throwIfAborted(); await this.delay(50, { signal }); }
    signal.throwIfAborted();
  }
  private reservedBytes(): number { return [...this.active.values()].reduce((n, a) => n + a.reservation, 0); }
  private preparedBytes(): number { return [...this.active.values()].reduce((n, a) => n + a.preparedBytes, 0); }
  private mediaBytes(): number { return [...this.files.values()].reduce((a, b) => a + b, 0) + this.reservedBytes() + this.preparedBytes(); }
  private moduleKey(module: NativeStorageModule): string { return `${module.networkId}:${module.syncModuleId}`; }
  private label(value: string | undefined, fallback: string): string { return value?.replace(/\p{Cc}/gu, '').slice(0, 128) || fallback; }
  private requireInitialized(): void { if (!this.initialized) throw new Error('Native clip recorder not initialized'); }
  private async persist(): Promise<void> {
    const text = JSON.stringify(this.ledger);
    if (Buffer.byteLength(text) > NATIVE_CLIP_LIMITS.ledgerBytes) throw new Error('Native clip metadata pressure');
    const ledger = JSON.parse(text) as Ledger, activity = this.getActivity();
    const pending = this.writes.then(async () => {
      await writeOwnerOnlyJsonFile(this.ledgerPath, ledger);
      // A completed offer fence must survive a power interruption before replay motion.
      await this.openSource('ledger.json', handle => handle.sync());
      if (process.platform !== 'win32') {
        const directory = await fs.open(this.directory, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0));
        try { await directory.sync(); } finally { await directory.close(); }
      }
      try { this.options.activityChanged?.(activity); } catch { /* GUI publication cannot weaken the durable offer fence. */ }
    });
    this.writes = pending.catch(() => undefined); await pending;
  }
  private validateLedger(value: Ledger): void {
    if (!value || value.version !== 1 || value.account !== String(this.options.accountId) ||
      !value.modules || !value.cameras || !value.seen || !value.jobs ||
      Object.keys(value.seen).length > NATIVE_CLIP_LIMITS.seen || Object.keys(value.jobs).length > NATIVE_CLIP_LIMITS.seen) throw new Error('Native clip ledger unavailable');
    for (const [key, job] of Object.entries(value.jobs)) if (!/^[a-f0-9]{64}$/.test(key) || job.key !== key ||
      !value.cameras[job.cameraKey] || !value.modules[job.moduleKey] || !Number.isFinite(Date.parse(job.clip?.capturedAt)) ||
      !Number.isInteger(job.clip.sizeKiB) || job.clip.sizeKiB <= 0 || job.clip.sizeKiB > NATIVE_CLIP_LIMITS.sourceBytes / 1024 ||
      (job.sourceBytes !== undefined && (!Number.isInteger(job.sourceBytes) || job.sourceBytes < 1 || job.sourceBytes > NATIVE_CLIP_LIMITS.sourceBytes)) ||
      ((job.sourceBytes === undefined) !== (job.sourceSha256 === undefined)) ||
      (job.sourceSha256 !== undefined && !/^[a-f0-9]{64}$/.test(job.sourceSha256))) throw new Error('Native clip ledger unavailable');
  }
}
class ClipFailure extends Error { constructor(readonly reason: Reason, readonly retry: boolean) { super(reason); } }
