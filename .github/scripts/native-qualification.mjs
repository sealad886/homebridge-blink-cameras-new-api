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
import { releaseIntent } from './release-policy.mjs';

export const QUALIFICATION_SELECTIONS = Object.freeze(['audio-latm', 'audio-latm-bundled'].flatMap(mode =>
  ['opus:16000', 'opus:24000', 'pcma:8000', 'pcmu:8000'].map(audio => `${mode}:${audio}`)));
const selections = QUALIFICATION_SELECTIONS;
const names = target => ['fixture', 'check-rtp'].map(name => name + (target === 'win32-x64' ? '.exe' : ''));
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
    const exercised = await exerciseInstalledCodec(installed, workerPath, validationRoot);
    // Confirm installed bytes and final npm bytes still match after all launches.
    verifyNativePackage(installed, proof); verifyPackageIdentity(artifact, receipt, sourceSha);
    const result = { schemaVersion: 2, target, source_sha: sourceSha, package_name: installedManifest.name,
      package_version: installedManifest.version, package_integrity: receipt.integrity, worker_sha256: workerSha,
      source_bundle_sha256: native.source_bundle_sha256, validation_receipt_sha256: sha256(regularFile(validationRoot, 'validation-receipt.json', 65536)),
      codec_receiver_verified: true, selections: exercised };
    writeFileSync(receiptPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); return result;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
export function validateQualificationReceipts(rows, sourceSha, integrity, sourceBundleSha, workers, name, version) {
  assert.deepEqual(Object.keys(workers).sort(), [...TARGETS].sort(), 'Missing packaged worker identities');
  assert.equal(rows.length, TARGETS.length); assert.deepEqual(rows.map(row => row.target).sort(), [...TARGETS].sort());
  for (const row of rows) {
    assert.equal(row.schemaVersion, 2); assert.equal(row.source_sha, sourceSha); assert.equal(row.package_integrity, integrity);
    assert.equal(row.package_name, name); assert.equal(row.package_version, version);
    assert.equal(row.source_bundle_sha256, sourceBundleSha); assert.equal(row.codec_receiver_verified, true); assert.deepEqual(row.selections, selections);
    assert.match(row.worker_sha256, /^[a-f0-9]{64}$/); assert.match(row.validation_receipt_sha256, /^[a-f0-9]{64}$/);
    assert.equal(row.worker_sha256, workers[row.target], 'Qualified worker differs from publication artifact');
  }
}

function completionProof({ artifactDirectory, sourceSha, mode, ref, requestedVersion }) {
  const receipt = JSON.parse(regularFile(artifactDirectory, 'package-receipt.json', 65536));
  const intent = releaseIntent({ mode, ref, requestedVersion, manifestVersion: receipt.version });
  verifyPackageIdentity(join(artifactDirectory, 'release.tgz'), receipt, sourceSha);
  assert.match(receipt.native?.source_bundle_sha256, /^[a-f0-9]{64}$/, 'Missing source bundle identity');
  const qualifications = join(artifactDirectory, 'qualifications');
  assert.deepEqual(readdirSync(qualifications).sort(), TARGETS.map(target => `${target}.json`).sort());
  const bytes = TARGETS.map(target => regularFile(qualifications, `${target}.json`, 65536));
  const rows = bytes.map(value => JSON.parse(value));
  validateQualificationReceipts(rows, sourceSha, receipt.integrity, receipt.native.source_bundle_sha256,
    receipt.native.workers, receipt.name, receipt.version);
  return { schemaVersion: 1, source_sha: sourceSha, mode: intent.mode, name: receipt.name, version: intent.version,
    package_integrity: receipt.integrity, source_bundle_sha256: receipt.native.source_bundle_sha256,
    workers: { ...receipt.native.workers }, qualified_targets: [...TARGETS],
    qualification_receipts: Object.fromEntries(TARGETS.map((target, index) => [target,
      { path: `qualifications/${target}.json`, sha256: sha256(bytes[index]) }])) };
}

/** Persist the same canonical package and all target evidence together, without publishing. */
export function completeQualifiedPackage(options) {
  const directory = options.qualificationDirectory;
  assert.deepEqual(readdirSync(directory).sort(), TARGETS.map(target => `${target}.json`).sort());
  const destination = join(options.artifactDirectory, 'qualifications'); mkdirSync(destination);
  for (const target of TARGETS) {
    regularFile(directory, `${target}.json`, 65536);
    copyFileSync(join(directory, `${target}.json`), join(destination, `${target}.json`), constants.COPYFILE_EXCL);
  }
  const proof = completionProof(options);
  writeFileSync(join(options.artifactDirectory, 'native-qualification-receipt.json'), JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
  return proof;
}

/** Recompute every binding before a credentialed publisher performs an external action. */
export function verifyCompletedPackage(options) {
  const stored = JSON.parse(regularFile(options.artifactDirectory, 'native-qualification-receipt.json', 65536));
  const expected = completionProof(options);
  assert.deepEqual(stored, expected, 'Completed package qualification differs from publication intent or evidence');
  return expected;
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
    console.log(JSON.stringify(completeQualifiedPackage({ artifactDirectory: resolve(args['--artifact-directory']),
      qualificationDirectory: resolve(args['--qualifications']), sourceSha: args['--source-sha'], mode: args['--mode'],
      ref: args['--ref'], requestedVersion: args['--version'] })));
  } else throw new Error('Expected prepare, run or aggregate');
}
