#!/usr/bin/env bash
# Linux-only synthetic AC07 connection evidence. All IP configuration happens in
# a new, ephemeral network namespace with no interface except lo. Never attach a
# host interface, route, persistent namespace or provider session to this proof.
set -euo pipefail
umask 077
ulimit -c 0
if [[ "$(uname -s)" != Linux ]]; then
  printf '%s\n' 'Synthetic RTSP network gate requires Linux network namespaces' >&2
  exit 1
fi
for task_tool in node openssl ip strace unshare sudo timeout readlink bash; do
  if ! command -v "$task_tool" >/dev/null; then
    printf '%s\n' 'Synthetic RTSP network gate prerequisite unavailable' >&2
    exit 1
  fi
done
task_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
task_node="$(command -v node)"
task_bash="$(command -v bash)"
task_unshare="$(command -v unshare)"
test -f "$task_root/dist/blink-api/rtsp-broker.js"
task_namespace="$(readlink /proc/self/ns/net)"
task_tmp="$(mktemp -d "${TMPDIR:-/tmp}/blink-rtsp-syscalls.XXXXXX")"
trap 'rm -rf -- "$task_tmp"' EXIT
chmod 700 "$task_tmp"
cat > "$task_tmp/ca.conf" <<'CONFIG'
[req]
distinguished_name=dn
[dn]
[v3_ca]
basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign,cRLSign
CONFIG
cat > "$task_tmp/server.ext" <<'CONFIG'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:stream.immedia-semi.com
CONFIG
# Test fixture CLI only. Private keys go directly to owner-only files; command
# output is withheld, including when OpenSSL or the isolated namespace fails.
timeout --signal=KILL 5s openssl req -x509 -newkey rsa:2048 -nodes -days 1 -config "$task_tmp/ca.conf" \
  -extensions v3_ca -subj /CN=Owned-RTSP-Namespace-Test-CA -keyout "$task_tmp/ca.key" \
  -out "$task_tmp/ca.crt" >"$task_tmp/openssl.log" 2>&1
timeout --signal=KILL 5s openssl req -new -newkey rsa:2048 -nodes -config "$task_tmp/ca.conf" \
  -subj /CN=stream.immedia-semi.com -keyout "$task_tmp/server.key" \
  -out "$task_tmp/server.csr" >>"$task_tmp/openssl.log" 2>&1
timeout --signal=KILL 5s openssl x509 -req -in "$task_tmp/server.csr" -CA "$task_tmp/ca.crt" -CAkey "$task_tmp/ca.key" \
  -set_serial 1 -out "$task_tmp/server.crt" -days 1 -extfile "$task_tmp/server.ext" >>"$task_tmp/openssl.log" 2>&1
chmod 600 "$task_tmp/ca.key" "$task_tmp/server.key"

# No host ip command exists above this line. unshare failure is fatal; there is
# no host-network fallback. env -i also removes inherited NODE_OPTIONS/proxies.
timeout --signal=KILL 60s sudo -n "$task_unshare" --net -- env -i PATH="$PATH" LANG=C \
  "$task_bash" -s -- "$task_tmp" "$task_root" "$task_namespace" "$task_node" <<'NAMESPACE'
set -euo pipefail
umask 077
ulimit -c 0
ulimit -f 4096
task_tmp="$1"; task_root="$2"; task_previous_namespace="$3"; task_node="$4"
if [[ "$(readlink /proc/self/ns/net)" == "$task_previous_namespace" ]]; then
  printf '%s\n' 'Synthetic RTSP namespace isolation failed' >&2
  exit 1
fi
if [[ "$(ip -o link show | wc -l)" -ne 1 ]] || ! ip -o link show dev lo >/dev/null; then
  printf '%s\n' 'Synthetic RTSP namespace is not loopback-only' >&2
  exit 1
fi
ip link set dev lo up
ip address add 8.8.8.8/32 dev lo
ip address add 1.1.1.1/32 dev lo
ip -6 address add 2001:4860:4860::8888/128 dev lo nodad
if [[ -n "$(ip route show default)" ]] || [[ -n "$(ip -6 route show default)" ]]; then
  printf '%s\n' 'Synthetic RTSP namespace has an external route' >&2
  exit 1
fi
for task_case in mixed mixed-v6 valid valid-v6 alternate reconnect redirect control sdp udp; do
  # Decode connect addresses, and close return values for alternate ordering.
  # Datagram buffers/iovecs MUST stay raw pointers; do not add read/write tracing,
  # -e read/write dumps, decoded sendto/sendmsg, or plaintext TLS request logging.
  if ! timeout --signal=KILL 6s strace -f -qq -ttt -s 32 \
      -e trace=connect,close,sendto,sendmsg -e raw=sendto,sendmsg \
      -o "$task_tmp/$task_case.trace" \
      "$task_node" "$task_root/scripts/check-rtsp-network.cjs" run "$task_case" "$task_tmp" \
      >"$task_tmp/$task_case.result" 2>"$task_tmp/$task_case.error"; then
    printf 'Synthetic RTSP namespace session failed: %s\n' "$task_case" >&2
    exit 1
  fi
  "$task_node" "$task_root/scripts/check-rtsp-network.cjs" verify "$task_case" "$task_tmp/$task_case.trace"
  cat "$task_tmp/$task_case.result"
done
NAMESPACE
