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

## Recovered endpoint interactions

These records map first-party JADX invocation expressions to each Retrofit declaration. They describe static client construction and local control flow, not captured traffic or guaranteed server behavior.

### POST `2fa/v1/webauthn/registration`

- Endpoint ID: `ep-f1cc2c062e20b8e1`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objStartRegistration. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/passkey/PasskeyCreationUseCaseImpl$invoke$2$registrationResponse$1.java:57` in `PasskeyCreationUseCaseImpl$invoke$2$registrationResponse$1.invokeSuspend`: header = `this.$hardwareId`; body = `this.$registrationRequest`; result `assigned:objStartRegistration`

### POST `2fa/v1/webauthn/registration/verify`

- Endpoint ID: `ep-f0ffe088842801ec`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/passkey/PasskeyCreationUseCaseImpl$invoke$2$1.java:51` in `PasskeyCreationUseCaseImpl$invoke$2$1.invokeSuspend`: header = `this.$hardwareId`; body = `this.$verifyRequest`; result `invoked`

### GET `device_info/v4/devices`

- Endpoint ID: `ep-f972ec3ea8b25bb0`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:devices. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/rdis/RdisRepository$getDevices$2.java:61` in `RdisRepository$getDevices$2.invokeSuspend`: query:filter[location] = `this.$locationId`; query:include = `this.this$0.toWireValue(this.$include)`; query:ignore_rbac = `true`; result `assigned:devices`

### GET `device_info/v4/devices/{deviceId}`

- Endpoint ID: `ep-03d3a2b30fcd1660`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:device. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/rdis/RdisRepository$getDevice$2.java:61` in `RdisRepository$getDevice$2.invokeSuspend`: path:deviceId = `this.$deviceId`; query:include = `this.this$0.toWireValue(this.$include)`; query:ignore_rbac = `true`; result `assigned:device`

### POST `device_info/v4/devices/operations`

- Endpoint ID: `ep-c96f4a50db7fc888`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostOperations. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/rdis/RdisRepository$postOperations$2.java:55` in `RdisRepository$postOperations$2.invokeSuspend`: body = `this.$body`; query:ignore_rbac = `true`; result `assigned:objPostOperations`

### PUT `duos/v1/devices/{deviceId}/update`

- Endpoint ID: `ep-74888d2639b38e5d`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:0. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/duos/C8535x87841fe5.java:59` in `C8535x87841fe5.invokeSuspend`: path:deviceId = `j`; body = `new DeviceEntityUpdateRequest(new DeviceSettings((ChimeVolumeSettings) null, generalSettings, i2, (DefaultConstructorMarker) (0 == true ? 1 : 0)))`; result `assigned:0`
  - `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceRepository$updateDeviceLedStatus$2.java:58` in `DeviceUpdateOrchestrationServiceRepository$updateDeviceLedStatus$2.invokeSuspend`: path:deviceId = `j`; body = `new DeviceEntityUpdateRequest(new DeviceSettings((ChimeVolumeSettings) null, generalSettings, i2, (DefaultConstructorMarker) (0 == true ? 1 : 0)))`; result `assigned:0`
  - `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceRepository$updateVolume$2.java:54` in `DeviceUpdateOrchestrationServiceRepository$updateVolume$2.invokeSuspend`: path:deviceId = `this.$deviceId`; body = `new DeviceEntityUpdateRequest(new DeviceSettings(new ChimeVolumeSettings(this.$volume), generalSettings, 2, (DefaultConstructorMarker) (0 == true ? 1 : 0)))`; result `assigned:0`

### PUT `duos/v1/devices/{deviceId}/update`

- Endpoint ID: `ep-c04ae07fe7c7d3ca`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/duos/C8537x77737957.java:58` in `C8537x77737957.invokeSuspend`: path:deviceId = `j`; body = `new DeviceMotionSettingsUpdateRequest(new DeviceMotionSettingsEntity(duosMotionSettingsPayload, cvSettings))`; result `invoked`
  - `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceRepository$updateMotionSettings$2.java:57` in `DeviceUpdateOrchestrationServiceRepository$updateMotionSettings$2.invokeSuspend`: path:deviceId = `j`; body = `new DeviceMotionSettingsUpdateRequest(new DeviceMotionSettingsEntity(duosMotionSettingsPayload, cvSettings))`; result `invoked`

### PUT `duos/v1/devices/{deviceId}/update`

- Endpoint ID: `ep-a90401dad12cecb1`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/duos/C8539xc438d689.java:54` in `C8539xc438d689.invokeSuspend`: path:deviceId = `this.$deviceId`; body = `new DevicePrivacySettingsUpdateRequest(this.$privacySettings)`; result `invoked`
  - `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceRepository$updatePrivacySettings$2.java:53` in `DeviceUpdateOrchestrationServiceRepository$updatePrivacySettings$2.invokeSuspend`: path:deviceId = `this.$deviceId`; body = `new DevicePrivacySettingsUpdateRequest(this.$privacySettings)`; result `invoked`

### PUT `duos/v1/devices/update`

- Endpoint ID: `ep-cd7f0e278e74ad98`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objUpdateDevices. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceRepository$updateMetadata$2.java:58` in `DeviceUpdateOrchestrationServiceRepository$updateMetadata$2.invokeSuspend`: body = `new DeviceBulkUpdateRequest(this.$deviceIds, new DeviceUpdatePayload(this.$metadata))`; result `assigned:objUpdateDevices`

### GET `v1/devices`

- Endpoint ID: `ep-b81957c6cc628f33`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### PATCH `v1/devices/{id}/configurations`

- Endpoint ID: `ep-282824d91be8c136`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/knownfaces/optin/UpdateDevicesUseCase$invoke$2.java:51` in `UpdateDevicesUseCase$invoke$2.invokeSuspend`: path:id = `this.$deviceId`; body = `this.$request`; result `invoked`

### POST `1.0.0/batch/client.device/{appSubGroup}`

- Endpoint ID: `ep-93dc7a0490341891`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### POST `1.0.0/event/client.device/{appSubGroup}`

- Endpoint ID: `ep-637f0ac057ee55c2`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### GET `api/get_fw_version`

- Endpoint ID: `ep-4df3ae1b9233f2b0`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:obj. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/AddDeviceViewModel.java:1764` in `AddDeviceViewModel.invokeSuspend`: no wire arguments; result `assigned:obj`

### GET `api/get_fw_version`

- Endpoint ID: `ep-452a1d20e59bba34`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:fwVersion. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/wifi/WifiRepository$getFirmwareVersion$2$1.java:52` in `WifiRepository$getFirmwareVersion$2$1.invokeSuspend`: no wire arguments; result `assigned:fwVersion`

### GET `api/logs`

- Endpoint ID: `ep-010a3b387cbd9d8a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:r8. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/activities/onboarding/OnboardingCoroutines.java:144` in `OnboardingCoroutines.invokeSuspend`: no wire arguments; result `assigned:r8`

### POST `api/set/app_fw_update`

- Endpoint ID: `ep-f32cd9976cebe469`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### POST `api/set/key`

- Endpoint ID: `ep-0d2282527e42ad50`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/AddDeviceViewModel$sendKeyToSm$1$1.java:54` in `AddDeviceViewModel$sendKeyToSm$1$1.invokeSuspend`: body = `this.$body`; result `invoked`
  - `com/immediasemi/blink/device/wifi/WifiRepository$setKey$2$1.java:50` in `WifiRepository$setKey$2$1.invokeSuspend`: body = `this.$body`; result `invoked`

### POST `api/set/ssid`

- Endpoint ID: `ep-f6532c70467c43a2`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:r9. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/activities/onboarding/OnboardingCoroutines.java:330` in `OnboardingCoroutines.invokeSuspend`: header = `r1`; body = `r6`; result `assigned:r9`

### GET `api/ssids`

- Endpoint ID: `ep-88ca48d5f99d9a00`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:obj. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/AddDeviceViewModel.java:1954` in `AddDeviceViewModel.invokeSuspend`: no wire arguments; result `assigned:obj`

### GET `api/ssids`

- Endpoint ID: `ep-53a3a41da78c0ec5`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:ssids. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/wifi/WifiRepository$getSsids$2$1.java:52` in `WifiRepository$getSsids$2$1.invokeSuspend`: no wire arguments; result `assigned:ssids`

### GET `api/version`

- Endpoint ID: `ep-6f09f2d2e5c2203d`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### POST `oauth/token`

- Endpoint ID: `ep-ea151770480abcff`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### POST `oauth/token`

- Endpoint ID: `ep-7765345c3fed989c`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### POST `oauth/v2/verify_otp`

- Endpoint ID: `ep-b9d866a57094e9fd`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### GET `apphelp.immedia-semi.com/link-manifest.json`

- Endpoint ID: `ep-8d759f6cb045296f`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:linkManifest. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/url/UrlRepository.java:140` in `UrlRepository.invokeSuspend`: no wire arguments; result `assigned:linkManifest`

### GET `regions`

- Endpoint ID: `ep-88b7c31d1e78c686`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:regions. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/country/CountryRepository$getRegions$2.java:53` in `CountryRepository$getRegions$2.invokeSuspend`: no wire arguments; result `assigned:regions`

### GET `v1/countries`

- Endpoint ID: `ep-a0add9c16178cc61`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:countries. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/country/CountryRepository$getCountriesAvailable$2.java:53` in `CountryRepository$getCountriesAvailable$2.invokeSuspend`: no wire arguments; result `assigned:countries`

### GET `v1/version`

- Endpoint ID: `ep-3a4b4e53cf35d57b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:appVersionCheck. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/update/AppUpdateRequiredUseCase.java:109` in `AppUpdateRequiredUseCase.invokeSuspend`: no wire arguments; result `assigned:appVersionCheck`

### POST `v3/users/validate_email`

- Endpoint ID: `ep-ac44a5941324c672`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostValidateEmail. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/common/account/auth/ValidateEmailUseCase$invoke$2.java:90` in `ValidateEmailUseCase$invoke$2.invokeSuspend`: body = `new ValidateEmailPostBody(this.$email)`; result `assigned:objPostValidateEmail`
  - `com/immediasemi/blink/settings/email/EmailChangeRepository$changeEmail$2.java:58` in `EmailChangeRepository$changeEmail$2.invokeSuspend`: body = `new ValidateEmailPostBody(this.$email)`; result `assigned:objPostValidateEmail`

### POST `v3/users/validate_password`

- Endpoint ID: `ep-a47b3b19ece40485`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostValidatePassword. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/common/account/auth/ValidatePasswordUseCase.java:108` in `ValidatePasswordUseCase.invokeSuspend`: body = `new ValidatePasswordPostBody(this.$password)`; result `assigned:objPostValidatePassword`
  - `com/immediasemi/blink/settings/password/ChangePasswordFragment.java:502` in `ChangePasswordFragment.invokeSuspend`: body = `new ValidatePasswordPostBody(this.$passwordText)`; result `assigned:objPostValidatePassword`
  - `com/immediasemi/blink/settings/password/ChangePasswordFragment.java:633` in `ChangePasswordFragment.invokeSuspend`: body = `new ValidatePasswordPostBody(this.$password)`; result `assigned:objPostValidatePassword`

### POST `v4/users/password_change`

- Endpoint ID: `ep-c77b141b83a62f9b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/account/password/PasswordResetRepository$resetPassword$2.java:58` in `PasswordResetRepository$resetPassword$2.invokeSuspend`: body = `new ResetPasswordPostBody(this.$token, this.$password, this.$email, BuildUtils.INSTANCE.getDeviceId(), ViewExtensionsKt.getClientName(this.this$0.app), false, 32, (DefaultConstructorMarker) null)`; result `invoked`
  - `com/immediasemi/blink/settings/password/C12060xb76681df.java:52` in `C12060xb76681df.invokeSuspend`: body = `this.$resetBody`; result `invoked`
  - `com/immediasemi/blink/settings/password/ChangePasswordFragment$changePassword$1$changePasswordObservable$2.java:51` in `ChangePasswordFragment$changePassword$1$changePasswordObservable$2.invokeSuspend`: body = `this.$resetBody`; result `invoked`

### POST `v4/users/password_change/pin/generate`

- Endpoint ID: `ep-2d26378dc39c7453`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostPasswordResetPinGenerate. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/account/password/PasswordResetRepository$generatePin$2.java:61` in `PasswordResetRepository$generatePin$2.invokeSuspend`: body = `new GeneratePinPostBody(this.$email, BuildUtils.INSTANCE.getDeviceId(), ViewExtensionsKt.getClientName(this.this$0.app))`; result `assigned:objPostPasswordResetPinGenerate`

### POST `v4/users/password_change/pin/verify`

- Endpoint ID: `ep-77efb920f7d0e378`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostPasswordResetPinVerify. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/account/password/PasswordResetRepository$verifyPin$2.java:63` in `PasswordResetRepository$verifyPin$2.invokeSuspend`: body = `new VerifyPinPostBody(this.$pin, this.$email, BuildUtils.INSTANCE.getDeviceId(), ViewExtensionsKt.getClientName(this.this$0.app))`; result `assigned:objPostPasswordResetPinVerify`

### POST `v7/users/register`

- Endpoint ID: `ep-b6ab8da19a914e17`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostRegister. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/account/registration/CreateAccountUseCase$invoke$2.java:689` in `CreateAccountUseCase$invoke$2.invokeSuspend`: body = `this.$body`; result `assigned:objPostRegister`

### GET `@Url`

- Endpoint ID: `ep-5ca401830a820988`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objDownloadImage. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/knownfaces/image/FaceImageCachingService$downloadAndCache$response$1.java:57` in `FaceImageCachingService$downloadAndCache$response$1.invokeSuspend`: url = `this.$imageUrl`; result `assigned:objDownloadImage`

### GET `@Url`

- Endpoint ID: `ep-0b5de0b2e0bd8c22`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objDownload. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/video/EvmVideoRepository.java:475` in `EvmVideoRepository.invokeSuspend`: url = `this.$url`; result `assigned:objDownload`

### GET `@Url`

- Endpoint ID: `ep-8260b31370be6ee6`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:video. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/C11275x444f5c02.java:58` in `C11275x444f5c02.invokeSuspend`: url = `this.$url`; result `assigned:video`
  - `com/immediasemi/blink/settings/SmartVideoDescriptionsRepository$downloadAnimatedNotificationVideo$2.java:57` in `SmartVideoDescriptionsRepository$downloadAnimatedNotificationVideo$2.invokeSuspend`: url = `this.$url`; result `assigned:video`
  - `com/immediasemi/blink/video/BlinkVideoRepository$getVideo$2.java:155` in `BlinkVideoRepository$getVideo$2.invokeSuspend`: url = `this.$address`; result `assigned:video`

### GET `@Url`

- Endpoint ID: `ep-0a5de74da657d9af`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ring/blueprints/setup/core/service/HttpFirmwareApiService.java:37` in `HttpFirmwareApiService.decompiled-block`: url = `this.baseUrl + "/system/prov/ap_list"`; result `assigned:responseExecute`

### GET `@Url`

- Endpoint ID: `ep-31fad8a6c2bac213`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ring/blueprints/setup/core/service/HttpFirmwareApiService.java:101` in `HttpFirmwareApiService.decompiled-block`: url = `this.baseUrl + "/e2ee/certificate"`; result `assigned:responseExecute`

### GET `@Url`

- Endpoint ID: `ep-ceb7f8c239784a1a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ring/blueprints/setup/core/service/HttpFirmwareApiService.java:132` in `HttpFirmwareApiService.decompiled-block`: url = `this.baseUrl + "/e2ee/status"`; result `assigned:responseExecute`

### GET `@Url`

- Endpoint ID: `ep-591a790484b2b086`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ring/blueprints/setup/core/service/HttpFirmwareApiService.java:77` in `HttpFirmwareApiService.decompiled-block`: url = `this.baseUrl + "/system/config/network"`; header:X-User-Locale = `userLocale`; result `assigned:responseExecute`

### GET `@Url`

- Endpoint ID: `ep-fd36e3adb2f62216`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:obj2. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`
- Direct call sites:
  - `com/ring/reapp/blueprint/client/BlueprintServiceClient.java:211` in `BlueprintServiceClient.execute`: url = `strTrimStart`; result `assigned:obj2`

### POST `@Url`

- Endpoint ID: `ep-05af14355dabdaf8`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ring/blueprints/setup/core/service/HttpFirmwareApiService.java:91` in `HttpFirmwareApiService.decompiled-block`: url = `this.baseUrl + "/system/config/app_info"`; body = `deviceLocale`; result `assigned:responseExecute`

### POST `@Url`

- Endpoint ID: `ep-b40bed30ea09ff3a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:charset. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ring/blueprints/setup/core/service/HttpFirmwareApiService.java:122` in `HttpFirmwareApiService.decompiled-block`: url = `this.baseUrl + "/e2ee/certificate"`; body = `RequestBody.INSTANCE.create(e2eeData, MediaType.INSTANCE.parse("application/json; charset=utf-8"))`; result `assigned:charset`
  - `com/ring/blueprints/setup/core/service/HttpFirmwareApiService.java:144` in `HttpFirmwareApiService.decompiled-block`: url = `this.baseUrl + "/e2ee/enrollment"`; body = `RequestBody.INSTANCE.create(enrollementPackage, MediaType.INSTANCE.parse("application/json; charset=utf-8"))`; result `assigned:charset`

