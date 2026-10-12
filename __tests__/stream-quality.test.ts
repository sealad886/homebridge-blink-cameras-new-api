import * as realHap from 'hap-nodejs';
import { HAP, PrepareStreamRequest, StreamingRequest } from 'homebridge';
import { Buffer } from 'node:buffer';
import { decode, decodeWithLists } from 'hap-nodejs/dist/lib/util/tlv';
import { BlinkApi } from '../src/blink-api';
import { BlinkCameraSource, createCameraControllerOptions, resolveStreamingConfig } from '../src/accessories/camera-source';
import { isSupportedOutputVideo, outputResolutions, OutputQualityProfile } from '../src/accessories/stream-quality';
import { spawnSync } from 'node:child_process';

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
  ] as const)('advertises only %s and the HomeKit low-resolution fallback', (profile, selected) => {
    const options = createCameraControllerOptions(hap, delegate, { video: { outputQuality: profile } });
    expect(options.streamingOptions.video.resolutions).toEqual([selected, [320, 240, 15]]);
    const controller = new realHap.CameraController(options);
    controller.constructServices();
    const value = controller.streamManagements[0].getService()
      .getCharacteristic(realHap.Characteristic.SupportedVideoStreamConfiguration).value;
    const configuration = decodeWithLists(decode(Buffer.from(String(value), 'base64'))[1]);
    const attributes = Array.isArray(configuration[3]) ? configuration[3] : [configuration[3]];
    expect(attributes.map((attribute) => {
      const fields = decode(attribute);
      return [fields[1].readUInt16LE(), fields[2].readUInt16LE(), fields[3].readUInt8()];
    })).toEqual([selected, [320, 240, 15]]);
    expect(isSupportedOutputVideo(profile, { width: selected[0], height: selected[1], fps: selected[2] })).toBe(true);
    expect(isSupportedOutputVideo(profile, { width: 320, height: 240, fps: 15 })).toBe(true);
    expect(isSupportedOutputVideo(profile, { width: selected[0], height: selected[1], fps: 60 })).toBe(false);
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

  it.each(['libx264', 'h264_vaapi', 'h264_videotoolbox', 'h264_v4l2m2m', 'h264_qsv', 'h264_nvenc'])(
    'uses one aspect-preserving negotiated-frame filter for %s', (encoder) => {
      const source = new BlinkCameraSource({} as BlinkApi, hap, 1, 2, 'camera', 'test-serial',
        () => undefined, () => true, jest.fn(), { audio: { enabled: false } });
      const args = (source as any).buildFfmpegArgs('pipe:0', {
        video: { width: 1280, height: 720, fps: 15, max_bit_rate: 300, pt: 99, mtu: 1378, profile: 0, level: 0 },
      }, { videoCryptoSuite: 0, videoSRTP: Buffer.alloc(30), videoSSRC: 1, address: '127.0.0.1', videoPort: 5000 }, encoder);
      expect(args.filter((arg: string) => arg === '-vf')).toHaveLength(1);
      expect(args).not.toContain('-s');
      const filter = args[args.indexOf('-vf') + 1];
      expect(filter).toBe('scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,' +
        'pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1' +
        (encoder === 'h264_vaapi' ? ',format=nv12,hwupload' : ''));
    });

  it('packs square input into a 16:9 frame without stretching its content', () => {
    const source = new BlinkCameraSource({} as BlinkApi, hap, 1, 2, 'camera', 'test-serial',
      () => undefined, () => true, jest.fn(), { audio: { enabled: false } });
    const args = (source as any).buildFfmpegArgs('pipe:0', {
      video: { width: 1280, height: 720, fps: 15, max_bit_rate: 300, pt: 99, mtu: 1378, profile: 0, level: 0 },
    }, { videoCryptoSuite: 0, videoSRTP: Buffer.alloc(30), videoSSRC: 1, address: '127.0.0.1', videoPort: 5000 }, 'libx264');
    const filter = args[args.indexOf('-vf') + 1];
    // Synthetic media only. A square white source must retain square content
    // with centered black sidebars in the negotiated 1280x720 output frame.
    const result = spawnSync(require('ffmpeg-for-homebridge'), ['-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=white:size=64x64:rate=1', '-vf', filter,
      '-frames:v', '1', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1'],
    { maxBuffer: 2 * 1024 * 1024, timeout: 10_000 });
    expect(result.status).toBe(0);
    expect(result.stdout).toHaveLength(1280 * 720);
    const row = result.stdout.subarray(360 * 1280, 361 * 1280);
    expect(row[279]).toBeLessThan(20);
    expect(row[280]).toBeGreaterThan(220);
    expect(row[999]).toBeGreaterThan(220);
    expect(row[1000]).toBeLessThan(20);
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
