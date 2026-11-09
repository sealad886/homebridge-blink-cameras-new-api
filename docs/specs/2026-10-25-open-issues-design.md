# Open issue resolution design

Date: 25 October 2026. Baseline: `839f0fa` on `main`.

## Context and authority

The owner requested a complete inventory, minimal design, implementation,
milestone commits, reviewed PR integration into main, and eligible local/remote
cleanup. The initial live inventory contained no open PRs and issues #24, #25,
#48 and #54. Source, GitHub issues and the release guide are authoritative.
No package publication, host installation, restart, pairing, credential changes,
new worktree or unrelated security redesign is included.

## Requirements and dispositions

| ID / issue | Observable acceptance | Disposition |
| --- | --- | --- |
| R1 / #48 | Reads preserve latest unresolved arm/disarm intent through older completion, timeout and queue expiry. Current state remains confirmed; faults clear only on resolution or an explicit already-confirmed replacement intent. Motion reads remain confirmed. | Implement and regress locally; registry delivery and physical acceptance remain separate gates. |
| R2 / #54 | Opt-in temperature sensor for traditional camera inventory, globally default off, with explicit per-device boolean override. Convert verified Fahrenheit metadata to Celsius. Missing, invalid, offline or failed metadata never becomes a fabricated temperature. | Implement and test; actual camera/Home acceptance remains unverified. |
| R3 / #24 | Record account-side revocation evidence without credentials. | Owner explicitly confirmed personal revocation of the npmjs.org token and requested closure. Issue closed and read back on 25 October. Repository and npm-release environment secrets were empty; no new Travis account audit is claimed. |
| R4 / #25 | Start native AppAuth investigation only after reproducing a hosted OAuth exchange failure that needs it. | Trigger not established by this task. Retain deferred issue; do not launch Android work merely to close it. |

## Design

### Network intent

`NetworkAccessory.failedTarget` already represents latest unresolved intent.
Use it before confirmed state in the target getter; preserve false with nullish
coalescing. Prevent polling from publishing confirmed target over unresolved
intent. An explicit write matching confirmed state, with no commands remaining,
resolves older failed intent without another cloud request. Keep command queues,
response budgets, revision checks, current-state and motion behavior intact.

### Temperature

Reuse the existing camera config URL/authentication/request-budget owner in
`BlinkApi`. Centralize the config read shared with video quality, but keep their
decoders independent. Temperature reads only top-level `signals.temp` from
`GET v2/accounts/{account}/networks/{network}/cameras/{camera}/config`.
Recovered Android 59.2 evidence: `CameraApi.java:60-61`, `CameraConfig.java:25-28`,
`SignalStrength.java:22,78-80`, `GeneralSettingsMappersKt.java:67`, and
`DeviceSettingsGeneralViewModel.java:509-514`. The latter uses Fahrenheit-to-
Celsius conversion. Modern homescreen `CameraSignals` contains wifi/lfr;
homescreen temperature fields are not the contract for this implementation.

`CameraAccessory` owns one in-flight metadata read per enabled traditional
camera, started at discovery and subsequent existing state updates. Reads are
bounded, independent of HomeKit reads and never issue wake/calibration/quality
POSTs. Failures affect only temperature availability. No new interval or
dependency is needed. Unsupported Owl/Mini and doorbell inventories are excluded.

Create the stable named TemperatureSensor on the first valid sample; reuse a
restored sensor and keep it faulted through missing/invalid samples. Persist
service topology changes through Homebridge. Disablement removes that service
on restart. Do not persist a last sample as evidence of fresh metadata. A valid
finite Fahrenheit sample converts to Celsius within HAP's supported range;
invalid readings and offline status produce a controlled communication failure,
not zero or a clamped reading. Recovery clears the local fault.

Use existing `deviceSettingOverrides` matching (serial, ID or exact name) for
`exposeTemperature`; explicit false overrides global true. Keep UI schema,
TypeScript configuration and canonical configuration documentation aligned.

## Alternatives and tradeoffs

1. **Selected:** existing unresolved intent and config endpoint, accessory-owned
   bounded metadata read. Small changes, no added polling infrastructure, default
   cloud traffic unchanged. Opt-in adds one metadata GET per enabled camera per
   existing poll; its sample remains camera-reported and may be old.
2. Homescreen-only temperature: fewer requests, rejected because modern recovered
   homescreen evidence does not establish the required field.
3. New refresh commands, generic sensor framework or command-state rewrite:
   rejected as unnecessary cost, camera activity and complexity.

No existing stored-data format changes. No conversion or backup script is needed.
Rollback source through a reviewed revert; temperature can also be disabled in
configuration under the operator's normal save/restart procedure. Existing
mandatory media/auth guards and F05/F06 dispositions remain in their canonical
ledger.

## Verification and readiness

Behavioral regressions cover older completion, queue expiry, reconciliation,
explicit replacement, motion truth, metadata conversion, invalid/missing data,
configuration precedence, restored-service lifecycle, offline/failure recovery,
single-flight reads and no extra reads while disabled. Run focused suites, full
Jest, lint, build, applicable release/package checks and required hosted CI.
Use independent review plus configured GitHub review sources before merge.

Local checks cannot prove real camera temperature accuracy, Home display,
registry delivery, natural refresh or physical acceptance. Do not close #48's
delivery acceptance until a new immutable registry version exists. No new
version is assigned in this source-only task; feature release planning follows
the release guide before publication.
