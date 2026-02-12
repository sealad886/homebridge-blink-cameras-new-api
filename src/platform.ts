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
import { setInterval, clearInterval, setTimeout, clearTimeout } from 'timers';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import process from 'node:process';
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
import { redactValue } from './blink-api/log-sanitizer';
import {
  BlinkCamera,
  BlinkDoorbell,
  BlinkHomescreen,
  BlinkMediaClip,
  BlinkNetwork,
  BlinkOwl,
  BlinkCameraConfigUpdate,
} from './types';
import { NetworkAccessory, CameraAccessory, DoorbellAccessory, OwlAccessory } from './accessories';
import { BlinkCameraStreamingConfig, resolveStreamingConfig } from './accessories/camera-source';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import packageJson from '../package.json';

const DEFAULT_POLL_INTERVAL = 60;
const DEFAULT_MOTION_TIMEOUT = 30;
const MIN_POLL_INTERVAL = 15;
const MIN_MOTION_TIMEOUT = 5;
const DISCOVERY_RETRY_BASE_MS = 5000;
const DISCOVERY_RETRY_MAX_MS = 300000;

interface DeviceSettings {
  motionTimeout?: number;
  enableMotion?: boolean;
  motionSensitivity?: number;
}

interface BlinkPlatformConfig extends PlatformConfig {
  username: string;
  password: string;
  deviceId?: string;
  deviceName?: string;
  twoFactorCode?: string;
  clientVerificationCode?: string;
  accountVerificationCode?: string;
  persistAuth?: boolean;
  trustDevice?: boolean;
  tier?: 'prod' | 'sqa1' | 'cemp' | 'prde' | 'prsg' | 'a001' | 'srf1';
  sharedTier?: 'prod' | 'sqa1' | 'cemp' | 'prde' | 'prsg' | 'a001' | 'srf1';
  requestTimeoutMs?: number;
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
  debugStreamPath?: string;
  /** Snapshot cache TTL in seconds. Set to 0 to always request fresh snapshots. Default: 60 */
  snapshotCacheTTL?: number;
}

export class BlinkCamerasPlatform implements DynamicPlatformPlugin {
  public readonly accessories: PlatformAccessory[] = [];
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly apiClient: BlinkApi;
  public readonly streamingConfig: BlinkCameraStreamingConfig;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollInFlight = false;
  private pollQueued = false;
  private skippedPollTicks = 0;
  private lastMediaCheck = new Date();
  private readonly pollInterval: number;
  private readonly motionTimeout: number;
  private readonly enableMotionPolling: boolean;
  private discoveryRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private discoveryRetryAttempts = 0;
  private discoveryInProgress = false;
  private shutdownRequested = false;

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

    const hardwareId = this.config.deviceId ?? this.config.deviceName ?? 'homebridge-blink';
    const authStoragePath = this.buildAuthStoragePath();

    // Log debug mode status
    if (this.config.debugAuth) {
      this.log.warn('Auth debugging enabled - verbose API logging active');
      this.logAuthDebugContext(hardwareId, authStoragePath);
    }

    this.apiClient = new BlinkApi({
      email: this.config.username,
      password: this.config.password,
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
      requestTimeoutMs: this.config.requestTimeoutMs,
      logger: this.log,
    });

    this.api.on('didFinishLaunching', () => {
      this.log.info('Finished launching; starting Blink discovery');
      void this.ensureDiscovery();
    });

