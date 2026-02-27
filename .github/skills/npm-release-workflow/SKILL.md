---
name: npm-release-workflow
description: NPM semantic versioning, prerelease lifecycle, dist-tag management, and GitHub-based publishing workflows
---

# NPM Release Workflow Skill

## Purpose

Guide agents through the correct process for bumping versions, publishing prereleases (alpha/beta/rc), and promoting to stable — both locally and via CI. Prevent the most common npm publishing mistakes.

## Semantic Versioning Quick Reference

### Version Format

```
MAJOR.MINOR.PATCH-PRERELEASE.N
  │     │     │       │       └─ prerelease iteration (0, 1, 2, …)
  │     │     │       └─ prerelease identifier (alpha, beta, rc)
  │     │     └─ backwards-compatible bug fixes
  │     └─ backwards-compatible new features
  └─ breaking API changes
```

### Prerelease Stages

| Stage      | Purpose                              | Audience                   |
|------------|--------------------------------------|----------------------------|
| **alpha**  | Active development, API unstable     | Internal devs only         |
| **beta**   | Feature-complete, API stabilizing    | Trusted testers, early adopters |
| **rc**     | Production-ready candidate           | Broader community          |
| **stable** | Production release                   | Everyone                   |

### When To Use Each Bump

| Situation                        | Command                                        |
|----------------------------------|-------------------------------------------------|
| Bug fix, no API change           | `npm version patch`                             |
| New feature, backwards-compatible| `npm version minor`                             |
| Breaking API change              | `npm version major`                             |
| Enter prerelease for next minor  | `npm version preminor --preid=alpha`            |
| Enter prerelease for next major  | `npm version premajor --preid=alpha`            |
| Iterate within a prerelease      | `npm version prerelease --preid=alpha`          |
| Transition alpha → beta          | `npm version prerelease --preid=beta` or `npm version X.Y.Z-beta.0` |
| Promote prerelease to stable     | `npm version patch` (strips suffix, does NOT bump number) |

## Critical Rules (Non-Negotiable)

### Rule 1: NEVER publish a prerelease without `--tag`

```bash
# WRONG — overwrites `latest`, breaks all users who run `npm install`
npm publish

# CORRECT — publishes under a named dist-tag
npm publish --tag alpha
npm publish --tag beta
npm publish --tag rc
```

`npm publish` ALWAYS sets the `latest` dist-tag unless `--tag` is specified. This is the single most common npm publishing mistake.

### Rule 2: Always run quality gates before publishing

At minimum: lint, test, build. Never trust that tests were run locally.

```bash
npm run lint && npm test && npm run build
```

### Rule 3: Keep git tags in sync with package.json versions

`npm version` creates both a commit and a git tag by default. Do not suppress this unless you have an explicit reason. Always push tags:

```bash
git push --follow-tags
```

### Rule 4: Clean up dist-tags after promoting to stable

Stale prerelease tags confuse users. After a stable release:

```bash
npm dist-tag rm <package> alpha
npm dist-tag rm <package> beta
npm dist-tag rm <package> rc
```

## Version Progression Examples

### Full Prerelease Cycle

```bash
# Current: 0.5.2 (stable)

# 1. Enter alpha for next minor
npm version preminor --preid=alpha    # → 0.6.0-alpha.0
npm version prerelease --preid=alpha  # → 0.6.0-alpha.1
npm version prerelease --preid=alpha  # → 0.6.0-alpha.2

# 2. Promote to beta
npm version prerelease --preid=beta   # → 0.6.0-beta.0
# -- OR set explicitly: npm version 0.6.0-beta.0
npm version prerelease --preid=beta   # → 0.6.0-beta.1

# 3. Promote to rc
npm version prerelease --preid=rc     # → 0.6.0-rc.0
npm version prerelease --preid=rc     # → 0.6.0-rc.1

# 4. Promote to stable
npm version minor                     # → 0.6.0  (strips suffix)
```

### Hotfix While in Prerelease

If you need to patch the current stable while a prerelease is in flight, check out the stable branch, bump patch, and publish with `--tag latest` explicitly — or better, use a dedicated release branch.

