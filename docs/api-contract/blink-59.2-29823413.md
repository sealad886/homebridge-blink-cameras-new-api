# Blink API Contract — Android 59.2

> Generated from `docs/api-contract/blink-59.2-29823413.json`. Do not edit endpoint tables by hand.

## Acquisition and provenance

- Package: `com.immediasemi.android.blink`
- Version: `59.2` (`29823413`)
- Base APK SHA-256: `b0ee9a502c059e80de09e31dfc3608f78b8d2a2ab9dc58ca35ec234bf0a4bcef`
- Evidence mode: `static-only`
- APK splits: 4; DEX files: 12
- JADX result: completed-with-errors; apktool result: completed

Static evidence describes client construction and declarations. It does not prove current server behavior or authorize live calls.

## Service, host, and interceptor map

| Service | Base host template | Active contracts | Authentication |
|---|---|---:|---|
| authentication | `https://rest-{tier}.immedia-semi.com/api/` | 2 | bearer |
| device-orchestration | `dynamic` | 9 | bearer |
| event-stream | `https://prod.eventstream.immedia-semi.com/` | 2 | optional-explicit |
| local-device | `http://172.16.97.199/` | 7 | local-none |
| oauth | `https://api.{env}oauth.blink.com/` | 2 | none |
| public-rest | `https://rest-{tier}.immedia-semi.com/api/` | 10 | none |
| rest | `https://rest-{tier}.immedia-semi.com/api/` | 145 | unresolved |
| shared-rest | `https://rest-{shared_tier}.immedia-semi.com/api/` | 141 | bearer |

Default headers: `APP-BUILD`, `User-Agent`, `LOCALE`, `X-Blink-Time-Zone`. URL rewriting tokens: `{tier}`, `{shared_tier}`, `{env}`, `{injected_account_id}`, `{injected_client_id}`.

## Authentication cascade

Normal hosted authorization and `oauth/token` exchange remain the primary sign-in path. Authenticated REST clients attach the persisted bearer token and may conditionally attach `TOKEN-AUTH` when registration-token state exists. On authenticated-host HTTP 401, the Blink authenticator can refresh and rebuild the request. Blink 59.2 adds OTP verification and WebAuthn registration as an optional post-login passkey enrollment path; it does not replace the established token exchange or refresh contracts.

## Endpoint catalog

### authentication

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| POST | `2fa/v1/webauthn/registration` | PasskeyRegistration | bearer | RegistrationRequest | RegistrationResponse | added | direct | `com/immediasemi/blink/passkey/PasskeyRegistrationApi.java:17` |
| POST | `2fa/v1/webauthn/registration/verify` | PasskeyRegistration | bearer | VerifyRegistrationRequest | Unit | added | direct | `com/immediasemi/blink/passkey/PasskeyRegistrationApi.java:20` |

### device-orchestration

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| GET | `device_info/v4/devices` | Rdis | bearer | — | RdisDevicesResponse | unchanged | direct | `com/immediasemi/blink/common/device/rdis/RdisApi.java:20` |
| GET | `device_info/v4/devices/{deviceId}` | Rdis | bearer | — | RdisDeviceSettingsResponse | added | direct | `com/immediasemi/blink/common/device/rdis/RdisApi.java:17` |
| POST | `device_info/v4/devices/operations` | Rdis | bearer | RdisOperationsBody | RdisOperationsResponse | unchanged | direct | `com/immediasemi/blink/common/device/rdis/RdisApi.java:23` |
| PUT | `duos/v1/devices/{deviceId}/update` | DeviceUpdateOrchestrationService | bearer | DeviceEntityUpdateRequest | Unit | unchanged | direct | `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceApi.java:16` |
| PUT | `duos/v1/devices/{deviceId}/update` | DeviceUpdateOrchestrationService | bearer | DeviceMotionSettingsUpdateRequest | Unit | changed | direct | `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceApi.java:22` |
| PUT | `duos/v1/devices/{deviceId}/update` | DeviceUpdateOrchestrationService | bearer | DevicePrivacySettingsUpdateRequest | Unit | changed | direct | `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceApi.java:25` |
| PUT | `duos/v1/devices/update` | DeviceUpdateOrchestrationService | bearer | DeviceBulkUpdateRequest | DeviceBulkUpdateResponse | unchanged | direct | `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceApi.java:19` |
| GET | `v1/devices` | KnownFacesRdis | bearer | — | RdisResponse | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/optin/KnownFacesRdisApi.java:18` |
| PATCH | `v1/devices/{id}/configurations` | KnownFacesRdis | bearer | UpdateDeviceConfigurationRequest | Unit | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/optin/KnownFacesRdisApi.java:21` |

### event-stream

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| POST | `1.0.0/batch/client.device/{appSubGroup}` | EventStream | optional-explicit | RequestBody | Unit | unchanged | direct | `com/ring/android/eventstream/storage/api/EventStreamApi.java:17` |
| POST | `1.0.0/event/client.device/{appSubGroup}` | EventStream | optional-explicit | RequestBody | Unit | unchanged | direct | `com/ring/android/eventstream/storage/api/EventStreamApi.java:20` |

### local-device

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| GET | `api/get_fw_version` | SyncModuleService | local-none | — | GetFirmwareEndpointResponse | unchanged | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:30` |
| GET | `api/logs` | SyncModuleService | local-none | — | ResponseBody | unchanged | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:33` |
| POST | `api/set/app_fw_update` | SyncModuleService | local-none | RequestBody | Unit | unchanged | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:42` |
| POST | `api/set/key` | SyncModuleService | local-none | RequestBody | Unit | unchanged | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:45` |
| POST | `api/set/ssid` | SyncModuleService | local-none | SetSSIDBody | Unit | unchanged | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:48` |
| GET | `api/ssids` | SyncModuleService | local-none | — | AccessPoints | unchanged | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:36` |
| GET | `api/version` | SyncModuleService | local-none | — | Unit | unchanged | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:39` |

### oauth

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| POST | `oauth/token` | Oauth | none | — | RefreshTokensResponse | unchanged | direct | `com/immediasemi/blink/common/account/auth/OauthApi.java:22` |
| POST | `oauth/v2/verify_otp` | PasskeyOauth | none | — | VerifyOtpResponse | added | direct | `com/immediasemi/blink/passkey/PasskeyOauthApi.java:16` |

### public-rest

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| GET | `apphelp.immedia-semi.com/link-manifest.json` | Public | none | — | LinkManifest | unchanged | direct | `com/immediasemi/blink/common/network/PublicApi.java:22` |
| GET | `regions` | Public | none | — | RegionsResponse | unchanged | direct | `com/immediasemi/blink/common/network/PublicApi.java:25` |
| GET | `v1/countries` | Public | none | — | CountriesResponse | unchanged | direct | `com/immediasemi/blink/common/network/PublicApi.java:19` |
| GET | `v1/version` | Public | none | — | AppVersionCheckResponse | unchanged | direct | `com/immediasemi/blink/common/network/PublicApi.java:16` |
| POST | `v3/users/validate_email` | Auth | none | ValidateEmailPostBody | ValidationResponse | unchanged | direct | `com/immediasemi/blink/common/account/auth/AuthApi.java:16` |
| POST | `v3/users/validate_password` | Auth | none | ValidatePasswordPostBody | ValidationResponse | unchanged | direct | `com/immediasemi/blink/common/account/auth/AuthApi.java:19` |
| POST | `v4/users/password_change` | PasswordReset | none | ResetPasswordPostBody | Unit | unchanged | direct | `com/immediasemi/blink/account/password/PasswordResetApi.java:18` |
| POST | `v4/users/password_change/pin/generate` | PasswordReset | none | GeneratePinPostBody | GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/account/password/PasswordResetApi.java:21` |
| POST | `v4/users/password_change/pin/verify` | PasswordReset | none | VerifyPinPostBody | VerifyPinResponse | unchanged | direct | `com/immediasemi/blink/account/password/PasswordResetApi.java:24` |
| POST | `v7/users/register` | Auth | none | RegisterBody | AuthenticationResponse | unchanged | direct | `com/immediasemi/blink/common/account/auth/AuthApi.java:13` |

