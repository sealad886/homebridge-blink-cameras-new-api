import { Buffer } from 'node:buffer';
import type { HAP, PrepareStreamRequest, SnapshotRequest, StreamingRequest } from 'homebridge';
import type { BlinkApi } from '../src/blink-api';
import { BlinkCameraSource, type BlinkCameraStreamingConfigInput } from '../src/accessories/camera-source';
import { createHap } from './helpers/homebridge';
import { testResponse } from './helpers/response';

const request = { width: 640, height: 360 } as SnapshotRequest;
const image = Buffer.from('PRIVATE_IMAGE_BYTES');

function fixture(config: BlinkCameraStreamingConfigInput = {}, available = () => true) {
  const api = {
    requestCameraThumbnail: jest.fn().mockResolvedValue({ captureOutcome: 'completed',
      thumbnail: 'https://rest-e006.immedia-semi.com/private?token=PRIVATE_MEDIA_TOKEN' }),
    getAuthHeaders: jest.fn().mockReturnValue({ Authorization: 'Bearer PRIVATE_ACCESS_TOKEN' }),
  };
  const log = jest.fn();
  const source = new BlinkCameraSource(api as unknown as BlinkApi, createHap() as unknown as HAP,
    100, 200, 'camera', 'PRIVATE_SERIAL', () => undefined, available, log, config, log);
  return { source, api, log };
}

describe('camera delegate callbacks', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = jest.fn().mockImplementation(async () => testResponse({
      arrayBuffer: async () => new Uint8Array(image).buffer,
    })) as unknown as typeof fetch;
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('camera privacy-off erases persistent snapshots and permits a fresh image only after re-enable', async () => {
    const { source, api } = fixture({ persistSnapshotCache: true });
    const first = jest.fn(); await source.handleSnapshotRequest(request, first);
    const retained = first.mock.calls[0][1] as Buffer; expect(retained).toEqual(image);
    source.setCameraActive(false); expect(retained.every(byte => byte === 0)).toBe(true);
    const disabled = jest.fn(); await source.handleSnapshotRequest(request, disabled);
    expect(disabled).toHaveBeenCalledWith(expect.any(Error)); expect(api.requestCameraThumbnail).toHaveBeenCalledTimes(1);
    source.setCameraActive(true); const next = jest.fn(); await source.handleSnapshotRequest(request, next);
    expect(next).toHaveBeenCalledWith(undefined, image); expect(api.requestCameraThumbnail).toHaveBeenCalledTimes(2);
  });

  it('rejects a late snapshot from before privacy revocation even after the camera is re-enabled', async () => {
    const { source, api } = fixture();
    let complete!: (capture: { captureOutcome: string; thumbnail: string }) => void;
    api.requestCameraThumbnail.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const late = jest.fn(); const pending = source.handleSnapshotRequest(request, late);
    source.setCameraActive(false); source.setCameraActive(true);
    complete({ captureOutcome: 'completed', thumbnail: 'https://rest-e006.immedia-semi.com/private' });
    await pending; expect(late).toHaveBeenCalledWith(expect.any(Error)); expect(globalThis.fetch).not.toHaveBeenCalled();
    const fresh = jest.fn(); await source.handleSnapshotRequest(request, fresh);
    expect(fresh).toHaveBeenCalledWith(undefined, image); expect(api.requestCameraThumbnail).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])('returns fresh and cached snapshots without logging image or credential content (persistent=%s)', async persistSnapshotCache => {
    const { source, api, log } = fixture({ persistSnapshotCache });
    const first = jest.fn(); const second = jest.fn();
    await source.handleSnapshotRequest(request, first);
    await source.handleSnapshotRequest(request, second);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first.mock.calls[0][1]).toEqual(image);
    expect(second.mock.calls[0][1]).toBe(first.mock.calls[0][1]);
    expect(api.requestCameraThumbnail).toHaveBeenCalledTimes(1);
    for (const secret of ['PRIVATE_IMAGE_BYTES', 'PRIVATE_MEDIA_TOKEN', 'PRIVATE_ACCESS_TOKEN', 'PRIVATE_SERIAL', image.toString('base64')]) {
      expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    }
  });

  it('returns unavailable and failed snapshot callback errors once', async () => {
    const offline = fixture({}, () => false);
    const unavailable = jest.fn();
    await offline.source.handleSnapshotRequest(request, unavailable);
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(offline.api.requestCameraThumbnail).not.toHaveBeenCalled();

    const failed = fixture();
    failed.api.requestCameraThumbnail.mockRejectedValue(new Error('PRIVATE_PROVIDER_FAILURE'));
    const callback = jest.fn();
    await failed.source.handleSnapshotRequest(request, callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ hapStatus: -70402 }));
  });

  it('does not reclassify a caller callback exception as a failed snapshot or call it again', async () => {
    const { source } = fixture();
    const failure = new Error('Synthetic caller exception');
    const callback = jest.fn(() => { throw failure; });
    await expect(source.handleSnapshotRequest(request, callback)).rejects.toBe(failure);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('returns disabled prepare and stream callback arguments once', () => {
    const { source } = fixture({ enabled: false });
    const prepare = jest.fn();
    source.prepareStream({ sessionID: 'PRIVATE_SESSION' } as PrepareStreamRequest, prepare);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(expect.any(Error));
    for (const type of ['start', 'reconfigure', 'stop'] as const) {
      const callback = jest.fn();
      source.handleStreamRequest({ type, sessionID: 'PRIVATE_SESSION', video: request } as unknown as StreamingRequest, callback);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith();
    }
  });
});
