import { Buffer } from 'node:buffer';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { createExternalLiveCodec, type ExternalLiveCodecOptions } from '../src/accessories/external-live-codec';
import { resolveExternalFfmpegPath, type ExternalFfmpegProcessOptions } from '../src/accessories/external-ffmpeg';
import type { CodecPacket } from '../src/accessories/ffmpeg-packets';

const ffmpeg = (() => { try { return resolveExternalFfmpegPath(process.env.BLINK_FFMPEG_TEST_PATH ?? (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg')); } catch { return undefined; } })();
const media = ffmpeg ? test : test.skip;
const direct: ExternalFfmpegProcessOptions['launch'] = (_command, args, options) => spawn(args[1], args.slice(2), options);
const execute = (args: string[], input?: Buffer) => execFileSync(ffmpeg!, ['-hide_banner', '-nostdin', '-v', 'error', ...args],
  { input, timeout: 10000, maxBuffer: 8 * 1024 * 1024 });

async function convert(input: Buffer, width: number, height: number): Promise<CodecPacket[]> {
  const packets: CodecPacket[] = [];
  const options: ExternalLiveCodecOptions = { ffmpegPath: ffmpeg!, protectionPath: process.execPath,
    video: { width, height, fps: 15, bitrate: 300000, maxFrames: 100, profile: 0, level: 0, softwarePreset: 'ultrafast' } };
  const session = await createExternalLiveCodec(options, { packet: async value => { packets.push({ ...value, data: Buffer.from(value.data) }); } },
    new globalThis.AbortController().signal, { launch: direct, probe: async () => ({ version: 'fixture' }) });
  try {
    for (let offset = 0; offset < input.length; offset += 65536) await session.write(input.subarray(offset, offset + 65536));
    await session.end(); expect(session.failed).toBe(false); return packets;
  } finally { await session.stop(); }
}

media.each([['24', 24, 30], ['30000/1001', 30000 / 1001, 30], ['30', 30, 30], ['5', 5, 10]] as const)(
  'keeps source-anchored cadence for %s fps input under a 15 fps cap', async (rate, numericRate, expected) => {
    const input = execute(['-f', 'lavfi', '-i', `testsrc2=size=32x16:rate=${rate}:duration=2`, '-vf', 'setpts=PTS+2/TB',
      '-an', '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-bf', '0', '-f', 'mpegts', 'pipe:1']);
    const packets = await convert(input, 32, 16);
    expect(packets).toHaveLength(expected); expect(packets[0].pts).toBeGreaterThan(2000000n);
    for (const packet of packets) {
      const elapsed = Number(packet.pts - packets[0].pts), frame = Math.round(elapsed * numericRate / 1000000);
      expect(Math.abs(elapsed - frame * 1000000 / numericRate)).toBeLessThanOrEqual(12);
    }
  }, 15000);

media.each([
  ['a source timestamp gap', "setpts='PTS+2/TB+if(gte(N,30),0.5/TB,0)'", 1500000n, 31],
  ['a 1.5-second source timestamp gap', "setpts='PTS+2/TB+if(gte(N,30),1.5/TB,0)'", 2500000n, 31],
  ['a low-to-high source rate transition', "select='if(lt(t,1),not(mod(n,6)),1)',setpts=PTS+2/TB", 1000000n, 20],
] as const)('keeps the 15 fps cap after %s without replaying missed frame credit', async (_name, filter, resumedAt, expected) => {
  const input = execute(['-f', 'lavfi', '-i', 'testsrc2=size=32x16:rate=30:duration=2', '-vf', filter,
    '-an', '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-bf', '0', '-fps_mode', 'passthrough', '-f', 'mpegts', 'pipe:1']);
  const packets = await convert(input, 32, 16), origin = packets[0].pts;
  const resumed = packets.filter(packet => packet.pts - origin >= resumedAt && packet.pts - origin < resumedAt + 500000n);
  // At most eight source frames fit the first half-second of a 15 fps selection.
  expect(resumed.length).toBeGreaterThanOrEqual(7); expect(resumed.length).toBeLessThanOrEqual(8);
  expect(packets).toHaveLength(expected); expect(origin).toBeGreaterThan(2000000n);
  for (const packet of packets) {
    const elapsed = Number(packet.pts - origin), frame = Math.round(elapsed * 30 / 1000000);
    expect(Math.abs(elapsed - frame * 1000000 / 30)).toBeLessThanOrEqual(12);
  }
}, 15000);

media.each([['622x342', '1'], ['640x360', '2']] as const)(
  'emits square pixels for %s input SAR %s and keeps padding centered', async (size, sar) => {
    const input = execute(['-f', 'lavfi', '-i', `color=c=white:size=${size}:rate=5:duration=0.4`, '-vf', `setsar=${sar}`,
      '-an', '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-bf', '0', '-f', 'mpegts', 'pipe:1']);
    const packets = await convert(input, 640, 360), encoded = Buffer.concat(packets.map(packet => packet.data));
    const metadata = execute(['-f', 'h264', '-i', 'pipe:0', '-frames:v', '1', '-c:v', 'rawvideo', '-f', 'framecrc', 'pipe:1'], encoded).toString();
    expect(metadata).toMatch(/^#sar 0: 1\/1$/m);
    const pixels = execute(['-f', 'h264', '-i', 'pipe:0', '-frames:v', '1', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1'], encoded);
    expect(pixels).toHaveLength(640 * 360);
    const dark = (row: number) => pixels.subarray(row * 640, (row + 1) * 640).every(value => value < 32);
    let top = 0, bottom = 0;
    while (top < 180 && dark(top)) top++;
    while (bottom < 180 && dark(359 - bottom)) bottom++;
    expect(Math.abs(top - bottom)).toBeLessThanOrEqual(1);
    if (size === '622x342') expect(top).toBeGreaterThan(0);
    expect(pixels.subarray(180 * 640, 181 * 640).every(value => value > 220)).toBe(true);
  }, 15000);
