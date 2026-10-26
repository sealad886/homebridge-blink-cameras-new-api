# Private media worker client prototype

> Evidence record: findings and verification below describe the recorded revision
> and environment. Current finding status and release dispositions are owned by
> the [hardening ledger](../plans/security-hardening.md); current procedures are
> indexed in the [documentation map](../README.md).

2026-10-03. Prototype only: no camera-source integration, binary packaging, discovery, download, network connection or fallback. Caller supplies an externally verified absolute executable path. Process launch uses executable only, empty argv, empty environment, shell:false and three private standard pipes. Key material travels only in private framed stdin, is never logged, and temporary client buffers are cleared after write/request completion. Native retains libsrtp contexts. Public errors are fixed; stderr is drained/discarded.

## Exact negotiated protocol

Native agent confirmed common12-byte header: BMI1 input/BMO1 output, u32 BE type/u32 BE payload length. Client matches `native/README.md` and maintained native implementation:

- INIT10:42 bytes stream1/2,SSRC,suite1,16-byte key,14-byte salt; ack10 stream4bytes.
- PROTECT11/12:requestID nonzero,streamID,plaintext<=2048; same type/IDs in reply. Ciphertext must equal plaintext+10 RTP or+14 SRTCP; type-specific limits checked before allocation/correlation.
- CONFIG1:tenu32. MEDIA2:nonempty<=65536. END3:empty. Codec STATUS1/version1, video2/audio4 packet metadata48bytes with signed shared microsecond timestamps, audioINFO5<=4096 extradata, outputEND3.
- Codec END stops codec packets but retains native protection for final queued RTP/RTCP. Client `finishInput()` requires outputEND, no queued/active codec consumers, writes or protection requests, then closes stdin and awaits child `close`. STOP4 has no ack; may truncate output. Client sends STOP opportunistically, immediately signals SIGTERM as owner fallback, escalates SIGKILL after1s, and waits for actual Node child `close` (process plus standard pipes). It never pretends a timeout confirms closure.

`initialize()` returns `MediaPacketProtector` compatible operations for separate native video/audio contexts. Prototype serializes protection globally (one outstanding), validates reply ID/type/stream/exact expansion, never reuses request IDs, and retires owner on missing, unsolicited, duplicate or malformed replies. Request IDs exhaust fail closed rather than wrap.

## Resource/lifecycle invariants

Parser accumulates only missing bytes of each current header/body, validates magic/type/size before full body copies, and parses each completed frame before admitting next bytes from the same chunk. A maximum frame tail coalesced with next header/payload is valid, independently of chunk boundaries. Header+frame bound1MiB, native encoded packet maximum1MiB-60, lifetime output64MiB; input media128MiB. Partial frame2s deadline is absolute from first buffered chunk. One input write active; one reserved protection/control write may wait behind active MEDIA, then takes priority before another MEDIA admission. Sequential MEDIA/END producers may use one bounded producer slot behind an active control write. Additional/concurrent producers reject; no general promise backlog. Control retains dispatch priority; one canonical writer drains both slots. Media quota and EOF/config state change only after successful admission, so rejected END remains retryable. Reserved control and producer waits each have2s deadlines and reject on STOP/close; dispatched writes also have2s completion deadlines. Writable completion deadline2s handles backpressure. Protection/init2s, codec consumer2s, process lifetime300s. `failed` records fatal retirement separately from normal STOP/END closure. Natural code0+END closure with accepted active/queued codec consumers, pending requests or writes is failure; whenClosed still confirms process/pipe closure, not successful consumer drain.

Codec queue includes active consumer, capped1MiB and256 queued packets. Parser continues handling protection replies while codec callback awaits protection on the same pipe; pausing/awaiting callback inline would deadlock. Callback receives owner AbortSignal; STOP aborts it, removes queued packets and fences all later stdout/replies/write completions. Callback must honor cancellation before downstream output. Per-owner instance never restarts/reuses retired generation.

Parent integration must apply negotiated codec/profile/audio validation, protect all RTP/SRTCP before validated datagram sink, pace clocks, retain owner until both client and transport closures, and prevent callbacks retired by STOP from emitting. No worker path discovery or loader environment exemption exists here. Artifact verification and all five target distribution/runtime gates remain external preconditions.

## Evidence

Codanna readiness/scope, semantic search, symbol/calls/callers/impactdepth2 and local/regional/global source confirmations recorded in `/tmp/blink-media-worker-pattern.md`. Existing `withinRequestBudget` reused for consumer deadline/abort; existing camera generation/transport closure contract examined rather than modified.

