import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { createSocket } from 'node:dgram';
import { beforeEach, test } from '@jest/globals';
import { openMediaSocket } from '../src/accessories/media-socket';
import type { MediaOutputOptions } from '../src/accessories/media-output';

jest.mock('node:dgram', () => ({ createSocket: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); });
const options = (): MediaOutputOptions => ({ address: '192.168.1.5', addressVersion: 'ipv4', port: 5000,
  suite: 'AES_CM_128_HMAC_SHA1_80', key: Buffer.alloc(16), salt: Buffer.alloc(14), ssrc: 1,
  payloadType: 99, mtu: 128, fps: 30, rtcpInterval: 0.5 });
function socket() {
  const value = Object.assign(new EventEmitter(), {
    bind: jest.fn((_options, callback: () => void) => { globalThis.queueMicrotask(callback); }),
    connect: jest.fn((_port, _address, callback: () => void) => { globalThis.queueMicrotask(callback); }),
    send: jest.fn((_bytes, callback: (error?: Error) => void) => { globalThis.queueMicrotask(callback); }),
    close: jest.fn(() => { globalThis.queueMicrotask(() => value.emit('close')); }),
  });
  (createSocket as jest.Mock).mockReturnValue(value); return value;
}
test('owned media socket binds one port and sends only to its connected numeric capability', async () => {
  const raw = socket(); const negotiation = options();
  const owner = new globalThis.AbortController();
  const output = await openMediaSocket(negotiation, 6000, owner.signal);
  expect(createSocket).toHaveBeenCalledWith({ type: 'udp4', reuseAddr: false, ipv6Only: false });
  expect(raw.bind.mock.calls[0][0]).toEqual({ port: 6000, address: '0.0.0.0', exclusive: true });
  expect(raw.connect.mock.calls[0].slice(0, 2)).toEqual([5000, '192.168.1.5']);
  negotiation.address = 'evil.invalid'; negotiation.port = 42;
  await output.send(Buffer.alloc(32), '192.168.1.5', 5000, new globalThis.AbortController().signal);
  expect(raw.send.mock.calls[0]).toHaveLength(2);
  output.close(); await output.whenClosed;
});
test('synchronous connect refusal is bounded and closes the owned socket', async () => {
  const raw = socket(); raw.connect.mockImplementation(() => { throw new Error('dummy-private-address'); });
  await expect(openMediaSocket(options(), 6000, new globalThis.AbortController().signal)).rejects.toThrow('Media socket unavailable');
  expect(raw.close).toHaveBeenCalledTimes(1);
});
test.each([0, -1, 65536, 1.5])('invalid local port %s creates no socket', async localPort => {
  await expect(openMediaSocket(options(), localPort, new globalThis.AbortController().signal)).rejects.toThrow();
  expect(createSocket).not.toHaveBeenCalled();
});
test('invalid remote admission and prior cancellation create no socket', async () => {
  await expect(openMediaSocket({ ...options(), address: 'evil.invalid' }, 6000, new globalThis.AbortController().signal)).rejects.toThrow();
  const cancelled = new globalThis.AbortController(); cancelled.abort();
  await expect(openMediaSocket(options(), 6000, cancelled.signal)).rejects.toThrow();
  expect(createSocket).not.toHaveBeenCalled();
});
test('bind refusal prevents connect and exposes fixed diagnostics', async () => {
  const raw = socket(); raw.bind.mockImplementation(() => { globalThis.queueMicrotask(() => raw.emit('error', new Error('dummy-private-input'))); });
  await expect(openMediaSocket(options(), 6000, new globalThis.AbortController().signal)).rejects.toThrow('Media socket unavailable');
  expect(raw.connect).not.toHaveBeenCalled(); expect(raw.close).toHaveBeenCalledTimes(1);
});
test('IPv6 uses one exclusive family socket with the admitted destination', async () => {
  const raw = socket();
  const output = await openMediaSocket({ ...options(), addressVersion: 'ipv6', address: 'fd00::5' }, 6001, new globalThis.AbortController().signal);
  expect(createSocket).toHaveBeenCalledWith({ type: 'udp6', reuseAddr: false, ipv6Only: true });
  expect(raw.bind.mock.calls[0][0]).toEqual({ port: 6001, address: '::', exclusive: true });
  expect(raw.connect.mock.calls[0].slice(0, 2)).toEqual([5000, 'fd00::5']); output.close(); await output.whenClosed;
});
test('late bind completion cannot connect after generation cancellation', async () => {
  const raw = socket(); let bound!: () => void;
  raw.bind.mockImplementation((_options, callback) => { bound = callback; });
  const owner = new globalThis.AbortController(); const pending = openMediaSocket(options(), 6000, owner.signal);
  owner.abort(); await expect(pending).rejects.toThrow('Media socket unavailable');
  bound(); expect(raw.connect).not.toHaveBeenCalled();
});
test('destination changes, invalid datagrams and cancelled sends have no send effect', async () => {
  const raw = socket(); const owner = new globalThis.AbortController();
  const output = await openMediaSocket(options(), 6000, owner.signal);
  const signal = new globalThis.AbortController().signal;
  await expect(output.send(Buffer.alloc(32), '192.168.1.6', 5000, signal)).rejects.toThrow();
  await expect(output.send(Buffer.alloc(32), '192.168.1.5', 5001, signal)).rejects.toThrow();
  await expect(output.send(Buffer.alloc(21), '192.168.1.5', 5000, signal)).rejects.toThrow();
  await expect(output.send(Buffer.alloc(129), '192.168.1.5', 5000, signal)).rejects.toThrow();
  const cancelled = new globalThis.AbortController(); cancelled.abort();
  await expect(output.send(Buffer.alloc(32), '192.168.1.5', 5000, cancelled.signal)).rejects.toThrow();
  expect(raw.send).not.toHaveBeenCalled(); owner.abort(); await output.whenClosed;
  await expect(output.send(Buffer.alloc(32), '192.168.1.5', 5000, signal)).rejects.toThrow();
});
test('send cancellation closes the socket and fences its late callback', async () => {
  const raw = socket(); let sent!: (error?: Error) => void;
  raw.send.mockImplementation((_bytes, callback) => { sent = callback; });
  const output = await openMediaSocket(options(), 6000, new globalThis.AbortController().signal);
  const operation = new globalThis.AbortController();
  const pending = output.send(Buffer.alloc(32), '192.168.1.5', 5000, operation.signal);
  operation.abort(); await expect(pending).rejects.toThrow('Media datagram unavailable');
  await output.whenClosed; sent(); output.close(); expect(raw.close).toHaveBeenCalledTimes(1);
});
test('bind deadline closes admission even if the socket never completes', async () => {
  jest.useFakeTimers();
  try {
    const raw = socket(); raw.bind.mockImplementation(() => {});
    const pending = openMediaSocket(options(), 6000, new globalThis.AbortController().signal);
    const check = expect(pending).rejects.toThrow('Media socket unavailable');
    await jest.advanceTimersByTimeAsync(1000); await check; expect(raw.close).toHaveBeenCalledTimes(1);
  } finally { jest.useRealTimers(); }
});
test('failed startup retains ownership until actual socket closure is observed', async () => {
  const raw = socket(); raw.close.mockImplementation(() => {}); raw.connect.mockImplementation(() => {});
  const owner = new globalThis.AbortController();
  let retired = false;
  const pending = openMediaSocket(options(), 6000, owner.signal).catch(error => { retired = true; throw error; });
  const checked = expect(pending).rejects.toThrow('Media socket unavailable');
  await Promise.resolve(); owner.abort();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(retired).toBe(false);
  raw.emit('close'); await checked; expect(retired).toBe(true);
});
