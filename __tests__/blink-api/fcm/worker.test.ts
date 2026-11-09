import { Buffer } from 'node:buffer';
import { getDefaultResultOrder, setDefaultResultOrder } from 'node:dns';
import { getDefaultAutoSelectFamily } from 'node:net';
import process from 'node:process';
import { installGoogleRequestBudget, runFcmWorker } from '../../../src/blink-api/fcm/worker';
import { FCM_LIMITS } from '../../../src/blink-api/fcm/types';

const originalFetch = globalThis.fetch;
const originalDnsOrder = getDefaultResultOrder();
afterEach(() => { globalThis.fetch = originalFetch; setDefaultResultOrder(originalDnsOrder); jest.restoreAllMocks(); });
function fixture(response = new globalThis.Response('ok')) {
  const fetch = jest.fn(async () => response.clone());
  globalThis.fetch = fetch;
  const failure = jest.fn();
  const controller = new globalThis.AbortController();
  installGoogleRequestBudget(controller.signal, failure);
  return { fetch, failure, controller };
}
const post = { method: 'POST', body: 'bounded-client-metadata' };

it('does not change parent DNS or install request interception when the worker module is imported', () => {
  setDefaultResultOrder('verbatim');
  jest.isolateModules(() => { jest.requireActual('../../../src/blink-api/fcm/worker'); });
  expect(getDefaultResultOrder()).toBe('verbatim');
  expect(globalThis.fetch).toBe(originalFetch);
});

it('sets IPv4-first only when its isolated worker starts, before any registration or connect can be admitted', () => {
  setDefaultResultOrder('verbatim');
  const autoSelectFamily = getDefaultAutoSelectFamily();
  const on = jest.spyOn(process, 'on').mockImplementation(() => {
    expect(getDefaultResultOrder()).toBe('ipv4first');
    return process;
  });
  const fetch = jest.fn(); globalThis.fetch = fetch;
  runFcmWorker();
  expect(on).toHaveBeenCalledWith('message', expect.any(Function));
  expect(getDefaultResultOrder()).toBe('ipv4first');
  expect(getDefaultAutoSelectFamily()).toBe(autoSelectFamily);
  expect(globalThis.fetch).toBe(fetch); expect(fetch).not.toHaveBeenCalled();
});

it('allows bounded Google registration metadata with redirects and deadline enforcement', async () => {
  const f = fixture();
  const response = await globalThis.fetch('https://firebaseinstallations.googleapis.com/v1/projects/example/installations', post);
  expect(await response.text()).toBe('ok');
  expect(f.fetch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ redirect: 'error', signal: expect.anything() }));
  expect(f.failure).not.toHaveBeenCalled();
});

it.each([
  'https://rest-u034.immedia-semi.com/clients/1/update',
  'http://android.clients.google.com/checkin',
  'https://android.clients.google.com:444/checkin',
  'https://user:pass@android.clients.google.com/checkin',
  'https://android.clients.google.com.attacker.example/checkin',
])('rejects a non-Google or unsafe registration destination: %s', async url => {
  const f = fixture();
  await expect(globalThis.fetch(url, post)).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled(); expect(f.failure).toHaveBeenCalledWith('registration-budget', false);
});

it('bounds registration request count and does not create another inner retry loop', async () => {
  const f = fixture();
  for (let i = 0; i < FCM_LIMITS.registrationRequests; i++) {
    await globalThis.fetch('https://android.clients.google.com/checkin', post);
  }
  await expect(globalThis.fetch('https://android.clients.google.com/checkin', post)).rejects.toThrow();
  expect(f.fetch).toHaveBeenCalledTimes(FCM_LIMITS.registrationRequests);
  expect(f.failure).toHaveBeenCalledTimes(1);
});

it.each([400, 401, 403])('stops permanent Google rejection %i without retrying it', async status => {
  const f = fixture(new globalThis.Response('rejected', { status }));
  await expect(globalThis.fetch('https://fcmregistrations.googleapis.com/v1/projects/test/registrations', post)).rejects.toThrow();
  expect(f.failure).toHaveBeenCalledTimes(1); expect(f.failure).toHaveBeenCalledWith('registration-rejected', false);
  await expect(globalThis.fetch('https://android.clients.google.com/checkin', post)).rejects.toThrow();
  expect(f.fetch).toHaveBeenCalledTimes(1);
});

it.each([429, 500, 503])('delegates temporary rejection %i to the parent backoff owner', async status => {
  const f = fixture(new globalThis.Response('retry later', { status }));
  await expect(globalThis.fetch('https://fcmregistrations.googleapis.com/v1/projects/test/registrations', post)).rejects.toThrow();
  expect(f.failure).toHaveBeenCalledTimes(1); expect(f.failure).toHaveBeenCalledWith('registration-unavailable', true);
});

it('bounds request/response bodies and rejects non-metadata body forms', async () => {
  let f = fixture();
  await expect(globalThis.fetch('https://android.clients.google.com/checkin', { method: 'POST', body: Buffer.alloc(32769) })).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
  f = fixture(new globalThis.Response(Buffer.alloc(65537)));
  await expect(globalThis.fetch('https://android.clients.google.com/checkin', post)).rejects.toThrow();
  expect(f.failure).toHaveBeenCalledTimes(1); expect(f.failure).toHaveBeenCalledWith('registration-budget', false);
});

it('does not make requests after cancellation', async () => {
  const f = fixture(); f.controller.abort();
  await expect(globalThis.fetch('https://android.clients.google.com/checkin', post)).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
});
