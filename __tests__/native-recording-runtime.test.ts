import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { setImmediate as realImmediate } from 'node:timers/promises';
import type { CameraRecordingConfiguration } from 'homebridge';
import type { BlinkApi, BlinkRemoteOperationOwnership } from '../src/blink-api/client';
import { BLINK_FIREBASE_CLIENT } from '../src/blink-api/fcm-config';
import { BlinkHttpError } from '../src/blink-api/http';
import type { FcmEventSourceOptions } from '../src/blink-api/fcm/source';
import type { FcmNotification, FcmReceiverState } from '../src/blink-api/fcm/types';
import type { NativeStorageTransport } from '../src/blink-api/native-storage';
import { writeOwnerOnlyJsonFile } from '../src/blink-api/secure-json-file';
import { NativeRecordingDelegate } from '../src/accessories/native-recording-delegate';
import type { PreparedNativeRecording, prepareNativeRecording } from '../src/accessories/native-recording-preparation';
import { resolveNativeRecordingConfig, type NativeRecordingConfigInput } from '../src/native-recording-config';
import { NativeRecordingRuntime, type NativeRecordingRuntimeOptions, type NativeRecordingRuntimeState } from '../src/native-recording-runtime';

const scope = { accountId: 10, clientId: 11, tier: 'u000' };
const configuration = (): CameraRecordingConfiguration => ({
  prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: 1000 },
  videoCodec: { type: 0, resolution: [320, 180, 15], parameters: { profile: 0, level: 0, bitRate: 300, iFrameInterval: 1000 } },
  audioCodec: { type: 0, samplerate: 1, audioChannels: 1, bitrateMode: 0, bitrate: 32 },
});
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { resolve, promise }; };

/** Real local I/O settles independently of simulated provider/HAP deadlines. */
async function until(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = jest.getRealSystemTime() + 3000;
  while (!await predicate()) {
    if (jest.getRealSystemTime() > deadline) throw new Error('Local runtime did not settle');
    await realImmediate(); await jest.advanceTimersByTimeAsync(0);
  }
}

function prepared(selected: CameraRecordingConfiguration, audioActive: boolean): PreparedNativeRecording {
  let disposed = false;
  return { initialization: Buffer.from('initialization'), fragments: [{ data: Buffer.from('complete-native-video'), startMs: 0, durationMs: 1000 }],
    configuration: selected, audioActive, bytes: 35, durationMs: 1000, sourceSha256: 'a'.repeat(64), preparedSha256: 'b'.repeat(64),
    get disposed() { return disposed; }, dispose: () => { disposed = true; } };
}

