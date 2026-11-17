# Homebridge verification preparation

Evidence snapshot: 17 November 2026, 04:18 UTC. Submission target: stable **2.0.0**.
Status: **2.0.0-alpha.0 publication independently accepted; stable and submission held**.

## Decision and current phase

Homebridge's current application is a verification-request **issue** in
[`homebridge/plugins`](https://github.com/homebridge/plugins#how-to-request-verification).
The published process does not require the applicant to open a registry PR.
The [submission draft](submission-draft.md) supplies the issue-form answers and
reviewer explanation. Submission and feedback follow-up are already conditionally
authorized after stable **2.0.0** has been properly released and accepted. That
condition remains unmet; the accepted alpha does not clear it.

- [x] Research the official process and earlier request.
- [x] Inspect current source and identify preparation gaps.
- [x] Draft the application and release-evidence checklist locally.
- [x] Publish and independently accept the corrected 2.0.0-alpha.0 package.
- [ ] Complete the existing prerelease/physical acceptance and final stable 2.0.0 gates.
- [ ] After stable acceptance, submit a fresh request and follow review feedback.

No source, package, migration or release changes are implemented by these files.
The next phase belongs with the release owner; these documents do not dispatch
release workflows, install the package on Homebridge or submit an issue.

The [external FFmpeg replacement](../plans/2026-11-16-external-ffmpeg.md) is now
published in the accepted alpha: externally installed FFmpeg 6.1+, preserved
`ffmpegPath`, a smaller libSRTP-only protection/launch helper, explicit migration,
`supports-hap`, and no automatic install or uninstall hooks. The current artifact
evidence is recorded below. The original RC audit remains historical; accepted
alpha packaging and synthetic media qualification do not establish production
Homebridge or physical recording acceptance for this backend.

## Earlier application changes what we must explain

The exact package was already proposed in
[`homebridge/plugins#990`](https://github.com/homebridge/plugins/issues/990).
It was closed as `not_planned` on 26 July 2026 after the differentiation question
went unanswered. The maintainer
[invited a fresh request explaining the differences](https://github.com/homebridge/plugins/issues/990#issuecomment-5083294713).
The [original question](https://github.com/homebridge/plugins/issues/990#issuecomment-4183356907)
named `homebridge-blink-for-home-new` and
`@jackietreeh0rn/homebridge-blink-security`. Both remain in the
[verified registry](https://github.com/homebridge/plugins/blob/latest/verified-plugins.json).

Prepare a fresh issue referencing #990. Do not reopen it, repeat its blanket
affirmations, or use its historical v0.7.0 automated pass as evidence for 1.1.0.
Its [manual-review note](https://github.com/homebridge/plugins/issues/990#issuecomment-4174108302)
about the uninstall script also needs an accurate current explanation.

### Differentiation supported by current sources

The principal additional workflow is delivery of completed native Blink Local
Storage USB clips into the existing camera's saved HomeKit Secure Video timeline.
The [recording delegate](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/1074a6587542fc6caf3ad8c3a3611004026aaabb/src/accessories/native-recording-delegate.ts#L190-L242)
delivers prepared video packets; live view, a motion alert, or an exposed recording
service alone does not establish that capability. This is the basis for review,
conditional on final-release physical acceptance.

| Verified alternative inspected | What its sources establish | Difference to explain |
| --- | --- | --- |
| `@jackietreeh0rn/homebridge-blink-security`, main `84db632d186744fbe26df8324d37025454f9c901` (14 November 2026) | Its [README](https://github.com/BitWise-0x/homebridge-blink-security/blob/84db632d186744fbe26df8324d37025454f9c901/README.md) documents OAuth/PKCE, live video and one-way audio, USB-manifest motion detection and optional doorbell-press push. Its [camera setup](https://github.com/BitWise-0x/homebridge-blink-security/blob/84db632d186744fbe26df8324d37025454f9c901/src/accessories/camera.ts#L145-L215) configures streaming without a recording controller option; a separate switch starts a Blink recording. The [maintainer's HKSV response](https://github.com/BitWise-0x/homebridge-blink-security/issues/35#issuecomment-4464889397) corroborates this distinction. | Importing completed native recordings into Home's saved timeline differs from USB motion detection or a switch that starts a Blink clip. Do not claim OAuth, audio, USB integration or all push support are unique. |
| `homebridge-blink-for-home-new` 0.2.1, main `0d3c100e462991be8e1849aeefb4bfb999c5681e` | Its [README](https://github.com/Flomentum-Solutions/homebridge-blink-for-home-new/blob/0d3c100e462991be8e1849aeefb4bfb999c5681e/README.md) documents overlapping security/motion/temperature controls but conflicts over live-view support. Its [recording delegate](https://github.com/Flomentum-Solutions/homebridge-blink-for-home-new/blob/0d3c100e462991be8e1849aeefb4bfb999c5681e/src/homebridge/blink-hap.js) returns no recording stream data. | Compare the concrete recording-delivery path. Do not infer complete live-view absence or present current account compatibility as tested. |

The historical comparison also covers pre-API-change releases: Colin Bendell's
[v3.9.0 release](https://github.com/colinbendell/homebridge-blink-for-home/releases/tag/v3.9.0)
(29 March 2022) described partial HKSC wiring, but its
[recording callback](https://github.com/colinbendell/homebridge-blink-for-home/blob/v3.9.0/src/homebridge/blink-hap.js#L47-L54)
returns no media, as does
[v3.9.2](https://github.com/colinbendell/homebridge-blink-for-home/blob/a4058deeb4e4c281c04115aeec1fa6040a002506/src/homebridge/blink-hap.js#L47-L54)
(24 October 2022). The examined
[zidge fork](https://github.com/zidge/homebridge-blink-for-home/blob/edf600439f6bbd9a1cbf5e4ca9e676e6bdbff6d2/src/homebridge/blink-hap.js#L47-L54)
and [crb2nu fork](https://github.com/crb2nu/homebridge-blink-for-home/blob/69c238d99e0b1cd5b5a85d223539236de1790529/src/homebridge/blink-hap.js#L47-L54)
retain the same placeholder. These are related implementations, not independent
confirmations of a working recording path.

Among the public Blink Homebridge implementations examined, no other functional
delivery of completed clips through HKSV was found. This bounded primary-source
finding supports novelty relative to both verified alternatives and the examined
historical predecessors; it does not establish universal uniqueness or “first
ever” across every fork, private integration or other bridge. No competitor was
device-tested. Sources were checked on 17 November 2026; refresh them when filing.
The reviewer decides whether the added workflow satisfies the functionality rule.

## Current rules and submission mechanics

The [canonical requirements](https://github.com/homebridge/plugins/wiki/Verified-Plugins#current-requirements)
call for a dynamic platform, additional functionality relative to verified
alternatives, public GitHub source/issues, npm publication, versioned GitHub
release notes, a settings GUI, supported Node LTS compatibility, successful
unconfigured installation, standard non-TTY startup, no system-changing install
hook, no tracking, storage confined to Homebridge, and contained/logged errors.

The [form inspected on 17 November](https://github.com/homebridge/plugins/blob/a3f60aa7dc535fa2ab638a1684888c682294379d/.github/ISSUE_TEMPLATE/1_verification-request.yml)
collects the npm name, GitHub repository, optional icon, six Yes/No declarations
and additional context. Use the generated form, with the package name first;
the [request workflow](https://github.com/homebridge/plugins/blob/a3f60aa7dc535fa2ab638a1684888c682294379d/.github/workflows/plugin-checks-request.yml)
reads the package name from line 3 of the generated body. The form supplies
`request-verification` and `pending` labels.
Do not paste this preparation document as the issue body.

The [checker](https://github.com/homebridge/plugins/blob/a3f60aa7dc535fa2ab638a1684888c682294379d/src/plugin-checks/workspace/index.ts)
installs npm `@latest`, compares default-branch metadata, checks schema and
dependency constraints, exercises startup, conditionally injects HTTP failures
when earlier scenarios made requests, and observes disk writes. Its explicit
package rules include a transport keyword and absence of
`preinstall`, `install` and `postinstall` scripts. An automated pass is followed
by [manual review](https://github.com/homebridge/plugins/blob/latest/src/plugin-checks/index.ts).
Publish any eventual correction before asking for a rerun. The request workflow
accepts `/check` on a line by itself in an issue comment.

The current requirements and
[Homebridge Node support guidance](https://github.com/homebridge/homebridge/wiki/How-To-Update-Node.js)
require Node **22, 24 and 26**. The checker currently tests engine coverage for
22/24, while the
[canned review comment](https://github.com/homebridge/plugins/blob/latest/.github/label-commenter-config.yml)
still lists 20/22. Use the current requirements for readiness. Homebridge 2.5.0
also requires Node 22.12.0 or newer; use a supported patch release when testing.
The published alpha's Node 22/24/26 source CI passed with the repository's locked
Homebridge 1.11.1 development dependency. That is not actual latest-Homebridge
runtime evidence; those final-package startup checks remain pending.

An icon is optional: approximately 100 by 100 pixels, square PNG, with suitable
trademark and licensing rights. Omit it initially unless a suitable asset is
approved. A wide README banner is not that asset. Add a Verified badge only
after approval. Ownership transfer is optional and separate from verification.
See the [icon form](https://github.com/homebridge/plugins/blob/latest/.github/ISSUE_TEMPLATE/2_icon-request.yml)
and [post-verification guidance](https://github.com/homebridge/plugins#post-verification).

## Source and publication snapshot

### Accepted 2.0.0-alpha.0 — 17 November 2026

The public, non-draft immutable
[v2.0.0-alpha.0 prerelease](https://github.com/sealad886/homebridge-blink-cameras-new-api/releases/tag/v2.0.0-alpha.0)
and its [release receipt](https://github.com/sealad886/homebridge-blink-cameras-new-api/releases/download/v2.0.0-alpha.0/release-receipt.json)
identify source
[`1074a6587542fc6caf3ad8c3a3611004026aaabb`](https://github.com/sealad886/homebridge-blink-cameras-new-api/commit/1074a6587542fc6caf3ad8c3a3611004026aaabb).
Publication and an independent registry-consumer audit were accepted by this
snapshot. npm `alpha` identifies `2.0.0-alpha.0`; `latest` remains **1.1.0**.
Stable **2.0.0** has not been released or accepted.

All five installed qualifications in
[publication run 44013144690](https://github.com/sealad886/homebridge-blink-cameras-new-api/actions/runs/44013144690)
verified the same source, immutable npm tar, packaged worker hashes and source
bundle recorded in the receipt:

| Qualified target | Actual external FFmpeg | Installed qualification |
| --- | --- | --- |
| Linux arm64 | 6.1.1-3ubuntu5 | [Passed](https://github.com/sealad886/homebridge-blink-cameras-new-api/actions/runs/44013144690/job/133806533279) |
| Linux x64 | 6.1.1-3ubuntu5 | [Passed](https://github.com/sealad886/homebridge-blink-cameras-new-api/actions/runs/44013144690/job/133806533187) |
| macOS arm64 | 9.0.2 | [Passed](https://github.com/sealad886/homebridge-blink-cameras-new-api/actions/runs/44013144690/job/133806533253) |
| macOS x64 | 9.0.1 | [Passed](https://github.com/sealad886/homebridge-blink-cameras-new-api/actions/runs/44013144690/job/133806533343) |
| Windows x64 | 9.0.2 essentials | [Passed](https://github.com/sealad886/homebridge-blink-cameras-new-api/actions/runs/44013144690/job/133806533239) |

The independent consumer check matched all **318 regular packed files**, loaded
**67 modules** from the isolated installed package, and recorded installation
and verification exit codes **0 / 0**. It confirmed the declared platform,
packaged host helper, migration tools and native/source/license inventory.
The accepted [manifest](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/1074a6587542fc6caf3ad8c3a3611004026aaabb/package.json)
declares `supports-hap`, no install/uninstall lifecycle hooks, and
`(MIT AND GPL-3.0-or-later AND BSD-3-Clause AND ZPL-2.1)`. The explicit migration
preserves preview, guarded apply, backup and idempotence; npm installation does
not migrate configuration. Recheck all of these against the final stable bytes.

This qualifies the alpha's package and bounded synthetic media/runtime paths.
It does not establish production Homebridge installation, latest-Homebridge
startup, or physical saved Home recording acceptance. Historical **1.1.0**
two-camera playback used the bundled backend and does not qualify the external
FFmpeg backend. The existing changed-backend acceptance and stable observation
requirements in the [release guide](../RELEASE.md) remain open.

### Historical publication and initial RC audit

At 15:49 UTC on 16 November 2026, a fresh public npm metadata read confirmed
`latest: 1.1.0`, source `5df5f0d828ac1b936eb197564108e1a6cbd7912d` and integrity
matching the published, non-draft
[v1.1.0 release](https://github.com/sealad886/homebridge-blink-cameras-new-api/releases/tag/v1.1.0)
and its [release receipt](https://github.com/sealad886/homebridge-blink-cameras-new-api/releases/download/v1.1.0/release-receipt.json).
The published manifest still has `postinstall` and lacks `supports-hap`. Its
codec workers are bundled, so external-backend claims cannot be attributed to
that release. The unsupported uninstall hook was removed in 1.1.0.

The maintainer selected **2.0.0** for the combined change because the external
FFmpeg prerequisite changes the supported installation contract. The first
[alpha attempt, run 43985984067](https://github.com/sealad886/homebridge-blink-cameras-new-api/actions/runs/43985984067),
failed installed qualifications and skipped publication. That failed evidence is
preserved; the later successful run does not retroactively pass it or establish
the exact cause of its earlier Windows failure. Immutable 1.1.0 is unchanged.
The checker still installs npm latest, so the accepted alpha does not make it
inspect the corrections while latest remains 1.1.0.

The following paragraphs and RC findings preserve the initial research baseline;
they are not the current publication state.

Fresh remote reads found default-branch commit
[`ab091a4bb79a79adfad6687c18f2bc64ad541395`](https://github.com/sealad886/homebridge-blink-cameras-new-api/commit/ab091a4bb79a79adfad6687c18f2bc64ad541395),
with [package version 1.1.0-rc.0](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/ab091a4bb79a79adfad6687c18f2bc64ad541395/package.json).
The earlier PR #113 hold in the local readiness audit is historical: its source
was merged. Merge does not establish RC or stable runtime acceptance.

A live [public npm metadata](https://registry.npmjs.org/@sealad886%2fhomebridge-blink-cameras-new-api)
read returned `latest: 0.10.0`, `beta: 1.1.0-beta.7`, and `rc: 1.1.0-rc.0`;
stable 1.1.0 was absent. These values are a dated snapshot. Recheck before
submission. Merely publishing an RC will not make the verifier test 1.1.0:
it installs `@latest`.

The initial RC research used the existing task checkouts and pinned remote main
without creating or switching a worktree. Those historical checkout observations
do not describe the accepted alpha's source or publication state.

## Readiness findings for the RC source

These are preparation findings, not a completed verification run. Source links
below are pinned to the inspected remote revision.

| Area | Observed evidence | Action before submission |
| --- | --- | --- |
| Transport keyword | [Manifest](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/ab091a4bb79a79adfad6687c18f2bc64ad541395/package.json) includes `homebridge-plugin` but lacks `supports-hap`. | Add the HAP declaration to the published package. Do not claim native Matter support. The current checker explicitly fails this omission. |
| Install lifecycle | The same manifest declares `postinstall`; [its implementation](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/ab091a4bb79a79adfad6687c18f2bc64ad541395/scripts/postinstall.cjs) can migrate the configured Homebridge JSON during POSIX installation. | Resolve the direct checker/policy conflict before submission. Recommended direction: retain a documented explicit one-time migration and remove the automatic npm hook, coordinating package checks, tests and upgrade guidance. Preserve backups and existing migration protections. This is proposed work, not implemented here. |
| Default branch and npm | Main describes an RC while npm latest is 0.10.0. | After stable publication, verify npm latest and the default-branch version both identify the intended 1.1.0 release. |
| Dynamic platform | [Entry point](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/ab091a4bb79a79adfad6687c18f2bc64ad541395/src/index.ts) registers `BlinkCameras`; [platform](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/ab091a4bb79a79adfad6687c18f2bc64ad541395/src/platform.ts) restores and registers cached accessories. | Retain final-package no-config startup, configured startup and restart/identity evidence. Source inspection alone is insufficient. |
| GUI and authentication | [Schema](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/ab091a4bb79a79adfad6687c18f2bc64ad541395/config.schema.json) and custom UI provide browser-based hosted sign-in and settings. | Exercise the published schema/UI with normal Homebridge startup; confirm no TTY, special flags or manual pairing workaround is required. |
| Compatibility | Manifest covers Node 20.3/22/24/26 and Homebridge >=1.11.1; CI has a Node matrix. | Attach final 22/24/26 results and latest Homebridge runtime evidence. An engine range does not prove all supported Homebridge versions. |
| Error handling | Runtime uses Homebridge logging and bounded provider/media operations. | Check final package with missing/invalid config, unreachable provider, HTTP failures and recovery. Do not claim that every exception is contained from source inspection. |
| Tracking and network | No analytics sender was found in the bounded audit. Push delivery uses functional Google/Firebase infrastructure in addition to Blink. | Review the final dependency/network surface before affirming no tracking. Explain functional push traffic; do not claim Blink is the only external service. |
| Storage and cleanup | [Uninstall script](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/ab091a4bb79a79adfad6687c18f2bc64ad541395/scripts/preuninstall.js) no longer imports dotenv or reads `.env`; it still attempts auth deletion across all existing candidate storage roots. | Review storage boundaries and ownership, including explicitly configured storage, caches/temp paths, migration backups and native workers. Explain or correct multi-root deletion before making assurances. Do not run cleanup against user data to test this. |
| Logging review | Runtime logger/redaction exists; the custom UI process also uses `console` output. | Review sensitive output and use of the appropriate UI logging API. This is a review question, not an additional no-console rule invented for the six current form declarations. |
| Native packaging | Five worker targets: Linux arm64/x64, macOS arm64/x64 and Windows x64. Corresponding source and notices are part of the release artifact. | Attach exact-artifact qualifications. Do not claim armv7/armhf support, all Raspberry Pi images, or all OS releases. No user-supplied FFmpeg is required for these workers. |
| License | Package declares `(MIT AND GPL-3.0-or-later AND BSD-3-Clause AND ZPL-2.1)`. | Describe the complete distribution accurately; do not call the entire npm artifact MIT-only. |

The RC table above is historical. The accepted **2.0.0-alpha.0** now publishes the
automatic install-writer removal, `supports-hap`, retained uninstall-hook removal,
and explicit migration with guarded backups and idempotence. Stable 1.1.0 shipped
with the install-hook and keyword conflicts and remains npm latest. Therefore
the application targets corrected stable 2.0.0; alpha qualification does not
mean that 1.1.0 or unpublished 2.0.0 passes. No policy exception or modification
of a published artifact is assumed.

## Corrected stable 2.0.0: evidence to attach

Use the [release guide](../RELEASE.md) and its changed-backend gates. The published
1.1.0 receipt is baseline evidence, not qualification for the external backend or
new install behavior. Do not copy an old dispatch into the release process.

- [ ] Current-source review and automated release gates pass; all five rebuilt
  native workers and installed-package qualifications bind to the final source
  and immutable npm integrity. Preserve receipts beyond transient CI artifacts.
- [ ] Accepted RC demonstrates changed physical critical paths and two natural
  token refreshes. Historical two-camera saved playback is bounded evidence;
  it does not establish acceptance of every subsequent runtime change.
- [ ] Stable runtime matches the accepted RC except version/release notes.
  npm exact `2.0.0`, `latest`, source SHA, integrity, Git tag, published non-draft
  GitHub release and receipt agree.
- [ ] Standard registry installation and child-bridge restart work. Confirm
  authentication, discovery, snapshots, live video/audio, recording permissions
  and fresh retained/playable Home recordings on the accepted configuration.
- [ ] Stable is observed for at least 24 hours including one natural token
  refresh, with outcomes and timestamps recorded. Reuse earlier evidence only
  for demonstrably unchanged paths, stating its limits.
- [ ] Recheck the official form, current verified alternatives and all six
  declarations against the final published package. Complete the draft's
  evidence placeholders; submit under the existing conditional authorization
  only after stable acceptance.

These documents record preparation and evidence. They do not run those tests,
install anything, change a release or create an upstream issue/PR.
