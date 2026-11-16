# External FFmpeg media backend

Status: local implementation, verification-packaging follow-up and independent review complete, 16 November 2026. Release qualification pending.
Owner: this task's Chief of Staff coordinator.

## Requested outcome and authority

The maintainer explicitly requested unbundling FFmpeg now and accepts requiring
an externally installed `ffmpeg` executable. The npm distribution must stop
shipping FFmpeg libraries and programs while preserving live viewing/audio and
HomeKit Secure Video delivery. This is implementation authority, not authority
to commit, push, create a PR, merge, publish, install on Homebridge or change
provider/Home settings.

The initial verification research is in [verification preparation](../verification/README.md).
Bundling FFmpeg is an existing project architecture choice, not a Homebridge
verification requirement. Current distribution descriptions there refer to the
inspected RC and must be updated to the actual final package before submission.

## Context and isolation

The inspected RC uses a separate custom native worker linked to FFmpeg libraries;
its build disables FFmpeg command-line programs. The worker also supplies framed
packet/timestamp transport, MP4 preparation and libsrtp protection. An ordinary
`ffmpeg` executable does not implement that private protocol, so replacing its
executable path alone cannot satisfy this request.

Primary checkout: `codex/hsv-saved-clip-prototype`, older beta4 source, with
unrelated diagnostics and documentation changes. Existing linked release checkout:
`.worktrees/hsv-redesign`, `codex/hsv-stable-readiness`, clean at inspection. No
activity registry exists in either checkout; absence does not establish exclusive
ownership. The installed activity helper ran successfully using the existing
marketplace project environment, confirmed native thread identity and Git
registration, and reported zero records/errors for the linked release checkout.
No registry mutation has been attempted.

The maintainer explicitly approved `.worktrees/external-ffmpeg` on branch
`codex/external-ffmpeg`. The app initially created the checkout in its default
Codex directory; the same clean worktree was moved with Git to the approved
project path and reattached before editing. Baseline is main commit
`ab091a4bb79a79adfad6687c18f2bc64ad541395`. Native activity registration now tracks
codecs, recording, protection/distribution and integration. Existing project
Node dependencies were copied with filesystem cloning; no global install ran.

## Requirements and acceptance

| ID | Required result | Evidence |
| --- | --- | --- |
| REQ-1 | No FFmpeg executable, linked FFmpeg library, or FFmpeg source archive in the npm artifact. | Inspect final tarball, dependency closure and retained helper imports; reject stale generated codec-worker output. |
| REQ-2 | Use an externally installed executable with documented discovery/configuration and actionable missing-capability errors. | Explicit-path/PATH, missing executable, spaces, invalid path and codec probes; shell-free launch. Preserve an existing valid `ffmpegPath` during migration. |
| REQ-3 | Preserve supported live H.264 and Opus/PCMA/PCMU delivery, source clocks and cancellation. | Actual external-executable integration, decoded media, audio priming, low-rate video, bounded backpressure and teardown tests. |
| REQ-4 | Preserve native-USB finite recording, privacy fences, audio-off and bounded repair/salvage. | Seekable MP4, metadata-only samples, low-FPS/fragment boundaries, broken audio, strict MP4 verification and recording-controller regressions. |
| REQ-5 | Keep provider TLS/destination checks and HomeKit output ownership in the parent; no URLs/credentials/SRTP keys in child arguments, environment or temporary key files. | Canary metadata/log checks, forbidden-connection tests, actual SRTP receiver and lifecycle tests. |
| REQ-6 | One canonical external-media path; remove obsolete codec/build/package code and update affected configuration, migrations, docs and release gates. | Final callers/diff review, build/packed inventory, existing suites and independent review. |

No configuration or operational data is to be deleted. The external dependency
changes installation prerequisites; document that explicitly. Existing immutable
releases remain intact. Changed runtime requires a fresh RC and new physical
acceptance before stable promotion.

## Provisional design and proof gates

Retain the existing parent media/session/recording ownership contracts. Replace
the codec portion with external FFmpeg fed through private pipes. A synthetic
host FFmpeg 9.0.2 probe established that tee outputs containing raw video/audio
packet data plus `framecrc` metadata match packet sizes and checksums for Opus,
PCMA and PCMU. Source timestamp offsets survived that probe.

