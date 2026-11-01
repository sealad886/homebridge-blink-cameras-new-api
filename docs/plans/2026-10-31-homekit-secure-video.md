# HomeKit Secure Video and continuous prebuffer

Status: the user has authorized publication of the exact beta version
`1.0.0-beta1` and will install it manually. Local implementation and review
corrections are verified; release gates, publication and physical Apple acceptance
remain open. Root owns Git integration, version/release-policy changes, workflow
dispatch and registry verification. No agent will install or reconfigure the
Homebridge plugin on the Pi under this latest scope.

## Scope and route

The user requested HSV recording to iCloud and buffering of live video, and chose
an opt-in continuous feed with pre-event buffering. A separate live concurrency
probe is explicitly authorized. This is a medium, high-risk `medium-feature-change`
route: context/acceptance → design → planning → implementation → quality →
documentation → independent review → release preparation. Security/operations is
activated for sensitive footage, resource bounds and native trust boundaries.
Coordination is activated only for the authorized provider probe. Retrospective
remains future work until an observed delivery outcome exists.

The current checkout contains existing HomeKit audit changes. Work stays on
`codex/homekit-bridge-logging`; those changes are preserved. No new worktree is
authorized. The user now authorizes the canonical reviewed beta-publication path;
root owns its Git/PR/merge/workflow effects. The original local implementation
did not include installation, pairing or a service restart. Installation and
camera settings remain operator-owned under the latest request.

## Accepted requirements and design

- HSV is disabled by default. Enabling it requires explicit plugin configuration
  and HomeKit recording permission/configuration. It maintains four seconds of
  complete, keyframe-aligned fMP4 prebuffer while permitted and available.
- One owned vendor feed per camera supplies both live and recording consumers.
  The existing verified TLS/destination policy and command retirement owner remain
  authoritative. A live viewer must not allocate a second provider command.
- HAP recording configuration advertises only real H264/AAC-LC output. The native
  codec worker receives private framed media; no FFmpeg CLI, media URL fetch,
  secret argv/environment, or buffer files are introduced.
- The native v3 configuration extends the existing 13 words with output mode,
  fragment duration and keyframe interval. INIT is complete ftyp/moov; fragments
  are complete moof/mdat, with sequence/time/keyframe metadata and bounded sizes.
- Recording disable, HomeKit camera disable, offline state, removal or shutdown
  cancels capture and erases retained footage. Revoking recording audio aborts
  audio-bearing delivery and rewarms an audio-free buffer. Blink network arming
  remains separate from HomeKit capture permission.
- Native motion analysis uses a bounded luma grid from already decoded video,
  confirms scene changes and compensates uniform exposure shifts. It pins the
  event buffer before notifying HAP, only after the prebuffer is ready and when
  the camera motion setting and confirmed Blink network arming permit it. HomeKit
  recording and camera permissions remain authoritative. HSV does not require
  cloud-clip polling; that existing path remains available for other cameras.
- Buffers enforce per-camera and aggregate byte limits. Old unpinned prebuffer
  fragments can expire; active event fragments cannot be silently evicted.
  Overflow, slow consumers, sequence gaps, source failure and worker rollover
  produce explicit faults/discontinuities and bounded cancellation.
- Received data is not the same as all real-world activity. No buffer can recover
  footage before upstream capture or during a disconnect. The existing 300-second
  worker lifetime/64-MiB output ceiling remains enforced, with explicit rewarming
  rather than silently stitching generations.

## Ordered work and acceptance

1. Native owner: fMP4/AAC-LC private worker output, independent container decode,
   no-audio privacy checks, malformed framing/resource/STOP tests.
2. Recording owner: bounded fragment ring, event pinning, HAP delegate lifecycle,
   configuration freezing, privacy cancellation and slow-reader tests.
3. Integration owner: canonical shared feed, existing streaming/audit preservation,
   motion/controller/configuration/shutdown wiring and behavioral integration tests.
4. Quality: focused tests, type/build/lint, full Jest, API contract and applicable
   native/packaging checks; independent security/ownership review.
5. Documentation and release disposition: actual guarantees, battery/provider
   effects, configuration, remaining platform/native/iCloud acceptance gates.

