# Blink API Contract — Android 59.2

> Generated from `docs/api-contract/blink-59.2-29823413.json`. Do not edit endpoint tables by hand.

## Acquisition and provenance

- Package: `com.immediasemi.android.blink`
- Version: `59.2` (`29823413`)
- Base APK SHA-256: `b0ee9a502c059e80de09e31dfc3608f78b8d2a2ab9dc58ca35ec234bf0a4bcef`
- Evidence mode: `static-only`
- APK splits: 4; DEX files: 12
- JADX result: completed-with-errors; apktool result: completed

Static evidence describes client declarations and bounded construction evidence. It does not prove current server behavior or authorize live calls. Per-endpoint `recovery` state in the canonical JSON distinguishes resolved declarations from inferred service/authentication mapping and unresolved runtime behavior.

## Service, host, and interceptor map

| Service | Base host template | Active contracts | Authentication |
|---|---|---:|---|
| authentication | `https://rest-{tier}.immedia-semi.com/api/` | 2 | bearer |
| device-orchestration | `dynamic` | 9 | bearer |
| event-stream | `https://prod.eventstream.immedia-semi.com/` | 2 | optional-explicit |
| local-device | `http://172.16.97.199/` | 9 | local-none |
| oauth | `https://api.{env}oauth.blink.com/` | 3 | none |
| public-rest | `https://rest-{tier}.immedia-semi.com/api/` | 10 | none |
| rest | `https://rest-{tier}.immedia-semi.com/api/` | 161 | bearer |
| shared-rest | `https://rest-{shared_tier}.immedia-semi.com/api/` | 147 | bearer |

Default headers: `APP-BUILD`, `User-Agent`, `LOCALE`, `X-Blink-Time-Zone`. URL rewriting tokens: `{tier}`, `{shared_tier}`, `{env}`, `{injected_account_id}`, `{injected_client_id}`.

## Authentication cascade

Corroborated service-level static evidence retains hosted authorization, `oauth/token` exchange, persisted bearer-token attachment, conditional `TOKEN-AUTH`, and authenticated-host HTTP 401 refresh behavior. Blink 59.2 adds OTP verification and WebAuthn registration declarations. Endpoint-level authentication assignment is marked `inferred` unless the declaration itself supplies explicit authorization evidence; none of this proves current server behavior.

## Endpoint catalog

### authentication

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| POST | `2fa/v1/webauthn/registration` | PasskeyRegistration | bearer | com.immediasemi.blink.passkey.RegistrationRequest | com.immediasemi.blink.passkey.RegistrationResponse | added | direct | `com/immediasemi/blink/passkey/PasskeyRegistrationApi.java:17` |
| POST | `2fa/v1/webauthn/registration/verify` | PasskeyRegistration | bearer | com.immediasemi.blink.passkey.VerifyRegistrationRequest | Unit@camelCase | added | direct | `com/immediasemi/blink/passkey/PasskeyRegistrationApi.java:20` |

### device-orchestration

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| GET | `device_info/v4/devices` | Rdis | bearer | — | com.immediasemi.blink.common.device.rdis.RdisDevicesResponse | added | direct | `com/immediasemi/blink/common/device/rdis/RdisApi.java:20` |
| GET | `device_info/v4/devices` | Rdis | bearer | — | com.immediasemi.blink.settings.aihub.api.RdisDevicesResponse | removed | direct | `com/immediasemi/blink/settings/aihub/api/RdisApi.java:17` |
| GET | `device_info/v4/devices/{deviceId}` | Rdis | bearer | — | com.immediasemi.blink.common.device.rdis.RdisDeviceSettingsResponse | added | direct | `com/immediasemi/blink/common/device/rdis/RdisApi.java:17` |
| POST | `device_info/v4/devices/operations` | Rdis | bearer | com.immediasemi.blink.common.device.rdis.RdisOperationsBody | com.immediasemi.blink.common.device.rdis.RdisOperationsResponse | added | direct | `com/immediasemi/blink/common/device/rdis/RdisApi.java:23` |
| POST | `device_info/v4/devices/operations` | Rdis | bearer | com.immediasemi.blink.settings.aihub.api.RdisOperationsBody | com.immediasemi.blink.settings.aihub.api.RdisOperationsResponse | removed | direct | `com/immediasemi/blink/settings/aihub/api/RdisApi.java:21` |
| PUT | `duos/v1/devices/{deviceId}/update` | DeviceUpdateOrchestrationService | bearer | com.immediasemi.blink.common.device.duos.DeviceEntityUpdateRequest | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceApi.java:16` |
| PUT | `duos/v1/devices/{deviceId}/update` | DeviceUpdateOrchestrationService | bearer | com.immediasemi.blink.common.device.duos.DeviceMotionSettingsUpdateRequest | Unit@snake_case | added | direct | `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceApi.java:22` |
| PUT | `duos/v1/devices/{deviceId}/update` | DeviceUpdateOrchestrationService | bearer | com.immediasemi.blink.common.device.duos.DevicePrivacySettingsUpdateRequest | Unit@snake_case | added | direct | `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceApi.java:25` |
| PUT | `duos/v1/devices/update` | DeviceUpdateOrchestrationService | bearer | com.immediasemi.blink.common.device.duos.DeviceBulkUpdateRequest | com.immediasemi.blink.common.device.duos.DeviceBulkUpdateResponse | changed | direct | `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceApi.java:19` |
| GET | `v1/devices` | KnownFacesRdis | bearer | — | com.immediasemi.blink.settings.knownfaces.optin.RdisResponse | changed | direct | `com/immediasemi/blink/settings/knownfaces/optin/KnownFacesRdisApi.java:18` |
| PATCH | `v1/devices/{id}/configurations` | KnownFacesRdis | bearer | com.immediasemi.blink.settings.knownfaces.optin.UpdateDeviceConfigurationRequest | Unit@unresolved | changed | direct | `com/immediasemi/blink/settings/knownfaces/optin/KnownFacesRdisApi.java:21` |

### event-stream

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| POST | `1.0.0/batch/client.device/{appSubGroup}` | EventStream | optional-explicit | RequestBody | Unit@unresolved | changed | direct | `com/ring/android/eventstream/storage/api/EventStreamApi.java:17` |
| POST | `1.0.0/event/client.device/{appSubGroup}` | EventStream | optional-explicit | RequestBody | Unit@unresolved | changed | direct | `com/ring/android/eventstream/storage/api/EventStreamApi.java:20` |

### local-device

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| GET | `api/get_fw_version` | SyncModuleService | local-none | — | com.immediasemi.blink.utils.GetFirmwareEndpointResponse | unchanged | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:30` |
| GET | `api/get_fw_version` | Wifi | local-none | — | com.immediasemi.blink.device.wifi.GetFwVersionResponse | unchanged | direct | `com/immediasemi/blink/device/wifi/WifiApi.java:16` |
| GET | `api/logs` | SyncModuleService | local-none | — | ResponseBody@unresolved | changed | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:33` |
| POST | `api/set/app_fw_update` | SyncModuleService | local-none | RequestBody | Unit@unresolved | changed | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:42` |
| POST | `api/set/key` | SyncModuleService | local-none | RequestBody | Unit@unresolved | changed | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:45` |
| POST | `api/set/ssid` | SyncModuleService | local-none | com.immediasemi.blink.api.retrofit.SetSSIDBody | Unit@unresolved | changed | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:48` |
| GET | `api/ssids` | SyncModuleService | local-none | — | com.immediasemi.blink.models.AccessPoints | changed | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:36` |
| GET | `api/ssids` | WifiSecure | local-none | — | com.immediasemi.blink.device.wifi.AccessPoints | unchanged | direct | `com/immediasemi/blink/device/wifi/WifiSecureApi.java:19` |
| GET | `api/version` | SyncModuleService | local-none | — | Unit@unresolved | changed | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:39` |

### oauth

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| POST | `oauth/token` | Oauth | none | — | com.immediasemi.blink.common.account.auth.RefreshTokensResponse@snake_case | changed | direct | `com/immediasemi/blink/common/account/auth/OauthApi.java:22` |
| POST | `oauth/token` | Oauth | none | — | com.immediasemi.blink.common.account.auth.RefreshTokensResponse@snake_case | changed | direct | `com/immediasemi/blink/common/account/auth/OauthApi.java:26` |
| POST | `oauth/v2/verify_otp` | PasskeyOauth | none | — | com.immediasemi.blink.passkey.VerifyOtpResponse | added | direct | `com/immediasemi/blink/passkey/PasskeyOauthApi.java:16` |

### public-rest

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| GET | `apphelp.immedia-semi.com/link-manifest.json` | Public | none | — | com.immediasemi.blink.common.url.LinkManifest | changed | direct | `com/immediasemi/blink/common/network/PublicApi.java:22` |
| GET | `regions` | Public | none | — | com.immediasemi.blink.common.country.RegionsResponse | unchanged | direct | `com/immediasemi/blink/common/network/PublicApi.java:25` |
| GET | `v1/countries` | Public | none | — | com.immediasemi.blink.common.country.CountriesResponse | unchanged | direct | `com/immediasemi/blink/common/network/PublicApi.java:19` |
| GET | `v1/version` | Public | none | — | com.immediasemi.blink.update.AppVersionCheckResponse | unchanged | direct | `com/immediasemi/blink/common/network/PublicApi.java:16` |
| POST | `v3/users/validate_email` | Auth | none | com.immediasemi.blink.common.account.auth.ValidateEmailPostBody | com.immediasemi.blink.common.account.auth.ValidationResponse | changed | direct | `com/immediasemi/blink/common/account/auth/AuthApi.java:16` |
| POST | `v3/users/validate_password` | Auth | none | com.immediasemi.blink.common.account.auth.ValidatePasswordPostBody | com.immediasemi.blink.common.account.auth.ValidationResponse | changed | direct | `com/immediasemi/blink/common/account/auth/AuthApi.java:19` |
| POST | `v4/users/password_change` | PasswordReset | none | com.immediasemi.blink.account.password.ResetPasswordPostBody@snake_case | Unit@snake_case | changed | direct | `com/immediasemi/blink/account/password/PasswordResetApi.java:18` |
| POST | `v4/users/password_change/pin/generate` | PasswordReset | none | com.immediasemi.blink.common.account.verification.GeneratePinPostBody | com.immediasemi.blink.common.account.verification.GeneratePinResponse@snake_case | changed | direct | `com/immediasemi/blink/account/password/PasswordResetApi.java:21` |
| POST | `v4/users/password_change/pin/verify` | PasswordReset | none | com.immediasemi.blink.common.account.verification.VerifyPinPostBody@snake_case | com.immediasemi.blink.common.account.verification.VerifyPinResponse@snake_case | changed | direct | `com/immediasemi/blink/account/password/PasswordResetApi.java:24` |
| POST | `v7/users/register` | Auth | none | com.immediasemi.blink.common.account.auth.RegisterBody | com.immediasemi.blink.common.account.auth.AuthenticationResponse | changed | direct | `com/immediasemi/blink/common/account/auth/AuthApi.java:13` |

