#!/usr/bin/env python3
"""Fetch authenticated pinned sources; optionally build local static codec libraries.
No global installs, keyring changes, worker publication, or cross-compilation.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import re
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
    subprocess.run([argument(x) for x in argv], cwd=cwd, env=env, check=True)


def argument(value):
    return value.as_posix() if isinstance(value, Path) else str(value)


def unix_path(path):
    return subprocess.check_output(['cygpath', '-u', argument(path)], text=True).strip()


def configure_command(script, flags, system):
    # Native Windows Python cannot directly execute a POSIX configure script.
    return ['bash', unix_path(script), *flags] if system == 'Windows' else [argument(script), *flags]


def build_environment(prefix, system):
    if system not in ('Darwin', 'Linux', 'Windows'):
        raise ValueError('Unsupported native build host')
    if system == 'Windows' and os.environ.get('MSYSTEM') != 'UCRT64':
        raise ValueError('Windows build requires the native MSYS2 UCRT64 environment')
    allowed = {'PATH', 'TMPDIR', 'LANG', 'LC_ALL'}
    if system == 'Windows':
        allowed.update(('SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'MSYSTEM'))
    env = {key: value for key, value in os.environ.items() if key.upper() in allowed}
    env.update(PKG_CONFIG_LIBDIR=(prefix / 'lib' / 'pkgconfig').as_posix(), PKG_CONFIG_PATH='',
               CFLAGS='-O2', CPPFLAGS='', LDFLAGS='', MAKEFLAGS='')
    if system == 'Darwin':
        env.update(MACOSX_DEPLOYMENT_TARGET='13.0', CC='/usr/bin/clang', CXX='/usr/bin/clang++')
    elif system == 'Windows':
        env.update(CC='gcc', CXX='g++', LDFLAGS='-static -static-libgcc')
    return env


def audit_dependencies(binary, system, env):
    audit = ['otool', '-L'] if system == 'Darwin' else ['objdump', '-p'] if system == 'Windows' else ['readelf', '-d']
    result = subprocess.check_output([*audit, argument(binary)], env=env, text=True)
    if system == 'Windows':
        imports = re.findall(r'DLL Name:\s*(\S+)', result, re.IGNORECASE)
        system_dll = re.compile(r'^(kernel32|ntdll|ucrtbase|msvcrt|ws2_32|advapi32|bcrypt|crypt32|'
                                r'user32|gdi32|ole32|shell32|secur32|winmm|psapi|iphlpapi|'
                                r'api-ms-win-[a-z0-9-]+)\.dll$', re.IGNORECASE)
        if not imports or any(not system_dll.fullmatch(name) for name in imports):
            raise ValueError('Non-system Windows dependency or missing PE import evidence')
    return result


def write_worker_artifact(prefix, worker, output, source_sha):
    """Retain tested CI worker plus identity receipt; never a distribution approval."""
    system = platform.system()
    machine = platform.machine().lower()
    architecture = {'amd64': 'x64', 'x86_64': 'x64', 'arm64': 'arm64', 'aarch64': 'arm64'}.get(machine)
    target = f'{dict(Darwin="darwin", Linux="linux", Windows="win32").get(system)}-{architecture}'
    if target not in ('linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'win32-x64'):
        raise ValueError('Unsupported native artifact target')
    output.resolve().relative_to(ROOT.parent.resolve())
    if not re.fullmatch(r'[a-f0-9]{40}', source_sha):
        raise ValueError('Exact source SHA required')
    if worker.is_symlink() or not worker.is_file() or not 1 <= worker.stat().st_size <= 64 * 1024 * 1024:
        raise ValueError('Regular bounded worker required')
    dependency = json.loads((prefix.parent / 'normalized-build-receipt.json').read_text())
    if dependency['recipe_sha256'] != RECIPE_SHA256:
        raise ValueError('Dependency recipe identity differs from current recipe')
    dynamic = audit_dependencies(worker, system, build_environment(prefix, system))
    with worker.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    receipt = {'target': target, 'source_sha': source_sha, 'sha256': digest, 'dependencies': dependency,
               'dynamic_dependencies': dynamic, 'distribution_ready': False,
               'limitations': ['CI build/test artifact only; no minimum-OS clean-host or npm artifact acceptance',
                               'No corresponding-source distribution or integrated physical acceptance']}
    payload = (json.dumps(receipt, indent=2) + '\n').encode()
    with tarfile.open(output, 'x:gz') as archive:
        executable = archive.gettarinfo(worker, arcname='blink-codec-worker.exe' if system == 'Windows' else 'blink-codec-worker')
        executable.mode = 0o755  # Windows file modes do not otherwise preserve the package executable contract.
        with worker.open('rb') as stream:
            archive.addfile(executable, stream)
        info = tarfile.TarInfo('worker-receipt.json')
        info.size = len(payload)
        archive.addfile(info, io.BytesIO(payload))


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
    temporary_root = tempfile.gettempdir() if platform.system() == 'Windows' else '/tmp'
    with tempfile.TemporaryDirectory(prefix='blink-gpg-', dir=temporary_root) as keyring:
        os.chmod(keyring, 0o700)
        args = ['gpg', '--batch', '--no-options', '--no-autostart', '--homedir', Path(keyring).as_posix()]
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
    system = platform.system()
    build_environment(ROOT, system)  # Reject unsupported hosts before creating a build directory.
    work = Path(tempfile.mkdtemp(prefix='local-', dir=ROOT))
    prefix = work / 'prefix'
    sources = work / 'sources'
    sources.mkdir()
    for source in MANIFEST['sources']:
        with tarfile.open(downloads / source['filename']) as archive:
            archive.extractall(sources, filter='data')
        if not (sources / source['root']).is_dir():
            raise ValueError('Unexpected archive root')
    env = build_environment(prefix, system)
    cmake_platform = []
    install_prefix = prefix.as_posix()
    if system == 'Darwin':
        cmake_platform = ['-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0']
    elif system == 'Windows':
        compiler_target = subprocess.check_output(['gcc', '-dumpmachine'], env=env, text=True).strip()
        if compiler_target != 'x86_64-w64-mingw32':
            raise ValueError('Windows compiler must target native x86_64-w64-mingw32')
        cmake_platform = ['-G', 'Ninja', '-DCMAKE_C_COMPILER=gcc', '-DCMAKE_CXX_COMPILER=g++',
                          '-DCMAKE_EXE_LINKER_FLAGS=-static -static-libgcc']
    commands = []

    def execute(args, cwd=None):
        commands.append([argument(x) for x in args])
        run(args, cwd, env)

    for name, extra in [('opus', ['-DOPUS_BUILD_TESTING=OFF', '-DOPUS_BUILD_PROGRAMS=OFF']),
                        ('libsrtp', ['-DLIBSRTP_TEST_APPS=OFF', '-DENABLE_OPENSSL=OFF',
                                     '-DENABLE_MBEDTLS=OFF', '-DENABLE_NSS=OFF'])]:
        source = next(s for s in MANIFEST['sources'] if s['name'] == name)
        output = work / name
        execute(['cmake', '-S', sources / source['root'], '-B', output,
            '-DCMAKE_BUILD_TYPE=Release', f'-DCMAKE_INSTALL_PREFIX={prefix.as_posix()}',
            '-DBUILD_SHARED_LIBS=OFF', '-DCMAKE_POSITION_INDEPENDENT_CODE=ON', *cmake_platform, *extra])
        execute(['cmake', '--build', output, '--parallel', str(jobs)])
        execute(['cmake', '--install', output])
    x264 = sources / next(s['root'] for s in MANIFEST['sources'] if s['name'] == 'x264')
    execute(configure_command(x264 / 'configure', [f'--prefix={install_prefix}', '--enable-static', '--enable-pic',
             '--disable-cli', '--disable-opencl', *(['--disable-asm'] if disable_assembly else [])], system), x264)
    execute(['make', f'-j{jobs}'], x264)
    execute(['make', 'install-lib-static'], x264)
    ffmpeg = sources / 'ffmpeg-9.0.2'
    flags = [f'--prefix={install_prefix}', '--disable-autodetect', '--disable-everything',
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
    if system == 'Windows':
        flags += ['--target-os=mingw32', '--extra-ldflags=-static -static-libgcc']
    execute(configure_command(ffmpeg / 'configure', flags, system), ffmpeg)
    execute(['make', f'-j{jobs}'], ffmpeg)
    execute(['make', 'install'], ffmpeg)
    config = (ffmpeg / 'config.h').read_text()
    for forbidden in ('CONFIG_NETWORK', 'CONFIG_NONFREE', 'CONFIG_LIBFDK_AAC'):
        if f'#define {forbidden} 0' not in config:
            raise ValueError(f'Forbidden configuration: {forbidden}')
    flags = shlex.split(subprocess.check_output(['pkg-config', '--static', '--cflags', '--libs',
        'libavformat', 'libavcodec', 'libavutil', 'libswresample'], env=env, text=True))
    probe = work / ('check-inputs.exe' if system == 'Windows' else 'check-inputs')
    execute([env.get('CC', 'cc'), '-std=c11', '-Wall', '-Wextra', '-Werror',
        f'-I{prefix / "include"}', HERE / 'check-inputs.c', '-o', probe,
        *flags, prefix / 'lib' / 'libsrtp2.a', *(['-static', '-static-libgcc', '-lws2_32'] if system == 'Windows' else [])])
    checked = subprocess.check_output([str(probe)], env=env, text=True).strip()
    compiler = subprocess.check_output([env.get('CC', 'cc'), '--version'], env=env, text=True)
    dynamic = audit_dependencies(probe, system, env)
    receipt = {'source_inputs': MANIFEST, 'platform': platform.platform(), 'machine': platform.machine(),
        'compiler': compiler, 'public_api_smoke': checked, 'dynamic_dependencies': dynamic,
        'recipe_sha256': RECIPE_SHA256,
        'smoke_source_sha256': hashlib.sha256((HERE / 'check-inputs.c').read_bytes()).hexdigest(),
        'prefix': str(prefix), 'commands': commands, 'distribution_ready': False,
        'prototype_assembly_disabled': disable_assembly,
        'limitations': ['Only this native host built; five target baselines unverified',
                        'No worker distribution, RTP/SRTP wire parity, or physical acceptance proved']}
    if system == 'Windows':
        receipt['toolchain_packages'] = subprocess.check_output(['pacman', '-Q'], env=env, text=True)
    (work / 'build-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    receipt['path_normalization'] = 'Checkout root replaced with <checkout>; raw receipt retained in ignored build directory'
    checkout = HERE.parent.parent
    normalized = (json.dumps(receipt, indent=2) + '\n').replace(json.dumps(str(checkout))[1:-1], '<checkout>')
    normalized = normalized.replace(checkout.as_posix(), '<checkout>')
    if system == 'Windows':
        normalized = normalized.replace(unix_path(checkout), '<checkout>')
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
