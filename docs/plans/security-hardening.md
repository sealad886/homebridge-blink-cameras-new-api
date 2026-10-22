# Security hardening delivery ledger

Source baseline: `fb96b9b33921e39d825f1be8636705e8a9839d20`.
Scan: `247931cc-e452-4dff-bfec-5054e0481242` (sealed).
Manifest SHA-256: `0c970d21f83f14912e1e7c6dd343ba3b79419aa3c4b99c0c9b241e8bb033c144`.
Approved design: scan supplemental `hardening/hardening.md`, artifact
`a531f35a81c4ac522960f23f6b95f1ecab85e75280fe513c00f5e1968145c363`.

Current release branch: `codex/security-hardening-rc4`, existing checkout. No new worktree.
The original `codex/secure-media-worker` branch and unpushed commit remain intact;
the release branch starts with an identical signed tree and corrected commit text.
The preceding staged delivery merged through PR #49 at `2e86a45` and published
`0.10.0-rc.3` through CI run `37132584266`. Historical local receipts below retain
their original scope and do not describe current branch or review state.
Implementation and review assignments remain unassigned for ongoing maintenance.
Maintainer owns architecture/release decisions; operator owns physical acceptance.

## Delivery checklist

- [x] Refresh baseline and preserve unrelated work (WI-01).
- [x] Implement local bounded-input, session, private-IMMIS and diagnostic candidates (WI-02/03/04/06).
- [x] Independent local review and verification receipt (WI-09 local slice).
- [x] Revised media-network design approved on 2026-10-03: private worker IPC and owned transport feeding codec-only processing.
- [ ] Native worker and five-target distribution (WI-05/07/08 implementation and enforcement proof pending).
- [ ] Exact registry artifact, physical acceptance, observation (WI-09 release slice).

## Work items and dependencies

| Item | Scope | Dependencies | Findings | Acceptance |
|---|---|---|---|---|
| WI-01 | Baseline, contracts, decision records, measurement fixtures | none | all | all |
| WI-02 | Bounded bodies, IDs, domain decoding, safe diagnostics | WI-01 | F07/F11/F12 | AC-05/06 |
| WI-03 | Generation ownership from PREPARE through retirement | WI-01/02 | F03 | AC-02 |
| WI-04 | Private pipe, framing, backpressure, recording quotas | WI-03 | F01/02/04/09/10 | AC-01/03/04 |
| WI-05 | Actual media connection enforcement feasibility | WI-01, integration WI-02/04 | F06 | AC-07 |
| WI-06 | Origin-bound OAuth diagnostics, trusted normalizer | WI-02 | F08/F13 | AC-09/10 |
| WI-07 | Secure C11 libav worker | WI-03/04/05 | F05/F06 | AC-07/08 |
| WI-08 | Five-target artifacts, migration, immutable verification | WI-07 | release prerequisites | AC-11 |
| WI-09 | Independent review, regression, physical acceptance | completed slices; final WI-08 | all | AC-12 |

WI-05 source inspection disproved public I/O interception for stock FFmpeg 9.0.2
RTSP. See [native feasibility receipt](../audits/security-hardening-native-feasibility.md).
The original WI-07 callback-based design stopped as prescribed. The approved
owned-transport continuation now has a codec-only development prototype; it is
not wired into the plugin or included in npm artifacts. No unconstrained native
worker or hostname-only substitution is accepted.
F05 and F06 remain open. Existing FFmpeg execution still contains those exposures.

## Acceptance and finding disposition

| Requirement | Required evidence | Current release disposition |
|---|---|---|
| AC-01 | No public IMMIS consumer listener | local implementation under verification |
| AC-02 | STOP at startup awaits, duplicate/expired preparation, late success, confirmed closure | local implementation under verification |
| AC-03 | Fragmented/oversized frames and invalid client IDs fail within bounds | local implementation under verification |
| AC-04 | Non-reading child, talkback and disk saturation remain bounded | local implementation under verification |
| AC-05 | Real streamed bodies at exact limit/+1, compressed/chunked/stalled streams | local implementation under verification |
| AC-06 | Invalid IDs make no authenticated request; bounded discovery/log traversal | local implementation under verification |
| AC-07 | Observe every actual destination including redirects/reconnect/secondary RTSP | IMMIS numeric-connect candidate implemented; provider calibration and RTSP proof pending |
| AC-08 | Dummy secrets absent from argv/env/logs/errors/crash output | private-pipe codec prototype only; crypto/session integration pending |
| AC-09 | OAuth diagnostic cookies/credentials remain origin-bound | local implementation under verification |
| AC-10 | Malicious self-consistent bundles cannot execute bundled code | local implementation under verification |
| AC-11 | Linux arm64/x64, macOS arm64/x64, Windows x64 clean-host launch/codec proof | blocked: no native artifact |
| AC-12 | Independent review, integrated/physical parity, measured resources and observation | local review pending; physical acceptance pending |