No existing configuration is replaced, so no migration is needed for additive,
absent-key-disabled settings. Native artifact changes require new verified bytes
and corresponding-source metadata before release. Local source/native checks do
not establish five-target or physical Apple home hub/iCloud acceptance.

## Primary API evidence

The local development dependency is Homebridge 1.11.1 with HAP-NodeJS 0.14.0.
The Pi actually runs Homebridge 2.4.0 with HAP 2.2.2. Both were inspected, and
isolated recording negotiation, motion/policy, privacy and linked-service tests
passed against the actual Pi HAP runtime without advertising or changing its
paired accessories. Current upstream documentation was also consulted. Context7
was attempted but its quota was exhausted.
`RecordingAudioActive` is on the recording-management service in this pinned
implementation; `HomeKitCameraActive` requires its own privacy subscription.

## Initial development verification

- [x] Inspect pinned HAP/native contracts and preserve existing audit changes.
- [x] Implement native fMP4 output, bounded buffer and recording delegate.
- [x] Share the canonical vendor owner; wire permissions, triggers and shutdown.
- [x] Add opt-in `hksvCameras` selection, validation and operator documentation.
- [x] Independently review ownership, privacy and media continuity; correct the
  rejected-stop barrier, IPC zeroization, timestamp resets, missing audio, finite
  event tails and HDS cancellation behavior.
- [x] Finish native correction verification and refresh its local receipt.
- [x] Refresh the graph and complete the local handoff.

Before the later native-motion and beta-release changes, the broad local Jest
run passed 1,362 tests with 18 gated skips. The
recording/buffer/real-HAP integration slice passed 57 tests. Native behavior and
resource tests passed 43 cases; real-worker IPC/media integration passed 76 cases,
and dependency/packaging tooling passed 44 cases. Lint, build, application and test
type checks, the 347-endpoint/677-model API contract validation, 80 workflow tests,
49 Pi-evidence tests and the JavaScript-only packed-plugin smoke passed. Socket
fixtures were rerun outside the sandbox after sandbox binding was denied.

Independent native review reproduced and corrected source timestamp regression
and missing trailing audio. Incomplete audio/video fragments are withheld before
provider EOF; capture fails explicitly. Privacy disposal erases client-held
recording buffers as well as the retained ring. The source is still local and
uncommitted; these checks do not establish acceptance on supported Node versions
or the five release targets.

The authorized 31 October provider probe confirmed two concurrently receiving clients of
one camera, sharing a Blink MCLV capture session for about 37 seconds. A third
allocation was accepted but its transport failed without media; existing clients
continued receiving. The probe stopped after that failure. Other cameras were
offline, so cross-camera concurrency and an absolute account limit remain
unknown. All probe-owned transports closed and no footage was persisted.

A 1 November follow-up confirmed two **different cameras** simultaneously
delivering MPEG-TS during the same ten-second window, with data from both in
all nine complete second buckets and no transport errors. Each had a distinct
Blink parent capture session. A third camera reported online but delivered no
media during a twenty-second solo baseline, so three-camera capacity and an
absolute limit remain unknown. A final thirty-second solo retry used the verified
camera-family endpoint and fresh device metadata. TLS and IMMIS authentication
succeeded, but no validated MPEG-TS reached the consumer; command-status reads
remained incomplete. The cause was not established. All follow-up probe transports closed; cleanup
targeted only their own returned client commands. No footage was saved or device
configuration changed. This short probe does not qualify sustained background
HSV capture.

A later 1 November four-camera trial established four distinct camera captures
before starting a shared 90.000317-second measurement. Three cameras delivered
media in all 90 relative one-second bins. The fourth last delivered media 9.264
seconds into that window, with data in 7/90 bins; Blink marked its command complete
and the transport requested reconnection. No restarted session was substituted
into the original window. After all four clients were cleaned up, a separate
20.000166-second solo control of the fourth camera delivered media in 20/20 bins,
without errors or reconnects. Thus four sustained 90-second feeds were not
demonstrated, and a hard three-camera limit was not established. All five owned
clients closed and no media was saved or device configuration changed.

## Reopened delivery: saved-recording acceptance

