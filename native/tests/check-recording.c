/* SPDX-License-Identifier: GPL-3.0-or-later
 * Independent MOV demux/decode of synthetic private-pipe output. No URL I/O. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/intreadwrite.h>
typedef struct { uint8_t *data;size_t size,position; } Input;
static void quiet(void *p,int n,const char *f,va_list a){(void)p;(void)n;(void)f;(void)a;}
static int read_bytes(void *opaque,uint8_t *target,int count) {
    Input *in=opaque;if(in->position==in->size)return AVERROR_EOF;
    size_t n=in->size-in->position;if(n>(size_t)count)n=(size_t)count;
    memcpy(target,in->data+in->position,n);in->position+=n;return (int)n;
}
static int decode(AVCodecContext *decoder,AVPacket *packet,int *frames,int64_t *samples) {
    if(avcodec_send_packet(decoder,packet)<0)return 2;
    AVFrame *frame=av_frame_alloc();if(!frame)return 2;int result;
    while((result=avcodec_receive_frame(decoder,frame))>=0) {
        (*frames)++;*samples+=frame->nb_samples;av_frame_unref(frame);
    }
    av_frame_free(&frame);return result==AVERROR(EAGAIN) || result==AVERROR_EOF?0:2;
}
int main(void) {
#ifdef _WIN32
    if(_setmode(_fileno(stdin),_O_BINARY)<0)return 2;
#endif
    av_log_set_callback(quiet);Input in={0};in.data=malloc(64u*1024u*1024u);if(!in.data)return 2;
    in.size=fread(in.data,1,64u*1024u*1024u,stdin);if(!in.size || !feof(stdin))return 2;
    AVFormatContext *format=avformat_alloc_context();uint8_t *buffer=av_malloc(32768);if(!format || !buffer)return 2;
    AVIOContext *io=avio_alloc_context(buffer,32768,0,&in,read_bytes,NULL,NULL);if(!io)return 2;
    format->pb=io;format->flags|=AVFMT_FLAG_CUSTOM_IO;format->protocol_whitelist=av_strdup("");format->format_whitelist=av_strdup("mov");
    if(avformat_open_input(&format,NULL,av_find_input_format("mov"),NULL)<0 || avformat_find_stream_info(format,NULL)<0 || format->nb_streams<1 || format->nb_streams>2)return 2;
    AVCodecContext *decoders[2]={0};int video=-1,audio=-1,first_video=1,video_frames=0,audio_frames=0;int64_t samples=0,unused=0,first_pts=AV_NOPTS_VALUE,last_pts=AV_NOPTS_VALUE;
    for(unsigned i=0;i<format->nb_streams;i++) {
        AVCodecParameters *params=format->streams[i]->codecpar;
        if(params->codec_type==AVMEDIA_TYPE_VIDEO) { if(video>=0 || params->codec_id!=AV_CODEC_ID_H264)return 2;video=(int)i; }
        else if(params->codec_type==AVMEDIA_TYPE_AUDIO) { if(audio>=0 || params->codec_id!=AV_CODEC_ID_AAC || params->profile!=AV_PROFILE_AAC_LOW || params->ch_layout.nb_channels!=1 || (params->sample_rate!=16000 && params->sample_rate!=24000))return 2;audio=(int)i; }
        else return 2;
        decoders[i]=avcodec_alloc_context3(avcodec_find_decoder(params->codec_id));if(!decoders[i] || avcodec_parameters_to_context(decoders[i],params)<0)return 2;
        decoders[i]->thread_count=1;if(avcodec_open2(decoders[i],NULL,NULL)<0)return 2;
    }
    AVPacket *packet=av_packet_alloc();if(!packet)return 2;int result;
    while((result=av_read_frame(format,packet))>=0) {
        if(packet->stream_index==video) {
            if(first_video && !(packet->flags&AV_PKT_FLAG_KEY))return 2;
            first_video=0;
            int64_t pts=av_rescale_q(packet->pts,format->streams[video]->time_base,AV_TIME_BASE_Q);
            if(first_pts==AV_NOPTS_VALUE)first_pts=pts;
            if(last_pts!=AV_NOPTS_VALUE && pts<=last_pts)return 2;
            last_pts=pts;
        }
        if(decode(decoders[packet->stream_index],packet,packet->stream_index==video?&video_frames:&audio_frames,packet->stream_index==video?&unused:&samples))return 2;
        av_packet_unref(packet);
    }
    if(result!=AVERROR_EOF)return 2;
    for(unsigned i=0;i<format->nb_streams;i++)if(decode(decoders[i],NULL,(int)i==video?&video_frames:&audio_frames,(int)i==video?&unused:&samples))return 2;
    if(video<0 || !video_frames || (audio>=0 && !samples))return 2;
    printf("{\"videoFrames\":%d,\"audioTracks\":%d,\"audioSamples\":%lld,\"firstVideoUs\":%lld,\"lastVideoUs\":%lld}\n",video_frames,audio>=0,(long long)samples,(long long)first_pts,(long long)last_pts);
    for(unsigned i=0;i<format->nb_streams;i++)avcodec_free_context(&decoders[i]);
    av_packet_free(&packet);avformat_close_input(&format);av_freep(&io->buffer);avio_context_free(&io);free(in.data);return 0;
}
