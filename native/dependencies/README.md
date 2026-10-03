# Pinned native source inputs

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
keyring. It never reads or changes the user's GnuPG keyring. Temporary keyring lives
under unique `/tmp/blink-gpg-*` because long project paths can exceed agent socket
limits. Existing downloads are verified before use; checksum failures stop without
extracting or building. Build command extracts authenticated archives into a fresh
ignored `native/build/deps/local-*`, builds into that directory, and installs only
into its own `prefix`. Earlier local build directories are preserved.

Upstream build/install commands were inspected: x264's `install-lib-static` copies
only its library/header/pkg-config files into prefix; Opus/libSRTP CMake install
uses supplied CMAKE_INSTALL_PREFIX; FFmpeg installation uses explicit --prefix.
No package manager, system installation, sudo, remote execution, or publishing
occurs. Upstream configure/compiler probes and local archive creation are expected.
Build commands inherit PATH and locale/temp settings only; dependency pkg-config
resolution points exclusively at isolated prefix, with autodetection disabled.

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

Local recipe currently supports Darwin/Linux native hosts; macOS deployment target
13.0 is requested. Linux baseline glibc, Windows toolchain recipe, macOS x64,
Linux arm64/x64, all target audits and independent verification remain gates.
No cross-target support is inferred from portable C source or a successful arm64 build.

## Prototype CI validation

Existing Test workflow now defines separate native-validation job for Ubuntu22.04
x64 and macOS15 arm64. These labels/architectures were checked against current
[GitHub runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
Current [Ubuntu22.04 image inventory](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2204-Readme.md)
and [macOS15 arm64 inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-arm64-Readme.md)
were consulted. Job verifies available tools before use, selects Python3.12 through
setup-python v7.0.0 at checked tag commit `5fda3b95a4ea91299a34e894583c3862153e4b97`,
and installs no native packages. Source-build/test job uploads or publishes no binaries.

`--disable-assembly` disables x264/FFmpeg assembly explicitly for prototype CI,
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
if another agent edits source while long build runs.

Downloads require HTTPS including redirects, fixed archive64MiB/key1MiB/signature64KiB
actual-byte limits, and unique partial files renamed atomically only on completion.
Interruption/overflow removes only owned temporary file. Offline checks cover exact
limit, limit+1, false/missing Content-Length, interrupted cleanup, HTTPS rejection,
and cached checksum failure before signature/build execution.

This workflow has not been dispatched or run as part of local implementation.
Windows/macOS x64/Linux arm64 and all five baseline/runtime/artifact acceptance
remain open. macOS15 CI does not prove macOS13 runtime compatibility.
