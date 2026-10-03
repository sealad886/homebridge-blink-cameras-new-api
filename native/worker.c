/* SPDX-License-Identifier: GPL-3.0-or-later
 * Prototype: owned MPEG-TS input -> H.264 packet output. No network URL APIs.
 */
#include "protocol.h"
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#ifndef _WIN32
#include <signal.h>
#include <sys/resource.h>
#endif
#ifdef _WIN32
#include <windows.h>
#include <fcntl.h>
#include <io.h>
typedef CRITICAL_SECTION Mutex;
typedef CONDITION_VARIABLE Condition;
#define LOCK(m) EnterCriticalSection(m)
#define UNLOCK(m) LeaveCriticalSection(m)
#define WAKE(c) WakeAllConditionVariable(c)
#define WAIT(c,m) SleepConditionVariableCS(c,m,15000)
#else
#include <pthread.h>
typedef pthread_mutex_t Mutex;
typedef pthread_cond_t Condition;
#define LOCK(m) pthread_mutex_lock(m)
#define UNLOCK(m) pthread_mutex_unlock(m)
#define WAKE(c) pthread_cond_broadcast(c)
static int wait_condition(Condition *c, Mutex *m) {
    struct timespec until; clock_gettime(CLOCK_REALTIME, &until); until.tv_sec += 15;
    return pthread_cond_timedwait(c, m, &until) == 0;
}
#define WAIT(c,m) wait_condition(c,m)
#endif
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/avutil.h>
#include <libavutil/opt.h>
#include <libavutil/intreadwrite.h>
#include <libavutil/time.h>
#include <libswscale/swscale.h>

