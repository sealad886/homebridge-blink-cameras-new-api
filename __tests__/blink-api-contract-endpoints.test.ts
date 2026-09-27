import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const extractor = require('../scripts/blink-api-contract/index.cjs');
const root = join(__dirname, 'fixtures/blink-api-contract-endpoints');

describe('endpoint wire contract identity', () => {
  it('preserves distinct response contracts and merges equivalent Rx/coroutine bindings', () => {
    const parsed = extractor.parseJavaEndpoints(root, 'a'.repeat(64));
    const merged = extractor.mergeEndpoints(parsed, []);
    const variants = merged.filter((endpoint: { path: string }) => endpoint.path === 'same');
    expect(variants).toHaveLength(3);
    expect(variants.map((endpoint: { bindings: unknown[] }) => endpoint.bindings.length).sort()).toEqual([1, 1, 2]);
    expect(variants.map((endpoint: { responseModelRefs: string[] }) => endpoint.responseModelRefs)).toEqual(
      expect.arrayContaining([['test.ReplyA'], ['test.ReplyB']]),
    );
  });

  it('resolves qualified, imported, static, local and empty wire names without colliding owners', () => {
    const parsed = extractor.parseJavaEndpoints(root, 'a'.repeat(64));
    const endpoint = parsed.find((item: { path: string }) => item.path === 'names');
    expect(endpoint.parameters.map((item: { wireName: string | null }) => item.wireName))
      .toEqual(['left', 'right', 'left', 'local', '', null]);
    expect(endpoint.parameters.at(-1)).toMatchObject({
      wireName: null, wireNameExpression: 'Unknown.KEY', wireNameResolution: 'unresolved',
    });
  });

  it('does not assign multiple path placeholders by parameter order', () => {
    const parsed = extractor.parseJavaEndpoints(root, 'a'.repeat(64));
    const endpoint = parsed.find((item: { path: string }) => item.path === 'path/{first}/{second}');
    expect(endpoint.parameters.map((item: { wireName: string | null }) => item.wireName)).toEqual([null, null]);
    const ambiguous = parsed.find((item: { path: string }) => item.path === 'ambiguous');
    expect(ambiguous.parameters[0]).toMatchObject({ wireName: null, wireNameResolution: 'unresolved' });
  });

  it('marks scalar-to-collection response changes on the same binding as changed', () => {
    const parsed = extractor.parseJavaEndpoints(root, 'a'.repeat(64));
    const previous = parsed.find((item: { bindings: { methodName: string }[] }) => item.bindings[0].methodName === 'rx');
    const current = parsed.find((item: { bindings: { methodName: string }[] }) => item.bindings[0].methodName === 'collection');
    current.bindings = previous.bindings;
    extractor.applyLifecycle({ endpoints: [current], models: [] }, { endpoints: [previous], models: [] });
    expect(previous.effectiveResponseType).toBe('test.ReplyA');
    expect(current.effectiveResponseType).toBe('List<test.ReplyA>');
    expect(current.lifecycle).toBe('changed');
  });
});
