# Event-driven HSV redesign: implementation and evidence ledger

Date: 9 November 2026

This is the verification ledger for [ADR-007](../adr/007-event-driven-native-recording.md).
The authorized worktree is `.worktrees/hsv-redesign`, branch
`codex/hsv-event-driven-redesign`. The initial implementation used stable 0.10.0
at `fb42ef207077b06565cd024a6db86143d640a276`; the release integrates main
`0ef68d13d525fbc959a15ac0ff18d14f3595bd6d` to retain secure media, current settings,
temperature and release functionality. Source development, provider evidence,
installation and physical acceptance are distinct outcomes.

## Ordered checklist

- [x] Preserve the HSV reference and acquire the tablet-installed official APK;
  trace motion, registration and native-storage semantics.
- [x] Implement the owned push receiver, official storage owner, delayed jobs,
  finite local delivery and existing-platform assembly.
- [x] Finish combined verification and independent corrections; reconcile
  source/configuration/documentation. Candidate identity is recorded in the
  private final receipt.
- [x] Complete the bounded receiver qualification: fourteen real native messages
  authenticated; thirteen older messages fenced, one fresh event durably accepted.
  The diagnostic IPv4 route and later production-worker fresh event are identified
  separately from installed-plugin acceptance.
- [ ] Qualify an exact installed full candidate and separately verify continued
  native recording, finite Home delivery and retained playback.

At most one checklist phase is active. The candidate has not replaced the working
Pi installation. No publication, release or physical acceptance is implied.

## Sources and consolidation decisions

The initial consolidation below records the stable-based implementation
checkpoint. The beta integration section records the later release reconciliation.

This scoped Repository Consolidation and Simplify Code pass reconciles the changed
feature in its authorized worktree. It does not merge onto the default branch or
retire unrelated branches/worktrees.

| Source / identity | Disposition and surviving outcome |
| --- | --- |
| Stable 0.10.0, `fb42ef207077b06565cd024a6db86143d640a276` | Retain the established authenticated SDK, control/live-view paths, accessory identities and schema editor as the clean foundation |
| Committed HSV reference, `c9228033747468f23d804ee6dfa789db8ec39b11` | Audit as evidence; replace periodic/continuous acquisition and uncertain ownership instead of replaying its commits |
| Primary checkout's 22 dirty/untracked files | Preserve separately as user/agent material; no claim that these bytes were shipped or incorporated |
| Diagnostic branch, former tip `bc5a72a2b20764d1744370199b4461d7cc729c99` | Discard as requested after a private recovery bundle; retain historical evidence, no diagnostic runtime dependency |
| Official APKs 57.1, 59.2, tablet-installed 61.0/29859371 | Retain static workflow evidence with exact artifact/method provenance; no claim of complete backend behavior |
| New receiver/coordinator/protocol/media/runtime | One canonical active implementation per responsibility, wired through existing SDK/platform/accessories |

Private preservation, branch-retirement, replay and operational receipts are in
`logs/hsv-redesign-20261109/` of the primary checkout. They are not distributed
source. The initial clean foundation and preserved reference have different HAP
dependency contracts. The beta retains main's current secure live-view architecture
and extends its canonical packaged worker for finite MP4 preparation. Earlier
private FFmpeg/descriptor component tests are historical evidence, not the final
release's cross-platform media qualification.

The source-to-outcome pass retains meaningful boundaries for scheduling, remote
operation lifetime, Google process isolation and local Home delivery. All share
one account persistence writer and existing account command admission. It removes
active cloud-media motion polling and its flag, and omits the old idle manifest
scheduler, continuous-HSV source and external diagnostic clients. Public SDK media
methods remain API contracts without a hidden polling caller. Verified obsolete
configuration is handled by the preview-first [migration tool](../native-recording-config-migration.md),
with exact-byte private backup before replacement.

## Findings and causal limits

