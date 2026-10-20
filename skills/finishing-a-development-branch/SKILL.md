---
name: finishing-a-development-branch
description: Complete a development branch before merge — verify tests pass, update documentation, ensure quality gate passes, and prepare a clean PR.
---

# Finishing a Development Branch

Complete all final steps before merging a feature branch.

**Announce at start:** "I'm using the finishing-a-development-branch skill."

## Checklist (Complete in Order)

### 1. Verify Tests Pass
```bash
npm test -- --runInBand --coverage
```
- All required tests must pass. Reject unexpected/new skips or disabled critical-path tests.
- The existing optional native-worker vector test may remain skipped when
  `BLINK_MEDIA_TEST_WORKER_PATH` is unset; report that limitation explicitly.
  Do not claim that skip establishes secure-worker or platform acceptance.
- Coverage must be ≥ 80%
- If tests fail → stop and fix before continuing

### 2. Verify Build
```bash
npm run build      # or go build ./..., cargo build --release
npx tsc --noEmit
```
- Build must succeed with zero errors

### 3. Quality Gate
- Verify roster and reviewer eligibility before dispatch:
  ```bash
  python3 scripts/roster.py verify
  python3 scripts/roster.py check Agent code-reviewer
  python3 scripts/roster.py check Agent security-reviewer
  ```
- Use the available collaboration tools to dispatch independent code and security
  reviewers with their installed profiles, exact head/base, scope and evidence.
  Require explicit outcomes and resolve actionable findings. `/quality-gate` is
  not an installed command in this Codex project.
- Block MUST be resolved before merge
- Warn can merge with documented issue

### 4. Clean Up
- Remove only disposable debug statements introduced by this task; retain intentional diagnostics.
- Remove obsolete commented-out code introduced by this task.
- Link this task's remaining TODO/FIXME items to verified issues; preserve unrelated work.

### 5. Update Documentation
- Update CLAUDE.md or README.md if setup changed
- Run `doc-updater` agent if codemaps are out of date
- Update CHANGELOG if project uses one

### 6. Prepare PR
```bash
git log --oneline [base-branch]..HEAD    # Review all commits
git diff [base-branch]...HEAD            # Review all changes
```

Write PR body with:
- Summary (3-5 bullet points of what changed and why)
- Test plan (checkboxes for manual verification steps)
- Screenshots if UI changed

### 7. Final Commit
- All changes staged and committed
- Commit message follows conventional format
- Branch is up to date with base

## Hard Rules

- Never merge with failing tests
- Never merge with CRITICAL review findings
- Never merge to main/master directly (use PR)
- Never skip the quality gate

The branch is done when every checkbox above is checked.
