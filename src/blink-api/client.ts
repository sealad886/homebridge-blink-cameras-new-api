/**
 * Blink API Client
 *
 * High-level client for interacting with Blink Home Monitor REST API.
 * All methods reference the API dossier for endpoint documentation.
 *
 * Source: API Dossier - /base-apk/docs/api_dossier.md
 */

import { BlinkAuth } from './auth';
import { BlinkHttp } from './http';
import { getRestBaseUrl, getSharedRestBaseUrl, getSharedRestRootUrl } from './urls';
import {
  BlinkAccountInfo,
  BlinkApiDeviceType,
  BlinkCommandResponse,
  BlinkCommandStatus,
  BlinkConfig,
  BlinkCameraConfigUpdate,
  BlinkGeneratePinResponse,
  BlinkHomescreen,
  BlinkMediaResponse,
  BlinkMediaQuery,
  BlinkLiveVideoResponse,
  BlinkPinVerificationResponse,
  BlinkResendPinResponse,
  BlinkTierInfo,
  BlinkUnwatchedMediaResponse,
  BlinkVerifyPinResponse,
} from '../types';

const KNOWN_TIERS = ['prod', 'sqa1', 'cemp', 'prde', 'prsg', 'a001', 'srf1', 'e006', 'e001', 'e002', 'e003', 'e004', 'e005'] as const;
type KnownTier = (typeof KNOWN_TIERS)[number];

const normalizeTier = (tier?: string | null): string | null => {
  if (!tier) {
    return null;
  }
  return tier.toLowerCase();
};

interface DeviceEndpointEntry {
  http: () => BlinkHttp;
  prefix: string;
}

interface DeviceEndpointConfig {
  pathSegment: string;
  motion: DeviceEndpointEntry;
  config: DeviceEndpointEntry;
  thumbnail: DeviceEndpointEntry;
  liveview: DeviceEndpointEntry;
}

export class BlinkApi {
  private readonly auth: BlinkAuth;
  private readonly http: BlinkHttp;
  private readonly sharedHttp: BlinkHttp;
  private readonly sharedRootHttp: BlinkHttp;
  private readonly deviceEndpoints: Record<BlinkApiDeviceType, DeviceEndpointConfig>;
  private accountId: number | null = null;
  private clientId: number | null = null;

  constructor(private readonly config: BlinkConfig) {
    this.auth = new BlinkAuth(config);
    this.http = new BlinkHttp(this.auth, config);
    this.sharedHttp = new BlinkHttp(this.auth, config, getSharedRestBaseUrl(config));
    this.sharedRootHttp = new BlinkHttp(this.auth, config, getSharedRestRootUrl(config));

    this.deviceEndpoints = {
      camera: {
        pathSegment: 'cameras',
        motion: { http: () => this.sharedRootHttp, prefix: '' },
        config: { http: () => this.sharedHttp, prefix: 'v2/' },
        thumbnail: { http: () => this.sharedRootHttp, prefix: '' },
        liveview: { http: () => this.sharedHttp, prefix: 'v6/' },
      },
      doorbell: {
        pathSegment: 'doorbells',
        motion: { http: () => this.sharedHttp, prefix: 'v1/' },
        config: { http: () => this.sharedHttp, prefix: 'v1/' },
        thumbnail: { http: () => this.sharedHttp, prefix: 'v1/' },
        liveview: { http: () => this.sharedHttp, prefix: 'v2/' },
      },
      owl: {
        pathSegment: 'owls',
        motion: { http: () => this.sharedHttp, prefix: 'v1/' },
        config: { http: () => this.sharedHttp, prefix: 'v1/' },
        thumbnail: { http: () => this.sharedHttp, prefix: 'v1/' },
        liveview: { http: () => this.sharedHttp, prefix: 'v2/' },
      },
    };
  }

  getSharedRestRootUrl(): string {
    return getSharedRestRootUrl(this.config);
  }

