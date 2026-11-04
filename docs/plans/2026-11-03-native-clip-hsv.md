# Implementation plan: native Blink clips in HomeKit Secure Video

## Approved objective

The operator approved the 3 November gap review and its implementation sequence:
repair the replay/media defects, integrate persistent saved-clip recording into
the existing camera accessories, then qualify recovery, idle activity and
concurrency on the Pi. This is local implementation authority. Publication,
production installation, pairing changes and service restarts remain separate
operator actions. The phone is unavailable for this work.

The existing source is `0ef68d13d525fbc959a15ac0ff18d14f3595bd6d` on
`codex/hsv-saved-clip-prototype`. Existing diagnostic changes belong to this
approved work. The untracked native verification receipt is unrelated and must
remain byte-for-byte unchanged. No new worktree or branch is required.

## Requirements

- Replay completed native clips through each existing HomeKit camera accessory.
- Saved-clip mode must not start a continuous camera feed when recording is idle.
  Continuous HSV remains a distinct explicit opt-in recording source.
- The same idle rule covers persistent thumbnail refresh and motion polling:
  prefer completed-clip cached previews with a truthful age. Explicit Home Live
  View remains available. Do not change Blink arming or motion settings.
- Discover native USB recordings by account, network, Sync Module, camera and clip
  identity; overlap catalog discovery and persist deduplication and job state.
- Persist manifest/prepared-download command context before polling. Pending
  provider commands use elapsed deadlines and backoff without duplicate prepare
  requests. The provider's capped catalog is not a complete recording history.
- Do not gate USB discovery on the camera's raw `local_storage_enabled` flag:
  the verified native clip was available while that flag was false. Module USB
  status, storage eligibility and actual native catalog responses are separate
  evidence; armed/online status alone does not prove capture.
- Bound pending commands, retries, downloads, preparation, queue depth, storage and
  concurrent work. Resume safely after restart and never delete native clips.
- Respect Home recording, camera and audio policy changes throughout a job and
  reuse the canonical media authority, destination and worker guards.
- Preserve originals and explicitly record any generated audio tail. Diagnose and
  regress the observed one-picture preparation omission; do not relax guards.
- Show native capture, download, preparation and replay health separately. HDS ACK
  or delivery must never be reported as confirmed iCloud retention.
- Expose the source mode and applicable Sync Module settings in the existing UI;
  use a backed-up, once-off conversion for existing configuration where required.
- Optional module settings must remain absent or a valid empty array when there
  are no overrides. Never create a blank invalid row. Show unresolved entries only
  when real persisted entries exist, with a working removal action.
- Explain that Home timestamps and replay motion occur at ingestion, native
  clip/retrigger gaps remain, and a replay prefix is not pre-motion footage.
- The final diagnostic must exercise the canonical production preparer and
  recording delegate. Retire the old external FFmpeg video conversion and
  duplicate finite replay lifecycle after their replacements exist; a
  diagnostic-only preview, if required, is a separate bounded JPEG role.

## Ordered delivery checklist

- [x] Repair and independently review diagnostic defects and native preparation
  fidelity/ingress. Pi qualification remains separately recorded below.
- [x] Integrate typed native clip discovery, persistent jobs and automatic replay
  into canonical production components; spec and bounded code-quality gates pass.
- [x] Add source-mode settings, configuration conversion and truthful health UI;
  spec and bounded code-quality gates pass.
- [x] Replace diagnostic conversion and finite-event duplicates with the canonical
  preparer and production recording delegate; retain explicit local controls.
- [x] Complete focused/full local checks, bounded independent recording-flow review and
  prepare a concrete Pi validation artifact.
- [ ] **Pending, root-owned:** with the operator-authorized test scope, qualify original-to-prepared-to-Home
  coverage, idle camera activity, restart recovery and multi-camera capacity.

## Phase 1: diagnostic correctness and media investigation

Diagnostic repair milestone is complete: all three reported defects have
regression RED/GREEN evidence; 39 focused tests, lint and build pass. Independent
spec, code/TypeScript and security reviews approve the frozen files. The full
Jest retry outside the socket-restricted sandbox passed 62 suites / 1,466 tests,
with 18 tests skipped. This establishes the diagnostic repairs, not real media
preparation or production behaviour. Native fidelity/ingress is now complete.

