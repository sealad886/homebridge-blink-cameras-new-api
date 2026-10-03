/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <libavcodec/avcodec.h>
static uint32_t u32(const uint8_t *p){return ((uint32_t)p[0]<<24)|((uint32_t)p[1]<<16)|((uint32_t)p[2]<<8)|p[3];}
static void quiet(void *p,int n,const char *f,va_list a){(void)p;(void)n;(void)f;(void)a;}
int main(void){
    av_log_set_callback(quiet);
    const AVCodec *codec=avcodec_find_decoder(AV_CODEC_ID_H264);AVCodecContext *decoder=avcodec_alloc_context3(codec);
    if(!decoder || avcodec_open2(decoder,codec,NULL)<0)return 2;
    AVFrame *frame=av_frame_alloc();AVPacket *packet=av_packet_alloc();if(!frame || !packet)return 2;
    uint8_t header[12];int count=0,ended=0,audio_count=0;AVCodecContext *audio=NULL; double energy=0;
    while(fread(header,1,12,stdin)==12){
        if(memcmp(header,"BMO1",4))return 2;
        uint32_t type=u32(header+4),length=u32(header+8);if(length>1024*1024+48)return 2;
        if(av_new_packet(packet,(int)length)<0)return 2;
        if(fread(packet->data,1,length,stdin)!=length)return 2;
        if(type==5){
            if(length<20)return 2;
            int code=(int)u32(packet->data);enum AVCodecID id=code==1?AV_CODEC_ID_OPUS:code==2?AV_CODEC_ID_PCM_ALAW:AV_CODEC_ID_PCM_MULAW;
            audio=avcodec_alloc_context3(avcodec_find_decoder(id));if(!audio)return 2;
            audio->sample_rate=(int)u32(packet->data+4);av_channel_layout_default(&audio->ch_layout,1);
            uint32_t extra=u32(packet->data+16);if(extra!=length-20)return 2;
            if(extra){audio->extradata=av_mallocz(extra+AV_INPUT_BUFFER_PADDING_SIZE);if(!audio->extradata)return 2;memcpy(audio->extradata,packet->data+20,extra);audio->extradata_size=(int)extra;}
            if(avcodec_open2(audio,audio->codec,NULL)<0)return 2;
        }else if(type==4){
            if(!audio || length<=48)return 2;
            memmove(packet->data,packet->data+48,length-48);packet->size=(int)length-48;
            if(avcodec_send_packet(audio,packet)<0)return 2;
            while(avcodec_receive_frame(audio,frame)>=0){
                if(frame->ch_layout.nb_channels!=1 || frame->nb_samples<=0)return 2;
                for(int i=0;i<frame->nb_samples;i++){
                    double value;
                    if(frame->format==AV_SAMPLE_FMT_S16 || frame->format==AV_SAMPLE_FMT_S16P)value=((int16_t*)frame->data[0])[i]/32768.0;
                    else if(frame->format==AV_SAMPLE_FMT_FLT || frame->format==AV_SAMPLE_FMT_FLTP)value=((float*)frame->data[0])[i];
                    else return 2;
                    energy+=value*value;
                }
                audio_count++;av_frame_unref(frame);
            }
        }else if(type==2){
            if(length<=48)return 2;
            memmove(packet->data,packet->data+48,length-48);packet->size=(int)length-48;
            if(avcodec_send_packet(decoder,packet)<0)return 2;
            while(avcodec_receive_frame(decoder,frame)>=0){
                if(frame->width!=16 || frame->height!=16 || count>=4)return 2;
                int expected=32+count*32,actual=frame->data[0][0];
                if(actual<expected-3 || actual>expected+3)return 2;
                count++;av_frame_unref(frame);
            }
        }else if(type==3)ended=1;
        av_packet_unref(packet);
    }
    av_frame_free(&frame);av_packet_free(&packet);avcodec_free_context(&decoder);int good_audio=!audio || (audio_count>0 && energy>1);avcodec_free_context(&audio);
    return ended && count==4 && good_audio?0:2;
}
