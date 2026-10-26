import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { TARGETS, sha256, verifyNativePackage, readSourceArchive, verifyPackageIdentity } from './native-package.mjs';

function tar(entries) {
  const chunks = [];
  for (const [name, data, type = '0'] of entries) {
    const header = Buffer.alloc(512); header.write(name); header.write('0000644\0', 100);
    header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header.fill(32, 148, 156); header.write(type, 156);
    header.write([...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}
const json = value => Buffer.from(JSON.stringify(value));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'blink-native-package-test-'));
  const sha = 'a'.repeat(40); const recipe = Buffer.from('recipe'); const copying = Buffer.from('GPL');
  const inputs = { sources: ['ffmpeg', 'opus', 'x264', 'libsrtp'].map(name => ({ name, filename: `${name}.tar.gz`, sha256: sha256(Buffer.from(name)) })) };
  const sources = { 'native/dependencies/prepare.py': sha256(recipe), 'native/dependencies/source-inputs.json': sha256(json(inputs)), 'native/COPYING': sha256(copying) };
  const runtimeNotices = ['mingw-w64-runtime-COPYING', 'gcc-COPYING.RUNTIME'].map(name => [`native/dependencies/licenses/${name}`, Buffer.from(`synthetic ${name}`)]);
  for (const [name, data] of runtimeNotices) sources[name] = sha256(data);
  const proof = { sourceSha: sha, recipeSha: sha256(recipe), pins: inputs, sources };
  const entries = [['README.md', Buffer.from('rebuild')], ['dependencies/ffmpeg-9.0.2.tar.xz.asc', Buffer.from('signature')], ['dependencies/ffmpeg-devel.asc', Buffer.from('key')],
    ['project/native/dependencies/prepare.py', recipe], ['project/native/dependencies/source-inputs.json', json(inputs)], ['project/native/COPYING', copying],
    ...inputs.sources.map(input => [`dependencies/${input.filename}`, Buffer.from(input.name)])];
  entries.push(...runtimeNotices.map(([name, data]) => ['project/' + name, data]));
  const manifest = { schemaVersion: 1, targets: {} }; const receipts = {};
  const write = (name, bytes) => { const path = join(root, name); mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, bytes, { mode: 0o755 }); };
  for (const target of TARGETS) {
    const path = `native/runtime/${target}/worker${target === 'win32-x64' ? '.exe' : ''}`;
    const bytes = Buffer.from(target); write(path, bytes);
    manifest.targets[target] = { path, sha256: sha256(bytes) };
    const receipt = { target, source_sha: sha, sha256: sha256(bytes), artifact_sha256: 'c'.repeat(64),
      dependencies: { recipe_sha256: proof.recipeSha, source_inputs: inputs }, dynamic_dependencies: 'system only', distribution_ready: false, limitations: [] };
    receipts[target] = receipt; entries.push([`receipts/${target}.json`, json(receipt)]);
  }
  const bundle = tar(entries); const manifestBytes = json(manifest);
  const distribution = { schemaVersion: 1, source_sha: sha, targets: receipts, manifest_sha256: sha256(manifestBytes), source_bundle_sha256: sha256(bundle), distribution_ready: false };
  write('native/runtime/manifest.json', manifestBytes); write('native/runtime/distribution-receipt.json', json(distribution));
  write('native/corresponding-source.tar.gz', bundle); write('native/COPYING', copying); write('native/NOTICE', Buffer.from('license notice'));
  return { root, proof, manifest, distribution, entries, write, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
test('accepts five synthetic workers with complete source and dependency identity, without declaring readiness', () => {
  const f = fixture(); try { const result = verifyNativePackage(f.root, f.proof); assert.equal(result.distribution_ready, false); assert.deepEqual(Object.keys(result.targets).sort(), [...TARGETS].sort()); } finally { f.cleanup(); }
});
for (const mutation of ['missing', 'extra', 'worker', 'manifest', 'bundle', 'source', 'recipe', 'pins', 'readiness', 'symlink']) {
  test(`refuses ${mutation} native package`, () => {
    const f = fixture(); try {
      const worker = f.manifest.targets[TARGETS[0]].path;
      if (mutation === 'missing') rmSync(join(f.root, worker));
      if (mutation === 'extra') f.write('native/runtime/untracked', Buffer.from('extra'));
      if (mutation === 'worker') f.write(worker, Buffer.from('changed'));
      if (mutation === 'manifest') f.write('native/runtime/manifest.json', json({ ...f.manifest, extra: true }));
      if (mutation === 'bundle') f.write('native/corresponding-source.tar.gz', Buffer.from('changed'));
      if (mutation === 'source') f.distribution.source_sha = 'b'.repeat(40);
      if (mutation === 'recipe') f.proof.recipeSha = 'b'.repeat(64);
      if (mutation === 'pins') f.proof.pins = { sources: [] };
      if (mutation === 'readiness') f.distribution.distribution_ready = true;
      if (mutation === 'symlink') { rmSync(join(f.root, worker)); symlinkSync(join(f.root, 'native/NOTICE'), join(f.root, worker)); }
      if (['source', 'readiness'].includes(mutation)) f.write('native/runtime/distribution-receipt.json', json(f.distribution));
      assert.throws(() => verifyNativePackage(f.root, f.proof));
    } finally { f.cleanup(); }
  });
}
for (const mutation of ['missing source', 'changed archive', 'missing notice', 'link', 'traversal', 'duplicate']) {
  test(`source bundle refuses ${mutation} even after its outer hash is recomputed`, () => {
    const f = fixture(); try {
      if (mutation === 'missing source') f.entries.splice(f.entries.findIndex(([name]) => name === 'project/native/COPYING'), 1);
      if (mutation === 'changed archive') f.entries.find(([name]) => name === 'dependencies/opus.tar.gz')[1] = Buffer.from('forged');
      if (mutation === 'missing notice') delete f.proof.sources['native/COPYING'];
      if (mutation === 'link') f.entries.push(['link', Buffer.alloc(0), '2']);
      if (mutation === 'traversal') f.entries.push(['../outside', Buffer.from('outside')]);
      if (mutation === 'duplicate') f.entries.push(f.entries[0]);
      const bytes = tar(f.entries); f.write('native/corresponding-source.tar.gz', bytes);
      f.distribution.source_bundle_sha256 = sha256(bytes); f.write('native/runtime/distribution-receipt.json', json(f.distribution));
      assert.throws(() => verifyNativePackage(f.root, f.proof));
    } finally { f.cleanup(); }
  });
}
test('source tar decompression is bounded and hidden trailing entries are refused', () => {
  assert.throws(() => readSourceArchive(gzipSync(Buffer.alloc(4096)), 1024));
  const bytes = tar([['safe', Buffer.from('data')]]); assert.equal(readSourceArchive(bytes).get('safe').toString(), 'data');
});
for (const name of ['mingw-w64-runtime-COPYING', 'gcc-COPYING.RUNTIME']) {
  for (const mutation of ['missing', 'tampered']) test(`${mutation} ${name} blocks distribution despite recomputed bundle hash`, () => {
    const f = fixture(); try {
      const path = `native/dependencies/licenses/${name}`;
      const index = f.entries.findIndex(([name]) => name === 'project/' + path);
      if (mutation === 'missing') { delete f.proof.sources[path]; f.entries.splice(index, 1); }
      else f.entries[index][1] = Buffer.from('changed notice');
      const bundle = tar(f.entries); f.distribution.source_bundle_sha256 = sha256(bundle);
      f.write('native/corresponding-source.tar.gz', bundle); f.write('native/runtime/distribution-receipt.json', json(f.distribution));
      assert.throws(() => verifyNativePackage(f.root, f.proof));
    } finally { f.cleanup(); }
  });
}
test('qualification checks exact final npm bytes before any install or launch', () => {
  const f = fixture(); try {
    const path = join(f.root, 'release.tgz'); writeFileSync(path, 'immutable');
    const receipt = { sha: f.proof.sourceSha, integrity: 'sha512-YMismatched', name: 'plugin', version: '1.0.0' };
    assert.throws(() => verifyPackageIdentity(path, receipt, f.proof.sourceSha));
    receipt.integrity = 'sha512-' + (awaitableHash(readFileSync(path)));
    verifyPackageIdentity(path, receipt, f.proof.sourceSha);
    writeFileSync(path, 'tampered'); assert.throws(() => verifyPackageIdentity(path, receipt, f.proof.sourceSha));
  } finally { f.cleanup(); }
});
import { createHash } from 'node:crypto';
function awaitableHash(bytes) { return createHash('sha512').update(bytes).digest('base64'); }

test('JavaScript-only smoke refuses creation of release output', () => {
  const f = fixture(); try {
    const result = spawnSync(process.execPath, ['.github/scripts/verify-package.mjs'], { cwd: process.cwd(), encoding: 'utf8',
      env: { ...process.env, VERIFY_PACKAGE_JAVASCRIPT_ONLY: '1', PACKAGE_OUTPUT: join(f.root, 'release.tgz') } });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Release output requires native verification/);
  } finally { f.cleanup(); }
});