### rest

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| GET | `@Url` | FaceImageDownload | bearer | — | ResponseBody@snake_case | changed | direct | `com/immediasemi/blink/settings/knownfaces/image/FaceImageDownloadApi.java:15` |
| GET | `@Url` | PreSignedVideo | bearer | — | ResponseBody@snake_case | added | direct | `com/immediasemi/blink/video/PreSignedVideoApi.java:17` |
| GET | `@Url` | Video | bearer | — | ResponseBody@snake_case | changed | direct | `com/immediasemi/blink/video/VideoApi.java:14` |
| GET | `@Url` | Firmware | bearer | — | com.ring.blueprints.setup.core.data.ApiAccessPoints | unchanged | direct | `com/ring/blueprints/setup/core/data/FirmwareApi.java:19` |
| GET | `@Url` | Firmware | bearer | — | ResponseBody@unresolved | changed | direct | `com/ring/blueprints/setup/core/data/FirmwareApi.java:22` |
| GET | `@Url` | Firmware | bearer | — | ResponseBody@unresolved | changed | direct | `com/ring/blueprints/setup/core/data/FirmwareApi.java:25` |
| GET | `@Url` | Firmware | bearer | — | com.ring.blueprints.setup.core.data.ApiNetwork | unchanged | direct | `com/ring/blueprints/setup/core/data/FirmwareApi.java:28` |
| GET | `@Url` | Blueprint | bearer | — | com.ring.reapp.blueprint.model.BlueprintResponse | changed | direct | `com/ring/reapp/blueprint/api/BlueprintApi.java:17` |
| POST | `@Url` | Firmware | bearer | com.ring.blueprints.setup.core.data.DeviceLocale | ResponseBody@unresolved | changed | direct | `com/ring/blueprints/setup/core/data/FirmwareApi.java:31` |
| POST | `@Url` | Firmware | bearer | RequestBody | ResponseBody@unresolved | changed | direct | `com/ring/blueprints/setup/core/data/FirmwareApi.java:34` |
| POST | `@Url` | Firmware | bearer | RequestBody | ResponseBody@unresolved | changed | direct | `com/ring/blueprints/setup/core/data/FirmwareApi.java:37` |
| POST | `@Url` | Firmware | bearer | com.ring.blueprints.setup.core.data.ApiNetwork | String | unchanged | direct | `com/ring/blueprints/setup/core/data/FirmwareApi.java:40` |
| POST | `@Url` | Firmware | bearer | com.ring.blueprints.setup.core.data.ApiNetwork | ResponseBody@unresolved | changed | direct | `com/ring/blueprints/setup/core/data/FirmwareApi.java:43` |
| POST | `@Url` | Blueprint | bearer | kotlinx.serialization.json.JsonObject | com.ring.reapp.blueprint.model.BlueprintResponse | changed | direct | `com/ring/reapp/blueprint/api/BlueprintApi.java:20` |
| POST | `app/logs/upload` | Log | bearer | com.immediasemi.blink.api.retrofit.LogsBody | Unit@unresolved | changed | direct | `com/immediasemi/blink/common/log/LogApi.java:16` |
| GET | `blink/clients_api/links/v1/locations/{locationId}/devices/{deviceId}/links?ignore_rbac=true&include_deactivated=false` | LinkDevice | bearer | — | com.immediasemi.blink.device.setting.linkdevice.data.model.DeviceLinksResponse | changed | direct | `com/immediasemi/blink/device/setting/linkdevice/data/LinkDeviceApi.java:29` |
| DELETE | `blink/clients_api/links/v1/locations/{locationId}/devices/{deviceId}/links/{linkId}?ignore_rbac=true&include_deactivated=false` | LinkDevice | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/device/setting/linkdevice/data/LinkDeviceApi.java:26` |
| POST | `blink/clients_api/links/v1/locations/{locationId}/events/{event}/receivers?ignore_rbac=true&include_deactivated=false` | LinkDevice | bearer | com.immediasemi.blink.device.setting.linkdevice.data.model.CreateLinkRequest | com.immediasemi.blink.device.setting.linkdevice.data.model.CreateLinkResponse | changed | direct | `com/immediasemi/blink/device/setting/linkdevice/data/LinkDeviceApi.java:23` |
| POST | `clients_api/setups` | SetupOrchestrationService | bearer | com.immediasemi.blink.common.device.ringsos.SosSetupPostBody | com.immediasemi.blink.common.device.ringsos.SosSetupResponse | changed | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:44` |
| GET | `clients_api/setups/{setupId}` | SetupOrchestrationService | bearer | — | com.immediasemi.blink.common.device.ringsos.SosDeviceSetupStatusResponse | changed | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:38` |
| POST | `clients/{injected_client_id}/update` | Client | bearer | com.immediasemi.blink.common.account.client.ClientUpdatePostBody | Unit@unresolved | changed | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:26` |
| GET | `device_info/v4/devices/{deviceId}` | SetupOrchestrationService | bearer | — | com.immediasemi.blink.common.device.ringsos.ChimeAccessoryConfigInfoResponse | changed | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:26` |
| GET | `device_info/v4/devices/{deviceId}/configurations` | SetupOrchestrationService | bearer | — | com.immediasemi.blink.common.device.ringsos.DeviceConfigurationsResponse | added | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:29` |
| GET | `device_info/v4/devices/{deviceId}/configurations` | SetupOrchestrationService | bearer | — | com.immediasemi.blink.common.device.accessory.chime.DeviceConfigurationsResponse | removed | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:26` |
| GET | `device_info/v4/devices/{deviceId}/status` | SetupOrchestrationService | bearer | — | com.immediasemi.blink.common.device.ringsos.SosDeviceOtaStatusResponse | changed | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:32` |
| PATCH | `devices/{deviceId}` | Commands | bearer | RequestBody | Unit@unresolved | added | direct | `com/ring/blueprints/setup/core/data/backend/CommandsApi.java:16` |
| DELETE | `devices/v1/devices/{deviceId}` | SetupOrchestrationService | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:23` |
| PATCH | `devices/v1/devices/{deviceId}` | DeviceRegistry | bearer | com.immediasemi.blink.common.device.registry.DeviceRegistryPatchBody | Unit@snake_case | added | direct | `com/immediasemi/blink/common/device/registry/DeviceRegistryApi.java:17` |
| PATCH | `devices/v1/devices/{deviceId}` | SetupOrchestrationService | bearer | com.immediasemi.blink.common.device.ringsos.UpdateSosDeviceBody | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:47` |
| GET | `devices/v2/locations` | LocationsCore | bearer | — | ResponseBody@unresolved | changed | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:31` |
| DELETE | `dings/{dingId}` | Clients | bearer | — | Unit@unresolved | changed | direct | `com/ringapp/orchestratorapi/data/ClientsApi.java:16` |
| DELETE | `dings/{dingId}/favorite` | Clients | bearer | — | Unit@unresolved | changed | direct | `com/ringapp/orchestratorapi/data/ClientsApi.java:22` |
| PUT | `dings/{dingId}/favorite` | Clients | bearer | — | Unit@unresolved | changed | direct | `com/ringapp/orchestratorapi/data/ClientsApi.java:19` |
| POST | `duos/v1/locations` | LocationsCore | bearer | com.amazon.rbks.mobile.locations.network.entities.PutLocationRequest | com.amazon.rbks.mobile.locations.network.entities.LocationBody | unchanged | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:46` |
| POST | `duos/v1/locations` | LocationsCore | bearer | com.amazon.rbks.mobile.locations.network.entities.PutLocationRequest | ResponseBody@unresolved | changed | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:49` |
| DELETE | `duos/v1/locations/{locationId}` | LocationsCore | bearer | — | Unit@unresolved | changed | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:27` |
| PATCH | `duos/v1/locations/{locationId}` | LocationsCore | bearer | com.amazon.rbks.mobile.locations.network.entities.UpdateLocationRequest | com.amazon.rbks.mobile.locations.network.entities.LocationBody | changed | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:39` |
| PATCH | `duos/v1/locations/{locationId}` | LocationsCore | bearer | com.amazon.rbks.mobile.locations.network.entities.UpdateLocationRequest | ResponseBody@unresolved | changed | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:42` |
| GET | `ees/v2/history/extendedsearchmetadata` | TimelineOrchestrator | bearer | — | com.ringapp.orchestratorapi.data.OrchestratorSearchMetadataResponse | unchanged | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:130` |
| DELETE | `evm/v2/dings` | TimelineOrchestrator | bearer | — | Unit@unresolved | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:121` |
| POST | `evm/v2/events` | TimelineOrchestrator | bearer | com.ringapp.orchestratorapi.data.DeleteMultipleEventsRequest | Unit@unresolved | added | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:90` |
| DELETE | `evm/v2/events/associations/{profile_Id}` | TimelineOrchestrator | bearer | — | Unit@unresolved | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:118` |
| DELETE | `evm/v2/events/time-based-deletion/{source_id}` | TimelineOrchestrator | bearer | — | Unit@unresolved | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:124` |
| POST | `evm/v2/events/watch` | TimelineOrchestrator | bearer | com.ringapp.orchestratorapi.data.WatchEventsRequest | Unit@unresolved | added | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:115` |
| GET | `evm/v2/history/devices` | TimelineOrchestrator | bearer | — | com.ringapp.orchestratorapi.data.OrchestratorItemsResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:104` |
| GET | `evm/v2/history/events/{eventId}` | TimelineOrchestrator | bearer | — | com.ringapp.orchestratorapi.data.OrchestratorEventResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:100` |
| POST | `evm/v2/history/extendedsearch` | TimelineOrchestrator | bearer | com.ringapp.orchestratorapi.data.OrchestratorExtendedSearchRequestBody | com.ringapp.orchestratorapi.data.OrchestratorItemsResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:127` |
| GET | `evm/v2/history/unwatched/count` | TimelineOrchestrator | bearer | — | com.ringapp.orchestratorapi.data.UnwatchedCountResponse | added | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:96` |
| GET | `evm/v2/metadata/history/devices` | TimelineOrchestrator | bearer | — | com.ringapp.orchestratorapi.data.OrchestratorItemsResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:93` |
| GET | `evm/v2/timeline/24/devices/{source_id}` | TimelineOrchestrator | bearer | — | com.ringapp.orchestratorapi.data.Orchestrator24x7TimelineResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:133` |
| GET | `evm/v2/timeline/devices/{doorbotId}` | TimelineOrchestrator | bearer | — | com.ringapp.orchestratorapi.data.OrchestratorTimelineResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:141` |
| GET | `evm/v2/timeline/events/eventito/{source_id}` | TimelineOrchestrator | bearer | — | com.ringapp.orchestratorapi.data.OrchestratorEventResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:137` |
| GET | `evm/v3/history/devices` | TimelineOrchestrator | bearer | — | com.ringapp.orchestratorapi.data.OrchestratorFeedResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:112` |
| POST | `evm/v3/history/events` | TimelineOrchestrator | bearer | com.ringapp.orchestratorapi.data.OrchestratorBatchRequestBody | com.ringapp.orchestratorapi.data.OrchestratorEventResponse | changed | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:108` |
| GET | `factory_profile` | SetupClients | bearer | — | com.ring.blueprints.setup.core.data.backend.ApiFactoryDeviceProfile | changed | direct | `com/ring/blueprints/setup/core/data/backend/SetupClientsApi.java:15` |
| GET | `fms/device-firmware` | DeviceFirmware | bearer | — | com.ring.blueprints.setup.core.data.entity.DeviceFirmwareResponse | changed | direct | `com/ring/blueprints/setup/core/data/backend/DeviceFirmwareApi.java:14` |
| GET | `geocoding/v1/auto-complete` | Geocoding | bearer | — | com.amazon.rbks.mobile.locations.network.entities.AutoCompleteResponse | unchanged | direct | `com/immediasemi/blink/location/api/GeocodingApi.java:30` |
| GET | `geocoding/v1/auto-complete/details` | Geocoding | bearer | — | com.amazon.rbks.mobile.locations.network.entities.LocationDetailsResponse | unchanged | direct | `com/immediasemi/blink/location/api/GeocodingApi.java:34` |
| POST | `geocoding/v1/geocode` | Geocoding | bearer | com.amazon.rbks.mobile.locations.network.entities.GeoCodingRequest | com.amazon.rbks.mobile.locations.network.entities.LocationDetailsResponse | unchanged | direct | `com/immediasemi/blink/location/api/GeocodingApi.java:38` |
| GET | `geocoding/v1/ip/info/my` | Geocoding | bearer | — | com.amazon.rbks.mobile.locations.network.entities.LocationByIpResponse | unchanged | direct | `com/immediasemi/blink/location/api/GeocodingApi.java:26` |
| GET | `geocoding/v1/reverse-geocode` | Geocoding | bearer | — | com.amazon.rbks.mobile.locations.network.entities.LocationDetailsResponse | unchanged | direct | `com/immediasemi/blink/location/api/GeocodingApi.java:22` |
| GET | `location_info/v3/locations` | LocationsCore | bearer | — | ResponseBody@unresolved | changed | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:35` |
| GET | `location-subtypes` | LocationSubtype | bearer | — | com.amazon.rbks.mobile.locations.network.entities.subtype.SubtypeBody | unchanged | direct | `com/amazon/rbks/mobile/locations/network/LocationSubtypeApi.java:12` |
| DELETE | `recordings/public/footages/{deviceId}` | Footage | bearer | — | Unit@unresolved | changed | direct | `com/ringapp/orchestratorapi/data/FootageApi.java:18` |
| DELETE | `recordings/public/footages/{deviceId}/delete_all` | Footage | bearer | — | Unit@unresolved | changed | direct | `com/ringapp/orchestratorapi/data/FootageApi.java:15` |
| POST | `setups` | Clients | bearer | RequestBody | com.ring.blueprints.setup.core.data.backend.ApiSetup | added | direct | `com/ring/blueprints/setup/core/data/backend/ClientsApi.java:21` |
| GET | `setups/{setupId}` | Clients | bearer | — | com.ring.blueprints.setup.core.data.backend.ApiSetupStatus | added | direct | `com/ring/blueprints/setup/core/data/backend/ClientsApi.java:18` |
| POST | `setups/{setupId}/complete` | Clients | bearer | com.ring.blueprints.setup.core.data.backend.CompleteSetupBody | Void | added | direct | `com/ring/blueprints/setup/core/data/backend/ClientsApi.java:15` |
| PUT | `share_service/v3/batch_shares` | VideoDonation | bearer | com.immediasemi.blink.video.clip.donation.api.BatchDonationRequest | com.immediasemi.blink.video.clip.donation.api.BatchDonationResponse | added | direct | `com/immediasemi/blink/video/clip/donation/api/VideoDonationApi.java:14` |
| GET | `sos/v1/factory_profile` | SetupOrchestrationService | bearer | — | com.immediasemi.blink.common.device.MacIdentifyDeviceResponseApiModel | added | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:35` |
| POST | `sos/v1/setups` | SetupOrchestrationService | bearer | com.immediasemi.blink.common.device.ringsos.RingSosSetupPostBody | com.immediasemi.blink.common.device.ringsos.RingSosSetupResponse | changed | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:41` |
| GET | `system/config/network` | LocalSetupOrchestrationService | bearer | — | com.immediasemi.blink.common.device.ringsos.NetworkConfigGetResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/LocalSetupOrchestrationServiceApi.java:17` |
| POST | `system/config/network` | LocalSetupOrchestrationService | bearer | com.immediasemi.blink.common.device.ringsos.NetworkConfigPostBody | com.immediasemi.blink.common.device.ringsos.NetworkConfigStatusResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/LocalSetupOrchestrationServiceApi.java:20` |
| POST | `system/config/reg_domain` | LocalSetupOrchestrationService | bearer | com.immediasemi.blink.common.device.ringsos.RegionConfigPostBody | com.immediasemi.blink.common.device.ringsos.NetworkConfigStatusResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/LocalSetupOrchestrationServiceApi.java:23` |
| GET | `system/prov/ap_list` | LocalSetupOrchestrationService | bearer | — | com.immediasemi.blink.common.device.ringsos.AccessPointListResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/LocalSetupOrchestrationServiceApi.java:14` |
| POST | `users/delete` | Account | bearer | com.immediasemi.blink.common.account.delete.DeleteAccountBody | Unit@unresolved | changed | direct | `com/immediasemi/blink/common/account/AccountApi.java:31` |
| GET | `v1/accounts/{injected_account_id}/single_event_alerts` | SingleEventAlerts | bearer | — | com.immediasemi.blink.settings.notifications.sea.SingleEventAlertsResponse | changed | direct | `com/immediasemi/blink/settings/notifications/sea/SingleEventAlertsApi.java:16` |
| POST | `v1/accounts/{injected_account_id}/single_event_alerts` | SingleEventAlerts | bearer | com.immediasemi.blink.settings.notifications.sea.SingleEventAlertsPostBody | Unit@snake_case | changed | direct | `com/immediasemi/blink/settings/notifications/sea/SingleEventAlertsApi.java:19` |
| POST | `v1/alexa/authorization` | AlexaLinking | bearer | com.immediasemi.blink.settings.account.alexa.AlexaLinkingAuthorizePostBody | com.immediasemi.blink.settings.account.alexa.AlexaLinkingAuthorizeResponse | unchanged | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingApi.java:22` |
| DELETE | `v1/alexa/link` | AlexaLinking | bearer | — | Unit@unresolved | changed | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingApi.java:16` |
| POST | `v1/alexa/link` | AlexaLinking | bearer | com.immediasemi.blink.settings.account.alexa.AlexaLinkingLinkPostBody | Unit@unresolved | changed | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingApi.java:25` |
| GET | `v1/alexa/link_status` | AlexaLinking | bearer | — | com.immediasemi.blink.settings.account.alexa.AlexaLinkStatus | unchanged | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingApi.java:19` |
| GET | `v1/clients/{injected_client_id}/control_panel/clients` | ClientDeviceManagement | bearer | — | com.immediasemi.blink.api.retrofit.GetClientsResponse | changed | direct | `com/immediasemi/blink/settings/client/ClientDeviceManagementApi.java:23` |
| POST | `v1/clients/{injected_client_id}/control_panel/delete` | ClientDeviceManagement | bearer | com.immediasemi.blink.api.retrofit.DeleteClientBody | Unit@unresolved | changed | direct | `com/immediasemi/blink/settings/client/ClientDeviceManagementApi.java:20` |
| POST | `v1/clients/{injected_client_id}/control_panel/pin/resend` | ClientDeviceManagement | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse@unresolved | changed | direct | `com/immediasemi/blink/settings/client/ClientDeviceManagementApi.java:29` |
| POST | `v1/clients/{injected_client_id}/control_panel/pin/verify` | ClientDeviceManagement | bearer | com.immediasemi.blink.common.account.verification.VerifyPinPostBody@unresolved | com.immediasemi.blink.common.account.verification.VerifyPinResponse@unresolved | changed | direct | `com/immediasemi/blink/settings/client/ClientDeviceManagementApi.java:32` |
| POST | `v1/clients/{injected_client_id}/control_panel/request_pin` | ClientDeviceManagement | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse@unresolved | changed | direct | `com/immediasemi/blink/settings/client/ClientDeviceManagementApi.java:26` |
| GET | `v1/clients/{injected_client_id}/options` | Client | bearer | — | com.immediasemi.blink.common.account.client.option.ClientOptionsBody | unchanged | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:20` |
| POST | `v1/clients/{injected_client_id}/options` | Client | bearer | com.immediasemi.blink.common.account.client.option.ClientOptionsBody | Unit@unresolved | changed | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:23` |
| POST | `v1/clients/{injected_client_id}/shared_login/pin/resend` | SharedLogin | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse@unresolved | changed | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:36` |
| POST | `v1/clients/{injected_client_id}/shared_login/pin/verify` | SharedLogin | bearer | com.immediasemi.blink.common.account.verification.VerifyPinPostBody@unresolved | com.immediasemi.blink.common.account.verification.VerifyPinResponse@unresolved | changed | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:39` |
| POST | `v1/clients/{injected_client_id}/shared_login/request_pin` | SharedLogin | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse@unresolved | changed | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:33` |
| POST | `v1/countries/update` | Account | bearer | com.immediasemi.blink.api.retrofit.CountryBody | com.immediasemi.blink.api.retrofit.CountryResponse | changed | direct | `com/immediasemi/blink/common/account/AccountApi.java:67` |
| POST | `v1/data_request/dsar/create` | ManageData | bearer | — | com.immediasemi.blink.settings.account.managedata.SubmitDataRequestResponse | unchanged | direct | `com/immediasemi/blink/settings/account/managedata/ManageDataApi.java:18` |
| POST | `v1/data_request/euda/create` | ManageData | bearer | — | com.immediasemi.blink.settings.account.managedata.SubmitDataRequestResponse | unchanged | direct | `com/immediasemi/blink/settings/account/managedata/ManageDataApi.java:21` |
| GET | `v1/data_request/list` | ManageData | bearer | — | com.immediasemi.blink.settings.account.managedata.DataRequests | unchanged | direct | `com/immediasemi/blink/settings/account/managedata/ManageDataApi.java:15` |
| POST | `v1/data_request/third_party/{thirdPartyId}/revoke` | ManageData | bearer | — | Unit@unresolved | changed | direct | `com/immediasemi/blink/settings/account/managedata/ManageDataApi.java:24` |
| POST | `v1/events/app` | Event | bearer | com.immediasemi.blink.api.retrofit.TrackingEvents | Unit@unresolved | changed | direct | `com/immediasemi/blink/common/track/event/EventApi.java:15` |
| DELETE | `v1/history/events/associations/{profile_id}` | EventAssociations | bearer | — | Unit@snake_case | added | direct | `com/immediasemi/blink/settings/knownfaces/identities/EventAssociationsApi.java:16` |
| GET | `v1/identities` | Identities | bearer | — | com.immediasemi.blink.settings.knownfaces.identities.IdentitiesResponse | changed | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:28` |
| DELETE | `v1/identities/{id}` | Identities | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:25` |
| GET | `v1/identities/{id}` | Identities | bearer | — | com.immediasemi.blink.settings.knownfaces.identities.IdentityResponse | changed | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:31` |
| PATCH | `v1/identities/{id}` | Identities | bearer | com.immediasemi.blink.settings.knownfaces.identities.UpdateIdentityRequest | Unit@snake_case | changed | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:43` |
| PATCH | `v1/identities/{id}/actions/merge-identities` | Identities | bearer | com.immediasemi.blink.settings.knownfaces.identities.MergeIdentitiesRequest | Unit@snake_case | changed | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:34` |
| POST | `v1/identities/{id}/actions/split-identity` | Identities | bearer | com.immediasemi.blink.settings.knownfaces.identities.SplitIdentityRequest | com.immediasemi.blink.settings.knownfaces.identities.SplitIdentityResponse | changed | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:40` |
| DELETE | `v1/identities/{id}/enrollment-images` | Identities | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:22` |
| PATCH | `v1/identities/{id}/enrollment-images/actions/move-enrollment-images` | Identities | bearer | com.immediasemi.blink.settings.knownfaces.identities.MoveEnrollmentImagesRequest | Unit@snake_case | changed | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:37` |
| POST | `v1/identity/token` | Account | bearer | com.immediasemi.blink.common.account.auth.TokenUpgradePostBody | com.immediasemi.blink.common.account.auth.RefreshTokensResponse@unresolved | changed | direct | `com/immediasemi/blink/common/account/AccountApi.java:64` |
| POST | `v1/locations/update` | BlinkCloudLocation | bearer | — | Unit@unresolved | changed | direct | `com/immediasemi/blink/location/api/BlinkCloudLocationApi.java:13` |
| GET | `v1/notifications/preferences` | Account | bearer | — | com.immediasemi.blink.api.retrofit.NotificationPreferencesResponse | changed | direct | `com/immediasemi/blink/common/account/AccountApi.java:43` |
| POST | `v1/notifications/preferences` | Account | bearer | com.immediasemi.blink.api.retrofit.NotificationPreferencesResponse | Unit@unresolved | changed | direct | `com/immediasemi/blink/common/account/AccountApi.java:55` |
| GET | `v1/shared_login` | SharedLogin | bearer | — | com.immediasemi.blink.settings.sharedlogin.model.GetSharedLoginResponse | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:24` |
| POST | `v1/shared_login` | SharedLogin | bearer | com.immediasemi.blink.settings.sharedlogin.model.CreateSharedLoginBody | com.immediasemi.blink.settings.sharedlogin.model.PostSharedLoginResponse | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:30` |
| POST | `v1/shared_login/claim` | SharedLoginPublic | bearer | com.immediasemi.blink.settings.sharedlogin.model.SharedLoginClaimBody | com.immediasemi.blink.settings.sharedlogin.model.PostSharedLoginClaimResponse | changed | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginPublicApi.java:17` |
| POST | `v1/shared_login/revoke` | SharedLogin | bearer | com.immediasemi.blink.settings.sharedlogin.model.RevokeSharedLoginBody | Unit@unresolved | changed | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:27` |
| POST | `v1/shared_login/verify` | SharedLoginPublic | bearer | com.immediasemi.blink.settings.sharedlogin.model.SharedLoginVerifyBody | com.immediasemi.blink.settings.sharedlogin.model.PostSharedLoginVerifyResponse | changed | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginPublicApi.java:20` |
| PATCH | `v1/shared/authorizations/{authorizationId}` | Access | bearer | com.immediasemi.blink.common.account.FriendlyNamePatchBody | com.immediasemi.blink.device.network.command.PollingResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:42` |
| DELETE | `v1/shared/authorizations/{authorizationId}/remove` | Access | bearer | — | com.immediasemi.blink.device.network.command.PollingResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:27` |
| DELETE | `v1/shared/authorizations/{authorizationId}/revoke` | Access | bearer | — | Unit@unresolved | changed | direct | `com/immediasemi/blink/common/account/AccessApi.java:30` |
| GET | `v1/shared/check_authorization` | Access | bearer | — | com.immediasemi.blink.settings.access.accept.CheckAuthorizationResponse | changed | direct | `com/immediasemi/blink/common/account/AccessApi.java:36` |
| POST | `v1/shared/invitations/{invitationId}/accept` | Access | bearer | com.immediasemi.blink.settings.access.accept.AcceptInvitationBody | com.immediasemi.blink.device.network.command.PollingResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:48` |
| DELETE | `v1/shared/invitations/{invitationId}/decline` | Access | bearer | — | Unit@unresolved | changed | direct | `com/immediasemi/blink/common/account/AccessApi.java:24` |
| DELETE | `v1/shared/invitations/{invitationId}/revoke` | Access | bearer | — | Unit@unresolved | changed | direct | `com/immediasemi/blink/common/account/AccessApi.java:33` |
| POST | `v1/shared/invitations/send` | Access | bearer | com.immediasemi.blink.settings.access.SendInviteBody | Unit@unresolved | changed | direct | `com/immediasemi/blink/common/account/AccessApi.java:51` |
| PATCH | `v1/shared/popovers/{popoverId}/read` | Access | bearer | — | Unit@unresolved | changed | direct | `com/immediasemi/blink/common/account/AccessApi.java:45` |
| GET | `v1/shared/summary` | Access | bearer | — | com.immediasemi.blink.settings.access.AccessSummary | changed | direct | `com/immediasemi/blink/common/account/AccessApi.java:39` |
| POST | `v1/subscriptions/clear_popup/{type}` | WriteSubscription | bearer | — | Unit@unresolved | changed | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:42` |
| POST | `v1/subscriptions/link/link_account` | WriteSubscription | bearer | com.immediasemi.blink.utils.MapLinkBody | com.immediasemi.blink.utils.DspSubscriptionResponse | changed | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:39` |
| POST | `v1/subscriptions/link/unlink_account` | WriteSubscription | bearer | com.immediasemi.blink.utils.VerifyLinkAccountBody | com.immediasemi.blink.utils.DspSubscriptionResponse | changed | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:51` |
| POST | `v1/subscriptions/plans/{subscriptionId}/attach` | WriteSubscription | bearer | com.immediasemi.blink.common.subscription.basic.AttachPlanBody | com.immediasemi.blink.utils.DspSubscriptionResponse | changed | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:27` |
| DELETE | `v1/subscriptions/plans/cancel_trial` | WriteSubscription | bearer | — | Unit@unresolved | changed | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:30` |
| GET | `v1/subscriptions/plans/get_device_attach_eligibility` | WriteSubscription | bearer | — | com.immediasemi.blink.common.subscription.basic.DeviceEligibilityResponse | changed | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:36` |
| POST | `v1/subscriptions/plans/renew_trial` | WriteSubscription | bearer | — | Unit@unresolved | changed | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:45` |
| POST | `v1/subscriptions/request/status/{uuid}` | WriteSubscription | bearer | com.immediasemi.blink.utils.SubscriptionRequestStatusBody | com.immediasemi.blink.utils.SubscriptionRequestStatusResponse | changed | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:48` |
| POST | `v1/users/authenticate_password` | Account | bearer | com.immediasemi.blink.account.auth.AuthenticatePasswordBody | com.immediasemi.blink.account.auth.AuthenticatePasswordResponse | changed | direct | `com/immediasemi/blink/common/account/AccountApi.java:28` |
| POST | `v1/users/countries/update` | Account | bearer | com.immediasemi.blink.api.retrofit.CountryBody | com.immediasemi.blink.api.retrofit.CountryResponse | changed | direct | `com/immediasemi/blink/common/account/AccountApi.java:70` |
| GET | `v1/users/options` | Account | bearer | — | com.immediasemi.blink.common.account.option.AccountOptionsResponse | changed | direct | `com/immediasemi/blink/common/account/AccountApi.java:37` |
| GET | `v1/users/preferences` | Account | bearer | — | com.immediasemi.blink.common.account.preference.AccountPreferencesBody | changed | direct | `com/immediasemi/blink/common/account/AccountApi.java:40` |
| POST | `v1/users/preferences` | Account | bearer | com.immediasemi.blink.common.account.preference.AccountPreferencesBody | com.immediasemi.blink.common.account.preference.AccountPreferencesBody | changed | direct | `com/immediasemi/blink/common/account/AccountApi.java:52` |
| GET | `v1/users/tier_info` | Account | bearer | — | com.immediasemi.blink.common.account.TierInfo | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:46` |
| POST | `v2/clients/{injected_client_id}/tiv` | CustomerSupportAccess | bearer | com.immediasemi.blink.settings.privacy.TivLockBody | com.immediasemi.blink.settings.privacy.SetTivLockResponse | changed | direct | `com/immediasemi/blink/settings/privacy/CustomerSupportAccessApi.java:16` |
| POST | `v2/clients/{injected_client_id}/tiv_unlock/pin/resend` | CustomerSupportAccess | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse@unresolved | changed | direct | `com/immediasemi/blink/settings/privacy/CustomerSupportAccessApi.java:22` |
| POST | `v2/clients/{injected_client_id}/tiv_unlock/pin/verify` | CustomerSupportAccess | bearer | com.immediasemi.blink.common.account.verification.VerifyPinPostBody@unresolved | com.immediasemi.blink.common.account.verification.VerifyPinResponse@unresolved | changed | direct | `com/immediasemi/blink/settings/privacy/CustomerSupportAccessApi.java:25` |
| POST | `v2/clients/{injected_client_id}/tiv_unlock/request_pin` | CustomerSupportAccess | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse@unresolved | changed | direct | `com/immediasemi/blink/settings/privacy/CustomerSupportAccessApi.java:19` |
| POST | `v2/notification` | Notification | bearer | com.immediasemi.blink.api.retrofit.AcknowledgeNotificationBody | Object | unchanged | direct | `com/immediasemi/blink/notification/NotificationApi.java:14` |
| POST | `v2/subscriptions/plans/create_trial` | WriteSubscription | bearer | com.immediasemi.blink.home.additionaltrial.AdditionalTrialBody | Unit@unresolved | changed | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:33` |
| GET | `v2/users/info` | Account | bearer | — | com.immediasemi.blink.common.account.Account@unresolved | changed | direct | `com/immediasemi/blink/common/account/AccountApi.java:34` |
| POST | `v4/clients/{injected_client_id}/email_change` | EmailChange | bearer | com.immediasemi.blink.settings.email.ChangeEmailPostBody | com.immediasemi.blink.common.account.verification.GeneratePinResponse@unresolved | changed | direct | `com/immediasemi/blink/settings/email/EmailChangeApi.java:16` |
| POST | `v4/clients/{injected_client_id}/email_change/pin/resend` | EmailChange | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse@unresolved | changed | direct | `com/immediasemi/blink/settings/email/EmailChangeApi.java:19` |
| POST | `v4/clients/{injected_client_id}/email_change/pin/verify` | EmailChange | bearer | com.immediasemi.blink.common.account.verification.VerifyPinPostBody@unresolved | com.immediasemi.blink.common.account.verification.VerifyPinResponse@unresolved | changed | direct | `com/immediasemi/blink/settings/email/EmailChangeApi.java:22` |
| POST | `v4/clients/{injected_client_id}/logout` | Account | bearer | — | Unit@unresolved | changed | direct | `com/immediasemi/blink/common/account/AccountApi.java:49` |
| POST | `v4/clients/{injected_client_id}/password_change` | PasswordChange | bearer | com.immediasemi.blink.account.password.ResetPasswordPostBody@unresolved | Unit@unresolved | changed | direct | `com/immediasemi/blink/settings/password/PasswordChangeApi.java:18` |
| POST | `v4/clients/{injected_client_id}/password_change/pin/generate` | PasswordChange | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse@unresolved | changed | direct | `com/immediasemi/blink/settings/password/PasswordChangeApi.java:24` |
| POST | `v4/clients/{injected_client_id}/password_change/pin/verify` | PasswordChange | bearer | com.immediasemi.blink.common.account.verification.VerifyPinPostBody@unresolved | com.immediasemi.blink.common.account.verification.VerifyPinResponse@unresolved | changed | direct | `com/immediasemi/blink/settings/password/PasswordChangeApi.java:27` |
| POST | `v4/clients/{injected_client_id}/pin/verify` | Client | bearer | com.immediasemi.blink.api.retrofit.VerifyPinBody | com.immediasemi.blink.api.retrofit.PinVerificationResponse | changed | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:35` |
| POST | `v4/users/pin/resend` | Account | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse@unresolved | changed | direct | `com/immediasemi/blink/common/account/AccountApi.java:58` |
| POST | `v4/users/pin/verify` | Account | bearer | com.immediasemi.blink.common.account.verification.VerifyPinPostBody@unresolved | com.immediasemi.blink.common.account.verification.VerifyPinResponse@unresolved | changed | direct | `com/immediasemi/blink/common/account/AccountApi.java:61` |
| POST | `v5/clients/{injected_client_id}/client_verification/pin/resend` | Client | bearer | — | com.immediasemi.blink.api.retrofit.ResendClientVerificationCodeResponse | changed | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:29` |
| POST | `v5/clients/{injected_client_id}/client_verification/pin/verify` | Client | bearer | com.immediasemi.blink.api.retrofit.SubmitVerificationRequest | com.immediasemi.blink.api.retrofit.PinVerificationResponse | changed | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:32` |
| POST | `v5/clients/{injected_client_id}/phone_number_change` | PhoneNumberChange | bearer | com.immediasemi.blink.api.retrofit.ChangePhoneNumberBody | com.immediasemi.blink.api.retrofit.ChangePhoneNumberResponse | changed | direct | `com/immediasemi/blink/common/account/phone/PhoneNumberChangeApi.java:18` |
| POST | `v5/clients/{injected_client_id}/phone_number_change` | PhoneNumberChange | bearer | com.immediasemi.blink.account.phone.AddPhoneNumberPostBody | com.immediasemi.blink.api.retrofit.ChangePhoneNumberResponse | changed | direct | `com/immediasemi/blink/common/account/phone/PhoneNumberChangeApi.java:21` |
| POST | `v5/clients/{injected_client_id}/phone_number_change/pin/verify` | PhoneNumberChange | bearer | com.immediasemi.blink.api.retrofit.SubmitVerificationRequest | com.immediasemi.blink.api.retrofit.PinVerificationResponse | changed | direct | `com/immediasemi/blink/common/account/phone/PhoneNumberChangeApi.java:24` |

### shared-rest

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| POST | `accounts/{injected_account_id}/networks/{network}/cameras/{camera}/{type}` | Camera | bearer | — | com.immediasemi.blink.device.network.command.CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:81` |
| POST | `accounts/{injected_account_id}/networks/{network}/cameras/{camera}/thumbnail` | Camera | bearer | — | com.immediasemi.blink.device.network.command.CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:96` |
| POST | `accounts/{injected_account_id}/networks/{network}/cameras/add` | Camera | bearer | com.immediasemi.blink.device.onboard.camera.AddCameraBody | com.immediasemi.blink.models.AddCameraResponseBody | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:36` |
| GET | `accounts/{injected_account_id}/networks/{network}/commands/{command}` | Command | bearer | — | com.immediasemi.blink.device.network.command.SupervisorKommand | unchanged | direct | `com/immediasemi/blink/common/device/network/command/CommandApi.java:25` |
| GET | `accounts/{injected_account_id}/networks/{network}/commands/{command}` | Command | bearer | — | com.immediasemi.blink.device.network.command.CameraActionSupervisorKommand | unchanged | direct | `com/immediasemi/blink/common/device/network/command/CommandApi.java:28` |
| GET | `accounts/{injected_account_id}/networks/{network}/commands/{command}` | Command | bearer | — | com.immediasemi.blink.common.device.camera.video.live.LiveViewSupervisorKommand | unchanged | direct | `com/immediasemi/blink/common/device/network/command/CommandApi.java:31` |
| GET | `accounts/{injected_account_id}/networks/{network}/commands/{command}` | Command | bearer | — | com.immediasemi.blink.device.network.command.SupervisorKommandWithChildren | changed | direct | `com/immediasemi/blink/common/device/network/command/CommandApi.java:34` |
| POST | `accounts/{injected_account_id}/networks/{network}/commands/{command}/done` | Command | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/network/command/CommandApi.java:40` |
| POST | `accounts/{injected_account_id}/networks/{network}/commands/{command}/update` | Command | bearer | com.immediasemi.blink.api.requests.onboarding.OnboardingCommandUpdate.UpdateCommandRequest | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/network/command/CommandApi.java:37` |
| POST | `accounts/{injected_account_id}/networks/{network}/commands/{command}/update` | Command | bearer | com.immediasemi.blink.api.retrofit.TerminateOnboardingBody | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/network/command/CommandApi.java:43` |
| POST | `accounts/{injected_account_id}/networks/{network}/delete` | Network | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/device/network/NetworkApi.java:34` |
| POST | `accounts/{injected_account_id}/networks/{network}/update` | Network | bearer | com.immediasemi.blink.api.retrofit.UpdateNetworkSaveAllLiveViews | Unit@snake_case | changed | direct | `com/immediasemi/blink/device/network/NetworkApi.java:52` |
| POST | `accounts/{injected_account_id}/networks/{network}/update` | Network | bearer | com.immediasemi.blink.api.retrofit.UpdateSystemNameBody | Unit@snake_case | changed | direct | `com/immediasemi/blink/device/network/NetworkApi.java:55` |
| POST | `accounts/{injected_account_id}/networks/{network}/update` | Network | bearer | com.immediasemi.blink.api.retrofit.UpdateTimezoneBody | Unit@snake_case | changed | direct | `com/immediasemi/blink/device/network/NetworkApi.java:58` |
| POST | `accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/delete` | Camera | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:45` |
| POST | `accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/status` | Camera | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:84` |
| POST | `accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/delete` | SyncModule | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:22` |
| POST | `accounts/{injected_account_id}/networks/add` | Network | bearer | com.immediasemi.blink.common.system.AddNetworkBody | com.immediasemi.blink.models.ANetwork | changed | direct | `com/immediasemi/blink/device/network/NetworkApi.java:31` |
| POST | `accounts/{injected_account_id}/system_offline/{network}` | Network | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/device/network/NetworkApi.java:43` |
| GET | `v1/accounts/{injected_account_id}/access` | ReadSubscription | bearer | — | com.immediasemi.blink.common.subscription.AccessResponse | changed | direct | `com/immediasemi/blink/common/subscription/ReadSubscriptionApi.java:13` |
| GET | `v1/accounts/{injected_account_id}/doorbells/{serial}/fw_update` | Doorbell | bearer | — | ResponseBody@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:49` |
| GET | `v1/accounts/{injected_account_id}/doorbells/{serial}/token` | Doorbell | bearer | — | com.immediasemi.blink.common.device.camera.wired.DeviceAuthTokenResponse | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:55` |
| GET | `v1/accounts/{injected_account_id}/feature_flags/enabled` | FeatureFlag | bearer | — | com.immediasemi.blink.common.flag.FeatureFlagsResponse | changed | direct | `com/immediasemi/blink/common/flag/FeatureFlagApi.java:12` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/accessories/delete` | Accessory | bearer | com.immediasemi.blink.device.accessory.DeleteAccessoryBody | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/device/accessory/AccessoryApi.java:20` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/accessories/rosie/owl/{owl_id}/calibrate` | Owl | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:32` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/cameras/{camera_id}/snooze` | Camera | bearer | com.immediasemi.blink.api.retrofit.SnoozeBody | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:111` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/cameras/{camera_id}/unsnooze` | Camera | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:120` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/change_mode` | Doorbell | bearer | — | com.immediasemi.blink.api.retrofit.AddLotusResponse | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:73` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/change_wifi` | Doorbell | bearer | com.immediasemi.blink.device.onboard.OnboardingBody | com.immediasemi.blink.api.retrofit.AddLotusResponse | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:43` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/clear_creds` | Doorbell | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:76` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/stay_awake` | Doorbell | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:70` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{lotus_id}/snooze` | Doorbell | bearer | com.immediasemi.blink.api.retrofit.SnoozeBody | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:130` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{lotus_id}/unsnooze` | Doorbell | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:136` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/accessories/rosie/{rosie_id}/delete` | Owl | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:50` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/snooze` | Owl | bearer | com.immediasemi.blink.api.retrofit.SnoozeBody | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:101` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/unsnooze` | Owl | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:107` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/snooze` | Network | bearer | com.immediasemi.blink.api.retrofit.SnoozeBody | Unit@snake_case | changed | direct | `com/immediasemi/blink/device/network/NetworkApi.java:46` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/state/disarm` | Network | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/device/network/NetworkApi.java:37` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/unsnooze` | Network | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/device/network/NetworkApi.java:49` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/accessories/add` | Accessory | bearer | com.immediasemi.blink.device.accessory.AddAccessoryBody | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/device/accessory/AccessoryApi.java:17` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/calibrate` | Camera | bearer | com.immediasemi.blink.api.retrofit.TemperatureCalibrationPostBody | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:102` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs` | Camera | bearer | — | com.immediasemi.blink.models.FloodlightProgramConfig | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:63` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/delete` | Camera | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:51` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/disable` | Camera | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:54` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/enable` | Camera | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:57` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/update` | Camera | bearer | com.immediasemi.blink.models.CreateProgramBody | com.immediasemi.blink.models.FloodlightProgramConfig | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:123` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/create` | Camera | bearer | com.immediasemi.blink.models.CreateProgramBody | com.immediasemi.blink.models.FloodlightProgramConfig | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:39` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/temp_alert_disable` | Camera | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:114` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/temp_alert_enable` | Camera | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:117` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` | Camera | bearer | — | com.immediasemi.blink.device.camera.zone.api.AdvancedCameraZones | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:69` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` | Camera | bearer | com.immediasemi.blink.device.camera.zone.api.AdvancedCameraZones | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:105` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config` | Doorbell | bearer | — | com.immediasemi.blink.models.LotusChimeConfig | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:61` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config` | Doorbell | bearer | com.immediasemi.blink.models.UpdateLotusChimeConfig | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:121` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/config` | Doorbell | bearer | — | com.immediasemi.blink.models.LotusConfigInfo | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:58` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/power_test` | Doorbell | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:79` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/trigger_chime` | Doorbell | bearer | com.immediasemi.blink.models.TestLotusDingConfig | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:133` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/calibrate` | Doorbell | bearer | com.immediasemi.blink.api.retrofit.TemperatureCalibrationPostBody | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:109` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/temp_alert_disable` | Doorbell | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:103` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/temp_alert_enable` | Doorbell | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:106` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/disable` | Doorbell | bearer | — | com.immediasemi.blink.device.network.command.CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:85` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/enable` | Doorbell | bearer | — | com.immediasemi.blink.device.network.command.CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:97` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/status` | Doorbell | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:115` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/status` | Doorbell | bearer | — | com.immediasemi.blink.models.Command | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:118` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/thumbnail` | Doorbell | bearer | — | com.immediasemi.blink.device.network.command.CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:112` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` | Doorbell | bearer | — | com.immediasemi.blink.device.camera.zone.api.AdvancedCameraZones | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:64` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` | Doorbell | bearer | com.immediasemi.blink.device.camera.zone.api.AdvancedCameraZones | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:124` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/add` | Doorbell | bearer | com.immediasemi.blink.device.onboard.doorbell.add.AddLotusBody | com.immediasemi.blink.api.retrofit.AddLotusResponse | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:40` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs` | Owl | bearer | — | com.immediasemi.blink.models.FloodlightProgramConfig | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:65` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/delete` | Owl | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:47` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/disable` | Owl | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:53` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/enable` | Owl | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:59` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/update` | Owl | bearer | com.immediasemi.blink.models.CreateProgramBody | com.immediasemi.blink.models.FloodlightProgramConfig | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:110` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/create` | Owl | bearer | com.immediasemi.blink.models.CreateProgramBody | com.immediasemi.blink.models.FloodlightProgramConfig | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:38` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/add` | Owl | bearer | com.immediasemi.blink.common.device.camera.wired.AddOwlPostBody | com.immediasemi.blink.common.device.camera.wired.AddOwlResponse | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:71` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/add` | Owl | bearer | com.immediasemi.blink.device.onboard.OnboardingBody | com.immediasemi.blink.api.retrofit.OwlAddBody | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:104` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/programs` | Program | bearer | — | com.immediasemi.blink.scheduling.Program | unchanged | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:32` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/delete` | Program | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:23` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/disable` | Program | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:26` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/enable` | Program | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:29` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/update` | Program | bearer | com.immediasemi.blink.scheduling.UpdateProgramRequest | Unit@snake_case | changed | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:35` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/programs/create` | Program | bearer | com.immediasemi.blink.scheduling.Program | Unit@snake_case | changed | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:20` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{camera}/accessories/{accessoryType}/{accessoryId}/delete` | Camera | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:42` |
| GET | `v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/network_type` | Camera | bearer | — | com.immediasemi.blink.models.VideoNetworksConfig | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:66` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/network_type` | Camera | bearer | com.immediasemi.blink.common.device.camera.video.VideoNetworkTypeBody | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:99` |
| GET | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/list` | Doorbell | bearer | — | com.immediasemi.blink.common.device.camera.wired.ChimeCamerasResponse | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:52` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/update` | Doorbell | bearer | com.immediasemi.blink.common.device.camera.wired.ChimeCamerasPostBody | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:82` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/config` | Doorbell | bearer | com.immediasemi.blink.models.UpdateLotusBody | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:88` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/delete` | Doorbell | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:46` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/status` | Doorbell | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:94` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/ob_cancel` | Doorbell | bearer | com.immediasemi.blink.common.device.camera.doorbell.CancelOnboardingPostBody | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:91` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/accessories/{accessoryType}/{accessoryId}/delete` | Owl | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:41` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/lights/{lightControl}` | Owl | bearer | — | com.immediasemi.blink.device.network.command.CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:77` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/lights/{lightControl}` | Owl | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:80` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/change_wifi` | Owl | bearer | com.immediasemi.blink.device.onboard.OnboardingBody | com.immediasemi.blink.api.retrofit.OwlAddBody | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:35` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/change_wifi` | Owl | bearer | com.immediasemi.blink.common.device.camera.wired.AddOwlPostBody | com.immediasemi.blink.common.device.camera.wired.AddOwlResponse | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:74` |
| GET | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config` | Owl | bearer | — | com.immediasemi.blink.models.OwlConfigInfo | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:62` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config` | Owl | bearer | com.immediasemi.blink.models.UpdateOwlBody | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:86` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config` | Owl | bearer | com.immediasemi.blink.models.UpdateOwlBody | com.immediasemi.blink.device.network.command.CameraActionKommand | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:89` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/delete` | Owl | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:44` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/status` | Owl | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:92` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/thumbnail` | Owl | bearer | — | com.immediasemi.blink.device.network.command.CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:95` |
| DELETE | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/pair` | Camera | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:48` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/pair` | Camera | bearer | com.immediasemi.blink.common.device.camera.PairCameraBody | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:90` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/swap_pair` | Camera | bearer | com.immediasemi.blink.common.device.camera.SwapCameraBody | Unit@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:93` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/state/{type}` | Network | bearer | — | com.immediasemi.blink.models.Command | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:25` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/state/arm` | Network | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/device/network/NetworkApi.java:40` |
| DELETE | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage` | Media | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:27` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/eject` | SyncModule | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:28` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/format` | SyncModule | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:31` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/delete/{clipId}` | Media | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:30` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/request/{clipId}` | Media | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:24` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/request` | Media | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:33` |
| GET | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/media/{commandId}` | Media | bearer | — | com.immediasemi.blink.video.clip.media.MediaResponse | changed | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:36` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/mount` | SyncModule | bearer | — | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:37` |
| GET | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/status` | SyncModule | bearer | — | com.immediasemi.blink.api.retrofit.LocalStorageStatusResponse | changed | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:34` |
| POST | `v1/accounts/{injected_account_id}/networks/bulk_location_assignment` | Network | bearer | com.immediasemi.blink.device.network.BulkLocationAssignmentRequest | com.immediasemi.blink.device.network.BulkLocationAssignmentResponse | changed | direct | `com/immediasemi/blink/device/network/NetworkApi.java:28` |
| GET | `v1/accounts/{injected_account_id}/owls/{serial}/fw_update` | Owl | bearer | — | ResponseBody@snake_case | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:56` |
| GET | `v1/accounts/{injected_account_id}/smart_video_descriptions` | SmartVideoDescriptions | bearer | — | com.immediasemi.blink.settings.SmartVideoDescriptionsResponse | changed | direct | `com/immediasemi/blink/settings/SmartVideoDescriptionsApi.java:18` |
| POST | `v1/accounts/{injected_account_id}/smart_video_descriptions` | SmartVideoDescriptions | bearer | com.immediasemi.blink.settings.SmartVideoDescriptionsPostBody | Unit@snake_case | changed | direct | `com/immediasemi/blink/settings/SmartVideoDescriptionsApi.java:24` |
| POST | `v1/accounts/{injected_account_id}/smart_video_descriptions/summarize` | SmartVideoDescriptions | bearer | com.immediasemi.blink.video.clip.moment.SummarizeClipsRequest | com.immediasemi.blink.video.clip.moment.SummarizeClipsResponse | changed | direct | `com/immediasemi/blink/settings/SmartVideoDescriptionsApi.java:21` |
| GET | `v1/accounts/{injected_account_id}/sync_modules/{serial}/fw_update` | SyncModule | bearer | — | ResponseBody@snake_case | changed | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:25` |
| GET | `v2/accounts/{injected_account_id}/devices/identify/{serialNumber}` | Device | bearer | — | com.immediasemi.blink.common.device.IdentifyDeviceResponseApiModel | changed | direct | `com/immediasemi/blink/common/device/DeviceApi.java:13` |
| GET | `v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/config` | Camera | bearer | — | com.immediasemi.blink.models.CameraConfig | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:60` |
| GET | `v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` | Camera | bearer | — | com.immediasemi.blink.device.camera.zone.api.ZoneV2Response | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:72` |
| POST | `v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` | Camera | bearer | com.immediasemi.blink.device.camera.zone.api.ZoneV2Response | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:108` |
| GET | `v2/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` | Doorbell | bearer | — | com.immediasemi.blink.device.camera.zone.api.ZoneV2Response | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:67` |
| POST | `v2/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` | Doorbell | bearer | com.immediasemi.blink.device.camera.zone.api.ZoneV2Response | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:127` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/cameras/{camera}/light_accessories/{accessoryId}/lights/{lightControl}` | Camera | bearer | — | com.immediasemi.blink.device.network.command.CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:75` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/config` | Camera | bearer | com.immediasemi.blink.api.retrofit.UpdateCameraBody | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:78` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/liveview` | Doorbell | bearer | com.immediasemi.blink.common.device.camera.video.live.LiveViewCommandPostBody | com.immediasemi.blink.common.device.camera.video.live.LiveViewCommandResponse | changed | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:100` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/liveview` | Owl | bearer | com.immediasemi.blink.common.device.camera.video.live.LiveViewCommandPostBody | com.immediasemi.blink.common.device.camera.video.live.LiveViewCommandResponse | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:83` |
| GET | `v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/zones` | Owl | bearer | — | com.immediasemi.blink.device.camera.zone.api.ZoneV2Response | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:68` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/zones` | Owl | bearer | com.immediasemi.blink.device.camera.zone.api.ZoneV2Response | com.immediasemi.blink.device.network.command.Kommand | changed | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:98` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{type}` | SyncModule | bearer | com.immediasemi.blink.device.onboard.OnboardingBody | com.immediasemi.blink.models.Command | changed | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:40` |
| GET | `v2/accounts/{injected_account_id}/subscriptions/entitlements` | ReadSubscription | bearer | — | com.immediasemi.blink.api.retrofit.EntitlementResponse | changed | direct | `com/immediasemi/blink/common/subscription/ReadSubscriptionApi.java:16` |
| GET | `v3/accounts/{injected_account_id}/subscriptions/plans` | ReadSubscription | bearer | — | com.immediasemi.blink.common.subscription.SubscriptionPlansResponse | removed | direct | `com/immediasemi/blink/common/subscription/ReadSubscriptionApi.java:19` |
| GET | `v4/accounts/{injected_account_id}/homescreen` | HomeScreen | bearer | — | com.immediasemi.blink.utils.sync.HomeScreen | changed | direct | `com/immediasemi/blink/utils/sync/HomeScreenApi.java:12` |
| POST | `v4/accounts/{injected_account_id}/media` | Media | bearer | com.immediasemi.blink.video.clip.media.MediaPostBody | com.immediasemi.blink.video.clip.media.MediaResponse | changed | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:57` |
| GET | `v4/accounts/{injected_account_id}/media_settings` | Media | bearer | — | com.immediasemi.blink.video.clip.media.MediaSettingsResponse | changed | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:39` |
| PATCH | `v4/accounts/{injected_account_id}/media_settings` | Media | bearer | com.immediasemi.blink.video.clip.media.MediaSettingsPatch | Unit@snake_case | changed | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:45` |
| DELETE | `v4/accounts/{injected_account_id}/media/{mediaId}/delete` | Media | bearer | — | Unit@snake_case | changed | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:21` |
| POST | `v4/accounts/{injected_account_id}/media/delete` | Media | bearer | com.immediasemi.blink.api.retrofit.MediaListBody | Unit@snake_case | changed | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:48` |
| POST | `v4/accounts/{injected_account_id}/media/favorite` | Media | bearer | com.immediasemi.blink.video.clip.media.FavoriteEventIdsBody | Unit@snake_case | added | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:51` |
| POST | `v4/accounts/{injected_account_id}/media/mark_as_viewed` | Media | bearer | com.immediasemi.blink.api.retrofit.MediaListBody | Unit@snake_case | changed | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:54` |
| POST | `v4/accounts/{injected_account_id}/media/unfavorite` | Media | bearer | com.immediasemi.blink.video.clip.media.FavoriteEventIdsBody | Unit@snake_case | added | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:60` |
| GET | `v4/accounts/{injected_account_id}/subscriptions/plans` | ReadSubscription | bearer | — | com.immediasemi.blink.common.subscription.SubscriptionPlansResponse | changed | direct | `com/immediasemi/blink/common/subscription/ReadSubscriptionApi.java:19` |
| GET | `v4/accounts/{injected_account_id}/unwatched_media` | Media | bearer | — | com.immediasemi.blink.video.clip.media.UnwatchedMediaResponse | changed | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:42` |
| POST | `v6/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/liveview` | Camera | bearer | com.immediasemi.blink.common.device.camera.video.live.LiveViewCommandPostBody | com.immediasemi.blink.common.device.camera.video.live.LiveViewCommandResponse | changed | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:87` |

