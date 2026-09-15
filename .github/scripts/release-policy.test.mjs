import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseTag, releaseNotes, registryMetadata, verifyPublished } from './release-policy.mjs';

for (const [version, tag] of [['0.10.0-alpha.0', 'alpha'], ['0.10.0-beta.2', 'beta'], ['0.10.0-rc.0', 'rc'], ['0.10.0', 'latest']]) {
  test(`routes ${version} to ${tag}`, () => assert.equal(releaseTag(version), tag));
}
for (const version of ['01.2.3', '1.2', '1.2.3-dev.0', '1.2.3-alpha', '1.2.3-rc.01', '1.2.3+build', '1.2.3\n', undefined]) {
  test(`rejects unsupported version ${version}`, () => assert.throws(() => releaseTag(version)));
}
test('extracts only exact version curated notes', () => {
  const notes = '- Fix authentication and restart persistence.';
  assert.equal(releaseNotes(`## [0.10.0-alpha.0] - 2026-09-15\n${notes}\n\n## 0.9.1\nOld notes.`, '0.10.0-alpha.0'), notes);
  assert.throws(() => releaseNotes('## 0.10.0\nStable changes only.', '0.10.0-rc.0'));
});
test('registry failures never mean version absent', async () => {
  for (const status of [401, 404, 429, 500]) await assert.rejects(registryMetadata('pkg', async () => ({ ok: false, status })), /Registry lookup failed/);
  await assert.rejects(registryMetadata('pkg', async () => { throw new Error('network'); }), /network/);
  await assert.rejects(registryMetadata('pkg', async () => ({ ok: true, json: async () => ({}) })), /Invalid registry/);
});
test('verified prerelease must preserve latest, SHA, integrity and channel', () => {
  const expected = { name: 'pkg', version: '0.10.0-rc.0', sha: 'abc', integrity: 'sha512-xyz', latestBefore: '0.9.1' };
  const valid = { versions: { [expected.version]: { name: 'pkg', gitHead: 'abc', dist: { integrity: 'sha512-xyz' } } }, 'dist-tags': { rc: expected.version, latest: '0.9.1' } };
  verifyPublished(valid, expected);
  for (const mutate of [
    (data) => { data['dist-tags'].latest = expected.version; },
    (data) => { data['dist-tags'].rc = '0.9.0'; },
    (data) => { data.versions[expected.version].gitHead = 'other'; },
    (data) => { data.versions[expected.version].dist.integrity = 'other'; },
  ]) {
    const data = structuredClone(valid);
    mutate(data);
    assert.throws(() => verifyPublished(data, expected));
  }
});