### POST `@Url`

- Endpoint ID: `ep-b92bf60320be42de`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### POST `@Url`

- Endpoint ID: `ep-49018adaad6613a1`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ring/blueprints/setup/core/service/HttpFirmwareApiService.java:51` in `HttpFirmwareApiService.decompiled-block`: url = `this.baseUrl + "/system/config/network"`; body = `network`; result `assigned:responseExecute`

### POST `@Url`

- Endpoint ID: `ep-fd5bf1e806401f3d`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ring/blueprints/setup/core/service/HttpFirmwareApiService.java:65` in `HttpFirmwareApiService.decompiled-block`: url = `this.baseUrl + "/system/config/reg_domain"`; body = `network`; result `assigned:responseExecute`

### POST `@Url`

- Endpoint ID: `ep-06c2a96337a453fb`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPost, assigned:objPost2. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`
- Direct call sites:
  - `com/ring/reapp/blueprint/client/BlueprintServiceClient.java:191` in `BlueprintServiceClient.execute`: url = `strTrimStart`; body = `jsonObject`; result `assigned:objPost`
  - `com/ring/reapp/blueprint/client/BlueprintServiceClient.java:229` in `BlueprintServiceClient.execute`: url = `strTrimStart`; body = `jsonObject`; result `assigned:objPost2`

### POST `app/logs/upload`

- Endpoint ID: `ep-5253f5ecdea37346`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute, invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/sync/LiveViewLogsWorker.java:120` in `LiveViewLogsWorker.writeLogToCache`: body = `logsBody`; result `assigned:responseExecute`
  - `com/immediasemi/blink/utils/SyncManager.java:2328` in `SyncManager.invokeSuspend`: body = `this.$deviceLogBody`; result `invoked`

### GET `blink/clients_api/links/v1/locations/{locationId}/devices/{deviceId}/links?ignore_rbac=true&include_deactivated=false`

- Endpoint ID: `ep-20e6c29f2fcaa8c9`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:deviceLinks. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/setting/linkdevice/data/LinkDeviceRepository$getDeviceLinks$2.java:60` in `LinkDeviceRepository$getDeviceLinks$2.invokeSuspend`: path:locationId = `this.$locationId`; path:deviceId = `this.$deviceId`; query:inbound = `this.$inbound`; result `assigned:deviceLinks`

### DELETE `blink/clients_api/links/v1/locations/{locationId}/devices/{deviceId}/links/{linkId}?ignore_rbac=true&include_deactivated=false`

- Endpoint ID: `ep-cdb9d5ad5131eb4f`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/setting/linkdevice/data/LinkDeviceRepository$deleteLink$2.java:53` in `LinkDeviceRepository$deleteLink$2.invokeSuspend`: path:locationId = `this.$locationId`; path:deviceId = `this.$hostDeviceId`; path:linkId = `this.$linkId`; result `invoked`

### POST `blink/clients_api/links/v1/locations/{locationId}/events/{event}/receivers?ignore_rbac=true&include_deactivated=false`

- Endpoint ID: `ep-31678cfb0735cf10`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objCreateLink. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/setting/linkdevice/data/LinkDeviceRepository$createLink$2.java:62` in `LinkDeviceRepository$createLink$2.invokeSuspend`: path:locationId = `this.$locationId`; path:event = `this.$event.getValue()`; body = `this.$request`; result `assigned:objCreateLink`

### POST `clients_api/setups`

- Endpoint ID: `ep-5144bc733880cc21`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostStartSetup. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceRepository$startSetup$2.java:103` in `SetupOrchestrationServiceRepository$startSetup$2.invokeSuspend`: body = `companion.invoke(str, ((Number) objFirst).longValue(), this.$networkId, this.$deviceKind, this.$deviceName, this.$setupType, this.$locationId)`; result `assigned:objPostStartSetup`

### GET `clients_api/setups/{setupId}`

- Endpoint ID: `ep-39fcb94457c618bb`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:setupStatus. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceRepository$getSetupStatus$2.java:55` in `SetupOrchestrationServiceRepository$getSetupStatus$2.invokeSuspend`: path:setupId = `this.$id`; result `assigned:setupStatus`

### POST `clients/{injected_client_id}/update`

- Endpoint ID: `ep-75550031d54ff8e7`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked, assigned:r10. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/account/client/UpdateClientUseCase$invoke$2.java:82` in `UpdateClientUseCase$invoke$2.invoke`: body = `new com.immediasemi.blink.common.account.client.ClientUpdatePostBody(r5, r11, r2, r6)`; result `invoked`
  - `com/immediasemi/blink/common/account/client/UpdateClientUseCase$invoke$2.java:171` in `UpdateClientUseCase$invoke$2.invokeSuspend`: body = `r7`; result `assigned:r10`

### GET `device_info/v4/devices/{deviceId}`

- Endpoint ID: `ep-83642d2e457f2cf0`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:deviceConfig. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceRepository$getDeviceConfig$2.java:62` in `SetupOrchestrationServiceRepository$getDeviceConfig$2.invokeSuspend`: path:deviceId = `this.$deviceId`; query:ignore_rbac = `this.$ignoreRbac`; query:include = `this.$include`; result `assigned:deviceConfig`

### GET `device_info/v4/devices/{deviceId}/configurations`

- Endpoint ID: `ep-5dd831f0665ddca8`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### GET `device_info/v4/devices/{deviceId}/status`

- Endpoint ID: `ep-696c69b8cddf4733`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### PATCH `devices/{deviceId}`

- Endpoint ID: `ep-ccb881924e7676d9`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/ring/blueprints/setup/core/data/backend/RingModularSetupCommandsApi.java:106` in `RingModularSetupCommandsApi.enterSetup`: path:deviceId = `j`; body = `jsonRequestBody`; result `invoked`

### DELETE `devices/v1/devices/{deviceId}`

- Endpoint ID: `ep-faf4cb5e3ab2f533`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceRepository$deleteDevice$2.java:49` in `SetupOrchestrationServiceRepository$deleteDevice$2.invokeSuspend`: path:deviceId = `this.$deviceId`; result `invoked`

### PATCH `devices/v1/devices/{deviceId}`

- Endpoint ID: `ep-de004534b34e0ac8`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/registry/DeviceRegistryRepository$patch$2.java:51` in `DeviceRegistryRepository$patch$2.invokeSuspend`: path:deviceId = `this.$deviceId`; body = `this.$body`; query:ignore_rbac = `true`; result `invoked`

### PATCH `devices/v1/devices/{deviceId}`

- Endpoint ID: `ep-e298841e00ef59a2`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceRepository$saveUpdatedConfig$2.java:51` in `SetupOrchestrationServiceRepository$saveUpdatedConfig$2.invokeSuspend`: path:deviceId = `this.$deviceId`; body = `this.$body`; result `invoked`

### GET `devices/v2/locations`

- Endpoint ID: `ep-7f08b21879b053c2`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: returned. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/immediasemi/blink/location/api/LocationsCoreApiAdapter.java:88` in `LocationsCoreApiAdapter.getLocationsV1`: no wire arguments; result `returned`

### DELETE `dings/{dingId}`

- Endpoint ID: `ep-e3900c6446780092`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:163` in `RingOrchestratorEventsRepository.query`: path:dingId = `dingId`; query:confirm_delete_favorite = `isForceDeleteFavorite`; result `assigned:responseExecute`

### DELETE `dings/{dingId}/favorite`

- Endpoint ID: `ep-ebc9d6a75823b700`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:181` in `RingOrchestratorEventsRepository.query`: path:dingId = `dingId`; result `assigned:responseExecute`

### PUT `dings/{dingId}/favorite`

- Endpoint ID: `ep-daa17d61654bd48c`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:172` in `RingOrchestratorEventsRepository.query`: path:dingId = `dingId`; result `assigned:responseExecute`

### POST `duos/v1/locations`

- Endpoint ID: `ep-4431dae15d6a57a9`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: returned. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/immediasemi/blink/location/api/LocationsCoreApiAdapter.java:77` in `LocationsCoreApiAdapter.invokeSuspend`: body = `null`; result `returned`

### POST `duos/v1/locations`

- Endpoint ID: `ep-64bfbdd0b4ecb8d2`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostLocationRaw. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/location/api/LocationsCoreApiAdapter.java:135` in `LocationsCoreApiAdapter.postLocation`: body = `putLocationRequest`; result `assigned:objPostLocationRaw`

### DELETE `duos/v1/locations/{locationId}`

- Endpoint ID: `ep-c53f87f5f2c81022`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: returned. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/immediasemi/blink/location/api/LocationsCoreApiAdapter.java:83` in `LocationsCoreApiAdapter.deleteLocation`: path:locationId = `str`; result `returned`

### PATCH `duos/v1/locations/{locationId}`

- Endpoint ID: `ep-b8d2b74197398d94`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: returned. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/immediasemi/blink/location/api/LocationsCoreApiAdapter.java:55` in `LocationsCoreApiAdapter.invokeSuspend`: path:locationId = `null`; body = `null`; result `returned`

### PATCH `duos/v1/locations/{locationId}`

- Endpoint ID: `ep-d243ef40709b860a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPatchLocationRaw. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/location/api/LocationsCoreApiAdapter.java:173` in `LocationsCoreApiAdapter.patchLocation`: path:locationId = `str`; body = `updateLocationRequest`; result `assigned:objPatchLocationRaw`

### GET `ees/v2/history/extendedsearchmetadata`

- Endpoint ID: `ep-64c2b023321ac1a7`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### DELETE `evm/v2/dings`

- Endpoint ID: `ep-a4a04697fd64f8ca`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:230` in `RingOrchestratorEventsRepository.query`: query:ding_id[] = `CollectionsKt.listOf(remove.getEventId())`; result `assigned:responseExecute`

### POST `evm/v2/events`

- Endpoint ID: `ep-c34e017595f5abd7`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:240` in `RingOrchestratorEventsRepository.query`: body = `new DeleteMultipleEventsRequest(remove.getEventIds())`; result `assigned:responseExecute`

### DELETE `evm/v2/events/associations/{profile_Id}`

- Endpoint ID: `ep-87157cda318a9332`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:191` in `RingOrchestratorEventsRepository.query`: path:profile_Id = `profileId`; query:event_ids = `RingOrchestratorEventsRepositoryKt.toApiQuery(eventIds)`; result `assigned:responseExecute`

### DELETE `evm/v2/events/time-based-deletion/{source_id}`

- Endpoint ID: `ep-cfab3a834c2bc528`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:223` in `RingOrchestratorEventsRepository.query`: path:source_id = `remove.getDeviceId()`; query:start_timestamp = `MappingCommonsKt.toApiDate(remove.getStartDateTime())`; query:end_timestamp = `MappingCommonsKt.toApiDate(remove.getEndDateTime())`; query:include_favorites = `true`; result `assigned:responseExecute`

### POST `evm/v2/events/watch`

- Endpoint ID: `ep-c90db14561aaab0b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:203` in `RingOrchestratorEventsRepository.query`: body = `new WatchEventsRequest(ArraysKt.toList(eventIds))`; result `assigned:responseExecute`

### GET `evm/v2/history/devices`

- Endpoint ID: `ep-105944fa64dbf51f`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute2. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:294` in `RingOrchestratorEventsRepository.getItems`: header:x-ring-greco-credential-request = `strCreateCredentialRequest2`; query:source_ids = `strDeviceIdsAsApiQuery2`; query:start_time = `apiDate3`; query:end_time = `endDateTime2 != null ? MappingCommonsKt.toApiDate(endDateTime2) : null`; query:event_types = `RingOrchestratorEventsRepositoryKt.eventTypesAsApiQuery(query.getEventTypes())`; query:detection_types = `RingOrchestratorEventsRepositoryKt.detectionTypesAsApiQuery(query.getDetectionTypes())`; query:profiles = `RingOrchestratorEventsRepositoryKt.toApiQuery(query.getProfiles())`; query:favorites_only = `Boolean.valueOf(query.getFavoritesOnly())`; query:capabilities = `RingOrchestratorEventsRepositoryKt.capabilitiesQueryParamsAsApiQuery(query.getQueryParams())`; query = `query.getPageSize()`; query:pagination_key = `query.getPaginationKey()`; result `assigned:responseExecute2`

### GET `evm/v2/history/events/{eventId}`

- Endpoint ID: `ep-8aa2e490ef5f62ee`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:377` in `RingOrchestratorEventsRepository.validateResponseAndTrack`: header:x-ring-greco-credential-request = `this.credentialRequestProvider.createCredentialRequest()`; path:eventId = `query.getEventId()`; result `assigned:responseExecute`

### POST `evm/v2/history/extendedsearch`

- Endpoint ID: `ep-c9985f71fca3ab74`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### GET `evm/v2/history/unwatched/count`

- Endpoint ID: `ep-e8642210a490f20a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:211` in `RingOrchestratorEventsRepository.query`: no wire arguments; result `assigned:responseExecute`

### GET `evm/v2/metadata/history/devices`

- Endpoint ID: `ep-424d62aa686b6dca`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:355` in `RingOrchestratorEventsRepository.getItems`: header:x-ring-greco-credential-request = `this.credentialRequestProvider.createCredentialRequest()`; query:source_ids = `RingOrchestratorEventsRepositoryKt.deviceIdsAsApiQuery(query.getDeviceIds())`; query:start_time = `MappingCommonsKt.toApiDate(query.getStartDateTime())`; query:end_time = `MappingCommonsKt.toApiDate(query.getEndDateTime())`; query:capabilities = `RingOrchestratorEventsRepositoryKt.capabilitiesQueryParamsAsApiQuery(query.getQueryParams())`; query = `query.getPageSize()`; query:pagination_key = `query.getPaginationKey()`; result `assigned:responseExecute`

### GET `evm/v2/timeline/24/devices/{source_id}`

- Endpoint ID: `ep-e8ba26c7108a6ffd`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:495` in `RingOrchestratorEventsRepository.validateResponseAndTrack`: header:x-ring-greco-credential-request = `strCreateCredentialRequest`; path:source_id = `deviceId`; query:start_time = `apiDate`; query:end_time = `apiDate2`; query:visualizations = `strVisualizationsQueryParamsAsApiQuery`; query:event_types = `RingOrchestratorEventsRepositoryKt.toApiQuery(arrayList)`; query:favorites_only = `Boolean.valueOf(query.getFavoritesOnly())`; query:order = `RingOrchestratorEventsRepositoryKt.getValue(query.getOrder())`; query:pagination_key = `query.getPaginationKey()`; result `assigned:responseExecute`

### GET `evm/v2/timeline/devices/{doorbotId}`

- Endpoint ID: `ep-349b578ed1b471c7`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:445` in `RingOrchestratorEventsRepository.validateResponseAndTrack`: header:x-ring-greco-credential-request = `strCreateCredentialRequest`; path:doorbotId = `doorbotId`; query:start_time = `apiDate`; query:end_time = `apiDate2`; query:order = `value`; query = `query.getPageSize()`; query:capabilities = `strCapabilitiesQueryParamsAsApiQuery`; query:pagination_key = `query.getPaginationKey()`; result `assigned:responseExecute`

### GET `evm/v2/timeline/events/eventito/{source_id}`

- Endpoint ID: `ep-8dba0a2149cbb79b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:471` in `RingOrchestratorEventsRepository.validateResponseAndTrack`: header:x-ring-greco-credential-request = `this.credentialRequestProvider.createCredentialRequest()`; path:source_id = `query.getDoorbotId()`; query:eventito_time = `query.getEventitoTimestamp()`; result `assigned:responseExecute`

### GET `evm/v3/history/devices`

- Endpoint ID: `ep-cb3081032ccdd043`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### POST `evm/v3/history/events`

- Endpoint ID: `ep-a83517ee5d6ddb2d`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:396` in `RingOrchestratorEventsRepository.validateResponseAndTrack`: header:x-ring-greco-credential-request = `strCreateCredentialRequest`; body = `new OrchestratorBatchRequestBody(arrayList)`; result `assigned:responseExecute`

### GET `factory_profile`

- Endpoint ID: `ep-b92c4cc5105c4e74`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### GET `fms/device-firmware`

- Endpoint ID: `ep-4d8a93eac6630f2b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ring/blueprints/setup/core/data/repository/DeviceFirmwareRepository.java:36` in `DeviceFirmwareRepository.getDeviceFirmware`: query:adsn = `adsn`; query:currentVersion = `str`; result `assigned:responseExecute`

### GET `geocoding/v1/auto-complete`

- Endpoint ID: `ep-99aae7fb8cc24125`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### GET `geocoding/v1/auto-complete/details`

- Endpoint ID: `ep-ef0d018c1d454b8a`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### POST `geocoding/v1/geocode`

- Endpoint ID: `ep-9597a38832270393`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### GET `geocoding/v1/ip/info/my`

- Endpoint ID: `ep-f63f1b4cf798abdb`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:locationByIp. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/wifi/discover/GetRegionCodeUseCase.java:70` in `GetRegionCodeUseCase.invoke`: no wire arguments; result `assigned:locationByIp`

### GET `geocoding/v1/reverse-geocode`

- Endpoint ID: `ep-25a99bd31442f3fd`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### GET `location_info/v3/locations`

