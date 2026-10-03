"""Behavioral private-pipe worker tests; no provider traffic or FFmpeg CLI."""
import os
from pathlib import Path
import struct
import shutil
import subprocess
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / 'build/blink-codec-worker'
def frame(kind, payload=b''):
    return b'BMI1' + struct.pack('!II', kind, len(payload)) + payload

def config(**changes):
    values = dict(width=16, height=16, fps=15, bitrate=100000, max_frames=10, reserved=0, audio_codec=0, audio_rate=0, audio_channels=0, audio_bitrate=0)
    values.update(changes)
    return frame(1, struct.pack('!10I', *values.values()))

def messages(data):
    result = []
    while data:
        if len(data) < 12 or data[:4] != b'BMO1':
            raise AssertionError('partial or invalid output frame')
        kind, length = struct.unpack('!II', data[4:12])
        if len(data) < 12 + length:
            raise AssertionError('partial output body')
        result.append((kind, data[12:12+length]))
        data = data[12+length:]
    return result

class WorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.media = subprocess.check_output([str(ROOT / 'build/fixture')], timeout=5)
    def run_worker(self, data):
        return subprocess.run([str(WORKER)], input=data, capture_output=True, timeout=5)
    def test_srtp_and_srtcp_published_vectors_and_correlation(self):
        # Public libsrtp srtp_driver.c srtp_validate vectors at pinned commit.
        key=bytes.fromhex('e1f97a0d3e018be0d64fa32c06de41390ec675ad498afeebb6960b3aabe6')
        init=frame(10,struct.pack('!III',1,0xcafebabe,1)+key)
        rtp=bytes.fromhex('800f1234decafbadcafebabe')+b'\xab'*16
        rtcp=bytes.fromhex('81c8000bcafebabe')+b'\xab'*16
        data=config()+init+frame(11,struct.pack('!II',123,1)+rtp)+frame(12,struct.pack('!II',124,1)+rtcp)+frame(2,self.media)+frame(3)
        result=self.run_worker(data)
        self.assertEqual(result.returncode,0,result.stderr)
        rows=messages(result.stdout)
        self.assertIn((10,struct.pack('!I',1)),rows)
        self.assertIn((11,struct.pack('!II',123,1)+bytes.fromhex('800f1234decafbadcafebabe4e55dc4ce79978d88ca4d215949d2402b78d6acc99ea179b8dbb')),rows)
        self.assertIn((12,struct.pack('!II',124,1)+bytes.fromhex('81c8000bcafebabe7128035be487b9bdbef89041f977a5a880000001993e08cd54d6c1230798')),rows)
        self.assertEqual(result.stderr,b'')
    def test_protection_requires_initialized_stream_matching_ssrc(self):
        packet=bytes.fromhex('800f1234decafbadcafebabe')+b'\xab'*16
        key=bytes(30)
        for data in [frame(11,struct.pack('!II',1,1)+packet),frame(10,struct.pack('!III',1,42,1)+key)+frame(11,struct.pack('!II',1,1)+packet),frame(10,struct.pack('!III',1,42,1)+key)*2]:
            result=self.run_worker(config()+data)
            self.assertEqual(result.returncode,2)
            self.assertNotIn(key,result.stderr)
    def test_dummy_key_not_in_process_surfaces_or_fixed_failure(self):
        key=bytes.fromhex('e1f97a0d3e018be0d64fa32c06de41390ec675ad498afeebb6960b3aabe6')
        process=subprocess.Popen([str(WORKER)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env={'PATH':os.defpath})
        try:
            process.stdin.write(config()+frame(10,struct.pack('!III',1,0xcafebabe,1)+key));process.stdin.flush()
            # Read initialization/status frames to establish that key initialization ran.
            seen=set()
            while 10 not in seen:
                header=process.stdout.read(12);self.assertEqual(header[:4],b'BMO1')
                kind,length=struct.unpack('!II',header[4:]);body=process.stdout.read(length)
                self.assertNotIn(key,body);seen.add(kind)
            ps=shutil.which('ps')
            if os.name!='nt' and ps:
                metadata=subprocess.check_output([ps,'eww','-p',str(process.pid),'-o','command='],timeout=2)
                self.assertNotIn(key.hex().encode(),metadata);self.assertNotIn(key,metadata)
                self.assertIn(b'blink-codec-worker',metadata)
            process.stdin.write(frame(99,b'synthetic-key-marker'));process.stdin.flush();process.stdin.close()
            self.assertEqual(process.wait(timeout=2),2)
            diagnostics=process.stderr.read();self.assertEqual(diagnostics,b'BLINK_WORKER_FRAMING\n')
            self.assertNotIn(key,diagnostics+process.stdout.read())
        finally:
            if process.poll() is None:process.kill();process.wait()
            if not process.stdin.closed:process.stdin.close()
            process.stdout.close();process.stderr.close()
    def test_final_packet_protection_after_codec_end_then_stop(self):
        process=subprocess.Popen([str(WORKER)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        def read_frame():
            header=process.stdout.read(12)
            self.assertEqual(header[:4],b'BMO1')
            kind,length=struct.unpack('!II',header[4:])
            body=process.stdout.read(length);self.assertEqual(len(body),length)
            return kind,body
        try:
            key=bytes.fromhex('e1f97a0d3e018be0d64fa32c06de41390ec675ad498afeebb6960b3aabe6')
            process.stdin.write(config()+frame(10,struct.pack('!III',1,0xcafebabe,1)+key)+frame(2,self.media)+frame(3));process.stdin.flush()
            while read_frame()[0]!=3:pass
            self.assertIsNone(process.poll())
            packet=bytes.fromhex('800f1234decafbadcafebabe')+b'\xab'*16
            process.stdin.write(frame(11,struct.pack('!II',777,1)+packet));process.stdin.flush()
            kind,body=read_frame();self.assertEqual(kind,11);self.assertEqual(body[:8],struct.pack('!II',777,1));self.assertEqual(len(body),46)
            process.stdin.write(frame(4));process.stdin.flush();self.assertEqual(process.wait(timeout=1),0)
            self.assertEqual(process.stderr.read(),b'')
        finally:
            if process.poll() is None:process.kill();process.wait()
            process.stdin.close();process.stdout.close();process.stderr.close()
    def test_stop_during_blocked_protection_output_is_prompt(self):
        process=subprocess.Popen([str(WORKER)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        try:
            key=bytes.fromhex('e1f97a0d3e018be0d64fa32c06de41390ec675ad498afeebb6960b3aabe6')
            process.stdin.write(config()+frame(10,struct.pack('!III',1,0xcafebabe,1)+key))
            for sequence in range(100):
                packet=struct.pack('!BBHII',0x80,96,sequence,sequence*160,0xcafebabe)+b'x'*1000
                process.stdin.write(frame(11,struct.pack('!II',sequence+1,1)+packet))
            process.stdin.flush()
            start=time.monotonic();process.stdin.write(frame(4));process.stdin.flush()
            self.assertEqual(process.wait(timeout=1),0)
            self.assertLess(time.monotonic()-start,0.75)
            self.assertEqual(process.stderr.read(),b'')
        finally:
            if process.poll() is None:process.kill();process.wait()
            process.stdin.close();process.stdout.close();process.stderr.close()
    def test_output_has_independent_two_second_deadline(self):
        process=subprocess.Popen([str(WORKER)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        try:
            process.stdin.write(config()+frame(2,self.media));process.stdin.flush()
            # Codec packets alone fit the OS pipe; protection burst fills it without END.
            key=bytes.fromhex('e1f97a0d3e018be0d64fa32c06de41390ec675ad498afeebb6960b3aabe6')
            process.stdin.write(frame(10,struct.pack('!III',1,0xcafebabe,1)+key));process.stdin.flush()
            for sequence in range(100):
                packet=struct.pack('!BBHII',0x80,96,sequence,sequence*160,0xcafebabe)+b'x'*1000
                process.stdin.write(frame(11,struct.pack('!II',sequence+1,1)+packet))
            process.stdin.flush()
            self.assertEqual(process.wait(timeout=4),2)
            self.assertIn(b'BLINK_WORKER_OUTPUT_TIMEOUT',process.stderr.read())
        finally:
            if process.poll() is None:process.kill();process.wait()
            process.stdin.close();process.stdout.close();process.stderr.close()
    def test_legitimate_fragmented_media_eof_and_packets(self):
        data = config() + b''.join(frame(2, self.media[i:i+37]) for i in range(0, len(self.media), 37)) + frame(3)
        result = self.run_worker(data)
        self.assertEqual(result.returncode, 0, result.stderr)
        rows = messages(result.stdout)
        self.assertEqual(rows[0], (1, struct.pack('!II', 1, 15)))
        packets = [body for kind, body in rows if kind == 2]
        self.assertEqual(len(packets), 4)
        pts=[struct.unpack('!q',p[:8])[0] for p in packets]
        self.assertEqual([round((x-pts[0])*15/1000000) for x in pts],list(range(4)))
        self.assertTrue(all(len(p) > 48 and p[48:52] == b'\x00\x00\x00\x01' for p in packets))
        self.assertEqual(rows[-1], (3, b''))
        self.assertEqual(result.stderr, b'')
        decoded=subprocess.run([str(ROOT / 'build/check-output')],input=result.stdout,capture_output=True,timeout=5)
        self.assertEqual(decoded.returncode,0,decoded.stderr)
    def test_supported_audio_packets_decode_and_preserve_source_offset(self):
        media=subprocess.check_output([str(ROOT/'build/fixture'),'audio'],timeout=5)
        for codec,rate in [(1,16000),(1,24000),(2,8000),(3,8000)]:
            with self.subTest(codec=codec,rate=rate):
                result=self.run_worker(config(audio_codec=codec,audio_rate=rate,audio_channels=1,audio_bitrate=24000)+frame(2,media)+frame(3))
                self.assertEqual(result.returncode,0,result.stderr)
                rows=messages(result.stdout)
                info=next(body for kind,body in rows if kind==5)
                encoded=[body for kind,body in rows if kind==4]
                video=[body for kind,body in rows if kind==2]
                self.assertGreater(len(encoded),0)
                code,out_rate,channels,padding,extra=struct.unpack('!5I',info[:20])
                self.assertEqual((code,out_rate,channels),(codec,rate,1))
                self.assertEqual(len(info),20+extra)
                first=struct.unpack('!q',encoded[0][:8])[0]
                video_start=struct.unpack('!q',video[0][:8])[0]
                # Fixture AAC source leads video by its 64ms encoder priming; preserve this offset.
                self.assertAlmostEqual(video_start-(first+padding*1000000/rate),64000,delta=1)
                pts=[struct.unpack('!q',body[:8])[0] for body in encoded]
                self.assertEqual(pts,sorted(pts))
                for body in encoded:
                    self.assertEqual(struct.unpack('!3I',body[28:40]),(2,1,1000000))
                    self.assertGreater(struct.unpack('!q',body[16:24])[0],0)
                decoded=subprocess.run([str(ROOT/'build/check-output')],input=result.stdout,capture_output=True,timeout=5)
                self.assertEqual(decoded.returncode,0,decoded.stderr)
    def test_unsupported_audio_config_is_fatal(self):
        for changes in [dict(audio_codec=4),dict(audio_codec=1,audio_rate=8000,audio_channels=1,audio_bitrate=24000),dict(audio_codec=2,audio_rate=16000,audio_channels=1,audio_bitrate=24000),dict(audio_codec=1,audio_rate=16000,audio_channels=2,audio_bitrate=24000)]:
            self.assertEqual(self.run_worker(config(**changes)).returncode,2)
    def test_optional_absent_audio_does_not_invent_packets(self):
        result=self.run_worker(config(audio_codec=1,audio_rate=16000,audio_channels=1,audio_bitrate=24000)+frame(2,self.media)+frame(3))
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse(any(kind in (4,5) for kind,_ in messages(result.stdout)))
    def test_audio_discontinuity_fails_closed(self):
        media=subprocess.check_output([str(ROOT/'build/fixture'),'audio'],timeout=5)
        result=self.run_worker(config(audio_codec=1,audio_rate=16000,audio_channels=1,audio_bitrate=24000)+frame(2,media+media)+frame(3))
        self.assertEqual(result.returncode,2)
        self.assertNotIn((3,b''),messages(result.stdout))

    def test_partial_header_and_payload_are_fatal(self):
        for data in [b'BMI', frame(1, b'\0'*23)[:-1], config() + frame(2, b'abc')[:-1]]:
            with self.subTest(data_length=len(data)):
                self.assertEqual(self.run_worker(data).returncode, 2)
    def test_config_validation_and_duplicate_config(self):
        for values in [dict(width=0), dict(width=1922), dict(height=1082), dict(width=17), dict(fps=31), dict(bitrate=0), dict(max_frames=9001), dict(reserved=1)]:
            self.assertEqual(self.run_worker(config(**values)).returncode, 2)
        self.assertEqual(self.run_worker(config()+config()).returncode, 2)
    def test_unknown_frame_and_oversized_frame_are_fatal(self):
        for data in [frame(99), b'BMI1'+struct.pack('!II', 2, 65537), frame(2,b'not configured')]:
            self.assertEqual(self.run_worker(data).returncode, 2)
    def test_frame_budget_has_no_success_end(self):
        result=self.run_worker(config(max_frames=1)+frame(2,self.media)+frame(3))
        self.assertEqual(result.returncode,2)
        self.assertNotIn((3,b''),messages(result.stdout))
    def test_eof_without_media_is_failure_not_success(self):
        for data in [b'', config(), config()+frame(3), config()+frame(2,b'garbage')+frame(3)]:
            self.assertEqual(self.run_worker(data).returncode,2)
    def test_stop_before_config_and_while_media_waits_is_prompt(self):
        for initial in [b'', config()]:
            child=subprocess.Popen([str(WORKER)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            child.stdin.write(initial);child.stdin.flush()
            if initial: time.sleep(0.05)
            before=time.monotonic();child.stdin.write(frame(4));child.stdin.flush()
            self.assertEqual(child.wait(timeout=2),0)
            self.assertLess(time.monotonic()-before,1)
            child.stdin.close();child.stdout.close();child.stderr.close()
    def test_stop_while_stdout_is_not_consumed(self):
        child=subprocess.Popen([str(WORKER)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        child.stdin.write(config(max_frames=9000));child.stdin.flush()
        # Repeated valid TS input eventually stalls bounded stdout. Input remains below queue cap.
        for _ in range(80):
            child.stdin.write(frame(2,self.media));child.stdin.flush()
        before=time.monotonic();child.stdin.write(frame(4));child.stdin.flush()
        self.assertEqual(child.wait(timeout=2),0)
        self.assertLess(time.monotonic()-before,1)
        child.stdin.close();child.stdout.close();child.stderr.close()
    def test_secret_like_malformed_payload_is_not_in_errors(self):
        result=self.run_worker(frame(1,b'password=synthetic-secret'))
        self.assertEqual(result.returncode,2)
        self.assertNotIn(b'synthetic-secret',result.stdout+result.stderr)
        self.assertNotIn(b'password=',result.stdout+result.stderr)

if __name__ == '__main__':
    unittest.main()
