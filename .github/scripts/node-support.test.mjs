import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { URL } from 'node:url';
import semver from 'semver';
import { load as loadYaml } from 'js-yaml';

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));
const supported = ['22.23.4', '24.22.2', '26.13.0'];

test('package and locked engines support the current LTS set without EOL Node 20', () => {
  assert.deepEqual(lock.packages[''].engines, manifest.engines);
  for (const version of supported) assert.ok(semver.satisfies(version, manifest.engines.node), version);
  for (const version of ['20.19.0', '25.0.0', '27.0.0']) {
    assert.equal(semver.satisfies(version, manifest.engines.node), false, version);
  }
});

test('locked Homebridge and the canonical HAP test host support every current LTS', () => {
  for (const name of ['homebridge', '@homebridge/hap-nodejs']) {
    const host = lock.packages[`node_modules/${name}`];
    assert.ok(host, name);
    for (const version of supported) assert.ok(semver.satisfies(version, host.engines.node), `${name}: ${version}`);
  }
});

test('source CI exercises the supported LTS set and uploads coverage on a retained lane', () => {
  const workflow = loadYaml(readFileSync(new URL('../workflows/test.yml', import.meta.url), 'utf8'));
  const job = workflow.jobs.test;
  assert.deepEqual([...job.strategy.matrix['node-version']].sort((a, b) => a - b), [22, 24, 26]);
  const coverage = job.steps.find(step => step.uses?.startsWith('codecov/codecov-action@'));
  const lane = /^matrix\.node-version\s*==\s*(\d+)$/.exec(coverage?.if ?? '');
  assert.ok(lane, 'coverage must select one supported matrix lane');
  assert.ok([22, 24, 26].includes(Number(lane[1])));
});
