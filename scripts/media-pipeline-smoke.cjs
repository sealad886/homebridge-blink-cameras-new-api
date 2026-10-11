// Synthetic MPEG-TS -> video/audio SRTP smoke test. Loopback only; dummy keys.
// Verifies RTP headers and authenticated AAC AU framing, not physical HomeKit playback.
const { spawn, spawnSync } = require("child_process");
const dgram = require("dgram");
const { createCipheriv, createHmac, timingSafeEqual } = require("crypto");
const { BlinkCameraSource } = require("../dist/accessories/camera-source");
const { probeAacEldEncoder } = require("../dist/accessories/encoder-probe");
const hap = require("hap-nodejs");
const ffmpegPath = require("ffmpeg-for-homebridge");

// Test-only AES-CM/HMAC-SHA1-80 receiver for known dummy keys. RFC3711
// sections4.1.1/4.2/4.3, and RFC3640 AAC-hbr AU headers (13-bit size/3-bit index).
// Loopback sender uses a fixed 12-byte RTP header; no CSRC/extension/padding.
function aacReceiver(master) {
    const derive = (label, length) => {
        const iv = Buffer.alloc(16);
        master.copy(iv, 0, 16, 30);
        iv[7] ^= label;
        return createCipheriv("aes-128-ctr", master.subarray(0, 16), iv)
            .update(Buffer.alloc(length));
    };
    const encryptionKey = derive(0, 16), authenticationKey = derive(1, 20), salt = derive(2, 14);
    let previousSequence, rollover = 0;
    return (packet) => {
        if (packet.length < 26 || packet[0] !== 0x80)
            throw Error("unexpected AAC SRTP packet layout");
        const sequence = packet.readUInt16BE(2);
        if (previousSequence !== undefined) {
            if (((sequence - previousSequence) & 0xffff) !== 1)
                throw Error("AAC SRTP packet sequence gap");
            if (sequence < previousSequence) rollover++;
        }
        previousSequence = sequence;
        const roc = Buffer.alloc(4);
        roc.writeUInt32BE(rollover);
        const authenticated = packet.subarray(0, -10);
        const tag = createHmac("sha1", authenticationKey).update(authenticated).update(roc).digest().subarray(0, 10);
        if (!timingSafeEqual(tag, packet.subarray(-10)))
            throw Error("AAC SRTP authentication failed");
        const iv = Buffer.alloc(16), index = Buffer.alloc(16);
        salt.copy(iv);
        packet.copy(index, 4, 8, 12); // SSRC * 2^64
        index.writeUInt32BE(rollover, 8);
        index.writeUInt16BE(sequence, 12); // packet index * 2^16
        for (let i = 0; i < 16; i++) iv[i] ^= index[i];
        const payload = createCipheriv("aes-128-ctr", encryptionKey, iv).update(authenticated.subarray(12));
        // Exactly one complete AU per packet, with no AAC codec decode claim.
        if (payload.length < 5 || payload.readUInt16BE(0) !== 16 ||
            (payload.readUInt16BE(2) & 7) !== 0 ||
            (payload.readUInt16BE(2) >>> 3) !== payload.length - 4)
            throw Error("AAC RTP access-unit framing mismatch");
    };
}

function generateInput(audioEnabled) {
    const args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=640x360:rate=15",
    ];
    if (audioEnabled)
        args.push("-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000");
    args.push("-t", "8", "-c:v", "libx264", "-preset", "ultrafast");
    if (audioEnabled) args.push("-c:a", "aac");
    args.push("-f", "mpegts", "pipe:1");
    const input = spawnSync(ffmpegPath, args, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 10000,
    });
    if (input.error || input.status !== 0 || !input.stdout.length)
        throw Error("synthetic input generation failed");
    return input.stdout;
}

