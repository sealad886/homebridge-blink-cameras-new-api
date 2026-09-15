import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const entry = resolve('.github/scripts/publish.mjs');
function fixture({ existing = false, existingImmutableRelease = false, failRelease = false, badSha = false, badTag = false, staleChannel = false, version = '0.10.0-alpha.0', latest = '0.9.1' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'blink-publish-test-'));
  const receipt = { name: 'test-package', version, sha: 'a'.repeat(40), integrity: 'sha512-fixture', filename: join(root, 'package.tgz') };
  const record = { name: receipt.name, gitHead: badSha ? 'b'.repeat(40) : receipt.sha, dist: { integrity: receipt.integrity } };
  const release = existingImmutableRelease ? {
    tag_name: `v${receipt.version}`,
    target_commitish: receipt.sha,
    prerelease: true,
    immutable: true,
  } : null;
  const state = { receipt, metadata: { name: receipt.name, versions: existing ? { [receipt.version]: record } : {}, 'dist-tags': { latest, ...(existing && !staleChannel ? { alpha: receipt.version } : {}) } }, calls: [], tag: (badTag ? 'b'.repeat(40) : existingImmutableRelease ? receipt.sha : ''), releases: release ? [release] : [], failRelease };
  const statePath = join(root, 'state.json');
  writeFileSync(statePath, JSON.stringify(state));
  writeFileSync(join(root, 'receipt.json'), JSON.stringify(receipt));
  writeFileSync(join(root, 'CHANGELOG.md'), '## ' + version + '\n\n- Fix token persistence and diagnostic safety.\n');
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const executable = `#!${process.execPath}\n` + `
const fs = require('node:fs');
const path = require('node:path');
const file = process.env.TEST_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
state.calls.push([command, ...args]);
let output = '', status = 0;
if (command === 'git') {
  if (args[0] === 'tag' && args[1] === '--list') output = state.tag ? 'v' + state.receipt.version : '';
  else if (args[0] === 'rev-parse') output = state.tag;
  else if (args[0] === 'tag') state.tag = args[2];
  else if (args[0] === 'ls-remote') output = state.receipt.sha + '\\trefs/heads/main';
} else if (command === 'npm') {
  if (args[0] === '--version') output = '11.5.1';
  else if (args[0] === 'publish') {
    state.metadata.versions[state.receipt.version] = { name: state.receipt.name, gitHead: state.receipt.sha, dist: { integrity: state.receipt.integrity } };
    state.metadata['dist-tags'][args[args.indexOf('--tag') + 1]] = state.receipt.version;
  } else if (args[0] === 'dist-tag') state.metadata['dist-tags'][args[3]] = state.receipt.version;
} else if (command === 'gh') {
  if (args[0] === 'api') output = JSON.stringify([state.releases]);
  else if (args[1] === 'create') {
    if (state.failRelease) { state.failRelease = false; status = 1; }
    else state.releases.push({ tag_name: args[2], target_commitish: state.receipt.sha, prerelease: args.includes('--prerelease'), immutable: false, draft: true, assets: [] });
  } else if (args[1] === 'upload') {
    const release = state.releases.find((item) => item.tag_name === args[2]);
    if (!release || release.immutable) status = 1;
    else release.assets.push(args[3]);
  } else if (args[1] === 'edit') {
    const release = state.releases.find((item) => item.tag_name === args[2]);
    if (!release || release.immutable) status = 1;
    else {
      release.draft = !args.includes('--draft=false');
      release.prerelease = args.includes('--prerelease=true');
    }
  }
}
fs.writeFileSync(file, JSON.stringify(state));
process.stdout.write(output);
process.exit(status);
`;
  for (const command of ['git', 'npm', 'gh']) writeFileSync(join(bin, command), executable, { mode: 0o755 });
  writeFileSync(join(root, 'fetch.cjs'), `const fs = require('node:fs'); global.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(process.env.TEST_STATE, 'utf8')).metadata });`);
  return {
    run: () => spawnSync(process.execPath, ['--require', join(root, 'fetch.cjs'), entry], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: bin + ':' + process.env.PATH, TEST_STATE: statePath, NODE_AUTH_TOKEN: '', NPM_TOKEN: '', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.test/oidc', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-oidc-token', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: receipt.sha, GITHUB_REPOSITORY: 'owner/repo', GITHUB_SERVER_URL: 'https://github.com', GITHUB_RUN_ID: '123', PACKAGE_RECEIPT: join(root, 'receipt.json'), RELEASE_VERSION: receipt.version } }),
    state: () => JSON.parse(readFileSync(statePath, 'utf8')),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('publication preserves latest and records exact source and artifact', () => {
  const testCase = fixture();
  try {
    const result = testCase.run();
    assert.equal(result.status, 0, result.stderr);
    const state = testCase.state();
    assert.equal(state.metadata['dist-tags'].latest, '0.9.1');
    assert.equal(state.tag, state.receipt.sha);
    assert.equal(state.releases[0].tag_name, 'v0.10.0-alpha.0');
    assert.equal(state.releases[0].draft, false);
    assert.deepEqual(state.releases[0].assets, ['release-receipt.json']);
    const upload = state.calls.findIndex(([command, group, action]) => command === 'gh' && group === 'release' && action === 'upload');
    const publish = state.calls.findIndex(([command, group, action, , draft]) => command === 'gh' && group === 'release' && action === 'edit' && draft === '--draft=false');
    const create = state.calls.find(([command, group, action]) => command === 'gh' && group === 'release' && action === 'create');
    assert(upload >= 0 && publish > upload, 'release receipt uploads before final publication');
    assert(create.includes('--latest=false'), 'draft creation cannot become latest');
    assert(state.calls[publish].includes('--latest=false'));
    assert.equal(state.calls.filter(([command, action]) => command === 'npm' && action === 'publish').length, 1);
  } finally { testCase.cleanup(); }
});
test('stable release selects latest only after its receipt upload', () => {
  const testCase = fixture({ version: '0.10.0' });
  try {
    const result = testCase.run();
    assert.equal(result.status, 0, result.stderr);
    const state = testCase.state();
    const create = state.calls.find(([command, group, action]) => command === 'gh' && group === 'release' && action === 'create');
    const publish = state.calls.find(([command, group, action, , draft]) => command === 'gh' && group === 'release' && action === 'edit' && draft === '--draft=false');
    assert(create.includes('--latest=false'));
    assert(publish.includes('--latest'));
    assert.equal(state.releases[0].prerelease, false);
  } finally { testCase.cleanup(); }
});
test('recovery validates an immutable release and leaves it unchanged', () => {
  const testCase = fixture({ existing: true, existingImmutableRelease: true });
  try {
    const result = testCase.run();
    assert.equal(result.status, 0, result.stderr);
    const state = testCase.state();
    assert.equal(state.calls.filter(([command, action]) => command === 'npm' && action === 'publish').length, 0);
    assert(!state.calls.some(([command, group, action]) => command === 'gh' && group === 'release' && ['create', 'edit', 'upload'].includes(action)));
    assert.match(readFileSync(join(resolve(state.receipt.filename, '..'), 'release-receipt.json'), 'utf8'), /test-package/);
  } finally { testCase.cleanup(); }
});
test('rerun recovers GitHub release after successful npm publication', () => {
  const testCase = fixture({ failRelease: true });
  try {
    assert.notEqual(testCase.run().status, 0);
    const result = testCase.run();
    assert.equal(result.status, 0, result.stderr);
    const state = testCase.state();
    assert.equal(state.calls.filter(([command, action]) => command === 'npm' && action === 'publish').length, 1);
    assert.equal(state.releases.length, 1);
  } finally { testCase.cleanup(); }
});
for (const options of [{ existing: true, badSha: true }, { badTag: true }, { existing: true, staleChannel: true }, { version: '0.9.0', latest: '0.9.1' }]) {
  test(`rejects conflicting immutable release identity ${JSON.stringify(options)}`, () => {
    const testCase = fixture(options);
    try {
      assert.notEqual(testCase.run().status, 0);
      assert(!testCase.state().calls.some(([command, action]) => command === 'npm' && action !== '--version'));
    } finally { testCase.cleanup(); }
  });
}
