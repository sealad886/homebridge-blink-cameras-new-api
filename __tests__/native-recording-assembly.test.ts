import * as hap from 'hap-nodejs';
import type { PlatformAccessory } from 'homebridge';
import { CameraAccessory } from '../src/accessories/camera';
import { resolveStreamingConfig } from '../src/accessories/camera-source';
import type { BlinkCamerasPlatform } from '../src/platform';

describe('native recording HomeKit assembly', () => {
  function setup(exposeMotionDetected: boolean, homeKitSecureVideo: boolean) {
    const accessory = new hap.Accessory('Entry', hap.uuid.generate(`assembly-${exposeMotionDetected}-${homeKitSecureVideo}`));
    const policyChanged = jest.fn().mockResolvedValue(undefined), apiClient = { enableCameraMotion: jest.fn(), disableCameraMotion: jest.fn() };
    const platform = {
      config: { exposeMotionDetected, deviceSettingOverrides: [{ deviceIdentifier: 'camera:40', homeKitSecureVideo }] },
      Service: hap.Service, Characteristic: hap.Characteristic,
      api: { hap, updatePlatformAccessories: jest.fn() }, apiClient,
      log: { info: jest.fn(), debug: jest.fn(), error: jest.fn() },
      streamingConfig: resolveStreamingConfig({ enabled: false }),
      getDeviceMotionTimeout: () => 1000, getDeviceInputQuality: () => 'auto', isOperational: () => true,
      getNativeRecordingPreparation: () => ({ ffmpegPath: 'must-not-launch', admit: (work: () => Promise<unknown>) => work() }),
      nativeRecordingPolicyChanged: policyChanged, nativeRecordingDeliveryOutcome: jest.fn(),
    };
    const handler = new CameraAccessory(platform as unknown as BlinkCamerasPlatform, accessory as unknown as PlatformAccessory,
      { id: 40, network_id: 20, name: 'Native Entry', enabled: true });
    return { accessory, handler, policyChanged, apiClient };
  }

  it('keeps public PIR motion separate from the hidden HomeKit recording trigger', async () => {
    jest.useFakeTimers();
    try {
      const f = setup(true, true);
      const publicMotion = f.accessory.getServiceById(hap.Service.MotionSensor, 'motion-sensor')!;
      const internalMotion = f.accessory.getServiceById(hap.Service.MotionSensor, 'native-recording-motion')!;
      const recording = f.handler.getNativeRecordingDelegate()!;
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
    expect(f.policyChanged).toHaveBeenCalledWith('camera', 40, expect.objectContaining({ cameraActive: false, audioActive: true }));
    await delegate.stop();
  });
});
