import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Verify the downloaded package before a job with publishing credentials uses it.
 * The builder's absolute path is never trusted in the publishing job.
 */
export function verifyReleaseArtifact({ receiptPath, artifactDirectory, expectedSha, expectedVersion }) {
  assert(artifactDirectory, 'PACKAGE_ARTIFACT_DIR is required');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(receipt.name, manifest.name, 'Artifact package name differs from source');
  assert.equal(receipt.version, manifest.version, 'Artifact version differs from source');
  assert.equal(receipt.version, expectedVersion, 'Requested version differs from artifact');
  assert.equal(receipt.sha, expectedSha, 'Artifact source differs from workflow revision');
  assert.equal(typeof receipt.integrity, 'string');
  assert.match(receipt.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/);
  const filename = join(artifactDirectory, 'release.tgz');
  const integrity = 'sha512-' + createHash('sha512').update(readFileSync(filename)).digest('base64');
  assert.equal(integrity, receipt.integrity, 'Downloaded package integrity differs from verified build');
  return { ...receipt, filename };
}
