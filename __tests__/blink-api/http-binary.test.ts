import { BlinkHttp } from '../../src/blink-api/http';
import { BlinkAuth } from '../../src/blink-api/auth';
import { BlinkConfig, BlinkLogger } from '../../src/types';

const route = 'v1/accounts/1/networks/2/sync_modules/3/local_storage/manifest/manifest-1/clip/request/900719925474099312345';
const media = Buffer.from('\x00\x00\x00\x18ftypDUMMY_PRIVATE_CLIP_BYTES');
const config: BlinkConfig = { email: '', password: '', hardwareId: 'fixture' };
const createHttp = (overrides: Partial<BlinkConfig> = {}) => {
  const auth = { ensureValidToken: jest.fn().mockResolvedValue(undefined), refreshTokens: jest.fn().mockResolvedValue(undefined),
    getAuthHeaders: jest.fn().mockReturnValue({ Authorization: 'Bearer fixture' }) } as unknown as BlinkAuth;
  return { http: new BlinkHttp(auth, { ...config, ...overrides }), auth };
};
const mp4 = (bytes = media, headers: Record<string, string> = {}) => new Response(bytes, { headers: { 'content-type': 'video/mp4', ...headers } });

beforeEach(() => { globalThis.fetch = jest.fn() as unknown as typeof fetch; });
afterEach(() => { jest.restoreAllMocks(); });

it('downloads authenticated bytes without JSON parsing or media appearing in debug logs', async () => {
  const logger: BlinkLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const response = mp4();
  const parse = jest.spyOn(response, 'json');
  (fetch as jest.Mock).mockResolvedValue(response);
  const { http } = createHttp({ logger, debugAuth: true });
  await expect(http.getBinary(route)).resolves.toEqual(media);
  expect(parse).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/api/${route}`), expect.objectContaining({
    redirect: 'error', headers: expect.objectContaining({ Authorization: 'Bearer fixture' }),
  }));
  expect(JSON.stringify((logger.info as jest.Mock).mock.calls)).not.toContain('DUMMY_PRIVATE_CLIP_BYTES');
});

it('admits clips through 32 MiB and rejects declared or streamed overflow', async () => {
  const limit = 32 * 1024 * 1024;
  const { http } = createHttp();
  (fetch as jest.Mock).mockResolvedValueOnce(mp4(Buffer.alloc(limit)));
  await expect(http.getBinary(route)).resolves.toHaveLength(limit);
  (fetch as jest.Mock).mockResolvedValueOnce(mp4(media, { 'content-length': String(limit + 1) }));
  await expect(http.getBinary(route)).rejects.toThrow();
  let cancelled = false;
  (fetch as jest.Mock).mockResolvedValueOnce(new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(limit + 1)); },
    cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'video/mp4', 'content-length': '1' } }));
  await expect(http.getBinary(route)).rejects.toThrow();
  expect(cancelled).toBe(true);
});

it.each([
  () => new Response(null, { headers: { 'content-type': 'video/mp4' } }),
  () => new Response(media, { status: 206, headers: { 'content-type': 'video/mp4' } }),
  () => mp4(media, { 'content-range': 'bytes 0-12/1000' }),
  () => mp4(media, { 'content-length': String(media.length + 1) }),
  () => new Response('{"error":"DUMMY_PRIVATE_CLIP_BYTES"}', { headers: { 'content-type': 'application/json' } }),
  () => new Response('{"error":"DUMMY_PRIVATE_CLIP_BYTES"}', { headers: { 'content-type': 'video/mp4' } }),
  () => mp4(Buffer.from(' '.repeat(256) + '{"error":"DUMMY_PRIVATE_CLIP_BYTES"}')),
  () => mp4(Buffer.from('\uFEFF{"error":"DUMMY_PRIVATE_CLIP_BYTES"}')),
])('rejects empty, partial and JSON-error success replies (%#)', async response => {
  const logger: BlinkLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  (fetch as jest.Mock).mockResolvedValue(response());
  const { http } = createHttp({ logger, debugAuth: true });
  await expect(http.getBinary(route)).rejects.toThrow();
  expect(JSON.stringify([(logger.info as jest.Mock).mock.calls, (logger.error as jest.Mock).mock.calls])).not.toContain('DUMMY_PRIVATE_CLIP_BYTES');
});

it('keeps clip body reads alive past 30s within a fixed 120s total budget', async () => {
  jest.useFakeTimers();
  try {
    let timer: ReturnType<typeof setTimeout>;
    (fetch as jest.Mock).mockResolvedValue(new Response(new ReadableStream({
      start(controller) { timer = setTimeout(() => { controller.enqueue(media); controller.close(); }, 31_000); },
      cancel() { clearTimeout(timer); },
    }), { headers: { 'content-type': 'video/mp4' } }));
    const { http } = createHttp();
    const result = http.getBinary(route).then(bytes => ({ bytes }), error => ({ error }));
    await jest.advanceTimersByTimeAsync(31_000);
    await expect(result).resolves.toEqual({ bytes: media });
  } finally { jest.useRealTimers(); }
});

it('limits the binary fetch signal to 120s and keeps ordinary JSON requests at 30s', async () => {
  const timeout = jest.spyOn(AbortSignal, 'timeout');
  (fetch as jest.Mock).mockResolvedValueOnce(mp4()).mockResolvedValueOnce(new Response('{}'));
  const { http } = createHttp();
  await http.getBinary(route, { deadline: Date.now() + 300_000 });
  expect(timeout.mock.calls[0][0]).toBeGreaterThan(110_000);
  expect(timeout.mock.calls[0][0]).toBeLessThanOrEqual(120_000);
  await http.get('homescreen', { deadline: Date.now() + 300_000 });
  expect(timeout.mock.calls[1][0]).toBeLessThanOrEqual(30_000);
});

it('cancels a stalled binary stream on caller abort and never retries it', async () => {
  let cancelled = false;
  (fetch as jest.Mock).mockResolvedValue(new Response(new ReadableStream({ cancel() { cancelled = true; } }),
    { headers: { 'content-type': 'video/mp4' } }));
  const controller = new AbortController();
  const { http } = createHttp();
  const pending = http.getBinary(route, { signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await expect(pending).rejects.toThrow();
  expect(cancelled).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('rejects caller-expired work, non-media routes and redirects', async () => {
  const { http, auth } = createHttp();
  await expect(http.getBinary(route, { deadline: Date.now() - 1 })).rejects.toThrow();
  for (const path of ['https://other.example/clip.mp4', '../clip.mp4', 'accounts/1/homescreen']) {
    await expect(http.getBinary(path)).rejects.toThrow();
  }
  expect(auth.ensureValidToken).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  (fetch as jest.Mock).mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://other.example/clip.mp4' } }));
  await expect(http.getBinary(route)).rejects.toMatchObject({ status: 302 });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('refreshes authentication through the shared request path for binary media', async () => {
  (fetch as jest.Mock).mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(mp4());
  const { http, auth } = createHttp();
  await expect(http.getBinary(route)).resolves.toEqual(media);
  expect(auth.refreshTokens).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('keeps invalid-response errors sanitized even when the rejected body cannot be cancelled', async () => {
  const response = new Response('{"error":"DUMMY_PRIVATE_CLIP_BYTES"}', { headers: { 'content-type': 'application/json' } });
  jest.spyOn(response.body!, 'cancel').mockRejectedValue(new Error('DUMMY_PRIVATE_CLIP_BYTES'));
  (fetch as jest.Mock).mockResolvedValue(response);
  const { http } = createHttp();
  await expect(http.getBinary(route)).rejects.toMatchObject({ failure: 'response', responseBody: undefined });
});