  /**
   * Get authentication headers for external requests (e.g., thumbnail image fetches).
   * Includes Bearer token and TOKEN-AUTH header if available.
   */
  getAuthHeaders(): Record<string, string> {
    return this.auth.getAuthHeaders();
  }

  /**
   * Authenticate with Blink API using OAuth 2.0 Authorization Code Flow with PKCE
   *
   * @param twoFaCode - Optional 2FA code (if provided, will be used to complete pending 2FA)
   * @throws Blink2FARequiredError if 2FA is required but no code provided
   */
  async login(twoFaCode?: string): Promise<void> {
    // Sync persisted tier to config BEFORE any HTTP requests
    // This ensures we use the correct base URL from the start
    await this.syncPersistedTierToConfig();

    // If 2FA code provided and 2FA is pending, complete it
    if ((twoFaCode ?? this.config.twoFactorCode) && this.auth.is2FAPending()) {
      await this.auth.complete2FA(twoFaCode ?? this.config.twoFactorCode!);
    } else {
      await this.auth.ensureValidToken();
    }
    this.accountId = this.auth.getAccountId();
    this.clientId = this.auth.getClientId();
    await this.syncAccountInfoAndVerify();
  }

  /**
   * Sync persisted tier from auth storage to config and update base URLs.
   * Called before any HTTP requests to ensure correct region routing.
   */
  private async syncPersistedTierToConfig(): Promise<void> {
    const persistedTier = await this.auth.getPersistedTier();
    if (persistedTier && persistedTier !== this.config.tier) {
      const previousTier = this.config.tier ?? 'prod';
      this.config.tier = persistedTier;
      if (!this.config.sharedTier || this.config.sharedTier === previousTier) {
        this.config.sharedTier = persistedTier;
      }
      this.updateBaseUrls();
      this.config.logger?.info(`Restored persisted tier: ${persistedTier} (was ${previousTier})`);
    }
  }

  /**
   * Complete 2FA verification (call after login() throws Blink2FARequiredError)
   *
   * @param pin - The 2FA PIN received via email/SMS
   */
  async complete2FA(pin: string): Promise<void> {
    await this.auth.complete2FA(pin);
    this.accountId = this.auth.getAccountId();
    this.clientId = this.auth.getClientId();
    await this.syncAccountInfoAndVerify();
  }

  /**
   * Fetch account info and handle any first-time verification requirements.
   */
  private async syncAccountInfoAndVerify(): Promise<void> {
    let accountInfo: BlinkAccountInfo | null = null;
    try {
      accountInfo = await this.getAccountInfo();
    } catch (error) {
      this.config.logger?.warn(
        `Failed to fetch Blink account info: ${(error as Error).message}. Continuing with fallback tier info.`,
      );
    }

    if (accountInfo) {
      this.accountId = accountInfo.account_id ?? this.accountId;
      this.clientId = accountInfo.client_id ?? this.clientId;
      this.auth.setAccountId(this.accountId);
      this.auth.setClientId(this.clientId);
    }

    const tierInfo = await this.syncTierInfo();
    if (tierInfo?.account_id && !this.accountId) {
      this.accountId = tierInfo.account_id;
      this.auth.setAccountId(this.accountId);
    }

    if (accountInfo?.client_verification_required) {
      await this.handleClientVerification(accountInfo);
    }

    if (accountInfo?.phone_verification_required || accountInfo?.account_verification_required) {
      await this.handleAccountVerification(accountInfo);
    }
  }

  private async handleClientVerification(accountInfo: BlinkAccountInfo): Promise<void> {
    const log = this.config.logger;
    const code = this.config.clientVerificationCode;

    if (!code) {
      await this.requestClientVerificationPin();
      log?.warn('Blink client verification required. A verification code has been sent.');
      log?.warn('Add "clientVerificationCode" to your Homebridge config and restart.');
      throw new Error('Blink client verification required');
    }

    const trustDevice = this.config.trustDevice ?? true;
    const trustDeviceEnabled = accountInfo.trust_device_enabled ?? true;
    await this.verifyClientVerificationPin(code, trustDeviceEnabled, trustDevice);
    log?.info('Blink client verification successful.');
  }

