# HSV readiness implementation qualification — 4 November 2026

## Scope and state

The operator approved guided setup, per-camera recording status and recovery,
Node 26 support, and preparation for end-to-end testing. The subsequent request
adds a documentation-specialist-led overhaul, including a prominent README
What's New announcement. Agents Orchestrator owns implementation coordination;
this record owns executed runtime and candidate evidence.

Work remains in `codex/hsv-saved-clip-prototype`, based at
`0ef68d13d525fbc959a15ac0ff18d14f3595bd6d`. Existing changes are preserved. The
unrelated protocol-3 verification receipt remains protected. Publication,
verification submission, production plugin installation and service restart are
not part of this execution. The operator independently upgraded Homebridge's
Node runtime during this work.

Local implementation, independent reviews, HTTP visual acceptance and executable
qualification are complete. The documentation specialist's overhaul and its
validation have also passed. No new end-to-end Home recording or ordinary-package
acceptance is claimed here; producing that candidate still requires the separately
authorized committed-source CI action described below.

## Runtime identities

The Mac's fresh nvm-enabled shell resolved Node `v24.15.0` at
`<operator-home>/.nvm/versions/node/v24.15.0/bin/node`. Node `v24.22.2` is also
installed; an explicit `nvm exec 24.22.2 node` verified that version and its exact
nvm executable. This task has not changed nvm aliases or the user's active shell.

The separate `/opt/homebrew/bin/node` resolves to Node `v26.13.0` and is available
for explicit compatibility checks. The raw non-login tool shell has no `node`
command on PATH, so every qualification must record the actual executable and
give child commands the intended runtime path.

On the Pi, the user-upgraded Homebridge service was active/running with main PID
167360. Read-only inspection of its exact `/proc` executable verified
`/opt/homebridge/bin/node` at **v26.13.0**. The separate
`/usr/local/bin/node` remains **v24.13.0**. Installed Homebridge **2.5.0** and
scoped HAP **2.3.0** both declare `^22.12.0 || ^24 || ^26`. These facts establish
a supported host for Node 26 qualification; service liveness alone does not
establish plugin feature acceptance.

A later read-only process-tree check also verified the service supervisor,
Homebridge process and both observed child-bridge processes. All four used
`/opt/homebridge/bin/node` **26.13.0** (PIDs 167360, 167374, 167404 and 167405).
Arguments and process environments were not read or logged.

