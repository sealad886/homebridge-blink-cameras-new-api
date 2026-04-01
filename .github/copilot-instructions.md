## Issue Tracking

This project uses **bd (beads)** for issue tracking.
Use the current Beads workflow for task tracking. Prefer Beads MCP tools when available; if the current environment only exposes the CLI, use the fallback commands below. Run `bd prime` for workflow context. If the local setup looks stale, run `bd doctor`; if hooks are outdated, run `bd hooks install --force`.

**CLI fallback quick reference:**
- `bd ready --json` - Find unblocked work
- `bd show <id> --json` - Inspect an issue
- `bd create --title="Title" --description="Context" --type=task --priority=2 --json` - Create issue
- `bd update bd-123 --claim --json` - Claim an issue
- `bd close bd-123 --reason "Done" --json` - Complete an issue
- `bd dolt push` - Push Beads state when a Dolt remote is configured

For full workflow details and session-close requirements, see `AGENTS.md`.
