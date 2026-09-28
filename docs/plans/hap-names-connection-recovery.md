# HAP names and HomeKit connection recovery

Status: implementation, local verification, Codex review, and CI complete;
CodeRabbit authentication pending

Branch: `codex/hap-names-connection-recovery`

Last updated: 2026-09-28

This document is the implementation source of truth for HAP-safe naming and
HomeKit-visible Blink connection failures. Update it whenever implementation,
verification, review, or delivery evidence changes.

## Problem

Blink or user-supplied names can become HAP `Name` characteristic values that
HAP-NodeJS rejects. One observed form ends with a parenthesized serial number,
for example `Corner (G8T1-K001-3255-014P)`. HAP-NodeJS currently requires a
Unicode letter or number at both ends and permits only a bounded set of
characters in the middle.

The existing runtime-failure accessory also combines a connection sensor and a
retry switch. Apple Home presents both services under the accessory name, so
the actionable retry label is lost. The accessory is removed on recovery, and
its retry path reruns full device discovery instead of testing and restoring the
existing runtime connection.

## Requirements and acceptance

- **REQ-NAME-1:** Every plugin-owned value written to a HAP accessory or service
  name must pass through one canonical normalization boundary.
- **REQ-NAME-2:** HAP normalization must not change Blink identifiers, UUID
  inputs, exclusion matching, API names, or serial-number characteristics.
- **REQ-NAME-3:** Cached accessories must be repaired in place without changing
  UUIDs, room assignments, scenes, or automations.
- **REQ-NAME-4:** The source must identify naming restrictions as current HAP
  compatibility constraints, not product requirements, with upstream links and
  a review trigger for future Homebridge/HAP-NodeJS upgrades.
- **REQ-FAULT-1:** A confirmed Blink outage must remain visible in Apple Home as
  an open, faulted `Blink Connection` contact sensor.
- **REQ-FAULT-2:** Recovery control must be a separately named, stable
  `Retry Blink Connection` accessory so Apple Home cannot collapse its label
  into the status accessory.
- **REQ-FAULT-3:** Status and retry accessories must retain stable identities
  across failures, recoveries, and child-bridge restarts.
- **REQ-RECOVERY-1:** Manual and automatic recovery must share one coalesced
  connection-recovery path and must not rerun full accessory discovery.
- **REQ-RECOVERY-2:** HomeKit faults clear only after Blink returns a usable
  homescreen and existing handlers have consumed the refreshed state.
- **REQ-RECOVERY-3:** Failed retries remain visibly faulted, reset the momentary
  switch to off, and log the actual classified failure without secrets.

Acceptance evidence must include focused name and recovery tests, full tests,
lint, build, graph update, automated review, CI, and the PR merge result. A later
Pi/Home-app run remains the physical presentation gate; local tests and CI do
not substitute for it.

## Design

### HAP naming boundary

Add one utility that normalizes values at the HAP boundary. It will normalize
Unicode and spaces, retain the current permitted internal punctuation, replace
unsupported runs, require a Unicode letter or number at both ends, enforce the
current HAP name length, and use a valid contextual fallback when input cannot
produce a usable name.

Raw device names remain available for Blink API calls, configuration matching,
and logs. Stable UUIDs continue to derive from device type and numeric ID.
Serials remain in `AccessoryInformation.SerialNumber`; they are not appended to
ordinary display names. Duplicate user-facing names may receive a short stable
alphanumeric suffix only when disambiguation is required.

The policy is based on current upstream behavior:

- HAP-NodeJS `checkName`:
  <https://github.com/homebridge/HAP-NodeJS/blob/latest/src/lib/util/checkName.ts>
- Apple Home naming guidance:
  <https://developer.apple.com/design/human-interface-guidelines/homekit#Help-people-choose-useful-names>

`checkName` is private API, so the plugin will not import it. Source comments
and tests must state that this is a compatibility policy to revisit when the
installed Homebridge/HAP-NodeJS dependency changes, not an independent Blink
product constraint.

### Stable HomeKit failure surfaces

Use two permanent cached platform accessories:

1. `Blink Connection`: one Contact Sensor service. Closed and not faulted when
   healthy; open, inactive, and faulted after a confirmed outage.
2. `Retry Blink Connection`: one momentary Switch service. Turning it on starts
   coalesced recovery and always returns it to off. It does not claim success;
   only the connection sensor closing does that.

Reuse the existing connection-diagnostic UUID for the status accessory. Remove
the legacy embedded retry service during migration. Give the retry accessory a
new deterministic UUID. Never unregister either accessory during ordinary
recovery.

