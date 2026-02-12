/**
 * NetworkAccessory Unit Tests
 *
 * Tests for the NetworkAccessory class (SecuritySystem)
 * Covering:
 * - Constructor and service setup
 * - State queries (current and target)
 * - State updates from polling
 * - Arm/disarm API calls
 */

import { PlatformAccessory } from 'homebridge';
import { NetworkAccessory } from '../../src/accessories/network';
import { BlinkCamerasPlatform } from '../../src/platform';
import { BlinkNetwork } from '../../src/types';
import { createHap, createLogger, MockAccessory } from '../helpers/homebridge';

type PlatformStub = Pick<BlinkCamerasPlatform, 'Service' | 'Characteristic' | 'apiClient' | 'log'>;

describe('NetworkAccessory', () => {
  const buildTestFixture = () => {
    const hap = createHap();
    const log = createLogger();
    const apiClient = {
      armNetwork: jest.fn().mockResolvedValue({ command_id: 123 }),
      disarmNetwork: jest.fn().mockResolvedValue({ command_id: 124 }),
      pollCommand: jest.fn().mockResolvedValue({ complete: true }),
    };

    const platform: PlatformStub = {
      Service: hap.Service as unknown as BlinkCamerasPlatform['Service'],
      Characteristic: hap.Characteristic as unknown as BlinkCamerasPlatform['Characteristic'],
      apiClient: apiClient as unknown as BlinkCamerasPlatform['apiClient'],
      log: log as unknown as BlinkCamerasPlatform['log'],
    };

    return { hap, apiClient, platform, log };
  };

  const createDevice = (overrides: Partial<BlinkNetwork> = {}): BlinkNetwork => ({
    id: 1,
    name: 'Home Network',
    armed: false,
    ...overrides,
  });

  describe('constructor', () => {
    it('should set up SecuritySystem service', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Network', 'uuid-1', hap);
      const device = createDevice();

      new NetworkAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      expect(accessory.getService(hap.Service.SecuritySystem)).toBeDefined();
    });

    it('should configure CurrentState characteristic', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Network', 'uuid-1', hap);
      const device = createDevice({ armed: true });

      new NetworkAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const service = accessory.getService(hap.Service.SecuritySystem);
      const currentState = service?.getCharacteristic(hap.Characteristic.SecuritySystemCurrentState);
      expect(currentState).toBeDefined();
    });

    it('should configure TargetState characteristic', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Network', 'uuid-1', hap);
      const device = createDevice();

      new NetworkAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const service = accessory.getService(hap.Service.SecuritySystem);
      const targetState = service?.getCharacteristic(hap.Characteristic.SecuritySystemTargetState);
      expect(targetState).toBeDefined();
    });

    it('should set Manufacturer to Blink and Model to Network', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Network', 'uuid-1', hap);
      const device = createDevice({ id: 42 });

      new NetworkAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const infoService = accessory.getService(hap.Service.AccessoryInformation);
      expect(infoService?.setCharacteristic).toHaveBeenCalledWith('Manufacturer', 'Blink');
      expect(infoService?.setCharacteristic).toHaveBeenCalledWith('Model', 'Network');
      expect(infoService?.setCharacteristic).toHaveBeenCalledWith('SerialNumber', '42');
    });
  });

  describe('getCurrentState', () => {
    it('should return AWAY_ARM when network armed', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Network', 'uuid-1', hap);
      const device = createDevice({ armed: true });

      new NetworkAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const service = accessory.getService(hap.Service.SecuritySystem);
      const characteristic = service?.getCharacteristic(hap.Characteristic.SecuritySystemCurrentState);
      const value = characteristic?.onGetHandler?.();

      // AWAY_ARM = 1
      expect(value).toBe(hap.Characteristic.SecuritySystemCurrentState.AWAY_ARM);
    });

    it('should return DISARMED when network disarmed', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Network', 'uuid-1', hap);
      const device = createDevice({ armed: false });

      new NetworkAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const service = accessory.getService(hap.Service.SecuritySystem);
      const characteristic = service?.getCharacteristic(hap.Characteristic.SecuritySystemCurrentState);
      const value = characteristic?.onGetHandler?.();

      // DISARMED = 3
      expect(value).toBe(hap.Characteristic.SecuritySystemCurrentState.DISARMED);
    });
  });

  describe('updateState', () => {
    it('should set STAY_ARM when network armed', () => {
      const { hap, platform, log } = buildTestFixture();
      const accessory = new MockAccessory('Network', 'uuid-1', hap);
      const device = createDevice({ armed: false });

      const handler = new NetworkAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      handler.updateState({ ...device, armed: true });

      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('armed'));
    });

    it('should set DISARMED when network disarmed', () => {
      const { hap, platform, log } = buildTestFixture();
      const accessory = new MockAccessory('Network', 'uuid-1', hap);
      const device = createDevice({ armed: true });

      const handler = new NetworkAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      handler.updateState({ ...device, armed: false });

      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('disarmed'));
    });

    it('should not log when state unchanged', () => {
      const { hap, platform, log } = buildTestFixture();
      const accessory = new MockAccessory('Network', 'uuid-1', hap);
      const device = createDevice({ armed: false });

      const handler = new NetworkAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      handler.updateState({ ...device }); // Same state

      expect(log.info).not.toHaveBeenCalled();
    });

    it('should update accessory context', () => {
      const { hap, platform } = buildTestFixture();
      const accessory = new MockAccessory('Network', 'uuid-1', hap);
      const device = createDevice({ armed: false });

      const handler = new NetworkAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const updatedDevice = { ...device, armed: true };
      handler.updateState(updatedDevice);

      expect(accessory.context.device).toBe(updatedDevice);
    });
  });

  describe('setTargetState', () => {
    it('should arm network on STAY_ARM', async () => {
      const { hap, apiClient, platform } = buildTestFixture();
      const accessory = new MockAccessory('Network', 'uuid-1', hap);
      const device = createDevice({ armed: false, id: 10 });

      new NetworkAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const service = accessory.getService(hap.Service.SecuritySystem);
      const characteristic = service?.getCharacteristic(hap.Characteristic.SecuritySystemTargetState);
      // STAY_ARM = 0
      await characteristic?.onSetHandler?.(0);

      expect(apiClient.armNetwork).toHaveBeenCalledWith(10);
      expect(apiClient.pollCommand).toHaveBeenCalled();
    });

    it('should arm network on AWAY_ARM', async () => {
      const { hap, apiClient, platform } = buildTestFixture();
      const accessory = new MockAccessory('Network', 'uuid-1', hap);
      const device = createDevice({ armed: false, id: 10 });

      new NetworkAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const service = accessory.getService(hap.Service.SecuritySystem);
      const characteristic = service?.getCharacteristic(hap.Characteristic.SecuritySystemTargetState);
      // AWAY_ARM = 1
      await characteristic?.onSetHandler?.(1);

      expect(apiClient.armNetwork).toHaveBeenCalledWith(10);
    });

    it('should disarm network on DISARM', async () => {
      const { hap, apiClient, platform } = buildTestFixture();
      const accessory = new MockAccessory('Network', 'uuid-1', hap);
      const device = createDevice({ armed: true, id: 10 });

      new NetworkAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const service = accessory.getService(hap.Service.SecuritySystem);
      const characteristic = service?.getCharacteristic(hap.Characteristic.SecuritySystemTargetState);
      // DISARM = 3
      await characteristic?.onSetHandler?.(3);

      expect(apiClient.disarmNetwork).toHaveBeenCalledWith(10);
      expect(apiClient.pollCommand).toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      const { hap, apiClient, platform, log } = buildTestFixture();
      const accessory = new MockAccessory('Network', 'uuid-1', hap);
      const device = createDevice({ armed: false });

      apiClient.armNetwork.mockRejectedValue(new Error('Command failed'));

      new NetworkAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const service = accessory.getService(hap.Service.SecuritySystem);
      const characteristic = service?.getCharacteristic(hap.Characteristic.SecuritySystemTargetState);

      await expect(characteristic?.onSetHandler?.(1)).rejects.toThrow('Command failed');
      expect(log.error).toHaveBeenCalled();
    });

    it('should not call API when state unchanged (arming already armed)', async () => {
      const { hap, apiClient, platform } = buildTestFixture();
      const accessory = new MockAccessory('Network', 'uuid-1', hap);
      const device = createDevice({ armed: true });

      new NetworkAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const service = accessory.getService(hap.Service.SecuritySystem);
      const characteristic = service?.getCharacteristic(hap.Characteristic.SecuritySystemTargetState);
      // AWAY_ARM = 1, already armed
      await characteristic?.onSetHandler?.(1);

      expect(apiClient.armNetwork).not.toHaveBeenCalled();
      expect(apiClient.disarmNetwork).not.toHaveBeenCalled();
    });

    it('should not call API when state unchanged (disarming already disarmed)', async () => {
      const { hap, apiClient, platform } = buildTestFixture();
      const accessory = new MockAccessory('Network', 'uuid-1', hap);
      const device = createDevice({ armed: false });

      new NetworkAccessory(
        platform as unknown as BlinkCamerasPlatform,
        accessory as unknown as PlatformAccessory,
        device,
      );

      const service = accessory.getService(hap.Service.SecuritySystem);
      const characteristic = service?.getCharacteristic(hap.Characteristic.SecuritySystemTargetState);
      // DISARM = 3, already disarmed
      await characteristic?.onSetHandler?.(3);

      expect(apiClient.armNetwork).not.toHaveBeenCalled();
      expect(apiClient.disarmNetwork).not.toHaveBeenCalled();
    });
  });
});
