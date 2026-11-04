import { Buffer } from 'node:buffer';
import type { HAP } from 'homebridge';
import { BlinkCameraSource } from '../src/accessories/camera-source';
import type { BlinkApi } from '../src/blink-api';
import { createHap } from './helpers/homebridge';

test.each([false, true])('saved-mode automatic snapshots use existing thumbnails without waking capture, persistent=%s', async persistent => {
  const thumbnail = '/api/v3/media/accounts/1/thumbnail.jpg';
  const api = { getSharedRestRootUrl: () => 'https://rest-e006.immedia-semi.com', getAuthHeaders: () => ({}),
    requestCameraThumbnail: jest.fn().mockResolvedValue({ captureOutcome: 'completed', thumbnail }),
    requestOwlThumbnail: jest.fn(), requestDoorbellThumbnail: jest.fn() };
  const fetcher = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9])));
  const source = new BlinkCameraSource(api as unknown as BlinkApi, createHap() as unknown as HAP, 1, 2, 'camera', 'fixture',
    () => thumbnail, () => true, jest.fn(), { persistSnapshotCache: persistent, snapshotCacheTTL: 0 });
  source.setAutomaticSnapshotCapture(false);
  const snapshot = () => new Promise<Buffer>((resolve, reject) => { void source.handleSnapshotRequest({ width: 640, height: 360 },
    (error, bytes) => error ? reject(error) : resolve(bytes!)); });
  try {
    expect(await snapshot()).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    await snapshot(); expect(api.requestCameraThumbnail).not.toHaveBeenCalled();
    await source.refreshSnapshotCache(); expect(api.requestCameraThumbnail).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalled();
  } finally { fetcher.mockRestore(); await source.shutdown(); }
});
