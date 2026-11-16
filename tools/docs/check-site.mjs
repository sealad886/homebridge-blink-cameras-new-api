#!/usr/bin/env node
// Validate the generated publication boundary without fetching outbound links.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const decode = value => value.replace(/&(?:amp|quot|apos|lt|gt|#39);/g, entity => ({
  '&amp;': '&', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>',
})[entity]);

function attributes(source) {
  const result = {};
  for (const match of source.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
  }
  return result;
}

export async function checkSite(directory, baseUrl) {
  const root = path.resolve(directory);
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.search || base.hash) {
    throw new Error('The site base URL must be an HTTP(S) URL without a query or fragment');
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const files = new Set();
  async function walk(relative = '') {
    for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink()) throw new Error('Publication contains a symbolic link: ' + name);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) files.add(name);
      else throw new Error('Publication contains an unsupported file: ' + name);
    }
  }
  await walk();
  for (const required of ['index.html', 'offline.html', 'build.json', 'sitemap.xml', 'robots.txt', '.nojekyll']) {
    if (!files.has(required)) throw new Error('Publication is missing ' + required);
  }
  const html = new Map();
  const errors = [];
  const canonical = new Set();
  const referencedAssets = new Set();
  let references = 0;
  for (const file of files) {
    if (!file.endsWith('.html')) continue;
    const text = await fs.readFile(path.join(root, file), 'utf8');
    const ids = new Set();
    const tags = [];
    const markup = text.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\s*>)/gi, '$1$2')
      .replace(/(<style\b[^>]*>)[\s\S]*?(<\/style\s*>)/gi, '$1$2');
    for (const match of markup.matchAll(/<([a-z][\w:-]*)\b([^>]*?)>/gi)) {
      const tag = { name: match[1].toLowerCase(), attrs: attributes(match[2]) };
      tags.push(tag);
      if (tag.attrs.id !== undefined) {
        if (!tag.attrs.id || ids.has(tag.attrs.id)) errors.push(file + ': empty or duplicate ID ' + tag.attrs.id);
        ids.add(tag.attrs.id);
      }
    }
    const links = tags.filter(tag => tag.name === 'link' && tag.attrs.rel?.split(/\s+/).includes('canonical'));
    const isOffline = file === 'offline.html';
    const expected = new URL(file === 'index.html' ? '' : file.replace(/index\.html$/, ''), base).href;
    const robots = tags.filter(tag => tag.name === 'meta' && tag.attrs.name?.toLowerCase() === 'robots');
    if (isOffline) {
      if (links.length || !robots.some(tag => /\bnoindex\b/i.test(tag.attrs.content || ''))) {
        errors.push(file + ': the offline companion must be noindex without a canonical URL');
      }
    } else {
      if (links.length !== 1 || links[0].attrs.href !== expected) errors.push(file + ': incorrect canonical URL; expected ' + expected);
      if (robots.some(tag => /\bnoindex\b/i.test(tag.attrs.content || ''))) errors.push(file + ': public guide is noindex');
      canonical.add(expected);
    }
    html.set(file, { ids, tags, url: new URL(file, base), isOffline });
  }

  for (const [file, page] of html) {
    for (const tag of page.tags) {
      const refs = [];
      if (tag.attrs.src) refs.push({ value: tag.attrs.src, automatic: true });
      if (tag.attrs.poster) refs.push({ value: tag.attrs.poster, automatic: true });
      if (tag.name === 'object' && tag.attrs.data) refs.push({ value: tag.attrs.data, automatic: true });
      if (tag.attrs.srcset) errors.push(file + ': unsupported generated srcset; validate its publication handling first');
      if (tag.attrs.href) refs.push({ value: tag.attrs.href, automatic: tag.name !== 'a' && !tag.attrs.rel?.split(/\s+/).includes('canonical') });
      for (const ref of refs) {
        references++;
        if (ref.value.startsWith('data:')) {
          if (!page.isOffline || tag.name !== 'img' || !ref.value.startsWith('data:image/')) errors.push(file + ': unexpected embedded data resource');
          continue;
        }
        let url;
        try { url = new URL(ref.value, page.url); }
        catch { errors.push(file + ': invalid URL ' + ref.value); continue; }
        if (!['http:', 'https:'].includes(url.protocol)) {
          if (!ref.automatic && ['mailto:', 'tel:'].includes(url.protocol)) continue;
          errors.push(file + ': unsupported URL protocol ' + url.protocol);
          continue;
        }
        if (ref.automatic && /^https?:|^\/\//i.test(ref.value)) errors.push(file + ': automatic resource must be local: ' + ref.value);
        if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
          if (ref.automatic || !/^(https?:)?\/\//i.test(ref.value)) errors.push(file + ': reference escapes the published site: ' + ref.value);
          continue;
        }
        let relative;
        try { relative = decodeURIComponent(url.pathname.slice(base.pathname.length)); }
        catch { errors.push(file + ': invalid encoded path ' + ref.value); continue; }
        if (!relative || relative.endsWith('/')) relative += 'index.html';
        else if (!files.has(relative) && files.has(relative + '/index.html')) relative += '/index.html';
        if (!files.has(relative)) { errors.push(file + ': missing target ' + ref.value); continue; }
        if (relative.startsWith('assets/')) referencedAssets.add(relative);
        if (url.hash && html.has(relative)) {
          let id;
          try { id = decodeURIComponent(url.hash.slice(1)); }
          catch { errors.push(file + ': invalid encoded fragment ' + ref.value); continue; }
          if (id && !html.get(relative).ids.has(id)) errors.push(file + ': missing heading ' + ref.value);
        }
      }
    }
  }

  const sitemap = await fs.readFile(path.join(root, 'sitemap.xml'), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
  if (locations.length !== canonical.size || new Set(locations).size !== locations.length || locations.some(url => !canonical.has(url))) {
    errors.push('sitemap.xml: canonical guide URLs do not match the generated public pages');
  }
  const robots = await fs.readFile(path.join(root, 'robots.txt'), 'utf8');
  if (!robots.includes('Sitemap: ' + new URL('sitemap.xml', base).href)) errors.push('robots.txt: canonical sitemap declaration is missing');
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'build.json'), 'utf8'));
  if (manifest.generator !== 'homebridge-blink-documentation-v1' || typeof manifest.version !== 'string' || !manifest.version ||
      (manifest.sourceRevision !== null && !/^[a-f\d]{40}$/i.test(manifest.sourceRevision || '')) || !Array.isArray(manifest.files)) {
    errors.push('build.json: invalid generator, version, source revision or file inventory');
  } else {
    const expected = [...files].filter(file => file !== 'build.json').sort();
    if (JSON.stringify([...manifest.files].sort()) !== JSON.stringify(expected)) errors.push('build.json: file inventory does not match the public artifact');
  }
  if (process.env.GITHUB_SHA && manifest.sourceRevision !== process.env.GITHUB_SHA) {
    errors.push('build.json: source revision does not match the GitHub Actions revision');
  }
  if (process.env.GITHUB_ACTIONS === 'true' && !/^[a-f\d]{40}$/i.test(process.env.GITHUB_SHA || '')) {
    errors.push('GitHub Actions source revision is missing or invalid');
  }
  for (const file of files) {
    if (file.endsWith('.html') || ['build.json', '.nojekyll', 'robots.txt', 'sitemap.xml'].includes(file)) continue;
    if (!file.startsWith('assets/') || !referencedAssets.has(file)) errors.push('Unexpected or unreferenced publication file: ' + file);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { pages: canonical.size, offlineCompanions: 1, references, assets: referencedAssets.size, sourceRevision: manifest.sourceRevision, version: manifest.version };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[1] !== '--base-url') throw new Error('Usage: node tools/docs/check-site.mjs SITE_DIRECTORY --base-url CANONICAL_URL');
  try { console.log(JSON.stringify(await checkSite(args[0], args[2]), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
