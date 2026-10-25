import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { resolveMediaWorkerArtifact, validateMediaWorkerManifest, type MediaWorkerManifest } from '../src/accessories/media-worker-artifact';

// Synthetic bytes exercise package integrity, never target launch or codec acceptance.
const targets = ['linux-arm64', 'linux-x64', 'darwin-arm64', 'darwin-x64', 'win32-x64'] as const;
let root: string;
let manifest: MediaWorkerManifest;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'blink-worker-artifact-')));
  manifest = { schemaVersion: 1, targets: {} as MediaWorkerManifest['targets'] };
  for (const target of targets) {
    const path = `native/${target}/worker${target.startsWith('win32') ? '.exe' : ''}`;
    const bytes = Buffer.from(`synthetic ${target}`);
    mkdirSync(join(root, 'native', target), { recursive: true });
    writeFileSync(join(root, path), bytes, { mode: 0o755 });
    manifest.targets[target] = { path, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
});

afterEach(() => { rmSync(root, { recursive: true, force: true }); });

it.each(targets)('selects exact packaged target %s by verified bytes', target => {
  const [platform, architecture] = target.split('-');
  expect(resolveMediaWorkerArtifact(root, manifest, platform, architecture)).toBe(join(root, manifest.targets[target].path));
});

it('requires executable permissions on POSIX', () => {
  if (process.platform === 'win32') return;
  chmodSync(join(root, manifest.targets['linux-x64'].path), 0o644);
  expect(() => resolveMediaWorkerArtifact(root, manifest, 'linux', 'x64')).toThrow();
});

it.each([['freebsd', 'x64'], ['linux', 'arm'], ['win32', 'arm64'], ['linux-x64', '']])(
  'rejects unsupported platform/architecture %s/%s', (platform, architecture) => {
    expect(() => resolveMediaWorkerArtifact(root, manifest, platform, architecture)).toThrow();
  });

it.each([
  null, [], {}, { schemaVersion: 2, targets: {} },
])('rejects malformed manifest %j', invalid => {
  expect(() => resolveMediaWorkerArtifact(root, invalid, 'linux', 'x64')).toThrow();
});

it('rejects missing unselected targets', () => {
  delete (manifest.targets as Partial<MediaWorkerManifest['targets']>)['darwin-x64'];
  expect(() => resolveMediaWorkerArtifact(root, manifest, 'linux', 'x64')).toThrow();
});

it('rejects extra targets rather than admitting an unreviewed platform', () => {
  Object.assign(manifest.targets, { 'linux-ia32': manifest.targets['linux-x64'] });
  expect(() => resolveMediaWorkerArtifact(root, manifest, 'linux', 'x64')).toThrow();
});

it.each(['../worker', '/worker', 'native/../worker', './worker', 'native//worker',
  'C:/worker.exe', 'native\\worker.exe', 'native/worker\0', 'native/worker:stream', 'native/worker.'])(
  'rejects unsafe package path %j even on unselected target', path => {
    manifest.targets['darwin-x64'].path = path;
    expect(() => resolveMediaWorkerArtifact(root, manifest, 'linux', 'x64')).toThrow();
  });

it('rejects malformed hashes even on unselected targets', () => {
  manifest.targets['darwin-x64'].sha256 = 'not-a-sha256';
  expect(() => resolveMediaWorkerArtifact(root, manifest, 'linux', 'x64')).toThrow();
});

it('validates package metadata independently of selected target filesystem', () => {
  expect(validateMediaWorkerManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
  Object.assign(manifest, { downloadUrl: 'https://example.test/worker' });
  expect(() => validateMediaWorkerManifest(manifest)).toThrow();
});

it('rejects duplicate target artifact paths and undeclared descriptor fields', () => {
  const other = manifest.targets['darwin-x64'];
  const original = other.path;
  other.path = manifest.targets['linux-x64'].path;
  expect(() => validateMediaWorkerManifest(manifest)).toThrow();
  other.path = original;
  Object.assign(other, { fallback: 'ffmpeg' });
  expect(() => validateMediaWorkerManifest(manifest)).toThrow();
});

it('requires Windows executable suffix', () => {
  manifest.targets['win32-x64'].path = 'native/win32-x64/worker';
  expect(() => resolveMediaWorkerArtifact(root, manifest, 'linux', 'x64')).toThrow();
});

it('rejects file tampering after package metadata creation', () => {
  writeFileSync(join(root, manifest.targets['linux-x64'].path), 'replacement');
  expect(() => resolveMediaWorkerArtifact(root, manifest, 'linux', 'x64')).toThrow();
});

it('rejects missing files and directories in place of workers', () => {
  const path = join(root, manifest.targets['linux-x64'].path);
  rmSync(path);
  expect(() => resolveMediaWorkerArtifact(root, manifest, 'linux', 'x64')).toThrow();
  mkdirSync(path);
  expect(() => resolveMediaWorkerArtifact(root, manifest, 'linux', 'x64')).toThrow();
});

it('rejects file symlinks despite matching bytes', () => {
  const path = join(root, manifest.targets['linux-x64'].path);
  renameSync(path, path + '-real');
  symlinkSync(path + '-real', path, 'file');
  expect(() => resolveMediaWorkerArtifact(root, manifest, 'linux', 'x64')).toThrow();
});

it('rejects symlinked parent directories despite matching bytes', () => {
  const directory = join(root, 'native', 'linux-x64');
  renameSync(directory, directory + '-real');
  symlinkSync(directory + '-real', directory, process.platform === 'win32' ? 'junction' : 'dir');
  expect(() => resolveMediaWorkerArtifact(root, manifest, 'linux', 'x64')).toThrow();
});

it('rejects symlinked package roots and relative roots', () => {
  const alias = join(root, 'alias');
  symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  expect(() => resolveMediaWorkerArtifact(alias, manifest, 'linux', 'x64')).toThrow();
  expect(() => resolveMediaWorkerArtifact('.', manifest, 'linux', 'x64')).toThrow();
});

it('rejects empty and oversized worker files before hashing', () => {
  const path = join(root, manifest.targets['linux-x64'].path);
  truncateSync(path, 0);
  manifest.targets['linux-x64'].sha256 = createHash('sha256').digest('hex');
  expect(() => resolveMediaWorkerArtifact(root, manifest, 'linux', 'x64')).toThrow();
  truncateSync(path, 64 * 1024 * 1024 + 1);
  expect(() => resolveMediaWorkerArtifact(root, manifest, 'linux', 'x64')).toThrow();
});
