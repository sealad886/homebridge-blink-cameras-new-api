import { randomUUID } from 'node:crypto';
import { isRemoteOperationLeaseActive, REMOTE_OPERATION_LEASE_MS } from './operation-budget';

/** Blink-origin motion, independent of HomeKit's held MotionDetected boolean. */
export interface NativeRecordingObservation {
  source: 'provider';
  kind: 'motion-start';
  eventId: string;
  moduleId: string;
  cameraId: string;
  occurredAt: number;
}

export interface NativeRecordingJob {
  observation: NativeRecordingObservation;
  eligibleAt: number;
  attempts: number;
  cameraGeneration: number;
  /** One opportunistic early read falls back to the ordinary recording delay. */
  fallbackAt?: number;
  cancelled?: boolean;
}

export interface NativeRecordingOperation {
  operationId: string;
  jobKey: string;
  startedAt: number;
  status: 'active' | 'unresolved';
}

export interface NativeRecordingState {
  version: 1;
  rememberedEvents: string[];
  queue: NativeRecordingJob[];
  operation?: NativeRecordingOperation;
}

export interface NativeRecordingAcquisition {
  operationId: string;
  expiresAt: number;
  moduleId: string;
  observation: NativeRecordingObservation;
  /** One-based availability attempt; an optional early search does not spend the ordinary retry budget. */
  attempt: number;
  /** Combine this fence with current HomeKit permission before local delivery. */
  cameraGeneration: number;
  /** Ordinary eligibility after the optional exact-only early lookup. */
  fallbackAt?: number;
}

export type NativeRecordingTerminalResult =
  | { status: 'missing' }
  | { status: 'skipped' }
  | {
    status: 'retrieved';
    /** Other event IDs proven to refer to this clip on the same camera/module. */
    satisfiedEventIds?: readonly string[];
  };

/** Local abandonment is distinct from verified provider completion. */
export type NativeRecordingAcquisitionResult = NativeRecordingTerminalResult | { status: 'unresolved' } | { status: 'abandoned' };

export interface NativeRecordingJobResult {
  observation: NativeRecordingObservation;
  attempts: number;
  outcome: 'retrieved' | 'exhausted' | 'cancelled' | 'expired' | 'abandoned';
}

export interface NativeRecordingCoordinatorOptions {
  moduleIds: readonly string[];
  /** Use the API client's existing account command admission, not another lock. */
  acquire: (request: NativeRecordingAcquisition, signal: globalThis.AbortSignal) => Promise<NativeRecordingAcquisitionResult>;
  /** Resolve only after an atomic, durable write; failure stops new acquisition. */
  saveState: (state: NativeRecordingState) => Promise<void>;
  /** Local reporting only. HSV delivery belongs outside provider ownership. */
  onJobFinished: (result: NativeRecordingJobResult) => void;
  onError: (error: Error) => void;
  restoredState?: NativeRecordingState;
  initialDelayMs?: number;
  retryIntervalMs?: number;
  maxRetries?: number;
  maxQueuedJobs?: number;
  maxRememberedEvents?: number;
  maxJobAgeMs?: number;
  /** Local readiness/cooldown only; must not send provider requests. */
  earliestAcquisitionAt?: (observation: NativeRecordingObservation, fallbackAt?: number) => number;
  /** Local receipt cleanup only; no provider requests or retries. */
  onOperationAbandoned?: () => Promise<void>;
}

export type NativeRecordingObservationResult = 'accepted' | 'duplicate' | 'unknown-module' | 'capacity' | 'invalid' | 'stopped' | 'cancelled';

const eventKey = (event: NativeRecordingObservation): string => JSON.stringify([event.moduleId, event.cameraId, event.eventId]);
const cloneObservation = (event: NativeRecordingObservation): NativeRecordingObservation => ({ ...event });
const asError = (error: unknown): Error => error instanceof Error ? error : new Error(String(error));

/** One durable ready FIFO with a finite local ownership lease. */
export class NativeRecordingCoordinator {
  private readonly moduleIds: Set<string>;
  private readonly queue: NativeRecordingJob[] = [];
  private readonly remembered = new Set<string>();
  private readonly cameraGenerations = new Map<string, number>();
  private readonly initialDelayMs: number;
  private readonly retryIntervalMs: number;
  private readonly maxRetries: number;
  private readonly maxQueuedJobs: number;
  private readonly maxRememberedEvents: number;
  private readonly maxJobAgeMs: number;
  private operation?: NativeRecordingOperation;
  private operationDispatched = false;
  private timer?: ReturnType<typeof globalThis.setTimeout>;
  private controller?: globalThis.AbortController;
  private writes: Promise<void> = Promise.resolve();
  private storageError?: Error;
  private stopped = false;
  private abandoning = false;

