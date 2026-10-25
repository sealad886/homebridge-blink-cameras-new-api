import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { accessSync, closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import process from 'node:process';

export const MEDIA_WORKER_TARGETS = Object.freeze(['linux-arm64', 'linux-x64', 'darwin-arm64', 'darwin-x64', 'win32-x64'] as const);
export type MediaWorkerTarget = typeof MEDIA_WORKER_TARGETS[number];
export interface MediaWorkerManifest {
  schemaVersion: 1;
  targets: Record<MediaWorkerTarget, { path: string; sha256: string }>;
}

const MAX_WORKER_BYTES = 64 * 1024 * 1024;
const unavailable = (): Error => new Error('Packaged media worker unavailable');
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

/** Closed five-target package contract; validation does not establish binary/codec acceptance. */
export function validateMediaWorkerManifest(value: unknown): MediaWorkerManifest {
  if (!record(value) || !exactKeys(value, ['schemaVersion', 'targets']) || value.schemaVersion !== 1 ||
      !record(value.targets) || !exactKeys(value.targets, MEDIA_WORKER_TARGETS)) throw unavailable();
  const targets = {} as MediaWorkerManifest['targets'];
  const paths = new Set<string>();
  for (const target of MEDIA_WORKER_TARGETS) {
    const artifact = value.targets[target];
    if (!record(artifact) || !exactKeys(artifact, ['path', 'sha256']) ||
        typeof artifact.path !== 'string' || artifact.path.length > 240 ||
        !artifact.path.split('/').every(part => /^[A-Za-z0-9_-](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/.test(part)) ||
        (target === 'win32-x64' && !artifact.path.endsWith('.exe')) ||
        typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
        paths.has(artifact.path.toLowerCase())) throw unavailable();
    paths.add(artifact.path.toLowerCase());
    targets[target] = { path: artifact.path, sha256: artifact.sha256 };
  }
  return { schemaVersion: 1, targets };
}

/**
 * Select only shipped bytes from trusted package metadata. Package installation must remain
 * protected from concurrent local modification between verification and the caller's spawn.
 * No executable is launched here; binary format and clean-target acceptance belong to CI.
 */
export function resolveMediaWorkerArtifact(packageRoot: string, manifest: unknown,
  platform: string = process.platform, architecture: string = process.arch): string {
  let descriptor: number | undefined;
  try {
    const target = `${platform}-${architecture}`;
    if (!MEDIA_WORKER_TARGETS.some(known => known === target)) throw unavailable();
    const artifact = validateMediaWorkerManifest(manifest).targets[target as MediaWorkerTarget];
    if (!isAbsolute(packageRoot) || !lstatSync(packageRoot).isDirectory()) throw unavailable();
    let path = realpathSync(packageRoot);
    const parts = artifact.path.split('/');
    for (const [index, part] of parts.entries()) {
      path = join(path, part);
      const stat = lstatSync(path);
      if (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) throw unavailable();
    }
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size < 1 || before.size > MAX_WORKER_BYTES ||
        (process.platform !== 'win32' && !(before.mode & 0o111))) throw unavailable();
    accessSync(path, constants.X_OK);
    const hash = createHash('sha256');
    const chunk = Buffer.alloc(65536);
    let offset = 0;
    while (offset < before.size) {
      const count = readSync(descriptor, chunk, 0, Math.min(chunk.length, before.size - offset), offset);
      if (!count) throw unavailable();
      hash.update(chunk.subarray(0, count));
      offset += count;
    }
    const after = lstatSync(path);
    if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs || hash.digest('hex') !== artifact.sha256) throw unavailable();
    return path;
  } catch {
    // Filesystem errors can contain arbitrary paths; expose only a bounded fixed diagnostic.
    throw unavailable();
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
