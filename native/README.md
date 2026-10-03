# Codec-only private-pipe prototype

This is a bounded prototype for the approved owned-vendor-transport architecture. It accepts H.264 video in MPEG-TS through standard input and emits length-framed H.264 and configured audio packets through standard output. Supported optional audio outputs are mono Opus at 16/24 kHz and PCMA/PCMU at 8 kHz. AAC-ELD fails closed because the pinned native AAC encoder rejects that profile. Maintained libsrtp 2.8.1 protects parent-provided RTP/RTCP packets through private IPC. No vendor URL, TLS operation, socket output, filesystem media/configuration, FFmpeg CLI, or provider connection is implemented. The parent retains vendor networking and will eventually own HomeKit transport. This directory does not integrate or enable a worker in the plugin.

Verified scope: macOS arm64, installed FFmpeg 9.0.2 public libraries with libx264. Linux arm64/x64, macOS x64, Windows x64, Windows 11/macOS 13/Ubuntu 22.04 baselines, distribution and physical camera acceptance remain unverified. Win32/POSIX thread adapters are source only on untested targets.

## Build and checks

```sh
make -C native FFMPEG_PREFIX=/absolute/pinned/ffmpeg-9.0.2 SRTP_PREFIX=/absolute/verified/libsrtp-2.8.1
make -C native test FFMPEG_PREFIX=/absolute/pinned/ffmpeg-9.0.2 SRTP_PREFIX=/absolute/verified/libsrtp-2.8.1
```

`FFMPEG_PREFIX` and `SRTP_PREFIX` are required; no dependency installation or implicit prefix discovery occurs. `PYTHON` defaults to the existing repository `.venv/bin/python` and can be supplied explicitly for a target test environment. `PKG_CONFIG_LIBDIR` explicitly selects that prefix; unqualified Homebrew pkg-config currently resolves FFmpeg 4. Compiler uses C11, warnings as errors, and public libavformat/libavcodec/libavutil/libswscale/libswresample. `PKG_CONFIG_FLAGS` defaults to `--static` to include the declared static dependency closure. The libsrtp archive is linked explicitly. POSIX builds use pthreads because the installed macOS compiler has no C11 `threads.h`; Windows uses Win32 threads/condition variables and binary stdin/stdout. Windows requires a target toolchain and supplied pkg-config files; the Makefile does not produce or prove a clean Windows distribution.

The worker accepts no command-line options. Start with executable argv only, private piped stdin/stdout/stderr, and a scrubbed environment. Runtime rejects libavformat/libavcodec versions other than 63.1.102 and libavutil other than 61.1.102. This prevents observed major-version drift, but exact artifact/source/dependency identity still needs distribution receipts. The current worker statically links the verified local FFmpeg/Opus/x264/libsrtp archives and dynamically links only Apple system libraries/frameworks. This is local evidence, not a five-target distribution artifact.

## Protocol version 1

All integers are big-endian. Input frame header: ASCII `BMI1`, u32 type, u32 payload length. Output header substitutes `BMO1`. Partial I/O is accumulated; partial header/body at EOF is fatal. Every input payload is capped at 65,536 bytes. Unknown type, duplicate CONFIG, media before CONFIG, media after END, invalid lengths or unknown reserved fields are fatal.

| Input type | Payload |
|---|---|
| 1 CONFIG | Ten u32: width, height, fps, bitrate, maximum decoded video frames, reserved zero, audio codec, audio rate, audio channels, audio bitrate |
| 2 MEDIA | Nonempty fragment of the owned MPEG-TS byte stream; input frame boundaries need not align with TS packets |
| 3 END | Empty; declares media EOF. Protection remains available after codec END; parent closes stdin after final protection replies or sends STOP |
| 4 STOP | Empty; allowed before CONFIG and after END, terminates process immediately |

CONFIG allows even dimensions 2..1920 by 2..1080, fps 1..30, video bitrate 20,000..4,000,000, and maximum video frames 1..9000. Audio codec enum: 0 disabled (all audio fields zero), 1 Opus (rate 16000 or 24000), 2 PCMA/3 PCMU (rate 8000). Enabled audio requires one channel and bitrate 8000..128000. PCM wire bitrate is fixed by codec/rate; configured bitrate does not change that. Enum 4 AAC-ELD is rejected rather than substituted with AAC-LC.

Only first H.264 video and optional first AAC/AAC-LATM audio stream are processed. Missing optional audio produces no invented stream or packet. Video PTS/DTS and audio timing use the original shared MPEG-TS timestamp domain, reported as signed microseconds. Audio resampling and encoder initial/discard padding are explicit. No timeline normalization independently resets streams to zero. Video fps is an encoder hint: rate conversion/duplication/drop behavior is not implemented. Source timestamp discontinuity beyond 2 ms in audio fails closed; broad real-provider jitter/wrap/reorder calibration remains pending.

