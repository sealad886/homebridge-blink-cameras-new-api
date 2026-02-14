/**
 * Blink Cameras Platform for Homebridge
 *
 * Exposes Blink devices as HomeKit accessories with:
 * - SecuritySystem for networks (arm/disarm)
 * - MotionSensor for cameras, doorbells, owls
 * - Doorbell service for ring notifications
 *
 * Source: API Dossier - /base-apk/docs/api_dossier.md
 */
import { setInterval, clearInterval } from 'timers';
import * as path from 'node:path';
import {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';
import { BlinkApi } from './blink-api';
import {
  BlinkHomescreen,
  BlinkMediaClip,
} from './types';
import { NetworkAccessory, CameraAccessory, DoorbellAccessory, OwlAccessory } from './accessories';
import { BlinkCameraStreamingConfig, resolveStreamingConfig } from './accessories/camera-source';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

const DEFAULT_POLL_INTERVAL = 60;
const DEFAULT_MOTION_TIMEOUT = 30;
const MIN_POLL_INTERVAL = 15;
const MIN_MOTION_TIMEOUT = 5;

interface DeviceSettings {
  motionTimeout?: number;
  enableMotion?: boolean;
}

interface DeviceNameOverride {
  deviceIdentifier: string;
  customName: string;
}

interface DeviceSettingOverride {
  deviceIdentifier: string;
  motionTimeout?: number;
  enableMotion?: boolean;
}

interface BlinkPlatformConfig extends PlatformConfig {
  username?: string;
  password?: string;
  deviceId?: string;
  deviceName?: string;
  twoFactorCode?: string;
  clientVerificationCode?: string;
  accountVerificationCode?: string;
  persistAuth?: boolean;
  trustDevice?: boolean;
  tier?: 'prod' | 'sqa1' | 'cemp' | 'prde' | 'prsg' | 'a001' | 'srf1';
  sharedTier?: 'prod' | 'sqa1' | 'cemp' | 'prde' | 'prsg' | 'a001' | 'srf1';
  pollInterval?: number;
  motionTimeout?: number;
  enableMotionPolling?: boolean;
  excludeDevices?: string[];
  /** @deprecated Use deviceNameOverrides instead */
  deviceNames?: Record<string, string>;
  /** @deprecated Use deviceSettingOverrides instead */
  deviceSettings?: Record<string, DeviceSettings>;
  deviceNameOverrides?: DeviceNameOverride[];
  deviceSettingOverrides?: DeviceSettingOverride[];
  enableStreaming?: boolean;
  ffmpegPath?: string;
  ffmpegDebug?: boolean;
  rtspTransport?: 'tcp' | 'udp';
  maxStreams?: number;
  enableAudio?: boolean;
  twoWayAudio?: boolean;
  audioCodec?: 'opus' | 'aac-eld' | 'pcma' | 'pcmu';
  audioBitrate?: number;
  videoBitrate?: number;
  debugAuth?: boolean;
  authLocked?: boolean;
  debugStreamPath?: string;
  snapshotCacheTTL?: number;
}

export class BlinkCamerasPlatform implements DynamicPlatformPlugin {
  public readonly accessories: PlatformAccessory[] = [];
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly apiClient: BlinkApi;
  public readonly streamingConfig: BlinkCameraStreamingConfig;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastMediaCheck = new Date();
  private readonly pollInterval: number;
  private readonly motionTimeout: number;
  private readonly enableMotionPolling: boolean;

  // Maps for quick accessory lookup by device ID
  private networkAccessories = new Map<number, NetworkAccessory>();
  private cameraAccessories = new Map<number, CameraAccessory>();
  private doorbellAccessories = new Map<number, DoorbellAccessory>();
  private owlAccessories = new Map<number, OwlAccessory>();

  constructor(
    public readonly log: Logger,
    public readonly config: BlinkPlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    // Validate configuration
    this.validateConfig();

    // Configuration with defaults
    this.pollInterval = Math.max(
      MIN_POLL_INTERVAL,
      this.config.pollInterval ?? DEFAULT_POLL_INTERVAL,
    );
    this.motionTimeout = (this.config.motionTimeout ?? DEFAULT_MOTION_TIMEOUT) * 1000;
    this.enableMotionPolling = this.config.enableMotionPolling ?? true;

    this.streamingConfig = resolveStreamingConfig({
      enabled: this.config.enableStreaming ?? true,
      ffmpegPath: this.config.ffmpegPath,
      ffmpegDebug: this.config.ffmpegDebug,
      rtspTransport: this.config.rtspTransport,
      maxStreams: this.config.maxStreams,
      debugStreamPath: this.config.debugStreamPath,
      snapshotCacheTTL: this.config.snapshotCacheTTL,
      audio: {
        enabled: this.config.enableAudio,
        twoWay: this.config.twoWayAudio,
        codec: this.config.audioCodec,
        bitrate: this.config.audioBitrate,
      },
      video: {
        maxBitrate: this.config.videoBitrate,
      },
    });

    if (this.config.twoWayAudio) {
      this.log.warn('Two-way talk UI is disabled until uplink framing is verified; ignoring twoWayAudio setting.');
    }

    // Log debug mode status
    if (this.config.debugAuth) {
      this.log.warn('Auth debugging enabled - verbose API logging active');
    }

    const hardwareId = this.config.deviceId ?? this.config.deviceName ?? 'homebridge-blink';
    const authStoragePath = this.buildAuthStoragePath();

    this.apiClient = new BlinkApi({
      email: this.config.username ?? '',
      password: this.config.password ?? '',
      hardwareId,
      clientName: this.config.deviceName,
      twoFactorCode: this.config.twoFactorCode,
      clientVerificationCode: this.config.clientVerificationCode,
      accountVerificationCode: this.config.accountVerificationCode,
      trustDevice: this.config.trustDevice,
      authStoragePath,
      tier: this.config.tier,
      sharedTier: this.config.sharedTier,
      debugAuth: this.config.debugAuth,
      authLocked: this.config.authLocked,
      logger: this.log,
    });

    this.api.on('didFinishLaunching', () => {
      this.log.info('Finished launching; starting Blink discovery');
      this.discoverDevices().catch((error) => {
        this.log.error('Failed to discover devices', error);
      });
    });

    this.api.on('shutdown', () => {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    });
  }

  private validateConfig(): void {
    const hasUsername = Boolean(this.config.username?.trim());
    const hasPassword = Boolean(this.config.password?.trim());

    if (hasUsername !== hasPassword) {
      this.log.error('Configuration error: username and password must be provided together');
      throw new Error('Invalid config: username/password must be provided together');
    }

    if (!hasUsername && !hasPassword) {
      this.log.info('No credentials in config; using persisted token authentication via custom UI.');
    }
    if (this.config.pollInterval !== undefined && this.config.pollInterval < MIN_POLL_INTERVAL) {
      this.log.warn(`pollInterval of ${this.config.pollInterval}s is below minimum; using ${MIN_POLL_INTERVAL}s`);
    }
    if (this.config.motionTimeout !== undefined && this.config.motionTimeout < MIN_MOTION_TIMEOUT) {
      this.log.warn(`motionTimeout of ${this.config.motionTimeout}s is very short and may cause flickering`);
    }
  }

  private buildAuthStoragePath(): string | undefined {
    if (this.config.persistAuth === false) {
      return undefined;
    }
    const persistRoot = this.api?.user?.persistPath?.();
    if (!persistRoot) {
      return undefined;
    }
    // Avoid writing inside Homebridge's HAP persist directory (node-persist cannot
    // handle subdirectories there and will crash Homebridge on startup).
    const persistBase = path.dirname(persistRoot);
    return path.join(persistBase, 'blink-auth', 'auth-state.json');
  }

  private isDeviceExcluded(device: { id: number; name: string; serial?: string }): boolean {
    const excludeList = this.config.excludeDevices ?? [];
    const excluded = excludeList.some(
      (entry) =>
        entry === device.name ||
        entry === `${device.id}` ||
        (device.serial && entry === device.serial),
    );
    if (excluded) {
      this.log.info(`Excluding device: ${device.name} (matched exclusion list)`);
    }
    return excluded;
  }

  private getDeviceDisplayName(device: { id: number; name: string; serial?: string }): string {
    // New array-based overrides (preferred)
    const overrides = this.config.deviceNameOverrides;
    if (overrides && Array.isArray(overrides)) {
      for (const override of overrides) {
        if (!override.deviceIdentifier || !override.customName) {
          continue;
        }
        if (
          override.deviceIdentifier === device.name ||
          override.deviceIdentifier === `${device.id}` ||
          (device.serial && override.deviceIdentifier === device.serial)
        ) {
          return override.customName;
        }
      }
    }

    // Legacy object-based format (backward compatibility)
    const customNames = this.config.deviceNames ?? {};
    if (device.serial && customNames[device.serial]) {
      return customNames[device.serial];
    }
    if (customNames[`${device.id}`]) {
      return customNames[`${device.id}`];
    }
    return device.name;
  }

  public getDeviceMotionTimeout(device: { id: number; serial?: string }): number {
    // New array-based overrides (preferred)
    const overrides = this.config.deviceSettingOverrides;
    if (overrides && Array.isArray(overrides)) {
      for (const override of overrides) {
        if (!override.deviceIdentifier) {
          continue;
        }
        if (
          override.deviceIdentifier === `${device.id}` ||
          (device.serial && override.deviceIdentifier === device.serial)
        ) {
          if (override.motionTimeout !== undefined) {
            return override.motionTimeout * 1000;
          }
        }
      }
    }

    // Legacy object-based format (backward compatibility)
    const settings = this.config.deviceSettings;
    if (settings) {
      const deviceKey = device.serial ?? `${device.id}`;
      const deviceSettings = settings[deviceKey] ?? settings[`${device.id}`];
      if (deviceSettings?.motionTimeout !== undefined) {
        return deviceSettings.motionTimeout * 1000;
      }
    }
    return this.motionTimeout;
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
  }

  private async discoverDevices(): Promise<void> {
    try {
      await this.apiClient.login(this.config.twoFactorCode);
      const homescreen = await this.apiClient.getHomescreen();
      this.registerDevices(homescreen);
      this.startPolling();
    } catch (error) {
      this.log.error('Device discovery failed', error);
    }
  }

  private registerDevices(homescreen: BlinkHomescreen): void {
    let excludedCount = 0;

    for (const network of homescreen.networks) {
      if (!this.isDeviceExcluded(network)) {
        this.registerDevice(network, 'blink-network-', 'network', this.networkAccessories, NetworkAccessory);
      } else {
        excludedCount++;
      }
    }

    for (const camera of homescreen.cameras) {
      if (!this.isDeviceExcluded(camera)) {
        this.registerDevice(camera, 'blink-camera-', 'camera', this.cameraAccessories, CameraAccessory);
      } else {
        excludedCount++;
      }
    }

    for (const doorbell of homescreen.doorbells) {
      if (!this.isDeviceExcluded(doorbell)) {
        this.registerDevice(doorbell, 'blink-doorbell-', 'doorbell', this.doorbellAccessories, DoorbellAccessory);
      } else {
        excludedCount++;
      }
    }

    for (const owl of homescreen.owls) {
      if (!this.isDeviceExcluded(owl)) {
        this.registerDevice(owl, 'blink-owl-', 'owl', this.owlAccessories, OwlAccessory);
      } else {
        excludedCount++;
      }
    }

    this.log.info(
      `Discovered: ${homescreen.networks.length} networks, ` +
      `${homescreen.cameras.length} cameras, ` +
      `${homescreen.doorbells.length} doorbells, ` +
      `${homescreen.owls.length} owls` +
      (excludedCount > 0 ? ` (${excludedCount} excluded)` : ''),
    );
  }

  private registerDevice<TDevice extends { id: number; name: string; serial?: string }, THandler>(
    device: TDevice,
    uuidPrefix: string,
    deviceLabel: string,
    accessoryMap: Map<number, THandler>,
    HandlerClass: new (platform: BlinkCamerasPlatform, accessory: PlatformAccessory, device: TDevice) => THandler,
  ): void {
    const uuid = this.api.hap.uuid.generate(`${uuidPrefix}${device.id}`);
    const existing = this.accessories.find((acc) => acc.UUID === uuid);
    const displayName = this.getDeviceDisplayName(device);

    if (existing) {
      existing.displayName = displayName;
      existing.context.device = device;
      const handler = new HandlerClass(this, existing, device);
      accessoryMap.set(device.id, handler);
      this.log.info(`Restored Blink ${deviceLabel} from cache:`, displayName);
    } else {
      const accessory = new this.api.platformAccessory(displayName, uuid);
      accessory.context.device = device;
      const handler = new HandlerClass(this, accessory, device);
      accessoryMap.set(device.id, handler);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
      this.log.info(`Registered new Blink ${deviceLabel}:`, displayName);
    }
  }

  /**
   * Start polling for device state changes
   * Polls homescreen for armed/disarmed state and device status
   * Optionally polls media for motion detection events
   */
  private startPolling(): void {
    this.log.info(`Starting status polling every ${this.pollInterval} seconds`);

    this.pollTimer = setInterval(async () => {
      await this.pollDeviceStates();
    }, this.pollInterval * 1000);
  }

  /**
   * Poll device states from homescreen and check for motion events
   */
  private async pollDeviceStates(): Promise<void> {
    try {
      // Refresh homescreen data
      const homescreen = await this.apiClient.getHomescreen();
      this.updateDeviceStates(homescreen);

      // Check for new motion events
      if (this.enableMotionPolling) {
        await this.checkMotionEvents();
      }
    } catch (error) {
      this.log.error('Polling failed:', error);
    }
  }

  /**
   * Update all device states from homescreen response
   */
  private updateDeviceStates(homescreen: BlinkHomescreen): void {
    for (const network of homescreen.networks) {
      const handler = this.networkAccessories.get(network.id);
      if (handler) {
        handler.updateState(network);
      }
    }

    for (const camera of homescreen.cameras) {
      const handler = this.cameraAccessories.get(camera.id);
      if (handler) {
        handler.updateState(camera);
      }
    }

    for (const doorbell of homescreen.doorbells) {
      const handler = this.doorbellAccessories.get(doorbell.id);
      if (handler) {
        handler.updateState(doorbell);
      }
    }

    for (const owl of homescreen.owls) {
      const handler = this.owlAccessories.get(owl.id);
      if (handler) {
        handler.updateState(owl);
      }
    }
  }

  /**
   * Check for new motion events via media API
   * Source: API Dossier - GET v4/accounts/{account_id}/unwatched_media + POST v4/accounts/{account_id}/media
   */
  private async checkMotionEvents(): Promise<void> {
    try {
      // First check if there are any unwatched clips (quick count endpoint)
      const unwatchedResponse = await this.apiClient.getUnwatchedMedia();

      if (unwatchedResponse.unwatched_clips === 0) {
        // No new clips, nothing to do
        return;
      }

      this.log.debug(`Found ${unwatchedResponse.unwatched_clips} unwatched clip(s), fetching details...`);

      // Fetch actual media clips to process
      const mediaResponse = await this.apiClient.getMedia({
        startTime: this.lastMediaCheck.toISOString(),
      });

      if (!mediaResponse.media || !Array.isArray(mediaResponse.media)) {
        this.log.debug('No media clips returned from API');
        return;
      }

      for (const clip of mediaResponse.media) {
        const clipDate = new Date(clip.created_at);

        // Only process clips newer than our last check
        if (clipDate > this.lastMediaCheck) {
          this.processMotionClip(clip);
        }
      }

      this.lastMediaCheck = new Date();
    } catch (error) {
      this.log.debug('Motion event check failed:', error);
    }
  }

  /**
   * Process a motion clip and trigger appropriate accessory
   */
  private processMotionClip(clip: BlinkMediaClip): void {
    // Try camera first
    const cameraHandler = this.cameraAccessories.get(clip.camera_id);
    if (cameraHandler) {
      cameraHandler.triggerMotion(this.motionTimeout);
      return;
    }

    // Try owl
    const owlHandler = this.owlAccessories.get(clip.camera_id);
    if (owlHandler) {
      owlHandler.triggerMotion(this.motionTimeout);
      return;
    }

    // Try doorbell
    const doorbellHandler = this.doorbellAccessories.get(clip.camera_id);
    if (doorbellHandler) {
      doorbellHandler.triggerMotion(this.motionTimeout);
      return;
    }

    this.log.debug(`Motion clip from unknown device: ${clip.camera_id}`);
  }
}
