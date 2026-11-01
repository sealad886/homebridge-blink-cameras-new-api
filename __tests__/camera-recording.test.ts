import { Buffer } from 'node:buffer';
import { test } from '@jest/globals';
import type { CameraRecordingConfiguration } from 'homebridge';
import {
  BlinkCameraRecordingDelegate, CAMERA_RECORDING_LIMITS, createRecordingOptions,
  type RecordingSessionCallbacks, type RecordingStatus, type StartRecordingSession,
} from '../src/accessories/camera-recording';
import { RecordingBufferBudget, type RecordingFragment } from '../src/accessories/recording-buffer';

function box(name: string): Buffer {
  const data = Buffer.alloc(8); data.writeUInt32BE(8); data.write(name, 4, 'ascii'); return data;
}
const initialization = () => Buffer.concat([box('ftyp'), box('moov')]);
const fragment = (sequence: number): RecordingFragment => ({ sequence, startUs: BigInt(sequence) * 1000000n,
  durationUs: 1000000n, keyframe: true, data: Buffer.concat([box('moof'), box('mdat')]) });
const configuration = (): CameraRecordingConfiguration => ({
  prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: 4000 },
  videoCodec: { type: 0, parameters: { profile: 0, level: 0, bitRate: 500, iFrameInterval: 1000 }, resolution: [640, 360, 15] },
  audioCodec: { type: 0, samplerate: 1, audioChannels: 1, bitrateMode: 0, bitrate: 32 },
});
function deferred() {
  let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve };
}
const tick = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
function fixture(maximum?: number, closeOnStop = true) {
  const budget = new RecordingBufferBudget(maximum); const statuses: RecordingStatus[] = [];
  const sessions: Array<{ callbacks: RecordingSessionCallbacks; signal: globalThis.AbortSignal;
    configuration: CameraRecordingConfiguration; audio: boolean; stop: jest.Mock; closed: ReturnType<typeof deferred> }> = [];
  const start: StartRecordingSession = jest.fn(async (selected, audio, callbacks, signal) => {
    const closed = deferred(); const stop = jest.fn(async () => { if (closeOnStop) closed.resolve(); });
    sessions.push({ configuration: selected, audio, callbacks, signal, closed, stop });
    return { whenClosed: closed.promise, stop };
  });
  const videoMotion = jest.fn();
  const delegate = new BlinkCameraRecordingDelegate(start, { budget, retryMs: 1000, status: s => statuses.push(s), videoMotion });
  const activate = async () => { delegate.updateRecordingConfiguration(configuration()); delegate.updateRecordingActive(true); await tick(); };
  const warm = async (index = sessions.length - 1) => {
    const callbacks = sessions[index].callbacks; callbacks.initialization(initialization());
    for (let n = 0; n < 4; n++) await callbacks.fragment(fragment(n));
  };
  return { delegate, start, sessions, budget, statuses, activate, warm, videoMotion };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('video motion requires a ready current generation and stops immediately with camera permission', async () => {
  const f = fixture(); expect(f.delegate.videoMotionActive).toBe(false);
  await f.activate(); expect(f.delegate.videoMotionActive).toBe(true);
  const old = f.sessions[0].callbacks;
  old.motion({ atUs: 1000000, score: 100 }); expect(f.videoMotion).not.toHaveBeenCalled();
  await f.warm(); old.motion({ atUs: 4000000, score: 100 }); expect(f.videoMotion).toHaveBeenCalledTimes(1);
  f.delegate.setCameraActive(false); expect(f.delegate.videoMotionActive).toBe(false);
  old.motion({ atUs: 5000000, score: 100 }); expect(f.videoMotion).toHaveBeenCalledTimes(1);
  await tick(); f.delegate.setCameraActive(true); await tick(); await f.warm();
  old.motion({ atUs: 6000000, score: 100 }); expect(f.videoMotion).toHaveBeenCalledTimes(1);
  f.sessions[1].callbacks.motion({ atUs: 4000000, score: 100 }); expect(f.videoMotion).toHaveBeenCalledTimes(2);
  await f.delegate.stop();
});

test('rejects a container length that was not advertised to HomeKit', async () => {
  const f = fixture(), selected = configuration(); selected.mediaContainerConfiguration.fragmentLength = 1000;
  f.delegate.updateRecordingConfiguration(selected); f.delegate.updateRecordingActive(true); await tick();
  expect(f.start).not.toHaveBeenCalled();
  expect(f.statuses).toContainEqual({ state: 'fault', reason: 'invalid_configuration' });
  await f.delegate.stop();
});

test('capture requires both explicit recording activation and valid selected configuration', async () => {
  const f = fixture(); f.delegate.updateRecordingActive(true); await tick(); expect(f.start).not.toHaveBeenCalled();
  f.delegate.updateRecordingActive(false); f.delegate.updateRecordingConfiguration(configuration()); await tick();
  expect(f.start).not.toHaveBeenCalled(); f.delegate.updateRecordingActive(true); await tick();
  expect(f.start).toHaveBeenCalledTimes(1); expect(f.sessions[0].audio).toBe(false);
  expect(f.delegate.status.state).toBe('warming'); expect(f.delegate.notifyMotion()).toBe(false);
  await f.warm(); expect(f.delegate.ready).toBe(true); expect(f.delegate.status.state).toBe('ready');
  await f.delegate.stop(); expect(f.budget.bytes).toBe(0);
});

test.each([
  { triggers: [1], motion: true, doorbell: false },
  { triggers: [2], motion: false, doorbell: true },
  { triggers: [1, 2], motion: true, doorbell: true },
  { triggers: [], motion: false, doorbell: false },
])('only a trigger explicitly selected by HomeKit can reserve a clip: %p', async selection => {
  const f = fixture(); const c = configuration(); c.eventTriggerTypes = selection.triggers;
  f.delegate.updateRecordingConfiguration(c); f.delegate.updateRecordingActive(true); await tick(); await f.warm();
  expect(f.delegate.notifyMotion()).toBe(selection.motion); expect(f.delegate.notifyDoorbell()).toBe(selection.doorbell);
  expect(f.delegate.status.state).toBe(selection.motion || selection.doorbell ? 'recording' : 'ready'); await f.delegate.stop();
});

test('recording yields initialization, complete prebuffer, event tail and final packet before acknowledgement', async () => {
  const f = fixture(); await f.activate(); await f.warm(); expect(f.delegate.notifyMotion()).toBe(true);
  const stream = f.delegate.handleRecordingStreamRequest(4);
  expect((await stream.next()).value).toEqual({ data: initialization(), isLast: false });
  for (let n = 0; n < 4; n++) expect((await stream.next()).value).toEqual({ data: fragment(n).data, isLast: false });
  f.delegate.endMotion(); const waiting = stream.next(); await tick();
  await f.sessions[0].callbacks.fragment(fragment(4)); const last = await waiting;
  expect(last.value.isLast).toBe(true); expect(last.value.data).toEqual(fragment(4).data);
  expect((await stream.next()).done).toBe(true); expect(f.delegate.status.state).toBe('recording');
  f.delegate.acknowledgeStream(999); expect(f.delegate.status.state).toBe('recording');
  f.delegate.acknowledgeStream(4); await tick(); expect(f.delegate.status.state).toBe('ready');
  expect(f.sessions[0].stop).not.toHaveBeenCalled(); expect(f.budget.bytes).toBe(80);
  await f.delegate.stop();
});

test('a slow reader ends at the frozen event tail despite newer continuous prebuffer traffic', async () => {
  const f = fixture(); await f.activate(); await f.warm(); f.delegate.notifyMotion();
  const stream = f.delegate.handleRecordingStreamRequest(4); await stream.next(); f.delegate.endMotion();
  for (let sequence = 4; sequence < 9; sequence++) await f.sessions[0].callbacks.fragment(fragment(sequence));
  for (let n = 0; n < 4; n++) expect((await stream.next()).value.isLast).toBe(false);
  const last = await stream.next(); expect(last.value.isLast).toBe(true);
  expect((await stream.next()).done).toBe(true); f.delegate.acknowledgeStream(4);
  expect(f.sessions[0].stop).not.toHaveBeenCalled(); expect(f.delegate.ready).toBe(true); await f.delegate.stop();
});

test('complete short final fragment is delivered as the event tail without dropping trailing footage', async () => {
  const f = fixture(); await f.activate(); await f.warm(); f.delegate.notifyMotion(); f.delegate.endMotion();
  const stream = f.delegate.handleRecordingStreamRequest(4); for (let n = 0; n < 5; n++) await stream.next();
  const tail = { ...fragment(4), durationUs: 250000n }; await f.sessions[0].callbacks.fragment(tail);
  const last = await stream.next(); expect(last.value.data).toEqual(tail.data); expect(last.value.isLast).toBe(true);
  f.delegate.acknowledgeStream(4); await f.delegate.stop();
});

test.each(['camera', 'recording', 'device', 'configuration'] as const)('privacy revocation immediately clears media and cancels a waiting stream: %s', async reason => {
  const f = fixture(); await f.activate(); await f.warm(); f.delegate.notifyMotion();
  const stream = f.delegate.handleRecordingStreamRequest(5); const owned = [(await stream.next()).value.data as Buffer];
  for (let n = 0; n < 4; n++) owned.push((await stream.next()).value.data);
  const waiting = stream.next(); await tick();
  if (reason === 'camera') f.delegate.setCameraActive(false);
  if (reason === 'recording') f.delegate.updateRecordingActive(false);
  if (reason === 'device') f.delegate.setDeviceAvailable(false);
  if (reason === 'configuration') f.delegate.updateRecordingConfiguration(undefined);
  expect(f.sessions[0].signal.aborted).toBe(true); expect(f.budget.bytes).toBe(0);
  expect(owned.every(data => data.every(byte => byte === 0))).toBe(true); await expect(waiting).rejects.toThrow('Recording unavailable');
  await expect(f.sessions[0].callbacks.fragment(fragment(4))).rejects.toThrow('Recording unavailable');
  f.sessions[0].callbacks.initialization(initialization()); expect(f.budget.bytes).toBe(0);
  await tick(); expect(f.start).toHaveBeenCalledTimes(1); await f.delegate.stop();
});

test('audio revocation aborts old event and starts a fresh audio-free prebuffer', async () => {
  const f = fixture(); f.delegate.setAudioActive(true); await f.activate(); await f.warm(); f.delegate.notifyMotion();
  const stream = f.delegate.handleRecordingStreamRequest(7); const owned = (await stream.next()).value.data as Buffer;
  f.delegate.setAudioActive(false); expect(owned.every(byte => byte === 0)).toBe(true); await tick();
  expect(f.sessions.map(s => s.audio)).toEqual([true, false]); await expect(stream.next()).rejects.toThrow('Recording unavailable');
  expect(f.delegate.ready).toBe(false); expect(f.delegate.notifyMotion()).toBe(false);
  await f.warm(); expect(f.delegate.notifyMotion()).toBe(true); await f.delegate.stop();
});

test('selected format stays frozen for an in-flight event and changes after stream closes', async () => {
  const f = fixture(); await f.activate(); await f.warm(); f.delegate.notifyMotion();
  const stream = f.delegate.handleRecordingStreamRequest(8); await stream.next();
  const next = configuration(); next.videoCodec.resolution = [1280, 720, 15]; next.videoCodec.parameters.level = 1;
  f.delegate.updateRecordingConfiguration(next); next.videoCodec.resolution[0] = 2; await tick();
  expect(f.start).toHaveBeenCalledTimes(1); expect(f.sessions[0].configuration.videoCodec.resolution).toEqual([640, 360, 15]);
  f.delegate.closeRecordingStream(8); await tick(); expect(f.start).toHaveBeenCalledTimes(2);
  expect(f.sessions[1].configuration.videoCodec.resolution).toEqual([1280, 720, 15]);
  expect((await stream.next()).done).toBe(true); await f.delegate.stop();
});

test('missing motion reservation and duplicate concurrent stream fail without starting another capture', async () => {
  const f = fixture(); await f.activate(); await f.warm();
  await expect(f.delegate.handleRecordingStreamRequest(9).next()).rejects.toThrow('Recording unavailable');
  f.delegate.notifyMotion(); const stream = f.delegate.handleRecordingStreamRequest(9); await stream.next();
  await expect(f.delegate.handleRecordingStreamRequest(10).next()).rejects.toThrow('Recording unavailable');
  f.delegate.closeRecordingStream(10); expect(f.delegate.status.state).toBe('recording');
  f.delegate.closeRecordingStream(9); f.delegate.closeRecordingStream(9); f.delegate.acknowledgeStream(9);
  expect((await stream.next()).done).toBe(true); expect(f.sessions[0].stop).not.toHaveBeenCalled(); await f.delegate.stop();
});

test('unopened reservation expires without stopping a healthy prebuffer', async () => {
  const f = fixture(); await f.activate(); await f.warm(); f.delegate.notifyMotion();
  await jest.advanceTimersByTimeAsync(CAMERA_RECORDING_LIMITS.unopenedEventMs);
  expect(f.delegate.status.state).toBe('ready'); expect(f.sessions[0].stop).not.toHaveBeenCalled();
  await expect(f.delegate.handleRecordingStreamRequest(2).next()).rejects.toThrow('Recording unavailable');
  expect(f.delegate.notifyMotion()).toBe(true); await f.delegate.stop();
});

test('a hub that omits final acknowledgement releases its pin after a bounded wait', async () => {
  const f = fixture(); await f.activate(); await f.warm(); f.delegate.notifyMotion();
  const stream = f.delegate.handleRecordingStreamRequest(2); for (let n = 0; n < 5; n++) await stream.next();
  f.delegate.endMotion(); await f.sessions[0].callbacks.fragment(fragment(4));
  expect((await stream.next()).value.isLast).toBe(true);
  await jest.advanceTimersByTimeAsync(CAMERA_RECORDING_LIMITS.acknowledgeMs);
  expect(f.delegate.status.state).toBe('ready'); expect(f.sessions[0].stop).not.toHaveBeenCalled(); await f.delegate.stop();
});

test('capture that never produces a usable prebuffer fails startup and cleans up', async () => {
  const f = fixture(); await f.activate(); f.sessions[0].callbacks.initialization(initialization());
  await jest.advanceTimersByTimeAsync(CAMERA_RECORDING_LIMITS.startupMs);
  expect(f.delegate.status).toEqual({ state: 'fault', reason: 'startup_timeout' });
  expect(f.sessions[0].signal.aborted).toBe(true); expect(f.budget.bytes).toBe(0); await f.delegate.stop();
});

test('sequence discontinuity faults active clip, zeroes footage and rewarms after fixed backoff', async () => {
  const f = fixture(); await f.activate(); await f.warm(); f.delegate.notifyMotion();
  const stream = f.delegate.handleRecordingStreamRequest(2); const owned = (await stream.next()).value.data as Buffer;
  for (let n = 0; n < 4; n++) await stream.next(); const waiting = stream.next();
  const rejection = expect(waiting).rejects.toThrow('Recording unavailable');
  await expect(f.sessions[0].callbacks.fragment(fragment(5))).rejects.toThrow('Recording unavailable');
  await rejection; expect(f.delegate.status).toEqual({ state: 'fault', reason: 'discontinuity' });
  expect(owned.every(byte => byte === 0)).toBe(true); expect(f.budget.bytes).toBe(0);
  await jest.advanceTimersByTimeAsync(999); expect(f.start).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1); expect(f.start).toHaveBeenCalledTimes(2); expect(f.delegate.ready).toBe(false);
  await f.warm(); expect(f.delegate.ready).toBe(true); await f.delegate.stop();
});

