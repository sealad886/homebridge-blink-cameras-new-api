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
Numeric prereleases may also use a compact identifier, such as `1.0.0-beta1`;
the `alpha`, `beta` or `rc` channel still determines the npm dist-tag. The first
HSV beta uses `1.0.0-beta1` at the maintainer's explicit request.

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

Before migrating saved configuration, close all settings and JSON Config editors
and stop other configuration writers until conversion completes. The final check
and atomic replacement do not lock Homebridge's
settings service against concurrent saves.

The 2.0.0 preparation removes the automatic npm install hook. Installation does
not migrate configuration, including when `UIX_STORAGE_PATH` is present. For
legacy settings, follow the explicit preview/`--apply` procedure in the
[migration guide](native-recording-config-migration.md) before restart; Windows
uses its manual mapping. Already-canonical 1.1.0 settings need no conversion for
unbundling. The unpublished 2.0.0-alpha.1 preparation also retires `debugStreamPath`
and removes optional raw diagnostic file capture. Any saved key, even blank,
requires the same explicit conversion before restart (manual removal on Windows).
Runtime and migration leave all existing captures untouched; live streaming,
HomeKit recording and redacted `mediaDebug` logs remain. Install and identify
external FFmpeg before qualifying or upgrading.

Local preflight is `npm run release`: it checks a clean checkout, lint, tests,
build, and package contents. Jest runs serially, matching CI and the contributor
validation workflow while preserving every assertion and deadline.
Full native package verification requires all five
verified protection/launch helpers and corresponding sources staged by the canonical package job;
an ordinary source checkout cannot substitute JavaScript-only smoke for it. Use a dedicated clean clone when the working checkout
contains unrelated user files; never stash or delete those files to satisfy it.

Publication requires an explicit dispatch on main with the exact version input.
An ordinary source push does not publish. The workflow validates the requested
version against the manifest and runs clean-install, lint, tests, build, and
package loadability checks on Node.js 20, 22, 24, and 26 before publication.

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
Before invoking npm, the publisher stores an annotated upload-attempt record under
`refs/npm-upload-attempts/vVERSION`. It binds the exact package version, source SHA,
qualified integrity, original stable `latest`, and workflow run. A rerun or a fresh
dispatch that finds this record only reads the registry and reconciles matching
release records. The npm upload itself runs with transport retries disabled. The
normal `refs/tags/vVERSION` release tag still requires successful registry verification.

Registry processing can delay exact-version and dist-tag visibility after an
accepted upload. The workflow allows 40 polling intervals of 30 seconds, covering
20 minutes of registry processing plus lookup time. It logs upload acceptance,
pending visibility, and verified identity separately. Transport and identity errors
stop immediately. If visibility is pending or the upload outcome is unclear, rerun
only the failed `publish` job in the original workflow run. Re-running all jobs
can replace the package artifact. Preserve the original qualified tarball and five
target receipts before their seven-day expiry. The publish retry performs registry
readback and record reconciliation, even if the first registry lookup shows no
version. Upload outcome and release receipts are preserved in each attempt's
workflow artifact when available.

If the attempt record exists and no registry version appears, keep the record
while the upload outcome is uncertain. A maintainer may separately authorize
removing the attempt ref only after confirming that npm was never invoked. Preserve
the workflow evidence and arrange a fresh authorized dispatch after that removal.
If the prior run stopped before creating the attempt record or invoking npm, start
a fresh authorized dispatch once the failure is resolved.

The expected dist-tag must also match before the publisher records the release.
If it remains incorrect after registry propagation, stop and arrange explicit
authenticated tag maintenance. Trusted publishing does not authorize `npm dist-tag add`.
New GitHub releases are created as drafts, receive their
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
protection/launch helpers, without FFmpeg linkage. Each
`native-candidate-TARGET-SHA` artifact contains one helper and its receipt. A
separate `native-validation-TARGET-SHA` artifact contains the independent libSRTP
receiver and a receipt binding its hash to the same source/helper identity.
Validation tools are excluded from the product tarball. Fixture generation and
codec validation use an explicitly installed external FFmpeg executable.

The read-only package job downloads all five candidates from the same workflow
run. `native/dependencies/package.py` rejects incomplete or mismatched inputs and
uses the exact committed native source, build scripts, tests, full license notices
and the authenticated pinned libSRTP source archive. It stages
`native/runtime/TARGET/worker[.exe]`, the closed five-target manifest and distribution
receipt, `native/corresponding-source.tar.gz`, `native/COPYING` and `native/NOTICE`
before npm packing. Existing output roots are refused. FFmpeg, x264 and Opus
libraries, executables and source archives are excluded; helper/libSRTP source
and license obligations remain. Protocol version 1 now describes the smaller
protection-only IPC, not the former codec worker's protocol 5.

`.github/scripts/verify-package.mjs` checks the final package's complete native
inventory, every worker hash, manifest and distribution hashes, recipe/pinned-input
identity, corresponding-source member inventory and content hashes against the
exact Git commit. It verifies the bundled archives and licenses, stamps `gitHead`
and records the final immutable npm integrity. Ordinary JavaScript matrix smoke
may explicitly set `VERIFY_PACKAGE_JAVASCRIPT_ONLY=1` before native artifacts exist;
this mode refuses release output and supplies no native acceptance evidence.

