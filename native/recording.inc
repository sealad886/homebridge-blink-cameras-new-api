/* SPDX-License-Identifier: GPL-3.0-or-later
 * Included in worker.c. Private bounded fMP4 output; no file or URL capability.
 * Each record contains a complete initialization segment or moof/mdat fragment.
 */
static AVFormatContext *recording;
static AVIOContext *recording_io;
static uint8_t *recording_data;
static size_t recording_size,recording_packet_bytes;
static uint64_t recording_total;
static uint32_t recording_sequence;
static int recording_video,recording_audio=-1,recording_has_video,recording_has_audio,recording_init_sent;
static int64_t recording_start=AV_NOPTS_VALUE,recording_end,recording_last_video=AV_NOPTS_VALUE;
static int64_t recording_media_start=AV_NOPTS_VALUE,recording_media_end;
static int64_t recording_first_video=AV_NOPTS_VALUE,recording_first_audio=AV_NOPTS_VALUE,recording_audio_end;
static int64_t recording_audio_tolerance;
static int64_t recording_video_target_end=AV_NOPTS_VALUE;
static int64_t recording_all_start=AV_NOPTS_VALUE,recording_all_end,recording_audio_priming_us;
static AVCodecContext *recording_video_encoder;
static AVPacket *recording_finite_video;
static AVPacket *recording_pending[64];
static size_t recording_pending_count,recording_pending_bytes;
static int recording_waiting_audio;
static int64_t recording_pending_start;
static void recording_packet_internal(AVCodecContext *encoder,AVPacket *packet,uint32_t type,int incoming);
static void recording_hold_video(AVPacket *packet,int64_t pts) {
    if(!recording_pending_count)recording_pending_start=pts;
    int64_t wait_limit=config[16] && config[17]?BLINK_AUDIO_TAIL_MAX_US:1000000;
    if(pts-recording_pending_start>wait_limit || recording_pending_count>=64 ||
       (size_t)packet->size>CAPACITY-recording_pending_bytes)fatal(recording_first_audio==AV_NOPTS_VALUE?"AUDIO_MISSING":"AUDIO_DISCONTINUITY");
    AVPacket *owned=av_packet_clone(packet);if(!owned)fatal("MEMORY");
    recording_pending[recording_pending_count++]=owned;recording_pending_bytes+=(size_t)packet->size;
}
static void recording_replay_video(void) {
    AVPacket *pending[64];size_t count=recording_pending_count;
    memcpy(pending,recording_pending,count*sizeof(*pending));recording_pending_count=0;recording_pending_bytes=0;recording_waiting_audio=0;
    for(size_t i=0;i<count;i++) {
        recording_packet_internal(recording_video_encoder,pending[i],BLINK_VIDEO_PACKET,0);
        av_packet_free(&pending[i]);
    }
}
static int recording_write(void *unused,const uint8_t *data,int length) {
    (void)unused;
    if(length<0 || (size_t)length>BLINK_MP4_FRAGMENT_MAX-recording_size)fatal("FRAGMENT_LIMIT");
    memcpy(recording_data+recording_size,data,(size_t)length);recording_size+=(size_t)length;
    return length;
}
static void recording_flush(void) {
    if(!recording_has_video)return;
    if(recording_audio>=0 && !recording_has_audio)fatal("AUDIO_MISSING");
    if(recording_audio>=0 && recording_end-recording_audio_end>recording_audio_tolerance)fatal("AUDIO_DISCONTINUITY");
    if(av_write_frame(recording,NULL)<0)fatal("MP4_MUX");
    avio_flush(recording_io);
    if(!recording_init_sent) {
        /* delay_moov lets libav write the initial edit lists using both source
         * clocks and AAC priming. Split only complete top-level MP4 boxes. */
        size_t offset=0;int moov=0;
        while(offset+8<=recording_size) {
            uint32_t length=u32(recording_data+offset);
            if(length<8 || length>recording_size-offset)fatal("MP4_HEADER");
            if(!memcmp(recording_data+offset+4,"moof",4))break;
            if(!memcmp(recording_data+offset+4,"moov",4))moov=1;
            offset+=length;
        }
        if(!moov || !offset || offset>BLINK_MP4_INIT_MAX)fatal("MP4_HEADER");
        output(BLINK_MP4_INIT,recording_data,(uint32_t)offset);
        memmove(recording_data,recording_data+offset,recording_size-offset);recording_size-=offset;recording_total+=offset;recording_init_sent=1;
        /* First custom flush writes delayed moov; the next emits its fragment. */
        if(!recording_size) {
            if(av_write_frame(recording,NULL)<0)fatal("MP4_MUX");
            avio_flush(recording_io);
        }
    }
    int64_t duration=recording_end-recording_start;
    if(recording_io->error || !recording_size || duration<=0 || duration>(int64_t)config[14]*1000 ||
       recording_media_start==AV_NOPTS_VALUE || recording_media_end-recording_media_start>(int64_t)config[14]*1000 ||
       recording_size>BLINK_MP4_FRAGMENT_MAX || recording_total+recording_size>64u*1024u*1024u)fatal("FRAGMENT_LIMIT");
    uint8_t *framed=av_malloc(BLINK_MP4_METADATA_BYTES+recording_size);if(!framed)fatal("MEMORY");
    put32(framed,recording_sequence++);put64(framed+4,recording_start);put64(framed+12,duration);put32(framed+20,1);
    memcpy(framed+BLINK_MP4_METADATA_BYTES,recording_data,recording_size);
    output(BLINK_MP4_FRAGMENT,framed,BLINK_MP4_METADATA_BYTES+(uint32_t)recording_size);
    av_free(framed);recording_total+=recording_size;recording_size=0;recording_packet_bytes=0;recording_has_video=0;recording_has_audio=0;recording_start=AV_NOPTS_VALUE;recording_media_start=AV_NOPTS_VALUE;
}
static void recording_open(AVCodecContext *video,AVCodecContext *audio) {
    recording_video_encoder=video;
    if(avformat_alloc_output_context2(&recording,NULL,"mp4",NULL)<0 || !recording)fatal("MP4_MUXER");
    recording_data=av_malloc(BLINK_MP4_FRAGMENT_MAX);uint8_t *io_buffer=av_malloc(32768);
    if(!recording_data || !io_buffer)fatal("MEMORY");
    recording_io=avio_alloc_context(io_buffer,32768,1,NULL,NULL,recording_write,NULL);if(!recording_io)fatal("MEMORY");
    recording->pb=recording_io;recording->flags|=AVFMT_FLAG_CUSTOM_IO;recording->io_open=deny_open;
    recording->protocol_whitelist=av_strdup("");if(!recording->protocol_whitelist)fatal("MEMORY");
    AVStream *stream=avformat_new_stream(recording,NULL);if(!stream)fatal("MEMORY");
    recording_video=stream->index;stream->time_base=video->time_base;
    if(avcodec_parameters_from_context(stream->codecpar,video)<0)fatal("MP4_PARAMETERS");
    if(audio) {
        recording_audio_priming_us=av_rescale_q(audio->initial_padding,audio->time_base,AV_TIME_BASE_Q);
        stream=avformat_new_stream(recording,NULL);if(!stream)fatal("MEMORY");
        recording_audio=stream->index;stream->time_base=audio->time_base;
        if(avcodec_parameters_from_context(stream->codecpar,audio)<0)fatal("MP4_PARAMETERS");
    }
    AVDictionary *options=NULL;
    if(av_dict_set(&options,"movflags","delay_moov+default_base_moof+frag_custom+skip_trailer",0)<0 ||
       av_dict_set(&options,"use_editlist","1",0)<0 || av_dict_set(&options,"video_track_timescale","90000",0)<0)fatal("MEMORY");
    recording->avoid_negative_ts=AVFMT_AVOID_NEG_TS_DISABLED;
    if(avformat_write_header(recording,&options)<0)fatal("MP4_HEADER");
    av_dict_free(&options);avio_flush(recording_io);
    if(recording_io->error || recording_size>BLINK_MP4_INIT_MAX)fatal("MP4_HEADER");
}
static void recording_packet_internal(AVCodecContext *encoder,AVPacket *packet,uint32_t type,int incoming) {
    int video=type==BLINK_VIDEO_PACKET;
    if(!recording || (!video && recording_audio<0) || packet->pts==AV_NOPTS_VALUE || packet->dts==AV_NOPTS_VALUE)fatal("MP4_PACKET");
    int64_t pts=av_rescale_q(packet->pts,encoder->time_base,AV_TIME_BASE_Q);
    int64_t duration=av_rescale_q(packet->duration,encoder->time_base,AV_TIME_BASE_Q);
    if(video && duration<=0)duration=av_rescale(1,1000000,config[2]);
    if(duration<=0 || duration>1000000 || pts>INT64_MAX-duration)fatal("MP4_TIMESTAMP");
    if(video) {
        if(recording_video_target_end==AV_NOPTS_VALUE || pts+duration>recording_video_target_end)recording_video_target_end=pts+duration;
        if(recording_first_video==AV_NOPTS_VALUE)recording_first_video=pts;
        if(incoming) {
            if(recording_last_video!=AV_NOPTS_VALUE && (pts<=recording_last_video || pts-recording_last_video>(int64_t)config[15]*1000))fatal("VIDEO_DISCONTINUITY");
            recording_last_video=pts;
        }
        if(recording_waiting_audio) { recording_hold_video(packet,pts);return; }
        /* Scene cuts may introduce extra keyframes. Keep whole short GOPs together
         * instead of producing one-frame fragments with empty audio traf boxes. */
        if((packet->flags&AV_PKT_FLAG_KEY) && recording_has_video && pts-recording_start>=1000000) {
            if(recording_audio>=0 && (recording_first_audio==AV_NOPTS_VALUE || recording_end-recording_audio_end>recording_audio_tolerance)) {
                recording_waiting_audio=1;recording_hold_video(packet,pts);return;
            }
            recording_flush();
        }
        if(!recording_has_video) {
            if(!(packet->flags&AV_PKT_FLAG_KEY))fatal("MP4_KEYFRAME");
            recording_start=pts;recording_end=pts+duration;recording_has_video=1;
        }
    }
    if(!video) {
        if(recording_first_audio==AV_NOPTS_VALUE) {
            recording_first_audio=pts+av_rescale_q(encoder->initial_padding,encoder->time_base,AV_TIME_BASE_Q);
            recording_audio_tolerance=av_rescale_q(2LL*encoder->frame_size,encoder->time_base,AV_TIME_BASE_Q)+2000;
        }
        if(pts+duration>recording_audio_end)recording_audio_end=pts+duration;
    }
    if(recording_first_audio!=AV_NOPTS_VALUE && recording_first_video!=AV_NOPTS_VALUE &&
       (recording_first_audio-recording_first_video>recording_audio_tolerance ||
        recording_first_video-recording_first_audio>recording_audio_tolerance))fatal("AUDIO_DISCONTINUITY");
    if(video && recording_has_video && pts+duration>recording_end)recording_end=pts+duration;
    if(recording_all_start==AV_NOPTS_VALUE || pts<recording_all_start)recording_all_start=pts;
    if(pts+duration>recording_all_end)recording_all_end=pts+duration;
    if(recording_media_start==AV_NOPTS_VALUE) { recording_media_start=pts;recording_media_end=pts+duration; }
    if(pts<recording_media_start)recording_media_start=pts;
    if(pts+duration>recording_media_end)recording_media_end=pts+duration;
    if(!video)recording_has_audio=1;
    int stream=video?recording_video:recording_audio;
    /* Bound the muxer's internal mdat allocation before accepting each packet;
     * reserve header space as well as bounding the custom AVIO collector. */
    if((size_t)packet->size>BLINK_MP4_FRAGMENT_MAX-BLINK_MP4_INIT_MAX-recording_packet_bytes)fatal("FRAGMENT_LIMIT");
    recording_packet_bytes+=(size_t)packet->size;
    if(video && packet->duration<=0)packet->duration=av_rescale_q(duration,AV_TIME_BASE_Q,encoder->time_base);
    av_packet_rescale_ts(packet,encoder->time_base,recording->streams[stream]->time_base);packet->stream_index=stream;
    if(av_write_frame(recording,packet)<0)fatal("MP4_MUX");
    if(!video && recording_waiting_audio && recording_end-recording_audio_end<=recording_audio_tolerance) {
        recording_flush();recording_replay_video();
    }
}
static void recording_packet(AVCodecContext *encoder,AVPacket *packet,uint32_t type) {
    if(config[16] && type==BLINK_VIDEO_PACKET) {
        if(recording_finite_video) {
            uint64_t duration=(uint64_t)packet->pts-(uint64_t)recording_finite_video->pts;
            if(packet->pts<=recording_finite_video->pts || duration>(uint64_t)config[15]*1000)fatal("VIDEO_DISCONTINUITY");
            recording_finite_video->duration=(int64_t)duration;
            recording_packet_internal(encoder,recording_finite_video,type,1);
            av_packet_free(&recording_finite_video);
        }
        recording_finite_video=av_packet_clone(packet);if(!recording_finite_video)fatal("MEMORY");
        return;
    }
    recording_packet_internal(encoder,packet,type,1);
}
static void recording_finish_video(void) {
    if(!recording_finite_video)fatal("MP4_EMPTY");
    uint64_t duration=(uint64_t)finite_source_video_end-(uint64_t)recording_finite_video->pts;
    if(finite_source_video_end<=recording_finite_video->pts || duration>1000000)fatal("VIDEO_TIMESTAMP");
    recording_finite_video->duration=av_rescale_q((int64_t)duration,AV_TIME_BASE_Q,recording_video_encoder->time_base);
    recording_packet_internal(recording_video_encoder,recording_finite_video,BLINK_VIDEO_PACKET,1);
    av_packet_free(&recording_finite_video);
}
static void recording_finish(void) {
    if(recording_pending_count)fatal(recording_first_audio==AV_NOPTS_VALUE?"AUDIO_MISSING":"AUDIO_DISCONTINUITY");
    if(recording_audio>=0) {
        if(recording_first_audio==AV_NOPTS_VALUE || recording_first_video==AV_NOPTS_VALUE ||
           recording_first_audio-recording_first_video>recording_audio_tolerance ||
           recording_first_video-recording_first_audio>recording_audio_tolerance ||
           recording_end-recording_audio_end>recording_audio_tolerance ||
           recording_audio_end-recording_end>recording_audio_tolerance)fatal("AUDIO_DISCONTINUITY");
    }
    recording_flush();
    if(!recording_sequence)fatal("MP4_EMPTY");
    if(av_write_trailer(recording)<0)fatal("MP4_MUX");
    avio_flush(recording_io);
    if(recording_size || recording_io->error)fatal("MP4_TRAILER");
    avformat_free_context(recording);av_freep(&recording_io->buffer);avio_context_free(&recording_io);av_freep(&recording_data);
}
