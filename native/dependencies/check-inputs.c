/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Public API smoke test for selected source-built library inputs. Synthetic RTP only. */
#include <stdio.h>
#include <string.h>
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/avutil.h>
#include <libswresample/swresample.h>
#include <srtp2/srtp.h>

int main(void) {
    void *opaque = NULL;
    if (avio_enum_protocols(&opaque, 0) || avio_enum_protocols(&opaque, 1)) return 2;
    if (!avcodec_find_decoder(AV_CODEC_ID_H264) || !avcodec_find_decoder(AV_CODEC_ID_AAC) ||
        !avcodec_find_decoder(AV_CODEC_ID_AAC_LATM) || !avcodec_find_encoder_by_name("libx264") ||
        !avcodec_find_encoder_by_name("libopus") || !avcodec_find_encoder_by_name("pcm_alaw") ||
        !avcodec_find_encoder_by_name("pcm_mulaw")) return 3;
    if (avformat_version() != AV_VERSION_INT(63,1,102) || avcodec_version() != AV_VERSION_INT(63,1,102) ||
        avutil_version() != AV_VERSION_INT(61,1,102) || !swresample_version()) return 4;
    unsigned char key[30] = {0}; /* synthetic fixture, never used on network */
    unsigned char packet[128] = {0x80, 0x60, 0, 1, 0, 0, 0, 1, 0, 0, 0, 42, 1, 2, 3, 4};
    unsigned char original[16];
    memcpy(original, packet, sizeof(original));
    srtp_policy_t policy;
    memset(&policy, 0, sizeof(policy));
    srtp_crypto_policy_set_aes_cm_128_hmac_sha1_80(&policy.rtp);
    srtp_crypto_policy_set_aes_cm_128_hmac_sha1_80(&policy.rtcp);
    policy.ssrc.type = ssrc_specific;
    policy.ssrc.value = 42;
    policy.key = key;
    policy.window_size = 128;
    srtp_t sender = NULL, receiver = NULL;
    int length = sizeof(original);
    if (srtp_init() != srtp_err_status_ok || srtp_create(&sender, &policy) != srtp_err_status_ok ||
        srtp_create(&receiver, &policy) != srtp_err_status_ok ||
        srtp_protect(sender, packet, &length) != srtp_err_status_ok || length != 26 ||
        srtp_unprotect(receiver, packet, &length) != srtp_err_status_ok || length != 16 ||
        memcmp(packet, original, sizeof(original))) return 5;
    if (srtp_dealloc(sender) != srtp_err_status_ok || srtp_dealloc(receiver) != srtp_err_status_ok ||
        srtp_shutdown() != srtp_err_status_ok) return 6;
    printf("FFmpeg %s; libSRTP %s; codecs present; no URL protocols; synthetic SRTP round trip passed\n",
           av_version_info(), srtp_get_version_string());
    return 0;
}
