# Record Blink video in Apple Home

Last reviewed: 4 November 2026.

This guide describes saved-clip recording and guided settings in `1.0.0-beta4`.
The USB import path uses matching protocol-4 media workers, qualified on all five
native targets before publication. This beta is intended for testing: ordinary
existing-camera setup, full Home recording/playback and multi-camera acceptance
remain pending. Local/Pi preparation and automated package qualification do not
establish those outcomes. See the
[current qualification record](audits/2026-11-04-hsv-readiness-qualification.md).

Use the ordinary Homebridge settings page. Recording support attaches to selected
existing camera accessories, preserving their pairing, rooms and automations.
The standalone replay accessory is a developer diagnostic, not an onboarding step.

## Set up and test the first recording

### 1. Identify the native storage source

In Blink, identify whether the Sync Module provides native **Local Storage**
clips or daily **Cloud Clip Backup** from cloud recordings. These are different
features. A connected drive with free space, an armed system, an enabled motion
switch or a cloud clip does not prove that fresh native USB files are available.
See [Blink's storage explanation](https://support.blinkforhome.com/en_US/514890).
This preflight identifies the arrangement; wait until step 4 before creating a
fresh test event.

Current source evidence is bounded:

| Arrangement | Evidence and uncertainty |
| --- | --- |
| Four provider camera targets of kind `catalina`, one module of kind `sm2`, active `ls_cam2sm` feature | Native manifests and prepared-clip retrieval succeeded, including fresh capture after an operator power cycle. Retail camera generation, complete current account/trial/billing state and region are unverified. |
| Camera `local_storage_enabled: false` | The flag stayed false despite successful retrieval, so it is not used alone to exclude cameras. |
| Daily Cloud Clip Backup or other camera/module/account arrangements | Not established by this test as a fresh native source. Confirm the arrangement and complete the fresh-clip test below. |

An inactive attached Plus-plan object does not prove that the account has no
subscription. Describe support by observed behavior rather than inferred billing
or retail model names.

### 2. Select cameras, Save and apply

Open Homebridge UI → Plugins → this plugin → Settings → **HomeKit recording**.
Selected-camera activity appears first; **Recording setup and prerequisites**
opens for first use and remains available as a disclosure afterwards.

Choose discovered cameras and a recording source. Review each card's source,
module and availability reason. Missing, excluded and ambiguous selections remain
visible; remove an old selection only when you no longer want it. Module
overrides are optional, as described below.

Click Homebridge's **Save**, restart the Blink child bridge through its normal
controls, then reopen settings. The browser compares its server-validated
selection revision with the child's applied report. Draft, unapplied or
reference-only status is not ready for a test. Missing, stale or old-format
reports never prevent saving otherwise valid settings.

### 3. Allow recording in Apple Home

For each camera, choose **Stream & Allow Recording** for Home and Away as wanted,
a motion-enabled recording policy and your recording-audio preference. Check the
compatible Home hub and eligible iCloud+ plan in Home; the plugin cannot verify
the plan or iCloud retention automatically.

Cards show observed Home recording, camera-active and recording-audio values, or
**not observed**, together with recording configuration status. These are HAP
observations, not guessed defaults. Effective audio also depends on the plugin
audio setting; audio off is valid video-only recording.

Saved replay requires a motion-enabled policy. Ring-only policy is unsupported
before preparation. Motion-enabled doorbells are not categorically excluded, but
automatic Blink ring delivery is not implemented. Turning recording off cancels
pending work; clips observed during a disallowed period are not uploaded later.
Camera-active and audio revocation apply throughout preparation and delivery.

### 4. Wait for the initial clip scan, then walk

Use **Refresh activity** until the camera's **Initial clip scan** is complete and
**Walk-test instructions** becomes available. The successful initial scan creates
a baseline: existing clips are observed without importing old history. Failed
scans remain pending; each newly registered camera needs its own successful scan,
including when the module catalog is empty. Do not create the fresh test event
before this completes.

1. Arm Blink and enable that camera's motion detection in Blink.
2. Walk across its view for about 15–20 seconds.
3. Confirm a corresponding new native recording in Blink. If none exists there,
   diagnose native capture/storage first; the plugin has no footage to import.
4. Refresh activity and follow the same job through discovery, download,
   preparation and offer. Finish one camera before expanding to a modest burst.

**Native USB file downloaded** means a newly eligible post-scan job obtained a
complete native file. It does not prove that your walk caused it or that Home
retained it. Match the original capture time to your test.

### 5. Find, play and keep important clips in Home

Use meaningful camera names and assign rooms in Home. Open the camera's recording
history and look around **Offered to Home (delayed)** time, rather than only the
original Blink capture time. Play the beginning, middle and end of the saved
event. A final packet, acknowledgement, `delivered` status, thumbnail or duration
label alone does not prove a complete playable recording. An ordinary close
without acknowledgement also does not prove failure; check Home manually.
Uncertain offers are not automatically repeated because a copy may already exist.

Home owns its timeline and person, animal, vehicle and package classification.
HSV history is a rolling ten-day window, with camera entitlement depending on the
iCloud+ plan. Save/export important clips through Home for longer retention; the
plugin provides no custom folders, tags or permanent archive. See
[Apple's Mac camera guide](https://support.apple.com/en-gb/guide/home/hmeb54708fc8/mac)
and [iPhone recording guide](https://support.apple.com/en-nz/guide/iphone/iph7bc5df9d9/27/ios/27).

Eligible devices/accounts may also offer video descriptions/summaries and Home or
Spotlight camera-clip search. These are optional Apple capabilities, not proven
plugin features or capabilities available to every user. Check
[Apple's video-summary requirements](https://support.apple.com/en-gb/127902) and
[iOS 27 guidance](https://support.apple.com/en-gb/149076).

Opening a Home camera tile can automatically start ordinary Live View, even when
you are opening it to reach history. Live View and manual Refresh Snapshot can
use battery. Saved-clip mode avoids an idle recording feed; battery-life savings
have not been measured.

## Source and Sync Module settings

**Saved Blink clips** is the default. It uses native Blink motion and completed
Sync Module USB recordings. Arm the system and enable camera motion in Blink;
confirm that the Blink app is actually creating clips. An armed status, enabled
motion switch or online camera does not prove that capture succeeded. The plugin
does not change those Blink settings and never deletes native clips.

The plugin checks each module every 30 seconds by default. Under **Recording by
Sync Module**, leave the source inherited and interval blank for defaults, or
choose a source and 15–300 second interval for that module. Removing both
overrides removes the saved row. An unavailable persisted module override can
be removed explicitly. No empty configuration row is needed.

Saved-clip recording does not start an idle live feed or automatic snapshot
capture. Existing cached/provider previews may therefore be old. Manual Live
View and Refresh Snapshot are explicit camera actions and remain available.
Saved-clip checks are separate from **Read motion events from Blink**; turning
that motion poller off does not turn off completed USB clip discovery.

**Continuous feed** is a separate opt-in per default or module. Home recording
permission keeps a live source open, shares it with manual viewers and enables
local video motion with a four-second prebuffer. This uses camera battery and
network bandwidth even when there is no motion. Blink may end or refuse sessions;
a buffer cannot recover missing source video. Turning Blink arming/motion off
suppresses events but may leave this feed running; turn recording off in Home to
stop it. Existing per-module live feed limits remain separate settings.

USB camera matching uses the original Blink camera name and module association,
not a Home display-name override. An ambiguous module/name match is unavailable
for replay rather than guessed. Native discovery is not gated solely on the
camera's `local_storage_enabled` flag, because real USB clips can exist while
that field is false.

## Delay, history and completeness

The plugin waits for Blink to finish a native clip, discovers it, downloads it
and prepares video in the native worker before offering it to Home. Preparation
can take tens of seconds on a Pi. Original capture time is preserved in local
activity, but Home displays ingestion time. Replayed motion can trigger delayed
Home notifications and automations. Historical insertion is not implemented.

First activation establishes a catalog baseline and does not flood Home with
old clips. Later discovery overlaps catalogs to find late-arriving clips, with
bounded retries and persistent deduplication. Clips older than 15 minutes are
not replayed. Blink's catalog is capped at 1,000 entries and is not guaranteed
to be globally sorted or complete, so complete acquisition cannot be promised.
Native clip lengths, motion-retrigger gaps and missing Blink recordings cannot
be repaired. A replay prefix is not a true pre-event camera buffer.

The original file is kept unchanged in private temporary storage. Preparation
reencodes video under the negotiated Home format. Tested genuine clips preserved
all available decoded pictures and their timestamps; this is not a pixel-lossless
claim. A short native audio tail may be normalized with up to two seconds of
explicit generated silence. Missing audio, interior discontinuities and larger
gaps fail preparation rather than silently concealing them.

## Activity and resource limits

**Recording setup and activity** reads the child's local report only. It shows
the desired/applied selection status, source/module, observed Home policy,
initial scan and current job, plus module checks, pending work and storage.
Capture, discovery, download, preparation, offer and acknowledgement times stay
together for one job; a newer capture is not spliced into an older active job.
Reports older than ten minutes are labelled stale when read. Refresh preserves
unsaved settings and expanded details. These statuses do not prevent saving
valid settings. Report data is stored at
`<Homebridge storage>/blink-recording/native-clips/health.json`; it contains no
download capability URLs or authentication values.

An offer and even a hub acknowledgement describe transport, not confirmed
retention. A normal Home stream close without acknowledgement is uncertain and
does not cause an automatic duplicate replay. Verify that the event is present
and playable in Apple Home. Capture and offer times are separate evidence.

Downloads are limited to 32 MiB each; source/prepared files and reservations
share a 128 MiB private store. Prepared memory is bounded to 32 MiB per camera
and 64 MiB in aggregate. Work reserves room for output before download, with a
64-job queue and at most 16 pending jobs per camera. Preparation uses one worker
on smaller hosts and up to two on hosts with at least four logical CPUs, subject
to reservations. Busy cameras and storage pressure can delay or expire jobs.
These limits do not establish sustained simultaneous acquisition from every
camera. One genuine approximately one-minute clip prepared in roughly 56–58
seconds on the measured Pi; a two-clip batch took about 69.6 seconds before
provider/queue overhead. These measurements do not establish sustained
four-camera coverage. Busy queues and the 15-minute expiry can omit Home copies
while Blink originals remain. The [qualification record](audits/2026-11-04-hsv-readiness-qualification.md)
owns exact sources, runtimes and remaining acceptance.

## Recovery

| Status or symptom | Next step |
| --- | --- |
| Missing/stale report or restart required | Save intended settings, restart the updated child bridge and refresh activity. Check child logs if it persists. Valid settings remain saveable. |
| Unresolved/excluded camera or ambiguous module/name | Refresh discovery, review Cameras in Home and choose a specific camera. Use distinct Blink names for USB matching and remove obsolete selections explicitly. |
| Home policy unknown/off or ring-only | Review Home recording options. Unknown means unobserved, not denied; saved replay needs motion enabled. |
| Initial clip scan pending | Wait for a successful catalog before creating the fresh event. Review the connection/native storage if the scan does not finish. |
| Waiting for native footage | Check whether Blink created the matching native clip. The cloud motion poller cannot create it. |
| Queued, preparing or storage pressure | Follow progress and review the original in Blink. Frequent clips can outpace preparation; an unrelated live-view limit does not accelerate it. |
| Failed or expired Home copy | Read the reason and child logs; review the Blink original. The plugin does not delete it. |
| Acknowledged or uncertain delivery | Find and play the event in Home. Neither state confirms retention; uncertain offers are not automatically duplicated. |

## Explicit configuration conversion

Normal GUI setup does not require a conversion script. The plugin does not
rewrite configuration at startup. For an existing configuration needing the
secure-media conversion, use its exact file path:

```sh
node /absolute/plugin/path/scripts/migrate-secure-media-config.cjs /absolute/homebridge/config.json
node /absolute/plugin/path/scripts/migrate-secure-media-config.cjs /absolute/homebridge/config.json --apply
```

The first command previews whether changes are needed and writes nothing. The
second saves an exact-byte owner-only backup beside the file before atomically
replacing it. It makes an implicit recording source explicitly `saved-clips`,
preserves explicit `continuous` and module choices, removes retired secure-media
settings and preserves unrelated platforms. It is idempotent. The script is
POSIX-only and does not restart a service. After reviewing the resulting settings,
restart the child bridge yourself to apply them. Backups contain private settings
and should remain owner-only.
