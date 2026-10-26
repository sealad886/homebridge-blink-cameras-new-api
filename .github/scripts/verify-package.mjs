import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
import { releaseTag } from './release-policy.mjs';
import { collectSourceProof, sha256, verifyNativePackage, verifyPackageIdentity } from './native-package.mjs';

const root = process.cwd();
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
releaseTag(manifest.version);
assert.equal(lock.version, manifest.version);
assert.equal(lock.packages[''].version, manifest.version);
const sha = process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.match(sha, /^[a-f0-9]{40}$/);
// Ordinary JS matrix smoke can run before candidates exist. Release output may
// never take this path; the default always requires all five native targets.
const javascriptOnly = process.env.VERIFY_PACKAGE_JAVASCRIPT_ONLY === '1';
assert(!javascriptOnly || (!process.env.PACKAGE_OUTPUT && !process.env.PACKAGE_RECEIPT), 'Release output requires native verification');
const proof = javascriptOnly ? undefined : collectSourceProof(root, sha);
// npm 12 returns a package-name keyed object; earlier supported npm returns an array.
const packedResults = (output) => {
  const parsed = JSON.parse(output);
  const results = Array.isArray(parsed) ? parsed : Object.values(parsed);
  assert.equal(results.length, 1, 'Expected exactly one packed package');
  assert.equal(typeof results[0]?.filename, 'string', 'Missing packed artifact filename');
  return results;
};
const scratch = mkdtempSync(join(tmpdir(), 'blink-package-'));
try {
  const [initial] = packedResults(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', scratch], { encoding: 'utf8' }));
  const paths = initial.files.map((file) => file.path);
  for (const path of [manifest.main, manifest.types, 'config.schema.json', 'dist/homebridge-ui/server.js', 'dist/homebridge-ui/public/index.html', 'CHANGELOG.md', 'LICENSE', 'scripts/preuninstall.js', 'scripts/migrate-secure-media-config.cjs']) {
    assert(paths.includes(path), `Package is missing ${path}`);
  }
  assert(!paths.some((path) => /(^|\/)(\.env|\.ssh|\.beads|node_modules|__tests__|logs)(\/|$)|\.(log|pem|key)$/.test(path)), 'Package contains private or development artifacts');
  execFileSync('tar', ['-xzf', join(scratch, initial.filename), '-C', scratch]);
  const packageRoot = join(scratch, 'package');
  if (proof) verifyNativePackage(packageRoot, proof);
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
  const [packed] = packedResults(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', scratch], { cwd: packageRoot, encoding: 'utf8' }));
  const finalRoot = join(scratch, 'final'); mkdirSync(finalRoot);
  execFileSync('tar', ['-xzf', join(scratch, packed.filename), '-C', finalRoot]);
  const finalManifest = JSON.parse(readFileSync(join(finalRoot, 'package/package.json')));
  assert.equal(finalManifest.gitHead, sha);
  assert.equal(finalManifest.name, manifest.name); assert.equal(finalManifest.version, manifest.version);
  const native = proof ? verifyNativePackage(join(finalRoot, 'package'), proof) : undefined;
  const destination = resolve(process.env.PACKAGE_OUTPUT ?? join(scratch, 'verified.tgz'));
  copyFileSync(join(scratch, packed.filename), destination);
  const receipt = { name: manifest.name, version: manifest.version, sha, integrity: packed.integrity, filename: destination,
    ...(native ? { native: { targets: Object.keys(native.targets), manifest_sha256: native.manifest_sha256,
      workers: Object.fromEntries(Object.entries(native.targets).map(([target, item]) => [target, item.sha256])),
      source_bundle_sha256: native.source_bundle_sha256, distribution_receipt_sha256: sha256(readFileSync(join(finalRoot, 'package/native/runtime/distribution-receipt.json'))) } } : {}) };
  verifyPackageIdentity(destination, receipt, sha);
  if (process.env.PACKAGE_RECEIPT) writeFileSync(process.env.PACKAGE_RECEIPT, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