Resource checks retain recorder byte/queue bounds, external codec pipe pressure,
cancellation and actual process closure. Old codec-worker consumption-credit
receipts do not describe the external backend. Synthetic bounds are not universal
FFmpeg memory budgets; report the executable/build and workload actually tested.

Five separate clean-host jobs download that same npm tarball and their matching
validation artifact. They install the exact tarball into a fresh temporary npm
prefix with lifecycle scripts disabled, without a source dependency installation,
native build, compiler setup, MSYS2 setup or private dependency prefix. Install
and identify the external FFmpeg dependency separately. They verify the installed
helper inventory and resolve it using the shipped resolver. The installed
media-session implementation launches external FFmpeg through that helper and
exercises Opus at 16/24 kHz, PCMA and PCMU against both short and bundled LATM
fixtures. The independent receiver must authenticate/decrypt SRTP/SRTCP, decode
video pixels and nonzero audio energy, verify shared timing and refuse forged
SRTP. Protected output is captured through an isolated owned output; this proof
does not substitute for the separate actual UDP, performance, security or physical
camera/HomeKit gates.

Qualification runner baselines are Ubuntu 24.04 (x64/arm64), macOS 15 (arm64/x64)
and Windows Server 2022 (x64). A pass establishes only its observed runner/runtime
baseline. A macOS deployment target of 13 does not prove macOS 13 acceptance;
Windows Server 2022 does not establish Windows 10 acceptance. Every release needs
a successful run for its exact final source and npm integrity. The
[26 October beta checkpoint](plans/security-hardening.md#26-october-2026-secure-media-beta-publication)
records the observed five-host qualification for `0.11.0-beta.0`.

That historical codec qualification does not qualify the external backend.
Every changed helper/package and the external tool combination needs fresh
qualification, followed by the normal physical Home acceptance below.

The privileged main-only OIDC job requires all five jobs and independently checks
their receipts against the exact publication tarball, source SHA, source-bundle
hash and target worker hashes before publishing. It neither rebuilds nor repacks
the qualified tarball. Candidate/distribution build receipts retain
`distribution_ready: false`; separate qualification receipts record the observed
target results without changing the immutable product bytes. Qualification alone
does not close findings or record physical acceptance; the hardening ledger owns
the combined F05/F06 remediation evidence and disposition. Preserve any release
hold until its remaining gates are verified. Registry publication and subsequent
authorized Homebridge installation/physical acceptance remain distinct stages.

## 1.1.0-beta.0 event-driven recording checkpoint

This release keeps the `beta` npm channel separate from stable `latest`. The
maintainer requested registry publication and will update the Pi manually.
The source integrates the current secure-media packaging and release gates;
it does not publish the earlier stable-based private tarball.
Public Firebase app/project parameters are application identifiers recovered from
the official APK, not sender or administrative credentials. Generated receiver
keys, account tokens, raw motion payloads and private diagnostic evidence remain
outside the source and npm artifact. The package gate requires the isolated FCM
worker and both migration tools and rejects private/runtime-state files.

Protocol 4 adds finite MP4 preparation to the canonical private worker. Its
bounded parent-supplied input has no provider URL or network transport. The exact
release requires new workers, source hashes, package integrity and all five
installed-target qualifications. Previous protocol artifacts cannot be reused.

The owned receiver has received real native-motion messages, including a fresh
production-worker observation, using an existing Blink session. This qualifies
that component only. The completed beta still needs installation/readback,
continued native USB recording, actual new clip bytes, finite Home requests,
retained/playable recordings and privacy/recovery observations. Record these
separately under the stage-specific acceptance rules below. Notification arrival
or a transport ACK must not be substituted for clip or iCloud retention evidence.
The original persistent USB recording lock's cause remains unproven.

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
That historical acceptance does not repair the older stable artifact or waive
the new runtime's acceptance criteria. The
[26 October checkpoint](plans/security-hardening.md#26-october-2026-secure-media-beta-publication)
owns current finding status; retained runtime guards remain mandatory. Do not
request the same stable-release risk decision again unless its exposure or scope changes.

Functional acceptance for stable 0.10.0 is recorded in the
[hardening ledger](plans/security-hardening.md#23-october-2026-rc19-acceptance-and-stable-readiness).
Release acceptance follows the evidence requirements above; a new RC number,
label or documentation change does not create a waiting period. Hardware failures
and other external causes require an explicit operator disposition. Preserve the
observed failure and the basis for that disposition without reporting a software
fix that was not made.

## Documentation publication

The [canonical documentation site](https://sealad886.github.io/homebridge-blink-cameras-new-api/)
publishes automatically from `main` through `.github/workflows/docs.yml`.
This workflow publishes documentation only; package versions, npm publication
and installed Homebridge hosts keep the release procedures above. See the
[documentation publication guide](../output/documentation/README.md) for its
build, validation and rollback procedure.
