# Login, token persistence, and diagnostic errors — 2026-09-15

## Outcome and scope

Audit baseline: `0b87f3b`, package `0.9.1`, local branch
`codex/auth-diagnostics-audit`, Node `24.15.0`, installed
`@homebridge/plugin-ui-utils` `2.1.2`. Existing untracked editor files and existing
worktrees were preserved. This report describes local changes, not a released or
installed version.

Reviewed hosted login, retained legacy login, PKCE and callback handling, token
response validation, saved-state trust, refresh, logout, UI status, REST and
thumbnail credential destinations, and normal/debug error output. Reviewed all
source logging families and historical local logs. Used synthetic credentials
and responses for reproductions. No owner credentials, live sign-in, physical
camera session, Pi deployment, or token revocation was performed.

Acceptance: prevent stale credential resurrection/account overwrite; reject
invalid persisted state; distinguish provider rejection from transient failure;
keep credentials out of diagnostics; preserve actionable normal-mode errors;
bound network operations; verify changes with behavioral tests and independent
review. The installed delivery profiles do not contain a local audit-and-fix
profile: review-only profiles forbid edits, and the full feature profile assumes
release work. Applied the minimum route: independent review and security
assessment, reproduced findings, bounded implementation, quality checks,
documentation, and independent re-review. Release execution is outside scope.

## Findings and remediation evidence

| ID | Severity | Finding and evidence | Remediation / proof surface | Disposition |
|---|---|---|---|---|
| F1 | High | Delayed hosted completion persisted credentials after `clear()` returned. Synthetic service reproduction observed file absent after clear, then restored and reported authenticated. | Serialize service operations per storage root; logout waits for preceding completion/refresh/verification. Nine race/rejection cases in `hosted-auth-service.test.ts`. | Fixed locally |
| F2 | High | Separate retained runtime could overwrite new-account state or recreate cleared state. Two-instance reproduction overwrote B with A; first-login race also existed when no token file was present. | Short cross-process file lock, compare-before-write, persistent logout generation, preflight stale-state rejection, and explicit replacement guarded by the same baseline. `auth-storage.test.ts` includes a real separate Node process; auth regression holds first legacy login across logout. | Fixed locally |
| F3 | Medium | Runtime accepted numeric access token, object refresh token/tier, arbitrary profile, and invalid metadata; UI validator differed. | One shared runtime validator. Unsupported Amazon profile now rejects explicitly instead of silently using iOS. Table-driven auth/UI tests. | Fixed locally |
| F4 | Medium | Damaged JSON blocked new hosted sign-in; initial recovery implementation also missed invalid legacy files. | Preserve exact invalid contents in owner-only JSON-string backup; authenticate replacement only against unchanged source/generation. Primary and legacy recovery tests; unsafe files still rejected. | Fixed locally |
| F5 | Medium | 503 during proactive refresh produced “sign-in expired” while current access token remained valid. | Separate temporary, response, storage, and revoked-grant categories; bounded retry; use still-valid token only after temporary proactive failure. UI advises retry/storage repair/restart as appropriate. | Fixed locally |
| F6 | Medium | Concurrent legacy logins mixed PKCE transactions; first exchange used second request's verifier. Concurrent 2FA shared the same mutable session. | Single-flight login and 2FA completion; login joins active completion; internal automatic 2FA avoids recursive waiting. Auth concurrency regressions. | Fixed locally |
| F7 | High | HTTP debug bodies exposed IMMIS/RTSP paths/client IDs, HTTPS thumbnail paths, and liveview tokens. | Shared capability URL/text and resource-field redaction; normal/debug sentinel tests in `http.test.ts`. | Fixed locally |
| F8 | High | Native fetch/JSON/body-read failures could expose response fragments or nested causes through normal error logging. | Safe typed REST/auth/thumbnail failures without raw body/cause; both log modes tested. | Fixed locally |
| F9 | High | Token POSTs default-followed redirects, replaying refresh tokens or authorization code plus verifier. REST custom `TOKEN-AUTH` also survived cross-origin redirects. Reviewer reproduced 307 forwarding with two localhost servers and synthetic data. | Reject redirects on token and REST requests; retain explicit manual OAuth navigation. Request-policy regressions. | Fixed locally |
| F10 | High | Thumbnail fetch attached bearer headers to arbitrary absolute or protocol-relative URLs. | HTTPS regional Blink REST host policy, no userinfo/nonstandard port, no redirects; six hostile destinations and allowed relative resource tested. Stale-session failures cannot fall through to thumbnail bearer fetch. | Fixed locally |
| F11 | Medium | Stalled auth requests held transition queues; discarded retry bodies retained resources. Debug-disabled requests still formatted diagnostic arguments. | 30-second network/body deadline, discarded-body cancellation, debug guards. Timeout/queue recovery and cancellation tests. | Fixed locally |
| F12 | Medium | Expected command 404s emitted error banners; real camera/IMMIS failures used only debug level; UI warnings existed only as page events. | Expected-status suppression only at command update/done; unexpected errors stay visible; camera error callback and redacted UI console warnings/errors. HTTP, accessory, and UI tests. | Fixed locally |

