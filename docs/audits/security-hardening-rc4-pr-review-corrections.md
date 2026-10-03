# RC.4 PR #50 review corrections

The initial immutable head was `b1baadb5012ecd953c7a262e17c0c3b976765303`,
against main `2e86a455d2950411ebb17c277d90e2486d2209d1`. Review round 1
completed with CodeRabbit CLI clean, one independent Codex memory finding and
three Copilot findings. Clean CodeRabbit coverage remains tied to that historical
head; Codex and Copilot require renewed review after these corrections.

## Evidence export memory and input ownership

Independent Codex and Copilot both found that retaining the entire serialized
corpus before reservation could exhaust memory. Local sizing/writing paths,
regional Store reservation/append/expiry ownership and all reader callers were
searched. Codanna's indexed reader, reservation and write relationships supported
the same shared cause. The repair belongs in the existing Store snapshot owner,
not a separate collector or a larger quota.

`Store.read_snapshot` pins one read-only SQLite WAL transaction before yielding
a reusable streaming reader. Sizing and raw writing share its membership and
retain one serialized event at a time. `read_events` reuses this owner. Appends
can proceed; expiry between passes fails cleanly without extending retention.
The transaction closes before the existing normalizer materialization phase.
WAL retention during the raw phase remains counted by the existing Store quota.

All 49 evidence tests pass locally. The 5,000 × 16 KiB refused-export regression
requires less than 4 MiB traced sizing memory, zero staging/reserved writes and
no remaining reservation. Repeated membership, concurrent append and actual
segment-expiry cleanup tests also pass. This does not claim that the existing
normalizer's separate materialization phase has constant memory usage.

## IMMIS candidate ownership

Copilot found that validated DNS answers after the first were discarded. Local
resolution/connection callbacks, regional DNS and socket closure ownership, and
global consumers were searched using indexed symbols, callers/callees and depth-2
impact analysis. The camera's error callback retires the session, so candidate
failure must remain internal until the bounded candidate chain is exhausted.
The correction extends the existing proxy owner and retains mandatory TLS identity
verification; it does not grant authority to unvalidated destinations.

Each chain attempts at most three distinct numeric candidates, preferring another
address family after the first. Handshakes expire after five seconds, followed by
a two-second closure grace; a missing close retains cleanup ownership and permits
no replacement. Three lifetime reconnect chains use fresh DNS. The shared writer
requires the exact verified socket for authentication, control and talkback.
All 106 focused destination/proxy/session-ownership tests pass locally. DNS/TLS
sinks are synthetic; real certificate and provider connectivity remain unverified.

## Native strict build and receipt

Copilot found a license digest mismatch after whitespace normalization. The
fresh measured receipt now records the actual included notice bytes. Previous
build receipts remain explicitly historical. Linux CI also rejected eight
misleading-indentation warnings. Explicit braces and separated statements retain
the behavior and strict compiler policy. GCC 14.4.0/16.2.0 syntax checks and a
fresh Apple Clang build with all 19 behavioral tests pass. The native review
receipt records source scopes and the Codanna included-helper indexing gap.

The original local verification JSON remains a pre-commit snapshot, not proof of
the corrected head. Renewed immutable reviews, hosted Linux/macOS/Node CI and the
exact CI-built registry artifact remain publication gates. F05/F06 stay open;
native prototypes remain disabled and excluded as npm executables. No live-device
installation or physical acceptance is recorded here.

The final local correction snapshot passes all 842 Jest tests in 38 suites with
the actual source-built native vector enabled, all 49 evidence tests, lint,
TypeScript build and diff checks. Graphify's AST update passed; existing shell
module warnings and community-label drift remain tooling limitations.