The native-ingress freeze passed independent spec and code/TypeScript/Python
review. Security identified new MOV table allocation amplification before decode;
the finite-only 64 MiB individual allocation and two-stream correction passed
independent spec, code/Python and security source review. The safely capped Linux
resource regression is now RED on the old worker and GREEN on the correction;
the Pi native suite and genuine-clip checks also passed. The earlier RSS disclaimer is
not an acceptance waiver for this new path. Execution receipts belong to the
[qualification record](../audits/2026-11-03-native-clip-hsv-qualification.md).

1. `scripts/hsv-clip-replay/index.cjs`: allow Stop and EOF to cancel a pending load
   rather than wait behind it; retain serialized ordinary operations. Report
   status phase under a separate field. Risk: medium; no dependencies.
2. `scripts/hsv-clip-replay/prepare.cjs`: include existing task-owned retained files
   when enforcing the scratch budget. Preserve evidence and reject unsafe files.
   Risk: medium; no dependencies.
3. `__tests__/hsv-clip-replay.test.ts`: demonstrate the three defects before fixes,
   then verify prompt cancellation, restart accounting and visible status phase.
4. `native/recording.inc`, `native/tests/test_worker.py` and the canonical media
   ingestion components selected by the architecture review: trace source,
   transport, decoded, encoded and muxed sample counts before changing native
   logic. Add a representative regression for any demonstrated cause. Risk: high;
   requires retained representative source or a faithful reproduction.

## Phase 2: production saved-clip lifecycle

The accepted [architecture contract](../adr/2026-11-03-native-clip-hsv.md) records
exact source-mode, identity, queue, ingress and cancellation contracts.
Extend `src/blink-api/` for typed native manifest/prepared download operations,
`src/platform.ts` for lifecycle ownership, and `src/accessories/camera-recording.ts`
plus `src/accessories/motion-base.ts` for a finite native source under the existing
camera controller. Durable jobs live in the existing plugin storage root with
owner-only files and atomic persistence. Do not reuse the cloud motion cursor as
the replay ledger or import the diagnostic into production. Risk: high;
dependencies: architecture contract and Phase 1 invariants.

Behavioral tests must cover repeated catalogs, late clips, identity mismatch,
pending commands, bounded download/retry, partial files, restart, queue pressure,
permission revocation and one clip being replayed once without any idle feed.
Correct the canonical `BlinkCommandStatus` type/validation in
`src/types/blink-api.ts` and the existing status reader while wiring durable
polling: actual native replies use numeric status plus boolean `complete`.
Do not add a parallel command client to work around that existing type mismatch.
Resource-progress tests must prove that downloads reserve the next prepared
output's room and cannot deadlock the bounded store with unprocessed originals;
account both actual files and in-flight/pinned reservations. Serial fair work is
an acceptable initial scheduler. The measured initial preparation ceiling is two
workers on hosts with at least four logical CPUs, and one on smaller hosts, subject
to storage and memory reservations. The Pi's two-worker batch took 49.041 seconds;
four workers took 91.187 seconds and increased temperature substantially. These
measurements do not establish sustained four-camera acquisition capacity.
They used the primitive driver's preset 1 (`ultrafast`); the canonical recording
helper uses preset 0 (`veryfast`). The canonical-path two-driver Pi batch has
since passed in 69.589 seconds (individual preparations 69.153/68.982 seconds),
preserving all source timestamps and releasing each budget. This qualifies the
native two-preparation workload, while the coordinator's shared aggregate budget
and sustained acquisition capacity remain separate contracts.
Align the ARM source-build lane with that profile by using compiler-supported
assembly. Retain unsupported x64/Windows build choices as appropriate and verify
the selected dependency recipe/receipt. Do not use the fast-profile default to
describe a shipped no-assembly worker.

Live API qualification exposed the catalog `size` unit: 5,073 represents a
KiB-scale estimate for a complete 5,194,528-byte response. Correct that label and
admission assumption without weakening actual-body, HTTP completion or hash
checks. Persist actual source length and reserve the full bounded source room;
the estimate must not be treated as exact bytes.

