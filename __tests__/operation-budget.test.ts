import { budgetedDelay, checkRequestBudget, OperationTimeoutError, withinRequestBudget, withResponseBudget } from '../src/operation-budget';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('operation budgets', () => {
  it.each(['resolve', 'reject'] as const)('settles at 12 seconds and consumes a late %s without replaying work', async (completion) => {
    jest.useFakeTimers();
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const work = deferred<string>();
      const bounded = withResponseBudget(work.promise);
      const failure = expect(bounded).rejects.toBeInstanceOf(OperationTimeoutError);
      await jest.advanceTimersByTimeAsync(11_999);
      let settled = false;
      void bounded.then(() => { settled = true; }, () => { settled = true; });
      await Promise.resolve();
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await failure;
      if (completion === 'resolve') work.resolve('late result');
      else work.reject(new Error('late failure'));
      await jest.advanceTimersByTimeAsync(0);
      expect(unhandled).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      process.removeListener('unhandledRejection', unhandled);
      jest.useRealTimers();
    }
  });

  it('returns early success and clears its response timer', async () => {
    jest.useFakeTimers();
    try {
      await expect(withResponseBudget(Promise.resolve('result'))).resolves.toBe('result');
      await Promise.resolve();
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });

  it('rejects an already aborted request with its original abort reason as cause', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    controller.abort(reason);
    await expect(withinRequestBudget(Promise.resolve('unused'), { signal: controller.signal })).rejects.toMatchObject({ cause: reason });
  });

  it('observes abort during pending work and removes its listener', async () => {
    jest.useFakeTimers();
    try {
      const work = deferred<string>();
      const controller = new AbortController();
      const remove = jest.spyOn(controller.signal, 'removeEventListener');
      const reason = new Error('cancelled');
      const bounded = withinRequestBudget(work.promise, { signal: controller.signal, deadline: Date.now() + 5_000 });
      const failure = expect(bounded).rejects.toMatchObject({ cause: reason });
      controller.abort(reason);
      await failure;
      work.reject(new Error('late transport failure'));
      await jest.advanceTimersByTimeAsync(0);
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });

  it.each((['check', 'already-aborted', 'pending'] as const).flatMap(phase =>
    (['error', 'timeout', 'frozen', 'dom-exception', 'refusal'] as const).map(kind => [phase, kind] as const)))
  ('removes inherited request proof from a %s budget abort carrying %s', async (phase, kind) => {
    const controller = new AbortController();
    class ProviderRefusal extends Error { readonly status = 409; readonly method = 'POST'; }
    const reason = kind === 'refusal' ? new ProviderRefusal('cancelled') : kind === 'timeout' ? Object.assign(new OperationTimeoutError(), { dispatched: false })
      : kind === 'dom-exception' ? Object.assign(new DOMException('cancelled', 'AbortError'), { dispatched: false })
        : Object.assign(new Error('cancelled'), { dispatched: kind === 'frozen' ? true : false });
    if (kind === 'frozen') Object.freeze(reason);
    const work = deferred<string>();
    const pending = phase === 'pending' ? withinRequestBudget(work.promise, { signal: controller.signal }).catch(error => error) : undefined;
    controller.abort(reason);
    let failure: unknown;
    if (phase === 'check') {
      try { checkRequestBudget({ signal: controller.signal }); } catch (error) { failure = error; }
    } else failure = await (pending ?? withinRequestBudget(work.promise, { signal: controller.signal }).catch(error => error));
    expect(failure).not.toBe(reason);
    expect(failure).toBeInstanceOf(kind === 'timeout' ? OperationTimeoutError : kind === 'dom-exception' ? DOMException : Error);
    expect(failure).toMatchObject({ name: reason.name, message: reason.message, cause: reason });
    expect((failure as Error & { dispatched?: boolean }).dispatched).toBeUndefined();
    expect((failure as Error & { status?: number; method?: string }).status).toBeUndefined();
    expect((failure as Error & { status?: number; method?: string }).method).toBeUndefined();
    if (kind === 'refusal') expect(failure).not.toBeInstanceOf(ProviderRefusal);
    expect((reason as Error & { dispatched?: boolean }).dispatched).toBe(kind === 'refusal' ? undefined : kind === 'frozen' ? true : false);
    work.resolve('late');
  });

  it('uses remaining absolute deadline instead of a fresh response window', async () => {
    jest.useFakeTimers();
    try {
      const work = deferred<string>();
      const failure = expect(withinRequestBudget(work.promise, { deadline: Date.now() + 200 })).rejects
        .toBeInstanceOf(OperationTimeoutError);
      await jest.advanceTimersByTimeAsync(200);
      await failure;
      work.resolve('late');
      await jest.advanceTimersByTimeAsync(0);
    } finally { jest.useRealTimers(); }
  });

  it('rejects a delay that would exhaust its deadline without waiting', async () => {
    jest.useFakeTimers();
    try {
      await expect(budgetedDelay(500, { deadline: Date.now() + 500 })).rejects.toBeInstanceOf(OperationTimeoutError);
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });

  it('clears the underlying delay timer on cancellation', async () => {
    jest.useFakeTimers();
    try {
      const controller = new AbortController();
      const delay = budgetedDelay(60_000, { signal: controller.signal });
      const rejected = expect(delay).rejects.toThrow('cancelled');
      controller.abort(new Error('cancelled'));
      await rejected;
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });

  it('completes a delay that fits within the deadline', async () => {
    jest.useFakeTimers();
    try {
      const delay = budgetedDelay(100, { deadline: Date.now() + 500 });
      await jest.advanceTimersByTimeAsync(100);
      await expect(delay).resolves.toBeUndefined();
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });
});
