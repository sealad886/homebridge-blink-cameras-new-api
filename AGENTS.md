# Agent Instructions

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.
Run `bd prime` for current workflow context. Agents should prefer the current Beads MCP workflow when it is available. If the current environment only exposes the `bd` CLI, use the equivalent `bd ... --json` commands below. If the local setup looks stale, run `bd doctor`; if hooks are outdated, run `bd hooks install --force`.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Dolt-powered version control with native sync
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### CLI Fallback Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create --title="Issue title" --description="Detailed context" --type=task --priority=2 --json
bd create --title="Follow-up issue" --description="What this issue is about" --priority=1 --deps discovered-from:bd-123 --json
```

Use `--type=bug|feature|task|epic|chore` and priorities `0-4` as needed.

**Claim and update:**

```bash
bd update <id> --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready --json` shows unblocked issues
2. **Claim your task atomically**: use the Beads claim operation, or `bd update <id> --claim --json` when only CLI is available
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create --title="Found bug" --description="Details about what was found" --priority=1 --deps discovered-from:bd-123 --json`
5. **Complete**: `bd close <id> --reason "Done" --json`

### Auto-Sync

Beads stores issue state locally in Dolt. Remote sync is separate: use `bd dolt push`/`bd dolt pull` only when a Dolt remote is configured for your environment.

- Use `bd dolt push`/`bd dolt pull` for remote sync
- Use `bd dolt commit` if your environment is configured to batch or defer local Dolt commits
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, run `bd prime`.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:

   ```bash
   git pull --rebase
   bd dolt push  # when a Beads Dolt remote is configured
   git push
   git status  # MUST show "up to date with origin"
   ```

5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- END BEADS INTEGRATION -->
