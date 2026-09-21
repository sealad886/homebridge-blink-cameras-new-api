#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Ajv2020 = require('ajv/dist/2020');

const HTTP_METHODS = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'];
const FIRST_PARTY_HOSTS = [
  /(^|\.)blink\.com$/i,
  /(^|\.)immedia-semi\.com$/i,
  /(^|\.)ring\.com$/i,
  /(^|\.)amazonvisionoperations\.com$/i,
];
const THIRD_PARTY_OWNERS = [
  [/braze\.(com|eu)$/i, 'Braze'],
  [/appboycdn\.com$/i, 'Braze'],
  [/googleapis\.com$/i, 'Google'],
  [/google-analytics\.com$/i, 'Google Analytics'],
  [/firebaseio\.com$/i, 'Google Firebase'],
  [/mapbox\.com$/i, 'Mapbox'],
  [/amplitude\.com$/i, 'Amplitude'],
  [/sentry\.io$/i, 'Sentry'],
  [/bugsnag\.com$/i, 'Bugsnag'],
  [/appsflyer\.com$/i, 'AppsFlyer'],
  [/launchdarkly\.com$/i, 'LaunchDarkly'],
];
const SHARED_APIS = new Set([
  'AccessoryApi', 'CameraApi', 'CommandApi', 'DeviceApi', 'DoorbellApi',
  'FeatureFlagApi', 'HomeScreenApi', 'MediaApi', 'NetworkApi', 'OwlApi',
  'ProgramApi', 'ReadSubscriptionApi', 'SmartVideoDescriptionsApi', 'SyncModuleApi',
]);
const UNAUTHENTICATED_APIS = new Set(['AuthApi', 'PasswordResetApi', 'PublicApi']);

function walk(root, predicate = () => true) {
  if (!fs.existsSync(root)) return [];
  const result = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((a, b) => b.name.localeCompare(a.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (predicate(full)) result.push(full);
    }
  }
  return result.sort();
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function stableHash(value, length = 16) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, length);
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function lineNumber(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function splitParameters(value) {
  const parts = [];
  let start = 0;
  let angle = 0;
  let parens = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '<') angle += 1;
    if (char === '>') angle = Math.max(0, angle - 1);
    if (char === '(') parens += 1;
    if (char === ')') parens = Math.max(0, parens - 1);
    if (char === ',' && angle === 0 && parens === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function normalizePath(value) {
  if (value === '@Url') return value;
  return value
    .replaceAll('%7B', '{')
    .replaceAll('%7D', '}')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

function extractTypeName(type) {
  if (!type) return null;
  const cleaned = type
    .replace(/\?\s+(extends|super)\s+/g, '')
    .replace(/\[\]/g, '')
    .replace(/[>?]+$/g, '')
    .trim();
  const identifiers = cleaned.match(/[A-Za-z_$][\w$]*/g);
  return identifiers?.at(-1) || null;
}

function parseParameter(raw, index) {
  if (/Continuation\s*</.test(raw)) return null;
  const annotation = raw.match(/@(Path|Query|Field|Header|Body|Url|QueryMap|HeaderMap|Part|PartMap)(?:\(([^)]*)\))?/);
  const cleaned = raw.replace(/@[\w.]+(?:\([^)]*\))?\s*/g, '').trim();
  const tokens = cleaned.split(/\s+/);
  const name = tokens.pop() || `arg${index}`;
  const type = tokens.join(' ') || 'unknown';
  let wireName = null;
  if (annotation?.[2]) {
    wireName = annotation[2].match(/"([^"]+)"/)?.[1] || annotation[2].trim();
  }
  return {
    location: annotation ? annotation[1].toLowerCase() : 'unknown',
    name,
    wireName,
    type,
    required: !/Nullable|\b(Long|Integer|Boolean|String)\b/.test(raw) || /@Body|@Path/.test(raw),
  };
}

function responseType(returnType, signature) {
  const continuation = signature.match(/Continuation\s*<\s*\?\s*super\s+([^>]+)>/);
  if (continuation) return continuation[1].trim();
  const generic = returnType.match(/(?:Call|Result|Single|Observable|Response)\s*<\s*([^>]+)>/);
  return (generic?.[1] || returnType || 'unknown').trim();
}

function sourcePackage(text) {
  return text.match(/^package\s+([\w.]+);/m)?.[1] || '';
}

function sourceClass(text, file) {
  return text.match(/\b(?:class|interface|enum)\s+([\w$]+)/)?.[1] || path.basename(file, '.java');
}

function sourceImports(text) {
  return new Map([...text.matchAll(/^import\s+([\w.$]+);/gm)]
    .map(match => [match[1].split('.').at(-1), match[1]]));
}

function qualifyType(type, sourceText) {
  const name = extractTypeName(type);
  if (!name || /^(Unit|Object|String|Long|Integer|Boolean|Void|ResponseBody|RequestBody|unknown)$/.test(name)) return name;
  if (name.includes('.')) return name;
  return sourceImports(sourceText).get(name) || `${sourcePackage(sourceText)}.${name}`;
}

function dexName(text) {
  return text.match(/loaded from:\s*(classes\d*\.dex)/)?.[1] || 'unknown';
}

function resolveService(className, sourcePath, pathValue) {
  if (className === 'OauthApi' || className === 'PasskeyOauthApi') {
    return { family: 'oauth', baseHost: 'https://api.{env}oauth.blink.com/', auth: 'none' };
  }
  if (className === 'PasskeyRegistrationApi') {
    return { family: 'authentication', baseHost: 'https://rest-{tier}.immedia-semi.com/api/', auth: 'bearer' };
  }
  if (className === 'EventStreamApi') {
    return { family: 'event-stream', baseHost: 'https://prod.eventstream.immedia-semi.com/', auth: 'optional-explicit' };
  }
  if (/SyncModuleService|Wifi(?:Secure)?Api/.test(className)) {
    return { family: 'local-device', baseHost: 'http://172.16.97.199/', auth: 'local-none' };
  }
  if (/Signall|WebRtc|Streaming|LiveView/i.test(sourcePath) || /rtsps?:/i.test(pathValue)) {
    return { family: 'streaming', baseHost: 'dynamic', auth: 'flow-specific' };
  }
  if (/rdis|duos|deviceupdate/i.test(sourcePath)) {
    return { family: 'device-orchestration', baseHost: 'dynamic', auth: 'bearer' };
  }
  if (SHARED_APIS.has(className)) {
    return { family: 'shared-rest', baseHost: 'https://rest-{shared_tier}.immedia-semi.com/api/', auth: 'bearer' };
  }
  if (UNAUTHENTICATED_APIS.has(className)) {
    return { family: 'public-rest', baseHost: 'https://rest-{tier}.immedia-semi.com/api/', auth: 'none' };
  }
  return { family: 'rest', baseHost: 'https://rest-{tier}.immedia-semi.com/api/', auth: 'bearer' };
}

