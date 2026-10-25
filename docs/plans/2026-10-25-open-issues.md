# Open issue implementation plan

Design: [accepted task scope and design](../specs/2026-10-25-open-issues-design.md).
The owner's instruction explicitly authorizes design followed by execution.

## Route and gates

Project Delivery `medium-feature-change`, scale medium, risk medium, authority
change. Required owners: context, requirements, design, planning, implementation,
testing, documentation, independent review and release/change control.
Security/operations activated for network reliability and credential evidence;
coordination activated for GitHub reconciliation. Retrospective is planned-future
pending a meaningful observed outcome. User authorized ordinary push, PR creation,
review interaction, gated squash merge and eligible branch cleanup. Publication,
deployment and physical operations are excluded. Work stays in the existing
clean checkout on `codex/open-issue-resolution`; no new worktree.

Ready/design gates: exact issue inventory, executable requirements, canonical
code ownership and real temperature wire evidence established. Baseline focused
accessory/platform suites: 114 tests passed. No unknown blocks local source work.

## Ordered work and milestones

- [x] M1: Inventory every open issue/PR, requirements and minimal design.
- [x] M2: Network target reads and reconciliation regressions.
- [ ] M3: Optional real camera temperature, configuration, regression tests and user docs. **Active.**
- [ ] M4: Full local validation, independent review and conventional milestone commits.
- [ ] M5: PR review rounds, current-head CI, gated main integration, tracker reconciliation and cleanup.

One active milestone at a time. Primary implementer owns source and integration;
fresh reviewer contexts own independent assessment. External acceptance stays
with the owner/operator. No dates or delivery estimates are promised.

### M2 — Network target state (medium risk, depends on M1)

1. `__tests__/accessories.test.ts`: extend opposite-intent regression to read
   target/current before the latest command completes, including queued expiry.
   Add polling reconciliation and explicit already-confirmed replacement tests.
   Observe failure before changing source.
2. `src/accessories/network.ts`: use the existing unresolved intent in target
   reads; protect polling publication; clear superseded intent on an explicit
   already-confirmed write. Keep confirmed current/motion behavior.
3. Run focused accessory tests and inspect diff. Commit coherent fix and tests.

### M3 — Temperature (medium risk, depends on M2)

1. `__tests__/blink-api/client.test.ts`: prove config GET route, Fahrenheit
   decoding, missing/malformed handling and request budgets before implementing.
2. `src/blink-api/client.ts`: centralize existing config read/path, add narrow
   temperature decoder. Keep video quality validation independent.
3. `__tests__/platform.test.ts`, `src/platform.ts`, `config.schema.json`: prove
   and implement default-off/global/per-device temperature selection and UI
   validation. Reuse established matching; do not add legacy config adapters.
4. `__tests__/helpers/homebridge.ts`, `__tests__/accessories.test.ts`,
   `src/accessories/camera.ts`, `src/accessories/motion-base.ts`: test-first
   sensor lifecycle, Celsius values, fault isolation, availability and coalesced
   reads. Reuse existing device availability logic at its owner.
5. `docs/configuration.md`, `README.md`: document option, support boundary,
   metadata request cost, sample limitations and normal restart procedure.
6. Run targeted tests/lint/build; update graph with `graphify update .`.
   Commit coherent feature/tests/docs; no version bump or release dispatch.

### M4/M5 — Verification and delivery (depends on M3)

Run full Jest coverage, lint/build, API contract validation, existing package and
release safety checks; inspect wrapper effects before running. Required hosted
gates include Node 20/22/24 and commitlint, signed commits, squash merge and
resolved review threads. Record independent code/security review with exact
head/base, configured review sources, at most ten rounds and explicit outcomes
in the [review ledger](../audits/2026-10-25-open-issues-review.md).

Use the shared PR template. Preserve issue #48's registry/physical acceptance
gap; reference #25 without closing it. #24 is closed by explicit owner direction.
For #54, describe exact implemented support and unverified physical limitations.
Before merge, recheck base/head, all findings, source retirement/final-head
coverage and CI. Verify main contains the merged result before removing only
eligible task branches. Preserve the pre-existing `codex/pi-evidence-monitoring`
branch unless separately proven eligible under this task's cleanup authority.

## Risks, rollback and evidence

| Risk | Mitigation / proof | Disposition |
| --- | --- | --- |
| Older remote completion erases newer desired state | Getter/cache/expiry/reconciliation regressions | Must pass before merge |
| Optional metadata affects camera/bridge health or traffic | Default off; bounded single-flight GET; isolated fault; disabled-path tests | Must pass before merge |
| Unsupported or missing temperatures look valid | Only proven camera config field; finite/range checks; fault/no fabricated value | Must pass before merge |
| Local source mistaken for registry/device acceptance | Keep delivery gaps in issue/PR and handoff | Remains external |
| Deferred Android scope expands without trigger | #25 remains deferred; no device changes | Explicit boundary |

Rollback is a reviewed source revert or operator disablement of temperature.
No stored data is migrated. Local/hosted test receipts belong in the review
ledger or PR. Keep task-created disposable diagnostics separate from retained
evidence and remove only proven disposable files at cleanup.
