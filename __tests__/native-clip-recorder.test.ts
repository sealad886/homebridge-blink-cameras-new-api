import { Buffer } from 'node:buffer';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CameraRecordingConfiguration } from 'homebridge';
import { NativeClipRecorder, type NativeClipCameraTarget, type NativeClipPolicySnapshot, type NativeClipApi } from '../src/native-clip-recorder';
import type { PreparedSavedClip } from '../src/accessories/saved-clip-preparation';
import type { NativeClipDescriptor } from '../src/blink-api/local-storage';

const config = (): CameraRecordingConfiguration => ({
  prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: 4000 },
  videoCodec: { type: 0, resolution: [640, 360, 15], parameters: { profile: 0, level: 0, bitRate: 300, iFrameInterval: 4000 } },
  audioCodec: { type: 0, samplerate: 1, bitrate: 32, audioChannels: 1, bitrateMode: 0 },
});
let directory: string;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'native-clip-recorder-')); });
afterEach(async () => { jest.restoreAllMocks(); await fs.rm(directory, { recursive: true, force: true }); });
function fixture() {
  let time = Date.parse('2026-11-03T12:00:00Z'), command = 0;
  let clips: NativeClipDescriptor[] = [];
  jest.spyOn(Date, 'now').mockImplementation(() => time);
  const api = {
    requestLocalStorageManifest: jest.fn(async () => ({ commandId: ++command })),
    getLocalStorageManifest: jest.fn(async () => ({ state: 'ready' as const, catalog: { manifestId: 'manifest-1', clips } })),
    requestLocalStorageClip: jest.fn(async () => ({ commandId: ++command })),
    getPreparedLocalStorageClip: jest.fn(async () => Buffer.from('native-clip')),
    getCommandStatus: jest.fn(async () => ({ complete: true, status: 0 })),
  } as unknown as jest.Mocked<NativeClipApi>;
  const policy: NativeClipPolicySnapshot = { permission: { epoch: 0, recordingActive: true, cameraActive: true, audioActive: true, motionAllowed: true },
    configuration: { revision: 0, value: config() } };
  const target: NativeClipCameraTarget = { getPolicySnapshot: () => policy,
    deliverSavedClip: jest.fn(async () => ({ status: 'delivered' as const, acknowledgedAt: new Date(time).toISOString() })) };
  const disposed: jest.Mock[] = [];
  const prepare = jest.fn(async () => {
    const dispose = jest.fn(); disposed.push(dispose);
    return { dispose, buffer: { bytes: 40 }, audioActive: true, preparedSpanUpperBoundUs: 60000000n } as unknown as PreparedSavedClip;
  });
  const make = () => new NativeClipRecorder({ storagePath: directory, accountId: 1, api, prepare, now: () => time,
    delay: async ms => { if (ms === 50) await new Promise(r => globalThis.setTimeout(r, 5)); else time += ms; }, logicalCpuCount: 4 });
  const recorder = make();
  const register = (r = recorder, key = 'camera-1', name = 'Garden Camera') => {
    r.registerModule({ networkId: 2, syncModuleId: 3 });
    r.registerCamera({ cameraKey: key, cameraId: 4, networkId: 2, syncModuleId: 3, providerName: name }, target);
  };
  const clip = (id: string, ago = 0, token = 'GardenCamera'): NativeClipDescriptor => ({
    clipId: id, cameraToken: token, capturedAt: new Date(time - ago).toISOString(), sizeKiB: 5073,
  });
  return { api, policy, target, prepare, disposed, recorder, make, register, clip,
    set clips(value: NativeClipDescriptor[]) { clips = value; }, advance(ms: number) { time += ms; } };
}

it('baselines existing history and delivers one newly observed native clip with capture provenance', async () => {
  const f = fixture(); await f.recorder.initialize(); f.register();
  f.clips = [f.clip('1', 30000)]; await f.recorder.scan(); await f.recorder.runPending();
  expect(f.api.requestLocalStorageClip).not.toHaveBeenCalled();
  f.advance(5000); f.clips = [f.clip('2'), f.clip('1', 35000)]; await f.recorder.scan(); await f.recorder.runPending();
  expect(f.api.requestLocalStorageClip).toHaveBeenCalledTimes(1);
  expect(f.target.deliverSavedClip).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    cameraKey: 'camera-1', capturedAt: '2026-11-03T12:00:05.000Z',
  }), expect.anything(), expect.anything());
  expect(f.disposed[0]).toHaveBeenCalledTimes(1);
  expect(f.recorder.getActivity().cameras[0].nativeStorageObservedAt).toBe('2026-11-03T12:00:05.000Z');
  expect(f.prepare).toHaveBeenCalledWith(expect.objectContaining({ expectedBytes: 11 }), expect.anything(), true, expect.anything());
  const persisted = JSON.parse(await fs.readFile(f.recorder.ledgerPath, 'utf8'));
  expect(Object.values(persisted.jobs)).toEqual([expect.objectContaining({ sourceBytes: 11, sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/), clip: expect.objectContaining({ sizeKiB: 5073 }) })]);
  await f.recorder.scan(); await f.recorder.runPending();
  expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1);
  expect(f.recorder.getActivity().cameras[0]).toMatchObject({ delivered: 1 });
  await f.recorder.stop();
});

