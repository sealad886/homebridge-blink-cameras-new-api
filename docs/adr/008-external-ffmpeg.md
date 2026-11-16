# ADR-008: Require externally installed FFmpeg

Status: accepted for implementation on 16 November 2026; release qualification pending.

The maintainer requested removal of bundled FFmpeg and accepts an external
installation requirement. This supersedes ADR-005's choice to link FFmpeg
libraries into the private codec worker. Its provider authority, metadata secrecy,
parent-owned HomeKit output and generation-retirement requirements remain.

## Decision

Use an externally installed FFmpeg executable, resolved from the Homebridge
service PATH or the configured absolute `ffmpegPath`. Validate the executable's
version and capabilities when media is requested. Keep authentication, discovery,
snapshots and other non-media controls usable when FFmpeg is unavailable.

The parent owns Blink networking and feeds validated compressed bytes to FFmpeg
through private stdin. Completed MP4 clips use an already verified, read-only
regular-file descriptor so ordinary trailing-moov MP4 remains seekable. FFmpeg
receives no provider URL or credential and is restricted to the required local
descriptor/pipe protocols and explicit media formats.

For live output, tee encoded video/audio data into separate private descriptors
and pair the exact bytes with bounded framecrc metadata. Preserve signed source
PTS/DTS/duration. The parent retains pacing, packetization, destination admission
and socket ownership. Remove obsolete codec-IPC padding counters that only served
diagnostic receipts; test actual decoded audio/video alignment instead.

Retain a smaller native helper linked only to libSRTP for key-private protection
and guarded external-process launch. Its launch mode applies core/error-output
restrictions before invoking FFmpeg; its protection mode receives keys and
validated RTP/RTCP only through private IPC. A retained helper does not imply
bundled FFmpeg. Corresponding source and applicable helper/libSRTP notices remain
part of the package, with explicit rejection of FFmpeg/x264/Opus artifacts.

Finite conversion retains source identity/hash validation, bounded memory,
deadlines, one bounded salvage attempt, audio/privacy permissions and terminal
cleanup. Metadata-only samples must not become a blanket decoder-error waiver.
Independent decoded frame and audio timing tests remain release requirements.

## Alternatives and consequences

- Keeping bundled codec libraries violates the requested distribution model.
- Passing vendor URLs and SRTP keys to stock FFmpeg would weaken existing
  boundaries and is excluded from this change.
- Reimplementing SRTP in JavaScript would add unrelated cryptographic risk.
- Runtime NUT/ffprobe plumbing would preserve unused private diagnostics at the
  cost of another process and metadata parser. Raw data/framecrc probes establish
  a simpler route for the needed packet bytes and source clocks.

Operators now maintain their FFmpeg installation. Platform builds vary; version
alone is insufficient, so capability checks and actionable setup errors are
required. The current implementation requires FFmpeg 6.1 or later; development
probes used 9.0.2. Existing `ffmpegPath` values survive configuration migration.

This change invalidates codec qualification and physical acceptance from earlier
RCs. All supported targets require fresh installed-package checks using an
explicit external FFmpeg installation. Standard Homebridge installation and real
live/audio/saved-recording acceptance follow the normal release process. No
publication, installation or provider mutation is authorized by this ADR.

See the [implementation and evidence plan](../plans/2026-11-16-external-ffmpeg.md)
and [operator requirements](../streaming.md#packaged-codec-requirements).
