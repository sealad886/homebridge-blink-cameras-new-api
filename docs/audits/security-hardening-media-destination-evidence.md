# Owned IMMIS destination policy evidence

Source baseline: main `2e86a45`; implementation branch `codex/secure-media-worker`.
This receipt covers destination admission and IMMIS integration only. It does not close
F05/F06, establish RTSPS transport enforcement, or claim physical/provider acceptance.

## Checked contract evidence

Retained Android 59.2 build 29823413 APK source:
`logs/blink-apk/59.2-29823413/decompiled/jadx/sources/com/immediasemi/blink/core/api/RestApiKt.java:25`
declares `IMMEDIA_SEMI_DOMAIN = "immedia-semi.com"`. `BaseUrls.java:19-20`
constructs tiered REST subdomains. The historical dossier includes an `isBlinkHost`
suffix helper, but that method is absent from the currently retained Java decompilation.
The implementation therefore labels the domain-family restriction as a conservative
policy inference from the APK domain constant, not a proved exhaustive media-host list.
No retained sanitized actual IMMIS response metadata was found. Synthetic test hosts
establish rejection/admission behavior only; they are not provider contract authority.

Native library:
`logs/blink-apk/59.2-29823413/decompiled/jadx/resources/lib/arm64-v8a/libwalnut.so`
SHA-256 `820c92207abcf68b2e9acf53c5c903b388b34fc4c5e5aa0bcd036d96694ebd3f`.
Its string table contains `IMMIStreamSource can only operate on immis: URLs`.
ELF64 little-endian symbol-table inspection resolves
`_ZN6walnut16IMMIStreamSource16IMMISDefaultPortE`, size 2, bytes `bb01`, uint16 443.
The separate plaintext IMMI default is 2734; plaintext is refused.
WalnutSignalling.java:72 names RTSPS, but this slice admits only IMMIS.

## Enforcement and exported interface

`describeMediaDestination(raw)` returns a frozen, credential-free descriptor:
`{ scheme: 'immis:', hostname, servername, port: 443 }`. It refuses other schemes,
ports, IP-literal authorities, foreign/suffix-confused hosts, userinfo and fragments.
Parse errors are fixed messages without raw provider input.

`resolveMediaDestination(descriptor, AbortSignal, optional lookup)` resolves anew
on each invocation, rejects empty/excessive/malformed answer sets and any special-use
address in the set, and returns `{ ...descriptor, address, family }`. Resolution has
an independent five-second admission deadline. Abort prevents late admission; the
underlying OS lookup cannot itself be cancelled. The shared bounded DNS helper
permits at most eight actual pending lookups with no queue, and remains charged
until each underlying lookup settles even after caller cancellation or timeout.
Outage diagnostics use the same helper. No DNS result is cached.

IPv4 excludes private, loopback, link-local, carrier NAT, documentation, benchmarking,
multicast and reserved blocks. IPv6 admits only ordinary 2000::/3 global unicast and
excludes special 2001::/23, documentation and 6to4 blocks; mapped addresses, NAT64,
ULA, link-local, multicast and zone identifiers fail closed. This deliberately
conservative policy may reject globally reachable special allocations.

IMMIS resolves immediately before each actual connect/reconnect, passes only the
numeric admitted address to TLS, preserves original hostname as `servername`, and
requires `rejectUnauthorized: true` with TLS >=1.2. Deprecated `verifyTls: false`
is ignored. STOP aborts pending admission, duplicate attach cannot create duplicate
lookups, and `whenClosed` includes pending admission settlement. DNS/refusal failures
increment only fixed `destination_rejection` counter and emit fixed errors. Existing
transport/file closure ownership remains intact.

Integration still requires independent review and provider acceptance for domain-family
completeness and certificate chains. No live Pi access or host changes were performed.
