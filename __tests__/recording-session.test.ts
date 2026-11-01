import { Buffer } from 'node:buffer';
import type { CameraRecordingConfiguration } from 'homebridge';
import type { MediaWorkerCallbacks } from '../src/accessories/media-worker';
import type { FeedSink, FeedSubscription } from '../src/accessories/shared-feed';
import { startRecordingSession } from '../src/accessories/recording-session';

let mockCallbacks: MediaWorkerCallbacks;
let mockClose!: () => void;
let mockWorker: ReturnType<typeof worker>;
function worker() {
  return { whenClosed: new Promise<void>(resolve => { mockClose = resolve; }),
    whenReady: Promise.resolve(), whenMediaDrained: Promise.resolve(),
    configureRecording: jest.fn(async (values: unknown) => { void values; }), media: jest.fn(async (bytes: Buffer) => { void bytes; }),
    endMedia: jest.fn(async () => {}), finishInput: jest.fn(async () => {}), stop: jest.fn(async () => mockClose()) };
}
jest.mock('../src/accessories/media-worker-artifact', () => ({ loadPackagedMediaWorker: () => '/verified/worker' }));
jest.mock('../src/accessories/media-worker', () => ({
  MEDIA_WORKER_LIMITS: { inputBytes: 65536 },
  PrivateMediaWorker: jest.fn().mockImplementation((_path, callbacks) => { mockCallbacks = callbacks; return mockWorker; }),
}));

const configuration: CameraRecordingConfiguration = {
  prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: 4000 },
  videoCodec: { type: 0, resolution: [640, 360, 15], parameters: { profile: 0, level: 0, bitRate: 300, iFrameInterval: 4000 } },
  audioCodec: { type: 0, samplerate: 1, bitrate: 32, audioChannels: 1, bitrateMode: 0 },
};
const callbacks = () => ({ initialization: jest.fn(), fragment: jest.fn(async () => {}), motion: jest.fn(), failed: jest.fn() });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function feed() {
  let close!: () => void;
  const handle: FeedSubscription = { whenClosed: new Promise<void>(resolve => { close = resolve; }), stop: jest.fn(async () => close()) };
  return handle;
}
beforeEach(() => { mockWorker = worker(); });

it.each([false, true])('configures negotiated fMP4, forwards ordered fragments and bounds vendor writes (audio=%s)', async audio => {
  let sink!: FeedSink;
  const handle = feed(), cb = callbacks(), owner = new globalThis.AbortController();
  const session = await startRecordingSession(async next => { sink = next; return handle; }, configuration, audio, cb, owner.signal);
  expect(mockWorker.configureRecording).toHaveBeenCalledWith(expect.objectContaining({ audioCodec: audio ? 4 : 0,
    audioRate: audio ? 16000 : 0, fragmentMs: 4000, iFrameIntervalMs: 1000, bitrate: 300000 }));
  const copied: Buffer[] = [];
  mockWorker.media.mockImplementation(async bytes => { copied.push(Buffer.from(bytes)); });
  const bytes = Buffer.alloc(150000, 3); await sink.write(bytes);
  expect(copied.every(part => part.length <= 65536)).toBe(true); expect(Buffer.concat(copied)).toEqual(bytes);
  const init = Buffer.from('init'), data = Buffer.from('fragment');
  await mockCallbacks.recordingInit!(init, owner.signal);
  await mockCallbacks.recordingFragment!({ sequence: 1, startUs: 0, durationUs: 1000000, keyframeStart: true, data }, owner.signal);
  expect(cb.initialization).toHaveBeenCalledWith(init);
  expect(cb.fragment).toHaveBeenCalledWith({ sequence: 1, startUs: 0n, durationUs: 1000000n, keyframe: true, data });
  mockCallbacks.motion!({ atUs: 1000000, score: 100 }, owner.signal);
  expect(cb.motion).toHaveBeenCalledWith({ atUs: 1000000, score: 100 });
  await session.stop(); await session.whenClosed; expect(handle.stop).toHaveBeenCalled();
  mockCallbacks.motion!({ atUs: 2000000, score: 100 }, owner.signal); expect(cb.motion).toHaveBeenCalledTimes(1);
});

it('adopts and stops a feed that arrives after owner cancellation', async () => {
  let adopt!: (handle: FeedSubscription) => void;
  const subscribe = jest.fn(() => new Promise<FeedSubscription>(resolve => { adopt = resolve; }));
  const owner = new globalThis.AbortController(), handle = feed();
  const pending = startRecordingSession(subscribe, configuration, false, callbacks(), owner.signal);
  await flush(); expect(subscribe).toHaveBeenCalledTimes(1);
  owner.abort(); adopt(handle); await expect(pending).rejects.toThrow('Recording session unavailable');
  expect(handle.stop).toHaveBeenCalledTimes(1); expect(mockWorker.stop).toHaveBeenCalledTimes(1);
});

it('retires capture even when its failure observer throws', async () => {
  let sink!: FeedSink;
  const handle = feed(), cb = callbacks(); cb.failed.mockImplementation(() => { throw new Error('private observer failure'); });
  const session = await startRecordingSession(async next => { sink = next; return handle; }, configuration, false, cb, new globalThis.AbortController().signal);
  expect(() => sink.fail()).not.toThrow(); await session.whenClosed;
  expect(handle.stop).toHaveBeenCalledTimes(1); expect(mockWorker.stop).toHaveBeenCalledTimes(1);
  expect(cb.failed).toHaveBeenCalledWith('recording_media_unavailable');
});