The typed native-storage API, canonical preparer and persistent coordinator are
implemented and independently reviewed. The coordinator's final shutdown fence
has 35 passing tests; the last full run before runtime integration passed 67
suites / 1,631 tests with 20 skipped. Existing-camera runtime integration is
implemented, with 217 focused tests and 59 tests after the motion-hold correction.
Its spec and bounded code-quality reviews passed; the independent quality check
ran five suites / 37 tests successfully against all 11 frozen source hashes. These
counts are attributed to those milestones and require final integration checks.

## Phase 3: settings, migration and observability

Extend `src/settings.ts`, `config.schema.json`, existing
`src/homebridge-ui/public/settings-ui.js`, the canonical migration script and
operator documentation. The architecture contract will identify any additional
existing configuration owner. Keep camera and Sync Module grouping aligned with
the approved UI. Test validation/defaults, effective source behavior and backed-up
conversion, rather than exact wording or DOM snapshots. Risk: medium;
dependencies: stable source mode and job contracts.

## Phase 4: qualification and handoff

Run focused tests during each change, then contributor checks: lint, build, full
Jest and Blink API contract validation. Native changes require their own native
tests and packaged-worker checks. Apply spec review before code-quality review at
each major milestone, and keep the final independent review bounded to the actual
recording-flow changes and source identity. Existing native/API reviews are
complete; do not expand this delivery into a new audit or fuzzing project. Refresh
the AST graph after source changes.

Pi qualification must distinguish synthetic/local checks, installed worker
identity, provider acquisition, Home delivery and exported retained media. Measure
each stage with monotonic durations and preserve explicit source/capture/replay
times. Profile preparation before optimizing it. Report queue growth, failures,
idle feed activity and capacity; do not infer losslessness, battery savings or
multi-camera throughput from unit tests. A finished source artifact does not
authorize installing it into production or publishing it.

## Known evidence and unresolved acceptance

The [prototype audit](../audits/2026-11-02-saved-clip-replay-prototype.md) records
complete fresh prepared-media retention for the instant-plus-motion-hold run:
1,800 video and 949 audio packets. Pacing was not required. Original preparation
omitted one decoded picture; native audio ended approximately 0.598 seconds before
video and required separate normalization. Pi preparation took approximately 98
seconds for 60 seconds of footage. These are historical prototype limitations.
The representative originals and prepared baseline have since been recovered to
private ignored storage with verified hashes. The corrected native pipeline
preserves all 1,801 decoded pictures and their timestamps in the tested source;
the primitive Pi preparation run took 38.548 seconds with 9,567 generated silent audio
samples. The actual canonical `prepareSavedClip` path subsequently passed on the
Pi in 57.563 seconds using its unchanged preset 0: 1,801 decoded/selected/encoded
pictures, 61 complete fragments and zero retained budget after disposal. Its
output hash differs from the primitive preset-1 profile as expected. This is
local/native qualification, not production or Home retention acceptance. A
diagnostic using the canonical preparer and the older replay lifecycle produced
a Home event labelled one minute and observed playback beyond 45 seconds; no
export was recovered for packet comparison. The Pi subsequently rebooted and
the temporary paired test state was lost. A durable artifact using both canonical
components is required for the next test. Pairing recovery or a new operator
pairing remains an explicit physical acceptance dependency and does not block
local source, configuration or test completion.

## Final local delivery evidence

Local implementation and the bounded stage reviews are complete. The final
combined checks passed lint, build, 72 Jest suites / 1,661 tests (20 tests in two
suites skipped), Blink API contract validation (347 endpoints / 677 models), and
28 native-package checks. One native-package assertion initially assumed the old
literal build command; its correction now executes the effective argument
selection for all five lanes while retaining download-before-verification and
ARM assembly checks. The workflow itself did not change in that correction.

The canonical diagnostic passed 25 focused tests and a generated two-second
fixture through its new preparer, native worker and production recording
delegate: 30 decoded/selected/encoded pictures, one final packet marker, matching
prepared/offered hashes and zero retained budget after disposal. This generated
fixture is separate from the genuine Blink inputs qualified on the Pi.
The local synthetic settings preview was visually inspected and its source/module
controls captured; it did not contact Blink or a production Homebridge instance.

