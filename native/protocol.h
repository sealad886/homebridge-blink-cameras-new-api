/* SPDX-License-Identifier: GPL-3.0-or-later
 * Protocol version 1. Big-endian integers; header is magic[4], type32, length32.
 * See README for codec metadata and lifecycle semantics. */
#ifndef BLINK_PROTOCOL_H
#define BLINK_PROTOCOL_H
#define BLINK_PROTOCOL_VERSION 1u
#define BLINK_INPUT_MAGIC "BMI1"
#define BLINK_OUTPUT_MAGIC "BMO1"
#define BLINK_HEADER_BYTES 12u
#define BLINK_CONFIG_BYTES 40u
#define BLINK_PACKET_METADATA_BYTES 48u
#define BLINK_PROTECTION_INIT_BYTES 42u
#define BLINK_PROTECTION_PLAINTEXT_MAX 2048u
#define BLINK_PROTECTION_RTP_MAX 2058u
#define BLINK_PROTECTION_RTCP_MAX 2062u
enum blink_input_type { BLINK_CONFIG=1, BLINK_MEDIA=2, BLINK_MEDIA_END=3, BLINK_STOP=4,
                       BLINK_PROTECTION_INIT=10, BLINK_PROTECT_RTP=11, BLINK_PROTECT_RTCP=12 };
enum blink_output_type { BLINK_STATUS=1, BLINK_VIDEO_PACKET=2, BLINK_OUTPUT_END=3,
                         BLINK_AUDIO_PACKET=4, BLINK_AUDIO_INFO=5, BLINK_PROTECTION_ACK=10,
                         BLINK_PROTECTED_RTP=11, BLINK_PROTECTED_RTCP=12 };
#endif
