# Native recording configuration migration

The redesign uses Blink motion push notifications and completed USB clips. Its
configuration exposes motion sensors globally or per camera and enables HomeKit
Secure Video separately for each camera. The timing and cache controls are under
`nativeRecording`.

Use the plugin's existing five-section settings editor. Motion exposure belongs
to the camera settings; HomeKit recording selects the new per-camera policy.
Homebridge Save and a child-bridge restart apply the reviewed configuration.

## Upgrade from 1.1.0-beta.1

Close all settings and JSON Config editors and stop other configuration writers
until installation or explicit migration completes. The final file check and
atomic replacement do not form a lock shared with Homebridge's settings service;
concurrent writers are outside this migration's supported operating requirements.

On POSIX Homebridge npm installations, the installed package's postinstall step
runs this one-time migration against `config.json` in the explicit
`UIX_STORAGE_PATH` supplied by the installer. Without that authoritative path,
it leaves config untouched and reports how to run the explicit converter.
It never infers storage from a global package prefix or searches home directories
or other storage roots. Source checkout dependency installs never access Homebridge config, even
when they inherit `UIX_STORAGE_PATH`; installation is verified before using that
path. The existing guarded converter writes an owner-only backup of the exact
original bytes before atomic replacement, preserving file ownership and unrelated
configuration. The replacement retains the config permission bits so service
group-read access is preserved; the backup stays private at `0600`. Already-converted files are left untouched without another backup.
Invalid choices, unsafe files and detected concurrent changes fail the migration
without replacing the configuration.
Automatic migration also stops on `unresolved-camera-aliases` before changing
config or creating a backup. Review the explicit preview and resolve ambiguous
camera overrides before applying the migration; installation cannot infer aliases.

The persisted file contains only canonical values after conversion; the runtime
and settings editor do not interpret legacy keys. Opening settings, discovering
cameras and testing the connection do not stage or save a configuration change.
Only a real edit stages a draft for Homebridge Save. Explicit account operations
may save their own changes; unrelated drafts must still be saved or discarded.

If lifecycle scripts were disabled or the installer cannot identify this
Homebridge storage path, run the explicit preview/apply commands below before
starting the new plugin. Missing migration produces an actionable validation
error rather than silently choosing a different policy. From a source checkout,
run `npm run build` first; the installed package includes the compiled helper.
The migration itself never contacts Blink or restarts Homebridge.

The guarded file converter requires POSIX ownership and file semantics. On Windows,
the installation step leaves the file untouched and reports manual conversion
instead of failing an otherwise valid installation. Use Homebridge's backup and
JSON Config editor to perform the mapping below before starting with legacy keys;
already-canonical Windows configurations need no conversion.

At global, Sync Module and camera scopes, `disableEarlyNotification: true`
becomes `earlyNotificationMode: "off"`; explicit `false` becomes `"unmanaged"`.
An absent override continues to inherit. A valid explicit new mode wins if both
keys exist, and the legacy key is removed. Malformed values fail conversion
without modifying the supplied file. Unknown fields and other plugins survive.
Choosing `"on"` is a new explicit action; the migration never infers it from an
old false value. See [Early Notification](configuration.md#early-notification-and-clip-scheduling).

The private `.early-notification-ACCOUNT-TIER.json` companion journal distinguishes
an unverified `pending` intent from a confirmed `owned` setting change. The plugin
saves a pending original before a new setting POST and promotes it only after the
command confirms the requested change. Pending entries never authorize automatic
restoration. A refused write whose cleanup cannot persist therefore cannot become
an owned change merely because someone later supplies the same value manually.
An unchanged read may reconfirm continuity only for a previously confirmed-owned
entry when no intervening change was observed; it cannot establish ownership of a
new, migrated or otherwise unverified pending entry.
A definite Live View, storage or unrelated ordinary-command admission refusal
that started no work may retain that same prior ownership, provided no change
callback ran and the account/writer scope is still current. Routine contention
therefore does not turn a previously owned entry into an unverified change. A
typed terminal failure of the initial configuration GET can retain the same
prior ownership: that read has ended without reaching the change callback or a
setting POST. The SDK checks account/writer authority on failure as well as
success; a stale continuation cannot supply that proof.
Typed request-local proof that no request was sent is treated similarly. If a
reapply read observed the original value, an unsent or refused write cannot own a
new change, so its pending intent is discarded. If restoration observed the
still-owned forced value, an unsent or refused write can retain that prior
ownership. Generic timeouts, uncertain network outcomes and authority changes do
not supply this proof and remain pending.

At the first safe account-scoped startup, journal versions 1 and 2 are migrated
once to version 3, with an exact-byte private backup beside the journal named
`JOURNAL.vVERSION-backup-SHA256.json`. This is separate from
the installer's configuration conversion: the installer cannot identify and
validate the active account journal safely. Every legacy original is preserved as
pending because those formats do not prove whether its setting write succeeded.
Opening settings does not perform this migration. Already-current journals are
not rewritten just to load them.

An unresolved pending entry requires manual review before that camera's preference
can be managed again. Other cameras, push reception, recording and arm/disarm work
remain available. Do not infer ownership from a matching current Blink value.
To resolve an entry:

1. Stop the Blink child bridge and retain a private copy of the current journal
   and its migration backup.
2. Identify the entry's camera confidently and choose its intended Early
   Notification value in the Blink app. The retained `original` value is evidence
   for that review, not proof that the plugin changed the setting.
3. Remove only the reviewed pending entry from the current journal, preserving
   all other entries and its private file ownership and permissions. Leave any
   entry you cannot identify pending; never clear the journal wholesale.
4. Restart the child bridge. An explicitly configured Force on/off policy can
   then make a new, recorded change. Use Leave unchanged if no forcing is wanted.

An older beta cannot read version 3 or interpret the new mode key. Before a
downgrade, resolve pending entries manually, select Leave unchanged for managed
cameras and verify confirmed-owned restoration completes. Retain the current
journal as well as the pre-upgrade backups. Stop the child bridge before restoring
reviewed configuration/journal backups and installing the older exact registry
version. Package rollback alone does not convert configuration or operational
state; do not discard unresolved originals to make a downgrade start.

## Upgrade from 0.10.0

First review the [secure media upgrade](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/streaming.md#upgrade-configuration).
The secure media converter removes retired live-view CLI options and maps the
retired audio choice. It has no preview flag: when a conversion is needed, this
command writes an owner-only backup before replacing the explicit file:

```sh
node scripts/migrate-secure-media-config.cjs /explicit/path/to/config.json
```

Use the complete Homebridge configuration path, preserve current auth/accessory
state, and close concurrent settings editors. Then preview the native recording
converter below against that same path. It preserves other platform and bridge
blocks and the valid live-view module limits. Neither converter contacts Blink,
changes an installed package or restarts Homebridge.

## Preview and apply native recording settings

Run the converter from this checkout with a supported Node.js version
(20.3+, 22, 24 or 26):

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

The backup uses mode `0600`; the replacement preserves the original config's
access permission bits. Both retain the original file's owner and group.
The replacement is staged in the same directory and promoted
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

The valid `syncModuleFeedLimits` setting is preserved. It limits explicit live
viewing through the existing secure-media admission owner; it does not schedule
native USB clip acquisition.

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
to the four verified keys in the table above. Their original values remain in
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
restore a copy of the selected backup under the original owner and group, with
the original config's required access permissions (for example, `0640` when the
Homebridge service reads through its group). Keep the backup itself private at `0600`.
The migration tool does not automatically restore backups or manage services.
