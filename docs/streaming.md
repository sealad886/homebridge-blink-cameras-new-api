# Live streaming and quality

Last reviewed: 26 October 2026. Secure runtime implementation is under review;
beta publication remains blocked until its security and release gates pass.

This guide owns packaged codec requirements, transport, quality and talkback.
See [configuration](configuration.md) for saving settings and
[diagnostics](debug_logging_spec.md) for the logging policy.

## Packaged codec requirements

Core HomeKit features and live streaming use the installed npm package. Streaming
requires its matching, hash-verified private worker for Linux x64/arm64, macOS
x64/arm64 or Windows x64. Missing, unsupported or modified workers refuse streaming
before requesting vendor media. There is no startup download or executable-path
fallback. Final tested OS baselines and package evidence belong in the
[release guide](RELEASE.md); source compilation does not establish them.

The worker directly calls pinned codec libraries through private pipes. Session
URLs, credentials and SRTP keys are never worker command-line options or environment
variables. The parent owns vendor TLS and HomeKit output sockets. Keys and media
still exist in process memory; this does not isolate a compromised Homebridge host.

Audio supports mono Opus at 16/24 kHz, PCMA and PCMU at 8 kHz. Opus uses
10/20/40/60 ms packets and a 48 kHz RTP clock. AAC-ELD is removed from the offer;
a controller retaining an old selection is refused before vendor allocation.
The normal HAP configuration update advertises changed capabilities while
preserving accessory identities. Do not reset pairing to recover a refused codec.

### Upgrade configuration

Retired settings fail validation with migration guidance: `ffmpegPath`,
`ffmpegDebug`, `rtpSsrcMode`, `rtspTransport`, `verifyImmisTls`, `twoWayAudio`,
`videoEncoder`. `audioCodec: aac-eld` also needs migration.
The private worker uses software x264; hardware encoder selection is removed.

Before the operator restarts Homebridge, run the installed migration script against
an explicit configuration path on a POSIX host:

```sh
node /absolute/plugin/path/scripts/migrate-secure-media-config.cjs /absolute/homebridge/config.json
```

It writes an owner-only backup beside the file before replacing it atomically,
removes retired Blink settings, maps AAC-ELD to Opus and renames `ffmpegDebug` to
`mediaDebug`. An existing `mediaDebug` value wins. It also removes legacy nested
`audio.aacEldEncoder`, `audio.twoWay` and `video.encoder` fields, and maps nested
`audio.codec: aac-eld` to Opus when present. It preserves other platforms.
Keep the backup private: it contains the original configuration. Windows operators
must back up their configuration using their normal private storage and remove the
listed keys manually; the script refuses hosts without POSIX permission semantics.
Publication does not run this script or restart an installed bridge.

## Encoding and transport

Live streaming converts H.264/AAC or AAC-LATM in owned MPEG-TS input into negotiated
H.264 plus optional supported audio. Video preserves aspect ratio with black padding,
uses the negotiated profile/level and bitrate ceiling, and selects source frames at
no more than the output FPS. Slower sources are not duplicated.

IMMIS admits the checked public `immedia-semi.com` family or canonical public IPv4
on TLS port 443. The owned RTSPS broker admits the same family on port 332 and
requires the source-backed `blinkRTSP=true`/`1` TCP-interleaved MPEG-TS flow.
It refuses redirects, UDP transport, unapproved control/SDP authorities and other
RTSP flows. Every numeric connection candidate and reconnect receives fresh policy
checks; TLS verification retains the original server identity. The shared vendor
trust anchors apply only to these media transports. No setting bypasses TLS.
Provider endpoint completeness and physical playback remain operator acceptance;
synthetic protocol tests do not prove every live camera is supported.

Queues, input/output byte ceilings, consumption credits, independent STOP and
bounded cleanup remain enforced. A retiring generation keeps its ports reserved
until actual worker/socket closure. Command polling starts immediately and follows
the vendor interval independently of Continue timing.

`mediaDebug` enables bounded, redacted diagnostics. IMMIS debug recordings remain
under `<debugStreamPath>/blink-stream-recordings/`, with hashed camera identifiers
and owner-only POSIX permissions. They contain sensitive footage. Older recordings
are not moved or re-permissioned automatically. RTSPS debug recording is not
implemented. See the [logging specification](debug_logging_spec.md#streaming-diagnostics).

### Two-way talk status

Talkback remains disabled and the HomeKit microphone UI stays hidden. Removed
`twoWayAudio` settings need migration; the secure runtime does not implement uplink.

### Software encoding on smaller hosts

`softwareEncodingPreset` defaults to `veryfast` (Balanced). Optional `ultrafast`
(Low CPU) selects x264 ultrafast and Opus compression level 3. Reduced compression
work can reduce quality at the same bitrate. Compare actual Home playback on the
same host and settings after operator installation. Automatic H.264 passthrough
is not enabled. Resource and latency acceptance require matched measurements;
passing codec tests alone does not prove real-time performance.

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
Lower resolution/frame rate reduces encoding work, but improved playback is
not established until measured on the installed release. 1080p/30 increases work.
Audio remains independently negotiated and transcoded, including Opus
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