## Request and response schema index

| Model | Kind | Fields | Confidence | Evidence |
|---|---|---:|---|---|
| `AutoCompleteResponse` | object | 2 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/AutoCompleteResponse.java` |
| `Bounds` | object | 2 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/Bounds.java` |
| `ClassificationConfidence` | enum | 3 | direct | `com/amazon/rbks/mobile/locations/network/entities/ClassificationConfidence.java` |
| `ClassificationDecision` | enum | 3 | direct | `com/amazon/rbks/mobile/locations/network/entities/ClassificationDecision.java` |
| `GeoCodingRequest` | object | 3 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/GeoCodingRequest.java` |
| `GeoCodingRequestBounds` | object | 2 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/GeoCodingRequestBounds.java` |
| `LocationAddressBody` | object | 8 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/LocationAddressBody.java` |
| `LocationBody` | object | 15 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/LocationBody.java` |
| `LocationByIpResponse` | object | 8 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/LocationByIpResponse.java` |
| `LocationCoordinatesBody` | object | 2 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/LocationCoordinatesBody.java` |
| `LocationDetailGeometry` | object | 2 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/LocationDetailGeometry.java` |
| `LocationDetailsResponse` | object | 13 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/LocationDetailsResponse.java` |
| `LocationEntitlementsBody` | object | 1 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/LocationEntitlementsBody.java` |
| `LocationPredictionResponse` | object | 3 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/LocationPredictionResponse.java` |
| `LocationType` | enum | 2 | direct | `com/amazon/rbks/mobile/locations/network/entities/LocationType.java` |
| `PutLocationRequest` | object | 13 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/PutLocationRequest.java` |
| `LocationSubtypeNetwork` | object | 3 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/subtype/LocationSubtypeNetwork.java` |
| `SubtypeBody` | object | 1 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/subtype/SubtypeBody.java` |
| `SubtypeData` | object | 2 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/subtype/SubtypeData.java` |
| `TagDetailsNetwork` | object | 2 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/subtype/TagDetailsNetwork.java` |
| `UpdateLocationRequest` | object | 12 | unresolved | `com/amazon/rbks/mobile/locations/network/entities/UpdateLocationRequest.java` |
| `AuthenticatePasswordBody` | object | 1 | unresolved | `com/immediasemi/blink/account/auth/AuthenticatePasswordBody.java` |
| `AuthenticatePasswordResponse` | object | 2 | unresolved | `com/immediasemi/blink/account/auth/AuthenticatePasswordResponse.java` |
| `ResetPasswordPostBody` | object | 6 | unresolved | `com/immediasemi/blink/account/password/ResetPasswordPostBody.java` |
| `ResetPasswordPostBody` | object | 6 | unresolved | `com/immediasemi/blink/account/password/ResetPasswordPostBody.java` |
| `AddPhoneNumberPostBody` | object | 3 | unresolved | `com/immediasemi/blink/account/phone/AddPhoneNumberPostBody.java` |
| `ChimeType` | enum | 2 | unresolved | `com/immediasemi/blink/adddevice/lotus/chime/ChimeType.java` |
| `Stages` | object | 0 | inferred | `com/immediasemi/blink/api/requests/onboarding/OnboardingCommandUpdate/stage/Stages.java` |
| `UpdateCommandRequest` | object | 1 | unresolved | `com/immediasemi/blink/api/requests/onboarding/OnboardingCommandUpdate/UpdateCommandRequest.java` |
| `AcknowledgeNotificationBody` | enum | 2 | unresolved | `com/immediasemi/blink/api/retrofit/AcknowledgeNotificationBody.java` |
| `AddLotusDoorbell` | object | 3 | unresolved | `com/immediasemi/blink/api/retrofit/AddLotusDoorbell.java` |
| `AddLotusResponse` | object | 1 | unresolved | `com/immediasemi/blink/api/retrofit/AddLotusResponse.java` |
| `ChangePhoneNumberBody` | object | 4 | unresolved | `com/immediasemi/blink/api/retrofit/ChangePhoneNumberBody.java` |
| `ChangePhoneNumberResponse` | object | 3 | unresolved | `com/immediasemi/blink/api/retrofit/ChangePhoneNumberResponse.java` |
| `Client` | object | 8 | unresolved | `com/immediasemi/blink/api/retrofit/Client.java` |
| `CountryBody` | object | 1 | unresolved | `com/immediasemi/blink/api/retrofit/CountryBody.java` |
| `CountryResponse` | object | 1 | unresolved | `com/immediasemi/blink/api/retrofit/CountryResponse.java` |
| `DeleteClientBody` | object | 1 | unresolved | `com/immediasemi/blink/api/retrofit/DeleteClientBody.java` |
| `DeviceRegistrationStatus` | object | 3 | unresolved | `com/immediasemi/blink/api/retrofit/DeviceRegistrationStatus.java` |
| `Entitlement` | object | 3 | unresolved | `com/immediasemi/blink/api/retrofit/Entitlement.java` |
| `EntitlementFeature` | object | 4 | unresolved | `com/immediasemi/blink/api/retrofit/EntitlementFeature.java` |
| `EntitlementHomescreen` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/EntitlementHomescreen.java` |
| `EntitlementResponse` | object | 2 | unresolved | `com/immediasemi/blink/api/retrofit/EntitlementResponse.java` |
| `EventDataKeyValuePair` | object | 2 | unresolved | `com/immediasemi/blink/api/retrofit/EventDataKeyValuePair.java` |
| `GetClientsResponse` | object | 1 | unresolved | `com/immediasemi/blink/api/retrofit/GetClientsResponse.java` |
| `LocalStorageStatusResponse` | object | 12 | unresolved | `com/immediasemi/blink/api/retrofit/LocalStorageStatusResponse.java` |
| `LogsBody` | object | 3 | unresolved | `com/immediasemi/blink/api/retrofit/LogsBody.java` |
| `MediaListBody` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/MediaListBody.java` |
| `NotificationPreferencesResponse` | object | 1 | unresolved | `com/immediasemi/blink/api/retrofit/NotificationPreferencesResponse.java` |
| `Owl` | object | 3 | unresolved | `com/immediasemi/blink/api/retrofit/Owl.java` |
| `OwlAddBody` | object | 2 | unresolved | `com/immediasemi/blink/api/retrofit/OwlAddBody.java` |
| `PinVerificationResponse` | object | 8 | unresolved | `com/immediasemi/blink/api/retrofit/PinVerificationResponse.java` |
| `ResendClientVerificationCodeResponse` | object | 3 | unresolved | `com/immediasemi/blink/api/retrofit/ResendClientVerificationCodeResponse.java` |
| `SessionKeys` | object | 2 | direct | `com/immediasemi/blink/api/retrofit/SessionKeys.java` |
| `SetSSIDBody` | object | 9 | unresolved | `com/immediasemi/blink/api/retrofit/SetSSIDBody.java` |
| `SnoozeBody` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/SnoozeBody.java` |
| `SubmitVerificationRequest` | object | 2 | unresolved | `com/immediasemi/blink/api/retrofit/SubmitVerificationRequest.java` |
| `SubscriptionHomeScreen` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/SubscriptionHomeScreen.java` |
| `TemperatureCalibrationPostBody` | object | 3 | unresolved | `com/immediasemi/blink/api/retrofit/TemperatureCalibrationPostBody.java` |
| `TerminateOnboardingBody` | object | 2 | unresolved | `com/immediasemi/blink/api/retrofit/TerminateOnboardingBody.java` |
| `TrackingEvent` | object | 3 | unresolved | `com/immediasemi/blink/api/retrofit/TrackingEvent.java` |
| `TrackingEvents` | object | 1 | unresolved | `com/immediasemi/blink/api/retrofit/TrackingEvents.java` |
| `UpdateAccessoryBody` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/UpdateAccessoryBody.java` |
| `UpdateCameraBody` | enum | 40 | unresolved | `com/immediasemi/blink/api/retrofit/UpdateCameraBody.java` |
| `UpdateLightAccessoryBody` | object | 6 | direct | `com/immediasemi/blink/api/retrofit/UpdateLightAccessoryBody.java` |
| `UpdateNetworkSaveAllLiveViews` | object | 1 | unresolved | `com/immediasemi/blink/api/retrofit/UpdateNetworkSaveAllLiveViews.java` |
| `UpdateStormBody` | object | 5 | direct | `com/immediasemi/blink/api/retrofit/UpdateStormBody.java` |
| `UpdateSuperiorBody` | object | 5 | direct | `com/immediasemi/blink/api/retrofit/UpdateSuperiorBody.java` |
| `UpdateSystemNameBody` | object | 3 | unresolved | `com/immediasemi/blink/api/retrofit/UpdateSystemNameBody.java` |
| `UpdateTimezoneBody` | object | 5 | unresolved | `com/immediasemi/blink/api/retrofit/UpdateTimezoneBody.java` |
| `VerifyPinBody` | object | 4 | unresolved | `com/immediasemi/blink/api/retrofit/VerifyPinBody.java` |
| `AccessAuthorization` | object | 5 | unresolved | `com/immediasemi/blink/common/account/AccessAuthorization.java` |
| `AccessInvitation` | object | 3 | unresolved | `com/immediasemi/blink/common/account/AccessInvitation.java` |
| `AccessMessage` | object | 4 | unresolved | `com/immediasemi/blink/common/account/AccessMessage.java` |
| `Account` | object | 20 | unresolved | `com/immediasemi/blink/common/account/Account.java` |
| `Account` | object | 20 | unresolved | `com/immediasemi/blink/common/account/Account.java` |
| `Auth` | object | 1 | unresolved | `com/immediasemi/blink/common/account/auth/Auth.java` |
| `AuthenticationResponse` | object | 7 | unresolved | `com/immediasemi/blink/common/account/auth/AuthenticationResponse.java` |
| `RefreshTokensResponse` | object | 5 | direct | `com/immediasemi/blink/common/account/auth/RefreshTokensResponse.java` |
| `RefreshTokensResponse` | object | 5 | unresolved | `com/immediasemi/blink/common/account/auth/RefreshTokensResponse.java` |
| `RegisterBody` | object | 14 | unresolved | `com/immediasemi/blink/common/account/auth/RegisterBody.java` |
| `TokenUpgradePostBody` | object | 1 | unresolved | `com/immediasemi/blink/common/account/auth/TokenUpgradePostBody.java` |
| `ValidateEmailPostBody` | object | 1 | direct | `com/immediasemi/blink/common/account/auth/ValidateEmailPostBody.java` |
| `ValidatePasswordPostBody` | object | 1 | direct | `com/immediasemi/blink/common/account/auth/ValidatePasswordPostBody.java` |
| `ValidationResponse` | object | 2 | unresolved | `com/immediasemi/blink/common/account/auth/ValidationResponse.java` |
| `ClientUpdatePostBody` | object | 4 | unresolved | `com/immediasemi/blink/common/account/client/ClientUpdatePostBody.java` |
| `ClientOptionsBody` | object | 1 | unresolved | `com/immediasemi/blink/common/account/client/option/ClientOptionsBody.java` |
| `DeleteAccountBody` | object | 1 | unresolved | `com/immediasemi/blink/common/account/delete/DeleteAccountBody.java` |
| `FriendlyNamePatchBody` | object | 1 | unresolved | `com/immediasemi/blink/common/account/FriendlyNamePatchBody.java` |
| `GrantedAuthorization` | object | 2 | unresolved | `com/immediasemi/blink/common/account/GrantedAuthorization.java` |
| `AccountOptionsResponse` | object | 15 | unresolved | `com/immediasemi/blink/common/account/option/AccountOptionsResponse.java` |
| `Phone` | object | 4 | unresolved | `com/immediasemi/blink/common/account/phone/Phone.java` |
| `Phone` | object | 4 | unresolved | `com/immediasemi/blink/common/account/phone/Phone.java` |
| `AccountPreferencesBody` | object | 1 | unresolved | `com/immediasemi/blink/common/account/preference/AccountPreferencesBody.java` |
| `AccountPreferencesDetails` | object | 1 | unresolved | `com/immediasemi/blink/common/account/preference/AccountPreferencesDetails.java` |
| `SentInvitation` | object | 4 | unresolved | `com/immediasemi/blink/common/account/SentInvitation.java` |
| `TierInfo` | object | 2 | unresolved | `com/immediasemi/blink/common/account/TierInfo.java` |
| `User` | object | 1 | direct | `com/immediasemi/blink/common/account/User.java` |
| `User` | object | 1 | unresolved | `com/immediasemi/blink/common/account/User.java` |
| `Email` | object | 1 | direct | `com/immediasemi/blink/common/account/verification/Email.java` |
| `GeneratePinPostBody` | object | 3 | direct | `com/immediasemi/blink/common/account/verification/GeneratePinPostBody.java` |
| `GeneratePinResponse` | object | 3 | unresolved | `com/immediasemi/blink/common/account/verification/GeneratePinResponse.java` |
| `GeneratePinResponse` | object | 3 | unresolved | `com/immediasemi/blink/common/account/verification/GeneratePinResponse.java` |
| `Phone` | object | 2 | unresolved | `com/immediasemi/blink/common/account/verification/Phone.java` |
| `PhoneVerificationChannel` | enum | 2 | unresolved | `com/immediasemi/blink/common/account/verification/PhoneVerificationChannel.java` |
| `PhoneVerificationChannel` | enum | 2 | unresolved | `com/immediasemi/blink/common/account/verification/PhoneVerificationChannel.java` |
| `Verification` | object | 2 | unresolved | `com/immediasemi/blink/common/account/verification/Verification.java` |
| `VerificationChannel` | enum | 1 | unresolved | `com/immediasemi/blink/common/account/verification/VerificationChannel.java` |
| `VerificationChannel` | enum | 1 | unresolved | `com/immediasemi/blink/common/account/verification/VerificationChannel.java` |
| `VerifyPinPostBody` | object | 4 | direct | `com/immediasemi/blink/common/account/verification/VerifyPinPostBody.java` |
| `VerifyPinPostBody` | object | 4 | unresolved | `com/immediasemi/blink/common/account/verification/VerifyPinPostBody.java` |
| `VerifyPinResponse` | object | 5 | unresolved | `com/immediasemi/blink/common/account/verification/VerifyPinResponse.java` |
| `VerifyPinResponse` | object | 5 | unresolved | `com/immediasemi/blink/common/account/verification/VerifyPinResponse.java` |
| `CountriesResponse` | object | 2 | unresolved | `com/immediasemi/blink/common/country/CountriesResponse.java` |
| `Region` | object | 3 | unresolved | `com/immediasemi/blink/common/country/Region.java` |
| `RegionsResponse` | object | 3 | unresolved | `com/immediasemi/blink/common/country/RegionsResponse.java` |
| `CameraColor` | enum | 4 | direct | `com/immediasemi/blink/common/device/camera/CameraColor.java` |
| `CancelOnboardingPostBody` | object | 1 | direct | `com/immediasemi/blink/common/device/camera/doorbell/CancelOnboardingPostBody.java` |
| `LotusDoorbellMode` | enum | 1 | unresolved | `com/immediasemi/blink/common/device/camera/doorbell/LotusDoorbellMode.java` |
| `PairCameraBody` | object | 1 | direct | `com/immediasemi/blink/common/device/camera/PairCameraBody.java` |
| `SwapCameraBody` | object | 1 | direct | `com/immediasemi/blink/common/device/camera/SwapCameraBody.java` |
| `LiveViewCommandPostBody` | object | 2 | unresolved | `com/immediasemi/blink/common/device/camera/video/live/LiveViewCommandPostBody.java` |
| `LiveViewCommandResponse` | object | 15 | unresolved | `com/immediasemi/blink/common/device/camera/video/live/LiveViewCommandResponse.java` |
| `LiveViewSupervisorKommand` | object | 1 | unresolved | `com/immediasemi/blink/common/device/camera/video/live/LiveViewSupervisorKommand.java` |
| `PollOptions` | object | 1 | direct | `com/immediasemi/blink/common/device/camera/video/live/PollOptions.java` |
| `VideoNetworkTypeBody` | object | 1 | direct | `com/immediasemi/blink/common/device/camera/video/VideoNetworkTypeBody.java` |
| `AddOwlPostBody` | object | 2 | direct | `com/immediasemi/blink/common/device/camera/wired/AddOwlPostBody.java` |
| `AddOwlResponse` | object | 2 | unresolved | `com/immediasemi/blink/common/device/camera/wired/AddOwlResponse.java` |
| `ChimeCameraDto` | object | 6 | unresolved | `com/immediasemi/blink/common/device/camera/wired/ChimeCameraDto.java` |
| `ChimeCamerasPostBody` | object | 2 | direct | `com/immediasemi/blink/common/device/camera/wired/ChimeCamerasPostBody.java` |
| `ChimeCamerasResponse` | object | 2 | unresolved | `com/immediasemi/blink/common/device/camera/wired/ChimeCamerasResponse.java` |
| `DeviceAuthTokenResponse` | object | 3 | unresolved | `com/immediasemi/blink/common/device/camera/wired/DeviceAuthTokenResponse.java` |
| `SessionKeys` | object | 3 | direct | `com/immediasemi/blink/common/device/camera/wired/SessionKeys.java` |
| `ChimeVolumeSettings` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/ChimeVolumeSettings.java` |
| `CvSettings` | object | 1 | unresolved | `com/immediasemi/blink/common/device/duos/CvSettings.java` |
| `DetectionTypes` | object | 3 | unresolved | `com/immediasemi/blink/common/device/duos/DetectionTypes.java` |
| `DeviceBulkUpdateRequest` | object | 2 | unresolved | `com/immediasemi/blink/common/device/duos/DeviceBulkUpdateRequest.java` |
| `DeviceBulkUpdateResponse` | object | 3 | unresolved | `com/immediasemi/blink/common/device/duos/DeviceBulkUpdateResponse.java` |
| `DeviceEntityUpdateRequest` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/DeviceEntityUpdateRequest.java` |
| `DeviceMetadataUpdate` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/DeviceMetadataUpdate.java` |
| `DeviceMotionSettingsEntity` | object | 2 | unresolved | `com/immediasemi/blink/common/device/duos/DeviceMotionSettingsEntity.java` |
| `DeviceMotionSettingsUpdateRequest` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/DeviceMotionSettingsUpdateRequest.java` |
| `DevicePrivacySettingsEntity` | object | 2 | unresolved | `com/immediasemi/blink/common/device/duos/DevicePrivacySettingsEntity.java` |
| `DevicePrivacySettingsUpdateRequest` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/DevicePrivacySettingsUpdateRequest.java` |
| `DeviceSettings` | object | 2 | direct | `com/immediasemi/blink/common/device/duos/DeviceSettings.java` |
| `DeviceUpdatePayload` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/DeviceUpdatePayload.java` |
| `DuosMotionSettingsPayload` | object | 3 | unresolved | `com/immediasemi/blink/common/device/duos/DuosMotionSettingsPayload.java` |
| `DuosPrivacyBackendSettings` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/DuosPrivacyBackendSettings.java` |
| `DuosPrivacyGeneralSettings` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/DuosPrivacyGeneralSettings.java` |
| `GeneralSettings` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/GeneralSettings.java` |
| `IdentifyDeviceResponseApiModel` | object | 5 | unresolved | `com/immediasemi/blink/common/device/IdentifyDeviceResponseApiModel.java` |
| `MacIdentifyDeviceResponseApiModel` | object | 6 | unresolved | `com/immediasemi/blink/common/device/MacIdentifyDeviceResponseApiModel.java` |
| `RdisAudioConfigurations` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisAudioConfigurations.java` |
| `RdisDevice` | object | 4 | direct | `com/immediasemi/blink/common/device/rdis/RdisDevice.java` |
| `RdisDeviceAttributes` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisDeviceAttributes.java` |
| `RdisDeviceHealth` | object | 3 | unresolved | `com/immediasemi/blink/common/device/rdis/RdisDeviceHealth.java` |
| `RdisDeviceIdentityAttributes` | object | 6 | direct | `com/immediasemi/blink/common/device/rdis/RdisDeviceIdentityAttributes.java` |
| `RdisDeviceSettingsAttributes` | object | 13 | unresolved | `com/immediasemi/blink/common/device/rdis/RdisDeviceSettingsAttributes.java` |
| `RdisDeviceSettingsData` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisDeviceSettingsData.java` |
| `RdisDeviceSettingsIncluded` | object | 3 | unresolved | `com/immediasemi/blink/common/device/rdis/RdisDeviceSettingsIncluded.java` |
| `RdisDeviceSettingsResponse` | object | 3 | unresolved | `com/immediasemi/blink/common/device/rdis/RdisDeviceSettingsResponse.java` |
| `RdisDevicesResponse` | object | 3 | unresolved | `com/immediasemi/blink/common/device/rdis/RdisDevicesResponse.java` |
| `RdisEnabled` | object | 1 | unresolved | `com/immediasemi/blink/common/device/rdis/RdisEnabled.java` |
| `RdisError` | object | 5 | unresolved | `com/immediasemi/blink/common/device/rdis/RdisError.java` |
| `RdisErrorSource` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisErrorSource.java` |
| `RdisFamiliarFacesState` | object | 3 | unresolved | `com/immediasemi/blink/common/device/rdis/RdisFamiliarFacesState.java` |
| `RdisFeatureState` | object | 3 | unresolved | `com/immediasemi/blink/common/device/rdis/RdisFeatureState.java` |
| `RdisImageEnhancements` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisImageEnhancements.java` |
| `RdisIncluded` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisIncluded.java` |
| `RdisIncludedAttrs` | object | 7 | direct | `com/immediasemi/blink/common/device/rdis/RdisIncludedAttrs.java` |
| `RdisLedCapabilities` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisLedCapabilities.java` |
| `RdisLedConfig` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisLedConfig.java` |
| `RdisMotionCapabilities` | object | 4 | direct | `com/immediasemi/blink/common/device/rdis/RdisMotionCapabilities.java` |
| `RdisMotionConfigurations` | object | 6 | unresolved | `com/immediasemi/blink/common/device/rdis/RdisMotionConfigurations.java` |
| `RdisMotionDetectionEnabled` | enum | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisMotionDetectionEnabled.java` |
| `RdisOperation` | object | 2 | unresolved | `com/immediasemi/blink/common/device/rdis/RdisOperation.java` |
| `RdisOperationAttributes` | object | 7 | direct | `com/immediasemi/blink/common/device/rdis/RdisOperationAttributes.java` |
| `RdisOperationData` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisOperationData.java` |
| `RdisOperationsBody` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisOperationsBody.java` |
| `RdisOperationsResponse` | object | 2 | unresolved | `com/immediasemi/blink/common/device/rdis/RdisOperationsResponse.java` |
| `RdisOperationType` | enum | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisOperationType.java` |
| `RdisPlacement` | enum | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisPlacement.java` |
| `RdisRelationship` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisRelationship.java` |
| `RdisRelationshipLinks` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisRelationshipLinks.java` |
| `RdisRelationshipRef` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisRelationshipRef.java` |
| `RdisRelationships` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisRelationships.java` |
| `RdisSignalStrength` | enum | 6 | direct | `com/immediasemi/blink/common/device/rdis/RdisSignalStrength.java` |
| `RdisStatusLed` | enum | 1 | unresolved | `com/immediasemi/blink/common/device/rdis/RdisStatusLed.java` |
| `RdisVideoConfigurations` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisVideoConfigurations.java` |
| `RdisZone` | object | 2 | unresolved | `com/immediasemi/blink/common/device/rdis/RdisZone.java` |
| `RdisZoneVertex` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisZoneVertex.java` |
| `DeviceRegistryPatchBody` | object | 1 | unresolved | `com/immediasemi/blink/common/device/registry/DeviceRegistryPatchBody.java` |
| `AccessPoint` | object | 7 | unresolved | `com/immediasemi/blink/common/device/ringsos/AccessPoint.java` |
| `AccessPointListResponse` | object | 2 | unresolved | `com/immediasemi/blink/common/device/ringsos/AccessPointListResponse.java` |
| `ApIpConfig` | object | 8 | unresolved | `com/immediasemi/blink/common/device/ringsos/ApIpConfig.java` |
| `ApWirelessConfig` | object | 5 | unresolved | `com/immediasemi/blink/common/device/ringsos/ApWirelessConfig.java` |
| `AudioConfig` | object | 1 | direct | `com/immediasemi/blink/common/device/ringsos/AudioConfig.java` |
| `Blink` | object | 4 | unresolved | `com/immediasemi/blink/common/device/ringsos/Blink.java` |
| `ChimeAccessoryConfigInfoResponse` | object | 10 | unresolved | `com/immediasemi/blink/common/device/ringsos/ChimeAccessoryConfigInfoResponse.java` |
| `Client` | object | 4 | unresolved | `com/immediasemi/blink/common/device/ringsos/Client.java` |
| `ClientIpConfig` | object | 5 | unresolved | `com/immediasemi/blink/common/device/ringsos/ClientIpConfig.java` |
| `ConfigurationsAttributes` | object | 2 | direct | `com/immediasemi/blink/common/device/ringsos/ConfigurationsAttributes.java` |
| `ConfigurationsData` | object | 1 | direct | `com/immediasemi/blink/common/device/ringsos/ConfigurationsData.java` |
| `DeviceConfigurationsResponse` | object | 1 | direct | `com/immediasemi/blink/common/device/ringsos/DeviceConfigurationsResponse.java` |
| `IpConfig` | object | 1 | unresolved | `com/immediasemi/blink/common/device/ringsos/IpConfig.java` |
| `LedConfig` | object | 1 | direct | `com/immediasemi/blink/common/device/ringsos/LedConfig.java` |
| `NetworkApConfig` | object | 2 | unresolved | `com/immediasemi/blink/common/device/ringsos/NetworkApConfig.java` |
| `NetworkClientConfig` | object | 3 | unresolved | `com/immediasemi/blink/common/device/ringsos/NetworkClientConfig.java` |
| `NetworkConfigGetResponse` | object | 10 | unresolved | `com/immediasemi/blink/common/device/ringsos/NetworkConfigGetResponse.java` |
| `NetworkConfigPostBody` | object | 3 | unresolved | `com/immediasemi/blink/common/device/ringsos/NetworkConfigPostBody.java` |
| `NetworkConfigStatusResponse` | object | 1 | unresolved | `com/immediasemi/blink/common/device/ringsos/NetworkConfigStatusResponse.java` |
| `RegionConfigPostBody` | object | 3 | unresolved | `com/immediasemi/blink/common/device/ringsos/RegionConfigPostBody.java` |
| `RingSosSetupPostBody` | object | 5 | unresolved | `com/immediasemi/blink/common/device/ringsos/RingSosSetupPostBody.java` |
| `RingSosSetupResponse` | object | 3 | direct | `com/immediasemi/blink/common/device/ringsos/RingSosSetupResponse.java` |
| `SosDeviceOtaStatusResponse` | object | 3 | unresolved | `com/immediasemi/blink/common/device/ringsos/SosDeviceOtaStatusResponse.java` |
| `SosDeviceSetupStatusResponse` | object | 2 | unresolved | `com/immediasemi/blink/common/device/ringsos/SosDeviceSetupStatusResponse.java` |
| `SosSetupPostBody` | object | 8 | unresolved | `com/immediasemi/blink/common/device/ringsos/SosSetupPostBody.java` |
| `SosSetupResponse` | object | 3 | unresolved | `com/immediasemi/blink/common/device/ringsos/SosSetupResponse.java` |
| `UpdateSosDeviceBody` | object | 1 | direct | `com/immediasemi/blink/common/device/ringsos/UpdateSosDeviceBody.java` |
| `Wireless` | object | 3 | unresolved | `com/immediasemi/blink/common/device/ringsos/Wireless.java` |
| `WirelessConfig` | object | 8 | unresolved | `com/immediasemi/blink/common/device/ringsos/WirelessConfig.java` |
| `FeatureFlag` | object | 2 | unresolved | `com/immediasemi/blink/common/flag/FeatureFlag.java` |
| `FeatureFlagsResponse` | object | 1 | unresolved | `com/immediasemi/blink/common/flag/FeatureFlagsResponse.java` |
| `AccessHomescreen` | object | 1 | direct | `com/immediasemi/blink/common/subscription/AccessHomescreen.java` |
| `AccessItem` | object | 2 | direct | `com/immediasemi/blink/common/subscription/AccessItem.java` |
| `AccessItemStatus` | object | 3 | direct | `com/immediasemi/blink/common/subscription/AccessItemStatus.java` |
| `AccessResponse` | object | 2 | direct | `com/immediasemi/blink/common/subscription/AccessResponse.java` |
| `AccessTarget` | object | 2 | direct | `com/immediasemi/blink/common/subscription/AccessTarget.java` |
| `AttachPlanBody` | object | 2 | unresolved | `com/immediasemi/blink/common/subscription/basic/AttachPlanBody.java` |
| `DeviceEligibility` | object | 3 | unresolved | `com/immediasemi/blink/common/subscription/basic/DeviceEligibility.java` |
| `DeviceEligibilityResponse` | object | 1 | unresolved | `com/immediasemi/blink/common/subscription/basic/DeviceEligibilityResponse.java` |
| `DeviceInfo` | object | 2 | unresolved | `com/immediasemi/blink/common/subscription/basic/DeviceInfo.java` |
| `Subscription` | object | 11 | unresolved | `com/immediasemi/blink/common/subscription/Subscription.java` |
| `SubscriptionBanner` | object | 3 | direct | `com/immediasemi/blink/common/subscription/SubscriptionBanner.java` |
| `SubscriptionCycle` | object | 4 | unresolved | `com/immediasemi/blink/common/subscription/SubscriptionCycle.java` |
| `SubscriptionPlan` | object | 2 | direct | `com/immediasemi/blink/common/subscription/SubscriptionPlan.java` |
| `SubscriptionPlansResponse` | object | 5 | unresolved | `com/immediasemi/blink/common/subscription/SubscriptionPlansResponse.java` |
| `SubscriptionTrial` | object | 3 | unresolved | `com/immediasemi/blink/common/subscription/trial/SubscriptionTrial.java` |
| `SubscriptionTrialPopup` | enum | 4 | unresolved | `com/immediasemi/blink/common/subscription/trial/SubscriptionTrialPopup.java` |
| `UpsellEligibility` | object | 3 | unresolved | `com/immediasemi/blink/common/subscription/upsell/UpsellEligibility.java` |
| `AddNetworkBody` | object | 7 | unresolved | `com/immediasemi/blink/common/system/AddNetworkBody.java` |
| `LinkManifest` | object | 2 | unresolved | `com/immediasemi/blink/common/url/LinkManifest.java` |
| `LocaleUrlMap` | object | 2 | unresolved | `com/immediasemi/blink/common/url/LocaleUrlMap.java` |
| `AccessName` | enum | 1 | unresolved | `com/immediasemi/blink/db/enums/AccessName.java` |
| `AccessReason` | enum | 1 | unresolved | `com/immediasemi/blink/db/enums/AccessReason.java` |
| `AccessStatus` | enum | 1 | unresolved | `com/immediasemi/blink/db/enums/AccessStatus.java` |
| `AccessTarget` | enum | 1 | unresolved | `com/immediasemi/blink/db/enums/AccessTarget.java` |
| `EntitlementReason` | enum | 1 | unresolved | `com/immediasemi/blink/db/enums/EntitlementReason.java` |
| `EntitlementStatus` | enum | 1 | unresolved | `com/immediasemi/blink/db/enums/EntitlementStatus.java` |
| `EventDataKey` | enum | 1 | unresolved | `com/immediasemi/blink/db/EventDataKey.java` |
| `EventName` | enum | 1 | unresolved | `com/immediasemi/blink/db/EventName.java` |
| `NetworkRepository` | object | 0 | inferred | `com/immediasemi/blink/db/NetworkRepository.java` |
| `AddAccessoryBody` | object | 2 | unresolved | `com/immediasemi/blink/device/accessory/AddAccessoryBody.java` |
| `DeleteAccessoryBody` | object | 1 | direct | `com/immediasemi/blink/device/accessory/DeleteAccessoryBody.java` |
| `DetectionModes` | object | 3 | direct | `com/immediasemi/blink/device/camera/setting/motion/DetectionModes.java` |
| `MotionRecordingSetting` | object | 1 | direct | `com/immediasemi/blink/device/camera/setting/motion/MotionRecordingSetting.java` |
| `ActivityZonesVersion` | enum | 2 | direct | `com/immediasemi/blink/device/camera/zone/ActivityZonesVersion.java` |
| `AdvancedCameraZones` | object | 3 | unresolved | `com/immediasemi/blink/device/camera/zone/api/AdvancedCameraZones.java` |
| `PrivacyZoneSpan` | object | 4 | direct | `com/immediasemi/blink/device/camera/zone/api/PrivacyZoneSpan.java` |
| `ZoneV2Response` | object | 7 | direct | `com/immediasemi/blink/device/camera/zone/api/ZoneV2Response.java` |
| `BulkLocationAssignment` | object | 2 | direct | `com/immediasemi/blink/device/network/BulkLocationAssignment.java` |
| `BulkLocationAssignmentRequest` | object | 1 | direct | `com/immediasemi/blink/device/network/BulkLocationAssignmentRequest.java` |
| `BulkLocationAssignmentResponse` | object | 2 | unresolved | `com/immediasemi/blink/device/network/BulkLocationAssignmentResponse.java` |
| `CameraActionKommand` | object | 7 | unresolved | `com/immediasemi/blink/device/network/command/CameraActionKommand.java` |
| `CameraActionSupervisorKommand` | object | 1 | unresolved | `com/immediasemi/blink/device/network/command/CameraActionSupervisorKommand.java` |
| `Kommand` | object | 2 | unresolved | `com/immediasemi/blink/device/network/command/Kommand.java` |
| `PollingResponse` | enum | 6 | unresolved | `com/immediasemi/blink/device/network/command/PollingResponse.java` |
| `SupervisorKommand` | object | 6 | unresolved | `com/immediasemi/blink/device/network/command/SupervisorKommand.java` |
| `SupervisorKommandWithChildren` | object | 1 | unresolved | `com/immediasemi/blink/device/network/command/SupervisorKommandWithChildren.java` |
| `AddCameraBody` | object | 3 | unresolved | `com/immediasemi/blink/device/onboard/camera/AddCameraBody.java` |
| `AddLotusBody` | object | 3 | direct | `com/immediasemi/blink/device/onboard/doorbell/add/AddLotusBody.java` |
| `OnboardingBody` | object | 2 | direct | `com/immediasemi/blink/device/onboard/OnboardingBody.java` |
| `CreateLinkRequest` | object | 7 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/CreateLinkRequest.java` |
| `CreateLinkResponse` | object | 4 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/CreateLinkResponse.java` |
| `DeviceLink` | object | 5 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/DeviceLink.java` |
| `DeviceLinksResponse` | object | 1 | unresolved | `com/immediasemi/blink/device/setting/linkdevice/data/model/DeviceLinksResponse.java` |
| `LinkedDevice` | object | 2 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/LinkedDevice.java` |
| `LinkObject` | object | 2 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/LinkObject.java` |
| `AccessPoint` | object | 7 | unresolved | `com/immediasemi/blink/device/wifi/AccessPoint.java` |
| `AccessPoints` | object | 4 | unresolved | `com/immediasemi/blink/device/wifi/AccessPoints.java` |
| `GetFwVersionResponse` | object | 2 | unresolved | `com/immediasemi/blink/device/wifi/GetFwVersionResponse.java` |
| `AdditionalTrialBody` | object | 1 | unresolved | `com/immediasemi/blink/home/additionaltrial/AdditionalTrialBody.java` |
| `Attributes` | object | 4 | unresolved | `com/immediasemi/blink/models/accessory/chime/Attributes.java` |
| `AttributesType` | enum | 1 | direct | `com/immediasemi/blink/models/accessory/chime/AttributesType.java` |
| `ChimeSignalStrength` | enum | 5 | direct | `com/immediasemi/blink/models/accessory/chime/ChimeSignalStrength.java` |
| `AccessoryConfig` | object | 8 | unresolved | `com/immediasemi/blink/models/AccessoryConfig.java` |
| `AccessPoint` | object | 5 | unresolved | `com/immediasemi/blink/models/AccessPoint.java` |
| `AccessPoints` | object | 3 | unresolved | `com/immediasemi/blink/models/AccessPoints.java` |
| `AddCameraResponseBody` | object | 3 | unresolved | `com/immediasemi/blink/models/AddCameraResponseBody.java` |
| `ANetwork` | object | 1 | unresolved | `com/immediasemi/blink/models/ANetwork.java` |
| `Camera` | object | 46 | unresolved | `com/immediasemi/blink/models/Camera.java` |
| `CameraConfig` | object | 3 | unresolved | `com/immediasemi/blink/models/CameraConfig.java` |
| `CameraConfigInfo` | object | 74 | unresolved | `com/immediasemi/blink/models/CameraConfigInfo.java` |
| `Command` | object | 19 | unresolved | `com/immediasemi/blink/models/Command.java` |
| `CreateProgramBody` | object | 5 | unresolved | `com/immediasemi/blink/models/CreateProgramBody.java` |
| `DeviceStatus` | object | 48 | unresolved | `com/immediasemi/blink/models/DeviceStatus.java` |
| `FloodlightProgramConfig` | object | 2 | unresolved | `com/immediasemi/blink/models/FloodlightProgramConfig.java` |
| `LightAccessoryConfig` | object | 10 | unresolved | `com/immediasemi/blink/models/LightAccessoryConfig.java` |
| `LightStatus` | enum | 1 | unresolved | `com/immediasemi/blink/models/LightStatus.java` |
| `LotusChimeConfig` | object | 7 | unresolved | `com/immediasemi/blink/models/LotusChimeConfig.java` |
| `LotusConfigInfo` | object | 53 | unresolved | `com/immediasemi/blink/models/LotusConfigInfo.java` |
| `Network` | object | 25 | unresolved | `com/immediasemi/blink/models/Network.java` |
| `OwlConfigInfo` | object | 57 | unresolved | `com/immediasemi/blink/models/OwlConfigInfo.java` |
| `PanTiltAccessoryConfig` | object | 1 | direct | `com/immediasemi/blink/models/PanTiltAccessoryConfig.java` |
| `ProgramConfig` | object | 10 | unresolved | `com/immediasemi/blink/models/ProgramConfig.java` |
| `RosieConfig` | object | 5 | unresolved | `com/immediasemi/blink/models/RosieConfig.java` |
| `SignalStrength` | object | 6 | unresolved | `com/immediasemi/blink/models/SignalStrength.java` |
| `SuperiorConfig` | object | 8 | unresolved | `com/immediasemi/blink/models/SuperiorConfig.java` |
| `TestLotusDingConfig` | object | 2 | direct | `com/immediasemi/blink/models/TestLotusDingConfig.java` |
| `UpdateLotusBody` | object | 27 | unresolved | `com/immediasemi/blink/models/UpdateLotusBody.java` |
| `UpdateLotusChimeConfig` | object | 1 | unresolved | `com/immediasemi/blink/models/UpdateLotusChimeConfig.java` |
| `UpdateOwlBody` | object | 31 | unresolved | `com/immediasemi/blink/models/UpdateOwlBody.java` |
| `VideoNetworkConfig` | object | 2 | direct | `com/immediasemi/blink/models/VideoNetworkConfig.java` |
| `VideoNetworks` | object | 3 | unresolved | `com/immediasemi/blink/models/VideoNetworks.java` |
| `VideoNetworksConfig` | object | 2 | unresolved | `com/immediasemi/blink/models/VideoNetworksConfig.java` |
| `AuthenticatorSelection` | object | 4 | direct | `com/immediasemi/blink/passkey/AuthenticatorSelection.java` |
| `ExcludeCredential` | object | 3 | direct | `com/immediasemi/blink/passkey/ExcludeCredential.java` |
| `PubKeyCredParam` | object | 2 | direct | `com/immediasemi/blink/passkey/PubKeyCredParam.java` |
| `PublicKeyCredentialData` | object | 3 | direct | `com/immediasemi/blink/passkey/PublicKeyCredentialData.java` |
| `RegistrationRequest` | object | 2 | direct | `com/immediasemi/blink/passkey/RegistrationRequest.java` |
| `RegistrationResponse` | object | 8 | unresolved | `com/immediasemi/blink/passkey/RegistrationResponse.java` |
| `RelyingParty` | object | 2 | direct | `com/immediasemi/blink/passkey/RelyingParty.java` |
| `VerifyOtpResponse` | object | 1 | direct | `com/immediasemi/blink/passkey/VerifyOtpResponse.java` |
| `VerifyRegistrationRequest` | object | 4 | unresolved | `com/immediasemi/blink/passkey/VerifyRegistrationRequest.java` |
| `WebAuthnUser` | object | 3 | direct | `com/immediasemi/blink/passkey/WebAuthnUser.java` |
| `Program` | object | 8 | unresolved | `com/immediasemi/blink/scheduling/Program.java` |
| `ScheduleAction` | object | 7 | unresolved | `com/immediasemi/blink/scheduling/ScheduleAction.java` |
| `ScheduleEvent` | object | 4 | unresolved | `com/immediasemi/blink/scheduling/ScheduleEvent.java` |
| `UpdateProgramRequest` | object | 6 | unresolved | `com/immediasemi/blink/scheduling/UpdateProgramRequest.java` |
| `AcceptInvitationBody` | object | 1 | unresolved | `com/immediasemi/blink/settings/access/accept/AcceptInvitationBody.java` |
| `CheckAuthorizationResponse` | object | 1 | unresolved | `com/immediasemi/blink/settings/access/accept/CheckAuthorizationResponse.java` |
| `AccessSummary` | object | 5 | unresolved | `com/immediasemi/blink/settings/access/AccessSummary.java` |
| `SendInviteBody` | object | 1 | unresolved | `com/immediasemi/blink/settings/access/SendInviteBody.java` |
| `AlexaLinkingAuthorizePostBody` | object | 5 | unresolved | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingAuthorizePostBody.java` |
| `AlexaLinkingAuthorizeResponse` | object | 1 | unresolved | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingAuthorizeResponse.java` |
| `AlexaLinkingLinkPostBody` | object | 2 | unresolved | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingLinkPostBody.java` |
| `AlexaLinkStatus` | object | 3 | unresolved | `com/immediasemi/blink/settings/account/alexa/AlexaLinkStatus.java` |
| `DataRequests` | object | 4 | unresolved | `com/immediasemi/blink/settings/account/managedata/DataRequests.java` |
| `SubmitDataRequestResponse` | object | 1 | unresolved | `com/immediasemi/blink/settings/account/managedata/SubmitDataRequestResponse.java` |
| `ThirdPartyAuthorization` | object | 5 | unresolved | `com/immediasemi/blink/settings/account/managedata/ThirdPartyAuthorization.java` |
| `ChangeEmailPostBody` | object | 2 | unresolved | `com/immediasemi/blink/settings/email/ChangeEmailPostBody.java` |
| `EnrollmentImageAttributes` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/identities/EnrollmentImageAttributes.java` |
| `EnrollmentImageRef` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/identities/EnrollmentImageRef.java` |
| `EnrollmentImageRelationship` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/identities/EnrollmentImageRelationship.java` |
| `EnrollmentImageResource` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/identities/EnrollmentImageResource.java` |
| `IdentitiesMeta` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesMeta.java` |
| `IdentitiesResponse` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesResponse.java` |
| `IdentityAttributes` | object | 6 | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentityAttributes.java` |
| `IdentityResource` | object | 3 | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentityResource.java` |
| `IdentityResponse` | object | 2 | unresolved | `com/immediasemi/blink/settings/knownfaces/identities/IdentityResponse.java` |
| `MergeIdentitiesMeta` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/identities/MergeIdentitiesMeta.java` |
| `MergeIdentitiesRequest` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/identities/MergeIdentitiesRequest.java` |
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
| `FamiliarFacesUpdate` | object | 1 | unresolved | `com/immediasemi/blink/settings/knownfaces/optin/FamiliarFacesUpdate.java` |
| `RdisDeviceAttributes` | object | 7 | unresolved | `com/immediasemi/blink/settings/knownfaces/optin/RdisDeviceAttributes.java` |
| `RdisDeviceRelationships` | object | 3 | unresolved | `com/immediasemi/blink/settings/knownfaces/optin/RdisDeviceRelationships.java` |
| `RdisDeviceResource` | object | 4 | unresolved | `com/immediasemi/blink/settings/knownfaces/optin/RdisDeviceResource.java` |
| `RdisMeta` | object | 1 | unresolved | `com/immediasemi/blink/settings/knownfaces/optin/RdisMeta.java` |
| `RdisRelationship` | object | 2 | unresolved | `com/immediasemi/blink/settings/knownfaces/optin/RdisRelationship.java` |
| `RdisRelationshipData` | object | 2 | unresolved | `com/immediasemi/blink/settings/knownfaces/optin/RdisRelationshipData.java` |
| `RdisRelationshipLinks` | object | 1 | unresolved | `com/immediasemi/blink/settings/knownfaces/optin/RdisRelationshipLinks.java` |
| `RdisResponse` | object | 3 | unresolved | `com/immediasemi/blink/settings/knownfaces/optin/RdisResponse.java` |
| `UpdateDeviceConfigurationAttributes` | object | 1 | unresolved | `com/immediasemi/blink/settings/knownfaces/optin/UpdateDeviceConfigurationAttributes.java` |
| `UpdateDeviceConfigurationData` | object | 3 | unresolved | `com/immediasemi/blink/settings/knownfaces/optin/UpdateDeviceConfigurationData.java` |
| `UpdateDeviceConfigurationRequest` | object | 1 | unresolved | `com/immediasemi/blink/settings/knownfaces/optin/UpdateDeviceConfigurationRequest.java` |
| `SeaDevice` | object | 10 | unresolved | `com/immediasemi/blink/settings/notifications/sea/SeaDevice.java` |
| `SeaDeviceUpdate` | object | 3 | unresolved | `com/immediasemi/blink/settings/notifications/sea/SeaDeviceUpdate.java` |
| `SingleEventAlertsPostBody` | object | 1 | direct | `com/immediasemi/blink/settings/notifications/sea/SingleEventAlertsPostBody.java` |
| `SingleEventAlertsResponse` | object | 3 | direct | `com/immediasemi/blink/settings/notifications/sea/SingleEventAlertsResponse.java` |
| `SetTivLockResponse` | object | 1 | unresolved | `com/immediasemi/blink/settings/privacy/SetTivLockResponse.java` |
| `TivLockBody` | object | 1 | unresolved | `com/immediasemi/blink/settings/privacy/TivLockBody.java` |
| `TivLockStatus` | object | 2 | unresolved | `com/immediasemi/blink/settings/privacy/TivLockStatus.java` |
| `TivLockStatus` | object | 2 | unresolved | `com/immediasemi/blink/settings/privacy/TivLockStatus.java` |
| `CreateSharedLoginBody` | object | 3 | unresolved | `com/immediasemi/blink/settings/sharedlogin/model/CreateSharedLoginBody.java` |
| `GetSharedLoginResponse` | object | 2 | unresolved | `com/immediasemi/blink/settings/sharedlogin/model/GetSharedLoginResponse.java` |
| `PostSharedLoginClaimResponse` | object | 3 | direct | `com/immediasemi/blink/settings/sharedlogin/model/PostSharedLoginClaimResponse.java` |
| `PostSharedLoginResponse` | object | 2 | unresolved | `com/immediasemi/blink/settings/sharedlogin/model/PostSharedLoginResponse.java` |
| `PostSharedLoginVerifyResponse` | object | 1 | direct | `com/immediasemi/blink/settings/sharedlogin/model/PostSharedLoginVerifyResponse.java` |
| `RevokeSharedLoginBody` | object | 2 | unresolved | `com/immediasemi/blink/settings/sharedlogin/model/RevokeSharedLoginBody.java` |
| `SharedLoginClaimBody` | object | 2 | unresolved | `com/immediasemi/blink/settings/sharedlogin/model/SharedLoginClaimBody.java` |
| `SharedLoginItem` | object | 8 | unresolved | `com/immediasemi/blink/settings/sharedlogin/model/SharedLoginItem.java` |
| `SharedLoginVerifyBody` | object | 1 | direct | `com/immediasemi/blink/settings/sharedlogin/model/SharedLoginVerifyBody.java` |
| `SmartVideoDescriptionsPostBody` | object | 2 | direct | `com/immediasemi/blink/settings/SmartVideoDescriptionsPostBody.java` |
| `SmartVideoDescriptionsResponse` | object | 3 | direct | `com/immediasemi/blink/settings/SmartVideoDescriptionsResponse.java` |
| `SvdDevice` | object | 7 | unresolved | `com/immediasemi/blink/settings/SvdDevice.java` |
| `SvdDeviceUpdate` | object | 3 | unresolved | `com/immediasemi/blink/settings/SvdDeviceUpdate.java` |
| `AppVersionCheckResponse` | object | 4 | unresolved | `com/immediasemi/blink/update/AppVersionCheckResponse.java` |
| `CommandPollingType` | object | 0 | inferred | `com/immediasemi/blink/utils/CommandPollingType.java` |
| `DspSubscriptionResponse` | object | 2 | unresolved | `com/immediasemi/blink/utils/DspSubscriptionResponse.java` |
| `GetFirmwareEndpointResponse` | object | 2 | unresolved | `com/immediasemi/blink/utils/GetFirmwareEndpointResponse.java` |
| `MapLinkBody` | object | 6 | unresolved | `com/immediasemi/blink/utils/MapLinkBody.java` |
| `SubscriptionRequestStatusBody` | object | 2 | unresolved | `com/immediasemi/blink/utils/SubscriptionRequestStatusBody.java` |
| `SubscriptionRequestStatusResponse` | object | 3 | unresolved | `com/immediasemi/blink/utils/SubscriptionRequestStatusResponse.java` |
| `Accessory` | object | 11 | unresolved | `com/immediasemi/blink/utils/sync/Accessory.java` |
| `BatteryExtensionPackAccessoryApi` | object | 4 | unresolved | `com/immediasemi/blink/utils/sync/BatteryExtensionPackAccessoryApi.java` |
| `CameraSignals` | object | 2 | direct | `com/immediasemi/blink/utils/sync/CameraSignals.java` |
| `CamerasV3` | object | 27 | unresolved | `com/immediasemi/blink/utils/sync/CamerasV3.java` |
| `DeviceLimits` | object | 6 | unresolved | `com/immediasemi/blink/utils/sync/DeviceLimits.java` |
| `DoorbellsV3` | object | 28 | unresolved | `com/immediasemi/blink/utils/sync/DoorbellsV3.java` |
| `HomeScreen` | object | 16 | unresolved | `com/immediasemi/blink/utils/sync/HomeScreen.java` |
| `HomescreenAccount` | object | 4 | unresolved | `com/immediasemi/blink/utils/sync/HomescreenAccount.java` |
| `LightAccessory` | object | 3 | direct | `com/immediasemi/blink/utils/sync/LightAccessory.java` |
| `LocationHomescreen` | object | 1 | direct | `com/immediasemi/blink/utils/sync/LocationHomescreen.java` |
| `NetworksV3` | object | 9 | unresolved | `com/immediasemi/blink/utils/sync/NetworksV3.java` |
| `OwlsV3` | object | 27 | unresolved | `com/immediasemi/blink/utils/sync/OwlsV3.java` |
| `PanTiltAccessory` | object | 1 | direct | `com/immediasemi/blink/utils/sync/PanTiltAccessory.java` |
| `RingDevice` | object | 7 | unresolved | `com/immediasemi/blink/utils/sync/RingDevice.java` |
| `RingDeviceHealth` | object | 1 | unresolved | `com/immediasemi/blink/utils/sync/RingDeviceHealth.java` |
| `SyncModulesV3` | object | 17 | unresolved | `com/immediasemi/blink/utils/sync/SyncModulesV3.java` |
| `VideoStats` | object | 3 | unresolved | `com/immediasemi/blink/utils/sync/VideoStats.java` |
| `VerifyLinkAccountBody` | object | 1 | unresolved | `com/immediasemi/blink/utils/VerifyLinkAccountBody.java` |
| `BatchDonationRequest` | object | 4 | unresolved | `com/immediasemi/blink/video/clip/donation/api/BatchDonationRequest.java` |
| `BatchDonationResponse` | object | 2 | unresolved | `com/immediasemi/blink/video/clip/donation/api/BatchDonationResponse.java` |
| `DonationClipRequest` | object | 4 | unresolved | `com/immediasemi/blink/video/clip/donation/api/DonationClipRequest.java` |
| `DonationTranscoding` | object | 5 | unresolved | `com/immediasemi/blink/video/clip/donation/api/DonationTranscoding.java` |
| `UnprocessedDonationEvent` | object | 5 | unresolved | `com/immediasemi/blink/video/clip/donation/api/UnprocessedDonationEvent.java` |
| `AiVideoDescription` | object | 2 | direct | `com/immediasemi/blink/video/clip/media/AiVideoDescription.java` |
| `BackendMedia` | object | 26 | unresolved | `com/immediasemi/blink/video/clip/media/BackendMedia.java` |
| `FavoriteEventIdsBody` | object | 1 | direct | `com/immediasemi/blink/video/clip/media/FavoriteEventIdsBody.java` |
| `MediaPostBody` | object | 7 | unresolved | `com/immediasemi/blink/video/clip/media/MediaPostBody.java` |
| `MediaProfile` | object | 4 | unresolved | `com/immediasemi/blink/video/clip/media/MediaProfile.java` |
| `MediaResponse` | object | 5 | unresolved | `com/immediasemi/blink/video/clip/media/MediaResponse.java` |
| `MediaSettingsPatch` | object | 1 | direct | `com/immediasemi/blink/video/clip/media/MediaSettingsPatch.java` |
| `MediaSettingsResponse` | object | 3 | unresolved | `com/immediasemi/blink/video/clip/media/MediaSettingsResponse.java` |
| `UnusualActivity` | object | 2 | unresolved | `com/immediasemi/blink/video/clip/media/UnusualActivity.java` |
| `UnwatchedMediaResponse` | object | 1 | unresolved | `com/immediasemi/blink/video/clip/media/UnwatchedMediaResponse.java` |
| `SummarizeClipsRequest` | object | 1 | direct | `com/immediasemi/blink/video/clip/moment/SummarizeClipsRequest.java` |
| `SummarizeClipsResponse` | object | 1 | direct | `com/immediasemi/blink/video/clip/moment/SummarizeClipsResponse.java` |
| `ApiAccessPoint` | object | 5 | unresolved | `com/ring/blueprints/setup/core/data/ApiAccessPoint.java` |
| `ApiAccessPoints` | object | 1 | unresolved | `com/ring/blueprints/setup/core/data/ApiAccessPoints.java` |
| `ApiNetwork` | object | 43 | unresolved | `com/ring/blueprints/setup/core/data/ApiNetwork.java` |
| `ApiFactoryDeviceProfile` | object | 7 | unresolved | `com/ring/blueprints/setup/core/data/backend/ApiFactoryDeviceProfile.java` |
| `ApiSetup` | object | 6 | unresolved | `com/ring/blueprints/setup/core/data/backend/ApiSetup.java` |
| `ApiSetupStatus` | object | 12 | unresolved | `com/ring/blueprints/setup/core/data/backend/ApiSetupStatus.java` |
| `CompleteSetupBody` | object | 5 | unresolved | `com/ring/blueprints/setup/core/data/backend/CompleteSetupBody.java` |
| `DeviceLocale` | object | 1 | unresolved | `com/ring/blueprints/setup/core/data/DeviceLocale.java` |
| `DeviceFirmwareResponse` | object | 4 | unresolved | `com/ring/blueprints/setup/core/data/entity/DeviceFirmwareResponse.java` |
| `BlueprintContext` | object | 2 | direct | `com/ring/reapp/blueprint/model/BlueprintContext.java` |
| `BlueprintResponse` | object | 2 | unresolved | `com/ring/reapp/blueprint/model/BlueprintResponse.java` |
| `Action` | object | 19 | unresolved | `com/ring/reapp/models/Action.java` |
| `AdvancedNetworkOptionsScreen` | object | 9 | direct | `com/ring/reapp/models/AdvancedNetworkOptionsScreen.java` |
| `AttributedString` | object | 2 | direct | `com/ring/reapp/models/AttributedString.java` |
| `AutoProvisioningLocalisedResources` | object | 3 | direct | `com/ring/reapp/models/AutoProvisioningLocalisedResources.java` |
| `AutoSetupProvisioning` | object | 2 | direct | `com/ring/reapp/models/AutoSetupProvisioning.java` |
| `Badge` | object | 5 | unresolved | `com/ring/reapp/models/Badge.java` |
| `BadgeStyle` | enum | 1 | unresolved | `com/ring/reapp/models/BadgeStyle.java` |
| `BannerImageConfig` | object | 3 | direct | `com/ring/reapp/models/BannerImageConfig.java` |
| `BLEConnectionFailedScreen` | object | 5 | direct | `com/ring/reapp/models/BLEConnectionFailedScreen.java` |
| `BLEConnectionLostScreen` | object | 4 | direct | `com/ring/reapp/models/BLEConnectionLostScreen.java` |
| `BLEConnectionScreen` | object | 3 | direct | `com/ring/reapp/models/BLEConnectionScreen.java` |
| `BLEFetchWifiNetworksScreen` | object | 3 | direct | `com/ring/reapp/models/BLEFetchWifiNetworksScreen.java` |
| `BLENonOwnerScreen` | object | 4 | unresolved | `com/ring/reapp/models/BLENonOwnerScreen.java` |
| `BLESetupCompletingScreen` | object | 3 | direct | `com/ring/reapp/models/BLESetupCompletingScreen.java` |
| `BLESetupEnterWifiPasswordScreen` | object | 6 | direct | `com/ring/reapp/models/BLESetupEnterWifiPasswordScreen.java` |
| `BLESetupGenericErrorScreen` | object | 4 | direct | `com/ring/reapp/models/BLESetupGenericErrorScreen.java` |
| `BLESetupModeCheckForSetupModeScreen` | object | 5 | direct | `com/ring/reapp/models/BLESetupModeCheckForSetupModeScreen.java` |
| `BLESetupModeEducationScreen` | object | 5 | direct | `com/ring/reapp/models/BLESetupModeEducationScreen.java` |
| `BLESetupModeEnterSetupModeScreen` | object | 6 | direct | `com/ring/reapp/models/BLESetupModeEnterSetupModeScreen.java` |
| `BLESetupModeInfoScreen` | object | 5 | direct | `com/ring/reapp/models/BLESetupModeInfoScreen.java` |
| `BLESetupModeInstructions` | object | 6 | direct | `com/ring/reapp/models/BLESetupModeInstructions.java` |
| `BLESetupModeProgressScreen` | object | 3 | direct | `com/ring/reapp/models/BLESetupModeProgressScreen.java` |
| `BLESetupModeWaitForSetupModeScreen` | object | 6 | direct | `com/ring/reapp/models/BLESetupModeWaitForSetupModeScreen.java` |
| `BLESetupProvisioning` | object | 3 | direct | `com/ring/reapp/models/BLESetupProvisioning.java` |
| `BLESetupWeakSignalScreen` | object | 6 | unresolved | `com/ring/reapp/models/BLESetupWeakSignalScreen.java` |
| `BLESetupWifiSelectionListScreen` | object | 10 | direct | `com/ring/reapp/models/BLESetupWifiSelectionListScreen.java` |
| `BLESetupWrongWifiPasswordScreen` | object | 5 | direct | `com/ring/reapp/models/BLESetupWrongWifiPasswordScreen.java` |
| `ButterBarAction` | object | 3 | direct | `com/ring/reapp/models/ButterBarAction.java` |
| `ButterBarButtonSize` | enum | 1 | unresolved | `com/ring/reapp/models/ButterBarButtonSize.java` |
| `ButterBarTemplate` | object | 5 | unresolved | `com/ring/reapp/models/ButterBarTemplate.java` |
| `ButtonModuleModel` | object | 3 | unresolved | `com/ring/reapp/models/ButtonModuleModel.java` |
| `CalloutCard` | object | 6 | unresolved | `com/ring/reapp/models/CalloutCard.java` |
| `CancelDialogResources` | object | 5 | unresolved | `com/ring/reapp/models/CancelDialogResources.java` |
| `CantFindNetworkButterbar` | object | 3 | unresolved | `com/ring/reapp/models/CantFindNetworkButterbar.java` |
| `CellCheckableConfig` | object | 2 | unresolved | `com/ring/reapp/models/CellCheckableConfig.java` |
| `CellIcon` | object | 2 | unresolved | `com/ring/reapp/models/CellIcon.java` |
| `CellInfoButton` | object | 2 | unresolved | `com/ring/reapp/models/CellInfoButton.java` |
| `CellList` | object | 2 | unresolved | `com/ring/reapp/models/CellList.java` |
| `ChangeWifiIdentification` | object | 4 | unresolved | `com/ring/reapp/models/ChangeWifiIdentification.java` |
| `ChangeWifiIdentificationWithPin` | object | 4 | unresolved | `com/ring/reapp/models/ChangeWifiIdentificationWithPin.java` |
| `CheckableIcon` | object | 2 | unresolved | `com/ring/reapp/models/CheckableIcon.java` |
| `CheckableStyle` | enum | 1 | unresolved | `com/ring/reapp/models/CheckableStyle.java` |
| `CloseAction` | object | 1 | direct | `com/ring/reapp/models/CloseAction.java` |
| `CodeKeyboardType` | enum | 1 | unresolved | `com/ring/reapp/models/CodeKeyboardType.java` |
| `CodeTextEntryConfig` | object | 9 | direct | `com/ring/reapp/models/CodeTextEntryConfig.java` |
| `CodeTextEntryTemplate` | object | 5 | direct | `com/ring/reapp/models/CodeTextEntryTemplate.java` |
| `ColorToken` | enum | 1 | unresolved | `com/ring/reapp/models/ColorToken.java` |
| `ConfirmationButtonModule` | object | 5 | unresolved | `com/ring/reapp/models/ConfirmationButtonModule.java` |
| `ConnectionRestorationManualScreen` | object | 5 | direct | `com/ring/reapp/models/ConnectionRestorationManualScreen.java` |
| `ConnectionRestorationOfflineAlert` | object | 4 | direct | `com/ring/reapp/models/ConnectionRestorationOfflineAlert.java` |
| `ConnectionType` | enum | 1 | unresolved | `com/ring/reapp/models/ConnectionType.java` |
| `ContentMode` | enum | 1 | unresolved | `com/ring/reapp/models/ContentMode.java` |
| `CustomCheckIcon` | object | 2 | direct | `com/ring/reapp/models/CustomCheckIcon.java` |
| `DescriptionArea` | object | 6 | unresolved | `com/ring/reapp/models/DescriptionArea.java` |
| `DescriptionAreaActionButton` | object | 4 | unresolved | `com/ring/reapp/models/DescriptionAreaActionButton.java` |
| `DescriptionAreaMainIcon` | object | 2 | direct | `com/ring/reapp/models/DescriptionAreaMainIcon.java` |
| `DescriptionAreaMainIconSize` | enum | 1 | unresolved | `com/ring/reapp/models/DescriptionAreaMainIconSize.java` |
| `DescriptionAreaTemplate` | object | 8 | direct | `com/ring/reapp/models/DescriptionAreaTemplate.java` |
| `DeviceIdentification` | object | 4 | unresolved | `com/ring/reapp/models/DeviceIdentification.java` |
| `DeviceProvisioningLocalisedResources` | object | 29 | unresolved | `com/ring/reapp/models/DeviceProvisioningLocalisedResources.java` |
| `DialogTemplate` | object | 6 | unresolved | `com/ring/reapp/models/DialogTemplate.java` |
| `EnterPinCodeScreen` | object | 8 | unresolved | `com/ring/reapp/models/EnterPinCodeScreen.java` |
| `EventPropertyValue` | object | 4 | unresolved | `com/ring/reapp/models/EventPropertyValue.java` |
| `EventTrackingAction` | object | 8 | direct | `com/ring/reapp/models/EventTrackingAction.java` |
| `FindMyCodeScreen` | object | 6 | direct | `com/ring/reapp/models/FindMyCodeScreen.java` |
| `FontIcon` | object | 2 | direct | `com/ring/reapp/models/FontIcon.java` |
| `HiddenNetworkEntryScreen` | object | 15 | direct | `com/ring/reapp/models/HiddenNetworkEntryScreen.java` |
| `HttpMethod` | enum | 1 | unresolved | `com/ring/reapp/models/HttpMethod.java` |
| `HttpRequestAction` | object | 5 | direct | `com/ring/reapp/models/HttpRequestAction.java` |
| `HttpRequestUpdateAction` | object | 2 | direct | `com/ring/reapp/models/HttpRequestUpdateAction.java` |
| `Icon` | object | 3 | unresolved | `com/ring/reapp/models/Icon.java` |
| `IconBackground` | object | 2 | unresolved | `com/ring/reapp/models/IconBackground.java` |
| `IconGlyph` | enum | 1 | unresolved | `com/ring/reapp/models/IconGlyph.java` |
| `IconShape` | enum | 1 | unresolved | `com/ring/reapp/models/IconShape.java` |
| `IconSource` | object | 2 | unresolved | `com/ring/reapp/models/IconSource.java` |
| `IconValueCell` | object | 13 | unresolved | `com/ring/reapp/models/IconValueCell.java` |
| `IconValueCellMainIcon` | object | 2 | direct | `com/ring/reapp/models/IconValueCellMainIcon.java` |
| `IconValueCellMainIconSize` | enum | 1 | unresolved | `com/ring/reapp/models/IconValueCellMainIconSize.java` |
| `ImageActionCell` | object | 8 | unresolved | `com/ring/reapp/models/ImageActionCell.java` |
| `ImageCard` | object | 13 | unresolved | `com/ring/reapp/models/ImageCard.java` |
| `ImageCellConfig` | object | 2 | direct | `com/ring/reapp/models/ImageCellConfig.java` |
| `ImageContentMode` | enum | 1 | unresolved | `com/ring/reapp/models/ImageContentMode.java` |
| `ImageIconCell` | object | 12 | unresolved | `com/ring/reapp/models/ImageIconCell.java` |
| `ImageIconCellMainIconSize` | enum | 1 | unresolved | `com/ring/reapp/models/ImageIconCellMainIconSize.java` |
| `ImageUrl` | object | 2 | direct | `com/ring/reapp/models/ImageUrl.java` |
| `ListSection` | object | 3 | direct | `com/ring/reapp/models/ListSection.java` |
| `LoopedVideoModel` | object | 5 | direct | `com/ring/reapp/models/LoopedVideoModel.java` |
| `MagicConnectionScreen` | object | 7 | direct | `com/ring/reapp/models/MagicConnectionScreen.java` |
| `MainButton` | object | 5 | direct | `com/ring/reapp/models/MainButton.java` |
| `MainButtonStyle` | enum | 1 | unresolved | `com/ring/reapp/models/MainButtonStyle.java` |
| `ManualConnectionScreen` | object | 4 | direct | `com/ring/reapp/models/ManualConnectionScreen.java` |
| `MediaContent` | object | 3 | unresolved | `com/ring/reapp/models/MediaContent.java` |
| `NavBar` | object | 4 | unresolved | `com/ring/reapp/models/NavBar.java` |
| `NavigateScreenJsonAction` | object | 3 | unresolved | `com/ring/reapp/models/NavigateScreenJsonAction.java` |
| `NavigateUrlAction` | object | 3 | unresolved | `com/ring/reapp/models/NavigateUrlAction.java` |
| `PatternValidationRule` | object | 2 | direct | `com/ring/reapp/models/PatternValidationRule.java` |
| `PermissionsCheckLocalisedResources` | object | 9 | direct | `com/ring/reapp/models/PermissionsCheckLocalisedResources.java` |
| `PinCodeIdentification` | object | 1 | direct | `com/ring/reapp/models/PinCodeIdentification.java` |
| `Platform` | enum | 1 | unresolved | `com/ring/reapp/models/Platform.java` |
| `PopAction` | object | 2 | unresolved | `com/ring/reapp/models/PopAction.java` |
| `PopToScreenIdAction` | object | 2 | direct | `com/ring/reapp/models/PopToScreenIdAction.java` |
| `PostSetupAction` | object | 6 | unresolved | `com/ring/reapp/models/PostSetupAction.java` |
| `PostSetupAlexaSkillAction` | object | 3 | unresolved | `com/ring/reapp/models/PostSetupAlexaSkillAction.java` |
| `PostSetupChimeConnectionAction` | object | 3 | unresolved | `com/ring/reapp/models/PostSetupChimeConnectionAction.java` |
| `PostSetupMotionFlowType` | enum | 1 | unresolved | `com/ring/reapp/models/PostSetupMotionFlowType.java` |
| `PostSetupMotionSettingsAction` | object | 4 | unresolved | `com/ring/reapp/models/PostSetupMotionSettingsAction.java` |
| `PostSetupPrivacyFeaturesAction` | object | 3 | unresolved | `com/ring/reapp/models/PostSetupPrivacyFeaturesAction.java` |
| `PostSetupRingAIFeaturesAction` | object | 4 | unresolved | `com/ring/reapp/models/PostSetupRingAIFeaturesAction.java` |
| `PostSetupSearchPartyAction` | object | 3 | unresolved | `com/ring/reapp/models/PostSetupSearchPartyAction.java` |
| `PromoCardModel` | object | 5 | unresolved | `com/ring/reapp/models/PromoCardModel.java` |
| `QRCodeIdentification` | object | 2 | direct | `com/ring/reapp/models/QRCodeIdentification.java` |
| `RebootRequiredScreen` | object | 6 | unresolved | `com/ring/reapp/models/RebootRequiredScreen.java` |
| `RegionProvisioning` | object | 3 | direct | `com/ring/reapp/models/RegionProvisioning.java` |
| `RequiredValidationRule` | object | 1 | direct | `com/ring/reapp/models/RequiredValidationRule.java` |
| `RichErrorButtonModel` | object | 3 | direct | `com/ring/reapp/models/RichErrorButtonModel.java` |
| `RichErrorCodeModel` | object | 2 | unresolved | `com/ring/reapp/models/RichErrorCodeModel.java` |
| `RichErrorDeviceItemModel` | object | 4 | unresolved | `com/ring/reapp/models/RichErrorDeviceItemModel.java` |
| `RichErrorDeviceListModel` | object | 2 | unresolved | `com/ring/reapp/models/RichErrorDeviceListModel.java` |
| `RichErrorTemplate` | object | 15 | direct | `com/ring/reapp/models/RichErrorTemplate.java` |
| `RichErrorTryItemModel` | object | 6 | unresolved | `com/ring/reapp/models/RichErrorTryItemModel.java` |
| `RichErrorTryListModel` | object | 3 | unresolved | `com/ring/reapp/models/RichErrorTryListModel.java` |
| `RightImageFlatCell` | object | 8 | unresolved | `com/ring/reapp/models/RightImageFlatCell.java` |
| `SafeCellComponent` | object | 5 | unresolved | `com/ring/reapp/models/SafeCellComponent.java` |
| `SafeComponent` | object | 19 | unresolved | `com/ring/reapp/models/SafeComponent.java` |
| `SafeString` | object | 2 | unresolved | `com/ring/reapp/models/SafeString.java` |
| `Screen` | object | 8 | unresolved | `com/ring/reapp/models/Screen.java` |
| `ScreenAnalyticsContext` | object | 2 | direct | `com/ring/reapp/models/ScreenAnalyticsContext.java` |
| `ScreenContext` | object | 1 | direct | `com/ring/reapp/models/ScreenContext.java` |
| `ScreenNavigationType` | enum | 1 | unresolved | `com/ring/reapp/models/ScreenNavigationType.java` |
| `SectionedList` | object | 2 | direct | `com/ring/reapp/models/SectionedList.java` |
| `SectionHeader` | object | 3 | unresolved | `com/ring/reapp/models/SectionHeader.java` |
| `SetScreenJsonAction` | object | 1 | unresolved | `com/ring/reapp/models/SetScreenJsonAction.java` |
| `SetupCreateLocationAction` | object | 4 | unresolved | `com/ring/reapp/models/SetupCreateLocationAction.java` |
| `SetupDeviceProvisioningAction` | object | 24 | unresolved | `com/ring/reapp/models/SetupDeviceProvisioningAction.java` |
| `SetupDeviceQRCodeScanAction` | object | 2 | direct | `com/ring/reapp/models/SetupDeviceQRCodeScanAction.java` |
| `SetupDeviceType` | enum | 1 | unresolved | `com/ring/reapp/models/SetupDeviceType.java` |
| `SetupFlowCancelledAction` | object | 1 | direct | `com/ring/reapp/models/SetupFlowCancelledAction.java` |
| `SetupFlowFallbackAction` | object | 1 | direct | `com/ring/reapp/models/SetupFlowFallbackAction.java` |
| `SetupFlowStartPostSetupAction` | object | 1 | unresolved | `com/ring/reapp/models/SetupFlowStartPostSetupAction.java` |
| `SetupPropertyKey` | enum | 1 | unresolved | `com/ring/reapp/models/SetupPropertyKey.java` |
| `ShowButterBarAction` | object | 1 | direct | `com/ring/reapp/models/ShowButterBarAction.java` |
| `ShowDeviceOTAUpdateAction` | object | 4 | unresolved | `com/ring/reapp/models/ShowDeviceOTAUpdateAction.java` |
| `ShowDialogAction` | object | 2 | unresolved | `com/ring/reapp/models/ShowDialogAction.java` |
| `SimpleCheckableIcon` | object | 1 | direct | `com/ring/reapp/models/SimpleCheckableIcon.java` |
| `SoftAPSetupProvisioning` | object | 4 | direct | `com/ring/reapp/models/SoftAPSetupProvisioning.java` |
| `SpinnerIcon` | object | 1 | direct | `com/ring/reapp/models/SpinnerIcon.java` |
| `StickyButtonModule` | object | 5 | direct | `com/ring/reapp/models/StickyButtonModule.java` |
| `StrikethroughStyle` | enum | 1 | unresolved | `com/ring/reapp/models/StrikethroughStyle.java` |
| `StyledIcon` | object | 5 | unresolved | `com/ring/reapp/models/StyledIcon.java` |
| `TextAttribute` | object | 7 | unresolved | `com/ring/reapp/models/TextAttribute.java` |
| `TextButton` | object | 4 | direct | `com/ring/reapp/models/TextButton.java` |
| `TextInputModel` | object | 10 | unresolved | `com/ring/reapp/models/TextInputModel.java` |
| `TextInputTemplate` | object | 7 | direct | `com/ring/reapp/models/TextInputTemplate.java` |
| `TextInputType` | enum | 1 | unresolved | `com/ring/reapp/models/TextInputType.java` |
| `TextInputValidationRule` | object | 2 | unresolved | `com/ring/reapp/models/TextInputValidationRule.java` |
| `TextRange` | object | 2 | unresolved | `com/ring/reapp/models/TextRange.java` |
| `ThumbnailVideoModel` | object | 7 | direct | `com/ring/reapp/models/ThumbnailVideoModel.java` |
| `ToggleRoundButton` | object | 6 | unresolved | `com/ring/reapp/models/ToggleRoundButton.java` |
| `ToggleRoundButtonStyle` | enum | 1 | unresolved | `com/ring/reapp/models/ToggleRoundButtonStyle.java` |
| `ToolbarItem` | object | 5 | direct | `com/ring/reapp/models/ToolbarItem.java` |
| `TutorialImage` | object | 5 | unresolved | `com/ring/reapp/models/TutorialImage.java` |
| `TutorialProgressModel` | object | 5 | direct | `com/ring/reapp/models/TutorialProgressModel.java` |
| `TutorialTemplate` | object | 11 | unresolved | `com/ring/reapp/models/TutorialTemplate.java` |
| `TypographyToken` | enum | 1 | unresolved | `com/ring/reapp/models/TypographyToken.java` |
| `UnderlineStyle` | enum | 1 | unresolved | `com/ring/reapp/models/UnderlineStyle.java` |
| `VerticalButtonModule` | object | 5 | direct | `com/ring/reapp/models/VerticalButtonModule.java` |
| `VPNDisableScreen` | object | 5 | unresolved | `com/ring/reapp/models/VPNDisableScreen.java` |
| `WepSecurityWarningScreen` | object | 7 | unresolved | `com/ring/reapp/models/WepSecurityWarningScreen.java` |
| `WifiUnableToConnectScreen` | object | 5 | direct | `com/ring/reapp/models/WifiUnableToConnectScreen.java` |
| `WrongPinErrorScreen` | object | 3 | unresolved | `com/ring/reapp/models/WrongPinErrorScreen.java` |
| `DetectionType` | enum | 1 | unresolved | `com/ringapp/library/video/event/model/DetectionType.java` |
| `Identity` | object | 4 | unresolved | `com/ringapp/library/video/event/model/Identity.java` |
| `ProfileResolutionStatus` | enum | 4 | direct | `com/ringapp/library/video/event/model/ProfileResolutionStatus.java` |
| `BlinkMetadata` | object | 2 | unresolved | `com/ringapp/orchestratorapi/data/BlinkMetadata.java` |
| `DeleteMultipleEventsRequest` | object | 1 | unresolved | `com/ringapp/orchestratorapi/data/DeleteMultipleEventsRequest.java` |
| `EventRequest` | object | 2 | unresolved | `com/ringapp/orchestratorapi/data/EventRequest.java` |
| `LensFootageMetadataResponse` | object | 1 | unresolved | `com/ringapp/orchestratorapi/data/LensFootageMetadataResponse.java` |
| `LensFootageResponse` | object | 5 | unresolved | `com/ringapp/orchestratorapi/data/LensFootageResponse.java` |
| `Orchestrator24x7ItemResponse` | object | 0 | inferred | `com/ringapp/orchestratorapi/data/Orchestrator24x7ItemResponse.java` |
| `Orchestrator24x7TimelineResponse` | object | 3 | unresolved | `com/ringapp/orchestratorapi/data/Orchestrator24x7TimelineResponse.java` |
| `Orchestrator24x7TimeSlotResponse` | object | 4 | unresolved | `com/ringapp/orchestratorapi/data/Orchestrator24x7TimeSlotResponse.java` |
| `OrchestratorBatchRequestBody` | object | 1 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorBatchRequestBody.java` |
| `OrchestratorCloudMediaMetadataResponse` | object | 10 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorCloudMediaMetadataResponse.java` |
| `OrchestratorCloudMediaResponse` | object | 10 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorCloudMediaResponse.java` |
| `OrchestratorCloudMediaVisualizationResponse` | object | 2 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorCloudMediaVisualizationResponse.java` |
| `OrchestratorCvResponse` | object | 10 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorCvResponse.java` |
| `OrchestratorDetectionDetail` | object | 3 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorDetectionDetail.java` |
| `OrchestratorDeviceResponse` | object | 3 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorDeviceResponse.java` |
| `OrchestratorEventAnomalyResponse` | object | 2 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorEventAnomalyResponse.java` |
| `OrchestratorEventResponse` | object | 26 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorEventResponse.java` |
| `OrchestratorEventSimilarityResponse` | object | 1 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorEventSimilarityResponse.java` |
| `OrchestratorExtendedSearchRequestBody` | object | 5 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorExtendedSearchRequestBody.java` |
| `OrchestratorFeedElementResponse` | object | 2 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorFeedElementResponse.java` |
| `OrchestratorFeedResponse` | object | 5 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorFeedResponse.java` |
| `OrchestratorFootageMetadataResponse` | object | 1 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorFootageMetadataResponse.java` |
| `OrchestratorFootageResponse` | object | 10 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorFootageResponse.java` |
| `OrchestratorGroupResponse` | object | 6 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorGroupResponse.java` |
| `OrchestratorItemsResponse` | object | 3 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorItemsResponse.java` |
| `OrchestratorLocalMediaMetadataResponse` | object | 6 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorLocalMediaMetadataResponse.java` |
| `OrchestratorLocalMediaResponse` | object | 12 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorLocalMediaResponse.java` |
| `OrchestratorLocalMediaVisualizationResponse` | object | 2 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorLocalMediaVisualizationResponse.java` |
| `OrchestratorMapVisualizationResponse` | object | 8 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorMapVisualizationResponse.java` |
| `OrchestratorMediaTrack` | object | 3 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorMediaTrack.java` |
| `OrchestratorPotentialGapResponse` | object | 4 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorPotentialGapResponse.java` |
| `OrchestratorPropertiesResponse` | object | 5 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorPropertiesResponse.java` |
| `OrchestratorRadarVisualizationResponse` | object | 3 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorRadarVisualizationResponse.java` |
| `OrchestratorSearchMetadataResponse` | object | 3 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorSearchMetadataResponse.java` |
| `OrchestratorSupplementalDataResponse` | object | 1 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorSupplementalDataResponse.java` |
| `OrchestratorThirdPartyPartner` | object | 1 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorThirdPartyPartner.java` |
| `OrchestratorTimelineResponse` | object | 4 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorTimelineResponse.java` |
| `OrchestratorVisualizationsResponse` | object | 5 | unresolved | `com/ringapp/orchestratorapi/data/OrchestratorVisualizationsResponse.java` |
| `ProcessingInfo` | object | 2 | unresolved | `com/ringapp/orchestratorapi/data/ProcessingInfo.java` |
| `QueryCategory` | enum | 4 | direct | `com/ringapp/orchestratorapi/data/QueryCategory.java` |
| `SearchQuery` | object | 2 | unresolved | `com/ringapp/orchestratorapi/data/SearchQuery.java` |
| `UnwatchedCountResponse` | object | 1 | unresolved | `com/ringapp/orchestratorapi/data/UnwatchedCountResponse.java` |
| `WatchEventsRequest` | object | 1 | unresolved | `com/ringapp/orchestratorapi/data/WatchEventsRequest.java` |
| `FeedElementType` | enum | 2 | direct | `com/ringapp/playback/historyevent/FeedElementType.java` |
| `JsonElement` | object | 0 | inferred | `kotlinx/serialization/json/JsonElement.java` |
| `JsonElement` | object | 0 | inferred | `kotlinx/serialization/json/JsonElement.java` |
| `JsonObject` | object | 1 | unresolved | `kotlinx/serialization/json/JsonObject.java` |
| `BufferedSource` | object | 0 | inferred | `okio/BufferedSource.java` |
| `BufferedSource` | object | 0 | inferred | `okio/BufferedSource.java` |
| `ResponseBody@snake_case` | object | 0 | unresolved | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java` |
| `ResponseBody@unresolved` | object | 0 | unresolved | `com/immediasemi/blink/api/retrofit/SyncModuleService.java` |
| `Unit@camelCase` | object | 0 | unresolved | `com/immediasemi/blink/passkey/PasskeyRegistrationApi.java` |
| `Unit@snake_case` | object | 0 | unresolved | `com/immediasemi/blink/account/password/PasswordResetApi.java` |
| `Unit@unresolved` | object | 0 | unresolved | `com/immediasemi/blink/api/retrofit/SyncModuleService.java` |

