import { getSecurityBoundaryCounters, recordSecurityBoundaryEvent } from '../src/blink-api/network-diagnostics';
it('reports fixed-cardinality counters without retaining caller metadata', () => {
  const before = getSecurityBoundaryCounters(); recordSecurityBoundaryEvent('overflow');
  const after = getSecurityBoundaryCounters();
  expect(after.overflow).toBe(before.overflow + 1);
  expect(Object.keys(after)).toHaveLength(7);
  (after as {overflow: number}).overflow = -1;
  expect(getSecurityBoundaryCounters().overflow).toBe(before.overflow + 1);
});
