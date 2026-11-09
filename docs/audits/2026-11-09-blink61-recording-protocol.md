# Official Blink 61.0 recording protocol: bounded static findings

## Artifact and method

The target is the Play-installed Blink application copied from the attached tablet by the root agent: package `com.immediasemi.android.blink`, version **61.0**, version code **29859371**. The base APK is 148,776,328 bytes with SHA-256 `758085236e6bced77d5bc7f4c28651e66004043f4349ce4c2a0be9cf54d26615`. Root's acquisition manifest in `logs/blink-apk/61.0-29859371` records the tablet and four split APKs. This establishes the installed tablet version; it is not a claim about the newest release in every Play region.

The reverse-engineer-anything skill was applied. Its Android MCP operation was attempted once and returned `capability_unavailable`: the connected REA server has no configured caller-supplied `REA_JADX_MCP_JAR`. The exact response is retained in `rea-android-provider-blocker.json`. No REA/client/global configuration was changed. There are **no successful REA Android Evidence IDs** for these findings.

Supported fallback analysis used the existing JADX **1.5.6** JAR and Android SDK `apkanalyzer`. A small local Java driver uses that installed JADX API, loads one APK per session, inventories raw class identities, and saves selected classes. Two initial completed sessions recovered the selected FCM, clip, command and live-view code; the focused registration follow-up below adds one completed session. Selected decisive flows were crosschecked against fresh DEX disassembly from the same base APK. These are **shell JADX/DEX artifacts**, not REA Evidence and not observed runtime traffic. Source hashes and exact selectors are in the accompanying artifact ledger.

The initial 1,600 MiB CLI runs exhausted their heap while building the APK-wide usage index. Their failed logs/receipts are preserved. Corrected sessions used one reused six-GiB JVM each and completed. JADX reconstruction warnings and malformed coroutine control flow remain explicit; the DEX proofs support the decisive calls and predicates. Neither the APK nor an emulator was launched. No device, Pi, Blink account, camera, Sync Module, authentication or provider state was changed by this analysis.

## Findings and their evidence

### APK61-S01 — Native USB motion is a push event, not a finished video

`BlinkFirebaseMessagingService.onMessageReceived` copies `RemoteMessage.getData()` into a Bundle using string values, adds `collapse_key`, and delegates to `ProcessNotification` after authentication/Braze routing. `ProcessNotification.processPayload` dispatches `category=motion`, `event_type=cam2sm_motion` to `sendCamToSyncModuleMotionNotification`.

The native motion handler requires `camera` and `target`, derives the app's local camera identifier from those fields, reads `network` and `created_at`, and creates a motion notification and live-view *deeplink*. It does not execute that deeplink. This branch invokes no manifest request, clip request, live-view start, homescreen refresh or image capture. The outer notification path can separately acknowledge messages when `return_receipt=true`; analytics/receipt traffic must not be confused with clip preparation.

The demonstrated native-motion payload does not establish a clip ID, manifest ID, saved-file URL or successful camera-to-USB transfer. It supports promptly signalling motion followed by a separate delayed/coalesced acquisition attempt. It must not be treated as proof that a recording exists.

Evidence: `jadx61-session/com.immediasemi.blink.notification.message.BlinkFirebaseMessagingService.java:45–68`; `...ProcessNotification.java:241–281,458–486,1026–1043`; `dex61-proofs/fcm-receive.smali`, `push-dispatch.smali`, `cam2sm-motion.smali`.

### APK61-S02 — Early motion, cloud clips and native motion have different payloads

The generic `category=media` path reads `command`, `network`, `created_at` and `estimated_clip_length` and creates an early-motion notification intent. The `cloud_motion` path can carry `video` as a media identifier. These paths are distinct from `cam2sm_motion`. A generic parser that equates every notification's `command`, `video` or camera number with a completed native USB clip would be incorrect.

FCM data is consumed as strings. The app parses `created_at` with `OffsetDateTime.parse(...).toInstant().toEpochMilli()` for notification display time. This establishes its accepted offset-bearing timestamp representation and milliseconds conversion; it does not establish physical PIR time, exact recording start or upload/transfer completion time. The `estimated_clip_length` field is passed as a string by the notification handler; this pass does not establish a universal duration unit or availability for native USB notifications. The `target` device kind participates in camera-ID mapping and must accompany the server camera ID.

