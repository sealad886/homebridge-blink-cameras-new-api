import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import type { CameraRecordingConfiguration } from 'homebridge';
import { PrivateMediaWorker, MEDIA_WORKER_LIMITS } from './media-worker';
import { loadPackagedMediaWorker } from './media-worker-artifact';
import type { FeedSink, FeedSubscription } from './shared-feed';
import type { RecordingSession, RecordingSessionCallbacks } from './camera-recording';

export type SubscribeRecordingFeed = (sink: FeedSink, signal: globalThis.AbortSignal) => Promise<FeedSubscription>;

/** Adapt the canonical private native worker to one recording generation. */
export async function startRecordingSession(
  subscribe: SubscribeRecordingFeed,
  configuration: CameraRecordingConfiguration,
  audioActive: boolean,
  callbacks: RecordingSessionCallbacks,
  owner: globalThis.AbortSignal,
): Promise<RecordingSession> {
  owner.throwIfAborted();
  const abort = new globalThis.AbortController();
  let subscription: FeedSubscription | undefined;
  let subscribing: Promise<FeedSubscription> | undefined;
  let worker: PrivateMediaWorker | undefined;
  let stopping: Promise<void> | undefined;
  let finish!: () => void;
  const whenClosed = new Promise<void>(resolve => { finish = resolve; });
  const stop = (): Promise<void> => {
    if (stopping) return stopping;
    abort.abort(); owner.removeEventListener('abort', cancelled);
    stopping = (async () => {
      void worker?.stop();
      const feed = subscription ?? await subscribing?.catch(() => undefined);
      await Promise.all([feed?.stop(), worker?.whenClosed]);
      finish();
    })();
    return stopping;
  };
  const cancelled = (): void => { void stop(); };
  const failed = (): void => {
    if (abort.signal.aborted) return;
    try { callbacks.failed('recording_media_unavailable'); }
    catch { /* Observer failures cannot prevent resource retirement. */ }
    finally { void stop(); }
  };
  owner.addEventListener('abort', cancelled, { once: true });
  try {
    const video = configuration.videoCodec;
    const [width, height, fps] = video.resolution;
    // This is a trusted, content-verified package artifact, never a user path.
    // eslint-disable-next-line no-undef -- Published CommonJS module.
    const path = loadPackagedMediaWorker(resolve(__dirname, '../..'));
    worker = new PrivateMediaWorker(path, {
      recordingInit: async data => { owner.throwIfAborted(); abort.signal.throwIfAborted(); callbacks.initialization(data); },
      recordingFragment: async fragment => {
        owner.throwIfAborted(); abort.signal.throwIfAborted();
        await callbacks.fragment({ sequence: fragment.sequence, startUs: BigInt(fragment.startUs),
          durationUs: BigInt(fragment.durationUs), keyframe: fragment.keyframeStart, data: fragment.data });
      },
      motion: event => {
        if (owner.aborted || abort.signal.aborted) return;
        callbacks.motion(event);
      },
    });
    void worker.whenClosed.then(() => { if (!abort.signal.aborted) failed(); });
    const rate = audioActive ? configuration.audioCodec.samplerate === 1 ? 16000 : configuration.audioCodec.samplerate === 2 ? 24000 : 0 : 0;
    if (audioActive && (!rate || configuration.audioCodec.type !== 0)) throw new Error('Recording audio unavailable');
    await worker.configureRecording({ width, height, fps, bitrate: video.parameters.bitRate * 1000,
      maxFrames: 9000, preset: 0, profile: video.parameters.profile, level: video.parameters.level,
      audioCodec: audioActive ? 4 : 0, audioRate: rate, audioBitrate: audioActive ? configuration.audioCodec.bitrate * 1000 : 0,
      fragmentMs: configuration.mediaContainerConfiguration.fragmentLength,
      iFrameIntervalMs: Math.min(1000, video.parameters.iFrameInterval) });
    await worker.whenReady; owner.throwIfAborted(); abort.signal.throwIfAborted();
    const media = worker;
    subscribing = subscribe({
      write: async bytes => {
        const copy = Buffer.from(bytes);
        try {
          for (let offset = 0; offset < copy.length; offset += MEDIA_WORKER_LIMITS.inputBytes) {
            abort.signal.throwIfAborted();
            await media.media(copy.subarray(offset, offset + MEDIA_WORKER_LIMITS.inputBytes));
          }
        } finally { copy.fill(0); }
      },
      end: async () => {
        await media.endMedia(); await media.whenMediaDrained; await media.finishInput();
      },
      fail: failed,
    }, abort.signal);
    subscription = await subscribing;
    owner.throwIfAborted(); abort.signal.throwIfAborted();
    return { whenClosed, stop };
  } catch {
    await stop();
    throw new Error('Recording session unavailable');
  }
}
