# WI05 native worker feasibility gate

Date: 2026-10-03. Scope: read-only public API feasibility assessment; no credentials, media connections, installations, worker implementation, or runtime exploit tests.

## Disposition

**Gate failed for the approved public-libav custom-I/O design. WI07 must stop and return to design.** Stock FFmpeg 9.0.2 RTSP networking bypasses public `AVFormatContext.io_open` and custom `AVIOContext`. Initial hostname checks cannot enforce every DNS resolution, redirect, SDP/control destination, or secondary connection. No hostname-only substitute is accepted.

## Installed identity

`${FFMPEG_9_PREFIX}/bin/ffmpeg -version` reports FFmpeg 9.0.2, Apple clang 21.0.0, OpenSSL enabled. Its explicit `lib/pkgconfig/libavformat.pc` reports 63.1.102. Unqualified `pkg-config --modversion libavformat` instead reports 58.76.100 because `${HOMEBREW_PREFIX}/lib/pkgconfig/libavformat.pc` points to ffmpeg@4/4.4.8_2. Any subsequent build must select the pinned prefix explicitly.

## Source evidence

Installed pinned public `avformat.h:1901–1922` exposes `io_open`; `avio_alloc_context`, custom `pb`, `AVFMT_FLAG_CUSTOM_IO`, cancellation callbacks, and protocol allow/deny lists are also available. These interfaces do not intercept private protocol-level socket opens.

- [Pinned RTSP demuxer](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/libavformat/rtspdec.c), lines 1035–1044, declares `AVFMT_NOFILE`.
- [Pinned RTSP implementation](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/libavformat/rtsp.c), lines 1960–1964, opens control transport directly with private `ffurl_open_whitelist`; RTP/RTCP opens do likewise at 1566, 1714, 2496. Lines 2059–2074 assign redirect URL and loop back to connection creation. Lines 560–582 accept absolute SDP control URLs. This establishes callback bypass; it does not establish that each absolute control URL independently opens a connection.
- [Pinned TCP implementation](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/libavformat/tcp.c), lines 168–183, performs its own `getaddrinfo` and manages resolved addresses internally. Public interrupt callback exposes cancellation, without destination authorization parameters. Protocol lists constrain schemes, not addresses.
- [Pinned TLS implementation](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/libavformat/tls.c), lines 80–113, opens underlying TCP internally, including possible environment proxy routing. [OpenSSL backend](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/libavformat/tls_openssl.c), lines 801–825, supports hostname/IP certificate checks but suppresses SNI for numerical transport hosts. Rewriting URL to an IP with original `verifyhost` therefore needs separate identity/SNI proof and still does not police redirects.

## Required design transition

Secret-free argv and ordinary public codec/muxing APIs remain feasible. The approved all-connections networking invariant cannot be implemented by the proposed callback interception with stock pinned RTSP demuxer. Private `URLContext`/`ffurl_*`, internal protocol registration, symbol interposition, or assumed internal layouts violate the maintained-public-API constraint.

Before WI07 resumes, approve a design with an independently enforceable networking boundary or worker-owned RTSP/TLS transport, and demonstrate complete destination enforcement and TLS identity. This receipt approves neither alternative and claims no runtime verification.