Evidence: `...ProcessNotification.java:399–453,458–486,1026–1043`; the exact native-motion and dispatch DEX proofs above. No live notification payload was collected in this pass.

### APK61-S03 — Official push registration uses Firebase and the current authenticated client

`FcmNotificationTokenDataSource` obtains its token through `FirebaseMessaging.getInstance().getToken()`. Token rotation calls `UpdateClientUseCase`. `ClientApi.postClientUpdate` declares **POST `/clients/{injected_client_id}/update`**, returning Unit, with `ClientUpdatePostBody`. Its modeled/serializer descriptor fields are `appVersion`, `osVersion`, `clientName` and nullable `notificationKey`. The update body is constructed from installed-app/device information plus the notification token. The serializer descriptor spells these names in camel case. The focused follow-up below verifies that the regular Retrofit converter uses SnakeCase, producing app_version, os_version, client_name and notification_key on the wire.

This is an update for the authenticated app's injected client ID, not a demonstrated generic webhook registration endpoint. The APK does not establish that a Node plugin can obtain and own a working FCM receiver identity or that the Blink backend accepts that identity. Reusing the tablet's FCM token would not demonstrate delivery to the plugin and could alter an existing client's notification binding. A plugin-owned receiver and registration remain a concrete runtime/provider acceptance gate; do not impersonate an Android installation or reuse another client's token as an inferred shortcut.

Evidence: `...BlinkFirebaseMessagingService.java:73–88`; `...FcmNotificationTokenDataSource.java:56–90`; `...ClientApi.java:26–27`; `...ClientUpdatePostBody.java:24–27,108–140`; DEX `client-api.smali:101–119`, `client-update-serializer.smali:104–122`, `update-client-body.smali`, `update-client-dispatch.smali:276–370`.

### APK61-S04 — Opening the clip list is an explicit foreground operation

`ClipListViewModel.enteredClipList` can refresh when its last refresh is older than **60 seconds** or the account changed, with separate handling for an already selected item. This is a freshness check on entering the list, not an established 60-second recurring timer. Pull-to-refresh ignores a request while `_isLoading` is true. Loading a local storage option launches one manifest-loading coroutine in `viewModelScope`; generation tokens prevent stale fetches from overwriting a newer selection.

No periodic native-manifest loop was established in the examined view model or in the native-motion push handler. This is a bounded negative result, not proof that the whole APK has zero background requests. Generic application sync and analytics are outside this lifetime conclusion. The native-motion deeplink goes to live view; the app's choice to open live view after a human tap does not authorize a plugin to start live view on every PIR event.

Evidence: `...ClipListViewModel.java:4670–4705,4812–4826,5810–5814`; DEX `clip-list-entered.smali:150–179`, `clip-list-loading.smali`.

### APK61-S05 — Native catalog discovery is one accepted workflow, not repeated preparation

The official native catalog path is:

1. `MediaApi.getLocalStorageManifestKommand`: empty-body **POST** `v1/accounts/{account}/networks/{network}/sync_modules/{sync}/local_storage/manifest/request`.
2. Poll that accepted command through `CommandApi.commandPollWithChildren` using **GET** `/accounts/{account}/networks/{network}/commands/{command}`.
3. On successful completion, take the first child command ID from `SupervisorKommandWithChildren.getId()` and call **GET** `v1/accounts/{account}/networks/{network}/sync_modules/{sync}/local_storage/media/{childCommandId}`.

`SupervisorKommandWithChildren.getId()` returns zero if the child list is absent or empty. A redesign should reject/defer that case instead of assuming the parent ID or fetching `/media/0`. A parent command ID, child command ID and returned manifest ID are separate values. The official `getLocalStorageMedia` API is distinct from the reference plugin/helper's legacy manifest-result route.