### Runtime state and recovery

Replace implicit boolean behavior with explicit connection states:

```text
healthy -> degraded -> faulted -> recovering -> healthy
                                   |          -> faulted
                                   -> authentication-required
```

Initial discovery continues to authenticate, fetch homescreen data, reconcile
inventory, initialize handlers, and start polling. If startup fails before that
initialization completes, the first successful recovery finishes initial
inventory exactly once. After initialization, runtime recovery only coalesces
concurrent attempts, validates the current Blink session, fetches a homescreen,
updates existing handlers, and changes connection state. Ordinary runtime
recovery cannot register or unregister Blink device accessories.

Polling retains the three-consecutive-failure threshold. The first two failures
move to degraded state without opening the HomeKit sensor. The third faults the
connection. Any successful poll or manual recovery uses the same state-refresh
operation and closes the fault only after handler updates finish.

## Work and evidence ledger

| Work item | State | Evidence |
| --- | --- | --- |
| WI-1 Create living design and delivery record | Complete | This document |
| WI-2 Centralize HAP-safe accessory and service names | Complete | `src/hap-name.ts`; name and cached-migration tests |
| WI-3 Add stable status and retry accessories | Complete | `src/platform.ts`; platform recovery tests |
| WI-4 Separate startup discovery from runtime recovery | Complete | Coalesced `recoverConnection`; success, failure, polling, and concurrency tests |
| WI-5 Run focused and repository-wide verification | Complete with noted local tooling gap | 26 suites/590 tests, 39 release tests, lint, build, and Graphify update passed |
| WI-6 Conventional Commit milestones | Complete | `198bf18` plan; `4e29c57` implementation; `8540162` first review fix; `ea3f13c`, `db8b97e`, and `ab78bc3` later review fixes; message-only rewrite verified tree-identical |
| WI-7 Push, PR, CodeRabbit CLI and Codex review loop | Blocked | PR #41; Codex clean in round 5; CodeRabbit CLI rejected the only configured organization before review |
| WI-8 Merge and task-scoped branch cleanup | Planned | Pending merge/cleanup receipts |

## Risks and rollback

- Apple Home presentation is controller behavior and needs physical confirmation
  after merge and release. Stable separate accessories are based on observed
  behavior but remain unverified until installed.
- Cached accessories can retain stale service names. Migration must update HAP
  `Name` characteristics and remove only the obsolete diagnostic retry service.
- Authentication and network failures are not interchangeable. Recovery logs
  must preserve the actual error category while HomeKit uses one honest generic
  connection-fault surface.
- Rollback is source rollback. No Blink or HomeKit data migration is destructive;
  existing device UUIDs remain unchanged. The two diagnostic accessory UUIDs can
  be safely retained by a later correction.

## Review-round ledger

Round limit: 10. Planned sources: CodeRabbit CLI and an independent Codex
review. Each round records base, head SHA, request time, saved report, explicit
outcome, findings, pattern analysis, fixes, and verification here.

### Round 1

- Base/head: `origin/main` / `4e29c576d51ad850b2f66ec4ead6e6092a4c53ef`.
- Codex report: `/tmp/codex-pr41-r1.8uJ5IO`, exit 0. One actionable P1:
  recovery after failed startup could clear the fault without constructing any
  device handlers or registering a first inventory.
- Pattern analysis: Codanna index covered this repository and resolved
  `performConnectionRecovery`, `registerDevices`, and `updateDeviceStates`.
  Caller/callee and depth-3 impact analysis localized the lifecycle ownership to
  platform discovery/recovery. Repository-wide search found no parallel device
  initialization path. Classification: broken lifecycle invariant at the shared
  recovery boundary, not an isolated call-site error. Repair: track successful
  initial inventory, complete it once after startup failure, and retain
  state-only behavior for ordinary runtime recovery.
- Verification after repair: 3 focused suites and 71 tests passed; the full 26
  suites and 585 tests passed; lint, build, and Graphify update passed.
- CodeRabbit CLI 0.8.1 preflight passed authentication, but review execution is
  blocked pending explicit authorization to transmit the committed diff to the
  external CodeRabbit service. No CodeRabbit outcome is claimed.

### Round 2

- Base/head: `origin/main` / `85401620cdfe061e285032938ce572b226044ebb`.
- Codex report: `/tmp/codex-pr41-r2.0icGvD`, exit 0. Two actionable P2s:
  a retry could race in-flight startup discovery and register HAP controllers
  twice, and startup reset the persisted connection surface to healthy before
  receiving a fresh Blink response.
