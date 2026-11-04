import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import type { CameraRecordingConfiguration } from 'homebridge';
import type { MediaWorkerCallbacks, RecordingSourceSummary, RecordingWorkerConfiguration } from '../src/accessories/media-worker';
import { RecordingBufferBudget } from '../src/accessories/recording-buffer';
import { prepareSavedClip, type SavedClipMediaWorker } from '../src/accessories/saved-clip-preparation';

jest.mock('../src/accessories/media-worker-artifact', () => ({ loadPackagedMediaWorker: jest.fn(() => { throw new Error('No verified packaged worker'); }) }));

const configuration = (): CameraRecordingConfiguration => ({
  prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: 4000 },
  videoCodec: { type: 0, resolution: [640, 360, 15], parameters: { profile: 0, level: 0, bitRate: 300, iFrameInterval: 4000 } },
  audioCodec: { type: 0, samplerate: 1, bitrate: 32, audioChannels: 1, bitrateMode: 0 },
});
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function box(type: string, value = 1): Buffer {
  const bytes = Buffer.alloc(9, value); bytes.writeUInt32BE(9); bytes.write(type, 4, 'ascii'); return bytes;
}
const initialization = () => Buffer.concat([box('ftyp'), box('moov')]);
const fragmentBytes = (sequence: number) => Buffer.concat([box('moof'), box('mdat', sequence + 1)]);
const source = (bytes = Buffer.alloc(100000, 9)) => ({ bytes, expectedBytes: bytes.length, expectedSha256: sha256(bytes) });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function nativeFixture(fragments = 7) {
  let callbacks!: MediaWorkerCallbacks, selected!: RecordingWorkerConfiguration, finish!: () => void;
  const received: Buffer[] = [];
  const owner = new globalThis.AbortController();
  const worker: SavedClipMediaWorker = {
    failed: false, whenReady: Promise.resolve(), whenMediaDrained: Promise.resolve(),
    whenClosed: new Promise<void>(resolve => { finish = resolve; }),
    configureRecording: jest.fn(async values => { selected = values; }),
    media: jest.fn(async bytes => { received.push(Buffer.from(bytes)); }),
    endMedia: jest.fn(async () => {
      callbacks.sourceInfo!({ width: 1920, height: 1080, fpsNumerator: 15, fpsDenominator: 1 });
      const init = initialization(); await callbacks.recordingInit!(init, owner.signal); init.fill(0);
      for (let sequence = 0; sequence < fragments; sequence++) {
        const data = fragmentBytes(sequence);
        await callbacks.recordingFragment!({ sequence, startUs: sequence * 1000000, durationUs: 1000000, keyframeStart: true, data }, owner.signal);
        data.fill(0);
      }
      callbacks.recordingSummary!({ decodedVideoFrames: fragments * 15, selectedVideoFrames: fragments * 15,
        encodedVideoFrames: fragments * 15, generatedAudioSamples: 0, audioRate: selected.audioRate,
        inputFormat: 'mp4', preparedSpanUpperBoundUs: fragments * 1000000 + 64000 });
    }),
    finishInput: jest.fn(async () => { finish(); }), stop: jest.fn(async () => { owner.abort(); finish(); }),
  };
  const factory = jest.fn((next: MediaWorkerCallbacks) => { callbacks = next; return worker; });
  return { worker, factory, received, owner, get callbacks() { return callbacks; }, get selected() { return selected; } };
}

