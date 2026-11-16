"""libSRTP IPC, crash policy, external execution and ownership; no camera traffic."""
import os
import json
from pathlib import Path
import signal
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
SUFFIX = '.exe' if os.name == 'nt' else ''
WORKER = ROOT / 'build' / ('blink-protection-worker' + SUFFIX)
CHECKER = ROOT / 'build' / ('check-protection' + SUFFIX)

def frame(kind, payload=b''):
    return b'BMI1' + struct.pack('>II', kind, len(payload)) + payload

class ProtectionTests(unittest.TestCase):
    def test_actual_protection_independent_receiver_and_forgery_rejection(self):
        init = struct.pack('>III', 1, 7, 1) + bytes([9])*16 + bytes([8])*14
        packet = bytes.fromhex('806000010000000000000007')
        source = frame(10, init) + frame(11, struct.pack('>II', 1, 1)+packet) + frame(4)
        result = subprocess.run([WORKER], input=source, capture_output=True, check=True, timeout=5)
        self.assertEqual(result.stderr, b'')
        self.assertEqual(result.stdout[:16], b'BMO1'+struct.pack('>III',10,4,1))
        self.assertEqual(result.stdout[16:28], b'BMO1'+struct.pack('>II',11,30))
        self.assertEqual(result.stdout[28:36], struct.pack('>II',1,1))
        checked = subprocess.run([CHECKER], input=result.stdout[36:], capture_output=True, check=True, timeout=5)
        self.assertIn(b'forged packet refused',checked.stdout)

    def test_framed_receiver_preserves_binary_rtp_header_and_payload(self):
        init = struct.pack('>III', 1, 7, 1) + bytes([9])*16 + bytes([8])*14
        # LF in the RTP sequence/timestamp and payload must never become CRLF.
        packet = bytes.fromhex('8060000a0a00000a00000007650a0d0a001aff')
        source = frame(10, init) + frame(11, struct.pack('>II', 1, 1)+packet) + frame(4)
        protected = subprocess.run([WORKER], input=source, capture_output=True, check=True, timeout=5)
        self.assertEqual(protected.stderr, b'')
        self.assertEqual(protected.stdout[:16], b'BMO1'+struct.pack('>III', 10, 4, 1))
        self.assertEqual(protected.stdout[16:28], b'BMO1'+struct.pack('>II', 11, len(packet)+18))
        self.assertEqual(protected.stdout[28:36], struct.pack('>II', 1, 1))
        encrypted = protected.stdout[36:]
        receiver_input = b'BMR1'+struct.pack('>II', 10, len(init))+init
        receiver_input += b'BMR1'+struct.pack('>III', 11, len(encrypted)+4, 1)+encrypted
        receiver_input += b'BMR1'+struct.pack('>II', 4, 0)
        checked = subprocess.run([CHECKER, '--framed'], input=receiver_input,
                                 capture_output=True, check=True, timeout=5)
        self.assertEqual(checked.stderr, b'')
        self.assertEqual(checked.stdout, b'BMR1'+struct.pack('>III', 11, len(packet)+4, 1)+packet)
        if os.name=='nt':
            with tempfile.TemporaryDirectory() as directory:
                nested=Path(directory)/('long executable path with spaces '+ 'a'*40)/('nested path '+ 'b'*60)
                nested.mkdir(parents=True)
                executable=nested/'independent receiver.exe';shutil.copy2(CHECKER,executable)
                launched=subprocess.run([WORKER,'--exec',executable,'--framed'],input=receiver_input,
                                        capture_output=True,check=True,timeout=5)
                self.assertEqual(launched.stderr,b'')
                self.assertEqual(launched.stdout,checked.stdout)

    def test_only_protection_messages_are_admitted(self):
        for data in [frame(1),frame(2,b'private-source'),frame(3),frame(4,b'x'),b'wrong-header']:
            with self.subTest(data=data[:12]):
                result = subprocess.run([WORKER], input=data, capture_output=True, timeout=5)
                self.assertNotEqual(result.returncode,0)
                self.assertNotIn(b'private-source',result.stderr)

    def test_external_exec_preserves_regular_stdin(self):
        # Python is an independent stand-in for a user-installed executable.
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)/'source';source.write_bytes(b'seekable input')
            script = Path(directory)/'check.py';script.write_text('import os,sys\nassert os.lseek(0,0,2)==14\nos.lseek(0,0,0)\nsys.stdout.buffer.write(os.read(0,14))\n')
            with source.open('rb') as stream:
                result = subprocess.run([WORKER,'--exec',sys.executable,script],stdin=stream,capture_output=True,check=True,timeout=5)
            self.assertEqual(result.stdout,b'seekable input')

    def test_external_exec_suppresses_core_dumps_and_enforces_resource_bounds(self):
        if os.name=='nt':
            return  # Windows error mode/job lifecycle is exercised on its native runner.
        script = ('import resource;'
                  'assert resource.getrlimit(resource.RLIMIT_CORE)==(0,0);'
                  'assert resource.getrlimit(resource.RLIMIT_FSIZE)==(0,0);'
                  'assert resource.getrlimit(resource.RLIMIT_CPU)==(300,300);'
                  'print("core disabled; file and CPU bounds enforced")')
        result=subprocess.run([WORKER,'--exec',sys.executable,'-c',script],capture_output=True,check=True,timeout=5)
        self.assertEqual(result.stdout,b'core disabled; file and CPU bounds enforced\n')

    @unittest.skipUnless(os.name=='nt','Windows UTF-16 command line contract')
    def test_windows_external_exec_preserves_long_and_quoted_arguments(self):
        with tempfile.TemporaryDirectory() as directory:
            script=Path(directory)/'argument receiver \u2603.py'
            script.write_text('import json,sys;sys.stdout.write(json.dumps(sys.argv[1:]))',encoding='utf-8')
            arguments=['','plain','space and\ttab','quoted"value','\\'*3+'"after','trailing'+'\\'*7,'\u2603\U0001f600',
                       'x'*17000+' space "quoted" '+'\\'*8+'"'+'\\'*7+'tail\\']
            result=subprocess.run([WORKER,'--exec',sys.executable,script,*arguments],
                                  capture_output=True,check=True,timeout=5)
            self.assertEqual(result.stderr,b'')
            self.assertEqual(json.loads(result.stdout),arguments)

    @unittest.skipUnless(os.name=='nt','Windows UTF-16 command line contract')
    def test_windows_external_exec_enforces_actual_command_limit_including_nul(self):
        with tempfile.TemporaryDirectory() as directory:
            script=Path(directory)/'arguments.py'
            script.write_text('import json,sys;sys.stdout.write(json.dumps(sys.argv[1:]))',encoding='utf-8')
            # Plain arguments save enough parent-side quoting to deliver both boundary
            # cases to the helper without first exceeding CreateProcessW's own limit.
            command=[sys.executable,str(script),*(['x']*512),'']
            base=sum(len(value.encode('utf-16-le'))//2+2 for value in command)+len(command)-1+1
            for units in (32767,32768):
                with self.subTest(utf16_units_including_nul=units):
                    command[-1]='x'*(units-base)
                    parent=[str(WORKER),'--exec',*command]
                    self.assertLessEqual(len(subprocess.list2cmdline(parent).encode('utf-16-le'))//2+1,32767)
                    result=subprocess.run(parent,capture_output=True,timeout=5)
                    if units==32767:
                        self.assertEqual(result.returncode,0,result.stderr)
                        self.assertEqual(json.loads(result.stdout),command[2:])
                    else:
                        self.assertEqual(result.returncode,2)
                        self.assertEqual(result.stdout,b'')
                        self.assertEqual(result.stderr.splitlines(),[b'BLINK_PROTECTION_ARGUMENTS'])

    @unittest.skipUnless(os.name=='nt','Windows atomic child job admission')
    def test_windows_cancellation_at_child_creation_closes_child_and_pipes(self):
        import ctypes
        from ctypes import wintypes

        class ExceptionRecord(ctypes.Structure):
            _fields_=[('code',wintypes.DWORD),('flags',wintypes.DWORD),('record',ctypes.c_void_p),
                      ('address',ctypes.c_void_p),('count',wintypes.DWORD),('parameters',ctypes.c_size_t*15)]
        class ExceptionInfo(ctypes.Structure):
            _fields_=[('record',ExceptionRecord),('first_chance',wintypes.DWORD)]
        class CreateInfo(ctypes.Structure):
            _fields_=[('file',wintypes.HANDLE),('process',wintypes.HANDLE),('thread',wintypes.HANDLE),
                      ('base',ctypes.c_void_p),('offset',wintypes.DWORD),('size',wintypes.DWORD),
                      ('tls',ctypes.c_void_p),('start',ctypes.c_void_p),('name',ctypes.c_void_p),('unicode',wintypes.WORD)]
        class DllInfo(ctypes.Structure):
            _fields_=[('file',wintypes.HANDLE),('base',ctypes.c_void_p),('offset',wintypes.DWORD),
                      ('size',wintypes.DWORD),('name',ctypes.c_void_p),('unicode',wintypes.WORD)]
        class EventInfo(ctypes.Union):
            _fields_=[('exception',ExceptionInfo),('create',CreateInfo),('dll',DllInfo)]
        class DebugEvent(ctypes.Structure):
            _fields_=[('kind',wintypes.DWORD),('pid',wintypes.DWORD),('tid',wintypes.DWORD),('info',EventInfo)]

        kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        kernel.WaitForDebugEvent.argtypes=[ctypes.POINTER(DebugEvent),wintypes.DWORD]
        kernel.WaitForDebugEvent.restype=wintypes.BOOL
        kernel.ContinueDebugEvent.argtypes=[wintypes.DWORD,wintypes.DWORD,wintypes.DWORD]
        kernel.ContinueDebugEvent.restype=wintypes.BOOL
        kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
        kernel.OpenProcess.restype=wintypes.HANDLE
        kernel.TerminateProcess.argtypes=[wintypes.HANDLE,wintypes.UINT]
        kernel.TerminateProcess.restype=wintypes.BOOL
        kernel.WaitForSingleObject.argtypes=[wintypes.HANDLE,wintypes.DWORD]
        kernel.WaitForSingleObject.restype=wintypes.DWORD
        kernel.CloseHandle.argtypes=[wintypes.HANDLE]
        kernel.CloseHandle.restype=wintypes.BOOL

        # DEBUG_PROCESS reports descendants too. The child's create event blocks
        # the supervisor's CreateProcessW return, before any assign/resume code.
        # No test hook or timing race is needed in the production executable.
        process=subprocess.Popen([WORKER,'--exec',sys.executable,'-c','raise SystemExit("child ran")'],
                                 stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                                 creationflags=0x00000001)  # DEBUG_PROCESS
        child=None;child_handle=None;exited=set()
        def advance(cleanup=False):
            nonlocal child,child_handle
            event=DebugEvent()
            if not kernel.WaitForDebugEvent(ctypes.byref(event),100):
                if ctypes.get_last_error()!=121:  # ERROR_SEM_TIMEOUT
                    raise ctypes.WinError(ctypes.get_last_error())
                return
            status=0x00010002  # DBG_CONTINUE
            try:
                if event.kind==3:  # CREATE_PROCESS_DEBUG_EVENT
                    if event.info.create.file: kernel.CloseHandle(event.info.create.file)
                    if event.pid!=process.pid:
                        self.assertIsNone(child,'Only one owned external child is expected')
                        child=event.pid
                        # Separate observer handle survives the debugger's automatic
                        # process/thread handle closure on EXIT_PROCESS_DEBUG_EVENT.
                        child_handle=kernel.OpenProcess(0x00100001,False,child)
                        self.assertTrue(child_handle)
                        process.terminate()
                        if cleanup: kernel.TerminateProcess(child_handle,2)
                elif event.kind==5: exited.add(event.pid)  # EXIT_PROCESS_DEBUG_EVENT
                elif event.kind==6 and event.info.dll.file: kernel.CloseHandle(event.info.dll.file)
                elif event.kind==1 and event.info.exception.record.code!=0x80000003:
                    status=0x80010001  # DBG_EXCEPTION_NOT_HANDLED, except initial breakpoint.
            finally:
                self.assertTrue(kernel.ContinueDebugEvent(event.pid,event.tid,status))
        try:
            deadline=time.monotonic()+10
            while time.monotonic()<deadline and (child is None or not {process.pid,child}<=exited): advance()
            self.assertIsNotNone(child,'The actual external child must reach its creation boundary')
            self.assertIn(process.pid,exited,'Cancelled supervisor must exit')
            self.assertIn(child,exited,'Creation-boundary cancellation must terminate its suspended child')
            self.assertEqual(kernel.WaitForSingleObject(child_handle,0),0)
            stdout,stderr=process.communicate(timeout=5)
            self.assertEqual(stdout,b'');self.assertEqual(stderr,b'')
        finally:
            if process.poll() is None:
                try: process.kill()
                except OSError: pass  # An exit debug event may still require continuation.
            if child_handle and kernel.WaitForSingleObject(child_handle,0)!=0: kernel.TerminateProcess(child_handle,2)
            deadline=time.monotonic()+5
            while time.monotonic()<deadline and (process.poll() is None or (child_handle and kernel.WaitForSingleObject(child_handle,0)!=0)):
                advance(cleanup=True)
            if child_handle: kernel.CloseHandle(child_handle)
            process.wait(timeout=5);process.stdout.close();process.stderr.close()

    def test_owner_cancellation_does_not_leave_external_process(self):
        script='import os,time;print(os.getpid(),flush=True);time.sleep(60)'
        process=subprocess.Popen([WORKER,'--exec',sys.executable,'-c',script],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        child=int(process.stdout.readline())
        handle=None
        if os.name=='nt':
            import ctypes
            kernel=ctypes.WinDLL('kernel32',use_last_error=True)
            kernel.OpenProcess.restype=ctypes.c_void_p
            handle=kernel.OpenProcess(0x00100000,False,child)  # SYNCHRONIZE, no mutation rights.
            self.assertTrue(handle)
        try:
            process.terminate();process.wait(timeout=5)
            if os.name!='nt':
                with self.assertRaises(ProcessLookupError):os.kill(child,0)
            else:
                self.assertEqual(kernel.WaitForSingleObject(ctypes.c_void_p(handle),5000),0)
        finally:
            if process.poll() is None:process.kill();process.wait(timeout=5)
            if handle:kernel.CloseHandle(ctypes.c_void_p(handle))
            process.stdout.close();process.stderr.close()

if __name__=='__main__':unittest.main()