Each patch extends the existing owner. The storage lock/generation exists because
atomic rename alone failed the demonstrated cross-process logout invariant; it
does not introduce a new token schema or encryption claim. Roll back code only
after stopping UI and child bridge; rolling back to older code removes these
logout protections. Do not restore old credential files as a generic rollback.

## Evidence index

| Surface | Files / relevant checks |
|---|---|
| Hosted callback authenticity | `src/blink-api/hosted-oauth.ts`, `oauth-pkce.ts`, `oauth-profile.ts`; callback/state/expiry/replay tests |
| Login, refresh, response parsing | `src/blink-api/auth.ts`; `__tests__/blink-api/auth.test.ts`, `auth-hosted.test.ts` |
| File trust and concurrent writes | `auth-state.ts`, `auth-storage.ts`, `auth-storage-lock.ts`, `secure-json-file.ts`; storage and secure-file suites |
| UI lifecycle and status | `src/homebridge-ui/{hosted-auth-service,auth-state,server}.ts`, `public/index.html`; service/UI/schema suites |
| REST, error output, retry handling | `src/blink-api/{http,client,redaction}.ts`; HTTP/client suites |
| Camera, thumbnail, proxy diagnostics | `src/accessories/{camera-source,motion-base}.ts`, `src/blink-api/immis-proxy.ts`; accessory/proxy suites |
| Higher-level logs | `src/platform.ts`, accessory network/motion handlers; errors reach these from the sanitized boundaries |
| Contracts | `README.md`, `docs/debug_logging_spec.md`, existing authentication ADR and API dossier |

Codanna `0.16.0` confirmed the target checkout and 53 indexed files; source was
read to verify consequential claims. No Graphify rebuild was needed. Optional
`systematic-debugging` and `verification-before-completion` skill files were not
installed; direct reproduction and fresh verification supplied those controls.

## Normal/debug error inventory

| Family | Normal mode | Additional debug output / interpretation |
|---|---|---|
| Configuration | Invalid paired credentials; low polling interval; unsupported two-way audio; storage errors | Debug enablement warning; no credential values |
| OAuth login | Safe request failure and hosted support categories; verification required; invalid state | Correlation IDs, step, elapsed time, redacted request fields, token timing; no HTML/cookies/token bodies |
| Refresh | Distinguishes temporary outage, invalid response, persistence failure, revoked grant | Retry attempts and expiry timing; 429/5xx/transport retries are bounded |
| REST | Unexpected HTTP statuses; safe transport/JSON failure; discovery/polling/operation failures | Request/response diagnostics with redaction; command update/done 404 is expected |
| Hosted UI | Safe warnings/errors also reach process console | Events retained; stored presence returns `verified: false` until service verification |
| Camera/IMMIS | Snapshot, stream startup, encoder/process, proxy, recording failures reach error logger | Routine packet/session traces and redacted FFmpeg stderr remain debug |
| Motion polling | REST failures report at HTTP boundary; higher-level motion handling remains debug | Counts/device events help diagnose polling without dumping payloads |

Historical files were inspected without printing raw content:

| Local file | Lines | HTTP error counts | Other observed families |
|---|---:|---|---|
| `homebridge.log` | 2,748 | 401 ×3; 404 ×4 | FFmpeg exits/invalid arguments; connection reset/refusal |
| `sealad886_homebridge-blink-cameras-new-api.log` | 20,660 | 401 ×1; 404 ×2; 409 ×2 | Same families plus encoder initialization |

Literal dates are `1/4/2026`, ambiguous locale. Time windows are
14:54:29–15:03:15 and 15:00:52–15:35:33 respectively. No current fault or root cause
is inferred from these historical messages. Existing physical streaming issue
`hb-blinkcameras-9cs` remains separate from verified local error handling.