F01/F02/F03/F04/F07/F08/F09/F10/F11/F12/F13 require regression evidence and independent
review before resolution. No finding is closed merely because source changed.
F05/F06 remain explicitly open in early stages.

## Measurement and release gates

Pending measurements: matched first-frame/start/stop latency, CPU/RSS, queue peaks,
recording bytes, platform codec memory ceilings; 100 cycles without post-stop trend;
p95 latency regression <=10%. Synthetic tests cannot establish physical acceptance.
Valid provider traffic calibration remains required; exceeding limits blocks promotion.

Initial limits: token/error JSON 64 KiB; OAuth HTML 512 KiB; command/status JSON
256 KiB; account/homescreen JSON 2 MiB; thumbnails 5 MiB. IMMIS frame 1 MiB,
retained input 2 MiB, incomplete frame 5 seconds, output queue 1 MiB, drain 2 seconds.
Preparation expires at 30 seconds. Recording budgets are independent of live transport.

Preserve ADR-003 coordination, deadlines, no ambiguous POST replay, coalesced snapshots
and confirmed-state semantics. Keep unsupported talkback disabled.

Publication follows `docs/RELEASE.md`: alpha → beta → RC → stable, immutable CI-built
artifact, exact registry identity. Beta: 24h/one natural refresh. RC: 48h/two refreshes;
runtime corrections restart RC observation. The original planning turn authorized
no mutations; subsequent delivery authority is recorded below. Live installation
and host configuration changes remain outside this delivery.

Rollback preserves security guards. Disable affected streaming when migration/media
fails; never silently restore unauthenticated TCP or known secret exposure.

## Historical local candidate and finding ledger

This receipt predates PR #49 and RC.3. Its source identity was the baseline revision
plus local changes. Production-source digests and exact checks are
recorded in `../audits/security-hardening-local-verification.json`.

| Finding | Local control | Evidence / independent review | Residual / release disposition |
|---|---|---|---|
| F01 | IMMIS TCP listener removed; child stdin only | proxy tests, IMMIS review | Candidate only; live parity pending |
| F02 | bounded child queue/drain deadline | non-reading writer tests, IMMIS review | Candidate only; real encoder stress pending |
| F03 | generation owner, late cleanup, closure reservations | ownership tests, bounded review | Candidate only; physical startup/stop stress pending |
| F04 | incremental frame and retained-byte limits | malformed/fragmented frame tests, IMMIS review | Candidate only; legitimate traffic calibration pending |
| F05 | private-pipe codec prototype; runtime cutover pending | native prototype receipt and feasibility evidence | **Open**, current runtime SRTP argv exposure remains |
| F06 | owned IMMIS numeric-connect policy; RTSP remains pending | APK provenance, destination regressions and native feasibility evidence | **Open**, complete RTSP destination enforcement unproved |
| F07 | thumbnail streaming cap before allocation/cache | real streamed snapshot and reader tests | Candidate only; provider calibration pending |
| F08 | fixed-origin diagnostic OAuth transport | transport tests, bounded review | Candidate only; no live credential run |
| F09 | canonical uint32 client ID before TLS auth | client-ID cases, IMMIS review | Candidate only |
| F10 | independent writer/audio/recording budgets | queue/recording tests, IMMIS review | Candidate only; disk inode overhead and physical stress outstanding |
| F11 | decode/path positive safe-integer IDs | direct API invalid-ID tests, fresh prepatch trace | Candidate only |
| F12 | bounded body and JSON/domain/diagnostic traversal | body/API tests, bounded review | Candidate only; valid-traffic calibration pending |
| F13 | trusted installed normalizer; bundles data-only | malicious recomputed-manifest regression, independent review | Candidate only; trusted-installation compromise out of scope |

Diagnostics now expose seven fixed counters through existing outage diagnostics:
overflow, destination rejection, cancellation, cleanup timeout, recorder refusal,
worker failure and migration failure. Migration remains blocked; its counter stays
reserved for final cutover. Counters contain no per-session labels, provider bodies,
credentials, media or destinations.

The local package verifier accepts both earlier npm array output and npm 12 keyed
pack output. Verification uses a temporary npm cache; host cache ownership is untouched.
Its reported HEAD is baseline identity, **not** an immutable source identity for these
uncommitted changes. Local package loadability is not CI artifact or release acceptance.

Synthetic 100-cycle tests prove owner maps/reservations clear after confirmed closure;
they do not measure RSS, CPU, first-frame latency or physical resource trends.
Node 24 runs locally; existing CI Node 20/22/24 coverage is preserved but Node 20/22
were not executed here. Native platform claims remain withheld.

Final local checks after review round 4: 733 Jest tests / 34 suites, 46 Python tests, 39 release-safety
Node tests; lint, build, script typecheck, contract validation and packaged plugin
loadability passed. Independent receipts found no remaining blocker in reviewed local
slices. Native feasibility and physical/release gates remain open; this is a staged
candidate, not comprehensive security resolution. See the JSON verification receipt.

## RC preparation authorization

