# Release Guide

All packages are built from reviewed GitHub source and published by
`.github/workflows/publish.yml`. Installations, including prereleases and rollback,
use exact versions from `https://registry.npmjs.org`; do not copy builds or install
Git URLs or local tarballs on Homebridge.

## Prepare a version

Use a minor bump for new compatible capabilities, a patch for compatible fixes.
The supported progression is `X.Y.Z-alpha.0`, `X.Y.Z-beta.0`, `X.Y.Z-rc.0`, then
`X.Y.Z`. Increment the prerelease number after changes within a stage. Freeze the
version target before alpha. Never reuse a published version for different code.

Update `CHANGELOG.md` with a `## [VERSION] - YYYY-MM-DD` section describing user
behavior, security fixes, upgrade notes, and known limitations. Keep package.json
and package-lock.json versions identical. Commit version changes using Conventional
Commits; the publishing workflow creates the Git tag at the validated source SHA.
This intentionally avoids a local npm-version tag pointing to a pre-merge SHA.

Use `npm version VERSION --no-git-tag-version`, inspect and commit the changes,
then merge the reviewed PR to main. Resolve current-head reviews and CI before
merging. Do not include unrelated editor files, credentials, or build artifacts.

## Gates and publication

Local preflight is `npm run release`: it checks a clean checkout, lint, tests,
build, and package contents. Use a dedicated clean clone when the working checkout
contains unrelated user files; never stash or delete those files to satisfy it.

Publication requires an explicit dispatch on main with the exact version input.
An ordinary source push does not publish. The workflow validates the requested
version against the manifest and runs clean-install, lint, tests, build, and
package loadability checks on Node.js 20, 22, and 24 before publication.

```sh
gh workflow run publish.yml --ref main -f version=VERSION
```

The CI workflow alone uses the repository's npm credential. It validates registry
responses, serializes releases, publishes the tested package, and records source
SHA and registry integrity. Existing versions must match their original source;
a failed post-publish release-record step can be retried at that same revision.
Do not repair a partial release by publishing locally or overwriting a Git tag.

Prereleases use `alpha`, `beta`, or `rc`; stable uses `latest`. Verify exact registry
version, integrity, source identity, GitHub release, and dist-tags before installing.
A prerelease must leave the previous stable `latest` unchanged.

## Homebridge upgrade and acceptance

Before alpha, make an owner-only backup of config, auth state, and accessory
persistence on the Homebridge host. Verify the backup without printing credentials.
Record installed package versions and child-bridge identity. Preserve any other
installed Blink plugin until ownership is understood.

Install the exact registry version using Homebridge package management
(`hb-service add @sealad886/homebridge-blink-cameras-new-api@VERSION`). Prefer a
Blink child-bridge restart through Homebridge UI; record any full-service restart.
Verify the running package version, authentication, discovery, and accessory set.

Alpha requires snapshots, bounded live streams, normal/debug log inspection, and
repeated child-bridge restarts. Beta additionally requires private hosted sign-in,
logout/relogin, offline/recovery acceptance, at least 24 hours and one natural
refresh. RC requires a feature freeze, current automated/review gates, physical
critical paths, at least 48 hours and two natural refreshes. A runtime fix restarts
the RC observation window. Keep corruption and hostile-token tests isolated.

Stable must match the accepted RC runtime source except version and release notes.
Publish and install it through the same CI/registry route. Repeat smoke acceptance
and observe at least 24 hours including one natural refresh before completion.
Record evidence and timestamps in Beads, with links to PRs, CI, and releases.

## Rollback and cleanup

Stop promotion for lost authentication, leaked credentials, recurring refresh
failure, missing accessories, or material streaming regression. Reinstall the last
known-good exact registry version. Preserve rotated credentials: an older backup
may hold an invalid refresh token. Restore data only when its validity is established.
Do not uninstall the plugin or clear Homebridge persistence as routine rollback.

After stable acceptance, use the CI cleanup workflow to remove obsolete prerelease
dist-tags. Published versions remain available for reproducibility and rollback;
routine cleanup must never call npm unpublish. Keep unresolved issue links open and
separate code completion from deployed acceptance.

```sh
gh workflow run npm-prerelease-cleanup.yml --ref main \
  -f stable_version=VERSION -f dist_tags=alpha,beta,rc
```
