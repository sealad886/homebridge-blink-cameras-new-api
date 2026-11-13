import { getSecurityBoundaryCounters } from './blink-api/network-diagnostics';
import { validateHomescreen } from './blink-api/domain-validation';
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
  Blink2FARequiredError,
  BlinkAuthenticationError,
  BlinkHostedReauthenticationRequiredError,
  BlinkHostedTokenExchangeError,
} from './blink-api/auth';
import { InvalidAuthStateError } from './blink-api/auth-state';
import { AuthStateChangedError } from './blink-api/auth-storage';
import { BlinkRestVerificationRequiredError } from './blink-api/client';
import {
  BlinkHomescreen,
  BlinkCameraKind,
} from './types';
import { cameraKey, matchesDeviceIdentifier as matchesIdentifier, projectSettingsInventory,
  validateModuleFeedLimits, type ModuleFeedLimit } from './settings-inventory';
import { CameraFeedAdmission, type FeedLease } from './accessories/feed-admission';
import { NetworkAccessory, CameraAccessory, DoorbellAccessory, OwlAccessory } from './accessories';
import { AudioCodecPreference, BlinkCameraStreamingConfig, resolveStreamingConfig } from './accessories/camera-source';
import { OutputQualityProfile } from './accessories/stream-quality';
import { BlinkInputQuality } from './types';
import { setHapServiceName, toHapName } from './hap-name';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { withResponseBudget } from './operation-budget';
import { toHapError } from './hap-errors';
import { sampleBlinkConnection } from './blink-api/connection-diagnostics';
import { NativeRecordingRuntime, type NativeRuntimeDevice } from './native-recording-runtime';
import { nativeRecordingDevicePolicy, resolveNativeRecordingConfig, type NativeRecordingConfigInput,
  type NativeRecordingDeviceOverride, type NativeRecordingPolicyConfig } from './native-recording-config';
import { NativeRecordingMemoryBudget, type NativeRecordingPreparationOptions } from './accessories/native-recording-preparation';
import type { NativeRecordingPolicy, NativeRecordingDeliveryEvent } from './accessories/native-recording-delegate';
import { BLINK_FIREBASE_CLIENT, BLINK_NOTIFICATION_APP_VERSION } from './blink-api/fcm-config';
import type { NativeMotionDevice } from './blink-api/motion-events';
import { migrateEarlyNotificationConfig } from './early-notification-config';
import { redactDiagnosticText } from './blink-api/redaction';

const DEFAULT_POLL_INTERVAL = 60;
const DEFAULT_MOTION_TIMEOUT = 30;
const MIN_POLL_INTERVAL = 15;
const MIN_MOTION_TIMEOUT = 5;
const POLL_FAILURE_THRESHOLD = 3;
const CONNECTION_DIAGNOSTIC_UUID = 'blink-connection-diagnostic';
const CONNECTION_RETRY_UUID = 'blink-connection-retry';
const CONNECTION_STATUS_SUBTYPE = 'blink-connection-status';
const CONNECTION_RETRY_SUBTYPE = 'blink-connection-retry';

type ConnectionState = 'healthy' | 'degraded' | 'faulted' | 'recovering' | 'authentication-required';

interface DeviceSettings {
  motionTimeout?: number;
}

interface DeviceNameOverride {
  deviceIdentifier: string;
  customName: string;
}

interface DeviceSettingOverride extends NativeRecordingDeviceOverride {
  exposeTemperature?: boolean;
  inputQuality?: BlinkInputQuality;
  motionTimeout?: number;
}

interface BlinkPlatformConfig extends PlatformConfig, NativeRecordingPolicyConfig {
  exposeTemperature?: boolean;
  username?: string;
  password?: string;
  deviceId?: string;
  deviceName?: string;
  twoFactorCode?: string;
  clientVerificationCode?: string;
  accountVerificationCode?: string;
  persistAuth?: boolean;
  trustDevice?: boolean;
  tier?: string;
  sharedTier?: string;
  pollInterval?: number;
  motionTimeout?: number;
  nativeRecording?: NativeRecordingConfigInput;
  syncModuleFeedLimits?: ModuleFeedLimit[];
  excludeDevices?: string[];
  excludedNetworks?: string[];
  /** @deprecated Use deviceNameOverrides instead */
  deviceNames?: Record<string, string>;
  /** @deprecated Use deviceSettingOverrides instead */
  deviceSettings?: Record<string, DeviceSettings>;
  deviceNameOverrides?: DeviceNameOverride[];
  deviceSettingOverrides?: DeviceSettingOverride[];
  enableStreaming?: boolean;
  mediaDebug?: boolean;
  maxStreams?: number;
  enableAudio?: boolean;
  audioCodec?: AudioCodecPreference;
  audioBitrate?: number;
  videoBitrate?: number;
  outputQuality?: OutputQualityProfile;
  softwareEncodingPreset?: 'veryfast' | 'ultrafast';
  debugAuth?: boolean;
  authLocked?: boolean;
  debugStreamPath?: string;
  snapshotCacheTTL?: number;
  persistSnapshotCache?: boolean;
}

