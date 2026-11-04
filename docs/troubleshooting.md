# Troubleshooting

Last reviewed: 4 November 2026.

Start with the checks below. For safe collection/redaction use the
[diagnostic specification](debug_logging_spec.md) and the
[trusted evidence reporter](../scripts/pi-evidence/README.md). Never attach token
files, raw provider bodies, callback addresses or media to an issue.

## Blink connection failure in HomeKit

If startup authentication or device discovery fails, cached Blink accessories
remain in HomeKit so rooms, names, and automations are preserved, but their
services report a fault instead of appearing healthy.

The stable **Blink Connection** contact sensor reports confirmed outages after
three failed polling cycles. Its monitor remains active while the child bridge
runs; an open contact and fault describe unavailable Blink connectivity. A
separate **Retry Blink Connection** switch triggers recovery using stored sign-in
state. Repeated requests join the same recovery attempt. Both accessories retain
their identities after recovery; no re-pairing is needed.

To receive Apple's supported connection alerts, open Home Settings, choose the
sensor accessory type, select **Blink Connection**, and enable Activity
Notifications on each Apple device. Remote alerts require a home hub. Apple Home
controls notification presentation: this plugin cannot add a custom Retry/Cancel
dialog. Dismiss an alert to leave automatic recovery running; use the Retry
switch to request an immediate check. Physical notification delivery must be
verified on your devices; a Homebridge log entry is not proof of delivery.
See [Apple's notification instructions](https://support.apple.com/en-ie/105042).

HomeKit writes and fresh snapshot responses have a 12-second response limit.
Started Blink commands may finish later; a timeout does not replay a mutation.
Queued mutations that expire before starting are not sent. Thumbnail captures
share the mutation queue until command completion, while reads and image
downloads remain independent. An HTTP 409 is reconciled against fresh state or
retried within bounded limits; exhausted conflicts return a HomeKit error.

Persistent snapshots remain manual-refresh images. Their download/cache age and
last observed successful capture age are separate diagnostics. A busy capture
may return an existing thumbnail and is explicitly labelled as a fallback.
Automatic status recovery retries one transient homescreen GET failure within a
25-second budget, without automatically signing in again for network outages.
Confirmed outages log a bounded, unauthenticated DNS/connection diagnostic;
credentials, response bodies, and resolved IP addresses are excluded.

## Live video fails, stutters or stops

First distinguish a current camera problem from a HomeKit conversion problem.
Check battery/power status, camera connectivity and live view in the official
Blink app with the Home viewer closed. A cached image or the Home “Live” label
alone is not proof of changing video or audible audio. Battery depletion and
provider outages need separate evidence; a disconnect message alone does not
identify their cause.

Check the installed package's verified worker and negotiated codec in bounded
startup receipts. A missing or modified worker needs a verified package reinstall,
not an executable-path override. See [packaged codec requirements](streaming.md#packaged-codec-requirements)
and the [upgrade migration](streaming.md#upgrade-configuration). AAC-ELD is no longer
offered; Home receives the supported codec update through normal HAP metadata.
Do not reset pairing or disable certificate verification to bypass a refused stream.

For stutter, compare the same camera and scene with the same network conditions.
The [quality guide](streaming.md#input-and-output-quality) describes lower output
profiles and the optional low-CPU preset. Change one setting at a time, save it,
apply it through your normal restart workflow, and verify the effective output
receipt. Collect matched CPU/memory and encoder progress before assigning a
cause to transcoding or Wi-Fi. Audio has its own negotiation and conversion;
changing video quality does not establish audio compatibility.

For STOP/reopen failures, retain timestamps for the explicit close, retirement
response or timeout, new stream start, first media and final cleanup. Bounded
reconnect exhaustion is a failure receipt, not proof of successful recovery.
HTTP 406 may be transient provider behavior; an eligible command GET has one
bounded retry, while liveview/completion POSTs are not ambiguously replayed.
Never include their capability URLs, command identifiers, process arguments or media in
an issue. Use the [diagnostic policy](debug_logging_spec.md) and
[release acceptance guidance](RELEASE.md) to record proof and limitations.

## Manual snapshot refresh

Enable the optional manual control through
[`persistSnapshotCache`](configuration.md#configuration-options). In Home,
select the camera's **Refresh Snapshot** control, not its Motion Detection or
network Security control. The refresh switch returns to Off after the attempt,
including an error; this is a momentary request, not a persistent mode.

A fresh-capture receipt and downloaded-image receipt distinguish a new snapshot
from a cached or provider-busy fallback. To verify freshness, close live viewers
and retry when the camera is idle. Concurrent requests coalesce, and failed
attempts have a 15-second retry backoff. Repeated rapid toggles do not guarantee
new images and can consume camera battery. Do not share the image itself in
public diagnostic reports.

## 401 Unauthorized / 403 Forbidden

- Keep `deviceId` stable and use **Test Connection** to retry with stored tokens.
- Change `deviceId` only when intentionally registering a new client; first use
  **Unlock & Re-authenticate**, then complete hosted sign-in and any verification
  again.
- Complete any client/account verification shown by the custom UI.
- If refresh has expired, use **Unlock & Re-authenticate** and start a fresh
  hosted sign-in.
- Do not manually choose a geographic tier; `tier_info` is authoritative.

## Rate Limits (429)

The plugin uses bounded backoff for eligible requests. If you see rate limits
frequently, adjust the polling source involved:

- Increase `pollInterval` to reduce state/cloud-motion polling.
- Set `enableMotionPolling` to `false` if you do not need Blink cloud clip motion
  events. This does not stop completed USB clip discovery or continuous recording.
- For saved-clip USB checks, use the separate interval under **Recording by Sync
  Module** (`syncModuleRecording[].pollIntervalSeconds`): 30 seconds by default,
  with a supported range of 15–300 seconds.

See [recording activity and limits](RECORDING.md#activity-and-resource-limits)
before changing unrelated settings.

## Node.js Version

This source revision supports Node.js 22, 24, or 26 LTS. Check the actual child
bridge runtime as well as your shell version; changing a shell alias does not
change an already running Homebridge service. Start with:

```bash
node --version
```

## Motion Not Detected

First distinguish Blink cloud motion events from HomeKit recording.

For **saved-clip HSV**, confirm that Blink is producing fresh native **Local
Storage** clips, with the system armed and camera motion enabled. Daily **Cloud
Clip Backup** to USB is different; USB connection, armed/online state or any cloud
clip in the Blink app does not prove native capture. See
[Blink's storage guidance](https://support.blinkforhome.com/en_US/514890).

Allow **Stream & Allow Recording** in Home for the wanted locations and choose
a motion-enabled policy and recording-audio preference. Wait for the camera's
**Initial clip scan**, then trigger a fresh native clip. Check **Recording setup
and activity** for
capture, download, preparation and offer times. Look for the result around Home's
ingestion/offer time, which can be later than Blink's capture time. Follow the
[recording guide](RECORDING.md) for the full first-clip and permission checks.
Enabling the cloud motion poller cannot create a missing native clip.

For draft/restart/report warnings, unknown or denied Home policy, ring-only
policy, pending scan, queue pressure, expiry or uncertain transport, follow the
[recording recovery table](RECORDING.md#recovery). Missing/stale reports do not
invalidate otherwise valid settings. Do not delete accessory persistence, reset
pairing or re-offer an uncertain clip as routine recovery.

For **continuous HSV**, verify that you explicitly selected that source and that
Home recording, Blink arming and camera motion permit events. Its local video
motion detector does not require `enableMotionPolling`.

For **Blink cloud motion events**, enable `enableMotionPolling` and check arming.
`pollInterval` controls those state/cloud checks; reducing it makes checks more
frequent but increases API traffic. It does not set the USB clip-discovery interval.
