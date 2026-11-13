export interface RequestOptions {
  deadline?: number;
  signal?: globalThis.AbortSignal;
  queueDeadline?: number;
}

/** Local availability limit, never evidence that a provider operation completed. */
export const REMOTE_OPERATION_LEASE_MS = 120_000;

/** Legacy owners without a deadline cannot veto fresh work indefinitely. */
export function isRemoteOperationLeaseActive(expiresAt: number | undefined, now = Date.now()): boolean {
  return expiresAt !== undefined && Number.isSafeInteger(expiresAt) && expiresAt > now
    && expiresAt <= now + REMOTE_OPERATION_LEASE_MS;
}

export class OperationTimeoutError extends Error {
  constructor() {
    super('Blink operation exceeded its response deadline.');
    this.name = 'OperationTimeoutError';
  }
}

/** A caller's abort reason carries no dispatch or provider-refusal proof for this operation. */
function budgetAbortReason(signal: globalThis.AbortSignal): unknown {
  const reason = signal.reason ?? new OperationTimeoutError();
  if (!(reason instanceof Error) && !(reason instanceof globalThis.DOMException)) return reason;
  const local = reason instanceof OperationTimeoutError ? new OperationTimeoutError()
    : reason instanceof globalThis.DOMException ? new globalThis.DOMException(reason.message, reason.name)
      : new Error(reason.message);
  Object.defineProperties(local, {
    name: { value: reason.name, configurable: true },
    cause: { value: reason, configurable: true },
  });
  return local;
}

/** Limit the caller's wait without replaying or cancelling shared remote work. */
export function withResponseBudget<T>(promise: Promise<T>, ms = 12_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new OperationTimeoutError()), Math.max(0, ms));
    promise.then(resolve, reject).finally(() => globalThis.clearTimeout(timer));
  });
}

export function checkRequestBudget(options: RequestOptions = {}): void {
  if (options.signal?.aborted) throw budgetAbortReason(options.signal);
  if (options.deadline !== undefined && options.deadline <= Date.now()) throw new OperationTimeoutError();
}

export async function withinRequestBudget<T>(promise: Promise<T>, options: RequestOptions = {}): Promise<T> {
  // Observe a supplied operation even if its budget expired before attachment.
  promise.catch(() => undefined);
  checkRequestBudget(options);
  let abortListener: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    if (options.signal) {
      abortListener = () => reject(budgetAbortReason(options.signal!));
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