function securityFlags(method, endpointPath) {
  const text = `${method} ${endpointPath}`.toLowerCase();
  return {
    destructive: method === 'DELETE' || /delete|remove|revoke|unlink|eject|format|cancel/.test(text),
    privacySensitive: /media|video|thumbnail|logs|shared|support|location/.test(text),
    mediaBearing: /media|video|thumbnail|clip|liveview|stream/.test(text),
    authentication: /oauth|auth|token|password|pin|2fa|webauthn|login|logout/.test(text),
    accountManagement: /users|account|client|subscription|shared|country/.test(text),
    localNetwork: /local_storage|ssid|wifi|firmware|fw_|172\.16\./.test(text),
  };
}

function parseJavaEndpoints(sourcesRoot, apkHash) {
  const endpoints = [];
  for (const file of walk(sourcesRoot, item => item.endsWith('.java'))) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/@(?:DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT|HTTP)\b/.test(text)) continue;
    const pkg = sourcePackage(text);
    const className = sourceClass(text, file);
    const rel = relative(sourcesRoot, file);
    const annotationPattern = /@(DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT|HTTP)\s*\(([^)]*)\)([\s\S]*?;)/g;
    for (const match of text.matchAll(annotationPattern)) {
      const annotation = match[1];
      const annotationArguments = match[2];
      const method = annotation === 'HTTP'
        ? annotationArguments.match(/\bmethod\s*=\s*"([A-Z]+)"/)?.[1]
        : annotation;
      const rawPath = annotation === 'HTTP'
        ? annotationArguments.match(/\bpath\s*=\s*"([^"]*)"/)?.[1]
        : annotationArguments.match(/"([^"]*)"/)?.[1];
      if (!HTTP_METHODS.includes(method)) continue;
      const endpointPath = normalizePath(rawPath || '@Url');
      const signatureChunk = match[3].replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
      const signatureLine = signatureChunk.split('\n').filter(line => !line.trim().startsWith('@')).join(' ').trim();
      const methodMatch = signatureLine.match(/(?:public\s+)?(?:abstract\s+)?(.+?)\s+([\w$]+)\s*\((.*)\)\s*;/);
      if (!methodMatch) continue;
      const [, returnType, methodName, rawParameters] = methodMatch;
      const parameters = splitParameters(rawParameters)
        .map(parseParameter)
        .filter(Boolean);
      const service = resolveService(className, rel, endpointPath);
      const bodyTypes = parameters.filter(item => item.location === 'body').map(item => item.type).sort();
      const identity = `${method}|${service.family}|${endpointPath}|${bodyTypes.join(',')}`;
      endpoints.push({
        id: `ep-${stableHash(identity)}`,
        method,
        path: endpointPath,
        normalizedIdentity: identity,
        serviceFamily: service.family,
        baseHostTemplate: service.baseHost,
        urlConstruction: endpointPath === '@Url' ? 'Runtime-provided absolute URL' : 'Retrofit base URL plus relative annotation path; request interceptors may rewrite tier, shared tier, environment, account, and client tokens.',
        authentication: {
          mode: service.auth,
          tokenSource: service.auth === 'bearer' ? 'persisted OAuth access token' : null,
          refreshBehavior: service.auth === 'bearer' ? 'Blink authenticator may refresh after an authenticated-host HTTP 401.' : null,
          confidence: 'inferred',
        },
        headers: parameters.filter(item => item.location === 'header' || item.location === 'headermap'),
        parameters,
        requestModelRefs: bodyTypes.map(type => qualifyType(type, text)).filter(Boolean),
        responseModelRefs: [qualifyType(responseType(returnType, signatureLine), text)].filter(Boolean),
        successResponses: [],
        errorMappings: [],
        polling: null,
        feature: className.replace(/Api$/, ''),
        callSites: [],
        deviceFamilies: [],
        transportBackend: service.family,
        bindings: [{ package: pkg, className, methodName, returnType: returnType.trim(), signature: signatureLine }],
        evidence: [{
          apkSha256: apkHash,
          split: 'base.apk',
          dex: dexName(text),
          source: rel,
          line: lineNumber(text, match.index),
          symbol: `${pkg}.${className}.${methodName}`,
          method: 'jadx',
        }],
        confidence: 'direct',
        recovery: {
          declaration: 'resolved', models: 'resolved', serviceBinding: 'inferred',
          authentication: 'inferred', callSites: 'unresolved',
          responseSemantics: 'unresolved', deviceFamilies: 'unresolved',
        },
        lifecycle: 'unchanged',
        security: securityFlags(method, endpointPath),
      });
    }
  }
  return endpoints;
}

function parseSmaliEndpoints(apktoolRoot, apkHash) {
  const endpoints = [];
  for (const file of walk(apktoolRoot, item => item.endsWith('.smali'))) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/Lretrofit2\/http\/(?:DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT|HTTP);/.test(text)) continue;
    const classDescriptor = text.match(/^\.class[^\n]*\sL([^;]+);/m)?.[1];
    if (!classDescriptor || classDescriptor.startsWith('retrofit2/')) continue;
    const blocks = text.split(/(?=^\.method\s)/m);
    for (const block of blocks) {
      const methodMatch = block.match(/^\.method[^\n]*\s([\w$<>]+)\(([^)]*)\)([^\s]+)/m);
      const verbMatch = block.match(/\.annotation runtime Lretrofit2\/http\/(DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT|HTTP);([\s\S]*?)\.end annotation/);
      if (!methodMatch || !verbMatch) continue;
      const method = verbMatch[1] === 'HTTP'
        ? verbMatch[2].match(/method\s*=\s*"([A-Z]+)"/)?.[1]
        : verbMatch[1];
      if (!HTTP_METHODS.includes(method)) continue;
      const pathValue = normalizePath(verbMatch[2].match(/(?:value|path)\s*=\s*"([^"]*)"/)?.[1] || '@Url');
      const className = classDescriptor.split('/').at(-1);
      const service = resolveService(className, classDescriptor, pathValue);
      const identity = `${method}|${service.family}|${pathValue}|`;
      endpoints.push({
        id: `ep-${stableHash(identity)}`,
        method,
        path: pathValue,
        normalizedIdentity: identity,
        serviceFamily: service.family,
        baseHostTemplate: service.baseHost,
        binding: `${classDescriptor.replaceAll('/', '.')}.${methodMatch[1]}`,
        evidence: [{
          apkSha256: apkHash,
          split: 'base.apk',
          dex: relative(apktoolRoot, file).split('/')[0].replace('smali_', '').replace('smali', 'classes.dex'),
          source: relative(apktoolRoot, file),
          line: lineNumber(text, text.indexOf(verbMatch[0])),
          symbol: `${classDescriptor.replaceAll('/', '.')}.${methodMatch[1]}`,
          method: 'apktool-smali',
        }],
      });
    }
  }
  return endpoints;
}

