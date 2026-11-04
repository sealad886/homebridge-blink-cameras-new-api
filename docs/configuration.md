# Configuration reference

Last reviewed: 4 November 2026.

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

The editor separates five tasks:

| Section | Use it for |
| --- | --- |
| Overview & connection | Sign in, inspect stored-session facts and test the Blink connection. |
| Cameras in Home | Choose systems/cameras, assign Home names and edit per-camera overrides. Inspect Sync Module associations and their optional feed limits. Excluded cameras remain visible here so you can include them again. |
| HomeKit recording | Choose discovered cameras and review per-camera source, observed Home policy, initial clip scan and job progress. Selected-camera activity appears first; full setup remains available in a disclosure. |
| Live viewing & sound | Allow live viewing, choose a picture preset and allow shared HomeKit audio. |
| Advanced & troubleshooting | Polling, previews, exact tuning values, diagnostics and immediate account maintenance. |

Navigation retains incomplete edits. Invalid values or an unavailable validation
service keep Save disabled with a retryable explanation. Camera discovery failure
preserves existing selections and marks the last list stale; it does not turn
missing cameras into an empty successful result. Unresolved saved identifiers
remain visible until you explicitly remove them. New selections use qualified
identities such as `camera:123`, `owl:123` or `doorbell:123` so equal numeric IDs
across device types stay distinct.

Account actions are immediate and separate from settings Save. Save or discard
unsaved settings before changing the account, so an account action cannot save
unrelated edits. Settings stay unavailable throughout the account request and
its configuration save. Per-camera temperature offers **Use platform setting**, **Show**
and **Hide**. Blank per-camera motion duration inherits the platform duration.

## HomeKit recording and feed limits

Select cameras in **HomeKit recording**, Save and restart the Blink child bridge.
Then use the camera's settings in Apple Home to allow **Stream & Allow Recording**
and choose recording-audio permission. HomeKit recordings are viewed in Apple
Home; the plugin does not choose an iCloud Drive folder or confirm a saved clip.

