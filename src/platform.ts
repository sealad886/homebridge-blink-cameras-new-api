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

export const PLATFORM_NAME = 'BlinkCameras';
export const PLUGIN_NAME = 'homebridge-blinkcameras';

const DEFAULT_POLL_INTERVAL = 60;
const DEFAULT_MOTION_TIMEOUT = 30;
const MIN_POLL_INTERVAL = 15;

interface BlinkPlatformConfig extends PlatformConfig {
  username: string;
  password: string;
  deviceId?: string;
  deviceName?: string;
  twoFactorCode?: string;
  tier?: 'prod' | 'sqa1' | 'cemp';
  pollInterval?: number;
  motionTimeout?: number;
  enableMotionPolling?: boolean;
}

export class BlinkCamerasPlatform implements DynamicPlatformPlugin {
  public readonly accessories: PlatformAccessory[] = [];
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly apiClient: BlinkApi;

  private pollTimer: NodeJS.Timeout | null = null;
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

    // Configuration with defaults
    this.pollInterval = Math.max(
      MIN_POLL_INTERVAL,
      this.config.pollInterval ?? DEFAULT_POLL_INTERVAL,
    );
    this.motionTimeout = (this.config.motionTimeout ?? DEFAULT_MOTION_TIMEOUT) * 1000;
    this.enableMotionPolling = this.config.enableMotionPolling ?? true;

    this.apiClient = new BlinkApi({
      email: this.config.username,
      password: this.config.password,
      hardwareId: this.config.deviceId ?? this.config.deviceName ?? 'homebridge-blink',
      twoFactorCode: this.config.twoFactorCode,
      tier: this.config.tier,
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
    for (const network of homescreen.networks) {
      this.registerNetwork(network);
    }

    for (const camera of homescreen.cameras) {
      this.registerCamera(camera);
    }

    for (const doorbell of homescreen.doorbells) {
      this.registerDoorbell(doorbell);
    }

    for (const owl of homescreen.owls) {
      this.registerOwl(owl);
    }

    this.log.info(
      `Discovered: ${homescreen.networks.length} networks, ` +
      `${homescreen.cameras.length} cameras, ` +
      `${homescreen.doorbells.length} doorbells, ` +
      `${homescreen.owls.length} owls`,
    );
  }

  private registerNetwork(network: BlinkNetwork): void {
    const uuid = this.api.hap.uuid.generate(`blink-network-${network.id}`);
    const existing = this.accessories.find((acc) => acc.UUID === uuid);

    if (existing) {
      existing.context.device = network;
      const handler = new NetworkAccessory(this, existing, network);
      existing.context.handler = handler;
      this.networkAccessories.set(network.id, handler);
      this.log.info('Restored Blink network from cache:', network.name);
    } else {
      const accessory = new this.api.platformAccessory(network.name, uuid);
      accessory.context.device = network;
      const handler = new NetworkAccessory(this, accessory, network);
      accessory.context.handler = handler;
      this.networkAccessories.set(network.id, handler);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
      this.log.info('Registered new Blink network:', network.name);
    }
  }

  private registerCamera(camera: BlinkCamera): void {
    const uuid = this.api.hap.uuid.generate(`blink-camera-${camera.id}`);
    const existing = this.accessories.find((acc) => acc.UUID === uuid);

    if (existing) {
      existing.context.device = camera;
      const handler = new CameraAccessory(this, existing, camera);
      existing.context.handler = handler;
      this.cameraAccessories.set(camera.id, handler);
      this.log.info('Restored Blink camera from cache:', camera.name);
    } else {
      const accessory = new this.api.platformAccessory(camera.name, uuid);
      accessory.context.device = camera;
      const handler = new CameraAccessory(this, accessory, camera);
      accessory.context.handler = handler;
      this.cameraAccessories.set(camera.id, handler);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
      this.log.info('Registered new Blink camera:', camera.name);
    }
  }

  private registerDoorbell(doorbell: BlinkDoorbell): void {
    const uuid = this.api.hap.uuid.generate(`blink-doorbell-${doorbell.id}`);
    const existing = this.accessories.find((acc) => acc.UUID === uuid);

    if (existing) {
      existing.context.device = doorbell;
      const handler = new DoorbellAccessory(this, existing, doorbell);
      existing.context.handler = handler;
      this.doorbellAccessories.set(doorbell.id, handler);
      this.log.info('Restored Blink doorbell from cache:', doorbell.name);
    } else {
      const accessory = new this.api.platformAccessory(doorbell.name, uuid);
      accessory.context.device = doorbell;
      const handler = new DoorbellAccessory(this, accessory, doorbell);
      accessory.context.handler = handler;
      this.doorbellAccessories.set(doorbell.id, handler);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
      this.log.info('Registered new Blink doorbell:', doorbell.name);
    }
  }

  private registerOwl(owl: BlinkOwl): void {
    const uuid = this.api.hap.uuid.generate(`blink-owl-${owl.id}`);
    const existing = this.accessories.find((acc) => acc.UUID === uuid);

    if (existing) {
      existing.context.device = owl;
      const handler = new OwlAccessory(this, existing, owl);
      existing.context.handler = handler;
      this.owlAccessories.set(owl.id, handler);
      this.log.info('Restored Blink owl from cache:', owl.name);
    } else {
      const accessory = new this.api.platformAccessory(owl.name, uuid);
      accessory.context.device = owl;
      const handler = new OwlAccessory(this, accessory, owl);
      accessory.context.handler = handler;
      this.owlAccessories.set(owl.id, handler);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
      this.log.info('Registered new Blink owl:', owl.name);
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