### The `prerelease` vs `prepatch` Distinction

- **`prerelease`**: If already in a prerelease, increments ONLY the prerelease number (`1.2.0-alpha.0` → `1.2.0-alpha.1`). This is the command for iterating.
- **`prepatch`**: Always bumps the patch version AND starts a new prerelease (`1.2.0-alpha.2` → `1.2.1-alpha.0`). This is for entering a new prerelease cycle.

### Finalizing a Prerelease

When the current version is a prerelease, `npm version patch` strips the suffix **without incrementing**:

```bash
# Current: 1.2.0-rc.5
npm version patch   # → 1.2.0  (NOT 1.2.1)
```

This is correct because `1.2.0-rc.5` is semver-less-than `1.2.0`.

## Dist-Tag Management

### Standard Tags

| Tag      | Meaning                         | Consumer command               |
|----------|---------------------------------|--------------------------------|
| `latest` | Current stable (default)         | `npm install <pkg>`            |
| `alpha`  | Alpha prerelease                 | `npm install <pkg>@alpha`      |
| `beta`   | Beta prerelease                  | `npm install <pkg>@beta`       |
| `rc`     | Release candidate                | `npm install <pkg>@rc`         |
| `next`   | Catch-all for any prerelease     | `npm install <pkg>@next`       |

`latest` is the ONLY tag with semantic meaning to npm — `npm install <pkg>` resolves to it. All other tags are conventions.

### Inspecting Tags

```bash
npm dist-tag ls <package>
npm view <package> dist-tags
```

### Recovering from a Bad Publish

If a prerelease accidentally became `latest`:

```bash
# Point latest back to the last known-good stable version
npm dist-tag add <package>@<stable-version> latest
```

## Local Release Workflow

### Preflight Checklist (Agent Must Verify)

1. Working tree is clean (`git status --porcelain` returns empty)
2. All tests pass (`npm test`)
3. Lint passes (`npm run lint`)
4. Build succeeds (`npm run build`)
5. CHANGELOG.md is updated with the new version entry
6. You are on the correct branch (typically `main`)

### Step-by-Step: Prerelease

```bash
# 1. Verify preflight
git status --porcelain  # must be empty
npm run lint && npm test && npm run build

# 2. Update CHANGELOG.md
# Add entry under new version heading

# 3. Commit changelog
git add CHANGELOG.md
git commit -m "docs(changelog): update for X.Y.Z-stage.N"

# 4. Bump version (creates commit + tag)
npm version prerelease --preid=alpha -m "chore(release): %s"

# 5. Push commit and tag
git push --follow-tags

# CI publishes automatically with correct --tag
```

### Step-by-Step: Stable Release

```bash
# 1. Verify preflight
git status --porcelain
npm run lint && npm test && npm run build

# 2. Update CHANGELOG.md
git add CHANGELOG.md
git commit -m "docs(changelog): update for X.Y.Z"

# 3. Bump version
npm version <patch|minor|major> -m "chore(release): %s"

# 4. Push
git push --follow-tags

# CI publishes with --tag latest

# 5. Clean up stale dist-tags
npm dist-tag rm <package> alpha 2>/dev/null
npm dist-tag rm <package> beta 2>/dev/null
npm dist-tag rm <package> rc 2>/dev/null
```

## CI Publishing Workflow (GitHub Actions)

### Recommended: Version-Check Pattern

This repo uses a push-to-main trigger that compares `package.json` version against the npm registry. It auto-detects prerelease versions and sets the correct dist-tag.

Key CI logic for dist-tag detection:

```bash
VERSION=$(node -p "require('./package.json').version")
if echo "$VERSION" | grep -qE '-(alpha|beta|rc)\.'; then
  TAG=$(echo "$VERSION" | sed -E 's/.*-(alpha|beta|rc)\..*/\1/')
else
  TAG="latest"
fi
npm publish --access public --tag "$TAG"
```

### Alternative: Tag-Triggered Pattern

For repos that prefer explicit control, trigger CI on git tag push:

