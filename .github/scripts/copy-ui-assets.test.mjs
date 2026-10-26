import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const helper = fileURLToPath(new URL('./copy-ui-assets.mjs', import.meta.url));

test('copies public assets recursively to the default build destination without shell tools', t => {
  const root = mkdtempSync(join(tmpdir(), 'blink assets & copy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'src/homebridge-ui/public');
  const destination = join(root, 'dist/homebridge-ui/public');
  mkdirSync(join(source, 'nested assets'), { recursive: true });
  const bytes = Buffer.from([0, 10, 13, 26, 128, 255]);
  writeFileSync(join(source, 'index.html'), '<html>public UI</html>');
  writeFileSync(join(source, 'nested assets/icon.bin'), bytes);
  writeFileSync(join(source, '.local'), 'top-level dotfiles excluded by the existing asset glob');
  writeFileSync(join(source, 'nested assets/.metadata'), 'nested directory contents retained');
  const run = () => spawnSync(process.execPath, [helper], {
    cwd: root, env: { ...process.env, PATH: '' }, encoding: 'utf8', timeout: 5000,
  });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(destination, 'index.html'), 'utf8'), '<html>public UI</html>');
  assert.deepEqual(readFileSync(join(destination, 'nested assets/icon.bin')), bytes);
  assert.equal(existsSync(join(destination, '.local')), false);
  assert.equal(readFileSync(join(destination, 'nested assets/.metadata'), 'utf8'), 'nested directory contents retained');
  writeFileSync(join(destination, 'index.html'), 'stale build');
  assert.equal(run().status, 0);
  assert.equal(readFileSync(join(destination, 'index.html'), 'utf8'), '<html>public UI</html>');
});
