import { recordSecurityBoundaryEvent } from './network-diagnostics';
import { Buffer } from 'node:buffer';
import { RequestOptions, OperationTimeoutError, checkRequestBudget } from '../operation-budget';

export type ResponseBodyKind = 'oauth-json' | 'oauth-html' | 'rest' | 'command' | 'thumbnail';
export const RESPONSE_BODY_LIMITS: Record<ResponseBodyKind, number> = {
  'oauth-json': 64 * 1024, 'oauth-html': 512 * 1024,
  rest: 2 * 1024 * 1024, command: 256 * 1024, thumbnail: 5 * 1024 * 1024,
};
export class ResponseBodyError extends Error {
  constructor() { super('Blink response exceeded its resource boundary.'); this.name = 'ResponseBodyError'; recordSecurityBoundaryEvent('overflow'); }
}
let active = 0;
let ordinary = 0;

/** Eight readers total; reserve two admissions for authentication recovery. */
export async function readBoundedBody(response: globalThis.Response, options: RequestOptions & { kind: ResponseBodyKind }): Promise<Buffer> {
  const authentication = options.kind.startsWith('oauth-');
  const limit = RESPONSE_BODY_LIMITS[options.kind];
  const cancelBody = () => { void response.body?.cancel().catch(() => undefined); };
  try { checkRequestBudget(options); } catch (error) { cancelBody(); throw error; }
  const length = response.headers.get('content-length');
  if ((length !== null && /^\d+$/.test(length) && Number(length) > limit)
    || active >= 8 || (!authentication && ordinary >= 6)) {
    cancelBody(); throw new ResponseBodyError();
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  active++; if (!authentication) ordinary++;
  const deadline = Math.min(options.deadline ?? Infinity, Date.now() + 30_000);
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  let stopped = false;
  const stop = () => { stopped = true; void reader.cancel().catch(() => undefined); };
  const interrupted = new Promise<never>((_resolve, reject) => {
    const fail = () => { stop(); reject(new OperationTimeoutError()); };
    timer = globalThis.setTimeout(fail, Math.max(0, deadline - Date.now()));
    abortListener = fail;
    options.signal?.addEventListener('abort', fail, { once: true });
  });
  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    while (true) {
      checkRequestBudget(options);
      const part = await Promise.race([reader.read(), interrupted]);
      if (stopped) throw new OperationTimeoutError();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit) throw new ResponseBodyError();
      chunks.push(Buffer.from(part.value));
    }
    checkRequestBudget(options);
    return Buffer.concat(chunks, bytes);
  } catch (error) { stop(); throw error; }
  finally {
    globalThis.clearTimeout(timer);
    if (abortListener) options.signal?.removeEventListener('abort', abortListener);
    reader.releaseLock();
    active--; if (!authentication) ordinary--;
  }
}

export async function readBoundedJson(response: globalThis.Response, options: RequestOptions & { kind: ResponseBodyKind }): Promise<unknown> {
  const body = await readBoundedBody(response, options);
  const value: unknown = JSON.parse(body.toString('utf8'));
  validateJsonStructure(value);
  return value;
}

/** Bound traversals before diagnostics or domain expansion consume parsed JSON. */
export function validateJsonStructure(value: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++count > 20_000 || entry.depth > 32) throw new ResponseBodyError();
    if (entry.value && typeof entry.value === 'object') {
      const children = Object.values(entry.value);
      if (children.length + pending.length + count > 20_000) throw new ResponseBodyError();
      for (const child of children) pending.push({ value: child, depth: entry.depth + 1 });
    }
  }
}
