import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { readRecordingHealth } from '../../src/homebridge-ui/recording-health';
import { BlinkUiServer } from '../../src/homebridge-ui/server';
import { composeRecordingReadiness } from '../../src/recording-readiness';
import { projectSettingsInventory } from '../../src/settings-inventory';
import { parseNativeStorageCatalog } from '../../src/blink-api/local-storage';
import type { NativeClipActivity } from '../../src/native-clip-recorder';

let mockStorageRoot: string;
const mockRoutes = new Map<string, (payload: unknown) => Promise<unknown>>();
jest.mock('@homebridge/plugin-ui-utils', () => ({
  HomebridgePluginUiServer: class {
    homebridgeStoragePath = mockStorageRoot;
    onRequest(route: string, handler: (payload: unknown) => Promise<unknown>) { mockRoutes.set(route, handler); }
    ready() {}
  },
  RequestError: class extends Error { constructor(message: string, public requestError: unknown) { super(message); } },
}));

const now = Date.parse('2026-11-03T12:00:00.000Z');
const fixture = () => ({ version: 2, settingsRevision: '0123456789abcdef01234567', runtime: 'running', inventory: 'available',
  updatedAt: new Date(now).toISOString(), retainedInHomeKit: 'unconfirmed',
  queue: 1, active: 1, mediaBytes: 4096, reservedBytes: 8192, preparationLimit: 2,
  modules: [{ id: '0123456789abcdef', label: 'Home', baseline: 'complete', lastCatalogAt: new Date(now - 10000).toISOString() }],
  cameras: [{ id: 'fedcba9876543210', label: '<b>Camera</b>', selection: 'available', source: 'saved-clips', available: true,
    home: { configuration: 'configured', recordingActive: true, cameraActive: true, audioActive: false, triggerTypes: [1], effectiveAudioActive: false },
    baseline: 'complete', stage: 'uncertain', canTriggerFreshTest: true, nativeStorage: 'unverified',
    queued: 1, delivered: 2, uncertain: 1, retainedInHomeKit: 'unconfirmed',
    lastNativeClipAt: new Date(now - 90000).toISOString(), reason: 'delivery-uncertain',
    job: { id: 'aaaaaaaaaaaaaaaa', state: 'uncertain', capturedAt: new Date(now - 90000).toISOString(),
      discoveredAt: new Date(now - 80000).toISOString(), offeredAt: new Date(now - 10000).toISOString() } }],
});

