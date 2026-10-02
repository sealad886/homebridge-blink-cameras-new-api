import { lookup } from 'node:dns/promises';
import { sampleBlinkConnection } from '../src/blink-api/connection-diagnostics';

jest.mock('node:dns/promises');

describe('bounded Blink connection diagnostic', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(lookup).mockReset();
    globalThis.fetch = jest.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('reports reachability without retaining addresses, credentials, or bodies', async () => {
    jest.mocked(lookup).mockResolvedValue([{ address: '192.0.2.1', family: 4 }] as never);
    const cancel = jest.fn().mockResolvedValue(undefined);
    jest.mocked(globalThis.fetch).mockResolvedValue({ body: { cancel } } as unknown as globalThis.Response);
    const sample = await sampleBlinkConnection('https://rest-e006.immedia-semi.com');
    expect(sample).toEqual({ dns: 'ok', addressCount: 1, connection: 'ok', elapsedMs: 0 });
    expect(globalThis.fetch).toHaveBeenCalledWith('https://rest-e006.immedia-semi.com', {
      redirect: 'manual', signal: expect.any(globalThis.AbortSignal),
    });
    expect(cancel).toHaveBeenCalled();
  });

  it.each(['http://rest-e006.immedia-semi.com', 'https://example.com',
    'https://token@rest-e006.immedia-semi.com', 'https://rest-e006.immedia-semi.com:8443'])(
    'rejects unsupported diagnostic target %s', async target => {
    await expect(sampleBlinkConnection(target)).rejects.toThrow();
    expect(lookup).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('bounds DNS stalls to five seconds', async () => {
    jest.mocked(lookup).mockReturnValue(new Promise(() => {}));
    const pending = sampleBlinkConnection('https://rest-e006.immedia-semi.com');
    await jest.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toEqual({ dns: 'timeout', connection: 'skipped', elapsedMs: 5000 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('bounds connection stalls and aborts the request', async () => {
    jest.mocked(lookup).mockResolvedValue([{ address: '192.0.2.1', family: 4 }] as never);
    jest.mocked(globalThis.fetch).mockReturnValue(new Promise(() => {}));
    const pending = sampleBlinkConnection('https://rest-e006.immedia-semi.com');
    await jest.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toMatchObject({ dns: 'ok', connection: 'timeout', elapsedMs: 5000 });
    const options = jest.mocked(globalThis.fetch).mock.calls[0][1];
    expect(options?.signal?.aborted).toBe(true);
  });
});
