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
import { MotionCameraAccessoryBase } from './motion-base';
import { configureAccessoryInfo } from './accessory-info';

export class CameraAccessory extends MotionCameraAccessoryBase<BlinkCamera> {
  constructor(
    protected readonly platform: BlinkCamerasPlatform,
    protected readonly accessory: PlatformAccessory,
    protected device: BlinkCamera,
  ) {
    const deviceType = device.type === 'owl' ? 'owl' : 'camera';
    super(platform, accessory, device, {
      cameraType: deviceType,
      motionServiceName: device.name,
      switchServiceName: `${device.name} Motion`,
      logName: 'camera',
      serial: device.serial ?? `${device.id}`,
    });

    // Configure accessory information
    configureAccessoryInfo(this.accessory, this.platform, device.type ?? 'Camera', device.serial ?? device.id);

    // Camera controller for snapshot support
    // Determine device type from API response - Mini cameras have type 'owl'
    // and require different API endpoints even when returned in cameras array
    this.platform.log.debug(
      `[${device.name}] Camera type detection: device.type='${device.type}', using deviceType='${deviceType}'`,
    );
  }

  /**
   * Enable or disable motion detection
   * Source: API Dossier Section 3.3 - enable/disable endpoints
   */
  protected async setMotionEnabledOnDevice(target: boolean): Promise<void> {
    const deviceType = this.device.type === 'owl' ? 'owl' as const : 'camera' as const;
    if (target) {
      await this.platform.apiClient.enableMotion(deviceType, this.device.network_id, this.device.id);
      return;
    }
    await this.platform.apiClient.disableMotion(deviceType, this.device.network_id, this.device.id);
  }
}
