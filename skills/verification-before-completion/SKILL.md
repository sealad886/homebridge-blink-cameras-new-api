---
name: verification-before-completion
description: Use before claiming ANY task is complete. Requires you to run actual verification commands, read real output, and confirm it matches expectations — before stating the task is done. Blocks "should work" rationalizations.
---

# Verification Before Completion

## The Law

```
YOU CANNOT CLAIM SUCCESS WITHOUT EVIDENCE.
"It should work" is not evidence.
"I believe it works" is not evidence.
Running the command and reading the output IS evidence.
```

## When to Use

Use this skill before saying ANY of these:
- "Done" / "Complete" / "Finished"
- "The tests pass"
- "The build succeeds"
- "The feature works"
- "The bug is fixed"

If you have not run the verification command and read its output in this session, you cannot make the claim.

## The Verification Process

### Step 1: Identify the Verification Command

Before claiming completion, state the exact command that proves the claim:

| Claim | Verification Command |
|-------|---------------------|
| "Tests pass" | `npm test` / `pytest` / `go test ./...` / `cargo test` |
| "Build succeeds" | `npm run build` / `go build ./...` / `cargo build --release` |
| "Type checking passes" | `npx tsc --noEmit` / `mypy .` |
| "Bug is fixed" | Run the exact steps that reproduced the bug |
| "Feature works" | Run the specific user flow end-to-end |
| "Coverage is 80%+" | `npm test -- --runInBand --coverage` / `pytest --cov` |
| "No security issues" | `npm audit` / `cargo audit` / `bandit -r .` |

### Step 2: Run the Command Fresh

Run it NOW, in this session. Not "I ran it earlier." Not "it was passing before I made changes."

**Fresh means:** After the last code change, run the command again.

### Step 3: Read the Actual Output

Do not skim. Do not assume. Read:
- The exit code (0 = success)
- The test count (N passing, 0 failing)
- The exact error messages if any

### Step 4: Confirm the Output Matches the Claim

Only if the output actually confirms the claim, state completion.

If the output contradicts the claim → fix the issue, then re-verify from Step 2.

### Step 5: Prune Workspace Artifacts (Mandatory)

After verification succeeds, inspect the exact disposable artifacts created by
this task before reporting done. This is an ownership check, not a wildcard
cleanup command.

1. Enumerate exact paths from this task's commands and existing evidence ledger.
   If ownership is unknown, preserve the file.
2. Check each candidate with Git and the retention requirements. Preserve tracked
   files, unrelated user/agent files, official test results, required diagnostic
   evidence, recovery material and user-requested logs, even when untracked.
3. Remove only exact, task-created disposable paths whose deletion is authorized.
   Never use filename globs, blanket truncation or repository-wide cleanup.
4. Record what was removed or retained and why. If no disposable files were
   created, no deletion is required. Do not delete other files to satisfy this step.

## Rationalization Red Flags

These thoughts mean you have NOT verified — stop and verify:

- "The tests were passing before I made this change"
- "This is a small change, it definitely didn't break anything"
- "I can see from the code that it's correct"
- "The logic looks right"
- "It should work based on how the library works"
- "I'll verify after I report back"
- "The previous run passed so it's fine"

Every one of these is a lie told to avoid the discomfort of possibly seeing a failure.
**Run the command. Read the output. Then report.**

## Completion Statement Format

When you have verified, state completion like this:

```
Verification run: `npm test`
Output:
  ✓ 42 tests passing
  0 failing
  Coverage: 84%

Task complete. ✓
```

Never omit the verification output. It is the proof.

## Why This Matters

LLMs are optimistic by default. They report what should be true, not what is true.
A test suite that "should pass" fails 30% of the time after non-trivial changes.
The only way to know is to run it.

One unverified claim compounds into three broken downstream tasks.
Five minutes of verification saves two hours of debugging later.
