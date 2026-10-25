# Secure media runtime implementation

Status: implementation in progress; beta publication blocked.

## Scope and authority

The maintainer authorized implementing accepted ADR-005, then publishing the next
beta through CI only after F05 and F06 are verified. Issue #48 closes only after
its immutable npm/GitHub release criteria are verified. No residual-risk waiver,
host installation, pairing, restart or new worktree is authorized.

This is a medium, high-risk implementation route. Existing requirements,
ADR-003/004/005 and the security plan remain canonical. Project Delivery routes
implementation → testing/quality → documentation → independent code/security
review, then release-change after the publication gates pass. Coordination owns
issue/PR evidence. Physical operator acceptance follows registry publication as
ADR-005 specifies; it cannot be claimed from synthetic tests.

## Required invariants

- Codec worker calls pinned libraries, receives only private framed pipes, has no
  network protocols, and never puts secrets in argv, environment, configuration
  files, logs or supported crash output (F05 / AC08).
- Parent authorizes every actual numeric vendor connection, preserves verified
  TLS identity, and denies unapproved redirects, control/SDP authorities and
  secondary transports before a connection/datagram attempt (F06 / AC07).
- Parent owns bounded HomeKit RTP/RTCP output and generation retirement; STOP
  remains independent of stalled media and no unrestricted CLI fallback remains.
- Required codec, geometry, cadence and lifecycle contracts remain explicit.
  The owner approved advertising Opus, PCMA and PCMU only on 25 October 2026;
  AAC-ELD is removed from the secure runtime contract because the pinned build
  cannot encode it. Never substitute AAC-LC under an AAC-ELD declaration.
- Five target workers, license/corresponding source, exact package integrity and
  clean-target tests precede runtime cutover/publication. Prototype evidence is
  insufficient. Real provider endpoints must follow checked provider evidence.

## Dependency-ordered checklist

- [x] Reconcile current runtime, native prototype, provider and packaging gaps.
- [ ] Implement and verify bounded codec/transport/output primitives (active).
- [ ] Integrate the secure worker into camera generations and remove unsafe media
      CLI paths, preserving snapshots/recording and command coordination.
- [ ] Build and verify all five packaged native targets, corresponding sources,
      licensing, executable identity and exact tarball load/codec/security gates.
- [ ] Complete integrated secret-surface, forbidden-connection, receiver,
      cancellation/stress/resource tests and independent reviews; close F05/F06
      only with direct evidence against the release tree.
- [ ] Run PR bot-fix loop, merge a clean reviewed head, publish through existing
      main-only CI, verify npm/GitHub provenance/integrity/tags, then close #48
      and clean only reconciled task-owned branches/artifacts.

## Implementation slices and tests

1. Native codec/protocol (`native/worker.c`, `native/audio.inc`, native tests):
   input geometry bounds, aspect-preserving output, actual frame cadence,
   negotiated H264/Opus settings and media consumption credits. Jointly update
   `src/accessories/media-worker.ts` and its tests when protocol changes land.
   Use pinned local libraries; RED/GREEN regression tests before behavior edits.
2. Owned RTSP (`src/accessories/rtsp-*`, destination policy and tests): compare
   owned TLS/TCP interleaving to supported connector modification. Official client
   evidence indicates MPEG-TS inside interleaved RTP, avoiding a parallel demuxer.
   Synthetic fixtures establish enforcement, not provider destination authority.
3. LAN output (`src/accessories/media-output.ts`, tests): add audio RTP clocks and
   packetization to existing H264/protection/sender primitives, then generation
   sockets, common A/V timeline, reports, pacing and bounded teardown.
4. Runtime and packaging: central target resolver validates shipped workers;
   camera-source owns the existing generation/command lifecycle. Extend canonical
   dependency recipe and test/publish/package scripts, with immutable receipts
   and corresponding sources. Never add ambient executable/download fallback.

Each slice must pass focused behavioral tests and type/lint checks, followed by
independent review. Conventional commits record coherent verified milestones.
Do not commit another agent's unfinished slice. Integration waits on its actual
dependencies, not on a passing isolated prototype.

## Current evidence gaps and disposition

- Linux arm64, macOS x64 and Windows production workers have no build acceptance;
  Linux libc/Windows baseline and macOS minimum-OS execution need explicit proof.
- Windows crash/process-surface evidence is absent; error-mode flags alone do not
  establish the bounded secrecy claim.
- Actual provider RTSPS authority/port/auth captures are absent. The official
  client establishes protocol capabilities, including default secure port 332,
  but does not by itself prove every production endpoint.
- Source jitter/reconnect/long-duration and performance acceptance remain open.
- All of these remain release blockers until resolved. The current beta version
  is preparation only; re-evaluate cumulative SemVer before publication.
