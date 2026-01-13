# TODO

Future enhancements and technical debt for homebridge-blinkcameras.

## Deferred Features

### Live Streaming (RTSPS → SRTP Transcoding)

The Blink API provides RTSPS streaming URLs for live video. HomeKit requires SRTP streams. Implementation requires:

1. **Server-side Transcoding**
   - FFmpeg or similar to convert RTSPS → SRTP
   - Handle TLS certificates for RTSPS endpoints
   - Manage stream lifecycle (start/stop on HomeKit demand)

2. **HomeKit Camera Service**
   - Implement `CameraStreamingDelegate` for stream management
   - Configure resolution/framerate based on device capabilities
   - Handle bidirectional audio where supported

3. **Evidence References**
   - API dossier Section 4.2 (Live Video)
   - `BlinkLiveVideoResponse` interface with `rtsps_uri` field
   - RTSPS URL format: `rtsps://{host}/{account_id}_{network_id}_{device_id}/{stream_type}?...`

**Complexity**: High - requires external dependency (FFmpeg), persistent process management, and significant HomeKit plumbing.

### Snapshot/Thumbnail Support

The API supports on-demand thumbnail generation:

- `POST v1/accounts/{account}/networks/{network}/cameras/{camera}/thumbnail`
- `POST v1/accounts/{account}/networks/{network}/owls/{owl}/thumbnail`
- `POST v1/accounts/{account}/networks/{network}/doorbells/{doorbell}/thumbnail`

Could expose thumbnails as HomeKit camera snapshots via `CameraSource`.

**Complexity**: Medium - API client methods already implemented, need HomeKit camera service.

### Event-Based Motion Detection

Current implementation polls the media API for new clips. Could improve with:

1. **Websocket/Push Notifications**
   - Investigate if Blink supports websocket connections for real-time events
   - FCM tokens seen in APK suggest push notification support

2. **Reduced Polling Latency**
   - Current minimum poll interval: 15 seconds
   - Could reduce if Blink rate limits allow

**Complexity**: Medium - requires additional reverse engineering of push notification system.

## Technical Debt

### Test Coverage

Current coverage is incomplete:

- [ ] Add unit tests for all accessory classes
- [ ] Add integration tests with mocked Blink responses
- [ ] Add tests for polling and motion event detection
- [ ] Test error handling and retry logic

### Code Quality

- [ ] Add JSDoc comments to all public methods
- [ ] Add evidence references to remaining code where applicable
- [ ] Consider extracting common accessory logic to base class

### CI/CD

- [ ] Set up GitHub Actions for automated testing
- [ ] Add npm publish workflow
- [ ] Add code coverage reporting

## Configuration Improvements

- [ ] Validate config options at startup
- [ ] Support per-device motion sensitivity settings
- [ ] Support excluding specific devices from discovery
- [ ] Support custom names for devices in HomeKit

## Documentation

- [x] README with feature documentation
- [ ] Contributing guide
- [ ] API dossier reference in docs/
- [ ] Architecture decision records

## Completed

### v2.0.0

- [x] SecuritySystem service for networks
- [x] MotionSensor service for all device types
- [x] Doorbell service for ring notifications
- [x] Status polling with configurable interval
- [x] Media API polling for motion events
- [x] Config schema with proper UI layout
- [x] Evidence references throughout codebase
