import { test } from '@jest/globals';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { createExternalLiveCodec } from '../src/accessories/external-live-codec';
import { EXTERNAL_FFMPEG_LIMITS, resolveExternalFfmpegPath } from '../src/accessories/external-ffmpeg';

const ffmpeg = (() => { try { return resolveExternalFfmpegPath(process.env.BLINK_FFMPEG_TEST_PATH ??
  (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg')); } catch { return undefined; } })();
const protection = process.env.BLINK_PROTECTION_TEST_WORKER_PATH ?? join(process.cwd(), 'native/build/blink-protection-worker' + (process.platform === 'win32' ? '.exe' : ''));
const media = ffmpeg && existsSync(protection) ? test : test.skip;

media.each([
  ['continuous audio', false, false], ['sparse audio', true, false],
  ['large packets with continuous audio', false, true], ['large packets with delayed audio', true, true],
] as const)('drains exact packets and closes with %s', async (_name, sparse, large) => {
  const width = large ? 1920 : 1280, height = large ? 1080 : 720, fps = large ? 1 : 30, duration = large ? 2 : 5;
  const fixture = execFileSync(ffmpeg!, ['-hide_banner', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
    `testsrc2=s=${width}x${height}:r=${fps}:d=${duration},noise=alls=100:allf=t+u:all_seed=42`,
    '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=24000:duration=${duration}`,
    ...(sparse ? ['-af', large ? "aselect='gte(t,1.9)'" : "aselect='not(between(t,0.5,4.5))'"] : []),
    '-c:v', 'libx264', '-threads:v', '1', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-bf', '0', '-g', '30',
    ...(large ? ['-qp', '0'] : ['-b:v', '8000000', '-minrate:v', '8000000', '-maxrate:v', '8000000', '-bufsize:v', '16000000',
      '-x264-params', 'nal-hrd=cbr:force-cfr=1']),
    '-c:a', 'aac', '-ar', '24000', '-ac', '1', '-b:a', '32000', '-f', 'mpegts', 'pipe:1'],
  { timeout: 30000, maxBuffer: 16 * 1024 * 1024, env: {} });
  const video: Array<{ pts: bigint; bytes: number }> = [], audio: bigint[] = [];
  const owner = new globalThis.AbortController(); let child: ChildProcess | undefined;
  const session = await createExternalLiveCodec({ ffmpegPath: ffmpeg!, protectionPath: protection,
    video: { width, height, fps, bitrate: 8000000, maxFrames: 300, profile: 0, level: large ? 2 : 0, softwarePreset: 'ultrafast' },
    audio: { codec: 'opus', rate: 24000, bitrate: 32000, mtu: 1200, packetTime: 20 } }, {
    packet: async packet => { if (packet.stream === 1) video.push({ pts: packet.pts, bytes: packet.data.length }); else audio.push(packet.pts); },
  }, owner.signal, { launch: (command, args, options) => {
    const value = spawn(command, [...args], options); if (args.includes('tee')) child = value; return value;
  } });
  try {
    for (let at = 0; at < fixture.length; at += 65536) await session.write(fixture.subarray(at, at + 65536));
    await session.end(); expect(session.failed).toBe(false); expect(video).toHaveLength(fps * duration); expect(audio.length).toBeGreaterThan(0);
    expect(child!.exitCode !== null || child!.signalCode !== null).toBe(true);
    for (let index = 1; index < video.length; index++) expect(video[index].pts).toBeGreaterThan(video[index - 1].pts);
    for (let index = 1; index < audio.length; index++) expect(audio[index]).toBeGreaterThan(audio[index - 1]);
    if (large) {
      expect(video.every(packet => packet.bytes <= EXTERNAL_FFMPEG_LIMITS.packetBytes - 48)).toBe(true);
      expect(video.reduce((sum, packet) => sum + packet.bytes, 0)).toBeGreaterThan(EXTERNAL_FFMPEG_LIMITS.packetBytes + 256 * 1024);
      if (sparse) expect(audio[0] - video[0].pts).toBeGreaterThan(1500000n);
    } else if (sparse) {
      const inGap = video.filter(packet => packet.pts - video[0].pts >= 500000n && packet.pts - video[0].pts < 4500000n);
      expect(inGap.reduce((sum, packet) => sum + packet.bytes, 0)).toBeGreaterThan(EXTERNAL_FFMPEG_LIMITS.packetBytes);
      const maximumAudioStep = audio.slice(1).reduce((maximum, pts, index) => pts - audio[index] > maximum ? pts - audio[index] : maximum, 0n);
      expect(maximumAudioStep).toBeGreaterThan(3900000n);
    }
  } finally { owner.abort(); await session.stop(); fixture.fill(0); }
}, 30000);
