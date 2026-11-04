# Private-pipe media worker

See the [documentation map](../docs/README.md) for scope and navigation.
Last reviewed: 4 November 2026.

This source extends the codec-only worker shipped in the `0.11.0-beta.0` secure media runtime. It
accepts H.264 plus optional AAC/AAC-LATM in MPEG-TS, or finite H.264/AAC MP4 for recording, through private stdin and emits
bounded H.264/Opus/PCMA/PCMU packets or H.264/AAC-LC fragmented MP4 through framed stdout. Maintained libsrtp
2.8.1 protects parent-provided RTP/RTCP through the same private protocol. The
parent owns verified vendor TLS, paired-controller sockets and generation lifetime;
the worker has no vendor URL, TLS, socket output, media/configuration file or
FFmpeg CLI path. AAC-ELD remains excluded; recording uses AAC-LC.

Protocol-4 finite-file ingress is new development work. Previously packaged
protocol-3 binaries and their five-target qualification do not cover this source.
Regenerate every target and the corresponding-source archive before distribution.
Published `1.0.0-beta3` already includes all five protocol-3 workers and the normal
packaged loader/continuous recording delegate. Protocol 4 is an extension of that
runtime, not a claim that the shipped worker is only scaffolding.

The [recording guide](../docs/RECORDING.md) owns ordinary setup, battery behavior,
first-event testing and Home review. The [current qualification record](../docs/audits/2026-11-04-hsv-readiness-qualification.md)
records genuine provider/Pi execution and remaining normal-package/Home checks.
Actual Node26 Pi preparation preserved all 1,801 available decoded pictures and
their timestamps for the retained source. This does not establish Home retention,
pixel-lossless video, battery-life savings or sustained multi-camera throughput.

