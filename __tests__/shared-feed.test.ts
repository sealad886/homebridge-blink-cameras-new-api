import { Buffer } from 'node:buffer';
import { SharedCameraFeed, SHARED_FEED_LIMITS, type FeedHandle, type FeedSink } from '../src/accessories/shared-feed';

const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const sink = (): FeedSink => ({ write: jest.fn(async () => {}), end: jest.fn(async () => {}), fail: jest.fn() });
function fixture() {
  let input!: FeedSink;
  let close!: () => void;
  const handle: FeedHandle = { whenClosed: new Promise<void>(resolve => { close = resolve; }), stop: jest.fn(async () => close()) };
  const start = jest.fn(async (next: FeedSink) => { input = next; return handle; });
  return { feed: new SharedCameraFeed(start), start, handle, input: () => input, close: () => close() };
}
afterEach(() => jest.useRealTimers());

it('shares one vendor feed and delivers every admitted byte to independently owned subscribers', async () => {
  const f = fixture(), a = sink(), b = sink();
  const [first, second] = await Promise.all([f.feed.subscribe(a, new AbortController().signal), f.feed.subscribe(b, new AbortController().signal)]);
  expect(f.start).toHaveBeenCalledTimes(1);
  const bytes = Buffer.from('media'); await f.input().write(bytes);
  expect(a.write).toHaveBeenCalledWith(bytes); expect(b.write).toHaveBeenCalledWith(bytes);
  await first.stop(); expect(f.handle.stop).not.toHaveBeenCalled();
  await f.input().write(bytes); expect(a.write).toHaveBeenCalledTimes(1); expect(b.write).toHaveBeenCalledTimes(2);
  await second.stop(); await second.whenClosed; expect(f.handle.stop).toHaveBeenCalledTimes(1);
});

it('explicitly fails a stalled subscriber while preserving the other consumer', async () => {
  jest.useFakeTimers();
  const f = fixture(), slow = sink(), fast = sink();
  slow.write = jest.fn(() => new Promise<void>(() => {}));
  const first = await f.feed.subscribe(slow, new AbortController().signal);
  const second = await f.feed.subscribe(fast, new AbortController().signal);
  const write = f.input().write(Buffer.from('first'));
  await jest.advanceTimersByTimeAsync(SHARED_FEED_LIMITS.stallMs + 1); await write; await first.whenClosed;
  expect(slow.fail).toHaveBeenCalledTimes(1); expect(f.handle.stop).not.toHaveBeenCalled();
  await f.input().write(Buffer.from('second')); expect(fast.write).toHaveBeenCalledTimes(2);
  await second.stop();
});

it('retires a late allocation before admitting the next source generation', async () => {
  let adopt!: (handle: FeedHandle) => void, close!: () => void;
  const old: FeedHandle = { whenClosed: new Promise<void>(resolve => { close = resolve; }), stop: jest.fn(async () => close()) };
  let closeNext!: () => void;
  const fresh: FeedHandle = { whenClosed: new Promise<void>(resolve => { closeNext = resolve; }), stop: jest.fn(async () => closeNext()) };
  const start = jest.fn<Promise<FeedHandle>, [FeedSink, AbortSignal]>()
    .mockImplementationOnce(() => new Promise(resolve => { adopt = resolve; }))
    .mockResolvedValue(fresh);
  const feed = new SharedCameraFeed(start), abort = new AbortController();
  const cancelled = feed.subscribe(sink(), abort.signal).catch(error => error);
  await flush(); abort.abort(); expect(await cancelled).toBeInstanceOf(Error);
  const next = feed.subscribe(sink(), new AbortController().signal); await flush();
  expect(start).toHaveBeenCalledTimes(1);
  adopt(old); const subscriber = await next;
  expect(old.stop).toHaveBeenCalled(); expect(start).toHaveBeenCalledTimes(2);
  await subscriber.stop();
});

it('fails all subscribers on source loss and forbids admission after camera removal', async () => {
  const f = fixture(), a = sink(), b = sink();
  const first = await f.feed.subscribe(a, new AbortController().signal);
  const second = await f.feed.subscribe(b, new AbortController().signal);
  f.close(); await Promise.all([first.whenClosed, second.whenClosed]);
  expect(a.fail).toHaveBeenCalledTimes(1); expect(b.fail).toHaveBeenCalledTimes(1);
  await f.feed.stop(); await expect(f.feed.subscribe(sink(), new AbortController().signal)).rejects.toThrow();
});

it('holds ownership after a rejected stop until the transport confirms closure', async () => {
  let close!: () => void, closeNext!: () => void;
  const old: FeedHandle = { whenClosed: new Promise<void>(resolve => { close = resolve; }), stop: jest.fn(async () => { throw new Error('stop refused'); }) };
  const fresh: FeedHandle = { whenClosed: new Promise<void>(resolve => { closeNext = resolve; }), stop: jest.fn(async () => closeNext()) };
  const start = jest.fn().mockResolvedValueOnce(old).mockResolvedValue(fresh);
  const feed = new SharedCameraFeed(start);
  const first = await feed.subscribe(sink(), new AbortController().signal);
  const stopping = first.stop(); await flush();
  const replacement = feed.subscribe(sink(), new AbortController().signal); await flush();
  expect(start).toHaveBeenCalledTimes(1);
  close(); await stopping; const second = await replacement; expect(start).toHaveBeenCalledTimes(2);
  await second.stop();
});

it('rechecks retirement when the last consumer stops during replacement admission', async () => {
  let close!: () => void, closeNext!: () => void;
  const old: FeedHandle = { whenClosed: new Promise<void>(resolve => { close = resolve; }), stop: jest.fn(async () => {}) };
  const fresh: FeedHandle = { whenClosed: new Promise<void>(resolve => { closeNext = resolve; }), stop: jest.fn(async () => closeNext()) };
  const start = jest.fn().mockResolvedValueOnce(old).mockResolvedValue(fresh);
  const feed = new SharedCameraFeed(start);
  const first = await feed.subscribe(sink(), new AbortController().signal);
  const replacement = feed.subscribe(sink(), new AbortController().signal);
  const stopping = first.stop();
  try {
    await flush(); expect(start).toHaveBeenCalledTimes(1);
  } finally { close(); }
  await stopping;
  const second = await replacement; expect(start).toHaveBeenCalledTimes(2);
  await second.stop();
});

it('bounds consumers and rejects oversized frames without silently discarding bytes', async () => {
  const f = fixture();
  const consumers = await Promise.all(Array.from({ length: SHARED_FEED_LIMITS.consumers }, () => f.feed.subscribe(sink(), new AbortController().signal)));
  await expect(f.feed.subscribe(sink(), new AbortController().signal)).rejects.toThrow();
  await expect(f.input().write(Buffer.alloc(SHARED_FEED_LIMITS.frameBytes + 1))).rejects.toThrow();
  await Promise.all(consumers.map(consumer => consumer.stop()));
});
