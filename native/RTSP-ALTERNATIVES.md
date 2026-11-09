# Bounded RTSP architecture comparison

See the [native prototype overview](README.md) for scope and navigation.

The private-pipe codec prototype is an executable ingredient, not RTSP protocol parity, F05/F06 resolution or a plugin runtime artifact. Codec/SRTP parity, generation ownership, automated calibration, security and all five target package gates precede runtime cutover. ADR-005 keeps unsupported talkback disabled and assigns physical acceptance to the operator after CI publication of an exact registry version.

## Two concrete options

| Concern | Owned RTSP transport feeding codec-only processing | Maintained FFmpeg 9.0.2 connector patch |
|---|---|---|
| Existing protocol behavior | Implement or select a maintained RTSP/RTP stack; Node transport broker supplies media/packets through private IPC | Preserve FFmpeg RTSP implementation and codec flow, add a supported public connector contract to an exact pinned fork |
| Actual address authorization | Broker resolves once per connection decision, validates every numerical address, connects to selected address, checks peer identity | Hook must operate before every actual numeric socket attempt and destination change, rather than at URL parsing or AVFormatContext.io_open |
| TLS identity | Preserve original approved hostname for TLS SNI/certificate checking while transport address is pinned | Extend socket/TLS handoff without rewriting identity; current numerical URL + verifyhost workaround can suppress SNI |
| Redirect/control semantics | Explicitly parse/validate Location, Content-Base and SDP control URI resolution before requests; reject credential-bearing cross-origin propagation | Keep upstream parser/auth behavior, enforce new destinations at the connection sink and validate identity changes; connection checks alone do not validate control URI semantics |
| RTP/RTCP | Own SETUP negotiation, interleaved channel framing or UDP sockets, remote RTP/RTCP targets, packetization/depacketization and source validation | Cover FFmpeg's RTP/RTCP/UDP internals, including unconnected sendto/sendmsg destinations, not just TCP connect |
| Reconnect/tunneling | Every reconnect and optional HTTP(S) tunnel re-enters policy; unsupported transports explicitly rejected | All private URL opens, proxy/tunnel routes, DNS resolution and reconnection must share enforceable contract |
| Maintenance | New protocol surface, interoperability and timing work; can start with a narrowly approved transport subset | Smaller new RTSP logic but fork/rebase/security updates, new public API stability and complete network sink audit across each upgrade |
| Distribution/license | C11 public libav/libx264 worker remains GPL; any new maintained transport/SRTP library needs actual license/source inventory | Exact patched FFmpeg source, patch, build configuration, toolchain/dependencies and GPL corresponding-source obligations for five targets |

## Exact source-backed surfaces to cover

Pinned source evidence, not assumptions about an IO callback:

- `libavformat/rtsp.c` calls `ffurl_open_whitelist` for control TLS/TCP (`1960–1964`), RTP transport (`1566`, `1714`), and SDP/RTP sockets (`2496`). RTSP redirect handling changes URL and returns to connection setup (`2059–2074`). SDP accepts absolute control URIs (`560–582`). Whether a control URI opens a separate socket must be traced per supported protocol, not inferred solely from its hostname.
- `libavformat/tcp.c` calls `getaddrinfo` and owns resolved addresses (`168–183`). `network.c:382` defines `ff_connect_parallel`, which can race/attempt multiple candidate addresses; filtering only the selected or initial answer is incomplete.
- `tls.c:80–113` constructs underlying TCP/proxy route; inherited `http_proxy`/`no_proxy` can change networking. Worker/broker environment must be scrubbed and proxy/tunneling rejected unless explicitly modeled.
- `tls_openssl.c:801–825` checks certificate hostname/IP and conditionally sets SNI. Address pinning must preserve the original approved hostname in both certificate verification and SNI.
- `srtpproto.c:71–75` opens underlying RTP internally. HomeKit output needs separate session-bound LAN destination capability; vendor upstream policy must not inherit that capability.
- UDP/RTP transport includes datagram sends without a connected socket. A maintained connector patch therefore needs socket creation/ownership plus every destination-bearing datagram path or an independently enforcing broker, not just a function named connect.

