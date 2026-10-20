# A Team bootstrap provenance

Recovered missing roster compiler, agent profiles and skill definitions from official https://github.com/RBraga01/a-team at immutable commit `b59f579118473f23014543d7cd5bde84b4218245`. Installed cache identifies as 1.4.1 but omits these runtime files; official v1.4.1 tag also lacks roster.py. No existing repository instructions, hooks or files were overwritten. No global plugin update or hook installation performed.

## Project adaptations

The initial bootstrap matched upstream bytes. PR review subsequently required
bounded local adaptations: `skills/using-a-team` accurately describes explicit
roster checks without an installed hook; `skills/using-git-worktrees` honors the
existing-checkout constraint; `skills/finishing-a-development-branch` uses the
repository's actual coverage command; and `skills/incident-response` routes
rollback through the reviewed release workflow. These files no longer claim
byte identity with upstream. The active orchestrator and meta-skill use the available `python3` command
and explicit Codex dispatch checks without claiming native hooks or commands.
All other copied profiles/compiler retain the
pinned source; no global plugin cache or host hooks were changed.

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