The current retained private artifact is
`logs/hsv-validation-20261103/final-validation-runtime-20261103-hap230.tar.gz`, SHA-256
`ce307e0f4f50b3426276fe1b268d99ce491a8fb5e83fda62134d24e8d6a3db41`.
All 263 payload files match its retained manifest. It is an isolated validation
runtime using an explicit host-qualified protocol-4 worker, with no five-target
release workers, media or credentials bundled. Release regeneration, publication
and production installation remain outside this approval. The branch and base
commit are unchanged, no files are staged, and the protected unrelated receipt
retains its original hash. The AST-only graph refresh completed with 4,569 nodes
and 9,307 edges. Root owns durable Pi launch and physical acceptance evidence.

The original `final-validation-runtime-20261103.tar.gz` (SHA-256
`602898842d970e6efcc32a631f9df5e3d33df4842995ec52f6117eba9d19c87a`)
is retained as earlier evidence. Its first Pi startup correctly rejected a HAP
identity outside its explicit admission list: the installed Homebridge/HAP
packages had changed externally from the previously inspected beta to stable
Homebridge 2.5.0 / scoped HAP 2.3.0. A private captured exception established the
manifest guard as the failing statement before HAP construction. Root verified
the current primary API surface and callbacks, then the bounded correction added
only that exact scoped HAP 2.3.0 identity, with 25 focused tests and independent
quality approval. Compiled recording code, worker and media inputs did not
change. The revised archive preserved the existing replacement identity/state and
successfully launched on the Pi at 14:14:01 UTC: listening on the selected
`wlan0` interface and port 53632, reporting scoped HAP 2.3.0, with empty stderr.
Root has requested manual pairing using privately retained setup instructions.
This establishes the corrected isolated startup; Home recording and retained
playback acceptance remain pending. The AST refresh after this delta completed
with 4,570 nodes and 9,308 edges.

## Approved readiness delivery — 4 November 2026

The operator approved the remaining readiness implementation: guided ordinary
setup, truthful per-camera status and recovery, current Node 26 support with
runtime evidence, and a concrete end-to-end test candidate. They also requested
a documentation-specialist-led overhaul of the written documentation, including
a clearly labelled unreleased **What's New** near the top of README. This is
implementation and test-readiness authority; it does not authorize a release,
publication, verification submission, production installation or restart.

This checklist is the current delivery sequence; the earlier physical acceptance
remains pending and root-owned. Use one product writer at a time, with bounded
read-only architecture/documentation work in parallel where file ownership is
clear.

- [x] Freeze the canonical readiness/health interfaces, observation and
  baseline rules, and exact Node/runtime/package qualification requirements.
- [x] Align supported Node engines, the necessary supported dev host,
  CI and package checks; correct the proven protocol-4 packaging assertion and
  qualify an identified snapshot with root. Independent specification and quality
  reviews approve the frozen slice. Actual Node 22.23.4, 24.22.2 and 26.13.0
  lanes each passed strict install, lint/build, 200 HAP tests, 88 workflow/package
  tests, API validation and a JavaScript-only packed entrypoint/registration smoke.
  Native five-target packaging and physical Home acceptance remain separate gates.
- [x] Implement runtime readiness and the bounded health projection with the
  canonical resolver, coordinator and HAP observations. Independent specification
  and quality reviews approve the frozen 14-file delta. 370 focused tests and
  root’s broad Node 26 pass (73 suites / 1,673 tests, 20 skipped) passed. The sole
  quality blocker, provider capture timestamp representation, was corrected only
  at report projection with a composed-reader RED/GREEN and 60 focused passes;
  ledger and clip identity remain unchanged. Corrected archive `3c40f29d…001d` is retained.
- [x] Implement the guided GUI journey, per-camera progress and actionable
  recovery. Independent specification/quality and root’s actual nine-scenario HTTP
  functional review approve it. One hierarchy correction moved activity up and
  disclosed setup; its focused 51-test pass, independent delta review and actual
  corrected visual review passed. Retained corrected archive is `ed38f443…c915`. Valid
  Save and explicit manual Home confirmation remain separate from readiness.
- [x] Implement safe-default build-only mode through canonical five-target
  packaging and qualification. Independent specification and root quality review
  approve `6407d759…3af4`; 90 Node contracts and 3 caller tests, lint/build/diff
  passed. Root’s integrated Node 22, 24 and 26 lanes are all green. No
  dispatch, publication or external change is authorized.