it('exposes durable empty-catalog baselines per camera and never writes a parallel final health report', async () => {
  const f = fixture(); await f.recorder.initialize(); f.register();
  expect(f.recorder.getActivity().cameras[0].baseline).toBe('pending');
  expect(f.recorder.getActivity().cameras[0].nativeStorageObservedAt).toBeUndefined();
  f.api.getLocalStorageManifest.mockRejectedValueOnce(new Error('offline')); await f.recorder.scan();
  expect(f.recorder.getActivity().cameras[0].baseline).toBe('pending');
  await f.recorder.scan(); expect(f.recorder.getActivity().cameras[0].baseline).toBe('complete');
  expect(f.recorder.getActivity().cameras[0].nativeStorageObservedAt).toBeUndefined();
  f.register(f.recorder, 'new-camera', 'New Camera');
  expect(f.recorder.getActivity().modules[0].baseline).toBe('pending');
  await f.recorder.scan(); expect(f.recorder.getActivity().cameras.every(camera => camera.baseline === 'complete')).toBe(true);
  expect(f.recorder.getActivity().modules[0].baseline).toBe('complete');
  expect(await fs.readdir(f.recorder.directory)).not.toContain('health.json');
});

it('fences ring-only policy before preparation and deduplicates its off-policy catalog without later catch-up', async () => {
  const f = fixture(); await baseline(f); await enqueue(f);
  f.policy.permission.motionAllowed = false; f.policy.permission.epoch = 1;
  f.policy.configuration.value!.eventTriggerTypes = [2]; await f.recorder.notifyPolicyChanged('camera-1');
  f.advance(1000); const offPolicy = f.clip('3'); f.clips = [offPolicy]; await f.recorder.scan(); await f.recorder.runPending();
  expect(f.prepare).not.toHaveBeenCalled(); expect(f.api.requestLocalStorageClip).not.toHaveBeenCalled();
  f.policy.permission.motionAllowed = true; f.policy.permission.epoch = 2; f.policy.configuration.value = config();
  await f.recorder.notifyPolicyChanged('camera-1'); await f.recorder.scan(); await f.recorder.runPending();
  expect(f.target.deliverSavedClip).not.toHaveBeenCalled();
  f.advance(1000); f.clips = [offPolicy, f.clip('4')]; await f.recorder.scan(); await f.recorder.runPending();
  expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1);
});

async function baseline(f: ReturnType<typeof fixture>) { await f.recorder.initialize(); f.register(); await f.recorder.scan(); }
async function enqueue(f: ReturnType<typeof fixture>, id = '2') { f.advance(1000); f.clips = [f.clip(id)]; await f.recorder.scan(); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function until(predicate: () => boolean) {
  for (let i = 0; i < 200 && !predicate(); i++) await new Promise(r => globalThis.setTimeout(r, 2));
  expect(predicate()).toBe(true);
}

it('discovers late unsorted entries without a moving timestamp cursor and rejects over-age entries', async () => {
  const f = fixture(); await baseline(f); f.advance(60000);
  const latest = f.clip('9'); f.clips = [latest]; await f.recorder.scan(); await f.recorder.runPending();
  f.advance(30000); f.clips = [latest, f.clip('4', 60000), f.clip('1', 20 * 60000)];
  await f.recorder.scan(); await f.recorder.runPending();
  expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(2);
  expect(f.api.requestLocalStorageClip.mock.calls.map(c => c[2])).toEqual(['9', '4']);
});

it('keeps completed dedupe and activation across restart without treating process epoch reset as revocation', async () => {
  const f = fixture(); await baseline(f); await enqueue(f); await f.recorder.runPending(); await f.recorder.stop();
  const restarted = f.make(); await restarted.initialize(); f.register(restarted); await restarted.scan(); await restarted.runPending();
  expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1);
  f.advance(1000); f.clips = [f.clip('3')]; await restarted.scan(); await restarted.runPending();
  expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(2); await restarted.stop();
});

