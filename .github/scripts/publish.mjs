import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { releaseTag, releaseNotes, registryMetadata, waitForPublished, compareStableVersions, assertTrustedPublishing } from './release-policy.mjs';
import { verifyReleaseArtifact } from './release-artifact.mjs';

assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Releases must run from main');
const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
assert(/^[1-9]\d*$/.test(runAttempt), 'GitHub workflow attempt is required');

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
const workflow = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const gitApi = `repos/${process.env.GITHUB_REPOSITORY}/git`;
const findRef = (ref) => JSON.parse(run('gh', ['api', '--paginate', '--slurp',
  `${gitApi}/matching-refs/${ref.slice('refs/'.length)}`])).flat().find((item) => item.ref === ref);
assertTrustedPublishing(process.env, run('npm', ['--version']));
const metadata = await registryMetadata(name);
const currentLatest = metadata['dist-tags'].latest;
assert.equal(releaseTag(currentLatest), 'latest', 'Existing latest must be a stable release');
if (tag === 'latest') assert(compareStableVersions(version, currentLatest) >= 0, 'Stable publication cannot move latest backwards');

// Reserve this version before dispatching npm. The custom ref is not a release tag.
const attemptName = `npm-upload-attempts/v${version}`;
const attemptRef = `refs/${attemptName}`;
const attemptedRef = findRef(attemptRef);
let latestBefore = currentLatest;
if (attemptedRef) {
  assert.equal(attemptedRef.object?.type, 'tag', 'npm upload attempt must reference an annotated record');
  assert.match(attemptedRef.object.sha, /^[a-f0-9]{40}$/, 'Invalid npm upload attempt reference');
  const annotation = JSON.parse(run('gh', ['api', `${gitApi}/tags/${attemptedRef.object.sha}`]));
  assert.equal(annotation.sha, attemptedRef.object.sha, 'GitHub returned a different npm upload attempt object');
  assert.equal(annotation.tag, attemptName, 'npm upload attempt record belongs to another reference');
  assert.equal(annotation.object?.type, 'commit', 'npm upload attempt must bind a source commit');
  assert.equal(annotation.object.sha, sha, 'npm upload attempt belongs to a different source revision');
  const recorded = JSON.parse(annotation.message);
  assert.equal(recorded.schemaVersion, 1, 'Unsupported npm upload attempt record');
  assert.equal(recorded.name, name, 'npm upload attempt belongs to a different package');
  assert.equal(recorded.version, version, 'npm upload attempt belongs to a different version');
  assert.equal(recorded.sha, sha, 'npm upload attempt records a different source revision');
  assert.equal(recorded.integrity, integrity, 'npm upload attempt belongs to a different qualified artifact');
  assert.equal(releaseTag(recorded.latestBefore), 'latest', 'Invalid recorded stable latest');
  latestBefore = recorded.latestBefore;
  if (tag !== 'latest') assert.equal(currentLatest, latestBefore, 'Prerelease changed latest');
}

const existing = metadata.versions[version];
if (existing) {
  assert.equal(existing.gitHead, sha, 'Version already exists from a different revision; bump the version');
  assert.equal(existing.dist?.integrity, integrity, 'Existing version does not match the verified artifact');
  if (!attemptedRef && runAttempt === '1') {
    assert.equal(metadata['dist-tags'][tag], version, 'Existing version has a different dist-tag; explicit authenticated maintenance is required before recovery');
  }
}
// Read tag state through GitHub; checkout credentials are not persisted.
const tagRef = `refs/tags/v${version}`;
const existingTag = findRef(tagRef);
if (existingTag) {
  const tagSha = existingTag.object?.type === 'commit'
    ? existingTag.object.sha
    : run('git', ['ls-remote', 'origin', `${tagRef}^{}`]).split(/\s+/)[0];
  assert.match(tagSha, /^[a-f0-9]{40}$/, 'Release tag must resolve to a commit');
  assert.equal(tagSha, sha, 'Release tag points to another revision');
}
if (!existing && !existingTag && !attemptedRef && runAttempt === '1') {
  assert.equal(run('git', ['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0], sha, 'Source is no longer the main branch head; re-run gates on current main');
  const intent = { schemaVersion: 1, name, version, sha, integrity, latestBefore, workflow };
  const annotation = JSON.parse(run('gh', ['api', '-X', 'POST', `${gitApi}/tags`,
    '-f', `tag=${attemptName}`, '-f', `message=${JSON.stringify(intent)}`, '-f', `object=${sha}`, '-f', 'type=commit']));
  assert.match(annotation.sha, /^[a-f0-9]{40}$/, 'Invalid npm upload attempt object');
  assert.equal(annotation.tag, attemptName, 'GitHub returned a different npm upload attempt name');
  assert.equal(annotation.object?.type, 'commit', 'GitHub did not bind the npm upload attempt to a commit');
  assert.equal(annotation.object.sha, sha, 'GitHub did not bind the npm upload attempt to the verified source');
  assert.deepEqual(JSON.parse(annotation.message), intent, 'GitHub did not preserve the npm upload attempt evidence');
  const created = JSON.parse(run('gh', ['api', '-X', 'POST', `${gitApi}/refs`,
    '-f', `ref=${attemptRef}`, '-f', `sha=${annotation.sha}`]));
  assert.equal(created.ref, attemptRef, 'GitHub did not confirm the npm upload attempt reference');
  assert.equal(created.object?.type, 'tag', 'GitHub did not confirm the annotated npm upload attempt');
  assert.equal(created.object.sha, annotation.sha, 'GitHub did not confirm the expected npm upload attempt object');
  const recordUploadStatus = (status) => writeFileSync('npm-upload-attempt.json',
    JSON.stringify({ ...intent, status }, null, 2) + '\n');
  recordUploadStatus('attempt-recorded');
  console.log(`Submitting qualified package ${name}@${version} to npm.`);
  try {
    run('npm', ['publish', filename, '--ignore-scripts', '--access', 'public', '--tag', tag,
      '--registry', 'https://registry.npmjs.org', '--fetch-retries=0']);
  } catch (cause) {
    recordUploadStatus('unconfirmed');
    throw new Error('npm upload did not confirm acceptance. Recover by rerunning this workflow for registry readback only.', { cause });
  }
  recordUploadStatus('accepted');
  console.log('npm accepted the upload. Waiting for registry visibility.');
} else {
  console.log(`Checking registry visibility for ${name}@${version} in readback-only mode.`);
}
await waitForPublished({ name, version, sha, integrity, latestBefore });
console.log('Registry identity and dist-tag verified. Reconciling GitHub release records.');
if (!existingTag) {
  run('gh', ['api', '--silent', '-X', 'POST',
    `${gitApi}/refs`,
    '-f', `ref=${tagRef}`, '-f', `sha=${sha}`]);
}
const receiptText = JSON.stringify({ ...receipt, filename: undefined, npmTag: tag, latestBefore, workflow }, null, 2);
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
