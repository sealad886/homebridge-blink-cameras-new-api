import { Buffer } from 'node:buffer';
import type { CameraRecordingConfiguration, RecordingPacket } from 'homebridge';
import { NativeRecordingDelegate, type NativeRecordingDeliveryMetadata } from '../src/accessories/native-recording-delegate';
import { type NativeRecordingSource, type PreparedNativeRecording, type prepareNativeRecording } from '../src/accessories/native-recording-preparation';

const configuration = (): CameraRecordingConfiguration => ({
  prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: 1000 },
  videoCodec: { type: 0, resolution: [320, 180, 15], parameters: { profile: 0, level: 0, bitRate: 300, iFrameInterval: 1000 } },
  audioCodec: { type: 0, samplerate: 1, audioChannels: 1, bitrateMode: 0, bitrate: 32 },
});
const source: NativeRecordingSource = { filePath: '/private/unused/file.mp4', expectedBytes: 1, expectedSha256: 'a'.repeat(64) };
function bundle(selected = configuration(), audioActive = false): PreparedNativeRecording {
  let disposed = false;
  const initialization = Buffer.from('initialization');
  const fragments = [{ data: Buffer.from('fragment-1'), startMs: 0, durationMs: 1000 },
    { data: Buffer.from('fragment-2'), startMs: 1000, durationMs: 500 }];
  return { initialization, fragments, configuration: selected, audioActive, bytes: 34, durationMs: 1500,
    sourceSha256: 'a'.repeat(64), preparedSha256: 'b'.repeat(64), get disposed() { return disposed; },
    dispose: jest.fn(() => { if (disposed) return; disposed = true; initialization.fill(0); for (const fragment of fragments) fragment.data.fill(0); }) };
}
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { resolve, promise }; };

