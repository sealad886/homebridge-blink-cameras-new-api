/**
 * CameraAccessory Unit Tests
 *
 * Tests for the CameraAccessory class covering:
 * - Constructor and service setup
 * - State updates from polling
 * - Motion detection triggering
 * - Enable/disable motion API calls
 */

import { PlatformAccessory } from 'homebridge';
import { clearTimeout } from 'node:timers';
import { CameraAccessory } from '../../src/accessories/camera';
import { BlinkCamerasPlatform } from '../../src/platform';
import { BlinkCamera } from '../../src/types';
import { createHap, createLogger, MockAccessory } from '../helpers/homebridge';
import { resolveStreamingConfig } from '../../src/accessories/camera-source';

type PlatformStub = Pick<BlinkCamerasPlatform, 'Service' | 'Characteristic' | 'apiClient' | 'log' | 'api' | 'streamingConfig'>;

describe('CameraAccessory', () => {
  const buildTestFixture = () => {
    const hap = createHap();
    const log = createLogger();
    const apiClient = {
      enableMotion: jest.fn().mockResolvedValue(undefined),
      disableMotion: jest.fn().mockResolvedValue(undefined),
      requestThumbnail: jest.fn().mockResolvedValue({ command_id: 1 }),
      pollCommand: jest.fn().mockResolvedValue({}),
    };

    const platform: PlatformStub = {
      Service: hap.Service as unknown as BlinkCamerasPlatform['Service'],
      Characteristic: hap.Characteristic as unknown as BlinkCamerasPlatform['Characteristic'],
      apiClient: apiClient as unknown as BlinkCamerasPlatform['apiClient'],
      log: log as unknown as BlinkCamerasPlatform['log'],
      api: { hap } as unknown as BlinkCamerasPlatform['api'],
      streamingConfig: resolveStreamingConfig({ enabled: false }),
    };

    return { hap, apiClient, platform, log };
  };

  const createDevice = (overrides: Partial<BlinkCamera> = {}): BlinkCamera => ({
    id: 1,
    network_id: 10,
    name: 'Front Door Camera',
    enabled: true,
    serial: 'ABC123',
    type: 'outdoor',
    ...overrides,
  });

  describe('constructor', () => {
    it('should set up AccessoryInformation service', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Camera', 'uuid-1', hap);
      const device = createDevice({ serial: 'SERIAL123' });

      new CameraAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const infoService = accessory.getService(hap.Service.AccessoryInformation);
      expect(infoService?.setCharacteristic).toHaveBeenCalledWith('Manufacturer', 'Blink');
      expect(infoService?.setCharacteristic).toHaveBeenCalledWith('Model', 'outdoor');
      expect(infoService?.setCharacteristic).toHaveBeenCalledWith('SerialNumber', 'SERIAL123');
    });

    it('should create Switch service for motion toggle', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Camera', 'uuid-1', hap);
      const device = createDevice();

      new CameraAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      expect(accessory.getService(hap.Service.Switch)).toBeDefined();
    });

    it('should create MotionSensor service', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Camera', 'uuid-1', hap);
      const device = createDevice();

      new CameraAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      expect(accessory.getService(hap.Service.MotionSensor)).toBeDefined();
    });

    it('should use device serial as SerialNumber', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Camera', 'uuid-1', hap);
      const device = createDevice({ serial: 'MYSERIALNUMBER' });

      new CameraAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const infoService = accessory.getService(hap.Service.AccessoryInformation);
      expect(infoService?.setCharacteristic).toHaveBeenCalledWith('SerialNumber', 'MYSERIALNUMBER');
    });

    it('should fallback to device id if no serial', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Camera', 'uuid-1', hap);
      const device = createDevice({ serial: undefined, id: 999 });

      new CameraAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const infoService = accessory.getService(hap.Service.AccessoryInformation);
      expect(infoService?.setCharacteristic).toHaveBeenCalledWith('SerialNumber', '999');
    });
  });

  describe('updateState', () => {
    it('should update enabled state from device', () => {
      const { hap, platform, log } = buildTestFixture();
      const accessory = new MockAccessory('Camera', 'uuid-1', hap);
      const device = createDevice({ enabled: true });

      const handler = new CameraAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const updatedDevice = { ...device, enabled: false };
      handler.updateState(updatedDevice);

      expect(log.debug).toHaveBeenCalled();
    });

    it('should update Switch characteristic', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Camera', 'uuid-1', hap);
      const device = createDevice({ enabled: true });

      const handler = new CameraAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const updatedDevice = { ...device, enabled: false };
      handler.updateState(updatedDevice);

      const switchCharacteristic = accessory
        .getService(hap.Service.Switch)
        ?.getCharacteristic(hap.Characteristic.On);
      expect(switchCharacteristic?.value).toBe(false);
    });

    it('should not log when state unchanged', () => {
      const { hap, platform, log } = buildTestFixture();
      const accessory = new MockAccessory('Camera', 'uuid-1', hap);
      const device = createDevice({ enabled: true });

      const handler = new CameraAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      // Clear any debug calls from constructor before testing updateState
      jest.clearAllMocks();

      handler.updateState({ ...device }); // Same state

      expect(log.debug).not.toHaveBeenCalled();
    });
  });

  describe('triggerMotion', () => {
    let handler: CameraAccessory | null = null;

    afterEach(() => {
      if (handler) {
        clearTimeout((handler as unknown as { motionTimeout?: ReturnType<typeof setTimeout> }).motionTimeout);
        handler = null;
      }
    });

    it('should set MotionDetected to true', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Camera', 'uuid-1', hap);
      const device = createDevice();

      handler = new CameraAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      handler.triggerMotion(30000);

      const motionCharacteristic = accessory
        .getService(hap.Service.MotionSensor)
        ?.getCharacteristic(hap.Characteristic.MotionDetected);
      expect(motionCharacteristic?.value).toBe(true);
    });

    it('should log motion detection', () => {
      const { hap, platform, log } = buildTestFixture();
      const accessory = new MockAccessory('Camera', 'uuid-1', hap);
      const device = createDevice();

      handler = new CameraAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      handler.triggerMotion(30000);

      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Motion detected'));
    });
  });

  describe('setMotionEnabled', () => {
    it('should call API to enable camera', async () => {
      const { hap, apiClient, platform } = buildTestFixture();
      const accessory = new MockAccessory('Camera', 'uuid-1', hap);
      const device = createDevice({ enabled: false });

      new CameraAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const characteristic = accessory
        .getService(hap.Service.Switch)
        ?.getCharacteristic(hap.Characteristic.On);
      await characteristic?.onSetHandler?.(true);

      expect(apiClient.enableMotion).toHaveBeenCalledWith('camera', 10, 1);
    });

    it('should call API to disable camera', async () => {
      const { hap, apiClient, platform } = buildTestFixture();
      const accessory = new MockAccessory('Camera', 'uuid-1', hap);
      const device = createDevice({ enabled: true });

      new CameraAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const characteristic = accessory
        .getService(hap.Service.Switch)
        ?.getCharacteristic(hap.Characteristic.On);
      await characteristic?.onSetHandler?.(false);

      expect(apiClient.disableMotion).toHaveBeenCalledWith('camera', 10, 1);
    });

    it('should handle API errors gracefully', async () => {
      const { hap, apiClient, platform, log } = buildTestFixture();
      const accessory = new MockAccessory('Camera', 'uuid-1', hap);
      const device = createDevice({ enabled: false });

      apiClient.enableMotion.mockRejectedValue(new Error('API Error'));

      new CameraAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const characteristic = accessory
        .getService(hap.Service.Switch)
        ?.getCharacteristic(hap.Characteristic.On);

      await expect(characteristic?.onSetHandler?.(true)).rejects.toThrow('API Error');
      expect(log.error).toHaveBeenCalled();
    });

    it('should not call API when state unchanged', async () => {
      const { hap, apiClient, platform } = buildTestFixture();
      const accessory = new MockAccessory('Camera', 'uuid-1', hap);
      const device = createDevice({ enabled: true });

      new CameraAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const characteristic = accessory
        .getService(hap.Service.Switch)
        ?.getCharacteristic(hap.Characteristic.On);
      await characteristic?.onSetHandler?.(true);

      expect(apiClient.enableMotion).not.toHaveBeenCalled();
      expect(apiClient.disableMotion).not.toHaveBeenCalled();
    });
  });

  describe('getCameraId', () => {
    it('should return the camera ID', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Camera', 'uuid-1', hap);
      const device = createDevice({ id: 42 });

      const handler = new CameraAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      expect(handler.getDeviceId()).toBe(42);
    });
  });
});
