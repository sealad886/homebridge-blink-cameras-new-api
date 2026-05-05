# Auth, Streaming, and Security Audit - 2026-05-05

## Scope

Audit target: login/auth workflow, token persistence, HomeKit video transcoding
and streaming, and security-sensitive logging/configuration.

Primary paths:

- `src/blink-api/auth.ts`
- `src/blink-api/client.ts`
- `src/blink-api/http.ts`
- `src/blink-api/immis-proxy.ts`
- `src/accessories/camera-source.ts`
- `src/platform.ts`
- `src/homebridge-ui/server.ts`
- `config.schema.json`
- `README.md`
- `docs/debug_logging_spec.md`

External contracts checked:

- Homebridge/HAP-NodeJS `CameraStreamingDelegate` and `CameraControllerOptions`
  docs for stream lifecycle and `cameraStreamCount`.
- Node.js 20 TLS docs for SNI and certificate verification behavior.
- FFmpeg SRTP protocol docs for `srtp_out_suite` and `srtp_out_params`.

## Baseline Evidence

- `npm test -- --runInBand`: passed 13 suites, 74 tests before remediation.
- `npm run build`: passed before remediation.
- `npm run lint`: 0 errors, 1 warning for unused `process` in
  `src/accessories/camera-source.ts`.
- `npm audit --omit=dev --json`: blocked by npm registry audit endpoint error.
- After rebasing on the updated remote, `npm audit --json` reported dev-only
  transitive vulnerabilities in `handlebars`, `flatted`, `minimatch`,
  `picomatch`, `brace-expansion`, and `ajv`.
- Existing untracked files before work: `.vscode/`, `__tests__/.DS_Store`.

## Findings

### F1 - IMMIS TLS verification was disabled

Severity: high

Affected paths:

- `src/blink-api/immis-proxy.ts`
- `src/accessories/camera-source.ts`
- `src/platform.ts`
- `config.schema.json`

Evidence: `tls.connect()` used `rejectUnauthorized: false` for upstream IMMIS
connections. Node.js docs say SNI is not enabled by default for `tls.connect()`,
so `servername` should be set with `host`; certificate authorization should stay
enabled unless explicitly disabled.

Root cause: the proxy treated Blink IMMIS endpoints as self-signed by default.

Fix status: fixed

Remediation:

- Added `verifyImmisTls`, default `true`.
- Passed `verifyTls` into `ImmisProxyServer`.
- Set `rejectUnauthorized` from config, `servername` to the upstream host, and
  `minVersion: 'TLSv1.2'`.
- Documented the escape hatch for confirmed insecure/self-signed endpoints.

Proof:

- `npm test -- --runInBand __tests__/blink-api/immis-proxy.test.ts`
- `npm test -- --runInBand __tests__/schema-auth-ui.test.ts`

Residual risk: some real Blink IMMIS endpoints might still require disabled TLS
verification. That is now an explicit user choice instead of silent default.

### F2 - Streaming logs exposed liveview URLs and FFmpeg input secrets

Severity: high

Affected paths:

- `src/accessories/camera-source.ts`
- `docs/debug_logging_spec.md`

Evidence: stream start logs printed the full `liveviewUrl`, and FFmpeg debug
logs printed the full `-i` URL. Existing redaction only covered SRTP params.
FFmpeg SRTP docs confirm `srtp_out_params` carries key/salt material, so keeping
that redaction was also critical.

Root cause: FFmpeg argument redaction only covered SRTP key arguments and did
not classify Blink stream URLs as sensitive.

Fix status: fixed

Remediation:

- Added stream URL redaction for `immis://`, `rtsp://`, and `rtsps://`.
- Kept raw URL only in the actual FFmpeg spawn args.
- Extended debug logging spec to require liveview URL and SRTP redaction.

Proof:

- `npm test -- --runInBand __tests__/accessories.test.ts`

Residual risk: local `tcp://` proxy URLs remain visible because they are local
loopback endpoints without upstream auth material.

### F3 - Debug stream recording filenames exposed camera serials

Severity: medium

Affected paths:

- `src/blink-api/immis-proxy.ts`
- `README.md`
- `docs/debug_logging_spec.md`