  constructor(private readonly options: NativeRecordingCoordinatorOptions) {
    this.initialDelayMs = this.limit(options.initialDelayMs ?? 60_000, 0, 86_400_000);
    this.retryIntervalMs = this.limit(options.retryIntervalMs ?? 5_000, 1, 3_600_000);
    this.maxRetries = this.limit(options.maxRetries ?? 10, 0, 100);
    this.maxQueuedJobs = this.limit(options.maxQueuedJobs ?? 128, 1, 10_000);
    this.maxRememberedEvents = this.limit(options.maxRememberedEvents ?? 2_048, 1, 65_536);
    this.maxJobAgeMs = this.limit(options.maxJobAgeMs ?? 900_000, 1, 86_400_000);
    this.moduleIds = new Set(options.moduleIds);
    if (this.moduleIds.size !== options.moduleIds.length || [...this.moduleIds].some(id => !this.identifier(id))) {
      throw new Error('Native recording module IDs must be unique nonempty strings');
    }
    if (options.restoredState) {
      this.restore(options.restoredState);
    }
    this.schedule();
  }

  async observe(event: NativeRecordingObservation, capturedGeneration?: number,
    timing?: { initialDelayMs: number; fallbackAt?: number }): Promise<NativeRecordingObservationResult> {
    if (this.stopped) {
      return 'stopped';
    }
    this.assertStorage();
    const initialDelayMs = timing?.initialDelayMs ?? this.initialDelayMs;
    if (!this.validObservation(event) || !Number.isSafeInteger(initialDelayMs) || initialDelayMs < 0 || initialDelayMs > 86_400_000
      || (timing?.fallbackAt !== undefined && (!Number.isSafeInteger(timing.fallbackAt) || timing.fallbackAt < event.occurredAt))) {
      return 'invalid';
    }
    if (!this.moduleIds.has(event.moduleId)) {
      return 'unknown-module';
    }
    const cameraGeneration = this.cameraGeneration(event.moduleId, event.cameraId);
    if (capturedGeneration !== undefined && capturedGeneration !== cameraGeneration) {
      return 'cancelled';
    }
    const key = eventKey(event);
    if (this.remembered.has(key) || this.queue.some(job => eventKey(job.observation) === key)) {
      return 'duplicate';
    }
    if (this.queue.length >= this.maxQueuedJobs) {
      return 'capacity';
    }
    this.queue.push({ observation: cloneObservation(event), eligibleAt: Math.max(Date.now(), event.occurredAt + initialDelayMs), attempts: 0, cameraGeneration,
      ...(timing?.fallbackAt !== undefined ? { fallbackAt: timing.fallbackAt } : {}) });
    this.remember(key);
    await this.persist();
    this.schedule();
    return 'accepted';
  }

  cameraGeneration(moduleId: string, cameraId: string): number {
    return this.cameraGenerations.get(JSON.stringify([moduleId, cameraId])) ?? 0;
  }

  isCameraGenerationCurrent(moduleId: string, cameraId: string, generation: number): boolean {
    return !this.stopped && !this.storageError && this.moduleIds.has(moduleId) && this.identifier(cameraId)
      && Number.isSafeInteger(generation) && generation >= 0 && this.cameraGeneration(moduleId, cameraId) === generation;
  }

