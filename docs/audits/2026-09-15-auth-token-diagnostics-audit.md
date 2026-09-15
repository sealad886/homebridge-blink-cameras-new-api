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

### Retired tracker intake

The owner retired Beads on 2026-09-15. Its recovered 14 outstanding records are
preserved below for GitHub reconciliation; historical IDs are references, not an
active tracker. A verified owner-only archive preserves the complete local state,
Git hook/config snapshots, the native database backup, and all 79 exported records.
No schema migration is required for release. GitHub issues and release PRs now own
acceptance evidence and remaining work.

| Existing records | GitHub disposition and acceptance |
|---|---|
| `y0o`, `2yh`, `ct1` | [#23](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/23), open: fresh hosted sign-in, verification, UI diagnostics, token persistence, restart and natural refresh remain physical beta gates; related restart issue [#1](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/1). |
| `gq2` | [#24](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/24), open: owner believes the old token was probably revoked, but account-side revocation remains unverified. OIDC replacement does not prove revocation. |
| `c91` | Current `.travis.yml` contains no deploy credential; source cleanup is verified. Remaining external credential disposition is consolidated into [#24](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/24), without a duplicate cleanup issue. |
| `hb-blinkcameras-9cs`, `956`, `es1` | Existing [#18](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/18), open, and release [PR #22](https://github.com/sealad886/homebridge-blink-cameras-new-api/pull/22): physical streaming, negotiated frame rate and hardware/software fallback acceptance remain outstanding. No duplicate streaming issue created. |
| `r7d` | [#25](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/25), open and deferred: native Android AppAuth investigation only if needed for a reproduced hosted-login blocker. |
| `hb-blinkcameras-pes` | [PR #22](https://github.com/sealad886/homebridge-blink-cameras-new-api/pull/22) owns current CI-to-npm release delivery, Pi installation and observation gates; no duplicate release issue created. |
| `4wg` | Unsupported Amazon OAuth state is explicitly rejected with tests in [PR #22](https://github.com/sealad886/homebridge-blink-cameras-new-api/pull/22). No Amazon vendor integration is added; no outstanding design decision remains. |
| `kuq`, `zqg` | Duplicate ignored `enableMotion` reports: [PR #22](https://github.com/sealad886/homebridge-blink-cameras-new-api/pull/22) removes the nonfunctional UI control while preserving saved config and actual Motion switches. No duplicate issues created. |
| `02y` | Obsolete after tracker retirement; IDs are preserved in the archive and this intake. No prefix-normalization work or GitHub issue is needed. |

GitHub intake was reconciled against all four existing issue records before
creating #23–#25; all three were read back as open. No GitHub issue was closed by
this migration. The retired record IDs above retain their original provenance.

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
adds a public capability. Release stage evidence and issue state belong in GitHub issues and PRs; this
audit preserves historical findings and the retired tracker intake.

### Updated release preparation evidence (2026-09-15)

Current local integration checks passed **523 Jest tests across 22 suites**,
**27 release-contract tests**, lint, build, and `git diff --check`. Independent
release/CI review cleared the changes. The owner explicitly waived the final
CodeRabbit run for this stage; that is an accepted gate waiver, not a claim that
an unavailable review passed. Live defects may trigger later review runs.

The repository now prepares npm trusted publishing through GitHub Actions OIDC,
without relying on the uncertain legacy npm token. npm account-side publisher
trust configuration is still pending private login. Legacy credential revocation
remains separately open in [#24](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/24).

The owner reported approvals for PRs #20 and #22; current GitHub state still
reports `REVIEW_REQUIRED`. Reconcile the actual platform gate before merge rather
than treating the statement as a successful merge or bypassing required review.
No candidate publication or installation has occurred, and no observation window
has started. Beads retirement is complete locally and is no longer a release gate.

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
- The retired tracker initially blocked writes on a v49-to-v53 migration gate.
  The owner subsequently authorized removing it instead. Local state was archived
  and repository integration removed; no database migration or remote sync is
  needed. Global tooling and other repositories remain outside this removal.

Residual disposition: same-UID access, opaque-token verification at the provider,
in-flight operations, fail-closed restart on session change, legacy omitted
state under PKCE, and manual orphan-lock recovery are **accepted residual risk**
as bounded implementation tradeoffs within this audit's delegated judgment.
Candidate live acceptance is **pending**, with next actions recorded in the
release PR. Tracker retirement does not waive physical or release acceptance. These dispositions do not certify a deployment or release.

## Primary references

- [OAuth security best current practice, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)
- [OAuth token and error contracts, RFC 6749](https://www.rfc-editor.org/rfc/rfc6749.html)
- [Node.js 24 AbortSignal](https://nodejs.org/docs/latest-v24.x/api/globals.html#static-method-abortsignaltimeoutdelay)
- [Undici response-body resource handling](https://github.com/nodejs/undici#garbage-collection)
- [Current blinkpy camera source](https://github.com/fronzbot/blinkpy/blob/dev/blinkpy/camera.py)

Public standards and upstream source inform the implementation; they do not
substitute for live Blink behavior or account-specific acceptance evidence.
