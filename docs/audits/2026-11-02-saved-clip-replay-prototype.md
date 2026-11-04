# Saved-clip HSV replay prototype — 2 November 2026

This is the historical prototype record. Its FFmpeg conversion and separate
replay lifecycle were replaced on 3 November by the canonical preparer and
production recording delegate. Use the current
[diagnostic instructions](../../scripts/hsv-clip-replay/README.md) and
[qualification record](2026-11-03-native-clip-hsv-qualification.md) for current
commands and limitations; retain the results below as evidence of the older test.

## Authorized objective

The operator approved replaying a saved existing Blink clip into HomeKit Secure Video, verifying actual save and playback, then testing a newly available clip to measure event and delivery timing. The preceding feasibility review is approved; this record makes its bounded execution concrete. No production release or package installation is included.

## Test design

Use a standalone diagnostic HAP camera with isolated pairing storage, identity and port. Keep the installed Homebridge plugin and its pairing untouched. A chosen local MP4 is validated and normalized with a fixed local diagnostic FFmpeg command, then processed by the already published native worker into the Home hub's negotiated fragmented MP4. Prepare all media before signaling motion. Deliver the original beginning and final fragment, handle acknowledgement and permission revocation, and record transfer evidence separately from Apple Home save/playback. Serve thumbnails from the saved file. Live viewing is outside this recording-only diagnostic.

The diagnostic conversion is not production MOV support or approval to weaken the worker sandbox. No camera live-view or thumbnail command is needed. Native Blink originals remain intact. Clip download uses existing authentication locally; credentials, media capability URLs and private media never enter repository files or public logs. Media and pairing state use owner-only scratch space. The new diagnostic accessory requires Home pairing before physical acceptance.

## Ordered checklist

- [x] Verify repository, published worker, Pi package and Apple Home availability.
- [x] Implement and locally verify bounded diagnostic replay and acquire one saved clip.
- [x] Pair the diagnostic accessory, enable recording and verify the older replay is saved and plays in Apple Home.
- [x] Investigate the 38.72-second cutoff and verify complete prepared-media retention and playback in the longer-motion experiment.
- [x] Inspect native recording prerequisites, provider health and plugin feed ownership; no confirmed cause identified in the cached checks.
- [x] Acquire a fresh native clip after the operator's Sync Module power cycle and motion test, measure observed stages, and verify complete prepared-media retention/playback in Mac Home. The phone remained untouched.
- [x] Independent code/security review, focused verification and evidence handoff for the standalone diagnostic.

## Ownership and files

- Implementer: `scripts/hsv-clip-replay/` and `__tests__/hsv-clip-replay.test.ts`; no production source edits.
- Coordinator: this audit record, task routing claims, private media acquisition, Home interaction and physical acceptance evidence outside the repository.
- Reviewers: read-only scoped review after implementation freeze.

## Verification requirements

Behavioral tests must cover bounded file admission/preparation, finite packet delivery including `isLast`, cancellation/revocation, and one recording request at a time. Test RED before GREEN. Reuse the existing published worker and canonical media contract. Run build/lint and appropriate existing tests. No claim of HSV recording success without visible saved and playable footage in Apple Home. Record exact source/worker identity and observed clip timing; retain any failure honestly.

## Preparation checkpoint

The standalone diagnostic passed specification, independent code/TypeScript and security reviews. The broader gate passed 62 suites / 1,439 tests before the final bounded reporting/preset delta; 13 focused tests, targeted lint and build passed afterward. Final reporting distinguishes the last packet offered, hub acknowledgement and observed Apple Home retention. The published worker's existing ultrafast encoder preset is used without changing deadlines, resource limits or negotiated formats.

Existing native USB footage was retrieved using the matching manifest request/catalog and prepared clip routes. The older retained Android media endpoint produced a stale-manifest error. A sampled catalog is not a complete history; counts and ordering do not establish absence of newer recordings. Detailed deployment-specific receipts and private media remain outside the repository.

