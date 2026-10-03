"""Offline source-fetch invariants; no provider traffic or build execution."""
import importlib.util
import io
from pathlib import Path
import tempfile
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
                    self.assertEqual(list(Path(directory).iterdir()), [output])

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


if __name__ == '__main__':
    unittest.main()
