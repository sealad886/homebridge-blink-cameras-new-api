# Native recording configuration migration

The redesign uses Blink motion push notifications and completed USB clips. Its
configuration exposes motion sensors globally or per camera and enables HomeKit
Secure Video separately for each camera. The timing and cache controls are under
`nativeRecording`.

The existing custom sign-in screen opens Homebridge's schema form. The new
controls are part of that form; no separate settings editor is required.

Run the one-off local converter from this checkout with Node.js 20 or newer:

```sh
node scripts/migrate-native-recording-config.cjs /explicit/path/to/config.json
```

The default is a preview. It reads only the supplied complete Homebridge JSON
configuration, reports counts and issue codes, and creates no files. It never
discovers a Homebridge host, reads authentication files, contacts Blink, uploads
data, or restarts a service. Review its output and the relevant configuration
locally before applying it:

```sh
node scripts/migrate-native-recording-config.cjs /explicit/path/to/config.json --apply
```

Use the account that owns the configuration, with write permission in its
directory. The converter supports POSIX permissions on macOS and Linux. Close
other settings editors and stop concurrent configuration writes during
application. It detects identity, metadata, or content changes after inspection
and checks again immediately before replacement. An uncooperative writer could
still race the final check and rename; the tool does not lock Homebridge's editor.

Before replacement, the converter writes and syncs an exact original-byte backup
beside the configuration:

```text
config.json.native-recording-backup-<unique-id>.json
```

Both the backup and replacement use mode `0600` and retain the original file's
owner and group. The replacement is staged in the same directory and promoted
with an atomic rename. Unchanged input creates no backup. Repeating a completed
migration leaves the file unchanged. A failure before promotion preserves the
original; a completed backup is retained. The error code
`replaced-directory-sync-failed` means replacement happened but its final
directory sync failed, so inspect the configuration and retained backup locally.

## Conversion rules

Only entries whose `platform` is `BlinkCameras` change. Other platforms, bridge
settings, credentials, and unknown fields are preserved.

| Previous setting | New setting |
| --- | --- |
| `enableMotionPolling` boolean | `exposeMotionDetected`, only when the new value is absent; remove the old key |
| Top-level `hksvCameras: string[]` | Merge `homeKitSecureVideo: true` into an exactly matching `deviceSettingOverrides` row, or append a row with that selector; remove `hksvCameras` |
| `hksvSource` | Remove the obsolete live-feed/saved-clips source selection; the redesign uses completed USB motion clips |
| `syncModuleRecording` | Remove obsolete module-specific source and recurring clip-polling overrides |
| `syncModuleFeedLimits` | Remove obsolete concurrent-feed limits |

Explicit new booleans take precedence, including `homeKitSecureVideo: false`.
Existing per-device fields are preserved. Qualified selectors such as
`camera:123`, `owl:123`, and `doorbell:123` retain their kind and ID. Bare IDs,
serials, and native Blink names are also retained exactly; HomeKit display-name
aliases are not inferred.

The verified previous implementation used top-level `hksvCameras`. No nested
`hksv.cameras` envelope was established, so an `hksv` object is preserved and
reported as a conflict for manual review rather than guessed.

Conflicts block the entire application, including otherwise valid conversions.
They include malformed choices, duplicate selector rows, and a qualified/raw-ID
collision that could select or shadow the wrong camera under first-row matching.
Fix the conflict in the original configuration, then preview again.

The warning `unresolved-camera-aliases` requires review: different name/serial/ID
selectors may refer to the same camera. This cannot be established from
configuration alone. The converter preserves them and does not merge aliases.
Review row order because the first matching per-device row applies.

The report lists removed setting names under `removedKeys`. Removal is limited
to the five verified keys in the table above. Their original values remain in
the private original-byte backup. Other unknown settings are preserved.

Reports contain counts, platform array indexes, and fixed issue codes; they do
not print configuration values or selectors. Exit status is `0` for a successful
preview/application or no-op, `2` for conversion conflicts or invalid command
arguments, and `1` for a file or parsing failure.

## Resulting configuration

Motion sensors default to enabled. HSV defaults to disabled for each camera.
Leaving a per-device `exposeMotionDetected` value absent inherits the global
choice. HSV still receives motion events when a camera's sensor is hidden.

```json
{
  "platform": "BlinkCameras",
  "name": "Blink",
  "exposeMotionDetected": true,
  "deviceSettingOverrides": [
    {
      "deviceIdentifier": "camera:123",
      "exposeMotionDetected": false,
      "homeKitSecureVideo": true
    }
  ],
  "nativeRecording": {
    "initialDelaySeconds": 60,
    "retryIntervalSeconds": 5,
    "maxRetries": 10
  }
}
```

The script takes the complete Homebridge document containing `platforms`, not
this individual platform example. Omitted native recording fields use the
defaults validated by `src/native-recording-config.ts`:

| Field | Default | Allowed range |
| --- | ---: | ---: |
| `initialDelaySeconds` | 60 | 0–3600 |
| `retryIntervalSeconds` | 5 | 1–300 |
| `maxRetries` | 10 | 0–100 |
| `matchToleranceSeconds` | 15 | 0–300 |
| `catalogRefreshSeconds` | 60 | 60–3600 |
| `maxQueuedJobs` | 128 | 1–1024 |
| `maxJobAgeSeconds` | 900 | 1–86400 |
| `maxCachedBytes` | 134217728 | 33554432–1073741824 |

All fields are integers. Maximum job age must cover the initial delay. Missing
clip retries share completed catalogs and respect the catalog refresh interval;
an unknown remote command outcome keeps ownership blocked instead of allocating
another operation. Enable recording permission separately in Apple Home, and
restart the Blink child bridge after reviewing and applying configuration.

To restore the original configuration, retain the current file separately and
restore the selected private backup under the original owner with mode `0600`.
The migration tool does not automatically restore backups or manage services.
