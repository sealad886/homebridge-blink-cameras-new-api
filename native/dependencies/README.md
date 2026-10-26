# Pinned native source inputs

See the [private media worker overview](../README.md) for scope and navigation.

## Windows system runtime notices

The Windows candidate toolchain inventory reported MinGW-w64 CRT
`14.0.0.r536.g7ce22f663-1` and GCC `16.2.0-6` (CI job `121350561757`).
Static linking does not remove the runtime's binary-redistribution notice
requirements. These unedited upstream documents are mandatory members of
`corresponding-source.tar.gz`, under `project/native/dependencies/licenses/`;
the generated package `native/NOTICE` points to both documents.

| Retained file | Immutable upstream source | SHA-256 |
| --- | --- | --- |
| `licenses/mingw-w64-runtime-COPYING` | [MinGW-w64 runtime notice at `7ce22f6637cc93fd2eb37c8a645908c92bb80bbd`](https://raw.githubusercontent.com/mingw-w64/mingw-w64/7ce22f6637cc93fd2eb37c8a645908c92bb80bbd/COPYING.MinGW-w64-runtime/COPYING.MinGW-w64-runtime.txt) | `1db8da07b436c68833c0673ffee3d9fcb2526047f3820b81661865dfedc79a1f` |
| `licenses/gcc-COPYING.RUNTIME` | [GCC 16.2.0 runtime exception at `78d4ac73dd391005b895a6148cd9831e28e1208b`](https://raw.githubusercontent.com/gcc-mirror/gcc/78d4ac73dd391005b895a6148cd9831e28e1208b/COPYING.RUNTIME) | `9d6b43ce4d8de0c878bf16b54d8e7a10d9bd42b75178153e3af6a815bdc90f74` |

The GCC release tag `releases/gcc-16.2.0` resolves through annotated tag object
`1831ac03fd08e3400c16b29f21762e6b326a618d` to the source commit above. The
MinGW notice includes ZPL-2.1 and the runtime's third-party notices; the package's
aggregate SPDX expression includes `AND ZPL-2.1`. The GCC Runtime Library Exception
3.1 supplies the additional permission for eligible compilation of independent
modules, as confirmed by the [GCC 16.2.0 libgcc source grant](https://raw.githubusercontent.com/gcc-mirror/gcc/78d4ac73dd391005b895a6148cd9831e28e1208b/libgcc/libgcc2.c);
its exact text accompanies the existing GPLv3 text in `native/COPYING`.
This system-runtime attribution adds no fifth codec/security source archive and
does not bundle the GCC compiler or claim full compiler-source distribution.

Before building a Windows candidate, compare the installed CRT notice with the
retained upstream bytes. The [MSYS2 CRT package file listing](https://packages.msys2.org/packages/mingw-w64-ucrt-x86_64-crt)
and [official package recipe](https://github.com/msys2/MINGW-packages/blob/master/mingw-w64-crt/PKGBUILD)
identify this installed notice path:

```sh
cmp -- /ucrt64/share/licenses/crt/COPYING.MinGW-w64-runtime.txt \
  native/dependencies/licenses/mingw-w64-runtime-COPYING
```

A mismatch blocks that build until its actual toolchain notice/provenance is
reconciled. The package source inventory and verifier require both notices and
bind their bytes to the exact source revision; offline tests retain their
upstream hashes. This notice correction supplies no binary, platform, performance
or physical acceptance result.

This directory prepares source inputs and local static libraries for the codec-only
worker. It does not enable worker loading, install anything globally, publish a
binary, or prove five-target distribution acceptance.

Run with the repository's existing Python environment:

```sh
.venv/bin/python native/dependencies/prepare.py
.venv/bin/python native/dependencies/prepare.py --build-local --jobs 4
```

First command downloads into ignored `native/build/deps/downloads`, verifies all
four archive SHA-256 values in `source-inputs.json`, and verifies FFmpeg's detached
signature against its exact pinned release-key fingerprint using a fresh temporary
keyring. It never reads or changes the user's GnuPG keyring. GnuPG agent autostart
is disabled: public-key signature verification needs no private-key service. Temporary keyring lives
under unique `/tmp/blink-gpg-*` on POSIX because long project paths can exceed agent
socket limits; Windows uses its process temporary directory. Existing downloads
are verified before use; checksum failures stop without
extracting or building. Build command extracts authenticated archives into a fresh
ignored `native/build/deps/local-*`, builds into that directory, and installs only
into its own `prefix`. Earlier local build directories are preserved.

Upstream build/install commands were inspected: x264's `install-lib-static` copies
only its library/header/pkg-config files into prefix; Opus/libSRTP CMake install
uses supplied CMAKE_INSTALL_PREFIX; FFmpeg installation uses explicit --prefix.
No package manager, system installation, sudo, remote execution, or publishing
occurs. Upstream configure/compiler probes and local archive creation are expected.
POSIX build commands inherit PATH and locale/temp settings only. Windows additionally
retains required process runtime paths and the explicit UCRT64 selector; ambient
compiler flags, proxy settings and pkg-config paths are excluded. Dependency
pkg-config resolution points exclusively at isolated prefix, with autodetection disabled.

## Provenance

- [FFmpeg official releases](https://ffmpeg.org/download.html): 9.0.2 tar signature
  verified as `FCF986EA15E6E293A5644F10B4322F04D67658D8`. Checked tar SHA-256 in manifest.
- [Opus official downloads](https://opus-codec.org/downloads/): 1.6.1 published
  SHA-256 matches downloaded tar. No signature claim is made for this archive.
- [Cisco libSRTP v2.8.1](https://github.com/cisco/libsrtp/releases/tag/v2.8.1): GitHub
  tag API resolves to `6ff02afa8d2dc3f2e8896af391d137c1c66ff6fa`. Archive is pinned to
  full commit and measured SHA-256; no signed-tag claim.
- [VideoLAN x264 upstream](https://code.videolan.org/videolan/x264): upstream commit
  API resolved master to `0480cb05fa188d37ae87e8f4fd8f1aea3711f7ee` during this check.
  Manifest pins that immutable commit and measured archive SHA-256, not floating master.
  No signed-commit claim.

The verified libSRTP include/srtp.h public surface contains srtp_init, srtp_create,
srtp_protect/unprotect, srtp_protect_rtcp/unprotect_rtcp, srtp_dealloc and
AES_CM_128_HMAC_SHA1_80/32 policy helpers. Its selected built-in crypto needs neither
OpenSSL nor MbedTLS. API presence does not prove HomeKit RTP/SRTP wire parity.

## Configuration and licensing

Build selects static Opus, libSRTP, x264 and FFmpeg libraries; no dependency command
line programs. FFmpeg has --disable-autodetect --disable-everything --disable-network
--disable-protocols --disable-programs, then explicitly enables MPEG-TS input/output,
H.264/AAC/AAC-LATM parsing/decoding, libx264/libopus/PCM-law/AAC encoding, swscale and
swresample. GPL and version3 are enabled. Nonfree and libfdk_aac are disabled and
checked after configure. Built-in AAC encoder is used; no FDK package is fetched.

Selected linked worker configuration is GPL-3.0-or-later; x264 headers explicitly
say GPL-2.0-or-later. Opus and libSRTP carry BSD-style three-clause licenses. Checked
upstream notices are retained in licenses/. Worker GPLv3 text exists in ../COPYING.
Source archives, precise recipe, compiler/toolchain identification, complete notices,
and target artifacts must accompany any future corresponding-source distribution.
This directory alone is not a distribution compliance or release approval claim.

Recipe supports Darwin/Linux native hosts and a native Windows MSYS2 UCRT64 candidate.
Windows refuses the MSYS/Cygwin compiler environment: it requires `MSYSTEM=UCRT64`
and a GCC target of `x86_64-w64-mingw32`. POSIX configure scripts are launched through
MSYS2 Bash, with their script paths converted by `cygpath`; installation and native
compiler paths use forward-slash Windows paths. CMake uses the native MinGW build
and explicit Ninja generator. Static MinGW runtime flags and Winsock linkage are
explicit. This follows [FFmpeg's native Windows guidance](https://ffmpeg.org/platform.html#Windows),
[MSYS2 environments](https://www.msys2.org/docs/environments/) and
[MSYS2 CMake guidance](https://www.msys2.org/docs/cmake/).

macOS deployment target13.0 remains requested. Linux glibc/kernel baseline, actual
macOS13 execution, Windows minimum-version execution, all target clean-host audits
and independent verification remain release gates. Earlier POSIX CI source-build
results do not establish the changed final package. Windows hosted execution and
all final target qualifications remain unverified. No cross-target support is
inferred from portable C source or a successful arm64 build.

## Integrated distribution status

The secure cutover now has an explicit five-candidate packager, a hash-verified
runtime loader, complete corresponding source and clean-host exact-tar codec
qualification in the release workflow. Candidate receipts deliberately remain
`distribution_ready: false`; final qualification receipts carry separate evidence
for the exact npm integrity. Implementation is not release acceptance: final
five-host results, security checks and performance review are still required.
The candidate-build description below is separate from the final package file
list and runtime contract.

## Native candidate CI validation

Test workflow defines five native source-build candidates: `linux-x64` on
`ubuntu-22.04`, `linux-arm64` on `ubuntu-22.04-arm`, `darwin-arm64` on `macos-15`,
`darwin-x64` on `macos-15-intel`, and `win32-x64` on `windows-2022`. Labels and
architectures were checked against the current
[GitHub runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
Each lane verifies actual native architecture before building. POSIX selects
Python3.12 using the existing pinned setup-python action. Windows uses the native
UCRT64 Python package and requires Python3.12 or newer.

Windows installs its build tools only in the ephemeral CI job through
`msys2/setup-msys2` v2.29.0, pinned to verified tag commit
`fb197b72ce45fb24f17bf3f807a388985654d1f2`. Its
[checked action inputs](https://github.com/msys2/setup-msys2/blob/fb197b72ce45fb24f17bf3f807a388985654d1f2/action.yml)
select UCRT64, disabled action cache and explicit GNU Make/GnuPG/diffutils plus
native GCC/CMake/Ninja/pkgconf/Python packages. MSYS2's signed package workflow
supplies tools, not prebuilt codec libraries. All four codec/security libraries
still build from the unchanged verified source pins. Actual package inventory is
retained in the dependency receipt; compiler/tool versions are not claimed fixed
by the action pin. No local package installation or service change is involved.

`--disable-assembly` disables x264/FFmpeg assembly explicitly for candidate CI,
avoiding assembler installation. This sacrifices performance and does not establish
production real-time behavior. Opus may still use compiler-supported intrinsics.
Verification decoders for Opus/PCMA/PCMU are selected to independently decode worker
output; worker input remains explicitly restricted to H.264/AAC/AAC-LATM.

`--prefix-file native/build/deps/ci-prefix.txt` writes successful verified prefix only
into a new output file within ignored dependency build directory. No guessed build
subdirectory is used. Existing/outside paths are rejected before fetching; raw build
receipts stay ignored. A normalized-build-receipt.json replaces checkout root with
`<checkout>` for portable evidence, without changing hashes or verification facts.
Recipe hash is captured at process startup; receipts identify executed recipe even
if another agent edits source while long build runs. Existing historical receipts
remain historical; their hashes do not imply acceptance of the new recipe.

Dependency smoke executables and final workers receive native dependency audits:
`readelf -d` on Linux, `otool -L` and `otool -l` on Darwin, and `objdump -p` on
Windows. Each fails for missing import evidence or imports outside its closed
system-library set. Darwin admits only the observed libSystem/CoreFoundation/
CoreVideo/CoreMedia paths; Linux admits the baseline libc/libm/libpthread/libdl/
librt and x64/arm64 loader names. No unobserved libgcc/libatomic import is admitted.
Darwin LC_RPATH and Linux RPATH/RUNPATH are refused. Windows continues to reject
MinGW/MSYS runtime DLLs. This bounded gate does not establish crash-policy or
minimum-OS behavior; same-prefix historical receipts do not qualify a new recipe.

Only after native behavioral, parent IPC and actual LAN output integration tests
pass (`BLINK_MEDIA_NETWORK_TEST=1`), the job creates one tar
containing the worker with executable mode and a receipt binding source SHA,
worker SHA256, actual dependency/source recipe receipt and dynamic imports.
The existing pinned upload-artifact action retains that candidate for seven days.
`distribution_ready` remains false. These temporary CI artifacts omit complete
corresponding source and are not the permanent source distribution required for
release. Exact npm tarball verification, all five successful hosted results,
fresh-host tests and license/source closure remain mandatory before publication.
Local network filtering can prevent the opt-in LAN test from receiving packets;
such failures are retained as environment evidence and do not waive the hosted
network gate. A passing unit suite does not replace actual socket reception.

Downloads require HTTPS including redirects, fixed archive64MiB/key1MiB/signature64KiB
actual-byte limits, and unique partial files renamed atomically only on completion.
Interruption/overflow removes only owned temporary file. Offline checks cover exact
limit, limit+1, false/missing Content-Length, interrupted cleanup, HTTPS rejection,
and cached checksum failure before signature/build execution.

The prior Ubuntu x64/macOS arm64 prototype jobs ran successfully in release-source
CI, including RC.19 validation recorded in [PR #79](https://github.com/sealad886/homebridge-blink-cameras-new-api/pull/79).
That historical source-build/test evidence does not prove this changed recipe or
the added Windows/macOS x64/Linux arm64 lanes. All five final baseline/runtime/
artifact acceptance gates remain open. macOS15 CI does not prove macOS13 runtime
compatibility; Windows Server2022 CI does not prove a Windows10 minimum baseline.