Removed endpoint model references resolve against `baseline.models` (557 retained baseline models), not the current schema index. Serialization policies and unresolved field metadata remain explicit in JSON.

## Command, polling, retry, and error semantics

- Command-producing endpoints are identified by response model and feature, but server status codes not declared in the APK remain unknown.
- Static polling/retry semantics are retained as service-level evidence; they must not be treated as proof of current server timing.
- No new 59.2 Retrofit declaration establishes a general HTTP 409 serialization or retry contract.

## Dynamic transports

- RDIS/DUOS, event-stream, WebSocket, RTSP, and local-device indicators are indexed under `protocolIndicators`.
- The declaration catalog separates known service families, but it does not claim complete call-site, signaling, retry, device-family, or runtime-host reconstruction.
- Consult each endpoint recovery state and its unresolved record before treating transport attribution as established.

## 57.1 → 59.2 change report

- Added: 23
- Changed: 272
- Unchanged: 48
- Removed: 4

### Added

- `POST 2fa/v1/webauthn/registration` (authentication)
- `POST 2fa/v1/webauthn/registration/verify` (authentication)
- `GET device_info/v4/devices` (device-orchestration)
- `GET device_info/v4/devices/{deviceId}` (device-orchestration)
- `POST device_info/v4/devices/operations` (device-orchestration)
- `PUT duos/v1/devices/{deviceId}/update` (device-orchestration)
- `PUT duos/v1/devices/{deviceId}/update` (device-orchestration)
- `POST oauth/v2/verify_otp` (oauth)
- `GET @Url` (rest)
- `GET device_info/v4/devices/{deviceId}/configurations` (rest)
- `PATCH devices/{deviceId}` (rest)
- `PATCH devices/v1/devices/{deviceId}` (rest)
- `POST evm/v2/events` (rest)
- `POST evm/v2/events/watch` (rest)
- `GET evm/v2/history/unwatched/count` (rest)
- `POST setups` (rest)
- `GET setups/{setupId}` (rest)
- `POST setups/{setupId}/complete` (rest)
- `PUT share_service/v3/batch_shares` (rest)
- `GET sos/v1/factory_profile` (rest)
- `DELETE v1/history/events/associations/{profile_id}` (rest)
- `POST v4/accounts/{injected_account_id}/media/favorite` (shared-rest)
- `POST v4/accounts/{injected_account_id}/media/unfavorite` (shared-rest)

