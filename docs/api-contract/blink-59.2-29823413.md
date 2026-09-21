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
| local-device | `http://172.16.97.199/` | 7 | local-none |
| oauth | `https://api.{env}oauth.blink.com/` | 2 | none |
| public-rest | `https://rest-{tier}.immedia-semi.com/api/` | 10 | none |
| rest | `https://rest-{tier}.immedia-semi.com/api/` | 147 | bearer, unresolved |
| shared-rest | `https://rest-{shared_tier}.immedia-semi.com/api/` | 141 | bearer |

Default headers: `APP-BUILD`, `User-Agent`, `LOCALE`, `X-Blink-Time-Zone`. URL rewriting tokens: `{tier}`, `{shared_tier}`, `{env}`, `{injected_account_id}`, `{injected_client_id}`.

## Authentication cascade

Corroborated service-level static evidence retains hosted authorization, `oauth/token` exchange, persisted bearer-token attachment, conditional `TOKEN-AUTH`, and authenticated-host HTTP 401 refresh behavior. Blink 59.2 adds OTP verification and WebAuthn registration declarations. Endpoint-level authentication assignment is marked `inferred` unless the declaration itself supplies explicit authorization evidence; none of this proves current server behavior.

## Endpoint catalog

### authentication

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| POST | `2fa/v1/webauthn/registration` | PasskeyRegistration | bearer | com.immediasemi.blink.passkey.RegistrationRequest | com.immediasemi.blink.passkey.RegistrationResponse | added | direct | `com/immediasemi/blink/passkey/PasskeyRegistrationApi.java:17` |
| POST | `2fa/v1/webauthn/registration/verify` | PasskeyRegistration | bearer | com.immediasemi.blink.passkey.VerifyRegistrationRequest | Unit | added | direct | `com/immediasemi/blink/passkey/PasskeyRegistrationApi.java:20` |

### device-orchestration

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| GET | `device_info/v4/devices` | Rdis | bearer | — | com.immediasemi.blink.common.device.rdis.RdisDevicesResponse | changed | direct | `com/immediasemi/blink/common/device/rdis/RdisApi.java:20` |
| GET | `device_info/v4/devices/{deviceId}` | Rdis | bearer | — | com.immediasemi.blink.common.device.rdis.RdisDeviceSettingsResponse | added | direct | `com/immediasemi/blink/common/device/rdis/RdisApi.java:17` |
| POST | `device_info/v4/devices/operations` | Rdis | bearer | com.immediasemi.blink.common.device.rdis.RdisOperationsBody | com.immediasemi.blink.common.device.rdis.RdisOperationsResponse | changed | direct | `com/immediasemi/blink/common/device/rdis/RdisApi.java:23` |
| PUT | `duos/v1/devices/{deviceId}/update` | DeviceUpdateOrchestrationService | bearer | com.immediasemi.blink.common.device.duos.DeviceEntityUpdateRequest | Unit | unchanged | direct | `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceApi.java:16` |
| PUT | `duos/v1/devices/{deviceId}/update` | DeviceUpdateOrchestrationService | bearer | com.immediasemi.blink.common.device.duos.DeviceMotionSettingsUpdateRequest | Unit | added | direct | `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceApi.java:22` |
| PUT | `duos/v1/devices/{deviceId}/update` | DeviceUpdateOrchestrationService | bearer | com.immediasemi.blink.common.device.duos.DevicePrivacySettingsUpdateRequest | Unit | added | direct | `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceApi.java:25` |
| PUT | `duos/v1/devices/update` | DeviceUpdateOrchestrationService | bearer | com.immediasemi.blink.common.device.duos.DeviceBulkUpdateRequest | com.immediasemi.blink.common.device.duos.DeviceBulkUpdateResponse | unchanged | direct | `com/immediasemi/blink/common/device/duos/DeviceUpdateOrchestrationServiceApi.java:19` |
| GET | `v1/devices` | KnownFacesRdis | bearer | — | com.immediasemi.blink.settings.knownfaces.optin.RdisResponse | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/optin/KnownFacesRdisApi.java:18` |
| PATCH | `v1/devices/{id}/configurations` | KnownFacesRdis | bearer | com.immediasemi.blink.settings.knownfaces.optin.UpdateDeviceConfigurationRequest | Unit | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/optin/KnownFacesRdisApi.java:21` |

### event-stream

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| POST | `1.0.0/batch/client.device/{appSubGroup}` | EventStream | optional-explicit | RequestBody | Unit | unchanged | direct | `com/ring/android/eventstream/storage/api/EventStreamApi.java:17` |
| POST | `1.0.0/event/client.device/{appSubGroup}` | EventStream | optional-explicit | RequestBody | Unit | unchanged | direct | `com/ring/android/eventstream/storage/api/EventStreamApi.java:20` |

### local-device

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| GET | `api/get_fw_version` | SyncModuleService | local-none | — | com.immediasemi.blink.utils.GetFirmwareEndpointResponse | unchanged | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:30` |
| GET | `api/logs` | SyncModuleService | local-none | — | ResponseBody | unchanged | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:33` |
| POST | `api/set/app_fw_update` | SyncModuleService | local-none | RequestBody | Unit | unchanged | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:42` |
| POST | `api/set/key` | SyncModuleService | local-none | RequestBody | Unit | unchanged | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:45` |
| POST | `api/set/ssid` | SyncModuleService | local-none | com.immediasemi.blink.api.retrofit.SetSSIDBody | Unit | unchanged | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:48` |
| GET | `api/ssids` | SyncModuleService | local-none | — | com.immediasemi.blink.models.AccessPoints | unchanged | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:36` |
| GET | `api/version` | SyncModuleService | local-none | — | Unit | unchanged | direct | `com/immediasemi/blink/api/retrofit/SyncModuleService.java:39` |

### oauth

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| POST | `oauth/token` | Oauth | none | — | com.immediasemi.blink.common.account.auth.RefreshTokensResponse | unchanged | direct | `com/immediasemi/blink/common/account/auth/OauthApi.java:22` |
| POST | `oauth/v2/verify_otp` | PasskeyOauth | none | — | com.immediasemi.blink.passkey.VerifyOtpResponse | added | direct | `com/immediasemi/blink/passkey/PasskeyOauthApi.java:16` |

