---
name: using-git-worktrees
description: Create or verify an isolated git worktree before starting any development work. Prevents main branch contamination, enables parallel feature development, and gives subagents a clean baseline. Use at the start of every feature branch.
---

# Using Git Worktrees

## Project constraint takes precedence

This repository's approved work uses the existing checkout. Do not create a
worktree unless the human explicitly authorizes that individual worktree. A
workflow, subagent assignment or implementation approval does not grant it.
Inspect status, branches, worktrees and ownership first; reuse a task-specific
branch or create a safe local branch without moving unrelated changes. Give
concurrent agents disjoint file ownership. This satisfies the isolation check
for the current project; do not block work merely because no new worktree exists.
The creation examples below apply only after that separate authorization and
must use the repository's required location and preservation rules.

## Why Worktrees

A worktree is a second checkout of the same repo in a separate directory. Each worktree has its own working tree and HEAD, but shares the git object store. This means:

- Subagents work in isolation — no interference with your main session
- You can switch tasks without stashing
- Parallel features develop independently
- Clean rollback: abandon the worktree, nothing pollutes main

## When to Use

Use at the START of every feature or bug fix to verify isolation permitted by
the project constraint above. A dedicated branch in the existing checkout is
the selected isolation method for this project.

Mandatory before:
- `subagent-driven-development` skill
- `executing-plans` skill
- Any work touching more than one file

## The Process

### Step 1: Detect Existing Isolation

First check — are you already isolated?

```bash
# Check if current directory is a worktree (not the main checkout)
git worktree list
pwd
```

If you're already in a worktree for this feature: proceed to Step 3 (verify clean baseline).
If you're in the main checkout: use the approved local task branch. Proceed to
Step 2 only after explicit authorization for that individual new worktree.

### Step 2: Create the Worktree

```bash
# Only after explicit authorization, verify the global ignore rule first.
git check-ignore .worktrees/example
git worktree add .worktrees/<feature-name> -b codex/<feature-name>
```

Use only the primary workspace's `.worktrees/` location required by project
policy; do not substitute a plugin cache, system temporary or sibling directory.

### Step 3: Verify Clean Baseline

Move into the worktree and confirm it starts clean:

```bash
cd .worktrees/<feature-name>
git status                        # Should show: "nothing to commit"
git log --oneline -3              # Confirm you branched from the right point
```

If status shows unexpected changes: something is wrong — investigate before proceeding.

### Step 4: Run Project Setup

Install dependencies and confirm the baseline builds:

```bash
npm install          # or pip install -r requirements.txt / go mod download
npm run build        # Confirm baseline build passes BEFORE any changes
npm test             # Confirm baseline tests pass BEFORE any changes
```

If baseline build or tests fail: STOP. Fix the issue on main first, then recreate the worktree.

### Step 5: Proceed with Work

Now development starts. The worktree is isolated, the baseline is confirmed clean.

## Cleanup After Work Completes

Inspect status, untracked files, unpushed commits, active owners and reachability
first. Follow repository policy for removal of that individually authorized
worktree. Branch deletion requires its own applicable authorization; a merge
alone is not permission to delete existing branches.

## Common Issues

| Issue | Fix |
|-------|-----|
| "already checked out" error | The branch exists in another worktree — use a different branch name |
| Worktree has unexpected changes | Run `git status` to investigate; never force-remove with uncommitted work |
| Setup script fails in worktree | Check for absolute paths in scripts; worktrees use different working directories |
| Submodules not initialized | Run `git submodule update --init --recursive` in the new worktree |

## Worktree vs Branch Checkout

| | `git worktree` | `git checkout -b` |
|--|----------------|-------------------|
| Main session disrupted | No | Yes |
| Parallel work possible | Yes | No |
| Independent node_modules | Yes (separate dir) | Shared |
| Subagent isolation | Clean | Risk of contamination |

Use the isolation method authorized for this project. Subagents share the
existing checkout with disjoint file ownership; they may not create worktrees.