### rest

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| GET | `@Url` | Blueprint | unresolved | — | — | unchanged | corroborated | `smali_classes2/com/ring/reapp/blueprint/api/BlueprintApi.smali:53` |
| POST | `@Url` | Blueprint | unresolved | — | — | unchanged | corroborated | `smali_classes2/com/ring/reapp/blueprint/api/BlueprintApi.smali:79` |
| POST | `app/logs/upload` | Log | bearer | LogsBody | Unit | unchanged | direct | `com/immediasemi/blink/common/log/LogApi.java:16` |
| GET | `blink/clients_api/links/v1/locations/{locationId}/devices/{deviceId}/links?ignore_rbac=true&include_deactivated=false` | LinkDevice | bearer | — | DeviceLinksResponse | unchanged | direct | `com/immediasemi/blink/device/setting/linkdevice/data/LinkDeviceApi.java:29` |
| DELETE | `blink/clients_api/links/v1/locations/{locationId}/devices/{deviceId}/links/{linkId}?ignore_rbac=true&include_deactivated=false` | LinkDevice | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/device/setting/linkdevice/data/LinkDeviceApi.java:26` |
| POST | `blink/clients_api/links/v1/locations/{locationId}/events/{event}/receivers?ignore_rbac=true&include_deactivated=false` | LinkDevice | bearer | CreateLinkRequest | CreateLinkResponse | unchanged | direct | `com/immediasemi/blink/device/setting/linkdevice/data/LinkDeviceApi.java:23` |
| POST | `clients_api/setups` | SetupOrchestrationService | bearer | SosSetupPostBody | SosSetupResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:44` |
| GET | `clients_api/setups/{setupId}` | SetupOrchestrationService | bearer | — | SosDeviceSetupStatusResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:38` |
| POST | `clients/{injected_client_id}/update` | Client | bearer | ClientUpdatePostBody | Unit | unchanged | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:26` |
| GET | `device_info/v4/devices/{deviceId}` | SetupOrchestrationService | bearer | — | ChimeAccessoryConfigInfoResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:26` |
| GET | `device_info/v4/devices/{deviceId}/configurations` | SetupOrchestrationService | bearer | — | DeviceConfigurationsResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:29` |
| GET | `device_info/v4/devices/{deviceId}/status` | SetupOrchestrationService | bearer | — | SosDeviceOtaStatusResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:32` |
| PATCH | `devices/{deviceId}` | Commands | bearer | RequestBody | Unit | added | direct | `com/ring/blueprints/setup/core/data/backend/CommandsApi.java:16` |
| DELETE | `devices/v1/devices/{deviceId}` | SetupOrchestrationService | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:23` |
| PATCH | `devices/v1/devices/{deviceId}` | DeviceRegistry | bearer | DeviceRegistryPatchBody | Unit | changed | direct | `com/immediasemi/blink/common/device/registry/DeviceRegistryApi.java:17` |
| PATCH | `devices/v1/devices/{deviceId}` | SetupOrchestrationService | bearer | UpdateSosDeviceBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:47` |
| GET | `devices/v2/locations` | LocationsCore | bearer | — | ResponseBody | unchanged | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:31` |
| DELETE | `dings/{dingId}` | Clients | bearer | — | Unit | unchanged | direct | `com/ringapp/orchestratorapi/data/ClientsApi.java:16` |
| DELETE | `dings/{dingId}/favorite` | Clients | bearer | — | Unit | unchanged | direct | `com/ringapp/orchestratorapi/data/ClientsApi.java:22` |
| PUT | `dings/{dingId}/favorite` | Clients | bearer | — | Unit | unchanged | direct | `com/ringapp/orchestratorapi/data/ClientsApi.java:19` |
| POST | `duos/v1/locations` | LocationsCore | bearer | PutLocationRequest | LocationBody | unchanged | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:46` |
| DELETE | `duos/v1/locations/{locationId}` | LocationsCore | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:27` |
| PATCH | `duos/v1/locations/{locationId}` | LocationsCore | bearer | UpdateLocationRequest | LocationBody | unchanged | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:39` |
| GET | `ees/v2/history/extendedsearchmetadata` | TimelineOrchestrator | bearer | — | OrchestratorSearchMetadataResponse | unchanged | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:130` |
| DELETE | `evm/v2/dings` | TimelineOrchestrator | bearer | — | Unit | unchanged | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:121` |
| POST | `evm/v2/events` | TimelineOrchestrator | bearer | DeleteMultipleEventsRequest | Unit | added | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:90` |
| DELETE | `evm/v2/events/associations/{profile_Id}` | TimelineOrchestrator | bearer | — | Unit | unchanged | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:118` |
| DELETE | `evm/v2/events/time-based-deletion/{source_id}` | TimelineOrchestrator | bearer | — | Unit | unchanged | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:124` |
| POST | `evm/v2/events/watch` | TimelineOrchestrator | bearer | WatchEventsRequest | Unit | added | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:115` |
| GET | `evm/v2/history/devices` | TimelineOrchestrator | bearer | — | OrchestratorItemsResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:104` |
| GET | `evm/v2/history/events/{eventId}` | TimelineOrchestrator | bearer | — | OrchestratorEventResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:100` |
| POST | `evm/v2/history/extendedsearch` | TimelineOrchestrator | bearer | OrchestratorExtendedSearchRequestBody | OrchestratorItemsResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:127` |
| GET | `evm/v2/history/unwatched/count` | TimelineOrchestrator | bearer | — | UnwatchedCountResponse | added | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:96` |
| GET | `evm/v2/metadata/history/devices` | TimelineOrchestrator | bearer | — | OrchestratorItemsResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:93` |
| GET | `evm/v2/timeline/24/devices/{source_id}` | TimelineOrchestrator | bearer | — | Orchestrator24x7TimelineResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:133` |
| GET | `evm/v2/timeline/devices/{doorbotId}` | TimelineOrchestrator | bearer | — | OrchestratorTimelineResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:141` |
| GET | `evm/v2/timeline/events/eventito/{source_id}` | TimelineOrchestrator | bearer | — | OrchestratorEventResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:137` |
| GET | `evm/v3/history/devices` | TimelineOrchestrator | bearer | — | OrchestratorFeedResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:112` |
| POST | `evm/v3/history/events` | TimelineOrchestrator | bearer | OrchestratorBatchRequestBody | OrchestratorEventResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:108` |
| GET | `factory_profile` | SetupClients | bearer | — | ApiFactoryDeviceProfile | unchanged | direct | `com/ring/blueprints/setup/core/data/backend/SetupClientsApi.java:15` |
| GET | `fms/device-firmware` | DeviceFirmware | bearer | — | DeviceFirmwareResponse | unchanged | direct | `com/ring/blueprints/setup/core/data/backend/DeviceFirmwareApi.java:14` |
| GET | `geocoding/v1/auto-complete` | Geocoding | bearer | — | AutoCompleteResponse | unchanged | direct | `com/immediasemi/blink/location/api/GeocodingApi.java:30` |
| GET | `geocoding/v1/auto-complete/details` | Geocoding | bearer | — | LocationDetailsResponse | unchanged | direct | `com/immediasemi/blink/location/api/GeocodingApi.java:34` |
| POST | `geocoding/v1/geocode` | Geocoding | bearer | GeoCodingRequest | LocationDetailsResponse | unchanged | direct | `com/immediasemi/blink/location/api/GeocodingApi.java:38` |
| GET | `geocoding/v1/ip/info/my` | Geocoding | bearer | — | LocationByIpResponse | unchanged | direct | `com/immediasemi/blink/location/api/GeocodingApi.java:26` |
| GET | `geocoding/v1/reverse-geocode` | Geocoding | bearer | — | LocationDetailsResponse | unchanged | direct | `com/immediasemi/blink/location/api/GeocodingApi.java:22` |
| GET | `location_info/v3/locations` | LocationsCore | bearer | — | ResponseBody | unchanged | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:35` |
| GET | `location-subtypes` | LocationSubtype | bearer | — | SubtypeBody | unchanged | direct | `com/amazon/rbks/mobile/locations/network/LocationSubtypeApi.java:12` |
| DELETE | `recordings/public/footages/{deviceId}` | Footage | bearer | — | Unit | unchanged | direct | `com/ringapp/orchestratorapi/data/FootageApi.java:18` |
| DELETE | `recordings/public/footages/{deviceId}/delete_all` | Footage | bearer | — | Unit | unchanged | direct | `com/ringapp/orchestratorapi/data/FootageApi.java:15` |
| POST | `setups` | Clients | bearer | RequestBody | ApiSetup | added | direct | `com/ring/blueprints/setup/core/data/backend/ClientsApi.java:21` |
| GET | `setups/{setupId}` | Clients | bearer | — | ApiSetupStatus | added | direct | `com/ring/blueprints/setup/core/data/backend/ClientsApi.java:18` |
| POST | `setups/{setupId}/complete` | Clients | bearer | CompleteSetupBody | Void | added | direct | `com/ring/blueprints/setup/core/data/backend/ClientsApi.java:15` |
| PUT | `share_service/v3/batch_shares` | VideoDonation | bearer | BatchDonationRequest | BatchDonationResponse | added | direct | `com/immediasemi/blink/video/clip/donation/api/VideoDonationApi.java:14` |
| GET | `sos/v1/factory_profile` | SetupOrchestrationService | bearer | — | MacIdentifyDeviceResponseApiModel | added | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:35` |
| POST | `sos/v1/setups` | SetupOrchestrationService | bearer | RingSosSetupPostBody | RingSosSetupResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:41` |
| GET | `system/config/network` | LocalSetupOrchestrationService | bearer | — | NetworkConfigGetResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/LocalSetupOrchestrationServiceApi.java:17` |
| POST | `system/config/network` | LocalSetupOrchestrationService | bearer | NetworkConfigPostBody | NetworkConfigStatusResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/LocalSetupOrchestrationServiceApi.java:20` |
| POST | `system/config/reg_domain` | LocalSetupOrchestrationService | bearer | RegionConfigPostBody | NetworkConfigStatusResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/LocalSetupOrchestrationServiceApi.java:23` |
| GET | `system/prov/ap_list` | LocalSetupOrchestrationService | bearer | — | AccessPointListResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/LocalSetupOrchestrationServiceApi.java:14` |
| POST | `users/delete` | Account | bearer | DeleteAccountBody | Unit | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:31` |
| GET | `v1/accounts/{injected_account_id}/single_event_alerts` | SingleEventAlerts | bearer | — | SingleEventAlertsResponse | unchanged | direct | `com/immediasemi/blink/settings/notifications/sea/SingleEventAlertsApi.java:16` |
| POST | `v1/accounts/{injected_account_id}/single_event_alerts` | SingleEventAlerts | bearer | SingleEventAlertsPostBody | Unit | unchanged | direct | `com/immediasemi/blink/settings/notifications/sea/SingleEventAlertsApi.java:19` |
| POST | `v1/alexa/authorization` | AlexaLinking | bearer | AlexaLinkingAuthorizePostBody | AlexaLinkingAuthorizeResponse | unchanged | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingApi.java:22` |
| DELETE | `v1/alexa/link` | AlexaLinking | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingApi.java:16` |
| POST | `v1/alexa/link` | AlexaLinking | bearer | AlexaLinkingLinkPostBody | Unit | unchanged | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingApi.java:25` |
| GET | `v1/alexa/link_status` | AlexaLinking | bearer | — | AlexaLinkStatus | unchanged | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingApi.java:19` |
| GET | `v1/clients/{injected_client_id}/control_panel/clients` | ClientDeviceManagement | bearer | — | GetClientsResponse | unchanged | direct | `com/immediasemi/blink/settings/client/ClientDeviceManagementApi.java:23` |
| POST | `v1/clients/{injected_client_id}/control_panel/delete` | ClientDeviceManagement | bearer | DeleteClientBody | Unit | unchanged | direct | `com/immediasemi/blink/settings/client/ClientDeviceManagementApi.java:20` |
| POST | `v1/clients/{injected_client_id}/control_panel/pin/resend` | ClientDeviceManagement | bearer | — | GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/settings/client/ClientDeviceManagementApi.java:29` |
| POST | `v1/clients/{injected_client_id}/control_panel/pin/verify` | ClientDeviceManagement | bearer | VerifyPinPostBody | VerifyPinResponse | unchanged | direct | `com/immediasemi/blink/settings/client/ClientDeviceManagementApi.java:32` |
| POST | `v1/clients/{injected_client_id}/control_panel/request_pin` | ClientDeviceManagement | bearer | — | GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/settings/client/ClientDeviceManagementApi.java:26` |
| GET | `v1/clients/{injected_client_id}/options` | Client | bearer | — | ClientOptionsBody | unchanged | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:20` |
| POST | `v1/clients/{injected_client_id}/options` | Client | bearer | ClientOptionsBody | Unit | unchanged | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:23` |
| POST | `v1/clients/{injected_client_id}/shared_login/pin/resend` | SharedLogin | bearer | — | GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:36` |
| POST | `v1/clients/{injected_client_id}/shared_login/pin/verify` | SharedLogin | bearer | VerifyPinPostBody | VerifyPinResponse | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:39` |
| POST | `v1/clients/{injected_client_id}/shared_login/request_pin` | SharedLogin | bearer | — | GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:33` |
| POST | `v1/countries/update` | Account | bearer | CountryBody | CountryResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:67` |
| POST | `v1/data_request/dsar/create` | ManageData | bearer | — | SubmitDataRequestResponse | unchanged | direct | `com/immediasemi/blink/settings/account/managedata/ManageDataApi.java:18` |
| POST | `v1/data_request/euda/create` | ManageData | bearer | — | SubmitDataRequestResponse | unchanged | direct | `com/immediasemi/blink/settings/account/managedata/ManageDataApi.java:21` |
| GET | `v1/data_request/list` | ManageData | bearer | — | DataRequests | unchanged | direct | `com/immediasemi/blink/settings/account/managedata/ManageDataApi.java:15` |
| POST | `v1/data_request/third_party/{thirdPartyId}/revoke` | ManageData | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/settings/account/managedata/ManageDataApi.java:24` |
| POST | `v1/events/app` | Event | bearer | TrackingEvents | Unit | unchanged | direct | `com/immediasemi/blink/common/track/event/EventApi.java:15` |
| GET | `v1/identities` | Identities | bearer | — | IdentitiesResponse | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:28` |
| DELETE | `v1/identities/{id}` | Identities | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:25` |
| GET | `v1/identities/{id}` | Identities | bearer | — | IdentityResponse | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:31` |
| PATCH | `v1/identities/{id}` | Identities | bearer | UpdateIdentityRequest | Unit | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:43` |
| PATCH | `v1/identities/{id}/actions/merge-identities` | Identities | bearer | MergeIdentitiesRequest | Unit | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:34` |
| POST | `v1/identities/{id}/actions/split-identity` | Identities | bearer | SplitIdentityRequest | SplitIdentityResponse | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:40` |
| PATCH | `v1/identities/{id}/enrollment-images/actions/move-enrollment-images` | Identities | bearer | MoveEnrollmentImagesRequest | Unit | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:37` |
| POST | `v1/identity/token` | Account | bearer | TokenUpgradePostBody | RefreshTokensResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:64` |
| POST | `v1/locations/update` | BlinkCloudLocation | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/location/api/BlinkCloudLocationApi.java:13` |
| GET | `v1/notifications/preferences` | Account | bearer | — | NotificationPreferencesResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:43` |
| POST | `v1/notifications/preferences` | Account | bearer | NotificationPreferencesResponse | Unit | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:55` |
| GET | `v1/shared_login` | SharedLogin | bearer | — | GetSharedLoginResponse | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:24` |
| POST | `v1/shared_login` | SharedLogin | bearer | CreateSharedLoginBody | PostSharedLoginResponse | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:30` |
| POST | `v1/shared_login/claim` | SharedLoginPublic | bearer | SharedLoginClaimBody | PostSharedLoginClaimResponse | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginPublicApi.java:17` |
| POST | `v1/shared_login/revoke` | SharedLogin | bearer | RevokeSharedLoginBody | Unit | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:27` |
| POST | `v1/shared_login/verify` | SharedLoginPublic | bearer | SharedLoginVerifyBody | PostSharedLoginVerifyResponse | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginPublicApi.java:20` |
| PATCH | `v1/shared/authorizations/{authorizationId}` | Access | bearer | FriendlyNamePatchBody | PollingResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:42` |
| DELETE | `v1/shared/authorizations/{authorizationId}/remove` | Access | bearer | — | PollingResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:27` |
| DELETE | `v1/shared/authorizations/{authorizationId}/revoke` | Access | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:30` |
| GET | `v1/shared/check_authorization` | Access | bearer | — | CheckAuthorizationResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:36` |
| POST | `v1/shared/invitations/{invitationId}/accept` | Access | bearer | AcceptInvitationBody | PollingResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:48` |
| DELETE | `v1/shared/invitations/{invitationId}/decline` | Access | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:24` |
| DELETE | `v1/shared/invitations/{invitationId}/revoke` | Access | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:33` |
| POST | `v1/shared/invitations/send` | Access | bearer | SendInviteBody | Unit | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:51` |
| PATCH | `v1/shared/popovers/{popoverId}/read` | Access | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:45` |
| GET | `v1/shared/summary` | Access | bearer | — | AccessSummary | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:39` |
| POST | `v1/subscriptions/clear_popup/{type}` | WriteSubscription | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:42` |
| POST | `v1/subscriptions/link/link_account` | WriteSubscription | bearer | MapLinkBody | DspSubscriptionResponse | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:39` |
| POST | `v1/subscriptions/link/unlink_account` | WriteSubscription | bearer | VerifyLinkAccountBody | DspSubscriptionResponse | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:51` |
| POST | `v1/subscriptions/plans/{subscriptionId}/attach` | WriteSubscription | bearer | AttachPlanBody | DspSubscriptionResponse | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:27` |
| DELETE | `v1/subscriptions/plans/cancel_trial` | WriteSubscription | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:30` |
| GET | `v1/subscriptions/plans/get_device_attach_eligibility` | WriteSubscription | bearer | — | DeviceEligibilityResponse | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:36` |
| POST | `v1/subscriptions/plans/renew_trial` | WriteSubscription | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:45` |
| POST | `v1/subscriptions/request/status/{uuid}` | WriteSubscription | bearer | SubscriptionRequestStatusBody | SubscriptionRequestStatusResponse | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:48` |
| POST | `v1/users/authenticate_password` | Account | bearer | AuthenticatePasswordBody | AuthenticatePasswordResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:28` |
| POST | `v1/users/countries/update` | Account | bearer | CountryBody | CountryResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:70` |
| GET | `v1/users/options` | Account | bearer | — | AccountOptionsResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:37` |
| GET | `v1/users/preferences` | Account | bearer | — | AccountPreferencesBody | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:40` |
| POST | `v1/users/preferences` | Account | bearer | AccountPreferencesBody | AccountPreferencesBody | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:52` |
| GET | `v1/users/tier_info` | Account | bearer | — | TierInfo | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:46` |
| POST | `v2/clients/{injected_client_id}/tiv` | CustomerSupportAccess | bearer | TivLockBody | SetTivLockResponse | unchanged | direct | `com/immediasemi/blink/settings/privacy/CustomerSupportAccessApi.java:16` |
| POST | `v2/clients/{injected_client_id}/tiv_unlock/pin/resend` | CustomerSupportAccess | bearer | — | GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/settings/privacy/CustomerSupportAccessApi.java:22` |
| POST | `v2/clients/{injected_client_id}/tiv_unlock/pin/verify` | CustomerSupportAccess | bearer | VerifyPinPostBody | VerifyPinResponse | unchanged | direct | `com/immediasemi/blink/settings/privacy/CustomerSupportAccessApi.java:25` |
| POST | `v2/clients/{injected_client_id}/tiv_unlock/request_pin` | CustomerSupportAccess | bearer | — | GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/settings/privacy/CustomerSupportAccessApi.java:19` |
| POST | `v2/notification` | Notification | bearer | AcknowledgeNotificationBody | Object | unchanged | direct | `com/immediasemi/blink/notification/NotificationApi.java:14` |
| POST | `v2/subscriptions/plans/create_trial` | WriteSubscription | bearer | AdditionalTrialBody | Unit | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:33` |
| GET | `v2/users/info` | Account | bearer | — | Account | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:34` |
| POST | `v4/clients/{injected_client_id}/email_change` | EmailChange | bearer | ChangeEmailPostBody | GeneratePinResponse | changed | direct | `com/immediasemi/blink/settings/email/EmailChangeApi.java:16` |
| POST | `v4/clients/{injected_client_id}/email_change/pin/resend` | EmailChange | bearer | — | GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/settings/email/EmailChangeApi.java:19` |
| POST | `v4/clients/{injected_client_id}/email_change/pin/verify` | EmailChange | bearer | VerifyPinPostBody | VerifyPinResponse | unchanged | direct | `com/immediasemi/blink/settings/email/EmailChangeApi.java:22` |
| POST | `v4/clients/{injected_client_id}/logout` | Account | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:49` |
| POST | `v4/clients/{injected_client_id}/password_change` | PasswordChange | bearer | ResetPasswordPostBody | Unit | unchanged | direct | `com/immediasemi/blink/settings/password/PasswordChangeApi.java:18` |
| POST | `v4/clients/{injected_client_id}/password_change/pin/generate` | PasswordChange | bearer | — | GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/settings/password/PasswordChangeApi.java:24` |
| POST | `v4/clients/{injected_client_id}/password_change/pin/verify` | PasswordChange | bearer | VerifyPinPostBody | VerifyPinResponse | unchanged | direct | `com/immediasemi/blink/settings/password/PasswordChangeApi.java:27` |
| POST | `v4/clients/{injected_client_id}/pin/verify` | Client | bearer | VerifyPinBody | PinVerificationResponse | unchanged | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:35` |
| POST | `v4/users/pin/resend` | Account | bearer | — | GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:58` |
| POST | `v4/users/pin/verify` | Account | bearer | VerifyPinPostBody | VerifyPinResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:61` |
| POST | `v5/clients/{injected_client_id}/client_verification/pin/resend` | Client | bearer | — | ResendClientVerificationCodeResponse | unchanged | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:29` |
| POST | `v5/clients/{injected_client_id}/client_verification/pin/verify` | Client | bearer | SubmitVerificationRequest | PinVerificationResponse | unchanged | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:32` |
| POST | `v5/clients/{injected_client_id}/phone_number_change` | PhoneNumberChange | bearer | ChangePhoneNumberBody | ChangePhoneNumberResponse | changed | direct | `com/immediasemi/blink/common/account/phone/PhoneNumberChangeApi.java:18` |
| POST | `v5/clients/{injected_client_id}/phone_number_change` | PhoneNumberChange | bearer | AddPhoneNumberPostBody | ChangePhoneNumberResponse | unchanged | direct | `com/immediasemi/blink/common/account/phone/PhoneNumberChangeApi.java:21` |
| POST | `v5/clients/{injected_client_id}/phone_number_change/pin/verify` | PhoneNumberChange | bearer | SubmitVerificationRequest | PinVerificationResponse | unchanged | direct | `com/immediasemi/blink/common/account/phone/PhoneNumberChangeApi.java:24` |