### public-rest

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| GET | `apphelp.immedia-semi.com/link-manifest.json` | Public | none | — | com.immediasemi.blink.common.url.LinkManifest | unchanged | direct | `com/immediasemi/blink/common/network/PublicApi.java:22` |
| GET | `regions` | Public | none | — | com.immediasemi.blink.common.country.RegionsResponse | unchanged | direct | `com/immediasemi/blink/common/network/PublicApi.java:25` |
| GET | `v1/countries` | Public | none | — | com.immediasemi.blink.common.country.CountriesResponse | unchanged | direct | `com/immediasemi/blink/common/network/PublicApi.java:19` |
| GET | `v1/version` | Public | none | — | com.immediasemi.blink.update.AppVersionCheckResponse | unchanged | direct | `com/immediasemi/blink/common/network/PublicApi.java:16` |
| POST | `v3/users/validate_email` | Auth | none | com.immediasemi.blink.common.account.auth.ValidateEmailPostBody | com.immediasemi.blink.common.account.auth.ValidationResponse | unchanged | direct | `com/immediasemi/blink/common/account/auth/AuthApi.java:16` |
| POST | `v3/users/validate_password` | Auth | none | com.immediasemi.blink.common.account.auth.ValidatePasswordPostBody | com.immediasemi.blink.common.account.auth.ValidationResponse | unchanged | direct | `com/immediasemi/blink/common/account/auth/AuthApi.java:19` |
| POST | `v4/users/password_change` | PasswordReset | none | com.immediasemi.blink.account.password.ResetPasswordPostBody | Unit | unchanged | direct | `com/immediasemi/blink/account/password/PasswordResetApi.java:18` |
| POST | `v4/users/password_change/pin/generate` | PasswordReset | none | com.immediasemi.blink.common.account.verification.GeneratePinPostBody | com.immediasemi.blink.common.account.verification.GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/account/password/PasswordResetApi.java:21` |
| POST | `v4/users/password_change/pin/verify` | PasswordReset | none | com.immediasemi.blink.common.account.verification.VerifyPinPostBody | com.immediasemi.blink.common.account.verification.VerifyPinResponse | unchanged | direct | `com/immediasemi/blink/account/password/PasswordResetApi.java:24` |
| POST | `v7/users/register` | Auth | none | com.immediasemi.blink.common.account.auth.RegisterBody | com.immediasemi.blink.common.account.auth.AuthenticationResponse | unchanged | direct | `com/immediasemi/blink/common/account/auth/AuthApi.java:13` |

### rest

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| GET | `@Url` | Blueprint | unresolved | — | — | unchanged | corroborated | `smali_classes2/com/ring/reapp/blueprint/api/BlueprintApi.smali:53` |
| POST | `@Url` | Blueprint | unresolved | — | — | unchanged | corroborated | `smali_classes2/com/ring/reapp/blueprint/api/BlueprintApi.smali:79` |
| POST | `app/logs/upload` | Log | bearer | com.immediasemi.blink.api.retrofit.LogsBody | Unit | unchanged | direct | `com/immediasemi/blink/common/log/LogApi.java:16` |
| GET | `blink/clients_api/links/v1/locations/{locationId}/devices/{deviceId}/links?ignore_rbac=true&include_deactivated=false` | LinkDevice | bearer | — | com.immediasemi.blink.device.setting.linkdevice.data.model.DeviceLinksResponse | unchanged | direct | `com/immediasemi/blink/device/setting/linkdevice/data/LinkDeviceApi.java:29` |
| DELETE | `blink/clients_api/links/v1/locations/{locationId}/devices/{deviceId}/links/{linkId}?ignore_rbac=true&include_deactivated=false` | LinkDevice | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/device/setting/linkdevice/data/LinkDeviceApi.java:26` |
| POST | `blink/clients_api/links/v1/locations/{locationId}/events/{event}/receivers?ignore_rbac=true&include_deactivated=false` | LinkDevice | bearer | com.immediasemi.blink.device.setting.linkdevice.data.model.CreateLinkRequest | com.immediasemi.blink.device.setting.linkdevice.data.model.CreateLinkResponse | unchanged | direct | `com/immediasemi/blink/device/setting/linkdevice/data/LinkDeviceApi.java:23` |
| POST | `clients_api/setups` | SetupOrchestrationService | bearer | com.immediasemi.blink.common.device.ringsos.SosSetupPostBody | com.immediasemi.blink.common.device.ringsos.SosSetupResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:44` |
| GET | `clients_api/setups/{setupId}` | SetupOrchestrationService | bearer | — | com.immediasemi.blink.common.device.ringsos.SosDeviceSetupStatusResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:38` |
| POST | `clients/{injected_client_id}/update` | Client | bearer | com.immediasemi.blink.common.account.client.ClientUpdatePostBody | Unit | unchanged | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:26` |
| GET | `device_info/v4/devices/{deviceId}` | SetupOrchestrationService | bearer | — | com.immediasemi.blink.common.device.ringsos.ChimeAccessoryConfigInfoResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:26` |
| GET | `device_info/v4/devices/{deviceId}/configurations` | SetupOrchestrationService | bearer | — | com.immediasemi.blink.common.device.ringsos.DeviceConfigurationsResponse | changed | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:29` |
| GET | `device_info/v4/devices/{deviceId}/status` | SetupOrchestrationService | bearer | — | com.immediasemi.blink.common.device.ringsos.SosDeviceOtaStatusResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:32` |
| PATCH | `devices/{deviceId}` | Commands | bearer | RequestBody | Unit | added | direct | `com/ring/blueprints/setup/core/data/backend/CommandsApi.java:16` |
| DELETE | `devices/v1/devices/{deviceId}` | SetupOrchestrationService | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:23` |
| PATCH | `devices/v1/devices/{deviceId}` | DeviceRegistry | bearer | com.immediasemi.blink.common.device.registry.DeviceRegistryPatchBody | Unit | added | direct | `com/immediasemi/blink/common/device/registry/DeviceRegistryApi.java:17` |
| PATCH | `devices/v1/devices/{deviceId}` | SetupOrchestrationService | bearer | com.immediasemi.blink.common.device.ringsos.UpdateSosDeviceBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:47` |
| GET | `devices/v2/locations` | LocationsCore | bearer | — | ResponseBody | unchanged | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:31` |
| DELETE | `dings/{dingId}` | Clients | bearer | — | Unit | unchanged | direct | `com/ringapp/orchestratorapi/data/ClientsApi.java:16` |
| DELETE | `dings/{dingId}/favorite` | Clients | bearer | — | Unit | unchanged | direct | `com/ringapp/orchestratorapi/data/ClientsApi.java:22` |
| PUT | `dings/{dingId}/favorite` | Clients | bearer | — | Unit | unchanged | direct | `com/ringapp/orchestratorapi/data/ClientsApi.java:19` |
| POST | `duos/v1/locations` | LocationsCore | bearer | com.amazon.rbks.mobile.locations.network.entities.PutLocationRequest | com.amazon.rbks.mobile.locations.network.entities.LocationBody | unchanged | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:46` |
| DELETE | `duos/v1/locations/{locationId}` | LocationsCore | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:27` |
| PATCH | `duos/v1/locations/{locationId}` | LocationsCore | bearer | com.amazon.rbks.mobile.locations.network.entities.UpdateLocationRequest | com.amazon.rbks.mobile.locations.network.entities.LocationBody | unchanged | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:39` |
| GET | `ees/v2/history/extendedsearchmetadata` | TimelineOrchestrator | bearer | — | com.ringapp.orchestratorapi.data.OrchestratorSearchMetadataResponse | unchanged | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:130` |
| DELETE | `evm/v2/dings` | TimelineOrchestrator | bearer | — | Unit | unchanged | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:121` |
| POST | `evm/v2/events` | TimelineOrchestrator | bearer | com.ringapp.orchestratorapi.data.DeleteMultipleEventsRequest | Unit | added | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:90` |
| DELETE | `evm/v2/events/associations/{profile_Id}` | TimelineOrchestrator | bearer | — | Unit | unchanged | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:118` |
| DELETE | `evm/v2/events/time-based-deletion/{source_id}` | TimelineOrchestrator | bearer | — | Unit | unchanged | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:124` |
| POST | `evm/v2/events/watch` | TimelineOrchestrator | bearer | com.ringapp.orchestratorapi.data.WatchEventsRequest | Unit | added | direct | `com/ringapp/orchestratorapi/data/TimelineOrchestratorApi.java:115` |
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
| GET | `factory_profile` | SetupClients | bearer | — | com.ring.blueprints.setup.core.data.backend.ApiFactoryDeviceProfile | unchanged | direct | `com/ring/blueprints/setup/core/data/backend/SetupClientsApi.java:15` |
| GET | `fms/device-firmware` | DeviceFirmware | bearer | — | com.ring.blueprints.setup.core.data.entity.DeviceFirmwareResponse | unchanged | direct | `com/ring/blueprints/setup/core/data/backend/DeviceFirmwareApi.java:14` |
| GET | `geocoding/v1/auto-complete` | Geocoding | bearer | — | com.amazon.rbks.mobile.locations.network.entities.AutoCompleteResponse | unchanged | direct | `com/immediasemi/blink/location/api/GeocodingApi.java:30` |
| GET | `geocoding/v1/auto-complete/details` | Geocoding | bearer | — | com.amazon.rbks.mobile.locations.network.entities.LocationDetailsResponse | unchanged | direct | `com/immediasemi/blink/location/api/GeocodingApi.java:34` |
| POST | `geocoding/v1/geocode` | Geocoding | bearer | com.amazon.rbks.mobile.locations.network.entities.GeoCodingRequest | com.amazon.rbks.mobile.locations.network.entities.LocationDetailsResponse | unchanged | direct | `com/immediasemi/blink/location/api/GeocodingApi.java:38` |
| GET | `geocoding/v1/ip/info/my` | Geocoding | bearer | — | com.amazon.rbks.mobile.locations.network.entities.LocationByIpResponse | unchanged | direct | `com/immediasemi/blink/location/api/GeocodingApi.java:26` |
| GET | `geocoding/v1/reverse-geocode` | Geocoding | bearer | — | com.amazon.rbks.mobile.locations.network.entities.LocationDetailsResponse | unchanged | direct | `com/immediasemi/blink/location/api/GeocodingApi.java:22` |
| GET | `location_info/v3/locations` | LocationsCore | bearer | — | ResponseBody | unchanged | direct | `com/immediasemi/blink/location/api/LocationsCoreApi.java:35` |
| GET | `location-subtypes` | LocationSubtype | bearer | — | com.amazon.rbks.mobile.locations.network.entities.subtype.SubtypeBody | unchanged | direct | `com/amazon/rbks/mobile/locations/network/LocationSubtypeApi.java:12` |
| DELETE | `recordings/public/footages/{deviceId}` | Footage | bearer | — | Unit | unchanged | direct | `com/ringapp/orchestratorapi/data/FootageApi.java:18` |
| DELETE | `recordings/public/footages/{deviceId}/delete_all` | Footage | bearer | — | Unit | unchanged | direct | `com/ringapp/orchestratorapi/data/FootageApi.java:15` |
| POST | `setups` | Clients | bearer | RequestBody | com.ring.blueprints.setup.core.data.backend.ApiSetup | added | direct | `com/ring/blueprints/setup/core/data/backend/ClientsApi.java:21` |
| GET | `setups/{setupId}` | Clients | bearer | — | com.ring.blueprints.setup.core.data.backend.ApiSetupStatus | added | direct | `com/ring/blueprints/setup/core/data/backend/ClientsApi.java:18` |
| POST | `setups/{setupId}/complete` | Clients | bearer | com.ring.blueprints.setup.core.data.backend.CompleteSetupBody | Void | added | direct | `com/ring/blueprints/setup/core/data/backend/ClientsApi.java:15` |
| PUT | `share_service/v3/batch_shares` | VideoDonation | bearer | com.immediasemi.blink.video.clip.donation.api.BatchDonationRequest | com.immediasemi.blink.video.clip.donation.api.BatchDonationResponse | added | direct | `com/immediasemi/blink/video/clip/donation/api/VideoDonationApi.java:14` |
| GET | `sos/v1/factory_profile` | SetupOrchestrationService | bearer | — | com.immediasemi.blink.common.device.MacIdentifyDeviceResponseApiModel | added | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:35` |
| POST | `sos/v1/setups` | SetupOrchestrationService | bearer | com.immediasemi.blink.common.device.ringsos.RingSosSetupPostBody | com.immediasemi.blink.common.device.ringsos.RingSosSetupResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/SetupOrchestrationServiceApi.java:41` |
| GET | `system/config/network` | LocalSetupOrchestrationService | bearer | — | com.immediasemi.blink.common.device.ringsos.NetworkConfigGetResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/LocalSetupOrchestrationServiceApi.java:17` |
| POST | `system/config/network` | LocalSetupOrchestrationService | bearer | com.immediasemi.blink.common.device.ringsos.NetworkConfigPostBody | com.immediasemi.blink.common.device.ringsos.NetworkConfigStatusResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/LocalSetupOrchestrationServiceApi.java:20` |
| POST | `system/config/reg_domain` | LocalSetupOrchestrationService | bearer | com.immediasemi.blink.common.device.ringsos.RegionConfigPostBody | com.immediasemi.blink.common.device.ringsos.NetworkConfigStatusResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/LocalSetupOrchestrationServiceApi.java:23` |
| GET | `system/prov/ap_list` | LocalSetupOrchestrationService | bearer | — | com.immediasemi.blink.common.device.ringsos.AccessPointListResponse | unchanged | direct | `com/immediasemi/blink/common/device/ringsos/LocalSetupOrchestrationServiceApi.java:14` |
| POST | `users/delete` | Account | bearer | com.immediasemi.blink.common.account.delete.DeleteAccountBody | Unit | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:31` |
| GET | `v1/accounts/{injected_account_id}/single_event_alerts` | SingleEventAlerts | bearer | — | com.immediasemi.blink.settings.notifications.sea.SingleEventAlertsResponse | unchanged | direct | `com/immediasemi/blink/settings/notifications/sea/SingleEventAlertsApi.java:16` |
| POST | `v1/accounts/{injected_account_id}/single_event_alerts` | SingleEventAlerts | bearer | com.immediasemi.blink.settings.notifications.sea.SingleEventAlertsPostBody | Unit | unchanged | direct | `com/immediasemi/blink/settings/notifications/sea/SingleEventAlertsApi.java:19` |
| POST | `v1/alexa/authorization` | AlexaLinking | bearer | com.immediasemi.blink.settings.account.alexa.AlexaLinkingAuthorizePostBody | com.immediasemi.blink.settings.account.alexa.AlexaLinkingAuthorizeResponse | unchanged | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingApi.java:22` |
| DELETE | `v1/alexa/link` | AlexaLinking | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingApi.java:16` |
| POST | `v1/alexa/link` | AlexaLinking | bearer | com.immediasemi.blink.settings.account.alexa.AlexaLinkingLinkPostBody | Unit | unchanged | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingApi.java:25` |
| GET | `v1/alexa/link_status` | AlexaLinking | bearer | — | com.immediasemi.blink.settings.account.alexa.AlexaLinkStatus | unchanged | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingApi.java:19` |
| GET | `v1/clients/{injected_client_id}/control_panel/clients` | ClientDeviceManagement | bearer | — | com.immediasemi.blink.api.retrofit.GetClientsResponse | unchanged | direct | `com/immediasemi/blink/settings/client/ClientDeviceManagementApi.java:23` |
| POST | `v1/clients/{injected_client_id}/control_panel/delete` | ClientDeviceManagement | bearer | com.immediasemi.blink.api.retrofit.DeleteClientBody | Unit | unchanged | direct | `com/immediasemi/blink/settings/client/ClientDeviceManagementApi.java:20` |
| POST | `v1/clients/{injected_client_id}/control_panel/pin/resend` | ClientDeviceManagement | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/settings/client/ClientDeviceManagementApi.java:29` |
| POST | `v1/clients/{injected_client_id}/control_panel/pin/verify` | ClientDeviceManagement | bearer | com.immediasemi.blink.common.account.verification.VerifyPinPostBody | com.immediasemi.blink.common.account.verification.VerifyPinResponse | unchanged | direct | `com/immediasemi/blink/settings/client/ClientDeviceManagementApi.java:32` |
| POST | `v1/clients/{injected_client_id}/control_panel/request_pin` | ClientDeviceManagement | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/settings/client/ClientDeviceManagementApi.java:26` |
| GET | `v1/clients/{injected_client_id}/options` | Client | bearer | — | com.immediasemi.blink.common.account.client.option.ClientOptionsBody | unchanged | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:20` |
| POST | `v1/clients/{injected_client_id}/options` | Client | bearer | com.immediasemi.blink.common.account.client.option.ClientOptionsBody | Unit | unchanged | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:23` |
| POST | `v1/clients/{injected_client_id}/shared_login/pin/resend` | SharedLogin | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:36` |
| POST | `v1/clients/{injected_client_id}/shared_login/pin/verify` | SharedLogin | bearer | com.immediasemi.blink.common.account.verification.VerifyPinPostBody | com.immediasemi.blink.common.account.verification.VerifyPinResponse | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:39` |
| POST | `v1/clients/{injected_client_id}/shared_login/request_pin` | SharedLogin | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:33` |
| POST | `v1/countries/update` | Account | bearer | com.immediasemi.blink.api.retrofit.CountryBody | com.immediasemi.blink.api.retrofit.CountryResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:67` |
| POST | `v1/data_request/dsar/create` | ManageData | bearer | — | com.immediasemi.blink.settings.account.managedata.SubmitDataRequestResponse | unchanged | direct | `com/immediasemi/blink/settings/account/managedata/ManageDataApi.java:18` |
| POST | `v1/data_request/euda/create` | ManageData | bearer | — | com.immediasemi.blink.settings.account.managedata.SubmitDataRequestResponse | unchanged | direct | `com/immediasemi/blink/settings/account/managedata/ManageDataApi.java:21` |
| GET | `v1/data_request/list` | ManageData | bearer | — | com.immediasemi.blink.settings.account.managedata.DataRequests | unchanged | direct | `com/immediasemi/blink/settings/account/managedata/ManageDataApi.java:15` |
| POST | `v1/data_request/third_party/{thirdPartyId}/revoke` | ManageData | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/settings/account/managedata/ManageDataApi.java:24` |
| POST | `v1/events/app` | Event | bearer | com.immediasemi.blink.api.retrofit.TrackingEvents | Unit | unchanged | direct | `com/immediasemi/blink/common/track/event/EventApi.java:15` |
| DELETE | `v1/history/events/associations/{profile_id}` | EventAssociations | bearer | — | Unit | added | direct | `com/immediasemi/blink/settings/knownfaces/identities/EventAssociationsApi.java:16` |
| GET | `v1/identities` | Identities | bearer | — | com.immediasemi.blink.settings.knownfaces.identities.IdentitiesResponse | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:28` |
| DELETE | `v1/identities/{id}` | Identities | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:25` |
| GET | `v1/identities/{id}` | Identities | bearer | — | com.immediasemi.blink.settings.knownfaces.identities.IdentityResponse | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:31` |
| PATCH | `v1/identities/{id}` | Identities | bearer | com.immediasemi.blink.settings.knownfaces.identities.UpdateIdentityRequest | Unit | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:43` |
| PATCH | `v1/identities/{id}/actions/merge-identities` | Identities | bearer | com.immediasemi.blink.settings.knownfaces.identities.MergeIdentitiesRequest | Unit | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:34` |
| POST | `v1/identities/{id}/actions/split-identity` | Identities | bearer | com.immediasemi.blink.settings.knownfaces.identities.SplitIdentityRequest | com.immediasemi.blink.settings.knownfaces.identities.SplitIdentityResponse | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:40` |
| DELETE | `v1/identities/{id}/enrollment-images` | Identities | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:22` |
| PATCH | `v1/identities/{id}/enrollment-images/actions/move-enrollment-images` | Identities | bearer | com.immediasemi.blink.settings.knownfaces.identities.MoveEnrollmentImagesRequest | Unit | unchanged | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesApi.java:37` |
| POST | `v1/identity/token` | Account | bearer | com.immediasemi.blink.common.account.auth.TokenUpgradePostBody | com.immediasemi.blink.common.account.auth.RefreshTokensResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:64` |
| POST | `v1/locations/update` | BlinkCloudLocation | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/location/api/BlinkCloudLocationApi.java:13` |
| GET | `v1/notifications/preferences` | Account | bearer | — | com.immediasemi.blink.api.retrofit.NotificationPreferencesResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:43` |
| POST | `v1/notifications/preferences` | Account | bearer | com.immediasemi.blink.api.retrofit.NotificationPreferencesResponse | Unit | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:55` |
| GET | `v1/shared_login` | SharedLogin | bearer | — | com.immediasemi.blink.settings.sharedlogin.model.GetSharedLoginResponse | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:24` |
| POST | `v1/shared_login` | SharedLogin | bearer | com.immediasemi.blink.settings.sharedlogin.model.CreateSharedLoginBody | com.immediasemi.blink.settings.sharedlogin.model.PostSharedLoginResponse | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:30` |
| POST | `v1/shared_login/claim` | SharedLoginPublic | bearer | com.immediasemi.blink.settings.sharedlogin.model.SharedLoginClaimBody | com.immediasemi.blink.settings.sharedlogin.model.PostSharedLoginClaimResponse | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginPublicApi.java:17` |
| POST | `v1/shared_login/revoke` | SharedLogin | bearer | com.immediasemi.blink.settings.sharedlogin.model.RevokeSharedLoginBody | Unit | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginApi.java:27` |
| POST | `v1/shared_login/verify` | SharedLoginPublic | bearer | com.immediasemi.blink.settings.sharedlogin.model.SharedLoginVerifyBody | com.immediasemi.blink.settings.sharedlogin.model.PostSharedLoginVerifyResponse | unchanged | direct | `com/immediasemi/blink/settings/sharedlogin/api/SharedLoginPublicApi.java:20` |
| PATCH | `v1/shared/authorizations/{authorizationId}` | Access | bearer | com.immediasemi.blink.common.account.FriendlyNamePatchBody | com.immediasemi.blink.device.network.command.PollingResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:42` |
| DELETE | `v1/shared/authorizations/{authorizationId}/remove` | Access | bearer | — | com.immediasemi.blink.device.network.command.PollingResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:27` |
| DELETE | `v1/shared/authorizations/{authorizationId}/revoke` | Access | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:30` |
| GET | `v1/shared/check_authorization` | Access | bearer | — | com.immediasemi.blink.settings.access.accept.CheckAuthorizationResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:36` |
| POST | `v1/shared/invitations/{invitationId}/accept` | Access | bearer | com.immediasemi.blink.settings.access.accept.AcceptInvitationBody | com.immediasemi.blink.device.network.command.PollingResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:48` |
| DELETE | `v1/shared/invitations/{invitationId}/decline` | Access | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:24` |
| DELETE | `v1/shared/invitations/{invitationId}/revoke` | Access | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:33` |
| POST | `v1/shared/invitations/send` | Access | bearer | com.immediasemi.blink.settings.access.SendInviteBody | Unit | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:51` |
| PATCH | `v1/shared/popovers/{popoverId}/read` | Access | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:45` |
| GET | `v1/shared/summary` | Access | bearer | — | com.immediasemi.blink.settings.access.AccessSummary | unchanged | direct | `com/immediasemi/blink/common/account/AccessApi.java:39` |
| POST | `v1/subscriptions/clear_popup/{type}` | WriteSubscription | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:42` |
| POST | `v1/subscriptions/link/link_account` | WriteSubscription | bearer | com.immediasemi.blink.utils.MapLinkBody | com.immediasemi.blink.utils.DspSubscriptionResponse | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:39` |
| POST | `v1/subscriptions/link/unlink_account` | WriteSubscription | bearer | com.immediasemi.blink.utils.VerifyLinkAccountBody | com.immediasemi.blink.utils.DspSubscriptionResponse | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:51` |
| POST | `v1/subscriptions/plans/{subscriptionId}/attach` | WriteSubscription | bearer | com.immediasemi.blink.common.subscription.basic.AttachPlanBody | com.immediasemi.blink.utils.DspSubscriptionResponse | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:27` |
| DELETE | `v1/subscriptions/plans/cancel_trial` | WriteSubscription | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:30` |
| GET | `v1/subscriptions/plans/get_device_attach_eligibility` | WriteSubscription | bearer | — | com.immediasemi.blink.common.subscription.basic.DeviceEligibilityResponse | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:36` |
| POST | `v1/subscriptions/plans/renew_trial` | WriteSubscription | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:45` |
| POST | `v1/subscriptions/request/status/{uuid}` | WriteSubscription | bearer | com.immediasemi.blink.utils.SubscriptionRequestStatusBody | com.immediasemi.blink.utils.SubscriptionRequestStatusResponse | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:48` |
| POST | `v1/users/authenticate_password` | Account | bearer | com.immediasemi.blink.account.auth.AuthenticatePasswordBody | com.immediasemi.blink.account.auth.AuthenticatePasswordResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:28` |
| POST | `v1/users/countries/update` | Account | bearer | com.immediasemi.blink.api.retrofit.CountryBody | com.immediasemi.blink.api.retrofit.CountryResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:70` |
| GET | `v1/users/options` | Account | bearer | — | com.immediasemi.blink.common.account.option.AccountOptionsResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:37` |
| GET | `v1/users/preferences` | Account | bearer | — | com.immediasemi.blink.common.account.preference.AccountPreferencesBody | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:40` |
| POST | `v1/users/preferences` | Account | bearer | com.immediasemi.blink.common.account.preference.AccountPreferencesBody | com.immediasemi.blink.common.account.preference.AccountPreferencesBody | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:52` |
| GET | `v1/users/tier_info` | Account | bearer | — | com.immediasemi.blink.common.account.TierInfo | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:46` |
| POST | `v2/clients/{injected_client_id}/tiv` | CustomerSupportAccess | bearer | com.immediasemi.blink.settings.privacy.TivLockBody | com.immediasemi.blink.settings.privacy.SetTivLockResponse | unchanged | direct | `com/immediasemi/blink/settings/privacy/CustomerSupportAccessApi.java:16` |
| POST | `v2/clients/{injected_client_id}/tiv_unlock/pin/resend` | CustomerSupportAccess | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/settings/privacy/CustomerSupportAccessApi.java:22` |
| POST | `v2/clients/{injected_client_id}/tiv_unlock/pin/verify` | CustomerSupportAccess | bearer | com.immediasemi.blink.common.account.verification.VerifyPinPostBody | com.immediasemi.blink.common.account.verification.VerifyPinResponse | unchanged | direct | `com/immediasemi/blink/settings/privacy/CustomerSupportAccessApi.java:25` |
| POST | `v2/clients/{injected_client_id}/tiv_unlock/request_pin` | CustomerSupportAccess | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/settings/privacy/CustomerSupportAccessApi.java:19` |
| POST | `v2/notification` | Notification | bearer | com.immediasemi.blink.api.retrofit.AcknowledgeNotificationBody | Object | unchanged | direct | `com/immediasemi/blink/notification/NotificationApi.java:14` |
| POST | `v2/subscriptions/plans/create_trial` | WriteSubscription | bearer | com.immediasemi.blink.home.additionaltrial.AdditionalTrialBody | Unit | unchanged | direct | `com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java:33` |
| GET | `v2/users/info` | Account | bearer | — | com.immediasemi.blink.common.account.Account | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:34` |
| POST | `v4/clients/{injected_client_id}/email_change` | EmailChange | bearer | com.immediasemi.blink.settings.email.ChangeEmailPostBody | com.immediasemi.blink.common.account.verification.GeneratePinResponse | changed | direct | `com/immediasemi/blink/settings/email/EmailChangeApi.java:16` |
| POST | `v4/clients/{injected_client_id}/email_change/pin/resend` | EmailChange | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/settings/email/EmailChangeApi.java:19` |
| POST | `v4/clients/{injected_client_id}/email_change/pin/verify` | EmailChange | bearer | com.immediasemi.blink.common.account.verification.VerifyPinPostBody | com.immediasemi.blink.common.account.verification.VerifyPinResponse | unchanged | direct | `com/immediasemi/blink/settings/email/EmailChangeApi.java:22` |
| POST | `v4/clients/{injected_client_id}/logout` | Account | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:49` |
| POST | `v4/clients/{injected_client_id}/password_change` | PasswordChange | bearer | com.immediasemi.blink.account.password.ResetPasswordPostBody | Unit | unchanged | direct | `com/immediasemi/blink/settings/password/PasswordChangeApi.java:18` |
| POST | `v4/clients/{injected_client_id}/password_change/pin/generate` | PasswordChange | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/settings/password/PasswordChangeApi.java:24` |
| POST | `v4/clients/{injected_client_id}/password_change/pin/verify` | PasswordChange | bearer | com.immediasemi.blink.common.account.verification.VerifyPinPostBody | com.immediasemi.blink.common.account.verification.VerifyPinResponse | unchanged | direct | `com/immediasemi/blink/settings/password/PasswordChangeApi.java:27` |
| POST | `v4/clients/{injected_client_id}/pin/verify` | Client | bearer | com.immediasemi.blink.api.retrofit.VerifyPinBody | com.immediasemi.blink.api.retrofit.PinVerificationResponse | unchanged | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:35` |
| POST | `v4/users/pin/resend` | Account | bearer | — | com.immediasemi.blink.common.account.verification.GeneratePinResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:58` |
| POST | `v4/users/pin/verify` | Account | bearer | com.immediasemi.blink.common.account.verification.VerifyPinPostBody | com.immediasemi.blink.common.account.verification.VerifyPinResponse | unchanged | direct | `com/immediasemi/blink/common/account/AccountApi.java:61` |
| POST | `v5/clients/{injected_client_id}/client_verification/pin/resend` | Client | bearer | — | com.immediasemi.blink.api.retrofit.ResendClientVerificationCodeResponse | unchanged | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:29` |
| POST | `v5/clients/{injected_client_id}/client_verification/pin/verify` | Client | bearer | com.immediasemi.blink.api.retrofit.SubmitVerificationRequest | com.immediasemi.blink.api.retrofit.PinVerificationResponse | unchanged | direct | `com/immediasemi/blink/common/account/client/ClientApi.java:32` |
| POST | `v5/clients/{injected_client_id}/phone_number_change` | PhoneNumberChange | bearer | com.immediasemi.blink.api.retrofit.ChangePhoneNumberBody | com.immediasemi.blink.api.retrofit.ChangePhoneNumberResponse | unchanged | direct | `com/immediasemi/blink/common/account/phone/PhoneNumberChangeApi.java:18` |
| POST | `v5/clients/{injected_client_id}/phone_number_change` | PhoneNumberChange | bearer | com.immediasemi.blink.account.phone.AddPhoneNumberPostBody | com.immediasemi.blink.api.retrofit.ChangePhoneNumberResponse | unchanged | direct | `com/immediasemi/blink/common/account/phone/PhoneNumberChangeApi.java:21` |
| POST | `v5/clients/{injected_client_id}/phone_number_change/pin/verify` | PhoneNumberChange | bearer | com.immediasemi.blink.api.retrofit.SubmitVerificationRequest | com.immediasemi.blink.api.retrofit.PinVerificationResponse | unchanged | direct | `com/immediasemi/blink/common/account/phone/PhoneNumberChangeApi.java:24` |

