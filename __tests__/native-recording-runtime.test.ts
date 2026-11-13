import { Buffer } from 'node:buffer';
import { createECDH, createHash, randomUUID } from 'node:crypto';
import { promises as fs, readFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { setImmediate as realImmediate } from 'node:timers/promises';
import type { CameraRecordingConfiguration } from 'homebridge';
import { BlinkApi, type BlinkEarlyNotificationState, type BlinkRemoteOperationOwnership } from '../src/blink-api/client';
import type { BlinkAuth } from '../src/blink-api/auth';
import { BLINK_FIREBASE_CLIENT } from '../src/blink-api/fcm-config';
import { BlinkHttpError } from '../src/blink-api/http';
import { FcmEventSource, type FcmEventSourceOptions } from '../src/blink-api/fcm/source';
import { FCM_BUNDLE_ID, type Credentials, type FcmNotification, type FcmReceiverState, type FcmWorkerHandle, type WorkerCommand } from '../src/blink-api/fcm/types';
import type { NativeStorageTransport, NativeStoredMedia } from '../src/blink-api/native-storage';
import type { NativeMotionDevice } from '../src/blink-api/motion-events';
import { writeOwnerOnlyJsonFile } from '../src/blink-api/secure-json-file';
import * as secureJson from '../src/blink-api/secure-json-file';
import { NativeRecordingDelegate } from '../src/accessories/native-recording-delegate';
import type { PreparedNativeRecording, prepareNativeRecording } from '../src/accessories/native-recording-preparation';
import { resolveNativeRecordingConfig, type NativeRecordingConfigInput } from '../src/native-recording-config';
import { NativeRecordingRuntime, type NativeRecordingRuntimeOptions, type NativeRecordingRuntimeState } from '../src/native-recording-runtime';
import { OperationTimeoutError } from '../src/operation-budget';

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
    prepare?: typeof prepareNativeRecording; storagePath?: string; nativeStorage?: boolean; secondCamera?: boolean;
    start?: boolean; report?: NativeRecordingRuntimeOptions['report'];
    earlyNotification?: boolean; earlyNotificationMode?: 'on' | 'off' | 'unmanaged'; rawType?: string; earlyCurrent?: boolean; earlyCompatible?: boolean; earlyFailure?: 'before-write' | 'after-write';
    matchingDevices?: readonly NativeMotionDevice[]; eventSourceFactory?: NativeRecordingRuntimeOptions['eventSourceFactory'] } = {}) {
    let runtime: NativeRecordingRuntime | undefined, source!: FcmEventSourceOptions;
    let remoteSave!: (state: BlinkRemoteOperationOwnership) => Promise<void>;
    let directory = '', nextCommand = 100, insideProvider = false;
    const reports: { event: string; context?: Parameters<NativeRecordingRuntimeOptions['report']>[1] }[] = [];
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
      deliveryOutcome: event => runtime?.deliveryOutcome(event.outcome, 'camera:40', event) });
    delegate.updateRecordingConfiguration(configuration()); delegate.updateRecordingActive(true);
    const cornerReady = jest.fn();
    const cornerDelegate = overrides.secondCamera ? new NativeRecordingDelegate({
      preparation: { admit: work => work() }, prepare, readyMotion: cornerReady,
      policyChanged: policy => runtime?.policyChanged('camera:41', policy), deliveryOutcome: event => runtime?.deliveryOutcome(event.outcome, 'camera:41', event),
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
        return { reference: await fs.realpath(reference), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
      }),
    };
    const setDemand = jest.fn().mockResolvedValue(undefined), reconnectSource = jest.fn().mockResolvedValue(undefined), stopSource = jest.fn().mockResolvedValue(undefined);
    const releaseOwnership = jest.fn().mockResolvedValue(undefined);
    const earlyProvider = { current: overrides.earlyCurrent ?? true, compatible: overrides.earlyCompatible ?? true,
      failure: overrides.earlyFailure as 'before-write' | 'after-write' | undefined };
    const settingWrites: boolean[] = [];
    const settingReceipts: Array<{ devices: unknown[] }> = [];
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
      configureRemoteOperationOwnership: jest.fn((options: { saveState: (state: BlinkRemoteOperationOwnership) => Promise<void> }) => {
        remoteSave = options.saveState; return releaseOwnership;
      }),
      retryRemoteOperationPersistence: jest.fn().mockResolvedValue(undefined),
      reconcileKnownStateCommand: jest.fn().mockResolvedValue({ confirmed: true }),
      reconcileKnownLiveViews: jest.fn().mockResolvedValue([]),
      setDeviceEarlyNotification: jest.fn<ReturnType<BlinkApi['setDeviceEarlyNotification']>, Parameters<BlinkApi['setDeviceEarlyNotification']>>()
        .mockImplementation(async (_kind, _network, _id, _rawType, enabled, options = {}) => {
          if (earlyProvider.failure === 'before-write') throw new Error('Offline setting read');
          const current: BlinkEarlyNotificationState = { supported: earlyProvider.compatible, compatible: earlyProvider.compatible,
            current: earlyProvider.current, changed: false };
          if (!current.supported || current.current === enabled || (options.expectedCurrent !== undefined && current.current !== options.expectedCurrent)) return current;
          await options.beforeChange?.(earlyProvider.current);
          settingReceipts.push(JSON.parse(await fs.readFile(path.join(overrides.storagePath ?? root,
            '.blink-native-recording', '.early-notification-10-u000.json'), 'utf8')));
          settingWrites.push(enabled); earlyProvider.current = enabled;
          if (earlyProvider.failure === 'after-write') throw new Error('Lost setting readback');
          return { ...current, current: enabled, changed: true };
        }),
    };
    const devices: NativeRecordingRuntimeOptions['devices'] = [{ binding: { accountId: 10, networkId: 20, providerId: 40, target: 'camera', cameraId: 'camera:40', nativeName: 'Entry native name' },
        rawType: overrides.rawType ?? 'catalina',
        ...(overrides.nativeStorage === false ? {} : { nativeStorage: { moduleId: '20:30', syncModuleId: 30 } }),
        settings: { exposeMotionDetected: overrides.exposure ?? true, homeKitSecureVideo: overrides.hsv ?? true, earlyNotificationMode: overrides.earlyNotificationMode ?? (overrides.earlyNotification ? 'off' : 'unmanaged') },
        motion: publicMotion, recording: () => delegate }, ...(cornerDelegate ? [{
        binding: { accountId: 10, networkId: 20, providerId: 41, target: 'camera', cameraId: 'camera:41', nativeName: 'Corner native name' },
        nativeStorage: { moduleId: '20:30', syncModuleId: 30 }, settings: { exposeMotionDetected: true, homeKitSecureVideo: true, earlyNotificationMode: 'unmanaged' as const },
        motion: jest.fn(), recording: () => cornerDelegate,
      }] : [])];
    const options: NativeRecordingRuntimeOptions = { client: client as unknown as BlinkApi, scope, storagePath: overrides.storagePath ?? root,
      config: resolveNativeRecordingConfig(overrides.config), firebase: BLINK_FIREBASE_CLIENT, appVersion: '61.0', report: (event, context) => { events.push(event); reports.push({ event, context }); overrides.report?.(event, context); },
      devices, matchingDevices: overrides.matchingDevices ?? devices.flatMap(device => device.nativeStorage ? [{ ...device.binding, ...device.nativeStorage }] : []),
      eventSourceFactory: input => { source = input; return overrides.eventSourceFactory?.(input) ?? { setDemand, reconnect: reconnectSource, stop: stopSource }; },
    };
    const originalsPath = path.join(overrides.storagePath ?? root, '.blink-native-recording', '.early-notification-10-u000.json');
    const startAndSettlePreferences = async (value: NativeRecordingRuntime, devices: NativeRecordingRuntimeOptions['devices']) => {
      const originals = await fs.readFile(originalsPath, 'utf8').then(text => JSON.parse(text).devices.length).catch(error => {
        if (error.code === 'ENOENT') return 0;
        throw error;
      });
      const since = events.length;
      await value.start();
      if (originals || devices.some(device => device.settings.earlyNotificationMode !== 'unmanaged')) {
        await until(() => events.slice(since).some(event => /^early-notification-(?:confirmed-(?:on|off)|unsupported|.*faulted|restored)$/.test(event)));
      }
    };
    runtime = await NativeRecordingRuntime.create(options); runtimes.push(runtime);
    if (overrides.start !== false) await startAndSettlePreferences(runtime, options.devices);
    const notification = (id = 'motion-1', values: Record<string, string> = {}): FcmNotification => ({
      persistentMessageId: id, scope, receivedAt: Date.now(), activatedAt: Date.now(),
      data: { category: 'motion', event_type: 'cam2sm_motion', camera: '40', target: 'camera', network: '20',
        created_at: new Date(Date.now()).toISOString(), ...values },
    });
    const push = (message = notification()) => source.onNotification(message, new globalThis.AbortController().signal);
    const rebind = async (next: Partial<NativeRecordingRuntimeOptions> = {}) => {
      runtime = await NativeRecordingRuntime.create({ ...options, ...next }); runtimes.push(runtime);
      await startAndSettlePreferences(runtime, next.devices ?? options.devices); return runtime;
    };
    return { reports, runtime, delegate, prepare, transport, client, source, setDemand, reconnectSource, stopSource, events, publicMotion, readyMotion,
      media, notification, push, state, remoteSave, cornerReady, releaseOwnership, rebind, devices, earlyProvider, settingWrites, settingReceipts,
      originalsPath };
  }

  it('restores an exhausted real receiver on explicit retry without rebinding or losing durable ownership and acknowledgments', async () => {
    class Worker implements FcmWorkerHandle {
      private message?: (value: unknown) => void;
      readonly send = jest.fn<void, [WorkerCommand]>();
      readonly stop = jest.fn(async () => undefined);
      onMessage(listener: (value: unknown) => void) { this.message = listener; }
      onExit(_listener: () => void) { /* The controlled worker exits only through stop(). */ }
      emit(value: unknown) { this.message?.(value); }
    }
    const key = createECDH('prime256v1'); key.setPrivateKey(Buffer.alloc(32, 1));
    const credentials: Credentials = {
      gcm: { androidId: '12345', securityToken: '67890', appId: 'owned-instance', token: 'owned-gcm-token' },
      fcm: { token: 'owned-fcm-token', installation: { token: 'installation-auth', refreshToken: 'installation-refresh', fid: 'owned-fid',
        createdAt: 1, expiresIn: 604800000 } },
      keys: { privateKey: key.getPrivateKey('base64'), publicKey: key.getPublicKey('base64'), authSecret: Buffer.alloc(16, 2).toString('base64') },
      config: { projectId: BLINK_FIREBASE_CLIENT.projectId, bundleId: FCM_BUNDLE_ID, vapidKey: '' },
    };
    const workers: Worker[] = []; let receiver!: FcmEventSource;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('Unexpected external request'));
    try {
      const f = await setup({ hsv: false, eventSourceFactory: options => {
        receiver = new FcmEventSource({ ...options, maxFailures: 2, retryBaseMs: 100, random: () => 0.5,
          spawnWorker: () => { const worker = new Worker(); workers.push(worker); return worker; } });
        return receiver;
      } });
      const activate = async (worker: Worker) => {
        worker.emit({ type: 'credentials', credentials });
        await until(() => worker.send.mock.calls.some(([message]) => message.type === 'credentials-accepted'));
        worker.emit({ type: 'ready' }); await until(() => receiver.getStatus().connected);
      };
      const enabledAt = Date.now();
      const notify = (worker: Worker, id: string, createdAt = Date.now()) => worker.emit({ type: 'notification', persistentId: id,
        receivedAt: Date.now(), data: f.notification(id, { created_at: new Date(createdAt).toISOString() }).data });
      await activate(workers[0]); notify(workers[0], 'before-outage');
      await until(() => workers[0].send.mock.calls.some(([message]) => message.type === 'ack'));
      expect(f.publicMotion).toHaveBeenCalledTimes(1);
      const ownership: BlinkRemoteOperationOwnership = { stateCommand: { reservationId: 'unknown-arm', accountId: 10, networkId: 20,
        kind: 'arm', phase: 'unresolved', statusReads: 0 } };
      await f.remoteSave(ownership);
      workers[0].emit({ type: 'failure', reason: 'transport-error', retryable: true });
      await until(() => workers[0].stop.mock.calls.length === 1);
      await jest.advanceTimersByTimeAsync(100); expect(workers).toHaveLength(2);
      workers[1].emit({ type: 'failure', reason: 'transport-error', retryable: true });
      await until(() => receiver.getStatus().faulted);
      await jest.advanceTimersByTimeAsync(3_600_000);
      await f.runtime.start(); await f.runtime.start();
      expect(workers).toHaveLength(2); expect(receiver.getStatus().faulted).toBe(true);
      expect(f.events).toContain('push-faulted:transport-error');

      await f.runtime.retryConnection(); expect(workers).toHaveLength(3);
      expect(workers[2].send).toHaveBeenCalledWith({ type: 'start', firebase: BLINK_FIREBASE_CLIENT, credentials, persistentIds: ['before-outage'] });
      await activate(workers[2]);
      notify(workers[2], 'before-outage'); notify(workers[2], 'during-outage', enabledAt + 1);
      await until(() => workers[2].send.mock.calls.filter(([message]) => message.type === 'ack').length === 2);
      expect(f.publicMotion).toHaveBeenCalledTimes(2);
      expect(receiver.snapshot().persistentIds).toEqual(['before-outage', 'during-outage']);
      expect(f.client.registerMotionNotificationKey).toHaveBeenCalledTimes(1);
      expect((await f.state()).remoteOperations).toEqual(ownership);
      expect(f.transport.postEmpty).not.toHaveBeenCalled(); expect(f.transport.getJson).not.toHaveBeenCalled();
      expect(f.transport.downloadMedia).not.toHaveBeenCalled(); expect(globalThis.fetch).not.toHaveBeenCalled();
      // A deliberate retry of a healthy connection also retains this enabled period.
      await f.runtime.retryConnection(); expect(workers).toHaveLength(4);
      expect(workers[2].stop).toHaveBeenCalledTimes(1);
      expect(workers[3].send).toHaveBeenCalledWith(expect.objectContaining({ type: 'start', credentials,
        persistentIds: ['before-outage', 'during-outage'] }));
    } finally { globalThis.fetch = originalFetch; }
  });

  it('keeps no-demand recovery quiet and rejects reconnect after permanent shutdown', async () => {
    const f = await setup({ exposure: false, hsv: false });
    await f.runtime.start(); await f.runtime.retryConnection();
    expect(f.setDemand).toHaveBeenCalledTimes(1); expect(f.reconnectSource).not.toHaveBeenCalled();
    expect(f.client.setDeviceEarlyNotification).not.toHaveBeenCalled();
    expect(f.transport.postEmpty).not.toHaveBeenCalled();
    await f.runtime.stop();
    await expect(f.runtime.retryConnection()).rejects.toThrow('Native runtime stopped');
    expect(f.reconnectSource).not.toHaveBeenCalled();
  });

  it.each([true, false])('recovers an active ordinary command only on explicit retry with a known ID (%s)', async acknowledged => {
    const originalFetch = globalThis.fetch;
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'active-ordinary-recovery', tier: scope.tier });
    const auth = (api as unknown as { auth: BlinkAuth }).auth;
    auth.setAccountMetadata(scope);
    jest.spyOn(auth, 'ensureValidToken').mockResolvedValue(undefined);
    jest.spyOn(auth, 'getAuthHeaders').mockReturnValue({ Authorization: 'Bearer fixture-auth' });
    const demand = jest.fn().mockResolvedValue(undefined), reconnect = jest.fn().mockResolvedValue(undefined);
    try {
      globalThis.fetch = jest.fn().mockImplementation(async (_url, request) => {
        if (request.method === 'POST' && acknowledged) return new Response(JSON.stringify({ id: 707 }));
        throw new OperationTimeoutError();
      });
      const runtime = await NativeRecordingRuntime.create({ client: api, scope, devices: [], matchingDevices: [], storagePath: root,
        config: resolveNativeRecordingConfig(undefined), firebase: BLINK_FIREBASE_CLIENT, appVersion: '61.0', report: jest.fn(),
        eventSourceFactory: () => ({ setDemand: demand, reconnect, stop: jest.fn().mockResolvedValue(undefined) }) });
      runtimes.push(runtime); await runtime.start(); await runtime.start();
      expect(globalThis.fetch).not.toHaveBeenCalled();
      await expect(api.armNetwork(20)).rejects.toBeDefined();
      const owner = api.getRemoteOperationState().stateCommand!;
      expect(owner).toMatchObject({ kind: 'arm', phase: 'unresolved', statusReads: acknowledged ? 1 : 0 });
      expect(owner.commandId).toBe(acknowledged ? 707 : undefined);
      jest.mocked(globalThis.fetch).mockClear().mockResolvedValue(new Response(JSON.stringify({ complete: true, status: 0 })));
      await runtime.start(); expect(globalThis.fetch).not.toHaveBeenCalled();
      await runtime.retryConnection();
      if (acknowledged) {
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(globalThis.fetch).toHaveBeenCalledWith('https://rest-u000.immedia-semi.com/accounts/10/networks/20/commands/707',
          expect.objectContaining({ method: 'GET' }));
        expect(api.getRemoteOperationState().stateCommand).toBeUndefined();
      } else {
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(api.getRemoteOperationState().stateCommand).toEqual(owner);
      }
      jest.mocked(globalThis.fetch).mockClear();
      await runtime.start(); await runtime.retryConnection();
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(demand).toHaveBeenCalledTimes(1); expect(reconnect).not.toHaveBeenCalled();
    } finally { globalThis.fetch = originalFetch; }
  });

  it.each([true, false])('recovers an unresolved native acquisition only with acknowledged terminal proof (%s)', async acknowledged => {
    const f = await setup({ config: { initialDelaySeconds: 0 } });
    if (acknowledged) f.transport.getJson.mockRejectedValueOnce(new OperationTimeoutError());
    else f.transport.postEmpty.mockRejectedValueOnce(new OperationTimeoutError());
    await f.push(); await jest.advanceTimersByTimeAsync(0);
    await until(async () => (await f.state()).core?.operation?.status === 'unresolved');
    await f.remoteSave((await f.state()).remoteOperations ?? {});
    const before = (await f.state()).nativeByModule['20:30'].state;
    expect(before.operation?.phase).toBe(acknowledged ? 'accepted' : 'intent');
    await f.runtime.start();
    expect(f.transport.getJson).toHaveBeenCalledTimes(acknowledged ? 1 : 0);
    await f.runtime.retryConnection();
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
    expect(f.transport.downloadMedia).not.toHaveBeenCalled();
    if (!acknowledged) {
      expect((await f.state()).nativeByModule['20:30'].state).toEqual(before);
      expect((await f.state()).core?.operation?.status).toBe('unresolved');
      expect(f.transport.getJson).not.toHaveBeenCalled();
      return;
    }
    expect(f.transport.getJson).toHaveBeenCalledTimes(2);
    expect(f.transport.getJson).toHaveBeenLastCalledWith({ base: 'root', path: 'accounts/10/networks/20/commands/100' },
      expect.objectContaining({ retry: false }));
    const recovered = await f.state();
    expect(recovered.nativeByModule['20:30'].state.operation).toMatchObject({ phase: 'finished', commandId: 100,
      result: { status: 'failed', reason: 'discarded', remoteStatus: 0 } });
    expect(recovered.core?.operation).toBeUndefined(); expect(recovered.core?.queue).toEqual([]);
    await jest.advanceTimersByTimeAsync(60_000); f.media[0].created_at = new Date(Date.now()).toISOString();
    await f.push(f.notification('next-motion')); await jest.advanceTimersByTimeAsync(0);
    await until(() => f.events.includes('offered'));
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(3); expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
    expect(f.setDemand).toHaveBeenCalledTimes(1); expect(f.reconnectSource).toHaveBeenCalledTimes(1);
  });

  it('leaves an in-flight native acquisition unchanged during explicit connection retry', async () => {
    const f = await setup({ config: { initialDelaySeconds: 0 } }), response = deferred<unknown>();
    f.transport.getJson.mockImplementationOnce(() => response.promise);
    await f.push(); await jest.advanceTimersByTimeAsync(0);
    await until(() => f.transport.getJson.mock.calls.length === 1);
    const before = (await f.state()).core?.operation;
    expect(before?.status).toBe('active');
    await f.runtime.retryConnection();
    expect((await f.state()).core?.operation).toEqual(before);
    expect(f.transport.getJson).toHaveBeenCalledTimes(1); expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
    expect(f.transport.downloadMedia).not.toHaveBeenCalled();
    response.resolve({ complete: true, status: 0, commands: [{ id: 200 }] });
    await until(() => f.events.includes('offered'));
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(2); expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
    expect(f.setDemand).toHaveBeenCalledTimes(1);
  });

  it('finishes connection retry when its selected native job expires during a held status read', async () => {
    const f = await setup({ config: { initialDelaySeconds: 0 } }), terminal = deferred<unknown>();
    f.transport.getJson.mockRejectedValueOnce(new OperationTimeoutError());
    await f.push(); await jest.advanceTimersByTimeAsync(0);
    await until(async () => (await f.state()).core?.operation?.status === 'unresolved');
    await jest.advanceTimersByTimeAsync(119000);
    f.transport.getJson.mockImplementationOnce(() => terminal.promise);
    const retry = f.runtime.retryConnection();
    const completed = expect(retry).resolves.toBeUndefined();
    try {
      await until(() => f.transport.getJson.mock.calls.length === 2);
      await jest.advanceTimersByTimeAsync(1000);
      await until(async () => (await f.state()).core?.queue.length === 0);
      terminal.resolve({ complete: true, status: 0 }); await completed;
      expect((await f.state()).core?.operation).toBeUndefined();
      expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
      expect(f.reconnectSource).toHaveBeenCalledTimes(1);
    } finally { terminal.resolve({ complete: true, status: 0 }); }
  });

  it.each(['startup', 'retry'] as const)('drains held %s recovery before real SDK writer handoff without reopening its receiver', async phase => {
    const seed = await setup({ config: { initialDelaySeconds: 0 } });
    seed.transport.getJson.mockRejectedValueOnce(new OperationTimeoutError());
    await seed.push(); await jest.advanceTimersByTimeAsync(0);
    await until(async () => (await seed.state()).core?.operation?.status === 'unresolved');
    await seed.runtime.stop();
    const originalFetch = globalThis.fetch, terminal = deferred<Response>();
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'recovery-writer-handoff', tier: scope.tier });
    const auth = (api as unknown as { auth: BlinkAuth }).auth;
    auth.setAccountMetadata(scope);
    jest.spyOn(auth, 'ensureValidToken').mockResolvedValue(undefined);
    jest.spyOn(auth, 'getAuthHeaders').mockReturnValue({ Authorization: 'Bearer fixture-auth' });
    const sources: { options: FcmEventSourceOptions; setDemand: jest.Mock; reconnect: jest.Mock; stop: jest.Mock }[] = [];
    const options: NativeRecordingRuntimeOptions = { client: api, scope, storagePath: root,
      config: resolveNativeRecordingConfig(undefined), firebase: BLINK_FIREBASE_CLIENT, appVersion: '61.0', report: jest.fn(), matchingDevices: [],
      devices: [{ binding: { accountId: 10, networkId: 20, providerId: 40, target: 'camera', cameraId: 'camera:40', nativeName: 'Entry native name' },
        settings: { exposeMotionDetected: true, homeKitSecureVideo: false, earlyNotificationMode: 'unmanaged' as const }, motion: jest.fn(), recording: () => undefined }],
      eventSourceFactory: input => {
        const source = { options: input, setDemand: jest.fn().mockResolvedValue(undefined),
          reconnect: jest.fn().mockResolvedValue(undefined), stop: jest.fn().mockResolvedValue(undefined) };
        sources.push(source); return source;
      } };
    try {
      globalThis.fetch = jest.fn().mockImplementation(async (url, request) => {
        expect(url).toBe('https://rest-u000.immedia-semi.com/accounts/10/networks/20/commands/100');
        expect(request.method).toBe('GET');
        if (phase === 'retry' && jest.mocked(globalThis.fetch).mock.calls.length === 1) return new Response('{}', { status: 503 });
        return terminal.promise;
      });
      const runtime = await NativeRecordingRuntime.create(options); runtimes.push(runtime);
      if (phase === 'retry') await runtime.start();
      const recover = () => phase === 'startup' ? runtime.start() : runtime.retryConnection();
      const first = recover(), second = recover();
      await until(() => jest.mocked(globalThis.fetch).mock.calls.length === (phase === 'retry' ? 2 : 1));
      let stopped = false;
      const stopping = runtime.stop().then(() => { stopped = true; });
      await until(() => sources[0].stop.mock.calls.length === 1);
      expect(stopped).toBe(false);
      terminal.resolve(new Response(JSON.stringify({ complete: true, status: 0 })));
      await Promise.all([first, second, stopping]);
      expect(sources[0].reconnect).not.toHaveBeenCalled();
      expect(sources[0].setDemand).toHaveBeenCalledTimes(phase === 'retry' ? 1 : 0);
      const statePath = path.join(runtime.directory, 'state.json');
      const settled = JSON.parse(await fs.readFile(statePath, 'utf8')) as NativeRecordingRuntimeState;
      expect(settled.nativeByModule['20:30'].state.operation).toMatchObject({ phase: 'finished', commandId: 100,
        result: { status: 'failed', reason: 'discarded', remoteStatus: 0 } });
      expect(settled.core?.operation).toBeUndefined(); expect(settled.core?.queue).toEqual([]);
      const replacement = await NativeRecordingRuntime.create(options); runtimes.push(replacement); await replacement.start();
      await sources[1].options.saveState({ version: 1, scope, firebase: BLINK_FIREBASE_CLIENT, persistentIds: ['replacement-checkpoint'] });
      const checkpoint = await fs.readFile(statePath);
      await runtime.stop(); await realImmediate(); await jest.advanceTimersByTimeAsync(0);
      expect(await fs.readFile(statePath)).toEqual(checkpoint);
      expect(JSON.parse(checkpoint.toString()).push.persistentIds).toEqual(['replacement-checkpoint']);
      expect(globalThis.fetch).toHaveBeenCalledTimes(phase === 'retry' ? 2 : 1);
    } finally { terminal.resolve(new Response(JSON.stringify({ complete: true, status: 0 }))); globalThis.fetch = originalFetch; }
  });

  it.each([
    { accountId: 10, clientId: 11, tier: 'u000' },
    { accountId: 12, clientId: 11, tier: 'u000' },
    { accountId: 10, clientId: 12, tier: 'u000' },
    { accountId: 10, clientId: 11, tier: 'u001' },
  ])('replaces an idle stopped runtime using the same real API instance after scope becomes $accountId/$clientId/$tier', async nextScope => {
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'runtime-recovery', tier: 'u000' });
    const auth = (api as unknown as { auth: BlinkAuth }).auth;
    auth.setAccountMetadata(scope);
    const demand = jest.fn().mockResolvedValue(undefined), report = jest.fn();
    const options: NativeRecordingRuntimeOptions = { client: api, scope, devices: [], matchingDevices: [], storagePath: root,
      config: resolveNativeRecordingConfig(undefined), firebase: BLINK_FIREBASE_CLIENT, appVersion: '61.0', report,
      eventSourceFactory: () => ({ setDemand: demand, reconnect: jest.fn().mockResolvedValue(undefined), stop: jest.fn().mockResolvedValue(undefined) }) };
    const first = await NativeRecordingRuntime.create(options); runtimes.push(first); await first.start(); await first.stop();
    auth.setAccountMetadata(nextScope);
    const replacement = await NativeRecordingRuntime.create({ ...options, scope: nextScope }); runtimes.push(replacement); await replacement.start();
    await expect(api.withNativeStorageAdmission('local-admission-proof', async () => 'admitted', {},
      { accountId: nextScope.accountId, networkId: 20, syncModuleId: 30 })).resolves.toBe('admitted');
    expect(demand).toHaveBeenNthCalledWith(1, { motionAccessory: false, hsv: false });
    expect(demand).toHaveBeenNthCalledWith(2, { motionAccessory: false, hsv: false });
    expect(api.getRemoteOperationState()).toMatchObject({ storage: [], persistenceFailed: false });
  });

  it.each([
    { acknowledged: true, commandId: 707, completeAtStartup: true },
    { acknowledged: true, commandId: 707, completeAtStartup: false },
    { acknowledged: false, commandId: 707, completeAtStartup: false },
    { acknowledged: false, commandId: undefined, completeAtStartup: false },
  ])('recovers only known acknowledged retirements on startup/retry ($acknowledged/$commandId/$completeAtStartup)', async scenario => {
    const originalFetch = globalThis.fetch;
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'retirement-recovery', tier: scope.tier });
    const auth = (api as unknown as { auth: BlinkAuth }).auth;
    auth.setAccountMetadata(scope);
    jest.spyOn(auth, 'ensureValidToken').mockResolvedValue(undefined);
    jest.spyOn(auth, 'getAuthHeaders').mockReturnValue({ Authorization: 'Bearer fixture-auth' });
    const directory = path.join(root, '.blink-native-recording', '10-11-u000');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const saved: NativeRecordingRuntimeState = { version: 1, scope, nativeByModule: {}, consumed: [], catalogStartedAt: {}, refusedUntil: {}, downloads: [],
      remoteOperations: { liveView: { reservationId: 'retiring-view', accountId: 10, networkId: 20, deviceId: 40,
        kind: 'camera', phase: 'unresolved', commandId: scenario.commandId, retirementAcknowledged: scenario.acknowledged,
        expiresAt: Date.now() + 120000 } } };
    await writeOwnerOnlyJsonFile(path.join(directory, 'state.json'), saved);
    const demand = jest.fn().mockResolvedValue(undefined), report = jest.fn();
    try {
      globalThis.fetch = jest.fn().mockImplementation(async () => {
        const complete = scenario.completeAtStartup || (globalThis.fetch as jest.Mock).mock.calls.length > 1;
        return new Response(JSON.stringify({ complete, status: 0 }), { headers: { 'content-type': 'application/json' } });
      });
      const runtime = await NativeRecordingRuntime.create({ client: api, scope, devices: [], matchingDevices: [], storagePath: root,
        config: resolveNativeRecordingConfig(undefined), firebase: BLINK_FIREBASE_CLIENT, appVersion: '61.0', report,
        eventSourceFactory: () => ({ setDemand: demand, reconnect: jest.fn().mockResolvedValue(undefined), stop: jest.fn().mockResolvedValue(undefined) }) });
      runtimes.push(runtime); await runtime.start();
      if (scenario.acknowledged) {
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        if (!scenario.completeAtStartup) {
          expect(api.getRemoteOperationState().liveView).toMatchObject({ commandId: 707, phase: 'unresolved', retirementAcknowledged: true });
          const retry = runtime.retryConnection(); await jest.advanceTimersByTimeAsync(300); await retry;
        }
        expect(api.getRemoteOperationState().liveView).toBeUndefined();
        const admission = api.withNativeStorageAdmission('recovered-admission', async () => 'allowed', {}, { accountId: 10, networkId: 20, syncModuleId: 30 });
        await jest.advanceTimersByTimeAsync(300); await expect(admission).resolves.toBe('allowed');
        for (const [url, request] of (globalThis.fetch as jest.Mock).mock.calls) {
          expect(url).toBe('https://rest-u000.immedia-semi.com/accounts/10/networks/20/commands/707'); expect(request.method).toBe('GET');
        }
        expect(globalThis.fetch).toHaveBeenCalledTimes(scenario.completeAtStartup ? 1 : 2);
      } else {
        await runtime.retryConnection();
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(api.getRemoteOperationState().liveView).toEqual(saved.remoteOperations!.liveView);
        await expect(api.withNativeStorageAdmission('blocked-admission', async () => 'must-not-run', {},
          { accountId: 10, networkId: 20, syncModuleId: 30 })).rejects.toMatchObject({ dispatched: false });
      }
      expect(demand).toHaveBeenCalledTimes(1);
    } finally { globalThis.fetch = originalFetch; }
  });

  it('persists late live-view cleanup through the replacement runtime without erasing its newer push checkpoint', async () => {
    const originalFetch = globalThis.fetch;
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'runtime-late-cleanup', tier: 'u000' });
    const auth = (api as unknown as { auth: BlinkAuth }).auth;
    auth.setAccountMetadata(scope);
    jest.spyOn(auth, 'ensureValidToken').mockResolvedValue(undefined);
    jest.spyOn(auth, 'getAuthHeaders').mockReturnValue({ Authorization: 'Bearer fixture-auth' });
    const directory = path.join(root, '.blink-native-recording', '10-11-u000');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const saved: NativeRecordingRuntimeState = { version: 1, scope, nativeByModule: {}, consumed: [], catalogStartedAt: {}, refusedUntil: {}, downloads: [],
      remoteOperations: { liveView: { reservationId: 'existing-manual-view', accountId: 10, networkId: 20, deviceId: 40,
        kind: 'camera', phase: 'active', commandId: 707, retirementAcknowledged: false, expiresAt: Date.now() + 120000 } } };
    await writeOwnerOnlyJsonFile(path.join(directory, 'state.json'), saved);
    let source!: FcmEventSourceOptions;
    const options: NativeRecordingRuntimeOptions = { client: api, scope, devices: [], matchingDevices: [], storagePath: root,
      config: resolveNativeRecordingConfig(undefined), firebase: BLINK_FIREBASE_CLIENT, appVersion: '61.0', report: jest.fn(),
      eventSourceFactory: input => { source = input; return { setDemand: jest.fn().mockResolvedValue(undefined), reconnect: jest.fn().mockResolvedValue(undefined), stop: jest.fn().mockResolvedValue(undefined) }; } };
    try {
      globalThis.fetch = jest.fn().mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ complete: true, status: 0 }), { headers: { 'content-type': 'application/json' } }));
      const first = await NativeRecordingRuntime.create(options); runtimes.push(first); await first.start(); await first.stop();
      expect(api.getRemoteOperationState().liveView?.commandId).toBe(707);
      const replacement = await NativeRecordingRuntime.create(options); runtimes.push(replacement); await replacement.start();
      await source.saveState({ version: 1, scope, firebase: BLINK_FIREBASE_CLIENT, persistentIds: ['new-runtime-checkpoint'] });
      await api.completeCommand(20, 707);
      const persisted = JSON.parse(await fs.readFile(path.join(replacement.directory, 'state.json'), 'utf8')) as NativeRecordingRuntimeState;
      expect(persisted.push?.persistentIds).toEqual(['new-runtime-checkpoint']);
      expect(persisted.remoteOperations).toEqual({});
      expect(api.getRemoteOperationState()).toMatchObject({ storage: [], persistenceFailed: false });
      expect(api.getRemoteOperationState().liveView).toBeUndefined();
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    } finally { globalThis.fetch = originalFetch; }
  });

  it.each(['ordinary', 'live-view', 'native', 'scheduler'] as const)('retains legacy prior-scope %s evidence without permanently vetoing a new client', async kind => {
    const directory = path.join(root, '.blink-native-recording', '10-11-u000');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const saved: NativeRecordingRuntimeState = { version: 1, scope, nativeByModule: {}, consumed: [], catalogStartedAt: {}, refusedUntil: {}, downloads: [] };
    if (kind === 'ordinary') saved.remoteOperations = { stateCommand: { reservationId: 'lost-arm', accountId: 10, networkId: 20,
      kind: 'arm', phase: 'unresolved', statusReads: 0 } };
    if (kind === 'live-view') saved.remoteOperations = { liveView: { reservationId: 'lost-view', accountId: 10, networkId: 20,
      deviceId: 40, kind: 'camera', phase: 'unresolved', retirementAcknowledged: false } };
    if (kind === 'native') saved.nativeByModule['20:30'] = { scope: { accountId: 10, networkId: 20, syncModuleId: 30 }, state: { version: 1,
      operation: { accountId: 10, networkId: 20, syncModuleId: 30, operationId: 'lost-catalog', kind: 'catalog', phase: 'intent', statusReads: 0 } } };
    if (kind === 'scheduler') saved.core = { version: 1, rememberedEvents: [], queue: [],
      operation: { operationId: 'uncertain-job', jobKey: 'job', startedAt: Date.now(), status: 'unresolved' } };
    const filename = path.join(directory, 'state.json'); await writeOwnerOnlyJsonFile(filename, saved);
    const bytes = await fs.readFile(filename), nextScope = { ...scope, clientId: 12, tier: 'u001' };
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'restart-fence', tier: nextScope.tier });
    (api as unknown as { auth: BlinkAuth }).auth.setAccountMetadata(nextScope);
    const factory = jest.fn().mockReturnValue({ setDemand: jest.fn().mockResolvedValue(undefined), reconnect: jest.fn(), stop: jest.fn().mockResolvedValue(undefined) });
    const runtime = await NativeRecordingRuntime.create({ client: api, scope: nextScope, devices: [], matchingDevices: [], storagePath: root,
      config: resolveNativeRecordingConfig(undefined), firebase: BLINK_FIREBASE_CLIENT, appVersion: '61.0', report: jest.fn(), eventSourceFactory: factory });
    runtimes.push(runtime); await runtime.start();
    await expect(api.withNativeStorageAdmission('fresh-distinct-operation', async () => 'admitted', {},
      { accountId: 10, networkId: 20, syncModuleId: 30 })).resolves.toBe('admitted');
    expect(factory).toHaveBeenCalledTimes(1); expect(await fs.readFile(filename)).toEqual(bytes);
  });

  it('expires a prior scheduler intent without a native receipt using its original fixed lease', async () => {
    const directory = path.join(root, '.blink-native-recording', '10-11-u000');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const observation = { source: 'provider' as const, kind: 'motion-start' as const, eventId: 'receipt-not-yet-saved',
      moduleId: '20:30', cameraId: 'camera:40', occurredAt: Date.now() };
    const saved: NativeRecordingRuntimeState = { version: 1, scope, nativeByModule: {}, consumed: [], catalogStartedAt: {}, refusedUntil: {}, downloads: [],
      core: { version: 1, rememberedEvents: [], queue: [{ observation, eligibleAt: Date.now(), attempts: 1, cameraGeneration: 0 }],
        operation: { operationId: 'intent-only', jobKey: JSON.stringify(['20:30', 'camera:40', observation.eventId]),
          startedAt: Date.now(), status: 'unresolved' } } };
    const filename = path.join(directory, 'state.json'); await writeOwnerOnlyJsonFile(filename, saved);
    const bytes = await fs.readFile(filename), nextScope = { ...scope, clientId: 12 };
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'intent-only-expiry', tier: scope.tier });
    (api as unknown as { auth: BlinkAuth }).auth.setAccountMetadata(nextScope);
    const create = () => NativeRecordingRuntime.create({ client: api, scope: nextScope, devices: [], matchingDevices: [], storagePath: root,
      config: resolveNativeRecordingConfig(undefined), firebase: BLINK_FIREBASE_CLIENT, appVersion: '61.0', report: jest.fn(),
      eventSourceFactory: () => ({ setDemand: jest.fn(), reconnect: jest.fn(), stop: jest.fn().mockResolvedValue(undefined) }) });
    await expect(create()).rejects.toThrow('Prior client/tier scope');
    await jest.advanceTimersByTimeAsync(120000);
    const replacement = await create(); runtimes.push(replacement); await replacement.start();
    await expect(api.withNativeStorageAdmission('fresh-after-intent-lease', async () => 'admitted', {},
      { accountId: 10, networkId: 20, syncModuleId: 30 })).resolves.toBe('admitted');
    expect(await fs.readFile(filename)).toEqual(bytes);
  });

  it('accepts an idle or terminal prior scope after restart without rewriting its evidence', async () => {
    const directory = path.join(root, '.blink-native-recording', '10-11-u000');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const saved: NativeRecordingRuntimeState = { version: 1, scope, consumed: [], catalogStartedAt: {}, refusedUntil: {}, downloads: [], remoteOperations: {},
      nativeByModule: { '20:30': { scope: { accountId: 10, networkId: 20, syncModuleId: 30 }, state: { version: 1,
        operation: { accountId: 10, networkId: 20, syncModuleId: 30, operationId: 'terminal-catalog', kind: 'catalog', phase: 'finished', statusReads: 1,
          commandId: 101, result: { status: 'failed', reason: 'command-failed', remoteStatus: 1 } } } } } };
    const filename = path.join(directory, 'state.json'); await writeOwnerOnlyJsonFile(filename, saved); const bytes = await fs.readFile(filename);
    const nextScope = { ...scope, clientId: 12, tier: 'u001' }, api = new BlinkApi({ email: '', password: '', hardwareId: 'idle-restart', tier: nextScope.tier });
    (api as unknown as { auth: BlinkAuth }).auth.setAccountMetadata(nextScope);
    const demand = jest.fn().mockResolvedValue(undefined);
    const runtime = await NativeRecordingRuntime.create({ client: api, scope: nextScope, devices: [], matchingDevices: [], storagePath: root,
      config: resolveNativeRecordingConfig(undefined), firebase: BLINK_FIREBASE_CLIENT, appVersion: '61.0', report: jest.fn(),
      eventSourceFactory: () => ({ setDemand: demand, reconnect: jest.fn().mockResolvedValue(undefined), stop: jest.fn().mockResolvedValue(undefined) }) });
    runtimes.push(runtime); await runtime.start();
    await expect(api.withNativeStorageAdmission('idle-proof', async () => 'admitted', {},
      { accountId: 10, networkId: 20, syncModuleId: 30 })).resolves.toBe('admitted');
    expect(demand).toHaveBeenCalledWith({ motionAccessory: false, hsv: false });
    expect(await fs.readFile(filename)).toEqual(bytes);
  });

  it('refuses an excluded camera with a duplicate native name before downloading or offering its catalog clip', async () => {
    const matchingDevices = [40, 41].map(providerId => ({ ...scope, networkId: 20, syncModuleId: 30, moduleId: '20:30',
      providerId, target: 'camera', cameraId: `camera:${providerId}`, nativeName: 'Entry native name' }));
    const f = await setup({ matchingDevices });
    await f.push(); await jest.advanceTimersByTimeAsync(60_000); await until(() => f.events.includes('clip-ambiguous'));
    expect(f.publicMotion).toHaveBeenCalledTimes(1);
    expect(f.transport.downloadMedia).not.toHaveBeenCalled(); expect(f.prepare).not.toHaveBeenCalled(); expect(f.readyMotion).not.toHaveBeenCalledWith(true);
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
  });

  itIfPosix('cleans canonical downloaded assets through a symlinked storage ancestor, including restart cleanup', async () => {
    const real = path.join(root, 'real'), linked = path.join(root, 'linked');
    await fs.mkdir(real, { mode: 0o700 }); await fs.symlink(real, linked);
    const f = await setup({ storagePath: linked });
    expect(f.runtime.cacheDirectory).toBe(await fs.realpath(f.runtime.cacheDirectory));
    await f.push(); await jest.advanceTimersByTimeAsync(60_000); await until(() => f.events.includes('offered'));
    await until(async () => (await f.state()).downloads.length === 0);
    expect(await fs.readdir(f.runtime.cacheDirectory)).toEqual([]);
    await f.runtime.stop();
    const saved = await f.state(), bytes = Buffer.from('saved before restart'), reference = path.join(f.runtime.cacheDirectory, 'restart-owned.mp4');
    await fs.writeFile(reference, bytes, { mode: 0o600 });
    saved.downloads.push({ reference, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), identity: 'old', capturedAt: new Date().toISOString(),
      moduleId: '20:30', cameraId: 'camera:40', jobId: 'old', policyEpoch: 0, cameraGeneration: 0 });
    await writeOwnerOnlyJsonFile(path.join(f.runtime.directory, 'state.json'), saved);
    const replacement = await setup({ storagePath: linked });
    await expect(fs.stat(reference)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await replacement.state()).downloads).toEqual([]);
    expect(replacement.transport.downloadMedia).not.toHaveBeenCalled();
    expect(replacement.events).not.toContain('local-delivery-faulted');
  });

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
    expect(f.client.setDeviceEarlyNotification).not.toHaveBeenCalled();
    expect(motionOnly.client.setDeviceEarlyNotification).not.toHaveBeenCalled();
    expect(disabled.client.setDeviceEarlyNotification).not.toHaveBeenCalled();
  });

  it('durably preserves an enabled original before changing Blink, then immediately offers a confirmed completed clip', async () => {
    const f = await setup({ earlyNotification: true });
    expect(f.settingWrites).toEqual([false]);
    expect(f.settingReceipts[0].devices).toEqual([expect.objectContaining({ kind: 'camera', networkId: 20, deviceId: 40, rawType: 'catalina', original: true })]);
    expect((await fs.stat(f.originalsPath)).mode & 0o777).toBe(0o600);
    await f.push();
    expect((await f.state()).core?.queue[0].eligibleAt).toBe(Date.now());
    await jest.advanceTimersByTimeAsync(0); await until(() => f.events.includes('offered'));
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
    expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
    expect(f.client.setDeviceEarlyNotification).toHaveBeenCalledTimes(1);
    await f.runtime.stop();
    expect(JSON.parse(await fs.readFile(f.originalsPath, 'utf8')).devices).toHaveLength(1);
    expect(f.settingWrites).toEqual([false]);
  });

  it('does not claim or later restore a camera whose Early Notification was already off', async () => {
    const f = await setup({ earlyNotification: true, earlyCurrent: false });
    expect(f.settingWrites).toEqual([]);
    await expect(fs.stat(f.originalsPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await f.runtime.stop(); await f.rebind({ devices: [] });
    expect(f.client.setDeviceEarlyNotification).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('forces On with a durable disabled original, then restores conditionally (manual=%s)', async manual => {
    const f = await setup({ earlyNotificationMode: 'on', earlyCurrent: false });
    expect(f.settingWrites).toEqual([true]);
    expect(f.settingReceipts[0].devices).toEqual([expect.objectContaining({ original: false })]);
    expect(JSON.parse(await fs.readFile(f.originalsPath, 'utf8')).version).toBe(2);
    await f.push();
    expect((await f.state()).core?.queue[0].eligibleAt).toBe(Date.now() + 60_000);
    await f.runtime.stop();
    if (manual) f.earlyProvider.current = false;
    await f.rebind({ devices: [] });
    expect(f.earlyProvider.current).toBe(false);
    expect(f.settingWrites).toEqual(manual ? [true] : [true, false]);
    expect(JSON.parse(await fs.readFile(f.originalsPath, 'utf8')).devices).toEqual([]);
  });

  it('switches force Off to force On through the saved original without changing the baseline', async () => {
    const f = await setup({ earlyNotification: true });
    await f.runtime.stop();
    await f.rebind({ devices: [{ ...f.devices[0], settings: { ...f.devices[0].settings, earlyNotificationMode: 'on' } }] });
    expect(f.settingWrites).toEqual([false, true]);
    expect(f.earlyProvider.current).toBe(true);
    expect(JSON.parse(await fs.readFile(f.originalsPath, 'utf8')).devices).toEqual([]);
    await f.runtime.stop(); await f.rebind({ devices: [] });
    expect(f.settingWrites).toEqual([false, true]);
  });

  it('reads the version-one enabled original and migrates its journal when restoration completes', async () => {
    const f = await setup({ earlyNotification: true });
    await f.runtime.stop();
    const prior = JSON.parse(await fs.readFile(f.originalsPath, 'utf8'));
    await fs.writeFile(f.originalsPath, JSON.stringify({ ...prior, version: 1 }), { mode: 0o600 });
    await f.rebind({ devices: [] });
    expect(f.settingWrites).toEqual([false, true]);
    expect(JSON.parse(await fs.readFile(f.originalsPath, 'utf8'))).toMatchObject({ version: 2, devices: [] });
  });

  it('keeps a version-one journal intact and refuses force On when its required new original cannot persist', async () => {
    const filename = path.join(root, '.blink-native-recording', '.early-notification-10-u000.json');
    await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
    const legacy = JSON.stringify({ version: 1, scope: { accountId: 10, tier: 'u000' }, devices: [] });
    await fs.writeFile(filename, legacy, { mode: 0o600 });
    const rename = fs.rename.bind(fs);
    const failedJournal = jest.spyOn(fs, 'rename').mockImplementation(async (...args: Parameters<typeof fs.rename>) => {
      if (String(args[1]).includes('.early-notification-')) throw new Error('Original journal disk failure');
      return rename(...args);
    });
    try {
      const f = await setup({ earlyNotificationMode: 'on', earlyCurrent: false });
      expect(f.settingWrites).toEqual([]); expect(f.earlyProvider.current).toBe(false);
      expect(f.events).toContain('early-notification-faulted');
      expect(await fs.readFile(filename, 'utf8')).toBe(legacy);
    } finally { failedJournal.mockRestore(); }
  });

  it('starts push and public motion before a held setting confirms, coalescing retries while retaining delayed HSV', async () => {
    const f = await setup({ earlyNotification: true, start: false });
    const gate = deferred<void>(); let entered = false;
    f.client.setDeviceEarlyNotification.mockImplementationOnce(async (_kind, _network, _id, _rawType, _enabled, options) => {
      await options?.beforeChange?.(true); entered = true; await gate.promise;
      return { supported: true, compatible: true, current: false, changed: true };
    });
    const starting = f.runtime.start();
    try {
      await until(() => entered);
      expect(f.setDemand).toHaveBeenCalledWith({ motionAccessory: true, hsv: true });
      await starting;
      await f.push(f.notification('before-confirmation'));
      expect(f.publicMotion).toHaveBeenCalledTimes(1);
      expect((await f.state()).core?.queue[0].eligibleAt).toBe(Date.now() + 60_000);
      await Promise.all([f.runtime.retryConnection(), f.runtime.retryConnection()]);
      expect(f.reconnectSource).toHaveBeenCalledTimes(2);
      expect(f.client.setDeviceEarlyNotification).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1000); gate.resolve();
      await until(() => f.events.includes('early-notification-confirmed-off'));
      f.media[0].created_at = new Date(Date.now()).toISOString();
      await f.push(f.notification('after-confirmation')); await jest.advanceTimersByTimeAsync(0);
      await until(() => f.events.includes('offered'));
      expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
      expect(f.publicMotion).toHaveBeenCalledTimes(2);
    } finally { gate.resolve(); await starting; }
  });

  it('reconnects with the real SDK while its accepted preference command is awaiting status', async () => {
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'preference-reconnect', tier: scope.tier });
    const auth = (api as unknown as { auth: BlinkAuth }).auth;
    auth.setAccountMetadata(scope);
    jest.spyOn(auth, 'ensureValidToken').mockResolvedValue(undefined);
    jest.spyOn(auth, 'getAuthHeaders').mockReturnValue({ Authorization: 'Bearer fixture-auth' });
    const status = deferred<Response>(), originalFetch = globalThis.fetch;
    const setDemand = jest.fn().mockResolvedValue(undefined), reconnect = jest.fn().mockResolvedValue(undefined), motion = jest.fn();
    let source!: FcmEventSourceOptions, configReads = 0, runtime: NativeRecordingRuntime | undefined;
    const fetch = jest.fn<ReturnType<typeof globalThis.fetch>, Parameters<typeof globalThis.fetch>>().mockImplementation(async (url, request) => {
      if (String(url).endsWith('/commands/707')) return status.promise;
      if (request?.method === 'POST') return new Response(JSON.stringify({ id: 707 }));
      configReads++;
      return new Response(JSON.stringify({ camera: [{ early_notification_compatible: true, early_notification: configReads === 1 }] }));
    });
    try {
      globalThis.fetch = fetch;
      runtime = await NativeRecordingRuntime.create({ client: api, scope, storagePath: root,
        config: resolveNativeRecordingConfig(undefined), firebase: BLINK_FIREBASE_CLIENT, appVersion: '61.0', report: jest.fn(), matchingDevices: [],
        devices: [{ binding: { accountId: 10, networkId: 20, providerId: 40, target: 'camera', cameraId: 'camera:40', nativeName: 'Entry' },
          rawType: 'catalina', settings: { exposeMotionDetected: true, homeKitSecureVideo: false, earlyNotificationMode: 'off' as const },
          motion, recording: () => undefined }],
        eventSourceFactory: input => { source = input; return { setDemand, reconnect, stop: jest.fn().mockResolvedValue(undefined) }; } });
      runtimes.push(runtime); await runtime.start();
      await until(() => fetch.mock.calls.some(([url]) => String(url).endsWith('/commands/707')));
      expect(setDemand).toHaveBeenCalledWith({ motionAccessory: true, hsv: false });
      expect(api.getRemoteOperationState().stateCommand).toMatchObject({ kind: 'early-notification', commandId: 707 });
      await Promise.all([runtime.retryConnection(), runtime.retryConnection()]);
      expect(reconnect).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenCalledTimes(3); // Config GET, one settings POST, one held status GET.
      await source.onNotification({ persistentMessageId: 'during-preference', scope, receivedAt: Date.now(), activatedAt: Date.now(),
        data: { category: 'motion', event_type: 'cam2sm_motion', camera: '40', target: 'camera', network: '20',
          created_at: new Date(Date.now()).toISOString() } }, new globalThis.AbortController().signal);
      expect(motion).toHaveBeenCalledTimes(1);
      let stopped = false; const stopping = runtime.stop().then(() => { stopped = true; });
      await realImmediate(); expect(stopped).toBe(false);
      status.resolve(new Response(JSON.stringify({ complete: true, status: 0 })));
      await stopping;
      expect(api.getRemoteOperationState().stateCommand).toBeUndefined();
      expect(JSON.parse(await fs.readFile(path.join(root, '.blink-native-recording', '.early-notification-10-u000.json'), 'utf8')).devices).toHaveLength(1);
    } finally {
      status.resolve(new Response(JSON.stringify({ complete: true, status: 0 })));
      await runtime?.stop().catch(() => undefined);
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps preference work stopped during a state-write fault, then resumes after explicit persistence recovery', async () => {
    const f = await setup({ earlyNotification: true, earlyCurrent: false });
    const rename = fs.rename.bind(fs);
    const failStateWrite = jest.spyOn(fs, 'rename').mockImplementation(async (...args: Parameters<typeof fs.rename>) => {
      if (args[1] === path.join(f.runtime.directory, 'state.json')) throw new Error('Runtime state disk failure');
      return rename(...args);
    });
    await expect(f.source.saveState({ version: 1, scope, firebase: BLINK_FIREBASE_CLIENT, persistentIds: [] }))
      .rejects.toThrow('Runtime state disk failure');
    f.client.setDeviceEarlyNotification.mockClear(); f.earlyProvider.current = true;
    try {
      await expect(f.runtime.retryConnection()).rejects.toThrow('Runtime state disk failure');
      expect(f.client.setDeviceEarlyNotification).not.toHaveBeenCalled();
      await expect(fs.stat(f.originalsPath)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(f.events).toContain('persistence-faulted');
      failStateWrite.mockRestore();
      await f.runtime.retryConnection(); await until(() => f.settingWrites.includes(false));
      expect(f.events).toContain('persistence-recovered');
      expect(f.client.setDeviceEarlyNotification).toHaveBeenCalled();
      expect(JSON.parse(await fs.readFile(f.originalsPath, 'utf8')).devices).toHaveLength(1);
    } finally {
      failStateWrite.mockRestore();
      await f.runtime.stop();
      runtimes = runtimes.filter(runtime => runtime !== f.runtime);
    }
  });

  it.each([
    { rawType: 'unsupported-model', calls: 0 },
    { earlyCompatible: false, calls: 1 },
    { earlyFailure: 'before-write' as const, calls: 1 },
    { earlyFailure: 'after-write' as const, calls: 1 },
  ])('keeps ordinary delay when Early Notification cannot be confirmed off: %p', async scenario => {
    const f = await setup({ earlyNotification: true, ...scenario });
    await f.push();
    expect((await f.state()).core?.queue[0].eligibleAt).toBe(Date.now() + 60_000);
    await jest.advanceTimersByTimeAsync(59_999);
    expect(f.transport.postEmpty).not.toHaveBeenCalled();
    expect(f.client.setDeviceEarlyNotification).toHaveBeenCalledTimes(scenario.calls);
  });

  it('refuses the setting POST after original persistence fails while keeping delayed recording available', async () => {
    const rename = fs.rename.bind(fs);
    const failedJournal = jest.spyOn(fs, 'rename').mockImplementation(async (...args: Parameters<typeof fs.rename>) => {
      if (String(args[1]).includes('.early-notification-')) throw new Error('Original journal disk failure');
      return rename(...args);
    });
    const f = await setup({ earlyNotification: true });
    failedJournal.mockRestore();
    expect(f.settingWrites).toEqual([]); expect(f.earlyProvider.current).toBe(true);
    expect(f.events).toContain('early-notification-faulted');
    await f.push(); await jest.advanceTimersByTimeAsync(60_000); await until(() => f.events.includes('offered'));
    expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('restores only a still-owned off value when management ends, preserving manual changes: external=%p', async externallyEnabled => {
    const f = await setup({ earlyNotification: true });
    await f.runtime.stop();
    f.earlyProvider.current = externallyEnabled;
    await f.rebind({ devices: [] });
    expect(f.earlyProvider.current).toBe(true);
    expect(f.settingWrites).toEqual(externallyEnabled ? [false] : [false, true]);
    expect(JSON.parse(await fs.readFile(f.originalsPath, 'utf8')).devices).toEqual([]);
    expect(f.setDemand).toHaveBeenLastCalledWith({ motionAccessory: false, hsv: false });
  });

  it('retains original ownership across an inherited-true replacement and authenticated client rotation', async () => {
    const f = await setup({ earlyNotification: true });
    await f.runtime.stop(); await f.rebind();
    expect(f.settingWrites).toEqual([false]);
    expect(JSON.parse(await fs.readFile(f.originalsPath, 'utf8')).devices).toHaveLength(1);
    await f.runtime.stop();
    f.client.getCachedIdentity.mockReturnValue({ ...scope, clientId: 12, sharedTier: 'u001' });
    await f.rebind({ scope: { ...scope, clientId: 12 }, devices: [] });
    expect(f.settingWrites).toEqual([false, true]);
    expect(JSON.parse(await fs.readFile(f.originalsPath, 'utf8')).devices).toEqual([]);
  });

  it('retains a lost readback original, reconfirms without another write, and delays events from before confirmation', async () => {
    const f = await setup({ earlyNotification: true, earlyFailure: 'after-write' });
    expect(f.settingWrites).toEqual([false]);
    expect(JSON.parse(await fs.readFile(f.originalsPath, 'utf8')).devices).toHaveLength(1);
    const earlier = Date.now();
    await jest.advanceTimersByTimeAsync(10_000);
    const since = f.events.length;
    f.earlyProvider.failure = undefined; await f.runtime.retryConnection();
    await until(() => f.events.slice(since).includes('early-notification-confirmed-off'));
    await f.push(f.notification('old-early-event', { created_at: new Date(earlier).toISOString() }));
    await f.push(f.notification('confirmed-off-event'));
    const queue = (await f.state()).core!.queue;
    expect(queue.map(job => [job.observation.eventId, job.observation.occurredAt, job.eligibleAt])).toEqual([
      [expect.any(String), earlier, earlier + 60_000], [expect.any(String), Date.now(), Date.now()],
    ]);
    expect(f.settingWrites).toEqual([false]);
    expect(f.client.setDeviceEarlyNotification).toHaveBeenCalledTimes(2);
  });

  it('retains the original and delayed event path while a setting command remains unresolved without replaying it', async () => {
    const f = await setup({ earlyNotification: true, earlyFailure: 'after-write' });
    f.client.getRemoteOperationState.mockReturnValue({ storage: [], persistenceFailed: false,
      stateCommand: { reservationId: 'setting-command', kind: 'early-notification', accountId: 10, networkId: 20,
        deviceId: 40, commandId: 707, phase: 'unresolved', statusReads: 1 } });
    f.client.reconcileKnownStateCommand.mockResolvedValue({ confirmed: false, commandId: 707 });
    await f.runtime.retryConnection(); await f.push();
    expect(f.client.setDeviceEarlyNotification).toHaveBeenCalledTimes(1);
    expect(f.settingWrites).toEqual([false]);
    expect(JSON.parse(await fs.readFile(f.originalsPath, 'utf8')).devices).toHaveLength(1);
    expect((await f.state()).core?.queue[0].eligibleAt).toBe(Date.now() + 60_000);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(f.transport.postEmpty).not.toHaveBeenCalled();
  });

  it('drains in-flight setting reconciliation before releasing ownership and leaves originals for the replacement', async () => {
    const f = await setup({ earlyNotification: true, earlyCurrent: false });
    const gate = deferred<void>(); let entered = false;
    f.client.setDeviceEarlyNotification.mockImplementationOnce(async (_kind, _network, _id, _rawType, _enabled, options) => {
      await options?.beforeChange?.(true); entered = true; await gate.promise;
      return { supported: true, compatible: true, current: false, changed: true };
    });
    const retry = f.runtime.retryConnection(); await until(() => entered);
    let stopped = false; const stopping = f.runtime.stop().then(() => { stopped = true; });
    await realImmediate();
    expect(stopped).toBe(false); expect(f.releaseOwnership).not.toHaveBeenCalled();
    gate.resolve(); await Promise.all([retry, stopping]);
    expect(f.releaseOwnership).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await fs.readFile(f.originalsPath, 'utf8')).devices).toHaveLength(1);
    const before = await fs.readFile(f.originalsPath, 'utf8');
    await jest.advanceTimersByTimeAsync(60_000);
    expect(await fs.readFile(f.originalsPath, 'utf8')).toBe(before);
  });

  it('does not replay a nearby unconsumed previous clip when the new immediate clip is still missing', async () => {
    const f = await setup({ earlyNotification: true });
    await jest.advanceTimersByTimeAsync(10_000);
    const occurredAt = Date.now();
    await f.push(); await jest.advanceTimersByTimeAsync(0);
    await until(async () => (await f.state()).core?.queue[0]?.attempts === 0 && (await f.state()).core?.queue[0]?.eligibleAt === Date.now() + 60_000
      && !(await f.state()).core?.operation);
    expect(f.transport.downloadMedia).not.toHaveBeenCalled();
    expect((await f.state()).core?.queue).toHaveLength(1);
    expect(f.readyMotion).not.toHaveBeenCalledWith(true);
    f.media.push({ ...f.media[0], id: 102, created_at: new Date(occurredAt).toISOString(),
      media: '/api/v1/accounts/10/networks/20/sync_modules/30/local_storage/manifest/91/clip/request/102/' });
    // The cached old row must not gain a fuzzy match just because time passes.
    await jest.advanceTimersByTimeAsync(59_999);
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1); await until(() => f.events.includes('offered'));
    expect(f.transport.getJson.mock.calls.filter(([route]) => route.base === 'api')).toHaveLength(2);
    const consumed = (await f.state()).consumed.map(value => JSON.parse(value));
    expect(consumed).toEqual([expect.arrayContaining([102])]);
  });

  it('does not promote the early cached clip when a fallback catalog request is refused', async () => {
    const f = await setup({ earlyNotification: true });
    await jest.advanceTimersByTimeAsync(10_000);
    const occurredAt = Date.now();
    await f.push(); await jest.advanceTimersByTimeAsync(0);
    await until(async () => (await f.state()).core?.queue[0]?.attempts === 0
      && (await f.state()).core?.queue[0]?.eligibleAt === occurredAt + 60_000 && !(await f.state()).core?.operation);
    f.transport.postEmpty.mockRejectedValueOnce(new BlinkHttpError('Sync Module busy', 409, '',
      'https://rest-u000.immedia-semi.com/api/v1/example', 'POST'));
    await jest.advanceTimersByTimeAsync(60_000);
    await until(async () => f.events.includes('catalog-refused') && !(await f.state()).core?.operation);
    expect(f.transport.downloadMedia).not.toHaveBeenCalled();
    f.media.push({ ...f.media[0], id: 102, created_at: new Date(occurredAt).toISOString(),
      media: '/api/v1/accounts/10/networks/20/sync_modules/30/local_storage/manifest/91/clip/request/102/' });
    await jest.advanceTimersByTimeAsync(60_000); await until(() => f.events.includes('offered'));
    const consumed = (await f.state()).consumed.map(value => JSON.parse(value));
    expect(consumed).toEqual([expect.arrayContaining([102])]);
    expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ hsv: false }, {}, 'hsv-disabled'],
    [{}, { event_type: 'cloud_motion' }, 'event-not-native'],
    [{ nativeStorage: false }, {}, 'missing-module'],
  ] as const)('reports the HSV gate without exposing provider event identity: %s', async (options, values, reason) => {
    const f = await setup(options);
    await f.push(f.notification('private-provider-message', values));
    expect(f.events).toContain(`motion-suppressed-${reason}`);
    expect(f.transport.postEmpty).not.toHaveBeenCalled();
    expect(JSON.stringify(f.reports)).not.toContain('private-provider-message');
  });

  it('reports inactive Home permission and survives a throwing log observer', async () => {
    const f = await setup({ report: () => { throw new Error('Logger unavailable'); } });
    f.delegate.updateRecordingActive(false);
    await f.push();
    expect(f.events).toContain('motion-suppressed-home-policy-inactive');
    f.delegate.updateRecordingActive(true);
    await f.push(f.notification('next-event'));
    await jest.advanceTimersByTimeAsync(60_000); await until(() => f.events.includes('offered'));
    const flows = f.reports.filter(report => ['acquisition-queued', 'acquisition-attempt', 'downloaded', 'prepared', 'offered'].includes(report.event))
      .map(report => report.context?.flow);
    expect(new Set(flows).size).toBe(1);
    expect(flows[0]).toMatch(/^flow-[a-f0-9]{10}$/);
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
    expect(f.events).toEqual(expect.arrayContaining(['push-received', 'motion-decoded', 'acquisition-queued', 'acquisition-attempt', 'acquisition-retrieved', 'download-started', 'downloaded', 'preparation-started', 'prepared', 'offered']));
    expect(f.events.some(event => event.includes('retained'))).toBe(false);
    const stream = f.delegate.handleRecordingStreamRequest(7);
    expect((await stream.next()).value?.isLast).toBe(false);
    expect((await stream.next()).value?.isLast).toBe(true);
    expect((await stream.next()).done).toBe(true);
    f.delegate.acknowledgeStream(7);
    expect(f.events).toEqual(expect.arrayContaining(['home-requested', 'home-transfer-finished', 'home-transport-acknowledged']));
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(2); expect(f.transport.getJson).toHaveBeenCalledTimes(3);
    expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
    await until(async () => (await f.state()).downloads.length === 0);
    expect((await fs.stat(f.runtime.directory)).mode & 0o777).toBe(0o700);
    expect((await fs.stat(path.join(f.runtime.directory, 'state.json'))).mode & 0o777).toBe(0o600);
    expect((await f.state()).consumed).toHaveLength(1);
  });

  it('finishes a timed-out prepared download and records the next motion without restarting the runtime', async () => {
    const f = await setup({ config: { initialDelaySeconds: 0 } });
    f.transport.downloadMedia.mockRejectedValueOnce(new OperationTimeoutError());
    await f.push(); await jest.advanceTimersByTimeAsync(0);
    await until(async () => f.events.includes('download-invalid-media') && !(await f.state()).core?.operation);
    const failed = await f.state();
    expect(failed.nativeByModule['20:30'].state.operation).toMatchObject({ phase: 'finished', result: { status: 'failed', reason: 'invalid-media' } });
    expect(failed.core?.queue).toEqual([]);
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(2); expect(f.transport.getJson).toHaveBeenCalledTimes(3);
    expect(f.prepare).not.toHaveBeenCalled(); expect(f.readyMotion).not.toHaveBeenCalled();
    await f.push(f.notification('next-motion')); await jest.advanceTimersByTimeAsync(0);
    await until(() => f.events.includes('offered'));
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(3); expect(f.transport.getJson).toHaveBeenCalledTimes(4);
    expect(f.transport.downloadMedia).toHaveBeenCalledTimes(2); expect(f.prepare).toHaveBeenCalledTimes(1);
    expect(f.readyMotion).toHaveBeenLastCalledWith(true);
  });

  it('finishes a timed-out prepared catalog and records the next motion without operator recovery', async () => {
    const f = await setup({ config: { initialDelaySeconds: 0 } });
    f.transport.getJson.mockResolvedValueOnce({ complete: true, status: 0, commands: [{ id: 200 }] }).mockRejectedValueOnce(new OperationTimeoutError());
    await f.push(); await jest.advanceTimersByTimeAsync(0);
    await until(async () => f.events.includes('catalog-invalid-result') && !(await f.state()).core?.operation);
    const failed = await f.state();
    expect(failed.nativeByModule['20:30'].state.operation).toMatchObject({ phase: 'finished', result: { status: 'failed', reason: 'invalid-result' } });
    expect(failed.core?.queue).toEqual([]);
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(1); expect(f.transport.getJson).toHaveBeenCalledTimes(2);
    expect(f.transport.downloadMedia).not.toHaveBeenCalled(); expect(f.readyMotion).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(60_000); f.media[0].created_at = new Date(Date.now()).toISOString();
    await f.push(f.notification('next-motion')); await jest.advanceTimersByTimeAsync(0);
    await until(() => f.events.includes('offered'));
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(3); expect(f.transport.getJson).toHaveBeenCalledTimes(5);
    expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1); expect(f.prepare).toHaveBeenCalledTimes(1);
    expect(f.setDemand).toHaveBeenCalledTimes(1); expect(f.reconnectSource).not.toHaveBeenCalled();
  });

  it('reuses the real configured delegate after client handoff, discards old media, and offers only fresh motion', async () => {
    const f = await setup(); f.delegate.updateRecordingAudioActive(true);
    await f.push(); await jest.advanceTimersByTimeAsync(60_000); await until(() => f.events.includes('offered'));
    const prior = f.delegate.policy;
    await f.runtime.stop();
    expect(f.delegate.policy).toEqual({ ...prior, epoch: prior.epoch + 1 });
    expect(f.delegate.available).toBe(true); expect(f.delegate.snapshot().bytes).toBe(0);
    await expect(f.delegate.handleRecordingStreamRequest(1).next()).rejects.toThrow('No permitted prepared');
    const nextScope = { ...scope, clientId: 12 };
    f.client.getCachedIdentity.mockReturnValue({ ...nextScope, sharedTier: 'u001' });
    const replacement = await f.rebind({ scope: nextScope });
    expect(f.delegate.policy.allowed).toBe(true); expect(f.delegate.policy.configured).toBe(true);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(f.prepare).toHaveBeenCalledTimes(1);
    f.media[0].created_at = new Date(Date.now()).toISOString();
    await f.push({ ...f.notification('new-client-motion'), scope: nextScope });
    await jest.advanceTimersByTimeAsync(60_000); await until(() => f.prepare.mock.calls.length === 2 && f.delegate.snapshot().state === 'ready');
    expect(f.prepare.mock.calls[1][1]).toEqual(configuration()); expect(f.prepare.mock.calls[1][2]).toBe(true);
    expect(f.readyMotion).toHaveBeenLastCalledWith(true);
    const stream = f.delegate.handleRecordingStreamRequest(2); await stream.next();
    expect((await stream.next()).value?.isLast).toBe(true);
    await replacement.stop();
  });

  it('quarantines old prepared media and a new excluded-name collision after same-scope inventory replacement', async () => {
    const f = await setup(); await f.push(); await jest.advanceTimersByTimeAsync(60_000); await until(() => f.events.includes('offered'));
    await f.runtime.stop();
    const matchingDevices = [40, 41].map(providerId => ({ accountId: 10, networkId: 20, syncModuleId: 30, moduleId: '20:30',
      providerId, target: 'camera', cameraId: `camera:${providerId}`, nativeName: 'Entry native name' }));
    await f.rebind({ matchingDevices });
    expect(f.delegate.policy.allowed).toBe(true); expect(f.delegate.snapshot().bytes).toBe(0);
    f.media[0].created_at = new Date(Date.now()).toISOString();
    await f.push(f.notification('new-inventory-motion')); await jest.advanceTimersByTimeAsync(60_000);
    await until(() => f.events.includes('clip-ambiguous'));
    expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1); expect(f.prepare).toHaveBeenCalledTimes(1);
    expect(f.delegate.snapshot().bytes).toBe(0);
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

  it('abandons a lost acknowledgement within its lease and allows fresh motion after restart without replaying the old event', async () => {
    const f = await setup(); f.transport.postEmpty.mockRejectedValue(new Error('Acknowledgement lost after dispatch'));
    await f.push(); await jest.advanceTimersByTimeAsync(60_000);
    await until(async () => (await f.state()).core?.operation?.status === 'unresolved');
    await f.remoteSave((await f.state()).remoteOperations ?? {});
    await jest.advanceTimersByTimeAsync(120000);
    await until(async () => (await f.state()).nativeByModule['20:30'].state.operation?.phase === 'abandoned');
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(1);
    await f.runtime.stop();
    const restored = await setup();
    await restored.push(restored.notification('motion-3')); await jest.advanceTimersByTimeAsync(60_000);
    restored.media[0].created_at = new Date(Date.now() - 60000).toISOString();
    await until(() => restored.events.includes('offered'));
    await until(async () => (await restored.state()).core?.queue.length === 0);
    expect(restored.transport.postEmpty).toHaveBeenCalledTimes(2);
    const saved = await restored.state();
    expect(saved.core?.queue).toEqual([]);
    expect(saved.nativeByModule['20:30'].state.abandoned).toHaveLength(1);
  });

  it.each(['ordinary', 'liveView'] as const)('waits using cached %s ownership without requests, then resumes after its terminal release', async kind => {
    const f = await setup();
    f.client.getRemoteOperationState.mockReturnValue({ storage: [], persistenceFailed: false,
      ...(kind === 'ordinary' ? { stateCommand: { reservationId: 'ordinary', accountId: 10, networkId: 20,
        kind: 'arm', phase: 'accepted', commandId: 70, statusReads: 1, expiresAt: Date.now() + 120000 } as const } :
        { liveView: { reservationId: 'manual-live-view', accountId: 10, networkId: 20, deviceId: 40,
          kind: 'camera', phase: 'active', commandId: 71, retirementAcknowledged: false, expiresAt: Date.now() + 120000 } as const }) });
    await f.push(); await jest.advanceTimersByTimeAsync(119_000);
    expect(f.transport.postEmpty).not.toHaveBeenCalled(); expect(f.transport.getJson).not.toHaveBeenCalled();
    expect(f.client.withNativeStorageAdmission).not.toHaveBeenCalled(); expect((await f.state()).core?.queue[0].attempts).toBe(0);
    f.client.getRemoteOperationState.mockReturnValue({ storage: [], persistenceFailed: false });
    await jest.advanceTimersByTimeAsync(1000); await until(() => f.events.includes('offered'));
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(2); expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
  });

  it('treats legacy unknown storage as advisory and permits a fresh motion job without probing the old owner', async () => {
    const f = await setup({ config: { maxJobAgeSeconds: 120 } });
    const remote: ReturnType<BlinkApi['getRemoteOperationState']> = { storage: [{ accountId: 10, networkId: 20, syncModuleId: 30,
      operationId: 'lost-ack', kind: 'catalog', phase: 'intent' }], persistenceFailed: false };
    f.client.getRemoteOperationState.mockReturnValue(remote);
    await f.push(); await jest.advanceTimersByTimeAsync(60_000); await until(() => f.events.includes('offered'));
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
    expect(f.transport.getJson.mock.calls.some(([route]) => route.path.includes('lost-ack'))).toBe(false);
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
    await f.runtime.retryConnection();
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

  it.each(['before-result', 'before-download-index'] as const)('reclaims the %s crash window and resumes recording at the minimum cache capacity', async crashWindow => {
    const config = { maxCachedBytes: 32 * 1024 * 1024 }, f = await setup({ config }), pending = deferred<NativeStoredMedia>();
    let promoted: NativeStoredMedia | undefined, partial = '';
    f.transport.downloadMedia.mockImplementationOnce(async () => {
      const id = randomUUID(), reference = path.join(f.runtime.cacheDirectory, `native-${id}.mp4`), bytes = Buffer.from('promoted before process exit');
      await fs.writeFile(reference, bytes, { mode: 0o600 });
      partial = path.join(f.runtime.cacheDirectory, `.native-${id}.partial`); await fs.link(reference, partial);
      promoted = { reference, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
      return pending.promise;
    });
    await f.push(); await jest.advanceTimersByTimeAsync(60_000); await until(() => !!promoted);
    const checkpoint = await f.state(), operation = checkpoint.nativeByModule['20:30'].state.operation!;
    expect(operation.phase).toBe('prepared'); expect(checkpoint.downloads).toEqual([]);
    await f.runtime.stop(); pending.resolve(promoted!);
    if (crashWindow === 'before-download-index') { operation.phase = 'finished'; operation.result = { status: 'ready', value: promoted! }; }
    await writeOwnerOnlyJsonFile(path.join(f.runtime.directory, 'state.json'), checkpoint);
    await fs.writeFile(path.join(f.runtime.cacheDirectory, '.DS_Store'), 'preserve');
    const recovered = await setup({ config });
    await expect(fs.stat(promoted!.reference)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(partial)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readFile(path.join(recovered.runtime.cacheDirectory, '.DS_Store'), 'utf8')).toBe('preserve');
    expect(recovered.transport.postEmpty).not.toHaveBeenCalled(); expect(recovered.transport.getJson).not.toHaveBeenCalled();
    expect(recovered.prepare).not.toHaveBeenCalled();
    const retained = (await recovered.state()).nativeByModule['20:30'].state.operation!;
    expect(retained.commandId).toBe(operation.commandId); expect(retained.phase).toBe('finished');
    if (crashWindow === 'before-download-index') expect(retained.result).toEqual(operation.result);
    else expect(retained.result).toMatchObject({ status: 'failed', reason: 'discarded' });
    await recovered.push(recovered.notification('fresh-after-crash')); await jest.advanceTimersByTimeAsync(60_000);
    await until(() => recovered.events.includes('offered'));
    expect(recovered.transport.downloadMedia).toHaveBeenCalledTimes(1); expect(recovered.prepare).toHaveBeenCalledTimes(1);
  });

  it('reclaims generated cache remnants while preserving an unknown remote obligation', async () => {
    const f = await setup(); f.transport.postEmpty.mockRejectedValueOnce(new Error('lost acknowledgement'));
    await f.push(); await jest.advanceTimersByTimeAsync(60_000); await until(async () => (await f.state()).core?.operation?.status === 'unresolved');
    await f.runtime.stop(); const before = (await f.state()).nativeByModule['20:30'];
    const reference = path.join(f.runtime.cacheDirectory, `native-${randomUUID()}.mp4`);
    await fs.writeFile(reference, 'orphan from an earlier local permission period', { mode: 0o600 });
    const recovered = await setup();
    await expect(fs.stat(reference)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await recovered.state()).nativeByModule['20:30']).toEqual(before);
    expect(recovered.transport.postEmpty).not.toHaveBeenCalled(); expect(recovered.transport.getJson).not.toHaveBeenCalled();
  });

  itIfPosix('refuses generated-looking symlinks instead of deleting their target or treating them as an owned orphan', async () => {
    const f = await setup(); await f.runtime.stop();
    const outside = path.join(root, 'preserved.mp4'), reference = path.join(f.runtime.cacheDirectory, `native-${randomUUID()}.mp4`);
    await fs.writeFile(outside, 'preserve', { mode: 0o600 }); await fs.symlink(outside, reference);
    await expect(setup()).rejects.toThrow('Recording cache identity changed');
    expect(await fs.readFile(outside, 'utf8')).toBe('preserve'); expect((await fs.lstat(reference)).isSymbolicLink()).toBe(true);
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

  it.each(['preparing', 'ready', 'streaming'] as const)('fences an old-account local clip after scope changes while %s', async phase => {
    const pending = deferred<PreparedNativeRecording>();
    const prepare = jest.fn<ReturnType<typeof prepareNativeRecording>, Parameters<typeof prepareNativeRecording>>().mockReturnValue(pending.promise);
    const f = await setup(phase === 'preparing' ? { prepare } : {});
    await f.push(); await jest.advanceTimersByTimeAsync(60000);
    if (phase === 'preparing') {
      await until(() => prepare.mock.calls.length === 1);
      f.client.getCachedIdentity.mockReturnValue({ ...scope, accountId: 42, clientId: 100, sharedTier: 'u001' });
      const value = prepared(configuration(), false); pending.resolve(value);
      await until(() => f.events.includes('offered') || f.events.includes('delivery-not-offered-policy-changed'));
      expect(f.events).not.toContain('offered');
      expect(f.readyMotion).not.toHaveBeenCalledWith(true);
      expect(value.disposed).toBe(true);
    } else {
      await until(() => f.events.includes('offered'));
      const stream = f.delegate.handleRecordingStreamRequest(52);
      if (phase === 'streaming') expect((await stream.next()).value?.isLast).toBe(false);
      f.client.getCachedIdentity.mockReturnValue({ ...scope, accountId: 42, clientId: 100, sharedTier: 'u001' });
      await expect(stream.next()).rejects.toThrow();
      expect(f.delegate.snapshot().bytes).toBe(0);
      expect(f.readyMotion).toHaveBeenLastCalledWith(false);
    }
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
  });

  it.each(['preparing', 'ready'] as const)('keeps permitted local media deliverable after an unrelated journal failure while %s', async phase => {
    const pending = deferred<PreparedNativeRecording>();
    const prepare = jest.fn<ReturnType<typeof prepareNativeRecording>, Parameters<typeof prepareNativeRecording>>().mockReturnValue(pending.promise);
    const f = await setup(phase === 'preparing' ? { prepare } : {});
    await f.push(); await jest.advanceTimersByTimeAsync(60000);
    if (phase === 'preparing') await until(() => prepare.mock.calls.length === 1);
    else await until(() => f.events.includes('offered'));
    const saving = jest.spyOn(secureJson, 'writeOwnerOnlyJsonFile').mockRejectedValueOnce(new Error('unrelated journal fault'));
    try {
      await expect(f.remoteSave({})).rejects.toThrow('unrelated journal fault');
      if (phase === 'preparing') pending.resolve(prepared(configuration(), false));
      await until(() => f.events.includes('offered'));
      const stream = f.delegate.handleRecordingStreamRequest(53);
      expect((await stream.next()).value?.isLast).toBe(false);
      expect((await stream.next()).value?.isLast).toBe(true);
      await stream.next(); f.delegate.acknowledgeStream(53);
      await f.runtime.retryConnection();
      expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
    } finally { pending.resolve(prepared(configuration(), false)); saving.mockRestore(); }
  });

  it('drains policy-triggered asset cleanup before releasing the old runtime writer', async () => {
    const pending = deferred<PreparedNativeRecording>(), gate = deferred<void>();
    const prepare = jest.fn<ReturnType<typeof prepareNativeRecording>, Parameters<typeof prepareNativeRecording>>().mockReturnValue(pending.promise);
    const f = await setup({ prepare }); await f.push(); await jest.advanceTimersByTimeAsync(60_000);
    await until(() => prepare.mock.calls.length === 1);
    const reference = (await f.state()).downloads[0].reference, open = fs.open.bind(fs);
    let held = false;
    const reading = jest.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      if (!held && args[0] === reference) { held = true; await gate.promise; }
      return open(...args);
    });
    try {
      f.delegate.updateCameraActive(false); await until(() => held);
      let stopped = false; const stopping = f.runtime.stop().then(() => { stopped = true; });
      pending.resolve(prepared(configuration(), false));
      await until(async () => (await f.state()).downloads.length === 0);
      expect(stopped).toBe(false); expect(f.releaseOwnership).not.toHaveBeenCalled();
      gate.resolve(); await stopping;
      expect(f.releaseOwnership).toHaveBeenCalledTimes(1);
      const checkpoint = await fs.readFile(path.join(f.runtime.directory, 'state.json'));
      await f.runtime.policyChanged('camera:40', f.delegate.policy);
      expect(await fs.readFile(path.join(f.runtime.directory, 'state.json'))).toEqual(checkpoint);
    } finally { gate.resolve(); reading.mockRestore(); }
  });

  it('stops acquisition and local delivery even if the isolated receiver reports a stop failure', async () => {
    const f = await setup(); await f.push(); f.stopSource.mockRejectedValueOnce(new Error('Receiver stop failed'));
    await expect(f.runtime.stop()).rejects.toThrow('Receiver stop failed'); runtimes = runtimes.filter(runtime => runtime !== f.runtime);
    expect(f.releaseOwnership).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(f.transport.postEmpty).not.toHaveBeenCalled(); expect(f.delegate.policy.allowed).toBe(true);
    expect(f.delegate.snapshot().state).toBe('idle');
    expect(f.readyMotion).not.toHaveBeenCalledWith(true);
  });

  it('preserves accepted and terminal command writes while SDK ownership drains at shutdown', async () => {
    const f = await setup(), gate = deferred<void>();
    f.releaseOwnership.mockImplementationOnce(async () => {
      await gate.promise;
      await f.remoteSave({ stateCommand: { reservationId: 'arm-draining', accountId: 10, networkId: 20,
        kind: 'arm', commandId: 707, phase: 'accepted', statusReads: 0, expiresAt: Date.now() + 120000 } });
      await f.remoteSave({});
    });
    const stopping = f.runtime.stop();
    const stopped = expect(stopping).resolves.toBeUndefined();
    try {
      await until(() => f.releaseOwnership.mock.calls.length === 1);
      const releasedBeforeDrain = f.runtime.localWriterReleased;
      gate.resolve(); await stopped;
      expect(releasedBeforeDrain).toBe(false);
      expect((await f.state()).remoteOperations).toEqual({});
      expect(f.runtime.localWriterReleased).toBe(true);
      expect(f.events).not.toContain('persistence-faulted');
      const replacement = await f.rebind();
      expect(replacement.localWriterReleased).toBe(false);
    } finally { gate.resolve(); }
  });

  it('recovers native recording on explicit retry after a transient journal failure', async () => {
    const f = await setup();
    const saving = jest.spyOn(secureJson, 'writeOwnerOnlyJsonFile').mockRejectedValueOnce(new Error('temporary disk failure'));
    await expect(f.remoteSave({})).rejects.toThrow('temporary disk failure');
    saving.mockRestore();
    await f.push(); expect(f.transport.postEmpty).not.toHaveBeenCalled();
    await f.runtime.retryConnection();
    expect(f.events).toContain('persistence-recovered');
    await f.push(f.notification('fresh-after-disk-recovery'));
    await jest.advanceTimersByTimeAsync(60000); await until(() => f.events.includes('offered'));
    expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
  });

  it.each(['queued', 'persisting-intent', 'permission-revoked'] as const)(
    'retains accepted motion through held persistence recovery: %s', async phase => {
      const f = await setup({ config: { maxRetries: 0 } }), intent = deferred<void>(), recovery = deferred<void>();
      const write = secureJson.writeOwnerOnlyJsonFile;
      let heldIntent = false, recovering = false;
      const saving = jest.spyOn(secureJson, 'writeOwnerOnlyJsonFile').mockImplementation(async (...args) => {
        if (phase === 'persisting-intent' && !heldIntent && (args[1] as NativeRecordingRuntimeState).core?.operation?.status === 'active') {
          heldIntent = true; await intent.promise;
        }
        return write(...args);
      });
      f.client.retryRemoteOperationPersistence.mockImplementationOnce(async () => { recovering = true; await recovery.promise; });
      try {
        await f.push(f.notification('accepted-before-fault'));
        if (phase === 'persisting-intent') {
          await jest.advanceTimersByTimeAsync(60000); await until(() => heldIntent);
        }
        saving.mockRejectedValueOnce(new Error('temporary unrelated journal failure'));
        const failed = expect(f.remoteSave({})).rejects.toThrow('temporary unrelated journal failure');
        intent.resolve(); await failed;
        const retry = f.runtime.retryConnection();
        await until(() => recovering);
        if (phase === 'permission-revoked') f.delegate.updateCameraActive(false);
        await jest.advanceTimersByTimeAsync(60000);
        expect(f.transport.postEmpty).not.toHaveBeenCalled();
        expect(f.events).not.toContain('persistence-recovered');
        recovery.resolve(); await retry;
        if (phase === 'permission-revoked') {
          await jest.advanceTimersByTimeAsync(60000);
          expect(f.transport.postEmpty).not.toHaveBeenCalled();
          expect(f.events).toContain('job-cancelled');
          expect((await f.state()).core?.queue).toEqual([]);
        } else {
          await jest.advanceTimersByTimeAsync(1000);
          await until(() => f.events.includes('offered'));
          expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
          expect(f.events).not.toContain('job-cancelled');
          expect((await f.state()).core?.rememberedEvents).toContain(JSON.stringify(['20:30', 'camera:40', 'accepted-before-fault']));
        }
      } finally { intent.resolve(); recovery.resolve(); saving.mockRestore(); }
    });

  it.each(['success', 'recovery-write-failed', 'stop-during-flush'] as const)(
    'serializes recovery composite state with concurrent ownership saves: %s', async mode => {
      const f = await setup(), disk = deferred<void>(), flush = deferred<void>();
      const write = secureJson.writeOwnerOnlyJsonFile;
      let holdRecovery = false, held = false, flushing = false;
      const eventId = 'newer-than-last-committed-state';
      const saving = jest.spyOn(secureJson, 'writeOwnerOnlyJsonFile').mockImplementation(async (...args) => {
        if (holdRecovery && !held && (args[1] as NativeRecordingRuntimeState).core?.queue.some(job => job.observation.eventId === eventId)) {
          held = true; await disk.promise;
        }
        return write(...args);
      });
      f.client.retryRemoteOperationPersistence.mockImplementationOnce(async () => { flushing = true; await flush.promise; });
      try {
        await f.source.saveState({ version: 1, scope, firebase: BLINK_FIREBASE_CLIENT, persistentIds: ['old-checkpoint'] });
        saving.mockRejectedValueOnce(new Error('new motion was not committed'));
        await expect(f.push(f.notification(eventId))).rejects.toThrow('new motion was not committed');
        if (mode === 'recovery-write-failed') {
          saving.mockRejectedValueOnce(new Error('recovery disk write failed'));
          await expect(f.runtime.retryConnection()).rejects.toThrow('recovery disk write failed');
          expect(f.events).not.toContain('persistence-recovered');
        }
        holdRecovery = true;
        const retry = f.runtime.retryConnection(); await until(() => held);
        const owner: BlinkRemoteOperationOwnership = { stateCommand: { reservationId: 'concurrent-sdk-owner', accountId: 10,
          networkId: 20, kind: 'arm', phase: 'unresolved', statusReads: 0, expiresAt: Date.now() + 120000 } };
        const concurrent = f.remoteSave(owner);
        disk.resolve(); await until(() => flushing); await concurrent;
        const recovered = await f.state();
        expect(recovered.core?.queue.map(job => job.observation.eventId)).toEqual([eventId]);
        expect(recovered.remoteOperations).toEqual(owner);
        await f.source.saveState({ version: 1, scope, firebase: BLINK_FIREBASE_CLIENT, persistentIds: ['new-checkpoint'] });
        expect((await f.state()).core?.queue.map(job => job.observation.eventId)).toEqual([eventId]);
        expect((await f.state()).remoteOperations).toEqual(owner);
        expect(f.events).not.toContain('persistence-recovered');
        let stopping: Promise<void> | undefined;
        if (mode === 'stop-during-flush') {
          stopping = f.runtime.stop();
          expect(f.runtime.localWriterReleased).toBe(false);
        }
        flush.resolve(); await retry; await stopping;
        expect((await f.state()).push?.persistentIds).toEqual(['new-checkpoint']);
        expect(f.transport.postEmpty).not.toHaveBeenCalled();
        if (stopping) expect(f.runtime.localWriterReleased).toBe(true);
      } finally { disk.resolve(); flush.resolve(); saving.mockRestore(); }
    });

  it.each(['concurrent-core-save', 'initial-owner-intent'] as const)(
    'recovers an unsent accepted job after %s persistence failure without losing permission', async phase => {
      const f = await setup({ config: { maxRetries: 0 } }), intent = deferred<void>();
      const write = secureJson.writeOwnerOnlyJsonFile;
      let held = false, failedOwner = false;
      const saving = jest.spyOn(secureJson, 'writeOwnerOnlyJsonFile').mockImplementation(async (...args) => {
        const state = args[1] as NativeRecordingRuntimeState;
        if (phase === 'concurrent-core-save' && !held && state.core?.operation?.status === 'active'
          && state.catalogStartedAt['20:30'] === undefined) { held = true; await intent.promise; }
        if (phase === 'initial-owner-intent' && !failedOwner && state.nativeByModule?.['20:30']?.state.operation?.phase === 'intent') {
          failedOwner = true; throw new Error('initial owner intent disk failure');
        }
        return write(...args);
      });
      try {
        await f.push(f.notification('must-survive-storage-health-fault'));
        await jest.advanceTimersByTimeAsync(60000);
        if (phase === 'concurrent-core-save') {
          await until(() => held);
          const queued = f.push(f.notification('later-job'));
          saving.mockRejectedValueOnce(new Error('concurrent coordinator disk failure'));
          const rejected = expect(queued).rejects.toThrow('concurrent coordinator disk failure');
          intent.resolve(); await rejected;
        } else await until(() => failedOwner);
        await until(() => f.events.includes('persistence-faulted'));
        expect(f.transport.postEmpty).not.toHaveBeenCalled();
        await f.runtime.retryConnection();
        await jest.advanceTimersByTimeAsync(phase === 'initial-owner-intent' ? 60000 : 5000);
        await until(() => f.events.includes('offered'));
        expect(f.events).not.toContain('job-cancelled');
        expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
        expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
      } finally { intent.resolve(); saving.mockRestore(); }
    });

  it('keeps every durable core snapshot monotonic when local delivery faults during queued observations and recovery', async () => {
    const f = await setup(), offer = deferred<void>(), disk = deferred<void>(), flush = deferred<void>();
    const offering = jest.spyOn(f.delegate, 'offerDownloaded').mockImplementationOnce(async () => {
      await offer.promise; throw new Error('local delivery failed independently of journal');
    });
    const write = secureJson.writeOwnerOnlyJsonFile, ids = ['queued-A', 'queued-B', 'queued-C'];
    const writes: string[][] = [];
    let held = false, flushing = false;
    const saving = jest.spyOn(secureJson, 'writeOwnerOnlyJsonFile').mockImplementation(async (...args) => {
      const queued = (args[1] as NativeRecordingRuntimeState).core?.queue.map(job => job.observation.eventId).filter(id => ids.includes(id)) ?? [];
      if (queued.length && !held) { held = true; await disk.promise; }
      await write(...args);
      if (held) writes.push(queued);
    });
    f.client.retryRemoteOperationPersistence.mockImplementationOnce(async () => { flushing = true; await flush.promise; });
    try {
      await f.push(); await jest.advanceTimersByTimeAsync(60000);
      await until(async () => offering.mock.calls.length === 1 && (await f.state()).core?.queue.length === 0);
      const a = f.push(f.notification(ids[0])); await until(() => held);
      const b = f.push(f.notification(ids[1])), c = f.push(f.notification(ids[2]));
      offer.resolve(); await until(() => f.events.includes('local-delivery-faulted'));
      const retry = f.runtime.retryConnection();
      disk.resolve(); await until(() => flushing); await Promise.all([a, b, c]);
      for (let index = 1; index < writes.length; index++) {
        expect(writes[index]).toEqual(expect.arrayContaining(writes[index - 1]));
      }
      expect(writes.at(-1)).toEqual(ids);
      expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
      flush.resolve(); await retry;
      expect((await f.state()).core?.queue.map(job => job.observation.eventId)).toEqual(ids);
    } finally { offer.resolve(); disk.resolve(); flush.resolve(); saving.mockRestore(); offering.mockRestore(); }
  });

  it.each(['intent-save', 'accepted-save', 'permission-revoked'] as const)(
    'recovers a clip persistence fault using its dispatch proof: %s', async phase => {
      const f = await setup({ config: { maxRetries: 0 } }), write = secureJson.writeOwnerOnlyJsonFile;
      let failed = false;
      const saving = jest.spyOn(secureJson, 'writeOwnerOnlyJsonFile').mockImplementation(async (...args) => {
        const operation = (args[1] as NativeRecordingRuntimeState).nativeByModule?.['20:30']?.state.operation;
        if (!failed && operation?.kind === 'clip' && operation.phase === (phase === 'accepted-save' ? 'accepted' : 'intent')) {
          failed = true; throw new Error('clip ownership journal failure');
        }
        return write(...args);
      });
      try {
        await f.push(f.notification('clip-job-must-survive'));
        await jest.advanceTimersByTimeAsync(60000);
        await until(() => failed && f.events.includes('persistence-faulted'));
        const postCount = f.transport.postEmpty.mock.calls.length;
        expect(postCount).toBe(phase === 'accepted-save' ? 2 : 1);
        await f.runtime.retryConnection();
        if (phase === 'permission-revoked') {
          f.delegate.updateCameraActive(false);
          await until(() => f.events.includes('job-cancelled'));
        }
        await jest.advanceTimersByTimeAsync(5000);
        if (phase === 'intent-save') {
          await until(() => f.events.includes('offered'));
          expect(f.events).not.toContain('job-cancelled');
          expect(f.transport.downloadMedia).toHaveBeenCalledTimes(1);
          expect(f.transport.postEmpty).toHaveBeenCalledTimes(2);
        } else {
          expect(f.transport.postEmpty).toHaveBeenCalledTimes(postCount);
          expect(f.transport.downloadMedia).not.toHaveBeenCalled();
          expect(f.events).not.toContain('offered');
          if (phase === 'accepted-save') {
            expect((await f.state()).core?.operation?.status).toBe('unresolved');
            expect((await f.state()).core?.queue[0].attempts).toBe(1);
          } else expect((await f.state()).core?.queue).toEqual([]);
        }
        expect(f.transport.postEmpty.mock.calls.filter(([route]) => route.path.endsWith('/manifest/request'))).toHaveLength(1);
        expect(f.transport.postEmpty.mock.calls.filter(([route]) => route.path.includes('/clip/request/')))
          .toHaveLength(phase === 'permission-revoked' ? 0 : 1);
      } finally { saving.mockRestore(); }
    });

  it.each(['failed-save', 'committed-new-scope', 'permission-revoked', 'stopped'] as const)(
    'uses committed auth authority while a real candidate save is pending: %s', async phase => {
      const f = await setup({ start: false, config: { maxRetries: 0 } }); await f.runtime.stop();
      const persist = deferred<void>(), response = deferred<void>();
      let saving = false, settled = false, candidate: Promise<void> = Promise.resolve();
      const api = new BlinkApi({ email: '', password: '', hardwareId: 'committed-auth-runtime', tier: scope.tier, sharedTier: scope.tier,
        authStorage: { load: async () => null, clear: async () => undefined, save: async () => {
          saving = true; await persist.promise;
          if (phase !== 'committed-new-scope') throw new Error('candidate auth save failed');
        } } });
      const auth = (api as unknown as { auth: BlinkAuth }).auth;
      auth.setAccountMetadata({ accountId: 10, clientId: 11, tier: scope.tier });
      const tokens = auth as unknown as { accessToken: string; refreshToken: string; tokenExpiry: Date;
        captureTokensUnlocked(body: { access_token: string; refresh_token: string; expires_in: number; client_id: number }, header: null): Promise<void> };
      tokens.accessToken = 'fixture-committed-token'; tokens.refreshToken = 'fixture-committed-refresh';
      tokens.tokenExpiry = new Date(Date.now() + 3600000);
      jest.spyOn(auth, 'ensureValidToken').mockResolvedValue(undefined);
      const admissions = jest.spyOn(api, 'withNativeStorageAdmission');
      const originalFetch = globalThis.fetch;
      let runtime: NativeRecordingRuntime | undefined;
      globalThis.fetch = jest.fn().mockImplementation(async (url: string, request: RequestInit) => {
        if (request.method === 'POST') return new Response(JSON.stringify({ id: url.endsWith('/manifest/request') ? 101 : 303 }));
        if (url.endsWith('/commands/101')) return new Response(JSON.stringify({ complete: true, status: 0, commands: [{ id: 202 }] }));
        if (url.endsWith('/commands/303')) return new Response(JSON.stringify({ complete: true, status: 0 }));
        if (url.endsWith('/media/202')) {
          candidate = tokens.captureTokensUnlocked({ access_token: 'fixture-candidate-token', refresh_token: 'fixture-candidate-refresh',
            expires_in: 3600, client_id: 12 }, null).then(() => { settled = true; }, () => { settled = true; });
          await response.promise;
          return new Response(JSON.stringify({ manifest_id: 91, media: f.media, page_size: 1000, pagination_key: null }));
        }
        if (url.endsWith('/clip/request/101/')) return new Response(Buffer.from('offline native video bytes'));
        throw new Error('Unexpected offline auth-authority fixture route');
      });
      try {
        runtime = await f.rebind({ client: api });
        await f.push(f.notification('job-during-uncommitted-auth'));
        await jest.advanceTimersByTimeAsync(60000); await until(() => saving);
        expect(api.getCachedIdentity()).toMatchObject(scope);
        expect(auth.getAuthHeaders().Authorization).toBe('Bearer fixture-committed-token');
        expect(settled).toBe(false);
        if (phase === 'failed-save') {
          response.resolve();
          await until(() => admissions.mock.calls.length === 2);
          await jest.advanceTimersByTimeAsync(300);
          await until(() => f.events.includes('offered'));
          await until(async () => (await f.state()).core?.queue.length === 0);
          expect(settled).toBe(false);
          persist.resolve(); await candidate;
          expect(api.getCachedIdentity()).toMatchObject(scope);
          expect(f.events).not.toContain('job-cancelled');
          expect((await f.state()).core?.queue).toEqual([]);
        } else {
          const stopping = phase === 'stopped' ? runtime.stop() : undefined;
          if (phase === 'permission-revoked') f.delegate.updateCameraActive(false);
          persist.resolve(); await candidate;
          if (phase === 'committed-new-scope') expect(api.getCachedIdentity().clientId).toBe(12);
          response.resolve(); await stopping;
          if (phase !== 'stopped') await runtime.retryConnection();
          await until(async () => phase === 'stopped' || f.events.includes('job-cancelled') || (await f.state()).core?.queue.length === 0);
          expect(f.events).not.toContain('offered');
          expect((await f.state()).downloads).toEqual([]);
          if (stopping) expect(runtime.localWriterReleased).toBe(true);
        }
        const posts = jest.mocked(globalThis.fetch).mock.calls.filter(([, request]) => request?.method === 'POST');
        expect(posts.filter(([url]) => String(url).endsWith('/manifest/request'))).toHaveLength(1);
        expect(posts.filter(([url]) => !String(url).endsWith('/manifest/request'))).toHaveLength(phase === 'failed-save' ? 1 : 0);
      } finally { persist.resolve(); response.resolve(); await candidate; await runtime?.stop().catch(() => undefined); globalThis.fetch = originalFetch; }
    });

  it.each([false, true])('flushes latest real SDK ownership before recovering its journal (acknowledged: %s)', async acknowledged => {
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'runtime-journal-recovery', tier: scope.tier });
    const auth = (api as unknown as { auth: BlinkAuth }).auth;
    auth.setAccountMetadata(scope);
    jest.spyOn(auth, 'ensureValidToken').mockResolvedValue(undefined);
    jest.spyOn(auth, 'getAuthHeaders').mockReturnValue({ Authorization: 'Bearer fixture-auth' });
    const originalFetch = globalThis.fetch, write = secureJson.writeOwnerOnlyJsonFile;
    const events: string[] = [], recovered: NativeRecordingRuntimeState[] = [], motion = jest.fn();
    let source!: FcmEventSourceOptions, runtime!: NativeRecordingRuntime, failAll = false, failLatest = false;
    let filename = path.join(root, '.blink-native-recording', '10-11-u000', 'state.json');
    const saving = jest.spyOn(secureJson, 'writeOwnerOnlyJsonFile').mockImplementation(async (location, state) => {
      if (location === filename && (failAll || (failLatest && (state as NativeRecordingRuntimeState).remoteOperations?.stateCommand))) {
        throw new Error('Remote ownership journal failure');
      }
      return write(location, state);
    });
    try {
      globalThis.fetch = jest.fn().mockImplementation(async (_url, request) => {
        if (request.method === 'POST' && acknowledged) return new Response(JSON.stringify({ id: 707 }));
        throw new OperationTimeoutError();
      });
      runtime = await NativeRecordingRuntime.create({ client: api, scope, storagePath: root,
        config: resolveNativeRecordingConfig(undefined), firebase: BLINK_FIREBASE_CLIENT, appVersion: '61.0', matchingDevices: [],
        report: event => {
          events.push(event);
          if (event === 'persistence-recovered') recovered.push(JSON.parse(readFileSync(filename, 'utf8')));
        }, devices: [{ binding: { accountId: 10, networkId: 20, providerId: 40, target: 'camera', cameraId: 'camera:40', nativeName: 'Entry' },
          settings: { exposeMotionDetected: true, homeKitSecureVideo: false, earlyNotificationMode: 'unmanaged' as const }, motion, recording: () => undefined }],
        eventSourceFactory: input => { source = input; return { setDemand: jest.fn().mockResolvedValue(undefined),
          reconnect: jest.fn().mockResolvedValue(undefined), stop: jest.fn().mockResolvedValue(undefined) }; } });
      filename = path.join(runtime.directory, 'state.json');
      runtimes.push(runtime); await runtime.start();
      await source.saveState({ version: 1, scope, firebase: BLINK_FIREBASE_CLIENT, persistentIds: ['before-journal-fault'] });
      failAll = true;
      await expect(api.armNetwork(20)).rejects.toBeDefined();
      const owner = api.getRemoteOperationState().stateCommand!;
      expect(owner).toMatchObject({ kind: 'arm', phase: 'unresolved', ...(acknowledged ? { commandId: 707 } : {}) });
      expect(api.getRemoteOperationState().persistenceFailed).toBe(true);
      const notify = () => source.onNotification({ persistentMessageId: randomUUID(), scope, receivedAt: Date.now(), activatedAt: Date.now(),
        data: { category: 'motion', event_type: 'cam2sm_motion', camera: '40', target: 'camera', network: '20',
          created_at: new Date(Date.now()).toISOString() } }, new globalThis.AbortController().signal);
      failAll = false; failLatest = true;
      await expect(runtime.retryConnection()).rejects.toBeDefined();
      expect(events).not.toContain('persistence-recovered');
      expect(api.getRemoteOperationState().persistenceFailed).toBe(true);
      await notify(); expect(motion).not.toHaveBeenCalled();
      failLatest = false;
      jest.mocked(globalThis.fetch).mockResolvedValue(new Response(JSON.stringify({ complete: false, status: 0 })));
      await Promise.all([runtime.retryConnection(), runtime.retryConnection()]);
      expect(recovered).toHaveLength(1);
      expect(recovered[0].remoteOperations?.stateCommand).toEqual(owner);
      expect(api.getRemoteOperationState().persistenceFailed).toBe(false);
      expect(JSON.parse(await fs.readFile(filename, 'utf8')).remoteOperations.stateCommand).toEqual(api.getRemoteOperationState().stateCommand);
      expect(api.getRemoteOperationState().stateCommand?.expiresAt).toBe(owner.expiresAt);
      await expect(api.withNativeStorageAdmission('still-excluded', async () => 'unsafe', {},
        { accountId: 10, networkId: 20, syncModuleId: 30 })).rejects.toMatchObject({ dispatched: false });
      await notify(); expect(motion).toHaveBeenCalledTimes(1);
      expect(jest.mocked(globalThis.fetch).mock.calls.filter(([, request]) => request?.method === 'POST')).toHaveLength(1);
    } finally { failAll = false; failLatest = false; saving.mockRestore(); globalThis.fetch = originalFetch; }
  });

  it('drains a late preference journal before a replacement loads its preserved original', async () => {
    const f = await setup({ earlyNotification: true, earlyCurrent: false }), gate = deferred<void>();
    const write = secureJson.writeOwnerOnlyJsonFile, realpath = fs.realpath.bind(fs), lstat = fs.lstat.bind(fs);
    let held = false, replacementResolvingRoot = false;
    const resolving = jest.spyOn(fs, 'realpath').mockImplementation(async location => {
      const resolved = await realpath(location);
      if (location === root) replacementResolvingRoot = true;
      return resolved;
    });
    const loading = jest.spyOn(fs, 'lstat').mockImplementation(location => lstat(location));
    const saving = jest.spyOn(secureJson, 'writeOwnerOnlyJsonFile').mockImplementation(async (...args) => {
      if (!held && path.basename(args[0]) === path.basename(f.originalsPath)) { held = true; await gate.promise; }
      return write(...args);
    });
    try {
      f.earlyProvider.current = true;
      await f.runtime.retryConnection(); await until(() => held);
      const stopping = expect(f.runtime.stop()).rejects.toBeInstanceOf(OperationTimeoutError);
      await jest.advanceTimersByTimeAsync(120000); await stopping;
      runtimes = runtimes.filter(runtime => runtime !== f.runtime);
      loading.mockClear();
      const blocked = expect(f.rebind()).rejects.toBeInstanceOf(OperationTimeoutError);
      await until(() => replacementResolvingRoot);
      await jest.advanceTimersByTimeAsync(120000); await blocked;
      expect(loading).not.toHaveBeenCalledWith(f.originalsPath);
      expect(loading).not.toHaveBeenCalledWith(path.join(f.runtime.directory, 'state.json'));
      gate.resolve(); await f.rebind();
      expect(JSON.parse(await fs.readFile(f.originalsPath, 'utf8')).devices)
        .toEqual([expect.objectContaining({ deviceId: 40, original: true })]);
      expect(f.settingWrites).toEqual([false]);
    } finally {
      gate.resolve(); saving.mockRestore(); resolving.mockRestore(); loading.mockRestore();
    }
  });

  it('bounds shutdown during a held journal write and serializes the late file replacement before a new runtime writes', async () => {
    const f = await setup(), gate = deferred<void>();
    const write = secureJson.writeOwnerOnlyJsonFile, realpath = fs.realpath.bind(fs), lstat = fs.lstat.bind(fs);
    let held = false, replacementResolvingRoot = false;
    const resolving = jest.spyOn(fs, 'realpath').mockImplementation(async location => {
      const resolved = await realpath(location);
      if (location === root) replacementResolvingRoot = true;
      return resolved;
    });
    const loading = jest.spyOn(fs, 'lstat').mockImplementation(location => lstat(location));
    const saving = jest.spyOn(secureJson, 'writeOwnerOnlyJsonFile').mockImplementationOnce(async (...args) => {
      held = true; await gate.promise; return write(...args);
    });
    try {
      const pending = f.remoteSave({});
      const pendingFailure = expect(pending).rejects.toBeInstanceOf(OperationTimeoutError);
      await until(() => held);
      const stopped = expect(f.runtime.stop()).rejects.toBeInstanceOf(OperationTimeoutError);
      await jest.advanceTimersByTimeAsync(120000); await pendingFailure; await stopped;
      expect(f.releaseOwnership).toHaveBeenCalledTimes(1);
      runtimes = runtimes.filter(runtime => runtime !== f.runtime);
      loading.mockClear();
      const blocked = expect(f.rebind()).rejects.toBeInstanceOf(OperationTimeoutError);
      await until(() => replacementResolvingRoot);
      await jest.advanceTimersByTimeAsync(120000); await blocked;
      expect(loading).not.toHaveBeenCalledWith(path.join(f.runtime.directory, 'state.json'));
      gate.resolve();
      let replacementSource!: FcmEventSourceOptions;
      await f.rebind({ eventSourceFactory: input => {
        replacementSource = input;
        return { setDemand: jest.fn().mockResolvedValue(undefined), reconnect: jest.fn().mockResolvedValue(undefined), stop: jest.fn().mockResolvedValue(undefined) };
      } });
      await replacementSource.saveState({ version: 1, scope, firebase: BLINK_FIREBASE_CLIENT, persistentIds: ['new-checkpoint'] });
      expect((await f.state()).push?.persistentIds).toEqual(['new-checkpoint']);
    } finally { gate.resolve(); saving.mockRestore(); resolving.mockRestore(); loading.mockRestore(); }
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
