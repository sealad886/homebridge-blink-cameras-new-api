/**
 * OwlAccessory Unit Tests
 *
 * Tests for the OwlAccessory class (Blink Mini cameras)
 * Covering:
 * - Constructor and service setup
 * - State updates from polling
 * - Motion detection triggering
 * - Enable/disable motion API calls
 */

import { PlatformAccessory } from 'homebridge';
import { clearTimeout } from 'node:timers';
import { OwlAccessory } from '../../src/accessories/owl';
import { BlinkCamerasPlatform } from '../../src/platform';
import { BlinkOwl } from '../../src/types';
import { createHap, createLogger, MockAccessory } from '../helpers/homebridge';
import { resolveStreamingConfig } from '../../src/accessories/camera-source';

type PlatformStub = Pick<BlinkCamerasPlatform, 'Service' | 'Characteristic' | 'apiClient' | 'log' | 'api' | 'streamingConfig'>;

describe('OwlAccessory', () => {
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

  const createDevice = (overrides: Partial<BlinkOwl> = {}): BlinkOwl => ({
    id: 1,
    network_id: 10,
    name: 'Living Room Mini',
    enabled: true,
    serial: 'OWL123',
    ...overrides,
  });

  describe('constructor', () => {
    it('should set Model to "Mini"', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Owl', 'uuid-1', hap);
      const device = createDevice();

      new OwlAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const infoService = accessory.getService(hap.Service.AccessoryInformation);
      expect(infoService?.setCharacteristic).toHaveBeenCalledWith('Model', 'Mini');
    });

    it('should create Switch service', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Owl', 'uuid-1', hap);
      const device = createDevice();

      new OwlAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      expect(accessory.getService(hap.Service.Switch)).toBeDefined();
    });

    it('should create MotionSensor service', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Owl', 'uuid-1', hap);
      const device = createDevice();

      new OwlAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      expect(accessory.getService(hap.Service.MotionSensor)).toBeDefined();
    });

    it('should set Manufacturer to Blink', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Owl', 'uuid-1', hap);
      const device = createDevice({ serial: 'MINISERIAL' });

      new OwlAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const infoService = accessory.getService(hap.Service.AccessoryInformation);
      expect(infoService?.setCharacteristic).toHaveBeenCalledWith('Manufacturer', 'Blink');
      expect(infoService?.setCharacteristic).toHaveBeenCalledWith('SerialNumber', 'MINISERIAL');
    });

    it('should fallback to id if no serial', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Owl', 'uuid-1', hap);
      const device = createDevice({ serial: undefined, id: 777 });

      new OwlAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const infoService = accessory.getService(hap.Service.AccessoryInformation);
      expect(infoService?.setCharacteristic).toHaveBeenCalledWith('SerialNumber', '777');
    });
  });

  describe('updateState', () => {
    it('should update enabled state', () => {
      const { hap, platform, log } = buildTestFixture();
      const accessory = new MockAccessory('Owl', 'uuid-1', hap);
      const device = createDevice({ enabled: true });

      const handler = new OwlAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      handler.updateState({ ...device, enabled: false });

      expect(log.debug).toHaveBeenCalled();
    });

    it('should update Switch characteristic', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Owl', 'uuid-1', hap);
      const device = createDevice({ enabled: true });

      const handler = new OwlAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      handler.updateState({ ...device, enabled: false });

      const switchCharacteristic = accessory
        .getService(hap.Service.Switch)
        ?.getCharacteristic(hap.Characteristic.On);
      expect(switchCharacteristic?.value).toBe(false);
    });

    it('should not log when state unchanged', () => {
      const { hap, platform, log } = buildTestFixture();
      const accessory = new MockAccessory('Owl', 'uuid-1', hap);
      const device = createDevice({ enabled: true });

      const handler = new OwlAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      handler.updateState({ ...device }); // Same state

      expect(log.debug).not.toHaveBeenCalled();
    });
  });

  describe('triggerMotion', () => {
    let handler: OwlAccessory | null = null;

    afterEach(() => {
      if (handler) {
        clearTimeout((handler as unknown as { motionTimeout?: ReturnType<typeof setTimeout> }).motionTimeout);
        handler = null;
      }
    });

    it('should set MotionDetected to true', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Owl', 'uuid-1', hap);
      const device = createDevice();

      handler = new OwlAccessory(
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
      const accessory = new MockAccessory('Owl', 'uuid-1', hap);
      const device = createDevice();

      handler = new OwlAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      handler.triggerMotion();

      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Motion detected'));
    });
  });

  describe('setMotionEnabled', () => {
    it('should call enableOwl API', async () => {
      const { hap, apiClient, platform } = buildTestFixture();
      const accessory = new MockAccessory('Owl', 'uuid-1', hap);
      const device = createDevice({ enabled: false, network_id: 3, id: 5 });

      new OwlAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const characteristic = accessory
        .getService(hap.Service.Switch)
        ?.getCharacteristic(hap.Characteristic.On);
      await characteristic?.onSetHandler?.(true);

      expect(apiClient.enableMotion).toHaveBeenCalledWith('owl', 3, 5);
    });

    it('should call disableOwl API', async () => {
      const { hap, apiClient, platform } = buildTestFixture();
      const accessory = new MockAccessory('Owl', 'uuid-1', hap);
      const device = createDevice({ enabled: true, network_id: 3, id: 5 });

      new OwlAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const characteristic = accessory
        .getService(hap.Service.Switch)
        ?.getCharacteristic(hap.Characteristic.On);
      await characteristic?.onSetHandler?.(false);

      expect(apiClient.disableMotion).toHaveBeenCalledWith('owl', 3, 5);
    });

    it('should handle API errors', async () => {
      const { hap, apiClient, platform, log } = buildTestFixture();
      const accessory = new MockAccessory('Owl', 'uuid-1', hap);
      const device = createDevice({ enabled: false });

      apiClient.enableMotion.mockRejectedValue(new Error('API Failure'));

      new OwlAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const characteristic = accessory
        .getService(hap.Service.Switch)
        ?.getCharacteristic(hap.Characteristic.On);

      await expect(characteristic?.onSetHandler?.(true)).rejects.toThrow('API Failure');
      expect(log.error).toHaveBeenCalled();
    });

    it('should not call API when state unchanged', async () => {
      const { hap, apiClient, platform } = buildTestFixture();
      const accessory = new MockAccessory('Owl', 'uuid-1', hap);
      const device = createDevice({ enabled: true });

      new OwlAccessory(
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

  describe('getOwlId', () => {
    it('should return the owl ID', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Owl', 'uuid-1', hap);
      const device = createDevice({ id: 888 });

      const handler = new OwlAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      expect(handler.getDeviceId()).toBe(888);
    });
  });
});