- Endpoint ID: `ep-8d0b3db75888282b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: returned. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/immediasemi/blink/location/api/LocationsCoreApiAdapter.java:93` in `LocationsCoreApiAdapter.getLocationsV3`: query:ignore_rbac = `bool`; result `returned`

### GET `location-subtypes`

- Endpoint ID: `ep-0672169e7740c4e7`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:obj. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/amazon/rbks/mobile/locations/repository/RbksLocationSubtypeRepository.java:83` in `RbksLocationSubtypeRepository.invokeSuspend`: no wire arguments; result `assigned:obj`

### DELETE `recordings/public/footages/{deviceId}`

- Endpoint ID: `ep-cb66a3603be88a81`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:146` in `RingOrchestratorEventsRepository.query`: path:deviceId = `deviceId`; query:start_at_ms = `startDate`; query:end_at_ms = `endDate`; result `assigned:responseExecute`

### DELETE `recordings/public/footages/{deviceId}/delete_all`

- Endpoint ID: `ep-446538e205c4c2bc`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:responseExecute. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ringapp/orchestratorapi/data/RingOrchestratorEventsRepository.java:154` in `RingOrchestratorEventsRepository.query`: path:deviceId = `deviceId`; result `assigned:responseExecute`

### POST `setups`

- Endpoint ID: `ep-693f4f138798c697`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: returned. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ring/blueprints/setup/core/data/backend/RingModularSetupClientsApi.java:38` in `RingModularSetupClientsApi.createSetup`: body = `toJsonRequestBody(setupBody)`; result `returned`

### GET `setups/{setupId}`

- Endpoint ID: `ep-6d4073874d646914`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: returned. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ring/blueprints/setup/core/data/backend/RingModularSetupClientsApi.java:54` in `RingModularSetupClientsApi.getSetupStatus`: path:setupId = `setupId`; result `returned`

### POST `setups/{setupId}/complete`

- Endpoint ID: `ep-bbe42cf9f50a9776`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: returned. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/ring/blueprints/setup/core/data/backend/RingModularSetupClientsApi.java:71` in `RingModularSetupClientsApi.completeSetup`: path:setupId = `setupId`; body = `completeSetup`; result `returned`

### PUT `share_service/v3/batch_shares`

- Endpoint ID: `ep-319eb8a93a2aa6fe`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objSubmitBatchDonation. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/video/clip/donation/VideoDonationRepository$submitDonation$2.java:58` in `VideoDonationRepository$submitDonation$2.invokeSuspend`: body = `this.$request`; result `assigned:objSubmitBatchDonation`

### GET `sos/v1/factory_profile`

- Endpoint ID: `ep-83ac8140c06fc39e`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:factoryProfile. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/domain/DeviceRepository$getMacDeviceIdentity$2.java:59` in `DeviceRepository$getMacDeviceIdentity$2.invokeSuspend`: query:mac_id = `this.$macAddress`; query:serial_number = `this.$serialNumber`; result `assigned:factoryProfile`

### POST `sos/v1/setups`

- Endpoint ID: `ep-b6e8adde564fd483`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostChimeSetup. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceRepository$startChimeSetup$2.java:61` in `SetupOrchestrationServiceRepository$startChimeSetup$2.invokeSuspend`: body = `new RingSosSetupPostBody(new RingSosSetupPostBody.Setup(this.$deviceName, this.$deviceKind, this.$macId, this.$locationId))`; result `assigned:objPostChimeSetup`

### GET `system/config/network`

- Endpoint ID: `ep-85a3f8b49936e327`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:networkConfig. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/wifi/SosWifiRepository$getNetworkConfig$2$1.java:54` in `SosWifiRepository$getNetworkConfig$2$1.invokeSuspend`: no wire arguments; result `assigned:networkConfig`

### POST `system/config/network`

- Endpoint ID: `ep-322be83d3e280a54`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostNetworkConfig. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/wifi/SosWifiRepository$setNetworkConfig$2$1.java:58` in `SosWifiRepository$setNetworkConfig$2$1.invokeSuspend`: body = `this.$body`; result `assigned:objPostNetworkConfig`

### POST `system/config/reg_domain`

- Endpoint ID: `ep-bb17a0cacd3f0c9d`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostRegionConfig. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/wifi/SosWifiRepository$setRegionConfig$2$1.java:58` in `SosWifiRepository$setRegionConfig$2$1.invokeSuspend`: body = `RegionConfigPostBody.INSTANCE.create(this.$regCountry)`; result `assigned:objPostRegionConfig`

### GET `system/prov/ap_list`

- Endpoint ID: `ep-eba8ba715881cddb`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:accessPointList. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/wifi/SosWifiRepository$getAccessPoints$2$1.java:54` in `SosWifiRepository$getAccessPoints$2$1.invokeSuspend`: no wire arguments; result `assigned:accessPointList`

### POST `users/delete`

- Endpoint ID: `ep-b6c0f758f9c68b49`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/account/delete/DeleteAccountUseCase$invoke$2.java:50` in `DeleteAccountUseCase$invoke$2.invokeSuspend`: body = `new DeleteAccountBody(this.$password)`; result `invoked`

### GET `v1/accounts/{injected_account_id}/single_event_alerts`

- Endpoint ID: `ep-382c5185ef067d5a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:singleEventAlerts. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/notifications/sea/SingleEventAlertsRepository$getSingleEventAlerts$2.java:55` in `SingleEventAlertsRepository$getSingleEventAlerts$2.invokeSuspend`: query:ring_location_id = `this.$ringLocationId`; result `assigned:singleEventAlerts`

### POST `v1/accounts/{injected_account_id}/single_event_alerts`

- Endpoint ID: `ep-51e9cdbc4278773d`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/notifications/sea/SingleEventAlertsRepository$updateSingleEventAlerts$2.java:49` in `SingleEventAlertsRepository$updateSingleEventAlerts$2.invokeSuspend`: body = `this.$body`; result `invoked`

### POST `v1/alexa/authorization`

- Endpoint ID: `ep-3e10d62c0901a839`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostAuthorization. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/account/alexa/AlexaLinkingRepository$authorizeAlexa$2.java:56` in `AlexaLinkingRepository$authorizeAlexa$2.invokeSuspend`: body = `new AlexaLinkingAuthorizePostBody(this.$origin.getClientId(), this.$origin.getRedirectUri(), this.$origin.getScope(), this.$origin.getState(), (String) null, 16, (DefaultConstructorMarker) null)`; result `assigned:objPostAuthorization`

### DELETE `v1/alexa/link`

- Endpoint ID: `ep-920544923ebd3b5a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/account/alexa/AlexaLinkingRepository$unlink$2.java:46` in `AlexaLinkingRepository$unlink$2.invokeSuspend`: no wire arguments; result `invoked`

### POST `v1/alexa/link`

- Endpoint ID: `ep-d9b8dbd1e34c3bb9`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/account/alexa/AlexaLinkingRepository$handleBlinkDeeplink$2.java:90` in `AlexaLinkingRepository$handleBlinkDeeplink$2.invokeSuspend`: body = `new AlexaLinkingLinkPostBody(this.$it, AppLinkUrls.INSTANCE.getALEXA_LINKING_REDIRECT())`; result `invoked`

### GET `v1/alexa/link_status`

- Endpoint ID: `ep-dfd9c098dea671bb`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:linkStatus. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/settings/account/alexa/AlexaLinkingRepository$getLinkStatus$2.java:87` in `AlexaLinkingRepository$getLinkStatus$2.invokeSuspend`: no wire arguments; result `assigned:linkStatus`

### GET `v1/clients/{injected_client_id}/control_panel/clients`

- Endpoint ID: `ep-ae7ee2a1d3258930`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:clients. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/client/ClientManagementRepository$getClients$2.java:53` in `ClientManagementRepository$getClients$2.invokeSuspend`: no wire arguments; result `assigned:clients`

### POST `v1/clients/{injected_client_id}/control_panel/delete`

- Endpoint ID: `ep-b6b54dc771ee9757`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/client/ClientManagementRepository$deleteClient$2.java:50` in `ClientManagementRepository$deleteClient$2.invokeSuspend`: body = `new DeleteClientBody(this.$clientId)`; result `invoked`

### POST `v1/clients/{injected_client_id}/control_panel/pin/resend`

- Endpoint ID: `ep-18b9e7aa482ebadb`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:r6. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/client/ClientManagementRepository$generatePin$2.java:82` in `ClientManagementRepository$generatePin$2.invokeSuspend`: no wire arguments; result `assigned:r6`

### POST `v1/clients/{injected_client_id}/control_panel/pin/verify`

- Endpoint ID: `ep-e9ecbe165092ca1e`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostManageClientsPinVerify. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/client/ClientManagementRepository$verifyPin$2.java:58` in `ClientManagementRepository$verifyPin$2.invokeSuspend`: body = `new VerifyPinPostBody(this.$pin, (String) null, (String) null, (String) null, 14, (DefaultConstructorMarker) null)`; result `assigned:objPostManageClientsPinVerify`

### POST `v1/clients/{injected_client_id}/control_panel/request_pin`

- Endpoint ID: `ep-ad385741b00da79d`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:r6. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/immediasemi/blink/settings/client/ClientManagementRepository$generatePin$2.java:94` in `ClientManagementRepository$generatePin$2.invokeSuspend`: no wire arguments; result `assigned:r6`

### GET `v1/clients/{injected_client_id}/options`

- Endpoint ID: `ep-5c523c973d422a4a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:clientOptions. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/account/client/option/ClientOptionRepository$fetchClientOptions$2.java:91` in `ClientOptionRepository$fetchClientOptions$2.invokeSuspend`: no wire arguments; result `assigned:clientOptions`

### POST `v1/clients/{injected_client_id}/options`

- Endpoint ID: `ep-b20e17aea1c86adf`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/account/client/option/ClientOptionRepository.java:3012` in `ClientOptionRepository.invokeSuspend`: body = `new ClientOptionsBody(json.encodeToString(ClientOptions.INSTANCE.serializer(), clientOptions))`; result `invoked`

### POST `v1/clients/{injected_client_id}/shared_login/pin/resend`

- Endpoint ID: `ep-4866945e4b335a3b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:r6. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/sharedlogin/repository/SharedLoginRepository$generatePin$2.java:83` in `SharedLoginRepository$generatePin$2.invokeSuspend`: no wire arguments; result `assigned:r6`

### POST `v1/clients/{injected_client_id}/shared_login/pin/verify`

- Endpoint ID: `ep-feeadf6de59399e7`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostSharedLoginPinVerify. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/sharedlogin/repository/SharedLoginRepository$verifyPin$2.java:59` in `SharedLoginRepository$verifyPin$2.invokeSuspend`: body = `new VerifyPinPostBody(this.$pin, (String) null, (String) null, (String) null, 14, (DefaultConstructorMarker) null)`; result `assigned:objPostSharedLoginPinVerify`

### POST `v1/clients/{injected_client_id}/shared_login/request_pin`

- Endpoint ID: `ep-541f8872870779f0`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:r6. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/immediasemi/blink/settings/sharedlogin/repository/SharedLoginRepository$generatePin$2.java:95` in `SharedLoginRepository$generatePin$2.invokeSuspend`: no wire arguments; result `assigned:r6`

### POST `v1/countries/update`

- Endpoint ID: `ep-dfcbb2a372d314ff`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:accountCountry. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/country/CountryRepository$setInitialCountry$2.java:58` in `CountryRepository$setInitialCountry$2.invokeSuspend`: body = `new CountryBody(this.$countryCode)`; result `assigned:accountCountry`

### POST `v1/data_request/dsar/create`

- Endpoint ID: `ep-733e8845311f63c4`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostDsarRequest. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/account/managedata/ManageDataRepository$submitDsarRequest$2.java:52` in `ManageDataRepository$submitDsarRequest$2.invokeSuspend`: no wire arguments; result `assigned:objPostDsarRequest`

### POST `v1/data_request/euda/create`

- Endpoint ID: `ep-b6a1a1e8ae7ac6e5`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostEudaRequest. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/account/managedata/ManageDataRepository$submitEudaRequest$2.java:52` in `ManageDataRepository$submitEudaRequest$2.invokeSuspend`: no wire arguments; result `assigned:objPostEudaRequest`

### GET `v1/data_request/list`

- Endpoint ID: `ep-53637724fd23707b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:dataRequests. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/account/managedata/ManageDataRepository$getDataRequests$2.java:52` in `ManageDataRepository$getDataRequests$2.invokeSuspend`: no wire arguments; result `assigned:dataRequests`

### POST `v1/data_request/third_party/{thirdPartyId}/revoke`

- Endpoint ID: `ep-c7dbf87a5eb84ee8`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/account/managedata/ManageDataRepository$revokeAuthorization$2.java:49` in `ManageDataRepository$revokeAuthorization$2.invokeSuspend`: path:thirdPartyId = `this.$id`; result `invoked`

### POST `v1/events/app`

- Endpoint ID: `ep-89deafa7572641cd`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/track/event/TrackingSyncWorker.java:378` in `TrackingSyncWorker.invokeSuspend`: body = `this.$trackEventsBody`; result `invoked`

### DELETE `v1/history/events/associations/{profile_id}`

- Endpoint ID: `ep-b3b52b7abc07105e`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/knownfaces/identities/EventAssociationsRepository$deleteEventAssociations$2$1$1.java:53` in `EventAssociationsRepository$deleteEventAssociations$2$1$1.invokeSuspend`: path:profile_id = `this.$profileId`; query:filter[event_ids] = `CollectionsKt.joinToString$default(this.$chunk, ",", null, null, 0, null, null, 62, null)`; result `invoked`

### GET `v1/identities`

- Endpoint ID: `ep-7a1d9923239c2d9a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:identities. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesRepository$getIdentities$2.java:52` in `IdentitiesRepository$getIdentities$2.invokeSuspend`: no wire arguments; result `assigned:identities`

### DELETE `v1/identities/{id}`

- Endpoint ID: `ep-156aff5c8a8faca5`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesRepository$deleteIdentity$2.java:49` in `IdentitiesRepository$deleteIdentity$2.invokeSuspend`: path:id = `this.$id`; result `invoked`

### GET `v1/identities/{id}`

- Endpoint ID: `ep-1c89bcfdfb22e5ed`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### PATCH `v1/identities/{id}`

- Endpoint ID: `ep-c09403d9df5560af`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesRepository$updateIdentity$2.java:51` in `IdentitiesRepository$updateIdentity$2.invokeSuspend`: path:id = `this.$id`; body = `this.$request`; result `invoked`

### PATCH `v1/identities/{id}/actions/merge-identities`

- Endpoint ID: `ep-0da24f5f3e66e9c6`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesRepository$mergeIdentities$2.java:51` in `IdentitiesRepository$mergeIdentities$2.invokeSuspend`: path:id = `this.$targetId`; body = `this.$request`; result `invoked`

### POST `v1/identities/{id}/actions/split-identity`

- Endpoint ID: `ep-9a4660cf3c6f4118`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objSplitIdentity. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesRepository$splitIdentity$2.java:57` in `IdentitiesRepository$splitIdentity$2.invokeSuspend`: path:id = `this.$sourceIdentityId`; body = `this.$request`; result `assigned:objSplitIdentity`

### DELETE `v1/identities/{id}/enrollment-images`

- Endpoint ID: `ep-b139c1a2ee4f825a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesRepository$deleteEnrollmentImages$2.java:52` in `IdentitiesRepository$deleteEnrollmentImages$2.invokeSuspend`: path:id = `this.$identityId`; query:filter[id] = `this.$imageIds`; result `invoked`

### PATCH `v1/identities/{id}/enrollment-images/actions/move-enrollment-images`

- Endpoint ID: `ep-f925648d3b7f22eb`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesRepository$moveEnrollmentImages$2.java:51` in `IdentitiesRepository$moveEnrollmentImages$2.invokeSuspend`: path:id = `this.$sourceIdentityId`; body = `this.$request`; result `invoked`

### POST `v1/identity/token`

- Endpoint ID: `ep-ffe801e55aff497a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostTokenUpgrade. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/account/auth/UpgradeTokenUseCase$invoke$2.java:56` in `UpgradeTokenUseCase$invoke$2.invokeSuspend`: body = `new TokenUpgradePostBody(this.$password)`; result `assigned:objPostTokenUpgrade`

### POST `v1/locations/update`

- Endpoint ID: `ep-983934b692b5325e`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/location/repositories/BlinkCloudNotifyingLocationsRepository$notifyBlinkCloudAsync$1$result$1.java:47` in `BlinkCloudNotifyingLocationsRepository$notifyBlinkCloudAsync$1$result$1.invokeSuspend`: no wire arguments; result `invoked`
  - `com/immediasemi/blink/location/repositories/C10962x878b37c3.java:48` in `C10962x878b37c3.invokeSuspend`: no wire arguments; result `invoked`
  - `com/immediasemi/blink/utils/SyncManager$checkAndRetryStaleLocations$1$result$1.java:47` in `SyncManager$checkAndRetryStaleLocations$1$result$1.invokeSuspend`: no wire arguments; result `invoked`

### GET `v1/notifications/preferences`

