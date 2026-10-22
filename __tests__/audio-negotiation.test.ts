import * as realHap from 'hap-nodejs';
import { Buffer } from 'node:buffer';
import { HAP, PrepareStreamRequest, StreamingRequest } from 'homebridge';
import { decode, decodeWithLists } from 'hap-nodejs/dist/lib/util/tlv';
import { AccessoryInfo } from 'hap-nodejs/dist/lib/model/AccessoryInfo';
import { IdentifierCache } from 'hap-nodejs/dist/lib/model/IdentifierCache';
import { BlinkApi } from '../src/blink-api';
import { BlinkCameraSource, BlinkCameraStreamingConfigInput, createCameraControllerOptions, refreshCameraAudioCapabilities } from '../src/accessories/camera-source';

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

function streamServices(camera: realHap.CameraController): realHap.Service[] {
  return camera.streamManagements.map((stream) => stream.getService());
}

function advertisedConfiguration(services: readonly realHap.Service[]) {
  // IDs normally come from the bridge's identifier cache. Keep them stable here
  // without opening a HAP listener or writing pairing/identifier storage.
  let nextIid = 1;
  for (const service of services) {
    service.iid ??= nextIid;
    nextIid++;
    for (const characteristic of service.characteristics) {
      characteristic.iid ??= nextIid;
      nextIid++;
    }
  }
  return [{ aid: 1, services: services.map((service) => service.internalHAPRepresentation()) }];
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

  it('invalidates advertised configuration after restoring changed codecs without replacing service identity', () => {
    const oldCamera = controller({ audio: { codec: 'aac-eld', aacEldEncoder: 'libfdk_aac' } });
    const saved = oldCamera.constructServices();
    const services = streamServices(oldCamera);
    refreshCameraAudioCapabilities(hap, services);
    const info = AccessoryInfo.create('00:11:22:33:44:55');
    const save = jest.spyOn(info, 'save').mockImplementation(() => undefined);
    try {
      info.checkForCurrentConfigurationNumberIncrement(advertisedConfiguration(services));
      const previousVersion = info.getConfigVersion();
      const identities = services.map((service) => ({
        uuid: service.UUID, subtype: service.subtype, iid: service.iid,
        characteristicIds: service.characteristics.map((characteristic) => characteristic.iid),
      }));
      const changed = jest.fn();
      services.forEach((service) => service.on('service-configurationChange', changed));

      const restored = controller({ audio: { codec: 'opus' } });
      restored.initWithServices(saved);
      // HAP excludes characteristic values from its hash. A changed TLV alone
      // does not tell Home to discard its previously advertised codec list.
      expect(info.checkForCurrentConfigurationNumberIncrement(advertisedConfiguration(streamServices(restored)))).toBe(false);
      refreshCameraAudioCapabilities(hap, streamServices(restored));
      expect(codecs(restored)).toEqual([{ type: 3, rates: [1, 2] }]);
      expect(info.checkForCurrentConfigurationNumberIncrement(advertisedConfiguration(streamServices(restored)))).toBe(true);
      expect(info.getConfigVersion()).toBe(previousVersion + 1);
      expect(changed).toHaveBeenCalled();
      expect(streamServices(restored).map((service) => ({
        uuid: service.UUID, subtype: service.subtype, iid: service.iid,
        characteristicIds: service.characteristics.map((characteristic) => characteristic.iid),
      }))).toEqual(identities);

      changed.mockClear();
      const again = controller({ audio: { codec: 'opus' } });
      again.initWithServices(saved);
      refreshCameraAudioCapabilities(hap, streamServices(again));
      expect(info.checkForCurrentConfigurationNumberIncrement(advertisedConfiguration(streamServices(again)))).toBe(false);
      expect(changed).not.toHaveBeenCalled();
      expect(info.getConfigVersion()).toBe(previousVersion + 1);

      const aacAvailableAgain = controller({ audio: { codec: 'opus', aacEldEncoder: 'libfdk_aac' } });
      aacAvailableAgain.initWithServices(saved);
      refreshCameraAudioCapabilities(hap, streamServices(aacAvailableAgain));
      expect(codecs(aacAvailableAgain).map((codec) => codec.type)).toEqual([3, 2]);
      expect(info.checkForCurrentConfigurationNumberIncrement(advertisedConfiguration(streamServices(aacAvailableAgain)))).toBe(true);
      expect(info.getConfigVersion()).toBe(previousVersion + 2);
    } finally {
      save.mockRestore();
    }
  });

  it('refreshes an already advertised bridge after a restored camera changes its audio capabilities', () => {
    jest.useFakeTimers();
    const info = AccessoryInfo.create('00:11:22:33:44:66');
    const identifiers = new IdentifierCache(info.username);
    const saveInfo = jest.spyOn(info, 'save').mockImplementation(() => undefined);
    const saveIdentifiers = jest.spyOn(identifiers, 'save').mockImplementation(() => undefined);
    try {
      const oldCamera = controller({ audio: { codec: 'aac-eld', aacEldEncoder: 'libfdk_aac' } });
      const saved = oldCamera.constructServices();
      const accessory = new realHap.Accessory('Camera', realHap.uuid.generate('audio-config-camera'));
      Object.values(saved).forEach((service) => { if (service) accessory.addService(service); });
      refreshCameraAudioCapabilities(hap, accessory.services);

      const bridge = new realHap.Bridge('Bridge', realHap.uuid.generate('audio-config-bridge'));
      bridge.addBridgedAccessory(accessory, true);
      const updateAdvertisement = jest.fn();
      // Supply only the live-publication boundaries. HAP's real service-event,
      // bridge debounce, identifier assignment and configuration hashing run.
      bridge._accessoryInfo = info;
      bridge._identifierCache = identifiers;
      bridge._advertiser = { updateAdvertisement } as unknown as NonNullable<typeof bridge._advertiser>;
      const configuration = bridge as unknown as {
        internalHAPRepresentation(): Parameters<AccessoryInfo['checkForCurrentConfigurationNumberIncrement']>[0];
      };
      info.checkForCurrentConfigurationNumberIncrement(configuration.internalHAPRepresentation());
      const previousVersion = info.getConfigVersion();

      const restored = controller({ audio: { codec: 'opus' } });
      restored.initWithServices(saved);
      jest.advanceTimersByTime(1_100);
      expect(info.getConfigVersion()).toBe(previousVersion);
      expect(updateAdvertisement).not.toHaveBeenCalled();

      refreshCameraAudioCapabilities(hap, accessory.services);
      jest.advanceTimersByTime(1_100);
      expect(info.getConfigVersion()).toBe(previousVersion + 1);
      expect(updateAdvertisement).toHaveBeenCalledTimes(1);

      refreshCameraAudioCapabilities(hap, accessory.services);
      jest.advanceTimersByTime(1_100);
      expect(info.getConfigVersion()).toBe(previousVersion + 1);
      expect(updateAdvertisement).toHaveBeenCalledTimes(1);
    } finally {
      saveInfo.mockRestore();
      saveIdentifiers.mockRestore();
      jest.useRealTimers();
    }
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
