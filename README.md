# @sealad886/homebridge-blink-cameras-new-api

[![npm](https://img.shields.io/npm/v/%40sealad886%2Fhomebridge-blink-cameras-new-api.svg)](https://www.npmjs.com/package/@sealad886/homebridge-blink-cameras-new-api)
[![License](https://img.shields.io/github/license/sealad886/homebridge-blink-cameras-new-api.svg)](LICENSE)
[![Test](https://github.com/sealad886/homebridge-blink-cameras-new-api/actions/workflows/test.yml/badge.svg)](https://github.com/sealad886/homebridge-blink-cameras-new-api/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/sealad886/homebridge-blink-cameras-new-api/branch/main/graph/badge.svg)](https://codecov.io/gh/sealad886/homebridge-blink-cameras-new-api)

> Important: This plugin uses Blink's private OAuth and REST APIs. All APK-known
> production regions use the same production OAuth host; geography changes only
> the REST tier discovered after token issuance. Only an EU/Ireland account has
> live-account evidence. Non-EU accounts are not live-validated and remain covered
> by Android 57.1 APK traces plus automated routing tests.

Modern Blink platform plugin for Homebridge using Blink-hosted OAuth. Exposes Blink devices as proper HomeKit accessories:

- **SecuritySystem** for arm/disarm control of networks
- **MotionSensor** for motion detection events
- **Doorbell** service for ring notifications
- **Switch** for enabling/disabling motion detection per device

API behavior is based on reverse-engineered endpoints from Blink Android 57.1
(`versionCode` 29715642). Blink can change these private interfaces without notice.

## Two-Way Talk Status

Two-way talk is temporarily disabled. The HomeKit microphone/talk UI is hidden and the plugin forces `twoWayAudio` off until IMMIS uplink framing is validated. Even if you previously enabled talkback, the setting is ignored for now. We will re-enable the UI once payload sequencing and ACK handling are confirmed stable.

## Features

- ✅ **Proper HomeKit SecuritySystem** - Arm/disarm networks using the Security System tile in Home app
- ✅ **Motion Detection** - Receive motion alerts in HomeKit when your cameras detect motion
- ✅ **Doorbell Support** - Ring notifications appear as HomeKit doorbell events
- ✅ **Status Polling** - Automatically syncs device states with Blink cloud
- ✅ **OAuth Authentication** - Modern OAuth 2.0 with automatic token refresh
- ✅ **Blink-hosted MFA** - Password and hosted MFA stay on Blink's sign-in page
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

The plugin provides a full configuration UI. Open the remote Homebridge UI in
Brave (for example, `http://raspberrypi.local:8581`), then navigate to `Plugins`
→ `Settings` for `@sealad886/homebridge-blink-cameras-new-api`.

The supported authentication path uses Blink's hosted sign-in. Homebridge
creates the PKCE/state transaction, but Blink alone receives the account
credentials and hosted MFA code. After the callback is finished, Homebridge
stores reusable tokens in its storage root and removes legacy credential/code
fields from the plugin configuration.

Every production account, including the APK's US, EU, AP, and AU tiers, starts at
the same production OAuth host:

- `https://api.oauth.blink.com/oauth/v2/authorize`
- `https://api.oauth.blink.com/oauth/token`

Account geography does not select a different OAuth hostname. The APK's client-ID
choice is a separate manufacturer gate: `Build.MANUFACTURER == "Amazon"` selects
`client_id=amazon`; every other manufacturer selects `client_id=android`.
Homebridge intentionally models a non-Amazon Android public client and therefore
uses `client_id=android` for its hosted flow.

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
| `ffmpegPath` | No | `ffmpeg` | Path to the FFmpeg binary |
| `ffmpegDebug` | No | `false` | Log FFmpeg debug output |
| `rtspTransport` | No | `tcp` | RTSP transport for Blink live view |
| `maxStreams` | No | `1` | Max concurrent HomeKit streams |
| `enableAudio` | No | `true` | Enable audio streaming from camera |
| `twoWayAudio` | No | `false` (forced off) | Talkback is currently disabled; HomeKit microphone UI is hidden until IMMIS uplink is validated |
| `audioCodec` | No | `opus` | Preferred audio codec (`opus`, `aac-eld`, `pcma`, `pcmu`) |
| `audioBitrate` | No | `32` | Audio bitrate (kbps) |
| `videoBitrate` | No | - | Cap video bitrate (kbps) |
| `videoEncoder` | No | `auto` | Preferred FFmpeg video encoder; `auto` prefers platform hardware encoding and falls back to `libx264` |
| `verifyImmisTls` | No | `true` | Verify TLS certificates and hostnames for Blink IMMIS live streams |
| `debugStreamPath` | No | - | Save raw MPEG-TS stream recordings under a `blink-stream-recordings` child directory for debugging |
| `snapshotCacheTTL` | No | `60` | Snapshot cache duration (seconds); `0` always fetches a new snapshot |
| `persistSnapshotCache` | No | `false` | Keep the last snapshot indefinitely and expose a per-camera `Refresh Snapshot` switch in Home |
| `excludeDevices` | No | - | List of device IDs/serials/names to exclude |
| `deviceNameOverrides` | No | - | Array of `{ deviceIdentifier, customName }` entries for custom HomeKit display names (legacy `deviceNames` is still accepted) |
| `deviceSettingOverrides` | No | - | Array of per-device overrides such as `{ deviceIdentifier, motionTimeout }` (legacy `deviceSettings` is still accepted; `motionTimeout` is the currently applied runtime override) |

When `persistAuth` is enabled, tokens and the originating `oauthClientId` are
stored in `.blink-auth.json` inside the Homebridge storage root. The file is
atomically replaced with owner-only mode `0600`. Pre-`0.6.x` state from
`blink-auth/auth-state.json` is migrated automatically. Do not copy either file
into the repository or expose its contents in logs or support requests.

For compatibility with older installations, the runtime still accepts a
paired `username` and `password` in manually edited configuration and can use
them for the legacy iOS-profile sign-in path when compatible token state is
missing or unusable. That hidden fallback sends the credentials through
Homebridge and is deprecated; it is not part of the supported custom-UI flow.
Remove those fields after migrating to hosted sign-in.

When `persistSnapshotCache` is enabled, `snapshotCacheTTL` is ignored after the first successful
snapshot fetch. Use the `Refresh Snapshot` switch in Home to force a new thumbnail capture.

## Quick Start: Hosted Blink Sign-In

1. Open this plugin's settings in the remote Homebridge UI and choose **Sign in
   securely with Blink**. Keep the Homebridge settings tab open. If Brave blocks
   the new tab, choose the revealed **Open Blink Sign-In** fallback.
2. Finish the account-credential and MFA steps only in the separate
   Blink-hosted Brave tab. Homebridge never receives either value.
3. After Blink reaches its desktop **Unsupported Browser** page, copy the full
   address beginning with
   `https://applinks.blink.com/signin/callback` from Brave's address bar.
4. Return to Homebridge and choose **Paste Blink Result and Finish**. This reads
   the clipboard only from that click. If Brave denies clipboard access, reveal
   the manual field, paste the complete address, and choose **Finish with Pasted Address**.
   Clipboard cleanup after completion is best effort: if the browser denies
   clipboard write access, clear the copied callback address manually.
5. If Blink asks for client or account verification after issuing tokens, enter
   that distinct post-token code in Homebridge. This is not Blink's hosted MFA.
6. Wait for stored-token connection verification, then continue to the normal
   plugin schema. Restart Homebridge and confirm the stored session reconnects.

The Raspberry Pi owns the PKCE verifier and expected state. While sign-in is in
progress it stores only the pending transaction in `.blink-auth-pending.json`.
A valid pending transaction can survive a custom-UI process or full Homebridge
restart only within its 15-minute lifetime. A valid callback consumes and
deletes the pending file before the one-time code exchange; if exchange fails,
the operator must start a new sign-in. Success stores the final token state in
`.blink-auth.json`, including `oauthClientId=android`, and hosted completion
forces `persistAuth=true`. Both files are owner-only (`0600`). No public callback
service or inbound port is required.

### Current Hosted-OAuth Validation Boundary

Blink's own hosted UI is the native sign-in surface. A secret-blind Android
AppAuth harness reproduced the exact Blink Android 57.1 authorization request
and reached the hosted identity page. Five authorize variations reached the
same hosted flow, while deliberately invalid token requests reached the token
parser and were rejected. That proves native hosted-page launch and request
construction; it does not replace a fresh authorized code exchange.

The remote Raspberry Pi now runs a valid Android-profile session for the
authorized EU/Ireland account. Blink accepted a still-valid legacy refresh
session with the exact Android refresh form, rotated it again through the
installed plugin, returned user information and homescreen/device discovery,
and survived two clean Homebridge restarts. The persisted state is owner-only,
the plugin configuration contains no credential or verification-code fields,
and no temporary relay, proxy, or pending-auth artifact remains.

With that Android state, `tier_info` returned HTTP 406 from `prod` and `a001`,
and HTTP 200 plus a valid authoritative tier from `prde` and `prsg`. Release
`0.9.1` therefore advances through only `prod`, `prde`, `prsg`, and `a001` on
HTTP 406; it stops at the first success and never probes the APK's special
`cemp` regression or `srf1` refurbishment targets for an ordinary account.
An explicitly configured safe tier outside that ordinary set—such as `sqa1`,
`cemp`, `srf1`, or a numbered e-tier—remains a single-target bootstrap and does
not enter the production-region fallback.

This cross-client refresh proves that the Android token profile works for the
owner's existing EU session, but it is not a fresh packaged hosted
authorization-code exchange. Two earlier fresh packaged callbacks reached the
production token endpoint and returned `invalid_grant`; that final fresh-login
acceptance case remains open. Non-EU accounts are not live-validated.

## Re-Authentication / Token Reset

If you need to re-authenticate or switch Blink accounts, choose **Unlock &
Re-authenticate** in the custom UI, then start hosted sign-in again. Unlocking
clears the current token file, legacy auth state, and any pending transaction
before returning to the signed-out screen. The custom-UI server's `/logout`
route has the same local storage-clearing semantics for integrations, but the
current operator UI does not expose a separate logout button. Neither action
revokes tokens at Blink; it removes the plugin's local ability to reuse them.

## Manual Smoke Checklist (Hosted Authentication)

- Open Homebridge UI → Plugins → this plugin → Settings.
- Confirm there is one hosted flow and no Homebridge username, password, or
  hosted-MFA input.
- Confirm Brave reaches the exact HTTPS App-Link and the clipboard/manual finish
  returns to an authenticated status.
- Confirm the saved plugin config contains no credentials or verification codes.
- Restart Homebridge and confirm `.blink-auth.json` supplies the same account;
  refresh uses its persisted OAuth profile.

## Live Streaming (FFmpeg)

Live streaming uses FFmpeg to transcode Blink's RTSPS stream to HomeKit SRTP. Make sure FFmpeg is installed
and accessible in your PATH, or set `ffmpegPath` to the full binary location.

Set `videoEncoder` to `auto` for the safest default across mixed installations. On macOS it prefers
`h264_videotoolbox`, on Linux ARM boards such as Raspberry Pi it prefers `h264_v4l2m2m`, and it falls back
to `libx264` if the hardware encoder cannot be started.

> [!NOTE]
> The automatic encoder selection has been tested on a limited set of hardware (macOS with VideoToolbox and Raspberry Pi with V4L2). If you run into choppy streams, encoding errors, or unexpected fallback to software encoding on your platform, please [open an issue](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/new) with your hardware details and FFmpeg debug logs (`ffmpegDebug: true`).

IMMIS live streams verify the upstream TLS certificate and hostname by default. Keep `verifyImmisTls: true`
unless Blink support has confirmed your camera only exposes an insecure/self-signed stream endpoint. When
`ffmpegDebug` is enabled, Blink live-view input URLs and SRTP keys are redacted from startup, FFmpeg
argument, and FFmpeg stderr logs. The generated HomeKit `srtp://` output address may still appear in
FFmpeg argument diagnostics. Debug recordings are written under
`<debugStreamPath>/blink-stream-recordings/`, use hashed camera identifiers in filenames, and are
created with owner-only file permissions where the filesystem supports POSIX modes. Existing
recordings from older versions under `<debugStreamPath>/blink-stream-*.ts` are not moved or
re-permissioned automatically; delete them or migrate them into a private directory if they contain
sensitive footage.

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

## Hosted MFA and Post-Token Verification

Blink's sign-in page owns the account credential and hosted MFA steps. Do not
put either value in Homebridge configuration.

## Client Verification (New Device Approval)

After tokens exist, Blink may require one-time **client verification** for the
new Homebridge device. The custom UI identifies this post-token requirement,
accepts the code through its verification form, and never saves it in plugin
configuration. Leave **Trust this device** enabled unless you intentionally want
Blink to ask again.

## Account/Phone Verification

Some accounts require an additional **account or phone verification** after
token issuance. Complete it only when the custom UI labels the request as
account verification. If Blink asks for another PIN, request a new one and use
the same form; the token state remains authenticated while verification is
pending.

## Troubleshooting

### 401 Unauthorized / 403 Forbidden

- Keep `deviceId` stable and use **Test Connection** to retry with stored tokens.
- Change `deviceId` only when intentionally registering a new client; first use
  **Unlock & Re-authenticate**, then complete hosted sign-in and any verification
  again.
- Complete any client/account verification shown by the custom UI.
- If refresh has expired, use **Unlock & Re-authenticate** and start a fresh
  hosted sign-in.
- Do not manually choose a geographic tier; `tier_info` is authoritative.

### Rate Limits (429)

The plugin automatically backs off and retries. If you're hitting rate limits frequently:

- Increase `pollInterval` to reduce API calls
- Set `enableMotionPolling` to `false` to reduce calls

### Node.js Version

This plugin requires Node.js 20, 22, or 24 LTS. Check your version:

```bash
node --version
```

### Motion Not Detected

- Ensure `enableMotionPolling` is `true`
- Check that the network is armed (motion events only trigger when armed)
- Reduce `pollInterval` for faster detection (but more API calls)

## API Documentation

This plugin's API implementation is based on reverse engineering the official Blink Home Monitor Android app, with URL routing revalidated against Android app v57.1 (`versionCode` 29715642). Key technical details:

### Authentication

- Hosted OAuth 2.0 authorization-code flow with Pi-owned PKCE through the same
  production OAuth host for EU, US, AP, and AU accounts, plus the registered
  HTTPS App-Link callback
- APK manufacturer gate: `Build.MANUFACTURER == "Amazon"` selects
  `client_id=amazon`; otherwise it selects `client_id=android`. Homebridge uses
  the non-Amazon Android profile.
- Android sessions refresh with `client_id=android` and `scope=client`; migrated
  state without `oauthClientId` retains the legacy iOS refresh contract
- Hardware ID required for device identification
- Client verification and account verification flows for new device approval
- OAuth token responses provide no account region or tier. For hosted
  completion, HTTP 406 advances through the APK's ordinary production defaults
  `prod`, `prde`, `prsg`, and `a001`; the first successful `v1/users/tier_info`
  response selects the authoritative `rest-{tier}.immedia-semi.com` target.
  The hosted user journey does not require a region choice.

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
- EU/Ireland hosted, Android-refresh, REST-bootstrap, and restart evidence;
  non-EU accounts are not live-validated and remain APK-derived plus
  mocked/parameterized pending authorized validation
