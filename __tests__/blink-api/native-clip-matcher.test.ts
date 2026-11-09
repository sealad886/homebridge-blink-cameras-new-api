import { matchNativeClip, nativeClipIdentity, type NativeClipMatchOptions } from '../../src/blink-api/native-clip-matcher';
import type { NativeMotionDevice } from '../../src/blink-api/motion-events';
import type { NativeStorageClip } from '../../src/blink-api/native-storage';

const at = Date.parse('2026-11-09T06:00:00Z');
const camera: NativeMotionDevice = {
  accountId: 10, networkId: 20, syncModuleId: 30, moduleId: 'sync:30', providerId: 40,
  target: 'known-target', cameraId: 'camera:40', nativeName: 'Entry native name',
};
const scope = { accountId: 10, networkId: 20, syncModuleId: 30, moduleId: 'sync:30' };
const clip = (clipId: number, overrides: Partial<NativeStorageClip> = {}): NativeStorageClip => ({
  clipId, networkId: 20, deviceName: 'Entry native name', capturedAt: '2026-11-09T06:00:00Z',
  mediaUrl: `/opaque/local_storage/manifest/91/clip/request/${clipId}`, ...overrides,
});
const options = (clips: NativeStorageClip[], overrides: Partial<NativeClipMatchOptions> = {}): NativeClipMatchOptions => ({
  catalog: { manifestId: 91, clips, pageSize: 1_000, paginationKey: null },
  scope, camera, devices: [camera], occurredAt: at, toleranceMs: 2_000, ...overrides,
});

