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

    def test_manifest_valid_malicious_normalizer_is_data_only(self) -> None:
        output = self.store.root / "exports" / "malicious"
        report.export_bundle(self.store, 0, 100, output)
        marker = self.base / "executed"
        (output / "normalize.py").write_text(f"from pathlib import Path\nPath({str(marker)!r}).write_text('executed')\nraise RuntimeError('executed')\n")
        manifest = "".join(f"{report._hash(p)}  {p.relative_to(output).as_posix()}\n"
                           for p in sorted(output.rglob('*')) if p.is_file() and p.name != 'manifest.sha256')
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

    def test_export_must_remain_in_managed_exports_and_respect_budget(self) -> None:
        with self.assertRaisesRegex(report.BundleError, "direct child"):
            report.export_bundle(self.store, 0, 100, self.base / "outside")
        self.store.max_bytes = self.store.status()["managed_bytes"]
        with self.assertRaisesRegex(report.BundleError, "capacity"):
            report.export_bundle(self.store, 0, 100, self.store.root / "exports" / "too-large")

    def test_raw_export_growth_is_rejected_before_unreserved_chunk_write(self) -> None:
        output = self.store.root / "exports" / "growing"
        initial = list(self.store.read_events())
        oversized = dict(initial[0])
        oversized["event_id"] = "oversized"
        oversized["source_id"] = "oversized"
        oversized["raw"] = "x" * 128 * 1024
        with mock.patch.object(self.store, "read_events", side_effect=[iter(initial), iter(initial + [oversized])]):
            with self.assertRaisesRegex(report.BundleError, "raw export exceeded reserved capacity"):
                report.export_bundle(self.store, 0, 100, output)
        self.assertFalse(output.exists())

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
