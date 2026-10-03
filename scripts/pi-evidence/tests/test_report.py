from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
import threading
import socket
import subprocess
import shlex
from datetime import datetime, timezone
from contextlib import contextmanager
from unittest import mock
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

import report  # noqa: E402
import store  # noqa: E402


class ReportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.store = store.Store(self.base / "store", min_free_bytes=0)
        self.store.append("health", {"state": "ok"}, source_id="health-1", source_time=10.0)
        self.store.append("journal", {"MESSAGE": "accepted"}, source_id="cursor-1", source_time=20.0)

    def tearDown(self) -> None:
        self.store.close()
        self.temp.cleanup()

    def test_export_verify_and_offline_reproduce(self) -> None:
        output = self.store.root / "exports" / "incident"
        result = report.export_bundle(
            self.store, 0, 100, output, provenance={"command": "test export", "timezone": "Europe/Dublin"}
        )
        self.assertTrue(result["valid"])
        verified = report.verify_bundle(output)
        replayed = report.reproduce(output)
        self.assertTrue(verified["valid"])
        self.assertTrue(replayed["reproduced"])
        self.assertEqual(replayed["event_count"], 2)
        self.assertEqual(output.stat().st_mode & 0o777, 0o700)
        self.assertTrue(all(path.stat().st_mode & 0o777 == 0o600 for path in output.rglob("*") if path.is_file()))
        self.assertTrue(all(path.stat().st_mode & 0o777 == 0o700 for path in output.rglob("*") if path.is_dir()))
        provenance = json.loads((output / "provenance.json").read_text())
        self.assertTrue(provenance["parameters"]["all_retained_context_included"])
        self.assertEqual(provenance["operator_provenance"]["timezone"], "Europe/Dublin")
        self.assertTrue((output / "normalize.py").is_file())
        self.assertFalse((output / "reproduce.sh").exists())
        for name in ("activity.jsonl", "timeline.jsonl"):
            for line in (output / name).read_text().splitlines():
                self.assertIsInstance(json.loads(line), dict)

    def test_export_reproduce_orders_original_times_without_source_time(self) -> None:
        base = datetime(2026, 1, 1, 12, tzinfo=timezone.utc).timestamp()
        # Store ordering follows receipts when source_time is absent. Deliberately
        # receive end/close before start/channel, and later audit before earlier audit.
        received_order = [
            ('journal', 'delayed-end', {'MESSAGE':'Disconnected from user a 1.2.3.4 port 2', '_PID':'11',
                '__REALTIME_TIMESTAMP':str(int((base + 150) * 1_000_000)), '__MONOTONIC_TIMESTAMP':'60000000'}),
            ('journal', 'delayed-channel-close', {'MESSAGE':'Close session: user a from 1.2.3.4 port 2 id 0', '_PID':'11',
                '__REALTIME_TIMESTAMP':str(int((base + 140) * 1_000_000)), '__MONOTONIC_TIMESTAMP':'50000000'}),
            ('audit', 'delayed-audit-later', f'type=SYSCALL msg=audit({base + 120}:2): pid=21 ppid=11 uid=1000 ses=7'),
            ('homebridge', 'delayed-homebridge', {'message':'[1/1/2026, 12:02:05] [Blink] request timed out token=SECRET'}),
            ('journal', 'delayed-channel-start', {'MESSAGE':'Starting session: shell on pts/0 for a from 1.2.3.4 port 2 id 0', '_PID':'11',
                '__REALTIME_TIMESTAMP':str(int((base + 110) * 1_000_000)), '__MONOTONIC_TIMESTAMP':'20000000'}),
            ('journal', 'delayed-start', {'MESSAGE':'Accepted publickey for a from 1.2.3.4 port 2 ssh2', '_PID':'10',
                '__REALTIME_TIMESTAMP':str(int((base + 100) * 1_000_000)), '__MONOTONIC_TIMESTAMP':'10000000'}),
            ('audit', 'delayed-audit-earlier', f'type=SYSCALL msg=audit({base + 105}:1): pid=20 ppid=11 uid=1000 ses=7'),
        ]
        for source, source_id, raw in received_order:
            self.store.append(source, raw, source_id=source_id, boot_id='boot')
        retained = [row for row in self.store.read_events() if str(row['source_id']).startswith('delayed-')]
        self.assertEqual([row['source_id'] for row in retained], [source_id for _, source_id, _ in received_order])
        self.assertTrue(all(row['source_time'] is None for row in retained))
        output = self.store.root / 'exports' / 'delayed-original-times'
        report.export_bundle(self.store, base + 90, base + 160, output)
        stored = json.loads((output / 'report.json').read_text())
        replayed = report.reproduce(output)
        self.assertTrue(replayed['reproduced'])
        self.assertEqual(stored['coverage']['state'], 'capture_observed')
        connection = next(row for row in stored['sessions'] if row['kind'] == 'ssh_connection')
        channel = next(row for row in stored['sessions'] if row['kind'] == 'ssh_channel')
        self.assertEqual(connection['start'], '2026-01-01T12:01:40+00:00')
        self.assertEqual(connection['end'], '2026-01-01T12:02:30+00:00')
        self.assertEqual(connection['duration_seconds'], 50)
        self.assertEqual(channel['duration_seconds'], 30)
        self.assertTrue(all(row['boundary_state'] == 'paired' for row in stored['sessions']))
        activity = stored['activity']
        self.assertEqual(activity[0]['audit_serial'], '1')
        self.assertEqual(activity[0]['attribution'], 'unproven')
        self.assertEqual(activity[1]['audit_serial'], '2')
        self.assertEqual(activity[1]['attribution'], 'direct_child_of_observed_ssh_process')
        homebridge = next(row for row in stored['timeline'] if row['source'] == 'homebridge')
        self.assertEqual(homebridge['at'], '2026-01-01T12:02:05+00:00')
        self.assertEqual(homebridge['category'], 'timeout')
        self.assertNotIn('SECRET', json.dumps(replayed['report']))

    def test_manifest_valid_malicious_normalizer_is_data_only(self) -> None:
        output = self.store.root / "exports" / "malicious"
        report.export_bundle(self.store, 0, 100, output)
        marker = self.base / "executed"
        (output / "normalize.py").write_text(f"from pathlib import Path\nPath({str(marker)!r}).write_text('executed')\nraise RuntimeError('executed')\n")
        manifest = "".join(f"{report._hash(p)}  {p.relative_to(output).as_posix()}\n"
                           for p in sorted(output.rglob('*')) if p.is_file() and p != output / 'manifest.sha256')
        (output / "manifest.sha256").write_text(manifest)
        self.assertTrue(report.verify_bundle(output)["valid"])
        self.assertTrue(report.reproduce(output)["reproduced"])
        self.assertFalse(marker.exists())

    def test_tamper_is_detected_before_replay(self) -> None:
        output = self.store.root / "exports" / "incident"
        report.export_bundle(self.store, 0, 100, output)
        with (output / "raw" / "events.jsonl").open("ab") as handle:
            handle.write(b"{}\n")
        with self.assertRaisesRegex(report.BundleError, "hash mismatch"):
            report.verify_bundle(output)
        with self.assertRaisesRegex(report.BundleError, "hash mismatch"):
            report.reproduce(output)

    def test_refuses_overwrite_and_symlink_output(self) -> None:
        output = self.store.root / "exports" / "incident"
        output.parent.mkdir(mode=0o700)
        output.mkdir()
        marker = output / "keep"
        marker.write_text("safe")
        with self.assertRaises(report.BundleError):
            report.export_bundle(self.store, 0, 100, output)
        self.assertEqual(marker.read_text(), "safe")
        link = self.base / "link"
        link.symlink_to(output, target_is_directory=True)
        with self.assertRaises(report.BundleError):
            report.export_bundle(self.store, 0, 100, link)

    def test_manifest_rejects_unlisted_file(self) -> None:
        output = self.store.root / "exports" / "incident"
        report.export_bundle(self.store, 0, 100, output)
        extra = output / "unexpected"
        extra.write_text("x")
        with self.assertRaisesRegex(report.BundleError, "file set differs"):
            report.verify_bundle(output)

    @unittest.skipUnless(hasattr(os, 'mkfifo'), 'FIFO unavailable')
    def test_verification_rejects_fifo_before_hashing_listed_or_unlisted(self) -> None:
        output = self.store.root / 'exports' / 'special'
        report.export_bundle(self.store, 0, 100, output)
        extra = output / 'unexpected-fifo'
        os.mkfifo(extra)
        for listed in (False, True):
            with self.subTest(listed=listed):
                if listed:
                    with (output / 'manifest.sha256').open('a') as manifest:
                        manifest.write('0' * 64 + '  unexpected-fifo\n')
                with mock.patch.object(report, '_hash', side_effect=AssertionError('must reject before hashing')):
                    with self.assertRaisesRegex(report.BundleError, 'unsafe entries'):
                        report.verify_bundle(output)

    @unittest.skipUnless(hasattr(socket, 'AF_UNIX'), 'Unix socket unavailable')
    def test_verification_rejects_unlisted_socket(self) -> None:
        output = self.store.root / 'exports' / 'socket'
        report.export_bundle(self.store, 0, 100, output)
        with tempfile.TemporaryDirectory(dir='/tmp') as short_root:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as listener:
                short_socket = Path(short_root) / 'socket'
                listener.bind(str(short_socket))
                short_socket.rename(output / 'unexpected.sock')
                with self.assertRaisesRegex(report.BundleError, 'unsafe entries'):
                    report.verify_bundle(output)

    def test_verification_rejects_symlink_and_unlisted_directory(self) -> None:
        output = self.store.root / 'exports' / 'unsafe'
        report.export_bundle(self.store, 0, 100, output)
        extra = output / 'unexpected'
        extra.symlink_to(output / 'report.json')
        with self.assertRaisesRegex(report.BundleError, 'unsafe entries'):
            report.verify_bundle(output)
        extra.unlink()
        extra.mkdir()
        with self.assertRaisesRegex(report.BundleError, 'directory set differs'):
            report.verify_bundle(output)

    def test_generated_trusted_commands_locate_installed_repository_tool(self) -> None:
        output = self.store.root / 'exports' / 'commands'
        report.export_bundle(self.store, 0, 100, output)
        commands = json.loads((output / 'provenance.json').read_text())['reproduction']
        readme = (output / 'README.txt').read_text()
        repository = HERE.parents[1]
        for field in ('verify_command', 'reproduce_command'):
            command = commands[field]
            self.assertIn('/trusted/install/scripts/pi-evidence/report.py', command)
            argv = shlex.split(command.replace('/trusted/install', str(repository)).replace('/path/to/bundle', str(output)))
            argv[0] = sys.executable
            result = subprocess.run(argv, check=True, capture_output=True, text=True, timeout=10)
            self.assertTrue(json.loads(result.stdout)['valid' if field == 'verify_command' else 'reproduced'])
        self.assertIn(commands['reproduce_command'], readme)

    def test_unlisted_nested_manifest_is_rejected(self) -> None:
        output = self.store.root / 'exports' / 'nested-unlisted'
        report.export_bundle(self.store, 0, 100, output)
        (output / 'raw' / 'manifest.sha256').write_text('unlisted arbitrary content')
        with self.assertRaisesRegex(report.BundleError, 'file set differs'):
            report.verify_bundle(output)

    def test_listed_nested_manifest_is_hashed_and_tamper_is_rejected(self) -> None:
        output = self.store.root / 'exports' / 'nested-listed'
        report.export_bundle(self.store, 0, 100, output)
        nested = output / 'raw' / 'manifest.sha256'
        nested.write_text('ordinary listed evidence content')
        with (output / 'manifest.sha256').open('a') as manifest:
            manifest.write(f'{report._hash(nested)}  raw/manifest.sha256\n')
        self.assertTrue(report.verify_bundle(output)['valid'])
        self.assertTrue(report.reproduce(output)['reproduced'])
        nested.write_text('tampered content')
        with self.assertRaisesRegex(report.BundleError, 'hash mismatch: raw/manifest.sha256'):
            report.verify_bundle(output)

    def test_export_must_remain_in_managed_exports_and_respect_budget(self) -> None:
        with self.assertRaisesRegex(report.BundleError, "direct child"):
            report.export_bundle(self.store, 0, 100, self.base / "outside")
        self.store.max_bytes = self.store.status()["managed_bytes"]
        with self.assertRaisesRegex(report.BundleError, "capacity"):
            report.export_bundle(self.store, 0, 100, self.store.root / "exports" / "too-large")

    def test_append_after_sizing_does_not_change_reserved_export_snapshot(self) -> None:
        output = self.store.root / "exports" / "snapshot"
        initial_ids = {event["event_id"] for event in self.store.read_events()}
        start_append = threading.Event()
        append_finished = threading.Event()
        errors = []
        admitted = []
        writes = []
        original_reserve = self.store.reserve
        original_write = self.store.write_reserved

        def writer() -> None:
            start_append.wait()
            try:
                # Much larger than the original raw budget: the old second read
                # deterministically violates its reservation after this append.
                self.store.append("concurrent", {"payload": "x" * 128 * 1024}, source_id="after-snapshot")
            except Exception as error:
                errors.append(error)
            finally:
                append_finished.set()

        @contextmanager
        def reserve_after_snapshot(size):
            with original_reserve(size) as reservation:
                admitted.append(size)
                start_append.set()
                self.assertTrue(append_finished.wait(10), "append did not complete at reservation boundary")
                if errors:
                    raise errors[0]
                yield reservation

        def materialize(reservation, fd, data):
            writes.append(len(data))
            return original_write(reservation, fd, data)

        thread = threading.Thread(target=writer)
        thread.start()
        try:
            with mock.patch.object(self.store, "reserve", side_effect=reserve_after_snapshot), \
                    mock.patch.object(self.store, "write_reserved", side_effect=materialize):
                self.assertTrue(report.export_bundle(self.store, 0, 4_102_444_800, output)["valid"])
        finally:
            start_append.set()
            thread.join(timeout=10)
        self.assertFalse(thread.is_alive())
        self.assertEqual(errors, [])
        raw = [json.loads(line) for line in (output / "raw" / "events.jsonl").read_text().splitlines()]
        self.assertEqual({event["event_id"] for event in raw}, initial_ids)
        self.assertTrue(any(event["source_id"] == "after-snapshot" for event in self.store.read_events()))
        self.assertEqual(json.loads((output / "report.json").read_text())["event_count"], len(initial_ids))
        self.assertTrue(report.reproduce(output)["reproduced"])
        self.assertLessEqual(sum(writes), admitted[0])
        self.assertEqual(self.store.status()["reserved_bytes"], 0)

    def test_csv_formula_values_are_escaped(self) -> None:
        self.assertEqual(report._csv_safe("=cmd()"), "'=cmd()")
        self.assertEqual(report._csv_safe("ordinary"), "ordinary")

    def test_concurrent_append_does_not_make_bundle_internally_inconsistent(self) -> None:
        output = self.store.root / "exports" / "concurrent"
        start = threading.Event()

        def writer() -> None:
            start.wait()
            for number in range(30):
                self.store.append("concurrent", {"n": number}, source_id=f"concurrent-{number}")

        thread = threading.Thread(target=writer)
        thread.start()
        start.set()
        report.export_bundle(self.store, 0, 4_102_444_800, output)
        thread.join(timeout=10)
        self.assertFalse(thread.is_alive())
        self.assertTrue(report.reproduce(output)["reproduced"])
        stored = json.loads((output / "report.json").read_text())
        raw_count = sum(1 for line in (output / "raw" / "events.jsonl").read_text().splitlines() if line)
        self.assertEqual(stored["event_count"], raw_count)


if __name__ == "__main__":
    unittest.main()