Sources: [RTSP](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/libavformat/rtsp.c), [TCP](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/libavformat/tcp.c), [network attempts](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/libavformat/network.c), [TLS](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/libavformat/tls.c), [OpenSSL](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/libavformat/tls_openssl.c), [SRTP](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/libavformat/srtpproto.c). Stock 9.0.2 exposes no established public hook covering these surfaces. A proposed fork is a design change, not permission to depend on unstable private layouts.

## Required tests for either option

A synthetic server and controllable resolver must establish every actual numeric connection/datagram, including mixed permitted/forbidden IPv4/IPv6 answers, alternate answer retry, DNS change/reconnect, redirects, relative/absolute SDP control, server RTP/RTCP targets, tunnel/proxy attempts and cancellation at each handoff. Assert zero forbidden connection attempts, not merely an error reported after a connection. Valid TLS must preserve SNI/certificate hostname; wrong-host/untrusted certificate cases fail without bypass flags. Exercise legitimate authenticated vendor-shaped RTSP control and interleaved media before physical provider acceptance.

Owned transport must also prove SDP semantics, RTP depacketization, sequence/timestamp/wrap/reorder behavior, RTCP handling, frame boundaries, audio synchronization and credential scope. Maintained patch must prove the hook is reached at every sink, survives alternate backend/transport builds, and remains complete after every FFmpeg update. Both need bounded queues/deadlines and generation-owned STOP/late callback cleanup.

## Smallest next executable proof

Continue IMMIS first: integrate synthetic owned transport into private-pipe processing in an isolated development test, prove the remaining audio/timestamp semantics and parent-side maintained RTP/SRTP output with dummy keys passed in memory, then verify exact argv/env/error surfaces and generation retirement. Keep the current bounded H264/Opus/PCMA/PCMU prototype outside plugin runtime; AAC-ELD remains unsupported. The next RTSP decision proof is a synthetic TCP-interleaved RTSP broker resolving to a pinned numerical address while keeping original TLS hostname, rejecting redirect/SDP escapes and capturing zero forbidden attempted destinations. This limits initial transport complexity only if explicitly accepted; it does not claim UDP/talkback parity or enable them silently.

If that owned-stack proof reveals disproportionate protocol work, build a small maintained-connector-patch spike against exact FFmpeg source, with the same adversarial destination harness and no private ABI assumptions. Do not jump directly to distribution or physical installation. Evidence compares two spikes; existing worker success is not evidence that either RTSP route is complete.

## Artifact identity caveat

`local-build-receipt.json` records hashes of the actual local prototype sources/build inputs and installed pinned headers/libraries. It deliberately reports upstream FFmpeg source-commit identity as unverified: installed version/tag or bottle receipt is not an observed upstream source SHA. Exact corresponding source, transitive native dependency identity and reproducible five-target outputs remain distribution gates.

## 25 October: official-client MPEG-TS evidence and isolated parser

The retained Android 59.2 `libwalnut.so` at
`logs/blink-apk/59.2-29823413/decompiled/jadx/resources/lib/arm64-v8a/libwalnut.so`
has SHA-256 `820c92207abcf68b2e9acf53c5c903b388b34fc4c5e5aa0bcd036d96694ebd3f`.
ELF64 load-segment/symbol inspection and ARM64 disassembly establish:

- `RTSPStreamSource::RTSPSDefaultPort` at virtual address `0x90342` is
  little-endian uint16 **332**; `RTSPDefaultPort` at `0x90340` is 554. `start`
  loads 332 at `0x19d704` when no explicit URL port exists, and checks the
  `rtsps` scheme at `0x19d334–0x19d350`.
- `sendSetupRequest` (`0x19e844`) uses
  `RTP/AVP/TCP;unicast;interleaved=0-1` (rodata `0x7353a`).