it('uses one canonical token matcher for underscores/Unicode and refuses normalized-name collisions', async () => {
  const f = fixture(); await f.recorder.initialize(); f.register(f.recorder, 'garden', 'Cámara_ ２'); await f.recorder.scan();
  f.advance(1000); f.clips = [f.clip('2', 0, 'Cámara_２')]; await f.recorder.scan(); await f.recorder.runPending();
  expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1);
  f.register(f.recorder, 'collision', 'Cámara_２!'); f.advance(1000); f.clips = [f.clip('3', 0, 'Cámara_２')];
  await f.recorder.scan(); await f.recorder.runPending();
  expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1);
  expect(f.recorder.getActivity().modules[0].reason).toBe('camera-unmatched');
});

it('does not reset privacy eligibility for ordinary configuration renegotiation and permits video-only clips', async () => {
  const f = fixture(); await baseline(f); await enqueue(f);
  f.policy.configuration.revision = 1; f.policy.configuration.value = config();
  await f.recorder.notifyPolicyChanged('camera-1'); await f.recorder.runPending();
  expect(f.prepare).toHaveBeenCalledTimes(1);
  f.policy.permission.audioActive = false; f.policy.permission.epoch = 1;
  await f.recorder.notifyPolicyChanged('camera-1'); f.advance(1000); f.clips = [f.clip('3')];
  await f.recorder.scan(); await f.recorder.runPending();
  expect(f.prepare).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), false, expect.anything());
});

it('cancels queued jobs on recording revocation and never catches up clips from the disabled period', async () => {
  const f = fixture(); await baseline(f); await enqueue(f);
  f.policy.permission.recordingActive = false; f.policy.permission.epoch = 1;
  await f.recorder.notifyPolicyChanged('camera-1'); f.advance(1000); const disabled = f.clip('3');
  f.clips = [disabled]; await f.recorder.scan(); await f.recorder.runPending();
  f.advance(1000); f.policy.permission.recordingActive = true; f.policy.permission.epoch = 2;
  await f.recorder.notifyPolicyChanged('camera-1'); await f.recorder.scan(); await f.recorder.runPending();
  expect(f.prepare).not.toHaveBeenCalled();
  f.advance(1000); f.clips = [disabled, f.clip('4')]; await f.recorder.scan(); await f.recorder.runPending();
  expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1);
});

it('aborts active preparation immediately and disposes a late bundle after permission changes', async () => {
  const f = fixture(); await baseline(f); await enqueue(f);
  const pending = deferred<PreparedSavedClip>(); f.prepare.mockImplementationOnce(() => pending.promise);
  const work = f.recorder.runPending(); await until(() => f.prepare.mock.calls.length === 1);
  f.policy.permission.cameraActive = false; f.policy.permission.epoch = 1;
  const changed = f.recorder.notifyPolicyChanged('camera-1');
  const signal = (f.prepare.mock.calls as unknown as [unknown, unknown, unknown, AbortSignal][])[0][3];
  expect(signal.aborted).toBe(true);
  const dispose = jest.fn(); pending.resolve({ buffer: { bytes: 40 }, dispose } as unknown as PreparedSavedClip);
  await changed; await work;
  expect(dispose).toHaveBeenCalledTimes(1); expect(f.target.deliverSavedClip).not.toHaveBeenCalled();
});

it('reprepares waiting media after configuration changes without changing its original capture identity', async () => {
  const f = fixture(); await baseline(f); await enqueue(f); const original = f.prepare.getMockImplementation()!;
  f.prepare.mockImplementationOnce(async () => { f.policy.configuration.revision = 1; return original(); });
  await f.recorder.runPending(); expect(f.target.deliverSavedClip).not.toHaveBeenCalled();
  f.advance(1000); await f.recorder.runPending();
  expect(f.prepare).toHaveBeenCalledTimes(2); expect(f.api.requestLocalStorageClip).toHaveBeenCalledTimes(1);
  expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1);
});

it('records uncertain after an offer interrupted by shutdown and never repeats it after restart', async () => {
  const f = fixture(); await baseline(f); await enqueue(f);
  const pending = deferred<{ status: 'delivered' }>(); jest.spyOn(f.target, 'deliverSavedClip').mockImplementation(() => pending.promise);
  const work = f.recorder.runPending(); await until(() => (f.target.deliverSavedClip as jest.Mock).mock.calls.length === 1);
  await f.recorder.stop(); await work; expect(f.recorder.getActivity().cameras[0].uncertain).toBe(1);
  pending.resolve({ status: 'delivered' });
  const restarted = f.make(); await restarted.initialize(); f.register(restarted); await restarted.scan(); await restarted.runPending();
  expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1); await restarted.stop();
});