- [x] Complete the documentation overhaul: all 20 selected guides/indexes,
  the unreleased README announcement and ordinary setup/Home review/recovery
  runbook are frozen. 166 local links, 46 anchors, 7 parsed JSON/JSONL values
  and 3 schema-validated configuration fragments passed. Root’s independent
  critical-guide review approved the result; historical bodies remain intact.
- [x] Complete bounded milestone reviews and final executable verification.
  Actual Node 22.23.4, 24.22.2 and 26.13.0 each passed strict install, lint/build,
  73 Jest suites / 1,678 tests, 106 Node contracts, API validation and JavaScript
  package smoke. Twenty optional cases per lane remain explicitly skipped.
  Root has the identified source/documents and exact ordinary-package generation
  and physical E2E dependencies. No normal five-target protocol-4 package exists
  yet; source/GUI checks are not saved Home recording acceptance.

Readiness must cover every selected camera, including unavailable selections and
continuous-only configurations. Report effective source/module, canonical
eligibility reasons and observed Home configuration/recording/camera/audio/
trigger policy, or unknown. Show actual module baseline completion and the
applied settings revision; do not reuse an old report as proof that a draft or
saved-but-not-restarted selection is ready. The fresh-event instruction follows
Home policy and baseline readiness. Capture, preparation, offer and Home review
remain different stages, with no automatic iCloud retention claim.

Native Local Storage versus daily Cloud Clip Backup remains an explicit
preflight. The unreliable raw local-storage flag is not an eligibility gate.
Saved replay requires supported motion policy; the ring-only case must be
truthful without adding automatic ring delivery. Manual Live View can consume
battery. Reuse coordinator state and the bounded health channel; no parallel
recorder, archive or provider client is introduced for the GUI.

Root owns actual Node runtime execution, Pi candidate/worker staging and physical
evidence. The Node milestone resolved the supported dev-host engines and the
canonical packager's incorrect protocol-3 source assertion. A real normal package
still requires exact committed sources and five genuine target archives. No commit or fabricated manifest is authorized to bypass that
dependency. The candidate must state precisely which of those inputs exist.

The accepted readiness contract uses one platform-composed version-2 report,
fed by coordinator activity and separate raw HAP observations. It includes every
selection, canonical availability, actual baseline initialization, coherent
per-job timestamps and an applied recording-settings revision shared with
validation. Explicit motion-allowed/denied transitions are privacy cutovers;
ordinary codec renegotiation is not. The detailed extension contract is appended
to the existing ADR. The documentation lead owns the final written overhaul
after runtime/Node writers freeze; it has selected RECORDING.md as the single
guided HSV journey and README as the short unreleased announcement/entry page.

This delivery's regular qualification uses explicitly selected nvm Node 24.22.2;
the Mac's existing default may remain 24.15.0 and is not changed by this task.
Node 26 is an explicitly selected compatibility runtime. The operator separately
upgraded the Pi's actual Homebridge service Node to 26.13.0; its general shell
Node remains 24.13.0. Root confirmed Homebridge 2.5.0 /
scoped HAP 2.3.0 declare Node 22.12+, 24 and 26 support; the necessary dev-host/
lock update and scoped test imports are authorized, without an arbitrary public
minimum-Homebridge bump. Parent and child runtime paths/versions must be recorded
for qualification.

### Node milestone evidence — 4 November 2026

The immutable Node slice archive is
`logs/hsv-readiness-20261104/node-source-slice/qualification-source.tar.gz`, SHA-256
`2e6a7a929a28eaf189ca16817cf90318047b4c2ea0f9f834651e94f9d6cdd013`.
Independent specification and quality reviews approved its 17 owned files. Root's
`node-milestone-matrix-003458/results-network-enabled.json` records green strict
install, lint/build, 200 HAP tests, 88 workflow/package tests, API validation and
JavaScript-only packed registration on each actual Node 22.23.4, 24.22.2 and
26.13.0 lane. Initial UDP-restricted sandbox attempts remain evidence of the
environment limitation; the unchanged snapshot passed outside that restriction.

