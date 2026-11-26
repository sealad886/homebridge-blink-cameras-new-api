import { getSecurityBoundaryCounters } from '../../src/blink-api/network-diagnostics';
import { parseLatmFrames, ImmisProxyServer } from '../../src/blink-api/immis-proxy';
import { Writable, PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import * as files from 'node:fs';
import * as tls from 'node:tls';
import { IMMIS_VENDOR_CA } from '../../src/blink-api/immis-trust';
import { lookup } from 'node:dns/promises';
jest.mock('node:dns/promises', () => ({ lookup: jest.fn(async () => [{ address: '8.8.8.8', family: 4 }]) }));
const flushResolution = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };

jest.mock('node:tls', () => {
  const actual = jest.requireActual('node:tls') as typeof import('node:tls');
  const { EventEmitter: MockEventEmitter } = jest.requireActual('node:events') as typeof import('node:events');
  return {
    ...actual,
    connect: jest.fn((_options: tls.ConnectionOptions, callback?: () => void) => {
      const socket = new MockEventEmitter() as tls.TLSSocket & {
        write: jest.Mock;
        destroyed: boolean;
        destroy: jest.Mock;
      };
      socket.write = jest.fn();
      socket.destroyed = false;
      Object.defineProperty(socket, "authorized", { value: true, configurable: true });
      socket.destroy = jest.fn();
      socket.pause = jest.fn();
      socket.resume = jest.fn();
      if (callback) {
        void Promise.resolve().then(callback);
      }
      return socket;
    }),
  };
});

const buildLoasFrame = (payload: Buffer): Buffer => {
  const length = payload.length;
  const header = Buffer.alloc(3);
  header[0] = 0x56;
  header[1] = 0xe0 | ((length >> 8) & 0x1f);
  header[2] = length & 0xff;
  return Buffer.concat([header, payload]);
};

describe('parseLatmFrames', () => {
  it('extracts complete LOAS frames and preserves remainder', () => {
    const frameA = buildLoasFrame(Buffer.from([0x01, 0x02, 0x03]));
    const frameB = buildLoasFrame(Buffer.from([0x04, 0x05]));
    const partial = buildLoasFrame(Buffer.from([0x06, 0x07, 0x08]));
    const partialCut = partial.subarray(0, 4);

    const buffer = Buffer.concat([frameA, frameB, partialCut]);
    const result = parseLatmFrames(buffer);

    expect(result.frames).toHaveLength(2);
    expect(result.frames[0]).toEqual(frameA);
    expect(result.frames[1]).toEqual(frameB);
    expect(result.remainder).toEqual(partialCut);
  });

  it('discards bytes before syncword', () => {
    const frame = buildLoasFrame(Buffer.from([0x09, 0x0a]));
    const buffer = Buffer.concat([Buffer.from([0x00, 0x11, 0x22]), frame]);
    const result = parseLatmFrames(buffer);

    expect(result.discardedBytes).toBe(3);
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]).toEqual(frame);
    expect(result.remainder.length).toBe(0);
  });
});

const packet = (payload: Buffer, declaredLength = payload.length): Buffer => {
  const header = Buffer.alloc(9);
  header.writeUInt32BE(declaredLength, 5);
  return Buffer.concat([header, payload]);
};
const consumer = () => new Writable({ write(_chunk, _encoding, callback) { callback(); } });
const latestSocket = (): tls.TLSSocket => (tls.connect as unknown as jest.Mock).mock.results.at(-1)?.value;

