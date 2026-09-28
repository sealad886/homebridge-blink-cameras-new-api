# Agent Instructions

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

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
