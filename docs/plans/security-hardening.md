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