### shared-rest

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| POST | `accounts/{injected_account_id}/networks/{network}/cameras/{camera}/{type}` | Camera | bearer | — | CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:81` |
| POST | `accounts/{injected_account_id}/networks/{network}/cameras/{camera}/thumbnail` | Camera | bearer | — | CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:96` |
| POST | `accounts/{injected_account_id}/networks/{network}/cameras/add` | Camera | bearer | AddCameraBody | AddCameraResponseBody | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:36` |
| GET | `accounts/{injected_account_id}/networks/{network}/commands/{command}` | Command | bearer | — | SupervisorKommand | unchanged | direct | `com/immediasemi/blink/common/device/network/command/CommandApi.java:25` |
| POST | `accounts/{injected_account_id}/networks/{network}/commands/{command}/done` | Command | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/network/command/CommandApi.java:40` |
| POST | `accounts/{injected_account_id}/networks/{network}/commands/{command}/update` | Command | bearer | UpdateCommandRequest | Kommand | changed | direct | `com/immediasemi/blink/common/device/network/command/CommandApi.java:37` |
| POST | `accounts/{injected_account_id}/networks/{network}/commands/{command}/update` | Command | bearer | TerminateOnboardingBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/network/command/CommandApi.java:43` |
| POST | `accounts/{injected_account_id}/networks/{network}/delete` | Network | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:34` |
| POST | `accounts/{injected_account_id}/networks/{network}/update` | Network | bearer | UpdateNetworkSaveAllLiveViews | Unit | changed | direct | `com/immediasemi/blink/device/network/NetworkApi.java:52` |
| POST | `accounts/{injected_account_id}/networks/{network}/update` | Network | bearer | UpdateSystemNameBody | Unit | changed | direct | `com/immediasemi/blink/device/network/NetworkApi.java:55` |
| POST | `accounts/{injected_account_id}/networks/{network}/update` | Network | bearer | UpdateTimezoneBody | Unit | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:58` |
| POST | `accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/delete` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:45` |
| POST | `accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/status` | Camera | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:84` |
| POST | `accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/delete` | SyncModule | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:22` |
| POST | `accounts/{injected_account_id}/networks/add` | Network | bearer | AddNetworkBody | ANetwork | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:31` |
| POST | `accounts/{injected_account_id}/system_offline/{network}` | Network | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:43` |
| GET | `v1/accounts/{injected_account_id}/access` | ReadSubscription | bearer | — | AccessResponse | unchanged | direct | `com/immediasemi/blink/common/subscription/ReadSubscriptionApi.java:13` |
| GET | `v1/accounts/{injected_account_id}/doorbells/{serial}/fw_update` | Doorbell | bearer | — | ResponseBody | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:49` |
| GET | `v1/accounts/{injected_account_id}/doorbells/{serial}/token` | Doorbell | bearer | — | DeviceAuthTokenResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:55` |
| GET | `v1/accounts/{injected_account_id}/feature_flags/enabled` | FeatureFlag | bearer | — | FeatureFlagsResponse | unchanged | direct | `com/immediasemi/blink/common/flag/FeatureFlagApi.java:12` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/accessories/delete` | Accessory | bearer | DeleteAccessoryBody | Kommand | unchanged | direct | `com/immediasemi/blink/device/accessory/AccessoryApi.java:20` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/accessories/rosie/owl/{owl_id}/calibrate` | Owl | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:32` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/cameras/{camera_id}/snooze` | Camera | bearer | SnoozeBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:111` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/cameras/{camera_id}/unsnooze` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:120` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/change_mode` | Doorbell | bearer | — | AddLotusResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:73` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/change_wifi` | Doorbell | bearer | OnboardingBody | AddLotusResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:43` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/clear_creds` | Doorbell | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:76` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/stay_awake` | Doorbell | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:70` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{lotus_id}/snooze` | Doorbell | bearer | SnoozeBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:130` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{lotus_id}/unsnooze` | Doorbell | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:136` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/accessories/rosie/{rosie_id}/delete` | Owl | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:50` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/snooze` | Owl | bearer | SnoozeBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:101` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/unsnooze` | Owl | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:107` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/snooze` | Network | bearer | SnoozeBody | Unit | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:46` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/state/disarm` | Network | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:37` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/unsnooze` | Network | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:49` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/accessories/add` | Accessory | bearer | AddAccessoryBody | Kommand | unchanged | direct | `com/immediasemi/blink/device/accessory/AccessoryApi.java:17` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/calibrate` | Camera | bearer | TemperatureCalibrationPostBody | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:102` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs` | Camera | bearer | — | FloodlightProgramConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:63` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/delete` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:51` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/disable` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:54` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/enable` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:57` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/update` | Camera | bearer | CreateProgramBody | FloodlightProgramConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:123` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/create` | Camera | bearer | CreateProgramBody | FloodlightProgramConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:39` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/temp_alert_disable` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:114` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/temp_alert_enable` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:117` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` | Camera | bearer | — | AdvancedCameraZones | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:69` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` | Camera | bearer | AdvancedCameraZones | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:105` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config` | Doorbell | bearer | — | LotusChimeConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:61` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config` | Doorbell | bearer | UpdateLotusChimeConfig | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:121` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/config` | Doorbell | bearer | — | LotusConfigInfo | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:58` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/power_test` | Doorbell | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:79` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/trigger_chime` | Doorbell | bearer | TestLotusDingConfig | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:133` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/calibrate` | Doorbell | bearer | TemperatureCalibrationPostBody | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:109` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/temp_alert_disable` | Doorbell | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:103` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/temp_alert_enable` | Doorbell | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:106` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/disable` | Doorbell | bearer | — | CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:85` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/enable` | Doorbell | bearer | — | CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:97` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/status` | Doorbell | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:115` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/thumbnail` | Doorbell | bearer | — | CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:112` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` | Doorbell | bearer | — | AdvancedCameraZones | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:64` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` | Doorbell | bearer | AdvancedCameraZones | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:124` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/add` | Doorbell | bearer | AddLotusBody | AddLotusResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:40` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs` | Owl | bearer | — | FloodlightProgramConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:65` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/delete` | Owl | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:47` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/disable` | Owl | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:53` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/enable` | Owl | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:59` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/update` | Owl | bearer | CreateProgramBody | FloodlightProgramConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:110` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/create` | Owl | bearer | CreateProgramBody | FloodlightProgramConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:38` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/add` | Owl | bearer | AddOwlPostBody | AddOwlResponse | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:71` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/add` | Owl | bearer | OnboardingBody | OwlAddBody | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:104` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/programs` | Program | bearer | — | Program | unchanged | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:32` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/delete` | Program | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:23` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/disable` | Program | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:26` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/enable` | Program | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:29` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/update` | Program | bearer | UpdateProgramRequest | Unit | unchanged | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:35` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/programs/create` | Program | bearer | Program | Unit | unchanged | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:20` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{camera}/accessories/{accessoryType}/{accessoryId}/delete` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:42` |
| GET | `v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/network_type` | Camera | bearer | — | VideoNetworksConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:66` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/network_type` | Camera | bearer | VideoNetworkTypeBody | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:99` |
| GET | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/list` | Doorbell | bearer | — | ChimeCamerasResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:52` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/update` | Doorbell | bearer | ChimeCamerasPostBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:82` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/config` | Doorbell | bearer | UpdateLotusBody | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:88` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/delete` | Doorbell | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:46` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/status` | Doorbell | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:94` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/ob_cancel` | Doorbell | bearer | CancelOnboardingPostBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:91` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/accessories/{accessoryType}/{accessoryId}/delete` | Owl | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:41` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/lights/{lightControl}` | Owl | bearer | — | CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:77` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/change_wifi` | Owl | bearer | OnboardingBody | OwlAddBody | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:35` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/change_wifi` | Owl | bearer | AddOwlPostBody | AddOwlResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:74` |
| GET | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config` | Owl | bearer | — | OwlConfigInfo | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:62` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config` | Owl | bearer | UpdateOwlBody | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:86` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/delete` | Owl | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:44` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/status` | Owl | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:92` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/thumbnail` | Owl | bearer | — | CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:95` |
| DELETE | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/pair` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:48` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/pair` | Camera | bearer | PairCameraBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:90` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/swap_pair` | Camera | bearer | SwapCameraBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:93` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/state/{type}` | Network | bearer | — | Command | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:25` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/state/arm` | Network | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:40` |
| DELETE | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage` | Media | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:27` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/eject` | SyncModule | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:28` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/format` | SyncModule | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:31` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/delete/{clipId}` | Media | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:30` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/request/{clipId}` | Media | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:24` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/request` | Media | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:33` |
| GET | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/media/{commandId}` | Media | bearer | — | MediaResponse | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:36` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/mount` | SyncModule | bearer | — | Kommand | unchanged | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:37` |
| GET | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/status` | SyncModule | bearer | — | LocalStorageStatusResponse | unchanged | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:34` |
| POST | `v1/accounts/{injected_account_id}/networks/bulk_location_assignment` | Network | bearer | BulkLocationAssignmentRequest | BulkLocationAssignmentResponse | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:28` |
| GET | `v1/accounts/{injected_account_id}/owls/{serial}/fw_update` | Owl | bearer | — | ResponseBody | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:56` |
| GET | `v1/accounts/{injected_account_id}/smart_video_descriptions` | SmartVideoDescriptions | bearer | — | SmartVideoDescriptionsResponse | unchanged | direct | `com/immediasemi/blink/settings/SmartVideoDescriptionsApi.java:18` |
| POST | `v1/accounts/{injected_account_id}/smart_video_descriptions` | SmartVideoDescriptions | bearer | SmartVideoDescriptionsPostBody | Unit | unchanged | direct | `com/immediasemi/blink/settings/SmartVideoDescriptionsApi.java:24` |
| POST | `v1/accounts/{injected_account_id}/smart_video_descriptions/summarize` | SmartVideoDescriptions | bearer | SummarizeClipsRequest | SummarizeClipsResponse | unchanged | direct | `com/immediasemi/blink/settings/SmartVideoDescriptionsApi.java:21` |
| GET | `v1/accounts/{injected_account_id}/sync_modules/{serial}/fw_update` | SyncModule | bearer | — | ResponseBody | unchanged | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:25` |
| GET | `v2/accounts/{injected_account_id}/devices/identify/{serialNumber}` | Device | bearer | — | IdentifyDeviceResponseApiModel | unchanged | direct | `com/immediasemi/blink/common/device/DeviceApi.java:13` |
| GET | `v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/config` | Camera | bearer | — | CameraConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:60` |
| GET | `v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` | Camera | bearer | — | ZoneV2Response | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:72` |
| POST | `v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` | Camera | bearer | ZoneV2Response | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:108` |
| GET | `v2/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` | Doorbell | bearer | — | ZoneV2Response | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:67` |
| POST | `v2/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` | Doorbell | bearer | ZoneV2Response | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:127` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/cameras/{camera}/light_accessories/{accessoryId}/lights/{lightControl}` | Camera | bearer | — | CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:75` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/config` | Camera | bearer | UpdateCameraBody | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:78` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/liveview` | Doorbell | bearer | LiveViewCommandPostBody | LiveViewCommandResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:100` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/liveview` | Owl | bearer | LiveViewCommandPostBody | LiveViewCommandResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:83` |
| GET | `v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/zones` | Owl | bearer | — | ZoneV2Response | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:68` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/zones` | Owl | bearer | ZoneV2Response | Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:98` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{type}` | SyncModule | bearer | OnboardingBody | Command | unchanged | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:40` |
| GET | `v2/accounts/{injected_account_id}/subscriptions/entitlements` | ReadSubscription | bearer | — | EntitlementResponse | unchanged | direct | `com/immediasemi/blink/common/subscription/ReadSubscriptionApi.java:16` |
| GET | `v3/accounts/{injected_account_id}/subscriptions/plans` | ReadSubscription | bearer | — | SubscriptionPlansResponse | removed | direct | `com/immediasemi/blink/common/subscription/ReadSubscriptionApi.java:17` |
| GET | `v4/accounts/{injected_account_id}/homescreen` | HomeScreen | bearer | — | HomeScreen | unchanged | direct | `com/immediasemi/blink/utils/sync/HomeScreenApi.java:12` |
| POST | `v4/accounts/{injected_account_id}/media` | Media | bearer | MediaPostBody | MediaResponse | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:57` |
| GET | `v4/accounts/{injected_account_id}/media_settings` | Media | bearer | — | MediaSettingsResponse | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:39` |
| PATCH | `v4/accounts/{injected_account_id}/media_settings` | Media | bearer | MediaSettingsPatch | Unit | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:45` |
| DELETE | `v4/accounts/{injected_account_id}/media/{mediaId}/delete` | Media | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:21` |
| POST | `v4/accounts/{injected_account_id}/media/delete` | Media | bearer | MediaListBody | Unit | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:48` |
| POST | `v4/accounts/{injected_account_id}/media/favorite` | Media | bearer | FavoriteEventIdsBody | Unit | added | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:51` |
| POST | `v4/accounts/{injected_account_id}/media/mark_as_viewed` | Media | bearer | MediaListBody | Unit | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:54` |
| POST | `v4/accounts/{injected_account_id}/media/unfavorite` | Media | bearer | FavoriteEventIdsBody | Unit | added | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:60` |
| GET | `v4/accounts/{injected_account_id}/subscriptions/plans` | ReadSubscription | bearer | — | SubscriptionPlansResponse | unchanged | direct | `com/immediasemi/blink/common/subscription/ReadSubscriptionApi.java:19` |
| GET | `v4/accounts/{injected_account_id}/unwatched_media` | Media | bearer | — | UnwatchedMediaResponse | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:42` |
| POST | `v6/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/liveview` | Camera | bearer | LiveViewCommandPostBody | LiveViewCommandResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:87` |

