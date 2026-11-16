import { Buffer } from 'node:buffer';
import type { MediaOutputOptions } from '../src/accessories/media-output';
import type { CodecPacket } from '../src/accessories/ffmpeg-packets';
import type { ExternalLiveCodecCallbacks, ExternalLiveCodecOptions } from '../src/accessories/external-live-codec';
import { createOwnedMediaSession } from '../src/accessories/media-session';

function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
const output = (ssrc = 7): MediaOutputOptions => ({ address: '192.168.1.5', addressVersion: 'ipv4', port: 5000 + ssrc,
  suite: 'AES_CM_128_HMAC_SHA1_80', key: Buffer.alloc(16, 1), salt: Buffer.alloc(14, 2), ssrc, payloadType: ssrc === 7 ? 99 : 110,
  mtu: 1200, fps: 15, rtcpInterval: 0.1 });
function options() { return { ffmpegPath: '/external/ffmpeg', protectionPath: '/verified/protection', video: { output: output(), localPort: 6000,
  width: 640, height: 360, bitrate: 100000, maxFrames: 100, profile: 0 as const, level: 0 as const } }; }
function fixture() {
  const closed = deferred(), protectionClosed = deferred(); let callbacks!: ExternalLiveCodecCallbacks;
  const plain: Array<{ stream: number; type: 'rtp' | 'rtcp'; bytes: Buffer }> = [];
  const worker = {
    failed: false, whenClosed: closed.promise,
    initialize: jest.fn(async (stream: 1 | 2, ssrc: number, key: Buffer, salt: Buffer) => { void ssrc; void key; void salt; return {
      protectRtp: async (bytes: Buffer) => { plain.push({ stream, type: 'rtp', bytes: Buffer.from(bytes) }); return Buffer.concat([bytes, Buffer.alloc(10)]); },
      protectRtcp: async (bytes: Buffer) => { plain.push({ stream, type: 'rtcp', bytes: Buffer.from(bytes) }); return Buffer.concat([bytes, Buffer.alloc(14)]); },
      close: jest.fn(),
    }; }),
    media: jest.fn(async (bytes: Buffer) => { void bytes; }),
    finishInput: jest.fn(async () => { closed.resolve(); }), stop: jest.fn(async () => { closed.resolve(); }),
  };
  const sockets: Array<{ whenClosed: Promise<void>; close: jest.Mock; send: jest.Mock }> = [];
  const socketClosures: ReturnType<typeof deferred>[] = [];
  const createProtection = jest.fn(() => ({ initialize: worker.initialize, whenClosed: protectionClosed.promise,
    get failed() { return worker.failed; }, stop: async () => { await worker.stop(); protectionClosed.resolve(); } }));
  const createCodec = jest.fn(async (_options: ExternalLiveCodecOptions, value: ExternalLiveCodecCallbacks) => {
    callbacks = value; return { whenClosed: worker.whenClosed, get failed() { return worker.failed; }, write: worker.media,
      end: worker.finishInput, stop: worker.stop };
  });
  const openSocket = jest.fn(async () => {
    const closure = deferred(); const socket = { whenClosed: closure.promise, close: jest.fn(() => { closure.resolve(); }), send: jest.fn(async () => {}) };
    sockets.push(socket); socketClosures.push(closure); return socket;
  });
  return { worker, plain, sockets, socketClosures, callbacks: () => callbacks, dependencies: { createProtection, createCodec, openSocket }, closed };
}
const packet = (stream: 1 | 2, pts: bigint, data: Buffer): CodecPacket => ({ stream, pts, dts: pts, duration: 20000n,
  keyframe: stream === 1, data });
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('owns configured worker and numeric output before chunking one admitted vendor frame', async () => {
  const f = fixture(); const owner = new globalThis.AbortController(); const session = await createOwnedMediaSession(options(), owner.signal, f.dependencies);
  try {
    expect(f.dependencies.createCodec.mock.calls[0][0].video).toMatchObject({ width: 640, height: 360, fps: 15, bitrate: 100000 });
    expect(f.worker.initialize.mock.calls[0].slice(0, 2)).toEqual([1, 7]);
    expect(f.dependencies.openSocket).toHaveBeenCalledTimes(1);
    let release!: () => void; f.worker.media.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const input = Buffer.alloc(65543, 3); const write = session.write(input); await tick();
    await expect(session.write(Buffer.from([1]))).rejects.toThrow(); expect(f.worker.media).toHaveBeenCalledTimes(1);
    expect(f.worker.media.mock.calls[0][0]).toHaveLength(65536); release(); await write;
    expect(f.worker.media.mock.calls[1][0]).toHaveLength(7);
  } finally { await session.stop(); }
  expect(f.worker.stop).toHaveBeenCalled(); expect(f.sockets[0].close).toHaveBeenCalled();
});
test('existing 8 Mbps video setting is admitted and values above it start no capability', async () => {
  const f = fixture(); const owner = new globalThis.AbortController();
  const session = await createOwnedMediaSession({ ...options(), video: { ...options().video, bitrate: 8000000 } }, owner.signal, f.dependencies);
  try { expect(f.dependencies.createCodec.mock.calls[0][0].video.bitrate).toBe(8000000); } finally { await session.stop(); }
  const invalid = fixture();
  await expect(createOwnedMediaSession({ ...options(), video: { ...options().video, bitrate: 8000001 } }, owner.signal, invalid.dependencies)).rejects.toThrow('Media session unavailable');
  expect(invalid.dependencies.createProtection).not.toHaveBeenCalled(); expect(invalid.dependencies.openSocket).not.toHaveBeenCalled();
});
test('startup interleaves shared negative audio PTS and video, then protects RTP and matching RTCP before closure', async () => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  const f = fixture(); const owner = new globalThis.AbortController();
  const negotiation = { ...options(), audio: { output: output(8), localPort: 6001, codec: 'opus' as const,
    rate: 16000 as const, bitrate: 24000, packetTime: 20 as const } };
  const session = await createOwnedMediaSession(negotiation, owner.signal, f.dependencies);
  try {
    await f.callbacks().packet!(packet(1, 64000n, Buffer.from([0, 0, 1, 0x67, 1, 0, 0, 0, 1, 0x65, 2])), owner.signal);
    await f.callbacks().packet!(packet(2, -6500n, Buffer.from([0x78, 1])), owner.signal);
    const ended = session.end(); await jest.advanceTimersByTimeAsync(99); expect(f.plain).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(100); await ended;
    const rtp = f.plain.filter(p => p.type === 'rtp'); expect(rtp.map(p => p.stream)).toEqual([2, 1, 1]);
    expect(rtp[1].bytes.subarray(12)).toEqual(Buffer.from([0x67, 1])); expect(rtp[2].bytes.subarray(12)).toEqual(Buffer.from([0x65, 2]));
    expect(rtp[1].bytes[1] & 128).toBe(0); expect(rtp[2].bytes[1] & 128).toBe(128);
    expect(rtp[1].bytes.readUInt32BE(4)).toBe(rtp[2].bytes.readUInt32BE(4));
    const reports = [1, 2].map(stream => f.plain.filter(p => p.stream === stream && p.type === 'rtcp').at(-1)!.bytes);
    expect(reports[0].subarray(8, 16)).toEqual(reports[1].subarray(8, 16));
    const audioElapsed = ((reports[1].readUInt32BE(16) - rtp[0].bytes.readUInt32BE(4)) >>> 0) / 48000;
    const videoElapsed = ((reports[0].readUInt32BE(16) - rtp[1].bytes.readUInt32BE(4)) >>> 0) / 90000;
    expect(audioElapsed - videoElapsed).toBeCloseTo(0.0705, 4);
    expect(reports[0].readUInt32BE(20)).toBe(2); expect(reports[0].readUInt32BE(24)).toBe(4);
    expect(negotiation.video.output.key).toEqual(Buffer.alloc(16, 1));
    expect(f.worker.finishInput).toHaveBeenCalledTimes(1); expect(f.sockets.every(s => s.close.mock.calls.length > 0)).toBe(true);
    expect(session.failed).toBe(false);
  } finally { await session.stop(); jest.useRealTimers(); }
});
test('generation abort cancels in-flight output and confirms actual socket and worker closure', async () => {
  jest.useFakeTimers(); const f = fixture(); const owner = new globalThis.AbortController();
  const session = await createOwnedMediaSession(options(), owner.signal, f.dependencies); let release!: () => void;
  f.sockets[0].send.mockImplementation(() => new Promise<void>(resolve => { release = resolve; })); f.sockets[0].close.mockImplementation(() => {});
  try {
    await f.callbacks().packet!(packet(1, 0n, Buffer.from([0, 0, 1, 0x65, 1])), owner.signal);
    await jest.advanceTimersByTimeAsync(100); expect(f.sockets[0].send).toHaveBeenCalledTimes(1);
    let closed = false; session.whenClosed.then(() => { closed = true; }); owner.abort(); await tick();
    expect(closed).toBe(false); expect(f.worker.stop).toHaveBeenCalled(); expect(f.sockets[0].close).toHaveBeenCalled();
    release(); f.socketClosures[0].resolve(); await session.whenClosed; expect(f.sockets[0].send).toHaveBeenCalledTimes(1);
    await expect(session.write(Buffer.from([1]))).rejects.toThrow(); expect(session.failed).toBe(false);
  } finally { f.socketClosures[0].resolve(); await session.stop(); jest.useRealTimers(); }
});
test('one bounded codec admission waits for queue space before copying more packets', async () => {
  jest.useFakeTimers(); const f = fixture(); const owner = new globalThis.AbortController();
  const session = await createOwnedMediaSession(options(), owner.signal, f.dependencies);
  try {
    for (let i = 0; i < 256; i++) await f.callbacks().packet!(packet(1, 0n, Buffer.from([0, 0, 1, 0x65, 1])), owner.signal);
    let admitted = false; const extra = f.callbacks().packet!(packet(1, 0n, Buffer.from([0, 0, 1, 0x65, 1])), owner.signal).then(() => { admitted = true; });
    await tick(); expect(admitted).toBe(false); await jest.advanceTimersByTimeAsync(100); await extra; expect(admitted).toBe(true);
    await session.end(); expect(f.plain.filter(p => p.type === 'rtp')).toHaveLength(257); expect(session.failed).toBe(false);
  } finally { await session.stop(); jest.useRealTimers(); }
});
test('malformed Annex-B retires the generation without a datagram', async () => {
  jest.useFakeTimers(); const f = fixture(); const owner = new globalThis.AbortController();
  const session = await createOwnedMediaSession(options(), owner.signal, f.dependencies);
  try {
    await f.callbacks().packet!(packet(1, 0n, Buffer.from('dummy-secret-not-h264')), owner.signal);
    await jest.advanceTimersByTimeAsync(100); await session.whenClosed;
    expect(session.failed).toBe(true); expect(f.sockets[0].send).not.toHaveBeenCalled();
  } finally { await session.stop(); jest.useRealTimers(); }
});
test('invalid codec, output capability and prior cancellation start no worker or socket', async () => {
  const f = fixture(); const owner = new globalThis.AbortController();
  await expect(createOwnedMediaSession({ ...options(), video: { ...options().video, output: { ...output(), address: 'evil.invalid' } } }, owner.signal, f.dependencies)).rejects.toThrow('Media session unavailable');
  await expect(createOwnedMediaSession({ ...options(), audio: { output: output(8), localPort: 6001, codec: 'aac-eld' as 'opus', rate: 16000, bitrate: 24000 } }, owner.signal, f.dependencies)).rejects.toThrow();
  owner.abort(); await expect(createOwnedMediaSession(options(), owner.signal, f.dependencies)).rejects.toThrow();
  expect(f.dependencies.createProtection).not.toHaveBeenCalled(); expect(f.dependencies.openSocket).not.toHaveBeenCalled();
});
test('selected software preset and rational source metadata reach the owner without raw errors', async () => {
  const f = fixture(); const source = jest.fn(() => { throw new Error('dummy-private-hook-value'); });
  const session = await createOwnedMediaSession({ ...options(), onSourceInfo: source,
    video: { ...options().video, softwarePreset: 'ultrafast' },
    audio: { output: output(8), localPort: 6001, codec: 'opus', rate: 24000, bitrate: 24000, packetTime: 40 } },
  new globalThis.AbortController().signal, f.dependencies);
  expect(f.dependencies.createCodec.mock.calls[0][0]).toMatchObject({ video: { softwarePreset: 'ultrafast' }, audio: { codec: 'opus', rate: 24000, packetTime: 40 } });
  expect(() => f.callbacks().sourceInfo!({ width: 2560, height: 1440, fpsNumerator: 30000, fpsDenominator: 1001 })).toThrow('Media session unavailable');
  await session.whenClosed; expect(session.failed).toBe(true); expect(source).toHaveBeenCalledTimes(1);
});
test('idle RTCP cadence projects the shared source clock without adding media counters', async () => {
  jest.useFakeTimers(); const f = fixture(); const owner = new globalThis.AbortController();
  const session = await createOwnedMediaSession(options(), owner.signal, f.dependencies);
  try {
    await f.callbacks().packet!(packet(1, 42000n, Buffer.from([0, 0, 1, 0x65, 1])), owner.signal);
    await jest.advanceTimersByTimeAsync(450);
    const reports = f.plain.filter(p => p.type === 'rtcp'); expect(reports).toHaveLength(4);
    for (let i = 1; i < reports.length; i++) expect((reports[i].bytes.readUInt32BE(16) - reports[i - 1].bytes.readUInt32BE(16)) >>> 0).toBe(9000);
    expect(reports.every(report => report.bytes.readUInt32BE(20) === 1 && report.bytes.readUInt32BE(24) === 2)).toBe(true);
    await session.end(); expect(session.failed).toBe(false);
  } finally { await session.stop(); jest.useRealTimers(); }
});
test('stalled output reaches its bounded deadline and retires every capability', async () => {
  jest.useFakeTimers(); const f = fixture(); const owner = new globalThis.AbortController();
  const session = await createOwnedMediaSession(options(), owner.signal, f.dependencies);
  f.sockets[0].send.mockImplementation(() => new Promise<void>(() => {}));
  try {
    await f.callbacks().packet!(packet(1, 0n, Buffer.from([0, 0, 1, 0x65, 1])), owner.signal);
    await jest.advanceTimersByTimeAsync(1100); await session.whenClosed;
    expect(session.failed).toBe(true); expect(f.worker.stop).toHaveBeenCalled(); expect(f.sockets[0].close).toHaveBeenCalled();
  } finally { await session.stop(); jest.useRealTimers(); }
});
test('unsuccessful worker closure cannot become successful media completion', async () => {
  const f = fixture(); const session = await createOwnedMediaSession(options(), new globalThis.AbortController().signal, f.dependencies);
  f.worker.finishInput.mockImplementation(async () => { f.worker.failed = true; f.closed.resolve(); });
  await expect(session.end()).rejects.toThrow('Media session unavailable'); expect(session.failed).toBe(true);
  await session.whenClosed; expect(f.sockets[0].close).toHaveBeenCalled();
});