  private async handleAccountVerification(accountInfo: BlinkAccountInfo): Promise<void> {
    const log = this.config.logger;
    const code = this.config.accountVerificationCode;
    const requiredLabels: string[] = [];
    if (accountInfo.phone_verification_required) {
      requiredLabels.push('phone');
    }
    if (accountInfo.account_verification_required) {
      requiredLabels.push('account');
    }
    const requirement = requiredLabels.length > 0 ? requiredLabels.join(' & ') : 'account';

    if (!code) {
      const response = await this.requestAccountVerificationPin();
      const channel = response.phone_verification_channel ?? response.verification_channel;
      if (channel) {
        log?.warn(`Blink verification code sent via ${channel}.`);
      }
      log?.warn(`Blink requires ${requirement} verification (phone/email).`);
      log?.warn('Add "accountVerificationCode" to your Homebridge config and restart.');
      throw new Error('Blink account verification required');
    }

    const response = await this.verifyAccountVerificationPin(code);
    if (!response.valid) {
      log?.warn('Blink account verification failed. Request a new code and try again.');
      throw new Error('Blink account verification failed');
    }
    if (response.require_new_pin) {
      log?.warn('Blink requires a new verification PIN. Request another code and retry.');
      throw new Error('Blink account verification requires a new PIN');
    }

    log?.info('Blink account verification successful.');
  }

  private updateBaseUrls(): void {
    this.http.setBaseUrl(getRestBaseUrl(this.config));
    this.sharedHttp.setBaseUrl(getSharedRestBaseUrl(this.config));
    this.sharedRootHttp.setBaseUrl(getSharedRestRootUrl(this.config));
  }