## Request and response schema index

| Model | Kind | Fields | Confidence | Evidence |
|---|---|---:|---|---|
| `Camera` | object | 0 | inferred | `androidx/camera/core/Camera.java` |
| `Logger` | object | 2 | direct | `androidx/camera/core/Logger.java` |
| `Status` | object | 0 | inferred | `androidx/core/backported/fixes/Status.java` |
| `Data` | object | 2 | direct | `androidx/datastore/core/Data.java` |
| `Duration` | object | 6 | direct | `androidx/datastore/preferences/protobuf/Duration.java` |
| `DeviceInfo` | object | 15 | direct | `androidx/media3/common/DeviceInfo.java` |
| `Bounds` | object | 5 | direct | `androidx/window/core/Bounds.java` |
| `AutoCompleteResponse` | object | 2 | direct | `com/amazon/rbks/mobile/locations/network/entities/AutoCompleteResponse.java` |
| `ClassificationConfidence` | enum | 3 | direct | `com/amazon/rbks/mobile/locations/network/entities/ClassificationConfidence.java` |
| `ClassificationDecision` | enum | 3 | direct | `com/amazon/rbks/mobile/locations/network/entities/ClassificationDecision.java` |
| `GeoCodingRequest` | object | 3 | direct | `com/amazon/rbks/mobile/locations/network/entities/GeoCodingRequest.java` |
| `LocationAddressBody` | object | 8 | direct | `com/amazon/rbks/mobile/locations/network/entities/LocationAddressBody.java` |
| `LocationBody` | object | 15 | direct | `com/amazon/rbks/mobile/locations/network/entities/LocationBody.java` |
| `LocationByIpResponse` | object | 8 | direct | `com/amazon/rbks/mobile/locations/network/entities/LocationByIpResponse.java` |
| `LocationCoordinatesBody` | object | 2 | direct | `com/amazon/rbks/mobile/locations/network/entities/LocationCoordinatesBody.java` |
| `LocationDetailGeometry` | object | 2 | direct | `com/amazon/rbks/mobile/locations/network/entities/LocationDetailGeometry.java` |
| `LocationDetailsResponse` | object | 13 | direct | `com/amazon/rbks/mobile/locations/network/entities/LocationDetailsResponse.java` |
| `LocationEntitlementsBody` | object | 1 | direct | `com/amazon/rbks/mobile/locations/network/entities/LocationEntitlementsBody.java` |
| `LocationPredictionResponse` | object | 3 | direct | `com/amazon/rbks/mobile/locations/network/entities/LocationPredictionResponse.java` |
| `LocationType` | enum | 2 | direct | `com/amazon/rbks/mobile/locations/network/entities/LocationType.java` |
| `PutLocationRequest` | object | 13 | direct | `com/amazon/rbks/mobile/locations/network/entities/PutLocationRequest.java` |
| `LocationSubtypeNetwork` | object | 3 | direct | `com/amazon/rbks/mobile/locations/network/entities/subtype/LocationSubtypeNetwork.java` |
| `SubtypeBody` | object | 1 | direct | `com/amazon/rbks/mobile/locations/network/entities/subtype/SubtypeBody.java` |
| `SubtypeData` | object | 2 | direct | `com/amazon/rbks/mobile/locations/network/entities/subtype/SubtypeData.java` |
| `TagDetailsNetwork` | object | 2 | direct | `com/amazon/rbks/mobile/locations/network/entities/subtype/TagDetailsNetwork.java` |
| `UpdateLocationRequest` | object | 12 | direct | `com/amazon/rbks/mobile/locations/network/entities/UpdateLocationRequest.java` |
| `BreadcrumbType` | enum | 1 | direct | `com/bugsnag/android/BreadcrumbType.java` |
| `CallbackState` | object | 9 | direct | `com/bugsnag/android/CallbackState.java` |
| `Client` | object | 7 | direct | `com/bugsnag/android/Client.java` |
| `ContextState` | object | 3 | direct | `com/bugsnag/android/ContextState.java` |
| `Delivery` | object | 0 | inferred | `com/bugsnag/android/Delivery.java` |
| `EndpointConfiguration` | object | 2 | direct | `com/bugsnag/android/EndpointConfiguration.java` |
| `ErrorTypes` | object | 4 | direct | `com/bugsnag/android/ErrorTypes.java` |
| `EventStore` | object | 11 | direct | `com/bugsnag/android/EventStore.java` |
| `ExceptionHandler` | object | 6 | direct | `com/bugsnag/android/ExceptionHandler.java` |
| `BackgroundTaskService` | object | 7 | direct | `com/bugsnag/android/internal/BackgroundTaskService.java` |
| `ImmutableConfig` | object | 33 | direct | `com/bugsnag/android/internal/ImmutableConfig.java` |
| `InternalMetrics` | object | 0 | inferred | `com/bugsnag/android/internal/InternalMetrics.java` |
| `TaskType` | enum | 4 | direct | `com/bugsnag/android/internal/TaskType.java` |
| `Notifier` | object | 4 | direct | `com/bugsnag/android/Notifier.java` |
| `OnBreadcrumbCallback` | object | 0 | inferred | `com/bugsnag/android/OnBreadcrumbCallback.java` |
| `OnErrorCallback` | object | 0 | inferred | `com/bugsnag/android/OnErrorCallback.java` |
| `OnSendCallback` | object | 0 | inferred | `com/bugsnag/android/OnSendCallback.java` |
| `OnSessionCallback` | object | 0 | inferred | `com/bugsnag/android/OnSessionCallback.java` |
| `StrictModeHandler` | object | 14 | direct | `com/bugsnag/android/StrictModeHandler.java` |
| `Telemetry` | enum | 2 | direct | `com/bugsnag/android/Telemetry.java` |
| `ThreadSendPolicy` | enum | 3 | direct | `com/bugsnag/android/ThreadSendPolicy.java` |
| `User` | object | 6 | direct | `com/bugsnag/android/User.java` |
| `UserState` | object | 1 | direct | `com/bugsnag/android/UserState.java` |
| `Network` | object | 0 | inferred | `com/google/common/graph/Network.java` |
| `AndroidApplicationInfo` | object | 6 | direct | `com/google/firebase/sessions/AndroidApplicationInfo.java` |
| `ApplicationInfo` | object | 6 | direct | `com/google/firebase/sessions/ApplicationInfo.java` |
| `LogEnvironment` | enum | 1 | direct | `com/google/firebase/sessions/LogEnvironment.java` |
| `ProcessDetails` | object | 4 | direct | `com/google/firebase/sessions/ProcessDetails.java` |
| `JsonElement` | object | 0 | inferred | `com/google/gson/JsonElement.java` |
| `AuthenticatePasswordBody` | object | 1 | direct | `com/immediasemi/blink/account/auth/AuthenticatePasswordBody.java` |
| `AuthenticatePasswordResponse` | object | 2 | direct | `com/immediasemi/blink/account/auth/AuthenticatePasswordResponse.java` |
| `ResetPasswordPostBody` | object | 6 | direct | `com/immediasemi/blink/account/password/ResetPasswordPostBody.java` |
| `AddPhoneNumberPostBody` | object | 3 | direct | `com/immediasemi/blink/account/phone/AddPhoneNumberPostBody.java` |
| `ChimeType` | enum | 3 | direct | `com/immediasemi/blink/adddevice/lotus/chime/ChimeType.java` |
| `Stages` | object | 0 | inferred | `com/immediasemi/blink/api/requests/onboarding/OnboardingCommandUpdate/stage/Stages.java` |
| `UpdateCommandRequest` | object | 1 | direct | `com/immediasemi/blink/api/requests/onboarding/OnboardingCommandUpdate/UpdateCommandRequest.java` |
| `AcknowledgeNotificationBody` | enum | 2 | direct | `com/immediasemi/blink/api/retrofit/AcknowledgeNotificationBody.java` |
| `AddLotusDoorbell` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/AddLotusDoorbell.java` |
| `AddLotusResponse` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/AddLotusResponse.java` |
| `ChangePhoneNumberBody` | object | 5 | direct | `com/immediasemi/blink/api/retrofit/ChangePhoneNumberBody.java` |
| `ChangePhoneNumberResponse` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/ChangePhoneNumberResponse.java` |
| `CountryBody` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/CountryBody.java` |
| `CountryResponse` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/CountryResponse.java` |
| `DeleteClientBody` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/DeleteClientBody.java` |
| `DeviceRegistrationStatus` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/DeviceRegistrationStatus.java` |
| `Entitlement` | object | 4 | direct | `com/immediasemi/blink/api/retrofit/Entitlement.java` |
| `EntitlementFeature` | object | 5 | direct | `com/immediasemi/blink/api/retrofit/EntitlementFeature.java` |
| `EntitlementHomescreen` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/EntitlementHomescreen.java` |
| `EntitlementResponse` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/EntitlementResponse.java` |
| `EventDataKeyValuePair` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/EventDataKeyValuePair.java` |
| `GetClientsResponse` | object | 2 | direct | `com/immediasemi/blink/api/retrofit/GetClientsResponse.java` |
| `LocalStorageStatusResponse` | object | 12 | direct | `com/immediasemi/blink/api/retrofit/LocalStorageStatusResponse.java` |
| `LogsBody` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/LogsBody.java` |
| `MediaListBody` | object | 2 | direct | `com/immediasemi/blink/api/retrofit/MediaListBody.java` |
| `NotificationPreferencesResponse` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/NotificationPreferencesResponse.java` |
| `Owl` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/Owl.java` |
| `OwlAddBody` | object | 2 | direct | `com/immediasemi/blink/api/retrofit/OwlAddBody.java` |
| `PinVerificationResponse` | object | 8 | direct | `com/immediasemi/blink/api/retrofit/PinVerificationResponse.java` |
| `ResendClientVerificationCodeResponse` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/ResendClientVerificationCodeResponse.java` |
| `SessionKeys` | object | 2 | direct | `com/immediasemi/blink/api/retrofit/SessionKeys.java` |
| `SetSSIDBody` | object | 9 | direct | `com/immediasemi/blink/api/retrofit/SetSSIDBody.java` |
| `SnoozeBody` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/SnoozeBody.java` |
| `SubmitVerificationRequest` | object | 2 | direct | `com/immediasemi/blink/api/retrofit/SubmitVerificationRequest.java` |
| `SubscriptionHomeScreen` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/SubscriptionHomeScreen.java` |
| `TemperatureCalibrationPostBody` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/TemperatureCalibrationPostBody.java` |
| `TerminateOnboardingBody` | object | 2 | direct | `com/immediasemi/blink/api/retrofit/TerminateOnboardingBody.java` |
| `TrackingEvent` | object | 4 | direct | `com/immediasemi/blink/api/retrofit/TrackingEvent.java` |
| `TrackingEvents` | object | 2 | direct | `com/immediasemi/blink/api/retrofit/TrackingEvents.java` |
| `UpdateAccessoryBody` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/UpdateAccessoryBody.java` |
| `UpdateCameraBody` | enum | 41 | direct | `com/immediasemi/blink/api/retrofit/UpdateCameraBody.java` |
| `UpdateLightAccessoryBody` | object | 6 | direct | `com/immediasemi/blink/api/retrofit/UpdateLightAccessoryBody.java` |
| `UpdateNetworkSaveAllLiveViews` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/UpdateNetworkSaveAllLiveViews.java` |
| `UpdateStormBody` | object | 5 | direct | `com/immediasemi/blink/api/retrofit/UpdateStormBody.java` |
| `UpdateSuperiorBody` | object | 5 | direct | `com/immediasemi/blink/api/retrofit/UpdateSuperiorBody.java` |
| `UpdateSystemNameBody` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/UpdateSystemNameBody.java` |
| `UpdateTimezoneBody` | object | 5 | direct | `com/immediasemi/blink/api/retrofit/UpdateTimezoneBody.java` |
| `VerifyPinBody` | object | 4 | direct | `com/immediasemi/blink/api/retrofit/VerifyPinBody.java` |
| `AccessAuthorization` | object | 5 | direct | `com/immediasemi/blink/common/account/AccessAuthorization.java` |
| `AccessInvitation` | object | 3 | direct | `com/immediasemi/blink/common/account/AccessInvitation.java` |
| `AccessMessage` | object | 5 | direct | `com/immediasemi/blink/common/account/AccessMessage.java` |
| `Account` | object | 21 | direct | `com/immediasemi/blink/common/account/Account.java` |
| `Auth` | object | 1 | direct | `com/immediasemi/blink/common/account/auth/Auth.java` |
| `AuthenticationResponse` | object | 7 | direct | `com/immediasemi/blink/common/account/auth/AuthenticationResponse.java` |
| `RefreshTokensResponse` | object | 5 | direct | `com/immediasemi/blink/common/account/auth/RefreshTokensResponse.java` |
| `RegisterBody` | object | 14 | direct | `com/immediasemi/blink/common/account/auth/RegisterBody.java` |
| `TokenUpgradePostBody` | object | 1 | direct | `com/immediasemi/blink/common/account/auth/TokenUpgradePostBody.java` |
| `ValidateEmailPostBody` | object | 1 | direct | `com/immediasemi/blink/common/account/auth/ValidateEmailPostBody.java` |
| `ValidatePasswordPostBody` | object | 1 | direct | `com/immediasemi/blink/common/account/auth/ValidatePasswordPostBody.java` |
| `ValidationResponse` | object | 2 | direct | `com/immediasemi/blink/common/account/auth/ValidationResponse.java` |
| `ClientUpdatePostBody` | object | 4 | direct | `com/immediasemi/blink/common/account/client/ClientUpdatePostBody.java` |
| `ClientOptionsBody` | object | 1 | direct | `com/immediasemi/blink/common/account/client/option/ClientOptionsBody.java` |
| `DeleteAccountBody` | object | 1 | direct | `com/immediasemi/blink/common/account/delete/DeleteAccountBody.java` |
| `FriendlyNamePatchBody` | object | 1 | direct | `com/immediasemi/blink/common/account/FriendlyNamePatchBody.java` |
| `GrantedAuthorization` | object | 2 | direct | `com/immediasemi/blink/common/account/GrantedAuthorization.java` |
| `AccountOptionsResponse` | object | 16 | direct | `com/immediasemi/blink/common/account/option/AccountOptionsResponse.java` |
| `Phone` | object | 4 | direct | `com/immediasemi/blink/common/account/phone/Phone.java` |
| `AccountPreferencesBody` | object | 1 | direct | `com/immediasemi/blink/common/account/preference/AccountPreferencesBody.java` |
| `AccountPreferencesDetails` | object | 1 | direct | `com/immediasemi/blink/common/account/preference/AccountPreferencesDetails.java` |
| `SentInvitation` | object | 4 | direct | `com/immediasemi/blink/common/account/SentInvitation.java` |
| `TierInfo` | object | 2 | direct | `com/immediasemi/blink/common/account/TierInfo.java` |
| `Email` | object | 1 | direct | `com/immediasemi/blink/common/account/verification/Email.java` |
| `GeneratePinPostBody` | object | 3 | direct | `com/immediasemi/blink/common/account/verification/GeneratePinPostBody.java` |
| `GeneratePinResponse` | object | 3 | direct | `com/immediasemi/blink/common/account/verification/GeneratePinResponse.java` |
| `PhoneVerificationChannel` | enum | 3 | direct | `com/immediasemi/blink/common/account/verification/PhoneVerificationChannel.java` |
| `Verification` | object | 2 | direct | `com/immediasemi/blink/common/account/verification/Verification.java` |
| `VerificationChannel` | enum | 2 | direct | `com/immediasemi/blink/common/account/verification/VerificationChannel.java` |
| `VerifyPinPostBody` | object | 4 | direct | `com/immediasemi/blink/common/account/verification/VerifyPinPostBody.java` |
| `VerifyPinResponse` | object | 5 | direct | `com/immediasemi/blink/common/account/verification/VerifyPinResponse.java` |
| `CountriesResponse` | object | 3 | direct | `com/immediasemi/blink/common/country/CountriesResponse.java` |
| `Region` | object | 3 | direct | `com/immediasemi/blink/common/country/Region.java` |
| `RegionsResponse` | object | 4 | direct | `com/immediasemi/blink/common/country/RegionsResponse.java` |
| `CameraColor` | enum | 1 | direct | `com/immediasemi/blink/common/device/camera/CameraColor.java` |
| `CancelOnboardingPostBody` | object | 1 | direct | `com/immediasemi/blink/common/device/camera/doorbell/CancelOnboardingPostBody.java` |
| `LotusDoorbellMode` | enum | 2 | direct | `com/immediasemi/blink/common/device/camera/doorbell/LotusDoorbellMode.java` |
| `PairCameraBody` | object | 1 | direct | `com/immediasemi/blink/common/device/camera/PairCameraBody.java` |
| `SwapCameraBody` | object | 1 | direct | `com/immediasemi/blink/common/device/camera/SwapCameraBody.java` |
| `LiveViewCommandPostBody` | object | 2 | direct | `com/immediasemi/blink/common/device/camera/video/live/LiveViewCommandPostBody.java` |
| `LiveViewCommandResponse` | object | 15 | direct | `com/immediasemi/blink/common/device/camera/video/live/LiveViewCommandResponse.java` |
| `PollOptions` | object | 1 | direct | `com/immediasemi/blink/common/device/camera/video/live/PollOptions.java` |
| `VideoNetworkTypeBody` | object | 1 | direct | `com/immediasemi/blink/common/device/camera/video/VideoNetworkTypeBody.java` |
| `AddOwlPostBody` | object | 2 | direct | `com/immediasemi/blink/common/device/camera/wired/AddOwlPostBody.java` |
| `AddOwlResponse` | object | 2 | direct | `com/immediasemi/blink/common/device/camera/wired/AddOwlResponse.java` |
| `ChimeCameraDto` | object | 6 | direct | `com/immediasemi/blink/common/device/camera/wired/ChimeCameraDto.java` |
| `ChimeCamerasPostBody` | object | 3 | direct | `com/immediasemi/blink/common/device/camera/wired/ChimeCamerasPostBody.java` |
| `ChimeCamerasResponse` | object | 3 | direct | `com/immediasemi/blink/common/device/camera/wired/ChimeCamerasResponse.java` |
| `DeviceAuthTokenResponse` | object | 3 | direct | `com/immediasemi/blink/common/device/camera/wired/DeviceAuthTokenResponse.java` |
| `ChimeVolumeSettings` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/ChimeVolumeSettings.java` |
| `CvSettings` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/CvSettings.java` |
| `DetectionTypes` | object | 3 | direct | `com/immediasemi/blink/common/device/duos/DetectionTypes.java` |
| `DeviceBulkUpdateRequest` | object | 3 | direct | `com/immediasemi/blink/common/device/duos/DeviceBulkUpdateRequest.java` |
| `DeviceBulkUpdateResponse` | object | 5 | direct | `com/immediasemi/blink/common/device/duos/DeviceBulkUpdateResponse.java` |
| `DeviceEntityUpdateRequest` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/DeviceEntityUpdateRequest.java` |
| `DeviceMetadataUpdate` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/DeviceMetadataUpdate.java` |
| `DeviceMotionSettingsEntity` | object | 2 | direct | `com/immediasemi/blink/common/device/duos/DeviceMotionSettingsEntity.java` |
| `DeviceMotionSettingsUpdateRequest` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/DeviceMotionSettingsUpdateRequest.java` |
| `DevicePrivacySettingsEntity` | object | 2 | direct | `com/immediasemi/blink/common/device/duos/DevicePrivacySettingsEntity.java` |
| `DevicePrivacySettingsUpdateRequest` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/DevicePrivacySettingsUpdateRequest.java` |
| `DeviceSettings` | object | 2 | direct | `com/immediasemi/blink/common/device/duos/DeviceSettings.java` |
| `DeviceUpdatePayload` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/DeviceUpdatePayload.java` |
| `DuosMotionSettingsPayload` | object | 3 | direct | `com/immediasemi/blink/common/device/duos/DuosMotionSettingsPayload.java` |
| `DuosPrivacyBackendSettings` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/DuosPrivacyBackendSettings.java` |
| `DuosPrivacyGeneralSettings` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/DuosPrivacyGeneralSettings.java` |
| `GeneralSettings` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/GeneralSettings.java` |
| `IdentifyDeviceResponseApiModel` | object | 5 | direct | `com/immediasemi/blink/common/device/IdentifyDeviceResponseApiModel.java` |
| `MacIdentifyDeviceResponseApiModel` | object | 6 | direct | `com/immediasemi/blink/common/device/MacIdentifyDeviceResponseApiModel.java` |
| `RdisAudioConfigurations` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisAudioConfigurations.java` |
| `RdisDevice` | object | 4 | direct | `com/immediasemi/blink/common/device/rdis/RdisDevice.java` |
| `RdisDeviceAttributes` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisDeviceAttributes.java` |
| `RdisDeviceHealth` | object | 4 | direct | `com/immediasemi/blink/common/device/rdis/RdisDeviceHealth.java` |
| `RdisDeviceIdentityAttributes` | object | 6 | direct | `com/immediasemi/blink/common/device/rdis/RdisDeviceIdentityAttributes.java` |
| `RdisDeviceSettingsAttributes` | object | 15 | direct | `com/immediasemi/blink/common/device/rdis/RdisDeviceSettingsAttributes.java` |
| `RdisDeviceSettingsData` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisDeviceSettingsData.java` |
| `RdisDeviceSettingsIncluded` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisDeviceSettingsIncluded.java` |
| `RdisDeviceSettingsResponse` | object | 4 | direct | `com/immediasemi/blink/common/device/rdis/RdisDeviceSettingsResponse.java` |
| `RdisDevicesResponse` | object | 4 | direct | `com/immediasemi/blink/common/device/rdis/RdisDevicesResponse.java` |
| `RdisEnabled` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisEnabled.java` |
| `RdisError` | object | 5 | direct | `com/immediasemi/blink/common/device/rdis/RdisError.java` |
| `RdisErrorSource` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisErrorSource.java` |
| `RdisFamiliarFacesState` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisFamiliarFacesState.java` |
| `RdisFeatureState` | object | 4 | direct | `com/immediasemi/blink/common/device/rdis/RdisFeatureState.java` |
| `RdisImageEnhancements` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisImageEnhancements.java` |
| `RdisIncluded` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisIncluded.java` |
| `RdisIncludedAttrs` | object | 7 | direct | `com/immediasemi/blink/common/device/rdis/RdisIncludedAttrs.java` |
| `RdisLedCapabilities` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisLedCapabilities.java` |
| `RdisLedConfig` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisLedConfig.java` |
| `RdisMotionCapabilities` | object | 4 | direct | `com/immediasemi/blink/common/device/rdis/RdisMotionCapabilities.java` |
| `RdisMotionConfigurations` | object | 7 | direct | `com/immediasemi/blink/common/device/rdis/RdisMotionConfigurations.java` |
| `RdisMotionDetectionEnabled` | enum | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisMotionDetectionEnabled.java` |
| `RdisOperation` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisOperation.java` |
| `RdisOperationAttributes` | object | 7 | direct | `com/immediasemi/blink/common/device/rdis/RdisOperationAttributes.java` |
| `RdisOperationData` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisOperationData.java` |
| `RdisOperationsBody` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisOperationsBody.java` |
| `RdisOperationsResponse` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisOperationsResponse.java` |
| `RdisOperationType` | enum | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisOperationType.java` |
| `RdisPlacement` | enum | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisPlacement.java` |
| `RdisRelationship` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisRelationship.java` |
| `RdisRelationshipLinks` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisRelationshipLinks.java` |
| `RdisRelationshipRef` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisRelationshipRef.java` |
| `RdisRelationships` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisRelationships.java` |
| `RdisSignalStrength` | enum | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisSignalStrength.java` |
| `RdisStatusLed` | enum | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisStatusLed.java` |
| `RdisVideoConfigurations` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisVideoConfigurations.java` |
| `RdisZone` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisZone.java` |
| `RdisZoneVertex` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisZoneVertex.java` |
| `DeviceRegistryPatchBody` | object | 1 | direct | `com/immediasemi/blink/common/device/registry/DeviceRegistryPatchBody.java` |
| `AccessPoint` | object | 7 | direct | `com/immediasemi/blink/common/device/ringsos/AccessPoint.java` |
| `AccessPointListResponse` | object | 3 | direct | `com/immediasemi/blink/common/device/ringsos/AccessPointListResponse.java` |
| `ApIpConfig` | object | 8 | direct | `com/immediasemi/blink/common/device/ringsos/ApIpConfig.java` |
| `ApWirelessConfig` | object | 5 | direct | `com/immediasemi/blink/common/device/ringsos/ApWirelessConfig.java` |
| `AudioConfig` | object | 1 | direct | `com/immediasemi/blink/common/device/ringsos/AudioConfig.java` |
| `ChimeAccessoryConfigInfoResponse` | object | 14 | direct | `com/immediasemi/blink/common/device/ringsos/ChimeAccessoryConfigInfoResponse.java` |
| `ClientIpConfig` | object | 5 | direct | `com/immediasemi/blink/common/device/ringsos/ClientIpConfig.java` |
| `ConfigurationsAttributes` | object | 2 | direct | `com/immediasemi/blink/common/device/ringsos/ConfigurationsAttributes.java` |
| `ConfigurationsData` | object | 1 | direct | `com/immediasemi/blink/common/device/ringsos/ConfigurationsData.java` |
| `DeviceConfigurationsResponse` | object | 1 | direct | `com/immediasemi/blink/common/device/ringsos/DeviceConfigurationsResponse.java` |
| `IpConfig` | object | 1 | direct | `com/immediasemi/blink/common/device/ringsos/IpConfig.java` |
| `LedConfig` | object | 1 | direct | `com/immediasemi/blink/common/device/ringsos/LedConfig.java` |
| `NetworkApConfig` | object | 2 | direct | `com/immediasemi/blink/common/device/ringsos/NetworkApConfig.java` |
| `NetworkClientConfig` | object | 3 | direct | `com/immediasemi/blink/common/device/ringsos/NetworkClientConfig.java` |
| `NetworkConfigGetResponse` | object | 10 | direct | `com/immediasemi/blink/common/device/ringsos/NetworkConfigGetResponse.java` |
| `NetworkConfigPostBody` | object | 3 | direct | `com/immediasemi/blink/common/device/ringsos/NetworkConfigPostBody.java` |
| `NetworkConfigStatusResponse` | object | 1 | direct | `com/immediasemi/blink/common/device/ringsos/NetworkConfigStatusResponse.java` |
| `RegionConfigPostBody` | object | 3 | direct | `com/immediasemi/blink/common/device/ringsos/RegionConfigPostBody.java` |
| `RingSosSetupPostBody` | object | 5 | direct | `com/immediasemi/blink/common/device/ringsos/RingSosSetupPostBody.java` |
| `RingSosSetupResponse` | object | 3 | direct | `com/immediasemi/blink/common/device/ringsos/RingSosSetupResponse.java` |
| `SosDeviceOtaStatusResponse` | object | 3 | direct | `com/immediasemi/blink/common/device/ringsos/SosDeviceOtaStatusResponse.java` |
| `SosDeviceSetupStatusResponse` | object | 2 | direct | `com/immediasemi/blink/common/device/ringsos/SosDeviceSetupStatusResponse.java` |
| `SosSetupPostBody` | object | 8 | direct | `com/immediasemi/blink/common/device/ringsos/SosSetupPostBody.java` |
| `SosSetupResponse` | object | 3 | direct | `com/immediasemi/blink/common/device/ringsos/SosSetupResponse.java` |
| `UpdateSosDeviceBody` | object | 1 | direct | `com/immediasemi/blink/common/device/ringsos/UpdateSosDeviceBody.java` |
| `WirelessConfig` | object | 8 | direct | `com/immediasemi/blink/common/device/ringsos/WirelessConfig.java` |
| `FeatureFlag` | object | 2 | direct | `com/immediasemi/blink/common/flag/FeatureFlag.java` |
| `FeatureFlagsResponse` | object | 2 | direct | `com/immediasemi/blink/common/flag/FeatureFlagsResponse.java` |
| `EventName` | enum | 1 | direct | `com/immediasemi/blink/common/log/event/EventName.java` |
| `AccessHomescreen` | object | 1 | direct | `com/immediasemi/blink/common/subscription/AccessHomescreen.java` |
| `AccessItem` | object | 3 | direct | `com/immediasemi/blink/common/subscription/AccessItem.java` |
| `AccessItemStatus` | object | 4 | direct | `com/immediasemi/blink/common/subscription/AccessItemStatus.java` |
| `AccessResponse` | object | 3 | direct | `com/immediasemi/blink/common/subscription/AccessResponse.java` |
| `AccessTarget` | object | 3 | direct | `com/immediasemi/blink/common/subscription/AccessTarget.java` |
| `AttachPlanBody` | object | 2 | direct | `com/immediasemi/blink/common/subscription/basic/AttachPlanBody.java` |
| `DeviceEligibility` | object | 4 | direct | `com/immediasemi/blink/common/subscription/basic/DeviceEligibility.java` |
| `DeviceEligibilityResponse` | object | 1 | direct | `com/immediasemi/blink/common/subscription/basic/DeviceEligibilityResponse.java` |
| `Subscription` | object | 11 | direct | `com/immediasemi/blink/common/subscription/Subscription.java` |
| `SubscriptionBanner` | object | 3 | direct | `com/immediasemi/blink/common/subscription/SubscriptionBanner.java` |
| `SubscriptionCycle` | object | 4 | direct | `com/immediasemi/blink/common/subscription/SubscriptionCycle.java` |
| `SubscriptionPlan` | object | 2 | direct | `com/immediasemi/blink/common/subscription/SubscriptionPlan.java` |
| `SubscriptionPlansResponse` | object | 6 | direct | `com/immediasemi/blink/common/subscription/SubscriptionPlansResponse.java` |
| `SubscriptionTrial` | object | 3 | direct | `com/immediasemi/blink/common/subscription/trial/SubscriptionTrial.java` |
| `SubscriptionTrialPopup` | enum | 4 | direct | `com/immediasemi/blink/common/subscription/trial/SubscriptionTrialPopup.java` |
| `UpsellEligibility` | object | 4 | direct | `com/immediasemi/blink/common/subscription/upsell/UpsellEligibility.java` |
| `AddNetworkBody` | object | 7 | direct | `com/immediasemi/blink/common/system/AddNetworkBody.java` |
| `LinkManifest` | object | 3 | direct | `com/immediasemi/blink/common/url/LinkManifest.java` |
| `LocaleUrlMap` | object | 3 | direct | `com/immediasemi/blink/common/url/LocaleUrlMap.java` |
| `AddAccessoryBody` | object | 2 | direct | `com/immediasemi/blink/device/accessory/AddAccessoryBody.java` |
| `DeleteAccessoryBody` | object | 1 | direct | `com/immediasemi/blink/device/accessory/DeleteAccessoryBody.java` |
| `DetectionModes` | object | 3 | direct | `com/immediasemi/blink/device/camera/setting/motion/DetectionModes.java` |
| `MotionRecordingSetting` | object | 1 | direct | `com/immediasemi/blink/device/camera/setting/motion/MotionRecordingSetting.java` |
| `ActivityZonesVersion` | enum | 1 | direct | `com/immediasemi/blink/device/camera/zone/ActivityZonesVersion.java` |
| `AdvancedCameraZones` | object | 4 | direct | `com/immediasemi/blink/device/camera/zone/api/AdvancedCameraZones.java` |
| `PrivacyZoneSpan` | object | 4 | direct | `com/immediasemi/blink/device/camera/zone/api/PrivacyZoneSpan.java` |
| `ZoneV2Response` | object | 8 | direct | `com/immediasemi/blink/device/camera/zone/api/ZoneV2Response.java` |
| `BulkLocationAssignment` | object | 2 | direct | `com/immediasemi/blink/device/network/BulkLocationAssignment.java` |
| `BulkLocationAssignmentRequest` | object | 2 | direct | `com/immediasemi/blink/device/network/BulkLocationAssignmentRequest.java` |
| `BulkLocationAssignmentResponse` | object | 2 | direct | `com/immediasemi/blink/device/network/BulkLocationAssignmentResponse.java` |
| `CameraActionKommand` | object | 7 | direct | `com/immediasemi/blink/device/network/command/CameraActionKommand.java` |
| `Kommand` | object | 2 | direct | `com/immediasemi/blink/device/network/command/Kommand.java` |
| `PollingResponse` | enum | 6 | direct | `com/immediasemi/blink/device/network/command/PollingResponse.java` |
| `SupervisorKommand` | object | 7 | direct | `com/immediasemi/blink/device/network/command/SupervisorKommand.java` |
| `AddCameraBody` | object | 3 | direct | `com/immediasemi/blink/device/onboard/camera/AddCameraBody.java` |
| `AddLotusBody` | object | 3 | direct | `com/immediasemi/blink/device/onboard/doorbell/add/AddLotusBody.java` |
| `OnboardingBody` | object | 2 | direct | `com/immediasemi/blink/device/onboard/OnboardingBody.java` |
| `DayOfWeek` | enum | 3 | direct | `com/immediasemi/blink/device/setting/DayOfWeek.java` |
| `CreateLinkRequest` | object | 7 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/CreateLinkRequest.java` |
| `CreateLinkResponse` | object | 4 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/CreateLinkResponse.java` |
| `DeviceLink` | object | 5 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/DeviceLink.java` |
| `DeviceLinksResponse` | object | 2 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/DeviceLinksResponse.java` |
| `LinkedDevice` | object | 2 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/LinkedDevice.java` |
| `LinkObject` | object | 2 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/LinkObject.java` |
| `AccessPoints` | object | 5 | direct | `com/immediasemi/blink/device/wifi/AccessPoints.java` |
| `AdditionalTrialBody` | object | 1 | direct | `com/immediasemi/blink/home/additionaltrial/AdditionalTrialBody.java` |
| `Attributes` | object | 6 | direct | `com/immediasemi/blink/models/accessory/chime/Attributes.java` |
| `AttributesType` | enum | 1 | direct | `com/immediasemi/blink/models/accessory/chime/AttributesType.java` |
| `ChimeSignalStrength` | enum | 1 | direct | `com/immediasemi/blink/models/accessory/chime/ChimeSignalStrength.java` |
| `AccessoryConfig` | object | 8 | direct | `com/immediasemi/blink/models/AccessoryConfig.java` |
| `AddCameraResponseBody` | object | 3 | direct | `com/immediasemi/blink/models/AddCameraResponseBody.java` |
| `ANetwork` | object | 1 | direct | `com/immediasemi/blink/models/ANetwork.java` |
| `CameraConfig` | object | 4 | direct | `com/immediasemi/blink/models/CameraConfig.java` |
| `CameraConfigInfo` | object | 84 | direct | `com/immediasemi/blink/models/CameraConfigInfo.java` |
| `Command` | object | 19 | direct | `com/immediasemi/blink/models/Command.java` |
| `CreateProgramBody` | object | 6 | direct | `com/immediasemi/blink/models/CreateProgramBody.java` |
| `FloodlightProgramConfig` | object | 3 | direct | `com/immediasemi/blink/models/FloodlightProgramConfig.java` |
| `LightAccessoryConfig` | object | 11 | direct | `com/immediasemi/blink/models/LightAccessoryConfig.java` |
| `LightStatus` | enum | 2 | direct | `com/immediasemi/blink/models/LightStatus.java` |
| `LotusChimeConfig` | object | 9 | direct | `com/immediasemi/blink/models/LotusChimeConfig.java` |
| `LotusConfigInfo` | object | 55 | direct | `com/immediasemi/blink/models/LotusConfigInfo.java` |
| `OwlConfigInfo` | object | 58 | direct | `com/immediasemi/blink/models/OwlConfigInfo.java` |
| `PanTiltAccessoryConfig` | object | 1 | direct | `com/immediasemi/blink/models/PanTiltAccessoryConfig.java` |
| `ProgramConfig` | object | 11 | direct | `com/immediasemi/blink/models/ProgramConfig.java` |
| `RosieConfig` | object | 5 | direct | `com/immediasemi/blink/models/RosieConfig.java` |
| `SignalStrength` | object | 6 | direct | `com/immediasemi/blink/models/SignalStrength.java` |
| `SuperiorConfig` | object | 9 | direct | `com/immediasemi/blink/models/SuperiorConfig.java` |
| `TestLotusDingConfig` | object | 3 | direct | `com/immediasemi/blink/models/TestLotusDingConfig.java` |
| `UpdateLotusBody` | object | 28 | direct | `com/immediasemi/blink/models/UpdateLotusBody.java` |
| `UpdateLotusChimeConfig` | object | 1 | direct | `com/immediasemi/blink/models/UpdateLotusChimeConfig.java` |
| `UpdateOwlBody` | object | 32 | direct | `com/immediasemi/blink/models/UpdateOwlBody.java` |
| `VideoNetworkConfig` | object | 2 | direct | `com/immediasemi/blink/models/VideoNetworkConfig.java` |
| `VideoNetworks` | object | 3 | direct | `com/immediasemi/blink/models/VideoNetworks.java` |
| `VideoNetworksConfig` | object | 2 | direct | `com/immediasemi/blink/models/VideoNetworksConfig.java` |
| `DetectionType` | enum | 1 | direct | `com/immediasemi/blink/notification/DetectionType.java` |
| `Accessory` | object | 8 | direct | `com/immediasemi/blink/p021db/accessories/Accessory.java` |
| `AccessoryTarget` | enum | 1 | direct | `com/immediasemi/blink/p021db/accessories/AccessoryTarget.java` |
| `AccessoryType` | enum | 1 | direct | `com/immediasemi/blink/p021db/accessories/AccessoryType.java` |
| `BatteryStatus` | enum | 1 | direct | `com/immediasemi/blink/p021db/accessories/BatteryStatus.java` |
| `AccessName` | enum | 1 | direct | `com/immediasemi/blink/p021db/enums/AccessName.java` |
| `AccessReason` | enum | 1 | direct | `com/immediasemi/blink/p021db/enums/AccessReason.java` |
| `AccessStatus` | enum | 1 | direct | `com/immediasemi/blink/p021db/enums/AccessStatus.java` |
| `EntitlementReason` | enum | 2 | direct | `com/immediasemi/blink/p021db/enums/EntitlementReason.java` |
| `EntitlementStatus` | enum | 2 | direct | `com/immediasemi/blink/p021db/enums/EntitlementStatus.java` |
| `EventDataKey` | enum | 2 | direct | `com/immediasemi/blink/p021db/EventDataKey.java` |
| `NetworkRepository` | object | 0 | inferred | `com/immediasemi/blink/p021db/NetworkRepository.java` |
| `AuthenticatorSelection` | object | 4 | direct | `com/immediasemi/blink/passkey/AuthenticatorSelection.java` |
| `ExcludeCredential` | object | 4 | direct | `com/immediasemi/blink/passkey/ExcludeCredential.java` |
| `PubKeyCredParam` | object | 2 | direct | `com/immediasemi/blink/passkey/PubKeyCredParam.java` |
| `PublicKeyCredentialData` | object | 3 | direct | `com/immediasemi/blink/passkey/PublicKeyCredentialData.java` |
| `RegistrationRequest` | object | 2 | direct | `com/immediasemi/blink/passkey/RegistrationRequest.java` |
| `RegistrationResponse` | object | 9 | direct | `com/immediasemi/blink/passkey/RegistrationResponse.java` |
| `RelyingParty` | object | 2 | direct | `com/immediasemi/blink/passkey/RelyingParty.java` |
| `VerifyOtpResponse` | object | 1 | direct | `com/immediasemi/blink/passkey/VerifyOtpResponse.java` |
| `VerifyRegistrationRequest` | object | 4 | direct | `com/immediasemi/blink/passkey/VerifyRegistrationRequest.java` |
| `WebAuthnUser` | object | 3 | direct | `com/immediasemi/blink/passkey/WebAuthnUser.java` |
| `Program` | object | 8 | direct | `com/immediasemi/blink/scheduling/Program.java` |
| `ScheduleAction` | object | 8 | direct | `com/immediasemi/blink/scheduling/ScheduleAction.java` |
| `ScheduleEvent` | object | 4 | direct | `com/immediasemi/blink/scheduling/ScheduleEvent.java` |
| `UpdateProgramRequest` | object | 6 | direct | `com/immediasemi/blink/scheduling/UpdateProgramRequest.java` |
| `AcceptInvitationBody` | object | 1 | direct | `com/immediasemi/blink/settings/access/accept/AcceptInvitationBody.java` |
| `CheckAuthorizationResponse` | object | 1 | direct | `com/immediasemi/blink/settings/access/accept/CheckAuthorizationResponse.java` |
| `AccessSummary` | object | 6 | direct | `com/immediasemi/blink/settings/access/AccessSummary.java` |
| `SendInviteBody` | object | 1 | direct | `com/immediasemi/blink/settings/access/SendInviteBody.java` |
| `AlexaLinkingAuthorizePostBody` | object | 5 | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingAuthorizePostBody.java` |
| `AlexaLinkingAuthorizeResponse` | object | 1 | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingAuthorizeResponse.java` |
| `AlexaLinkingLinkPostBody` | object | 2 | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingLinkPostBody.java` |
| `AlexaLinkStatus` | object | 3 | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkStatus.java` |
| `DataRequests` | object | 5 | direct | `com/immediasemi/blink/settings/account/managedata/DataRequests.java` |
| `SubmitDataRequestResponse` | object | 1 | direct | `com/immediasemi/blink/settings/account/managedata/SubmitDataRequestResponse.java` |
| `ThirdPartyAuthorization` | object | 6 | direct | `com/immediasemi/blink/settings/account/managedata/ThirdPartyAuthorization.java` |
| `ChangeEmailPostBody` | object | 2 | direct | `com/immediasemi/blink/settings/email/ChangeEmailPostBody.java` |
| `EnrollmentImage` | object | 3 | direct | `com/immediasemi/blink/settings/knownfaces/identities/EnrollmentImage.java` |
| `EnrollmentImageAttributes` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/identities/EnrollmentImageAttributes.java` |
| `EnrollmentImageRef` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/identities/EnrollmentImageRef.java` |
| `EnrollmentImageRelationship` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/identities/EnrollmentImageRelationship.java` |
| `EnrollmentImageResource` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/identities/EnrollmentImageResource.java` |
| `IdentitiesMeta` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesMeta.java` |
| `IdentitiesResponse` | object | 3 | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesResponse.java` |
| `Identity` | object | 8 | direct | `com/immediasemi/blink/settings/knownfaces/identities/Identity.java` |
| `IdentityAttributes` | object | 6 | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentityAttributes.java` |
| `IdentityResource` | object | 3 | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentityResource.java` |
| `IdentityResponse` | object | 3 | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentityResponse.java` |
| `MergeIdentitiesMeta` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/identities/MergeIdentitiesMeta.java` |
| `MergeIdentitiesRequest` | object | 3 | direct | `com/immediasemi/blink/settings/knownfaces/identities/MergeIdentitiesRequest.java` |
| `MergeIdentityRef` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/identities/MergeIdentityRef.java` |
| `MoveEnrollmentImagesData` | object | 3 | direct | `com/immediasemi/blink/settings/knownfaces/identities/MoveEnrollmentImagesData.java` |
| `MoveEnrollmentImagesRelationships` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/identities/MoveEnrollmentImagesRelationships.java` |
| `MoveEnrollmentImagesRequest` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/identities/MoveEnrollmentImagesRequest.java` |
| `SplitIdentityAttributes` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/identities/SplitIdentityAttributes.java` |
| `SplitIdentityData` | object | 3 | direct | `com/immediasemi/blink/settings/knownfaces/identities/SplitIdentityData.java` |
| `SplitIdentityRelationships` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/identities/SplitIdentityRelationships.java` |
| `SplitIdentityRequest` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/identities/SplitIdentityRequest.java` |
| `SplitIdentityResponse` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/identities/SplitIdentityResponse.java` |
| `UpdateIdentityAttributes` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/identities/UpdateIdentityAttributes.java` |
| `UpdateIdentityData` | object | 3 | direct | `com/immediasemi/blink/settings/knownfaces/identities/UpdateIdentityData.java` |
| `UpdateIdentityRequest` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/identities/UpdateIdentityRequest.java` |
| `FamiliarFacesUpdate` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/optin/FamiliarFacesUpdate.java` |
| `RdisDeviceRelationships` | object | 3 | direct | `com/immediasemi/blink/settings/knownfaces/optin/RdisDeviceRelationships.java` |
| `RdisDeviceResource` | object | 4 | direct | `com/immediasemi/blink/settings/knownfaces/optin/RdisDeviceResource.java` |
| `RdisMeta` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/optin/RdisMeta.java` |
| `RdisResponse` | object | 4 | direct | `com/immediasemi/blink/settings/knownfaces/optin/RdisResponse.java` |
| `UpdateDeviceConfigurationAttributes` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/optin/UpdateDeviceConfigurationAttributes.java` |
| `UpdateDeviceConfigurationData` | object | 3 | direct | `com/immediasemi/blink/settings/knownfaces/optin/UpdateDeviceConfigurationData.java` |
| `UpdateDeviceConfigurationRequest` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/optin/UpdateDeviceConfigurationRequest.java` |
| `SeaDevice` | object | 10 | direct | `com/immediasemi/blink/settings/notifications/sea/SeaDevice.java` |
| `SeaDeviceUpdate` | object | 3 | direct | `com/immediasemi/blink/settings/notifications/sea/SeaDeviceUpdate.java` |
| `SingleEventAlertsPostBody` | object | 2 | direct | `com/immediasemi/blink/settings/notifications/sea/SingleEventAlertsPostBody.java` |
| `SingleEventAlertsResponse` | object | 4 | direct | `com/immediasemi/blink/settings/notifications/sea/SingleEventAlertsResponse.java` |
| `SetTivLockResponse` | object | 1 | direct | `com/immediasemi/blink/settings/privacy/SetTivLockResponse.java` |
| `TivLockBody` | object | 1 | direct | `com/immediasemi/blink/settings/privacy/TivLockBody.java` |
| `TivLockStatus` | object | 2 | direct | `com/immediasemi/blink/settings/privacy/TivLockStatus.java` |
| `CreateSharedLoginBody` | object | 3 | direct | `com/immediasemi/blink/settings/sharedlogin/model/CreateSharedLoginBody.java` |
| `GetSharedLoginResponse` | object | 3 | direct | `com/immediasemi/blink/settings/sharedlogin/model/GetSharedLoginResponse.java` |
| `PostSharedLoginClaimResponse` | object | 3 | direct | `com/immediasemi/blink/settings/sharedlogin/model/PostSharedLoginClaimResponse.java` |
| `PostSharedLoginResponse` | object | 2 | direct | `com/immediasemi/blink/settings/sharedlogin/model/PostSharedLoginResponse.java` |
| `PostSharedLoginVerifyResponse` | object | 1 | direct | `com/immediasemi/blink/settings/sharedlogin/model/PostSharedLoginVerifyResponse.java` |
| `RevokeSharedLoginBody` | object | 2 | direct | `com/immediasemi/blink/settings/sharedlogin/model/RevokeSharedLoginBody.java` |
| `SharedLoginClaimBody` | object | 2 | direct | `com/immediasemi/blink/settings/sharedlogin/model/SharedLoginClaimBody.java` |
| `SharedLoginItem` | object | 8 | direct | `com/immediasemi/blink/settings/sharedlogin/model/SharedLoginItem.java` |
| `SharedLoginVerifyBody` | object | 1 | direct | `com/immediasemi/blink/settings/sharedlogin/model/SharedLoginVerifyBody.java` |
| `SmartVideoDescriptionsPostBody` | object | 3 | direct | `com/immediasemi/blink/settings/SmartVideoDescriptionsPostBody.java` |
| `SmartVideoDescriptionsResponse` | object | 4 | direct | `com/immediasemi/blink/settings/SmartVideoDescriptionsResponse.java` |
| `SvdDevice` | object | 7 | direct | `com/immediasemi/blink/settings/SvdDevice.java` |
| `SvdDeviceUpdate` | object | 3 | direct | `com/immediasemi/blink/settings/SvdDeviceUpdate.java` |
| `AppVersionCheckResponse` | object | 4 | direct | `com/immediasemi/blink/update/AppVersionCheckResponse.java` |
| `CommandPollingType` | object | 0 | inferred | `com/immediasemi/blink/utils/CommandPollingType.java` |
| `DspSubscriptionResponse` | object | 2 | direct | `com/immediasemi/blink/utils/DspSubscriptionResponse.java` |
| `GetFirmwareEndpointResponse` | object | 2 | direct | `com/immediasemi/blink/utils/GetFirmwareEndpointResponse.java` |
| `MapLinkBody` | object | 6 | direct | `com/immediasemi/blink/utils/MapLinkBody.java` |
| `SubscriptionRequestStatusBody` | object | 2 | direct | `com/immediasemi/blink/utils/SubscriptionRequestStatusBody.java` |
| `SubscriptionRequestStatusResponse` | object | 3 | direct | `com/immediasemi/blink/utils/SubscriptionRequestStatusResponse.java` |
| `BatteryExtensionPackAccessoryApi` | object | 4 | direct | `com/immediasemi/blink/utils/sync/BatteryExtensionPackAccessoryApi.java` |
| `CameraSignals` | object | 2 | direct | `com/immediasemi/blink/utils/sync/CameraSignals.java` |
| `CamerasV3` | object | 28 | direct | `com/immediasemi/blink/utils/sync/CamerasV3.java` |
| `DeviceLimits` | object | 6 | direct | `com/immediasemi/blink/utils/sync/DeviceLimits.java` |
| `DoorbellsV3` | object | 29 | direct | `com/immediasemi/blink/utils/sync/DoorbellsV3.java` |
| `HomeScreen` | object | 17 | direct | `com/immediasemi/blink/utils/sync/HomeScreen.java` |
| `HomescreenAccount` | object | 4 | direct | `com/immediasemi/blink/utils/sync/HomescreenAccount.java` |
| `LocationHomescreen` | object | 1 | direct | `com/immediasemi/blink/utils/sync/LocationHomescreen.java` |
| `NetworksV3` | object | 9 | direct | `com/immediasemi/blink/utils/sync/NetworksV3.java` |
| `OwlsV3` | object | 28 | direct | `com/immediasemi/blink/utils/sync/OwlsV3.java` |
| `RingDevice` | object | 7 | direct | `com/immediasemi/blink/utils/sync/RingDevice.java` |
| `RingDeviceHealth` | object | 1 | direct | `com/immediasemi/blink/utils/sync/RingDeviceHealth.java` |
| `SyncModulesV3` | object | 17 | direct | `com/immediasemi/blink/utils/sync/SyncModulesV3.java` |
| `VideoStats` | object | 4 | direct | `com/immediasemi/blink/utils/sync/VideoStats.java` |
| `VerifyLinkAccountBody` | object | 1 | direct | `com/immediasemi/blink/utils/VerifyLinkAccountBody.java` |
| `BatchDonationRequest` | object | 5 | direct | `com/immediasemi/blink/video/clip/donation/api/BatchDonationRequest.java` |
| `BatchDonationResponse` | object | 3 | direct | `com/immediasemi/blink/video/clip/donation/api/BatchDonationResponse.java` |
| `DonationClipRequest` | object | 5 | direct | `com/immediasemi/blink/video/clip/donation/api/DonationClipRequest.java` |
| `DonationTranscoding` | object | 5 | direct | `com/immediasemi/blink/video/clip/donation/api/DonationTranscoding.java` |
| `UnprocessedDonationEvent` | object | 6 | direct | `com/immediasemi/blink/video/clip/donation/api/UnprocessedDonationEvent.java` |
| `AiVideoDescription` | object | 2 | direct | `com/immediasemi/blink/video/clip/media/AiVideoDescription.java` |
| `BackendMedia` | object | 27 | direct | `com/immediasemi/blink/video/clip/media/BackendMedia.java` |
| `EventType` | enum | 1 | direct | `com/immediasemi/blink/video/clip/media/EventType.java` |
| `FavoriteEventIdsBody` | object | 2 | direct | `com/immediasemi/blink/video/clip/media/FavoriteEventIdsBody.java` |
| `MediaPostBody` | object | 8 | direct | `com/immediasemi/blink/video/clip/media/MediaPostBody.java` |
| `MediaProfile` | object | 5 | direct | `com/immediasemi/blink/video/clip/media/MediaProfile.java` |
| `MediaResponse` | object | 6 | direct | `com/immediasemi/blink/video/clip/media/MediaResponse.java` |
| `MediaSettingsPatch` | object | 1 | direct | `com/immediasemi/blink/video/clip/media/MediaSettingsPatch.java` |
| `MediaSettingsResponse` | object | 4 | direct | `com/immediasemi/blink/video/clip/media/MediaSettingsResponse.java` |
| `UnusualActivity` | object | 2 | direct | `com/immediasemi/blink/video/clip/media/UnusualActivity.java` |
| `UnwatchedMediaResponse` | object | 1 | direct | `com/immediasemi/blink/video/clip/media/UnwatchedMediaResponse.java` |
| `SummarizeClipsRequest` | object | 2 | direct | `com/immediasemi/blink/video/clip/moment/SummarizeClipsRequest.java` |
| `SummarizeClipsResponse` | object | 1 | direct | `com/immediasemi/blink/video/clip/moment/SummarizeClipsResponse.java` |
| `Meta` | object | 3 | direct | `com/ring/android/eventstream/dtos/Meta.java` |
| `MetaData` | object | 8 | direct | `com/ring/android/eventstream/dtos/MetaData.java` |
| `SessionDataProvider` | object | 0 | inferred | `com/ring/android/eventstream/utils/SessionDataProvider.java` |
| `ApiFactoryDeviceProfile` | object | 7 | direct | `com/ring/blueprints/setup/core/data/backend/ApiFactoryDeviceProfile.java` |
| `ApiSetup` | object | 6 | direct | `com/ring/blueprints/setup/core/data/backend/ApiSetup.java` |
| `ApiSetupStatus` | object | 13 | direct | `com/ring/blueprints/setup/core/data/backend/ApiSetupStatus.java` |
| `CompleteSetupBody` | object | 5 | direct | `com/ring/blueprints/setup/core/data/backend/CompleteSetupBody.java` |
| `DeviceFirmwareResponse` | object | 4 | direct | `com/ring/blueprints/setup/core/data/entity/DeviceFirmwareResponse.java` |
| `BlinkMetadata` | object | 2 | direct | `com/ringapp/orchestratorapi/data/BlinkMetadata.java` |
| `DeleteMultipleEventsRequest` | object | 1 | direct | `com/ringapp/orchestratorapi/data/DeleteMultipleEventsRequest.java` |
| `EventRequest` | object | 2 | direct | `com/ringapp/orchestratorapi/data/EventRequest.java` |
| `LensFootageMetadataResponse` | object | 1 | direct | `com/ringapp/orchestratorapi/data/LensFootageMetadataResponse.java` |
| `LensFootageResponse` | object | 5 | direct | `com/ringapp/orchestratorapi/data/LensFootageResponse.java` |
| `Orchestrator24x7ItemResponse` | object | 0 | inferred | `com/ringapp/orchestratorapi/data/Orchestrator24x7ItemResponse.java` |
| `Orchestrator24x7TimelineResponse` | object | 3 | direct | `com/ringapp/orchestratorapi/data/Orchestrator24x7TimelineResponse.java` |
| `Orchestrator24x7TimeSlotResponse` | object | 4 | direct | `com/ringapp/orchestratorapi/data/Orchestrator24x7TimeSlotResponse.java` |
| `OrchestratorBatchRequestBody` | object | 1 | direct | `com/ringapp/orchestratorapi/data/OrchestratorBatchRequestBody.java` |
| `OrchestratorCloudMediaMetadataResponse` | object | 10 | direct | `com/ringapp/orchestratorapi/data/OrchestratorCloudMediaMetadataResponse.java` |
| `OrchestratorCloudMediaResponse` | object | 10 | direct | `com/ringapp/orchestratorapi/data/OrchestratorCloudMediaResponse.java` |
| `OrchestratorCloudMediaVisualizationResponse` | object | 2 | direct | `com/ringapp/orchestratorapi/data/OrchestratorCloudMediaVisualizationResponse.java` |
| `OrchestratorCvResponse` | object | 10 | direct | `com/ringapp/orchestratorapi/data/OrchestratorCvResponse.java` |
| `OrchestratorDetectionDetail` | object | 3 | direct | `com/ringapp/orchestratorapi/data/OrchestratorDetectionDetail.java` |
| `OrchestratorDeviceResponse` | object | 3 | direct | `com/ringapp/orchestratorapi/data/OrchestratorDeviceResponse.java` |
| `OrchestratorEventAnomalyResponse` | object | 2 | direct | `com/ringapp/orchestratorapi/data/OrchestratorEventAnomalyResponse.java` |
| `OrchestratorEventResponse` | object | 26 | direct | `com/ringapp/orchestratorapi/data/OrchestratorEventResponse.java` |
| `OrchestratorEventSimilarityResponse` | object | 1 | direct | `com/ringapp/orchestratorapi/data/OrchestratorEventSimilarityResponse.java` |
| `OrchestratorExtendedSearchRequestBody` | object | 5 | direct | `com/ringapp/orchestratorapi/data/OrchestratorExtendedSearchRequestBody.java` |
| `OrchestratorFeedElementResponse` | object | 2 | direct | `com/ringapp/orchestratorapi/data/OrchestratorFeedElementResponse.java` |
| `OrchestratorFeedResponse` | object | 5 | direct | `com/ringapp/orchestratorapi/data/OrchestratorFeedResponse.java` |
| `OrchestratorFootageMetadataResponse` | object | 1 | direct | `com/ringapp/orchestratorapi/data/OrchestratorFootageMetadataResponse.java` |
| `OrchestratorFootageResponse` | object | 10 | direct | `com/ringapp/orchestratorapi/data/OrchestratorFootageResponse.java` |
| `OrchestratorGroupResponse` | object | 6 | direct | `com/ringapp/orchestratorapi/data/OrchestratorGroupResponse.java` |
| `OrchestratorItemsResponse` | object | 3 | direct | `com/ringapp/orchestratorapi/data/OrchestratorItemsResponse.java` |
| `OrchestratorLocalMediaMetadataResponse` | object | 6 | direct | `com/ringapp/orchestratorapi/data/OrchestratorLocalMediaMetadataResponse.java` |
| `OrchestratorLocalMediaResponse` | object | 12 | direct | `com/ringapp/orchestratorapi/data/OrchestratorLocalMediaResponse.java` |
| `OrchestratorLocalMediaVisualizationResponse` | object | 2 | direct | `com/ringapp/orchestratorapi/data/OrchestratorLocalMediaVisualizationResponse.java` |
| `OrchestratorMapVisualizationResponse` | object | 8 | direct | `com/ringapp/orchestratorapi/data/OrchestratorMapVisualizationResponse.java` |
| `OrchestratorMediaTrack` | object | 3 | direct | `com/ringapp/orchestratorapi/data/OrchestratorMediaTrack.java` |
| `OrchestratorPotentialGapResponse` | object | 4 | direct | `com/ringapp/orchestratorapi/data/OrchestratorPotentialGapResponse.java` |
| `OrchestratorPropertiesResponse` | object | 5 | direct | `com/ringapp/orchestratorapi/data/OrchestratorPropertiesResponse.java` |
| `OrchestratorRadarVisualizationResponse` | object | 3 | direct | `com/ringapp/orchestratorapi/data/OrchestratorRadarVisualizationResponse.java` |
| `OrchestratorSearchMetadataResponse` | object | 3 | direct | `com/ringapp/orchestratorapi/data/OrchestratorSearchMetadataResponse.java` |
| `OrchestratorSupplementalDataResponse` | object | 1 | direct | `com/ringapp/orchestratorapi/data/OrchestratorSupplementalDataResponse.java` |
| `OrchestratorThirdPartyPartner` | object | 1 | direct | `com/ringapp/orchestratorapi/data/OrchestratorThirdPartyPartner.java` |
| `OrchestratorTimelineResponse` | object | 4 | direct | `com/ringapp/orchestratorapi/data/OrchestratorTimelineResponse.java` |
| `OrchestratorVisualizationsResponse` | object | 5 | direct | `com/ringapp/orchestratorapi/data/OrchestratorVisualizationsResponse.java` |
| `ProcessingInfo` | object | 2 | direct | `com/ringapp/orchestratorapi/data/ProcessingInfo.java` |
| `QueryCategory` | enum | 4 | direct | `com/ringapp/orchestratorapi/data/QueryCategory.java` |
| `SearchQuery` | object | 2 | direct | `com/ringapp/orchestratorapi/data/SearchQuery.java` |
| `UnwatchedCountResponse` | object | 1 | direct | `com/ringapp/orchestratorapi/data/UnwatchedCountResponse.java` |
| `WatchEventsRequest` | object | 1 | direct | `com/ringapp/orchestratorapi/data/WatchEventsRequest.java` |
| `FeedElementType` | enum | 2 | direct | `com/ringapp/playback/historyevent/FeedElementType.java` |
| `SerialDescriptor` | object | 0 | inferred | `kotlinx/serialization/descriptors/SerialDescriptor.java` |
| `Pattern` | object | 0 | inferred | `org/intellij/lang/annotations/Pattern.java` |

