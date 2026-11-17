/* SPDX-License-Identifier: GPL-3.0-or-later
 * Independent receiver for the fixed synthetic SRTP qualification packet. */
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <srtp2/srtp.h>
#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
#endif
static unsigned int read32(const uint8_t *p) { return ((unsigned int)p[0]<<24)|((unsigned int)p[1]<<16)|((unsigned int)p[2]<<8)|p[3]; }
static void put32(uint8_t *p,unsigned int n) { p[0]=n>>24;p[1]=n>>16;p[2]=n>>8;p[3]=n; }
static int framed(void) {
    srtp_t sessions[2]={NULL,NULL};uint8_t header[12],body[4096];
    if(srtp_init()!=srtp_err_status_ok)return 2;
    while(fread(header,1,12,stdin)==12) {
        unsigned int type=read32(header+4),size=read32(header+8);
        if(memcmp(header,"BMR1",4) || size>sizeof(body) || fread(body,1,size,stdin)!=size)return 2;
        if(type==4 && !size) { for(int i=0;i<2;i++)if(sessions[i])srtp_dealloc(sessions[i]);srtp_shutdown();return 0; }
        unsigned int stream=size>=4?read32(body):0;if(stream<1 || stream>2)return 2;
        if(type==10) {
            if(size!=42 || sessions[stream-1] || read32(body+8)!=1)return 2;
            srtp_policy_t policy;memset(&policy,0,sizeof(policy));srtp_crypto_policy_set_aes_cm_128_hmac_sha1_80(&policy.rtp);srtp_crypto_policy_set_aes_cm_128_hmac_sha1_80(&policy.rtcp);
            policy.ssrc.type=ssrc_specific;policy.ssrc.value=read32(body+4);policy.key=body+12;policy.window_size=128;
            if(srtp_create(&sessions[stream-1],&policy)!=srtp_err_status_ok)return 2;
        } else if(type==11 || type==12) {
            if(!sessions[stream-1] || size<4)return 2;
            int length=(int)size-4;
            srtp_err_status_t status=type==11?srtp_unprotect(sessions[stream-1],body+4,&length):srtp_unprotect_rtcp(sessions[stream-1],body+4,&length);
            if(status!=srtp_err_status_ok)return 3;
            put32(header+8,(unsigned int)length+4);
            if(fwrite(header,1,12,stdout)!=12 || fwrite(body,1,(size_t)length+4,stdout)!=(size_t)length+4)return 4;
        } else return 2;
        memset(body,0,sizeof(body));
    }
    return 2;
}
int main(int argc,char **argv) {
#ifdef _WIN32
    if(_setmode(_fileno(stdin),_O_BINARY)<0 || _setmode(_fileno(stdout),_O_BINARY)<0)return 2;
#endif
    if(argc==2 && !strcmp(argv[1],"--framed"))return framed();
    if(argc!=1)return 2;
    uint8_t input[128],key[30];memset(key,9,16);memset(key+16,8,14);
    int count=(int)fread(input,1,sizeof(input),stdin);if(count!=22 || srtp_init()!=srtp_err_status_ok)return 2;
    srtp_policy_t policy;memset(&policy,0,sizeof(policy));srtp_crypto_policy_set_aes_cm_128_hmac_sha1_80(&policy.rtp);srtp_crypto_policy_set_aes_cm_128_hmac_sha1_80(&policy.rtcp);
    policy.ssrc.type=ssrc_specific;policy.ssrc.value=7;policy.key=key;policy.window_size=128;srtp_t session;
    if(srtp_create(&session,&policy)!=srtp_err_status_ok)return 3;
    uint8_t forged[128];memcpy(forged,input,(size_t)count);forged[21]^=1;int forged_count=count;
    if(srtp_unprotect(session,forged,&forged_count)==srtp_err_status_ok)return 4;
    if(srtp_unprotect(session,input,&count)!=srtp_err_status_ok || count!=12 || input[0]!=0x80 || input[1]!=96 || input[11]!=7)return 5;
    srtp_dealloc(session);srtp_shutdown();puts("authenticated RTP; forged packet refused");return 0;
}