| Finding | Evidence | Limit |
| --- | --- | --- |
| Rollback has recorded normally for hours | Operator report | Native clip contents were not independently retrieved in this redesign task |
| Working Pi remains 0.10.0 with unchanged config and Homebridge process/invocation | Local-only root receipts, including 07:09 UTC readback | No Blink requests or service restart in those checks; liveness does not prove saved clips |
| Old HSV issues idle preparation | Three offline unchanged-reference replay tests | Twenty scans in ten simulated idle minutes produce 20 manifest POSTs, 20 status GETs and 20 catalog GETs |
| Old HSV can replace an unfinished operation | Pending-command and dropped-ACK reference replays | Second preparation after 120-second timeout plus 30-second scan; fake backend, not a physical lock reproduction |
| New ownership originally missed timed-out ordinary commands | Independent SDK reproduction, correction and final review | Durable ordinary ownership joins native/Live View fences; combined host tests pass |
| Initial strict FIFO held ready cameras behind missing clips | Independent source review and two-camera regression | Ready FIFO now requeues terminal missing jobs; unresolved provider ownership still blocks all bypass |
| Explicit refused POSTs could create permanent ID-less owners | Actual SDK/protocol source with mocked fetch returning HTTP409 | Corrected with shared POST-only refusal classification; GET errors and ambiguous requests remain fenced |
| The first receiver conflated outer transport and inner project identity | Primary Chromium/Firebase source, pinned registration code and real ECE fixtures | Corrected to validate encrypted FCM inner `from`; the empty watch does not establish actual dropped messages |
| Persistent recording outage root cause | Not proven | Workload/ownership defects and rollback correlation do not establish the physical cause |

Reference replay artifacts are `reference-replay/reference-recorder.test.ts` and
`result.json`. No real Blink requests or primary-reference edits were used.
The contrasting replacement invariants are zero idle acquisition and no second
preparation while an earlier accepted/ambiguous operation remains owned.

## Provider evidence

The copied tablet APK base SHA256 is
`758085236e6bced77d5bc7f4c28651e66004043f4349ce4c2a0be9cf54d26615`.
The [61.0 audit](../audits/2026-11-09-blink61-recording-protocol.md) owns exact
JADX/DEX spans, comparison proofs and method limitations. REA's Android provider
was unavailable; successful REA Android Evidence IDs are not claimed.

| Gate | Actual evidence | Status / remaining evidence |
| --- | --- | --- |
| Obtain an owned receiver without Firebase account access | Four Google registration requests returned HTTP200 at 05:38 UTC using public APK parameters; own identity persisted privately | Google registration proved; no admin/sender account or tablet token used |
| Verified Google MCS login | Verified TLS1.3 and accepted LoginResponse at 05:45 UTC | Connection proved; no Blink delivery implied |
| Run the actual plugin receiver | Released receiver source compiled into a private proof build; source hashes retained | Component qualification, not a deployed full plugin |
| Bind receiver to the plugin's own Blink client | One regional `/clients/{currentClient}/update` metadata POST returned HTTP200; receiver emitted `client-bound` and `ready` at approximately 07:04 UTC | Binding ACK and connection proved; actual motion payload still pending |
| Preserve current Pi operation | 07:09 UTC package/config/process/invocation comparison unchanged, diagnostic units still absent | No candidate deployment or Homebridge restart |
| Compare tablet notification time | Tablet detached at later inventory | No contemporaneous notification evidence obtained |
| Receive real `cam2sm_motion` / `cloud_motion` | First component window ended 07:04–08:04 UTC with zero accepted payloads; its raw sender rejections were not captured | No delivery acceptance; that revision contained the project-filter defect and does not prove no motion occurred |
| Qualify the corrected identity boundary | 65 FCM tests and independent real-encryption review passed; actual captured-message replay delivered old 0 / corrected 14, all inner senders matched | Actual outer transport sender differed from project for every captured message |
| Initial corrected capture | IPv4 diagnostic hook captured fourteen authenticated `cam2sm_motion` messages; fresh 08:28:02 UTC event arrived 08:28:03.080 and passed durable acceptance | Thirteen pre-activation messages suppressed; captured-message replay old 0 / corrected 14; full Pi runtime unqualified |
| Production worker connection policy | Exact final worker with isolated IPv4-first DNS reconnected; fresh 08:51:21 UTC event arrived 08:51:22.153 and was durably accepted, with no socket/frame hook | IPv6 retained; zero added Blink requests; no Homebridge-global DNS change; full Pi runtime remains unqualified |

The private `receiver-proof/` directory contains acquisition, registration,
connection, exact-source and bounded Blink-binding receipts. Credentials and raw
provider payloads stay in private files. The live qualification permits one
Blink client metadata update and listening; it sends no camera, Sync Module,
thumbnail, catalog, clip, live-view or OAuth request. Google heartbeats/ACKs do
not become Blink verification calls.

The first actual-credential restore exposed unpadded base64url keys from the
pinned dependency; the validator was corrected and tested against that dependency's
real key generator. A passing synthetic padded-key fixture alone had missed it.
No Blink request occurred on the preceding local validation failures.

No generic event SSE endpoint was found in the bounded APK search. The implemented
route is a plugin-owned FCM consumer. An official-app Android notification relay
remains an uninstalled fallback needing reliable identity/time semantics, device
permission and authenticated local transport. It is not a copied app token or
access to Firebase administration.

