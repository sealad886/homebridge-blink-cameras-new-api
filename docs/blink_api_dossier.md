# Blink API Dossier (APK Evidence) — WIP

This dossier is built from the decompiled Blink Android APK splits in **Root B**: `/Users/andrew/zzApps/blink-home-monitor`.
All statements below are evidence-backed with file paths + minimal snippets. Unknowns are explicitly marked.

## Evidence Index

**E1 — Base URLs (REST, shared REST, OAuth, event stream, local)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/core/api/BaseUrls.java`
```java
public static final String EVENT_STREAM_DEV = "https://dev.eventstream.immedia-semi.com/";
public static final String EVENT_STREAM_PROD = "https://prod.eventstream.immedia-semi.com/";
public static final String LOCAL = "http://172.16.97.199/";
public static final String OAUTH = "https://api.{env}oauth.blink.com/";
public static final String REST = "https://rest-{tier}.immedia-semi.com/api/";
public static final String SHARED_REST = "https://rest-{shared_tier}.immedia-semi.com/api/";
```

**E2 — Base URL providers (DI module)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/inject/BaseUrlModule.java`
```java
@Provides @Singleton public final String provideRestUrl() { return BaseUrls.REST; }
@Provides @Singleton public final String provideSharedRestUrl() { return BaseUrls.SHARED_REST; }
@Provides @Singleton public final String provideOauthUrl() { return BaseUrls.OAUTH; }
@Provides @Singleton public final String provideLocalUrl() { return BaseUrls.LOCAL; }
```

**E3 — URL tokens and host detection**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/core/api/RestApiKt.java`
```java
public static final String ENV_SUBDOMAIN_TOKEN = "{env}";
public static final String IMMEDIA_SEMI_DOMAIN = "immedia-semi.com";
public static final String SHARED_TIER_TOKEN = "{shared_tier}";
public static final String TIER_TOKEN = "{tier}";
public static final boolean isBlinkHost(String str) {
    return Intrinsics.areEqual(str, IMMEDIA_SEMI_DOMAIN)
        || StringsKt.endsWith$default(str, ".immedia-semi.com", false, 2, null);
}
```

**E4 — Tier/env token replacement in OkHttp (base + OAuth)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/inject/NetworkModule.java`
```java
return new OkHttpClient.Builder()
  .addInterceptor(headersInterceptor)
  .addInterceptor(chain -> chain.proceed(
      request.newBuilder()
        .url(StringsKt.replace$default(
             request.url().getUrl(), RestApiKt.TIER_TOKEN,
             (String) runBlocking(new ...tierRepository...), false, 4, null))
        .build()))
  ...
```
```java
OauthApi oauthApi = (OauthApi) retrofitBuilder.baseUrl(oauthUrl)
  .client(okHttpClient.newBuilder()
    .addInterceptor(chain -> chain.proceed(
      request.newBuilder()
        .url(StringsKt.replace$default(
            request.url().getUrl(), RestApiKt.ENV_SUBDOMAIN_TOKEN,
            (String) runBlocking(new ...tierRepository...), false, 4, null))
        .build()))
    .build())
  .build().create(OauthApi.class);
```

**E5 — Core HTTP header names**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/core/api/HttpHeader.java`
```java
public static final String APP_BUILD = "APP-BUILD";
public static final String USER_AGENT = "User-Agent";
public static final String LOCALE = "LOCALE";
public static final String TIME_ZONE = "X-Blink-Time-Zone";
public static final String TOKEN_AUTH = "TOKEN-AUTH";
public static final String AUTHORIZATION = "Authorization";
```

**E6 — Default header injection**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/network/HeadersInterceptor.java`
```java
Request.Builder builder = chain.request().newBuilder()
  .addHeader(HttpHeader.APP_BUILD, BuildUtils.INSTANCE.getVersionCodeHeader())
  .addHeader("User-Agent", BuildUtils.INSTANCE.getUserAgent());
String string = Locale.getDefault().toString();
Request.Builder builder2 = builder.addHeader(HttpHeader.LOCALE, string);
String id = TimeZone.getDefault().getID();
return chain.proceed(builder2.addHeader(HttpHeader.TIME_ZONE, id).build());
```

**E7 — User-Agent, client type, version code header**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/util/BuildUtils.java`
```java
public final String getClientType() { return isAmazonDevice() ? "amazon" : "android"; }
public final String getUserAgent() {
  return "Blink/51.0 (" + Build.MANUFACTURER + " " + Build.MODEL + "; Android "
         + getAndroidOsVersion() + ")";
}
public final String getVersionCodeHeader() {
  return "ANDROID_" + (BuildConfig.DEV_BUILD ? 0x1fffffff : BuildConfig.VERSION_CODE);
}
```

**E8 — OAuth environment → subdomain mapping**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/core/network/OauthEnvironment.java`
```java
public static final OauthEnvironment PRODUCTION = new OauthEnvironment("PRODUCTION", 0, "production", null);
public static final OauthEnvironment STAGING = new OauthEnvironment("STAGING", 1, "staging", "qa.");
public static final OauthEnvironment DEVELOPMENT = new OauthEnvironment("DEVELOPMENT", 2, "development", "dev.");
public final String getSubdomain() { return this.subdomain; }
```

**E9 — Tier repository (tier codes + env subdomain)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/network/tier/TierRepository.java`
```java
private static final Map<String, Tier> tierCodes = MapsKt.mapOf(
  TuplesKt.to("regression_sqa1", new Tier(){
    private final String tierName = "sqa1";
    private final AwsRegion region = AwsRegion.US_EAST_1;
    private final OauthEnvironment oauthEnvironment = OauthEnvironment.STAGING; ... }),
  TuplesKt.to("regression_cemp", ProductionTier.CEMP));
```
```java
String subdomain = ((OauthEnvironment) obj).getSubdomain();
return subdomain == null ? "" : subdomain;
```

**E10 — OAuth login & refresh endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/account/auth/OauthApi.java`
```java
@FormUrlEncoded @POST("oauth/token")
Object postLogin(@Field("username") String email,
                 @Field("password") String password,
                 @Header("2fa-code") String pin,
                 @Header("hardware_id") String hardwareId,
                 @Field("grant_type") String grantType,
                 @Field("client_id") String clientId,
                 @Field("scope") String scope, ...);

@FormUrlEncoded @POST("oauth/token")
Call<RefreshTokensResponse> postRefreshTokens(@Field("refresh_token") String refreshToken,
                                             @Field("grant_type") String grantType,
                                             @Field("client_id") String clientId,
                                             @Field("scope") String scope);
```

**E11 — Path parameter placeholders**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/core/api/UrlPathParam.java`
```java
public static final String ACCOUNT_ID = "%7Binjected_account_id%7D";
public static final String CLIENT_ID = "%7Binjected_client_id%7D";
```

**E12 — Account/client ID path injection**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/network/AccountIdInterceptor.java`
```java
private final Request getPathInjectedRequest(Request request) {
  return request.newBuilder()
    .url(ClientIdInterceptor.INSTANCE.inject(request.url(),
         TuplesKt.to(UrlPathParam.ACCOUNT_ID, getAccountId())))
    .build();
}
```
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/network/ClientIdInterceptor.java`
```java
private final Request getPathInjectedRequest(Request request) {
  return request.newBuilder()
    .url(INSTANCE.inject(request.url(), TuplesKt.to(UrlPathParam.CLIENT_ID, getClientId())))
    .build();
}
```

**E13 — Local onboarding endpoint (cleartext)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/activities/onboarding/OnboardingBaseActivity.java`
```java
httpURLConnection = (HttpURLConnection)
    new URL("http://172.16.97.199/api/set/app_fw_update").openConnection();
```

**E14 — Authenticated client adds Authorization + TOKEN-AUTH on Blink hosts**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/inject/NetworkModule.java`
```java
return okHttpClient.newBuilder().addInterceptor(clientIdInterceptor)
  .addInterceptor(chain -> {
    Request request = chain.request();
    if (RestApiKt.isBlinkHost(request.url().host())) {
      Request.Builder builder = request.newBuilder();
      String token = (String) runBlocking(new ...credentialRepository...);
      if (token != null) builder.addHeader("Authorization", RestApiKt.getBearerFormat(token));
      String tokenAuth = (String) runBlocking(new ...credentialRepository...);
      if (tokenAuth != null) builder.addHeader(HttpHeader.TOKEN_AUTH, tokenAuth);
      request = builder.build();
    }
    return chain.proceed(request);
  }).authenticator(authenticator).addInterceptor(httpLoggingInterceptor).build();
```

**E15 — Authenticator refresh flow (Blink hosts only; no priorResponse)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/network/BlinkAuthenticator$authenticate$1$1.java`
```java
request = response.request();
if (!RestApiKt.isBlinkHost(request.url().host())) { request = null; }
...
if (response.priorResponse() == null) {
  RefreshTokensUseCase refreshTokensUseCase = blinkAuthenticator.refreshTokens;
  Object result = refreshTokensUseCase.m16061invokeIoAF18A(this);
  ...
}
```

**E16 — Refresh token call + token persistence**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/account/auth/RefreshTokensUseCase$invoke$2.java`
```java
Response responseExecute =
  OauthApi.postRefreshTokens$default(this.this$0.oauthApi, refreshToken, null, null, null, 14, null)
    .execute();
RefreshTokensResponse body = (RefreshTokensResponse) responseExecute.body();
...
credentialRepository.setTokens(body.getAccessToken(), body.getRefreshToken(), this);
```

**E17 — Local SyncModuleService base URL + encryption interceptor**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/adddevice/AddDeviceViewModel.java`
```java
builder.addInterceptor(new EncryptionInterceptor());
return (SyncModuleService) this.retrofitBuilder
  .baseUrl(BaseUrls.LOCAL)
  .client(builder.build())
  .build().create(SyncModuleService.class);
```

**E18 — Local SyncModuleService endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/api/retrofit/SyncModuleService.java`
```java
@GET("api/ssids") Observable<AccessPoints> getSsids();
@POST("/api/set/app_fw_update") Observable<BlinkData> setFirmwareUpdate(...);
@POST("/api/set/ssid") Observable<BlinkData> setSSid(...);
```

**E19 — Live view command endpoint**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/device/camera/CameraApi.java`
```java
@POST("v6/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{cameraId}/liveview")
Object postLiveViewCommand(@Path("networkId") long networkId,
  @Path("cameraId") long cameraId,
  @Body LiveViewCommandPostBody body, Continuation<? super Result<LiveViewCommandResponse>> c);
```

**E20 — Live view request body fields**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/device/camera/video/live/LiveViewCommandPostBody.java`
```java
private String intent;
@SerializedName("motion_event_start_time")
private String motionEventStartTime;
```

**E21 — Live view response fields (server, token, polling, duration)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/device/camera/video/live/LiveViewCommandResponse.java`
```java
private final String server;
@SerializedName("polling_interval") private final long pollingIntervalInSeconds;
@SerializedName("duration") private final Integer sessionDuration;
@SerializedName("liveview_token") private final String liveViewToken;
```

**E22 — Live video response fields (legacy/alt response)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/models/LiveVideoResponse.java`
```java
public String server;
public int duration;
public int continue_interval;
public int continue_warning;
public boolean is_multi_client_live_view;
```

**E23 — Live stream scheme marker**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/video/live/sessionmanager/WalnutSignalling.java`
```java
private static final String LV_SCHEME_RTSPS = "rtsps";
```

**E24 — EventStream client base URL + auth token provider**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/inject/LibraryModule.java`
```java
EventStreamApi eventStreamApi = (EventStreamApi) new Retrofit.Builder()
  .baseUrl(BaseUrls.EVENT_STREAM_PROD)
  .addConverterFactory(GsonConverterFactory.create(gson))
  .client(okHttpClient).build().create(EventStreamApi.class);
AuthInfoProvider authInfoProvider = new AuthInfoProvider() {
  public Void getAuthToken() { return null; }
};
```

**E28 — EventStream API endpoints (client.device events)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/ring/android/eventstream/storage/api/EventStreamApi.java`
```java
@POST("1.0.0/batch/client.device/{appSubGroup}")
Object sendBatchEvents(@Header("Authorization") String authToken,
  @Path("appSubGroup") String appSubGroup, @Body RequestBody payload, ...);
@POST("1.0.0/event/client.device/{appSubGroup}")
Object trackEvent(@Header("Authorization") String authToken,
  @Path("appSubGroup") String appSubGroup, @Body RequestBody payload, ...);
```

**E29 — Shared authenticated REST Retrofit bindings (shared_tier base + accountId interceptor)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/inject/AuthenticatedSharedRestApiModule.java`
```java
@Provides @Singleton
public final HomeScreenApi provideHomeScreenApi(@Named(NetworkModule.SHARED_AUTHENTICATED_RETROFIT) Retrofit retrofit)
{ return (HomeScreenApi) retrofit.create(HomeScreenApi.class); }
@Provides @Singleton
public final CommandApi provideCommandApi(@Named(NetworkModule.SHARED_AUTHENTICATED_RETROFIT) Retrofit retrofit)
{ return (CommandApi) retrofit.create(CommandApi.class); }
... (DeviceApi, CameraApi, NetworkApi, etc. all via SHARED_AUTHENTICATED_RETROFIT)
```

**E30 — Non‑shared authenticated REST Retrofit bindings (rest tier base)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/inject/AuthenticatedNotSharedRestApiModule.java`
```java
@Provides @Singleton
public final AccountApi provideAccountApi(Retrofit retrofit)
{ return (AccountApi) retrofit.create(AccountApi.class); }
@Provides @Singleton
public final NotificationApi provideNotificationApi(Retrofit retrofit)
{ return (NotificationApi) retrofit.create(NotificationApi.class); }
... (ClientApi, AccessApi, EventApi, etc. via default Retrofit)
```

**E31 — Unauthenticated REST Retrofit (public/auth/password reset)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/inject/NetworkModule.java`
```java
@Named(UNAUTHENTICATED_RETROFIT)
public final Retrofit provideRestRetrofit(String restUrl, @Named(BASE_CLIENT) OkHttpClient okHttpClient, ...)
{ return retrofitBuilder.baseUrl(restUrl).client(okHttpClient.newBuilder().addInterceptor(httpLoggingInterceptor).build()).build(); }
```

**E25 — Command polling + update/done endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/device/network/command/CommandApi.java`
```java
@GET("/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}")
Object commandPoll(...);
@POST("/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}/update")
Object postUpdateCommand(...);
@POST("/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}/done")
Call<BlinkData> terminateCommand(...);
```

**E26 — Arm/disarm + network state endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/device/network/NetworkApi.java`
```java
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/state/{type}")
Observable<Command> armDisarmNetwork(@Path("networkId") long networkId, @Path("type") String type);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/state/disarm")
Object disarmNetwork(...);
```

**E27 — Homescreen sync (device summary)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/utils/sync/HomeScreenApi.java`
```java
@GET("v4/accounts/%7Binjected_account_id%7D/homescreen")
Object getHomeScreen(...);
```

**E32 — AccessApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/account/AccessApi.java`
```java
@DELETE("v1/shared/invitations/{invitationId}/decline")
Object m16017deleteDeclineInvitegIAlus(@Path("invitationId") String str, Continuation<? super Result<Unit>> continuation);
@DELETE("v1/shared/authorizations/{authorizationId}/remove")
Object m16018deleteRemoveAccessgIAlus(@Path("authorizationId") String str, Continuation<? super Result<PollingResponse>> continuation);
@DELETE("v1/shared/authorizations/{authorizationId}/revoke")
Object m16019deleteRevokeAccessgIAlus(@Path("authorizationId") String str, Continuation<? super Result<Unit>> continuation);
@DELETE("v1/shared/invitations/{invitationId}/revoke")
Object m16020deleteRevokeInvitegIAlus(@Path("invitationId") String str, Continuation<? super Result<Unit>> continuation);
@GET("v1/shared/check_authorization")
Object m16021getCheckAuthorizationgIAlus(@Query("friendly_name") String str, Continuation<? super Result<CheckAuthorizationResponse>> continuation);
@GET("v1/shared/summary")
Object m16022getSharedSummaryIoAF18A(Continuation<? super Result<AccessSummary>> continuation);
@PATCH("v1/shared/authorizations/{authorizationId}")
Object m16023patchFriendlyNameBWLJW6A(@Path("authorizationId") String str, @Query("first_request") boolean z, @Body FriendlyNamePatchBody friendlyNamePatchBody, Continuation<? super Result<PollingResponse>> continuation);
@PATCH("v1/shared/popovers/{popoverId}/read")
Object m16024popoverReadgIAlus(@Path("popoverId") String str, Continuation<? super Result<Unit>> continuation);
@POST("v1/shared/invitations/{invitationId}/accept")
Object m16025postAcceptAccess0E7RQCE(@Path("invitationId") String str, @Body AcceptInvitationBody acceptInvitationBody, Continuation<? super Result<PollingResponse>> continuation);
@POST("v1/shared/invitations/send")
Object m16026postSendInvitegIAlus(@Body SendInviteBody sendInviteBody, Continuation<? super Result<Unit>> continuation);
```

**E33 — AccessoryApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/device/accessory/AccessoryApi.java`
```java
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/accessories/add")
Object m16411addAccessory0E7RQCE(@Body AddAccessoryBody addAccessoryBody, @Path(ProcessNotification.KEY_NETWORK) long j, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/accessories/delete")
Object m16412delete0E7RQCE(@Path("network_id") long j, @Body DeleteAccessoryBody deleteAccessoryBody, Continuation<? super Result<? extends Kommand>> continuation);
```