## Command, polling, retry, and error semantics

- Command-producing endpoints are identified by response model and feature, but server status codes not declared in the APK remain unknown.
- Static polling/retry semantics are retained as service-level evidence; they must not be treated as proof of current server timing.
- No new 59.2 Retrofit declaration establishes a general HTTP 409 serialization or retry contract.

## Dynamic transports

- RDIS/DUOS: Blink 59.2 contains a unified device-settings transport that can route newer device families through device orchestration rather than traditional camera configuration calls.
- Event stream: client event submission uses the production event-stream service and optional explicit authorization.
- Live view and streaming: command negotiation remains REST-backed; returned runtime hosts/tokens drive subsequent streaming.
- Local device: Sync Module onboarding and Wi-Fi routes use the local device base and are distinct from cloud bearer authentication.

## 57.1 → 59.2 change report

- Added: 15
- Changed: 19
- Unchanged: 284
- Removed: 1

### Added

- `POST 2fa/v1/webauthn/registration` (authentication)
- `POST 2fa/v1/webauthn/registration/verify` (authentication)
- `GET device_info/v4/devices/{deviceId}` (device-orchestration)
- `POST oauth/v2/verify_otp` (oauth)
- `PATCH devices/{deviceId}` (rest)
- `POST evm/v2/events` (rest)
- `POST evm/v2/events/watch` (rest)
- `GET evm/v2/history/unwatched/count` (rest)
- `POST setups` (rest)
- `GET setups/{setupId}` (rest)
- `POST setups/{setupId}/complete` (rest)
- `PUT share_service/v3/batch_shares` (rest)
- `GET sos/v1/factory_profile` (rest)
- `POST v4/accounts/{injected_account_id}/media/favorite` (shared-rest)
- `POST v4/accounts/{injected_account_id}/media/unfavorite` (shared-rest)

