/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <srtp2/srtp.h>
static srtp_t sessions[2];
static uint32_t session_ssrc[2];
static void erase_bytes(uint8_t *p,size_t n) { volatile uint8_t *v=p;while(n--)*v++=0; }
static void protect_message(uint32_t type,uint8_t *payload,uint32_t length) {
    if(type==BLINK_PROTECTION_INIT) {
        if(length!=BLINK_PROTECTION_INIT_BYTES)fatal("SRTP_FRAMING");
        uint32_t stream=u32(payload),ssrc=u32(payload+4),suite=u32(payload+8);
        if(stream<1 || stream>2 || !ssrc || suite!=1 || sessions[stream-1])fatal("SRTP_CONFIG");
        srtp_policy_t policy;memset(&policy,0,sizeof(policy));
        srtp_crypto_policy_set_aes_cm_128_hmac_sha1_80(&policy.rtp);srtp_crypto_policy_set_aes_cm_128_hmac_sha1_80(&policy.rtcp);
        policy.ssrc.type=ssrc_specific;policy.ssrc.value=ssrc;policy.key=payload+12;policy.window_size=128;
        srtp_err_status_t result=srtp_create(&sessions[stream-1],&policy);erase_bytes(payload+12,30);
        if(result!=srtp_err_status_ok) { fatal("SRTP_CONFIG"); }
        session_ssrc[stream-1]=ssrc;
        uint8_t ack[4];put32(ack,stream);output(10,ack,4);return;
    }
    if(length<8+(type==BLINK_PROTECT_RTP?12u:8u) || length>8+BLINK_PROTECTION_PLAINTEXT_MAX)fatal("SRTP_FRAMING");
    uint32_t request=u32(payload),stream=u32(payload+4);uint8_t packet[BLINK_PROTECTION_PLAINTEXT_MAX+SRTP_MAX_TRAILER_LEN+8];int size=(int)length-8;
    if(!request || stream<1 || stream>2 || !sessions[stream-1] || (payload[8]>>6)!=2)fatal("SRTP_REQUEST");
    if(u32(payload+8+(type==BLINK_PROTECT_RTP?8:4))!=session_ssrc[stream-1])fatal("SRTP_SSRC");
    memcpy(packet,payload,8);memcpy(packet+8,payload+8,(size_t)size);
    srtp_err_status_t result=type==BLINK_PROTECT_RTP?srtp_protect(sessions[stream-1],packet+8,&size):srtp_protect_rtcp(sessions[stream-1],packet+8,&size);
    if(result!=srtp_err_status_ok || size<0 || (uint32_t)size>BLINK_PROTECTION_PLAINTEXT_MAX+SRTP_MAX_TRAILER_LEN)fatal("SRTP_PROTECT");
    output(type,packet,8+(uint32_t)size);
}

static void close_protection(void) { for(int i=0;i<2;i++)if(sessions[i]) { if(srtp_dealloc(sessions[i])!=srtp_err_status_ok)fatal("SRTP_CLOSE");sessions[i]=NULL; } }
