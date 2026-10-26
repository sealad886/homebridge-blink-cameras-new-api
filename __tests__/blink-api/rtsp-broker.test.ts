import { Buffer } from 'node:buffer';
import { test } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type { ConnectionOptions } from 'node:tls';
import { OwnedRtspBroker, RTSP_BROKER_LIMITS, type RtspSocket, type RtspConsumer } from '../../src/blink-api/rtsp-broker';
import { IMMIS_VENDOR_CA } from '../../src/blink-api/immis-trust';

class Socket extends EventEmitter implements RtspSocket {
  authorized = true; remoteAddress = '8.8.8.8';
  requests: Buffer[] = [];
  write = jest.fn((bytes: Buffer, callback: (error?: Error | null) => void) => {
    this.requests.push(Buffer.from(bytes)); callback(); return true;
  });
  destroy = jest.fn(); pause = jest.fn(); resume = jest.fn();
}
const target = 'rtsps://stream.immedia-semi.com:332/private-capability?blinkRTSP=true&token=secret';
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const reply = Buffer.from('RTSP/1.0 200 OK\r\nCSeq: 1\r\nContent-Length: 0\r\n\r\n');
function harness(url = target, consume: RtspConsumer = { write: async () => {}, close: async () => {} },
  lookup = jest.fn(async () => [{ address: '8.8.8.8', family: 4 }] as Array<{ address: string; family: number }>)) {
  const sockets: Socket[] = []; const attempts: ConnectionOptions[] = []; const errors: Error[] = [];
  const broker = new OwnedRtspBroker(url, consume, { lookup, error: error => errors.push(error), connect: options => {
    attempts.push(options); const socket = new Socket(); socket.remoteAddress = options.host!; sockets.push(socket); return socket;
  } });
  return { broker, sockets, attempts, errors, lookup };
}
async function playing(h: ReturnType<typeof harness>): Promise<void> {
  const ready = h.broker.start(); await flush(); h.sockets.at(-1)!.emit('secureConnect'); h.sockets.at(-1)!.emit('data', reply); await ready;
}
async function retire(h: ReturnType<typeof harness>): Promise<void> {
  void h.broker.stop(); h.sockets.forEach(socket => socket.emit('close')); await h.broker.whenClosed;
}
function packet(tsPackets = 1): Buffer {
  const payload = Buffer.alloc(188 * tsPackets); for (let i = 0; i < payload.length; i += 188) payload[i] = 0x47;
  const frame = Buffer.alloc(16); frame[0] = 36; frame.writeUInt16BE(payload.length + 12, 2);
  frame[4] = 0x80; frame[5] = 33; frame.writeUInt32BE(1, 12); return Buffer.concat([frame, payload]);
}
test('pins admitted numeric TLS transport and sends shortened PLAY only after verified TLS', async () => {
  const sockets: Socket[] = []; const attempts: ConnectionOptions[] = [];
  const consume = { write: jest.fn(async () => {}), close: jest.fn(async () => {}) };
  const broker = new OwnedRtspBroker(target, consume, { lookup: async () => [{ address: '8.8.8.8', family: 4 }],
    connect: options => { attempts.push(options); const socket = new Socket(); sockets.push(socket); return socket; } });
  const started = broker.start(); await flush();
  expect(attempts).toHaveLength(1); expect(attempts[0]).toMatchObject({ host: '8.8.8.8', port: 332,
    servername: 'stream.immedia-semi.com', rejectUnauthorized: true, minVersion: 'TLSv1.2' });
  expect(sockets[0].write).not.toHaveBeenCalled();
  sockets[0].emit('secureConnect');
  const request = sockets[0].requests[0];
  expect(request.toString()).toContain('PLAY rtsp://stream.immedia-semi.com:332/private-capability RTSP/1.0');
  expect(request.toString()).not.toContain('token='); expect(request.toString()).not.toContain('blinkRTSP');
  sockets[0].emit('data', reply); await started;
  void broker.stop(); sockets[0].emit('close'); await broker.whenClosed;
  expect(consume.close).toHaveBeenCalledTimes(1);
});

test('rejects mixed DNS before any numeric socket attempt', async () => {
  const h = harness(target, undefined, jest.fn(async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]));
  await expect(h.broker.start()).rejects.toThrow('RTSP transport refused'); await h.broker.whenClosed;
  expect(h.attempts).toEqual([]);
});

test('alternate numeric candidate waits for confirmed close and uses same TLS identity', async () => {
  const h = harness(target, undefined, jest.fn(async () => [{ address: '2606:4700:4700::1111', family: 6 }, { address: '8.8.8.8', family: 4 }]));
  const ready = h.broker.start(); await flush(); h.sockets[0].emit('error', new Error('secret raw target'));
  await flush(); expect(h.attempts).toHaveLength(1); expect(h.sockets[0].destroy).toHaveBeenCalled();
  h.sockets[0].emit('close'); await flush(); expect(h.attempts).toHaveLength(2);
  expect(h.attempts[1]).toMatchObject({ host: '8.8.8.8', servername: 'stream.immedia-semi.com', rejectUnauthorized: true });
  h.sockets[1].emit('secureConnect'); h.sockets[1].emit('data', reply); await ready; await retire(h);
});