#define CAPACITY (1024u * 1024u)
#define MAX_FRAME (64u * 1024u)
#define MAX_MEDIA (128u * 1024u * 1024u)
#define MAX_PACKET (CAPACITY - 60u)
static Mutex mutex;
static Condition changed;
static uint8_t queue[CAPACITY];
static size_t first, available;
static int configured, ended, reader_closed;
static uint32_t config[10];
static int64_t started;
static void fatal(const char *code) { fprintf(stderr, "BLINK_WORKER_%s\n", code); fflush(stderr); _Exit(2); }
static uint32_t u32(const uint8_t *p) { return ((uint32_t)p[0]<<24)|((uint32_t)p[1]<<16)|((uint32_t)p[2]<<8)|p[3]; }
static void put32(uint8_t *p, uint32_t n) { p[0]=n>>24; p[1]=n>>16; p[2]=n>>8; p[3]=n; }
static void put64(uint8_t *p, int64_t n) { uint64_t v=(uint64_t)n; put32(p,(uint32_t)(v>>32)); put32(p+4,(uint32_t)v); }
static int exact(void *target, size_t length) {
    uint8_t *p=target; size_t used=0;
    while (used<length) { size_t n=fread(p+used,1,length-used,stdin); if(!n) return used? -1:0; used+=n; }
    return 1;
}
static void silence(void *context, int level, const char *format, va_list arguments) { (void)context;(void)level;(void)format;(void)arguments; }
#include "output.inc"
#include "protection.inc"
static void read_messages(void) {
    uint8_t header[12], payload[MAX_FRAME]; uint64_t total=0;
    for (;;) {
        int result=exact(header,sizeof(header));
        if (result==0) { LOCK(&mutex); int finished=ended; if(finished){reader_closed=1;WAKE(&changed);} UNLOCK(&mutex); if(finished) return; fatal("TRUNCATED"); }
        if(result<0 || memcmp(header,BLINK_INPUT_MAGIC,4)) fatal("FRAMING");
        uint32_t type=u32(header+4), length=u32(header+8);
        if(length>MAX_FRAME) fatal("FRAMING");
        if(length && exact(payload,length)!=1) fatal("TRUNCATED");
        if(type==BLINK_STOP && length==0) _Exit(0); /* STOP never waits on codec/output/queue. */
        if(type>=10 && type<=12) { protect_message(type,payload,length); LOCK(&mutex);WAKE(&changed);UNLOCK(&mutex); continue; }
        LOCK(&mutex);
        if(type==1 && !configured && !ended && length==BLINK_CONFIG_BYTES) {
            for(int i=0;i<10;i++) config[i]=u32(payload+4*i);
            if(!config[0] || !config[1] || config[0]>1920 || config[1]>1080 ||
               (config[0]&1) || (config[1]&1) || config[2]<1 || config[2]>30 ||
               config[3]<20000 || config[3]>4000000 || config[4]<1 || config[4]>9000 || config[5]) fatal("CONFIG");
            if(config[6]>3 || (!config[6] && (config[7] || config[8] || config[9])) ||
               (config[6] && (config[8]!=1 || config[9]<8000 || config[9]>128000 ||
               (config[6]==1?(config[7]!=16000 && config[7]!=24000):config[7]!=8000)))) fatal("AUDIO_CONFIG");
            configured=1;
        } else if(type==2 && configured && !ended && length) {
            total+=length; if(total>MAX_MEDIA || available+length>CAPACITY) fatal("INPUT_LIMIT");
            size_t tail=(first+available)%CAPACITY;
            size_t a=length<CAPACITY-tail?length:CAPACITY-tail;
            memcpy(queue+tail,payload,a); memcpy(queue,payload+a,length-a); available+=length;
        } else if(type==3 && configured && !ended && length==0) ended=1;
        else fatal("FRAMING");
        WAKE(&changed); UNLOCK(&mutex);
    }
}
static void watch_time(void) {
    for (;;) {
#ifdef _WIN32
        Sleep(100);
#else
        struct timespec pause = {0, 100000000}; nanosleep(&pause, NULL);
#endif
        check_output_deadline();
        if (av_gettime_relative()-started>300000000) fatal("TIME_LIMIT");
    }
}
#ifdef _WIN32
static DWORD WINAPI watchdog(void *unused) { (void)unused; watch_time(); return 0; }
#else
static void *watchdog(void *unused) { (void)unused; watch_time(); return NULL; }
#endif
#ifdef _WIN32
static DWORD WINAPI reader(void *unused) { (void)unused; read_messages(); return 0; }
#else
static void *reader(void *unused) { (void)unused; read_messages(); return NULL; }
#endif
static int read_media(void *unused, uint8_t *target, int count) {
    (void)unused; LOCK(&mutex);
    while(!available && !ended) if(!WAIT(&changed,&mutex)) fatal("INPUT_TIMEOUT");
    if(av_gettime_relative()-started>300000000) fatal("TIME_LIMIT");
    if(!available) { UNLOCK(&mutex); return AVERROR_EOF; }
    size_t n=available<(size_t)count?available:(size_t)count;
    size_t a=n<CAPACITY-first?n:CAPACITY-first;
    memcpy(target,queue+first,a); memcpy(target+a,queue,n-a);
    first=(first+n)%CAPACITY; available-=n; UNLOCK(&mutex); return (int)n;
}
/* Custom media bytes are the only I/O capability. Reject secondary library opens. */
static int deny_open(AVFormatContext *context, AVIOContext **io, const char *url,
                     int flags, AVDictionary **options) {
    (void)context; (void)io; (void)url; (void)flags; (void)options;
    return AVERROR(EPERM);
}
static int interrupted(void *unused) { (void)unused; return av_gettime_relative()-started>300000000; }
static void packets(AVCodecContext *encoder, AVPacket *packet, uint64_t *bytes,uint32_t type) {
    int result;
    while((result=avcodec_receive_packet(encoder,packet))>=0) {
        if(packet->size<=0 || (uint32_t)packet->size>MAX_PACKET || *bytes+(uint32_t)packet->size>64u*1024u*1024u) fatal("OUTPUT_LIMIT");
        *bytes+=(uint32_t)packet->size;
        uint32_t length=48+(uint32_t)packet->size;
        uint8_t *framed=av_malloc(length); if(!framed) fatal("MEMORY");
        put64(framed,av_rescale_q(packet->pts,encoder->time_base,AV_TIME_BASE_Q));
        put64(framed+8,av_rescale_q(packet->dts,encoder->time_base,AV_TIME_BASE_Q));
        put64(framed+16,av_rescale_q(packet->duration,encoder->time_base,AV_TIME_BASE_Q));
        put32(framed+24,(uint32_t)(packet->flags&AV_PKT_FLAG_KEY));put32(framed+28,type==2?1:2);put32(framed+32,1);put32(framed+36,1000000);
        size_t side_length=0; const uint8_t *side=av_packet_get_side_data(packet,AV_PKT_DATA_SKIP_SAMPLES,&side_length);
        if(side && side_length<10)fatal("PACKET_METADATA");
        put32(framed+40,side?AV_RL32(side):0);put32(framed+44,side?AV_RL32(side+4):0);
        memcpy(framed+48,packet->data,(size_t)packet->size); output(type,framed,length);
        av_free(framed); av_packet_unref(packet);
    }
    if(result!=AVERROR(EAGAIN) && result!=AVERROR_EOF) fatal("ENCODE");
}
#include "audio.inc"