### shared-rest

| Method | Path | Feature | Auth | Request | Response | State | Confidence | Evidence |
|---|---|---|---|---|---|---|---|---|
| POST | `accounts/{injected_account_id}/networks/{network}/cameras/{camera}/{type}` | Camera | bearer | — | com.immediasemi.blink.device.network.command.CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:81` |
| POST | `accounts/{injected_account_id}/networks/{network}/cameras/{camera}/thumbnail` | Camera | bearer | — | com.immediasemi.blink.device.network.command.CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:96` |
| POST | `accounts/{injected_account_id}/networks/{network}/cameras/add` | Camera | bearer | com.immediasemi.blink.device.onboard.camera.AddCameraBody | com.immediasemi.blink.models.AddCameraResponseBody | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:36` |
| GET | `accounts/{injected_account_id}/networks/{network}/commands/{command}` | Command | bearer | — | com.immediasemi.blink.device.network.command.SupervisorKommand | unchanged | direct | `com/immediasemi/blink/common/device/network/command/CommandApi.java:25` |
| POST | `accounts/{injected_account_id}/networks/{network}/commands/{command}/done` | Command | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/network/command/CommandApi.java:40` |
| POST | `accounts/{injected_account_id}/networks/{network}/commands/{command}/update` | Command | bearer | com.immediasemi.blink.api.requests.onboarding.OnboardingCommandUpdate.UpdateCommandRequest | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/network/command/CommandApi.java:37` |
| POST | `accounts/{injected_account_id}/networks/{network}/commands/{command}/update` | Command | bearer | com.immediasemi.blink.api.retrofit.TerminateOnboardingBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/network/command/CommandApi.java:43` |
| POST | `accounts/{injected_account_id}/networks/{network}/delete` | Network | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:34` |
| POST | `accounts/{injected_account_id}/networks/{network}/update` | Network | bearer | com.immediasemi.blink.api.retrofit.UpdateNetworkSaveAllLiveViews | Unit | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:52` |
| POST | `accounts/{injected_account_id}/networks/{network}/update` | Network | bearer | com.immediasemi.blink.api.retrofit.UpdateSystemNameBody | Unit | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:55` |
| POST | `accounts/{injected_account_id}/networks/{network}/update` | Network | bearer | com.immediasemi.blink.api.retrofit.UpdateTimezoneBody | Unit | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:58` |
| POST | `accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/delete` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:45` |
| POST | `accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/status` | Camera | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:84` |
| POST | `accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/delete` | SyncModule | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:22` |
| POST | `accounts/{injected_account_id}/networks/add` | Network | bearer | com.immediasemi.blink.common.system.AddNetworkBody | com.immediasemi.blink.models.ANetwork | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:31` |
| POST | `accounts/{injected_account_id}/system_offline/{network}` | Network | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:43` |
| GET | `v1/accounts/{injected_account_id}/access` | ReadSubscription | bearer | — | com.immediasemi.blink.common.subscription.AccessResponse | unchanged | direct | `com/immediasemi/blink/common/subscription/ReadSubscriptionApi.java:13` |
| GET | `v1/accounts/{injected_account_id}/doorbells/{serial}/fw_update` | Doorbell | bearer | — | ResponseBody | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:49` |
| GET | `v1/accounts/{injected_account_id}/doorbells/{serial}/token` | Doorbell | bearer | — | com.immediasemi.blink.common.device.camera.wired.DeviceAuthTokenResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:55` |
| GET | `v1/accounts/{injected_account_id}/feature_flags/enabled` | FeatureFlag | bearer | — | com.immediasemi.blink.common.flag.FeatureFlagsResponse | unchanged | direct | `com/immediasemi/blink/common/flag/FeatureFlagApi.java:12` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/accessories/delete` | Accessory | bearer | com.immediasemi.blink.device.accessory.DeleteAccessoryBody | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/device/accessory/AccessoryApi.java:20` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/accessories/rosie/owl/{owl_id}/calibrate` | Owl | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:32` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/cameras/{camera_id}/snooze` | Camera | bearer | com.immediasemi.blink.api.retrofit.SnoozeBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:111` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/cameras/{camera_id}/unsnooze` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:120` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/change_mode` | Doorbell | bearer | — | com.immediasemi.blink.api.retrofit.AddLotusResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:73` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/change_wifi` | Doorbell | bearer | com.immediasemi.blink.device.onboard.OnboardingBody | com.immediasemi.blink.api.retrofit.AddLotusResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:43` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/clear_creds` | Doorbell | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:76` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/stay_awake` | Doorbell | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:70` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{lotus_id}/snooze` | Doorbell | bearer | com.immediasemi.blink.api.retrofit.SnoozeBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:130` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{lotus_id}/unsnooze` | Doorbell | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:136` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/accessories/rosie/{rosie_id}/delete` | Owl | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:50` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/snooze` | Owl | bearer | com.immediasemi.blink.api.retrofit.SnoozeBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:101` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/unsnooze` | Owl | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:107` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/snooze` | Network | bearer | com.immediasemi.blink.api.retrofit.SnoozeBody | Unit | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:46` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/state/disarm` | Network | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:37` |
| POST | `v1/accounts/{injected_account_id}/networks/{network_id}/unsnooze` | Network | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:49` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/accessories/add` | Accessory | bearer | com.immediasemi.blink.device.accessory.AddAccessoryBody | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/device/accessory/AccessoryApi.java:17` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/calibrate` | Camera | bearer | com.immediasemi.blink.api.retrofit.TemperatureCalibrationPostBody | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:102` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs` | Camera | bearer | — | com.immediasemi.blink.models.FloodlightProgramConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:63` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/delete` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:51` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/disable` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:54` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/enable` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:57` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/update` | Camera | bearer | com.immediasemi.blink.models.CreateProgramBody | com.immediasemi.blink.models.FloodlightProgramConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:123` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/create` | Camera | bearer | com.immediasemi.blink.models.CreateProgramBody | com.immediasemi.blink.models.FloodlightProgramConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:39` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/temp_alert_disable` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:114` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/temp_alert_enable` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:117` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` | Camera | bearer | — | com.immediasemi.blink.device.camera.zone.api.AdvancedCameraZones | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:69` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` | Camera | bearer | com.immediasemi.blink.device.camera.zone.api.AdvancedCameraZones | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:105` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config` | Doorbell | bearer | — | com.immediasemi.blink.models.LotusChimeConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:61` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config` | Doorbell | bearer | com.immediasemi.blink.models.UpdateLotusChimeConfig | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:121` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/config` | Doorbell | bearer | — | com.immediasemi.blink.models.LotusConfigInfo | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:58` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/power_test` | Doorbell | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:79` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/trigger_chime` | Doorbell | bearer | com.immediasemi.blink.models.TestLotusDingConfig | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:133` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/calibrate` | Doorbell | bearer | com.immediasemi.blink.api.retrofit.TemperatureCalibrationPostBody | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:109` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/temp_alert_disable` | Doorbell | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:103` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/temp_alert_enable` | Doorbell | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:106` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/disable` | Doorbell | bearer | — | com.immediasemi.blink.device.network.command.CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:85` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/enable` | Doorbell | bearer | — | com.immediasemi.blink.device.network.command.CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:97` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/status` | Doorbell | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:115` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/thumbnail` | Doorbell | bearer | — | com.immediasemi.blink.device.network.command.CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:112` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` | Doorbell | bearer | — | com.immediasemi.blink.device.camera.zone.api.AdvancedCameraZones | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:64` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` | Doorbell | bearer | com.immediasemi.blink.device.camera.zone.api.AdvancedCameraZones | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:124` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/doorbells/add` | Doorbell | bearer | com.immediasemi.blink.device.onboard.doorbell.add.AddLotusBody | com.immediasemi.blink.api.retrofit.AddLotusResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:40` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs` | Owl | bearer | — | com.immediasemi.blink.models.FloodlightProgramConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:65` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/delete` | Owl | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:47` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/disable` | Owl | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:53` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/enable` | Owl | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:59` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/update` | Owl | bearer | com.immediasemi.blink.models.CreateProgramBody | com.immediasemi.blink.models.FloodlightProgramConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:110` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/create` | Owl | bearer | com.immediasemi.blink.models.CreateProgramBody | com.immediasemi.blink.models.FloodlightProgramConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:38` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/add` | Owl | bearer | com.immediasemi.blink.common.device.camera.wired.AddOwlPostBody | com.immediasemi.blink.common.device.camera.wired.AddOwlResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:71` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/owls/add` | Owl | bearer | com.immediasemi.blink.device.onboard.OnboardingBody | com.immediasemi.blink.api.retrofit.OwlAddBody | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:104` |
| GET | `v1/accounts/{injected_account_id}/networks/{network}/programs` | Program | bearer | — | com.immediasemi.blink.scheduling.Program | unchanged | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:32` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/delete` | Program | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:23` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/disable` | Program | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:26` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/enable` | Program | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:29` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/update` | Program | bearer | com.immediasemi.blink.scheduling.UpdateProgramRequest | Unit | unchanged | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:35` |
| POST | `v1/accounts/{injected_account_id}/networks/{network}/programs/create` | Program | bearer | com.immediasemi.blink.scheduling.Program | Unit | unchanged | direct | `com/immediasemi/blink/device/network/program/ProgramApi.java:20` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{camera}/accessories/{accessoryType}/{accessoryId}/delete` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:42` |
| GET | `v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/network_type` | Camera | bearer | — | com.immediasemi.blink.models.VideoNetworksConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:66` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/network_type` | Camera | bearer | com.immediasemi.blink.common.device.camera.video.VideoNetworkTypeBody | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:99` |
| GET | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/list` | Doorbell | bearer | — | com.immediasemi.blink.common.device.camera.wired.ChimeCamerasResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:52` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/update` | Doorbell | bearer | com.immediasemi.blink.common.device.camera.wired.ChimeCamerasPostBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:82` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/config` | Doorbell | bearer | com.immediasemi.blink.models.UpdateLotusBody | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:88` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/delete` | Doorbell | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:46` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/status` | Doorbell | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:94` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/ob_cancel` | Doorbell | bearer | com.immediasemi.blink.common.device.camera.doorbell.CancelOnboardingPostBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:91` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/accessories/{accessoryType}/{accessoryId}/delete` | Owl | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:41` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/lights/{lightControl}` | Owl | bearer | — | com.immediasemi.blink.device.network.command.CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:77` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/change_wifi` | Owl | bearer | com.immediasemi.blink.device.onboard.OnboardingBody | com.immediasemi.blink.api.retrofit.OwlAddBody | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:35` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/change_wifi` | Owl | bearer | com.immediasemi.blink.common.device.camera.wired.AddOwlPostBody | com.immediasemi.blink.common.device.camera.wired.AddOwlResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:74` |
| GET | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config` | Owl | bearer | — | com.immediasemi.blink.models.OwlConfigInfo | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:62` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config` | Owl | bearer | com.immediasemi.blink.models.UpdateOwlBody | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:86` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/delete` | Owl | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:44` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/status` | Owl | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:92` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/thumbnail` | Owl | bearer | — | com.immediasemi.blink.device.network.command.CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:95` |
| DELETE | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/pair` | Camera | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:48` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/pair` | Camera | bearer | com.immediasemi.blink.common.device.camera.PairCameraBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:90` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/swap_pair` | Camera | bearer | com.immediasemi.blink.common.device.camera.SwapCameraBody | Unit | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:93` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/state/{type}` | Network | bearer | — | com.immediasemi.blink.models.Command | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:25` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/state/arm` | Network | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:40` |
| DELETE | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage` | Media | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:27` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/eject` | SyncModule | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:28` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/format` | SyncModule | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:31` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/delete/{clipId}` | Media | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:30` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/request/{clipId}` | Media | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:24` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/request` | Media | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:33` |
| GET | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/media/{commandId}` | Media | bearer | — | com.immediasemi.blink.video.clip.media.MediaResponse | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:36` |
| POST | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/mount` | SyncModule | bearer | — | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:37` |
| GET | `v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/status` | SyncModule | bearer | — | com.immediasemi.blink.api.retrofit.LocalStorageStatusResponse | unchanged | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:34` |
| POST | `v1/accounts/{injected_account_id}/networks/bulk_location_assignment` | Network | bearer | com.immediasemi.blink.device.network.BulkLocationAssignmentRequest | com.immediasemi.blink.device.network.BulkLocationAssignmentResponse | unchanged | direct | `com/immediasemi/blink/device/network/NetworkApi.java:28` |
| GET | `v1/accounts/{injected_account_id}/owls/{serial}/fw_update` | Owl | bearer | — | ResponseBody | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:56` |
| GET | `v1/accounts/{injected_account_id}/smart_video_descriptions` | SmartVideoDescriptions | bearer | — | com.immediasemi.blink.settings.SmartVideoDescriptionsResponse | unchanged | direct | `com/immediasemi/blink/settings/SmartVideoDescriptionsApi.java:18` |
| POST | `v1/accounts/{injected_account_id}/smart_video_descriptions` | SmartVideoDescriptions | bearer | com.immediasemi.blink.settings.SmartVideoDescriptionsPostBody | Unit | unchanged | direct | `com/immediasemi/blink/settings/SmartVideoDescriptionsApi.java:24` |
| POST | `v1/accounts/{injected_account_id}/smart_video_descriptions/summarize` | SmartVideoDescriptions | bearer | com.immediasemi.blink.video.clip.moment.SummarizeClipsRequest | com.immediasemi.blink.video.clip.moment.SummarizeClipsResponse | unchanged | direct | `com/immediasemi/blink/settings/SmartVideoDescriptionsApi.java:21` |
| GET | `v1/accounts/{injected_account_id}/sync_modules/{serial}/fw_update` | SyncModule | bearer | — | ResponseBody | unchanged | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:25` |
| GET | `v2/accounts/{injected_account_id}/devices/identify/{serialNumber}` | Device | bearer | — | com.immediasemi.blink.common.device.IdentifyDeviceResponseApiModel | unchanged | direct | `com/immediasemi/blink/common/device/DeviceApi.java:13` |
| GET | `v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/config` | Camera | bearer | — | com.immediasemi.blink.models.CameraConfig | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:60` |
| GET | `v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` | Camera | bearer | — | com.immediasemi.blink.device.camera.zone.api.ZoneV2Response | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:72` |
| POST | `v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` | Camera | bearer | com.immediasemi.blink.device.camera.zone.api.ZoneV2Response | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:108` |
| GET | `v2/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` | Doorbell | bearer | — | com.immediasemi.blink.device.camera.zone.api.ZoneV2Response | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:67` |
| POST | `v2/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` | Doorbell | bearer | com.immediasemi.blink.device.camera.zone.api.ZoneV2Response | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:127` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/cameras/{camera}/light_accessories/{accessoryId}/lights/{lightControl}` | Camera | bearer | — | com.immediasemi.blink.device.network.command.CameraActionKommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:75` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/config` | Camera | bearer | com.immediasemi.blink.api.retrofit.UpdateCameraBody | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:78` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/liveview` | Doorbell | bearer | com.immediasemi.blink.common.device.camera.video.live.LiveViewCommandPostBody | com.immediasemi.blink.common.device.camera.video.live.LiveViewCommandResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java:100` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/liveview` | Owl | bearer | com.immediasemi.blink.common.device.camera.video.live.LiveViewCommandPostBody | com.immediasemi.blink.common.device.camera.video.live.LiveViewCommandResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:83` |
| GET | `v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/zones` | Owl | bearer | — | com.immediasemi.blink.device.camera.zone.api.ZoneV2Response | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:68` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/zones` | Owl | bearer | com.immediasemi.blink.device.camera.zone.api.ZoneV2Response | com.immediasemi.blink.device.network.command.Kommand | unchanged | direct | `com/immediasemi/blink/common/device/camera/wired/OwlApi.java:98` |
| POST | `v2/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{type}` | SyncModule | bearer | com.immediasemi.blink.device.onboard.OnboardingBody | com.immediasemi.blink.models.Command | unchanged | direct | `com/immediasemi/blink/device/sync/SyncModuleApi.java:40` |
| GET | `v2/accounts/{injected_account_id}/subscriptions/entitlements` | ReadSubscription | bearer | — | com.immediasemi.blink.api.retrofit.EntitlementResponse | unchanged | direct | `com/immediasemi/blink/common/subscription/ReadSubscriptionApi.java:16` |
| GET | `v3/accounts/{injected_account_id}/subscriptions/plans` | ReadSubscription | bearer | — | com.immediasemi.blink.common.subscription.SubscriptionPlansResponse | removed | direct | `com/immediasemi/blink/common/subscription/ReadSubscriptionApi.java:19` |
| GET | `v4/accounts/{injected_account_id}/homescreen` | HomeScreen | bearer | — | com.immediasemi.blink.utils.sync.HomeScreen | unchanged | direct | `com/immediasemi/blink/utils/sync/HomeScreenApi.java:12` |
| POST | `v4/accounts/{injected_account_id}/media` | Media | bearer | com.immediasemi.blink.video.clip.media.MediaPostBody | com.immediasemi.blink.video.clip.media.MediaResponse | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:57` |
| GET | `v4/accounts/{injected_account_id}/media_settings` | Media | bearer | — | com.immediasemi.blink.video.clip.media.MediaSettingsResponse | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:39` |
| PATCH | `v4/accounts/{injected_account_id}/media_settings` | Media | bearer | com.immediasemi.blink.video.clip.media.MediaSettingsPatch | Unit | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:45` |
| DELETE | `v4/accounts/{injected_account_id}/media/{mediaId}/delete` | Media | bearer | — | Unit | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:21` |
| POST | `v4/accounts/{injected_account_id}/media/delete` | Media | bearer | com.immediasemi.blink.api.retrofit.MediaListBody | Unit | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:48` |
| POST | `v4/accounts/{injected_account_id}/media/favorite` | Media | bearer | com.immediasemi.blink.video.clip.media.FavoriteEventIdsBody | Unit | added | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:51` |
| POST | `v4/accounts/{injected_account_id}/media/mark_as_viewed` | Media | bearer | com.immediasemi.blink.api.retrofit.MediaListBody | Unit | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:54` |
| POST | `v4/accounts/{injected_account_id}/media/unfavorite` | Media | bearer | com.immediasemi.blink.video.clip.media.FavoriteEventIdsBody | Unit | added | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:60` |
| GET | `v4/accounts/{injected_account_id}/subscriptions/plans` | ReadSubscription | bearer | — | com.immediasemi.blink.common.subscription.SubscriptionPlansResponse | unchanged | direct | `com/immediasemi/blink/common/subscription/ReadSubscriptionApi.java:19` |
| GET | `v4/accounts/{injected_account_id}/unwatched_media` | Media | bearer | — | com.immediasemi.blink.video.clip.media.UnwatchedMediaResponse | unchanged | direct | `com/immediasemi/blink/video/clip/media/MediaApi.java:42` |
| POST | `v6/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/liveview` | Camera | bearer | com.immediasemi.blink.common.device.camera.video.live.LiveViewCommandPostBody | com.immediasemi.blink.common.device.camera.video.live.LiveViewCommandResponse | unchanged | direct | `com/immediasemi/blink/common/device/camera/CameraApi.java:87` |