On 2026-10-03 the maintainer authorized scoped commits, origin push, PR review/fix
rounds and fresh RC publication through existing CI when ready. This supersedes
the implementation-turn Git-action restrictions above. Host installation remains
unrequested. F05/F06 and physical/runtime acceptance remain open.

## Review round 1 corrections

Recording admission now uses a filesystem lock and per-capture reservations across
processes sharing the recording directory. Abandoned locks refuse recording and
abandoned reservations remain charged; recovery requires deliberate operator
inspection. Live media continues without recording. Cross-process tests verify
the 256 MiB admission ceiling and release after confirmed file closure.

Diagnostic redirects resolve against the actual response request URL. Evidence
coverage requires observations within the requested window; PID and kernel origin
proof cannot attribute earlier activity retroactively. Bundle verification rejects
special filesystem entries and generated commands use the trusted installed path.
CI now typechecks maintained OAuth scripts and runs trusted evidence tests.
The refreshed local receipt records tested source hashes. Further bot review and
CI remain required before merge or publication. F05/F06 remain open.

## Review round 2 corrections

Intentional STOP with pending readiness no longer counts a worker failure; genuine
readiness rejection still fails closed. Known-ended evidence sessions ending at
the requested start are excluded from the half-open window; unknown-end context
remains conservative. The OAuth diagnostic missing-code warning is reachable.
Focused lifecycle, evidence boundary and synthetic whole-script checks pass.
The next active review round remains required before publication.

## Review round 3 corrections

Bundle export and verification exempt only the root manifest path; nested files
with that basename require membership and hashes. Homescreen entity names follow
required bounded contracts before accessory expansion. HTTP path identifiers are
validated before authentication can load or refresh tokens. Near-expiry valid
requests still refresh normally. Full Jest, evidence tests, lint, build and package
loadability pass. CodeRabbit returned explicit clean on the preceding revision and
is retired; Copilot review of these corrections remains required.

## Review round 4 corrections

Evidence session boundaries derive canonical time from the original event, not
reduced PID fields. Export and reproduction use the existing normalizer sort,
without treating receipt order as source-time order. Real Store/export/reproduce
regressions cover delayed journal/audit/Homebridge events, original boundaries,
no backward attribution and identical reproduction. All 46 evidence tests pass;
TypeScript/package source is unchanged from the 733-test verification.
Copilot remains the active source for the next review.

## Approved continuation and release readiness — 2026-10-03

The maintainer approved private IPC for native configuration and owned upstream
transport feeding codec-only media processing. Start with IMMIS. Compare a worker-
owned RTSP implementation with a maintained connector patch before selecting RTSP
execution; stock public libav I/O callbacks remain insufficient. This approval
supersedes the earlier design-approval blocker, not the actual-connection proof
gate. See ADR-005. F05/F06 remain open until their mapped gates pass.

Development, testing, documentation, scoped commits, pushes, PR review/fix/merge
and a fresh CI-published RC are authorized. Live-device installation is excluded.
The operator will install through Homebridge and direct physical acceptance later.

Release readiness also includes reconciliation of PR #19 (network exclusion
already adapted with attribution in merged PR #22), dependency action updates
from PRs #32/#33/#36, and the evidence-export concurrency failure observed in
CI run `37132647161`. Action pins are integrated through the delivering PR and
verified by Node 20/22/24 CI; superseded dependency PRs close only after that
merge. The exporter must size and write one retained-event snapshot while
preserving hard byte reservations, rather than allowing concurrent append to
change the exported input after reservation admission.

Delivery routing reuses the accepted context, requirements, design and work
ledger. Scale is large and risk high because secret handling, network authority,
codec execution and five-target distribution interact. Implementation and quality
own the current work; security, independent review, documentation and external
coordination are active release gates. Release execution follows only after an
exact immutable source/artifact is resolved. Retrospective observations and
physical acceptance remain future work; passing CI does not establish either.

### Current verified slices

The owned IMMIS path admits the APK-derived `immedia-semi.com` family on TLS port
443, resolves each connection anew, rejects non-public or mixed DNS answers, and
connects numerically while preserving original TLS identity. The family is a
conservative policy inference; real provider media-host completeness is unverified.
No synthetic host grants production authority. The TLS bypass is removed from
the UI and ignored in old settings; snapshot/authentication behavior is unchanged.

The shared DNS owner caps actual outstanding lookups at eight without a queue,
and retains admission after caller retirement until underlying lookup settlement.
The existing outage probe uses the same owner. Independent review identified and
verified this correction. Startup ownership fixtures now use admitted synthetic
hosts so their cancellation tests continue to reach the intended startup boundary.

The isolated C11 prototype is development source under `native/`; it is excluded
from npm runtime. It uses private framed standard pipes and public codec APIs.
Its local build receipt establishes measured macOS arm64 scope: signed FFmpeg
9.0.2 source, immutable source/digest pins for x264/Opus/libSRTP, static libraries,
zero native URL protocols, H264 plus Opus/PCMA/PCMU processing and published RTP/
SRTCP protection vectors. Own-process POSIX core limits and dummy-key process
inspection are verified locally; external crash collectors are not controlled.

