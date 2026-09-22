package com.immediasemi.blink.test;

/* JADX INFO: loaded from: classes2.dex */
public interface FixtureApi {
    @GET("v1/accounts/{account}/devices")
    Object getDevices(@Path("account") long account, @Query("page") Long page, Continuation<? super FixtureResponse> continuation);

    @FormUrlEncoded
    @POST("oauth/token")
    Call<FixtureResponse> postToken(@Field("grant_type") String grantType, @Header("hardware_id") String hardwareId);

    @POST("v1/accounts/{account}/devices")
    Object updateDevice(@Body FixtureBody body, @Path("account") long account, Continuation<? super FixtureResponse> continuation);

    @HTTP(hasBody = false, method = "DELETE", path = "v1/accounts/{account}/history")
    Object clearHistory(@Path("account") long account, Continuation<? super Unit> continuation);

    @GET
    Object download(@Url String url, Continuation<? super FixtureResponse> continuation);

    @POST
    Object upload(@Url String url, @Body FixtureBody body, Continuation<? super FixtureResponse> continuation);

    @HEAD
    Object root();
}