  private async syncTierInfo(): Promise<BlinkTierInfo | null> {
    const log = this.config.logger;
    try {
      const tierInfo = await this.getTierInfo();
      if (!tierInfo?.tier) {
        return tierInfo ?? null;
      }
      const normalizedTier = normalizeTier(tierInfo.tier);
      if (!normalizedTier) {
        return tierInfo ?? null;
      }

      const previousTier = this.config.tier ?? 'prod';
      const previousSharedTier = this.config.sharedTier;
      const isKnownTier = KNOWN_TIERS.includes(normalizedTier as KnownTier);

      if (!isKnownTier) {
        log?.warn(
          `Blink tier_info returned unrecognized tier "${tierInfo.tier}". Using reported tier for routing.`,
        );
      }

      if (normalizedTier !== previousTier) {
        this.config.tier = normalizedTier;
        if (!previousSharedTier || previousSharedTier === previousTier) {
          this.config.sharedTier = normalizedTier;
        }
        this.updateBaseUrls();
        log?.info(`Blink tier updated from ${previousTier} to ${normalizedTier}.`);
      }
      return tierInfo;
    } catch (error) {
      log?.debug?.(`Failed to fetch Blink tier info: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Get account info with verification flags.
   * Source: API Dossier Section 3.9 - GET v2/users/info
   */
  async getAccountInfo(): Promise<BlinkAccountInfo> {
    await this.auth.ensureValidToken();
    const info = await this.http.get<BlinkAccountInfo>('v2/users/info');
    if (info?.account_id) {
      this.accountId = info.account_id;
    }
    if (info?.client_id) {
      this.clientId = info.client_id;
    }
    return info;
  }

  /**
   * Get tier info for the current account.
   * Source: API Dossier Section 3.9 - GET v1/users/tier_info
   */
  async getTierInfo(): Promise<BlinkTierInfo> {
    await this.auth.ensureValidToken();
    return this.http.get<BlinkTierInfo>('v1/users/tier_info');
  }

  /**
   * Trigger account/phone verification PIN resend.
   */
  async requestAccountVerificationPin(): Promise<BlinkGeneratePinResponse> {
    return this.http.post<BlinkGeneratePinResponse>('v4/users/pin/resend');
  }

  /**
   * Verify account/phone verification PIN.
   */
  async verifyAccountVerificationPin(pin: string): Promise<BlinkVerifyPinResponse> {
    return this.http.post<BlinkVerifyPinResponse>('v4/users/pin/verify', {
      pin,
      email: this.config.email,
      device_identifier: this.config.hardwareId,
      client_name: this.config.clientName ?? 'homebridge-blink',
    });
  }

  /**
   * Trigger a client verification PIN email/SMS.
   */
  async requestClientVerificationPin(): Promise<BlinkResendPinResponse> {
    const clientId = await this.ensureClientId();
    return this.http.post<BlinkResendPinResponse>(`v5/clients/${clientId}/client_verification/pin/resend`);
  }

  /**
   * Verify client verification PIN and optionally trust this device.
   */
  async verifyClientVerificationPin(
    pin: string,
    trustDeviceEnabled = true,
    trustDevice = true,
  ): Promise<BlinkPinVerificationResponse> {
    const clientId = await this.ensureClientId();
    if (trustDeviceEnabled) {
      return this.http.post<BlinkPinVerificationResponse>(`v5/clients/${clientId}/client_verification/pin/verify`, {
        pin,
        trusted: trustDevice,
      });
    }

    return this.http.post<BlinkPinVerificationResponse>(`v4/clients/${clientId}/pin/verify`, {
      pin,
      email: this.config.email,
      device_identifier: this.config.hardwareId,
      client_name: this.config.clientName ?? 'homebridge-blink',
    });
  }

  /**
   * Get homescreen data with all devices
   * Source: API Dossier Section 3.9 - GET v4/accounts/{account_id}/homescreen
   * Evidence: smali_classes10/com/immediasemi/blink/utils/sync/HomeScreenApi.smali
   */
  async getHomescreen(): Promise<BlinkHomescreen> {
    await this.auth.ensureValidToken();
    this.accountId = this.accountId ?? this.auth.getAccountId();

    const accountId = await this.ensureAccountId();

    const homescreen = await this.sharedHttp.get<BlinkHomescreen>(`v4/accounts/${accountId}/homescreen`);
    this.accountId = homescreen.account?.account_id ?? accountId;
    return homescreen;
  }

  /**
   * Arm a network (enable motion detection for all devices)
   * Source: API Dossier Section 3.7 - POST v1/accounts/{account_id}/networks/{networkId}/state/arm
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/network/NetworkApi.smali
   */
  async armNetwork(networkId: number): Promise<BlinkCommandResponse> {
    const accountId = await this.ensureAccountId();
    return this.sharedHttp.post<BlinkCommandResponse>(`v1/accounts/${accountId}/networks/${networkId}/state/arm`);
  }

  /**
   * Disarm a network (disable motion detection for all devices)
   * Source: API Dossier Section 3.7 - POST v1/accounts/{account_id}/networks/{network_id}/state/disarm
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/network/NetworkApi.smali
   */
  async disarmNetwork(networkId: number): Promise<BlinkCommandResponse> {
    const accountId = await this.ensureAccountId();
    return this.sharedHttp.post<BlinkCommandResponse>(`v1/accounts/${accountId}/networks/${networkId}/state/disarm`);
  }

  /**
   * Enable motion detection for a device.
   * Source: API Dossier Sections 3.3 (cameras), 3.4 (owls), 3.5 (doorbells)
   * Note: Camera endpoints use root URL (no /api/ prefix); doorbell/owl use /api/v1/.
   */
  async enableMotion(deviceType: BlinkApiDeviceType, networkId: number, deviceId: number): Promise<void> {
    const accountId = await this.ensureAccountId();
    const ep = this.deviceEndpoints[deviceType];
    await ep.motion.http().post(
      `${ep.motion.prefix}accounts/${accountId}/networks/${networkId}/${ep.pathSegment}/${deviceId}/enable`,
    );
  }

  /**
   * Disable motion detection for a device.
   * Source: API Dossier Sections 3.3 (cameras), 3.4 (owls), 3.5 (doorbells)
   */
  async disableMotion(deviceType: BlinkApiDeviceType, networkId: number, deviceId: number): Promise<void> {
    const accountId = await this.ensureAccountId();
    const ep = this.deviceEndpoints[deviceType];
    await ep.motion.http().post(
      `${ep.motion.prefix}accounts/${accountId}/networks/${networkId}/${ep.pathSegment}/${deviceId}/disable`,
    );
  }

  /**
   * Update device configuration (e.g., motion sensitivity).
   * Source: API Dossier Sections 3.3 (cameras v2), 3.4 (owls v1), 3.5 (doorbells v1)
   */
  async updateDeviceConfig(
    deviceType: BlinkApiDeviceType,
    networkId: number,
    deviceId: number,
    update: BlinkCameraConfigUpdate,
  ): Promise<BlinkCommandResponse> {
    const accountId = await this.ensureAccountId();
    const ep = this.deviceEndpoints[deviceType];
    return ep.config.http().post<BlinkCommandResponse>(
      `${ep.config.prefix}accounts/${accountId}/networks/${networkId}/${ep.pathSegment}/${deviceId}/config`,
      update,
    );
  }

  /**
   * Request thumbnail capture for a device.
   * Source: API Dossier Sections 3.3 (cameras), 3.4 (owls), 3.5 (doorbells)
   * Note: Camera endpoints use root URL (no /api/ prefix); doorbell/owl use /api/v1/.
   */
  async requestThumbnail(deviceType: BlinkApiDeviceType, networkId: number, deviceId: number): Promise<BlinkCommandResponse> {
    const accountId = await this.ensureAccountId();
    const ep = this.deviceEndpoints[deviceType];
    return ep.thumbnail.http().post<BlinkCommandResponse>(
      `${ep.thumbnail.prefix}accounts/${accountId}/networks/${networkId}/${ep.pathSegment}/${deviceId}/thumbnail`,
    );
  }

  /**
   * Start live view session for a device.
   * Source: API Dossier Sections 3.3 (cameras v6), 3.4 (owls v2), 3.5 (doorbells v2)
   */
  async startLiveview(
    deviceType: BlinkApiDeviceType,
    networkId: number,
    deviceId: number,
    intent = 'liveview',
    motionEventStartTime?: string | null,
  ): Promise<BlinkLiveVideoResponse> {
    const accountId = await this.ensureAccountId();
    const ep = this.deviceEndpoints[deviceType];
    const body = {
      intent,
      motion_event_start_time: motionEventStartTime ?? null,
    };
    return ep.liveview.http().post<BlinkLiveVideoResponse>(
      `${ep.liveview.prefix}accounts/${accountId}/networks/${networkId}/${ep.pathSegment}/${deviceId}/liveview`,
      body,
    );
  }

  /**
   * Get media clips (motion events)
   * Source: API Dossier Section 3.9 - GET v4/accounts/{account_id}/media
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/video/VideoApi.smali
   */
  async getMedia(query: BlinkMediaQuery = {}): Promise<BlinkMediaResponse> {
    const accountId = await this.ensureAccountId();
    const params = new URLSearchParams();
    if (query.startTime) params.set('start_time', query.startTime);
    if (query.endTime) params.set('end_time', query.endTime);
    if (query.paginationKey !== undefined && query.paginationKey !== null) {
      params.set('pagination_key', String(query.paginationKey));
    }

    const path = `v4/accounts/${accountId}/media${params.toString() ? `?${params}` : ''}`;
    const body = query.filters
      ? {
          filters: {
            types: query.filters.types ?? [],
            device_types: query.filters.deviceTypes ?? [],
            devices: query.filters.devices ?? undefined,
          },
        }
      : {};

    return this.sharedHttp.post<BlinkMediaResponse>(path, body);
  }

  /**
   * Get unwatched media count (check for new motion events)
   * Source: API Dossier - GET v4/accounts/{account_id}/unwatched_media
   * Evidence: jadx-out UnwatchedMediaResponse.java
   * Note: Returns only a count. Use getMedia() to fetch actual clips.
   */
  async getUnwatchedMedia(): Promise<BlinkUnwatchedMediaResponse> {
    const accountId = await this.ensureAccountId();
    return this.sharedHttp.get<BlinkUnwatchedMediaResponse>(`v4/accounts/${accountId}/unwatched_media`);
  }

  /**
   * Get command status once
   * Source: API Dossier Section 3.10 - GET /accounts/{account_id}/networks/{network}/commands/{command}
   * Note: No version prefix - uses root URL (without /api/)
   */
  async getCommandStatus(networkId: number, commandId: number): Promise<BlinkCommandStatus> {
    const accountId = await this.ensureAccountId();
    return this.sharedRootHttp.get<BlinkCommandStatus>(
      `accounts/${accountId}/networks/${networkId}/commands/${commandId}`,
    );
  }

  /**
   * Poll command status until complete
   * Source: API Dossier Section 3.10 - GET /accounts/{account_id}/networks/{network}/commands/{command}
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/network/command/CommandApi.smali
   */
  async pollCommand(networkId: number, commandId: number, maxAttempts = 10): Promise<BlinkCommandStatus> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.getCommandStatus(networkId, commandId);

      if (status.complete || status.status === 'complete') {
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(`Blink command ${commandId} failed`);
      }

      // Use polling_interval from response, default to 5 seconds
      const delayMs = (status.polling_interval ?? 5) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error(`Blink command ${commandId} timed out after ${maxAttempts} attempts`);
  }

  /**
   * Update/extend an ongoing command (e.g., live view)
   * Source: API Dossier Section 3.10 - POST /accounts/{account_id}/networks/{network}/commands/{command}/update
   * Note: No version prefix - uses root URL (without /api/)
   *
   * Returns null if the command no longer exists (404) - this happens when the stream
   * has already ended but the keep-alive timer hasn't been cleared yet.
   */
  async updateCommand(networkId: number, commandId: number): Promise<BlinkCommandStatus | null> {
    const accountId = await this.ensureAccountId();
    try {
      return await this.sharedRootHttp.post<BlinkCommandStatus>(
        `accounts/${accountId}/networks/${networkId}/commands/${commandId}/update`,
      );
    } catch (error) {
      // The command may have already ended - this is normal when stream closes
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Mark a command as done (e.g., end live view)
   * Source: API Dossier Section 3.10 - POST /accounts/{account_id}/networks/{network}/commands/{command}/done
   * Note: No version prefix - uses root URL (without /api/)
   *
   * @deprecated This endpoint was deprecated by Blink around late 2025. The method now silently
   * ignores 404 errors as the server no longer supports this endpoint.
   */
  async completeCommand(networkId: number, commandId: number): Promise<BlinkCommandStatus | null> {
    const accountId = await this.ensureAccountId();
    try {
      return await this.sharedRootHttp.post<BlinkCommandStatus>(
        `accounts/${accountId}/networks/${networkId}/commands/${commandId}/done`,
      );
    } catch (error) {
      // The /done endpoint was deprecated by Blink and now returns 404
      // Silently ignore this error as the endpoint is no longer functional
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  private async ensureAccountId(): Promise<number> {
    if (!this.accountId) {
      await this.login();
    }

    const accountId = this.accountId ?? this.auth.getAccountId();
    if (!accountId) {
      throw new Error('Blink account id is not set');
    }

    this.auth.setAccountId(accountId);
    return accountId;
  }

  private async ensureClientId(): Promise<number> {
    if (!this.clientId) {
      await this.getAccountInfo();
    }

    const clientId = this.clientId ?? this.auth.getClientId();
    if (!clientId) {
      throw new Error('Blink client id is not set');
    }

    this.auth.setClientId(clientId);
    return clientId;
  }
}
