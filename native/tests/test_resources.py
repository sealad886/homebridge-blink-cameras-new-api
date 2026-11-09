"""Per-worker high-water observations; no general resource-budget assertion."""
import hashlib
import json
import os
import platform
import subprocess
import sys
import unittest
from datetime import datetime, timezone

from test_worker import ROOT, binary, config, frame, messages


class MeasuredProcess(subprocess.Popen):
    """Test-only CPython 3.12+ hook: reap this child once, retaining wait4 usage.

    Popen._wait calls _try_wait while holding its waitpid lock. Unlike cumulative
    RUSAGE_CHILDREN, wait4 attributes its high-water mark to this worker alone.
    https://docs.python.org/3/library/os.html#os.wait4
    https://github.com/python/cpython/blob/3.12/Lib/subprocess.py
    Linux ru_maxrss is KiB; Darwin copies Mach resident_size_max in bytes.
    https://man7.org/linux/man-pages/man2/getrusage.2.html
    https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_resource.c
    """
    peak_rss_bytes=None

    def _try_wait(self,flags):
        pid,status,usage=os.wait4(self.pid,flags)
        if pid:
            self.peak_rss_bytes=usage.ru_maxrss*(1 if sys.platform=='darwin' else 1024)
        return pid,status


def windows_peak_working_set(process):
    """Query only the owned handle while its CPython Popen object retains it.

    GetProcessMemoryInfo/PROCESS_MEMORY_COUNTERS.PeakWorkingSetSize returns bytes.
    Windows CI must execute this query successfully; no sampled/estimated fallback.
    https://learn.microsoft.com/windows/win32/api/psapi/nf-psapi-getprocessmemoryinfo
    https://learn.microsoft.com/windows/win32/api/psapi/ns-psapi-process_memory_counters
    """
    import ctypes
    from ctypes import wintypes
    class Counters(ctypes.Structure):
        _fields_=[('cb',wintypes.DWORD),('PageFaultCount',wintypes.DWORD)]+[
            (name,ctypes.c_size_t) for name in ('PeakWorkingSetSize','WorkingSetSize',
                'QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage',
                'QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage')]
    counters=Counters();counters.cb=ctypes.sizeof(counters)
    query=ctypes.WinDLL('psapi',use_last_error=True).GetProcessMemoryInfo
    query.argtypes=[wintypes.HANDLE,ctypes.POINTER(Counters),wintypes.DWORD]
    query.restype=wintypes.BOOL
    if not query(wintypes.HANDLE(int(process._handle)),ctypes.byref(counters),counters.cb):
        raise ctypes.WinError(ctypes.get_last_error())
    return counters.PeakWorkingSetSize


def measured_worker(data):
    with MeasuredProcess([str(binary('blink-codec-worker'))],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE) as process:
        try:output,errors=process.communicate(data,timeout=30)
        except subprocess.TimeoutExpired:
            process.kill();process.communicate()
            raise
        peak=windows_peak_working_set(process) if os.name=='nt' else process.peak_rss_bytes
        result=subprocess.CompletedProcess(process.args,process.returncode,output,errors)
        result.peak_rss_bytes=peak
        return result


class ResourceTests(unittest.TestCase):
    def test_representative_maximum_geometry_with_audio_decodes_and_records_peak(self):
        observations=[]
        for width,height,inner_width,inner_height in [(4096,2048,1920,960),(2560,1440,1920,1080),(1920,1920,1080,1080)]:
            with self.subTest(width=width,height=height):
                media=subprocess.check_output([str(binary('fixture')),'audio-latm',str(width),str(height),'30','4'],timeout=30)
                data=config(width=1920,height=1080,fps=30,bitrate=8000000,max_frames=4,
                    video_profile=2,video_level=2,audio_codec=1,audio_rate=24000,
                    audio_channels=1,audio_bitrate=128000,audio_packet_ms=10)
                data+=b''.join(frame(2,media[i:i+65536]) for i in range(0,len(media),65536))+frame(3)
                result=measured_worker(data)
                self.assertEqual(result.returncode,0,result.stderr)
                source=[tuple(int.from_bytes(body[i:i+4],'big') for i in range(0,16,4)) for kind,body in messages(result.stdout) if kind==7]
                self.assertEqual(len(source),1)
                self.assertEqual(source[0][:2],(width,height))
                decoded=subprocess.run([str(binary('check-output')),'1920','1080','4',str(inner_width),str(inner_height)],input=result.stdout,capture_output=True,timeout=30)
                self.assertEqual(decoded.returncode,0,decoded.stderr)
                self.assertGreater(result.peak_rss_bytes,0)
                observations.append({'inputWidth':width,'inputHeight':height,'inputPixels':width*height,
                    'outputWidth':1920,'outputHeight':1080,'outputFps':30,'videoFramesDecoded':4,
                    'videoBitrate':8000000,'profile':2,'level':2,'preset':0,
                    'audioCodec':1,'audioRate':24000,'audioBitrate':128000,'audioPacketMs':10,
                    'peakResidentBytes':result.peak_rss_bytes,'exitCode':result.returncode})
        self.assertEqual(len(observations),3)
        machine=platform.machine().lower()
        target={'Darwin':'darwin','Linux':'linux','Windows':'win32'}[platform.system()]+'-'+{'arm64':'arm64','aarch64':'arm64','x86_64':'x64','amd64':'x64'}[machine]
        digest=lambda file:hashlib.sha256(file.read_bytes()).hexdigest()
        receipt={'schemaVersion':1,'target':target,'observedAt':datetime.now(timezone.utc).isoformat(),
            'pythonVersion':platform.python_version(),'workerSha256':digest(binary('blink-codec-worker')),
            'fixtureSha256':digest(binary('fixture')),'checkerSha256':digest(binary('check-output')),
            'method':'GetProcessMemoryInfo.PeakWorkingSetSize' if os.name=='nt' else 'wait4.ru_maxrss',
            'rawUnit':'bytes' if os.name=='nt' or sys.platform=='darwin' else 'KiB',
            'observations':observations,'scope':'Observed per-worker OS resident high-water mark for three four-video-frame flat-color synthetic workloads; independent video pixels/aspect and audible audio decode. Not a hard memory/CPU budget, long-run, concurrency, physical-device or external crash-collector proof.',
            'startupCrashGuard':'SetErrorMode required-mask readback passed before STATUS' if os.name=='nt' else 'RLIMIT_CORE zero readback passed before STATUS'}
        (ROOT/'build/resource-receipt.json').write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
