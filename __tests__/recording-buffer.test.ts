import { Buffer } from 'node:buffer';
import { test } from '@jest/globals';
import {
  RecordingBufferBudget, RecordingFragmentBuffer, type RecordingFragment,
} from '../src/accessories/recording-buffer';

function box(name: string, length = 8): Buffer {
  const data = Buffer.alloc(length, 7); data.writeUInt32BE(length); data.write(name, 4, 'ascii'); return data;
}
const initialization = () => Buffer.concat([box('ftyp'), box('moov')]);
const fragment = (sequence: number, durationMs = 1000, payload = 0): RecordingFragment => ({
  sequence, startUs: BigInt(sequence * durationMs) * 1000n, durationUs: BigInt(durationMs) * 1000n,
  keyframe: true, data: Buffer.concat([box('moof'), box('mdat', 8 + payload)]),
});
function warmed(budget = new RecordingBufferBudget(), maximum?: number) {
  const buffer = new RecordingFragmentBuffer(budget, maximum); buffer.initialize(initialization());
  for (let n = 0; n < 4; n++) buffer.append(fragment(n));
  return buffer;
}

test('retains complete keyframe-aligned four-second prebuffer and evicts only whole old fragments', () => {
  const budget = new RecordingBufferBudget(); const buffer = new RecordingFragmentBuffer(budget);
  buffer.initialize(initialization());
  for (let n = 0; n < 3; n++) buffer.append(fragment(n));
  expect(buffer.ready).toBe(false); buffer.append(fragment(3)); expect(buffer.ready).toBe(true);
  const pin = buffer.pin(); const oldest = pin.fragments[0].data; pin.release();
  buffer.append(fragment(4));
  expect(oldest.every(byte => byte === 0)).toBe(true);
  expect(buffer.retainedDurationUs).toBe(4000000n);
  const latest = buffer.pin(); expect(latest.fragments.map(f => f.sequence)).toEqual([1, 2, 3, 4]);
  buffer.clear(); expect(budget.bytes).toBe(0);
});

test('fragment granularity retains at least four seconds without splitting a box', () => {
  const buffer = new RecordingFragmentBuffer(); buffer.initialize(initialization());
  buffer.append(fragment(0, 3000)); buffer.append(fragment(1, 3000));
  expect(buffer.ready).toBe(true); buffer.append(fragment(2, 3000));
  const pin = buffer.pin(); expect(pin.fragments.map(f => f.sequence)).toEqual([1, 2]);
  expect(buffer.retainedDurationUs).toBe(6000000n); buffer.clear();
});

