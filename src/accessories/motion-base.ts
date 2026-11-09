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

import { CameraController, Characteristic, CharacteristicChange, CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { withResponseBudget, RequestOptions } from '../operation-budget';
import { toHapError } from '../hap-errors';
import { BlinkCamerasPlatform } from '../platform';
import { logHomeKitEvent } from '../homekit-audit';
import { deviceServiceName, setHapServiceName } from '../hap-name';
import { setTimeout, clearTimeout, setImmediate } from 'timers';
import { BlinkCameraSource, createCameraControllerOptions, refreshCameraAudioCapabilities, DeviceType } from './camera-source';
import { nativeRecordingDevicePolicy } from '../native-recording-config';
import { NativeRecordingDelegate } from './native-recording-delegate';

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
  protected readonly motionService?: Service;
  protected readonly cameraController: CameraController;
  protected readonly cameraSource: BlinkCameraSource;
  private readonly recordingListeners: (() => void)[] = [];
  protected motionDetected = false;
  protected motionTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly refreshSnapshotService?: Service;
  private motionFault = false;
  private refreshFault = false;
  private pendingMotionOperations = 0;
  private motionIntentRevision = 0;
  private failedMotionTarget?: boolean;
  private inputQualityObservationPending = false;
  private readonly nativeRecording?: NativeRecordingDelegate;
  private homeKitCameraActive = true;

  protected isDeviceAvailable(): boolean {
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
  ) {
    const cameraName = this.accessory.displayName || device.name;
    const nativePolicy = nativeRecordingDevicePolicy(this.platform.config?.deviceSettingOverrides, { ...device, kind: cameraSourceType }, this.platform.config?.exposeMotionDetected);
    const motionControlName = deviceServiceName(cameraName, 'Motion Detection');
    const motionSensorName = deviceServiceName(cameraName, 'Motion Detected');
    const refreshName = deviceServiceName(cameraName, 'Refresh Snapshot');

    this.accessory.getService(this.platform.Service.AccessoryInformation)
      ?.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Blink')
      .setCharacteristic(this.platform.Characteristic.Model, modelName)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.serial ?? `${device.id}`);

    this.switchService =
      this.accessory.getServiceById(this.platform.Service.Switch, 'motion-switch') ||
      this.accessory.addService(
        this.platform.Service.Switch,
        motionControlName,
        'motion-switch',
      );
    setHapServiceName(
      this.switchService,
      this.platform.Characteristic.Name,
      motionControlName,
      'Blink Motion',
      this.platform.Characteristic.ConfiguredName,
    );

    this.switchService
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.device.enabled)
      .onSet(async (value) => this.setMotionEnabled(value));

    const previousMotion = this.accessory.getServiceById(this.platform.Service.MotionSensor, 'motion-sensor');
    if (!nativePolicy.exposeMotionDetected && previousMotion) this.accessory.removeService(previousMotion);
    this.motionService = nativePolicy.exposeMotionDetected ? (
      previousMotion ||
      this.accessory.addService(
        this.platform.Service.MotionSensor,
        motionSensorName,
        'motion-sensor',
      )) : undefined;
    if (this.motionService) setHapServiceName(
      this.motionService,
      this.platform.Characteristic.Name,
      motionSensorName,
      'Blink Motion',
      this.platform.Characteristic.ConfiguredName,
    );

    this.motionService
      ?.getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(() => this.motionDetected);

    this.motionService
      ?.getCharacteristic(this.platform.Characteristic.StatusActive)
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
      { ...this.platform.streamingConfig, passiveSnapshots: nativePolicy.homeKitSecureVideo },
      (msg) => this.platform.log.error(`[${device.name}] ${msg}`),
      async (options) => {
        const quality = this.platform.getDeviceInputQuality(this.device, this.cameraSourceType);
        const remember = (state: { quality?: string }) => {
          if (!options.signal?.aborted && state.quality && !this.accessory.context.initialInputQuality) {
            this.accessory.context.initialInputQuality = state.quality;
            this.platform.api.updatePlatformAccessories([this.accessory]);
          }
        };
        if (quality === 'auto') {
          // Observation must not delay default startup. The request retains the
          // generation's cancellation/deadline and only one read may be pending.
          if (!this.accessory.context.initialInputQuality && !this.inputQualityObservationPending) {
            this.inputQualityObservationPending = true;
            void this.platform.apiClient.getDeviceVideoQuality(cameraSourceType, this.device.network_id, this.device.id, options)
              .then(remember)
              .catch(() => this.platform.log.debug(`[${device.name}] Input quality metadata unavailable`))
              .finally(() => { this.inputQualityObservationPending = false; });
          }
          return;
        }
        const state = await this.platform.apiClient.setDeviceVideoQuality(cameraSourceType, this.device.network_id, this.device.id, quality, options);
        remember(state);
      },
      (observation) => {
        if (!this.accessory.context.initialInputVideo) {
          this.accessory.context.initialInputVideo = observation;
          this.platform.api.updatePlatformAccessories([this.accessory]);
          this.platform.log.info(`[${device.name}] Initial input video: ${observation.width}x${observation.height}${observation.fps ? ` at ${observation.fps} fps` : ''}`);
        }
      },
      event => logHomeKitEvent(this.platform.log, this.accessory, event),
      () => this.platform.acquireCameraFeed(this.cameraSourceType, this.device.id),
    );

    const controllerOptions = createCameraControllerOptions(this.platform.api.hap, this.cameraSource, this.platform.streamingConfig);
    const previousRecordingMotion = this.accessory.getServiceById(this.platform.Service.MotionSensor, 'native-recording-motion');
    if (nativePolicy.homeKitSecureVideo) {
      const recordingMotion = previousRecordingMotion ?? this.accessory.addService(this.platform.Service.MotionSensor,
        deviceServiceName(cameraName, 'Recording Activity'), 'native-recording-motion');
      recordingMotion.setHiddenService(true);
      this.nativeRecording = new NativeRecordingDelegate({
        preparation: this.platform.getNativeRecordingPreparation(),
        readyMotion: active => recordingMotion.getCharacteristic(this.platform.Characteristic.MotionDetected).updateValue(active),
        policyChanged: policy => this.platform.nativeRecordingPolicyChanged(cameraSourceType, device.id, policy),
        deliveryOutcome: event => this.platform.nativeRecordingDeliveryOutcome(event.outcome),
      });
      controllerOptions.recording = {
        delegate: this.nativeRecording,
        options: { prebufferLength: 4000, mediaContainerConfiguration: { type: 0, fragmentLength: 4000 },
          video: { type: 0, parameters: { profiles: [0, 1, 2], levels: [0, 1, 2] },
            resolutions: [[1920, 1080, 30], [1920, 1080, 15], [1280, 720, 30], [1280, 720, 15]] },
          audio: { codecs: [{ type: 0, audioChannels: 1, bitrateMode: 0, samplerate: [1, 2] }] } },
      };
      // The public PIR service is deliberately not the recording trigger. It
      // signals immediately; this hidden linked service signals a prepared file.
      controllerOptions.sensors = { motion: recordingMotion };
    } else if (previousRecordingMotion) this.accessory.removeService(previousRecordingMotion);
    this.cameraController = new this.platform.api.hap.CameraController(controllerOptions);
    this.accessory.configureController(this.cameraController);
    const management = this.cameraController.recordingManagement;
    if (this.nativeRecording && management) {
      const recording = this.nativeRecording;
      const bind = (service: Service, type: typeof Characteristic.RecordingAudioActive | typeof Characteristic.HomeKitCameraActive,
        apply: (active: boolean) => void): void => {
        const characteristic = service.getCharacteristic(type);
        const changed = (change: CharacteristicChange): void => apply(Boolean(change.newValue));
        characteristic.on('change', changed);
        this.recordingListeners.push(() => characteristic.removeListener('change', changed));
        apply(Boolean(characteristic.value));
      };
      bind(management.recordingManagementService, this.platform.Characteristic.RecordingAudioActive,
        active => recording.updateRecordingAudioActive(active));
      bind(management.operatingModeService, this.platform.Characteristic.HomeKitCameraActive, active => {
        this.homeKitCameraActive = active;
        this.cameraSource.setCameraActive(active);
        recording.updateCameraActive(active && this.platform.isOperational() && this.isDeviceAvailable());
      });
    }
    refreshCameraAudioCapabilities(this.platform.api.hap, this.accessory.services);

    const existingRefreshService = this.accessory.getServiceById(this.platform.Service.Switch, 'snapshot-refresh');
    if (this.platform.streamingConfig.persistSnapshotCache) {
      this.refreshSnapshotService = existingRefreshService ??
        this.accessory.addService(
          this.platform.Service.Switch,
          refreshName,
          'snapshot-refresh',
        );
      this.refreshSnapshotService
        .getCharacteristic(this.platform.Characteristic.On)
        .onGet(() => false)
        .onSet(async (value) => {
          try {
            await this.refreshSnapshot(value);
          } finally {
            // HAP commits the submitted value after onSet resolves. Reset on the
            // next event-loop turn so the momentary Off notification follows it.
            setImmediate(() => this.refreshSnapshotService
              ?.getCharacteristic(this.platform.Characteristic.On)
              .updateValue(false));
          }
        });
      setHapServiceName(
        this.refreshSnapshotService,
        this.platform.Characteristic.Name,
        refreshName,
        'Blink Refresh Snapshot',
        this.platform.Characteristic.ConfiguredName,
      );
    } else if (existingRefreshService) {
      this.accessory.removeService(existingRefreshService);
    }
  }

  protected abstract enableMotionApi(options?: RequestOptions): Promise<void>;
  protected abstract disableMotionApi(options?: RequestOptions): Promise<void>;

  getNativeRecordingDelegate(): NativeRecordingDelegate | undefined { return this.nativeRecording; }

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
    this.nativeRecording?.updateCameraActive(this.homeKitCameraActive && this.platform.isOperational() && this.isDeviceAvailable());
    if (!this.isMotionServiceActive()) this.clearMotion();
    this.motionService
      ?.getCharacteristic(this.platform.Characteristic.StatusFault)
      .updateValue(this.motionFault || this.refreshFault || !this.platform.isOperational() || !this.isDeviceAvailable() ? 1 : 0);
    this.motionService
      ?.getCharacteristic(this.platform.Characteristic.StatusActive)
      .updateValue(this.isMotionServiceActive());
  }

  triggerMotion(timeoutMs = this.platform.getDeviceMotionTimeout(this.device, this.cameraSourceType)): void {
    if (!this.motionService) return;
    if (this.motionTimeout) {
      clearTimeout(this.motionTimeout);
    }

    this.motionDetected = true;
    this.motionService
      ?.getCharacteristic(this.platform.Characteristic.MotionDetected)
      .updateValue(true);

    logHomeKitEvent(this.platform.log, this.accessory, {
      direction: 'Blink -> bridge',
      event: 'Motion detected',
      service: 'Motion Sensor',
      characteristic: 'MotionDetected',
      value: true,
      outcome: 'observed',
    });

    this.motionTimeout = setTimeout(() => this.clearMotion(), timeoutMs);
  }

  private clearMotion(): void {
    if (this.motionTimeout) { clearTimeout(this.motionTimeout); this.motionTimeout = null; }
    if (!this.motionDetected) return;
    this.motionDetected = false;
    this.motionService?.getCharacteristic(this.platform.Characteristic.MotionDetected).updateValue(false);
    logHomeKitEvent(this.platform.log, this.accessory, {
      direction: 'bridge -> HAP', event: 'Motion cleared', service: 'Motion Sensor',
      characteristic: 'MotionDetected', value: false, outcome: 'submitted',
    });
  }

  public async shutdown(): Promise<void> {
    if (this.motionTimeout) { clearTimeout(this.motionTimeout); this.motionTimeout = null; }
    for (const remove of this.recordingListeners.splice(0)) remove();
    await Promise.all([this.nativeRecording?.stop(), this.cameraSource.shutdown()]);
  }
}
