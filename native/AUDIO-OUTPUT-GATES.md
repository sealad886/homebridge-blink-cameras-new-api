# Audio and LAN output evidence

The local prototype now decodes optional AAC/AAC-LATM MPEG-TS audio and encodes mono Opus at 16/24 kHz or PCMA/PCMU at 8 kHz. This proves a bounded codec subset, not HomeKit audio parity or live integration. The source contract is `src/accessories/camera-source.ts`, including `buildAudioEncoderArgs` and the advertised codec/rate combinations.

The installed FFmpeg 9.0.2 native AAC encoder rejects AAC-ELD (the capability probe returns -22). The worker rejects this configuration before opening media; it never substitutes AAC-LC under that label. A maintained, licensing-compatible AAC-ELD encoder or an explicitly approved contract change remains necessary. The pinned [AAC encoder source](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/libavcodec/aacenc.c) rejects unsupported profiles.

The synthetic audio/video fixture preserves its common source timeline: audio begins at zero and video begins at 64 ms. Encoded output includes microsecond PTS/DTS/duration, encoder initial padding and per-packet skip-sample metadata. Tests decode each supported output and verify nonzero audio energy and the preserved offset after padding correction. Source timestamp discontinuities over 2 ms fail closed. This does not establish drift, jitter, timestamp wrap, resynchronization or real vendor fixture behavior. Video retains source PTS; requested FPS is an encoder hint, not a proven frame-rate conversion policy.

The audio FIFO holds at most two seconds; individual conversion batches, input samples, elapsed watchdog and aggregate sample/output counts are bounded. Public `swr_alloc_set_opts2`, `swr_convert`, `av_audio_fifo_*` and codec APIs handle conversion. Only local macOS arm64 execution is verified.

## Next executable output proof

Vendor upstream authorization and HomeKit LAN peer authorization must remain separate capabilities. A generation-bound parent owns the negotiated LAN endpoint, SSRC, RTP payload type, keys and lifecycle. The codec worker does not open output sockets. Opus RTP uses a 48 kHz clock even when its encoder rate is 16/24 kHz; PCMA/PCMU use 8 kHz and H264 uses 90 kHz. Rescale the shared timestamp with explicit padding treatment, then prove RTP packetization, sequence wrap and RTCP against a decoder/receiver. The pinned [RTP muxer](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/libavformat/rtpenc.c) supplies the clock evidence.

Use a verified maintained libsrtp build for protection, through private IPC in the same executable; no JavaScript crypto replacement and no secret argv/env/files. A separately verified libsrtp 2.8.1 source build now supplies the standalone static dependency. The worker matches its published RTP/SRTCP ciphertext vectors through private IPC. It has a one-MiB output queue and independent two-second writer deadline; separate receiver interoperability and full generation retirement remain gates. STOP must remain independent of blocking codec or stdout work.

Still pending: complete advertised codecs, packetization/RTCP/SRTP behavior, generation retirement and output drain, audiovisual duration and jitter parity, source/license closure, all five target runtime builds, physical provider/HomeKit acceptance and supported talkback. No native artifact is enabled in npm runtime by this prototype.
