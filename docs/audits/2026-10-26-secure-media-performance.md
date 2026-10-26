# Secure media synthetic performance acceptance

Date: 26 October 2026. This is local macOS arm64 evidence for AC-12, not a
five-target, Pi, provider or physical Home playback result. The
[structured receipt](2026-10-26-secure-media-performance.json) binds script,
worker, measured sources, baseline and retained raw report identities.

## Matched timing and resource measurements

Twelve alternating measured pairs per preset follow discarded warmups. Both paths
receive the same synthetic paced 1280×720/15 H264/AAC-LATM MPEG-TS and select
500 kbps Baseline/3.1 video plus mono 16 kHz/32 kbps/20 ms Opus. The historical
production argument builders come from `9f4731abf3e50be9070f4daf2f5fd992e5152087`.
The new path uses the real private session, worker and local UDP output sink.

| p95 metric | Veryfast historical → native | Ultrafast historical → native |
|---|---:|---:|
| First video RTP marker | 1348.83 → 579.60 ms | 1376.71 → 694.44 ms |
| First audio RTP packet | 1342.01 → 474.93 ms | 1369.61 → 606.68 ms |
| STOP to confirmed closure | 35.41 → 12.93 ms | 50.52 → 50.41 ms |
| Combined parent/child CPU | 1038.52 → 1766.16 ms | 779.56 → 1027.81 ms |
| Child maximum RSS | 66.90 → 37.78 MB | 60.39 → 31.18 MB |

Measured first-media and STOP p95 satisfy the local ≤10% latency-regression
criterion. Combined CPU increased 70.1%/31.8% at p95; CPU parity is not claimed.
Maximum-CPU samples used approximately 43.0%/24.1% of one core versus
25.7%/19.1% historically over roughly four seconds. No production optimization
was applied without causal profiling. Spawn and CONFIG-ready events have different
semantics and are not compared as matching readiness measurements.

## Bounded retirement evidence

A separate count-only V8 run discards 100 warmup cycles and measures 100 real
STOP cycles. After full GC, controlled `Session`, `PrivateMediaWorker` and
`ProtectedRtpStream` instance counts remain 0→0. Every worker closed; no owned
child or UDP resource remained. Only the measurement harness PipeWrap remained.
No heap dump or object summary was produced.

First/last ten-cycle RSS means declined 9.89 MB and external memory declined
131 bytes. Heap rose 88,870 bytes (0.34%) initially, then plateaued: the final
three ten-cycle means were 26,155,502 → 26,154,044 → 26,150,730 bytes. Heap
slopes were +1801 B/cycle for the first 50, +119 for the second 50 and −231 for
the final 30. This supports zero controlled ownership-object accumulation and no
sustained late increase in this bounded run. The initial heap change remains
unattributed; no general leak-free claim follows.

## Limits and remaining gates

- Actual native worker SHA256 is
  `abc33f581f77c2b8b9118744f5d76a7e029cca4d43585be2cc888bec14818a89`.
- System FFmpeg and static worker share libav versions, but dependency builds,
  codec thread defaults and GOP settings differ. This measures the actual changed
  path, without attributing CPU differences to a specific mechanism.
- Input backpressure differs. Deliberate STOP discards the native paced tail;
  CPU is bounded live-session cost, not cost per identical completed output work.
- Queue peaks cover encoded admission and in-flight callbacks, not every private
  demux/native queue. Default socket-policy execution is verified separately.
- Recording was disabled. Recorder bounds, platform codec ceilings, long-duration
  source behavior and physical acceptance remain separate checks. These results
  alone close neither F05/F06 nor issue #48 and do not authorize publication.

Raw reports remain in ignored `native/build/` as named and hashed by the receipt.
The benchmark accepts only synthetic local media; it does not activate a camera.

## Final cadence-fix worker recheck

The same reviewed script was rerun after the cumulative source-frame schedule fix
in `418be70381b02913c81f36590968e26e2b7a5f46`. Worker SHA-256 is
`9db6e516affceeab72822786e9b6757678b43b5a9d9fe83d67cde40b9e70c047`.
The structured receipt retains both historical reports and this final report's
source fingerprints, configuration, summary and raw-report hash.

| p95 metric | Veryfast historical → native | Ultrafast historical → native |
|---|---:|---:|
| First video RTP marker | 1349.39 → 565.95 ms | 1383.55 → 606.02 ms |
| First audio RTP packet | 1343.04 → 491.79 ms | 1380.05 → 653.43 ms |
| STOP to confirmed closure | 20.51 → 12.14 ms | 36.43 → 35.08 ms |
| Combined parent/child CPU | 992.33 → 1669.17 ms | 809.36 → 1080.73 ms |
| Child maximum RSS | 68.83 → 37.62 MB | 60.00 → 31.29 MB |

All 48 measured timing runs, 100 discarded lifecycle warmups and 100 measured
STOP cycles completed. Both presets meet the bounded synthetic latency criterion.
Combined CPU increased 68.21%/33.53%; maximum samples used about 40.6%/26.0% of
one core versus 24.5%/20.0% historically. All earlier workload and parity limits
still apply.

Controlled ownership-object counts remain 0→0 and every measured worker closed.
First/last ten-cycle aggregate means rose by 573,440 bytes RSS (0.60%), 44,713
bytes heap (0.17%) and 99 bytes external memory. Heap slopes were +699/+168/+346
bytes per cycle for the first 50, second 50 and final 30 cycles. The small aggregate
increase remains unattributed: this run proves no accumulation of the counted
media objects, without establishing flat aggregate memory or general leak freedom.

The first attempt stopped after 25 timing rows when the harness could not parse a
local reaper resource JSON receipt. The native session had produced video/audio
and reported no failure. Its partial receipt is retained and excluded from
acceptance; one exact retry completed. The parse failure did not recur and its
cause remains unproved. No production behavior or measurement timeout was changed.