function mergeEndpoints(javaEndpoints, smaliEndpoints) {
  const byKey = new Map();
  for (const endpoint of javaEndpoints) {
    const key = endpoint.normalizedIdentity;
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, endpoint);
    else {
      existing.bindings.push(...endpoint.bindings);
      existing.evidence.push(...endpoint.evidence);
      existing.parameters.push(...endpoint.parameters.filter(parameter =>
        !existing.parameters.some(item => item.location === parameter.location && item.wireName === parameter.wireName && item.type === parameter.type)));
    }
  }
  const smaliOnly = [];
  for (const endpoint of smaliEndpoints) {
    const exact = byKey.get(endpoint.normalizedIdentity);
    const compatible = exact ? [exact] : [...byKey.values()].filter(item =>
      item.method === endpoint.method && item.path === endpoint.path);
    if (compatible.length) {
      for (const contract of compatible) contract.evidence.push(...endpoint.evidence);
    }
    else smaliOnly.push(endpoint);
  }
  for (const endpoint of smaliOnly) {
    byKey.set(endpoint.normalizedIdentity, {
      ...endpoint,
      urlConstruction: endpoint.path === '@Url' ? 'Runtime-provided absolute URL' : 'Recovered from Retrofit annotation in smali.',
      authentication: { mode: 'unresolved', tokenSource: null, refreshBehavior: null, confidence: 'unresolved' },
      headers: [], parameters: [], requestModelRefs: [], responseModelRefs: [],
      successResponses: [], errorMappings: [], polling: null,
      feature: endpoint.binding.split('.').at(-2)?.replace(/Api$/, '') || 'Unknown',
      callSites: [], deviceFamilies: [], transportBackend: endpoint.serviceFamily,
      bindings: [{ className: endpoint.binding.split('.').at(-2), methodName: endpoint.binding.split('.').at(-1), signature: null }],
      confidence: 'corroborated', lifecycle: 'unchanged',
      recovery: {
        declaration: 'resolved', models: 'unresolved', serviceBinding: 'unresolved',
        authentication: 'unresolved', callSites: 'unresolved',
        responseSemantics: 'unresolved', deviceFamilies: 'unresolved',
      },
      security: securityFlags(endpoint.method, endpoint.path),
    });
  }
  return [...byKey.values()]
    .map(endpoint => ({
      ...endpoint,
      evidence: endpoint.evidence
        .filter((item, index, array) => array.findIndex(candidate => candidate.method === item.method && candidate.source === item.source && candidate.line === item.line) === index)
        .sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line),
      bindings: endpoint.bindings
        .filter((item, index, array) => array.findIndex(candidate => candidate.className === item.className && candidate.methodName === item.methodName) === index)
        .sort((a, b) => `${a.className}.${a.methodName}`.localeCompare(`${b.className}.${b.methodName}`)),
    }))
    .sort((a, b) => a.serviceFamily.localeCompare(b.serviceFamily) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

function buildClassIndex(sourcesRoot) {
  const index = new Map();
  for (const file of walk(sourcesRoot, item => item.endsWith('.java'))) {
    const text = fs.readFileSync(file, 'utf8');
    const name = sourceClass(text, file);
    const candidate = { file, text, name, qualifiedName: `${sourcePackage(text)}.${name}` };
    for (const key of [name, candidate.qualifiedName]) {
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(candidate);
    }
  }
  return index;
}

function parseModel(name, classIndex, sourcesRoot, apkHash) {
  const candidates = classIndex.get(name) || [];
  if (!candidates.length) return null;
  const exact = candidates.filter(candidate => candidate.qualifiedName === name);
  const preferred = candidates.filter(candidate =>
    /\/com\/immediasemi\/blink\//.test(candidate.file));
  const resolved = exact.length === 1 ? exact[0] : preferred.length === 1 ? preferred[0] : candidates.length === 1 ? candidates[0] : null;
  if (!resolved) return null;
  const { file, text } = resolved;
  const fields = [];
  const fieldPattern = /(?:@SerializedName\(\s*(?:value\s*=\s*)?"([^"]+)"\s*\)\s*)?(?:private|public|protected)\s+((?:(?:static|final|transient|volatile)\s+)*)([\w.<>?, \[\]]+)\s+([\w$]+)\s*(?:=[^;]*)?;/g;
  for (const match of text.matchAll(fieldPattern)) {
    const modifiers = match[2];
    const type = match[3].trim();
    const fieldName = match[4];
    if (/\bstatic\b/.test(modifiers) || fieldName.includes('$') || /^(CREATOR|Companion|INSTANCE|serialVersionUID)$/.test(fieldName)) continue;
    fields.push({
      serializedName: match[1] || fieldName,
      sourceName: fieldName,
      type,
      qualifiedType: qualifyType(type, text),
      nullable: !/\b(?:boolean|byte|char|double|float|int|long|short)\b/.test(type),
      default: null,
    });
  }
  const enumValues = /\benum\s+/.test(text)
    ? [...text.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*(?:\([^;]*\))?[,;]/gm)].map(match => match[1])
    : [];
  return {
    id: `model-${stableHash(resolved.qualifiedName)}`,
    name: resolved.name,
    qualifiedName: resolved.qualifiedName,
    kind: enumValues.length ? 'enum' : 'object',
    fields,
    enumValues,
    polymorphism: null,
    evidence: [{
      apkSha256: apkHash,
      split: 'base.apk',
      dex: dexName(text),
      source: relative(sourcesRoot, file),
      line: 1,
      symbol: resolved.qualifiedName,
      method: 'jadx',
    }],
    confidence: fields.length || enumValues.length ? 'direct' : 'inferred',
  };
}

function extractModels(endpoints, sourcesRoot, apkHash) {
  const classIndex = buildClassIndex(sourcesRoot);
  const pending = [...new Set(endpoints.flatMap(item => [...item.requestModelRefs, ...item.responseModelRefs]))];
  const visited = new Set();
  const models = [];
  while (pending.length) {
    const name = pending.shift();
    if (!name || visited.has(name) || /^(Unit|Object|String|Long|Integer|Boolean|ResponseBody|RequestBody|unknown)$/.test(name)) continue;
    visited.add(name);
    const model = parseModel(name, classIndex, sourcesRoot, apkHash);
    if (!model) continue;
    models.push(model);
    for (const field of model.fields) {
      const nested = field.qualifiedType || extractTypeName(field.type);
      if (nested && classIndex.has(nested) && !visited.has(nested)) pending.push(nested);
    }
  }
  const recovered = new Set(models.flatMap(model => [model.name, model.qualifiedName]));
  for (const endpoint of endpoints) {
    for (const name of [...endpoint.requestModelRefs, ...endpoint.responseModelRefs]) {
      if (!name || recovered.has(name) || /^(Unit|Object|String|Long|Integer|Boolean|Void|ResponseBody|RequestBody|unknown)$/.test(name)) continue;
      models.push({
        id: `model-${stableHash(`unresolved.${name}`)}`,
        name,
        qualifiedName: `unresolved.${name}`,
        kind: 'object',
        fields: [],
        enumValues: [],
        polymorphism: null,
        evidence: [endpoint.evidence[0]],
        confidence: 'unresolved',
      });
      recovered.add(name);
    }
  }
  return models.sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName));
}

