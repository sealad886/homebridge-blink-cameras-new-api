/**
 * Blink Owl (Mini Camera) Accessory
 *
 * Exposes a Blink Mini camera as HomeKit accessories:
 * - Switch: Toggle motion detection enabled/disabled
 * - MotionSensor: Report motion detection events
 * - Camera: Static snapshots via thumbnail API
 *
 * Note: "Owl" is Blink's internal codename for Mini cameras (WiFi-direct, no sync module)
 *
 * Source: API Dossier Section 3.4 (Owl Operations)
 * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/wired/OwlApi.smali
 */

import { PlatformAccessory } from 'homebridge';
import { BlinkCamerasPlatform } from '../platform';
import { BlinkOwl } from '../types';
import { MotionCameraAccessoryBase } from './motion-base';

export class OwlAccessory extends MotionCameraAccessoryBase<BlinkOwl> {
  constructor(
    protected readonly platform: BlinkCamerasPlatform,
    protected readonly accessory: PlatformAccessory,
    protected device: BlinkOwl,
  ) {
    super(platform, accessory, device, {
      cameraType: 'owl',
      motionServiceName: device.name,
      switchServiceName: `${device.name} Motion`,
      logName: 'Mini',
      serial: device.serial ?? `${device.id}`,
    });

    // Configure accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)
      ?.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Blink')
      .setCharacteristic(this.platform.Characteristic.Model, 'Mini')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.serial ?? `${device.id}`);
  }

  /**
   * Enable or disable motion detection
   * Source: API Dossier Section 3.4 - enable/disable endpoints
   */
  protected async setMotionEnabledOnDevice(target: boolean): Promise<void> {
    if (target) {
      await this.platform.apiClient.enableOwlMotion(this.device.network_id, this.device.id);
      return;
    }
    await this.platform.apiClient.disableOwlMotion(this.device.network_id, this.device.id);
  }

  /**
   * Get the owl ID for matching with media clips.
   *
   * @returns The Blink owl (Mini camera) ID
   */
  getOwlId(): number {
    return this.device.id;
  }
}
