import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const entry = resolve('.github/scripts/cleanup-tags.mjs');

function fixture({
  token = 'synthetic-maintenance-token',
  stableVersion = '0.9.1',
  distTags = 'alpha,rc',
  metadata,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'blink-cleanup-test-'));
  const state = {
    metadata: metadata ?? {
      name: 'test-package',
      versions: { '0.9.1': {}, '0.10.0-alpha.0': {}, '0.10.0-rc.0': {} },
      'dist-tags': { latest: '0.9.1', alpha: '0.10.0-alpha.0', rc: '0.10.0-rc.0' },
    },
    calls: [],
  };
  const statePath = join(root, 'state.json');
  writeFileSync(statePath, JSON.stringify(state));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'test-package' }));

  const bin = join(root, 'bin');
  mkdirSync(bin);
  const npmExecutable = `#!${process.execPath}\n` + `
const fs = require('node:fs');
const file = process.env.TEST_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
state.calls.push(['npm', ...args]);
if (args[0] === 'dist-tag' && args[1] === 'rm') delete state.metadata['dist-tags'][args[3]];
fs.writeFileSync(file, JSON.stringify(state));
`;
  writeFileSync(join(bin, 'npm'), npmExecutable, { mode: 0o755 });
  writeFileSync(join(root, 'fetch.cjs'), `const fs = require('node:fs'); global.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(process.env.TEST_STATE, 'utf8')).metadata });`);

  return {
    run: () => spawnSync(process.execPath, ['--require', join(root, 'fetch.cjs'), entry], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        TEST_STATE: statePath,
        NODE_AUTH_TOKEN: token,
        STABLE_VERSION: stableVersion,
        DIST_TAGS: distTags,
        GITHUB_REF: 'refs/heads/main',
      },
    }),
    state: () => JSON.parse(readFileSync(statePath, 'utf8')),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('cleanup fails closed without maintenance token', () => {
  const testCase = fixture({ token: '' });
  try {
    const result = testCase.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /NPM_MAINTENANCE_TOKEN is required/);
    assert.equal(testCase.state().calls.length, 0);
  } finally { testCase.cleanup(); }
});

test('cleanup rejects non allow-listed tags', () => {
  const testCase = fixture({ distTags: 'alpha,dev' });
  try {
    const result = testCase.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Only alpha,beta,rc tags can be removed/);
    assert.equal(testCase.state().calls.length, 0);
  } finally { testCase.cleanup(); }
});

test('cleanup only removes selected existing prerelease dist-tags', () => {
  const testCase = fixture({ distTags: 'alpha,beta,rc,rc' });
  try {
    const result = testCase.run();
    assert.equal(result.status, 0, result.stderr);
    const state = testCase.state();
    assert.deepEqual(state.calls, [
      ['npm', 'dist-tag', 'rm', 'test-package', 'alpha'],
      ['npm', 'dist-tag', 'rm', 'test-package', 'rc'],
    ]);
    assert.equal(state.metadata['dist-tags'].latest, '0.9.1');
    assert(state.metadata.versions['0.9.1']);
    assert(state.metadata.versions['0.10.0-alpha.0']);
    assert(state.metadata.versions['0.10.0-rc.0']);
  } finally { testCase.cleanup(); }
});
