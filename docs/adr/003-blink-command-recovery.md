# ADR-003: Blink command coordination and Home connection recovery

Status: accepted design; implemented locally; physical acceptance pending

Date: 2026-10-02

## Context

The installed 0.10.0-rc.1 log showed thumbnail capture overlapping a motion-enable
command which exhausted HTTP 409 retries. Fresh snapshots also exceeded HomeKit's
five-second slow-handler warning. Separate intermittent connect timeouts caused
failed polls and recovery attempts; historical network root cause is unknown.

## Decision

Extend the existing account-wide coordinator to network, motion, and thumbnail
capture operations. Hold it through returned command completion. Status reads and
JPEG downloads remain outside it. Retain 300 ms spacing and bounded conflict
retries. Reconcile motion conflicts against matching fresh device/network/type
and requested enabled state. An explicit resolved/value result supports void
operations without confusing success with missing reconciliation.

Every remote command has a bounded execution budget of at most 60 seconds.
HomeKit callers wait at most 12 seconds. Pending expired mutations are not sent;
started work may complete later and update confirmed state. No automatic POST
replay follows ambiguous transport failure. Safe homescreen polling gets one
transient transport retry within 25 seconds. Existing HTTP response retry policy
remains unchanged.

The existing stable contact sensor and Retry switch own connection presentation.
The contact monitor stays active during a cloud outage, but reports disconnected
and faulted state after confirmation. Recovery preserves all accessory identities.
Apple Home owns notifications and buttons: dismissing its sensor alert leaves
automatic recovery intact; the separate Retry switch requests a shared check.
No companion application, Cancel switch, or notification service is introduced.

Persistent snapshot caching remains manual refresh. Each caller has a deadline,
but a shared refresh can finish and cache a result afterward. Capture results
separate completed capture from existing-thumbnail fallback. Current thumbnail
metadata is read after capture completion; download time is not camera exposure
time. Local operation faults remain separate from connection faults.

## Alternatives and consequences

Longer retry delays alone retain overlapping camera work. Per-network queues add
unsupported concurrency assumptions, so account-wide coordination remains.
Custom Apple Home dialogs have no supported plugin interface. A companion app
would expand scope and is excluded. Increasing HTTP abort duration does not
change Undici's separate connect timeout and is not justified by current evidence.

Coordination adds queue latency. Writes therefore expire before sending when
pending too long, and report timeout honestly when started work outlives HomeKit.
External native-app/stream activity can still conflict. One bounded unauthenticated
probe per confirmed outage improves later diagnosis without credentials, bodies,
resolved-address logs, or arbitrary destinations.

## Validation and release gates

Deterministic tests cover serialization, reconciliation, deadlines, late results,
controlled HAP failures, retry classification, recovery, identity retention,
cache policy, and diagnostic privacy. Physical Home notification delivery,
concurrent camera behavior, exact registry installation, and at least 48 hours of
RC observation with two natural token refreshes remain required. Local tests do
not close those gates. Follow docs/RELEASE.md.
