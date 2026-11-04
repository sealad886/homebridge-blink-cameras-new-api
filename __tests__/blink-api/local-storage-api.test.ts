import { BlinkApi } from '../../src/blink-api/client';
import { BlinkAuth } from '../../src/blink-api/auth';
import { NativeStorageModule, NativeStorageResponseError } from '../../src/blink-api/local-storage';
import { BlinkConfig, BlinkLogger } from '../../src/types';

const config: BlinkConfig = { email: '', password: '', hardwareId: 'fixture', tier: 'prod', sharedTier: 'prde' };
const moduleRef: NativeStorageModule = { networkId: 2, syncModuleId: 3 };
const clipId = '900719925474099312345';
const prefix = 'https://rest-prde.immedia-semi.com/api/v1/accounts/1/networks/2/sync_modules/3/local_storage';
const clipRoute = `${prefix}/manifest/manifest-1/clip/request/${clipId}`;
const clip = { id: clipId, size: '24', camera_name: 'PorchCamera', created_at: '2026-11-03T12:34:56Z' };
const catalog = { version: '1', manifest_id: 'manifest-1', clips: [clip] };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const createApi = (overrides: Partial<BlinkConfig> = {}) => {
  const api = new BlinkApi({ ...config, ...overrides });
  (api as unknown as { accountId: number }).accountId = 1;
  return api;
};

beforeEach(() => {
  globalThis.fetch = jest.fn() as unknown as typeof fetch;
  jest.spyOn(BlinkAuth.prototype, 'ensureValidToken').mockResolvedValue(undefined);
  jest.spyOn(BlinkAuth.prototype, 'getAuthHeaders').mockReturnValue({ Authorization: 'Bearer fixture' });
});

it('reads all 1000 unsorted entries using the REST boundary and does not log catalog records', async () => {
  const logger: BlinkLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const cameraToken = 'PrivateCatalogMarker' + 'a'.repeat(230);
  const clips = Array.from({ length: 1000 }, (_, index) => ({ ...clip, id: String(1000 - index), camera_name: cameraToken }));
  expect(Buffer.byteLength(JSON.stringify({ ...catalog, clips }))).toBeGreaterThan(256 * 1024);
  (fetch as jest.Mock).mockResolvedValue(json({ ...catalog, clips }));
  const result = await createApi({ logger, debugAuth: true }).getLocalStorageManifest(moduleRef, 7);
  expect(result.state).toBe('ready');
  if (result.state !== 'ready') throw new Error('Expected catalog');
  expect(result.catalog.clips).toHaveLength(1000);
  expect(result.catalog.clips[999].clipId).toBe('1');
  expect(JSON.stringify((logger.info as jest.Mock).mock.calls)).not.toContain('PrivateCatalogMarker');
});

it.each([{}, { id: 8, network_id: 2 }, { ...catalog, clips: [{ ...clip, created_at: 'private-bad-timestamp' }] },
  { ...catalog, network_id: 99 }])('rejects malformed HTTP-success catalogs instead of reporting pending (%#)', async value => {
  (fetch as jest.Mock).mockResolvedValue(json(value));
  await expect(createApi().getLocalStorageManifest(moduleRef, 7)).rejects.toBeInstanceOf(NativeStorageResponseError);
});

it('rejects catalog JSON above the 2 MiB REST boundary', async () => {
  (fetch as jest.Mock).mockResolvedValue(new Response(' '.repeat(2 * 1024 * 1024) + '{}'));
  await expect(createApi().getLocalStorageManifest(moduleRef, 7)).rejects.toThrow();
});

it('rejects command network mismatch without exposing provider fields', async () => {
  (fetch as jest.Mock).mockImplementation(async () => json({ id: 7, network_id: 99, private: 'private-marker' }));
  await expect(createApi().requestLocalStorageManifest(moduleRef)).rejects.toBeInstanceOf(NativeStorageResponseError);
  await expect(createApi().requestLocalStorageClip(moduleRef, 'manifest-1', clipId)).rejects.toBeInstanceOf(NativeStorageResponseError);
});

