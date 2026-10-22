# Live streaming and quality

This guide owns FFmpeg requirements, stream compatibility, quality and talkback
behavior. See [configuration](configuration.md) for settings and
[diagnostics](debug_logging_spec.md) for log policy.

## FFmpeg requirements

For the core HomeKit features (arm/disarm, motion, doorbell events, snapshots), no extra binaries are required. For **HomeKit live streaming**, install `ffmpeg` and make sure the **homebridge** user can execute it. Set `ffmpegPath` to the executable when it is outside PATH.

The selected executable's RTP SSRC option is checked during discovery, including when a video encoder is selected manually. Signed and unsigned muxer options receive equivalent representations of the same 32-bit stream identifier. This is an automatic runtime capability, not a saved setting or a version-based guess. If the bounded check fails or reports an unknown contract, live streaming is disabled for that runtime while discovery and core accessories continue. See the [SSRC compatibility audit](audits/2026-10-22-rtp-ssrc-compatibility.md) for evidence and reproduction.

Home may retain a previously advertised AAC-ELD offer after an encoder change. The plugin fingerprints each actual audio offer in HAP characteristic metadata and signals a normal configuration update when it changes, preserving accessory and stream identities. See the [capability-invalidation audit](audits/2026-10-22-audio-capability-invalidation.md). AAC-ELD requires verified `libfdk_aac` RTP output. The plugin probes a bounded dummy tone at 16/24 kHz with global codec headers before advertising AAC-ELD alongside Opus. It uses the negotiated codec and flushes each AAC access unit to avoid long packet batches. An executable without FDK AAC may refuse Home's AAC-ELD selection before requesting vendor media; inspect encoder capabilities rather than resetting pairing or disabling security checks. Runtime executables are operator-managed; the plugin does not download or install FFmpeg at startup.


## Encoding and transport

Live streaming converts Blink IMMIS/RTSPS media to HomeKit RTP/SRTP.

Set `videoEncoder` to `auto` for the safest default across mixed installations. On macOS it prefers
`h264_videotoolbox`, on Linux ARM boards such as Raspberry Pi it prefers `h264_v4l2m2m`, and it falls back
to `libx264` if the hardware encoder cannot be started.

> [!NOTE]
> The automatic encoder selection has been tested on a limited set of hardware (macOS with VideoToolbox and Raspberry Pi with V4L2). If you run into choppy streams, encoding errors, or unexpected fallback to software encoding on your platform, please [open an issue](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/new) with your hardware details and bounded streaming diagnostics (`ffmpegDebug: true`).

