# Release Guide

This document describes how to prepare and publish a new npm release for this plugin.

## Prerequisites

- Node.js 18+ and npm installed
- npm account with publish access to the package
- Clean working tree with all changes committed

## Versioning

Use npm to bump the version and create a git tag:

```bash
npm version <patch|minor|major>
```

If you maintain a changelog, update it before tagging.

## Preflight (no publish)

Run the release script without publishing to validate lint, tests, build, and package contents:

```bash
npm run release
```

## Publish (requires --yes)

Publish to npm and push tags only when you are ready:

```bash
npm run release -- --yes
```

This publishes the package and pushes commits and tags to the remote.

## After Publishing

- Verify the new version appears on the npm registry
- Check Homebridge loads the new version as expected
