# Live Streaming Implementation

## Overview

This document outlines the technical requirements for adding live video streaming to homebridge-blinkcameras.

## Current State

The plugin currently supports:
- Static snapshots via the Blink thumbnail API
- Motion detection via polling

Live streaming is **not** implemented.

## Technical Requirements

### 1. RTSPS to SRTP Transcoding

HomeKit uses SRTP (Secure Real-time Transport Protocol) for video streaming. Blink cameras provide RTSPS (Real Time Streaming Protocol over TLS) streams.

**Required Components:**
- FFmpeg for transcoding
- Process lifecycle management (spawn/kill)
- SDP negotiation with HomeKit

### 2. Blink API Integration

**Live Video Request:**
```
POST /api/v3/media/live_view
Body: { account_id, network_id, camera_id }
Response: { server: "immedia-semi.com", rtsps_uri: "rtsps://..." }
```

**Evidence References:**
- [api_dossier.md](/Users/andrew/zzApps/blink-home-monitor/base-apk/docs/api_dossier.md) Section 4.2
- BlinkLiveVideoResponse interface in types/blink-api.ts

### 3. HomeKit CameraStreamingDelegate

Full implementation of `CameraStreamingDelegate` required:

```typescript
interface CameraStreamingDelegate {
  handleSnapshotRequest(request: SnapshotRequest, callback: SnapshotRequestCallback): void;
  prepareStream(request: PrepareStreamRequest, callback: PrepareStreamCallback): void;
  handleStreamRequest(request: StreamingRequest, callback: StreamRequestCallback): void;
}
```

Currently only `handleSnapshotRequest` is implemented.

### 4. Stream Lifecycle

```
                    HomeKit
                       │
                       ▼
              ┌────────────────┐
              │  prepareStream │  Allocate ports, setup SDP
              └────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │handleStreamReq │  Start FFmpeg process
              │  (type: START) │  
              └────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  FFmpeg runs   │  RTSPS input → SRTP output
              │   continuous   │
              └────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │handleStreamReq │  Kill FFmpeg process
              │  (type: STOP)  │
              └────────────────┘
```

## Implementation Complexity

**High** - This is the most complex feature to implement:

1. **External Dependency**: Requires FFmpeg installation
2. **Platform Specifics**: Different FFmpeg flags for macOS/Linux
3. **Resource Management**: CPU-intensive transcoding
4. **Network Complexity**: NAT traversal, port management
5. **Stream Reliability**: Reconnection handling, error recovery

## Recommended Approach

1. Start with a separate FFmpeg wrapper utility
2. Add FFmpeg detection and version checking
3. Implement basic single-stream support
4. Add concurrent stream handling
5. Add audio support (if available)

## FFmpeg Command Template

```bash
ffmpeg -rtsp_transport tcp \
       -i "rtsps://..." \
       -an \                           # No audio initially
       -vcodec libx264 \
       -pix_fmt yuv420p \
       -preset ultrafast \
       -tune zerolatency \
       -profile:v baseline \
       -level 3.1 \
       -f rtp \
       -payload_type 99 \
       -ssrc 1234 \
       -srtp_out_suite AES_CM_128_HMAC_SHA1_80 \
       -srtp_out_params "..." \
       "srtp://[ip]:[port]?localport=[port]"
```

## Alternative Approaches

### FFmpeg-for-homebridge

Consider using the [homebridge-camera-ffmpeg](https://github.com/Sunoo/homebridge-camera-ffmpeg) plugin as a reference or dependency.

### Scrypted

The Scrypted platform has mature RTSP handling that could be integrated.

## Blockers

- Need to verify RTSPS URL format and authentication
- Need to test stream stability and reconnection behavior
- Need to assess CPU impact on common Homebridge hosts (Raspberry Pi)

## Estimated Effort

4-6 weeks for a senior developer including:
- 1 week: FFmpeg integration and testing
- 2 weeks: HomeKit CameraStreamingDelegate implementation
- 1 week: Multi-stream and resource management
- 1-2 weeks: Testing, edge cases, documentation
