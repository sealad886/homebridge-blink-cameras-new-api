# Release Guide

This document describes how to prepare and publish a new npm release for this plugin.

In this repository, the canonical publish path is a version bump pushed to `main`. GitHub Actions in `.github/workflows/publish.yml` then decides whether a remote npm publish is needed, selects the correct dist-tag, and performs the publish from CI.

## Prerequisites

- Node.js 18+ and npm installed
- GitHub access to push the release commit to `main`
- Repository publish credentials configured for GitHub Actions (`NPM_TOKEN` today, or trusted publishing if the workflow is updated)
- Clean working tree with all changes committed

## Versioning

Use this order for a release candidate commit:

1. Update `CHANGELOG.md` and any other release notes.
2. Commit those release-note changes so the working tree is clean.
3. Run local validation with `npm run release`.
4. Use npm to bump the version and create a git tag:

```bash
npm version <patch|minor|major>
```

For prereleases, use the appropriate npm prerelease command such as `npm version preminor --preid=alpha` or `npm version prerelease --preid=beta`.

## Preflight (no publish)

Run the release script without publishing to validate lint, tests, build, and package contents:

```bash
npm run release
```

This is a local validation step only. It does not publish.

The release helper no longer supports a local publish mode. Any previous `npm run release -- --yes` workflow has been removed.

## Publish

After validation and version bumping, make sure the version bump commit is on `main` and then push the release commit and tag:

```bash
git push origin main --follow-tags
```

If you versioned on a release branch, merge or cherry-pick that commit onto `main` before pushing.

That push triggers `.github/workflows/publish.yml`, which:

- compares `package.json` against the currently published npm version
- skips publication if the version is already on npm
- detects `alpha`, `beta`, and `rc` prerelease identifiers and publishes with the matching npm dist-tag
- runs `npm run build` and `npm test` before publishing when a publish is required

## After Publishing

- Confirm the GitHub Actions publish workflow succeeded
- Verify the new version and dist-tags appear on the npm registry
- Check Homebridge loads the new version as expected
