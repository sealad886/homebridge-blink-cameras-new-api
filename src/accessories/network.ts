/**
 * Blink Network Accessory (SecuritySystem)
 *
 * Exposes a Blink network as a HomeKit SecuritySystem for arm/disarm control.
 *
 * HomeKit SecuritySystem States:
 * - STAY_ARM (0): Armed, stay mode - maps to Blink armed
 * - AWAY_ARM (1): Armed, away mode - maps to Blink armed
 * - NIGHT_ARM (2): Armed, night mode - maps to Blink armed
 * - DISARMED (3): Disarmed - maps to Blink disarmed
 * - ALARM_TRIGGERED (4): Not used (Blink doesn't have alarm concept)
 *
 * Source: API Dossier Section 3.7 (Network & Arm/Disarm)
 * Evidence: smali_classes9/com/immediasemi/blink/common/device/network/NetworkApi.smali
 */

import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { BlinkCamerasPlatform } from '../platform';
import { BlinkNetwork } from '../types';

export class NetworkAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: BlinkCamerasPlatform,
    private readonly accessory: PlatformAccessory,
    private device: BlinkNetwork,
  ) {
    // Configure accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)
      ?.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Blink')
      .setCharacteristic(this.platform.Characteristic.Model, 'Network')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `${device.id}`);

    // Use SecuritySystem service for proper arm/disarm in HomeKit
    this.service =
      this.accessory.getService(this.platform.Service.SecuritySystem) ||
      this.accessory.addService(this.platform.Service.SecuritySystem, device.name);

    // Remove any legacy Switch service if present
    const legacySwitch = this.accessory.getService(this.platform.Service.Switch);
    if (legacySwitch) {
      this.accessory.removeService(legacySwitch);
    }

    // SecuritySystemCurrentState - read-only, reflects actual state
    this.service
      .getCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState)
      .onGet(() => this.getCurrentState());

    // SecuritySystemTargetState - read/write, user's desired state
    this.service
      .getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState)
      .onGet(() => this.getTargetState())
      .onSet(async (value) => this.setTargetState(value));
  }

  /**
   * Get current arm state
   * Maps Blink armed (true/false) to HomeKit SecuritySystemCurrentState
   */
  private getCurrentState(): CharacteristicValue {
    const { SecuritySystemCurrentState } = this.platform.Characteristic;

    // Blink has simple armed/disarmed - map to AWAY_ARM when armed
    return this.device.armed
      ? SecuritySystemCurrentState.AWAY_ARM
      : SecuritySystemCurrentState.DISARMED;
  }

  /**
   * Get target arm state (same as current for Blink)
   */
  private getTargetState(): CharacteristicValue {
    const { SecuritySystemTargetState } = this.platform.Characteristic;

    return this.device.armed
      ? SecuritySystemTargetState.AWAY_ARM
      : SecuritySystemTargetState.DISARM;
  }

  /**
   * Set target arm state (arm or disarm network)
   * Source: API Dossier Section 3.7 - arm/disarm endpoints
   */
  private async setTargetState(value: CharacteristicValue): Promise<void> {
    const { SecuritySystemTargetState, SecuritySystemCurrentState } = this.platform.Characteristic;

    const target = value as number;
    const shouldArm = target !== SecuritySystemTargetState.DISARM;

    // Skip if already in desired state
    if (shouldArm === this.device.armed) {
      return;
    }

    try {
      if (shouldArm) {
        const response = await this.platform.apiClient.armNetwork(this.device.id);
        await this.platform.apiClient.pollCommand(this.device.id, response.command_id);
        this.platform.log.info(`Armed network: ${this.device.name}`);
      } else {
        const response = await this.platform.apiClient.disarmNetwork(this.device.id);
        await this.platform.apiClient.pollCommand(this.device.id, response.command_id);
        this.platform.log.info(`Disarmed network: ${this.device.name}`);
      }

      // Update local state
      this.device.armed = shouldArm;
      this.accessory.context.device = this.device;

      // Update current state characteristic
      this.service
        .getCharacteristic(SecuritySystemCurrentState)
        .updateValue(
          shouldArm ? SecuritySystemCurrentState.AWAY_ARM : SecuritySystemCurrentState.DISARMED,
        );
    } catch (error) {
      this.platform.log.error(`Failed to ${shouldArm ? 'arm' : 'disarm'} network ${this.device.name}:`, error);
      throw error;
    }
  }

  /**
   * Update device state from polling.
   * Called by platform when homescreen data is refreshed.
   * Updates SecuritySystemCurrentState and SecuritySystemTargetState if armed state changed.
   *
   * @param device - Fresh device data from Blink API homescreen response
   */
  updateState(device: BlinkNetwork): void {
    const previousArmed = this.device.armed;
    this.device = device;
    this.accessory.context.device = device;

    if (previousArmed !== device.armed) {
      const { SecuritySystemCurrentState, SecuritySystemTargetState } = this.platform.Characteristic;

      this.service
        .getCharacteristic(SecuritySystemCurrentState)
        .updateValue(
          device.armed ? SecuritySystemCurrentState.AWAY_ARM : SecuritySystemCurrentState.DISARMED,
        );

      this.service
        .getCharacteristic(SecuritySystemTargetState)
        .updateValue(
          device.armed ? SecuritySystemTargetState.AWAY_ARM : SecuritySystemTargetState.DISARM,
        );

      this.platform.log.info(
        `Network ${device.name} state changed: ${device.armed ? 'armed' : 'disarmed'}`,
      );
    }
  }
}
