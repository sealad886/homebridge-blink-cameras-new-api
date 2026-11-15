# HSV preparation of Blink metadata-only H.264 samples

## Observed failure

On 15 November 2026, beta.5 received motion for Corner and Entry, matched native
Local Storage clips, and downloaded them. Home recording permissions were active.
Preparation failed before a finite recording could be offered to Home.

A separate bounded diagnostic against the installed worker reproduced Entry's
failure in the output phase after 8.7 seconds, with `BLINK_WORKER_DECODE`.
The production client discarded worker stderr, and the recording delegate
discarded the preparation phase, leaving only `preparation-failed` in normal logs.

Read-only packet inspection on the Pi found a representative Corner clip with
916 H.264 samples: 901 picture samples and 15 standalone SEI samples. Each SEI
sample was a well-formed nine-byte AVCC packet containing a recovery-point SEI
(NAL type 6, payload type 6, payload size 1), recurring roughly every four seconds.
Each occupied a roughly 66.7 ms video time slot without containing a picture.
Video duration was 61.099 seconds versus 60.032 seconds of AAC audio. The SEI
slots account for approximately one second of the difference. The source frame
rate was 15000/1001; Home selected 1920×1080 at 30 fps with mono AAC-LC at 16 kHz.

The worker submitted every video sample as a complete picture. FFmpeg reported
`no frame`/invalid-data for standalone SEI, and the worker stopped. Broadly
ignoring decoder errors would also ignore damaged pictures and is unsuitable.

No footage was exported. An attempted export was rejected before execution;
subsequent diagnostics kept media on the Pi and returned numeric packet metadata
and fixed error categories only. No Pi configuration or installed plugin changed.

## Scope of the correction

- Handle finite MP4 metadata-only SEI samples as metadata associated with the
  next picture, preserving their contents and correcting their extra clock slots.
- Keep malformed AVCC, picture decoding errors, ambiguous timing, packet/memory
  bounds, cancellation and recording-policy checks enforced.
- Retain only bounded, allowlisted worker error codes and fixed preparation
  stages in normal failure warnings; exclude raw stderr and arbitrary errors.
- Correct the synthetic AAC fixture's shared clock: it previously emitted at
  least one audio block per video frame, doubling audio duration at 30 fps.
- Preserve the separate HomeKit setup documentation changes requested by the user.

## Qualification and acceptance

Local qualification passed:

- The immutable beta.5 macOS worker fails with `DECODE` on the same synthetic
  901-picture/15-SEI fixture that the corrected worker converts successfully.
- All 54 canonical native tests pass, including independent decoding, rational
  source timing, audio enabled/disabled, malformed SEI, corrupt picture and
  ambiguous metadata-timestamp rejection.
- The full serial JavaScript suite passes 2,338 tests with 18 existing skips;
  all 86 release-contract tests, lint and build pass.
- A focused follow-up passes all 15 preparation tests after aligning the
  regression with Home's actual Baseline profile, level 4.0, 1080p/30, 2 Mbps,
  four-second fragment/keyframe selection and 16 kHz/16 kbps mono AAC-LC.
  It checks the strict MP4 parser, independent output decoding, A/V alignment,
  unchanged source contents and released memory.
- Independent production review is clean. A signed-arithmetic overflow found
  during review was corrected before the full qualification run. The subsequent
  profile alignment and fatal-output test-parser corrections change tests only.

The first full native run exposed two failure-path tests that incorrectly
required complete asynchronous output framing after a proved fatal `_Exit(2)`.
The bounded retry passes after allowing a truncated tail only for those tests,
which still require exit 2 and the expected fixed error code. Success parsing
and malformed-frame rejection remain strict; an additional regression enforces
that distinction. The failed run and its logs are retained separately.

Ignored evidence is under `logs/hsv-preparation-fix/`: `checks.json`,
`native-checks.json`, `native-checks-first-failed.json`,
`baseline-preparation.log`, `independent-review.md` and individual check logs.
The full JavaScript run covers the same final production source; the later
test-only changes have their focused preparation and canonical native results.

These are local source qualifications. No new version, commit, PR, publication
or Pi upgrade is included. The clean-checkout release command and five-target
installed-package qualification remain release gates. These checks do not
establish saved Home timeline playback. Issue #109 remains open until physical
acceptance after a reviewed candidate is installed.
