/* SPDX-License-Identifier: GPL-3.0-or-later */
typedef struct Output { struct Output *next; uint32_t length; int64_t queued; uint8_t data[]; } Output;
static Mutex output_mutex;
static Condition output_changed;
static Output *output_first,*output_last;
static size_t output_bytes;
static int64_t writing_since;
static void output(uint32_t type,const uint8_t *data,uint32_t length) {
    if(length>CAPACITY-12)fatal("OUTPUT_LIMIT");
    Output *o=malloc(sizeof(*o)+12+length);if(!o)fatal("MEMORY");
    o->next=NULL;o->length=12+length;o->queued=av_gettime_relative();
    memcpy(o->data,BLINK_OUTPUT_MAGIC,4);put32(o->data+4,type);put32(o->data+8,length);if(length)memcpy(o->data+12,data,length);
    LOCK(&output_mutex);
    if(output_bytes+o->length>CAPACITY)fatal("OUTPUT_LIMIT");
    output_bytes+=o->length;if(output_last)output_last->next=o;else output_first=o;output_last=o;
    WAKE(&output_changed);UNLOCK(&output_mutex);
}
static void write_output(void) {
    for(;;) {
        LOCK(&output_mutex);while(!output_first) { WAIT(&output_changed,&output_mutex); }
        Output *o=output_first;output_first=o->next;if(!output_first)output_last=NULL;writing_since=o->queued;UNLOCK(&output_mutex);
        if(fwrite(o->data,1,o->length,stdout)!=o->length || fflush(stdout))fatal("OUTPUT");
        LOCK(&output_mutex);output_bytes-=o->length;writing_since=0;WAKE(&output_changed);UNLOCK(&output_mutex);free(o);
    }
}
#ifdef _WIN32
static DWORD WINAPI writer(void *p) { (void)p;write_output();return 0; }
#else
static void *writer(void *p) { (void)p;write_output();return NULL; }
#endif
static void start_output(void) {
#ifdef _WIN32
    InitializeCriticalSection(&output_mutex);InitializeConditionVariable(&output_changed);
    HANDLE t=CreateThread(NULL,0,writer,NULL,0,NULL);if(!t)fatal("THREAD");CloseHandle(t);
#else
    pthread_mutex_init(&output_mutex,NULL);pthread_cond_init(&output_changed,NULL);
    pthread_t t;if(pthread_create(&t,NULL,writer,NULL))fatal("THREAD");pthread_detach(t);
#endif
}
static void check_output_deadline(void) {
    LOCK(&output_mutex);int64_t oldest=writing_since?writing_since:output_first?output_first->queued:0;UNLOCK(&output_mutex);
    if(oldest && av_gettime_relative()-oldest>2000000)fatal("OUTPUT_TIMEOUT");
}
static void drain_output(void) {
    LOCK(&output_mutex);while(output_bytes)if(!WAIT(&output_changed,&output_mutex))fatal("OUTPUT_TIMEOUT");UNLOCK(&output_mutex);
}
