import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

for (const path of [
  'native/dependencies/prepare.py',
  'native/dependencies/package.py',
  'native/dependencies/licenses/opus-COPYING',
]) {
  test(`Windows checkout preserves exact native source bytes: ${path}`, () => {
    const blob = execFileSync('git', ['show', `${head}:${path}`], { cwd: root });
    const checkout = execFileSync('git', ['-c', 'core.autocrlf=true', 'cat-file', '--filters', `${head}:${path}`], { cwd: root });
    assert.ok(checkout.equals(blob), `${path}: checkout conversion changed the bytes used for source identity`);
  });
}
