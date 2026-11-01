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
  const audit = jest.fn();
  const source = new BlinkCameraSource(api as unknown as BlinkApi, createHap() as unknown as HAP,
    100, 200, 'camera', 'PRIVATE_SERIAL', () => undefined, available, jest.fn(), config,
    jest.fn(), undefined, undefined, audit);
  return { source, api, audit };
}

describe('camera delegate audit', () => {
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

  it.each([false, true])('records fresh and cached snapshot responses without image or credential content (persistent=%s)', async persistSnapshotCache => {
    const { source, api, audit } = fixture({ persistSnapshotCache });
    const first = jest.fn(); const second = jest.fn();
    await source.handleSnapshotRequest(request, first);
    await source.handleSnapshotRequest(request, second);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first.mock.calls[0][1]).toEqual(image);
    expect(second.mock.calls[0][1]).toBe(first.mock.calls[0][1]);
    expect(api.requestCameraThumbnail).toHaveBeenCalledTimes(1);
    const events = audit.mock.calls.map(([event]) => event);
    expect(events.filter(event => event.direction === 'HomeKit -> bridge')).toHaveLength(2);
    expect(events.filter(event => event.direction === 'bridge -> HomeKit')).toEqual([
      expect.objectContaining({ event: 'Snapshot', outcome: 'fresh', bytes: image.length }),
      expect.objectContaining({ event: 'Snapshot', outcome: persistSnapshotCache ? 'persistent cache' : 'cache', bytes: image.length }),
    ]);
    for (const secret of ['PRIVATE_IMAGE_BYTES', 'PRIVATE_MEDIA_TOKEN', 'PRIVATE_ACCESS_TOKEN', 'PRIVATE_SERIAL', image.toString('base64')]) {
      expect(JSON.stringify(events)).not.toContain(secret);
    }
  });

  it('records unavailable and failed snapshot results without exposing failure text', async () => {
    const offline = fixture({}, () => false);
    const unavailable = jest.fn();
    await offline.source.handleSnapshotRequest(request, unavailable);
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(offline.api.requestCameraThumbnail).not.toHaveBeenCalled();
    expect(offline.audit).toHaveBeenCalledWith(expect.objectContaining({ event: 'Snapshot', outcome: 'unavailable' }));

    const failed = fixture();
    failed.api.requestCameraThumbnail.mockRejectedValue(new Error('PRIVATE_PROVIDER_FAILURE'));
    const callback = jest.fn();
    await failed.source.handleSnapshotRequest(request, callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ hapStatus: -70402 }));
    expect(failed.audit).toHaveBeenCalledWith(expect.objectContaining({ event: 'Snapshot', outcome: 'failed' }));
    expect(JSON.stringify(failed.audit.mock.calls)).not.toContain('PRIVATE_PROVIDER_FAILURE');
  });

  it('does not reclassify a caller callback exception as a failed snapshot or call it again', async () => {
    const { source, audit } = fixture();
    const failure = new Error('Synthetic caller exception');
    const callback = jest.fn(() => { throw failure; });
    await expect(source.handleSnapshotRequest(request, callback)).rejects.toBe(failure);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls.map(([event]) => event).filter(event => event.direction === 'bridge -> HomeKit'))
      .toEqual([expect.objectContaining({ event: 'Snapshot', outcome: 'fresh' })]);
  });

  it('preserves snapshot results when the audit callback throws', async () => {
    const { source, audit } = fixture();
    audit.mockImplementation(() => { throw new Error('Synthetic audit failure'); });
    const callback = jest.fn();
    await source.handleSnapshotRequest(request, callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(undefined, image);
  });

  it('records disabled prepare and stream requests while preserving existing callback arguments', () => {
    const { source, audit } = fixture({ enabled: false });
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
    const events = audit.mock.calls.map(([event]) => event);
    expect(events.filter(event => event.outcome === 'disabled')).toHaveLength(3);
    expect(events.filter(event => event.event === 'Prepare stream' && event.outcome === 'failed')).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('PRIVATE_SESSION');
  });
});