The private parent-client prototype bounds framing, queues, writes, requests and
consumer callbacks. Independent review identified and verified corrections for
frame coalescence, natural-close data loss and shared control/media writer ownership.
The [RC.4 milestone review](../audits/security-hardening-rc4-review.md) and
[local source/check receipt](../audits/security-hardening-rc4-local-verification.json)
retain exact scope; immutable PR review and hosted CI remain gates. Existing test
CI now builds source and tests the native/parent boundary on Linux x64 and macOS
arm64; successful CI runs remain prerequisites, not assumed receipts. Other
architectures, Windows, clean-host baselines and five-target distribution remain
gates. No native binary, startup download or native fallback enters npm runtime.

Native AAC-ELD encoding fails closed rather than substituting AAC-LC. Complete
RTSP transport, codec/runtime integration, validated encoder capabilities,
configuration migration and physical HomeKit/provider acceptance remain work.
The planned `0.10.0-rc.4` contains the independently verified runtime IMMIS/DNS
controls and evidence/CI corrections; native work remains development source.
No release or F05/F06 closure is claimed before its exact gates. Process separation
does not establish an OS sandbox.

### PR #50 review corrections

The first immutable PR review found a new memory regression in evidence export:
freezing every retained event before capacity admission could exhaust Pi memory.
The existing Store now owns one repeatable SQLite WAL view across streaming sizing
and raw writing. Each pass retains one serialized event; concurrent appends remain
possible and cannot change the exported membership. Source expiry fails cleanly
without extending retention. The existing normalizer runs after this view closes.
The 5,000-event, 16 KiB-per-event refusal regression enforces less than 4 MiB traced
sizing memory, no staging writes and no lingering reservation.

Copilot also identified discarded DNS candidates and a stale license hash. IMMIS
fallback retains the fully validated address set and attempts bounded distinct
numeric candidates while preserving TLS hostname verification. A socket must
confirm closure before the next attempt; STOP fences timers and callbacks.
Reconnects resolve and validate fresh answers. The current native receipt records
the actual included license bytes; historical receipts remain historical.

Initial hosted Node 20/22/24, commitlint and macOS native checks passed. Linux
native CI rejected eight misleading-indentation warnings under its strict GCC
flags. Explicit braces and statement separation correct these without changing
behavior or weakening compiler checks. Fresh hosted Linux verification and renewed
review of the corrected immutable head remain mandatory publication gates.

## RC.5 corrective slice — 8 October 2026

WI-05/09 re-enter after real Home tests failed: hostname-only IMMIS admission
rejected a provider contract using public IPv4 transport and separately verified
vendor TLS identity. See the updated media-destination evidence receipt. The
correction preserves mandatory certificate verification and public-address policy;
no TLS bypass, additional coordinator or native-runtime claim is introduced.

Camera lifecycle owns a 30-second failed-start backoff to bound Home retry-driven
liveview POST conflicts. Cancellation through STOP does not begin this backoff;
retirement ownership and remote cleanup deadlines remain unchanged. The auth owner
logs one fixed, secret-free completion event after successful token capture/storage,
with a finite trigger reason, so expiry/proactive natural refreshes can be observed
without debug provider bodies. Storage failures emit no completion receipt.

Delivery: focused regressions -> lint/build/full Jest/API/release/package gates ->
independent review/PR/CI -> CI-published unused RC.5. No installation authority is
added. New runtime observation starts after Andrew installs the exact registry RC;
physical live video/audio, STOP/reopen, manual refresh and two natural refreshes
remain required. Intentional reboot confirmed by Andrew; F05/F06 remain open and
stable-specific residual-risk disposition is still absent. Rollback must retain
security guards or disable affected live streaming, never restore TLS bypass.

## RC.6 playback and diagnostic corrections — 10 October 2026

Issues #52 and #53 are separate correction units. Retained APK59.2
BlinkWalnutLiveViewSessionManager.java396–417 configures URI/serial and invokes
native playback immediately; display readiness arrives later at612–631.
WalnutSignalling.smali1602 starts command monitoring independently of playback
at1741. SupervisorKommand.java models numeric status and boolean completion.
Current provider status bodies were not retained; do not claim their values.

The old IMMIS startup gate waited on command completion for up to60 seconds.
Observed RC.5 attempts ended after roughly29 and18 seconds with no TLS progress.
RC.6 starts the verified, bounded private transport after consumer attachment,
with command monitoring separately serialized. Existing destination/TLS,
cancellation, framing/backpressure and retirement controls remain enforced.
Regression coverage proves transport/auth/media progress before monitoring
completion and prevents late monitoring from reviving a stopped generation.

The diagnostic boundary suppresses Reading/Applying option records naming SRTP
key parameters; ordinary progress remains redacted and bounded. Tests use dummy
keys only, including fragmented records and final-buffer flush. Raw diagnostic
receipts remain private. This does not close broader F05 process-argv exposure.

