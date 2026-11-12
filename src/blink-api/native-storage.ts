import { Buffer } from 'node:buffer';
import { budgetedDelay, checkRequestBudget, withinRequestBudget, isRemoteOperationLeaseActive,
  REMOTE_OPERATION_LEASE_MS, type RequestOptions } from '../operation-budget';
import { requireRemoteId } from './domain-validation';
import { isBlinkPostRefusal } from './http';

/** APK 61.0 MediaApi uses the API base; CommandApi uses the REST root. */
export interface NativeStorageRoute { base: 'api' | 'root'; path: string; }
export interface NativeStorageRequestOptions extends RequestOptions { maxBytes: number; retry: false; }
export interface NativeStoredMedia { reference: string; bytes: number; sha256: string; }
export interface NativeStorageTransport {
  postEmpty(route: NativeStorageRoute, options: NativeStorageRequestOptions): Promise<unknown>;
  getJson(route: NativeStorageRoute, options: NativeStorageRequestOptions): Promise<unknown>;
  /** Pure existing-client URL validation; never forward credentials to an arbitrary origin. */
  validateMediaUrl(location: string): string;
  /** Enforce maxBytes while streaming into a privately owned, atomically promoted local file. */
  downloadMedia(location: string, options: NativeStorageRequestOptions): Promise<NativeStoredMedia>;
}
export interface NativeStorageScope { accountId: number; networkId: number; syncModuleId: number; }
export interface NativeStorageContext extends NativeStorageScope { operationId: string; }
export interface NativeStorageClip {
  clipId: number;
  networkId: number;
  deviceName: string | null;
  capturedAt: string | null;
  mediaUrl: string | null;
}
export interface NativeStorageCatalog {
  manifestId: number | null;
  clips: NativeStorageClip[];
  pageSize: number | null;
  paginationKey: string | number | null;
}
export interface NativeStorageClipRequest { manifestId: number; clip: NativeStorageClip; }
export type NativeStorageFailure = 'command-failed' | 'invalid-result' | 'invalid-media' | 'not-started' | 'refused' | 'discarded';
export type NativeStorageTerminal<T> = { status: 'ready'; value: T } |
  { status: 'failed'; reason: NativeStorageFailure; remoteStatus?: number; httpStatus?: number };
export type NativeStorageResult<T> = NativeStorageTerminal<T> |
  { status: 'abandoned' } |
  { status: 'unresolved'; reason: string; operation?: NativeStorageOperation };
export interface NativeStorageOperation extends NativeStorageContext {
  kind: 'catalog' | 'clip';
  phase: 'intent' | 'accepted' | 'prepared' | 'finished' | 'abandoned';
  /** Local availability lease; expiry does not prove provider completion. */
  expiresAt?: number;
  abandonedAt?: number;
  statusReads: number;
  commandId?: number;
  resultCommandId?: number;
  clip?: NativeStorageClipRequest;
  result?: NativeStorageTerminal<NativeStorageCatalog | NativeStoredMedia>;
}
export interface NativeStorageState {
  version: 1;
  operation?: NativeStorageOperation;
  /** Bounded local history; deliberately excludes clip/media URLs. */
  abandoned?: (NativeStorageContext & { kind: 'catalog' | 'clip'; statusReads: number;
    commandId?: number; resultCommandId?: number; expiresAt?: number; abandonedAt: number })[];
}
export interface NativeStorageOwnerOptions {
  transport: NativeStorageTransport;
  /** The client's existing account command queue owns admission; this class adds no remote queue. */
  admit<T>(work: () => Promise<T>, options: RequestOptions, operationId: string, scope: NativeStorageScope): Promise<T>;
  saveState(state: NativeStorageState): Promise<void>;
  restoredState?: NativeStorageState;
  maxStatusReads?: number;
  maxJsonBytes?: number;
  maxMediaBytes?: number;
  responseBudgetMs?: number;
  delay?: (milliseconds: number, options: RequestOptions) => Promise<void>;
}

