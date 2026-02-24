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

import { CameraController, CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { BlinkCamerasPlatform } from '../platform';
import { BlinkCamera } from '../types';
import { setTimeout, clearTimeout } from 'timers';
import { BlinkCameraSource, createCameraControllerOptions } from './camera-source';

export class CameraAccessory {
  private readonly switchService: Service;
  private readonly motionService: Service;
  private readonly cameraController: CameraController;
  private motionDetected = false;
  private motionTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly platform: BlinkCamerasPlatform,
    private readonly accessory: PlatformAccessory,
    private device: BlinkCamera,
  ) {
    // Configure accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)
      ?.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Blink')
      .setCharacteristic(this.platform.Characteristic.Model, device.type ?? 'Camera')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.serial ?? `${device.id}`);

    // Switch service for motion detection enable/disable
    this.switchService =
      this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch, `${device.name} Motion`, 'motion-switch');

    this.switchService
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.device.enabled)
      .onSet(async (value) => this.setMotionEnabled(value));

    // MotionSensor service for motion detection events
    this.motionService =
      this.accessory.getService(this.platform.Service.MotionSensor) ||
      this.accessory.addService(this.platform.Service.MotionSensor, device.name, 'motion-sensor');

    this.motionService
      .getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(() => this.motionDetected);

    // StatusActive indicates if the sensor is operational (motion enabled)
    this.motionService
      .getCharacteristic(this.platform.Characteristic.StatusActive)
      .onGet(() => this.device.enabled);

    // StatusFault indicates if the camera is offline/unavailable
    this.motionService
      .getCharacteristic(this.platform.Characteristic.StatusFault)
      .onGet(() => this.isDeviceOffline() ? 1 : 0);

    // Camera controller for snapshot support
    // Determine device type from API response - Mini cameras have type 'owl'
    // and require different API endpoints even when returned in cameras array
    const deviceType = device.type === 'owl' ? 'owl' : 'camera';
    this.platform.log.debug(`[${device.name}] Camera type detection: device.type='${device.type}', using deviceType='${deviceType}'`);

    const cameraSource = new BlinkCameraSource(
      this.platform.apiClient,
      this.platform.api.hap,
      device.network_id,
      device.id,
      deviceType,
      device.serial ?? `${device.id}`,
      () => this.device.thumbnail,
      () => this.device.status,
      (msg) => this.platform.log.debug(`[${device.name}] ${msg}`),
      this.platform.streamingConfig,
    );

    this.cameraController = new this.platform.api.hap.CameraController(
      createCameraControllerOptions(this.platform.api.hap, cameraSource, this.platform.streamingConfig),
    );
    this.accessory.configureController(this.cameraController);
  }

  /**
   * Check if device is offline based on status field.
   * Blink API returns status 'done' for online cameras, other values indicate offline/unavailable.
   *
   * @returns true if device is offline or unavailable
   */
  private isDeviceOffline(): boolean {
    return this.device.status !== undefined && this.device.status !== 'done';
  }

  /**
   * Enable or disable motion detection
   * Source: API Dossier Section 3.3 - enable/disable endpoints
   */
  private async setMotionEnabled(value: CharacteristicValue): Promise<void> {
    const target = Boolean(value);

    if (target === this.device.enabled) {
      return;
    }

    try {
      if (target) {
        await this.platform.apiClient.enableCameraMotion(this.device.network_id, this.device.id);
        this.platform.log.info(`Enabled motion detection for camera: ${this.device.name}`);
      } else {
        await this.platform.apiClient.disableCameraMotion(this.device.network_id, this.device.id);
        this.platform.log.info(`Disabled motion detection for camera: ${this.device.name}`);
      }

      this.device.enabled = target;
      this.accessory.context.device = this.device;

      // Update motion sensor StatusActive
      this.motionService
        .getCharacteristic(this.platform.Characteristic.StatusActive)
        .updateValue(target);
    } catch (error) {
      this.platform.log.error(`Failed to ${target ? 'enable' : 'disable'} motion for camera ${this.device.name}:`, error);
      throw error;
    }
  }

  /**
   * Update device state from polling.
   * Called by platform when homescreen data is refreshed.
   * Updates Switch and StatusActive characteristics if enabled state changed.
   * Updates StatusFault characteristic if camera online/offline status changed.
   *
   * @param device - Fresh device data from Blink API homescreen response
   */
  updateState(device: BlinkCamera): void {
    const previousEnabled = this.device.enabled;
    const previousStatus = this.device.status;
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
        `Camera ${device.name} motion detection: ${device.enabled ? 'enabled' : 'disabled'}`,
      );
    }

    // Update StatusFault if camera online/offline status changed
    if (previousStatus !== device.status) {
      const isOffline = this.isDeviceOffline();
      this.motionService
        .getCharacteristic(this.platform.Characteristic.StatusFault)
        .updateValue(isOffline ? 1 : 0);

      this.platform.log.debug(
        `Camera ${device.name} status: ${device.status ?? 'unknown'} (${isOffline ? 'offline' : 'online'})`,
      );
    }
  }

  /**
   * Trigger motion detected event.
   * Called when a new motion clip is detected for this camera.
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

    this.platform.log.info(`Motion detected on camera: ${this.device.name}`);

    this.motionTimeout = setTimeout(() => {
      this.motionDetected = false;
      this.motionService
        .getCharacteristic(this.platform.Characteristic.MotionDetected)
        .updateValue(false);
      this.motionTimeout = null;
    }, timeoutMs);
  }

  /**
   * Get the camera ID for matching with media clips.
   *
   * @returns The Blink camera ID
   */
  getCameraId(): number {
    return this.device.id;
  }
}
