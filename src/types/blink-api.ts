/**
 * Blink API Type Definitions
 *
 * All types derived from reverse engineering Blink Home Monitor Android APK v51.0
 * Source: API Dossier - /base-apk/docs/api_dossier.md
 */

/**
 * OAuth token response from Blink authentication API
 * Source: API Dossier Section 2.1 (OAuth Flow) / OauthApi.smali
 */
export interface BlinkOAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
  scope: string;
  account_id?: number;
  client_id?: number;
  region?: string;
  tier?: string;
}

/**
 * Persisted authentication state for Blink sessions.
 */
export interface BlinkAuthState {
  accessToken: string;
  refreshToken?: string | null;
  tokenAuth?: string | null;
  tokenExpiry?: string | null;
  accountId?: number | null;
  clientId?: number | null;
  region?: string | null;
  tier?: string | null;
  email?: string | null;
  hardwareId?: string | null;
  updatedAt?: string | null;
}

/**
 * Storage adapter for persisting auth state across restarts.
 */
export interface BlinkAuthStorage {
  load(): Promise<BlinkAuthState | null>;
  save(state: BlinkAuthState): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Blink user account information
 * Source: API Dossier Section 3.9 (homescreen response)
 */
export interface BlinkAccount {
  account_id: number;
  client_id?: number;
  country?: string;
  timezone?: string;
  region?: string;
}

/**
 * Account info response from v2/users/info.
 * Includes verification flags for first-time device login.
 */
export interface BlinkAccountInfo {
  account_id: number;
  client_id?: number;
  email?: string;
  region?: string;
  tier?: string;
  account_verification_required?: boolean;
  phone_verification_required?: boolean;
  client_verification_required?: boolean;
  trust_device_enabled?: boolean;
  allow_pin_resend_seconds?: number;
  verification_channel?: string;
  phone_verification_channel?: string;
}

/**
 * Tier info response from v1/users/tier_info.
 */
export interface BlinkTierInfo {
  account_id: number;
  tier: string;
}

/**
 * Blink network (Sync Module grouping) - represents an armed/disarmed unit
 * Source: API Dossier Section 3.7 (Network & Arm/Disarm) / NetworkApi.smali
 */
export interface BlinkNetwork {
  id: number;
  name: string;
  armed: boolean;
  timezone?: string;
  oneways?: boolean;
  lv_save?: boolean;
  camera_count?: number;
}

/**
 * Blink Sync Module device
 * Source: API Dossier Section 3.6 (Sync Module & Local Storage) / SyncModuleApi.smali
 */
export interface BlinkSyncModule {
  id: number;
  network_id: number;
  status: string;
  name?: string;
  serial?: string;
  fw_version?: string;
  local_storage_enabled?: boolean;
  local_storage_compatible?: boolean;
}

/**
 * Blink camera device (traditional Blink cameras via Sync Module)
 * Source: API Dossier Section 3.3 (Camera Operations) / CameraApi.smali
 */
export interface BlinkCamera {
  id: number;
  network_id: number;
  name: string;
  enabled: boolean;
  status?: string;
  serial?: string;
  fw_version?: string;
  type?: string;
  thumbnail?: string;
  created_at?: string;
  updated_at?: string;
  battery?: string;
  signals?: BlinkSignals;
  motion_detected?: boolean;
  temperature?: number;
}

/**
 * Blink video doorbell device
 * Source: API Dossier Section 3.5 (Doorbell Operations) / DoorbellApi.smali
 */
export interface BlinkDoorbell {
  id: number;
  network_id: number;
  name: string;
  enabled: boolean;
  status?: string;
  serial?: string;
  fw_version?: string;
  thumbnail?: string;
  created_at?: string;
  updated_at?: string;
  battery?: string;
  signals?: BlinkSignals;
  motion_detected?: boolean;
  chime_enabled?: boolean;
}

/**
 * Blink Owl device (Mini camera - WiFi direct, no Sync Module required)
 * Source: API Dossier Section 3.4 (Owl Operations) / OwlApi.smali
 */
export interface BlinkOwl {
  id: number;
  network_id: number;
  name: string;
  enabled: boolean;
  status?: string;
  serial?: string;
  fw_version?: string;
  thumbnail?: string;
  created_at?: string;
  updated_at?: string;
  battery?: string;
  signals?: BlinkSignals;
  motion_detected?: boolean;
}

/**
 * Device signal strength information
 */
export interface BlinkSignals {
  wifi?: number;
  lfr?: number;
  battery?: string;
  temp?: number;
}

/**
 * Homescreen API response containing all account devices
 * Source: API Dossier Section 3.9 (Media & Video) - GET v4/accounts/{account_id}/homescreen
 */
export interface BlinkHomescreen {
  networks: BlinkNetwork[];
  sync_modules: BlinkSyncModule[];
  cameras: BlinkCamera[];
  owls: BlinkOwl[];
  doorbells: BlinkDoorbell[];
  account: BlinkAccount;
}

/**
 * Response from arm/disarm and other async commands
 * Source: API Dossier Section 3.10 (Commands & Polling) / CommandApi.smali
 */
export interface BlinkCommandResponse {
  command_id: number;
  server?: string;
  network_id?: number;
}

/**
 * Command polling status response
 * Source: API Dossier Section 3.10 - GET /accounts/{account_id}/networks/{network}/commands/{command}
 */
export interface BlinkCommandStatus {
  complete?: boolean;
  status?: 'complete' | 'running' | 'queued' | 'failed';
  status_msg?: string;
  polling_interval?: number;
  commands?: BlinkCommandResponse[];
}

/**
 * Live video session response
 * Source: API Dossier Section 4.2 (LiveVideoResponse Model) / LiveVideoResponse.smali
 */
export interface BlinkLiveVideoResponse {
  /** Live view command/session id */
  command_id?: number;
  /** Parent command id (multi-client live view) */
  parent_command_id?: number | null;
  /** RTSP(S) server URL */
  server: string;
  /** Video session id */
  video_id?: number;
  /** Media id for live view recordings */
  media_id?: number;
  /** Polling interval in seconds */
  polling_interval?: number;
  /** Session duration in seconds */
  duration?: number;
  /** Continue interval in seconds */
  continue_interval?: number;
  /** Continue warning in seconds */
  continue_warning?: number;
  /** Extended duration in seconds (subscription feature) */
  extended_duration?: number;
  /** Multi-client live view flag */
  is_mclv?: boolean;
  /** Live view type (e.g., "elv") */
  type?: string;
  /** Whether this client started the session */
  first_joiner?: boolean;
  /** JWT token for extended live view features */
  liveview_token?: string | null;
  /** Legacy fields observed in older responses */
  id?: number;
  parent_id?: number;
  poor_connection?: boolean;
  is_multi_client_live_view?: boolean;
}

/**
 * Media clip from motion detection
 * Source: API Dossier Section 3.9 - GET v4/accounts/{account_id}/media
 */
export interface BlinkMediaClip {
  id: number;
  camera_id: number;
  camera_name: string;
  network_id: number;
  network_name?: string;
  thumbnail: string;
  media: string;
  created_at: string;
  viewed?: boolean;
  deleted?: boolean;
  device_type?: 'camera' | 'owl' | 'doorbell';
}

/**
 * Media filters for POST /media
 */
export interface BlinkMediaFilters {
  types?: string[];
  deviceTypes?: string[];
  devices?: Record<string, number[]>;
}

export interface BlinkMediaQuery {
  startTime?: string;
  endTime?: string;
  paginationKey?: number | null;
  filters?: BlinkMediaFilters;
}

/**
 * Media list response
 * Source: API Dossier Section 3.9 - POST v4/accounts/{account_id}/media
 */
export interface BlinkMediaResponse {
  media: BlinkMediaClip[];
  limit?: number;
  purge_id?: number;
}

/**
 * Unwatched media count response
 * Source: API Dossier - GET v4/accounts/{account_id}/unwatched_media
 * Note: Returns only a count, not actual clips. Use getMedia() to fetch clips.
 */
export interface BlinkUnwatchedMediaResponse {
  unwatched_clips: number;
  unwatched_video_stats?: number;
}

/**
 * Response for resend/verification PIN flows.
 */
export interface BlinkResendPinResponse {
  message?: string;
  code?: number;
  allow_pin_resend_seconds?: number;
}

export interface BlinkPinVerificationResponse {
  message?: string;
  code?: number;
  verified?: boolean;
}

/**
 * Account/phone verification PIN resend response.
 */
export interface BlinkGeneratePinResponse {
  allow_pin_resend_seconds?: number;
  verification_channel?: string;
  phone_verification_channel?: string;
  message?: string;
  code?: number;
}

/**
 * Account/phone verification PIN verification response.
 */
export interface BlinkVerifyPinResponse {
  valid: boolean;
  token?: string | null;
  require_new_pin: boolean;
  code: number;
  message: string;
}

/**
 * Logger interface for diagnostic output
 * Compatible with Homebridge Logger
 */
export interface BlinkLogger {
  debug(message: string, ...parameters: unknown[]): void;
  info(message: string, ...parameters: unknown[]): void;
  warn(message: string, ...parameters: unknown[]): void;
  error(message: string, ...parameters: unknown[]): void;
}

/**
 * Plugin configuration
 * Source: API Dossier Section 2.1 (OAuth parameters) and Section 1.1 (Base URLs)
 */
export interface BlinkConfig {
  email: string;
  password: string;
  hardwareId: string;
  clientId?: 'android' | 'amazon';
  clientName?: string;
  twoFactorCode?: string;
  clientVerificationCode?: string;
  accountVerificationCode?: string;
  trustDevice?: boolean;
  authStoragePath?: string;
  authStorage?: BlinkAuthStorage;
  tier?: string;
  sharedTier?: string;
  /** Enable verbose auth diagnostics */
  debugAuth?: boolean;
  /** Logger for diagnostic output */
  logger?: BlinkLogger;
}

/**
 * HTTP methods used by the API
 */
export type HttpMethod = 'GET' | 'POST' | 'DELETE';

/**
 * Device types supported by Blink
 */
export type BlinkDeviceType = 'camera' | 'owl' | 'doorbell' | 'sync_module';

/**
 * OAuth v2 session state for Authorization Code + PKCE flow
 * Persisted during 2FA flow to allow resumption
 * Source: blinkpy/auth.py - _oauth_login_flow state management
 */
export interface BlinkOAuthSessionState {
  /** PKCE code verifier (needed for token exchange) */
  codeVerifier: string;
  /** PKCE code challenge (sent in authorize request) */
  codeChallenge: string;
  /** OAuth state parameter for CSRF protection */
  state: string;
  /** CSRF token from signin page */
  csrfToken?: string;
  /** Session cookies from OAuth flow */
  cookies?: string;
  /** Authorization code (after successful signin) */
  authorizationCode?: string;
  /** Timestamp when session was created */
  createdAt: string;
  /** Whether 2FA verification is required */
  requires2FA?: boolean;
  /** Phone number last 4 digits (for 2FA display) */
  phoneLastFour?: string;
}

/**
 * OAuth v2 token response
 * Different from legacy password grant response
 * Source: blinkpy - oauth_exchange_code_for_token response
 */
export interface BlinkOAuthV2TokenResponse {
  /** JWT access token */
  access_token: string;
  /** Refresh token for token renewal */
  refresh_token?: string;
  /** Token type (always "Bearer") */
  token_type: 'Bearer';
  /** Token lifetime in seconds */
  expires_in: number;
  /** OpenID scope (if requested) */
  scope?: string;
  /** ID token (OpenID Connect) */
  id_token?: string;
  /** Account ID */
  account_id?: number;
  /** Client ID */
  client_id?: number;
  /** Region code */
  region?: string;
  /** Tier environment */
  tier?: string;
}

/**
 * Error response when 2FA is required
 * Source: blinkpy - 2FA detection in signin flow
 */
export interface Blink2FARequiredResponse {
  /** Indicates 2FA is needed */
  two_factor_required: boolean;
  /** Message to display */
  message?: string;
  /** Phone number last 4 digits */
  phone_number_last_four?: string;
  /** Email for verification */
  email?: string;
  /** Time until PIN can be resent */
  allow_resend_seconds?: number;
}

/**
 * Response from 2FA verification
 * Source: blinkpy - oauth_verify_2fa response
 */
export interface Blink2FAVerifyResponse {
  /** Whether verification succeeded */
  success: boolean;
  /** Message */
  message?: string;
  /** Error code if failed */
  code?: number;
}

