import * as realHap from 'hap-nodejs';
import { HAP, PrepareStreamRequest, StreamingRequest } from 'homebridge';
import { Buffer } from 'node:buffer';
import { decode, decodeWithLists } from 'hap-nodejs/dist/lib/util/tlv';
import { BlinkApi } from '../src/blink-api';
import { BlinkCameraSource, createCameraControllerOptions, resolveStreamingConfig } from '../src/accessories/camera-source';
import { effectiveOutputFps, isSupportedOutputVideo, outputResolutions, OutputQualityProfile } from '../src/accessories/stream-quality';
jest.mock('../src/accessories/media-worker-artifact', () => ({ loadPackagedMediaWorker: () => '/verified/worker' }));
jest.mock('../src/accessories/media-session', () => ({ createOwnedMediaSession: jest.fn(async () => {
  let closed!: () => void;
  const whenClosed = new Promise<void>(resolve => { closed = resolve; });
  return { whenClosed, failed: false, write: async () => {}, end: async () => {}, stop: async () => { closed(); } };
}) }));

const hap = realHap as unknown as HAP;
const delegate = { prepareStream: jest.fn(), handleStreamRequest: jest.fn(), handleSnapshotRequest: jest.fn() };

describe('System-wide output quality profiles', () => {
  it('keeps the existing default capabilities including 720p/30 and 1080p/30', () => {
    const resolved = resolveStreamingConfig();
    expect(resolved.video.outputQuality).toBe('auto');
    const options = createCameraControllerOptions(hap, delegate);
    expect(options.streamingOptions.video.resolutions).toHaveLength(16);
    expect(options.streamingOptions.video.resolutions).toEqual(expect.arrayContaining([
      [1280, 720, 30], [1920, 1080, 30], [320, 240, 15],
    ]));
  });

  it.each([
    ['720p15', [1280, 720, 15]],
    ['360p15', [640, 360, 15]],
    ['1080p30', [1920, 1080, 30]],
  ] as const)('advertises %s geometry with controller-compatible frame rates and fallback', (profile, selected) => {
    const options = createCameraControllerOptions(hap, delegate, { video: { outputQuality: profile } });
    const expected = profile === '1080p30' ? [selected, [320, 240, 15]]
      : [selected, [selected[0], selected[1], 30], [320, 240, 15], [320, 240, 30]];
    expect(options.streamingOptions.video.resolutions).toEqual(expected);
    const controller = new realHap.CameraController(options);
    controller.constructServices();
    const value = controller.streamManagements[0].getService()
      .getCharacteristic(realHap.Characteristic.SupportedVideoStreamConfiguration).value;
    const configuration = decodeWithLists(decode(Buffer.from(String(value), 'base64'))[1]);
    const attributes = Array.isArray(configuration[3]) ? configuration[3] : [configuration[3]];
    const parameters = decodeWithLists(configuration[2] as Buffer);
    const levels = Array.isArray(parameters[2]) ? parameters[2] : [parameters[2]];
    expect(levels.map(level => level.readUInt8())).toEqual(profile === '1080p30' ? [2] : [0, 1, 2]);
    expect(attributes.map((attribute) => {
      const fields = decode(attribute);
      return [fields[1].readUInt16LE(), fields[2].readUInt16LE(), fields[3].readUInt8()];
    })).toEqual(expected);
    expect(isSupportedOutputVideo(profile, { width: selected[0], height: selected[1], fps: selected[2], level: 2 })).toBe(true);
    expect(isSupportedOutputVideo(profile, { width: 320, height: 240, fps: 15, level: 2 })).toBe(true);
    expect(isSupportedOutputVideo(profile, { width: selected[0], height: selected[1], fps: 60 })).toBe(false);
  });

  it.each([0, 1])('rejects lower H.264 level %s for the fixed 1080p/30 profile', async (level) => {
    const startCameraLiveview = jest.fn();
    const source = new BlinkCameraSource({ startCameraLiveview } as unknown as BlinkApi,
      hap, 1, 2, 'camera', 'test-serial', () => undefined, () => true, jest.fn(),
      { audio: { enabled: false }, video: { outputQuality: '1080p30' } });
    const sessionID = `00000000-0000-4000-8000-00000000001${level}`;
    const endpoint = { port: 5000, srtpCryptoSuite: realHap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      srtp_key: Buffer.alloc(16), srtp_salt: Buffer.alloc(14) };
    const prepare = { sessionID, targetAddress: '127.0.0.1', addressVersion: 'ipv4', video: endpoint } as PrepareStreamRequest;
    const prepared = () => new Promise<void>((resolve, reject) => source.prepareStream(prepare,
      error => error ? reject(error) : resolve()));
    await prepared();
    const error = await new Promise<Error | undefined>(resolve => source.handleStreamRequest({ sessionID, type: 'start',
      video: { width: 1920, height: 1080, fps: 30, level, profile: 0, max_bit_rate: 300, pt: 99, mtu: 1378 },
    } as StreamingRequest, resolve));
    expect(error?.message).toContain('output profile');
    expect(startCameraLiveview).not.toHaveBeenCalled();
    await prepared();
    await new Promise<void>(resolve => source.handleStreamRequest({ sessionID, type: 'stop' } as StreamingRequest,
      () => resolve()));
  });

  it.each(['720p15', '360p15'] as const)('caps %s encoded output independently of selected FPS', profile => {
    expect(effectiveOutputFps(profile, 30)).toBe(15);
    expect(effectiveOutputFps(profile, 15)).toBe(15);
    expect(effectiveOutputFps(profile, 10)).toBe(10);
    expect(effectiveOutputFps('auto', 30)).toBe(30);
  });

  it.each([0, -1, 60, NaN, Infinity, 15.5])('rejects invalid/unadvertised FPS %s', fps => {
    expect(isSupportedOutputVideo('720p15', { width: 1280, height: 720, fps, level: 0 })).toBe(false);
  });

  it('accepts 720p/30 START under the 15fps cap and reaches vendor startup', async () => {
    const startCameraLiveview = jest.fn().mockRejectedValue(new Error('vendor reached'));
    const source = new BlinkCameraSource({ startCameraLiveview } as unknown as BlinkApi,
      hap, 1, 2, 'camera', 'test-serial', () => undefined, () => true, jest.fn(),
      { audio: { enabled: false }, video: { outputQuality: '720p15' } });
    const sessionID = '00000000-0000-4000-8000-000000000020';
    const endpoint = { port: 5000, srtpCryptoSuite: realHap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      srtp_key: Buffer.alloc(16), srtp_salt: Buffer.alloc(14) };
    await new Promise<void>((resolve, reject) => source.prepareStream({ sessionID, targetAddress: '127.0.0.1',
      addressVersion: 'ipv4', video: endpoint } as PrepareStreamRequest, error => error ? reject(error) : resolve()));
    const callback = jest.fn();
    const error = await new Promise<Error | undefined>(resolve => source.handleStreamRequest({ sessionID, type: 'start',
      video: { width: 1280, height: 720, fps: 30, max_bit_rate: 300, pt: 99, mtu: 1378, profile: 0, level: 0 },
    } as StreamingRequest, failure => { callback(failure); resolve(failure); }));
    expect(startCameraLiveview).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).not.toContain('output profile');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('bounds repeated negotiation diagnostics while preserving rejection callbacks and port reuse', async () => {
    const log = jest.fn();
    const startCameraLiveview = jest.fn();
    const source = new BlinkCameraSource({ startCameraLiveview } as unknown as BlinkApi,
      hap, 1, 2, 'camera', 'test-serial', () => undefined, () => true, log,
      { audio: { enabled: false }, video: { outputQuality: '720p15' } });
    const sessionID = '00000000-0000-4000-8000-000000000021';
    const endpoint = { port: 5000, srtpCryptoSuite: realHap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      srtp_key: Buffer.alloc(16), srtp_salt: Buffer.alloc(14) };
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise<void>((resolve, reject) => source.prepareStream({ sessionID, targetAddress: '127.0.0.1',
        addressVersion: 'ipv4', video: endpoint } as PrepareStreamRequest, error => error ? reject(error) : resolve()));
      const callback = jest.fn();
      await new Promise<void>(resolve => source.handleStreamRequest({ sessionID, type: 'start',
        video: { width: 640, height: 360, fps: 30, max_bit_rate: 300, pt: 99, mtu: 1378, profile: 0, level: 0 },
      } as StreamingRequest, error => { callback(error); resolve(); }));
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
    }
    const lines = log.mock.calls.map(([line]) => String(line));
    expect(lines.filter(line => line === 'Stream prepared')).toHaveLength(32);
    expect(lines.filter(line => line.startsWith('Stream selection rejected:'))).toHaveLength(8);
    expect(lines.filter(line => line.startsWith('Stream selection rejected:')).join(' ')).not.toContain(sessionID);
    expect(lines.filter(line => line === 'Stream prepared').join(' ')).not.toContain('127.0.0.1');
    expect(startCameraLiveview).not.toHaveBeenCalled();
  });

  it('fails invalid quality settings rather than silently enabling expensive output', () => {
    expect(() => resolveStreamingConfig({ video: { outputQuality: '2k' as OutputQualityProfile } }))
      .toThrow('Invalid output quality profile');
  });

  it('does not share mutable capability arrays between controllers', () => {
    const first = outputResolutions('720p15');
    first[0][0] = 1;
    expect(outputResolutions('720p15')[0]).toEqual([1280, 720, 15]);
  });

  it('rejects stale START quality before requesting vendor media and releases preparation', async () => {
    const startCameraLiveview = jest.fn().mockRejectedValue(new Error('must not reach vendor'));
    const source = new BlinkCameraSource({ startCameraLiveview } as unknown as BlinkApi,
      hap, 1, 2, 'camera', 'test-serial', () => undefined, () => true, jest.fn(),
      { audio: { enabled: false }, video: { outputQuality: '360p15' } });
    const sessionID = '00000000-0000-4000-8000-000000000010';
    const endpoint = { port: 5000, srtpCryptoSuite: realHap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      srtp_key: Buffer.alloc(16), srtp_salt: Buffer.alloc(14) };
    const prepare = { sessionID, targetAddress: '127.0.0.1', addressVersion: 'ipv4',
      video: endpoint } as PrepareStreamRequest;
    const prepared = () => new Promise<void>((resolve, reject) => source.prepareStream(prepare,
      (error) => error ? reject(error) : resolve()));
    await prepared();
    const request = { sessionID, type: 'start',
      video: { width: 1280, height: 720, fps: 30, max_bit_rate: 300, pt: 99, mtu: 1378,
        profile: realHap.H264Profile.BASELINE, level: realHap.H264Level.LEVEL3_1 },
    } as StreamingRequest;
    const callback = jest.fn();
    const error = await new Promise<Error | undefined>((resolve) => source.handleStreamRequest(request,
      (failure) => { callback(failure); resolve(failure); }));
    expect(error?.message).toContain('output profile');
    expect(startCameraLiveview).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledTimes(1);
    await prepared();
    await new Promise<void>((resolve) => source.handleStreamRequest({ sessionID, type: 'stop' } as StreamingRequest,
      () => resolve()));
  });
});
