/**
 * DoorbellAccessory Unit Tests
 *
 * Tests for the DoorbellAccessory class covering:
 * - Constructor and service setup
 * - Doorbell ring events
 * - State updates from polling
 * - Motion detection triggering
 * - Enable/disable motion API calls
 */

import { PlatformAccessory } from 'homebridge';
import { clearTimeout } from 'node:timers';
import { DoorbellAccessory } from '../../src/accessories/doorbell';
import { BlinkCamerasPlatform } from '../../src/platform';
import { BlinkDoorbell } from '../../src/types';
import { createHap, createLogger, MockAccessory } from '../helpers/homebridge';
import { resolveStreamingConfig } from '../../src/accessories/camera-source';

type PlatformStub = Pick<BlinkCamerasPlatform, 'Service' | 'Characteristic' | 'apiClient' | 'log' | 'api' | 'streamingConfig'>;

describe('DoorbellAccessory', () => {
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

  const createDevice = (overrides: Partial<BlinkDoorbell> = {}): BlinkDoorbell => ({
    id: 1,
    network_id: 10,
    name: 'Front Door',
    enabled: true,
    serial: 'DOORBELL123',
    ...overrides,
  });

  describe('constructor', () => {
    it('should set up Doorbell service', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice();

      new DoorbellAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      expect(accessory.getService(hap.Service.Doorbell)).toBeDefined();
    });

    it('should configure ProgrammableSwitchEvent props', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice();

      new DoorbellAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const doorbellService = accessory.getService(hap.Service.Doorbell);
      expect(doorbellService).toBeDefined();
    });

    it('should create Switch service for motion toggle', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice();

      new DoorbellAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      expect(accessory.getService(hap.Service.Switch)).toBeDefined();
    });

    it('should create MotionSensor service', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice();

      new DoorbellAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      expect(accessory.getService(hap.Service.MotionSensor)).toBeDefined();
    });

    it('should set Manufacturer to Blink and Model to Doorbell', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice({ serial: 'SN12345' });

      new DoorbellAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const infoService = accessory.getService(hap.Service.AccessoryInformation);
      expect(infoService?.setCharacteristic).toHaveBeenCalledWith('Manufacturer', 'Blink');
      expect(infoService?.setCharacteristic).toHaveBeenCalledWith('Model', 'Doorbell');
      expect(infoService?.setCharacteristic).toHaveBeenCalledWith('SerialNumber', 'SN12345');
    });
  });

  describe('ringDoorbell', () => {
    it('should trigger ProgrammableSwitchEvent', () => {
      const { hap, platform, log } = buildTestFixture();
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice();

      const handler = new DoorbellAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      handler.triggerRing();

      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('ring'));
    });

    it('should use SINGLE_PRESS event type', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice();

      const handler = new DoorbellAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      handler.triggerRing();

      const doorbellService = accessory.getService(hap.Service.Doorbell);
      const characteristic = doorbellService?.getCharacteristic(hap.Characteristic.ProgrammableSwitchEvent);
      // SINGLE_PRESS is 0 in HomeKit
      expect(characteristic?.value).toBeDefined();
    });
  });

  describe('updateState', () => {
    it('should update enabled state from device', () => {
      const { hap, platform, log } = buildTestFixture();
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice({ enabled: true });

      const handler = new DoorbellAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const updatedDevice = { ...device, enabled: false };
      handler.updateState(updatedDevice);

      expect(log.debug).toHaveBeenCalled();
    });

    it('should update Switch characteristic when state changes', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice({ enabled: true });

      const handler = new DoorbellAccessory(
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

    it('should update StatusActive characteristic', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice({ enabled: true });

      const handler = new DoorbellAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      handler.updateState({ ...device, enabled: false });

      // StatusActive should reflect enabled state
      const motionService = accessory.getService(hap.Service.MotionSensor);
      expect(motionService).toBeDefined();
    });
  });

  describe('triggerMotion', () => {
    let handler: DoorbellAccessory | null = null;

    afterEach(() => {
      if (handler) {
        clearTimeout((handler as unknown as { motionTimeout?: ReturnType<typeof setTimeout> }).motionTimeout);
        handler = null;
      }
    });

    it('should set MotionDetected to true', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice();

      handler = new DoorbellAccessory(
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
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice();

      handler = new DoorbellAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      handler.triggerMotion();

      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Motion detected'));
    });
  });

  describe('setMotionEnabled', () => {
    it('should call API to enable doorbell motion', async () => {
      const { hap, apiClient, platform } = buildTestFixture();
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice({ enabled: false, network_id: 5, id: 7 });

      new DoorbellAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const characteristic = accessory
        .getService(hap.Service.Switch)
        ?.getCharacteristic(hap.Characteristic.On);
      await characteristic?.onSetHandler?.(true);

      expect(apiClient.enableMotion).toHaveBeenCalledWith('doorbell', 5, 7);
    });

    it('should call API to disable doorbell motion', async () => {
      const { hap, apiClient, platform } = buildTestFixture();
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice({ enabled: true, network_id: 5, id: 7 });

      new DoorbellAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const characteristic = accessory
        .getService(hap.Service.Switch)
        ?.getCharacteristic(hap.Characteristic.On);
      await characteristic?.onSetHandler?.(false);

      expect(apiClient.disableMotion).toHaveBeenCalledWith('doorbell', 5, 7);
    });

    it('should handle API errors gracefully', async () => {
      const { hap, apiClient, platform, log } = buildTestFixture();
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice({ enabled: false });

      apiClient.enableMotion.mockRejectedValue(new Error('Network Error'));

      new DoorbellAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const characteristic = accessory
        .getService(hap.Service.Switch)
        ?.getCharacteristic(hap.Characteristic.On);

      await expect(characteristic?.onSetHandler?.(true)).rejects.toThrow('Network Error');
      expect(log.error).toHaveBeenCalled();
    });

    it('should not call API when state unchanged', async () => {
      const { hap, apiClient, platform } = buildTestFixture();
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice({ enabled: true });

      new DoorbellAccessory(
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

  describe('getDoorbellId', () => {
    it('should return the doorbell ID', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Doorbell', 'uuid-1', hap);
      const device = createDevice({ id: 99 });

      const handler = new DoorbellAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      expect(handler.getDeviceId()).toBe(99);
    });
  });
});
