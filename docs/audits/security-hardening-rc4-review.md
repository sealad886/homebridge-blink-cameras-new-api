# RC.4 local milestone review

2026-10-03. Independent, read-only Codex context reviewed the IMMIS destination,
actual DNS admission, TLS/configuration, evidence export, native source inputs,
codec/SRTP worker, parent IPC/output prototypes and CI changes. This is a working-
tree milestone receipt, not immutable PR approval or physical acceptance. Exact
tested source hashes are in `security-hardening-rc4-local-verification.json`.

| Finding | Defect | Verified correction |
|---|---|---|
| R1 | Caller cancellation left actual resolver work unbounded | Shared eight-slot admission remains owned until the underlying lookup settles |
| R2 | Valid maximum-sized frame tail coalesced with the next frame was rejected | Incremental per-frame retention preserves the ceiling and accepts coalescence |
| R3 | Natural process closure silently dropped accepted codec output | Undrained consumers, queues, writes or protection requests mark closure as failed |
| R4 | Shared media/control write contention retired a legitimate worker, including sequential MEDIA/END | One writer owns bounded reserved control and producer slots; quotas/EOF change only after admission; STOP cancels both |

Final independent re-review returned clean for this scope. Forty-nine focused
parent/output tests passed with the actual source-built worker and published
RTP/SRTCP vectors. Native source and output hashes matched their measured receipt;
nineteen native behavioral tests and seven offline source-fetch tests passed.
The earlier IMMIS/DNS/evidence review remained clean after its correction.

R4 investigation searched local writer branches, regional consumer/protector
interactions and global lifecycle/queue owners before selecting the single writer
repair. Existing request-budget and generation/transport contracts were retained.
The evidence export fixes reservation/input ownership rather than raising quotas.

The complete local plugin run passed 834 tests in 38 suites. Lint, TypeScript build,
diagnostic script type checking, 46 evidence tests, 39 release-safety tests and the
347-endpoint/677-model API contract passed. Hosted CI and immutable PR review
remain release gates. The native CI matrix establishes only its tested prototype
hosts after successful execution; no five-target acceptance is inferred.

F05 and F06 remain open in the staged runtime. Native code is not enabled or
distributed as an npm executable. Runtime integration, complete RTSP enforcement,
AAC-ELD, provider calibration, source/license distribution, five-target clean-host
launch, matched performance, physical parity and observation remain explicit gates.
Process separation and own-process core limits do not establish an OS sandbox or
control privileged/external crash collectors.