Three ignored local scripts, `scripts/debug-oauth.ts`, `debug-full-oauth.ts`, and
`debug-simple-oauth.ts`, contained raw PKCE/cookie/HTML/identifier/code output.
Those local outputs were replaced by redacted markers while retaining numeric
status/count diagnostics; duplicate `main()` invocation removed from the full
script. Mocked execution of all three produced no synthetic secret sentinel
(2/4/2 requests). They are ignored scratch files, not part of the tracked patch
or distributed package, and were not run against Blink.

## Verification

Baseline: `npm test -- --runInBand` — 19 suites, 411 tests passed.

Final checks: **21 suites / 490 tests passed** (4.794 seconds), source lint
passed, TypeScript build and UI asset copy passed, and `git diff --check` passed.
The separate-process regression initially failed because its test transpiler
omitted the project's `esModuleInterop` setting; corrected the harness and
re-ran it successfully. Tightened callback validation also exposed an obsolete
relative-URL client fixture; replaced it with the configured callback URI.
Commands:

```sh
npm test -- --runInBand
npm run lint
npm run build
git diff --check
```

Independent reviewers reproduced defects before fixes and re-examined storage,
service, auth, and logging changes. A CodeRabbit review also ran against tracked
uncommitted changes; new untracked storage files received independent local
review instead. No dependency installation, version change, commit, push,
publication, or deployment was part of these checks.

Final independent local re-review found no concrete blockers. Initial CodeRabbit
review reported three comments: full stream-host redaction and single-quoted
secret handling were fixed and verified; continuing after persistence failure
was rejected as an optional behavior change because failed storage can lose a
rotated refresh token. A second CodeRabbit pass reviewed the updated tracked patch.
The second pass identified multi-part Authorization/Cookie text values; full-line
redaction and seven focused cases now cover those tails. Independent local
re-review approved that fix and timestamp-only no-op saves (which prevent a
connection test from unnecessarily invalidating the running bridge).
The final focused CodeRabbit pass found digit/underscore-prefixed sensitive keys
could escape text redaction. The key matcher now includes them; three additional
cases verify `2fa_code` and `_token` with unquoted and quoted keys/values. All
490 tests, lint, build, and whitespace checks passed after that final source fix.

## Authenticity and remaining limits

### Release follow-up evidence (2026-09-15)

The owner authorized a complete CI-to-registry release cycle and physical Pi
acceptance. The existing scoped 0.9.1 installation returned HTTP 200 for an
authenticated homescreen request (one network, four cameras), with the token file
unchanged. This proves the baseline, not acceptance of the new release. Pi config,
auth, and accessory persistence were backed up owner-only and key files compared
successfully before any upgrade.

Beads inventory is readable by connecting to the existing project Dolt server.
Automatic startup had tried other ports despite the existing database lock.
The recovered inventory contains 14 open/in-progress records; native Dolt backup
and an all-79-record export were created before repair. Writes still require
the operator's sole-migrator decision for schema v49 to v53.

| Existing records | Evidence and release disposition |
|---|---|
| `y0o`, `2yh`, `ct1` | Hosted sign-in, verification transition, and UI/browser evidence remain physical beta gates. |
| `gq2` | Legacy npm/Travis credential revocation needs operator verification before release. Never include credentials in evidence. |
| `c91` | Current `.travis.yml` contains no deploy credential; ready for evidence-backed reconciliation when Beads writes resume. |
| `hb-blinkcameras-9cs`, `956`, `es1` | Hardware probing/fallback and negotiated frame-rate logic exist. Physical streaming and smoothness acceptance remain required. |
| `r7d` | Native Android AppAuth harness is separate from this plugin release; defer native-device work unless needed to resolve a reproduced hosted-login blocker. |
| `hb-blinkcameras-pes` | Release delivery remains open until stable CI publication, Pi installation, and observation gates finish. |
| `4wg` | Unsupported Amazon OAuth profile is now explicitly rejected with tests; no Amazon vendor integration is added. |
| `kuq`, `zqg` | Duplicate reports of ignored `enableMotion` UI control; removed that nonfunctional control while preserving saved config and actual Motion switches. |
| `02y` | Retain historical issue IDs and prefixes; no destructive normalization is needed for release. |

