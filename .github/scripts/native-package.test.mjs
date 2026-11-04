import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { load as loadYaml } from 'js-yaml';
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
  const manifest = { schemaVersion: 1, protocolVersion: 4, targets: {} }; const receipts = {};
  const write = (name, bytes) => { const path = join(root, name); mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, bytes, { mode: 0o755 }); };
  for (const target of TARGETS) {
    const path = `native/runtime/${target}/worker${target === 'win32-x64' ? '.exe' : ''}`;
    const bytes = Buffer.from(target); write(path, bytes);
    manifest.targets[target] = { path, sha256: sha256(bytes) };
    const receipt = { target, protocolVersion: 4, source_sha: sha, sha256: sha256(bytes), artifact_sha256: 'c'.repeat(64),
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
for (const mutation of ['missing', 'extra', 'worker', 'manifest', 'protocol', 'bundle', 'source', 'recipe', 'pins', 'readiness', 'symlink']) {
  test(`refuses ${mutation} native package`, () => {
    const f = fixture(); try {
      const worker = f.manifest.targets[TARGETS[0]].path;
      if (mutation === 'missing') rmSync(join(f.root, worker));
      if (mutation === 'extra') f.write('native/runtime/untracked', Buffer.from('extra'));
      if (mutation === 'worker') f.write(worker, Buffer.from('changed'));
      if (mutation === 'manifest') f.write('native/runtime/manifest.json', json({ ...f.manifest, extra: true }));
      if (mutation === 'protocol') f.write('native/runtime/manifest.json', json({ ...f.manifest, protocolVersion: 2 }));
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

const workflow = name => loadYaml(readFileSync(new URL(`../workflows/${name}.yml`, import.meta.url), 'utf8'));
const sourceArtifactName = 'native-source-inputs-${{ github.sha }}';
const sourceDirectory = 'native/build/deps/downloads';

test('CI fetches and uploads only the six verified source inputs at the checked-out SHA', () => {
  const job = workflow('test').jobs['source-inputs'];
  assert.ok(job, 'a single source-input producer must precede native builds');
  assert.equal(job['runs-on'], 'ubuntu-24.04');
  assert.deepEqual(job.permissions, { contents: 'read' });
  const checkout = job.steps.find(step => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with.ref, '${{ github.sha }}');
  assert.equal(checkout.with['persist-credentials'], false);
  const fetchIndex = job.steps.findIndex(step => step.run === 'python native/dependencies/prepare.py');
  const uploadIndex = job.steps.findIndex(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.ok(fetchIndex >= 0 && uploadIndex > fetchIndex, 'canonical verification must finish before upload');
  const upload = job.steps[uploadIndex].with;
  const pins = JSON.parse(readFileSync(new URL('../../native/dependencies/source-inputs.json', import.meta.url), 'utf8'));
  const filenames = [...pins.sources.map(source => source.filename), 'ffmpeg-9.0.2.tar.xz.asc', 'ffmpeg-devel.asc'];
  assert.equal(upload.name, sourceArtifactName);
  assert.deepEqual(upload.path.trim().split(/\s+/).sort(), filenames.map(name => `${sourceDirectory}/${name}`).sort());
  assert.equal(upload['if-no-files-found'], 'error');
});

for (const [name, jobName, dependency, verification] of [
  ['test', 'native-validation', 'source-inputs', 'python native/dependencies/prepare.py'],
  ['publish', 'package', 'gates', 'python native/dependencies/package.py --root'],
]) {
  test(`${name} reuses same-run SHA-bound inputs before canonical source verification`, () => {
    const job = workflow(name).jobs[jobName];
    assert.ok([job.needs].flat().includes(dependency));
    const downloadIndex = job.steps.findIndex(step => step.uses?.startsWith('actions/download-artifact@')
      && step.with?.name === sourceArtifactName);
    const verifyIndex = job.steps.findIndex(step => step.run?.includes(verification));
    assert.ok(downloadIndex >= 0 && verifyIndex > downloadIndex, 'download must precede unchanged SHA/GPG verification');
    assert.deepEqual(job.steps[downloadIndex].with, { name: sourceArtifactName, path: sourceDirectory });
    if (name === 'test') {
      assert.deepEqual(job.strategy.matrix.include.map(target => target.target).sort(), [...TARGETS].sort());
      const step = job.steps[verifyIndex];
      assert.equal(step.env?.NATIVE_TARGET, '${{ matrix.target }}');
      for (const target of TARGETS) {
        // Exercise the actual lane selection without invoking Python or building dependencies.
        const selected = spawnSync('bash', ['-c', `python() { printf '%s\\0' "$@"; }\n${step.run}`], {
          encoding: 'utf8', env: { ...process.env, NATIVE_TARGET: target },
        });
        assert.equal(selected.status, 0, `${target}: ${selected.stderr}`);
        const args = selected.stdout.split('\0').slice(0, -1);
        assert.equal(args[0], 'native/dependencies/prepare.py');
        assert.ok(args.includes('--build-local'), `${target} must build the verified sources`);
        assert.equal(args.includes('--disable-assembly'), !target.endsWith('-arm64'), `${target} assembly choice`);
        assert.equal(args[args.indexOf('--prefix-file') + 1], 'native/build/deps/ci-prefix.txt');
      }
    }
  });
}

test('actual dispatch conditions keep all five candidate qualifications reachable without publishing credentials', () => {
  const release = workflow('publish'), gates = workflow('test');
  assert.equal(release.on.workflow_dispatch.inputs.mode.default, 'build-only');
  assert.deepEqual(release.on.workflow_dispatch.inputs.mode.options.sort(), ['build-only', 'publish']);
  assert.equal(release.on.workflow_dispatch.inputs.version.required, false);
  assert.equal(release.jobs.gates.uses, './.github/workflows/test.yml');
  assert.equal(release.jobs.gates.with.release, true);
  assert.deepEqual(release.jobs.qualify.strategy.matrix.include.map(lane => lane.target).sort(), [...TARGETS].sort());
  assert.ok([release.jobs.complete.needs].flat().includes('qualify'), 'completion must wait for every qualification lane');
  assert.ok([release.jobs.publish.needs].flat().includes('complete'), 'publication must use the completed proof');
  for (const [name, job] of [...Object.entries(release.jobs), ...Object.entries(gates.jobs).map(([name, job]) => [`gates/${name}`, job])]) {
    if (name === 'publish') continue;
    const permissions = job.permissions ?? (name.startsWith('gates/') ? gates.permissions : release.permissions);
    assert.equal(permissions.contents, 'read', name);
    assert.ok(Object.values(permissions).every(value => value === 'read' || value === 'none'), name);
    assert.equal(job.environment, undefined, name);
    for (const step of job.steps || []) {
      assert.equal(step.env?.GH_TOKEN, undefined, name);
      if (step.uses?.startsWith('actions/checkout@')) {
        assert.equal(step.with.ref, '${{ github.sha }}', name);
        assert.equal(step.with['persist-credentials'], false, name);
      }
    }
  }
  assert.equal(release.jobs.publish.permissions['id-token'], 'write');
  const completed = release.jobs.complete.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  const publishing = release.jobs.publish.steps.find(step => step.uses?.startsWith('actions/download-artifact@'));
  assert.equal(publishing.with.name, completed.with.name, 'publisher must consume the same completed artifact');
  const intent = release.jobs.intent.steps.find(step => step.id === 'intent');
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  const scratch = mkdtempSync(join(tmpdir(), 'blink-workflow-intent-'));
  try {
    let index = 0;
    for (const ref of ['refs/heads/main', 'refs/heads/codex/hsv-saved-clip-prototype']) {
      for (const mode of [undefined, 'build-only', 'publish', 'unknown']) {
        for (const requested of ['', manifest.version, '99.0.0', 'invalid']) {
          const output = join(scratch, String(index++));
          const env = { ...process.env, GITHUB_REF: ref, GITHUB_OUTPUT: output, RELEASE_VERSION: requested };
          if (mode === undefined) delete env.RELEASE_MODE; else env.RELEASE_MODE = mode;
          // Execute the actual checked-in intent step, not a reimplementation of its shell/Node logic.
          const resolved = spawnSync('bash', ['-c', intent.run], { cwd: process.cwd(), encoding: 'utf8', env });
          const allowed = (mode === undefined || mode === 'build-only') && ['', manifest.version].includes(requested)
            || mode === 'publish' && ref === 'refs/heads/main' && requested === manifest.version;
          assert.equal(resolved.status === 0, allowed, `${ref}/${mode}/${requested}: ${resolved.stderr}`);
          const outputs = existsSync(output) ? Object.fromEntries(readFileSync(output, 'utf8').trim().split('\n').map(line => line.split('='))) : {};
          const reached = new Map([['intent', allowed]]);
          function reachable(name) {
            if (reached.has(name)) return reached.get(name);
            const job = release.jobs[name];
            const dependencies = job.needs === undefined ? [] : [job.needs].flat();
            const success = dependencies.every(reachable) && (!job.if || Function('github', 'needs', `return (${job.if});`)(
              { ref }, { intent: { outputs } }));
            reached.set(name, success); return success;
          }
          assert.equal(reachable('complete'), allowed, 'all valid branch candidates must complete five qualifications');
          assert.equal(reachable('publish'), allowed && mode === 'publish', 'only explicit main publication is reachable');
          if (allowed) assert.equal(outputs.version, manifest.version);
        }
      }
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
