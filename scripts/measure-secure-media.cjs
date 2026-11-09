#!/usr/bin/env node
'use strict';

/** Local synthetic performance evidence. Never contacts a provider or loads credentials.
 * Run with --expose-gc for post-STOP heap evidence. Reports gaps instead of waiving gates.
 * --pairs 0 skips timing comparisons; --warmup controls discarded lifecycle cycles.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const dgram = require('node:dgram');
const { spawn, execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { queryObjects } = require('node:v8');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
const BASELINE = '9f4731abf3e50be9070f4daf2f5fd992e5152087';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
function flags(argv) {
  const result = { pairs: 3, cycles: 100, seconds: 4, warmup: 20, ffmpeg: '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg',
    worker: path.join(ROOT, 'native/build/blink-codec-worker'), python: path.join(ROOT, '.venv/bin/python'), output: '', presets: 'veryfast,ultrafast' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in result) || argv[i + 1] === undefined) throw new Error('Unknown or incomplete option');
    result[key] = ['pairs', 'cycles', 'seconds', 'warmup'].includes(key) ? Number(argv[i + 1]) : argv[i + 1];
  }
  for (const key of ['pairs', 'cycles', 'seconds', 'warmup']) if (!Number.isInteger(result[key]) || result[key] < (key === 'pairs' || key === 'warmup' ? 0 : 1) || result[key] > 300) throw new Error('Invalid benchmark count');
  if (result.presets.split(',').some(value => !['veryfast', 'ultrafast'].includes(value))) throw new Error('Invalid preset');
  if (!result.output) throw new Error('--output is required');
  return result;
}
function historicalArguments() {
  const source = execFileSync('git', ['show', `${BASELINE}:src/accessories/camera-source.ts`], { cwd: ROOT, encoding: 'utf8' });
  const tree = ts.createSourceFile('historical.ts', source, ts.ScriptTarget.Latest, true);
  const methods = ['buildVideoEncoderArgs', 'buildFfmpegArgs', 'buildAudioEncoderArgs', 'getAudioSampleRate', 'getAudioBitrate', 'getVideoBitrate', 'getH264ProfileName', 'getH264LevelName', 'getSrtpSuiteName'];
  const helpers = ['formatRtpSsrc', 'formatAddress', 'buildRtpUrl', 'toSrtpParams', 'SOFTWARE_VIDEO_ENCODER'];
  const selected = [];
  let members = [];
  for (const statement of tree.statements) {
    if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(d => helpers.includes(d.name.getText(tree)))) selected.push(statement.getText(tree));
    if (ts.isClassDeclaration(statement) && statement.name?.text === 'BlinkCameraSource') members = statement.members.filter(m => methods.includes(m.name?.getText(tree))).map(m => m.getText(tree));
  }
  if (members.length !== methods.length || selected.length !== helpers.length) throw new Error('Historical argument owner changed');
  const quality = execFileSync('git', ['show', `${BASELINE}:src/accessories/stream-quality.ts`], { cwd: ROOT, encoding: 'utf8' });
  const qualityModule = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(quality, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(qualityModule, qualityModule.exports);
  const text = `${selected.join('\n')}\nclass Historical { ${members.join('\n')} }\nmodule.exports=Historical;`;
  const module = { exports: {} };
  new Function('module', 'Buffer', 'URLSearchParams', 'effectiveOutputFps', ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(module, Buffer, URLSearchParams, qualityModule.exports.effectiveOutputFps);
  return { Constructor: module.exports, sourceSha256: hash(source), qualitySha256: hash(quality) };
}
function loadCurrent() {
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
  return { ...require(path.join(ROOT, 'src/accessories/media-session.ts')), ...require(path.join(ROOT, 'src/accessories/media-worker.ts')) };
}
// One identical reaper for both media binaries. Resource data comes from wait4,
// not ps sampling. Signals forward to the owned media child; closure awaits wait4.
const REAPER = `import os,sys,signal,json\nreport=sys.argv[1]\npid=os.fork()\nif pid==0:\n os.execve(sys.argv[2],sys.argv[2:],{})\ndef forward(signum,frame):\n try: os.kill(pid,signum)\n except ProcessLookupError: pass\nsignal.signal(signal.SIGTERM,forward)\nsignal.signal(signal.SIGINT,forward)\n_,status,usage=os.wait4(pid,0)\nwith open(report,'w') as f: json.dump({'userSeconds':usage.ru_utime,'systemSeconds':usage.ru_stime,'maxRssRaw':usage.ru_maxrss,'exitCode':os.waitstatus_to_exitcode(status)},f)\nsys.exit(os.waitstatus_to_exitcode(status) if os.WIFEXITED(status) else 0)\n`;
async function receiver() {
  const socket = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => { socket.once('error', error => { try { socket.close(); } catch {} reject(error); }); socket.bind(0, '127.0.0.1', resolve); });
  return socket;
}
async function main(config) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'blink-media-measure-'));
  const reaper = path.join(temporary, 'reaper.py'); fs.writeFileSync(reaper, REAPER, { mode: 0o600 });
  const old = historicalArguments(); const current = loadCurrent();
  const fingerprint = file => ({ sha256: hash(fs.readFileSync(file)), bytes: fs.statSync(file).size });
  const report = { schemaVersion: 2, date: new Date().toISOString(), baselineCommit: BASELINE,
    environment: { platform: process.platform, arch: process.arch, node: process.version, cpus: os.cpus().length,
      cpu: os.cpus()[0].model, totalMemoryBytes: os.totalmem(), parentGcEnabled: !!global.gc,
      pythonVersion: execFileSync(config.python, ['--version'], { encoding: 'utf8' }).trim() },
    configuration: { pairs: config.pairs, cycles: config.cycles, lifecycleWarmup: config.warmup, seconds: config.seconds, width: 1280, height: 720,
      fps: 15, bitrate: 500000, profile: 'baseline', level: '3.1', audio: 'opus/16000/mono/32000/20ms', presets: config.presets },
    fingerprints: { historicalCameraSource: old.sourceSha256, historicalQuality: old.qualitySha256,
      worker: fingerprint(config.worker), ffmpeg: fingerprint(config.ffmpeg),
      ffmpegVersion: execFileSync(config.ffmpeg, ['-version'], { encoding: 'utf8' }).split('\n').filter(line => /^(ffmpeg version|libav|libsw)/.test(line)),
      currentSources: Object.fromEntries(['src/accessories/media-session.ts', 'src/accessories/media-worker.ts', 'native/worker.c', 'native/audio.inc'].map(file => [file, fingerprint(path.join(ROOT, file)).sha256])) },
    limits: [
      'Synthetic Mac evidence only; no Pi, provider, physical Home playback, five-target or socket-policy acceptance.',
      'Historical production arguments retain default automatic codec threads and GOP; worker single thread/GOP=fps are part of measured change.',
      'System FFmpeg and static worker share libav version but dependency builds may differ; exact library parity is not claimed.',
      'Native injected datagram sink maps admitted dummy RFC1918 output to localhost UDP; default openMediaSocket is excluded.',
      'Queue measurement counts encoded admission plus in-flight callbacks until RTP marker/audio send; private native/demux/client queues are unobservable.',
      'Nearest-rank p95 from a small sample is coarse; no statistical tail certification. Recording is disabled and recording/platform codec ceilings remain separate gates.',
      'Readiness events differ: legacy wrapper spawn versus native CONFIG-ready. These descriptive values are not a matched start metric and never enter the latency gate.',
      'Parent CPU includes benchmark scheduler/UDP observers but excludes explicit lifecycle GC. Child CPU excludes the identical Python wait4 reaper overhead.',
      'Lifecycle rows stream to disk and are loaded only after final memory sample. Quiescent post-STOP sampling follows run-return, UDP closure, one event-loop turn and explicit GC.',
    ], runs: [], cycles: [], summary: {} };
  let serial = 0, sessionConstructor;
  const { ProtectedRtpStream } = require(path.join(ROOT, 'src/accessories/media-output.ts'));
  const countOwnedObjects = () => Object.fromEntries([
    ['Session', sessionConstructor], ['PrivateMediaWorker', current.PrivateMediaWorker], ['ProtectedRtpStream', ProtectedRtpStream],
  ].map(([name, constructor]) => [name, constructor && typeof queryObjects === 'function' ? queryObjects(constructor, { format: 'count' }) : null]));
  function launch(binary, args, options = {}) {
    const resourceFile = path.join(temporary, `usage-${++serial}.json`);
    const child = spawn(config.python, [reaper, resourceFile, binary, ...args], { ...options, env: {}, stdio: ['pipe', 'pipe', 'pipe'] });
    child.resourceFile = resourceFile;
    return child;
  }
  const key = Buffer.alloc(16, 7), salt = Buffer.alloc(14, 9);
  const capability = (stream, port) => ({ address: '192.168.22.1', addressVersion: 'ipv4', suite: 'AES_CM_128_HMAC_SHA1_80', port, payloadType: stream === 1 ? 99 : 110,
    ssrc: stream === 1 ? 101 : 102, key, salt, mtu: 1378, fps: 15, rtcpInterval: 0.5 });
  // Input TS is identical for both paths, constant muxrate makes byte arrival
  // deterministic. Serial backpressure is recorded, never bypassed.
  const input = execFileSync(config.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=15',
    '-f', 'lavfi', '-i', 'sine=frequency=997:sample_rate=16000', '-t', String(config.seconds), '-c:v', 'libx264', '-preset', 'ultrafast',
    '-tune', 'zerolatency', '-threads:v', '1', '-b:v', '500k', '-maxrate', '500k', '-bufsize', '500k', '-g', '15', '-c:a', 'aac',
    '-b:a', '32k', '-ac', '1', '-muxrate', '1200000', '-mpegts_flags', 'latm', '-f', 'mpegts', 'pipe:1'], { maxBuffer: 64 * 1024 * 1024 });
  report.input = { bytes: input.length, sha256: hash(input), pacing: '1316 bytes every 8.773333ms (1.2 Mbps), anchored to first input; serial backpressure', durationMs: input.length * 8000 / 1200000 };
  const smallInput = execFileSync(path.join(ROOT, 'native/build/fixture'), ['audio-latm'], { env: {}, maxBuffer: 1024 * 1024 });
  async function run(kind, preset, media, paced, cycle) {
    if (!cycle) process.stderr.write(`Starting ${kind} ${preset}\n`);
    const start = performance.now(), usage = process.cpuUsage();
    const sockets = await Promise.all([receiver(), receiver()]);
    const received = [0, 0], queued = [[], []];
    const counters = { bytes: 0, packets: 0, maxBytes: 0, maxPackets: 0 };
    let firstVideo, firstAudio, child, session, readyMs, inputStart, skewMax = 0, inputOffset = 0;
    const nativeCodes = [];
    for (const [index, socket] of sockets.entries()) socket.on('message', bytes => {
      if (bytes[1] >= 192 && bytes[1] <= 223) return;
      received[index]++;
      if (index === 0 && (bytes[1] & 128) && firstVideo === undefined) firstVideo = performance.now();
      if (index === 1 && firstAudio === undefined) firstAudio = performance.now();
    });
    const ports = sockets.map(socket => socket.address().port);
    const sink = dgram.createSocket('udp4');
    const output = (stream) => capability(stream, ports[stream - 1]);
    let worker;
    try {
      if (kind === 'native') {
        session = await current.createOwnedMediaSession({ workerPath: config.worker,
          video: { output: output(1), localPort: 5001, width: 1280, height: 720, bitrate: 500000, maxFrames: 9000, profile: 0, level: 0, softwarePreset: preset },
          audio: { output: output(2), localPort: 5002, codec: 'opus', rate: 16000, bitrate: 32000, packetTime: 20 } }, new AbortController().signal, {
          createWorker: (binary, callbacks) => {
            const packet = callbacks.packet;
            worker = new current.PrivateMediaWorker(binary, { ...callbacks, packet: async (value, signal) => {
              const size = value.data.length + 48; queued[value.stream - 1].push(size); counters.bytes += size; counters.packets++;
              counters.maxBytes = Math.max(counters.maxBytes, counters.bytes); counters.maxPackets = Math.max(counters.maxPackets, counters.packets);
              return packet(value, signal);
            } }, (binary, args, options) => { child = launch(binary, args, options); child.stderr.on('data', bytes => {
              for (const code of bytes.toString().match(/BLINK_[A-Z_]+|WORKER_[A-Z_]+/g) ?? []) nativeCodes.push(code);
            }); return child; });
            return worker;
          },
          openSocket: async options => {
            let close; const whenClosed = new Promise(resolve => { close = resolve; });
            return { whenClosed, close, send: bytes => new Promise((resolve, reject) => {
              const stream = options.ssrc === 101 ? 0 : 1;
              sink.send(bytes, ports[stream], '127.0.0.1', error => {
                if (error) return reject(error);
                if (!(bytes[1] >= 192 && bytes[1] <= 223) && (stream === 1 || bytes[1] & 128)) {
                  const size = queued[stream].shift(); if (size !== undefined) { counters.bytes -= size; counters.packets--; }
                }
                resolve();
              });
            }) };
          },
        });
        sessionConstructor ??= Object.getPrototypeOf(session).constructor;
        readyMs = performance.now() - start;
      } else {
        const owner = new old.Constructor(); owner.streamingConfig = { rtpSsrcMode: 'unsigned', rtspTransport: 'tcp', video: { softwarePreset: preset, outputQuality: '720p15' }, audio: { enabled: true, bitrate: 32 } };
        owner.hap = { H264Profile: { MAIN: 1, HIGH: 2 }, H264Level: { LEVEL3_2: 1, LEVEL4_0: 2 }, SRTPCryptoSuites: { AES_CM_128_HMAC_SHA1_80: 0, AES_CM_256_HMAC_SHA1_80: 1 }, AudioStreamingCodecType: { OPUS: 3, PCMA: 5, PCMU: 6, AAC_ELD: 2 }, AudioStreamingSamplerate: { KHZ_8: 0, KHZ_16: 1, KHZ_24: 2 } };
        const args = owner.buildFfmpegArgs('pipe:0', { video: { width: 1280, height: 720, fps: 15, max_bit_rate: 500, profile: 0, level: 0, pt: 99, mtu: 1378 }, audio: { codec: 'OPUS', sample_rate: 1, channel: 1, max_bit_rate: 32, packet_time: 20, pt: 110 } },
          { address: '127.0.0.1', videoPort: ports[0], audioPort: ports[1], videoSSRC: 101, audioSSRC: 102, videoCryptoSuite: 0, audioCryptoSuite: 0, videoSRTP: Buffer.concat([key, salt]), audioSRTP: Buffer.concat([key, salt]) }, 'libx264');
        child = launch(config.ffmpeg, args);
        child.stdin.on('error', () => {}); child.stderr.resume(); child.stdout.resume();
        await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); readyMs = performance.now() - start;
      }
      inputStart = performance.now();
      for (let offset = 0; offset < media.length; offset += 1316) {
        inputOffset = offset;
        const target = inputStart + (paced ? offset * 8000 / 1200000 : 0);
        if (paced) await sleep(target - performance.now());
        skewMax = Math.max(skewMax, performance.now() - target);
        const bytes = media.subarray(offset, offset + 1316);
        if (session) await session.write(bytes);
        else await new Promise((resolve, reject) => child.stdin.write(bytes, error => error ? reject(error) : resolve()));
      }
      // Deliberate STOP after actual media, while demuxer still awaits input.
      // An EOF/end() cycle would measure prior graceful closure instead of STOP.
      const deadline = performance.now() + 4000;
      while ((firstVideo === undefined || firstAudio === undefined) && performance.now() < deadline) await sleep(10);
      const stopAt = performance.now();
      if (session) await session.stop();
      else { const closed = new Promise(resolve => child.once('close', resolve)); child.stdin.end(); child.kill('SIGTERM'); await closed; }
      const stopped = performance.now();
      await sleep(10);
      if (firstVideo === undefined || firstAudio === undefined || (session && session.failed)) {
        report.failure = { kind, preset, videoSeen: firstVideo !== undefined, audioSeen: firstAudio !== undefined, receivedPackets: received, sessionFailed: session?.failed };
        throw new Error('Synthetic media did not complete successfully');
      }
      const resource = JSON.parse(fs.readFileSync(child.resourceFile, 'utf8')); fs.unlinkSync(child.resourceFile);
      await Promise.all([...sockets, sink].map(socket => new Promise(resolve => {
        try { socket.close(resolve); } catch { resolve(); }
      })));
      const parent = process.cpuUsage(usage);
      const parentCpuMs = (parent.user + parent.system) / 1000, childCpuMs = (resource.userSeconds + resource.systemSeconds) * 1000;
      return { kind, preset, ...(kind === 'native' ? { nativeConfigReadyMs: readyMs } : { legacyWrapperSpawnMs: readyMs }),
        firstVideoFromStartMs: firstVideo - start, firstVideoFromInputMs: firstVideo - inputStart,
        firstAudioFromStartMs: firstAudio - start, firstAudioFromInputMs: firstAudio - inputStart,
        stopMs: stopped - stopAt, elapsedMs: stopped - start,
        inputPacingMaxLatenessMs: paced ? skewMax : null, receivedPackets: received,
        parentCpuMs, childCpuMs, totalCpuMs: parentCpuMs + childCpuMs,
        childMaxRssBytes: resource.maxRssRaw * (process.platform === 'darwin' ? 1 : 1024), childExitCode: resource.exitCode,
        encodedAdmissionAndInflightPeakBytes: counters.maxBytes, encodedAdmissionAndInflightPeakPackets: counters.maxPackets,
        workerClosed: kind === 'native', parentActiveResourceTypes: process.getActiveResourcesInfo() };
    } catch (error) {
      report.failure ??= { kind, preset, inputOffset, nativeCodes, videoSeen: firstVideo !== undefined, audioSeen: firstAudio !== undefined, sessionFailed: session?.failed };
      throw error;
    } finally {
      if (session) await session.stop();
      else if (child && child.exitCode === null) child.kill('SIGTERM');
      for (const socket of [...sockets, sink]) { try { socket.close(); } catch {} }
    }
  }
  try {
    for (const preset of config.pairs ? config.presets.split(',') : []) {
      for (const kind of ['legacy', 'native']) await run(kind, preset, input, true, false);
      for (let pair = 0; pair < config.pairs; pair++) {
        for (const kind of pair % 2 ? ['native', 'legacy'] : ['legacy', 'native']) report.runs.push({ pair, ...await run(kind, preset, input, true, false) });
        process.stderr.write(`Measured ${preset} pair ${pair + 1}/${config.pairs}\n`);
      }
    }
    const cycleFile = path.join(temporary, 'cycles.jsonl');
    fs.writeFileSync(cycleFile, '', { mode: 0o600 });
    for (let i = 0; i < config.warmup; i++) {
      await run('native', 'ultrafast', smallInput, false, true);
      await sleep(0);
      if (global.gc) global.gc();
    }
    if (config.warmup) process.stderr.write(`Lifecycle warmup ${config.warmup}/${config.warmup}\n`);
    report.ownedObjectCounts = { protocol: 'v8.queryObjects format=count after full GC; controlled constructors only; no object summaries or heap dump', before: countOwnedObjects() };
    for (let i = 0; i < config.cycles; i++) {
      let row = await run('native', 'ultrafast', smallInput, false, true);
      await sleep(0);
      if (global.gc) global.gc();
      const memory = process.memoryUsage();
      Object.assign(row, { cycle: i + 1, postStopParentRssBytes: memory.rss, postStopHeapUsedBytes: memory.heapUsed,
        postStopExternalBytes: memory.external, parentActiveResourceTypes: process.getActiveResourcesInfo() });
      fs.appendFileSync(cycleFile, `${JSON.stringify(row)}\n`);
      row = undefined;
      if ((i + 1) % 10 === 0 || i + 1 === config.cycles) process.stderr.write(`Lifecycle ${i + 1}/${config.cycles}\n`);
    }
    report.ownedObjectCounts.after = countOwnedObjects();
    // Reading retained rows occurs strictly after the last memory observation.
    report.cycles = fs.readFileSync(cycleFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    for (const preset of config.presets.split(',')) {
      const rows = report.runs.filter(row => row.preset === preset), summary = {};
      if (!rows.length) { report.summary[preset] = { coarseLatencyGate: 'NOT_RUN' }; continue; }
      for (const metric of ['firstVideoFromStartMs', 'firstVideoFromInputMs', 'firstAudioFromStartMs', 'firstAudioFromInputMs', 'stopMs', 'parentCpuMs', 'childCpuMs', 'totalCpuMs', 'childMaxRssBytes']) {
        const legacy = rows.filter(row => row.kind === 'legacy').map(row => row[metric]), native = rows.filter(row => row.kind === 'native').map(row => row[metric]);
        const oldP95 = percentile(legacy, .95), newP95 = percentile(native, .95);
        summary[metric] = { legacy: { p50: percentile(legacy, .5), p95: oldP95 }, native: { p50: percentile(native, .5), p95: newP95 }, p95DeltaPercent: 100 * (newP95 / oldP95 - 1) };
      }
      summary.readinessDescriptiveOnly = { legacyWrapperSpawnMs: rows.filter(row => row.kind === 'legacy').map(row => row.legacyWrapperSpawnMs),
        nativeConfigReadyMs: rows.filter(row => row.kind === 'native').map(row => row.nativeConfigReadyMs) };
      summary.coarseLatencyGate = config.pairs < 3 ? 'INSUFFICIENT_SAMPLES' : ['firstVideoFromStartMs', 'firstAudioFromStartMs', 'stopMs'].every(metric => summary[metric].p95DeltaPercent <= 10) ? 'PASS_SYNTHETIC_COARSE_ONLY' : 'REGRESSION';
      report.summary[preset] = summary;
    }
    const window = Math.min(10, Math.floor(report.cycles.length / 2));
    const mean = rows => rows.reduce((sum, value) => sum + value, 0) / rows.length;
    report.lifecycle = { cycles: report.cycles.length, window, gcEnabled: !!global.gc, trend: {} };
    for (const metric of ['postStopParentRssBytes', 'postStopHeapUsedBytes', 'postStopExternalBytes']) {
      const first = mean(report.cycles.slice(0, window).map(row => row[metric]));
      const last = mean(report.cycles.slice(-window).map(row => row[metric]));
      report.lifecycle.trend[metric] = { firstWindowMean: first, lastWindowMean: last, deltaBytes: last - first };
    }
    report.lifecycle.verdict = 'RAW_TREND_REQUIRES_REVIEW_NO_AUTOMATIC_NO_LEAK_CLAIM';
  } finally {
    fs.writeFileSync(path.resolve(config.output), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
if (require.main === module) main(flags(process.argv.slice(2))).catch(error => { process.stderr.write(`Benchmark failed: ${error.name}${error.code ? ` (${error.code})` : ''}\n${String(error.stack).split('\n').filter(line => /^\s+at /.test(line)).join('\n')}\n`); process.exitCode = 1; });
module.exports = { flags, percentile, historicalArguments };
