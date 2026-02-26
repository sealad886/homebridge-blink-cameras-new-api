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
import { MotionDeviceBase } from './motion-base';

export class OwlAccessory extends MotionDeviceBase<BlinkOwl> {
  constructor(
    platform: BlinkCamerasPlatform,
    accessory: PlatformAccessory,
    device: BlinkOwl,
  ) {
    super(platform, accessory, device, 'Mini', 'Mini', 'owl');
  }

  protected async enableMotionApi(): Promise<void> {
    await this.platform.apiClient.enableOwlMotion(this.device.network_id, this.device.id);
  }

  protected async disableMotionApi(): Promise<void> {
    await this.platform.apiClient.disableOwlMotion(this.device.network_id, this.device.id);
  }
}
