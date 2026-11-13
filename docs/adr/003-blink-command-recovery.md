# ADR-003: Blink command coordination and Home connection recovery

Status: accepted and implemented; release acceptance is tracked in the hardening ledger

Date: 2026-10-02; durable ownership extended 2026-11-09

## Context

The installed 0.10.0-rc.1 log showed thumbnail capture overlapping a motion-enable
command which exhausted HTTP 409 retries. Fresh snapshots also exceeded HomeKit's
five-second slow-handler warning. Separate intermittent connect timeouts caused
failed polls and recovery attempts; historical network root cause is unknown.

## Decision

Extend the existing account-wide coordinator to network, motion, quality,
thumbnail, Live View and native-storage operations. Normally persist an intent
before dispatch and the accepted command identity before observing completion. Bound
local exclusion while retaining uncertain outcomes as recovery evidence. Status reads and
JPEG downloads remain outside it. Retain 300 ms spacing and bounded conflict
retries. Reconcile motion conflicts against matching fresh device/network/type
and requested enabled state. An explicit resolved/value result supports void
operations without confusing success with missing reconciliation.

Ordinary command execution has a bounded local budget of at most 60 seconds.
HomeKit callers wait at most 12 seconds. Pending expired mutations are not sent;
started work may complete later and update confirmed state. No automatic POST
replay follows ambiguous transport failure. Safe homescreen polling gets one
transient transport retry within 25 seconds. Existing HTTP response retry policy
remains in force for eligible reads; owned mutation POSTs use one HTTP attempt.

Failures before HTTP dispatch release their reservation. This includes local
request preparation and the exact Undici `UND_ERR_CONNECT_TIMEOUT` error on the
fetch error or its immediate cause: connection establishment failed, leaving no
potentially accepted mutation on that attempt. This does not automatically replay the
POST. Other transport failures, including socket resets and response timeouts,
remain ambiguous and retain recovery evidence. The distinction follows the
[Undici connection-timeout contract](https://github.com/nodejs/undici/blob/v8.12.2/docs/docs/api/Errors.md#timeout-related-errors),
verified against the affected Pi's bundled Undici 8.12.2.

Local timeout, abort, restart, a refused status GET or malformed completion does
not establish that a dispatched mutation ended. The shared private account state
retains ordinary-command, Live View and per-module storage evidence. Local
exclusion lasts at most 120 seconds, or the earlier action/job deadline. The
deadline is fixed at allocation and is never renewed by polling, retry, restart
or client rotation. Healthy Live View sessions also retain that original cap;
successful keepalives do not renew it. At expiry, the old work is abandoned
locally with its outcome still unknown; fresh distinct actions may proceed. Blink may reject
those actions with a bounded conflict response. Expiry never declares remote
success, sends a guessed cleanup command, or automatically replays the old POST.
Ordinary commands have a persisted total 60-read observation budget; startup reconciliation
can make one remaining-budget GET for an existing command ID and never resends
the POST. Native-storage's separate 30-read budget and official parent/child
workflow are specified in [ADR-007](007-event-driven-native-recording.md).

Legacy owners without an expiry are immediately advisory on load; repeatedly
restarting cannot grant them a fresh exclusion period. Migration preserves their
uncertain identity and does not claim provider completion. In-process queue
slots and writer handoff also have finite budgets. Late responses remain bound
to their original reservation and cannot replace a newer owner or deliver stale
media. A failed recording journal degrades recording rather than permanently
vetoing account controls. Controls then use warned in-memory ownership; a process
loss during that fault may lose the unpersisted command history. Successful
persistence resumes the canonical journal. Arm/disarm failure logs include the safe local reason
without printing provider error messages.

SDK operations capture account and writer generation through one authority guard,
with a reservation when the workflow owns one. New work must also match the
active journal writer's account, client and tier; late old-operation evidence may
still be saved through its matching writer. Check that captured authority
before dispatch and after awaited work before publishing state or success;
the shared account queue also checks captured account authority before returning
a result, and terminal owner clears require the original revision. Request budgets
and request-local transport proof remain separate from operation acknowledgment.
Native requests carry captured writer, reservation and fence authority through
authentication to HTTP dispatch; reads and owned file promotion recheck it too.
A journal fault clears only after the latest required snapshot for the current
writer is saved, rather than after an older physical write completes.

Auth token capture builds and persists a candidate before publishing live tokens
and identity together. Failed saves never expose the candidate or roll back later
SDK metadata updates. Of metadata updates received while a candidate save is
pending, token-supplied fields win when that candidate is published; those
concurrent updates fill only token-omitted fields. A hosted new-account boundary
clears old-session metadata. After publication, fresh authenticated REST discovery
remains an identity source under the committed-session checks below. This does
not establish permanent precedence for optional legacy OAuth metadata over REST
discovery. Metadata setters retain their existing immediate behavior and explicit
queued persistence contract.

Auth is the sole owner of account and client identity; SDK requests do not keep
separate ID caches or write cached IDs back into auth. After authentication,
requests derive routing from committed auth and validate embedded account/client
IDs before dispatch. Metadata reads retain a committed credential revision from
their actual dispatch; delayed success or failure cannot overwrite a newer
session through metadata publication or fallback.
Production-bootstrap probes keep an explicit request-scoped tier override.

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
concurrent camera behavior and exact registry installation require release-scoped
evidence. Local tests do not close physical acceptance gates. Follow the
[release guide](../RELEASE.md#homebridge-upgrade-and-acceptance) and record current
results in the [hardening ledger](../plans/security-hardening.md).
