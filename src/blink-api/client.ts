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
  BlinkCommandResponse,
  BlinkCommandStatus,
  BlinkConfig,
  BlinkGeneratePinResponse,
  BlinkHomescreen,
  BlinkMediaResponse,
  BlinkMediaQuery,
  BlinkLiveVideoResponse,
  BlinkPinVerificationResponse,
  BlinkResendPinResponse,
  BlinkTierInfo,
  BlinkVerifyPinResponse,
} from '../types';

const KNOWN_TIERS = ['prod', 'sqa1', 'cemp', 'prde', 'prsg', 'a001', 'srf1'] as const;
type KnownTier = (typeof KNOWN_TIERS)[number];

const normalizeTier = (tier?: string | null): KnownTier | null => {
  if (!tier) {
    return null;
  }
  const normalized = tier.toLowerCase();
  return KNOWN_TIERS.includes(normalized as KnownTier) ? (normalized as KnownTier) : null;
};

export class BlinkApi {
  private readonly auth: BlinkAuth;
  private readonly http: BlinkHttp;
  private readonly sharedHttp: BlinkHttp;
  private accountId: number | null = null;
  private clientId: number | null = null;

  constructor(private readonly config: BlinkConfig) {
    this.auth = new BlinkAuth(config);
    this.http = new BlinkHttp(this.auth, config);
    this.sharedHttp = new BlinkHttp(this.auth, config, getSharedRestBaseUrl(config));
  }

  getSharedRestRootUrl(): string {
    return getSharedRestRootUrl(this.config);
  }