export class BlinkCamerasPlatform implements DynamicPlatformPlugin {
  public readonly accessories: PlatformAccessory[] = [];
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly apiClient: BlinkApi;
  public readonly streamingConfig: BlinkCameraStreamingConfig;
  private readonly feedAdmission = new CameraFeedAdmission();

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly pollInterval: number;
  private readonly motionTimeout: number;
  private nativeRuntime?: NativeRecordingRuntime;
  private nativeRuntimeKey?: string;
  private conversionQueue: Promise<void> = Promise.resolve();
  private readonly recordingMemory = new NativeRecordingMemoryBudget();
  private operational = false;
  private monitorActive = true;
  // Startup is unverified until Blink returns a usable homescreen. Keeping the
  // HomeKit surface faulted while recovering also preserves a cached outage
  // across a child-bridge restart instead of briefly publishing false health.
  private connectionState: ConnectionState = 'recovering';
  private discoveryPromise: Promise<boolean> | null = null;
  private recoveryPromise: Promise<boolean> | null = null;
  private inventoryInitialized = false;
  private connectionFailureConfirmed = false;
  private consecutivePollFailures = 0;
  private firstFailedPoll: number | null = null;
  private lastSuccessfulPoll: number | null = null;
  private outageConfirmedAt: number | null = null;
  private readonly reportedNameAdjustments = new Set<string>();

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

    this.config = migrateEarlyNotificationConfig(this.config).config as BlinkPlatformConfig;

    // Validate configuration
    this.validateConfig();

    // Configuration with defaults
    this.pollInterval = Math.max(
      MIN_POLL_INTERVAL,
      this.config.pollInterval ?? DEFAULT_POLL_INTERVAL,
    );
    this.motionTimeout = (this.config.motionTimeout ?? DEFAULT_MOTION_TIMEOUT) * 1000;

    this.streamingConfig = resolveStreamingConfig({
      enabled: this.config.enableStreaming ?? true,
      mediaDebug: this.config.mediaDebug,
      maxStreams: this.config.maxStreams,
      debugStreamPath: this.config.debugStreamPath,
      snapshotCacheTTL: this.config.snapshotCacheTTL,
      persistSnapshotCache: this.config.persistSnapshotCache,
      audio: {
        enabled: this.config.enableAudio,
        codec: this.config.audioCodec,
        bitrate: this.config.audioBitrate,
      },
      video: {
        maxBitrate: this.config.videoBitrate,
        outputQuality: this.config.outputQuality,
        softwarePreset: this.config.softwareEncodingPreset,
      },
    });

    if (this.streamingConfig.persistSnapshotCache) {
      this.log.info(
        'Persistent snapshot cache enabled; snapshots are kept until manually refreshed via each camera\'s "Refresh Snapshot" switch.',
      );
    }

    // Log debug mode status
    if (this.config.debugAuth) {
      this.log.warn('Auth debugging enabled - verbose API logging active');
    }