17 tests pass with externally supplied verified macOS arm64 static worker path:16 stub behavioral cases and1 real native test matching both published libsrtp RTP/SRTCP dummy-key complete packet vectors. Native test is explicitly skipped without `BLINK_MEDIA_TEST_WORKER_PATH`; no binary discovery occurs. Stub tests cover scrubbed launch, fragmentation, reply correlation, malformed headers, deadlines, stdin backpressure, finite request admission, partial EOF, STOP and late callback fencing, post-END protection and same-pipe consumer/protector ordering. Rechecked final rebuilt worker SHA256 `361370e82a141f1e6cc3ab491340ae793d03b9eee982671deac771eca98427ad`: both media suites41/41 pass,0.793s. TypeScript and focused ESLint pass. Vector source: [Cisco libsrtp reference test](https://github.com/cisco/libsrtp/blob/v2.8.1/test/srtp_driver.c), with derivation rules [RFC3711](https://www.rfc-editor.org/rfc/rfc3711).

Physical provider/HomeKit, audiovisual playback, RTCP cadence, all five native target builds, distribution identity and runtime integration remain unverified. No release/Git/live installation performed.

## Independent review corrections

R2 corrected chunk-size aggregate admission into per-frame incremental parse. R3 corrected natural closure accounting so dropping accepted codec work cannot report success. R4 confirmed shared write admission rejected legitimate protection during pending MEDIA and retired worker; corrected one reserved bounded control slot with priority and cancellation. Local/regional/global pattern gate plus Codanna/source confirmation appended to `/tmp/blink-media-worker-pattern.md` before edits. Five regressions prove maximum frame+next fragmented payload, undrained vs drained natural closure, protection behind held MEDIA, and STOP fencing reserved control plus late MEDIA callback. Final two suites46/46 pass including real pinned worker RTP/SRTCP vectors,1.083s; TypeScript/focused ESLint pass. Scope remains prototype client/tests/evidence only.

R4 sequential follow-up: native control dispatch precedes prior MEDIA await continuation, so sequential producer must be admitted behind active CONTROL. Added exactly one producer slot (MEDIA/END), copying at most64KiB, while additional producers reject. State/quota changes occur after admission; rejected END leaves EOF retryable. Three new regressions prove sequential MEDIA and END behind held protection, bounded extra-producer rejection, and STOP/latecontrolcompletion fencing. Final bothmedia suites49/49 pass including published native RTP/SRTCP vectors; TypeScript/focused ESLint pass. Pattern scope confirmed before edits in same gate record.


## 25 October 2026: protocol 2 codec milestone

The earlier protocol-1 receipts above are historical. Current worker/client use a
52-byte CONFIG with thirteen u32 fields: the previous ten fields followed by
H264 profile (Baseline/Main/High = 0/1/2), level (3.1/3.2/4.0 = 0/1/2), and Opus
packet duration (10/20/40/60 ms, zero for other codecs). STATUS reports version 2
and must uniquely match configured fps. Native level validation checks geometry
and macroblock rate before accepting configuration.

Output type 6 carries a strictly increasing u32 cumulative media-consumption
count. The native demuxer emits progress only when bytes leave its bounded ring.
Client `media()` permits one chunk of at most 64 KiB and waits, within two seconds,
for both pipe-write completion and credits covering that chunk. Duplicate,
backwards, excessive or unsolicited credit retires the worker. Reserved
protection/control admission and independent STOP remain intact.

`whenReady` resolves after validated STATUS, bounded from accepted CONFIG.
`whenMediaDrained` resolves after output END and all active/queued packet callbacks
complete, bounded from accepted input END. Failure and STOP reject both observers;
internal rejection handlers avoid unhandled rejections for stop-only clients.
Callers await media drain and final protection work, then `finishInput()` for actual
process/pipe closure. These observations do not establish network or Home playback.

Fresh macOS arm64 evidence: native suite 26/26 including metadata inspection
outside the sandbox; worker/client plus LAN-output suites 67/67, including actual
37-byte MPEG-TS fragmentation, same-pipe RTP protection from codec callbacks and
graceful drain/closure. Strict C11 builds, GCC 14/16 syntax checks, TypeScript and
focused ESLint pass. See `native/local-build-receipt.json` for exact local binary
and source identities. Five-target execution, runtime integration, supported
crash-output secrecy, physical acceptance and F05/F06 closure remain unproved.


### Protocol 2 final fields and owned-session follow-on

CONFIG field 5 now holds software-preset enum 0=veryfast / 1=ultrafast, replacing
the prototype's reserved zero. No wire length changed. Output type 7 is exactly
16 bytes: source width/height/fps numerator/denominator. The worker emits it once
after the first validated decoded video frame; unknown rate is 0/1. The client
checks source bounds, rational rate at most 120 fps and uniqueness before a
synchronous `sourceInfo` owner callback; malformed data or callback failure
retires the generation. No decoder strings or URLs cross that interface.

The owned session bridge forwards source metadata, preserves original common PTS
through bounded startup/pacing, and awaits both native callback drain and its own
paced output before final reports/process closure. Private captured-ciphertext
receiver tests now authenticate/decrypt and decode all four supported codec/rate
combinations, including FU-A and a rejected forged authentication tag. Local
worker/output/socket/session suites pass 102/102 and native tests 27/27. The earlier
26/26 and 67/67 receipts describe the preceding milestone. Actual network and
provider/device acceptance are not established by these injected-sink tests.


The profile/preset follow-on fixes an independently found cross-product defect:
ultrafast Main/High previously emitted Baseline SPS. Public pinned FFmpeg `coder`
and `8x8dct` options restore only the required coding tools after preset
application. All six allowed preset/profile combinations now verify exact SPS
profile/selected level and independently decoded pixels. Native 27/27 and focused
102/102 still pass. No protocol fields changed, and no Pi performance claim is
made for the added CABAC/8x8 work.


The video-bitrate follow-on raises only the native/session admission ceiling to
8,000,000 bits/s, preserving the existing 8000 kbps operator setting. Tests first
failed at the old 4 Mbps boundary, then passed both presets with exact profile,
independent decoding and effective encoder/VBV settings, while 8,000,001 is
rejected. Native 28/28 and focused 103/103 pass. All queue, packet and lifetime
limits remain unchanged; repository-wide type checking during this follow-on
reported concurrent parent-owned camera/platform cutover inconsistencies.
