/**
 * Blink Doorbell Accessory
 *
 * Exposes a Blink doorbell as HomeKit accessories:
 * - Doorbell: Ring notifications via ProgrammableSwitchEvent
 * - Switch: Toggle motion detection enabled/disabled
 * - MotionSensor: Report motion detection events
 *
 * Source: API Dossier Section 3.5 (Doorbell Operations)
 * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.smali
 */

import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { BlinkCamerasPlatform } from '../platform';
import { BlinkDoorbell } from '../types';

export class DoorbellAccessory {
  private readonly doorbellService: Service;
  private readonly switchService: Service;
  private readonly motionService: Service;
  private motionDetected = false;
  private motionTimeout: NodeJS.Timeout | null = null;

  constructor(
    private readonly platform: BlinkCamerasPlatform,
    private readonly accessory: PlatformAccessory,
    private device: BlinkDoorbell,
  ) {
    // Configure accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)
      ?.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Blink')
      .setCharacteristic(this.platform.Characteristic.Model, 'Doorbell')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.serial ?? `${device.id}`);

    // Doorbell service for ring notifications
    this.doorbellService =
      this.accessory.getService(this.platform.Service.Doorbell) ||
      this.accessory.addService(this.platform.Service.Doorbell, device.name, 'doorbell');

    // ProgrammableSwitchEvent is used to trigger doorbell ring
    this.doorbellService
      .getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
      .setProps({ maxValue: 0, minValue: 0, validValues: [0] });

    // Switch service for motion detection enable/disable
    this.switchService =
      this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch, `${device.name} Motion`, 'motion-switch');

    this.switchService
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.device.enabled)
      .onSet(async (value) => this.setMotionEnabled(value));

    // MotionSensor service for motion detection events
    this.motionService =
      this.accessory.getService(this.platform.Service.MotionSensor) ||
      this.accessory.addService(this.platform.Service.MotionSensor, `${device.name} Motion`, 'motion-sensor');

    this.motionService
      .getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(() => this.motionDetected);

    this.motionService
      .getCharacteristic(this.platform.Characteristic.StatusActive)
      .onGet(() => this.device.enabled);
  }

  /**
   * Enable or disable motion detection
   * Source: API Dossier Section 3.5 - enable/disable endpoints
   */
  private async setMotionEnabled(value: CharacteristicValue): Promise<void> {
    const target = Boolean(value);

    if (target === this.device.enabled) {
      return;
    }

    try {
      if (target) {
        await this.platform.apiClient.enableDoorbellMotion(this.device.network_id, this.device.id);
        this.platform.log.info(`Enabled motion detection for doorbell: ${this.device.name}`);
      } else {
        await this.platform.apiClient.disableDoorbellMotion(this.device.network_id, this.device.id);
        this.platform.log.info(`Disabled motion detection for doorbell: ${this.device.name}`);
      }

      this.device.enabled = target;
      this.accessory.context.device = this.device;

      this.motionService
        .getCharacteristic(this.platform.Characteristic.StatusActive)
        .updateValue(target);
    } catch (error) {
      this.platform.log.error(`Failed to ${target ? 'enable' : 'disable'} motion for doorbell ${this.device.name}:`, error);
      throw error;
    }
  }

  /**
   * Update device state from polling
   */
  updateState(device: BlinkDoorbell): void {
    const previousEnabled = this.device.enabled;
    this.device = device;
    this.accessory.context.device = device;

    if (previousEnabled !== device.enabled) {
      this.switchService
        .getCharacteristic(this.platform.Characteristic.On)
        .updateValue(device.enabled);

      this.motionService
        .getCharacteristic(this.platform.Characteristic.StatusActive)
        .updateValue(device.enabled);

      this.platform.log.debug(
        `Doorbell ${device.name} motion detection: ${device.enabled ? 'enabled' : 'disabled'}`,
      );
    }
  }

  /**
   * Trigger doorbell ring event
   * Sends ProgrammableSwitchEvent to HomeKit
   */
  triggerRing(): void {
    const { ProgrammableSwitchEvent } = this.platform.Characteristic;

    this.doorbellService
      .getCharacteristic(ProgrammableSwitchEvent)
      .updateValue(ProgrammableSwitchEvent.SINGLE_PRESS);

    this.platform.log.info(`Doorbell ring: ${this.device.name}`);
  }

  /**
   * Trigger motion detected event
   */
  triggerMotion(timeoutMs = 30000): void {
    if (this.motionTimeout) {
      clearTimeout(this.motionTimeout);
    }

    this.motionDetected = true;
    this.motionService
      .getCharacteristic(this.platform.Characteristic.MotionDetected)
      .updateValue(true);

    this.platform.log.info(`Motion detected on doorbell: ${this.device.name}`);

    this.motionTimeout = setTimeout(() => {
      this.motionDetected = false;
      this.motionService
        .getCharacteristic(this.platform.Characteristic.MotionDetected)
        .updateValue(false);
      this.motionTimeout = null;
    }, timeoutMs);
  }

  /**
   * Get the doorbell ID for matching with media clips
   */
  getDoorbellId(): number {
    return this.device.id;
  }
}
