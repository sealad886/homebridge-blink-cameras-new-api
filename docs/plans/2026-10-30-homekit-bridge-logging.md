# HomeKit bridge event logging

Status: audit and controller-origin extension verified locally, unpublished,
30 October 2026.
Owner: Agents Orchestrator implementation team; primary agent owns acceptance.
Base: `546ee28147920fe4c8c41825ce36cedd9ff867cf`.
Local branch: `codex/homekit-bridge-logging`.

## Problem and scope

The user requires camera-specific datetime entries for motion detections and
logging of traffic forwarded through the Blink HomeKit bridge in either
direction. The 29 October log review found no detection notifications; existing
code logs a motion trigger at INFO but silently resets its HomeKit value. Other
characteristic requests, responses and camera delegate operations have incomplete
logging. This change provides an audit of bridge interactions; it cannot recreate
historical events or guarantee that a paired controller received a notification.

Scope is the Blink plugin's HomeKit characteristic requests, results, outbound
updates/notifications, subscriptions, explicit motion/ring triggers and camera
delegate request lifecycles. Motion polling configuration, clip processing,
HomeKit behavior, deadlines and media transport remain governed by existing code.
Media operation summaries contain bounded metadata rather than media or encrypted
transport payloads. No new dependencies or configuration migration are needed.

## Acceptance

| ID | Observable requirement | Verification |
| --- | --- | --- |
| AC-1 | Every motion trigger, including a repeated trigger while active, logs a camera-specific `Motion detected` entry with an explicit ISO datetime at INFO. Its false reset logs `Motion cleared`. | Motion trigger/retrigger/reset regressions with debug disabled; unchanged timers and HomeKit values. |
| AC-2 | HomeKit characteristic reads and writes log their direction, accessory, service/characteristic, request and successful or failed result, including cached reads and unchanged writes. | Real installed HAP request paths, success/failure, same values and write-response branches. |
| AC-3 | Outbound changes/event notifications and subscription changes are logged for cached, new and dynamically added services/characteristics, including connection accessories. | Real HAP notification/subscription tests and registration integration. |
| AC-4 | Snapshot, prepare, stream start/reconfigure/stop and applicable talkback controls log bounded request/result metadata at INFO. | Camera delegate lifecycle success/error/callback tests. |
| AC-5 | Logs omit raw TLVs, buffers, opaque values, credentials, addresses, URLs, device serials/IDs and arbitrary error strings; they retain camera names and safe scalar state. | Synthetic sensitive sentinels across labels, values, errors and media operations. |
| AC-6 | Instrumentation preserves handler arguments, `this`, callbacks, returned results/errors, notification semantics and idempotent registration. Unchanged status polling creates no fake notification records. Logging failures do not interrupt bridge operation. | Behavioral regressions, repeated installation, dynamic registration and full existing suite. |
| AC-7 | Attributable HomeKit requests and their outcomes include a per-runtime anonymous authenticated pairing identity and an opaque connection identity when available. Only actual HAP change originators supply attribution to outbound changes. Missing/unverified pairing metadata is `unknown`; local/Blink events do not inherit controller identity. | Real-HAP request/result/change tests, shared pairings across connections, distinct pairings, runtime isolation, missing or throwing metadata, overlap/closure and sensitive-identity sentinels. |

Success means all seven criteria have local source/test evidence, canonical logging
documentation is current, and independent review has no unresolved in-scope
correctness or privacy finding. Physical HomeKit/Pi acceptance remains a separate
release-stage check.

## Accepted design

One shared INFO audit writer supplies ISO UTC timestamps, direction, operation,
accessory identity, characteristic/service or camera action, safe value summaries
and outcome. Use existing diagnostic redaction defensively for permitted labels;
also remove known device serials/identifiers from names. Do not serialize opaque
characteristic values or arbitrary errors.

Attach per-accessory instrumentation at cached accessory configuration, device
registration after handler/controller construction, and connection accessory
registration. Observe HAP changes and subscriptions; use encapsulated per-instance
request hooks to cover unchanged reads, request failures and write responses that
CHANGE events alone omit. Instrument dynamically added services/characteristics
without duplicate observers or global prototype changes.

