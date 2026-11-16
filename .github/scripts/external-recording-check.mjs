/** Portable synthetic MP4 fixtures + independent external-decoder acceptance.
 * No FFmpeg libraries or codec source archives are built or distributed. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function boxes(data, start = 0, end = data.length) {
  const result = [];
  for (let at = start; at < end;) { assert(at + 8 <= end); const size = data.readUInt32BE(at); assert(size >= 8 && at + size <= end);
    result.push({ type: data.toString('ascii', at + 4, at + 8), start: at, payload: at + 8, end: at + size }); at += size; }
  return result;
}
function child(data, parent, type) { const result = boxes(data, parent.payload, parent.end).find(item => item.type === type); assert(result, `Missing synthetic ${type}`); return result; }
function table(type, values) {
  const bytes = Buffer.alloc(16 + values.length * 4); bytes.writeUInt32BE(bytes.length); bytes.write(type, 4); bytes.writeUInt32BE(values.length, 12);
  values.forEach((value, index) => bytes.writeUInt32BE(value, 16 + index * 4)); return bytes;
}
function packed(type, payload) { const result = Buffer.alloc(8 + payload.length); result.writeUInt32BE(result.length); result.write(type, 4); payload.copy(result, 8); return result; }
function runs(values) { const result = []; for (const value of values) { if (result.length && result.at(-1)[1] === value) result.at(-1)[0]++; else result.push([1, value]); } return result; }
function sampleTable(type, rows) { const payload = Buffer.alloc(8 + rows.length * 8); payload.writeUInt32BE(rows.length, 4); rows.forEach((row, i) => { payload.writeUInt32BE(row[0], 8 + i * 8); payload.writeUInt32BE(row[1], 12 + i * 8); }); return packed(type, payload); }
/** Rebuild only bounded sample tables; source codecs are still generated externally.
 * SEI samples reserve real MP4 clock slots, matching Blink metadata-only access units. */
