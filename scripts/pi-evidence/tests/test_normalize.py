import hashlib
import base64
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from normalize import build_report


def event(t, source='shell', raw=None, boot='boot', mono=None):
    return {'event_id': hashlib.sha256((str(t)+str(raw)).encode()).hexdigest(), 'source': source, 'raw': raw or {},
            'received_at': t, 'boot_id': boot, 'monotonic': mono if mono is not None else t}


class NormalizeTests(unittest.TestCase):
    def test_paired_shell_duration_and_local_offset(self):
        rows = [event(100, raw={'session_id':'s','event':'start'}),
                event(160, raw={'session_id':'s','event':'end'})]
        report = build_report(rows, 110, 150)
        s = report['sessions'][0]
        self.assertEqual(s['duration_seconds'], 60)
        self.assertEqual(s['kind'], 'connect_shell_process')
        self.assertEqual(s['boundary_state'], 'paired')
        self.assertIn('+01:00', s['start_local'])

    def test_known_session_overlap_uses_half_open_requested_window(self):
        cases = ((10, 99.999, False), (10, 100, False), (10, 100.001, True),
                 (100, 110, True), (199.999, 210, True), (200, 210, False))
        for left, right, intersects in cases:
            for ordered in (False, True):
                with self.subTest(left=left, right=right, already_ordered=ordered):
                    rows = [event(left, raw={'session_id':'s', 'event':'start'}),
                            event(right, raw={'session_id':'s', 'event':'end'})]
                    report = build_report(rows, 100, 200, already_ordered=ordered)
                    self.assertEqual(bool(report['sessions']), intersects)
                    if intersects:
                        self.assertEqual(report['sessions'][0]['window_intersection'], 'observed')

    def test_unknown_end_before_window_remains_possible_context(self):
        rows = [event(10, raw={'session_id':'s', 'event':'start'}),
                event(99.999, raw={'session_id':'s', 'event':'heartbeat'})]
        session = build_report(rows, 100, 200)['sessions'][0]
        self.assertIsNone(session['end'])
        self.assertEqual(session['window_intersection'], 'possible_end_unknown')

    def test_expired_start_is_not_invented(self):
        rows = [event(150, raw={'session_id':'s','event':'heartbeat'}),
                event(200, raw={'session_id':'s','event':'end'})]
        s = build_report(rows, 100, 250)['sessions'][0]
        self.assertIsNone(s['start'])
        self.assertIsNone(s['duration_seconds'])
        self.assertEqual(s['boundary_state'], 'start_unknown')

    def test_duplicate_end_does_not_create_session(self):
        rows = [event(t, raw={'session_id':'s','event':kind}) for t,kind in [(100,'start'),(160,'end'),(161,'end')]]
        self.assertEqual(len(build_report(rows, 0, 200)['sessions']), 1)

    def test_ssh_uses_source_monotonic_not_replay_speed(self):
        rows = []
        for t, mono, msg in [(100, 10_000_000, 'Accepted publickey for andrew from 10.0.0.1 port 1234 ssh2: ED25519 SHA256:test'),
                             (160, 70_000_000, 'Disconnected from user andrew 10.0.0.1 port 1234')]:
            raw = {'MESSAGE':msg, '_PID':'20', '__REALTIME_TIMESTAMP':str(t*1000000), '__MONOTONIC_TIMESTAMP':str(mono)}
            rows.append(event(t, source='journal', raw=json.dumps(raw), mono=999))
        s = build_report(rows, 0, 200)['sessions'][0]
        self.assertEqual(s['duration_seconds'],60)
        self.assertEqual(s['remote_port'], '1234')
        self.assertEqual(s['auth_method'], 'publickey')

    def test_pid_reuse_separates_connections_and_channels(self):
        messages = ['Accepted publickey for a from 1.2.3.4 port 2 ssh2',
                    'Starting session: shell on pts/0 for a from 1.2.3.4 port 2 id 0',
                    'Close session: user a from 1.2.3.4 port 2 id 0',
                    'Disconnected from user a 1.2.3.4 port 2',
                    'Accepted publickey for a from 1.2.3.4 port 3 ssh2']
        rows = [event(100+i, 'journal', {'MESSAGE':m, '_PID':'10'}) for i,m in enumerate(messages)]
        sessions = build_report(rows, 0, 200)['sessions']
        self.assertEqual(len(sessions),3)
        self.assertEqual(len({s['session_id'] for s in sessions}),3)

    def test_audit_keeps_args_only_in_raw_and_marks_partial(self):
        rows = [event(100, 'audit', 'type=SYSCALL msg=audit(100.0:1): pid=5 ppid=1 uid=1000 auid=4294967295 exe="/bin/echo"'),
                event(100, 'audit', 'type=EXECVE msg=audit(100.0:1): a0="echo" a1="SECRET"')]
        result = build_report(rows,0,200)
        self.assertNotIn('SECRET',json.dumps(result))
        self.assertFalse(result['activity'][0]['complete'])
        self.assertEqual(result['activity'][0]['attribution'],'unproven')

    def test_base64_and_healthy_states(self):
        text = 'type=SYSCALL msg=audit(100.0:1): pid=5 uid=1000'
        rows = [event(100,'audit',{'content_encoding':'base64','raw_base64':base64.b64encode(text.encode()).decode()}),
                event(100,'health',{'source':'audit','state':'ok'})]
        result = build_report(rows,0,200)
        self.assertEqual(len(result['activity']),1)
        self.assertEqual(result['coverage']['gaps'],[])

    def test_unregistered_connect_process_is_coverage_gap(self):
        result = build_report([event(100, raw={'event':'observed_process','pid':2,'start_ticks':3})], 0, 200)
        self.assertEqual(result['coverage']['state'], 'source_gap')
        self.assertEqual(result['sessions'], [])

    def test_open_session_before_window_is_retained_as_possible(self):
        result = build_report([event(10, raw={'event':'start','session_id':'s'})], 100, 200)
        self.assertEqual(result['sessions'][0]['window_intersection'], 'possible_end_unknown')
        self.assertIsNone(result['sessions'][0]['end'])

    def test_homebridge_failure_timeline_is_categorized_without_message(self):
        raw = '\x1b[37m[28/9/2026, 08:17:01] \x1b[39m[Blink] request timed out token=SECRET'
        rows = [event(1, 'homebridge', raw)]
        result = build_report(rows, 0, 2_000_000_000)
        item = result['timeline'][0]
        self.assertEqual(item['category'], 'timeout')
        self.assertNotIn('message', item)
        self.assertNotIn('SECRET', json.dumps(result))

    def test_probe_timeline_keeps_only_kind_status_and_latency(self):
        raw = {'event':'probe_set','results':[{'kind':'dns','ok':False,'elapsed_ms':3001,
                                               'output':'SECRET ADDRESS','argv':['getent','ahosts','secret']}]}
        item = build_report([event(100, 'probe', raw)], 0, 200)['timeline'][0]
        self.assertEqual(item['kind'], 'dns')
        self.assertFalse(item['ok'])
        self.assertEqual(item['latency_ms'], 3001)
        self.assertNotIn('SECRET', json.dumps(item))

    def test_network_journal_timeline_is_category_only(self):
        raw = {'MESSAGE':'DNS lookup failed for private.internal token=SECRET',
               '_SYSTEMD_UNIT':'NetworkManager.service'}
        item = build_report([event(100, 'journal', raw)], 0, 200)['timeline'][0]
        self.assertEqual(item['component'], 'network_manager')
        self.assertEqual(item['category'], 'dns_failure')
        self.assertNotIn('SECRET', json.dumps(item))

    def test_direct_ssh_child_attribution_requires_live_parent_interval(self):
        rows = [event(100, 'journal', {'MESSAGE':'Accepted publickey for a from 1.2.3.4 port 2 ssh2', '_PID':'10'}),
                event(110, 'journal', {'MESSAGE':'Starting session: shell on pts/0 for a from 1.2.3.4 port 2 id 0', '_PID':'11'}),
                event(150, 'journal', {'MESSAGE':'Disconnected from user a 1.2.3.4 port 2', '_PID':'11'}),
                event(120, 'audit', 'type=SYSCALL msg=audit(120.0:1): pid=20 ppid=11 uid=1000'),
                event(180, 'audit', 'type=SYSCALL msg=audit(180.0:2): pid=21 ppid=11 uid=1000')]
        rows = build_report(rows, 0, 200)['activity']
        self.assertEqual(rows[0]['attribution'], 'direct_child_of_observed_ssh_process')
        self.assertEqual(rows[1]['attribution'], 'unproven')

    def test_delayed_audit_ingestion_uses_execution_time_inside_shell_window(self):
        rows = [event(100, raw={'session_id':'s','event':'start','pid':990106}),
                event(133, raw={'session_id':'s','event':'end','pid':990106}),
                event(196, 'audit',
                      'type=SYSCALL msg=audit(107.0:10078): pid=991302 ppid=990106 uid=1000 auid=1000 ses=1')]
        for ordered in (False, True):
            with self.subTest(already_ordered=ordered):
                result = build_report(rows, 90, 150, already_ordered=ordered)
                self.assertEqual(result['activity'][0]['attribution'], 'direct_child_of_observed_shell')
                self.assertEqual(result['activity'][0]['session_id'], 'boot:shell:s')
                self.assertEqual(result['coverage']['sources']['audit']['first'], '1970-01-01T00:01:47+00:00')

    def test_audit_window_uses_execution_time_with_delayed_receipt(self):
        for at, included in ((89.999, False), (90, True), (149.999, True), (150, False)):
            with self.subTest(executed_at=at):
                result = build_report([event(200, 'audit',
                    f'type=SYSCALL msg=audit({at}:10078): pid=7 ppid=6 uid=1000')],
                    90, 150, already_ordered=True)
                self.assertEqual(bool(result['activity']), included)

    def test_delayed_audit_ingestion_rejects_execution_after_shell_closed(self):
        rows = [event(100, raw={'session_id':'s','event':'start','pid':990106}),
                event(133, raw={'session_id':'s','event':'end','pid':990106}),
                event(120, 'audit',
                      'type=SYSCALL msg=audit(140.0:10080): pid=991304 ppid=990106 uid=1000 auid=1000 ses=1')]
        result = build_report(rows, 90, 150)
        self.assertEqual(result['activity'][0]['attribution'], 'unproven')
        self.assertIsNone(result['activity'][0]['session_id'])

    def test_restart_gap_intersects_window_before_new_startup(self):
        result = build_report([event(200, 'collector', {'event':'gap','last_heartbeat':{'wall_time':100},'resumed_at':200})], 150, 170)
        self.assertEqual(result['coverage']['state'], 'source_gap')

    def test_procfs_and_journal_boot_formats_correlate(self):
        rows = [event(100, raw={'session_id':'s','event':'start','pid':9}, boot='aabb-ccdd'),
                event(150, raw={'session_id':'s','event':'end','pid':9}, boot='aabb-ccdd'),
                event(120, 'audit', 'type=SYSCALL msg=audit(120.0:1): pid=10 ppid=9 uid=1000', boot='aabbccdd')]
        result = build_report(rows, 0, 200)
        self.assertEqual(result['activity'][0]['attribution'], 'direct_child_of_observed_shell')

    def test_unique_kernel_audit_session_propagates_proven_ssh_origin(self):
        rows = [event(100, 'journal', {'MESSAGE':'Accepted publickey for a from 1.2.3.4 port 2 ssh2', '_PID':'10'}),
                event(150, 'journal', {'MESSAGE':'Disconnected from user a 1.2.3.4 port 2', '_PID':'11'}),
                event(110, 'audit', 'type=SYSCALL msg=audit(110.0:1): pid=20 ppid=10 uid=1000 ses=7'),
                event(120, 'audit', 'type=SYSCALL msg=audit(120.0:2): pid=21 ppid=20 uid=1000 ses=7')]
        activity = build_report(rows, 0, 200)['activity']
        self.assertEqual(activity[0]['attribution'], 'direct_child_of_observed_ssh_process')
        self.assertEqual(activity[1]['attribution'], 'kernel_audit_session_origin')
        self.assertEqual(activity[1]['session_id'], activity[0]['session_id'])
        self.assertEqual(activity[1]['attribution_evidence_ids'], activity[0]['evidence_ids'])

    def test_unset_kernel_audit_session_never_propagates(self):
        rows = [event(100, 'journal', {'MESSAGE':'Accepted publickey for a from 1.2.3.4 port 2 ssh2', '_PID':'10'}),
                event(150, 'journal', {'MESSAGE':'Disconnected from user a 1.2.3.4 port 2', '_PID':'11'}),
                event(110, 'audit', 'type=SYSCALL msg=audit(110.0:1): pid=20 ppid=10 uid=1000 ses=4294967295'),
                event(120, 'audit', 'type=SYSCALL msg=audit(120.0:2): pid=21 ppid=20 uid=1000 ses=4294967295')]
        activity = build_report(rows, 0, 200)['activity']
        self.assertEqual(activity[0]['attribution'], 'direct_child_of_observed_ssh_process')
        self.assertEqual(activity[1]['attribution'], 'unproven')

    def test_conflicting_kernel_audit_session_origins_do_not_propagate(self):
        rows = [event(100, 'journal', {'MESSAGE':'Accepted publickey for a from 1.2.3.4 port 2 ssh2', '_PID':'10'}),
                event(101, 'journal', {'MESSAGE':'Accepted publickey for a from 1.2.3.5 port 3 ssh2', '_PID':'30'}),
                event(150, 'journal', {'MESSAGE':'Disconnected from user a 1.2.3.4 port 2', '_PID':'11'}),
                event(151, 'journal', {'MESSAGE':'Disconnected from user a 1.2.3.5 port 3', '_PID':'31'}),
                event(110, 'audit', 'type=SYSCALL msg=audit(110.0:1): pid=20 ppid=10 uid=1000 ses=7'),
                event(111, 'audit', 'type=SYSCALL msg=audit(111.0:2): pid=40 ppid=30 uid=1000 ses=7'),
                event(120, 'audit', 'type=SYSCALL msg=audit(120.0:3): pid=21 ppid=20 uid=1000 ses=7')]
        activity = build_report(rows, 0, 200)['activity']
        self.assertEqual(activity[0]['attribution'], 'direct_child_of_observed_ssh_process')
        self.assertEqual(activity[1]['attribution'], 'direct_child_of_observed_ssh_process')
        self.assertEqual(activity[2]['attribution'], 'unproven')

    def test_retained_context_does_not_prove_capture_in_requested_window(self):
        rows = [event(10, raw={'session_id':'s', 'event':'start'}),
                event(200, raw={'session_id':'s', 'event':'end'})]
        report = build_report(rows, 100, 150)
        self.assertEqual(report['coverage']['state'], 'no_window_observation')
        self.assertEqual(len(report['sessions']), 1)

    def test_coverage_uses_half_open_execution_time_window_not_receipt(self):
        for at, observed in ((99.999, False), (100, True), (149.999, True), (150, False)):
            with self.subTest(executed_at=at):
                row = event(120, 'audit', f'type=SYSCALL msg=audit({at}:1): pid=20 ppid=10')
                report = build_report([row], 100, 150)
                self.assertEqual(report['coverage']['state'], 'capture_observed' if observed else 'no_window_observation')

    def test_late_ssh_pid_alias_does_not_attribute_earlier_execution(self):
        rows = [event(100, 'journal', {'MESSAGE':'Accepted publickey for a from 1.2.3.4 port 2 ssh2', '_PID':'10'}),
                event(150, 'journal', {'MESSAGE':'Disconnected from user a 1.2.3.4 port 2', '_PID':'11'}),
                event(120, 'audit', 'type=SYSCALL msg=audit(120.0:1): pid=20 ppid=11 uid=1000')]
        for ordered in (False, True):
            with self.subTest(already_ordered=ordered):
                row = build_report(rows, 0, 200, already_ordered=ordered)['activity'][0]
                self.assertEqual(row['attribution'], 'unproven')
                self.assertIsNone(row['session_id'])

    def test_pid_alias_proof_respects_generation_and_boot(self):
        rows = [event(100, 'journal', {'MESSAGE':'Accepted publickey for a from 1.2.3.4 port 2 ssh2', '_PID':'10'}),
                event(150, 'journal', {'MESSAGE':'Disconnected from user a 1.2.3.4 port 2', '_PID':'11'}),
                event(160, 'journal', {'MESSAGE':'Accepted publickey for a from 1.2.3.4 port 3 ssh2', '_PID':'10'}),
                event(190, 'journal', {'MESSAGE':'Disconnected from user a 1.2.3.4 port 3', '_PID':'12'}),
                event(170, 'audit', 'type=SYSCALL msg=audit(170.0:1): pid=20 ppid=11 uid=1000'),
                event(120, 'audit', 'type=SYSCALL msg=audit(120.0:2): pid=21 ppid=10 uid=1000', boot='other')]
        self.assertTrue(all(row['attribution'] == 'unproven' for row in build_report(rows, 0, 200)['activity']))

    def test_kernel_origin_proof_never_propagates_backward(self):
        rows = [event(100, 'journal', {'MESSAGE':'Accepted publickey for a from 1.2.3.4 port 2 ssh2', '_PID':'10'}),
                event(150, 'journal', {'MESSAGE':'Disconnected from user a 1.2.3.4 port 2', '_PID':'11'}),
                event(105, 'audit', 'type=SYSCALL msg=audit(105.0:1): pid=21 ppid=20 uid=1000 ses=7'),
                event(110, 'audit', 'type=SYSCALL msg=audit(110.0:2): pid=20 ppid=10 uid=1000 ses=7'),
                event(120, 'audit', 'type=SYSCALL msg=audit(120.0:3): pid=22 ppid=20 uid=1000 ses=7'),
                event(130, 'audit', 'type=SYSCALL msg=audit(130.0:4): pid=23 ppid=10 uid=1000 ses=7')]
        for ordered in (False, True):
            with self.subTest(already_ordered=ordered):
                activity = build_report(rows, 0, 200, already_ordered=ordered)['activity']
                self.assertEqual(activity[0]['attribution'], 'unproven')
                self.assertEqual(activity[2]['attribution'], 'kernel_audit_session_origin')
                self.assertEqual(activity[2]['attribution_evidence_ids'], activity[1]['evidence_ids'])

    def test_empty_window_has_no_claim_of_absence(self):
        self.assertEqual(build_report([],0,200)['coverage']['state'],'collector_not_yet_deployed')

if __name__ == '__main__': unittest.main()