The request hooks depend on installed HAP request entry points, which are marked
internal/private. Installed Homebridge 1.11.1 uses hap-nodejs 0.14.0. Verify these
entry points with the real installed library; document the dependency and warn if
hooks cannot be attached. Current online HAP documentation may describe newer
versions, so installed source controls behavior.

Installed-source verification confirms that a defined connection identifies
HomeKit requests; local programmatic reads/writes require separate direction
labels. Ordinary same-value `updateValue` calls still emit local CHANGE events,
so filter those when they do not create notification candidates. Forced EVENT
notifications and explicit repeated motion triggers retain their records.
Subscription hooks expose aggregate zero-to-one and one-to-zero transitions.
Permission/admin/timed-write rejections before characteristic processing are
outside this plugin boundary. These limits must be stated in the canonical spec.

Explicit motion/ring records preserve repeated triggers without changing HomeKit
delivery. A bounded audit callback from camera delegates uses the same writer for
request/outcome records. These entries describe submission or processing at the
bridge boundary, not controller receipt or the original physical motion time.

Alternatives: adding individual messages at every handler duplicates formatting
and misses HAP-owned controller/cached paths; CHANGE-only observation misses
requests and failures. The per-instance helper is the narrowest shared boundary
that meets the accepted logging requirement.

## Execution and verification

- [x] Inspect canonical registration, motion, camera delegate and logging paths;
  establish requirements and design against installed dependencies.
- [x] Implement the shared boundary writer, integrations and focused tests.
- [x] Run lint, TypeScript build, focused real-HAP/privacy regressions and the
  practical full suite; update the graph; complete independent review.

The implementation team owns source, tests and updates to
`docs/debug_logging_spec.md` and any necessary README text. The primary agent owns
this plan and final acceptance evidence. Each delegated task has single-writer
file ownership; all agents preserve other changes.

Main risks are sensitive data entering logs, incomplete boundary coverage,
internal HAP API drift and altered request/notification behavior. AC-2 through
AC-6 supply direct regression evidence for these risks. Existing quiet polling is
preserved by observing forwarded changes rather than logging every unchanged
poll assignment. Increased INFO volume is an intended operational consequence.

## Local delivery and release disposition

Authorized work is local repository implementation and testing. No commit, push,
PR, merge, release, registry publication, Pi install or service restart is
authorized by this change. Keep version sources unchanged. Follow
`docs/RELEASE.md` for any later authorized release; it requires exact registry
installations and prohibits copying a local build/tarball onto Homebridge.

Rollback is removal of this source change before publication, or an authorized
registry-version rollback after a future release. There is no data migration.
Hosted CI, native distribution qualification and physical Pi/HomeKit acceptance
are not established by local unit/integration tests.

Delivery route: medium feature change, medium scope and risk, change authority.
Security/operations is active because logging touches sensitive HAP/media values.
External-system coordination is not applicable to this local slice; retrospective
work is future work because no deployed outcome has been observed.

## Verified original audit checkpoint

AC-1 through AC-6 have local behavioral evidence at this checkpoint. The implementation
uses `src/homekit-audit.ts`, platform registration/removal/shutdown hooks,
motion/doorbell source entries and bounded camera delegate audit callbacks.
Canonical operator documentation is in `docs/debug_logging_spec.md`, linked from
the README. Version sources and dependencies are unchanged.

| Verification | Final result |
| --- | --- |
| `npm run lint` | Passed. |
| `npm run build` | Passed; TypeScript and local UI asset copying only. |
| `npm test -- --runInBand` | Passed on final source with local loopback access and normal test umask: 52 suites passed, 1 skipped; 1,259 tests passed, 16 skipped, zero failed; 21.605 seconds. |
| Independent real-HAP run of `__tests__/homekit-audit.test.ts` | 15 tests passed against installed hap-nodejs 0.14.0. |
| `graphify update .` | Passed, AST-only, after the final source correction. |
| `git diff --check` | Passed. |
| Independent code/privacy review | Passed; no unresolved in-scope blocker. |

The 16 skips are existing gated tests: 15 require
`BLINK_MEDIA_TEST_WORKER_PATH`; one opt-in LAN socket test requires
`BLINK_MEDIA_NETWORK_TEST=1`. No new skip was added. Native-worker distribution,
physical Pi/HomeKit acceptance and controller receipt remain unverified by this
local change.

