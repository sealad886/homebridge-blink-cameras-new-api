# homebridge-blinkcameras

[![npm](https://img.shields.io/npm/v/homebridge-blinkcameras.svg)](https://www.npmjs.com/package/homebridge-blinkcameras)
[![License](https://img.shields.io/github/license/bartdorsey/homebridge-blinkcameras.svg)](LICENSE)
[![Test](https://github.com/bartdorsey/homebridge-blinkcameras/actions/workflows/test.yml/badge.svg)](https://github.com/bartdorsey/homebridge-blinkcameras/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/bartdorsey/homebridge-blinkcameras/branch/main/graph/badge.svg)](https://codecov.io/gh/bartdorsey/homebridge-blinkcameras)

Modern Blink platform plugin for Homebridge using the official OAuth endpoints. Exposes Blink devices as proper HomeKit accessories:

- **SecuritySystem** for arm/disarm control of networks
- **MotionSensor** for motion detection events
- **Doorbell** service for ring notifications
- **Switch** for enabling/disabling motion detection per device

All API interactions are based on reverse-engineered endpoints from the official Blink Android app (v50.1).

## Features

- ✅ **Proper HomeKit SecuritySystem** - Arm/disarm networks using the Security System tile in Home app
- ✅ **Motion Detection** - Receive motion alerts in HomeKit when your cameras detect motion
- ✅ **Doorbell Support** - Ring notifications appear as HomeKit doorbell events
- ✅ **Status Polling** - Automatically syncs device states with Blink cloud
- ✅ **OAuth Authentication** - Modern OAuth 2.0 with automatic token refresh
- ✅ **2FA Support** - Works with Blink accounts that have two-factor authentication enabled
- ✅ **Retry Logic** - Automatic retry with exponential backoff for rate limits and server errors

## Requirements

- **Homebridge** 1.6.0 or later
- **Node.js** 18.0.0 or later (native `fetch` API required)
- A Blink account with credentials

## Installation

### Via Homebridge UI (Recommended)

1. Open the Homebridge UI
2. Navigate to Plugins
3. Search for "homebridge-blinkcameras"
4. Click Install

### Via npm

```bash
npm install -g homebridge-blinkcameras
```

Restart Homebridge after installing.

## Configuration

### Via Homebridge UI

The plugin provides a full configuration UI. Navigate to Plugins → Settings for homebridge-blinkcameras.

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
      "pollInterval": 60,
      "motionTimeout": 30,
      "enableMotionPolling": true,
      "enableStreaming": true,
      "ffmpegPath": "ffmpeg",
      "enableAudio": true,
      "twoWayAudio": true
    }
  ]
}
```

### Configuration Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `platform` | Yes | - | Must be `BlinkCameras` |
| `name` | Yes | `Blink` | Platform name shown in logs |
| `username` | Yes | - | Your Blink account email |
| `password` | Yes | - | Your Blink account password |
| `deviceId` | No | `homebridge-blink` | Unique identifier sent to Blink (hardware_id) |
| `deviceName` | No | - | Fallback for deviceId |
| `twoFactorCode` | No | - | 2FA code (only needed during initial setup) |
| `tier` | No | `prod` | Blink API tier: `prod`, `sqa1`, `cemp`, `prde`, `prsg`, `a001`, or `srf1` |
| `sharedTier` | No | - | Override shared REST tier (defaults to `tier`) |
| `pollInterval` | No | `60` | Seconds between state polls (min 15) |
| `motionTimeout` | No | `30` | Seconds motion stays active |
| `enableMotionPolling` | No | `true` | Poll for motion events |
| `enableStreaming` | No | `true` | Enable HomeKit live streaming (FFmpeg required) |
| `ffmpegPath` | No | `ffmpeg` | Path to FFmpeg binary |
| `ffmpegDebug` | No | `false` | Log FFmpeg debug output |
| `rtspTransport` | No | `tcp` | RTSP transport for Blink live view |
| `maxStreams` | No | `1` | Max concurrent HomeKit streams |
| `enableAudio` | No | `true` | Enable audio streaming from camera |
| `twoWayAudio` | No | `true` | Enable talkback audio to camera |
| `audioCodec` | No | `opus` | Preferred audio codec (`opus`, `aac-eld`, `pcma`, `pcmu`) |
| `audioBitrate` | No | `32` | Audio bitrate (kbps) |
| `videoBitrate` | No | - | Cap video bitrate (kbps) |

## Live Streaming (FFmpeg)

Live streaming uses FFmpeg to transcode Blink's RTSPS stream to HomeKit SRTP. Make sure FFmpeg is installed
and accessible in your PATH, or set `ffmpegPath` to the full binary location.

## Supported Devices

| Blink Device | HomeKit Service | Features |
|--------------|-----------------|----------|
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

## Troubleshooting

### 401 Unauthorized / 403 Forbidden

- Regenerate a unique `deviceId`
- Check your email for the Blink device approval prompt
- Provide a fresh `twoFactorCode` if prompted

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

- OAuth 2.0 password grant flow via `api.pdoauth.blink.com`
- Automatic token refresh when tokens expire
- Hardware ID required for device identification

### Endpoints

- Homescreen: `GET v4/accounts/{account_id}/homescreen`
- Arm/Disarm: `POST v1/accounts/{account_id}/networks/{network_id}/state/arm|disarm`
- Motion Enable/Disable: `POST accounts/{account_id}/networks/{network_id}/cameras/{camera_id}/enable|disable`
- Media: `GET v4/accounts/{account_id}/media`

For full endpoint documentation, see the API dossier in the source repository.

## Development

```bash
# Clone the repository
git clone https://github.com/your-username/homebridge-blinkcameras.git
cd homebridge-blinkcameras

# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Run tests
npm test

# Lint
npm run lint
```

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
