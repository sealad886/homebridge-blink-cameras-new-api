# A Team bootstrap provenance

Recovered missing roster compiler, agent profiles and skill definitions from official https://github.com/RBraga01/a-team at immutable commit `b59f579118473f23014543d7cd5bde84b4218245`. Installed cache identifies as 1.4.1 but omits these runtime files; official v1.4.1 tag also lacks roster.py. No existing repository instructions, hooks or files were overwritten. No global plugin update or hook installation performed.

## Project adaptations

The initial bootstrap matched upstream bytes. PR review required local
adaptations to the project constraints and installed capabilities. Adapted
profiles/skills use CONTRIBUTING.md validation and GitHub issue/PR ownership,
explicit roster checks without hooks, existing-checkout isolation, reviewed
release/rollback, preservation of unrelated files and required evidence, and
explicit handling of the documented optional native-worker test skip.

Adapted files: code-reviewer, harness-optimizer, infra-reviewer, orchestrator,
build-error-resolver, doc-updater, e2e-runner,
python-reviewer, refactor-cleaner, security-reviewer, tdd-guide and
typescript-reviewer profiles; using-a-team, using-git-worktrees,
finishing-a-development-branch, incident-response, test-driven-development and
verification-before-completion, executing-plans and subagent-driven-development
skills. These no longer claim byte identity.
All other copied profiles and the compiler retain the pinned upstream bytes.
No global plugin cache or host hook was changed.

## Upstream license

MIT License

Copyright (c) 2026 Ricardo Romão Marques Braga

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
