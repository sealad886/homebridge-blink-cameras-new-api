# Packet-protection helper

The GPL-3.0-or-later helper links only the pinned BSD-3-Clause libSRTP 2.8.1.
It implements AES-CM-128/HMAC-SHA1-80 RTP and RTCP protection over private
stdin/stdout pipes. No FFmpeg libraries, executable, codec source archives,
provider URLs, sockets, or media decoder are included.

The protection-only protocol version is 1. Headers contain `BMI1` (input) or
`BMO1` (output), type and payload length as big-endian 32-bit integers.
Supported input types are initialization (10), RTP (11), RTCP (12), and STOP (4).
At most two explicitly initialized SSRCs and one bounded request are admitted.
The parent owns request deadlines, lifetime, backpressure and termination.

`--exec /absolute/path/to/ffmpeg ...` applies crash-output suppression and
executes an external installation. POSIX uses the same PID and inherited file
descriptors, with core dumps and file writes disabled and a CPU time limit.
Windows creates a suspended process, assigns it to a kill-on-close Job Object,
then resumes it while preserving inherited CRT descriptors. Killing the owning
supervisor closes the job and terminates FFmpeg and its descendants.

Build from a native host with Python 3.12+, CMake, make and a C compiler:

```sh
python native/dependencies/prepare.py --build-local --prefix-file native/build/deps/prefix.txt
make -C native test SRTP_PREFIX="$(cat native/build/deps/prefix.txt)" PYTHON=python
```

Release jobs build five targets, audit linked dependencies, package only the
protection helper and its complete corresponding source, then qualify the exact
installed npm tarball. External FFmpeg capabilities and media acceptance are
separate runtime/release checks; a helper test does not establish codec or
physical HomeKit acceptance. See `dependencies/README.md` for rebuild inputs.
