import { normalizeNativeCameraToken, parseNativeStorageCatalog, parseNativeStorageCommand, parseNativeStorageManifest, requireNativeStorageModule } from '../../src/blink-api/local-storage';

const clip = { id: '900719925474099312345', size: '32768', camera_name: 'PorchCamera', created_at: '2026-11-03T12:34:56+00:00' };
const catalog = { version: '1.0', manifest_id: 'manifest-1', clips: [clip] };

it('preserves decimal clip identity and preserves the provider KiB estimate', () => {
  expect(parseNativeStorageCatalog(catalog)).toEqual({
    manifestId: 'manifest-1',
    clips: [{ clipId: clip.id, sizeKiB: 32768, cameraToken: 'PorchCamera', capturedAt: clip.created_at }],
  });
});

it.each([
  null, undefined, [], {}, { ...catalog, version: 1 },
  { ...catalog, manifest_id: '../other' }, { ...catalog, manifest_id: '%2fpath' },
  { ...catalog, manifest_id: '..' }, { ...catalog, manifest_id: 'x'.repeat(129) },
  { ...catalog, manifest_id: 'manifest-1\n' }, { ...catalog, version: '1\n' },
  { ...catalog, clips: {} }, { ...catalog, clips: [null] },
  ...[1, '01', '1.5', '-1', '1/2', '1e4', '9'.repeat(65), '123\n'].map(id => ({ ...catalog, clips: [{ ...clip, id }] })),
  ...[10, '0', '01', '-1', '3.5', '32769', '9'.repeat(100), '24\n'].map(size => ({ ...catalog, clips: [{ ...clip, size }] })),
  ...['', 'Camera/name', 'a'.repeat(257), 'Camera\n'].map(camera_name => ({ ...catalog, clips: [{ ...clip, camera_name }] })),
  ...['2026-02-30T12:34:56Z', '2026-13-03T12:34:56Z', '2026-11-03T25:00:00Z',
    '2026-11-03T12:34:56', '2026-11-03T12:34:56+25:00', 'untrusted-marker'].map(created_at => ({ ...catalog, clips: [{ ...clip, created_at }] })),
  { ...catalog, clips: Array(1001).fill(clip) },
])('rejects invalid catalog metadata without echoing provider fields (%#)', value => {
  expect(() => parseNativeStorageCatalog(value)).toThrow();
  try { parseNativeStorageCatalog(value); } catch (error) {
    expect(String(error)).not.toContain('untrusted-marker');
  }
});

it('scans a full unsorted catalog and accepts an empty catalog and minimum size', () => {
  const clips = Array.from({ length: 1000 }, (_, index) => ({ ...clip, id: String(1000 - index), size: '1' }));
  const parsed = parseNativeStorageCatalog({ ...catalog, clips });
  expect(parsed.clips).toHaveLength(1000);
  expect(parsed.clips[999]).toMatchObject({ clipId: '1', sizeKiB: 1 });
  expect(parseNativeStorageCatalog({ ...catalog, clips: [] }).clips).toEqual([]);
});

it('validates command network identity before returning persistable context', () => {
  expect(parseNativeStorageCommand({ id: 7, network_id: 2 }, 2)).toEqual({ commandId: 7 });
  for (const value of [null, {}, { id: 7, network_id: 3 }, { id: '7', network_id: 2 },
    { id: 0, network_id: 2 }, { id: Number.MAX_SAFE_INTEGER + 1, network_id: 2 }]) {
    expect(() => parseNativeStorageCommand(value, 2)).toThrow();
  }
});

it('recognizes only the matching command acknowledgement as pending', () => {
  expect(parseNativeStorageManifest({ id: 7, network_id: 2 }, 2, 7)).toEqual({ state: 'pending' });
  expect(parseNativeStorageManifest(catalog, 2, 7)).toEqual({ state: 'ready', catalog: parseNativeStorageCatalog(catalog) });
  for (const value of [{}, { complete: false }, { id: 8, network_id: 2 }, { id: 7, network_id: 3 },
    { id: 7, network_id: 2, error: 'unknown' }, { ...catalog, network_id: 3 },
    { id: 7, network_id: 2, clips: null }, { ...catalog, clips: null }]) {
    expect(() => parseNativeStorageManifest(value, 2, 7)).toThrow();
  }
});

it('validates positive safe numeric module and network IDs', () => {
  expect(requireNativeStorageModule({ networkId: 2, syncModuleId: 3 })).toEqual({ networkId: 2, syncModuleId: 3 });
  for (const value of [null, {}, { networkId: 2, syncModuleId: 0 }, { networkId: '2', syncModuleId: 3 },
    { networkId: -1, syncModuleId: 3 }, { networkId: 2, syncModuleId: Number.MAX_SAFE_INTEGER + 1 }]) {
    expect(() => requireNativeStorageModule(value)).toThrow();
  }
});


it('shares bounded provider-name normalization with Unicode and underscore catalog tokens', () => {
  for (const [name, token] of [['Garden_Camera', 'Garden_Camera'], ['Cámara de Éabha!', 'CámaradeÉabha'], ['客厅 ２', '客厅２']]) {
    expect(normalizeNativeCameraToken(name)).toBe(token);
    expect(parseNativeStorageCatalog({ ...catalog, clips: [{ ...clip, camera_name: token }] }).clips[0].cameraToken).toBe(token);
  }
  expect(() => normalizeNativeCameraToken('! '.repeat(5))).toThrow();
  expect(() => normalizeNativeCameraToken('é'.repeat(257))).toThrow();
});


it('keeps the observed 5073 KiB catalog estimate as metadata rather than an exact byte length', () => {
  expect(parseNativeStorageCatalog({ ...catalog, clips: [{ ...clip, size: '5073' }] }).clips[0]).toMatchObject({ sizeKiB: 5073 });
});