test('slow reader cannot cause pinned media to silently exceed aggregate cap', async () => {
  const f = fixture(112); await f.activate(); await f.warm(); f.delegate.notifyMotion();
  const stream = f.delegate.handleRecordingStreamRequest(2); const owned = (await stream.next()).value.data as Buffer;
  await f.sessions[0].callbacks.fragment(fragment(4)); await f.sessions[0].callbacks.fragment(fragment(5));
  await expect(f.sessions[0].callbacks.fragment(fragment(6))).rejects.toThrow('Recording unavailable');
  expect(f.delegate.status).toEqual({ state: 'fault', reason: 'buffer_exhausted' }); expect(f.budget.bytes).toBe(0);
  expect(owned.every(byte => byte === 0)).toBe(true); await expect(stream.next()).rejects.toThrow('Recording unavailable');
  await f.delegate.stop();
});

test('stalled producer times out a waiting hub without declaring a complete clip', async () => {
  const f = fixture(); await f.activate(); await f.warm(); f.delegate.notifyMotion();
  const stream = f.delegate.handleRecordingStreamRequest(2); for (let n = 0; n < 5; n++) await stream.next();
  const waiting = stream.next(); const rejection = expect(waiting).rejects.toThrow('Recording unavailable');
  await jest.advanceTimersByTimeAsync(6000); await rejection;
  expect(f.delegate.status).toEqual({ state: 'fault', reason: 'recording_timeout' }); expect(f.budget.bytes).toBe(0);
  await f.delegate.stop();
});

