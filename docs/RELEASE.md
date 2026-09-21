# Release Guide

All packages are built from reviewed GitHub source and published by
`.github/workflows/publish.yml`. Installations, including prereleases and rollback,
use exact versions from `https://registry.npmjs.org`; do not copy builds or install
Git URLs or local tarballs on Homebridge.

## Configure npm trusted publishing

Publication uses GitHub OIDC, not a stored npm publish token. In this package's
npm settings, add a GitHub Actions trusted publisher with these exact values:

| Setting | Value |
| --- | --- |
| Package | `@sealad886/homebridge-blink-cameras-new-api` |
| Organization or user | `sealad886` |
| Repository | `homebridge-blink-cameras-new-api` |
| Workflow filename | `publish.yml` |
| Environment | `npm-release` |
| Allowed action | Direct `npm publish` |

For an existing publisher without an environment, edit its environment in npm's
package Settings > Trusted publishing to `npm-release` before merging this
workflow change. If the existing relationship cannot be edited, replace it with
one using the values above before dispatching a release. Verify the saved
relationship in npm's package settings.

For a first publisher, an authenticated npm CLI **11.15.0 or newer** with
package write access and account 2FA can also configure it:

```sh
npm trust github @sealad886/homebridge-blink-cameras-new-api \
  --file publish.yml \
  --repo sealad886/homebridge-blink-cameras-new-api \
  --environment npm-release \
  --allow-publish
```

The `npm-release` GitHub environment allows deployments from `main` only.
The trusted publisher's environment must match it exactly. Configure the npm
publisher before merging a workflow change that names a new environment.

The publish job runs on a GitHub-hosted runner with Node 24, requires npm
**11.5.1 or newer**, and grants `id-token: write`. Release jobs and their test gates
do not restore package-manager caches. No `NPM_TOKEN` or `NODE_AUTH_TOKEN` is passed
to publishing; the script rejects token fallback. After trusted publication works,
remove obsolete publish-token secrets and revoke the old npm token. Never expose
credentials in release logs or PR comments.

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and
[the npm trust command](https://docs.npmjs.com/cli/v11/commands/npm-trust/).

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

The release gates run before a read-only job installs dependencies, builds,
verifies, and uploads the package. A separate `npm-release` job downloads the
artifact, checks its integrity, source SHA, package name, and requested version,
then obtains a short-lived publishing credential through OIDC. It
validates registry responses, serializes releases, publishes the verified package,
and records source SHA and registry integrity. Existing versions must match their original source;
a failed post-publish release-record step can be retried at that same revision.
After npm accepts an upload, registry processing can delay exact-version and dist-tag
visibility. The publish workflow polls for up to 10 minutes at 30-second intervals,
reports each pending retry, and fails closed on lookup, source-identity, integrity,
or tag mismatch. This is a bounded workflow wait, not an npm processing SLA. Do not
dispatch another release while that bounded wait is active.
A recovery run also requires the existing dist-tag to match. If it does not, stop
and arrange explicit authenticated tag maintenance; trusted publishing does not
authorize `npm dist-tag add`. Do not repair a partial release by publishing locally
or overwriting a Git tag. New GitHub releases are created as drafts, receive their
receipt asset, then publish. Recovery validates an immutable existing release's
tag, source revision, and prerelease state, leaves it unchanged, and preserves the
current receipt through the workflow artifact.

Prereleases use `alpha`, `beta`, or `rc`; stable uses `latest`. Verify exact registry
version, integrity, source identity, GitHub release, and dist-tags before installing.
A prerelease must leave the previous stable `latest` unchanged. Stable publication
must not move `latest` backwards.

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
Record evidence and timestamps in the GitHub release PR, with links to issues, CI, and releases.

## Rollback and cleanup

Stop promotion for lost authentication, leaked credentials, recurring refresh
failure, missing accessories, or material streaming regression. Reinstall the last
known-good exact registry version. Preserve rotated credentials: an older backup
may hold an invalid refresh token. Restore data only when its validity is established.
Do not uninstall the plugin or clear Homebridge persistence as routine rollback.

After stable acceptance, use the optional CI cleanup workflow to remove obsolete
prerelease dist-tags. OIDC publishing does not authorize this maintenance operation.
When cleanup is needed, provide a separate, short-lived granular npm token as the
GitHub Actions secret `NPM_MAINTENANCE_TOKEN`. Limit it to read/write access for this
package only, enable the 2FA bypass required for unattended maintenance, and use
the shortest practical expiry. The cleanup workflow performs neither publication nor unpublication;
it validates the accepted stable version before removing only `alpha`, `beta`, and
`rc` tags. Remove the secret and revoke the maintenance token after cleanup.
If the credential is absent, cleanup stops explicitly; release publication does
not depend on it. Never reuse the old publish token as an implicit fallback.

 Published versions remain available for reproducibility and rollback;
routine cleanup must never call npm unpublish. Keep unresolved issue links open and
separate code completion from deployed acceptance.

```sh
gh workflow run npm-prerelease-cleanup.yml --ref main \
  -f stable_version=VERSION -f dist_tags=alpha,beta,rc
```
