package com.immediasemi.blink.test;

/* JADX INFO: loaded from: classes2.dex */
public interface PasskeyRegistrationApi {
    @POST("v1/passkey/register")
    Object register(@Body RegistrationRequest body, Continuation<? super FixtureResponse> continuation);
}
