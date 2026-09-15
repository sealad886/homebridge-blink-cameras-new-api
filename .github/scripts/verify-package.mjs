import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { releaseTag } from './release-policy.mjs';

const root = process.cwd();
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
releaseTag(manifest.version);
assert.equal(lock.version, manifest.version);
assert.equal(lock.packages[''].version, manifest.version);
const sha = process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.match(sha, /^[a-f0-9]{40}$/);
const scratch = mkdtempSync(join(tmpdir(), 'blink-package-'));
try {
  const [initial] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', scratch], { encoding: 'utf8' }));
  const paths = initial.files.map((file) => file.path);
  for (const path of [manifest.main, manifest.types, 'config.schema.json', 'dist/homebridge-ui/server.js', 'dist/homebridge-ui/public/index.html', 'CHANGELOG.md', 'scripts/preuninstall.js']) {
    assert(paths.includes(path), `Package is missing ${path}`);
  }
  assert(!paths.some((path) => /(^|\/)(\.env|\.ssh|\.beads|node_modules|__tests__|logs)(\/|$)|\.(log|pem|key)$/.test(path)), 'Package contains private or development artifacts');
  execFileSync('tar', ['-xzf', join(scratch, initial.filename), '-C', scratch]);
  const packageRoot = join(scratch, 'package');
  const packedManifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  packedManifest.gitHead = sha;
  writeFileSync(join(packageRoot, 'package.json'), JSON.stringify(packedManifest, null, 2) + '\n');
  // Resolve the clean CI dependency installation while loading the actual packed entrypoint.
  symlinkSync(join(root, 'node_modules'), join(packageRoot, 'node_modules'), 'dir');
  const plugin = createRequire(join(packageRoot, 'package.json'))(join(packageRoot, manifest.main));
  assert.equal(typeof plugin, 'function', 'Packed plugin entrypoint is not loadable');
  const registrations = [];
  plugin({ registerPlatform: (...args) => registrations.push(args) });
  assert.equal(registrations.length, 1, 'Packed plugin does not register its platform');
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', scratch], { cwd: packageRoot, encoding: 'utf8' }));
  const destination = resolve(process.env.PACKAGE_OUTPUT ?? join(scratch, 'verified.tgz'));
  copyFileSync(join(scratch, packed.filename), destination);
  const receipt = { name: manifest.name, version: manifest.version, sha, integrity: packed.integrity, filename: destination };
  if (process.env.PACKAGE_RECEIPT) writeFileSync(process.env.PACKAGE_RECEIPT, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
