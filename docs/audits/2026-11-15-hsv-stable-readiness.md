# HSV stable-readiness candidate

## Scope and acceptance

The user authorized completion of HSV delivery, standard Homebridge Pi upgrades,
then setup documentation, a temporary settings banner, numerical-default review,
one-time persisted upgrades from stable0.10.0 and a reviewed full release.
Candidate1.1.0-rc.0 targets that authorized scope. Stable promotion remains subject
to the release guide; source checks do not establish installed acceptance.

Beta7/source7116dbf105173a416e09aefaf1cd50257b254324 was independently qualified,
published and installed through exact-registry Homebridge tooling. Actual native
Mac Home saved playback was observed under both real camera accessories:
Corner14:28 advanced0→34seconds; Entry21:54 advanced0→37seconds. Entry21:56,
21:34 and21:28 saved entries were also visible. No camera footage was exported.
Latest22:24UTC read-only Pi check showed three Corner preparations32–34seconds,
all fully transferred. The Home transport completion warning does not negate
observed saved playback. No speculative ACK callback change is included.

## Changes

- Prepare finite recordings with source-time keyframes and actual decoded-picture
  duration. Valid5/7fps clips negotiated at30fps reproduced fragment-limit and
  false audio-tail failures. Baseline8/12failed; corrected12/12pass. Encoding
  presets, dependency pins, threads, deadlines and media guards are unchanged.
- Require the low-FPS recording selection in each installed-package qualification,
  with independent fragment decode, picture/source clocks and A/V checks.
- Combine retired secure-media, motion and recording conversion through the
  existing guarded atomic file writer. Preserve exact private backups, original
  config permissions and ownership, explicit canonical choices and other plugins.
  Both entrypoints preview unless --apply. Windows automatic install skips with
  complete manual conversion guidance. No runtime/UI legacy interpretation.
- Explain per-camera native Blink USB clips, plugin enablement and separate Home
  occupancy-mode recording permission, Any Motion first test, audio and hub/iCloud.
  Temporary notice dismisses only for the current editor; remove in the first
  maintenance release after1.1.0. Existing accessories and live viewing remain.
- Require maximum job age strictly greater than initial delay. All16numeric
  defaults retained after scope/resource review. Matching15seconds remains a
  conservative bound, not universal empirical validation: observed18/19second
  differences exceed it. Increasing globally can select adjacent same-camera
  events; setup guidance requires measured isolated-event calibration and checking
  every enabled camera. The Pi's explicit45second setting is unchanged.

## Verification so far

- Native56 tests and JS preparation15 tests passed; independent timing review
  CLEAN at frozen implementation hashes. Twelve low-FPS/audio/metadata subcases
  independently decode and preserve picture count and source clocks.
- Combined migration/postinstall49tests passed independently; source/runtime
  guard checks14passed. Actual published0.10.0 schema/source informed fixtures.
- UI/configuration94focused tests passed; independent63tests passed. Typecheck,
  targeted lint, JS syntax and99local links/anchors passed before root prose edits.
- Root rendered the synthetic actual-source notice at1280and390pixel widths,
  including dark appearance. Text/controls wrapped, no horizontal overflow visible.
  Tab reached Dismiss, Enter hid the notice, next Tab reached section navigation;
  config-write counter stayed0 and status stayed clean. Preview's HTML/script
  encoding was corrected locally; no product change needed. Parent Homebridge
  Bootstrap styling and a real screen reader were not certified by this preview.

## Remaining release gates

Four actual earlier beta7Pi failures (audio discontinuity/fragment limits) have
not been attributed to retained source packets. The bounded packet-only probe
found no retained download; local synthetic regression proves the specific
source-clock defect, not every observed failure. Do not call all clips fixed.
Changed runtime needs reviewed exact-source CI, all five rebuilt native and
installed-package qualifications, immutable registry/source/native/receipt/GitHub
verification, standard Pi install and fresh physical recording validation.

Canonical full preflight and fresh whole-change review are pending. The RC needs
physical critical paths and two successful natural token refreshes. Stable runtime
must match accepted RC except version/notes; stable install24hours plus a natural
refresh precede completion. No paid credits, native pins, dependencies, new
worktrees, history rewrites or Home/Blink settings changes are included.

## Round-one review repairs

Canonical exact5308 release preflight passed:2354tests and18existing skips,
lint/build/package. Fresh whole30-file independent review was CLEAN. CodeRabbit
explicitly completed all30files with two major conditional timing findings and
one minor documentation finding. Both native cases reproduced with valid source
media, so source review success did not waive them.

-5fps→30fps with1second fragments and16/24kAAC failed FRAGMENT_LIMIT.
-25fps→15fps failed1second fragments and produced26667microsecond overlap in
nonfinal fragment metadata with4second fragments. Selected source intervals vary;
assigning a constant negotiated-frame duration was incorrect.

The repair holds only downsampled or unknown-duration pictures until the next
selected timestamp supplies their duration; full-duration low-FPS pictures still
submit immediately. Finite IDRs reserve complete picture duration, existing AAC
margin and one picture interval of demux lead. The shared muxer closes finite
known IDRs immediately while retaining live GOP grouping. No extra picture buffer,
source-clock normalization or validation relaxation is introduced.

The first pending-picture repair passed plain probes but expanded regression found
two SEI/audio boundary failures. Those failures and numeric diagnostics are retained;
instrumentation was removed. Final24boundary subcases and full57native tests pass,
with15preparation tests and12final numeric probes passing. Each fragment independently
decodes; nonfinal metadata is contiguous and original strict fragment limits hold.
Installed qualification adds those boundaries across all five candidate targets.

Quote both migration command paths in the streaming and conversion guides so
operator paths containing spaces remain a single shell argument. No production
migration was executed. The signed5308 source reviews and preflight are historical
after these repairs; exact repaired-head preflight, independent review and active
CodeRabbit round2 remain required before push. Candidate physical and natural
refresh/stable soak gates remain unchanged.