const POLL_INTERVAL_MS = 2000;
const MAX_CATALOG_ITEMS = 1000;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid native storage object');
  return value as Record<string, unknown>;
};
const positive = (value: unknown): number => { requireRemoteId(value); return value as number; };
const text = (value: unknown, limit: number): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > limit) throw new Error('Invalid native storage text');
  return value;
};
const integer = (value: number, minimum: number, maximum: number): number => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error('Invalid native storage limit');
  return value;
};
const scopeMatches = (a: NativeStorageScope, b: NativeStorageScope) =>
  a.accountId === b.accountId && a.networkId === b.networkId && a.syncModuleId === b.syncModuleId;
const clipMatches = (a: NativeStorageClipRequest | undefined, b: NativeStorageClipRequest | undefined): boolean => {
  if (!a || !b) return a === b;
  return a.manifestId === b.manifestId && a.clip.clipId === b.clip.clipId && a.clip.networkId === b.clip.networkId &&
    a.clip.deviceName === b.clip.deviceName && a.clip.capturedAt === b.clip.capturedAt && a.clip.mediaUrl === b.clip.mediaUrl;
};

/** One durable native-storage operation owner. It performs no discovery without an explicit call. */
export class NativeStorageOwner {
  private state: NativeStorageState;
  private running = false;
  private persistenceFailed = false;
  private generation = 0;
  private abandonment?: Promise<boolean>;
  private readonly maxStatusReads: number;
  private readonly maxJsonBytes: number;
  private readonly maxMediaBytes: number;
  private readonly responseBudgetMs: number;
  private readonly delay: (milliseconds: number, options: RequestOptions) => Promise<void>;

  constructor(private readonly options: NativeStorageOwnerOptions) {
    this.maxStatusReads = integer(options.maxStatusReads ?? 30, 1, 120);
    this.maxJsonBytes = integer(options.maxJsonBytes ?? 1024 * 1024, 256, 4 * 1024 * 1024);
    this.maxMediaBytes = integer(options.maxMediaBytes ?? 32 * 1024 * 1024, 1, 128 * 1024 * 1024);
    this.responseBudgetMs = integer(options.responseBudgetMs ?? 120000, 1, 300000);
    this.delay = options.delay ?? budgetedDelay;
    this.state = clone(options.restoredState === undefined ? { version: 1 } : options.restoredState);
    this.validateState();
  }

  snapshot(): NativeStorageState { return clone(this.state); }

  /** Retain uncertain evidence, but stop its local veto without another provider request. */
  async abandonExpired(): Promise<boolean> {
    if (this.abandonment) return this.abandonment;
    const operation = this.state.operation;
    if (!operation || operation.phase === 'finished' || operation.phase === 'abandoned'
      || isRemoteOperationLeaseActive(operation.expiresAt)) return false;
    this.generation++;
    this.running = false;
    this.state.abandoned = [...(this.state.abandoned ?? []).filter(item => item.operationId !== operation.operationId),
      { operationId: operation.operationId, accountId: operation.accountId, networkId: operation.networkId,
        syncModuleId: operation.syncModuleId, kind: operation.kind, statusReads: operation.statusReads,
        ...(operation.commandId !== undefined ? { commandId: operation.commandId } : {}),
        ...(operation.resultCommandId !== undefined ? { resultCommandId: operation.resultCommandId } : {}),
        ...(operation.expiresAt !== undefined ? { expiresAt: operation.expiresAt } : {}), abandonedAt: Date.now() }].slice(-32);
    const abandonment = this.persist({ ...operation, phase: 'abandoned', abandonedAt: Date.now(), result: undefined }).then(() => true);
    this.abandonment = abandonment;
    try { return await abandonment; }
    finally { if (this.abandonment === abandonment) this.abandonment = undefined; }
  }

  /** Explicit retry rechecks durable storage; it does not replay an uncertain preparation. */
  async retryPersistence(): Promise<void> {
    await this.abandonment?.catch(() => undefined);
    await this.options.saveState(this.snapshot());
    this.persistenceFailed = false;
    await this.abandonExpired();
  }

