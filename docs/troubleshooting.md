# Troubleshooting

[Documentation home](README.md) · [How it works](how-it-works.md) · [Troubleshooting](troubleshooting.md)


Last reviewed: 15 November 2026.

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
When Blink has already confirmed command completion, a failed media transfer is
settled locally so later controls and recording jobs can proceed.
Startup and explicit connection retry reconcile known ordinary and native
command IDs within their existing bounds. Ordinary polling adds no ownership
probes, and unknown IDs remain fenced.

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

## Motion arrives but no Home recording appears

First complete the [recording setup checklist](configuration.md#recording-setup-checklist)
for the affected camera. In Apple Home, open its tile, then **Settings → Recording
Options**. Check **When Home** and **When Away** separately: the current mode must
allow **Stream & Allow Recording**. A streaming-only mode, working live view or
enabled activity notifications does not grant recording permission. For the
first test, choose **Any Motion** under **More Options** and review any Activity
Zones; event filters can exclude the motion you are testing.

Compare one fresh event across the Blink app's playable **Local Storage** clip,
the plugin logs and that camera's saved Home timeline. Record timestamps and
camera names without publishing media or private identifiers. A completed Blink
clip must exist before this plugin can offer it to Home.

- `motion-suppressed-home-policy-inactive` means the camera's effective Home
  recording policy is unavailable or inactive. Check its Home recording mode,
  camera availability and connected home hub; the message alone does not identify
  which setting or readiness condition blocked it.
- `acquisition-missing` means the available catalog has no usable clip satisfying
  the camera, scope, timestamp and other matching checks. Compare the new clip's
  timestamp with the motion event. Do not assume the nearest clip is the same
  event or widen the matching window without confirming that relationship. The
  default 15-second bound can exclude valid events when Blink timestamps differ
  by more; verify several isolated events and adjacent recordings before choosing
  the smallest measured global tolerance and check all enabled cameras. Changing
  the initial lookup delay does not
  change timestamp matching.
- A Home recording request can be rejected while no prepared clip exists. Check
  acquisition and preparation first; that rejection alone does not establish an
  encoder or Home transport failure.

The clip appears under its original camera, not a replay camera. Wait for Blink
to finish recording, then for download and local preparation. The default ordinary
lookup starts after 60 seconds; catalog cooldown and queue contention can add
delay. Home may place the entry at delivery time. `motionTimeout` only controls
the public motion indication; it does not set the saved clip length.

Preparation first repairs recoverable timing; a classified media fault receives
one salvage pass within the original overall deadline. Normal logs identify
`recovery=audio-clock`, `audio-silence` or `fragments` when those actions
were actually used. Silence is a warning that the real video survived with degraded
audio. A terminal `recovery=exhausted` means the salvage attempt also failed; it is
not a reason to keep a failed recording permanently on the Pi. No backup/archive
mode or indefinite retry queue exists.

Preparation failures are reported with bounded phase/code diagnostics. A rejected
clip does not establish that all recording is broken; preserve the code and event
time for an issue. Do not widen identity/time matching or disable media validation
to force an unrelated or malformed clip through.

Successful download, preparation or a Home transport acknowledgment still needs
confirmation by playing the saved clip in Home. Apple's hub decides whether to
retain it under your recording policy. See [Apple's recording controls](https://support.apple.com/guide/home/hmeb54708fc8/mac).

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

For stable 0.10.0, follow the [combined one-time upgrade](native-recording-config-migration.md#upgrade-from-0100).
It handles retired media options and motion settings in one guarded replacement.
Early Notification and legacy HSV mappings apply separately to intermediate beta
users. Both migration script names now default to preview; an explicit `--apply`
is required to replace the file with a private backup. Do not assume the old
secure-media command still writes when given only a path. POSIX postinstall needs
the explicit installer storage path; Windows uses the guide’s manual conversion.
Neither path changes Blink settings or pairing. Existing `syncModuleFeedLimits`
live-view settings remain valid.

## Motion Not Detected

- Ensure global/per-camera `exposeMotionDetected` is enabled for the public sensor
- Check that the network is armed (motion events only trigger when armed)
- Check the local push receiver status; reducing `pollInterval` does not speed up push
- For HSV, check Home camera/recording permissions and whether native Blink Local
  Storage clips are being saved. A motion alert does not establish a saved clip
- If an accepted command is unresolved, preserve its private state and inspect
  the known operation. Do not clear ownership or submit a replacement by guess
