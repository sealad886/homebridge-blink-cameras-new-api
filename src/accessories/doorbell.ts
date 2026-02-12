/**
 * Blink Doorbell Accessory
 *
 * Exposes a Blink doorbell as HomeKit accessories:
 * - Doorbell: Ring notifications via ProgrammableSwitchEvent
 * - Switch: Toggle motion detection enabled/disabled
 * - MotionSensor: Report motion detection events
 * - Camera: Static snapshots via thumbnail API
 *
 * Source: API Dossier Section 3.5 (Doorbell Operations)
 * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.smali
 */

import { PlatformAccessory, Service } from 'homebridge';
import { BlinkCamerasPlatform } from '../platform';
import { BlinkDoorbell } from '../types';
import { MotionCameraAccessoryBase } from './motion-base';
import { configureAccessoryInfo } from './accessory-info';

export class DoorbellAccessory extends MotionCameraAccessoryBase<BlinkDoorbell> {
  private readonly doorbellService: Service;

  constructor(
    protected readonly platform: BlinkCamerasPlatform,
    protected readonly accessory: PlatformAccessory,
    protected device: BlinkDoorbell,
  ) {
    super(platform, accessory, device, {
      cameraType: 'doorbell',
      motionServiceName: `${device.name} Motion`,
      switchServiceName: `${device.name} Motion`,
      logName: 'doorbell',
      serial: device.serial ?? `${device.id}`,
    });

    // Configure accessory information
    configureAccessoryInfo(this.accessory, this.platform, 'Doorbell', device.serial ?? device.id);

    // Doorbell service for ring notifications
    this.doorbellService =
      this.accessory.getService(this.platform.Service.Doorbell) ||
      this.accessory.addService(this.platform.Service.Doorbell, device.name, 'doorbell');

    // ProgrammableSwitchEvent is used to trigger doorbell ring
    this.doorbellService
      .getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
      .setProps({ maxValue: 0, minValue: 0, validValues: [0] });
  }

  /**
   * Enable or disable motion detection
   * Source: API Dossier Section 3.5 - enable/disable endpoints
   */
  protected async setMotionEnabledOnDevice(target: boolean): Promise<void> {
    if (target) {
      await this.platform.apiClient.enableDoorbellMotion(this.device.network_id, this.device.id);
      return;
    }
    await this.platform.apiClient.disableDoorbellMotion(this.device.network_id, this.device.id);
  }

  /**
   * Trigger doorbell ring event.
   * Sends ProgrammableSwitchEvent.SINGLE_PRESS to HomeKit.
   * Called when a doorbell press is detected in media polling.
   */
  triggerRing(): void {
    const { ProgrammableSwitchEvent } = this.platform.Characteristic;

    this.doorbellService
      .getCharacteristic(ProgrammableSwitchEvent)
      .updateValue(ProgrammableSwitchEvent.SINGLE_PRESS);

    this.platform.log.info(`Doorbell ring: ${this.device.name}`);
  }
}
