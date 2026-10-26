"""Synthetic package assembly/security contracts; no native artifact or legal acceptance claim."""
import hashlib
import gzip
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('native_package', Path(__file__).with_name('package.py'))
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)

TARGETS = ('linux-arm64', 'linux-x64', 'darwin-arm64', 'darwin-x64', 'win32-x64')
SHA = 'a' * 40


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='blink-package-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / 'project'
        (self.root / 'native').mkdir(parents=True)
        self.inputs = Path(self.temporary.name) / 'inputs'
        self.inputs.mkdir()
        self.downloads = Path(self.temporary.name) / 'downloads'
        self.downloads.mkdir()
        sources = []
        for name in ('ffmpeg', 'opus', 'x264', 'libsrtp'):
            data = ('synthetic source ' + name).encode()
            filename = name + '.tar.gz'
            (self.downloads / filename).write_bytes(data)
            sources.append({'name': name, 'filename': filename, 'sha256': hashlib.sha256(data).hexdigest()})
        for name in ('ffmpeg-9.0.2.tar.xz.asc', 'ffmpeg-devel.asc'):
            (self.downloads / name).write_bytes(b'synthetic signature/key; verification mocked')
        self.pins = {'schema_version': 1, 'sources': sources}
        self.recipe = b'synthetic recipe, never executed'
        self.recipe_hash = hashlib.sha256(self.recipe).hexdigest()
        self.snapshot = {
            'native/worker.c': b'synthetic owned C',
            'native/Makefile': b'synthetic make',
            'native/COPYING': b'synthetic license',
            'native/dependencies/prepare.py': self.recipe,
            'native/dependencies/package.py': Path(package.__file__).read_bytes(),
            'native/dependencies/source-inputs.json': json.dumps(self.pins).encode(),
            'native/dependencies/licenses/opus-COPYING': b'synthetic notice',
            'native/dependencies/licenses/x264-COPYING': b'synthetic notice',
            'native/dependencies/licenses/libsrtp-LICENSE': b'synthetic notice',
            'native/dependencies/licenses/ffmpeg-LICENSE.md': b'synthetic notice',
            'native/dependencies/licenses/mingw-w64-runtime-COPYING': b'synthetic CRT notice',
            'native/dependencies/licenses/gcc-COPYING.RUNTIME': b'synthetic runtime exception',
            '.github/workflows/test.yml': b'synthetic build workflow',
        }
        for target in TARGETS:
            self.candidate(target)
        for name, replacement in (('MANIFEST', self.pins), ('RECIPE_SHA256', self.recipe_hash)):
            active = patch.object(package.prepare, name, replacement)
            active.start()
            self.addCleanup(active.stop)
        for name, result in (('source_files', self.snapshot),):
            active = patch.object(package, name, return_value=result)
            active.start()
            self.addCleanup(active.stop)
        active = patch.object(package.prepare, 'fetch', return_value=self.downloads)
        self.fetch = active.start()
        self.addCleanup(active.stop)

    def candidate(self, target, *, receipt_change=None, members=None):
        worker = ('synthetic ' + target).encode()
        receipt = {'target': target, 'source_sha': SHA, 'sha256': hashlib.sha256(worker).hexdigest(),
                   'dependencies': {'recipe_sha256': self.recipe_hash, 'source_inputs': self.pins},
                   'dynamic_dependencies': 'synthetic system import evidence', 'distribution_ready': False,
                   'limitations': ['synthetic fixture']}
        if receipt_change:
            receipt_change(receipt)
        executable = 'blink-codec-worker' + ('.exe' if target == 'win32-x64' else '')
        members = members if members is not None else [(executable, worker, tarfile.REGTYPE),
                                                      ('worker-receipt.json', json.dumps(receipt).encode(), tarfile.REGTYPE)]
        with tarfile.open(self.inputs / f'native-{target}.tar.gz', 'w:gz') as archive:
            for name, data, kind in members:
                member = tarfile.TarInfo(name)
                member.type = kind
                member.linkname = '../escape' if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE) else ''
                regular = kind in (tarfile.REGTYPE, tarfile.CONTTYPE)
                member.size = len(data) if regular else 0
                member.mode = 0o755
                archive.addfile(member, io.BytesIO(data) if regular else None)

    def test_stages_exact_five_manifest_and_source_bytes_with_unaccepted_receipt(self):
        receipt = package.stage_package(self.root, self.inputs, SHA)
        self.fetch.assert_called_once_with()
        runtime = self.root / 'native/runtime'
        manifest = json.loads((runtime / 'manifest.json').read_text())
        self.assertEqual(manifest['schemaVersion'], 1)
        self.assertEqual(set(manifest['targets']), set(TARGETS))
        for target in TARGETS:
            item = manifest['targets'][target]
            worker = self.root / item['path']
            self.assertEqual(worker.read_bytes(), ('synthetic ' + target).encode())
            self.assertEqual(item['sha256'], hashlib.sha256(worker.read_bytes()).hexdigest())
            self.assertTrue(worker.is_file())
            self.assertFalse(worker.is_symlink())
            with tarfile.open(self.inputs / f'native-{target}.tar.gz') as archive:
                executable = 'blink-codec-worker' + ('.exe' if target == 'win32-x64' else '')
                self.assertEqual(archive.getmember(executable).mode, 0o755)
            # Windows chmod only changes the read-only flag, not POSIX execute bits.
            if os.name != 'nt':
                self.assertTrue(worker.stat().st_mode & 0o111)
        source = self.root / 'native/corresponding-source.tar.gz'
        self.assertEqual(receipt['source_bundle_sha256'], hashlib.sha256(source.read_bytes()).hexdigest())
        self.assertEqual(receipt['source_sha'], SHA)
        self.assertEqual(set(receipt['targets']), set(TARGETS))
        self.assertFalse(receipt['distribution_ready'])
        self.assertEqual(json.loads((runtime / 'distribution-receipt.json').read_text()), receipt)
        with tarfile.open(source) as archive:
            self.assertEqual(archive.extractfile('project/native/worker.c').read(), self.snapshot['native/worker.c'])
            for pinned in self.pins['sources']:
                self.assertEqual(archive.extractfile('dependencies/' + pinned['filename']).read(),
                                 (self.downloads / pinned['filename']).read_bytes())
            for name in ('mingw-w64-runtime-COPYING', 'gcc-COPYING.RUNTIME'):
                path = 'native/dependencies/licenses/' + name
                self.assertEqual(archive.extractfile('project/' + path).read(), self.snapshot[path])

    def test_rejects_missing_or_extra_target_archives(self):
        path = self.inputs / 'native-linux-x64.tar.gz'
        original = path.read_bytes()
        path.unlink()
        with self.assertRaisesRegex(ValueError, 'Exactly five'):
            package.stage_package(self.root, self.inputs, SHA)
        path.write_bytes(original)
        (self.inputs / 'unexpected.tar.gz').write_bytes(original)
        with self.assertRaisesRegex(ValueError, 'Exactly five'):
            package.stage_package(self.root, self.inputs, SHA)
        self.fetch.assert_not_called()

    def test_windows_produced_candidate_with_large_pe_tables_stays_within_receipt_contract(self):
        build = self.root / 'native/build'
        prefix = build / 'deps/local-test/prefix'
        prefix.mkdir(parents=True)
        worker = build / 'worker.exe'
        worker.write_bytes(b'synthetic Windows worker, never executed')
        imports = 'DLL Name: KERNEL32.dll\nDLL Name: api-ms-win-crt-runtime-l1-1-0.dll\n'
        dump = imports + '0000000000001000 unwind/relocation entry\n' * 80000
        with patch.object(package.prepare.subprocess, 'check_output', return_value=dump):
            probe_evidence = package.prepare.audit_dependencies(build / 'probe.exe', 'Windows', {})
        dependency = {'recipe_sha256': self.recipe_hash, 'source_inputs': self.pins,
                      'dynamic_dependencies': probe_evidence}
        (prefix.parent / 'normalized-build-receipt.json').write_text(json.dumps(dependency))
        output = build / 'native-win32-x64.tar.gz'
        with patch.object(package.prepare, 'ROOT', build / 'deps'), \
                patch.object(package.prepare.platform, 'system', return_value='Windows'), \
                patch.object(package.prepare.platform, 'machine', return_value='AMD64'), \
                patch.object(package.prepare, 'build_environment', return_value={}), \
                patch.object(package.prepare.subprocess, 'check_output', return_value=dump):
            package.prepare.write_worker_artifact(prefix, worker, output, SHA)
        (self.inputs / output.name).write_bytes(output.read_bytes())
        distribution = package.stage_package(self.root, self.inputs, SHA)
        runtime = self.root / 'native/runtime/win32-x64'
        self.assertEqual((runtime / 'worker.exe').read_bytes(), worker.read_bytes())
        receipt = distribution['targets']['win32-x64']
        self.assertEqual(receipt['dynamic_dependencies'], imports)
        self.assertEqual(receipt['dependencies']['dynamic_dependencies'], imports)

    def test_rejects_source_target_binary_recipe_and_pinned_input_mismatch(self):
        mutations = [lambda row: row.update(target='win32-x64'), lambda row: row.update(source_sha='b' * 40),
                     lambda row: row.update(sha256='b' * 64),
                     lambda row: row['dependencies'].update(recipe_sha256='b' * 64),
                     lambda row: row['dependencies'].update(source_inputs={})]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                self.candidate('linux-x64', receipt_change=mutate)
                with self.assertRaisesRegex(ValueError, 'mismatch'):
                    package.stage_package(self.root, self.inputs, SHA)
        self.fetch.assert_not_called()
        self.assertFalse((self.root / 'native/runtime').exists())

    def test_rejects_premature_readiness_and_undeclared_receipt_fields(self):
        for mutate in (lambda row: row.update(distribution_ready=True), lambda row: row.update(download='unapproved')):
            self.candidate('linux-x64', receipt_change=mutate)
            with self.assertRaises(ValueError):
                package.stage_package(self.root, self.inputs, SHA)

    def test_rejects_links_traversal_duplicate_and_extra_members_without_extraction(self):
        worker = 'blink-codec-worker'
        cases = [[(worker, b'', tarfile.SYMTYPE)], [(worker, b'', tarfile.LNKTYPE)],
                 [('../escape', b'data', tarfile.REGTYPE)], [('/escape', b'data', tarfile.REGTYPE)],
                 [(worker, b'one', tarfile.REGTYPE), (worker, b'two', tarfile.REGTYPE)],
                 [('directory', b'', tarfile.DIRTYPE)]]
        for members in cases:
            with self.subTest(members=members):
                self.candidate('linux-x64', members=members)
                with self.assertRaises(ValueError):
                    package.stage_package(self.root, self.inputs, SHA)
        self.assertFalse((self.root / 'native/runtime').exists())
        self.assertFalse((self.root / 'escape').exists())

    def test_rejects_nonzero_data_hidden_after_tar_end(self):
        path = self.inputs / 'native-linux-x64.tar.gz'
        path.write_bytes(gzip.compress(gzip.decompress(path.read_bytes()) + b'hidden second archive'))
        with self.assertRaises(ValueError):
            package.stage_package(self.root, self.inputs, SHA)

    def test_caps_total_decompressed_tar_bytes_even_when_tail_is_zero(self):
        path = self.inputs / 'native-linux-x64.tar.gz'
        path.write_bytes(gzip.compress(gzip.decompress(path.read_bytes()) + b'\0' * 20000))
        with patch.object(package, 'TAR_LIMIT', 20000, create=True), self.assertRaises(ValueError):
            package.stage_package(self.root, self.inputs, SHA)

    def test_refuses_existing_roots_without_overwriting_or_fetching(self):
        for name in ('runtime', 'corresponding-source.tar.gz', 'NOTICE'):
            path = self.root / 'native' / name
            path.write_bytes(b'preserve unrelated data')
            with self.assertRaises(FileExistsError):
                package.stage_package(self.root, self.inputs, SHA)
            self.assertEqual(path.read_bytes(), b'preserve unrelated data')
            path.unlink()
        self.fetch.assert_not_called()

    def test_checks_source_bytes_again_after_fetch_and_keeps_outputs_absent(self):
        pinned = self.pins['sources'][0]
        (self.downloads / pinned['filename']).write_bytes(b'changed after verification')
        with self.assertRaisesRegex(ValueError, 'changed after verification'):
            package.stage_package(self.root, self.inputs, SHA)
        self.assertFalse((self.root / 'native/runtime').exists())
        self.assertFalse((self.root / 'native/corresponding-source.tar.gz').exists())

    def test_failed_signature_verification_never_creates_package_roots(self):
        self.fetch.side_effect = ValueError('Unexpected FFmpeg signing fingerprint')
        with self.assertRaisesRegex(ValueError, 'fingerprint'):
            package.stage_package(self.root, self.inputs, SHA)
        self.assertFalse((self.root / 'native/runtime').exists())

    def test_rejects_duplicate_json_keys_and_oversized_members(self):
        self.candidate('linux-x64', members=[('blink-codec-worker', b'worker', tarfile.REGTYPE),
                                            ('worker-receipt.json', b'{"target":"linux-x64","target":"linux-x64"}', tarfile.REGTYPE)])
        with self.assertRaisesRegex(ValueError, 'Duplicate JSON'):
            package.stage_package(self.root, self.inputs, SHA)
        for name, limit in (('blink-codec-worker', package.WORKER_LIMIT), ('worker-receipt.json', package.RECEIPT_LIMIT)):
            with self.subTest(member=name):
                entry = tarfile.TarInfo(name)
                entry.size = limit + 1
                entry.mode = 0o755
                (self.inputs / 'native-linux-x64.tar.gz').write_bytes(gzip.compress(entry.tobuf() + b'\0' * 1024))
                with self.assertRaisesRegex(ValueError, 'candidate member'):
                    package.stage_package(self.root, self.inputs, SHA)

    def test_rejects_symlinked_input_tar_and_native_output_parent(self):
        path = self.inputs / 'native-linux-x64.tar.gz'
        backing = Path(self.temporary.name) / 'preserved.tar.gz'
        path.rename(backing)
        path.symlink_to(backing)
        with self.assertRaisesRegex(ValueError, 'candidate archive'):
            package.stage_package(self.root, self.inputs, SHA)
        path.unlink()
        backing.rename(path)
        native = self.root / 'native'
        native.rename(self.root / 'preserved-native')
        native.symlink_to(self.root / 'preserved-native', target_is_directory=True)
        with self.assertRaises(FileExistsError):
            package.stage_package(self.root, self.inputs, SHA)

    def test_refuses_verifier_recipe_or_source_pin_drift(self):
        with patch.object(package.prepare, 'RECIPE_SHA256', 'b' * 64), self.assertRaisesRegex(ValueError, 'verifier'):
            package.stage_package(self.root, self.inputs, SHA)
        with patch.object(package.prepare, 'MANIFEST', {}), self.assertRaisesRegex(ValueError, 'verifier'):
            package.stage_package(self.root, self.inputs, SHA)
        self.fetch.assert_not_called()

    def test_refuses_executing_packager_drift_before_fetch_or_package_output(self):
        self.snapshot['native/dependencies/package.py'] = b'different committed packager'
        with self.assertRaisesRegex(ValueError, 'verifier'):
            package.stage_package(self.root, self.inputs, SHA)
        self.fetch.assert_not_called()
        for name in ('runtime', 'corresponding-source.tar.gz', 'NOTICE'):
            self.assertFalse((self.root / 'native' / name).exists())

    def test_source_input_identity_does_not_equate_json_booleans_and_numbers(self):
        changed = json.loads(json.dumps(self.pins))
        changed['schema_version'] = True
        self.candidate('linux-x64', receipt_change=lambda row: row['dependencies'].update(source_inputs=changed))
        with self.assertRaisesRegex(ValueError, 'identity mismatch'):
            package.stage_package(self.root, self.inputs, SHA)

    def test_rejects_numeric_overflow_in_json_receipts_and_serializer(self):
        for data in (b'{"evidence":1e10000}', b'{"evidence":-1e10000}'):
            with self.subTest(data=data), self.assertRaisesRegex(ValueError, 'Non-finite JSON'):
                package.strict_json(data)
        for value in (float('inf'), float('-inf'), float('nan')):
            with self.subTest(value=value), self.assertRaises(ValueError):
                package.json_bytes({'evidence': value})
        self.assertEqual(package.strict_json(b'{"evidence":1.25e2}'), {'evidence': 125.0})

    def test_rejects_nonstandard_contiguous_member_type(self):
        path = self.inputs / 'native-linux-x64.tar.gz'
        with tarfile.open(path) as archive:
            receipt = archive.extractfile('worker-receipt.json').read()
        self.candidate('linux-x64', members=[('blink-codec-worker', b'synthetic linux-x64', tarfile.CONTTYPE),
                                            ('worker-receipt.json', receipt, tarfile.REGTYPE)])
        with self.assertRaisesRegex(ValueError, 'candidate member'):
            package.stage_package(self.root, self.inputs, SHA)


