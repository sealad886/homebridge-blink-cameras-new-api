# Native saved-clip HSV qualification — 3 November 2026

## Scope and current status

The operator approved the preceding gap review and requested Agents Orchestrator
delivery. The [implementation plan](../plans/2026-11-03-native-clip-hsv.md) owns the
ordered work; the [architecture decision](../adr/2026-11-03-native-clip-hsv.md) owns
the production contracts. This record owns executed checks and physical evidence.

Work uses the existing `codex/hsv-saved-clip-prototype` checkout, based on
`0ef68d13d525fbc959a15ac0ff18d14f3595bd6d`. Changes are local and uncommitted.
This task has not installed production packages, restarted a service or published
a release.
The phone remains unavailable. Production pairings and native USB media have not
been changed. The isolated diagnostic pairing was subsequently lost with its
temporary workspace after a Pi reboot; see the interruption below.

The native worker, typed storage API, canonical preparer, persistent coordinator
and existing-accessory runtime integration have passed their scoped checks and
reviews. Settings have also passed scoped checks, independent review and a local
synthetic visual check. Local implementation and the isolated test artifact are
complete. The canonical diagnostic is now running on the Pi and awaiting manual
Home pairing. Passing local checks and an unpaired launch does not establish
automatic Home recording or installed-plugin acceptance.

## Recovered comparison media

The previous Mac temporary workspace no longer existed. The Pi retained the
original clips, normalized diagnostic copy, prepared MP4 and replay event log.
Copies were recovered into owner-only, Git-ignored validation storage, with exact
hash checks against the preceding acceptance record. No credential file was copied.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Fresh native original | 12,260,089 | `710ec39697dd7937433e23f4f9b73334f64a03cf6a17b8db400a5aaf7ca9b637` |
| Separately audio-tail-normalized copy | 12,266,327 | `3071580d88a16bc7ac2dd0060b4d5d70ed253cde9dd1b59e737f6a32b8c07550` |
| Previous prepared recording | 15,236,449 | `1fc8eae74a9f1f2a2d5e57e20e6beca0a9621589e1f82dad00149b458d0d3440` |
| Older native original | 11,040,281 | `dcc46e2c39f32eb217145f97aff379ec43bc55bf0f0f06e258b7a51d51710b63` |

Current local FFprobe decodes 1,801 pictures from both the fresh original and its
normalized copy, and 1,800 from the retained prepared recording. Reproducing the
diagnostic remux with local FFmpeg 9.0.2 still yields 1,801 decoded pictures.
That remux is a new diagnostic artifact, not a claim of byte identity with the
earlier Pi FFmpeg 7.1.5 transport. Full per-picture timestamps are retained privately.
The original container's 1,816 encoded packets must not be mistaken for 1,816
decoded pictures.

