/**
 * Blink Owl (Mini Camera) Accessory
 *
 * Exposes a Blink Mini camera as HomeKit accessories:
 * - Switch: Toggle motion detection enabled/disabled
 * - MotionSensor: Report motion detection events
 *
 * Note: "Owl" is Blink's internal codename for Mini cameras (WiFi-direct, no sync module)
 *
 * Source: API Dossier Section 3.4 (Owl Operations)
 * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/wired/OwlApi.smali
 */

import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { BlinkCamerasPlatform } from '../platform';
import { BlinkOwl } from '../types';

export class OwlAccessory {
  private readonly switchService: Service;
  private readonly motionService: Service;
  private motionDetected = false;
  private motionTimeout: NodeJS.Timeout | null = null;

  constructor(
    private readonly platform: BlinkCamerasPlatform,
    private readonly accessory: PlatformAccessory,
    private device: BlinkOwl,
  ) {
    // Configure accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)
      ?.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Blink')
      .setCharacteristic(this.platform.Characteristic.Model, 'Mini')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.serial ?? `${device.id}`);

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
      this.accessory.addService(this.platform.Service.MotionSensor, device.name, 'motion-sensor');

    this.motionService
      .getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(() => this.motionDetected);

    this.motionService
      .getCharacteristic(this.platform.Characteristic.StatusActive)
      .onGet(() => this.device.enabled);
  }

  /**
   * Enable or disable motion detection
   * Source: API Dossier Section 3.4 - enable/disable endpoints
   */
  private async setMotionEnabled(value: CharacteristicValue): Promise<void> {
    const target = Boolean(value);

    if (target === this.device.enabled) {
      return;
    }

    try {
      if (target) {
        await this.platform.apiClient.enableOwlMotion(this.device.network_id, this.device.id);
        this.platform.log.info(`Enabled motion detection for Mini: ${this.device.name}`);
      } else {
        await this.platform.apiClient.disableOwlMotion(this.device.network_id, this.device.id);
        this.platform.log.info(`Disabled motion detection for Mini: ${this.device.name}`);
      }

      this.device.enabled = target;
      this.accessory.context.device = this.device;

      this.motionService
        .getCharacteristic(this.platform.Characteristic.StatusActive)
        .updateValue(target);
    } catch (error) {
      this.platform.log.error(`Failed to ${target ? 'enable' : 'disable'} motion for Mini ${this.device.name}:`, error);
      throw error;
    }
  }

  /**
   * Update device state from polling
   */
  updateState(device: BlinkOwl): void {
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
        `Mini ${device.name} motion detection: ${device.enabled ? 'enabled' : 'disabled'}`,
      );
    }
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

    this.platform.log.info(`Motion detected on Mini: ${this.device.name}`);

    this.motionTimeout = setTimeout(() => {
      this.motionDetected = false;
      this.motionService
        .getCharacteristic(this.platform.Characteristic.MotionDetected)
        .updateValue(false);
      this.motionTimeout = null;
    }, timeoutMs);
  }

  /**
   * Get the owl ID for matching with media clips
   */
  getOwlId(): number {
    return this.device.id;
  }
}
