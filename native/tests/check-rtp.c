/* SPDX-License-Identifier: GPL-3.0-or-later
 * Independent synthetic receiver: private framed SRTP/SRTCP -> libavcodec decode.
 * BMR1 config: width,height,frames,fps,audio codec/rate/padding/packet-ms,video/audio PT.
 * INIT10 reuses the worker's 42-byte session layout; data11/12 is stream32+ciphertext.
 * This helper has no sockets, CLI configuration, or provider input capability.
 */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif
#include <libavcodec/avcodec.h>
#include <srtp2/srtp.h>

static uint32_t config[10],ssrc[2],packets[2],octets[2],first_ts[2],last_ts[2],report_ts[2],report_packets[2],report_octets[2];
static uint8_t report_ntp[2][8];
static srtp_t sessions[2];
static int configured,reports[2],video_count,audio_count;
static uint64_t total_samples;
static double energy;
static AVCodecContext *video,*audio;
static AVFrame *decoded;
static AVPacket *encoded;
static uint8_t access_unit[1024*1024];
static size_t access_size;
static uint32_t access_ts;
static int fragmented;
static _Noreturn void fail(const char *code) { fprintf(stderr,"RECEIVER_%s\n",code);exit(2); }
static uint32_t u32(const uint8_t *p) { return ((uint32_t)p[0]<<24)|((uint32_t)p[1]<<16)|((uint32_t)p[2]<<8)|p[3]; }
static void quiet(void *p,int n,const char *f,va_list a) { (void)p;(void)n;(void)f;(void)a; }
static void exact(void *p,size_t n) { if(fread(p,1,n,stdin)!=n)fail("TRUNCATED"); }
static void decode(int stream,const uint8_t *bytes,size_t size) {
    AVCodecContext *context=stream?audio:video;
    if(size) { if(av_new_packet(encoded,(int)size)<0)fail("MEMORY");memcpy(encoded->data,bytes,size); }
    if(avcodec_send_packet(context,size?encoded:NULL)<0)fail("DECODE");
    av_packet_unref(encoded);
    int result;
    while((result=avcodec_receive_frame(context,decoded))>=0) {
        if(!stream) {
            if(decoded->width!=(int)config[0] || decoded->height!=(int)config[1] || video_count>=(int)config[2])fail("VIDEO_GEOMETRY");
            int expected=32+(video_count%4)*32,actual=decoded->data[0][(decoded->height/2)*decoded->linesize[0]+decoded->width/2];
            if(abs(actual-expected)>5)fail("VIDEO_PIXELS");
            video_count++;
        } else {
            if(decoded->ch_layout.nb_channels!=1 || decoded->nb_samples<=0 || decoded->nb_samples>32768)fail("AUDIO_FRAME");
            total_samples+=(uint64_t)decoded->nb_samples;if(total_samples>300u*(config[4]==1?48000u:8000u))fail("AUDIO_LIMIT");
            for(int i=0;i<decoded->nb_samples;i++) {
                double value;
                if(decoded->format==AV_SAMPLE_FMT_S16 || decoded->format==AV_SAMPLE_FMT_S16P)value=((int16_t*)decoded->data[0])[i]/32768.0;
                else if(decoded->format==AV_SAMPLE_FMT_FLT || decoded->format==AV_SAMPLE_FMT_FLTP)value=((float*)decoded->data[0])[i];
                else fail("AUDIO_FORMAT");
                energy+=value*value;
            }
            audio_count++;
        }
        av_frame_unref(decoded);
    }
    if(result!=AVERROR(EAGAIN) && result!=AVERROR_EOF)fail("DECODE");
}
static void append(const uint8_t *bytes,size_t size) {
    if(size>sizeof(access_unit)-access_size)fail("ACCESS_UNIT");
    memcpy(access_unit+access_size,bytes,size);access_size+=size;
}
static void video_payload(const uint8_t *data,size_t size,uint32_t timestamp,int marker) {
    static const uint8_t prefix[]={0,0,0,1};
    if(!size || (access_size && access_ts!=timestamp))fail("VIDEO_TIMESTAMP");
    access_ts=timestamp;uint8_t type=data[0]&31;
    if(type==28) {
        if(size<3 || (data[1]&0x20) || !(data[1]&31) || (data[1]&31)>23)fail("FU_A");
        if(data[1]&0x80) {
            if(fragmented || (data[1]&0x40))fail("FU_A");
            fragmented=1;uint8_t nal=(data[0]&0xe0)|(data[1]&31);append(prefix,4);append(&nal,1);
        } else if(!fragmented)fail("FU_A");
        append(data+2,size-2);if(data[1]&0x40)fragmented=0;
    } else {
        if(fragmented || !type || type>23 || (data[0]&0x80))fail("NAL");
        append(prefix,4);append(data,size);
    }
    if(marker) { if(fragmented)fail("FU_A");decode(0,access_unit,access_size);access_size=0; }
}
static void configuration(const uint8_t *payload,uint32_t size) {
    if(configured || size!=40)fail("CONFIG");
    for(int i=0;i<10;i++)config[i]=u32(payload+4*i);
    if(config[0]<2 || config[0]>1920 || config[1]<2 || config[1]>1080 || !config[2] || config[2]>1000 || !config[3] || config[3]>30 ||
       config[4]<1 || config[4]>3 || (config[4]==1?(config[5]!=16000 && config[5]!=24000):config[5]!=8000) ||
       config[6]>config[5]*2 || !config[7] || config[7]>60 || config[8]>127 || config[9]>127)fail("CONFIG");
    const AVCodec *codec=avcodec_find_decoder(AV_CODEC_ID_H264);video=avcodec_alloc_context3(codec);if(!video)fail("MEMORY");
    video->max_pixels=1920*1080;video->thread_count=1;if(avcodec_open2(video,codec,NULL)<0)fail("VIDEO_CODEC");
    codec=avcodec_find_decoder(config[4]==1?AV_CODEC_ID_OPUS:config[4]==2?AV_CODEC_ID_PCM_ALAW:AV_CODEC_ID_PCM_MULAW);
    audio=avcodec_alloc_context3(codec);if(!audio)fail("MEMORY");
    audio->sample_rate=config[4]==1?48000:8000;audio->thread_count=1;av_channel_layout_default(&audio->ch_layout,1);
    if(avcodec_open2(audio,codec,NULL)<0)fail("AUDIO_CODEC");
    configured=1;
}
static void initialize(uint8_t *payload,uint32_t size) {
    if(!configured || size!=42)fail("INIT");
    uint32_t stream=u32(payload);if(stream<1 || stream>2 || sessions[stream-1] || !u32(payload+4) || u32(payload+8)!=1)fail("INIT");
    srtp_policy_t policy;memset(&policy,0,sizeof(policy));
    srtp_crypto_policy_set_aes_cm_128_hmac_sha1_80(&policy.rtp);srtp_crypto_policy_set_aes_cm_128_hmac_sha1_80(&policy.rtcp);
    policy.ssrc.type=ssrc_specific;policy.ssrc.value=u32(payload+4);policy.key=payload+12;policy.window_size=128;
    if(srtp_create(&sessions[stream-1],&policy)!=srtp_err_status_ok)fail("INIT");
    ssrc[stream-1]=policy.ssrc.value;volatile uint8_t *key=payload+12;for(int i=0;i<30;i++)key[i]=0;
}
static void receive(uint32_t type,uint8_t *payload,uint32_t size) {
    if(!configured || size<4+22 || size>1504)fail("PACKET");
    uint32_t id=u32(payload);if(id<1 || id>2 || !sessions[id-1])fail("SESSION");
    int stream=(int)id-1,length=(int)size-4;uint8_t *data=payload+4;
    srtp_err_status_t result=type==11?srtp_unprotect(sessions[stream],data,&length):srtp_unprotect_rtcp(sessions[stream],data,&length);
    if(result!=srtp_err_status_ok)fail("AUTHENTICATION");
    if(type==12) {
        if(length<28 || data[0]!=0x80 || data[1]!=200 || u32(data+4)!=ssrc[stream])fail("RTCP");
        memcpy(report_ntp[stream],data+8,8);report_ts[stream]=u32(data+16);report_packets[stream]=u32(data+20);report_octets[stream]=u32(data+24);reports[stream]++;return;
    }
    if(length<13 || data[0]!=0x80 || (data[1]&127)!=config[8+stream] || u32(data+8)!=ssrc[stream])fail("RTP");
    uint32_t timestamp=u32(data+4);
    if(!packets[stream])first_ts[stream]=timestamp;
    else {
        uint32_t delta=timestamp-last_ts[stream];
        if(stream && delta!=config[7]*(config[4]==1?48u:8u))fail("AUDIO_CLOCK");
        if(!stream && delta && (delta<90000/config[3]-1 || delta>90000/config[3]+1))fail("VIDEO_CLOCK");
    }
    last_ts[stream]=timestamp;packets[stream]++;octets[stream]+=(uint32_t)length-12;
    if(stream)decode(1,data+12,(size_t)length-12);else video_payload(data+12,(size_t)length-12,timestamp,data[1]&128);
}
int main(void) {
#ifdef _WIN32
    if(_setmode(_fileno(stdin),_O_BINARY)<0 || _setmode(_fileno(stdout),_O_BINARY)<0)fail("IO");
#endif
    av_log_set_callback(quiet);if(srtp_init()!=srtp_err_status_ok)fail("INIT");
    decoded=av_frame_alloc();encoded=av_packet_alloc();if(!decoded || !encoded)fail("MEMORY");
    uint8_t header[12],payload[2048];uint64_t total=0;
    for(;;) {
        exact(header,12);if(memcmp(header,"BMR1",4))fail("FRAMING");
        uint32_t type=u32(header+4),size=u32(header+8);if(size>sizeof(payload) || (total+=size)>8*1024*1024)fail("LIMIT");exact(payload,size);
        if(type==1)configuration(payload,size);else if(type==10)initialize(payload,size);else if(type==11 || type==12)receive(type,payload,size);
        else if(type==3 && !size)break;else fail("FRAMING");
    }
    if(!configured || fgetc(stdin)!=EOF || access_size || fragmented)fail("END");
    decode(0,NULL,0);decode(1,NULL,0);
    if(video_count!=(int)config[2] || !audio_count || energy<1)fail("DECODED_MEDIA");
    for(int i=0;i<2;i++)if(!reports[i] || !packets[i] || report_packets[i]!=packets[i] || report_octets[i]!=octets[i])fail("COUNTERS");
    if(memcmp(report_ntp[0],report_ntp[1],8))fail("SHARED_CLOCK");
    uint32_t clock=config[4]==1?48000:8000,padding=(uint32_t)((uint64_t)config[6]*clock/config[5]);
    double video_elapsed=(double)(uint32_t)(report_ts[0]-first_ts[0])/90000;
    double audio_elapsed=(double)(uint32_t)(report_ts[1]-first_ts[1]-padding)/clock;
    /* Fixture AAC priming places audible audio at 0 and video at 64 ms. */
    if(fabs(audio_elapsed-video_elapsed-0.064)>0.0003)fail("AV_OFFSET");
    for(int i=0;i<2;i++)if(srtp_dealloc(sessions[i])!=srtp_err_status_ok)fail("CLOSE");
    av_frame_free(&decoded);av_packet_free(&encoded);avcodec_free_context(&video);avcodec_free_context(&audio);
    puts("receiver verified");return 0;
}