**E34 — AccountApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/account/AccountApi.java`
```java
@POST("v1/users/authenticate_password")
Object m16037authenticatePasswordgIAlus(@Body AuthenticatePasswordBody authenticatePasswordBody, Continuation<? super Result<AuthenticatePasswordResponse>> continuation);
@POST("/users/delete")
Object m16038deleteAccountgIAlus(@Body DeleteAccountBody deleteAccountBody, Continuation<? super Result<Unit>> continuation);
@GET("v2/users/info")
Object m16039getAccountInfoIoAF18A(Continuation<? super Result<Account>> continuation);
@GET("v1/users/options")
Object m16040getAccountOptionsIoAF18A(Continuation<? super Result<AccountOptionsResponse>> continuation);
@GET("v1/users/preferences")
Object m16041getAccountPreferencesIoAF18A(Continuation<? super Result<AccountPreferencesBody>> continuation);
@GET("v1/notifications/preferences")
Object m16042getNotificationPreferencesIoAF18A(Continuation<? super Result<NotificationPreferencesResponse>> continuation);
@GET("v1/users/tier_info")
Object m16043getTierInfoIoAF18A(Continuation<? super Result<TierInfo>> continuation);
@POST("v4/clients/%7Binjected_client_id%7D/logout")
Object m16044logoutIoAF18A(Continuation<? super Result<Unit>> continuation);
@POST("v1/users/preferences")
Object m16045postAccountPreferencesgIAlus(@Body AccountPreferencesBody accountPreferencesBody, Continuation<? super Result<AccountPreferencesBody>> continuation);
@POST("v1/notifications/preferences")
Object m16046postNotificationPreferencesgIAlus(@Body NotificationPreferencesResponse notificationPreferencesResponse, Continuation<? super Result<Unit>> continuation);
@POST("v4/users/pin/resend")
Object m16047postRegistrationPinResendIoAF18A(Continuation<? super Result<GeneratePinResponse>> continuation);
@POST("v4/users/pin/verify")
Object m16048postRegistrationPinVerifygIAlus(@Body VerifyPinPostBody verifyPinPostBody, Continuation<? super Result<VerifyPinResponse>> continuation);
@POST("v1/identity/token")
Object m16049postTokenUpgradegIAlus(@Body TokenUpgradePostBody tokenUpgradePostBody, Continuation<? super Result<RefreshTokensResponse>> continuation);
@POST("v1/countries/update")
Object m16050setAccountCountrygIAlus(@Body CountryBody countryBody, Continuation<? super Result<CountryResponse>> continuation);
@POST("v1/users/countries/update")
Object m16051updateUserCountrygIAlus(@Body CountryBody countryBody, Continuation<? super Result<CountryResponse>> continuation);
```

**E35 — AlexaLinkingApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/settings/account/alexa/AlexaLinkingApi.java`
```java
@DELETE("v1/alexa/link")
Object m17513deleteLinkIoAF18A(Continuation<? super Result<Unit>> continuation);
@GET("v1/alexa/link_status")
Object m17514getLinkStatusIoAF18A(Continuation<? super Result<AlexaLinkStatus>> continuation);
@POST("v1/alexa/authorization")
Object m17515postAuthorizationgIAlus(@Body AlexaLinkingAuthorizePostBody alexaLinkingAuthorizePostBody, Continuation<? super Result<AlexaLinkingAuthorizeResponse>> continuation);
@POST("v1/alexa/link")
Object m17516postLinkgIAlus(@Body AlexaLinkingLinkPostBody alexaLinkingLinkPostBody, Continuation<? super Result<Unit>> continuation);
```

**E36 — AuthApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/account/auth/AuthApi.java`
```java
@POST("v7/users/register")
Object m16053postRegistergIAlus(@Body RegisterBody registerBody, Continuation<? super Result<AuthenticationResponse>> continuation);
@POST("v3/users/validate_email")
Object m16054postValidateEmailgIAlus(@Body ValidateEmailPostBody validateEmailPostBody, Continuation<? super Result<ValidationResponse>> continuation);
@POST("v3/users/validate_password")
Object m16055postValidatePasswordgIAlus(@Body ValidatePasswordPostBody validatePasswordPostBody, Continuation<? super Result<ValidationResponse>> continuation);
```

**E37 — CameraApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/device/camera/CameraApi.java`
```java
@POST("/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/add")
Object m16110addCamera0E7RQCE(@Body AddCameraBody addCameraBody, @Path(ProcessNotification.KEY_NETWORK) long j, Continuation<? super Result<? extends AddCameraResponseBody>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{camera}/accessories/{accessoryType}/{accessoryId}/delete")
Object m16111deleteAccessoryyxL6bBk(@Path("networkId") long j, @Path(ProcessNotification.KEY_CAMERA) long j2, @Path("accessoryType") AccessoryType accessoryType, @Path("accessoryId") long j3, Continuation<? super Result<Unit>> continuation);
@POST("/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{cameraId}/delete")
Object m16112deleteCamera0E7RQCE(@Path("networkId") long j, @Path("cameraId") long j2, Continuation<? super Result<Unit>> continuation);
@DELETE("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{primary_id}/pair")
Object m16113deleteCameraPair0E7RQCE(@Path("networkId") long j, @Path("primary_id") long j2, Continuation<? super Result<Unit>> continuation);
@POST("/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/delete")
Observable<BlinkData> deleteCameraRx(@Path(ProcessNotification.KEY_NETWORK) long network, @Path(ProcessNotification.KEY_CAMERA) long camera);
@GET("v2/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/config")
Object m16114getCameraConfig0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path(ProcessNotification.KEY_CAMERA) long j2, Continuation<? super Result<CameraConfig>> continuation);
@GET("v2/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/config")
Observable<CameraConfig> getCameraConfigRx(@Path(ProcessNotification.KEY_NETWORK) long network, @Path(ProcessNotification.KEY_CAMERA) long camera);
@GET("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{cameraId}/network_type")
Object m16115getVideoNetworkType0E7RQCE(@Path("networkId") long j, @Path("cameraId") long j2, Continuation<? super Result<VideoNetworksConfig>> continuation);
@GET("v1/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/zones")
Observable<AdvancedCameraZones> getZones(@Path(ProcessNotification.KEY_NETWORK) long network, @Path(ProcessNotification.KEY_CAMERA) long camera);
@GET("v2/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/zones")
Object m16116getZonesV20E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path(ProcessNotification.KEY_CAMERA) long j2, Continuation<? super Result<ZoneV2Response>> continuation);
@POST("v2/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{camera}/light_accessories/{accessoryId}/lights/{lightControl}")
Object m16117postAccessoryLightyxL6bBk(@Path("networkId") long j, @Path(ProcessNotification.KEY_CAMERA) long j2, @Path("accessoryId") long j3, @Path("lightControl") LightControl lightControl, Continuation<? super Result<CameraActionKommand>> continuation);
@POST("v2/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{cameraId}/config")
Object m16118postCameraConfigBWLJW6A(@Body UpdateCameraBody updateCameraBody, @Path("networkId") long j, @Path("cameraId") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/{type}")
Object m16119postCameraMotionBWLJW6A(@Path(ProcessNotification.KEY_NETWORK) long j, @Path(ProcessNotification.KEY_CAMERA) long j2, @Path("type") String str, Continuation<? super Result<CameraActionKommand>> continuation);
@POST("/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/{type}")
Observable<Command> postCameraMotionOld(@Path(ProcessNotification.KEY_NETWORK) long network, @Path(ProcessNotification.KEY_CAMERA) long camera, @Path("type") String type);
@POST("v2/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{camera}/config")
Observable<Command> postCameraSettingsRx(@Body UpdateCameraBody updateCameraBody, @Path("networkId") long networkId, @Path(ProcessNotification.KEY_CAMERA) long camera);
@POST("/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{cameraId}/status")
Object m16120postCameraStatusCommand0E7RQCE(@Path("networkId") long j, @Path("cameraId") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v6/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{cameraId}/liveview")
Object m16121postLiveViewCommandBWLJW6A(@Path("networkId") long j, @Path("cameraId") long j2, @Body LiveViewCommandPostBody liveViewCommandPostBody, Continuation<? super Result<LiveViewCommandResponse>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{primary_id}/pair")
Object m16122postPairCamerasBWLJW6A(@Path("networkId") long j, @Path("primary_id") long j2, @Body PairCameraBody pairCameraBody, Continuation<? super Result<Unit>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{primary_id}/swap_pair")
Object m16123postSwapPairBWLJW6A(@Path("networkId") long j, @Path("primary_id") long j2, @Body SwapCameraBody swapCameraBody, Continuation<? super Result<Unit>> continuation);
@POST("/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/thumbnail")
Object m16124postThumbnail0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path(ProcessNotification.KEY_CAMERA) long j2, Continuation<? super Result<CameraActionKommand>> continuation);
@POST("/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/thumbnail")
Observable<Command> postThumbnailOld(@Path(ProcessNotification.KEY_NETWORK) long network, @Path(ProcessNotification.KEY_CAMERA) long camera);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{cameraId}/network_type")
Object m16125postVideoNetworkTypeBWLJW6A(@Path("networkId") long j, @Path("cameraId") long j2, @Body VideoNetworkTypeBody videoNetworkTypeBody, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/calibrate")
Object m16126saveCalibrateTemperatureBWLJW6A(@Body TemperatureCalibrationPostBody temperatureCalibrationPostBody, @Path(ProcessNotification.KEY_NETWORK) long j, @Path(ProcessNotification.KEY_CAMERA) long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/zones")
Observable<Command> setZones(@Body AdvancedCameraZones body, @Path(ProcessNotification.KEY_NETWORK) long network, @Path(ProcessNotification.KEY_CAMERA) long camera);
@POST("v2/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/zones")
Object m16127setZonesV2BWLJW6A(@Body ZoneV2Response zoneV2Response, @Path(ProcessNotification.KEY_NETWORK) long j, @Path(ProcessNotification.KEY_CAMERA) long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/cameras/{camera_id}/snooze")
Object m16128snoozeCameraBWLJW6A(@Path("network_id") long j, @Path("camera_id") long j2, @Body SnoozeBody snoozeBody, Continuation<? super Result<Unit>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/temp_alert_disable")
Object m16129tempAlertDisable0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path(ProcessNotification.KEY_CAMERA) long j2, Continuation<? super Result<Unit>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/temp_alert_enable")
Object m16130tempAlertEnable0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path(ProcessNotification.KEY_CAMERA) long j2, Continuation<? super Result<Unit>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/cameras/{camera_id}/unsnooze")
Object m16131unSnoozeCamera0E7RQCE(@Path("network_id") long j, @Path("camera_id") long j2, Continuation<? super Result<Unit>> continuation);
```

**E38 — ClientApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/account/client/ClientApi.java`
```java
@GET("v1/clients/%7Binjected_client_id%7D/options")
Object m16065getClientOptionsIoAF18A(Continuation<? super Result<ClientOptionsBody>> continuation);
@POST("v1/clients/%7Binjected_client_id%7D/options")
Object m16066postClientOptionsgIAlus(@Body ClientOptionsBody clientOptionsBody, Continuation<? super Result<Unit>> continuation);
@POST("/clients/%7Binjected_client_id%7D/update")
Object m16067postClientUpdategIAlus(@Body ClientUpdatePostBody clientUpdatePostBody, Continuation<? super Result<Unit>> continuation);
@POST("v5/clients/%7Binjected_client_id%7D/client_verification/pin/resend")
Object m16068resendClientVerificationCodeIoAF18A(Continuation<? super Result<ResendClientVerificationCodeResponse>> continuation);
@POST("v5/clients/%7Binjected_client_id%7D/client_verification/pin/verify")
Object m16069submitClientVerificationCodegIAlus(@Body SubmitVerificationRequest submitVerificationRequest, Continuation<? super Result<PinVerificationResponse>> continuation);
@POST("v4/clients/%7Binjected_client_id%7D/pin/verify")
Object m16070verifyClientPINgIAlus(@Body VerifyPinBody verifyPinBody, Continuation<? super Result<PinVerificationResponse>> continuation);
```

**E39 — ClientDeviceManagementApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/settings/client/ClientDeviceManagementApi.java`
```java
@POST("v1/clients/%7Binjected_client_id%7D/control_panel/delete")
Object m17603deleteClientgIAlus(@Body DeleteClientBody deleteClientBody, Continuation<? super Result<Unit>> continuation);
@GET("v1/clients/%7Binjected_client_id%7D/control_panel/clients")
Object m17604getClientsIoAF18A(Continuation<? super Result<GetClientsResponse>> continuation);
@POST("v1/clients/%7Binjected_client_id%7D/control_panel/request_pin")
Object m17605postManageClientsPinGenerateIoAF18A(Continuation<? super Result<GeneratePinResponse>> continuation);
@POST("v1/clients/%7Binjected_client_id%7D/control_panel/pin/resend")
Object m17606postManageClientsPinResendIoAF18A(Continuation<? super Result<GeneratePinResponse>> continuation);
@POST("v1/clients/%7Binjected_client_id%7D/control_panel/pin/verify")
Object m17607postManageClientsPinVerifygIAlus(@Body VerifyPinPostBody verifyPinPostBody, Continuation<? super Result<VerifyPinResponse>> continuation);
```

**E40 — CommandApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/device/network/command/CommandApi.java`
```java
@GET("/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}")
Object m16202commandPoll0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path(ProcessNotification.KEY_COMMAND) long j2, Continuation<? super Result<? extends SupervisorKommand>> continuation);
@GET("/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}")
Object m16203commandPollCameraAction0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path(ProcessNotification.KEY_COMMAND) long j2, Continuation<? super Result<CameraActionSupervisorKommand>> continuation);
@GET("/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}")
Object m16204commandPollLiveView0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path(ProcessNotification.KEY_COMMAND) long j2, Continuation<? super Result<LiveViewSupervisorKommand>> continuation);
@GET("/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}")
Object m16205commandPollWithChildren0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path(ProcessNotification.KEY_COMMAND) long j2, Continuation<? super Result<SupervisorKommandWithChildren>> continuation);
@GET("/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}")
Observable<Commands> commandPolling(@Path(ProcessNotification.KEY_NETWORK) long networkId, @Path(ProcessNotification.KEY_COMMAND) long commandId);
@POST("/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}/update")
Object m16206postUpdateCommandBWLJW6A(@Body UpdateCommandRequest updateCommandRequest, @Path(ProcessNotification.KEY_NETWORK) long j, @Path(ProcessNotification.KEY_COMMAND) long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}/done")
Call<BlinkData> terminateCommand(@Path(ProcessNotification.KEY_NETWORK) long networkId, @Path(ProcessNotification.KEY_COMMAND) long commandId);
@POST("/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}/update")
Observable<BlinkData> terminateOnboardingCommand(@Body TerminateOnboardingBody terminateOnboardingBody, @Path(ProcessNotification.KEY_NETWORK) long network, @Path(ProcessNotification.KEY_COMMAND) long command);
```

**E41 — CustomerSupportAccessApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/settings/privacy/CustomerSupportAccessApi.java`
```java
@POST("v2/clients/%7Binjected_client_id%7D/tiv")
Object m17650postTivLockgIAlus(@Body TivLockBody tivLockBody, Continuation<? super Result<SetTivLockResponse>> continuation);
@POST("v2/clients/%7Binjected_client_id%7D/tiv_unlock/request_pin")
Object m17651postTivUnlockPinGenerateIoAF18A(Continuation<? super Result<GeneratePinResponse>> continuation);
@POST("v2/clients/%7Binjected_client_id%7D/tiv_unlock/pin/resend")
Object m17652postTivUnlockPinResendIoAF18A(Continuation<? super Result<GeneratePinResponse>> continuation);
@POST("v2/clients/%7Binjected_client_id%7D/tiv_unlock/pin/verify")
Object m17653postTivUnlockPinVerifygIAlus(@Body VerifyPinPostBody verifyPinPostBody, Continuation<? super Result<VerifyPinResponse>> continuation);
```

