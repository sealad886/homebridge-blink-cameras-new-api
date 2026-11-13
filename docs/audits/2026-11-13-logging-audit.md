# Logging audit, 13 November 2026

## Scope and acceptance

User requested normal push and HSV handoff visibility, an adversarial audit of
normal/debug logging, simplification and milestone commits. Preserve removal of
full Blink state capture. No new release or Pi installation is part of this work.

1. Implement semantic lifecycle receipts through existing real-camera delegates.
2. Audit transport/auth, camera/media/native and UI sinks; remove confirmed noise
   and obsolete documentation, preserving privacy and failure reporting.
3. Verify integrated behavior and create local milestone commits.

## Milestone 1

Normal push receipt, decoded motion and explicit HSV gating reasons now lead to
camera-scoped queue/acquisition/catalog/download/preparation/offer receipts.
Home requests, transfer completion and terminal delivery outcomes remain distinct.
A local salted flow label links stages without logging vendor identifiers.
The report callback is guarded so logging cannot alter resource ownership.

Worker checks: TypeScript, owned-source ESLint, diff check and 156 focused tests
passed. These establish host behavior, not installed Pi or iCloud retention.

## Audit ledger

| Finding | Evidence | Disposition |
| --- | --- | --- |
| Push/HSV visibility gap | Most existing report events were debug-only; policy gates returned silently | Corrected in milestone 1 |
| Snapshot chatter | 50 unavailable snapshots produced 50 identical lines with mediaDebug off | Remove routine request/cache messages |
| Logger callback ownership | Synthetic throwing snapshot logger prevented required callback | Guard canonical callbacks |
| Token preflight chatter | Valid token expiry printed on every HTTP preflight | Remove routine success line; preserve refresh/errors |
| Duplicate OAuth receipt | Headers-received line follows status/timing receipt | Remove duplicate |
| Placeholder diagnostic output | Literal redacted lines and unused cookie parsing | Remove placeholders; retain counts/status/errors |
| Duplicated URL redaction | Auth private redactor duplicates canonical helper; no exploitable caller found | Reuse canonical helper and verify privacy |
| UI auth progress machinery | Percent/ETA for at most two files | Remove progress machinery; keep decisions and loaded receipt |
| Stale HSV documentation | Describes retired rolling-buffer states | Replaced with actual finite clip lifecycle |

No raw HTTP/auth payload dump, native stderr forwarding, packet/frame logging or
unbounded provider-message path was demonstrated in inspected production sinks.
Native stderr draining and binary stdout IPC must remain intact.

## Replay accessory readback

The synthetic name exists only in a standalone prototype helper in the primary
checkout, outside current main and the npm package. Targeted process inventories
on Mac and Pi found no running helper; Pi configuration has no matching target.
No process or data was deleted. A retained Home pairing must be removed in Home.
Real-camera delegate routing is covered by existing runtime/delegate tests.

## Verification limits

Initial media tests had five UDP-bind failures under sandbox; independent bind
probe returned EPERM. Subsequent host-access media tests passed.
Physical Home delivery and iCloud retention are not established by source tests.

## Milestone 2 and independent review

Milestone 1 is local commit `d1a332c`. Independent lifecycle review found two
corrections: hyphenated serial tokens escaped camera-name sanitization, and
public/recording motion publication failures needed warning severity. Both are
corrected, with the platform regression suite passing all 19 tests.

Transport review: 193 tests passed across seven suites. Media/UI remediation:
138 focused tests plus 46 host UDP-dependent tests passed. TypeScript, focused
ESLint and diff checks passed. Maintained OAuth scripts were syntax-checked,
not executed against Blink. Cleanup removes the ledger's confirmed chatter and
uses canonical URL redaction. No raw payload tracing was restored.

Independent review confirmed real-camera identity remains bound through each
recording delegate; observer failures cannot retain media resources. Home stream
acknowledgement still does not establish iCloud retention. Integrated lint,
build and full suite are the remaining host qualification gate.

## Integrated qualification and closeout

Host lint and build passed for `6a24d90`. Full Jest run completed with 2,188
passed, 18 skipped and one failed test (76 passing suites, one failing suite,
one skipped suite). The sole failure asserted the intentionally removed
"Snapshot requested" chatter. Production source did not require correction.
The test now verifies error-level reporting and exactly one Home callback;
all 91 tests in that suite passed on the corrected test. No full-suite repeat
was needed for this test-only assertion correction. Existing skips remain.

Evidence is retained under `logs/logging-audit/`: `checks.json`, `lint.log`,
`build.log`, the original `tests.log`, and `accessories-correction.log`.
The original failed run is preserved. No unresolved demonstrated logging defect
remains within the reviewed scope. Live provider/Pi execution and physical
Home/iCloud acceptance were not performed. All changes remain local on
`codex/logging-audit`; no version bump, push, PR, release or installation occurred.
