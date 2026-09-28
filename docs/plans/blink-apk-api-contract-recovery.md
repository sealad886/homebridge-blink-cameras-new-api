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

## Checkpoint: 2026-09-27

Status: **round-5 corrective implementation committed locally as `108ceb8`;
refreshed tests and validation pass; push and fresh required review remain pending**.

Branch: `codex/serialize-motion-commands`

Pull request: [#38](https://github.com/sealad886/homebridge-blink-cameras-new-api/pull/38)

Last observed published branch head: `c53cb788fa1fdcf4cb61bf7d7fa7c70f98684514`
(`fix(api): recover serializer-aware contracts`)

Local implementation milestone: `108ceb8`
(`fix(api): recover converter-specific wire contracts`), covering the extractor,
tests and fixtures, schema, agent guide, and regenerated catalog. Fresh required
PR review remains pending. Local changes to `AGENTS.md`, `.codex/`, `.vscode/`,
and `__tests__/.DS_Store` remain excluded and preserved.

Commit each validated, coherent milestone on this branch using Conventional
Commits. Pending review, CI history fixes, push, merge, or release gates do not
block local milestone commits. Keep those consequential steps separately tracked;
do not wait for final release approval to preserve completed work in Git.

The user has accepted the review decisions below. They are implementation
requirements, not proposals awaiting design approval. This acceptance does not
establish that their implementation or verification is complete.

## Adopted contract-recovery decisions

1. **Resolve serialization through the API's configured converter.** Trace DI
   bindings and converter configuration to establish naming policy. Recover
   explicit serialized names and apply the actual converter's transformation
   rules. Passkey registration uses camelCase; Kotlin `@Serializable` alone
   does not establish snake_case. Preserve different model variants when a
   shared DTO is used with different converter policies. Record ambiguous
   policy as unresolved. A hard-coded passkey exception is an interim patch,
   not completion of this requirement.
2. **Retain distinct response contracts.** Endpoint identity must include the
   effective request and response contract. Merge Rx/coroutine bindings only
   when their wire contracts are equivalent. Firmware, command-polling, and
   typed/raw DUOS responses must retain their distinct models and evidence.
   Regression fixtures must hold method, path, and request parameters constant
   while varying the response, so they prove this distinction.
3. **Represent field certainty explicitly.** Recover nullability, requiredness,
   and defaults from annotations, serializer descriptors, and constructor/default
   evidence. A Java reference type does not prove nullable, and an unknown
   default is not a JSON null default. Preserve unresolved metadata explicitly;
   include those gaps in completeness reporting and lifecycle comparison.
4. **Resolve constant-backed wire names.** Resolve imported, static, and local
   annotation constants using qualified ownership and evidence. Never publish
   Java expressions as resolved wire names. Use path placeholders only when the
   mapping is uniquely supported; parameter order alone is insufficient.
   Unresolved constants remain explicit candidates. Avoid simple-name fallback
   when owners collide.
5. **Compare effective wire behavior across versions.** Ignore source field
   order and implementation-only changes; include effective converter naming, response
   variants, requiredness, and known defaults. Validate removed contracts against
   retained baseline model evidence. Do not silently exempt removed records
   from reference-integrity checks.
6. **Keep one authoritative dataset.** Regenerate JSON and Markdown together
   after corrections, reconcile every candidate and split, and update release
   totals only from validated output. Static evidence remains separate from
   historical live evidence and private runtime acceptance.

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
- Completed four review/fix rounds. Independent round-5 review of `c53cb78`
  returned four blocking contract findings and a checkpoint documentation fix.

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

## Round-4 work published in c53cb78

The published commit contains implementation and fixture changes for:

- initial Kotlin serialization naming and `@SerialName` recovery; round-5 review
  supersedes its global snake-case assumption with converter-specific recovery;
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

Published snapshot totals (provisional until round-5 corrections regenerate):

- 334 active normalized contracts and 1 removed contract;
- 652 recursively recovered models;
- 20 added, 74 changed, 240 unchanged, and 1 removed contract;
- 373 explicit unresolved candidates; and
- 0 unclassified first-party candidates.

The published snapshot marks `POST v7/users/register` as changed. Reassess this
classification after converter and enum recovery are corrected; declaration
annotation differences alone do not prove a changed effective wire contract.

## Verification and review ledger

- At `c53cb78`: 23 Jest suites / 549 tests, lint, TypeScript build, schema and
  semantic validation, split/hash reconciliation, and whitespace checks passed.
- Two independent full generations produced byte-identical JSON and Markdown,
  matching the published artifacts. Package dry run listed 131 files and
  excluded APKs, decompiled sources, extraction logs, and local evidence.
- Independent round-5 review: changes required, findings R5-01 through R5-04
  correspond to adopted decisions 1 through 4; R5-05 is corrected by this plan
  update. Review coverage was `origin/main...c53cb78`, static only.
- CodeRabbit round 5: invocation rejected before execution by automatic approval
  review because it would send the private repository diff to CodeRabbit.
  This is a blocked source, not a clean result. No workaround was attempted.
- CI at `c53cb78`: Node 20/22/24 tests and GitGuardian passed. Commitlint failed
  on body lines exceeding 100 characters in `4b910ad` and `04a42b8`.
- Earlier partial round-5 edits passed the 13-test focused suite before the then-latest
  validation edit. Full generation then failed on four removed baseline model
  references. A subsequent generation was interrupted without an observed
  completion. Those intermediate failures are superseded by the successful
  double-generation and validation recorded below.
- Converter tracing, ambiguity handling, baseline model integrity, and stronger
  fixtures were subsequently implemented and committed in `108ceb8`.
- On 2026-09-27, refreshed full Jest passed 25 suites / 559 tests; lint,
  TypeScript build, schema/semantic validation, generated Markdown consistency,
  and whitespace checks passed before the implementation milestone commit.
  APK provenance and third-party exclusions are unchanged from the prior commit.
  Full APK extraction was not rerun for this commit-only checkpoint; the earlier
  successful deterministic extraction remains the recorded acquisition evidence.

## Execution checklist

- [x] Publish and validate round-4 correction commit `c53cb78`.
- [x] Complete independent round-5 review and adopt its decisions in this plan.
- [x] Complete round-5 corrections and regenerate both artifacts.
- [x] Validate corrected output and deterministic regeneration locally.
- [x] Commit validated round-5 implementation locally (`108ceb8`).
- [ ] **Active:** push corrected output and obtain clean required reviews.
- [ ] Resolve commitlint and the CodeRabbit invocation blocker.
- [ ] Merge and publish the authorized beta after all gates pass.

## Remaining implementation work

### Delegated corrective implementation (2026-09-22)

The accepted decisions required implementation, not documentation-only edits.
Work returned to implementation with two bounded agents in the existing checkout:

- Endpoint agent: response-aware identities, transport-equivalent overload
  normalization, qualified annotation constants, and collision-safe unresolved
  handling. Implementation delivered; four focused behavioral tests passed,
  including scalar-versus-collection lifecycle comparison.
- Model agent: source-evidenced converter/DI policies, recursive policy variants,
  explicit field certainty, defaults, and enum serialization. Implementation
  delivered; three focused behavioral tests passed. Direct source sanity recovered
  199 snake_case and 2 camelCase policies across 347 declarations; 146 remained
  explicitly unresolved. These declaration counts precede normalization.
- Primary integration: apply converter recovery before deduplication; preserve
  baseline models and validate removed references against their own version;
  retain unresolved converter/parameter/field metadata records; compare effective
  lifecycle metadata without treating renamed source constants as wire changes.
  Focused behavioral verification passed (22 tests, with generated-artifact
  validation deferred until regeneration). Lint and TypeScript build passed.
  Package dry run contained 131 allowlisted files, no private analysis artifacts.

Independent local integration verification found and corrected an endpoint-ID
prefix mismatch, omitted collection response shape in lifecycle comparison, and
implementation-only converter metadata causing false lifecycle changes. This
verification does not replace the required PR review sources.

### Validated local result

- Both complete generations succeeded; JSON and Markdown are byte-identical
  with the same acquisition timestamp.
- JSON Schema and semantic validation passed; all 4 splits and 12 DEX files
  reconcile; 347 Java and 347 smali declarations; no unmatched annotations,
  no active contracts missing smali evidence, and zero unclassified first-party
  candidates.
- 343 active contracts, 4 baseline-only records, 677 current models, and 557
  retained baseline models. Lifecycle classification: 23 added, 272 changed,
  48 unchanged, 4 removed. A changed classification can reflect newly resolved
  metadata, not confirmed server behavior. The three additional baseline-only
  device-info records retain old response namespaces rather than discarding them.
- All 347 endpoint declarations have direct evidence, but no active endpoint
  has every recovery dimension resolved. Current models: 219 direct, 8 inferred,
  450 unresolved. These are confidence dimensions, not proof of runtime behavior.
- 1,607 explicit unresolved records: 984 model-field metadata (both versions),
  101 parameter wire names, 343 endpoint behavior, 37 model references, and
  142 converter bindings. There are 120 excluded third-party URL records.
- Retained decompilation evidence: JADX completed with 605 reported errors;
  all four apktool commands completed, with 105 base-resource warnings.
- Full Jest: 25 suites, 559 tests passed. Lint, TypeScript build, schema/semantic
  validation, exact artifact comparison, package allowlist check, and
  `git diff --check` passed. Knowledge graph updated successfully; shell startup
  emitted sandbox warnings but the graph rebuild completed.
- 59.2 base SHA-256:
  `b0ee9a502c059e80de09e31dfc3608f78b8d2a2ab9dc58ca35ec234bf0a4bcef`.
- 57.1 base SHA-256:
  `432bb98a362cc910a031c1104bb6bd6b32f9e67bf5cf20318e0cdd2dc4dcfd9e`.

These local results are not a clean PR review round or publication evidence.
No live API requests, credential use, or device mutations were performed.

1. Completed locally: adopted decisions 1–5, targeted behavioral fixtures,
   baseline-only models, full regeneration, and direct passkey policy inspection.
2. Completed locally: focused/full Jest, lint, TypeScript build, validation,
   deterministic double-generation, diff check, and npm package dry run.
3. Local milestone committed as `108ceb8`; push it with this plan checkpoint
   to PR #38 when resuming the authorized publication workflow.
4. Retain both review sources as active. CodeRabbit round 5 is blocked; the
   independent reviewer requires a fresh review of the corrected revision.
   Preserve source/head attribution and the ten-round budget. Resolve the
   external-review authorization denial before retrying that transfer.
5. Correct the two commit-message bodies after obtaining exact authorization
   for branch-history rewriting and a force-with-lease push. Preserve a recovery
   ref, confirm remote head, and verify tree equality after a message-only rewrite.
   Do not weaken commitlint to bypass the failure.
6. When all active review sources and required CI are clean, re-run release
   preflight on the exact PR head, merge PR #38, and verify `main` contains the
   expected merge result.
7. Dispatch the authorized `0.10.0-beta.0` publish workflow from `main`, then
    verify the workflow, Git tag/release, npm integrity, and dist-tags. Keep
    `latest` on the stable release and move only `beta` to `0.10.0-beta.0`.

## Acceptance state

- Extraction implementation: **round-5 corrections implemented and locally validated**
- Canonical JSON and generated Markdown: **regenerated, validated, deterministic**
- 57.1 to 59.2 comparison: **implemented and locally tested; fresh review pending**
- Static completeness reconciliation: **implemented, final review pending**
- Review rounds: **4 correction rounds published; round 5 changes required and
  CodeRabbit blocked**
- Pull request: **open, changes required**
- Merge: **not performed**
- Beta publication: **not performed**
- Private runtime beta acceptance: **not started; remains a post-publication
  acceptance gate**
