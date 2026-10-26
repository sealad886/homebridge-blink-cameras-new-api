import { Buffer } from 'node:buffer';
import { test } from '@jest/globals';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { MediaOutputOptions } from '../src/accessories/media-output';
import type { MediaWorkerCallbacks, CodecPacket } from '../src/accessories/media-worker';
import { createOwnedMediaSession } from '../src/accessories/media-session';

function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
const output = (ssrc = 7): MediaOutputOptions => ({ address: '192.168.1.5', addressVersion: 'ipv4', port: 5000 + ssrc,
  suite: 'AES_CM_128_HMAC_SHA1_80', key: Buffer.alloc(16, 1), salt: Buffer.alloc(14, 2), ssrc, payloadType: ssrc === 7 ? 99 : 110,
  mtu: 1200, fps: 15, rtcpInterval: 0.1 });
function options() { return { workerPath: '/verified/worker', video: { output: output(), localPort: 6000,
  width: 640, height: 360, bitrate: 100000, maxFrames: 100, profile: 0 as const, level: 0 as const } }; }
function fixture() {
  const closed = deferred(), ready = deferred(), drained = deferred(); let callbacks!: MediaWorkerCallbacks;
  const plain: Array<{ stream: number; type: 'rtp' | 'rtcp'; bytes: Buffer }> = [];
  const worker = {
    failed: false, whenClosed: closed.promise, whenReady: ready.promise, whenMediaDrained: drained.promise,
    configure: jest.fn(async (values: readonly number[]) => { void values; ready.resolve(); }),
    initialize: jest.fn(async (stream: 1 | 2, ssrc: number, key: Buffer, salt: Buffer) => { void ssrc; void key; void salt; return {
      protectRtp: async (bytes: Buffer) => { plain.push({ stream, type: 'rtp', bytes: Buffer.from(bytes) }); return Buffer.concat([bytes, Buffer.alloc(10)]); },
      protectRtcp: async (bytes: Buffer) => { plain.push({ stream, type: 'rtcp', bytes: Buffer.from(bytes) }); return Buffer.concat([bytes, Buffer.alloc(14)]); },
      close: jest.fn(),
    }; }),
    media: jest.fn(async (bytes: Buffer) => { void bytes; }), endMedia: jest.fn(async () => { drained.resolve(); }),
    finishInput: jest.fn(async () => { closed.resolve(); }), stop: jest.fn(async () => { closed.resolve(); }),
  };
  const sockets: Array<{ whenClosed: Promise<void>; close: jest.Mock; send: jest.Mock }> = [];
  const socketClosures: ReturnType<typeof deferred>[] = [];
  const createWorker = jest.fn((_path: string, value: MediaWorkerCallbacks) => { callbacks = value; return worker; });
  const openSocket = jest.fn(async () => {
    const closure = deferred(); const socket = { whenClosed: closure.promise, close: jest.fn(() => { closure.resolve(); }), send: jest.fn(async () => {}) };
    sockets.push(socket); socketClosures.push(closure); return socket;
  });
  return { worker, plain, sockets, socketClosures, callbacks: () => callbacks, dependencies: { createWorker, openSocket }, closed };
}
const packet = (stream: 1 | 2, pts: bigint, data: Buffer): CodecPacket => ({ stream, pts, dts: pts, duration: 20000n,
  keyframe: stream === 1, skipStart: 0, skipEnd: 0, data });
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('owns configured worker and numeric output before chunking one admitted vendor frame', async () => {
  const f = fixture(); const owner = new globalThis.AbortController(); const session = await createOwnedMediaSession(options(), owner.signal, f.dependencies);
  try {
    expect(f.worker.configure).toHaveBeenCalledWith([640, 360, 15, 100000, 100, 0, 0, 0, 0, 0, 0, 0, 0]);
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
  try { expect(f.worker.configure.mock.calls[0][0][3]).toBe(8000000); } finally { await session.stop(); }
  const invalid = fixture();
  await expect(createOwnedMediaSession({ ...options(), video: { ...options().video, bitrate: 8000001 } }, owner.signal, invalid.dependencies)).rejects.toThrow('Media session unavailable');
  expect(invalid.dependencies.createWorker).not.toHaveBeenCalled(); expect(invalid.dependencies.openSocket).not.toHaveBeenCalled();
});
test('startup interleaves shared negative audio PTS and video, then protects RTP and matching RTCP before closure', async () => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  const f = fixture(); const owner = new globalThis.AbortController();
  const negotiation = { ...options(), audio: { output: output(8), localPort: 6001, codec: 'opus' as const,
    rate: 16000 as const, bitrate: 24000, packetTime: 20 as const } };
  const session = await createOwnedMediaSession(negotiation, owner.signal, f.dependencies);
  try {
    f.callbacks().audioInfo!({ codec: 1, rate: 16000, channels: 1, padding: 104, extradata: Buffer.alloc(0) });
    await f.callbacks().packet!(packet(1, 64000n, Buffer.from([0, 0, 1, 0x67, 1, 0, 0, 0, 1, 0x65, 2])), owner.signal);
    await f.callbacks().packet!({ ...packet(2, -6500n, Buffer.from([0x78, 1])), skipStart: 104, skipEnd: 5 }, owner.signal);
    const ended = session.end(); await jest.advanceTimersByTimeAsync(99); expect(f.plain).toHaveLength(0); expect(f.worker.finishInput).not.toHaveBeenCalled();
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
    expect(session.audioTiming).toEqual({ initialPaddingSamples: 104, skipStartSamples: 104, skipEndSamples: 5 });
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
  expect(f.dependencies.createWorker).not.toHaveBeenCalled(); expect(f.dependencies.openSocket).not.toHaveBeenCalled();
});
test('selected software preset and rational source metadata reach the owner without raw errors', async () => {
  const f = fixture(); const source = jest.fn(() => { throw new Error('dummy-private-hook-value'); });
  const session = await createOwnedMediaSession({ ...options(), onSourceInfo: source,
    video: { ...options().video, softwarePreset: 'ultrafast' },
    audio: { output: output(8), localPort: 6001, codec: 'opus', rate: 24000, bitrate: 24000, packetTime: 40 } },
  new globalThis.AbortController().signal, f.dependencies);
  expect(f.worker.configure).toHaveBeenCalledWith([640, 360, 15, 100000, 100, 1, 1, 24000, 1, 24000, 0, 0, 40]);
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
const realWorker = process.env.BLINK_MEDIA_TEST_WORKER_PATH;
function receiverFrame(type: number, body = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(12); header.write('BMR1'); header.writeUInt32BE(type, 4); header.writeUInt32BE(body.length, 8); return Buffer.concat([header, body]);
}
(realWorker ? test : test.skip).each((['audio-latm', 'audio-latm-bundled'] as const).flatMap(mode =>
  ([['opus', 16000, 1], ['opus', 24000, 1], ['pcma', 8000, 2], ['pcmu', 8000, 3]] as const).map(audio => [mode, ...audio] as const)))(
  'actual %s codec, SRTP and %s receiver decode preserve shared audio/video timeline', async (mode, codec, rate, code) => {
    // eslint-disable-next-line no-undef -- Jest executes these tests as CommonJS.
    const build = resolve(__dirname, '../native/build'); const suffix = process.platform === 'win32' ? '.exe' : '';
    const media = execFileSync(resolve(build, `fixture${suffix}`), [mode], { env: {}, timeout: 5000 });
    const datagrams: Array<{ stream: number; bytes: Buffer }> = []; const source = jest.fn();
    const negotiation = { ...options(), workerPath: realWorker!, onSourceInfo: source,
      video: { ...options().video, output: { ...output(), mtu: 128 }, width: 16, height: 16, softwarePreset: 'ultrafast' as const },
      audio: { output: output(8), localPort: 6001, codec, rate, bitrate: 24000 } };
    const session = await createOwnedMediaSession(negotiation, new globalThis.AbortController().signal, {
      openSocket: async admitted => {
        const closed = deferred(); return { whenClosed: closed.promise, close: closed.resolve,
          send: async bytes => { datagrams.push({ stream: admitted.ssrc === 7 ? 1 : 2, bytes: Buffer.from(bytes) }); } };
      },
    });
    try {
      await session.write(media); await session.end(); expect(session.failed).toBe(false);
      expect(source).toHaveBeenCalledWith(expect.objectContaining({ width: 16, height: 16 }));
      const config = Buffer.alloc(40);
      [16, 16, mode === 'audio-latm' ? 4 : 30, 15, code, rate, session.audioTiming.initialPaddingSamples, 20, 99, 110].forEach((n, i) => config.writeUInt32BE(n, i * 4));
      const input = [receiverFrame(1, config)];
      for (const [stream, capability] of [[1, negotiation.video.output], [2, negotiation.audio.output]] as const) {
        const init = Buffer.alloc(42); init.writeUInt32BE(stream); init.writeUInt32BE(capability.ssrc, 4); init.writeUInt32BE(1, 8);
        capability.key.copy(init, 12); capability.salt.copy(init, 28); input.push(receiverFrame(10, init));
      }
      for (const datagram of datagrams) {
        const body = Buffer.alloc(4 + datagram.bytes.length); body.writeUInt32BE(datagram.stream); datagram.bytes.copy(body, 4);
        input.push(receiverFrame(datagram.bytes[1] === 200 ? 12 : 11, body));
      }
      input.push(receiverFrame(3));
      expect(execFileSync(resolve(build, `check-rtp${suffix}`), [], { input: Buffer.concat(input), env: {}, timeout: 5000 }).toString()).toBe('receiver verified\n');
      if (mode === 'audio-latm' && codec === 'opus' && rate === 16000) {
        const forged = input.map(bytes => Buffer.from(bytes)); const index = forged.findIndex(bytes => bytes.readUInt32BE(4) === 11);
        forged[index][forged[index].length - 1] ^= 1;
        expect(() => execFileSync(resolve(build, `check-rtp${suffix}`), [], { input: Buffer.concat(forged), env: {}, timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })).toThrow();
      }
    } finally { await session.stop(); }
  });