export function mutateRecordingFixture(original, { metadataEvery = 0, audioGap = false, corruptAudio = false, corruptVideo = false, overlapMetadata = false } = {}) {
  const data = Buffer.from(original), top = boxes(data), moov = top.find(b => b.type === 'moov'), mdat = top.find(b => b.type === 'mdat');
  assert(moov && mdat && moov.start > mdat.end - 1, 'Fixture must retain tail moov');
  const tracks = boxes(data, moov.payload, moov.end).filter(b => b.type === 'trak').map(trak => {
    const mdia = child(data, trak, 'mdia'), handler = child(data, mdia, 'hdlr'), stbl = child(data, child(data, mdia, 'minf'), 'stbl');
    const stsz = child(data, stbl, 'stsz'), stts = child(data, stbl, 'stts'), stco = child(data, stbl, 'stco'), stsc = child(data, stbl, 'stsc');
    const fixed = data.readUInt32BE(stsz.payload + 4), count = data.readUInt32BE(stsz.payload + 8);
    assert(count < 20000); const sizes = Array.from({ length: count }, (_, i) => fixed || data.readUInt32BE(stsz.payload + 12 + i * 4));
    const offsets = [], chunks = data.readUInt32BE(stco.payload + 4), groups = data.readUInt32BE(stsc.payload + 4); let sample = 0, group = 0;
    for (let chunk = 1; chunk <= chunks; chunk++) {
      while (group + 1 < groups && chunk >= data.readUInt32BE(stsc.payload + 8 + (group + 1) * 12)) group++;
      let offset = data.readUInt32BE(stco.payload + 8 + (chunk - 1) * 4); const per = data.readUInt32BE(stsc.payload + 12 + group * 12);
      for (let i = 0; i < per; i++) { assert(sample < count && offset >= mdat.payload && offset + sizes[sample] <= mdat.end); offsets.push(offset); offset += sizes[sample++]; }
    }
    assert.equal(sample, count); const durations = [];
    for (let i = 0; i < data.readUInt32BE(stts.payload + 4); i++) { const n = data.readUInt32BE(stts.payload + 8 + i * 8), duration = data.readUInt32BE(stts.payload + 12 + i * 8); assert(durations.length + n <= count); for (let j = 0; j < n; j++) durations.push(duration); }
    assert.equal(durations.length, count);
    return { trak, mdia, stbl, sizes, offsets, durations, video: data.toString('ascii', handler.payload + 8, handler.payload + 12) === 'vide', inserted: [] };
  });
  const metadata = Buffer.from([0, 0, 0, 5, 6, 6, 1, 0xc0, 0x80]);
  for (const track of tracks) {
    if (track.video && metadataEvery) for (let at = metadataEvery; at < track.sizes.length; at += metadataEvery + 1) {
      track.sizes.splice(at, 0, metadata.length); track.offsets.splice(at, 0, mdat.end); track.durations.splice(at, 0, track.durations[at]); track.inserted.push(at);
    }
    if (!track.video && audioGap) track.durations[Math.floor(track.durations.length / 2)] += 512;
    if (!track.video && corruptAudio) for (let i = Math.floor(track.sizes.length * 3 / 4); i < track.sizes.length; i++) data.fill(255, track.offsets[i], track.offsets[i] + track.sizes[i]);
    if (track.video && corruptVideo) {
      let changed = false;
      for (let at = track.offsets[0], end = at + track.sizes[0]; at < end;) {
        const length = data.readUInt32BE(at); assert(length > 0 && at + 4 + length <= end);
        const type = data[at + 4] & 31;
        if (type >= 1 && type <= 5) { data[at + 4] |= 128; changed = true; break; }
        at += 4 + length;
      }
      assert(changed, 'A real synthetic VCL sample is required');
    }
  }
  const movieTimescale = data.readUInt32BE(child(data, moov, 'mvhd').payload + 12);
  const trackDuration = track => Math.ceil(track.durations.reduce((a, b) => a + b) * movieTimescale / data.readUInt32BE(child(data, track.mdia, 'mdhd').payload + 12));
  function rewrite(box, track) {
    if (box.type === 'trak') track = tracks.find(t => t.trak.start === box.start);
    if (['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts'].includes(box.type)) {
      const members = boxes(data, box.payload, box.end), rewritten = members.map(b => rewrite(b, track));
      if (box.type === 'stbl' && track?.video && overlapMetadata) {
        assert(!members.some(b => b.type === 'ctts') && track.inserted.length);
        rewritten.push(sampleTable('ctts', runs(track.sizes.map((_size, index) => track.inserted.includes(index) ? 1 : 0))));
      }
      return packed(box.type, Buffer.concat(rewritten));
    }
    if (box.type === 'mvhd') { const copy = Buffer.from(data.subarray(box.start, box.end)); copy.writeUInt32BE(Math.max(...tracks.map(trackDuration)), 24); return copy; }
    if (!track || (!track.inserted.length && !(audioGap && !track.video))) return data.subarray(box.start, box.end);
    if (box.type === 'tkhd') { const copy = Buffer.from(data.subarray(box.start, box.end)); assert.equal(copy[8], 0); copy.writeUInt32BE(trackDuration(track), 28); return copy; }
    if (box.type === 'elst') { const copy = Buffer.from(data.subarray(box.start, box.end)); assert.equal(copy[8], 0); assert.equal(copy.readUInt32BE(12), 1); copy.writeUInt32BE(trackDuration(track), 16); return copy; }
    if (box.type === 'stts') return sampleTable('stts', runs(track.durations));
    if (box.type === 'mdhd') { const copy = Buffer.from(data.subarray(box.start, box.end)); assert.equal(copy[8], 0); copy.writeUInt32BE(track.durations.reduce((a, b) => a + b), 24); return copy; }
    if (track.video && track.inserted.length) {
      if (box.type === 'stco') return table('stco', track.offsets);
      if (box.type === 'stsz') { const payload = Buffer.alloc(12 + track.sizes.length * 4); payload.writeUInt32BE(track.sizes.length, 8); track.sizes.forEach((n, i) => payload.writeUInt32BE(n, 12 + i * 4)); return packed('stsz', payload); }
      if (box.type === 'stsc') { const payload = Buffer.alloc(20); payload.writeUInt32BE(1, 4); payload.writeUInt32BE(1, 8); payload.writeUInt32BE(1, 12); payload.writeUInt32BE(1, 16); return packed('stsc', payload); }
      if (box.type === 'stss') { const count = data.readUInt32BE(box.payload + 4), values = [];
        for (let i = 0; i < count; i++) { let n = data.readUInt32BE(box.payload + 8 + i * 4); for (const inserted of track.inserted) if (inserted < n) n++; values.push(n); }
        return table('stss', values); }
    }
    return data.subarray(box.start, box.end);
  }
  const inserted = tracks.some(t => t.inserted.length);
  return Buffer.concat(top.map(b => b.type === 'moov' ? rewrite(b) : b.type === 'mdat' && inserted ? packed('mdat', Buffer.concat([data.subarray(b.payload, b.end), metadata])) : data.subarray(b.start, b.end)));
}
export async function exerciseExternalRecording(packageRoot, protectionPath, ffmpegPath) {
  const requireInstalled = createRequire(join(packageRoot, 'package.json'));
  const { prepareNativeRecording, NativeRecordingMemoryBudget } = requireInstalled(join(packageRoot, 'dist/accessories/native-recording-preparation.js'));
  const scratch = mkdtempSync(join(tmpdir(), 'blink-external-recording-check-')); chmodSync(scratch, 0o700);
  const selected = ['audio-16khz', 'audio-24khz', 'audio-disabled', '30fps-source-15fps-output', 'recovery-metadata', 'low-fps-source', '25fps-source-15fps-output', 'audio-clock-repair', 'missing-audio-recovery', 'corrupt-audio-recovery', 'damaged-audio-disabled'];
  const execute = (args, input) => execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...args], { input, env: {}, timeout: 30000, maxBuffer: 32 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  const contentSync = path => {
    const clock = execute(['-copyts', '-i', path, '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'rawvideo', '-threads:v', '1',
      '-fps_mode:v', 'passthrough', '-enc_time_base:v', '1/1000000', '-c:a', 'pcm_f32le', '-ar', '48000', '-ac', '1', '-f', 'framecrc', 'pipe:1']).toString('ascii');
    const bases = [], first = [];
    for (const line of clock.split('\n')) {
      const tb = /^#tb ([01]): (\d+)\/(\d+)$/.exec(line);
      if (tb) bases[Number(tb[1])] = [Number(tb[2]), Number(tb[3])];
      const row = /^([01]),\s*-?\d+,\s*(-?\d+),/.exec(line);
      if (row && first[Number(row[1])] === undefined) { const index = Number(row[1]); assert(bases[index]); first[index] = Number(row[2]) * bases[index][0] / bases[index][1]; }
    }
    assert(first.length === 2 && first.every(Number.isFinite));
    const pcm = execute(['-i', path, '-map', '0:a:0', '-c:a', 'pcm_f32le', '-ar', '48000', '-ac', '1', '-f', 'f32le', 'pipe:1']);
    let sample = 0; for (; sample * 4 + 4 <= pcm.length; sample++) if (Math.abs(pcm.readFloatLE(sample * 4)) >= 0.005) break;
    assert(sample * 4 < pcm.length, 'Actual audio content must be present');
    return { video: first[0], audio: first[1], onset: first[1] + sample / 48000 };
  };
  try {
    const trials = [...selected.map(name => ({ name })), { name: 'low-fps-source', fps: 7, fragment: 4000 },
      { name: '25fps-source-15fps-output', fragment: 4000 }, { name: 'recovery-metadata', hd: true, fragment: 4000 },
      { name: 'recovery-metadata', audioFirst: true }, { name: 'audio-disabled', sar: 2 },
      { name: 'audio-disabled', label: '90s-24fps-source-15fps-output', fps: 24, count: 2160, tiny: true, outputFps: 15, expectedFrames: 1350 },
      { name: 'audio-disabled', label: '90s-24fps-source-24fps-output', fps: 24, count: 2160, tiny: true, outputFps: 24, expectedFrames: 2160 },
      { name: 'recovery-metadata', count: 1026, metadataEvery: 2, tiny: true },
      { name: 'recovery-metadata', count: 1028, metadataEvery: 2, tiny: true, rejectMetadata: true }];
    for (const trial of trials) {
      const { name } = trial;
      const long = name === '30fps-source-15fps-output', low = name === 'low-fps-source', odd = name === '25fps-source-15fps-output';
      const metadata = low || odd || name === 'recovery-metadata', missing = name === 'missing-audio-recovery';
      const corrupt = name === 'corrupt-audio-recovery' || name === 'damaged-audio-disabled';
      const width = long || trial.tiny ? 16 : 320, height = long || trial.tiny ? 16 : 180, fps = trial.fps ?? (long ? 30 : low ? 5 : odd ? 25 : 15);
      const outputWidth = trial.hd ? 1920 : width, outputHeight = trial.hd ? 1080 : height, fragmentMs = trial.fragment ?? 1000;
      const count = trial.count ?? (long ? 1800 : low ? fps * 9 : odd ? 225 : metadata || corrupt || missing || name === 'audio-clock-repair' ? 90 : 33);
      const label = trial.label ?? (trial.audioFirst ? `${name}-audio-first` : trial.sar ? `${name}-sar-${trial.sar}` : trial.tiny ? `${name}-dense-${count}` : trial.fps || trial.fragment || trial.hd ? `${name}-${fps}-${fragmentMs}-${outputWidth}` : name);
      const source = join(scratch, label + '-generated.mp4'), path = join(scratch, label + '.mp4');
      execute(['-y', '-f', 'lavfi', '-i', `${trial.sar ? 'color=c=white:' : 'testsrc2='}size=${width}x${height}:rate=${metadata ? fps * 1000 + '/1001' : fps}`,
        ...(!missing ? ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000'] : []), '-frames:v', String(count),
        ...(trial.audioFirst ? ['-map', '1:a:0', '-map', '0:v:0'] : []), ...(trial.sar ? ['-vf', `setsar=${trial.sar}`] : []),
        '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-bf', '0', '-g', String(fps * 4), '-pix_fmt', 'yuv420p',
        ...(!missing ? ['-c:a', 'aac', '-ar', '16000', '-ac', '1', '-b:a', '24k', '-shortest'] : []), '-f', 'mp4', source]);
      let bytes = readFileSync(source);
      if (trial.audioFirst) {
        const movie = boxes(bytes).find(box => box.type === 'moov'); assert(movie);
        const handlers = boxes(bytes, movie.payload, movie.end).filter(box => box.type === 'trak').map(track => {
          const handler = child(bytes, child(bytes, track, 'mdia'), 'hdlr'); return bytes.toString('ascii', handler.payload + 8, handler.payload + 12);
        });
        assert.deepEqual(handlers, ['soun', 'vide'], 'Audio-first fixture must select input video stream 1');
      }
      if (metadata || corrupt || name === 'audio-clock-repair') bytes = mutateRecordingFixture(bytes, { metadataEvery: metadata ? trial.metadataEvery ?? fps * 4 : 0, corruptAudio: corrupt, audioGap: name === 'audio-clock-repair' });
      assert(bytes.indexOf(Buffer.from('moov')) > bytes.indexOf(Buffer.from('mdat'))); writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' });
      const active = !['audio-disabled', 'damaged-audio-disabled', '30fps-source-15fps-output'].includes(name), rate = name === 'audio-24khz' || odd || name === 'corrupt-audio-recovery' ? 24000 : 16000;
      const configuration = { prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: fragmentMs },
        videoCodec: { type: 0, resolution: [outputWidth, outputHeight, trial.outputFps ?? (low || name === 'recovery-metadata' ? 30 : 15)], parameters: { profile: 0, level: trial.hd ? 2 : 0, bitRate: trial.hd ? 2000 : 300, iFrameInterval: fragmentMs } },
        audioCodec: { type: 0, samplerate: rate === 16000 ? 1 : 2, audioChannels: 1, bitrateMode: 0, bitrate: 32 } };
      const memory = new NativeRecordingMemoryBudget();
      const prepare = () => prepareNativeRecording({ filePath: path, expectedBytes: bytes.length, expectedSha256: hash(bytes) }, configuration, active,
        new globalThis.AbortController().signal, { ffmpegPath, memory, admit: work => work() });
      if (trial.rejectMetadata) {
        await assert.rejects(prepare, error => error.diagnostic?.phase === 'input' && error.diagnostic?.workerCode === 'VIDEO_DISCONTINUITY',
          '513 metadata insertions must exceed the unchanged inspection limit');
        assert.equal(memory.bytes, 0); assert.equal(hash(readFileSync(path)), hash(bytes));
        assert.equal(readdirSync(scratch).some(name => name.startsWith('.native-')), false, 'Rejected media must release its snapshot');
        bytes.fill(0); continue;
      }
      const prepared = await prepare().catch(error => { throw new Error(`Finite qualification failed: ${name}`, { cause: error }); });
      try {
        const output = Buffer.concat([prepared.initialization, ...prepared.fragments.map(fragment => fragment.data)]);
        assert.equal(hash(output), prepared.preparedSha256); assert.equal(hash(readFileSync(path)), hash(bytes));
        const expectedFrames = trial.expectedFrames ?? (long ? 900 : odd ? 135 : count);
        // The intentional one-frame HD decoder exits before consuming a whole
        // stdin pipe. An owned file avoids mistaking that normal early exit for EPIPE.
        const decodedPath = trial.hd ? join(scratch, `${label}-qualified.mp4`) : undefined;
        if (decodedPath) writeFileSync(decodedPath, output, { mode: 0o600 });
        const pixelOptions = ['-xerror', '-i', decodedPath ?? 'pipe:0', '-map', '0:v:0', '-threads', '1', '-fps_mode:v', 'passthrough', '-enc_time_base:v', '1/1000000'];
        const pixels = execute([...pixelOptions, ...(trial.hd ? ['-frames:v', '1'] : []), '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1'], decodedPath ? undefined : output);
        assert.equal(pixels.length, outputWidth * outputHeight * (trial.hd ? 1 : expectedFrames), `${name}: independent decoded pixel count`);
        assert(pixels.some(byte => byte > 32));
        if (trial.sar) {
          const frames = execute([...pixelOptions, '-frames:v', '1', '-c:v', 'rawvideo', '-f', 'framecrc', 'pipe:1'], output).toString('ascii');
          assert(frames.includes('#sar 0: 1/1'));
          const dark = row => pixels.subarray(row * outputWidth, (row + 1) * outputWidth).every(value => value < 32);
          let top = 0, bottom = 0;
          while (top < outputHeight && dark(top)) top++; while (bottom < outputHeight && dark(outputHeight - 1 - bottom)) bottom++;
          assert.equal(top + bottom, outputHeight / 2, 'SAR=2 must preserve the exact half-height content area');
          // YUV420 padding aligns to chroma rows: an ideal odd offset can move
          // by one luma pixel without changing the required display shape.
          assert(Math.abs(top - bottom) <= 2, 'Content must remain centered within one luma pixel');
        }
        if (trial.hd) {
          const frames = execute([...pixelOptions, '-c:v', 'rawvideo', '-f', 'framecrc', 'pipe:1']).toString('ascii');
          assert.equal(frames.split('\n').filter(line => /^0,/.test(line)).length, expectedFrames, 'HD decode must preserve every picture');
          assert(frames.includes(`#dimensions 0: ${outputWidth}x${outputHeight}`));
        }
        assert(prepared.durationMs > (metadata ? count * 1001 / fps : count * 1000 / fps) - 100 && prepared.durationMs <= (metadata ? count * 1001 / fps : count * 1000 / fps) + 100);
        if (trial.outputFps) assert(Math.abs(prepared.durationMs - count * 1000 / fps) <= 0.01,
          'Frame selection must preserve the source end at the 90-second admission boundary');
        assert(prepared.fragments.every(fragment => fragment.durationMs > 0 && fragment.durationMs <= fragmentMs + 0.1));
        for (let i = 1; i < prepared.fragments.length; i++) assert(Math.abs(prepared.fragments[i - 1].startMs + prepared.fragments[i - 1].durationMs - prepared.fragments[i].startMs) < 0.1);
        if (active) {
          const pcm = execute(['-xerror', '-i', 'pipe:0', '-map', '0:a:0', '-ar', String(rate), '-ac', '1', '-f', 'f32le', 'pipe:1'], output);
          let peak = 0; for (let i = 0; i + 4 <= pcm.length; i += 4) peak = Math.max(peak, Math.abs(pcm.readFloatLE(i)));
          assert(Math.abs(pcm.length / 4 / rate * 1000 - prepared.durationMs) < 180, `${name}: independent audio duration`);
          if (missing || name === 'corrupt-audio-recovery') { assert(peak < 1e-7); assert.equal(prepared.recovery?.attempts, 2); }
          else assert(peak > 0.001, `${name}: actual audio energy`);
        } else {
          const moov = boxes(prepared.initialization).find(b => b.type === 'moov'); assert(moov);
          const audio = boxes(prepared.initialization, moov.payload, moov.end).filter(b => b.type === 'trak').some(trak => {
            const mdia = child(prepared.initialization, trak, 'mdia'), hdlr = child(prepared.initialization, mdia, 'hdlr'); return prepared.initialization.toString('ascii', hdlr.payload + 8, hdlr.payload + 12) === 'soun'; });
          assert.equal(audio, false, `${name}: permission-off must omit audio track`);
        }
        output.fill(0);
      } finally { prepared.dispose(); assert.equal(memory.bytes, 0); bytes.fill(0); }
    }
    for (const defect of ['overlap', 'malformed-sei', 'corrupt-picture']) {
      const base = readFileSync(join(scratch, 'recovery-metadata-generated.mp4'));
      const bytes = mutateRecordingFixture(base, { metadataEvery: defect === 'corrupt-picture' ? 0 : 60,
        overlapMetadata: defect === 'overlap', corruptVideo: defect === 'corrupt-picture' });
      if (defect === 'malformed-sei') {
        const at = bytes.indexOf(Buffer.from([0, 0, 0, 5, 6, 6, 1, 0xc0, 0x80])); assert(at >= 0); bytes[at + 6] = 31;
      }
      const source = join(scratch, `${defect}.mp4`); writeFileSync(source, bytes, { mode: 0o600 });
      const memory = new NativeRecordingMemoryBudget();
      const configuration = { prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: 1000 },
        videoCodec: { type: 0, resolution: [320, 180, 15], parameters: { profile: 0, level: 0, bitRate: 300, iFrameInterval: 1000 } },
        audioCodec: { type: 0, samplerate: 1, audioChannels: 1, bitrateMode: 0, bitrate: 32 } };
      await assert.rejects(() => prepareNativeRecording({ filePath: source, expectedBytes: bytes.length, expectedSha256: hash(bytes) }, configuration, true,
        new globalThis.AbortController().signal, { ffmpegPath, memory, admit: work => work() }), `${defect} must not offer a recording`);
      assert.equal(memory.bytes, 0); assert.equal(hash(readFileSync(source)), hash(bytes));
      assert.equal(readdirSync(scratch).some(name => name.startsWith('.native-')), false, 'Rejected media must not retain a working snapshot'); bytes.fill(0);
    }
    // These content tests run inside canonical installed qualification,
    // independently of source Jest jobs that do not build a native helper.
    for (const offset of [0, 64000, 200000]) for (const rate of [16000, 24000]) {
      const source = join(scratch, `content-${offset}-${rate}.mp4`), outputPath = join(scratch, `content-${offset}-${rate}-prepared.mp4`);
      execute(['-f', 'lavfi', '-i', 'testsrc2=size=16x16:rate=15:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000:duration=2.1',
        '-vf', `settb=1/1000000,setpts=PTS+${offset}`, '-fps_mode:v', 'passthrough', '-enc_time_base:v', '1/1000000',
        '-c:v', 'libx264', '-threads:v', '1', '-preset', 'ultrafast', '-bf', '0', '-c:a', 'aac', '-ar', '16000', '-ac', '1', '-f', 'mp4', source]);
      chmodSync(source, 0o600); const bytes = readFileSync(source), memory = new NativeRecordingMemoryBudget();
      const configuration = { prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: 1000 },
        videoCodec: { type: 0, resolution: [16, 16, 15], parameters: { profile: 0, level: 0, bitRate: 300, iFrameInterval: 1000 } },
        audioCodec: { type: 0, samplerate: rate === 16000 ? 1 : 2, audioChannels: 1, bitrateMode: 0, bitrate: 32 } };
      const prepared = await prepareNativeRecording({ filePath: source, expectedBytes: bytes.length, expectedSha256: hash(bytes) }, configuration, true,
        new globalThis.AbortController().signal, { ffmpegPath, memory, admit: work => work() });
      try {
        assert.equal(prepared.recovery, undefined, 'Content sync must pass without silence recovery');
        writeFileSync(outputPath, Buffer.concat([prepared.initialization, ...prepared.fragments.map(fragment => fragment.data)]), { mode: 0o600 });
        const before = contentSync(source), after = contentSync(outputPath);
        assert(Math.abs(before.video * 1000000 - offset) < 12, 'The fixture must contain the requested real video delay');
        assert(Math.abs((after.onset - after.video) - (before.onset - before.video)) < 0.003,
          `${offset}us/${rate}Hz: actual audio-content alignment changed`);
        assert.equal(hash(readFileSync(source)), hash(bytes));
      } finally { prepared.dispose(); assert.equal(memory.bytes, 0); bytes.fill(0); }
    }
    return selected;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