it('resumes an acknowledged pending clip by GET without a duplicate preparation POST', async () => {
  const f = fixture(); await baseline(f); await enqueue(f);
  f.api.getCommandStatus.mockImplementation(async (_network, command) => ({ complete: command < 3, status: 0 }));
  const pending = deferred<{ complete: boolean; status: number }>(); f.api.getCommandStatus.mockImplementation(async (_network, command) => command >= 3 ? pending.promise : { complete: true, status: 0 });
  const work = f.recorder.runPending(); await until(() => f.api.requestLocalStorageClip.mock.calls.length === 1);
  await f.recorder.stop(); await work;
  f.api.getCommandStatus.mockResolvedValue({ complete: true, status: 0 });
  const restarted = f.make(); await restarted.initialize(); f.register(restarted); await restarted.runPending();
  expect(f.api.requestLocalStorageClip).toHaveBeenCalledTimes(1); expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1);
  pending.resolve({ complete: true, status: 0 }); await restarted.stop();
});

it('expires stale queue entries without fetching or preparing footage', async () => {
  const f = fixture(); await baseline(f); await enqueue(f); f.advance(16 * 60000); await f.recorder.runPending();
  expect(f.api.requestLocalStorageClip).not.toHaveBeenCalled(); expect(f.recorder.getActivity().queue).toBe(0);
  expect(f.recorder.getActivity().cameras[0].reason).toBe('expired');
});

it('keeps one job timeline coherent when a newer native clip appears and retains expiry after terminal pruning', async () => {
  const f = fixture(); await baseline(f); await enqueue(f, 'old');
  const original = f.prepare.getMockImplementation()!, waiting = deferred<PreparedSavedClip>();
  f.prepare.mockImplementationOnce(() => waiting.promise);
  const work = f.recorder.runPending(); await until(() => f.prepare.mock.calls.length === 1);
  const old = f.recorder.getActivity().cameras[0].job!;
  expect(old).toMatchObject({ state: 'preparing-media', capturedAt: '2026-11-03T12:00:01.000Z',
    discoveredAt: '2026-11-03T12:00:01.000Z', downloadedAt: '2026-11-03T12:00:01.000Z' });
  f.advance(1000); f.clips = [f.clip('new')]; await f.recorder.scan();
  expect(f.recorder.getActivity().cameras[0]).toMatchObject({ lastNativeClipAt: '2026-11-03T12:00:02.000Z', job: old });
  waiting.resolve(await original()); await work;
  expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(2);
  await enqueue(f, 'expire'); f.advance(16 * 60000); await f.recorder.runPending();
  const state = f.recorder.getActivity().cameras[0];
  expect(state.job).toBeUndefined(); expect(state.lastExpiredAt).toBe('2026-11-03T12:16:03.000Z');
  expect(state.lastExpiredReason).toBe('expired');
  const ledger = JSON.parse(await fs.readFile(f.recorder.ledgerPath, 'utf8'));
  expect(ledger.jobs).toEqual({}); expect(ledger.cameras['camera-1'].lastExpiredAt).toBe(state.lastExpiredAt);
});

it('preserves uncertain transport state if permissions are revoked after replay motion was offered', async () => {
  const f = fixture(); await baseline(f); await enqueue(f);
  const pending = deferred<{ status: 'delivered' }>(); jest.spyOn(f.target, 'deliverSavedClip').mockImplementation(() => pending.promise);
  const work = f.recorder.runPending(); await until(() => (f.target.deliverSavedClip as jest.Mock).mock.calls.length === 1);
  f.policy.permission.cameraActive = false; f.policy.permission.epoch = 1; await f.recorder.notifyPolicyChanged('camera-1'); await work;
  expect(f.recorder.getActivity().cameras[0].uncertain).toBe(1); pending.resolve({ status: 'delivered' });
});

it('polls a genuinely pending numeric-status command beyond eighteen short polls within the elapsed budget', async () => {
  const f = fixture(); await baseline(f); await enqueue(f); let polls = 0;
  f.api.getCommandStatus.mockImplementation(async () => ({ complete: ++polls > 25, status: 0 }));
  await f.recorder.runPending(); expect(polls).toBe(26); expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1);
  expect(f.api.requestLocalStorageClip).toHaveBeenCalledTimes(1);
});

it('persists a provider command before polling and resumes manifest discovery after restart', async () => {
  const f = fixture(); await f.recorder.initialize(); f.register();
  const pending = deferred<{ complete: boolean }>();
  f.api.getCommandStatus.mockImplementation(async () => {
    const ledger = JSON.parse(await fs.readFile(f.recorder.ledgerPath, 'utf8'));
    expect(ledger.modules['2:3'].request.commandId).toBe(1); return pending.promise;
  });
  const scan = f.recorder.scan(); await until(() => f.api.getCommandStatus.mock.calls.length === 1);
  await f.recorder.stop(); await scan; f.api.getCommandStatus.mockResolvedValue({ complete: true });
  const restarted = f.make(); await restarted.initialize(); f.register(restarted); await restarted.scan();
  expect(f.api.requestLocalStorageManifest).toHaveBeenCalledTimes(1); pending.resolve({ complete: true }); await restarted.stop();
});