## Required behavior and verification

The rows below name behavioral evidence, not incidental private call sequences.
Final source identity, combined totals and review readback must be recorded after
all in-scope corrections settle.

| Requirement | Current checks / contract | Remaining gate |
| --- | --- | --- |
| Own one subscription for motion OR HSV | Receiver lifecycle/identity/rotation/reconnect fixtures; source has no inactive network work; SDK scope is rechecked at dispatch | Real motion and reconnect delivery |
| Publish agreed names without re-pairing | Existing MotionSensor subtype, canonical name helpers, real-HAP assembly tests | Readback in the exact installed candidate |
| Keep source motion separate from replay | Decoder/runtime tests report public PIR immediately; local prepared media alone raises internal recording trigger | Physical hub behavior |
| No idle USB/camera work | Extended fake-time runtime traces are empty; no platform motion-media polling caller remains | Measured quiet interval under candidate |
| Independent ready order and finite retries | Coordinator/runtime tests cover due times, terminal missing requeue, multi-camera catalog reuse, expiry, capacity and unknown-owner restart; final combined host run passed | Physical repeated-camera timing |
| Correct official storage workflow | HTTP-boundary tests verify empty preparation POSTs, numeric completion, parent/first-child separation and provider-returned media GET | One controlled real native clip retrieval |
| Never replay uncertainty | Lost ACK, malformed status, timeout, cancellation, exhausted budget and restart fixtures retain fences | Exact deployed artifact's interruption/recovery acceptance |
| Refused POST versus failed status GET | Shared typed POST4xx-except408 classifier; local no-send and sent/refused receipts remain distinct; GET409 never releases accepted ownership or invokes unrelated conflict probes; independent final patch readback passed | Physical contention/recovery |
| Preserve settings and normal controls | Stable control tests plus durable ordinary ownership; explicit snapshot control remains a capture, automatic HSV snapshot is passive | Physical arm/motion/manual-view controls |
| Match camera and timestamp truthfully | Offset timestamps, unique native-name/network binding, ambiguity and manifest-independent clip identity fixtures | Real event-to-catalog timing/tolerance |
| Respect recording/camera/audio revocation | Cancellation/configuration/late-completion tests at coordinator, preparer and HAP delegate boundaries | Physical Home permission changes |
| Bound local resources and release USB before Home | Private file receipt/integrity checks, shared local conversion/memory admission and finite delegate tests | Pi CPU/memory and media fidelity |
| Upload no data files | Native SDK tests accept only empty workflow POSTs and read the selected media; local converter has no provider transport | Candidate request trace during normal use |
| Migrate configuration once with backup | Preview/no-op/conflict/preservation/backup/replacement tests with network disabled; obsolete verified keys removed | Explicit application to a reviewed operator config |
| Describe outcomes honestly | Local transition reports distinguish event, acquisition, offer, close/ACK and uncertainty | Retained/playable Home recording must be inspected separately |

Historical stable-foundation host verification:

- The corrected source passed **58 Jest suites: 1,378 tests passed, one skipped**.
  The skipped test requires an externally qualified native worker artifact; it is
  separate from this redesign's direct FFmpeg recording path. The real local
  finite-media conversion/decode tests ran successfully.
- Source lint, TypeScript/build and API-contract validation passed. The contract
  check covers the retained 347 endpoint records and 677 models; the selected
  61.0 recording/push evidence is the separately scoped APK audit.
- Package dry-run passed: 249 entries, including the isolated receiver worker,
  migration converter and guide, with no private proof files. The local AST graph
  was refreshed without an LLM/API call.
- The sandboxed first run could not bind local test sockets. Re-running outside
  that restriction left only a missing FFmpeg development binary; installing the
  declared official 2.1.7 asset resolved those five fixture failures. These were
  environmental setup failures, preserved in private validation receipts.
- The primary reference's 22 dirty/untracked files, branch, HEAD and index matched
  their preservation baseline. The discarded diagnostic branch ref is absent.

Independent component evidence:

- Independent reviewer run: **160 tests across eight SDK/storage/receiver/finite
  media suites passed**, including real local FFmpeg preparation tests.
- Independent final refusal verification: **248 tests across five focused suites
  passed**, plus 17 SDK/mock-wire checks and eight malformed refused-receipt
  rejection cases. The reviewer confirmed retained ambiguity through restart,
  POST-only refusal classification, GET409 without extra probes, native receipt
  validation and cooldown behavior. Type checking, owned-source lint, whitespace
  and stable source hashes passed.
