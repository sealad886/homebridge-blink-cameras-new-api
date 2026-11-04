# HomeKit Secure Video product readiness — 3 November 2026

## Assessment and scope

Continue with the canonical saved-clip pipeline. Its source, local tests and
native/provider evidence support the design direction. This review reconciled
the stale canonical guidance. Remaining product barriers are an incomplete
first-user journey, unexplained recording availability, and missing
installed-package/physical acceptance. Broad HSV beta promotion and a Homebridge
Verified application are premature.

This assesses the uncommitted implementation on
`codex/hsv-saved-clip-prototype`, based at
`0ef68d13d525fbc959a15ac0ff18d14f3595bd6d`. Two independent reviewers traced
setup/maintenance and recording/recovery. The review also completed necessary
reconciliation of the already-approved behavior in the configuration reference,
two troubleshooting sections and one schema description. That scoped correction
does not change runtime/UI behavior, engines, CI or features. No release,
installation, submission, issue or PR was changed. Existing green suites were
not rerun; one small synthetic policy probe resolved a doorbell-trigger question.
Official Homebridge, Apple and Blink findings were checked by root on this date.

The current evidence is **72 passing Jest suites / 1,661 tests, 20 skipped**,
passing lint/build/API/package checks, and **25 passing focused diagnostic
tests** after the exact HAP 2.3.0 admission correction. Genuine Blink clips passed
native preparation with all tested decoded pictures/timestamps preserved. The
fully canonical diagnostic has started on the Pi; its new Home recording test is
still pending. The earlier Home event used the prior event lifecycle and played
to approximately 45 seconds, beyond the earlier 38-second cutoff, without a
recovered export proving full coverage. These are different proof levels. See the
[qualification record](2026-11-03-native-clip-hsv-qualification.md#final-local-implementation-and-isolated-launch).

## Product boundary

The plugin should make eligible cameras easy to connect and diagnose, preserve
their existing Home identities, and supply correct video. Apple Home owns
recording policy, rooms, timeline playback, content classification and supported
search. The plugin cannot promise permanent storage, custom Home folders/tags,
historical insertion or bulk archival without a supported API.

Strengths to preserve are the five task sections, discovered camera selection,
separate saved/continuous sources, implicit module defaults, removable overrides,
valid Save behavior during health failures, existing-accessory registration, and
honest offer/acknowledgement versus retention language. The old blank override
row is fixed. The diagnostic's additional pairing, qualification flags and
private supervision are developer tools; they must not become normal setup.

## Findings and disposition before broad HSV beta promotion

| Finding | Current evidence and user consequence | Minimum recommended outcome |
| --- | --- | --- |
| **R1. Resolved — canonical source guidance** | The review found continuous-only explanations, missing source/module options and cloud-poller troubleshooting that contradicted the saved-clip default. The [configuration reference](../configuration.md#homekit-recording-and-feed-limits), [schema description:120](../../config.schema.json#L120) and affected [troubleshooting sections](../troubleshooting.md#motion-not-detected) are now reconciled with [RECORDING.md:12](../RECORDING.md#L12). | Completed the necessary documentation correction: saved default, continuous opt-in, separate cloud/state and USB polling, native storage distinction, manual Home policy and baseline-before-test. JSON parsing, a schema comparison allowing only this description, unchanged unowned troubleshooting content, link checks and diff checks passed. Runtime/UI behavior, engines and CI remain unchanged. |
| **R2. Selected does not mean available or configured** | The [picker:177](../../src/homebridge-ui/public/settings-ui.js#L177) offers every included camera. The [resolver:77](../../src/settings-inventory.ts#L77) can reject its module/name association, and [platform:396](../../src/platform.ts#L396) then omits recorder registration. [Health UI:249](../../src/homebridge-ui/public/settings-ui.js#L249) may show only a generic save/restart hint. Its [report shape:79](../../src/native-clip-recorder.ts#L79) has no effective-source, baseline-ready or current permission state. Repeated restarts cannot resolve every such case. | In the existing recording page, make each selected camera's effective source, module and actionable availability reason visible. Show Home policy only from observed HAP state, otherwise unknown. Use canonical coordinator/resolver state; do not create a second recorder or claim to verify iCloud retention. |
| **R3. Native storage eligibility needs a real preflight** | The guide says to confirm clips in Blink, but cloud clips and daily USB backups are different from fresh native Local Storage. USB presence, armed/motion/online flags and a unique module association do not prove this source can deliver new clips. The raw `local_storage_enabled` flag is also insufficient: an actual USB clip was retrieved while it was false. | Publish the verified camera/module/storage/account/region combinations. Explain native Local Storage versus Cloud Clip Backup, label unknown combinations unverified, and require a fresh native-file test. Decide separately whether broader cloud-source support is wanted; the present implementation must not imply it already exists. |
| **R4. First-clip completion/recovery is hard to observe** | The corrected guide/troubleshooter now explain the test order, but the UI still lacks baseline-ready and observed permission states. The [first catalog:334](../../src/native-clip-recorder.ts#L334) intentionally establishes a baseline, so an event generated too early can be correctly observed without replay. The [UI:257](../../src/homebridge-ui/public/settings-ui.js#L257) mainly renders reason codes and timestamps. | Make the documented progression observable: waiting for Home configuration/policy → initial catalog baseline → waiting for a fresh native clip → downloading → preparing → offered → user confirmation in Home. Map common existing reasons to safe next actions. Lack of ACK must never prompt automatic duplicate replay. |
| **R5. The supported trigger-policy boundary is unclear for doorbells** | A matched doorbell can be selected. The [saved delegate:186](../../src/accessories/camera-recording.ts#L186) requires motion trigger `1`; a valid ring-only selected configuration `[2]` returns `not-offered/configuration-changed`, although the configuration has not changed. A synthetic delegate/buffer probe confirmed this without I/O. This is **not** a blanket doorbell failure: both repository HAP 0.14 and the current Pi HAP 2.3.0 add sensor motion alongside the [doorbell override:212](../../src/accessories/motion-base.ts#L212). Motion-enabled configurations can pass. | Explicitly qualify/document supported Home trigger policies, including motion for saved replay. Align advertised/selected events and the unavailable reason before broad doorbell HSV claims; this does not block motion-camera support by itself. Automatic Blink ring delivery is already [documented unsupported](../../README.md#L69); adding it is a separate product decision. Root confirmed the current HAP 2.3.0 additive construction in CameraController.js:407 and DoorbellController.js:82. |

The support matrix should list the tested combinations and mark other cases
unknown/unverified; it does not require exhaustive model or regional testing
before a bounded motion-camera beta.

Blink explicitly distinguishes native Local Storage from daily Cloud Clip Backup;
subscription/trial status can change which model applies. A connected USB drive
does not settle that question. This is the reason for R3's support matrix and
fresh-file check, rather than a recommendation to trust another cached flag.
[Blink storage guidance](https://support.blinkforhome.com/en_US/514890).

## Ordinary first-user journey

1. Confirm a supported native storage arrangement and Apple Home prerequisites.
2. Complete the existing hosted Blink sign-in/callback and any separate account
   verification. Stored tokens are not proof of Home recording permission.
3. Discover/include cameras, choose recording cameras, and review their effective
   source/module/availability. Saved clips remain the default; continuous capture
   requires a deliberate choice.
4. Save through Homebridge and perform the normal child-bridge restart. Retain
   the existing Home camera identity, user name and room; do not add the standalone
   diagnostic camera as part of product setup.
5. In Apple Home, enable recording for the wanted Home/Away locations, camera and
   audio policy. Use an appropriate motion-enabled policy for the initial test.
   In Blink, enable native capture, arming and camera motion as needed.
6. **Wait for the initial catalog baseline to finish, then generate a fresh
   event.** Follow the same clip through download, preparation and offer.
7. Locate the event on the correct Home camera around its **Home ingestion/offer
   time**, play its beginning/middle/end, and save/export an important clip. Only
   this last manual check establishes that the user can retrieve a recording.

Recovery guidance should distinguish no native Blink clip, unavailable source,
missing Home policy, provider outage/sign-in failure, bounded queue/storage delay,
preparation failure, and uncertain Home delivery. Point to existing connection
retry, inventory, Blink-native recording and Home review actions. Do not imply
that enabling the cloud motion poller fixes USB capture or that another restart
fixes every missing report.

## Finding, reviewing and organizing video in Apple Home

Use meaningful, stable camera names and rooms. Apple Home supplies camera history,
timeline playback and hub-generated person/animal/vehicle/package classification;
the plugin does not author those labels. Native capture time and delayed Home
ingestion time differ. Keep both visible in diagnostics and teach users which
time to use in Home, especially around day boundaries. The existing guide
[already discloses this delay](../RECORDING.md#L44), but a latest-time report is
not a history-to-history cross-reference.
[Apple Home camera guidance](https://support.apple.com/en-gb/guide/home/hmeb54708fc8/mac).

Opening a camera tile in the Mac Home app starts Live video. Saved-clip mode avoids
an idle recording feed, but ordinary Live View remains a camera action that can
use battery, including when opening a camera to reach its history. Retain this
manual-view distinction in setup and battery guidance.
[Apple's Mac camera workflow](https://support.apple.com/en-gb/guide/home/hmeb54708fc8/mac).

Home's HSV history is a rolling ten days, with camera entitlement depending on
the iCloud+ plan. Important clips should be saved/exported through Home; temporary
plugin files are not an archive. A new-user review guide should explain this
without making the plugin store or infer the user's subscription.
[Apple camera recordings](https://support.apple.com/en-nz/guide/iphone/iph7bc5df9d9/27/ios/27).

Current Apple capabilities also include video descriptions/summaries and reduced
notifications for eligible users, plus camera-clip search in Home or Spotlight
on eligible iOS 27/iCloud+ configurations. These can help users find recordings;
they are **optional native Home features**, conditional on device, OS, account and
region. They are not yet demonstrated by this integration, and basic recording
must not depend on them. Do not promise plugin-specific folders, tags or
backdating. [Apple video summaries](https://support.apple.com/en-gb/127902),
[iOS 27 features](https://support.apple.com/en-gb/149076).

## Release and verification acceptance

| Gate | Evidence already available | Still needed |
| --- | --- | --- |
| Normal install and package | Canonical worker loader, local checks and isolated host-qualified runtime are available. | Build the five matching protocol-4 workers and corresponding-source archive, then test the actual ordinary package through the GUI/default startup. Old protocol-3 release assets cannot represent the new source. The private qualified-worker CLI is not the distribution path. [Release packaging](../RELEASE.md#L119), [qualification:401](2026-11-03-native-clip-hsv-qualification.md#L401). |
| First native event on an existing camera | Native catalog/full download and genuine-source preparation succeeded; local target/identity tests pass. | After baseline, one fresh native clip must reach the correct existing Home camera, retain identity/name/room, play beginning/middle/end, and yield an export covering the prepared media. Neither the old event lifecycle nor the new diagnostic's listening state proves this. [Qualification:395](2026-11-03-native-clip-hsv-qualification.md#L395). |
| Permission and recovery | Epochs, revocation, persistent dedupe, pre-offer recovery and post-offer uncertainty have local tests. | In an isolated installed instance, check actual Home off/on, one pre-offer restart, one post-offer interruption and one provider recovery, with no off-period catchup or duplicate offered event. [Coordinator:124](../../src/native-clip-recorder.ts#L124), [delegate:219](../../src/accessories/camera-recording.ts#L219). |
| Idle activity and useful capacity | Source/snapshot tests prevent idle live/capture requests; bounds reserve output room. Canonical Pi preparation took roughly 56–58 seconds for the tested one-minute source; two preparations took about 69.6 seconds. | Observe an actual idle interval and one modest overlapping-camera burst on the claimed topology; record delay, bounded occupancy and progress. This establishes activity/load behavior, not measured battery life or sustained four-camera full-length acquisition. [Limits and reservations](../../src/native-clip-recorder.ts#L15), [qualification:222](2026-11-03-native-clip-hsv-qualification.md#L222). |
| Home review experience | Delayed capture/offer facts are preserved; transport retention claims remain truthful. | Have a new user find/play/save the result using ordinary Home controls. Where eligible, optionally check native search/descriptions; their absence must not be diagnosed as a plugin recording failure. |
| Homebridge Verified runtime coverage | Current [engines](../../package.json#L62), [CI](../../.github/workflows/test.yml#L18) and [release guide](../RELEASE.md#L88) cover 20/22/24. | The current official policy requires all supported Node LTS releases, now **22, 24 and 26**. Add Node 26 only with engine, CI and actual supported install/runtime evidence; changing the declaration alone does not satisfy this gate. |

For the measured fixture, two approximately one-minute clips in 69.6 seconds
imply about **1.7 clips/minute before provider/queue overhead**. This is a
calculation from that workload, not a qualified production limit. Four cameras
frequently producing minute-long clips can outpace it. Queue bounds and the
15-minute expiry can then skip Home copies while the plugin leaves Blink
originals in place. Publish tested topology/cadence and make backlog/expiry
visible. A modest burst does not establish sustained four-camera coverage or
justify a promise that no video is ever omitted.

The canonical
[Homebridge Verified policy](https://github.com/homebridge/plugins/wiki/Verified-Plugins)
was checked on 3 November (page updated 1 November). It also calls for a dynamic
platform, a settings GUI, inert unconfigured startup, ordinary installation
without special startup/TTY requirements, no system-changing install script,
Homebridge-owned cache/key storage, handled errors, no analytics, public npm and
issue tracking, and release notes for releases. Record these against the exact
distributed package before applying; this bounded review does not certify them
all. Diagnostic TTY/supervision is not evidence of a product violation or a valid
ordinary setup requirement. The five-target worker gate above is this project's
distribution requirement, distinct from the official Node/runtime criteria.

Another Blink plugin, `@jackietreeh0rn/homebridge-blink-security`, is already
listed as Verified. The policy does not automatically accept a plugin offering
the same or less functionality. Native saved-clip HSV can be a useful
differentiator once demonstrated, but neither novelty nor compliance guarantees
approval. The examined [competitor README](https://github.com/BitWise-0x/homebridge-blink-security)
does not document HSV; that limited observation does **not** prove an exhaustive
“first Blink-to-HomeKit HSV” claim. Use a precise feature description until a
broader comparison supports such a claim.

## Optional follow-up and decision order

Optional improvements are browser-neutral sign-in copy (the UI promises Brave
but uses ordinary `window.open`), a Home-review handoff keyed by camera and offer
time, and a small recent-event trace derived from the **existing coordinator**.
Do not introduce another media archive or retention model. Keep detailed IDs and
resource limits accessible for troubleshooting while making camera, source,
module and next action primary.

The R1 guidance reconciliation is complete. Next decide the R2–R5
eligibility/status/trigger outcomes, then complete the normal-package and
existing-camera acceptance above. Qualify Node 26 and the
remaining official criteria before a verification application. New UI features,
cloud-source coverage, ring support, release work and submission remain future
decisions; this assessment does not implement or authorize them.

## Approved implementation disposition — 4 November 2026

The operator has since approved the bounded R2–R5 readiness corrections, guided
GUI setup/recovery, current Node support, an ordinary-package E2E build route and
a documentation-specialist-led overhaul. The assessment above preserves what
was observed on 3 November; this section records subsequent implementation
rather than treating the older line anchors as an up-to-date completion claim.

**Node source/runtime milestone complete.** Engines and CI now cover Node 22, 24
and 26, with supported Homebridge 2.5.0 / scoped HAP 2.3.0 development hosts. The
existing public minimum Homebridge version was not arbitrarily raised. The
canonical protocol-4 packaging assertion was corrected without weakening the
five-target/source/integrity requirements. Independent specification and quality
reviews approved the identified snapshot. Root executed strict installs,
lint/build, 200 HAP tests, 88 workflow/package tests, API validation and
JavaScript-only packed registration successfully on each actual Node 22.23.4,
24.22.2 and 26.13.0 lane. Root also qualified retained native-clip preparation
under the Pi's actual service Node 26.13.0, preserving all 1,801 tested picture
timestamps and the canonical output hash. These checks establish this runtime
milestone; they do not establish normal five-target package or Home retention
acceptance. The [4 November execution record](2026-11-04-hsv-readiness-qualification.md)
owns the exact executed runtime and artifact evidence.

Runtime readiness, GUI, build-only workflow and documentation implementation
remain in the [approved delivery plan](../plans/2026-11-03-native-clip-hsv.md#approved-readiness-delivery--4-november-2026).
Physical fresh-event, recovery, idle/load and Home find/play/export acceptance
remain open until performed against the identified installed candidate. There
is no authorization here to commit, push, dispatch, publish, install production
software or submit a verification request.

**Runtime readiness milestone complete; GUI in progress.** The canonical
selection projection now drives both runtime target eligibility and the settings
response. One platform-composed v2 report covers unresolved, excluded, ambiguous
and continuous selections, actual nullable Home observations, durable catalog
baselines, coherent job/source evidence and expiry. Ring-only policy is fenced
before preparation without off-policy catch-up. The validated desired revision
is separate from the applied runtime revision. Missing/old/stale reports do not
block valid configuration Save. This addresses the backend portions of R2, R4
and R5; the guided GUI and ordinary physical acceptance remain separate.

Independent specification and quality reviews approved the identified runtime
slice: 370 focused tests, lint/build/diff checks passed. Root's immutable Node26
broad check passed 73 suites / 1,673 tests (20 skipped). A subsequent two-file
projection correction normalizes provider capture times for the strict report
reader, preserving raw ledger/clip identity, with a composed-report-to-reader
RED/GREEN and 60 focused passes; the correction also received independent
approval. The earlier broad result remains bound to its original snapshot, with
the final integrated run still planned after GUI/workflow/documentation changes.

**Guided GUI and build-only route complete.** R2/R4/R5 now have a guided ordinary
settings flow showing each selection's actual source/module, observed Home
policy, initial clip scan, coherent job timing and safe recovery. Missing/stale
status and unapplied drafts cannot enable a fresh-test prompt, while valid Save
remains available. Independent specification/quality review and root's actual
nine-scenario HTTP review passed. The resulting activity-first layout and
progressive setup disclosure passed the follow-up visual review.

The existing publication workflow now defaults to read-only build-only intent,
with exact-source/five-target packaging, installed qualification and a bound
completion artifact. Explicit publication still requires publish mode, main and
an exact version; the existing release caller expresses that intent. Independent
specification and root quality review approved the identified 11-file delta.
The final executable matrix passed strict install, lint/build, 73 Jest suites /
1,678 tests, 106 Node contracts, API validation and JavaScript-only package smoke
on each actual Node 22.23.4, 24.22.2 and 26.13.0 lane. Twenty optional integration
cases were skipped per lane, separately from the real Pi preparation evidence.

The documentation specialist reconciled all 20 selected maintained guides and
indexes, including R3's bounded tested-storage matrix and native Local Storage
preflight. The link/anchor/example checks and root’s final independent critical-guide
review passed; current acceptance evidence remains in the
[4 November execution record](2026-11-04-hsv-readiness-qualification.md).

These outcomes resolve the approved local implementation barriers. They do not
produce the ordinary five-target protocol-4 test package or complete physical
Home acceptance. The canonical build still needs an authorized committed/pushed
source identity and a build-only run. Fresh native motion on the correct existing
Home camera, playable/exported coverage, actual permission/restart/provider
recovery, idle observation and claimed load cadence remain the runbook's
physical acceptance gates. No source commit, push, workflow dispatch, production
installation, publication, release or verification request occurred.
