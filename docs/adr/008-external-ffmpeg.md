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

## Internal media contracts

The recording plan owns the meanings shared by inspection, conversion and
independent output validation. Times are microseconds unless a stream's rational
time base is explicitly being converted.

The plan also carries the selected input video stream index, derived from the
verified ordinary MP4 track inventory. Diagnostic allowances match that exact
index and the existing message/count grammar. Audio-first track order is valid;
layouts whose stream identity cannot be established are refused at inspection.

| Quantity | Meaning |
| --- | --- |
| `corrections.at` / `offset` | Raw input timestamp / cumulative metadata duration removed from video. |
| `originUs` | First corrected video timestamp on the common input timeline after `copyts` / `start_at_zero`. |
| `pictures[].pts`, `selected[].pts` | Corrected video timestamp relative to `originUs`. |
| `durationUs` | Corrected video end relative to `originUs`, independent of frame selection. |
| `audioOriginUs` | First decoded source audio timestamp on the common input timeline, after AAC priming/edit handling; absent if observation is disabled or unavailable. |
| Output A/V offset | Decoded audio origin minus decoded video origin, compared with the source offset; silence recovery uses its explicitly generated audio origin. |

Select frames by source-anchored time intervals. A source gap or a temporarily
slow source does not accumulate credit to exceed the selected frame rate later.
Packet duration and the gap between packets are different quantities; live
timestamp gaps remain subject to monotonicity, pacing and the session lifetime.
The live and finite paths retain their distinct discontinuity and repair rules.

Source display aspect ratio includes sample aspect ratio. Live and finite
conversion use the same bounded letterbox filter to preserve that display shape
before emitting square pixels; pre-scale source observations remain unchanged.

A pipe chunk is not a packet. Bounded queues admit a fitting prefix when a
chunk straddles a near-limit packet, preserving exact bytes, cancellation and
backpressure without raising the queue bound.

The live tee emits its metadata branch before payload branches and gives that
branch a positive one-microsecond interleave bound. Buffered metadata for prior
packets can then drain before the next payload write. Flushing output bytes alone
does not flush the muxer's packet interleaver; a small interleave bound alone also
leaves a cycle when two individually valid payloads exceed the queue together.
Sparse-audio and delayed-audio, near-limit-packet cases qualify this ordering.

Admission limits must compose through execution. Up to 512 metadata corrections
must fit the generated expression's parser depth and the actual platform-quoted
command length. Allocation estimates are not command-length limits. Keep source,
packet, retained-memory, lifetime-output and process-time budgets distinct; each
protects its named resource. Qualify the maximum admitted correction plan through
the installed helper, in addition to rejecting malformed or excessive metadata.

Prepared recording bytes remain provisional until source/snapshot cleanup and
the admission wrapper have completed. Recheck privacy ownership and the original
deadline at the public handoff, with no intervening await before transfer. Refuse
and dispose revoked output; after a valid transfer, the caller owns disposal.
Cleanup failure must erase provisional output and release its memory budget.

Boundary qualification includes source gaps/rate changes, nonzero A/V offsets
with independent decoded-content timing, maximum correction complexity through
actual launch, adversarial pipe chunk boundaries, and cancellation during final
cleanup. Source test counts do not replace the immutable installed-package
qualification or an observed FFmpeg 6.1 runtime receipt.

The bounded follow-up in [issue #120](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/120)
will distinguish disabled, unavailable and observed source audio explicitly in
the existing plan/API. No additional post-fix media failure is established by
that representation concern; it does not replace the contract corrections above.

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