- Pattern analysis: refreshed Codanna indexing resolved `discoverDevices`,
  `recoverConnection`, `performSerializedConnectionRecovery`, and the status
  accessory caller path. Caller/callee analysis and repository-wide search
  found one initial-inventory owner and two entry points into recovery. The
  findings are one lifecycle-serialization defect and one false-health initial
  state at the same platform boundary, not isolated accessory defects.
- Repair: manual/poll recovery now joins in-flight discovery before attempting
  another request; startup begins non-operational and recovering, so HomeKit
  remains faulted until a usable homescreen is processed. Confirmed-failure
  state is tracked separately so genuine restoration still receives its log.
- Verification after repair: 3 focused suites and 73 tests passed; the full 26
  suites and 587 tests passed; lint, build, the 39 release-workflow tests, and
  Graphify refresh passed. The next review round remains pending.

### Round 3

- Base/head: `origin/main` / `03e9bd0645361330a3a1f40bbbe0a4eedadab987`.
- Codex report: `/tmp/codex-pr41-r3.FsAa8P`, exit 0. Two actionable P2s:
  polling repeatedly restarted authentication that required user input, and an
  `AuthStateChangedError` lost its required child-bridge restart instruction.
- Pattern analysis: refreshed Codanna indexing resolved both authentication
  errors plus the single polling and recovery entry points. Caller/callee and
  repository-wide searches found the shared platform failure classifier and
  polling state gate as the correct ownership boundary. Hosted-auth handling
  already preserves `AuthStateChangedError`; it is a correct sibling, not a
  second defect. Classification: two shared platform-state omissions.
- Repair: automatic polling now pauses in `authentication-required`; an
  explicit HomeKit retry remains available after the user supplies required
  authentication. Stored-auth replacement receives bounded, secret-free
  restart guidance instead of an ineffective retry instruction.
- Verification after repair: 3 focused suites and 75 tests passed; the full 26
  suites and 589 tests passed; lint, build, the 39 release-workflow tests, and
  Graphify refresh passed. Round 4 remains pending.
- CI on the reviewed head: Node 22/24 and GitGuardian passed; commitlint rejected
  `03e9bd0` because its body line exceeds 100 characters. Correcting that
  already-pushed commit requires explicit history-rewrite authorization.

### Round 4

- Base/head: `origin/main` / `7304f4f8c73261690e3de346d99e93f18db2db8a`.
- Codex report: `/tmp/codex-pr41-r4.JpRdNT`, exit 0. One actionable P1:
  the broad authentication regex classified temporary token-refresh failures
  as user-action-required and therefore disabled automatic recovery forever.
- Pattern analysis: Graphify and refreshed Codanna indexing traced
  `BlinkTokenRefreshError` categories through token refresh, platform failure
  classification, and polling. Repository-wide search found concrete auth
  error types already used by hosted-auth UI handling. Temporary, response, and
  storage refresh errors are retryable; interactive 2FA, hosted reauthentication,
  verification, changed/invalid stored state, and terminal 400/401/403 auth
  responses require user action. Classification: broken shared classifier.
- Repair: replace message regex with concrete error/category checks. Preserve
  automatic recovery for token-refresh and transient authentication failures;
  suspend polling only for errors whose contract requires user intervention.
- Verification after repair: 3 focused suites and 76 tests passed; the full 26
  suites and 590 tests passed; lint, build, the 39 release-workflow tests, and
  Graphify refresh passed. Round 5 remains pending.

### Round 5

- Base/head: `origin/main` / `8632aba8e99145aa4d53dab06dfcf726e546c5c7`.
- Codex report: `/tmp/codex-pr41-r5.tCK8Pw`, exit 0. Explicit clean result:
  no actionable regressions found across HAP naming, cached accessory handling,
  startup/runtime recovery, authentication classification, or concurrent
  retries. Reviewer independently passed all 26 suites/590 tests and TypeScript
  checking; live Blink and Apple Home behavior remains a separate post-release
  gate.
- Codex is retired for this PR under the review-loop policy. Its clean result is
  bound to `8632aba`; later documentation or commit-message-only changes do not
  imply that Codex reviewed a newer SHA.

### CodeRabbit round 1

- Review scope after the approved history correction: `origin/main` /
  `c327875af4f460d1e26a4cbf9eeeae93f8a7e6f8`, committed changes only.
