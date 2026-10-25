import { RequestOptions, withinRequestBudget } from '../operation-budget';
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

import { PlatformAccessory, Service } from 'homebridge';
import { BlinkCamerasPlatform } from '../platform';
import { BlinkCamera } from '../types';
import { MotionDeviceBase } from './motion-base';
import { deviceServiceName, setHapServiceName } from '../hap-name';

export class CameraAccessory extends MotionDeviceBase<BlinkCamera> {
  private temperatureService?: Service;
  private temperatureCelsius?: number;
  private temperatureReadPending = false;
  private readonly exposeTemperature: boolean;

  constructor(
    platform: BlinkCamerasPlatform,
    accessory: PlatformAccessory,
    device: BlinkCamera,
  ) {
    const deviceType = device.type === 'owl' ? 'owl' as const : 'camera' as const;
    super(platform, accessory, device, device.type ?? 'Camera', 'camera', deviceType);
    this.exposeTemperature = deviceType === 'camera' && platform.isTemperatureEnabled(device);
    this.temperatureService = accessory.getServiceById(platform.Service.TemperatureSensor, 'temperature');
    if (!this.exposeTemperature && this.temperatureService) {
      accessory.removeService(this.temperatureService);
      this.temperatureService = undefined;
      platform.api.updatePlatformAccessories([accessory]);
    }
    if (this.temperatureService) this.configureTemperatureService();
    // Discovery/recovery marks the bridge healthy after constructing/updating handlers.
    void Promise.resolve().then(() => this.refreshTemperature());
    platform.log.debug(
      `[${device.name}] Camera type detection: device.type='${device.type}', using deviceType='${deviceType}'`,
    );
  }

  private configureTemperatureService(): void {
    const service = this.temperatureService!;
    setHapServiceName(service, this.platform.Characteristic.Name,
      deviceServiceName(this.accessory.displayName || this.device.name, 'Temperature'),
      'Blink Temperature', this.platform.Characteristic.ConfiguredName);
    service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).onGet(() => {
      if (!this.isTemperatureAvailable()) {
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
      return this.temperatureCelsius!;
    });
    this.updateAvailability();
  }

  private isTemperatureAvailable(): boolean {
    return this.temperatureCelsius !== undefined && this.platform.isOperational() && this.isDeviceAvailable();
  }

  private async refreshTemperature(): Promise<void> {
    if (!this.exposeTemperature || this.temperatureReadPending) return;
    if (!this.platform.isOperational() || !this.isDeviceAvailable()) {
      this.temperatureCelsius = undefined;
      this.updateAvailability();
      return;
    }
    this.temperatureReadPending = true;
    try {
      const options = { deadline: Date.now() + 10_000 };
      this.temperatureCelsius = await withinRequestBudget(
        this.platform.apiClient.getCameraTemperature(this.device.network_id, this.device.id, options), options,
      );
      if (this.temperatureCelsius !== undefined && !this.temperatureService) {
        this.temperatureService = this.accessory.addService(this.platform.Service.TemperatureSensor,
          deviceServiceName(this.accessory.displayName || this.device.name, 'Temperature'), 'temperature');
        this.configureTemperatureService();
        this.platform.api.updatePlatformAccessories([this.accessory]);
      }
    } catch {
      this.temperatureCelsius = undefined;
      this.platform.log.debug(`[${this.device.name}] Temperature metadata unavailable`);
    } finally {
      this.temperatureReadPending = false;
      this.updateAvailability();
    }
  }

  override updateState(device: BlinkCamera): void {
    super.updateState(device);
    void Promise.resolve().then(() => this.refreshTemperature());
  }

  override updateAvailability(): void {
    super.updateAvailability();
    if (!this.temperatureService) return;
    const available = this.isTemperatureAvailable();
    this.temperatureService.getCharacteristic(this.platform.Characteristic.StatusActive).updateValue(available);
    this.temperatureService.getCharacteristic(this.platform.Characteristic.StatusFault).updateValue(available ? 0 : 1);
    this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature).updateValue(available
      ? this.temperatureCelsius!
      : new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE));
  }

  protected async enableMotionApi(options?: RequestOptions): Promise<void> {
    await this.platform.apiClient.enableCameraMotion(this.device.network_id, this.device.id, options);
  }

  protected async disableMotionApi(options?: RequestOptions): Promise<void> {
    await this.platform.apiClient.disableCameraMotion(this.device.network_id, this.device.id, options);
  }
}
