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
import { MotionDeviceBase } from './motion-base';

export class DoorbellAccessory extends MotionDeviceBase<BlinkDoorbell> {
  private readonly doorbellService: Service;

  constructor(
    platform: BlinkCamerasPlatform,
    accessory: PlatformAccessory,
    device: BlinkDoorbell,
  ) {
    super(platform, accessory, device, 'Doorbell', 'doorbell', 'doorbell', `${device.name} Motion`);

    this.doorbellService =
      this.accessory.getService(this.platform.Service.Doorbell) ||
      this.accessory.addService(this.platform.Service.Doorbell, device.name, 'doorbell');

    this.doorbellService
      .getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
      .setProps({ maxValue: 0, minValue: 0, validValues: [0] });
  }

  protected async enableMotionApi(): Promise<void> {
    await this.platform.apiClient.enableDoorbellMotion(this.device.network_id, this.device.id);
  }

  protected async disableMotionApi(): Promise<void> {
    await this.platform.apiClient.disableDoorbellMotion(this.device.network_id, this.device.id);
  }

  triggerRing(): void {
    const { ProgrammableSwitchEvent } = this.platform.Characteristic;

    this.doorbellService
      .getCharacteristic(ProgrammableSwitchEvent)
      .updateValue(ProgrammableSwitchEvent.SINGLE_PRESS);

    this.platform.log.info(`Doorbell ring: ${this.device.name}`);
  }
}
