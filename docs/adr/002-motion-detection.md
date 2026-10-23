# ADR-002: Motion Detection via Polling

## Status

Accepted

## Context

Blink cameras detect motion and store video clips in the cloud. HomeKit expects real-time motion sensor updates. The challenge is bridging these two paradigms.

### Available Options

1. **Poll Media API**: Periodically check for new motion clips
2. **Push Notifications**: Investigate Firebase Cloud Messaging (FCM)
3. **WebSocket/SSE**: Check for real-time event streams
4. **Local API**: Check for on-device motion events

### Investigation Results

- **Push Notifications**: Not implemented; requires separate protocol, authorization and privacy review.
- **WebSocket/SSE**: No implemented real-time event ingestion in this plugin
- **Local API**: Local device onboarding/control is outside this plugin's implemented motion path
- **Media API**: Returns timestamped clips with device IDs; can detect new events

## Decision

We implement motion detection via media API polling:

### Polling Strategy

- Poll the `unwatched_media` endpoint at configurable intervals
- Default: 60 seconds (reasonable balance of responsiveness and API load)
- Minimum: 15 seconds (to avoid rate limiting)
- Settings UI range: 15–600 seconds. Runtime clamps the minimum to 15 seconds; it does not enforce that UI maximum on manually supplied configuration.

### Motion Event Detection

1. Store timestamp of last media check
2. Fetch unwatched media clips
3. For each clip newer than last check:
   - Match `camera_id` to registered camera/doorbell/owl
   - Trigger `MotionDetected` characteristic on matching accessory
   - Doorbell motion is handled as motion; the exposed Doorbell service does not establish automatic ring-event ingestion.

### Motion State Reset

- `MotionDetected` auto-resets after configurable timeout (default 30 seconds)
- Timeout is cancelable if new motion is detected
- Per-device timeout override available via `deviceSettings`

### Rate Limiting Protection

- Minimum poll interval enforced at 15 seconds
- Shared HTTP retry and connection-recovery policies apply to eligible requests.
- The platform uses an asynchronous interval callback; it does not guarantee non-overlapping polling cycles when a request outlasts the interval.

## Consequences

### Positive

- Uses the recovered media API contract; private provider behavior can change
- Configurable polling interval for user preference
- No additional push or real-time event client
- Per-device motion timeout customization

### Negative

- Polling contributes to motion detection delay; provider clip availability and request latency also matter
- Higher poll frequency increases cloud API traffic; device battery impact has not been measured
- No distinction between motion start/end (Blink clips are post-event)
- Missed events if poll fails during active motion

### Trade-offs

Shorter intervals reduce the polling component of detection latency and increase
cloud request volume. They do not guarantee immediate events or measured battery
savings. The [configuration reference](../configuration.md) owns supported user
settings; the [API contract](../api-contract/README.md) owns recovered declarations.

### Future Considerations

- Investigate Blink's push notification infrastructure for lower latency
- Monitor for new API endpoints that might provide real-time events
- Consider local network integration if Blink exposes device APIs

## References

- API Dossier Section 3.9 (Media Operations)
- Evidence: `smali_classes9/com/immediasemi/blink/common/device/camera/video/VideoApi.smali`
- HomeKit MotionSensor service specification
