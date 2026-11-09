import { Buffer } from 'node:buffer';
import type { HAP, SnapshotRequest } from 'homebridge';
import { BlinkCameraSource } from '../src/accessories/camera-source';
import type { BlinkApi } from '../src/blink-api';
import { createHap } from './helpers/homebridge';
type Response = globalThis.Response;

describe('native recording snapshot policy', () => {
  const request = { width: 640, height: 360 } as SnapshotRequest;
  const url = 'https://rest-e006.immedia-semi.com/existing-thumbnail';
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  const fixture = (thumbnail: () => string | undefined = () => url) => {
    const capture = jest.fn().mockResolvedValue({ captureOutcome: 'completed', thumbnail: url });
    const api = { requestCameraThumbnail: capture, getAuthHeaders: () => ({}) } as unknown as BlinkApi;
    const source = new BlinkCameraSource(api, createHap() as unknown as HAP, 1, 2,
      'camera', 'serial', thumbnail, () => true, jest.fn(), { passiveSnapshots: true });
    return { source, capture };
  };

  it('downloads an existing thumbnail without a camera command on automatic cache misses', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(new globalThis.Response(Buffer.from([1, 2, 3])));
    const { source, capture } = fixture();
    const callback = jest.fn();
    await source.handleSnapshotRequest(request, callback);
    expect(capture).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(undefined, Buffer.from([1, 2, 3]));
  });

  it('keeps explicit manual refresh as one capture workflow', async () => {
    globalThis.fetch = jest.fn().mockImplementation(async () => new globalThis.Response(Buffer.from([4])));
    const { source, capture } = fixture();
    await Promise.all([source.refreshSnapshotCache(), source.refreshSnapshotCache()]);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('queues one manual capture after an in-flight passive read', async () => {
    let finishRead!: (response: Response) => void;
    globalThis.fetch = jest.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finishRead = resolve; }))
      .mockImplementation(async () => new globalThis.Response(Buffer.from([9])));
    const { source, capture } = fixture();
    const passiveCallback = jest.fn();
    const passive = source.handleSnapshotRequest(request, passiveCallback);
    const manual = Promise.all([source.refreshSnapshotCache(), source.refreshSnapshotCache()]);
    expect(capture).not.toHaveBeenCalled();
    finishRead(new globalThis.Response(Buffer.from([7])));
    await Promise.all([passive, manual]);
    expect(passiveCallback).toHaveBeenCalledWith(undefined, Buffer.from([7]));
    expect(capture).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const cached = jest.fn();
    await source.handleSnapshotRequest(request, cached);
    expect(cached).toHaveBeenCalledWith(undefined, Buffer.from([9]));
  });

  it('fails a missing passive thumbnail without waking the camera, then permits manual capture', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(new globalThis.Response(Buffer.from([6])));
    const { source, capture } = fixture(() => undefined);
    const callback = jest.fn();
    await source.handleSnapshotRequest(request, callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ hapStatus: -70402 }));
    expect(capture).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await source.refreshSnapshotCache();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
