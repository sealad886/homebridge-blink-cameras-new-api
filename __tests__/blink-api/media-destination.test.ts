import { describeMediaDestination, isPublicMediaAddress, resolveMediaDestination } from '../../src/blink-api/media-destination';

// Synthetic adversarial cases test policy; they do not establish provider host contracts.
describe('IMMIS destination admission', () => {
  test('retains original TLS identity without session credentials', async () => {
    const destination = describeMediaDestination('immis://media.immedia-semi.com:443/session?token=secret');
    const result = await resolveMediaDestination(destination, new AbortController().signal,
      async () => [{ address: '8.8.8.8', family: 4 }]);
    expect(result).toEqual({ scheme: 'immis:', hostname: 'media.immedia-semi.com',
      servername: 'media.immedia-semi.com', port: 443, address: '8.8.8.8', family: 4, addresses: [{ address: '8.8.8.8', family: 4 }] });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  test('returns all admitted candidates as immutable values', async () => {
    const result = await resolveMediaDestination(describeMediaDestination('immis://media.immedia-semi.com'),
      new AbortController().signal, async () => [{ address: '2606:4700:4700::1111', family: 6 }, { address: '8.8.8.8', family: 4 }]);
    expect(result.addresses).toHaveLength(2); expect(result.address).toBe(result.addresses[0].address);
    expect(Object.isFrozen(result.addresses)).toBe(true);
    expect(result.addresses.every(Object.isFrozen)).toBe(true);
  });
  test.each(['https://media.immedia-semi.com', 'immi://media.immedia-semi.com',
    'immis://media.immedia-semi.com:444', 'immis://immedia-semi.com.evil.test',
    'immis://user@media.immedia-semi.com', 'immis://127.0.0.1', 'immis://[::1]',
    'immis://media.immedia-semi.com./', 'immis://media.immedia-semi.com/#secret'])('rejects unsupported endpoint %s', raw => {
    expect(() => describeMediaDestination(raw)).toThrow();
  });
  test.each(['0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254',
    '172.16.0.1', '192.168.0.1', '192.0.0.1', '192.0.2.1', '198.18.0.1',
    '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255', '::', '::1',
    '::ffff:8.8.8.8', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', 'ff02::1',
    '2001:db8::1', '2002:0808:0808::1', '64:ff9b::808:808', '3fff::1', 'bad'])('refuses special address %s', address => {
    expect(isPublicMediaAddress(address)).toBe(false);
  });
  test.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('admits public address %s', address => {
    expect(isPublicMediaAddress(address)).toBe(true);
  });
  test('rechecks DNS on reconnect and rejects mixed public/private answers', async () => {
    const destination = describeMediaDestination('immis://media.immedia-semi.com');
    const resolve = jest.fn().mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]);
    await expect(resolveMediaDestination(destination, new AbortController().signal, resolve)).resolves.toHaveProperty('address', '8.8.8.8');
    await expect(resolveMediaDestination(destination, new AbortController().signal, resolve)).rejects.toThrow('refused');
    expect(resolve).toHaveBeenCalledTimes(2);
  });
  test.each([{ answers: [] }, { answers: [{ address: '8.8.8.8', family: 6 }] },
    { answers: Array.from({ length: 65 }, () => ({ address: '8.8.8.8', family: 4 })) }])('rejects empty, malformed or excessive DNS answers', async ({ answers }) => {
    await expect(resolveMediaDestination(describeMediaDestination('immis://media.immedia-semi.com'),
      new AbortController().signal, async () => answers)).rejects.toThrow('refused');
  });
  test('bounds resolution time independently of resolver completion', async () => {
    jest.useFakeTimers();
    try {
      const pending = resolveMediaDestination(describeMediaDestination('immis://media.immedia-semi.com'),
        new AbortController().signal, () => new Promise(() => undefined));
      const assertion = expect(pending).rejects.toThrow('timed out');
      jest.advanceTimersByTime(5000);
      await assertion;
    } finally { jest.useRealTimers(); }
  });
  test('cancels pending DNS and does not admit a late answer', async () => {
    const controller = new AbortController();
    let answer!: (value: { address: string; family: number }[]) => void;
    const pending = resolveMediaDestination(describeMediaDestination('immis://media.immedia-semi.com'), controller.signal,
      () => new Promise(resolve => { answer = resolve; }));
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toThrow('cancelled');
    answer([{ address: '8.8.8.8', family: 4 }]);
  });
});