it('does not automatically repeat a clip POST with a lost acknowledgement', async () => {
  const f = fixture(); await baseline(f); await enqueue(f); f.api.requestLocalStorageClip.mockRejectedValueOnce(new Error('lost acknowledgement'));
  await f.recorder.runPending(); f.advance(1000); await f.recorder.runPending();
  expect(f.api.requestLocalStorageClip).toHaveBeenCalledTimes(1); expect(f.prepare).not.toHaveBeenCalled();
  expect(f.recorder.getActivity().cameras[0].reason).toBe('ambiguous-request');
});

it('rejects an actual download above32MiB regardless of its KiB estimate and never decodes it', async () => {
  const f = fixture(); await baseline(f); await enqueue(f); const bytes = Buffer.alloc(32 * 1024 * 1024 + 1, 1); f.api.getPreparedLocalStorageClip.mockResolvedValueOnce(bytes);
  await f.recorder.runPending(); expect(f.prepare).not.toHaveBeenCalled(); expect(bytes.every(b => b === 0)).toBe(true);
  expect(f.recorder.getActivity().cameras[0].reason).toBe('media-invalid');
});

it('keeps terminal originals private and hash-verifies the admitted file on retry', async () => {
  const f = fixture(); await baseline(f); await enqueue(f);
  jest.spyOn(f.target, 'deliverSavedClip').mockResolvedValueOnce({ status: 'not-offered', reason: 'busy' });
  await f.recorder.runPending(); const names = (await fs.readdir(f.recorder.directory)).filter(n => n.endsWith('.mp4'));
  expect(names).toHaveLength(1); const filename = path.join(f.recorder.directory, names[0]);
  expect((await fs.stat(filename)).mode & 0o777).toBe(0o600); expect((await fs.stat(f.recorder.directory)).mode & 0o777).toBe(0o700);
  expect(await fs.readFile(filename, 'utf8')).toBe('native-clip');
  await fs.writeFile(filename, 'tampered!!!'); f.advance(1000); await f.recorder.runPending();
  expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1); expect(f.recorder.getActivity().cameras[0].reason).toBe('media-invalid');
});

it('reconciles only known partial files and preserves unknown files and Finder metadata', async () => {
  const f = fixture(); await baseline(f); await enqueue(f); await f.recorder.stop();
  const ledger = JSON.parse(await fs.readFile(f.recorder.ledgerPath, 'utf8')); const key = Object.keys(ledger.jobs)[0];
  const partial = path.join(f.recorder.directory, `${key}.partial`), unknown = path.join(f.recorder.directory, 'unrelated.mp4');
  await fs.writeFile(partial, 'partial', { mode: 0o600 }); await fs.writeFile(unknown, 'preserve', { mode: 0o600 });
  await fs.writeFile(path.join(f.recorder.directory, '.DS_Store'), 'finder');
  const restarted = f.make(); await restarted.initialize(); f.register(restarted); await restarted.runPending();
  await expect(fs.stat(partial)).rejects.toMatchObject({ code: 'ENOENT' }); expect(await fs.readFile(unknown, 'utf8')).toBe('preserve');
  expect(await fs.readFile(path.join(f.recorder.directory, '.DS_Store'), 'utf8')).toBe('finder');
  expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1); await restarted.stop();
});

it('reserves the next prepared output before downloading and counts files from an earlier process', async () => {
  const f = fixture(); await fs.mkdir(f.recorder.directory, { mode: 0o700 });
  const retained = path.join(f.recorder.directory, 'unrelated.mp4'); const handle = await fs.open(retained, 'wx', 0o600); await handle.truncate(80 * 1024 * 1024); await handle.close();
  await baseline(f); await enqueue(f); await f.recorder.runPending();
  expect(f.api.getPreparedLocalStorageClip).not.toHaveBeenCalled(); expect(f.recorder.getActivity().mediaBytes).toBe(80 * 1024 * 1024);
  expect(f.recorder.getActivity().cameras[0].reason).toBe('storage-pressure'); expect((await fs.stat(retained)).size).toBe(80 * 1024 * 1024);
});

it('leaves queue-pressure entries discoverable on the next overlapping catalog', async () => {
  const f = fixture(); await baseline(f); f.advance(1000); const clips = Array.from({ length: 17 }, (_, i) => f.clip(String(i + 1)));
  f.clips = clips; await f.recorder.scan(); expect(f.recorder.getActivity().queue).toBe(16); await f.recorder.runPending();
  await f.recorder.scan(); await f.recorder.runPending(); expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(17);
});

