# Canonical saved-clip HSV diagnostic

Last reviewed: 4 November 2026. For ordinary users, start with the
[Homebridge GUI recording guide](../../docs/RECORDING.md). This standalone tool
and its pairing/worker options are developer qualification only.

This explicitly launched recording-only accessory tests a retained native Blink
MP4 through the plugin's actual `prepareSavedClip` and
`BlinkCameraRecordingDelegate`. The canonical worker owns video decode and
encoding; the canonical recording delegate owns HDS packets, motion timing,
permission changes and media retirement. The diagnostic supplies manual controls
and evidence. It never starts a live camera feed or contacts Blink.

The test is an isolated validation artifact. It does not install the plugin,
publish an npm version or qualify all release targets. Protocol 4 source requires
matching worker artifacts; a previously shipped protocol 3 binary cannot validate
this source. The normal preparer still requires the verified package artifacts.
An explicit host-qualification option below permits a separately built and hashed
worker for this test only.

## Workspace and dependencies

Use a supported current Node 22/24/26 LTS and the compiled source being qualified.
The current development fixture uses Homebridge **2.5.0** and scoped
`@homebridge/hap-nodejs` **2.3.0**. HAP admission also retains the earlier exact
qualification identities `hap-nodejs` **0.14.0** and
`@homebridge/hap-nodejs` **2.3.1-beta.0**. Stable 2.3.0 was checked after the host package changed between
preflight and launch; each run records the loaded name and version. Other names
or versions remain rejected. No dependencies are installed by this script, and
accepting a manifest is not evidence of physical Home retention.

Create a durable owner-only workspace and `inputs` directory. Retain an original
MP4 there with mode 0600, immediately inside `inputs`, at most 32 MiB. Supply a
separate owner-only JPEG of at most 2 MiB and its SHA-256 as the static test
preview. The JPEG is an explicit diagnostic input; the script does not run an
external video conversion or thumbnail decoder. Originals remain unchanged.

Run with absolute paths and replace the hash placeholder with the JPEG's actual
64-character lowercase SHA-256:

```sh
node scripts/hsv-clip-replay/index.cjs \
  --workspace /absolute/private/saved-clip-validation \
  --input-root /absolute/private/saved-clip-validation/inputs \
  --plugin-root /absolute/qualified/plugin-source \
  --hap-root /absolute/existing/node_modules/@homebridge/hap-nodejs \
  --preview /absolute/private/saved-clip-validation/inputs/preview.jpg \
  --preview-sha256 REPLACE_WITH_ACTUAL_JPEG_SHA256 \
  --name 'Blink Saved Clip Validation' \
  --interface en0 --port 53632
```

For an explicit host-source qualification, add both options:

```sh
--qualification-worker /absolute/qualified/native/build/blink-codec-worker \
--qualification-worker-sha256 REPLACE_WITH_ACTUAL_WORKER_SHA256
```

The executable must be owned by the operator, executable, not writable by another
user, and match the supplied hash. Without these paired options the canonical
preparer's packaged-worker selection remains unchanged and rejects missing or
mismatched assets. The `--name` default is `Blink Clip Replay Test`; choosing a
different display name does not change the existing workspace's pairing UUID.

Use a trusted LAN interface with a private non-loopback IPv4 address. HAP `bind`
scopes advertisement; its TCP listener may use a wildcard address internally.
There is no network command endpoint. An interactive terminal keeps stdin open;
redirecting a finished file or closing stdin requests normal shutdown.

## Pairing and controls

The operator pairs the test camera in Apple Home and enables **Stream & Allow
Recording** with **Any Motion** for the applicable Home/Away state. Existing
workspace identity and pairing state are reused. The script never resets an
identity or pairs Home automatically. A newly created workspace is unpaired;
adding it requires an iPhone or iPad. Keep the complete `hap-state` directory for
later runs and back it up privately.

The script's event reporter emits no setup PIN or setup URI. Pairing details live
only in owner-only `hap-state/identity.json` and `hap-state/setup-uri.txt`.
Underlying HAP can emit additional diagnostic output, so retain raw stdout and
stderr privately and inspect them before sharing. Live View reports a
recording-only diagnostic; snapshots use the selected static JPEG.

