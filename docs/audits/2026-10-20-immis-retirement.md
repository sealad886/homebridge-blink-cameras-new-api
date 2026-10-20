# IMMIS retirement investigation — 20 October 2026

## Observed failure and limits

Private RC.15 evidence is retained in `logs/rc15-2026-10-20-home/`.
The first Front door stream delivered video and audio with human-confirmed
stutter. STOP at 18:11:09 sent a session command with ID 4 and immediately
destroyed the TLS socket. HTTP retirement subsequently returned `not_found`.
The reopened stream authenticated and received media at 18:11:31, then its
upstream socket closed at 18:11:41. Two subsequent TLS connections did not
reach recorded IMMIS authentication acceptance before closing.

No local frame, input, or consumer-budget refusal preceded those closures.
The same camera's intervening thumbnail capture completed before the reopened
START; the later manual capture began after STOP. The evidence does not establish
the provider's internal close reason or prove a snapshot conflict.

## Official native reference

The retained Android 59.2 build 29823413 native library is:

`logs/blink-apk/59.2-29823413/decompiled/jadx/resources/lib/arm64-v8a/libwalnut.so`

Its SHA-256 is
`820c92207abcf68b2e9acf53c5c903b388b34fc4c5e5aa0bcd036d96694ebd3f`.
The following observations come from symbol-scoped AArch64 disassembly using
LLVM objdump, rather than third-party protocol descriptions:

| Native symbol and address | Observed behavior |
| --- | --- |
| `IMMIStreamSource::stop`, `0x16eddc`–`0x16ede4` | Enters connection state 6 for a connected stream. |
| `setConnectionState`, `0x16e558`–`0x16e588` | Stops the work queue and calls `sendMediaInfo` with type `0x07`, an empty payload, and sequence 1 when the stored presentation count is zero, otherwise 0. |
| `processMessage`, `0x16fc5c`–`0x16fc74` | Handles type `0x08` as a termination result and enters connection state 8. |
| `updatePresentationStats`, `0x17141c`–`0x171450` | Copies the first 32-bit presentation-statistics field into the field read by termination. This is not evidence of a save/discard flag. |
| `sendKeepAlive`, `0x16f474`–`0x16f48c` | Sends type `0x0a` with its outgoing per-type counter and no payload; the next call is scheduled ten seconds later. |
| `processMessage`, `0x16fc0c`–`0x16fc10` | Accepts received type `0x0a` without sending an echo. |
| `processMessage`, `0x16fc20`–`0x16fc44` | Responds to type `0x10` with type `0x11`, the received sequence, and an empty payload. |
| `processMessage`, `0x16fca8`–`0x16fdd0` | Type `0x0c` carries an audio-configuration bitmask passed to `validateAudioConfig`; it is not an authentication challenge. |
| `processMessagePayload`, `0x16ffa4`–`0x17001c` | Type `0x13` carries presentation configuration delivered to a callback; there is no direct protocol acknowledgement here. |

The current plugin instead emitted a scaffold talkback `0x17` command during
every ordinary STOP, even with two-way audio disabled. That command is not the
native media termination exchange. Removing the unconditional talkback command
is a confirmed behavioral correction; it does not establish the cause of the
provider's subsequent disconnection.

## Behavioral regression evidence

The public streaming STOP regression in `__tests__/stream-ownership.test.ts`
starts a one-way IMMIS stream through the normal camera-source entry point and
inspects bytes written to the mocked verified TLS boundary. Before the change,
it observed the unwanted ten-byte packet
`17 00 00 00 01 00 00 00 01 04` (hexadecimal). After removal of the unconditional
talkback stop, all 17 ownership tests pass. These tests allocate local UDP ports;
the sandbox's port restriction required running them outside the sandbox.

Normal STOP now requests cooperative retirement only after both verified TLS and
IMMIS authentication acceptance. It sends the native empty `0x07` packet with
sequence 1 (no presentation count is known), stops live-media forwarding, resumes
control reads despite downstream backpressure, and waits at most one second for
an empty `0x08` result. A response, timeout, or peer closure triggers the existing local
stop path. Fatal errors continue to use immediate shutdown. Repeated STOP does
not send another termination packet, and session capacity remains reserved until
the actual transport close event. The finite `response` receipt proves only a
termination response was received; it does not assert provider success from its
status field. No guessed ping/echo or presentation-statistics
reporting was introduced.

PR review additionally reproduced late talkback callbacks writing session
commands after the termination request. The shared upstream-write boundary now
permits only the termination packet during retirement; session commands, audio
frames, and keep-alives cannot follow it. New audio inputs are refused during
retirement or after shutdown, so they cannot retain listeners. The regression
observed four writes before this correction and only the one termination write
afterward, including late audio calls before and after the response. All 74
proxy tests pass after this correction.

The proxy regression first failed because cooperative retirement did not exist,
then passed with the implementation. Expanded tests cover fragmented ACK,
timeout at one second, peer close, blocked consumers, unauthenticated transport,
late TLS verification, and unchanged frame-size refusal during retirement.
The two focused proxy/ownership suites pass 90 tests; TypeScript build and diff
whitespace checks pass. These are local synthetic boundaries, not proof of the
provider's retirement outcome or physical Home playback after installation.

## Remaining interpretation boundaries

The failed stream's bounded logs show received types `0x0a`, `0x0c`, and `0x13`,
but no `0x10`. Missing ping/pong handling is therefore a separate observed
contract gap, not a demonstrated explanation of this failure. The original
stream stayed connected through several received `0x0a` messages, which also
argues against introducing an unsupported keep-alive echo.

A cooperative retirement implementation must retain a short finite deadline,
keep control handling available while discarding unwanted media, and preserve
confirmed transport closure before releasing the session's reservation. The
plugin cannot report Home presentation counts it does not possess. Actual
post-install STOP/reopen and sustained playback still require operator testing.
No Pi configuration, installation, restart, pairing, or persistence change was
performed during this investigation.
