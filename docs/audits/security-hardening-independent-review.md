# Bounded security-hardening review receipt

Date: 2026-10-03. Branch: `codex/security-hardening`. Baseline: `fb96b9b33921e39d825f1be8636705e8a9839d20`.

## Scope and disposition

Reviewed the current local candidate for session ownership, response/input boundaries, private IMMIS transport, OAuth diagnostic transport and scripts, and offline evidence reproduction. This review is independent of the camera-source, input-boundary, diagnostic and report implementation authors. The reviewer authored the IMMIS proxy slice; its inspection here is self-review, not independent verification of that slice.

No remaining blocking defect was found in the inspected lifecycle and trusted-report paths after the corrections below. OAuth diagnostic response-limit alignment is complete: the transport uses shared `RESPONSE_BODY_LIMITS`, with 512 KiB HTML and 64 KiB JSON, token-endpoint and HTTP-error ceilings. Exact-limit and limit-plus-one tests pass for all five response classifications. This is a bounded local review, not full finding closure or release acceptance.

## Findings and readback

| Finding observed during review | Corrected candidate behavior | Disposition |
|---|---|---|
| Talkback children omitted from retirement ownership | Both talkback constructors add children to the owner and remove them only on close | Corrected; source readback |
| Capacity rejection directly released ports while leaving an owner alive | Rejection uses canonical `stopStream(sessionId, pending.owner)` | Corrected; source readback |
| A late old liveview result could retire a new owner with the same session ID | Startup cleanup passes captured owner; retirement checks owner identity | Corrected; source readback and late-completion regression |
| Child cleanup timers declared after child signalling | Timers installed before `stdin.end()` and `kill()` | Corrected; source readback |
| Detaching the proxy removed the only stdin error listener | Media and talkback children retain error handlers through closure | Corrected; source readback and late-stdin regression |
| Old child's delayed stdin error could retire software fallback | Handlers additionally check current `active.ffmpeg` or `active.talkback` identity | Corrected; source readback; exact encoder-replacement stdin race not separately exercised by this reviewer |
| Reader acquisition could leak admission counters | Reader acquired before admission counters increment | Corrected; source readback |
| JSON traversal could enqueue more nodes than its stated bound | Worklist size checked before enqueue | Corrected; source readback |

Startup callbacks have a single-completion guard. Current readiness and keepalive polling check owner cancellation and ownership; keepalive uses serial completion followed by timeout scheduling. Retirement retains reservations when child closure is unconfirmed. Private IMMIS consumes a supplied child Writable, without a local TCP listener, and applies frame, retained-input, writer and recording limits.

## OAuth diagnostics boundary

Read `scripts/oauth-diagnostic-transport.ts`, `scripts/debug-full-oauth.ts`, `scripts/debug-simple-oauth.ts`, and their transport tests. The helper validates the fixed HTTPS OAuth origin before constructing a request, rejects userinfo and alternate ports, fixes TLS verification and `agent: false`, and withholds raw transport errors. Redirects are validated before credential/cookie transmission; the exact app callback is handled locally. Original diagnostic scripts print fixed placeholders for URLs, response bodies, HTML, cookies, tokens, codes and user identifiers.

No destination-policy or raw-output bypass was found in this inspected helper and its callers. Response ceilings now match the approved limits. A synchronous `req.end()` exception can leave its bounded 15-second timer alive; this low-impact diagnostic cleanup case is deferred.

## Trusted evidence reproduction boundary

Read `scripts/pi-evidence/report.py`, its README, and `scripts/pi-evidence/tests/test_report.py`. `reproduce()` verifies the bundle's internal manifest, reads evidence as data, and invokes `_load_normalizer()` without a bundle-source argument. `_load_normalizer()` resolves the trusted installed script's sibling `normalize.py`, rejects a symlink, and imports only that installed file. Bundle `normalize.py` is provenance data; generated bundles contain no executable `reproduce.sh` entry point.

The malicious-normalizer regression replaces bundled Python with executable marker-writing code and rebuilds a self-consistent manifest. Verification and reproduction succeed through the trusted normalizer; the marker remains absent. Checksums establish internal consistency, not author authenticity. Keeping the trusted installation separate from downloaded bundles is part of this boundary. This review does not claim resistance to compromise of that trusted installation or impose a general filesystem quota on imported bundles.

## Checks executed by this reviewer

- `./node_modules/.bin/jest __tests__/stream-ownership.test.ts --runInBand`: 4 tests passed.
- `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m unittest discover -s scripts/pi-evidence/tests -p test_report.py`: 9 tests passed, including the manifest-valid malicious normalizer case.
- `./node_modules/.bin/tsc --noEmit`: passed on the inspected candidate.
- `git diff --check`: passed.
- During IMMIS implementation, its focused suite passed 31 tests and proxy ESLint passed. Those are author verification, not independent review evidence.

No physical camera/HomeKit, Raspberry Pi runtime, provider-valid traffic calibration, resource trend/latency, clean-host distribution or exact registry artifact acceptance was run by this reviewer. No deployment, publication or external mutation occurred.

## Native media and release status

The public-libav feasibility gate remains failed as recorded in `security-hardening-native-feasibility.md`. Stock pinned FFmpeg RTSP networking does not provide the required public callback interception for every connection. F05/F06 remain open; secure native worker, secondary-destination enforcement, secret-free argv/environment, five-target distribution and physical acceptance remain blocked or pending. This receipt closes none of those requirements and does not declare the plugin production-ready.

## Final bounded read-only follow-up

A separate reviewer independently inspected the latest camera retirement integration, fixed-cardinality diagnostics counters, and npm 12 package-result parsing. This reviewer authored OAuth diagnostic transport and offline report changes; their follow-up cap check is author verification, not independent review of those slices.

No blocking defect found in the inspected follow-up scope. STOP captures `whenClosed` after stopping transport, retains reservations while `localStarting`, recording startup, transport/file closure, or child closure remains unconfirmed, and releases through the captured owner. Late startup completion stops the old proxy; ownership checks prevent its callbacks from spawning media or retiring a newer generation. Exact owner identity guards retirement, with single-completion startup callbacks.

The six lifecycle tests cover duplicate admission, expiry, late remote result, confirmed child closure with late events, 100 synthetic start/stop cycles, and STOP during private proxy startup. The final test mocks proxy startup; real pending recording and TLS closure are tested separately in the proxy suite, not integrated with a physical camera in this review. Fixed counters expose seven reasons and return a detached snapshot, without retained caller metadata. Package-result parsing accepts both the prior array and npm 12 package-name keyed object while requiring one artifact and a filename.

Follow-up checks executed:

- `./node_modules/.bin/jest --runInBand __tests__/stream-ownership.test.ts __tests__/security-diagnostics.test.ts __tests__/oauth-diagnostic-transport.test.ts`: 3 suites, 22 tests passed.
- `node --check .github/scripts/verify-package.mjs`: passed.
- Evaluated the actual `packedResults` declaration with synthetic array/object results: both accepted; multiple artifacts and missing filename rejected. Full packaging was not rerun by this reviewer.

No production source edited in this review. Native worker feasibility remains failed; physical runtime and release acceptance remain unverified.