it('retains bounded metadata atomically instead of evicting recent identities to admit more', async () => {
  const f = fixture(); await f.recorder.initialize(); f.register();
  f.clips = Array.from({ length: 1000 }, (_, i) => f.clip(String(i + 1))); await f.recorder.scan();
  f.clips = Array.from({ length: 1000 }, (_, i) => f.clip(String(i + 1001), 1000)); await f.recorder.scan();
  f.clips = Array.from({ length: 1000 }, (_, i) => f.clip(String(i + 2001), 2000)); await f.recorder.scan();
  expect(f.recorder.getActivity().modules[0].reason).toBe('metadata-pressure');
  const ledger = JSON.parse(await fs.readFile(f.recorder.ledgerPath, 'utf8')); expect(Object.keys(ledger.seen)).toHaveLength(2000);
  expect(f.recorder.getActivity().queue).toBe(0);
});

it('cancels an unregistered camera without deleting native provider clips', async () => {
  const f = fixture(); await baseline(f); await enqueue(f); await f.recorder.unregisterCamera('camera-1'); await f.recorder.runPending();
  expect(f.recorder.getActivity().cameras).toHaveLength(0); expect(f.api.requestLocalStorageClip).not.toHaveBeenCalled();
});

it('prepares at most two jobs, frees preparation slots before Home delivery, and drains all camera locks', async () => {
  const f = fixture(); await f.recorder.initialize(); f.register();
  for (let i = 2; i <= 3; i++) f.recorder.registerCamera({ cameraKey: `camera-${i}`, cameraId: i + 3, networkId: 2, syncModuleId: 3,
    providerName: `Room${i}` }, f.target);
  await f.recorder.scan(); f.advance(1000); f.clips = [f.clip('1'), f.clip('2', 0, 'Room2'), f.clip('3', 0, 'Room3')]; await f.recorder.scan();
  const preparations = [deferred<PreparedSavedClip>(), deferred<PreparedSavedClip>(), deferred<PreparedSavedClip>()];
  let next = 0; f.prepare.mockImplementation(() => preparations[next++].promise);
  const deliveries = new Map([1, 2, 3].map(i => [`camera-${i}`, deferred<{ status: 'delivered' }>()]));
  jest.spyOn(f.target, 'deliverSavedClip').mockImplementation((_prepared, metadata) => deliveries.get(metadata.cameraKey)!.promise);
  let completed = false; const work = f.recorder.runPending().then(() => { completed = true; });
  try {
    await until(() => f.prepare.mock.calls.length === 2); await new Promise(r => globalThis.setTimeout(r, 20)); expect(f.prepare).toHaveBeenCalledTimes(2);
    for (const p of preparations.slice(0, 2)) p.resolve({ buffer: { bytes: 40 }, dispose: jest.fn() } as unknown as PreparedSavedClip);
    await until(() => f.prepare.mock.calls.length === 3);
    preparations[2].resolve({ buffer: { bytes: 40 }, dispose: jest.fn() } as unknown as PreparedSavedClip);
    await until(() => (f.target.deliverSavedClip as jest.Mock).mock.calls.length === 3);
    deliveries.get('camera-1')!.resolve({ status: 'delivered' }); await new Promise(r => globalThis.setTimeout(r, 20)); expect(completed).toBe(false);
    deliveries.get('camera-2')!.resolve({ status: 'delivered' }); await new Promise(r => globalThis.setTimeout(r, 20)); expect(completed).toBe(false);
  } finally {
    for (const p of preparations) p.resolve({ buffer: { bytes: 40 }, dispose: jest.fn() } as unknown as PreparedSavedClip);
    for (const d of deliveries.values()) d.resolve({ status: 'delivered' }); await work; await f.recorder.stop();
  }
  expect(f.recorder.getActivity().active).toBe(0); expect(f.recorder.getActivity().reservedBytes).toBe(0);
});

it('waits for a selected Home recording configuration before downloading and keeps the clip eligible', async () => {
  const f = fixture(); await baseline(f); await enqueue(f); f.policy.configuration.value = undefined;
  await f.recorder.runPending(); expect(f.api.requestLocalStorageClip).not.toHaveBeenCalled(); expect(f.recorder.getActivity().queue).toBe(1);
  f.policy.configuration.value = config(); f.policy.configuration.revision = 1; await f.recorder.notifyPolicyChanged('camera-1');
  await f.recorder.runPending(); expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1);
});

