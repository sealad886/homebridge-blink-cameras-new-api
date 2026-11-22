# Protection-helper dependency

`source-inputs.json` pins the unmodified libSRTP 2.8.1 source archive by SHA-256
and upstream commit. `prepare.py` downloads over HTTPS, verifies the archive,
and builds an isolated static prefix. No global packages or user keyrings change.
FFmpeg, x264 and Opus are external executable implementation details and are not
compiled, linked or distributed by this project.

CI uses an exact-key cache for the libSRTP source archive. The committed source
manifest and recipe determine the key. Only a push to `main` can save a verified
archive. Pull requests and manual release runs can restore it. A cold or evicted
cache fetches the pinned HTTPS origin. Every run checks the archive against the
manifest, including on a cache hit. A checksum mismatch fails the run. Remove a
corrupt cache entry through GitHub's cache controls before retrying cold.
Each target still builds from source for that run and verifies the installed
artifact. Cached binaries never enter qualification.

The helper source is GPL-3.0-or-later; libSRTP is BSD-3-Clause. Full license text
is retained in `licenses/libsrtp-LICENSE`. Windows runtime notices are retained
for the UCRT64 toolchain. The npm package includes the helper, its sources,
libSRTP archive, notices, exact build recipe, tests and target receipts in
`native/corresponding-source.tar.gz`; no FFmpeg source archive is included.

Use the native target's C compiler, CMake, make and Python 3.12+. Windows builds
require MSYS2 UCRT64 and static runtime flags. Darwin uses Apple clang and a
macOS 13 deployment target. Such a target does not prove minimum-OS acceptance.
