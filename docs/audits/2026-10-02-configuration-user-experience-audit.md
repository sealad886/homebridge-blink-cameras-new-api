# Configuration and user experience audit — 2026-10-02

## Outcome and scope

Audited the settings schema, custom Homebridge screen, authentication transitions,
configuration writes, and advertised per-device behavior. Started at `55a00f6`
on `codex/blink-reliability-rc1`; remediation is recorded in local Conventional
Commits on `codex/settings-ui-audit`. Existing untracked `__tests__/.DS_Store` was preserved.
No account, installed configuration, deployment, release, or external tracker was
changed. Beads was not used.

The invoked adversarial-audit skill explicitly includes local remediation.
Delivery routing used review-audit and testing-quality for evidence, followed by
compact project-context, requirements-acceptance, implementation-execution, and
independent review for confirmed fixes. No exact canonical profile combines
review and default remediation; this bounded route preserves that scope rather
than treating an audit as release authorization. Scale: small-to-medium; risk:
medium, with particular attention to configuration preservation and auth recovery.

Done criteria: current settings survive auth actions; required verification and
save recovery remain reachable; supported controls affect behavior; unsupported
choices are not presented as working settings; keyboard interaction and responsive
light/dark rendering pass synthetic checks; motion overrides expire at configured
boundaries. Live deployment acceptance is a separate evidence boundary.

## Evidence index