The acceptance target is a motion event from a real camera that causes this
plugin to supply a recording to the Apple home hub, followed by a saved clip
that can be played in Home. A playable local diagnostic MP4 is useful real-camera
codec evidence and lets the user inspect footage, but does not establish iCloud
storage. A synthetic MotionDetected write must be labelled synthetic and does
not establish that the camera's physical motion source works.

Current phase: prepare and verify the exact `1.0.0-beta1` release unit. The existing
medium/high-risk feature route is reused, with authorized release execution
entered through release-change. Quality, security/operations, independent review,
documentation and operational coordination return evidence before its final
publication decision. Source/receipt identity, gate results and rollback must be
resolved before the workflow's publication effect. Physical HSV acceptance remains
a distinct operator step after manual installation.

- [x] Reconfirm the outcome: saved motion-triggered recording and playback.
- [x] Freeze the requested version as `1.0.0-beta1`; publication is authorized and
  installation is explicitly operator-owned.
- [ ] **Active:** bind the proposed release source and exact beta version to
  independent reviews, fresh tests and canonical five-target artifacts.
- [ ] Merge the reviewed source through the active repository ruleset, dispatch
  the main-only OIDC workflow for that exact version, and preserve its receipts.
- [ ] Independently verify npm version, source SHA, integrity, beta dist-tag,
  unchanged stable latest tag, GitHub release and five-target qualification.
- [ ] Deliver the exact-version manual-install/rollback and HSV acceptance steps.
- [ ] Operator: back up config/auth/accessory state, install the exact registry
  beta, restart the child bridge and select one canary recording camera.
- [ ] Operator: verify Home's active hub and recording policy, exercise real
  physical motion, then confirm a saved clip and actual playback.
- [ ] Operator: exercise recording-disable privacy and restart/recovery; extend
  recording to remaining cameras only after canary acceptance.

Release effects remain distinct. The user authorizes the beta publication path,
including the reviewed source integration and workflow-created tag/release needed
for the exact requested version. Root owns those effects and their readback.
The user will install manually; no agent Pi plugin installation, configuration
write or restart is authorized by the latest scope. No private-install exception
is needed or assumed.

### Installation-policy gate

`docs/RELEASE.md` requires installations, including prereleases and rollback, to
use exact npm registry versions and explicitly says not to copy builds or install
Git URLs or local tarballs on Homebridge. The deploy script also rejects its
removed `--tarball` mode. There is no documented development-install exception.
Thus a locally tested Linux-arm64 worker does not, by itself, make an installable
Homebridge release under the current policy.

The selected path is reviewed immutable source, the five source/native and
installed-package qualification lanes, corresponding source, canonical package
verification, OIDC publication, then the user's exact registry installation.
The earlier local-canary authority gap is resolved by the user's explicit request
to publish; no local tarball, copied worker, or fake release receipt is used.
The isolated Pi native build is supporting target evidence only and does not
replace the five CI qualification lanes.

The legacy deploy helper also tries alternate hosts and restarts all Homebridge.
For the accepted registry path, use the configured `raspberrypi` SSH alias and
the documented exact-version Homebridge install, then prefer a Blink child-bridge
restart through the UI. Do not use the helper's fallback hosts as authority to
select another device.

### Exact beta-publication gates

The user-selected version is `1.0.0-beta1`, including that exact prerelease
spelling. It goes to the `beta` dist-tag and must not move stable `latest`.
The ordinary documented numeric prerelease sequence does not override the
explicit requested version; root must update the canonical version parser and
its behavioral tests where necessary, without changing historical registry bytes.

Read-only GitHub inspection on 1 November found active default-branch ruleset
`12535621` (`default`), with no bypass actors. It requires signed commits,
pull-request integration using squash, resolution of review threads and strict
current-base checks named `commitlint`, `test (20)`, `test (22)` and `test (24)`.
The configured minimum approving-review count is zero; that does not waive the
repository's independent code/security-review requirement. Classic branch
protection returns 404 because the active ruleset, rather than that legacy
endpoint, supplies these controls.

The project A Team roster `7e0d2447c369acfe` verified successfully. Its
code-reviewer, security-reviewer, TypeScript, Python and infrastructure review
profiles are active. Independent review dispatches must be bound to the actual
proposed release diff; the earlier native/ownership reviews are supporting
evidence and cannot stand in for a review of later release-policy corrections.

