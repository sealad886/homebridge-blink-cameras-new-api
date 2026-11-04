"""Behavioral private-pipe worker tests; no provider traffic or FFmpeg CLI."""
import os
import json
import re
from pathlib import Path
import struct
import shutil
import subprocess
import sys
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
def binary(name):
    return ROOT / 'build' / (name + ('.exe' if os.name=='nt' else ''))
WORKER = binary('blink-codec-worker')
def frame(kind, payload=b''):
    return b'BMI1' + struct.pack('!II', kind, len(payload)) + payload

def config(**changes):
    values = dict(width=16, height=16, fps=15, bitrate=100000, max_frames=10, software_preset=0, audio_codec=0, audio_rate=0, audio_channels=0, audio_bitrate=0, video_profile=0, video_level=0, audio_packet_ms=0, output_mode=0, fragment_ms=0, iframe_ms=0,input_format=0,audio_tail_policy=0)
    values.update(changes)
    if values['audio_codec']==1 and 'audio_packet_ms' not in changes:values['audio_packet_ms']=20
    return frame(1, struct.pack('!%dI'%len(values), *values.values()))

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

def audio_pes_headers(media):
    """Locate synthetic MPEG-TS audio PES headers without changing AAC bytes."""
    result=[]
    for offset in range(0,len(media),188):
        if media[offset]!=0x47 or not media[offset+1]&0x40 or not media[offset+3]&0x10:continue
        start=offset+4
        if media[offset+3]&0x20:start+=1+media[start]
        if media[start:start+3]==b'\0\0\1' and media[start+3]&0xe0==0xc0:result.append(start)
    return result

def shift_pes_pts(media,start,ticks):
    pts=media[start+9:start+14]
    value=(((pts[0]>>1)&7)<<30)|(pts[1]<<22)|((pts[2]>>1)<<15)|(pts[3]<<7)|(pts[4]>>1)
    value=(value+ticks)&((1<<33)-1)
    media[start+9:start+14]=bytes([0x21|((value>>30)<<1),(value>>22)&255,((value>>15)&127)*2+1,(value>>7)&255,(value&127)*2+1])

def mp4_with_oversized_sample_table():
    """Tiny malformed fixture: declared samples exceed the finite allocation cap."""
    media=subprocess.check_output([str(binary('fixture')),'mp4-video','16','16','15','1'],timeout=5)
    count=3000000
    def rewrite(data):
        result=bytearray();offset=0
        while offset<len(data):
            size,kind=struct.unpack('!I4s',data[offset:offset+8])
            if size<8 or offset+size>len(data):raise AssertionError('invalid synthetic MP4 box')
            body=data[offset+8:offset+size]
            if kind in (b'moov',b'trak',b'mdia',b'minf',b'stbl'):body=rewrite(body)
            elif kind==b'stts':body=struct.pack('!4I',0,1,count,1)
            elif kind==b'stsc':body=struct.pack('!5I',0,1,1,count,1)
            elif kind==b'stsz':body=struct.pack('!3I',0,1,count)
            result.extend(struct.pack('!I4s',8+len(body),kind)+body);offset+=size
        return bytes(result)
    return rewrite(media)

class WorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.media = subprocess.check_output([str(binary('fixture'))], timeout=5)
    def run_worker(self, data):
        return subprocess.run([str(WORKER)], input=data, capture_output=True, timeout=5)
    def test_visual_motion_rejects_noise_brightness_and_single_frame_glitches(self):
        result=subprocess.run([str(binary('check-motion'))],capture_output=True,timeout=5)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertLess(json.loads(result.stdout)['stateBytes'],4096)
    def test_recording_motion_pulses_are_confirmed_bounded_and_never_sent_by_live_codec(self):
        media=subprocess.check_output([str(binary('fixture')),'motion','128','72','15','90'],timeout=5)
        framed=b''.join(frame(2,media[i:i+65536]) for i in range(0,len(media),65536))+frame(3)
        recording=self.run_worker(config(width=128,height=72,max_frames=100,output_mode=1,fragment_ms=4000,iframe_ms=1000)+framed)
        self.assertEqual(recording.returncode,0,recording.stderr)
        events=[struct.unpack('!QII',body) for kind,body in messages(recording.stdout) if kind==13]
        self.assertTrue(events,'physical scene change must reach the recording parent without clip polling')
        self.assertTrue(all(1000000<=at and 20<=score<=1000 and event==1 for at,score,event in events))
        self.assertTrue(all(b[0]-a[0]>=1000000 for a,b in zip(events,events[1:])))
        live=self.run_worker(config(width=128,height=72,max_frames=100)+framed)
        self.assertEqual(live.returncode,0,live.stderr)
        self.assertFalse(any(kind==13 for kind,_ in messages(live.stdout)))
    def recording(self, mode='video', rate=0, offset=0, audio_enabled=None):
        media=subprocess.check_output([str(binary('fixture')),mode,'16','16','15','90',str(offset)],timeout=5)
        enabled=(mode!='video') if audio_enabled is None else audio_enabled
        values=dict(output_mode=1,fragment_ms=4000,iframe_ms=4000,max_frames=100)
        if enabled:values.update(audio_codec=4,audio_rate=rate or 16000,audio_channels=1,audio_bitrate=32000)
        result=self.run_worker(config(**values)+b''.join(frame(2,media[i:i+65536]) for i in range(0,len(media),65536))+frame(3))
        self.assertEqual(result.returncode,0,result.stderr)
        rows=messages(result.stdout)
        self.assertFalse(any(k in (2,4,5,10,11,12) for k,_ in rows))
        init=[b for k,b in rows if k==8];self.assertEqual(len(init),1);self.assertLessEqual(len(init[0]),256*1024)
        fragments=[b for k,b in rows if k==9];self.assertGreaterEqual(len(fragments),2)
        self.assertLess([k for k,_ in rows].index(8),[k for k,_ in rows].index(9))
        for i,body in enumerate(fragments):
            sequence,start,duration,key=struct.unpack('!IqqI',body[:24])
            self.assertEqual(sequence,i);self.assertEqual(key,1);self.assertGreater(duration,0);self.assertLessEqual(duration,4000000)
            self.assertLessEqual(len(body)-24,8*1024*1024)
            self.assertEqual(body[28:32],b'moof')
            if i:self.assertEqual(start,struct.unpack('!IqqI',fragments[i-1][:24])[1]+1000000)
        return init[0],fragments
    def decode_recording(self, data):
        checked=subprocess.run([str(binary('check-recording'))],input=data,capture_output=True,timeout=5)
        self.assertEqual(checked.returncode,0,checked.stderr)
        return json.loads(checked.stdout)
    def test_recording_fragments_decode_independently_and_keep_video_timing(self):
        init,fragments=self.recording(offset=30)
        decoded=self.decode_recording(init+b''.join(b[24:] for b in fragments))
        self.assertEqual(decoded['videoFrames'],90);self.assertEqual(decoded['audioTracks'],0)
        self.assertEqual(decoded['lastVideoUs']-decoded['firstVideoUs'],5933333)
        for body in fragments:
            decoded=self.decode_recording(init+body[24:])
            self.assertEqual(decoded['videoFrames'],15);self.assertEqual(decoded['audioTracks'],0)
    def test_finite_mp4_input_replays_every_available_picture(self):
        initialization,fragments=self.recording()
        media=initialization+b''.join(body[24:] for body in fragments)
        result=self.run_worker(config(output_mode=1,fragment_ms=4000,iframe_ms=1000,max_frames=100,
            input_format=1,audio_tail_policy=0)+frame(2,media)+frame(3))
        self.assertEqual(result.returncode,0,result.stderr)
        rows=messages(result.stdout)
        prepared=b''.join(body if kind==8 else body[24:] for kind,body in rows if kind in (8,9))
        self.assertEqual(self.decode_recording(prepared)['videoFrames'],90)
    def test_finite_mp4_with_metadata_only_sample_preserves_all_pictures(self):
        media=subprocess.check_output([str(binary('fixture')),'mp4-parameters','16','16','15','90'],timeout=5)
        result=self.run_worker(config(output_mode=1,fragment_ms=4000,iframe_ms=1000,max_frames=100,
            input_format=1)+frame(2,media)+frame(3))
        self.assertEqual(result.returncode,0,result.stderr)
        rows=messages(result.stdout)
        self.assertEqual([struct.unpack('!6I',body[:24])[:3] for kind,body in rows if kind==14],[(90,90,90)])
        prepared=b''.join(body if kind==8 else body[24:] for kind,body in rows if kind in (8,9))
        self.assertEqual(self.decode_recording(prepared)['videoFrames'],90)
    def test_finite_mp4_keeps_source_timing_when_final_keyframe_has_variable_gap(self):
        media=subprocess.check_output([str(binary('fixture')),'mp4-variable','16','16','15','91'],timeout=5)
        source=self.decode_recording(media)
        self.assertEqual(source['videoFrames'],91)
        result=self.run_worker(config(output_mode=1,fragment_ms=4000,iframe_ms=1000,max_frames=100,
            input_format=1)+frame(2,media)+frame(3))
        self.assertEqual(result.returncode,0,result.stderr)
        rows=messages(result.stdout)
        prepared=b''.join(body if kind==8 else body[24:] for kind,body in rows if kind in (8,9))
        actual=self.decode_recording(prepared)
        self.assertEqual(actual['videoFrames'],source['videoFrames'])
        self.assertAlmostEqual(actual['lastVideoUs'],source['lastVideoUs'],delta=12)
    def test_finite_mp4_downsampling_keeps_video_coverage_through_unsampled_source_end(self):
        for count,selected in ((118,88),(120,90)):
            with self.subTest(source_count=count):
                media=subprocess.check_output([str(binary('fixture')),'mp4-video','16','16','20',str(count)],timeout=5)
                result=self.run_worker(config(fps=15,output_mode=1,fragment_ms=4000,iframe_ms=1000,max_frames=120,
                    input_format=1)+frame(2,media)+frame(3))
                self.assertEqual(result.returncode,0,result.stderr)
                rows=messages(result.stdout);fragments=[body for kind,body in rows if kind==9]
                _,start,duration,_=struct.unpack('!IqqI',fragments[-1][:24])
                self.assertEqual(start+duration,count*50000)
                self.assertEqual([struct.unpack('!6I',body[:24])[:3] for kind,body in rows if kind==14],[(count,selected,selected)])
    def test_finite_mp4_tail_silence_requires_explicit_bounded_policy(self):
        media=subprocess.check_output([str(binary('fixture')),'mp4-audio-tail','16','16','15','90'],timeout=5)
        framed=b''.join(frame(2,media[i:i+65536]) for i in range(0,len(media),65536))+frame(3)
        values=dict(output_mode=1,fragment_ms=4000,iframe_ms=1000,max_frames=100,input_format=1,
            audio_codec=4,audio_rate=16000,audio_channels=1,audio_bitrate=32000)
        strict=self.run_worker(config(**values)+framed)
        self.assertEqual(strict.returncode,2);self.assertIn(b'AUDIO_DISCONTINUITY',strict.stderr)
        padded=self.run_worker(config(**values,audio_tail_policy=1)+framed)
        self.assertEqual(padded.returncode,0,padded.stderr)
        rows=messages(padded.stdout)
        summary=[struct.unpack('!6I',body[:24]) for kind,body in rows if kind==14]
        self.assertEqual(len(summary),1);self.assertEqual(summary[0][:3],(90,90,90))
        self.assertGreater(summary[0][3],0);self.assertLessEqual(summary[0][3],32000);self.assertEqual(summary[0][4:],(16000,1))
        prepared=b''.join(body if kind==8 else body[24:] for kind,body in rows if kind in (8,9))
        decoded=self.decode_recording(prepared)
        self.assertEqual(decoded['videoFrames'],90);self.assertEqual(decoded['audioTracks'],1)
    def test_finite_mp4_tail_policy_does_not_repair_interior_or_excessive_gaps(self):
        for mode in ('mp4-audio-gap','mp4-audio-longtail'):
            with self.subTest(mode=mode):
                media=subprocess.check_output([str(binary('fixture')),mode,'16','16','15','90'],timeout=5)
                result=self.run_worker(config(output_mode=1,fragment_ms=4000,iframe_ms=1000,max_frames=100,input_format=1,
                    audio_codec=4,audio_rate=16000,audio_channels=1,audio_bitrate=32000,audio_tail_policy=1)+frame(2,media)+frame(3))
                self.assertEqual(result.returncode,2);self.assertIn(b'AUDIO_DISCONTINUITY',result.stderr)
                self.assertFalse(any(kind==3 for kind,_ in messages(result.stdout)))
    def test_finite_input_requires_recording_and_explicit_supported_policy(self):
        for changes in (dict(input_format=2),dict(input_format=1),dict(audio_tail_policy=1),
                        dict(output_mode=1,fragment_ms=4000,iframe_ms=1000,input_format=1,audio_tail_policy=1),
                        dict(output_mode=1,fragment_ms=4000,iframe_ms=1000,input_format=1,audio_tail_policy=2)):
            with self.subTest(changes=changes):
                result=self.run_worker(config(**changes)+frame(3))
                self.assertEqual(result.returncode,2);self.assertIn(b'INPUT_CONFIG',result.stderr)
    def test_finite_mp4_forces_demuxer_and_rejects_truncated_media(self):
        media=subprocess.check_output([str(binary('fixture')),'mp4-video','16','16','15','90'],timeout=5)
        for invalid in (self.media,media[:len(media)//2],b'\x00\x00\x00\x20ftypisom'):
            result=self.run_worker(config(output_mode=1,fragment_ms=4000,iframe_ms=1000,max_frames=100,input_format=1)+frame(2,invalid)+frame(3))
            self.assertEqual(result.returncode,2)
            self.assertFalse(any(kind==3 for kind,_ in messages(result.stdout)))
    def test_finite_mp4_allocation_cap_preserves_source_geometry_limits(self):
        for width,height,code in ((4096,2048,0),(4098,16,2),(4096,2050,2)):
            with self.subTest(width=width,height=height):
                media=subprocess.check_output([str(binary('fixture')),'mp4-video',str(width),str(height),'15','4'],timeout=15)
                data=config(width=128,height=72,output_mode=1,fragment_ms=4000,iframe_ms=1000,max_frames=4,input_format=1)
                data+=b''.join(frame(2,media[i:i+65536]) for i in range(0,len(media),65536))+frame(3)
                result=subprocess.run([str(WORKER)],input=data,capture_output=True,timeout=15)
                self.assertEqual(result.returncode,code,result.stderr)
                self.assertEqual((3,b'') in messages(result.stdout),code==0)
                if not code:
                    source=[struct.unpack('!4I',body)[:2] for kind,body in messages(result.stdout) if kind==7]
                    self.assertEqual(source,[(width,height)])
    def test_finite_mp4_copies_bounded_input_and_waits_for_end_while_stop_remains_available(self):
        media=subprocess.check_output([str(binary('fixture')),'mp4-video','16','16','15','90'],timeout=5)
        process=subprocess.Popen([str(WORKER)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        try:
            process.stdin.write(config(output_mode=1,fragment_ms=4000,iframe_ms=1000,max_frames=100,input_format=1));process.stdin.flush()
            self.assertEqual(messages(process.stdout.read(20)),[(1,struct.pack('!II',4,15))])
            process.stdin.write(frame(2,media));process.stdin.flush()
            self.assertEqual(messages(process.stdout.read(16)),[(6,struct.pack('!I',len(media)))])
            time.sleep(0.03)
            process.stdin.write(frame(4));process.stdin.flush()
            self.assertEqual(process.wait(timeout=1),0)
            self.assertEqual(process.stdout.read(),b'')
        finally:
            if process.poll() is None:process.kill();process.wait()
            process.stdin.close();process.stdout.close();process.stderr.close()
    def test_finite_mp4_rejects_input_beyond_owned_memory_budget(self):
        chunk=b'x'*65536
        result=self.run_worker(config(output_mode=1,fragment_ms=4000,iframe_ms=1000,input_format=1)+
            frame(2,chunk)*512+frame(2,b'x')+frame(3))
        self.assertEqual(result.returncode,2);self.assertIn(b'INPUT_LIMIT',result.stderr)
        self.assertFalse(any(kind==3 for kind,_ in messages(result.stdout)))
    def test_finite_mp4_rejects_external_tracks_and_out_of_range_sample_offsets(self):
        media=subprocess.check_output([str(binary('fixture')),'mp4-video','16','16','15','90'],timeout=5)
        def rewrite(data,external):
            result=b'';offset=0
            while offset<len(data):
                size=struct.unpack('!I',data[offset:offset+4])[0];kind=data[offset+4:offset+8]
                self.assertGreaterEqual(size,8);self.assertLessEqual(offset+size,len(data))
                body=data[offset+8:offset+size]
                if kind in (b'moov',b'trak',b'mdia',b'minf',b'dinf',b'stbl'):body=rewrite(body,external)
                elif external and kind==b'dref':
                    path=b'/unavailable-private-track.h264\0\0'
                    alias=b'\0'*150+struct.pack('!HH',2,len(path))+path+struct.pack('!hH',-1,0)
                    body=b'\0'*4+struct.pack('!I',1)+struct.pack('!I4sI',12+len(alias),b'alis',0)+alias
                elif not external and kind==b'stco':body=body[:8]+struct.pack('!I',0xffffffff)+body[12:]
                result+=struct.pack('!I4s',8+len(body),kind)+body;offset+=size
            return result
        for external in (False,True):
            result=self.run_worker(config(output_mode=1,fragment_ms=4000,iframe_ms=1000,max_frames=100,input_format=1)+frame(2,rewrite(media,external))+frame(3))
            self.assertEqual(result.returncode,2)
            self.assertFalse(any(kind in (3,8,9) for kind,_ in messages(result.stdout)))
    @unittest.skipUnless(os.environ.get('BLINK_NATIVE_CLIP_FIXTURE'),'private captured MP4 fixture not supplied')
    def test_captured_mp4_parameter_packets_preserve_available_decoded_pictures(self):
        media=Path(os.environ['BLINK_NATIVE_CLIP_FIXTURE']).read_bytes()
        expected=int(os.environ.get('BLINK_NATIVE_CLIP_PICTURES','1801'))
        self.assertLessEqual(len(media),32*1024*1024)
        result=subprocess.run([str(WORKER)],input=config(width=128,height=72,fps=30,bitrate=200000,max_frames=9000,
            output_mode=1,fragment_ms=4000,iframe_ms=1000,input_format=1)+
            b''.join(frame(2,media[i:i+65536]) for i in range(0,len(media),65536))+frame(3),capture_output=True,timeout=120)
        self.assertEqual(result.returncode,0,result.stderr)
        rows=messages(result.stdout)
        summaries=[struct.unpack('!6I',body[:24]) for kind,body in rows if kind==14]
        self.assertEqual(summaries,[(expected,expected,expected,0,0,1)])
        prepared=b''.join(body if kind==8 else body[24:] for kind,body in rows if kind in (8,9))
        self.assertEqual(self.decode_recording(prepared)['videoFrames'],expected)
    def test_recording_aac_lc_decodes_at_each_supported_rate_and_preserves_source_offset(self):
        for mode in ('audio','audio-latm-bundled'):
            for rate in (16000,24000):
                with self.subTest(mode=mode,rate=rate):
                    init,fragments=self.recording(mode,rate)
                    decoded=self.decode_recording(init+b''.join(b[24:] for b in fragments))
                    self.assertEqual(decoded['videoFrames'],90);self.assertEqual(decoded['audioTracks'],1);self.assertGreater(decoded['audioSamples'],rate*5)
                    self.assertEqual(decoded['firstVideoUs'],struct.unpack('!IqqI',fragments[0][:24])[1])
                    self.assertEqual(decoded['lastVideoUs']-decoded['firstVideoUs'],5933333)
                    for body in fragments:
                        independently=self.decode_recording(init+body[24:])
                        self.assertEqual(independently['videoFrames'],15);self.assertGreater(independently['audioSamples'],0)
    def test_recording_audio_disabled_omits_track_even_when_source_contains_audio(self):
        init,fragments=self.recording('audio',audio_enabled=False)
        self.assertNotIn(b'mp4a',init)
        decoded=self.decode_recording(init+b''.join(b[24:] for b in fragments))
        self.assertEqual(decoded['audioTracks'],0);self.assertEqual(decoded['audioSamples'],0)
    def test_recording_configuration_rejects_audio_mismatch_and_invalid_durations(self):
        for values in (dict(audio_codec=4,audio_rate=16000,audio_channels=1,audio_bitrate=32000),
                       dict(output_mode=1,fragment_ms=4000,iframe_ms=4000,audio_codec=1,audio_rate=16000,audio_channels=1,audio_bitrate=32000),
                       dict(output_mode=1,fragment_ms=4000,iframe_ms=0),dict(output_mode=1,fragment_ms=4001,iframe_ms=4000)):
            result=self.run_worker(config(**values)+frame(2,self.media)+frame(3))
            self.assertEqual(result.returncode,2)
            self.assertFalse(any(k==9 for k,_ in messages(result.stdout)))
    def test_recording_missing_audio_or_container_duration_overrun_fails_explicitly(self):
        for mode,fragment_ms,code in [('video',4000,b'AUDIO_MISSING'),('audio',1000,b'FRAGMENT_LIMIT')]:
            media=subprocess.check_output([str(binary('fixture')),mode,'16','16','15','90'],timeout=5)
            result=self.run_worker(config(output_mode=1,fragment_ms=fragment_ms,iframe_ms=1000,max_frames=100,
                audio_codec=4,audio_rate=16000,audio_channels=1,audio_bitrate=32000)+
                b''.join(frame(2,media[i:i+65536]) for i in range(0,len(media),65536))+frame(3))
            self.assertEqual(result.returncode,2);self.assertIn(code,result.stderr)
            self.assertFalse(any(k==3 for k,_ in messages(result.stdout)))
    def test_recording_video_gap_fails_instead_of_stitching_missing_coverage(self):
        media=bytearray(subprocess.check_output([str(binary('fixture')),'video','16','16','15','90'],timeout=5))
        video_packets=0
        for offset in range(0,len(media),188):
            if not media[offset+1]&0x40 or not media[offset+3]&0x10:continue
            start=offset+4
            if media[offset+3]&0x20:start+=1+media[start]
            if media[start:start+3]==b'\0\0\1' and media[start+3]&0xf0==0xe0:
                if video_packets>=15:shift_pes_pts(media,start,450000)
                video_packets+=1
        self.assertGreater(video_packets,15)
        result=self.run_worker(config(output_mode=1,fragment_ms=4000,iframe_ms=1000,max_frames=100)+frame(2,media)+frame(3))
        self.assertEqual(result.returncode,2);self.assertIn(b'VIDEO_DISCONTINUITY',result.stderr)
        self.assertFalse(any(k==3 for k,_ in messages(result.stdout)))
    def test_recording_duplicate_or_regressing_video_timestamp_fails_before_fps_selection(self):
        for ticks in (-6000,-9000):
            with self.subTest(ticks=ticks):
                media=bytearray(subprocess.check_output([str(binary('fixture')),'video','16','16','15','30'],timeout=5))
                packets=0
                for offset in range(0,len(media),188):
                    if not media[offset+1]&0x40 or not media[offset+3]&0x10:continue
                    start=offset+4
                    if media[offset+3]&0x20:start+=1+media[start]
                    if media[start:start+3]==b'\0\0\1' and media[start+3]&0xf0==0xe0:
                        if packets==1:shift_pes_pts(media,start,ticks)
                        packets+=1
                self.assertGreater(packets,1)
                result=self.run_worker(config(output_mode=1,fragment_ms=4000,iframe_ms=1000,max_frames=100)+frame(2,media)+frame(3))
                self.assertEqual(result.returncode,2);self.assertIn(b'VIDEO_DISCONTINUITY',result.stderr)
                self.assertFalse(any(k==3 for k,_ in messages(result.stdout)))
    def audio_tail_removed(self, count=90, cutoff=459000):
        original=subprocess.check_output([str(binary('fixture')),'audio','16','16','15',str(count)],timeout=5)
        audio_pid=None;origin=None;latest=None;kept=[]
        for offset in range(0,len(original),188):
            packet=original[offset:offset+188];pid=((packet[1]&0x1f)<<8)|packet[2]
            if packet[1]&0x40 and packet[3]&0x10:
                start=4+(1+packet[4] if packet[3]&0x20 else 0)
                if packet[start:start+3]==b'\0\0\1' and packet[start+3]&0xe0==0xc0:
                    audio_pid=pid;pts=packet[start+9:start+14]
                    latest=(((pts[0]>>1)&7)<<30)|(pts[1]<<22)|((pts[2]>>1)<<15)|(pts[3]<<7)|(pts[4]>>1)
                    if origin is None:origin=latest
            if pid==audio_pid and latest is not None and latest-origin>=cutoff:continue
            kept.append(packet)
        self.assertIsNotNone(origin)
        return b''.join(kept)
    def test_recording_trailing_audio_loss_cannot_complete_successfully(self):
        media=self.audio_tail_removed()
        result=self.run_worker(config(output_mode=1,fragment_ms=4000,iframe_ms=1000,max_frames=100,
            audio_codec=4,audio_rate=16000,audio_channels=1,audio_bitrate=32000)+
            b''.join(frame(2,media[i:i+65536]) for i in range(0,len(media),65536))+frame(3))
        self.assertEqual(result.returncode,2);self.assertIn(b'AUDIO_DISCONTINUITY',result.stderr)
        self.assertFalse(any(k==3 for k,_ in messages(result.stdout)))
        self.assertLessEqual(sum(k==9 for k,_ in messages(result.stdout)),5)
    def test_recording_audio_watermark_failure_precedes_eof_and_incomplete_fragment(self):
        # Leave >32 AAC packets for this tiny fixture's bounded codec probe;
        # null TS packets alone cannot satisfy an AAC packet-count probe.
        media=self.audio_tail_removed(120,279000)
        # Keep the MPEG-TS AVIO probe/read-ahead supplied without signaling EOF.
        media+=(b'\x47\x1f\xff\x10'+b'\xff'*184)*700
        process=subprocess.Popen([str(WORKER)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        try:
            try:
                process.stdin.write(config(output_mode=1,fragment_ms=4000,iframe_ms=1000,max_frames=120,
                    audio_codec=4,audio_rate=16000,audio_channels=1,audio_bitrate=32000)+
                    b''.join(frame(2,media[i:i+65536]) for i in range(0,len(media),65536)))
                process.stdin.flush()
            except BrokenPipeError:pass # Early explicit rejection may close the producer pipe.
            self.assertEqual(process.wait(timeout=3),2)
            self.assertIn(b'AUDIO_DISCONTINUITY',process.stderr.read())
            rows=messages(process.stdout.read());self.assertFalse(any(k==3 for k,_ in rows))
            self.assertLessEqual(sum(k==9 for k,_ in rows),3)
        finally:
            if process.poll() is None:process.kill();process.wait()
            try:process.stdin.close()
            except BrokenPipeError:pass
            process.stdout.close();process.stderr.close()
    def test_fixture_stdout_preserves_binary_transport_packets(self):
        # Fixed null-TS payload makes text-stream LF/CR translation and Ctrl-Z
        # truncation observable without depending on encoded AAC/H264 bytes.
        expected=b'\x47\x1f\xff\x10'+bytes(range(184))
        transported=subprocess.check_output([str(binary('fixture')),'binary-transport'],timeout=5)
        self.assertEqual(transported,expected)
        for mode in ([], ['audio'], ['audio-latm'], ['audio-latm-bundled']):
            with self.subTest(mode=mode):
                media=subprocess.check_output([str(binary('fixture')),*mode],timeout=5)
                self.assertGreater(len(media),0)
                self.assertEqual(len(media)%188,0)
                self.assertTrue(all(media[offset]==0x47 for offset in range(0,len(media),188)))
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
            diagnostics=process.stderr.read();self.assertEqual(diagnostics.splitlines(),[b'BLINK_WORKER_FRAMING'])
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
        # ARM64 Linux can use 16KiB pages and a 256KiB default pipe: the fixed
        # burst fits unless the fixture explicitly creates output backpressure.
        pipe_options={'pipesize':4096} if sys.platform.startswith('linux') else {}
        process=subprocess.Popen([str(WORKER)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**pipe_options)
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
        self.assertEqual(rows[0], (1, struct.pack('!II', 4, 15)))
        packets = [body for kind, body in rows if kind == 2]
        self.assertEqual(len(packets), 4)
        pts=[struct.unpack('!q',p[:8])[0] for p in packets]
        self.assertEqual([round((x-pts[0])*15/1000000) for x in pts],list(range(4)))
        self.assertTrue(all(len(p) > 48 and p[48:52] == b'\x00\x00\x00\x01' for p in packets))
        self.assertEqual(rows[-1], (3, b''))
        self.assertEqual(result.stderr, b'')
        decoded=subprocess.run([str(binary('check-output'))],input=result.stdout,capture_output=True,timeout=5)
        self.assertEqual(decoded.returncode,0,decoded.stderr)
    def test_media_consumption_credits_exactly_cover_demuxer_input(self):
        result=self.run_worker(config()+frame(2,self.media)+frame(3))
        self.assertEqual(result.returncode,0,result.stderr)
        credits=[struct.unpack('!I',body)[0] for kind,body in messages(result.stdout) if kind==6]
        self.assertGreater(len(credits),0)
        self.assertTrue(all(0<b-a<=32768 for a,b in zip([0]+credits,credits)))
        self.assertEqual(credits[-1],len(self.media))
    def test_latm_input_produces_decodable_supported_audio(self):
        media=subprocess.check_output([str(binary('fixture')),'audio-latm'],timeout=5)
        for codec,rate in [(1,16000),(1,24000),(2,8000),(3,8000)]:
            with self.subTest(codec=codec,rate=rate):
                result=self.run_worker(config(audio_codec=codec,audio_rate=rate,audio_channels=1,audio_bitrate=24000)+frame(2,media)+frame(3))
                self.assertEqual(result.returncode,0,result.stderr)
                self.assertTrue(any(kind==4 for kind,_ in messages(result.stdout)))
                decoded=subprocess.run([str(binary('check-output'))],input=result.stdout,capture_output=True,timeout=5)
                self.assertEqual(decoded.returncode,0,decoded.stderr)
    def test_bundled_latm_preserves_sample_clock_and_shared_source_offset(self):
        media=subprocess.check_output([str(binary('fixture')),'audio-latm-bundled'],timeout=5)
        for codec,rate in [(1,16000),(1,24000),(2,8000),(3,8000)]:
            with self.subTest(codec=codec,rate=rate):
                result=self.run_worker(config(max_frames=30,audio_codec=codec,audio_rate=rate,audio_channels=1,audio_bitrate=24000)+b''.join(frame(2,media[i:i+65536]) for i in range(0,len(media),65536))+frame(3))
                self.assertEqual(result.returncode,0,result.stderr)
                rows=messages(result.stdout)
                info=next(body for kind,body in rows if kind==5)
                padding=struct.unpack('!5I',info[:20])[3]
                audio=[body for kind,body in rows if kind==4]
                video=[body for kind,body in rows if kind==2]
                self.assertEqual(len(video),30)
                self.assertGreater(len(audio),90)
                pts=[struct.unpack('!q',body[:8])[0] for body in audio]
                self.assertTrue(all(b-a==20000 for a,b in zip(pts,pts[1:])))
                video_start=struct.unpack('!q',video[0][:8])[0]
                self.assertAlmostEqual(video_start-(pts[0]+padding*1000000/rate),64000,delta=1)
                # The independent decoder verifies all video colors and audible output.
                decoded=subprocess.run([str(binary('check-output')),'16','16','30','16','16'],input=result.stdout,capture_output=True,timeout=5)
                self.assertEqual(decoded.returncode,0,decoded.stderr)
    def test_bundled_latm_missing_initial_timestamp_fails_closed(self):
        media=bytearray(subprocess.check_output([str(binary('fixture')),'audio-latm-bundled'],timeout=5))
        headers=audio_pes_headers(media)
        self.assertGreater(len(headers),1)
        # Clear only the first PES PTS/DTS flags; keep its AAC payload intact.
        media[headers[0]+7]&=0x3f
        result=self.run_worker(config(max_frames=30,audio_codec=1,audio_rate=16000,audio_channels=1,audio_bitrate=24000)+b''.join(frame(2,media[i:i+65536]) for i in range(0,len(media),65536))+frame(3))
        self.assertEqual((result.returncode,result.stderr.splitlines()),(2,[b'BLINK_WORKER_AUDIO_TIMESTAMP']))
        self.assertNotIn((3,b''),messages(result.stdout))
    def test_bundled_latm_known_timestamp_retains_two_ms_discontinuity_boundary(self):
        source=subprocess.check_output([str(binary('fixture')),'audio-latm-bundled'],timeout=5)
        headers=audio_pes_headers(source)
        self.assertGreater(len(headers),1)
        for ticks,code in [(180,0),(181,2),(-181,2)]:
            with self.subTest(ticks=ticks):
                media=bytearray(source)
                shift_pes_pts(media,headers[1],ticks)
                result=self.run_worker(config(max_frames=30,audio_codec=1,audio_rate=16000,audio_channels=1,audio_bitrate=24000)+b''.join(frame(2,media[i:i+65536]) for i in range(0,len(media),65536))+frame(3))
                self.assertEqual(result.returncode,code,result.stderr)
                self.assertEqual(result.stderr.splitlines(),[] if code==0 else [b'BLINK_WORKER_AUDIO_DISCONTINUITY'])
                self.assertEqual((3,b'') in messages(result.stdout),code==0)
    def test_excessive_source_geometry_fails_closed(self):
        for width,height in [(4098,16),(4096,2050)]:
            with self.subTest(width=width,height=height):
                media=subprocess.check_output([str(binary('fixture')),'video',str(width),str(height),'15','1'],timeout=10)
                result=self.run_worker(config()+b''.join(frame(2,media[i:i+65536]) for i in range(0,len(media),65536))+frame(3))
                self.assertEqual(result.returncode,2)
                self.assertNotIn((3,b''),messages(result.stdout))
    def test_supported_audio_packets_decode_and_preserve_source_offset(self):
        media=subprocess.check_output([str(binary('fixture')),'audio'],timeout=5)
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
                decoded=subprocess.run([str(binary('check-output'))],input=result.stdout,capture_output=True,timeout=5)
                self.assertEqual(decoded.returncode,0,decoded.stderr)
    def test_source_geometry_preserves_aspect_and_accepts_2k_and_square(self):
        for width,height,inner_width,inner_height in [(2560,1440,640,360),(1920,1920,360,360),(640,480,480,360),(640,360,480,270)]:
            with self.subTest(width=width,height=height):
                out_width,out_height=(640,360) if width!=640 or height!=360 else (480,360)
                media=subprocess.check_output([str(binary('fixture')),'video',str(width),str(height),'15','4'],timeout=10)
                data=config(width=out_width,height=out_height)+b''.join(frame(2,media[i:i+65536]) for i in range(0,len(media),65536))+frame(3)
                result=self.run_worker(data)
                self.assertEqual(result.returncode,0,result.stderr)
                source=[struct.unpack('!4I',body) for kind,body in messages(result.stdout) if kind==7]
                self.assertEqual(len(source),1)
                self.assertEqual(source[0][:2],(width,height))
                self.assertGreater(source[0][3],0)
                self.assertLessEqual(source[0][2],120*source[0][3])
                decoded=subprocess.run([str(binary('check-output')),str(out_width),str(out_height),'4',str(inner_width),str(inner_height)],input=result.stdout,capture_output=True,timeout=5)
                self.assertEqual(decoded.returncode,0,decoded.stderr)
    def test_output_fps_selects_source_frames_without_resetting_timestamps(self):
        media=subprocess.check_output([str(binary('fixture')),'video','16','16','30','60','42'],timeout=5)
        outputs=[]
        for fps in [30,15]:
            result=self.run_worker(config(fps=fps,max_frames=60)+frame(2,media)+frame(3))
            self.assertEqual(result.returncode,0,result.stderr)
            outputs.append([struct.unpack('!q',body[:8])[0] for kind,body in messages(result.stdout) if kind==2])
        source,selected=outputs
        self.assertEqual(len(source),60)
        self.assertEqual(selected,source[::2])
        self.assertGreater(source[0],0)
    def test_recording_retains_native_rate_frames_with_submillisecond_clock_quantization(self):
        media=bytearray(subprocess.check_output([str(binary('fixture')),'video','16','16','30','90','42'],timeout=5))
        count=0
        for offset in range(0,len(media),188):
            if not media[offset+1]&0x40 or not media[offset+3]&0x10:continue
            start=offset+4
            if media[offset+3]&0x20:start+=1+media[start]
            if media[start:start+3]==b'\0\0\1' and media[start+3]&0xf0==0xe0:
                if count==1:shift_pes_pts(media,start,-3)
                count+=1
        self.assertEqual(count,90)
        result=self.run_worker(config(fps=30,max_frames=90,output_mode=1,fragment_ms=4000,iframe_ms=1000)+frame(2,media)+frame(3))
        self.assertEqual(result.returncode,0,result.stderr)
        rows=messages(result.stdout)
        prepared=b''.join(body if kind==8 else body[24:] for kind,body in rows if kind in (8,9))
        decoded=self.decode_recording(prepared)
        self.assertEqual(decoded['videoFrames'],90)
    def test_output_fps_retains_negotiated_cadence_for_noninteger_source_ratios(self):
        for source_fps,expected_count in [(20,90),(25,72)]:
            with self.subTest(source_fps=source_fps):
                media=subprocess.check_output([str(binary('fixture')),'video','16','16',str(source_fps),'120','42'],timeout=5)
                original=self.run_worker(config(fps=source_fps,max_frames=120)+frame(2,media)+frame(3))
                result=self.run_worker(config(fps=15,max_frames=120)+frame(2,media)+frame(3))
                self.assertEqual(original.returncode,0,original.stderr)
                self.assertEqual(result.returncode,0,result.stderr)
                source=[struct.unpack('!q',body[:8])[0] for kind,body in messages(original.stdout) if kind==2]
                selected=[struct.unpack('!q',body[:8])[0] for kind,body in messages(result.stdout) if kind==2]
                self.assertEqual(len(selected),expected_count)
                self.assertEqual(selected[0],source[0])
                self.assertTrue(all(pts in source for pts in selected))
                # Each output deadline selects an existing source frame without accumulating lateness.
                for index,pts in enumerate(selected):
                    offset=pts-source[0]-index*1000000/15
                    self.assertGreaterEqual(offset,-1)
                    self.assertLess(offset,1000000/source_fps+1)
                decoded=subprocess.run([str(binary('check-output')),'16','16',str(expected_count),'16','16','selected-source-frames'],input=result.stdout,capture_output=True,timeout=5)
                self.assertEqual(decoded.returncode,0,decoded.stderr)
    def test_negotiated_h264_profile_and_level_are_encoded_across_presets(self):
        for preset in [0,1]:
            for profile,profile_id,level,level_id in [(0,66,0,31),(1,77,1,32),(2,100,2,40)]:
                with self.subTest(preset=preset,profile=profile,level=level):
                    result=self.run_worker(config(software_preset=preset,video_profile=profile,video_level=level)+frame(2,self.media)+frame(3))
                    self.assertEqual(result.returncode,0,result.stderr)
                    packet=next(body[48:] for kind,body in messages(result.stdout) if kind==2)
                    sps=re.search(b'\x00\x00(?:\x00)?\x01\x67(.{3})',packet,re.DOTALL)
                    self.assertIsNotNone(sps)
                    self.assertEqual((sps[1][0],sps[1][2]),(profile_id,level_id))
                    decoded=subprocess.run([str(binary('check-output'))],input=result.stdout,capture_output=True,timeout=5)
                    self.assertEqual(decoded.returncode,0,decoded.stderr)
    def test_ultrafast_software_preset_encodes_and_unknown_preset_fails_closed(self):
        result=self.run_worker(config(software_preset=1)+frame(2,self.media)+frame(3))
        self.assertEqual(result.returncode,0,result.stderr)
        decoded=subprocess.run([str(binary('check-output'))],input=result.stdout,capture_output=True,timeout=5)
        self.assertEqual(decoded.returncode,0,decoded.stderr)
        self.assertEqual(self.run_worker(config(software_preset=2)).returncode,2)
    def test_eight_megabit_contract_preserves_profile_vbv_and_decode(self):
        for preset in [0,1]:
            with self.subTest(preset=preset):
                result=self.run_worker(config(bitrate=8000000,software_preset=preset,video_profile=2,video_level=0)+frame(2,self.media)+frame(3))
                self.assertEqual(result.returncode,0,result.stderr)
                encoded=b''.join(body[48:] for kind,body in messages(result.stdout) if kind==2)
                sps=re.search(b'\x00\x00(?:\x00)?\x01\x67(.{3})',encoded,re.DOTALL)
                self.assertIsNotNone(sps)
                self.assertEqual((sps[1][0],sps[1][2]),(100,31))
                # The pinned encoder reports its effective VBV settings in its public bitstream SEI.
                for setting in [b'bitrate',b'vbv_maxrate',b'vbv_bufsize']:
                    match=re.search(rb'\b'+setting+rb'=(\d+)\b',encoded)
                    self.assertIsNotNone(match)
                    self.assertEqual(int(match[1]),8000)
                decoded=subprocess.run([str(binary('check-output'))],input=result.stdout,capture_output=True,timeout=5)
                self.assertEqual(decoded.returncode,0,decoded.stderr)
        self.assertEqual(self.run_worker(config(bitrate=8000001)).returncode,2)
    def test_opus_packet_duration_matches_negotiated_selection(self):
        media=subprocess.check_output([str(binary('fixture')),'audio'],timeout=5)
        for rate in [16000,24000]:
            for duration in [10,20,40,60]:
                with self.subTest(rate=rate,duration=duration):
                    result=self.run_worker(config(audio_codec=1,audio_rate=rate,audio_channels=1,audio_bitrate=24000,audio_packet_ms=duration)+frame(2,media)+frame(3))
                    self.assertEqual(result.returncode,0,result.stderr)
                    packets=[body for kind,body in messages(result.stdout) if kind==4]
                    self.assertGreater(len(packets),1)
                    self.assertTrue(all(struct.unpack('!q',body[16:24])[0]==duration*1000 for body in packets[:-1]))
    def test_unsupported_audio_config_is_fatal(self):
        for changes in [dict(audio_codec=4),dict(audio_codec=1,audio_rate=8000,audio_channels=1,audio_bitrate=24000),dict(audio_codec=2,audio_rate=16000,audio_channels=1,audio_bitrate=24000),dict(audio_codec=1,audio_rate=16000,audio_channels=2,audio_bitrate=24000)]:
            self.assertEqual(self.run_worker(config(**changes)).returncode,2)
    def test_optional_absent_audio_does_not_invent_packets(self):
        result=self.run_worker(config(audio_codec=1,audio_rate=16000,audio_channels=1,audio_bitrate=24000)+frame(2,self.media)+frame(3))
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse(any(kind in (4,5) for kind,_ in messages(result.stdout)))
    def test_audio_discontinuity_fails_closed(self):
        media=subprocess.check_output([str(binary('fixture')),'audio'],timeout=5)
        result=self.run_worker(config(audio_codec=1,audio_rate=16000,audio_channels=1,audio_bitrate=24000)+frame(2,media+media)+frame(3))
        self.assertEqual(result.returncode,2)
        self.assertNotIn((3,b''),messages(result.stdout))

    def test_partial_header_and_payload_are_fatal(self):
        for data in [b'BMI', frame(1, b'\0'*23)[:-1], config() + frame(2, b'abc')[:-1]]:
            with self.subTest(data_length=len(data)):
                self.assertEqual(self.run_worker(data).returncode, 2)
    def test_config_validation_and_duplicate_config(self):
        for values in [dict(width=0), dict(width=1922), dict(height=1082), dict(width=17), dict(fps=31), dict(bitrate=0), dict(max_frames=9001), dict(software_preset=2)]:
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