One native clip exposed a real audio coverage gap at the end of the video; the worker correctly refused it. Diagnostic normalization preserves the original and recorded video, reencodes the existing audio and explicitly labels generated tail silence. Separate host scheduling failures also reached the unchanged worker-consumption deadline. Neither is reported as a missing recording or silently bypassed.

## Physical replay acceptance and duration investigation

The isolated accessory now runs on the Pi using its existing published worker, separate pairing storage and a dedicated HAP port. The initial Mac-hosted pairing failed; moving the same diagnostic identity to the Pi resolved pairing. The motion sensor then required explicit registration on the accessory before configuring its camera controller. A focused regression covers its exposure, linkage, notification permissions and motion characteristic changes. Fifteen focused tests, targeted lint and build passed after that correction; independent code and security reviews approved the exact running diagnostic source.

At 11:41:08 UTC, the diagnostic signaled motion for the older saved clip. The hub requested its recording at 11:41:10, the diagnostic offered the final fragment about 90 milliseconds later, and the hub acknowledged completion at 11:41:15. Apple Home subsequently listed a recording at 11:41. The operator confirmed iPhone playback, and the coordinator observed actual playback in Mac Home. This establishes saved-clip replay feasibility; transport acknowledgement alone was not treated as retention evidence.

Home displays a 38-second recording. A copy exported through Home's Share Clip action contains 570 decoded video frames over 38.587 seconds and 38.720 seconds of audio. The exact prepared input contains 901 video frames over 60.999 seconds and 61.248 seconds of audio, in 31 consecutive fragments. Its decode timestamps are continuous, every video fragment starts with a sync sample, and independent decoding completes without decoder errors. Packet-hash alignment shows that Home retained the exact first 570 video packets and first 605 audio packets, omitting the final 331 video and 352 audio packets. Retained timestamps preserve the source timing, within approximately one millisecond of quantization. This is tail truncation, not playback speedup. The reason remains unproven. The prepared video's actual temporal rate is approximately 15 fps despite the hub selecting 30 fps; this does not justify an encoder change.

The controlled experiment retained the same prepared bytes, immediate HDS delivery and Home policy, while requesting a motion signal lasting the prepared source duration. This isolates the requested event-window behavior before considering a separate paced-transfer experiment. Cancellation and permission revocation still clear motion promptly, and overlapping replays remain disallowed.

The existing production plugin separately supports live-feed HSV capture from a shared upstream stream. Manual Live View alone does not trigger an HSV recording. That capture path uses continuous buffering while recording is enabled, and it has not been physically validated by this saved-file test. No idle native-motion wake mode or automatic production saved-clip replay has been implemented by the prototype.

## Complete older-clip retention

The optional `motionHold: "prepared-duration"` trigger passed 25 focused tests, targeted lint, build and independent code/security reviews. The exact reviewed source was copied to the isolated Pi workspace with the existing pairing preserved. Preparation reproduced the prior media SHA-256 exactly: `e8805c9a905aec46dd4519c434a1addef784608247d806d811f3136f37054a71`. The source duration used for the requested hold was 61,248 milliseconds, derived from the prepared selected-track timeline.

At 13:11:26 UTC, motion was signaled and all 31 fragments were offered immediately. This run received no ACK. A `CANCELLED` close arrived approximately 12 seconds after the final offer, clearing motion promptly. The exact delay matches pinned HAP's own close timeout; the delegate callback alone cannot attribute the close to the hub. The diagnostic's internal `hub_closed` reason must therefore not be read as proof of remote cancellation. An ordinary trigger of the same prepared file at 13:13 received an ACK and ultimately retained approximately 38 seconds.

Despite the unacknowledged transport closure, Apple Home retained the 13:11 event as **1:00**, and actual playback was observed, including at 55 seconds beyond the earlier cutoff. Home's Share Clips action exported two files for that grouped event:

| Export | Video packets | Audio packets | Source fragments |
|---|---:|---:|---|
| First | 570 | 605 | 1–19 |
| Second | 331 | 352 | 20–31 |
| Combined | **901** | **957** | **All 31** |

