/* SPDX-License-Identifier: GPL-3.0-or-later
 * libSRTP-only packet protection and constrained external executable launcher.
 * No codec libraries, provider URLs, output sockets or media parsing. */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include "protocol.h"
#ifdef _WIN32
#include <windows.h>
#include <io.h>
#include <fcntl.h>
#include <wchar.h>
/* MinGW-w64 exposes the attribute number but omits this Windows SDK macro. */
#ifndef PROC_THREAD_ATTRIBUTE_JOB_LIST
#define PROC_THREAD_ATTRIBUTE_JOB_LIST ProcThreadAttributeValue(13,FALSE,TRUE,FALSE)
#endif
#else
#include <sys/resource.h>
#include <unistd.h>
#endif
static void fatal(const char *code) { fprintf(stderr,"BLINK_PROTECTION_%s\n",code);fflush(stderr);_Exit(2); }
static uint32_t u32(const uint8_t *p) { return ((uint32_t)p[0]<<24)|((uint32_t)p[1]<<16)|((uint32_t)p[2]<<8)|p[3]; }
static void put32(uint8_t *p,uint32_t n) { p[0]=n>>24;p[1]=n>>16;p[2]=n>>8;p[3]=n; }
static void output(uint32_t type,const uint8_t *data,uint32_t length) {
    uint8_t header[12];memcpy(header,BLINK_OUTPUT_MAGIC,4);put32(header+4,type);put32(header+8,length);
    if(length>2070 || fwrite(header,1,12,stdout)!=12 || fwrite(data,1,length,stdout)!=length || fflush(stdout))fatal("OUTPUT");
}
#include "protection.inc"
static void suppress_crashes(void) {
#ifdef _WIN32
    const UINT mode=SEM_FAILCRITICALERRORS|SEM_NOGPFAULTERRORBOX;SetErrorMode(mode);
    if((GetErrorMode()&mode)!=mode)fatal("ERROR_MODE");
    if(_setmode(_fileno(stdin),_O_BINARY)<0 || _setmode(_fileno(stdout),_O_BINARY)<0)fatal("IO_SETUP");
#else
    struct rlimit core={0,0},files={0,0},cpu={300,300};
    if(setrlimit(RLIMIT_CORE,&core) || getrlimit(RLIMIT_CORE,&core) || core.rlim_cur || core.rlim_max)fatal("CORE_LIMIT");
    if(setrlimit(RLIMIT_FSIZE,&files) || setrlimit(RLIMIT_CPU,&cpu))fatal("RESOURCE_LIMIT");
    signal(SIGPIPE,SIG_IGN);
#endif
}
static int run_protection(void) {
    if(srtp_get_version()!=0x02080001u || srtp_init()!=srtp_err_status_ok)fatal("SRTP_INIT");
    uint8_t header[12],payload[8+BLINK_PROTECTION_PLAINTEXT_MAX];
    for(;;) {
        size_t count=fread(header,1,sizeof(header),stdin);
        if(!count && feof(stdin))break;
        if(count!=sizeof(header) || memcmp(header,BLINK_INPUT_MAGIC,4))fatal("FRAMING");
        uint32_t type=u32(header+4),length=u32(header+8);
        if(type==BLINK_STOP) { if(length)fatal("FRAMING");break; }
        if((type!=BLINK_PROTECTION_INIT && type!=BLINK_PROTECT_RTP && type!=BLINK_PROTECT_RTCP) || length>sizeof(payload))fatal("FRAMING");
        if(fread(payload,1,length,stdin)!=length)fatal("TRUNCATED");
        protect_message(type,payload,length);erase_bytes(payload,sizeof(payload));
    }
    close_protection();srtp_shutdown();erase_bytes(payload,sizeof(payload));return 0;
}
#ifdef _WIN32
/* Keep the supervisor alive: killing its process closes the job and therefore
 * kills FFmpeg and descendants. Assign the job during creation so termination
 * cannot orphan a suspended child between creation and job admission.
 * CRT descriptor inheritance preserves a regular fd0 and optional pipe3/4/5. */
static void command_character(wchar_t *target,size_t *used,wchar_t character) {
    if(*used>=32767)fatal("ARGUMENTS");
    if(target)target[*used]=character;
    (*used)++;
}
/* Count and write the same quoted UTF-16 units, including separators and NUL.
 * Bounded single-unit admission avoids overflow and worst-case overestimates. */