test('worker rollover aborts clip and starts a new generation only after backoff', async () => {
  const f = fixture(); await f.activate(); await f.warm(); f.delegate.notifyMotion();
  f.sessions[0].closed.resolve(); await tick(); expect(f.delegate.status).toEqual({ state: 'fault', reason: 'discontinuity' });
  expect(f.budget.bytes).toBe(0); await jest.advanceTimersByTimeAsync(1000);
  expect(f.start).toHaveBeenCalledTimes(2); expect(f.delegate.ready).toBe(false); await f.delegate.stop();
});

test('shutdown timeout preserves old ownership barrier and prevents overlapping capture', async () => {
  const f = fixture(undefined, false); await f.activate(); await f.warm();
  f.delegate.setCameraActive(false); f.delegate.setCameraActive(true); await tick();
  expect(f.start).toHaveBeenCalledTimes(1); const stopping = f.delegate.stop();
  const rejection = expect(stopping).rejects.toThrow('Recording shutdown incomplete');
  await jest.advanceTimersByTimeAsync(CAMERA_RECORDING_LIMITS.closeMs); await rejection;
  expect(f.delegate.status).toEqual({ state: 'fault', reason: 'shutdown_timeout' }); expect(f.budget.bytes).toBe(0);
  f.sessions[0].closed.resolve(); await tick(); expect(f.start).toHaveBeenCalledTimes(1); await f.delegate.stop();
});

