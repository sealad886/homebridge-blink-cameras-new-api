![Blink for Homebridge — Outdoor 4, Video Doorbell and Mini cameras](https://raw.githubusercontent.com/sealad886/homebridge-blink-cameras-new-api/main/docs/assets/header-editorial-brand-wordmarks.png)

# @sealad886/homebridge-blink-cameras-new-api

Last reviewed: 23 October 2026.

[![npm](https://img.shields.io/npm/v/%40sealad886%2Fhomebridge-blink-cameras-new-api.svg)](https://www.npmjs.com/package/@sealad886/homebridge-blink-cameras-new-api)
[![License](https://img.shields.io/github/license/sealad886/homebridge-blink-cameras-new-api.svg)](LICENSE)
[![Test](https://github.com/sealad886/homebridge-blink-cameras-new-api/actions/workflows/test.yml/badge.svg)](https://github.com/sealad886/homebridge-blink-cameras-new-api/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/sealad886/homebridge-blink-cameras-new-api/branch/main/graph/badge.svg)](https://codecov.io/gh/sealad886/homebridge-blink-cameras-new-api)

> Important: This plugin uses Blink's private OAuth and REST APIs. All APK-known
> production regions use the same production OAuth host; geography changes only
> the REST tier discovered after token issuance. Only an EU-region account has
> live-account evidence. Non-EU accounts are not live-validated and remain covered
> by Android 57.1 APK traces plus automated routing tests.

Modern Blink platform plugin for Homebridge using Blink-hosted OAuth. Exposes Blink devices as proper HomeKit accessories:

- **SecuritySystem** for arm/disarm control of networks
- **MotionSensor** for motion detection events
- **Doorbell** service exposed for doorbell devices; automatic ring delivery is not implemented
- **Switch** for enabling/disabling motion detection per device
- **Camera** live video/audio and snapshots, with an optional manual snapshot-refresh switch
- **Opt-in HomeKit Secure Video** with a four-second memory prebuffer;
  physical Apple home hub and iCloud recording acceptance remains pending
- **Connection monitor and retry control** for provider outages
- **Optional TemperatureSensor** for traditional cameras reporting temperature;
  default off, with global and per-device settings

The current static API catalog is recovered from Blink Android 59.2
(`versionCode` 29823413), with Android 57.1 retained as the comparison and
bounded live-evidence baseline. See the [API contract](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/api-contract/README.md). Blink can
change these private interfaces without notice.

## Contents

- [Features and supported devices](#features-and-supported-devices)
- [Requirements](#requirements)
- [Installation](#installation)
- [Sign-in and account verification](#sign-in-and-account-verification)
- [Configuration](#configuration)
- [Using the plugin in Apple Home](#using-the-plugin-in-apple-home)
- [Live streaming and quality](#live-streaming-and-quality)
- [HomeKit Secure Video](#homekit-secure-video)
- [Troubleshooting](#troubleshooting)
- [Documentation and development](#documentation-and-development)
- [Disclaimer and trademarks](#disclaimer-and-trademarks)

## Features and supported devices

- ✅ **Proper HomeKit SecuritySystem** - Arm/disarm networks using the Security System tile in Home app
- ✅ **Motion Detection** - Receive motion alerts in HomeKit when your cameras detect motion
- **Doorbell devices** - Motion controls, sensors and a HomeKit Doorbell service; see the ring-event limitation below
- ✅ **Status Polling** - Automatically syncs device states with Blink cloud
- ✅ **OAuth Authentication** - Modern OAuth 2.0 with automatic token refresh
- ✅ **Blink-hosted MFA** - Password and hosted MFA stay on Blink's sign-in page
- ✅ **Retry Logic** - Bounded retries for eligible reads, rate limits and server errors; ambiguous liveview/completion POSTs are not replayed

### Supported devices

| Blink Device | HomeKit Service | Features |
| ------------ | --------------- | -------- |
| **Network** | SecuritySystem | Arm/disarm all cameras in network |
| **Camera** | Switch + MotionSensor + optional TemperatureSensor | Enable/disable motion, motion events, reported temperature where available |
| **Doorbell** | Doorbell + Switch + MotionSensor | Enable/disable motion, motion events; automatic ring delivery unavailable |
| **Owl (Mini)** | Switch + MotionSensor | Enable/disable motion, motion events |

Doorbell devices expose a HomeKit Doorbell service, but the current runtime does
not connect incoming Blink ring events to it. Its presence does not establish
automatic ring notifications; use the official Blink app for those alerts.

Temperature sensing uses Blink's cached camera configuration metadata and does
not force a new physical measurement. Enabling it adds one bounded metadata read
per camera per normal state poll. Missing/offline readings produce a sensor fault;
Owl/Mini and doorbell temperature are not supported. See
[temperature configuration](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/configuration.md#camera-temperature)
for global/per-device controls and sampling limitations.

#### SecuritySystem modes

The HomeKit SecuritySystem exposes standard modes:

- **Away Arm** → Network is armed
- **Stay Arm** → Network is armed (same as Away)
- **Night Arm** → Network is armed (same as Away)
- **Disarm** → Network is disarmed

Note: Blink only has armed/disarmed states, so all "armed" modes map to Blink's armed state.

## Requirements

- Homebridge 1.11.1 or later
- Node.js 20, 22 or 24 (see [package engines](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/package.json))
- A Blink account
- For live streaming, the matching private codec worker supplied in the package; see [streaming requirements](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/streaming.md#packaged-codec-requirements).

## Installation

### Via Homebridge UI (Recommended)

1. Open the Homebridge UI
2. Navigate to Plugins
3. Search for "@sealad886/homebridge-blink-cameras-new-api"
4. Click Install

### Via npm

```bash
npm install -g @sealad886/homebridge-blink-cameras-new-api
```

Restart Homebridge after installing.

## Sign-in and account verification

Use a desktop browser to open the plugin settings in Homebridge UI and choose **Sign in securely with
Blink**. Enter credentials and hosted MFA only on Blink’s page, then return the
complete callback address through **Paste Blink Result and Finish**. Complete
any distinct post-token verification requested by Homebridge.

Follow the [sign-in and recovery guide](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/authentication.md) for the full
procedure, clipboard fallback, session storage and known validation boundaries.
Never put passwords or verification codes into plugin settings.

## Configuration

Use the plugin settings form and click Homebridge’s **Save** button; selecting a
value alone changes only the draft. Apply runtime changes using your normal
child-bridge restart workflow.

The [configuration reference](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/configuration.md) owns defaults, manual
JSON examples, exclusions, naming overrides and snapshot settings. The
[UI schema](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/config.schema.json) defines selectable fields and validation.

## Using the plugin in Apple Home

### Identifying camera controls

Each camera, doorbell and Mini/Owl control starts with the device name assigned
in the plugin (including a configured device-name override):

| Home service | Example |
| --- | --- |
| Enable or disable motion detection | Test Camera Motion Detection |
| Read-only motion sensor | Test Camera Motion Sensor |
| Request a snapshot, then automatically return Off | Test Camera Refresh Snapshot |
| Doorbell service (automatic ring delivery unavailable) | Test Doorbell Doorbell |
| Network arm/disarm | Example Network Security |

The camera tile retains its assigned device name. Long names reserve space for
the control's purpose within HomeKit's name limit. Existing service identities
remain unchanged, preserving pairings and automations. The plugin updates both
Name and generated Configured Name on its controls when loading existing accessories,
while preserving a different Home-assigned Configured Name;
Home may retain a separate user-assigned name or cached tile label. Those labels
can be edited in Home without removing or pairing the accessory again. A name
chosen only in Home is not available to the plugin as a prefix for other services;
set a device-name override in the plugin for a consistent prefix throughout.

## Live streaming and quality

Live video and audio use the packaged private codec worker. Output quality is system-wide; input quality
is per camera. The default preserves automatic selection. Optional 720p/15 and
640×360/15 profiles reduce encoding work; 1080p/30 increases it. Smoothness depends
on the installed host and source; synthetic tests do not establish playback.

See [streaming and quality](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/streaming.md) for codec requirements, profiles,
2K input, software encoding, transport guards and known security limitations.

### Two-way talk status

Talkback remains disabled. See the [talkback guard](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/streaming.md#two-way-talk-status).

The next beta remains blocked until private-worker secret handling and owned RTSP
destination enforcement are verified against its release artifacts. The [stable 0.10.0 residual-risk decision](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/plans/security-hardening.md#18-october-2026-delegated-stable-release-residual-risk-disposition)
accepts these risks for that release only; it does not mark them fixed.

## HomeKit Secure Video

Recording is disabled by default. Select cameras explicitly with `hksvCameras`
in plugin settings, using up to four exact Blink names, numeric IDs as strings,
or serial numbers. Stable IDs or serial numbers avoid changes when a camera is
renamed. For example:

```json
{
  "hksvCameras": ["123456"],
  "enableMotionPolling": false
}
```

Restart the child bridge after changing the selection. In Apple Home, allow
recording for each selected camera. HomeKit recording permission and camera-active
controls govern background capture; removing recording permission stops recording
and clears retained fragments. Recording audio follows Home's recording-audio
permission and the plugin's audio setting. Live-view permission is separate:
`enableStreaming: false` does not disable opted-in recording.

An active recording camera keeps a Blink live feed open and shares that feed with
HomeKit live viewers. This increases battery use, bandwidth, and host encoding
work. Begin with one camera; simultaneous capture across different Blink cameras
has not been qualified. Blink can end sessions or refuse new ones, so reconnection
and session rollover can leave gaps. Buffering cannot recover video the camera
or provider never sends and does not guarantee lossless or continuous recording.

The prebuffer retains four seconds before a local video motion trigger. The
recording worker compares small luminance samples from decoded frames, compensates
for uniform brightness shifts, and confirms changes across consecutive frames.
This fixed detector is not person or object recognition; scene-specific sensitivity
and physical motion-to-iCloud playback still need qualification. Motion events are
published only after the buffer is ready, the Blink network is armed, and that
camera's motion switch is enabled. HomeKit recording and camera permissions also
apply. While this recording policy is active, delayed Blink clip-polling events
are suppressed for that camera. `enableMotionPolling` remains optional for other
cameras and is not required for HSV. Continuous live view may affect Blink's own
motion recording; this interaction needs physical testing. Recordings use memory only: retained
fragments are limited to 32 MiB per camera and 64 MiB across cameras, with bounded
transport and worker queues. Exhaustion or discontinuity fails the recording and
clears the affected buffer instead of concealing a gap.

Apple requires a compatible home hub and an eligible iCloud+ plan. Clips appear
in the Home app's recording history, rather than as files in iCloud Drive; see
[Apple's HomeKit Secure Video guide](https://support.apple.com/en-ie/guide/icloud/mme054c72692/icloud).
This local implementation still needs physical motion-to-home-hub-to-iCloud
acceptance, including playback and privacy controls. Automated tests and a working
live stream alone do not establish that iCloud saved a clip.

## Troubleshooting

Use the [troubleshooting guide](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/troubleshooting.md) for connection faults,
recovery, motion, rate limits and runtime checks. Use
[bounded diagnostics](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/debug_logging_spec.md) when collecting evidence.
HomeKit bridge audit entries are logged at INFO with an explicit UTC datetime and
camera/accessory name, including motion detections and clears, characteristic
requests/results, and camera control lifecycles. Debug mode is not required.
A cached snapshot or a Live label alone does not prove sustained video/audio.

## Documentation and development

The [documentation map](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/README.md) identifies the canonical owner for
each topic and separates current guidance from historical evidence.

- [Contributing and local testing](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/CONTRIBUTING.md)
- [Vendor API contract and generation](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/api-contract/README.md)
- [Architecture decisions](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/adr/README.md)
- [Release, installation, rollback and acceptance](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/RELEASE.md)
- [Security findings and delivery ledger](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/plans/security-hardening.md)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for current release notes and migration history.

## License

The JavaScript plugin is MIT - see [LICENSE](LICENSE). Native worker development
sources are GPL-3.0-or-later; see [native/COPYING](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/native/COPYING) and the pinned
dependency notices under [native/dependencies](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/native/dependencies/README.md).
The native worker is not enabled or distributed in the current npm runtime.

## Credits

- API documentation derived from reverse engineering the Blink Android app
- Homebridge platform plugin architecture
- EU-region hosted, Android-refresh, REST-bootstrap, and restart evidence;
  non-EU accounts are not live-validated and remain APK-derived plus
  mocked/parameterized pending authorized validation

## Disclaimer and trademarks

This is an independent, unofficial community project. Neither the developer nor
this project is affiliated with, endorsed by, sponsored by, or otherwise
associated with Immedia Semiconductor, LLC or any of its affiliates, Amazon.com,
Inc. or any of its affiliates, or the Homebridge project and its contributors.

Blink, Amazon, Homebridge, Apple, HomeKit, and other product names, trademarks,
and logos mentioned in this documentation belong to their respective owners.
Their use is solely to identify products, services, and compatibility; it does
not imply endorsement or an official relationship.

This plugin uses privately documented interfaces that may change or become
unavailable without notice. Compatibility and continued access are not
guaranteed. The plugin is not a substitute for the official Blink app or a
professionally monitored security system. Software is provided under the terms
of the applicable [license](LICENSE), including its warranty disclaimer.
