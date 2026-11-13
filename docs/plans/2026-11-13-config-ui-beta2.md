# Configuration clarity and diagnostic cleanup: 1.1.0-beta.2

Owner: Chief of Staff. Scope authorized by the maintainer: evaluate all ten
annotations, implement the resulting changes, review, merge and publish a new
beta. Pi installation and physical acceptance remain with the maintainer.

Route: Project Delivery `medium-feature-change`, medium risk because camera
preference management and persisted restoration receipts change. Context,
requirements, design and planning are resolved below. Implementation, testing,
documentation, independent review and release are required. Security/operations
applies to logging, migration and restoration; coordination applies to GitHub
and npm. Retrospective work is limited to recording concrete delivery lessons.
No new worktree, dependency, source-download redesign or Pi mutation is planned.

## Decisions and acceptance

| Request | Decision | Acceptance evidence |
| --- | --- | --- |
| 1: connection status | One automatic test after stored authentication is ready, then manual tests. Use neutral/checking, green check and red X states, with text. | Initial test once; manual retry; timeout/failure clears stale success; no configuration save; single in-flight test. |
| 2, 5: long help | Shared information buttons beside labels; help opens on hover, focus and touch, closes with Escape and remains hoverable. | Real browser keyboard/pointer/touch checks and field association; checkbox help never toggles the checkbox. |
| 3: unsaved changes | Contrasting warning background, text and border; retain polite status announcements. | Dirty, pending, invalid and clean states; light/dark contrast. |
| 4: negative setting | Positive `earlyNotificationMode`: `on`, `off`, `unmanaged`; overrides additionally inherit by omission. | Force on sets Blink on; force off sets it off; unmanaged conditionally restores the original. Legacy true maps to off, explicit false to unmanaged. No migration accidentally enables a camera. |
| 6: cache bytes | Display MiB (128 default, 32–1024 range), retain integer bytes in configuration/runtime. | Exact conversion, invalid values rejected, arbitrary existing bytes unchanged until edited, unrelated keys preserved. |
| 7: misplaced paragraph | Remove the long general paragraph; put essential motion/recording/privacy caveats at their controls. | Help explains independent sensor exposure and Apple Home recording permission without adding recording or arming actions. |
| 8: two poll settings | Retain separate behavior and clarify labels: Blink status refresh versus missing-clip retries. | Status refresh does not become recurring native-storage polling; event-driven clip discovery and cooldown remain unchanged. |
| 9: snapshot duration | Preserve the existing dependency; verify both toggle directions. | Duration disabled while persistence is on; its saved value survives toggles. |
| 10: temperature | Place global temperature beside global motion in Cameras in Home. | Both global sensor controls and existing camera overrides remain available. |
| Diagnostic cleanup | Remove always-on HomeKit audit instrumentation and HTTP/OAuth header/body/response dumps. | No full-state logging remains on these paths; actionable errors and bounded operation outcomes remain. Existing opt-in raw-video capture is separate and unchanged. |

## Design, migration and risks

Reuse the schema renderer, revision-fenced draft, existing connection-test route,
owned provider queue and durable before-change restoration path. One canonical
configuration migration serves runtime, UI and the explicit migration tool.
Opening the editor may stage a migrated draft but must not persist it. Preserve
sibling plugin blocks, unknown fields and explicit legacy false overrides.
Malformed input fails visibly. The CLI previews by default and backs up before
an explicitly requested apply; implementation does not authorize running it on Pi.

Saved original preferences must support both Boolean values, validate legacy
receipts, and preserve manual vendor changes. Do not send a replacement remote
command while an earlier operation has an unresolved outcome. Force-off alone
permits the existing opportunistic early clip lookup; force-on uses normal delay.
Rollback must account for the new configuration and restoration receipt format;
reinstalling an older package alone cannot translate newly persisted state.

The release unit is one exact reviewed main commit and its immutable npm tarball.
Publish through the existing main-only OIDC workflow, with fresh source gates,
five native candidates and all five installed-package qualifications. Verify
registry integrity/source identity, beta dist-tag and unchanged stable latest.
Do not weaken source integrity, admission, privacy or qualification gates.
Independent issues #97, #101 and #103 stay open and outside this change.

## Ordered work

