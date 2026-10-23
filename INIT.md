# INIT.md — Homebridge Blink Cameras

## Project Overview

- Type: Homebridge integration with hosted authentication UI and media streaming.
- Status: Active development; runtime and physical acceptance are recorded in the security ledger and release evidence.
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

Repository/user instructions control. Preserve unrelated files, branches and worktrees. No new worktree. Host configuration, installation, restarts, pairing and persistence changes require explicit operator authorization. Preserve mandatory TLS, destination, resource and secret-redaction guards. F05/F06 remain open with the existing documented stable-specific disposition. Do not enable experimental talkback. Keep synthetic, release-artifact and physical acceptance evidence distinct. Use existing GitHub issues, review and CI publishing workflows. Retain explicitly requested evidence; do not duplicate canonical project plans here.

## Delivery state

The [security ledger](docs/plans/security-hardening.md) owns current acceptance
and finding dispositions; GitHub issues and release PRs own outstanding work.
Do not pin a task, camera name, host or RC-specific checklist in this bootstrap.
Use the [release guide](docs/RELEASE.md) for promotion and observation criteria.

## Roster Selection

Activate general engineering, TypeScript/Python, performance, security, documentation, E2E and CI specialists. Keep unrelated mobile, Go, Rust, SQL, LLM and regulated-domain specialists inactive without deleting definitions. All workflow skills remain available except SQL data-migration (no database). No autonomous loop or external communications owner is needed.