it('continues automatic catalog discovery while Home is consuming another clip', async () => {
  const f = fixture(); await baseline(f); await enqueue(f);
  const pending = deferred<{ status: 'delivered' }>(); jest.spyOn(f.target, 'deliverSavedClip').mockImplementation(() => pending.promise);
  f.recorder.start();
  try {
    await until(() => (f.target.deliverSavedClip as jest.Mock).mock.calls.length === 1);
    f.advance(30000); f.clips = [f.clip('3')]; await new Promise(r => globalThis.setTimeout(r, 1100));
    expect(f.recorder.getActivity().queue).toBe(2); expect(f.api.requestLocalStorageManifest).toHaveBeenCalledTimes(3);
  } finally { await f.recorder.stop(); pending.resolve({ status: 'delivered' }); }
});

it('reclaims expired terminal originals and metadata while preserving unrelated storage', async () => {
  const f = fixture(); await baseline(f); await enqueue(f); await f.recorder.runPending();
  const unknown = path.join(f.recorder.directory, 'unrelated.mp4'); await fs.writeFile(unknown, 'keep', { mode: 0o600 });
  f.advance(16 * 60000); await f.recorder.runPending();
  expect((await fs.readdir(f.recorder.directory)).filter(n => /^[a-f0-9]{64}\.mp4$/.test(n))).toEqual([]);
  expect(await fs.readFile(unknown, 'utf8')).toBe('keep');
  const ledger = JSON.parse(await fs.readFile(f.recorder.ledgerPath, 'utf8')); expect(Object.keys(ledger.jobs)).toHaveLength(0);
});

it('rejects a storage symlink and a mismatched persisted account without modifying their contents', async () => {
  const f = fixture(); await f.recorder.initialize(); await f.recorder.stop();
  const outside = path.join(directory, 'outside'); await fs.writeFile(outside, 'preserve');
  await fs.symlink(outside, path.join(f.recorder.directory, 'link.mp4'));
  await expect(f.make().initialize()).rejects.toThrow('storage unavailable'); expect(await fs.readFile(outside, 'utf8')).toBe('preserve');
  await fs.unlink(path.join(f.recorder.directory, 'link.mp4'));
  const ledger = JSON.parse(await fs.readFile(f.recorder.ledgerPath, 'utf8')); ledger.account = '99';
  await fs.writeFile(f.recorder.ledgerPath, JSON.stringify(ledger)); await expect(f.make().initialize()).rejects.toThrow('ledger unavailable');
});

it('establishes a separate baseline for a newly registered camera on an already initialized module', async () => {
  const f = fixture(); await baseline(f); f.advance(1000); f.clips = [f.clip('1', 0, 'SecondCamera')]; await f.recorder.scan();
  f.recorder.registerCamera({ cameraKey: 'camera-2', cameraId: 5, networkId: 2, syncModuleId: 3, providerName: 'Second Camera' }, f.target);
  await f.recorder.scan(); await f.recorder.runPending(); expect(f.target.deliverSavedClip).not.toHaveBeenCalled();
  f.advance(1000); f.clips = [f.clip('2', 0, 'SecondCamera')]; await f.recorder.scan(); await f.recorder.runPending();
  expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1);
});

it('recovers a late prepared GET after the polling deadline without another preparation POST', async () => {
  const f = fixture(); await baseline(f); await enqueue(f); f.api.getCommandStatus.mockResolvedValue({ complete: false, status: 0 });
  await f.recorder.runPending(); expect(f.target.deliverSavedClip).not.toHaveBeenCalled();
  expect(f.api.getCommandStatus.mock.calls.length).toBeGreaterThan(18);
  f.advance(1000); await f.recorder.runPending(); expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1);
  expect(f.api.requestLocalStorageClip).toHaveBeenCalledTimes(1);
});

it('bounds preparation retries and distinguishes a media preparation failure from acquisition failure', async () => {
  const f = fixture(); await baseline(f); await enqueue(f); f.prepare.mockRejectedValue(new Error('worker unavailable'));
  for (let i = 0; i < 6; i++) { await f.recorder.runPending(); f.advance(30000); }
  expect(f.prepare).toHaveBeenCalledTimes(5); expect(f.api.requestLocalStorageClip).toHaveBeenCalledTimes(1);
  expect(f.recorder.getActivity().queue).toBe(0); expect(f.recorder.getActivity().cameras[0].reason).toBe('media-preparation-failed');
});

it('refuses replacement physical identity without disturbing the already registered camera', async () => {
  const f = fixture(); await baseline(f); await enqueue(f);
  const replacement: NativeClipCameraTarget = { getPolicySnapshot: () => f.policy, deliverSavedClip: jest.fn(async () => ({ status: 'delivered' as const })) };
  expect(() => f.recorder.registerCamera({ cameraKey: 'camera-1', cameraId: 999, networkId: 2, syncModuleId: 3,
    providerName: 'Other Camera' }, replacement)).toThrow('identity changed');
  await f.recorder.runPending(); expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1); expect(replacement.deliverSavedClip).not.toHaveBeenCalled();
});