class SourceSnapshotTests(unittest.TestCase):
    def test_reads_exact_commit_blobs_with_no_working_file_dependency(self):
        root = Path('/synthetic/project')
        expected = {
            'native/worker.c': b'committed C', 'native/Makefile': b'committed make', 'native/COPYING': b'license',
            'native/dependencies/prepare.py': b'recipe', 'native/dependencies/package.py': b'packager',
            'native/dependencies/source-inputs.json': b'{}', '.github/workflows/test.yml': b'CI',
            'native/dependencies/licenses/ffmpeg-LICENSE.md': b'notice',
            'native/dependencies/licenses/libsrtp-LICENSE': b'notice',
            'native/dependencies/licenses/opus-COPYING': b'notice',
            'native/dependencies/licenses/x264-COPYING': b'notice',
            'native/dependencies/licenses/mingw-w64-runtime-COPYING': b'notice',
            'native/dependencies/licenses/gcc-COPYING.RUNTIME': b'notice',
            'native/tests/check-rtp.c': b'future committed receiver helper',
        }
        listing = b''.join(f'100644 blob {"b" * 40} {len(data)}\t{name}\0'.encode() for name, data in expected.items())
        with patch.object(package.subprocess, 'check_output', side_effect=[listing, *expected.values()]) as git:
            self.assertEqual(package.source_files(root, SHA), expected)
        for call in git.call_args_list[1:]:
            self.assertTrue(call.args[0][-1].startswith(SHA + ':'))

    def test_refuses_symlinks_or_unbounded_owned_blob_sizes_before_reading(self):
        for mode, size in (('120000', 4), ('100644', package.SOURCE_LIMIT + 1)):
            listing = f'{mode} blob {"b" * 40} {size}\tnative/worker.c\0'.encode()
            with patch.object(package.subprocess, 'check_output', return_value=listing) as git:
                with self.assertRaises(ValueError):
                    package.source_files(Path('/synthetic/project'), SHA)
                self.assertEqual(git.call_count, 1)

    def test_refuses_each_missing_windows_runtime_notice_in_exact_source(self):
        names = ('native/worker.c', 'native/Makefile', 'native/COPYING', 'native/dependencies/prepare.py',
                 'native/dependencies/package.py', 'native/dependencies/source-inputs.json', '.github/workflows/test.yml',
                 'native/dependencies/licenses/ffmpeg-LICENSE.md', 'native/dependencies/licenses/libsrtp-LICENSE',
                 'native/dependencies/licenses/opus-COPYING', 'native/dependencies/licenses/x264-COPYING',
                 'native/dependencies/licenses/mingw-w64-runtime-COPYING', 'native/dependencies/licenses/gcc-COPYING.RUNTIME')
        for missing in names[-2:]:
            with self.subTest(missing=missing):
                expected = {name: b'notice' for name in names if name != missing}
                listing = b''.join(f'100644 blob {"b" * 40} {len(data)}\t{name}\0'.encode() for name, data in expected.items())
                with patch.object(package.subprocess, 'check_output', side_effect=[listing, *expected.values()]):
                    with self.assertRaisesRegex(ValueError, 'Required corresponding source missing'):
                        package.source_files(Path('/synthetic/project'), SHA)

    def test_runtime_notices_preserve_exact_verified_upstream_bytes(self):
        hashes = {'mingw-w64-runtime-COPYING': '1db8da07b436c68833c0673ffee3d9fcb2526047f3820b81661865dfedc79a1f',
                  'gcc-COPYING.RUNTIME': '9d6b43ce4d8de0c878bf16b54d8e7a10d9bd42b75178153e3af6a815bdc90f74'}
        for name, expected in hashes.items():
            with self.subTest(name=name):
                self.assertEqual(hashlib.sha256((Path(__file__).parent / 'licenses' / name).read_bytes()).hexdigest(), expected)


if __name__ == '__main__':
    unittest.main()
