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
The fault did not leave a camera on at that subsequent readback.

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
verification and independent review are pending. Physical
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
