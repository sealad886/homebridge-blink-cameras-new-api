# Documentation publication and offline reading

The canonical public documentation is
**[Homebridge Blink Cameras documentation](https://sealad886.github.io/homebridge-blink-cameras-new-api/)**.
The Markdown guides in this repository remain the maintained source. The public
site follows `main`; its source edition is recorded in the generated
`build.json`, along with the exact CI commit.

## Automatic publication

[`.github/workflows/docs.yml`](../../.github/workflows/docs.yml) validates the
documentation on pull requests to `main`. After every push to `main`, the same
workflow builds and deploys the site automatically through GitHub Pages.
No separate documentation upload or plugin release is needed.

Pull-request validation watches the root README, contributor guide, package
version, `docs/`, the illustrated articles, the reader renderer, `tools/docs/`,
and its own workflow definition. Every `main` push runs the small documentation
pipeline so an unrelated commit cannot strand a superseded documentation build.
A manual **Documentation** workflow dispatch from `main` can rebuild the current
site when needed.

Pull requests receive a read-only token and run renderer tests, the public build,
and the complete local-link/asset check. They cannot publish. Only successful
`main` push or manual runs upload a Pages artifact and enter the `github-pages`
deployment environment. Pages and OIDC write permissions exist only in that
deployment job. Superseded PR checks are canceled; `main` publications run in
sequence. After deployment, bounded polling checks the public `build.json` for
that run's exact commit and verifies that the entry point responds. An older
cached site cannot satisfy the revision check.

Immediately before publication, a read-only API check compares the run's commit
with the current `main` head. Superseded runs skip Pages configuration,
deployment, and the public probe. Rerunning an older successful workflow cannot
replace newer documentation; dispatch from the latest `main` revision instead.

A deployment retry through **Re-run failed jobs** reuses the artifact name saved
by its successful build. A full workflow rerun builds a new attempt-specific
artifact. If the one-day artifact retention has expired, rerun all jobs or
dispatch from the latest `main` revision to produce a fresh bundle.

One-time repository setup selects **GitHub Actions** as the Pages publishing
source. The workflow checks that configuration; it never enables Pages from a
pull request. Repository administrators manage any environment protection rules.
Ongoing publishing is automatic after normal source review and merge.

Documentation publication does not build native workers, run application install
scripts, change an installed Homebridge instance, or publish an npm package. The
plugin's separate release procedure remains in [the release guide](../../docs/RELEASE.md).

## Build and verify locally

Use Node.js **22.12 or later** for the documentation tools; CI uses Node.js 24.
The private package under `tools/docs/` pins **Marked 17.0.6** in its own lockfile.
This keeps the renderer dependency separate from the plugin's package and lockfile.

From the repository root:

```sh
npm ci --prefix tools/docs --ignore-scripts
npm --prefix tools/docs run verify
```

`verify` runs the renderer contract tests, writes the public site to
`.local/docs-site/`, and checks every generated page, internal link, heading,
image, canonical URL, sitemap, and build inventory. It fails on missing assets,
checkout-relative links that escape the site, duplicate IDs, or unexpected
publication files. The renderer's tests include a missing-asset failure case.

The individual commands are available while editing:

```sh
npm --prefix tools/docs test
npm --prefix tools/docs run build
npm --prefix tools/docs run check
```

Open `.local/docs-site/index.html` for a local preview, or serve that directory
using an existing static-file server. Public guide links include `index.html`
so the preview also works through `file://`; canonical metadata and the sitemap
use the clean public directory URLs.

## Publication boundary and source ownership

The workflow uploads **only `.local/docs-site/`**. The artifact contains generated
guide pages, explicitly referenced screenshot/header assets, a standalone offline
reader, the sitemap, robots policy, and a small build inventory. The source tree,
private diagnostic receipts, `.rtfm` work state, token files, and runtime data are
not copied into the public bundle. Outbound references remain ordinary links;
the site loads no CDN scripts, styles, fonts, or images.

The renderer compiles these maintained sources:

- The [illustrated setup walkthrough](../articles/set-up-blink-cameras-in-apple-home/index.md).
- The root [README](../../README.md) and [documentation map](../../docs/README.md).
- [How it works](../../docs/how-it-works.md), [authentication](../../docs/authentication.md),
  [configuration](../../docs/configuration.md), [streaming](../../docs/streaming.md),
  [troubleshooting](../../docs/troubleshooting.md), and [diagnostic logging](../../docs/debug_logging_spec.md).
- The [native recording configuration migration](../../docs/native-recording-config-migration.md).

Recording procedures remain owned by the configuration guide. Update the
canonical Markdown owner first; do not edit generated HTML copies of a guide.
Screenshots illustrate actual UI controls with synthetic data. They do not
establish live-account, camera, Home hub, or iCloud acceptance. Their
[provenance and reproduction instructions](../articles/set-up-blink-cameras-in-apple-home/SCREENSHOTS.md)
are kept with the walkthrough.

This compiler processes trusted repository documentation. Marked preserves source
HTML; accepting untrusted Markdown would require a separate sanitization boundary.

## Offline reading

The public build includes a
[standalone offline reader](https://sealad886.github.io/homebridge-blink-cameras-new-api/offline.html).
Save that file to keep all ten chapters and their illustrations together.
Chapter/heading search, light/dark/system themes, keyboard navigation, and printing
run locally. Its metadata excludes it from search indexing so public guide URLs
remain canonical. Deliberately opened external references still need a connection.

To refresh the original checkout-relative reader in this folder:

```sh
npm --prefix tools/docs run build:offline
```

That produces [index.html](index.html). Keep it in the repository because this
development companion links to local source files and images. The published
`offline.html` is the portable edition; it embeds its illustrations.

## Recovery and verification

A failed test or build prevents deployment and leaves the last successfully
published site in place. For a documentation regression, correct or revert the
source change through normal review; merging to `main` automatically republishes
the resulting site. This does not roll back or release the plugin. A failed
public-entry check remains a failed workflow and should be investigated rather
than hidden by an unrelated package release.

Check the built site at desktop and narrow widths after layout changes. Verify
chapter/deep links, title search, theme changes, images, keyboard focus, and
printing. Browser checks do not establish screen-reader or physical-camera
acceptance. The [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
describes the hosting integration.