test('pins future fragments and exposes no duplicate owned copy to the aggregate budget', () => {
  const budget = new RecordingBufferBudget(); const buffer = warmed(budget); const pin = buffer.pin();
  const oldest = pin.fragments[0].data; buffer.append(fragment(4)); buffer.append(fragment(5));
  expect(pin.fragments.map(f => f.sequence)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(budget.bytes).toBe(16 + 6 * 16); expect(oldest.some(byte => byte !== 0)).toBe(true);
  pin.release(); pin.release(); expect(oldest.every(byte => byte === 0)).toBe(true);
  expect(buffer.retainedDurationUs).toBe(4000000n); buffer.clear(); expect(budget.bytes).toBe(0);
});

test('per-camera pressure fails rather than silently discarding pinned event media', () => {
  const budget = new RecordingBufferBudget(); const buffer = warmed(budget, 96); const pin = buffer.pin();
  const oldest = pin.fragments[0].data; buffer.append(fragment(4));
  expect(() => buffer.append(fragment(5))).toThrow('buffer_exhausted');
  expect(pin.fragments.map(f => f.sequence)).toEqual([0, 1, 2, 3, 4]);
  expect(oldest.some(byte => byte !== 0)).toBe(true); expect(buffer.bytes).toBe(96);
  buffer.clear(); expect(oldest.every(byte => byte === 0)).toBe(true); expect(budget.bytes).toBe(0);
});

test('shared aggregate cap reserves before copying and recovers capacity after erasure', () => {
  const budget = new RecordingBufferBudget(176); const first = warmed(budget); const pin = first.pin();
  const second = warmed(budget); second.pin(); first.append(fragment(4));
  expect(() => second.append(fragment(4))).toThrow('buffer_exhausted'); expect(budget.bytes).toBe(176);
  const retained = pin.fragments[0].data; first.clear(); expect(retained.every(byte => byte === 0)).toBe(true);
  second.append(fragment(4)); expect(budget.bytes).toBe(96); second.clear(); expect(budget.bytes).toBe(0);
});

test.each([
  { sequence: 5 }, { startUs: 6000000n }, { startUs: 2000000n }, { startUs: 4002001n },
])('rejects skipped sequence, timeline gaps and overlaps without erasing admitted footage: %p', change => {
  const buffer = warmed(); const pin = buffer.pin(); const prior = pin.fragments[0].data;
  expect(() => buffer.append({ ...fragment(4), ...change })).toThrow('discontinuity');
  expect(pin.fragments).toHaveLength(4); expect(prior.some(byte => byte !== 0)).toBe(true); buffer.clear();
});

test('codec timestamp rounding stays contiguous while unknown source gaps fail', () => {
  const buffer = warmed(); buffer.append({ ...fragment(4), startUs: 4000001n });
  buffer.append(fragment(5)); expect(buffer.ready).toBe(true); expect(buffer.retainedDurationUs).toBe(4000000n); buffer.clear();
});

test.each([
  { keyframe: false }, { durationUs: 0n }, { durationUs: 4000001n },
  { data: Buffer.concat([box('moof'), box('free')]) }, { data: box('moof') },
])('rejects incomplete, non-keyframe or out-of-bound fragment: %p', change => {
  const budget = new RecordingBufferBudget(); const buffer = warmed(budget); const bytes = budget.bytes;
  expect(() => buffer.append({ ...fragment(4), ...change })).toThrow('invalid_media');
  expect(budget.bytes).toBe(bytes); buffer.clear();
});

test('a complete final fragment shorter than the normal interval retains all trailing footage', () => {
  const buffer = warmed(); const pin = buffer.pin();
  buffer.append({ ...fragment(4), durationUs: 250000n });
  expect(pin.fragments.at(-1)?.durationUs).toBe(250000n);
  expect(pin.fragments.at(-1)?.endUs).toBe(4250000n); buffer.clear();
});

test('clearing immediately zeroes every exposed owned buffer and releases every byte once', () => {
  const budget = new RecordingBufferBudget(); const buffer = warmed(budget); const pin = buffer.pin();
  const owned = [pin.initialization, ...pin.fragments.map(f => f.data)]; buffer.clear(); buffer.clear(); pin.release();
  expect(owned.every(data => data.every(byte => byte === 0))).toBe(true); expect(budget.bytes).toBe(0);
  expect(pin.released).toBe(true); expect(buffer.ready).toBe(false);
  expect(() => buffer.append(fragment(4))).toThrow('invalid_media');
});

test('malformed or repeated initialization cannot replace active media', () => {
  const budget = new RecordingBufferBudget(); const buffer = new RecordingFragmentBuffer(budget);
  expect(() => buffer.initialize(box('moov'))).toThrow('invalid_media'); expect(budget.bytes).toBe(0);
  buffer.initialize(initialization()); expect(() => buffer.initialize(initialization())).toThrow('invalid_media');
  buffer.clear(); expect(budget.bytes).toBe(0);
});

test('finite completion pins a short complete clip without declaring a live prebuffer ready', () => {
  const budget = new RecordingBufferBudget(); const buffer = new RecordingFragmentBuffer(budget);
  buffer.initialize(initialization()); buffer.append(fragment(0));
  expect(buffer.ready).toBe(false); expect(() => buffer.pin()).toThrow('invalid_media');
  const pin = buffer.sealFinite();
  expect(pin.fragments.map(f => f.sequence)).toEqual([0]); expect(buffer.ready).toBe(false);
  expect(() => buffer.append(fragment(1))).toThrow('invalid_media');
  expect(() => buffer.initialize(initialization())).toThrow('invalid_media');
  buffer.clear(); expect(budget.bytes).toBe(0); expect(pin.released).toBe(true);
});
