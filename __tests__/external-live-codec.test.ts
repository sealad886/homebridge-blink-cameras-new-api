import { Buffer } from 'node:buffer';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { createExternalLiveCodec, liveFfmpegArguments, type ExternalLiveCodecOptions } from '../src/accessories/external-live-codec';
import { ExternalFfmpegSetupError, probeExternalFfmpeg, resolveExternalFfmpegPath, type ExternalFfmpegProcessOptions } from '../src/accessories/external-ffmpeg';
import type { CodecPacket } from '../src/accessories/ffmpeg-packets';

const ffmpeg = (() => { try { return resolveExternalFfmpegPath(process.env.BLINK_FFMPEG_TEST_PATH ?? (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg')); } catch { return undefined; } })();
// The test seam runs the external codec directly; product always uses the separately qualified protection launcher.
const direct: ExternalFfmpegProcessOptions['launch'] = (_command, args, options) => spawn(args[1], args.slice(2), options);
function options(codec?: 'opus' | 'pcma' | 'pcmu', rate: 8000 | 16000 | 24000 = 16000): ExternalLiveCodecOptions {
  return { ffmpegPath: ffmpeg!, protectionPath: process.execPath, video: { width: 16, height: 16, fps: 15, bitrate: 100000, maxFrames: 100, profile: 0, level: 0 },
    ...(codec ? { audio: { codec, rate, bitrate: 24000, mtu: 1200, packetTime: codec === 'opus' ? 20 as const : undefined } } : {}) };
}
const fixture = (latm: boolean, audio = true) => execFileSync(ffmpeg!, ['-hide_banner', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=32x16:rate=5:duration=0.4',
  ...(audio ? ['-f', 'lavfi', '-i', 'sine=sample_rate=16000:duration=0.4'] : []), '-c:v', 'libx264', '-preset', 'ultrafast', '-bf', '0', ...(audio ? ['-c:a', 'aac'] : ['-an']),
  ...(latm ? ['-mpegts_flags', 'latm'] : []), '-f', 'mpegts', 'pipe:1'], { timeout: 5000, maxBuffer: 1024 * 1024 });
function oggPage(packet: Buffer, serial: number, sequence: number, flags: number, granule: bigint): Buffer {
  const laces = [...Array(Math.floor(packet.length / 255)).fill(255), packet.length % 255], page = Buffer.alloc(27 + laces.length + packet.length);
  page.write('OggS'); page[5] = flags; page.writeBigUInt64LE(granule, 6); page.writeUInt32LE(serial, 14); page.writeUInt32LE(sequence, 18);
  page[26] = laces.length; Buffer.from(laces).copy(page, 27); packet.copy(page, 27 + laces.length);
  let crc = 0; for (const byte of page) { crc ^= byte << 24; for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 0x80000000 ? 0x04c11db7 : 0)) >>> 0; }
  page.writeUInt32LE(crc, 22); return page;
}
function opusOgg(packets: CodecPacket[], rate: number): { bytes: Buffer; paddingUs: bigint } {
  const reference = execFileSync(ffmpeg!, ['-hide_banner', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', `anullsrc=r=${rate}:cl=mono`, '-t', '0.04', '-c:a', 'libopus', '-ar', String(rate), '-frame_duration', '20', '-f', 'opus', 'pipe:1'], { timeout: 5000, maxBuffer: 65536 });
  const position = reference.indexOf('OpusHead'); expect(position).toBeGreaterThan(0); const head = Buffer.from(reference.subarray(position, position + 19));
  const tags = Buffer.alloc(16); tags.write('OpusTags'); let granule = 0n;
  return { paddingUs: BigInt(head.readUInt16LE(10)) * 1000000n / 48000n, bytes: Buffer.concat([oggPage(head, 1, 0, 2, 0n), oggPage(tags, 1, 1, 0, 0n), ...packets.map((packet, index) => {
    granule += packet.duration * 48000n / 1000000n; return oggPage(packet.data, 1, index + 2, index === packets.length - 1 ? 4 : 0, granule);
  })]) };
}
function inputClockDifference(input: Buffer, rate: number): bigint {
  const text = execFileSync(ffmpeg!, ['-hide_banner', '-nostdin', '-v', 'error', '-copyts', '-f', 'mpegts', '-i', 'pipe:0',
    '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'rawvideo', '-enc_time_base:v', '1/90000', '-fps_mode:v', 'passthrough',
    '-c:a', 'pcm_s16le', '-ar', String(rate), '-ac', '1', '-f', 'framecrc', 'pipe:1'], { input, timeout: 5000, maxBuffer: 65536 }).toString();
  const times: Array<bigint | undefined> = [], bases: Array<[bigint, bigint]> = [];
  for (const line of text.split('\n')) {
    const base = /^#tb ([01]): (\d+)\/(\d+)/.exec(line); if (base) bases[Number(base[1])] = [BigInt(base[2]), BigInt(base[3])];
    const record = /^([01]),\s*-?\d+,\s*(-?\d+),/.exec(line);
    if (record) { const index = Number(record[1]); times[index] ??= BigInt(record[2]) * bases[index][0] * 1000000n / bases[index][1]; }
  }
  if (times[0] === undefined || times[1] === undefined) throw new Error('Synthetic source timing unavailable');
  return times[0] - times[1];
}

test('missing installation produces actionable fixed setup error without exposing its path', () => {
  expect(() => resolveExternalFfmpegPath('/nonexistent/private-tool')).toThrow(ExternalFfmpegSetupError);
  try { resolveExternalFfmpegPath('/nonexistent/private-tool'); } catch (error) { expect((error as Error).message).not.toContain('private-tool'); }
});
(ffmpeg ? test : test.skip)('installed external executable passes bounded minimum-version and codec capability checks', async () => {
  await expect(probeExternalFfmpeg(ffmpeg!, process.execPath, undefined, direct)).resolves.toMatchObject({ version: expect.any(String) });
}, 15000);
(ffmpeg ? test : test.skip).each(([false, true] as const).flatMap(latm => ([['opus', 16000], ['opus', 24000], ['pcma', 8000], ['pcmu', 8000]] as const).map(([codec, rate]) => [latm, codec, rate] as const)))(
  'external AAC/LATM=%s -> %s/%d preserves packets, source dimensions, decodable pictures and audio', async (latm, codec, rate) => {
    const packets: CodecPacket[] = [], source = jest.fn(), owner = new globalThis.AbortController();
    const session = await createExternalLiveCodec(options(codec, rate), { packet: async value => { packets.push({ ...value, data: Buffer.from(value.data) }); }, sourceInfo: source }, owner.signal,
      { launch: direct, probe: async () => ({ version: 'test' }) });
    try {
      const input = fixture(latm); for (let at = 0; at < input.length; at += 4096) await session.write(input.subarray(at, at + 4096)); await session.end();
      expect(session.failed).toBe(false); expect(source).toHaveBeenCalledWith({ width: 32, height: 16, fpsNumerator: 5, fpsDenominator: 1 });
      const video = packets.filter(p => p.stream === 1), audio = packets.filter(p => p.stream === 2); expect(video).toHaveLength(2); expect(audio.length).toBeGreaterThan(1);
      const pixels = execFileSync(ffmpeg!, ['-hide_banner', '-nostdin', '-v', 'error', '-f', 'h264', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
        { input: Buffer.concat(video.map(p => p.data)), timeout: 5000, maxBuffer: 65536 }); expect(pixels).toHaveLength(2 * 16 * 16 * 3);
      const wrapped = codec === 'opus' ? opusOgg(audio, rate) : { bytes: Buffer.concat(audio.map(p => p.data)), paddingUs: 0n }, bytes = wrapped.bytes;
      const sound = execFileSync(ffmpeg!, ['-hide_banner', '-nostdin', '-v', 'error', ...(codec === 'opus' ? ['-f', 'ogg'] : ['-f', codec === 'pcma' ? 'alaw' : 'mulaw', '-ar', '8000', '-ac', '1']),
        '-i', 'pipe:0', '-f', 's16le', '-ar', String(rate), 'pipe:1'], { input: bytes, timeout: 5000, maxBuffer: 65536 });
      expect(sound.length).toBeGreaterThan(rate * 0.3 * 2); expect(sound.some(byte => byte !== 0)).toBe(true);
      expect(audio.every(p => p.data.length + 22 <= 1200)).toBe(true);
      const difference = video[0].pts - (audio[0].pts + wrapped.paddingUs) - inputClockDifference(input, rate);
      expect(Number(difference < 0n ? -difference : difference)).toBeLessThanOrEqual(1);
    } finally { await session.stop(); }
  }, 10000);
(ffmpeg ? test : test.skip).each([['opus', 16000], ['opus', 24000], ['pcma', 8000], ['pcmu', 8000]] as const)(
  'preserves video-only sources when %s/%d audio is requested', async (codec, rate) => {
    const packets: CodecPacket[] = [], owner = new globalThis.AbortController();
    const session = await createExternalLiveCodec(options(codec, rate), { packet: async value => { packets.push({ ...value, data: Buffer.from(value.data) }); } }, owner.signal,
      { launch: direct, probe: async () => ({ version: 'test' }) });
    try {
      const input = fixture(false, false); for (let at = 0; at < input.length; at += 4096) await session.write(input.subarray(at, at + 4096)); await session.end();
      expect(session.failed).toBe(false); expect(packets.filter(packet => packet.stream === 1)).toHaveLength(2);
      expect(packets.some(packet => packet.stream === 2)).toBe(false);
      const pixels = execFileSync(ffmpeg!, ['-hide_banner', '-nostdin', '-v', 'error', '-f', 'h264', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
        { input: Buffer.concat(packets.map(packet => packet.data)), timeout: 5000, maxBuffer: 65536 });
      expect(pixels).toHaveLength(2 * 16 * 16 * 3); expect(pixels.some(byte => byte > 32)).toBe(true);
    } finally { await session.stop(); for (const packet of packets) packet.data.fill(0); }
  }, 10000);
(ffmpeg ? test : test.skip)('refuses missing audio payload even when its tee output failure is ignored', async () => {
  const owner = new globalThis.AbortController();
  const session = await createExternalLiveCodec(options('opus'), { packet: async () => {} }, owner.signal,
    { launch: (command, args, value) => direct(command, args.map(argument => argument.replace(']pipe:4', ']pipe:99')), value), probe: async () => ({ version: 'test' }) });
  try {
    await session.write(fixture(false)); await expect(session.end()).rejects.toThrow('External live codec unavailable');
    expect(session.failed).toBe(true);
  } finally { await session.stop(); }
}, 10000);
(ffmpeg ? test : test.skip)('refuses corrupt source audio instead of degrading a present audio stream', async () => {
  const input = fixture(false); let corrupt = 0;
  for (let at = 0; at + 188 <= input.length; at += 188) {
    expect(input[at]).toBe(0x47); if (((input[at + 1] & 31) << 8 | input[at + 2]) !== 257) continue;
    const adaptation = (input[at + 3] >> 4) & 3; if (!(adaptation & 1)) continue;
    let payload = at + (adaptation === 3 ? 5 + input[at + 4] : 4);
    if (input[at + 1] & 64) { expect(input.subarray(payload, payload + 3)).toEqual(Buffer.from([0, 0, 1])); payload += 9 + input[payload + 8]; }
    if (payload < at + 188) { input.fill(0, payload, at + 188); corrupt++; }
  }
  expect(corrupt).toBeGreaterThan(0);
  const session = await createExternalLiveCodec(options('opus'), { packet: async () => {} }, new globalThis.AbortController().signal,
    { launch: direct, probe: async () => ({ version: 'test' }) });
  try {
    await session.write(input); await expect(session.end()).rejects.toThrow('External live codec unavailable'); expect(session.failed).toBe(true);
  } finally { await session.stop(); input.fill(0); }
}, 10000);
(ffmpeg ? test : test.skip)('STOP interrupts an input-starved real codec and waits for actual child closure', async () => {
  let child: ReturnType<typeof spawn> | undefined;
  const session = await createExternalLiveCodec(options(), { packet: async () => {} }, new globalThis.AbortController().signal,
    { launch: (command, args, value) => { child = direct(command, args, value); return child; }, probe: async () => ({ version: 'test' }) });
  await session.stop(); expect(child!.exitCode !== null || child!.signalCode !== null).toBe(true); expect(session.failed).toBe(false);
  await expect(session.write(Buffer.from([1]))).rejects.toThrow('External live codec unavailable');
});
test('arguments admit only pipes and numeric profiles, never controller keys or provider URLs', () => {
  const args = liveFfmpegArguments(options('opus')); expect(args).toContain('pipe:0'); expect(args.join(' ')).not.toMatch(/srtp|rtsp|https?:/);
  expect(args).toContain('pipe'); expect(args.join(' ')).toContain('showinfo@blink_source');
});
