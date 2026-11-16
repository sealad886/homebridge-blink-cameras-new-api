/** Installed-package media qualification. External FFmpeg is a validation tool,
 * never a shipped dependency. libSRTP-only receiver authenticates captured wire bytes. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
export const EXTERNAL_LIVE_SELECTIONS = Object.freeze(['aac', 'latm'].flatMap(input => ['opus:16000', 'opus:24000', 'pcma:8000', 'pcmu:8000'].map(audio => `${input}:${audio}`)));
function frame(type, body = Buffer.alloc(0)) {
  const header = Buffer.alloc(12); header.write('BMR1'); header.writeUInt32BE(type, 4); header.writeUInt32BE(body.length, 8); return Buffer.concat([header, body]);
}
function initialization(stream, ssrc) {
  const body = Buffer.alloc(42); body.writeUInt32BE(stream); body.writeUInt32BE(ssrc, 4); body.writeUInt32BE(1, 8);
  body.fill(9, 12, 28); body.fill(8, 28); return frame(10, body);
}
export function readRtpFrames(bytes, reports = []) {
  const result = []; let at = 0;
  while (at < bytes.length) {
    assert(at + 12 <= bytes.length && bytes.toString('ascii', at, at + 4) === 'BMR1');
    const type = bytes.readUInt32BE(at + 4), size = bytes.readUInt32BE(at + 8); at += 12;
    assert([11, 12].includes(type) && size >= 4 && size <= 4096 && at + size <= bytes.length);
    const stream = bytes.readUInt32BE(at); const packet = bytes.subarray(at + 4, at + size); at += size;
    if (type === 12) {
      assert(packet.length >= 28 && packet[0] === 0x80 && packet[1] === 200 && packet.readUInt16BE(2) === 6);
      reports.push({ stream, ntpSeconds: packet.readUInt32BE(8), ntpFraction: packet.readUInt32BE(12), timestamp: packet.readUInt32BE(16),
        packets: packet.readUInt32BE(20), octets: packet.readUInt32BE(24) }); continue;
    }
    assert(packet.length >= 12 && packet[0] === 0x80 && [1, 2].includes(stream));
    result.push({ stream, timestamp: packet.readUInt32BE(4), sequence: packet.readUInt16BE(2), marker: Boolean(packet[1] & 128), data: packet.subarray(12) });
  }
  return result;
}
export function h264Stream(packets) {
  const nals = []; let fragment, timestamp;
  for (const packet of packets) {
    const payload = packet.data, type = payload[0] & 31;
    if (type === 28) {
      assert(payload.length >= 3); const start = Boolean(payload[1] & 128), end = Boolean(payload[1] & 64);
      if (start) { assert(!fragment); fragment = [Buffer.from([(payload[0] & 224) | (payload[1] & 31)])]; timestamp = packet.timestamp; }
      assert(fragment && timestamp === packet.timestamp); fragment.push(payload.subarray(2));
      if (end) { nals.push(Buffer.concat(fragment)); fragment = undefined; }
    } else if (type === 24) {
      assert(!fragment); let at = 1;
      while (at < payload.length) { assert(at + 2 <= payload.length); const size = payload.readUInt16BE(at); at += 2; assert(size && at + size <= payload.length); nals.push(payload.subarray(at, at + size)); at += size; }
    } else { assert(!fragment && type >= 1 && type <= 23); nals.push(payload); }
  }
  assert(!fragment && nals.some(nal => (nal[0] & 31) === 5), 'Authenticated video must contain an IDR');
  return Buffer.concat(nals.flatMap(nal => [Buffer.from([0, 0, 0, 1]), nal]));
}
function crc(bytes) {
  let value = 0;
  for (const byte of bytes) { value ^= byte << 24; for (let bit = 0; bit < 8; bit++) value = ((value << 1) ^ (value & 0x80000000 ? 0x04c11db7 : 0)) >>> 0; }
  return value;
}
export function opusOgg(packets, rate) {
  const head = Buffer.alloc(19); head.write('OpusHead'); head[8] = 1; head[9] = 1; head.writeUInt32LE(rate, 12);
  const tags = Buffer.alloc(16); tags.write('OpusTags');
  return Buffer.concat([head, tags, ...packets].map((packet, index, all) => {
    const segments = Math.floor(packet.length / 255) + 1; assert(segments <= 255);
    const page = Buffer.alloc(27 + segments + packet.length); page.write('OggS'); page[5] = index === 0 ? 2 : index === all.length - 1 ? 4 : 0;
    page.writeBigUInt64LE(BigInt(Math.max(0, index - 1) * 960), 6); page.writeUInt32LE(1, 14); page.writeUInt32LE(index, 18); page[26] = segments;
    page.fill(255, 27, 27 + segments - 1); page[27 + segments - 1] = packet.length % 255; packet.copy(page, 27 + segments);
    page.writeUInt32LE(crc(page), 22); return page;
  }));
}
/** Exercise bounded metadata/data progress without retaining or decoding large pictures. */
export async function exerciseExternalLiveBackpressure(packageRoot, protectionPath, ffmpegPath) {
  const requireInstalled = createRequire(join(packageRoot, 'package.json'));
  const { createExternalLiveCodec } = requireInstalled(join(packageRoot, 'dist/accessories/external-live-codec.js'));
  const queueBytes = 1024 * 1024, results = [];
  for (const name of ['continuous-audio', 'sparse-audio', 'delayed-audio-large-packets']) {
    const large = name === 'delayed-audio-large-packets', sparse = name !== 'continuous-audio';
    const width = large ? 1920 : 1280, height = large ? 1080 : 720, fps = large ? 1 : 30, duration = large ? 2 : 5;
    const fixture = execFileSync(protectionPath, ['--exec', ffmpegPath, '-hide_banner', '-nostdin', '-v', 'error',
      '-f', 'lavfi', '-i', `testsrc2=s=${width}x${height}:r=${fps}:d=${duration},noise=alls=100:allf=t+u:all_seed=42`,
      '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=24000:duration=${duration}`,
      ...(sparse ? ['-af', large ? "aselect='gte(t,1.9)'" : "aselect='not(between(t,0.5,4.5))'"] : []),
      '-c:v', 'libx264', '-threads:v', '1', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-bf', '0', '-g', '30',
      ...(large ? ['-qp', '0'] : ['-b:v', '8000000', '-minrate:v', '8000000', '-maxrate:v', '8000000', '-bufsize:v', '16000000',
        '-x264-params', 'nal-hrd=cbr:force-cfr=1']),
      '-c:a', 'aac', '-ar', '24000', '-ac', '1', '-b:a', '32000', '-f', 'mpegts', 'pipe:1'],
    { env: {}, timeout: 30000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    const video = [], audio = [], owner = new globalThis.AbortController(); let session;
    try {
      session = await createExternalLiveCodec({ ffmpegPath, protectionPath,
        video: { width, height, fps, bitrate: 8000000, maxFrames: 300, profile: 0, level: large ? 2 : 0, softwarePreset: 'ultrafast' },
        audio: { codec: 'opus', rate: 24000, bitrate: 32000, mtu: 1200, packetTime: 20 } }, {
        packet: async packet => { if (packet.stream === 1) video.push({ pts: packet.pts, bytes: packet.data.length }); else audio.push(packet.pts); },
      }, owner.signal);
      let closed = false; session.whenClosed.then(() => { closed = true; });
      for (let offset = 0; offset < fixture.length; offset += 65536) await session.write(fixture.subarray(offset, offset + 65536));
      await session.end();
      assert.equal(session.failed, false, `${name}: valid media must complete`); assert(closed, `${name}: actual child closure required`);
      assert.equal(video.length, fps * duration, `${name}: every source picture must be retained`); assert(audio.length > 0, `${name}: audio packets required`);
      for (let index = 1; index < video.length; index++) assert(video[index].pts > video[index - 1].pts, `${name}: video PTS must advance`);
      let maximumAudioStep = 0n;
      for (let index = 1; index < audio.length; index++) {
        assert(audio[index] > audio[index - 1], `${name}: audio PTS must advance`);
        if (audio[index] - audio[index - 1] > maximumAudioStep) maximumAudioStep = audio[index] - audio[index - 1];
      }
      const totalVideoBytes = video.reduce((sum, packet) => sum + packet.bytes, 0);
      let gapVideoBytes = 0;
      if (large) {
        assert(video.every(packet => packet.bytes <= queueBytes - 48), `${name}: witness packets must fit the admitted bound`);
        assert(totalVideoBytes > queueBytes + 256 * 1024, `${name}: witness must exceed the byte queue plus pipe headroom`);
        assert(audio[0] - video[0].pts > 1500000n, `${name}: delayed first audio must remain on its source timeline`);
      } else if (sparse) {
        gapVideoBytes = video.filter(packet => packet.pts - video[0].pts >= 500000n && packet.pts - video[0].pts < 4500000n)
          .reduce((sum, packet) => sum + packet.bytes, 0);
        assert(gapVideoBytes > queueBytes, `${name}: gap must contain more video than the byte queue`);
        assert(maximumAudioStep > 3900000n, `${name}: fixture must retain a real audio timestamp gap`);
      }
      results.push({ name, videoPackets: video.length, audioPackets: audio.length, totalVideoBytes, gapVideoBytes,
        maximumVideoPacketBytes: Math.max(...video.map(packet => packet.bytes)), maximumAudioStepUs: Number(maximumAudioStep), closed });
    } catch (error) { throw new Error(`External live backpressure qualification (${name}) failed`, { cause: error }); }
    finally { owner.abort(); await session?.stop(); fixture.fill(0); }
  }
  return results;
}
export async function exerciseExternalLive(packageRoot, protectionPath, ffmpegPath, validationRoot) {
  const requireInstalled = createRequire(join(packageRoot, 'package.json'));
  const { createOwnedMediaSession } = requireInstalled(join(packageRoot, 'dist/accessories/media-session.js'));
  const execute = (args, input) => execFileSync(protectionPath, ['--exec', ffmpegPath, '-hide_banner', '-loglevel', 'error', ...args],
    { input, env: {}, timeout: 30000, maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  const checker = join(validationRoot, 'check-protection' + (process.platform === 'win32' ? '.exe' : ''));
  const selections = [];
  for (const selection of EXTERNAL_LIVE_SELECTIONS) {
    const [format, codec, rawRate] = selection.split(':'), rate = Number(rawRate);
    const fixture = execute(['-f', 'lavfi', '-i', 'testsrc2=size=16x16:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=24000', '-t', '0.6',
      '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-g', '15', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '1', '-ar', '24000', '-b:a', '24k',
      ...(format === 'latm' ? ['-mpegts_flags', 'latm'] : []), '-f', 'mpegts', 'pipe:1']);
    const output = (ssrc, pt) => ({ address: '192.168.1.5', addressVersion: 'ipv4', port: 5000 + ssrc,
      suite: 'AES_CM_128_HMAC_SHA1_80', key: Buffer.alloc(16, 9), salt: Buffer.alloc(14, 8), ssrc,
      payloadType: pt, mtu: 1200, fps: 15, rtcpInterval: 0.5 });
    const captured = []; let total = 0;
    const session = await createOwnedMediaSession({ ffmpegPath, protectionPath,
      video: { output: output(7, 99), localPort: 6000, width: 16, height: 16, bitrate: 300000, maxFrames: 9000, profile: 0, level: 0, softwarePreset: 'ultrafast' },
      audio: { output: output(8, 110), localPort: 6001, codec, rate, bitrate: 24000 } }, new globalThis.AbortController().signal, {
      openSocket: async admitted => { let close; const whenClosed = new Promise(resolve => { close = resolve; });
        return { whenClosed, close, send: async bytes => { assert((total += bytes.length) < 8 * 1024 * 1024 && captured.length < 8192);
          captured.push({ stream: admitted.ssrc === 7 ? 1 : 2, bytes: Buffer.from(bytes) }); } }; },
    });
    try {
      await session.write(fixture); await session.end(); assert.equal(session.failed, false);
      const records = [initialization(1, 7), initialization(2, 8), ...captured.map(({ stream, bytes }) => {
        const body = Buffer.alloc(4 + bytes.length); body.writeUInt32BE(stream); bytes.copy(body, 4); return frame(bytes[1] === 200 ? 12 : 11, body);
      }), frame(4)];
      const receive = input => execFileSync(checker, ['--framed'], { input: Buffer.concat(input), env: {}, timeout: 5000, maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
      const reports = [];
      const plain = readRtpFrames(receive(records), reports), video = plain.filter(p => p.stream === 1), audio = plain.filter(p => p.stream === 2);
      assert(video.length && audio.length, 'Both authenticated streams required');
      const lastReports = [1, 2].map(stream => reports.filter(row => row.stream === stream).at(-1));
      assert(lastReports.every(Boolean), 'Both streams must send authenticated RTCP sender reports');
      assert.equal(lastReports[0].ntpSeconds, lastReports[1].ntpSeconds); assert.equal(lastReports[0].ntpFraction, lastReports[1].ntpFraction);
      for (const [i, packets] of [video, audio].entries()) {
        assert.equal(lastReports[i].packets, packets.length, 'RTCP packet count must match actual authenticated RTP');
        assert.equal(lastReports[i].octets, packets.reduce((sum, packet) => sum + packet.data.length, 0), 'RTCP octet count must match actual payloads');
      }
      const videoClockMs = ((lastReports[0].timestamp - video[0].timestamp) >>> 0) / 90;
      const audioClockMs = ((lastReports[1].timestamp - audio[0].timestamp) >>> 0) / (codec === 'opus' ? 48 : 8);
      assert(Math.abs(videoClockMs - audioClockMs) <= 200, 'A/V RTP clocks must correlate to the same RTCP wall-clock anchor');
      for (const packets of [video, audio]) for (let i = 1; i < packets.length; i++) {
        assert.equal((packets[i].sequence - packets[i - 1].sequence) & 65535, 1, 'RTP sequence must be continuous');
        assert(((packets[i].timestamp - packets[i - 1].timestamp) >>> 0) <= 180000, 'RTP timestamp must not jump backwards');
      }
      const pixels = execute(['-f', 'h264', '-i', 'pipe:0', '-threads', '1', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1'], h264Stream(video));
      assert(pixels.length >= 16 * 16 * 2 && pixels.some(byte => byte > 32), 'Independent external decoder must produce actual video pixels');
      const audioInput = codec === 'opus' ? opusOgg(audio.map(p => p.data), rate) : Buffer.concat(audio.map(p => p.data));
      const decoded = execute([...(codec === 'opus' ? ['-f', 'ogg'] : ['-f', codec === 'pcma' ? 'alaw' : 'mulaw', '-ar', '8000', '-ac', '1']),
        '-i', 'pipe:0', '-ar', String(rate), '-ac', '1', '-f', 'f32le', 'pipe:1'], audioInput);
      let peak = 0; for (let i = 0; i + 4 <= decoded.length; i += 4) peak = Math.max(peak, Math.abs(decoded.readFloatLE(i)));
      assert(decoded.length >= rate * 4 / 10 && peak > 0.001, 'Independent audio decoder must produce nonzero samples');
      const forged = records.map(bytes => Buffer.from(bytes)), index = forged.findIndex(bytes => bytes.readUInt32BE(4) === 11);
      assert(index >= 0); forged[index][forged[index].length - 1] ^= 1;
      assert.throws(() => receive(forged), 'Independent receiver must refuse forged SRTP'); selections.push(selection);
    } finally { await session.stop(); fixture.fill(0); }
  }
  await exerciseExternalLiveBackpressure(packageRoot, protectionPath, ffmpegPath);
  return selections;
}
