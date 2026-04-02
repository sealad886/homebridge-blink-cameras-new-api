# @sealad886/homebridge-blink-cameras-new-api

[![npm](https://img.shields.io/npm/v/%40sealad886%2Fhomebridge-blink-cameras-new-api.svg)](https://www.npmjs.com/package/@sealad886/homebridge-blink-cameras-new-api)
[![License](https://img.shields.io/github/license/sealad886/homebridge-blink-cameras-new-api.svg)](LICENSE)
[![Test](https://github.com/sealad886/homebridge-blink-cameras-new-api/actions/workflows/test.yml/badge.svg)](https://github.com/sealad886/homebridge-blink-cameras-new-api/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/sealad886/homebridge-blink-cameras-new-api/branch/main/graph/badge.svg)](https://codecov.io/gh/sealad886/homebridge-blink-cameras-new-api)

> Important: This plugin uses Blink's new (OAuth-based) API and has been validated to work in at least one European locale. It has not yet been tested in the United States. Feedback from multiple locales is welcome—the new API requires region-aware resolution.

Modern Blink platform plugin for Homebridge using the official OAuth endpoints. Exposes Blink devices as proper HomeKit accessories:

- **SecuritySystem** for arm/disarm control of networks
- **MotionSensor** for motion detection events
- **Doorbell** service for ring notifications
- **Switch** for enabling/disabling motion detection per device

All API interactions are based on reverse-engineered endpoints from the official Blink Android app (v50.1).

## Two-Way Talk Status

Two-way talk is temporarily disabled. The HomeKit microphone/talk UI is hidden and the plugin forces `twoWayAudio` off until IMMIS uplink framing is validated. Even if you previously enabled talkback, the setting is ignored for now. We will re-enable the UI once payload sequencing and ACK handling are confirmed stable.

## Features

- ✅ **Proper HomeKit SecuritySystem** - Arm/disarm networks using the Security System tile in Home app
- ✅ **Motion Detection** - Receive motion alerts in HomeKit when your cameras detect motion
- ✅ **Doorbell Support** - Ring notifications appear as HomeKit doorbell events
- ✅ **Status Polling** - Automatically syncs device states with Blink cloud
- ✅ **OAuth Authentication** - Modern OAuth 2.0 with automatic token refresh
- ✅ **2FA Support** - Works with Blink accounts that have two-factor authentication enabled
- ✅ **Retry Logic** - Automatic retry with exponential backoff for rate limits and server errors

## Requirements

- **Homebridge** 1.11.1 or later
- **Node.js** 20, 22, or 24 LTS
- A Blink account

For the core HomeKit features (arm/disarm, motion, doorbell events, snapshots), no extra binaries are required. For **HomeKit live streaming**, install `ffmpeg` and make sure the **homebridge** user can execute it (for example if Homebridge is running as a service user on Debian/Ubuntu).

> [!NOTE]
> If Homebrew installs FFmpeg as keg-only, set `ffmpegPath` in the plugin config to the full binary path.

```bash
# once Homebrew is installed
brew install 'ffmpeg@8'     # or 'ffmpeg-full@8' for more features
```

FFmpeg 6+ is recommended. Older releases are untested and may not work reliably for live streaming.

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

## Configuration

### Via Homebridge UI

The plugin provides a full configuration UI. Navigate to `Plugins` → `Settings` for `@sealad886/homebridge-blink-cameras-new-api`.

Authentication is handled in the custom UI card (**Sign in to Blink**). The schema form intentionally hides credential and verification-code fields, and a successful sign-in now keeps the Blink password out of the platform config while storing reusable tokens in Homebridge's `.blink-auth.json` auth file with owner-only permissions. Temporary verification codes are cleared after successful login.

### Manual Configuration

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

### Configuration Options

| Option | Required | Default | Description |
| ------ | -------- | ------- | ----------- |
| `platform` | Yes | - | Must be `BlinkCameras` |
| `name` | Yes | `Blink` | Platform name shown in logs |
| `username` | No* | - | Manual fallback email address. The custom UI may populate this automatically after a successful sign-in |
| `password` | No* | - | Manual fallback password for recovery-only flows; it is not re-saved by the custom UI after sign-in |
| `deviceId` | No | `homebridge-blink` | Unique identifier sent to Blink (`hardware_id`) |
| `deviceName` | No | - | Friendly fallback name for this Homebridge instance |
| `persistAuth` | No | `true` | Persist auth tokens across restarts in Homebridge's `.blink-auth.json` file |
| `trustDevice` | No | `true` | Trust this device during client verification |
| `authLocked` | No | `false` | Ignore stored verification codes after a successful login until you explicitly unlock auth |
| `tier` | No | `prod` | Blink API tier. Common UI values are `prod`, `prde`, `prsg`, `a001`, and `e001`-`e006`; advanced manual values such as `sqa1`, `cemp`, and `srf1` are also supported |
| `sharedTier` | No | - | Advanced manual override for shared REST routing; defaults to `tier` and is intentionally hidden from the UI schema |
| `debugAuth` | No | `false` | Enable verbose authentication logging |
| `pollInterval` | No | `60` | Seconds between state polls (min 15) |
| `motionTimeout` | No | `30` | Seconds motion stays active |
| `enableMotionPolling` | No | `true` | Poll for motion events |
| `enableStreaming` | No | `true` | Enable HomeKit live streaming (FFmpeg required only for streaming) |
| `ffmpegPath` | No | `ffmpeg` | Path to the FFmpeg binary |
| `ffmpegDebug` | No | `false` | Log FFmpeg debug output |
| `rtspTransport` | No | `tcp` | RTSP transport for Blink live view |
| `maxStreams` | No | `1` | Max concurrent HomeKit streams |
| `enableAudio` | No | `true` | Enable audio streaming from camera |
| `twoWayAudio` | No | `false` (forced off) | Talkback is currently disabled; HomeKit microphone UI is hidden until IMMIS uplink is validated |
| `audioCodec` | No | `opus` | Preferred audio codec (`opus`, `aac-eld`, `pcma`, `pcmu`, `copy`). Use `copy` to passthrough the source audio without re-encoding |
| `audioBitrate` | No | `32` | Audio bitrate (kbps) |
| `videoBitrate` | No | - | Cap video bitrate (kbps) |
| `videoEncoder` | No | `auto` | Preferred FFmpeg video encoder; `auto` prefers platform hardware encoding and falls back to `libx264` |
| `debugStreamPath` | No | - | Save raw MPEG-TS stream recordings for debugging |
| `snapshotCacheTTL` | No | `60` | Snapshot cache duration (seconds); `0` always fetches a new snapshot |
| `persistSnapshotCache` | No | `false` | Keep the last snapshot indefinitely and expose a per-camera `Refresh Snapshot` switch in Home |
| `excludeDevices` | No | - | List of device IDs/serials/names to exclude |
| `deviceNameOverrides` | No | - | Array of `{ deviceIdentifier, customName }` entries for custom HomeKit display names (legacy `deviceNames` is still accepted) |
| `deviceSettingOverrides` | No | - | Array of per-device overrides such as `{ deviceIdentifier, motionTimeout }` (legacy `deviceSettings` is still accepted; `motionTimeout` is the currently applied runtime override) |

When `persistAuth` is enabled, auth tokens are stored in a single `.blink-auth.json` file inside the Homebridge storage root. Pre-`0.6.x` installs using `blink-auth/auth-state.json` are migrated automatically.

\* `username` and `password` are optional when you already have persisted tokens. They remain supported for manual recovery flows, but the custom UI no longer writes the plaintext password back into the saved platform config.

\* `twoFactorCode`, `clientVerificationCode`, and `accountVerificationCode` are also supported for manual fallback flows even though they are intentionally hidden from the schema UI. Add them only temporarily when Blink requests a code, then remove them after successful authentication.

When `persistSnapshotCache` is enabled, `snapshotCacheTTL` is ignored after the first successful
snapshot fetch. Use the `Refresh Snapshot` switch in Home to force a new thumbnail capture.

## Quick Start: Login & Authorization

Use Homebridge UI → plugin Settings → **Sign in to Blink**.

1. Enter email/password in the custom UI login card.
2. Complete any prompted 2FA/client/account verification in the same custom UI flow.
3. Keep `persistAuth: true` so tokens survive restarts.
4. Confirm the plugin remains authenticated after restart. Temporary verification-code fields should be cleared automatically, and the plaintext Blink password should not be written back into the platform config.

Tips:

- Ensure `deviceId` is unique per Homebridge instance.
- Leave `trustDevice: true` so future sessions are approved automatically.
- If you want restarts to ignore any stored verification codes after a successful login, enable `authLocked`.
- If you keep seeing verification prompts, confirm that `persistAuth` is enabled and the Homebridge process can write to `.blink-auth.json`.

## Re-Authentication / Token Reset

If you need to re-authenticate or switch Blink accounts:

1. Stop Homebridge.
2. Remove the persisted auth file from the Homebridge storage root: `.blink-auth.json`.
   - If you are upgrading from a pre-`0.6.x` release and the legacy directory still exists, also remove `blink-auth/auth-state.json`.
3. Start Homebridge and run **Sign in to Blink** again from the plugin custom UI.

## Manual Smoke Checklist (Duplicate Auth UI Regression)

- Open Homebridge UI → Plugins → this plugin → Settings.
- Confirm there is exactly one auth flow: the custom UI **Sign in to Blink** card.
- Confirm there is no schema auth fieldset containing username/password/verification code inputs.
- Complete login and restart Homebridge.
- Confirm authentication persists after restart and any temporary verification-code fields have been cleared from the config without re-saving the plaintext Blink password.

## Live Streaming (FFmpeg)

Live streaming uses FFmpeg to transcode Blink's RTSPS stream to HomeKit SRTP. Make sure FFmpeg is installed
and accessible in your PATH, or set `ffmpegPath` to the full binary location.

Set `videoEncoder` to `auto` for the safest default across mixed installations. On macOS it prefers
`h264_videotoolbox`, on Linux ARM boards such as Raspberry Pi it prefers `h264_v4l2m2m`, and it falls back
to `libx264` if the hardware encoder cannot be started.

> [!NOTE]
> The automatic encoder selection has been tested on a limited set of hardware (macOS with VideoToolbox and Raspberry Pi with V4L2). If you run into choppy streams, encoding errors, or unexpected fallback to software encoding on your platform, please [open an issue](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/new) with your hardware details and FFmpeg debug logs (`ffmpegDebug: true`).

If you use [`brew`](http://brew.sh) (MacOS or Linux), install `ffmpeg` using:

```bash
brew install 'ffmpeg@8'
```

## Supported Devices

| Blink Device | HomeKit Service | Features |
| ------------ | --------------- | -------- |
| **Network** | SecuritySystem | Arm/disarm all cameras in network |
| **Camera** | Switch + MotionSensor | Enable/disable motion, motion events |
| **Doorbell** | Doorbell + Switch + MotionSensor | Ring events, enable/disable motion |
| **Owl (Mini)** | Switch + MotionSensor | Enable/disable motion, motion events |

### SecuritySystem Modes

The HomeKit SecuritySystem exposes standard modes:

- **Away Arm** → Network is armed
- **Stay Arm** → Network is armed (same as Away)
- **Night Arm** → Network is armed (same as Away)
- **Disarm** → Network is disarmed

Note: Blink only has armed/disarmed states, so all "armed" modes map to Blink's armed state.

## Two-Factor Authentication

> [!TIP]
> If `authLocked` is enabled, unlock authentication in the custom UI before using temporary verification-code fields. Locked auth ignores stored codes on restart.

When you first connect a new device to your Blink account:

1. Blink sends an email with a verification code
2. Add the code to `twoFactorCode` in your config
3. Restart Homebridge
4. After successful login, **remove the 2FA code** from your config
5. Restart Homebridge again

Future logins will use refresh tokens and won't require 2FA.

## Client Verification (New Device Approval)

Blink may require a one-time **client verification** for new devices, which is separate from 2FA:

1. The plugin will request a verification code on first login.
2. Check your email/SMS for the code.
3. Add the code to `clientVerificationCode` in your config.
4. Restart Homebridge.
5. After successful verification, **remove the code** from your config.

If you keep seeing verification prompts, ensure `persistAuth` is enabled and your `deviceId` is unique.

## Account/Phone Verification

Some accounts require an additional **account or phone verification** step:

1. The plugin will request a verification code when required.
2. Check your email/SMS for the code.
3. Add the code to `accountVerificationCode` in your config.
4. Restart Homebridge.
5. After successful verification, **remove the code** from your config.

### Example: Temporary Codes in Config

Add only one code at a time when requested by Blink:

```json
{
  "platform": "BlinkCameras",
  "username": "you@example.com",
  "password": "your-blink-password",
  "deviceId": "homebridge-blink-01",
  "persistAuth": true,
  "twoFactorCode": "123456" // remove after success, then restart
}
```

## Troubleshooting

### 401 Unauthorized / 403 Forbidden

- Regenerate a unique `deviceId`
- Check your email for the Blink device approval prompt
- Provide a fresh `twoFactorCode` if prompted
- If logs show `tier_info` with a different tier, restart after the plugin auto-updates routing

### Rate Limits (429)

The plugin automatically backs off and retries. If you're hitting rate limits frequently:

- Increase `pollInterval` to reduce API calls
- Set `enableMotionPolling` to `false` to reduce calls

### Node.js Version

This plugin requires Node.js 18+ for the native `fetch` API. Check your version:

```bash
node --version
```

### Motion Not Detected

- Ensure `enableMotionPolling` is `true`
- Check that the network is armed (motion events only trigger when armed)
- Reduce `pollInterval` for faster detection (but more API calls)

## API Documentation

This plugin's API implementation is based on reverse engineering the official Blink Home Monitor Android app (v50.1). Key technical details:

### Authentication

- OAuth 2.0 authorization-code flow with PKCE via `api.oauth.blink.com`
- Automatic token refresh using the `refresh_token` grant
- Hardware ID required for device identification
- Client verification and account verification flows for new device approval
- Region-aware routing based on tier and locale; behavior may differ by country

### Endpoints

- Homescreen/state discovery via `v4/accounts/{account_id}/homescreen`
- Arm/Disarm via `v1/accounts/{account_id}/networks/{network_id}/state/arm|disarm`
- Motion enable/disable via Blink device control endpoints under `accounts/{account_id}/networks/{network_id}/...`
- Media polling via Blink `v4` media endpoints for motion/ring detection

For full endpoint documentation, see the API dossier in the source repository.

## Development

```bash
# Clone the repository
git clone https://github.com/sealad886/homebridge-blink-cameras-new-api.git
cd homebridge-blink-cameras-new-api

# Install dependencies
npm install

# Build
npm run build

# Watch + Homebridge (uses test/hbConfig)
npm run watch

# TypeScript-only rebuilds
npm run watch:ts

# Run tests
npm test

# Lint
npm run lint
```

### How to verify (local)

1. `npm run build`
2. `npm test`
3. `npm run lint`
4. `npm pack` and confirm the tarball includes `dist/` (including `dist/homebridge-ui/`) and `config.schema.json`
5. `npm run watch` and confirm the plugin boots with `test/hbConfig/config.json`

## Changelog

See `CHANGELOG.md` for current release notes and migration history.

## License

MIT - see [LICENSE](LICENSE) for details.

## Credits

- API documentation derived from reverse engineering the Blink Android app
- Homebridge platform plugin architecture
- Community feedback on locale-specific behavior (EU validated; US pending)