Physical acceptance cannot be established before Andrew installs the successor
registry artifact. Keep #52 open until runtime video/audio/STOP/reopen acceptance;
close #53 only after independently reviewed regression delivery is verified.
Do not claim full media/security acceptance from synthetic or native-prototype
checks. Rollback retains security controls or disables live streaming.

Pi5 performance investigation: host identity is verified Pi5 ModelB. Its H.264
encoding is software; compiled encoder names do not establish working hardware.
Potential video streamcopy requires verified H.264 profile/level, dimensions,
frame rate and bitrate compatibility with HomeKit negotiation; do not enable it
blindly. A faster software preset is a bounded optional tradeoff, whereas source
inspection/adaptive copy requires further media evidence. No host settings changed.

### RC.6 complete stream compatibility slice

The same canonical FFmpeg builder owns MPEG-TS demux, H.264 conversion and
separate video/audio RTP/SRTP outputs. A real local synthetic MPEG-TS input
(H.264 plus AAC-LC) reproduced zero video packets with the old IMMIS `nobuffer`
input flag. Removing that flag only from the private pipe preserves the initial
keyframe. Matched video maximum bitrate/VBV limits constrain encoder output.
Negotiated Opus packet duration is honored; Low CPU also selects Opus complexity
3. AAC-ELD advertisement requires successful libfdk_aac encoding/RTP probes at
both advertised sample rates; absent capability advertises Opus instead.

The unpublished option is `softwareEncodingPreset`: balanced veryfast remains
default, ultrafast is opt-in. Hardware video encoder settings stay unchanged.
Synthetic loopback tests cover dummy-key video/audio RTP headers and timing;
they do not establish provider media compatibility, decoded Home audio, Pi CPU
savings, physical parity, or F05/F06 closure. Blind video/audio stream copying
remains withheld until actual source parameters match controller negotiation.
Existing queue, recording, failure-backoff and generation-owned shutdown bounds
remain the stream's resource controls. Unsupported source variants require
bounded failure and further evidence; no unconditional stream compatibility claim.

### RC.7 audio negotiation correction

RC.6 physical acceptance failed before encoder launch: Home selected AAC-ELD
while actual live HAP readback advertised only Opus on four camera services.
Client caching is a hypothesis, not an established cause. The Pi's existing
system FFmpeg lacked FDK AAC. Source inspection also found that the AAC-ELD
probe and streaming arguments omitted required global codec headers; a short
silence probe did not reliably flush RTP packets.

Readback of the actual explicit Pi ffmpegPath showed an existing FDK AAC,
Opus and H.264-capable executable. Its identity differs from system FFmpeg;
the system encoder inventory cannot establish configured runtime capability.
RC.7 retains the operator-managed executable and configuration. The pinned
Homebridge FFmpeg package (2.1.7, Node 20-compatible) is development/CI tooling
only, enabling real AAC-ELD pipeline tests without distributing a binary in the
plugin or installing anything on the Pi. No runtime download, new media
coordinator or host-setting migration is introduced. This is not WI-07 secure
worker delivery and does not close F05/F06 or establish five-target acceptance.

AAC-ELD uses global headers and a bounded one-second dummy-tone RTP probe at
16/24 kHz. Validated capability permits both AAC-ELD and Opus advertisement,
with configured preference first. Selected codec is encoded as negotiated;
unknown or unavailable selections fail before vendor allocation. Real HAP tests
cover advertised TLV values and restored-service replacement, correcting the
old numeric audio-enum mock. Existing generation retirement, private pipes,
backoff, queue and diagnostic controls remain owned by their current modules.

Release evidence belongs in logs/rc7-release-2026-10-11. Issue #52 remains open
until installed Home video/audio, STOP/reopen and manual refresh are verified.
Operator owns installation and a new exact-runtime observation window. A failed
AAC-ELD probe must not silently advertise unsupported capability or relabel
Opus payloads as AAC-ELD; retain the guard and investigate installation evidence.

## RC.8 IMMIS vendor trust correction — 11 October 2026

RC.7 physical acceptance failed upstream TLS despite corrected AAC-ELD/Opus
advertisement. A current strict handshake establishes missing vendor trust anchors:
Node defaults reject the self-signed Blink peer; official APK anchors authenticate
the identical peer with mandatory hostname/chain verification. Scoped repair and
source provenance are recorded in
[the trust audit](../audits/2026-10-11-immis-tls-trust.md).

This extends WI-05 IMMIS provider feasibility, preserves destination/lifecycle
guards and adds bounded reason diagnostics. It does not close F05/F06, satisfy
native-worker/five-target gates or close #52 without installed physical acceptance.
A fresh reviewed RC and operator installation restart observation.

## RC.9 media liveness repair — 12 October 2026

RC.8 physical acceptance failed: Corner authenticated without useful media during Home tests; Front door briefly rendered then hit the consumer budget. Both failures were confirmed by the operator. Findings and unchanged-runtime timing remain in `logs/rc8-2026-10-12-acceptance/analysis.md`.

