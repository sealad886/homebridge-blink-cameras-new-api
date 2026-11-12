import {
  NativeRecordingAcquisition,
  NativeRecordingAcquisitionResult,
  NativeRecordingCoordinator,
  NativeRecordingCoordinatorOptions,
  NativeRecordingObservation,
  NativeRecordingState,
} from '../src/native-recording-coordinator';

const event = (eventId: string, overrides: Partial<NativeRecordingObservation> = {}): NativeRecordingObservation => ({
  source: 'provider', kind: 'motion-start', eventId,
  moduleId: 'module-1', cameraId: 'entry', occurredAt: Date.now(), ...overrides,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

describe('native recording FIFO', () => {
  let coordinators: NativeRecordingCoordinator[];

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-09T06:00:00Z'));
    coordinators = [];
  });

  afterEach(async () => {
    await Promise.all(coordinators.map(coordinator => coordinator.stop().catch(() => undefined)));
    jest.useRealTimers();
  });

  const setup = (overrides: Partial<NativeRecordingCoordinatorOptions> = {}) => {
    const acquire = jest.fn<Promise<NativeRecordingAcquisitionResult>, [NativeRecordingAcquisition, AbortSignal]>()
      .mockResolvedValue({ status: 'retrieved' });
    const saveState = jest.fn<Promise<void>, [NativeRecordingState]>().mockResolvedValue(undefined);
    const onError = jest.fn();
    const onJobFinished = jest.fn();
    const options: NativeRecordingCoordinatorOptions = {
      moduleIds: ['module-1', 'module-2'], acquire, saveState, onError, onJobFinished, ...overrides,
    };
    const coordinator = new NativeRecordingCoordinator(options);
    coordinators.push(coordinator);
    return { coordinator, acquire, saveState, onError, onJobFinished };
  };

  it('does no acquisition or persistence work for an idle account', async () => {
    const { acquire, saveState } = setup();

    await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1_000);

    expect(acquire).not.toHaveBeenCalled();
    expect(saveState).not.toHaveBeenCalled();
  });

  it('abandons an expired owner when clock reads advance and still runs the next distinct event', async () => {
    const acquire = jest.fn().mockResolvedValueOnce({ status: 'unresolved' }).mockResolvedValue({ status: 'retrieved' });
    const { coordinator, onJobFinished } = setup({ acquire });
    await coordinator.observe(event('uncertain-head'));
    await coordinator.observe(event('next-module', { moduleId: 'module-2' }));
    await jest.advanceTimersByTimeAsync(60000);
    expect(acquire).toHaveBeenCalledTimes(1);
    let clock = Date.now() + 120000;
    const advancing = jest.spyOn(Date, 'now').mockImplementation(() => clock++);
    try {
      await jest.advanceTimersByTimeAsync(120010);
      expect(acquire.mock.calls.map(([request]) => request.observation.eventId)).toEqual(['uncertain-head', 'next-module']);
      expect(onJobFinished).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'abandoned' }));
    } finally { advancing.mockRestore(); }
  });

  it('does not let a restored future timestamp renew an ownership lease', async () => {
    const first = setup({ acquire: jest.fn().mockResolvedValue({ status: 'unresolved' }) });
    await first.coordinator.observe(event('old'));
    await jest.advanceTimersByTimeAsync(60000);
    const saved = first.coordinator.snapshot(); await first.coordinator.stop();
    saved.operation!.startedAt = Date.now() + 24 * 60 * 60 * 1000;
    const restored = setup({ restoredState: saved });
    await jest.advanceTimersByTimeAsync(1);
    expect(restored.coordinator.snapshot().operation).toBeUndefined();
    expect(restored.onJobFinished).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'abandoned' }));
    expect(restored.acquire).not.toHaveBeenCalled();
  });

  it('recovers scheduling after an explicit successful persistence retry', async () => {
    const saveState = jest.fn().mockRejectedValueOnce(new Error('temporary disk failure')).mockResolvedValue(undefined);
    const f = setup({ saveState });
    await expect(f.coordinator.observe(event('not-dispatched'))).rejects.toThrow('temporary disk failure');
    await jest.advanceTimersByTimeAsync(60000); expect(f.acquire).not.toHaveBeenCalled();
    await f.coordinator.retryPersistence();
    await jest.advanceTimersByTimeAsync(1);
    expect(f.acquire).toHaveBeenCalledTimes(1);
  });

  it('makes a motion job eligible sixty seconds after motion by default', async () => {
    const { coordinator, acquire } = setup();
    await coordinator.observe(event('entry-motion'));

    await jest.advanceTimersByTimeAsync(59_999);
    expect(acquire).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire.mock.calls[0][0]).toEqual(expect.objectContaining({ moduleId: 'module-1', attempt: 1,
      observation: expect.objectContaining({ eventId: 'entry-motion' }) }));
  });

  it('uses the motion timestamp rather than restarting the full delay on notification arrival', async () => {
    const { coordinator, acquire } = setup();
    await coordinator.observe(event('delayed-notification', { occurredAt: Date.now() - 55_000 }));

    await jest.advanceTimersByTimeAsync(4_999);
    expect(acquire).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(acquire).toHaveBeenCalledTimes(1);
  });

  it('makes only an explicitly completed-clip observation immediately eligible while preserving FIFO and missing retries', async () => {
    const { coordinator, acquire } = setup();
    acquire.mockResolvedValueOnce({ status: 'missing' });
    await coordinator.observe(event('normal-delay'));
    await coordinator.observe(event('completed-clip'), undefined, { initialDelayMs: 0 });
    await coordinator.observe(event('next-completed-clip', { cameraId: 'corner' }), undefined, { initialDelayMs: 0 });
    await jest.advanceTimersByTimeAsync(1);
    expect(acquire.mock.calls.map(([request]) => request.observation.eventId)).toEqual(['completed-clip', 'next-completed-clip']);
    await jest.advanceTimersByTimeAsync(4998);
    expect(acquire).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(acquire.mock.calls.map(([request]) => request.observation.eventId)).toEqual(['completed-clip', 'next-completed-clip', 'completed-clip']);
    await jest.advanceTimersByTimeAsync(55_000);
    expect(acquire.mock.calls.at(-1)?.[0].observation.eventId).toBe('normal-delay');
  });

  it('preserves the normal availability budget after one exact-only early lookup misses', async () => {
    const { coordinator, acquire } = setup({ maxRetries: 0 });
    acquire.mockResolvedValue({ status: 'missing' });
    const occurredAt = Date.now();
    await coordinator.observe(event('completed-notice'), undefined, { initialDelayMs: 0, fallbackAt: occurredAt + 300_000 });
    await jest.advanceTimersByTimeAsync(0);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(coordinator.snapshot().queue[0]).toEqual(expect.objectContaining({ attempts: 0, eligibleAt: occurredAt + 300_000 }));
    const saved = coordinator.snapshot(); await coordinator.stop();
    const restored = setup({ maxRetries: 0, restoredState: saved });
    restored.acquire.mockResolvedValue({ status: 'missing' });
    await jest.advanceTimersByTimeAsync(299_999);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(restored.acquire).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(restored.acquire).toHaveBeenCalledTimes(1);
    expect(restored.coordinator.snapshot().queue).toHaveLength(0);
    saved.queue[0].fallbackAt = NaN;
    expect(() => setup({ restoredState: saved })).toThrow('Invalid native recording job');
  });

  it('keeps the ordinary attempt when an early missing response arrives after fallback eligibility', async () => {
    const held = deferred<NativeRecordingAcquisitionResult>();
    const { coordinator, acquire } = setup({ maxRetries: 0 });
    acquire.mockReturnValueOnce(held.promise);
    await coordinator.observe(event('slow-early-lookup'), undefined, { initialDelayMs: 0, fallbackAt: Date.now() + 60_000 });
    await jest.advanceTimersByTimeAsync(60_001);
    expect(acquire).toHaveBeenCalledTimes(1);
    held.resolve({ status: 'missing' });
    await jest.advanceTimersByTimeAsync(1);
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(acquire.mock.calls.map(([request]) => request.attempt)).toEqual([1, 1]);
    expect(coordinator.snapshot().queue).toHaveLength(0);
  });

  it('preserves distinct FIFO jobs across cameras and modules instead of merging motion', async () => {
    const first = deferred<NativeRecordingAcquisitionResult>();
    const acquire = jest.fn().mockImplementationOnce(() => first.promise).mockResolvedValue({ status: 'retrieved' });
    const { coordinator } = setup({ acquire });
    await coordinator.observe(event('entry-motion'));
    await coordinator.observe(event('corner-motion', { cameraId: 'corner' }));
    await coordinator.observe(event('other-module', { moduleId: 'module-2' }));

    await jest.advanceTimersByTimeAsync(60_000);
    expect(acquire).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(100_000);
    expect(acquire).toHaveBeenCalledTimes(1);
    first.resolve({ status: 'retrieved' });
    await jest.advanceTimersByTimeAsync(10);

    expect(acquire.mock.calls.map(([request]: [NativeRecordingAcquisition]) => request.observation.eventId))
      .toEqual(['entry-motion', 'corner-motion', 'other-module']);
  });

  it('runs a later ready job while an earlier job is still waiting for its own capture delay', async () => {
    const { coordinator, acquire } = setup();
    await coordinator.observe(event('head'));
    await coordinator.observe(event('older-but-delivered-later', { occurredAt: Date.now() - 100_000 }));

    await jest.advanceTimersByTimeAsync(59_999);
    expect(acquire.mock.calls.map(([request]) => request.observation.eventId)).toEqual(['older-but-delivered-later']);
    await jest.advanceTimersByTimeAsync(10);

    expect(acquire.mock.calls.map(([request]) => request.observation.eventId)).toEqual(['older-but-delivered-later', 'head']);
  });

  it('deduplicates only matching event/camera/module bindings', async () => {
    const { coordinator, acquire } = setup();
    const first = event('same-id');
    expect(await coordinator.observe(first)).toBe('accepted');
    expect(await coordinator.observe(first)).toBe('duplicate');
    expect(await coordinator.observe(event('same-id', { cameraId: 'corner' }))).toBe('accepted');
    expect(await coordinator.observe(event('same-id', { moduleId: 'module-2' }))).toBe('accepted');
    await jest.advanceTimersByTimeAsync(60_010);

    expect(acquire).toHaveBeenCalledTimes(3);
    expect(await coordinator.observe(first)).toBe('duplicate');
  });

  it('requeues a terminal missing job so another ready camera proceeds before its five-second retry', async () => {
    const acquire = jest.fn().mockResolvedValueOnce({ status: 'missing' }).mockResolvedValue({ status: 'retrieved' });
    const { coordinator } = setup({ acquire });
    await coordinator.observe(event('first'));
    await coordinator.observe(event('second', { cameraId: 'corner' }));
    await jest.advanceTimersByTimeAsync(60_001);

    expect(acquire).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(4_998);
    expect(acquire).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(2);

    expect(acquire.mock.calls.map(([request]: [NativeRecordingAcquisition]) => [request.observation.eventId, request.attempt]))
      .toEqual([['first', 1], ['second', 1], ['first', 2]]);
  });

  it('permits one initial attempt and exactly ten retries by default, then reports exhaustion', async () => {
    const acquire = jest.fn().mockResolvedValue({ status: 'missing' });
    const { coordinator, onJobFinished } = setup({ acquire });
    await coordinator.observe(event('missing'));
    await jest.advanceTimersByTimeAsync(60_000);
    for (let index = 1; index <= 10; index++) {
      await jest.advanceTimersByTimeAsync(5_000);
      expect(acquire).toHaveBeenCalledTimes(index + 1);
    }
    await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1_000);

    expect(acquire).toHaveBeenCalledTimes(11);
    expect(coordinator.snapshot().queue).toEqual([]);
    expect(onJobFinished).toHaveBeenCalledWith(expect.objectContaining({ attempts: 11, outcome: 'exhausted' }));
  });

  it('supports validated configurable delay, retry interval and retry count, including zero retries', async () => {
    const acquire = jest.fn().mockResolvedValue({ status: 'missing' });
    const { coordinator, onJobFinished } = setup({ acquire, initialDelayMs: 1_000, retryIntervalMs: 250, maxRetries: 0 });
    await coordinator.observe(event('missing'));
    await jest.advanceTimersByTimeAsync(999);
    expect(acquire).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(10_000);

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(onJobFinished).toHaveBeenCalledWith(expect.objectContaining({ attempts: 1, outcome: 'exhausted' }));
    for (const invalid of [{ initialDelayMs: -1 }, { retryIntervalMs: 0 }, { maxRetries: 1.5 }, { maxRetries: -1 }, { maxQueuedJobs: 0 }]) {
      expect(() => setup(invalid)).toThrow('Native recording limit');
    }
  });

  it('abandons an unresolved head after its lease and runs another module without retrying the old event', async () => {
    const acquire = jest.fn().mockResolvedValueOnce({ status: 'unresolved' }).mockResolvedValue({ status: 'retrieved' });
    const { coordinator, onJobFinished } = setup({ acquire });
    await coordinator.observe(event('uncertain'));
    await jest.advanceTimersByTimeAsync(60_000);
    await coordinator.observe(event('later', { moduleId: 'module-2' }));
    await jest.advanceTimersByTimeAsync(119_999);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(coordinator.snapshot().operation?.status).toBe('unresolved');
    await jest.advanceTimersByTimeAsync(2);
    expect(acquire.mock.calls.map(([request]) => request.observation.eventId)).toEqual(['uncertain', 'later']);
    expect(coordinator.snapshot().queue).toEqual([]);
    expect(onJobFinished).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'abandoned' }));
    expect(await coordinator.observe(event('uncertain'))).toBe('duplicate');
  });

  it('does not let a missing camera cooldown delay another ready camera', async () => {
    let cornerEligibleAt = Date.now();
    const acquire = jest.fn<Promise<NativeRecordingAcquisitionResult>, [NativeRecordingAcquisition, AbortSignal]>().mockImplementation(async request => {
      if (request.observation.cameraId === 'corner') {
        cornerEligibleAt = Date.now() + 60_000; return { status: 'missing' };
      }
      return { status: 'retrieved' };
    });
    const { coordinator } = setup({ acquire, maxRetries: 1,
      earliestAcquisitionAt: observation => observation.cameraId === 'corner' ? cornerEligibleAt : Date.now() });
    await coordinator.observe(event('corner-first', { cameraId: 'corner' })); await coordinator.observe(event('entry-second'));
    await jest.advanceTimersByTimeAsync(60_010);
    expect(acquire.mock.calls.map(([request]) => [request.observation.eventId, request.attempt]))
      .toEqual([['corner-first', 1], ['entry-second', 1]]);
    await jest.advanceTimersByTimeAsync(59_989); expect(acquire).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(acquire.mock.calls.map(([request]) => [request.observation.eventId, request.attempt]))
      .toEqual([['corner-first', 1], ['entry-second', 1], ['corner-first', 2]]);
  });

  it('retains the selected owner during its original lease after restart', async () => {
    const first = setup({ acquire: jest.fn().mockResolvedValue({ status: 'unresolved' }) });
    await first.coordinator.observe(event('not-ready'));
    await first.coordinator.observe(event('ready-uncertain', { occurredAt: Date.now() - 60_000, cameraId: 'corner' }));
    await jest.advanceTimersByTimeAsync(1);
    expect(first.coordinator.snapshot().queue[0].observation.eventId).toBe('ready-uncertain');
    const saved = first.coordinator.snapshot(); await first.coordinator.stop();
    const restored = setup({ restoredState: saved });
    await restored.coordinator.observe(event('ready-third', { occurredAt: Date.now() - 60_000, moduleId: 'module-2' }));
    await jest.advanceTimersByTimeAsync(1000);
    expect(restored.acquire).not.toHaveBeenCalled();
    expect(restored.coordinator.snapshot().operation?.operationId).toBe(saved.operation?.operationId);
  });

  it('expires locally blocked jobs at their age limit while independent ready work proceeds', async () => {
    const { coordinator, acquire, onJobFinished } = setup({ initialDelayMs: 100, maxJobAgeMs: 2000,
      earliestAcquisitionAt: observation => observation.cameraId === 'corner' ? Date.now() + 10_000 : Date.now() });
    await coordinator.observe(event('locally-blocked', { cameraId: 'corner' })); await coordinator.observe(event('ready'));
    await jest.advanceTimersByTimeAsync(2000);
    expect(acquire.mock.calls.map(([request]) => request.observation.eventId)).toEqual(['ready']);
    expect(onJobFinished).toHaveBeenCalledWith(expect.objectContaining({ observation: expect.objectContaining({ eventId: 'locally-blocked' }), outcome: 'expired', attempts: 0 }));
  });

  it('uses a configured retry interval and count after terminal missing outcomes', async () => {
    const acquire = jest.fn().mockResolvedValue({ status: 'missing' });
    const { coordinator, onJobFinished } = setup({ acquire, initialDelayMs: 100, retryIntervalMs: 25, maxRetries: 2 });
    await coordinator.observe(event('missing'));
    await jest.advanceTimersByTimeAsync(100);
    expect(acquire).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(24);
    expect(acquire).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(acquire).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(25);

    expect(acquire).toHaveBeenCalledTimes(3);
    expect(onJobFinished).toHaveBeenCalledWith(expect.objectContaining({ attempts: 3, outcome: 'exhausted' }));
  });

  it('requires matching ownership and a verified terminal result before resuming an unresolved job', async () => {
    const acquire = jest.fn().mockResolvedValueOnce({ status: 'unresolved' }).mockResolvedValue({ status: 'retrieved' });
    const { coordinator } = setup({ acquire });
    await coordinator.observe(event('uncertain'));
    await coordinator.observe(event('later'));
    await jest.advanceTimersByTimeAsync(60_000);
    const operationId = coordinator.snapshot().operation!.operationId;

    expect(await coordinator.resolveOperation({ moduleId: 'module-1', operationId: 'wrong', status: 'verified-terminal', result: { status: 'missing' } })).toBe(false);
    expect(await coordinator.resolveOperation({ moduleId: 'module-2', operationId, status: 'verified-terminal', result: { status: 'missing' } })).toBe(false);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(await coordinator.resolveOperation({ moduleId: 'module-1', operationId, status: 'verified-terminal', result: { status: 'missing' } })).toBe(true);
    await jest.advanceTimersByTimeAsync(4_999);
    expect(acquire).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(11);

    expect(acquire.mock.calls.map(([request]: [NativeRecordingAcquisition]) => [request.observation.eventId, request.attempt]))
      .toEqual([['uncertain', 1], ['later', 1], ['uncertain', 2]]);
  });

  it('treats a thrown acquisition or lost acknowledgement as unresolved rather than missing', async () => {
    const error = new Error('response lost after submission');
    const acquire = jest.fn().mockRejectedValue(error);
    const { coordinator, onError } = setup({ acquire });
    await coordinator.observe(event('uncertain'));
    await jest.advanceTimersByTimeAsync(60_000);
    await coordinator.observe(event('later'));
    await jest.advanceTimersByTimeAsync(1000);

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(coordinator.snapshot().operation?.status).toBe('unresolved');
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('does not dispatch until the active intent and attempt have been durably saved', async () => {
    const write = deferred<void>();
    const saveState = jest.fn<Promise<void>, [NativeRecordingState]>()
      .mockResolvedValueOnce(undefined).mockImplementationOnce(() => write.promise).mockResolvedValue(undefined);
    const { coordinator, acquire } = setup({ saveState });
    await coordinator.observe(event('first'));
    await jest.advanceTimersByTimeAsync(60_000);

    const intent = saveState.mock.calls[1][0];
    expect(intent.queue[0].attempts).toBe(1);
    expect(intent.operation?.status).toBe('active');
    expect(acquire).not.toHaveBeenCalled();
    write.resolve();
    await jest.advanceTimersByTimeAsync(1);

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire.mock.calls[0][0].operationId).toBe(intent.operation?.operationId);
  });

  it('fails closed when the durable intent cannot be saved', async () => {
    const error = new Error('disk unavailable');
    const saveState = jest.fn<Promise<void>, [NativeRecordingState]>().mockResolvedValueOnce(undefined).mockRejectedValue(error);
    const { coordinator, acquire, onError } = setup({ saveState });
    await coordinator.observe(event('first'));
    await jest.advanceTimersByTimeAsync(60_000);
    await expect(coordinator.observe(event('later'))).rejects.toThrow('disk unavailable');
    await jest.advanceTimersByTimeAsync(1_000_000);

    expect(acquire).not.toHaveBeenCalled();
    expect(coordinator.snapshot().operation?.status).toBe('unresolved');
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('restores an active intent as unresolved with the same head and attempt count', async () => {
    const active = deferred<NativeRecordingAcquisitionResult>();
    const first = setup({ acquire: jest.fn().mockReturnValue(active.promise) });
    await first.coordinator.observe(event('submitted'));
    await first.coordinator.observe(event('later'));
    await jest.advanceTimersByTimeAsync(60_000);
    const saved = first.coordinator.snapshot();
    await first.coordinator.stop();
    const restored = setup({ restoredState: saved });
    await jest.advanceTimersByTimeAsync(1000);

    expect(restored.acquire).not.toHaveBeenCalled();
    expect(restored.coordinator.snapshot().operation).toEqual(expect.objectContaining({ operationId: saved.operation!.operationId, status: 'unresolved' }));
    expect(restored.coordinator.snapshot().queue.map(job => [job.observation.eventId, job.attempts])).toEqual([['submitted', 1], ['later', 0]]);
    expect(await restored.coordinator.observe(event('submitted'))).toBe('duplicate');
  });

  it('preserves a terminal-missing retry deadline across restart', async () => {
    const first = setup({ acquire: jest.fn().mockResolvedValue({ status: 'missing' }) });
    await first.coordinator.observe(event('missing'));
    await jest.advanceTimersByTimeAsync(60_000);
    const saved = first.coordinator.snapshot();
    await first.coordinator.stop();
    const restored = setup({ restoredState: saved });

    await jest.advanceTimersByTimeAsync(4_999);
    expect(restored.acquire).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(restored.acquire).toHaveBeenCalledTimes(1);
    expect(restored.acquire.mock.calls[0][0].attempt).toBe(2);
  });

  it('aborts local work on stop without treating a late result as remote completion', async () => {
    const acquisition = deferred<NativeRecordingAcquisitionResult>();
    const acquire = jest.fn().mockReturnValue(acquisition.promise);
    const { coordinator } = setup({ acquire });
    await coordinator.observe(event('first'));
    await coordinator.observe(event('later'));
    await jest.advanceTimersByTimeAsync(60_000);
    const signal = acquire.mock.calls[0][1] as AbortSignal;

    await coordinator.stop();
    expect(signal.aborted).toBe(true);
    acquisition.resolve({ status: 'retrieved' });
    await jest.advanceTimersByTimeAsync(1_000_000);

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(coordinator.snapshot().operation?.status).toBe('unresolved');
    expect(coordinator.snapshot().queue).toHaveLength(2);
    expect(await coordinator.observe(event('after-stop'))).toBe('stopped');
  });

  it('reports queue capacity explicitly without evicting its head', async () => {
    const { coordinator, acquire } = setup({ maxQueuedJobs: 2, maxRememberedEvents: 1 });
    expect(await coordinator.observe(event('head'))).toBe('accepted');
    expect(await coordinator.observe(event('second'))).toBe('accepted');
    expect(await coordinator.observe(event('overflow'))).toBe('capacity');
    expect(await coordinator.observe(event('head'))).toBe('duplicate');

    expect(coordinator.snapshot().queue.map(job => job.observation.eventId)).toEqual(['head', 'second']);
    expect(coordinator.snapshot().rememberedEvents).toHaveLength(1);
    expect(acquire).not.toHaveBeenCalled();
  });

  it('only lets a proven saved clip satisfy related jobs on its own camera and module', async () => {
    const acquire = jest.fn().mockResolvedValueOnce({ status: 'retrieved', satisfiedEventIds: ['related'] })
      .mockResolvedValue({ status: 'unresolved' });
    const { coordinator, onJobFinished } = setup({ acquire });
    await coordinator.observe(event('head'));
    await coordinator.observe(event('related'));
    await coordinator.observe(event('related', { cameraId: 'corner' }));
    await coordinator.observe(event('related', { moduleId: 'module-2' }));
    await jest.advanceTimersByTimeAsync(60_010);

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(onJobFinished.mock.calls.map(([result]) => [result.observation.eventId, result.observation.cameraId, result.outcome]))
      .toEqual([['head', 'entry', 'retrieved'], ['related', 'entry', 'retrieved']]);
    expect(coordinator.snapshot().queue.map(job => [job.observation.cameraId, job.observation.moduleId]))
      .toEqual([['corner', 'module-1'], ['entry', 'module-2']]);
  });

  it('rejects replay-origin or unknown-module observations', async () => {
    const { coordinator, acquire } = setup();
    expect(await coordinator.observe(event('replay', { source: 'replay' as 'provider' }))).toBe('invalid');
    expect(await coordinator.observe(event('unknown', { moduleId: 'unknown' }))).toBe('unknown-module');

    await jest.advanceTimersByTimeAsync(1_000_000);

    expect(acquire).not.toHaveBeenCalled();
  });

  it('reports a terminal skipped job as cancelled, without claiming retrieval or retrying it', async () => {
    const acquire = jest.fn().mockResolvedValueOnce({ status: 'skipped' }).mockResolvedValue({ status: 'retrieved' });
    const { coordinator, onJobFinished } = setup({ acquire });
    await coordinator.observe(event('disabled'));
    await coordinator.observe(event('allowed', { cameraId: 'corner' }));
    await jest.advanceTimersByTimeAsync(60_010);

    expect(acquire.mock.calls.map(([request]: [NativeRecordingAcquisition]) => request.observation.eventId)).toEqual(['disabled', 'allowed']);
    expect(onJobFinished.mock.calls.map(([result]) => [result.observation.eventId, result.outcome]))
      .toEqual([['disabled', 'cancelled'], ['allowed', 'retrieved']]);
  });

  it('cancels only the selected camera queued jobs and never replays them after new jobs are allowed', async () => {
    const { coordinator, acquire, onJobFinished } = setup();
    await coordinator.observe(event('entry-one'));
    await coordinator.observe(event('corner', { cameraId: 'corner' }));
    await coordinator.observe(event('entry-two'));

    expect(await coordinator.cancelCamera('module-1', 'entry')).toBe(2);
    await coordinator.observe(event('entry-after-reenable'));
    await jest.advanceTimersByTimeAsync(60_010);

    expect(acquire.mock.calls.map(([request]) => request.observation.eventId)).toEqual(['corner', 'entry-after-reenable']);
    expect(onJobFinished.mock.calls.filter(([result]) => result.outcome === 'cancelled').map(([result]) => result.observation.eventId))
      .toEqual(['entry-one', 'entry-two']);
  });

  it('aborts a cancelled dispatched job but holds its remote fence until verified terminal reconciliation', async () => {
    const first = deferred<NativeRecordingAcquisitionResult>();
    const acquire = jest.fn().mockImplementationOnce(() => first.promise).mockResolvedValue({ status: 'retrieved' });
    const { coordinator, onJobFinished } = setup({ acquire });
    await coordinator.observe(event('entry-active'));
    await coordinator.observe(event('entry-queued'));
    await coordinator.observe(event('corner', { cameraId: 'corner' }));
    await jest.advanceTimersByTimeAsync(60_000);
    const request = acquire.mock.calls[0][0] as NativeRecordingAcquisition;
    const signal = acquire.mock.calls[0][1] as AbortSignal;

    expect(await coordinator.cancelCamera('module-1', 'entry')).toBe(2);
    expect(signal.aborted).toBe(true);
    expect(coordinator.isCameraGenerationCurrent('module-1', 'entry', request.cameraGeneration)).toBe(false);
    first.resolve({ status: 'unresolved' });
    await jest.advanceTimersByTimeAsync(1000);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(coordinator.snapshot().queue.map(job => [job.observation.eventId, !!job.cancelled])).toEqual([['entry-active', true], ['corner', false]]);

    expect(await coordinator.resolveOperation({ moduleId: 'module-1', operationId: request.operationId,
      status: 'verified-terminal', result: { status: 'skipped' } })).toBe(true);
    await jest.advanceTimersByTimeAsync(10);

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(onJobFinished.mock.calls.map(([result]) => [result.observation.eventId, result.outcome]))
      .toEqual([['entry-active', 'cancelled'], ['entry-queued', 'cancelled'], ['corner', 'retrieved']]);
  });

  it('fences late acquisition results across revoke and reenable without reporting old media as retrieved', async () => {
    const first = deferred<NativeRecordingAcquisitionResult>();
    const acquire = jest.fn().mockImplementationOnce(() => first.promise).mockResolvedValue({ status: 'retrieved' });
    const { coordinator, onJobFinished } = setup({ acquire });
    await coordinator.observe(event('before-revoke'));
    await jest.advanceTimersByTimeAsync(60_000);
    const old = acquire.mock.calls[0][0] as NativeRecordingAcquisition;
    await coordinator.cancelCamera('module-1', 'entry');
    await coordinator.observe(event('after-reenable'));
    expect(coordinator.isCameraGenerationCurrent('module-1', 'entry', old.cameraGeneration)).toBe(false);

    first.resolve({ status: 'retrieved' });
    await jest.advanceTimersByTimeAsync(60_010);

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(onJobFinished.mock.calls.map(([result]) => [result.observation.eventId, result.outcome]))
      .toEqual([['before-revoke', 'cancelled'], ['after-reenable', 'retrieved']]);
  });

  it('does not dispatch a cancelled intent whose durable write was still pending', async () => {
    const write = deferred<void>();
    const saveState = jest.fn<Promise<void>, [NativeRecordingState]>()
      .mockResolvedValueOnce(undefined).mockImplementationOnce(() => write.promise).mockResolvedValue(undefined);
    const { coordinator, acquire, onJobFinished } = setup({ saveState });
    await coordinator.observe(event('not-dispatched'));
    await jest.advanceTimersByTimeAsync(60_000);
    const cancellation = coordinator.cancelCamera('module-1', 'entry');
    write.resolve();
    await cancellation;
    await jest.advanceTimersByTimeAsync(1_000);

    expect(acquire).not.toHaveBeenCalled();
    expect(coordinator.snapshot().queue).toEqual([]);
    expect(coordinator.snapshot().operation).toBeUndefined();
    expect(onJobFinished).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'cancelled' }));
  });

  it('persists cancellation on an uncertain owner across restart and never retries that job', async () => {
    const first = setup({ acquire: jest.fn().mockResolvedValue({ status: 'unresolved' }) });
    await first.coordinator.observe(event('cancelled-owner'));
    await jest.advanceTimersByTimeAsync(60_000);
    await first.coordinator.cancelCamera('module-1', 'entry');
    const saved = first.coordinator.snapshot();
    await first.coordinator.stop();
    const restored = setup({ restoredState: saved });
    await jest.advanceTimersByTimeAsync(1000);

    expect(restored.acquire).not.toHaveBeenCalled();
    expect(restored.coordinator.snapshot().queue[0].cancelled).toBe(true);
    await restored.coordinator.resolveOperation({ moduleId: 'module-1', operationId: saved.operation!.operationId,
      status: 'verified-terminal', result: { status: 'missing' } });
    await jest.advanceTimersByTimeAsync(1_000_000);

    expect(restored.acquire).not.toHaveBeenCalled();
    expect(restored.coordinator.snapshot().queue).toEqual([]);
    expect(restored.onJobFinished).not.toHaveBeenCalled();
  });

  it('rejects an observation captured under a revoked camera generation', async () => {
    const { coordinator, acquire } = setup();
    const beforeRevoke = coordinator.cameraGeneration('module-1', 'entry');
    await coordinator.cancelCamera('module-1', 'entry');

    expect(await coordinator.observe(event('late-callback'), beforeRevoke)).toBe('cancelled');
    expect(await coordinator.observe(event('new-after-reenable'), coordinator.cameraGeneration('module-1', 'entry'))).toBe('accepted');
    await jest.advanceTimersByTimeAsync(60_010);

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire.mock.calls[0][0].observation.eventId).toBe('new-after-reenable');
  });

  it('rejects restored queued work without its persisted camera generation', async () => {
    const { coordinator } = setup();
    await coordinator.observe(event('queued'));
    const saved = coordinator.snapshot();
    delete (saved.queue[0] as Partial<typeof saved.queue[number]>).cameraGeneration;

    expect(() => setup({ restoredState: saved })).toThrow('Invalid native recording job');
  });

  it('serializes durable writes for simultaneously delivered events', async () => {
    const write = deferred<void>();
    const saveState = jest.fn<Promise<void>, [NativeRecordingState]>()
      .mockImplementationOnce(() => write.promise).mockResolvedValue(undefined);
    const { coordinator, acquire } = setup({ saveState });
    const first = coordinator.observe(event('first'));
    const second = coordinator.observe(event('second'));
    await jest.advanceTimersByTimeAsync(100_000);

    expect(saveState).toHaveBeenCalledTimes(1);
    expect(acquire).not.toHaveBeenCalled();
    write.resolve();
    await Promise.all([first, second]);
    await jest.advanceTimersByTimeAsync(10);

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(saveState.mock.calls[1][0].queue.map(job => job.observation.eventId)).toEqual(['first', 'second']);
  });
});
