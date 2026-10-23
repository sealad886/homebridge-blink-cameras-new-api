# Contributing

Last reviewed: 23 October 2026.

This guide owns contributor setup, local checks, and the pull-request workflow.
For installation and operation, start with the [README](README.md). See the
[documentation map](docs/README.md) for the other information owners.

## Development setup

Use Node.js **20, 22, or 24**, matching `package.json` and the CI matrix, and npm.
A Blink account is unnecessary for unit tests; real-provider and Home testing
require a separately configured test environment.

```bash
git clone https://github.com/sealad886/homebridge-blink-cameras-new-api.git
cd homebridge-blink-cameras-new-api
npm ci
npm run build
```

`npm run build` compiles TypeScript into `dist/` and copies custom UI assets.
Do not edit generated `dist/` files. The packaging invariants are documented in
[repository conventions](docs/CONVENTIONS.md#custom-ui-packaging).

For TypeScript rebuilds without launching Homebridge:

```bash
npm run watch:ts
```

For integration development, `npm run watch` builds the plugin, starts Homebridge
with `test/hbConfig`, and restarts it on watched changes. This connects to any
account configured there and advertises accessories, so use an intentional test
instance. It is not the workflow for modifying a live installation. Keep account
credentials, tokens, and local Homebridge state out of commits. Follow the
[operator sign-in instructions](README.md#sign-in-and-account-verification) and
[diagnostic logging policy](docs/debug_logging_spec.md).

## Validation

Run these checks for source changes:

```bash
npm run lint
npm run build
npm test -- --runInBand
npm run blink-api:validate
```

Run focused tests while iterating, then the broader checks appropriate to the
change. Jest also supports `npm test -- --watch` and
`npm test -- --coverage`; coverage output is written to `coverage/`.

Tests should prove observable behavior, contracts, security boundaries, or a
regression rather than mirror private implementation details. Documentation-only
changes normally need link/example checks, not new unit tests. Review the actual
CI results before merging; local success does not establish package publication,
installed runtime identity, live-provider behavior, or physical Home acceptance.
The additional release and packaged-artifact gates belong to the
[release guide](docs/RELEASE.md).

## Code and architecture

TypeScript strict mode is enabled in `tsconfig.json`. Follow surrounding code and
`eslint.config.js`; existing source uses semicolons, single-quoted strings, and
two-space indentation. ESLint is the executable lint policy, not a promise that
all formatting preferences are enforced. Document non-obvious public contracts
and keep timers and cancellation aligned with their existing owners.

Before adding another coordinator, authentication path, transport, or helper,
look for its existing owner. The [architecture decisions](docs/adr/README.md)
record authentication, command recovery, session ownership, media authority, and
quality decisions. [Repository conventions](docs/CONVENTIONS.md) record the
packaging and UI identity rules that contributors must preserve. Current
security findings and release dispositions belong to the
[security-hardening ledger](docs/plans/security-hardening.md), not a second
checklist in this guide.

The main source areas are `src/platform.ts` (platform integration),
`src/accessories/` (HomeKit handlers and media lifecycle), `src/blink-api/`
(provider and authentication operations), and `src/homebridge-ui/` (settings and
sign-in UI). Behavioral tests live in `__tests__/`; API-contract extraction and
validation are described in the [contract guide](docs/api-contract/README.md).

## Issues and pull requests

Search [existing issues](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues)
before opening a new report. Include reproduction steps, expected and observed
behavior, affected version, and sanitized diagnostics. Never include tokens,
capability URLs, account identifiers, private camera/network names, host addresses, or media. Use generic example names and paths in documentation; keep deployment-specific evidence outside published guides.

Follow [AGENTS.md](AGENTS.md) when using an automated contributor. Preserve
unrelated working-tree changes. For substantive automated work, use a safe
`codex/<short-task-slug>` branch in the existing checkout. Obtain explicit human
authorization before creating a worktree or rewriting history. Human contributors
should use a focused, descriptive task branch.

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), for
example `fix(auth): handle token refresh cancellation`. Keep each PR focused and
use the [shared PR template](https://github.com/sealad886/.github/blob/main/.github/pull_request_template.md). Include the problem, resulting behavior,
verification results and their limitations, and any linked issue. Update the
canonical documentation owner for changed behavior and link to it elsewhere.
Close an issue only when its acceptance criteria are verified; use closing
keywords in the default-branch PR that delivers that resolution.

Version changes, release review, publication, and installation follow
[docs/RELEASE.md](docs/RELEASE.md). A development build or merged PR does not by
itself authorize publication or changes to a live Homebridge host.