describe('native recording runtime composition', () => {
  const itIfPosix = process.platform === 'win32' || typeof process.getuid !== 'function' ? it.skip : it;
  let root: string;
  let runtimes: NativeRecordingRuntime[];
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-runtime-')); runtimes = [];
    jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-09T06:00:00Z'));
  });
  afterEach(async () => {
    await Promise.all(runtimes.map(runtime => runtime.stop()));
    jest.useRealTimers(); await fs.rm(root, { recursive: true, force: true });
  });

  async function setup(overrides: { config?: NativeRecordingConfigInput; exposure?: boolean; hsv?: boolean;
    prepare?: typeof prepareNativeRecording; storagePath?: string; nativeStorage?: boolean; secondCamera?: boolean } = {}) {
    let runtime: NativeRecordingRuntime | undefined, source!: FcmEventSourceOptions;
    let remoteSave!: (state: BlinkRemoteOperationOwnership) => Promise<void>;
    let directory = '', nextCommand = 100, insideProvider = false;
    const events: string[] = [], publicMotion = jest.fn(), readyMotion = jest.fn();
    const media = [{ id: 101, network_id: 20, device_name: 'Entry native name', created_at: new Date(Date.now()).toISOString(),
      media: '/api/v1/accounts/10/networks/20/sync_modules/30/local_storage/manifest/91/clip/request/101/' }];
    const prepare = jest.fn<ReturnType<typeof prepareNativeRecording>, Parameters<typeof prepareNativeRecording>>().mockImplementation(async (input, selected, audioActive) => {
      expect(insideProvider).toBe(false);
      expect((await fs.readFile(input.filePath)).length).toBe(input.expectedBytes);
      return prepared(selected, audioActive);
    });
    const delegate = new NativeRecordingDelegate({ preparation: { admit: work => work() },
      prepare: overrides.prepare ?? prepare, readyMotion,
      policyChanged: policy => runtime?.policyChanged('camera:40', policy),
      deliveryOutcome: event => runtime?.deliveryOutcome(event.outcome) });
    delegate.updateRecordingConfiguration(configuration()); delegate.updateRecordingActive(true);
    const cornerReady = jest.fn();
    const cornerDelegate = overrides.secondCamera ? new NativeRecordingDelegate({
      preparation: { admit: work => work() }, prepare, readyMotion: cornerReady,
      policyChanged: policy => runtime?.policyChanged('camera:41', policy), deliveryOutcome: event => runtime?.deliveryOutcome(event.outcome),
    }) : undefined;
    cornerDelegate?.updateRecordingConfiguration(configuration()); cornerDelegate?.updateRecordingActive(true);
    const state = async () => JSON.parse(await fs.readFile(path.join(runtime!.directory, 'state.json'), 'utf8')) as NativeRecordingRuntimeState;
    const transport: jest.Mocked<NativeStorageTransport> = {
      postEmpty: jest.fn<ReturnType<NativeStorageTransport['postEmpty']>, Parameters<NativeStorageTransport['postEmpty']>>().mockImplementation(async () => {
        // Both the scheduler intent and the exact module command intent must be durable before POST.
        const saved = await state();
        expect(saved.core?.operation?.status).toBe('active');
        expect(saved.nativeByModule['20:30'].state.operation?.phase).toBe('intent');
        return { id: nextCommand++ };
      }),
      getJson: jest.fn<ReturnType<NativeStorageTransport['getJson']>, Parameters<NativeStorageTransport['getJson']>>().mockImplementation(async route => route.base === 'root' ? { complete: true, status: 0, commands: [{ id: 200 }] } :
        { manifest_id: 91, media, page_size: 1000, pagination_key: null }),
      validateMediaUrl: jest.fn(value => value),
      downloadMedia: jest.fn<ReturnType<NativeStorageTransport['downloadMedia']>, Parameters<NativeStorageTransport['downloadMedia']>>().mockImplementation(async location => {
        const bytes = Buffer.from(`downloaded ${location}`), reference = path.join(directory, `clip-${nextCommand}.mp4`);
        await fs.writeFile(reference, bytes, { mode: 0o600, flag: 'wx' });
        return { reference, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
      }),
    };
    const setDemand = jest.fn().mockResolvedValue(undefined), stopSource = jest.fn().mockResolvedValue(undefined);
    const client = {
      getCachedIdentity: jest.fn(() => ({ ...scope, sharedTier: 'u001' })),
      getRemoteOperationState: jest.fn<ReturnType<BlinkApi['getRemoteOperationState']>, []>()
        .mockReturnValue({ storage: [], persistenceFailed: false }),
      registerMotionNotificationKey: jest.fn().mockResolvedValue(undefined),
      createNativeStorageTransport: jest.fn((options: { directory: string }) => { directory = options.directory; return transport; }),
      withNativeStorageAdmission: jest.fn(async <T>(_id: string, work: () => Promise<T>) => {
        insideProvider = true; try { return await work(); } finally { insideProvider = false; }
      }),
      setNativeStorageOwner: jest.fn(),
      configureRemoteOperationOwnership: jest.fn((options: { saveState: (state: BlinkRemoteOperationOwnership) => Promise<void> }) => { remoteSave = options.saveState; }),
      reconcileKnownStateCommand: jest.fn().mockResolvedValue({ confirmed: true }),
    };
    const options: NativeRecordingRuntimeOptions = { client: client as unknown as BlinkApi, scope, storagePath: overrides.storagePath ?? root,
      config: resolveNativeRecordingConfig(overrides.config), firebase: BLINK_FIREBASE_CLIENT, appVersion: '61.0', report: event => events.push(event),
      devices: [{ binding: { accountId: 10, networkId: 20, providerId: 40, target: 'camera', cameraId: 'camera:40', nativeName: 'Entry native name' },
        ...(overrides.nativeStorage === false ? {} : { nativeStorage: { moduleId: '20:30', syncModuleId: 30 } }),
        settings: { exposeMotionDetected: overrides.exposure ?? true, homeKitSecureVideo: overrides.hsv ?? true },
        motion: publicMotion, recording: () => delegate }, ...(cornerDelegate ? [{
        binding: { accountId: 10, networkId: 20, providerId: 41, target: 'camera', cameraId: 'camera:41', nativeName: 'Corner native name' },
        nativeStorage: { moduleId: '20:30', syncModuleId: 30 }, settings: { exposeMotionDetected: true, homeKitSecureVideo: true },
        motion: jest.fn(), recording: () => cornerDelegate,
      }] : [])],
      eventSourceFactory: input => { source = input; return { setDemand, stop: stopSource }; },
    };
    runtime = await NativeRecordingRuntime.create(options); runtimes.push(runtime); await runtime.start();
    const notification = (id = 'motion-1', values: Record<string, string> = {}): FcmNotification => ({
      persistentMessageId: id, scope, receivedAt: Date.now(), activatedAt: Date.now(),
      data: { category: 'motion', event_type: 'cam2sm_motion', camera: '40', target: 'camera', network: '20',
        created_at: new Date(Date.now()).toISOString(), ...values },
    });
    const push = (message = notification()) => source.onNotification(message, new globalThis.AbortController().signal);
    return { runtime, delegate, prepare, transport, client, source, setDemand, stopSource, events, publicMotion, readyMotion,
      media, notification, push, state, remoteSave, cornerReady };
  }

  it('does no idle storage work and subscribes when either motion exposure or HSV is selected', async () => {
    const f = await setup({ exposure: false });
    expect(f.setDemand).toHaveBeenCalledWith({ motionAccessory: false, hsv: true });
    await jest.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(f.transport.postEmpty).not.toHaveBeenCalled(); expect(f.transport.getJson).not.toHaveBeenCalled();
    expect(f.transport.downloadMedia).not.toHaveBeenCalled();
    const motionOnly = await setup({ hsv: false, storagePath: path.join(root, 'motion-only') });
    expect(motionOnly.setDemand).toHaveBeenCalledWith({ motionAccessory: true, hsv: false });
    await motionOnly.push(); await jest.advanceTimersByTimeAsync(60_000);
    expect(motionOnly.publicMotion).toHaveBeenCalledTimes(1); expect(motionOnly.transport.postEmpty).not.toHaveBeenCalled();
    const disabled = await setup({ exposure: false, hsv: false, storagePath: path.join(root, 'disabled') });
    expect(disabled.setDemand).toHaveBeenCalledWith({ motionAccessory: false, hsv: false });
  });

  it('reports PIR immediately, then downloads once and only triggers HSV after local preparation', async () => {
    const f = await setup();
    await f.push(); await f.push();
    expect(f.publicMotion).toHaveBeenCalled(); expect(f.readyMotion).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(59_999);
    expect(f.transport.postEmpty).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1); await until(() => f.events.includes('offered'));
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
    expect(f.transport.getJson).toHaveBeenCalledTimes(3);
    expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
    expect(f.prepare).toHaveBeenCalledTimes(1); expect(f.readyMotion).toHaveBeenLastCalledWith(true);
    expect(f.events).toEqual(expect.arrayContaining(['downloaded', 'prepared', 'offered']));
    expect(f.events.some(event => event.includes('retained'))).toBe(false);
    const stream = f.delegate.handleRecordingStreamRequest(7);
    expect((await stream.next()).value?.isLast).toBe(false);
    expect((await stream.next()).value?.isLast).toBe(true);
    expect((await stream.next()).done).toBe(true);
    f.delegate.acknowledgeStream(7);
    expect(f.events).toContain('home-transport-acknowledged');
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(2); expect(f.transport.getJson).toHaveBeenCalledTimes(3);
    expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
    await until(async () => (await f.state()).downloads.length === 0);
    expect((await fs.stat(f.runtime.directory)).mode & 0o777).toBe(0o700);
    expect((await fs.stat(path.join(f.runtime.directory, 'state.json'))).mode & 0o777).toBe(0o600);
    expect((await f.state()).consumed).toHaveLength(1);
  });

  it('supports cloud motion without a Sync Module and without native acquisition', async () => {
    const f = await setup({ nativeStorage: false });
    const message = f.notification('cloud', { event_type: 'cloud_motion' }); delete (message.data as Record<string, string>).network;
    await f.push(message); await jest.advanceTimersByTimeAsync(120_000);
    expect(f.publicMotion).toHaveBeenCalledTimes(1);
    expect(f.transport.postEmpty).not.toHaveBeenCalled(); expect(f.prepare).not.toHaveBeenCalled();
  });

  it('keeps missing retries local until the independent catalog cooldown permits another prepare', async () => {
    const f = await setup({ config: { maxRetries: 1 } }); f.media.length = 0;
    await f.push(); await jest.advanceTimersByTimeAsync(60_000);
    await until(async () => (await f.state()).core?.queue[0]?.attempts === 1 && !(await f.state()).core?.operation);
    await jest.advanceTimersByTimeAsync(59_999);
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1); await until(() => f.events.includes('job-exhausted'));
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
    expect(f.transport.downloadMedia).not.toHaveBeenCalled();
  });

  it('uses a completed shared catalog for ready Entry while missing Corner waits for its retry cooldown', async () => {
    const f = await setup({ secondCamera: true, config: { maxRetries: 1 } });
    await f.push(f.notification('corner-first', { camera: '41' })); await f.push(f.notification('entry-second'));
    await jest.advanceTimersByTimeAsync(60_000); await until(() => f.events.includes('offered'));
    expect(f.readyMotion).toHaveBeenCalledWith(true); expect(f.cornerReady).not.toHaveBeenCalledWith(true);
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(2); // One catalog and Entry's clip, never a second catalog for Entry.
    expect(f.transport.getJson.mock.calls.filter(([route]) => route.base === 'api')).toHaveLength(1);
    expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(59_999); expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1); await until(() => f.events.includes('job-exhausted'));
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(3);
    expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
  });

  it('retains a lost-ack command fence through later motion, long waits, and restart', async () => {
    const f = await setup(); f.transport.postEmpty.mockRejectedValue(new Error('Acknowledgement lost after dispatch'));
    await f.push(); await jest.advanceTimersByTimeAsync(60_000);
    await until(async () => (await f.state()).core?.operation?.status === 'unresolved');
    await f.push(f.notification('motion-2')); await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
    await f.runtime.stop();
    const restored = await setup();
    await restored.push(restored.notification('motion-3')); await jest.advanceTimersByTimeAsync(60_000);
    expect(restored.transport.postEmpty).not.toHaveBeenCalled(); expect(restored.transport.getJson).not.toHaveBeenCalled();
    const saved = await restored.state();
    expect(saved.core?.queue[0].cancelled).toBe(true);
    expect(saved.nativeByModule['20:30'].state.operation?.phase).toBe('intent');
  });

  it.each(['ordinary', 'liveView'] as const)('waits using cached %s ownership without requests, then resumes after its terminal release', async kind => {
    const f = await setup();
    f.client.getRemoteOperationState.mockReturnValue({ storage: [], persistenceFailed: false,
      ...(kind === 'ordinary' ? { stateCommand: { reservationId: 'ordinary', accountId: 10, networkId: 20,
        kind: 'arm', phase: 'accepted', commandId: 70, statusReads: 1 } as const } :
        { liveView: { reservationId: 'manual-live-view', accountId: 10, networkId: 20, deviceId: 40,
          kind: 'camera', phase: 'active', commandId: 71, retirementAcknowledged: false } as const }) });
    await f.push(); await jest.advanceTimersByTimeAsync(120_000);
    expect(f.transport.postEmpty).not.toHaveBeenCalled(); expect(f.transport.getJson).not.toHaveBeenCalled();
    expect(f.client.withNativeStorageAdmission).not.toHaveBeenCalled(); expect((await f.state()).core?.queue[0].attempts).toBe(0);
    f.client.getRemoteOperationState.mockReturnValue({ storage: [], persistenceFailed: false });
    await jest.advanceTimersByTimeAsync(1000); await until(() => f.events.includes('offered'));
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(2); expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
  });

  it('retains unknown storage ownership and expires undispatched backlog without probing or resetting the owner', async () => {
    const f = await setup({ config: { maxJobAgeSeconds: 120 } });
    const remote: ReturnType<BlinkApi['getRemoteOperationState']> = { storage: [{ accountId: 10, networkId: 20, syncModuleId: 30,
      operationId: 'lost-ack', kind: 'catalog', phase: 'intent' }], persistenceFailed: false };
    f.client.getRemoteOperationState.mockReturnValue(remote);
    await f.push(); await jest.advanceTimersByTimeAsync(120_000); await until(() => f.events.includes('job-expired'));
    expect(f.transport.postEmpty).not.toHaveBeenCalled(); expect(f.transport.getJson).not.toHaveBeenCalled();
    expect(f.client.getRemoteOperationState()).toEqual(remote);
  });

  it('requeues a definite admission race within the bounded retry budget without imposing a catalog cooldown on an unsent request', async () => {
    const f = await setup();
    f.client.withNativeStorageAdmission.mockRejectedValueOnce(Object.assign(new Error('Local owner won admission'), { dispatched: false }));
    await f.push(); await jest.advanceTimersByTimeAsync(60_000);
    await until(async () => f.events.includes('catalog-not-started') && !(await f.state()).core?.operation);
    expect(f.transport.postEmpty).not.toHaveBeenCalled(); expect((await f.state()).core?.queue[0].attempts).toBe(1);
    expect((await f.state()).catalogStartedAt['20:30']).toBeUndefined();
    await jest.advanceTimersByTimeAsync(4999); expect(f.transport.postEmpty).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1); await until(() => f.events.includes('offered'));
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
    expect(f.client.withNativeStorageAdmission).toHaveBeenCalledTimes(3);
  });

  it.each(['catalog', 'clip'] as const)('backs off a definite %s POST refusal without holding unknown ownership or repeating POSTs every five seconds', async kind => {
    const f = await setup(), refused = new BlinkHttpError('Sync Module busy', 409, '', 'https://rest-u000.immedia-semi.com/api/v1/example', 'POST');
    const original = f.transport.postEmpty.getMockImplementation()!;
    if (kind === 'clip') f.transport.postEmpty.mockImplementationOnce(original);
    f.transport.postEmpty.mockRejectedValueOnce(refused);
    await f.push(); await jest.advanceTimersByTimeAsync(60_000);
    await until(async () => f.events.includes(kind === 'clip' ? 'download-refused' : 'catalog-refused') && !(await f.state()).core?.operation);
    const saved = await f.state();
    expect(saved.refusedUntil['20:30']).toBe(Date.now() + 60_000);
    expect(saved.nativeByModule['20:30'].state.operation).toMatchObject({ phase: 'finished', result: { status: 'failed', reason: 'refused', httpStatus: 409 } });
    expect(saved.core?.queue[0].attempts).toBe(1);
    await jest.advanceTimersByTimeAsync(59_999);
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(kind === 'clip' ? 2 : 1);
    await jest.advanceTimersByTimeAsync(1); await until(() => f.events.includes('offered'));
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(3); expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
    expect(f.transport.postEmpty.mock.calls.filter(([route]) => route.path.endsWith('/manifest/request'))).toHaveLength(kind === 'clip' ? 1 : 2);
  });

  it('cancels queued work when HomeKit permission is revoked and never replays it after re-enabling', async () => {
    const f = await setup(); await f.push();
    f.delegate.updateCameraActive(false);
    await until(async () => (await f.state()).core?.queue.length === 0);
    f.delegate.updateCameraActive(true);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(f.transport.postEmpty).not.toHaveBeenCalled(); expect(f.readyMotion).not.toHaveBeenCalled();
    await f.push(f.notification('fresh-motion')); f.media[0].created_at = new Date(Date.now()).toISOString();
    await jest.advanceTimersByTimeAsync(60_000); await until(() => f.events.includes('offered'));
    expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
  });

  it('fences late local preparation after a permission change while keeping provider work already terminal', async () => {
    const pending = deferred<PreparedNativeRecording>();
    const prepare = jest.fn<ReturnType<typeof prepareNativeRecording>, Parameters<typeof prepareNativeRecording>>().mockReturnValue(pending.promise);
    const f = await setup({ prepare }); await f.push(); await jest.advanceTimersByTimeAsync(60_000);
    await until(() => prepare.mock.calls.length === 1);
    expect((await f.state()).nativeByModule['20:30'].state.operation?.phase).toBe('finished');
    f.delegate.updateRecordingActive(false); f.delegate.updateRecordingActive(true);
    const value = prepared(configuration(), false); pending.resolve(value);
    await until(() => value.disposed);
    expect(f.readyMotion).not.toHaveBeenCalledWith(true); expect(f.events).not.toContain('offered');
  });

  it('discards pre-restart queued jobs and owned old downloads while preserving unknown files', async () => {
    const f = await setup(); await f.push(); await f.runtime.stop();
    const saved = await f.state(), bytes = Buffer.from('prior permission period'), reference = path.join(f.runtime.cacheDirectory, 'old-owned.mp4');
    await fs.writeFile(reference, bytes, { mode: 0o600 });
    await fs.writeFile(path.join(f.runtime.cacheDirectory, 'unknown.mp4'), 'preserve');
    await fs.writeFile(path.join(f.runtime.cacheDirectory, '.DS_Store'), 'preserve');
    saved.downloads.push({ reference, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), identity: 'old', capturedAt: new Date().toISOString(),
      moduleId: '20:30', cameraId: 'camera:40', jobId: 'old', policyEpoch: 0, cameraGeneration: 0 });
    await writeOwnerOnlyJsonFile(path.join(f.runtime.directory, 'state.json'), saved);
    const restored = await setup(); await jest.advanceTimersByTimeAsync(120_000);
    expect(restored.transport.postEmpty).not.toHaveBeenCalled(); expect(restored.readyMotion).not.toHaveBeenCalledWith(true);
    await expect(fs.stat(reference)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readFile(path.join(restored.runtime.cacheDirectory, 'unknown.mp4'), 'utf8')).toBe('preserve');
    expect(await fs.readFile(path.join(restored.runtime.cacheDirectory, '.DS_Store'), 'utf8')).toBe('preserve');
  });

  it('preserves concurrent push, core, module, and ordinary ownership saves in one account state', async () => {
    const f = await setup(); await f.push();
    const push: FcmReceiverState = { version: 1, scope, firebase: BLINK_FIREBASE_CLIENT, persistentIds: ['saved-push'] };
    const ordinary: BlinkRemoteOperationOwnership = { stateCommand: { reservationId: 'ordinary', accountId: 10, networkId: 20,
      kind: 'arm', phase: 'unresolved', commandId: 70, statusReads: 1 } };
    await Promise.all([f.source.saveState(push), f.remoteSave(ordinary), jest.advanceTimersByTimeAsync(60_000)]);
    await until(() => f.events.includes('offered'));
    const saved = await f.state();
    expect(saved.push?.persistentIds).toEqual(['saved-push']);
    expect(saved.remoteOperations).toEqual(ordinary);
    expect(saved.nativeByModule['20:30'].state.operation?.phase).toBe('finished');
    expect(saved.core?.rememberedEvents).toHaveLength(1);
  });

  it('rejects foreign source scope, aborted handoff, and binding after cached client identity changes', async () => {
    const f = await setup(), message = f.notification();
    await f.push({ ...message, scope: { ...scope, clientId: 12 } });
    const controller = new globalThis.AbortController(); controller.abort(); await f.source.onNotification(message, controller.signal);
    expect(f.publicMotion).not.toHaveBeenCalled();
    f.client.getCachedIdentity.mockReturnValue({ ...scope, clientId: 12, sharedTier: 'u001' });
    await expect(f.source.bindOwnedClientToken('opaque-owned-token', new globalThis.AbortController().signal)).rejects.toThrow('scope changed');
    expect(f.client.registerMotionNotificationKey).not.toHaveBeenCalled();
    await f.push(); await jest.advanceTimersByTimeAsync(60_000); expect(f.transport.postEmpty).not.toHaveBeenCalled();
  });

  it('waits for cancellation of local preparation and cleanup before shutdown completes', async () => {
    const pending = deferred<PreparedNativeRecording>();
    const prepare = jest.fn<ReturnType<typeof prepareNativeRecording>, Parameters<typeof prepareNativeRecording>>().mockReturnValue(pending.promise);
    const f = await setup({ prepare }); await f.push(); await jest.advanceTimersByTimeAsync(60_000);
    await until(() => prepare.mock.calls.length === 1);
    const stopping = f.runtime.stop(), value = prepared(configuration(), false); pending.resolve(value); await stopping;
    expect(value.disposed).toBe(true); expect(f.events).not.toContain('offered');
    expect((await f.state()).downloads).toEqual([]);
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
  });

  it('stops acquisition and local delivery even if the isolated receiver reports a stop failure', async () => {
    const f = await setup(); await f.push(); f.stopSource.mockRejectedValueOnce(new Error('Receiver stop failed'));
    await expect(f.runtime.stop()).rejects.toThrow('Receiver stop failed'); runtimes = runtimes.filter(runtime => runtime !== f.runtime);
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(f.transport.postEmpty).not.toHaveBeenCalled(); expect(f.delegate.policy.allowed).toBe(false);
    expect(f.readyMotion).not.toHaveBeenCalledWith(true);
  });

  it('bootstraps and reloads Windows-shaped modes without POSIX identity or provider requests', async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
    const uidDescriptor = Object.getOwnPropertyDescriptor(process, 'getuid');
    const realLstat = fs.lstat.bind(fs), realOpen = fs.open.bind(fs);
    const windowsMode = <T extends { mode: number; isDirectory(): boolean }>(stat: T): T => {
      stat.mode = (stat.mode & ~0o777) | (stat.isDirectory() ? 0o777 : 0o666);
      return stat;
    };
    Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'win32' });
    Object.defineProperty(process, 'getuid', { configurable: true, writable: true, value: undefined });
    jest.spyOn(fs, 'lstat').mockImplementation(async location => windowsMode(await realLstat(location)));
    jest.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      const handle = await realOpen(...args), realStat = handle.stat.bind(handle);
      jest.spyOn(handle, 'stat').mockImplementation(async () => windowsMode(await realStat()));
      return handle;
    });
    try {
      const first = await setup({ hsv: false });
      await first.source.saveState({ version: 1, scope, firebase: BLINK_FIREBASE_CLIENT, persistentIds: ['owned-checkpoint'] });
      await first.runtime.stop();
      const reloaded = await setup({ hsv: false });
      expect((await reloaded.state()).push?.persistentIds).toEqual(['owned-checkpoint']);
      expect(reloaded.setDemand).toHaveBeenCalledWith({ motionAccessory: true, hsv: false });
      for (const value of [first, reloaded]) {
        expect(value.transport.postEmpty).not.toHaveBeenCalled();
        expect(value.transport.getJson).not.toHaveBeenCalled();
        expect(value.transport.downloadMedia).not.toHaveBeenCalled();
        expect(value.client.registerMotionNotificationKey).not.toHaveBeenCalled();
      }
      await reloaded.runtime.stop();
    } finally {
      jest.restoreAllMocks();
      Object.defineProperty(process, 'platform', platformDescriptor);
      if (uidDescriptor) Object.defineProperty(process, 'getuid', uidDescriptor);
      else Reflect.deleteProperty(process, 'getuid');
    }
  });

  itIfPosix('still refuses non-private native directories on POSIX hosts', async () => {
    const directory = path.join(root, '.blink-native-recording');
    await fs.mkdir(directory, { mode: 0o700 });
    await fs.chmod(directory, 0o755);
    await expect(setup({ hsv: false })).rejects.toThrow('Native recording directory must be private');
  });

  itIfPosix('still refuses non-private saved runtime state on POSIX hosts', async () => {
    const first = await setup({ hsv: false });
    await first.source.saveState({ version: 1, scope, firebase: BLINK_FIREBASE_CLIENT, persistentIds: [] });
    await first.runtime.stop();
    await fs.chmod(path.join(first.runtime.directory, 'state.json'), 0o644);
    await expect(setup({ hsv: false })).rejects.toThrow('Unsafe native recording state');
  });

});