Independent packet-payload alignment confirms every prepared video and audio packet is retained byte-for-byte in source order, with no omitted or duplicated range. The joins are continuous at 38.587 seconds for video and 38.720 seconds for audio; final packet ends are 60.999 and 61.248 seconds respectively. Home rebases the two tracks separately, removing the prepared file's 128-millisecond audio-start lead; this changes relative track origins without dropping payloads or speeding playback. The two exported files preserve the complete prepared source; they are not two separately acquired camera clips. Container duration fields in the second export include a nonzero timestamp origin and must not be added naively to the first export's duration.

This establishes complete retention for the tested older replay. A transport ACK is neither sufficient proof of retention nor a prerequisite for the observed saved result. The longer-motion setting remains an explicit diagnostic option, not a general guarantee about Home's future retention decisions. No paced-transfer change, native encoder change or guard relaxation was needed.

## Recent-event attempt and remaining blocker

The operator confirmed walking past the only camera reporting motion enabled at approximately 13:06 UTC; the exact walk start/end was unavailable. A bounded watch ran from 13:09:28 to 13:14:28 UTC, making ten catalog checks at 30-second intervals. Each returned 1,000 entries, including 24 for the target camera, with no entry in the recent walk window. Catalog completeness remains unknown. A separate cloud motion-event query returned zero events for the surrounding period. The operator also confirmed no new clip appeared in the Blink app.

No fresh source file was available to download or replay, so capture-to-availability, download and Home timing for a recent native event remain unverified. These observations do not establish whether the camera's physical PIR fired or explain why Blink exposed no recording. No camera command, arming/motion setting change, authentication refresh or production restart was performed for that attempt.

Private originals, both Home exports, alignment evidence, timestamps, hashes and host receipts remain in owner-only task scratch storage. The isolated diagnostic stopped cleanly at 13:30:05 UTC, preserving its pairing storage for restart. The installed plugin was not changed or restarted. The recent-event phase is blocked on obtaining a native recording; production integration, automatic polling/replay and publication are outside this completed prototype evidence.

## All-camera follow-up after operator enabled motion

At approximately 13:32 UTC, the operator reported enabling motion detection on the remaining cameras. Startup provider state at 13:35 confirmed four of four cameras motion-enabled, one armed system and active USB storage. Provider camera status `done` is command state and does not prove physical camera availability.

The second bounded watch ran from 13:35:24.669 to 13:40:24.671 UTC, making ten catalog checks at 30-second intervals. Every response contained 1,000 entries; the newest capture remained 1 November at 01:54:41 UTC. Successive request IDs changed, but the manifest ID and full sorted catalog-content hash remained identical. An initial cloud motion/media query at 13:35:25.753 returned zero entries; no later cloud query was made. These checks establish repeated retrieval of the same catalog generation, not the absence of every possible recording on USB.

Blink documents the app's USB view as the most recent 1,000 clips from the past 30 days. That cap would normally include a newly recorded clip; array ordering cannot hide a newer timestamp from the global maximum computed over the entire returned response. Current upstream local-manifest retrieval does not provide documented pagination or an additional server force-refresh argument. No guessed query parameters were introduced. Sources: [Sync Module 2 FAQ](https://support.blinkforhome.com/en_US/faq-sm/sync-module-2-faqs), [BlinkPy API](https://raw.githubusercontent.com/fronzbot/blinkpy/dev/blinkpy/api.py), [BlinkPy manifest refresh](https://raw.githubusercontent.com/fronzbot/blinkpy/dev/blinkpy/sync_module.py).

The existing SSH alias intermittently failed name resolution. Initial connectivity was recovered without changing the alias or network settings, and all ten catalog polls completed. A final additional homescreen health read was omitted when name resolution failed before that GET executed. Further health/capture prerequisite fields therefore remain unverified. The operator was asked whether a fresh clip is visible in the Blink app; that comparison remains pending.

The operator subsequently confirmed no new clip in the Blink app and described walking, cooking and moving items in the camera rooms. This reduces the likelihood of an API-only visibility problem without establishing whether PIR failed, a camera was occupied/offline, or storage failed after detection. A bounded read-only investigation of provider health, production feed ownership and primary Blink recording prerequisites began at approximately 13:52 UTC. It does not authorize changing recording settings or stopping production services.