The [26 October release checkpoint](../docs/plans/security-hardening.md#26-october-2026-secure-media-beta-publication)
records the published source, package integrity and verified five-target artifact.
All five source-build/native lanes and eight installed-package codec/receiver
selections per target passed on Ubuntu 22.04 x64/arm64, macOS 15 x64/arm64 and
Windows Server 2022 x64. These results do not establish older OS baselines or
physical camera/Home playback. See [dependency and CI evidence](dependencies/README.md#native-candidate-ci-validation)
and the [release guide](../docs/RELEASE.md). Historical local receipts below retain
their original scope; current finding and artifact status belongs to the checkpoint.

## Build and checks

The canonical five-target build/package/installed-qualification route is owned by
[RELEASE.md](../docs/RELEASE.md#native-artifact-preparation-and-qualification).
Its default build-only mode creates the exact candidate before physical testing;
it does not publish or install it. The local commands below qualify one host only.

```sh
make -C native FFMPEG_PREFIX=/absolute/pinned/ffmpeg-9.0.2 SRTP_PREFIX=/absolute/verified/libsrtp-2.8.1
make -C native test FFMPEG_PREFIX=/absolute/pinned/ffmpeg-9.0.2 SRTP_PREFIX=/absolute/verified/libsrtp-2.8.1
```

`FFMPEG_PREFIX` and `SRTP_PREFIX` are required; no dependency installation or implicit prefix discovery occurs. `PYTHON` defaults to the existing repository `.venv/bin/python` and can be supplied explicitly for a target test environment. `PKG_CONFIG_LIBDIR` explicitly selects that prefix; do not rely on an ambient pkg-config installation selecting the pinned version. Compiler uses C11, warnings as errors, and public libavformat/libavcodec/libavutil/libswscale/libswresample. `PKG_CONFIG_FLAGS` defaults to `--static` to include the declared static dependency closure. The libsrtp archive is linked explicitly. POSIX builds use pthreads because the installed macOS compiler has no C11 `threads.h`; Windows uses Win32 threads/condition variables and binary stdin/stdout. Windows uses explicit `.exe` targets and links Winsock for the static dependency closure. Tests select those executable names on Windows. Windows requires a target toolchain and supplied pkg-config files; the Makefile does not produce or prove a clean Windows distribution.

The worker accepts no command-line options. Start with executable argv only, private piped stdin/stdout/stderr, and a scrubbed environment. Runtime rejects libavformat/libavcodec versions other than 63.1.102 and libavutil other than 61.1.102. This prevents observed major-version drift; distribution receipts bind exact artifact/source/dependency identity. The recorded local macOS worker statically linked the verified FFmpeg/Opus/x264/libsrtp archives and dynamically linked only Apple system libraries/frameworks. That local import result is not a claim about Linux or Windows imports; the published five-target artifacts pass their separate native dependency audits.

## Protocol version 4

All integers are big-endian. Input frame header: ASCII `BMI1`, u32 type, u32 payload length. Output header substitutes `BMO1`. Partial I/O is accumulated; partial header/body at EOF is fatal. Every input payload is capped at 65,536 bytes. Unknown type, duplicate CONFIG, media before CONFIG, media after END, invalid lengths or unknown enum values are fatal.

| Input type | Payload |
|---|---|
| 1 CONFIG | Eighteen u32: width, height, fps, bitrate, maximum decoded video frames, software preset, audio codec, audio rate, audio channels, audio bitrate, H264 profile, H264 level, Opus packet duration in ms, output mode, maximum fragment duration in ms, maximum I-frame interval in ms, input format, audio-tail policy |
| 2 MEDIA | Nonempty fragment of the owned byte stream; input frame boundaries need not align with TS packets or MP4 boxes |
| 3 END | Empty; declares media EOF. Protection remains available after codec END; parent closes stdin after final protection replies or sends STOP |
| 4 STOP | Empty; allowed before CONFIG and after END, terminates process immediately |

CONFIG allows even dimensions 2..1920 by 2..1080, fps 1..30, video bitrate 20,000..8,000,000, and maximum video frames 1..9000. Audio codec enum: 0 disabled (all audio fields zero), 1 Opus (rate 16000 or 24000), 2 PCMA/3 PCMU (rate 8000), 4 AAC-LC (recording only, rate 16000 or 24000). Enabled audio requires one channel and bitrate 8000..128000. Opus packet duration must be 10, 20, 40 or 60 ms; other codecs require zero in that field. H264 profile IDs 0/1/2 select Baseline/Main/High and level IDs 0/1/2 select 3.1/3.2/4.0. Geometry and fps must fit the selected level’s macroblock/frame and macroblock/second limits. Software preset IDs 0/1 select the existing veryfast/ultrafast choices, both with zerolatency. Configured bitrate supplies both maximum rate and VBV buffer size. Ultrafast also selects Opus compression level 3, matching the existing operator choice. No hardware encoder or additional preset choice is exposed. PCM wire bitrate is fixed by codec/rate; configured bitrate does not change that. Output mode 0 emits codec packets and requires both recording duration fields zero. Mode 1 emits fMP4 and accepts only disabled audio or AAC-LC; fragment and I-frame durations are 1000..4000 ms, with I-frame interval no greater than fragment duration. AAC-LC and AAC-ELD are distinct codec requirements; no AAC-ELD support is advertised.

Input format 0 is streaming MPEG-TS. Format 1 is finite MP4 and requires recording
mode. Audio-tail policy 0 is strict. Policy 1 is explicitly requested bounded tail
silence, allowed only for finite MP4 with AAC-LC audio enabled. Unknown values or
combinations fail closed. The client always serializes the current 72-byte CONFIG;
it does not fall back to older binaries.

Only first H.264 video and optional first AAC/AAC-LATM audio stream are processed. In live packet mode, missing optional audio produces no invented stream or packet. Recording with audio enabled requires source audio; missing source audio fails explicitly. Video PTS/DTS and audio timing use the original shared MPEG-TS timestamp domain, reported as signed microseconds. Audio resampling and encoder initial/discard padding are explicit. No timeline normalization independently resets streams to zero. Video selects existing frames at no more than requested fps using source timestamps before scaling; it does not duplicate slower input. Aspect-preserving scaling uses even inner dimensions, centered black padding and square output SAR. Independent low-rate-source upconversion parity remains unverified. Source timestamp discontinuity beyond 2 ms in audio fails closed; broad real-provider jitter/wrap/reorder calibration remains pending.

| Output type | Payload |
|---|---|
| 1 STATUS | u32 protocol version 4, u32 output fps |
| 2 PACKET | i64 PTS/DTS/duration in microseconds, u32 owned keyframe flag, u32 stream ID 1, u32 timebase numerator 1, u32 denominator 1000000, u32 skip-start/end samples, then encoded Annex-B H.264 bytes |
| 4 AUDIO PACKET | Same 48-byte metadata as video, stream ID 2, then encoded audio bytes |
| 5 AUDIO INFO | u32 codec/rate/channels/initial-padding/extradata-size, followed by bounded codec extradata |
| 3 END | Empty; emitted only after successful media EOF and decoder/encoder draining |
| 8 MP4 INIT | Complete `ftyp` + `moov` initialization segment, at most 256 KiB |
| 9 MP4 FRAGMENT | u32 zero-based sequence, i64 first video PTS in microseconds, i64 video duration in microseconds, u32 keyframe-start flag 1, then complete `moof` + `mdat` fragment at most 8 MiB |
| 7 SOURCE INFO | Four u32: actual decoded source width/height and frame-rate numerator/denominator. Emitted once after validated decoding, with unknown rate encoded as 0/1 |
| 6 MEDIA CONSUMED | Strictly increasing u32 cumulative byte credit: removed from the streaming ring, or safely copied into the bounded finite MP4 buffer; repeated/backwards or unadmitted progress is fatal in the parent |
| 13 VIDEO MOTION | Recording mode only: u64 elapsed source microseconds, u32 changed-sample permille (0..1000), u32 confirmed event marker 1. Maximum one pulse per source second; no image or codec bytes |
| 14 RECORDING SUMMARY | Finite MP4 only, once before END: six u32 decoded/selected/encoded video counts, generated audio samples, audio rate, input format; then u64 `preparedSpanUpperBoundUs` |

Only owned keyframe flag 1 is emitted; other library flags are withheld. Every raw codec output frame, including header and metadata, is at most 1 MiB. Recording types have their separate limits above. Audio skip/padding values are sample counts in configured audio sample rate. Opus RTP clock remains 48 kHz independently of configured encoder input rate; the parent RTP layer performs explicit clock conversion. Audio extradata is at most 4096 bytes. Parent must cap header lengths before allocation, retain complete frame boundaries, and route packet data into a maintained RTP/SRTP implementation. No claim that private IPC alone resolves SRTP output secret handling.

Recording-mode motion uses at most a 64x36 luma grid, sampled at no more than
5 Hz. A median global brightness correction suppresses uniform exposure changes;
pixel changes below 20 luma levels and changes covering less than 2% of the grid
are ignored. After a one-second scene warmup, two changed samples against the
held pre-change reference confirm an event, including an object that enters and
then stands still. Confirmed pulses are limited to 1 Hz. The parent independently
requires a ready prebuffer, recording permissions, enabled camera motion and an
armed Blink network before publishing motion to HomeKit. Disabling recording
terminates the worker and its detector state. This visual signal is not person
classification; HomeKit's event-selection policy remains authoritative.

STOP executes `_Exit(0)` in the input reader thread, independent of synchronous codec work, a stalled media reader, or a blocked stdout consumer. It intentionally does not flush codec/output queues or emit END. Parent must discard partial output and confirm process/pipe closure before retiring its generation. Fatal malformed framing and queue overflow similarly exit with status 2. Ordinary EOF without END is fatal. Clean media END drains codec output; with incomplete TS payload, EOF acceptance remains subject to decoder parsing rather than byte-exact container integrity.

## Bounds and trust boundary

Media queue: fixed 1 MiB ring; overfill is fatal, not an unbounded backlog. Input message: 64 KiB. Lifetime media input: 128 MiB; encoded output: 64 MiB. Decoded source dimensions: at most 4096 on either axis and 8,388,608 pixels, independently from the maximum 1920x1080 negotiated output. Decoder `max_pixels` enforces the total-pixel bound before decoding; known initial dimensions and delivered frames are also checked. Demuxer streams: at most eight for MPEG-TS and two for finite MP4; MPEG-TS packet option: 256 KiB; resynchronization scan: 64 KiB. These bounds still require valid-provider traffic calibration. Audio input: 8..48 kHz, at most two channels and 8192 samples per decoded frame; two-second mono output FIFO, 32768 converted samples per batch and 300 seconds lifetime audio sample budget. Source rate/format/channel-count changes fail closed. One decoder/encoder thread per codec. Input/config wait timeout: 15 seconds; output queue: 1 MiB in packet mode or 16 MiB in recording mode, including the in-flight writer frame, independent two-second oldest-frame watchdog; process watchdog: 300 seconds. Frames: configured cap, maximum 9000.

The reader does not wait for queue space, so STOP remains readable until a protocol violation or overflow ends the process. The client admits at most one MEDIA chunk of 64 KiB and awaits consumption credits for every admitted byte before the next MEDIA or END. Credits describe ring consumption, not decoding or presentation completion. Control and STOP retain independent admission; a missing credit expires after two seconds. Integrations must split larger vendor frames and honor this contract to avoid overflowing the native ring. Decoder/demuxer internal allocations are not measured RSS ceilings, and a separate process is not an OS sandbox. Missing MPEG-TS demuxer fails closed rather than falling back to auto-probing. An empty protocol allowlist and rejecting `io_open` callback deny secondary public library I/O. Explicit MPEG-TS format allowlist and memory AVIO avoid URL/protocol input selection; no RTSP or general libav URL-opening entrypoint is exposed.

Finite MP4 has a separate 32 MiB owned input buffer. Before allocating that
buffer or parsing MOV metadata, it sets a 64 MiB maximum for each libavutil
allocation, including sample/index tables. This accommodates the input buffer
and supported source-frame geometry while rejecting oversized individual table
allocations before decoding. It is not an aggregate resident-memory limit;
multiple smaller allocations and non-libavutil allocations remain possible.
The focused Linux malformed-table regression uses a separate 512 MiB child
address-space cap and measures a 64 MiB RSS ceiling for that tiny fixture only.
STATUS is available before
MEDIA; byte credits acknowledge copies so the parent can finish feeding before
END. Decoding starts only after END. A bounded seek callback permits MOV index
reads within those bytes; it rejects out-of-range positions and receives no file
handle, filename or URL. MOV is forced, secondary opens are denied, protocols are
empty and external data references/absolute paths remain disabled. Exactly one
H.264 video and at most one AAC audio track are admitted. Declared duration is
capped at 90.25 seconds and decoded video elapsed time at 90 seconds. The process
watchdog stays 300 seconds. The parent uses a fixed 120-second finite processing
deadline after END because that event starts whole-file processing; streaming TS
keeps its existing two-second final-drain deadline. Neither byte credit nor source
summary proves successful Home delivery or retention.

Libav logging is discarded and own diagnostics use fixed codes, with no input interpolation. The SRTP INIT key buffer is explicitly erased after library initialization; library-owned key memory is reclaimed on process exit without a general memory-zeroization proof. The release checkpoint records integrated F05 dummy-secret/process-metadata/default-crash-policy verification and its privileged-memory/dump exclusions. It also records F06 verification at the parent-owned DNS/redirect/reconnect/SDP/control/secondary transport boundary with original TLS identity. Unsupported talkback remains disabled.

## Fragmented MP4 recording

Recording uses the same worker and pinned libraries, with custom write-only AVIO.
It never receives an output filename, URL, credential or SRTP key. libavformat
packages H.264 with global headers and optional mono AAC-LC into fMP4. Disabled
recording audio omits the audio track entirely, even when MPEG-TS contains audio.

The delayed initialization segment arrives when the first fragment is flushed
(about one second of source video, or EOF). Feed media after STATUS; do not wait
for initialization before feeding. Delayed moov/edit lists preserve the common
source clock and AAC priming instead of independently normalizing tracks to zero.
Every fragment starts its video track on a keyframe. The recording encoder uses a
one-second GOP with scene cuts disabled. Negotiated fragment duration remains an upper bound. Metadata duration
describes video coverage; AAC packets can straddle a video boundary. Input gaps
beyond the configured I-frame interval fail with an explicit discontinuity.
Duplicate or regressing source timestamps also fail before FPS selection; ordinary
FPS downsampling remains separate. Enabled audio must cover each fragment's video
end within two AAC frames plus 2 ms. A delayed audio watermark retains following
video for at most 64 packets, 1 MiB and one second of source time; audio catches up
before the fragment is emitted, or capture fails. Final EOF also checks audio/video
leading and trailing coverage. This bounded hold accommodates bundled AAC PES and
encoder delay without accepting an incomplete audio tail as a complete fragment.

The muxer payload budget reserves 256 KiB for headers before adding each encoded
packet, and the AVIO collector independently caps a complete fragment at 8 MiB.
Native and parent queues cap recording output at 16 MiB and retain the existing
two-second callback/output deadline. Queue exhaustion terminates capture; it does
not silently remove encoded packets. Intentional rolling prebuffer eviction is
parent-owned. STOP aborts promptly; clean END flushes the final fragment before
END. Existing 300-second/128-MiB-input/64-MiB-output worker lifetime limits remain;
renewal requires a new generation and cannot claim seamless capture.
Recording callback buffers are borrowed: callers copy retained footage before
resolving. The TypeScript client erases recording buffers after callback completion
and erases active, queued and partial parser media on STOP or process closure.

`src/accessories/saved-clip-preparation.ts` is the finite-file production ingress.
Native storage jobs remain in `src/native-clip-recorder.ts`, and the existing
camera delegate owns the recording offer, motion hold, permissions and HDS media
retirement. The platform composes the one sanitized readiness report; reporting
does not decode media or replace the durable offer fence. Developer diagnostics
must exercise these same owners rather than an external conversion pipeline.

Finite MP4 keeps one bounded encoded video packet until the next selected PTS
defines its duration. This prevents fragment flush from moving keyframes across
variable source intervals. At EOF the last selected picture covers the actual
decoded source end, including an unsampled final picture when reducing frame
rate. No picture is duplicated. Source cadence selection permits at most 100
microseconds of phase quantization before a rational output deadline; deliberate
higher-rate sampling and duplicate/regressing timestamp rejection remain active.
MP4 decoding accepts legitimate parameter-only H.264 chunks while propagating
codec failures. Synthetic fixtures cover those packets without private footage.

Explicit tail normalization appends at most two seconds of silence at the
negotiated audio rate after genuine decoded audio. It never repairs an interior
audio discontinuity or invents a missing audio track. The existing coverage checks
still run after padding. The summary counts only generated content samples before
AAC encoder padding. Its span is a conservative bound: the full encoded packet
timeline span plus one AAC initial-padding allowance, at most 92 seconds. It is
not an exact container duration or an iCloud receipt. The summary is not emitted
for continuous TS generations. The parent validates its integer bounds before
exposing typed metadata.

Optional private captured-file regression:

```sh
BLINK_NATIVE_CLIP_FIXTURE=/absolute/private/captured.mp4 \
  .venv/bin/python -m unittest native.tests.test_worker.WorkerTests.test_captured_mp4_parameter_packets_preserve_available_decoded_pictures -v
```

The default expected picture count is 1,801; `BLINK_NATIVE_CLIP_PICTURES` can supply
the independently measured count for another intentional fixture. Source footage
must remain private and outside Git. This test verifies available decoded-picture
counts; lossy H.264 transcoding does not preserve original pixel bytes.

Local protocol-3 verification uses the synthetic MPEG-TS fixture and a separate
MOV demux/decode checker. It decodes complete six-second recordings and every
individual fragment, checks keyframe starts, monotonic/source-preserving video
timing, AAC-LC at 16/24 kHz from AAC and bundled AAC-LATM input, and absence of an
audio track when audio is disabled. These synthetic macOS checks do not prove
Apple hub acceptance, provider continuity or the five distribution targets.

## Historical local prototype evidence

`make -C native FFMPEG_PREFIX=<verified prefix> SRTP_PREFIX=<verified prefix> test`: twenty-eight behavioral tests passed on macOS arm64 after the protocol-2 codec slice. Tests include valid fragmented MPEG-TS, complete framed packet EOF, malformed/partial input, invalid config and duplicate config, frame budget, media-free failure, STOP before config/during media wait/with stdout unread, and withheld secret-like malformed payload. Native fixture generator and independent H.264 output checker use public libraries, without FFmpeg CLI. The checker decodes four output frames and validates dimensions/pixels; audio tests decode audible output for each supported codec/rate from AAC and explicit AAC-LATM MPEG-TS fixtures, preserve the fixture source offset, verify all supported Opus packet durations and reject unsupported audio config/discontinuity. Additional fixtures verify 2K/square source bounds, aspect padding, source-timestamp-preserving 30-to-15 fps selection, negotiated H264 SPS profile/level and exact media consumption credits. The capability executable demonstrates native AAC-ELD open failure (-22) rather than mislabeling AAC-LC.

The stdout-stall STOP test sends repeated fixture media without consuming stdout; it demonstrates prompt process exit in that scenario, but did not itself prove an exact queue/RSS high-water measurement. Later synthetic resource and multi-platform evidence belongs to the release checkpoint. Real-media calibration, provider-valid synchronized audio, broader SRTP wire parity and physical integrated STOP acceptance remain operator gates.

## License and source distribution

Worker and fixture/checker sources are `GPL-3.0-or-later`, with GPLv3 text in `COPYING`. Linking the selected FFmpeg/libx264 GPL configuration prevents treating this worker as an LGPL-only binary. Every publication requires exact license/dependency inventory, notices and corresponding source/build inputs for every target. The published beta includes the verified source bundle and target-specific notices identified by the release checkpoint; future changed artifacts require their own evidence.

Public API references: [FFmpeg custom AVIO](https://ffmpeg.org/doxygen/trunk/structAVIOContext.html), [codec send/receive](https://ffmpeg.org/doxygen/trunk/group__lavc__encdec.html), [FFmpeg license](https://ffmpeg.org/legal.html). Installed 9.0.2 headers/source are authoritative for this local prototype; current documentation alone does not prove version or runtime portability.

## Private protection messages

Input 10 INIT is 42 bytes: u32 stream ID (1 video / 2 audio), u32 SSRC, u32 suite 1 (AES128-CM/HMAC-SHA1-80), then 16-byte master key and 14-byte salt. Each stream initializes once; unsupported suites, zero SSRC and duplicate initialization are fatal. Output 10 acknowledges with the four-byte stream ID. Input 11 PROTECT_RTP or 12 PROTECT_RTCP carries u32 nonzero request ID, u32 stream ID, then at most 2048 plaintext bytes. Output uses the same type and echoes both IDs followed by protected bytes (RTP <=2058, RTCP <=2062). Requests must name an initialized stream and match its SSRC. Parent owns correlation uniqueness, RTP/RTCP semantics and endpoint authorization; the worker opens no socket. Library replay/nonce safeguards remain enabled.

The reader performs bounded protection work and only enqueues output; a separate writer owns stdout. Queue overflow is fatal and a watchdog exits after two seconds without draining the oldest frame. STOP remains independent of both writer and codec. Codec END emits output END but keeps the protection reader available. After codec completion, fifteen seconds without reader activity is fatal; the lifetime watchdog still caps the process at 300 seconds. Protection requests reset the final idle wait. Clean input EOF after media END stops acceptance, deallocates SRTP sessions and drains queued replies before process exit. STOP exits immediately. The post-END protection/STOP test establishes that final encoded packets can still be protected; full production generation teardown ordering remains a gate.

The [published pinned libsrtp `srtp_validate` RTP and SRTCP ciphertext vectors](https://github.com/cisco/libsrtp/blob/6ff02afa8d2dc3f2e8896af391d137c1c66ff6fa/test/srtp_driver.c#L1862) are matched through the actual worker pipe, including correlated IDs. The tests also reject uninitialized/mismatched/duplicate sessions and establish the stdout deadline. Source/license evidence for the linked archive comes from the independently verified dependency build receipt. `dependencies/licenses/libsrtp-LICENSE` preserves its actual source notice; the release checkpoint identifies the published corresponding-source and notice inventory.

The final local verification uses the same verified source-built static prefix for worker, fixture, checker and capability probe. That prefix includes Opus/PCMA/PCMU decoders for output verification; the worker still accepts only explicitly selected H264/AAC input. `CHECKER_FFMPEG_PREFIX` permits an independently built verifier when necessary, but the final receipt uses its default shared prefix.

Before reading private configuration, POSIX builds set and verify the worker's own `RLIMIT_CORE` soft/hard limits to zero, failing closed if suppression fails. Windows sets process error mode to suppress critical-error/fault dialogs; this is not a proof that Windows Error Reporting or configured dump collectors cannot capture memory. No host crash policy is changed. The local dummy-key test inspects the child argv/environment via `ps`, checks initialization replies and fixed malformed-frame diagnostics, and verifies key bytes are absent. It does not trigger a secret-bearing crash or claim protection from privileged debuggers, external collectors or parent-side dumps. Graceful input EOF deallocates library sessions; immediate STOP relies on process memory reclamation for library-owned secrets, while the INIT stack key buffer is explicitly erased after successful library initialization.

## Parent readiness and drain

`PrivateMediaWorker.whenReady` resolves only after a unique protocol-4 STATUS matching configured fps. Its deadline begins at accepted CONFIG. `whenMediaDrained` resolves after output END and completion of every queued/active codec callback. Streaming TS retains a two-second deadline from accepted input END; finite MP4 uses its fixed 120-second processing deadline because END starts whole-file decoding. Both promises reject on failure or STOP; callers that only stop a worker need not install rejection handlers. The parent stops its own producers/timers, awaits media drain and final protection work, then calls `finishInput()` and awaits actual process/pipe closure. `endMedia()` only confirms writing input END. Neither readiness nor codec drain proves successful network delivery or physical playback.

## Owned session and independent synthetic receiver

`src/accessories/media-session.ts` composes the private worker, `ProtectedRtpStream`
and generation-owned numeric sockets. It configures both SRTP contexts before
media admission, chunks one bounded vendor frame into 64 KiB credit-controlled
writes, and buffers at most 256 encoded packets/1 MiB including active output.
Codec callbacks enqueue bounded copies; admission waits for space with one
absolute two-second deadline. A fixed 100 ms startup window collects both streams
before choosing their earliest shared PTS. Monotonic pacing and one serial
RTP/RTCP pump preserve common clock mapping without independently resetting audio
or video. Packet skip/padding counts remain numerical audit metadata; RTP carries
the original encoded PTS rather than applying a second padding correction.

Session END waits for native END/callback drain, paced output and final reports,
then actual worker and socket closure. Generation cancellation aborts pending
admission/pacing/sends and fences late work. Structured source metadata forwards
only validated dimensions and a bounded rational frame rate to the owner.

`build/check-rtp` (`.exe` on Windows) is a separate validation helper, never the
product worker. It receives synthetic keys and captured ciphertext through private
stdin framing, uses pinned libsrtp to authenticate/decrypt, reassembles H264 FU-A
and decodes through libavcodec. Four native session cases cover Opus 16/24 kHz and
PCMA/PCMU 8 kHz, with decoded video pixels/audio energy, stream identity, clock
steps, final RTCP counters and the fixture's 64 ms audible A/V offset. A tampered
authentication tag fails verification. These cases use an injected datagram sink;
they prove private-pipe/codec/protection/session behavior, not actual UDP delivery,
provider interoperability, Home playback or five-target acceptance.

## Exact profile with the selected preset

The worker's profile selection is exact across both allowed presets. The pinned
x264 ultrafast preset disables CABAC and 8x8 transforms, which otherwise causes
Main/High requests to emit a Baseline SPS despite the profile restriction. The
worker supplies the supported FFmpeg `coder` and `8x8dct` AVOptions through the
public codec-open dictionary: CAVLC/no 8x8 for Baseline, CABAC/no 8x8 for Main, and
CABAC/8x8 for High. Pinned FFmpeg applies these options after the base preset and
before profile restrictions; pinned x264 selects SPS profile from those tools.
No private ABI or additional encoder path is involved.

The regression first failed for ultrafast Main/High, then passed all six
preset/profile combinations with exact SPS profile/selected level and independent
four-frame pixel decoding. The rest of the ultrafast policy remains selected, but
restoring these coding tools can increase CPU work. Small synthetic frames do not
establish Pi throughput or resource acceptance; those gates remain open.

The video bitrate ceiling preserves the existing operator setting of 8000 kbps:
CONFIG and session preflight admit at most 8,000,000 bits/s. Both presets pass an
8 Mbps fixture with exact High/level-3.1 SPS and independent pixel decoding; the
pinned encoder's bitstream SEI confirms effective bitrate, VBV maximum rate and
VBV buffer size of 8000 kbps/kbits. Pinned x264's level-3.1 table permits 14000
kbps, above this ceiling. Values above 8,000,000 are rejected. This verifies
admission and encoder configuration, not sustained-rate, device CPU or RSS
acceptance. Packet, queue and lifetime limits remain unchanged.