test('IPv4 literal uses checked shared vendor identity and trust roots', async () => {
  const h = harness('rtsps://8.8.8.8:332/session?blinkRTSP=1'); await playing(h);
  expect(h.lookup).not.toHaveBeenCalled(); expect(h.attempts[0].servername).toBe('*.immedia-semi.com');
  expect(h.attempts[0].ca).toEqual(expect.arrayContaining(IMMIS_VENDOR_CA)); await retire(h);
});

test.each(['unauthorized', 'wrong-peer'])('no request written to %s TLS socket', async reason => {
  const h = harness(); const ready = h.broker.start(); await flush();
  if (reason === 'unauthorized') h.sockets[0].authorized = false; else h.sockets[0].remoteAddress = '127.0.0.1';
  h.sockets[0].emit('secureConnect'); expect(h.sockets[0].write).not.toHaveBeenCalled();
  h.sockets[0].emit('close'); await expect(ready).rejects.toThrow('RTSP transport refused'); await h.broker.whenClosed;
});

test('reconnect resolves fresh DNS and refuses changed private answer before dial', async () => {
  const lookup = jest.fn().mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]).mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }]);
  const h = harness(target, undefined, lookup); await playing(h); h.sockets[0].emit('close'); await flush();
  await h.broker.whenClosed; expect(lookup).toHaveBeenCalledTimes(2); expect(h.attempts).toHaveLength(1);
});

test('STOP during DNS prevents late connection and late secure callbacks cannot write', async () => {
  let complete!: (value: Array<{ address: string; family: number }>) => void;
  const h = harness(target, undefined, jest.fn(() => new Promise(resolve => { complete = resolve; })));
  const ready = h.broker.start(); await flush(); void h.broker.stop(); complete([{ address: '8.8.8.8', family: 4 }]);
  await expect(ready).rejects.toThrow(); await h.broker.whenClosed; expect(h.attempts).toHaveLength(0);
  const second = harness(); const started = second.broker.start(); await flush(); void second.broker.stop();
  second.sockets[0].emit('secureConnect'); expect(second.sockets[0].write).not.toHaveBeenCalled();
  second.sockets[0].emit('close'); await expect(started).rejects.toThrow(); await second.broker.whenClosed;
});

test.each([
  'RTSP/1.0 302 Found\r\nCSeq: 1\r\nLocation: rtsps://evil.invalid/private-token\r\n\r\n',
  'RTSP/1.0 200 OK\r\nCSeq: 1\r\nTransport: RTP/AVP;client_port=1-2\r\n\r\n',
  'RTSP/1.0 401 Private-token\r\nCSeq: 1\r\nWWW-Authenticate: Basic secret\r\n\r\n',
])('unsupported server response retires without secondary connection or secret diagnostics', async response => {
  const h = harness(); const ready = h.broker.start(); await flush(); h.sockets[0].emit('secureConnect');
  h.sockets[0].emit('data', Buffer.from(response)); h.sockets[0].emit('close');
  await expect(ready).rejects.toThrow('RTSP transport refused'); await h.broker.whenClosed;
  expect(h.errors.map(error => error.message)).toEqual(['RTSP transport refused']); expect(h.attempts).toHaveLength(1);
});

test('async consumer pressure pauses input, drains in order, and STOP waits for actual consumer retirement', async () => {
  const pending: Array<() => void> = []; let close!: () => void; const received: number[] = [];
  const consume = { write: jest.fn(async (bytes: Buffer) => { received.push(bytes.length); await new Promise<void>(resolve => pending.push(resolve)); }),
    close: jest.fn(() => new Promise<void>(resolve => { close = resolve; })) };
  const h = harness(target, consume); await playing(h);
  h.sockets[0].emit('data', packet(300)); h.sockets[0].emit('data', packet(100));
  expect(h.sockets[0].pause).toHaveBeenCalled(); expect(received).toEqual([56400]);
  pending.shift()!(); await flush(); expect(received).toEqual([56400, 18800]);
  let ended = false; void h.broker.stop().then(() => { ended = true; }); h.sockets[0].emit('close'); await flush();
  expect(ended).toBe(false); pending.shift()!(); await flush(); expect(ended).toBe(false);
  close(); await h.broker.whenClosed; expect(ended).toBe(true);
});

test('missing close confirmation never authorizes alternate even after grace deadline', async () => {
  jest.useFakeTimers();
  try {
    const h = harness(target, undefined, jest.fn(async () => [{ address: '8.8.8.8', family: 4 }, { address: '1.1.1.1', family: 4 }]));
    const ready = h.broker.start(); await flush(); h.sockets[0].emit('error', new Error('not logged'));
    jest.advanceTimersByTime(RTSP_BROKER_LIMITS.closeMs); await expect(ready).rejects.toThrow();
    let ended = false; void h.broker.whenClosed.then(() => { ended = true; }); await flush();
    expect(ended).toBe(false); expect(h.attempts).toHaveLength(1);
    h.sockets[0].emit('close'); await h.broker.whenClosed;
  } finally { jest.useRealTimers(); }
});

