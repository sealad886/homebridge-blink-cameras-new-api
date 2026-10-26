#!/usr/bin/env python3
"""Assemble five verified CI candidates and their source inputs; never publish or approve release."""
import argparse
import gzip
import hashlib
import io
import json
import math
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import tempfile
from typing import BinaryIO

import prepare

PACKAGER_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
TARGETS = ('linux-arm64', 'linux-x64', 'darwin-arm64', 'darwin-x64', 'win32-x64')
WORKER_LIMIT = 64 * 1024 * 1024
RECEIPT_LIMIT = 2 * 1024 * 1024
ARCHIVE_LIMIT = 72 * 1024 * 1024
SOURCE_LIMIT = 16 * 1024 * 1024
TAR_LIMIT = WORKER_LIMIT + RECEIPT_LIMIT + 1024 * 1024


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + '\n').encode()


def file_hash(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


class TarBudget:
    """Bound all decompressed bytes, including PAX headers and ignored zero padding."""
    def __init__(self, stream: BinaryIO):
        self.stream = stream
        self.received = 0

    def read(self, size: int) -> bytes:
        if size < 0:
            raise ValueError('Unbounded tar read refused')
        data = self.stream.read(min(size, TAR_LIMIT - self.received + 1))
        self.received += len(data)
        if self.received > TAR_LIMIT:
            raise ValueError('Decompressed candidate archive limit exceeded')
        return data


def strict_json(data: bytes) -> object:
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('Duplicate JSON key')
            result[key] = value
        return result
    def invalid_constant(_):
        raise ValueError('Non-finite JSON value')
    def finite_float(value):
        number = float(value)
        if not math.isfinite(number):
            raise ValueError('Non-finite JSON value')
        return number
    return json.loads(data, object_pairs_hook=unique, parse_constant=invalid_constant, parse_float=finite_float)


def source_files(root: Path, source_sha: str) -> dict[str, bytes]:
    """Read regular owned source blobs from the exact Git commit, never from dirty working files."""
    listing = subprocess.check_output(['git', '-C', str(root), 'ls-tree', '-rzl', source_sha, '--',
                                      'native', '.github/workflows/test.yml'])
    result = {}
    total = 0
    for item in listing.split(b'\0'):
        if not item:
            continue
        metadata, raw_path = item.split(b'\t', 1)
        path = raw_path.decode('utf-8')
        part = PurePosixPath(path)
        selected = (path == '.github/workflows/test.yml' or path.startswith('native/dependencies/licenses/') or
                    part.suffix in ('.c', '.h', '.inc', '.py', '.md') or part.name in ('Makefile', 'COPYING', 'source-inputs.json'))
        if not selected:
            continue
        mode, kind, _, size = metadata.split()
        if mode not in (b'100644', b'100755') or kind != b'blob' or any(
                not re.fullmatch(r'[A-Za-z0-9_.-]+', piece) or piece in ('.', '..') for piece in part.parts):
            raise ValueError('Invalid owned source entry')
        total += int(size)
        if total > SOURCE_LIMIT or len(result) >= 256:
            raise ValueError('Owned source limit exceeded')
        data = subprocess.check_output(['git', '-C', str(root), 'show', f'{source_sha}:{path}'])
        if len(data) != int(size):
            raise ValueError('Source blob size mismatch')
        result[path] = data
    required = {'native/worker.c', 'native/Makefile', 'native/COPYING', 'native/dependencies/prepare.py',
                'native/dependencies/package.py', 'native/dependencies/source-inputs.json', '.github/workflows/test.yml',
                'native/dependencies/licenses/ffmpeg-LICENSE.md', 'native/dependencies/licenses/libsrtp-LICENSE',
                'native/dependencies/licenses/opus-COPYING', 'native/dependencies/licenses/x264-COPYING'}
    if not required.issubset(result):
        raise ValueError('Required corresponding source missing from exact commit')
    return result


def read_candidate(path: Path, target: str, source_sha: str, recipe: str, pins: object) -> tuple[bytes, dict]:
    """Read bounded regular members without extracting any archive-controlled path."""
    if path.is_symlink() or not path.is_file() or path.stat().st_size > ARCHIVE_LIMIT:
        raise ValueError('Invalid candidate archive')
    expected_worker = 'blink-codec-worker' + ('.exe' if target == 'win32-x64' else '')
    members = {}
    with path.open('rb') as raw, gzip.GzipFile(fileobj=raw, mode='rb') as compressed:
        with tarfile.open(fileobj=TarBudget(compressed), mode='r|') as archive:
            for item in archive:
                limit = WORKER_LIMIT if item.name == expected_worker else RECEIPT_LIMIT
                if (item.name not in (expected_worker, 'worker-receipt.json') or item.name in members or
                        item.type not in (tarfile.REGTYPE, tarfile.AREGTYPE) or item.sparse is not None or
                        not 0 < item.size <= limit or item.mode & 0o7000 or
                        (item.name == expected_worker and not item.mode & 0o111)):
                    raise ValueError('Invalid native candidate member')
                with archive.extractfile(item) as stream:
                    members[item.name] = stream.read(limit + 1)
            while tail := archive.fileobj.read(65536):
                if tail.strip(b'\0'):
                    raise ValueError('Nonzero data after candidate tar end')
    if set(members) != {expected_worker, 'worker-receipt.json'}:
        raise ValueError('Missing native candidate member')
    receipt = strict_json(members['worker-receipt.json'])
    keys = {'target', 'source_sha', 'sha256', 'dependencies', 'dynamic_dependencies', 'distribution_ready', 'limitations'}
    if (not isinstance(receipt, dict) or set(receipt) != keys or receipt.get('distribution_ready') is not False or
            not isinstance(receipt.get('dynamic_dependencies'), str) or not receipt['dynamic_dependencies'] or
            not isinstance(receipt.get('limitations'), list) or len(receipt['limitations']) > 32 or
            any(not isinstance(value, str) or len(value) > 4096 for value in receipt['limitations'])):
        raise ValueError('Invalid candidate receipt')
    if receipt.get('target') != target or receipt.get('source_sha') != source_sha:
        raise ValueError('Candidate source or target mismatch')
    dependency = receipt.get('dependencies')
    if (receipt.get('sha256') != digest(members[expected_worker]) or not isinstance(dependency, dict) or
            dependency.get('recipe_sha256') != recipe or json_bytes(dependency.get('source_inputs')) != json_bytes(pins)):
        raise ValueError('Candidate binary or dependency identity mismatch')
    return members[expected_worker], receipt


def add_bytes(archive: tarfile.TarFile, path: str, data: bytes) -> None:
    entry = tarfile.TarInfo(path)
    entry.size = len(data)
    entry.mode = 0o644
    archive.addfile(entry, io.BytesIO(data))


def source_bundle(bundle: Path, sources: dict[str, bytes], pins: dict, downloads: Path, receipts: dict) -> None:
    with bundle.open('xb') as output, gzip.GzipFile(fileobj=output, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as archive:
            for name, data in sorted(sources.items()):
                add_bytes(archive, 'project/' + name, data)
            for pinned in pins['sources']:
                path = downloads / pinned['filename']
                if path.is_symlink() or not path.is_file() or path.stat().st_size > prepare.ARCHIVE_LIMIT:
                    raise ValueError('Invalid dependency source archive')
                data = path.read_bytes()
                if digest(data) != pinned['sha256']:
                    raise ValueError('Dependency source changed after verification')
                add_bytes(archive, 'dependencies/' + pinned['filename'], data)
            for name in ('ffmpeg-9.0.2.tar.xz.asc', 'ffmpeg-devel.asc'):
                path = downloads / name
                limit = prepare.KEY_LIMIT if name == 'ffmpeg-devel.asc' else prepare.SIGNATURE_LIMIT
                if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= limit:
                    raise ValueError('Invalid signature verification input')
                add_bytes(archive, 'dependencies/' + name, path.read_bytes())
            for target, receipt in receipts.items():
                add_bytes(archive, f'receipts/{target}.json', json_bytes(receipt))
            add_bytes(archive, 'README.md', b'Native worker source and rebuild instructions\n\n'
                      b'Use a native host matching the target; this recipe does not cross-compile.\n'
                      b'Install Python3.12+, CMake, make, pkg-config, GnuPG and the recorded compiler/toolchain.\n'
                      b'Copy dependencies/* into project/native/build/deps/downloads/, then work from project/.\n'
                      b'Run: python native/dependencies/prepare.py --build-local --jobs 3 --disable-assembly --prefix-file native/build/deps/rebuild-prefix.txt\n'
                      b'Read that prefix and pass it as both FFMPEG_PREFIX and SRTP_PREFIX to make -C native test PYTHON=python.\n'
                      b'Darwin uses CC=/usr/bin/clang and MACOSX_DEPLOYMENT_TARGET=13.0; Windows uses UCRT64, CC=gcc and LDFLAGS="-static -static-libgcc".\n'
                      b'Exact target commands/configurations/compiler identities are in receipts/ and project/.github/workflows/test.yml.\n'
                      b'Dependency archives are unmodified authenticated source inputs.\n'
                      b'All final clean-target, npm, linked-runtime license and physical acceptance gates remain open.\n')


def install_outputs(outputs: list[Path], candidates: dict, manifest: dict, distribution: dict,
                    notice: bytes, bundle: Path) -> None:
    # Never roll back unknown contents on a late filesystem failure; partial new roots block reuse.
    runtime = outputs[0]
    runtime.mkdir()
    for target, (worker, _) in candidates.items():
        directory = runtime / target
        directory.mkdir()
        path = directory / ('worker.exe' if target == 'win32-x64' else 'worker')
        with path.open('xb') as output:
            output.write(worker)
        path.chmod(0o755)
    with outputs[1].open('xb') as output, bundle.open('rb') as stream:
        shutil.copyfileobj(stream, output)
    for path, data in ((outputs[2], notice), (runtime / 'manifest.json', json_bytes(manifest)),
                       (runtime / 'distribution-receipt.json', json_bytes(distribution))):
        with path.open('xb') as output:
            output.write(data)


def stage_package(root: Path, artifacts: Path, source_sha: str) -> dict:
    """Create new package roots only, retaining false distribution readiness until final acceptance."""
    if not re.fullmatch(r'[a-f0-9]{40}', source_sha):
        raise ValueError('Exact source SHA required')
    native = root / 'native'
    outputs = [native / 'runtime', native / 'corresponding-source.tar.gz', native / 'NOTICE']
    if native.is_symlink() or not native.is_dir() or any(path.exists() or path.is_symlink() for path in outputs):
        raise FileExistsError('Native package roots must be new')
    names = {f'native-{target}.tar.gz' for target in TARGETS}
    if artifacts.is_symlink() or {item.name for item in artifacts.iterdir()} != names:
        raise ValueError('Exactly five candidate archives required')
    sources = source_files(root, source_sha)
    recipe = digest(sources['native/dependencies/prepare.py'])
    pins = strict_json(sources['native/dependencies/source-inputs.json'])
    if (json_bytes(pins) != json_bytes(prepare.MANIFEST) or recipe != prepare.RECIPE_SHA256 or
            digest(sources['native/dependencies/package.py']) != PACKAGER_SHA256):
        raise ValueError('Packaging verifier differs from exact source recipe, pins or packager')
    if len(pins['sources']) != 4 or {item['name'] for item in pins['sources']} != {'ffmpeg', 'opus', 'x264', 'libsrtp'}:
        raise ValueError('Exactly four pinned dependency sources required')
    candidates = {target: read_candidate(artifacts / f'native-{target}.tar.gz', target, source_sha, recipe, pins)
                  for target in TARGETS}
    downloads = prepare.fetch()  # Existing checksum and pinned GPG fingerprint verification remains mandatory.
    manifest = {'schemaVersion': 1, 'targets': {}}
    target_receipts = {}
    for target, (worker, receipt) in candidates.items():
        path = f'native/runtime/{target}/worker' + ('.exe' if target == 'win32-x64' else '')
        manifest['targets'][target] = {'path': path, 'sha256': digest(worker)}
        target_receipts[target] = {**receipt, 'artifact_sha256': file_hash(artifacts / f'native-{target}.tar.gz')}
    notice = (f'Native workers: GPL-3.0-or-later; source revision {source_sha}.\n'
              'Selected FFmpeg configuration: GPL-3.0-or-later; x264: GPL-2.0-or-later.\n'
              'Opus and libSRTP: BSD-3-Clause. Full notices and source inputs accompany this\n'
              'package in corresponding-source.tar.gz; GPLv3 text is in COPYING.\n'
              'The JavaScript plugin retains its MIT license in the package root.\n'
              'Final target acceptance and linked-runtime license review remain release gates.\n').encode()
    build = native / 'build'
    if build.is_symlink():
        raise ValueError('Build directory must not be a symlink')
    build.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='package-stage-', dir=build) as temporary:
        bundle = Path(temporary) / 'corresponding-source.tar.gz'
        source_bundle(bundle, sources, pins, downloads, target_receipts)
        distribution = {'schemaVersion': 1, 'source_sha': source_sha, 'targets': target_receipts,
                        'manifest_sha256': digest(json_bytes(manifest)), 'source_bundle_sha256': file_hash(bundle),
                        'distribution_ready': False}
        install_outputs(outputs, candidates, manifest, distribution, notice, bundle)
    return distribution


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--artifacts', type=Path, required=True)
    parser.add_argument('--source-sha', required=True)
    arguments = parser.parse_args()
    result = stage_package(arguments.root, arguments.artifacts, arguments.source_sha)
    print(json.dumps({'source_sha': result['source_sha'], 'targets': list(result['targets']), 'distribution_ready': False}))
