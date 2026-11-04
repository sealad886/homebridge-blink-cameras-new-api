import { Buffer } from 'node:buffer';
import type { CameraRecordingConfiguration } from 'homebridge';
import { BlinkCameraRecordingDelegate } from '../src/accessories/camera-recording';
import { RecordingBufferBudget, RecordingFragmentBuffer } from '../src/accessories/recording-buffer';
import type { PreparedSavedClip } from '../src/accessories/saved-clip-preparation';

const configuration = (): CameraRecordingConfiguration => ({
  prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: 4000 },
  videoCodec: { type: 0, resolution: [640, 360, 15], parameters: { profile: 0, level: 0, bitRate: 500, iFrameInterval: 1000 } },
  audioCodec: { type: 0, samplerate: 1, bitrate: 32, audioChannels: 1, bitrateMode: 0 },
});
function box(name: string): Buffer { const b = Buffer.alloc(8); b.writeUInt32BE(8); b.write(name, 4); return b; }
function prepared(seconds = 5) {
  const budget = new RecordingBufferBudget(), buffer = new RecordingFragmentBuffer(budget);
  buffer.initialize(Buffer.concat([box('ftyp'), box('moov')]));
  let pin;
  for (let i = 0; i < seconds; i++) {
    buffer.append({ sequence: i, startUs: BigInt(i) * 1000000n, durationUs: 1000000n,
      keyframe: true, data: Buffer.concat([box('moof'), box('mdat')]) });
    if (buffer.ready && !pin) pin = buffer.pin();
  }
  pin ??= buffer.sealFinite();
  let disposed = false;
  const bundle: PreparedSavedClip = { buffer, pin, fragments: pin.fragments, configuration: configuration(), audioActive: false,
    sourceInfo: { width: 640, height: 360, fpsNumerator: 15, fpsDenominator: 1 },
    summary: { decodedVideoFrames: seconds * 15, selectedVideoFrames: seconds * 15, encodedVideoFrames: seconds * 15,
      generatedAudioSamples: 0, audioRate: 0, inputFormat: 'mp4', preparedSpanUpperBoundUs: seconds * 1000000 },
    sourceSha256: 'a'.repeat(64), preparedSha256: 'b'.repeat(64), preparedSpanUpperBoundUs: BigInt(seconds) * 1000000n,
    get disposed() { return disposed; }, dispose: () => { disposed = true; buffer.clear(); } };
  return { bundle, budget };
}
const metadata = { jobKey: 'fixture', cameraKey: 'camera:2', capturedAt: '2026-11-03T10:00:00Z', clipIdentity: 'opaque' };
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture() {
  const start = jest.fn(), motion = jest.fn(), changed = jest.fn();
  const delegate = new BlinkCameraRecordingDelegate(start, { source: 'saved-clips', replayMotion: motion, policyChanged: changed });
  delegate.updateRecordingConfiguration(configuration()); delegate.updateRecordingActive(true);
  return { delegate, start, motion, changed };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('Home observations start unknown, record first equal callbacks, and separate raw audio from the plugin gate', async () => {
  const changed = jest.fn(), delegate = new BlinkCameraRecordingDelegate(jest.fn(), { source: 'saved-clips', policyChanged: changed });
  expect(delegate.getHomeRecordingObservation()).toMatchObject({ configuration: 'unknown', recordingActive: null, cameraActive: null,
    audioActive: null, triggerTypes: null, effectiveAudioActive: false });
  const epoch = delegate.getPolicySnapshot().permission.epoch;
  delegate.updateRecordingActive(false); delegate.setCameraActive(true); delegate.setAudioActive(false);
  expect(changed).toHaveBeenCalledTimes(3);
  expect(delegate.getPolicySnapshot().permission.epoch).toBe(epoch);
  delegate.setAudioActive(true, false);
  expect(delegate.getHomeRecordingObservation()).toMatchObject({ audioActive: true, effectiveAudioActive: false });
  expect(delegate.getPolicySnapshot().permission.epoch).toBe(epoch);
  delegate.setCameraActive(undefined); delegate.setAudioActive(undefined);
  expect(delegate.getHomeRecordingObservation()).toMatchObject({ cameraActive: true, audioActive: true });
  delegate.updateRecordingConfiguration(undefined);
  expect(delegate.getHomeRecordingObservation().configuration).toBe('not-configured');
  await delegate.stop();
});

test('motion policy changes revoke saved events but ordinary renegotiation and codec changes keep the last permission', async () => {
  const f = fixture(), before = f.delegate.getPolicySnapshot(), p = prepared();
  f.delegate.updateRecordingConfiguration(undefined);
  expect(f.delegate.getPolicySnapshot().permission).toEqual(before.permission);
  f.delegate.updateRecordingConfiguration(configuration());
  expect(f.delegate.getPolicySnapshot().permission.epoch).toBe(before.permission.epoch);
  const ring = configuration(); ring.eventTriggerTypes = [2]; f.delegate.updateRecordingConfiguration(ring);
  expect(f.delegate.getPolicySnapshot().permission.motionAllowed).toBe(false);
  expect(f.delegate.getPolicySnapshot().permission.epoch).not.toBe(before.permission.epoch);
  expect(await f.delegate.deliverSavedClip(p.bundle, metadata, f.delegate.getPolicySnapshot(), new AbortController().signal))
    .toEqual({ status: 'not-offered', reason: 'unsupported-trigger-policy' });
  expect(f.motion).not.toHaveBeenCalled(); p.bundle.dispose(); await f.delegate.stop();
});

test('saved source remains idle and separates configuration revisions from permission epochs', async () => {
  const f = fixture(); await tick();
  expect(f.start).not.toHaveBeenCalled(); expect(f.delegate.videoMotionActive).toBe(false);
  const before = f.delegate.getPolicySnapshot();
  f.delegate.updateRecordingConfiguration(configuration());
  expect(f.delegate.getPolicySnapshot()).toEqual(before);
  const changed = configuration(); changed.videoCodec.parameters.bitRate = 700;
  f.delegate.updateRecordingConfiguration(changed);
  expect(f.delegate.getPolicySnapshot().permission.epoch).toBe(before.permission.epoch);
  expect(f.delegate.getPolicySnapshot().configuration.revision).not.toBe(before.configuration.revision);
  f.delegate.setAudioActive(true);
  expect(f.delegate.getPolicySnapshot().permission.epoch).not.toBe(before.permission.epoch);
  await tick(); expect(f.start).not.toHaveBeenCalled(); await f.delegate.stop();
});

test.each([2, 6])('delivers the complete %s-second finite clip and holds motion through transport acknowledgement', async seconds => {
  const f = fixture(), p = prepared(seconds); await tick();
  const outcome = f.delegate.deliverSavedClip(p.bundle, metadata, f.delegate.getPolicySnapshot(), new AbortController().signal);
  expect(f.motion).toHaveBeenCalledWith(true, metadata);
  const packets = []; for await (const packet of f.delegate.handleRecordingStreamRequest(7)) packets.push(packet);
  expect(packets).toHaveLength(seconds + 1); expect(packets.filter(p => p.isLast)).toHaveLength(1);
  expect(packets.at(-1)?.isLast).toBe(true);
  f.delegate.acknowledgeStream(7); await tick(); expect(p.bundle.disposed).toBe(false);
  await jest.advanceTimersByTimeAsync(seconds * 1000);
  expect(await outcome).toEqual(expect.objectContaining({ status: 'delivered', acknowledgedAt: expect.any(String) }));
  expect(f.motion).toHaveBeenLastCalledWith(false, metadata); expect(p.budget.bytes).toBe(0);
  expect(f.start).not.toHaveBeenCalled(); await f.delegate.stop();
});

test('configuration change before offer retries without motion, while a started event keeps its selected format', async () => {
  const f = fixture(), p = prepared(2), policy = f.delegate.getPolicySnapshot();
  const next = configuration(); next.videoCodec.parameters.bitRate = 700; f.delegate.updateRecordingConfiguration(next);
  expect(await f.delegate.deliverSavedClip(p.bundle, metadata, policy, new AbortController().signal))
    .toEqual({ status: 'not-offered', reason: 'configuration-changed' });
  expect(f.motion).not.toHaveBeenCalled(); p.bundle.dispose();
  f.delegate.updateRecordingConfiguration(configuration());
  const current = prepared(2), outcome = f.delegate.deliverSavedClip(current.bundle, metadata, f.delegate.getPolicySnapshot(), new AbortController().signal);
  const stream = f.delegate.handleRecordingStreamRequest(3); await stream.next();
  f.delegate.updateRecordingConfiguration(next);
  expect((await stream.next()).value.isLast).toBe(false); expect((await stream.next()).value.isLast).toBe(true);
  f.delegate.acknowledgeStream(3); await jest.advanceTimersByTimeAsync(2000); expect((await outcome).status).toBe('delivered');
  await f.delegate.stop();
});

test.each(['camera', 'recording', 'audio', 'owner', 'owner-after-close'] as const)('revocation during finite delivery erases output and reports uncertain: %s', async kind => {
  const f = fixture(), p = prepared(), abort = new AbortController();
  const outcome = f.delegate.deliverSavedClip(p.bundle, metadata, f.delegate.getPolicySnapshot(), abort.signal);
  const stream = f.delegate.handleRecordingStreamRequest(1), first = (await stream.next()).value.data as Buffer;
  if (kind === 'camera') f.delegate.setCameraActive(false);
  if (kind === 'recording') f.delegate.updateRecordingActive(false);
  if (kind === 'audio') f.delegate.setAudioActive(true);
  if (kind === 'owner') abort.abort();
  if (kind === 'owner-after-close') {
    f.delegate.closeRecordingStream(1, 3); expect(p.budget.bytes).toBe(0);
    expect(f.motion).toHaveBeenLastCalledWith(true, metadata); abort.abort();
  }
  expect(await outcome).toEqual({ status: 'uncertain' }); expect(p.budget.bytes).toBe(0);
  expect(first.every(byte => byte === 0)).toBe(true); await expect(stream.next()).rejects.toThrow('Recording unavailable');
  expect(f.motion).toHaveBeenLastCalledWith(false, metadata); await f.delegate.stop();
});

test('a busy event cannot publish twice and an unopened/closed event is never claimed as delivered', async () => {
  const f = fixture(), a = prepared(), b = prepared(), policy = f.delegate.getPolicySnapshot();
  const first = f.delegate.deliverSavedClip(a.bundle, metadata, policy, new AbortController().signal);
  expect(await f.delegate.deliverSavedClip(b.bundle, metadata, policy, new AbortController().signal)).toEqual({ status: 'not-offered', reason: 'busy' });
  expect(f.motion.mock.calls.filter(([active]) => active)).toHaveLength(1);
  await jest.advanceTimersByTimeAsync(8000); expect(await first).toEqual({ status: 'uncertain' }); b.bundle.dispose();
  const p = prepared(), outcome = f.delegate.deliverSavedClip(p.bundle, metadata, f.delegate.getPolicySnapshot(), new AbortController().signal);
  const stream = f.delegate.handleRecordingStreamRequest(4); await stream.next(); f.delegate.closeRecordingStream(4);
  expect(p.budget.bytes).toBe(0); await jest.advanceTimersByTimeAsync(5000);
  expect(await outcome).toEqual({ status: 'uncertain' }); expect(p.budget.bytes).toBe(0); await f.delegate.stop();
});

test.each(['ordinary-close', 'no-ack'] as const)('transport ending releases media but preserves the planned motion span: %s', async ending => {
  const f = fixture(), p = prepared(20), next = prepared(), policy = f.delegate.getPolicySnapshot();
  const outcome = f.delegate.deliverSavedClip(p.bundle, metadata, policy, new AbortController().signal);
  let settled = false; void outcome.then(() => { settled = true; });
  for await (const _packet of f.delegate.handleRecordingStreamRequest(42)) { /* Consume all finite packets without ACK. */ }
  const elapsed = ending === 'ordinary-close' ? 1000 : 8000;
  await jest.advanceTimersByTimeAsync(elapsed);
  if (ending === 'ordinary-close') f.delegate.closeRecordingStream(42, 3);
  expect(p.budget.bytes).toBe(0); expect(p.bundle.disposed).toBe(true);
  expect(f.motion).toHaveBeenLastCalledWith(true, metadata); expect(settled).toBe(false);
  expect(await f.delegate.deliverSavedClip(next.bundle, metadata, policy, new AbortController().signal))
    .toEqual({ status: 'not-offered', reason: 'busy' }); next.bundle.dispose();
  f.delegate.acknowledgeStream(42); // A late ACK must not promote a closed/expired transport.
  await jest.advanceTimersByTimeAsync(20000 - elapsed - 1);
  expect(f.motion).toHaveBeenLastCalledWith(true, metadata); expect(settled).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect(await outcome).toEqual({ status: 'uncertain' }); expect(f.motion).toHaveBeenLastCalledWith(false, metadata);
  expect(f.motion.mock.calls.filter(([active]) => active)).toHaveLength(1); await f.delegate.stop();
});