describe('ImmisProxyServer private consumer', () => {
  it('refuses another admitted media protocol before IMMIS authentication or dialing', () => {
    expect(() => new ImmisProxyServer({ immisUrl: 'rtsps://8.8.8.8:332/session?client_id=1', serial: 'TEST' })).toThrow();
    expect(tls.connect).not.toHaveBeenCalled();
  });
  let proxy: ImmisProxyServer;
  beforeEach(() => {
    jest.useFakeTimers();
    (lookup as jest.Mock).mockReset().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    (tls.connect as unknown as jest.Mock).mockClear();
    proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/session?client_id=1', serial: 'TEST' });
  });
  afterEach(() => { proxy.stop(); jest.useRealTimers(); });

  it.each(['response', 'timeout', 'closed'] as const)('bounds cooperative retirement until %s and actual transport close', async outcome => {
    const log = jest.fn();
    proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/session?client_id=1', serial: 'TEST', log });
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    const socket = latestSocket();
    socket.emit('data', Buffer.from([6, 0, 0, 0, 0, 0, 0, 0, 0]));
    socket.emit('data', Buffer.from([8, 0, 0, 0, 0, 0, 0, 0, 0]));
    expect(proxy).toHaveProperty('retirementResponseReceived', false);
    proxy.retire(); proxy.retire();
    const termination = (socket.write as jest.Mock).mock.calls.filter(([value]) => value[0] === 7);
    expect(termination).toEqual([[Buffer.from([7, 0, 0, 0, 1, 0, 0, 0, 0])]]);
    expect(socket.destroy).not.toHaveBeenCalled();
    let closed = false; const closure = proxy.whenClosed.then(() => { closed = true; });
    await flushResolution(); expect(closed).toBe(false);
    if (outcome === 'response') {
      const acknowledgement = Buffer.from([8, 0, 0, 0, 0, 0, 0, 0, 0]);
      socket.emit('data', Buffer.from([8, 0, 0, 0, 0, 0, 0, 0, 1, 1]));
      socket.emit('data', acknowledgement.subarray(0, 4));
      expect(socket.destroy).not.toHaveBeenCalled();
      expect(proxy).toHaveProperty('retirementResponseReceived', false);
      socket.emit('data', acknowledgement.subarray(4));
    } else if (outcome === 'timeout') {
      jest.advanceTimersByTime(999); expect(socket.destroy).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
    } else socket.emit('close');
    expect(socket.destroy).toHaveBeenCalledTimes(outcome === 'closed' ? 0 : 1);
    if (outcome !== 'closed') { await flushResolution(); expect(closed).toBe(false); socket.emit('close'); }
    await closure;
    expect(proxy).toHaveProperty('retirementResponseReceived', outcome === 'response');
    expect(log).toHaveBeenCalledWith(`[ImmisProxy] IMMIS retirement: ${outcome}`);
    jest.advanceTimersByTime(10_000); await flushResolution();
    expect(tls.connect).toHaveBeenCalledTimes(1);
    if (outcome === 'response') {
      await proxy.start();
      expect(proxy).toHaveProperty('retirementResponseReceived', false);
    }
  });

  it('retirement resumes a blocked consumer socket for control without forwarding more media', async () => {
    await proxy.start(); const output = new Writable({ highWaterMark: 1, write() { /* Deliberately blocked. */ } });
    proxy.attachConsumer(output); await flushResolution(); const socket = latestSocket();
    socket.emit('data', Buffer.from([6, 0, 0, 0, 0, 0, 0, 0, 0]));
    socket.emit('data', packet(Buffer.from([0x47, 1])));
    const written = output.writableLength;
    proxy.retire();
    expect(socket.resume).toHaveBeenCalled();
    socket.emit('data', Buffer.concat([packet(Buffer.from([0x47, 2])), Buffer.from([8, 0, 0, 0, 0, 0, 0, 0, 0])]));
    expect(output.writableLength).toBe(written); expect(socket.destroy).toHaveBeenCalledTimes(1);
    socket.emit('close'); await proxy.whenClosed;
  });

  it('allows only termination upstream while retiring despite late talkback callbacks', async () => {
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution(); const socket = latestSocket();
    socket.emit('data', Buffer.from([6, 0, 0, 0, 0, 0, 0, 0, 0]));
    const previous = new PassThrough(); proxy.attachAudioInput(previous);
    (socket.write as jest.Mock).mockClear(); proxy.retire();
    const late = new PassThrough(); proxy.attachAudioInput(late);
    proxy.startAudio(); proxy.stopAudio();
    previous.write(buildLoasFrame(Buffer.from([1, 2])));
    late.write(buildLoasFrame(Buffer.from([3, 4])));
    expect(socket.write).toHaveBeenCalledTimes(1);
    expect(late.listenerCount('data')).toBe(0);
    expect(previous.listenerCount('data')).toBe(0);
    expect(socket.write).toHaveBeenCalledWith(Buffer.from([7, 0, 0, 0, 1, 0, 0, 0, 0]));
    socket.emit('data', Buffer.from([8, 0, 0, 0, 0, 0, 0, 0, 0]));
    proxy.startAudio(); proxy.stopAudio(); late.write(buildLoasFrame(Buffer.from([5, 6])));
    expect(socket.write).toHaveBeenCalledTimes(1);
    socket.emit('close'); await proxy.whenClosed;
  });

  it('retirement closes unverified transport immediately without sending protocol commands', async () => {
    const socket = Object.assign(new EventEmitter(), { write: jest.fn(), destroy: jest.fn(), authorized: true });
    (tls.connect as jest.Mock).mockImplementationOnce(() => socket);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    proxy.retire();
    expect(socket.write).not.toHaveBeenCalled(); expect(socket.destroy).toHaveBeenCalledTimes(1);
    (tls.connect as jest.Mock).mock.calls[0][1]();
    expect(socket.write).not.toHaveBeenCalled(); socket.emit('close'); await proxy.whenClosed;
    expect(proxy).toHaveProperty('retirementResponseReceived', false);
  });

  it('retirement preserves frame ceilings and immediate fatal shutdown', async () => {
    const errors = jest.fn(); proxy.on('error', errors);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution(); const socket = latestSocket();
    socket.emit('data', Buffer.from([6, 0, 0, 0, 0, 0, 0, 0, 0])); proxy.retire();
    socket.emit('data', packet(Buffer.alloc(0), 1024 * 1024 + 1));
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ message: 'IMMIS frame exceeded its budget' }));
    expect(socket.destroy).toHaveBeenCalledTimes(1); socket.emit('close'); await proxy.whenClosed;
    jest.advanceTimersByTime(1000); expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it('delivers media during a debug flood with bounded diagnostics and visible failures', async () => {
    const log = jest.fn(); const errors = jest.fn(); let delivered = 0;
    proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/session?client_id=1', serial: 'TEST', debug: true, log, errorLog: errors });
    await proxy.start();
    proxy.attachConsumer(new Writable({ write(chunk, _encoding, callback) { delivered += chunk.length; callback(); } }));
    await flushResolution();
    const socket = latestSocket();
    const noisy = packet(Buffer.from([1])); noisy[0] = 0x18;
    for (let i = 0; i < 10_000; i++) {
      socket.emit('data', noisy);
      socket.emit('data', packet(Buffer.from([0x47, 1])));
    }
    expect(delivered).toBe(20_000);
    expect(log.mock.calls.length).toBeLessThan(80);
    socket.emit('data', packet(Buffer.alloc(0), 1024 * 1024 + 1));
    expect(errors).toHaveBeenCalled();
    expect(log.mock.calls.some(([message]) => String(message).includes('Suppressed'))).toBe(true);
  });

  it('bounds repeated LATM failures without hiding fatal transport events', async () => {
    const log = jest.fn(); const errors = jest.fn(); const fatal = jest.fn();
    proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/session?client_id=1', serial: 'TEST', log, errorLog: errors });
    proxy.on('error', fatal);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    const audio = new PassThrough(); proxy.attachAudioInput(audio);
    const sender = jest.spyOn(proxy as unknown as { sendLatmFrame(frame: Buffer): void }, 'sendLatmFrame')
      .mockImplementation(() => { throw new Error('token=private-audio-token ' + 'x'.repeat(2000)); });
    try {
      for (let i = 0; i < 1000; i++) audio.write(buildLoasFrame(Buffer.from([1])));
      expect(sender).toHaveBeenCalledTimes(1000);
      expect(errors).toHaveBeenCalledTimes(8);
      expect(JSON.stringify(errors.mock.calls)).not.toContain('private-audio-token');
      expect(errors.mock.calls.every(([message]) => String(message).length <= 1040)).toBe(true);
      latestSocket().emit('data', packet(Buffer.alloc(0), 1024 * 1024 + 1));
      expect(fatal).toHaveBeenCalledWith(expect.any(Error));
      expect(proxy.isServing).toBe(false);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Suppressed 992'));
    } finally { sender.mockRestore(); audio.destroy(); }
  });

  it('forwards and closes the normal stream without opening files or creating directories', async () => {
    const actualFiles = jest.requireActual<typeof import('node:fs')>('node:fs');
    const writeStream = jest.spyOn(actualFiles, 'createWriteStream');
    const openFile = jest.spyOn(actualFiles, 'open');
    const openAsync = jest.spyOn(files.promises, 'open');
    const mkdir = jest.spyOn(files.promises, 'mkdir');
    const chunks: Buffer[] = [];
    const child = new Writable({ write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
    try {
      await expect(proxy.start()).resolves.toBe('pipe:0');
      proxy.attachConsumer(child);
      await flushResolution();
      const socket = latestSocket();
      const payload = Buffer.from([0x47, 0x01, 0x02]);
      socket.emit('data', packet(payload));
      expect(Buffer.concat(chunks)).toEqual(payload);
      proxy.stop();
      expect(socket.destroy).toHaveBeenCalledTimes(1);
      socket.emit('close');
      await proxy.whenClosed;
      expect(proxy.isServing).toBe(false);
      expect(writeStream).not.toHaveBeenCalled();
      expect(openFile).not.toHaveBeenCalled();
      expect(openAsync).not.toHaveBeenCalled();
      expect(mkdir).not.toHaveBeenCalled();
    } finally {
      writeStream.mockRestore(); openFile.mockRestore(); openAsync.mockRestore(); mkdir.mockRestore();
    }
  });

  it('starts without a listener or upstream connection and connects only for an attached child', async () => {
    await expect(proxy.start()).resolves.toBe('pipe:0');
    expect(proxy.url).toBe('pipe:0');
    expect(tls.connect).not.toHaveBeenCalled();
    proxy.attachConsumer(consumer()); await flushResolution();
    expect(tls.connect).toHaveBeenCalledTimes(1);
  });

  it('sends immediate authenticated keep-alive without fabricated presentation statistics', async () => {
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    const socket = latestSocket();
    const writes = () => (socket.write as jest.Mock).mock.calls.map(([bytes]) => bytes as Buffer);
    expect(writes()[0]).toHaveLength(122);
    expect(writes().slice(1).map(bytes => bytes[0])).toEqual([0x0a]);
    jest.advanceTimersByTime(10_000);
    expect(writes().slice(1).map(bytes => bytes[0])).toEqual([0x0a, 0x0a]);
    proxy.stop();
    const count = writes().length;
    jest.advanceTimersByTime(20_000);
    expect(writes()).toHaveLength(count);
  });

  it('cancels pending DNS on STOP and prevents duplicate resolution', async () => {
    let answer!: (value: { address: string; family: number }[]) => void;
    (lookup as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
    await proxy.start();
    proxy.attachConsumer(consumer()); await flushResolution();
    proxy.attachConsumer(consumer()); await flushResolution();
    expect(lookup).toHaveBeenCalledTimes(1);
    proxy.stop();
    await proxy.whenClosed;
    answer([{ address: '8.8.8.8', family: 4 }]); await flushResolution();
    expect(tls.connect).not.toHaveBeenCalled();
  });

  it('resolves each reconnect and refuses a later private DNS answer before TLS', async () => {
    (lookup as jest.Mock).mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    expect(tls.connect).toHaveBeenCalledWith(expect.objectContaining({ host: '8.8.8.8',
      servername: 'media.immedia-semi.com', rejectUnauthorized: true }), expect.any(Function));
    latestSocket().emit('close');
    jest.advanceTimersByTime(2000); await flushResolution();
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(tls.connect).toHaveBeenCalledTimes(1);
    await proxy.whenClosed;
  });

  it.each([true, false])('uses vendor TLS identity for public literal and gates auth on authorization=%s', async authorized => {
    proxy.stop();
    proxy = new ImmisProxyServer({ immisUrl: 'immis://8.8.8.8:443/session?client_id=1', serial: 'TEST' });
    const socket = Object.assign(new EventEmitter(), {
      write: jest.fn(), destroy: jest.fn(), authorized,
    }) as unknown as tls.TLSSocket;
    (tls.connect as jest.Mock).mockImplementationOnce((_options, callback) => {
      void Promise.resolve().then(callback); return socket;
    });
    const errors = jest.fn(); proxy.on('error', errors);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    expect(lookup).not.toHaveBeenCalled();
    expect(tls.connect).toHaveBeenCalledWith(expect.objectContaining({ host: '8.8.8.8', port: 443,
      servername: '*.immedia-semi.com', rejectUnauthorized: true, minVersion: 'TLSv1.2',
      ca: expect.arrayContaining([...tls.rootCertificates, ...IMMIS_VENDOR_CA]) }), expect.any(Function));
    if (authorized) {
      expect((socket.write as jest.Mock).mock.calls[0][0]).toHaveLength(122);
      expect((socket.write as jest.Mock).mock.calls[1][0][0]).toBe(0x0a);
    } else {
      expect(socket.write).not.toHaveBeenCalled();
      expect(socket.destroy).toHaveBeenCalledTimes(1);
      socket.emit('close'); await flushResolution();
      expect(errors).toHaveBeenCalledTimes(1);
      await proxy.whenClosed;
    }
  });

  it.each([
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'certificate_trust'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'certificate_identity'],
    ['ECONNREFUSED', 'connection_refused'],
    ['ECONNRESET', 'connection_reset'],
    ['ENETUNREACH', 'network_unreachable'],
    ['ETIMEDOUT', 'handshake_timeout'],
    ['UNKNOWN_SECRET_CODE', 'handshake_error'],
  ])('reports bounded %s rejection without authenticating or leaking details', async (code, reason) => {
    const log = jest.fn();
    proxy = new ImmisProxyServer({ immisUrl: 'immis://8.8.8.8/?client_id=1', serial: 'TEST', log });
    const socket = Object.assign(new EventEmitter(), { write: jest.fn(), destroy: jest.fn() }) as unknown as tls.TLSSocket;
    (tls.connect as jest.Mock).mockImplementationOnce(() => socket);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    socket.emit('error', Object.assign(new Error('SECRET session https://private.example/token'), { code }));
    expect(socket.write).not.toHaveBeenCalled();
    expect(socket.destroy).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.flat().join(' ')).toContain(`reason=${reason}`);
    expect(log.mock.calls.flat().join(' ')).not.toMatch(/SECRET|private\.example|UNKNOWN_SECRET_CODE/);
    socket.emit('close'); await proxy.whenClosed;
  });

  it.each(['immis://evil.test/?client_id=1', 'immis://media.immedia-semi.com:444/?client_id=1',
    'https://media.immedia-semi.com/?client_id=1'])('rejects invalid upstream before DNS or TLS', raw => {
    expect(() => new ImmisProxyServer({ immisUrl: raw, serial: 'TEST' })).toThrow();
    expect(lookup).not.toHaveBeenCalled(); expect(tls.connect).not.toHaveBeenCalled();
  });

  it('falls back from unreachable admitted IPv6 only after close, preserving TLS identity', async () => {
    (lookup as jest.Mock).mockResolvedValueOnce([
      { address: '2606:4700:4700::1111', family: 6 },
      { address: '2606:4700:4700::1001', family: 6 },
      { address: '8.8.8.8', family: 4 },
    ]);
    const first = Object.assign(new EventEmitter(), { write: jest.fn(), destroy: jest.fn(), authorized: true }) as unknown as tls.TLSSocket;
    (tls.connect as jest.Mock).mockImplementationOnce(() => first);
    const errors = jest.fn(); proxy.on('error', errors);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    expect(tls.connect).toHaveBeenNthCalledWith(1, expect.objectContaining({ host: '2606:4700:4700::1111',
      servername: 'media.immedia-semi.com', rejectUnauthorized: true }), expect.any(Function));
    first.emit('error', new Error('ENETUNREACH'));
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(first.write).not.toHaveBeenCalled();
    expect(tls.connect).toHaveBeenCalledTimes(1); expect(errors).not.toHaveBeenCalled();
    first.emit('close'); await flushResolution();
    expect(tls.connect).toHaveBeenNthCalledWith(2, expect.objectContaining({ host: '8.8.8.8',
      servername: 'media.immedia-semi.com', rejectUnauthorized: true }), expect.any(Function));
    expect((latestSocket().write as jest.Mock).mock.calls[0][0]).toHaveLength(122); expect(errors).not.toHaveBeenCalled();
  });

  it('sends no authentication through unauthorized TLS and emits terminal error only after closure', async () => {
    const socket = Object.assign(new EventEmitter(), { write: jest.fn(), destroy: jest.fn(), authorized: false }) as unknown as tls.TLSSocket;
    (tls.connect as jest.Mock).mockImplementationOnce((_options, callback) => { void Promise.resolve().then(callback); return socket; });
    const errors = jest.fn(); proxy.on('error', errors);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    expect(socket.destroy).toHaveBeenCalledTimes(1); expect(socket.write).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    socket.emit('close'); await flushResolution();
    expect(errors).toHaveBeenCalledTimes(1); expect(socket.write).not.toHaveBeenCalled();
    await proxy.whenClosed;
  });

  it('bounds a pending handshake and STOP prevents alternate after delayed close', async () => {
    (lookup as jest.Mock).mockResolvedValueOnce([{ address: '2606:4700:4700::1111', family: 6 }, { address: '8.8.8.8', family: 4 }]);
    const socket = Object.assign(new EventEmitter(), { write: jest.fn(), destroy: jest.fn(), authorized: true }) as unknown as tls.TLSSocket;
    (tls.connect as jest.Mock).mockImplementationOnce(() => socket);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    jest.advanceTimersByTime(5000);
    expect(socket.destroy).toHaveBeenCalledTimes(1); expect(tls.connect).toHaveBeenCalledTimes(1);
    proxy.stop();
    (tls.connect as jest.Mock).mock.calls[0][1](); // A late secure callback must not authenticate after STOP.
    socket.emit('close'); await proxy.whenClosed;
    jest.advanceTimersByTime(10000); await flushResolution();
    expect(tls.connect).toHaveBeenCalledTimes(1); expect(socket.write).not.toHaveBeenCalled();
  });

  it('fails after closure grace without starting an alternate and retains unconfirmed closure', async () => {
    const socket = Object.assign(new EventEmitter(), { write: jest.fn(), destroy: jest.fn(), authorized: true }) as unknown as tls.TLSSocket;
    (tls.connect as jest.Mock).mockImplementationOnce(() => socket);
    const errors = jest.fn(); proxy.on('error', errors);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    jest.advanceTimersByTime(7000); expect(errors).toHaveBeenCalledTimes(1);
    let closed = false; const closure = proxy.whenClosed.then(() => { closed = true; });
    await flushResolution(); expect(closed).toBe(false); expect(tls.connect).toHaveBeenCalledTimes(1);
    socket.emit('close'); await closure;
  });

  it('caps failed numeric attempts and subsequent established reconnect chains', async () => {
    const errors = jest.fn(); proxy.on('error', errors);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    for (let chain = 0; chain < 4; chain++) {
      latestSocket().emit('close'); jest.advanceTimersByTime(2000); await flushResolution();
    }
    expect(lookup).toHaveBeenCalledTimes(4); expect(tls.connect).toHaveBeenCalledTimes(4);
    expect(errors).toHaveBeenCalledTimes(1); await proxy.whenClosed;
    jest.advanceTimersByTime(10000); await flushResolution(); expect(tls.connect).toHaveBeenCalledTimes(4);
  });

  it('attempts at most three distinct admitted candidates before terminal failure', async () => {
    (lookup as jest.Mock).mockResolvedValueOnce(['8.8.8.8', '1.1.1.1', '9.9.9.9', '8.8.4.4'].map(address => ({ address, family: 4 })));
    const originalConnect = (tls.connect as jest.Mock).getMockImplementation();
    (tls.connect as jest.Mock).mockImplementation(() => Object.assign(new EventEmitter(), {
      write: jest.fn(), destroy: jest.fn(), authorized: true,
    }));
    try {
      const errors = jest.fn(); proxy.on('error', errors);
      await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
      for (let candidate = 0; candidate < 3; candidate++) {
        const socket = latestSocket(); socket.emit('error', new Error('unreachable')); socket.emit('close');
      }
      expect(tls.connect).toHaveBeenCalledTimes(3); expect(errors).toHaveBeenCalledTimes(1);
      await proxy.whenClosed;
    } finally { (tls.connect as jest.Mock).mockImplementation(originalConnect); }
  });

  it('gates control and talkback writes at the shared verified TLS boundary', async () => {
    const socket = Object.assign(new EventEmitter(), { write: jest.fn(), destroy: jest.fn(), authorized: true }) as unknown as tls.TLSSocket;
    (tls.connect as jest.Mock).mockImplementationOnce(() => socket);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    proxy.startAudio(); proxy.stopAudio();
    const audio = new PassThrough(); proxy.attachAudioInput(audio);
    audio.write(buildLoasFrame(Buffer.from([1, 2])));
    expect(socket.write).not.toHaveBeenCalled();
    (tls.connect as jest.Mock).mock.calls[0][1]();
    expect(socket.write).toHaveBeenCalledTimes(2); // Auth and initial keep-alive only after verified TLS.
    proxy.startAudio(); expect(socket.write).toHaveBeenCalledTimes(3);
    proxy.stop(); audio.write(buildLoasFrame(Buffer.from([3, 4])));
    expect(socket.write).toHaveBeenCalledTimes(3); socket.emit('close'); await proxy.whenClosed;
  });

  it('waits for command readiness before opening TLS for the attached child', async () => {
    let ready!: () => void;
    proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/?client_id=1', serial: 'TEST',
      waitForReady: new Promise<void>(resolve => { ready = resolve; }) });
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    expect(tls.connect).not.toHaveBeenCalled();
    ready(); await flushResolution();
    expect(tls.connect).toHaveBeenCalledTimes(1);
  });

  it('does not connect when readiness resolves after stop', async () => {
    let ready!: () => void;
    proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/?client_id=1', serial: 'TEST',
      waitForReady: new Promise<void>(resolve => { ready = resolve; }) });
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    proxy.stop(); ready(); await flushResolution();
    await proxy.whenClosed;
    expect(tls.connect).not.toHaveBeenCalled();
    expect(proxy.isServing).toBe(false);
  });

  it('does not count or emit a worker failure when pending readiness rejects after STOP', async () => {
    let rejectReady!: (reason: Error) => void;
    proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/?client_id=1', serial: 'TEST',
      waitForReady: new Promise<void>((_resolve, reject) => { rejectReady = reject; }) });
    const errors = jest.fn(); proxy.on('error', errors);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    const before = getSecurityBoundaryCounters().worker_failure;
    proxy.stop(); await proxy.whenClosed;
    rejectReady(new Error('Streaming session retired')); await Promise.resolve(); await Promise.resolve();
    expect(errors).not.toHaveBeenCalled();
    expect(getSecurityBoundaryCounters().worker_failure).toBe(before);
    expect(tls.connect).not.toHaveBeenCalled();
    expect(proxy.isServing).toBe(false);
    await expect(proxy.start()).rejects.toThrow('readiness failed');
  });

  it('fails closed when command readiness rejects and contains callback errors', async () => {
    let rejectReady!: (reason: Error) => void;
    proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/?client_id=1', serial: 'TEST',
      waitForReady: new Promise<void>((_resolve, reject) => { rejectReady = reject; }) });
    proxy.on('error', () => { throw new Error('listener'); });
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    const before = getSecurityBoundaryCounters().worker_failure;
    rejectReady(new Error('provider secret')); await Promise.resolve(); await Promise.resolve();
    expect(tls.connect).not.toHaveBeenCalled();
    expect(proxy.isServing).toBe(false);
    expect(getSecurityBoundaryCounters().worker_failure).toBe(before + 1);
    await expect(proxy.start()).rejects.toThrow('readiness failed');
  });

  it('keeps transport closure pending after destroy until TLS confirms close', async () => {
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    const socket = latestSocket(); proxy.stop();
    let closed = false;
    const closure = proxy.whenClosed.then(() => { closed = true; });
    await Promise.resolve(); expect(closed).toBe(false);
    socket.emit('close'); await closure;
    expect(closed).toBe(true);
  });

  it('keeps upstream alive for encoder replacement, then stops after grace expires', async () => {
    await proxy.start();
    const first = consumer();
    proxy.attachConsumer(first); await flushResolution();
    first.emit('close');
    jest.advanceTimersByTime(1000);
    expect(proxy.isServing).toBe(true);
    proxy.attachConsumer(consumer()); await flushResolution();
    jest.advanceTimersByTime(2000);
    expect(proxy.isServing).toBe(true);
    expect(tls.connect).toHaveBeenCalledTimes(1);
    proxy.detachConsumer();
    jest.advanceTimersByTime(2000);
    expect(proxy.isServing).toBe(false);
  });

  it('delivers fragmented and coalesced video frames through child stdin', async () => {
    await proxy.start();
    const chunks: Buffer[] = [];
    proxy.attachConsumer(new Writable({ write(chunk, _encoding, cb) { chunks.push(Buffer.from(chunk)); cb(); } })); await flushResolution();
    const bytes = Buffer.concat([packet(Buffer.from([0x47, 1])), packet(Buffer.from([0x47, 2]))]);
    latestSocket().emit('data', bytes.subarray(0, 7));
    latestSocket().emit('data', bytes.subarray(7));
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([0x47, 1, 0x47, 2]));
  });

  it('rejects oversized declared frames before collecting their payload', async () => {
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    const error = jest.fn(); proxy.on('error', error);
    latestSocket().emit('data', packet(Buffer.alloc(0), 1024 * 1024 + 1));
    expect(error).toHaveBeenCalled(); expect(proxy.isServing).toBe(false);
  });

  it('rejects oversized buffered input and incomplete frames after five seconds', async () => {
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    latestSocket().emit('data', Buffer.alloc(2 * 1024 * 1024 + 1));
    expect(proxy.isServing).toBe(false);
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    latestSocket().emit('data', Buffer.from([0]));
    jest.advanceTimersByTime(5000);
    expect(proxy.isServing).toBe(false);
  });

  it('stops stalled child writers after two seconds without drain', async () => {
    await proxy.start();
    proxy.attachConsumer(new Writable({ highWaterMark: 1, write() { /* stalled */ } })); await flushResolution();
    latestSocket().emit('data', packet(Buffer.from([0x47, 1])));
    jest.advanceTimersByTime(2000);
    expect(proxy.isServing).toBe(false);
  });

  it('pauses upstream and bounds retained video while the child is blocked', async () => {
    await proxy.start();
    proxy.attachConsumer(new Writable({ write() { /* stalled */ } })); await flushResolution();
    const payload = Buffer.alloc(600 * 1024, 0x47);
    latestSocket().emit('data', packet(payload));
    latestSocket().emit('data', packet(payload));
    expect(latestSocket().pause).toHaveBeenCalled();
    expect(proxy.isServing).toBe(true);
    // Events already queued before pause still cannot exceed retained-input capacity.
    latestSocket().emit('data', Buffer.alloc(2 * 1024 * 1024));
    expect(proxy.isServing).toBe(false);
  });

  it('drains coalesced frames in order before resuming upstream', async () => {
    await proxy.start();
    const chunks: Buffer[] = [];
    const callbacks: Array<() => void> = [];
    const writer = new Writable({ highWaterMark: 1, write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk)); callbacks.push(callback);
    } });
    proxy.attachConsumer(writer); await flushResolution();
    const socket = latestSocket();
    socket.emit('data', Buffer.concat([packet(Buffer.from([0x47, 1])), packet(Buffer.from([0x47, 2]))]));
    expect(chunks).toEqual([Buffer.from([0x47, 1])]);
    expect(writer.writableLength).toBe(2);
    callbacks.shift()?.();
    expect(chunks).toEqual([Buffer.from([0x47, 1]), Buffer.from([0x47, 2])]);
    expect(socket.resume).not.toHaveBeenCalled();
    callbacks.shift()?.();
    expect(socket.resume).toHaveBeenCalled();
    jest.advanceTimersByTime(2000);
    expect(proxy.isServing).toBe(true);
  });

  it('gives retained frames to a replacement consumer without stale drain revival', async () => {
    await proxy.start();
    const stalled = new Writable({ highWaterMark: 1, write() { /* stalled */ } });
    proxy.attachConsumer(stalled); await flushResolution();
    const socket = latestSocket();
    socket.emit('data', Buffer.concat([packet(Buffer.from([0x47, 1])), packet(Buffer.from([0x47, 2]))]));
    const chunks: Buffer[] = [];
    proxy.attachConsumer(new Writable({ write(chunk, _encoding, cb) { chunks.push(Buffer.from(chunk)); cb(); } }));
    expect(chunks).toEqual([Buffer.from([0x47, 2])]);
    proxy.stop();
    (socket.resume as jest.Mock).mockClear();
    stalled.emit('drain');
    jest.advanceTimersByTime(2000);
    expect(socket.resume).not.toHaveBeenCalled();
    expect(proxy.isServing).toBe(false);
  });

  it('bounds stalled upstream control and talkback writes', async () => {
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    const socket = latestSocket();
    (socket.write as jest.Mock).mockReturnValue(false);
    proxy.startAudio();
    jest.advanceTimersByTime(2000);
    expect(proxy.isServing).toBe(false);
  });

  it('recovers child writes when drain arrives before its deadline', async () => {
    await proxy.start();
    let complete!: () => void;
    const writer = new Writable({ highWaterMark: 1, write(_chunk, _encoding, cb) { complete = cb; } });
    proxy.attachConsumer(writer); await flushResolution();
    latestSocket().emit('data', packet(Buffer.from([0x47])));
    complete(); writer.emit('drain');
    jest.advanceTimersByTime(2000);
    expect(proxy.isServing).toBe(true);
  });

  it('contains logger and event callback exceptions', async () => {
    proxy.on('data', () => { throw new Error('callback'); });
    await proxy.start(); proxy.attachConsumer(consumer()); await flushResolution();
    expect(() => latestSocket().emit('data', packet(Buffer.from([0x47])))).not.toThrow();
    expect(proxy.isServing).toBe(true);
  });

  it.each(['-1', '1.0', '01', '1x', '4294967296', ''])('rejects noncanonical client_id %s before TLS', (id) => {
    expect(() => new ImmisProxyServer({ immisUrl: `immis://media.immedia-semi.com/?client_id=${id}`, serial: 'TEST' })).toThrow(/uint32/);
    expect(tls.connect).not.toHaveBeenCalled();
  });
});