it('persists actual source length and resumes from the unchanged private file without redownloading', async () => {
  const f = fixture(); await baseline(f); await enqueue(f);
  jest.spyOn(f.target, 'deliverSavedClip').mockResolvedValueOnce({ status: 'not-offered', reason: 'busy' });
  await f.recorder.runPending(); await f.recorder.stop();
  const ledger = JSON.parse(await fs.readFile(f.recorder.ledgerPath, 'utf8')); const job = Object.values(ledger.jobs)[0] as { sourceBytes: number; sourceSha256: string };
  expect(job.sourceBytes).toBe(11); expect(job.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  const original = await fs.readFile(path.join(f.recorder.directory, Object.keys(ledger.jobs)[0] + '.mp4'));
  f.advance(1000); const restarted = f.make(); await restarted.initialize(); f.register(restarted); await restarted.runPending();
  expect(f.api.getPreparedLocalStorageClip).toHaveBeenCalledTimes(1);
  expect(await fs.readFile(path.join(f.recorder.directory, Object.keys(ledger.jobs)[0] + '.mp4'))).toEqual(original);
  expect(f.prepare).toHaveBeenLastCalledWith(expect.objectContaining({ expectedBytes: original.length, expectedSha256: job.sourceSha256 }), expect.anything(), true, expect.anything());
  await restarted.stop();
});


it('checks persisted actual source length before preparing a retained file after restart', async () => {
  const f = fixture(); await baseline(f); await enqueue(f);
  jest.spyOn(f.target, 'deliverSavedClip').mockResolvedValueOnce({ status: 'not-offered', reason: 'busy' });
  await f.recorder.runPending(); await f.recorder.stop();
  const ledger = JSON.parse(await fs.readFile(f.recorder.ledgerPath, 'utf8')); const filename = path.join(f.recorder.directory, Object.keys(ledger.jobs)[0] + '.mp4');
  await fs.truncate(filename, 3); f.advance(1000); const restarted = f.make(); await restarted.initialize(); f.register(restarted); await restarted.runPending();
  expect(f.prepare).toHaveBeenCalledTimes(1); expect(f.api.getPreparedLocalStorageClip).toHaveBeenCalledTimes(1);
  expect(restarted.getActivity().cameras[0].reason).toBe('media-invalid'); await restarted.stop();
});

it.each(['expired-original', 'storage-pressure'] as const)('retires pending admission before stop resolves during %s reclamation', async scenario => {
  const f = fixture(); await baseline(f); await enqueue(f); await f.recorder.runPending();
  let recorder = f.recorder;
  const ledger = JSON.parse(await fs.readFile(recorder.ledgerPath, 'utf8'));
  const originalPath = path.join(recorder.directory, Object.keys(ledger.jobs)[0] + '.mp4');
  if (scenario === 'expired-original') f.advance(16 * 60000);
  else {
    await recorder.stop(); await fs.truncate(originalPath, 90 * 1024 * 1024);
    recorder = f.make(); await recorder.initialize(); f.register(recorder);
  }
  f.advance(1000); f.clips = [f.clip('3')]; await recorder.scan();
  const paused = deferred<void>(); let entered = false;
  const unlink = fs.unlink.bind(fs);
  jest.spyOn(fs, 'unlink').mockImplementation(async filename => {
    if (String(filename) === originalPath) { entered = true; await paused.promise; }
    return unlink(filename);
  });
  const work = recorder.runPending();
  let stopped: Promise<void> | undefined, stopResolved = false;
  try {
    await until(() => entered);
    stopped = recorder.stop().then(() => { stopResolved = true; });
    await new Promise(r => globalThis.setTimeout(r, 20));
    expect(stopResolved).toBe(false);
  } finally { paused.resolve(); await Promise.all([work, stopped]); }
  expect(f.api.requestLocalStorageClip).toHaveBeenCalledTimes(1);
  expect(f.prepare).toHaveBeenCalledTimes(1); expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(1);
  const saved = JSON.parse(await fs.readFile(recorder.ledgerPath, 'utf8'));
  expect(Object.values(saved.jobs)).toContainEqual(expect.objectContaining({ state: 'queued', clip: expect.objectContaining({ clipId: '3' }) }));
  f.advance(1000); const restarted = f.make(); await restarted.initialize(); f.register(restarted); await restarted.runPending();
  expect(f.api.requestLocalStorageClip).toHaveBeenCalledTimes(2); expect(f.target.deliverSavedClip).toHaveBeenCalledTimes(2);
  await restarted.stop();
});
