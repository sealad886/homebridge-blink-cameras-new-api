/**
 * Accessory Information Configuration Helper
 *
 * Central place to configure standard HomeKit AccessoryInformation
 * for all Blink device accessories.
 */

import { PlatformAccessory } from 'homebridge';
import { BlinkCamerasPlatform } from '../platform';

/**
 * Configure standard Blink accessory information
 * Sets manufacturer, model, and serial number characteristics.
 *
 * @param accessory - Platform accessory to configure
 * @param platform - Blink platform instance
 * @param model - Device model name (e.g., 'Camera', 'Doorbell', 'Mini', 'Network')
 * @param serial - Device serial number or ID
 */
export function configureAccessoryInfo(
  accessory: PlatformAccessory,
  platform: BlinkCamerasPlatform,
  model: string,
  serial: string | number,
): void {
  accessory
    .getService(platform.Service.AccessoryInformation)
    ?.setCharacteristic(platform.Characteristic.Manufacturer, 'Blink')
    .setCharacteristic(platform.Characteristic.Model, model)
    .setCharacteristic(platform.Characteristic.SerialNumber, String(serial));
}