The isolated replay diagnostic restarted with the same reviewed hashes, pairing and restored Home permissions at 13:35:31 UTC. No fresh source became available, so no preparation, replay or new HSV acceptance test occurred. It stopped cleanly at 13:44:12 UTC. No production plugin restart, camera capture/live-view command, configuration mutation or authentication refresh was performed. Private follow-up evidence is retained alongside the earlier acceptance proof.

## Native-recording investigation

The operator confirmed no new app clip despite walking, cooking and moving items in the camera rooms. Read-only investigation checked the recording prerequisites independently of the already successful HSV replay.

| Layer | Observed evidence | Limit |
|---|---|---|
| Provider homescreen, 13:55:15 UTC | System armed; all four cameras enabled, battery `ok`, clip length 60; Sync Module online with heartbeat at 13:54:29 | Cached camera `done` state is not a hardware reachability or PIR test |
| Camera cached configurations, 14:05:32 UTC | Four HTTP 200 responses; each has raw `video_recording_enable:true`, `video_recording_optional:true`, `motion_alert:true`, enabled true; sensitivities 8/7/8/7, alert interval 10 and video length 60 | Does not prove hardware motion detection or recording completion |
| USB status, 14:13:36 UTC | Raw `usb_state:"active"`, `usb_storage_full:false`, `storage_warning:0`, backup enabled and not in progress; last backup reports success on 31 October at 15:14:02 | Used value 22 has unverified units; status does not prove current write success |
| Per-camera local storage | Explicit raw `local_storage_enabled:false` for all four, while module local storage is enabled | Storage-routing semantics remain unresolved; it is not the native Video Recording switch |
| Pi runtime, 13:59:58 UTC | No native media worker, FFmpeg or prototype processes; Blink child has no Internet TCP connection at the snapshot | Does not exclude historical activity or a remote orphaned allocation |
| Production HomeKit state | Matching persisted controllers have recording inactive and no selected recording configuration; actual earlier HomeKit reads corroborate missing selected configuration | Persisted state is not current live introspection; these are separate from Blink's native recording permission |

A privileged process snapshot supersedes an initial unprivileged `/proc` pass that could not support absence inference. A bounded 96 MiB log tail covers 29 October through 2 November at 14:02, including the retained interval since 1 November. It shows one 1 November live-view sequence stopping at 05:51:17 with a retirement receipt at 05:51:21; the receipt's outcome was not extracted. No matched HSV/media/cleanup failure was found since 1 November, and no classified capture activity after 13:22. No production stop test is justified by the observed current capture state.

Current production code does not write `local_storage_enabled`: motion changes send only the enable/disable action and explicit quality updates send only video quality. There is no evidence that its current serializer filled a camera-storage default into those requests. The onset of the raw false storage flags is unknown because earlier retained contexts did not capture that field. Motion-zone bit counts were preserved structurally without guessing enabled-versus-masked semantics.

