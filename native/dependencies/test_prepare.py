"""Offline source-fetch invariants; no provider traffic or build execution."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import tarfile
import unittest
from unittest.mock import patch, Mock
import urllib.request

spec = importlib.util.spec_from_file_location('native_prepare', Path(__file__).with_name('prepare.py'))
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class Response(io.BytesIO):
    url = 'https://example.test/source'
    headers = {}


class DownloadTests(unittest.TestCase):
    def download(self, data, limit, *, headers=None, interrupted=False):
        with tempfile.TemporaryDirectory(prefix='blink-fetch-test-') as directory:
            output = Path(directory) / 'source.tar'
            response = Response(data)
            response.headers = headers or {}
            if interrupted:
                response.read = Mock(side_effect=[b'part', OSError('interrupted')])
            opener = Mock()
            opener.open.return_value = response
            with patch.object(prepare.urllib.request, 'build_opener', return_value=opener):
                if len(data) > limit or interrupted or (headers and int(headers.get('Content-Length', 0)) > limit):
                    with self.assertRaises((ValueError, OSError)):
                        prepare.download(response.url, output, limit)
                    self.assertFalse(output.exists())
                    self.assertEqual(list(Path(directory).iterdir()), [])
                else:
                    prepare.download(response.url, output, limit)
                    self.assertEqual(output.read_bytes(), data)
                    entries = list(Path(directory).iterdir())
                    self.assertEqual(len(entries), 1)
                    self.assertTrue(entries[0].samefile(output))

    def test_exact_limit_is_admitted(self):
        self.download(b'abcd', 4)

    def test_actual_limit_plus_one_is_refused_with_missing_or_false_length(self):
        self.download(b'abcde', 4)
        self.download(b'abcde', 4, headers={'Content-Length': '1'})

    def test_declared_oversize_refuses_without_cache_file(self):
        self.download(b'abcd', 4, headers={'Content-Length': '5'})

    def test_interrupted_partial_never_poison_cached_archive(self):
        self.download(b'abcd', 8, interrupted=True)

    def test_plaintext_initial_url_refused(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(prepare.urllib.request, 'build_opener') as opener:
            with self.assertRaisesRegex(ValueError, 'HTTPS required'):
                prepare.download('http://example.test/source', Path(directory) / 'source', 4)
            opener.assert_not_called()

    def test_plaintext_redirect_refused_before_following(self):
        request = urllib.request.Request('https://example.test/source')
        with self.assertRaisesRegex(ValueError, 'HTTPS redirect required'):
            prepare.HTTPSOnlyRedirects().redirect_request(request, None, 302, 'Found', {}, 'http://example.test/source')

    def test_cached_tampered_archive_refused_before_signature_or_build(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            downloads = root / 'downloads'
            downloads.mkdir()
            first = prepare.MANIFEST['sources'][0]
            (downloads / first['filename']).write_bytes(b'tampered')
            with patch.object(prepare, 'ROOT', root), patch.object(prepare, 'download'), patch.object(prepare, 'run') as run:
                with self.assertRaisesRegex(ValueError, 'Checksum mismatch: ffmpeg'):
                    prepare.fetch()
                run.assert_not_called()

    def test_signature_verification_converts_all_gpg_paths_only_for_windows(self):
        temporary_directory = tempfile.TemporaryDirectory
        for system in ('Windows', 'Linux'):
            with self.subTest(system=system), temporary_directory() as directory:
                root = Path(directory)
                downloads = root / 'downloads'
                downloads.mkdir()
                archive = downloads / 'ffmpeg-9.0.2.tar.xz'
                archive.write_bytes(b'authenticated source fixture')
                fingerprint = 'A' * 40
                manifest = {'sources': [{'name': 'ffmpeg', 'filename': archive.name,
                    'url': 'https://example.test/source',
                    'sha256': prepare.hashlib.sha256(archive.read_bytes()).hexdigest()}],
                    'ffmpeg_signature': {'url': 'https://example.test/signature',
                        'key_url': 'https://example.test/key', 'fingerprint': fingerprint}}
                convert = lambda value: '/msys/' + Path(value).name

                def isolated_keyring(**arguments):
                    return temporary_directory(prefix=arguments['prefix'], dir=root)

                with patch.object(prepare, 'ROOT', root), patch.object(prepare, 'MANIFEST', manifest), \
                        patch.object(prepare, 'download'), patch.object(prepare.platform, 'system', return_value=system), \
                        patch.object(prepare.tempfile, 'TemporaryDirectory', side_effect=isolated_keyring), \
                        patch.object(prepare, 'unix_path', side_effect=convert) as unix_path, \
                        patch.object(prepare, 'run') as imported, \
                        patch.object(prepare.subprocess, 'run', return_value=Mock(
                            stdout=f'[GNUPG:] VALIDSIG {fingerprint}\n')) as verified:
                    prepare.fetch()
                import_args = [prepare.argument(value) for value in imported.call_args.args[0]]
                verify_args = [prepare.argument(value) for value in verified.call_args.args[0]]
                expected_prefix = ['gpg', '--batch', '--no-options', '--no-autostart', '--homedir']
                self.assertEqual(import_args[:5], expected_prefix)
                self.assertEqual(verify_args[:6], import_args[:6])
                home = import_args[5]
                self.assertIn('blink-gpg-', home)
                self.assertFalse(Path(home).exists())
                self.assertEqual(import_args[6:], ['--import', convert(downloads / 'ffmpeg-devel.asc')]
                    if system == 'Windows' else ['--import', (downloads / 'ffmpeg-devel.asc').as_posix()])
                expected_files = [downloads / 'ffmpeg-9.0.2.tar.xz.asc', archive]
                self.assertEqual(verify_args[6:], ['--status-fd', '1', '--verify',
                    *(convert(value) if system == 'Windows' else value.as_posix() for value in expected_files)])
                if system == 'Windows':
                    self.assertTrue(home.startswith('/msys/blink-gpg-'))
                else:
                    unix_path.assert_not_called()


class BuildHostTests(unittest.TestCase):
    def test_windows_libsrtp_uses_ucrt_format_checks_without_relaxing_warnings(self):
        class Configured(Exception):
            pass

        for system in ('Windows', 'Linux'):
            with self.subTest(system=system), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                downloads = root / 'downloads'
                downloads.mkdir()
                sources = [{'name': name, 'filename': name + '.tar.gz', 'root': name}
                    for name in ('opus', 'libsrtp')]
                for source in sources:
                    with tarfile.open(downloads / source['filename'], 'w:gz') as archive:
                        entry = tarfile.TarInfo(source['root'])
                        entry.type = tarfile.DIRTYPE
                        archive.addfile(entry)
                commands = []

                def capture(argv, *unused):
                    command = [prepare.argument(value) for value in argv]
                    if command[:2] == ['cmake', '-S']:
                        commands.append(command)
                        if Path(command[2]).name == 'libsrtp':
                            raise Configured()

                with patch.object(prepare, 'ROOT', root), patch.object(prepare, 'MANIFEST', {'sources': sources}), \
                        patch.object(prepare.platform, 'system', return_value=system), \
                        patch.dict(prepare.os.environ, {'MSYSTEM': 'UCRT64'}), \
                        patch.object(prepare.subprocess, 'check_output', return_value='x86_64-w64-mingw32\n'), \
                        patch.object(prepare, 'run', side_effect=capture):
                    with self.assertRaises(Configured):
                        prepare.build(downloads, 1)
                opus, libsrtp = commands
                flags = [argument.split('=', 1)[1] for argument in libsrtp
                    if argument.startswith('-DCMAKE_C_FLAGS=')]
                if system == 'Windows':
                    self.assertEqual(len(flags), 1)
                    effective = prepare.shlex.split(flags[0])
                    self.assertIn('-O2', effective)
                    self.assertIn('-D__printf__=__gnu_printf__', effective)
                    self.assertFalse(any(value.startswith('-Wno') for value in effective))
                else:
                    self.assertEqual(flags, [])
                self.assertFalse(any('__printf__' in value for value in opus))
                self.assertNotIn('-DENABLE_WARNINGS=OFF', libsrtp)
                self.assertNotIn('-DENABLE_WARNINGS_AS_ERRORS=OFF', libsrtp)

    def test_windows_requires_ucrt64_before_any_build_side_effect(self):
        with patch.dict(prepare.os.environ, {'MSYSTEM': 'MSYS'}, clear=True):
            with self.assertRaisesRegex(ValueError, 'UCRT64'):
                prepare.build_environment(Path('/private/prefix'), 'Windows')

    def test_windows_environment_keeps_process_runtime_but_drops_ambient_build_flags(self):
        with patch.dict(prepare.os.environ, {'MSYSTEM': 'UCRT64', 'PATH': 'compiler-path',
                'SystemRoot': 'C:/Windows', 'TEMP': 'C:/Temp', 'CFLAGS': 'hostile',
                'PKG_CONFIG_PATH': 'ambient', 'HTTP_PROXY': 'secret'}, clear=True):
            env = prepare.build_environment(Path('/private/prefix'), 'Windows')
        self.assertEqual({key.upper(): value for key, value in env.items()}['SYSTEMROOT'], 'C:/Windows')
        self.assertEqual(env['MSYSTEM'], 'UCRT64')
        self.assertEqual(env['CC'], 'gcc')
        self.assertIn('-static', env['LDFLAGS'])
        self.assertEqual(env['PKG_CONFIG_PATH'], '')
        self.assertNotIn('hostile', env['CFLAGS'])
        self.assertNotIn('HTTP_PROXY', env)

    def test_posix_environment_does_not_inherit_windows_or_compiler_overrides(self):
        with patch.dict(prepare.os.environ, {'PATH': '/tools', 'CC': 'ambient',
                'MSYSTEM': 'UCRT64', 'SystemRoot': 'C:/Windows'}, clear=True):
            env = prepare.build_environment(Path('/private/prefix'), 'Linux')
        self.assertNotIn('CC', env)
        self.assertNotIn('MSYSTEM', env)
        self.assertNotIn('SystemRoot', env)
        self.assertEqual(env['PKG_CONFIG_LIBDIR'], '/private/prefix/lib/pkgconfig')

    def test_unsupported_build_host_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Unsupported native build host'):
            prepare.build_environment(Path('/private/prefix'), 'FreeBSD')

    def test_windows_configure_uses_bash_and_converted_script_path(self):
        with patch.object(prepare.subprocess, 'check_output', return_value='/c/work/configure\n'):
            command = prepare.configure_command(Path('C:/work/configure'), ['--disable-network'], 'Windows')
        self.assertEqual(command, ['bash', '/c/work/configure', '--disable-network'])

    def test_posix_configure_needs_no_shell(self):
        self.assertEqual(prepare.configure_command(Path('/work/configure'), ['--disable-network'], 'Linux'),
                         ['/work/configure', '--disable-network'])


class WorkerArtifactTests(unittest.TestCase):
    def test_archive_carries_exact_worker_hash_and_dependency_receipt_without_release_claim(self):
        with tempfile.TemporaryDirectory() as directory:
            build = Path(directory)
            prefix = build / 'deps' / 'local-test' / 'prefix'
            prefix.mkdir(parents=True)
            dependency = {'recipe_sha256': prepare.RECIPE_SHA256, 'distribution_ready': False,
                          'source_inputs': prepare.MANIFEST}
            (prefix.parent / 'normalized-build-receipt.json').write_text(json.dumps(dependency))
            worker = build / 'blink-codec-worker'
            worker.write_bytes(b'synthetic worker, never executed')
            output = build / 'worker.tar.gz'
            with patch.object(prepare, 'ROOT', build / 'deps'), patch.object(prepare.platform, 'system', return_value='Linux'), \
                    patch.object(prepare.platform, 'machine', return_value='x86_64'), \
                    patch.object(prepare, 'audit_dependencies', return_value='system libraries'):
                prepare.write_worker_artifact(prefix, worker, output, 'a' * 40)
                with self.assertRaises(FileExistsError):
                    prepare.write_worker_artifact(prefix, worker, output, 'a' * 40)
            with tarfile.open(output) as archive:
                receipt = json.load(archive.extractfile('worker-receipt.json'))
                self.assertEqual(receipt['target'], 'linux-x64')
                self.assertEqual(receipt['source_sha'], 'a' * 40)
                self.assertEqual(receipt['sha256'], prepare.hashlib.sha256(worker.read_bytes()).hexdigest())
                self.assertEqual(receipt['dependencies'], dependency)
                self.assertFalse(receipt['distribution_ready'])
                self.assertEqual(archive.extractfile('blink-codec-worker').read(), worker.read_bytes())
                self.assertEqual(archive.getmember('blink-codec-worker').mode, 0o755)

    def test_windows_import_audit_rejects_toolchain_runtime_dlls(self):
        with patch.object(prepare.subprocess, 'check_output', return_value='DLL Name: libwinpthread-1.dll\n'):
            with self.assertRaisesRegex(ValueError, 'Non-system Windows dependency'):
                prepare.audit_dependencies(Path('worker.exe'), 'Windows', {})

    def test_windows_import_audit_accepts_only_system_imports_and_requires_evidence(self):
        system_imports = 'DLL Name: KERNEL32.dll\nDLL Name: api-ms-win-crt-runtime-l1-1-0.dll\n'
        with patch.object(prepare.subprocess, 'check_output', return_value=system_imports):
            self.assertEqual(prepare.audit_dependencies(Path('worker.exe'), 'Windows', {}), system_imports)
        with patch.object(prepare.subprocess, 'check_output', return_value='not a PE import dump'):
            with self.assertRaises(ValueError):
                prepare.audit_dependencies(Path('worker.exe'), 'Windows', {})


if __name__ == '__main__':
    unittest.main()
