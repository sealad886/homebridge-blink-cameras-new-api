# RTP SSRC compatibility — 22 October 2026

## Observed failure and cause

Installed RC.18 source `d72346e952d74adb4d6a8ca4af2f52e64585b6d1` selects Opus with the unchanged operator-managed Homebrew FFmpeg 8.1.3 binary. Eight Home encoder starts establish TLS and receive source media, then fail at RTP header initialization. The plugin unconditionally converts upper-half uint32 SSRC values into negative numbers; the actual binary declares an unsigned RTP SSRC option. One captured failure includes 4254621614 converted to -40345682. Opus negotiation is a separate, verified boundary; this is not evidence of an outage or WiFi cause.

The package's existing ffmpeg-for-homebridge 2.1.7 binary declares a signed option, whereas the tested local and Pi Homebrew binaries declare unsigned. Upstream [n8.0 RTP muxer source](https://github.com/FFmpeg/FFmpeg/blob/n8.0/libavformat/rtpenc.c) also uses the signed option type. [FFmpeg 8.0 API documentation](https://ffmpeg.org/doxygen/8.0/rtpenc_8c_source.html) confirms the muxer behavior. The binary's actual contract is authoritative; neither a guessed version threshold nor blindly removing the conversion covers both supported executables.

## Correction and ownership

Extend the existing encoder-probe owner with a media-free `-hide_banner -h muxer=rtp` capability check of the selected path. Bound execution to five seconds, force termination on timeout, and bound stdout/stderr separately to 64 KiB. Accept only a recognized SSRC option type and full signed/unsigned 32-bit range; discard raw help/errors. This probe runs before camera controller creation even with a manual video encoder. The resolved signed/unsigned mode is internal and never persisted or exposed as a user setting. Unknown/failed checks disable only live streaming for that runtime, with a fixed warning, while discovery/core accessories continue.

The shared video/audio formatter preserves every SSRC bit: unsigned mode emits the positive uint32 decimal; signed mode emits its equivalent two's-complement decimal. It does not mask to 31 bits, replace the HomeKit preparation value, change RTP/SRTP identity, or retry an ambiguous vendor operation. Existing pairing, negotiated audio, quality, bitrate, lifecycle and security guards are unchanged. No binary download, replacement or Pi configuration migration is required.

## Verification and limitations

Behavioral RED first reproduces both uint32 boundary failures and the actual captured value through the existing output builder. Signed/unsigned tests cover video/audio at INT32_MAX, INT32_MAX+1, UINT32_MAX and the observed pair. Probe tests cover executable choice, bounds, failed/overflowed/malformed results and manual-encoder discovery integration.

The canonical `scripts/media-pipeline-smoke.cjs` owner now checks boundary SSRC values in received video/audio RTP packet headers. Default mode retains full codec/quality packaging coverage and adds four boundary cases. Focused `--ssrc-only` mode permits the same checks with a binary lacking FDK AAC:

```sh
npm run build
node scripts/media-pipeline-smoke.cjs --ssrc-only
BLINK_MEDIA_FFMPEG_PATH=/path/to/selected/ffmpeg node scripts/media-pipeline-smoke.cjs --ssrc-only
```

`BLINK_MEDIA_FFMPEG_PATH` is test-driver input only. No runtime environment setting is added. Local signed and unsigned binaries pass all four boundary cases. A separate bounded stdin-only synthetic driver executes locally generated corrected output arguments with the unchanged Pi Homebrew binary. Four loopback H264/Opus runs exit 0 and preserve the expected RTP identifiers, including the original captured pair. No host files, Homebridge configuration, live provider media or installed plugin files are written. The retained receipt is `logs/rc19-development-2026-10-22/pi-rtp-proof.json`; release receipts own final CI/review/artifact evidence.

These checks establish argument compatibility and synthetic packet identity, not audible Home playback, smoothness, CPU savings, full lifecycle/resource acceptance or F05/F06 closure. Operator installation and new live video/audio, STOP/reopen, fresh snapshot/reset and attributable observation remain required. Keep the Homebrew binary and Pi settings unchanged during delivery. Roll back using a verified artifact or disable streaming; do not restore TLS bypass or unauthenticated transport.
