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
import { getSharedRestBaseUrl, getSharedRestRootUrl } from './urls';
import {
  BlinkCommandResponse,
  BlinkCommandStatus,
  BlinkConfig,
  BlinkHomescreen,
  BlinkMediaResponse,
  BlinkMediaQuery,
  BlinkLiveVideoResponse,
} from '../types';

export class BlinkApi {
  private readonly auth: BlinkAuth;
  private readonly http: BlinkHttp;
  private readonly sharedHttp: BlinkHttp;
  private accountId: number | null = null;

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
    await this.auth.login(twoFaCode ?? this.config.twoFactorCode);
    this.accountId = this.auth.getAccountId();
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

    return accountId;
  }
}
