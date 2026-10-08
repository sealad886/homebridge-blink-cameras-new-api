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
address in the set, and returns `{ ...descriptor, address, family, addresses }` with
a frozen array of frozen admitted candidates. Resolution has
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

IMMIS resolves immediately before each bounded connection chain/reconnect, passes only the
numeric admitted address to TLS, preserves original hostname as `servername`, and
requires `rejectUnauthorized: true` with TLS >=1.2. Deprecated `verifyTls: false`
is ignored. STOP aborts pending admission, duplicate attach cannot create duplicate
lookups, and `whenClosed` includes pending admission settlement. DNS/refusal failures
increment only fixed `destination_rejection` counter and emit fixed errors. Existing
transport/file closure ownership remains intact.

Integration still requires independent review and provider acceptance for domain-family
completeness and certificate chains. No live Pi access or host changes were performed.

## PR50 Copilot R6: bounded numeric fallback

Finding: choosing answer zero repeatedly stranded streams when DNS preferred IPv6
but host had no working IPv6 route. Camera owner retires its generation upon public
proxy errors, so reporting first prehandshake error prevented IPv4 fallback.

Before edits, Codanna index identity/health and semantic context were checked;
resolveMediaDestination (symbol 27016) and connectToImmisServer (symbol 26704)
caller/callee and depth-2 impact checks succeeded. Local helper, regional proxy/DNS
and global camera-error ownership searches confirmed the existing proxy as the
repair boundary. No secondary retry coordinator was added.

Resolver now returns entire fully validated, frozen address set plus initial selected
address. One connection chain selects at most three distinct numeric candidates,
with a second-family candidate preferred after first to include IPv6→IPv4 fallback.
Other candidates receive no connection when any DNS answer violates address policy.
Numeric TLS sockets keep original servername, port 443 and mandatory verification.
No media/auth bytes are accepted/sent before authorized secure connection callback.
Canonical upstream writer additionally requires exact verified-socket identity, covering
experimental talkback/control writes as well as authentication and keep-alive.

Each attempted handshake has five-second deadline. Failed handshake destroys socket
and gives two seconds for actual close confirmation. Alternate begins only from that
socket's confirmed close handler. Missing confirmation emits terminal fixed error and
STOP; whenClosed remains unresolved until actual close, retaining ownership. Thus
ordinary confirmed failures consume at most three attempts and at most 21 seconds
across their deadlines/graces. A missing close ends attempts within seven seconds
but retains unconfirmed handle ownership; it never authorizes a replacement.

After initial established chain, session permits at most three reconnect chains,
each after existing two-second reconnect delay and fresh DNS admission. Lifetime
reconnect count is not reset by successful TLS. Maximum four chains/twelve numeric
attempts per proxy instance; exhaustion emits fixed terminal error and stops. A
failed initial candidate chain stops upon exhaustion rather than looping DNS forever.
Candidate admission has no cross-chain cache authority. STOP clears handshake/grace
and reconnect timers, aborts DNS, and fences late close/secure callbacks.

Focused observable tests cover unreachable admitted IPv6 then reachable IPv4, close
confirmation before alternate, mandatory original TLS identity, unauthorized TLS
without auth writes, timeout/STOP/late secure callback, closure grace with unresolved
whenClosed, candidate exhaustion, lifetime reconnect exhaustion, and changed private
DNS on reconnect with zero additional socket attempts. Synthetic DNS/TLS sinks test
these invariants; they do not establish real provider connectivity or family completeness.

## RC.5: provider IPv4 transport authority and vendor TLS identity

The 8 October Home test exposed 59 synchronous `Unsupported media destination`
refusals before DNS/TLS, followed by 287 liveview HTTP 409 responses during client
retries. Local private evidence: `logs/rc4-2026-10-08-acceptance/home-ui-test.md`.
Images in Home were insufficient evidence of live video. Andrew confirmed the
7 October reboot was intentional and manually triggered.

Historical actual provider responses on 19 August at 14:41:53, 14:41:57 and
14:42:28 Dublin use public canonical IPv4 authorities, port 443, no userinfo or
fragment, and a client_id. Evidence is retained owner-only in the first collection's
full homebridge.log, lines 2090358, 2090557 and 2091680. Addresses and session
credentials are intentionally omitted here. These are historical observations;
October's sanitized logs do not contain the original response URL.

The same retained official APK libwalnut binary, digest recorded above, provides
an independent identity contract. `walnut::mbedTLSSocket::connect` checks IPv4 at
0x17add0. Its IPv4 branch loads `*.immedia-semi.com` from rodata 0x77642 and calls
mbedtls_ssl_set_hostname at 0x17ae0c. Authentication mode 2 (required) is set at
0x17a454; CA-chain configuration occurs at 0x17aa44. The non-IPv4 path supplies
original hostname at 0x17b2d0. Transport IP and certificate identity are distinct.
IPv6 literal authority has no corresponding proof and remains refused.

RC.5 admits only canonical public IPv4 literals on 443 in addition to the existing
DNS family. Literals resolve to one immutable numeric candidate without DNS;
private/special/noncanonical literals fail closed. Their derived TLS identity is
exactly the official constant. Mandatory chain verification, original DNS identity,
verified-socket auth gates, connection deadlines and reconnect budgets remain.
Actual Node certificate matching tests require the vendor wildcard and reject a
foreign wildcard, a specific unrelated vendor subdomain and an IP-only certificate.
Synthetic certificates test identity matching, not real endpoint trust or media.

One bounded unauthenticated strict-TLS probe to a historical address timed out.
It proves neither current reachability nor current certificate acceptance. Real
provider/TLS/HomeKit acceptance requires installation of the reviewed new RC by
Andrew and subsequent testing. F05/F06 remain open.
