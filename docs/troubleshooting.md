# Troubleshooting

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

The plugin automatically backs off and retries. If you're hitting rate limits frequently:

- Increase `pollInterval` to reduce API calls
- Set `enableMotionPolling` to `false` to reduce calls

## Node.js Version

This plugin requires Node.js 20, 22, or 24 LTS. Check your version:

```bash
node --version
```

## Motion Not Detected

- Ensure `enableMotionPolling` is `true`
- Check that the network is armed (motion events only trigger when armed)
- Reduce `pollInterval` for faster detection (but more API calls)

