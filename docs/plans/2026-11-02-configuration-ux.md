# Configuration UX implementation plan

Design: [configuration UX and camera-feed capacity](../specs/2026-11-02-configuration-ux-design.md).
Authority: local implementation and verification; no publication, Pi settings
write, installation, restart, external tracker write or real-feed load probe.

## Checklist

- [x] Complete source investigation and authenticated before-screen review.
- [x] Resolve schema-driven rendering, Save semantics and topology limits.
- [ ] **Active:** Record and locally commit the approved design before product edits.
- [ ] Implement the disjoint UI and runtime slices below; run focused checks.
- [ ] Integrate and run build, lint and full Jest; update graph metadata.
- [ ] Independently review code, TypeScript, privacy and local rendered behavior.
- [ ] Update canonical configuration help and hand off the verified local change.

## Work and ownership

| Work | Owner | Files and contract |
| --- | --- | --- |
| UI | UI implementer | Sole writer of public UI assets, `config.schema.json`, UI/schema tests and related configuration help. Five sections, authored schema-driven controls, discovered selectors and one revision-fenced draft. |
| Runtime | Runtime implementer | Runtime/provider types, shared inventory and validation, platform capacity, shared upstream admission, settings service/server and backend tests. No schema edits; supply the schema contract to the UI owner. |
| Integration | Root | Manifest/lockfile Ajv promotion, branch, integration, full checks, review dispatch and final handoff. |
| Evidence | Delivery orchestrator | Review/plan synthesis and bounded implementation routing. |

Both implementers preserve unrelated changes and the existing native verification
receipt. No new worktree is permitted. The settings server, inventory projection
and shared runtime types have one writer. The UI owner handles all schema edits,
including removal of the HSV count limit and the new module-limit property.

## Dependencies and gates

1. Root commits the design/plan locally. No product edit precedes that notice.
2. Runtime and UI owners agree on the inventory and validation request/response
   shape before integrating their consumers. Runtime owns the shared source.
3. The UI slice validates draft ordering/preservation; the runtime slice validates
   admission and retirement. Each reports focused results and unresolved gaps.
4. Root integrates both and checks semantic consistency between schema, runtime,
   API errors, privacy copy and help. Full checks follow, then independent review.
5. A local visual pass proves the new hierarchy and changed control behavior.
   Source-only or mock results do not establish Pi application or iCloud clips.

## Required evidence

| Area | Observable acceptance |
| --- | --- |
| Settings | Five task sections; no stacked auth/form surfaces; final raw edit survives Save staging; navigation preserves valid/invalid edits and unknown config; only the latest valid staged revision enables Save. |
| Identity | Discovered qualified camera identities distinguish kind collisions; unmatched selections survive discovery errors; actual module IDs and association confidence are visible. |
| Capacity | Six synthetic cameras/HSV selections; global capacity equals known nonexcluded inventory; independent module caps; shared live/HSV consumes one slot; failure/late cleanup releases exactly once. |
| Resources | Existing fixed recording budgets, per-worker limits and diagnostic quotas remain effective. |
| Privacy | Labels distinguish Blink polling, local motion, event suppression and capture permissions; local raw files are clearly separate from HSV. |
| Integration | Focused tests, full build/lint/Jest, independent review and inspected local screenshots with limitations recorded. |

Do not weaken resource or validation invariants to make a test pass. If an
inventory cannot resolve module association, reject an affected explicit limit
and preserve the user's draft rather than inventing membership. If startup's
original triggering error remains unobserved, report that limit even after the
contradictory-state handling is corrected. Safari console currently identifies
an invalid HTML pattern and a compound-expression SyntaxError; reproduce and
trace those generated-source failures and verify the replacement in Safari.