### Changed

- `PUT duos/v1/devices/{deviceId}/update` (device-orchestration)
- `PUT duos/v1/devices/update` (device-orchestration)
- `GET v1/devices` (device-orchestration)
- `PATCH v1/devices/{id}/configurations` (device-orchestration)
- `POST 1.0.0/batch/client.device/{appSubGroup}` (event-stream)
- `POST 1.0.0/event/client.device/{appSubGroup}` (event-stream)
- `GET api/logs` (local-device)
- `POST api/set/app_fw_update` (local-device)
- `POST api/set/key` (local-device)
- `POST api/set/ssid` (local-device)
- `GET api/ssids` (local-device)
- `GET api/version` (local-device)
- `POST oauth/token` (oauth)
- `POST oauth/token` (oauth)
- `GET apphelp.immedia-semi.com/link-manifest.json` (public-rest)
- `POST v3/users/validate_email` (public-rest)
- `POST v3/users/validate_password` (public-rest)
- `POST v4/users/password_change` (public-rest)
- `POST v4/users/password_change/pin/generate` (public-rest)
- `POST v4/users/password_change/pin/verify` (public-rest)
- `POST v7/users/register` (public-rest)
- `GET @Url` (rest)
- `GET @Url` (rest)
- `GET @Url` (rest)
- `GET @Url` (rest)
- `GET @Url` (rest)
- `POST @Url` (rest)
- `POST @Url` (rest)
- `POST @Url` (rest)
- `POST @Url` (rest)
- `POST @Url` (rest)
- `POST app/logs/upload` (rest)
- `GET blink/clients_api/links/v1/locations/{locationId}/devices/{deviceId}/links?ignore_rbac=true&include_deactivated=false` (rest)
- `DELETE blink/clients_api/links/v1/locations/{locationId}/devices/{deviceId}/links/{linkId}?ignore_rbac=true&include_deactivated=false` (rest)
- `POST blink/clients_api/links/v1/locations/{locationId}/events/{event}/receivers?ignore_rbac=true&include_deactivated=false` (rest)
- `POST clients_api/setups` (rest)
- `GET clients_api/setups/{setupId}` (rest)
- `POST clients/{injected_client_id}/update` (rest)
- `GET device_info/v4/devices/{deviceId}` (rest)
- `GET device_info/v4/devices/{deviceId}/status` (rest)
- `DELETE devices/v1/devices/{deviceId}` (rest)
- `PATCH devices/v1/devices/{deviceId}` (rest)
- `GET devices/v2/locations` (rest)
- `DELETE dings/{dingId}` (rest)
- `DELETE dings/{dingId}/favorite` (rest)
- `PUT dings/{dingId}/favorite` (rest)
- `POST duos/v1/locations` (rest)
- `DELETE duos/v1/locations/{locationId}` (rest)
- `PATCH duos/v1/locations/{locationId}` (rest)
- `PATCH duos/v1/locations/{locationId}` (rest)
- `DELETE evm/v2/dings` (rest)
- `DELETE evm/v2/events/associations/{profile_Id}` (rest)
- `DELETE evm/v2/events/time-based-deletion/{source_id}` (rest)
- `GET evm/v2/history/devices` (rest)
- `GET evm/v2/history/events/{eventId}` (rest)
- `POST evm/v2/history/extendedsearch` (rest)
- `GET evm/v2/metadata/history/devices` (rest)
- `GET evm/v2/timeline/24/devices/{source_id}` (rest)
- `GET evm/v2/timeline/devices/{doorbotId}` (rest)
- `GET evm/v2/timeline/events/eventito/{source_id}` (rest)
- `GET evm/v3/history/devices` (rest)
- `POST evm/v3/history/events` (rest)
- `GET factory_profile` (rest)
- `GET fms/device-firmware` (rest)
- `GET location_info/v3/locations` (rest)
- `DELETE recordings/public/footages/{deviceId}` (rest)
- `DELETE recordings/public/footages/{deviceId}/delete_all` (rest)
- `POST sos/v1/setups` (rest)
- `POST users/delete` (rest)
- `GET v1/accounts/{injected_account_id}/single_event_alerts` (rest)
- `POST v1/accounts/{injected_account_id}/single_event_alerts` (rest)
- `DELETE v1/alexa/link` (rest)
- `POST v1/alexa/link` (rest)
- `GET v1/clients/{injected_client_id}/control_panel/clients` (rest)
- `POST v1/clients/{injected_client_id}/control_panel/delete` (rest)
- `POST v1/clients/{injected_client_id}/control_panel/pin/resend` (rest)
- `POST v1/clients/{injected_client_id}/control_panel/pin/verify` (rest)
- `POST v1/clients/{injected_client_id}/control_panel/request_pin` (rest)
- `POST v1/clients/{injected_client_id}/options` (rest)
- `POST v1/clients/{injected_client_id}/shared_login/pin/resend` (rest)
- `POST v1/clients/{injected_client_id}/shared_login/pin/verify` (rest)
- `POST v1/clients/{injected_client_id}/shared_login/request_pin` (rest)
- `POST v1/countries/update` (rest)
- `POST v1/data_request/third_party/{thirdPartyId}/revoke` (rest)
- `POST v1/events/app` (rest)
- `GET v1/identities` (rest)
- `DELETE v1/identities/{id}` (rest)
- `GET v1/identities/{id}` (rest)
- `PATCH v1/identities/{id}` (rest)
- `PATCH v1/identities/{id}/actions/merge-identities` (rest)
- `POST v1/identities/{id}/actions/split-identity` (rest)
- `DELETE v1/identities/{id}/enrollment-images` (rest)
- `PATCH v1/identities/{id}/enrollment-images/actions/move-enrollment-images` (rest)
- `POST v1/identity/token` (rest)
- `POST v1/locations/update` (rest)
- `GET v1/notifications/preferences` (rest)
- `POST v1/notifications/preferences` (rest)
- `POST v1/shared_login/claim` (rest)
- `POST v1/shared_login/revoke` (rest)
- `POST v1/shared_login/verify` (rest)
- `DELETE v1/shared/authorizations/{authorizationId}/revoke` (rest)
- `GET v1/shared/check_authorization` (rest)
- `DELETE v1/shared/invitations/{invitationId}/decline` (rest)
- `DELETE v1/shared/invitations/{invitationId}/revoke` (rest)
- `POST v1/shared/invitations/send` (rest)
- `PATCH v1/shared/popovers/{popoverId}/read` (rest)
- `GET v1/shared/summary` (rest)
- `POST v1/subscriptions/clear_popup/{type}` (rest)
- `POST v1/subscriptions/link/link_account` (rest)
- `POST v1/subscriptions/link/unlink_account` (rest)
- `POST v1/subscriptions/plans/{subscriptionId}/attach` (rest)
- `DELETE v1/subscriptions/plans/cancel_trial` (rest)
- `GET v1/subscriptions/plans/get_device_attach_eligibility` (rest)
- `POST v1/subscriptions/plans/renew_trial` (rest)
- `POST v1/subscriptions/request/status/{uuid}` (rest)
- `POST v1/users/authenticate_password` (rest)
- `POST v1/users/countries/update` (rest)
- `GET v1/users/options` (rest)
- `GET v1/users/preferences` (rest)
- `POST v1/users/preferences` (rest)
- `POST v2/clients/{injected_client_id}/tiv` (rest)
- `POST v2/clients/{injected_client_id}/tiv_unlock/pin/resend` (rest)
- `POST v2/clients/{injected_client_id}/tiv_unlock/pin/verify` (rest)
- `POST v2/clients/{injected_client_id}/tiv_unlock/request_pin` (rest)
- `POST v2/subscriptions/plans/create_trial` (rest)
- `GET v2/users/info` (rest)
- `POST v4/clients/{injected_client_id}/email_change` (rest)
- `POST v4/clients/{injected_client_id}/email_change/pin/resend` (rest)
- `POST v4/clients/{injected_client_id}/email_change/pin/verify` (rest)
- `POST v4/clients/{injected_client_id}/logout` (rest)
- `POST v4/clients/{injected_client_id}/password_change` (rest)
- `POST v4/clients/{injected_client_id}/password_change/pin/generate` (rest)
- `POST v4/clients/{injected_client_id}/password_change/pin/verify` (rest)
- `POST v4/clients/{injected_client_id}/pin/verify` (rest)
- `POST v4/users/pin/resend` (rest)
- `POST v4/users/pin/verify` (rest)
- `POST v5/clients/{injected_client_id}/client_verification/pin/resend` (rest)
- `POST v5/clients/{injected_client_id}/client_verification/pin/verify` (rest)
- `POST v5/clients/{injected_client_id}/phone_number_change` (rest)
- `POST v5/clients/{injected_client_id}/phone_number_change` (rest)
- `POST v5/clients/{injected_client_id}/phone_number_change/pin/verify` (rest)
- `POST accounts/{injected_account_id}/networks/{network}/cameras/add` (shared-rest)
- `GET accounts/{injected_account_id}/networks/{network}/commands/{command}` (shared-rest)
- `POST accounts/{injected_account_id}/networks/{network}/commands/{command}/done` (shared-rest)
- `POST accounts/{injected_account_id}/networks/{network}/commands/{command}/update` (shared-rest)
- `POST accounts/{injected_account_id}/networks/{network}/commands/{command}/update` (shared-rest)
- `POST accounts/{injected_account_id}/networks/{network}/delete` (shared-rest)
- `POST accounts/{injected_account_id}/networks/{network}/update` (shared-rest)
- `POST accounts/{injected_account_id}/networks/{network}/update` (shared-rest)
- `POST accounts/{injected_account_id}/networks/{network}/update` (shared-rest)
- `POST accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/delete` (shared-rest)
- `POST accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/status` (shared-rest)
- `POST accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/delete` (shared-rest)
- `POST accounts/{injected_account_id}/networks/add` (shared-rest)
- `POST accounts/{injected_account_id}/system_offline/{network}` (shared-rest)
- `GET v1/accounts/{injected_account_id}/access` (shared-rest)
- `GET v1/accounts/{injected_account_id}/doorbells/{serial}/fw_update` (shared-rest)
- `GET v1/accounts/{injected_account_id}/doorbells/{serial}/token` (shared-rest)
- `GET v1/accounts/{injected_account_id}/feature_flags/enabled` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network_id}/accessories/delete` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network_id}/accessories/rosie/owl/{owl_id}/calibrate` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network_id}/cameras/{camera_id}/snooze` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network_id}/cameras/{camera_id}/unsnooze` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/change_mode` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/change_wifi` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/clear_creds` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/stay_awake` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{lotus_id}/snooze` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{lotus_id}/unsnooze` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/accessories/rosie/{rosie_id}/delete` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/snooze` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/unsnooze` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network_id}/snooze` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network_id}/state/disarm` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network_id}/unsnooze` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/accessories/add` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/calibrate` (shared-rest)
- `GET v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/delete` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/disable` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/enable` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/update` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/create` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/temp_alert_disable` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/temp_alert_enable` (shared-rest)
- `GET v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` (shared-rest)
- `GET v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config` (shared-rest)
- `GET v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/config` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/power_test` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/trigger_chime` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/calibrate` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/temp_alert_disable` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/temp_alert_enable` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/status` (shared-rest)
- `GET v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/add` (shared-rest)
- `GET v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/delete` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/disable` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/enable` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/update` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/create` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/owls/add` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/owls/add` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/delete` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/disable` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/enable` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/update` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{network}/programs/create` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{camera}/accessories/{accessoryType}/{accessoryId}/delete` (shared-rest)
- `GET v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/network_type` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/network_type` (shared-rest)
- `GET v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/list` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/update` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/config` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/delete` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/status` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/ob_cancel` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/accessories/{accessoryType}/{accessoryId}/delete` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/lights/{lightControl}` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/change_wifi` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/change_wifi` (shared-rest)
- `GET v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/delete` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/status` (shared-rest)
- `DELETE v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/pair` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/pair` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/swap_pair` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/state/arm` (shared-rest)
- `DELETE v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/eject` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/format` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/delete/{clipId}` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/request/{clipId}` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/request` (shared-rest)
- `GET v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/media/{commandId}` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/mount` (shared-rest)
- `GET v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/status` (shared-rest)
- `POST v1/accounts/{injected_account_id}/networks/bulk_location_assignment` (shared-rest)
- `GET v1/accounts/{injected_account_id}/owls/{serial}/fw_update` (shared-rest)
- `GET v1/accounts/{injected_account_id}/smart_video_descriptions` (shared-rest)
- `POST v1/accounts/{injected_account_id}/smart_video_descriptions` (shared-rest)
- `POST v1/accounts/{injected_account_id}/smart_video_descriptions/summarize` (shared-rest)
- `GET v1/accounts/{injected_account_id}/sync_modules/{serial}/fw_update` (shared-rest)
- `GET v2/accounts/{injected_account_id}/devices/identify/{serialNumber}` (shared-rest)
- `GET v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/config` (shared-rest)
- `GET v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` (shared-rest)
- `POST v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` (shared-rest)
- `GET v2/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` (shared-rest)
- `POST v2/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` (shared-rest)
- `POST v2/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/config` (shared-rest)
- `POST v2/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/liveview` (shared-rest)
- `POST v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/liveview` (shared-rest)
- `GET v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/zones` (shared-rest)
- `POST v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/zones` (shared-rest)
- `POST v2/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{type}` (shared-rest)
- `GET v2/accounts/{injected_account_id}/subscriptions/entitlements` (shared-rest)
- `GET v4/accounts/{injected_account_id}/homescreen` (shared-rest)
- `POST v4/accounts/{injected_account_id}/media` (shared-rest)
- `GET v4/accounts/{injected_account_id}/media_settings` (shared-rest)
- `PATCH v4/accounts/{injected_account_id}/media_settings` (shared-rest)
- `DELETE v4/accounts/{injected_account_id}/media/{mediaId}/delete` (shared-rest)
- `POST v4/accounts/{injected_account_id}/media/delete` (shared-rest)
- `POST v4/accounts/{injected_account_id}/media/mark_as_viewed` (shared-rest)
- `GET v4/accounts/{injected_account_id}/subscriptions/plans` (shared-rest)
- `GET v4/accounts/{injected_account_id}/unwatched_media` (shared-rest)
- `POST v6/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/liveview` (shared-rest)

### Removed

- `GET device_info/v4/devices` (device-orchestration)
- `POST device_info/v4/devices/operations` (device-orchestration)
- `GET device_info/v4/devices/{deviceId}/configurations` (rest)
- `GET v3/accounts/{injected_account_id}/subscriptions/plans` (shared-rest)

## Third-party exclusions

| Host | Owner | Reason |
|---|---|---|
| 192.168.240.1 | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| accounts.google.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| aomedia.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| apache.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
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
| clientsapigw.us-east-1.beta.v2.gws.ring.amazon.dev | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| cloud.google.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| cloudfront-staging.tilestream.net | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| code.amazon.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| config.mapbox.com | Mapbox | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
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
| events.mapbox.com | Mapbox | Bundled third-party SDK or service traffic; outside the Blink first-party contract catalog. |
| events.mobile.crashtracking.prod.ring.com | Blink/Ring static content or observability | First-party host, but not an application API contract. |
| example.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
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
| xml.apache.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| xml.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| xmlpull.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| youtrack.jetbrains.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| android.googlesource.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.tensorflow.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| crashpad.chromium.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| crbug.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| webrtc.googlesource.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.webrtc.org | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| aomediacodec.github.io | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| crl.comodoca.com | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| crl.comodo.net | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.world | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.years | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.interpretation | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.recent | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.icon | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.hortcut | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |
| www.css | Other bundled dependency | Host is not owned by Blink, Immedia, Ring, or Amazon Vision Operations. |

## Unresolved evidence and completeness

- Active normalized contracts: 343
- Models recovered: 677
- Unresolved candidates: 1607
- Smali-only contracts: 0
- Active contracts without smali evidence: 0
- Unresolved models: 450
- Unclassified first-party candidates: 0
- JADX reported errors: 605

- **model-field-metadata:** `com.ring.reapp.models.CodeKeyboardType` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.rdis.RdisDeviceSettingsAttributes` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `POST api/set/ssid` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.DialogTemplate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `DELETE v4/accounts/{injected_account_id}/media/{mediaId}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.UpdateNetworkSaveAllLiveViews` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.immediasemi.blink.models.LastConnect` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.immediasemi.blink.account.password.ResetPasswordPostBody@snake_case` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BLESetupModeProgressScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/clients/{injected_client_id}/shared_login/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.SafeComponent` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.SetupFlowStartPostSetupAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.UpdateDeviceConfigurationAttributes` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.PermissionsCheckLocalisedResources` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `dings/{dingId}` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.models.CameraConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.rdis.RdisMotionConfigurations` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/status` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `PATCH devices/{deviceId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.CamerasV3` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.sharedlogin.model.SharedLoginItem` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.LocationCoordinatesBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v2/subscriptions/plans/create_trial` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `@Url` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `clients/{injected_client_id}/update` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST v3/users/validate_password` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.EventPropertyValue` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.LotusConfigInfo` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.OwlAddBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/notifications/preferences` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.UpdateIdentityAttributes` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v4/accounts/{injected_account_id}/media/mark_as_viewed` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **serialization-converter:** `api/get_fw_version` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `v1/events/app` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.PromoCardModel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/data_request/euda/create` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisOperationsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.accessory.chime.ConfigurationsData` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **serialization-converter:** `evm/v2/timeline/devices/{doorbotId}` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `GET evm/v2/timeline/24/devices/{source_id}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.IpConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.RingDeviceHealth` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.AccessPoint` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.SosDeviceSetupStatusResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.privacy.SetTivLockResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BLEFetchWifiNetworksScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/stay_awake` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.account.auth.AuthenticatePasswordResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.PinVerificationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.RdisDeviceRelationships` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/clients/{injected_client_id}/control_panel/clients` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/access` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.ring.reapp.models.SoftAPSetupProvisioning` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorLocalMediaResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.upsell.UpsellEligibility` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/users/countries/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.EventRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.wired.AddOwlPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorFootageResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.GetClientsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.SearchQuery` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.ring.blueprints.setup.core.data.Transformer` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v5/clients/{injected_client_id}/phone_number_change` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.account.preference.AccountPreferencesBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.TutorialImage` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `evm/v2/timeline/24/devices/{source_id}` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.device.wifi.GetFwVersionResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.UpdateIdentityData` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `duos/v1/locations` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `DELETE duos/v1/locations/{locationId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET system/config/network` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.Setup` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/trigger_chime` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.url.LocaleUrlMap` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v4/users/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.SwapCameraBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET evm/v2/timeline/events/eventito/{source_id}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.device.network.command.SupervisorKommand` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorTimelineResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.subtype.LocationSubtypeNetwork` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/snooze` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/disable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/single_event_alerts` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/countries/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.TypographyToken` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.VerifyPinPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.onboard.doorbell.add.AddLotusBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/alexa/authorization` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST v7/users/register` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.privacy.TivLockStatus@snake_case` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.TrackingEvents` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.FriendlyNamePatchBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.camera.zone.api.PrivacyZoneSpan` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.CellList` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.RosieConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `evm/v3/history/events` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `v1/clients/{injected_client_id}/shared_login/request_pin` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.PostSetupRingAIFeaturesAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v2/notification` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.accessory.chime.DeviceConfigurationsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.Badge` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v4/users/password_change/pin/generate` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.device.accessory.AddAccessoryBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisOperationData` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET evm/v2/history/unwatched/count` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `kotlinx.serialization.json.JsonObject` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorPropertiesResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET api/ssids` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.db.enums.AccessTarget` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/thumbnail` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE dings/{dingId}/favorite` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v4/users/pin/verify` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `GET location-subtypes` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v1/version` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.basic.DeviceEligibilityResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.media.MediaSettingsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.network.command.CameraActionKommand` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.TextInputModel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.SmartVideoDescriptionsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.donation.api.BatchDonationRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.SetScreenJsonAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.LocationDetailGeometry` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.DspSubscriptionResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.accessory.chime.Attributes` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/identities/{id}/actions/split-identity` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/clients/{injected_client_id}/email_change` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.email.ChangeEmailPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.ring.blueprints.setup.core.data.Capabilities` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **serialization-converter:** `v4/clients/{injected_client_id}/password_change/pin/verify` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/request/{clipId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.basic.DeviceEligibility` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.trial.SubscriptionTrial` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.DescriptionAreaTemplate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.UnwatchedCountResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.RdisMeta` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.duos.DeviceEntityUpdateRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `PATCH v1/shared/popovers/{popoverId}/read` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET @Url` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.duos.DeviceBulkUpdateRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.LensFootageMetadataResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.sharedlogin.model.RevokeSharedLoginBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.SentInvitation` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/shared/invitations/{invitationId}/revoke` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.settings.account.managedata.ThirdPartyAuthorization` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.doorbell.LotusDoorbellMode` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.db.enums.AccessName` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.BlinkMetadata` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/data_request/third_party/{thirdPartyId}/revoke` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.device.network.command.CameraActionSupervisorKommand` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ToggleRoundButtonStyle` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.immediasemi.blink.models.STAGE_TYPE` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.EnrollmentImageRelationship` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.scheduling.ScheduleAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorEventAnomalyResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.RegionConfigPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST 2fa/v1/webauthn/registration/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.models.SignalStrength` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.CellIcon` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.adddevice.lotus.chime.ChimeType` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorFeedResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.RdisDeviceResource` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `duos/v1/locations/{locationId}` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.settings.notifications.sea.SeaDeviceUpdate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.Command` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.EventRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.wired.DeviceAuthTokenResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.access.AccessSummary` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.immediasemi.blink.models.MAX_RECORDING_RESOLUTION` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.RdisResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.access.accept.CheckAuthorizationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET api/get_fw_version` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_COMMAND` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.EntitlementFeature` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/version` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v2/users/info` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.Orchestrator24x7TimeSlotResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BLESetupEnterWifiPasswordScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v4/clients/{injected_client_id}/email_change` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `DELETE v1/shared/invitations/{invitationId}/decline` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/disable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.SearchQuery` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `PATCH v1/devices/{id}/configurations` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.notifications.sea.SeaDevice` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.RichErrorDeviceItemModel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.SvdDevice` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `MapboxMap.QFE_LIMIT` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.common.account.auth.RefreshTokensResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.IconBackground` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.LocalStorageStatusResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorCvResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.PopAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.email.ChangeEmailPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.SubscriptionRequestStatusBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v2/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.sharedlogin.model.GetSharedLoginResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.client.option.ClientOptionsBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/commands/{command}/done` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.blueprints.setup.core.data.DeviceLocale` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.scheduling.ScheduleEvent` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisOperationsBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.RdisResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.NetworksV3` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET accounts/{injected_account_id}/networks/{network}/commands/{command}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v4/accounts/{injected_account_id}/media_settings` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.wired.AddOwlResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.registry.DeviceRegistryPatchBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `GET @Url` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.media.BackendMedia` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **serialization-converter:** `@Url` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.Blink` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.video.live.PollOptions` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.DspSubscriptionResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.camera.setting.motion.DetectionModes` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.basic.DeviceEligibility` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BLENonOwnerScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v2/accounts/{injected_account_id}/subscriptions/entitlements` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/temp_alert_disable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.NetworkClientConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.wired.ChimeCamerasPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.db.enums.AccessReason` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.SplitIdentityRelationships` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.account.alexa.AlexaLinkingLinkPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.doorbell.LotusDoorbellMode` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.duos.ChimeVolumeUpdate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET api/get_fw_version` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v1/users/options` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST v3/users/validate_email` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.LocalStorageStatusResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/smart_video_descriptions` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/owls/{serial}/fw_update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.blueprints.setup.core.data.ApiAccessPoints` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorItemsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.SplitIdentityData` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `DeviceType.IDENTIFY_TYPE_DOORBELL` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.Accessory` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.VerifyPinResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET evm/v2/history/devices` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.PinVerificationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/subscriptions/clear_popup/{type}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/cameras/{camera_id}/unsnooze` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.ContentMode` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.DialogTemplate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.IconShape` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.LocationByIpResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.MediaListBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.rdis.RdisError` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `DELETE evm/v2/events/associations/{profile_Id}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/clients/{injected_client_id}/shared_login/pin/resend` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.subtype.SubtypeData` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorCloudMediaMetadataResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/notifications/preferences` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.blueprints.setup.core.data.backend.ApiSetupStatus` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/disable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/lights/{lightControl}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.NetworksV3` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.RdisDeviceRelationships` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.IdentityResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.RingDeviceHealth` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.preference.AccountPreferencesBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BLESetupWrongWifiPasswordScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.DoorbellsV3` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `PATCH v1/identities/{id}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.ItemListSelectionHeader` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST @Url` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.EntitlementHomescreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.IdentifyDeviceResponseApiModel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `DELETE v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.HttpMethod` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.SpinnerIcon` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.ChangePhoneNumberResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.IconValueCellMainIconSize` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.SectionHeader` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/locations/update` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.IdentityAttributes` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/alexa/authorization` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorSearchMetadataResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BLESetupCompletingScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.LocationDetailsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET devices/v2/locations` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET geocoding/v1/auto-complete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `duos/v1/locations` — No unique source-evidenced converter policy was recovered for this API binding.
- **parameter-wire-name:** `ProcessNotification.KEY_COMMAND` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.UpdateDeviceConfigurationAttributes` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.duos.DevicePrivacySettingsEntity` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.VideoStats` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.wifi.AccessPoint` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.TutorialProgressModel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.accessory.chime.Attributes` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `dings/{dingId}/favorite` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `v1/clients/{injected_client_id}/options` — No unique source-evidenced converter policy was recovered for this API binding.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.media.UnwatchedMediaResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.SosSetupPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `dings/{dingId}/favorite` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorDeviceResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `DELETE blink/clients_api/links/v1/locations/{locationId}/devices/{deviceId}/links/{linkId}?ignore_rbac=true&include_deactivated=false` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET clients_api/setups/{setupId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorThirdPartyPartner` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.ANetwork` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.SvdDevice` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v4/clients/{injected_client_id}/logout` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/clients/{injected_client_id}/shared_login/request_pin` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.sharedlogin.model.SharedLoginClaimBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v4/clients/{injected_client_id}/password_change` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.SetupDeviceQRCodeScanAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.sharedlogin.model.SharedLoginItem` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.RdisMeta` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `location_info/v3/locations` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.EnterPinCodeScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/subscriptions/plans/get_device_attach_eligibility` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.UnderlineStyle` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.CancelDialogResources` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.AddLotusDoorbell` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.UpdateDeviceConfigurationData` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.network.command.Kommand` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.ApIpConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.AccessItem` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/locations/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v1/shared/popovers/{popoverId}/read` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST setups/{setupId}/complete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.scheduling.ScheduleEvent` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.update.AppVersionCheckResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **parameter-wire-name:** `HardwareID.KEY_HARDWARE_ID` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.AccessPointListResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.EventPropertyValue` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ConfirmationButtonModule` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.PostSetupChimeConnectionAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.SosDeviceOtaStatusResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.TextInputTemplate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `HardwareID.KEY_HARDWARE_ID` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.Owl` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v4/accounts/{injected_account_id}/media/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorSupplementalDataResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.UpdateSuperiorBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `setups/{setupId}/complete` — No unique source-evidenced converter policy was recovered for this API binding.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.models.CameraConfigInfo` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/status` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/enable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.ring.blueprints.setup.core.data.backend.MetaData` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.models.AccessoryConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.basic.DeviceInfo` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/clients/{injected_client_id}/control_panel/pin/resend` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.sharedlogin.model.PostSharedLoginVerifyResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.SentInvitation` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ToggleRoundButton` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorCloudMediaResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.media.MediaSettingsPatch` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisIncluded` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.UpdateDeviceConfigurationRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/unsnooze` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisOperation` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET @Url` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.basic.AttachPlanBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.Verification` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ImageIconCell` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.CheckableStyle` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.CalloutCard` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.basic.DeviceInfo` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ImageCellConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.account.password.ResetPasswordPostBody@unresolved` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.UnderlineStyle` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.client.ClientUpdatePostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/accessories/{accessoryType}/{accessoryId}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `evm/v2/history/unwatched/count` — No unique source-evidenced converter policy was recovered for this API binding.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `POST @Url` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.StrikethroughStyle` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.video.live.LiveViewSupervisorKommand` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.FloodlightProgramConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.Blink` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.ANetwork` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.ApWirelessConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.NetworkConfigPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/cameras/{camera_id}/snooze` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/shared_login/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.models.VideoNetworksConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.setting.linkdevice.data.model.CreateLinkRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/shared/check_authorization` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `evm/v2/metadata/history/devices` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST 2fa/v1/webauthn/registration` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.SplitIdentityResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `DELETE v1/history/events/associations/{profile_id}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/accessories/rosie/owl/{owl_id}/calibrate` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/temp_alert_enable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v5/clients/{injected_client_id}/phone_number_change/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.NavigateScreenJsonAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.network.command.SupervisorKommandWithChildren` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.DeviceProvisioningLocalisedResources` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.QRCodeIdentification` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.Screen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.wired.ChimeCamera` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `GET device_info/v4/devices/{deviceId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.sharedlogin.model.SharedLoginVerifyBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.phone.Phone@snake_case` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.IconShape` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.PhoneVerificationChannel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.Account@snake_case` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.SubscriptionPlansResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.UpdateStormBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorBatchRequestBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.NetworkConfigStatusResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v2/clients/{injected_client_id}/tiv_unlock/request_pin` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.ChangePhoneNumberBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.account.alexa.AlexaLinkingAuthorizeResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.StrikethroughStyle` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/users/tier_info` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `regions` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.device.wifi.AccessPoints` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.immediasemi.blink.api.retrofit.SSId` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `GET v1/alexa/link_status` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.settings.privacy.TivLockStatus` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `DELETE dings/{dingId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.Bounds` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BLESetupModeEducationScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v2/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{type}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `evm/v2/dings` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `v2/subscriptions/plans/create_trial` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.RingSosSetupPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.accessory.AddAccessoryBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.CameraSignals` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.IdentityResource` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.ChimeAccessoryConfigInfoResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.GeoCodingRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/clients/{injected_client_id}/control_panel/clients` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.SetupDeviceType` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisErrorSource` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.CodeTextEntryConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ImageIconCellMainIconSize` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorFeedElementResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v4/clients/{injected_client_id}/logout` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `GET @Url` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.account.alexa.AlexaLinkStatus` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.requests.onboarding.OnboardingCommandUpdate.UpdateCommandRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.RegionProvisioning` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.RingDevice` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ImageActionCell` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.UpdateLotusChimeConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.RichErrorCodeModel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `DELETE v1/alexa/link` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v1/alexa/link` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `evm/v2/events/associations/{profile_Id}` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.TextInputModel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.HomescreenAccount` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `evm/v2/timeline/events/eventito/{source_id}` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.ProcessingInfo` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/create` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.media.MediaResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.media.MediaPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.AddCameraResponseBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v5/clients/{injected_client_id}/client_verification/pin/resend` — No unique source-evidenced converter policy was recovered for this API binding.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **serialization-converter:** `v1/notifications/preferences` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.video.live.LiveViewCommandResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.RingDevice` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `@Url` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.TutorialTemplate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **serialization-converter:** `api/set/app_fw_update` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.db.enums.EntitlementStatus` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET factory_profile` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.models.VideoNetworks` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.LotusChimeConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.trial.SubscriptionTrialPopup` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.NetworkConfigPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/shared/invitations/send` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/users/authenticate_password` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/media/{commandId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.account.managedata.DataRequests` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.camera.setting.motion.MotionRecordingSetting` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v2/clients/{injected_client_id}/tiv_unlock/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST @Url` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.library.video.event.model.Identity` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ConnectionType` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/change_wifi` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v1/shared/authorizations/{authorizationId}` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.EnrollmentImageResource` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.models.LightAccessoryConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/users/options` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.CellCheckableConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.ring.blueprints.setup.core.data.Properties` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.immediasemi.blink.common.system.AddNetworkBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.blueprints.setup.core.data.backend.ApiFactoryDeviceProfile` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET evm/v2/timeline/devices/{doorbotId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v1/clients/{injected_client_id}/shared_login/pin/resend` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `v1/shared/summary` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `GET v1/data_request/list` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST @Url` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/snooze` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/subscriptions/plans/renew_trial` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.MainButtonStyle` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **serialization-converter:** `v1/shared/invitations/send` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.blueprints.setup.core.data.backend.ApiFactoryDeviceProfile` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisDeviceAttributes` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.EntitlementFeature` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisRelationshipLinks` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.MediaContent` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BLESetupWeakSignalScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.network.command.PollingResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `POST v1/data_request/dsar/create` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.DescriptionArea` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.wifi.AccessPoint` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BadgeStyle` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.NetworkConfigStatusResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.db.enums.AccessReason` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `MapboxMap.QFE_LIMIT` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.Client` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.immediasemi.blink.models.NETWORK_ORIGIN` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.Orchestrator24x7TimelineResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `PATCH v1/identities/{id}/enrollment-images/actions/move-enrollment-images` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.api.retrofit.Status` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorDeviceResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `api/logs` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorVisualizationsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.blueprints.setup.core.data.entity.DeviceFirmwareResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.AccessPoint` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.RdisRelationship` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.AccessPoints` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.AccessMessage` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET @Url` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.ImageContentMode` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.LotusChimeConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v2/accounts/{injected_account_id}/devices/identify/{serialNumber}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST api/set/app_fw_update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.utils.SubscriptionRequestStatusResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.OwlsV3` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/bulk_location_assignment` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.NavigateScreenJsonAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.CreateProgramBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/state/disarm` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.CountryResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.Owl` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/countries` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.account.User@unresolved` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.duos.DeviceMetadataUpdate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `apphelp.immedia-semi.com/link-manifest.json` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.Screen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/shared/invitations/{invitationId}/accept` — No unique source-evidenced converter policy was recovered for this API binding.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `GET v4/accounts/{injected_account_id}/unwatched_media` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.UpdateIdentityRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ButterBarAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.RdisDeviceAttributes` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.phone.Phone` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.account.managedata.DataRequests` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/status` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.DescriptionAreaMainIcon` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.UpdateSystemNameBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.duos.DeviceBulkUpdateResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `PATCH v1/identities/{id}/actions/merge-identities` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorMapVisualizationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.ApIpConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.PatternValidationRule` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.IdentitiesResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/shared_login/revoke` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `PATCH v4/accounts/{injected_account_id}/media_settings` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.LocationPredictionResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.VerifyPinPostBody@unresolved` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.FriendlyNamePatchBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.LocationDetailGeometry` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.device.accessory.DeleteAccessoryBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.SectionHeader` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.donation.api.DonationClipRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ButtonModuleModel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/disable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.IconBackground` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.UpdateSosDeviceBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.ChangePhoneNumberResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.notifications.sea.SingleEventAlertsPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.ring.reapp.models.BannerImageConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.SuperiorConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.scheduling.UpdateProgramRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.Client` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST blink/clients_api/links/v1/locations/{locationId}/events/{event}/receivers?ignore_rbac=true&include_deactivated=false` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.AttributedString` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.LocationEntitlementsBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorSearchMetadataResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.common.device.duos.DeviceBulkUpdateResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.RichErrorTryItemModel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.duos.CvSettings` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/devices` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.basic.AttachPlanBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorEventSimilarityResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.video.live.LiveViewCommandResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/users/preferences` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.sharedlogin.model.GetSharedLoginResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorExtendedSearchRequestBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.DeleteClientBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.Badge` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.duos.DuosMotionSettingsPayload` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.TextRange` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisFeatureState` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET evm/v2/metadata/history/devices` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.ChangePhoneNumberBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.SubscriptionPlan` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.IconGlyph` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.IdentitiesMeta` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.ClientIpConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v2/clients/{injected_client_id}/tiv` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.device.network.command.Kommand` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.UpdateLightAccessoryBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/shared/invitations/{invitationId}/decline` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.device.network.BulkLocationAssignmentResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.GeoCodingRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.IconValueCellMainIcon` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.sharedlogin.model.CreateSharedLoginBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.blueprints.setup.core.data.ApiAccessPoints` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.UpdateTimezoneBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.PostSetupMotionSettingsAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.wired.DeviceAuthTokenResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.setting.linkdevice.data.model.DeviceLink` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.upsell.UpsellEligibility` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.AddLotusDoorbell` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.FloodlightProgramConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.LightAccessoryConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.DescriptionAreaMainIconSize` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `DELETE recordings/public/footages/{deviceId}/delete_all` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/clear_creds` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET @Url` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.ShowDialogAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.SnoozeBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.UpdateLotusBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.account.password.ResetPasswordPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.Wireless` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.access.accept.AcceptInvitationBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.db.enums.EntitlementReason` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.country.Region` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/subscriptions/plans/get_device_attach_eligibility` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.CustomCheckIcon` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.AccessItemStatus` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/subscriptions/request/status/{uuid}` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-reference:** `com.immediasemi.blink.models.LIVEVIEW_STATE` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.ring.reapp.models.SafeCellComponent` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.DeviceLimits` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/format` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.Verification` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `evm/v2/events` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.device.rdis.RdisFeatureState` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `DELETE v1/shared/authorizations/{authorizationId}/revoke` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v1/clients/{injected_client_id}/control_panel/delete` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v2/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.SessionKeys` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.LocationDetailsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `evm/v3/history/devices` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisIncludedAttrs` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/clients/{injected_client_id}/control_panel/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET device_info/v4/devices/{deviceId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/accessories/rosie/{rosie_id}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.HttpRequestUpdateAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v2/users/info` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.models.RosieConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.wired.SessionKeys` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.ring.reapp.models.TextAttribute` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/countries/update` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.account.AccessInvitation` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ColorToken` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorLocalMediaVisualizationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/shared_login` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.device.onboard.camera.AddCameraBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.AccessResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.Setup` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.immediasemi.blink.settings.SvdDeviceUpdate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `PUT dings/{dingId}/favorite` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.sharedlogin.model.SharedLoginClaimBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.NetworkApConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.SetupDeviceProvisioningAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.User` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.UpdateOwlBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.blueprints.setup.core.data.ApiAccessPoint` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.UpdateTimezoneBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.TemperatureCalibrationPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/subscriptions/plans/{subscriptionId}/attach` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.ClientIpConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.immediasemi.blink.models.SEQUENTIAL_ALERTS_STATUS` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.ring.reapp.models.Platform` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorTimelineResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/clients/{injected_client_id}/shared_login/pin/verify` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.VideoStats` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `fms/device-firmware` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.BLESetupModeWaitForSetupModeScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.models.VideoNetworkConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.url.LocaleUrlMap` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v4/clients/{injected_client_id}/password_change/pin/generate` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.Action` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.PopAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorEventAnomalyResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.SetupFlowStartPostSetupAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-reference:** `com.ring.blueprints.setup.core.data.Cellular` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.ApWirelessConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.media.UnwatchedMediaResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.CheckableStyle` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/alexa/link` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `1.0.0/batch/client.device/{appSubGroup}` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.media.MediaPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v5/clients/{injected_client_id}/phone_number_change` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.db.EventDataKey` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ItemListSelectionTemplate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.WirelessConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.WirelessConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.CameraConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/clients/{injected_client_id}/control_panel/pin/resend` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.RingSosSetupResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.IconValueCell` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.Entitlement` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v5/clients/{injected_client_id}/phone_number_change` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `GET device_info/v4/devices` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.account.auth.AuthenticatePasswordResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.TierInfo` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/status` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.update.AppVersionCheckResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisError` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.PostSetupPrivacyFeaturesAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET fms/device-firmware` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `@Url` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.utils.VerifyLinkAccountBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `POST v1/shared_login` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.ShowButterBarAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.GeoCodingRequestBounds` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `app/logs/upload` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.ring.reapp.models.ButterBarTemplate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.media.MediaProfile` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BLESetupModeInfoScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BLESetupModeInstructions` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.AcknowledgeNotificationBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.account.alexa.AlexaLinkingLinkPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/subscriptions/link/unlink_account` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.SubscriptionBanner` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.auth.RefreshTokensResponse@unresolved` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.EventDataKeyValuePair` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.flag.FeatureFlag` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.wired.ChimeCameraDto` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.network.command.CameraActionSupervisorKommand` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/change_wifi` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.StyledIcon` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.RingSosSetupPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.country.CountriesResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST @Url` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.CellIcon` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.WepSecurityWarningScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.auth.TokenUpgradePostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.TerminateOnboardingBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST users/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.url.LinkManifest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET @Url` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.ListSection` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BadgeStyle` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.requests.onboarding.OnboardingCommandUpdate.UpdateCommandRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/owls/add` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.device.onboard.camera.AddCameraBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `system/config/network` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.device.camera.zone.api.ZoneV2Response` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.DeviceStatus` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/programs/create` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.ring.reapp.models.CheckableIcon` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `DELETE v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/pair` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.library.video.event.model.Identity` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.access.SendInviteBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.DeviceProvisioningLocalisedResources` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/clients/{injected_client_id}/options` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.UpdateDeviceConfigurationData` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisOperationAttributes` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.MergeIdentityRef` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.SetupDeviceProvisioningAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.immediasemi.blink.models.accessory.chime.Health` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-reference:** `com.immediasemi.blink.common.device.duos.DeviceBulkUpdateError` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.ring.reapp.models.CloseAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorThirdPartyPartner` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.CellInfoButton` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.media.UnusualActivity` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.duos.DeviceMotionSettingsEntity` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/unsnooze` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.ImageIconCellMainIconSize` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/calibrate` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.models.UpdateOwlBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.system.AddNetworkBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.AccessAuthorization` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.country.Region` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.ResendClientVerificationCodeResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.AcknowledgeNotificationBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.Entitlement` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET device_info/v4/devices/{deviceId}/configurations` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.Client` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BLEConnectionScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.StickyButtonModule` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `evm/v2/history/extendedsearch` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/users/preferences` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v1/clients/{injected_client_id}/control_panel/request_pin` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorGroupResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.RegionClient` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.immediasemi.blink.models.AccessPoints` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.OwlConfigInfo` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `api/get_fw_version` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.account.Account` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.immediasemi.blink.scheduling.ProgramStatusCallback` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.ring.reapp.models.StyledIcon` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.TextInputType` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.accessory.chime.AudioConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.camera.zone.api.AdvancedCameraZones` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.blueprint.model.BlueprintResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.SetSSIDBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ButterBarButtonSize` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.db.EventName` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `PUT duos/v1/devices/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.rdis.RdisDeviceHealth` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.rdis.RdisStatusLed` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.LocationBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.models.SuperiorConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/pair` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.Wireless` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST geocoding/v1/geocode` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/cameras/{camera}/thumbnail` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/create` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorMapVisualizationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_COMMAND` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.UpdateAccessoryBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.DeleteClientBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.Email` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorRadarVisualizationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.rdis.RdisFamiliarFacesState` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET location_info/v3/locations` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v4/accounts/{injected_account_id}/homescreen` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/temp_alert_disable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.device.setting.linkdevice.data.model.DeviceLinksResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.moment.SummarizeClipsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/add` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.account.phone.Phone@unresolved` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `kotlinx.serialization.json.JsonObject` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.HttpRequestAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.Platform` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.RequiredValidationRule` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.SyncModulesV3` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST oauth/token` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.blueprints.setup.core.data.ApiNetwork` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorFootageResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.Camera` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorFeedElementResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v4/accounts/{injected_account_id}/subscriptions/plans` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.UpdateLocationRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `evm/v2/events/watch` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.settings.account.alexa.AlexaLinkingAuthorizePostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/thumbnail` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.wired.ChimeCamerasResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.ring.blueprints.setup.core.data.Client` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `GET accounts/{injected_account_id}/networks/{network}/commands/{command}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.utils.VerifyLinkAccountBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.GrantedAuthorization` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/clients/{injected_client_id}/control_panel/pin/verify` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/single_event_alerts` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v1/data_request/third_party/{thirdPartyId}/revoke` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.ImageIconCell` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.BatteryExtensionPackAccessoryApi` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/accessories/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.accessory.chime.ConfigurationsAttributes` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.account.alexa.AlexaLinkingAuthorizePostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.trial.SubscriptionTrialPopup` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.MergeIdentitiesRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.BatteryExtensionPackAccessoryApi` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/shared_login` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.flag.FeatureFlagsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/network_type` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.models.UpdateLotusChimeConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.CodeKeyboardType` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorLocalMediaResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.MacIdentifyDeviceResponseApiModel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.sharedlogin.model.PostSharedLoginResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.NetworkApConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/clients/{injected_client_id}/control_panel/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.Phone` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.EventDataKeyValuePair` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.UpdateDeviceConfigurationRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorEventResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.auth.RegisterBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.LocationCoordinatesBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.device.setting.linkdevice.data.model.CreateLinkResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.NavigateUrlAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `evm/v2/events/time-based-deletion/{source_id}` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `PUT share_service/v3/batch_shares` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.video.live.LiveViewSupervisorKommand` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `PATCH devices/v1/devices/{deviceId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.SetupDeviceType` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/subscriptions/link/link_account` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `api/set/ssid` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/status` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.RichErrorTryListModel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/alexa/link_status` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.SosDeviceOtaStatusResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.Action` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.MapLinkBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.CamerasV3` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.DeviceIdentification` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.CodeTextEntryTemplate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `DELETE recordings/public/footages/{deviceId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.GeoCodingRequestBounds` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.media.MediaSettingsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `DELETE evm/v2/events/time-based-deletion/{source_id}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `api/set/key` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.SplitIdentityRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.SetupCreateLocationAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `GET api/logs` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST duos/v1/locations` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.rdis.RdisOperationsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BLESetupProvisioning` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.SubscriptionCycle` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.wifi.AccessPoints` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/smart_video_descriptions/summarize` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.ShowDialogAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.video.VideoNetworkTypeBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.video.live.LiveViewCommandPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.EnrollmentImageAttributes` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorCloudMediaMetadataResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.Bounds` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.EntitlementResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.trial.SubscriptionTrial` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.Meta` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.immediasemi.blink.account.phone.AddPhoneNumberPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.GetFirmwareEndpointResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.UpdateSystemNameBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **serialization-converter:** `v1/shared_login/revoke` — No unique source-evidenced converter policy was recovered for this API binding.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.RdisRelationshipLinks` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v4/clients/{injected_client_id}/pin/verify` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `system/config/reg_domain` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST v4/accounts/{injected_account_id}/media` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v2/clients/{injected_client_id}/tiv_unlock/request_pin` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{camera}/accessories/{accessoryType}/{accessoryId}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **serialization-converter:** `v4/users/pin/resend` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.HomeScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.PanTiltAccessoryConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.account.alexa.AlexaLinkStatus` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.FontIcon` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.Network` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `PUT duos/v1/devices/{deviceId}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorMediaTrack` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.NetworkConfigGetResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.blueprints.setup.core.data.ApiAccessPoint` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.scheduling.Program` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/identities/{id}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorSupplementalDataResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.RdisRelationship` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.AddLotusResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.TextRange` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/commands/{command}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.LightAccessory` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.TutorialImage` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/change_mode` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.donation.api.DonationTranscoding` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.TrackingEvent` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/swap_pair` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.IpConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ScreenNavigationType` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.HomeScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.SubmitVerificationRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.RegionConfigPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET apphelp.immedia-semi.com/link-manifest.json` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.models.CameraConfigInfo` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.MoveEnrollmentImagesData` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.adddevice.lotus.chime.ChimeType` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/status` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/owls/add` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/clients/{injected_client_id}/password_change/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.models.LightStatus` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.privacy.TivLockStatus@unresolved` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.PutLocationRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorVisualizationsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.IdentityResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.NavigateUrlAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.NotificationPreferencesResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.auth.AuthenticationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.CellList` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorEventSimilarityResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `POST v5/clients/{injected_client_id}/phone_number_change` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST 1.0.0/event/client.device/{appSubGroup}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET api/version` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v2/notification` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/list` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.account.auth.ValidateEmailPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `PUT duos/v1/devices/{deviceId}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.models.DeviceStatus` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ChangeWifiIdentification` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.SetupCreateLocationAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.common.account.GrantedAuthorization` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `evm/v2/history/events/{eventId}` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.account.TierInfo` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v4/users/password_change/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET setups/{setupId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.TemperatureCalibrationPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.PanTiltAccessory` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.camera.zone.api.AdvancedCameraZones` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/clients/{injected_client_id}/options` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.SetupPropertyKey` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.UpdateLocationRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.Network` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.PostSetupAlexaSkillAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorLocalMediaMetadataResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.Data` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.immediasemi.blink.settings.access.accept.CheckAuthorizationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET sos/v1/factory_profile` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.models.AddCameraResponseBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v2/accounts/{injected_account_id}/networks/{networkId}/cameras/{camera}/light_accessories/{accessoryId}/lights/{lightControl}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorLocalMediaMetadataResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `@Url` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.SosSetupResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.LotusConfigInfo` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.delete.DeleteAccountBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.Client` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.RdisRelationshipLinks` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.LocationPredictionResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/identity/token` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorDetectionDetail` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.WrongPinErrorScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.network.BulkLocationAssignmentRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorMediaTrack` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.Included` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.device.network.command.SupervisorKommand` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/delete/{clipId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v2/clients/{injected_client_id}/tiv_unlock/pin/resend` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.IconSource` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.AccessHomescreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorCvResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.sharedlogin.model.PostSharedLoginResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/enable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisRelationshipRef` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.account.phone.AddPhoneNumberPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/identity/token` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/power_test` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET device_info/v4/devices/{deviceId}/status` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.UpdateCameraBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BLESetupWifiSelectionListScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.DescriptionArea` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.SubscriptionPlansResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.SubmitVerificationRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **serialization-converter:** `v1/users/authenticate_password` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST v1/events/app` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v1/subscriptions/plans/renew_trial` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.PairCameraBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.RebootRequiredScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.db.enums.AccessStatus` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{lotus_id}/snooze` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.CountryResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/shared/invitations/{invitationId}/accept` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v1/devices` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `v1/shared/check_authorization` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorDetectionDetail` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/users/countries/update` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/commands/{command}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.media.BackendMedia` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.LocationAddressBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.passkey.RegistrationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.access.accept.AcceptInvitationBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `system/prov/ap_list` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `PATCH devices/v1/devices/{deviceId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST sos/v1/setups` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.scheduling.Program` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.TextButton` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.scheduling.UpdateProgramRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisEnabled` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.client.ClientUpdatePostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/clients/{injected_client_id}/options` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST api/set/key` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorPropertiesResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.db.EventDataKey` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.VPNDisableScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.TextAttribute` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.PostSetupSearchPartyAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.TypographyToken` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.account.auth.AuthenticatePasswordBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.RightImageFlatCell` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.MediaContent` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/change_wifi` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.SmartVideoDescriptionsPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.MainButton` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ContentMode` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.SubscriptionHomeScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisDevicesResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorPotentialGapResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.NetworkClientConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST evm/v2/events/watch` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v4/clients/{injected_client_id}/email_change/pin/resend` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.subtype.TagDetailsNetwork` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.TextInputValidationRule` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `DELETE evm/v2/dings` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisRelationship` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/enable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.RdisRelationshipData` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.UpdateCameraBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.IconGlyph` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.IdentifyDeviceResponseApiModel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **serialization-converter:** `evm/v2/history/devices` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `api/version` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-reference:** `com.immediasemi.blink.models.VIDEO_DESTINATION` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `PATCH v1/shared/authorizations/{authorizationId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorBatchRequestBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v4/accounts/{injected_account_id}/media/favorite` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `GET accounts/{injected_account_id}/networks/{network}/commands/{command}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.CountryBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.GeneratePinPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.SvdDeviceUpdate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `setups/{setupId}` — No unique source-evidenced converter policy was recovered for this API binding.
- **parameter-wire-name:** `HardwareID.KEY_HARDWARE_ID` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.ring.reapp.models.SafeString` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.privacy.TivLockBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.ProcessingInfo` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.GeneratePinResponse@snake_case` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `ees/v2/history/extendedsearchmetadata` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/enable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/system_offline/{network}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/calibrate` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.media.AiVideoDescription` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.auth.ValidationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v4/clients/{injected_client_id}/password_change/pin/generate` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.settings.account.managedata.SubmitDataRequestResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.auth.AuthenticationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.Camera` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.CheckableIcon` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.DoorbellsV3` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.AccessoryConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.library.video.event.model.DetectionType` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/cameras/{camera}/{type}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.account.option.AccountOptionsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `PATCH duos/v1/locations/{locationId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.media.MediaResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `devices/v2/locations` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.settings.account.alexa.AlexaLinkingAuthorizeResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.notifications.sea.SeaDevice` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET geocoding/v1/auto-complete/details` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.TutorialTemplate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.AddLotusResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.account.auth.AuthenticatePasswordBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.Subscription` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.donation.api.UnprocessedDonationEvent` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `DELETE v1/subscriptions/plans/cancel_trial` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.Accessory` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.rdis.RdisZone` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/subscriptions/plans/cancel_trial` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisDevice` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `PATCH duos/v1/locations/{locationId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/clients/{injected_client_id}/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.EntitlementResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.subtype.SubtypeBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.wired.AddOwlResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/subscriptions/plans/{subscriptionId}/attach` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.Attributes` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.immediasemi.blink.db.enums.AccessStatus` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.setting.linkdevice.data.model.LinkObject` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.MergeIdentitiesMeta` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.auth.Auth` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `users/delete` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.account.AccessAuthorization` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.network.command.CameraActionKommand` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/accessories/add` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.account.option.AccountOptionsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.delete.DeleteAccountBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `DELETE v1/identities/{id}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.VerifyPinBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.blueprints.setup.core.data.ApiNetwork` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET ees/v2/history/extendedsearchmetadata` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.MoveEnrollmentImagesRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BLESetupModeEnterSetupModeScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.SosSetupPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `POST v6/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/liveview` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.ChangeWifiIdentificationWithPin` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.media.UnusualActivity` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET evm/v3/history/devices` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.duos.DeviceUpdatePayload` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ColorToken` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.immediasemi.blink.video.clip.media.Filters` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.immediasemi.blink.common.account.AccessInvitation` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.CantFindNetworkButterbar` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.CellCheckableConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v2/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/liveview` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.blueprints.setup.core.data.entity.DeviceFirmwareResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET system/prov/ap_list` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.rdis.RdisDeviceSettingsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.HttpMethod` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `POST oauth/v2/verify_otp` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST evm/v3/history/events` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST system/config/network` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.duos.DeviceBulkUpdateRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.db.enums.EntitlementStatus` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.OwlsV3` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.url.LinkManifest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `1.0.0/event/client.device/{appSubGroup}` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.SimpleCheckableIcon` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.Orchestrator24x7TimeSlotResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/countries` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `devices/{deviceId}` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `duos/v1/locations/{locationId}` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `GET @Url` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE devices/v1/devices/{deviceId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.MainButtonStyle` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `factory_profile` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorFootageMetadataResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.SplitIdentityAttributes` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ImageContentMode` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.DescriptionAreaActionButton` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.db.enums.AccessTarget` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v2/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.LocationBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `@Url` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.TrackingEvent` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.RdisDeviceAttributes` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.access.SendInviteBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `api/ssids` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{network}/programs` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.home.additionaltrial.AdditionalTrialBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.flag.FeatureFlagsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v4/clients/{injected_client_id}/email_change/pin/resend` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.account.Account@unresolved` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.LocationByIpResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.moment.SummarizeClipsRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.immediasemi.blink.models.CONDITION_TYPE` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.immediasemi.blink.db.EventName` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.OwlAddBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ToolbarItem` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.DeviceLimits` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.auth.RegisterBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.blueprints.setup.core.data.backend.ApiSetup` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST oauth/token` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.library.video.event.model.DetectionType` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/subscriptions/link/unlink_account` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.SosDeviceSetupStatusResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v4/users/pin/resend` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `@Url` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `v1/users/preferences` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.VerificationChannel@snake_case` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `@Url` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-reference:** `com.ring.blueprints.setup.core.data.Wireless` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.ring.reapp.models.ImageCard` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `PUT duos/v1/devices/{deviceId}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.rdis.RdisOperation` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST evm/v2/history/extendedsearch` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `ProcessNotification.KEY_COMMAND` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-reference:** `com.ring.blueprints.setup.core.data.Ip` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.immediasemi.blink.device.wifi.GetFwVersionResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.Subscription` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.PinCodeIdentification` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v4/clients/{injected_client_id}/email_change/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.CalloutCard` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.MoveEnrollmentImagesRelationships` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.RichErrorDeviceListModel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.client.option.ClientOptionsBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.blueprint.model.BlueprintContext` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/add` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/cameras/add` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.Data` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.RegionWireless` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.VerificationChannel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorCloudMediaResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.notifications.sea.SingleEventAlertsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_COMMAND` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.ring.reapp.models.IconValueCell` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ConnectionType` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_COMMAND` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.LogsBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/state/{type}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.device.setting.linkdevice.data.model.DeviceLinksResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.auth.TokenUpgradePostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.common.device.duos.DetectionTypes` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET regions` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.blueprints.setup.core.data.DeviceLocale` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.DescriptionAreaMainIconSize` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorGroupResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.VerifyPinResponse@unresolved` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.passkey.VerifyRegistrationRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST @Url` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.ShowDeviceOTAUpdateAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.GetClientsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ImageUrl` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/subscriptions/link/link_account` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{lotus_id}/unsnooze` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.TerminateOnboardingBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.LensFootageResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v5/clients/{injected_client_id}/phone_number_change/pin/verify` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.models.OwlConfigInfo` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.AccessMessage` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorExtendedSearchRequestBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/shared_login/claim` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/feature_flags/enabled` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.Setup` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST clients/{injected_client_id}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.CountryBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.SafeString` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/temp_alert_enable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.notifications.sea.SeaDeviceUpdate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.network.BulkLocationAssignmentResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.donation.api.BatchDonationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v5/clients/{injected_client_id}/client_verification/pin/resend` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST app/logs/upload` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.NotificationPreferencesResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.WatchEventsRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.RdisDeviceResource` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.sharedlogin.model.RevokeSharedLoginBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorCloudMediaVisualizationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.VideoNetworksConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.SafeComponent` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/alexa/link` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET geocoding/v1/ip/info/my` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.BLESetupGenericErrorScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.network.command.PollingResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/ob_cancel` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/shared/summary` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.account.managedata.SubmitDataRequestResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.LocationAddressBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.video.live.LiveViewCommandPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorEventResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `DELETE v1/shared/authorizations/{authorizationId}/remove` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v4/clients/{injected_client_id}/email_change/pin/verify` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.AutoProvisioningLocalisedResources` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST system/config/reg_domain` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/network_type` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `recordings/public/footages/{deviceId}` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `GET api/ssids` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `MapboxMap.QFE_LIMIT` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **parameter-wire-name:** `DeviceType.IDENTIFY_TYPE_DOORBELL` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.utils.SubscriptionRequestStatusBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/clients/{injected_client_id}/control_panel/request_pin` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.RdisRelationshipData` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `location-subtypes` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `v4/clients/{injected_client_id}/password_change` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.SyncModulesV3` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.PhoneVerificationChannel@unresolved` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.identities.EnrollmentImageRef` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/accounts/{injected_account_id}/feature_flags/enabled` — No unique source-evidenced converter policy was recovered for this API binding.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **parameter-wire-name:** `DeviceType.IDENTIFY_TYPE_DOORBELL` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `GET accounts/{injected_account_id}/networks/{network}/commands/{command}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.access.AccessSummary` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.PopToScreenIdAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.LocationEntitlementsBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorFootageMetadataResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/request` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.blueprints.setup.core.data.backend.CompleteSetupBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.rdis.RdisDevicesResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.auth.Auth` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v2/clients/{injected_client_id}/tiv_unlock/pin/resend` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.duos.ChimeVolumeSettings` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/users/tier_info` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v1/users/preferences` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.ButtonModuleModel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.ProgramConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorCloudMediaVisualizationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST duos/v1/locations` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.ConfirmationButtonModule` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `DeviceType.IDENTIFY_TYPE_DOORBELL` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.DescriptionAreaActionButton` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/identities` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.video.clip.media.MediaProfile` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.VideoNetworks` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/state/arm` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.DeviceRegistrationStatus` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/data_request/list` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorLocalMediaVisualizationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.IconSource` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/doorbells/{serial}/token` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.sharedlogin.model.CreateSharedLoginBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.ProgramConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `system/config/network` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.TextInputType` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/notifications/preferences` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.rdis.RdisEnabled` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.device.onboard.OnboardingBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.immediasemi.blink.models.LED_ILLUMINATOR_STATE` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.Phone` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.models.AccessPoint` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.EventTrackingAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.wired.ChimeCamerasResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.ring.reapp.models.LoopedVideoModel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/shared/authorizations/{authorizationId}/remove` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.settings.account.managedata.ThirdPartyAuthorization` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/mount` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE v1/identities/{id}/enrollment-images` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **parameter-wire-name:** `DeviceType.IDENTIFY_TYPE_DOORBELL` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.ring.reapp.models.PostSetupAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.common.country.RegionsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.Orchestrator24x7TimelineResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.SetupPropertyKey` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.VerifyPinBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET geocoding/v1/reverse-geocode` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.rdis.RdisDeviceSettingsIncluded` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_CAMERA` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.ring.reapp.models.AutoSetupProvisioning` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/liveview` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **serialization-converter:** `v1/shared/authorizations/{authorizationId}/revoke` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST v4/users/password_change` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/sync_modules/{serial}/fw_update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.GeneratePinResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.country.RegionsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.Icon` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.sharedlogin.model.PostSharedLoginClaimResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/data_request/dsar/create` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.LocationHomescreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.SignalStrength` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.SafeCellComponent` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.SetSSIDBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **model-field-metadata:** `com.immediasemi.blink.device.network.command.SupervisorKommandWithChildren` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.DeviceIdentification` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v4/accounts/{injected_account_id}/media/unfavorite` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorRadarVisualizationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.privacy.TivLockBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.LogsBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `POST clients_api/setups` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorFeedResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.UpdateNetworkSaveAllLiveViews` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v1/subscriptions/clear_popup/{type}` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.FamiliarFacesUpdate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v2/clients/{injected_client_id}/tiv` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.device.setting.linkdevice.data.model.LinkedDevice` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.utils.GetFirmwareEndpointResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **parameter-wire-name:** `ProcessNotification.KEY_NETWORK` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/doorbells/{serial}/fw_update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.SubscriptionCycle` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.CellInfoButton` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.NavBar` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.subtype.SubtypeData` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.camera.doorbell.CancelOnboardingPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.DeleteMultipleEventsRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.TextInputValidationRule` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.AccessPointListResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.TestLotusDingConfig` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.db.enums.EntitlementReason` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.DeviceRegistrationStatus` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ChangeWifiIdentification` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `duos/v1/locations/{locationId}` — No unique source-evidenced converter policy was recovered for this API binding.
- **parameter-wire-name:** `ProcessNotification.KEY_COMMAND` — Annotation constant could not be uniquely resolved from its qualified declaration or imports.
- **serialization-converter:** `v5/clients/{injected_client_id}/client_verification/pin/verify` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.ButterBarTemplate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET evm/v2/history/events/{eventId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.PutLocationRequest` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.AutoCompleteResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.preference.AccountPreferencesDetails` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.Icon` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST device_info/v4/devices/operations` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ring.reapp.models.ScreenNavigationType` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/subscriptions/request/status/{uuid}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.models.CAMERA_STATUS` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.immediasemi.blink.common.account.auth.ValidationResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.AccessPoint` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.AutoCompleteResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.PostSetupMotionFlowType` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.db.enums.AccessName` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.subtype.LocationSubtypeNetwork` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.aihub.api.RdisRelationships` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/lights/{lightControl}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.AccessTarget` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.blueprint.model.BlueprintResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.sync.HomescreenAccount` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `recordings/public/footages/{deviceId}/delete_all` — No unique source-evidenced converter policy was recovered for this API binding.
- **serialization-converter:** `v1/devices/{id}/configurations` — No unique source-evidenced converter policy was recovered for this API binding.
- **endpoint-behavior:** `POST v5/clients/{injected_client_id}/client_verification/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.scheduling.ScheduleAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.SosSetupResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.ThumbnailVideoModel` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `@Url` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.ring.reapp.models.NavBar` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.ResendClientVerificationCodeResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/data_request/euda/create` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.VerifyPinResponse@snake_case` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorPotentialGapResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.ring.blueprints.setup.core.data.EnterSetupProvisioning` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST evm/v2/events` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.VerificationChannel@unresolved` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST setups` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.settings.privacy.SetTivLockResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `DELETE v1/shared/invitations/{invitationId}/revoke` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.NetworkConfigGetResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST 1.0.0/batch/client.device/{appSubGroup}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.utils.MapLinkBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.SetScreenJsonAction` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/smart_video_descriptions` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.ringapp.orchestratorapi.data.OrchestratorItemsResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET blink/clients_api/links/v1/locations/{locationId}/devices/{deviceId}/links?ignore_rbac=true&include_deactivated=false` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.account.auth.ValidatePasswordPostBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.api.retrofit.TrackingEvents` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.BLESetupModeCheckForSetupModeScreen` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.preference.AccountPreferencesDetails` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.utils.SubscriptionRequestStatusResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.PhoneVerificationChannel@snake_case` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.Command` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.settings.knownfaces.optin.FamiliarFacesUpdate` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.CreateProgramBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `v2/clients/{injected_client_id}/tiv_unlock/pin/verify` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-reference:** `com.immediasemi.blink.models.COMMAND_TYPE` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-metadata:** `com.immediasemi.blink.common.subscription.basic.DeviceEligibilityResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.VerticalButtonModule` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.device.ringsos.ChimeAccessoryConfigInfoResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.account.verification.GeneratePinResponse@unresolved` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.IconValueCellMainIconSize` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.subtype.SubtypeBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.models.UpdateLotusBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.ring.reapp.models.SectionedList` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-reference:** `com.immediasemi.blink.models.Duration` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `GET v1/shared_login` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.home.additionaltrial.AdditionalTrialBody` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `api/ssids` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.models.LightStatus` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/eject` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-metadata:** `com.immediasemi.blink.common.flag.FeatureFlag` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.amazon.rbks.mobile.locations.network.entities.subtype.TagDetailsNetwork` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **model-field-metadata:** `com.immediasemi.blink.common.country.CountriesResponse` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **serialization-converter:** `setups` — No unique source-evidenced converter policy was recovered for this API binding.
- **model-field-metadata:** `com.immediasemi.blink.device.network.BulkLocationAssignment` — Static declarations and serializer evidence do not uniquely establish all field metadata; unknown values are not inferred from Java reference types.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.

## Preserved historical and live evidence

The legacy `docs/blink_api_dossier.md` retains evidence IDs E1–E95 and bounded live-account observations. Those observations are not inputs to this static 59.2 contract and remain explicitly distinguished from APK evidence.