Fresh DEX inspection of the available57.1 and59.2 base APKs confirms the same three native-storage declarations (manifest POST, clip POST and `/local_storage/media/{commandId}` GET); this route is not a new61.0 change. Their proofs are `reference57-media-api.smali:180,271–303` and `reference59-media-api.smali:210,301–333`. The demonstrated successful path contributes one preparation POST, N accepted-command status GETs, and one catalog GET. N depends on actual completion/lifetime; it is not a constant request count. No storage-status/camera-settings preflight or fresh preparation POST inside the shown status-poll loop is demonstrated.

Evidence: `...MediaApi.java:33–37`; `...BlinkClipListRepository.java:212–311`; `...ClipListViewModel.java:5937–5949,6047–6059,6212–6216`; `jadx61-followup/...SupervisorKommandWithChildren.java:32–37`; DEX `clip-repository.smali`, `children-poll-defaults.smali`, `children-poller.smali`, `clip-list-loading.smali` and `first-child-id.smali:5–27`.

### APK61-S06 — Selecting a local clip requires preparation before the file GET

`ClipListViewModel.getLocalStorageClip` uses its selected storage option, catalog manifest ID and selected media ID to call the repository. `MediaApi.getClipKommand` sends an empty-body **POST** `.../local_storage/manifest/{manifestId}/clip/request/{clipId}`. The repository polls that accepted command with children. On success, the view model calls `getVideo(media)`, which delegates through `LoadClipPlayerItem` to the video repository. The binary API is a streaming **GET** with a dynamic `@Url`, and the video-repository coroutine reads the media record's `getMedia()` value. The final downloaded bytes become a local file for playback.

Thus a selected native USB clip is not necessarily a single direct GET. Conversely, nothing in this successful path requires a perpetual prebuffer/live-view session, another manifest preparation for every status read, or a generic `/done` POST after a completed file download. Caching/range behavior and all HTTP retry paths were not exhaustively mapped, so a total wire count for binary transfer is not claimed.

Evidence: `...MediaApi.java:24–25`; `...BlinkClipListRepository.java` selected-clip method; `...ClipListViewModel.java:8128–8218,7886–7911`; followup `...LoadExoClipPlayerItem.java:96–116`; DEX `clip-repository.smali`, `video-api.smali:39–59`, `video-download.smali:281–401`.

### APK61-S07 — Completion, success, ownership and abandonment are distinct

`SupervisorKommand.isSuccessful()` requires both `complete=true` and numeric `status=0`. A terminal nonzero status is a completed failure. The catalog and selected-clip helpers choose `KommandPolling.DEFAULT_POLLING_INTERVAL`, which is two seconds, even though the child poller's independent constructor default is one second. Follow the actual caller/default-helper chain rather than copying an isolated constructor default.

`AbstractKommandPolling.prePollAction` records one current command per network in `CommandPollManager`; `postPollAction` clears that local map. `AbstractPolling` invokes cleanup on terminal and exceptional/cancellation exits. These are process-local bookkeeping operations, not evidence that a backend/device operation has been cancelled or the Sync Module is idle. The map and UI busy guards are not proof of a transactional cross-client server mutex.

The generic class supports optional timeout and max-error-retry values, but the inspected storage constructor path passes a null elapsed timeout and `pollUntilDone` selects a null default max-error-retry value. No finite generic elapsed deadline or polling ceiling is established for this path. Coroutine ownership/view-model lifetime can end the wait; a daemon must enforce its own bounded budgets and preserve uncertain command ownership instead of interpreting a local deadline as provider completion.

Evidence: `...SupervisorKommand.java` success predicate; `...SupervisorKommandChildrenPolling.java:25–46`; `jadx61-followup/...KommandPolling.java:95–99`, `...SupervisorKommandWithChildrenKt.java`, `...AbstractKommandPolling.java:32–60`; `...AbstractPolling.java:565–586,689–708,756–792,798–847`; DEX `supervisor-success.smali:5–17`, `poll-loop.smali:517,698–705,816,865–913,956,1042`, `children-poll-defaults.smali`, `children-poller.smali`.

### APK61-S08 — A native live-view stop remains a separate protocol boundary

