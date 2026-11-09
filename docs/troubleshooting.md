# Troubleshooting

Last reviewed: 9 November 2026.

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
share durable ownership with mutations and storage work until command completion,
while reads and image downloads remain independent. Ordinary controls can
reconcile an explicit conflict against confirmed state within their bounds.
Native-storage refusals defer locally; an unknown accepted outcome remains owned
and does not authorize a replacement preparation.

If Blink acknowledged closing an owned Live View but its status check was
interrupted, startup or an explicit connection retry checks that known command's
status within the existing bound. Recovery does not resend the close request.
Unknown command IDs and unacknowledged closes retain their ownership fences.
An explicit **Retry Blink Connection** also reopens a faulted motion receiver
using its saved identity and acknowledgments. Ordinary polling keeps its current
subscription.

Startup also retires verified downloaded clips and private generated media
remnants left by interrupted downloads before accounting for cache capacity.
It preserves remote operation receipts, unexpected files and `.DS_Store`.
Do not clear the private state directory to recover from a pending operation.

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

Eligible reads back off within their retry budget. Recording commands do not
replay an ambiguous POST. If rate limits recur:

- Increase `pollInterval` to reduce API calls
- Check whether a known remote operation is unresolved before retrying a control
- Hide unwanted motion sensors with `exposeMotionDetected`; if HSV remains
  selected, its push subscription stays active without idle storage requests

## Node.js Version

The declared Node.js ranges are 20.3+, 22, 24 or 26; see `package.json`. The push
receiver uses `AbortSignal.any`, which is unavailable in Node 20.0–20.2.
Check your version:

```bash
node --version
```

## Configuration migration required

An upgrade from 0.10.0 can contain both retired secure-media and old recording
settings. Follow the [secure media upgrade](streaming.md#upgrade-configuration)
first, then the [native recording preview and application](native-recording-config-migration.md).
Use the explicit full Homebridge config path. The first converter applies with a
private backup; the second defaults to preview and requires `--apply` to replace.
Both preserve unrelated configuration and make no Blink requests or service
changes. The current `syncModuleFeedLimits` live-view setting remains valid.

## Motion Not Detected

- Ensure global/per-camera `exposeMotionDetected` is enabled for the public sensor
- Check that the network is armed (motion events only trigger when armed)
- Check the local push receiver status; reducing `pollInterval` does not speed up push
- For HSV, check Home camera/recording permissions and whether native Blink Local
  Storage clips are being saved. A motion alert does not establish a saved clip
- If an accepted command is unresolved, preserve its private state and inspect
  the known operation. Do not clear ownership or submit a replacement by guess