| Output type | Payload |
|---|---|
| 1 STATUS | u32 protocol version 1, u32 output fps |
| 2 PACKET | i64 PTS/DTS/duration in microseconds, u32 owned keyframe flag, u32 stream ID 1, u32 timebase numerator 1, u32 denominator 1000000, u32 skip-start/end samples, then encoded Annex-B H.264 bytes |
| 4 AUDIO PACKET | Same 48-byte metadata as video, stream ID 2, then encoded audio bytes |
| 5 AUDIO INFO | u32 codec/rate/channels/initial-padding/extradata-size, followed by bounded codec extradata |
| 3 END | Empty; emitted only after successful media EOF and decoder/encoder draining |

Only owned keyframe flag 1 is emitted; other library flags are withheld. Every complete output frame, including header and metadata, is at most 1 MiB. Audio skip/padding values are sample counts in configured audio sample rate. Opus RTP clock remains 48 kHz independently of configured encoder input rate; a later RTP layer must perform explicit clock conversion. Audio extradata is at most 4096 bytes. Parent must cap header lengths before allocation, retain complete frame boundaries, and route packet data into a maintained RTP/SRTP implementation. No claim that private IPC alone resolves SRTP output secret handling.

STOP executes `_Exit(0)` in the input reader thread, independent of synchronous codec work, a stalled media reader, or a blocked stdout consumer. It intentionally does not flush codec/output queues or emit END. Parent must discard partial output and confirm process/pipe closure before retiring its generation. Fatal malformed framing and queue overflow similarly exit with status 2. Ordinary EOF without END is fatal. Clean media END drains codec output; with incomplete TS payload, EOF acceptance remains subject to decoder parsing rather than byte-exact container integrity.

## Bounds and trust boundary

Media queue: fixed 1 MiB ring; overfill is fatal, not an unbounded backlog. Input message: 64 KiB. Lifetime media input: 128 MiB; encoded output: 64 MiB. Decoded frame dimensions: maximum 1920x1080, decoder `max_pixels` set and checked again on delivered frames. Demuxer streams: at most eight; MPEG-TS packet option: 256 KiB; resynchronization scan: 64 KiB. These are prototype limits requiring valid-traffic calibration. Audio input: 8..48 kHz, at most two channels and 8192 samples per decoded frame; two-second mono output FIFO, 32768 converted samples per batch and 300 seconds lifetime audio sample budget. Source rate/format/channel-count changes fail closed. One decoder/encoder thread per codec. Input/config wait timeout: 15 seconds; output queue: 1 MiB including the in-flight writer frame, independent two-second oldest-frame watchdog; process watchdog: 300 seconds. Frames: configured cap, maximum 9000.

The reader does not wait for queue space, so STOP remains readable until a protocol violation or overflow ends the process. An integrated parent needs bounded backpressure/credit flow to avoid treating normal bursts as overflow; this prototype supplies no transport credit protocol. Decoder/demuxer internal allocations are not measured RSS ceilings, and a separate process is not an OS sandbox. Missing MPEG-TS demuxer fails closed rather than falling back to auto-probing. An empty protocol allowlist and rejecting `io_open` callback deny secondary public library I/O. Explicit MPEG-TS format allowlist and memory AVIO avoid URL/protocol input selection; no RTSP or general libav URL-opening entrypoint is exposed.

Libav logging is discarded and own diagnostics use fixed codes, with no input interpolation. This is source-backed narrowing, not completed F05 proof: the SRTP INIT key buffer is explicitly erased after library initialization, but library-owned key memory is reclaimed on process exit without a completed crash-dump/zeroization proof. Real vendor credentials, parent environment and talkback remain untested. F06 remains a parent-owned transport gate, including DNS/redirect/reconnect/SDP/control/secondary endpoints and original TLS identity.

## Local evidence

`make -C native FFMPEG_PREFIX=<verified prefix> SRTP_PREFIX=<verified prefix> test`: nineteen behavioral tests passed on macOS arm64. Tests include valid fragmented MPEG-TS, complete framed packet EOF, malformed/partial input, invalid config and duplicate config, frame budget, media-free failure, STOP before config/during media wait/with stdout unread, and withheld secret-like malformed payload. Native fixture generator and independent H.264 output checker use public libraries, without FFmpeg CLI. The checker decodes four output frames and validates dimensions/pixels; audio tests decode audible output for each supported codec/rate, preserve the fixture source offset and reject unsupported audio config/discontinuity. The capability executable demonstrates native AAC-ELD open failure (-22) rather than mislabeling AAC-LC.

