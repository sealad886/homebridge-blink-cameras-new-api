/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <stdio.h>
#include <srtp2/srtp.h>
int main(void) {
    if(srtp_get_version()!=0x02080001u || srtp_init()!=srtp_err_status_ok)return 2;
    srtp_shutdown();puts("libSRTP 2.8.1 public API verified");return 0;
}
