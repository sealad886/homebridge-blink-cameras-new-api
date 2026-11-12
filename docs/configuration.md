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

The editor separates five tasks:

| Section | Use it for |
| --- | --- |
| Overview & connection | Sign in, inspect stored-session facts and test the Blink connection. |
| Cameras in Home | Choose systems/cameras, assign Home names and edit per-camera overrides. Inspect Sync Module associations and their optional live-view feed limits. Excluded cameras remain visible here so you can include them again. |
| HomeKit recording | Choose discovered cameras and review recording, motion and privacy prerequisites. |
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

## Live-view feed limits

HomeKit recording uses completed native clips as described
[below](#motion-and-homekit-recording). Explicit live viewing retains independent
upstream capacity limits. These limits do not schedule USB clip acquisition.

The global live-view upstream feed capacity is the known, included camera count;
an offline camera remains known. Each actual Sync Module defaults to the included camera count associated with its Blink
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
      "exposeMotionDetected": true,
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
| `pollInterval` | No | `60` | Seconds between state polls (min 15) |
| `motionTimeout` | No | `30` | Seconds motion stays active |
| `exposeMotionDetected` | No | `true` | Publish motion sensors from Blink push events; per-camera overrides apply |
| `nativeRecording` | No | See below | Bounded timing, matching and local storage policy for optional HomeKit recording |
| `exposeTemperature` | No | `false` | Expose reported temperature for supported traditional cameras; see [camera temperature](#camera-temperature) |
| `enableStreaming` | No | `true` | Enable HomeKit live streaming with the packaged private worker |
| `syncModuleFeedLimits` | No | `[]` | Optional live-view `{ syncModuleId, maxFeeds }` entries for actual discovered modules; positive whole numbers, bounded by associated included cameras. Omit an entry to use its discovered default. These do not govern native clip acquisition. |
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
| `deviceSettingOverrides` | No | - | Per-device `motionTimeout`, `inputQuality`, `exposeTemperature`, `exposeMotionDetected` and `homeKitSecureVideo`; see below and [input quality](streaming.md#input-and-output-quality) |

For an existing configuration, follow the [secure media migration](streaming.md#upgrade-configuration)
before restarting; retired CLI and AAC-ELD settings are rejected. Upgrading from
0.10.0 also requires reviewing the
[native recording migration](native-recording-config-migration.md). Run the secure
media converter first against the explicit complete Homebridge config path; it
creates a private backup before replacement. Then preview the native recording
converter, review its report and apply it only when ready. Neither tool contacts
Blink or restarts Homebridge.

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
provider operation temporarily excludes replacement requests within a fixed local
lease of at most 120 seconds. Expiry abandons that old work locally and permits
fresh distinct actions; it does not prove the remote command ended or replay
its POST. Restart and retry do not renew the lease. Legacy owners without an
expiry retain uncertainty as evidence but cannot block Blink indefinitely.

This state migration runs when the corrected plugin loads existing ownership.
New native abandonment receipts require the corrected reader; older betas may
reject that phase during rollback. Keep a private pre-update state backup and
follow the release rollback procedure rather than deleting the runtime directory.

The receiver identity and command/job state live in Homebridge's private
`.blink-native-recording` directory. Keep that state with the auth cache across
ordinary restarts. It contains private receiver credentials and is not a UI
report. Logs describe transitions without requesting extra provider evidence.
The plugin does not upload video, thumbnails or other data files to Blink.

Recording/camera/audio policy changes cancel local work and fence late results.
Already accepted provider operations retain their uncertainty until terminal
proof is available, while their local exclusion lease remains finite. Cancelling
Home delivery does not cancel a remote command by guess.
Completed local recordings are finite fMP4 streams. The Home hub decides whether
to request or retain them. Delayed offers cannot establish pre-event recording,
historic timeline insertion or successful iCloud retention.

For earlier configuration, use the
[one-off configuration migration](native-recording-config-migration.md). Review its dry run and
backup before applying it; it is never run automatically on the Pi.

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

For native-recording cameras, automatic requests read the existing thumbnail
without a capture POST. The explicit refresh switch can still request a capture.
Concurrent capture requests share one capture and download; a manual request
arriving during a passive read waits and then performs its capture. For 15 seconds after
a failed attempt, fresh requests return that failure without contacting Blink
again. A later request can retry. Existing valid cached snapshots remain
available while the camera is online. A cached image does not confirm current
connectivity to Blink.