- The lease-protected rewrite changed only the malformed `03e9bd0` commit
  message and descendant hashes. `git diff` proved the old and new heads have
  identical trees. CI then passed commitlint, Node 20/22/24, and GitGuardian.
- CodeRabbit CLI 0.8.1 authenticated as `sealad886`, doctor passed all nine
  checks, and the only listed organization was `sealad886`. Both captured
  review attempts failed before analysis with `403 FORBIDDEN: Invalid
  organization`: `/tmp/coderabbit-pr41-r1.lfbzqJ` and
  `/tmp/coderabbit-pr41-r1-retry.oEdEG2` (reviewer exit 1, tee exit 0).
- An OAuth refresh was started without clearing credentials, but timed out at
  the initial GitHub credential screen. A later host-side `coderabbit auth
  login --agent` completed successfully as `sealad886`, but both committed-local
  and documented remote-repository review modes still failed before analysis
  with the same `403 FORBIDDEN: Invalid organization`. Host execution therefore
  rules out sandboxing and stale OAuth as causes. CodeRabbit reports plan `Free`,
  seat `not assigned`, and no alternate organization; provider account/workspace
  repair is required. No CodeRabbit findings or clean outcome are claimed.

### CodeRabbit round 2

- Base/head: `origin/main` / `a0322894a9299350cd7576a82b83d0dfe4faf9bf`,
  committed changes only. Captured report:
  `/tmp/coderabbit-pr41-retry.iZq5LA/review.txt` (reviewer exit 0, tee exit 0).
- CodeRabbit completed using the free CLI allowance and reported two actionable
  major findings: the HAP name bound counted Unicode code points instead of
  HAP-NodeJS's UTF-16 code units, and cached accessory names were not repaired
  until successful Blink discovery.
- Pattern analysis: Graphify traced `toHapName`, `configureAccessory`,
  `registerDevice`, and cached accessory tests to the shared platform naming
  boundary. Repository-wide search found no parallel normalization helper.
  HAP-NodeJS 0.14.0's installed `Characteristic` validator directly confirmed
  that string length is measured with JavaScript `value.length`. Both findings
  are shared-boundary defects rather than isolated call-site errors.
- Repair: accumulate complete Unicode characters only while their UTF-16 code
  units fit the 64-unit limit. During cached accessory restoration, derive the
  configured name from stored device context and repair the accessory plus all
  restored service `Name` characteristics before any Blink request, preserving
  UUIDs and offline availability.
- Verification after repair: the HAP-name and platform suites passed all 32
  focused tests; the full 26 suites and 592 tests passed; lint, build, all 39
  release-workflow tests, and Graphify refresh passed. The follow-up CodeRabbit
  round remains pending.

### CodeRabbit round 3

- Base/head: `origin/main` / `54594ce`, committed changes only. Captured report:
  `/tmp/coderabbit-pr41-r3.81HD3K/review.txt` (reviewer exit 0, tee exit 0).
- Explicit clean result: CodeRabbit completed review of all nine changed source,
  test, helper, and plan files with zero findings.
- CodeRabbit is retired for this PR under the review-loop policy. Its clean
  result was produced on `54594ce`; the message-only commitlint correction
  rewrote that commit to `7a60268` with an identical tree. This evidence-only
  plan update does not change the reviewed implementation.

### Merge-policy correction

- GitHub's repository ruleset contained `copilot_code_review` with
  `review_on_push: true`. That setting made Copilot sometimes available as an
  automatic reviewer; it did not establish a required reviewer or approval.
- The directive was removed from ruleset `12535621` at the user's request.
  Required signatures, squash-only pull requests, resolved review threads, and
  the commitlint plus Node 20/22/24 status checks remain enforced unchanged.

## Local verification evidence

Verified on Node.js `24.15.0`, Homebridge `1.11.1`, and local HAP-NodeJS
`0.14.0`:

- `npm test -- --runInBand`: 26 suites and 592 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `node --test .github/scripts/*.test.mjs`: 39 tests passed.
- `zsh -lic 'graphify update .'`: graph rebuilt with 2,039 nodes and 3,756
  edges; generated graph files remain repository-ignored.
- `node .github/scripts/verify-package.mjs`: not completed locally because npm
  `12.0.2` changed `npm pack --json` from an array to an object keyed by package
  name, while the existing verifier expects an array. A direct `npm pack`
  produced the expected package and included `dist/hap-name.*`. This unrelated
  verifier compatibility gap remains for CI to adjudicate using its declared
  Node/npm matrix; it is not counted as a passing package-verification result.