GitHub #17 is implemented by adapting PR #19 with contributor attribution,
operation serialization, ID-based exclusions, and current-config preservation.
GitHub #12 receives a late-download/offline race fix; physical outage/recovery
must still pass. GitHub #18 includes streaming symptoms as well as command 404s,
so logging suppression alone does not close it. GitHub #1 restart/storage/routing
acceptance remains a live gate. PR #14's minimatch update is already present in
the baseline; a fresh audit identified six other vulnerable development packages,
updated within declared ranges to reach zero reported vulnerabilities.

CI publication now requires explicit exact-version dispatch on main, gated by
Node 20/22/24 and package checks. The target is 0.10.0 because network exclusion
adds a public capability. Release stage evidence and issue state remain in Beads
and GitHub; this audit records findings and does not replace either tracker.

Final local integration checks passed 513 tests across 22 suites, 23 release
contract tests, lint, build, and npm audit (zero reported vulnerabilities).
Review also corrected legacy-cleanup commit ordering, thumbnail fallback after
authentication failure, stale network discovery controls, and registry propagation
and retry receipts. Independent review cleared those corrections. CodeRabbit's
final repeat is pending its reported rate-limit reset; prior findings are fixed,
but an unavailable review is not a clean outcome. GitHub also requires an eligible
approving review after the final push. No candidate publication or installation
has occurred, and no observation window has started.

- Hosted OAuth retains exact callback authority/path, S256 PKCE, constant-time
  state validation, transaction expiry, hardware binding, and consume-before-
  exchange replay protection. TLS plus the token endpoint and authenticated REST
  response establish server acceptance; JSON shape or local expiry alone does
  not prove token authenticity. Tokens are opaque bearer credentials; no JWT
  signature claim is made.
- Legacy callbacks now validate destination and reject duplicate code/state
  parameters; supplied state must match. Omitted state remains allowed because
  this direct server-mediated legacy flow does not send state. Its TLS and PKCE
  protections remain; no equivalent pasted-callback trust claim is made.
- File mode/owner/symlink checks and atomic guarded replacement protect local
  file use. They cannot protect against malicious code running as the same
  Homebridge user. Local files and backups are not encrypted; full-disk and
  account security remain deployment responsibilities.
- Logout prevents subsequent stale file writes and fails stale preflight closed.
  Operations already in flight, established streams, and cached images are not remotely
  revoked or purged. Restart child bridge after a session changes. Concurrent
  cross-process refreshes may make a stale process require restart; this is a
  deliberate fail-closed choice rather than silently overwriting current state.
- Crash-abandoned lock directories fail closed after five seconds. Recovery
  requires both processes stopped before removing the empty lock directory;
  documented in README. Power-loss durability beyond atomic rename is unproven.
- Fresh hosted sign-in, Blink refresh rotation behavior, and physical camera
  acceptance are now authorized but **not yet completed for the candidate**. Existing
  hosted/native-probe issues `homebridge-blinkcameras-2yh` and `-r7d` retain that
  historical boundary; this audit does not claim to close them.
- Beads reads succeeded, but issue creation was blocked: remote-backed database
  schema v49 requires four migrations to v53, and the CLI requires one designated
  migrator or adoption of another clone. No migration, remote sync, or replacement
  database was attempted. This report is the required audit artifact, not a
  replacement task tracker. Operator must resolve that migration gate before
  Beads audit issue/status writes can be recorded.
  `bd doctor` also found old hooks; `bd hooks install --force` refreshed only
  local Git hooks successfully, without migrating or syncing the database.

Residual disposition: same-UID access, opaque-token verification at the provider,
in-flight operations, fail-closed restart on session change, legacy omitted
state under PKCE, and manual orphan-lock recovery are **accepted residual risk**
as bounded implementation tradeoffs within this audit's delegated judgment.
Candidate live acceptance is **pending** and Beads status writes are **blocked**, with next actions
specified above. These dispositions do not certify a deployment or release.

## Primary references

- [OAuth security best current practice, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)
- [OAuth token and error contracts, RFC 6749](https://www.rfc-editor.org/rfc/rfc6749.html)
- [Node.js 24 AbortSignal](https://nodejs.org/docs/latest-v24.x/api/globals.html#static-method-abortsignaltimeoutdelay)
- [Undici response-body resource handling](https://github.com/nodejs/undici#garbage-collection)
- [Current blinkpy camera source](https://github.com/fronzbot/blinkpy/blob/dev/blinkpy/camera.py)

Public standards and upstream source inform the implementation; they do not
substitute for live Blink behavior or account-specific acceptance evidence.