describe('read-only local recording health', () => {
  let directory: string; let file: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'blink-health-')); mockStorageRoot = directory;
    const folder = join(directory, 'blink-recording', 'native-clips'); await mkdir(folder, { recursive: true, mode: 0o700 });
    file = join(folder, 'health.json');
  });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); mockRoutes.clear(); });

  it('returns a sanitized report preserving capture and offer times without claiming retention', async () => {
    const raw = { ...fixture(), secret: 'private-token', cameras: [{ ...fixture().cameras[0], url: 'private-capability' }] };
    const bytes = JSON.stringify(raw); await writeFile(file, bytes, { mode: 0o600 });
    const result = await readRecordingHealth(directory, now);
    expect(result.state).toBe('available'); expect(result.health).toEqual(fixture());
    expect(JSON.stringify(result)).not.toMatch(/private-token|private-capability/);
    expect(await readFile(file, 'utf8')).toBe(bytes);
  });

  it('composes provider offset capture timestamps into a readable canonical report without changing native identity or activity', async () => {
    const native = parseNativeStorageCatalog({ version: '1.0', manifest_id: 'manifest-1', clips: [{
      id: '900719925474099312345', size: '32768', camera_name: 'PorchCamera', created_at: '2026-11-03T12:34:56+00:00',
    }] }).clips[0];
    const observedAt = Date.parse(native.capturedAt) + 60000;
    const inventory = projectSettingsInventory({ account: { account_id: 1 }, networks: [{ id: 1, name: 'Home', armed: true }],
      sync_modules: [{ id: 10, network_id: 1, name: 'Module', status: 'online' }],
      cameras: [{ id: 2, network_id: 1, name: 'Porch Camera', enabled: true }], owls: [], doorbells: [] });
    const activity: NativeClipActivity = { updatedAt: new Date(observedAt).toISOString(), queue: 1, active: 0,
      mediaBytes: 0, reservedBytes: 0, preparationLimit: 1, modules: [], cameras: [{ key: 'camera:2', id: 'fedcba9876543210',
        label: 'Porch Camera', baseline: 'complete', queued: 1, delivered: 0, uncertain: 0, lastNativeClipAt: native.capturedAt,
        job: { id: 'aaaaaaaaaaaaaaaa', state: 'queued', capturedAt: native.capturedAt, discoveredAt: new Date(observedAt).toISOString() },
      }] };
    const before = structuredClone(activity);
    const report = composeRecordingReadiness({ config: { hksvCameras: ['camera:2'] }, inventory, runtime: 'running', now: observedAt, activity });
    await writeFile(file, JSON.stringify(report), { mode: 0o600 });
    const result = await readRecordingHealth(directory, observedAt);
    expect(result.state).toBe('available');
    expect(result.health?.cameras[0]).toMatchObject({ lastNativeClipAt: '2026-11-03T12:34:56.000Z',
      job: { capturedAt: '2026-11-03T12:34:56.000Z' }, retainedInHomeKit: 'unconfirmed' });
    expect(activity).toEqual(before);
    expect(native).toMatchObject({ clipId: '900719925474099312345', capturedAt: '2026-11-03T12:34:56+00:00' });
  });

  it('distinguishes missing and stale reports without creating files', async () => {
    expect((await readRecordingHealth(directory, now)).state).toBe('missing');
    expect(await readdir(join(directory, 'blink-recording', 'native-clips'))).toEqual([]);
    await writeFile(file, JSON.stringify(fixture()), { mode: 0o600 });
    expect((await readRecordingHealth(directory, now + 11 * 60000)).state).toBe('stale');
  });

  it.each([{ ...fixture(), queue: -1 }, { ...fixture(), retainedInHomeKit: 'confirmed' },
    { ...fixture(), updatedAt: 'not-a-time' }, { ...fixture(), cameras: [{ ...fixture().cameras[0], job: { ...fixture().cameras[0].job, offeredAt: 'bad' } }] }])('rejects invalid reports without forwarding their contents', async raw => {
    await writeFile(file, JSON.stringify(raw), { mode: 0o600 });
    expect(await readRecordingHealth(directory, now)).toEqual({ state: 'unsupported', reason: 'restart-required', checkedAt: new Date(now).toISOString() });
  });

  it('returns explicit restart guidance for the old report without creating a compatibility projection', async () => {
    await writeFile(file, JSON.stringify({ ...fixture(), version: 1 }), { mode: 0o600 });
    expect(await readRecordingHealth(directory, now)).toMatchObject({ state: 'unsupported', reason: 'restart-required' });
  });

  it('bounds the report and refuses a symlink or non-private file without changing permissions', async () => {
    await writeFile(file, Buffer.alloc(1024 * 1024 + 1, 32), { mode: 0o600 });
    expect((await readRecordingHealth(directory, now)).state).toBe('unavailable');
    await rm(file); const other = join(directory, 'other.json'); await writeFile(other, JSON.stringify(fixture()), { mode: 0o600 });
    await symlink(other, file); expect((await readRecordingHealth(directory, now)).state).toBe('unavailable');
    await rm(file); await writeFile(file, JSON.stringify(fixture()), { mode: 0o600 }); await chmod(file, 0o644);
    expect((await readRecordingHealth(directory, now)).state).toBe('unavailable');
  });

  it('exposes the local report through the existing UI channel and rejects nonempty payloads', async () => {
    new BlinkUiServer();
    const route = mockRoutes.get('/settings/recording-health')!;
    expect(typeof route).toBe('function');
    await expect(route({})).resolves.toMatchObject({ state: 'missing' });
    for (const payload of [{ path: 'private-other-file' }, [], null, 'value']) await expect(route(payload)).rejects.toThrow();
    expect(await readdir(join(directory, 'blink-recording', 'native-clips'))).toEqual([]);
  });
});
