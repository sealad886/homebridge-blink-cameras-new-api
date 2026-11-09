# Configuration reference

Last reviewed: 9 November 2026.

The [UI schema](../config.schema.json) owns selectable settings and validation.
This guide owns operator explanations and examples; advanced runtime-only fields
are identified below. Return to the [user guide](../README.md).

## Via Homebridge UI

The plugin provides a configuration UI. Open your Homebridge UI in a browser
using its configured address, then navigate to `Plugins`
→ `Settings` for `@sealad886/homebridge-blink-cameras-new-api`.
Click Homebridge’s **Save** button after changing settings; selection alone updates
only the form draft. Apply runtime changes through your normal operator-owned
child-bridge restart workflow.

For sign-in and token-storage behavior, see [authentication](authentication.md).

## Manual Configuration

Add a platform entry to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "BlinkCameras",
      "name": "Blink",
      "deviceId": "homebridge-blink-01",
      "persistAuth": true,
      "trustDevice": true,
      "pollInterval": 60,
      "motionTimeout": 30,
      "exposeMotionDetected": true,
      "enableStreaming": true,
      "ffmpegPath": "ffmpeg",
      "videoEncoder": "auto",
      "enableAudio": true
    }
  ]
}
```

## Configuration Options

| Option | Required | Default | Description |
| ------ | -------- | ------- | ----------- |
| `platform` | Yes | - | Must be `BlinkCameras` |
| `name` | Yes | `Blink` | Platform name shown in logs |
| `excludedNetworks` | No | `[]` | Network IDs (preferred) or exact network names to hide from this instance; restart the child bridge after saving |
| `deviceId` | No | `homebridge-blink` | Unique identifier sent to Blink (`hardware_id`) |
| `deviceName` | No | - | Friendly fallback name for this Homebridge instance |
| `persistAuth` | No | `true` | Persist auth tokens across restarts in Homebridge's `.blink-auth.json` file; hosted-UI completion forces `true`, and `false` is not supported for a completed hosted session |
| `trustDevice` | No | `true` | Trust this device during client verification |
| `authLocked` | No | `false` | Keep normal operation token-only; hosted sign-in sets this to `true` |
| `tier` | No | `prod` | Last Blink tier discovered from `v1/users/tier_info`; do not guess it from locale |
| `sharedTier` | No | - | Advanced manual override for shared REST routing; defaults to `tier` and is intentionally hidden from the UI schema |
| `debugAuth` | No | `false` | Enable verbose authentication logging |
| `pollInterval` | No | `60` | Seconds between state polls (min 15) |
| `motionTimeout` | No | `30` | Seconds motion stays active |
| `exposeMotionDetected` | No | `true` | Publish a motion sensor per camera and subscribe to Blink push notifications; per-camera overrides apply |
| `nativeRecording` | No | See below | Bounded timing, matching and local storage policy for optional HomeKit recording |
| `enableStreaming` | No | `true` | Enable HomeKit live streaming; FFmpeg is also needed for optional HomeKit recording |
| `ffmpegPath` | No | `ffmpeg` | Operator-managed executable path; required capabilities are described in [streaming requirements](streaming.md#ffmpeg-requirements) |
| `ffmpegDebug` | No | `false` | Enable bounded, redacted streaming diagnostics; packet/NAL traces are omitted |
| `rtspTransport` | No | `tcp` | RTSP transport for Blink live view |
| `maxStreams` | No | `1` | Max concurrent HomeKit streams per camera |
| `enableAudio` | No | `true` | Enable audio streaming from camera |
| `twoWayAudio` | No | `false` (forced off) | Talkback is currently disabled; HomeKit microphone UI is hidden until IMMIS uplink is validated |
| `audioCodec` | No | `opus` | Preferred audio codec (`opus`, `aac-eld`, `pcma`, `pcmu`) |
| `audioBitrate` | No | `32` | Audio bitrate (kbps) |
| `outputQuality` | No | `auto` | System-wide output profile; see [quality profiles](streaming.md#input-and-output-quality) |
| `softwareEncodingPreset` | No | `veryfast` | Balanced or optional `ultrafast` software encoding |
| `videoBitrate` | No | - | Cap video bitrate (kbps) |
| `videoEncoder` | No | `auto` | Preferred FFmpeg video encoder; `auto` prefers platform hardware encoding and falls back to `libx264` |
| `debugStreamPath` | No | - | Save raw MPEG-TS stream recordings under a `blink-stream-recordings` child directory for debugging |
| `snapshotCacheTTL` | No | `60` | Snapshot cache duration in seconds; native-recording cameras only download an existing thumbnail on automatic cache misses |
| `persistSnapshotCache` | No | `false` | Keep the last snapshot indefinitely and expose a per-camera `Refresh Snapshot` switch in Home |
| `excludeDevices` | No | - | List of device IDs/serials/names to exclude |
| `deviceNameOverrides` | No | - | Array of `{ deviceIdentifier, customName }` entries for custom HomeKit display names (legacy `deviceNames` is still accepted) |
| `deviceSettingOverrides` | No | - | Per-device `motionTimeout`, `inputQuality`, `exposeMotionDetected` and `homeKitSecureVideo`; see below and [input quality](streaming.md#input-and-output-quality) |

Use **Excluded Networks** in the plugin settings to select systems this instance
should not expose. Save and restart the Blink child bridge. Clearing a selection
restores that network on discovery. Missing/offline devices are not removed merely
because they are absent from one response. Network names are exact matches; IDs
remain stable if a network is renamed.

The old per-device `enableMotion` configuration control had no runtime effect and
has been removed from settings. Use each device's HomeKit Motion switch for cloud
motion control; per-device `motionTimeout` remains supported.

For stored-session validation, recovery and legacy credential migration, see
[authentication](authentication.md).

## Motion and HomeKit recording

Motion comes from the plugin's own push receiver. The previous cloud-media
polling path and `enableMotionPolling` setting are removed. Normal state polling
still uses `pollInterval`; it does not prepare USB catalogs. The push subscription
is active if any camera exposes motion or selects HomeKit recording. Hiding all
motion sensors does not disable a separately selected recording camera.

For example:

```json
{
  "exposeMotionDetected": true,
  "deviceSettingOverrides": [
    {
      "deviceIdentifier": "camera:123",
      "homeKitSecureVideo": true,
      "exposeMotionDetected": true
    }
  ],
  "nativeRecording": {
    "initialDelaySeconds": 60,
    "retryIntervalSeconds": 5,
    "maxRetries": 10,
    "catalogRefreshSeconds": 60
  }
}
```

Use the actual camera identifier, serial or exact Blink name. Qualified
`camera:123`, `owl:123` and `doorbell:123` identifiers disambiguate device types.
The public sensor is named `<camera display name> Motion Detected`, preserving
its existing HomeKit service identity. Public motion reports promptly. A separate
internal recording trigger fires only after the finite local video is prepared,
so Home does not wait for the Blink download on an open recording connection.

`homeKitSecureVideo` defaults to `false`. It needs a supported camera with a
known Sync Module association and working **native Local Storage** clips. A USB
drive holding daily cloud backups does not establish this capability. Enable
**Stream & Allow Recording** and the desired recording-audio permission in
Apple Home. Changing the plugin setting never arms Blink or enables camera
motion as a side effect.

Each motion observation creates an independently delayed FIFO job. Matching uses
the actual catalog's network, native device name and offset-bearing `created_at`
timestamp; display aliases and invented URL filenames are not camera identity.
The first attempt normally occurs after 60 seconds. Ten retries means at most
11 attempts, subject to maximum job age and remote-command ownership.

| `nativeRecording` field | Default | Allowed values / meaning |
| --- | --- | --- |
| `initialDelaySeconds` | `60` | Integer 0–3600; initial motion-to-acquisition delay |
| `retryIntervalSeconds` | `5` | Integer 1–300; local missing-clip retry delay |
| `maxRetries` | `10` | Integer 0–100; retries after the first attempt |
| `matchToleranceSeconds` | `15` | Integer 0–300; maximum timestamp distance for an unambiguous match |
| `catalogRefreshSeconds` | `60` | Integer 60–3600; minimum spacing between new catalog preparations for a module |
| `maxQueuedJobs` | `128` | Integer 1–1024; bounded event backlog |
| `maxJobAgeSeconds` | `900` | Integer 1–86400, at least the initial delay; expires undispatched jobs |
| `maxCachedBytes` | `134217728` | Integer 33554432–1073741824; owned downloaded-file budget |

Catalog cooldown is a conservative plugin policy, not a measured vendor rate
limit. A five-second retry can reuse a completed catalog or wait locally; it
cannot start another catalog preparation every five seconds. An uncertain
provider operation blocks replacement requests even after a local timeout or
restart. No polling interval or age limit proves that a remote command ended.

The receiver identity and command/job state live in Homebridge's private
`.blink-native-recording` directory. Keep that state with the auth cache across
ordinary restarts. It contains private receiver credentials and is not a UI
report. Logs describe transitions without requesting extra provider evidence.
The plugin does not upload video, thumbnails or other data files to Blink.

Recording/camera/audio policy changes cancel local work and fence late results.
Already accepted provider operations remain owned until terminal proof is
available; cancelling Home delivery does not cancel a remote command by guess.
Completed local recordings are finite fMP4 streams. The Home hub decides whether
to request or retain them. Delayed offers cannot establish pre-event recording,
historic timeline insertion or successful iCloud retention.

For earlier configuration, use the
[one-off configuration migration](native-recording-config-migration.md). Review its dry run and
backup before applying it; it is never run automatically on the Pi.

## Snapshot behavior

When `persistSnapshotCache` is enabled, `snapshotCacheTTL` is ignored after the first successful
snapshot fetch. Use the `Refresh Snapshot` switch in Home to request a fresh thumbnail capture.
The switch resets to Off after the attempt, including failure; its reset alone does not prove a fresh capture. A busy capture can return an existing thumbnail; see [snapshot diagnostics](troubleshooting.md#blink-connection-failure-in-homekit).

For native-recording cameras, automatic requests read the existing thumbnail
without a capture POST. The explicit refresh switch can still request a capture.
Concurrent capture requests share one capture and download; a manual request
arriving during a passive read waits and then performs its capture. For 15 seconds after
a failed attempt, fresh requests return that failure without contacting Blink
again. A later request can retry. Existing valid cached snapshots remain
available while the camera is online. A cached image does not confirm current
connectivity to Blink.