int main(int argc, char **argv) {
    (void)argv; if(argc!=1) fatal("ARGUMENTS");
#ifdef _WIN32
    if (_setmode(_fileno(stdin),_O_BINARY)<0 || _setmode(_fileno(stdout),_O_BINARY)<0) fatal("IO_SETUP");
    SetErrorMode(SEM_FAILCRITICALERRORS|SEM_NOGPFAULTERRORBOX);
    InitializeCriticalSection(&mutex); InitializeConditionVariable(&changed);
#else
    struct rlimit core_limit={0,0};
    if(setrlimit(RLIMIT_CORE,&core_limit))fatal("CORE_LIMIT");
    if(getrlimit(RLIMIT_CORE,&core_limit) || core_limit.rlim_cur || core_limit.rlim_max)fatal("CORE_LIMIT");
    signal(SIGPIPE, SIG_IGN); pthread_mutex_init(&mutex,NULL); pthread_cond_init(&changed,NULL);
#endif
    av_log_set_callback(silence); started=av_gettime_relative();
    start_output(); if(srtp_get_version()!=0x02080001u)fatal("SRTP_VERSION"); if(srtp_init()!=srtp_err_status_ok)fatal("SRTP_INIT");
    /* Fail closed on ABI/version drift instead of accidentally using ffmpeg@4. */
    if(avcodec_version()!=AV_VERSION_INT(63,1,102) || avformat_version()!=AV_VERSION_INT(63,1,102) || avutil_version()!=AV_VERSION_INT(61,1,102)) fatal("VERSION");
#ifdef _WIN32
    HANDLE thread=CreateThread(NULL,0,reader,NULL,0,NULL); if(!thread) fatal("THREAD"); CloseHandle(thread);
    thread=CreateThread(NULL,0,watchdog,NULL,0,NULL); if(!thread) fatal("THREAD"); CloseHandle(thread);
#else
    pthread_t thread; if(pthread_create(&thread,NULL,reader,NULL)) fatal("THREAD"); pthread_detach(thread);
    if(pthread_create(&thread,NULL,watchdog,NULL)) { fatal("THREAD"); }
    pthread_detach(thread);
#endif
    LOCK(&mutex); while(!configured) if(!WAIT(&changed,&mutex)) fatal("CONFIG_TIMEOUT"); UNLOCK(&mutex);
    uint8_t status[8]; put32(status,1); put32(status+4,config[2]); output(1,status,sizeof(status));
    AVFormatContext *input=avformat_alloc_context(); if(!input) fatal("MEMORY");
    uint8_t *buffer=av_malloc(32768); if(!buffer) fatal("MEMORY");
    AVIOContext *io=avio_alloc_context(buffer,32768,0,NULL,read_media,NULL,NULL); if(!io) fatal("MEMORY");
    input->pb=io; input->flags|=AVFMT_FLAG_CUSTOM_IO; input->io_open=deny_open;
    input->protocol_whitelist=av_strdup(""); input->format_whitelist=av_strdup("mpegts");
    if(!input->protocol_whitelist || !input->format_whitelist) fatal("MEMORY");
    const AVInputFormat *demuxer=av_find_input_format("mpegts");
    if(!demuxer) fatal("DEMUXER");
    input->interrupt_callback.callback=interrupted; input->probesize=64*1024; input->max_analyze_duration=1000000; input->max_probe_packets=32; input->max_streams=8;
    AVDictionary *options=NULL;
    if(av_dict_set(&options,"codec_whitelist","h264,aac,aac_latm",0)<0 ||
       av_dict_set_int(&options,"max_packet_size",256*1024,0)<0 ||
       av_dict_set_int(&options,"resync_size",65536,0)<0) fatal("MEMORY");
    if(avformat_open_input(&input,NULL,demuxer,&options)<0) { fatal("MEDIA"); }
    av_dict_free(&options);
    AVCodecContext *decoder=NULL;
    const AVCodec *codec=avcodec_find_encoder_by_name("libx264"); if(!codec) fatal("ENCODER");
    AVCodecContext *encoder=avcodec_alloc_context3(codec); if(!encoder) fatal("MEMORY");
    encoder->width=(int)config[0]; encoder->height=(int)config[1]; encoder->time_base=AV_TIME_BASE_Q; encoder->framerate=(AVRational){(int)config[2],1};
    encoder->pix_fmt=AV_PIX_FMT_YUV420P; encoder->bit_rate=config[3]; encoder->gop_size=(int)config[2]; encoder->max_b_frames=0; encoder->thread_count=1;
    av_dict_set(&options,"preset","ultrafast",0); av_dict_set(&options,"tune","zerolatency",0);
    if(avcodec_open2(encoder,codec,&options)<0) { fatal("ENCODER"); }
    av_dict_free(&options);
    AVFrame *decoded=av_frame_alloc(), *scaled=av_frame_alloc(); AVPacket *packet=av_packet_alloc(), *encoded=av_packet_alloc();
    if(!decoded || !scaled || !packet || !encoded) fatal("MEMORY");
    scaled->format=AV_PIX_FMT_YUV420P; scaled->width=encoder->width; scaled->height=encoder->height;
    if(av_frame_get_buffer(scaled,32)<0) fatal("MEMORY");
    struct SwsContext *scaler=NULL; uint32_t frames=0; uint64_t bytes=0; int video=-1, result;
    for (;;) {
        result=av_read_frame(input,packet);
        if(result<0 && result!=AVERROR_EOF) fatal("MEDIA");
        if(result>=0) {
            if(packet->size>2*1024*1024) fatal("PACKET_LIMIT");
            if(video<0 && input->streams[packet->stream_index]->codecpar->codec_type==AVMEDIA_TYPE_VIDEO) {
                video=packet->stream_index; AVCodecParameters *params=input->streams[video]->codecpar;
                if(params->codec_id!=AV_CODEC_ID_H264) fatal("CODEC");
                codec=avcodec_find_decoder(AV_CODEC_ID_H264); decoder=avcodec_alloc_context3(codec); if(!decoder) fatal("MEMORY");
                if(avcodec_parameters_to_context(decoder,params)<0) fatal("DECODE");
                decoder->pkt_timebase=input->streams[video]->time_base; decoder->max_pixels=1920*1080; decoder->thread_count=1;
                if(avcodec_open2(decoder,codec,NULL)<0) fatal("DECODE");
            }
            if(config[6] && audio_stream<0 && input->streams[packet->stream_index]->codecpar->codec_type==AVMEDIA_TYPE_AUDIO) {
                audio_stream=packet->stream_index;audio_open(input->streams[audio_stream]->codecpar,input->streams[audio_stream]->time_base);
            }
            if(packet->stream_index==audio_stream) { audio_decode(packet,&bytes);av_packet_unref(packet);continue; }
            if(packet->stream_index!=video) { av_packet_unref(packet); continue; }
        }
        if(!decoder) fatal("MEDIA");
        if(avcodec_send_packet(decoder,result>=0?packet:NULL)<0) fatal("DECODE");
        av_packet_unref(packet);
        int received;
        while((received=avcodec_receive_frame(decoder,decoded))>=0) {
            if(++frames>config[4] || decoded->width<=0 || decoded->height<=0 || decoded->width>1920 || decoded->height>1080 || interrupted(NULL)) fatal("FRAME_LIMIT");
            scaler=sws_getCachedContext(scaler,decoded->width,decoded->height,decoded->format,encoder->width,encoder->height,AV_PIX_FMT_YUV420P,SWS_BILINEAR,NULL,NULL,NULL);
            if(!scaler || av_frame_make_writable(scaled)<0) fatal("SCALE");
            if(sws_scale(scaler,(const uint8_t *const*)decoded->data,decoded->linesize,0,decoded->height,scaled->data,scaled->linesize)!=encoder->height) fatal("SCALE");
            if(decoded->best_effort_timestamp==AV_NOPTS_VALUE)fatal("VIDEO_TIMESTAMP");
            scaled->pts=av_rescale_q(decoded->best_effort_timestamp,input->streams[video]->time_base,AV_TIME_BASE_Q);
            if(avcodec_send_frame(encoder,scaled)<0) { fatal("ENCODE"); }
            packets(encoder,encoded,&bytes,2); av_frame_unref(decoded);
        }
        if(received!=AVERROR(EAGAIN) && received!=AVERROR_EOF) fatal("DECODE");
        if(result==AVERROR_EOF) break;
    }
    if(avcodec_send_frame(encoder,NULL)<0) { fatal("ENCODE"); }
    packets(encoder,encoded,&bytes,2); audio_finish(&bytes); output(3,NULL,0);
    sws_freeContext(scaler); av_frame_free(&decoded); av_frame_free(&scaled); av_packet_free(&packet); av_packet_free(&encoded); avcodec_free_context(&decoder); avcodec_free_context(&encoder);
    avformat_close_input(&input); av_freep(&io->buffer); avio_context_free(&io);
    LOCK(&mutex);while(!reader_closed)if(!WAIT(&changed,&mutex))fatal("FINAL_IDLE_TIMEOUT");UNLOCK(&mutex);
    close_protection();drain_output();
    return 0;
}