- Independent ready-FIFO/assembly/runtime run: **56 tests across three suites
  passed**, including cached-admission deferral, strict no-send retry and
  per-module cooldown for both catalog and clip POST refusals.
- Corrected project authentication and isolated DNS policy: **67 FCM tests across four suites passed**;
  independent real-encryption/actual-source checks rejected wrong or missing
  inner projects, malformed data and key/ciphertext mismatches, and retained
  plaintext sender and durable-ACK behavior.
- Other component owners report focused passing checks. The private validation
  directory retains aggregate Jest JSON/logs, dependency setup and package
  receipts. Final source/build/package identities are recorded after the local
  commit; publication and deployment remain absent.

The final diagnostic severity/label change was independently reviewed: it reports
only fixed audit enums and a bounded retry delay, never raw payloads, credentials
or provider URLs, and adds no provider probe. Post-change focused checks remain
part of root's final receipt.

These overlapping runs must not be added into a unique-test total. The separate
live receiver evidence proves a native-motion delivery path. It does not prove a
saved USB video, the original physical outage's cause or iCloud retention.

## Initial consolidation and release boundary

The pre-review pass mapped every selected source to the surviving owners above
and accounted for omitted reference/diagnostic paths. The final net-change pass
checked combined callers, configuration, migration, package content, docs and
independent fixes. The handoff pass checked the preserved primary bytes/index,
retired diagnostic ref and active worktree branch; candidate identity belongs in
the private final receipt.
No default-branch integration or unrelated branch/worktree cleanup is claimed.

The stable candidate's build, full Jest, lint, API contract, package dry-run and
graph refresh passed. The evidence preserves setup failures and physical limits
alongside successful checks. The local source commit is not an npm version or
registry release, and no installed candidate is implied.

## Physical workflow and acceptance

Do not induce another persistent lock to prove that a safer design is useful.
Before an authorized operational trial, freeze source/build/package identity,
retain private configuration/auth/accessory state and define exact rollback.
Preserve current rotated credentials rather than restoring a stale token cache.

1. **Motion only:** repeat the demonstrated real, account/camera-matched push on
   the exact installed candidate, including default-network reconnect. Compare
   notification and receipt times without a USB query. No hidden cloud-media
   polling fallback is permitted.
2. **One native recording:** after natural motion and the configured delay,
   retrieve through the official bounded workflow; verify actual new video bytes,
   camera, capture time and content. Catalog totals or alerts alone do not pass.
3. **Local/Home delivery:** inspect prepared media fidelity/audio, observe the hub
   recording request and finite final packet, then independently open the retained
   Home recording. ACK alone does not establish retention or historic placement.
4. **Combined operation:** test quiet idle, repeated and simultaneous cameras,
   missing clips, explicit live viewing, normal controls and local capacity.
   Count actual requests and confirm native Blink recording continues.
5. **Privacy/restart:** revoke recording/camera/audio at delay/download/preparation/
   offer/stream boundaries; restart with known pending and ambiguous fixtures.
   Confirm no disabled-period replay, duplicate POST or false completion.

Report each camera separately. Keep installation/readback, runtime evidence and
human playback acceptance separate from host tests. The working Pi remains on
0.10.0 until a candidate trial is actually carried out and read back.

## Beta release integration

The maintainer selected **1.1.0-beta.0** and authorized normal GitHub Actions/npm
publication; Pi installation remains operator-owned. Integration takes current
main's secure media transports, native/source packaging, licensing, settings
editor, temperature support, account validation and release gates. The obsolete
continuous recording acquisition and cloud-motion polling paths are replaced by
the owned receiver and completed-clip pipeline.

Explicit live viewing still uses the current shared-feed admission owner and
`syncModuleFeedLimits`. The native configuration converter preserves those valid
limits. The new finite MP4 mode belongs to the canonical native worker, with a
new protocol identity. Old worker artifacts and previous private package receipts
cannot qualify this changed source or its publication bytes.

Release checklist:

- [ ] Finish main reconciliation and targeted regression checks.
- [ ] Run combined local checks and current-head independent review.
- [ ] Merge the reviewed source and pass the normal exact-source release gates.
- [ ] Verify npm integrity/source identity, beta tag, unchanged stable tag and
  GitHub release receipt through consumer readback.
- [ ] Separately record the operator's installed Pi/runtime and physical Home
  recording acceptance.

Only main reconciliation is active at this preparation checkpoint. The earlier
1,378-test component total and live receiver receipts retain their exact source
scope; they do not describe the final integrated release. Publication results,
source SHA and new gate receipts must be added after those actions complete.
