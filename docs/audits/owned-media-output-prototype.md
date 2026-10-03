# Owned media output prototype evidence

2026-10-03. Isolated prototype; camera-source runtime unchanged by this slice.

## Decision and source identity

Use maintained Cisco libsrtp2 for SRTP/SRTCP, with TypeScript owning H264 RTP packetization and bounded datagram admission. No installed RTP/SRTP library exists in current package dependencies. Adding a WebRTC stack solely for protection adds ICE/DTLS and unrelated protocol surface; implementing crypto locally creates an unnecessary second owner.

The [upstream latest stable release](https://github.com/cisco/libsrtp/releases/tag/v2.8.1) resolves to v2.8.1, commit `6ff02afa8d2dc3f2e8896af391d137c1c66ff6fa` (GitHub tag ref verified). Build input must pin that source, not moving main. [Pinned README](https://github.com/cisco/libsrtp/blob/v2.8.1/README.md) documents C compiler, configure/make or CMake/Meson, `libsrtp2.a`, and optional OpenSSL backend. Prefer native worker's existing build owner, static library and built-in AES-CM/SHA1 backend for advertised suite; no extra Node package or system install was performed here. [Pinned BSD-3-Clause license](https://github.com/cisco/libsrtp/blob/v2.8.1/LICENSE) requires retained notices for source and binary redistribution.

Future native acceptance must run pinned upstream SRTP/SRTCP reference vectors plus [RFC3711 Appendix B](https://www.rfc-editor.org/rfc/rfc3711#appendix-B) before claiming protection interoperability. This slice does not implement crypto or claim vectors executed. Upstream `test/srtp_driver.c` contains complete default AES128-CM/SHA1-80 RTP and RTCP reference packets, including initial RTCP index1. Native implementation owns key derivation, sequence rollover, indexes, authentication, replay/rekey handling and key erasure.

## Existing negotiated contract

`camera-source.ts` PREPARE supplies numeric target address/addressVersion, target video/audio port, local RTP/RTCP ports, random per-media SSRC, 16-byte key and 14-byte salt. Advertised suite is AES_CM_128_HMAC_SHA1_80. START carries video PT, fps, MTU, 90kHz RTP clock and RTCP interval; audio carries PT, sample rate, packet time, comfort-noise and codec. Existing runtime maps video/audio output separately and uses destination port for RTP/RTCP multiplexing. Audio encoding is Opus/AAC-ELD/PCMA/PCMU negotiation; this prototype adds no encoder or audio packetization. Existing FFmpeg local-port readiness and negotiated sender SSRC must be retained during integration.

`H264Packetizer` accepts complete access-unit NAL boundaries, explicit negotiated PT/SSRC, initial sequence and caller's 90kHz timestamp. [RFC6184](https://www.rfc-editor.org/rfc/rfc6184) non-interleaved mode single NAL/FU-A rules: final packet alone carries marker, FU start/end reconstruct original NAL, common access-unit timestamp. RTP12 bytes plus SRTP10-byte tag fit negotiated MTU. No STAP-B, FU-B, interleaving or codec transformation. Caller owns access-unit boundaries, timestamp/fps pacing and profile/level/resolution compatibility.

`senderReport` produces [RFC3550](https://www.rfc-editor.org/rfc/rfc3550) compound SR+SDES with NTP/RTP correlation, packet/payload-octet counts and bounded session pseudonym CNAME. Caller must schedule negotiated interval and count only successful RTP output; no automatic timer or inbound RTCP feedback parser exists here. RTCP must receive native SRTCP protection before sender admission.

## Private protection IPC proposal

Extend canonical native worker private inherited-fd framing, rather than argv/environment/files. One INIT frame per separate video/audio outbound session: suite, SSRC, 16-byte key,14-byte salt; fixed binary fields and no logging. Native validates exact lengths/suite and holds one libsrtp context. PROTECT_RTP/PROTECT_RTCP frames carry plaintext packet length and packet, capped1500 bytes; reply carries protected length and bytes, capped1514. Parent correlation IDs and at most one outstanding request prevent unbounded response retention. Native protection is canonical; TS `MediaPacketProtector` is only interface contract. Reject any native mismatch, timeout, framing error or libsrtp failure; close rather than plaintext fallback. STOP deallocates context, clears key buffers and acknowledges only after no more output. No vendor URL, DNS or TCP endpoint crosses this boundary.

## Budgets and output ownership

Negotiation rejects DNS names, family mismatch, zones, unspecified/loopback/multicast/mapped IPv6, invalid ports/PT/SSRC/fps/MTU/RTCP interval and unsupported suite/key lengths. Numeric IPv4 or IPv6 unicast remains allowed because HomeKit may select private or global unicast addresses; controller session provides destination authority. Prototype does not authorize arbitrary external destinations independently of a prepared HomeKit session.

Access unit:2MiB,2048 packets; pending sender including active datagram:2048 packets,3MiB. Packet count computed before allocation/sequence advancement. Datagram sink gets an owned copy, numeric address/port and abort signal. One send active;1s deadline closes admission and cancels outstanding/queued work. STOP rejects active/queued callers and prevents later sends. Sink contract requires cancellation to release underlying operation; production socket implementation must prove this, not assume Promise cancellation closes OS work. No keys retained by sender, no logging or socket creation.

## Verification and limits

24 focused behavioral tests pass, TypeScript noEmit passes, focused ESLint passes. Tests cover negotiated invalid boundaries, IPv4/IPv6 acceptance, SSRC/PT/timestamps, sequence wrap, FU-A byte reassembly/authenticated MTU, preallocation rejection, RTCP NTP/counters/CNAME, copied destination output, queue saturation, timeout and STOP.

No camera integration, native libsrtp build, live HomeKit, physical device, audio encoding, automatic RTCP cadence or encrypted transport acceptance was run. These remain required before replacing runtime FFmpeg output.