Root also ran the canonical preparer with the Pi's actual service Node 26.13.0,
matching four compiled modules to the frozen snapshot and the qualified
protocol-4 worker. The retained 12,260,089-byte native source produced all 1,801
decoded/selected/encoded pictures and 61 fragments in 57.986 seconds. Its
15,272,805-byte output matched canonical SHA-256
`b37dd78b8dd57671101019e8def69901a99e124dabfb82e77d33425c02a00cb1`;
the budget returned to zero after disposal. This is actual native-path Node 26
qualification on one retained fixture, separate from Home retention, sustainable
multi-camera capacity and ordinary five-target artifact generation.

### Documentation lead handoff

The broad overhaul will keep `docs/RECORDING.md` as the single guided ordinary
setup, first native event, Home review/export and recovery journey. README owns
the short upcoming/unreleased announcement. Reference, troubleshooting, developer
and release guides should link to those owners rather than copy their procedures.
The specialist's inventory found current worker-distribution, Node 20 and
continuous-only health descriptions to reconcile. Historical version/evidence
records and generated contract/license content remain historical or generated.

The tested provider topology is four `catalina` camera-product targets and one
`sm2` Sync Module target, with actual native USB manifest and prepared-clip
retrieval evidence. Those provider kinds are not verified retail model names.
Current complete billing/trial state, retail camera generation and region are
unverified; an inactive attached Plus-plan object is not proof of subscription
status. The raw camera local-storage flag remained false despite successful
retrieval. The public matrix must preserve these limits rather than extrapolate
universal camera/account eligibility.

### Build-only workflow contract

Reuse the existing publication workflow and canonical builders. Dispatch defaults
to `mode=build-only`; an omitted version uses the checked-out manifest version.
An explicit version must match it. Only explicit `mode=publish` on main with an
exact nonempty matching version may reach publication, write permissions, OIDC,
release environment or GitHub credentials. The publisher must enforce this before
external commands/requests as well as relying on workflow conditions.

The read-only path is intent → source gates → canonical package → all five
installed target qualifications → canonical aggregate/completion. Completion
retains the exact tar, package receipt, all five target receipts and an aggregate
receipt bound to source SHA, mode, package identity/integrity, source bundle and
worker/receipt hashes. Physical Home testing follows candidate generation. No
parallel packaging path, fabricated target manifest or physical-test circular gate
is introduced. Publication consumes and rechecks the completed artifact.

The current bounded ownership is `.github/workflows/publish.yml`, the existing
release-policy/native-qualification/publish helpers and their tests, the existing
native-package workflow contract test, and the proven caller
`scripts/release.mjs` with `__tests__/release-script.test.ts`. Caller discovery
found that sole executable entrypoint; it must add explicit `mode=publish` to
both normal and removed-`--yes` guidance when dispatch defaults to build-only.
The documentation lead owns RELEASE.md after this source freeze.

Executable regressions must cover mode/ref/version scenarios, effective inherited
permissions and dependency reachability, publisher refusal before any external
call, exact-five receipt persistence/tamper rejection and the existing release
caller's publication intent. Source, recipe, pins and genuine five-target gates
remain unchanged. No remote run is authorized. After all local work is ready,
root may request the concrete final approval for a coherent source commit/push
and `gh workflow run publish.yml --ref codex/hsv-saved-clip-prototype -f mode=build-only`,
then verify the run's exact head SHA and preserve the candidate artifact.

### Final local handoff

All approved local implementation, documentation and bounded reviews are
complete. The final source/documentation identity is recorded separately at
`logs/hsv-readiness-20261104/final-readiness-source/source-freeze-receipt.json`.
It retains the matrix's 255 non-Markdown file identities and the reviewed
documentation. Root's frozen execution record owns actual runtime/physical
evidence; the source snapshot is not an ordinary installable package.

The remaining concrete action is authorization for a coherent source commit/push
and the existing build-only workflow run, followed by all five genuine target
artifacts and the normal GUI E2E runbook. Publication, production installation,
Homebridge verification submission and a claim of complete fresh-event Home
retention are not part of this local handoff. No branch or worktree change, commit, push, dispatch, publication or
production change occurred. The existing synthetic
preview remains available in task session 91864 through the handoff.
