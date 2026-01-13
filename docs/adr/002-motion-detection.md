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

- **Push Notifications**: FCM integration requires app-level configuration; not practical for a Homebridge plugin
- **WebSocket/SSE**: No evidence of real-time event streams in the API
- **Local API**: Blink cameras communicate through sync modules; no direct device access
- **Media API**: Returns timestamped clips with device IDs; can detect new events

## Decision

We implement motion detection via media API polling:

### Polling Strategy

- Poll the `unwatched_media` endpoint at configurable intervals
- Default: 60 seconds (reasonable balance of responsiveness and API load)
- Minimum: 15 seconds (to avoid rate limiting)
- Maximum: 600 seconds (10 minutes)

### Motion Event Detection

1. Store timestamp of last media check
2. Fetch unwatched media clips
3. For each clip newer than last check:
   - Match `device_id` to registered camera/doorbell/owl
   - Trigger `MotionDetected` characteristic on matching accessory
   - For doorbells, also trigger `ProgrammableSwitchEvent` for ring events

### Motion State Reset

- `MotionDetected` auto-resets after configurable timeout (default 30 seconds)
- Timeout is cancelable if new motion is detected
- Per-device timeout override available via `deviceSettings`

### Rate Limiting Protection

- Minimum poll interval enforced at 15 seconds
- Exponential backoff on API errors (429, 5xx)
- Single concurrent poll operation (prevents overlap)

## Consequences

### Positive

- Works reliably with documented API behavior
- Configurable polling interval for user preference
- No dependency on undocumented real-time APIs
- Per-device motion timeout customization

### Negative

- Motion detection delay equals poll interval
- Higher poll frequency = more API calls = more battery drain (sync module)
- No distinction between motion start/end (Blink clips are post-event)
- Missed events if poll fails during active motion

### Trade-offs

| Poll Interval | Latency | API Calls/Hour | Battery Impact |
|---------------|---------|----------------|----------------|
| 15 seconds    | ~15s    | 240            | High           |
| 60 seconds    | ~60s    | 60             | Low            |
| 5 minutes     | ~5m     | 12             | Minimal        |

### Future Considerations

- Investigate Blink's push notification infrastructure for lower latency
- Monitor for new API endpoints that might provide real-time events
- Consider local network integration if Blink exposes device APIs

## References

- API Dossier Section 3.9 (Media Operations)
- Evidence: `smali_classes9/com/immediasemi/blink/common/device/camera/video/VideoApi.smali`
- HomeKit MotionSensor service specification