  /** Cancel a prior permission period using only existing terminal proof or one bounded known-command read. */
  async reconcilePending(options: RequestOptions = {}): Promise<'terminal' | 'unresolved' | 'none' | 'abandoned'> {
    if (await this.abandonExpired()) return 'abandoned';
    const operation = this.state.operation;
    if (!operation || operation.phase === 'finished' || operation.phase === 'abandoned') return 'none';
    if (this.running || this.persistenceFailed || operation.phase === 'intent') return 'unresolved';
    this.running = true;
    const generation = this.generation;
    try {
      if (operation.phase === 'prepared') {
        await this.finish({ status: 'failed', reason: 'discarded' }, generation);
        return 'terminal';
      }
      if (!operation.commandId || operation.statusReads >= this.maxStatusReads) return 'unresolved';
      const request = { ...options, deadline: Math.min(options.deadline ?? Infinity, Date.now() + this.responseBudgetMs, operation.expiresAt!) };
      checkRequestBudget(request);
      await this.persist({ ...operation, statusReads: operation.statusReads + 1 }, generation);
      checkRequestBudget(request);
      // A command-status read does not allocate a Sync Module operation and needs no new write admission.
      const status = object(this.boundedJson(await withinRequestBudget(this.options.transport.getJson(
        { base: 'root', path: `accounts/${operation.accountId}/networks/${operation.networkId}/commands/${operation.commandId}` },
        this.requestOptions(request, this.maxJsonBytes)), request)));
      if (generation !== this.generation) return 'abandoned';
      if (status.complete !== true || typeof status.status !== 'number' || !Number.isSafeInteger(status.status)) return 'unresolved';
      await this.finish({ status: 'failed', reason: 'discarded', remoteStatus: status.status }, generation);
      return 'terminal';
    } catch { return 'unresolved'; }
    finally { if (generation === this.generation) this.running = false; }
  }

  readCatalog(context: NativeStorageContext, options: RequestOptions = {}): Promise<NativeStorageResult<NativeStorageCatalog>> {
    return this.execute(context, 'catalog', undefined, options) as Promise<NativeStorageResult<NativeStorageCatalog>>;
  }

  downloadClip(context: NativeStorageContext, clip: NativeStorageClipRequest,
    options: RequestOptions = {}): Promise<NativeStorageResult<NativeStoredMedia>> {
    positive(clip.manifestId);
    this.validateClip(clip.clip, context.networkId);
    if (!clip.clip.mediaUrl) throw new Error('Native clip has no media location');
    this.options.transport.validateMediaUrl(clip.clip.mediaUrl);
    return this.execute(context, 'clip', clip, options) as Promise<NativeStorageResult<NativeStoredMedia>>;
  }

