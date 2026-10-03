/* SPDX-License-Identifier: GPL-3.0-or-later
 * Synthetic four-frame MPEG-TS fixture, using public libraries only.
 */
#include <stdio.h>
#include <string.h>
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/opt.h>
static void quiet(void *p,int n,const char *f,va_list a){(void)p;(void)n;(void)f;(void)a;}
static int write_bytes(void *unused,const uint8_t *data,int length){(void)unused; return fwrite(data,1,(size_t)length,stdout)==(size_t)length?length:AVERROR(EIO);}
int main(int argc,char **argv){
    (void)argv; int with_audio=argc>1;
    av_log_set_callback(quiet);
    const AVCodec *codec=avcodec_find_encoder_by_name("libx264");
    AVCodecContext *encoder=avcodec_alloc_context3(codec);
    if(!encoder) return 2;
    encoder->width=16;encoder->height=16;encoder->pix_fmt=AV_PIX_FMT_YUV420P;
    encoder->time_base=(AVRational){1,15};encoder->framerate=(AVRational){15,1};encoder->thread_count=1;encoder->max_b_frames=0;
    AVDictionary *options=NULL;av_dict_set(&options,"preset","ultrafast",0);av_dict_set(&options,"tune","zerolatency",0);
    if(avcodec_open2(encoder,codec,&options)<0)return 2;
    av_dict_free(&options);
    AVFormatContext *format=NULL;
    if(avformat_alloc_output_context2(&format,NULL,"mpegts",NULL)<0)return 2;
    format->pb=avio_alloc_context(av_malloc(32768),32768,1,NULL,NULL,write_bytes,NULL);
    if(!format->pb)return 2;
    AVStream *stream=avformat_new_stream(format,NULL);
    if(!stream || avcodec_parameters_from_context(stream->codecpar,encoder)<0)return 2;
    stream->time_base=encoder->time_base;
    AVCodecContext *audio=NULL;AVStream *audio_stream=NULL;AVFrame *audio_frame=NULL;
    if(with_audio){
        const AVCodec *aac=avcodec_find_encoder(AV_CODEC_ID_AAC);audio=avcodec_alloc_context3(aac);if(!audio)return 2;
        audio->sample_rate=16000;audio->sample_fmt=AV_SAMPLE_FMT_FLTP;audio->bit_rate=32000;audio->time_base=(AVRational){1,16000};
        av_channel_layout_default(&audio->ch_layout,1);audio->thread_count=1;
        if(avcodec_open2(audio,aac,NULL)<0)return 2;
        audio_stream=avformat_new_stream(format,NULL);if(!audio_stream || avcodec_parameters_from_context(audio_stream->codecpar,audio)<0)return 2;
        audio_stream->time_base=audio->time_base;
        audio_frame=av_frame_alloc();if(!audio_frame)return 2;
        audio_frame->format=audio->sample_fmt;audio_frame->sample_rate=16000;audio_frame->nb_samples=audio->frame_size;
        if(av_channel_layout_copy(&audio_frame->ch_layout,&audio->ch_layout)<0 || av_frame_get_buffer(audio_frame,0)<0)return 2;
    }
    if(avformat_write_header(format,NULL)<0)return 2;
    AVFrame *frame=av_frame_alloc();AVPacket *packet=av_packet_alloc();
    if(!frame || !packet)return 2;
    frame->format=encoder->pix_fmt;frame->width=16;frame->height=16;
    if(av_frame_get_buffer(frame,32)<0)return 2;
    for(int i=0;i<=4;i++){
        if(i<4){
            if(av_frame_make_writable(frame)<0)return 2;
            for(int y=0;y<16;y++)memset(frame->data[0]+y*frame->linesize[0],32+i*32,16);
            for(int y=0;y<8;y++){memset(frame->data[1]+y*frame->linesize[1],128,8);memset(frame->data[2]+y*frame->linesize[2],128,8);}
            frame->pts=i;
        }
        if(avcodec_send_frame(encoder,i<4?frame:NULL)<0)return 2;
        while(avcodec_receive_packet(encoder,packet)>=0){
            packet->stream_index=stream->index;av_packet_rescale_ts(packet,encoder->time_base,stream->time_base);
            if(av_interleaved_write_frame(format,packet)<0)return 2;
        }
        if(with_audio){
            if(i<4){
                if(av_frame_make_writable(audio_frame)<0)return 2;
                float *samples=(float*)audio_frame->data[0];
                for(int n=0;n<audio_frame->nb_samples;n++)samples[n]=(n%16<8)?0.15f:-0.15f;
                audio_frame->pts=i*audio->frame_size;
            }
            if(avcodec_send_frame(audio,i<4?audio_frame:NULL)<0)return 2;
            while(avcodec_receive_packet(audio,packet)>=0){
                packet->stream_index=audio_stream->index;av_packet_rescale_ts(packet,audio->time_base,audio_stream->time_base);
                if(av_interleaved_write_frame(format,packet)<0)return 2;
            }
        }
    }
    av_frame_free(&audio_frame);avcodec_free_context(&audio);
    if(av_write_trailer(format)<0)return 2;
    av_frame_free(&frame);av_packet_free(&packet);avcodec_free_context(&encoder);
    av_freep(&format->pb->buffer);avio_context_free(&format->pb);avformat_free_context(format);return 0;
}
