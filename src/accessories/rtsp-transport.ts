import { Buffer } from 'node:buffer';
import { URL } from 'node:url';

export interface RtspRequest {
  method: 'OPTIONS' | 'DESCRIBE' | 'SETUP' | 'PLAY' | 'GET_PARAMETER' | 'TEARDOWN';
  cseq: number;
  target: string;
}
export interface RtspCallbacks {
  media(bytes: Buffer): void;
  rtcp(bytes: Buffer): void;
  response?(value: { cseq: number; session?: string }): void;
}
export const RTSP_PARSER_LIMITS = Object.freeze({ chunkBytes: 65536, headerBytes: 16384,
  bodyBytes: 65536, lifetimeBytes: 128 * 1024 * 1024 });

/** Nonintegrated protocol proof. This class neither authorizes destinations nor opens sockets.
 * A production dialer must extend the canonical media-destination contract using checked
 * provider evidence. The initial URI here supplies only a same-origin semantic boundary.
 */
export class RtspInterleavedParser {
  #buffer = Buffer.alloc(0);
  #request?: RtspRequest;
  #playing = false;
  #closed = false;
  #session?: string;
  #bytes = 0;
  #ssrc?: number;
  #origin: URL;
  #abort: () => void;
  constructor(target: string, private readonly callbacks: RtspCallbacks, private readonly signal?: globalThis.AbortSignal) {
    this.#origin = this.#uri(target);
    this.#abort = () => this.close();
    if (signal?.aborted) this.close();
    else signal?.addEventListener('abort', this.#abort, { once: true });
  }
  get closed(): boolean { return this.#closed; }
  #fail(): never { this.close(); throw new Error('RTSP transport refused'); }
  #uri(value: string, base?: URL): URL {
    try {
      if (value.length > 8192 || /[\s\\]/.test(value)) throw new Error();
      const uri = new URL(value, base);
      if (uri.protocol !== 'rtsps:' || !uri.hostname || uri.username || uri.password || uri.hash) throw new Error();
      return uri;
    } catch { return this.#fail(); }
  }
  #target(value: string, base = this.#origin): URL {
    const uri = this.#uri(value, base);
    if (uri.hostname !== this.#origin.hostname || (uri.port || '332') !== (this.#origin.port || '332')) this.#fail();
    return uri;
  }
  expect(request: RtspRequest): void {
    if (this.#closed || this.#request || !Number.isSafeInteger(request.cseq) || request.cseq < 1) this.#fail();
    this.#target(request.target);
    this.#request = { ...request };
  }
  push(bytes: Buffer): void {
    if (this.#closed || !bytes.length || bytes.length > RTSP_PARSER_LIMITS.chunkBytes ||
        this.#bytes + bytes.length > RTSP_PARSER_LIMITS.lifetimeBytes) this.#fail();
    this.#bytes += bytes.length;
    this.#buffer = Buffer.concat([this.#buffer, bytes]);
    try {
      while (this.#buffer.length) {
        if (this.#buffer[0] === 36) {
          if (this.#buffer.length < 4) return;
          const length = this.#buffer.readUInt16BE(2);
          if (!length || !this.#playing) this.#fail();
          if (this.#buffer.length < length + 4) return;
          const channel = this.#buffer[1]; const packet = this.#buffer.subarray(4, 4 + length);
          this.#buffer = this.#buffer.subarray(4 + length);
          if (channel === 0) this.#rtp(packet);
          else if (channel === 1) this.#rtcp(packet);
          else this.#fail();
        } else {
          const end = this.#buffer.indexOf('\r\n\r\n');
          if (end < 0) { if (this.#buffer.length > RTSP_PARSER_LIMITS.headerBytes) this.#fail(); return; }
          if (end + 4 > RTSP_PARSER_LIMITS.headerBytes || !this.#request) this.#fail();
          if (this.#buffer.subarray(0, end).some(byte => byte !== 9 && byte !== 13 && byte !== 10 && (byte < 32 || byte > 126))) this.#fail();
          const lines = this.#buffer.subarray(0, end).toString('ascii').split('\r\n');
          if (!/^RTSP\/1\.0 200(?: |$)/.test(lines.shift()!)) this.#fail();
          const headers = new Map<string, string>();
          for (const line of lines) {
            const match = /^([A-Za-z-]+):[ \t]*([^\r\n]*)$/.exec(line);
            if (!match || headers.has(match[1].toLowerCase())) this.#fail();
            headers.set(match[1].toLowerCase(), match[2].trim());
          }
          const rawLength = headers.get('content-length') ?? '0';
          if (!/^\d{1,6}$/.test(rawLength)) this.#fail();
          const length = Number(rawLength);
          if (length > RTSP_PARSER_LIMITS.bodyBytes) this.#fail();
          if (this.#buffer.length < end + 4 + length) return;
          const body = this.#buffer.subarray(end + 4, end + 4 + length);
          this.#buffer = this.#buffer.subarray(end + 4 + length);
          this.#response(headers, body);
        }
        if (this.#closed) return;
      }
    } catch { this.#fail(); }
  }
  #response(headers: Map<string, string>, body: Buffer): void {
    const request = this.#request!;
    if (headers.get('cseq') !== String(request.cseq)) this.#fail();
    // No redirect following, proxy auth, or alternate transport negotiation exists.
    if (['location', 'www-authenticate', 'proxy-authenticate'].some(key => headers.has(key))) this.#fail();
    const base = headers.has('content-base') ? this.#target(headers.get('content-base')!, this.#target(request.target))
      : this.#target(request.target);
    if (headers.has('content-location')) this.#target(headers.get('content-location')!, base);
    if (headers.has('transport') && (request.method !== 'SETUP' ||
        headers.get('transport') !== 'RTP/AVP/TCP;unicast;interleaved=0-1')) this.#fail();
    if (request.method === 'SETUP' && !headers.has('transport')) this.#fail();
    if (body.length) {
      if (request.method !== 'DESCRIBE' || headers.get('content-type') !== 'application/sdp' ||
          body.some(byte => byte !== 13 && byte !== 10 && (byte < 32 || byte > 126))) this.#fail();
      const lines = body.toString('ascii').split('\r\n');
      if (lines.pop() !== '') this.#fail();
      for (const line of lines) {
        if (!/^[a-z]=[^\r\n]*$/.test(line)) this.#fail();
        if (line.startsWith('a=control:') && line !== 'a=control:*') {
          if (line.length === 10) this.#fail();
          this.#target(line.slice(10), base);
        }
      }
    }
    const session = headers.get('session');
    if (session) {
      const match = /^([A-Za-z0-9._~-]{1,128})(?:;timeout=([1-9][0-9]{0,2}))?$/.exec(session);
      if (!match || (match[2] && Number(match[2]) > 300) || (this.#session && this.#session !== match[1])) this.#fail();
      this.#session = match[1];
    } else if (this.#session) this.#fail();
    if (request.method === 'PLAY') this.#playing = true;
    this.#request = undefined;
    if (request.method === 'TEARDOWN') this.close();
    this.callbacks.response?.({ cseq: request.cseq, session: this.#session });
  }
  #rtcp(packet: Buffer): void {
    let offset = 0;
    while (offset < packet.length) {
      if (packet.length - offset < 8 || (packet[offset] & 0xe0) !== 0x80) this.#fail();
      const count = packet[offset] & 31; const type = packet[offset + 1];
      const length = (packet.readUInt16BE(offset + 2) + 1) * 4;
      const expected = type === 200 ? 28 + count * 24 : type === 201 ? 8 + count * 24 : 0;
      if (!expected || length !== expected || offset + length > packet.length) this.#fail();
      offset += length;
    }
    this.callbacks.rtcp(Buffer.from(packet));
  }
  #rtp(packet: Buffer): void {
    if (packet.length <= 12 || packet[0] !== 0x80 || (packet[1] & 127) !== 33) this.#fail();
    const ssrc = packet.readUInt32BE(8);
    if (!ssrc || (this.#ssrc !== undefined && this.#ssrc !== ssrc)) this.#fail();
    const payload = packet.subarray(12);
    if (payload.length % 188 !== 0) this.#fail();
    for (let i = 0; i < payload.length; i += 188) if (payload[i] !== 0x47) this.#fail();
    this.#ssrc = ssrc;
    this.callbacks.media(Buffer.from(payload));
  }
  finish(): void {
    if (this.#closed || this.#buffer.length || this.#request) this.#fail();
    this.close();
  }
  close(): void {
    this.#closed = true; this.#buffer = Buffer.alloc(0); this.#request = undefined;
    this.signal?.removeEventListener('abort', this.#abort);
  }
}
