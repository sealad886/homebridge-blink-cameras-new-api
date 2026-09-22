# Blink APK API Contract Recovery Implementation Plan

## Objective

Recover the Blink Android 59.2 build 29823413 static API declaration catalog
from all APK splits, retain Android 57.1 as the comparison baseline, validate a
canonical AI-readable JSON snapshot, and generate the Markdown dossier from the
same source of truth. Runtime requests, credential use, traffic interception,
and device mutation remain out of scope.

Completion means every discovered first-party declaration or candidate is
either represented as a contract, excluded with evidence, or retained as an
explicit unresolved record. Static evidence must not be presented as proof of
runtime server behavior.

## Checkpoint: 2026-09-22

Status: **round-4 corrections implemented and locally focused-tested; full
release gates and round-5 review remain in progress**.

Branch: `codex/serialize-motion-commands`

Pull request: [#38](https://github.com/sealad886/homebridge-blink-cameras-new-api/pull/38)

Published branch head: `f564d36` (`fix(api): preserve dynamic contract identity`)

The working tree contains the completed but uncommitted round-4 correction set.
Local `.vscode/` and `__tests__/.DS_Store` files are unrelated and must remain
excluded.

## Milestones achieved

- Added the repository-local Node.js extraction, validation, comparison, and
  Markdown-generation pipeline.
- Added JSON Schema Draft 2020-12 validation and focused golden fixtures for
  Java Retrofit, smali fallback, Kotlin continuations, parameters, dynamic
  URLs, models, transports, and deterministic rendering.
- Acquired and hashed all four APK splits for Android 59.2 and the retained
  Android 57.1 baseline; all 12 target DEX files are inventoried.
- Bound generation to fresh `decompilation-report.json` evidence instead of
  hard-coded tool outcomes. Current retained evidence reports 605 JADX errors;
  apktool/smali remains the corroborating fallback.
- Recovered Retrofit `@HTTP` declarations omitted by the initial parser,
  including known-faces DELETE routes.
- Replaced ambiguous simple-name DTO selection with qualified import/type
  resolution; removed false AndroidX/Bugsnag models and static/synthetic fields.
- Reconciled completeness counts from canonical arrays and added negative tests
  so contradictory summary data is rejected.
- Added per-endpoint recovery state and explicit unresolved records for runtime
  call sites, response/error/polling semantics, device-family attribution, and
  ambiguous nested model references.
- Corrected native URL validation, known-service URL matching, apktool warning
  counts, DEX evidence names, and unmatched-annotation accounting.
- Recovered bare Retrofit annotations and preserved distinct dynamic `@Url`
  contracts rather than collapsing them by method/path.
- Added recursive model-shape comparison to the 57.1 to 59.2 lifecycle logic.
- Completed three review/fix rounds with both CodeRabbit CLI and an independent
  Codex reviewer. Round 4 produced additional actionable findings and is not
  clean.

## Verification achieved before round 4

At published head `f564d36`, the following checks passed:

- 23 Jest suites and 547 tests;
- ESLint;
- TypeScript build and UI asset copy;
- JSON Schema and semantic contract validation;
- `git diff --check`;
- byte-identical JSON and Markdown regeneration; and
- npm package dry run excluding APKs, decompiled sources, logs, local settings,
  and secrets.

These checks do not make the pull request merge-ready because round 4 found
additional catalog correctness issues.

## Round-4 work implemented but uncommitted

The working tree contains implementation and fixture changes for:

- Kotlin serialization naming: global snake-case policy, explicit
  `@SerialName` field overrides, and serialized enum values;
- stable endpoint identity from wire parameter location/name/type;
- correct requiredness from nullability rather than Java wrapper type names;
- distinguishing a bare empty Retrofit path from a dynamic `@Url` parameter;
- scanning apktool output for every APK split and retaining each split hash in
  smali evidence;
- an actual URL-rewrite extraction assertion; and
- ambiguous smali-to-Java evidence retained as unresolved instead of attached
  to every overload.

The lifecycle comparer now sorts model fields and enum values and expands
repeated references independently while retaining explicit cycle markers. This
prevents source-order and traversal-order changes from appearing as API changes.
The generated 59.2 snapshot has been refreshed from all retained evidence.

Current generated totals:

- 334 active normalized contracts and 1 removed contract;
- 652 recursively recovered models;
- 20 added, 74 changed, 240 unchanged, and 1 removed contract;
- 373 explicit unresolved candidates; and
- 0 unclassified first-party candidates.

`POST v7/users/register` remains correctly classified as changed. Its request
model is stable, while 59.2 introduces explicit lowercase Kotlin serialization
names for authentication-response enums that the 57.1 declaration did not
carry.

## Remaining implementation work

1. Confirm split/Dex provenance reconciliation and verify that every active
   evidence hash belongs to the declared split inventory.
2. Run full Jest, lint, TypeScript build, contract validation,
   deterministic double-generation, `git diff --check`, and npm package dry
   run.
3. Review the complete diff, commit only the in-scope round-4 files with a
   Conventional Commit, and push PR #38.
4. Resume the iterative review loop at round 5. Both CodeRabbit CLI and the independent
   reviewer remain active because neither was clean in round 4. Retire a source
   only after it returns an explicit clean outcome.
5. When all active review sources and required CI are clean, re-run release
   preflight on the exact PR head, merge PR #38, and verify `main` contains the
   expected merge result.
10. Dispatch the authorized `0.10.0-beta.0` publish workflow from `main`, then
    verify the workflow, Git tag/release, npm integrity, and dist-tags. Keep
    `latest` on the stable release and move only `beta` to `0.10.0-beta.0`.

## Acceptance state

- Extraction implementation: **substantially implemented, corrections pending**
- Canonical JSON and generated Markdown: **present, regeneration pending**
- 57.1 to 59.2 comparison: **implemented, serializer-aware verification pending**
- Static completeness reconciliation: **implemented, final review pending**
- Review rounds: **3 corrected; round 4 open**
- Pull request: **open, changes required**
- Merge: **not performed**
- Beta publication: **not performed**
- Private runtime beta acceptance: **not started; remains a post-publication
  acceptance gate**