    this.api.on('shutdown', () => {
      this.shutdownRequested = true;
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      if (this.discoveryRetryTimer) {
        clearTimeout(this.discoveryRetryTimer);
        this.discoveryRetryTimer = null;
      }
      this.pollInFlight = false;
      this.pollQueued = false;
      this.discoveryInProgress = false;
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
    const persistRoot = this.api?.user?.persistPath?.();
    if (!persistRoot) {
      return undefined;
    }
    const deviceId = this.config.deviceId ?? this.config.deviceName ?? 'homebridge-blink';
    const keySource = `${this.config.username?.toLowerCase()}|${deviceId}`;
    const key = createHash('sha1').update(keySource).digest('hex');

    // Avoid writing inside Homebridge's HAP persist directory (node-persist cannot
    // handle subdirectories there and will crash Homebridge on startup).
    const persistBase = path.dirname(persistRoot);
    return path.join(persistBase, 'blink-auth', `${key}.json`);
  }

  private logAuthDebugContext(hardwareId: string, authStoragePath?: string): void {
    const pluginVersion = packageJson.version ?? 'unknown';
    const homebridgeVersion = this.api.serverVersion ?? 'unknown';
    const apiVersion = this.api.version ?? 'unknown';
    const osInfo = `${os.type()} ${os.release()} (${os.platform()}/${os.arch()})`;

    this.log.info(`[Auth Debug] Plugin: ${PLUGIN_NAME}@${pluginVersion}`);
    this.log.info(`[Auth Debug] Homebridge: ${homebridgeVersion} (API ${apiVersion})`);
    this.log.info(`[Auth Debug] Node: ${process.version}`);
    this.log.info(`[Auth Debug] OS: ${osInfo}`);

    const deviceName = this.config.deviceName;
    this.log.info(
      `[Auth Debug] Device: id=${redactValue(hardwareId)} name=${deviceName ? redactValue(deviceName) : '<empty>'}`,
    );

    const tier = this.config.tier ?? 'prod';
    const sharedTier = this.config.sharedTier ?? '<auto>';
    this.log.info(`[Auth Debug] Tier: ${tier} (shared=${sharedTier})`);

    const persistAuth = this.config.persistAuth !== false;
    const trustDevice = this.config.trustDevice ?? true;
    this.log.info(`[Auth Debug] Auth options: persistAuth=${persistAuth} trustDevice=${trustDevice}`);
    this.log.info(
      `[Auth Debug] Codes present: twoFactor=${Boolean(this.config.twoFactorCode)} ` +
      `clientVerification=${Boolean(this.config.clientVerificationCode)} ` +
      `accountVerification=${Boolean(this.config.accountVerificationCode)}`,
    );
    this.log.info(`[Auth Debug] Auth storage: ${this.describeAuthStorage(authStoragePath)}`);
  }

  private describeAuthStorage(authStoragePath?: string): string {
    if (!authStoragePath) {
      return 'disabled';
    }

    const storageDir = path.dirname(authStoragePath);
    const parentDir = path.dirname(storageDir);
    const storageDirExists = fs.existsSync(storageDir);
    const parentWritable = this.checkWritable(parentDir);
    const dirWritable = storageDirExists ? this.checkWritable(storageDir) : 'missing';

    return `${authStoragePath} (dir ${storageDirExists ? 'exists' : 'missing'}, ` +
      `dir writable=${dirWritable}, parent writable=${parentWritable})`;
  }

  private checkWritable(dir: string): 'yes' | 'no' | 'missing' {
    if (!fs.existsSync(dir)) {
      return 'missing';
    }
    try {
      fs.accessSync(dir, fs.constants.W_OK);
      return 'yes';
    } catch {
      return 'no';
    }
  }

  private isDeviceExcluded(device: { id: number; name: string; serial?: string }, log = true): boolean {
    const excludeList = this.config.excludeDevices ?? [];
    const excluded = excludeList.some(
      (entry) =>
        entry === device.name ||
        entry === `${device.id}` ||
        (device.serial && entry === device.serial),
    );
    if (excluded && log) {
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
    const deviceSettings = this.getDeviceSettings(device);
    if (deviceSettings?.motionTimeout !== undefined) {
      return deviceSettings.motionTimeout * 1000;
    }
    return this.motionTimeout;
  }

  private getDeviceSettings(device: { id: number; serial?: string }): DeviceSettings | undefined {
    const settings = this.config.deviceSettings;
    if (!settings) {
      return undefined;
    }
    const deviceKey = device.serial ?? `${device.id}`;
    return settings[deviceKey] ?? settings[`${device.id}`];
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
  }

  private async ensureDiscovery(): Promise<void> {
    if (this.shutdownRequested || this.discoveryInProgress) {
      return;
    }

    this.discoveryInProgress = true;
    const discovered = await this.discoverDevices();
    this.discoveryInProgress = false;

    if (discovered) {
      this.discoveryRetryAttempts = 0;
      if (this.discoveryRetryTimer) {
        clearTimeout(this.discoveryRetryTimer);
        this.discoveryRetryTimer = null;
      }
      return;
    }

    if (this.shutdownRequested) {
      return;
    }

    this.discoveryRetryAttempts += 1;
    const retryDelayMs = this.getDiscoveryRetryDelayMs(this.discoveryRetryAttempts);
    this.log.warn(
      `Blink discovery failed; retrying in ${Math.round(retryDelayMs / 1000)}s ` +
      `(attempt ${this.discoveryRetryAttempts})`,
    );

    if (this.discoveryRetryTimer) {
      clearTimeout(this.discoveryRetryTimer);
    }

    this.discoveryRetryTimer = setTimeout(() => {
      this.discoveryRetryTimer = null;
      void this.ensureDiscovery();
    }, retryDelayMs);
  }

  private getDiscoveryRetryDelayMs(attempt: number): number {
    const exponent = Math.max(0, Math.min(attempt - 1, 6));
    return Math.min(DISCOVERY_RETRY_MAX_MS, DISCOVERY_RETRY_BASE_MS * Math.pow(2, exponent));
  }

  private async discoverDevices(): Promise<boolean> {
    try {
      await this.apiClient.login(this.config.twoFactorCode);
      const homescreen = await this.apiClient.getHomescreen();
      this.registerDevices(homescreen);
      void this.applyDeviceSettings(homescreen).catch((error) => {
        this.log.warn(`Failed to apply device settings: ${(error as Error).message}`);
      });
      this.startPolling();
      this.log.info('Blink discovery completed successfully');
      return true;
    } catch (error) {
      this.log.error('Device discovery failed', error);
      return false;
    }
  }

  private async applyDeviceSettings(homescreen: BlinkHomescreen): Promise<void> {
    if (!this.config.deviceSettings) {
      return;
    }

    const networksById = new Map(homescreen.networks.map((network) => [network.id, network]));

    for (const camera of homescreen.cameras) {
      if (this.isDeviceExcluded(camera, false)) {
        continue;
      }
      const deviceSettings = this.getDeviceSettings(camera);
      if (!deviceSettings) {
        continue;
      }
      await this.applyMotionSettings({
        device: camera,
        deviceSettings,
        deviceType: 'camera',
        networkName: networksById.get(camera.network_id)?.name,
        networkArmed: networksById.get(camera.network_id)?.armed ?? false,
        networkId: camera.network_id,
        updateConfig: (update) => this.apiClient.updateDeviceConfig('camera', camera.network_id, camera.id, update),
        setMotionEnabled: (enabled) =>
          enabled
            ? this.apiClient.enableMotion('camera', camera.network_id, camera.id)
            : this.apiClient.disableMotion('camera', camera.network_id, camera.id),
        updateHandler: () => {
          const handler = this.cameraAccessories.get(camera.id);
          if (handler) {
            handler.updateState({ ...camera, enabled: deviceSettings.enableMotion ?? camera.enabled });
          }
        },
      });
    }

    for (const doorbell of homescreen.doorbells) {
      if (this.isDeviceExcluded(doorbell, false)) {
        continue;
      }
      const deviceSettings = this.getDeviceSettings(doorbell);
      if (!deviceSettings) {
        continue;
      }
      await this.applyMotionSettings({
        device: doorbell,
        deviceSettings,
        deviceType: 'doorbell',
        networkName: networksById.get(doorbell.network_id)?.name,
        networkArmed: networksById.get(doorbell.network_id)?.armed ?? false,
        networkId: doorbell.network_id,
        updateConfig: (update) => this.apiClient.updateDeviceConfig('doorbell', doorbell.network_id, doorbell.id, update),
        setMotionEnabled: (enabled) =>
          enabled
            ? this.apiClient.enableMotion('doorbell', doorbell.network_id, doorbell.id)
            : this.apiClient.disableMotion('doorbell', doorbell.network_id, doorbell.id),
        updateHandler: () => {
          const handler = this.doorbellAccessories.get(doorbell.id);
          if (handler) {
            handler.updateState({ ...doorbell, enabled: deviceSettings.enableMotion ?? doorbell.enabled });
          }
        },
      });
    }

    for (const owl of homescreen.owls) {
      if (this.isDeviceExcluded(owl, false)) {
        continue;
      }
      const deviceSettings = this.getDeviceSettings(owl);
      if (!deviceSettings) {
        continue;
      }
      await this.applyMotionSettings({
        device: owl,
        deviceSettings,
        deviceType: 'owl',
        networkName: networksById.get(owl.network_id)?.name,
        networkArmed: networksById.get(owl.network_id)?.armed ?? false,
        networkId: owl.network_id,
        updateConfig: (update) => this.apiClient.updateDeviceConfig('owl', owl.network_id, owl.id, update),
        setMotionEnabled: (enabled) =>
          enabled
            ? this.apiClient.enableMotion('owl', owl.network_id, owl.id)
            : this.apiClient.disableMotion('owl', owl.network_id, owl.id),
        updateHandler: () => {
          const handler = this.owlAccessories.get(owl.id);
          if (handler) {
            handler.updateState({ ...owl, enabled: deviceSettings.enableMotion ?? owl.enabled });
          }
        },
      });
    }
  }

  private async applyMotionSettings(options: {
    device: { id: number; name: string; enabled: boolean };
    deviceSettings: DeviceSettings;
    deviceType: 'camera' | 'doorbell' | 'owl';
    networkName?: string;
    networkArmed: boolean;
    networkId: number;
    updateConfig: (update: BlinkCameraConfigUpdate) => Promise<unknown>;
    setMotionEnabled: (enabled: boolean) => Promise<void>;
    updateHandler: () => void;
  }): Promise<void> {
    const {
      device,
      deviceSettings,
      deviceType,
      networkName,
      networkArmed,
      networkId,
      updateConfig,
      setMotionEnabled,
      updateHandler,
    } = options;

    if (deviceSettings.enableMotion !== undefined && deviceSettings.enableMotion !== device.enabled) {
      try {
        await setMotionEnabled(deviceSettings.enableMotion);
        this.log.info(
          `Applied motion ${deviceSettings.enableMotion ? 'enable' : 'disable'} for ${deviceType} ${device.name}`,
        );
        if (!networkArmed) {
          this.log.debug(
            `Network ${networkName ?? networkId} is disarmed; ${deviceType} ${device.name} motion will activate when armed.`,
          );
        }
        updateHandler();
      } catch (error) {
        this.log.warn(
          `Failed to apply motion ${deviceSettings.enableMotion ? 'enable' : 'disable'} for ` +
          `${deviceType} ${device.name}: ${(error as Error).message}`,
        );
      }
    }

    if (deviceSettings.motionSensitivity !== undefined) {
      if (!Number.isFinite(deviceSettings.motionSensitivity) || !Number.isInteger(deviceSettings.motionSensitivity)) {
        this.log.warn(
          `Invalid motionSensitivity for ${deviceType} ${device.name}: ${deviceSettings.motionSensitivity}`,
        );
      } else {
        try {
          await updateConfig({ motion_sensitivity: deviceSettings.motionSensitivity });
          this.log.info(
            `Applied motion sensitivity ${deviceSettings.motionSensitivity} for ${deviceType} ${device.name}`,
          );
          if (!networkArmed) {
            this.log.debug(
              `Network ${networkName ?? networkId} is disarmed; ${deviceType} ${device.name} sensitivity applies when armed.`,
            );
          }
        } catch (error) {
          this.log.warn(
            `Failed to apply motion sensitivity for ${deviceType} ${device.name}: ${(error as Error).message}`,
          );
        }
      }
    }
  }

  private registerDevices(homescreen: BlinkHomescreen): void {
    let excludedCount = 0;

    for (const network of homescreen.networks) {
      if (!this.isDeviceExcluded(network, true)) {
        this.registerNetwork(network);
      } else {
        excludedCount++;
      }
    }

    for (const camera of homescreen.cameras) {
      if (!this.isDeviceExcluded(camera, true)) {
        this.registerCamera(camera);
      } else {
        excludedCount++;
      }
    }

    for (const doorbell of homescreen.doorbells) {
      if (!this.isDeviceExcluded(doorbell, true)) {
        this.registerDoorbell(doorbell);
      } else {
        excludedCount++;
      }
    }

    for (const owl of homescreen.owls) {
      if (!this.isDeviceExcluded(owl, true)) {
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

  private registerDevice<TDevice extends { id: number; name: string }, THandler>(
    device: TDevice,
    label: string,
    uuidPrefix: string,
    handlerMap: Map<number, THandler>,
    createHandler: (platform: BlinkCamerasPlatform, acc: PlatformAccessory, dev: TDevice) => THandler,
  ): void {
    const uuid = this.api.hap.uuid.generate(`${uuidPrefix}${device.id}`);
    const existing = this.accessories.find((acc) => acc.UUID === uuid);
    const displayName = this.getDeviceDisplayName(device);

    if (existing) {
      existing.displayName = displayName;
      existing.context.device = device;
      const handler = createHandler(this, existing, device);
      handlerMap.set(device.id, handler);
      this.log.info(`Restored Blink ${label} from cache:`, displayName);
    } else {
      const accessory = new this.api.platformAccessory(displayName, uuid);
      accessory.context.device = device;
      const handler = createHandler(this, accessory, device);
      handlerMap.set(device.id, handler);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
      this.log.info(`Registered new Blink ${label}:`, displayName);
    }
  }

  private registerNetwork(network: BlinkNetwork): void {
    this.registerDevice(network, 'network', 'blink-network-', this.networkAccessories,
      (p, a, d) => new NetworkAccessory(p, a, d));
  }

  private registerCamera(camera: BlinkCamera): void {
    this.registerDevice(camera, 'camera', 'blink-camera-', this.cameraAccessories,
      (p, a, d) => new CameraAccessory(p, a, d));
  }

  private registerDoorbell(doorbell: BlinkDoorbell): void {
    this.registerDevice(doorbell, 'doorbell', 'blink-doorbell-', this.doorbellAccessories,
      (p, a, d) => new DoorbellAccessory(p, a, d));
  }

  private registerOwl(owl: BlinkOwl): void {
    this.registerDevice(owl, 'owl', 'blink-owl-', this.owlAccessories,
      (p, a, d) => new OwlAccessory(p, a, d));
  }

  /**
   * Start polling for device state changes
   * Polls homescreen for armed/disarmed state and device status
   * Optionally polls media for motion detection events
   */
  private startPolling(): void {
    if (this.pollTimer) {
      this.log.debug('Polling loop already running; keeping existing timer');
      return;
    }

    this.log.info(`Starting status polling every ${this.pollInterval} seconds`);

    this.pollTimer = setInterval(() => {
      void this.runPollCycle();
    }, this.pollInterval * 1000);
  }

  private async runPollCycle(): Promise<void> {
    if (this.pollInFlight) {
      this.pollQueued = true;
      this.skippedPollTicks += 1;
      if (this.skippedPollTicks <= 3 || this.skippedPollTicks % 10 === 0) {
        this.log.debug(
          `Skipping overlapping poll tick (in-flight request still running, skipped=${this.skippedPollTicks})`,
        );
      }
      return;
    }

    this.pollInFlight = true;
    this.skippedPollTicks = 0;
    try {
      await this.pollDeviceStates();
    } finally {
      this.pollInFlight = false;
      if (this.pollQueued && !this.shutdownRequested) {
        this.pollQueued = false;
        await this.runPollCycle();
      }
    }
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
      if (this.isDoorbellRingClip(clip)) {
        doorbellHandler.triggerRing();
      }
      doorbellHandler.triggerMotion(this.motionTimeout);
      return;
    }

    this.log.debug(`Motion clip from unknown device: ${clip.camera_id}`);
  }

  private isDoorbellRingClip(clip: BlinkMediaClip): boolean {
    if (clip.doorbell_press === true || clip.is_doorbell_press === true) {
      return true;
    }

    const indicators = [
      clip.type,
      clip.event_type,
      clip.alert_type,
      clip.notification_type,
      clip.category,
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map((value) => value.toLowerCase());

    if (indicators.length === 0) {
      return false;
    }

    const eventText = indicators.join(' ');
    const mentionsDoorbell = eventText.includes('doorbell');
    const mentionsRing = eventText.includes('ring') || eventText.includes('press');
    return mentionsDoorbell && mentionsRing;
  }
}