describe('finite native recording delegate', () => {
  let delegates: NativeRecordingDelegate[];
  beforeEach(() => { delegates = []; jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-09T06:00:00Z')); });
  afterEach(async () => { await Promise.all(delegates.map(delegate => delegate.stop())); jest.useRealTimers(); });

  function setup(overrides: { readyMotion?: (active: boolean) => void; prepare?: typeof prepareNativeRecording } = {}) {
    const prepared: PreparedNativeRecording[] = [];
    const prepare = jest.fn<ReturnType<typeof prepareNativeRecording>, Parameters<typeof prepareNativeRecording>>().mockImplementation(async (_source, selected, audio) => {
      const value = bundle(selected, audio); prepared.push(value); return value;
    });
    const readyMotion = jest.fn(), deliveryOutcome = jest.fn(), policyChanged = jest.fn();
    const delegate = new NativeRecordingDelegate({ preparation: { admit: work => work() },
      prepare, readyMotion, deliveryOutcome, policyChanged, offerTimeoutMs: 1000, acknowledgementTimeoutMs: 1000, ...overrides });
    delegates.push(delegate);
    const enable = () => { delegate.updateRecordingConfiguration(configuration()); delegate.updateRecordingActive(true); };
    const metadata = (id = 'clip-1'): NativeRecordingDeliveryMetadata => ({ jobId: 'job-' + id, clipIdentity: id,
      capturedAt: '2026-11-09T05:59:00+00:00', policyEpoch: delegate.policy.epoch });
    return { delegate, prepare, prepared, readyMotion, deliveryOutcome, policyChanged, enable, metadata };
  }

  it('starts disabled and performs no preparation or trigger work until HomeKit has enabled a configuration', async () => {
    const f = setup();
    expect(await f.delegate.offerDownloaded(source, f.metadata())).toEqual({ status: 'not-offered', reason: 'disabled' });
    f.delegate.updateRecordingActive(true);
    expect(await f.delegate.offerDownloaded(source, f.metadata())).toEqual({ status: 'not-offered', reason: 'disabled' });
    expect(f.prepare).not.toHaveBeenCalled(); expect(f.readyMotion).not.toHaveBeenCalled();
  });

  it('prepares before publishing internal motion and allows one ready/active file per camera', async () => {
    const pending = deferred<PreparedNativeRecording>();
    const f = setup({ prepare: jest.fn().mockReturnValue(pending.promise) }); f.enable();
    const offer = f.delegate.offerDownloaded(source, f.metadata());
    expect(f.readyMotion).not.toHaveBeenCalled();
    expect(await f.delegate.offerDownloaded(source, f.metadata('clip-2'))).toEqual({ status: 'not-offered', reason: 'busy' });
    pending.resolve(bundle());
    expect(await offer).toEqual({ status: 'ready' });
    expect(f.readyMotion).toHaveBeenLastCalledWith(true);
    expect(await f.delegate.offerDownloaded(source, f.metadata('clip-3'))).toEqual({ status: 'not-offered', reason: 'busy' });
  });

  it.each(['preparing', 'ready', 'streaming'] as const)('rejects an invalid or throwing delivery authority while %s', async phase => {
    for (const throws of [false, true]) {
      const pending = deferred<PreparedNativeRecording>();
      const f = setup(phase === 'preparing' ? { prepare: jest.fn().mockReturnValue(pending.promise) } : {}); f.enable();
      let current = true;
      const authority = () => { if (!current && throws) throw new Error('Authority unavailable'); return current; };
      const offered = f.delegate.offerDownloaded(source, f.metadata(), authority);
      let value: PreparedNativeRecording;
      if (phase === 'preparing') {
        current = false; value = bundle(); pending.resolve(value);
        expect(await offered).toEqual({ status: 'not-offered', reason: 'policy-changed' });
        expect(f.readyMotion).not.toHaveBeenCalledWith(true);
      } else {
        expect(await offered).toEqual({ status: 'ready' }); value = f.prepared[0];
        const stream = f.delegate.handleRecordingStreamRequest(50);
        if (phase === 'streaming') expect((await stream.next()).value?.data.toString()).toBe('initialization');
        current = false;
        await expect(stream.next()).rejects.toThrow();
        expect(f.readyMotion).toHaveBeenLastCalledWith(false);
      }
      expect(value.disposed).toBe(true);
      expect(f.delegate.snapshot().bytes).toBe(0);
    }
  });

  it('keeps delivery available when tokens refresh within the same owning identity', async () => {
    const f = setup(); f.enable();
    const identity = { account: 10, client: 11, token: 'old-fixture-token' };
    const current = () => identity.account === 10 && identity.client === 11;
    expect(await f.delegate.offerDownloaded(source, f.metadata(), current)).toEqual({ status: 'ready' });
    identity.token = 'new-fixture-token';
    const stream = f.delegate.handleRecordingStreamRequest(51);
    expect((await stream.next()).value?.data.toString()).toBe('initialization');
    expect((await stream.next()).value?.data.toString()).toBe('fragment-1');
    const final = stream.next(); await jest.advanceTimersByTimeAsync(1000);
    expect((await final).value?.isLast).toBe(true);
    await stream.next(); f.delegate.acknowledgeStream(51);
    expect(f.prepared[0].disposed).toBe(true);
  });

  it('reports rejected Home requests even when no clip was offered', async () => {
    const f = setup(); f.enable();
    await expect(f.delegate.handleRecordingStreamRequest(1).next()).rejects.toThrow('No permitted prepared');
    expect(f.deliveryOutcome).toHaveBeenCalledWith({ metadata: undefined, outcome: 'request-rejected' });
  });

  it('streams initialization then paced finite fragments with exactly one final marker; ACK means transport acknowledgement', async () => {
    const f = setup(); f.enable(); await f.delegate.offerDownloaded(source, f.metadata());
    const stream = f.delegate.handleRecordingStreamRequest(7);
    const packets: RecordingPacket[] = [];
    packets.push((await stream.next()).value!); packets.push((await stream.next()).value!);
    expect(packets.map(packet => packet.data.toString())).toEqual(['initialization', 'fragment-1']);
    expect(packets.every(packet => !packet.isLast)).toBe(true);
    let resolved = false;
    const final = stream.next().then(value => { resolved = true; return value; });
    await jest.advanceTimersByTimeAsync(999); expect(resolved).toBe(false);
    await jest.advanceTimersByTimeAsync(1); packets.push((await final).value!);
    expect(packets[2]).toMatchObject({ isLast: true });
    expect((await stream.next()).done).toBe(true);
    expect(f.delegate.snapshot().state).toBe('awaiting-ack');
    expect(f.deliveryOutcome.mock.calls.map(([event]) => event.outcome)).toEqual(['requested', 'transfer-finished']);
    f.delegate.acknowledgeStream(7);
    expect(f.deliveryOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'transport-acknowledged' }));
    expect(f.prepared[0].disposed).toBe(true);
    expect(packets[0].data.toString()).toBe('initialization');
    expect(f.delegate.available).toBe(true);
  });

  it('reports finite transfer completion once when Home acknowledges before the generator resumes', async () => {
    const f = setup(); f.enable(); await f.delegate.offerDownloaded(source, f.metadata());
    const stream = f.delegate.handleRecordingStreamRequest(8);
    await stream.next(); await stream.next();
    const final = stream.next(); await jest.advanceTimersByTimeAsync(1000);
    expect((await final).value?.isLast).toBe(true);
    f.delegate.acknowledgeStream(8);
    expect(f.deliveryOutcome.mock.calls.map(([event]) => event.outcome))
      .toEqual(['requested', 'transfer-finished', 'transport-acknowledged']);
    expect(f.prepared[0].disposed).toBe(true);
    expect((await stream.next()).done).toBe(true);
    f.delegate.acknowledgeStream(8);
    expect(f.deliveryOutcome.mock.calls.filter(([event]) => event.outcome === 'transfer-finished')).toHaveLength(1);
  });

  it('ignores ACK before a final fragment and refuses simultaneous stream requests', async () => {
    const f = setup(); f.enable(); await f.delegate.offerDownloaded(source, f.metadata());
    const stream = f.delegate.handleRecordingStreamRequest(1); await stream.next();
    f.delegate.acknowledgeStream(1);
    expect(f.prepared[0].disposed).toBe(false);
    await expect(f.delegate.handleRecordingStreamRequest(2).next()).rejects.toThrow('No permitted prepared');
    f.delegate.closeRecordingStream(1, 0);
    expect((await stream.next()).done).toBe(true);
  });

  it('fences an old download after recording is disabled and re-enabled', async () => {
    const f = setup(); f.enable(); const old = f.metadata();
    f.delegate.updateRecordingActive(false); f.delegate.updateRecordingActive(true);
    expect(await f.delegate.offerDownloaded(source, old)).toEqual({ status: 'not-offered', reason: 'policy-changed' });
    expect(f.prepare).not.toHaveBeenCalled();
  });

  it('aborts queued preparation on privacy changes and erases a late completed bundle without publishing motion', async () => {
    const pending = deferred<PreparedNativeRecording>();
    const prepare = jest.fn<ReturnType<typeof prepareNativeRecording>, Parameters<typeof prepareNativeRecording>>().mockReturnValue(pending.promise);
    const f = setup({ prepare }); f.enable();
    const offer = f.delegate.offerDownloaded(source, f.metadata());
    const signal = prepare.mock.calls[0][3];
    f.delegate.updateCameraActive(false);
    expect(signal.aborted).toBe(true);
    const value = bundle(); pending.resolve(value);
    expect(await offer).toEqual({ status: 'not-offered', reason: 'policy-changed' });
    expect(value.disposed).toBe(true); expect(f.readyMotion).not.toHaveBeenCalled();
  });

  it('uses a detached selected configuration and preserves it for an already active recording', async () => {
    const f = setup(); f.enable(); await f.delegate.offerDownloaded(source, f.metadata());
    const stream = f.delegate.handleRecordingStreamRequest(3); await stream.next();
    const next = configuration(); next.videoCodec.parameters.bitRate = 450;
    f.delegate.updateRecordingConfiguration(next);
    expect(f.prepared[0].configuration.videoCodec.parameters.bitRate).toBe(300);
    expect((await stream.next()).value?.data.toString()).toBe('fragment-1');
    const final = stream.next(); await jest.advanceTimersByTimeAsync(1000);
    expect((await final).value?.isLast).toBe(true); await stream.next(); f.delegate.acknowledgeStream(3);
    await f.delegate.offerDownloaded(source, f.metadata('clip-2'));
    expect(f.prepare.mock.calls[1][1].videoCodec.parameters.bitRate).toBe(450);
  });

  it('retires an offered bundle when the negotiated configuration changes and disables invalid configurations', async () => {
    const f = setup(); f.enable(); await f.delegate.offerDownloaded(source, f.metadata());
    const changed = configuration(); changed.videoCodec.parameters.bitRate = 450;
    f.delegate.updateRecordingConfiguration(changed);
    expect(f.prepared[0].disposed).toBe(true); expect(f.readyMotion).toHaveBeenLastCalledWith(false);
    const invalid = configuration(); invalid.mediaContainerConfiguration.fragmentLength = 0;
    f.delegate.updateRecordingConfiguration(invalid);
    expect(f.delegate.policy.allowed).toBe(false);
    expect(await f.delegate.offerDownloaded(source, f.metadata('clip-2'))).toMatchObject({ status: 'not-offered', reason: 'disabled' });
  });

  it('stops audio-containing media immediately on audio revocation and never emits another fragment', async () => {
    const f = setup(); f.enable(); f.delegate.updateRecordingAudioActive(true);
    await f.delegate.offerDownloaded(source, f.metadata());
    const stream = f.delegate.handleRecordingStreamRequest(1); await stream.next(); await stream.next();
    const pending = stream.next();
    f.delegate.updateRecordingAudioActive(false);
    await expect(pending).rejects.toThrow('permission was revoked');
    expect(f.prepared[0].disposed).toBe(true);
    expect(f.deliveryOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'cancelled' }));
  });

  it('closes a paced stream promptly without waiting for its next fragment deadline', async () => {
    const f = setup(); f.enable(); await f.delegate.offerDownloaded(source, f.metadata());
    const stream = f.delegate.handleRecordingStreamRequest(1); await stream.next(); await stream.next();
    const pending = stream.next(); f.delegate.closeRecordingStream(1, 0);
    expect((await pending).done).toBe(true);
    expect(f.prepared[0].disposed).toBe(true);
    expect(f.deliveryOutcome).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: 'closed' }));
  });

  it('does not let a retired generator reset the next offer motion state', async () => {
    const f = setup(); f.enable(); await f.delegate.offerDownloaded(source, f.metadata());
    const old = f.delegate.handleRecordingStreamRequest(1); await old.next();
    f.delegate.closeRecordingStream(1, 0);
    await f.delegate.offerDownloaded(source, f.metadata('clip-2'));
    expect(f.readyMotion).toHaveBeenLastCalledWith(true);
    await old.return(undefined);
    expect(f.readyMotion).toHaveBeenLastCalledWith(true);
  });

  it('reports a motion-publication exception as uncertain and never retries that clip as unoffered', async () => {
    const f = setup({ readyMotion: active => { if (active) throw new Error('Observer failed after it might have published'); } }); f.enable();
    expect(await f.delegate.offerDownloaded(source, f.metadata())).toEqual({ status: 'uncertain', reason: 'motion-publication-failed' });
    expect(await f.delegate.offerDownloaded(source, f.metadata())).toEqual({ status: 'not-offered', reason: 'duplicate' });
    expect(f.prepared[0].disposed).toBe(true);
    expect(f.deliveryOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'uncertain' }));
  });

  it('handles immediate policy revocation from the ready observer without retaining media or a false ready result', async () => {
    let active: NativeRecordingDelegate;
    const f = setup({ readyMotion: value => { if (value) active.updateRecordingActive(false); } });
    active = f.delegate; f.enable();
    expect(await f.delegate.offerDownloaded(source, f.metadata())).toEqual({ status: 'uncertain', reason: 'policy-changed-after-offer' });
    expect(f.prepared[0].disposed).toBe(true);
    expect(f.delegate.policy.allowed).toBe(false);
  });

  it('expires an unrequested prepared offer and bounds acknowledgement waits', async () => {
    const f = setup(); f.enable(); await f.delegate.offerDownloaded(source, f.metadata());
    await jest.advanceTimersByTimeAsync(1000);
    expect(f.deliveryOutcome).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: 'not-requested' }));
    expect(f.prepared[0].disposed).toBe(true);
    await f.delegate.offerDownloaded(source, f.metadata('clip-2'));
    const stream = f.delegate.handleRecordingStreamRequest(1); await stream.next(); await stream.next();
    const final = stream.next(); await jest.advanceTimersByTimeAsync(1000); await final; await stream.next();
    await jest.advanceTimersByTimeAsync(1000);
    expect(f.deliveryOutcome).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: 'uncertain' }));
    expect(f.prepared[1].disposed).toBe(true);
  });

  it('keeps local preparation failures unoffered and retires all media on stop', async () => {
    const f = setup(); f.enable(); f.prepare.mockRejectedValueOnce(new Error('converter failed'));
    expect(await f.delegate.offerDownloaded(source, f.metadata())).toMatchObject({ status: 'not-offered', reason: 'preparation-failed' });
    expect(f.readyMotion).not.toHaveBeenCalled();
    await f.delegate.offerDownloaded(source, f.metadata());
    await f.delegate.stop();
    expect(f.prepared[0].disposed).toBe(true);
    expect(f.delegate.snapshot().state).toBe('stopped');
    f.delegate.updateRecordingActive(true);
    expect(await f.delegate.offerDownloaded(source, f.metadata('clip-3'))).toMatchObject({ status: 'not-offered', reason: 'disabled' });
  });

  it.each(['ready', 'streaming', 'awaiting-ack'] as const)('retires %s media for runtime handoff while preserving HomeKit policy and configuration', async state => {
    const f = setup(); f.enable(); f.delegate.updateRecordingAudioActive(true);
    const prior = f.delegate.policy, oldMetadata = f.metadata();
    await f.delegate.offerDownloaded(source, oldMetadata);
    if (state !== 'ready') {
      const stream = f.delegate.handleRecordingStreamRequest(1); await stream.next();
      if (state === 'awaiting-ack') {
        await stream.next(); const final = stream.next(); await jest.advanceTimersByTimeAsync(1000); await final; await stream.next();
      }
    }
    f.policyChanged.mockClear();
    await f.delegate.invalidateDelivery();
    expect(f.prepared[0].disposed).toBe(true);
    expect(f.delegate.policy).toEqual({ ...prior, epoch: prior.epoch + 1 });
    expect(f.delegate.snapshot().state).toBe('idle'); expect(f.delegate.available).toBe(true);
    expect(f.policyChanged).not.toHaveBeenCalled();
    expect(await f.delegate.offerDownloaded(source, oldMetadata)).toMatchObject({ status: 'not-offered', reason: 'policy-changed' });
    expect(await f.delegate.offerDownloaded(source, f.metadata())).toMatchObject({ status: 'not-offered', reason: 'duplicate' });
    expect(await f.delegate.offerDownloaded(source, f.metadata('fresh-clip'))).toEqual({ status: 'ready' });
    f.delegate.acknowledgeStream(1); expect(f.prepared[1].disposed).toBe(false);
    expect(f.prepare.mock.calls[1][1]).toEqual(configuration()); expect(f.prepare.mock.calls[1][2]).toBe(true);
  });

  it('drains aborted preparation at handoff and discards late media without a policy callback', async () => {
    const pending = deferred<PreparedNativeRecording>();
    const prepare = jest.fn<ReturnType<typeof prepareNativeRecording>, Parameters<typeof prepareNativeRecording>>()
      .mockReturnValueOnce(pending.promise).mockImplementation(async (_source, selected, audio) => bundle(selected, audio));
    const f = setup({ prepare }); f.enable();
    const oldOffer = f.delegate.offerDownloaded(source, f.metadata()); f.policyChanged.mockClear();
    let finished = false; const invalidating = f.delegate.invalidateDelivery().then(() => { finished = true; });
    expect(prepare.mock.calls[0][3].aborted).toBe(true); await Promise.resolve(); expect(finished).toBe(false);
    const value = bundle(); pending.resolve(value); await invalidating;
    expect(await oldOffer).toMatchObject({ status: 'not-offered', reason: 'policy-changed' });
    expect(value.disposed).toBe(true); expect(f.readyMotion).not.toHaveBeenCalled(); expect(f.policyChanged).not.toHaveBeenCalled();
    expect(await f.delegate.offerDownloaded(source, f.metadata('fresh-clip'))).toEqual({ status: 'ready' });
  });

  it('does not re-enable an explicitly disabled Home camera during delivery invalidation', async () => {
    const f = setup(); f.enable(); f.delegate.updateCameraActive(false); const prior = f.delegate.policy;
    await f.delegate.invalidateDelivery();
    expect(f.delegate.policy).toEqual({ ...prior, epoch: prior.epoch + 1 });
    expect(await f.delegate.offerDownloaded(source, f.metadata())).toMatchObject({ status: 'not-offered', reason: 'disabled' });
    f.delegate.updateCameraActive(true);
    expect(await f.delegate.offerDownloaded(source, f.metadata())).toEqual({ status: 'ready' });
  });
});
