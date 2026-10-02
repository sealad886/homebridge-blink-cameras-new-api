# Blink reliability implementation and delivery

Date: 2026-10-02

Base: b9a946ef02df1c1c496e988c3dd39d50757526be, published 0.10.0-rc.1

Branch: codex/blink-reliability-rc1

Status: source implemented; local validation and independent review passed;
publication, installation, physical acceptance and observation not performed.

The accepted design is [ADR-003](../adr/003-blink-command-recovery.md). User and
operator instructions live in [README](../../README.md). Release and rollback
must follow [RELEASE](../RELEASE.md). No configuration/data migration or dependency
change is required. Existing unrelated checkout artifacts are preserved.

## Requirement and milestone evidence

| Requirement | Implementation / milestone | Evidence and remaining gate |
| --- | --- | --- |
| R1 command coordination | M2: shared capture/mutation coordinator, completion polling and explicit reconciliation | Client regressions; physical concurrent commands pending |
| R2 controlled failures | M1: HAP error mapping, local faults, response deadlines, momentary-switch reset | Accessory/response-budget regressions |
| R3 visible outages | M4: stable active connection sensor, confirmed fault transitions | Platform regressions; actual Apple notification pending |
| R4 recovery controls | M4: single-flight manual/automatic recovery, stored sign-in reuse | Platform timeout/recovery tests; physical Retry/dismissal pending |
| R5 snapshot deadlines | M3: per-caller 12s response, shared 60s refresh, accurate fallback/cache metadata | Accessory deadline/late-result tests; camera acceptance pending |
| R6 transport resilience | M4: one safe GET transport retry, 25s deadline, no transport POST replay | Client/HTTP retry tests |
| R7 operational evidence | M3/M4: capture/cache diagnostics and outage ledger, bounded allowlisted probe | Diagnostic privacy tests; real outage evidence pending |

## Ordered delivery checklist

- [x] Reconcile release source with registry gitHead and preserve unrelated work.
- [x] M1: controlled errors and confirmed-state handling.
- [x] M2: capture coordination, completion and deadline contracts.
- [x] Independent M2 review; extend budgets to network writes and clean cancelled delay timers.
- [x] M3: bounded snapshot callers and shared refresh results.
- [x] M4: connection state, safe retry and outage diagnostics.
- [x] Final independent review and all local gates recorded.
- [ ] Authorized commit, push, focused PR, current-head review and CI on Node 20/22/24.
- [ ] Authorized merge, next unused candidate version and CI registry publication.
- [ ] Authorized exact registry installation, backup and runtime identity readback.
- [ ] Physical notification/retry, simultaneous capture/motion, snapshot freshness tests.
- [ ] At least 48 hours RC observation, two natural token refreshes, and acceptance reconciliation.

Only one checklist item becomes active at a time. Implementation/tests/docs stay
in one focused PR; platform publication, installation and physical evidence remain
separate receipts. Implementer owns source; independent reviewer owns review;
user owns release and operator decisions. No dates/capacity commitments invented.

## Verification commands

Run focused client/HTTP/accessory/platform/diagnostic/budget suites first, followed
by lint, complete Jest tests, build, API contract validation, release safety tests,
and package loadability checks. Use the existing locked dependencies. The package
verifier's scratch output is a local check, not a distributable release. A receipt
with HEAD identifies the base plus uncommitted diff, not a committed release SHA.

Physical acceptance must record package version/integrity/source and running
child identity, notification setup/device, faults and recovery, concurrent real
camera commands, retained accessory identity, and unaffected other plugins.
A bounded Blink-only outage requires explicit authorization; never disconnect
other Pi services to test this plugin. Notification failure keeps R3 open.

## Local validation receipt

Verified against the uncommitted implementation on the base above:

- Node 24.15.0: 28 Jest suites, 631 tests passed (17.6 seconds).
- Node 20.19.5: 28 Jest suites, 631 tests passed (15.0 seconds).
- Node 22.20.0: 28 Jest suites, 631 tests passed (14.9 seconds).
- Production ESLint and TypeScript/UI build passed.
- API contract validation passed: 347 endpoints and 677 models.
- Release safety scripts: 39 tests passed, using isolated provider doubles.
- Package contents/loadability verifier passed with installed Node 22/npm toolchain.
  npm 12 returns an object for `pack --json`, while the existing verifier expects
  an array; no release tooling changed to work around that environment mismatch.
- Independent M2 review identified missing network-write budgets and cancelled
  delay cleanup; both corrected with regression tests. Final independent source
  review found no additional concrete defects; its 38 focused tests passed.
- `git diff --check`, local document links, and AST-only graph update passed.

These are local checks using existing dependencies, not a fresh CI installation
or a released artifact. The next registry-verified unused candidate is
0.10.0-rc.2. The manifest and lockfile use the native npm version command as their
single version writer. Publication uses the existing explicit CI dispatch on
main after reviewed merge; ordinary merges do not publish. Commit, PR review,
merge, and this CI release are authorized; Pi installation remains separate.
The release receipt must bind the artifact to reviewed committed source.

## Risks and rollback

Historical timeout cause remains unresolved. External camera activity can still
produce conflicts; bounded reconciliation/failure remains necessary. HomeKit
caller timeout does not prove remote command cancellation. Notification delivery
is Apple/device controlled and cannot be inferred from characteristic updates.

No release is authorized by implementation alone. Back up configuration and
accessory persistence before installation. Roll back via the previous exact npm
version; do not remove/re-pair accessories or install local tarballs/Git URLs.
