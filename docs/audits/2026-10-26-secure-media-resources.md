# Secure media synthetic resource bounds

Date: 26 October 2026. Local macOS arm64 evidence; final five-target observations
remain required. The [structured receipt](2026-10-26-secure-media-resources.json)
binds actual worker/helper/test/source hashes and raw observation identities.

## Codec resident high-water observations

Each source produced four independently decoded 1920×1080 frames with a 30-fps
ceiling, High/4.0, configured 8 Mbps video and 24 kHz/128 kbps/10 ms mono Opus.
Pixel/aspect and audible audio checks passed. `wait4` records this worker alone;
Windows CI uses `GetProcessMemoryInfo` on the owned process handle.

| Source | Pixels | Observed worker peak resident bytes |
|---|---:|---:|
| 4096×2048 | 8,388,608 | 92,274,688 |
| 2560×1440 | 3,686,400 | 71,598,080 |
| 1920×1920 | 3,686,400 | 71,516,160 |

These short flat-color workloads measure supported geometry/codec combinations.
They do not establish an adversarial or universal memory ceiling, concurrency
budget, physical playback or CPU parity. The exact 8,388,608-pixel input bound and
next even-height geometry above it retain separate acceptance/refusal regressions.

## Queue and recorder observations

- A real temporary file contained exactly 67,108,864 bytes, with verified content
  hash, after 67,108,865 bytes were offered. Byte +1 stopped recording and
  confirmed writer closure while the media consumer continued.
- A corked real WriteStream closed at the two-second fake-clock boundary with
  65,536 queued bytes; a separate case closed before exceeding 262,144 bytes.
  This simulates filesystem backpressure, not an observed OS disk failure.
- Real native IPC admitted and credited 300,612 bytes through five MEDIA frames
  and ten credit messages. High water was 65,536 unconsumed payload bytes and
  one outstanding frame, returning to zero at closure. No codec payload was
  retained by the observer; private IPC metadata is its measured boundary.
- Independent receiver verification passed for 183 protected datagrams. The
  local resource tests use synthetic provider/LAN adapters and establish no
  provider or default-socket policy acceptance.

All four queue/recorder regressions and all 33 native checks pass locally.
Actual supported-target execution, F05/F06 closure and release artifact checks
remain separate gates. The Windows startup guard now reads back required error
mode bits before STATUS; its actual Windows result is still pending. External
administrative memory dumps remain outside the metadata secrecy claim.
