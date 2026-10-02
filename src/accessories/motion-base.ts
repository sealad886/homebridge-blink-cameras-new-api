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
import { withResponseBudget, RequestOptions } from '../operation-budget';
import { toHapError } from '../hap-errors';
import { BlinkCamerasPlatform } from '../platform';
import { setHapServiceName, toHapName } from '../hap-name';
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
  protected readonly cameraSource: BlinkCameraSource;
  protected motionDetected = false;
  protected motionTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly refreshSnapshotService?: Service;
  private motionFault = false;
  private refreshFault = false;
  private pendingMotionOperations = 0;
  private motionIntentRevision = 0;
  private failedMotionTarget?: boolean;

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
    return this.platform.isOperational() && this.device.enabled && this.isDeviceAvailable();
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
      this.accessory.getServiceById(this.platform.Service.Switch, 'motion-switch') ||
      this.accessory.addService(
        this.platform.Service.Switch,
        toHapName(`${device.name} Motion`, 'Blink Motion'),
        'motion-switch',
      );
    setHapServiceName(
      this.switchService,
      this.platform.Characteristic.Name,
      `${device.name} Motion`,
      'Blink Motion',
    );

    this.switchService
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.device.enabled)
      .onSet(async (value) => this.setMotionEnabled(value));

    this.motionService =
      this.accessory.getServiceById(this.platform.Service.MotionSensor, 'motion-sensor') ||
      this.accessory.addService(
        this.platform.Service.MotionSensor,
        toHapName(motionSensorDisplayName ?? device.name, 'Blink Motion'),
        'motion-sensor',
      );
    setHapServiceName(
      this.motionService,
      this.platform.Characteristic.Name,
      motionSensorDisplayName ?? device.name,
      'Blink Motion',
    );

    this.motionService
      .getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(() => this.motionDetected);

    this.motionService
      .getCharacteristic(this.platform.Characteristic.StatusActive)
      .onGet(() => this.isMotionServiceActive());

    this.cameraSource = new BlinkCameraSource(
      this.platform.apiClient,
      this.platform.api.hap,
      device.network_id,
      device.id,
      cameraSourceType,
      device.serial ?? `${device.id}`,
      () => this.device.thumbnail,
      () => this.platform.isOperational() && this.isDeviceAvailable(),
      (msg) => this.platform.log.debug(`[${device.name}] ${msg}`),
      this.platform.streamingConfig,
      (msg) => this.platform.log.error(`[${device.name}] ${msg}`),
    );

    this.cameraController = new this.platform.api.hap.CameraController(
      createCameraControllerOptions(this.platform.api.hap, this.cameraSource, this.platform.streamingConfig),
    );
    this.accessory.configureController(this.cameraController);

    const existingRefreshService = this.accessory.getServiceById(this.platform.Service.Switch, 'snapshot-refresh');
    if (this.platform.streamingConfig.persistSnapshotCache) {
      this.refreshSnapshotService = existingRefreshService ??
        this.accessory.addService(
          this.platform.Service.Switch,
          toHapName(`${device.name} Refresh Snapshot`, 'Blink Refresh Snapshot'),
          'snapshot-refresh',
        );
      this.refreshSnapshotService
        .getCharacteristic(this.platform.Characteristic.On)
        .onGet(() => false)
        .onSet(async (value) => this.refreshSnapshot(value));
      setHapServiceName(
        this.refreshSnapshotService,
        this.platform.Characteristic.Name,
        `${device.name} Refresh Snapshot`,
        'Blink Refresh Snapshot',
      );
    } else if (existingRefreshService) {
      this.accessory.removeService(existingRefreshService);
    }
  }

  protected abstract enableMotionApi(options?: RequestOptions): Promise<void>;
  protected abstract disableMotionApi(options?: RequestOptions): Promise<void>;

  private async refreshSnapshot(value: CharacteristicValue): Promise<void> {
    if (value !== true) {
      return;
    }

    try {
      await withResponseBudget(this.cameraSource.refreshSnapshotCache().then(() => {
        this.refreshFault = false;
        this.updateAvailability();
      }));
      this.platform.log.info(`Manually refreshed snapshot for ${this.deviceLabel}: ${this.device.name}`);
    } catch (error) {
      this.platform.log.error(`Failed to refresh snapshot for ${this.deviceLabel} ${this.device.name}: ${error instanceof Error ? error.name : 'Error'}`);
      this.refreshFault = true;
      this.updateAvailability();
      throw toHapError(this.platform.api.hap, error);
    } finally {
      this.refreshSnapshotService
        ?.getCharacteristic(this.platform.Characteristic.On)
        .updateValue(false);
    }
  }

  private async setMotionEnabled(value: CharacteristicValue): Promise<void> {
    const target = Boolean(value);

    if (this.pendingMotionOperations === 0 && target === this.device.enabled) {
      return;
    }

    const revision = ++this.motionIntentRevision;
    this.pendingMotionOperations++;
    this.failedMotionTarget = target;
    try {
      const options = { queueDeadline: Date.now() + 12_000 };
      const operation = (target ? this.enableMotionApi(options) : this.disableMotionApi(options)).then(() => {
        this.device.enabled = target;
        this.accessory.context.device = this.device;
        if (revision === this.motionIntentRevision) {
          this.motionFault = false;
          this.failedMotionTarget = undefined;
          this.switchService.getCharacteristic(this.platform.Characteristic.On).updateValue(target);
        }
        this.updateAvailability();
        this.platform.log.info(`${target ? 'Enabled' : 'Disabled'} motion detection for ${this.deviceLabel}: ${this.device.name}`);
      }).finally(() => { this.pendingMotionOperations--; });
      await withResponseBudget(operation);
    } catch (error) {
      this.platform.log.error(
        `Failed to ${target ? 'enable' : 'disable'} motion for ${this.deviceLabel} ${this.device.name}: ${error instanceof Error ? error.name : 'Error'}`,
      );
      if (revision === this.motionIntentRevision) { this.motionFault = true; }
      this.updateAvailability();
      throw toHapError(this.platform.api.hap, error);
    }
  }

  updateState(device: TDevice): void {
    const previousEnabled = this.device.enabled;
    if (this.pendingMotionOperations === 0 && this.failedMotionTarget !== undefined && device.enabled === this.failedMotionTarget) {
      this.motionFault = false;
      this.failedMotionTarget = undefined;
    }
    this.device = device;
    this.accessory.context.device = device;

    if (previousEnabled !== device.enabled && this.pendingMotionOperations === 0) {
      this.switchService
        .getCharacteristic(this.platform.Characteristic.On)
        .updateValue(device.enabled);
      this.platform.log.debug(
        `${this.deviceLabel.charAt(0).toUpperCase() + this.deviceLabel.slice(1)} ${device.name} motion detection: ${device.enabled ? 'enabled' : 'disabled'}`,
      );
    }

    this.updateAvailability();
  }

  public updateAvailability(): void {
    this.motionService
      .getCharacteristic(this.platform.Characteristic.StatusFault)
      .updateValue(this.motionFault || this.refreshFault || !this.platform.isOperational() || !this.isDeviceAvailable() ? 1 : 0);
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
