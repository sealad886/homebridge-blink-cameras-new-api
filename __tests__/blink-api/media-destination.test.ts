import { describeMediaDestination, isPublicMediaAddress, resolveMediaDestination } from '../../src/blink-api/media-destination';
import { checkServerIdentity, type PeerCertificate } from 'node:tls';

// Synthetic adversarial cases test policy; they do not establish provider host contracts.
describe('IMMIS destination admission', () => {
  test('connects directly to admitted IPv4 with official vendor TLS identity and no DNS', async () => {
    const lookup = jest.fn();
    const destination = describeMediaDestination('immis://8.8.8.8:443/session?client_id=1&token=secret');
    const result = await resolveMediaDestination(destination, new AbortController().signal, lookup);
    expect(result).toEqual({ scheme: 'immis:', hostname: '8.8.8.8', servername: '*.immedia-semi.com',
      port: 443, address: '8.8.8.8', family: 4, addresses: [{ address: '8.8.8.8', family: 4 }] });
    expect(lookup).not.toHaveBeenCalled();
    expect(Object.isFrozen(result.addresses)).toBe(true);
    expect(result.addresses.every(Object.isFrozen)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(checkServerIdentity(result.servername,
      { subjectaltname: 'DNS:*.immedia-semi.com' } as PeerCertificate)).toBeUndefined();
    for (const subjectaltname of ['DNS:*.evil.test', 'DNS:evil.immedia-semi.com', 'IP Address:8.8.8.8']) {
      expect(checkServerIdentity(result.servername, { subjectaltname } as PeerCertificate))
        .toHaveProperty('code', 'ERR_TLS_CERT_ALTNAME_INVALID');
    }
  });
  test('readmits literal destinations and fences cancellation or forged TLS identity without DNS', async () => {
    const lookup = jest.fn();
    const destination = describeMediaDestination('immis://8.8.8.8');
    const signal = new AbortController().signal;
    await resolveMediaDestination(destination, signal, lookup);
    await expect(resolveMediaDestination({ ...destination, hostname: '127.0.0.1' }, signal, lookup)).rejects.toThrow();
    await expect(resolveMediaDestination({ ...destination, servername: '8.8.8.8' }, signal, lookup)).rejects.toThrow('TLS identity');
    const cancelled = new AbortController(); cancelled.abort();
    await expect(resolveMediaDestination(destination, cancelled.signal, lookup)).rejects.toThrow();
    expect(lookup).not.toHaveBeenCalled();
  });
  test.each(['immis://8.8.8.8:444', 'immis://10.0.0.1:443', 'immis://169.254.169.254',
    'immis://8.008.8.8', 'immis://010.0.0.1', 'immis://0x08080808', 'immis://134744072',
    'immis://8.8.8', 'immis://8.8.8.8.', 'immis://[::ffff:8.8.8.8]',
    'immis://[2606:4700:4700::1111]', 'immis://user@8.8.8.8', 'immis://8.8.8.8/#fragment'])
  ('refuses unsupported literal authority %s', raw => {
    expect(() => describeMediaDestination(raw)).toThrow('Unsupported media destination');
  });
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
