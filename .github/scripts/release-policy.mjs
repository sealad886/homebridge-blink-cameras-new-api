import assert from 'node:assert/strict';

export function releaseTag(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/.exec(version);
  assert(match, `Unsupported release version: ${version}`);
  return match[4] ?? 'latest';
}

export function releaseNotes(changelog, version) {
  releaseTag(version);
  const sections = changelog.split(/^## /m).slice(1);
  const section = sections.find((entry) => entry.split('\n')[0].match(/^\[?([^\]\s]+)\]?/)?.[1] === version);
  assert(section, `CHANGELOG.md is missing a section for ${version}`);
  const body = section.slice(section.indexOf('\n') + 1).trim();
  assert(body.length > 20, 'Release notes must describe the release');
  return body;
}

export async function registryMetadata(name, fetcher = fetch) {
  const response = await fetcher(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(30000), headers: { accept: 'application/json' },
  });
  assert(response.ok, `Registry lookup failed: HTTP ${response.status}`);
  const metadata = await response.json();
  assert(metadata.name === name && metadata.versions && metadata['dist-tags'], 'Invalid registry metadata');
  return metadata;
}

export function verifyPublished(metadata, { name, version, sha, integrity, latestBefore }) {
  const published = metadata.versions[version];
  assert(published, 'Published version is missing from the registry');
  assert.equal(published.name, name);
  assert.equal(published.gitHead, sha, 'Registry version belongs to a different source revision');
  assert.equal(published.dist?.integrity, integrity, 'Registry integrity differs from the verified package');
  const tag = releaseTag(version);
  assert.equal(metadata['dist-tags'][tag], version, 'Release dist-tag is incorrect');
  if (tag !== 'latest') assert.equal(metadata['dist-tags'].latest, latestBefore, 'Prerelease changed latest');
}

async function waitForRegistry(name, ready, { readMetadata = registryMetadata, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let metadata;
  for (let attempt = 0; attempt < 6; attempt++) {
    metadata = await readMetadata(name);
    if (ready(metadata)) return metadata;
    if (attempt < 5) await sleep(5000);
  }
  return metadata;
}

export async function waitForPublished(expected, options) {
  const tag = releaseTag(expected.version);
  const metadata = await waitForRegistry(expected.name,
    (current) => Boolean(current.versions[expected.version]) && current['dist-tags'][tag] === expected.version,
    options);
  verifyPublished(metadata, expected);
  return metadata;
}

export async function waitForTagRemoval(name, tags, before, options) {
  const metadata = await waitForRegistry(name, (current) => {
    assert.equal(current['dist-tags'].latest, before['dist-tags'].latest, 'Cleanup changed latest');
    for (const version of Object.keys(before.versions)) assert(current.versions[version], `Published version disappeared: ${version}`);
    return tags.every((tag) => !current['dist-tags'][tag]);
  }, options);
  for (const tag of tags) assert(!metadata['dist-tags'][tag], `Dist-tag still exists: ${tag}`);
  return metadata;
}