| Surface | Evidence |
| --- | --- |
| `config.schema.json` | Settings, supported choices, validation and layout |
| `src/homebridge-ui/public/index.html` | Auth wizard, config saves, network selection, theme and accessibility |
| `src/homebridge-ui/server.ts` | `/verify`, `/lock`, `/unlock`, status contracts |
| `src/homebridge-ui/hosted-auth-service.ts` | Stored-token and verification behavior |
| `src/platform.ts`, `src/accessories/motion-base.ts` | Motion polling and canonical duration resolver |
| `src/accessories/camera-source.ts` | Per-camera stream capacity, forced-off talkback |
| `README.md` | User-facing configuration contracts |
| `__tests__/homebridge-ui/config-save.test.ts` | Latest-setting preservation, verification after save failure, trust-device preference |
| `__tests__/platform.test.ts` | Observable HomeKit motion expiration across camera, doorbell, Mini and fallback |
| `__tests__/schema-auth-ui.test.ts`, `network-selection.test.ts` | Existing auth/schema and exclusion contracts |
| [Homebridge Plugin UI Utils](https://github.com/homebridge/plugin-ui-utils) | Current Bootstrap 5 injection, schema visibility, full-array config writes and explicit saving |

Installed `@homebridge/plugin-ui-utils`: 2.1.2. Graphify query mapped config/auth
entrypoints; AST update completed after source changes. No new dependency was
installed. Browser plugin was unavailable; bundled Playwright used local Google
Chrome with an isolated profile, synthetic Homebridge API and Bootstrap 5.3.8.
Browser launching required execution outside the sandbox. No real credentials or
OAuth transaction were used.

## Findings and final ledger

| ID | Severity | Evidence and consequence | Remediation / status |
| --- | --- | --- | --- |
| F1 | High | Auth completion and lock/unlock saved boot-cached config. VM reproduction overwrote a newer setting; network save already reread latest values. | **Fixed:** auth operations reread latest config, clone modified block, preserve unrelated fields and other blocks. Behavioral regression proves current polling/exclusions survive. |
| F2 | Medium | Config-save failure forced the success screen before checking verification requirements; suggested retry had no save action. | **Fixed:** preserve verification routing, retain pending auth config, show dedicated retry action independently of connection status. Client/account failure tests and browser save-failure/retry pass. |
| F3 | Medium | Verification failure requested a new code without a reachable restart action. | **Fixed:** verification screen offers restart through existing auth-clear/reset path. Synthetic browser returns to sign-in. |
| F4 | Medium | Advanced Options was a click-only `div`, inaccessible by keyboard. | **Fixed:** native button with expanded/control semantics; browser Enter toggles input visibility. |
| F5 | Low | Step transitions offered no focus or state announcement. | **Fixed:** focus step heading, announce its text, hide decorative dots; reduced-motion preference suppresses transition animation. Screen-reader hardware validation remains unperformed. |
| F6 | Low | Hidden debug-log listener appended DOM entries without a bound. | **Fixed:** retain at most 200 entries. Source proves bounded count; no sustained live-log benchmark was run. |
| F7 | Medium | Per-device `motionTimeout` was documented/exposed, but polling always supplied global duration. | **Fixed:** base motion handler uses existing per-device resolver; polling omits global override. HomeKit characteristic timer tests cover serial, ID, name and global fallback. |
| F8 | Medium | Normal settings allowed disabling persistence although completed hosted auth requires it, and geographic tier choices contradicted automatic discovery/rejected other valid tiers. | **Fixed:** hide persistence and tier from editable layout, preserve their schema properties, accept runtime-valid four-character tiers; connection status shows discovered tier. Manual JSON can still override runtime settings. |
| F9 | Low | Talkback checkbox appeared configurable despite forced-off runtime; stream limit lacked per-camera scope. | **Fixed:** hide talkback control, explain unavailable talkback in receive-audio help, clarify per-camera stream limit in schema/README. |
| F10 | Medium | Bootstrap 4 full-width/spacing/badge classes and old CSS variables lost styling under current Bootstrap 5 and dark theme. | **Fixed:** current classes and theme-aware variables. Desktop/mobile light and mobile dark screenshots inspected, no horizontal overflow. |
| F11 | Medium | Verification always sent `trustDevice: true`, ignoring user setting. | **Fixed:** read current setting before verification; false/true/omitted behavioral cases tested. |

## Remediation plan and execution

1. Preserve configuration and recover authentication save failures first.
2. Apply canonical motion-duration resolver and add observable timer regressions.
3. Remove misleading controls; correct schema/docs contracts and current theme
   styling; improve keyboard/state handling and bound diagnostics.
4. Run focused regressions, synthetic desktop/mobile interaction checks, broad
   tests, lint/build, Graphify update, and independent final review.

These are complete locally. No abstraction, framework, migration, or release
workflow was added. Existing config artifacts were not converted or overwritten;
this changes future editor behavior and corrects existing runtime intent.
Rollback trigger: a reproducible settings-preservation, auth-recovery, or motion
boundary regression. Reverting the focused source patch is possible before
publication; no external data migration has occurred.

## Verification and limitations

- Full Jest suite: 29 suites / 644 tests passed before final trust-device cases.
- Final focused auth/schema checks: 2 suites / 20 tests passed, including all three trust-device preference cases.
- ESLint, TypeScript build/UI asset copy, and `git diff --check` passed.
- Synthetic Chrome at 760 × 950 and 375 × 812: identity, meaningful content,
  no error overlay, no page script errors, no horizontal overflow, screenshots.
- Interaction loop: keyboard Advanced Options → start sign-in → denied clipboard
  fallback → submit synthetic result → required verification despite save failure
  → retry settings save → restart verification → connected state → select/save
  excluded network. Newer polling config retained throughout.
- Independent final reviewer approved auth/schema/theme and motion changes.
- Temporary harness and screenshots are under `/tmp/blink-*`; they are ephemeral
  evidence, not production assets or a real Homebridge installation.

Generated Homebridge schema form was not rendered inside an installed Homebridge
settings modal. Synthetic UI testing uses the documented injected API and
Bootstrap styling. Fresh Blink/Brave OAuth, remote account verification, real token
persistence across a child-bridge restart, camera motion, streaming, and
screen-reader acceptance require an authorized live environment. No claim of
production or release acceptance is made. Broad manual-JSON numeric validation
and unrelated runtime/streaming changes remain outside this audit slice.

## GitHub and commit follow-up

Live GitHub readback on 2026-10-02 found nine open issues. This audit did not
create, modify, or close issues. Open state does not establish current
reproducibility, and local fixes do not prove installed acceptance.

- [#48 — Preserve unresolved network target on HomeKit reads](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/48)
- [#37 — Investigate missing Blink Local Storage motion clips](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/37)
- [#25 — Deferred native Android AppAuth validation](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/25)
- [#24 — Confirm retired deployment credential revocation](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/24)
- [#23 — Verify hosted sign-in and token persistence](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/23)
- [#18 — API error on startup](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/18)
- [#17 — Disable networks](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/17)
- [#12 — Offline camera status in HomeKit](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/12)
- [#1 — Error upon restart](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/1)

Issue #17 overlaps existing network-exclusion implementation and synthetic UI
checks; closure still requires its acceptance to be reconciled. Issue #23
explicitly requires fresh owner-account sign-in, persistence, restart and refresh
acceptance on the published candidate, so remains outside local proof.

Pre-commit focused verification: five suites / 107 tests passed; staged diffs
passed whitespace checks. Implementation commits: `61749d8` (motion correction) and `4050f33`
(settings/auth UI correction). This evidence ledger is a separate documentation
commit. Unrelated `.DS_Store` preserved;
no push, PR, deployment, or release authorized or performed.