**E42 — DeviceApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/device/DeviceApi.java`
```java
@GET("v2/accounts/%7Binjected_account_id%7D/devices/identify/{serialNumber}")
Object m16108getDeviceIdentitygIAlus(@Path("serialNumber") String str, Continuation<? super Result<IdentifyDeviceResponse>> continuation);
@Deprecated(message = "Use coroutines instead of RxJava", replaceWith = @ReplaceWith(expression = "getDeviceIdentity(serialNumber)", imports = {}))
@GET("v2/accounts/%7Binjected_account_id%7D/devices/identify/{serialNumber}")
Single<IdentifyDeviceResponseOld> identifyDevice(@Path("serialNumber") String serialNumber);
```

**E43 — DoorbellApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/device/camera/doorbell/DoorbellApi.java`
```java
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/add")
Object m16149addLotus0E7RQCE(@Body AddLotusBody addLotusBody, @Path(ProcessNotification.KEY_NETWORK) long j, Continuation<? super Result<AddLotusResponse>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/doorbells/{doorbell_id}/change_wifi")
Object m16150changeLotusWifiBWLJW6A(@Body OnboardingBody onboardingBody, @Path("network_id") long j, @Path("doorbell_id") long j2, Continuation<? super Result<AddLotusResponse>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/doorbells/{lotusId}/delete")
Object m16151deleteDoorbell0E7RQCE(@Path("networkId") long j, @Path("lotusId") long j2, Continuation<? super Result<Unit>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/delete")
Observable<BlinkData> deleteLotusRx(@Path(ProcessNotification.KEY_NETWORK) long networkId, @Path("lotus") long lotusId);
@GET("v1/accounts/%7Binjected_account_id%7D/doorbells/{serial}/fw_update")
Observable<retrofit2.adapter.rxjava.Result<ResponseBody>> downloadLotusFirmwareUpdate(@Path("serial") String serial);
@GET("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/list")
Object m16152getChimeCameras0E7RQCE(@Path("networkId") long j, @Path("doorbellId") long j2, Continuation<? super Result<ChimeCamerasResponse>> continuation);
@GET("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbell}/config")
Object m16153getDoorbellConfig0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path(DeviceType.IDENTIFY_TYPE_DOORBELL) long j2, Continuation<? super Result<LotusConfigInfo>> continuation);
@GET("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config")
Object m16154getLotusChimeConfigBWLJW6A(@Path("chimeType") ChimeType chimeType, @Path(ProcessNotification.KEY_NETWORK) long j, @Path(DeviceType.IDENTIFY_TYPE_DOORBELL) long j2, Continuation<? super Result<LotusChimeConfig>> continuation);
@GET("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbell}/config")
Observable<LotusConfigInfo> getLotusConfigRx(@Path(ProcessNotification.KEY_NETWORK) long networkId, @Path(DeviceType.IDENTIFY_TYPE_DOORBELL) long doorbellId);
@GET("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/zones")
Observable<AdvancedCameraZones> getLotusZones(@Path(ProcessNotification.KEY_NETWORK) long networkId, @Path("lotus") long lotusId);
@GET("v2/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/zones")
Object m16155getZonesV20E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path("lotus") long j2, Continuation<? super Result<ZoneV2Response>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/doorbells/{doorbell_id}/stay_awake")
Object m16156keepLotusAwake0E7RQCE(@Path("network_id") long j, @Path("doorbell_id") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/doorbells/{doorbell_id}/change_mode")
Object m16157lotusChangeMode0E7RQCE(@Path("network_id") long j, @Path("doorbell_id") long j2, Continuation<? super Result<AddLotusResponse>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/doorbells/{doorbell_id}/clear_creds")
Object m16158lotusClearCreds0E7RQCE(@Path("network_id") long j, @Path("doorbell_id") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbell}/power_test")
Object m16159performLotusPowerAnalysis0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path(DeviceType.IDENTIFY_TYPE_DOORBELL) long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/update")
Object m16160postChimeCamerasBWLJW6A(@Path("networkId") long j, @Path("doorbellId") long j2, @Body ChimeCamerasPostBody chimeCamerasPostBody, Continuation<? super Result<Unit>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/disable")
Object m16161postDisableLotus0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path("lotus") long j2, Continuation<? super Result<CameraActionKommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/disable")
Observable<Command> postDisableLotusOld(@Path(ProcessNotification.KEY_NETWORK) long networkId, @Path("lotus") long lotusId);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/doorbells/{lotusId}/config")
Object m16162postDoorbellConfigBWLJW6A(@Body UpdateLotusBody updateLotusBody, @Path("networkId") long j, @Path("lotusId") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/doorbells/{lotusId}/status")
Object m16163postDoorbellStatusCommand0E7RQCE(@Path("networkId") long j, @Path("lotusId") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/enable")
Object m16164postEnableLotus0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path("lotus") long j2, Continuation<? super Result<CameraActionKommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/enable")
Observable<Command> postEnableLotusOld(@Path(ProcessNotification.KEY_NETWORK) long networkId, @Path("lotus") long lotusId);
@POST("v2/accounts/%7Binjected_account_id%7D/networks/{networkId}/doorbells/{doorbellId}/liveview")
Object m16165postLiveViewCommandBWLJW6A(@Path("networkId") long j, @Path("doorbellId") long j2, @Body LiveViewCommandPostBody liveViewCommandPostBody, Continuation<? super Result<LiveViewCommandResponse>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbellId}/temp_alert_disable")
Object m16166postTempAlertDisable0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path("doorbellId") long j2, Continuation<? super Result<Unit>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbellId}/temp_alert_enable")
Object m16167postTempAlertEnable0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path("doorbellId") long j2, Continuation<? super Result<Unit>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbellId}/calibrate")
Object m16168postTemperatureCalibrationBWLJW6A(@Body TemperatureCalibrationPostBody temperatureCalibrationPostBody, @Path(ProcessNotification.KEY_NETWORK) long j, @Path("doorbellId") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/thumbnail")
Object m16169postThumbnail0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path("lotus") long j2, Continuation<? super Result<CameraActionKommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/thumbnail")
Observable<Command> postThumbnailOld(@Path(ProcessNotification.KEY_NETWORK) long networkId, @Path("lotus") long lotusId);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/status")
Object m16170refreshLotusStatus0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path("lotus") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/status")
Object m16171refreshLotusStatusSuspend0E7RQCE(@Path(ProcessNotification.KEY_NETWORK) long j, @Path("lotus") long j2, Continuation<? super Result<? extends Command>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/config")
Observable<Command> saveLotusSettings(@Body UpdateLotusBody updateLotusBody, @Path(ProcessNotification.KEY_NETWORK) long networkId, @Path("lotus") long lotusId);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config")
Object m16172setLotusChimeConfigyxL6bBk(@Path("chimeType") ChimeType chimeType, @Path(ProcessNotification.KEY_NETWORK) long j, @Path(DeviceType.IDENTIFY_TYPE_DOORBELL) long j2, @Body UpdateLotusChimeConfig updateLotusChimeConfig, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/zones")
Observable<Command> setLotusZones(@Body AdvancedCameraZones body, @Path(ProcessNotification.KEY_NETWORK) long networkId, @Path("lotus") long lotusId);
@POST("v2/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/zones")
Object m16173setZonesV2BWLJW6A(@Body ZoneV2Response zoneV2Response, @Path(ProcessNotification.KEY_NETWORK) long j, @Path("lotus") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/doorbells/{lotus_id}/snooze")
Object m16174snoozeLotusBWLJW6A(@Path("network_id") long j, @Path("lotus_id") long j2, @Body SnoozeBody snoozeBody, Continuation<? super Result<Unit>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbell}/trigger_chime")
Object m16175testLotusDingBWLJW6A(@Path(ProcessNotification.KEY_NETWORK) long j, @Path(DeviceType.IDENTIFY_TYPE_DOORBELL) long j2, @Body TestLotusDingConfig testLotusDingConfig, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/doorbells/{lotus_id}/unsnooze")
Object m16176unSnoozeLotus0E7RQCE(@Path("network_id") long j, @Path("lotus_id") long j2, Continuation<? super Result<Unit>> continuation);
```

**E44 — EmailChangeApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/settings/email/EmailChangeApi.java`
```java
@POST("v4/clients/%7Binjected_client_id%7D/email_change")
Object m17629postEmailChangegIAlus(@Body ChangeEmailPostBody changeEmailPostBody, Continuation<? super Result<Unit>> continuation);
@POST("v4/clients/%7Binjected_client_id%7D/email_change/pin/resend")
Object m17630postEmailChangePinGenerateIoAF18A(Continuation<? super Result<GeneratePinResponse>> continuation);
@POST("v4/clients/%7Binjected_client_id%7D/email_change/pin/verify")
Object m17631postEmailChangePinVerifygIAlus(@Body VerifyPinPostBody verifyPinPostBody, Continuation<? super Result<VerifyPinResponse>> continuation);
```

**E45 — EventApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/track/event/EventApi.java`
```java
@POST("v1/events/app")
Object m16255trackEventsgIAlus(@Body TrackingEvents trackingEvents, Continuation<? super Result<Unit>> continuation);
```

**E46 — EventStreamApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/ring/android/eventstream/storage/api/EventStreamApi.java`
```java
@POST("1.0.0/batch/client.device/{appSubGroup}")
Object sendBatchEvents(@Header("Authorization") String str, @Path("appSubGroup") String str2, @Body RequestBody requestBody, Continuation<? super Unit> continuation);
@POST("1.0.0/event/client.device/{appSubGroup}")
Object trackEvent(@Header("Authorization") String str, @Path("appSubGroup") String str2, @Body RequestBody requestBody, Continuation<? super Unit> continuation);
```

**E47 — FeatureFlagApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/flag/FeatureFlagApi.java`
```java
@GET("v1/accounts/%7Binjected_account_id%7D/feature_flags/enabled")
Object m16211getFeatureFlagsIoAF18A(Continuation<? super Result<FeatureFlagsResponse>> continuation);
```

**E48 — HomeScreenApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/utils/sync/HomeScreenApi.java`
```java
@GET("v4/accounts/%7Binjected_account_id%7D/homescreen")
Object m17741getHomeScreenIoAF18A(Continuation<? super Result<HomeScreen>> continuation);
```

**E49 — LogApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/log/LogApi.java`
```java
@POST("/app/logs/upload")
Observable<BlinkData> sendLogs(@Body LogsBody body);
@POST("/app/logs/upload")
Call<BlinkData> sendLogsCall(@Body LogsBody body);
```

**E50 — ManageDataApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/settings/account/managedata/ManageDataApi.java`
```java
@GET("v1/data_request/list")
Object m17550getDataRequestsIoAF18A(Continuation<? super Result<DataRequests>> continuation);
@POST("v1/data_request/dsar/create")
Object m17551postDsarRequestIoAF18A(Continuation<? super Result<SubmitDataRequestResponse>> continuation);
@POST("v1/data_request/euda/create")
Object m17552postEudaRequestIoAF18A(Continuation<? super Result<SubmitDataRequestResponse>> continuation);
@POST("v1/data_request/third_party/{thirdPartyId}/revoke")
Object m17553postRevokegIAlus(@Path("thirdPartyId") String str, Continuation<? super Result<Unit>> continuation);
```

**E51 — MediaApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/video/clip/media/MediaApi.java`
```java
@DELETE("v4/accounts/%7Binjected_account_id%7D/media/{mediaId}/delete")
Object m17899deleteCloudMediagIAlus(@Path("mediaId") long j, Continuation<? super Result<Unit>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/request/{clipId}")
Object m17900getClipKommandyxL6bBk(@Path("networkId") long j, @Path("syncModuleId") long j2, @Path("clipId") long j3, @Path("manifestId") long j4, Continuation<? super Result<? extends Kommand>> continuation);
@DELETE("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage")
Object m17901getDeleteAllKommand0E7RQCE(@Path("networkId") long j, @Path("syncModuleId") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/delete/{clipId}")
Object m17902getDeleteLocalStorageMediaKommandyxL6bBk(@Path("networkId") long j, @Path("syncModuleId") long j2, @Path("clipId") long j3, @Path("manifestId") long j4, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/request")
Object m17903getLocalStorageManifestKommand0E7RQCE(@Path("networkId") long j, @Path("syncModuleId") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@GET("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/media/{commandId}")
Object m17904getLocalStorageMediaBWLJW6A(@Path("networkId") long j, @Path("syncModuleId") long j2, @Path("commandId") long j3, Continuation<? super Result<MediaResponse>> continuation);
@GET("v4/accounts/%7Binjected_account_id%7D/media_settings")
Object m17905getMediaSettingsIoAF18A(Continuation<? super Result<MediaSettingsResponse>> continuation);
@GET("v4/accounts/%7Binjected_account_id%7D/unwatched_media")
Object m17906getUnwatchedMediaIoAF18A(Continuation<? super Result<UnwatchedMediaResponse>> continuation);
@PATCH("v4/accounts/%7Binjected_account_id%7D/media_settings")
Object m17907patchMediaSettingsgIAlus(@Body MediaSettingsPatch mediaSettingsPatch, Continuation<? super Result<Unit>> continuation);
@POST("v4/accounts/%7Binjected_account_id%7D/media/delete")
Object m17908postDeleteMediagIAlus(@Body MediaListBody mediaListBody, Continuation<? super Result<Unit>> continuation);
@POST("v4/accounts/%7Binjected_account_id%7D/media/mark_all_as_viewed")
Object m17909postMarkAllAsViewedIoAF18A(Continuation<? super Result<Unit>> continuation);
@POST("v4/accounts/%7Binjected_account_id%7D/media/mark_as_viewed")
Object m17910postMarkAsViewedgIAlus(@Body MediaListBody mediaListBody, Continuation<? super Result<Unit>> continuation);
@POST("v4/accounts/%7Binjected_account_id%7D/media")
Object m17911postMediayxL6bBk(@Query("start_time") String str, @Query("end_time") String str2, @Query("pagination_key") Long l, @Body MediaPostBody mediaPostBody, Continuation<? super Result<MediaResponse>> continuation);
```

