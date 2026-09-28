# HAP names and HomeKit connection recovery

Status: implementation in progress  
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
inventory, initialize handlers, and start polling. Runtime recovery only
coalesces concurrent attempts, validates the current Blink session, fetches a
homescreen, updates existing handlers, and changes connection state. It cannot
register or unregister Blink device accessories.

Polling retains the three-consecutive-failure threshold. The first two failures
move to degraded state without opening the HomeKit sensor. The third faults the
connection. Any successful poll or manual recovery uses the same state-refresh
operation and closes the fault only after handler updates finish.

## Work and evidence ledger

| Work item | State | Evidence |
| --- | --- | --- |
| WI-1 Create living design and delivery record | Complete | This document |
| WI-2 Centralize HAP-safe accessory and service names | In progress | Pending implementation/tests |
| WI-3 Add stable status and retry accessories | Planned | Pending implementation/tests |
| WI-4 Separate startup discovery from runtime recovery | Planned | Pending implementation/tests |
| WI-5 Run focused and repository-wide verification | Planned | Pending commands/results |
| WI-6 Conventional Commit milestones | Planned | Pending commit hashes |
| WI-7 Push, PR, CodeRabbit CLI and Codex review loop | Planned | Pending PR/review ledger |
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

No review round has started. Round limit: 10. Planned sources: CodeRabbit CLI
and an independent Codex review. Each round will record base, head SHA, request
time, saved report, explicit outcome, findings, pattern analysis, fixes, and
verification here.
