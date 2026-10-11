# IMMIS TLS trust correction for RC.8

## Confirmed cause and provider evidence

RC.7 Home acceptance produced four `IMMIS TLS candidates exhausted` failures across
Entry and Corner. AAC-ELD/Opus advertisement succeeded, but no live media rendered.
Owner-only evidence: `logs/rc7-2026-10-11-acceptance/analysis.md`.

A bounded diagnostic using the installed API client requested one current liveview,
kept credentials and endpoint addresses on the Pi, and compared two unauthenticated
TLS handshakes. Node defaults failed with `DEPTH_ZERO_SELF_SIGNED_CERT`. Adding only
the official Blink vendor anchors succeeded with `authorized: true`, without
changing SNI, hostname checks or `rejectUnauthorized: true`. The current peer SHA256
is `b1bfa71ba445f0de14172a1382db19e8848f93b850eb78bd13fdabc1be7e2481`, exactly the
first official vendor anchor. Remote command completion was attempted through the
existing client and returned completed-or-deprecated. No Pi files/settings changed;
the diagnostic did temporarily request a normal vendor liveview. It did not refresh
or write credentials. Historical endpoint probes timed out/refused and are not
current-provider evidence.

Evidence: `logs/rc8-tls-investigation-2026-10-11/current-handshake.jsonl`.
A successful handshake proves peer authentication, not media decoding or Home audio.

## Official trust provenance

The retained official Android 59.2 build 29823413 library is
`logs/blink-apk/59.2-29823413/decompiled/jadx/resources/lib/arm64-v8a/libwalnut.so`,
SHA256 `820c92207abcf68b2e9acf53c5c903b388b34fc4c5e5aa0bcd036d96694ebd3f`.
`_GLOBAL__sub_I_TLSCertificates.cc` at `0x1b7424` constructs sixteen certificate
vectors. Ten vendor DERs occupy `0x92914 + n * 0x40d`, each 1037 bytes.
`TLSCertificates` is exported at `0x1ef358`, referenced through GOT `0x1e4008`.
`mbedTLSSocket::connect` loads this list at `0x17a9bc`, parses the DERs at `0x17ad1c`
and configures the CA chain at `0x17aa44`. This establishes actual trust use rather
than inferring trust from unrelated binary strings.

All ten vendor anchors are self-signed RSA-2048/SHA256 CAs, valid 2016–2039, subject
and issuer Amazon/Blink/`*.immedia-semi.com`. Self-signatures are verified. Public
certificates contain no private keys. The expired AddTrust root and other public
roots from the app are not copied; existing Node bundled roots already remain.

| DER offset | SHA256 |
| --- | --- |
| 0x92914 | `b1bfa71ba445f0de14172a1382db19e8848f93b850eb78bd13fdabc1be7e2481` |
| 0x92d21 | `5d5ad97b7ddd81a9d644ed590abe98a3206370c924cf0f78855f8b81d6b224f9` |
| 0x9312e | `3d7264910172d0efbeba5ddb6f1d00218687fb48dec0dbf14618a8d6c3dfa070` |
| 0x9353b | `79331784354dc9ed24743a5213992f16b722ebe7ae7971e249bd705947a7a9ff` |
| 0x93948 | `4dd3900914576bba84e2486e3cc7e4fed6c30f6134dfc4994ca2c25d29f6d900` |
| 0x93d55 | `3e25037c63760ce47d02192e5a19ecb580d254b59ef1224761f05ef1bbda2292` |
| 0x94162 | `33bdd91a730e1ed29370131423529f0c0b9809907278c5278f7eb22e5bfb72c2` |
| 0x9456f | `337e7270e146af16d5ca83dca3f0651becd7d9f900e9a678a98c6f783b72c75e` |
| 0x9497c | `00f66b95d7bac4c96bc9928776ce9c3bd0d61965dc9f2577b6682b76df3d00c6` |
| 0x94d89 | `7eddc4cf2feafe969cea5f852f8374e02abf357b9273d5d8769e8598d65219bd` |

## Repair and security invariant

`immis-trust.ts` embeds the ten immutable public vendor anchors. Only the admitted
IMMIS socket receives `ca: [...tls.rootCertificates, ...IMMIS_VENDOR_CA]`.
Explicit `ca` replaces Node defaults, so bundled public roots are preserved;
IMMIS does not inherit arbitrary system/extra CA overrides. HTTP, OAuth, thumbnails,
other sockets and the global trust store are unchanged. No startup download,
trust-on-first-use, dynamic certificate acceptance or bypass is introduced.

TLS >=1.2, Node hostname verification, `rejectUnauthorized: true`, the existing
public-address policy, numeric connection admission, verified-before-auth gate,
five-second handshake deadline, close-before-fallback, bounded reconnect and STOP
ownership remain required. Vendor anchors are not destination authority: a foreign
hostname/private address still fails admission. Compromise/rotation of a vendor
anchor requires explicit source-backed trust maintenance; never learn trust from
an unverified live peer.

Fixed diagnostic reasons distinguish certificate trust/identity, refusal/reset,
network reachability, handshake deadline, early closure and other handshake errors.
Only fixed categories plus bounded family/attempt numbers are logged. Raw errors,
certificate dumps, endpoint addresses and session credentials are omitted.

Regression evidence covers official anchor identity/validity/self-signatures,
negative hostname checks, a real untrusted TLS peer with a matching vendor CN,
mandatory CA/verification socket options, zero auth writes on rejection, sanitized
reasons and existing parser/lifecycle/reconnect controls. Node 20/22/24 CI remains
required. OpenSSL creates disposable test keys in an owned temporary directory;
no private key is committed or packaged.

## Release and rollback disposition

RC.8 is a compatible transport repair within the existing 0.10.0 RC series.
Operator installation starts a fresh observation window. Require physical Home
live video/audio, STOP/reopen, manual snapshot refresh, 48 hours and two concrete
natural post-storage refresh receipts. Current handshake evidence does not waive
those gates or prove performance savings. Issue #52 remains open until physical
acceptance. F05/F06 remain open; this change does not provide secret-free FFmpeg
execution or complete RTSP destination enforcement.

If transport or playback fails, preserve TLS guards and evidence; disable live
streaming or use a previously verified secure artifact. Do not restore TLS bypass,
unauthenticated TCP admission or claim comprehensive security resolution.

Reference: [Node TLS CA and identity verification](https://nodejs.org/docs/latest-v20.x/api/tls.html).