describe('ImmisProxyServer security controls', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('verifies upstream IMMIS TLS by default', async () => {
    const connectMock = tls.connect as unknown as jest.Mock;
    connectMock.mockClear();

    const proxy = new ImmisProxyServer({
      immisUrl: 'immis://stream.immedia-semi.com/session?client_id=1',
      serial: 'TEST_SERIAL',
    });

    await proxy.start();
    proxy.attachConsumer(consumer()); await flushResolution();

    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '8.8.8.8',
        port: 443,
        rejectUnauthorized: true,
        servername: 'stream.immedia-semi.com',
        minVersion: 'TLSv1.2',
      }),
      expect.any(Function),
    );

    await new Promise((resolve) => setImmediate(resolve));
    (proxy as unknown as { isRunning: boolean }).isRunning = true;
    proxy.stop();
  });

  it('requires upstream IMMIS TLS verification despite obsolete bypass setting', async () => {
    const connectMock = tls.connect as unknown as jest.Mock;
    connectMock.mockClear();

    const proxy = new ImmisProxyServer({
      immisUrl: 'immis://stream.immedia-semi.com/session?client_id=1',
      serial: 'TEST_SERIAL',
      verifyTls: false,
    });

    await proxy.start();
    proxy.attachConsumer(consumer()); await flushResolution();

    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '8.8.8.8',
        port: 443,
        rejectUnauthorized: true,
        servername: 'stream.immedia-semi.com',
        minVersion: 'TLSv1.2',
      }),
      expect.any(Function),
    );

    await new Promise((resolve) => setImmediate(resolve));
    (proxy as unknown as { isRunning: boolean }).isRunning = true;
    proxy.stop();
  });

  it('redacts IMMIS auth identifiers from proxy debug logs', () => {
    const log = jest.fn();
    const proxy = new ImmisProxyServer({
      immisUrl: 'immis://stream.immedia-semi.com/session/conn-secret__suffix?client_id=12345',
      serial: 'TEST_SERIAL',
      debug: true,
      log,
    });

    (proxy as unknown as { buildAuthHeader: () => Buffer }).buildAuthHeader();

    const logs = log.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logs).toContain('Client ID: <redacted>');
    expect(logs).toContain('Connection ID: <redacted>');
    expect(logs).not.toContain('12345');
    expect(logs).not.toContain('conn-secret');
  });
});
