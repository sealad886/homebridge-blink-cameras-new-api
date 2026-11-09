# Audio and LAN output evidence

See the [native prototype overview](README.md) for scope and navigation.

The local prototype now decodes optional AAC/AAC-LATM MPEG-TS audio and encodes mono Opus at 16/24 kHz or PCMA/PCMU at 8 kHz. This proves a bounded codec subset, not HomeKit audio parity or live integration. The source contract is `src/accessories/camera-source.ts`, including `buildAudioEncoderArgs` and the advertised codec/rate combinations.

The installed FFmpeg 9.0.2 native AAC encoder rejects AAC-ELD (the capability probe returns -22). The worker rejects this configuration before opening media; it never substitutes AAC-LC under that label. The maintainer approved the native-runtime contract using only Opus, PCMA and PCMU on 25 October 2026. AAC-ELD must not be advertised on that path; the legacy CLI encoder probe cannot establish native AAC-ELD support. The pinned [AAC encoder source](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/libavcodec/aacenc.c) rejects unsupported profiles.

The synthetic audio/video fixture preserves its common source timeline: audio begins at zero and video begins at 64 ms. Encoded output includes microsecond PTS/DTS/duration, encoder initial padding and per-packet skip-sample metadata. Tests decode each supported output and verify nonzero audio energy and the preserved offset after padding correction. Source timestamp discontinuities over 2 ms fail closed. This does not establish drift, jitter, timestamp wrap, resynchronization or real vendor fixture behavior. Video retains source PTS and selects existing frames at the requested maximum FPS before scaling; a nonzero-offset 30-to-15 fps fixture verifies the selection. Slower-source frame duplication is not implemented. Source geometry up to 4096 per axis and 8,388,608 total pixels is bounded independently from negotiated output; decoded 2K/square fixtures verify centered aspect-preserving padding and square SAR. H264 SPS tests verify configured Baseline/Main/High and levels 3.1/3.2/4.0. Opus packet durations 10/20/40/60 ms are explicit protocol fields and tested at both supported sample rates.

The audio FIFO holds at most two seconds; individual conversion batches, input samples, elapsed watchdog and aggregate sample/output counts are bounded. Public `swr_alloc_set_opts2`, `swr_convert`, `av_audio_fifo_*` and codec APIs handle conversion. The original local execution receipt covers macOS arm64; the same prototype behavioral suite also runs in Ubuntu x64/macOS arm64 [source-build CI](dependencies/README.md#native-candidate-ci-validation). Neither scope establishes integrated HomeKit or five-target artifact acceptance.

## Next executable output proof

Vendor upstream authorization and HomeKit LAN peer authorization must remain separate capabilities. A generation-bound parent owns the negotiated LAN endpoint, SSRC, RTP payload type, keys and lifecycle. The codec worker does not open output sockets. Opus RTP uses a 48 kHz clock even when its encoder rate is 16/24 kHz; PCMA/PCMU use 8 kHz and H264 uses 90 kHz. Rescale the shared timestamp with explicit padding treatment, then prove RTP packetization, sequence wrap and RTCP against a decoder/receiver. The pinned [RTP muxer](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/libavformat/rtpenc.c) supplies the clock evidence.

Use a verified maintained libsrtp build for protection, through private IPC in the same executable; no JavaScript crypto replacement and no secret argv/env/files. A separately verified libsrtp 2.8.1 source build now supplies the standalone static dependency. The worker matches its published RTP/SRTCP ciphertext vectors through private IPC. It has a one-MiB output queue and independent two-second writer deadline; separate receiver interoperability and full generation retirement remain gates. STOP must remain independent of blocking codec or stdout work.

The native-runtime contract now selects only Opus, PCMA and PCMU; AAC-ELD is not authorized for advertisement on that path. Explicit AAC and AAC-LATM synthetic fixtures decode through every supported output/rate.

Protocol 2 provides actual media-consumption credits and bounded parent readiness/drain promises. These preserve control/STOP independence and permit final same-pipe protection before graceful input closure.

Still pending: integrated packetization/RTCP/SRTP behavior, generation retirement and output drain, audiovisual duration and jitter parity, source/license closure, all five target runtime builds, physical provider/HomeKit acceptance and supported talkback. No native artifact is enabled in npm runtime by this prototype.


## 25 October: owned session receiver proof

The owned session bridge now uses a bounded common A/V startup/pacing queue,
serial protection and periodic/final RTCP reports. Its independent native
receiver authenticates captured ciphertext with pinned libsrtp, decodes H264
(including FU-A) and all four supported codec/rate combinations, and checks final
counters plus the source fixture's audible 64 ms A/V offset. Initial padding and
skip metadata are retained numerically; no independent timestamp reset or double
padding adjustment is applied. Ultrafast/veryfast operator choices remain explicit
in CONFIG field 5, with no new preset or hardware path.

The local synthetic receipt includes 102 focused worker/output/socket/session
tests and 27 native behavioral tests. Actual UDP, source jitter/reconnects,
long-duration calibration, camera integration, five-target execution and physical
acceptance remain separate gates. F05/F06 remain open.


Exact H264 profile is now verified across both veryfast and ultrafast. The worker
restores CABAC for Main/High and the 8x8 transform for High using pinned public
FFmpeg AVOptions after preset application. Six preset/profile cases check actual
SPS profile and selected level plus decoded pixels. This corrects ultrafast's
previous Baseline output for Main/High; enabling required tools changes CPU work,
so device performance/resource acceptance remains unproved.


The bitrate follow-on preserves the existing 8000 kbps UI/operator ceiling in
native and session validation. Both preset fixtures verify 8 Mbps admission,
exact High/level-3.1 SPS, independent decode and effective 8000 kbps/kbits bitrate
and VBV settings; values above the ceiling are rejected. No packet, queue or
lifetime cap was increased. Native tests now pass 28/28 and focused
worker/session/output/socket tests 103/103. Repository-wide TypeScript checking
encountered concurrent parent-owned camera/platform cutover changes; the session
dependency closure and scoped lint remain independently checkable. No runtime
performance or release acceptance follows from this small synthetic fixture.