The previous Home export was not recovered locally. Its complete retention result
remains supported by the [2 November acceptance record](2026-11-02-saved-clip-replay-prototype.md#fresh-recording-acceptance-and-paced-control),
rather than a fresh export comparison in this phase.

## Diagnostic correctness milestone

The diagnostic now cancels an in-progress load promptly on stdin Stop or EOF,
accounts for retained task-owned scratch files across restarts, and exposes its
phase without overwriting the reserved lifecycle event name. Each defect received
a failing regression before its implementation change.

Independent specification, code/TypeScript and security reviews approved this
frozen diagnostic source. Checks executed for this milestone:

- Focused replay suite: **39 tests passed**.
- Full Jest outside the sandbox: **62 suites, 1,466 tests passed; 18 tests skipped**.
- Targeted lint, build and whitespace checks passed.
- An earlier sandboxed full-suite run failed nine socket tests with `EPERM`;
  those failures disappeared when the same suite ran outside the sandbox.

| Frozen file | SHA-256 |
|---|---|
| `core.cjs` | `5ab5945273b789221132ef3b0c482a22d2547974f7598bd9ee411d6514d39f83` |
| `index.cjs` | `f61d2c4cf77f76071efe9ce50b487a888fb8dd5ba4d4b17bc1a8430174b867a9` |
| `prepare.cjs` | `ecfab1df4305b07adf8f5c4e7e8e969140a2f45f5bbb60e4d80a857b93b6b32d` |
| Replay tests | `1fd07285098f94170c6ca8984363a31c217d00fdd7f69b111aadb113695bb8b8` |

These are diagnostic-only gates. They do not exercise production native acquisition
or the new finite-MP4 worker path.

## Native investigation checkpoints

A synthetic timestamp-quantized 30 fps fixture reproduced the cadence loss:
89 of 90 source pictures were retained. The selector compared a 33,300-microsecond
source timestamp with a 33,333-microsecond deadline. An explicit bounded source
clock phase allowance made this regression pass at 90/90; the existing
downsampling and regressing-timestamp checks continued to pass.

The raw representative MP4 initially exposed a separate ingress issue: its
parameter-only/non-picture packets were rejected by direct decoding, whereas the
former transport parser coalesced packet boundaries. The finite-file path uses
FFmpeg's documented `AV_CODEC_FLAG2_CHUNKS` support; it does not ignore decoder
errors or change live MPEG-TS handling.

The native implementer then reported a successful video-only run of the actual
raw original: **1,801 decoded, 1,801 selected and 1,801 encoded pictures**, with an
independent recording checker also decoding 1,801 output pictures. This run used
tiny output geometry on the Mac. Its 7.192-second duration is not a Pi 1080p
capacity result. Audio-tail handling, final source freeze and independent native
review remain pending at this checkpoint.

The subsequent raw-audio run generated 9,566 silent samples at 16 kHz and retained
1,801 pictures. The independent timestamp audit then found approximately one-frame
shifts at some keyframe boundaries in chunked MP4 decoding. Native fidelity is
therefore still unqualified: matching picture counts alone does not establish
timestamp preservation. That discrepancy is under investigation before integration.

The final native timestamp correction was then independently checked on the raw
1080p original: all 1,801 video timestamps match, with zero relative error, and
video ends at the original 60.565922 seconds. Final audio-tail normalization uses
9,567 samples. The earlier 9,566 count came from the incomplete duration accounting
and is superseded. The separate Pi outputs below confirm these properties.

## Pi native preparation and resource measurements

Two isolated static dependency prefixes were built from the same verified source
pins, using the canonical recipe and private Python environment. Assembly-enabled
build took 210.019 seconds; the comparison with assembly disabled took 189.011
seconds. All installation stayed inside the task workspace. Both workers passed
the closed dynamic-library import audit. The installed Homebridge package remained
the previously published beta; these were isolated candidate executables.

The same original was prepared at 1920×1080, 30 fps, Baseline level 4, 2 Mbps,
ultrafast, with AAC-LC mono 16 kHz/16 kbps and explicit bounded audio-tail padding.
Input was already downloaded. Sequential order was assembly, no assembly, no
assembly, assembly:

| Build | Preparation seconds | Native CPU seconds | Observed peak worker MiB |
|---|---:|---:|---:|
| Assembly enabled, first | 39.140 | 39.07 | 55.42 |
| Assembly disabled, first | 96.211 | 96.13 | 55.77 |
| Assembly disabled, repeat | 96.296 | 96.24 | 55.52 |
| Assembly enabled, repeat | 38.366 | 38.31 | 55.52 |

Feeding took 61–66 milliseconds. The measured build-option effect must not be
attributed to MP4 ingress. Within each build, repeated outputs have identical
SHA-256 values. These are single-source preparation observations, not sustained
system or capture-to-Home capacity guarantees.

| Concurrent isolated workers | Batch completion | Individual completion | Maximum observed temperature |
|---|---:|---:|---:|
| 2 | 49.041 s | about 48.5 s | 74.9°C |
| 4 | 91.187 s | about 89–91 s | 80.4°C |

All six concurrent outputs have the same hash as the optimized sequential output.
Every run reports 1,801 decoded/selected/encoded pictures and 9,567 generated audio
samples. This replicates one local clip across workers; it is not four live feeds,
four distinct source scenes, Blink transfer capacity, or a long-running soak.

Independent local FFprobe decoding of one output from each build found 1,801 video
pictures, every video timestamp equal to the original (zero origin offset and zero
relative error), video duration 60.565922 seconds, and no decoding warnings. Both
contain 947 decoded AAC frames; these are decoded frames, not a compressed packet
retention count. Audio stream duration is 60.629938 seconds. Video is transcoded,
so these results do not claim pixel or original encoded-payload identity.

## Narrow reliability correction

The finite-file worker now caps individual FFmpeg allocations and restricts track
count before opening MOV input. A test-only Linux child address-space cap of
512 MiB protects the small-input regression itself. The original 128 MiB test
assertion passed both binaries on this Pi and was not called RED. Its final
fixture-specific 64 MiB assertion fails on the old worker (112,754,688 resident
bytes) and passes on the corrected worker (14,598,144 bytes). This is not an
aggregate process RSS promise or a general memory ceiling.

The corrected candidate passed 60 native tests with one optional private fixture
skipped, then prepared the actual original at 1080p in 38.548 seconds. It retained
all 1,801 pictures and produced exactly the same prepared bytes as the earlier
optimized candidate. Corrected worker hash:
`e6b50ca4cbc8d41ccce8a21a30cfebc6cd901df5b2c03e6ee2d0eee1012da611`.
Prepared output hash:
`2a5c32cd2a9f275a63d529a2a10c8986aca250110054d1c82261f990d344074c`.

## Live native-storage response check

A bounded one-shot check ran on the Pi using its existing cached authentication.
Authentication stayed on the Pi; no login, token refresh, camera capture, live
view, arming, motion or recording-setting command was issued. The only POSTs
requested a native storage catalog and prepared an existing saved clip for retrieval.
Request context was retained privately before polling. Output contains response
keys/types, statuses and timings, without identifiers, credentials or URLs.

Observed responses:

| Stage | HTTP | Shape |
|---|---:|---|
| Homescreen | 200 | Existing network/module/camera arrays |
| Manifest request | 200 | `id:number`, `network_id:number` |
| Manifest retrieval | 200 | `version:string`, `manifest_id:string`, 1,000 clips |
| Catalog clip | — | `id:string`, `size:string`, `camera_name:string`, `created_at:string` |
| Clip preparation | 200 | `id:number`, `network_id:number` |
| Command status | 200 | `complete:boolean`, numeric `status`, `status_code`, nested command metadata |
| Prepared clip GET | 200 | `video/mp4`, declared length 7,205,189 bytes |

Command polling observed `complete:false` and then `complete:true`. The prepared
GET read only its first chunk before cancellation: this checks the route and
response shape, not a complete download or valid decoded recording. It is not a
capture-to-Home latency benchmark or new Home acceptance test. The catalog's size
does not establish complete storage history.

## Remaining qualification

- Final accessory/platform integration of the typed API, durable queue and
  canonical preparer, including restart and policy-revocation behaviour without
  idle feeds or automatic thumbnail-capture commands.
- Configuration validation/migration and source/health UI.
- Full final-source checks and independent reviews.
- Host-qualified Pi preparation profiling, recovery/concurrency/idle checks, and
  fresh Home export comparison. No new battery-life or throughput claim is made.

The unrelated protocol-3 verification receipt remains unchanged; its retained
SHA-256 is `2d30635603cb17d7a0315262fa2e617e986107d4a498ee87c092c5c4c994324f`.

## Canonical preparation qualification

The earlier native-worker timing used preset 1 (`ultrafast`). The production
`prepareSavedClip` helper uses the existing canonical recording configuration,
including preset 0. A private driver exercised that actual helper on the Pi,
injecting only the already-qualified isolated worker. No HAP, provider, camera
feed or Homebridge service was involved.

| Canonical helper run | Preparation | Batch completion | Peak observed worker RSS | Maximum observed temperature |
|---|---:|---:|---:|---:|
| Single | 57.563 s | 57.605 s including file output | 68.89 MiB | Not measured |
| Two simultaneous | 69.153 s / 68.982 s | 69.589 s | 69.63 MiB / 68.30 MiB | 74.9°C |

Each run retained all 1,801 decoded/selected/encoded pictures, generated 9,567
bounded audio-tail samples and produced 61 fragments, numbered 0 through 60.
Prepared size was 15,272,805 bytes and SHA-256 was
`b37dd78b8dd57671101019e8def69901a99e124dabfb82e77d33425c02a00cb1`
in all three runs. Each driver released its retained budget to zero after
disposal. The two simultaneous drivers were separate Node processes; this is
native preparation capacity evidence, not verification of the coordinator's
shared in-process memory budget or sustained multi-camera throughput.

Independent local decoding of the canonical output found 1,801 video pictures,
zero timestamp error against the source, the same 60.565922-second video end and
no output decoding warnings. The conservative native span bound was 60.693938
seconds. Source bytes stayed unchanged. These newly prepared bytes have not yet
received a fresh Home retention/export acceptance check.

## Complete download through the typed native-storage API

The first complete typed-API download exposed a unit error in our interpretation
of Blink's catalog. The integer string `size` is a rounded-up KiB estimate,
rather than the exact binary byte length. Three actual retained sources verify
this interpretation:

| Catalog estimate (KiB) | Complete actual bytes | Difference from estimate × 1,024 |
|---:|---:|---:|
| 5,073 | 5,194,528 | 224 bytes |
| 7,037 | 7,205,189 | 699 bytes |
| 11,973 | 12,260,089 | 263 bytes |

The API and coordinator now name this field `sizeKiB`. Admission and storage
limits still use actual bounded bytes. Exact catalog-size equality is no longer
used as a completion test; HTTP completion/Content-Length, actual length and
source SHA-256 remain independently checked.

After that correction, the one-clip typed-API test completed successfully on the
Pi: catalog request, command polling, 1,000-entry parsed catalog, existing-clip
preparation, command polling and full download all returned HTTP 200. Total was
8.941 seconds, including a 2.929-second download at about 1.77 MB/s. The original
5,194,528-byte MP4 was retained unchanged with SHA-256
`146a8baae6e30bd6909559ecef7903fa17eecb9a43891404c6af2e5e9271dc11`.
It contains 896 decoded video pictures over 61.032622 seconds and 16 kHz AAC
audio. Parameter-only H.264 units produce the known default-demuxer warnings.

That additional actual source then passed the canonical Pi preparer in 28.625
seconds. It retained all 896 pictures, generated 16,010 bounded silent audio-tail
samples at 16 kHz and produced 30 fragments. The 7,688,430-byte prepared output
has SHA-256
`7f125e31fe892336f828e35864a683a35d99e0ccaae9a3d000f44971d093e288`.
Independent decoding confirms zero timestamp error, the original 61.032622-second
video end and no output decoding warnings. Retained budget returned to zero.

The selected source was about 13 hours old. This establishes a complete native
storage download through the new code, not recent motion detection, automatic
queue delivery or Home retention. Authentication remained on the Pi, with login
and refresh disabled; no live view, capture, arming or settings command occurred.

## Paired canonical-preparation replay: transport checkpoint

A process-local private adapter now feeds the frozen canonical preparer into the
already-paired diagnostic. It preserves the complete existing HAP state and uses
an explicit bounded JPEG from the retained source. It performs no external
FFmpeg video conversion. The six inactive historical prepared test outputs
(54,896,297 bytes) were reversibly archived with hashes and original paths;
durable copies and the relocation manifest are retained privately. Native inputs
and pairing state stayed in place. Working scratch remained subject to its
unchanged 128 MiB admission bound.

The actual paired run prepared the 60.6-second original from 11:57:54.876 to
11:58:53.939 UTC. All 61 fragments and the exact canonical output hash
`b37dd78b8dd57671101019e8def69901a99e124dabfb82e77d33425c02a00cb1`
matched the separate Pi qualification. Recording, camera and audio permissions
were active, using the restored Home configuration.

Motion was triggered at 11:59:16.862 UTC; the home hub requested HDS at
11:59:16.962, and the final packet was offered at 11:59:17.105. There was no ACK.
A reason-3 close at 11:59:29.107 matches the existing HAP 12-second close timer;
the diagnostic then cleared motion. This remains transport evidence, independent
of Home retention.

Mac Home subsequently listed a person event at 11:59. Its label grew from six to
36 seconds and then one minute across refreshes. The saved recording played past
the previous 38-second cutoff, reaching approximately 45 seconds in the observed
playback. Share Clip was invoked once, but no completed exported file was obtained
before the session interruption. Complete packet retention therefore remains
unverified for this new output. The phone was not accessed. This test exercises
canonical preparation and the prior diagnostic event path; existing-camera
production-delegate acceptance is separate.

## Validation interruption after Pi reboot

At 13:08 UTC, read-only checks found the Pi had rebooted approximately six minutes
earlier. The isolated native-build, paired replay and provider-test directories
under `/tmp` no longer existed. Port 53632 was free and no diagnostic replay
process was present. Production Homebridge was active and still reported
`1.0.0-beta3`; this task did not install a package or restart that service.

The owner-only local validation directory retains the original clips, prepared
outputs, hashes, measurements, source bundles and transport logs. The diagnostic's
HAP pairing state and compiled Pi candidate were not among those recovered local
artifacts. No replacement identity or pairing reset has been attempted. Further
paired tests require recovering that test state or a separately authorized test
pairing. Future qualification workspaces must use durable task storage rather
than `/tmp`. No new Home export was present in the app's temporary ClipExport
directory when checked after the interruption.

The reviewed native sources and authenticated dependency archives were then
restored into the private persistent workspace
`<operator-home>/blink-hsv-validation/20261103-kdIhav`. The two-job assembly-enabled
dependency build and native build completed there. The rebuilt ARM64 worker has
SHA-256 `472837e33fa6d3be6682225a016ad96db1b084f4dfe838b69d7cd295b3cdfa91`;
its 60-test native run passed with one optional test skipped. A local private
binary backup and the test/build receipts are now retained as well.

The restored original and JPEG matched their retained hashes. Running that
original through the frozen canonical preparer and newly rebuilt worker took
56.221 seconds, retained all 1,801 pictures, produced 61 fragments and released
the budget to zero. Its 15,272,805-byte output exactly matched the prior canonical
SHA-256 `b37dd78b8dd57671101019e8def69901a99e124dabfb82e77d33425c02a00cb1`.
This verifies the recovered worker artifact against a real source; it does not
restore the lost HAP pairing or constitute another Home recording test.

## Final local implementation and isolated launch

The final diagnostic now uses both the canonical preparer and the actual
production recording delegate. The former FFmpeg/ffprobe video path, separate
event timers and pacing controls have been removed. A generated two-second
fixture passed through the new diagnostic preparer, native worker and delegate:
all 30 pictures were preserved, three HDS packets had exactly one final marker,
and retained budget returned from 22,323 bytes to zero. This fixture is synthetic,
not a new Blink capture or Home recording.

Final combined local checks passed:

- Full Jest: 72 suites and 1,661 tests passed; two suites / 20 tests intentionally
  skipped.
- Lint, build and API contract validation passed (347 endpoints / 677 models).
- Native-package checks: 28/28 passed. The workflow test now executes the actual
  argument selection for all five target lanes, rather than matching obsolete
  command syntax.
- Scoped specification and quality reviews approved the source milestones.
- Settings: nine focused suites / 183 tests passed, followed by an independent
  four-suite / 41-test check and a local synthetic visual review. The screenshot
  shows named module controls, inherited defaults and no empty unidentified row.

The first Pi launch failed its exact HAP-manifest admission check. The installed
files now reported Homebridge 2.5.0 / scoped HAP 2.3.0, whereas earlier read-only
checks had found 2.5.1-beta.0 / 2.3.1-beta.0. This task did not install either
version. The current 2.3.0 public exports and recording-service/callback surface
were verified directly from the installed source. The diagnostic's explicit
admission, test and README were corrected for that actual identity; all 25 focused
tests, syntax/diff checks and the bounded independent quality review passed.
Compiled production and native-worker bytes were unchanged. The full combined
suite above preceded this small diagnostic admission delta.

Both runtime bundles are retained privately. The corrected 376,722-byte archive
is `final-validation-runtime-20261103-hap230.tar.gz`, SHA-256
`ce307e0f4f50b3426276fe1b268d99ce491a8fb5e83fda62134d24e8d6a3db41`.
All 263 payload files verify. It is an isolated source-validation artifact with
no five-target native release assets, media or credentials. The current source
inventory and check receipts are retained under `source-freezes/` and
`final-checks/` in the private validation directory.

At 14:14:01 UTC, **Blink Saved Clip Validation** successfully began listening on
port 53632 / `wlan0` with scoped HAP 2.3.0. Raw output is private; stderr was empty.
A process-local exception-only preload was retained for diagnosis, leaving the
on-disk reviewed sources and normal recording path unchanged. The replacement
identity is in the persistent task workspace, and its identity and human-readable
pairing instructions are backed up privately on the Mac. Dead PID locks from the
failed attempts were verified dead and preserved by rename, without resetting
identity or HAP state.

The operator has been asked to add the replacement test camera when the phone is
available and enable Stream & Allow Recording / Any Motion. No clip has been
loaded or motion triggered on this new accessory yet. Final-delegate Home save,
beginning/middle/end playback and a new export comparison therefore remain
pending. Recent native-motion acquisition, automatic existing-accessory delivery,
physical idle activity, restart recovery and sustained multi-camera acquisition
also remain separate acceptance checks. Matching protocol-4 workers and the
corresponding-source archive must be regenerated for every release target before
distribution. Nothing in this record authorizes publication or a production
installation.

At 23:32 UTC the earlier interactive test process was no longer listening. Its
persistent identity remained intact and no stale PID lock was present. The same
reviewed runtime was restarted with owner-only local FIFO input held by a private
supervisor, so the developer test can remain available between chat turns. This
does not create a system service or change normal plugin setup. A separate SSH
check verified Node PID 160286, the exact script path, the `wlan0:53632` listener,
empty stderr and an unconfigured/off recording status. No clip was loaded or
motion triggered. The private `test-accessory-run-card.json` records paths and
safe status/Stop control; pairing and final Home acceptance remain pending.