The consumer boundary continued writing after `Writable.write` returned false, so normal bursts could consume the entire child queue. RC.9 pauses the upstream readable and frame parser, retains already delivered frames under the existing 2 MiB input cap, and resumes only after actual drain. The 1 MiB child cap, two-second drain deadline, frame deadline, independent recorder quotas and STOP/replacement ownership remain in force.

Official Android startup sends an immediate keep-alive. Its presentation statistics are omitted when no rendered counts exist; the plugin previously sent fabricated zero statistics. RC.9 follows the immediate keep-alive and omits unsupported presentation reporting. Official command polling begins with an immediate GET and uses `polling_interval`; `continue_interval` is the Continue-button interval. The existing single-request, generation-fenced polling owner is corrected without treating command completion as proof that media ended.

Metadata-only, in-memory diagnostics on the installed RC.8 demonstrated Corner source media through its unchanged parser: native-style startup with provider15-second polling sustained9.27MiB over49.6seconds. A final immediate-GET probe validates the combined scheduling contract. These probes use normal bounded vendor liveview/cleanup commands, no host installation/configuration changes, no credential storage writes, and no media retention. They do not identify a single exclusively causal Corner divergence or establish physical Home playback.

Focused regressions cover coalesced-frame pacing, unchanged overflow/drain bounds, consumer replacement, stale drain after STOP, immediate authenticated keep-alive without fabricated stats, immediate/serialized polling and actual polling interval selection. Full project and CI gates plus independent review precede publication. F05/F06 and issue52 remain open. Rollback uses a verified artifact or disables streaming; TLS/private transport/resource guards stay enabled.

## RC.10 startup analysis and momentary snapshot repair — 12 October 2026

Installed RC.9 authenticated Corner and decoded H.264 SPS/PPS/IDR, but never
completed FFmpeg input analysis before Home stopped the attempts. Front door
produced sustained video/audio confirmed by the operator, and reopened video.
Corner manual refresh succeeded, but Home retained On until explicitly reset.
Evidence remains in `logs/rc9-2026-10-12-acceptance/analysis.md`.

Pinned Homebridge FFmpeg 7.0.2 defaults to five seconds of media analysis, with
additional MPEG-TS heuristics when information is incomplete. A short H.264 plus
two-AAC burst reproduced the stall with stdin kept open. A one-second analysis
budget completed on identical bytes; RC.10 applies it only to IMMIS input while
preserving the normal byte probe budget, retained initial keyframe, transport
limits and generation-owned shutdown. This is a media-timestamp budget, not a
wall-clock startup deadline. Sparse-source timestamp contributions remain unknown.

HAP commits the submitted switch value after its asynchronous setter resolves.
The previous Off notification preceded that commit and was overwritten. The
existing snapshot owner now sends Off on the next event-loop turn, after the
commit; no UI delay, parallel capture owner or polling coordinator is introduced.
Actual installed HAP write-path tests cover success, failure and Off writes.

Open-pipe RTP regressions cover short three-stream bursts, fragmentation and
video-only input alongside existing codec/packaging cases. Physical Corner
video/audio and automatic Home reset require operator installation. A runtime
correction resets RC observation; F05/F06 and #52 remain open. Rollback preserves
TLS, private transport and resource guards or disables the affected mode.

## RC.11 quality profiles — 12 October 2026

Authorized scope: global output auto/720p15/360p15/1080p30, camera-only input
policy preserving first observed source by default, and actual 2K conversion.
Context is RC.10 physical video/audio with operator-reported stutter; CPU samples
are not proof of the stutter cause. ADR-006 records source/output authority,
persistent vendor-setting consequences, observation and rollback.

Delivery uses medium-feature-change (medium operational risk): context and
acceptance → design → compact plan → implementation → testing → documentation
and independent review → release-change. Security/operations covers bounded
source metadata, authenticated settings and cancellation; coordination covers
GitHub/CI/npm receipts. Retrospective is deferred until installed quality outcome.

Acceptance: default output capability unchanged; fixed profiles are advertised
and negotiated exactly; input settings remain camera-only; auto never writes;
first vendor/input observations survive cache reuse; explicit writes respect
restrictions and confirmed-state/no-replay semantics; STOP during configuration
cannot start media; both conventional/square 2K decode and selected outputs retain
audio/RTP/SRTP framing. Physical smoothness and real 2K-device behavior remain
operator acceptance, not synthetic claims.

Verification: implemented contracts and focused regressions pass. Full local
suite passed 939 tests (one existing skip) before review's final auto-read repair;
71 accessory regressions then pass, including hanging metadata/STOP cancellation.
24 real FFmpeg cases cover 2K/profile/audio conversion; lint/build, API contract,
49 evidence tests, 39 release-safety tests, OAuth diagnostic typing, package
loadability and zero production advisories pass. Independent review and clean CI
must accept the final release source before publication. Exact registry artifact
verification follows publication. Installation remains operator-owned.
Issue #52 and F05/F06 remain open; a fresh RC resets runtime observation.


### RC.12 configuration and diagnostic correction

