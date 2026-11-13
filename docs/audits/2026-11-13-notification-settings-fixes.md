# Early Notification and settings-open corrections

## Scope and evidence

The maintainer reported an Early Notification force-off fault and a false changed
settings report on opening the editor. Work uses the existing authorized checkout
on local branch `codex/notification-settings-fixes`, from published beta.3 source
`62d5255ffa715cb87a9c6112a49f1265d6ea1c97`. No version or deployment changes.

Pi readback on 13 November 2026 confirmed installed beta.3 and active Homebridge.
Blink startup at 11:28:26 produced three force-off confirmations and one generic
`early-notification-faulted` at 11:28:30. This record omitted camera and exception
category, so the exact historical cause is unproved. Cached-token metadata GETs,
run as the Homebridge file owner at 11:36:32 UTC, confirmed Early Notification
false and compatible true for Corner, Entry, My Bedroom and Front Kitchen.
No sign-in, refresh, vendor mutation, restart or full-state capture was performed.
Early Notification was disabled on all four cameras at that subsequent readback;
this did not establish whether the cameras themselves were enabled or armed.

The saved platform has `earlyNotificationMode: off` plus the equivalent legacy
`disableEarlyNotification: true`. Both initial normalization and unconditional
host staging can therefore cause the reported false changed indication.

## Ordered work and ownership

1. Diagnose both paths and preserve the installed runtime. Complete.
2. Implement bounded preference verification/diagnostics and settings draft fix.
   UI worker owns public draft state and its tests; preference worker owns SDK,
   runtime and their tests. Root owns documentation and integration.
3. Independently review the integrated diff, verify and commit the local fixes.

## Confirmed source defects and corrections

- The editor stages every successful validation, including mount, discovery and
  account baseline adoption. Pinned plugin-ui-utils 2.1.2 documents
  `updatePluginConfig` as a config-change action, not a read or validation call.
  Stage only actual changed content against the canonical saved baseline.
  Keep real edits/reverts, stale acknowledgements and account recovery working.
  Migration is a one-time persisted installation step, not a second runtime or
  editor interpretation format. Retire the old conversion endpoint and paths.
- Preference confirmation performs one immediate GET after command completion;
  the sibling quality-setting path already permits bounded delayed readback.
  Use GET-only confirmation under the existing deadline, never replay the POST.
- Expected HTTP 409 lacks already-satisfied state reconciliation. A fresh read
  may confirm the desired compatible value; otherwise preserve the refusal.
  Preserve original-setting and remote-operation ownership semantics.
- Preference failures discard identity and category. Add bounded typed categories
  and sanitized camera context without raw exception or provider data.

These are reproducible source defects. Neither stale readback nor conflict can
be named as the proven cause of the earlier Pi warning.

## Validation and limits

UI worker: 85 tests across five focused suites and JavaScript syntax passed.
Settings milestone committed locally as `978a757`; preference work remains separate.
Context7 had no package-specific plugin-ui-utils index; the installed pinned
primary implementation/type documentation establishes its host action contract.
Preference worker: 259 client/runtime tests, TypeScript, focused ESLint and diff
check passed. Canonical-boundary/platform checks: 40 tests passed. Canonical-only
UI/server cleanup: 219 tests across eight suites passed, with type/lint/syntax
checks. Installer and existing file-migration suites: 33 tests passed; package
dry-run includes the hook, converter and compiled helper. Integrated source
verification and independent review are recorded in the final closeout below. Physical
HomeKit recording/iCloud retention and installation of these fixes are untested.

## Migration architecture correction

The maintainer explicitly required legacy values to be migrated, rather than
preserved for ongoing interpretation. Installation now invokes the existing
file converter at the installer-identified config path, with exact-byte private
backup, atomic replacement, ownership preservation, idempotency and conflict
checks. No broad storage-path discovery or vendor operation is introduced.
The runtime boundary rejects unconverted keys with explicit migration guidance;
the editor's conversion service and separate migration baseline are removed.
The earlier settings milestone is retained as history; follow-up integration
removes that transitional compatibility path rather than rewriting the commit.
The running Pi has not been migrated by this source task.

