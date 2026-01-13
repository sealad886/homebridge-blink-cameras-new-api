# Event-Based Motion Detection

## Overview

This document outlines potential improvements to motion detection using real-time events instead of polling.

## Current Implementation

The plugin currently detects motion by:

1. Polling `GET /api/v1/accounts/{account}/media/unwatched` at configurable intervals
2. Comparing clip timestamps to detect new media
3. Triggering MotionDetected characteristic on associated accessories

**Limitations:**

- Minimum 15-second poll interval (to avoid rate limits)
- Motion events delayed by up to poll interval duration
- Unnecessary API calls when no motion occurs

## Proposed Improvements

### 1. Push Notification Integration

Evidence from APK analysis suggests Blink uses Firebase Cloud Messaging (FCM):

**Evidence References:**

- FCM token registration in smali classes
- `push_notification_token` field in account sync
- Firebase dependencies in app manifest

**Implementation:**

```typescript
// Conceptual - requires further reverse engineering
interface BlinkPushNotification {
  type: 'motion' | 'ring' | 'clip_ready';
  device_id: number;
  network_id: number;
  timestamp: string;
}
```

### 2. WebSocket Connection

Some IoT platforms maintain persistent WebSocket connections for real-time events.

**Investigation Required:**

- Monitor Blink app network traffic during motion events
- Identify WebSocket endpoints if present
- Document message format and authentication

### 3. Reduced Poll Intervals

If push notifications aren't feasible, consider:

- Adaptive polling: faster when motion expected, slower during quiet times
- Per-device polling: only active devices polled frequently
- Time-of-day schedules: configurable quiet periods

## Complexity Assessment

| Approach | Complexity | Benefit |
|----------|------------|---------|
| Push Notifications | High | Real-time detection |
| WebSocket | Medium-High | Near real-time |
| Adaptive Polling | Low-Medium | Reduced API calls |

## Recommended Path

1. **Short term**: Implement adaptive polling based on recent activity
2. **Medium term**: Investigate WebSocket connections via traffic analysis
3. **Long term**: Reverse engineer push notification registration

## Research Tasks

- [ ] Capture and analyze Blink app traffic during motion event
- [ ] Identify FCM server key or registration flow
- [ ] Test WebSocket connection attempts to known endpoints
- [ ] Document API rate limits more precisely

## Related Files

- [src/platform.ts](../../src/platform.ts) - Current polling implementation
- [src/blink-api/client.ts](../../src/blink-api/client.ts) - Media API calls
- [docs/adr/002-motion-detection.md](../adr/002-motion-detection.md) - Original decision

## Estimated Effort

- Adaptive polling: 1-2 days
- WebSocket research: 1 week
- Push notification integration: 2-3 weeks (if feasible)