**Saved Blink clips** (`hksvSource: "saved-clips"`) is the default. It uses native
Blink motion and completed Sync Module USB clips without an idle live feed.
Manual Live View, including opening a camera in Home, can still start a feed; see
the [recording guide](RECORDING.md#source-and-sync-module-settings).
Confirm that Blink is producing native **Local Storage** clips: daily **Cloud
Clip Backup** to USB is a different storage mode, and a connected USB drive or a
cloud clip in the Blink app does not prove this source is available. See
[Blink's storage guidance](https://support.blinkforhome.com/en_US/514890).

**Continuous feed** is an explicit opt-in source. While Home recording is allowed,
it keeps a live feed with a four-second memory buffer and local video-motion
detection, increasing battery and network use even without motion. Disarming
Blink or turning camera motion off suppresses new events but may leave this feed
running. Turn recording off in Home to stop recording capture; turning the camera
off in Home also blocks live viewing and snapshots.

Follow the [recording guide](RECORDING.md) for the ordinary setup and fresh test.
Wait for each camera's **Initial clip scan** before creating that event; existing
catalog entries become a baseline rather than imported history. **Recording setup
and activity** shows observed Home permissions or unknown values, effective audio,
the scan and one coherent job timeline. Ring-only saved replay is unsupported;
audio-off is valid video-only recording. Desired/applied settings revisions and
report freshness prevent an unapplied draft from appearing ready. Missing/stale
reports do not block a valid Save. Home playback remains a manual check around
the delayed offer/import time.

**Read motion events from Blink** reads cloud clip events. It is independent of
completed USB clip discovery and continuous recording's local video-motion
detector. `pollInterval` controls state/cloud polling; USB checks default to 30
seconds and use the separate **Recording by Sync Module** interval. Live-view
enablement remains independent from recording selection. Camera audio applies to
both; Home's recording-audio permission must also allow it. Live picture presets
do not set the Home hub's recording format.

There is no four-camera recording-selection limit. The global upstream feed
capacity is the known, included camera count; an offline camera remains known.
Live viewing and recording can share one camera's upstream feed. Each actual
Sync Module defaults to the included camera count associated with its Blink
system. Set an optional positive whole-number limit in the module details;
**Use discovered default** removes that override. Blink may impose additional
limits regardless of local capacity.

A Blink system is not a Sync Module ID. The available inventory associates a
camera with a real module only when exactly one module belongs to its system;
this is not proof of the physical video path. Ambiguous associations and stale
explicit module limits receive validation errors. Remove an override or resolve
the inventory before saving; the editor never silently ignores it.

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
| `pollInterval` | No | `60` | Seconds between state/cloud-motion polls (min 15); completed USB clip checks use their separate module interval |
| `motionTimeout` | No | `30` | Seconds motion stays active |
| `enableMotionPolling` | No | `true` | Read Blink cloud clip events for motion state; independent of completed USB clip discovery and continuous recording's local video motion |
| `exposeTemperature` | No | `false` | Expose reported temperature for supported traditional cameras; see [camera temperature](#camera-temperature) |
| `enableStreaming` | No | `true` | Enable HomeKit live streaming with the packaged private worker |
| `hksvCameras` | No | `[]` | Cameras offered for HSV recording; the discovered picker writes qualified type/ID values. Home permissions and restart are additional steps. |
| `hksvSource` | No | `saved-clips` | Default recording source: native completed Sync Module USB clips, or explicit opt-in `continuous` live capture; see the [recording guide](RECORDING.md#source-and-sync-module-settings) |
| `syncModuleRecording` | No | `[]` | Optional entries with required `syncModuleId` and optional `source` / `pollIntervalSeconds`. Source inherits `hksvSource`; saved-clip polling defaults to 30 seconds and accepts whole numbers from 15–300. Omit entries to keep defaults implicit. |
| `syncModuleFeedLimits` | No | `[]` | Optional `{ syncModuleId, maxFeeds }` entries for actual discovered modules; positive whole numbers, bounded by associated included cameras. Omit an entry to use its discovered default. |
| `mediaDebug` | No | `false` | Enable bounded, redacted streaming diagnostics; packet/NAL traces are omitted |
| `maxStreams` | No | `1` | Max concurrent HomeKit streams per camera |
| `enableAudio` | No | `true` | Allow camera audio for live viewing and HSV; Home recording-audio permission must also allow it |
| `audioCodec` | No | `opus` | Preferred audio codec (`opus`, `pcma`, `pcmu`) |
| `audioBitrate` | No | `32` | Audio bitrate (kbps) |
| `outputQuality` | No | `auto` | System-wide output profile; see [quality profiles](streaming.md#input-and-output-quality) |
| `softwareEncodingPreset` | No | `veryfast` | Balanced or optional `ultrafast` software encoding |
| `videoBitrate` | No | - | Cap video bitrate (kbps) |
| `debugStreamPath` | No | - | Save raw IMMIS MPEG-TS stream recordings under a `blink-stream-recordings` child directory for debugging; RTSPS recording is not implemented |
| `snapshotCacheTTL` | No | `60` | Snapshot cache duration (seconds); `0` requests fresh snapshots, subject to capture coalescing, failure backoff and provider busy fallback |
| `persistSnapshotCache` | No | `false` | Keep the last snapshot indefinitely and expose a per-camera `Refresh Snapshot` switch in Home |
| `excludeDevices` | No | - | Camera identities to hide; new editor selections use qualified type/ID values |
| `deviceNameOverrides` | No | - | Array of `{ deviceIdentifier, customName }` entries for custom HomeKit display names (legacy `deviceNames` is still accepted) |
| `deviceSettingOverrides` | No | - | Array of per-device overrides such as `{ deviceIdentifier, motionTimeout, exposeTemperature }` (legacy `deviceSettings` is still accepted for motion timeout; see [input quality](streaming.md#input-and-output-quality)) |

For an existing configuration, follow the [secure media migration](streaming.md#upgrade-configuration) before restarting; retired CLI and AAC-ELD settings are rejected.

Use **Cameras in Home** to select systems this instance should expose. Save and
restart the Blink child bridge. Including a system restores it on discovery.
Missing/offline devices are not removed merely
because they are absent from one response. Network names are exact matches; IDs
remain stable if a network is renamed.

The old per-device `enableMotion` configuration control had no runtime effect and
has been removed from settings. Use each device's HomeKit Motion switch for cloud
motion control; per-device `motionTimeout` remains supported.

For stored-session validation, recovery and legacy credential migration, see
[authentication](authentication.md).

## Camera temperature

Set `exposeTemperature` to `true` to expose Blink's reported temperature for
traditional cameras that supply it. It is disabled by default. An optional
`exposeTemperature` boolean in `deviceSettingOverrides` overrides the global
setting for a matching camera serial, numeric ID or exact Blink name. Omit the
per-device field to inherit; explicit `false` disables it even when globally on.

```json
{
  "exposeTemperature": false,
  "deviceSettingOverrides": [
    { "deviceIdentifier": "CAMERA-SERIAL", "exposeTemperature": true }
  ]
}
```

Save and apply through the normal child-bridge restart workflow. Each enabled
traditional camera adds at most one bounded config metadata GET at discovery and
each normal state poll, with overlapping reads coalesced. HomeKit reads make no
cloud requests. This reads the camera's last reported measurement; it does not
wake the camera, force a new measurement or change its calibration. Frequent
state polling also increases these optional metadata requests.

Blink's camera config `signals.temp` is Fahrenheit; the plugin converts to
Celsius for HomeKit, which uses the Home app's preferred display units. A sensor
appears after the first valid sample. Missing/invalid data, a failed metadata
read or an offline camera/bridge makes an existing sensor unavailable with a
fault instead of reporting zero. A later valid sample restores it. Restored
sensors wait for fresh metadata; disabling the option removes them when the
camera is restored during discovery.

Owl/Mini and doorbell inventory are excluded from this implementation. It does
not assume that an unverified homescreen temperature field supplies a reading.
Real camera measurement accuracy and Home display require physical acceptance;
automated contract and lifecycle tests alone do not establish those outcomes.

## Snapshot cache

When `persistSnapshotCache` is enabled, `snapshotCacheTTL` is ignored after the first successful
snapshot fetch. Use the `Refresh Snapshot` switch in Home to request a fresh thumbnail capture.
The switch resets to Off after the attempt, including failure; its reset alone does not prove a fresh capture. A busy capture can return an existing thumbnail; see [snapshot diagnostics](troubleshooting.md#blink-connection-failure-in-homekit).

Concurrent fresh snapshot requests for the same camera share one capture and
download, including requests from the manual refresh switch. For 15 seconds after
a failed attempt, fresh requests return that failure without contacting Blink
again. A later request can retry. Existing valid cached snapshots remain
available while the camera is online. A cached image does not confirm current
connectivity to Blink.