IMMIS live streams always verify the upstream TLS certificate and hostname, using
Node bundled public roots plus the official Blink vendor anchors only for IMMIS. The former
`verifyImmisTls` bypass is removed from the UI and ignored in existing configuration. IMMIS
admits only `immedia-semi.com` hosts or canonical public IPv4 authorities on port 443; a refused
endpoint disables that stream. Provider acceptance is bounded to the recorded real-device evidence; it is not
a universal destination-policy acceptance claim. Full RTSP destination control and secret-free FFmpeg execution
remain open security work. For stable 0.10.0, these are accepted, disclosed
residual risks under the [release disposition](plans/security-hardening.md#18-october-2026-delegated-stable-release-residual-risk-disposition),
not resolved vulnerabilities: users able to inspect FFmpeg process arguments on
the host may obtain session secrets, and enforcement of the intended policy for every RTSP secondary connection
is not yet verified. Existing runtime guards remain
mandatory. For diagnostic redaction and finite log allowances, see the
[logging specification](debug_logging_spec.md#streaming-diagnostics). Debug recordings are written under
`<debugStreamPath>/blink-stream-recordings/`, use hashed camera identifiers in filenames, and are
created with owner-only file permissions where the filesystem supports POSIX modes. Existing
recordings from older versions under `<debugStreamPath>/blink-stream-*.ts` are not moved or
re-permissioned automatically; delete them or migrate them into a private directory if they contain
sensitive footage.

### Two-way talk status

Two-way talk is temporarily disabled. The HomeKit microphone/talk UI is hidden and the plugin forces `twoWayAudio` off until IMMIS uplink framing is validated. Even if you previously enabled talkback, the setting is ignored for now. We will re-enable the UI once payload sequencing and ACK handling are confirmed stable.

### Software encoding on smaller hosts

`softwareEncodingPreset` defaults to `veryfast` (Balanced), preserving existing
quality behavior. The optional `ultrafast` (Low CPU) setting uses ultrafast for
libx264 and software fallback, plus Opus compression level 3. It reduces encoding
work at the cost of compression efficiency: at the same bitrate, video/audio
quality may decrease. Hardware video encoders retain their own settings; Opus
still uses the selected audio complexity. Select it through the existing Streaming settings after
installation and compare actual Home playback; no Pi configuration is changed
by publication. Pi5 uses software H.264 encoding. A compiled hardware encoder
name alone does not prove usable acceleration.

This option still transcodes video. Automatic H.264 passthrough is not enabled:
source codec/profile/level, dimensions, frame rate and bitrate must first be
verified against HomeKit negotiation. Audio conversion may remain necessary.

Audio is decoded from the source container and converted to the negotiated
HomeKit codec, sample rate, channels, bitrate and packet duration. Opus supports
10/20/40/60 ms packets. AAC-ELD is advertised only after a bounded local encoding
and RTP capability probe; when AAC-ELD is unavailable, it is not advertised. A controller selecting an
unavailable codec is refused rather than silently receiving another codec.
Video and audio use separate negotiated RTP/SRTP outputs. IMMIS retains the
initial probed keyframe, and video encoding uses a bitrate/VBV ceiling. Existing
private-pipe backpressure and bounded session cleanup still apply.

IMMIS streaming pauses vendor input while the private encoder pipe is backpressured and resumes after drain. Input/output ceilings and the two-second stall deadline remain enforced. Command liveness polling starts immediately and follows the vendor polling interval; its Continue-button timer does not control polling. Fixed authentication and first-media receipts distinguish a connected transport from delivered source media. Physical video/audio acceptance remains required for each installed RC.

### Input and output quality

Save settings through the [configuration workflow](configuration.md#via-homebridge-ui),
then check the output-profile and negotiated-format receipt after applying them.
Publication never changes a running host's settings.

`outputQuality` applies to every camera's HomeKit video output. Default `auto`
preserves the current capabilities and lets Home choose. Optional `720p15`
(1280×720 with a 15-fps encoding ceiling), `360p15` (640×360 with a 15-fps
ceiling), and `1080p30` (1920×1080/30) retain the 320×240/15 fallback.
The low-frame-rate profiles also accept a 30-fps selection at their advertised
dimensions, while encoding at no more than 15 fps. This follows the maintained
[Homebridge camera-ffmpeg frame-rate limiting approach](https://github.com/homebridge-plugins/homebridge-camera-ffmpeg/blob/latest/src/streamingDelegate.ts).
Dimensions remain exactly selected; unsupported dimensions still fail before
vendor media work. Output receipts distinguish requested and effective FPS.
Lower resolution/frame rate reduces encoding work, but improved Pi playback is
not established until measured on the installed release. 1080p/30 increases work.
Audio remains independently negotiated and transcoded, including Opus/AAC-ELD
packet duration, sample rate and separate RTP/SRTP packaging. Software encoding
preset and bitrate remain separate controls.

Input quality is **per camera only**, under `deviceSettingOverrides`:

```json
{
  "outputQuality": "720p15",
  "deviceSettingOverrides": [
    { "deviceIdentifier": "CAMERA_SERIAL", "inputQuality": "auto" }
  ]
}
```

`inputQuality: auto` preserves the camera's current Blink quality; it sends no
settings write. On first live startup, the plugin remembers the first parseable
vendor quality and actual input video dimensions/frame rate in Homebridge's
accessory cache. These observations are separate from configured policy and
model maximum capability. Missing metadata does not invent an input resolution
or prevent automatic streaming. Compressed input is demuxed at its real format.

Explicit `saver`, `standard` or `best` selects Blink's persistent camera setting
before liveview, with supported/restricted values checked and confirmed readback.
**This also changes recording quality in the Blink app.** Existing settings are
not restored when returning to `auto`; restore the desired quality explicitly in
the plugin or Blink app. Failed/unconfirmed changes prevent that stream start;
ambiguous writes are not replayed. Save settings and restart through Homebridge's
normal operator workflow; publication does not change the live host.

2K is model-dependent. [Mini 2K+](https://support.blinkforhome.com/en_US/faq-mini-2k/mini-2k-faq)
Best is 2560×1440/24; the [newer doorbells](https://support.blinkforhome.com/en_US/wired-doorbell-2k-plus-faq/blink-wired-doorbell-2k-faq)
use square video. The pipeline accepts actual 2560×1440 and 1920×1920 input and
converts to negotiated output while preserving aspect ratio with padding.
No universal 2K override or unsupported resolution request is sent. Camera model,
firmware and subscription may restrict upstream quality. Synthetic 2K conversion
and mocked config contracts do not establish physical 2K-camera acceptance.
