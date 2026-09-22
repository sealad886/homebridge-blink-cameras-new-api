package com.immediasemi.blink.test;

import kotlinx.serialization.SerialName;
import kotlinx.serialization.Serializable;

@Serializable
public final class FixtureBody {
    @SerializedName("motion_enabled")
    private final boolean motionEnabled;
    private final long accountId;
    private final boolean trustDeviceEnabled;

    @SerialName("require_trust_client_device")
    public static void getTrustDeviceEnabled$annotations() {}
}
