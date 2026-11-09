import * as realHap from 'hap-nodejs';
import { Buffer } from 'node:buffer';
import { HAP } from 'homebridge';
import { decode, decodeWithLists } from 'hap-nodejs/dist/lib/util/tlv';
import { AccessoryInfo } from 'hap-nodejs/dist/lib/model/AccessoryInfo';
import { IdentifierCache } from 'hap-nodejs/dist/lib/model/IdentifierCache';
import { BlinkCameraStreamingConfigInput, createCameraControllerOptions, refreshCameraAudioCapabilities } from '../src/accessories/camera-source';

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
  it('rejects retired AAC-ELD preferences instead of substituting a codec', () => {
    expect(() => controller({ audio: { codec: 'aac-eld' as never } })).toThrow(/audio codec/);
  });

  it.each([
    ['opus', 3, [1, 2]],
    ['pcma', 1, [0]],
    ['pcmu', 0, [0]],
  ] as const)('offers only the supported %s preference', (preference, type, rates) => {
    const camera = controller({ audio: { codec: preference } });
    camera.constructServices();
    expect(codecs(camera)).toEqual([{ type, rates }]);
  });

  it('replaces restored PCMA capabilities with effective Opus capabilities', () => {
    const oldCamera = controller({ audio: { codec: 'pcma' } });
    const services = oldCamera.constructServices();
    expect(codecs(oldCamera)[0].type).toBe(1);
    const restored = controller({ audio: { codec: 'opus' } });
    restored.initWithServices(services);
    expect(codecs(restored)).toEqual([{ type: 3, rates: [1, 2] }]);
  });

  it('invalidates advertised configuration after restoring changed codecs without replacing service identity', () => {
    const oldCamera = controller({ audio: { codec: 'pcma' } });
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

      const anotherProfile = controller({ audio: { codec: 'pcmu' } });
      anotherProfile.initWithServices(saved);
      refreshCameraAudioCapabilities(hap, streamServices(anotherProfile));
      expect(codecs(anotherProfile).map((codec) => codec.type)).toEqual([0]);
      expect(info.checkForCurrentConfigurationNumberIncrement(advertisedConfiguration(streamServices(anotherProfile)))).toBe(true);
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
      const oldCamera = controller({ audio: { codec: 'pcma' } });
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

});