- Endpoint ID: `ep-7d511ee9b2a7e549`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:notificationPreferences. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/common/account/preference/AccountPreferenceRepository$getNotificationPreferences$2.java:86` in `AccountPreferenceRepository$getNotificationPreferences$2.invokeSuspend`: no wire arguments; result `assigned:notificationPreferences`

### POST `v1/notifications/preferences`

- Endpoint ID: `ep-4c2b448f5a159ec8`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/common/account/preference/AccountPreferenceRepository$setNotificationPreferences$2.java:85` in `AccountPreferenceRepository$setNotificationPreferences$2.invokeSuspend`: body = `new NotificationPreferencesResponse(this.$marketingPushEnabled)`; result `invoked`

### GET `v1/shared_login`

- Endpoint ID: `ep-0fc09c5e28a4377e`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:sharedLogins. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/sharedlogin/repository/SharedLoginRepository$getSharedLogins$2.java:59` in `SharedLoginRepository$getSharedLogins$2.invokeSuspend`: query:code = `this.$code`; query:pagination_key = `this.$paginationKey`; result `assigned:sharedLogins`

### POST `v1/shared_login`

- Endpoint ID: `ep-9680c99430f18b6d`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostSharedLogin. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/sharedlogin/repository/SharedLoginRepository$createSharedLogin$2.java:62` in `SharedLoginRepository$createSharedLogin$2.invokeSuspend`: body = `new CreateSharedLoginBody(this.$password, this.$recipientPhone, this.$code)`; result `assigned:objPostSharedLogin`

### POST `v1/shared_login/claim`

- Endpoint ID: `ep-f916e5308397600e`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostSharedLoginClaim. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/sharedlogin/repository/SharedLoginRepository$claimSharedLogin$2.java:60` in `SharedLoginRepository$claimSharedLogin$2.invokeSuspend`: body = `new SharedLoginClaimBody(this.$linkId, this.$code)`; result `assigned:objPostSharedLoginClaim`

### POST `v1/shared_login/revoke`

- Endpoint ID: `ep-ff33484e14536972`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/sharedlogin/repository/SharedLoginRepository$revokeSharedLogin$2.java:53` in `SharedLoginRepository$revokeSharedLogin$2.invokeSuspend`: body = `new RevokeSharedLoginBody(this.$id, this.$code)`; result `invoked`

### POST `v1/shared_login/verify`

- Endpoint ID: `ep-2a431b9cb680d471`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostSharedLoginVerify. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/sharedlogin/repository/SharedLoginRepository$verifySharedLogin$2.java:58` in `SharedLoginRepository$verifySharedLogin$2.invokeSuspend`: body = `new SharedLoginVerifyBody(this.$linkId)`; result `assigned:objPostSharedLoginVerify`

### PATCH `v1/shared/authorizations/{authorizationId}`

- Endpoint ID: `ep-46641f44578a3508`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPatchFriendlyName. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/common/account/AccessRepository$updateFriendlyName$2.java:99` in `AccessRepository$updateFriendlyName$2.invokeSuspend`: path:authorizationId = `this.$authorizationId`; query:first_request = `this.$isFirstRequest`; body = `new FriendlyNamePatchBody(this.$name)`; result `assigned:objPatchFriendlyName`

### DELETE `v1/shared/authorizations/{authorizationId}/remove`

- Endpoint ID: `ep-72ec41121567224b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objDeleteRemoveAccess. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/common/account/AccessRepository$removeAccess$2.java:90` in `AccessRepository$removeAccess$2.invokeSuspend`: path:authorizationId = `this.$authorizationId`; result `assigned:objDeleteRemoveAccess`

### DELETE `v1/shared/authorizations/{authorizationId}/revoke`

- Endpoint ID: `ep-57033c2934299f46`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/common/account/AccessRepository$revokeAccess$2.java:83` in `AccessRepository$revokeAccess$2.invokeSuspend`: path:authorizationId = `this.$authorizationId`; result `invoked`

### GET `v1/shared/check_authorization`

- Endpoint ID: `ep-ce0d6c79c62492cf`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:checkAuthorization. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/common/account/AccessRepository$checkAuthorization$2.java:90` in `AccessRepository$checkAuthorization$2.invokeSuspend`: query:friendly_name = `this.$name`; result `assigned:checkAuthorization`

### POST `v1/shared/invitations/{invitationId}/accept`

- Endpoint ID: `ep-d505f17421d51f27`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostAcceptAccess. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/common/account/AccessRepository$acceptAccess$2.java:95` in `AccessRepository$acceptAccess$2.invokeSuspend`: path:invitationId = `this.$invitationId`; body = `new AcceptInvitationBody(this.$name)`; result `assigned:objPostAcceptAccess`

### DELETE `v1/shared/invitations/{invitationId}/decline`

- Endpoint ID: `ep-dcef2ee0623276d1`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/common/account/AccessRepository$declineInvitation$2.java:83` in `AccessRepository$declineInvitation$2.invokeSuspend`: path:invitationId = `this.$invitationId`; result `invoked`

### DELETE `v1/shared/invitations/{invitationId}/revoke`

- Endpoint ID: `ep-ebd75ad2b788b384`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/common/account/AccessRepository$revokeInvitation$2.java:83` in `AccessRepository$revokeInvitation$2.invokeSuspend`: path:invitationId = `this.$invitationId`; result `invoked`

### POST `v1/shared/invitations/send`

- Endpoint ID: `ep-0638af6750b08ce6`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/common/account/AccessRepository$sendInvite$2.java:84` in `AccessRepository$sendInvite$2.invokeSuspend`: body = `new SendInviteBody(this.$email)`; result `invoked`

### PATCH `v1/shared/popovers/{popoverId}/read`

- Endpoint ID: `ep-4d188387e5ed3ebf`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/common/account/AccessRepository$popoverRead$2.java:83` in `AccessRepository$popoverRead$2.invokeSuspend`: path:popoverId = `this.$popoverId`; result `invoked`

### GET `v1/shared/summary`

- Endpoint ID: `ep-fd8d140c0e8e2a96`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:sharedSummary. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/account/AccessRepository$getSharedSummary$2.java:53` in `AccessRepository$getSharedSummary$2.invokeSuspend`: no wire arguments; result `assigned:sharedSummary`

### POST `v1/subscriptions/clear_popup/{type}`

- Endpoint ID: `ep-8201b7e86a1fd943`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/subscription/SubscriptionRepository.java:2484` in `SubscriptionRepository.invokeSuspend`: path:type = `HomescreenTrialPopupKt.toPopupStyle(this.$currentPopup)`; result `invoked`

### POST `v1/subscriptions/link/link_account`

- Endpoint ID: `ep-561e2651fe1df9c5`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objLinkAmazonAccount. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/activities/p015ui/main/AmazonLinkingRepository$linkAmazonAccount$2.java:58` in `AmazonLinkingRepository$linkAmazonAccount$2.invokeSuspend`: body = `this.$body`; result `assigned:objLinkAmazonAccount`
  - `com/immediasemi/blink/activities/ui/main/AmazonLinkingRepository$linkAmazonAccount$2.java:58` in `AmazonLinkingRepository$linkAmazonAccount$2.invokeSuspend`: body = `this.$body`; result `assigned:objLinkAmazonAccount`

### POST `v1/subscriptions/link/unlink_account`

- Endpoint ID: `ep-58698ede622b4ef7`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objUnlinkAmazonAccount. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/activities/p015ui/main/AmazonLinkingRepository$unlinkAmazonAccount$2.java:58` in `AmazonLinkingRepository$unlinkAmazonAccount$2.invokeSuspend`: body = `new VerifyLinkAccountBody(this.$password)`; result `assigned:objUnlinkAmazonAccount`
  - `com/immediasemi/blink/activities/ui/main/AmazonLinkingRepository$unlinkAmazonAccount$2.java:58` in `AmazonLinkingRepository$unlinkAmazonAccount$2.invokeSuspend`: body = `new VerifyLinkAccountBody(this.$password)`; result `assigned:objUnlinkAmazonAccount`

### POST `v1/subscriptions/plans/{subscriptionId}/attach`

- Endpoint ID: `ep-59cbd4c7f951a033`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objAttachPlan. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/subscription/SubscriptionRepository$attachBasicPlanToDevice$2.java:60` in `SubscriptionRepository$attachBasicPlanToDevice$2.invokeSuspend`: path:subscriptionId = `this.$subscriptionId`; body = `new AttachPlanBody(this.$device.getServerId(), this.$device.getType())`; result `assigned:objAttachPlan`

### DELETE `v1/subscriptions/plans/cancel_trial`

- Endpoint ID: `ep-973d57675bde2cff`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/apphome/p016ui/account/altertrial/AlterTrialRepository$cancelTrial$2.java:47` in `AlterTrialRepository$cancelTrial$2.invokeSuspend`: no wire arguments; result `invoked`
  - `com/immediasemi/blink/apphome/ui/account/altertrial/AlterTrialRepository$cancelTrial$2.java:47` in `AlterTrialRepository$cancelTrial$2.invokeSuspend`: no wire arguments; result `invoked`

### GET `v1/subscriptions/plans/get_device_attach_eligibility`

- Endpoint ID: `ep-4af34ef77f0ef3c0`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:deviceEligibility. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/subscription/SubscriptionRepository.java:2328` in `SubscriptionRepository.invokeSuspend`: no wire arguments; result `assigned:deviceEligibility`
  - `com/immediasemi/blink/common/subscription/SubscriptionRepository$getDeviceEligibility$2.java:53` in `SubscriptionRepository$getDeviceEligibility$2.invokeSuspend`: no wire arguments; result `assigned:deviceEligibility`

### POST `v1/subscriptions/plans/renew_trial`

- Endpoint ID: `ep-ce33aada5e4fc9e1`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/apphome/p016ui/account/altertrial/AlterTrialRepository$renewTrial$2.java:47` in `AlterTrialRepository$renewTrial$2.invokeSuspend`: no wire arguments; result `invoked`
  - `com/immediasemi/blink/apphome/ui/account/altertrial/AlterTrialRepository$renewTrial$2.java:47` in `AlterTrialRepository$renewTrial$2.invokeSuspend`: no wire arguments; result `invoked`

### POST `v1/subscriptions/request/status/{uuid}`

- Endpoint ID: `ep-019bf23b90e26c10`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objSubscriptionRequestStatus. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/activities/p015ui/main/AmazonLinkingRepository$subscriptionRequestStatus$2.java:58` in `AmazonLinkingRepository$subscriptionRequestStatus$2.invokeSuspend`: body = `new SubscriptionRequestStatusBody(this.$uuid, 0L)`; path:uuid = `this.$uuid`; result `assigned:objSubscriptionRequestStatus`
  - `com/immediasemi/blink/activities/ui/main/AmazonLinkingRepository$subscriptionRequestStatus$2.java:58` in `AmazonLinkingRepository$subscriptionRequestStatus$2.invokeSuspend`: body = `new SubscriptionRequestStatusBody(this.$uuid, 0L)`; path:uuid = `this.$uuid`; result `assigned:objSubscriptionRequestStatus`

### POST `v1/users/authenticate_password`

- Endpoint ID: `ep-dec621515631e93b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objAuthenticatePassword. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/account/AccountManagementViewModel.java:230` in `AccountManagementViewModel.invokeSuspend`: body = `new AuthenticatePasswordBody(this.$password)`; result `assigned:objAuthenticatePassword`

### POST `v1/users/countries/update`

- Endpoint ID: `ep-10f618fefeb66527`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objUpdateUserCountry. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/country/CountryRepository$updateCountry$2.java:58` in `CountryRepository$updateCountry$2.invokeSuspend`: body = `new CountryBody(this.$countryCode)`; result `assigned:objUpdateUserCountry`

### GET `v1/users/options`

- Endpoint ID: `ep-d4280ac3c668ce97`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:accountOptions. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/account/option/AccountOptionRepository$updateAccountOptions$2.java:92` in `AccountOptionRepository$updateAccountOptions$2.invokeSuspend`: no wire arguments; result `assigned:accountOptions`

### GET `v1/users/preferences`

- Endpoint ID: `ep-fb87fafa321f9093`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:accountPreferences. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/common/account/preference/AccountPreferenceRepository.java:141` in `AccountPreferenceRepository.invokeSuspend`: no wire arguments; result `assigned:accountPreferences`

### POST `v1/users/preferences`

- Endpoint ID: `ep-d4011735a9df7489`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostAccountPreferences. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/common/account/preference/AccountPreferenceRepository$updateAccountPreferences$2.java:90` in `AccountPreferenceRepository$updateAccountPreferences$2.invokeSuspend`: body = `this.$accountPreferencesBody`; result `assigned:objPostAccountPreferences`

### GET `v1/users/tier_info`

- Endpoint ID: `ep-d84d429da1460252`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:tierInfo. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/account/auth/LoginViewModel$authenticate$result$1$1.java:89` in `LoginViewModel$authenticate$result$1$1.invokeSuspend`: no wire arguments; result `assigned:tierInfo`
  - `com/immediasemi/blink/account/sharedlogin/SharedLoginVerifyCodeViewModel$claimWithCode$2$1$1.java:54` in `SharedLoginVerifyCodeViewModel$claimWithCode$2$1$1.invokeSuspend`: no wire arguments; result `assigned:tierInfo`

### POST `v2/clients/{injected_client_id}/tiv`

- Endpoint ID: `ep-e681471ceff2f036`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostTivLock. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/settings/privacy/CustomerSupportAccessRepository$setAccess$2.java:94` in `CustomerSupportAccessRepository$setAccess$2.invokeSuspend`: body = `new TivLockBody(!this.$enabled)`; result `assigned:objPostTivLock`

### POST `v2/clients/{injected_client_id}/tiv_unlock/pin/resend`

- Endpoint ID: `ep-5c420acdd956cc7a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:r6. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/privacy/CustomerSupportAccessRepository$generatePin$2.java:82` in `CustomerSupportAccessRepository$generatePin$2.invokeSuspend`: no wire arguments; result `assigned:r6`

### POST `v2/clients/{injected_client_id}/tiv_unlock/pin/verify`

- Endpoint ID: `ep-5d75b57e259396f8`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostTivUnlockPinVerify. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/privacy/CustomerSupportAccessRepository$verifyPin$2.java:58` in `CustomerSupportAccessRepository$verifyPin$2.invokeSuspend`: body = `new VerifyPinPostBody(this.$pin, (String) null, (String) null, (String) null, 14, (DefaultConstructorMarker) null)`; result `assigned:objPostTivUnlockPinVerify`

### POST `v2/clients/{injected_client_id}/tiv_unlock/request_pin`

- Endpoint ID: `ep-8a23e96225e013fa`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:r6. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: none recovered
- Direct call sites:
  - `com/immediasemi/blink/settings/privacy/CustomerSupportAccessRepository$generatePin$2.java:94` in `CustomerSupportAccessRepository$generatePin$2.invokeSuspend`: no wire arguments; result `assigned:r6`

### POST `v2/notification`

- Endpoint ID: `ep-1f202eece3cee33d`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objAcknowledgeNotification. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/notification/NotificationCoroutines$acknowledgeWithRetry$1$result$1.java:61` in `NotificationCoroutines$acknowledgeWithRetry$1$result$1.invokeSuspend`: body = `this.$body`; result `assigned:objAcknowledgeNotification`

### POST `v2/subscriptions/plans/create_trial`

- Endpoint ID: `ep-aaac9889784755b6`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/subscription/SubscriptionRepository$startAdditionalTrial$2.java:50` in `SubscriptionRepository$startAdditionalTrial$2.invokeSuspend`: body = `new AdditionalTrialBody(this.$trialDays)`; result `invoked`

### GET `v2/users/info`

- Endpoint ID: `ep-aef0bdb15ac1d06d`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:accountInfo. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/account/GetAccountInfoUseCase$invoke$2.java:91` in `GetAccountInfoUseCase$invoke$2.invokeSuspend`: no wire arguments; result `assigned:accountInfo`

### POST `v4/clients/{injected_client_id}/email_change`

- Endpoint ID: `ep-bcc0b6fc4bcec34d`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostEmailChange. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/settings/email/EmailChangeRepository$changeEmail$4.java:94` in `EmailChangeRepository$changeEmail$4.invokeSuspend`: body = `new ChangeEmailPostBody(this.$email, this.$password)`; result `assigned:objPostEmailChange`

### POST `v4/clients/{injected_client_id}/email_change/pin/resend`

- Endpoint ID: `ep-3b54dfd06b680c35`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostEmailChangePinGenerate. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/email/EmailChangeRepository$generatePin$2.java:53` in `EmailChangeRepository$generatePin$2.invokeSuspend`: no wire arguments; result `assigned:objPostEmailChangePinGenerate`

### POST `v4/clients/{injected_client_id}/email_change/pin/verify`

- Endpoint ID: `ep-fb362c81f5286436`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostEmailChangePinVerify. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/email/EmailChangeRepository$verifyPin$2.java:58` in `EmailChangeRepository$verifyPin$2.invokeSuspend`: body = `new VerifyPinPostBody(this.$pin, (String) null, (String) null, (String) null, 14, (DefaultConstructorMarker) null)`; result `assigned:objPostEmailChangePinVerify`

### POST `v4/clients/{injected_client_id}/logout`

- Endpoint ID: `ep-22c828da805930c3`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/account/auth/LogoutUseCase$invoke$2.java:87` in `LogoutUseCase$invoke$2.invokeSuspend`: no wire arguments; result `invoked`

### POST `v4/clients/{injected_client_id}/password_change`