  /**
   * Authenticate with Blink API
   * Source: API Dossier Section 2.1 (OAuth Flow)
   */
  async login(twoFaCode?: string): Promise<void> {
    if (twoFaCode ?? this.config.twoFactorCode) {
      await this.auth.login(twoFaCode ?? this.config.twoFactorCode);
    } else {
      await this.auth.ensureValidToken();
    }
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
        `Failed to fetch Blink account info: ${(error as Error).message}. Continuing with cached tokens.`,
      );
      return;
    }
    if (!accountInfo) {
      this.config.logger?.warn('Blink account info unavailable. Continuing with cached tokens.');
      return;
    }
    this.accountId = accountInfo.account_id ?? this.accountId;
    this.clientId = accountInfo.client_id ?? this.clientId;
    this.auth.setAccountId(this.accountId);
    this.auth.setClientId(this.clientId);

    await this.syncTierInfo();

    if (accountInfo.client_verification_required) {
      await this.handleClientVerification(accountInfo);
    }

    if (accountInfo.phone_verification_required || accountInfo.account_verification_required) {
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
  }

  private async syncTierInfo(): Promise<void> {
    const log = this.config.logger;
    try {
      const tierInfo = await this.getTierInfo();
      if (!tierInfo?.tier) {
        return;
      }
      const normalizedTier = normalizeTier(tierInfo.tier);
      if (!normalizedTier) {
        log?.warn(`Blink tier_info returned unsupported tier "${tierInfo.tier}". Using ${this.config.tier ?? 'prod'}.`);
        return;
      }

      const previousTier = this.config.tier ?? 'prod';
      const previousSharedTier = this.config.sharedTier;

      if (normalizedTier !== previousTier) {
        this.config.tier = normalizedTier;
        if (!previousSharedTier || previousSharedTier === previousTier) {
          this.config.sharedTier = normalizedTier;
        }
        this.updateBaseUrls();
        log?.info(`Blink tier updated from ${previousTier} to ${normalizedTier}.`);
      }
    } catch (error) {
      log?.debug?.(`Failed to fetch Blink tier info: ${(error as Error).message}`);
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
   * Enable motion detection for a camera
   * Source: API Dossier Section 3.3 - POST accounts/{account_id}/networks/{network}/cameras/{camera}/enable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/CameraApi.smali
   */
  async enableCameraMotion(networkId: number, cameraId: number): Promise<void> {
    const accountId = await this.ensureAccountId();
    await this.sharedHttp.post(`accounts/${accountId}/networks/${networkId}/cameras/${cameraId}/enable`);
  }

  /**
   * Disable motion detection for a camera
   * Source: API Dossier Section 3.3 - POST accounts/{account_id}/networks/{network}/cameras/{camera}/disable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/CameraApi.smali
   */
  async disableCameraMotion(networkId: number, cameraId: number): Promise<void> {
    const accountId = await this.ensureAccountId();
    await this.sharedHttp.post(`accounts/${accountId}/networks/${networkId}/cameras/${cameraId}/disable`);
  }

  /**
   * Enable motion detection for a doorbell
   * Source: API Dossier Section 3.5 - POST v1/accounts/{account_id}/networks/{network}/doorbells/{lotus}/enable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.smali
   */
  async enableDoorbellMotion(networkId: number, doorbellId: number): Promise<void> {
    const accountId = await this.ensureAccountId();
    await this.sharedHttp.post(`v1/accounts/${accountId}/networks/${networkId}/doorbells/${doorbellId}/enable`);
  }

  /**
   * Disable motion detection for a doorbell
   * Source: API Dossier Section 3.5 - POST v1/accounts/{account_id}/networks/{network}/doorbells/{lotus}/disable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.smali
   */
  async disableDoorbellMotion(networkId: number, doorbellId: number): Promise<void> {
    const accountId = await this.ensureAccountId();
    await this.sharedHttp.post(`v1/accounts/${accountId}/networks/${networkId}/doorbells/${doorbellId}/disable`);
  }

  /**
   * Enable motion detection for an owl (Mini camera)
   * Source: API Dossier Section 3.4 - POST v1/accounts/{account_id}/networks/{networkId}/owls/{owlId}/enable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/wired/OwlApi.smali
   */
  async enableOwlMotion(networkId: number, owlId: number): Promise<void> {
    const accountId = await this.ensureAccountId();
    await this.sharedHttp.post(`v1/accounts/${accountId}/networks/${networkId}/owls/${owlId}/enable`);
  }

  /**
   * Disable motion detection for an owl (Mini camera)
   * Source: API Dossier Section 3.4 - POST v1/accounts/{account_id}/networks/{networkId}/owls/{owlId}/disable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/wired/OwlApi.smali
   */
  async disableOwlMotion(networkId: number, owlId: number): Promise<void> {
    const accountId = await this.ensureAccountId();
    await this.sharedHttp.post(`v1/accounts/${accountId}/networks/${networkId}/owls/${owlId}/disable`);
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
   * Get unwatched media clips (new motion events)
   * Source: API Dossier Section 3.9 - GET v4/accounts/{account_id}/unwatched_media
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/video/VideoApi.smali
   */
  async getUnwatchedMedia(): Promise<BlinkMediaResponse> {
    const accountId = await this.ensureAccountId();
    return this.sharedHttp.get<BlinkMediaResponse>(`v4/accounts/${accountId}/unwatched_media`);
  }

  /**
   * Request thumbnail capture for a camera
   * Source: API Dossier Section 3.3 - POST accounts/{account_id}/networks/{network}/cameras/{camera}/thumbnail
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/CameraApi.smali
   */
  async requestCameraThumbnail(networkId: number, cameraId: number): Promise<BlinkCommandResponse> {
    const accountId = await this.ensureAccountId();
    return this.sharedHttp.post<BlinkCommandResponse>(
      `accounts/${accountId}/networks/${networkId}/cameras/${cameraId}/thumbnail`,
    );
  }

  /**
   * Request thumbnail capture for an owl (Mini camera)
   * Source: API Dossier Section 3.4 - POST v1/accounts/{account_id}/networks/{networkId}/owls/{owlId}/thumbnail
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/wired/OwlApi.smali
   */
  async requestOwlThumbnail(networkId: number, owlId: number): Promise<BlinkCommandResponse> {
    const accountId = await this.ensureAccountId();
    return this.sharedHttp.post<BlinkCommandResponse>(
      `v1/accounts/${accountId}/networks/${networkId}/owls/${owlId}/thumbnail`,
    );
  }

  /**
   * Request thumbnail capture for a doorbell
   * Source: API Dossier Section 3.5 - POST v1/accounts/{account_id}/networks/{network}/doorbells/{lotus}/thumbnail
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.smali
   */
  async requestDoorbellThumbnail(networkId: number, doorbellId: number): Promise<BlinkCommandResponse> {
    const accountId = await this.ensureAccountId();
    return this.sharedHttp.post<BlinkCommandResponse>(
      `v1/accounts/${accountId}/networks/${networkId}/doorbells/${doorbellId}/thumbnail`,
    );
  }

  /**
   * Start live view session for a camera
   * Source: API Dossier Section 3.3 - POST v6/accounts/{account_id}/networks/{networkId}/cameras/{cameraId}/liveview
   * Source: API Dossier Section 4.2 - LiveVideoResponse model
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/CameraApi.smali
   */
  async startCameraLiveview(
    networkId: number,
    cameraId: number,
    intent = 'liveview',
    motionEventStartTime?: string | null,
  ): Promise<BlinkLiveVideoResponse> {
    const accountId = await this.ensureAccountId();
    const body = {
      intent,
      motion_event_start_time: motionEventStartTime ?? null,
    };
    return this.sharedHttp.post<BlinkLiveVideoResponse>(
      `v6/accounts/${accountId}/networks/${networkId}/cameras/${cameraId}/liveview`,
      body,
    );
  }

  /**
   * Start live view session for an owl (Mini camera)
   * Source: API Dossier Section 3.4 - POST v2/accounts/{account_id}/networks/{networkId}/owls/{owlId}/liveview
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/wired/OwlApi.smali
   */
  async startOwlLiveview(
    networkId: number,
    owlId: number,
    intent = 'liveview',
    motionEventStartTime?: string | null,
  ): Promise<BlinkLiveVideoResponse> {
    const accountId = await this.ensureAccountId();
    const body = {
      intent,
      motion_event_start_time: motionEventStartTime ?? null,
    };
    return this.sharedHttp.post<BlinkLiveVideoResponse>(
      `v2/accounts/${accountId}/networks/${networkId}/owls/${owlId}/liveview`,
      body,
    );
  }

  /**
   * Start live view session for a doorbell
   * Source: API Dossier Section 3.5 - POST v2/accounts/{account_id}/networks/{networkId}/doorbells/{doorbellId}/liveview
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.smali
   */
  async startDoorbellLiveview(
    networkId: number,
    doorbellId: number,
    intent = 'liveview',
    motionEventStartTime?: string | null,
  ): Promise<BlinkLiveVideoResponse> {
    const accountId = await this.ensureAccountId();
    const body = {
      intent,
      motion_event_start_time: motionEventStartTime ?? null,
    };
    return this.sharedHttp.post<BlinkLiveVideoResponse>(
      `v2/accounts/${accountId}/networks/${networkId}/doorbells/${doorbellId}/liveview`,
      body,
    );
  }

  /**
   * Get command status once
   * Source: API Dossier Section 3.10 - GET /accounts/{account_id}/networks/{network}/commands/{command}
   */
  async getCommandStatus(networkId: number, commandId: number): Promise<BlinkCommandStatus> {
    const accountId = await this.ensureAccountId();
    return this.sharedHttp.get<BlinkCommandStatus>(
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
   */
  async updateCommand(networkId: number, commandId: number): Promise<BlinkCommandStatus> {
    const accountId = await this.ensureAccountId();
    return this.sharedHttp.post<BlinkCommandStatus>(
      `accounts/${accountId}/networks/${networkId}/commands/${commandId}/update`,
    );
  }

  /**
   * Mark a command as done (e.g., end live view)
   * Source: API Dossier Section 3.10 - POST /accounts/{account_id}/networks/{network}/commands/{command}/done
   */
  async completeCommand(networkId: number, commandId: number): Promise<BlinkCommandStatus> {
    const accountId = await this.ensureAccountId();
    return this.sharedHttp.post<BlinkCommandStatus>(
      `accounts/${accountId}/networks/${networkId}/commands/${commandId}/done`,
    );
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
