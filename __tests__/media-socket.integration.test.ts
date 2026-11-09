import { Buffer } from 'node:buffer';
import { createSocket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { once } from 'node:events';
import { test } from '@jest/globals';
import process from 'node:process';
import { openMediaSocket } from '../src/accessories/media-socket';

const networkTest = process.env.BLINK_MEDIA_NETWORK_TEST === '1' ? test : test.skip;
networkTest('actual socket sends to the numeric controller and releases its local port after STOP', async () => {
  const deadline = globalThis.AbortSignal.timeout(2000);
  const address = Object.values(networkInterfaces()).flat().find(item => item?.family === 'IPv4' && !item.internal)?.address;
  if (!address) throw new Error('Numeric LAN interface required for owned media socket acceptance');
  const receiver = createSocket('udp4'); const reservation = createSocket('udp4');
  const owner = new globalThis.AbortController();
  try {
    receiver.bind(0, address); await once(receiver, 'listening', { signal: deadline });
    reservation.bind(0, address); await once(reservation, 'listening', { signal: deadline });
    const localPort = reservation.address().port;
    const retired = once(reservation, 'close', { signal: deadline }); reservation.close(); await retired;
    const output = await openMediaSocket({ address, addressVersion: 'ipv4', port: receiver.address().port,
      suite: 'AES_CM_128_HMAC_SHA1_80', key: Buffer.alloc(16), salt: Buffer.alloc(14), ssrc: 1,
      payloadType: 99, mtu: 128, fps: 30, rtcpInterval: 0.5 }, localPort, owner.signal);
    const received = once(receiver, 'message', { signal: deadline });
    const bytes = Buffer.alloc(32, 42);
    await output.send(bytes, address, receiver.address().port, new globalThis.AbortController().signal);
    const [packet, peer] = await received;
    expect(packet).toEqual(bytes); expect(peer.port).toBe(localPort);
    owner.abort(); await output.whenClosed;
    await expect(output.send(bytes, address, receiver.address().port, new globalThis.AbortController().signal)).rejects.toThrow();
    const replacement = createSocket('udp4');
    try {
      replacement.bind({ address, port: localPort, exclusive: true }); await once(replacement, 'listening', { signal: deadline });
      expect(replacement.address().port).toBe(localPort);
    } finally { replacement.close(); }
  } finally {
    owner.abort(); receiver.close();
    try { reservation.close(); } catch { /* Already closed to hand off its port. */ }
  }
}, 5000);
