import { requireRemoteId, validateHomescreen } from './domain-validation';
/**
 * Blink API Client
 *
 * High-level client for interacting with Blink Home Monitor REST API.
 * All methods reference the API dossier for endpoint documentation.
 *
 * Source: API Dossier - /base-apk/docs/api_dossier.md
 */

import { BlinkAuth } from './auth';
import { RequestOptions, OperationTimeoutError, checkRequestBudget, withinRequestBudget, budgetedDelay } from '../operation-budget';
import { BlinkHttp, BlinkHttpError } from './http';
import {
  BLINK_PRODUCTION_BOOTSTRAP_TIERS,
  getRestBaseUrl,
  getSharedRestBaseUrl,
  getSharedRestRootUrl,
  normalizeBlinkTier,
} from './urls';
import {
  BlinkAccountInfo,
  BlinkCommandResponse,
  BlinkCommandStatus,
  BlinkConfig,
  BlinkGeneratePinResponse,
  BlinkHostedLoginResult,
  BlinkHostedOAuthStart,
  BlinkHomescreen,
  BlinkLiveVideoResponse,
  BlinkLogger,
  BlinkMediaResponse,
  BlinkMediaQuery,
  BlinkPinVerificationResponse,
  BlinkResendPinResponse,
  BlinkTierInfo,
  BlinkUnwatchedMediaResponse,
  BlinkVerifyPinResponse,
} from '../types';

export class BlinkRestVerificationRequiredError extends Error {
  constructor(
    public readonly type: 'client' | 'account',
    message = `Blink ${type} verification required`,
  ) {
    super(message);
    this.name = 'BlinkRestVerificationRequiredError';
  }
}

export interface BlinkCaptureResult extends BlinkCommandResponse {
  captureOutcome: 'completed' | 'existing-thumbnail';
  thumbnail?: string;
}

interface ConflictResolution<T> { resolved: boolean; value?: T }

export class BlinkApi {
  private stateCommandTail: Promise<void> = Promise.resolve();
  private hasSentStateCommand = false;
  private readonly auth: BlinkAuth;
  private readonly http: BlinkHttp;
  private readonly sharedHttp: BlinkHttp;
  private readonly sharedRootHttp: BlinkHttp;
  private readonly log: BlinkLogger;
  private readonly debug: boolean;
  private accountId: number | null = null;
  private clientId: number | null = null;

