import { nativeRecordingDevicePolicy, resolveNativeRecordingConfig } from '../src/native-recording-config';

describe('native recording configuration', () => {
  it('defaults to delayed bounded jobs and a separate conservative catalog cooldown', () => {
    expect(resolveNativeRecordingConfig(undefined)).toEqual({ initialDelayMs: 60_000, retryIntervalMs: 5_000, maxRetries: 10,
      matchToleranceMs: 15_000, catalogRefreshMs: 60_000, maxQueuedJobs: 128, maxJobAgeMs: 900_000, maxCachedBytes: 134_217_728 });
  });
  it('applies configured units while rejecting unsafe/unbounded policy', () => {
    expect(resolveNativeRecordingConfig({ initialDelaySeconds: 10, retryIntervalSeconds: 2, maxRetries: 0, catalogRefreshSeconds: 90 }).catalogRefreshMs).toBe(90_000);
    for (const invalid of [{ catalogRefreshSeconds: 5 }, { retryIntervalSeconds: 0 }, { maxRetries: -1 },
      { maxCachedBytes: 1 }, { initialDelaySeconds: 1.5 }, { initialDelaySeconds: 100, maxJobAgeSeconds: 50 }]) {
      expect(() => resolveNativeRecordingConfig(invalid)).toThrow();
    }
  });
  it('defaults motion exposure on and HSV off, with independent per-device OR demand', () => {
    expect(nativeRecordingDevicePolicy(undefined, { id: 1 })).toEqual({ exposeMotionDetected: true, homeKitSecureVideo: false });
    expect(nativeRecordingDevicePolicy([{ deviceIdentifier: 'camera:1', homeKitSecureVideo: true }], { id: 1, kind: 'camera' }, false))
      .toEqual({ exposeMotionDetected: false, homeKitSecureVideo: true });
  });
  it('uses kind-qualified selectors without conflating equal IDs, retaining first-row precedence', () => {
    const rows = [{ deviceIdentifier: 'camera:1', homeKitSecureVideo: true }, { deviceIdentifier: '1', exposeMotionDetected: false }];
    expect(nativeRecordingDevicePolicy(rows, { id: 1, kind: 'camera' })).toEqual({ exposeMotionDetected: true, homeKitSecureVideo: true });
    expect(nativeRecordingDevicePolicy(rows, { id: 1, kind: 'doorbell' })).toEqual({ exposeMotionDetected: false, homeKitSecureVideo: false });
  });
  it('validates feature booleans even on unmatched rows', () => {
    expect(() => nativeRecordingDevicePolicy([{ deviceIdentifier: 'other', homeKitSecureVideo: 'yes' as unknown as boolean }], { id: 1 })).toThrow();
    expect(() => nativeRecordingDevicePolicy(undefined, { id: 1 }, 'yes' as unknown as boolean)).toThrow();
  });
});