  private async execute(context: NativeStorageContext, kind: 'catalog' | 'clip', clip: NativeStorageClipRequest | undefined,
    supplied: RequestOptions): Promise<NativeStorageResult<NativeStorageCatalog | NativeStoredMedia>> {
    this.validateContext(context);
    if (this.persistenceFailed) return this.unresolved('persistence-failed');
    await this.abandonExpired();
    if (this.state.abandoned?.some(item => item.operationId === context.operationId)) return { status: 'abandoned' };
    if (this.running) return this.unresolved('caller-in-progress');
    const previous = this.state.operation;
    const same = previous?.operationId === context.operationId;
    if (same && (!scopeMatches(previous, context) || previous.kind !== kind || !clipMatches(previous.clip, clip))) {
      throw new Error('Native operation identity changed');
    }
    if (same && previous.phase === 'abandoned') return { status: 'abandoned' };
    if (previous && !same && previous.phase !== 'finished' && previous.phase !== 'abandoned') return this.unresolved('operation-in-progress');
    if (same && previous.phase === 'finished') return clone(previous.result!);
    const deadline = Math.min(supplied.deadline ?? Infinity, Date.now() + this.responseBudgetMs,
      same && previous?.expiresAt !== undefined ? previous.expiresAt : Infinity);
    const request = { ...supplied, deadline, queueDeadline: Math.min(supplied.queueDeadline ?? Infinity, deadline) };
    this.running = true;
    const generation = ++this.generation;
    let entered = false;
    try {
      return await withinRequestBudget(this.options.admit(async () => {
        checkRequestBudget(request);
        if (generation !== this.generation) return { status: 'abandoned' };
        entered = true;
        const current = this.state.operation;
        const currentMatches = current?.operationId === context.operationId;
        if (currentMatches && current.phase === 'finished') return clone(current.result!);
        if (current && !currentMatches && current.phase !== 'finished' && current.phase !== 'abandoned') return this.unresolved('operation-in-progress');
        if (!currentMatches) {
          const intent: NativeStorageOperation = { ...context, kind, phase: 'intent', statusReads: 0,
            expiresAt: Math.min(deadline, Date.now() + REMOTE_OPERATION_LEASE_MS),
            ...(clip ? { clip: clone(clip) } : {}) };
          await this.persist(intent, generation);
          if (generation !== this.generation) return { status: 'abandoned' };
          try { checkRequestBudget(request); }
          catch {
            // Keep durable proof that cancellation preceded dispatch, even if the bounded caller has returned.
            await this.persist({ ...intent, phase: 'finished', result: { status: 'failed', reason: 'not-started' } }, generation);
            return { status: 'failed', reason: 'not-started' };
          }
          // Once invoked, a thrown POST result is ambiguous. It is never replayed here.
          const ack = this.boundedJson(await withinRequestBudget(this.options.transport.postEmpty(
            this.preparationRoute(intent), this.requestOptions(request, this.maxJsonBytes)), request));
          if (generation !== this.generation) return { status: 'abandoned' };
          await this.persist({ ...intent, phase: 'accepted', commandId: positive(object(ack).id) }, generation);
        }
        const operation = this.state.operation!;
        if (operation.phase === 'intent') return this.unresolved('acknowledgement-unknown');
        if (operation.phase === 'accepted') {
          const terminal = await this.poll(operation, request, generation);
          if (terminal) return terminal;
        }
        return await this.retrieve(this.state.operation!, request, generation);
      }, request, context.operationId, context), request);
    } catch (error) {
      if (generation !== this.generation) return { status: 'abandoned' };
      if (entered && !this.persistenceFailed && this.state.operation?.operationId === context.operationId
        && this.state.operation.phase === 'prepared') {
        // Preparation already has durable terminal proof. A failed result GET
        // is a local acquisition failure, not an unknown Sync Module command.
        try { return await this.finish({ status: 'failed', reason: kind === 'clip' ? 'invalid-media' : 'invalid-result' }, generation); }
        catch { return this.unresolved('persistence-failed'); }
      }
      const noSend = error instanceof Error && (error as Error & { dispatched?: boolean }).dispatched === false;
      const refused = isBlinkPostRefusal(error);
      if (entered && (noSend || refused)
        && this.state.operation?.operationId === context.operationId && this.state.operation.phase === 'intent') {
        // A refusal consumed one wire attempt. Keep it distinct from local
        // no-send proof so the scheduler cannot erase the catalog cooldown.
        try { return await this.finish(refused ? { status: 'failed', reason: 'refused', httpStatus: error.status }
          : { status: 'failed', reason: 'not-started' }, generation); }
        catch { return this.unresolved('persistence-failed'); }
      }
      if (!this.persistenceFailed && await this.abandonExpired()) return { status: 'abandoned' };
      if (!entered && (!previous || previous.phase === 'finished' || previous.phase === 'abandoned')) return { status: 'failed', reason: 'not-started' };
      return this.unresolved(this.persistenceFailed ? 'persistence-failed' : 'request-outcome-unknown');
    } finally { if (generation === this.generation) this.running = false; }
  }