**E52 — NetworkApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/device/network/NetworkApi.java`
```java
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/state/{type}")
Observable<Command> armDisarmNetwork(@Path("networkId") long networkId, @Path("type") String type);
@POST("/accounts/%7Binjected_account_id%7D/networks/add")
Object m16506createSystemgIAlus(@Body AddNetworkBody addNetworkBody, Continuation<? super Result<? extends ANetwork>> continuation);
@POST("/accounts/%7Binjected_account_id%7D/networks/{network}/delete")
Observable<BlinkData> deleteSystem(@Path(ProcessNotification.KEY_NETWORK) long network);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/state/disarm")
Object m16507disarmNetworkgIAlus(@Path("network_id") long j, Continuation<? super Result<? extends Kommand>> continuation);
@POST("/accounts/%7Binjected_account_id%7D/system_offline/{network}")
Observable<BlinkData> sendSystemOfflineHelpEmail(@Path(ProcessNotification.KEY_NETWORK) long network);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/snooze")
Object m16508snoozeSystem0E7RQCE(@Path("network_id") long j, @Body SnoozeBody snoozeBody, Continuation<? super Result<Unit>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/unsnooze")
Object m16509unSnoozeSystemgIAlus(@Path("network_id") long j, Continuation<? super Result<Unit>> continuation);
@POST("/accounts/%7Binjected_account_id%7D/networks/{network}/update")
Observable<BlinkData> updateNetworkSaveAllLiveViews(@Body UpdateNetworkSaveAllLiveViews updateNetworkSaveAllLiveViews, @Path(ProcessNotification.KEY_NETWORK) long network);
@POST("/accounts/%7Binjected_account_id%7D/networks/{network}/update")
Observable<BlinkData> updateSystem(@Body UpdateSystemNameBody updateSystemNameBody, @Path(ProcessNotification.KEY_NETWORK) long network);
@POST("/accounts/%7Binjected_account_id%7D/networks/{network}/update")
Observable<BlinkData> updateTimezone(@Body UpdateTimezoneBody updateTimezoneBody, @Path(ProcessNotification.KEY_NETWORK) long network);
```

**E53 — NotificationApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/notification/NotificationApi.java`
```java
@POST("v2/notification")
Observable<Object> acknowledgeNotification(@Body AcknowledgeNotificationBody body);
```

**E54 — OauthApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/account/auth/OauthApi.java`
```java
@FormUrlEncoded
@POST("oauth/token")
Object m16059postLogineH_QyT8(@Field(HintConstants.AUTOFILL_HINT_USERNAME) String str, @Field("password") String str2, @Header("2fa-code") String str3, @Header("hardware_id") String str4, @Field("grant_type") String str5, @Field("client_id") String str6, @Field("scope") String str7, Continuation<? super Result<RefreshTokensResponse>> continuation);
@FormUrlEncoded
@POST("oauth/token")
Call<RefreshTokensResponse> postRefreshTokens(@Field(GrantTypeValues.REFRESH_TOKEN) String refreshToken, @Field("grant_type") String grantType, @Field("client_id") String clientId, @Field("scope") String scope);
```

**E55 — OwlApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/device/camera/wired/OwlApi.java`
```java
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/accessories/rosie/owl/{owl_id}/calibrate")
Object m16181calibrateRosie0E7RQCE(@Path("network_id") long j, @Path("owl_id") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/change_wifi")
Object m16182changeOwlWifiBWLJW6A(@Body OnboardingBody onboardingBody, @Path("networkId") long j, @Path("owlId") long j2, Continuation<? super Result<? extends OwlAddBody>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/delete")
Object m16183deleteOwl0E7RQCE(@Path("networkId") long j, @Path("owlId") long j2, Continuation<? super Result<Unit>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/delete")
Observable<BlinkData> deleteOwlRx(@Path("networkId") long network, @Path("owlId") long owlId);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/owls/{owl_id}/accessories/rosie/{rosie_id}/delete")
Object m16184deleteRosieBWLJW6A(@Path("network_id") long j, @Path("owl_id") long j2, @Path("rosie_id") long j3, Continuation<? super Result<Unit>> continuation);
@GET("v1/accounts/%7Binjected_account_id%7D/owls/{serial}/fw_update")
Observable<retrofit2.adapter.rxjava.Result<ResponseBody>> downloadOwlFirmwareUpdate(@Path("serial") String serial);
@GET("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/config")
Object m16185getOwlConfig0E7RQCE(@Path("networkId") long j, @Path("owlId") long j2, Continuation<? super Result<OwlConfigInfo>> continuation);
@GET("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/config")
Observable<OwlConfigInfo> getOwlConfigRx(@Path("networkId") long networkId, @Path("owlId") long owlId);
@GET("v2/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/zones")
Object m16186getZonesV20E7RQCE(@Path("networkId") long j, @Path("owlId") long j2, Continuation<? super Result<ZoneV2Response>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/owls/add")
Object m16187postAddOwl0E7RQCE(@Body AddOwlPostBody addOwlPostBody, @Path(ProcessNotification.KEY_NETWORK) long j, Continuation<? super Result<AddOwlResponse>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/change_wifi")
Object m16188postChangeOwlWifiBWLJW6A(@Body AddOwlPostBody addOwlPostBody, @Path("networkId") long j, @Path("owlId") long j2, Continuation<? super Result<AddOwlResponse>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{camera}/lights/{lightControl}")
Object m16189postLightBWLJW6A(@Path("networkId") long j, @Path(ProcessNotification.KEY_CAMERA) long j2, @Path("lightControl") LightControl lightControl, Continuation<? super Result<CameraActionKommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{camera}/lights/{lightControl}")
Object m16190postLightOldBWLJW6A(@Path("networkId") long j, @Path(ProcessNotification.KEY_CAMERA) long j2, @Path("lightControl") LightControl lightControl, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v2/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/liveview")
Object m16191postLiveViewCommandBWLJW6A(@Path("networkId") long j, @Path("owlId") long j2, @Body LiveViewCommandPostBody liveViewCommandPostBody, Continuation<? super Result<LiveViewCommandResponse>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/config")
Object m16192postOwlConfigBWLJW6A(@Body UpdateOwlBody updateOwlBody, @Path("networkId") long j, @Path("owlId") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/config")
Object m16193postOwlConfigCommandBWLJW6A(@Body UpdateOwlBody updateOwlBody, @Path("networkId") long j, @Path("owlId") long j2, Continuation<? super Result<CameraActionKommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/config")
Observable<Command> postOwlSettingsOld(@Body UpdateOwlBody updateOwlBody, @Path("networkId") long networkId, @Path("owlId") long owlId);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/status")
Object m16194postOwlStatusCommand0E7RQCE(@Path("networkId") long j, @Path("owlId") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/thumbnail")
Object m16195postThumbnail0E7RQCE(@Path("networkId") long j, @Path("owlId") long j2, Continuation<? super Result<CameraActionKommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/thumbnail")
Observable<Command> postThumbnailOld(@Path("networkId") long networkId, @Path("owlId") long owlId);
@POST("v2/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/zones")
Object m16196setZonesV2BWLJW6A(@Body ZoneV2Response zoneV2Response, @Path("networkId") long j, @Path("owlId") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/owls/{owl_id}/snooze")
Object m16197snoozeOwlBWLJW6A(@Path("network_id") long j, @Path("owl_id") long j2, @Body SnoozeBody snoozeBody, Continuation<? super Result<Unit>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/owls/add")
Object m16198startOwlOnboardingOld0E7RQCE(@Body OnboardingBody onboardingBody, @Path(ProcessNotification.KEY_NETWORK) long j, Continuation<? super Result<? extends OwlAddBody>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/owls/{owl_id}/unsnooze")
Object m16199unSnoozeOwl0E7RQCE(@Path("network_id") long j, @Path("owl_id") long j2, Continuation<? super Result<Unit>> continuation);
```

**E56 — PasswordChangeApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/settings/password/PasswordChangeApi.java`
```java
@POST("v4/clients/%7Binjected_client_id%7D/password_change")
Object m17642changePasswordgIAlus(@Body ResetPasswordPostBody resetPasswordPostBody, Continuation<? super Result<Unit>> continuation);
@POST("v4/clients/%7Binjected_client_id%7D/password_change")
Object m17643postPasswordChangegIAlus(@Body ResetPasswordPostBody resetPasswordPostBody, Continuation<? super Result<Unit>> continuation);
@POST("v4/clients/%7Binjected_client_id%7D/password_change/pin/generate")
Object m17644postPasswordChangePinGenerateIoAF18A(Continuation<? super Result<GeneratePinResponse>> continuation);
@POST("v4/clients/%7Binjected_client_id%7D/password_change/pin/verify")
Object m17645postPasswordChangePinVerifygIAlus(@Body VerifyPinPostBody verifyPinPostBody, Continuation<? super Result<VerifyPinResponse>> continuation);
```

**E57 — PasswordResetApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/account/password/PasswordResetApi.java`
```java
@POST("v4/users/password_change")
Object m15681postPasswordResetgIAlus(@Body ResetPasswordPostBody resetPasswordPostBody, Continuation<? super Result<Unit>> continuation);
@POST("v4/users/password_change/pin/generate")
Object m15682postPasswordResetPinGenerategIAlus(@Body GeneratePinPostBody generatePinPostBody, Continuation<? super Result<GeneratePinResponse>> continuation);
@POST("v4/users/password_change/pin/verify")
Object m15683postPasswordResetPinVerifygIAlus(@Body VerifyPinPostBody verifyPinPostBody, Continuation<? super Result<VerifyPinResponse>> continuation);
```

**E58 — PhoneNumberChangeApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/account/phone/PhoneNumberChangeApi.java`
```java
@POST("v5/clients/%7Binjected_client_id%7D/phone_number_change")
Object m16076changePhoneNumbergIAlus(@Body ChangePhoneNumberBody changePhoneNumberBody, Continuation<? super Result<ChangePhoneNumberResponse>> continuation);
@POST("v5/clients/%7Binjected_client_id%7D/phone_number_change")
Object m16077postPhoneNumberChangegIAlus(@Body AddPhoneNumberPostBody addPhoneNumberPostBody, Continuation<? super Result<ChangePhoneNumberResponse>> continuation);
@POST("v5/clients/%7Binjected_client_id%7D/phone_number_change/pin/verify")
Object m16078postPhoneNumberChangePinVerifygIAlus(@Body SubmitVerificationRequest submitVerificationRequest, Continuation<? super Result<PinVerificationResponse>> continuation);
```

**E59 — ProgramApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/device/network/program/ProgramApi.java`
```java
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/programs/create")
Observable<BlinkData> createProgram(@Body Program program, @Path(ProcessNotification.KEY_NETWORK) long network);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/programs/{program}/delete")
Observable<BlinkData> deleteProgram(@Path(ProcessNotification.KEY_NETWORK) long network, @Path("program") long program);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/programs/{program}/disable")
Observable<BlinkData> disableProgram(@Path(ProcessNotification.KEY_NETWORK) long network, @Path("program") long program);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/programs/{program}/enable")
Observable<BlinkData> enableProgram(@Path(ProcessNotification.KEY_NETWORK) long network, @Path("program") long program);
@GET("v1/accounts/%7Binjected_account_id%7D/networks/{network}/programs")
Observable<List<Program>> getPrograms(@Path(ProcessNotification.KEY_NETWORK) long network);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{network}/programs/{program}/update")
Observable<BlinkData> updateProgram(@Body UpdateProgramRequest updateProgramRequest, @Path(ProcessNotification.KEY_NETWORK) long network, @Path("program") long program);
```

**E60 — PublicApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/network/PublicApi.java`
```java
@GET("v1/version")
Object m16213getAppVersionCheckIoAF18A(Continuation<? super Result<AppVersionCheckResponse>> continuation);
@GET("v1/countries")
Object m16214getCountriesIoAF18A(Continuation<? super Result<CountriesResponse>> continuation);
@GET("//apphelp.immedia-semi.com/link-manifest.json")
Object m16215getLinkManifestIoAF18A(Continuation<? super Result<LinkManifest>> continuation);
@GET("/regions")
Object m16216getRegionsIoAF18A(Continuation<? super Result<RegionsResponse>> continuation);
```

**E61 — ReadSubscriptionApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/subscription/ReadSubscriptionApi.java`
```java
@GET("v1/accounts/%7Binjected_account_id%7D/access")
Object m16219getAccessIoAF18A(Continuation<? super Result<AccessResponse>> continuation);
@GET("v2/accounts/%7Binjected_account_id%7D/subscriptions/entitlements")
Object m16220getEntitlementsIoAF18A(Continuation<? super Result<EntitlementResponse>> continuation);
@GET("v3/accounts/%7Binjected_account_id%7D/subscriptions/plans")
Object m16221getSubscriptionsIoAF18A(Continuation<? super Result<SubscriptionPlansResponse>> continuation);
@GET("v2/accounts/%7Binjected_account_id%7D/subscriptions/plans")
Object m16222getSubscriptionsOldIoAF18A(Continuation<? super Result<SubscriptionPlansResponse>> continuation);
```

**E63 — SmartVideoDescriptionsApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/settings/SmartVideoDescriptionsApi.java`
```java
@GET("v1/accounts/%7Binjected_account_id%7D/smart_video_descriptions")
Object m17330getSmartVideoDescriptionsIoAF18A(Continuation<? super Result<SmartVideoDescriptionsResponse>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/smart_video_descriptions")
Object m17331postUpdateSmartVideoDescriptionsgIAlus(@Body SmartVideoDescriptionsPostBody smartVideoDescriptionsPostBody, Continuation<? super Result<Unit>> continuation);
```

**E64 — SyncModuleApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/device/sync/SyncModuleApi.java`
```java
@POST("/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/delete")
Object m17015deleteSyncModule0E7RQCE(@Path("networkId") long j, @Path("syncModuleId") long j2, Continuation<? super Result<Unit>> continuation);
@POST("/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/delete")
Observable<BlinkData> deleteSyncModuleRx(@Path("networkId") long network, @Path("syncModuleId") String number);
@GET("v1/accounts/%7Binjected_account_id%7D/sync_modules/{serial}/fw_update")
Observable<retrofit2.adapter.rxjava.Result<ResponseBody>> downloadFirmwareUpdate(@Path("serial") String serial);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/eject")
Object m17016ejectUsbStorage0E7RQCE(@Path("networkId") long j, @Path("syncModuleId") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/eject")
Single<Command> ejectUsbStorageOld(@Path("networkId") long network, @Path("syncModuleId") long syncModuleId);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/format")
Object m17017formatUsbStorage0E7RQCE(@Path("networkId") long j, @Path("syncModuleId") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/format")
Single<Command> formatUsbStorageOld(@Path("networkId") long network, @Path("syncModuleId") long syncModuleId);
@GET("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/status")
Object m17018getLocalStorageStatus0E7RQCE(@Path("networkId") long j, @Path("syncModuleId") long j2, Continuation<? super Result<LocalStorageStatusResponse>> continuation);
@GET("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/status")
Single<LocalStorageStatusResponse> getLocalStorageStatusOld(@Path("networkId") long network, @Path("syncModuleId") long syncModuleId);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/mount")
Object m17019mountUsb0E7RQCE(@Path("networkId") long j, @Path("syncModuleId") long j2, Continuation<? super Result<? extends Kommand>> continuation);
@POST("v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/mount")
Single<Command> mountUsbOld(@Path("networkId") long network, @Path("syncModuleId") long syncModuleId);
@POST("v2/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{type}")
Object m17020startSyncModuleOnboardingBWLJW6A(@Body OnboardingBody onboardingBody, @Path("networkId") long j, @Path("type") String str, Continuation<? super Result<? extends Command>> continuation);
```

**E65 — SyncModuleService endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/api/retrofit/SyncModuleService.java`
```java
@GET(GET_FW_VERSION)
Observable<GetFirmwareEndpointResponse> getFirmwareVersion();
@GET("api/logs")
Observable<ResponseBody> getLogs();
@GET("api/ssids")
Observable<AccessPoints> getSsids();
@GET(VERSION)
Observable<BlinkData> getVersion();
@POST("/api/set/app_fw_update")
Observable<BlinkData> setFirmwareUpdate(@Header("Content-Type") String contentType, @Header("X-Blink-FW-Signature") String fwSignature, @Header("Content-Length") long contentLength, @Body RequestBody bytes);
@POST(KEY)
Observable<Void> setKey(@Body RequestBody smEncryptionData);
@POST("/api/set/ssid")
Observable<BlinkData> setSSid(@HeaderMap Map<String, String> headers, @Body SetSSIDBody ssidBody);
```

**E66 — VideoApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/video/VideoApi.java`
```java
@GET
Object m17790getVideogIAlus(@Url String str, Continuation<? super Result<? extends ResponseBody>> continuation);
```

**E67 — Live view polling default interval (1s)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/device/camera/video/live/LiveViewKommandPolling.java`
```java
public static final long DEFAULT_LIVE_VIEW_POLLING_INTERVAL_IN_SECONDS = 1;
...
if ((i & 32) != 0) {
    Duration durationM5724of = Duration.m5724of(1L, ChronoUnit.SECONDS);
    duration2 = durationM5724of;
}
```

**E68 — Live view polling delay waits for interval changes (with timeout)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/device/camera/video/live/LiveViewKommandPolling.java`
```java
@Override
public Object delayBetweenPolls(Continuation<? super Unit> continuation) {
    return TimeoutKt.withTimeoutOrNull(getPollingInterval().toMillis(), new C78642(null), continuation);
}
...
if (LiveViewKommandPolling.this.pollingIntervalChanged.receive(this) == coroutine_suspended) {
    return coroutine_suspended;
}
```

**E69 — Command polling delay + error retry handling**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/device/network/command/AbstractKommandPolling.java`
```java
if (Result.m19017isFailureimpl(value)) {
    intRef.element++;
    Integer num = this.$maxErrorRetries;
    if (num != null) { if (intRef.element < num.intValue()) i2 = 1; }
    if (i2 != 0) { this.this$0.delayBetweenPolls(this); }
    else { error = new PollingResult.Error(thM19014exceptionOrNullimpl); }
}
```
```java
static <T extends SupervisorKommand> Object delayBetweenPolls$suspendImpl(AbstractKommandPolling<T> abstractKommandPolling, Continuation<? super Unit> continuation) {
    Object objDelay = DelayKt.delay(abstractKommandPolling.getPollingInterval().toMillis(), continuation);
    return objDelay == IntrinsicsKt.getCOROUTINE_SUSPENDED() ? objDelay : Unit.INSTANCE;
}
```

**E70 — WifiApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/device/wifi/WifiApi.java`
```java
@GET("api/get_fw_version")
Object m17034getFwVersionIoAF18A(Continuation<? super Result<GetFwVersionResponse>> continuation);
@POST("api/set/key")
Object m17035sendEncryptionKeygIAlus(@Body RequestBody requestBody, Continuation<? super Result<Unit>> continuation);
```

**E71 — WifiSecureApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/device/wifi/WifiSecureApi.java`
```java
@GET("api/ssids")
Object m17042getSsidsIoAF18A(Continuation<? super Result<AccessPoints>> continuation);
@POST("api/set/ssid")
Object m17043setSsid0E7RQCE(@HeaderMap Map<String, String> map, @Body SetSSIDBody setSSIDBody, Continuation<? super Result<Unit>> continuation);
```

**E72 — WriteSubscriptionApi endpoints**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/subscription/WriteSubscriptionApi.java`
```java
@POST("v1/subscriptions/plans/{subscriptionId}/attach")
Object m16239attachPlan0E7RQCE(@Path("subscriptionId") long j, @Body AttachPlanBody attachPlanBody, Continuation<? super Result<DspSubscriptionResponse>> continuation);
@DELETE("v1/subscriptions/plans/cancel_trial")
Object m16240cancelTrialIoAF18A(Continuation<? super Result<Unit>> continuation);
@POST("v2/subscriptions/plans/create_trial")
Object m16241createTrialgIAlus(@Body AdditionalTrialBody additionalTrialBody, Continuation<? super Result<Unit>> continuation);
@GET("v1/subscriptions/plans/get_device_attach_eligibility")
Object m16242getDeviceEligibilityIoAF18A(Continuation<? super Result<DeviceEligibilityResponse>> continuation);
@POST("v1/subscriptions/link/link_account")
Object m16243linkAmazonAccountgIAlus(@Body MapLinkBody mapLinkBody, Continuation<? super Result<DspSubscriptionResponse>> continuation);
@POST("v1/subscriptions/clear_popup/{type}")
Object m16244postClearTrialPopupgIAlus(@Path("type") String str, Continuation<? super Result<Unit>> continuation);
@POST("v1/subscriptions/plans/renew_trial")
Object m16245renewTrialIoAF18A(Continuation<? super Result<Unit>> continuation);
@POST("v1/subscriptions/request/status/{uuid}")
Object m16246subscriptionRequestStatus0E7RQCE(@Body SubscriptionRequestStatusBody subscriptionRequestStatusBody, @Path(UserBox.TYPE) String str, Continuation<? super Result<SubscriptionRequestStatusResponse>> continuation);
@POST("v1/subscriptions/link/unlink_account")
Object m16247unlinkAmazonAccountgIAlus(@Body VerifyLinkAccountBody verifyLinkAccountBody, Continuation<? super Result<DspSubscriptionResponse>> continuation);
```

**E73 — BuildConfig defaults (tier + OAuth env)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/BuildConfig.java`
```java
public static final String DEFAULT_TIER = "prod";
public static final String OAUTH_ENV = "production";
```

**E74 — Production tier codes ↔ AWS regions (prod/prde/prsg/a001/cemp/srf1)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/core/network/tier/ProductionTier.java`
```java
public static final ProductionTier CEMP = new ProductionTier(... "cemp", ... AwsRegion.US_EAST_1, ...);
public static final ProductionTier PROD = new ProductionTier(... "prod", ... AwsRegion.US_EAST_1, ...);
public static final ProductionTier PROD_EU = new ProductionTier(... "prde", ... AwsRegion.EU_CENTRAL_1, ...);
public static final ProductionTier PROD_AP = new ProductionTier(... "prsg", ... AwsRegion.AP_SOUTHEAST_1, ...);
public static final ProductionTier PROD_AU = new ProductionTier(... "a001", ... AwsRegion.AP_SOUTHEAST_2, ...);
public static final ProductionTier SRF1 = new ProductionTier(... "srf1", ... AwsRegion.US_EAST_1, ...);
```

**E75 — AWS region string values**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/core/network/AwsRegion.java`
```java
public static final AwsRegion US_EAST_1 = new AwsRegion("US_EAST_1", 0, "us-east-1", "Virginia");
public static final AwsRegion EU_CENTRAL_1 = new AwsRegion("EU_CENTRAL_1", 3, "eu-central-1", "Germany");
public static final AwsRegion AP_SOUTHEAST_1 = new AwsRegion("AP_SOUTHEAST_1", 4, "ap-southeast-1", "Singapore");
public static final AwsRegion AP_SOUTHEAST_2 = new AwsRegion("AP_SOUTHEAST_2", 5, "ap-southeast-2", "Australia");
```

**E76 — TierRepository default tier key + fallback to "prod"**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/network/tier/TierRepository.java`
```java
private static final String DEFAULT_TIER_KEY = "DEFAULT_TIER";
...
final String str = DEFAULT_TIER_KEY;
```
```java
String str = (String) obj;
if (str == null) {
    str = "prod";
}
```

**E77 — TierRepository fallback order (tier → default; shared tier → tier)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/network/tier/TierRepository.java`
```java
obj = FlowKt.firstOrNull(TierRepository.this.getTierStream(), this);
...
if (str != null) { return str; }
obj = FlowKt.first(TierRepository.this.getDefaultTierStream(), this);
```
```java
obj = FlowKt.firstOrNull(TierRepository.this.getSharedTierStream(), this);
...
if (str != null) { return str; }
obj = TierRepository.this.getTier(this);
```

**E78 — OAuth env lookup + subdomain fallback**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/network/tier/TierRepository.java`
```java
OauthEnvironment oauthEnvironment = OauthEnvironment.INSTANCE.get((String) obj);
```
```java
String subdomain = ((OauthEnvironment) obj).getSubdomain();
return subdomain == null ? "" : subdomain;
```
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/core/network/OauthEnvironment.java`
```java
return oauthEnvironment == null ? OauthEnvironment.PRODUCTION : oauthEnvironment;
```

**E79 — Region model + mode values (tier is `dns`)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/country/Region.java`
```java
@SerialName("dns")
public static void getTier$annotations() { }
private final String tier;
```
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/country/RegionsResponse.java`
```java
private final String preferred;
private final String mode;
private final Map<String, Region> regions;
```
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/country/RegionSelectionMode.java`
```java
public static final RegionSelectionMode AUTO = new RegionSelectionMode("AUTO", 0, "auto");
public static final RegionSelectionMode MANUAL = new RegionSelectionMode("MANUAL", 1, "manual");
```

**E80 — Registration region selection logic (preferred/order + auto‑select)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/account/registration/RegistrationViewModel.java`
```java
RegionsResponse regionsResponse = (RegionsResponse) value;
List<Region> list = CollectionsKt.toList(regionsResponse.getRegions().values());
Region region2 = regionsResponse.getRegions().get(regionsResponse.getPreferred());
if (region2 == null) { for (Region region3 : list) { if (region3.getOrder() == 1) { region = region3; } } }
...
if (RegionSelectionMode.INSTANCE.get(regionsResponse.getMode()) != RegionSelectionMode.AUTO
    && regionsResponse.getRegions().size() != 1) { z = false; }
```

**E81 — Registration confirms tier from selected region**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/account/registration/RegistrationViewModel.java`
```java
TierRepository tierRepository = RegistrationViewModel.this.tierRepository;
Region selectedRegion2 = ((RegistrationUiState) RegistrationViewModel.this._uiState.getValue()).getSelectedRegion();
Intrinsics.checkNotNull(selectedRegion2);
if (tierRepository.setTier(selectedRegion2.getTier(), this) == coroutine_suspended) { return coroutine_suspended; }
```

**E82 — Login flow fetches tier_info and passes to TierRepository**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/account/auth/LoginViewModel.java`
```java
objM16043getTierInfoIoAF18A = accountApi.m16043getTierInfoIoAF18A(loginViewModel$authenticate$12);
...
TierInfo tierInfo = (TierInfo) objM19011constructorimpl2;
TierRepository tierRepository = this.tierRepository;
if (tierRepository.setTierInfo(tierInfo, loginViewModel$authenticate$12) != coroutine_suspended) { ... }
```

**E83 — TierInfo persistence writes account_id only**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/network/tier/TierRepository.java`
```java
if (TierRepository.this.accountPreferences.put(AccountKeys.ACCOUNT_ID_KEY,
    Boxing.boxLong(this.$tierInfo.getAccountId()), this) != coroutine_suspended) { ... }
```

**E84 — AccountRepository persists account tier**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/account/AccountRepository.java`
```java
if (AccountRepository.this.getAccountPreferences().put(TierRepository.TIER_KEY,
    this.$account.getTier(), this) != coroutine_suspended) { ... }
```

**E85 — Shared account persistence writes shared_account_id only**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/account/AccountRepository.java`
```java
if (AccountRepository.this.getAccountPreferences().putNullable(
    AccountKeys.SHARED_ACCOUNT_ID_KEY, this.$sharedAccountId, this) != coroutine_suspended) { ... }
```

**E86 — Account model includes tier field**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/account/Account.java`
```java
@SerializedName("ring_user_id")
private final long ringUserId;
private final String tier;
...
public final String getTier() { return this.tier; }
```

**E87 — Account info fetch persists account (tier source)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/common/account/GetAccountInfoUseCase$invoke$2.java`
```java
objM16039getAccountInfoIoAF18A = this.this$0.accountApi.m16039getAccountInfoIoAF18A(this);
...
if (Result.m19018isSuccessimpl(obj2)) {
    Account account4 = (Account) obj2;
    AccountRepository accountRepository = getAccountInfoUseCase.accountRepository;
    if (accountRepository.setAccount(account4, this) != coroutine_suspended) { ... }
}
```

**E88 — Live view response → WalnutLiveInfo (server + liveview_token)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/video/live/sessionmanager/WalnutSignalling.java`
```java
String server = liveViewCommandResponse3.getServer();
LiveVideoResponse liveVideoResponse = new LiveVideoResponse(commandId, jLongValue2, server, ...);
...
String liveViewToken = liveViewCommandResponse3.getLiveViewToken();
WalnutLiveInfo walnutLiveInfo2 = new WalnutLiveInfo(liveVideoResponse, liveViewToken, str5, z2, ...);
...
walnutLiveViewSessionManager.startLive(walnutLiveInfo2, walnutLiveInfo);
```

**E89 — Live stream player uses server URI + auth token + device serial**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/video/live/sessionmanager/BlinkWalnutLiveViewSessionManager.java`
```java
player.setURI(new URI(primary.getLiveViewResponse().server));
...
String authToken2 = primary.getAuthToken();
if (authToken2 != null) { player.setAuthToken(authToken2); }
...
String deviceSerial2 = primary.getDeviceSerial();
if (deviceSerial2 != null) { player.setDeviceSerial(deviceSerial2); }
```

**E90 — Local onboarding encryption (AES-CBC + HMAC; secure endpoints only)**
- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/utils/onboarding/EncryptionInterceptor.java`
```java
if (SMEncryptionData.getInstance().encryptData && request.method().equals("POST")
    && isSecureRequest(request.url().getUrl())) { ... calculateHmac(...); ... }
...
if (!SMEncryptionData.getInstance().decryptData && isSecureRequest(request.url().getUrl())) {
    if (verifyHmac(...)) { strDecrypt = decrypt(...); }
}
private static boolean isSecureRequest(String request) {
    return (request.contains(SyncModuleService.KEY)
        || request.contains(SyncModuleService.GET_FW_VERSION)
        || request.contains(SyncModuleService.VERSION)) ? false : true;
}
```

**E91 — EventStream client config (subgroup + batch + flush)**

- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/core/event/ESConfig.java`

```java
public static final String EVENT_STREAM_SUBGROUP = "blink.mobile.app";
private static final long FLUSH_DELAY = 300;
private static final int BATCH_SIZE = 25;
public final ESClientConfig getClient() {
  return new ESClientConfig(EVENT_STREAM_SUBGROUP, 300L, 25);
}
```

**E92 — EventStream core metadata (device/app identity + platform + locale)**

- File: `/Users/andrew/zzApps/blink-home-monitor/jadx-out/app/src/main/java/com/immediasemi/blink/core/event/ESConfig.java`

```java
MetaData metaData = new MetaData(MANUFACTURER, MODEL, uuid,
  BuildUtils.INSTANCE.getUserAgent(), BuildConfig.VERSION_NAME,
  BuildConfig.VERSION_CODE, "release", APP_NAME);
Platform platform = BuildUtils.isAmazonDevice() ? Platform.FIRE_OS : Platform.ANDROID;
String string = Locale.getDefault().toString();
return new ESCoreConfig(metaData, platform, string);
```

## Candidate Domains & Hosts (evidence-backed)

| Host / Base | Purpose | Evidence |
|---|---|---|
| `https://rest-{tier}.immedia-semi.com/api/` | Primary REST base (tiered) | E1, E2, E3, E4 |
| `https://rest-{shared_tier}.immedia-semi.com/api/` | Shared REST base (tiered) | E1, E2, E3 |
| `https://api.{env}oauth.blink.com/` | OAuth base (env subdomain token) | E1, E2, E3, E4, E8, E9 |
| `https://prod.eventstream.immedia-semi.com/` | EventStream client base (ring eventstream lib) | E1, E24 |
| `https://dev.eventstream.immedia-semi.com/` | EventStream base (dev) | E1 |
| `http://172.16.97.199/` | Local device onboarding host | E1, E13 |

## Base URL Composition / Token Replacement
- `{tier}` and `{shared_tier}` are replaced in OkHttp interceptors before request execution. (E3, E4)
- `{env}` is replaced using `TierRepository.getEnvSubdomain()` → `OauthEnvironment.getSubdomain()`; production has empty subdomain. (E4, E8, E9)
- Blink host detection is `immedia-semi.com` or any `*.immedia-semi.com`. (E3)
- `TierRepository.getTier()` reads `TIER` from account prefs, falls back to `DEFAULT_TIER` (persistent client prefs), and if null uses `"prod"`. (E76, E77, E73)
- OAuth environment uses `OAUTH_ENV` in persistent client prefs; unknown values fall back to PRODUCTION, whose subdomain is empty. (E78, E8)

## Region / Tier Selection (evidence-backed, partial)
- Regions are fetched via `GET /regions` (PublicApi) and returned as `RegionsResponse` with `preferred`, `mode`, and a `regions` map. (E60, E79)
- Each `Region` includes a `dns` field that is stored as `tier` and used for routing. (E79)
- Registration: preferred region is selected (or `display_order == 1` if preferred missing), auto-select is true when mode is `auto` or only one region exists. (E80)
- Registration confirmation persists the selected tier via `TierRepository.setTier(selectedRegion.tier)`. (E81)
- Shared tier is read from `SHARED_TIER` and falls back to `tier` when unset; a setter for `SHARED_TIER` was not found in decompiled sources. (E77)
- Shared REST base uses `{shared_tier}` which is replaced by `TierRepository.getSharedTier()` at request time. (E4, E77)
- Login flow fetches `tier_info` and calls `setTierInfo`, which persists `account_id`; tier persistence happens via `AccountRepository.setAccount()` after `AccountApi.getAccountInfo` and uses `Account.tier` (Account model includes a `tier` field). (E82, E83, E84, E86, E87)
- Shared account persistence only writes `shared_account_id`; no shared tier persistence was observed in the decompiled shared-account path. (E85)
- Production tier codes map to AWS regions: `prod`→us-east-1, `prde`→eu-central-1, `prsg`→ap-southeast-1, `a001`→ap-southeast-2, `cemp`→us-east-1, `srf1`→us-east-1. Regression tier `sqa1` is US-East-1 + STAGING env. (E74, E75, E9)

### Region routing matrix (from APK constants)
| Tier code | AWS region | Notes | Evidence |
|---|---|---|---|
| `prod` | `us-east-1` | Production default | E74, E75 |
| `prde` | `eu-central-1` | EU region default | E74, E75 |
| `prsg` | `ap-southeast-1` | AP region default | E74, E75 |
| `a001` | `ap-southeast-2` | AU region default | E74, E75 |
| `cemp` | `us-east-1` | Production regression testing | E74, E75 |
| `srf1` | `us-east-1` | Device refurbishment | E74, E75 |
| `sqa1` | `us-east-1` | Staging (regression_sqa1) | E9, E75 |

## Authentication (initial evidence only)
- OAuth endpoint: `POST oauth/token` with fields `username`, `password`, `grant_type`, `client_id`, `scope` and headers `2fa-code`, `hardware_id`. (E10)
- Refresh endpoint: `POST oauth/token` with `refresh_token`, `grant_type`, `client_id`, `scope`. (E10, E16)
- Default headers injected into all requests: `APP-BUILD`, `User-Agent`, `LOCALE`, `X-Blink-Time-Zone`. (E5, E6, E7)
- Authenticated client adds `Authorization: Bearer <access_token>` and `TOKEN-AUTH: <token>` for Blink hosts. (E14)
- Authenticator refreshes tokens on Blink hosts when there is no priorResponse; uses `RefreshTokensUseCase` (OAuth refresh) and rebuilds request with updated `Authorization` header. (E15, E16)
- BuildConfig defaults include `DEFAULT_TIER = "prod"` and `OAUTH_ENV = "production"`; initialization path for writing these into prefs is not yet located. (E73)

## Retrofit Binding Map (auth + base host)
- **Shared authenticated REST (`rest-{shared_tier}`)**: HomeScreenApi, CommandApi, DeviceApi, CameraApi, DoorbellApi, OwlApi, NetworkApi, SyncModuleApi, ProgramApi, AccessoryApi, FeatureFlagApi, MediaApi, SmartVideoDescriptionsApi, ReadSubscriptionApi. (E29)
- **Authenticated REST (`rest-{tier}`)**: AccountApi, ClientApi, ClientDeviceManagementApi, CustomerSupportAccessApi, WriteSubscriptionApi, PasswordChangeApi, EmailChangeApi, PhoneNumberChangeApi, EventApi, LogApi, NotificationApi, AccessApi, AlexaLinkingApi, ManageDataApi. (E30)
- **Unauthenticated REST (`rest-{tier}`)**: AuthApi, PasswordResetApi, PublicApi (uses UNAUTHENTICATED_RETROFIT). (E31)
- **OAuth (`api.{env}oauth.blink.com`)**: OauthApi (separate client, unauthenticated). (E10, E31)

## Endpoint Catalog (Blink API)

**Header legend:** `default` = `APP-BUILD`, `User-Agent`, `LOCALE`, `X-Blink-Time-Zone` (E5–E7).  
Authenticated REST calls add `Authorization: Bearer <access_token>` and `TOKEN-AUTH` on Blink hosts (E14).

| Method | Base Host | Path | Purpose (method) | Auth | Headers | Body Schema | Response Shape | Evidence |
|---|---|---|---|---|---|---|---|---|
| DELETE | https://rest-{tier}.immedia-semi.com/api/ | `v1/shared/invitations/{invitationId}/decline` | `AccessApi.m16017deleteDeclineInvitegIAlus` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E32 |
| DELETE | https://rest-{tier}.immedia-semi.com/api/ | `v1/shared/authorizations/{authorizationId}/remove` | `AccessApi.m16018deleteRemoveAccessgIAlus` | Bearer + TOKEN-AUTH | default | — | Result<PollingResponse> | E32 |
| DELETE | https://rest-{tier}.immedia-semi.com/api/ | `v1/shared/authorizations/{authorizationId}/revoke` | `AccessApi.m16019deleteRevokeAccessgIAlus` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E32 |
| DELETE | https://rest-{tier}.immedia-semi.com/api/ | `v1/shared/invitations/{invitationId}/revoke` | `AccessApi.m16020deleteRevokeInvitegIAlus` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E32 |
| GET | https://rest-{tier}.immedia-semi.com/api/ | `v1/shared/check_authorization` | `AccessApi.m16021getCheckAuthorizationgIAlus` | Bearer + TOKEN-AUTH | default | — | Result<CheckAuthorizationResponse> | E32 |
| GET | https://rest-{tier}.immedia-semi.com/api/ | `v1/shared/summary` | `AccessApi.m16022getSharedSummaryIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<AccessSummary> | E32 |
| PATCH | https://rest-{tier}.immedia-semi.com/api/ | `v1/shared/authorizations/{authorizationId}` | `AccessApi.m16023patchFriendlyNameBWLJW6A` | Bearer + TOKEN-AUTH | default | FriendlyNamePatchBody | Result<PollingResponse> | E32 |
| PATCH | https://rest-{tier}.immedia-semi.com/api/ | `v1/shared/popovers/{popoverId}/read` | `AccessApi.m16024popoverReadgIAlus` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E32 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/shared/invitations/{invitationId}/accept` | `AccessApi.m16025postAcceptAccess0E7RQCE` | Bearer + TOKEN-AUTH | default | AcceptInvitationBody | Result<PollingResponse> | E32 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/shared/invitations/send` | `AccessApi.m16026postSendInvitegIAlus` | Bearer + TOKEN-AUTH | default | SendInviteBody | Result<Unit> | E32 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/accessories/add` | `AccessoryApi.m16411addAccessory0E7RQCE` | Bearer + TOKEN-AUTH | default | AddAccessoryBody | Result<Kommand> | E33 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/accessories/delete` | `AccessoryApi.m16412delete0E7RQCE` | Bearer + TOKEN-AUTH | default | DeleteAccessoryBody | Result<Kommand> | E33 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/users/authenticate_password` | `AccountApi.m16037authenticatePasswordgIAlus` | Bearer + TOKEN-AUTH | default | AuthenticatePasswordBody | Result<AuthenticatePasswordResponse> | E34 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `/users/delete` | `AccountApi.m16038deleteAccountgIAlus` | Bearer + TOKEN-AUTH | default | DeleteAccountBody | Result<Unit> | E34 |
| GET | https://rest-{tier}.immedia-semi.com/api/ | `v2/users/info` | `AccountApi.m16039getAccountInfoIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<Account> | E34 |
| GET | https://rest-{tier}.immedia-semi.com/api/ | `v1/users/options` | `AccountApi.m16040getAccountOptionsIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<AccountOptionsResponse> | E34 |
| GET | https://rest-{tier}.immedia-semi.com/api/ | `v1/users/preferences` | `AccountApi.m16041getAccountPreferencesIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<AccountPreferencesBody> | E34 |
| GET | https://rest-{tier}.immedia-semi.com/api/ | `v1/notifications/preferences` | `AccountApi.m16042getNotificationPreferencesIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<NotificationPreferencesResponse> | E34 |
| GET | https://rest-{tier}.immedia-semi.com/api/ | `v1/users/tier_info` | `AccountApi.m16043getTierInfoIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<TierInfo> | E34 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v4/clients/%7Binjected_client_id%7D/logout` | `AccountApi.m16044logoutIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E34 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/users/preferences` | `AccountApi.m16045postAccountPreferencesgIAlus` | Bearer + TOKEN-AUTH | default | AccountPreferencesBody | Result<AccountPreferencesBody> | E34 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/notifications/preferences` | `AccountApi.m16046postNotificationPreferencesgIAlus` | Bearer + TOKEN-AUTH | default | NotificationPreferencesResponse | Result<Unit> | E34 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v4/users/pin/resend` | `AccountApi.m16047postRegistrationPinResendIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<GeneratePinResponse> | E34 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v4/users/pin/verify` | `AccountApi.m16048postRegistrationPinVerifygIAlus` | Bearer + TOKEN-AUTH | default | VerifyPinPostBody | Result<VerifyPinResponse> | E34 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/identity/token` | `AccountApi.m16049postTokenUpgradegIAlus` | Bearer + TOKEN-AUTH | default | TokenUpgradePostBody | Result<RefreshTokensResponse> | E34 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/countries/update` | `AccountApi.m16050setAccountCountrygIAlus` | Bearer + TOKEN-AUTH | default | CountryBody | Result<CountryResponse> | E34 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/users/countries/update` | `AccountApi.m16051updateUserCountrygIAlus` | Bearer + TOKEN-AUTH | default | CountryBody | Result<CountryResponse> | E34 |
| DELETE | https://rest-{tier}.immedia-semi.com/api/ | `v1/alexa/link` | `AlexaLinkingApi.m17513deleteLinkIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E35 |
| GET | https://rest-{tier}.immedia-semi.com/api/ | `v1/alexa/link_status` | `AlexaLinkingApi.m17514getLinkStatusIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<AlexaLinkStatus> | E35 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/alexa/authorization` | `AlexaLinkingApi.m17515postAuthorizationgIAlus` | Bearer + TOKEN-AUTH | default | AlexaLinkingAuthorizePostBody | Result<AlexaLinkingAuthorizeResponse> | E35 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/alexa/link` | `AlexaLinkingApi.m17516postLinkgIAlus` | Bearer + TOKEN-AUTH | default | AlexaLinkingLinkPostBody | Result<Unit> | E35 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v7/users/register` | `AuthApi.m16053postRegistergIAlus` | None | default | RegisterBody | Result<AuthenticationResponse> | E36 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v3/users/validate_email` | `AuthApi.m16054postValidateEmailgIAlus` | None | default | ValidateEmailPostBody | Result<ValidationResponse> | E36 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v3/users/validate_password` | `AuthApi.m16055postValidatePasswordgIAlus` | None | default | ValidatePasswordPostBody | Result<ValidationResponse> | E36 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/add` | `CameraApi.m16110addCamera0E7RQCE` | Bearer + TOKEN-AUTH | default | AddCameraBody | Result<AddCameraResponseBody> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{camera}/accessories/{accessoryType}/{accessoryId}/delete` | `CameraApi.m16111deleteAccessoryyxL6bBk` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{cameraId}/delete` | `CameraApi.m16112deleteCamera0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E37 |
| DELETE | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{primary_id}/pair` | `CameraApi.m16113deleteCameraPair0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/delete` | `CameraApi.deleteCameraRx` | Bearer + TOKEN-AUTH | default | — | Observable<BlinkData> | E37 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/config` | `CameraApi.m16114getCameraConfig0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<CameraConfig> | E37 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/config` | `CameraApi.getCameraConfigRx` | Bearer + TOKEN-AUTH | default | — | Observable<CameraConfig> | E37 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{cameraId}/network_type` | `CameraApi.m16115getVideoNetworkType0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<VideoNetworksConfig> | E37 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/zones` | `CameraApi.getZones` | Bearer + TOKEN-AUTH | default | — | Observable<AdvancedCameraZones> | E37 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/zones` | `CameraApi.m16116getZonesV20E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<ZoneV2Response> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{camera}/light_accessories/{accessoryId}/lights/{lightControl}` | `CameraApi.m16117postAccessoryLightyxL6bBk` | Bearer + TOKEN-AUTH | default | — | Result<CameraActionKommand> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{cameraId}/config` | `CameraApi.m16118postCameraConfigBWLJW6A` | Bearer + TOKEN-AUTH | default | UpdateCameraBody | Result<Kommand> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/{type}` | `CameraApi.m16119postCameraMotionBWLJW6A` | Bearer + TOKEN-AUTH | default | — | Result<CameraActionKommand> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/{type}` | `CameraApi.postCameraMotionOld` | Bearer + TOKEN-AUTH | default | — | Observable<Command> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{camera}/config` | `CameraApi.postCameraSettingsRx` | Bearer + TOKEN-AUTH | default | UpdateCameraBody | Observable<Command> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{cameraId}/status` | `CameraApi.m16120postCameraStatusCommand0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v6/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{cameraId}/liveview` | `CameraApi.m16121postLiveViewCommandBWLJW6A` | Bearer + TOKEN-AUTH | default | LiveViewCommandPostBody | Result<LiveViewCommandResponse> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{primary_id}/pair` | `CameraApi.m16122postPairCamerasBWLJW6A` | Bearer + TOKEN-AUTH | default | PairCameraBody | Result<Unit> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{primary_id}/swap_pair` | `CameraApi.m16123postSwapPairBWLJW6A` | Bearer + TOKEN-AUTH | default | SwapCameraBody | Result<Unit> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/thumbnail` | `CameraApi.m16124postThumbnail0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<CameraActionKommand> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/thumbnail` | `CameraApi.postThumbnailOld` | Bearer + TOKEN-AUTH | default | — | Observable<Command> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/cameras/{cameraId}/network_type` | `CameraApi.m16125postVideoNetworkTypeBWLJW6A` | Bearer + TOKEN-AUTH | default | VideoNetworkTypeBody | Result<Kommand> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/calibrate` | `CameraApi.m16126saveCalibrateTemperatureBWLJW6A` | Bearer + TOKEN-AUTH | default | TemperatureCalibrationPostBody | Result<Kommand> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/zones` | `CameraApi.setZones` | Bearer + TOKEN-AUTH | default | AdvancedCameraZones | Observable<Command> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/zones` | `CameraApi.m16127setZonesV2BWLJW6A` | Bearer + TOKEN-AUTH | default | ZoneV2Response | Result<Kommand> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/cameras/{camera_id}/snooze` | `CameraApi.m16128snoozeCameraBWLJW6A` | Bearer + TOKEN-AUTH | default | SnoozeBody | Result<Unit> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/temp_alert_disable` | `CameraApi.m16129tempAlertDisable0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/cameras/{camera}/temp_alert_enable` | `CameraApi.m16130tempAlertEnable0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E37 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/cameras/{camera_id}/unsnooze` | `CameraApi.m16131unSnoozeCamera0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E37 |
| GET | https://rest-{tier}.immedia-semi.com/api/ | `v1/clients/%7Binjected_client_id%7D/options` | `ClientApi.m16065getClientOptionsIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<ClientOptionsBody> | E38 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/clients/%7Binjected_client_id%7D/options` | `ClientApi.m16066postClientOptionsgIAlus` | Bearer + TOKEN-AUTH | default | ClientOptionsBody | Result<Unit> | E38 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `/clients/%7Binjected_client_id%7D/update` | `ClientApi.m16067postClientUpdategIAlus` | Bearer + TOKEN-AUTH | default | ClientUpdatePostBody | Result<Unit> | E38 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v5/clients/%7Binjected_client_id%7D/client_verification/pin/resend` | `ClientApi.m16068resendClientVerificationCodeIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<ResendClientVerificationCodeResponse> | E38 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v5/clients/%7Binjected_client_id%7D/client_verification/pin/verify` | `ClientApi.m16069submitClientVerificationCodegIAlus` | Bearer + TOKEN-AUTH | default | SubmitVerificationRequest | Result<PinVerificationResponse> | E38 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v4/clients/%7Binjected_client_id%7D/pin/verify` | `ClientApi.m16070verifyClientPINgIAlus` | Bearer + TOKEN-AUTH | default | VerifyPinBody | Result<PinVerificationResponse> | E38 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/clients/%7Binjected_client_id%7D/control_panel/delete` | `ClientDeviceManagementApi.m17603deleteClientgIAlus` | Bearer + TOKEN-AUTH | default | DeleteClientBody | Result<Unit> | E39 |
| GET | https://rest-{tier}.immedia-semi.com/api/ | `v1/clients/%7Binjected_client_id%7D/control_panel/clients` | `ClientDeviceManagementApi.m17604getClientsIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<GetClientsResponse> | E39 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/clients/%7Binjected_client_id%7D/control_panel/request_pin` | `ClientDeviceManagementApi.m17605postManageClientsPinGenerateIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<GeneratePinResponse> | E39 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/clients/%7Binjected_client_id%7D/control_panel/pin/resend` | `ClientDeviceManagementApi.m17606postManageClientsPinResendIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<GeneratePinResponse> | E39 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/clients/%7Binjected_client_id%7D/control_panel/pin/verify` | `ClientDeviceManagementApi.m17607postManageClientsPinVerifygIAlus` | Bearer + TOKEN-AUTH | default | VerifyPinPostBody | Result<VerifyPinResponse> | E39 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}` | `CommandApi.m16202commandPoll0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<SupervisorKommand> | E40 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}` | `CommandApi.m16203commandPollCameraAction0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<CameraActionSupervisorKommand> | E40 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}` | `CommandApi.m16204commandPollLiveView0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<LiveViewSupervisorKommand> | E40 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}` | `CommandApi.m16205commandPollWithChildren0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<SupervisorKommandWithChildren> | E40 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}` | `CommandApi.commandPolling` | Bearer + TOKEN-AUTH | default | — | Observable<Commands> | E40 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}/update` | `CommandApi.m16206postUpdateCommandBWLJW6A` | Bearer + TOKEN-AUTH | default | UpdateCommandRequest | Result<Kommand> | E40 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}/done` | `CommandApi.terminateCommand` | Bearer + TOKEN-AUTH | default | — | Call<BlinkData> | E40 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/commands/{command}/update` | `CommandApi.terminateOnboardingCommand` | Bearer + TOKEN-AUTH | default | TerminateOnboardingBody | Observable<BlinkData> | E40 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v2/clients/%7Binjected_client_id%7D/tiv` | `CustomerSupportAccessApi.m17650postTivLockgIAlus` | Bearer + TOKEN-AUTH | default | TivLockBody | Result<SetTivLockResponse> | E41 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v2/clients/%7Binjected_client_id%7D/tiv_unlock/request_pin` | `CustomerSupportAccessApi.m17651postTivUnlockPinGenerateIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<GeneratePinResponse> | E41 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v2/clients/%7Binjected_client_id%7D/tiv_unlock/pin/resend` | `CustomerSupportAccessApi.m17652postTivUnlockPinResendIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<GeneratePinResponse> | E41 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v2/clients/%7Binjected_client_id%7D/tiv_unlock/pin/verify` | `CustomerSupportAccessApi.m17653postTivUnlockPinVerifygIAlus` | Bearer + TOKEN-AUTH | default | VerifyPinPostBody | Result<VerifyPinResponse> | E41 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/devices/identify/{serialNumber}` | `DeviceApi.m16108getDeviceIdentitygIAlus` | Bearer + TOKEN-AUTH | default | — | Result<IdentifyDeviceResponse> | E42 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/devices/identify/{serialNumber}` | `DeviceApi.identifyDevice` | Bearer + TOKEN-AUTH | default | — | Single<IdentifyDeviceResponseOld> | E42 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/add` | `DoorbellApi.m16149addLotus0E7RQCE` | Bearer + TOKEN-AUTH | default | AddLotusBody | Result<AddLotusResponse> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/doorbells/{doorbell_id}/change_wifi` | `DoorbellApi.m16150changeLotusWifiBWLJW6A` | Bearer + TOKEN-AUTH | default | OnboardingBody | Result<AddLotusResponse> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/doorbells/{lotusId}/delete` | `DoorbellApi.m16151deleteDoorbell0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/delete` | `DoorbellApi.deleteLotusRx` | Bearer + TOKEN-AUTH | default | — | Observable<BlinkData> | E43 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/doorbells/{serial}/fw_update` | `DoorbellApi.downloadLotusFirmwareUpdate` | Bearer + TOKEN-AUTH | default | — | Observable<retrofit2.adapter.rxjava.Result<ResponseBody>> | E43 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/list` | `DoorbellApi.m16152getChimeCameras0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<ChimeCamerasResponse> | E43 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbell}/config` | `DoorbellApi.m16153getDoorbellConfig0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<LotusConfigInfo> | E43 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config` | `DoorbellApi.m16154getLotusChimeConfigBWLJW6A` | Bearer + TOKEN-AUTH | default | — | Result<LotusChimeConfig> | E43 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbell}/config` | `DoorbellApi.getLotusConfigRx` | Bearer + TOKEN-AUTH | default | — | Observable<LotusConfigInfo> | E43 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/zones` | `DoorbellApi.getLotusZones` | Bearer + TOKEN-AUTH | default | — | Observable<AdvancedCameraZones> | E43 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/zones` | `DoorbellApi.m16155getZonesV20E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<ZoneV2Response> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/doorbells/{doorbell_id}/stay_awake` | `DoorbellApi.m16156keepLotusAwake0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/doorbells/{doorbell_id}/change_mode` | `DoorbellApi.m16157lotusChangeMode0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<AddLotusResponse> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/doorbells/{doorbell_id}/clear_creds` | `DoorbellApi.m16158lotusClearCreds0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbell}/power_test` | `DoorbellApi.m16159performLotusPowerAnalysis0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/doorbells/{doorbellId}/owl_as_chime/update` | `DoorbellApi.m16160postChimeCamerasBWLJW6A` | Bearer + TOKEN-AUTH | default | ChimeCamerasPostBody | Result<Unit> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/disable` | `DoorbellApi.m16161postDisableLotus0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<CameraActionKommand> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/disable` | `DoorbellApi.postDisableLotusOld` | Bearer + TOKEN-AUTH | default | — | Observable<Command> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/doorbells/{lotusId}/config` | `DoorbellApi.m16162postDoorbellConfigBWLJW6A` | Bearer + TOKEN-AUTH | default | UpdateLotusBody | Result<Kommand> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/doorbells/{lotusId}/status` | `DoorbellApi.m16163postDoorbellStatusCommand0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/enable` | `DoorbellApi.m16164postEnableLotus0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<CameraActionKommand> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/enable` | `DoorbellApi.postEnableLotusOld` | Bearer + TOKEN-AUTH | default | — | Observable<Command> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/networks/{networkId}/doorbells/{doorbellId}/liveview` | `DoorbellApi.m16165postLiveViewCommandBWLJW6A` | Bearer + TOKEN-AUTH | default | LiveViewCommandPostBody | Result<LiveViewCommandResponse> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbellId}/temp_alert_disable` | `DoorbellApi.m16166postTempAlertDisable0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbellId}/temp_alert_enable` | `DoorbellApi.m16167postTempAlertEnable0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbellId}/calibrate` | `DoorbellApi.m16168postTemperatureCalibrationBWLJW6A` | Bearer + TOKEN-AUTH | default | TemperatureCalibrationPostBody | Result<Kommand> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/thumbnail` | `DoorbellApi.m16169postThumbnail0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<CameraActionKommand> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/thumbnail` | `DoorbellApi.postThumbnailOld` | Bearer + TOKEN-AUTH | default | — | Observable<Command> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/status` | `DoorbellApi.m16170refreshLotusStatus0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/status` | `DoorbellApi.m16171refreshLotusStatusSuspend0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Command> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/config` | `DoorbellApi.saveLotusSettings` | Bearer + TOKEN-AUTH | default | UpdateLotusBody | Observable<Command> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbell}/chime/{chimeType}/config` | `DoorbellApi.m16172setLotusChimeConfigyxL6bBk` | Bearer + TOKEN-AUTH | default | UpdateLotusChimeConfig | Result<Kommand> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/zones` | `DoorbellApi.setLotusZones` | Bearer + TOKEN-AUTH | default | AdvancedCameraZones | Observable<Command> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{lotus}/zones` | `DoorbellApi.m16173setZonesV2BWLJW6A` | Bearer + TOKEN-AUTH | default | ZoneV2Response | Result<Kommand> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/doorbells/{lotus_id}/snooze` | `DoorbellApi.m16174snoozeLotusBWLJW6A` | Bearer + TOKEN-AUTH | default | SnoozeBody | Result<Unit> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/doorbells/{doorbell}/trigger_chime` | `DoorbellApi.m16175testLotusDingBWLJW6A` | Bearer + TOKEN-AUTH | default | TestLotusDingConfig | Result<Kommand> | E43 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/doorbells/{lotus_id}/unsnooze` | `DoorbellApi.m16176unSnoozeLotus0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E43 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v4/clients/%7Binjected_client_id%7D/email_change` | `EmailChangeApi.m17629postEmailChangegIAlus` | Bearer + TOKEN-AUTH | default | ChangeEmailPostBody | Result<Unit> | E44 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v4/clients/%7Binjected_client_id%7D/email_change/pin/resend` | `EmailChangeApi.m17630postEmailChangePinGenerateIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<GeneratePinResponse> | E44 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v4/clients/%7Binjected_client_id%7D/email_change/pin/verify` | `EmailChangeApi.m17631postEmailChangePinVerifygIAlus` | Bearer + TOKEN-AUTH | default | VerifyPinPostBody | Result<VerifyPinResponse> | E44 |
| POST | https://prod.eventstream.immedia-semi.com/ | `1.0.0/batch/client.device/{appSubGroup}` | `EventStreamApi.sendBatchEvents` (appSubGroup = `blink.mobile.app`) | Optional Authorization | Authorization | RequestBody | Unit | E46, E91 |
| POST | https://prod.eventstream.immedia-semi.com/ | `1.0.0/event/client.device/{appSubGroup}` | `EventStreamApi.trackEvent` (appSubGroup = `blink.mobile.app`) | Optional Authorization | Authorization | RequestBody | Unit | E46, E91 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/feature_flags/enabled` | `FeatureFlagApi.m16211getFeatureFlagsIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<FeatureFlagsResponse> | E47 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v4/accounts/%7Binjected_account_id%7D/homescreen` | `HomeScreenApi.m17741getHomeScreenIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<HomeScreen> | E48 |
| GET | https://rest-{tier}.immedia-semi.com/api/ | `v1/data_request/list` | `ManageDataApi.m17550getDataRequestsIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<DataRequests> | E50 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/data_request/dsar/create` | `ManageDataApi.m17551postDsarRequestIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<SubmitDataRequestResponse> | E50 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/data_request/euda/create` | `ManageDataApi.m17552postEudaRequestIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<SubmitDataRequestResponse> | E50 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/data_request/third_party/{thirdPartyId}/revoke` | `ManageDataApi.m17553postRevokegIAlus` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E50 |
| DELETE | https://rest-{shared_tier}.immedia-semi.com/api/ | `v4/accounts/%7Binjected_account_id%7D/media/{mediaId}/delete` | `MediaApi.m17899deleteCloudMediagIAlus` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E51 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/request/{clipId}` | `MediaApi.m17900getClipKommandyxL6bBk` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E51 |
| DELETE | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage` | `MediaApi.m17901getDeleteAllKommand0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E51 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/{manifestId}/clip/delete/{clipId}` | `MediaApi.m17902getDeleteLocalStorageMediaKommandyxL6bBk` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E51 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/manifest/request` | `MediaApi.m17903getLocalStorageManifestKommand0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E51 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/media/{commandId}` | `MediaApi.m17904getLocalStorageMediaBWLJW6A` | Bearer + TOKEN-AUTH | default | — | Result<MediaResponse> | E51 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v4/accounts/%7Binjected_account_id%7D/media_settings` | `MediaApi.m17905getMediaSettingsIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<MediaSettingsResponse> | E51 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v4/accounts/%7Binjected_account_id%7D/unwatched_media` | `MediaApi.m17906getUnwatchedMediaIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<UnwatchedMediaResponse> | E51 |
| PATCH | https://rest-{shared_tier}.immedia-semi.com/api/ | `v4/accounts/%7Binjected_account_id%7D/media_settings` | `MediaApi.m17907patchMediaSettingsgIAlus` | Bearer + TOKEN-AUTH | default | MediaSettingsPatch | Result<Unit> | E51 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v4/accounts/%7Binjected_account_id%7D/media/delete` | `MediaApi.m17908postDeleteMediagIAlus` | Bearer + TOKEN-AUTH | default | MediaListBody | Result<Unit> | E51 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v4/accounts/%7Binjected_account_id%7D/media/mark_all_as_viewed` | `MediaApi.m17909postMarkAllAsViewedIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E51 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v4/accounts/%7Binjected_account_id%7D/media/mark_as_viewed` | `MediaApi.m17910postMarkAsViewedgIAlus` | Bearer + TOKEN-AUTH | default | MediaListBody | Result<Unit> | E51 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v4/accounts/%7Binjected_account_id%7D/media` | `MediaApi.m17911postMediayxL6bBk` | Bearer + TOKEN-AUTH | default | MediaPostBody | Result<MediaResponse> | E51 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/state/{type}` | `NetworkApi.armDisarmNetwork` | Bearer + TOKEN-AUTH | default | — | Observable<Command> | E52 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/add` | `NetworkApi.m16506createSystemgIAlus` | Bearer + TOKEN-AUTH | default | AddNetworkBody | Result<ANetwork> | E52 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/delete` | `NetworkApi.deleteSystem` | Bearer + TOKEN-AUTH | default | — | Observable<BlinkData> | E52 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/state/disarm` | `NetworkApi.m16507disarmNetworkgIAlus` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E52 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/system_offline/{network}` | `NetworkApi.sendSystemOfflineHelpEmail` | Bearer + TOKEN-AUTH | default | — | Observable<BlinkData> | E52 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/snooze` | `NetworkApi.m16508snoozeSystem0E7RQCE` | Bearer + TOKEN-AUTH | default | SnoozeBody | Result<Unit> | E52 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/unsnooze` | `NetworkApi.m16509unSnoozeSystemgIAlus` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E52 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/update` | `NetworkApi.updateNetworkSaveAllLiveViews` | Bearer + TOKEN-AUTH | default | UpdateNetworkSaveAllLiveViews | Observable<BlinkData> | E52 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/update` | `NetworkApi.updateSystem` | Bearer + TOKEN-AUTH | default | UpdateSystemNameBody | Observable<BlinkData> | E52 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{network}/update` | `NetworkApi.updateTimezone` | Bearer + TOKEN-AUTH | default | UpdateTimezoneBody | Observable<BlinkData> | E52 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v2/notification` | `NotificationApi.acknowledgeNotification` | Bearer + TOKEN-AUTH | default | AcknowledgeNotificationBody | Observable<Object> | E53 |
| POST | https://api.{env}oauth.blink.com/ | `oauth/token` | `OauthApi.m16059postLogineH_QyT8` | None (OAuth) | default + 2fa-code, hardware_id | form fields: username, password, grant_type, client_id, scope | Result<RefreshTokensResponse> | E54 |
| POST | https://api.{env}oauth.blink.com/ | `oauth/token` | `OauthApi.postRefreshTokens` | None (OAuth) | default | form fields: refresh_token, grant_type, client_id, scope | Call<RefreshTokensResponse> | E54 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/accessories/rosie/owl/{owl_id}/calibrate` | `OwlApi.m16181calibrateRosie0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/change_wifi` | `OwlApi.m16182changeOwlWifiBWLJW6A` | Bearer + TOKEN-AUTH | default | OnboardingBody | Result<OwlAddBody> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/delete` | `OwlApi.m16183deleteOwl0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/delete` | `OwlApi.deleteOwlRx` | Bearer + TOKEN-AUTH | default | — | Observable<BlinkData> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/owls/{owl_id}/accessories/rosie/{rosie_id}/delete` | `OwlApi.m16184deleteRosieBWLJW6A` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E55 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/owls/{serial}/fw_update` | `OwlApi.downloadOwlFirmwareUpdate` | Bearer + TOKEN-AUTH | default | — | Observable<retrofit2.adapter.rxjava.Result<ResponseBody>> | E55 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/config` | `OwlApi.m16185getOwlConfig0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<OwlConfigInfo> | E55 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/config` | `OwlApi.getOwlConfigRx` | Bearer + TOKEN-AUTH | default | — | Observable<OwlConfigInfo> | E55 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/zones` | `OwlApi.m16186getZonesV20E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<ZoneV2Response> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/owls/add` | `OwlApi.m16187postAddOwl0E7RQCE` | Bearer + TOKEN-AUTH | default | AddOwlPostBody | Result<AddOwlResponse> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/change_wifi` | `OwlApi.m16188postChangeOwlWifiBWLJW6A` | Bearer + TOKEN-AUTH | default | AddOwlPostBody | Result<AddOwlResponse> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{camera}/lights/{lightControl}` | `OwlApi.m16189postLightBWLJW6A` | Bearer + TOKEN-AUTH | default | — | Result<CameraActionKommand> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{camera}/lights/{lightControl}` | `OwlApi.m16190postLightOldBWLJW6A` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/liveview` | `OwlApi.m16191postLiveViewCommandBWLJW6A` | Bearer + TOKEN-AUTH | default | LiveViewCommandPostBody | Result<LiveViewCommandResponse> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/config` | `OwlApi.m16192postOwlConfigBWLJW6A` | Bearer + TOKEN-AUTH | default | UpdateOwlBody | Result<Kommand> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/config` | `OwlApi.m16193postOwlConfigCommandBWLJW6A` | Bearer + TOKEN-AUTH | default | UpdateOwlBody | Result<CameraActionKommand> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/config` | `OwlApi.postOwlSettingsOld` | Bearer + TOKEN-AUTH | default | UpdateOwlBody | Observable<Command> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/status` | `OwlApi.m16194postOwlStatusCommand0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/thumbnail` | `OwlApi.m16195postThumbnail0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<CameraActionKommand> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/thumbnail` | `OwlApi.postThumbnailOld` | Bearer + TOKEN-AUTH | default | — | Observable<Command> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/networks/{networkId}/owls/{owlId}/zones` | `OwlApi.m16196setZonesV2BWLJW6A` | Bearer + TOKEN-AUTH | default | ZoneV2Response | Result<Kommand> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/owls/{owl_id}/snooze` | `OwlApi.m16197snoozeOwlBWLJW6A` | Bearer + TOKEN-AUTH | default | SnoozeBody | Result<Unit> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/owls/add` | `OwlApi.m16198startOwlOnboardingOld0E7RQCE` | Bearer + TOKEN-AUTH | default | OnboardingBody | Result<OwlAddBody> | E55 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network_id}/owls/{owl_id}/unsnooze` | `OwlApi.m16199unSnoozeOwl0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E55 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v4/clients/%7Binjected_client_id%7D/password_change` | `PasswordChangeApi.m17642changePasswordgIAlus` | Bearer + TOKEN-AUTH | default | ResetPasswordPostBody | Result<Unit> | E56 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v4/clients/%7Binjected_client_id%7D/password_change` | `PasswordChangeApi.m17643postPasswordChangegIAlus` | Bearer + TOKEN-AUTH | default | ResetPasswordPostBody | Result<Unit> | E56 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v4/clients/%7Binjected_client_id%7D/password_change/pin/generate` | `PasswordChangeApi.m17644postPasswordChangePinGenerateIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<GeneratePinResponse> | E56 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v4/clients/%7Binjected_client_id%7D/password_change/pin/verify` | `PasswordChangeApi.m17645postPasswordChangePinVerifygIAlus` | Bearer + TOKEN-AUTH | default | VerifyPinPostBody | Result<VerifyPinResponse> | E56 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v4/users/password_change` | `PasswordResetApi.m15681postPasswordResetgIAlus` | None | default | ResetPasswordPostBody | Result<Unit> | E57 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v4/users/password_change/pin/generate` | `PasswordResetApi.m15682postPasswordResetPinGenerategIAlus` | None | default | GeneratePinPostBody | Result<GeneratePinResponse> | E57 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v4/users/password_change/pin/verify` | `PasswordResetApi.m15683postPasswordResetPinVerifygIAlus` | None | default | VerifyPinPostBody | Result<VerifyPinResponse> | E57 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v5/clients/%7Binjected_client_id%7D/phone_number_change` | `PhoneNumberChangeApi.m16076changePhoneNumbergIAlus` | Bearer + TOKEN-AUTH | default | ChangePhoneNumberBody | Result<ChangePhoneNumberResponse> | E58 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v5/clients/%7Binjected_client_id%7D/phone_number_change` | `PhoneNumberChangeApi.m16077postPhoneNumberChangegIAlus` | Bearer + TOKEN-AUTH | default | AddPhoneNumberPostBody | Result<ChangePhoneNumberResponse> | E58 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v5/clients/%7Binjected_client_id%7D/phone_number_change/pin/verify` | `PhoneNumberChangeApi.m16078postPhoneNumberChangePinVerifygIAlus` | Bearer + TOKEN-AUTH | default | SubmitVerificationRequest | Result<PinVerificationResponse> | E58 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/programs/create` | `ProgramApi.createProgram` | Bearer + TOKEN-AUTH | default | Program | Observable<BlinkData> | E59 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/programs/{program}/delete` | `ProgramApi.deleteProgram` | Bearer + TOKEN-AUTH | default | — | Observable<BlinkData> | E59 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/programs/{program}/disable` | `ProgramApi.disableProgram` | Bearer + TOKEN-AUTH | default | — | Observable<BlinkData> | E59 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/programs/{program}/enable` | `ProgramApi.enableProgram` | Bearer + TOKEN-AUTH | default | — | Observable<BlinkData> | E59 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/programs` | `ProgramApi.getPrograms` | Bearer + TOKEN-AUTH | default | — | Observable<List<Program>> | E59 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{network}/programs/{program}/update` | `ProgramApi.updateProgram` | Bearer + TOKEN-AUTH | default | UpdateProgramRequest | Observable<BlinkData> | E59 |
| GET | https://rest-{tier}.immedia-semi.com/api/ | `v1/version` | `PublicApi.m16213getAppVersionCheckIoAF18A` | None | default | — | Result<AppVersionCheckResponse> | E60 |
| GET | https://rest-{tier}.immedia-semi.com/api/ | `v1/countries` | `PublicApi.m16214getCountriesIoAF18A` | None | default | — | Result<CountriesResponse> | E60 |
| GET | https://apphelp.immedia-semi.com | `//apphelp.immedia-semi.com/link-manifest.json` | `PublicApi.m16215getLinkManifestIoAF18A` | None | default | — | Result<LinkManifest> | E60 |
| GET | https://rest-{tier}.immedia-semi.com/api/ | `/regions` | `PublicApi.m16216getRegionsIoAF18A` | None | default | — | Result<RegionsResponse> | E60 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/access` | `ReadSubscriptionApi.m16219getAccessIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<AccessResponse> | E61 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/subscriptions/entitlements` | `ReadSubscriptionApi.m16220getEntitlementsIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<EntitlementResponse> | E61 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v3/accounts/%7Binjected_account_id%7D/subscriptions/plans` | `ReadSubscriptionApi.m16221getSubscriptionsIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<SubscriptionPlansResponse> | E61 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/subscriptions/plans` | `ReadSubscriptionApi.m16222getSubscriptionsOldIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<SubscriptionPlansResponse> | E61 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/smart_video_descriptions` | `SmartVideoDescriptionsApi.m17330getSmartVideoDescriptionsIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<SmartVideoDescriptionsResponse> | E63 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/smart_video_descriptions` | `SmartVideoDescriptionsApi.m17331postUpdateSmartVideoDescriptionsgIAlus` | Bearer + TOKEN-AUTH | default | SmartVideoDescriptionsPostBody | Result<Unit> | E63 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/delete` | `SyncModuleApi.m17015deleteSyncModule0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E64 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/delete` | `SyncModuleApi.deleteSyncModuleRx` | Bearer + TOKEN-AUTH | default | — | Observable<BlinkData> | E64 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/sync_modules/{serial}/fw_update` | `SyncModuleApi.downloadFirmwareUpdate` | Bearer + TOKEN-AUTH | default | — | Observable<retrofit2.adapter.rxjava.Result<ResponseBody>> | E64 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/eject` | `SyncModuleApi.m17016ejectUsbStorage0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E64 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/eject` | `SyncModuleApi.ejectUsbStorageOld` | Bearer + TOKEN-AUTH | default | — | Single<Command> | E64 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/format` | `SyncModuleApi.m17017formatUsbStorage0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E64 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/format` | `SyncModuleApi.formatUsbStorageOld` | Bearer + TOKEN-AUTH | default | — | Single<Command> | E64 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/status` | `SyncModuleApi.m17018getLocalStorageStatus0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<LocalStorageStatusResponse> | E64 |
| GET | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/status` | `SyncModuleApi.getLocalStorageStatusOld` | Bearer + TOKEN-AUTH | default | — | Single<LocalStorageStatusResponse> | E64 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/mount` | `SyncModuleApi.m17019mountUsb0E7RQCE` | Bearer + TOKEN-AUTH | default | — | Result<Kommand> | E64 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v1/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{syncModuleId}/local_storage/mount` | `SyncModuleApi.mountUsbOld` | Bearer + TOKEN-AUTH | default | — | Single<Command> | E64 |
| POST | https://rest-{shared_tier}.immedia-semi.com/api/ | `v2/accounts/%7Binjected_account_id%7D/networks/{networkId}/sync_modules/{type}` | `SyncModuleApi.m17020startSyncModuleOnboardingBWLJW6A` | Bearer + TOKEN-AUTH | default | OnboardingBody | Result<Command> | E64 |
| GET | http://172.16.97.199/ | `api/logs` | `SyncModuleService.getLogs` | Local (no bearer) | — | — | Observable<ResponseBody> | E65 |
| GET | http://172.16.97.199/ | `api/ssids` | `SyncModuleService.getSsids` | Local (no bearer) | — | — | Observable<AccessPoints> | E65 |
| POST | http://172.16.97.199/ | `/api/set/app_fw_update` | `SyncModuleService.setFirmwareUpdate` | Local (no bearer) | Content-Type, X-Blink-FW-Signature, Content-Length | RequestBody | Observable<BlinkData> | E65 |
| POST | http://172.16.97.199/ | `/api/set/ssid` | `SyncModuleService.setSSid` | Local (no bearer) | HeaderMap | SetSSIDBody | Observable<BlinkData> | E65 |
| GET | Unknown | `api/get_fw_version` | `WifiApi.m17034getFwVersionIoAF18A` | Unknown | default | — | Result<GetFwVersionResponse> | E70 |
| POST | Unknown | `api/set/key` | `WifiApi.m17035sendEncryptionKeygIAlus` | Unknown | default | RequestBody | Result<Unit> | E70 |
| GET | Unknown | `api/ssids` | `WifiSecureApi.m17042getSsidsIoAF18A` | Unknown | default | — | Result<AccessPoints> | E71 |
| POST | Unknown | `api/set/ssid` | `WifiSecureApi.m17043setSsid0E7RQCE` | Unknown | default + HeaderMap | SetSSIDBody | Result<Unit> | E71 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/subscriptions/plans/{subscriptionId}/attach` | `WriteSubscriptionApi.m16239attachPlan0E7RQCE` | Bearer + TOKEN-AUTH | default | AttachPlanBody | Result<DspSubscriptionResponse> | E72 |
| DELETE | https://rest-{tier}.immedia-semi.com/api/ | `v1/subscriptions/plans/cancel_trial` | `WriteSubscriptionApi.m16240cancelTrialIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E72 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v2/subscriptions/plans/create_trial` | `WriteSubscriptionApi.m16241createTrialgIAlus` | Bearer + TOKEN-AUTH | default | AdditionalTrialBody | Result<Unit> | E72 |
| GET | https://rest-{tier}.immedia-semi.com/api/ | `v1/subscriptions/plans/get_device_attach_eligibility` | `WriteSubscriptionApi.m16242getDeviceEligibilityIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<DeviceEligibilityResponse> | E72 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/subscriptions/link/link_account` | `WriteSubscriptionApi.m16243linkAmazonAccountgIAlus` | Bearer + TOKEN-AUTH | default | MapLinkBody | Result<DspSubscriptionResponse> | E72 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/subscriptions/clear_popup/{type}` | `WriteSubscriptionApi.m16244postClearTrialPopupgIAlus` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E72 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/subscriptions/plans/renew_trial` | `WriteSubscriptionApi.m16245renewTrialIoAF18A` | Bearer + TOKEN-AUTH | default | — | Result<Unit> | E72 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/subscriptions/request/status/{uuid}` | `WriteSubscriptionApi.m16246subscriptionRequestStatus0E7RQCE` | Bearer + TOKEN-AUTH | default | SubscriptionRequestStatusBody | Result<SubscriptionRequestStatusResponse> | E72 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/subscriptions/link/unlink_account` | `WriteSubscriptionApi.m16247unlinkAmazonAccountgIAlus` | Bearer + TOKEN-AUTH | default | VerifyLinkAccountBody | Result<DspSubscriptionResponse> | E72 |
| GET | dynamic (@Url) | `@Url (full URL)` | `VideoApi.m17790getVideogIAlus` | Bearer + TOKEN-AUTH (Blink hosts only) | default (+ Authorization/TOKEN-AUTH if host is immedia-semi) | — | Result<ResponseBody> | E66 |

## Streaming / Live View (partial)
- Live view negotiation: `POST v6/accounts/{account}/networks/{networkId}/cameras/{cameraId}/liveview` with `LiveViewCommandPostBody` fields `intent` and `motion_event_start_time`. (E19, E20)
- Response contains `server`, `liveview_token`, `polling_interval`, `duration`, and related fields. (E21)
- Legacy/alt live video response includes `server`, `duration`, `continue_interval`, `continue_warning`, `is_multi_client_live_view`. (E22)
- Stream scheme marker `rtsps` is present in live view session manager. (E23)
- Live view command polling defaults to a 1‑second interval; delayBetweenPolls waits up to the current interval and can be interrupted when the polling interval changes. (E67, E68)

## Error handling / retries (partial)
- Command polling increments an error retry counter; if `maxErrorRetries` is provided and not exceeded, it delays and retries, otherwise returns a `PollingResult.Error`. Poll delay uses `DelayKt.delay(getPollingInterval().toMillis())`. (E69)

## Local / Onboarding
- Local base URL: `http://172.16.97.199/` (cleartext). (E1, E13, E17)
- SyncModuleService endpoints include `GET api/ssids`, `POST /api/set/app_fw_update`, `POST /api/set/ssid` (encrypted via `EncryptionInterceptor`). (E17, E18)

## Event Stream (partial)
- EventStream client initializes with `https://prod.eventstream.immedia-semi.com/` and an AuthInfoProvider that returns `null` auth token (userId from AccountRepository). (E24)
- Event endpoints: `POST 1.0.0/event/client.device/{appSubGroup}` and `POST 1.0.0/batch/client.device/{appSubGroup}` with optional `Authorization` header. (E28)
- Client subgroup is `blink.mobile.app`, batch size `25`, flush delay `300` (seconds), and core metadata includes device make/model, UUID, user agent, app version/code, build type, brand, platform (Android/Fire OS), and locale. (E91, E92)

## Non-Blink Traffic (excluded from endpoint catalog)

| Method | Base Host | Path | Purpose (method) | Auth | Headers | Body Schema | Response Shape | Evidence |
|---|---|---|---|---|---|---|---|---|
| POST | https://rest-{tier}.immedia-semi.com/api/ | `v1/events/app` | `EventApi.m16255trackEventsgIAlus` | Bearer + TOKEN-AUTH | default | TrackingEvents | Result<Unit> | E45 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `/app/logs/upload` | `LogApi.sendLogs` | Bearer + TOKEN-AUTH | default | LogsBody | Observable<BlinkData> | E49 |
| POST | https://rest-{tier}.immedia-semi.com/api/ | `/app/logs/upload` | `LogApi.sendLogsCall` | Bearer + TOKEN-AUTH | default | LogsBody | Call<BlinkData> | E49 |
- `sdk.iad-05.braze.com` (Braze analytics) appears in `BaseUrls.BRAZE` and will be tracked separately.

## Next Evidence Targets (queued)
- Map command polling cadence and completion semantics in live view / camera actions (`CommandApi`, supervisors).
- Find where `SHARED_TIER` and `OAUTH_ENV` are persisted (setter/location not found yet).
- Confirm whether any other flows besides `GetAccountInfoUseCase` set the `TIER` key or override it (e.g., account switching or shared access flows).
- Confirm how `/regions` response is populated (actual tier values returned for each region) and whether any fallback hosts exist.
- Identify any request signing/nonce/timestamp logic beyond default headers.
- Expand streaming protocol details (rtsps session handling, keepalive/extend rules) in Walnut live view stack.
- Trace EventStream usage (who calls `EventStreamApi`, payload schema).
