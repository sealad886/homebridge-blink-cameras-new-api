/** Opt in only after building and verifying the local protocol-4 native artifacts. */
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import type { CameraRecordingConfiguration } from 'homebridge';
import { PrivateMediaWorker, type MediaWorkerCallbacks } from '../src/accessories/media-worker';
import { RecordingBufferBudget } from '../src/accessories/recording-buffer';
import { prepareSavedClip } from '../src/accessories/saved-clip-preparation';

const nativeTest = process.env.BLINK_SAVED_CLIP_NATIVE_TEST === '1' ? it : it.skip;
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const configuration = (fps = 15): CameraRecordingConfiguration => ({
  prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: 4000 },
  videoCodec: { type: 0, resolution: [640, 360, fps], parameters: { profile: 0, level: 0, bitRate: 300, iFrameInterval: 4000 } },
  audioCodec: { type: 0, samplerate: 1, bitrate: 16, audioChannels: 1, bitrateMode: 0 },
});
function verifiedArtifact(name: string, expectedHash: string): string {
  const path = resolve(__dirname, '../native/build', name), stat = lstatSync(path);
  expect(stat.isFile()).toBe(true); expect(stat.uid).toBe(process.getuid!()); expect(stat.mode & 0o022).toBe(0);
  expect(sha256(readFileSync(path))).toBe(expectedHash); return path;
}
const hostWorker = (callbacks: MediaWorkerCallbacks) => new PrivateMediaWorker(verifiedArtifact('blink-codec-worker',
  '72030775b40a52dc8181bb3b672c248401b6181fead36da8401c2477137a4439'), callbacks);

nativeTest('prepares a real synthetic finite MP4 through the canonical worker and retains its complete six-second event', async () => {
  const fixture = verifiedArtifact('fixture', '69497425bdb16d572a12b7561a4d1b44291365c605a5490cdad17b6f6549e3fc');
  const bytes = execFileSync(fixture, ['mp4-parameters', '16', '16', '15', '90'], { timeout: 5000, maxBuffer: 32 * 1024 * 1024 });
  const sourceSha256 = sha256(bytes), budget = new RecordingBufferBudget();
  const prepared = await prepareSavedClip({ bytes, expectedBytes: bytes.length, expectedSha256: sourceSha256 }, configuration(),
    false, new globalThis.AbortController().signal, { budget, workerFactory: hostWorker });
  try {
    expect(prepared.summary).toMatchObject({ decodedVideoFrames: 90, selectedVideoFrames: 90, encodedVideoFrames: 90,
      generatedAudioSamples: 0, audioRate: 0 });
    expect(prepared.fragments[0].sequence).toBe(0); expect(prepared.fragments.at(-1)!.endUs).toBe(6000000n);
    expect(prepared.fragments.length).toBeGreaterThan(1); expect(sha256(bytes)).toBe(sourceSha256);
    expect(sha256(Buffer.concat([prepared.pin.initialization, ...prepared.fragments.map(fragment => fragment.data)]))).toBe(prepared.preparedSha256);
    expect(budget.bytes).toBe(prepared.buffer.bytes);
  } finally { prepared.dispose(); bytes.fill(0); }
  expect(budget.bytes).toBe(0);
}, 130000);

nativeTest('prepares the preserved genuine raw original with all 1,801 pictures and bounded labelled audio tail padding', async () => {
  const path = resolve(__dirname, '../logs/hsv-validation-20261103/fresh-native-151555.mp4'), stat = lstatSync(path);
  expect(stat.isFile()).toBe(true); expect(stat.uid).toBe(process.getuid!()); expect(stat.mode & 0o777).toBe(0o600);
  const bytes = readFileSync(path), sourceSha256 = '710ec39697dd7937433e23f4f9b73334f64a03cf6a17b8db400a5aaf7ca9b637';
  expect(sha256(bytes)).toBe(sourceSha256);
  const budget = new RecordingBufferBudget();
  const prepared = await prepareSavedClip({ bytes, expectedBytes: 12260089, expectedSha256: sourceSha256 }, configuration(30),
    true, new globalThis.AbortController().signal, { budget, workerFactory: hostWorker });
  try {
    expect(prepared.summary).toMatchObject({ decodedVideoFrames: 1801, selectedVideoFrames: 1801, encodedVideoFrames: 1801,
      generatedAudioSamples: 9567, audioRate: 16000, inputFormat: 'mp4' });
    expect(prepared.fragments[0].sequence).toBe(0); expect(prepared.fragments.at(-1)!.endUs).toBeGreaterThan(60000000n);
    expect(prepared.preparedSpanUpperBoundUs).toBeGreaterThanOrEqual(prepared.fragments.at(-1)!.endUs);
    expect(prepared.fragments.map(fragment => fragment.sequence)).toEqual(Array.from({ length: prepared.fragments.length }, (_, i) => i));
    expect(sha256(bytes)).toBe(sourceSha256); expect(sha256(readFileSync(path))).toBe(sourceSha256);
    expect(budget.bytes).toBe(prepared.buffer.bytes);
  } finally { prepared.dispose(); bytes.fill(0); }
  expect(budget.bytes).toBe(0);
}, 130000);