### Changed

- `PUT duos/v1/devices/{deviceId}/update` (device-orchestration)
- `PUT duos/v1/devices/{deviceId}/update` (device-orchestration)
- `PATCH devices/v1/devices/{deviceId}` (rest)
- `GET evm/v2/history/devices` (rest)
- `GET evm/v2/history/events/{eventId}` (rest)
- `POST evm/v2/history/extendedsearch` (rest)
- `GET evm/v2/metadata/history/devices` (rest)
- `GET evm/v2/timeline/24/devices/{source_id}` (rest)
- `GET evm/v2/timeline/devices/{doorbotId}` (rest)
- `GET evm/v2/timeline/events/eventito/{source_id}` (rest)
- `GET evm/v3/history/devices` (rest)
- `POST evm/v3/history/events` (rest)
- `POST v4/clients/{injected_client_id}/email_change` (rest)
- `POST v5/clients/{injected_client_id}/phone_number_change` (rest)
- `POST accounts/{injected_account_id}/networks/{network}/commands/{command}/update` (shared-rest)
- `POST accounts/{injected_account_id}/networks/{network}/update` (shared-rest)
- `POST accounts/{injected_account_id}/networks/{network}/update` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/owls/add` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/change_wifi` (shared-rest)

### Removed

- `GET v3/accounts/{injected_account_id}/subscriptions/plans` (shared-rest)