- [x] Inspect current source, original behavior and existing tests; resolve annotations.
- [x] Implement UI, preference migration/runtime and diagnostic removal in disjoint slices.
- [x] Integrate schema/platform/docs; run focused and full lint/build/test checks plus local browser checks.
- [ ] Obtain independent review, address demonstrated defects and complete PR review/CI. **Active.**
- [ ] Merge and publish 1.1.0-beta.2 through the canonical workflow; record readback evidence.
- [ ] Hand off exact registry version and remaining Pi acceptance checks.

## Ownership and evidence

UI owner: public assets, UI tests and synthetic preview. Runtime owner: native
policy/runtime, canonical migration, settings routes/validation and focused tests.
Diagnostics owner: audit implementation/callers, HTTP/OAuth traces, related tests
and logging specification. Root: schema, platform, remaining fixtures,
configuration/release docs, manifests, integration and publication. Only root
performs repository-wide Git operations. Each owner preserves other edits.

Verification results and release identities will be appended after execution.

### Local verification checkpoint

- Full host Jest: 76 suites passed, one existing skipped; 2,151 tests passed,
  18 existing skipped. Host access was needed for isolated local UDP/TLS fixtures.
- Build, ESLint and production/test TypeScript passed. Release safety scripts:
  86 passed, including the actual compiled runtime bootstrap qualification.
- Synthetic Chromium checks cover automatic test once/manual retry, no config
  saves, compact hover/focus/touch help, mobile bounds, TTL toggles, MiB editing,
  legacy migration and light/dark warning state. Final visual/contrast readback
  passed after the independent-review correction below. No Pi runtime claim.
- Independent review found that rejected sign-in hid the failed-test icon with
  the old success step. The shared result now sits outside auth
  steps, with rejection/verification regressions. Independent re-review found
  no remaining actionable findings.

Tracking: [issue #104](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/104).
The release baseline was freshly verified as beta 1.1.0-beta.1, stable latest
0.10.0. Target remains 1.1.0-beta.2 on the beta dist-tag.

- Final UI regression checks: 77 passed across five suites. Real Chromium covered
  login and both verification prompts after a failed test, 390 px tooltip bounds
  and zero configuration saves. Warning text contrast: 8.05 light/9.38 dark;
  green result: 5.42/7.88; red result: 5.53/7.07. Screenshots were inspected and
  removed; screen-reader and real Pi UI acceptance remain untested.
- A separate read-only Pi check found no blink-diagnostics service/timer or
  matching collector process; Homebridge remained active. No Pi changes made.
- Installed plugin-ui-utils 2.1.2 declarations explicitly distinguish staging
  updatePluginConfig from savePluginConfig persistence; Context7 had no exact
  package entry, so the installed primary declarations supplied this contract.

### PR review round 1 corrections

PR #105 at b4036de passed the clean canonical release preflight: 2,157 tests
passed, 18 existing skipped. Automatic Codex code review and independent exact-
head review were clean. CodeRabbit CLI completed with two actionable findings:

- Browser timeouts could admit replacement tests while the original server test
  remained queued/active. Server-owned coalescing now shares identical work; a
  changed device or intervening auth action rejects busy without adding work or
  triggering a status-refresh cascade. UI waits remain finite.
- Malformed saved migration choices led to a reopen loop. Safe field-specific
  errors now lead to a Homebridge JSON Config repair panel. Invalid migration
  never mounts a draft, stages values, saves configuration or starts auth tests.

Service/route regressions: 109 passed; UI regressions: 83 passed. Four synthetic
Chromium malformed-input cases preserved the complete Blink and sibling blocks
with zero writes, then reopened after explicit synthetic repair. Fresh final
independent review and the next CodeRabbit round are required before merge.

### PR review round 2 correction

CodeRabbit completed a second pass at cc1b403 with one additional page-flow
finding: account actions could begin while a connection test was awaiting its
response/status refresh. All six account entrypoints now share one admission
guard for the bounded UI test interval. The underlying server operation retains
its existing ownership; the UI guard releases on its deadline even if that raw
request remains pending. Tests cover both admission directions, the status-
refresh interval and real deadline release. Callback-only restart controls are
not reachable from a testable step and retain their existing reservation checks.
