# Agent Instructions

## Issue tracking

Use [GitHub issues](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues)
for outstanding work and pull requests for implementation and release evidence.
Search existing issues before filing a new one, keep related work linked, and
close issues only when their acceptance criteria are verified.

Use GitHub closing keywords only in the default-branch PR delivering the verified
resolution. Reference deferred issues without closing keywords. Preserve unrelated
working-tree changes and follow the repository release workflow in `docs/RELEASE.md`.

Beads is retired from this repository. Do not initialize its database, reinstall
its hooks, run its migrations, or treat historical tracker IDs as active commands.
The retained intake in `docs/audits/2026-09-15-auth-token-diagnostics-audit.md`
records outstanding legacy work for reconciliation with GitHub.
