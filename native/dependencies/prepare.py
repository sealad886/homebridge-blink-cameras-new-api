#!/usr/bin/env python3
"""Fetch authenticated pinned sources; optionally build local static codec libraries.
No global installs, keyring changes, worker publication, or external target builds.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shlex
import subprocess
import tarfile
import tempfile
import urllib.request
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent / 'build' / 'deps'
MANIFEST = json.loads((HERE / 'source-inputs.json').read_text())
RECIPE_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
ARCHIVE_LIMIT = 64 * 1024 * 1024
KEY_LIMIT = 1024 * 1024
SIGNATURE_LIMIT = 64 * 1024


def run(argv, cwd=None, env=None):
    subprocess.run([str(x) for x in argv], cwd=cwd, env=env, check=True)


class HTTPSOnlyRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, newurl):
        if urlparse(newurl).scheme != 'https':
            raise ValueError('HTTPS redirect required')
        return super().redirect_request(request, response, code, message, headers, newurl)


def download(url, path, limit):
    if path.exists():
        return
    if urlparse(url).scheme != 'https':
        raise ValueError('HTTPS required')
    temporary = None
    try:
        opener = urllib.request.build_opener(HTTPSOnlyRedirects())
        with opener.open(url, timeout=60) as response:
            if urlparse(response.url).scheme != 'https':
                raise ValueError('HTTPS redirect required')
            declared = response.headers.get('Content-Length')
            if declared is not None and int(declared) > limit:
                raise ValueError('Download exceeds fixed byte limit')
            fd, name = tempfile.mkstemp(prefix=path.name + '-', suffix='.part', dir=path.parent)
            temporary = Path(name)
            with os.fdopen(fd, 'wb') as output:
                received = 0
                while block := response.read(min(1024 * 1024, limit - received + 1)):
                    if received + len(block) > limit:
                        raise ValueError('Download exceeds fixed byte limit')
                    output.write(block)
                    received += len(block)
            os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def fetch():
    downloads = ROOT / 'downloads'
    downloads.mkdir(parents=True, exist_ok=True)
    for source in MANIFEST['sources']:
        path = downloads / source['filename']
        download(source['url'], path, ARCHIVE_LIMIT)
        with path.open('rb') as archive:
            digest = hashlib.file_digest(archive, 'sha256').hexdigest()
        if digest != source['sha256']:
            raise ValueError(f"Checksum mismatch: {source['name']}")
    signature = MANIFEST['ffmpeg_signature']
    download(signature['url'], downloads / 'ffmpeg-9.0.2.tar.xz.asc', SIGNATURE_LIMIT)
    download(signature['key_url'], downloads / 'ffmpeg-devel.asc', KEY_LIMIT)
    # Temporary keyring is isolated; no user's GnuPG configuration/keyring is read.
    with tempfile.TemporaryDirectory(prefix='blink-gpg-', dir='/tmp') as keyring:
        os.chmod(keyring, 0o700)
        args = ['gpg', '--batch', '--no-options', '--homedir', keyring]
        run(args + ['--import', downloads / 'ffmpeg-devel.asc'])
        verified = subprocess.run(args + ['--status-fd', '1', '--verify',
            downloads / 'ffmpeg-9.0.2.tar.xz.asc', downloads / 'ffmpeg-9.0.2.tar.xz'],
            check=True, capture_output=True, text=True)
        lines = verified.stdout.splitlines()
        valid = [line.split()[2] for line in lines if line.startswith('[GNUPG:] VALIDSIG ')]
        if valid != [signature['fingerprint']]:
            raise ValueError('Unexpected FFmpeg signing fingerprint')
    return downloads


def build(downloads, jobs, disable_assembly=False):
    # This native-host recipe intentionally makes no cross-platform acceptance claim.
    if platform.system() not in ('Darwin', 'Linux'):
        raise ValueError('Local recipe currently supports POSIX build hosts only')
    work = Path(tempfile.mkdtemp(prefix='local-', dir=ROOT))
    prefix = work / 'prefix'
    sources = work / 'sources'
    sources.mkdir()
    for source in MANIFEST['sources']:
        with tarfile.open(downloads / source['filename']) as archive:
            archive.extractall(sources, filter='data')
        if not (sources / source['root']).is_dir():
            raise ValueError('Unexpected archive root')
    env = {k: v for k, v in os.environ.items() if k in ('PATH', 'TMPDIR', 'LANG', 'LC_ALL')}
    env.update(PKG_CONFIG_LIBDIR=str(prefix / 'lib' / 'pkgconfig'), PKG_CONFIG_PATH='',
               CFLAGS='-O2', CPPFLAGS='', LDFLAGS='', MAKEFLAGS='')
    cmake_platform = []
    if platform.system() == 'Darwin':
        env['MACOSX_DEPLOYMENT_TARGET'] = '13.0'
        env['CC'] = '/usr/bin/clang'
        env['CXX'] = '/usr/bin/clang++'
        cmake_platform = ['-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0']
    commands = []

    def execute(args, cwd=None):
        commands.append([str(x) for x in args])
        run(args, cwd, env)

    for name, extra in [('opus', ['-DOPUS_BUILD_TESTING=OFF', '-DOPUS_BUILD_PROGRAMS=OFF']),
                        ('libsrtp', ['-DLIBSRTP_TEST_APPS=OFF', '-DENABLE_OPENSSL=OFF', '-DENABLE_MBEDTLS=OFF'])]:
        source = next(s for s in MANIFEST['sources'] if s['name'] == name)
        output = work / name
        execute(['cmake', '-S', sources / source['root'], '-B', output,
            '-DCMAKE_BUILD_TYPE=Release', f'-DCMAKE_INSTALL_PREFIX={prefix}',
            '-DBUILD_SHARED_LIBS=OFF', '-DCMAKE_POSITION_INDEPENDENT_CODE=ON', *cmake_platform, *extra])
        execute(['cmake', '--build', output, '--parallel', str(jobs)])
        execute(['cmake', '--install', output])
    x264 = sources / next(s['root'] for s in MANIFEST['sources'] if s['name'] == 'x264')
    execute([x264 / 'configure', f'--prefix={prefix}', '--enable-static', '--enable-pic',
             '--disable-cli', '--disable-opencl', *(['--disable-asm'] if disable_assembly else [])], x264)
    execute(['make', f'-j{jobs}'], x264)
    execute(['make', 'install-lib-static'], x264)
    ffmpeg = sources / 'ffmpeg-9.0.2'
    flags = [f'--prefix={prefix}', '--disable-autodetect', '--disable-everything',
        '--disable-network', '--disable-protocols', '--disable-programs', '--disable-doc',
        '--disable-debug', '--disable-shared', '--enable-static', '--enable-pic',
        f'--cc={env.get("CC", "cc")}', '--enable-gpl', '--enable-version3', '--enable-libx264', '--enable-libopus',
        '--enable-avcodec', '--enable-avformat', '--enable-avutil', '--enable-swscale',
        '--enable-swresample', '--disable-avdevice', '--disable-avfilter',
        '--enable-demuxer=mpegts', '--enable-muxer=mpegts',
        '--enable-parser=h264,aac,aac_latm', '--enable-decoder=h264,aac,aac_latm,opus,pcm_alaw,pcm_mulaw',
        '--enable-encoder=libx264,libopus,pcm_alaw,pcm_mulaw,aac', '--pkg-config-flags=--static']
    if disable_assembly:
        flags.append('--disable-asm')
    execute([ffmpeg / 'configure', *flags], ffmpeg)
    execute(['make', f'-j{jobs}'], ffmpeg)
    execute(['make', 'install'], ffmpeg)
    config = (ffmpeg / 'config.h').read_text()
    for forbidden in ('CONFIG_NETWORK', 'CONFIG_NONFREE', 'CONFIG_LIBFDK_AAC'):
        if f'#define {forbidden} 0' not in config:
            raise ValueError(f'Forbidden configuration: {forbidden}')
    flags = shlex.split(subprocess.check_output(['pkg-config', '--static', '--cflags', '--libs',
        'libavformat', 'libavcodec', 'libavutil', 'libswresample'], env=env, text=True))
    probe = work / 'check-inputs'
    execute([env.get('CC', 'cc'), '-std=c11', '-Wall', '-Wextra', '-Werror',
        f'-I{prefix / "include"}', HERE / 'check-inputs.c', '-o', probe,
        *flags, prefix / 'lib' / 'libsrtp2.a'])
    checked = subprocess.check_output([str(probe)], env=env, text=True).strip()
    compiler = subprocess.check_output([env.get('CC', 'cc'), '--version'], env=env, text=True)
    dynamic = subprocess.check_output(['otool', '-L', str(probe)], env=env, text=True) if platform.system() == 'Darwin' else None
    receipt = {'source_inputs': MANIFEST, 'platform': platform.platform(), 'machine': platform.machine(),
        'compiler': compiler, 'public_api_smoke': checked, 'dynamic_dependencies': dynamic,
        'recipe_sha256': RECIPE_SHA256,
        'smoke_source_sha256': hashlib.sha256((HERE / 'check-inputs.c').read_bytes()).hexdigest(),
        'prefix': str(prefix), 'commands': commands, 'distribution_ready': False,
        'prototype_assembly_disabled': disable_assembly,
        'limitations': ['Only this native host built; five target baselines unverified',
                        'No worker distribution, RTP/SRTP wire parity, or physical acceptance proved']}
    (work / 'build-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    receipt['path_normalization'] = 'Checkout root replaced with <checkout>; raw receipt retained in ignored build directory'
    normalized = (json.dumps(receipt, indent=2) + '\n').replace(str(HERE.parent.parent), '<checkout>')
    (work / 'normalized-build-receipt.json').write_text(normalized)
    print(f'Local isolated prefix: {prefix}', flush=True)
    print(f'Build receipt: {work / "build-receipt.json"}', flush=True)
    return prefix


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-local', action='store_true')
    parser.add_argument('--jobs', type=int, default=4)
    parser.add_argument('--disable-assembly', action='store_true',
                        help='Prototype only: disable FFmpeg/x264 assembly, sacrificing performance')
    parser.add_argument('--prefix-file', type=Path, help='Write successful prefix to a new file under native/build/deps')
    args = parser.parse_args()
    if not 1 <= args.jobs <= 16:
        parser.error('--jobs must be 1..16')
    if args.prefix_file:
        if not args.build_local:
            parser.error('--prefix-file requires --build-local')
        try:
            args.prefix_file.resolve().relative_to(ROOT.resolve())
        except ValueError:
            parser.error('--prefix-file must be under native/build/deps')
        if args.prefix_file.exists() or args.prefix_file.is_symlink():
            parser.error('--prefix-file must not already exist')
    fetched = fetch()
    print('Four source archives verified; FFmpeg signature fingerprint verified.', flush=True)
    if args.build_local:
        prefix = build(fetched, args.jobs, args.disable_assembly)
        if args.prefix_file:
            with args.prefix_file.open('x') as output:
                output.write(str(prefix) + '\n')
