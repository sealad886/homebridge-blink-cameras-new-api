# Architecture decisions

ADRs own durable decisions and rationale. Operator procedures belong to the
[documentation map](../README.md); current finding dispositions and release
acceptance belong to the [hardening ledger](../plans/security-hardening.md) and
[release guide](../RELEASE.md). Dated evidence in an ADR is scoped to its recorded
revision and environment.

| ADR | Decision |
| --- | --- |
| [001: Hosted authentication](001-authentication.md) | OAuth/PKCE, callback validation, token storage and routing |
| [002: Motion detection](002-motion-detection.md) | Polling and event behavior |
| [003: Command recovery](003-blink-command-recovery.md) | Coordination, response deadlines and confirmed state |
| [004: Session ownership](004-stream-session-ownership.md) | Generation ownership, cancellation and retirement |
| [005: Media network feasibility](005-secure-media-network-feasibility.md) | Destination authority, native boundary and closure gates |
| [006: Stream quality](006-stream-quality-authority.md) | Per-camera input and system-wide output authority |
