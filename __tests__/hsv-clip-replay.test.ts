import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, symlinkSync, chmodSync, openSync, closeSync, readFileSync, ftruncateSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { setImmediate } from 'node:timers';
import { BlinkCameraRecordingDelegate, createRecordingOptions } from '../src/accessories/camera-recording';
import { RecordingBufferBudget, RecordingFragmentBuffer } from '../src/accessories/recording-buffer';
import type { CameraRecordingConfiguration } from 'homebridge';

// The manually launched diagnostic is intentionally outside the plugin build.
// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
const { DiagnosticReplay, admitLocalClip } = require('../scripts/hsv-clip-replay/core.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
const { createPreparer, admitScratchSpace, admitPreview, admitQualificationWorker } = require('../scripts/hsv-clip-replay/prepare.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
const { createEvidenceReporter, configureReplayCamera, createCommandInput, argumentsFor, admitHapManifest } = require('../scripts/hsv-clip-replay/index.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
const hap = require('@homebridge/hap-nodejs');
// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
const os = require('node:os');

const configuration = (): CameraRecordingConfiguration => ({
  prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: 4000 },
  videoCodec: { type: 0, resolution: [640, 360, 15], parameters: { bitRate: 500, profile: 0, level: 0, iFrameInterval: 1000 } },
  audioCodec: { type: 0, samplerate: 1, bitrate: 32, audioChannels: 1, bitrateMode: 0 },
});
const metadata = { label: 'chosen', capturedAt: '2026-11-03T10:00:00Z' };
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function box(name: string) { const bytes = Buffer.alloc(8); bytes.writeUInt32BE(8); bytes.write(name, 4); return bytes; }
function bundle(seconds = 2, audioActive = false) {
  const budget = new RecordingBufferBudget(), buffer = new RecordingFragmentBuffer(budget);
  buffer.initialize(Buffer.concat([box('ftyp'), box('moov')]));
  let pin;
  for (let i = 0; i < seconds; i++) {
    buffer.append({ sequence: i, startUs: BigInt(i) * 1000000n, durationUs: 1000000n,
      keyframe: true, data: Buffer.concat([box('moof'), box('mdat')]) });
    if (buffer.ready && !pin) pin = buffer.pin();
  }
  pin ??= buffer.sealFinite();
  let disposed = false;
  const prepared = { pin, buffer, fragments: pin.fragments, audioActive, configuration: configuration(),
    sourceInfo: { width: 640, height: 360, fpsNumerator: 15, fpsDenominator: 1 },
    summary: { decodedVideoFrames: seconds * 15, selectedVideoFrames: seconds * 15, encodedVideoFrames: seconds * 15,
      generatedAudioSamples: 0, audioRate: audioActive ? 16000 : 0, inputFormat: 'mp4', preparedSpanUpperBoundUs: seconds * 1000000 },
    sourceSha256: 'a'.repeat(64), preparedSha256: 'b'.repeat(64), preparedSpanUpperBoundUs: BigInt(seconds) * 1000000n,
    get disposed() { return disposed; }, dispose() { disposed = true; buffer.clear(); } };
  return { prepared, snapshot: Buffer.from([255, 216, 255, 217]), provenance: { durationSource: 'native-prepared-span-upper-bound' }, budget };
}
function fixture(options: Record<string, unknown> = {}) {
  const motion: boolean[] = [], events: Array<{ event: string; [key: string]: unknown }> = [];
  const replay = new DiagnosticReplay({ RecordingDelegate: BlinkCameraRecordingDelegate,
    prepare: async (_file: string, _config: unknown, audio: boolean) => bundle(2, audio),
    motion: (active: boolean) => motion.push(active),
    report: (event: string, details = {}) => events.push({ event, ...details }), ...options });
  replay.updateRecordingConfiguration(configuration()); replay.updateRecordingActive(true);
  return { replay, motion, events };
}
const temporary: string[] = [];
function directory(label: string) { const root = mkdtempSync(join(tmpdir(), label)); chmodSync(root, 0o700); temporary.push(root); return root; }
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('canonical saved-clip diagnostic controls', () => {
  beforeEach(() => jest.useFakeTimers());
  test('uses the production delegate for a complete short clip and exactly one final offer', async () => {
    const source = bundle(), expected = Buffer.concat([source.prepared.pin.initialization, ...source.prepared.fragments.map(fragment => fragment.data)]);
    const f = fixture({ prepare: async () => source }); await flush();
    expect(f.replay.delegate).toBeInstanceOf(BlinkCameraRecordingDelegate);
    expect(f.events.some(row => row.event === 'live_source_rejected')).toBe(false);
    await f.replay.load('chosen.mp4', metadata); f.replay.trigger();
    expect(() => f.replay.trigger()).toThrow();
    const packets = []; for await (const packet of f.replay.handleRecordingStreamRequest(7)) packets.push(packet);
    expect(Buffer.concat(packets.map(packet => packet.data))).toEqual(expected);
    expect(packets.map(packet => packet.isLast)).toEqual([false, false, true]);
    expect(f.events.filter(row => row.event === 'hds_final_packet_offered')).toHaveLength(1);
    f.replay.acknowledgeStream(7); await flush(); expect(f.motion).toEqual([true]);
    await jest.advanceTimersByTimeAsync(2000);
    expect(f.motion).toEqual([true, false]); expect(source.budget.bytes).toBe(0);
    expect(f.events.find(row => row.event === 'delivery_result')).toMatchObject({ status: 'delivered', homeRetention: 'unconfirmed' });
    expect(f.replay.status.ready).toBe(false); await f.replay.stop();
  });
  test.each(['close', 'no-ack'])('retains canonical motion hold after ordinary %s without retrying a possibly retained clip', async ending => {
    const source = bundle(20), f = fixture({ prepare: async () => source });
    await f.replay.load('chosen.mp4', metadata); f.replay.trigger();
    for await (const _packet of f.replay.handleRecordingStreamRequest(9)) { /* All finite packets offered. */ }
    const elapsed = ending === 'close' ? 1000 : 8000;
    await jest.advanceTimersByTimeAsync(elapsed); if (ending === 'close') f.replay.closeRecordingStream(9, 3);
    expect(source.budget.bytes).toBe(0); expect(f.motion).toEqual([true]); expect(f.replay.status.busy).toBe(true);
    f.replay.acknowledgeStream(9); await jest.advanceTimersByTimeAsync(20000 - elapsed);
    expect(f.motion).toEqual([true, false]);
    expect(f.events.find(row => row.event === 'delivery_result')).toMatchObject({ status: 'uncertain', homeRetention: 'unconfirmed' });
    expect(() => f.replay.trigger()).toThrow(); await f.replay.stop();
  });
  test.each(['recording', 'camera', 'audio', 'stop'])('immediately retires an admitted replay on %s revocation', async permission => {
    const source = bundle(20, true), f = fixture({ prepare: async () => source }); f.replay.setAudioActive(true);
    await f.replay.load('chosen.mp4', metadata); f.replay.trigger();
    const stream = f.replay.handleRecordingStreamRequest(1), first = (await stream.next()).value.data as Buffer;
    if (permission === 'recording') f.replay.updateRecordingActive(false);
    if (permission === 'camera') f.replay.setCameraActive(false);
    if (permission === 'audio') f.replay.setAudioActive(false);
    if (permission === 'stop') await f.replay.stop();
    await flush(); expect(f.motion).toEqual([true, false]); expect(source.budget.bytes).toBe(0);
    expect(first.every(value => value === 0)).toBe(true); await expect(stream.next()).rejects.toThrow();
    expect(f.events.some(row => row.event === 'hds_final_packet_offered')).toBe(false); await f.replay.stop();
  });
  test('discards unoffered media after a selected configuration changes but leaves equivalent negotiation intact', async () => {
    const source = bundle(), f = fixture({ prepare: async () => source });
    await f.replay.load('chosen.mp4', metadata); f.replay.updateRecordingConfiguration(configuration());
    expect(f.replay.status.ready).toBe(true);
    const next = configuration(); next.videoCodec.parameters.bitRate = 700; f.replay.updateRecordingConfiguration(next);
    expect(f.replay.status.ready).toBe(false); expect(source.budget.bytes).toBe(0); expect(() => f.replay.trigger()).toThrow();
    expect(f.motion).toEqual([]); await f.replay.stop();
  });
  test('keeps a started event under its original selected configuration', async () => {
    const f = fixture(); await f.replay.load('chosen.mp4', metadata); f.replay.trigger();
    const stream = f.replay.handleRecordingStreamRequest(3); await stream.next();
    const next = configuration(); next.videoCodec.parameters.bitRate = 700; f.replay.updateRecordingConfiguration(next);
    expect((await stream.next()).value.isLast).toBe(false); expect((await stream.next()).value.isLast).toBe(true);
    f.replay.acknowledgeStream(3); await jest.advanceTimersByTimeAsync(2000);
    expect(f.events.find(row => row.event === 'delivery_result')).toMatchObject({ status: 'delivered' }); await f.replay.stop();
  });
  test.each([undefined, null, 'not-a-time'])('requires explicit valid capture metadata: %s', async capturedAt => {
    const prepare = jest.fn(), f = fixture({ prepare });
    await expect(f.replay.load('chosen.mp4', { capturedAt })).rejects.toThrow('Capture time'); expect(prepare).not.toHaveBeenCalled(); await f.replay.stop();
  });
  test('rejects removed pacing and motion-hold controls', async () => {
    const f = fixture(); await f.replay.load('chosen.mp4', metadata);
    expect(() => f.replay.trigger({ delivery: 'paced' })).toThrow(); expect(() => f.replay.trigger({ motionHold: 'prepared-duration' })).toThrow();
    await f.replay.stop();
  });
  test.each(['stop', 'eof'])('stdin %s aborts a pending load before queued commands and waits for retirement', async exit => {
    const input = new PassThrough(); let owner: AbortSignal | undefined, finish!: () => void;
    const source = bundle(), prepare = jest.fn(async (_file: string, _config: unknown, _audio: boolean, signal: AbortSignal) => {
      owner = signal; await new Promise<void>(resolve => { finish = resolve; }); return source;
    });
    const f = fixture({ prepare }), shutdown = jest.fn(async () => {}), rows: string[] = [];
    const controls = createCommandInput({ input, replay: f.replay, shutdown, report: (event: string) => rows.push(event) });
    input.write(JSON.stringify({ command: 'load', file: 'pending', ...metadata }) + '\n'); await flush();
    expect(owner).toBeDefined(); input.write(JSON.stringify({ command: 'load', file: 'queued', ...metadata }) + '\n{"command":"trigger"}\n');
    if (exit === 'stop') input.write('{"command":"stop"}\n'); else input.end();
    await new Promise<void>(resolve => setImmediate(resolve)); expect(owner?.aborted).toBe(true); expect(shutdown).not.toHaveBeenCalled();
    finish(); await controls.stop(); expect(shutdown).toHaveBeenCalledTimes(1); expect(prepare).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([]); expect(source.budget.bytes).toBe(0); input.destroy();
  });
  test('keeps status lifecycle separate from reserved event metadata', async () => {
    const root = directory('hsv-evidence-'), descriptor = openSync(join(root, 'events.jsonl'), 'wx', 0o600);
    const output = { write: jest.fn() }, report = createEvidenceReporter(descriptor, output);
    try { report('status', { event: 'overwritten', at: 'overwritten', phase: 'ready' }); }
    finally { closeSync(descriptor); }
    expect(JSON.parse(readFileSync(join(root, 'events.jsonl'), 'utf8'))).toMatchObject({ event: 'status', phase: 'ready', at: expect.not.stringMatching('overwritten') });
  });
  test('wires actual HAP audio/camera permissions to the canonical recording adapter', async () => {
    const accessory = new hap.Accessory('Test', hap.uuid.generate('canonical-diagnostic-fixture'));
    const result = configureReplayCamera({ hap, accessory, recordingOptions: createRecordingOptions(),
      RecordingDelegate: BlinkCameraRecordingDelegate, prepare: async () => bundle(), report: () => {} });
    const management = result.controller.recordingManagement;
    management.recordingManagementService.getCharacteristic(hap.Characteristic.RecordingAudioActive).updateValue(true);
    management.operatingModeService.getCharacteristic(hap.Characteristic.HomeKitCameraActive).updateValue(false);
    expect(result.replay.status.audioActive).toBe(true); expect(result.replay.status.cameraActive).toBe(false); await result.replay.stop();
  });
});

describe('diagnostic file admission and canonical preparation', () => {
  test('counts retained scratch evidence across restarts and ignores Finder metadata', () => {
    const root = directory('hsv-scratch-'), retained = join(root, 'input-00000000-0000-0000-0000-000000000000.mp4');
    const fd = openSync(retained, 'wx', 0o600); try { ftruncateSync(fd, 95 * 1024 * 1024); } finally { closeSync(fd); }
    writeFileSync(join(root, '.DS_Store'), 'finder'); expect(() => admitScratchSpace(root, 1024 * 1024)).not.toThrow();
    const failed = join(root, 'prepared-00000000-0000-0000-0000-000000000001.mp4'); writeFileSync(failed, 'retained', { mode: 0o600 });
    expect(() => admitScratchSpace(root, 1024 * 1024)).toThrow('scratch budget'); expect(readFileSync(failed, 'utf8')).toBe('retained');
  });
  test('rejects symlinked or non-private retained evidence without altering it', () => {
    const root = directory('hsv-scratch-'), original = join(root, 'chosen.mp4'), retained = join(root, 'prepared-00000000-0000-0000-0000-000000000000.mp4');
    writeFileSync(original, 'original', { mode: 0o600 }); symlinkSync(original, retained);
    expect(() => admitScratchSpace(root, 1)).toThrow(); rmSync(retained); writeFileSync(retained, 'retained', { mode: 0o644 }); chmodSync(retained, 0o644);
    expect(() => admitScratchSpace(root, 1)).toThrow(); expect(readFileSync(original, 'utf8')).toBe('original');
  });
  test('admits only bounded owner-only local MP4 input inside the selected directory', () => {
    const root = directory('hsv-input-'), source = join(root, 'source.mp4'); writeFileSync(source, 'source', { mode: 0o600 });
    expect(admitLocalClip(source, root).bytes).toBe(6); const link = join(root, 'link.mp4'); symlinkSync(source, link);
    expect(() => admitLocalClip(link, root)).toThrow(); chmodSync(source, 0o644); expect(() => admitLocalClip(source, root)).toThrow();
  });
  test('validates explicit preview and qualification executable identity and modes', () => {
    const root = directory('hsv-worker-'), preview = join(root, 'preview.jpg'), worker = join(root, 'worker');
    const jpeg = Buffer.from([255, 216, 255, 217]); writeFileSync(preview, jpeg, { mode: 0o600 }); writeFileSync(worker, 'fixture executable', { mode: 0o700 });
    expect(admitPreview(preview, digest(jpeg))).toEqual(jpeg); expect(() => admitPreview(preview, '0'.repeat(64))).toThrow();
    expect(admitQualificationWorker(worker, digest(readFileSync(worker)))).toBe(worker);
    chmodSync(worker, 0o777); expect(() => admitQualificationWorker(worker, digest(readFileSync(worker)))).toThrow();
    const fd = openSync(preview, 'r+'); try { ftruncateSync(fd, 2 * 1024 * 1024 + 1); } finally { closeSync(fd); }
    expect(() => admitPreview(preview, digest(jpeg))).toThrow();
  });
  test('rejects removed ffmpeg argument and incomplete qualification options before launch', () => {
    expect(() => argumentsFor(['--ffmpeg', '/unused'])).toThrow();
    expect(() => argumentsFor(['--workspace', '/private/fixture', '--plugin-root', '/private/plugin', '--preview', '/private/preview.jpg',
      '--preview-sha256', 'a'.repeat(64), '--qualification-worker', '/private/worker'])).toThrow();
  });
  test('admits only the exact locally tested or Pi qualification HAP identity', () => {
    expect(() => admitHapManifest({ name: 'hap-nodejs', version: '0.14.0' })).not.toThrow();
    expect(() => admitHapManifest({ name: '@homebridge/hap-nodejs', version: '2.3.1-beta.0' })).not.toThrow();
    expect(() => admitHapManifest({ name: 'hap-nodejs', version: '2.3.1-beta.0' })).toThrow();
    expect(() => admitHapManifest({ name: '@homebridge/hap-nodejs', version: '2.3.0' })).not.toThrow();
    expect(() => admitHapManifest({ name: 'hap-nodejs', version: '2.3.0' })).toThrow();
    expect(() => admitHapManifest({ name: '@homebridge/hap-nodejs', version: '2.3.2' })).toThrow();
  });
  test('accepts an explicit validation name and complete qualification identity', () => {
    const network = jest.spyOn(os, 'networkInterfaces').mockReturnValue({ testlan: [{ family: 'IPv4', internal: false, address: '192.168.50.2' }] });
    try {
      const args = ['--workspace', '/private/fixture', '--plugin-root', '/private/plugin', '--preview', '/private/preview.jpg',
        '--preview-sha256', 'a'.repeat(64), '--interface', 'testlan'];
      expect(argumentsFor(args).name).toBe('Blink Clip Replay Test');
      const selected = argumentsFor([...args, '--name', 'Blink Saved Clip Validation', '--qualification-worker', '/private/worker', '--qualification-worker-sha256', 'b'.repeat(64)]);
      expect(selected.name).toBe('Blink Saved Clip Validation'); expect(selected['qualification-worker']).toBe('/private/worker');
      expect(() => argumentsFor([...args, '--name', 'invalid\nname'])).toThrow();
    } finally { network.mockRestore(); }
  });
  test('passes original MP4 directly to canonical preparation and retains its actual pin without another video conversion', async () => {
    const root = directory('hsv-prepare-'), inputs = join(root, 'inputs'), plugin = join(root, 'plugin');
    mkdirSync(inputs, { mode: 0o700 }); mkdirSync(join(plugin, 'dist/accessories'), { recursive: true, mode: 0o700 });
    writeFileSync(join(plugin, 'package.json'), '{}', { mode: 0o600 });
    writeFileSync(join(plugin, 'dist/accessories/saved-clip-preparation.js'), `
      const {createHash}=require('node:crypto');
      exports.prepareSavedClip=async(source,config,audio,signal,options={})=>{
        if(source.expectedBytes!==source.bytes.length||source.expectedSha256!==createHash('sha256').update(source.bytes).digest('hex')||audio!==true||config.prebufferLength!==4000||options.workerFactory)throw Error('Canonical handoff rejected');
        const initialization=Buffer.from('init'),data=Buffer.from('fragment');let disposed=false;
        return {pin:{initialization},fragments:[{data}],sourceInfo:{width:640,height:360},summary:{decodedVideoFrames:30},sourceSha256:source.expectedSha256,
          preparedSha256:createHash('sha256').update(initialization).update(data).digest('hex'),preparedSpanUpperBoundUs:2000000n,
          get disposed(){return disposed},dispose(){disposed=true}};
      };`, { mode: 0o600 });
    const source = join(inputs, 'source.mp4'), bytes = Buffer.from('original MP4 container'), preview = join(inputs, 'preview.jpg'), jpeg = Buffer.from([255, 216, 255, 217]);
    writeFileSync(source, bytes, { mode: 0o600 }); writeFileSync(preview, jpeg, { mode: 0o600 });
    const prepare = createPreparer({ pluginRoot: plugin, inputRoot: inputs, workspace: root, preview, previewSha256: digest(jpeg) });
    const result = await prepare(source, configuration(), true, new AbortController().signal);
    expect(result.prepared.pin.initialization.toString()).toBe('init'); expect(result.prepared.disposed).toBe(false); expect(result.snapshot).toEqual(jpeg);
    const copies = readdirSync(root).filter(name => /^(input|prepared)-/.test(name)); expect(copies).toHaveLength(2);
    expect(readFileSync(join(root, copies.find(name => name.startsWith('input-'))!))).toEqual(bytes);
    expect(readFileSync(join(root, copies.find(name => name.startsWith('prepared-'))!)).toString()).toBe('initfragment');
    expect(readFileSync(source)).toEqual(bytes); expect(result.provenance.preparedSha256).toBe(result.prepared.preparedSha256); result.prepared.dispose();
  });
});
