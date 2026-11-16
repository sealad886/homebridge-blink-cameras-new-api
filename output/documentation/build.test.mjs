import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildDocumentation } from './build.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const markedModule = process.env.BLINK_DOCS_MARKED_MODULE || path.resolve(directory, '../../tools/docs/node_modules/marked/lib/marked.esm.js');
const baseUrl = 'https://example.github.io/plugin/';
const article = 'output/articles/set-up-blink-cameras-in-apple-home/index.md';
const fixtureFiles = [article, 'docs/how-it-works.md', 'docs/authentication.md', 'docs/configuration.md', 'docs/streaming.md', 'docs/native-recording-config-migration.md', 'docs/troubleshooting.md', 'docs/debug_logging_spec.md', 'README.md', 'docs/README.md'];
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-docs-build-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '1.1.0-rc.0' }));
  for (const file of fixtureFiles) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), '# Guide\n\n## Details\n\nCurrent source text.\n');
  }
  const image = 'output/articles/set-up-blink-cameras-in-apple-home/images/example.png';
  await fs.mkdir(path.dirname(path.join(root, image)), { recursive: true });
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  await fs.writeFile(path.join(root, image), bytes);
  const siteDir = path.join(root, 'generated-site');
  return { root, image, bytes, siteDir, options: { root, siteDir, baseUrl, markedModule } };
}

test('public bundle relocates assets and links chapters, source anchors and canonical URLs', async (t) => {
  const { root, bytes, siteDir, options } = await fixture(t);
  await fs.writeFile(path.join(root, article), '# Setup\n\n[Configuration](../../../docs/configuration.md#details)\n\n[Canonical account](https://example.github.io/plugin/authentication/#details)\n\n[Contributor](../../../CONTRIBUTING.md)\n\n![Example](images/example.png)\n');
  await fs.writeFile(path.join(root, 'CONTRIBUTING.md'), '# Contribute\n');
  // Data next to the source must never become a public artifact implicitly.
  await fs.mkdir(path.join(root, '.rtfm'), { recursive: true });
  await fs.writeFile(path.join(root, '.rtfm', 'private.json'), 'private work state');
  const result = await buildDocumentation(options);
  assert.equal(result.chapters, 10);
  const home = await fs.readFile(path.join(siteDir, 'index.html'), 'utf8');
  assert.match(home, /href="configuration\/index\.html#details"/);
  assert.match(home, /href="authentication\/index\.html#details"/);
  assert.match(home, /href="https:\/\/github\.com\/sealad886\/homebridge-blink-cameras-new-api\/blob\/main\/CONTRIBUTING\.md"/);
  assert.match(home, /<link rel="canonical" href="https:\/\/example\.github\.io\/plugin\/">/);
  const imagePath = home.match(/<img src="(assets\/[^\"]+example\.png)"/)[1];
  assert.deepEqual(await fs.readFile(path.join(siteDir, imagePath)), bytes);
  const settings = await fs.readFile(path.join(siteDir, 'configuration/index.html'), 'utf8');
  assert.match(settings, /<h2 id="details">/);
  assert.match(settings, /href="\.\.\/index\.html"/);
  assert.match(settings, /<link rel="canonical" href="https:\/\/example\.github\.io\/plugin\/configuration\/">/);
  assert.doesNotMatch(settings, /\.\.\/\.\.\/docs\//);
  const manifest = JSON.parse(await fs.readFile(path.join(siteDir, 'build.json'), 'utf8'));
  assert.equal(manifest.version, '1.1.0-rc.0');
  assert.ok(manifest.files.every((file) => !file.startsWith('.rtfm') && !file.startsWith('docs/') && !file.startsWith('src/')));
  assert.equal(manifest.files.filter((file) => file.startsWith('assets/')).length, 1);
  assert.match(await fs.readFile(path.join(siteDir, 'sitemap.xml'), 'utf8'), /https:\/\/example.github.io\/plugin\/configuration\//);
  assert.match(await fs.readFile(path.join(siteDir, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/example.github.io\/plugin\/sitemap.xml/);
  assert.equal(await fs.readFile(path.join(siteDir, '.nojekyll'), 'utf8'), '');
});

test('standalone offline download embeds images and retains all chapter routes without checkout dependencies', async (t) => {
  const { root, siteDir, options } = await fixture(t);
  await fs.writeFile(path.join(root, article), '# Setup\n\n[Settings](../../../docs/configuration.md#details)\n\n![Example](images/example.png)\n');
  await buildDocumentation(options);
  const offline = await fs.readFile(path.join(siteDir, 'offline.html'), 'utf8');
  assert.match(offline, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(offline, /<link rel="canonical"/);
  assert.match(offline, /src="data:image\/png;base64,/);
  assert.match(offline, /href="#settings--details"/);
  assert.match(offline, /id="settings--details"/);
  assert.doesNotMatch(offline, /href="\.\.\/\.\.\//);
  assert.equal((offline.match(/<article class="chapter/g) || []).length, 10);
});

test('build refuses missing required images and unresolved included heading references', async (t) => {
  const { root, options } = await fixture(t);
  await fs.writeFile(path.join(root, article), '# Setup\n\n![Missing](images/missing.png)\n');
  await assert.rejects(buildDocumentation(options), /Missing or invalid documentation image/);
  await fs.writeFile(path.join(root, article), '# Setup\n\n[Missing section](../../../docs/configuration.md#missing-section)\n');
  await assert.rejects(buildDocumentation(options), /Missing included heading anchor: docs\/configuration\.md#missing-section/);
});

test('build uses current migration chapter and does not depend on deleted recording guide', async (t) => {
  const { root, siteDir, options } = await fixture(t);
  await assert.rejects(fs.access(path.join(root, 'docs/RECORDING.md')));
  await buildDocumentation(options);
  const migration = await fs.readFile(path.join(siteDir, 'migration/index.html'), 'utf8');
  assert.match(migration, /native-recording-config-migration\.md/);
  assert.doesNotMatch(await fs.readFile(path.join(siteDir, 'index.html'), 'utf8'), /docs\/RECORDING\.md/);
  // The original local reader remains an intentional output mode.
  const local = await buildDocumentation({ root, markedModule });
  assert.equal(local.mode, 'offline');
  assert.match(await fs.readFile(local.output, 'utf8'), /id="migration--details"/);
});

test('rebuilding owns only generated output and preserves unmanaged files', async (t) => {
  const { root, siteDir, options } = await fixture(t);
  await buildDocumentation(options);
  const first = await fs.readFile(path.join(siteDir, 'index.html'), 'utf8');
  await buildDocumentation(options);
  assert.equal(await fs.readFile(path.join(siteDir, 'index.html'), 'utf8'), first);
  await fs.writeFile(path.join(siteDir, 'operator-note.txt'), 'keep this data');
  await assert.rejects(buildDocumentation(options), /unmanaged file: operator-note.txt/);
  assert.equal(await fs.readFile(path.join(siteDir, 'operator-note.txt'), 'utf8'), 'keep this data');
  await assert.rejects(buildDocumentation({ ...options, siteDir: root }), /must not contain the source repository/);
});