test.each(['rtsps://stream.immedia-semi.com/session', 'rtsp://stream.immedia-semi.com/session?blinkRTSP=1',
  'rtsps://stream.immedia-semi.com:443/session?blinkRTSP=1', 'rtsps://evil.invalid:332/session?blinkRTSP=1',
  'rtsps://stream.immedia-semi.com:332/session?blinkRTSP=1&blinkRTSP=true'])('unsupported capability fails before dial: %s', raw => {
  expect(() => harness(raw)).toThrow('RTSP transport refused');
});

test('candidate chain exhausts at three attempts without retrying DNS indefinitely', async () => {
  const h = harness(target, undefined, jest.fn(async () => ['8.8.8.8', '1.1.1.1', '9.9.9.9', '4.4.4.4'].map(address => ({ address, family: 4 }))));
  const ready = h.broker.start(); await flush();
  for (let i = 0; i < 3; i++) { h.sockets[i].emit('error', new Error('private reason')); h.sockets[i].emit('close'); await flush(); }
  await expect(ready).rejects.toThrow('RTSP transport refused'); await h.broker.whenClosed;
  expect(h.attempts).toHaveLength(3); expect(h.lookup).toHaveBeenCalledTimes(1);
});

test('reconnect budget persists across successful handshakes; stale callbacks cannot write', async () => {
  const h = harness(); await playing(h);
  for (let i = 0; i < RTSP_BROKER_LIMITS.reconnects; i++) {
    h.sockets[i].emit('close'); await flush(); const next = h.sockets[i + 1];
    h.sockets[i].emit('data', packet()); h.sockets[i].emit('secureConnect');
    next.emit('secureConnect'); next.emit('data', reply); await flush();
    expect(h.sockets[i].write).toHaveBeenCalledTimes(1);
  }
  h.sockets.at(-1)!.emit('close'); await h.broker.whenClosed;
  expect(h.attempts).toHaveLength(RTSP_BROKER_LIMITS.reconnects + 1);
});

test.each(['handshake', 'control', 'consumer', 'idle'])('%s timeout retires with fixed errors and actual close ownership', async phase => {
  jest.useFakeTimers();
  try {
    let release!: () => void;
    const h = harness(target, { write: async () => { await new Promise<void>(resolve => { release = resolve; }); }, close: async () => {} });
    const ready = h.broker.start(); await flush();
    if (phase !== 'handshake') h.sockets[0].emit('secureConnect');
    if (phase === 'consumer' || phase === 'idle') { h.sockets[0].emit('data', reply); await ready; }
    if (phase === 'consumer') h.sockets[0].emit('data', packet());
    const duration = phase === 'handshake' ? RTSP_BROKER_LIMITS.handshakeMs + RTSP_BROKER_LIMITS.closeMs
      : phase === 'control' ? RTSP_BROKER_LIMITS.controlMs : phase === 'consumer' ? RTSP_BROKER_LIMITS.consumeMs : RTSP_BROKER_LIMITS.idleMs;
    jest.advanceTimersByTime(duration); await flush();
    if (phase === 'handshake' || phase === 'control') await expect(ready).rejects.toThrow();
    expect(h.sockets[0].destroy).toHaveBeenCalled(); expect(h.errors.map(error => error.message)).toEqual(['RTSP transport refused']);
    let ended = false; void h.broker.whenClosed.then(() => { ended = true; }); await flush(); expect(ended).toBe(false);
    h.sockets[0].emit('close'); if (release) release(); await h.broker.whenClosed;
  } finally { jest.useRealTimers(); }
});

test('uncooperative paused producer cannot overflow bounded consumer queue', async () => {
  let release!: () => void;
  const h = harness(target, { write: async () => { await new Promise<void>(resolve => { release = resolve; }); }, close: async () => {} });
  await playing(h);
  for (let i = 0; i < 10; i++) h.sockets[0].emit('data', packet(300));
  expect(h.sockets[0].pause).toHaveBeenCalled(); expect(h.errors.map(error => error.message)).toEqual(['RTSP transport refused']);
  h.sockets[0].emit('close'); release(); await h.broker.whenClosed;
});

test('consumer rejection and failed retirement cannot claim closed', async () => {
  const h = harness(target, { write: async () => { throw new Error('private consumer detail'); },
    close: async () => { throw new Error('not retired'); } });
  await playing(h); h.sockets[0].emit('data', packet()); await flush(); h.sockets[0].emit('close');
  let ended = false; void h.broker.whenClosed.then(() => { ended = true; }); await flush();
  expect(ended).toBe(false); expect(h.errors.map(error => error.message)).toEqual(['RTSP transport refused']);
});

test('failed established socket cannot deliver queued data while awaiting actual close', async () => {
  const consume = { write: jest.fn(async () => {}), close: async () => {} };
  const h = harness(target, consume); await playing(h); h.sockets[0].emit('error', new Error('private network detail'));
  h.sockets[0].emit('data', packet()); await flush(); expect(consume.write).not.toHaveBeenCalled();
  await retire(h);
});