Retaining a small **libsrtp-only** helper is the current preferred boundary:
existing `native/protection.inc` does not depend on FFmpeg. It can preserve the
existing key-private packet protection contract without introducing a new
JavaScript cryptography implementation. This does not retain bundled FFmpeg.
Its final build/package/license closure must prove that distinction.

Select the raw-data plus `framecrc` transport. Drain all descriptors concurrently,
bound unmatched payload/metadata, pair exact sizes/checksums, preserve signed
source PTS/DTS/duration and reject surplus/missing bytes. G.711 packets require
bounded repacketization with per-sample timestamp offsets. No FIFO packet drop
or ignored tee output error is permitted.

Independent review and consumer tracing resolved the apparent skip-metadata
blocker: `audioTiming`, padding and skip counters only feed diagnostic receipts;
they do not affect RTP payloads or pacing. Remove those obsolete private fields
rather than invent values or introduce a second runtime `ffprobe` process.
Preserve actual encoded bytes and original framecrc timestamps, including Opus
priming. Qualification can measure pre-skip from a bounded synthetic OpusHead
probe using the same executable/settings and independently decode receiver audio.
This changes internal representation; content/timing checks remain required.

A host-only seekable-descriptor probe passed with an ordinary MP4 whose `moov`
follows `mdat`: external FFmpeg read inherited read-only stdin through `fd:`,
produced fragmented output, and left the input hash unchanged. Windows handle
behavior still requires direct qualification. The existing TypeScript prepared
MP4 parser checks video structure and audio-track presence; it is insufficient
by itself to replace native decoded-audio timing and recovery validation.

The retained protection helper source is GPL-labelled. Removing FFmpeg does not
automatically make the distribution MIT-only; preserve applicable source and
notice obligations until the final helper closure has been reviewed.

The external FFmpeg build must be capability-checked. Host binaries have libx264,
libopus, AAC, PCMA and PCMU; neither observed build has libfdk_aac. AAC-ELD is not
part of the current advertised audio contract. The supported minimum executable
version/capabilities remain a design result, not an assumption from host success.

## Ordered work and evidence

- [x] Design and isolation: host transport/seekability probes, independent design
  review, individual worktree authorization, source baseline and ownership records.
  Cross-platform/decoder/recovery qualification remains unverified.
- [x] Backend: external executable/configuration, private codec process, retained
  SRTP-only helper, live and finite-recording integration with focused tests.
- [x] Distribution: remove FFmpeg build/source/native dependency closure, revise
  artifact qualification and license inventory, reject stale generated output.
  Preserve current candidate/publish intent and immutable source/integrity checks.
- [x] Integration: update canonical docs/migrations and verification draft; run
  targeted then broader checks and independent code/security review.
- [x] Handoff: report implemented versus unverified results, new RC requirements
  and physical Home acceptance still needed. No release action is implied.

### Initial media implementation evidence

The external live backend, finite conversion path, configuration/UI, reduced
libSRTP helper, source recipes and installed-package qualification scripts are
implemented locally. No version has been changed and no release action has run.
Existing `ffmpegPath` is preserved by configuration migration; an absent setting
defaults to executable discovery from the Homebridge service's PATH. No user
configuration rewrite is required specifically to adopt this backend.

Focused configuration/UI checks passed 42 tests; streaming/accessory/ownership
checks passed 158; platform/migration/install checks passed 92; recording-policy
checks passed 29. Twelve real external-process secrecy/resource tests passed on
this host, including actual process metadata inspection. Full source TypeScript
and ESLint passed. API contract validation passed for 347 endpoint records and
677 models. These counts describe separate runs, not one cumulative suite.

The independent review identified six concrete regressions. Source-origin frame
selection, square-pixel output, complete capability discovery, cancellation
during asynchronous input opening, cleanup-failure memory release and audible
A/V offset preservation now have corrections and regression coverage. Final
independent review closed all six findings, replayed the original cancellation
and cleanup failures and independently measured decoded-content onset drift of
at most 0.021 ms across zero/64 ms video offsets and 16/24 kHz output. No new
reportable defect remained in the reviewed scope.