The Java/native live-view path still owns a Walnut `Player` whose stop wrapper calls native `stop(false)`, followed by renderer/audio/timer/signalling cleanup in the session manager. `CommandApi.terminateCommand` separately declares empty-body POST `/commands/{id}/done` returning `Call<Unit>`. Its presence does not establish that a storage operation should receive `/done`, or that HTTP `/done` plus a socket close is equivalent to the official player's native live-view termination. Native shutdown bytes and complete server-side resource release are not established by this Java/DEX pass.

Evidence: `...Player.java` stop wrapper; `...BlinkWalnutLiveViewSessionManager.java` stopLiveView; `...WalnutSignalling.java` finish path; `...CommandApi.java:39–40`. This limitation is deliberate; no live session was started to investigate it.

## Redesign consequences

- Motion delivery and video acquisition need separate owners. Parse authenticated, account/network/device-matched native motion promptly; a delayed catalog workflow must not be presented as an immediate completed-video event.
- Idle recording integration should prepare no native manifests. Coalesce duplicate motion indications, wait for the camera's recording window, and admit one native-storage workflow per network at a time.
- Keep accepted operation IDs and result/manifest identity distinct. Poll the accepted ID within a finite local request/deadline budget; do not submit another preparation because the previous wait expired or its result is uncertain.
- Interpret terminal failure correctly. Busy responses, transport ambiguity, cancellation and timeout must stop dependent work rather than cause automatic replay, extra preflights, refresh loops or broad command cleanup.
- Retrieve provider-returned media metadata/file URLs with appropriate authenticated host handling. Do not upload image/video files, change native recording settings, start live view, or refresh camera thumbnails to discover USB motion clips.
- Plugin-owned FCM acquisition/delivery, actual native clip readiness/delay, HomeKit recording acceptance and lack of native-recording interference require future controlled runtime acceptance. Static APK analysis and offline tests cannot prove those outcomes or the original persistent-lock root cause.

## Coverage ledger

| Question | Result | Boundary |
| --- | --- | --- |
| Tablet/reference artifact identity and native API declaration comparison | Answered for61.0;57.1/59.2 native-storage declarations freshly crosschecked | Root owns full acquisition/signature receipt; comparison is bounded to these declarations |
| Native USB motion push dispatch and fields | Answered statically | No live payload/delivery/physical trigger measurement |
| Android token/client-update path | Answered for modeled fields and endpoint | Wire contract resolved in APK61-S09; actual MCS/Blink delivery and backend acceptance remain unproven |
| Foreground local catalog/playback path | Answered within selected view model/repository/API flows | Whole-application background traffic and exhaustive HTTP retries are not claimed |
| Command success, child IDs, pacing and cleanup | Answered statically with raw DEX corroboration | No finite generic app ceiling proven; local cleanup is not server cancellation |
| Native live-view stop protocol | Partially answered | Native wire shutdown/backend release not established |
| Cause of the historical persistent recording lock | Unresolved | Rollback correlation and static discrepancies do not isolate its initiating request |

All opened local JADX sessions completed and closed. No Android/REA active native target was opened. Private logs, failed attempts and exact DEX selectors remain available for audit without reinstalling any Blink-facing helper on the Pi.

---

# Blink 61.0 client registration and alternate channel follow-up

This bounded follow-up uses the same tablet base APK, SHA-256 `758085236e6bced77d5bc7f4c28651e66004043f4349ce4c2a0be9cf54d26615`. One additional reused six-GiB JADX session recovered eight selected classes and completed/closed. Eight focused DEX extractions independently confirmed the naming, converter, URL, ownership and model predicates; three additional small DEX classes classified the protocol-literal candidates. No APK execution, provider request, client registration, Pi/device action or REA/client/global configuration change occurred.

## APK61-S09 — Exact client update request

The official declaration resolves to:

```text
POST https://rest-{accountTier}.immedia-semi.com/clients/{ownAuthenticatedClientId}/update
Content-Type: application/json; charset=UTF8
```