## Third-party exclusions

| Host | Owner | Reason |
|---|---|---|
| 172.16.97.199 | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| 192.168.240.1 | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| accounts.google.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| aomedia.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| apache.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| api | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| api-events-config-staging.tilestream.net | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| api-events-staging.tilestream.net | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| api.mapbox.com | Mapbox | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| api.tokenblink.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| app-content.ring.com | Blink/Ring static content or observability | First-party host, but not an application API contract. |
| app-measurement.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| apps.mapbox.com | Mapbox | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| arcus-uswest.amazon.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| beta.site.blink.com | Blink/Ring static content or observability | First-party host, but not an application API contract. |
| blink-6c1ea.firebaseio.com | Google Firebase | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| blink.com | Blink/Ring static content or observability | First-party host, but not an application API contract. |
| blink.helpjuice.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| blinkforhome.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| bugsnag.com | Bugsnag | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| c | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| clientsapigw.us-east-1.beta.v2.gws.ring.amazon.dev | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| cloud.google.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| cloudfront-staging.tilestream.net | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| code.amazon.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| config.mapbox.com | Mapbox | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| d | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| dashif.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| default.url | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| developer.android.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| developer.apple.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| developer.mozilla.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| developers.google.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| docs.bugsnag.com | Bugsnag | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| docs.mapbox.com | Mapbox | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| docs.python.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| download.ring.com | Blink/Ring static content or observability | First-party host, but not an application API contract. |
| dummy.retrofitapibuilder.url | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| e | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| events.mapbox.com | Mapbox | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| events.mobile.crashtracking.prod.ring.com | Blink/Ring static content or observability | First-party host, but not an application API contract. |
| example.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| f | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| fastly.picsum.photos | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| fcmregistrations.googleapis.com | Google | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| firebase-settings.crashlytics.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| firebase.google.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| g.co | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| gamma.site.blink.com | Blink/Ring static content or observability | First-party host, but not an application API contract. |
| github.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| goo.gl | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| goo.gle | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| google.aip.dev | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| google.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| google.github.io | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| iamcache.braze | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| invalid.local | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| issuetracker.google.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| java.sun.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| joda-time.sourceforge.net | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| kotl.in | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| kotlinlang.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| localhost | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| login.blinkforhome.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| notify.bugsnag.com | Bugsnag | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| notify.insighthub.smartbear.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| ns.adobe.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| ns.google.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| pagead2.googlesyndication.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| placeholder.invalid | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| play.google.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| protobuf.dev | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| r.android.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| ring.com | Blink/Ring static content or observability | First-party host, but not an application API contract. |
| s.amazon-adsystem.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| schemas.amazon.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| schemas.android.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| schemas.microsoft.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| sdk.iad-01.braze.com | Braze | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| semver.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| sessions.bugsnag.com | Bugsnag | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| sessions.insighthub.smartbear.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| sessions.mobile.crashtracking.prod.ring.com | Blink/Ring static content or observability | First-party host, but not an application API contract. |
| sondheim.braze.com | Braze | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| specs.openid.net | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| support.blinkforhome.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| support.google.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| support.ring.com | Blink/Ring static content or observability | First-party host, but not an application API contract. |
| tiny.amazon.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| token.token.prod.service.minerva.devices.a2z.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| w.amazon.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| wiki.labcollab.net | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| wrapperns | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.amazon-customtabtest.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.amazon.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.amazonforum.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.apache.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.braze.com | Braze | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| www.example.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.googleadservices.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.googleapis.com | Google | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| www.ietf.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.jetbrains.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.mapbox.com | Mapbox | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| www.slf4j.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.smpte-ra.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.w3.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| x | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| xml.apache.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| xml.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| xmlpull.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| youtrack.jetbrains.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| android.googlesource.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.tensorflow.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| http | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| crashpad.chromium.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| crbug.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| webrtc.googlesource.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.webrtc.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| aomediacodec.github.io | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| crl.comodoca.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| crl.comodo.net | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| descriptionrelatively | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| applicationslink | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| navigation | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| px | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.world | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.years | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| interested | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| familiar | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| was | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| ain | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| whether | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| interpreted | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| addeventlistenerresponsible | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| according | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.interpretation | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| html4 | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| style= | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| staticsuggested | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.a | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| an | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.recent | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| in | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www. | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| cript | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.wencodeuricomponent( | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| encoding= | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.icon | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| imenglish | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| i | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| site_name | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.hortcut | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| iparticipation | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| xt | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| link | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| option | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| w | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| .css | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.style= | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.css | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| ator | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.language= | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www- | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| ua-compatible | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.c | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |

## Unresolved evidence and completeness

- Active normalized contracts: 318
- Models recovered: 499
- Unresolved candidates: 0
- Smali-only contracts: 2
- Active contracts without smali evidence: 0
- Unresolved models: 0
- Unclassified first-party candidates: 0
- JADX reported errors: 606


## Preserved historical and live evidence

The legacy `docs/blink_api_dossier.md` retains evidence IDs E1–E95 and bounded live-account observations. Those observations are not inputs to this static 59.2 contract and remain explicitly distinguished from APK evidence.
