# Bundled AAC-LATM source-clock correction

Local synthetic evidence, 2026-10-26. This receipt does not establish physical
camera, network, Raspberry Pi resource, distribution, or release acceptance.

## Reproduction and root cause

The retained benchmark fixture `/private/tmp/blink-secure-media-multi-au.ts`
contains 304,936 bytes, SHA-256
`532d2fc79a248b1943bb55decb7a58b95ac3e3a4a726a50b1374cb8d8b1faf17`.
The existing performance script generated it with FFmpeg 9.0.2, 1280×720 video
at 15 fps, mono AAC-LATM at 16 kHz, a 1,200,000-bit/s MPEG-TS mux rate, and
normal mux delay. The preceding worker
`fd252d11a93be54fa2eb3bf9e05a4440749901f5dbf7d8e956e6f0af68642352`
exited 2 with `BLINK_WORKER_AUDIO_TIMESTAMP` on this exact input.

Pinned FFmpeg `libavcodec/decode.c` clears a partly consumed audio packet's
PTS/DTS before decoding its later access units. MPEG-TS normally bundles
multiple AAC access units into one PES. Requiring a separate decoded timestamp
on every access unit therefore rejected valid input. The old small fixture's
zero mux delay did not exercise that bundling.

## Correction

The first decoded source timestamp remains mandatory. The worker validates
sample rate and sample count before clock arithmetic, keeps the first source
origin, and advances its source clock by cumulative decoded samples. Missing
later timestamps use this established clock. Known timestamps must remain
within 2 ms of the clock; they do not reset its origin. Cumulative rescaling
avoids accumulating per-frame microsecond rounding. Existing output sample
clock, shared video/audio origin, codec configuration, queue and lifetime
bounds remain in force.

The regression fixture uses public libav APIs, normal 700 ms mux delay, and
the benchmark's mux rate. No `pes_payload_size` workaround is used.

## Verification

- RED: the new bundled fixture failed on all four audio output selections with
  `BLINK_WORKER_AUDIO_TIMESTAMP` before the correction.
- GREEN: native suite 31/31 after a forced rebuild using the retained verified
  `build/deps/local-eor2xuvi/prefix` static dependency installation.
- Bundled fixture: 30 video frames; all supported audio outputs independently
  decode, keep 20 ms output PTS steps and the original 64 ms audible A/V offset.
- Removing only the first audio PES timestamp fails with `AUDIO_TIMESTAMP`.
  Shifting a later known PES PTS by 180 ticks at 90 kHz (2 ms) succeeds;
  ±181 ticks fails with `AUDIO_DISCONTINUITY`, without successful END.
- Exact retained benchmark input succeeds with empty stderr after correction.
- Focused worker/session/output/socket Jest suites: 107/107. Eight actual
  worker-to-independent-receiver cases cover small and bundled fixtures with
  Opus at 16/24 kHz and PCMA/PCMU at 8 kHz. The receiver checks SRTP/SRTCP
  authentication, RTP clock steps, all decoded video frames, audible audio,
  shared A/V offset and final RTCP counters through an injected datagram sink.
- Session dependency TypeScript, changed session-test ESLint, GCC 14/16 strict
  C syntax checks for worker and fixture, and scoped diff checks pass.

Frozen worker SHA-256:
`abc33f581f77c2b8b9118744f5d76a7e029cca4d43585be2cc888bec14818a89`.
Independent receiver remains
`a0ee74256f360f7796909e8ba71262ad77ac2ee6b1764edf4b2bbc6ef561006c`.
Performance and long-run resource measurements are separate evidence; this
correction makes no performance acceptance claim.
