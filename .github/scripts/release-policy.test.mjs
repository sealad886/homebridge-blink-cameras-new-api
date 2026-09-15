import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseTag, releaseNotes, registryMetadata, verifyPublished, waitForPublished, waitForTagRemoval, compareStableVersions, assertTrustedPublishing } from './release-policy.mjs';

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
test('rejects a long release heading without actual release notes', () => {
  for (const ending of ['', '\n', '\n  \n']) {
    assert.throws(() => releaseNotes('## [0.10.0-alpha.0] - 2026-09-15' + ending, '0.10.0-alpha.0'), /Release notes must describe/);
  }
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


function delayedRegistry(states) {
  let reads = 0;
  const delays = [];
  return {
    options: {
      readMetadata: async () => structuredClone(states[Math.min(reads++, states.length - 1)]),
      sleep: async (ms) => { delays.push(ms); },
      onPending: () => {},
    },
    reads: () => reads,
    delays,
  };
}

test('publication waits for independently propagating version and dist-tag', async () => {
  const expected = { name: 'pkg', version: '0.10.0-rc.0', sha: 'abc', integrity: 'sha512-xyz', latestBefore: '0.9.1' };
  const missing = { versions: {}, 'dist-tags': { latest: '0.9.1' } };
  const staleTag = { ...missing, versions: { [expected.version]: { name: 'pkg', gitHead: 'abc', dist: { integrity: 'sha512-xyz' } } } };
  const ready = { ...staleTag, 'dist-tags': { latest: '0.9.1', rc: expected.version } };
  const registry = delayedRegistry([missing, staleTag, ready]);
  assert.deepEqual(await waitForPublished(expected, registry.options), ready);
  assert.equal(registry.reads(), 3);
  assert.deepEqual(registry.delays, [30000, 30000]);
  const stuck = delayedRegistry([staleTag]);
  await assert.rejects(waitForPublished(expected, stuck.options), /Release dist-tag is incorrect/);
  assert.equal(stuck.reads(), 21);
  assert.deepEqual(stuck.delays, Array(20).fill(30000));
});

test('publication reports every 30-second propagation retry without real waiting', async () => {
  const expected = { name: 'pkg', version: '0.10.0-alpha.0', sha: 'abc', integrity: 'sha512-xyz', latestBefore: '0.9.1' };
  const missing = { versions: {}, 'dist-tags': { latest: '0.9.1' } };
  const ready = { versions: { [expected.version]: { name: 'pkg', gitHead: 'abc', dist: { integrity: 'sha512-xyz' } } }, 'dist-tags': { latest: '0.9.1', alpha: expected.version } };
  const registry = delayedRegistry([missing, missing, ready]);
  const progress = [];
  registry.options.onPending = (status) => progress.push(status);
  await waitForPublished(expected, registry.options);
  assert.deepEqual(progress, [
    { attempt: 1, elapsedMs: 0, intervalMs: 30000, attempts: 21 },
    { attempt: 2, elapsedMs: 30000, intervalMs: 30000, attempts: 21 },
  ]);
});

test('publication fails immediately on registry identity mismatch or network failure', async () => {
  const expected = { name: 'pkg', version: '0.10.0-alpha.0', sha: 'abc', integrity: 'sha512-xyz', latestBefore: '0.9.1' };
  const wrongIdentity = { versions: { [expected.version]: { name: 'pkg', gitHead: 'other', dist: { integrity: 'sha512-xyz' } } }, 'dist-tags': { latest: '0.9.1' } };
  const mismatch = delayedRegistry([wrongIdentity]);
  await assert.rejects(waitForPublished(expected, mismatch.options), /different source revision/);
  assert.equal(mismatch.reads(), 1);
  assert.deepEqual(mismatch.delays, []);
  const network = delayedRegistry([]);
  network.options.readMetadata = async () => { throw new Error('network unavailable'); };
  await assert.rejects(waitForPublished(expected, network.options), /network unavailable/);
  assert.deepEqual(network.delays, []);
});

test('cleanup waits for all removed tags and fails after bounded attempts', async () => {
  const before = { versions: { '0.9.1': {}, '0.10.0-rc.0': {} }, 'dist-tags': { latest: '0.9.1', alpha: '0.10.0-alpha.0', rc: '0.10.0-rc.0' } };
  const partial = { ...before, 'dist-tags': { latest: '0.9.1', rc: '0.10.0-rc.0' } };
  const ready = { ...before, 'dist-tags': { latest: '0.9.1' } };
  const registry = delayedRegistry([before, partial, ready]);
  assert.deepEqual(await waitForTagRemoval('pkg', ['alpha', 'rc'], before, registry.options), ready);
  assert.equal(registry.reads(), 3);
  assert.deepEqual(registry.delays, [5000, 5000]);
  const stuck = delayedRegistry([partial]);
  await assert.rejects(waitForTagRemoval('pkg', ['alpha', 'rc'], before, stuck.options), /Dist-tag still exists: rc/);
  assert.equal(stuck.reads(), 6);
  assert.equal(stuck.delays.length, 5);
});

test('cleanup still fails closed if latest or a published version changes while polling', async () => {
  const before = { versions: { '0.9.1': {} }, 'dist-tags': { latest: '0.9.1', rc: '0.10.0-rc.0' } };
  for (const changed of [
    { ...before, 'dist-tags': { latest: '0.9.0' } },
    { ...before, versions: {} },
  ]) {
    const registry = delayedRegistry([changed]);
    await assert.rejects(waitForTagRemoval('pkg', ['rc'], before, registry.options));
    assert.equal(registry.reads(), 1);
    assert.deepEqual(registry.delays, []);
  }
});


test('stable comparison prevents backwards latest while accepting equal and forward releases', () => {
  assert.equal(compareStableVersions('0.9.0', '0.9.1'), -1);
  assert.equal(compareStableVersions('0.9.1', '0.9.1'), 0);
  assert.equal(compareStableVersions('0.10.0', '0.9.1'), 1);
  assert.equal(compareStableVersions('1.0.0', '0.99.99'), 1);
  assert.throws(() => compareStableVersions('0.10.0-rc.0', '0.9.1'));
});

test('trusted publishing requires OIDC, supported npm and no token fallback', () => {
  const oidc = { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.test/oidc', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic' };
  assertTrustedPublishing(oidc, '11.5.1');
  assertTrustedPublishing(oidc, '12.0.0');
  assert.throws(() => assertTrustedPublishing({}, '11.5.1'), /OIDC is unavailable/);
  assert.throws(() => assertTrustedPublishing({ ...oidc, NODE_AUTH_TOKEN: 'XXXXX-XXXXX-XXXXX-XXXXX' }, '11.5.1'), /without an npm token fallback/);
  assert.throws(() => assertTrustedPublishing(oidc, '11.5.0'), /npm >=11.5.1/);
  assert.throws(() => assertTrustedPublishing(oidc, '10.9.0'), /npm >=11.5.1/);
  for (const variable of ['NODE_AUTH_TOKEN', 'NPM_TOKEN']) {
    assert.throws(() => assertTrustedPublishing({ ...oidc, [variable]: 'synthetic-old-token' }, '11.5.1'), /without an npm token fallback/);
  }
});