Evidence: `debugStreamPath` recordings were named
`blink-stream-<serial>-<timestamp>.ts`. The recordings contain raw MPEG-TS video
and the filename exposed the physical camera serial.

Root cause: serial was reused as a human-friendly debug identifier.

Fix status: fixed

Remediation:

- Replaced raw serial filenames with a 16-character SHA-256-derived identifier.
- Created debug recording files with mode `0600`.
- Created new recording directories with mode `0700` when possible.
- Documented recording privacy behavior.

Proof:

- `npm test -- --runInBand __tests__/blink-api/immis-proxy.test.ts`

Residual risk: raw video capture remains sensitive by nature. Users still need
to choose a private `debugStreamPath`.

### F4 - Existing persisted auth files were not hardened on load

Severity: medium

Affected paths:

- `src/blink-api/auth.ts`

Evidence: new token files were saved with `0600`, but an existing primary auth
file with broader mode could be loaded without being tightened.

Root cause: permission hardening was only on save/migration, not on primary
load.

Fix status: fixed

Remediation:

- Added best-effort `chmod(0600)` after reading persisted auth state.

Proof:

- `npm test -- --runInBand __tests__/blink-api/auth.test.ts`

Residual risk: non-POSIX filesystems may not enforce Unix modes; hardening is
best-effort there.

### F5 - Stream concurrency relied only on Homebridge controller limits

Severity: medium

Affected paths:

- `src/accessories/camera-source.ts`

Evidence: `cameraStreamCount` was configured, but `startStream()` did not check
`ongoingSessions.size` before requesting a new Blink live view. The Homebridge
docs identify `CameraStreamingDelegate` as the handler of stream requests, so
the delegate should also guard resource limits.

Root cause: concurrency limit was advertised but not enforced at the delegate
boundary.

Fix status: fixed

Remediation:

- Reject new stream starts when `ongoingSessions.size >= maxStreams`.
- Release pending RTP/RTCP ports before returning an error.
- Avoid requesting Blink live view when the limit is already reached.

Proof:

- `npm test -- --runInBand __tests__/accessories.test.ts`

Residual risk: prepared-but-never-started sessions can still hold ports until
HomeKit sends stop or process restarts. No leak was reproduced in baseline.

### F6 - Dependency audit initially could not complete

Severity: medium

Affected paths:

- `package-lock.json`
- npm registry audit endpoint

Evidence: `npm audit --omit=dev --json` initially failed with an npm registry
audit endpoint error before remediation.

Fix status: not reproducible

Resolution evidence: a later rerun completed successfully and reported zero
production vulnerabilities.

### F7 - Dev dependency audit reported vulnerable transitive packages

Severity: medium

Affected paths:

- `package-lock.json`

Evidence: after rebasing on the updated remote, `npm audit --json` reported
six vulnerable transitive dev packages, including one critical advisory through
`handlebars`.

Root cause: lockfile pinned older vulnerable transitive versions allowed by
current dependency ranges.

Fix status: fixed

Remediation:

- Ran `npm audit fix` without `--force`.
- Updated only `package-lock.json`.
- Removed the reported dev dependency vulnerabilities.

Proof:

- `npm audit --json`: passed with 0 total vulnerabilities.

Residual risk: this audit fix covers npm advisories visible to the registry at
the time of the run. It does not replace Dependabot monitoring.

## Verification Ledger

Targeted commands after remediation:

- `npm test -- --runInBand __tests__/blink-api/auth.test.ts`
- `npm test -- --runInBand __tests__/blink-api/immis-proxy.test.ts`
- `npm test -- --runInBand __tests__/accessories.test.ts`
- `npm test -- --runInBand __tests__/schema-auth-ui.test.ts`
- `npx tsc --noEmit`

Final full gate:

- `npm test -- --runInBand`: passed 13 suites, 85 tests.
- `npm run build`: passed.
- `npm run lint`: passed with no warnings.
- `npm audit --omit=dev --json`: passed with 0 production vulnerabilities.
- `npm audit --json`: passed with 0 total vulnerabilities after lockfile
  remediation.