Native helper tests passed 5/5; source/package boundary tests passed 46/46;
protection client/artifact tests passed 51/51; release-script tests passed 86/86.
Fresh helper and independent receiver import only macOS `libSystem`, with no
FFmpeg linkage. Initial actual external live qualification passed eight codec
combinations and finite qualification passed eleven scenario categories.
Fresh final media checks after the recording correction passed all eight live
combinations and 21 finite scenarios: eleven receipt selections, three positive
variants, three malformed/corrupt-source rejection cases and four decoded-content
onset cases. Retired C fixture/checker dependencies have been removed; these
portable cases run in the canonical installed-package qualification harness.

### Final local verification

- Full clean generated-output build and full source ESLint passed.
- Full Jest run: 85 suites and 2,384 tests passed; the one opt-in same-host UDP
  test timed out. An isolated probe of the actual built socket then delivered and
  reused the port in 4 ms; the unchanged Jest test passed on its focused rerun
  (13 ms body). Thus every one of the 2,385 tests passed across these runs, with
  the initial intermittent UDP timeout retained as an evidence limitation.
- Actual media qualification passed eight live combinations and all 21 finite
  scenarios, including independent SRTP authentication/decryption, decoded pixels,
  audible onset, source identity, audio-off, silence recovery and released memory.
- npm package contents/loadability smoke passed in explicit JavaScript-only
  mode. It is not five-target source/receipt or immutable release qualification.
- Final recording review independently reran 26 focused tests, matched all six
  frozen source/test hashes and closed privacy, cleanup and synchronization findings.
- Relative documentation links passed (124 links in 19 changed Markdown files),
  and whitespace checks passed. API contract validation passed as recorded above.

Final watcher logs and JSON are in `/private/tmp/blink-external-final-evidence`.
These local temporary logs are not a durable release receipt. Source and test
changes remain uncommitted in the approved worktree; no provider, Homebridge
installation or publication was changed. All four local implementation tasks
were reconciled with evidence, and this coordinator's exact activity record was
explicitly finalized. The dirty worktree remains intact and is not authorized
for removal.

Host evidence uses macOS arm64, Node 26.13.1 and external FFmpeg 9.0.2. The local
ignored runtime manifest is a synthetic single-host test fixture, not a complete
five-target release artifact. FFmpeg 6.1 execution, Windows and other host targets,
clean immutable installed-tar qualification and physical HomeKit acceptance
remain unverified. Publication still needs a new candidate and the normal gates.

Route: Project Delivery `medium-feature-change`, medium scale/high risk, authority
`change`. Required context/acceptance/design/planning/implementation/quality/docs/
review/release-preparation capabilities apply proportionately in this artifact
and the actual implementation evidence. Security/operations is activated because
media credentials, network ownership and recording privacy are affected.
Delivery coordination is not activated: no external mutation or cross-chat
communication is authorized. Retrospective is planned for an observed outcome.
Ready/Design and checkout gates passed for implementation. Release and physical
acceptance remain separate unpassed gates.


## Worktree attachment note

Git registers the approved `.worktrees/external-ffmpeg` path, and the chat has a
linked-worktree attachment for that path. The app also retains a stale managed
attachment for its original `~/.codex/worktrees/external-ffmpeg/homebridge-blinkcameras`
path after Git relocation. No Git checkout remains at that original path. Do not
archive using the stale attachment while this unfinished checkout exists; the
available attachment API cannot remove a stale worktree entry separately. All
commands and delegated ownership use the approved project path explicitly.

## Follow-up after the 1.1.0 release

The maintainer authorized removal of the automatic installation migration and
addition of `supports-hap`, then requested completion of the implementation slice.
A fresh public npm read at 15:49 UTC and the published GitHub release agree on
1.1.0, source `5df5f0d828ac1b936eb197564108e1a6cbd7912d`, and immutable package
integrity. That artifact still has `postinstall` and lacks the transport keyword.
Its accepted bundled-worker evidence cannot qualify the external backend.

The maintainer selected **2.0.0** for the combined change. An external FFmpeg
installation is a new prerequisite for existing 1.1.0 installations; compatible
packaging fixes alone would have fitted a patch. Native `npm version
2.0.0-alpha.0 --no-git-tag-version --ignore-scripts` updated the manifest and both
lockfile version fields. No commit, tag or publication was created. Follow the
established alpha/beta/RC process and changed-runtime acceptance before stable.

- [x] Package metadata: declare `supports-hap`, remove install/uninstall hooks and
  obsolete wrappers, clear root `hasInstallScript`, retain explicit migration tools.
