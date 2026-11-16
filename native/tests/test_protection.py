"""libSRTP IPC, crash policy, external execution and ownership; no camera traffic."""
import os
from pathlib import Path
import signal
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

    def test_external_exec_suppresses_core_dumps(self):
        if os.name=='nt':
            return  # Windows error mode/job lifecycle is exercised on its native runner.
        script = 'import resource;assert resource.getrlimit(resource.RLIMIT_CORE)==(0,0);print("core disabled")'
        result=subprocess.run([WORKER,'--exec',sys.executable,'-c',script],capture_output=True,check=True,timeout=5)
        self.assertEqual(result.stdout,b'core disabled\n')

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
