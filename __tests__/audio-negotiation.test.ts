import * as realHap from 'hap-nodejs';
import { Buffer } from 'node:buffer';
import { HAP, PrepareStreamRequest, StreamingRequest } from 'homebridge';
import { decode, decodeWithLists } from 'hap-nodejs/dist/lib/util/tlv';
import { BlinkApi } from '../src/blink-api';
import { BlinkCameraSource, BlinkCameraStreamingConfigInput, createCameraControllerOptions } from '../src/accessories/camera-source';

const hap = realHap as unknown as HAP;
const delegate = {
  prepareStream: jest.fn(),
  handleStreamRequest: jest.fn(),
  handleSnapshotRequest: jest.fn(),
};

function controller(config: BlinkCameraStreamingConfigInput): realHap.CameraController {
  return new realHap.CameraController(createCameraControllerOptions(hap, delegate, config));
}

function codecs(camera: realHap.CameraController): Array<{ type: number; rates: number[] }> {
  const value = camera.streamManagements[0].getService()
    .getCharacteristic(realHap.Characteristic.SupportedAudioStreamConfiguration).value;
  const outer = decodeWithLists(Buffer.from(String(value), 'base64'));
  const entries = Array.isArray(outer[1]) ? outer[1] : [outer[1]];
  return entries.map((entry) => {
    const fields = decode(entry);
    const params = decodeWithLists(fields[2]);
    const rates = Array.isArray(params[3]) ? params[3] : [params[3]];
    return { type: fields[1].readUInt8(), rates: rates.map((rate) => rate.readUInt8()) };
  });
}

describe('Real HAP audio negotiation', () => {
  it('advertises Opus when requested AAC-ELD has no validated encoder', () => {
    const camera = controller({ audio: { codec: 'aac-eld' } });
    camera.constructServices();
    expect(codecs(camera)).toEqual([{ type: 3, rates: [1, 2] }]);
  });

  it.each([
    ['aac-eld', [2, 3]],
    ['opus', [3, 2]],
  ] as const)('offers verified AAC-ELD and Opus, honoring %s preference', (preference, types) => {
    const camera = controller({ audio: { codec: preference, aacEldEncoder: 'libfdk_aac' } });
    camera.constructServices();
    expect(codecs(camera)).toEqual(types.map((type) => ({ type, rates: [1, 2] })));
  });

  it('replaces restored AAC-ELD capabilities with effective Opus capabilities', () => {
    const oldCamera = controller({ audio: { codec: 'aac-eld', aacEldEncoder: 'libfdk_aac' } });
    const services = oldCamera.constructServices();
    expect(codecs(oldCamera)[0].type).toBe(2);
    const restored = controller({ audio: { codec: 'opus' } });
    restored.initWithServices(services);
    expect(codecs(restored)).toEqual([{ type: 3, rates: [1, 2] }]);
  });

  it('rejects unavailable AAC-ELD before requesting a remote liveview and releases preparation', async () => {
    const startCameraLiveview = jest.fn().mockRejectedValue(new Error('must not reach vendor'));
    const source = new BlinkCameraSource({ startCameraLiveview } as unknown as BlinkApi,
      hap, 1, 2, 'camera', 'test-serial', () => undefined, () => true, jest.fn(),
      { audio: { codec: 'opus' } });
    const sessionID = '00000000-0000-4000-8000-000000000001';
    const endpoint = { port: 5000, srtpCryptoSuite: realHap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      srtp_key: Buffer.alloc(16), srtp_salt: Buffer.alloc(14) };
    const prepare = { sessionID, targetAddress: '127.0.0.1', addressVersion: 'ipv4',
      video: endpoint, audio: { ...endpoint, port: 5001 } } as PrepareStreamRequest;
    const prepared = () => new Promise<void>((resolve, reject) => source.prepareStream(prepare,
      (error) => error ? reject(error) : resolve()));
    await prepared();
    const request = { sessionID, type: 'start',
      video: { width: 640, height: 360, fps: 15, max_bit_rate: 300, pt: 99, mtu: 1378,
        profile: realHap.H264Profile.BASELINE, level: realHap.H264Level.LEVEL3_1 },
      audio: { codec: realHap.AudioStreamingCodecType.AAC_ELD, channel: 1,
        sample_rate: realHap.AudioStreamingSamplerate.KHZ_16, max_bit_rate: 24,
        packet_time: 20, pt: 110 } } as StreamingRequest;
    const callback = jest.fn();
    const error = await new Promise<Error | undefined>((resolve) => source.handleStreamRequest(request,
      (failure) => { callback(failure); resolve(failure); }));
    expect(error).toBeInstanceOf(Error);
    expect(startCameraLiveview).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledTimes(1);
    // Reusing the same identifier proves failed negotiation retired its ownership.
    await prepared();
    await new Promise<void>((resolve) => source.handleStreamRequest({ sessionID, type: 'stop' } as StreamingRequest,
      () => resolve()));
  });
});