Send one JSON command per line:

```jsonl
{"command":"status"}
{"command":"load","file":"/absolute/private/saved-clip-validation/inputs/chosen.mp4","label":"chosen","capturedAt":"2026-11-03T10:00:00Z"}
{"command":"trigger"}
{"command":"stop"}
```

A load requires an explicit valid original capture time. It never substitutes
filesystem time or backdates the Home timeline. Wait for `recordingActive`,
`cameraActive` and `configured`, then load. Wait for `ready:true` before triggering.
Loading does not publish motion. Each trigger consumes one prepared clip once;
there is no automatic offer or retry. Status `phase` reflects the canonical
recording state; `ready`, `preparing` and `busy` describe manual admission.

All complete prepared fragments are offered immediately, with exactly one final
marker. The canonical motion hold covers the native prepared span bound,
independently of an earlier ACK or ordinary hub close. HDS request/ACK deadlines
can release media earlier while the planned motion span and camera reservation
continue. Stop or recording/camera/audio revocation clears immediately. Equivalent
configuration negotiation preserves prepared media; a changed unoffered
configuration requires reloading. An ongoing event keeps the format it began with.
The removed `delivery` and `motionHold` controls are rejected.

Stop, EOF and process signals abort pending preparation immediately, skip queued
commands and wait for owned work to retire before closing HAP and evidence.
Normal shutdown removes its task-owned PID lock. After an abnormal exit, verify
that the recorded process is dead before removing that exact lock; preserve the
pairing directory and evidence.

## Evidence and limits

`replay-events.jsonl` records source capture metadata, preparation summary and
hashes, actual motion callbacks, HDS request/final-packet offer, observed ACK/close
callbacks and the canonical delivery result. `hds_ack_observed` records a callback,
including a potentially late callback; it does not override an eventual uncertain
result. `homeRetention` remains `unconfirmed` throughout.

Owner-only `input-<UUID>.mp4` and `prepared-<UUID>.mp4` files retain exact source and
canonical prepared evidence. Prepared fragments are written sequentially from the
actual pinned bundle without another full media copy. Each load inventories
retained task files, including failed preparations and earlier runs, and reserves
room for the source plus the full bounded output within a 128 MiB scratch limit.
It ignores `.DS_Store`, rejects unsafe retained files and never deletes evidence
or native Blink clips. Operator inputs and pairing state are separate from that
scratch accounting. `preparedSpanUpperBoundUs` is a conservative native bound,
including possible AAC padding, rather than a claim of exact container duration.
Generated bounded audio-tail samples are explicit in the preparation summary.

A final packet, ACK or `delivered` result establishes transport evidence only.
Verify a saved recording in Apple Home and play its beginning, middle and end;
export it for packet/timestamp comparison when practical. Record those Home
observations separately. A still-loading Home duration label is not final media
coverage evidence.

Home ingestion occurs after native capture, clip availability, download and
preparation. Replay motion can produce delayed Home alerts and automations. Native
clip length and retrigger gaps remain; the first prepared seconds are footage
already in the native clip, not a true pre-event buffer. If Blink never produces a
native clip, saved-clip ingestion cannot create that missing footage. This mode
avoids starting an idle feed; battery-life savings require separate measurement.
It is separate from explicitly selected continuous live recording.

Run focused checks with:

```sh
npm test -- --runInBand --testPathPatterns=hsv-clip-replay
```

These tests exercise the actual production delegate with finite recording-buffer
fixtures and mock preparation, plus file/worker/JPEG admission and direct
canonical preparation handoff. Real source preparation, the installed HAP runtime
and physical Apple Home retention require their own execution evidence.
Keep source, runtime, pairing state and original media in a durable private
workspace; a reboot or temporary-directory cleanup must not discard the test
identity or evidence. Do not put setup material or private footage in a public
issue. Qualification details belong in the [current execution record](../../docs/audits/2026-11-04-hsv-readiness-qualification.md).
