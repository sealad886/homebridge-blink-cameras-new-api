# HSV preparation performance and shipping assembly

## Confirmed failure

Published `1.1.0-beta.6`, merged source
`72d989fd38bc3b6ea39f32ab4ed6a9fee559b917`, was installed through standard
Homebridge tooling after exact registry/source/native/receipt verification.
Fresh motion reached both existing camera accessories' acquisition queues.
Corner downloaded at 12:56:22 UTC and began preparation immediately. At
12:58:22 it reported `delivery-not-offered-preparation-failed`, exactly at the
120-second preparation deadline. Entry downloaded at 12:56:38, waited for the
serial preparation slot, and began at 12:58:23. Later sanitized inspection recorded repeated Entry preparation failures at
13:04:24, 13:08:26 and 13:12:28, interleaved with Corner failures. No prepared offer or Home transfer was established.
The worker was actively using CPU before cancellation. Missing fixed decoder
codes do not establish a recurrence of the earlier SEI decode failure.

## Structural build defect

Canonical native candidate CI still passed `--disable-assembly` to the pinned
FFmpeg/x264 recipe. All five actual beta.6 dependency receipts recorded
`prototype_assembly_disabled: true`. Those candidates became the published npm
workers. Correct codec fixtures and short installed-package qualifications did
not establish throughput for a complete camera recording on the Pi.

An independent source assessment confirms that disabling optimized assembly is
an inappropriate shipping policy. It found no source-frame duplication defect:
negotiating 30fps does not multiply a 15fps source into 30 pictures per second.
There is no measured evidence supporting a separate metadata/scaler rewrite.
Assembly is a concrete build defect and plausible throughput cause, but an
optimized Pi run is required to establish whether this correction is sufficient.

## Correction scope

Enable normal architecture-specific assembly in canonical builds; provide NASM
on supported x86 CI hosts and verify generated FFmpeg/x264 configuration. Reject
assembly-disabled or unproved dependency receipts at package staging and installed
package verification. Update corresponding-source rebuild instructions and add
focused positive/negative configuration and receipt regressions.

Keep source pins, runtime encoding preset/thread policy, serial admission,
resource bounds and the 120-second deadline unchanged for the first physical
comparison. No new runtime option, custom Pi worker installation, fake camera,
live-view replacement or Home/Blink setting change is part of this correction.

## Required evidence

1. Local build/contract/native regressions and exact-source independent review.
2. Current four Node and five native CI gates; five installed-package
   qualifications including recovery metadata; actual npm/source/native/source
   bundle/GitHub receipt identity.
3. Standard exact-registry Pi upgrade, unchanged config/main process and verified
   installed worker. Representative fresh camera recordings must finish
   preparation within the existing bound, be offered under their respective
   accessories, and complete Home transfer.
4. Actual matching saved Home timeline playback. Transport ACK alone does not
   prove retained Home recording. Keep #109 open and stable promotion blocked
   until physical acceptance.

Local optimized dependencies built successfully on macOS ARM64. Generated
FFmpeg configuration proves `HAVE_NEON_EXTERNAL=1`; x264 proves
`HAVE_AARCH64=1`; the resulting receipt records assembly enabled. The first
native run passed 53 of 55 tests. Two test assumptions failed: compressed AAC
bytes no longer incidentally contained the Windows EOF marker, and a confirmed
frame-limit fatal exit could leave an unflushed partial output tail. The TS fixture now appends a valid null-PID packet carrying explicit CR/LF/SUB
bytes, independent of compressed codec output; MP4 fixtures are untouched. The
frame-budget check requires exit 2 and exact fixed FRAME_LIMIT stderr before
allowing an incomplete fatal-output tail. Successful output framing and all
codec/resource bounds remain strict.

The repaired optimized native suite passed all 55 tests. The first repair rerun
hit a sandbox denial of `/bin/ps` in an existing process-surface security test;
rerunning unchanged assertions with host access passed. The recording-preparation
JavaScript suite passed all 15 tests against this optimized worker. The 52
dependency contracts and 29 packaging contracts passed, including an independent
rerun; all eight Node release-contract suites passed (87 tests). The original
failed evidence is preserved. Full clean-checkout preflight, current-source bot
review, five-platform qualification, publication and physical acceptance remain
pending.
No footage was exported. Historical failed artifacts and logs remain preserved.
