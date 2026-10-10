// Synthetic MPEG-TS -> video/audio SRTP smoke test. Loopback only; dummy keys.
// Verifies visible RTP headers, not payload decryption or physical HomeKit playback.
const { spawn, spawnSync } = require("child_process");
const dgram = require("dgram");
const { BlinkCameraSource } = require("../dist/accessories/camera-source");
const hap = require("hap-nodejs");

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
    const input = spawnSync("ffmpeg", args, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 10000,
    });
    if (input.error || input.status !== 0 || !input.stdout.length)
        throw Error("synthetic input generation failed");
    return input.stdout;
}

async function runCase(input, preset, duration, audioEnabled) {
    const sinks = [dgram.createSocket("udp4"), dgram.createSocket("udp4")];
    const counts = [0, 0],
        times = [[], []],
        maxBytes = [0, 0];
    let packetError;
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
                audio: { enabled: audioEnabled },
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
                codec: hap.AudioStreamingCodecType.OPUS,
                channel: 1,
                sample_rate: hap.AudioStreamingSamplerate.KHZ_24,
                max_bit_rate: 24,
                packet_time: duration,
                pt: 110,
            },
        };
        const start = Date.now();
        let timedOut = false;
        let inputError = false;
        child = spawn(
            "ffmpeg",
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
            audioEnabled &&
            (!steps.length || steps.some((step) => step !== duration * 48))
        )
            throw Error("Opus RTP timestamp cadence mismatch");
        return {
            preset,
            duration: audioEnabled ? duration : null,
            audio_enabled: audioEnabled,
            code,
            counts,
            max_packet_bytes: maxBytes,
            wall_ms: Date.now() - start,
            audio_timestamp_step: audioEnabled ? steps[0] : null,
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
    const audioInput = generateInput(true);
    const results = [];
    for (const preset of ["veryfast", "ultrafast"]) {
        for (const duration of [20, 40])
            results.push(await runCase(audioInput, preset, duration, true));
    }
    results.push(await runCase(generateInput(false), "veryfast", 20, false));
    console.log(JSON.stringify(results, null, 2));
})().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
