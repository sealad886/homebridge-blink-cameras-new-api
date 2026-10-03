# Independent IMMIS hardening review

Date: 2026-10-03. Scope: current working-tree `src/blink-api/immis-proxy.ts`, its focused tests, and the camera-source readiness/consumer integration. Reviewer did not author the IMMIS implementation. No production edits made during this review.

## Result

No remaining blocker found in the reviewed IMMIS transport slice. The earlier readiness regression is corrected: attachment and connection both require `isCommandReady`; readiness rejection fails closed. Focused regressions prove pending readiness makes no TLS connection, resolution permits connection, rejection stops the proxy, and resolution after stop makes no connection.

## Verified boundaries

- No TCP listener or public consumer socket remains: startup exposes `pipe:0`, and only an explicitly attached Writable receives media.
- Declared IMMIS payloads above 1 MiB fail before payload accumulation; retained receive input above 2 MiB fails before concatenation. Fragmented headers and coalesced frames are supported. Incomplete retained input has a five-second deadline.
- Child and upstream writer queues are checked before writes against 1 MiB; a failed write arms one two-second drain timer per writer. Drain/close/detach/stop remove that timer. Recorder uses a separate 256 KiB queue and stops independently of live transport.
- Socket close clears framing state, its incomplete timer, and keepalive interval before scheduling one reconnect. Reconnect requires a running proxy and attached consumer. Stop clears reconnect, idle, framing, audio, and blocked-writer resources; stale socket data is rejected by socket identity. `whenClosed` waits for pending recording startup and actual TLS/file close events rather than treating destroy as confirmed closure. Late recording startup is closed after cancellation.
- Recordings use exclusive owner-only file creation, hashed serials, collision-resistant filenames, directory identity checks, and symlink rejection. Each capture is limited to 64 MiB/five minutes; serialized admission reserves 64 MiB per active recorder against a 256 MiB retained-byte budget. Existing captures are preserved when admission fails.
- Callback/logger exceptions are contained. Input client IDs are canonical uint32 values before TLS setup.

## Evidence and limits

Ran `npx jest __tests__/blink-api/immis-proxy.test.ts --runInBand --silent`: 36/36 tests passed on final proxy rerun. Opened complete proxy source and focused tests; inspected camera-source creation of `waitForReady` and subsequent `attachConsumer(ffmpeg.stdin)`.

Current tests prove framing, writer stalls/recovery, private consumer replacement, TLS default, filesystem identity defenses, aggregate recorder admission, and duration stopping. Final tests also cover command readiness and stop-before-late-readiness, TLS closure delayed beyond destroy, and cancellation during recording startup. A combined proxy/accessory rerun before the added late-readiness regression passed 95/95 tests. Camera-source inspection confirms transport closure keeps retirement ownership reserved until confirmed close; parent owns its additional targeted retirement integration test.

No physical Blink, Pi memory plateau, live FFmpeg pipe, or codec acceptance was performed. The 256 MiB recording limit bounds retained file contents, not file count/inode overhead; repeated empty recordings remain a bounded-scope follow-up consideration. Reconnect destination policy remains the separately documented AC-07 feasibility boundary and is not certified by this local transport review.


## Fixed-cardinality diagnostics

Inspected `network-diagnostics.ts` and proxy/camera call sites. Counters use exactly seven compile-time reason categories (overflow, destination rejection, cancellation, cleanup timeout, recorder refusal, worker failure, migration failure), saturate at the maximum safe integer, and return a copied snapshot. No provider identifiers, capability URLs, filenames, or arbitrary error messages become metric labels. This confirms bounded cardinality in the implemented in-process diagnostics; it does not certify external observability integrations.

## Parent integration evidence

Parent ran seven generation-ownership regressions successfully, including
`retains ports and session identity until private transport confirms closure` and
`STOP during private proxy startup adopts late resources without spawning media`.
Final full local Jest run passed 716 tests across 33 suites. These tests use controlled
child/proxy interfaces and do not establish physical resource or media acceptance.
