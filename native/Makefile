# Only the explicitly selected pinned libSRTP prefix is linked. No libav/FFmpeg.
ifndef SRTP_PREFIX
$(error Set SRTP_PREFIX to the verified maintained libsrtp installation)
endif
PYTHON ?= python3
CC ?= cc
CPPFLAGS += -I"$(SRTP_PREFIX)/include"
CFLAGS += -std=c11 -O2 -Wall -Wextra -Werror -D_POSIX_C_SOURCE=200809L
LDLIBS += "$(SRTP_PREFIX)/lib/libsrtp2.a"
ifeq ($(OS),Windows_NT)
EXEEXT = .exe
LDFLAGS += -municode
LDLIBS += -lws2_32
endif
.PHONY: all test
all: build/blink-protection-worker$(EXEEXT) build/check-protection$(EXEEXT)
build:
	mkdir -p build
build/blink-protection-worker$(EXEEXT): worker.c protocol.h protection.inc $(SRTP_PREFIX)/lib/libsrtp2.a | build
	$(CC) $(CPPFLAGS) $(CFLAGS) $< -o $@ $(LDFLAGS) $(LDLIBS)
build/check-protection$(EXEEXT): tests/check-protection.c $(SRTP_PREFIX)/lib/libsrtp2.a | build
	$(CC) $(CPPFLAGS) $(CFLAGS) $< -o $@ $(filter-out -municode,$(LDFLAGS)) $(LDLIBS)
test: all
	$(PYTHON) -m unittest discover -s tests -v
