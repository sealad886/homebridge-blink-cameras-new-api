import { test } from '@jest/globals';
import { Buffer } from 'node:buffer';
import { BoundedMediaSender, H264Packetizer, MEDIA_OUTPUT_LIMITS, MediaOutputOptions, senderReport, validateMediaOutput } from '../src/accessories/media-output';

const options = (): MediaOutputOptions => ({ address: '192.168.1.5', addressVersion: 'ipv4', port: 5000,
  suite: 'AES_CM_128_HMAC_SHA1_80', key: Buffer.alloc(16), salt: Buffer.alloc(14), ssrc: 0xcafebabe,
  payloadType: 99, mtu: 128, fps: 30, rtcpInterval: 0.5 });

describe('isolated media output boundary', () => {
  test.each([{ address: 'example.com' }, { address: '::1' }, { address: 'fe80::1%en0', addressVersion: 'ipv6' },
    { address: '0.0.0.0' }, { address: '127.0.0.1' }, { address: '224.0.0.1' }, { port: 0 }, { port: 65536 }, { payloadType: 128 }, { fps: 0 }, { mtu: 63 }, { ssrc: 0 },
    { rtcpInterval: NaN }, { suite: 'NONE' }, { key: Buffer.alloc(15) }, { salt: Buffer.alloc(16) }])('rejects invalid negotiation %p', change => {
    expect(() => validateMediaOutput({ ...options(), ...change } as MediaOutputOptions)).toThrow();
  });
  test('accepts numeric IPv4 and IPv6 negotiation', () => {
    expect(() => validateMediaOutput(options())).not.toThrow();
    expect(() => validateMediaOutput({ ...options(), address: 'fd00::123', addressVersion: 'ipv6' })).not.toThrow();
  });
  test('single NAL preserves timestamp, SSRC, payload and final marker', () => {
    const packets = new H264Packetizer(0xcafebabe, 99, 128, 65535).packetize([Buffer.from([0x67, 1]), Buffer.from([0x65, 2])], 90000);
    expect(packets[0].readUInt16BE(2)).toBe(65535); expect(packets[1].readUInt16BE(2)).toBe(0);
    expect(packets.map(p => p[1])).toEqual([99, 227]);
    for (const packet of packets) { expect(packet.readUInt32BE(4)).toBe(90000); expect(packet.readUInt32BE(8)).toBe(0xcafebabe); }
    expect(packets[1].subarray(12)).toEqual(Buffer.from([0x65, 2]));
  });
  test('RFC6184 FU-A reassembles original NAL within authenticated MTU', () => {
    const nal = Buffer.concat([Buffer.from([0x65]), Buffer.alloc(350, 7)]);
    const packets = new H264Packetizer(3, 99, 128, 10).packetize([nal], 123);
    expect(packets.length).toBeGreaterThan(1);
    expect(packets[0][12]).toBe(0x7c); expect(packets[0][13]).toBe(0x85);
    expect(packets[packets.length - 1][13]).toBe(0x45);
    expect(Buffer.concat([Buffer.from([0x65]), ...packets.map(p => p.subarray(14))])).toEqual(nal);
    packets.forEach((p, i) => { expect(p.length + 10).toBeLessThanOrEqual(128); expect(p[1] & 128).toBe(i === packets.length - 1 ? 128 : 0); });
  });
  test('rejects oversized or invalid access units before consuming sequence', () => {
    const packetizer = new H264Packetizer(3, 99, 128, 10);
    expect(() => packetizer.packetize([Buffer.alloc(MEDIA_OUTPUT_LIMITS.accessUnitBytes + 1, 0x65)], 0)).toThrow();
    expect(() => packetizer.packetize([Buffer.from([0x7c])], 0)).toThrow();
    expect(packetizer.packetize([Buffer.from([0x65])], 0)[0].readUInt16BE(2)).toBe(10);
  });
  test('compound RTCP contains SR clock/counters and bounded pseudonymous CNAME', () => {
    const report = senderReport(3, 1000500, 90000, 20, 400, 'session-123');
    expect(report[1]).toBe(200); expect(report.readUInt32BE(8)).toBe(2208989800);
    expect(report.readUInt32BE(12)).toBe(0x80000000); expect(report.readUInt32BE(16)).toBe(90000);
    expect(report.readUInt32BE(20)).toBe(20); expect(report.readUInt32BE(24)).toBe(400);
    expect(report[29]).toBe(202); expect(report.subarray(38, 49).toString()).toBe('session-123');
    expect(report.length % 4).toBe(0);
    expect(() => senderReport(3, 0, 0, 0, 0, 'device@example.com')).toThrow();
  });
  test('sink receives copied data and exact destination; STOP rejects queued and active sends', async () => {
    let signal: globalThis.AbortSignal | undefined;
    const sink = { send: jest.fn((_p: Buffer, _a: string, _port: number, s: globalThis.AbortSignal) => { signal = s; return new Promise<void>(() => {}); }) };
    const sender = new BoundedMediaSender(options(), sink);
    const bytes = Buffer.alloc(32, 4); const active = sender.send(bytes); const queued = sender.send(bytes);
    await Promise.resolve(); bytes.fill(8); expect(sink.send.mock.calls[0][0][0]).toBe(4);
    expect(sink.send.mock.calls[0].slice(1, 3)).toEqual(['192.168.1.5', 5000]);
    sender.close(); expect(signal?.aborted).toBe(true);
    await expect(active).rejects.toThrow(); await expect(queued).rejects.toThrow();
    await expect(sender.send(bytes)).rejects.toThrow();
  });
  test('stalled sink expires and closes admission', async () => {
    jest.useFakeTimers();
    try {
      const sender = new BoundedMediaSender(options(), { send: () => new Promise<void>(() => {}) });
      const result = sender.send(Buffer.alloc(32)); const check = expect(result).rejects.toThrow();
      await jest.advanceTimersByTimeAsync(MEDIA_OUTPUT_LIMITS.sendTimeoutMs); await check;
      await expect(sender.send(Buffer.alloc(32))).rejects.toThrow();
    } finally { jest.useRealTimers(); }
  });
  test('finite queue admission rejects overflow', async () => {
    const sender = new BoundedMediaSender(options(), { send: () => new Promise<void>(() => {}) });
    const pending = Array.from({ length: MEDIA_OUTPUT_LIMITS.queuedPackets }, () => sender.send(Buffer.alloc(32)).catch(() => {}));
    await expect(sender.send(Buffer.alloc(32))).rejects.toThrow(); sender.close(); await Promise.all(pending);
  });
});
