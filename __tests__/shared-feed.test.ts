import { Buffer } from 'node:buffer';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { withinRequestBudget } from '../src/operation-budget';
import { createExternalLiveCodec } from '../src/accessories/external-live-codec';
import { resolveExternalFfmpegPath, type ExternalFfmpegProcessOptions } from '../src/accessories/external-ffmpeg';
import type { CodecPacket } from '../src/accessories/ffmpeg-packets';
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

const ffmpeg = (() => { try { return resolveExternalFfmpegPath(process.env.BLINK_FFMPEG_TEST_PATH ?? (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg')); } catch { return undefined; } })();

(ffmpeg ? it : it.skip)('recovers a second real codec joining between keyframes without interrupting the first subscriber', async () => {
  const bytes = execFileSync(ffmpeg!, ['-hide_banner', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=16x16:rate=10:duration=10',
    '-f', 'lavfi', '-i', 'sine=sample_rate=16000:duration=10', '-c:v', 'libx264', '-preset', 'ultrafast', '-bf', '0', '-g', '20',
    '-x264-params', 'scenecut=0:repeat-headers=1:annexb=1', '-c:a', 'aac', '-mpegts_flags', 'pat_pmt_at_frames', '-muxdelay', '0', '-f', 'mpegts', 'pipe:1'],
  { timeout: 5000, maxBuffer: 1024 * 1024 });
  const starts = [0]; let table = 0, pictures = 0;
  for (let at = 0; at < bytes.length; at += 188) {
    expect(bytes[at]).toBe(0x47);
    const pid = ((bytes[at + 1] & 31) << 8) | bytes[at + 2];
    if (pid === 0) table = at;
    if (pid === 256 && (bytes[at + 1] & 64)) { if (pictures++) starts.push(table); }
  }
  starts.push(bytes.length); expect(pictures).toBe(100);
  const frames = starts.slice(0, -1).map((at, index) => bytes.subarray(at, starts[index + 1]));
  // Join on picture 62 without SPS/PPS/IDR; the next bootstrap is picture 80.
  const nal = [...frames[62].toString('latin1').matchAll(/\x00\x00(?:\x00)?\x01([\s\S])/g)].map(value => value[1].charCodeAt(0) & 31);
  expect(nal).toContain(1); expect(nal).not.toContain(5); expect(nal).not.toContain(7); expect(nal).not.toContain(8);
  const f = fixture(), packets: CodecPacket[][] = [[], []], failures = [jest.fn(), jest.fn()];
  const launch: ExternalFfmpegProcessOptions['launch'] = (_command, args, options) => spawn(args[1], args.slice(2), options);
  let firstPacket!: () => void;
  const firstOutput = new Promise<void>(resolve => { firstPacket = resolve; });
  const codecs = await Promise.all(packets.map(async (output, index) => createExternalLiveCodec({ ffmpegPath: ffmpeg!, protectionPath: process.execPath,
    video: { width: 16, height: 16, fps: 10, bitrate: 100000, maxFrames: 120, profile: 0, level: 0 },
    audio: { codec: 'opus', rate: 16000, bitrate: 24000, mtu: 1200, packetTime: 20 } },
  { packet: async packet => { output.push({ ...packet, data: Buffer.from(packet.data) }); if (!index && packet.stream === 1) firstPacket(); } }, new AbortController().signal,
  { launch, probe: async () => ({ version: 'test' }) })));
  const sinks = codecs.map((codec, index) => ({ write: (input: Buffer) => codec.write(input), end: () => codec.end(), fail: failures[index] }));
  try {
    await f.feed.subscribe(sinks[0], new AbortController().signal);
    for (const frame of frames.slice(0, 62)) await f.input().write(frame);
    await withinRequestBudget(firstOutput, { deadline: Date.now() + 2000 });
    const beforeJoin = packets[0].filter(packet => packet.stream === 1).length; expect(beforeJoin).toBeGreaterThan(0);
    await f.feed.subscribe(sinks[1], new AbortController().signal);
    for (const frame of frames.slice(62)) await f.input().write(frame);
    await f.input().end();
    expect(f.start).toHaveBeenCalledTimes(1); expect(f.handle.stop).not.toHaveBeenCalled();
    expect(failures.map(failed => failed.mock.calls.length)).toEqual([0, 0]);
    expect(codecs.map(codec => codec.failed)).toEqual([false, false]);
    expect(packets[0].filter(packet => packet.stream === 1)).toHaveLength(100);
    expect(packets[1].filter(packet => packet.stream === 1)).toHaveLength(20);
    const firstVideo = packets[0].filter(packet => packet.stream === 1);
    for (let index = 1; index < firstVideo.length; index++) expect(firstVideo[index].pts - firstVideo[index - 1].pts).toBe(100000n);
    for (const output of packets) {
      const video = output.filter(packet => packet.stream === 1), audio = output.filter(packet => packet.stream === 2);
      expect(audio.length).toBeGreaterThan(1); expect(audio.every(packet => packet.data.length > 0 && packet.data.length + 22 <= 1200)).toBe(true);
      const pixels = execFileSync(ffmpeg!, ['-hide_banner', '-nostdin', '-v', 'error', '-f', 'h264', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
        { input: Buffer.concat(video.map(packet => packet.data)), timeout: 5000, maxBuffer: 1024 * 1024 });
      expect(pixels).toHaveLength(video.length * 16 * 16 * 3);
    }
  } finally { await Promise.all(codecs.map(codec => codec.stop())); await f.feed.stop(); bytes.fill(0); for (const output of packets) for (const packet of output) packet.data.fill(0); }
}, 15000);

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
