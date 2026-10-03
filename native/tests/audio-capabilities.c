/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <stdio.h>
#include <libavcodec/avcodec.h>
static void quiet(void *p,int n,const char *f,va_list a){(void)p;(void)n;(void)f;(void)a;}
int main(void){
 av_log_set_callback(quiet);
 const char *names[]={"libopus","pcm_alaw","pcm_mulaw","aac"};
 for(int i=0;i<4;i++){
  const AVCodec *codec=avcodec_find_encoder_by_name(names[i]);if(!codec){printf("%s missing\n",names[i]);continue;}
  AVCodecContext *c=avcodec_alloc_context3(codec);if(!c)return 2;
  c->sample_rate=i==0?16000:i==3?16000:8000;c->sample_fmt=i==3?AV_SAMPLE_FMT_FLTP:AV_SAMPLE_FMT_S16;
  av_channel_layout_default(&c->ch_layout,1);c->time_base=(AVRational){1,c->sample_rate};c->bit_rate=24000;
  if(i==3)c->profile=AV_PROFILE_AAC_ELD;
  int result=avcodec_open2(c,codec,NULL);
  printf("%s open=%d rate=%d frame=%d padding=%d\n",names[i],result,c->sample_rate,c->frame_size,c->initial_padding);
  avcodec_free_context(&c);
 }
 return 0;
}
