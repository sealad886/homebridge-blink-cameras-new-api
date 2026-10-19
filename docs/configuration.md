# Configuration reference

The [UI schema](../config.schema.json) owns selectable settings and validation.
This guide owns operator explanations and examples; advanced runtime-only fields
are identified below. Return to the [user guide](../README.md).

## Via Homebridge UI

The plugin provides a full configuration UI. Open the remote Homebridge UI in
Brave (for example, `http://raspberrypi:8581`), then navigate to `Plugins`
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
      "enableMotionPolling": true,
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
| `enableMotionPolling` | No | `true` | Poll for motion events |
| `enableStreaming` | No | `true` | Enable HomeKit live streaming (FFmpeg required only for streaming) |
| `ffmpegPath` | No | `ffmpeg` | Executable path; AAC-ELD requires verified FDK AAC support |
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
| `snapshotCacheTTL` | No | `60` | Snapshot cache duration (seconds); `0` always fetches a new snapshot |
| `persistSnapshotCache` | No | `false` | Keep the last snapshot indefinitely and expose a per-camera `Refresh Snapshot` switch in Home |
| `excludeDevices` | No | - | List of device IDs/serials/names to exclude |
| `deviceNameOverrides` | No | - | Array of `{ deviceIdentifier, customName }` entries for custom HomeKit display names (legacy `deviceNames` is still accepted) |
| `deviceSettingOverrides` | No | - | Array of per-device overrides such as `{ deviceIdentifier, motionTimeout }` (legacy `deviceSettings` is still accepted; `motionTimeout` and `inputQuality` are supported runtime overrides; see [input quality](streaming.md#input-and-output-quality)) |

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

When `persistSnapshotCache` is enabled, `snapshotCacheTTL` is ignored after the first successful
snapshot fetch. Use the `Refresh Snapshot` switch in Home to request a fresh thumbnail capture.
A busy capture can return an existing thumbnail; see [snapshot diagnostics](troubleshooting.md#blink-connection-failure-in-homekit).

Concurrent fresh snapshot requests for the same camera share one capture and
download, including requests from the manual refresh switch. For 15 seconds after
a failed attempt, fresh requests return that failure without contacting Blink
again. A later request can retry. Existing valid cached snapshots remain
available while the camera is online. A cached image does not confirm current
connectivity to Blink.