- Endpoint ID: `ep-5fec0a86ac4b396f`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/password/C12059xb76681de.java:52` in `C12059xb76681de.invokeSuspend`: body = `this.$changePasswordBody`; result `invoked`
  - `com/immediasemi/blink/settings/password/ChangePasswordFragment.java:664` in `ChangePasswordFragment.invokeSuspend`: body = `str`; result `invoked`
  - `com/immediasemi/blink/settings/password/ChangePasswordFragment$changePassword$1$changePasswordObservable$1.java:51` in `ChangePasswordFragment$changePassword$1$changePasswordObservable$1.invokeSuspend`: body = `this.$changePasswordBody`; result `invoked`
  - `com/immediasemi/blink/settings/password/PasswordChangeRepository$resetPassword$2.java:57` in `PasswordChangeRepository$resetPassword$2.invokeSuspend`: body = `new ResetPasswordPostBody(this.$token, this.$password, str, str2, str3, z, 60, (DefaultConstructorMarker) null)`; result `invoked`

### POST `v4/clients/{injected_client_id}/password_change/pin/generate`

- Endpoint ID: `ep-723547afbb9a3111`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostPasswordChangePinGenerate. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/password/PasswordChangeRepository$generatePin$2.java:53` in `PasswordChangeRepository$generatePin$2.invokeSuspend`: no wire arguments; result `assigned:objPostPasswordChangePinGenerate`

### POST `v4/clients/{injected_client_id}/password_change/pin/verify`

- Endpoint ID: `ep-559ff906c82d2bb6`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:obj. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/password/PasswordChangeRepository$verifyPin$2.java:53` in `PasswordChangeRepository$verifyPin$2.invokeSuspend`: body = `new VerifyPinPostBody(this.$pin, (String) null, (String) null, (String) null, 14, (DefaultConstructorMarker) null)`; result `assigned:obj`

### POST `v4/clients/{injected_client_id}/pin/verify`

- Endpoint ID: `ep-ff6530fbf4c8136a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objVerifyClientPIN. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/account/phone/PhoneNumberRepository$submitClientVerification$3.java:58` in `PhoneNumberRepository$submitClientVerification$3.invokeSuspend`: body = `new VerifyPinBody(this.$pin)`; result `assigned:objVerifyClientPIN`

### POST `v4/users/pin/resend`

- Endpoint ID: `ep-dd5c3bfcfbd9b747`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostRegistrationPinResend. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/account/registration/RegistrationVerifyAccountViewModel.java:274` in `RegistrationVerifyAccountViewModel.invokeSuspend`: no wire arguments; result `assigned:objPostRegistrationPinResend`

### POST `v4/users/pin/verify`

- Endpoint ID: `ep-53105c58095b688b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostRegistrationPinVerify. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/account/registration/RegistrationVerifyAccountViewModel.java:401` in `RegistrationVerifyAccountViewModel.invokeSuspend`: body = `new VerifyPinPostBody(this.$pin, (String) null, (String) null, (String) null, 14, (DefaultConstructorMarker) null)`; result `assigned:objPostRegistrationPinVerify`

### POST `v5/clients/{injected_client_id}/client_verification/pin/resend`

- Endpoint ID: `ep-eaa901d370a4f61b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objResendClientVerificationCode. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/account/phone/PhoneNumberRepository$resendClientVerification$2.java:54` in `PhoneNumberRepository$resendClientVerification$2.invokeSuspend`: no wire arguments; result `assigned:objResendClientVerificationCode`

### POST `v5/clients/{injected_client_id}/client_verification/pin/verify`

- Endpoint ID: `ep-4910382b2731c378`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objSubmitClientVerificationCode. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/account/phone/PhoneNumberRepository$submitClientVerification$2.java:61` in `PhoneNumberRepository$submitClientVerification$2.invokeSuspend`: body = `new SubmitVerificationRequest(this.$pin, Boxing.boxBoolean(this.$trustDevice))`; result `assigned:objSubmitClientVerificationCode`

### POST `v5/clients/{injected_client_id}/phone_number_change`

- Endpoint ID: `ep-18c7d9703fa785d1`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objChangePhoneNumber. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/account/phone/PhoneNumberRepository$update$2.java:65` in `PhoneNumberRepository$update$2.invokeSuspend`: body = `new ChangePhoneNumberBody(this.$password, this.$formattedPhoneNumber, this.$phoneNumber.getCountryCallingCode(), this.$confirmationMethod)`; result `assigned:objChangePhoneNumber`

### POST `v5/clients/{injected_client_id}/phone_number_change`

- Endpoint ID: `ep-98197027fbe49074`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostPhoneNumberChange. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/account/phone/PhoneNumberRepository$addPhoneNumber$2.java:64` in `PhoneNumberRepository$addPhoneNumber$2.invokeSuspend`: body = `new AddPhoneNumberPostBody(new Regex("\\(\|\\)\|-\|\\s+").replace(str, ""), String.valueOf(this.$callingCode), this.$verificationChannel.getChannel())`; result `assigned:objPostPhoneNumberChange`

### POST `v5/clients/{injected_client_id}/phone_number_change/pin/verify`

- Endpoint ID: `ep-9014b3d69c455d74`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostPhoneNumberChangePinVerify. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/account/phone/PhoneNumberRepository$verifyAddPhoneNumberPin$2.java:57` in `PhoneNumberRepository$verifyAddPhoneNumberPin$2.invokeSuspend`: body = `new SubmitVerificationRequest(this.$pin, null, 2, null)`; result `assigned:objPostPhoneNumberChangePinVerify`

### POST `accounts/{injected_account_id}/networks/{network}/cameras/{camera}/{type}`

- Endpoint ID: `ep-4c88eead9d21112b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostCameraMotion. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$disableMotionDetection$2$1.java:57` in `ClassicCameraService$disableMotionDetection$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; path:type = `"disable"`; result `assigned:objPostCameraMotion`
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$enableMotionDetection$2$1.java:57` in `ClassicCameraService$enableMotionDetection$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; path:type = `"enable"`; result `assigned:objPostCameraMotion`

### POST `accounts/{injected_account_id}/networks/{network}/cameras/{camera}/thumbnail`

- Endpoint ID: `ep-c19ba96b5431fad3`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostThumbnail. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$requestThumbnail$2$1.java:59` in `ClassicCameraService$requestThumbnail$2$1.invokeSuspend`: path = `this.$networkId`; path = `this.$it.getServerId()`; result `assigned:objPostThumbnail`
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$takeThumbnail$2$1.java:59` in `ClassicCameraService$takeThumbnail$2$1.invokeSuspend`: path = `this.$networkId`; path = `this.$it.getServerId()`; result `assigned:objPostThumbnail`

### POST `accounts/{injected_account_id}/networks/{network}/cameras/add`

- Endpoint ID: `ep-38eccf29a1a61930`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objAddCamera. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/AddDeviceRepository$createCamera$2.java:60` in `AddDeviceRepository$createCamera$2.invokeSuspend`: body = `this.$addCameraBody`; path = `this.$networkId`; result `assigned:objAddCamera`
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$addDevice$2.java:61` in `ClassicCameraService$addDevice$2.invokeSuspend`: body = `new AddCameraBody(this.$systemId, this.$serialNumber, this.$registrationName)`; path = `this.$systemId`; result `assigned:objAddCamera`

### GET `accounts/{injected_account_id}/networks/{network}/commands/{command}`

- Endpoint ID: `ep-d5110df27ae426d2`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objCommandPoll. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/network/command/KommandPolling$cloudPoll$2.java:58` in `KommandPolling$cloudPoll$2.invokeSuspend`: path = `this.$networkId`; path = `this.$commandId`; result `assigned:objCommandPoll`

### GET `accounts/{injected_account_id}/networks/{network}/commands/{command}`

- Endpoint ID: `ep-344fa3b3bba9b1f1`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objCommandPollCameraAction. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/network/command/CameraActionKommandPolling$cloudPoll$2.java:58` in `CameraActionKommandPolling$cloudPoll$2.invokeSuspend`: path = `this.$networkId`; path = `this.$commandId`; result `assigned:objCommandPollCameraAction`

### GET `accounts/{injected_account_id}/networks/{network}/commands/{command}`

- Endpoint ID: `ep-fe5c6f87711c3f15`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objCommandPollLiveView. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/video/live/LiveViewKommandPolling$cloudPoll$2.java:58` in `LiveViewKommandPolling$cloudPoll$2.invokeSuspend`: path = `this.$networkId`; path = `this.$commandId`; result `assigned:objCommandPollLiveView`

### GET `accounts/{injected_account_id}/networks/{network}/commands/{command}`

- Endpoint ID: `ep-1bc3621054663e37`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objCommandPollWithChildren. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/network/command/SupervisorKommandChildrenPolling$cloudPoll$2.java:58` in `SupervisorKommandChildrenPolling$cloudPoll$2.invokeSuspend`: path = `this.$networkId`; path = `this.$commandId`; result `assigned:objCommandPollWithChildren`

### POST `accounts/{injected_account_id}/networks/{network}/commands/{command}/done`

- Endpoint ID: `ep-4d518a6c958abe4b`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### POST `accounts/{injected_account_id}/networks/{network}/commands/{command}/update`

- Endpoint ID: `ep-cfd8144e2ac7aa64`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostUpdateCommand. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/sync/SyncOnboardingLogsWorker.java:506` in `SyncOnboardingLogsWorker.invokeSuspend`: body = `this.$updateCommandRequest`; path = `this.$networkId`; path = `this.$commandId`; result `assigned:objPostUpdateCommand`

### POST `accounts/{injected_account_id}/networks/{network}/commands/{command}/update`

- Endpoint ID: `ep-ffba925bb86a1974`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/utils/SyncManager.java:2043` in `SyncManager.invokeSuspend`: body = `this.$terminateOnboardingBody`; path = `this.$networkId`; path = `this.$commandId`; result `invoked`

### POST `accounts/{injected_account_id}/networks/{network}/delete`

- Endpoint ID: `ep-360f7aeb478c3132`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/system/setting/SystemSettingsFragment$deleteSystem$1$1.java:88` in `SystemSettingsFragment$deleteSystem$1$1.invokeSuspend`: path = `this.$network.getId()`; result `invoked`

### POST `accounts/{injected_account_id}/networks/{network}/update`

- Endpoint ID: `ep-da7bbafc311838bd`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/system/setting/SystemSettingsFragment.java:1347` in `SystemSettingsFragment.invokeSuspend`: body = `this.$body`; path = `this.$networkId`; result `invoked`

### POST `accounts/{injected_account_id}/networks/{network}/update`

- Endpoint ID: `ep-d535759ffaa23164`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/system/setting/SystemSettingsFragment.java:1229` in `SystemSettingsFragment.invokeSuspend`: body = `this.$updateSystemNameBody`; path = `this.this$0.getNetworkId()`; result `invoked`

### POST `accounts/{injected_account_id}/networks/{network}/update`

- Endpoint ID: `ep-6e3d7ebc2080f6ee`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/activities/onboarding/OnboardingCoroutines.java:773` in `OnboardingCoroutines.invokeSuspend`: body = `this.$body`; path = `this.$networkId`; result `invoked`

### POST `accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/delete`

- Endpoint ID: `ep-4b1d08b02bae8e5b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$deleteDevice$2$1.java:50` in `ClassicCameraService$deleteDevice$2$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path:cameraId = `this.$it.getServerId()`; result `invoked`

### POST `accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/status`

- Endpoint ID: `ep-e07d208394385ce8`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostCameraStatusCommand. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$refreshStatus$2$1.java:57` in `ClassicCameraService$refreshStatus$2$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path:cameraId = `this.$it.getServerId()`; result `assigned:objPostCameraStatusCommand`

### POST `accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/delete`

- Endpoint ID: `ep-c822a8427586868c`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/activities/onboarding/OnboardingCoroutines.java:1122` in `OnboardingCoroutines.invokeSuspend`: path:networkId = `this.$networkId`; path:syncModuleId = `this.$smId`; result `invoked`
  - `com/immediasemi/blink/common/device/syncmodule/SyncModuleService$deleteDevice$2$1$1.java:51` in `SyncModuleService$deleteDevice$2$1$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path:syncModuleId = `this.$it.getId()`; result `invoked`

### POST `accounts/{injected_account_id}/networks/add`

- Endpoint ID: `ep-95e14f0689e4fb9d`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objCreateSystem. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/AddDeviceRepository$createSystem$2.java:58` in `AddDeviceRepository$createSystem$2.invokeSuspend`: body = `this.$addNetworkBody`; result `assigned:objCreateSystem`

### POST `accounts/{injected_account_id}/system_offline/{network}`

- Endpoint ID: `ep-04005f3f45cd0063`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/system/status/SystemOfflineHelpActivity$onCreate$2$1.java:83` in `SystemOfflineHelpActivity$onCreate$2$1.invokeSuspend`: path = `this.this$0.getNetworkid()`; result `invoked`

### GET `v1/accounts/{injected_account_id}/access`

- Endpoint ID: `ep-91999c50899c6e69`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:access. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/utils/SyncManager.java:1431` in `SyncManager.invokeSuspend`: no wire arguments; result `assigned:access`

### GET `v1/accounts/{injected_account_id}/doorbells/{serial}/fw_update`

- Endpoint ID: `ep-16f68c2196776288`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objDownloadLotusFirmwareUpdate. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/activities/onboarding/OnboardingCoroutines$getFirmwareUpdate$1$2$response$3.java:58` in `OnboardingCoroutines$getFirmwareUpdate$1$2$response$3.invokeSuspend`: path:serial = `StringsKt.replace$default(this.$serialNumber, "-", "-", false, 4, (Object) null)`; result `assigned:objDownloadLotusFirmwareUpdate`

### GET `v1/accounts/{injected_account_id}/doorbells/{serial}/token`

- Endpoint ID: `ep-6bc683088edc7b99`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:doorbellAuthToken. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/onboard/OnboardingRepository$getAuthToken$2.java:57` in `OnboardingRepository$getAuthToken$2.invokeSuspend`: path:serial = `this.$serialNumber`; result `assigned:doorbellAuthToken`

### GET `v1/accounts/{injected_account_id}/feature_flags/enabled`

- Endpoint ID: `ep-0f1d9efe92a3318b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:featureFlags. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/flag/FeatureFlagRepository$updateFeatureFlags$2.java:97` in `FeatureFlagRepository$updateFeatureFlags$2.invokeSuspend`: no wire arguments; result `assigned:featureFlags`

### POST `v1/accounts/{injected_account_id}/networks/{network_id}/accessories/delete`

- Endpoint ID: `ep-cbba74889fe44638`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objDelete. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/db/accessories/AccessoryRepository$delete$7.java:60` in `AccessoryRepository$delete$7.invokeSuspend`: path:network_id = `this.$networkId`; body = `new DeleteAccessoryBody(this.$accessorySerial)`; result `assigned:objDelete`
  - `com/immediasemi/blink/p021db/accessories/AccessoryRepository$delete$7.java:60` in `AccessoryRepository$delete$7.invokeSuspend`: path:network_id = `this.$networkId`; body = `new DeleteAccessoryBody(this.$accessorySerial)`; result `assigned:objDelete`

### POST `v1/accounts/{injected_account_id}/networks/{network_id}/accessories/rosie/owl/{owl_id}/calibrate`

- Endpoint ID: `ep-b29bd8f8fe55dcf5`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: returned, assigned:objCalibrateRosie. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/db/accessories/AccessoryRepository.java:159` in `AccessoryRepository.invokeSuspend`: path:network_id = `0L`; path:owl_id = `0L`; result `returned`
  - `com/immediasemi/blink/db/accessories/AccessoryRepository.java:798` in `AccessoryRepository.invokeSuspend`: path:network_id = `this.$networkId`; path:owl_id = `this.$owlId`; result `assigned:objCalibrateRosie`
  - `com/immediasemi/blink/p021db/accessories/AccessoryRepository.java:162` in `AccessoryRepository.invokeSuspend`: path:network_id = `0L`; path:owl_id = `0L`; result `returned`
  - `com/immediasemi/blink/p021db/accessories/AccessoryRepository.java:1122` in `AccessoryRepository.invokeSuspend`: path:network_id = `this.$networkId`; path:owl_id = `this.$owlId`; result `assigned:objCalibrateRosie`

### POST `v1/accounts/{injected_account_id}/networks/{network_id}/cameras/{camera_id}/snooze`

- Endpoint ID: `ep-0fbb0762bfd449a3`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$snooze$2$1.java:55` in `ClassicCameraService$snooze$2$1.invokeSuspend`: path:network_id = `this.$networkId`; path:camera_id = `this.$it.getServerId()`; body = `new SnoozeBody(this.$snoozeDuration)`; result `invoked`
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$snoozeDevice$2$1.java:53` in `ClassicCameraService$snoozeDevice$2$1.invokeSuspend`: path:network_id = `this.$it.getNetworkId()`; path:camera_id = `this.$it.getServerId()`; body = `new SnoozeBody(this.$snoozeDuration)`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network_id}/cameras/{camera_id}/unsnooze`

- Endpoint ID: `ep-1c0cef338b430431`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$unSnooze$2$1.java:52` in `ClassicCameraService$unSnooze$2$1.invokeSuspend`: path:network_id = `this.$networkId`; path:camera_id = `this.$it.getServerId()`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/change_mode`

