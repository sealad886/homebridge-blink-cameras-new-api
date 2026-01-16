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
import { createHash } from 'node:crypto';
import path from 'node:path';
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
  BlinkCamera,
  BlinkDoorbell,
  BlinkHomescreen,
  BlinkMediaClip,
  BlinkNetwork,
  BlinkOwl,
} from './types';
import { NetworkAccessory } from './accessories/network';
import { CameraAccessory } from './accessories/camera';
import { DoorbellAccessory } from './accessories/doorbell';
import { OwlAccessory } from './accessories/owl';
import { BlinkCameraStreamingConfig, resolveStreamingConfig } from './accessories/camera-source';

export const PLATFORM_NAME = 'BlinkCameras';
export const PLUGIN_NAME = 'homebridge-blink-cameras-new-api';

const DEFAULT_POLL_INTERVAL = 60;
const DEFAULT_MOTION_TIMEOUT = 30;
const MIN_POLL_INTERVAL = 15;
const MIN_MOTION_TIMEOUT = 5;

interface DeviceSettings {
  motionTimeout?: number;
  enableMotion?: boolean;
}

interface BlinkPlatformConfig extends PlatformConfig {
  username: string;
  password: string;
  deviceId?: string;
  deviceName?: string;
  twoFactorCode?: string;
  clientVerificationCode?: string;
  persistAuth?: boolean;
  trustDevice?: boolean;
  tier?: 'prod' | 'sqa1' | 'cemp' | 'prde' | 'prsg' | 'a001' | 'srf1';
  sharedTier?: 'prod' | 'sqa1' | 'cemp' | 'prde' | 'prsg' | 'a001' | 'srf1';
  pollInterval?: number;
  motionTimeout?: number;
  enableMotionPolling?: boolean;
  excludeDevices?: string[];
  deviceNames?: Record<string, string>;
  deviceSettings?: Record<string, DeviceSettings>;
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

    // Log debug mode status
    if (this.config.debugAuth) {
      this.log.warn('Auth debugging enabled - verbose API logging active');
    }

    const hardwareId = this.config.deviceId ?? this.config.deviceName ?? 'homebridge-blink';
    const authStoragePath = this.buildAuthStoragePath();

