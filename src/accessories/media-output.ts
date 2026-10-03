/** Isolated outbound prototype. No socket creation or runtime camera integration. */
import { Buffer } from 'node:buffer';
import { BlockList, isIP } from 'node:net';

export interface MediaOutputOptions {
  address: string; addressVersion: 'ipv4' | 'ipv6'; port: number;
  suite: 'AES_CM_128_HMAC_SHA1_80'; key: Buffer; salt: Buffer;
  ssrc: number; payloadType: number; mtu: number; fps: number; rtcpInterval: number;
}
function integer(value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) { throw new Error('Invalid media parameter'); }
}
const invalidDestinations = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['127.0.0.0', 8], ['224.0.0.0', 3]] as const) {
  invalidDestinations.addSubnet(address, prefix, 'ipv4');
}
const invalidV6 = new BlockList();
invalidV6.addAddress('::', 'ipv6'); invalidV6.addAddress('::1', 'ipv6');
invalidV6.addSubnet('ff00::', 8, 'ipv6'); invalidV6.addSubnet('::ffff:0:0', 96, 'ipv6');
export function validateMediaOutput(options: MediaOutputOptions): void {
  if (isIP(options.address) !== (options.addressVersion === 'ipv4' ? 4 : options.addressVersion === 'ipv6' ? 6 : 0)
      || options.address.includes('%') || (options.addressVersion === 'ipv4' ? invalidDestinations : invalidV6).check(options.address, options.addressVersion) || !['ipv4', 'ipv6'].includes(options.addressVersion)) {
    throw new Error('Invalid media destination');
  }
  integer(options.port, 1, 65535); integer(options.ssrc, 1, 0xffffffff);
  integer(options.payloadType, 0, 127); integer(options.mtu, 64, 1500); integer(options.fps, 1, 60);
  if (options.suite !== 'AES_CM_128_HMAC_SHA1_80' || options.key.length !== 16 || options.salt.length !== 14) {
    throw new Error('Unsupported media cryptography');
  }
  if (!Number.isFinite(options.rtcpInterval) || options.rtcpInterval < 0.1 || options.rtcpInterval > 60) {
    throw new Error('Invalid RTCP interval');
  }
}
/** Maintained native libsrtp implementation owns keys, ROC, replay and SRTCP indexes. */
export interface MediaPacketProtector {
  protectRtp(packet: Buffer): Promise<Buffer>;
  protectRtcp(packet: Buffer): Promise<Buffer>;
  close(): void;
}

export const MEDIA_OUTPUT_LIMITS = Object.freeze({ accessUnitBytes: 2 * 1024 * 1024, accessUnitPackets: 2048,
  queuedPackets: 2048, queuedBytes: 3 * 1024 * 1024, sendTimeoutMs: 1000 });