RC.11 read-only acceptance evidence is in `logs/rc11-2026-10-12-acceptance/analysis.md`. All 45 runtime JavaScript files matched CI, but saved `outputQuality` was absent and observed output was 30 fps. The historical save action is unknown. A reproduced delayed-config-read race can overwrite newer schema edits; RC.12 synchronizes schema changes and guards configuration reads across auth/network/lock save paths. Native Homebridge Save remains the persistence owner. Per-camera input quality is now included in the explicit form layout.

FFmpeg info-level diagnostics replace codec debug traces. Detailed child/proxy records and error records have separate finite budgets, with a suppressed-record receipt at retirement; media processing, source observation, destination controls and cleanup bounds remain independent. Runtime receipts identify selected output profile and negotiated dimensions/frame rate. Local regressions and independent review must verify these controls before CI publication.

The operator owns installation, saved settings and restarts. Physical smoothness is unverified; no known issue or security finding is closed by reduced logging or synthetic tests. F05/F06 remain open and issue #52 requires physical acceptance. Rollback uses the last verified secure artifact or disables affected streaming; no TLS/queue/secret-handling guard is weakened.


## RC.13 frame-rate negotiation repair

RC.12's installed identity and saved 720p15 were verified, but both cameras repeatedly prepared sessions without accepted-output or encoder receipts. The strict video tuple validator rejects a same-resolution 30-fps selection before any diagnostic, vendor request or encoder launch. This path is reproduced; original Home selection is not retained, so historical attribution remains unproven. Local Home daemon logs contained no matching events.

The correction accepts known same-resolution 30-fps selections for low-frame-rate profiles and derives an actual 15-fps ceiling, following maintained Homebridge camera-ffmpeg practice. Unknown dimensions, malformed selections and unsafe media destinations remain rejected. Default quality, audio negotiation, generation ownership, resource/TLS controls and disabled talkback remain unchanged. Requested/effective FPS and finite rejection/preparation receipts provide the missing diagnosis. No host migration is necessary: settings keys and saved values retain their meaning.

Verification must cover real HAP capability TLVs, previous 30-fps selection reaching startup, actual 15-fps encoding/packaging, rejection-before-vendor and released ownership, focused/full regressions and independent review. Publication follows existing CI; operator owns installation and settings. Physical acceptance and fresh 48 hours/two natural refreshes required after installation. Issue #52 and F05/F06 remain open. Rollback uses a verified secure artifact or disables streaming; do not weaken TLS or transport bounds to recover playback.

## 18 October 2026: delegated stable-release residual-risk disposition

Andrew explicitly delegated the F05/F06 release decision in this chat: “you
decide f05/f06 and just get it done.” Acting under that delegation, the delivery
owner accepts the following residual risks for stable **0.10.0** with the media
implementation shipped in RC.14. This supersedes the earlier statements that a
stable-specific disposition is absent. It is not a finding closure, a completed
native-worker milestone, or a waiver of functional acceptance.

| Finding | Accepted residual risk | Required retained controls |
|---|---|---|
| F05 | Current FFmpeg execution exposes session secrets, including SRTP key material, in process arguments. An attacker able to inspect those arguments on the Homebridge host may obtain those secrets. | Existing diagnostic redaction, private child media transport, bounded session retirement and disabled unsupported talkback remain enabled. Do not claim argv secrecy or an OS sandbox. |
| F06 | Complete RTSP destination enforcement, including secondary/control/redirect connections, remains unproved. A malicious or compromised upstream media descriptor can create network authority beyond the intended destination boundary on affected paths. | Retain implemented IMMIS actual numeric-connect admission, verified TLS/vendor trust, public-address restrictions, reconnect validation and separate HomeKit output validation. Do not broaden destinations or bypass TLS to recover playback. |

Rationale: accept these known, disclosed residuals for this bounded release rather
than make the unfinished cross-platform native replacement a prerequisite for
all incremental releases. The current IMMIS path has materially stronger
controls than the legacy implementation, but that does not eliminate either
finding. Local compromise and malicious upstream descriptors remain relevant
threats; acceptance is a release tradeoff, not evidence that they cannot occur.

Disposition: **F05 and F06 remain open, accepted for 0.10.0**. Their AC-07/AC-08
closure criteria and WI-05/WI-07 implementation obligations remain unchanged.
Reassess before a later stable release, any new media scheme or expanded trust
policy, a material change in exposure, or an incident involving these paths.
Release notes must disclose the residuals without claiming comprehensive
hardening. If retained controls regress, this acceptance does not apply: stop
promotion, use a verified guarded artifact or disable the affected streaming
mode rather than restore known unsafe behavior.

