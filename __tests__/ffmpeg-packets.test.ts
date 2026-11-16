import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { FfmpegByteQueue, packetAdler32, parseFrameCrcPacket, readFfmpegPackets, type CodecPacket } from '../src/accessories/ffmpeg-packets';

const header = '#tb 0: 1/90000\n#media_type 0: video\n#codec_id 0: h264\n#dimensions 0: 16x16\n#sar 0: 1/1\n';
const line = (bytes: Buffer, pts = 0, duration = 6000) => `0, ${pts}, ${pts}, ${duration}, ${bytes.length}, 0x${packetAdler32(bytes).toString(16).padStart(8, '0')}\n`;
function read(bytes: Buffer[], metadata: string, consume: (packet: CodecPacket) => Promise<void> = async () => {}) {
  return readFfmpegPackets(Readable.from(bytes), undefined, Readable.from([Buffer.from(metadata)]),
    { width: 16, height: 16, maxFrames: 10 }, consume, new globalThis.AbortController().signal);
}
test('pairs fragmented byte pipes against metadata, preserving signed rational clocks and flags', async () => {
  const one = Buffer.from([0, 0, 1, 0x65, 1]), two = Buffer.from([0, 0, 1, 0x41, 2]);
  const saved: CodecPacket[] = [], borrowed: Buffer[] = [];
  await read([one.subarray(0, 2), Buffer.concat([one.subarray(2), two.subarray(0, 1)]), two.subarray(1)],
    header + line(one, -6000) + line(two).replace('\n', ', F=0x0, S=1, Quality stats, 8, 0x00000000\n'), async value => {
      borrowed.push(value.data); saved.push({ ...value, data: Buffer.from(value.data) });
    });
  expect(saved.map(p => [p.pts, p.duration, p.keyframe])).toEqual([[-66666n, 66666n, true], [0n, 66666n, false]]);
  expect(saved.map(p => p.data)).toEqual([one, two]); expect(borrowed.every(b => b.every(n => n === 0))).toBe(true);
});
test('preserves a monotonic source gap within the bounded live session lifetime', async () => {
  const data = Buffer.from([0, 0, 1, 0x65]), timestamps: bigint[] = [];
  await read([data, data], header + line(data) + line(data, 135000), async packet => { timestamps.push(packet.pts); });
  expect(timestamps).toEqual([0n, 1500000n]);
});
test.each([0, -6000, 27000001])('rejects repeated/backward or over-lifetime timestamp %s', async pts => {
  const data = Buffer.from([0, 0, 1, 0x65]);
  await expect(read([data, data], header + line(data) + line(data, pts))).rejects.toThrow('External codec packets unavailable');
});
test.each(['checksum', 'short', 'residue', 'header', 'metadata'])('rejects %s without accepting successful EOF', async kind => {
  const data = Buffer.from([1, 2, 3]); let bytes = data, metadata = header + line(data);
  if (kind === 'checksum') metadata = metadata.replace(/0x[a-f0-9]+\n$/, '0x00000000\n');
  if (kind === 'short') bytes = data.subarray(0, 2);
  if (kind === 'residue') bytes = Buffer.concat([data, Buffer.from([4])]);
  if (kind === 'header') metadata = metadata.replace('16x16', '32x16');
  if (kind === 'metadata') metadata = '#'.repeat(1025) + '\n';
  await expect(read([bytes], metadata)).rejects.toThrow('External codec packets unavailable');
});
test('G711 output is repacketized by samples and negotiated MTU without moving its source clock', async () => {
  const video = Buffer.from([0, 0, 1, 0x65]), audio = Buffer.alloc(200, 0x55), packets: CodecPacket[] = [];
  const audioHeader = '#tb 1: 1/8000\n#media_type 1: audio\n#codec_id 1: pcm_alaw\n#sample_rate 1: 8000\n#channel_layout_name 1: mono\n';
  const metadata = header + audioHeader + line(video) + `1, 16000, 16000, 200, 200, 0x${packetAdler32(audio).toString(16).padStart(8, '0')}\n`;
  await readFfmpegPackets(Readable.from([video]), Readable.from([audio]), Readable.from([metadata]),
    { width: 16, height: 16, maxFrames: 1, audio: { codec: 'pcma', rate: 8000, mtu: 128 } }, async p => { packets.push({ ...p, data: Buffer.from(p.data) }); }, new globalThis.AbortController().signal);
  expect(packets.filter(p => p.stream === 2).map(p => [p.data.length, p.pts, p.duration])).toEqual([[106, 2000000n, 13250n], [94, 2013250n, 11750n]]);
});
test('bounded byte queue waits for space and aborts pending readers and producers', async () => {
  const owner = new globalThis.AbortController(), queue = new FfmpegByteQueue(owner.signal);
  await queue.push(Buffer.alloc(1024 * 1024)); let admitted = false;
  const waiting = queue.push(Buffer.from([1])).then(() => { admitted = true; }); await Promise.resolve(); expect(admitted).toBe(false);
  const first = await queue.take(1); first.fill(0); await waiting; expect(admitted).toBe(true); queue.dispose();
  const pending = queue.take(1); owner.abort(); await expect(pending).rejects.toThrow();
});
test('near-limit packet completes when an ordinary pipe chunk straddles its boundary', async () => {
  jest.useFakeTimers();
  const owner = new globalThis.AbortController(), queue = new FfmpegByteQueue(owner.signal);
  const prefix = Buffer.alloc(1000000), incoming = Buffer.alloc(65536);
  for (let index = 0; index < prefix.length; index++) prefix[index] = index % 251;
  for (let index = 0; index < incoming.length; index++) incoming[index] = index % 237;
  await queue.push(prefix);
  const packet = queue.take(1020000), admitted = queue.push(incoming);
  let completed = false;
  const both = Promise.all([packet, admitted]).then(value => { completed = true; return value; });
  // Keep the intentional pre-fix failure bounded and clean up every pending operation.
  both.catch(() => undefined);
  try {
    await jest.advanceTimersByTimeAsync(1);
    expect(completed).toBe(true);
    const [actual] = await both, expected = Buffer.concat([prefix, incoming.subarray(0, 20000)]);
    expect(actual.equals(expected)).toBe(true); expect(packetAdler32(actual)).toBe(packetAdler32(expected)); actual.fill(0);
    queue.end();
    expect((await queue.take(45536)).equals(incoming.subarray(20000))).toBe(true); await queue.finish();
  } finally { owner.abort(); await Promise.allSettled([packet, admitted]); queue.dispose(); jest.useRealTimers(); }
});
test.each(['abort', 'end'])('%s releases a producer blocked after partial chunk admission', async action => {
  const owner = new globalThis.AbortController(), queue = new FfmpegByteQueue(owner.signal);
  await queue.push(Buffer.alloc(1000000));
  const pending = queue.push(Buffer.alloc(65536));
  if (action === 'abort') owner.abort(); else queue.end();
  try { await expect(pending).rejects.toThrow('External codec packets unavailable'); }
  finally { owner.abort(); queue.dispose(); }
});
test('packet grammar rejects unbounded numbers and preserves zero-duration copy metadata for finite owner validation', () => {
  expect(parseFrameCrcPacket('0, -1, -1, 0, 1, 0x00000000')).toMatchObject({ pts: -1n, duration: 0n });
  expect(() => parseFrameCrcPacket(`0, ${1n << 63n}, 0, 1, 1, 0x00000000`)).toThrow();
});

test('raw decoded-frame metadata requires an explicit bounded size allowance', () => {
  const bytes = 1920 * 1080 * 3 / 2;
  const row = `0, 0, 0, 33333, ${bytes}, 0x00000000`;
  expect(() => parseFrameCrcPacket(row)).toThrow();
  expect(parseFrameCrcPacket(row, 1920 * 1080 * 4)?.size).toBe(bytes);
  expect(() => parseFrameCrcPacket(row, bytes - 1)).toThrow();
  expect(() => parseFrameCrcPacket(row, 64 * 1024 * 1024 + 1)).toThrow();
});