export class H264Packetizer {
  #sequence: number;
  constructor(private readonly ssrc: number, private readonly pt: number, private readonly mtu: number, sequence: number) {
    integer(ssrc, 1, 0xffffffff); integer(pt, 0, 127); integer(mtu, 64, 1500); integer(sequence, 0, 65535); this.#sequence = sequence;
  }
  packetize(nals: readonly Buffer[], timestamp: number): Buffer[] {
    integer(timestamp, 0, 0xffffffff);
    const payloadMax = this.mtu - 12 - 10; // authenticated datagram, including SRTP tag, fits negotiated MTU
    let bytes = 0; let count = 0;
    if (nals.length === 0 || nals.length > MEDIA_OUTPUT_LIMITS.accessUnitPackets) { throw new Error('Invalid access unit'); }
    for (const nal of nals) {
      bytes += nal.length;
      if (nal.length === 0 || (nal[0] & 0x80) !== 0 || (nal[0] & 31) === 0 || (nal[0] & 31) > 23) {
        throw new Error('Invalid H264 NAL');
      }
      count += nal.length <= payloadMax ? 1 : Math.ceil((nal.length - 1) / (payloadMax - 2));
      if (bytes > MEDIA_OUTPUT_LIMITS.accessUnitBytes || count > MEDIA_OUTPUT_LIMITS.accessUnitPackets) { throw new Error('Access unit budget exceeded'); }
    }
    const payloads: Buffer[] = [];
    for (const nal of nals) {
      if (nal.length <= payloadMax) { payloads.push(Buffer.from(nal)); continue; }
      for (let pos = 1; pos < nal.length; pos += payloadMax - 2) {
        const end = Math.min(nal.length, pos + payloadMax - 2);
        payloads.push(Buffer.concat([Buffer.from([(nal[0] & 0xe0) | 28,
          (nal[0] & 31) | (pos === 1 ? 0x80 : 0) | (end === nal.length ? 0x40 : 0)]), nal.subarray(pos, end)]));
      }
    }
    return payloads.map((payload, i) => {
      const header = Buffer.alloc(12); header[0] = 0x80; header[1] = this.pt | (i === payloads.length - 1 ? 0x80 : 0);
      header.writeUInt16BE(this.#sequence, 2); this.#sequence = (this.#sequence + 1) & 0xffff;
      header.writeUInt32BE(timestamp, 4); header.writeUInt32BE(this.ssrc, 8);
      return Buffer.concat([header, payload]);
    });
  }
}
/** RFC3550 compound SR + SDES CNAME. A random session pseudonym avoids device identity disclosure. */
export function senderReport(ssrc: number, unixMs: number, timestamp: number, packets: number, octets: number, cname: string): Buffer {
  integer(ssrc, 1, 0xffffffff); integer(timestamp, 0, 0xffffffff); integer(packets, 0, 0xffffffff); integer(octets, 0, 0xffffffff);
  if (!Number.isFinite(unixMs) || unixMs < 0 || unixMs >= 2085978496000 || !/^[a-zA-Z0-9-]{1,64}$/.test(cname)) { throw new Error('Invalid sender report'); }
  const sr = Buffer.alloc(28); sr[0] = 0x80; sr[1] = 200; sr.writeUInt16BE(6, 2); sr.writeUInt32BE(ssrc, 4);
  sr.writeUInt32BE(Math.floor(unixMs / 1000) + 2208988800, 8);
  sr.writeUInt32BE(Math.floor((unixMs % 1000) / 1000 * 0x100000000), 12);
  sr.writeUInt32BE(timestamp, 16); sr.writeUInt32BE(packets, 20); sr.writeUInt32BE(octets, 24);
  const name = Buffer.from(cname); const sdes = Buffer.alloc(Math.ceil((11 + name.length) / 4) * 4);
  sdes[0] = 0x81; sdes[1] = 202; sdes.writeUInt16BE(sdes.length / 4 - 1, 2); sdes.writeUInt32BE(ssrc, 4);
  sdes[8] = 1; sdes[9] = name.length; name.copy(sdes, 10);
  return Buffer.concat([sr, sdes]);
}
export interface MediaDatagramSink {
  /** Must release packet and cease work when signal aborts. Sender never opens sockets. */
  send(packet: Buffer, address: string, port: number, signal: globalThis.AbortSignal): Promise<void>;
}
export class BoundedMediaSender {
  #queue: Array<{ packet: Buffer; resolve: () => void; reject: (error: Error) => void }> = [];
  #bytes = 0; #packets = 0; #closed = false; #active?: globalThis.AbortController;
  #options: Pick<MediaOutputOptions, 'address' | 'port' | 'mtu'>;
  constructor(options: MediaOutputOptions, private readonly sink: MediaDatagramSink) {
    validateMediaOutput(options); this.#options = { address: options.address, port: options.port, mtu: options.mtu };
  }
  send(packet: Buffer): Promise<void> {
    if (this.#closed || packet.length > this.#options.mtu || packet.length < 22
        || this.#packets >= MEDIA_OUTPUT_LIMITS.queuedPackets || this.#bytes + packet.length > MEDIA_OUTPUT_LIMITS.queuedBytes) {
      return Promise.reject(new Error('Media output admission rejected'));
    }
    this.#bytes += packet.length; this.#packets++;
    return new Promise<void>((resolve, reject) => {
      this.#queue.push({ packet: Buffer.from(packet), resolve, reject }); void this.#drain();
    });
  }
  async #drain(): Promise<void> {
    if (this.#active || this.#closed) { return; }
    const entry = this.#queue.shift(); if (!entry) { return; }
    const controller = new globalThis.AbortController(); this.#active = controller;
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    try {
      await Promise.race([Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return this.sink.send(entry.packet, this.#options.address, this.#options.port, controller.signal);
      }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('Media send cancelled')), { once: true });
          timer = globalThis.setTimeout(() => controller.abort(), MEDIA_OUTPUT_LIMITS.sendTimeoutMs);
        })]);
      if (this.#closed) { throw new Error('Media sender closed'); } entry.resolve();
    } catch { entry.reject(new Error('Media datagram failed')); this.close(); }
    finally {
      if (timer !== undefined) { globalThis.clearTimeout(timer); }
      entry.packet.fill(0); this.#bytes -= entry.packet.length; this.#packets--; this.#active = undefined;
      void this.#drain();
    }
  }
  close(): void {
    this.#closed = true; this.#active?.abort();
    for (const entry of this.#queue.splice(0)) { this.#bytes -= entry.packet.length; this.#packets--; entry.packet.fill(0); entry.reject(new Error('Media sender closed')); }
  }
}