- Endpoint ID: `ep-9818c1857c61b8bf`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objLotusChangeMode. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/lotus/migrate2lfr/MigrateToLFRViewModel$migrate$1$2$1.java:59` in `MigrateToLFRViewModel$migrate$1$2$1.invokeSuspend`: path:network_id = `this.$networkId`; path:doorbell_id = `this.$serverLotusId`; result `assigned:objLotusChangeMode`

### POST `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/change_wifi`

- Endpoint ID: `ep-6827d2d29b24e6f0`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objChangeLotusWifi. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/AddDeviceRepository$changeLotusWifi$2.java:62` in `AddDeviceRepository$changeLotusWifi$2.invokeSuspend`: body = `this.$onboardingBody`; path:network_id = `this.$networkId`; path:doorbell_id = `this.$doorbellId`; result `assigned:objChangeLotusWifi`

### POST `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/clear_creds`

- Endpoint ID: `ep-096eff7b4794af07`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objLotusClearCreds. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/lotus/migrate2lfr/MigrateToLFRViewModel.java:176` in `MigrateToLFRViewModel.invokeSuspend`: path:network_id = `this.$networkId`; path:doorbell_id = `this.$serverLotusId`; result `assigned:objLotusClearCreds`

### POST `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/stay_awake`

- Endpoint ID: `ep-15ed83281970313d`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objKeepLotusAwake. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/lotus/LotusOnboardingRepository$keepLotusAwake$2.java:59` in `LotusOnboardingRepository$keepLotusAwake$2.invokeSuspend`: path:network_id = `this.$networkId`; path:doorbell_id = `this.$doorbellId`; result `assigned:objKeepLotusAwake`

### POST `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{lotus_id}/snooze`

- Endpoint ID: `ep-266811b44a8d0639`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$snooze$2$1.java:55` in `DoorbellService$snooze$2$1.invokeSuspend`: path:network_id = `this.$networkId`; path:lotus_id = `this.$it.getServerId()`; body = `new SnoozeBody(this.$snoozeDuration)`; result `invoked`
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$snoozeDevice$2$1.java:54` in `DoorbellService$snoozeDevice$2$1.invokeSuspend`: path:network_id = `this.$it.getNetworkId()`; path:lotus_id = `this.$it.getServerId()`; body = `new SnoozeBody(this.$snoozeDuration)`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{lotus_id}/unsnooze`

- Endpoint ID: `ep-ce5743b18da8f3c8`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$unSnooze$2$1.java:53` in `DoorbellService$unSnooze$2$1.invokeSuspend`: path:network_id = `this.$networkId`; path:lotus_id = `this.$it.getServerId()`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/accessories/rosie/{rosie_id}/delete`

- Endpoint ID: `ep-450df784414973f0`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/db/accessories/AccessoryRepository$deleteRosieFromOwl$2.java:55` in `AccessoryRepository$deleteRosieFromOwl$2.invokeSuspend`: path:network_id = `this.$networkId`; path:owl_id = `this.$owlId`; path:rosie_id = `this.$rosieId`; result `invoked`
  - `com/immediasemi/blink/p021db/accessories/AccessoryRepository$deleteRosieFromOwl$2.java:55` in `AccessoryRepository$deleteRosieFromOwl$2.invokeSuspend`: path:network_id = `this.$networkId`; path:owl_id = `this.$owlId`; path:rosie_id = `this.$rosieId`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/snooze`

- Endpoint ID: `ep-d8d301dac91865e3`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$snooze$2$1.java:55` in `OwlService$snooze$2$1.invokeSuspend`: path:network_id = `this.$networkId`; path:owl_id = `this.$it.getServerId()`; body = `new SnoozeBody(this.$snoozeDuration)`; result `invoked`
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$snoozeDevice$2$1.java:53` in `OwlService$snoozeDevice$2$1.invokeSuspend`: path:network_id = `this.$it.getNetworkId()`; path:owl_id = `this.$it.getServerId()`; body = `new SnoozeBody(this.$snoozeDuration)`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/unsnooze`

- Endpoint ID: `ep-d8a01c2af871b805`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$unSnooze$2$1.java:52` in `OwlService$unSnooze$2$1.invokeSuspend`: path:network_id = `this.$networkId`; path:owl_id = `this.$it.getServerId()`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network_id}/snooze`

- Endpoint ID: `ep-da1f6005d8d19f73`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/camera/snooze/notification/SnoozeNotificationsRepository$snoozeSystem$2.java:53` in `SnoozeNotificationsRepository$snoozeSystem$2.invokeSuspend`: path:network_id = `this.$networkId`; body = `new SnoozeBody(this.$snoozeDuration)`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network_id}/state/disarm`

- Endpoint ID: `ep-aefeef329eb11b8e`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objDisarmNetwork. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Recovered workflow:
  1. Launch the REST arm/disarm repository operation while a separate coroutine invokes the RDIS arm use case. Evidence: `smali_classes10/com/immediasemi/blink/apphome/ui/systems/system/SystemViewModel$armDisarmSystem$2.smali:415`, `smali_classes10/com/immediasemi/blink/apphome/ui/systems/system/SystemViewModel$armDisarmSystem$1.smali:237`.
  2. If the returned Kommand has a nonzero identifier, poll command status at a one-second interval until a terminal result. Evidence: `smali_classes10/com/immediasemi/blink/apphome/ui/systems/system/SystemViewModel$armDisarmSystem$2.smali:526`, `smali_classes10/com/immediasemi/blink/apphome/ui/systems/system/SystemViewModel$armDisarmSystem$2.smali:596`.
  3. Request an immediate homescreen synchronization after terminal success or failure; failure retains rollback UI state and emits the REST error path. Evidence: `smali_classes10/com/immediasemi/blink/apphome/ui/systems/system/SystemViewModel$armDisarmSystem$2.smali:626`, `smali_classes10/com/immediasemi/blink/apphome/ui/systems/system/SystemViewModel$armDisarmSystem$2.smali:901`.
- Direct call sites:
  - `com/immediasemi/blink/db/RoomNetworkRepository$disarmNetwork$2.java:57` in `RoomNetworkRepository$disarmNetwork$2.invokeSuspend`: path:network_id = `this.$networkId`; result `assigned:objDisarmNetwork`
  - `com/immediasemi/blink/p021db/RoomNetworkRepository$disarmNetwork$2.java:57` in `RoomNetworkRepository$disarmNetwork$2.invokeSuspend`: path:network_id = `this.$networkId`; result `assigned:objDisarmNetwork`

### POST `v1/accounts/{injected_account_id}/networks/{network_id}/unsnooze`

- Endpoint ID: `ep-dace5fe430b691f6`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/camera/snooze/notification/SnoozeNotificationsRepository$unSnoozeSystem$2.java:50` in `SnoozeNotificationsRepository$unSnoozeSystem$2.invokeSuspend`: path:network_id = `this.$networkId`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network}/accessories/add`

- Endpoint ID: `ep-fef625b03ba1c03d`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objAddAccessory. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/db/accessories/AccessoryRepository.java:897` in `AccessoryRepository.invokeSuspend`: body = `new AddAccessoryBody(this.$accessorySerial, this.$serialNumber)`; path = `this.$networkId`; result `assigned:objAddAccessory`
  - `com/immediasemi/blink/p021db/accessories/AccessoryRepository.java:1288` in `AccessoryRepository.invokeSuspend`: body = `new AddAccessoryBody(this.$accessorySerial, this.$serialNumber)`; path = `this.$networkId`; result `assigned:objAddAccessory`

### POST `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/calibrate`

- Endpoint ID: `ep-8c626d47b7cb69e5`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objSaveCalibrateTemperature. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$saveCalibrateTemperature$2$1.java:60` in `ClassicCameraService$saveCalibrateTemperature$2$1.invokeSuspend`: body = `this.$temperatureCalibrationPostBody`; path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; result `assigned:objSaveCalibrateTemperature`

### GET `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs`

- Endpoint ID: `ep-8c7e03dbce0d190b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:cameraPrograms. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$getPrograms$2$1.java:57` in `ClassicCameraService$getPrograms$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; result `assigned:cameraPrograms`

### POST `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/delete`

- Endpoint ID: `ep-c718fc0f466736bb`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$deleteProgram$2$1.java:52` in `ClassicCameraService$deleteProgram$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; path:program = `this.$programId`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/disable`

- Endpoint ID: `ep-af11708004605056`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$disableProgram$2$1.java:53` in `ClassicCameraService$disableProgram$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; path:program = `this.$programId`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/enable`

- Endpoint ID: `ep-3f7ff2ac995637e1`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$enableProgram$2$1.java:52` in `ClassicCameraService$enableProgram$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; path:program = `this.$programId`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/update`

- Endpoint ID: `ep-5b3194cadb38ef96`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objUpdateCameraProgram. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$updateProgram$2$1.java:63` in `ClassicCameraService$updateProgram$2$1.invokeSuspend`: body = `this.$request`; path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; path:program = `this.$programId`; result `assigned:objUpdateCameraProgram`

### POST `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/create`

- Endpoint ID: `ep-61fda4587be9b4eb`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objCreateCameraProgram. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$createProgram$2$1.java:60` in `ClassicCameraService$createProgram$2$1.invokeSuspend`: body = `this.$request`; path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; result `assigned:objCreateCameraProgram`

### POST `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/temp_alert_disable`

- Endpoint ID: `ep-632404d0f82d9dd7`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$toggleTempAlert$2$2.java:50` in `ClassicCameraService$toggleTempAlert$2$2.invokeSuspend`: path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/temp_alert_enable`

- Endpoint ID: `ep-ef2f553ffb7d762e`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$toggleTempAlert$2$1.java:50` in `ClassicCameraService$toggleTempAlert$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; result `invoked`

### GET `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones`

- Endpoint ID: `ep-cbaeae5235ce259b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:zones. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$getZones$2$1.java:58` in `ClassicCameraService$getZones$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; result `assigned:zones`

### POST `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones`

- Endpoint ID: `ep-344fc99c67fdc928`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:zones. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$setZones$2$1.java:60` in `ClassicCameraService$setZones$2$1.invokeSuspend`: body = `this.$zones`; path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; result `assigned:zones`

### GET `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config`

- Endpoint ID: `ep-b3f5a751f3c68a05`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:lotusChimeConfig. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/lotus/chime/ChimeConfigRepository$getChimeConfig$2.java:61` in `ChimeConfigRepository$getChimeConfig$2.invokeSuspend`: path:chimeType = `this.$chimeType`; path = `this.$networkId`; path = `this.$lotusId`; result `assigned:lotusChimeConfig`

### POST `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config`

- Endpoint ID: `ep-042e5a821fc63cd4`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:lotusChimeConfig. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/lotus/chime/ChimeConfigRepository$saveConfig$2.java:65` in `ChimeConfigRepository$saveConfig$2.invokeSuspend`: path:chimeType = `this.$chimeType`; path = `this.$networkId`; path = `Camera.INSTANCE.getServerIdFromLocalId(this.$lotusId)`; body = `new UpdateLotusChimeConfig(this.$duration)`; result `assigned:lotusChimeConfig`

### GET `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/config`

- Endpoint ID: `ep-c876482a8cf4332b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:doorbellConfig. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/lotus/chime/PowerAnalysisViewModel$tryPowerAnalysis$2$1.java:59` in `PowerAnalysisViewModel$tryPowerAnalysis$2$1.invokeSuspend`: path = `this.$networkId`; path = `this.$lotusId`; result `assigned:doorbellConfig`
  - `com/immediasemi/blink/adddevice/lotus/LotusOnboardingRepository$getLotusConfigSuspend$2.java:59` in `LotusOnboardingRepository$getLotusConfigSuspend$2.invokeSuspend`: path = `this.$networkId`; path = `this.$lotusId`; result `assigned:doorbellConfig`
  - `com/immediasemi/blink/adddevice/lotus/LotusOnboardingViewModel$checkLotusAwake$1$1$1.java:60` in `LotusOnboardingViewModel$checkLotusAwake$1$1$1.invokeSuspend`: path = `this.this$0.getNetworkId()`; path = `this.$lotusId`; result `assigned:doorbellConfig`
  - `com/immediasemi/blink/adddevice/lotus/migrate2lfr/EventResponseInfoViewModel$isLotusAsleep$2.java:59` in `EventResponseInfoViewModel$isLotusAsleep$2.invokeSuspend`: path = `this.$networkId`; path = `this.$serverLotusId`; result `assigned:doorbellConfig`
  - `com/immediasemi/blink/adddevice/lotus/RingDoorbellToWakeViewModel.java:202` in `RingDoorbellToWakeViewModel.invokeSuspend`: path = `this.$networkId`; path = `this.$serverLotusId`; result `assigned:doorbellConfig`
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$getSettings$2$1.java:57` in `DoorbellService$getSettings$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; result `assigned:doorbellConfig`

### POST `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/power_test`

- Endpoint ID: `ep-d466df32cc1d5006`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPerformLotusPowerAnalysis. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/lotus/chime/ChimeConfigRepository$performPowerAnalysis$2.java:59` in `ChimeConfigRepository$performPowerAnalysis$2.invokeSuspend`: path = `this.$networkId`; path = `this.$lotusId`; result `assigned:objPerformLotusPowerAnalysis`

### POST `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/trigger_chime`

- Endpoint ID: `ep-c6c18be4e0d67f2e`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objTestLotusDing. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/lotus/chime/ChimeConfigRepository$testDing$2.java:62` in `ChimeConfigRepository$testDing$2.invokeSuspend`: path = `this.$networkId`; path = `this.$lotusId`; body = `this.$dingConfig`; result `assigned:objTestLotusDing`

### POST `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/calibrate`

- Endpoint ID: `ep-084094b4a5dd55a7`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostTemperatureCalibration. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$saveCalibrateTemperature$2$1.java:60` in `DoorbellService$saveCalibrateTemperature$2$1.invokeSuspend`: body = `this.$temperatureCalibrationPostBody`; path = `this.$it.getNetworkId()`; path:doorbellId = `this.$it.getServerId()`; result `assigned:objPostTemperatureCalibration`

### POST `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/temp_alert_disable`

- Endpoint ID: `ep-d55bd7776833049c`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$toggleTempAlert$2$2.java:50` in `DoorbellService$toggleTempAlert$2$2.invokeSuspend`: path = `this.$it.getNetworkId()`; path:doorbellId = `this.$it.getServerId()`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/temp_alert_enable`

- Endpoint ID: `ep-a635ae215204ae88`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$toggleTempAlert$2$1.java:51` in `DoorbellService$toggleTempAlert$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path:doorbellId = `this.$it.getServerId()`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/disable`

- Endpoint ID: `ep-0dc3d08e282a30c5`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostDisableLotus. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$disableMotionDetection$2$1.java:57` in `DoorbellService$disableMotionDetection$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path:lotus = `this.$it.getServerId()`; result `assigned:objPostDisableLotus`

### POST `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/enable`

- Endpoint ID: `ep-7f8b5a163214bebc`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostEnableLotus. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$enableMotionDetection$2$1.java:57` in `DoorbellService$enableMotionDetection$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path:lotus = `this.$it.getServerId()`; result `assigned:objPostEnableLotus`

### POST `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/status`

- Endpoint ID: `ep-a265bf2c875ace10`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objRefreshLotusStatus. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/onboard/OnboardingRepository.java:297` in `OnboardingRepository.invokeSuspend`: path = `this.$networkId`; path:lotus = `this.$doorbellId`; result `assigned:objRefreshLotusStatus`

### POST `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/status`

- Endpoint ID: `ep-2568b360ce438de7`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objRefreshLotusStatusSuspend. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/lotus/CheckLotusConnectionsViewModel$checkLotusConnection$1$response$1.java:90` in `CheckLotusConnectionsViewModel$checkLotusConnection$1$response$1.invokeSuspend`: path = `this.$networkId`; path:lotus = `this.$lotusId`; result `assigned:objRefreshLotusStatusSuspend`

### POST `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/thumbnail`

- Endpoint ID: `ep-dbf85fde7df433cd`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostThumbnail. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$requestThumbnail$2$1.java:59` in `DoorbellService$requestThumbnail$2$1.invokeSuspend`: path = `this.$networkId`; path:lotus = `this.$it.getServerId()`; result `assigned:objPostThumbnail`
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$takeThumbnail$2$1.java:60` in `DoorbellService$takeThumbnail$2$1.invokeSuspend`: path = `this.$networkId`; path:lotus = `this.$it.getServerId()`; result `assigned:objPostThumbnail`

### GET `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones`

- Endpoint ID: `ep-f6653afe56cb3375`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:lotusZones. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$getZones$2$1.java:57` in `DoorbellService$getZones$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path:lotus = `this.$it.getServerId()`; result `assigned:lotusZones`

### POST `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones`

