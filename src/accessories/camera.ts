/**
 * Blink Camera Accessory
 *
 * Exposes a Blink camera as HomeKit accessories:
 * - Switch: Toggle motion detection enabled/disabled
 * - MotionSensor: Report motion detection events
 * - Camera: Static snapshots via thumbnail API
 *
 * Source: API Dossier Section 3.3 (Camera Operations)
 * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/CameraApi.smali
 */

import { PlatformAccessory } from 'homebridge';
import { BlinkCamerasPlatform } from '../platform';
import { BlinkCamera } from '../types';
import { MotionDeviceBase } from './motion-base';

export class CameraAccessory extends MotionDeviceBase<BlinkCamera> {
  constructor(
    platform: BlinkCamerasPlatform,
    accessory: PlatformAccessory,
    device: BlinkCamera,
  ) {
    const deviceType = device.type === 'owl' ? 'owl' as const : 'camera' as const;
    super(platform, accessory, device, device.type ?? 'Camera', 'camera', deviceType);
    platform.log.debug(
      `[${device.name}] Camera type detection: device.type='${device.type}', using deviceType='${deviceType}'`,
    );
  }

  protected async enableMotionApi(): Promise<void> {
    await this.platform.apiClient.enableCameraMotion(this.device.network_id, this.device.id);
  }

  protected async disableMotionApi(): Promise<void> {
    await this.platform.apiClient.disableCameraMotion(this.device.network_id, this.device.id);
  }
}
