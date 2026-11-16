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
import { EXTERNAL_LIVE_SELECTIONS, exerciseExternalLive } from './external-runtime-checks.mjs';
import { TARGETS, collectSourceProof, regularFile, sha256, verifyNativePackage, verifyPackageIdentity } from './native-package.mjs';

export const QUALIFICATION_SELECTIONS = EXTERNAL_LIVE_SELECTIONS;
export const FINITE_RECORDING_SELECTIONS = Object.freeze(['audio-16khz', 'audio-24khz', 'audio-disabled', '30fps-source-15fps-output', 'recovery-metadata', 'low-fps-source', '25fps-source-15fps-output', 'audio-clock-repair', 'missing-audio-recovery', 'corrupt-audio-recovery', 'damaged-audio-disabled']);
export const RUNTIME_BOOTSTRAP_EXPECTATION = Object.freeze({ instances: 2, sourceStarts: 2, sourceStops: 2,
  publicMotionEvents: 2, stateReloaded: true, syntheticDownloads: 1, networkAttempts: 0 });
const selections = QUALIFICATION_SELECTIONS;
const names = target => ['check-protection'].map(name => name + (target === 'win32-x64' ? '.exe' : ''));
export function prepareValidation(build, output, target, sourceSha) {
  assert.equal(target, process.platform + '-' + process.arch); assert(TARGETS.includes(target)); assert.match(sourceSha, /^[a-f0-9]{40}$/);
  const files = Object.fromEntries(names(target).map(name => [name, sha256(regularFile(build, name))]));
  const worker = 'blink-protection-worker' + (target === 'win32-x64' ? '.exe' : '');
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
        nativeStorage: { moduleId: '20:30', syncModuleId: 30 }, settings: { exposeMotionDetected: true, homeKitSecureVideo: false, earlyNotificationMode: 'unmanaged' },
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
    const { REMOTE_OPERATION_LEASE_MS } = requireInstalled(join(packageRoot, 'dist/operation-budget.js'));
    const api = new BlinkApi({ email: '', password: '', hardwareId: 'qualification', tier: 'u001', sharedTier: 'e001' });
    Object.assign(api.auth, { ensureValidToken: async () => {}, getPersistedTier: async () => 'u001', getPersistedSharedTier: async () => 'e001', getAccountId: () => 10,
      getClientId: () => 90, getAuthHeaders: () => ({ Authorization: 'Bearer qualification-only' }) });
    api.configureRemoteOperationOwnership({ restoredState: {}, saveState: async () => {} });
    const storageScope = { accountId: 10, networkId: 20, syncModuleId: 30 };
    api.setNativeStorageOwner(storageScope, { version: 1, operation: { ...storageScope, operationId: 'clip', kind: 'clip', phase: 'prepared',
      commandId: 505, statusReads: 1, expiresAt: Date.now() + REMOTE_OPERATION_LEASE_MS,
      clip: { manifestId: 303, clip: { clipId: 404, networkId: 20, deviceName: 'qualification',
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
export async function qualifyPackage({ artifactDirectory, validationRoot, sourceRoot, sourceSha, receiptPath, ffmpegPath }) {
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
    const { loadPackagedProtectionWorker } = installedRequire(join(installed, 'dist/accessories/protection-worker-artifact.js'));
    const workerPath = loadPackagedProtectionWorker(installed);
    const bootstrap = await exerciseInstalledRuntimeBootstrap(installed);
    assert(typeof ffmpegPath === 'string' && ffmpegPath.length > 0, 'External FFmpeg executable required');
    const version = execFileSync(workerPath, ['--exec', ffmpegPath, '-hide_banner', '-version'], { env: {}, timeout: 5000, maxBuffer: 65536 }).toString().split('\n')[0];
    assert(version.startsWith('ffmpeg version '));
    const externalFfmpeg = { version, sha256: sha256(readFileSync(ffmpegPath)) };
    const exercised = await exerciseExternalLive(installed, workerPath, ffmpegPath, validationRoot);
    const { exerciseExternalRecording } = await import('./external-recording-check.mjs');
    const finite = await exerciseExternalRecording(installed, workerPath, ffmpegPath);
    // Confirm installed bytes and final npm bytes still match after all launches.
    verifyNativePackage(installed, proof); verifyPackageIdentity(artifact, receipt, sourceSha);
    const result = { schemaVersion: 1, target, source_sha: sourceSha, package_integrity: receipt.integrity, worker_sha256: workerSha,
      source_bundle_sha256: native.source_bundle_sha256, validation_receipt_sha256: sha256(regularFile(validationRoot, 'validation-receipt.json', 65536)),
      external_ffmpeg: externalFfmpeg, codec_receiver_verified: true, selections: exercised, finite_recording_verified: true, finite_selections: finite, runtime_bootstrap: bootstrap };
    writeFileSync(receiptPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); return result;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
export function validateQualificationReceipts(rows, sourceSha, integrity, sourceBundleSha, workers) {
  assert.equal(rows.length, TARGETS.length); assert.deepEqual(rows.map(row => row.target).sort(), [...TARGETS].sort());
  for (const row of rows) {
    assert.equal(row.schemaVersion, 1); assert.equal(row.source_sha, sourceSha); assert.equal(row.package_integrity, integrity);
    assert.equal(row.source_bundle_sha256, sourceBundleSha); assert.equal(row.codec_receiver_verified, true); assert.deepEqual(row.selections, selections);
    assert(row.external_ffmpeg?.version?.startsWith('ffmpeg version ')); assert.match(row.external_ffmpeg?.sha256, /^[a-f0-9]{64}$/);
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
    sourceRoot: resolve(args['--source-root']), sourceSha: args['--source-sha'], receiptPath: resolve(args['--receipt']), ffmpegPath: resolve(args['--ffmpeg']) })));
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