- [x] Released-content integration: preserve 1.1.0's dependency and uninstall/Pi
  tooling cleanup, canonical documentation site and release notes. Combine the
  overlapping documents with external-media and explicit-migration changes.
  This reconciles file content; branch history/index remain unchanged.
- [x] Upgrade guidance: explain external installation and no conversion for an
  already-canonical 1.1.0 configuration; legacy settings use explicit preview and
  `--apply`, guarded atomic replacement and an exact-byte private backup.
- [x] Verification draft: target eventual stable 2.0.0, preserve 1.1.0 as the
  published baseline, and keep submission pending final publication/acceptance.
- [x] Final verification: fresh build/lint/Jest/package/docs checks
  and independent package/migration review.
- [x] Handoff: record final results and separately unpassed release gates.

Package slice evidence: 101 release-script tests, including 15 package contract
tests, and 29 explicit-migration tests passed. The actual extracted npm package
loads both migration entrypoints; preview leaves bytes unchanged, explicit apply
creates a private exact-byte backup and repeated apply is unchanged. A normal
offline `npm rebuild` of the actual packed package, with inherited synthetic
`UIX_STORAGE_PATH`, left configuration, authentication and accessory bytes
unchanged and created no migration backup. A full offline dependency installation
could not begin because cached `@eneris/push-receiver` metadata was absent; the
rebuild proof does not establish a complete clean installation.

The lockfile update removed five orphan entries, added none and changed no
resolved versions or integrity hashes. Documentation renderer tests passed 5/5;
the actual public build checked ten pages, an offline companion, four assets and
597 references at edition 2.0.0-alpha.0 using already-available pinned Marked
17.0.6. These are local source checks, not publication or physical acceptance.

### Final follow-up results

The final watcher passed all seven checks: build, lint, full Jest, extracted npm
package contents/loadability/migration smoke, documentation tests, public build
and site check. Jest passed **83 suites and 2,363 tests**; its one opt-in LAN UDP
test was intentionally disabled in this run. That unchanged test passed its
focused host run during the initial media verification, with the earlier timeout
recorded above. No source-suite test failed in the final follow-up run.

The final documentation output reports ten pages, one offline companion, four
assets and 597 references at 2.0.0-alpha.0. Package smoke confirms both extracted
migration commands preserve preview, explicit apply, exact private backup and
idempotence. Its explicit JavaScript-only mode does not establish complete
five-target source/receipt qualification or a clean dependency installation.
Temporary final logs are in `/private/tmp/blink-verification-final-evidence`.

Independent packaging review found no new reportable defect and passed 68
package/release/native contracts plus 29 migration tests. It confirmed version
and lock agreement, removal of install/uninstall hooks and wrappers, preserved
migration protections, dependency cleanup, explicit upgrade instructions and the
held 2.0.0 application draft. Earlier media findings remain closed; no runtime
media source changed during this follow-up.

Source remains uncommitted in the approved checkout on `codex/external-ffmpeg`.
No branch history, index, Git tag, remote PR/issue, published package, running
Homebridge host or provider setting changed. Five-host exact-artifact checks,
minimum FFmpeg 6.1 execution, physical HomeKit acceptance and the normal
prerelease/stable process still precede any publication or verification request.

The additional actual offline documentation build passed, making its documented
generated `index.html` available. All 222 relative file references across 25
changed Markdown files and the final whitespace check passed. Both follow-up
tasks were reconciled with these results, and only this coordinator's exact
activity record was explicitly finalized. The uncommitted worktree remains
intact for review and is not authorized for removal.

## Authorized implementation PR delivery

The maintainer subsequently authorized committing and pushing this slice,
opening its implementation PR for 2.0.0-alpha.0, and starting CI. This does not
authorize merging, publishing an alpha or stable package, deploying Homebridge,
or submitting the Homebridge verification request. Verification stays held until
2.0.0 is properly released and its final evidence is complete.

Preserve the reviewed tree on the existing local `codex/external-ffmpeg` branch.
Prepare the publication branch `codex/external-ffmpeg-alpha` from refreshed main
and carry only the net implementation diff into its commit. This keeps the
already-released 1.1.0 cleanup out of the PR without rewriting the existing
branch or discarding source changes. Local activity records, generated output,
native candidates and temporary evidence are excluded from both commits.