  /** Revoke queued delivery without claiming that an active remote command ended. */
  async cancelCamera(moduleId: string, cameraId: string): Promise<number> {
    this.assertStorage();
    if (!this.moduleIds.has(moduleId) || !this.identifier(cameraId)) return 0;
    const key = JSON.stringify([moduleId, cameraId]);
    this.cameraGenerations.set(key, this.cameraGeneration(moduleId, cameraId) + 1);
    const cancelled: NativeRecordingJob[] = [];
    for (let index = 0; index < this.queue.length;) {
      const job = this.queue[index];
      if (job.observation.moduleId !== moduleId || job.observation.cameraId !== cameraId) {
        index++;
        continue;
      }
      if (!job.cancelled) cancelled.push(job);
      if (index === 0 && this.operation && this.operationDispatched) {
        job.cancelled = true;
        this.operation.status = 'unresolved';
        this.controller?.abort();
        index++;
      } else {
        if (index === 0 && this.operation) {
          // The intent was durable, but acquire has not been invoked.
          this.operation = undefined;
          this.controller?.abort();
        }
        this.queue.splice(index, 1);
      }
    }
    await this.persist();
    for (const job of cancelled) {
      this.options.onJobFinished({ observation: cloneObservation(job.observation), attempts: job.attempts, outcome: 'cancelled' });
    }
    this.schedule();
    return cancelled.length;
  }

  /** Keep explicit local abandonment distinct from verified provider results. */
  async resolveOperation(resolution: {
    moduleId: string;
    operationId: string;
    status: 'verified-terminal' | 'locally-abandoned';
    result: NativeRecordingTerminalResult;
  }): Promise<boolean> {
    if (this.stopped) {
      return false;
    }
    this.assertStorage();
    if (!['verified-terminal', 'locally-abandoned'].includes(resolution.status) || this.operation?.status !== 'unresolved'
      || this.operation.operationId !== resolution.operationId || this.queue[0]?.observation.moduleId !== resolution.moduleId) {
      return false;
    }
    await this.finishAttempt(resolution.status === 'locally-abandoned' ? { status: 'abandoned' } : resolution.result);
    this.schedule();
    return true;
  }

  snapshot(): NativeRecordingState {
    return {
      version: 1,
      rememberedEvents: [...this.remembered],
      queue: this.queue.map(job => ({ ...job, observation: cloneObservation(job.observation) })),
      ...(this.operation ? { operation: { ...this.operation } } : {}),
    };
  }

  async retryPersistence(): Promise<void> {
    await this.options.saveState(this.snapshot());
    this.storageError = undefined;
    this.schedule();
  }

  /** Stop local scheduling; preserve the queue and any uncertain remote owner. */
  async stop(): Promise<void> {
    if (this.stopped) {
      await this.writes;
      return;
    }
    this.stopped = true;
    this.suspend();
    await this.persist();
  }

  private schedule(): void {
    if (this.timer) {
      globalThis.clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.stopped || this.storageError || this.abandoning || !this.queue.length) {
      return;
    }
    this.timer = globalThis.setTimeout(() => {
      this.timer = undefined;
      void this.run().catch(error => this.options.onError(asError(error)));
    }, Math.min(2_147_483_647, Math.max(0, (this.operation ? this.operationExpiry() : Math.min(...this.queue.map(job =>
      Math.min(this.eligibleAt(job), job.observation.occurredAt + this.maxJobAgeMs)))) - Date.now())));
  }

  private operationExpiry(now = Date.now()): number {
    const expiry = Math.min(this.operation!.startedAt + REMOTE_OPERATION_LEASE_MS,
      this.queue[0].observation.occurredAt + this.maxJobAgeMs);
    return isRemoteOperationLeaseActive(expiry, now) ? expiry : now;
  }