- Endpoint ID: `ep-9530c34614575658`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:lotusZones. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$setZones$2$1.java:60` in `DoorbellService$setZones$2$1.invokeSuspend`: body = `this.$zones`; path = `this.$it.getNetworkId()`; path:lotus = `this.$it.getServerId()`; result `assigned:lotusZones`

### POST `v1/accounts/{injected_account_id}/networks/{network}/doorbells/add`

- Endpoint ID: `ep-6d21672546747e6d`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objAddLotus. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/AddDeviceRepository$startLotusOnboarding$2.java:60` in `AddDeviceRepository$startLotusOnboarding$2.invokeSuspend`: body = `this.$addLotusBody`; path = `this.$networkId`; result `assigned:objAddLotus`
  - `com/immediasemi/blink/adddevice/lotus/AddingStepViewModel$addLotus$1$response$1.java:102` in `AddingStepViewModel$addLotus$1$response$1.invokeSuspend`: body = `new AddLotusBody(this.$serialNumber, LotusDoorbellMode.LFR.getMode(), this.$registrationName)`; path = `this.$networkId`; result `assigned:objAddLotus`
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$addDevice$2.java:62` in `DoorbellService$addDevice$2.invokeSuspend`: body = `new AddLotusBody(this.$serialNumber, LotusDoorbellMode.LFR.getMode(), this.$registrationName)`; path = `this.$systemId`; result `assigned:objAddLotus`

### GET `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs`

- Endpoint ID: `ep-d7b57317ad888d4c`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:owlPrograms. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$getPrograms$2$1.java:58` in `OwlService$getPrograms$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path:owl = `this.$it.getServerId()`; result `assigned:owlPrograms`

### POST `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/delete`

- Endpoint ID: `ep-a8bfc0ac9eb8bc0a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$deleteProgram$2$1.java:52` in `OwlService$deleteProgram$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path:owl = `this.$it.getServerId()`; path:program = `this.$programId`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/disable`

- Endpoint ID: `ep-d279bbc08fca6923`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$disableProgram$2$1.java:52` in `OwlService$disableProgram$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path:owl = `this.$it.getServerId()`; path:program = `this.$programId`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/enable`

- Endpoint ID: `ep-1b124452a375f255`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$enableProgram$2$1.java:52` in `OwlService$enableProgram$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path:owl = `this.$it.getServerId()`; path:program = `this.$programId`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/update`

- Endpoint ID: `ep-5ab8ca85dfbccbe8`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objUpdateOwlProgram. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$updateProgram$2$1.java:62` in `OwlService$updateProgram$2$1.invokeSuspend`: body = `this.$request`; path = `this.$it.getNetworkId()`; path:owl = `this.$it.getServerId()`; path:program = `this.$programId`; result `assigned:objUpdateOwlProgram`

### POST `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/create`

- Endpoint ID: `ep-60c3d59caf3daeb7`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objCreateOwlProgram. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$createProgram$2$1.java:61` in `OwlService$createProgram$2$1.invokeSuspend`: body = `this.$request`; path = `this.$it.getNetworkId()`; path:owl = `this.$it.getServerId()`; result `assigned:objCreateOwlProgram`

### POST `v1/accounts/{injected_account_id}/networks/{network}/owls/add`

- Endpoint ID: `ep-a3062b6d71bf5844`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostAddOwl. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$addDevice$2.java:59` in `OwlService$addDevice$2.invokeSuspend`: body = `new AddOwlPostBody(this.$serialNumber, this.$registrationName)`; path = `this.$systemId`; result `assigned:objPostAddOwl`
  - `com/immediasemi/blink/device/onboard/OnboardingRepository$addOwl$2.java:62` in `OnboardingRepository$addOwl$2.invokeSuspend`: body = `new AddOwlPostBody(this.$serialNumber, this.$automaticDeviceName)`; path = `this.$networkId`; result `assigned:objPostAddOwl`

### POST `v1/accounts/{injected_account_id}/networks/{network}/owls/add`

- Endpoint ID: `ep-109c07b97b027ed5`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objStartOwlOnboardingOld. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/AddDeviceRepository$startOwlOnboarding$2.java:60` in `AddDeviceRepository$startOwlOnboarding$2.invokeSuspend`: body = `this.$onboardingBody`; path = `this.$networkId`; result `assigned:objStartOwlOnboardingOld`

### GET `v1/accounts/{injected_account_id}/networks/{network}/programs`

- Endpoint ID: `ep-2fc8234efc6924ab`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:programs. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/scheduling/ProgramCoroutines.java:111` in `ProgramCoroutines.invokeSuspend`: path = `this.$networkId`; result `assigned:programs`

### POST `v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/delete`

- Endpoint ID: `ep-710c55c98e257aad`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/scheduling/ProgramCoroutines.java:505` in `ProgramCoroutines.invokeSuspend`: path = `this.$networkId`; path:program = `this.$programId`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/disable`

- Endpoint ID: `ep-da5c20aa273a6945`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/scheduling/ProgramCoroutines.java:1029` in `ProgramCoroutines.invokeSuspend`: path = `this.$networkId`; path:program = `this.$programId`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/enable`

- Endpoint ID: `ep-d16143e64bd9580d`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/scheduling/ProgramCoroutines.java:913` in `ProgramCoroutines.invokeSuspend`: path = `this.$networkId`; path:program = `this.$programId`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/update`

- Endpoint ID: `ep-7d76e29b63fcbb39`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/scheduling/ProgramCoroutines.java:711` in `ProgramCoroutines.invokeSuspend`: body = `this.$request`; path = `this.$networkId`; path:program = `this.$programId`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{network}/programs/create`

- Endpoint ID: `ep-89e311e6dcdd86eb`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/scheduling/ProgramCoroutines.java:303` in `ProgramCoroutines.invokeSuspend`: body = `this.$program`; path = `this.$networkId`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{camera}/accessories/{accessoryType}/{accessoryId}/delete`

- Endpoint ID: `ep-d76598751e9d856d`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/db/accessories/AccessoryRepository$delete$5$2.java:56` in `AccessoryRepository$delete$5$2.invokeSuspend`: path:networkId = `this.$networkId`; path = `this.$cameraId`; path:accessoryType = `this.$type`; path:accessoryId = `this.$id`; result `invoked`
  - `com/immediasemi/blink/p021db/accessories/AccessoryRepository$delete$5$2.java:56` in `AccessoryRepository$delete$5$2.invokeSuspend`: path:networkId = `this.$networkId`; path = `this.$cameraId`; path:accessoryType = `this.$type`; path:accessoryId = `this.$id`; result `invoked`

### GET `v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/network_type`

- Endpoint ID: `ep-d8e84ece35e63f6f`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:videoNetworkType. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$getVideoNetwork$2$1.java:57` in `ClassicCameraService$getVideoNetwork$2$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path:cameraId = `this.$it.getServerId()`; result `assigned:videoNetworkType`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/network_type`

- Endpoint ID: `ep-00d48636ccde1dea`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostVideoNetworkType. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$setVideoNetwork$2$1.java:61` in `ClassicCameraService$setVideoNetwork$2$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path:cameraId = `this.$it.getServerId()`; body = `new VideoNetworkTypeBody(this.$networkType.getTag())`; result `assigned:objPostVideoNetworkType`

### GET `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/list`

- Endpoint ID: `ep-ad00e66f9c9a1fb1`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:chimeCameras. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$getChimeCameras$2$1.java:57` in `DoorbellService$getChimeCameras$2$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path:doorbellId = `this.$it.getServerId()`; result `assigned:chimeCameras`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/update`

- Endpoint ID: `ep-831d939a6990bb9a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$setChimeCameras$2$2.java:76` in `DoorbellService$setChimeCameras$2$2.invokeSuspend`: path:networkId = `networkId`; path:doorbellId = `serverId`; body = `new ChimeCamerasPostBody(arrayList2, arrayList3)`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/config`

- Endpoint ID: `ep-dc94f5202adad791`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostDoorbellConfig. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$saveSettings$2$1.java:62` in `DoorbellService$saveSettings$2$1.invokeSuspend`: body = `UpdateLotusBody.INSTANCE.invoke(this.$updateCameraBody)`; path:networkId = `this.$it.getNetworkId()`; path:lotusId = `this.$it.getServerId()`; result `assigned:objPostDoorbellConfig`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/delete`

- Endpoint ID: `ep-4237f2fd956b1155`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$deleteDevice$2$1.java:50` in `DoorbellService$deleteDevice$2$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path:lotusId = `this.$it.getServerId()`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/status`

- Endpoint ID: `ep-19c9e8a1748f8b8e`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostDoorbellStatusCommand. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$refreshStatus$2$1.java:57` in `DoorbellService$refreshStatus$2$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path:lotusId = `this.$it.getServerId()`; result `assigned:objPostDoorbellStatusCommand`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/ob_cancel`

- Endpoint ID: `ep-e0dfeb97686310e9`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/onboard/CancelOnboardingUseCase.java:130` in `CancelOnboardingUseCase.invokeSuspend`: body = `new CancelOnboardingPostBody(this.$sosSerial)`; path:networkId = `this.$networkId.longValue()`; result `invoked`
  - `com/immediasemi/blink/device/onboard/OnboardingRepository$cancelSosSetup$2.java:53` in `OnboardingRepository$cancelSosSetup$2.invokeSuspend`: body = `new CancelOnboardingPostBody(this.$serial)`; path:networkId = `this.$networkId`; result `invoked`
  - `com/immediasemi/blink/utils/SyncManager.java:2163` in `SyncManager.invokeSuspend`: body = `new CancelOnboardingPostBody(this.$serial)`; path:networkId = `this.$networkId`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/accessories/{accessoryType}/{accessoryId}/delete`

- Endpoint ID: `ep-b4077c526347fb83`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/db/accessories/AccessoryRepository$delete$5$1.java:58` in `AccessoryRepository$delete$5$1.invokeSuspend`: path:networkId = `this.$networkId`; path = `Camera.INSTANCE.getServerIdFromLocalId(this.$cameraId)`; path:accessoryType = `this.$type`; path:accessoryId = `this.$id`; result `invoked`
  - `com/immediasemi/blink/p021db/accessories/AccessoryRepository$delete$5$1.java:58` in `AccessoryRepository$delete$5$1.invokeSuspend`: path:networkId = `this.$networkId`; path = `Camera.INSTANCE.getServerIdFromLocalId(this.$cameraId)`; path:accessoryType = `this.$type`; path:accessoryId = `this.$id`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/lights/{lightControl}`

- Endpoint ID: `ep-12e2685e03176581`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostLight. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$toggleLight$2$1.java:60` in `OwlService$toggleLight$2$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; path:lightControl = `this.$lightControl`; result `assigned:objPostLight`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/lights/{lightControl}`

- Endpoint ID: `ep-9cc88ddec606f946`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/change_wifi`

- Endpoint ID: `ep-5f5eb0c280d9d5db`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objChangeOwlWifi. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/AddDeviceRepository$changeOwlWifi$2.java:62` in `AddDeviceRepository$changeOwlWifi$2.invokeSuspend`: body = `this.$onboardingBody`; path:networkId = `this.$networkId`; path:owlId = `this.$owlId`; result `assigned:objChangeOwlWifi`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/change_wifi`

- Endpoint ID: `ep-afe63598aefa2032`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostChangeOwlWifi. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/wifi/WifiRepository$changeOwlWifi$2.java:65` in `WifiRepository$changeOwlWifi$2.invokeSuspend`: body = `new AddOwlPostBody(this.$serialNumber, this.$automaticDeviceName)`; path:networkId = `this.$networkId`; path:owlId = `this.$deviceId`; result `assigned:objPostChangeOwlWifi`

### GET `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config`

- Endpoint ID: `ep-1fbad8691d111500`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:owlConfig. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$getSettings$2$1.java:57` in `OwlService$getSettings$2$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path:owlId = `this.$it.getServerId()`; result `assigned:owlConfig`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config`

- Endpoint ID: `ep-0ee4521e672893f5`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostOwlConfig. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$saveSettings$2$1.java:61` in `OwlService$saveSettings$2$1.invokeSuspend`: body = `new UpdateOwlBody(this.$updateCameraBody)`; path:networkId = `this.$it.getNetworkId()`; path:owlId = `this.$it.getServerId()`; result `assigned:objPostOwlConfig`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config`

- Endpoint ID: `ep-565c2b0d69c127b8`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostOwlConfigCommand. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$disableMotionDetection$2$1.java:58` in `OwlService$disableMotionDetection$2$1.invokeSuspend`: body = `new UpdateOwlBody(false)`; path:networkId = `this.$it.getNetworkId()`; path:owlId = `this.$it.getServerId()`; result `assigned:objPostOwlConfigCommand`
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$enableMotionDetection$2$1.java:58` in `OwlService$enableMotionDetection$2$1.invokeSuspend`: body = `new UpdateOwlBody(true)`; path:networkId = `this.$it.getNetworkId()`; path:owlId = `this.$it.getServerId()`; result `assigned:objPostOwlConfigCommand`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/delete`

- Endpoint ID: `ep-ab83e8fb636a7508`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$deleteDevice$2$1.java:50` in `OwlService$deleteDevice$2$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path:owlId = `this.$it.getServerId()`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/status`

- Endpoint ID: `ep-3a8fd324f12cf59b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostOwlStatusCommand. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$refreshStatus$2$1.java:57` in `OwlService$refreshStatus$2$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path:owlId = `this.$it.getServerId()`; result `assigned:objPostOwlStatusCommand`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/thumbnail`

- Endpoint ID: `ep-bfcf8feca89fb5d7`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostThumbnail. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$requestThumbnail$2$1.java:59` in `OwlService$requestThumbnail$2$1.invokeSuspend`: path:networkId = `this.$networkId`; path:owlId = `this.$it.getServerId()`; result `assigned:objPostThumbnail`
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$takeThumbnail$2$1.java:60` in `OwlService$takeThumbnail$2$1.invokeSuspend`: path:networkId = `this.$networkId`; path:owlId = `this.$it.getServerId()`; result `assigned:objPostThumbnail`

### DELETE `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/pair`

- Endpoint ID: `ep-586a0a3ec6a619dc`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/group/PairCamerasRepository$deleteCameraPair$2.java:52` in `PairCamerasRepository$deleteCameraPair$2.invokeSuspend`: path:networkId = `this.$networkId`; path:primary_id = `this.$primaryId`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/pair`

- Endpoint ID: `ep-a3832caa88494b4e`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/group/PairCamerasRepository$pairCameras$2.java:55` in `PairCamerasRepository$pairCameras$2.invokeSuspend`: path:networkId = `this.$networkId`; path:primary_id = `this.$primaryId`; body = `new PairCameraBody(this.$secondaryId)`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/swap_pair`

- Endpoint ID: `ep-91d85c6df4042f3e`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/group/PairCamerasRepository$swapCameraPair$2.java:55` in `PairCamerasRepository$swapCameraPair$2.invokeSuspend`: path:networkId = `this.$networkId`; path:primary_id = `this.$primaryId`; body = `new SwapCameraBody(this.$secondaryId)`; result `invoked`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/state/{type}`

- Endpoint ID: `ep-7f617755879ae4e0`
- Call-site recovery: `unresolved`
- Request construction: No unique first-party invocation was recovered from retained JADX sources.
- Response handling: Runtime response handling remains unresolved.
- Sequencing signals: none recovered
- Direct call sites: none uniquely attributable in retained JADX sources

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/state/arm`

- Endpoint ID: `ep-6661a6737fc55df4`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostArmNetwork. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Recovered workflow:
  1. Launch the REST arm/disarm repository operation while a separate coroutine invokes the RDIS arm use case. Evidence: `smali_classes10/com/immediasemi/blink/apphome/ui/systems/system/SystemViewModel$armDisarmSystem$2.smali:393`, `smali_classes10/com/immediasemi/blink/apphome/ui/systems/system/SystemViewModel$armDisarmSystem$1.smali:237`.
  2. If the returned Kommand has a nonzero identifier, poll command status at a one-second interval until a terminal result. Evidence: `smali_classes10/com/immediasemi/blink/apphome/ui/systems/system/SystemViewModel$armDisarmSystem$2.smali:526`, `smali_classes10/com/immediasemi/blink/apphome/ui/systems/system/SystemViewModel$armDisarmSystem$2.smali:596`.
  3. Request an immediate homescreen synchronization after terminal success or failure; failure retains rollback UI state and emits the REST error path. Evidence: `smali_classes10/com/immediasemi/blink/apphome/ui/systems/system/SystemViewModel$armDisarmSystem$2.smali:626`, `smali_classes10/com/immediasemi/blink/apphome/ui/systems/system/SystemViewModel$armDisarmSystem$2.smali:901`.
- Direct call sites:
  - `com/immediasemi/blink/db/RoomNetworkRepository$armNetwork$2.java:57` in `RoomNetworkRepository$armNetwork$2.invokeSuspend`: path:networkId = `this.$networkId`; result `assigned:objPostArmNetwork`
  - `com/immediasemi/blink/p021db/RoomNetworkRepository$armNetwork$2.java:57` in `RoomNetworkRepository$armNetwork$2.invokeSuspend`: path:networkId = `this.$networkId`; result `assigned:objPostArmNetwork`

### DELETE `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage`

- Endpoint ID: `ep-8ff180507e05b9f7`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:deleteAllKommand. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/video/clip/BlinkClipListRepository$deleteAll$2.java:59` in `BlinkClipListRepository$deleteAll$2.invokeSuspend`: path:networkId = `this.$networkId`; path:syncModuleId = `this.$syncModuleId`; result `assigned:deleteAllKommand`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/eject`

- Endpoint ID: `ep-d4ed1109ace27163`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objEjectUsbStorage. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/sync/LocalStorageRepository$ejectUsb$2.java:89` in `LocalStorageRepository$ejectUsb$2.invokeSuspend`: path:networkId = `this.$networkId`; path:syncModuleId = `this.$syncModuleId`; result `assigned:objEjectUsbStorage`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/format`

- Endpoint ID: `ep-0d850e02127813af`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:usbStorage. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/sync/LocalStorageRepository$formatUsb$2.java:89` in `LocalStorageRepository$formatUsb$2.invokeSuspend`: path:networkId = `this.$networkId`; path:syncModuleId = `this.$syncModuleId`; result `assigned:usbStorage`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/delete/{clipId}`

- Endpoint ID: `ep-22dc587aa7d8b334`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:deleteLocalStorageMediaKommand. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/video/clip/BlinkClipListRepository$deleteLocalStorageMedia$2.java:63` in `BlinkClipListRepository$deleteLocalStorageMedia$2.invokeSuspend`: path:networkId = `this.$networkId`; path:syncModuleId = `this.$syncModuleId`; path:clipId = `this.$numericClipId`; path:manifestId = `this.$manifestId`; result `assigned:deleteLocalStorageMediaKommand`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/request/{clipId}`

- Endpoint ID: `ep-5bdb8595fbdec757`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:clipKommand. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/video/clip/BlinkClipListRepository$getClip$2.java:63` in `BlinkClipListRepository$getClip$2.invokeSuspend`: path:networkId = `this.$networkId`; path:syncModuleId = `this.$syncModuleId`; path:clipId = `this.$numericClipId`; path:manifestId = `this.$manifestId`; result `assigned:clipKommand`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/request`

- Endpoint ID: `ep-3c6ea4074bbe0b4e`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:localStorageManifestKommand. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/video/clip/BlinkClipListRepository$loadLocalStorageManifest$2.java:59` in `BlinkClipListRepository$loadLocalStorageManifest$2.invokeSuspend`: path:networkId = `this.$networkId`; path:syncModuleId = `this.$syncModuleId`; result `assigned:localStorageManifestKommand`