Independent review and ordinary source/CI/artifact gates still apply. Concrete
playback/snapshot defects remain separate acceptance decisions; elapsed time
alone does not resolve them. RC.13 authentication/transport observation may be
carried into naming-only RC.14 where the relevant implementation is unchanged;
no additional 48-hour wait is required solely because a label or RC number
changed. A material runtime correction requires targeted regression evidence and restarts
the minimum 48-hour RC window with two natural refreshes under
[the release guide](../RELEASE.md#homebridge-upgrade-and-acceptance). Operator installation remains separate.

### 19 October 2026 — command retirement and transient provider refusal

RC.15 addresses a reproduced START-before-remote-retirement race and the
Android 59.2 `Call<Unit>` completion-response contract. START waits at most four
seconds for pending remote retirement; STOP retains independent local cleanup
and five-second remote duty. One read-only GET retry handles transient 406;
POST refusals are not replayed. Retirement receipts are budgeted and secret-free.

Read-only same-endpoint probes observed both 200 JSON and 406 HTML. The provider's
internal cause remains unproven. Local tests establish bounded recovery and
cancellation, not physical repair. Issue #52 remains open pending installation
and Home acceptance. F05/F06 dispositions are unchanged. See
[the audit](../audits/2026-10-19-command-retirement.md).


### 20 October 2026 — IMMIS cooperative retirement and reduced conversion work

RC.15 post-outage Home testing established working Front door video/audio with
stutter and fresh manual snapshots with automatic switch reset. The reopened
stream initially authenticated and delivered media, then upstream closed three
times. No HTTP 406 was observed in that bounded test. The provider's internal
reason remains unproven; these failures are not attributed to Google or Wi-Fi.

RC.16 delivery checklist:

- [x] Approved A Team roster initialized and independently reviewed; pinned
  upstream files remain outside the published package.
- [x] Measure and reproduce late frame-rate reduction; select effective FPS
  before scaling while retaining negotiated geometry and output limits.
- [x] Verify native-client termination request/response, bounded cooperative
  STOP, one-way teardown without experimental audio commands, and actual closure
  before resource release. See [protocol audit](../audits/2026-10-20-immis-retirement.md).
- [x] Complete independent local code/security review, 999 passing Jest tests
  (one existing skip), lint/build/contracts and 26 synthetic media packaging cases.
- [x] Complete Node 20/22/24 CI and reviewed merge (PR #76).
- [x] Publish and verify RC.16 through CI run39475769566; release receipts in
  `logs/rc16-release-2026-10-20/`.
- [ ] Operator installs; repeat physical acceptance and attributable observation.

PR review replaced a duplicating FPS filter with drop-only source selection.
Tests cover high, low and variable input rates. A separate 60-second synthetic
video-only benchmark, with warmup and three alternating pairs on the Mac, measured
23.44% lower mean user CPU (12.451s to 9.533s). This is not Pi resource evidence
and does not establish network causation or physical smoothness.
F05/F06 and issue #52 remain open; the existing stable-specific residual-risk
record and mandatory guards remain unchanged. No Pi installation/configuration,
restart, pairing reset or experimental talkback enablement is authorized here.


### 22 October 2026 — audio offer invalidation after encoder changes

RC.17 is installed and matches its CI artifact. Operator configuration now uses
Homebrew FFmpeg 8.1.3, Automatic video output, ultrafast and Opus. The binary lacks
libfdk_aac; four Home AAC-ELD selections fail before media allocation. Real-HAP
reproduction finds that the audio TLV changes while the normal configuration
hash does not. See [the audio audit](../audits/2026-10-22-audio-capability-invalidation.md).

Delivery checklist:

- [x] Reproduce the missing configuration invalidation with real HAP.
- [x] Bind actual audio offers to public characteristic metadata and notify the
  existing HAP configuration owner; preserve identities and early codec refusal.
- [x] Complete regression, broader validation and independent reviews (PR #78).
- [x] Publish and verify RC.18 through CI run39824348095.
- [x] Operator installs; physical checks confirm actual Opus and fresh snapshots/reset.
- [ ] Full live playback/lifecycle acceptance: blocked by the separate RTP SSRC failure.

The Homebrew binary and Pi configuration stay operator-owned. No pairing reset,
codec substitution, F05/F06 closure or physical success is inferred from tests.


### 22 October 2026 — selected-executable RTP SSRC compatibility

RC.18 Home validation confirms actual Opus but fails RTP initialization because
its Homebrew binary requires unsigned SSRC arguments. The bundled executable
uses a signed option. The [SSRC audit](../audits/2026-10-22-rtp-ssrc-compatibility.md)
owns the reproduced contract, capability decision, tests and limits.

- [x] Reproduce boundary/observed failures before implementation.
- [x] Extend the existing capability owner and shared video/audio formatter;
  preserve all 32 identity bits and keep operator settings/binary unchanged.
- [x] Verify synthetic packet identities with both local muxer contracts and
  the actual unchanged Pi binary; no live installation or configuration writes.
- [ ] Complete final broad validation, independent review and CI.
- [ ] Reviewed merge and publication of unused RC.19; verify exact npm artifact.
- [ ] Operator installs and repeats physical playback/lifecycle acceptance.

F05/F06 and issue #52 remain open. Existing stable 0.10.0 residual-risk disposition
and mandatory security/cleanup limits are unchanged. No physical success or
performance improvement is inferred from synthetic output.