function extractUrls(roots) {
  const candidates = new Map();
  const fileTypes = /\.(?:java|smali|xml|json|js|sql|proto|properties|txt)$/;
  const urlPattern = /https?:\\?\/\\?\/[^\s"'<>\\]+/g;
  for (const root of roots) {
    for (const file of walk(root, item => fileTypes.test(item))) {
      let text;
      try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
      for (const match of text.matchAll(urlPattern)) {
        const value = match[0].replaceAll('\\/', '/').replace(/[),.;]+$/, '');
        let host;
        try { host = new URL(value.replace(/\{[^}]+}/g, 'token')).hostname; } catch { continue; }
        const key = `${host}|${value}`;
        if (!candidates.has(key)) candidates.set(key, {
          url: value,
          host,
          evidence: `${path.basename(root)}/${relative(root, file)}:${lineNumber(text, match.index)}`,
        });
      }
    }
  }
  return [...candidates.values()].sort((a, b) => a.host.localeCompare(b.host) || a.url.localeCompare(b.url));
}

function extractNativeUrls(roots) {
  const urls = [];
  const urlPattern = /https?:\/\/[^\s"'<>\\]+/g;
  for (const root of roots) {
    for (const file of walk(root, item => item.endsWith('.so'))) {
      const result = spawnSync('strings', ['-a', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      if (result.status !== 0) continue;
      for (const match of result.stdout.matchAll(urlPattern)) {
        const value = match[0].replace(/[),.;]+$/, '');
        let host;
        try { host = new URL(value.replace(/\{[^}]+}/g, 'token')).hostname; } catch { continue; }
        urls.push({ url: value, host, evidence: `${path.basename(root)}/${relative(root, file)}:native-strings` });
      }
    }
  }
  return urls;
}

function extractProtocolIndicators(roots) {
  const patterns = {
    graphql: /\bgraphql\b/i,
    grpc: /\bgrpc\b|io\.grpc/i,
    websocket: /websocket|wss?:\/\//i,
    streaming: /rtsps?:\/\//i,
    rdis: /\brdis\b/i,
    duos: /\bduos\b|device update orchestration/i,
  };
  const counts = Object.fromEntries(Object.keys(patterns).map(key => [key, 0]));
  const evidence = Object.fromEntries(Object.keys(patterns).map(key => [key, []]));
  for (const root of roots) {
    for (const file of walk(root, item => /\.(?:java|smali|xml|json|js|sql|proto|properties|txt)$/.test(item))) {
      let text;
      try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
      for (const [name, pattern] of Object.entries(patterns)) {
        if (!pattern.test(text)) continue;
        counts[name] += 1;
        if (evidence[name].length < 20) evidence[name].push(`${path.basename(root)}/${relative(root, file)}`);
      }
    }
  }
  return { counts, evidence };
}

function classifyUrls(urls, endpoints) {
  const firstPartyCandidates = [];
  const exclusions = [];
  const unresolved = [];
  const knownBases = new Set(endpoints.map(item => item.baseHostTemplate));
  for (const item of urls) {
    if (knownBases.has(item.url)) {
      firstPartyCandidates.push({ ...item, classification: 'service-base' });
      continue;
    }
    const owner = THIRD_PARTY_OWNERS.find(([pattern]) => pattern.test(item.host));
    if (owner) {
      exclusions.push({ hostname: item.host, owner: owner[1], evidence: [item.evidence], reason: 'Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog.' });
    } else if (FIRST_PARTY_HOSTS.some(pattern => pattern.test(item.host))) {
      const classified = knownBases.has(item.url)
        || /(^|\.)eventstream\.immedia-semi\.com$/i.test(item.host);
      const nonApi = /(^|\.)(app-content|support)\.ring\.com$/i.test(item.host)
        || /(^|\.)(beta|gamma)\.site\.blink\.com$/i.test(item.host)
        || /(^|\.)crashtracking\.prod\.ring\.com$/i.test(item.host)
        || /^(?:www\.)?blink\.com$/i.test(item.host)
        || /^(?:download\.)?ring\.com$/i.test(item.host);
      if (nonApi) {
        firstPartyCandidates.push({ ...item, classification: 'excluded-non-api' });
        exclusions.push({ hostname: item.host, owner: 'Blink/Ring static content or observability', evidence: [item.evidence], reason: 'First-party host, but not an application API contract.' });
      } else if (!classified) {
        firstPartyCandidates.push({ ...item, classification: 'first-party-candidate' });
        unresolved.push({
        id: `unresolved-${stableHash(item.url)}`,
        category: 'url-candidate',
        value: item.url,
        reason: 'First-party URL literal is not a canonical Retrofit base and requires call-site interpretation.',
        evidence: [item.evidence],
      });
      } else firstPartyCandidates.push({ ...item, classification: 'service-base' });
    } else {
      exclusions.push({ hostname: item.host, owner: 'Other bundled dependency', evidence: [item.evidence], reason: 'Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations.' });
    }
  }
  const dedupe = items => [...new Map(items.map(item => [`${item.hostname || item.value}|${item.owner || item.reason}`, item])).values()];
  return { firstPartyCandidates, exclusions: dedupe(exclusions), unresolved: dedupe(unresolved) };
}

function apkMetadata(apkDir) {
  const apks = walk(apkDir, item => item.endsWith('.apk')).map(file => ({
    file: path.basename(file),
    sha256: sha256(file),
    size: fs.statSync(file).size,
  }));
  const base = apks.find(item => item.file === 'base.apk');
  if (!base) throw new Error(`No base.apk found under ${apkDir}`);
  const dirname = path.basename(path.dirname(apkDir));
  const versionMatch = dirname.match(/^(.+)-(\d+)$/);
  return {
    packageName: 'com.immediasemi.android.blink',
    versionName: versionMatch?.[1] || 'unknown',
    versionCode: versionMatch ? Number(versionMatch[2]) : 0,
    splits: apks,
    baseSha256: base.sha256,
    dexFiles: spawnSync('unzip', ['-Z1', path.join(apkDir, 'base.apk')], { encoding: 'utf8' }).stdout
      .split('\n').filter(item => /^classes\d*\.dex$/.test(item)).sort(),
  };
}

function toolVersion(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return { command: [command, ...args].join(' '), exitCode: result.status, version: `${result.stdout || result.stderr}`.trim().split('\n')[0] || 'unknown' };
}

function reportedErrorCount(output) {
  const text = `${output.stdoutTail || ''}\n${output.stderrTail || ''}`;
  const reported = text.match(/(?:with errors,\s*count:\s*|with\s+|,\s*)(\d+)\s*(?:errors?)?/i)?.[1];
  return reported ? Number(reported) : output.errorCount;
}

function readDecompilationReport(decompiledDir, metadata) {
  const reportFile = path.join(decompiledDir, 'decompilation-report.json');
  if (!fs.existsSync(reportFile)) throw new Error(`Missing decompilation report: ${reportFile}; run the decompile command first`);
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  if (report.schemaVersion !== 1 || !Array.isArray(report.outcomes) || !report.apkSet) {
    throw new Error(`Unsupported decompilation report format: ${reportFile}`);
  }
  const expectedSplits = new Map(report.apkSet.splits.map(item => [item.file, item.sha256]));
  const actualSplits = new Map(metadata.splits.map(item => [item.file, item.sha256]));
  if (expectedSplits.size !== actualSplits.size || [...expectedSplits].some(([file, hash]) => actualSplits.get(file) !== hash)) {
    throw new Error(`Decompilation report APK hashes do not match ${reportFile}`);
  }
  if (JSON.stringify(report.apkSet.dexFiles) !== JSON.stringify(metadata.dexFiles)) {
    throw new Error(`Decompilation report DEX inventory does not match ${reportFile}`);
  }
  report.outcomes = report.outcomes.map(outcome => ({ ...outcome, errorCount: reportedErrorCount(outcome) }));
  report.jadxReportedErrors = report.outcomes.find(outcome => outcome.tool === 'jadx')?.errorCount || 0;
  return report;
}

function extractSnapshot({ apkDir, decompiledDir }) {
  const metadata = apkMetadata(apkDir);
  const decompilationReport = readDecompilationReport(decompiledDir, metadata);
  const sourcesRoot = path.join(decompiledDir, 'jadx', 'sources');
  const apktoolRoot = path.join(decompiledDir, 'apktool-base');
  if (!fs.existsSync(sourcesRoot)) throw new Error(`Missing JADX sources: ${sourcesRoot}`);
  if (!fs.existsSync(apktoolRoot)) throw new Error(`Missing apktool output: ${apktoolRoot}`);
  const javaEndpoints = parseJavaEndpoints(sourcesRoot, metadata.baseSha256);
  const smaliEndpoints = parseSmaliEndpoints(apktoolRoot, metadata.baseSha256);
  const endpoints = mergeEndpoints(javaEndpoints, smaliEndpoints);
  const models = extractModels(endpoints, sourcesRoot, metadata.baseSha256);
  const scanRoots = [path.join(decompiledDir, 'jadx'), apktoolRoot];
  const urls = [...extractUrls(scanRoots), ...extractNativeUrls([decompiledDir])];
  const classifications = classifyUrls(urls, endpoints);
  const protocolIndicators = extractProtocolIndicators(scanRoots);
  return { metadata, decompilationReport, endpoints, models, urls, classifications, protocolIndicators, counts: { javaBindings: javaEndpoints.length, smaliBindings: smaliEndpoints.length } };
}

function applyLifecycle(current, baseline) {
  const oldByWire = new Map(baseline.endpoints.map(item => [item.normalizedIdentity, item]));
  const currentByWire = new Map(current.endpoints.map(item => [item.normalizedIdentity, item]));
  for (const endpoint of current.endpoints) {
    const old = oldByWire.get(endpoint.normalizedIdentity);
    if (!old) endpoint.lifecycle = 'added';
    else {
      const oldShape = JSON.stringify({ parameters: old.parameters, requestModelRefs: old.requestModelRefs, responseModelRefs: old.responseModelRefs, authentication: old.authentication });
      const newShape = JSON.stringify({ parameters: endpoint.parameters, requestModelRefs: endpoint.requestModelRefs, responseModelRefs: endpoint.responseModelRefs, authentication: endpoint.authentication });
      endpoint.lifecycle = oldShape === newShape ? 'unchanged' : 'changed';
    }
  }
  const removed = baseline.endpoints
    .filter(item => !currentByWire.has(item.normalizedIdentity))
    .map(item => ({ ...item, lifecycle: 'removed' }));
  current.endpoints.push(...removed);
  current.endpoints.sort((a, b) => a.serviceFamily.localeCompare(b.serviceFamily) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

function buildContract({ apkDir, decompiledDir, baselineApkDir, baselineDecompiledDir, acquiredAt }) {
  const current = extractSnapshot({ apkDir, decompiledDir });
  const baseline = baselineApkDir && baselineDecompiledDir
    ? extractSnapshot({ apkDir: baselineApkDir, decompiledDir: baselineDecompiledDir })
    : null;
  if (baseline) applyLifecycle(current, baseline);
  const activeEndpoints = current.endpoints.filter(item => item.lifecycle !== 'removed');
  const endpointEvidenceSources = new Set(activeEndpoints.flatMap(item => item.evidence.map(evidence => evidence.source)));
  const firstPartySmaliFiles = walk(path.join(decompiledDir, 'apktool-base'), item => item.endsWith('.smali') && /com\/(?:immediasemi|ring)\//.test(item));
  const diagnostics = {
    jadxReportedErrors: current.decompilationReport.jadxReportedErrors,
    apktoolResourceWarnings: current.decompilationReport.outcomes
      .filter(outcome => outcome.tool === 'apktool')
      .reduce((count, outcome) => count + outcome.warningCount, 0),
    unmatchedJavaRetrofitAnnotations: Math.max(0, current.counts.javaBindings - activeEndpoints.length),
    smaliOnlyContracts: activeEndpoints.filter(item => item.evidence.every(evidence => evidence.method === 'apktool-smali')).length,
    activeContractsWithoutSmaliEvidence: activeEndpoints.filter(item =>
      !item.evidence.some(evidence => evidence.method === 'apktool-smali')).length,
    unresolvedModels: current.models.filter(model => model.confidence === 'unresolved').length,
    firstPartySmaliFilesInspected: firstPartySmaliFiles.length,
    firstPartyEvidenceFiles: endpointEvidenceSources.size,
    unclassifiedFirstPartyCandidates: current.classifications.firstPartyCandidates
      .filter(item => item.classification === 'first-party-candidate').length,
  };
  const behavioralUnresolved = activeEndpoints.map(endpoint => ({
    id: `unresolved-${stableHash(`${endpoint.id}|behavior`)}`,
    category: 'endpoint-behavior',
    endpointId: endpoint.id,
    value: `${endpoint.method} ${endpoint.path}`,
    unresolvedFields: Object.entries(endpoint.recovery)
      .filter(([, state]) => state === 'unresolved')
      .map(([field]) => field),
    reason: 'The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.',
    evidence: endpoint.evidence.map(item => `${item.source}:${item.line}`),
  })).filter(item => item.unresolvedFields.length);
  const contract = {
    schemaVersion: '1.1.0',
    artifact: {
      ...current.metadata,
      acquiredAt: acquiredAt || null,
      evidenceMode: 'static-only',
      tools: current.decompilationReport.tools,
      commandOutcomes: current.decompilationReport.outcomes.map(outcome => ({
        command: outcome.command,
        status: outcome.exitCode === 0 ? 'completed' : outcome.tool === 'jadx' ? 'completed-with-errors' : 'failed',
        detail: `${outcome.errorCount} errors; ${outcome.warningCount} warnings`,
      })),
    },
    baseline: baseline ? {
      versionName: baseline.metadata.versionName,
      versionCode: baseline.metadata.versionCode,
      baseSha256: baseline.metadata.baseSha256,
    } : null,
    servicePolicies: {
      defaultHeaders: ['APP-BUILD', 'User-Agent', 'LOCALE', 'X-Blink-Time-Zone'],
      urlRewrites: ['{tier}', '{shared_tier}', '{env}', '{injected_account_id}', '{injected_client_id}'],
      authentication: 'Authenticated Blink REST calls use the persisted OAuth access token. TOKEN-AUTH is conditional on registration-token state. OAuth and public clients are unauthenticated.',
    },
    endpoints: current.endpoints,
    models: current.models,
    firstPartyCandidates: current.classifications.firstPartyCandidates,
    thirdPartyExclusions: current.classifications.exclusions,
    unresolved: [...current.classifications.unresolved, ...behavioralUnresolved]
      .sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics,
    protocolIndicators: current.protocolIndicators,
    completeness: {
      apkSplitsExpected: current.decompilationReport.apkSet.splits.length,
      apkSplitsObserved: current.metadata.splits.length,
      dexFilesExpected: current.decompilationReport.apkSet.dexFiles.length,
      dexFilesObserved: current.metadata.dexFiles.length,
      javaRetrofitBindings: current.counts.javaBindings,
      smaliRetrofitBindings: current.counts.smaliBindings,
      activeNormalizedContracts: activeEndpoints.length,
      removedContracts: current.endpoints.length - activeEndpoints.length,
      modelsRecovered: current.models.length,
      unresolvedCandidates: current.classifications.unresolved.length + behavioralUnresolved.length,
      unclassifiedFirstPartyCandidates: diagnostics.unclassifiedFirstPartyCandidates,
    },
  };
  return contract;
}

function validateContract(contract) {
  const errors = [];
  const allowedConfidence = new Set(['direct', 'corroborated', 'inferred', 'unresolved']);
  const allowedLifecycle = new Set(['added', 'changed', 'unchanged', 'removed']);
  if (contract.schemaVersion !== '1.1.0') errors.push('schemaVersion must be 1.1.0');
  for (const key of ['artifact', 'endpoints', 'models', 'thirdPartyExclusions', 'unresolved', 'diagnostics', 'completeness']) {
    if (contract[key] == null) errors.push(`missing top-level property: ${key}`);
  }
  const ids = new Set();
  const identities = new Set();
  const modelNames = new Set((contract.models || []).flatMap(model => [model.name, model.qualifiedName]));
  for (const endpoint of contract.endpoints || []) {
    for (const key of ['id', 'method', 'path', 'normalizedIdentity', 'serviceFamily', 'baseHostTemplate', 'authentication', 'evidence', 'confidence', 'lifecycle', 'security']) {
      if (endpoint[key] == null) errors.push(`${endpoint.id || 'endpoint'} missing ${key}`);
    }
    if (ids.has(endpoint.id)) errors.push(`duplicate endpoint id: ${endpoint.id}`);
    ids.add(endpoint.id);
    const identityKey = `${endpoint.normalizedIdentity}|${endpoint.lifecycle}`;
    if (identities.has(identityKey)) errors.push(`duplicate normalized contract: ${identityKey}`);
    identities.add(identityKey);
    if (!allowedConfidence.has(endpoint.confidence)) errors.push(`${endpoint.id} invalid confidence: ${endpoint.confidence}`);
    if (!allowedLifecycle.has(endpoint.lifecycle)) errors.push(`${endpoint.id} invalid lifecycle: ${endpoint.lifecycle}`);
    for (const field of ['declaration', 'models', 'serviceBinding', 'authentication', 'callSites', 'responseSemantics', 'deviceFamilies']) {
      if (!['resolved', 'inferred', 'unresolved'].includes(endpoint.recovery?.[field])) errors.push(`${endpoint.id} invalid recovery state for ${field}`);
    }
    for (const evidence of endpoint.evidence || []) {
      if (!/^[a-f0-9]{64}$/.test(evidence.apkSha256 || '')) errors.push(`${endpoint.id} evidence missing APK SHA-256`);
    }
    for (const ref of [...(endpoint.requestModelRefs || []), ...(endpoint.responseModelRefs || [])]) {
      if (!modelNames.has(ref) && !/^(Unit|Object|String|Long|Integer|Boolean|Void|ResponseBody|RequestBody|unknown)$/.test(ref)) {
        errors.push(`${endpoint.id} unresolved model reference: ${ref}`);
      }
    }
  }
  if (contract.completeness?.apkSplitsObserved !== contract.completeness?.apkSplitsExpected) errors.push('APK split coverage mismatch');
  if (contract.completeness?.dexFilesObserved !== contract.completeness?.dexFilesExpected) errors.push('DEX coverage mismatch');
  const activeEndpoints = (contract.endpoints || []).filter(endpoint => endpoint.lifecycle !== 'removed');
  const unclassified = (contract.firstPartyCandidates || []).filter(item => item.classification === 'first-party-candidate').length;
  const recomputed = {
    apkSplitsObserved: contract.artifact?.splits?.length || 0,
    dexFilesObserved: contract.artifact?.dexFiles?.length || 0,
    activeNormalizedContracts: activeEndpoints.length,
    removedContracts: (contract.endpoints || []).length - activeEndpoints.length,
    modelsRecovered: (contract.models || []).length,
    unresolvedCandidates: (contract.unresolved || []).length,
    unclassifiedFirstPartyCandidates: unclassified,
  };
  for (const [key, value] of Object.entries(recomputed)) {
    if (contract.completeness?.[key] !== value) errors.push(`${key} does not reconcile: expected ${value}, found ${contract.completeness?.[key]}`);
  }
  if (contract.diagnostics?.unclassifiedFirstPartyCandidates !== unclassified) errors.push('diagnostic unclassified first-party count does not reconcile');
  if (contract.completeness?.unclassifiedFirstPartyCandidates !== 0) errors.push('unclassified first-party candidates remain');
  return errors;
}

function validateJsonSchema(contract, schemaFile = path.resolve(__dirname, '../../docs/api-contract/schema.json')) {
  const schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  return validate(contract) ? [] : (validate.errors || []).map(error =>
    `${error.instancePath || '/'} ${error.message}`);
}

function decompileApkSet(apkDir, outputDir) {
  const apks = walk(apkDir, item => item.endsWith('.apk'));
  if (!apks.some(file => path.basename(file) === 'base.apk')) throw new Error(`No base.apk found under ${apkDir}`);
  fs.mkdirSync(outputDir, { recursive: true });
  const metadata = apkMetadata(apkDir);
  const outcomes = [];
  const jadxOutput = path.join(outputDir, 'jadx');
  const jadx = spawnSync('jadx', ['-d', jadxOutput, ...apks], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const makeOutcome = (tool, command, result) => {
    const stderr = `${result.stderr || ''}`;
    const stdout = `${result.stdout || ''}`;
    const diagnosticOutput = `${stdout}\n${stderr}`;
    const reported = diagnosticOutput.match(/(?:with errors,\s*count:\s*|with\s+|,\s*)(\d+)\s*(?:errors?)?/i)?.[1];
    return {
      tool,
      command,
      exitCode: result.status,
      errorCount: reported ? Number(reported) : (result.status === 0 ? 0 : (diagnosticOutput.match(/\bERROR\b/g) || []).length),
      warningCount: (diagnosticOutput.match(/\bWARN(?:ING)?\b/gi) || []).length,
      stdoutTail: stdout.slice(-20000),
      stderrTail: stderr.slice(-20000),
    };
  };
  outcomes.push(makeOutcome('jadx', `jadx -d ${jadxOutput} <APK set>`, jadx));
  for (const apk of apks) {
    const name = path.basename(apk, '.apk');
    const target = path.join(outputDir, `apktool-${name}`);
    const result = spawnSync('apktool', ['d', '-f', apk, '-o', target], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    outcomes.push(makeOutcome('apktool', `apktool d -f ${path.basename(apk)} -o ${target}`, result));
  }
  const report = {
    schemaVersion: 1,
    apkSet: { splits: metadata.splits, dexFiles: metadata.dexFiles },
    tools: [toolVersion('jadx', ['--version']), toolVersion('apktool', ['--version'])],
    jadxReportedErrors: outcomes.find(outcome => outcome.tool === 'jadx')?.errorCount || 0,
    outcomes,
  };
  fs.writeFileSync(path.join(outputDir, 'decompilation-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (outcomes.some(outcome => outcome.command.startsWith('apktool') && outcome.exitCode !== 0)) throw new Error('One or more apktool decodes failed; inspect decompilation-report.json');
  return report;
}

function markdownEscape(value) {
  return `${value ?? ''}`.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function renderMarkdown(contract) {
  const active = contract.endpoints.filter(item => item.lifecycle !== 'removed');
  const byService = new Map();
  for (const endpoint of contract.endpoints) {
    if (!byService.has(endpoint.serviceFamily)) byService.set(endpoint.serviceFamily, []);
    byService.get(endpoint.serviceFamily).push(endpoint);
  }
  const lifecycle = Object.fromEntries(['added', 'changed', 'unchanged', 'removed'].map(state => [state, contract.endpoints.filter(item => item.lifecycle === state).length]));
  const lines = [
    '# Blink API Contract — Android 59.2', '',
    '> Generated from `docs/api-contract/blink-59.2-29823413.json`. Do not edit endpoint tables by hand.', '',
    '## Acquisition and provenance', '',
    `- Package: \`${contract.artifact.packageName}\``,
    `- Version: \`${contract.artifact.versionName}\` (\`${contract.artifact.versionCode}\`)`,
    `- Base APK SHA-256: \`${contract.artifact.baseSha256}\``,
    `- Evidence mode: \`${contract.artifact.evidenceMode}\``,
    `- APK splits: ${contract.artifact.splits.length}; DEX files: ${contract.artifact.dexFiles.length}`,
    `- JADX result: ${contract.artifact.commandOutcomes[0].status}; apktool result: ${contract.artifact.commandOutcomes[1].status}`, '',
    'Static evidence describes client declarations and bounded construction evidence. It does not prove current server behavior or authorize live calls. Per-endpoint `recovery` state in the canonical JSON distinguishes resolved declarations from inferred service/authentication mapping and unresolved runtime behavior.', '',
    '## Service, host, and interceptor map', '',
    '| Service | Base host template | Active contracts | Authentication |',
    '|---|---|---:|---|',
  ];
  for (const [service, endpoints] of [...byService.entries()].sort()) {
    const current = endpoints.filter(item => item.lifecycle !== 'removed');
    if (!current.length) continue;
    const authenticationModes = [...new Set(current.map(item => item.authentication.mode))].sort().join(', ');
    lines.push(`| ${service} | \`${markdownEscape(current[0].baseHostTemplate)}\` | ${current.length} | ${markdownEscape(authenticationModes)} |`);
  }
  lines.push('', 'Default headers: `APP-BUILD`, `User-Agent`, `LOCALE`, `X-Blink-Time-Zone`. URL rewriting tokens: `{tier}`, `{shared_tier}`, `{env}`, `{injected_account_id}`, `{injected_client_id}`.', '');
  lines.push('## Authentication cascade', '',
    'Corroborated service-level static evidence retains hosted authorization, `oauth/token` exchange, persisted bearer-token attachment, conditional `TOKEN-AUTH`, and authenticated-host HTTP 401 refresh behavior. Blink 59.2 adds OTP verification and WebAuthn registration declarations. Endpoint-level authentication assignment is marked `inferred` unless the declaration itself supplies explicit authorization evidence; none of this proves current server behavior.', '');
  lines.push('## Endpoint catalog', '');
  for (const [service, endpoints] of [...byService.entries()].sort()) {
    lines.push(`### ${service}`, '', '| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |', '|---|---|---|---|---|---|---|---|---|');
    for (const endpoint of endpoints) {
      const evidence = endpoint.evidence[0];
      lines.push(`| ${endpoint.method} | \`${markdownEscape(endpoint.path)}\` | ${markdownEscape(endpoint.feature)} | ${markdownEscape(endpoint.authentication.mode)} | ${markdownEscape(endpoint.requestModelRefs.join(', ') || '—')} | ${markdownEscape(endpoint.responseModelRefs.join(', ') || '—')} | ${endpoint.lifecycle} | ${endpoint.confidence} | \`${markdownEscape(`${evidence.source}:${evidence.line}`)}\` |`);
    }
    lines.push('');
  }
  lines.push('## Request and response schema index', '', '| Model | Kind | Fields | Confidence | Evidence |', '|---|---|---:|---|---|');
  for (const model of contract.models) {
    const evidence = model.evidence[0];
    lines.push(`| \`${model.name}\` | ${model.kind} | ${model.fields.length || model.enumValues.length} | ${model.confidence} | \`${markdownEscape(evidence.source)}\` |`);
  }
  lines.push('', '## Command, polling, retry, and error semantics', '',
    '- Command-producing endpoints are identified by response model and feature, but server status codes not declared in the APK remain unknown.',
    '- Static polling/retry semantics are retained as service-level evidence; they must not be treated as proof of current server timing.',
    '- No new 59.2 Retrofit declaration establishes a general HTTP 409 serialization or retry contract.', '');
  lines.push('## Dynamic transports', '',
    '- RDIS/DUOS, event-stream, WebSocket, RTSP, and local-device indicators are indexed under `protocolIndicators`.',
    '- The declaration catalog separates known service families, but it does not claim complete call-site, signaling, retry, device-family, or runtime-host reconstruction.',
    '- Consult each endpoint recovery state and its unresolved record before treating transport attribution as established.', '');
  lines.push('## 57.1 → 59.2 change report', '', `- Added: ${lifecycle.added}`, `- Changed: ${lifecycle.changed}`, `- Unchanged: ${lifecycle.unchanged}`, `- Removed: ${lifecycle.removed}`, '');
  for (const state of ['added', 'changed', 'removed']) {
    const items = contract.endpoints.filter(item => item.lifecycle === state);
    if (!items.length) continue;
    lines.push(`### ${state[0].toUpperCase()}${state.slice(1)}`, '');
    for (const endpoint of items) lines.push(`- \`${endpoint.method} ${endpoint.path}\` (${endpoint.serviceFamily})`);
    lines.push('');
  }
  lines.push('## Third-party exclusions', '', '| Host | Owner | Reason |', '|---|---|---|');
  for (const exclusion of contract.thirdPartyExclusions) lines.push(`| ${markdownEscape(exclusion.hostname)} | ${markdownEscape(exclusion.owner)} | ${markdownEscape(exclusion.reason)} |`);
  lines.push('', '## Unresolved evidence and completeness', '',
    `- Active normalized contracts: ${active.length}`,
    `- Models recovered: ${contract.models.length}`,
    `- Unresolved candidates: ${contract.unresolved.length}`,
    `- Smali-only contracts: ${contract.diagnostics.smaliOnlyContracts}`,
    `- Active contracts without smali evidence: ${contract.diagnostics.activeContractsWithoutSmaliEvidence}`,
    `- Unresolved models: ${contract.diagnostics.unresolvedModels}`,
    `- Unclassified first-party candidates: ${contract.diagnostics.unclassifiedFirstPartyCandidates}`,
    `- JADX reported errors: ${contract.diagnostics.jadxReportedErrors}`, '');
  for (const item of contract.unresolved) lines.push(`- **${item.category}:** \`${markdownEscape(item.value)}\` — ${markdownEscape(item.reason)}`);
  lines.push('', '## Preserved historical and live evidence', '',
    'The legacy `docs/blink_api_dossier.md` retains evidence IDs E1–E95 and bounded live-account observations. Those observations are not inputs to this static 59.2 contract and remain explicitly distinguished from APK evidence.', '');
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

function parseArgs(argv) {
  const args = { command: argv[2] || 'generate' };
  for (let index = 3; index < argv.length; index += 2) args[argv[index].replace(/^--/, '')] = argv[index + 1];
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.command === 'validate') {
    const contract = JSON.parse(fs.readFileSync(args.input, 'utf8'));
    const errors = [...validateJsonSchema(contract, args.schema), ...validateContract(contract)];
    if (errors.length) throw new Error(errors.join('\n'));
    process.stdout.write(`Valid contract: ${contract.endpoints.length} endpoint records, ${contract.models.length} models\n`);
    return;
  }
  if (args.command === 'decompile') {
    const report = decompileApkSet(args['apk-dir'], args['output-dir']);
    process.stdout.write(`${JSON.stringify(report.outcomes.map(item => ({ command: item.command, exitCode: item.exitCode })), null, 2)}\n`);
    return;
  }
  if (args.command === 'render') {
    const contract = JSON.parse(fs.readFileSync(args.input, 'utf8'));
    fs.writeFileSync(args.markdown, renderMarkdown(contract));
    return;
  }
  if (args.command !== 'generate') throw new Error(`Unknown command: ${args.command}`);
  const contract = buildContract({
    apkDir: args['apk-dir'],
    decompiledDir: args['decompiled-dir'],
    baselineApkDir: args['baseline-apk-dir'],
    baselineDecompiledDir: args['baseline-decompiled-dir'],
    acquiredAt: args['acquired-at'],
  });
  const errors = [...validateJsonSchema(contract, args.schema), ...validateContract(contract)];
  if (errors.length) throw new Error(errors.join('\n'));
  fs.writeFileSync(args.output, `${JSON.stringify(contract, null, 2)}\n`);
  if (args.markdown) fs.writeFileSync(args.markdown, renderMarkdown(contract));
  process.stdout.write(`${JSON.stringify(contract.completeness, null, 2)}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
}

module.exports = {
  buildContract,
  extractProtocolIndicators,
  extractModels,
  mergeEndpoints,
  normalizePath,
  parseJavaEndpoints,
  parseSmaliEndpoints,
  renderMarkdown,
  splitParameters,
  validateContract,
  validateJsonSchema,
};
