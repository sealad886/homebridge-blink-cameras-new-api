# Explicit pinned prefix required: unqualified pkg-config can select ffmpeg@4.
ifndef FFMPEG_PREFIX
$(error Set FFMPEG_PREFIX to the explicit pinned FFmpeg 9.0.2 installation)
endif
ifndef SRTP_PREFIX
$(error Set SRTP_PREFIX to the verified maintained libsrtp installation)
endif
CPPFLAGS += -I"$(SRTP_PREFIX)/include"
LDLIBS += "$(SRTP_PREFIX)/lib/libsrtp2.a"
PYTHON ?= ../.venv/bin/python
CC ?= cc
PKG_CONFIG ?= pkg-config
PKG_CONFIG_FLAGS ?= --static
CHECKER_FFMPEG_PREFIX ?= $(FFMPEG_PREFIX)
CHECKER_PKG_CONFIG_FLAGS ?= $(PKG_CONFIG_FLAGS)
CHECKER_ENV = PKG_CONFIG_LIBDIR="$(CHECKER_FFMPEG_PREFIX)/lib/pkgconfig"
CHECKER_CPPFLAGS = $(shell $(CHECKER_ENV) $(PKG_CONFIG) --cflags libavcodec libavutil)
CHECKER_LDLIBS = $(shell $(CHECKER_ENV) $(PKG_CONFIG) $(CHECKER_PKG_CONFIG_FLAGS) --libs libavcodec libavutil)
PKG_CONFIG_ENV = PKG_CONFIG_LIBDIR="$(FFMPEG_PREFIX)/lib/pkgconfig"
LIBS = libavformat libavcodec libavutil libswscale libswresample
CPPFLAGS += $(shell $(PKG_CONFIG_ENV) $(PKG_CONFIG) --cflags $(LIBS))
CFLAGS += -std=c11 -O2 -Wall -Wextra -Werror -D_POSIX_C_SOURCE=200809L
LDLIBS += $(shell $(PKG_CONFIG_ENV) $(PKG_CONFIG) $(PKG_CONFIG_FLAGS) --libs $(LIBS))
ifeq ($(OS),Windows_NT)
EXEEXT = .exe
LDLIBS += -lws2_32
else
LDLIBS += -pthread
endif
.PHONY: all test
all: build/blink-codec-worker$(EXEEXT) build/fixture$(EXEEXT) build/check-output$(EXEEXT) build/audio-capabilities$(EXEEXT)
build:
	mkdir -p build
build/blink-codec-worker$(EXEEXT): worker.c protocol.h audio.inc output.inc protection.inc | build
	$(CC) $(CPPFLAGS) $(CFLAGS) $< -o $@ $(LDFLAGS) $(LDLIBS)
build/fixture$(EXEEXT): tests/fixture.c | build
	$(CC) $(CPPFLAGS) $(CFLAGS) $< -o $@ $(LDFLAGS) $(LDLIBS)
test: all
	$(PYTHON) -m unittest discover -s tests -v

build/check-output$(EXEEXT): tests/check-output.c | build
	$(CC) $(CHECKER_CPPFLAGS) $(CFLAGS) $< -o $@ $(LDFLAGS) $(CHECKER_LDLIBS)

build/audio-capabilities$(EXEEXT): tests/audio-capabilities.c | build
	$(CC) $(CPPFLAGS) $(CFLAGS) $< -o $@ $(LDFLAGS) $(LDLIBS)
