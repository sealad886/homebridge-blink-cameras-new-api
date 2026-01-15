# TODO

Future enhancements and technical debt for homebridge-blink-cameras-new-api.

## Deferred Features

### Live Streaming (RTSPS → SRTP Transcoding)

The Blink API provides RTSPS streaming URLs for live video. HomeKit requires SRTP streams.

**Status**: Not implemented - requires FFmpeg and complex stream management.

**Documentation**: [docs/future/live-streaming.md](docs/future/live-streaming.md)

**Complexity**: High

### Event-Based Motion Detection

Current implementation polls the media API. Could improve with push notifications or WebSocket.

**Status**: Polling-based implementation complete; real-time events deferred.

**Documentation**: [docs/future/event-motion.md](docs/future/event-motion.md)

**Complexity**: Medium-High

## Technical Debt

### Test Coverage

- [x] Add unit tests for all accessory classes
- [x] Add integration tests with mocked Blink responses
- [x] Add tests for polling and motion event detection
- [x] Test error handling and retry logic

### Code Quality

- [x] Add JSDoc comments to all public methods
- [x] Add evidence references to remaining code where applicable
- [ ] Consider extracting common accessory logic to base class

### CI/CD

- [x] Set up GitHub Actions for automated testing
- [x] Add npm publish workflow
- [x] Add code coverage reporting

## Configuration Improvements

- [x] Validate config options at startup
- [x] Support per-device motion timeout settings
- [x] Support excluding specific devices from discovery
- [x] Support custom names for devices in HomeKit
- [ ] Support per-device motion sensitivity settings

## Documentation

- [x] README with feature documentation
- [x] Contributing guide (CONTRIBUTING.md)
- [x] Architecture decision records (docs/adr/)
- [x] Future feature documentation (docs/future/)
- [x] API dossier reference in docs/

## Completed

### v2.1.0 (Current Development)

- [x] Snapshot support via HomeKit CameraController
- [x] Device exclusion (excludeDevices config)
- [x] Custom device names (deviceNames config)
- [x] Per-device motion timeout (deviceSettings config)
- [x] Config validation at startup
- [x] CI/CD with GitHub Actions
- [x] Code coverage with Codecov
- [x] Comprehensive JSDoc documentation
- [x] CONTRIBUTING.md guide
- [x] ADRs for key decisions
- [x] 114 passing tests

### v2.0.0

- [x] SecuritySystem service for networks
- [x] MotionSensor service for all device types
- [x] Doorbell service for ring notifications
- [x] Status polling with configurable interval
- [x] Media API polling for motion events
- [x] Config schema with proper UI layout
- [x] Evidence references throughout codebase