  /** Returns only on terminal failure or uncertainty; success advances the durable result phase. */
  private async poll(operation: NativeStorageOperation, options: RequestOptions, generation: number):
    Promise<NativeStorageResult<NativeStorageCatalog | NativeStoredMedia> | undefined> {
    while (operation.statusReads < this.maxStatusReads) {
      checkRequestBudget(options);
      operation = { ...operation, statusReads: operation.statusReads + 1 };
      await this.persist(operation, generation);
      checkRequestBudget(options);
      const raw = object(this.boundedJson(await withinRequestBudget(this.options.transport.getJson(
        { base: 'root', path: `accounts/${operation.accountId}/networks/${operation.networkId}/commands/${operation.commandId}` },
        this.requestOptions(options, this.maxJsonBytes)), options)));
      if (generation !== this.generation) return { status: 'abandoned' };
      if (typeof raw.complete !== 'boolean' || typeof raw.status !== 'number' || !Number.isSafeInteger(raw.status)) {
        return this.unresolved('invalid-command-status');
      }
      if (raw.complete) {
        if (raw.status !== 0) return this.finish({ status: 'failed', reason: 'command-failed', remoteStatus: raw.status }, generation);
        let resultCommandId: number | undefined;
        if (operation.kind === 'catalog') {
          if (!Array.isArray(raw.commands) || raw.commands.length === 0) return this.unresolved('missing-result-command');
          try { resultCommandId = positive(object(raw.commands[0]).id); }
          catch { return this.unresolved('invalid-result-command'); }
        }
        await this.persist({ ...operation, phase: 'prepared', ...(resultCommandId ? { resultCommandId } : {}) }, generation);
        return;
      }
      if (operation.statusReads < this.maxStatusReads) await this.delay(POLL_INTERVAL_MS, options);
    }
    return this.unresolved('status-budget-exhausted');
  }

  private async retrieve(operation: NativeStorageOperation, options: RequestOptions, generation: number):
    Promise<NativeStorageResult<NativeStorageCatalog | NativeStoredMedia>> {
    checkRequestBudget(options);
    if (operation.kind === 'catalog') {
      const value = this.boundedJson(await withinRequestBudget(this.options.transport.getJson(
        { base: 'api', path: `${this.modulePath(operation)}/media/${positive(operation.resultCommandId)}` },
        this.requestOptions(options, this.maxJsonBytes)), options));
      if (generation !== this.generation) return { status: 'abandoned' };
      try { return await this.finish({ status: 'ready', value: this.catalog(value, operation.networkId) }, generation); }
      catch {
        if (this.persistenceFailed) throw new Error('Native storage persistence failed');
        return this.finish({ status: 'failed', reason: 'invalid-result' }, generation);
      }
    }
    const location = this.options.transport.validateMediaUrl(operation.clip!.clip.mediaUrl!);
    const value = await withinRequestBudget(this.options.transport.downloadMedia(location,
      this.requestOptions(options, this.maxMediaBytes)), options);
    if (generation !== this.generation) return { status: 'abandoned' };
    if (!this.validStoredMedia(value)) {
      return this.finish({ status: 'failed', reason: 'invalid-media' }, generation);
    }
    return this.finish({ status: 'ready', value: clone(value) }, generation);
  }

  private catalog(value: unknown, networkId: number): NativeStorageCatalog {
    const raw = object(value);
    if (!Array.isArray(raw.media) || raw.media.length > MAX_CATALOG_ITEMS) throw new Error('Invalid native catalog');
    const manifestId = raw.manifest_id === null || raw.manifest_id === undefined ? null : positive(raw.manifest_id);
    if (raw.media.length > 0 && manifestId === null) throw new Error('Native catalog has no manifest identity');
    const clips = raw.media.map(value => {
      const row = object(value);
      const normalized: NativeStorageClip = { clipId: positive(row.id), networkId: positive(row.network_id),
        deviceName: text(row.device_name, 512), capturedAt: text(row.created_at, 128), mediaUrl: text(row.media, 8192) };
      this.validateClip(normalized, networkId);
      return normalized;
    });
    const pageSize = raw.page_size === undefined || raw.page_size === null ? null :
      integer(raw.page_size as number, 0, MAX_CATALOG_ITEMS);
    const paginationKey = raw.pagination_key === undefined || raw.pagination_key === null ? null : raw.pagination_key;
    if (typeof paginationKey !== 'string' && typeof paginationKey !== 'number' && paginationKey !== null) {
      throw new Error('Invalid native pagination key');
    }
    if (typeof paginationKey === 'string' && paginationKey.length > 256) throw new Error('Invalid native pagination key');
    if (typeof paginationKey === 'number') integer(paginationKey, 0, Number.MAX_SAFE_INTEGER);
    return { manifestId, clips, pageSize, paginationKey };
  }