- `handleRTPPacket` (`0x19fe30`) accepts channel zero, advances twelve bytes
  past the RTP header at `0x19fed4`, and calls
  `TransportStreamDemux::decodeTransportStreamBytes` at `0x19ff1c`. This
  establishes a MPEG-TS payload path; a general H264/AAC RTP remuxer is not
  necessary for that specific path. It does not prove all providers use it.
- URL query flag `blinkRTSP` (rodata `0x726b2`) selects shortened mode two
  at `0x19d6c8`; the connection callback directly calls `sendPlayRequest`
  at `0x1a06b8`. Other modes start OPTIONS or SETUP. Request construction
  substitutes `rtsp://` only in shortened mode inside the secure connection and has query-suppression
  behavior. Normal mode retains the original scheme and query; shortened mode
  omits the entire query, retaining host, port and path. Complete live-provider
  credential/authentication interoperability is unproved.

The same binary also proves the shared TLS identity path for RTSPS:
`RTSPStreamSource::start` at `0x19d41c` calls `makeNetworkConnection(true)`;
the factory at `0x182504–0x182518` wraps its socket in `mbedTLSSocket`.
The connection's asynchronous open at `0x1a2a80` invokes the socket connect
slot, whose relocation `0x1e0910` resolves to `mbedTLSSocket::connect` at
`0x17a214`. That function uses `*.immedia-semi.com` for canonical IPv4
authorities (`0x17add0–0x17ae0c`) and the original DNS name at `0x17b2d0`.
It requires CA authentication mode 2 (`0x17a454`) and TLS 1.2 or newer
(`0x17a468`). This is direct shared-wrapper evidence, not an assumption that
IMMIS TLS rules automatically apply to another protocol.

The native factory's RTSPS branch (`0x1919c0–0x1919ec`) passes only the URL to
`RTSPStreamSource`; its separate IMMIS branch also supplies token and serial.
The RTSP constructor copies that URL at `0x19d040`. Never invent REST-token
injection into RTSP Basic/Digest headers. URL path/query remain private
capability material. Source-backed conservative admission can restrict RTSPS
to port 332, public numeric transport and the checked TLS identity mechanism.
Keeping the existing vendor DNS suffix restriction is a conservative policy
inference; it does not establish exhaustive production hostname coverage.

`src/accessories/rtsp-transport.ts` now supplies a **nonintegrated, socket-free
parser proof**. It bounds input chunks, headers, bodies and lifetime bytes;
checks matched responses and session identity; separates interleaved RTP/RTCP;
and delivers MPEG-TS bytes without URL fetching. Its explicit proof subset
requires payload type 33, a fixed twelve-byte RTP header, one nonzero SSRC,
whole 188-byte TS packets and RTCP SR/RR packets. CSRC/extensions/padding,
other payloads/channels/transports and authentication challenges fail closed.
These are synthetic subset constraints, not asserted exhaustive provider
contracts. No RTSP requests or RTCP reports are serialized or sent.

Redirects fail before callbacks. Content-Base, Content-Location, request targets
and SDP control references must stay on the initial secure origin/port. SDP
addresses never create secondary connections. The initial URI supplies only a
semantic boundary: it grants no production network authority. Callbacks are
synchronous; future integration still needs deadline/backpressure ownership
before connecting them to asynchronous codec writes. Abort discards partial
input and fences later callbacks; partial EOF fails with fixed diagnostics.

Focused tests cover fragmented/coalesced frames, valid TS extraction, session
and control escape rejection, framing/size/source failures and cancellation.
They neither establish numeric socket enforcement nor close F05/F06.
The shared destination helper now admits a conservative RTSPS/332 descriptor
using the source-backed TLS mechanism above, alongside IMMIS/443. This does not
open a socket or change camera playback. Do not expand ports/authority or claim
provider interoperability from fixtures. Owned numerical connection and TLS
tests, actual provider-valid flow, full packet/timing behavior and runtime
cutover remain gates.