  private async run(): Promise<void> {
    if (this.stopped || this.storageError || this.abandoning || !this.queue.length) {
      return;
    }
    if (this.operation) {
      const now = Date.now();
      if (now < this.operationExpiry(now)) { this.schedule(); return; }
      this.controller?.abort();
      // Invalidate identity before async cleanup so late acquisition cannot publish.
      const abandoned = this.operation;
      this.abandoning = true;
      this.operation = undefined;
      this.operationDispatched = false;
      const [job] = this.queue.splice(0, 1);
      try {
        try { await this.options.onOperationAbandoned?.(); }
        catch (error) { this.options.onError(asError(error)); }
        await this.persist();
        if (!job.cancelled) this.options.onJobFinished({ observation: cloneObservation(job.observation), attempts: job.attempts, outcome: 'abandoned' });
        this.options.onError(new Error(`Native recording operation ${abandoned.operationId} was locally abandoned after its availability lease.`));
      } finally { this.abandoning = false; this.schedule(); }
      return;
    }
    const expiredIndex = this.queue.findIndex(job => Date.now() >= job.observation.occurredAt + this.maxJobAgeMs);
    if (expiredIndex !== -1) {
      const [job] = this.queue.splice(expiredIndex, 1);
      await this.persist();
      this.options.onJobFinished({ observation: cloneObservation(job.observation), attempts: job.attempts, outcome: 'expired' });
      this.schedule();
      return;
    }
    const readyIndex = this.queue.findIndex(job => this.eligibleAt(job) <= Date.now());
    if (readyIndex === -1) {
      this.schedule();
      return;
    }
    // Select the first ready job, keeping an active or uncertain owner at index
    // zero. A camera waiting for a local retry cannot hold other ready cameras.
    const [job] = this.queue.splice(readyIndex, 1);
    this.queue.unshift(job);
    // A lower retry setting on restart must not grant another attempt.
    if (job.attempts > this.maxRetries) {
      this.queue.shift();
      await this.persist();
      this.options.onJobFinished({ observation: cloneObservation(job.observation), attempts: job.attempts, outcome: 'exhausted' });
      this.schedule();
      return;
    }
    job.attempts++;
    const operation: NativeRecordingOperation = {
      operationId: randomUUID(), jobKey: eventKey(job.observation), startedAt: Date.now(), status: 'active',
    };
    this.operation = operation;
    this.operationDispatched = false;
    const controller = new globalThis.AbortController();
    this.controller = controller;
    try {
      // Persist before dispatch, including before a potentially lost acknowledgement.
      await this.persist();
      if (this.stopped || this.storageError || this.operation !== operation || job.cancelled) {
        return;
      }
      this.operationDispatched = true;
      this.schedule();
      const result = await this.options.acquire({
        operationId: operation.operationId, expiresAt: this.operationExpiry(), moduleId: job.observation.moduleId,
        observation: cloneObservation(job.observation), attempt: job.attempts,
        cameraGeneration: job.cameraGeneration,
        ...(job.fallbackAt === undefined ? {} : { fallbackAt: job.fallbackAt }),
      }, controller.signal);
      if (!this.stopped && !this.storageError && this.operation === operation) {
        if (result.status === 'unresolved') {
          operation.status = 'unresolved';
          await this.persist();
        } else {
          await this.finishAttempt(result);
        }
      }
    } catch (error) {
      if (this.operation === operation) {
        operation.status = 'unresolved';
        if (!this.storageError) {
          await this.persist();
        }
      }
      this.options.onError(asError(error));
    } finally {
      if (this.controller === controller) {
        this.controller = undefined;
      }
      this.schedule();
    }
  }

  private async finishAttempt(result: NativeRecordingTerminalResult | { status: 'abandoned' }): Promise<void> {
    const job = this.queue[0];
    if (result.status !== 'missing' && result.status !== 'retrieved' && result.status !== 'skipped' && result.status !== 'abandoned') {
      throw new Error('A verified terminal acquisition result is required');
    }
    this.operation = undefined;
    this.operationDispatched = false;
    const finished: NativeRecordingJobResult[] = [];
    if (job.cancelled) {
      // Cancellation was already reported; only remote ownership remained.
      this.queue.shift();
    } else if (result.status === 'missing' && job.fallbackAt !== undefined && job.eligibleAt < job.fallbackAt) {
      this.queue.shift();
      job.eligibleAt = job.fallbackAt;
      job.attempts--; // The optional early lookup does not spend the ordinary availability retry budget.
      this.queue.push(job);
    } else if (result.status === 'missing' && job.attempts <= this.maxRetries) {
      this.queue.shift();
      job.eligibleAt = Date.now() + this.retryIntervalMs;
      this.queue.push(job);
    } else {
      this.queue.shift();
      finished.push({ observation: cloneObservation(job.observation), attempts: job.attempts,
        outcome: result.status === 'retrieved' ? 'retrieved' : result.status === 'skipped' ? 'cancelled' : result.status === 'abandoned' ? 'abandoned' : 'exhausted' });
      if (result.status === 'retrieved' && result.satisfiedEventIds?.length) {
        const related = new Set(result.satisfiedEventIds.slice(0, this.maxQueuedJobs));
        for (let index = 0; index < this.queue.length;) {
          const candidate = this.queue[index];
          if (candidate.observation.moduleId === job.observation.moduleId && candidate.observation.cameraId === job.observation.cameraId
            && related.has(candidate.observation.eventId)) {
            this.queue.splice(index, 1);
            finished.push({ observation: cloneObservation(candidate.observation), attempts: candidate.attempts, outcome: 'retrieved' });
          } else {
            index++;
          }
        }
      }
    }
    await this.persist();
    for (const completion of finished) {
      this.options.onJobFinished(completion);
    }
  }