Blink documents the separate Video Recording privacy switch, direct local storage versus daily cloud-clip backup, and a USB-full threshold below 375 MB. The current API flags do not indicate recording switched off or USB full. Account storage entitlements and motion-notification observations remain the next checks; no root cause is confirmed. Sources: [Device Settings](https://support.blinkforhome.com/en_US/camera-settings-cat/new-device-layout-settings), [storage options](https://support.blinkforhome.com/en_US/blink-storage-options), [Sync Module FAQ](https://support.blinkforhome.com/en_US/faq-sm/sync-module-2-faqs).

The deeper USB status and planned entitlement reads use canonical GETs in the retained Android 59.2 contract, separate from mount, eject, format, trial and purchase operations. No native capture, live view, recording-setting change or production restart has occurred during these checks. Private sanitized provider, runtime and log receipts retain exact timestamps and explicit field-presence evidence.

At 14:22:30–31 UTC, two canonical entitlement/plan GETs returned HTTP 200. Four camera-product targets and one Sync Module product target report `ls_cam2sm` active with subscription not required; cloud storage and USB backup features report subscription required. One attached Plus plan reports `active:false`; inconsistent historical cycle metadata was not interpreted as current billing state. Target kinds were `catalina` and `sm2`, so the initial generic mapper did not retain individual camera associations. Product-group feature sets are direct observations, while eligibility alone does not explain the separate false local-storage setting or prove successful writes.

The operator independently confirmed USB connected with available space, then proposed unplugging/reconnecting the Sync Module. Given recording switches enabled, local-storage eligibility active, USB not reported full and no observed current plugin capture, a controlled Sync Module power cycle is the next proposed physical connectivity test. Blink's [camera connectivity guidance](https://support.blinkforhome.com/en_US/improving-camera-connectivity-with-your-sync-module) recommends disconnecting power for 30 seconds, then reconnecting. No restart has been performed by the agent. After it returns online, a timed walk past one camera and fresh native-clip check will test whether recording resumes. Motion-notification observation is still pending.

## Post-restart fresh native clip

At 15:14:55 UTC, the operator confirmed completing the power cycle and motion test. Exact physical times were unavailable. The phone was reserved for another agent's UI tests and was not accessed or required for the remaining checks; Home verification uses the Mac app.

Post-restart provider state showed the module online, updated at 15:13:26, heartbeat at 15:16:45, system armed and all four cameras enabled. USB remained active and not full. Camera `local_storage_enabled` fields remained false. The first catalog observation at 15:18:03.142 contained four recordings from 2 November, newest at 15:15:55; a later observation at 15:35:51 contained clips through 15:33:57. Native recording resumed after the power cycle, although this does not identify the underlying fault or prove recording by every camera.

The selected native 15:15:55 recording was subsequently matched by its exact retained clip identifier and capture timestamp to **Corner**. Original media is 12,260,089 bytes, SHA-256 `710ec39697dd7937433e23f4f9b73334f64a03cf6a17b8db400a5aaf7ca9b637`, preserved unchanged on both hosts. Capture-to-first-observation was 128.142 seconds, an upper bound on availability delay rather than an actual availability measurement.

The acquisition helper initially exhausted a short fixed polling count while Blink still reported a pending command. Recovery used a direct GET of the already prepared download without a second clip-preparation POST. Download ran from 15:22:48.042 to 15:23:12.231. The exact initial clip-preparation request time was not retained, but was bounded between 15:18:03.884 and 15:18:20.673. Later recovery operations preserve request context before polling.

The source video spans 60.565922222 seconds, while audio ends at 59.968 seconds. Its 0.597922222-second missing audio tail exceeds the unchanged worker's coverage tolerance. A separately labeled diagnostic copy appends exactly 9,567 silent samples at 16 kHz (0.5979375 seconds) while reencoding audio; all 1,816 encoded video payloads, timestamps and durations are unchanged. Normalization took 0.373 seconds and the original remains intact. Derived SHA-256: `3071580d88a16bc7ac2dd0060b4d5d70ed253cde9dd1b59e737f6a32b8c07550`.

Actual Pi preparation ran from 15:32:35.782 to 15:34:13.785 (98.003 seconds) and produced 60 fragments, SHA-256 `1fc8eae74a9f1f2a2d5e57e20e6beca0a9621589e1f82dad00149b458d0d3440`, 15,236,449 bytes. Independent audit found 1,800 prepared video samples spanning 60.532455556 seconds and 949 audio packets spanning 60.736 seconds, with contiguous fragment timelines and sync starts. A bounded decode of the original found 1,801 pictures plus 15 packets without a picture; preparation therefore contains one fewer picture and is 33.466667 milliseconds shorter. The cause remains undiagnosed and this test must not claim zero original-frame loss.

The initial fresh replay requested a 60.736-second motion hold at 15:34:49.816. HDS was requested 0.170 seconds later and the final packet was offered at 15:34:50.133. No ACK was observed; a `CANCELLED` close at 15:35:02.135 matches the 12-second HAP close timer and cleared motion. Home listed and played the new Corner footage, but its displayed duration grew only from 7 to about 19 seconds within the observation window. Paused inside that fresh event, its menu lacked Share/Delete actions; the previously verified 13:11 event still exposed Share Clips under the same paused-state check. Full fresh retention and export are not yet verified.

The next controlled diagnostic change delivers the identical prepared fragments progressively against their media timeline, including the selected initial buffer and final AAC tail. It keeps motion active through delivery and clears it at EOF before the final marker, without changing frame rate, media bytes, native guards or HAP timeouts. This tests a burst/timing hypothesis; the repeated 19-fragment boundary is not evidence of a documented Apple limit. Manual investigation and coordination delays in this prototype must not be represented as intrinsic production latency.

## Fresh recording acceptance and paced control

The optional paced-delivery mode passed 33 focused tests, targeted lint, build and independent code/security reviews. Review also independently verified that an over-90-second cumulative fragment timeline is rejected before motion. Native preparation and encoder arguments were unchanged. The local AST graph was refreshed without semantic/API calls.

After the isolated diagnostic restarted with its existing pairing, preparation reproduced the exact `1fc8…3440` MP4 hash. This second preparation ran 16:01:43.205–16:03:21.242 (98.037 seconds). The paced control triggered at 16:03:48.227; HDS began at 16:03:48.305. Four intact prefix fragments covering 4,035.432 milliseconds were immediate, with the remaining unchanged fragments scheduled against a monotonic clock. Motion cleared immediately before the final packet at 16:04:45.009, approximately 56.704 seconds after HDS began. A `CANCELLED` close followed at 16:04:57.015 without an ACK. No HAP timeout or native guard was relaxed.

At 16:04, the earlier **15:34 instant-plus-hold event** displayed **1:00**, before the paced event's retention was established. Mac Home later stopped responding to viewer controls; a clean quit/reopen restored interaction. The refreshed app displayed both the 15:34 and 16:03 events as one minute. This supersedes the earlier partial-duration observations: a short or stale display and missing export control were not sufficient to establish final truncation. Neither the exact first retention time nor a 30-minute cloud-processing delay is proven.

The original fresh 15:34 event was played in Mac Home, recognized as a person event, and exported through Home's Share Clip action. The completed owner-only export is 15,241,688 bytes, SHA-256 `8c45eddbb0b04587c5ddf0a1cd32100b9a9df404b84256965b568cd26bccf5b9`. Independent packet-payload alignment against the prepared MP4 confirms:

| Track | Prepared | Home export | Export timeline |
|---|---:|---:|---|
| H264 video | 1,800 | **1,800** | 0–60.532 seconds |
| AAC audio | 949 | **949** | 0–60.736 seconds |

All 60 prepared fragments are represented sequentially, with no omitted or extra payloads, timestamp gaps, overlaps or speedup. Video timestamp rounding differs by at most 0.811 milliseconds; audio spans are exact. Home rebases the tracks independently. This is full prepared-media retention from the **initial instant-plus-hold run**, so paced delivery was not required for that successful result. The paced event was observed as one minute, but was not independently exported or packet-matched; its separate acceptance claim remains limited accordingly.

The prototype objective of replaying an older saved clip and a fresh native motion clip into saved, playable HSV recordings is demonstrated. Local originals and explicitly labeled audio-tail-normalized copies remain preserved. This does not establish a lossless original-to-Home pipeline: the fresh preparation's one-picture/33.47-millisecond omission remains a native-worker follow-up, and its cause is unknown. Automatic acquisition/queueing, production integration, robust late/pending download handling and latency optimization remain outside this standalone prototype. In particular, the 98-second Pi preparation and manual handoffs must be accounted for before promising a production recording delay or concurrent-camera capacity.

The test runner stopped cleanly at 16:24:42 UTC with pairing and evidence preserved. No phone UI, camera live/capture command, native recording-setting change, production Homebridge restart or new package publication occurred. Current changes remain local and uncommitted on `codex/hsv-saved-clip-prototype`.
