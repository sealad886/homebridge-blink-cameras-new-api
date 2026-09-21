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
}
