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
- **Node.js** 18.0.0 or later (native `fetch` API required)
- A Blink account with credentials

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

The plugin provides a full configuration UI. Navigate to Plugins → Settings for @sealad886/homebridge-blink-cameras-new-api.

### Manual Configuration

Add a platform entry to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "BlinkCameras",
      "name": "Blink",
      "username": "you@example.com",
      "password": "your-blink-password",
      "deviceId": "homebridge-blink-01",
      "persistAuth": true,
      "trustDevice": true,
      "pollInterval": 60,
      "motionTimeout": 30,
      "enableMotionPolling": true,
      "enableStreaming": true,
      "ffmpegPath": "ffmpeg",
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
| `username` | Yes | - | Your Blink account email |
| `password` | Yes | - | Your Blink account password |
| `deviceId` | No | `homebridge-blink` | Unique identifier sent to Blink (hardware_id) |
| `deviceName` | No | - | Fallback for deviceId |
| `twoFactorCode` | No | - | 2FA code (only needed during initial setup) |
| `clientVerificationCode` | No | - | New-device verification PIN (only when prompted) |
| `accountVerificationCode` | No | - | Account/phone verification PIN (only when prompted) |
| `persistAuth` | No | `true` | Persist auth tokens across restarts |
| `trustDevice` | No | `true` | Trust this device during client verification |
| `tier` | No | `prod` | Blink API tier: `prod`, `sqa1`, `cemp`, `prde`, `prsg`, `a001`, or `srf1` (auto-detected tiers from Blink are honored for routing) |
| `sharedTier` | No | - | Override shared REST tier (defaults to `tier`) |
| `debugAuth` | No | `false` | Enable verbose authentication logging |
| `pollInterval` | No | `60` | Seconds between state polls (min 15) |
| `motionTimeout` | No | `30` | Seconds motion stays active |
| `enableMotionPolling` | No | `true` | Poll for motion events |
| `enableStreaming` | No | `true` | Enable HomeKit live streaming (FFmpeg required) |
| `ffmpegPath` | No | `ffmpeg` | Path to FFmpeg binary |
| `ffmpegDebug` | No | `false` | Log FFmpeg debug output |
| `rtspTransport` | No | `tcp` | RTSP transport for Blink live view |
| `maxStreams` | No | `1` | Max concurrent HomeKit streams |
| `enableAudio` | No | `true` | Enable audio streaming from camera |
| `twoWayAudio` | No | `false` (forced off) | Talkback is disabled; HomeKit microphone UI is hidden until IMMIS uplink is validated |
| `audioCodec` | No | `opus` | Preferred audio codec (`opus`, `aac-eld`, `pcma`, `pcmu`) |
| `audioBitrate` | No | `32` | Audio bitrate (kbps) |
| `videoBitrate` | No | - | Cap video bitrate (kbps) |
| `debugStreamPath` | No | - | Save raw MPEG-TS stream recordings for debugging |
| `snapshotCacheTTL` | No | `60` | Snapshot cache duration (seconds); 0 always fetches new snapshots |
| `excludeDevices` | No | - | List of device IDs/serials/names to exclude |
| `deviceNames` | No | - | Map of device IDs/serials to custom display names |
| `deviceSettings` | No | - | Per-device overrides (e.g., motion timeout/enable/sensitivity) |

Note: Per-device motion enable/sensitivity overrides only take effect when the Blink system is armed.

When `persistAuth` is enabled, auth tokens are stored in a sibling folder to Homebridge's HAP
storage (for example, `/var/lib/homebridge/blink-auth/`) to avoid corrupting the HAP
persist directory.

## Quick Start: Login & Authorization

On first setup, Blink may prompt for up to three codes. Provide only the one being requested at the time, then remove it after successful login/verification. Keep `persistAuth: true` so you won’t be prompted again.

1. Start with your `username`, `password`, unique `deviceId`, and `persistAuth: true`.
2. If prompted for a two-factor code, set `twoFactorCode` temporarily and restart Homebridge.
3. If prompted for client verification (new device approval), set `clientVerificationCode` temporarily and restart.
4. If prompted for account/phone verification, set `accountVerificationCode` temporarily and restart.
5. After successful login/verification, remove any `*Code` values from your config and restart Homebridge.

Tips:

- Ensure `deviceId` is unique per Homebridge instance.
- Leave `trustDevice: true` so future sessions are approved automatically.
- If you keep seeing verification prompts, confirm that `persistAuth` is enabled and the Homebridge process can write to the auth directory.

## Live Streaming (FFmpeg)

Live streaming uses FFmpeg to transcode Blink's RTSPS stream to HomeKit SRTP. Make sure FFmpeg is installed
and accessible in your PATH, or set `ffmpegPath` to the full binary location.

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

- OAuth 2.0 password grant flow via `api.oauth.blink.com` (production)
- Automatic token refresh when tokens expire
- Hardware ID required for device identification
- Client verification PIN flow for new device approval
- Region-aware routing based on tier and locale; behavior may differ by country

### Endpoints

- Homescreen: `GET v4/accounts/{account_id}/homescreen`
- Arm/Disarm: `POST v1/accounts/{account_id}/networks/{network_id}/state/arm|disarm`
- Motion Enable/Disable: `POST accounts/{account_id}/networks/{network_id}/cameras/{camera_id}/enable|disable`
- Media: `GET v4/accounts/{account_id}/media`

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
4. `npm pack` and confirm the tarball includes `dist/`, `config.schema.json`, and `homebridge-ui/`
5. `npm run watch` and confirm the plugin boots with `test/hbConfig/config.json`

## Changelog

### v2.0.0

- Complete TypeScript rewrite with full API dossier evidence
- SecuritySystem service for proper HomeKit arm/disarm
- MotionSensor service for motion detection events
- Doorbell service for ring notifications
- Status polling with configurable interval
- Media API polling for motion event detection
- OAuth 2.0 authentication with automatic token refresh
- Comprehensive configuration UI

### v1.x

- Legacy implementation using `node-blink-security`

## License

MIT - see [LICENSE](LICENSE) for details.

## Credits

- API documentation derived from reverse engineering the Blink Android app
- Homebridge platform plugin architecture
- Community feedback on locale-specific behavior (EU validated; US pending)