The publish workflow adds gates beyond the branch's minimum status contexts:
Node 20/22/24 source tests, five native source-build lanes, complete corresponding
source and canonical package verification, then five clean installed-package
qualification lanes against the same immutable tarball. Only the main-only
`npm-release` OIDC job may publish those qualified bytes. No locally packed or
rebuilt package substitutes for that artifact.

The 26 October checkpoint in `docs/plans/security-hardening.md` records F05 and
F06 remediated and verified for `0.11.0-beta.0`; the old 25 October hold is
historical, and the 0.10.0 risk waiver does not transfer. The new release must
preserve secret-free private worker execution, numeric destination enforcement,
verified TLS, bounded queues and generation cleanup, with changed paths covered
by current tests and independent security review. No paid scan or billing action
is authorized or required by this plan.

### Physical and Apple evidence gates

Begin with one camera so unknown subscription capacity and host encoding load do
not mask the basic recording flow. Observe the home's actual active hub and
camera recording permissions through an available authorized Home surface. If a
physical motion action or an account-only permission cannot be operated remotely,
finish the independent preparation and give the user the exact ready-to-run step.
Do not report a clip as saved solely because native encoding, transport receipt,
HAP negotiation or upload intent succeeded.

Apple documents motion footage being sent to the home hub for local analysis and
encrypted iCloud storage, with later Home playback downloading and decrypting the
clip. Its protected rendering can also prevent stream screenshot capture, so a
black screenshot alone is not a recording-failure result. See
[HomeKit camera security](https://support.apple.com/en-gb/guide/security/sec525461d19/web).
The final beta uses motion detected from the continuous video feed, independently
of Blink clip polling. Blink's own clip recording during an open live feed remains
unqualified; HSV acceptance must check Home's recording history directly.

### Manual-install handoff after publication

Do not use this command until root has verified the exact registry beta and its
source/integrity receipt. The operator installs the version, rather than an
unqualified local build:

```sh
sudo hb-service add @sealad886/homebridge-blink-cameras-new-api@1.0.0-beta1
```

Before installation, make a private Homebridge backup containing configuration,
auth state and accessory persistence, and record the currently installed exact
registry version for rollback. Retain that version's existing settings and
pairing identity. Then restart the Blink child bridge through Homebridge UI and
verify its startup log identifies `1.0.0-beta1` and successful device discovery.

Start recording acceptance with one camera. Add its stable Blink ID or serial to
the existing platform configuration. HSV motion does not require cloud polling:

```json
{
  "hksvCameras": ["CAMERA_ID_OR_SERIAL"],
  "enableMotionPolling": false
}
```

Restart the child bridge after saving the selection. In Home, enable recording
for that camera in the intended home/away modes and confirm an active home hub
and an eligible iCloud+ camera allowance. Keep the Blink system armed and that
camera's motion detection enabled; both gate local video motion events.
Allow the recording buffer to become ready, trigger physical motion, and check
the saved Home recording timeline and playback. Record the event time, plugin
motion/HDS receipts and clip time together. If Home's recording choice is absent,
first verify the installed version, camera selection and advertised recording
services; do not assume streaming alone proves HSV was enabled.

The acceptance report must distinguish real motion from synthetic triggers and
local diagnostic recordings from Home/iCloud recordings. A release receipt proves
which package was published; it does not prove this operator flow passed. If
recording fails, preserve private logs and stop extending the configuration until
the failure is understood. Rollback uses the previously recorded exact registry
version; existing paired accessories and valid auth state are retained.

## Remaining release and physical acceptance

The checkout has no packaged runtime directory. Protocol-3 source requires new
five-target candidate builds, exact-source receipts, corresponding-source bundle
and canonical package verification before distribution. Old protocol manifests
are rejected. The local macOS test binary is development evidence only.

Pi plugin installation, configuration and restart remain reserved for the user.
Real-camera continuous capture and a synthetic event replay produced decodable
local clips. Apple hub negotiation, physical motion sensitivity, saved iCloud
clips and Home playback still require qualification after manual installation.
The four-second prebuffer precedes the local video motion trigger; provider
session interruptions can leave gaps. No lossless-capture guarantee is made.