  private async persist(): Promise<void> {
    const snapshot = this.snapshot();
    const write = this.writes.then(async () => {
      this.assertStorage();
      await this.options.saveState(snapshot);
    });
    this.writes = write.catch(() => undefined);
    try {
      await write;
    } catch (error) {
      if (!this.storageError) {
        this.storageError = asError(error);
        this.suspend();
      }
      throw this.storageError;
    }
  }

  private suspend(): void {
    if (this.timer) {
      globalThis.clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.operation) {
      this.operation.status = 'unresolved';
    }
    this.controller?.abort();
  }

  private restore(saved: NativeRecordingState): void {
    if (saved.version !== 1 || !Array.isArray(saved.queue) || saved.queue.length > this.maxQueuedJobs || !Array.isArray(saved.rememberedEvents)) {
      throw new Error('Invalid native recording state');
    }
    for (const key of saved.rememberedEvents.slice(-this.maxRememberedEvents)) {
      if (typeof key !== 'string') {
        throw new Error('Invalid native recording event identity');
      }
      this.remember(key);
    }
    const restored = new Set<string>();
    for (const job of saved.queue) {
      if (!this.validObservation(job.observation) || !this.moduleIds.has(job.observation.moduleId)
        || !Number.isFinite(job.eligibleAt) || !Number.isInteger(job.attempts) || job.attempts < 0 || job.attempts > 101
        || !Number.isSafeInteger(job.cameraGeneration) || job.cameraGeneration < 0
        || (job.fallbackAt !== undefined && (!Number.isSafeInteger(job.fallbackAt) || job.fallbackAt < job.observation.occurredAt))
        || (job.cancelled !== undefined && typeof job.cancelled !== 'boolean')
        || restored.has(eventKey(job.observation))) {
        throw new Error('Invalid native recording job');
      }
      restored.add(eventKey(job.observation));
      this.queue.push({ ...job, observation: cloneObservation(job.observation) });
      const key = JSON.stringify([job.observation.moduleId, job.observation.cameraId]);
      const generation = job.cameraGeneration + (job.cancelled ? 1 : 0);
      this.cameraGenerations.set(key, Math.max(generation, this.cameraGeneration(job.observation.moduleId, job.observation.cameraId)));
    }
    if (this.queue.some((job, index) => job.cancelled && (index !== 0 || !saved.operation))) {
      throw new Error('A cancelled native owner requires its unresolved operation');
    }
    if (saved.operation !== undefined) {
      const operation = saved.operation;
      if (!operation || typeof operation !== 'object' || !this.identifier(operation.operationId) || !Number.isFinite(operation.startedAt)
        || !['active', 'unresolved'].includes(operation.status) || !this.queue[0]?.attempts
        || operation.jobKey !== eventKey(this.queue[0].observation)) {
        throw new Error('Invalid native recording operation');
      }
      this.operation = { ...operation, status: 'unresolved' };
      this.operationDispatched = true;
    }
  }

  private remember(key: string): void {
    this.remembered.add(key);
    while (this.remembered.size > this.maxRememberedEvents) {
      this.remembered.delete(this.remembered.values().next().value!);
    }
  }

  private eligibleAt(job: NativeRecordingJob): number {
    const local = this.options.earliestAcquisitionAt?.(cloneObservation(job.observation), job.fallbackAt) ?? 0;
    if (!Number.isSafeInteger(local) || local < 0) throw new Error('Invalid local acquisition readiness');
    return Math.max(job.eligibleAt, local);
  }

  private validObservation(event: NativeRecordingObservation): boolean {
    return !!event && event.source === 'provider' && event.kind === 'motion-start'
      && this.identifier(event.eventId) && this.identifier(event.moduleId) && this.identifier(event.cameraId)
      && Number.isFinite(event.occurredAt) && event.occurredAt >= 0;
  }

  private identifier(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 256;
  }

  private limit(value: number, min: number, max: number): number {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`Native recording limit must be an integer between ${min} and ${max}`);
    }
    return value;
  }

  private assertStorage(): void {
    if (this.storageError) {
      throw this.storageError;
    }
  }
}