Official release metadata selected Node **22.23.4**, **24.22.2** and **26.13.0**
as current LTS releases. Private Mac 22/24 archives and a Linux ARM64 26 archive
were downloaded over verified HTTPS and matched the official release SHA-256
lists. Versions, origins, lengths and hashes are retained in
`logs/hsv-readiness-20261104/node-runtime-artifacts.json`. No global installation
was performed. See the [official release schedule](https://nodejs.org/en/about/previous-releases)
and [Node 26.13.0 release](https://nodejs.org/uk/blog/release/v26.13.0).

## Node source milestone

The Node support slice was frozen as 332 hashed source files before the next
product writer started. Its archive SHA-256 is
`2e6a7a929a28eaf189ca16817cf90318047b4c2ea0f9f834651e94f9d6cdd013`.
This is an explicitly uncommitted snapshot based on the commit above, rather
than a distribution source identity. Its development/test host is pinned to
Homebridge **2.5.0** and scoped HAP **2.3.0**. The plugin's declared supported
Node majors and JavaScript CI lanes are **22, 24 and 26**.

Fresh task-owned copies passed the following on each actual selected Mac
runtime, **22.23.4**, **24.22.2** and **26.13.0**:

- `npm ci --engine-strict --ignore-scripts`, with a private npm cache;
- source lint and TypeScript/UI build;
- eight real HAP suites, **200 tests passed** per lane;
- all JavaScript workflow/package contracts, **88 tests passed** per lane;
- Blink API contract validation; and
- JavaScript-only package content, entrypoint and registration smoke.

Runtime tracing recorded the actual executable/version of npm, Jest, the
compiler and other Node child processes. Every recorded process in each lane
used its selected Node version. The frozen input hashes were verified before
and after execution. The 22 lane used its bundled npm 10.9.9; the 24 and 26
lanes used the installed npm 12.2.1 CLI under their explicit Node executable.

The first sandboxed HAP attempt failed five stream-quality tests in each lane.
A separate UDP bind probe reproduced `EPERM` inside the sandbox and succeeded
outside. Re-running the affected tests and remaining checks outside the
sandbox passed without source changes. Both attempts are retained in private
evidence under
`logs/hsv-readiness-20261104/node-milestone-matrix-003458/`; the completed
receipt is `results-network-enabled.json`.

This milestone does not cover the later readiness/UI changes, the final full
Jest suite, a complete five-target native package, or Home retention acceptance.
Those require their own integrated evidence. The JavaScript-only smoke is
deliberately unable to produce a release output and cannot substitute for the
ordinary native package gate.

## Runtime readiness backend milestone

The backend slice is frozen separately from the browser interface. Its
334-file source archive has SHA-256
`0b3bf7874b621c8b86d6b5077c4ab2835a1e05a6d5dfd6bb6108260cdbf14062`.
The implementation's 14 focused suites passed **370 tests** under explicit
Node 24.22.2, with lint/build and specification review passing.

An independent broad run on a fresh task-owned copy under explicit
**Node 26.13.0** passed source lint/build and the **full Jest suite: 73 suites,
1,673 tests passed; two suites / 20 tests intentionally skipped**. All traced
Node processes used 26.13.0. Its dependency lock was byte-identical to the
earlier strict-qualified Node 26 installation, which was reused by private
symlink. The frozen input hashes remained unchanged. Receipts are retained in
`logs/hsv-readiness-20261104/runtime-readiness-node26-broad/`.

The slice introduces a shared camera-selection projection and applied-settings
revision, raw observed Home policy, durable per-camera catalog baselines,
coherent job stages/timestamps, admitted native-file evidence, and a bounded v2
report for every selected camera. A missing or unsupported report remains
separate from configuration validity. Integration regressions corrected during
the slice include the zero-target registration timing path and ambiguous
numeric camera selection; existing registration assertions were preserved.

Subsequent independent quality review found that valid provider capture times
using a `+00:00` offset could be rejected by the report reader's canonical-time
contract. A composed-report-through-reader regression reproduced the defect.
Only report projection normalizes the two provider capture fields; raw ledger,
parser and clip identity remain unchanged. The corrected backend archive has
SHA-256 `3c40f29d7bc2e259ecec2ec99a840d8bdd885722c73febaabc4f28ed2ba7001d`.
Its narrow recheck passed three suites / 60 tests, lint/build and independent
quality approval. The later GUI snapshot includes this correction.

This broad run precedes the guided browser UI, build-only workflow and
documentation changes. Those later changes still need integrated checks and
visual review. It is not an ordinary packaged installation or physical Home
recording acceptance.

## Guided configuration interface milestone

The corrected browser-interface archive is
`qualification-source-hierarchy-fix.tar.gz`, SHA-256
`ed38f44399df34a5a81a778a7cb4782383a3277185697bce8f14c5ac85a9c915`,
retained under `logs/hsv-readiness-20261104/gui-readiness-slice/`.
Its five focused suites passed **51 tests**, with lint/build passing. The
original interface archive and initial visual evidence remain retained.

Root reviewed the actual rendered interface at the task-owned HTTP preview on
`127.0.0.1:8766`, using synthetic cameras and canonical compiled server helpers.
The preview explicitly reports absent browser cryptography; the editor tests
also exercise absence of WebCrypto. No Pi configuration, account or camera was
connected to the preview. Save changes memory in the preview only.

All nine supplied scenarios were reviewed: fresh setup, restart required,
initial scan pending, Home recording off, ring-only policy, ready for a fresh
test, backlog, expiry and connection recovery. The blocked scenarios disabled
walk-test guidance while valid Save stayed available. The ready video-only
case permitted guidance. An unsaved additional camera selection, the active
Recording section, queue disclosure and walk instructions survived activity
refresh; the draft correctly suspended readiness. Module controls showed
independent inheritance and explicit continuous-feed choices. The camera
settings contained no automatically created empty unidentified row.

The expanded clip timeline showed original Blink capture, discovery, download,
preparation, delayed offer, hub acknowledgement and expiry for one coherent
clip. Its explanation explicitly kept transport acknowledgement separate from
playable Home retention. Expiry guidance preserved the Blink original, and
recovery retained unavailable/unassociated selections rather than hiding them.

The initial visual pass found activity buried below lengthy repeated setup
text. A bounded correction moved existing-camera activity immediately after the
introduction, kept full setup open for first use and collapsed it for existing
selections, removed repeated source explanations, and used “initial clip scan”
in primary copy. The recheck approved that layout and confirmed detailed
privacy, delay, battery and native-gap explanations remain available.
Light and dark preview themes were inspected, and the initial light theme was
restored. No mobile-device or production-host visual acceptance is claimed.
Final screenshots are `ui-ready-final.jpg` and `ui-fresh-setup-final.jpg` in
the private Nov4 evidence directory; scenario DOM and interaction evidence are
retained beside them. This is local synthetic interface acceptance, not a
production install or Apple Home recording acceptance.

## Build-only workflow milestone

The final executable-source freeze, including the guided interface and workflow,
has 334 files and archive SHA-256
`6407d75963dfebcf4452d2dcea67718c7ac0c5b1c1b27f5c7171ec66fe763af4`.
The workflow slice changes eleven paths. Root independently reviewed the
workflow, shared intent policy, completed qualification proof, publisher,
existing release-command caller and their regressions; all eleven live hashes
matched the frozen receipt. No blocking finding remained.

Manual dispatch defaults to **build-only**. Its chosen committed branch follows
the existing source gates, genuine five-target workers, ordinary package build
and five installed qualifications. A read-only completion job binds the same
tar, source, package name/version, worker identities and individual receipts to
the selected mode, and retains one complete candidate artifact. Publication
requires explicit **publish**, **main** and the exact nonempty source version;
the publisher rechecks the completion proof before external operations. Existing
release-command instructions now explicitly request publish mode.

The actual YAML intent step was exercised across mode/ref/version combinations;
workflow contracts cover build-only reachability, all five dependencies and
effective permissions, including the reusable gates workflow. The first final
integrated Node 22 lane passed all 106 JavaScript workflow/package contracts.
The writer's focused gate and independent specification review also passed.
Root's quality receipt is
`logs/hsv-readiness-20261104/build-only-independent-review.json`.

`actionlint` was unavailable and no new dependency was installed. Actual GitHub
dispatch, genuine five-target generation and ordinary-package installation have
not run. The concrete next build action, after separately authorized commit and
push of the reviewed source, is:

```sh
gh workflow run publish.yml --ref codex/hsv-saved-clip-prototype -f mode=build-only
```

The optional version input defaults to the committed manifest's version. This
private test path does not publish to npm or create a GitHub release.

## Final integrated executable checks

Fresh isolated copies of the final executable freeze above passed on all three
actual selected runtimes:

| Node | Strict install | Lint/build | Full Jest | Workflow/package contracts | API contract and JS package smoke |
| --- | --- | --- | --- | --- | --- |
| 22.23.4 | Pass | Pass | 73 suites / 1,678 passed | 106 passed | Pass |
| 24.22.2 | Pass | Pass | 73 suites / 1,678 passed | 106 passed | Pass |
| 26.13.0 | Pass | Pass | 73 suites / 1,678 passed | 106 passed | Pass |

Each lane used `npm ci --engine-strict --ignore-scripts` and a private cache.
Actual parent/tool/child runtime tracing matched the selected Node version in
every recorded process. All 334 frozen source hashes remained unchanged. The
Homebridge/HAP development host remained pinned to 2.5.0 / 2.3.0.

Each full Jest run intentionally skipped 20 optional integration cases, including
externally verified native-worker/codec/receiver fixtures, real finite-source
preparation fixtures, private media-pipe fixtures and the opted-in real socket
case. Two whole suites were skipped; other skipped cases sit within passing
suites. The actual Pi Node 26 finite-clip preparation above provides separate
genuine-source execution evidence, but does not replace all of these omitted
target-specific or network checks. The five-target CI qualification remains
pending, as does final Apple Home acceptance.

Exact commands, all output, per-test JSON, runtime traces and a compact summary
are retained under
`logs/hsv-readiness-20261104/node-integrated-matrix-013731/`. These checks ran
against executable source frozen while the specialist edited documentation
separately; final prose/link checks and unchanged executable identities are
recorded at the documentation handoff. No ordinary native package was fabricated
through the JavaScript-only smoke route.

## Actual Pi Node 26 media preparation

An offline run used the actual `/opt/homebridge/bin/node` **26.13.0** with the
existing private protocol-4 ARM64 worker and retained native Blink original.
The four compiled modules used by the production preparer exactly matched the
frozen Node milestone build before execution. No provider request, camera live
session, production configuration change or Homebridge restart was performed.

The run started at **00:39:24 UTC** and completed at **00:40:22 UTC**. Preparation
took **57.986 seconds** for the 12,260,089-byte, approximately 60.7-second source.
All **1,801 decoded pictures** were selected and encoded; the result contained
61 fragments and 15,272,805 bytes. Its SHA-256,
`b37dd78b8dd57671101019e8def69901a99e124dabfb82e77d33425c02a00cb1`,
exactly matched the previously qualified canonical output. The original source
hash remained unchanged and the retained buffer budget returned to zero.

The owner-only result is retained on the Pi in
`<operator-home>/blink-hsv-validation/20261103-kdIhav/readiness-node26/`; the
private local receipt is
`logs/hsv-readiness-20261104/node26-pi-preparation.log`. This proves that the
existing genuine finite-clip preparation path executes correctly under the
Pi's Node 26 runtime. It is neither a Home save/playback test nor a claim of
sustained multi-camera capacity or final readiness/UI acceptance.

## Existing published beta versus this candidate

The npm registry reports `1.0.0-beta3` from the same base commit as the installed
Pi package. Its installed `native/runtime/manifest.json` contains protocol **3**
and all five target entries. The ordinary packaged-worker loader succeeds and
selects the installed 6,176,224-byte Linux ARM64 worker, SHA-256
`33671b043d9341caf9ad4ee4f96910624a1c510ffadebb11b22762afb7a8b008`.
The installed recording module exposes the recording delegate and options.
Consequently, describing the published native runtime as undistributed or
disabled scaffolding would be incorrect. This read-only availability check does
not establish complete production HSV retention.

A fresh public registry read at **01:48 UTC** still reported the beta tag as
`1.0.0-beta3`, with the same base `gitHead`. That published package declares Node
`^20.0.0 || ^22.0.0 || ^24.0.0`; it does not yet advertise Node 26. The updated
local source adds Node 26 and has the matrix evidence above. Loading the installed
beta under Node 26 and qualifying the updated source are separate observations.
The public metadata receipt is retained privately as
`logs/hsv-readiness-20261104/registry-before-handoff.json`.

The new native saved-clip path uses protocol **4**. The existing isolated Pi
worker remains available with SHA-256
`472837e33fa6d3be6682225a016ad96db1b084f4dfe838b69d7cd295b3cdfa91`.
Its genuine-source fidelity and measured preparation are recorded in the
[3 November qualification](2026-11-03-native-clip-hsv-qualification.md).

## End-to-end artifact boundary

The canonical ordinary package requires five genuine matching target workers,
corresponding sources and an exact committed source identity. The uncommitted
checkout and a single host-qualified worker are not substitutes for that
artifact. Implementation will prepare a concrete build-only path and test
runbook; any required commit, push or workflow action must be identified after
the authorized local work is reviewable. No gate may be bypassed or old
protocol-3 workers relabelled as protocol 4.

The existing isolated test accessory retains its persistent identity and private
control channel. It remains a developer qualification tool, separate from the
ordinary user's setup. Its last observed recording state was off/unconfigured;
Home pairing, final-delegate retention and ordinary existing-camera acceptance
remain pending.

## Documentation and final local handoff

The documentation specialist reconciled **20 maintained guides and indexes**.
The near-top README **What's new — upcoming, unreleased** announces saved-clip
HSV, guided per-camera status/recovery and Node 22/24/26. It clearly distinguishes
this source from the published beta3/protocol-3 runtime. `docs/RECORDING.md` owns
the ordinary setup, native-storage preflight, initial scan, fresh-event test,
Home review/export, capacity and recovery journey. The configuration,
troubleshooting, authentication, streaming, release, contributor, native and API
navigation references link to their canonical owners. Historical native bodies
remain unchanged under explicit status/navigation headers.

Documentation checks passed **166 local file links**, **46 heading anchors**
and **four JSON/JSONL blocks containing seven values**, including **three
schema-validated configuration fragments**. Root independently reviewed the
README, recording guide, release instructions, contributor/index material and
critical configuration/native/recovery deltas, with no correction requested.
Current Apple primary sources support the conditional Home-history/search/summary
guidance. Several direct Apple fetches returned HTTP 429; official indexed results
confirmed the relevant content, so no dead-link finding was inferred.

All 20 documented file hashes matched the specialist's durable receipt. Root
also verified that all **255 non-Markdown files** from the final executable
freeze remain byte-identical, and the unrelated protocol-3 receipt remains
unchanged. Documentation evidence is retained in
`logs/hsv-readiness-20261104/documentation-overhaul/`.

The final AST-only graph refresh completed with 4,671 nodes, 9,578 edges and
270 communities. It used no LLM/API call and retained the tool's automatic
curated-graph backup. A final read-only Pi check at **01:51 UTC** still found
Homebridge's actual executable at **Node 26.13.0**, with beta3 installed. This
work did not replace the production plugin or restart its service.

The final source/documentation validation handoff location is
`logs/hsv-readiness-20261104/final-readiness-source/`; its external receipt owns
the captured archive identity and inventory. This is a durable source handoff,
not an installable five-target package. No commit, push, PR, GitHub
workflow dispatch, npm publication, plugin deployment or verification submission
was performed. The next concrete action is approval to commit the reviewed
in-scope source, push the task branch and run the build-only workflow. Actual
five-target package qualification and ordinary-camera Home save/playback tests
follow that artifact; the phone remains untouched by this execution.