test('a rejected stop still waits for actual closure before permitting replacement', async () => {
  const f = fixture(undefined, false); await f.activate(); await f.warm();
  f.sessions[0].stop.mockRejectedValue(new Error('synthetic')); f.delegate.setAudioActive(true); await tick();
  expect(f.start).toHaveBeenCalledTimes(1); f.sessions[0].closed.resolve(); await tick();
  expect(f.start).toHaveBeenCalledTimes(2); f.sessions[1].closed.resolve(); await f.delegate.stop();
});

test('actual closure permits replacement even when stop itself remains pending', async () => {
  const f = fixture(undefined, false); await f.activate(); await f.warm();
  const neverStopped = deferred(); f.sessions[0].stop.mockReturnValue(neverStopped.promise);
  f.delegate.setAudioActive(true); await tick(); expect(f.start).toHaveBeenCalledTimes(1);
  f.sessions[0].closed.resolve(); await tick(); expect(f.start).toHaveBeenCalledTimes(2);
  neverStopped.resolve(); f.sessions[1].closed.resolve(); await f.delegate.stop();
});

test.each([
  (c: CameraRecordingConfiguration) => { c.audioCodec.type = 1; },
  (c: CameraRecordingConfiguration) => { c.videoCodec.resolution = [1920, 1080, 30]; },
  (c: CameraRecordingConfiguration) => { c.mediaContainerConfiguration.fragmentLength = 999; },
  (c: CameraRecordingConfiguration) => { c.videoCodec.parameters.bitRate = 8001; },
])('invalid selected configuration opens no media capability', async change => {
  const f = fixture(); const c = configuration(); change(c); f.delegate.updateRecordingActive(true);
  f.delegate.updateRecordingConfiguration(c); await tick(); expect(f.start).not.toHaveBeenCalled(); await f.delegate.stop();
});

test('advertised recording contract has four-second prebuffer and only AAC-LC mono', () => {
  const options = createRecordingOptions(); expect(options.prebufferLength).toBe(4000);
  expect(options.audio.codecs).toEqual([{ type: 0, audioChannels: 1, bitrateMode: 0, samplerate: [1, 2] }]);
});