it('does not replay preparation POSTs after ambiguous server failures', async () => {
  (fetch as jest.Mock).mockImplementation(async () => new Response(null, { status: 503 }));
  const api = createApi();
  await expect(api.requestLocalStorageManifest(moduleRef)).rejects.toMatchObject({ status: 503 });
  await expect(api.requestLocalStorageClip(moduleRef, 'manifest-1', clipId)).rejects.toMatchObject({ status: 503 });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('rejects unsafe identifiers before authentication or network operations', async () => {
  const api = createApi();
  for (const module of [{ networkId: 0, syncModuleId: 3 }, { networkId: 2, syncModuleId: Number.MAX_SAFE_INTEGER + 1 }]) {
    await expect(api.requestLocalStorageManifest(module)).rejects.toThrow();
    await expect(api.getLocalStorageManifest(module, 7)).rejects.toThrow();
    await expect(api.requestLocalStorageClip(module, 'manifest-1', clipId)).rejects.toThrow();
    await expect(api.getPreparedLocalStorageClip(module, 'manifest-1', clipId)).rejects.toThrow();
  }
  for (const requestId of [0, -1, Number.MAX_SAFE_INTEGER + 1]) await expect(api.getLocalStorageManifest(moduleRef, requestId)).rejects.toThrow();
  for (const [manifest, id] of [['../escape', clipId], ['%2fescape', clipId], ['manifest-1', '01'], ['manifest-1', '1?other=2']]) {
    await expect(api.requestLocalStorageClip(moduleRef, manifest, id)).rejects.toThrow();
    await expect(api.getPreparedLocalStorageClip(moduleRef, manifest, id)).rejects.toThrow();
  }
  expect(BlinkAuth.prototype.ensureValidToken).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('respects expired or aborted operations before issuing bodyless POSTs', async () => {
  const api = createApi();
  const controller = new AbortController(); controller.abort();
  for (const options of [{ deadline: Date.now() - 1 }, { signal: controller.signal }]) {
    await expect(api.requestLocalStorageManifest(moduleRef, options)).rejects.toThrow();
    await expect(api.getLocalStorageManifest(moduleRef, 7, options)).rejects.toThrow();
    await expect(api.requestLocalStorageClip(moduleRef, 'manifest-1', clipId, options)).rejects.toThrow();
    await expect(api.getPreparedLocalStorageClip(moduleRef, 'manifest-1', clipId, options)).rejects.toThrow();
  }
  expect(fetch).not.toHaveBeenCalled();
});
afterEach(() => { jest.restoreAllMocks(); });

it('returns persistable commands before polling and uses the same prepared clip GET route', async () => {
  (fetch as jest.Mock).mockResolvedValueOnce(json({ id: 7, network_id: 2 }))
    .mockResolvedValueOnce(json({ id: 7, network_id: 2 }))
    .mockResolvedValueOnce(json({ complete: false, status: 0, status_code: 0, status_msg: 'pending' }))
    .mockResolvedValueOnce(json({ complete: true, status: 0, status_code: 0, status_msg: 'complete' }))
    .mockResolvedValueOnce(json(catalog))
    .mockResolvedValueOnce(json({ id: 8, network_id: 2 }))
    .mockResolvedValueOnce(new Response(Buffer.from('owned mp4 bytes'), { headers: { 'content-type': 'video/mp4' } }));
  const api = createApi();
  await expect(api.requestLocalStorageManifest(moduleRef)).resolves.toEqual({ commandId: 7 });
  expect(fetch).toHaveBeenCalledTimes(1);
  await expect(api.getLocalStorageManifest(moduleRef, 7)).resolves.toEqual({ state: 'pending' });
  await expect(api.pollCommand(2, 7, 2, 0)).resolves.toMatchObject({ complete: true, status: 0 });
  await expect(api.getLocalStorageManifest(moduleRef, 7)).resolves.toMatchObject({ state: 'ready', catalog: { manifestId: 'manifest-1', clips: [{ clipId }] } });
  await expect(api.requestLocalStorageClip(moduleRef, 'manifest-1', clipId)).resolves.toEqual({ commandId: 8 });
  expect(fetch).toHaveBeenCalledTimes(6);
  await expect(api.getPreparedLocalStorageClip(moduleRef, 'manifest-1', clipId)).resolves.toEqual(Buffer.from('owned mp4 bytes'));
  const requests = (fetch as jest.Mock).mock.calls;
  expect(requests[0]).toEqual([`${prefix}/manifest/request`, expect.objectContaining({ method: 'POST', body: undefined })]);
  expect(requests[1][0]).toBe(`${prefix}/manifest/request/7`);
  expect(requests[2][0]).toBe('https://rest-prde.immedia-semi.com/accounts/1/networks/2/commands/7');
  expect(requests[5]).toEqual([clipRoute, expect.objectContaining({ method: 'POST', body: undefined })]);
  expect(requests[6]).toEqual([clipRoute, expect.objectContaining({ method: 'GET', body: undefined })]);
});
