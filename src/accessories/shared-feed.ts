import { Buffer } from 'node:buffer';
import { withinRequestBudget } from '../operation-budget';

export interface FeedSink {
  write(bytes: Buffer): Promise<void>;
  end(): Promise<void>;
  fail(): void;
}
export interface FeedHandle {
  readonly whenClosed: Promise<void>;
  stop(): Promise<void>;
}
export type FeedSubscription = FeedHandle;
export type StartFeed = (sink: FeedSink, signal: globalThis.AbortSignal) => Promise<FeedHandle>;
export const SHARED_FEED_LIMITS = Object.freeze({ frameBytes: 1024 * 1024, consumers: 5, stallMs: 2000 });

interface Consumer {
  sink: FeedSink;
  signal: globalThis.AbortSignal;
  abort: () => void;
  finish: () => void;
  whenClosed: Promise<void>;
  closing?: Promise<void>;
}
interface Generation {
  abort: globalThis.AbortController;
  consumers: Set<Consumer>;
  starting: Promise<void>;
  handle?: FeedHandle;
  closing?: Promise<void>;
  failed: boolean;
}

/** One vendor capability, bounded fan-out, independently owned subscribers. */
export class SharedCameraFeed {
  private generation?: Generation;
  private retired: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(private readonly startFeed: StartFeed) {}

  async subscribe(sink: FeedSink, signal: globalThis.AbortSignal): Promise<FeedSubscription> {
    signal.throwIfAborted();
    if (this.disposed) throw new Error('Camera feed unavailable');
    const budget = { signal, deadline: Date.now() + 5000 };
    for (;;) {
      const retiring = this.retired;
      await withinRequestBudget(retiring, budget);
      signal.throwIfAborted();
      // A last-consumer STOP may replace the barrier while this caller yields.
      // Acquire only after the current generation's actual closure is observed.
      if (retiring === this.retired) break;
    }
    signal.throwIfAborted();
    if (this.disposed) throw new Error('Camera feed unavailable');
    let generation = this.generation;
    if (!generation || generation.abort.signal.aborted) {
      generation = { abort: new globalThis.AbortController(), consumers: new Set(), starting: Promise.resolve(), failed: false };
      this.generation = generation;
    }
    const current = generation;
    if (current.consumers.size >= SHARED_FEED_LIMITS.consumers) throw new Error('Camera feed consumer limit reached');
    let finish!: () => void;
    const whenClosed = new Promise<void>(resolve => { finish = resolve; });
    const consumer: Consumer = { sink, signal, whenClosed, finish, abort: () => { void this.remove(current, consumer); } };
    current.consumers.add(consumer);
    signal.addEventListener('abort', consumer.abort, { once: true });
    if (current.consumers.size === 1 && !current.handle) {
      current.starting = this.start(current);
      current.starting.catch(() => undefined);
    }
    try {
      await withinRequestBudget(current.starting, { signal, deadline: Date.now() + 25000 });
      signal.throwIfAborted();
      if (current.failed || current.abort.signal.aborted || !current.consumers.has(consumer)) throw new Error('Camera feed unavailable');
      return { whenClosed, stop: () => this.remove(current, consumer) };
    } catch {
      // Subscriber cancellation must not wait for a late vendor allocation.
      // The generation retirement barrier still owns that late capability.
      void this.remove(current, consumer);
      throw new Error('Camera feed unavailable');
    }
  }

  private async start(generation: Generation): Promise<void> {
    const sink: FeedSink = {
      write: bytes => this.dispatch(generation, bytes),
      end: async () => {
        await Promise.all([...generation.consumers].map(async consumer => {
          try { await withinRequestBudget(consumer.sink.end(), { signal: consumer.signal, deadline: Date.now() + SHARED_FEED_LIMITS.stallMs }); }
          catch { if (generation.consumers.has(consumer)) this.failConsumer(generation, consumer); }
        }));
      },
      fail: () => this.fail(generation),
    };
    try {
      const handle = await this.startFeed(sink, generation.abort.signal);
      generation.handle = handle;
      if (generation.abort.signal.aborted) { return; }
      void handle.whenClosed.then(() => { if (!generation.abort.signal.aborted) this.fail(generation); });
    } catch {
      this.fail(generation);
      throw new Error('Camera feed unavailable');
    }
  }

  private async dispatch(generation: Generation, bytes: Buffer): Promise<void> {
    if (generation.abort.signal.aborted || !bytes.length || bytes.length > SHARED_FEED_LIMITS.frameBytes) throw new Error('Camera feed unavailable');
    // Transports serialize writes. Each private worker owns its admitted copy.
    // A stalled subscriber is explicitly failed; other subscribers keep their data.
    await Promise.all([...generation.consumers].map(async consumer => {
      try {
        await withinRequestBudget(consumer.sink.write(bytes), { signal: consumer.signal, deadline: Date.now() + SHARED_FEED_LIMITS.stallMs });
      } catch { if (generation.consumers.has(consumer)) this.failConsumer(generation, consumer); }
    }));
    if (!generation.consumers.size || generation.abort.signal.aborted) throw new Error('Camera feed unavailable');
  }

  private failConsumer(generation: Generation, consumer: Consumer): void {
    try { consumer.sink.fail(); } catch { /* Observer failures cannot prevent retirement. */ }
    void this.remove(generation, consumer);
  }

  private fail(generation: Generation): void {
    if (generation.failed || generation.abort.signal.aborted) return;
    generation.failed = true;
    for (const consumer of [...generation.consumers]) this.failConsumer(generation, consumer);
    void this.close(generation);
  }

  private remove(generation: Generation, consumer: Consumer): Promise<void> {
    if (consumer.closing) return consumer.closing;
    generation.consumers.delete(consumer);
    consumer.signal.removeEventListener('abort', consumer.abort);
    consumer.closing = (generation.consumers.size ? Promise.resolve() : this.close(generation)).finally(consumer.finish);
    return consumer.closing;
  }

  private close(generation: Generation): Promise<void> {
    if (generation.closing) return generation.closing;
    generation.abort.abort();
    generation.closing = (async () => {
      await generation.starting.catch(() => undefined);
      if (generation.handle) {
        // A stop request is not proof of closure. Rejection or a stalled stop
        // must never allow another owner to acquire a vendor capability.
        void Promise.resolve().then(() => generation.handle!.stop()).catch(() => undefined);
        await generation.handle.whenClosed;
      }
      if (this.generation === generation) this.generation = undefined;
    })();
    this.retired = generation.closing.catch(() => undefined);
    return generation.closing;
  }

  /** Permanently retire this camera owner (removal / platform shutdown). */
  async stop(): Promise<void> {
    this.disposed = true;
    const generation = this.generation;
    if (generation) {
      for (const consumer of [...generation.consumers]) this.failConsumer(generation, consumer);
      await this.close(generation);
    }
    await this.retired;
  }
}
