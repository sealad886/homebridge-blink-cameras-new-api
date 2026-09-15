import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { registryMetadata, releaseTag, waitForTagRemoval } from './release-policy.mjs';

assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
assert(process.env.NODE_AUTH_TOKEN, 'NPM_MAINTENANCE_TOKEN is required for dist-tag maintenance; trusted publishing does not authorize this operation');
const { name } = JSON.parse(readFileSync('package.json', 'utf8'));
const stable = process.env.STABLE_VERSION;
assert.equal(releaseTag(stable), 'latest', 'Cleanup requires an accepted stable release');
const metadata = await registryMetadata(name);
assert.equal(metadata['dist-tags'].latest, stable, 'Accepted stable version must still be latest');
assert(metadata.versions[stable], 'Stable version is missing');
const tags = process.env.DIST_TAGS.split(',').map((value) => value.trim());
assert(tags.length > 0 && tags.every((tag) => ['alpha', 'beta', 'rc'].includes(tag)), 'Only alpha,beta,rc tags can be removed');
for (const tag of new Set(tags)) {
  if (metadata['dist-tags'][tag]) execFileSync('npm', ['dist-tag', 'rm', name, tag], { stdio: 'inherit' });
}
await waitForTagRemoval(name, tags, metadata);
console.log('Removed selected prerelease tags; preserved all published versions and latest.');
