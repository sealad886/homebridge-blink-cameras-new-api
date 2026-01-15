# Contributing to homebridge-blinkcameras

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- **Node.js 18+** (uses native `fetch` API)
- **npm** or **yarn**
- A Blink account for testing (optional for unit tests)

### Clone and Install

```bash
git clone https://github.com/homebridge-plugins/homebridge-blinkcameras.git
cd homebridge-blinkcameras
npm install
```

### Build

```bash
npm run build
```

This compiles TypeScript to the `dist/` directory.

### Watch Mode

For development, use watch mode to rebuild on changes:

```bash
npm run watch
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

Release instructions live in `docs/RELEASE.md`.

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
