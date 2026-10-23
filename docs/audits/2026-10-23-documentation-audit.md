# Documentation audit — 23 October 2026

## Scope and ownership

Reviewed tracked repository documentation: public guides, release history, ADRs,
security ledger, historical designs/audits, native prototype/build notes,
contributor guidance and project agent instructions. The [documentation map](../README.md)
owns navigation. Generated API/graph outputs and upstream license/skill texts
retain their owning generation or vendor workflow. Private ignored log bundles
and local task transcripts are retained evidence, not published user guidance.

## Corrections

- Centralized RC acceptance in [RELEASE.md](../RELEASE.md#homebridge-upgrade-and-acceptance).
  Removed the fixed RC waiting period and duplicate duration rules elsewhere;
  retained natural-refresh, physical, source/review and immutable-artifact gates.
- Reconciled the [hardening ledger](../plans/security-hardening.md) with RC.19
  delivery and bounded physical acceptance. Stable publication is not asserted.
  F05/F06 remain open under the existing stable-specific risk disposition;
  full native integration, resource stress and five-target closure remain open.
- Replaced personal camera labels, device serials, hostnames, operator names and
  home paths with generic examples. Kept source versions, protocol findings and
  failure limitations required to understand the evidence.
- Removed obsolete machine-specific deployment, tunnel and service recipes from
  historical OAuth plans. Reduced the unadopted UI-layout migration proposal to
  current-owner references. Git history retains the original proposals.
- Corrected current-user guidance for SSRC/audio negotiation, output profiles,
  snapshot freshness versus busy/cache fallback, automatic reset, settings save
  and bounded STOP/reopen diagnostics.
- Corrected unsupported Doorbell ring-delivery advertising: the service exists,
  but no runtime ingress calls its ring trigger. This is a documented limitation,
  not a new implementation or physical ring acceptance claim.
- Corrected polling ADR claims about overlap, UI/runtime interval bounds and
  unmeasured battery impact; corrected effective versus requested FPS and native
  prototype CI scope. Generalized stale task and equipment assumptions in agent
  bootstrap/routing guidance.

## Verification and limits

Source/schema/package/workflow checks supported the changed behavior descriptions.
Independent documentation review checked the final changes and retained evidence
boundaries. Validation inspected 92 maintained/historical Markdown documents: 281 local
repository file links and 42 heading links resolved with no issues. A final tracked-document scan, including the root API routing map, found no
identified personal camera/setup references or fixed RC
waiting-period instructions; `git diff --check` passed.
Documentation-only work changes no executable code, package version or runtime
configuration, so no full Jest/media suite or live-device test was required.
Remote website availability is not established by local repository-link checks.

No GitHub issue status, commit, push, PR, merge, publication, host configuration
or installation is performed by this documentation audit. Subsequent delivery
must review these changes before treating them as published documentation.