it('prepares every first, middle and final fragment with provenance and one owned lease', async () => {
  const native = nativeFixture(), budget = new RecordingBufferBudget(), admitted = source(), config = configuration();
  const original = Buffer.from(admitted.bytes);
  const prepared = await prepareSavedClip(admitted, config, true, new globalThis.AbortController().signal,
    { budget, workerFactory: native.factory });
  expect(prepared.fragments.map(f => f.sequence)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(prepared.fragments.every((f, i) => f.data.equals(fragmentBytes(i)))).toBe(true);
  expect(prepared.pin.initialization).toEqual(initialization());
  expect(prepared.sourceSha256).toBe(admitted.expectedSha256);
  expect(prepared.preparedSha256).toBe(sha256(Buffer.concat([initialization(), ...Array.from({ length: 7 }, (_, i) => fragmentBytes(i))])));
  expect(prepared.preparedSpanUpperBoundUs).toBe(7064000n);
  expect(prepared.sourceInfo).toEqual({ width: 1920, height: 1080, fpsNumerator: 15, fpsDenominator: 1 });
  expect(prepared.summary.encodedVideoFrames).toBe(105);
  expect(Buffer.concat(native.received)).toEqual(original); expect(admitted.bytes).toEqual(original);
  expect(native.received.every(bytes => bytes.length <= 65536)).toBe(true);
  expect(native.selected).toMatchObject({ inputFormat: 'mp4', audioTailPolicy: 'pad-bounded', audioCodec: 4,
    audioRate: 16000, audioBitrate: 32000, width: 640, height: 360, fps: 15, bitrate: 300000, iFrameIntervalMs: 1000 });
  config.videoCodec.resolution[0] = 1280;
  expect(prepared.configuration.videoCodec.resolution).toEqual([640, 360, 15]);
  expect(budget.bytes).toBe(prepared.buffer.bytes);
  const retained = [prepared.pin.initialization, ...prepared.fragments.map(f => f.data)];
  prepared.dispose(); prepared.dispose();
  expect(prepared.disposed).toBe(true); expect(prepared.pin.released).toBe(true); expect(budget.bytes).toBe(0);
  expect(retained.every(bytes => bytes.every(byte => byte === 0))).toBe(true); expect(admitted.bytes).toEqual(original);
});

it.each(['size mismatch', 'hash mismatch', 'invalid hash'])('rejects %s before constructing a decoder and preserves the original', async kind => {
  const native = nativeFixture(), budget = new RecordingBufferBudget(), admitted = source();
  if (kind === 'size mismatch') admitted.expectedBytes--;
  else admitted.expectedSha256 = kind === 'invalid hash' ? 'not-a-hash' : '0'.repeat(64);
  const original = Buffer.from(admitted.bytes);
  await expect(prepareSavedClip(admitted, configuration(), false, new globalThis.AbortController().signal,
    { budget, workerFactory: native.factory })).rejects.toThrow('Saved clip preparation unavailable');
  expect(native.factory).not.toHaveBeenCalled(); expect(budget.bytes).toBe(0); expect(admitted.bytes).toEqual(original);
});

it.each([
  { decodedVideoFrames: 0 }, { decodedVideoFrames: 9001 }, { selectedVideoFrames: 106 }, { encodedVideoFrames: 104 },
  { generatedAudioSamples: 1 }, { audioRate: 16000 }, { inputFormat: 'mpegts' as 'mp4' },
  { preparedSpanUpperBoundUs: 0 }, { preparedSpanUpperBoundUs: 92000001 }, { preparedSpanUpperBoundUs: 1.5 },
])('requires a bounded, consistent native summary: %p', async change => {
  const native = nativeFixture(), budget = new RecordingBufferBudget();
  const pending = prepareSavedClip(source(), configuration(), false, new globalThis.AbortController().signal,
    { budget, workerFactory: callbacks => native.factory({ ...callbacks,
      recordingSummary: (summary: RecordingSourceSummary) => callbacks.recordingSummary!({ ...summary, ...change }) }) });
  await expect(pending.then(prepared => { prepared.dispose(); return 'accepted'; })).rejects.toThrow('Saved clip preparation unavailable');
  expect(budget.bytes).toBe(0); expect(native.worker.stop).toHaveBeenCalledTimes(1);
});

it.each(['duplicate', 'invalid geometry'])('rejects %s source metadata and erases retained bytes', async kind => {
  const native = nativeFixture(), budget = new RecordingBufferBudget();
  const pending = prepareSavedClip(source(), configuration(), false, new globalThis.AbortController().signal,
    { budget, workerFactory: callbacks => native.factory({ ...callbacks, sourceInfo: info => {
      callbacks.sourceInfo!({ ...info, width: kind === 'invalid geometry' ? 0 : info.width });
      if (kind === 'duplicate') callbacks.sourceInfo!(info);
    } }) });
  await expect(pending.then(prepared => { prepared.dispose(); return 'accepted'; })).rejects.toThrow('Saved clip preparation unavailable');
  expect(budget.bytes).toBe(0);
});

it.each([1, 3])('seals a %s-second finite clip without waiting for a live prebuffer', async fragments => {
  const native = nativeFixture(fragments), budget = new RecordingBufferBudget();
  const prepared = await prepareSavedClip(source(), configuration(), false, new globalThis.AbortController().signal,
    { budget, workerFactory: native.factory });
  expect(prepared.buffer.ready).toBe(false); expect(prepared.fragments).toHaveLength(fragments);
  expect(prepared.fragments[0].sequence).toBe(0); expect(prepared.fragments.at(-1)?.endUs).toBe(BigInt(fragments) * 1000000n);
  expect(() => prepared.buffer.append({ sequence: fragments, startUs: BigInt(fragments) * 1000000n,
    durationUs: 1000000n, keyframe: true, data: fragmentBytes(fragments) })).toThrow('invalid_media');
  prepared.dispose(); expect(budget.bytes).toBe(0);
});

it.each(['missing init', 'duplicate init', 'missing fragment', 'sequence gap', 'missing summary', 'duplicate summary', 'missing source', 'failed worker'])
('requires exactly one init, contiguous fragments and complete native EOF evidence: %s', async kind => {
  const native = nativeFixture(), budget = new RecordingBufferBudget();
  const pending = prepareSavedClip(source(), configuration(), false, new globalThis.AbortController().signal, {
    budget, workerFactory: callbacks => native.factory({ ...callbacks,
      sourceInfo: kind === 'missing source' ? () => {} : callbacks.sourceInfo,
      recordingInit: async (data, signal) => {
        if (kind === 'missing init') return;
        await callbacks.recordingInit!(data, signal);
        if (kind === 'duplicate init') await callbacks.recordingInit!(data, signal);
      },
      recordingFragment: async (fragment, signal) => {
        if (kind === 'missing fragment') return;
        await callbacks.recordingFragment!({ ...fragment, sequence: kind === 'sequence gap' && fragment.sequence === 3 ? 4 : fragment.sequence }, signal);
      },
      recordingSummary: summary => {
        if (kind === 'missing summary') return;
        callbacks.recordingSummary!(summary);
        if (kind === 'duplicate summary') callbacks.recordingSummary!(summary);
        if (kind === 'failed worker') Object.defineProperty(native.worker, 'failed', { value: true });
      },
    }),
  });
  await expect(pending).rejects.toThrow('Saved clip preparation unavailable');
  expect(budget.bytes).toBe(0); expect(native.worker.finishInput).not.toHaveBeenCalled();
});

it.each([false, true])('maps selected audio policy consistently (audio=%s)', async audioActive => {
  const native = nativeFixture(1), config = configuration(); config.audioCodec.samplerate = 2;
  const prepared = await prepareSavedClip(source(), config, audioActive, new globalThis.AbortController().signal,
    { workerFactory: native.factory });
  expect(native.selected).toMatchObject({ audioCodec: audioActive ? 4 : 0, audioRate: audioActive ? 24000 : 0,
    audioBitrate: audioActive ? 32000 : 0, audioTailPolicy: audioActive ? 'pad-bounded' : 'strict' });
  expect(prepared.audioActive).toBe(audioActive); expect(prepared.configuration.audioCodec.samplerate).toBe(2); prepared.dispose();
});

it('rejects unsupported selected audio before worker creation', async () => {
  const native = nativeFixture(), config = configuration(), budget = new RecordingBufferBudget(); config.audioCodec.samplerate = 0;
  await expect(prepareSavedClip(source(), config, true, new globalThis.AbortController().signal,
    { budget, workerFactory: native.factory })).rejects.toThrow('Saved clip preparation unavailable');
  expect(native.factory).not.toHaveBeenCalled(); expect(budget.bytes).toBe(0);
});

it('fails closed when the packaged worker is unavailable and has no external decoder fallback', async () => {
  const budget = new RecordingBufferBudget();
  await expect(prepareSavedClip(source(), configuration(), false, new globalThis.AbortController().signal, { budget }))
    .rejects.toThrow('Saved clip preparation unavailable');
  expect(budget.bytes).toBe(0);
});

it.each(['empty', 'oversize', 'aggregate pressure'])('bounds %s input before worker construction', async kind => {
  const native = nativeFixture();
  const admitted = source(Buffer.alloc(kind === 'empty' ? 0 : kind === 'oversize' ? 32 * 1024 * 1024 + 1 : 16, 7));
  const budget = new RecordingBufferBudget(kind === 'aggregate pressure' ? 15 : 64 * 1024 * 1024);
  await expect(prepareSavedClip(admitted, configuration(), false, new globalThis.AbortController().signal,
    { budget, workerFactory: native.factory })).rejects.toThrow('Saved clip preparation unavailable');
  expect(native.factory).not.toHaveBeenCalled(); expect(budget.bytes).toBe(0); expect(admitted.bytes.every(byte => byte === 7)).toBe(true);
});

it('holds source bytes in one reservation until all input credit, then erases its owned copy before END', async () => {
  const native = nativeFixture(1), budget = new RecordingBufferBudget(), admitted = source(); const borrowed: Buffer[] = [];
  native.worker.media = jest.fn(async bytes => { borrowed.push(bytes); expect(budget.bytes).toBe(admitted.bytes.length); });
  const end = native.worker.endMedia;
  native.worker.endMedia = jest.fn(async () => {
    expect(budget.bytes).toBe(0); expect(borrowed.every(data => data.every(byte => byte === 0))).toBe(true); await end();
  });
  const prepared = await prepareSavedClip(admitted, configuration(), false, new globalThis.AbortController().signal,
    { budget, workerFactory: native.factory });
  expect(budget.bytes).toBe(36); expect(admitted.bytes.every(byte => byte === 9)).toBe(true); prepared.dispose();
});

it('cleans every retained output byte after output budget exhaustion without discarding unrelated reservations', async () => {
  const native = nativeFixture(), budget = new RecordingBufferBudget(159); budget.reserve(16);
  await expect(prepareSavedClip(source(Buffer.alloc(100)), configuration(), false, new globalThis.AbortController().signal, {
    budget, workerFactory: native.factory,
  })).rejects.toThrow('Saved clip preparation unavailable');
  expect(budget.bytes).toBe(16); expect(native.worker.stop).toHaveBeenCalledTimes(1); budget.release(16);
});

it('cancels pending input, promptly erases its owned copy and fences every late callback', async () => {
  const native = nativeFixture(), budget = new RecordingBufferBudget(), abort = new globalThis.AbortController();
  let borrowed!: Buffer;
  native.worker.media = jest.fn(bytes => { borrowed = bytes; return new Promise<void>(() => {}); });
  const pending = prepareSavedClip(source(), configuration(), true, abort.signal, { budget, workerFactory: native.factory });
  const checked = expect(pending).rejects.toThrow('Saved clip preparation unavailable'); await flush();
  expect(budget.bytes).toBe(100000); abort.abort(); await checked;
  expect(borrowed.every(byte => byte === 0)).toBe(true); expect(budget.bytes).toBe(0);
  expect(() => native.callbacks.sourceInfo!({ width: 1, height: 1, fpsNumerator: 1, fpsDenominator: 1 })).toThrow();
  await expect(native.callbacks.recordingInit!(initialization(), native.owner.signal)).rejects.toThrow();
  await expect(native.callbacks.recordingFragment!({ sequence: 0, startUs: 0, durationUs: 1000,
    keyframeStart: true, data: fragmentBytes(0) }, native.owner.signal)).rejects.toThrow();
  expect(native.worker.endMedia).not.toHaveBeenCalled(); expect(native.worker.stop).toHaveBeenCalled();
});

it('abort after complete preparation releases the bundle and late callbacks cannot refill it', async () => {
  const native = nativeFixture(), budget = new RecordingBufferBudget(), abort = new globalThis.AbortController();
  const prepared = await prepareSavedClip(source(), configuration(), false, abort.signal, { budget, workerFactory: native.factory });
  const retained = prepared.fragments.map(fragment => fragment.data); abort.abort(); prepared.dispose();
  expect(prepared.disposed).toBe(true); expect(budget.bytes).toBe(0);
  expect(retained.every(bytes => bytes.every(byte => byte === 0))).toBe(true);
  await expect(native.callbacks.recordingInit!(initialization(), native.owner.signal)).rejects.toThrow();
});

it('rejects a worker failure during final closure and disposes all retained media', async () => {
  const native = nativeFixture(), budget = new RecordingBufferBudget(), admitted = source();
  const finish = native.worker.finishInput;
  native.worker.finishInput = jest.fn(async () => {
    expect(budget.bytes).toBeGreaterThan(0);
    Object.defineProperty(native.worker, 'failed', { value: true });
    await finish();
  });
  const pending = prepareSavedClip(admitted, configuration(), false, new globalThis.AbortController().signal,
    { budget, workerFactory: native.factory });
  await expect(pending.then(prepared => { prepared.dispose(); return 'accepted'; })).rejects.toThrow('Saved clip preparation unavailable');
  expect(native.worker.finishInput).toHaveBeenCalledTimes(1); expect(native.worker.stop).toHaveBeenCalledTimes(1);
  expect(budget.bytes).toBe(0); expect(sha256(admitted.bytes)).toBe(admitted.expectedSha256);
});
