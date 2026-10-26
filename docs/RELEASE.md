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

Validate the proposed squash commit title and body with `npx --no-install commitlint`
before merging. PR checks validate the source commits; the push check validates
the resulting squash commit. Wrap body prose to 100 characters or fewer.

## Gates and publication

Local preflight is `npm run release`: it checks a clean checkout, lint, tests,
build, and package contents. Full native package verification requires all five
verified workers and corresponding sources staged by the canonical package job;
an ordinary source checkout cannot substitute JavaScript-only smoke for it. Use a dedicated clean clone when the working checkout
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

## Native artifact preparation and qualification

The secure media release pipeline is `gates → package → qualify (five targets) → publish`.
The version remains blocked until the matching reviewed source and all required
automated, security, performance and operator gates have supporting evidence.
Adding these jobs does not supply a pass or authorize workflow dispatch.

The reusable source gates build Linux x64/arm64, macOS arm64/x64 and Windows x64
candidates. Each `native-candidate-TARGET-SHA` artifact contains one worker and its
receipt. A separate `native-validation-TARGET-SHA` artifact contains the synthetic
fixture generator, independent SRTP receiver and a receipt binding their hashes
to the same source SHA and worker hash. The helper binaries are validation tools;
they are excluded from the product tarball. Their dependency audit must pass before
the source job uploads them.

The read-only package job downloads all five candidates from the same workflow
run. `native/dependencies/package.py` rejects incomplete or mismatched inputs and
uses the exact committed native source, build scripts, tests, full license notices
and four authenticated pinned dependency archives. It stages
`native/runtime/TARGET/worker[.exe]`, the closed five-target manifest and distribution
receipt, `native/corresponding-source.tar.gz`, `native/COPYING` and `native/NOTICE`
before npm packing. Existing output roots are refused. Source download verification
includes the pinned FFmpeg GPG fingerprint; a URL-only source offer is insufficient.

`.github/scripts/verify-package.mjs` checks the final package's complete native
inventory, every worker hash, manifest and distribution hashes, recipe/pinned-input
identity, corresponding-source member inventory and content hashes against the
exact Git commit. It verifies the bundled archives and licenses, stamps `gitHead`
and records the final immutable npm integrity. Ordinary JavaScript matrix smoke
may explicitly set `VERIFY_PACKAGE_JAVASCRIPT_ONLY=1` before native artifacts exist;
this mode refuses release output and supplies no native acceptance evidence.

Native candidate jobs also retain separate worker-hash-bound resource receipts:
per-worker OS memory observations, native consumption high water, and actual
recorder byte/queue bounds. Missing observations fail their job. These receipts
are evidence for bounded synthetic workloads, not universal memory budgets.

Five separate clean-host jobs download that same npm tarball and their matching
validation artifact. They install the exact tarball into a fresh temporary npm
prefix with lifecycle scripts disabled, without a source dependency installation,
native build, compiler setup, MSYS2 setup or private dependency prefix. They verify
the installed native inventory and resolve the installed worker using the shipped
resolver. The installed media-session implementation launches that worker and
exercises Opus at 16/24 kHz, PCMA and PCMU against both short and bundled LATM
fixtures. The independent receiver must authenticate/decrypt SRTP/SRTCP, decode
video pixels and nonzero audio energy, verify shared timing/counters and refuse forged
SRTP. Protected output is captured through an isolated owned output; this proof
does not substitute for the separate actual UDP, performance, security or physical
camera/HomeKit gates.

Qualification runner baselines are Ubuntu 22.04 (x64/arm64), macOS 15 (arm64/x64)
and Windows Server 2022 (x64). A pass establishes only its observed runner/runtime
baseline. A macOS deployment target of 13 does not prove macOS 13 acceptance;
Windows Server 2022 does not establish Windows 10 acceptance. Hosted qualification
is pending until a run for the exact final source and npm integrity succeeds.

The privileged main-only OIDC job requires all five jobs and independently checks
their receipts against the exact publication tarball, source SHA, source-bundle
hash and target worker hashes before publishing. It neither rebuilds nor repacks
the qualified tarball. Candidate/distribution build receipts retain
`distribution_ready: false`; separate qualification receipts record the observed
target results without changing the immutable product bytes. Those results do
not close F05/F06 or record physical acceptance. Preserve the beta hold until the
remaining release gates are verified. Registry publication and subsequent
authorized Homebridge installation/physical acceptance remain distinct stages.

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
critical paths and two successful natural token refreshes on the accepted runtime.
There is no fixed RC soak period. Observe for long enough to exercise the changed
behavior, normal refresh/recovery, and relevant failure boundaries; record the
actual interval and results rather than treating elapsed time as a pass.
A runtime correction requires targeted regression and physical checks of the
affected behavior. Reuse earlier evidence only for demonstrably unchanged paths;
identify its source, configuration and limitations. Keep corruption and
hostile-token tests isolated.

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

## 0.10.0 security and observation disposition

The [18 October stable-release disposition](plans/security-hardening.md#18-october-2026-delegated-stable-release-residual-risk-disposition)
accepts F05/F06 as disclosed residual risks specifically for stable 0.10.0.
Both findings remain open. Their closure and native-worker acceptance criteria
are unchanged; the retained runtime guards are mandatory. Do not request the
same risk decision again unless the exposure or release scope changes.

Current functional acceptance is recorded in the
[hardening ledger](plans/security-hardening.md#23-october-2026-rc19-acceptance-and-stable-readiness).
Release acceptance follows the evidence requirements above; a new RC number,
label or documentation change does not create a waiting period. Hardware failures
and other external causes require an explicit operator disposition. Preserve the
observed failure and the basis for that disposition without reporting a software
fix that was not made.
