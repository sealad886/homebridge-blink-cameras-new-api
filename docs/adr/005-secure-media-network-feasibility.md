# ADR-005: Require an enforceable media network boundary

Status: proposed architecture blocked; implementation gate failed.

Stock FFmpeg 9.0.2 RTSP uses private connection functions for control and RTP transport,
bypassing public AVFormatContext.io_open and custom AVIOContext. Therefore those public
hooks cannot establish actual destination enforcement. Do not implement the proposed
secure worker on that assumption. F05 and F06 remain open.

A revised design must establish independently enforced networking or worker-owned
RTSP/TLS transport, preserving original TLS identity and covering DNS, redirects,
reconnects and secondary transport. It requires design approval and runtime evidence.
See the native feasibility receipt. Private ABI assumptions and hostname-only checks
are rejected by the approved plan. Process separation alone is not an OS sandbox.