The regular authenticated Retrofit uses base `https://rest-{tier}.immedia-semi.com/api/`, provided by `BaseUrlModule.provideRestUrl`. `ClientApi.postClientUpdate` has a leading-slash `/clients/{injected_client_id}/update` annotation, so URL resolution uses the host root and drops `/api/`. This service is provided by `AuthenticatedRestApiModule`, not the shared-user Retrofit whose base uses `{shared_tier}`. Existing authentication and tier handling must be reused; a shared account/network URL is not the target.

The modeled request uses this wire shape:

```json
{
  "app_version": "<declared client app version>",
  "os_version": "<client OS metadata>",
  "client_name": "<client display name>",
  "notification_key": "<new token owned by this client receiver>"
}
```

`NetworkModule.provideJson` explicitly selects `JsonNamingStrategy.SnakeCase`, with `encodeDefaults=true` and `explicitNulls=false`. Its regular Retrofit factory chooses the Kotlin serialization converter for `@Serializable` request models. `ClientUpdatePostBody` is such a model. This resolves the earlier ambiguity between its camel-case descriptor names and snake-case wire names.

The app serializer requires `appVersion`, `osVersion` and `clientName` (mask `0x7`); its public constructor requires those three strings to be nonnull. `notificationKey` is nullable/default-null in the app model. Registering a receiver requires supplying its nonempty owned token. The app normally fills version/OS/name from its installed app and device; this observation does not make tablet identity appropriate for a plugin. No exact string format, minimum length, backend acceptance of partial bodies, or token-unregistration semantics was proven here. These are app-model requirements and construction, not a substitute for actual backend validation.

`ClientIdInterceptor` takes the current client ID from `AccountRepository.getClientIdStream()` via `firstOrNull`, converts the numeric ID to a string, and substitutes the encoded `injected_client_id` token in the URL. Missing required substitution produces `PathParamNotFoundException`. Thus the official flow updates the authenticated installation's current client. A plugin proof must bind only its verified own client ID and preserve other clients' notification bindings; the tablet's token or client ID is not a demonstrated route to delivering messages to the plugin.

The Retrofit method returns `Unit`. A normal successful response can be empty and has no demonstrated command ID. The app does not poll a command or send `/done` after this metadata update. A successful HTTP update proves only that the request was accepted at that HTTP/API layer; it does not prove Google registration, MCS connectivity, Blink-to-token routing, receipt of an actual camera event, or delivery after reconnect/restart.

Exact evidence:

- `jadx61-registration/com.immediasemi.blink.inject.NetworkModule.java:67–105,208–267`: default JSON configuration, authenticated client and request-converter selection.
- `dex61-registration/json-default.smali:11–31`: encoded defaults, omitted explicit nulls and SnakeCase.
- `dex61-registration/request-converter.smali:123–208`: `@Serializable` request types select the Kotlin converter.
- `dex61-registration/client-update-model.smali:73,109–164`: Serializable annotation, required-mask/nonnull fields and nullable default.
- `dex61-registration/base-url-module.smali:156–179` and `base-urls.smali:63–65`: regional versus shared base templates.
- Existing `jadx61-followup/...AuthenticatedRestApiModule.java:45–68` and `jadx61-session/...ClientApi.java:26–27`: concrete service owner, leading-slash route and Unit result.
- `jadx61-registration/...ClientIdInterceptor.java:36–47,60–74` and `dex61-registration/client-id-source.smali:199–233`: current client stream, path substitution and absence handling.
- Earlier `dex61-proofs/update-client-dispatch.smali:276–370`: app/device metadata and token are passed to `ClientUpdatePostBody` and `postClientUpdate`.

## APK61-S10 — Bounded alternative-channel result

`NotificationTokenModule.provideTokenNotificationDataSource` explicitly selects Amazon Device Messaging on Amazon devices and Firebase Cloud Messaging otherwise. `BlinkAdmMessagingHandlerJob.onMessage` forwards ADM extras to the same `ProcessNotification` handler; ADM registration uses the same client-update use case. This is a second official mobile push transport, not a demonstrated generic server webhook.

A bounded scan of all **12 DEX string tables** examined **729,255 string rows** for literal `ws://`, `wss://`, `mqtt://`, `mqtts://` and `text/event-stream` candidates. It found three Blink WebSocket signalling URLs and one event-stream MIME literal. A focused DEX instruction-reference pass over the two containing DEX files examined 110,778 method bodies and found their actual defining methods:

- The three WebSocket URLs are selected by `StreamingCoreModule.toSignalingURL(Environment)`. The module wires them into the Ring streaming SDK's WebRTC/RTP signalling and playback services; it does not establish a standalone native-PIR event subscription.
- `text/event-stream` is used by `bo.app.u6.invokeSuspend` to open a URLConnection. Its actual caller `bo.app.v6` uses Braze logging and DUST stream lifecycle messages. This is evidence of an SDK SSE stream, not evidence of Blink native-camera motion events.
- No literal MQTT URL was found in these DEX string tables. No alternate native-motion SSE/WebSocket/MQTT channel was established in the traced notification modules and these bounded candidates.

This does **not** prove the whole APK/native libraries can contain no other channel. Obfuscated or dynamically constructed URLs, native libraries, encrypted configuration and unexamined runtime behavior remain outside the search. No candidate endpoint was contacted. The explicit motion delivery path established by this analysis remains FCM/ADM plus the notification handler; a plugin-owned FCM receiver can be explored without assuming an unverified alternate stream.

Evidence: `jadx61-registration/...NotificationTokenModule.java:29–32`; `...BlinkAdmMessagingHandlerJob.java:31–47`; `dex61-registration/token-transport-selector.smali`; `alternate-channel-string-candidates.json`; `alternate-channel-literal-callers.tsv`; `dex61-registration/streaming-signalling-module.smali:149–194,311–337,402–503`; `braze-event-stream.smali:66–101`; `braze-stream-caller.smali:322–389` and its DUST/Braze logging statements.

## Catalog filename and matching boundary

The selected Media model exposes provider media identity, creation time, device/network identity and media URLs. It does not guarantee a physical USB filename. The coordinating agent's catalog readback reports opaque API clip-request URLs rather than USB basenames. Therefore a timestamp parser for a physical USB filename cannot be applied to that observed API catalog. Event-to-clip matching should use canonical account/network/device identity and the provider creation timestamp with explicit offset/date/timezone context and a bounded tolerance. A physical filename is an optional separately verified evidence source. Motion time and provider `created_at` must not be silently treated as identical; DST ambiguity, delayed saves and competing nearby clips must remain visible.

## Runtime acceptance remains separate

No Firebase project-owner console access, service-account key or project-admin identity appears in the APK's ordinary client token/update path. That is consistent with a mobile client obtaining its own token using the public app/project configuration. Whether a separately implemented receiver can register, remain connected and receive Blink's real motion messages must still be demonstrated. This follow-up supplies the exact update contract; it does not assert that the root agent's separate receiver proof has succeeded.

At handoff, the coordinating agent reports a separate proof that created its own FCM installation/token from the APK public configuration using four successful Google HTTP200 exchanges, without Firebase owner credentials and without Blink requests. That evidence is attributed to the coordinating agent and was not independently inspected in this APK pass. It advances Google registration only. MCS delivery, safe binding to the plugin-owned Blink client, actual Blink motion delivery and reconnect behavior remain separate acceptance gates.


## Direct receiver qualification and subscription follow-up

