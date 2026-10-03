/* SPDX-License-Identifier: GPL-3.0-or-later
 * Included in worker.c: bounded audio decode/resample/encode, no transport. */
#include <libavutil/audio_fifo.h>
#include <libswresample/swresample.h>
static AVCodecContext *audio_decoder, *audio_encoder;
static SwrContext *resampler;
static AVAudioFifo *audio_fifo;
static AVFrame *audio_decoded;
static int audio_stream=-1, source_rate, source_format, source_channels;
static AVRational audio_time_base;
static int64_t audio_next_pts, expected_source_us=AV_NOPTS_VALUE;
static uint64_t audio_samples;
static void audio_emit(uint64_t *bytes) {
    AVPacket *p=av_packet_alloc(); if(!p)fatal("MEMORY");
    packets(audio_encoder,p,bytes,4); av_packet_free(&p);
}
static void audio_encode_fifo(int final,uint64_t *bytes) {
    int block=audio_encoder->frame_size?audio_encoder->frame_size:audio_encoder->sample_rate/50;
    while(av_audio_fifo_size(audio_fifo)>=block || (final && av_audio_fifo_size(audio_fifo))) {
        int n=av_audio_fifo_size(audio_fifo); if(n>block)n=block;
        AVFrame *f=av_frame_alloc(); if(!f)fatal("MEMORY");
        f->format=audio_encoder->sample_fmt; f->sample_rate=audio_encoder->sample_rate;
        if(av_channel_layout_copy(&f->ch_layout,&audio_encoder->ch_layout)<0)fatal("MEMORY");
        f->nb_samples=n; f->pts=audio_next_pts; audio_next_pts+=n;
        if(av_frame_get_buffer(f,0)<0 || av_audio_fifo_read(audio_fifo,(void**)f->data,n)!=n)fatal("AUDIO_MEMORY");
        if(avcodec_send_frame(audio_encoder,f)<0)fatal("AUDIO_ENCODE");
        av_frame_free(&f); audio_emit(bytes);
    }
}
static void audio_init_resampler(AVFrame *f) {
    source_rate=f->sample_rate; source_format=f->format; source_channels=f->ch_layout.nb_channels;
    if(source_rate<8000 || source_rate>48000 || source_channels<1 || source_channels>2)fatal("AUDIO_INPUT");
    if(swr_alloc_set_opts2(&resampler,&audio_encoder->ch_layout,audio_encoder->sample_fmt,audio_encoder->sample_rate,
       &f->ch_layout,f->format,f->sample_rate,0,NULL)<0 || swr_init(resampler)<0)fatal("AUDIO_RESAMPLE");
    audio_fifo=av_audio_fifo_alloc(audio_encoder->sample_fmt,1,1); if(!audio_fifo)fatal("MEMORY");
}
static void audio_convert(AVFrame *f,int flush,uint64_t *bytes) {
    if(!resampler) { if(flush)return; audio_init_resampler(f); }
    if(!flush && (f->sample_rate!=source_rate || f->format!=source_format || f->ch_layout.nb_channels!=source_channels || f->nb_samples<=0 || f->nb_samples>8192))fatal("AUDIO_INPUT");
    int count=flush?0:f->nb_samples;
    int capacity=(int)av_rescale_rnd(swr_get_delay(resampler,source_rate)+count,audio_encoder->sample_rate,source_rate,AV_ROUND_UP)+32;
    if(capacity<1 || capacity>32768)fatal("AUDIO_LIMIT");
    uint8_t **samples=NULL; int linesize;
    if(av_samples_alloc_array_and_samples(&samples,&linesize,1,capacity,audio_encoder->sample_fmt,0)<0)fatal("MEMORY");
    int n=swr_convert(resampler,samples,capacity,flush?NULL:(const uint8_t**)f->extended_data,count);
    if(n<0 || av_audio_fifo_size(audio_fifo)+n>audio_encoder->sample_rate*2)fatal("AUDIO_LIMIT");
    audio_samples+=(uint64_t)n; if(audio_samples>300u*(uint32_t)audio_encoder->sample_rate)fatal("AUDIO_LIMIT");
    if(av_audio_fifo_write(audio_fifo,(void**)samples,n)!=n)fatal("AUDIO_MEMORY");
    av_freep(&samples[0]);av_freep(&samples);
    audio_encode_fifo(flush,bytes);
}
static void audio_open(AVCodecParameters *params,AVRational time_base) {
    if(params->codec_id!=AV_CODEC_ID_AAC && params->codec_id!=AV_CODEC_ID_AAC_LATM)fatal("AUDIO_CODEC");
    const AVCodec *codec=avcodec_find_decoder(params->codec_id); audio_decoder=avcodec_alloc_context3(codec);if(!audio_decoder)fatal("MEMORY");
    if(avcodec_parameters_to_context(audio_decoder,params)<0)fatal("AUDIO_DECODE");
    audio_decoder->thread_count=1;audio_decoder->pkt_timebase=time_base;audio_time_base=time_base;
    if(avcodec_open2(audio_decoder,codec,NULL)<0)fatal("AUDIO_DECODE");
    const char *name=config[6]==1?"libopus":config[6]==2?"pcm_alaw":"pcm_mulaw";
    codec=avcodec_find_encoder_by_name(name);audio_encoder=avcodec_alloc_context3(codec);if(!audio_encoder)fatal("AUDIO_ENCODER");
    audio_encoder->sample_fmt=AV_SAMPLE_FMT_S16;audio_encoder->sample_rate=(int)config[7];audio_encoder->bit_rate=config[9];audio_encoder->thread_count=1;
    av_channel_layout_default(&audio_encoder->ch_layout,1);audio_encoder->time_base=(AVRational){1,(int)config[7]};
    if(avcodec_open2(audio_encoder,codec,NULL)<0)fatal("AUDIO_ENCODER");
    if(audio_encoder->extradata_size<0 || audio_encoder->extradata_size>4096)fatal("AUDIO_LIMIT");
    uint8_t info[4116];put32(info,config[6]);put32(info+4,config[7]);put32(info+8,1);put32(info+12,(uint32_t)audio_encoder->initial_padding);put32(info+16,(uint32_t)audio_encoder->extradata_size);
    if(audio_encoder->extradata_size) {
        memcpy(info+20,audio_encoder->extradata,(size_t)audio_encoder->extradata_size);
    }
    output(5,info,20+(uint32_t)audio_encoder->extradata_size);
    audio_decoded=av_frame_alloc();if(!audio_decoded)fatal("MEMORY");
}
static void audio_decode(AVPacket *p,uint64_t *bytes) {
    if(avcodec_send_packet(audio_decoder,p)<0)fatal("AUDIO_DECODE");
    int result;
    while((result=avcodec_receive_frame(audio_decoder,audio_decoded))>=0) {
        int64_t timestamp=audio_decoded->best_effort_timestamp;
        if(timestamp==AV_NOPTS_VALUE)fatal("AUDIO_TIMESTAMP");
        int64_t us=av_rescale_q(timestamp,audio_time_base,AV_TIME_BASE_Q);
        if(expected_source_us==AV_NOPTS_VALUE)audio_next_pts=av_rescale_q(timestamp,audio_time_base,audio_encoder->time_base);
        else if(llabs(us-expected_source_us)>2000)fatal("AUDIO_DISCONTINUITY");
        if(audio_decoded->sample_rate<=0)fatal("AUDIO_INPUT");
        expected_source_us=us+av_rescale_q(audio_decoded->nb_samples,(AVRational){1,audio_decoded->sample_rate},AV_TIME_BASE_Q);
        audio_convert(audio_decoded,0,bytes);av_frame_unref(audio_decoded);
    }
    if(result!=AVERROR(EAGAIN) && result!=AVERROR_EOF)fatal("AUDIO_DECODE");
}
static void audio_finish(uint64_t *bytes) {
    if(!audio_decoder)return;
    audio_decode(NULL,bytes);audio_convert(NULL,1,bytes);
    if(avcodec_send_frame(audio_encoder,NULL)<0) { fatal("AUDIO_ENCODE"); }
    audio_emit(bytes);
    av_frame_free(&audio_decoded);av_audio_fifo_free(audio_fifo);swr_free(&resampler);
    avcodec_free_context(&audio_decoder);avcodec_free_context(&audio_encoder);
}