Preliminary full-suite runs are retained as environment evidence. One sandboxed
run could not open local sockets (`EPERM`), causing nine TLS/preparation failures.
A subsequent run's restrictive test umask affected one existing file-permission
fixture. The final run used the required local socket access and ordinary test
umask and passed without source changes for either environmental failure.

Independent review found and closed FIND-1: bare addresses in camera/service
labels could survive redaction. The final helper removes valid address tokens
before numeric device identifiers so overlapping identifiers cannot leave an
address suffix. Independent probes verified IPv4, IPv6, bracketed/scoped/mapped
addresses, URL capability ordering and normal friendly labels.

Reviewed final helper SHA-256:
`80db714d150078b1275617402ecaddb25f36bd8bf90c08f918ae389ce74a78a9`.
Reviewed helper-test SHA-256:
`f2d5831a5dce4d8387f112deef79edef1c1fe0a5179c4befe7b6deb844cae8c9`.

Technical gate: pass for this local source change. Release/operational state:
uncommitted, unpublished and not installed on the Pi. No live service, paired
controller or external provider was changed. Future release/install work remains
subject to `docs/RELEASE.md` and explicit authorization.

## Controller-origin follow-up

User request: report which device triggered an event, such as arm/disarm, when
HomeKit provides that information.

Installed HAP 0.14.0 authenticates `connection.username` during pair verification
and exposes `isAuthenticated()`. Its declaration explicitly states that multiple
devices connected to one Apple ID can share this username. Pairing records have
an identifier, public key and permissions, without a reliable friendly device or
person name. Session identifiers are derived from network endpoints. These facts
support immediate pairing/connection attribution, rather than a claim about the
physical phone, person or upstream automation that caused a request.

Extend the existing shared helper with opaque per-runtime pairing and connection
aliases. Authenticate before trusting the pairing username. Raw usernames,
addresses, session identifiers, connection/context objects and keys remain out of
logs. Aliases remain consistent within the process and do not correlate across
restarts; no persistent identity map or configuration migration is introduced.
Capture origin once at request entry and reuse it for success/error receipts.
Use `change.originator` only where HAP actually supplies it. Do not attribute
unrelated polls, motion/ring events, timers, camera delegates or aggregate
subscriptions using a previous request or inferred asynchronous context.

Implementation is a bounded addition to the helper, its real-HAP tests and the
canonical logging specification. Prior uncommitted work is preserved on the same
branch. No branch/worktree, release, pairing-store inspection, LAN discovery or
Pi modification is needed.

The extension is implemented as `controllerPairing` and `controllerConnection`
fields. A process-random HMAC supplies domain-separated opaque aliases; a shared
WeakMap identifies connection objects without reading addresses or session IDs.
The writer accepts only the fixed alias formats or `unknown`. Username inspection
is restricted to authenticated peers, and verified usernames are used in memory
only, without logging or persistence.

Final follow-up verification:

| Check | Result |
| --- | --- |
| `npm run lint` and `npm run build` | Passed on the final origin snapshot. |
| Real-HAP helper suite and independent rerun | 27 tests passed in each run, including 12 new origin regressions. |
| `npm test -- --runInBand` with required local loopback access and normal test umask | 52 suites passed, 1 skipped; 1,271 tests passed, 16 existing skips, zero failures; 20.799 seconds. |
| `graphify update .` | Passed after the controller-origin source changes, AST-only. |
| Independent origin-delta correctness/privacy review | Passed with no unresolved blocker. |
| Final reviewed source/test/documentation hashes | Match all 11 entries in the frozen origin snapshot. |

Current helper SHA-256:
`6359eecfb3aa7b3ab7e765f184867626a9cf709c8fc7db8824bb843808bedf01`.
The final full-suite result supersedes the original audit checkpoint for the
current source. The existing native-worker/LAN gates and physical Pi/HomeKit
acceptance limitations remain unchanged. AC-1 through AC-7 are verified locally;
no deployment or paired-controller observation was performed.

Evidence is retained under
`/private/tmp/blink-homekit-bridge-logging-2026-10-30/request-origin/` as the final
test log, reviewed snapshot and validation receipt. Earlier checkpoint hashes
above describe the preserved original audit, before the origin extension.
