package com.immediasemi.blink.test;

import kotlinx.serialization.Serializable;

@Serializable
public final class RegistrationRequest {
    private final String hardwareId;

    public RegistrationRequest(String hardwareId) {
        Intrinsics.checkNotNullParameter(hardwareId, "hardwareId");
        this.hardwareId = hardwareId;
    }
}
