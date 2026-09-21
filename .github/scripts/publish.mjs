import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { releaseTag, releaseNotes, registryMetadata, waitForPublished, compareStableVersions, assertTrustedPublishing } from './release-policy.mjs';
import { verifyReleaseArtifact } from './release-artifact.mjs';

assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Releases must run from main');

const receipt = verifyReleaseArtifact({
  receiptPath: process.env.PACKAGE_RECEIPT,
  artifactDirectory: process.env.PACKAGE_ARTIFACT_DIR,
  expectedSha: process.env.GITHUB_SHA,
  expectedVersion: process.env.RELEASE_VERSION,
});
const { name, version, sha, integrity, filename } = receipt;
assert.equal(sha, process.env.GITHUB_SHA);
assert.equal(version, process.env.RELEASE_VERSION, 'Requested version differs from the source manifest');
const tag = releaseTag(version);
const notes = releaseNotes(readFileSync('CHANGELOG.md', 'utf8'), version);
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
assertTrustedPublishing(process.env, run('npm', ['--version']));
const metadata = await registryMetadata(name);
const latestBefore = metadata['dist-tags'].latest;
if (tag !== 'latest') assert.equal(releaseTag(latestBefore), 'latest', 'Existing latest must be a stable release before prerelease publication');
if (tag === 'latest') assert(compareStableVersions(version, latestBefore) >= 0, 'Stable publication cannot move latest backwards');
const existing = metadata.versions[version];
if (existing) {
  assert.equal(existing.gitHead, sha, 'Version already exists from a different revision; bump the version');
  assert.equal(existing.dist?.integrity, integrity, 'Existing version does not match the verified artifact');
  assert.equal(metadata['dist-tags'][tag], version, 'Existing version has a different dist-tag; explicit authenticated maintenance is required before recovery');
}
// Read tag state through GitHub; checkout credentials are not persisted.
const tagRef = `refs/tags/v${version}`;
const tagMatches = JSON.parse(run('gh', ['api', '--paginate', '--slurp',
  `repos/${process.env.GITHUB_REPOSITORY}/git/matching-refs/tags/v${version}`])).flat();
const existingTag = tagMatches.find((item) => item.ref === tagRef);
if (existingTag) {
  const tagSha = existingTag.object?.type === 'commit'
    ? existingTag.object.sha
    : run('git', ['ls-remote', 'origin', `${tagRef}^{}`]).split(/\s+/)[0];
  assert.match(tagSha, /^[a-f0-9]{40}$/, 'Release tag must resolve to a commit');
  assert.equal(tagSha, sha, 'Release tag points to another revision');
}
if (!existing) {
  assert.equal(run('git', ['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0], sha, 'Source is no longer the main branch head; re-run gates on current main');
}
if (!existing) run('npm', ['publish', filename, '--ignore-scripts', '--access', 'public', '--tag', tag, '--registry', 'https://registry.npmjs.org']);
// Reruns finish a partially completed publication without republishing an immutable version.
await waitForPublished({ name, version, sha, integrity, latestBefore });
if (!existingTag) {
  run('gh', ['api', '--silent', '-X', 'POST',
    `repos/${process.env.GITHUB_REPOSITORY}/git/refs`,
    '-f', `ref=${tagRef}`, '-f', `sha=${sha}`]);
}
const receiptText = JSON.stringify({ ...receipt, filename: undefined, npmTag: tag, latestBefore, workflow: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` }, null, 2);
writeFileSync('release-receipt.json', receiptText + '\n');
writeFileSync('release-notes.md', `${notes}\n\n## Verified artifact\n\n\`\`\`json\n${receiptText}\n\`\`\`\n`);
// gh api --paginate fails on transport/auth failures rather than treating them as missing releases.
const releases = JSON.parse(run('gh', ['api', '--paginate', '--slurp', `repos/${process.env.GITHUB_REPOSITORY}/releases`]));
let release = releases.flat().find((item) => item.tag_name === `v${version}`);
if (release) {
  assert.equal(release.target_commitish, sha, 'Existing GitHub release belongs to a different source revision');
  assert.equal(release.prerelease, tag !== 'latest', 'Existing GitHub release has the wrong prerelease state');
  if (release.immutable) {
    console.log('Existing immutable release verified; preserving release receipt through this workflow run artifact.');
  }
} else {
  run('gh', ['release', 'create', `v${version}`, '--draft', '--verify-tag', '--target', sha, '--title', `v${version}`, '--notes-file', 'release-notes.md', '--latest=false', ...(tag !== 'latest' ? ['--prerelease'] : [])]);
  release = { immutable: false };
}
if (!release.immutable) {
  run('gh', ['release', 'upload', `v${version}`, 'release-receipt.json', '--clobber']);
  run('gh', ['release', 'edit', `v${version}`, '--draft=false', '--notes-file', 'release-notes.md', '--prerelease=' + (tag !== 'latest'), ...(tag !== 'latest' ? ['--latest=false'] : ['--latest'])]);
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Published ${name}@${version} (${tag}) from ${sha}.\n\nIntegrity: \`${integrity}\`\n`);
