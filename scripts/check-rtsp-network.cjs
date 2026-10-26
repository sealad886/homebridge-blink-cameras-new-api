#!/usr/bin/env node
'use strict';
/** Synthetic Linux namespace proof. Never run against a provider or host network.
 * The wrapper creates a new lo-only network namespace and supplies only test TLS
 * keys. The broker adapter changes CA trust only: addresses, ports and peer
 * identities remain actual. strace records connect/close and raw-pointer
 * sendto/sendmsg arguments, never media, key or request buffers.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const tls = require('node:tls');

const CASES = Object.freeze({ mixed: [], 'mixed-v6': [], valid: ['8.8.8.8'], 'valid-v6': ['2001:4860:4860::8888'], alternate: ['1.1.1.1', '8.8.8.8'],
  reconnect: ['8.8.8.8'], redirect: ['8.8.8.8'], control: ['8.8.8.8'], sdp: ['8.8.8.8'], udp: ['8.8.8.8'] });
const TRACE_LIMIT = 2 * 1024 * 1024;
const refused = () => new Error('Synthetic RTSP syscall proof refused');

function verifyTrace(trace, name) {
  if (!Object.hasOwn(CASES, name) || typeof trace !== 'string' || Buffer.byteLength(trace) > TRACE_LIMIT) throw refused();
  const connects = []; const closes = []; const pending = new Map(); let events = 0;
  for (const [index, line] of trace.split('\n').entries()) {
    if (!line.trim()) continue;
    const prefix = /^\s*(?:\[pid\s+(\d+)\]\s+|(\d+)\s+)?(?:\d+\.\d+\s+)?(.*)$/.exec(line);
    if (!prefix) throw refused();
    const pid = prefix[1] ?? prefix[2] ?? 'main'; let body = prefix[3]; let entry = index;
    if (/killed by|exited with [1-9]/.test(body)) throw refused();
    if (/^\+\+\+ exited with 0 \+\+\+$/.test(body) || body.startsWith('--- ')) continue;
    const resumed = /^<\.\.\. (connect|close|sendto|sendmsg) resumed>(.*)$/.exec(body);
    if (resumed) {
      const before = pending.get(pid);
      if (!before || before.method !== resumed[1]) throw refused();
      pending.delete(pid); body = before.body + resumed[2]; entry = before.index;
    } else if (body.includes('<unfinished ...>')) {
      const method = /^(connect|close|sendto|sendmsg)\(/.exec(body)?.[1];
      if (!method || pending.has(pid)) throw refused();
      pending.set(pid, { method, body: body.slice(0, body.indexOf('<unfinished ...>')).trimEnd(), index });
      continue;
    }
    if (/^(sendto|sendmsg)\(/.test(body)) throw refused();
    if (body.startsWith('close(')) {
      if (!/^close\(\d+\)\s+=\s+(?:0|-1 [A-Z][A-Z0-9_]*(?: .*)?)$/.test(body)) throw refused();
      const closed = /^close\((\d+)\)\s+=\s+0(?:\s|$)/.exec(body);
      if (closed) closes.push({ pid, fd: closed[1], index });
      events++; continue;
    }
    const connect = /^connect\((\d+), \{sa_family=AF_INET,.*sin_port=htons\((\d+)\).*sin_addr=inet_addr\("([0-9.]+)"\).*\}, 16\)\s+=/.exec(body) ??
      /^connect\((\d+), \{sa_family=AF_INET6,.*sin6_port=htons\((\d+)\).*inet_pton\(AF_INET6, "([0-9a-f:]+)", &sin6_addr\), sin6_scope_id=0\}, 28\)\s+=/.exec(body);
    if (!connect || connect[2] !== '332') throw refused();
    connects.push({ pid, fd: connect[1], address: connect[3], index: entry }); events++;
  }
  if (!events || pending.size || connects.length !== CASES[name].length ||
      connects.some((item, index) => item.address !== CASES[name][index])) throw refused();
  const closeBeforeAlternate = name === 'alternate' ? closes.some(item => item.pid === connects[0].pid &&
    item.fd === connects[0].fd && item.index > connects[0].index && item.index < connects[1].index) : undefined;
  if (name === 'alternate' && !closeBeforeAlternate) throw refused();
  return { schemaVersion: 1, case: name, verdict: 'observed', connectAttempts: connects.length, datagramCalls: 0,
    ...(name === 'alternate' ? { closeBeforeAlternate } : {}) };
}

async function deadline(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(refused()), 2000);
  })]); } finally { clearTimeout(timer); }
}
function media() {
  const frame = Buffer.alloc(204); frame[0] = 36; frame.writeUInt16BE(200, 2);
  frame[4] = 0x80; frame[5] = 33; frame.writeUInt32BE(1, 12); frame[16] = 0x47; return frame;
}
function response(name) {
  if (name === 'redirect') return Buffer.from('RTSP/1.0 302 Found\r\nCSeq: 1\r\nLocation: rtsps://127.0.0.1:332/escape\r\n\r\n');
  let headers = ''; let body = '';
  if (name === 'control') headers = 'Content-Base: rtsps://10.0.0.1:332/escape\r\n';
  if (name === 'udp') headers = 'Transport: RTP/AVP;unicast;destination=10.0.0.1;server_port=5000-5001\r\n';
  if (name === 'sdp') { headers = 'Content-Type: application/sdp\r\n'; body = 'v=0\r\na=control:rtsps://127.0.0.1:332/escape\r\n'; }
  const bytes = Buffer.from(`RTSP/1.0 200 OK\r\nCSeq: 1\r\n${headers}Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  return ['valid', 'valid-v6', 'alternate', 'reconnect'].includes(name) ? Buffer.concat([bytes, media()]) : bytes;
}

async function runCase(name, directory) {
  if (process.platform !== 'linux' || !Object.hasOwn(CASES, name)) throw refused();
  // Refuse accidental direct execution in the host/init network namespace even
  // when this fixture is called without its namespace wrapper.
  if (fs.readlinkSync('/proc/self/ns/net') === fs.readlinkSync('/proc/1/ns/net')) throw refused();
  // Imported only for the explicit Linux exercise; offline trace tests need no
  // compiled runtime or network namespace and work on other development hosts.
  const { OwnedRtspBroker } = require('../dist/blink-api/rtsp-broker.js');
  const ca = fs.readFileSync(path.join(directory, 'ca.crt'));
  const key = fs.readFileSync(path.join(directory, 'server.key'));
  const cert = fs.readFileSync(path.join(directory, 'server.crt'));
  const peers = new Set(); const clients = new Set(); const errors = [];
  let lookupCalls = 0; let mediaBytes = 0; let retired = false; let server; let broker; let peer;
  let firstMedia; const received = new Promise(resolve => { firstMedia = resolve; });
  try {
    if (CASES[name].length) {
      server = tls.createServer({ key, cert, minVersion: 'TLSv1.2' }, socket => {
        peer = socket; let request = Buffer.alloc(0); let replied = false;
        socket.on('error', () => {});
        socket.on('data', bytes => {
          if (request.length + bytes.length > 16384) { socket.destroy(); return; }
          request = Buffer.concat([request, bytes]);
          if (!replied && request.includes('\r\n\r\n')) {
            replied = true;
            if (!request.toString('ascii').startsWith('PLAY ')) { socket.destroy(); return; }
            socket.write(response(name)); request.fill(0);
          }
        });
      });
      server.on('tlsClientError', () => {});
      server.on('connection', socket => { peers.add(socket); socket.once('close', () => peers.delete(socket)); });
      await deadline(new Promise((resolve, reject) => {
        server.once('error', reject); server.listen(332, name === 'valid-v6' ? '2001:4860:4860::8888' : '8.8.8.8', () => { server.removeListener('error', reject); resolve(); });
      }));
    }
    broker = new OwnedRtspBroker('rtsps://stream.immedia-semi.com:332/synthetic-session?blinkRTSP=1', {
      write: async bytes => {
        assert.equal(bytes.length, 188); assert.equal(bytes[0], 0x47); mediaBytes += bytes.length; firstMedia();
        if (name === 'reconnect') setImmediate(() => peer.destroy());
      }, close: async () => { retired = true; },
    }, {
      lookup: async () => {
        lookupCalls++;
        if (name === 'mixed') return [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }];
        if (name === 'mixed-v6') return [{ address: '8.8.8.8', family: 4 }, { address: '::1', family: 6 }];
        if (name === 'reconnect' && lookupCalls > 1) return [{ address: '10.0.0.1', family: 4 }];
        if (name === 'valid-v6') return [{ address: '2001:4860:4860::8888', family: 6 }];
        return (name === 'alternate' ? ['1.1.1.1', '8.8.8.8'] : ['8.8.8.8']).map(address => ({ address, family: 4 }));
      },
      // Test CA is the sole override. The actual socket target and numerical peer
      // remain the exact production options; strace observes any policy escape.
      connect: options => {
        const socket = tls.connect({ ...options, ca }); clients.add(socket);
        socket.once('close', () => clients.delete(socket)); return socket;
      }, error: error => errors.push(error.message),
    });
    if (['valid', 'valid-v6', 'alternate', 'reconnect'].includes(name)) {
      await deadline(broker.start()); await deadline(received);
      if (name === 'reconnect') { await deadline(broker.whenClosed); assert.equal(lookupCalls, 2); }
      else await deadline(broker.stop());
      assert.equal(mediaBytes, 188);
    } else {
      await assert.rejects(deadline(broker.start()), /RTSP transport refused/);
      await deadline(broker.whenClosed); assert.equal(mediaBytes, 0); assert.equal(lookupCalls, 1);
    }
    assert.equal(retired, true); assert.equal(clients.size, 0);
    assert.deepEqual(errors, ['valid', 'valid-v6', 'alternate'].includes(name) ? [] : ['RTSP transport refused']);
    return { case: name, verdict: 'synthetic-session-passed', lookupCalls, mediaBytes };
  } finally {
    if (broker) void broker.stop();
    for (const socket of clients) socket.destroy(); for (const socket of peers) socket.destroy();
    if (broker) await deadline(broker.whenClosed);
    if (server?.listening) await deadline(new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
    key.fill(0);
  }
}

module.exports = { verifyTrace };
if (require.main === module) {
  (async () => {
    if (process.argv.length !== 5) throw refused();
    const [mode, name, input] = process.argv.slice(2);
    if (mode === 'run') console.log(JSON.stringify(await runCase(name, input)));
    else if (mode === 'verify') {
      const stat = fs.lstatSync(input);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > TRACE_LIMIT) throw refused();
      console.log(JSON.stringify(verifyTrace(fs.readFileSync(input, 'utf8'), name)));
    } else throw refused();
  })().catch(() => { console.error('Synthetic RTSP network gate failed'); process.exitCode = 1; });
}