  private validateClip(clip: NativeStorageClip, networkId: number): void {
    positive(clip.clipId);
    if (positive(clip.networkId) !== networkId) throw new Error('Native media belongs to a different network');
    text(clip.deviceName, 512); text(clip.capturedAt, 128); text(clip.mediaUrl, 8192);
  }

  private validStoredMedia(value: NativeStoredMedia): boolean {
    return Boolean(value && typeof value.reference === 'string' && value.reference && value.reference.length <= 4096 &&
      Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= this.maxMediaBytes &&
      typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256));
  }

  private validateContext(context: NativeStorageContext): void {
    positive(context.accountId); positive(context.networkId); positive(context.syncModuleId);
    if (typeof context.operationId !== 'string' || !context.operationId || context.operationId.length > 256 ||
      [...context.operationId].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
      throw new Error('Invalid native operation identity');
    }
  }

  private validateState(): void {
    if (this.state.version !== 1) throw new Error('Invalid native storage state');
    if (this.state.abandoned !== undefined && (!Array.isArray(this.state.abandoned) || this.state.abandoned.length > 32
      || this.state.abandoned.some(item => !item || typeof item.operationId !== 'string' || !item.operationId
        || item.operationId.length > 256 || !Number.isSafeInteger(item.abandonedAt) || item.abandonedAt < 0))) {
      throw new Error('Invalid native abandonment history');
    }
    for (const item of this.state.abandoned ?? []) {
      this.validateContext(item);
      if (item.kind !== 'catalog' && item.kind !== 'clip') throw new Error('Invalid native abandonment kind');
      integer(item.statusReads, 0, 120);
      if (item.commandId !== undefined) positive(item.commandId);
      if (item.resultCommandId !== undefined) positive(item.resultCommandId);
      if (item.expiresAt !== undefined) integer(item.expiresAt, 0, Number.MAX_SAFE_INTEGER);
    }
    if (this.state.operation === undefined) return;
    const op = object(this.state.operation) as unknown as NativeStorageOperation;
    this.validateContext(op);
    if (!['catalog', 'clip'].includes(op.kind) || !['intent', 'accepted', 'prepared', 'finished', 'abandoned'].includes(op.phase)) {
      throw new Error('Invalid native storage phase');
    }
    integer(op.statusReads, 0, 120);
    if (op.expiresAt !== undefined) integer(op.expiresAt, 0, Number.MAX_SAFE_INTEGER);
    if (op.phase === 'abandoned') {
      integer(op.abandonedAt!, 0, Number.MAX_SAFE_INTEGER);
      if (op.commandId !== undefined) positive(op.commandId);
      if (op.result !== undefined) throw new Error('Abandonment is not provider completion');
      this.boundedJson(this.state, this.maxJsonBytes + 32768);
      return;
    }
    const notStarted = op.phase === 'finished' && op.result?.status === 'failed' && op.result.reason === 'not-started';
    const refused = op.phase === 'finished' && op.result?.status === 'failed' && op.result.reason === 'refused';
    if (notStarted || refused) {
      if (op.commandId !== undefined || op.statusReads !== 0) throw new Error('Invalid unaccepted operation receipt');
      if (refused && (op.result?.status !== 'failed' || !Number.isSafeInteger(op.result.httpStatus)
        || op.result.httpStatus! < 400 || op.result.httpStatus! >= 500 || op.result.httpStatus === 408)) {
        throw new Error('Invalid refused operation receipt');
      }
    } else if (op.phase !== 'intent') positive(op.commandId);
    if (op.phase === 'prepared' && op.kind === 'catalog') positive(op.resultCommandId);
    if (op.kind === 'clip') {
      if (!op.clip) throw new Error('Missing native clip context');
      positive(op.clip.manifestId); this.validateClip(op.clip.clip, op.networkId);
      if (!op.clip.clip.mediaUrl) throw new Error('Missing native media location');
    }
    if (op.phase === 'finished') {
      if (!op.result || !['ready', 'failed'].includes(op.result.status)) throw new Error('Invalid native storage receipt');
      if (op.result.status === 'failed') {
        if (!['command-failed', 'invalid-result', 'invalid-media', 'not-started', 'refused', 'discarded'].includes(op.result.reason)) {
          throw new Error('Invalid native storage failure receipt');
        }
      } else if (op.kind === 'clip') {
        if (!this.validStoredMedia(op.result.value as NativeStoredMedia)) throw new Error('Invalid native media receipt');
      } else {
        const value = op.result.value as NativeStorageCatalog;
        if (!value || !Array.isArray(value.clips)) throw new Error('Invalid native catalog receipt');
        this.catalog({ manifest_id: value.manifestId, page_size: value.pageSize, pagination_key: value.paginationKey,
          media: value.clips.map(clip => ({ id: clip.clipId, network_id: clip.networkId, device_name: clip.deviceName,
            created_at: clip.capturedAt, media: clip.mediaUrl })) }, op.networkId);
      }
    }
    this.boundedJson(this.state, this.maxJsonBytes + 32768);
  }

  private boundedJson(value: unknown, maxBytes = this.maxJsonBytes): unknown {
    const encoded = JSON.stringify(value);
    if (typeof encoded !== 'string' || Buffer.byteLength(encoded) > maxBytes) throw new Error('Native JSON body limit exceeded');
    return value;
  }

  private modulePath(scope: NativeStorageScope): string {
    return `v1/accounts/${scope.accountId}/networks/${scope.networkId}/sync_modules/${scope.syncModuleId}/local_storage`;
  }

  private preparationRoute(op: NativeStorageOperation): NativeStorageRoute {
    const suffix = op.kind === 'catalog' ? 'manifest/request' :
      `manifest/${op.clip!.manifestId}/clip/request/${op.clip!.clip.clipId}`;
    return { base: 'api', path: `${this.modulePath(op)}/${suffix}` };
  }

  private requestOptions(options: RequestOptions, maxBytes: number): NativeStorageRequestOptions {
    return { ...options, maxBytes, retry: false };
  }

  private unresolved(reason: string): NativeStorageResult<never> {
    return { status: 'unresolved', reason, ...(this.state.operation ? { operation: clone(this.state.operation) } : {}) };
  }

  private async persist(operation: NativeStorageOperation, generation = this.generation): Promise<void> {
    if (generation !== this.generation) throw new Error('Native operation was locally abandoned');
    const next: NativeStorageState = { version: 1, operation: clone(operation),
      ...(this.state.abandoned ? { abandoned: clone(this.state.abandoned) } : {}) };
    try {
      this.boundedJson(next, this.maxJsonBytes + 32768);
      await this.options.saveState(clone(next));
      if (generation !== this.generation) throw new Error('Native operation was locally abandoned');
      this.state = next;
    }
    catch {
      if (generation !== this.generation) throw new Error('Native operation was locally abandoned');
      this.persistenceFailed = true; throw new Error('Native storage persistence failed');
    }
  }

  private async finish(result: NativeStorageTerminal<NativeStorageCatalog | NativeStoredMedia>, generation = this.generation):
    Promise<NativeStorageResult<NativeStorageCatalog | NativeStoredMedia>> {
    await this.persist({ ...this.state.operation!, phase: 'finished', result: clone(result) }, generation);
    return result;
  }
}
