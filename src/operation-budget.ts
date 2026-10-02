export interface RequestOptions {
  deadline?: number;
  signal?: globalThis.AbortSignal;
  queueDeadline?: number;
}

export class OperationTimeoutError extends Error {
  constructor() {
    super('Blink operation exceeded its response deadline.');
    this.name = 'OperationTimeoutError';
  }
}

/** Limit the caller's wait without replaying or cancelling shared remote work. */
export function withResponseBudget<T>(promise: Promise<T>, ms = 12_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new OperationTimeoutError()), Math.max(0, ms));
    promise.then(resolve, reject).finally(() => globalThis.clearTimeout(timer));
  });
}

export function checkRequestBudget(options: RequestOptions = {}): void {
  options.signal?.throwIfAborted();
  if (options.deadline !== undefined && options.deadline <= Date.now()) throw new OperationTimeoutError();
}

export async function withinRequestBudget<T>(promise: Promise<T>, options: RequestOptions = {}): Promise<T> {
  // Observe a supplied operation even if its budget expired before attachment.
  promise.catch(() => undefined);
  checkRequestBudget(options);
  let abortListener: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    if (options.signal) {
      abortListener = () => reject(options.signal?.reason ?? new OperationTimeoutError());
      options.signal.addEventListener('abort', abortListener, { once: true });
    }
  });
  try {
    const work = options.signal ? Promise.race([promise, aborted]) : promise;
    return options.deadline === undefined ? await work : await withResponseBudget(work, options.deadline - Date.now());
  } finally {
    if (abortListener) options.signal?.removeEventListener('abort', abortListener);
  }
}

export async function budgetedDelay(ms: number, options: RequestOptions = {}): Promise<void> {
  checkRequestBudget(options);
  if (options.deadline !== undefined && Date.now() + ms >= options.deadline) throw new OperationTimeoutError();
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    await withinRequestBudget(new Promise<void>(resolve => { timer = globalThis.setTimeout(resolve, ms); }), options);
    checkRequestBudget(options);
  } finally {
    if (timer) globalThis.clearTimeout(timer);
  }
}
