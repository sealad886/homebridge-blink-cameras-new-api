import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { QUALIFICATION_SELECTIONS, prepareValidation, verifyValidation, validateQualificationReceipts,
  completeQualifiedPackage, verifyCompletedPackage } from './native-qualification.mjs';
import { createHash } from 'node:crypto';
import { TARGETS, sha256 } from './native-package.mjs';
const source = 'a'.repeat(40);
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'blink-validation-test-')); const build = join(root, 'build'); mkdirSync(build);
  const target = process.platform + '-' + process.arch; const suffix = target === 'win32-x64' ? '.exe' : '';
  for (const name of ['fixture', 'check-rtp', 'blink-codec-worker']) writeFileSync(join(build, name + suffix), name, { mode: 0o755 });
  const output = join(root, 'validation'); return { root, build, target, output, suffix, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
test('validation preparation creates only two synthetic helper files and a source/worker-bound receipt without replacing roots', () => {
  const f = fixture(); try {
    prepareValidation(f.build, f.output, f.target, source);
    const result = verifyValidation(f.output, f.target, source, sha256(Buffer.from('blink-codec-worker')));
    assert.deepEqual(Object.keys(result.files).sort(), [`check-rtp${f.suffix}`, `fixture${f.suffix}`]);
    assert.throws(() => prepareValidation(f.build, f.output, f.target, source));
  } finally { f.cleanup(); }
});
for (const change of ['source', 'worker', 'helper', 'extra']) test(`validation refuses ${change} identity mismatch`, () => {
  const f = fixture(); try {
    prepareValidation(f.build, f.output, f.target, source);
    if (change === 'helper') writeFileSync(join(f.output, 'fixture' + f.suffix), 'modified');
    if (change === 'extra') writeFileSync(join(f.output, 'unknown'), 'extra');
    assert.throws(() => verifyValidation(f.output, f.target, change === 'source' ? 'b'.repeat(40) : source,
      change === 'worker' ? 'b'.repeat(64) : sha256(Buffer.from('blink-codec-worker'))));
  } finally { f.cleanup(); }
});
test('publication aggregation requires exactly five successful qualifications for the same immutable tar', () => {
  const base = { schemaVersion: 2, package_name: 'synthetic-plugin', package_version: '1.0.0-beta3', source_sha: source, package_integrity: 'sha512-synthetic', source_bundle_sha256: 'e'.repeat(64), codec_receiver_verified: true,
    selections: [...QUALIFICATION_SELECTIONS] };
  const rows = TARGETS.map(target => ({ ...base, target, worker_sha256: 'c'.repeat(64), validation_receipt_sha256: 'd'.repeat(64) }));
  const workers = Object.fromEntries(TARGETS.map(target => [target, 'c'.repeat(64)]));
  validateQualificationReceipts(rows, source, base.package_integrity, base.source_bundle_sha256, workers, base.package_name, base.package_version);
  assert.throws(() => validateQualificationReceipts(rows, source, base.package_integrity, base.source_bundle_sha256, { ...workers, [TARGETS[0]]: 'e'.repeat(64) }, base.package_name, base.package_version));
  for (const changed of [rows.slice(1), [...rows, rows[0]], rows.map((row, i) => i ? row : { ...row, package_integrity: 'other' }),
    rows.map((row, i) => i ? row : { ...row, codec_receiver_verified: false }), rows.map((row, i) => i ? row : { ...row, selections: ['opus:16000'] })]) {
    assert.throws(() => validateQualificationReceipts(changed, source, base.package_integrity, base.source_bundle_sha256, workers, base.package_name, base.package_version));
  }
});

function completionFixture() {
  const root = mkdtempSync(join(tmpdir(), 'blink-completion-test-')), artifactDirectory = join(root, 'artifact'), qualifications = join(root, 'received');
  mkdirSync(artifactDirectory); mkdirSync(qualifications);
  const bytes = Buffer.from('synthetic exact qualified package');
  const receipt = { sha: source, name: 'synthetic-plugin', version: '1.0.0-beta3',
    integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'),
    native: { workers: Object.fromEntries(TARGETS.map(target => [target, sha256(Buffer.from(target))])), source_bundle_sha256: 'e'.repeat(64) } };
  writeFileSync(join(artifactDirectory, 'release.tgz'), bytes);
  writeFileSync(join(artifactDirectory, 'package-receipt.json'), JSON.stringify(receipt));
  for (const target of TARGETS) writeFileSync(join(qualifications, target + '.json'), JSON.stringify({ schemaVersion: 2, target,
    source_sha: source, package_name: receipt.name, package_version: receipt.version, package_integrity: receipt.integrity,
    source_bundle_sha256: receipt.native.source_bundle_sha256, worker_sha256: receipt.native.workers[target],
    validation_receipt_sha256: 'd'.repeat(64), codec_receiver_verified: true, selections: [...QUALIFICATION_SELECTIONS] }));
  const input = { artifactDirectory, qualificationDirectory: qualifications, sourceSha: source, mode: 'build-only',
    ref: 'refs/heads/codex/hsv-saved-clip-prototype', requestedVersion: '' };
  return { root, input, receipt, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
test('completion persists one read-only candidate with all five receipt/worker/source/mode bindings', () => {
  const f = completionFixture(); try {
    const completed = completeQualifiedPackage(f.input);
    assert.deepEqual(verifyCompletedPackage(f.input), completed);
    assert.equal(completed.mode, 'build-only'); assert.equal(completed.version, '1.0.0-beta3');
    assert.deepEqual(Object.keys(completed.qualification_receipts).sort(), [...TARGETS].sort());
    assert.deepEqual(completed.workers, f.receipt.native.workers);
    assert.deepEqual(JSON.parse(readFileSync(join(f.input.artifactDirectory, 'native-qualification-receipt.json'))), completed);
  } finally { f.cleanup(); }
});
for (const mutation of ['tar', 'source', 'mode', 'worker', 'receipt', 'missing', 'duplicate']) test(`completed candidate rejects altered ${mutation} evidence`, () => {
  const f = completionFixture(); try {
    completeQualifiedPackage(f.input);
    if (mutation === 'tar') writeFileSync(join(f.input.artifactDirectory, 'release.tgz'), 'changed');
    if (mutation === 'source') f.input.sourceSha = 'b'.repeat(40);
    if (mutation === 'mode') Object.assign(f.input, { mode: 'publish', ref: 'refs/heads/main', requestedVersion: f.receipt.version });
    if (mutation === 'worker') {
      f.receipt.native.workers[TARGETS[0]] = 'b'.repeat(64);
      writeFileSync(join(f.input.artifactDirectory, 'package-receipt.json'), JSON.stringify(f.receipt));
    }
    const file = join(f.input.artifactDirectory, 'qualifications', TARGETS[0] + '.json');
    if (mutation === 'missing') rmSync(file);
    if (mutation === 'receipt' || mutation === 'duplicate') {
      const row = JSON.parse(readFileSync(file));
      if (mutation === 'receipt') row.validation_receipt_sha256 = 'b'.repeat(64); else row.target = TARGETS[1];
      writeFileSync(file, JSON.stringify(row));
    }
    assert.throws(() => verifyCompletedPackage(f.input));
  } finally { f.cleanup(); }
});
