import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { QUALIFICATION_SELECTIONS, prepareValidation, verifyValidation, validateQualificationReceipts } from './native-qualification.mjs';
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
  const base = { schemaVersion: 1, source_sha: source, package_integrity: 'sha512-synthetic', source_bundle_sha256: 'e'.repeat(64), codec_receiver_verified: true,
    selections: [...QUALIFICATION_SELECTIONS] };
  const rows = TARGETS.map(target => ({ ...base, target, worker_sha256: 'c'.repeat(64), validation_receipt_sha256: 'd'.repeat(64) }));
  validateQualificationReceipts(rows, source, base.package_integrity, base.source_bundle_sha256);
  const workers = Object.fromEntries(TARGETS.map(target => [target, 'c'.repeat(64)]));
  validateQualificationReceipts(rows, source, base.package_integrity, base.source_bundle_sha256, workers);
  assert.throws(() => validateQualificationReceipts(rows, source, base.package_integrity, base.source_bundle_sha256, { ...workers, [TARGETS[0]]: 'e'.repeat(64) }));
  for (const changed of [rows.slice(1), [...rows, rows[0]], rows.map((row, i) => i ? row : { ...row, package_integrity: 'other' }),
    rows.map((row, i) => i ? row : { ...row, codec_receiver_verified: false }), rows.map((row, i) => i ? row : { ...row, selections: ['opus:16000'] })]) {
    assert.throws(() => validateQualificationReceipts(changed, source, base.package_integrity, base.source_bundle_sha256));
  }
});
