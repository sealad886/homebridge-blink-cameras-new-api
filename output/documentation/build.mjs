#!/usr/bin/env node
// Compile trusted repository Markdown into the offline reader or public Pages bundle.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(directory, '../..');
const repository = 'https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/';
const rawRepository = 'https://raw.githubusercontent.com/sealad886/homebridge-blink-cameras-new-api/main/';
const defaultBase = 'https://sealad886.github.io/homebridge-blink-cameras-new-api/';
const manifestName = 'build.json';
const generator = 'homebridge-blink-documentation-v1';
const chapterDefinitions = [
  { id: 'start', path: '', title: 'Get started', subtitle: 'Install, connect, view and record', file: 'output/articles/set-up-blink-cameras-in-apple-home/index.md', group: 'The essentials' },
  { id: 'understand', path: 'how-it-works/', title: 'How it works', subtitle: 'Understand the video paths', file: 'docs/how-it-works.md', group: 'The essentials' },
  { id: 'account', path: 'authentication/', title: 'Connect your account', subtitle: 'Sign-in and session recovery', file: 'docs/authentication.md', group: 'The essentials' },
  { id: 'settings', path: 'configuration/', title: 'Camera settings', subtitle: 'Names, controls and defaults', file: 'docs/configuration.md', group: 'Make it yours' },
  { id: 'live', path: 'streaming/', title: 'Live video & sound', subtitle: 'Requirements and picture quality', file: 'docs/streaming.md', group: 'Make it yours' },
  { id: 'migration', path: 'migration/', title: 'Upgrade an existing setup', subtitle: 'One-time configuration migration', file: 'docs/native-recording-config-migration.md', group: 'Make it yours' },
  { id: 'help', path: 'troubleshooting/', title: 'Troubleshooting', subtitle: 'Diagnose a connection or clip', file: 'docs/troubleshooting.md', group: 'When you need it' },
  { id: 'logging', path: 'diagnostics/', title: 'Diagnostic logging', subtitle: 'Bounded, redacted evidence', file: 'docs/debug_logging_spec.md', group: 'When you need it' },
  { id: 'overview', path: 'overview/', title: 'Plugin reference', subtitle: 'Capabilities and installation', file: 'README.md', group: 'Reference' },
  { id: 'map', path: 'documentation-map/', title: 'Documentation map', subtitle: 'Contributing and topic owners', file: 'docs/README.md', group: 'Reference' },
];
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const plain = (value) => value.replace(/<[^>]*>/g, '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_~]/g, '').replace(/&amp;/g, '&');
const slug = (value) => plain(value).toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-');
const encodePath = (value) => value.split('/').map(encodeURIComponent).join('/');
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
function within(root, file) {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function relativeUrl(from, to) {
  return encodePath(path.posix.relative(path.posix.dirname(from), to) || path.posix.basename(to));
}
function normalizedBase(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password) throw new Error('--base-url must be an HTTPS site URL without credentials, query or fragment');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}
function diagram(text) {
  const lanes = []; let lane;
  for (const line of text.split('\n')) {
    const group = line.match(/^\s*subgraph\s+\w+\[([^\]]+)\]/);
    if (group) { lane = { title: group[1], nodes: [] }; lanes.push(lane); continue; }
    if (/^\s*end\s*$/.test(line)) { lane = null; continue; }
    if (lane) for (const match of line.matchAll(/\w+\[([^\]]+)\]/g)) if (!lane.nodes.includes(match[1])) lane.nodes.push(match[1]);
  }
  if (!lanes.length) return '<p class="diagram-note">The surrounding text explains this flow.</p>';
  return '<figure class="video-flow">' + lanes.map((item) => '<div><h3>' + escape(item.title) + '</h3><ol>' + item.nodes.map((node) => '<li>' + escape(node) + '</li>').join('') + '</ol></div>').join('') + '<figcaption>The surrounding guide explains the timing and permissions for each video path.</figcaption></figure>';
}
function validateHtml(html, label) {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  if (new Set(ids).size !== ids.length) throw new Error('Generated duplicate HTML IDs in ' + label);
  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) if (!ids.includes(target)) throw new Error('Unresolved reader anchor in ' + label + ': ' + target);
}
async function writeSite(siteDir, files, metadata) {
  await fs.mkdir(siteDir, { recursive: true });
  let previous;
  try { previous = JSON.parse(await fs.readFile(path.join(siteDir, manifestName), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Site directory has an invalid build manifest: ' + error.message); }
  const existing = await fs.readdir(siteDir, { recursive: true, withFileTypes: true });
  const owned = new Set(previous?.generator === generator && Array.isArray(previous.files) ? previous.files : []);
  if (previous && previous.generator !== generator) throw new Error('Refusing to overwrite an unrecognized site directory');
  for (const item of existing) {
    const parent = item.parentPath ?? item.path;
    const relative = path.relative(siteDir, path.join(parent, item.name)).split(path.sep).join('/');
    if (item.isSymbolicLink()) throw new Error('Refusing a symlink in site output: ' + relative);
    if (item.isFile() && relative !== manifestName && !owned.has(relative)) throw new Error('Site directory contains an unmanaged file: ' + relative);
  }
  for (const [file, content] of files) {
    const target = path.join(siteDir, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  for (const file of owned) {
    const target = path.resolve(siteDir, file);
    if (!within(siteDir, target)) throw new Error('Invalid path in previous site manifest');
    if (!files.has(file)) await fs.rm(target, { force: true });
  }
  await fs.writeFile(path.join(siteDir, manifestName), JSON.stringify({ generator, ...metadata, files: [...files.keys()].sort() }, null, 2) + '\n');
}

export async function buildDocumentation(options = {}) {
  const root = await fs.realpath(path.resolve(options.root ?? defaultRoot));
  const outputDirectory = path.resolve(options.offlineDirectory ?? path.join(root, 'output/documentation'));
  let siteDir = options.siteDir ? path.resolve(options.siteDir) : null;
  if (siteDir) {
    try { siteDir = await fs.realpath(siteDir); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (siteDir && (siteDir === root || within(siteDir, root))) throw new Error('Site output must not contain the source repository');
  const siteMode = Boolean(siteDir);
  let offlineExport = false;
  const publicMode = () => siteMode && !offlineExport;
  const baseUrl = normalizedBase(options.baseUrl ?? defaultBase);
  const { Marked } = await import(options.markedModule ? pathToFileURL(path.resolve(options.markedModule)).href : 'marked');
  const packageMetadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const version = packageMetadata.version;
  const chapters = chapterDefinitions.map((chapter) => ({ ...chapter, output: chapter.path + 'index.html' }));
  const byFile = new Map(chapters.map((chapter) => [path.resolve(root, chapter.file), chapter]));
  const assets = new Map();
  const references = [];
  const search = [];
  function chapterHref(from, target, anchor = '') {
    if (!publicMode()) return '#' + target.id + (anchor ? '--' + anchor : '');
    if (from.id === target.id && anchor) return '#' + anchor;
    return relativeUrl(from.output, target.output) + (anchor ? '#' + encodeURIComponent(anchor) : '');
  }
  function sourceTarget(href, chapter) {
    let target = href, base = path.dirname(path.resolve(root, chapter.file));
    if (target.startsWith(repository)) { target = target.slice(repository.length); base = root; }
    else if (target.startsWith(rawRepository)) { target = target.slice(rawRepository.length); base = root; }
    else if (target.startsWith(baseUrl.href)) {
      const url = new URL(target);
      const route = decodeURIComponent(url.pathname.slice(baseUrl.pathname.length)).replace(/index\.html$/, '');
      const linked = chapters.find((item) => item.path === route);
      if (linked) return { linked, anchor: decodeURIComponent(url.hash.slice(1)), absolute: path.resolve(root, linked.file) };
      return { external: target };
    } else if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//')) return { external: target };
    const hashIndex = target.indexOf('#');
    const filename = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
    const anchor = hashIndex >= 0 ? decodeURIComponent(target.slice(hashIndex + 1)) : '';
    const absolute = filename ? path.resolve(base, decodeURIComponent(filename.split('?')[0])) : path.resolve(root, chapter.file);
    if (!within(root, absolute)) throw new Error('Documentation link escapes the repository: ' + href);
    return { absolute, anchor, linked: byFile.get(absolute) };
  }
  function destination(href, chapter) {
    const target = sourceTarget(href, chapter);
    if (target.external) return target.external;
    if (target.linked) {
      if (target.anchor) references.push({ chapter: target.linked, anchor: target.anchor, from: chapter.file });
      return chapterHref(chapter, target.linked, target.anchor);
    }
    const relative = path.relative(root, target.absolute).split(path.sep).join('/');
    if (siteMode || offlineExport) return repository + encodePath(relative) + (target.anchor ? '#' + encodeURIComponent(target.anchor) : '');
    return encodePath(path.relative(outputDirectory, target.absolute).split(path.sep).join('/')) + (target.anchor ? '#' + encodeURIComponent(target.anchor) : '');
  }
  async function discoverImage(href, chapter) {
    const target = sourceTarget(href, chapter);
    if (target.external) return;
    const relative = path.relative(root, target.absolute).split(path.sep).join('/');
    if (!/^docs\/assets\/[^/]+\.(?:png|jpe?g|webp|svg)$/i.test(relative)
      && !/^output\/articles\/set-up-blink-cameras-in-apple-home\/images\/[^/]+\.(?:png|jpe?g|webp|svg)$/i.test(relative)) {
      throw new Error('Image is outside the public documentation asset allowlist: ' + relative);
    }
    let data;
    try {
      const real = await fs.realpath(target.absolute);
      if (!within(root, real) || !(await fs.stat(real)).isFile()) throw new Error('not a repository file');
      data = await fs.readFile(real);
    } catch (error) { throw new Error('Missing or invalid documentation image ' + relative + ': ' + error.message); }
    const asset = 'assets/' + createHash('sha256').update(relative).digest('hex').slice(0, 12) + '-' + path.basename(relative);
    assets.set(target.absolute, { asset, data });
  }
  const lexer = new Marked({ gfm: true });
  for (const chapter of chapters) {
    chapter.source = await fs.readFile(path.resolve(root, chapter.file), 'utf8');
    chapter.headings = []; const used = new Map();
    const tokens = lexer.lexer(chapter.source); const imageJobs = [];
    lexer.walkTokens(tokens, (token) => {
      if (token.type === 'heading') {
        const name = slug(token.text), occurrence = used.get(name) || 0; used.set(name, occurrence + 1);
        const anchor = name + (occurrence ? '-' + occurrence : '');
        const id = siteMode ? anchor : chapter.id + '--' + anchor;
        const title = plain(token.text); chapter.headings.push({ id, anchor, title, depth: token.depth });
        search.push({ route: id, anchor, title, chapter: chapter.title, chapterId: chapter.id });
      }
      if (token.type === 'image') imageJobs.push(discoverImage(token.href, chapter));
    });
    await Promise.all(imageJobs);
    chapter.minutes = Math.max(1, Math.round(plain(chapter.source).split(/\s+/).length / 220));
    chapter.number = String(chapters.indexOf(chapter) + 1).padStart(2, '0');
  }
  function renderChapter(chapter) {
    let headingIndex = 0;
    const renderer = {
      heading({ tokens, depth }) {
        const heading = chapter.headings[headingIndex++];
        return '<h' + depth + ' id="' + escape(publicMode() ? heading.anchor : chapter.id + '--' + heading.anchor) + '">' + this.parser.parseInline(tokens) + '</h' + depth + '>\n';
      },
      link({ href, title, tokens }) {
        return '<a href="' + escape(destination(href, chapter)) + '"' + (title ? ' title="' + escape(title) + '"' : '') + '>' + this.parser.parseInline(tokens) + '</a>';
      },
      image({ href, title, text }) {
        const target = sourceTarget(href, chapter);
        if (target.external) return escape(text);
        const asset = assets.get(target.absolute);
        const extension = path.extname(target.absolute).toLowerCase();
        const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' })[extension];
        const url = offlineExport ? 'data:' + mime + ';base64,' + asset.data.toString('base64') : publicMode() ? relativeUrl(chapter.output, asset.asset) : destination(href, chapter);
        return '<img src="' + escape(url) + '" alt="' + escape(text) + '" loading="lazy" decoding="async"' + (title ? ' title="' + escape(title) + '"' : '') + '>';
      },
      code({ text, lang }) {
        if (lang === 'mermaid') return diagram(text);
        return '<pre><code' + (lang ? ' class="language-' + escape(lang) + '"' : '') + '>' + escape(text) + '</code></pre>\n';
      },
    };
    return new Marked({ renderer, gfm: true }).parse(chapter.source).replace(/<table>/g, '<div class="table-scroll" tabindex="0" role="region" aria-label="Reference table"><table>').replace(/<\/table>/g, '</table></div>');
  }
  for (const chapter of chapters) chapter.html = renderChapter(chapter);
  for (const reference of references) {
    if (!reference.chapter.headings.some((heading) => heading.anchor === reference.anchor)) throw new Error('Missing included heading anchor: ' + reference.chapter.file + '#' + reference.anchor + ' (from ' + reference.from + ')');
  }
  function renderPage(current = chapters[0]) {
    const nav = chapters.map((chapter, index) => (index === 0 || chapter.group !== chapters[index - 1].group ? '<p class="nav-group">' + escape(chapter.group) + '</p>' : '') + '<a class="chapter-link" href="' + escape(chapterHref(current, chapter)) + '" data-chapter="' + chapter.id + '"' + (chapter.id === current.id ? ' aria-current="page"' : '') + '><span class="chapter-number">' + chapter.number + '</span><span>' + escape(chapter.title) + '</span></a>').join('');
    const selected = publicMode() ? [current] : chapters;
    const articles = selected.map((chapter) => {
      const index = chapters.indexOf(chapter);
      const source = siteMode ? repository + encodePath(chapter.file) : encodePath(path.relative(outputDirectory, path.resolve(root, chapter.file)).split(path.sep).join('/'));
      return '<article class="chapter' + (chapter.id === current.id ? ' active' : '') + '" id="' + chapter.id + '" data-title="' + escape(chapter.title) + '"' + (!publicMode() && chapter.id !== current.id ? ' hidden' : '') + '><header class="chapter-meta"><span>FIELD GUIDE / ' + chapter.number + '</span><span>' + chapter.minutes + ' MIN READ</span></header><div class="prose">' + chapter.html + '</div><footer class="chapter-footer"><a class="source-link" href="' + escape(source) + '">Read Markdown source ↗</a>' + (chapters[index + 1] ? '<a class="next-link" href="' + escape(chapterHref(current, chapters[index + 1])) + '"><small>Up next</small>' + escape(chapters[index + 1].title) + ' <span aria-hidden="true">→</span></a>' : '<a class="next-link" href="' + escape(chapterHref(current, chapters[0])) + '">Back to the setup guide <span aria-hidden="true">↑</span></a>') + '</footer></article>';
    }).join('');
    const headingData = Object.fromEntries(chapters.map((chapter) => [chapter.id, chapter.headings.filter((heading) => heading.depth === 2).map((heading) => ({ ...heading, id: publicMode() ? heading.anchor : chapter.id + '--' + heading.anchor }))]));
    const searchData = search.map((item) => ({ ...item, route: publicMode() ? item.anchor : item.chapterId + '--' + item.anchor, href: chapterHref(current, chapters.find((chapter) => chapter.id === item.chapterId), item.anchor) }));
    const canonical = new URL(current.path, baseUrl).href;
    const html = `
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="description" content="User guide for Homebridge Blink Cameras: installation, account setup, live video, recording and troubleshooting."><title>${escape(current.title)} · Homebridge Blink Cameras</title>${publicMode() ? '<link rel="canonical" href="' + escape(canonical) + '">' : '<meta name="robots" content="noindex">'}
<style>
:root{--paper:#ffffff;--sidebar:#f6f8fa;--surface:#ffffff;--ink:#1f2328;--muted:#59636e;--line:#d1d9e0;--accent:#0969da;--accent-soft:#eef5ff;--code:#f6f8fa;--shadow:0 18px 60px #1f23281f;color-scheme:light;font-family:"Avenir Next",Avenir,"Trebuchet MS",sans-serif;line-height:1.6}*{box-sizing:border-box}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}body{margin:0;background:var(--paper);color:var(--ink)}[data-theme=dark]{--paper:#0d1117;--sidebar:#161b22;--surface:#161b22;--ink:#e6edf3;--muted:#9da7b3;--line:#30363d;--accent:#79c0ff;--accent-soft:#172b43;--code:#161b22;--shadow:0 18px 60px #0006;color-scheme:dark}a{color:var(--accent);text-underline-offset:.2em}button,input{font:inherit}button{cursor:pointer}button,a,input,[tabindex]{-webkit-tap-highlight-color:transparent}:focus-visible{outline:3px solid var(--accent);outline-offset:4px;border-radius:3px}button{color:var(--ink)}[hidden]{display:none!important}.skip-link{position:fixed;top:-100px;left:20px;z-index:100;background:var(--surface);padding:12px 20px}.skip-link:focus{top:14px}.layout{display:grid;grid-template-columns:260px minmax(0,1fr);min-height:100vh}.sidebar{position:sticky;top:0;height:100vh;padding:38px 24px 22px;background:var(--sidebar);border-right:1px solid var(--line);display:flex;flex-direction:column;z-index:25}.brand{text-decoration:none;color:var(--ink);display:block;margin-bottom:25px}.brand-mark{display:block;font:600 32px/1 Georgia,"Times New Roman",serif;letter-spacing:-1.1px}.brand-sub{display:block;font-size:12px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;margin-top:9px;color:var(--muted)}.edition{font:11px/1.3 "Avenir Next",sans-serif;letter-spacing:.1em;color:var(--muted);display:flex;align-items:center;gap:7px}.edition:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--accent)}.sidebar nav{overflow:auto;padding:12px 5px 12px 0;margin-right:-8px;flex:1}.nav-group{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.13em;color:var(--muted);margin:22px 0 8px 10px}.chapter-link{display:flex;gap:11px;text-decoration:none;color:var(--muted);font-size:13px;padding:9px 10px;margin:2px 0;border-radius:5px;line-height:1.35}.chapter-number{font-size:10px;margin-top:2px;opacity:.7;font-variant-numeric:tabular-nums}.chapter-link:hover{color:var(--ink);background:var(--accent-soft)}.chapter-link[aria-current=page]{background:var(--accent-soft);color:var(--accent);font-weight:600}.sidebar-foot{padding-top:17px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}.sidebar-foot a{color:inherit}.workspace{min-width:0}.toolbar{height:74px;position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 42px;background:var(--paper);border-bottom:1px solid var(--line)}.location{font-size:12px;color:var(--muted);white-space:nowrap}.location strong{color:var(--ink);font-weight:500}.toolbar-controls{display:flex;align-items:center;gap:13px}.icon-button{background:none;border:1px solid var(--line);border-radius:6px;min-height:34px;padding:4px 11px;font-size:12px;white-space:nowrap}.icon-button:hover{background:var(--accent-soft)}.mobile-toggle,.sidebar-close{display:none}.search-wrap{position:relative}.search-box{display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--line);padding:5px 10px;border-radius:6px;max-width:290px}.search-symbol{font-size:17px;color:var(--muted)}#search{width:190px;border:0;outline:0;background:none;color:var(--ink);font-size:12px;padding:3px 0}#search:focus-visible{outline:0}.search-box:focus-within{outline:2px solid var(--accent);outline-offset:2px}.key-hint{font-size:10px;color:var(--muted);padding:0 5px;border:1px solid var(--line);border-radius:3px}.search-results{position:absolute;right:0;top:44px;width:360px;max-height:60vh;overflow:auto;background:var(--surface);box-shadow:var(--shadow);border:1px solid var(--line);border-radius:8px;padding:8px;z-index:50}.search-result{display:block;text-decoration:none;padding:10px;border-radius:4px;font-size:13px}.search-result:hover{background:var(--accent-soft)}.search-result small{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-top:3px}.empty-search{padding:12px;font-size:13px;color:var(--muted)}.reader-grid{max-width:1350px;margin:auto;display:grid;grid-template-columns:minmax(0,850px) 210px;gap:44px;padding:52px 42px 80px}.reading-pane{min-width:0;max-width:820px;outline:none}.chapter{scroll-margin-top:125px}.chapter-meta{display:flex;justify-content:space-between;gap:20px;font-size:10px;font-weight:600;letter-spacing:.13em;color:var(--muted);padding-bottom:22px;border-bottom:1px solid var(--line);margin-bottom:27px}.prose{font-size:15px;line-height:1.82}.prose h1,.prose h2,.prose h3{line-height:1.2;color:var(--ink);font-weight:500;scroll-margin-top:105px}.prose h1{font-family:Georgia,"Times New Roman",serif;font-size:clamp(34px,3.6vw,52px);font-weight:400;letter-spacing:-1.4px;margin:0 0 25px;max-width:760px}.prose h2{font-size:25px;letter-spacing:-.45px;margin:48px 0 18px;padding-top:17px;border-top:1px solid var(--line)}.prose h3{font-size:19px;margin:30px 0 13px;letter-spacing:-.2px}.prose h4{font-size:16px;margin:28px 0 12px}.prose p{margin:0 0 20px}.prose>p:first-of-type{font-size:12px;color:var(--muted)}.prose strong{font-weight:650}.prose ul,.prose ol{padding-left:23px;margin:0 0 23px}.prose li{padding-left:4px;margin:8px 0}.prose li::marker{color:var(--accent);font-weight:600}.prose code{font:12px/1.6 "SFMono-Regular",Consolas,"Liberation Mono",monospace;background:var(--code);border-radius:4px;padding:2px 5px;overflow-wrap:anywhere}.prose pre{background:var(--code);border:1px solid var(--line);border-radius:7px;padding:20px;overflow:auto;font-size:12px;line-height:1.7;margin:20px 0 26px}.prose pre code{background:none;padding:0;overflow-wrap:normal}.prose blockquote{margin:25px 0 30px;background:var(--accent-soft);border-left:3px solid var(--accent);padding:19px 22px;font-size:14px}.prose blockquote p:last-child{margin:0}.table-scroll{max-width:100%;overflow:auto;border:1px solid var(--line);border-radius:6px;margin:22px 0 30px}.prose table{border-collapse:collapse;width:100%;font-size:12px;line-height:1.6}.prose th,.prose td{text-align:left;padding:12px 14px;vertical-align:top;border-bottom:1px solid var(--line);min-width:130px}.prose tr:last-child td{border-bottom:0}.prose th{font-weight:650;background:var(--accent-soft);color:var(--ink);font-size:11px}.prose td code{font-size:11px}.prose img{display:block;width:auto;max-width:100%;height:auto;border:1px solid var(--line);border-radius:7px;margin:25px auto 13px;background:#fff}.prose em{color:var(--muted)}.prose details{padding:14px 18px;border:1px solid var(--line);border-radius:6px;margin:20px 0}.prose summary{cursor:pointer;font-weight:600}.prose details[open] summary{margin-bottom:16px}.prose hr{border:0;border-top:1px solid var(--line);margin:35px 0}.chapter-footer{display:flex;align-items:center;justify-content:space-between;gap:25px;border-top:1px solid var(--line);margin-top:55px;padding:25px 0}.source-link{font-size:11px;color:var(--muted)}.next-link{text-align:right;font-size:15px;font-weight:600;text-decoration:none}.next-link small{display:block;font-size:10px;text-transform:uppercase;font-weight:500;letter-spacing:.1em;color:var(--muted);margin-bottom:4px}.next-link span{margin-left:10px}.toc{position:sticky;top:112px;align-self:start;border-left:1px solid var(--line);padding-left:20px;max-height:calc(100vh - 150px);overflow:auto}.toc-title{margin:0 0 15px;font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--muted);font-weight:600}.toc a{display:block;font-size:11px;text-decoration:none;color:var(--muted);padding:6px 0;line-height:1.6}.toc a:hover{color:var(--accent)}.video-flow{margin:25px 0 32px;background:var(--sidebar);padding:22px;border:1px solid var(--line);border-radius:8px}.video-flow>div+div{margin-top:25px;padding-top:15px;border-top:1px solid var(--line)}.video-flow h3{margin:0 0 15px;font-size:14px}.video-flow ol{display:flex;flex-wrap:wrap;gap:10px;list-style:none;padding:0;margin:0}.video-flow li{position:relative;flex:1 1 110px;background:var(--surface);border:1px solid var(--line);border-radius:5px;padding:10px;font-size:11px;line-height:1.6;margin:0}.video-flow li:not(:last-child):after{content:"→";position:absolute;right:-10px;top:36%;z-index:1;color:var(--accent)}.video-flow figcaption{font-size:11px;color:var(--muted);margin-top:17px}.backdrop{display:none}.no-script{padding:18px;background:var(--accent-soft);font-size:13px}@media(min-width:1600px){.reader-grid{gap:65px;padding-top:62px}.layout{grid-template-columns:285px minmax(0,1fr)}}@media(max-width:1200px){.reader-grid{grid-template-columns:minmax(0,1fr);max-width:920px}.toc{display:none}.toolbar{padding:0 32px}.reader-grid{padding:44px 32px 65px}}@media(max-width:900px){.layout{grid-template-columns:225px minmax(0,1fr)}.sidebar{padding:32px 18px}.toolbar{padding:0 24px}.location{display:none}.toolbar-controls{width:100%;justify-content:space-between}.reader-grid{padding:36px 24px 60px}.key-hint{display:none}#search{width:170px}}@media(max-width:700px){.layout{display:block}.sidebar{position:fixed;top:0;bottom:0;left:0;width:275px;transform:translateX(-100%);transition:transform .16s ease;box-shadow:var(--shadow)}body.menu-open .sidebar{transform:translateX(0)}.mobile-toggle{display:inline-block}.sidebar-close{display:block;align-self:flex-end;margin-bottom:12px}body.menu-open{overflow:hidden}.toolbar{padding:0 18px;height:65px;gap:12px}.toolbar-controls{gap:8px}.search-box{padding:4px 8px}#search{width:min(31vw,185px);font-size:12px}.icon-button{padding:4px 8px;font-size:11px}.search-results{width:min(360px,calc(100vw - 32px));right:-78px}.reader-grid{padding:30px 22px 45px}.chapter-meta{font-size:9px;padding-bottom:17px;margin-bottom:23px}.prose{font-size:14px;line-height:1.85}.prose h1{font-size:35px;letter-spacing:-1px}.prose h2{font-size:23px;margin-top:38px}.prose th,.prose td{padding:10px 12px;min-width:125px}.prose blockquote{padding:16px 18px}.prose pre{padding:15px}.chapter-footer{align-items:flex-start;gap:20px}.next-link{font-size:13px}.backdrop{position:fixed;inset:0;background:#0b122080;z-index:24;border:0;padding:0}body.menu-open .backdrop{display:block}.video-flow ol{display:block}.video-flow li{margin-bottom:10px}.video-flow li:not(:last-child):after{content:"↓";right:48%;top:auto;bottom:-13px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}@media print{:root,[data-theme=dark]{--paper:#fff;--surface:#fff;--sidebar:#fff;--ink:#111;--muted:#444;--line:#ccc;--accent:#000;--accent-soft:#f1f1f1;--code:#f5f5f5}body{background:#fff;color:#111}.layout{display:block}.sidebar,.toolbar,.toc,.chapter-footer,.backdrop,.no-script{display:none!important}.reader-grid{display:block;max-width:none;padding:0}.reading-pane{max-width:none}.chapter{display:none!important}.chapter.active{display:block!important}.prose{font:10pt/1.5 Georgia,serif;color:#111}.prose h1{font-size:28pt}.prose h2{break-after:avoid;font-size:18pt}.prose h3{break-after:avoid}.prose img,.prose pre,.prose blockquote{break-inside:avoid}.prose a{color:#000;text-decoration:underline}.prose th,.prose td{min-width:0;padding:7px}.table-scroll{overflow:visible}.video-flow{background:#fff}}
</style></head>
<body><a class="skip-link" href="#main">Skip to guide</a><div class="layout"><aside class="sidebar" id="sidebar" aria-label="Guide chapters"><button class="icon-button sidebar-close" id="close-navigation" aria-label="Close chapter menu">Close ×</button><a href="${escape(chapterHref(current, chapters[0]))}" class="brand"><span class="brand-mark">Blink / Home</span><span class="brand-sub">The field guide</span></a><div class="edition">${escape(version)} · ${publicMode() ? 'DOCUMENTATION' : 'LOCAL EDITION'}</div><nav aria-label="Chapters">${nav}</nav>${publicMode() ? '<a class="chapter-link" href="' + escape(relativeUrl(current.output, 'offline.html')) + '" download>Download offline guide ↓</a>' : ''}<div class="sidebar-foot">Homebridge Blink Cameras<br>Unofficial community plugin<br><a href="${siteMode ? repository + 'docs/README.md' : '../../docs/README.md'}">Markdown documentation</a></div></aside><button class="backdrop" id="backdrop" aria-label="Close chapter menu" hidden></button><div class="workspace"><header class="toolbar"><button class="icon-button mobile-toggle" id="menu" aria-expanded="false" aria-controls="sidebar">☰ <span>Chapters</span></button><div class="location">Documentation <span aria-hidden="true">/</span> <strong id="location">${escape(current.title)}</strong></div><div class="toolbar-controls"><div class="search-wrap"><label class="search-box"><span class="search-symbol" aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Search the guide" aria-label="Search page and section titles" aria-controls="search-results" autocomplete="off"><span class="key-hint" aria-hidden="true">/</span></label><div class="search-results" id="search-results" aria-label="Search results" hidden></div><div id="search-status" class="visually-hidden" aria-live="polite"></div></div><button class="icon-button" id="theme" aria-label="Color theme: light">Theme: light</button></div></header><noscript><style>.chapter[hidden]{display:block!important}.toc,.mobile-toggle,.sidebar-close,.toolbar-controls{display:none!important}.sidebar{position:static;transform:none;width:auto;height:auto}.layout{display:block}</style><p class="no-script">${publicMode() ? 'JavaScript is off. Chapter links and this guide still work; use browser Find to search this page.' : 'JavaScript is off. All chapters appear below; browser Find still works.'}</p></noscript><div class="reader-grid"><main id="main" class="reading-pane" tabindex="-1">${articles}</main><aside class="toc" aria-label="On this page"><p class="toc-title">On this page</p><nav id="toc"></nav></aside></div></div></div>
<script>
'use strict';
const publicMode=${publicMode()};
const currentChapterId=${safeJson(current.id)};
const chapters=${safeJson(chapters.map(({ id, title }) => ({ id, title })))};
const headings=${safeJson(headingData)};
const searchIndex=${safeJson(searchData)};
const articles=[...document.querySelectorAll('.chapter')];
const menu=document.getElementById('menu'),backdrop=document.getElementById('backdrop'),sidebar=document.getElementById('sidebar'),workspace=document.querySelector('.workspace');
const mobileNavigation=window.matchMedia('(max-width: 700px)');
const searchInput=document.getElementById('search'),results=document.getElementById('search-results');
const themeButton=document.getElementById('theme');
const media=window.matchMedia('(prefers-color-scheme: dark)');
let preference='light';
try{preference=localStorage.getItem('blink-guide-theme')||'light';}catch{}
if(!['system','light','dark'].includes(preference))preference='light';
function theme(){document.documentElement.dataset.theme=preference==='system'?(media.matches?'dark':'light'):preference;themeButton.textContent='Theme: '+preference;themeButton.setAttribute('aria-label','Color theme: '+preference);}
function closeMenu(returnFocus=false){const wasOpen=document.body.classList.contains('menu-open');document.body.classList.remove('menu-open');menu.setAttribute('aria-expanded','false');backdrop.hidden=true;workspace.inert=false;sidebar.inert=mobileNavigation.matches;sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');if(returnFocus&&wasOpen)menu.focus();}
menu.addEventListener('click',()=>{const open=!document.body.classList.contains('menu-open');if(!open){closeMenu(true);return;}sidebar.inert=false;document.body.classList.add('menu-open');menu.setAttribute('aria-expanded','true');backdrop.hidden=false;workspace.inert=true;sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');document.getElementById('close-navigation').focus();});
backdrop.addEventListener('click',()=>closeMenu(true));document.getElementById('close-navigation').addEventListener('click',()=>closeMenu(true));mobileNavigation.addEventListener('change',()=>closeMenu());
themeButton.addEventListener('click',()=>{preference=['system','light','dark'][(['system','light','dark'].indexOf(preference)+1)%3];try{localStorage.setItem('blink-guide-theme',preference);}catch{}theme();});media.addEventListener('change',theme);theme();
function route(focus=false){
 let hash;try{hash=decodeURIComponent(location.hash.slice(1));}catch{hash='start';}
 const id=publicMode?currentChapterId:hash==='main'?(document.querySelector('.chapter.active')?.id||'start'):hash.split('--')[0];
 const chapter=chapters.find(item=>item.id===id)||chapters[0];
 for(const article of articles){article.hidden=article.id!==chapter.id;article.classList.toggle('active',!article.hidden);}
 for(const link of document.querySelectorAll('.chapter-link')){if(link.dataset.chapter===chapter.id)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
 document.getElementById('location').textContent=chapter.title;document.title=chapter.title+' · Blink / Home guide';
 const toc=document.getElementById('toc');toc.replaceChildren();
 for(const heading of headings[chapter.id]||[]){const link=document.createElement('a');link.href='#'+heading.id;link.textContent=heading.title;toc.append(link);}
 closeMenu();results.hidden=true;
 const target=document.getElementById(hash)||document.getElementById(chapter.id);
 if(hash==='main'){document.getElementById('main').focus();return;}
 if((publicMode&&hash||hash.includes('--'))&&target){requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));}
 else window.scrollTo({top:0});
 if(focus){document.getElementById('main').focus({preventScroll:true});}
}
window.addEventListener('hashchange',()=>route(true));route();
function search(){
 const query=searchInput.value.trim().toLocaleLowerCase();results.replaceChildren();
 if(!query){results.hidden=true;document.getElementById('search-status').textContent='';return;}
 const matches=searchIndex.filter(item=>(item.title+' '+item.chapter).toLocaleLowerCase().includes(query)).slice(0,18);
 for(const item of matches){const link=document.createElement('a');link.className='search-result';link.href=publicMode?item.href:'#'+item.route;link.append(document.createTextNode(item.title));const small=document.createElement('small');small.textContent=item.chapter;link.append(small);link.addEventListener('click',()=>{searchInput.value='';results.hidden=true;});results.append(link);}
 if(!matches.length){const empty=document.createElement('p');empty.className='empty-search';empty.textContent='No matching page or section titles. Try “recording”, “audio” or “verification”.';results.append(empty);}
 results.hidden=false;document.getElementById('search-status').textContent=matches.length+' matching sections';
}
searchInput.addEventListener('input',search);searchInput.addEventListener('focus',()=>{if(searchInput.value)search();});
searchInput.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){const first=results.querySelector('a');if(first){event.preventDefault();first.focus();}}});
results.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){const links=[...results.querySelectorAll('a')];const next=links.indexOf(document.activeElement)+(event.key==='ArrowDown'?1:-1);if(links[next]){event.preventDefault();links[next].focus();}else if(next<0){event.preventDefault();searchInput.focus();}}});
document.addEventListener('click',event=>{if(!event.target.closest('.search-wrap'))results.hidden=true;});
document.addEventListener('keydown',event=>{if(event.key==='Tab'&&document.body.classList.contains('menu-open')){const items=[...sidebar.querySelectorAll('a[href],button')].filter(item=>item.getClientRects().length);const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}if(event.key==='Escape'){results.hidden=true;if(document.body.classList.contains('menu-open')){closeMenu(true);}else if(document.activeElement.closest?.('.search-wrap'))searchInput.focus();}if(event.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){event.preventDefault();searchInput.focus();}});
</script></body></html>`;
    validateHtml(html, publicMode() ? current.output : 'offline reader');
    return html;
  }
  if (!siteMode) {
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(path.join(outputDirectory, 'index.html'), renderPage());
    return { mode: 'offline', output: path.join(outputDirectory, 'index.html'), chapters: chapters.length, headings: search.length };
  }
  const files = new Map();
  for (const chapter of chapters) files.set(chapter.output, renderPage(chapter));
  for (const { asset, data } of assets.values()) files.set(asset, data);
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + chapters.map((chapter) => '  <url><loc>' + escape(new URL(chapter.path, baseUrl).href) + '</loc></url>').join('\n') + '\n</urlset>\n';
  files.set('sitemap.xml', sitemap);
  files.set('robots.txt', 'User-agent: *\nAllow: /\nSitemap: ' + new URL('sitemap.xml', baseUrl).href + '\n');
  files.set('.nojekyll', '');
  offlineExport = true;
  for (const chapter of chapters) chapter.html = renderChapter(chapter);
  files.set('offline.html', renderPage());
  const sourceRevision = /^[a-f\d]{40}$/i.test(process.env.GITHUB_SHA ?? '') ? process.env.GITHUB_SHA : null;
  await writeSite(siteDir, files, { version, sourceRevision });
  return { mode: 'site', output: siteDir, chapters: chapters.length, headings: search.length, assets: assets.size, files: files.size + 1 };
}

function parseArguments(args) {
  const options = {};
  const names = { '--marked-module': 'markedModule', '--site-dir': 'siteDir', '--base-url': 'baseUrl' };
  for (let index = 0; index < args.length; index += 2) {
    if (!names[args[index]] || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Usage: node output/documentation/build.mjs [--marked-module path] [--site-dir directory --base-url https://site.example/project/]');
    if (options[names[args[index]]]) throw new Error('Repeated argument: ' + args[index]);
    options[names[args[index]]] = args[index + 1];
  }
  if (options.baseUrl && !options.siteDir) throw new Error('--base-url requires --site-dir');
  return options;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await buildDocumentation(parseArguments(process.argv.slice(2)));
    console.log('Built ' + result.mode + ' documentation: ' + result.chapters + ' chapters, ' + result.headings + ' searchable headings' + (result.assets === undefined ? '.' : ', ' + result.assets + ' bundled assets.'));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