```yaml
on:
  push:
    tags:
      - 'v*'
```

CI should then verify that the git tag matches `package.json` version:

```bash
GIT_TAG=${GITHUB_REF#refs/tags/v}
PKG_VERSION=$(node -p "require('./package.json').version")
if [ "$GIT_TAG" != "$PKG_VERSION" ]; then
  echo "::error::Tag $GIT_TAG doesn't match package.json $PKG_VERSION"
  exit 1
fi
```

### Trusted Publishing (OIDC — Recommended for New Setups)

npm supports tokenless publishing via OIDC as of npm CLI ≥ 11.5.1 / Node ≥ 22.14.0:

1. Configure on npmjs.com → Package Settings → Trusted Publisher → GitHub Actions
2. Add `permissions: { id-token: write }` to the workflow
3. Remove `NPM_TOKEN` secret — not needed with OIDC
4. Provenance attestation is automatic

If using traditional `NPM_TOKEN`:
- Store in GitHub repository secrets
- Use automation tokens (bypass 2FA)
- Rotate periodically
- Never commit to source

## Post-Publish Verification (Agent Must Perform)

```bash
# 1. Check the version appeared
npm view <package> dist-tags

# 2. Verify correct tag assignment
# latest should point to stable, prerelease tags to their versions

# 3. Check all published versions
npm view <package> versions --json
```

## Using the Existing Release Script

This repo has `scripts/release.mjs` which:
1. Ensures clean working tree
2. Runs lint → test → clean → build → pack
3. Without `--yes`: dry run only (validation)
4. With `--yes`: publishes to npm and pushes tags

```bash
# Dry run (validates everything)
npm run release

# Publish for real
npm run release -- --yes
```

**Note:** The release script does NOT handle versioning — you must `npm version` first. The script handles the quality-gate + publish sequence.

## Decision Tree for Agents

```
Is this a prerelease?
├─ YES → Which stage?
│   ├─ First prerelease of a new version
│   │   └─ npm version pre{major|minor|patch} --preid={alpha|beta|rc}
│   ├─ Iterating within same stage
│   │   └─ npm version prerelease --preid={alpha|beta|rc}
│   └─ Transitioning stages (e.g. alpha → beta)
│       └─ npm version prerelease --preid={new-stage}
│           OR npm version X.Y.Z-{new-stage}.0
│
└─ NO → Stable release
    ├─ Currently on a prerelease version?
    │   ├─ YES → npm version patch (strips suffix)
    │   └─ NO → npm version {patch|minor|major}
    └─ After publish: clean up stale dist-tags
```

## Common Mistakes This Skill Prevents

| Mistake | Prevention |
|---------|------------|
| Prerelease published as `latest` | CI auto-detects preid and uses `--tag` |
| Tests not run before publish | Release script enforces lint → test → build |
| Git tag missing | `npm version` creates tags by default |
| Tag/version mismatch | CI verifies consistency |
| Stale dist-tags after stable release | Checklist includes dist-tag cleanup |
| CHANGELOG not updated | Preflight checklist requires it |
| Dirty working tree at release | Release script checks `git status --porcelain` |
| Publishing from wrong branch | Preflight checklist includes branch verification |

## Lifecycle Script Hooks (Optional Enhancement)

For repos that want automated pre-publish validation in `package.json`:

```json
{
  "scripts": {
    "preversion": "npm run lint && npm test",
    "version": "npm run build && git add -A dist",
    "postversion": "git push --follow-tags"
  }
}
```

This makes `npm version` automatically: run tests → build → commit → tag → push.

## References

- [npm-version CLI](https://docs.npmjs.com/cli/v11/commands/npm-version) — Canonical version bumping docs
- [npm-dist-tag CLI](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag) — Dist-tag management
- [npm-publish CLI](https://docs.npmjs.com/cli/v11/commands/npm-publish) — Publishing docs
- [npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers) — OIDC setup
- [npm Provenance](https://docs.npmjs.com/generating-provenance-statements) — Build attestation
- [semver.org](https://semver.org/) — The Semantic Versioning specification