### GET `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/media/{commandId}`

- Endpoint ID: `ep-5975c0a2d87e8d8a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:localStorageMedia. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/video/clip/BlinkClipListRepository$getLocalStorageMedia$2.java:61` in `BlinkClipListRepository$getLocalStorageMedia$2.invokeSuspend`: path:networkId = `this.$networkId`; path:syncModuleId = `this.$syncModuleId`; path:commandId = `this.$kommandId`; result `assigned:localStorageMedia`

### POST `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/mount`

- Endpoint ID: `ep-622d067c8b1f1d95`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objMountUsb. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/sync/LocalStorageRepository$mountUsb$2.java:89` in `LocalStorageRepository$mountUsb$2.invokeSuspend`: path:networkId = `this.$networkId`; path:syncModuleId = `this.$syncModuleId`; result `assigned:objMountUsb`

### GET `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/status`

- Endpoint ID: `ep-0ded509fcca63ad4`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:localStorageStatus. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/device/sync/LocalStorageRepository$getLocalStorageStatus$2.java:58` in `LocalStorageRepository$getLocalStorageStatus$2.invokeSuspend`: path:networkId = `this.$networkId`; path:syncModuleId = `this.$syncModuleId`; result `assigned:localStorageStatus`

### POST `v1/accounts/{injected_account_id}/networks/bulk_location_assignment`

- Endpoint ID: `ep-fc58b029dbfd3495`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objBulkLocationAssignment. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/system/setting/SystemSettingsViewModel.java:381` in `SystemSettingsViewModel.invokeSuspend`: body = `new BulkLocationAssignmentRequest(this.$assignments)`; result `assigned:objBulkLocationAssignment`

### GET `v1/accounts/{injected_account_id}/owls/{serial}/fw_update`

- Endpoint ID: `ep-07f9f5c280e627a4`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objDownloadOwlFirmwareUpdate. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/activities/onboarding/OnboardingCoroutines$getFirmwareUpdate$1$2$response$2.java:58` in `OnboardingCoroutines$getFirmwareUpdate$1$2$response$2.invokeSuspend`: path:serial = `StringsKt.replace$default(this.$serialNumber, "-", "-", false, 4, (Object) null)`; result `assigned:objDownloadOwlFirmwareUpdate`

### GET `v1/accounts/{injected_account_id}/smart_video_descriptions`

- Endpoint ID: `ep-6d7efa4fbe0cebb2`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:smartVideoDescriptions. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/SmartVideoDescriptionsRepository$getSmartVideoDescriptions$2.java:55` in `SmartVideoDescriptionsRepository$getSmartVideoDescriptions$2.invokeSuspend`: query:ring_location_id = `this.$ringLocationId`; result `assigned:smartVideoDescriptions`

### POST `v1/accounts/{injected_account_id}/smart_video_descriptions`

- Endpoint ID: `ep-7354c0e1f36bb800`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/settings/SmartVideoDescriptionsRepository$updateSmartVideoDescriptions$2.java:50` in `SmartVideoDescriptionsRepository$updateSmartVideoDescriptions$2.invokeSuspend`: body = `this.$body`; result `invoked`

### POST `v1/accounts/{injected_account_id}/smart_video_descriptions/summarize`

- Endpoint ID: `ep-17d345056ba5de0e`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostSummarize. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/video/clip/moment/RestMomentDescriptionApi$getDescription$2.java:57` in `RestMomentDescriptionApi$getDescription$2.invokeSuspend`: body = `new SummarizeClipsRequest(this.$clipIds)`; result `assigned:objPostSummarize`

### GET `v1/accounts/{injected_account_id}/sync_modules/{serial}/fw_update`

- Endpoint ID: `ep-d3634137a3e2f99b`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objDownloadFirmwareUpdate. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/activities/onboarding/OnboardingCoroutines$getFirmwareUpdate$1$2$response$1.java:57` in `OnboardingCoroutines$getFirmwareUpdate$1$2$response$1.invokeSuspend`: path:serial = `this.$serialNumber`; result `assigned:objDownloadFirmwareUpdate`

### GET `v2/accounts/{injected_account_id}/devices/identify/{serialNumber}`

- Endpoint ID: `ep-8b8f68ee2cccacf4`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:deviceIdentity. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/activities/onboarding/OnboardingCoroutines.java:987` in `OnboardingCoroutines.invokeSuspend`: path:serialNumber = `StringsKt.replace$default(this.$serialNumber, "-", "", false, 4, (Object) null)`; result `assigned:deviceIdentity`
  - `com/immediasemi/blink/adddevice/SerialNumberScanFragment.java:339` in `SerialNumberScanFragment.invokeSuspend`: path:serialNumber = `StringsKt.replace$default(this.$serialNumber, "-", "", false, 4, (Object) null)`; result `assigned:deviceIdentity`
  - `com/immediasemi/blink/common/device/domain/DeviceRepository$getDeviceIdentity$2.java:57` in `DeviceRepository$getDeviceIdentity$2.invokeSuspend`: path:serialNumber = `this.$serialNumber`; result `assigned:deviceIdentity`

### GET `v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/config`

- Endpoint ID: `ep-ef35e6e7be3f835f`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:cameraConfig. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$getSettings$2$1.java:58` in `ClassicCameraService$getSettings$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; result `assigned:cameraConfig`

### GET `v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones`

- Endpoint ID: `ep-19df3574360e5e45`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:zonesV2. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$getZonesV2$2$1.java:58` in `ClassicCameraService$getZonesV2$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; result `assigned:zonesV2`

### POST `v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones`

- Endpoint ID: `ep-675c8fb103ba7252`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:zonesV2. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$setZonesV2$2$1.java:61` in `ClassicCameraService$setZonesV2$2$1.invokeSuspend`: body = `this.$zones`; path = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; result `assigned:zonesV2`

### GET `v2/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones`

- Endpoint ID: `ep-24cc7ca9f7dd194a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:zonesV2. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$getZonesV2$2$1.java:57` in `DoorbellService$getZonesV2$2$1.invokeSuspend`: path = `this.$it.getNetworkId()`; path:lotus = `this.$it.getServerId()`; result `assigned:zonesV2`

### POST `v2/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones`

- Endpoint ID: `ep-9bdd1ea937b50b2a`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:zonesV2. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$setZonesV2$2$1.java:60` in `DoorbellService$setZonesV2$2$1.invokeSuspend`: body = `this.$zones`; path = `this.$it.getNetworkId()`; path:lotus = `this.$it.getServerId()`; result `assigned:zonesV2`

### POST `v2/accounts/{injected_account_id}/networks/{networkId}/cameras/{camera}/light_accessories/{accessoryId}/lights/{lightControl}`

- Endpoint ID: `ep-dfc524b698fb44d9`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostAccessoryLight. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$toggleLight$2$1$1.java:63` in `ClassicCameraService$toggleLight$2$1$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path = `this.$it.getServerId()`; path:accessoryId = `this.$storm.getId()`; path:lightControl = `this.$lightControl`; result `assigned:objPostAccessoryLight`

### POST `v2/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/config`

- Endpoint ID: `ep-de21455b56cb5a64`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostCameraConfig. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$saveSettings$2$1.java:60` in `ClassicCameraService$saveSettings$2$1.invokeSuspend`: body = `this.$updateCameraBody`; path:networkId = `this.$it.getNetworkId()`; path:cameraId = `this.$it.getServerId()`; result `assigned:objPostCameraConfig`

### POST `v2/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/liveview`

- Endpoint ID: `ep-5725ed37c117c954`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostLiveViewCommand. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/doorbell/DoorbellService$startLiveView$2$1.java:60` in `DoorbellService$startLiveView$2$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path:doorbellId = `this.$it.getServerId()`; body = `this.$liveViewBody`; result `assigned:objPostLiveViewCommand`

### POST `v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/liveview`

- Endpoint ID: `ep-68cee79b8b40b558`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostLiveViewCommand. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$startLiveView$2$1.java:61` in `OwlService$startLiveView$2$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path:owlId = `this.$it.getServerId()`; body = `this.$liveViewBody`; result `assigned:objPostLiveViewCommand`

### GET `v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/zones`

- Endpoint ID: `ep-b30b1172536c13b9`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:zonesV2. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$getZonesV2$2$1.java:57` in `OwlService$getZonesV2$2$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path:owlId = `this.$it.getServerId()`; result `assigned:zonesV2`

### POST `v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/zones`

- Endpoint ID: `ep-c66d1d06e1a3cfac`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:zonesV2. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/wired/OwlService$setZonesV2$2$1.java:60` in `OwlService$setZonesV2$2$1.invokeSuspend`: body = `this.$zones`; path:networkId = `this.$it.getNetworkId()`; path:owlId = `this.$it.getServerId()`; result `assigned:zonesV2`

### POST `v2/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{type}`

- Endpoint ID: `ep-de3e109bf9881399`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objStartSyncModuleOnboarding. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/adddevice/AddDeviceRepository$startSyncModuleOnboarding$2.java:62` in `AddDeviceRepository$startSyncModuleOnboarding$2.invokeSuspend`: body = `this.$onboardingBody`; path:networkId = `this.$networkId`; path:type = `this.$onboardingType`; result `assigned:objStartSyncModuleOnboarding`
  - `com/immediasemi/blink/device/onboard/OnboardingRepository$addSyncModule$2.java:63` in `OnboardingRepository$addSyncModule$2.invokeSuspend`: body = `new OnboardingBody(this.$serialNumber, (String) null, 2, (DefaultConstructorMarker) null)`; path:networkId = `this.$networkId`; path:type = `this.$type.getIdentifier()`; result `assigned:objStartSyncModuleOnboarding`

### GET `v2/accounts/{injected_account_id}/subscriptions/entitlements`

- Endpoint ID: `ep-b548abc02e450c82`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:entitlements. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/utils/SyncManager.java:1258` in `SyncManager.invokeSuspend`: no wire arguments; result `assigned:entitlements`

### GET `v4/accounts/{injected_account_id}/homescreen`

- Endpoint ID: `ep-a52f03860eebd7b6`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:homeScreen. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/utils/SyncManager.java:694` in `SyncManager.invokeSuspend`: no wire arguments; result `assigned:homeScreen`

### POST `v4/accounts/{injected_account_id}/media`

- Endpoint ID: `ep-8ea11a50fe86ad72`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostMedia. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/video/clip/BlinkClipListRepository$getFilteredMedia$2.java:78` in `BlinkClipListRepository$getFilteredMedia$2.invokeSuspend`: query:start_time = `str`; query:end_time = `str2`; query:pagination_key = `longOrNull`; body = `MediaPostBody.INSTANCE.fromFilters(this.$tags, this.$cameras.getSelected(), this.$profileIds, this.$favorites)`; result `assigned:objPostMedia`

### GET `v4/accounts/{injected_account_id}/media_settings`

- Endpoint ID: `ep-a75e266240a6a7bb`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:mediaSettings. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/video/clip/BlinkClipListRepository$getMediaSettings$2.java:54` in `BlinkClipListRepository$getMediaSettings$2.invokeSuspend`: no wire arguments; result `assigned:mediaSettings`

### PATCH `v4/accounts/{injected_account_id}/media_settings`

- Endpoint ID: `ep-b3d9a20a6eab3abc`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/video/clip/BlinkClipListRepository$updateSelectedAutoDeleteDays$2.java:51` in `BlinkClipListRepository$updateSelectedAutoDeleteDays$2.invokeSuspend`: body = `new MediaSettingsPatch(this.$selectedAutoDeleteDaysOption)`; result `invoked`

### DELETE `v4/accounts/{injected_account_id}/media/{mediaId}/delete`

- Endpoint ID: `ep-60d6eda737c51831`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/video/clip/BlinkClipListRepository$deleteCloudMedia$2.java:50` in `BlinkClipListRepository$deleteCloudMedia$2.invokeSuspend`: path:mediaId = `this.$numericClipId`; result `invoked`

### POST `v4/accounts/{injected_account_id}/media/delete`

- Endpoint ID: `ep-4c72e701432b7299`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/video/BlinkMediaRepository$discardLiveView$2.java:87` in `BlinkMediaRepository$discardLiveView$2.invokeSuspend`: body = `new MediaListBody(CollectionsKt.listOf(Boxing.boxLong(this.$mediaId)))`; result `invoked`
  - `com/immediasemi/blink/video/clip/BlinkClipListRepository$deleteMedia$2.java:52` in `BlinkClipListRepository$deleteMedia$2.invokeSuspend`: body = `new MediaListBody(this.$numericIds)`; result `invoked`

### POST `v4/accounts/{injected_account_id}/media/favorite`

- Endpoint ID: `ep-3f307b7b54313f3e`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/video/clip/BlinkClipListRepository$favoriteMedia$2.java:52` in `BlinkClipListRepository$favoriteMedia$2.invokeSuspend`: body = `new FavoriteEventIdsBody(this.$eventIds)`; result `invoked`

### POST `v4/accounts/{injected_account_id}/media/mark_as_viewed`

- Endpoint ID: `ep-030d652d9b7d1794`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/video/BlinkMediaRepository$markViewed$2.java:164` in `BlinkMediaRepository$markViewed$2.invokeSuspend`: body = `new MediaListBody(this.$unwatchedIds)`; result `invoked`

### POST `v4/accounts/{injected_account_id}/media/unfavorite`

- Endpoint ID: `ep-53f9fdee246eae8f`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: invoked. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/video/clip/BlinkClipListRepository$unfavoriteMedia$2.java:52` in `BlinkClipListRepository$unfavoriteMedia$2.invokeSuspend`: body = `new FavoriteEventIdsBody(this.$eventIds)`; result `invoked`

### GET `v4/accounts/{injected_account_id}/subscriptions/plans`

- Endpoint ID: `ep-a79009ab60b44e50`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:subscriptionsV4. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/subscription/SubscriptionRepository$updateSubscriptions$request$1.java:52` in `SubscriptionRepository$updateSubscriptions$request$1.invokeSuspend`: no wire arguments; result `assigned:subscriptionsV4`

### GET `v4/accounts/{injected_account_id}/unwatched_media`

- Endpoint ID: `ep-142b4049e002443c`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:unwatchedMedia. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`, `wrapped-as-kotlin-result`
- Direct call sites:
  - `com/immediasemi/blink/video/BlinkMediaRepository$refreshUnwatchedCount$2.java:90` in `BlinkMediaRepository$refreshUnwatchedCount$2.invokeSuspend`: no wire arguments; result `assigned:unwatchedMedia`

### POST `v6/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/liveview`

- Endpoint ID: `ep-7a4e5c99d39d74c3`
- Call-site recovery: `resolved`
- Request construction: Invocation argument expressions are mapped by declaration order to recovered Retrofit parameter locations and wire names.
- Response handling: Direct call result handling recovered as: assigned:objPostLiveViewCommand. Server status and semantic error mapping remain unresolved unless separately declared.
- Sequencing signals: `coroutine-suspension-boundary`, `throws-on-kotlin-result-failure`
- Direct call sites:
  - `com/immediasemi/blink/common/device/camera/ClassicCameraService$startLiveView$2$1.java:60` in `ClassicCameraService$startLiveView$2$1.invokeSuspend`: path:networkId = `this.$it.getNetworkId()`; path:cameraId = `this.$it.getServerId()`; body = `this.$liveViewBody`; result `assigned:objPostLiveViewCommand`

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