## Request and response schema index

| Model | Kind | Fields | Confidence | Evidence |
|---|---|---:|---|---|
| `AutoCompleteResponse` | object | 2 | direct | `com/amazon/rbks/mobile/locations/network/entities/AutoCompleteResponse.java` |
| `Bounds` | object | 2 | direct | `com/amazon/rbks/mobile/locations/network/entities/Bounds.java` |
| `ClassificationConfidence` | enum | 3 | direct | `com/amazon/rbks/mobile/locations/network/entities/ClassificationConfidence.java` |
| `ClassificationDecision` | enum | 3 | direct | `com/amazon/rbks/mobile/locations/network/entities/ClassificationDecision.java` |
| `GeoCodingRequest` | object | 3 | direct | `com/amazon/rbks/mobile/locations/network/entities/GeoCodingRequest.java` |
| `GeoCodingRequestBounds` | object | 2 | direct | `com/amazon/rbks/mobile/locations/network/entities/GeoCodingRequestBounds.java` |
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
| `AuthenticatePasswordBody` | object | 1 | direct | `com/immediasemi/blink/account/auth/AuthenticatePasswordBody.java` |
| `AuthenticatePasswordResponse` | object | 2 | direct | `com/immediasemi/blink/account/auth/AuthenticatePasswordResponse.java` |
| `ResetPasswordPostBody` | object | 6 | direct | `com/immediasemi/blink/account/password/ResetPasswordPostBody.java` |
| `AddPhoneNumberPostBody` | object | 3 | direct | `com/immediasemi/blink/account/phone/AddPhoneNumberPostBody.java` |
| `ChimeType` | enum | 2 | direct | `com/immediasemi/blink/adddevice/lotus/chime/ChimeType.java` |
| `Stages` | object | 0 | inferred | `com/immediasemi/blink/api/requests/onboarding/OnboardingCommandUpdate/stage/Stages.java` |
| `UpdateCommandRequest` | object | 1 | direct | `com/immediasemi/blink/api/requests/onboarding/OnboardingCommandUpdate/UpdateCommandRequest.java` |
| `AcknowledgeNotificationBody` | enum | 2 | direct | `com/immediasemi/blink/api/retrofit/AcknowledgeNotificationBody.java` |
| `AddLotusDoorbell` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/AddLotusDoorbell.java` |
| `AddLotusResponse` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/AddLotusResponse.java` |
| `ChangePhoneNumberBody` | object | 4 | direct | `com/immediasemi/blink/api/retrofit/ChangePhoneNumberBody.java` |
| `ChangePhoneNumberResponse` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/ChangePhoneNumberResponse.java` |
| `Client` | object | 8 | direct | `com/immediasemi/blink/api/retrofit/Client.java` |
| `CountryBody` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/CountryBody.java` |
| `CountryResponse` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/CountryResponse.java` |
| `DeleteClientBody` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/DeleteClientBody.java` |
| `DeviceRegistrationStatus` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/DeviceRegistrationStatus.java` |
| `Entitlement` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/Entitlement.java` |
| `EntitlementFeature` | object | 4 | direct | `com/immediasemi/blink/api/retrofit/EntitlementFeature.java` |
| `EntitlementHomescreen` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/EntitlementHomescreen.java` |
| `EntitlementResponse` | object | 2 | direct | `com/immediasemi/blink/api/retrofit/EntitlementResponse.java` |
| `EventDataKeyValuePair` | object | 2 | direct | `com/immediasemi/blink/api/retrofit/EventDataKeyValuePair.java` |
| `GetClientsResponse` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/GetClientsResponse.java` |
| `LocalStorageStatusResponse` | object | 12 | direct | `com/immediasemi/blink/api/retrofit/LocalStorageStatusResponse.java` |
| `LogsBody` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/LogsBody.java` |
| `MediaListBody` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/MediaListBody.java` |
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
| `TrackingEvent` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/TrackingEvent.java` |
| `TrackingEvents` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/TrackingEvents.java` |
| `UpdateAccessoryBody` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/UpdateAccessoryBody.java` |
| `UpdateCameraBody` | enum | 40 | direct | `com/immediasemi/blink/api/retrofit/UpdateCameraBody.java` |
| `UpdateLightAccessoryBody` | object | 6 | direct | `com/immediasemi/blink/api/retrofit/UpdateLightAccessoryBody.java` |
| `UpdateNetworkSaveAllLiveViews` | object | 1 | direct | `com/immediasemi/blink/api/retrofit/UpdateNetworkSaveAllLiveViews.java` |
| `UpdateStormBody` | object | 5 | direct | `com/immediasemi/blink/api/retrofit/UpdateStormBody.java` |
| `UpdateSuperiorBody` | object | 5 | direct | `com/immediasemi/blink/api/retrofit/UpdateSuperiorBody.java` |
| `UpdateSystemNameBody` | object | 3 | direct | `com/immediasemi/blink/api/retrofit/UpdateSystemNameBody.java` |
| `UpdateTimezoneBody` | object | 5 | direct | `com/immediasemi/blink/api/retrofit/UpdateTimezoneBody.java` |
| `VerifyPinBody` | object | 4 | direct | `com/immediasemi/blink/api/retrofit/VerifyPinBody.java` |
| `AccessAuthorization` | object | 5 | direct | `com/immediasemi/blink/common/account/AccessAuthorization.java` |
| `AccessInvitation` | object | 3 | direct | `com/immediasemi/blink/common/account/AccessInvitation.java` |
| `AccessMessage` | object | 4 | direct | `com/immediasemi/blink/common/account/AccessMessage.java` |
| `Account` | object | 20 | direct | `com/immediasemi/blink/common/account/Account.java` |
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
| `AccountOptionsResponse` | object | 15 | direct | `com/immediasemi/blink/common/account/option/AccountOptionsResponse.java` |
| `Phone` | object | 4 | direct | `com/immediasemi/blink/common/account/phone/Phone.java` |
| `AccountPreferencesBody` | object | 1 | direct | `com/immediasemi/blink/common/account/preference/AccountPreferencesBody.java` |
| `AccountPreferencesDetails` | object | 1 | direct | `com/immediasemi/blink/common/account/preference/AccountPreferencesDetails.java` |
| `SentInvitation` | object | 4 | direct | `com/immediasemi/blink/common/account/SentInvitation.java` |
| `TierInfo` | object | 2 | direct | `com/immediasemi/blink/common/account/TierInfo.java` |
| `User` | object | 1 | direct | `com/immediasemi/blink/common/account/User.java` |
| `Email` | object | 1 | direct | `com/immediasemi/blink/common/account/verification/Email.java` |
| `GeneratePinPostBody` | object | 3 | direct | `com/immediasemi/blink/common/account/verification/GeneratePinPostBody.java` |
| `GeneratePinResponse` | object | 3 | direct | `com/immediasemi/blink/common/account/verification/GeneratePinResponse.java` |
| `Phone` | object | 2 | direct | `com/immediasemi/blink/common/account/verification/Phone.java` |
| `PhoneVerificationChannel` | enum | 2 | direct | `com/immediasemi/blink/common/account/verification/PhoneVerificationChannel.java` |
| `Verification` | object | 2 | direct | `com/immediasemi/blink/common/account/verification/Verification.java` |
| `VerificationChannel` | enum | 1 | direct | `com/immediasemi/blink/common/account/verification/VerificationChannel.java` |
| `VerifyPinPostBody` | object | 4 | direct | `com/immediasemi/blink/common/account/verification/VerifyPinPostBody.java` |
| `VerifyPinResponse` | object | 5 | direct | `com/immediasemi/blink/common/account/verification/VerifyPinResponse.java` |
| `CountriesResponse` | object | 2 | direct | `com/immediasemi/blink/common/country/CountriesResponse.java` |
| `Region` | object | 3 | direct | `com/immediasemi/blink/common/country/Region.java` |
| `RegionsResponse` | object | 3 | direct | `com/immediasemi/blink/common/country/RegionsResponse.java` |
| `CameraColor` | enum | 4 | direct | `com/immediasemi/blink/common/device/camera/CameraColor.java` |
| `CancelOnboardingPostBody` | object | 1 | direct | `com/immediasemi/blink/common/device/camera/doorbell/CancelOnboardingPostBody.java` |
| `LotusDoorbellMode` | enum | 1 | direct | `com/immediasemi/blink/common/device/camera/doorbell/LotusDoorbellMode.java` |
| `PairCameraBody` | object | 1 | direct | `com/immediasemi/blink/common/device/camera/PairCameraBody.java` |
| `SwapCameraBody` | object | 1 | direct | `com/immediasemi/blink/common/device/camera/SwapCameraBody.java` |
| `LiveViewCommandPostBody` | object | 2 | direct | `com/immediasemi/blink/common/device/camera/video/live/LiveViewCommandPostBody.java` |
| `LiveViewCommandResponse` | object | 15 | direct | `com/immediasemi/blink/common/device/camera/video/live/LiveViewCommandResponse.java` |
| `PollOptions` | object | 1 | direct | `com/immediasemi/blink/common/device/camera/video/live/PollOptions.java` |
| `VideoNetworkTypeBody` | object | 1 | direct | `com/immediasemi/blink/common/device/camera/video/VideoNetworkTypeBody.java` |
| `AddOwlPostBody` | object | 2 | direct | `com/immediasemi/blink/common/device/camera/wired/AddOwlPostBody.java` |
| `AddOwlResponse` | object | 2 | direct | `com/immediasemi/blink/common/device/camera/wired/AddOwlResponse.java` |
| `ChimeCameraDto` | object | 6 | direct | `com/immediasemi/blink/common/device/camera/wired/ChimeCameraDto.java` |
| `ChimeCamerasPostBody` | object | 2 | direct | `com/immediasemi/blink/common/device/camera/wired/ChimeCamerasPostBody.java` |
| `ChimeCamerasResponse` | object | 2 | direct | `com/immediasemi/blink/common/device/camera/wired/ChimeCamerasResponse.java` |
| `DeviceAuthTokenResponse` | object | 3 | direct | `com/immediasemi/blink/common/device/camera/wired/DeviceAuthTokenResponse.java` |
| `SessionKeys` | object | 3 | direct | `com/immediasemi/blink/common/device/camera/wired/SessionKeys.java` |
| `ChimeVolumeSettings` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/ChimeVolumeSettings.java` |
| `CvSettings` | object | 1 | direct | `com/immediasemi/blink/common/device/duos/CvSettings.java` |
| `DetectionTypes` | object | 3 | direct | `com/immediasemi/blink/common/device/duos/DetectionTypes.java` |
| `DeviceBulkUpdateRequest` | object | 2 | direct | `com/immediasemi/blink/common/device/duos/DeviceBulkUpdateRequest.java` |
| `DeviceBulkUpdateResponse` | object | 3 | direct | `com/immediasemi/blink/common/device/duos/DeviceBulkUpdateResponse.java` |
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
| `RdisDeviceHealth` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisDeviceHealth.java` |
| `RdisDeviceIdentityAttributes` | object | 6 | direct | `com/immediasemi/blink/common/device/rdis/RdisDeviceIdentityAttributes.java` |
| `RdisDeviceSettingsAttributes` | object | 13 | direct | `com/immediasemi/blink/common/device/rdis/RdisDeviceSettingsAttributes.java` |
| `RdisDeviceSettingsData` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisDeviceSettingsData.java` |
| `RdisDeviceSettingsIncluded` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisDeviceSettingsIncluded.java` |
| `RdisDeviceSettingsResponse` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisDeviceSettingsResponse.java` |
| `RdisDevicesResponse` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisDevicesResponse.java` |
| `RdisEnabled` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisEnabled.java` |
| `RdisError` | object | 5 | direct | `com/immediasemi/blink/common/device/rdis/RdisError.java` |
| `RdisErrorSource` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisErrorSource.java` |
| `RdisFamiliarFacesState` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisFamiliarFacesState.java` |
| `RdisFeatureState` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisFeatureState.java` |
| `RdisImageEnhancements` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisImageEnhancements.java` |
| `RdisIncluded` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisIncluded.java` |
| `RdisIncludedAttrs` | object | 7 | direct | `com/immediasemi/blink/common/device/rdis/RdisIncludedAttrs.java` |
| `RdisLedCapabilities` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisLedCapabilities.java` |
| `RdisLedConfig` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisLedConfig.java` |
| `RdisMotionCapabilities` | object | 4 | direct | `com/immediasemi/blink/common/device/rdis/RdisMotionCapabilities.java` |
| `RdisMotionConfigurations` | object | 6 | direct | `com/immediasemi/blink/common/device/rdis/RdisMotionConfigurations.java` |
| `RdisMotionDetectionEnabled` | enum | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisMotionDetectionEnabled.java` |
| `RdisOperation` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisOperation.java` |
| `RdisOperationAttributes` | object | 7 | direct | `com/immediasemi/blink/common/device/rdis/RdisOperationAttributes.java` |
| `RdisOperationData` | object | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisOperationData.java` |
| `RdisOperationsBody` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisOperationsBody.java` |
| `RdisOperationsResponse` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisOperationsResponse.java` |
| `RdisOperationType` | enum | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisOperationType.java` |
| `RdisPlacement` | enum | 3 | direct | `com/immediasemi/blink/common/device/rdis/RdisPlacement.java` |
| `RdisRelationship` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisRelationship.java` |
| `RdisRelationshipLinks` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisRelationshipLinks.java` |
| `RdisRelationshipRef` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisRelationshipRef.java` |
| `RdisRelationships` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisRelationships.java` |
| `RdisSignalStrength` | enum | 6 | direct | `com/immediasemi/blink/common/device/rdis/RdisSignalStrength.java` |
| `RdisStatusLed` | enum | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisStatusLed.java` |
| `RdisVideoConfigurations` | object | 1 | direct | `com/immediasemi/blink/common/device/rdis/RdisVideoConfigurations.java` |
| `RdisZone` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisZone.java` |
| `RdisZoneVertex` | object | 2 | direct | `com/immediasemi/blink/common/device/rdis/RdisZoneVertex.java` |
| `DeviceRegistryPatchBody` | object | 1 | direct | `com/immediasemi/blink/common/device/registry/DeviceRegistryPatchBody.java` |
| `AccessPoint` | object | 7 | direct | `com/immediasemi/blink/common/device/ringsos/AccessPoint.java` |
| `AccessPointListResponse` | object | 2 | direct | `com/immediasemi/blink/common/device/ringsos/AccessPointListResponse.java` |
| `ApIpConfig` | object | 8 | direct | `com/immediasemi/blink/common/device/ringsos/ApIpConfig.java` |
| `ApWirelessConfig` | object | 5 | direct | `com/immediasemi/blink/common/device/ringsos/ApWirelessConfig.java` |
| `AudioConfig` | object | 1 | direct | `com/immediasemi/blink/common/device/ringsos/AudioConfig.java` |
| `Blink` | object | 4 | direct | `com/immediasemi/blink/common/device/ringsos/Blink.java` |
| `ChimeAccessoryConfigInfoResponse` | object | 10 | direct | `com/immediasemi/blink/common/device/ringsos/ChimeAccessoryConfigInfoResponse.java` |
| `Client` | object | 4 | direct | `com/immediasemi/blink/common/device/ringsos/Client.java` |
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
| `Wireless` | object | 3 | direct | `com/immediasemi/blink/common/device/ringsos/Wireless.java` |
| `WirelessConfig` | object | 8 | direct | `com/immediasemi/blink/common/device/ringsos/WirelessConfig.java` |
| `FeatureFlag` | object | 2 | direct | `com/immediasemi/blink/common/flag/FeatureFlag.java` |
| `FeatureFlagsResponse` | object | 1 | direct | `com/immediasemi/blink/common/flag/FeatureFlagsResponse.java` |
| `AccessHomescreen` | object | 1 | direct | `com/immediasemi/blink/common/subscription/AccessHomescreen.java` |
| `AccessItem` | object | 2 | direct | `com/immediasemi/blink/common/subscription/AccessItem.java` |
| `AccessItemStatus` | object | 3 | direct | `com/immediasemi/blink/common/subscription/AccessItemStatus.java` |
| `AccessResponse` | object | 2 | direct | `com/immediasemi/blink/common/subscription/AccessResponse.java` |
| `AccessTarget` | object | 2 | direct | `com/immediasemi/blink/common/subscription/AccessTarget.java` |
| `AttachPlanBody` | object | 2 | direct | `com/immediasemi/blink/common/subscription/basic/AttachPlanBody.java` |
| `DeviceEligibility` | object | 3 | direct | `com/immediasemi/blink/common/subscription/basic/DeviceEligibility.java` |
| `DeviceEligibilityResponse` | object | 1 | direct | `com/immediasemi/blink/common/subscription/basic/DeviceEligibilityResponse.java` |
| `DeviceInfo` | object | 2 | direct | `com/immediasemi/blink/common/subscription/basic/DeviceInfo.java` |
| `Subscription` | object | 11 | direct | `com/immediasemi/blink/common/subscription/Subscription.java` |
| `SubscriptionBanner` | object | 3 | direct | `com/immediasemi/blink/common/subscription/SubscriptionBanner.java` |
| `SubscriptionCycle` | object | 4 | direct | `com/immediasemi/blink/common/subscription/SubscriptionCycle.java` |
| `SubscriptionPlan` | object | 2 | direct | `com/immediasemi/blink/common/subscription/SubscriptionPlan.java` |
| `SubscriptionPlansResponse` | object | 5 | direct | `com/immediasemi/blink/common/subscription/SubscriptionPlansResponse.java` |
| `SubscriptionTrial` | object | 3 | direct | `com/immediasemi/blink/common/subscription/trial/SubscriptionTrial.java` |
| `SubscriptionTrialPopup` | enum | 4 | direct | `com/immediasemi/blink/common/subscription/trial/SubscriptionTrialPopup.java` |
| `UpsellEligibility` | object | 3 | direct | `com/immediasemi/blink/common/subscription/upsell/UpsellEligibility.java` |
| `AddNetworkBody` | object | 7 | direct | `com/immediasemi/blink/common/system/AddNetworkBody.java` |
| `LinkManifest` | object | 2 | direct | `com/immediasemi/blink/common/url/LinkManifest.java` |
| `LocaleUrlMap` | object | 2 | direct | `com/immediasemi/blink/common/url/LocaleUrlMap.java` |
| `AccessName` | enum | 1 | direct | `com/immediasemi/blink/db/enums/AccessName.java` |
| `AccessReason` | enum | 1 | direct | `com/immediasemi/blink/db/enums/AccessReason.java` |
| `AccessStatus` | enum | 1 | direct | `com/immediasemi/blink/db/enums/AccessStatus.java` |
| `AccessTarget` | enum | 1 | direct | `com/immediasemi/blink/db/enums/AccessTarget.java` |
| `EntitlementReason` | enum | 1 | direct | `com/immediasemi/blink/db/enums/EntitlementReason.java` |
| `EntitlementStatus` | enum | 1 | direct | `com/immediasemi/blink/db/enums/EntitlementStatus.java` |
| `EventDataKey` | enum | 1 | direct | `com/immediasemi/blink/db/EventDataKey.java` |
| `EventName` | enum | 1 | direct | `com/immediasemi/blink/db/EventName.java` |
| `NetworkRepository` | object | 0 | inferred | `com/immediasemi/blink/db/NetworkRepository.java` |
| `AddAccessoryBody` | object | 2 | direct | `com/immediasemi/blink/device/accessory/AddAccessoryBody.java` |
| `DeleteAccessoryBody` | object | 1 | direct | `com/immediasemi/blink/device/accessory/DeleteAccessoryBody.java` |
| `DetectionModes` | object | 3 | direct | `com/immediasemi/blink/device/camera/setting/motion/DetectionModes.java` |
| `MotionRecordingSetting` | object | 1 | direct | `com/immediasemi/blink/device/camera/setting/motion/MotionRecordingSetting.java` |
| `ActivityZonesVersion` | enum | 2 | direct | `com/immediasemi/blink/device/camera/zone/ActivityZonesVersion.java` |
| `AdvancedCameraZones` | object | 3 | direct | `com/immediasemi/blink/device/camera/zone/api/AdvancedCameraZones.java` |
| `PrivacyZoneSpan` | object | 4 | direct | `com/immediasemi/blink/device/camera/zone/api/PrivacyZoneSpan.java` |
| `ZoneV2Response` | object | 7 | direct | `com/immediasemi/blink/device/camera/zone/api/ZoneV2Response.java` |
| `BulkLocationAssignment` | object | 2 | direct | `com/immediasemi/blink/device/network/BulkLocationAssignment.java` |
| `BulkLocationAssignmentRequest` | object | 1 | direct | `com/immediasemi/blink/device/network/BulkLocationAssignmentRequest.java` |
| `BulkLocationAssignmentResponse` | object | 2 | direct | `com/immediasemi/blink/device/network/BulkLocationAssignmentResponse.java` |
| `CameraActionKommand` | object | 7 | direct | `com/immediasemi/blink/device/network/command/CameraActionKommand.java` |
| `Kommand` | object | 2 | direct | `com/immediasemi/blink/device/network/command/Kommand.java` |
| `PollingResponse` | enum | 6 | direct | `com/immediasemi/blink/device/network/command/PollingResponse.java` |
| `SupervisorKommand` | object | 6 | direct | `com/immediasemi/blink/device/network/command/SupervisorKommand.java` |
| `AddCameraBody` | object | 3 | direct | `com/immediasemi/blink/device/onboard/camera/AddCameraBody.java` |
| `AddLotusBody` | object | 3 | direct | `com/immediasemi/blink/device/onboard/doorbell/add/AddLotusBody.java` |
| `OnboardingBody` | object | 2 | direct | `com/immediasemi/blink/device/onboard/OnboardingBody.java` |
| `CreateLinkRequest` | object | 7 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/CreateLinkRequest.java` |
| `CreateLinkResponse` | object | 4 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/CreateLinkResponse.java` |
| `DeviceLink` | object | 5 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/DeviceLink.java` |
| `DeviceLinksResponse` | object | 1 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/DeviceLinksResponse.java` |
| `LinkedDevice` | object | 2 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/LinkedDevice.java` |
| `LinkObject` | object | 2 | direct | `com/immediasemi/blink/device/setting/linkdevice/data/model/LinkObject.java` |
| `AdditionalTrialBody` | object | 1 | direct | `com/immediasemi/blink/home/additionaltrial/AdditionalTrialBody.java` |
| `Attributes` | object | 4 | direct | `com/immediasemi/blink/models/accessory/chime/Attributes.java` |
| `AttributesType` | enum | 1 | direct | `com/immediasemi/blink/models/accessory/chime/AttributesType.java` |
| `ChimeSignalStrength` | enum | 5 | direct | `com/immediasemi/blink/models/accessory/chime/ChimeSignalStrength.java` |
| `AccessoryConfig` | object | 8 | direct | `com/immediasemi/blink/models/AccessoryConfig.java` |
| `AccessPoint` | object | 5 | direct | `com/immediasemi/blink/models/AccessPoint.java` |
| `AccessPoints` | object | 3 | direct | `com/immediasemi/blink/models/AccessPoints.java` |
| `AddCameraResponseBody` | object | 3 | direct | `com/immediasemi/blink/models/AddCameraResponseBody.java` |
| `ANetwork` | object | 1 | direct | `com/immediasemi/blink/models/ANetwork.java` |
| `Camera` | object | 46 | direct | `com/immediasemi/blink/models/Camera.java` |
| `CameraConfig` | object | 3 | direct | `com/immediasemi/blink/models/CameraConfig.java` |
| `CameraConfigInfo` | object | 74 | direct | `com/immediasemi/blink/models/CameraConfigInfo.java` |
| `Command` | object | 19 | direct | `com/immediasemi/blink/models/Command.java` |
| `CreateProgramBody` | object | 5 | direct | `com/immediasemi/blink/models/CreateProgramBody.java` |
| `DeviceStatus` | object | 48 | direct | `com/immediasemi/blink/models/DeviceStatus.java` |
| `FloodlightProgramConfig` | object | 2 | direct | `com/immediasemi/blink/models/FloodlightProgramConfig.java` |
| `LightAccessoryConfig` | object | 10 | direct | `com/immediasemi/blink/models/LightAccessoryConfig.java` |
| `LightStatus` | enum | 1 | direct | `com/immediasemi/blink/models/LightStatus.java` |
| `LotusChimeConfig` | object | 7 | direct | `com/immediasemi/blink/models/LotusChimeConfig.java` |
| `LotusConfigInfo` | object | 53 | direct | `com/immediasemi/blink/models/LotusConfigInfo.java` |
| `Network` | object | 25 | direct | `com/immediasemi/blink/models/Network.java` |
| `OwlConfigInfo` | object | 57 | direct | `com/immediasemi/blink/models/OwlConfigInfo.java` |
| `PanTiltAccessoryConfig` | object | 1 | direct | `com/immediasemi/blink/models/PanTiltAccessoryConfig.java` |
| `ProgramConfig` | object | 10 | direct | `com/immediasemi/blink/models/ProgramConfig.java` |
| `RosieConfig` | object | 5 | direct | `com/immediasemi/blink/models/RosieConfig.java` |
| `SignalStrength` | object | 6 | direct | `com/immediasemi/blink/models/SignalStrength.java` |
| `SuperiorConfig` | object | 8 | direct | `com/immediasemi/blink/models/SuperiorConfig.java` |
| `TestLotusDingConfig` | object | 2 | direct | `com/immediasemi/blink/models/TestLotusDingConfig.java` |
| `UpdateLotusBody` | object | 27 | direct | `com/immediasemi/blink/models/UpdateLotusBody.java` |
| `UpdateLotusChimeConfig` | object | 1 | direct | `com/immediasemi/blink/models/UpdateLotusChimeConfig.java` |
| `UpdateOwlBody` | object | 31 | direct | `com/immediasemi/blink/models/UpdateOwlBody.java` |
| `VideoNetworkConfig` | object | 2 | direct | `com/immediasemi/blink/models/VideoNetworkConfig.java` |
| `VideoNetworks` | object | 3 | direct | `com/immediasemi/blink/models/VideoNetworks.java` |
| `VideoNetworksConfig` | object | 2 | direct | `com/immediasemi/blink/models/VideoNetworksConfig.java` |
| `AuthenticatorSelection` | object | 4 | direct | `com/immediasemi/blink/passkey/AuthenticatorSelection.java` |
| `ExcludeCredential` | object | 3 | direct | `com/immediasemi/blink/passkey/ExcludeCredential.java` |
| `PubKeyCredParam` | object | 2 | direct | `com/immediasemi/blink/passkey/PubKeyCredParam.java` |
| `PublicKeyCredentialData` | object | 3 | direct | `com/immediasemi/blink/passkey/PublicKeyCredentialData.java` |
| `RegistrationRequest` | object | 2 | direct | `com/immediasemi/blink/passkey/RegistrationRequest.java` |
| `RegistrationResponse` | object | 8 | direct | `com/immediasemi/blink/passkey/RegistrationResponse.java` |
| `RelyingParty` | object | 2 | direct | `com/immediasemi/blink/passkey/RelyingParty.java` |
| `VerifyOtpResponse` | object | 1 | direct | `com/immediasemi/blink/passkey/VerifyOtpResponse.java` |
| `VerifyRegistrationRequest` | object | 4 | direct | `com/immediasemi/blink/passkey/VerifyRegistrationRequest.java` |
| `WebAuthnUser` | object | 3 | direct | `com/immediasemi/blink/passkey/WebAuthnUser.java` |
| `Program` | object | 8 | direct | `com/immediasemi/blink/scheduling/Program.java` |
| `ScheduleAction` | object | 7 | direct | `com/immediasemi/blink/scheduling/ScheduleAction.java` |
| `ScheduleEvent` | object | 4 | direct | `com/immediasemi/blink/scheduling/ScheduleEvent.java` |
| `UpdateProgramRequest` | object | 6 | direct | `com/immediasemi/blink/scheduling/UpdateProgramRequest.java` |
| `AcceptInvitationBody` | object | 1 | direct | `com/immediasemi/blink/settings/access/accept/AcceptInvitationBody.java` |
| `CheckAuthorizationResponse` | object | 1 | direct | `com/immediasemi/blink/settings/access/accept/CheckAuthorizationResponse.java` |
| `AccessSummary` | object | 5 | direct | `com/immediasemi/blink/settings/access/AccessSummary.java` |
| `SendInviteBody` | object | 1 | direct | `com/immediasemi/blink/settings/access/SendInviteBody.java` |
| `AlexaLinkingAuthorizePostBody` | object | 5 | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingAuthorizePostBody.java` |
| `AlexaLinkingAuthorizeResponse` | object | 1 | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingAuthorizeResponse.java` |
| `AlexaLinkingLinkPostBody` | object | 2 | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkingLinkPostBody.java` |
| `AlexaLinkStatus` | object | 3 | direct | `com/immediasemi/blink/settings/account/alexa/AlexaLinkStatus.java` |
| `DataRequests` | object | 4 | direct | `com/immediasemi/blink/settings/account/managedata/DataRequests.java` |
| `SubmitDataRequestResponse` | object | 1 | direct | `com/immediasemi/blink/settings/account/managedata/SubmitDataRequestResponse.java` |
| `ThirdPartyAuthorization` | object | 5 | direct | `com/immediasemi/blink/settings/account/managedata/ThirdPartyAuthorization.java` |
| `ChangeEmailPostBody` | object | 2 | direct | `com/immediasemi/blink/settings/email/ChangeEmailPostBody.java` |
| `EnrollmentImageAttributes` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/identities/EnrollmentImageAttributes.java` |
| `EnrollmentImageRef` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/identities/EnrollmentImageRef.java` |
| `EnrollmentImageRelationship` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/identities/EnrollmentImageRelationship.java` |
| `EnrollmentImageResource` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/identities/EnrollmentImageResource.java` |
| `IdentitiesMeta` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesMeta.java` |
| `IdentitiesResponse` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentitiesResponse.java` |
| `IdentityAttributes` | object | 6 | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentityAttributes.java` |
| `IdentityResource` | object | 3 | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentityResource.java` |
| `IdentityResponse` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/identities/IdentityResponse.java` |
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
| `FamiliarFacesUpdate` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/optin/FamiliarFacesUpdate.java` |
| `RdisDeviceAttributes` | object | 7 | direct | `com/immediasemi/blink/settings/knownfaces/optin/RdisDeviceAttributes.java` |
| `RdisDeviceRelationships` | object | 3 | direct | `com/immediasemi/blink/settings/knownfaces/optin/RdisDeviceRelationships.java` |
| `RdisDeviceResource` | object | 4 | direct | `com/immediasemi/blink/settings/knownfaces/optin/RdisDeviceResource.java` |
| `RdisMeta` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/optin/RdisMeta.java` |
| `RdisRelationship` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/optin/RdisRelationship.java` |
| `RdisRelationshipData` | object | 2 | direct | `com/immediasemi/blink/settings/knownfaces/optin/RdisRelationshipData.java` |
| `RdisRelationshipLinks` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/optin/RdisRelationshipLinks.java` |
| `RdisResponse` | object | 3 | direct | `com/immediasemi/blink/settings/knownfaces/optin/RdisResponse.java` |
| `UpdateDeviceConfigurationAttributes` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/optin/UpdateDeviceConfigurationAttributes.java` |
| `UpdateDeviceConfigurationData` | object | 3 | direct | `com/immediasemi/blink/settings/knownfaces/optin/UpdateDeviceConfigurationData.java` |
| `UpdateDeviceConfigurationRequest` | object | 1 | direct | `com/immediasemi/blink/settings/knownfaces/optin/UpdateDeviceConfigurationRequest.java` |
| `SeaDevice` | object | 10 | direct | `com/immediasemi/blink/settings/notifications/sea/SeaDevice.java` |
| `SeaDeviceUpdate` | object | 3 | direct | `com/immediasemi/blink/settings/notifications/sea/SeaDeviceUpdate.java` |
| `SingleEventAlertsPostBody` | object | 1 | direct | `com/immediasemi/blink/settings/notifications/sea/SingleEventAlertsPostBody.java` |
| `SingleEventAlertsResponse` | object | 3 | direct | `com/immediasemi/blink/settings/notifications/sea/SingleEventAlertsResponse.java` |
| `SetTivLockResponse` | object | 1 | direct | `com/immediasemi/blink/settings/privacy/SetTivLockResponse.java` |
| `TivLockBody` | object | 1 | direct | `com/immediasemi/blink/settings/privacy/TivLockBody.java` |
| `TivLockStatus` | object | 2 | direct | `com/immediasemi/blink/settings/privacy/TivLockStatus.java` |
| `CreateSharedLoginBody` | object | 3 | direct | `com/immediasemi/blink/settings/sharedlogin/model/CreateSharedLoginBody.java` |
| `GetSharedLoginResponse` | object | 2 | direct | `com/immediasemi/blink/settings/sharedlogin/model/GetSharedLoginResponse.java` |
| `PostSharedLoginClaimResponse` | object | 3 | direct | `com/immediasemi/blink/settings/sharedlogin/model/PostSharedLoginClaimResponse.java` |
| `PostSharedLoginResponse` | object | 2 | direct | `com/immediasemi/blink/settings/sharedlogin/model/PostSharedLoginResponse.java` |
| `PostSharedLoginVerifyResponse` | object | 1 | direct | `com/immediasemi/blink/settings/sharedlogin/model/PostSharedLoginVerifyResponse.java` |
| `RevokeSharedLoginBody` | object | 2 | direct | `com/immediasemi/blink/settings/sharedlogin/model/RevokeSharedLoginBody.java` |
| `SharedLoginClaimBody` | object | 2 | direct | `com/immediasemi/blink/settings/sharedlogin/model/SharedLoginClaimBody.java` |
| `SharedLoginItem` | object | 8 | direct | `com/immediasemi/blink/settings/sharedlogin/model/SharedLoginItem.java` |
| `SharedLoginVerifyBody` | object | 1 | direct | `com/immediasemi/blink/settings/sharedlogin/model/SharedLoginVerifyBody.java` |
| `SmartVideoDescriptionsPostBody` | object | 2 | direct | `com/immediasemi/blink/settings/SmartVideoDescriptionsPostBody.java` |
| `SmartVideoDescriptionsResponse` | object | 3 | direct | `com/immediasemi/blink/settings/SmartVideoDescriptionsResponse.java` |
| `SvdDevice` | object | 7 | direct | `com/immediasemi/blink/settings/SvdDevice.java` |
| `SvdDeviceUpdate` | object | 3 | direct | `com/immediasemi/blink/settings/SvdDeviceUpdate.java` |
| `AppVersionCheckResponse` | object | 4 | direct | `com/immediasemi/blink/update/AppVersionCheckResponse.java` |
| `CommandPollingType` | object | 0 | inferred | `com/immediasemi/blink/utils/CommandPollingType.java` |
| `DspSubscriptionResponse` | object | 2 | direct | `com/immediasemi/blink/utils/DspSubscriptionResponse.java` |
| `GetFirmwareEndpointResponse` | object | 2 | direct | `com/immediasemi/blink/utils/GetFirmwareEndpointResponse.java` |
| `MapLinkBody` | object | 6 | direct | `com/immediasemi/blink/utils/MapLinkBody.java` |
| `SubscriptionRequestStatusBody` | object | 2 | direct | `com/immediasemi/blink/utils/SubscriptionRequestStatusBody.java` |
| `SubscriptionRequestStatusResponse` | object | 3 | direct | `com/immediasemi/blink/utils/SubscriptionRequestStatusResponse.java` |
| `Accessory` | object | 11 | direct | `com/immediasemi/blink/utils/sync/Accessory.java` |
| `BatteryExtensionPackAccessoryApi` | object | 4 | direct | `com/immediasemi/blink/utils/sync/BatteryExtensionPackAccessoryApi.java` |
| `CameraSignals` | object | 2 | direct | `com/immediasemi/blink/utils/sync/CameraSignals.java` |
| `CamerasV3` | object | 27 | direct | `com/immediasemi/blink/utils/sync/CamerasV3.java` |
| `DeviceLimits` | object | 6 | direct | `com/immediasemi/blink/utils/sync/DeviceLimits.java` |
| `DoorbellsV3` | object | 28 | direct | `com/immediasemi/blink/utils/sync/DoorbellsV3.java` |
| `HomeScreen` | object | 16 | direct | `com/immediasemi/blink/utils/sync/HomeScreen.java` |
| `HomescreenAccount` | object | 4 | direct | `com/immediasemi/blink/utils/sync/HomescreenAccount.java` |
| `LightAccessory` | object | 3 | direct | `com/immediasemi/blink/utils/sync/LightAccessory.java` |
| `LocationHomescreen` | object | 1 | direct | `com/immediasemi/blink/utils/sync/LocationHomescreen.java` |
| `NetworksV3` | object | 9 | direct | `com/immediasemi/blink/utils/sync/NetworksV3.java` |
| `OwlsV3` | object | 27 | direct | `com/immediasemi/blink/utils/sync/OwlsV3.java` |
| `PanTiltAccessory` | object | 1 | direct | `com/immediasemi/blink/utils/sync/PanTiltAccessory.java` |
| `RingDevice` | object | 7 | direct | `com/immediasemi/blink/utils/sync/RingDevice.java` |
| `RingDeviceHealth` | object | 1 | direct | `com/immediasemi/blink/utils/sync/RingDeviceHealth.java` |
| `SyncModulesV3` | object | 17 | direct | `com/immediasemi/blink/utils/sync/SyncModulesV3.java` |
| `VideoStats` | object | 3 | direct | `com/immediasemi/blink/utils/sync/VideoStats.java` |
| `VerifyLinkAccountBody` | object | 1 | direct | `com/immediasemi/blink/utils/VerifyLinkAccountBody.java` |
| `BatchDonationRequest` | object | 4 | direct | `com/immediasemi/blink/video/clip/donation/api/BatchDonationRequest.java` |
| `BatchDonationResponse` | object | 2 | direct | `com/immediasemi/blink/video/clip/donation/api/BatchDonationResponse.java` |
| `DonationClipRequest` | object | 4 | direct | `com/immediasemi/blink/video/clip/donation/api/DonationClipRequest.java` |
| `DonationTranscoding` | object | 5 | direct | `com/immediasemi/blink/video/clip/donation/api/DonationTranscoding.java` |
| `UnprocessedDonationEvent` | object | 5 | direct | `com/immediasemi/blink/video/clip/donation/api/UnprocessedDonationEvent.java` |
| `AiVideoDescription` | object | 2 | direct | `com/immediasemi/blink/video/clip/media/AiVideoDescription.java` |
| `BackendMedia` | object | 26 | direct | `com/immediasemi/blink/video/clip/media/BackendMedia.java` |
| `FavoriteEventIdsBody` | object | 1 | direct | `com/immediasemi/blink/video/clip/media/FavoriteEventIdsBody.java` |
| `MediaPostBody` | object | 7 | direct | `com/immediasemi/blink/video/clip/media/MediaPostBody.java` |
| `MediaProfile` | object | 4 | direct | `com/immediasemi/blink/video/clip/media/MediaProfile.java` |
| `MediaResponse` | object | 5 | direct | `com/immediasemi/blink/video/clip/media/MediaResponse.java` |
| `MediaSettingsPatch` | object | 1 | direct | `com/immediasemi/blink/video/clip/media/MediaSettingsPatch.java` |
| `MediaSettingsResponse` | object | 3 | direct | `com/immediasemi/blink/video/clip/media/MediaSettingsResponse.java` |
| `UnusualActivity` | object | 2 | direct | `com/immediasemi/blink/video/clip/media/UnusualActivity.java` |
| `UnwatchedMediaResponse` | object | 1 | direct | `com/immediasemi/blink/video/clip/media/UnwatchedMediaResponse.java` |
| `SummarizeClipsRequest` | object | 1 | direct | `com/immediasemi/blink/video/clip/moment/SummarizeClipsRequest.java` |
| `SummarizeClipsResponse` | object | 1 | direct | `com/immediasemi/blink/video/clip/moment/SummarizeClipsResponse.java` |
| `ApiFactoryDeviceProfile` | object | 7 | direct | `com/ring/blueprints/setup/core/data/backend/ApiFactoryDeviceProfile.java` |
| `ApiSetup` | object | 6 | direct | `com/ring/blueprints/setup/core/data/backend/ApiSetup.java` |
| `ApiSetupStatus` | object | 12 | direct | `com/ring/blueprints/setup/core/data/backend/ApiSetupStatus.java` |
| `CompleteSetupBody` | object | 5 | direct | `com/ring/blueprints/setup/core/data/backend/CompleteSetupBody.java` |
| `DeviceFirmwareResponse` | object | 4 | direct | `com/ring/blueprints/setup/core/data/entity/DeviceFirmwareResponse.java` |
| `DetectionType` | enum | 1 | direct | `com/ringapp/library/video/event/model/DetectionType.java` |
| `Identity` | object | 4 | direct | `com/ringapp/library/video/event/model/Identity.java` |
| `ProfileResolutionStatus` | enum | 4 | direct | `com/ringapp/library/video/event/model/ProfileResolutionStatus.java` |
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
| `JsonElement` | object | 0 | inferred | `kotlinx/serialization/json/JsonElement.java` |

## Command, polling, retry, and error semantics

- Command-producing endpoints are identified by response model and feature, but server status codes not declared in the APK remain unknown.
- Static polling/retry semantics are retained as service-level evidence; they must not be treated as proof of current server timing.
- No new 59.2 Retrofit declaration establishes a general HTTP 409 serialization or retry contract.

## Dynamic transports

- RDIS/DUOS, event-stream, WebSocket, RTSP, and local-device indicators are indexed under `protocolIndicators`.
- The declaration catalog separates known service families, but it does not claim complete call-site, signaling, retry, device-family, or runtime-host reconstruction.
- Consult each endpoint recovery state and its unresolved record before treating transport attribution as established.

## 57.1 → 59.2 change report

- Added: 19
- Changed: 13
- Unchanged: 288
- Removed: 1

### Added

- `POST 2fa/v1/webauthn/registration` (authentication)
- `POST 2fa/v1/webauthn/registration/verify` (authentication)
- `GET device_info/v4/devices/{deviceId}` (device-orchestration)
- `PUT duos/v1/devices/{deviceId}/update` (device-orchestration)
- `PUT duos/v1/devices/{deviceId}/update` (device-orchestration)
- `POST oauth/v2/verify_otp` (oauth)
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

- `GET device_info/v4/devices` (device-orchestration)
- `POST device_info/v4/devices/operations` (device-orchestration)
- `GET device_info/v4/devices/{deviceId}/configurations` (rest)
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

- Active normalized contracts: 320
- Models recovered: 475
- Unresolved candidates: 349
- Smali-only contracts: 2
- Active contracts without smali evidence: 0
- Unresolved models: 0
- Unclassified first-party candidates: 0
- JADX reported errors: 605

- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/cameras/add` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/doorbells/{serial}/token` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST setups/{setupId}/complete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET evm/v2/timeline/24/devices/{source_id}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.models.LastConnect` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `GET v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/state/arm` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v5/clients/{injected_client_id}/client_verification/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/shared_login/claim` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v5/clients/{injected_client_id}/client_verification/pin/resend` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/unsnooze` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST app/logs/upload` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST api/set/ssid` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST geocoding/v1/geocode` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/disable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.Setup` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/disable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET ees/v2/history/extendedsearchmetadata` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET api/version` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/subscriptions/plans/get_device_attach_eligibility` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET system/prov/ap_list` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET device_info/v4/devices/{deviceId}/status` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/snooze` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET devices/v2/locations` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/identities` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.models.STAGE_TYPE` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `GET regions` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/users/pin/resend` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/power_test` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `PUT duos/v1/devices/{deviceId}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.models.MAX_RECORDING_RESOLUTION` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `PATCH v1/identities/{id}/enrollment-images/actions/move-enrollment-images` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/temp_alert_disable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/accounts/{injected_account_id}/media/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET setups/{setupId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/enable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/subscriptions/link/link_account` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/change_wifi` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/single_event_alerts` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/countries` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/smart_video_descriptions/summarize` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `PATCH v1/shared/popovers/{popoverId}/read` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET evm/v2/history/unwatched/count` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/network_type` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET fms/device-firmware` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET evm/v3/history/devices` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/subscriptions/clear_popup/{type}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/unsnooze` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/owls/add` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v5/clients/{injected_client_id}/phone_number_change` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v2/accounts/{injected_account_id}/devices/identify/{serialNumber}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/owls/add` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST api/set/app_fw_update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/clients/{injected_client_id}/password_change` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{lotus_id}/unsnooze` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/clients/{injected_client_id}/control_panel/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE v1/subscriptions/plans/cancel_trial` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/users/preferences` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET api/logs` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/calibrate` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET evm/v2/metadata/history/devices` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/shared/check_authorization` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/cameras/{camera_id}/unsnooze` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE evm/v2/events/associations/{profile_Id}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET geocoding/v1/ip/info/my` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v2/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/liveview` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.ring.blueprints.setup.core.data.backend.MetaData` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST device_info/v4/devices/operations` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/state/disarm` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/request` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/temp_alert_enable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/media/{commandId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/accessories/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/enable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE duos/v1/locations/{locationId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v2/accounts/{injected_account_id}/networks/{networkId}/cameras/{camera}/light_accessories/{accessoryId}/lights/{lightControl}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/programs/create` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/trigger_chime` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/pair` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST duos/v1/locations` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/subscriptions/plans/renew_trial` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST evm/v3/history/events` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE v1/shared/authorizations/{authorizationId}/remove` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `PATCH duos/v1/locations/{locationId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/enable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/clients/{injected_client_id}/password_change/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.api.retrofit.SSId` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST v4/users/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET accounts/{injected_account_id}/networks/{network}/commands/{command}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET evm/v2/timeline/events/eventito/{source_id}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/clients/{injected_client_id}/shared_login/pin/resend` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/ob_cancel` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/shared/invitations/send` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/change_wifi` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST users/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST @Url` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/lights/{lightControl}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `PUT duos/v1/devices/{deviceId}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/alexa/authorization` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE v1/history/events/associations/{profile_id}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET location-subtypes` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.models.NETWORK_ORIGIN` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `PATCH devices/v1/devices/{deviceId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST setups` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.api.retrofit.Status` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `GET v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE blink/clients_api/links/v1/locations/{locationId}/devices/{deviceId}/links/{linkId}?ignore_rbac=true&include_deactivated=false` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/accounts/{injected_account_id}/media/unfavorite` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `PUT share_service/v3/batch_shares` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST blink/clients_api/links/v1/locations/{locationId}/events/{event}/receivers?ignore_rbac=true&include_deactivated=false` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v2/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{type}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `PATCH v1/identities/{id}/actions/merge-identities` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET device_info/v4/devices/{deviceId}/configurations` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/feature_flags/enabled` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE v1/shared/invitations/{invitationId}/revoke` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET geocoding/v1/auto-complete/details` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/single_event_alerts` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST system/config/network` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/users/tier_info` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/clients/{injected_client_id}/logout` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/snooze` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v2/subscriptions/plans/create_trial` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.models.LIVEVIEW_STATE` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{camera}/accessories/{accessoryType}/{accessoryId}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/identities/{id}/actions/split-identity` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET location_info/v3/locations` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v2/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/liveview` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE recordings/public/footages/{deviceId}/delete_all` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/thumbnail` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v2/users/info` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/add` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.Setup` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST v2/notification` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/status` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/accounts/{injected_account_id}/media/mark_as_viewed` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v2/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/users/preferences` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/request/{clipId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.models.SEQUENTIAL_ALERTS_STATUS` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `GET v1/users/options` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v4/accounts/{injected_account_id}/subscriptions/plans` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `PATCH v4/accounts/{injected_account_id}/media_settings` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/commands/{command}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET geocoding/v1/auto-complete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST system/config/reg_domain` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/countries/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE dings/{dingId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v2/clients/{injected_client_id}/tiv_unlock/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/shared/invitations/{invitationId}/accept` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/shared_login/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/clear_creds` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/commands/{command}/done` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/notifications/preferences` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/clients/{injected_client_id}/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.models.accessory.chime.Health` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-reference:** `com.immediasemi.blink.common.device.duos.DeviceBulkUpdateError` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/commands/{command}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/status` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/status` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `PATCH devices/{deviceId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.RegionClient` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-reference:** `com.immediasemi.blink.scheduling.ProgramStatusCallback` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `GET evm/v2/history/devices` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET blink/clients_api/links/v1/locations/{locationId}/devices/{deviceId}/links?ignore_rbac=true&include_deactivated=false` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST oauth/v2/verify_otp` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/subscriptions/plans/{subscriptionId}/attach` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/data_request/dsar/create` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET evm/v2/timeline/devices/{doorbotId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/cameras/{camera_id}/snooze` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `PUT duos/v1/devices/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/clients/{injected_client_id}/password_change/pin/generate` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/shared_login/revoke` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v2/clients/{injected_client_id}/tiv_unlock/pin/resend` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v7/users/register` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/version` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/users/password_change/pin/generate` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/disable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `PATCH v1/devices/{id}/configurations` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST 1.0.0/batch/client.device/{appSubGroup}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/data_request/euda/create` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/data_request/third_party/{thirdPartyId}/revoke` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/clients/{injected_client_id}/email_change/pin/resend` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/temp_alert_disable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v2/clients/{injected_client_id}/tiv` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/mount` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.Meta` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/add` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `PUT duos/v1/devices/{deviceId}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET device_info/v4/devices/{deviceId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET device_info/v4/devices/{deviceId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/change_mode` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST 2fa/v1/webauthn/registration` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/{program}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/events/app` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/alexa/link` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v2/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/clients/{injected_client_id}/options` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v2/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE v4/accounts/{injected_account_id}/media/{mediaId}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET system/config/network` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.Data` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST sos/v1/setups` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.Included` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/bulk_location_assignment` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/shared/summary` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET evm/v2/history/events/{eventId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/identity/token` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v4/accounts/{injected_account_id}/media_settings` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/accessories/add` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/state/{type}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `PATCH devices/v1/devices/{deviceId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/eject` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/enable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/users/authenticate_password` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{lotusId}/status` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE devices/v1/devices/{deviceId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/format` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST clients_api/setups` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/clients/{injected_client_id}/email_change/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v6/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/liveview` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/users/password_change/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE v1/shared/authorizations/{authorizationId}/revoke` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST evm/v2/history/extendedsearch` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.models.VIDEO_DESTINATION` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `DELETE v1/identities/{id}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/identities/{id}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET factory_profile` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/cameras/{camera}/programs/create` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/users/countries/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET device_info/v4/devices` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/create` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v4/accounts/{injected_account_id}/unwatched_media` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST 2fa/v1/webauthn/registration/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{doorbell_id}/stay_awake` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/doorbells/{lotus_id}/snooze` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/cameras/{camera}/{type}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE v1/shared/invitations/{invitationId}/decline` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE evm/v2/dings` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/smart_video_descriptions` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.Attributes` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/sync_modules/{serial}/fw_update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/owls/{owl_id}/accessories/rosie/{rosie_id}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/shared_login` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.video.clip.media.Filters` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `PUT dings/{dingId}/favorite` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET @Url` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v2/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/config` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/alexa/link_status` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{camera}/accessories/{accessoryType}/{accessoryId}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/temp_alert_enable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v3/users/validate_password` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/delete/{clipId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/clients/{injected_client_id}/email_change` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/doorbells/{serial}/fw_update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.models.CONDITION_TYPE` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `GET api/ssids` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v3/users/validate_email` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/subscriptions/link/unlink_account` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET clients_api/setups/{setupId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET apphelp.immedia-semi.com/link-manifest.json` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE v1/identities/{id}/enrollment-images` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.Data` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.RegionWireless` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/system_offline/{network}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE v1/alexa/link` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `PATCH v1/identities/{id}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE dings/{dingId}/favorite` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{network}/programs` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/shared_login` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE recordings/public/footages/{deviceId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/users/password_change` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.common.device.ringsos.Setup` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST v1/clients/{injected_client_id}/shared_login/request_pin` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/clients/{injected_client_id}/shared_login/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/programs/{program}/disable` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/clients/{injected_client_id}/control_panel/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/list` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/devices` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/pair` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network_id}/accessories/rosie/owl/{owl_id}/calibrate` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/network_type` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v5/clients/{injected_client_id}/phone_number_change/pin/verify` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `PATCH v1/shared/authorizations/{authorizationId}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/accounts/{injected_account_id}/media` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST 1.0.0/event/client.device/{appSubGroup}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST api/set/key` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/notifications/preferences` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/change_wifi` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET api/get_fw_version` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.models.LED_ILLUMINATOR_STATE` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{lotus}/zones` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/status` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/owls/{serial}/fw_update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST evm/v2/events/watch` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v2/clients/{injected_client_id}/tiv_unlock/request_pin` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/clients/{injected_client_id}/control_panel/request_pin` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v2/accounts/{injected_account_id}/subscriptions/entitlements` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/clients/{injected_client_id}/options` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST evm/v2/events` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST oauth/token` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{owlId}/thumbnail` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{networkId}/owls/{primary_id}/swap_pair` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `DELETE evm/v2/events/time-based-deletion/{source_id}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET geocoding/v1/reverse-geocode` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{networkId}/cameras/{cameraId}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.models.CAMERA_STATUS` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs/{program}/delete` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v5/clients/{injected_client_id}/phone_number_change` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST accounts/{injected_account_id}/networks/{network}/cameras/{camera}/thumbnail` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/clients/{injected_client_id}/control_panel/pin/resend` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v4/accounts/{injected_account_id}/media/favorite` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST clients/{injected_client_id}/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v4/accounts/{injected_account_id}/homescreen` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/locations/update` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET sos/v1/factory_profile` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/clients/{injected_client_id}/control_panel/clients` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/data_request/list` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.models.COMMAND_TYPE` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/networks/{network}/owls/{owl}/programs` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/access` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **model-field-reference:** `com.immediasemi.blink.models.Duration` — The decompiled field type names an application class that was not uniquely recoverable as a top-level model declaration.
- **endpoint-behavior:** `POST v1/subscriptions/request/status/{uuid}` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `GET v1/accounts/{injected_account_id}/smart_video_descriptions` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.
- **endpoint-behavior:** `POST v1/accounts/{injected_account_id}/networks/{network}/doorbells/{doorbellId}/calibrate` — The Retrofit declaration proves the wire binding, but the retained static evidence does not uniquely establish these runtime behaviors.

## Preserved historical and live evidence

The legacy `docs/blink_api_dossier.md` retains evidence IDs E1–E95 and bounded live-account observations. Those observations are not inputs to this static 59.2 contract and remain explicitly distinguished from APK evidence.
