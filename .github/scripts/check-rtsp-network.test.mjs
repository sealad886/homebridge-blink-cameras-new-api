import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { verifyTrace } = require('../../scripts/check-rtsp-network.cjs');
const connect = (fd, ip, port = 332) => `10 1770000000.123456 connect(${fd}, {sa_family=AF_INET, sin_port=htons(${port}), sin_addr=inet_addr("${ip}")}, 16) = -1 EINPROGRESS (Operation now in progress)\n`;
const close = fd => `10 1770000000.123457 close(${fd}) = 0\n`;

test('observes exact admitted numerical connect and rejects any forbidden/extra attempt', () => {
  assert.equal(verifyTrace(connect(18, '8.8.8.8') + close(18), 'valid').connectAttempts, 1);
  assert.throws(() => verifyTrace(connect(18, '127.0.0.1'), 'valid'));
  assert.throws(() => verifyTrace(connect(18, '8.8.8.8', 443), 'valid'));
  assert.throws(() => verifyTrace(connect(18, '8.8.8.8') + connect(19, '1.1.1.1'), 'valid'));
});
test('mixed DNS verdict requires zero connect attempts and a nonempty actual trace', () => {
  assert.equal(verifyTrace(close(4), 'mixed').connectAttempts, 0);
  assert.throws(() => verifyTrace(connect(18, '8.8.8.8'), 'mixed'));
  assert.throws(() => verifyTrace('', 'mixed'));
});
test('decodes an actual global IPv6 destination and optional strace PID padding', () => {
  const trace = '  [pid 10] 1770000000.123456 connect(18, {sa_family=AF_INET6, sin6_port=htons(332), sin6_flowinfo=htonl(0), inet_pton(AF_INET6, "2001:4860:4860::8888", &sin6_addr), sin6_scope_id=0}, 28) = -1 EINPROGRESS\n';
  assert.equal(verifyTrace(trace + close(18), 'valid-v6').connectAttempts, 1);
});
test('alternate requires successful actual close before the second numeric attempt', () => {
  assert.equal(verifyTrace(connect(18, '1.1.1.1') + close(18) + connect(19, '8.8.8.8'), 'alternate').closeBeforeAlternate, true);
  assert.throws(() => verifyTrace(connect(18, '1.1.1.1') + connect(19, '8.8.8.8') + close(18), 'alternate'));
  assert.throws(() => verifyTrace(connect(18, '1.1.1.1') + close(19) + connect(20, '8.8.8.8'), 'alternate'));
});
test('strace unfinished/resumed close is confirmed only when it actually returns', () => {
  const begin = '10 1770000000.123456 close(18 <unfinished ...>\n';
  const end = '10 1770000000.123457 <... close resumed>) = 0\n';
  assert.equal(verifyTrace(connect(18, '1.1.1.1') + begin + end + connect(19, '8.8.8.8'), 'alternate').closeBeforeAlternate, true);
  assert.throws(() => verifyTrace(connect(18, '1.1.1.1') + begin + connect(19, '8.8.8.8') + end, 'alternate'));
});
test('any raw datagram syscall, undecoded connect, incomplete trace or failed child refuses proof', () => {
  for (const trace of ['10 sendto(0x12, 0x1234, 0xbc, 0, 0x5678, 0x10) = 0xbc\n',
    '10 sendmsg(0x12, 0x1234, 0) = 0xbc\n', '10 connect(18, 0x1234, 16) = -1 EINPROGRESS\n',
    '10 connect(18, {sa_family=AF_INET6, sin6_port=htons(332), inet_pton(AF_INET6, "::1", &sin6_addr)}, 28) = 0\n',
    '10 close(18 <unfinished ...>\n', '10 close(not-a-descriptor) = 0\n', '10 +++ killed by SIGKILL +++\n']) {
    assert.throws(() => verifyTrace(trace, 'mixed'));
  }
});
