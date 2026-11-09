import * as hap from 'hap-nodejs';
import { Buffer } from 'node:buffer';
import type { PlatformAccessory } from 'homebridge';
import { CameraAccessory } from '../src/accessories/camera';
import { DoorbellAccessory } from '../src/accessories/doorbell';
import { snapshotNativeRecordingConfiguration } from '../src/accessories/native-recording-preparation';
import { resolveStreamingConfig } from '../src/accessories/camera-source';
import type { BlinkCamerasPlatform } from '../src/platform';

describe('native recording HomeKit assembly', () => {
  function setup(exposeMotionDetected: boolean, homeKitSecureVideo: boolean, kind: 'camera' | 'doorbell' = 'camera', enableAudio = true) {
    const accessory = new hap.Accessory('Entry', hap.uuid.generate(`assembly-${exposeMotionDetected}-${homeKitSecureVideo}`));
    const cachedMotion = accessory.addService(hap.Service.MotionSensor, 'Entry Motion Sensor', 'motion-sensor');
    const policyChanged = jest.fn().mockResolvedValue(undefined), apiClient = { enableCameraMotion: jest.fn(), disableCameraMotion: jest.fn() };
    const platform = {
      config: { exposeMotionDetected, deviceSettingOverrides: [{ deviceIdentifier: `${kind}:40`, homeKitSecureVideo }] },
      Service: hap.Service, Characteristic: hap.Characteristic,
      api: { hap, updatePlatformAccessories: jest.fn() }, apiClient,
      log: { info: jest.fn(), debug: jest.fn(), error: jest.fn() },
      streamingConfig: resolveStreamingConfig({ enabled: false, audio: { enabled: enableAudio } }),
      getDeviceMotionTimeout: () => 1000, getDeviceInputQuality: () => 'auto', isOperational: () => true, isTemperatureEnabled: () => false,
      getNativeRecordingPreparation: () => ({ admit: (work: () => Promise<unknown>) => work() }),
      nativeRecordingPolicyChanged: policyChanged, nativeRecordingDeliveryOutcome: jest.fn(),
    };
    const Handler = kind === 'camera' ? CameraAccessory : DoorbellAccessory;
    const handler = new Handler(platform as unknown as BlinkCamerasPlatform, accessory as unknown as PlatformAccessory,
      { id: 40, network_id: 20, name: 'Native Entry', enabled: true });
    return { accessory, handler, policyChanged, apiClient, cachedMotion };
  }

  it('keeps public PIR motion separate from the hidden HomeKit recording trigger', async () => {
    jest.useFakeTimers();
    try {
      const f = setup(true, true);
      const publicMotion = f.accessory.getServiceById(hap.Service.MotionSensor, 'motion-sensor')!;
      const internalMotion = f.accessory.getServiceById(hap.Service.MotionSensor, 'native-recording-motion')!;
      const recording = f.handler.getNativeRecordingDelegate()!;
      expect(publicMotion).toBe(f.cachedMotion);
      expect(publicMotion.getCharacteristic(hap.Characteristic.Name).value).toBe('Entry Motion Detected');
      expect(internalMotion.isHiddenService).toBe(true);
      f.handler.triggerMotion(1000);
      expect(publicMotion.getCharacteristic(hap.Characteristic.MotionDetected).value).toBe(true);
      expect(internalMotion.getCharacteristic(hap.Characteristic.MotionDetected).value).toBe(false);
      await expect(recording.handleRecordingStreamRequest(1).next()).rejects.toThrow('No permitted prepared');
      expect(f.apiClient.enableCameraMotion).not.toHaveBeenCalled();
      expect(f.apiClient.disableCameraMotion).not.toHaveBeenCalled();
      await recording.stop();
      jest.advanceTimersByTime(1000);
    } finally { jest.useRealTimers(); }
  });

  it('permits HSV without public motion exposure, preserving the separate writable motion switch', async () => {
    const f = setup(false, true);
    expect(f.accessory.getServiceById(hap.Service.MotionSensor, 'motion-sensor')).toBeUndefined();
    expect(f.accessory.getServiceById(hap.Service.MotionSensor, 'native-recording-motion')).toBeDefined();
    expect(f.accessory.getServiceById(hap.Service.Switch, 'motion-switch')).toBeDefined();
    expect(f.handler.getNativeRecordingDelegate()).toBeDefined();
    await f.handler.getNativeRecordingDelegate()!.stop();
  });

  it('does not add a recording controller when HSV is disabled', () => {
    const f = setup(true, false);
    expect(f.handler.getNativeRecordingDelegate()).toBeUndefined();
    expect(f.accessory.getServiceById(hap.Service.MotionSensor, 'native-recording-motion')).toBeUndefined();
  });

  it('binds recording, camera, and audio permission writes to the installed HAP management services', async () => {
    const f = setup(true, true), delegate = f.handler.getNativeRecordingDelegate()!;
    const recording = f.accessory.getService(hap.Service.CameraRecordingManagement)!;
    const operating = f.accessory.getService(hap.Service.CameraOperatingMode)!;
    const set = (service: hap.Service, characteristic: typeof hap.Characteristic.Active | typeof hap.Characteristic.RecordingAudioActive
      | typeof hap.Characteristic.HomeKitCameraActive, value: boolean | number) => new Promise<void>((resolve, reject) => {
      service.getCharacteristic(characteristic).setValue(value, error => error ? reject(error) : resolve());
    });
    expect(delegate.policy.recordingActive).toBe(false);
    await set(recording, hap.Characteristic.Active, hap.Characteristic.Active.ACTIVE);
    expect(delegate.policy.recordingActive).toBe(true);
    await set(recording, hap.Characteristic.RecordingAudioActive, true);
    expect(delegate.policy.audioActive).toBe(true);
    await set(operating, hap.Characteristic.HomeKitCameraActive, false);
    expect(delegate.policy.cameraActive).toBe(false); expect(delegate.policy.allowed).toBe(false);
    f.handler.updateAvailability();
    expect(delegate.policy.cameraActive).toBe(false);
    expect(f.policyChanged).toHaveBeenCalledWith('camera', 40, expect.objectContaining({ cameraActive: false, audioActive: true }));
    await delegate.stop();
  });

  it('keeps the doorbell ring event without publishing a ready recording trigger', async () => {
    const f = setup(true, true, 'doorbell');
    const event = f.accessory.getService(hap.Service.Doorbell)!.getCharacteristic(hap.Characteristic.ProgrammableSwitchEvent);
    const received = jest.fn(); event.on('change', received);
    (f.handler as DoorbellAccessory).triggerRing();
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ newValue: hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS }));
    const trigger = f.accessory.getServiceById(hap.Service.MotionSensor, 'native-recording-motion')!;
    expect(trigger.getCharacteristic(hap.Characteristic.MotionDetected).value).toBe(false);
    await f.handler.shutdown();
  });

  it.each([false, true])('enforces global audio permission independently of Home recording choices (%s)', async enableAudio => {
    const f = setup(true, true, 'camera', enableAudio), delegate = f.handler.getNativeRecordingDelegate()!;
    const management = f.accessory.getService(hap.Service.CameraRecordingManagement)!;
    const audio = management.getCharacteristic(hap.Characteristic.RecordingAudioActive);
    delegate.updateRecordingConfiguration({
      prebufferLength: 4000, eventTriggerTypes: [1], mediaContainerConfiguration: { type: 0, fragmentLength: 1000 },
      videoCodec: { type: 0, resolution: [1280, 720, 15], parameters: { profile: 0, level: 0, bitRate: 500, iFrameInterval: 1000 } },
      audioCodec: { type: 0, samplerate: 1, audioChannels: 1, bitrateMode: 0, bitrate: 32 },
    });
    const set = (characteristic: hap.Characteristic, value: boolean) => new Promise<void>((resolve, reject) => {
      characteristic.setValue(value, error => error ? reject(error) : resolve());
    });
    try {
      await set(management.getCharacteristic(hap.Characteristic.Active), true);
      for (const requested of [true, false, true]) {
        await set(audio, requested);
        expect(delegate.policy.audioActive).toBe(enableAudio && requested);
        expect(Boolean(audio.value)).toBe(enableAudio && requested);
        expect(delegate.policy.allowed).toBe(true);
      }
    } finally { await f.handler.shutdown(); }
  });


  it('negotiates every advertised recording audio rate within the finite preparation contract', async () => {
    const f = setup(true, true), delegate = f.handler.getNativeRecordingDelegate()!;
    const recording = f.accessory.getService(hap.Service.CameraRecordingManagement)!;
    const offered = recording.getCharacteristic(hap.Characteristic.SupportedAudioRecordingConfiguration).value as string;
    const codec = hap.decode(hap.decode(Buffer.from(offered, 'base64'))[1]);
    const rates = Array.from(hap.decode(codec[2])[3]);
    expect(rates).toEqual([hap.AudioRecordingSamplerate.KHZ_16, hap.AudioRecordingSamplerate.KHZ_24]);
    const selected = jest.spyOn(delegate, 'updateRecordingConfiguration');
    const integer = (value: number, bytes = 4) => {
      const data = Buffer.alloc(bytes);
      if (bytes === 8) data.writeBigUInt64LE(BigInt(value)); else data.writeUIntLE(value, 0, bytes);
      return data;
    };
    for (const rate of rates) {
      const container = hap.encode(1, integer(4000), 2, integer(1, 8), 3, hap.encode(1, 0, 2, hap.encode(1, integer(4000))));
      const video = hap.encode(1, 0, 2, hap.encode(1, 0, 2, 0, 3, integer(500), 4, integer(1000)),
        3, hap.encode(1, integer(1280, 2), 2, integer(720, 2), 3, 15));
      const audio = hap.encode(1, 0, 2, hap.encode(1, 1, 2, 0, 3, rate, 4, integer(32)));
      await recording.getCharacteristic(hap.Characteristic.SelectedCameraRecordingConfiguration)
        .handleSetRequest(hap.encode(1, container, 2, video, 3, audio).toString('base64'));
      const configuration = selected.mock.calls.at(-1)![0]!;
      expect(configuration.audioCodec.samplerate).toBe(rate);
      expect(() => snapshotNativeRecordingConfiguration(configuration)).not.toThrow();
      expect(delegate.policy.configured).toBe(true);
    }
    await f.handler.shutdown();
  });

});