The stdout-stall STOP test sends repeated fixture media without consuming stdout; it demonstrates prompt process exit in that scenario, but does not prove an exact queue/RSS high-water measurement. Exact queue overflow, long watchdog, multi-platform launch, real-media calibration, provider-valid synchronized audio, broader SRTP wire parity and physical integrated STOP acceptance remain follow-up gates.

## License and source distribution

Worker and fixture/checker sources are `GPL-3.0-or-later`, with GPLv3 text in `COPYING`. Linking the selected FFmpeg/libx264 GPL configuration prevents treating this worker as an LGPL-only binary. Do not publish binaries until the exact license/dependency inventory, notices and corresponding source/build inputs are provided for every target. The local recipe and verified dependency-source manifest establish actual build inputs; complete corresponding-source distribution and target-specific notices remain release gates.

Public API references: [FFmpeg custom AVIO](https://ffmpeg.org/doxygen/trunk/structAVIOContext.html), [codec send/receive](https://ffmpeg.org/doxygen/trunk/group__lavc__encdec.html), [FFmpeg license](https://ffmpeg.org/legal.html). Installed 9.0.2 headers/source are authoritative for this local prototype; current documentation alone does not prove version or runtime portability.

## Private protection messages

Input 10 INIT is 42 bytes: u32 stream ID (1 video / 2 audio), u32 SSRC, u32 suite 1 (AES128-CM/HMAC-SHA1-80), then 16-byte master key and 14-byte salt. Each stream initializes once; unsupported suites, zero SSRC and duplicate initialization are fatal. Output 10 acknowledges with the four-byte stream ID. Input 11 PROTECT_RTP or 12 PROTECT_RTCP carries u32 nonzero request ID, u32 stream ID, then at most 2048 plaintext bytes. Output uses the same type and echoes both IDs followed by protected bytes (RTP <=2058, RTCP <=2062). Requests must name an initialized stream and match its SSRC. Parent owns correlation uniqueness, RTP/RTCP semantics and endpoint authorization; the worker opens no socket. Library replay/nonce safeguards remain enabled.

The reader performs bounded protection work and only enqueues output; a separate writer owns stdout. Queue overflow is fatal and a watchdog exits after two seconds without draining the oldest frame. STOP remains independent of both writer and codec. Codec END emits output END but keeps the protection reader available. After codec completion, fifteen seconds without reader activity is fatal; the lifetime watchdog still caps the process at 300 seconds. Protection requests reset the final idle wait. Clean input EOF after media END stops acceptance, deallocates SRTP sessions and drains queued replies before process exit. STOP exits immediately. The post-END protection/STOP test establishes that final encoded packets can still be protected; full production generation teardown ordering remains a gate.

The [published pinned libsrtp `srtp_validate` RTP and SRTCP ciphertext vectors](https://github.com/cisco/libsrtp/blob/6ff02afa8d2dc3f2e8896af391d137c1c66ff6fa/test/srtp_driver.c#L1862) are matched through the actual worker pipe, including correlated IDs. The tests also reject uninitialized/mismatched/duplicate sessions and establish the stdout deadline. Source/license evidence for the linked archive comes from the independently verified dependency build receipt. `dependencies/licenses/libsrtp-LICENSE` preserves its actual source notice; full transitive distribution closure remains pending.

The final local verification uses the same verified source-built static prefix for worker, fixture, checker and capability probe. That prefix includes Opus/PCMA/PCMU decoders for output verification; the worker still accepts only explicitly selected H264/AAC input. `CHECKER_FFMPEG_PREFIX` permits an independently built verifier when necessary, but the final receipt uses its default shared prefix.

Before reading private configuration, POSIX builds set and verify the worker's own `RLIMIT_CORE` soft/hard limits to zero, failing closed if suppression fails. Windows sets process error mode to suppress critical-error/fault dialogs; this is not a proof that Windows Error Reporting or configured dump collectors cannot capture memory. No host crash policy is changed. The local dummy-key test inspects the child argv/environment via `ps`, checks initialization replies and fixed malformed-frame diagnostics, and verifies key bytes are absent. It does not trigger a secret-bearing crash or claim protection from privileged debuggers, external collectors or parent-side dumps. Graceful input EOF deallocates library sessions; immediate STOP relies on process memory reclamation for library-owned secrets, while the INIT stack key buffer is explicitly erased after successful library initialization.
