import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import { TARGETS, collectSourceProof, regularFile, sha256, verifyNativePackage, verifyPackageIdentity } from './native-package.mjs';

export const QUALIFICATION_SELECTIONS = Object.freeze(['audio-latm', 'audio-latm-bundled'].flatMap(mode =>
  ['opus:16000', 'opus:24000', 'pcma:8000', 'pcmu:8000'].map(audio => `${mode}:${audio}`)));
export const FINITE_RECORDING_SELECTIONS = Object.freeze(['audio-16khz', 'audio-24khz', 'audio-disabled', '30fps-source-15fps-output']);
export const RUNTIME_BOOTSTRAP_EXPECTATION = Object.freeze({ instances: 2, sourceStarts: 2, sourceStops: 2,
  publicMotionEvents: 2, stateReloaded: true, syntheticDownloads: 1, networkAttempts: 0 });
const selections = QUALIFICATION_SELECTIONS;
const names = target => ['fixture', 'check-rtp', 'check-recording'].map(name => name + (target === 'win32-x64' ? '.exe' : ''));
export function prepareValidation(build, output, target, sourceSha) {
  assert.equal(target, process.platform + '-' + process.arch); assert(TARGETS.includes(target)); assert.match(sourceSha, /^[a-f0-9]{40}$/);
  const files = Object.fromEntries(names(target).map(name => [name, sha256(regularFile(build, name))]));
  const worker = 'blink-codec-worker' + (target === 'win32-x64' ? '.exe' : '');
  const receipt = { schemaVersion: 1, target, source_sha: sourceSha, worker_sha256: sha256(regularFile(build, worker)), files };
  mkdirSync(output); // No reuse or overwrite of an existing output directory.
  for (const name of names(target)) { copyFileSync(join(build, name), join(output, name), constants.COPYFILE_EXCL); chmodSync(join(output, name), 0o755); }
  writeFileSync(join(output, 'validation-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return receipt;
}
export function verifyValidation(root, target, sourceSha, workerSha) {
  const receipt = JSON.parse(regularFile(root, 'validation-receipt.json', 65536));
  assert.deepEqual(Object.keys(receipt).sort(), ['schemaVersion', 'target', 'source_sha', 'worker_sha256', 'files'].sort());
  assert.equal(receipt.schemaVersion, 1); assert.equal(receipt.target, target); assert.equal(receipt.source_sha, sourceSha); assert.equal(receipt.worker_sha256, workerSha);
  assert.deepEqual(Object.keys(receipt.files).sort(), names(target).sort());
  assert.deepEqual(readdirSync(root).sort(), [...names(target), 'validation-receipt.json'].sort());
  for (const name of names(target)) { assert.match(receipt.files[name], /^[a-f0-9]{64}$/); assert.equal(sha256(regularFile(root, name)), receipt.files[name], 'Validation helper hash mismatch'); }
  return receipt;
}
function receiverFrame(type, body = Buffer.alloc(0)) {
  const header = Buffer.alloc(12); header.write('BMR1'); header.writeUInt32BE(type, 4); header.writeUInt32BE(body.length, 8); return Buffer.concat([header, body]);
}

// Execute only installed JavaScript and the installed, hash-verified worker.
// Protected packets use an isolated in-memory owned output; hosted UDP is a separate gate.
export async function exerciseInstalledCodec(packageRoot, workerPath, validationRoot) {
  const requireInstalled = createRequire(join(packageRoot, 'package.json'));
  const { createOwnedMediaSession } = requireInstalled(join(packageRoot, 'dist/accessories/media-session.js'));
  const suffix = process.platform === 'win32' ? '.exe' : '';
  for (const name of names(process.platform + '-' + process.arch)) chmodSync(join(validationRoot, name), 0o755);
  const results = [];
  for (const selected of selections) {
    const [mode, codec, rawRate] = selected.split(':'); const rate = Number(rawRate); const datagrams = []; let captured = 0; let observed;
    const media = execFileSync(join(validationRoot, 'fixture' + suffix), [mode], { env: {}, timeout: 5000, maxBuffer: 2 * 1024 * 1024 });
    const output = (ssrc, pt) => ({ address: '192.168.1.5', addressVersion: 'ipv4', port: 5000 + ssrc,
      suite: 'AES_CM_128_HMAC_SHA1_80', key: Buffer.alloc(16, ssrc), salt: Buffer.alloc(14, ssrc), ssrc,
      payloadType: pt, mtu: ssrc === 7 ? 128 : 1200, fps: 15, rtcpInterval: 0.5 });
    const negotiation = { workerPath, onSourceInfo: info => { observed = info; },
      video: { output: output(7, 99), localPort: 6000, width: 16, height: 16, bitrate: 300000, maxFrames: 9000, profile: 0, level: 0, softwarePreset: 'ultrafast' },
      audio: { output: output(8, 110), localPort: 6001, codec, rate, bitrate: 24000 } };
    const session = await createOwnedMediaSession(negotiation, new globalThis.AbortController().signal, {
      openSocket: async admitted => {
        let close; const whenClosed = new Promise(resolve => { close = resolve; });
        return { whenClosed, close, send: async bytes => {
          assert((captured += bytes.length) <= 8 * 1024 * 1024 && datagrams.length < 8192, 'Qualification packet limit exceeded');
          datagrams.push({ stream: admitted.ssrc === 7 ? 1 : 2, bytes: Buffer.from(bytes) });
        } };
      },
    });
    try {
      await session.write(media); await session.end(); assert.equal(session.failed, false);
      assert.equal(observed?.width, 16); assert.equal(observed?.height, 16);
      const config = Buffer.alloc(40);
      [16, 16, mode === 'audio-latm' ? 4 : 30, 15, { opus: 1, pcma: 2, pcmu: 3 }[codec], rate, session.audioTiming.initialPaddingSamples, 20, 99, 110].forEach((n, i) => config.writeUInt32BE(n, i * 4));
      const input = [receiverFrame(1, config)];
      for (const [stream, capability] of [[1, negotiation.video.output], [2, negotiation.audio.output]]) {
        const init = Buffer.alloc(42); init.writeUInt32BE(stream); init.writeUInt32BE(capability.ssrc, 4); init.writeUInt32BE(1, 8);
        capability.key.copy(init, 12); capability.salt.copy(init, 28); input.push(receiverFrame(10, init));
      }
      for (const packet of datagrams) {
        const body = Buffer.alloc(4 + packet.bytes.length); body.writeUInt32BE(packet.stream); packet.bytes.copy(body, 4);
        input.push(receiverFrame(packet.bytes[1] === 200 ? 12 : 11, body));
      }
      input.push(receiverFrame(3)); const checker = join(validationRoot, 'check-rtp' + suffix);
      const check = frames => execFileSync(checker, [], { input: Buffer.concat(frames), env: {}, timeout: 5000, maxBuffer: 65536, stdio: ['pipe', 'pipe', 'pipe'] });
      assert.equal(check(input).toString(), 'receiver verified\n');
      const forged = input.map(bytes => Buffer.from(bytes)); const index = forged.findIndex(bytes => bytes.readUInt32BE(4) === 11); assert(index >= 0);
      forged[index][forged[index].length - 1] ^= 1; assert.throws(() => check(forged), 'Receiver must reject forged SRTP');
      results.push(selected);
    } finally { await session.stop(); }
  }
  return results;
}

/** Prove the exact installed finite-file path, including seekable tail-moov MP4
 * input, H264/AAC output, permission-off track omission and independent decode. */
export async function exerciseInstalledRecording(packageRoot, validationRoot) {
  const requireInstalled = createRequire(join(packageRoot, 'package.json'));
  const { prepareNativeRecording, NativeRecordingMemoryBudget } = requireInstalled(join(packageRoot, 'dist/accessories/native-recording-preparation.js'));
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const scratch = mkdtempSync(join(tmpdir(), 'blink-finite-qualification-')); chmodSync(scratch, 0o700);
  const results = [];
  try {
    const bytes = execFileSync(join(validationRoot, 'fixture' + suffix), ['audio-mp4', '320', '180', '15', '33'],
      { env: {}, timeout: 5000, maxBuffer: 32 * 1024 * 1024 });
    assert(bytes.indexOf(Buffer.from('moov')) > bytes.indexOf(Buffer.from('mdat')), 'Fixture must require seeking to its tail moov');
    const filePath = join(scratch, 'native-source.mp4'); writeFileSync(filePath, bytes, { mode: 0o600, flag: 'wx' });
    const configuration = { prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: 1000 },
      videoCodec: { type: 0, resolution: [320, 180, 15], parameters: { profile: 0, level: 0, bitRate: 300, iFrameInterval: 1000 } },
      audioCodec: { type: 0, samplerate: 1, audioChannels: 1, bitrateMode: 0, bitrate: 32 } };
    for (const selected of FINITE_RECORDING_SELECTIONS) {
      const longSource = selected === '30fps-source-15fps-output';
      const rate = selected === 'audio-16khz' ? 16000 : selected === 'audio-24khz' ? 24000 : 0;
      const sourceBytes = longSource ? execFileSync(join(validationRoot, 'fixture' + suffix), ['video-mp4', '16', '16', '30', '1800'],
        { env: {}, timeout: 5000, maxBuffer: 32 * 1024 * 1024 }) : bytes;
      const selectedFile = longSource ? join(scratch, 'long-native-source.mp4') : filePath;
      if (longSource) writeFileSync(selectedFile, sourceBytes, { mode: 0o600, flag: 'wx' });
      const selectedConfiguration = { ...configuration,
        videoCodec: { ...configuration.videoCodec, resolution: longSource ? [16, 16, 15] : configuration.videoCodec.resolution },
        audioCodec: { ...configuration.audioCodec, samplerate: rate === 24000 ? 2 : 1 } };
      const memory = new NativeRecordingMemoryBudget();
      const prepared = await prepareNativeRecording({ filePath: selectedFile, expectedBytes: sourceBytes.length, expectedSha256: sha256(sourceBytes) },
        selectedConfiguration, rate !== 0, new globalThis.AbortController().signal, { memory, admit: work => work() });
      try {
        assert(prepared.fragments.length > 1); assert(prepared.durationMs > (longSource ? 59999 : 2100) && prepared.durationMs <= (longSource ? 60000.1 : 2200.1));
        assert(prepared.fragments.every(fragment => fragment.durationMs > 0 && fragment.durationMs <= 1000.01));
        const output = Buffer.concat([prepared.initialization, ...prepared.fragments.map(fragment => fragment.data)]);
        try {
          assert.equal(sha256(output), prepared.preparedSha256);
          const decoded = JSON.parse(execFileSync(join(validationRoot, 'check-recording' + suffix), [],
            { input: output, env: {}, timeout: 5000, maxBuffer: 65536 }));
          assert.equal(decoded.videoFrames, longSource ? 900 : 33); assert.equal(decoded.videoWidth, longSource ? 16 : 320); assert.equal(decoded.videoHeight, longSource ? 16 : 180);
          assert.equal(decoded.audioTracks, rate ? 1 : 0);
          assert.equal(decoded.audioSampleRate, rate);
          assert.equal(decoded.audioChannels, rate ? 1 : 0);
          assert.equal(sha256(readFileSync(selectedFile)), sha256(sourceBytes), 'Preparation must preserve Blink original');
        } finally { output.fill(0); }
        results.push(selected);
      } finally { prepared.dispose(); assert.equal(memory.bytes, 0); }
    }
    bytes.fill(0); return results;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

/** Real installed startup and persistence on each host's filesystem. All remote
 * and child-process capabilities fail closed; the one SDK GET is an in-memory
 * synthetic response used to exercise ordinary download-file promotion. */
export async function exerciseInstalledRuntimeBootstrap(packageRoot) {
  const requireInstalled = createRequire(join(packageRoot, 'package.json'));
  const scratch = mkdtempSync(join(tmpdir(), 'blink-runtime-qualification-')); chmodSync(scratch, 0o700);
  const undo = [], runtimes = []; let networkAttempts = 0, syntheticDownloads = 0, sourceStarts = 0, sourceStops = 0, publicMotionEvents = 0;
  const mediaUrl = 'https://rest-e001.immedia-semi.com/api/v1/accounts/10/networks/20/sync_modules/30/local_storage/manifest/303/clip/request/404/';
  const syntheticBytes = Buffer.from('qualification-only native clip bytes'); let allowDownload = false;
  const denied = () => { networkAttempts++; throw new Error('Network or process activation is forbidden during offline runtime qualification'); };
  const replace = (object, key, value = denied) => {
    const descriptor = Object.getOwnPropertyDescriptor(object, key); assert(descriptor && descriptor.configurable !== false);
    Object.defineProperty(object, key, { ...descriptor, value }); undo.push(() => Object.defineProperty(object, key, descriptor));
  };
  try {
    replace(globalThis, 'fetch', async (url, options = {}) => {
      if (!allowDownload || String(url) !== mediaUrl || (options.method ?? 'GET') !== 'GET') return denied();
      syntheticDownloads++; assert.equal(syntheticDownloads, 1); return new globalThis.Response(syntheticBytes);
    });
    for (const [name, methods] of [['node:http', ['request', 'get']], ['node:https', ['request', 'get']],
      ['node:net', ['connect', 'createConnection']], ['node:tls', ['connect']],
      ['node:dgram', ['createSocket']], ['node:dns', ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveTxt', 'resolveSrv']],
      ['node:child_process', ['spawn', 'fork', 'exec', 'execFile', 'execSync', 'execFileSync', 'spawnSync']]]) {
      const module = requireInstalled(name); for (const method of methods) replace(module, method);
    }
    replace(requireInstalled('node:net').Socket.prototype, 'connect');
    const dns = requireInstalled('node:dns').promises;
    for (const method of ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveTxt', 'resolveSrv']) replace(dns, method);
    const { NativeRecordingRuntime } = requireInstalled(join(packageRoot, 'dist/native-recording-runtime.js'));
    const { resolveNativeRecordingConfig } = requireInstalled(join(packageRoot, 'dist/native-recording-config.js'));
    const { BLINK_FIREBASE_CLIENT } = requireInstalled(join(packageRoot, 'dist/blink-api/fcm-config.js'));
    const scope = { accountId: 10, clientId: 11, tier: 'u000' }, sources = [];
    const marker = 'qualification-persisted-message'; let saveRemote;
    const client = { getCachedIdentity: () => ({ ...scope }), registerMotionNotificationKey: denied,
      createNativeStorageTransport: () => ({ postEmpty: denied, getJson: denied, validateMediaUrl: denied, downloadMedia: denied }),
      withNativeStorageAdmission: denied, setNativeStorageOwner() {},
      configureRemoteOperationOwnership: options => { saveRemote = options.saveState; return async () => {}; },
      reconcileKnownStateCommand: async () => ({ confirmed: true }), reconcileKnownLiveViews: async () => [],
      getRemoteOperationState: () => ({ storage: [], persistenceFailed: false }) };
    const options = { client, scope, storagePath: scratch, config: resolveNativeRecordingConfig(undefined), firebase: BLINK_FIREBASE_CLIENT,
      appVersion: '61.0', report: event => assert(!event.includes('faulted'), 'Offline runtime must not fault'),
      matchingDevices: [{ accountId: 10, networkId: 20, syncModuleId: 30, moduleId: '20:30', providerId: 40,
        target: 'camera', cameraId: 'camera:40', nativeName: 'Qualification camera' }],
      devices: [{ binding: { accountId: 10, networkId: 20, providerId: 40, target: 'camera', cameraId: 'camera:40', nativeName: 'Qualification camera' },
        nativeStorage: { moduleId: '20:30', syncModuleId: 30 }, settings: { exposeMotionDetected: true, homeKitSecureVideo: false },
        motion() { publicMotionEvents++; }, recording: () => undefined }],
      eventSourceFactory: input => { sources.push(input); return {
        async setDemand(demand) { sourceStarts++; assert.deepEqual(demand, { motionAccessory: true, hsv: false }); },
        reconnect: denied,
        async stop() { sourceStops++; },
      }; },
    };
    for (let generation = 0; generation < 2; generation++) {
      const runtime = await NativeRecordingRuntime.create(options); runtimes.push(runtime);
      const source = sources[generation];
      if (generation) assert.deepEqual(source.restoredState.persistentIds, [marker]);
      await runtime.start();
      await source.saveState({ version: 1, scope, firebase: { projectId: BLINK_FIREBASE_CLIENT.projectId,
        appId: BLINK_FIREBASE_CLIENT.appId, messagingSenderId: BLINK_FIREBASE_CLIENT.messagingSenderId }, persistentIds: [marker] });
      await saveRemote({});
      const now = Date.now();
      await source.onNotification({ persistentMessageId: `qualification-${generation}`, scope, receivedAt: now, activatedAt: now,
        data: { category: 'motion', event_type: 'cam2sm_motion', camera: '40', target: 'camera', network: '20', created_at: new Date(now).toISOString() } },
      new globalThis.AbortController().signal);
      await runtime.stop();
      const persisted = JSON.parse(readFileSync(join(runtime.directory, 'state.json')));
      assert.deepEqual(persisted.scope, scope); assert.deepEqual(persisted.push.persistentIds, [marker]); assert.deepEqual(persisted.remoteOperations, {});
    }
    const { BlinkApi } = requireInstalled(join(packageRoot, 'dist/blink-api/client.js'));
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'qualification', tier: 'u001', sharedTier: 'e001' });
    Object.assign(api.auth, { ensureValidToken: async () => {}, getPersistedTier: async () => 'u001', getPersistedSharedTier: async () => 'e001', getAccountId: () => 10,
      getClientId: () => 90, getAuthHeaders: () => ({ Authorization: 'Bearer qualification-only' }) });
    api.configureRemoteOperationOwnership({ restoredState: {}, saveState: async () => {} });
    const storageScope = { accountId: 10, networkId: 20, syncModuleId: 30 };
    api.setNativeStorageOwner(storageScope, { version: 1, operation: { ...storageScope, operationId: 'clip', kind: 'clip', phase: 'prepared',
      commandId: 505, statusReads: 1, clip: { manifestId: 303, clip: { clipId: 404, networkId: 20, deviceName: 'qualification',
        capturedAt: new Date().toISOString(), mediaUrl } } } });
    const directory = join(scratch, 'sdk-download'); mkdirSync(directory, { mode: 0o700 });
    const transport = api.createNativeStorageTransport({ scope: storageScope, directory });
    allowDownload = true;
    const downloaded = await api.withNativeStorageAdmission('clip', () => transport.downloadMedia(mediaUrl, { retry: false, maxBytes: 1024 }), {}, storageScope);
    allowDownload = false;
    assert.equal(downloaded.bytes, syntheticBytes.length); assert.equal(downloaded.sha256, sha256(syntheticBytes));
    assert.deepEqual(readFileSync(downloaded.reference), syntheticBytes);
    const result = { instances: runtimes.length, sourceStarts, sourceStops, publicMotionEvents, stateReloaded: true, syntheticDownloads, networkAttempts };
    assert.deepEqual(result, RUNTIME_BOOTSTRAP_EXPECTATION); return result;
  } finally {
    await Promise.allSettled(runtimes.map(runtime => runtime.stop()));
    for (const restore of undo.reverse()) restore();
    syntheticBytes.fill(0); rmSync(scratch, { recursive: true, force: true });
  }
}
function npmCli() {
  const directory = dirname(process.execPath);
  const candidate = [join(directory, 'node_modules/npm/bin/npm-cli.js'), join(directory, '../lib/node_modules/npm/bin/npm-cli.js')].find(path => existsSync(path));
  assert(candidate, 'Cannot resolve bundled npm CLI'); return candidate;
}
export async function qualifyPackage({ artifactDirectory, validationRoot, sourceRoot, sourceSha, receiptPath }) {
  const target = process.platform + '-' + process.arch; assert(TARGETS.includes(target), 'Unsupported qualification host');
  const artifact = join(artifactDirectory, 'release.tgz'); const receipt = JSON.parse(regularFile(artifactDirectory, 'package-receipt.json', 65536));
  verifyPackageIdentity(artifact, receipt, sourceSha);
  const sourceManifest = JSON.parse(readFileSync(join(sourceRoot, 'package.json')));
  assert.equal(receipt.name, sourceManifest.name); assert.equal(receipt.version, sourceManifest.version); assert(receipt.native, 'Native package receipt required');
  const proof = collectSourceProof(sourceRoot, sourceSha);
  const scratch = mkdtempSync(join(tmpdir(), 'blink-clean-package-'));
  try {
    // No source dependency installation, source build, dev dependencies, prefix or global install.
    execFileSync(process.execPath, [npmCli(), 'install', '--prefix', scratch, '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', '--package-lock=false', '--registry=https://registry.npmjs.org', artifact],
      { cwd: scratch, timeout: 180000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, npm_config_cache: join(scratch, 'npm-cache'), npm_config_userconfig: join(scratch, 'empty-npmrc') }, stdio: ['ignore', 'pipe', 'pipe'] });
    const installed = join(scratch, 'node_modules', ...receipt.name.split('/'));
    const installedManifest = JSON.parse(regularFile(installed, 'package.json', 65536));
    assert.equal(installedManifest.name, receipt.name); assert.equal(installedManifest.version, receipt.version); assert.equal(installedManifest.gitHead, sourceSha);
    const native = verifyNativePackage(installed, proof);
    assert.equal(native.manifest_sha256, receipt.native.manifest_sha256); assert.equal(native.source_bundle_sha256, receipt.native.source_bundle_sha256);
    assert.equal(sha256(regularFile(installed, 'native/runtime/distribution-receipt.json', 2 * 1024 * 1024)), receipt.native.distribution_receipt_sha256);
    const workerSha = native.targets[target].sha256; verifyValidation(validationRoot, target, sourceSha, workerSha);
    const installedRequire = createRequire(join(installed, 'package.json'));
    const { loadPackagedMediaWorker } = installedRequire(join(installed, 'dist/accessories/media-worker-artifact.js'));
    const workerPath = loadPackagedMediaWorker(installed);
    const bootstrap = await exerciseInstalledRuntimeBootstrap(installed);
    const exercised = await exerciseInstalledCodec(installed, workerPath, validationRoot);
    const finite = await exerciseInstalledRecording(installed, validationRoot);
    // Confirm installed bytes and final npm bytes still match after all launches.
    verifyNativePackage(installed, proof); verifyPackageIdentity(artifact, receipt, sourceSha);
    const result = { schemaVersion: 1, target, source_sha: sourceSha, package_integrity: receipt.integrity, worker_sha256: workerSha,
      source_bundle_sha256: native.source_bundle_sha256, validation_receipt_sha256: sha256(regularFile(validationRoot, 'validation-receipt.json', 65536)),
      codec_receiver_verified: true, selections: exercised, finite_recording_verified: true, finite_selections: finite, runtime_bootstrap: bootstrap };
    writeFileSync(receiptPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); return result;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
export function validateQualificationReceipts(rows, sourceSha, integrity, sourceBundleSha, workers) {
  assert.equal(rows.length, TARGETS.length); assert.deepEqual(rows.map(row => row.target).sort(), [...TARGETS].sort());
  for (const row of rows) {
    assert.equal(row.schemaVersion, 1); assert.equal(row.source_sha, sourceSha); assert.equal(row.package_integrity, integrity);
    assert.equal(row.source_bundle_sha256, sourceBundleSha); assert.equal(row.codec_receiver_verified, true); assert.deepEqual(row.selections, selections);
    assert.equal(row.finite_recording_verified, true); assert.deepEqual(row.finite_selections, FINITE_RECORDING_SELECTIONS);
    assert.deepEqual(row.runtime_bootstrap, RUNTIME_BOOTSTRAP_EXPECTATION);
    assert.match(row.worker_sha256, /^[a-f0-9]{64}$/); assert.match(row.validation_receipt_sha256, /^[a-f0-9]{64}$/);
    if (workers) assert.equal(row.worker_sha256, workers[row.target], 'Qualified worker differs from publication artifact');
  }
}
function argumentsMap(argv) {
  assert(argv.length % 2 === 0, 'Expected explicit named arguments'); const options = {};
  for (let i = 0; i < argv.length; i += 2) { assert(argv[i].startsWith('--') && !Object.hasOwn(options, argv[i]), 'Invalid named argument'); options[argv[i]] = argv[i + 1]; }
  return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...argv] = process.argv.slice(2); const args = argumentsMap(argv);
  if (command === 'prepare') prepareValidation(resolve(args['--build']), resolve(args['--output']), args['--target'], args['--source-sha']);
  else if (command === 'run') console.log(JSON.stringify(await qualifyPackage({ artifactDirectory: resolve(args['--artifact-directory']), validationRoot: resolve(args['--validation']),
    sourceRoot: resolve(args['--source-root']), sourceSha: args['--source-sha'], receiptPath: resolve(args['--receipt']) })));
  else if (command === 'aggregate') {
    const artifactDirectory = resolve(args['--artifact-directory']); const receipt = JSON.parse(regularFile(artifactDirectory, 'package-receipt.json', 65536));
    verifyPackageIdentity(join(artifactDirectory, 'release.tgz'), receipt, args['--source-sha']);
    const directory = resolve(args['--qualifications']); assert.deepEqual(readdirSync(directory).sort(), TARGETS.map(target => `${target}.json`).sort());
    const rows = TARGETS.map(target => JSON.parse(regularFile(directory, `${target}.json`, 65536)));
    assert.deepEqual(Object.keys(receipt.native?.workers ?? {}).sort(), [...TARGETS].sort(), 'Missing packaged worker identities');
    validateQualificationReceipts(rows, args['--source-sha'], receipt.integrity, receipt.native.source_bundle_sha256, receipt.native.workers);
    console.log(JSON.stringify({ source_sha: receipt.sha, package_integrity: receipt.integrity, qualified_targets: TARGETS }));
  } else throw new Error('Expected prepare, run or aggregate');
}