    this.apiClient = new BlinkApi({
      email: this.config.username,
      password: this.config.password,
      hardwareId,
      clientName: this.config.deviceName,
      twoFactorCode: this.config.twoFactorCode,
      clientVerificationCode: this.config.clientVerificationCode,
      trustDevice: this.config.trustDevice,
      authStoragePath,
      tier: this.config.tier,
      sharedTier: this.config.sharedTier,
      debugAuth: this.config.debugAuth,
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
    if (!this.config.username) {
      this.log.error('Configuration error: username is required');
      throw new Error('Missing required config: username');
    }
    if (!this.config.password) {
      this.log.error('Configuration error: password is required');
      throw new Error('Missing required config: password');
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
    const deviceId = this.config.deviceId ?? this.config.deviceName ?? 'homebridge-blink';
    const keySource = `${this.config.username}|${deviceId}`;
    const key = createHash('sha1').update(keySource).digest('hex');
    return path.join(this.api.user.persistPath(), 'blink-auth', `${key}.json`);
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
        this.registerNetwork(network);
      } else {
        excludedCount++;
      }
    }

    for (const camera of homescreen.cameras) {
      if (!this.isDeviceExcluded(camera)) {
        this.registerCamera(camera);
      } else {
        excludedCount++;
      }
    }

    for (const doorbell of homescreen.doorbells) {
      if (!this.isDeviceExcluded(doorbell)) {
        this.registerDoorbell(doorbell);
      } else {
        excludedCount++;
      }
    }

    for (const owl of homescreen.owls) {
      if (!this.isDeviceExcluded(owl)) {
        this.registerOwl(owl);
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

  private registerNetwork(network: BlinkNetwork): void {
    const uuid = this.api.hap.uuid.generate(`blink-network-${network.id}`);
    const existing = this.accessories.find((acc) => acc.UUID === uuid);
    const displayName = this.getDeviceDisplayName(network);

    if (existing) {
      existing.displayName = displayName;
      existing.context.device = network;
      const handler = new NetworkAccessory(this, existing, network);
      existing.context.handler = handler;
      this.networkAccessories.set(network.id, handler);
      this.log.info('Restored Blink network from cache:', displayName);
    } else {
      const accessory = new this.api.platformAccessory(displayName, uuid);
      accessory.context.device = network;
      const handler = new NetworkAccessory(this, accessory, network);
      accessory.context.handler = handler;
      this.networkAccessories.set(network.id, handler);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
      this.log.info('Registered new Blink network:', displayName);
    }
  }

  private registerCamera(camera: BlinkCamera): void {
    const uuid = this.api.hap.uuid.generate(`blink-camera-${camera.id}`);
    const existing = this.accessories.find((acc) => acc.UUID === uuid);
    const displayName = this.getDeviceDisplayName(camera);

    if (existing) {
      existing.displayName = displayName;
      existing.context.device = camera;
      const handler = new CameraAccessory(this, existing, camera);
      existing.context.handler = handler;
      this.cameraAccessories.set(camera.id, handler);
      this.log.info('Restored Blink camera from cache:', displayName);
    } else {
      const accessory = new this.api.platformAccessory(displayName, uuid);
      accessory.context.device = camera;
      const handler = new CameraAccessory(this, accessory, camera);
      accessory.context.handler = handler;
      this.cameraAccessories.set(camera.id, handler);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
      this.log.info('Registered new Blink camera:', displayName);
    }
  }

  private registerDoorbell(doorbell: BlinkDoorbell): void {
    const uuid = this.api.hap.uuid.generate(`blink-doorbell-${doorbell.id}`);
    const existing = this.accessories.find((acc) => acc.UUID === uuid);
    const displayName = this.getDeviceDisplayName(doorbell);

    if (existing) {
      existing.displayName = displayName;
      existing.context.device = doorbell;
      const handler = new DoorbellAccessory(this, existing, doorbell);
      existing.context.handler = handler;
      this.doorbellAccessories.set(doorbell.id, handler);
      this.log.info('Restored Blink doorbell from cache:', displayName);
    } else {
      const accessory = new this.api.platformAccessory(displayName, uuid);
      accessory.context.device = doorbell;
      const handler = new DoorbellAccessory(this, accessory, doorbell);
      accessory.context.handler = handler;
      this.doorbellAccessories.set(doorbell.id, handler);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
      this.log.info('Registered new Blink doorbell:', displayName);
    }
  }

  private registerOwl(owl: BlinkOwl): void {
    const uuid = this.api.hap.uuid.generate(`blink-owl-${owl.id}`);
    const existing = this.accessories.find((acc) => acc.UUID === uuid);
    const displayName = this.getDeviceDisplayName(owl);

    if (existing) {
      existing.displayName = displayName;
      existing.context.device = owl;
      const handler = new OwlAccessory(this, existing, owl);
      existing.context.handler = handler;
      this.owlAccessories.set(owl.id, handler);
      this.log.info('Restored Blink owl from cache:', displayName);
    } else {
      const accessory = new this.api.platformAccessory(displayName, uuid);
      accessory.context.device = owl;
      const handler = new OwlAccessory(this, accessory, owl);
      accessory.context.handler = handler;
      this.owlAccessories.set(owl.id, handler);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
      this.log.info('Registered new Blink owl:', displayName);
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
   * Source: API Dossier Section 3.9 - GET v4/accounts/{account_id}/media
   */
  private async checkMotionEvents(): Promise<void> {
    try {
      const response = await this.apiClient.getUnwatchedMedia();

      for (const clip of response.media) {
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
