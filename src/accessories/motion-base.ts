/**
 * Abstract base class for motion-capable Blink devices.
 *
 * Provides shared functionality for camera, owl, and doorbell accessories:
 * - Switch service for motion detection enable/disable
 * - MotionSensor service for motion events
 * - Camera controller for snapshot/streaming support
 * - Polling state updates and motion trigger handling
 *
 * Subclasses supply device-specific API calls and metadata.
 */

import { CameraController, CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { BlinkCamerasPlatform } from '../platform';
import { setTimeout, clearTimeout } from 'timers';
import { BlinkCameraSource, createCameraControllerOptions, DeviceType } from './camera-source';

export interface MotionDevice {
  id: number;
  network_id: number;
  name: string;
  enabled: boolean;
  status?: string;
  serial?: string;
  thumbnail?: string;
  type?: string;
}

export abstract class MotionDeviceBase<TDevice extends MotionDevice> {
  protected readonly switchService: Service;
  protected readonly motionService: Service;
  protected readonly cameraController: CameraController;
  protected motionDetected = false;
  protected motionTimeout: ReturnType<typeof setTimeout> | null = null;

  private isDeviceAvailable(): boolean {
    const status = this.device.status?.trim().toLowerCase();
    if (!status) {
      return true;
    }

    const unavailableStatuses = new Set([
      'offline',
      'unavailable',
      'disconnected',
      'unreachable',
      'down',
    ]);

    return !unavailableStatuses.has(status);
  }

  private isMotionServiceActive(): boolean {
    return this.device.enabled && this.isDeviceAvailable();
  }

  constructor(
    protected readonly platform: BlinkCamerasPlatform,
    protected readonly accessory: PlatformAccessory,
    protected device: TDevice,
    private readonly modelName: string,
    private readonly deviceLabel: string,
    private readonly cameraSourceType: DeviceType,
    motionSensorDisplayName?: string,
  ) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)
      ?.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Blink')
      .setCharacteristic(this.platform.Characteristic.Model, modelName)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.serial ?? `${device.id}`);

    this.switchService =
      this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch, `${device.name} Motion`, 'motion-switch');

    this.switchService
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.device.enabled)
      .onSet(async (value) => this.setMotionEnabled(value));

    this.motionService =
      this.accessory.getService(this.platform.Service.MotionSensor) ||
      this.accessory.addService(
        this.platform.Service.MotionSensor,
        motionSensorDisplayName ?? device.name,
        'motion-sensor',
      );

    this.motionService
      .getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(() => this.motionDetected);

    this.motionService
      .getCharacteristic(this.platform.Characteristic.StatusActive)
      .onGet(() => this.isMotionServiceActive());

    const cameraSource = new BlinkCameraSource(
      this.platform.apiClient,
      this.platform.api.hap,
      device.network_id,
      device.id,
      cameraSourceType,
      device.serial ?? `${device.id}`,
      () => this.device.thumbnail,
      () => this.isDeviceAvailable(),
      (msg) => this.platform.log.debug(`[${device.name}] ${msg}`),
      this.platform.streamingConfig,
    );

    this.cameraController = new this.platform.api.hap.CameraController(
      createCameraControllerOptions(this.platform.api.hap, cameraSource, this.platform.streamingConfig),
    );
    this.accessory.configureController(this.cameraController);
  }

  protected abstract enableMotionApi(): Promise<void>;
  protected abstract disableMotionApi(): Promise<void>;

  private async setMotionEnabled(value: CharacteristicValue): Promise<void> {
    const target = Boolean(value);

    if (target === this.device.enabled) {
      return;
    }

    try {
      if (target) {
        await this.enableMotionApi();
        this.platform.log.info(`Enabled motion detection for ${this.deviceLabel}: ${this.device.name}`);
      } else {
        await this.disableMotionApi();
        this.platform.log.info(`Disabled motion detection for ${this.deviceLabel}: ${this.device.name}`);
      }

      this.device.enabled = target;
      this.accessory.context.device = this.device;

      this.motionService
        .getCharacteristic(this.platform.Characteristic.StatusActive)
        .updateValue(target);
    } catch (error) {
      this.platform.log.error(
        `Failed to ${target ? 'enable' : 'disable'} motion for ${this.deviceLabel} ${this.device.name}:`,
        error,
      );
      throw error;
    }
  }

  updateState(device: TDevice): void {
    const previousEnabled = this.device.enabled;
    this.device = device;
    this.accessory.context.device = device;

    if (previousEnabled !== device.enabled) {
      this.switchService
        .getCharacteristic(this.platform.Characteristic.On)
        .updateValue(device.enabled);
      this.platform.log.debug(
        `${this.deviceLabel.charAt(0).toUpperCase() + this.deviceLabel.slice(1)} ${device.name} motion detection: ${device.enabled ? 'enabled' : 'disabled'}`,
      );
    }

    this.motionService
      .getCharacteristic(this.platform.Characteristic.StatusActive)
      .updateValue(this.isMotionServiceActive());
  }

  triggerMotion(timeoutMs = 30000): void {
    if (this.motionTimeout) {
      clearTimeout(this.motionTimeout);
    }

    this.motionDetected = true;
    this.motionService
      .getCharacteristic(this.platform.Characteristic.MotionDetected)
      .updateValue(true);

    this.platform.log.info(`Motion detected on ${this.deviceLabel}: ${this.device.name}`);

    this.motionTimeout = setTimeout(() => {
      this.motionDetected = false;
      this.motionService
        .getCharacteristic(this.platform.Characteristic.MotionDetected)
        .updateValue(false);
      this.motionTimeout = null;
    }, timeoutMs);
  }
}
