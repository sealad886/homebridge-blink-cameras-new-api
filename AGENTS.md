# Agent Instructions

## Release authorization

A maintainer request to complete and release work in this repository authorizes
the routine steps required by [the release guide](docs/RELEASE.md). That includes
staging the scoped diff, making signed commits, pushing the task branch, opening
or updating its pull request, merging after required checks, and publishing the
intended version through GitHub Actions. A single release request covers these
steps. Apply any narrower scope the maintainer specifies. Worktree creation,
history rewrites, and installation on an owned Homebridge host need their own
authorization.

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

## Pull requests and issue intake

A pull request can stand on its own. When creating a GitHub issue, set the
applicable available issue fields. When planning from an issue, review its
fields, description, and comments.

## Code search

Run `codanna mcp -h` to find the indexed code and documentation search interface.