describe('native clip metadata matching', () => {
  it('matches exact native name/network and preserves original capture text and media identity', () => {
    const selected = clip(101, { capturedAt: '2026-11-09T07:00:00.500+01:00' });
    const result = matchNativeClip(options([selected]));

    expect(result).toEqual({
      status: 'matched', manifestId: 91, clip: selected, captureTimeMs: at + 500, deltaMs: 500,
      identity: nativeClipIdentity(scope, selected),
    });
  });

  it('chooses the nearest unique candidate independently of catalog ordering', () => {
    const farther = clip(101, { capturedAt: '2026-11-09T06:00:01.500Z' });
    const nearer = clip(102, { capturedAt: '2026-11-09T05:59:59.500Z' });
    const forward = matchNativeClip(options([farther, nearer]));
    const reversed = matchNativeClip(options([nearer, farther]));

    expect(forward).toEqual(reversed);
    expect(forward.status).toBe('matched');
    if (forward.status === 'matched') expect(forward.clip.clipId).toBe(102);
  });

  it('includes both tolerance boundaries and rejects the next millisecond', () => {
    for (const timestamp of ['2026-11-09T05:59:58.000Z', '2026-11-09T06:00:02.000Z']) {
      expect(matchNativeClip(options([clip(101, { capturedAt: timestamp })])).status).toBe('matched');
    }
    expect(matchNativeClip(options([clip(101, { capturedAt: '2026-11-09T06:00:02.001Z' })]))).toEqual({ status: 'missing' });
  });

  it('rejects equidistant distinct media instead of guessing by media ID or list order', () => {
    const before = clip(101, { capturedAt: '2026-11-09T05:59:59Z' });
    const after = clip(102, { capturedAt: '2026-11-09T06:00:01Z' });

    expect(matchNativeClip(options([before, after]))).toEqual({ status: 'ambiguous', reason: 'equidistant-clips' });
    expect(matchNativeClip(options([after, before]))).toEqual({ status: 'ambiguous', reason: 'equidistant-clips' });
  });

  it('rejects duplicate native names for distinct known camera identities in the same scope', () => {
    const other = { ...camera, providerId: 41, cameraId: 'camera:41' };
    expect(matchNativeClip(options([clip(101)], { devices: [camera, other] }))).toEqual({ status: 'ambiguous', reason: 'duplicate-device-name' });
    const otherKind = { ...camera, target: 'other-kind', cameraId: 'other-kind:40' };
    expect(matchNativeClip(options([clip(101)], { devices: [camera, otherKind] }))).toEqual({ status: 'ambiguous', reason: 'duplicate-device-name' });
  });

  it('does not confuse equal names on other networks/modules/accounts', () => {
    const devices = [camera, { ...camera, networkId: 21 }, { ...camera, syncModuleId: 31, moduleId: 'sync:31' }, { ...camera, accountId: 11 }];
    expect(matchNativeClip(options([clip(101)], { devices })).status).toBe('matched');
  });

  it('never matches HomeKit display aliases or wrong-camera/network metadata', () => {
    expect(matchNativeClip(options([clip(101, { deviceName: 'Entry' })]))).toEqual({ status: 'missing' });
    expect(matchNativeClip(options([clip(101, { deviceName: 'Corner' })]))).toEqual({ status: 'missing' });
    expect(matchNativeClip(options([clip(101, { networkId: 21 })]))).toEqual({ status: 'missing' });
  });

  it('requires the selected camera to exist in the authoritative device inventory', () => {
    expect(matchNativeClip(options([clip(101)], { devices: [] }))).toEqual({ status: 'invalid', reason: 'unknown-camera' });
    expect(matchNativeClip(options([clip(101)], { camera: { ...camera, nativeName: 'arbitrary-name' } })))
      .toEqual({ status: 'invalid', reason: 'unknown-camera' });
  });

  it.each([
    { accountId: 11 }, { networkId: 21 }, { syncModuleId: 31 }, { moduleId: 'other-module' },
  ])('rejects catalog/device scope mismatch: %p', changed => {
    expect(matchNativeClip(options([clip(101)], { scope: { ...scope, ...changed } }))).toEqual({ status: 'invalid', reason: 'scope-mismatch' });
  });

  it('reports conflicting metadata for the same native media ID as unsafe', () => {
    const current = clip(101);
    const wrongCamera = clip(101, { deviceName: 'Corner' });
    expect(matchNativeClip(options([current, wrongCamera]))).toEqual({ status: 'ambiguous', reason: 'conflicting-clip-identity' });
    expect(matchNativeClip(options([current, clip(101, { mediaUrl: '/different-opaque-route' })])))
      .toEqual({ status: 'ambiguous', reason: 'conflicting-clip-identity' });
  });

  it('deduplicates identical catalog rows, including equivalent timestamp offsets', () => {
    const current = clip(101);
    expect(matchNativeClip(options([current, { ...current }, { ...current, capturedAt: '2026-11-09T07:00:00+01:00' }])).status).toBe('matched');
  });

  it('excludes already consumed clip identities rather than repeatedly importing one clip', () => {
    const current = clip(101);
    const consumedClipIdentities = new Set([nativeClipIdentity(scope, current)!]);
    expect(matchNativeClip(options([current], { consumedClipIdentities }))).toEqual({ status: 'missing' });
    const laterReuse = clip(101, { capturedAt: '2026-11-09T06:00:01Z' });
    expect(matchNativeClip(options([laterReuse], { consumedClipIdentities })).status).toBe('matched');
  });

  it('does not infer a filename, date, camera or capture time from an opaque URL', () => {
    const misleading = clip(101, { capturedAt: null, mediaUrl: '/2026/11/09/06-00-00_Entry.mp4' });
    expect(matchNativeClip(options([misleading]))).toEqual({ status: 'missing' });
    expect(matchNativeClip(options([clip(101, { capturedAt: '2026-11-09T06:00:00' })]))).toEqual({ status: 'missing' });
    expect(matchNativeClip(options([clip(101, { mediaUrl: null })]))).toEqual({ status: 'missing' });
  });

  it('treats an empty valid catalog as missing without constructing a manifest-zero request', () => {
    expect(matchNativeClip(options([], { catalog: { manifestId: null, clips: [], pageSize: null, paginationKey: null } }))).toEqual({ status: 'missing' });
    expect(matchNativeClip(options([clip(101)], { catalog: { manifestId: null, clips: [clip(101)], pageSize: null, paginationKey: null } })))
      .toEqual({ status: 'invalid', reason: 'invalid-input' });
  });

  it('validates motion time and tolerance before searching', () => {
    expect(matchNativeClip(options([clip(101)], { occurredAt: NaN }))).toEqual({ status: 'invalid', reason: 'invalid-input' });
    expect(matchNativeClip(options([clip(101)], { toleranceMs: -1 }))).toEqual({ status: 'invalid', reason: 'invalid-input' });
    expect(matchNativeClip(options([clip(101)], { toleranceMs: Infinity }))).toEqual({ status: 'invalid', reason: 'invalid-input' });
  });
});

describe('consumed native clip identity', () => {
  it('is stable across catalog refreshes and alternate offset spellings, while bound to source scope', () => {
    const current = clip(101);
    const equivalent = clip(101, { capturedAt: '2026-11-09T07:00:00+01:00', mediaUrl: '/new-manifest/42/opaque' });
    expect(nativeClipIdentity(scope, equivalent)).toBe(nativeClipIdentity(scope, current));
    expect(nativeClipIdentity({ ...scope, syncModuleId: 31 }, current)).not.toBe(nativeClipIdentity(scope, current));
    expect(nativeClipIdentity({ ...scope, accountId: 11 }, current)).not.toBe(nativeClipIdentity(scope, current));
  });
});
