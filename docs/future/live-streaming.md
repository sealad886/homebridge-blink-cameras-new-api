# Historical live-streaming proposal

This proposal preceded the implemented HomeKit streaming path. It is retained
as a navigation record rather than an implementation recipe: its speculative
endpoint, FFmpeg command, architecture alternatives and estimates have been
superseded.

- [Streaming configuration and troubleshooting](../streaming.md) owns current
  user-facing behavior, requirements and limitations.
- [ADR-004](../adr/004-stream-session-ownership.md) owns session lifecycle and
  private child transport decisions.
- [ADR-005](../adr/005-secure-media-network-feasibility.md) owns the media network
  boundary and remaining enforcement requirements.
- [ADR-006](../adr/006-stream-quality-authority.md) owns source/output quality
  authority and negotiation decisions.
- [Static API contract](../api-contract/README.md) owns recovered vendor
  interface metadata; static declarations do not prove live behavior.
- [Security-hardening ledger](../plans/security-hardening.md) owns finding
  dispositions and acceptance evidence, including unresolved F05/F06.

See the [documentation map](../README.md) for other canonical owners. Git
history retains the original speculative implementation recipe.