async function runCase(input, preset, duration, audioEnabled, codec = "opus", sampleRate = 24) {
    const sinks = [dgram.createSocket("udp4"), dgram.createSocket("udp4")];
    const counts = [0, 0],
        times = [[], []],
        maxBytes = [0, 0];
    let packetError;
    const receiveAac = codec === "aac-eld" ? aacReceiver(Buffer.alloc(30, 2)) : null;
    let authenticatedAacPackets = 0;
    let child;
    let timer;
    try {
        await Promise.all(
            sinks.map(
                (s) =>
                    new Promise((resolve, reject) => {
                        s.once("error", reject);
                        s.bind(0, "127.0.0.1", resolve);
                    }),
            ),
        );
        sinks.forEach((s, i) =>
            s.on("message", (b) => {
                // RTCP may share the sink; only RTP's negotiated payload type is counted.
                if (b.length < 12 || b[0] >> 6 !== 2) {
                    packetError = "invalid RTP header";
                    return;
                }
                if ((b[1] & 127) !== [99, 110][i]) return;
                if (b.readUInt32BE(8) !== [1234, 5678][i])
                    packetError = "unexpected RTP SSRC";
                if (b.length > 1378)
                    packetError = "RTP packet exceeded negotiated MTU";
                if (i === 1 && receiveAac) {
                    try {
                        receiveAac(b);
                        authenticatedAacPackets++;
                    } catch (error) { packetError = error.message; }
                }
                counts[i]++;
                maxBytes[i] = Math.max(maxBytes[i], b.length);
                times[i].push(b.readUInt32BE(4));
            }),
        );
        const source = new BlinkCameraSource(
            {},
            hap,
            1,
            2,
            "camera",
            "DUMMY",
            () => {},
            () => true,
            () => {},
            {
                video: { encoder: "libx264", softwarePreset: preset },
                audio: { enabled: audioEnabled, codec,
                    ...(codec === "aac-eld" ? { aacEldEncoder: "libfdk_aac" } : {}) },
            },
        );
        const session = {
            address: "127.0.0.1",
            addressVersion: "ipv4",
            videoPort: sinks[0].address().port,
            localVideoPort: 0,
            localVideoRtcpPort: 0,
            videoCryptoSuite: 0,
            videoSRTP: Buffer.alloc(30, 1),
            videoSSRC: 1234,
            audioPort: sinks[1].address().port,
            localAudioPort: 0,
            localAudioRtcpPort: 0,
            audioCryptoSuite: 0,
            audioSRTP: Buffer.alloc(30, 2),
            audioSSRC: 5678,
        };
        const request = {
            video: {
                fps: 15,
                width: 640,
                height: 360,
                max_bit_rate: 300,
                profile: 0,
                level: 0,
                pt: 99,
                mtu: 1378,
            },
            audio: {
                codec: codec === "aac-eld" ? hap.AudioStreamingCodecType.AAC_ELD : hap.AudioStreamingCodecType.OPUS,
                channel: 1,
                sample_rate: sampleRate,
                max_bit_rate: 24,
                packet_time: duration,
                pt: 110,
            },
        };
        const start = Date.now();
        let timedOut = false;
        let inputError = false;
        child = spawn(
            ffmpegPath,
            source.buildFfmpegArgs("pipe:0", request, session),
            { stdio: ["pipe", "ignore", "pipe"] },
        );
        // Avoid printing dummy argv or codec diagnostics; report bounded reason codes only.
        child.stderr.resume();
        child.stdin.on("error", () => {
            inputError = true;
        });
        const completion = new Promise((resolve, reject) => {
            child.once("error", () =>
                reject(Error("transcoder launch failed")),
            );
            child.once("close", (code, signal) => resolve({ code, signal }));
        });
        timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
        }, 15000);
        child.stdin.end(input);
        const { code, signal } = await completion;
        clearTimeout(timer);
        // Allow already queued loopback datagrams to reach receiver callbacks.
        await new Promise((resolve) => setTimeout(resolve, 50));
        const steps = times[1].slice(1).map((t, i) => (t - times[1][i]) >>> 0);
        if (timedOut || code !== 0 || signal || inputError)
            throw Error("transcoder failed or exceeded deadline");
        if (packetError) throw Error(packetError);
        if (
            !counts[0] ||
            (audioEnabled && !counts[1]) ||
            (!audioEnabled && counts[1])
        )
            throw Error("expected RTP output missing or unexpected audio");
        if (
            audioEnabled && codec === "opus" &&
            (!steps.length || steps.some((step) => step !== duration * 48))
        )
            throw Error("Opus RTP timestamp cadence mismatch");
        if (audioEnabled && codec === "aac-eld" &&
            (!steps.length || steps.some((step) => step !== 512)))
            throw Error("AAC-ELD RTP must flush each 512-sample frame without aggregation delay");
        return {
            preset,
            codec: audioEnabled ? codec : null,
            sample_rate_khz: audioEnabled ? sampleRate : null,
            duration: audioEnabled && codec === "opus" ? duration : null,
            audio_enabled: audioEnabled,
            code,
            counts,
            max_packet_bytes: maxBytes,
            wall_ms: Date.now() - start,
            audio_timestamp_step: audioEnabled ? steps[0] : null,
            authenticated_aac_packets: authenticatedAacPackets,
        };
    } finally {
        clearTimeout(timer);
        if (child && child.exitCode === null && child.signalCode === null)
            child.kill("SIGKILL");
        sinks.forEach((s) => {
            try {
                s.close();
            } catch {}
        });
    }
}

(async () => {
    if (typeof ffmpegPath !== "string")
        throw Error("installed packaged FFmpeg is unavailable");
    if (!await probeAacEldEncoder(ffmpegPath))
        throw Error("packaged FFmpeg AAC-ELD capability probe failed");
    const audioInput = generateInput(true);
    const results = [];
    for (const preset of ["veryfast", "ultrafast"]) {
        for (const duration of [20, 40])
            results.push(await runCase(audioInput, preset, duration, true));
        for (const sampleRate of [16, 24])
            results.push(await runCase(audioInput, preset, 20, true, "aac-eld", sampleRate));
    }
    results.push(await runCase(generateInput(false), "veryfast", 20, false));
    console.log(JSON.stringify(results, null, 2));
})().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
