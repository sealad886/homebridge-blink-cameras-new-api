# ADR-006: Separate camera source quality from HomeKit output capabilities

Status: accepted for the authorized RC.11 implementation, 12 October 2026.

## Context

RC.10 installed video/audio works but the operator reports stutter across cameras.
Existing output capability negotiation allows 1080p/30, while observed Home
requests chose 720p/30. Source geometry cannot be inferred from negotiated output.
Blink Android 59.2 exposes persistent video_quality configuration, not liveview
resolution arguments. New 2K models include 2560×1440 and square 1920×1920 input.

## Decision

Extend existing global streaming configuration with outputQuality auto,720p15,
360p15,1080p30. Auto preserves existing capabilities. Fixed profiles advertise
chosen dimensions/fps and mandatory 320×240/15 fallback. The 1080p/30 profile
requires H.264 level 4.0; lower levels cannot carry its macroblock rate. Reject stale unsupported
START requests before vendor allocation. Preserve negotiated geometry, codec and
bitrate constraints. Fixed 15-fps profiles accept supported same-resolution
15/30-fps requests but cap effective encoder output at 15 fps (RC.13 correction);
they do not increase output to 30 fps. The [streaming guide](../streaming.md)
owns current profile behavior.
Preserve source aspect ratio while scaling/padding. Audio negotiation, bitrate,
private pipes, resource ceilings, SRTP packaging and disabled talkback remain.

Extend existing per-device overrides with inputQuality auto,saver,standard,best.
Auto preserves current source policy with no write. Record first parseable vendor
quality and actual FFmpeg input geometry/fps in existing accessory context;
never confuse model capability or output descriptors with observed source.
Explicit policy uses existing authenticated bounded transport and command
coordinator, validates advertised restrictions, writes video_quality once and
confirms readback before liveview. Preserve ADR-003 no ambiguous POST replay and
ADR-004 cancellation/generation ownership. Abort during settings cannot allocate
a subsequent remote liveview. Auto metadata failure is nonfatal; explicit failure
blocks start. Diagnostics contain numeric geometry or fixed reason labels only.

## Alternatives and consequences

A raw width/height input override would misrepresent Blink's API and could corrupt
compressed demuxing. Encoding-only scaling cannot reduce source decode work.
Changing persistent vendor quality is the supported upstream control, but also
changes recordings and app behavior. Returning to auto preserves the then-current
vendor setting; it does not roll back a previous write. Operator restoration is
explicit. No live host/provider quality settings are changed during development.

Actual synthetic FFmpeg conversion covers conventional/square 2K with each output
profile and Opus/AAC-ELD packaging. It does not prove host CPU savings, real server
config acceptance on every model, or physical Home smoothness. A fresh installed
RC requires physical testing and new observation. F05/F06 remain open; no native
worker or complete media security closure is claimed. Rollback retains security
guards and restores source quality explicitly if an operator changed it.
