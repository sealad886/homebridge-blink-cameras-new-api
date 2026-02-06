# Contributing to @sealad886/homebridge-blink-cameras-new-api

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- **Node.js 18+** (uses native `fetch` API)
- **npm** or **yarn**
- A Blink account for testing (optional for unit tests)

### Clone and Install

```bash
git clone https://github.com/sealad886/homebridge-blink-cameras-new-api.git
cd homebridge-blink-cameras-new-api
npm install
```

### Build

```bash
npm run build
```

This compiles TypeScript to the `dist/` directory.

### Watch Mode (build)

For development, you can use either:

```bash
# Rebuild + run Homebridge against test/hbConfig
npm run watch

# TypeScript-only rebuilds
npm run watch:ts
```

## Running Tests

### All Tests

```bash
npm test
```

### Watch Mode

```bash
npm test -- --watch
```

### Coverage Report

```bash
npm run test -- --coverage
```

Coverage reports are generated in `coverage/`.

## Testing in a Real Homebridge Deployment

Homebridge developer guidance recommends linking your plugin into a local
Homebridge install and running Homebridge in debug mode.

### Link the Plugin into Homebridge

Build the plugin, then link it so your global Homebridge install can discover
the development version:

```bash
npm run build
npm link
```

### Configure Homebridge

Add the plugin to your Homebridge config (or use Homebridge UI X). This repo
publishes `config.schema.json`, so the Settings UI will appear in Homebridge UI X
when the plugin is detected. For local dev, the repo also includes
`test/hbConfig/config.json` for `npm run watch`.

### Run Homebridge in Debug Mode

Start Homebridge with debug logging so you can see plugin logs:

```bash
homebridge -D
```

If Homebridge is already running, stop it before starting a debug instance to
avoid conflicts.

### Iterate on Changes

Run TypeScript in watch mode in one terminal, and restart Homebridge when you
need to load new changes:

```bash
npm run watch
```

## Code Style

### ESLint

The project uses ESLint for code style. Run the linter:

```bash
npm run lint
```

### TypeScript

- Strict mode is enabled
- All public methods should have JSDoc comments
- Use `ReturnType<typeof setTimeout>` for timer types (not `NodeJS.Timeout`)
- Import timers from `'timers'` module for explicit Node.js timer types

### Formatting

- 2-space indentation
- Single quotes for strings
- Trailing commas in multi-line lists
- No semicolons (enforced by ESLint)

## Pull Request Process

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation only
- `refactor/description` - Code refactoring

### Commit Messages

Use conventional commit format:

```text
type(scope): description

[optional body]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Commit messages are enforced in CI using commitlint. You can check locally with:

```bash
npm run lint:commits
```

Examples:

- `feat(doorbell): add ring notification support`
- `fix(auth): handle token refresh race condition`
- `docs(readme): update configuration examples`

### Before Submitting

1. **Run tests**: `npm test` - all tests must pass
2. **Run linter**: `npm run lint` - no errors allowed
3. **Build**: `npm run build` - must compile without errors
4. **Update docs**: If adding features, update README.md

### Review Checklist

- [ ] Tests added/updated for new code
- [ ] JSDoc comments for public methods
- [ ] README updated if needed
- [ ] No breaking changes (or documented in PR)
- [ ] Code follows existing patterns

## Release Process

Releases are automated with release-please:

1. Merge changes to `main` using Conventional Commits.
2. release-please opens a release PR with version bump + changelog.
3. Merge the release PR to publish to npm automatically.

Release details and expectations live in `docs/RELEASE.md`.

## Project Structure

```text
src/
├── index.ts           # Plugin entry point
├── platform.ts        # Main platform class
├── accessories/       # HomeKit accessory handlers
│   ├── camera.ts
│   ├── doorbell.ts
│   ├── network.ts
│   └── owl.ts
├── blink-api/         # Blink REST API client
│   ├── auth.ts        # OAuth authentication
│   ├── client.ts      # High-level API methods
│   ├── http.ts        # HTTP layer with retry
│   └── urls.ts        # URL configuration
└── types/             # TypeScript type definitions

__tests__/             # Jest test files
```

## Questions?

Open an issue on GitHub or check the existing issues for similar questions.