  constructor(private readonly config: BlinkConfig) {
    this.auth = new BlinkAuth(config);
    this.http = new BlinkHttp(this.auth, config);
    this.sharedHttp = new BlinkHttp(this.auth, config, getSharedRestBaseUrl(config));
    this.sharedRootHttp = new BlinkHttp(this.auth, config, getSharedRestRootUrl(config));
    this.log = config.logger ?? { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
    this.debug = config.debugAuth ?? false;
  }

  private logDebug(message: string): void {
    if (this.debug) {
      this.log.info(`[Client Debug] ${message}`);
    }
  }

  /** Serialize remote capture and mutations, including command completion. */
  private queueStateCommand<T>(
    label: 'Motion' | 'Network' | 'Capture',
    send: (options: RequestOptions) => Promise<T>,
    retryDelays: number[],
    conflictResolution?: (options: RequestOptions) => Promise<ConflictResolution<T>>,
    options: RequestOptions = {},
  ): Promise<T> {
    let started = false;
    let queueTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const command = this.stateCommandTail.then(async () => {
      const checkQueued = () => {
        options.signal?.throwIfAborted();
        if (options.queueDeadline !== undefined && options.queueDeadline <= Date.now()) throw new OperationTimeoutError();
      };
      checkQueued();
      if (this.hasSentStateCommand) await budgetedDelay(300, options);
      checkQueued();
      started = true;
      if (queueTimer) globalThis.clearTimeout(queueTimer);
      this.hasSentStateCommand = true;
      const execution = { ...options, deadline: Math.min(options.deadline ?? Infinity, Date.now() + 60_000) };
      for (let attempt = 0; ; attempt++) {
        checkRequestBudget(execution);
        try {
          return await withinRequestBudget(send(execution), execution);
        } catch (error) {
          if (!(error instanceof BlinkHttpError) || error.status !== 409) throw error;
          const reconciled = await conflictResolution?.(execution);
          if (reconciled?.resolved) {
            this.log.info(`[${label}] Requested state verified after conflict (attempt ${attempt + 1}).`);
            return reconciled.value as T;
          }
          const delay = retryDelays[attempt];
          if (delay === undefined) throw error;
          this.log.warn(`[${label}] State conflict; retry in ${delay}ms (attempt ${attempt + 1}/${retryDelays.length}).`);
          await budgetedDelay(delay, execution);
        }
      }
    });
    this.stateCommandTail = command.then(() => undefined, () => undefined);
    if (options.queueDeadline === undefined) return command;
    return new Promise<T>((resolve, reject) => {
      queueTimer = globalThis.setTimeout(() => {
        if (!started) reject(new OperationTimeoutError());
      }, Math.max(0, options.queueDeadline! - Date.now()));
      command.then(resolve, reject).finally(() => {
        if (queueTimer) globalThis.clearTimeout(queueTimer);
      });
    });
  }

  private async networkReachedState(networkId: number, armed: boolean, options: RequestOptions): Promise<boolean> {
    try {
      const homescreen = await this.getHomescreen(options);
      return homescreen.networks.some(network => network.id === networkId && network.armed === armed);
    } catch {
      checkRequestBudget(options);
      return false;
    }
  }

  private async motionReachedState(type: 'camera' | 'owl' | 'doorbell', networkId: number, deviceId: number,
    enabled: boolean, options: RequestOptions): Promise<ConflictResolution<void>> {
    try {
      const homescreen = await this.getHomescreen(options);
      const devices = type === 'camera' ? homescreen.cameras : type === 'owl' ? homescreen.owls : homescreen.doorbells;
      return { resolved: devices.some(device => device.id === deviceId && device.network_id === networkId && device.enabled === enabled) };
    } catch {
      checkRequestBudget(options);
      return { resolved: false };
    }
  }

  private async completeRemoteCommand(networkId: number, response: BlinkCommandResponse | undefined,
    options: RequestOptions, interval = 1): Promise<void> {
    const id = response?.id ?? response?.command_id;
    if (id !== undefined && id !== null) requireRemoteId(id);
    if (id) await this.pollCommand(networkId, id, 60, interval, options);
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

  async beginHostedLogin(): Promise<BlinkHostedOAuthStart> {
    return this.auth.beginHostedLogin();
  }

  async completeHostedLogin(
    flowId: string,
    callbackUrl: string,
  ): Promise<BlinkHostedLoginResult> {
    await this.auth.completeHostedLogin(flowId, callbackUrl);
    this.accountId = this.auth.getAccountId();
    this.clientId = this.auth.getClientId();

    try {
      await this.syncAccountInfoAndVerify({
        useProductionBootstrap: true,
        strictAccountInfo: true,
        persistMetadata: false,
      });
      const homescreen = await this.getHomescreen();
      await this.auth.persistCurrentState();
      return {
        authenticated: true,
        verified: true,
        ...this.buildHostedResultMetadata(),
        networkCount: homescreen.networks?.length ?? 0,
        cameraCount: homescreen.cameras?.length ?? 0,
      };
    } catch (error) {
      await this.auth.persistCurrentState();
      return this.buildUnverifiedHostedResult(error);
    }
  }

  async cancelHostedLogin(): Promise<void> {
    await this.auth.cancelHostedLogin();
  }

  private buildHostedResultMetadata(): Partial<Pick<
    BlinkHostedLoginResult,
    'accountId' | 'clientId' | 'email' | 'tier'
  >> {
    const metadata: Partial<Pick<
      BlinkHostedLoginResult,
      'accountId' | 'clientId' | 'email' | 'tier'
    >> = {};
    if (this.accountId !== null) metadata.accountId = this.accountId;
    if (this.clientId !== null) metadata.clientId = this.clientId;
    if (this.config.email) metadata.email = this.config.email;
    const tier = this.auth.getTier();
    if (tier) metadata.tier = tier;
    return metadata;
  }

  private buildUnverifiedHostedResult(error: unknown): BlinkHostedLoginResult {
    return {
      authenticated: true,
      verified: false,
      verificationRequirement: error instanceof BlinkRestVerificationRequiredError
        ? error.type
        : 'connection',
      ...this.buildHostedResultMetadata(),
      networkCount: 0,
      cameraCount: 0,
    };
  }

  /**
   * Authenticate with Blink API using OAuth 2.0 Authorization Code Flow with PKCE
   * 
   * @param twoFaCode - Optional 2FA code (if provided, will be used to complete pending 2FA)
   * @throws Blink2FARequiredError if 2FA is required but no code provided
   */
  async login(twoFaCode?: string): Promise<void> {
    this.logDebug('login → syncing persisted tier to config');
    await this.syncPersistedTierToConfig();

    // When auth is locked, skip 2FA/verification code auto-submission
    const effectiveTwoFaCode = this.config.authLocked ? undefined : (twoFaCode ?? this.config.twoFactorCode);

    if (effectiveTwoFaCode && this.auth.is2FAPending()) {
      this.logDebug('login → 2FA pending, completing with provided code');
      await this.auth.complete2FA(effectiveTwoFaCode);
    } else {
      if (this.config.authLocked && (twoFaCode ?? this.config.twoFactorCode)) {
        this.logDebug('login → authLocked=true, ignoring stored 2FA/verification codes');
      }
      this.logDebug('login → ensuring valid token');
      await this.auth.ensureValidToken();
    }
    this.accountId = this.auth.getAccountId();
    this.clientId = this.auth.getClientId();
    this.logDebug('login → authenticated; account/client metadata loaded');
    await this.syncAccountInfoAndVerify();
  }

  /**
   * Sync persisted tier from auth storage to config and update base URLs.
   * Called before any HTTP requests to ensure correct region routing.
   */
  private async syncPersistedTierToConfig(): Promise<void> {
    const persistedTier = await this.auth.getPersistedTier();
    this.logDebug(`syncPersistedTierToConfig → persisted tier: ${persistedTier ?? 'none'}, current: ${this.config.tier ?? 'prod'}`);
    if (persistedTier && persistedTier !== this.config.tier) {
      const previousTier = this.config.tier ?? 'prod';
      this.config.tier = persistedTier;
      if (!this.config.sharedTier || this.config.sharedTier === previousTier) {
        this.config.sharedTier = persistedTier;
      }
      this.updateBaseUrls();
      this.logDebug(`syncPersistedTierToConfig → updated tier ${previousTier} → ${persistedTier}`);
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
  private async syncAccountInfoAndVerify(options: {
    useProductionBootstrap?: boolean;
    strictAccountInfo?: boolean;
    persistMetadata?: boolean;
  } = {}): Promise<void> {
    this.logDebug('syncAccountInfoAndVerify → syncing tier info');
    const tierInfo = await this.syncTierInfo(options.useProductionBootstrap ?? false);
    let discoveredTier = tierInfo?.tier ? normalizeBlinkTier(tierInfo.tier) : null;
    if (tierInfo?.account_id) {
      this.accountId = requireRemoteId(tierInfo.account_id);
    }

    this.logDebug('syncAccountInfoAndVerify → fetching account info');
    let accountInfo: BlinkAccountInfo | null = null;
    try {
      accountInfo = await this.getAccountInfo();
      this.logDebug('syncAccountInfoAndVerify → account info received');
    } catch (error) {
      if (options.strictAccountInfo) {
        throw error;
      }
      this.logDebug('syncAccountInfoAndVerify → account info fetch failed');
      this.config.logger?.warn(
        'Failed to fetch Blink account info. Continuing with fallback tier info.',
      );
    }

    if (accountInfo) {
      this.accountId = accountInfo.account_id ?? this.accountId;
      this.clientId = accountInfo.client_id ?? this.clientId;
      if (!discoveredTier && accountInfo.tier) {
        try {
          discoveredTier = normalizeBlinkTier(accountInfo.tier);
          if (!discoveredTier) {
            throw new Error('Invalid Blink account tier');
          }
          this.applyTier(discoveredTier);
        } catch {
          discoveredTier = null;
          this.config.logger?.warn(
            'Blink account info returned an invalid tier. Continuing with the bootstrap tier.',
          );
        }
      }
    }

    this.auth.setAccountMetadata({
      accountId: this.accountId,
      clientId: this.clientId,
      region: accountInfo?.region,
      tier: discoveredTier
        ?? (options.useProductionBootstrap ? undefined : this.config.tier ?? 'prod'),
      email: accountInfo?.email,
    });

    if (accountInfo?.client_verification_required) {
      this.logDebug('syncAccountInfoAndVerify → client verification required');
      await this.handleClientVerification(accountInfo);
    }

    if (accountInfo?.phone_verification_required || accountInfo?.account_verification_required) {
      this.logDebug('syncAccountInfoAndVerify → account/phone verification required');
      await this.handleAccountVerification(accountInfo);
    }
    if (options.persistMetadata ?? true) {
      await this.auth.persistCurrentState();
    }
    this.logDebug('syncAccountInfoAndVerify → complete');
  }

  private async handleClientVerification(accountInfo: BlinkAccountInfo): Promise<void> {
    const log = this.config.logger;
    const code = this.config.authLocked ? undefined : this.config.clientVerificationCode;

    if (this.config.authLocked && this.config.clientVerificationCode) {
      this.logDebug('handleClientVerification → authLocked=true, ignoring stored clientVerificationCode');
    }

    if (!code) {
      await this.requestClientVerificationPin();
      log?.warn('Blink client verification required. A verification code has been sent.');
      log?.warn('Add "clientVerificationCode" to your Homebridge config and restart.');
      throw new BlinkRestVerificationRequiredError('client');
    }

    const trustDevice = this.config.trustDevice ?? true;
    const trustDeviceEnabled = accountInfo.trust_device_enabled ?? true;
    await this.verifyClientVerificationPin(code, trustDeviceEnabled, trustDevice);
    log?.info('Blink client verification successful.');
  }

  private async handleAccountVerification(accountInfo: BlinkAccountInfo): Promise<void> {
    const log = this.config.logger;
    const code = this.config.authLocked ? undefined : this.config.accountVerificationCode;
    const requiredLabels: string[] = [];

    if (this.config.authLocked && this.config.accountVerificationCode) {
      this.logDebug('handleAccountVerification → authLocked=true, ignoring stored accountVerificationCode');
    }
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
      throw new BlinkRestVerificationRequiredError('account');
    }

    const response = await this.verifyAccountVerificationPin(code);
    if (!response.valid) {
      log?.warn('Blink account verification failed. Request a new code and try again.');
      throw new BlinkRestVerificationRequiredError(
        'account',
        'Blink account verification failed',
      );
    }
    if (response.require_new_pin) {
      log?.warn('Blink requires a new verification PIN. Request another code and retry.');
      throw new BlinkRestVerificationRequiredError(
        'account',
        'Blink account verification requires a new PIN',
      );
    }

    log?.info('Blink account verification successful.');
  }

  private updateBaseUrls(): void {
    this.http.setBaseUrl(getRestBaseUrl(this.config));
    this.sharedHttp.setBaseUrl(getSharedRestBaseUrl(this.config));
    this.sharedRootHttp.setBaseUrl(getSharedRestRootUrl(this.config));
  }

  private applyTier(tier: string): void {
    const previousTier = this.config.tier ?? 'prod';
    const previousSharedTier = this.config.sharedTier;
    this.config.tier = tier;
    if (!previousSharedTier || previousSharedTier === previousTier) {
      this.config.sharedTier = tier;
    }
    this.updateBaseUrls();
    if (tier !== previousTier) {
      this.config.logger?.info(`Blink tier updated from ${previousTier} to ${tier}.`);
    }
  }

  private async syncTierInfo(useProductionBootstrap: boolean): Promise<BlinkTierInfo | null> {
    const log = this.config.logger;
    const configuredTier = normalizeBlinkTier(this.config.tier) ?? 'prod';
    const usesOrdinaryProductionTier = BLINK_PRODUCTION_BOOTSTRAP_TIERS.some(
      (tier) => tier === configuredTier,
    );
    const bootstrapTiers = useProductionBootstrap
      ? usesOrdinaryProductionTier
        ? BLINK_PRODUCTION_BOOTSTRAP_TIERS
        : [configuredTier]
      : [configuredTier];

    for (const [index, bootstrapTier] of bootstrapTiers.entries()) {
      if (useProductionBootstrap) {
        this.applyTier(bootstrapTier);
      }
      try {
        const tierInfo = await this.getTierInfo();
        this.logDebug('syncTierInfo → received tier info');
        if (!tierInfo?.tier) {
          return tierInfo ?? null;
        }
        const normalizedTier = normalizeBlinkTier(tierInfo.tier);
        if (!normalizedTier) {
          return tierInfo ?? null;
        }
        this.applyTier(normalizedTier);
        this.auth.setAccountMetadata({
          accountId: tierInfo.account_id,
          tier: normalizedTier,
        });
        return tierInfo;
      } catch (error) {
        const hasAnotherProductionRegion = useProductionBootstrap
          && index < bootstrapTiers.length - 1;
        if (
          hasAnotherProductionRegion
          && error instanceof BlinkHttpError
          && error.status === 406
        ) {
          this.logDebug('syncTierInfo → production-region bootstrap rejected; trying next');
          continue;
        }
        log?.warn('Failed to fetch Blink tier info. Continuing with the bootstrap tier.');
        return null;
      }
    }

    return null;
  }

  /**
   * Get account info with verification flags.
   * Source: API Dossier Section 3.9 - GET v2/users/info
   */
  async getAccountInfo(): Promise<BlinkAccountInfo> {
    await this.auth.ensureValidToken();
    const info = await this.http.get<BlinkAccountInfo>('v2/users/info');
    if (!info || typeof info !== 'object') throw new Error('Blink returned invalid account metadata.');
    if (info.account_id !== undefined) requireRemoteId(info.account_id);
    if (info.client_id !== undefined) requireRemoteId(info.client_id);
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
  async getHomescreen(options?: RequestOptions & { retryTransient?: boolean }): Promise<BlinkHomescreen> {
    checkRequestBudget(options);
    await withinRequestBudget(this.auth.ensureValidToken(), options);
    checkRequestBudget(options);
    this.accountId = this.accountId ?? this.auth.getAccountId();
    const accountId = await withinRequestBudget(this.ensureAccountId(), options);
    for (let attempt = 0; ; attempt++) {
      checkRequestBudget(options);
      try {
        const path = `v4/accounts/${accountId}/homescreen`;
        const homescreen = await withinRequestBudget(options
          ? this.sharedHttp.get<BlinkHomescreen>(path, options)
          : this.sharedHttp.get<BlinkHomescreen>(path), options);
        validateHomescreen(homescreen);
        this.accountId = homescreen.account?.account_id ?? accountId;
        return homescreen;
      } catch (error) {
        const transientCodes = ['UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'UND_ERR_SOCKET'];
        if (attempt !== 0 || !options?.retryTransient || !(error instanceof BlinkHttpError)
          || error.failure !== 'network' || !transientCodes.includes(error.networkDiagnostic?.code ?? '')) throw error;
        await budgetedDelay(500 + Math.floor(Math.random() * 501), options);
      }
    }
  }

  /**
   * Arm a network (enable motion detection for all devices)
   * Source: API Dossier Section 3.7 - POST v1/accounts/{account_id}/networks/{networkId}/state/arm
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/network/NetworkApi.smali
   */
  async armNetwork(networkId: number, options?: RequestOptions): Promise<BlinkCommandResponse> {
    requireRemoteId(networkId);
    return this.queueStateCommand('Network', async execution => {
      const accountId = await withinRequestBudget(this.ensureAccountId(), execution);
      const response = await this.sharedHttp.post<BlinkCommandResponse>(`v1/accounts/${accountId}/networks/${networkId}/state/arm`, undefined, [409], execution);
      await this.completeRemoteCommand(networkId, response, execution);
      return response;
    }, [1000, 2000, 4000], async execution => ({ resolved: await this.networkReachedState(networkId, true, execution), value: {} }), options);
  }

  /**
   * Disarm a network (disable motion detection for all devices)
   * Source: API Dossier Section 3.7 - POST v1/accounts/{account_id}/networks/{network_id}/state/disarm
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/network/NetworkApi.smali
   */
  async disarmNetwork(networkId: number, options?: RequestOptions): Promise<BlinkCommandResponse> {
    requireRemoteId(networkId);
    return this.queueStateCommand('Network', async execution => {
      const accountId = await withinRequestBudget(this.ensureAccountId(), execution);
      const response = await this.sharedHttp.post<BlinkCommandResponse>(`v1/accounts/${accountId}/networks/${networkId}/state/disarm`, undefined, [409], execution);
      await this.completeRemoteCommand(networkId, response, execution);
      return response;
    }, [1000, 2000, 4000], async execution => ({ resolved: await this.networkReachedState(networkId, false, execution), value: {} }), options);
  }

  private setDeviceMotion(type: 'camera' | 'owl' | 'doorbell', networkId: number, deviceId: number,
    enabled: boolean, options?: RequestOptions): Promise<void> {
    requireRemoteId(networkId);
    requireRemoteId(deviceId);
    return this.queueStateCommand('Motion', async execution => {
      const accountId = await withinRequestBudget(this.ensureAccountId(), execution);
      checkRequestBudget(execution);
      const kind = type === 'camera' ? 'cameras' : type === 'owl' ? 'owls' : 'doorbells';
      const prefix = type === 'camera' ? '' : 'v1/';
      const http = type === 'camera' ? this.sharedRootHttp : this.sharedHttp;
      const response = await http.post<BlinkCommandResponse>(`${prefix}accounts/${accountId}/networks/${networkId}/${kind}/${deviceId}/${enabled ? 'enable' : 'disable'}`,
        undefined, [409], execution);
      await this.completeRemoteCommand(networkId, response, execution);
    }, [500, 1000], execution => this.motionReachedState(type, networkId, deviceId, enabled, execution), options);
  }

  /**
   * Enable motion detection for a camera
   * Source: API Dossier Section 3.3 - POST accounts/{account_id}/networks/{network}/cameras/{camera}/enable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/CameraApi.smali
   * Note: No version prefix - uses root URL (without /api/)
   */
  async enableCameraMotion(networkId: number, cameraId: number, options?: RequestOptions): Promise<void> {
    return this.setDeviceMotion('camera', networkId, cameraId, true, options);
  }

  /**
   * Disable motion detection for a camera
   * Source: API Dossier Section 3.3 - POST accounts/{account_id}/networks/{network}/cameras/{camera}/disable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/CameraApi.smali
   * Note: No version prefix - uses root URL (without /api/)
   */
  async disableCameraMotion(networkId: number, cameraId: number, options?: RequestOptions): Promise<void> {
    return this.setDeviceMotion('camera', networkId, cameraId, false, options);
  }

  /**
   * Enable motion detection for a doorbell
   * Source: API Dossier Section 3.5 - POST v1/accounts/{account_id}/networks/{network}/doorbells/{lotus}/enable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.smali
   */
  async enableDoorbellMotion(networkId: number, doorbellId: number, options?: RequestOptions): Promise<void> {
    return this.setDeviceMotion('doorbell', networkId, doorbellId, true, options);
  }

  /**
   * Disable motion detection for a doorbell
   * Source: API Dossier Section 3.5 - POST v1/accounts/{account_id}/networks/{network}/doorbells/{lotus}/disable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.smali
   */
  async disableDoorbellMotion(networkId: number, doorbellId: number, options?: RequestOptions): Promise<void> {
    return this.setDeviceMotion('doorbell', networkId, doorbellId, false, options);
  }

  /**
   * Enable motion detection for an owl (Mini camera)
   * Source: API Dossier Section 3.4 - POST v1/accounts/{account_id}/networks/{networkId}/owls/{owlId}/enable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/wired/OwlApi.smali
   */
  async enableOwlMotion(networkId: number, owlId: number, options?: RequestOptions): Promise<void> {
    return this.setDeviceMotion('owl', networkId, owlId, true, options);
  }

  /**
   * Disable motion detection for an owl (Mini camera)
   * Source: API Dossier Section 3.4 - POST v1/accounts/{account_id}/networks/{networkId}/owls/{owlId}/disable
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/wired/OwlApi.smali
   */
  async disableOwlMotion(networkId: number, owlId: number, options?: RequestOptions): Promise<void> {
    return this.setDeviceMotion('owl', networkId, owlId, false, options);
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

  private captureThumbnail(type: 'camera' | 'owl' | 'doorbell', networkId: number, deviceId: number,
    options?: RequestOptions): Promise<BlinkCaptureResult> {
    requireRemoteId(networkId);
    requireRemoteId(deviceId);
    return this.queueStateCommand('Capture', async execution => {
      const accountId = await withinRequestBudget(this.ensureAccountId(), execution);
      checkRequestBudget(execution);
      const kind = type === 'camera' ? 'cameras' : type === 'owl' ? 'owls' : 'doorbells';
      const prefix = type === 'camera' ? '' : 'v1/';
      const http = type === 'camera' ? this.sharedRootHttp : this.sharedHttp;
      let response: BlinkCommandResponse = {};
      let captureOutcome: BlinkCaptureResult['captureOutcome'] = 'completed';
      try {
        response = await http.post<BlinkCommandResponse>(`${prefix}accounts/${accountId}/networks/${networkId}/${kind}/${deviceId}/thumbnail`, undefined, [409], execution);
        await this.completeRemoteCommand(networkId, response, execution, 1);
      } catch (error) {
        if (!(error instanceof BlinkHttpError) || error.failure !== 'http' || error.status !== 409) throw error;
        captureOutcome = 'existing-thumbnail';
      }
      const homescreen = await this.getHomescreen(execution);
      const devices = type === 'camera' ? homescreen.cameras : type === 'owl' ? homescreen.owls : homescreen.doorbells;
      const device = devices.find(device => device.id === deviceId && device.network_id === networkId);
      if (!device) throw new Error('Blink camera unavailable after capture.');
      return { ...response, captureOutcome, thumbnail: device.thumbnail };
    }, [], undefined, options);
  }

  /**
   * Request thumbnail capture for a camera
   * Source: API Dossier Section 3.3 - POST accounts/{account_id}/networks/{network}/cameras/{camera}/thumbnail
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/CameraApi.smali
   * Note: No version prefix - uses root URL (without /api/)
   */
  async requestCameraThumbnail(networkId: number, cameraId: number, options?: RequestOptions): Promise<BlinkCaptureResult> {
    return this.captureThumbnail('camera', networkId, cameraId, options);
  }

  /**
   * Request thumbnail capture for an owl (Mini camera)
   * Source: API Dossier Section 3.4 - POST v1/accounts/{account_id}/networks/{networkId}/owls/{owlId}/thumbnail
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/wired/OwlApi.smali
   */
  async requestOwlThumbnail(networkId: number, owlId: number, options?: RequestOptions): Promise<BlinkCaptureResult> {
    return this.captureThumbnail('owl', networkId, owlId, options);
  }

  /**
   * Request thumbnail capture for a doorbell
   * Source: API Dossier Section 3.5 - POST v1/accounts/{account_id}/networks/{network}/doorbells/{lotus}/thumbnail
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.smali
   */
  async requestDoorbellThumbnail(networkId: number, doorbellId: number, options?: RequestOptions): Promise<BlinkCaptureResult> {
    return this.captureThumbnail('doorbell', networkId, doorbellId, options);
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
    requireRemoteId(networkId);
    requireRemoteId(cameraId);
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
    requireRemoteId(networkId);
    requireRemoteId(owlId);
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
    requireRemoteId(networkId);
    requireRemoteId(doorbellId);
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
   * Note: No version prefix - uses root URL (without /api/)
   */
  async getCommandStatus(networkId: number, commandId: number, options?: RequestOptions): Promise<BlinkCommandStatus> {
    requireRemoteId(networkId);
    requireRemoteId(commandId);
    const accountId = await this.ensureAccountId();
    return this.sharedRootHttp.get<BlinkCommandStatus>(
      `accounts/${accountId}/networks/${networkId}/commands/${commandId}`,
      options,
    );
  }

  /**
   * Poll command status until complete
   * Source: API Dossier Section 3.10 - GET /accounts/{account_id}/networks/{network}/commands/{command}
   * Evidence: smali_classes9/com/immediasemi/blink/common/device/network/command/CommandApi.smali
   */
  async pollCommand(
    networkId: number,
    commandId: number,
    maxAttempts = 10,
    fallbackIntervalSeconds = 5,
    options?: RequestOptions,
  ): Promise<BlinkCommandStatus> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      checkRequestBudget(options);
      const status = await withinRequestBudget(this.getCommandStatus(networkId, commandId, options), options);

      if (status.complete || status.status === 'complete') {
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(`Blink command ${commandId} failed`);
      }

      const delayMs = (status.polling_interval ?? fallbackIntervalSeconds) * 1000;
      await budgetedDelay(delayMs, options);
    }

    throw new Error(`Blink command ${commandId} timed out after ${maxAttempts} attempts`);
  }

  /**
    * Update an onboarding/status command
   * Source: API Dossier Section 3.10 - POST /accounts/{account_id}/networks/{network}/commands/{command}/update
   * Note: No version prefix - uses root URL (without /api/)
    *
    * Returns null if the command no longer exists (404).
   */
  async updateCommand(networkId: number, commandId: number): Promise<BlinkCommandStatus | null> {
    requireRemoteId(networkId);
    requireRemoteId(commandId);
    const accountId = await this.ensureAccountId();
    try {
      return await this.sharedRootHttp.post<BlinkCommandStatus>(
        `accounts/${accountId}/networks/${networkId}/commands/${commandId}/update`,
        undefined,
        [404],
      );
    } catch (error) {
      // The command may have already ended - this is normal when stream closes
      if (error instanceof BlinkHttpError && error.status === 404) {
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
  async completeCommand(networkId: number, commandId: number, options?: RequestOptions): Promise<BlinkCommandStatus | null> {
    requireRemoteId(networkId);
    requireRemoteId(commandId);
    checkRequestBudget(options);
    const accountId = await withinRequestBudget(this.ensureAccountId(), options);
    try {
      return await this.sharedRootHttp.post<BlinkCommandStatus>(
        `accounts/${accountId}/networks/${networkId}/commands/${commandId}/done`,
        undefined,
        [404],
        options,
      );
    } catch (error) {
      // The /done endpoint was deprecated by Blink and now returns 404
      // Silently ignore this error as the endpoint is no longer functional
      if (error instanceof BlinkHttpError && error.status === 404) {
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

    requireRemoteId(accountId);
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

    requireRemoteId(clientId);
    this.auth.setClientId(clientId);
    return clientId;
  }
}
