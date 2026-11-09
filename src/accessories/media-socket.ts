import { Buffer } from 'node:buffer';
import { createSocket } from 'node:dgram';
import { withinRequestBudget } from '../operation-budget';
import { validateMediaOutput, type MediaDatagramSink, type MediaOutputOptions } from './media-output';

export interface OwnedMediaSocket extends MediaDatagramSink {
  readonly whenClosed: Promise<void>;
  close(): void;
}

/** A single generation owns the bound socket and its immutable numeric controller destination. */
export async function openMediaSocket(options: MediaOutputOptions, localPort: number,
  signal: globalThis.AbortSignal): Promise<OwnedMediaSocket> {
  validateMediaOutput(options);
  if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535 || signal.aborted) {
    throw new Error('Media socket admission rejected');
  }
  const { address, port, mtu, addressVersion } = options;
  const socket = createSocket({ type: addressVersion === 'ipv4' ? 'udp4' : 'udp6', reuseAddr: false, ipv6Only: addressVersion === 'ipv6' });
  let closed = false; let finish!: () => void;
  const whenClosed = new Promise<void>(resolve => { finish = resolve; });
  const close = () => {
    if (closed) return;
    closed = true;
    try { socket.close(); } catch { signal.removeEventListener('abort', close); finish(); }
  };
  socket.once('close', () => { closed = true; signal.removeEventListener('abort', close); finish(); });
  socket.on('error', close);
  signal.addEventListener('abort', close, { once: true });
  try {
    await withinRequestBudget(new Promise<void>((resolve, reject) => {
      const failed = () => { cleanup(); reject(new Error('Media socket unavailable')); };
      const cleanup = () => { socket.removeListener('error', failed); socket.removeListener('close', failed); };
      socket.once('error', failed); socket.once('close', failed);
      socket.bind({ port: localPort, address: addressVersion === 'ipv4' ? '0.0.0.0' : '::', exclusive: true }, () => {
        if (closed || signal.aborted) { failed(); return; }
        try { socket.connect(port, address, () => { cleanup(); if (closed || signal.aborted) failed(); else resolve(); }); }
        catch { failed(); }
      });
    }), { signal, deadline: Date.now() + 1000 });
  } catch { close(); await whenClosed; throw new Error('Media socket unavailable'); }
  return {
    whenClosed, close,
    send(packet: Buffer, destination: string, destinationPort: number, operationSignal: globalThis.AbortSignal): Promise<void> {
      if (closed || signal.aborted || operationSignal.aborted || destination !== address || destinationPort !== port
          || packet.length < 22 || packet.length > mtu) return Promise.reject(new Error('Media socket admission rejected'));
      return new Promise<void>((resolve, reject) => {
        const failed = () => { cleanup(); close(); reject(new Error('Media datagram unavailable')); };
        const cleanup = () => {
          operationSignal.removeEventListener('abort', failed); socket.removeListener('close', failed); socket.removeListener('error', failed);
        };
        operationSignal.addEventListener('abort', failed, { once: true }); socket.once('close', failed); socket.once('error', failed);
        try { socket.send(packet, error => { cleanup(); if (error || closed || signal.aborted || operationSignal.aborted) failed(); else resolve(); }); }
        catch { failed(); }
      });
    },
  };
}
