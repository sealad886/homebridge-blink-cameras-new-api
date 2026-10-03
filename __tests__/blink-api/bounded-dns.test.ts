import { lookupAddresses, MAX_CONCURRENT_DNS_LOOKUPS } from '../../src/blink-api/bounded-dns';
import { describeMediaDestination, resolveMediaDestination } from '../../src/blink-api/media-destination';

test('retired callers retain DNS admission until actual lookup settlement', async () => {
  const destination = describeMediaDestination('immis://media.immedia-semi.com');
  const finish: Array<(value: { address: string; family: number }[]) => void> = [];
  const lookup = jest.fn(() => new Promise<{ address: string; family: number }[]>(resolve => finish.push(resolve)));
  try {
    for (let i = 0; i < MAX_CONCURRENT_DNS_LOOKUPS; i++) {
      const controller = new AbortController();
      const admission = resolveMediaDestination(destination, controller.signal, lookup);
      await Promise.resolve();
      controller.abort();
      await expect(admission).rejects.toThrow('cancelled');
    }
    const refusedLookup = jest.fn(async () => [{ address: '8.8.8.8', family: 4 }]);
    await expect(lookupAddresses(destination.hostname, refusedLookup)).rejects.toThrow('capacity');
    expect(refusedLookup).not.toHaveBeenCalled();
  } finally {
    finish.forEach(resolve => resolve([{ address: '8.8.8.8', family: 4 }]));
    await Promise.resolve();
    await Promise.resolve();
  }
  await expect(lookupAddresses(destination.hostname, async () => [{ address: '8.8.8.8', family: 4 }]))
    .resolves.toHaveLength(1);
});

test('failed and synchronously throwing resolvers release admission', async () => {
  for (let i = 0; i <= MAX_CONCURRENT_DNS_LOOKUPS; i++) {
    await expect(lookupAddresses('media.immedia-semi.com', () => { throw new Error('DNS failure'); }))
      .rejects.toThrow('DNS failure');
    await expect(lookupAddresses('media.immedia-semi.com', async () => { throw new Error('DNS failure'); }))
      .rejects.toThrow('DNS failure');
  }
  await expect(lookupAddresses('media.immedia-semi.com', async () => [] )).resolves.toEqual([]);
});