static size_t quote_command(int argc,wchar_t **argv,wchar_t *target) {
    size_t used=0;
    for(int i=2;i<argc;i++) {
        if(i>2)command_character(target,&used,L' ');
        command_character(target,&used,L'"');size_t slashes=0;
        for(const wchar_t *s=argv[i];;s++) {
            if(*s==L'\\') { if(slashes>=32767)fatal("ARGUMENTS");slashes++;continue; }
            for(size_t n=0;n<slashes;n++) {
                command_character(target,&used,L'\\');
                if(*s==L'"' || !*s)command_character(target,&used,L'\\');
            }
            slashes=0;if(!*s)break;
            if(*s==L'"')command_character(target,&used,L'\\');
            command_character(target,&used,*s);
        }
        command_character(target,&used,L'"');
    }
    command_character(target,&used,L'\0');return used;
}
static void ignore_invalid(const wchar_t *a,const wchar_t *b,const wchar_t *c,unsigned int d,uintptr_t e) { (void)a;(void)b;(void)c;(void)d;(void)e; }
static int execute_external(int argc,wchar_t **argv) {
    const wchar_t *executable=argv[2];
    if(!((executable[0] && executable[1]==L':' && (executable[2]==L'\\' || executable[2]==L'/')) || (executable[0]==L'\\' && executable[1]==L'\\')))fatal("ARGUMENTS");
    size_t capacity=quote_command(argc,argv,NULL);
    wchar_t *command=calloc(capacity,sizeof(wchar_t));if(!command)fatal("MEMORY");
    if(quote_command(argc,argv,command)!=capacity)fatal("ARGUMENTS");
    _set_invalid_parameter_handler(ignore_invalid);
    int maximum=_getmaxstdio(),count=0;for(int fd=0;fd<maximum;fd++)if(_get_osfhandle(fd)>=0)count=fd+1;
    size_t bytes=sizeof(int)+(size_t)count*(sizeof(char)+sizeof(intptr_t));if(bytes>65535)fatal("IO_SETUP");
    unsigned char *table=calloc(1,bytes);if(!table)fatal("MEMORY");memcpy(table,&count,sizeof(int));
    for(int fd=0;fd<count;fd++) {
        intptr_t raw=_get_osfhandle(fd);HANDLE handle=(HANDLE)raw;unsigned char flags=0;
        if(raw>=0) { if(!SetHandleInformation(handle,HANDLE_FLAG_INHERIT,HANDLE_FLAG_INHERIT))fatal("IO_SETUP");
            DWORD kind=GetFileType(handle);flags=1|(kind==FILE_TYPE_PIPE?8:kind==FILE_TYPE_CHAR?64:0); }
        table[sizeof(int)+fd]=flags;memcpy(table+sizeof(int)+count+(size_t)fd*sizeof(raw),&raw,sizeof(raw));
    }
    HANDLE job=CreateJobObjectW(NULL,NULL);if(!job)fatal("JOB");
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits;memset(&limits,0,sizeof(limits));
    limits.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE|JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION;
    if(!SetInformationJobObject(job,JobObjectExtendedLimitInformation,&limits,sizeof(limits)))fatal("JOB");
    SIZE_T attribute_bytes=0;
    if(InitializeProcThreadAttributeList(NULL,1,0,&attribute_bytes) || GetLastError()!=ERROR_INSUFFICIENT_BUFFER || !attribute_bytes)fatal("JOB");
    LPPROC_THREAD_ATTRIBUTE_LIST attributes=calloc(1,attribute_bytes);if(!attributes)fatal("MEMORY");
    if(!InitializeProcThreadAttributeList(attributes,1,0,&attribute_bytes) ||
       !UpdateProcThreadAttribute(attributes,0,PROC_THREAD_ATTRIBUTE_JOB_LIST,&job,sizeof(job),NULL,NULL))fatal("JOB");
    STARTUPINFOEXW info;PROCESS_INFORMATION child;memset(&info,0,sizeof(info));memset(&child,0,sizeof(child));info.StartupInfo.cb=sizeof(info);
    info.StartupInfo.dwFlags=STARTF_USESTDHANDLES;info.StartupInfo.hStdInput=GetStdHandle(STD_INPUT_HANDLE);info.StartupInfo.hStdOutput=GetStdHandle(STD_OUTPUT_HANDLE);info.StartupInfo.hStdError=GetStdHandle(STD_ERROR_HANDLE);
    info.StartupInfo.cbReserved2=(WORD)bytes;info.StartupInfo.lpReserved2=table;info.lpAttributeList=attributes;
    BOOL created=CreateProcessW(executable,command,NULL,NULL,TRUE,CREATE_SUSPENDED|CREATE_NO_WINDOW|EXTENDED_STARTUPINFO_PRESENT,NULL,NULL,&info.StartupInfo,&child);
    DeleteProcThreadAttributeList(attributes);free(attributes);if(!created)fatal("EXEC");
    if(ResumeThread(child.hThread)==(DWORD)-1) { TerminateProcess(child.hProcess,2);fatal("EXEC"); }
    free(command);free(table);CloseHandle(child.hThread);
    if(WaitForSingleObject(child.hProcess,INFINITE)!=WAIT_OBJECT_0)fatal("EXEC");
    DWORD code=2;
    if(!GetExitCodeProcess(child.hProcess,&code))fatal("EXEC");
    CloseHandle(child.hProcess);CloseHandle(job);return (int)code;
}
int wmain(int argc,wchar_t **argv) {
    suppress_crashes();if(argc>=3 && !wcscmp(argv[1],L"--exec"))return execute_external(argc,argv);
    if(argc!=1)fatal("ARGUMENTS");
    return run_protection();
}
#else
int main(int argc,char **argv) {
    suppress_crashes();
    if(argc>=3 && !strcmp(argv[1],"--exec")) { if(argv[2][0]!='/')fatal("ARGUMENTS");execv(argv[2],argv+2);fatal("EXEC"); }
    if(argc!=1)fatal("ARGUMENTS");
    return run_protection();
}
#endif
