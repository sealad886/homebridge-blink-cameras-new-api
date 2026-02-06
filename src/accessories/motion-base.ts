/**
 * Motion + Snapshot Accessory Base
 *
 * Shared logic for motion-enabled camera accessories:
 * - Switch for motion enable/disable
 * - MotionSensor state + timeout reset
 * - CameraController for snapshot support
 */

import { CameraController, CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { setTimeout, clearTimeout } from 'timers';
import { BlinkCamerasPlatform } from '../platform';
import { BlinkCameraSource, createCameraControllerOptions } from './camera-source';

export interface MotionDevice {
  id: number;
  network_id: number;
  name: string;
  enabled: boolean;
  serial?: string;
  thumbnail?: string;
}

export interface MotionAccessoryOptions {
  cameraType: 'camera' | 'doorbell' | 'owl';
  motionServiceName: string;
  switchServiceName: string;
  logName: string;
  serial: string;
}

export abstract class MotionCameraAccessoryBase<TDevice extends MotionDevice> {
  protected readonly switchService: Service;
  protected readonly motionService: Service;
  protected readonly cameraController: CameraController;
  protected motionDetected = false;
  protected motionTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly logName: string;
  private readonly stateLabel: string;

  constructor(
    protected readonly platform: BlinkCamerasPlatform,
    protected readonly accessory: PlatformAccessory,
    protected device: TDevice,
    options: MotionAccessoryOptions,
  ) {
    this.logName = options.logName;
    this.stateLabel = options.logName.charAt(0).toUpperCase() + options.logName.slice(1);

    // Switch service for motion detection enable/disable
    this.switchService =
      this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch, options.switchServiceName, 'motion-switch');

    this.switchService
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.device.enabled)
      .onSet(async (value) => this.setMotionEnabled(value));

    // MotionSensor service for motion detection events
    this.motionService =
      this.accessory.getService(this.platform.Service.MotionSensor) ||
      this.accessory.addService(this.platform.Service.MotionSensor, options.motionServiceName, 'motion-sensor');

    this.motionService
      .getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(() => this.motionDetected);

    // StatusActive indicates if the sensor is operational (motion enabled)
    this.motionService
      .getCharacteristic(this.platform.Characteristic.StatusActive)
      .onGet(() => this.device.enabled);

    const cameraSource = new BlinkCameraSource(
      this.platform.apiClient,
      this.platform.api.hap,
      this.device.network_id,
      this.device.id,
      options.cameraType,
      options.serial,
      () => this.getThumbnail(),
      (msg) => this.platform.log.debug(`[${this.device.name}] ${msg}`),
      this.platform.streamingConfig,
    );

    this.cameraController = new this.platform.api.hap.CameraController(
      createCameraControllerOptions(this.platform.api.hap, cameraSource, this.platform.streamingConfig),
    );
    this.accessory.configureController(this.cameraController);
  }

  protected abstract setMotionEnabledOnDevice(target: boolean): Promise<void>;

  protected getThumbnail(): string | undefined {
    return this.device.thumbnail;
  }

  /**
   * Enable or disable motion detection
   */
  private async setMotionEnabled(value: CharacteristicValue): Promise<void> {
    const target = Boolean(value);

    if (target === this.device.enabled) {
      return;
    }

    try {
      await this.setMotionEnabledOnDevice(target);
      this.platform.log.info(
        `${target ? 'Enabled' : 'Disabled'} motion detection for ${this.logName}: ${this.device.name}`,
      );

      this.device.enabled = target;
      this.accessory.context.device = this.device;

      // Update motion sensor StatusActive
      this.motionService
        .getCharacteristic(this.platform.Characteristic.StatusActive)
        .updateValue(target);
    } catch (error) {
      this.platform.log.error(`Failed to ${target ? 'enable' : 'disable'} motion for ${this.logName} ${this.device.name}:`, error);
      throw error;
    }
  }

  /**
   * Update device state from polling.
   * Called by platform when homescreen data is refreshed.
   * Updates Switch and StatusActive characteristics if enabled state changed.
   *
   * @param device - Fresh device data from Blink API homescreen response
   */
  updateState(device: TDevice): void {
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
        `${this.stateLabel} ${device.name} motion detection: ${device.enabled ? 'enabled' : 'disabled'}`,
      );
    }
  }

  /**
   * Trigger motion detected event.
   * Called when a new motion clip is detected for this device.
   * Sets MotionDetected characteristic to true, then auto-resets after timeout.
   *
   * @param timeoutMs - Duration in milliseconds before resetting motion state (default 30000)
   */
  triggerMotion(timeoutMs = 30000): void {
    if (this.motionTimeout) {
      clearTimeout(this.motionTimeout);
    }

    this.motionDetected = true;
    this.motionService
      .getCharacteristic(this.platform.Characteristic.MotionDetected)
      .updateValue(true);

    this.platform.log.info(`Motion detected on ${this.logName}: ${this.device.name}`);

    this.motionTimeout = setTimeout(() => {
      this.motionDetected = false;
      this.motionService
        .getCharacteristic(this.platform.Characteristic.MotionDetected)
        .updateValue(false);
      this.motionTimeout = null;
    }, timeoutMs);
  }
}
