## O que entendi

Homebridge Blink Cameras is an existing TypeScript/JavaScript Homebridge plugin, with Python diagnostic tooling, C native prototypes, Jest tests, synthetic media tests and GitHub Actions/npm delivery. Codex is the active AI platform. Current work diagnoses RC.15 Front door stutter and upstream disconnects after STOP/reopen, then delivers a reviewed successor RC through CI. Pi configuration and installation remain operator-owned.

# INIT.md — Homebridge Blink Cameras

## Project Overview

- Type: Homebridge integration with hosted authentication UI and media streaming.
- Status: Active development; production Homebridge instance used for authorized read-only diagnostics and explicit Home acceptance.
- Canonical project documentation: [docs/README.md](docs/README.md).
- Canonical release workflow: [docs/RELEASE.md](docs/RELEASE.md).
- Security delivery ledger: [docs/plans/security-hardening.md](docs/plans/security-hardening.md).

## Languages & Stack

- TypeScript / JavaScript: Node 20/22/24, Homebridge, HAP, Jest, FFmpeg media pipeline.
- Python: bounded Pi evidence collection/reporting and repository checks.
- C: native media prototypes; not accepted secure-worker runtime.
- Build: npm, TypeScript, GitHub Actions; npm trusted publishing.
- Persistence: existing configuration and authentication stores; no SQL database.

## Active AI Platforms

- Codex desktop and Codex CLI.
- Specialist definitions are instructions for delegated Codex agents; native slash-command/agent integration is not assumed.

## Non-Negotiable Rules

Repository/user instructions control. Preserve unrelated files, branches and worktrees. No new worktree. Do not change Pi configuration, install, restart, reset pairing or delete persistence. Preserve mandatory TLS, destination, resource and secret-redaction guards. F05/F06 remain open with the existing documented stable-specific disposition. Do not enable experimental talkback. Keep synthetic, release-artifact and physical acceptance evidence distinct. Use existing GitHub issues, review and CI publishing workflows. Retain explicitly requested evidence; do not duplicate canonical project plans here.

## Active Work / Next Steps

- Diagnose and reproduce RC.15 stutter and upstream disconnects after reopening Front door.
- Implement bounded fixes with behavioral regressions and media timing/packaging validation.
- Complete independent code/security review, CI and reviewed merge.
- Publish a new unused RC through the existing CI workflow; operator installs it.

## Roster Selection

Activate general engineering, TypeScript/Python, performance, security, documentation, E2E and CI specialists. Keep unrelated mobile, Go, Rust, SQL, LLM and regulated-domain specialists inactive without deleting definitions. All workflow skills remain available except SQL data-migration (no database). No autonomous loop or external communications owner is needed.