The installation converter retains its existing POSIX-only guard. Windows
installation skips unsupported automatic file replacement with manual conversion
guidance, preserving valid canonical installs and config bytes; legacy keys must
be converted explicitly before runtime starts. Isolated platform tests prove the
skip does not import or run the POSIX writer. No real Windows install was run.

## Integrated host qualification

At local source `e598c545cf4d9eeb6fc30a0c709159f39de5bb4b`, canonical
`npm run release` completed successfully: lint, build, 2,235 passing tests,
18 existing skips, and package preview/cleanup. Separate release-contract tests
passed 86/86. Evidence is retained in `logs/notification-settings-fixes/checks.json`,
`preflight.log` and `release-contracts.log`. These host checks do not publish the
package and do not qualify a new installed native artifact or production upgrade.
The package version is still the published baseline beta.3; it must not be
republished for these different bytes. New review/publication requires a new
version and the normal release gates. See final independent review below.

## Independent availability finding

Independent review at `e598c54` found one required correction: the existing writer
forced the replacement config to `0600`, which could revoke Homebridge access to
a root-owned/group-readable `0640` config when invoked automatically. The backup
remains private at `0600`; replacement config now preserves the original access
permission bits and UID/GID. Regression coverage includes private and group-readable
configs, exact backup bytes and repeat no-op behavior. Final independent refresh and integrated verification are recorded below.

## Final verification and local handoff

Final implementation source is `d4638459cda037904e6b8229f944f65ce95027d8`,
compared with published beta.3 base `62d5255ffa715cb87a9c6112a49f1265d6ea1c97`.
Canonical preflight passed lint, build, 2,236 tests with 18 existing skips,
78 passing suites with one skipped suite, and package preview/cleanup. Separate
release-contract tests passed 86/86. Final results are in
`logs/notification-settings-fixes/checks-final.json`, `preflight-final.log` and
`release-contracts-final.log`.

Fresh independent final review is CLEAN, with no actionable findings. Its 69
focused tests across five suites passed without skips. Actual installation-hook
probes confirmed replacement modes 0600/0640, unchanged UID/GID, exact original
backup bytes, private 0600 backups, and repeat no-op behavior without new backups.
The original NEEDS WORK report is preserved beside `independent-review-final.md`.

Implementation commits are local on `codex/notification-settings-fixes`:
`978a757` (settings staging), `96779a5` (bounded preference verification),
`e598c54` (persisted migration and canonical-only callers), and `d463845`
(service-access preservation). No version bump, push, PR, release, Pi migration,
installation or restart was performed for these new fixes. Prior beta.3 publication
is separately complete; its package bytes must remain immutable. A subsequent
beta needs its own reviewed source and all normal release qualifications.

Historical fault cause remains unproved; live readback established Early
Notification false on all four cameras at the observed time, not camera status.
Source/host qualification is not installed Pi,
physical Home delivery or iCloud-retention acceptance. Automatic converter scope
remains POSIX; Windows legacy values require manual canonical JSON conversion.

## Beta.4 review corrections

The maintainer authorized reviewed publication as 1.1.0-beta.4. Local canonical
qualification at `0cc0f34` passed lint, build, 2,238 tests with 18 existing skips,
and package preview. Fresh independent review passed 199 focused tests and found
two completion gaps: stale rollback permission instructions and an obsolete
synthetic-preview migration route. Both are corrected in the next review batch.

Installer review also established that a global package prefix does not identify
Homebridge's active storage. Automatic conversion now requires the installer's
explicit absolute `UIX_STORAGE_PATH`; without it the installed hook leaves files
untouched and gives explicit migration guidance. Source checkout dependency
installs skip before any config access, even with an inherited storage path.
The installer/migration suite passed 36 tests for this correction.

The repair panel now includes Windows manual conversion guidance without adding
legacy interpretation to the editor. Eight existing recovery tests and the
generated-preview syntax/canonical-validation check passed. Normal Homebridge
UI 5.30.0 Save closes the editor; plugin-owned account saves replace the baseline.
Review allegations about a stale baseline after normal Save and delayed ACK
reapplying config were rejected using the pinned host's actual lifecycle.

Final exact-source review, CI, native installed-package qualification, registry
identity and release readback remain required. No Pi config write, installation
or restart is part of this source task.
