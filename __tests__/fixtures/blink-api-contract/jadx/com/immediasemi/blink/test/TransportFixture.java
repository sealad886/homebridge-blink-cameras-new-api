package com.immediasemi.blink.test;

public final class TransportFixture {
    private static final String STREAM = "rtsps://stream.example.invalid/session";
    private static final String SIGNAL = "wss://signal.example.invalid/socket";

    Object connect(OkHttpClient client, Request request) {
        String rewritten = request.url().toString().replace("{tier}", "prod");
        return client.newWebSocket(request.newBuilder().url(rewritten).build(), listener);
    }
}
