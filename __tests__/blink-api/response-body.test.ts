import { readBoundedBody, readBoundedJson, RESPONSE_BODY_LIMITS, ResponseBodyError } from '../../src/blink-api/response-body';
import { OperationTimeoutError } from '../../src/operation-budget';
import { requireRemoteId, validateHomescreen } from '../../src/blink-api/domain-validation';
import { Buffer } from 'node:buffer';

const { Response, AbortController, ReadableStream } = globalThis;

it('accepts exact byte limit and rejects stream overflow despite misleading length', async () => {
  const limit = RESPONSE_BODY_LIMITS['oauth-json'];
  await expect(readBoundedBody(new Response(Buffer.alloc(limit)), { kind: 'oauth-json' })).resolves.toHaveLength(limit);
  let cancelled = false;
  const oversized = new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(limit + 1)); },
    cancel() { cancelled = true; },
  }), { headers: { 'content-length': '1' } });
  await expect(readBoundedBody(oversized, { kind: 'oauth-json' })).rejects.toBeInstanceOf(ResponseBodyError);
  expect(cancelled).toBe(true);
});

it('rejects declared overflow before pulling response bytes', async () => {
  const response = new Response('small', { headers: { 'content-length': String(RESPONSE_BODY_LIMITS.rest + 1) } });
  await expect(readBoundedBody(response, { kind: 'rest' })).rejects.toBeInstanceOf(ResponseBodyError);
});

it('cancels stalled body at absolute deadline', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  await expect(readBoundedBody(response, { kind: 'rest', deadline: Date.now() + 20 })).rejects.toBeInstanceOf(OperationTimeoutError);
  expect(cancelled).toBe(true);
});

it('reserves authentication admissions and releases cancelled readers', async () => {
  const controller = new AbortController();
  const stalled = () => new Response(new ReadableStream());
  const reads = Array.from({ length: 6 }, () => readBoundedBody(stalled(), { kind: 'rest', signal: controller.signal }).catch(error => error));
  await expect(readBoundedBody(stalled(), { kind: 'rest' })).rejects.toBeInstanceOf(ResponseBodyError);
  await expect(readBoundedBody(new Response('{}'), { kind: 'oauth-json' })).resolves.toHaveLength(2);
  controller.abort(); await Promise.all(reads);
  await expect(readBoundedBody(new Response('{}'), { kind: 'rest' })).resolves.toHaveLength(2);
});

it('rejects excessive JSON nesting before diagnostic traversal', async () => {
  const body = '['.repeat(34) + '0' + ']'.repeat(34);
  await expect(readBoundedJson(new Response(body), { kind: 'rest' })).rejects.toBeInstanceOf(ResponseBodyError);
});

it.each(['../commands', '123', 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid remote ID %p', value => {
  expect(() => requireRemoteId(value)).toThrow('invalid remote identifier');
});
it('validates homescreen entities before expansion', () => {
  const screen = { networks: [{ id: 1, name: 'Home' }], cameras: [{ id: 2, network_id: 1, name: 'Camera' }], owls: [], doorbells: [] };
  expect(() => validateHomescreen(screen)).not.toThrow();
  expect(() => validateHomescreen({ ...screen, cameras: [{ id: '../commands', network_id: 1, name: 'Camera' }] })).toThrow();
});

it('does not consume admissions when an already locked response rejects', async () => {
  const response = new Response('locked');
  const reader = response.body!.getReader();
  for (let attempt = 0; attempt < 10; attempt++) {
    await expect(readBoundedBody(response, { kind: 'rest' })).rejects.toThrow();
  }
  reader.releaseLock();
  await expect(readBoundedBody(new Response('{}'), { kind: 'rest' })).resolves.toHaveLength(2);
});

it('allows the observed 1000-row native catalog structure within its explicit resource limits', async () => {
  const media = Array.from({ length: 1000 }, (_, id) => Object.fromEntries(
    Array.from({ length: 30 }, (__, field) => [`field_${field}`, field === 0 ? id + 1 : null])));
  const body = JSON.stringify({ manifest_id: 303, media });
  await expect(readBoundedJson(new Response(body), { kind: 'native-catalog' })).resolves.toMatchObject({ manifest_id: 303 });
  await expect(readBoundedJson(new Response(body), { kind: 'rest' })).rejects.toBeInstanceOf(ResponseBodyError);
});

it('clamps per-request byte bounds without allowing the native media ceiling to be raised', async () => {
  await expect(readBoundedBody(new Response(Buffer.alloc(11)), { kind: 'native-media', maxBytes: 10 }))
    .rejects.toBeInstanceOf(ResponseBodyError);
  await expect(readBoundedBody(new Response('small', { headers: {
    'content-length': String(RESPONSE_BODY_LIMITS['native-media'] + 1),
  } }), { kind: 'native-media', maxBytes: RESPONSE_BODY_LIMITS['native-media'] * 2 }))
    .rejects.toBeInstanceOf(ResponseBodyError);
});