    const hardwareId = this.config.deviceId ?? this.config.deviceName ?? 'homebridge-blink';
    const authStoragePath = this.buildAuthStoragePath();
    const legacyAuthStoragePath = this.buildLegacyAuthStoragePath();

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
      legacyAuthStoragePath,
      tier: this.config.tier,
      sharedTier: this.config.sharedTier,
      debugAuth: this.config.debugAuth,
      authLocked: this.config.authLocked,
      logger: this.log,
    });

    this.api.on('didFinishLaunching', () => {
      this.log.info('Finished launching; starting Blink discovery');
      this.ensureConnectionAccessories();
      this.discoverDevices().catch((error) => {
        this.log.error('Failed to discover devices', error);
      });
    });

    this.api.on('shutdown', () => {
      this.monitorActive = false;
      this.updateConnectionAccessoryState();
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      void this.nativeRuntime?.stop().catch(() => this.log.error('Native recording shutdown could not complete.'));
      void this.shutdownMotionHandlers([
        ...this.cameraAccessories.values(),
        ...this.doorbellAccessories.values(),
        ...this.owlAccessories.values(),
      ]);
    });
  }

  private validateConfig(): void {
    resolveNativeRecordingConfig(this.config.nativeRecording);
    validateModuleFeedLimits(this.config.syncModuleFeedLimits);
    const nativeRetired = ['enableMotionPolling', 'hksvCameras', 'hksvSource', 'syncModuleRecording'];
    if (nativeRetired.some(key => Object.hasOwn(this.config, key))) {
      throw new Error('Retired motion/recording settings require scripts/migrate-native-recording-config.cjs: preview the explicit config path, then apply with --apply');
    }
    const retired = ['ffmpegPath', 'ffmpegDebug', 'rtpSsrcMode', 'rtspTransport', 'videoEncoder', 'twoWayAudio', 'verifyImmisTls'];
    if (retired.some(key => Object.hasOwn(this.config, key))) {
      throw new Error('Retired streaming settings require the explicit scripts/migrate-secure-media-config.cjs migration');
    }
    for (const key of ['mediaDebug', 'enableAudio', 'enableStreaming', 'persistSnapshotCache']) {
      if (this.config[key] !== undefined && typeof this.config[key] !== 'boolean') throw new Error('Invalid streaming boolean setting');
    }
    if (this.config.softwareEncodingPreset !== undefined && !['ultrafast', 'veryfast'].includes(this.config.softwareEncodingPreset)) {
      throw new Error('Invalid software encoding preset');
    }
    if (this.config.exposeTemperature !== undefined && typeof this.config.exposeTemperature !== 'boolean') {
      throw new Error('Invalid temperature setting');
    }
    if (this.config.deviceSettingOverrides !== undefined && !Array.isArray(this.config.deviceSettingOverrides)) {
      throw new Error('Invalid per-camera settings list');
    }
    for (const override of this.config.deviceSettingOverrides ?? []) {
      if (!override || typeof override.deviceIdentifier !== 'string' || !override.deviceIdentifier.trim()) {
        throw new Error('Invalid per-camera deviceIdentifier: choose a camera or remove the empty entry');
      }
      if (override.exposeTemperature !== undefined && typeof override.exposeTemperature !== 'boolean') {
        throw new Error('Invalid per-camera temperature setting');
      }
      if (override.inputQuality !== undefined && !['auto', 'saver', 'standard', 'best'].includes(override.inputQuality)) {
        throw new Error('Invalid per-camera input quality');
      }
    }
    nativeRecordingDevicePolicy(this.config, { id: -1 });
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
    const storagePath = this.api?.user?.storagePath?.();
    if (!storagePath) {
      return undefined;
    }
    // Single dot-file in the Homebridge storage root — no custom subdirectory needed.
    return path.join(storagePath, '.blink-auth.json');
  }

  /** Legacy path from pre-0.6 releases for automatic migration. */
  private buildLegacyAuthStoragePath(): string | undefined {
    const storagePath = this.api?.user?.storagePath?.();
    if (!storagePath) return undefined;
    return path.join(storagePath, 'blink-auth', 'auth-state.json');
  }

  private isDeviceExcluded(device: { id: number; name: string; serial?: string }, kind?: BlinkCameraKind): boolean {
    const excludeList = this.config.excludeDevices ?? [];
    const excluded = excludeList.some(entry => this.matchesDeviceIdentifier(device, entry, kind));
    if (excluded) {
      this.log.info(`Excluding device: ${device.name} (matched exclusion list)`);
    }
    return excluded;
  }

  private matchesDeviceIdentifier(device: { id: number; name?: string; serial?: string }, identifier: string, kind?: BlinkCameraKind): boolean {
    return matchesIdentifier(device, identifier, kind);
  }

  public acquireCameraFeed(kind: BlinkCameraKind, id: number): FeedLease { return this.feedAdmission.acquire(cameraKey(kind, id)); }

  public isNetworkArmed(networkId: number): boolean { return this.networkAccessories.get(networkId)?.isArmed() ?? false; }

  public updateMotionAvailability(): void {
    for (const handler of [...this.cameraAccessories.values(), ...this.owlAccessories.values(), ...this.doorbellAccessories.values()]) {
      handler.updateAvailability();
    }
  }

  private async shutdownMotionHandlers(handlers: Iterable<{ shutdown(): Promise<void> }>): Promise<void> {
    await Promise.all(Array.from(handlers, async handler => {
      try { await handler.shutdown(); }
      catch { this.log.error('Failed to stop camera media during shutdown'); }
    }));
  }

  private getDeviceDisplayName(device: { id: number; name: string; serial?: string }, kind?: BlinkCameraKind): string {
    // New array-based overrides (preferred)
    const overrides = this.config.deviceNameOverrides;
    if (overrides && Array.isArray(overrides)) {
      for (const override of overrides) {
        if (!override.deviceIdentifier || !override.customName) {
          continue;
        }
        if (
          this.matchesDeviceIdentifier(device, override.deviceIdentifier, kind)
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

  private getDeviceSettingOverride(device: { id: number; name?: string; serial?: string }, kind?: BlinkCameraKind): DeviceSettingOverride | undefined {
    return this.config.deviceSettingOverrides?.find(entry =>
      this.matchesDeviceIdentifier(device, entry.deviceIdentifier, kind));
  }

  public getDeviceInputQuality(device: { id: number; name?: string; serial?: string }, kind?: BlinkCameraKind): BlinkInputQuality {
    return this.getDeviceSettingOverride(device, kind)?.inputQuality ?? 'auto';
  }

  public isTemperatureEnabled(device: { id: number; name?: string; serial?: string }, kind?: BlinkCameraKind): boolean {
    return this.getDeviceSettingOverride(device, kind)?.exposeTemperature ?? this.config.exposeTemperature ?? false;
  }

  public getDeviceMotionTimeout(device: { id: number; name?: string; serial?: string }, kind?: BlinkCameraKind): number {
    // New array-based overrides (preferred)
    const overrides = this.config.deviceSettingOverrides;
    if (overrides && Array.isArray(overrides)) {
      for (const override of overrides) {
        if (!override.deviceIdentifier) {
          continue;
        }
        if (
          this.matchesDeviceIdentifier(device, override.deviceIdentifier, kind)
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

  private cameraKindForAccessory(accessory: PlatformAccessory): BlinkCameraKind | undefined {
    const id = accessory.context.device?.id;
    return (['camera', 'owl', 'doorbell'] as const).find(kind => accessory.UUID === this.api.hap.uuid.generate(`blink-${kind}-${id}`));
  }

  configureAccessory(accessory: PlatformAccessory): void {
    const cachedDevice = accessory.context.device;
    if (
      cachedDevice &&
      typeof cachedDevice === 'object' &&
      typeof cachedDevice.id === 'number' &&
      typeof cachedDevice.name === 'string'
    ) {
      const displayName = this.hapName(
        this.getDeviceDisplayName(cachedDevice as { id: number; name: string; serial?: string }, this.cameraKindForAccessory(accessory)),
        'Blink Device',
      );
      accessory.displayName = displayName;
      for (const service of accessory.services) {
        setHapServiceName(service, this.Characteristic.Name, service.displayName, displayName);
      }
    }
    // Restored samples are not fresh metadata, including before failed discovery.
    const temperature = accessory.getServiceById(this.Service.TemperatureSensor, 'temperature');
    if (temperature) {
      temperature.getCharacteristic(this.Characteristic.StatusFault).updateValue(1);
      temperature.getCharacteristic(this.Characteristic.StatusActive).updateValue(false);
      temperature.getCharacteristic(this.Characteristic.CurrentTemperature).onGet(() => {
        throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      });
    }
    this.accessories.push(accessory);
  }

  public isOperational(): boolean {
    return this.operational;
  }

  getNativeRecordingPreparation(): NativeRecordingPreparationOptions {
    return { memory: this.recordingMemory,
      admit: <T>(work: () => Promise<T>, signal: globalThis.AbortSignal) => this.admitRecordingConversion(work, signal) };
  }

  private async admitRecordingConversion<T>(work: () => Promise<T>, signal: globalThis.AbortSignal): Promise<T> {
    const previous = this.conversionQueue;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    this.conversionQueue = previous.then(() => held);
    try {
      await new Promise<void>((resolve, reject) => {
        const cancelled = () => { signal.removeEventListener('abort', cancelled); reject(new Error('Recording conversion cancelled')); };
        signal.addEventListener('abort', cancelled, { once: true });
        if (signal.aborted) cancelled();
        previous.then(() => { signal.removeEventListener('abort', cancelled); resolve(); });
      });
      signal.throwIfAborted();
      return await work();
    } finally { release(); }
  }

  nativeRecordingPolicyChanged(kind: 'camera' | 'owl' | 'doorbell', id: number, policy: NativeRecordingPolicy): Promise<void> {
    return this.nativeRuntime?.policyChanged(`${kind}:${id}`, policy) ?? Promise.resolve();
  }

  nativeRecordingDeliveryOutcome(outcome: string, cameraId?: string, event?: NativeRecordingDeliveryEvent): void {
    this.nativeRuntime?.deliveryOutcome(outcome, cameraId, event);
  }

  private async prepareNativeRuntime(homescreen: BlinkHomescreen): Promise<void> {
    const candidates = [...homescreen.cameras.map(device => ({ kind: device.type === 'owl' ? 'owl' as const : 'camera' as const,
      inventoryKind: 'camera' as const, map: this.cameraAccessories, device })),
      ...homescreen.doorbells.map(device => ({ kind: 'doorbell' as const, inventoryKind: 'doorbell' as const, map: this.doorbellAccessories, device })),
      ...homescreen.owls.map(device => ({ kind: 'owl' as const, inventoryKind: 'owl' as const, map: this.owlAccessories, device }))];
    const identity = this.apiClient.getCachedIdentity();
    if (!identity?.accountId || !identity.clientId) { this.log.warn('Push motion waits for a cached authenticated account and client.'); return; }
    const scope = { accountId: identity.accountId, clientId: identity.clientId, tier: identity.tier };
    const networks = new Set(homescreen.networks.filter(network => !this.isNetworkExcluded(network) && !this.isDeviceExcluded(network)).map(network => network.id));
    const devices: NativeRuntimeDevice[] = [];
    const matchingDevices: NativeMotionDevice[] = [];
    const associations = new Map(projectSettingsInventory(homescreen).cameras.map(device => [device.key, device.moduleAssociation]));
    for (const { device, kind, inventoryKind, map } of candidates) {
      const modules = (homescreen.sync_modules ?? []).filter(module => module.network_id === device.network_id);
      const binding = { accountId: scope.accountId, networkId: device.network_id, providerId: device.id,
        // APK61 DeviceTarget wire values exactly match these canonical kinds.
        target: kind, cameraId: `${kind}:${device.id}`, nativeName: device.name };
      const nativeStorage = modules.length === 1
        ? { moduleId: `${device.network_id}:${modules[0].id}`, syncModuleId: modules[0].id } : undefined;
      // Exclusions limit consumers, never the identities that can make a clip ambiguous.
      if (nativeStorage) matchingDevices.push({ ...binding, ...nativeStorage });
      if (!networks.has(device.network_id) || this.isDeviceExcluded(device, kind)) continue;
      const settings = nativeRecordingDevicePolicy(this.config, { ...device, kind,
        moduleAssociation: associations.get(cameraKey(inventoryKind, device.id)) });
      devices.push({ binding, rawType: 'type' in device && typeof device.type === 'string' ? device.type : undefined,
        settings, ...(nativeStorage ? { nativeStorage } : {}),
      motion: () => map.get(device.id)?.triggerMotion(), recording: () => map.get(device.id)?.getNativeRecordingDelegate() });
      if (settings.homeKitSecureVideo && modules.length !== 1) this.log.warn(`[${device.name}] Automatic native recording requires one unambiguous Sync Module.`);
    }
    // A renamed or newly discovered excluded camera can make a formerly unique
    // clip ambiguous. Motion-only consumers also need current bindings even when
    // no storage module exists. Replace through the drained ownership handoff on
    // identity changes; ordering and volatile status do not replace the runtime.
    const key = JSON.stringify([scope, matchingDevices.map(device => JSON.stringify([
      device.cameraId, device.nativeName, device.networkId, device.syncModuleId,
    ])).sort(), devices.map(({ binding, rawType, settings }) => JSON.stringify([
      binding.cameraId, binding.nativeName, binding.networkId, rawType, settings.exposeMotionDetected, settings.homeKitSecureVideo, settings.earlyNotificationMode,
    ])).sort()]);
    if (this.nativeRuntimeKey === key) return;
    if (this.nativeRuntime) {
      const previous = this.nativeRuntime;
      try { await previous.stop(); }
      finally {
        if (previous.localWriterReleased) {
          this.nativeRuntime = undefined;
          this.nativeRuntimeKey = undefined;
        }
      }
    }
    this.nativeRuntime = undefined;
    this.nativeRuntimeKey = undefined;
    const storagePath = this.api.user.storagePath();
    this.nativeRuntime = await NativeRecordingRuntime.create({ client: this.apiClient, scope, devices, matchingDevices, storagePath,
      config: resolveNativeRecordingConfig(this.config.nativeRecording), firebase: BLINK_FIREBASE_CLIENT, appVersion: BLINK_NOTIFICATION_APP_VERSION,
      report: (event, context) => {
        const camera = context?.camera && redactDiagnosticText(context.camera).replace(/[\p{C}\u2028\u2029]/gu, ' ')
          .replace(/\b(?=[a-z0-9-]{12,}\b)(?=[a-z0-9-]*\d)[a-z0-9-]+\b/gi, '<redacted>').slice(0, 80);
        const flow = context?.flow && /^flow-[a-f0-9]{10}$/.test(context.flow) ? context.flow : undefined;
        const details = [camera && `camera=${JSON.stringify(camera)}`, flow,
          Number.isSafeInteger(context?.attempt) && `attempt=${context!.attempt}`].filter(Boolean).join(' ');
        const message = `[NativeRecording] ${event}${details ? ` ${details}` : ''}`;
        if (event.includes('faulted') || event.endsWith('recovery-required') || /^(?:public-motion-failed|delivery-uncertain-motion-publication-failed|delivery-not-offered-preparation-failed|cache-capacity-exceeded|job-(?:exhausted|abandoned))$/.test(event)) this.log.warn(message);
        else if (/^(?:push-(?:ready|client-bound|received|message-accepted|message-ignored|retrying)|motion-|acquisition-|job-|catalog-|clip-|download|preparation-|prepared$|offered$|delivery-|home-)/.test(event)) this.log.info(message);
        else this.log.debug(message);
      } });
    this.nativeRuntimeKey = key;
  }

  public hapName(value: string | undefined, fallback: string): string {
    const normalized = toHapName(value, fallback);
    const adjustment = `${value ?? ''}\0${normalized}`;
    if (value && normalized !== value && !this.reportedNameAdjustments.has(adjustment)) {
      this.reportedNameAdjustments.add(adjustment);
      this.log.warn(`Adjusted HomeKit name for HAP compatibility: "${value}" -> "${normalized}"`);
    }
    return normalized;
  }

  private async discoverDevices(): Promise<boolean> {
    if (this.discoveryPromise) {
      return this.discoveryPromise;
    }

    this.discoveryPromise = this.performDiscovery();
    try {
      return await this.discoveryPromise;
    } finally {
      this.discoveryPromise = null;
    }
  }

  private async performDiscovery(): Promise<boolean> {
    try {
      await this.apiClient.login(this.config.twoFactorCode);
      const homescreen = await this.apiClient.getHomescreen();
      if (!this.monitorActive) return false;
      await this.prepareNativeRuntime(homescreen);
      if (!this.monitorActive) return false;
      const registration = this.registerDevices(homescreen);
      if (registration) await registration;
      if (!this.monitorActive) return false;
      this.inventoryInitialized = true;
      this.startPolling();
      this.setConnectionHealthy();
      if (this.nativeRuntime) await this.nativeRuntime.start();
      return this.monitorActive;
    } catch (error) {
      if (!this.monitorActive) return false;
      this.log.error(
        `Device discovery failed (${this.describeConnectionFailure(error)}). ` +
        'Check the preceding bounded authentication/API diagnostics.',
      );
      this.setConnectionFailure(error);
      this.startPolling();
      return false;
    }
  }

  private ensureConnectionAccessories(): void {
    const statusAccessory = this.ensureConnectionAccessory(
      CONNECTION_DIAGNOSTIC_UUID,
      'Blink Connection',
      'blinkConnectionDiagnostic',
    );

    statusAccessory.getService(this.Service.AccessoryInformation)
      ?.setCharacteristic(this.Characteristic.Manufacturer, 'Blink')
      .setCharacteristic(this.Characteristic.Model, 'Connection Diagnostic')
      .setCharacteristic(this.Characteristic.SerialNumber, CONNECTION_DIAGNOSTIC_UUID);

    const statusService =
      statusAccessory.getServiceById(this.Service.ContactSensor, CONNECTION_STATUS_SUBTYPE) ||
      statusAccessory.addService(
        this.Service.ContactSensor,
        toHapName('Blink Connection', 'Blink Connection'),
        CONNECTION_STATUS_SUBTYPE,
      );
    setHapServiceName(
      statusService,
      this.Characteristic.Name,
      'Blink Connection',
      'Blink Connection',
    );

    const legacyRetryService = statusAccessory.getServiceById(this.Service.Switch, CONNECTION_RETRY_SUBTYPE);
    if (legacyRetryService) {
      statusAccessory.removeService(legacyRetryService);
    }

    const retryAccessory = this.ensureConnectionAccessory(
      CONNECTION_RETRY_UUID,
      'Retry Blink Connection',
      'blinkConnectionRetry',
    );
    retryAccessory.getService(this.Service.AccessoryInformation)
      ?.setCharacteristic(this.Characteristic.Manufacturer, 'Blink')
      .setCharacteristic(this.Characteristic.Model, 'Connection Recovery')
      .setCharacteristic(this.Characteristic.SerialNumber, CONNECTION_RETRY_UUID);

    const retryService =
      retryAccessory.getServiceById(this.Service.Switch, CONNECTION_RETRY_SUBTYPE) ||
      retryAccessory.addService(
        this.Service.Switch,
        toHapName('Retry Blink Connection', 'Blink Retry'),
        CONNECTION_RETRY_SUBTYPE,
      );
    setHapServiceName(
      retryService,
      this.Characteristic.Name,
      'Retry Blink Connection',
      'Blink Retry',
    );
    retryService
      .getCharacteristic(this.Characteristic.On)
      .onGet(() => false)
      .onSet(async value => {
        if (value !== true) {
          return;
        }
        this.log.info('HomeKit requested Blink connection retry.');
        const previousRuntime = this.nativeRuntime;
        try {
          await withResponseBudget(this.recoverConnection(
            !this.inventoryInitialized || this.connectionState === 'authentication-required',
          ).then(async recovered => {
            // This continuation retains operator intent even when recovery joins
            // a status poll or discovery. A replacement already starts fresh.
            if (recovered && this.monitorActive && this.nativeRuntime === previousRuntime) await this.nativeRuntime?.retryConnection();
          }));
        } catch (error) {
          throw toHapError(this.api.hap, error);
        } finally {
          retryService
            .getCharacteristic(this.Characteristic.On)
            .updateValue(false);
        }
      });

    this.updateConnectionAccessoryState(statusService);
  }

  private ensureConnectionAccessory(uuidSeed: string, displayName: string, contextKey: string): PlatformAccessory {
    const uuid = this.api.hap.uuid.generate(uuidSeed);
    let accessory = this.accessories.find(candidate => candidate.UUID === uuid);
    const hapDisplayName = this.hapName(displayName, 'Blink Connection');
    if (!accessory) {
      accessory = new this.api.platformAccessory(hapDisplayName, uuid);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      accessory.displayName = hapDisplayName;
    }
    accessory.context[contextKey] = true;
    accessory.getService(this.Service.AccessoryInformation)
      ?.setCharacteristic(this.Characteristic.Name, hapDisplayName);
    return accessory;
  }

  private updateConnectionAccessoryState(statusService?: Service): void {
    const service = statusService ?? this.accessories
      .find(candidate => candidate.UUID === this.api.hap.uuid.generate(CONNECTION_DIAGNOSTIC_UUID))
      ?.getServiceById(this.Service.ContactSensor, CONNECTION_STATUS_SUBTYPE);
    if (!service) {
      return;
    }
    const healthy = this.connectionState === 'healthy' || this.connectionState === 'degraded';
    const contactState = healthy
      ? this.Characteristic.ContactSensorState.CONTACT_DETECTED
      : this.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
    const contact = service.getCharacteristic(this.Characteristic.ContactSensorState);
    if (contact.value !== contactState) {
      contact.updateValue(contactState);
    }
    service.getCharacteristic(this.Characteristic.StatusActive).updateValue(this.monitorActive);
    service.getCharacteristic(this.Characteristic.StatusFault).updateValue(
      healthy ? this.Characteristic.StatusFault.NO_FAULT : this.Characteristic.StatusFault.GENERAL_FAULT,
    );
  }

  private setConnectionFailure(error?: unknown): void {
    const shouldReportFailure = !this.connectionFailureConfirmed;
    this.connectionState = this.requiresAuthenticationAction(error) ? 'authentication-required' : 'faulted';
    this.operational = false;
    this.connectionFailureConfirmed = true;
    if (shouldReportFailure) {
      this.outageConfirmedAt = Date.now();
      this.log.warn(`Blink outage confirmed after ${this.consecutivePollFailures} failed cycles; ` +
        `last successful poll ${this.lastSuccessfulPoll === null ? 'not yet verified' : new Date(this.lastSuccessfulPoll).toISOString()}.`);
      void this.sampleConnectionDiagnostic();
    }
    this.updateCachedAccessoryFaults(true);
    this.ensureConnectionAccessories();

    if (shouldReportFailure) {
      if (error instanceof AuthStateChangedError) {
        this.log.error(
          'Blink authentication changed while Homebridge was running. Restart the Blink child bridge to use the current sign-in.',
        );
      } else {
        this.log.error(
          'Blink is unavailable in HomeKit. Check the Homebridge host network and Blink sign-in, then turn on "Retry Blink Connection".',
        );
      }
    }
  }

  private async sampleConnectionDiagnostic(): Promise<void> {
    this.log.warn(`Blink security boundary counters: ${JSON.stringify(getSecurityBoundaryCounters())}`);
    try {
      const sample = await sampleBlinkConnection(this.apiClient.getSharedRestRootUrl());
      this.log.warn(`Blink outage diagnostic: DNS ${sample.dns}, address count ${sample.addressCount ?? 0}, ` +
        `connection ${sample.connection}, elapsed ${sample.elapsedMs}ms.`);
    } catch {
      this.log.warn('Blink outage diagnostic unavailable.');
    }
  }

  private setConnectionHealthy(): void {
    const wasFaulted = this.connectionFailureConfirmed;
    this.connectionState = 'healthy';
    this.operational = true;
    this.connectionFailureConfirmed = false;
    if (wasFaulted) {
      this.log.info(`Blink outage recovered after ${Date.now() - (this.firstFailedPoll ?? this.outageConfirmedAt ?? Date.now())}ms; ` +
        `${this.consecutivePollFailures} failed polling cycles.`);
    }
    this.lastSuccessfulPoll = Date.now();
    this.firstFailedPoll = null;
    this.outageConfirmedAt = null;
    this.consecutivePollFailures = 0;
    this.updateCachedAccessoryFaults(false);
    for (const handler of [
      ...this.networkAccessories.values(),
      ...this.cameraAccessories.values(),
      ...this.doorbellAccessories.values(),
      ...this.owlAccessories.values(),
    ]) {
      handler.updateAvailability();
    }
    this.ensureConnectionAccessories();
    if (wasFaulted) {
      this.log.info('Blink connection restored; cleared the HomeKit connection fault.');
    }
  }

  private requiresAuthenticationAction(error: unknown): boolean {
    if (
      error instanceof AuthStateChangedError ||
      error instanceof InvalidAuthStateError ||
      error instanceof Blink2FARequiredError ||
      error instanceof BlinkHostedReauthenticationRequiredError ||
      error instanceof BlinkHostedTokenExchangeError ||
      error instanceof BlinkRestVerificationRequiredError
    ) {
      return true;
    }
    if (error instanceof BlinkAuthenticationError) {
      return error.details.requires2FA ||
        error.details.requiresUpdate ||
        [400, 401, 403].includes(error.details.status);
    }
    return false;
  }

  private describeConnectionFailure(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'unexpected failure';
    }
    if (error instanceof AuthStateChangedError) {
      return 'stored Blink authentication changed; restart the child bridge';
    }
    const description = `${error.name} ${error.message}`;
    if (/auth|sign.?in|token|verification|credential/i.test(description)) {
      return 'Blink sign-in required';
    }
    if (/network|fetch|socket|timeout|timed out|econn|enotfound|unreachable/i.test(description)) {
      return 'network unavailable';
    }
    if (/BlinkHttpError|\bHTTP\b|\b4\d\d\b|\b5\d\d\b/i.test(description)) {
      return 'Blink API request failed';
    }
    return 'unexpected failure';
  }

  private async recoverConnection(authenticate: boolean): Promise<boolean> {
    if (this.recoveryPromise) {
      return this.recoveryPromise;
    }
    this.recoveryPromise = this.performSerializedConnectionRecovery(authenticate);
    try {
      return await this.recoveryPromise;
    } finally {
      this.recoveryPromise = null;
    }
  }

  private async performSerializedConnectionRecovery(authenticate: boolean): Promise<boolean> {
    // Initial discovery owns first inventory construction. A retry requested
    // while it is in flight must join it so two callers cannot register the
    // same HAP controllers. If discovery fails, this caller may then make the
    // requested recovery attempt through the normal single-flight path.
    if (this.discoveryPromise) {
      const discovered = await this.discoveryPromise;
      if (discovered) {
        return true;
      }
    }
    return this.performConnectionRecovery(authenticate);
  }

  private async performConnectionRecovery(authenticate: boolean): Promise<boolean> {
    const startedFaulted = !this.operational;
    if (startedFaulted) {
      this.connectionState = 'recovering';
      this.updateConnectionAccessoryState();
    }
    try {
      if (authenticate) {
        await this.apiClient.login(this.config.twoFactorCode);
      }
      const homescreen = await this.apiClient.getHomescreen({ deadline: Date.now() + 25000, retryTransient: true });
      if (!this.monitorActive) return false;
      await this.prepareNativeRuntime(homescreen);
      if (this.inventoryInitialized) {
        this.updateDeviceStates(homescreen);
      } else {
        // A startup failure occurs before handlers exist. Complete initial
        // discovery exactly once; ordinary runtime recovery remains state-only.
        const registration = this.registerDevices(homescreen);
        if (registration) await registration;
        if (!this.monitorActive) return false;
        this.inventoryInitialized = true;
      }
      this.setConnectionHealthy();
      if (this.nativeRuntime) await this.nativeRuntime.start();
      return this.monitorActive;
    } catch (error) {
      if (!this.monitorActive) return false;
      if (startedFaulted || authenticate) {
        this.log.error(`Blink connection recovery failed (${this.describeConnectionFailure(error)}).`);
        this.setConnectionFailure(error);
      }
      throw error;
    }
  }

  private updateCachedAccessoryFaults(failed: boolean): void {
    const fault = failed
      ? this.Characteristic.StatusFault.GENERAL_FAULT
      : this.Characteristic.StatusFault.NO_FAULT;
    const serviceTypes = [
      this.Service.SecuritySystem,
      this.Service.MotionSensor,
      this.Service.Doorbell,
      this.Service.TemperatureSensor,
    ];

    for (const accessory of this.accessories) {
      if (accessory.context.blinkConnectionDiagnostic || accessory.context.blinkConnectionRetry) {
        continue;
      }
      for (const serviceType of serviceTypes) {
        const service = accessory.getService(serviceType);
        if (!service) {
          continue;
        }
        service
          .getCharacteristic(this.Characteristic.StatusFault)
          .updateValue(fault);
        if (failed && serviceType !== this.Service.SecuritySystem) {
          service
            .getCharacteristic(this.Characteristic.StatusActive)
            .updateValue(false);
        }
      }
    }
  }

  private isNetworkExcluded(network: { id: number; name: string }): boolean {
    return (this.config.excludedNetworks ?? []).some(entry => entry === String(network.id) || entry === network.name);
  }

  // Normal construction stays synchronous so deferred accessory reads run after
  // connection health is published. Only retiring excluded media needs a wait.
  private registerDevices(homescreen: BlinkHomescreen): void | Promise<void> {
    validateHomescreen(homescreen);
    let excludedCount = 0;
    this.feedAdmission.configure(projectSettingsInventory(homescreen, this.config), this.config);
    const currentDevices = new Map<string, { id: number; name: string; serial?: string; network_id?: number; kind?: BlinkCameraKind }>([
      ...homescreen.networks.map(device => [this.api.hap.uuid.generate(`blink-network-${device.id}`), device] as const),
      ...homescreen.cameras.map(device => [this.api.hap.uuid.generate(`blink-camera-${device.id}`), { ...device, kind: 'camera' as const }] as const),
      ...homescreen.doorbells.map(device => [this.api.hap.uuid.generate(`blink-doorbell-${device.id}`), { ...device, kind: 'doorbell' as const }] as const),
      ...homescreen.owls.map(device => [this.api.hap.uuid.generate(`blink-owl-${device.id}`), { ...device, kind: 'owl' as const }] as const),
    ]);
    const excludedNetworkIds = new Set(homescreen.networks
      .filter(network => this.isNetworkExcluded(network))
      .map(network => network.id));
    const deviceForAccessory = (accessory: PlatformAccessory) => currentDevices.get(accessory.UUID)
      ?? (accessory.context.device ? { ...accessory.context.device, kind: this.cameraKindForAccessory(accessory) } : undefined);
    for (const accessory of this.accessories) {
      const device = deviceForAccessory(accessory);
      if (device && accessory.UUID === this.api.hap.uuid.generate(`blink-network-${device.id}`)
        && this.isNetworkExcluded(device)) excludedNetworkIds.add(device.id);
    }
    const excluded = (device: { id: number; name: string; serial?: string; network_id?: number; kind?: BlinkCameraKind }, kind = device.kind) =>
      this.isDeviceExcluded(device, kind) || (device.network_id !== undefined && (
        excludedNetworkIds.has(device.network_id) || (this.config.excludedNetworks ?? []).includes(String(device.network_id))
      ));

    // Only explicit exclusions remove cached accessories. A temporarily absent
    // device must retain its HomeKit identity and automations.
    const removed = this.accessories.filter(accessory => {
      const device = deviceForAccessory(accessory);
      if (!device) return false;
      return excluded(device) || (accessory.UUID === this.api.hap.uuid.generate(`blink-network-${device.id}`)
        && this.isNetworkExcluded(device));
    });
    const registerCurrentDevices = (): void => {
      if (!this.monitorActive) return;

      for (const network of homescreen.networks) {
        if (!this.isDeviceExcluded(network) && !excludedNetworkIds.has(network.id)) {
          this.registerDevice(network, 'blink-network-', 'network', this.networkAccessories, NetworkAccessory);
        } else {
          excludedCount++;
        }
      }

      for (const camera of homescreen.cameras) {
        if (!excluded(camera, 'camera')) {
          this.registerDevice(camera, 'blink-camera-', 'camera', this.cameraAccessories, CameraAccessory);
        } else {
          excludedCount++;
        }
      }

      for (const doorbell of homescreen.doorbells) {
        if (!excluded(doorbell, 'doorbell')) {
          this.registerDevice(doorbell, 'blink-doorbell-', 'doorbell', this.doorbellAccessories, DoorbellAccessory);
        } else {
          excludedCount++;
        }
      }

      for (const owl of homescreen.owls) {
        if (!excluded(owl, 'owl')) {
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
    };

    if (!removed.length) { registerCurrentDevices(); return; }
    return (async () => {
      const retiring = removed.flatMap(accessory => {
        const id = (currentDevices.get(accessory.UUID) ?? accessory.context.device).id;
        const handlers = [
          ['blink-camera-', this.cameraAccessories],
          ['blink-doorbell-', this.doorbellAccessories],
          ['blink-owl-', this.owlAccessories],
        ] as const;
        return handlers.flatMap(([prefix, map]) => {
          const handler = accessory.UUID === this.api.hap.uuid.generate(`${prefix}${id}`) ? map.get(id) : undefined;
          return handler ? [handler] : [];
        });
      });
      await this.shutdownMotionHandlers(retiring);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, removed);
      for (const accessory of removed) {
        this.accessories.splice(this.accessories.indexOf(accessory), 1);
        const id = (currentDevices.get(accessory.UUID) ?? accessory.context.device).id;
        if (accessory.UUID === this.api.hap.uuid.generate(`blink-network-${id}`)) this.networkAccessories.delete(id);
        if (accessory.UUID === this.api.hap.uuid.generate(`blink-camera-${id}`)) this.cameraAccessories.delete(id);
        if (accessory.UUID === this.api.hap.uuid.generate(`blink-doorbell-${id}`)) this.doorbellAccessories.delete(id);
        if (accessory.UUID === this.api.hap.uuid.generate(`blink-owl-${id}`)) this.owlAccessories.delete(id);
      }
      this.log.info(`Removed ${removed.length} explicitly excluded accessories.`);
      registerCurrentDevices();
    })();
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
    const kind = deviceLabel === 'camera' || deviceLabel === 'owl' || deviceLabel === 'doorbell' ? deviceLabel : undefined;
    const displayName = this.hapName(this.getDeviceDisplayName(device, kind), `Blink ${deviceLabel}`);

    if (existing) {
      existing.displayName = displayName;
      existing.getService(this.Service.AccessoryInformation)
        ?.setCharacteristic(this.Characteristic.Name, displayName);
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
   */
  private startPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    this.log.info(`Starting status polling every ${this.pollInterval} seconds`);

    this.pollTimer = setInterval(async () => {
      await this.pollDeviceStates();
    }, this.pollInterval * 1000);
  }

  /**
   * Poll device states from homescreen; native motion arrives independently
   */
  private async pollDeviceStates(): Promise<void> {
    if (!this.monitorActive || this.connectionState === 'authentication-required') {
      return;
    }
    try {
      await this.recoverConnection(!this.inventoryInitialized);
      if (!this.monitorActive) return;

    } catch (error) {
      if (this.firstFailedPoll === null) {
        this.firstFailedPoll = Date.now();
        this.log.warn('Blink polling degraded; recording outage start.');
      }
      this.consecutivePollFailures++;
      this.log.error(`Polling failed (${this.describeConnectionFailure(error)}).`);
      if (this.consecutivePollFailures === POLL_FAILURE_THRESHOLD) {
        this.setConnectionFailure(error);
      } else if (this.operational) {
        this.connectionState = 'degraded';
        this.updateConnectionAccessoryState();
      }
    }
  }

  /**
   * Update all device states from homescreen response
   */
  private updateDeviceStates(homescreen: BlinkHomescreen): void {
    this.feedAdmission.configure(projectSettingsInventory(homescreen, this.config), this.config);
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

}
