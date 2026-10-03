# ADR-005: Require an enforceable media network boundary

Status: revised architecture accepted on 2026-10-03; implementation proof pending.

Stock FFmpeg 9.0.2 RTSP uses private connection functions for control and RTP
transport, bypassing public AVFormatContext.io_open and custom AVIOContext.
Those hooks cannot establish actual destination enforcement. The source gate
failure remains valid; see the native feasibility receipt.

The maintainer approved a private, framed standard-pipe protocol for native
configuration/control/media, with owned vendor transport feeding codec-only
processing. Start with IMMIS. Keep credentials, vendor URLs and SRTP key material
out of argv, environment, temporary configuration and diagnostics. The C11
worker must call pinned libav libraries directly, never convert configuration
into another FFmpeg command line. No codec worker URL fetches are permitted.

Upstream authority belongs to one owned transport boundary. It approves numeric
resolved addresses at every actual connect and reconnect, retains the original
TLS server name and certificate verification, and covers redirects, SDP/control
URLs and secondary media connections. Derive permitted hostname families,
schemes and ports from checked provider evidence; fixtures do not authorize
production destinations. Paired-controller LAN output has its own validated
address/port/suite contract.

For RTSP, compare owned protocol handling with a maintained supported connector
patch against pinned source and observed connection tests. Select neither until
it covers every required connection without private ABI assumptions. Stop the
RTSP cutover and return evidence to design review if neither meets that gate.
Hostname-only validation and unrestricted FFmpeg execution cannot satisfy it.

Preserve ADR-003 command coordination and ADR-004 generation ownership. Native
execution retains private framing, cancellation, callback, fallback, recorder
and closure budgets. Unsupported talkback remains disabled. Five-target native
artifacts, codec/audio parity, linked-license obligations, migration and exact
package verification precede the final runtime cutover. A prototype is source
evidence, not production integration or platform acceptance.

F05 and F06 remain open until secret-handling and actual-connection gates pass.
Process separation is not an OS sandbox. Privileged process-memory inspection
is outside the process-metadata secrecy claim. Live-device installation and
physical acceptance belong to the operator after CI publication.
