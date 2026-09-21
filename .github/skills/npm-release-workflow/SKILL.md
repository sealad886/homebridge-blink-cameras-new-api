---
name: npm-release-workflow
description: Prepare and verify this plugin's reviewed, manually dispatched npm releases
---

# npm release workflow

Use [the release guide](../../../docs/RELEASE.md) as the canonical procedure.
This skill is a short operational reminder; if it conflicts with the release
guide or workflow, inspect those sources and fix the conflict before publishing.

1. Select the next SemVer version in the current alpha, beta, RC, or stable
   progression. Never reuse a published version for different source.
2. Update `package.json`, `package-lock.json`, and `CHANGELOG.md` in a focused
   PR. Use `npm version VERSION --no-git-tag-version`; do not create a local tag.
3. Run `npm run release` in a clean checkout, then resolve PR review and CI.
   Merge the reviewed version bump to `main`.
4. Confirm the npm trusted publisher matches `publish.yml` and its GitHub
   environment. Explicitly dispatch `publish.yml` on `main` with
   `version=VERSION`. A source push alone does not publish.
5. The workflow tests, builds, verifies, and uploads one package artifact in
   a read-only job. The privileged job verifies that artifact's integrity and
   source before publishing the exact tarball through npm OIDC.
6. Verify registry version, integrity, source SHA, expected dist-tag, Git tag,
   GitHub release, and receipt. An alpha/beta/RC release must leave stable
   `latest` unchanged.
7. If npm publication succeeds but tag or GitHub release recording fails,
   rerun the same workflow at the same `main` revision and version. The release
   script checks the immutable registry identity before reconciling records.
   Stop if the source or dist-tag differs; do not republish locally or move a
   conflicting tag.
8. Install only the exact registry version through Homebridge management and
   perform the stage-specific runtime acceptance in the release guide.

Prerelease dist-tag cleanup is a separate, optional manual workflow after
stable acceptance. It uses a short-lived package-scoped maintenance token;
trusted publishing does not authorize dist-tag maintenance. Never use local
`npm publish` or `npm unpublish` as a routine release or recovery step.
