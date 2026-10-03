# Security hardening delivery ledger

Source baseline: `fb96b9b33921e39d825f1be8636705e8a9839d20`.
Scan: `247931cc-e452-4dff-bfec-5054e0481242` (sealed).
Manifest SHA-256: `0c970d21f83f14912e1e7c6dd343ba3b79419aa3c4b99c0c9b241e8bb033c144`.
Approved design: scan supplemental `hardening/hardening.md`, artifact
`a531f35a81c4ac522960f23f6b95f1ecab85e75280fe513c00f5e1968145c363`.

Implementation branch: `codex/security-hardening`, existing checkout. No new worktree.
Implementation and review assignments remain unassigned for ongoing maintenance.
Maintainer owns architecture/release decisions; operator owns physical acceptance.

## Delivery checklist

- [x] Refresh baseline and preserve unrelated work (WI-01).
- [x] Implement local bounded-input, session, private-IMMIS and diagnostic candidates (WI-02/03/04/06).
- [x] Independent local review and verification receipt (WI-09 local slice).
- [ ] Revised media-network design approved (WI-05 gate failed).
- [ ] Native worker and five-target distribution (WI-07/08 blocked by WI-05).
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
WI-07 stops as prescribed. No unconstrained worker or hostname-only substitution.
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
| AC-07 | Observe every actual destination including redirects/reconnect/secondary RTSP | blocked: revised architecture required |
| AC-08 | Dummy secrets absent from argv/env/logs/errors/crash output | blocked: secure worker not implemented |
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
runtime corrections restart RC observation. No commit, publication, installation,
host mutation, or new issue is authorized by this implementation request.

Rollback preserves security guards. Disable affected streaming when migration/media
fails; never silently restore unauthenticated TCP or known secret exposure.

## Local candidate and finding ledger

Source identity is the baseline revision plus uncommitted changes; no new revision,
release or published artifact exists. Production-source digests and exact checks are
recorded in `../audits/security-hardening-local-verification.json`.

| Finding | Local control | Evidence / independent review | Residual / release disposition |
|---|---|---|---|
| F01 | IMMIS TCP listener removed; child stdin only | proxy tests, IMMIS review | Candidate only; live parity pending |
| F02 | bounded child queue/drain deadline | non-reading writer tests, IMMIS review | Candidate only; real encoder stress pending |
| F03 | generation owner, late cleanup, closure reservations | ownership tests, bounded review | Candidate only; physical startup/stop stress pending |
| F04 | incremental frame and retained-byte limits | malformed/fragmented frame tests, IMMIS review | Candidate only; legitimate traffic calibration pending |
| F05 | secure native worker blocked | native feasibility receipt | **Open**, SRTP argv exposure remains |
| F06 | enforceable media networking design blocked | pinned source proof, native feasibility receipt | **Open**, arbitrary upstream media destination exposure remains |
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

Final local checks: 716 Jest tests / 33 suites, 31 Python tests, 39 release-safety
Node tests; lint, build, script typecheck, contract validation and packaged plugin
loadability passed. Independent receipts found no remaining blocker in reviewed local
slices. Native feasibility and physical/release gates remain open; this is a staged
candidate, not comprehensive security resolution. See the JSON verification receipt.

## RC preparation authorization

On 2026-10-03 the maintainer authorized scoped commits, origin push, PR review/fix
rounds and fresh RC publication through existing CI when ready. This supersedes
the implementation-turn Git-action restrictions above. Host installation remains
unrequested. F05/F06 and physical/runtime acceptance remain open.
