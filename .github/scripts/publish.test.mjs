import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const entry = resolve('.github/scripts/publish.mjs');
function fixture({ existing = false, failRelease = false, badSha = false, badTag = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'blink-publish-test-'));
  const receipt = { name: 'test-package', version: '0.10.0-alpha.0', sha: 'a'.repeat(40), integrity: 'sha512-fixture', filename: join(root, 'package.tgz') };
  const record = { name: receipt.name, gitHead: badSha ? 'b'.repeat(40) : receipt.sha, dist: { integrity: receipt.integrity } };
  const state = { receipt, metadata: { name: receipt.name, versions: existing ? { [receipt.version]: record } : {}, 'dist-tags': { latest: '0.9.1', ...(existing ? { alpha: receipt.version } : {}) } }, calls: [], tag: badTag ? 'b'.repeat(40) : '', releases: [], failRelease };
  const statePath = join(root, 'state.json');
  writeFileSync(statePath, JSON.stringify(state));
  writeFileSync(join(root, 'receipt.json'), JSON.stringify(receipt));
  writeFileSync(join(root, 'CHANGELOG.md'), '## 0.10.0-alpha.0\n\n- Fix token persistence and diagnostic safety.\n');
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
  if (args[0] === 'publish') {
    state.metadata.versions[state.receipt.version] = { name: state.receipt.name, gitHead: state.receipt.sha, dist: { integrity: state.receipt.integrity } };
    state.metadata['dist-tags'][args[args.indexOf('--tag') + 1]] = state.receipt.version;
  } else if (args[0] === 'dist-tag') state.metadata['dist-tags'][args[3]] = state.receipt.version;
} else if (command === 'gh') {
  if (args[0] === 'api') output = JSON.stringify([state.releases]);
  else if (args[1] === 'create') {
    if (state.failRelease) { state.failRelease = false; status = 1; }
    else state.releases.push({ tag_name: args[2] });
  }
}
fs.writeFileSync(file, JSON.stringify(state));
process.stdout.write(output);
process.exit(status);
`;
  for (const command of ['git', 'npm', 'gh']) writeFileSync(join(bin, command), executable, { mode: 0o755 });
  writeFileSync(join(root, 'fetch.cjs'), `const fs = require('node:fs'); global.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(process.env.TEST_STATE, 'utf8')).metadata });`);
  return {
    run: () => spawnSync(process.execPath, ['--require', join(root, 'fetch.cjs'), entry], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: bin + ':' + process.env.PATH, TEST_STATE: statePath, NODE_AUTH_TOKEN: 'synthetic-test-token', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: receipt.sha, GITHUB_REPOSITORY: 'owner/repo', GITHUB_SERVER_URL: 'https://github.com', GITHUB_RUN_ID: '123', PACKAGE_RECEIPT: join(root, 'receipt.json'), RELEASE_VERSION: receipt.version } }),
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
    assert.equal(state.calls.filter(([command, action]) => command === 'npm' && action === 'publish').length, 1);
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
for (const options of [{ existing: true, badSha: true }, { badTag: true }]) {
  test(`rejects conflicting immutable release identity ${JSON.stringify(options)}`, () => {
    const testCase = fixture(options);
    try {
      assert.notEqual(testCase.run().status, 0);
      assert(!testCase.state().calls.some(([command]) => command === 'npm'));
    } finally { testCase.cleanup(); }
  });
}