The coordinating agent subsequently qualified an owned Google identity using the
public 61.0 app parameters: four Google HTTP 200 responses, then a verified TLS
MCS LoginResponse. The exact plugin receiver component later bound its own token
to the plugin-owned Blink client with one regional metadata POST. Blink returned
HTTP 200 with code 241, `Client successfully updated`; the receiver emitted
`client-bound` and `ready`. No camera, Sync Module, storage, live-view, thumbnail
or OAuth request formed part of that qualification. Actual motion delivery
remains unverified at this revision; see the maintained
[evidence ledger](../plans/event-driven-hsv-redesign.md#provider-evidence).

A bounded additional 61.0 pass inspected the concrete notification preferences,
client options and receipt consumers. The preferences model concerns marketing,
and the typed client-options models expose no named motion-push opt-in. A direct
reference scan of all 12 DEX files (649,244 method bodies) found the Blink and
Braze `FirebaseMessaging.getToken()` call sites, with no direct calls to
`subscribeToTopic`, `unsubscribeFromTopic`, `setAutoInitEnabled` or `deleteToken`.
The UI's subscription repository describes plan/feature availability. None of
these findings establishes a further required motion subscription request.

Optional HTTP notification receipts occur after payload processing and depend
on `return_receipt` and `tier`. They are not demonstrated to be a delivery
precondition. Reflection, native/dynamic code, generic key/value options and
backend token-platform routing remain outside this negative finding. In
particular, a successful client update does not prove delivery to a separately
implemented receiver. No speculative preference/topic/receipt request was made.

Exact anchors, support outputs and hashes are retained privately as
`notification-delivery-prerequisites.md` and
`notification-prerequisite-trace/receipt.json` in the acquisition evidence. The
owned JADX session closed normally. This follow-up does not expand the generated
59.2 full API catalog or claim an APK runtime packet capture.

## Web Push transport and project identity

The Node receiver's pinned registration uses a Chromium Web Push endpoint and
associates it with the Firebase project. That differs from assuming every outer
MCS `DataMessageStanza.from` is a Firebase project number. Chromium maps that
outer value to transport `sender_id` / `authorized_entity` for decryption-key
lookup; Web Push registration derives its sender information from the normalized
application-server/VAPID key. Firebase's messaging SDK reads the project-level
`from` from the decrypted PushEvent JSON and exposes that inner field.

Primary code: [Chromium incoming mapping](https://raw.githubusercontent.com/chromium/chromium/main/components/gcm_driver/gcm_client_impl.cc),
[encryption-key lookup](https://raw.githubusercontent.com/chromium/chromium/main/components/gcm_driver/crypto/gcm_encryption_provider.cc),
[Web Push registration](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/push_messaging/push_messaging_service_impl.cc),
[Firebase push handling](https://raw.githubusercontent.com/firebase/firebase-js-sdk/main/packages/messaging/src/listeners/sw-listeners.ts),
and [Firebase payload mapping](https://raw.githubusercontent.com/firebase/firebase-js-sdk/main/packages/messaging/src/helpers/externalizePayload.ts).
Pinned Eneris 4.4.0 `gcm.js`, `fcm.js` and `client.js` corroborate endpoint
registration followed by decryption, without an outer-project filter.

The first receiver revision conflated these identities. The correction decrypts
with the owned ECE keys, requires the exact configured project in the inner
envelope, and then validates/extracts bounded data. Plaintext retains its outer
project check. Real-encryption positive/negative tests and independent review
passed. Static evidence alone did not establish the account's actual outer value.

The subsequent Google-only observation captured fourteen real encrypted
`cam2sm_motion` messages. Every outer sender differed from the project sender;
every decrypted inner sender matched it. Offline replay of those exact encrypted
captures through the old and corrected source delivered zero and fourteen
messages respectively. This proves the old filter rejects the observed messages;
it does not reconstruct exactly when the earlier connection received them.

Thirteen older messages were intentionally fenced by the new activation boundary.
A fresh native event created at 08:28:02 UTC arrived at 08:28:03.080 and completed
the receiver's durable acceptance. That interval is notification time to receipt,
not measured physical PIR latency. The callback's provider/account/device fields
also passed the canonical motion decoder using retained local camera identity.
These are motion observations, not saved-video or Home retention evidence.

Automatic-family connections had timed out before frames; an independent IPv4
verified TLS probe succeeded while IPv6 returned `EHOSTUNREACH`. The successful
observer explicitly selected IPv4 through an identified diagnostic hook while
retaining TLS, owned-key decryption and project validation. The isolated production
worker was then updated to prefer IPv4 DNS results while retaining IPv6 and
automatic family selection. Its unmodified connection path reconnected and
durably accepted a fresh 08:51:21 UTC native event at 08:51:22.153, without any
socket/frame hook. Pi full-plugin qualification remains open. The follow-up made no Blink requests;
the only Blink request was the earlier client registration. Private raw frames,
receiver state, hook/source hashes and replay receipts preserve the evidence.
