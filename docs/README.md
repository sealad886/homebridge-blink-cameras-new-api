# Blink for Homebridge documentation

The canonical public documentation is **[Blink for Homebridge](https://sealad886.github.io/homebridge-blink-cameras-new-api/)**.
Connect your Blink account, choose your cameras, then verify live viewing and
optional native-clip recording in Apple Home.

[Illustrated setup](../output/articles/set-up-blink-cameras-in-apple-home/index.md)
· [How it works](how-it-works.md)
· [Troubleshooting](troubleshooting.md)
· [Offline download](https://sealad886.github.io/homebridge-blink-cameras-new-api/offline.html)

## Choose your guide

| I want to… | Read this |
| --- | --- |
| Install, sign in and test a camera | [Illustrated setup](../output/articles/set-up-blink-cameras-in-apple-home/index.md) |
| Understand motion, live viewing and saved clips | [How it works](how-it-works.md) |
| Connect or recover a Blink session | [Sign-in and account verification](authentication.md) |
| Choose cameras, names, snapshots and recording options | [Configuration](configuration.md) |
| Verify a first saved Home clip | [Recording setup checklist](configuration.md#recording-setup-checklist) |
| Tune live viewing and sound | [Streaming](streaming.md) |
| Upgrade an older installation | [One-time migration](native-recording-config-migration.md) |
| Diagnose a missing clip or connection | [Troubleshooting](troubleshooting.md) |

## Publication and offline reading

The [public site](https://sealad886.github.io/homebridge-blink-cameras-new-api/) rebuilds automatically through
[documentation CI](../.github/workflows/docs.yml) when its content or build inputs
change on `main`. Pull requests validate the bundle without publishing it.
Each guide has a stable page URL; Markdown remains its maintained source.

The [offline guide](https://sealad886.github.io/homebridge-blink-cameras-new-api/offline.html) includes its text, styles,
search and screenshots in one downloadable HTML file. Save it and open it in a
browser without a server or sign-in. Follow the [build instructions](../output/documentation/README.md)
for local preview, validation and publication maintenance.

## Documentation map

This map assigns one owner to each maintained topic. Update that owner first;
use links elsewhere instead of copying procedures, settings tables or release
decisions.

Last reviewed: 16 November 2026.

## Current guides and sources

| Topic | Canonical owner | Scope |
| --- | --- | --- |
| Illustrated setup | [Setup walkthrough](../output/articles/set-up-blink-cameras-in-apple-home/index.md) | Source-rendered camera setup, live viewing and first recording verification |
| Video and motion paths | [How it works](how-it-works.md) | Concepts, control boundaries and delivery checkpoints |
| Public documentation and CI | [Publication guide](../output/documentation/README.md) | Canonical URL, build/deploy automation and offline artifact |
| Overview, installation and Home controls | [Root README](../README.md) | User entry point and accessory behavior |
| Settings | [Configuration](configuration.md) | Examples, defaults and operator explanations; [schema](../config.schema.json) owns UI validation |
| Sign-in and recovery | [Authentication](authentication.md) | Operator procedure; ADR-001 owns architecture |
| Video/audio and quality | [Streaming](streaming.md) | Packaged codec requirements, migration, input/output profiles and talkback |
| Motion and native HomeKit recording | [Configuration](configuration.md#motion-and-homekit-recording) | Push subscription, completed USB clips, timing and Home policy; ADR-007 owns architecture |
| Stable and beta upgrade conversion | [One-off migration](native-recording-config-migration.md) | Combined 0.10.0 media/motion upgrade, intermediate beta recording/journal migration, preview/apply, private backup and Windows manual steps |
| Faults and recovery | [Troubleshooting](troubleshooting.md) | Operator diagnosis |
| Diagnostic policy | [Logging specification](debug_logging_spec.md) | Controls, bounds and redaction |
| Trusted evidence reproduction | [Pi evidence reporter](../scripts/pi-evidence/README.md) | Data-only bundles and trusted normalizer |
| Development and tests | [Contributing](../CONTRIBUTING.md) | Setup, local checks and PR guidance |
| Repository invariants | [Conventions](CONVENTIONS.md) | Packaging and engineering constraints |
| Durable architecture | [ADR index](adr/README.md) | Accepted decisions and their rationale |
| Vendor wire contract | [API contract](api-contract/README.md) | JSON/schema authority, generated catalog and regeneration |
| Vendor URL construction | [API routing map](../blink_api_map.md) | Construction paths and APK evidence |
| Security status | [Hardening ledger](plans/security-hardening.md) | Requirements, findings, evidence and release dispositions |
| Release operations | [Release guide](RELEASE.md) | CI publication, operator installation, rollback and acceptance |
| Release history | [Changelog](../CHANGELOG.md) | Versioned shipped changes |
| Private media worker | [Native README](../native/README.md) | Integrated codec/IPC implementation and native evidence; release qualification remains gated |
| Outstanding work | [GitHub issues](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues) | Search before adding tracking entries; local old TODOs are not active tracking |

Package engines, runtime source, tests and CI remain the executable authority.
Prose must describe the revision it accompanies without claiming unverified
provider, device or platform acceptance. The root README uses repository URLs for
extended guides because `docs/` is not included in the current npm package.

## Evidence, proposals and history

Historical records preserve what was known or tested at the time. Personal
camera labels, serial numbers, hostnames, home-directory paths and operator
identities are omitted or replaced with generic examples in published prose.
Source versions, platform constraints, observed outcomes and limitations remain.
Private diagnostic receipts are not public documentation or operator recipes.

Historical unchecked items, example commands and pending-release statements are not current operating
instructions. Do not silently rewrite those outcomes as later successes.

- [API dossier](blink_api_dossier.md): original APK evidence and provenance;
  use the generated current contract for the catalog.
- [Authentication integration receipt](integration_checklist.md) and
  [API gap assessment](integration_gap_analysis.md): bounded historical findings.
- [Migration proposal](migration-notes.md): historical layout proposal, not an
  upgrade procedure.
- `audits/`: dated audits, prototypes and independent review receipts. Current
  finding dispositions belong to the hardening ledger.
- `plans/`: delivery history and checkpoints, except the maintained hardening
  ledger. Follow linked issues/PRs for subsequent work.
- `future/`: unimplemented research; not advertised functionality.
- `superpowers/`: retained OAuth designs and execution plans, not a second
  project-management or installation system.
- [Legacy intake](audits/2026-09-15-auth-token-diagnostics-audit.md): retained
  audit intake for reconciliation with GitHub issues.

Generated files under `api-contract/` and `graphify-out/` are derived artifacts.
Regenerate them through their owning tool rather than editing duplicate facts.
License and third-party notice texts retain their upstream wording.

Latest review: [23 October documentation audit](audits/2026-10-23-documentation-audit.md).

## Documentation maintenance and validation

Update the canonical owner for a changed behavior and link to it from summaries.
Keep source/schema/CI as executable authority; do not copy defaults, capability
matrices or release gates into historical plans. Label proposals and dated
receipts so they cannot be mistaken for current features or authorization.
Preserve failure observations when later hardware or operator evidence supplies
a disposition; do not retroactively turn an unverified test into a pass.

For documentation-only changes, check relative files and heading anchors,
source-backed examples/defaults, personal-data placeholders and `git diff --check`.
No new media test, dependency or full runtime suite is needed unless a machine-
readable contract or implementation changed. Generated API catalogs and graph
files are regenerated only through their owners; license texts retain upstream
wording. Verify remote links when their target or technical claim changes.
