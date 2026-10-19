# Documentation map

Start with the [user guide](../README.md). This map assigns one owner to each
maintained topic. Update that owner first; use links elsewhere instead of copying
procedures, settings tables or release decisions.

## Current guides and sources

| Topic | Canonical owner | Scope |
| --- | --- | --- |
| Overview, installation and Home controls | [Root README](../README.md) | User entry point and accessory behavior |
| Settings | [Configuration](configuration.md) | Examples, defaults and operator explanations; [schema](../config.schema.json) owns UI validation |
| Sign-in and recovery | [Authentication](authentication.md) | Operator procedure; ADR-001 owns architecture |
| Video/audio and quality | [Streaming](streaming.md) | FFmpeg requirements, compatibility, input/output profiles and talkback |
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
| Native prototype | [Native README](../native/README.md) | Experimental protocol/build scope; not the npm runtime |
| Outstanding work | [GitHub issues](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues) | Search before adding tracking entries; local old TODOs are not active tracking |

Package engines, runtime source, tests and CI remain the executable authority.
Prose must describe the revision it accompanies without claiming unverified
provider, device or platform acceptance. The root README uses repository URLs for
extended guides because `docs/` is not included in the current npm package.

## Evidence, proposals and history

Historical records preserve what was known or tested at the time. Their unchecked
items, example commands and pending-release statements are not current operating
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
- [Legacy intake](../todo/TODO.md): retained user requests, superseded as an active
  tracker by GitHub issues.

Generated files under `api-contract/` and `graphify-out/` are derived artifacts.
Regenerate them through their owning tool rather than editing duplicate facts.
License and third-party notice texts retain their upstream wording.
