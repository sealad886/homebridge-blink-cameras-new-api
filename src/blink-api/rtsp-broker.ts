import { Buffer } from 'node:buffer';
import type { EventEmitter } from 'node:events';
import type { TcpNetConnectOpts } from 'node:net';
import * as tls from 'node:tls';
import { URL } from 'node:url';
import { RtspInterleavedParser } from '../accessories/rtsp-transport';
import { describeMediaDestination, resolveMediaDestination, type MediaAddressLookup } from './media-destination';
import { IMMIS_VENDOR_CA } from './immis-trust';

export interface RtspSocket extends EventEmitter {
  readonly authorized: boolean;
  readonly remoteAddress?: string;
  write(bytes: Buffer, callback: (error?: Error | null) => void): boolean;
  destroy(): unknown;
  pause(): unknown;
  resume(): unknown;
}
/** write must settle after abort/close; close must confirm actual consumer retirement. */
export interface RtspConsumer {
  write(bytes: Buffer, signal: globalThis.AbortSignal): Promise<void>;
  close(): Promise<void>;
}
export interface RtspBrokerDependencies {
  lookup?: MediaAddressLookup;
  connect?: (options: tls.ConnectionOptions) => RtspSocket;
  error?: (error: Error) => void;
}
export const RTSP_BROKER_LIMITS = Object.freeze({ handshakeMs: 5000, closeMs: 2000, controlMs: 5000,
  consumeMs: 2000, idleMs: 15000, lifetimeMs: 300000, queueBytes: 512 * 1024,
  pauseBytes: 64 * 1024, resumeBytes: 32 * 1024, candidates: 3, reconnects: 3 });
interface Connection {
  socket: RtspSocket; verified: boolean; playing: boolean; closed: boolean;
  parser: RtspInterleavedParser;
  timer?: ReturnType<typeof globalThis.setTimeout>;
  grace?: ReturnType<typeof globalThis.setTimeout>;
}

/** Owned, nonintegrated source-backed RTSPS/332 shortened PLAY broker.
 * Initial URI must explicitly select blinkRTSP=true/1. No generic RTSP, Basic/Digest,
 * redirects, SDP socket creation, UDP or unrestricted URL-fetch fallback exists.
 * Mocked dialers prove policy mechanics; actual provider interoperability remains gated.
 */
export class OwnedRtspBroker {
  readonly whenClosed: Promise<void>;
  #finish!: () => void;
  #resolveReady!: () => void;
  #rejectReady!: (error: Error) => void;
  #ready: Promise<void>;
  #readySettled = false;
  #started = false;
  #stopping = false;
  #cancel = new globalThis.AbortController();
  #connection?: Connection;
  #chains = 0;
  #retired = false;
  #queue: Buffer[] = [];
  #queuedBytes = 0;
  #consuming = false;
  #reconnects = 0;
  #life?: ReturnType<typeof globalThis.setTimeout>;
  #idle?: ReturnType<typeof globalThis.setTimeout>;
  #writes = new Set<Buffer>();
  #destination: ReturnType<typeof describeMediaDestination>;
  #target: string;
  #wireTarget: string;
  constructor(raw: string, private readonly consumer: RtspConsumer, private readonly dependencies: RtspBrokerDependencies = {},
    signal?: globalThis.AbortSignal) {
    try {
      this.#destination = describeMediaDestination(raw);
      const uri = new URL(raw);
      if (this.#destination.scheme !== 'rtsps:' || !['true', '1'].includes(uri.searchParams.get('blinkRTSP') ?? '') ||
          uri.searchParams.getAll('blinkRTSP').length !== 1) throw new Error();
      this.#target = uri.toString();
      this.#wireTarget = `rtsp://${uri.hostname}:${this.#destination.port}${uri.pathname || '/'}`;
    } catch { throw new Error('RTSP transport refused'); }
    this.whenClosed = new Promise(resolve => { this.#finish = resolve; });
    this.#ready = new Promise((resolve, reject) => { this.#resolveReady = resolve; this.#rejectReady = reject; });
    // Caller may stop before awaiting start; still expose the original rejected start promise.
    void this.#ready.catch(() => {});
    if (signal) {
      const abort = () => { void this.stop(); };
      if (signal.aborted) abort();
      else {
        signal.addEventListener('abort', abort, { once: true });
        void this.whenClosed.then(() => signal.removeEventListener('abort', abort));
      }
    }
  }
  start(): Promise<void> {
    if (!this.#started && !this.#stopping) {
      this.#started = true;
      this.#life = globalThis.setTimeout(() => this.#fail(), RTSP_BROKER_LIMITS.lifetimeMs);
      void this.#chain();
    }
    return this.#ready;
  }
  #settleReady(error?: Error): void {
    if (this.#readySettled) return;
    this.#readySettled = true;
    if (error) this.#rejectReady(error); else this.#resolveReady();
  }
  #fail(): void {
    if (this.#stopping) return;
    const error = new Error('RTSP transport refused');
    this.#settleReady(error);
    void this.stop();
    try { this.dependencies.error?.(error); } catch { /* Diagnostics cannot change retirement. */ }
  }
  async #chain(): Promise<void> {
    if (this.#stopping) return;
    this.#chains++;
    try {
      const resolved = await resolveMediaDestination(this.#destination, this.#cancel.signal, this.dependencies.lookup);
      if (this.#stopping) return;
      const unique = resolved.addresses.filter((item, index, all) => all.findIndex(other => other.address === item.address) === index);
      const other = unique.find(item => item.family !== unique[0].family);
      const candidates = [unique[0], ...(other ? [other] : []), ...unique.filter(item => item !== unique[0] && item !== other)]
        .slice(0, RTSP_BROKER_LIMITS.candidates);
      for (const candidate of candidates) {
        if (this.#stopping) return;
        if (await this.#attempt(candidate.address, candidate.family)) return;
      }
      if (!this.#stopping) this.#fail();
    } catch { if (!this.#stopping) this.#fail(); }
    finally { this.#chains--; this.#closed(); }
  }
  #attempt(address: string, family: 4 | 6): Promise<boolean> {
    return new Promise(resolve => {
      let socket: RtspSocket;
      try {
        const options: tls.ConnectionOptions & TcpNetConnectOpts = { host: address, family,
          port: this.#destination.port, servername: this.#destination.servername, rejectUnauthorized: true,
          minVersion: 'TLSv1.2', ca: [...tls.rootCertificates, ...IMMIS_VENDOR_CA], autoSelectFamily: false };
        socket = (this.dependencies.connect ?? (value => tls.connect(value)))(options);
      } catch { resolve(false); return; }
      const context: Connection = { socket, verified: false, playing: false, closed: false,
        parser: new RtspInterleavedParser(this.#target, {
          media: bytes => this.#media(context, bytes), rtcp: () => {}, response: () => {
            if (!this.#current(context) || !context.verified) return;
            globalThis.clearTimeout(context.timer); context.playing = true;
            this.#settleReady(); this.#touch(); resolve(true);
          },
        }, this.#cancel.signal) };
      this.#connection = context;
      const rejectCandidate = () => {
        if (!this.#current(context)) return;
        globalThis.clearTimeout(context.timer);
        if (!context.grace) context.grace = globalThis.setTimeout(() => this.#fail(), RTSP_BROKER_LIMITS.closeMs);
        socket.destroy();
      };
      context.timer = globalThis.setTimeout(rejectCandidate, RTSP_BROKER_LIMITS.handshakeMs);
      socket.once('secureConnect', () => {
        if (!this.#current(context) || context.grace) return;
        if (socket.authorized !== true || (socket.remoteAddress !== address &&
            !(family === 4 && socket.remoteAddress === `::ffff:${address}`))) { rejectCandidate(); return; }
        context.verified = true; globalThis.clearTimeout(context.timer);
        context.timer = globalThis.setTimeout(() => this.#fail(), RTSP_BROKER_LIMITS.controlMs);
        try {
          context.parser.expect({ method: 'PLAY', cseq: 1, target: this.#target });
          const request = Buffer.from(`PLAY ${this.#wireTarget} RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: Immedia WalnutPlayer\r\nSession: invalidSessionID\r\nRange: npt=0.000-\r\n\r\n`);
          this.#writes.add(request);
          socket.write(request, error => { request.fill(0); this.#writes.delete(request); if (error && this.#current(context)) this.#fail(); });
        } catch { this.#fail(); }
      });
      socket.on('data', (bytes: Buffer) => {
        if (!this.#current(context)) return;
        if (!context.verified) { this.#fail(); return; }
        try { context.parser.push(bytes); } catch { this.#fail(); }
      });
      socket.on('error', () => { if (this.#current(context)) rejectCandidate(); });
      socket.once('close', () => {
        context.closed = true; globalThis.clearTimeout(context.timer); globalThis.clearTimeout(context.grace);
        if (this.#connection === context) this.#connection = undefined;
        if (!context.playing) resolve(false);
        else if (!this.#stopping) {
          try { context.parser.finish(); } catch { this.#fail(); }
          globalThis.clearTimeout(this.#idle);
          if (!this.#stopping && this.#reconnects++ < RTSP_BROKER_LIMITS.reconnects) void this.#chain();
          else if (!this.#stopping) this.#fail();
        }
        context.parser.close(); this.#closed();
      });
    });
  }
  #current(context: Connection): boolean {
    return !this.#stopping && !context.closed && !context.grace && this.#connection === context;
  }
  #touch(): void {
    globalThis.clearTimeout(this.#idle);
    this.#idle = globalThis.setTimeout(() => this.#fail(), RTSP_BROKER_LIMITS.idleMs);
  }
  #media(context: Connection, bytes: Buffer): void {
    if (!this.#current(context) || !context.playing || this.#queuedBytes + bytes.length > RTSP_BROKER_LIMITS.queueBytes) { this.#fail(); return; }
    this.#touch(); this.#queue.push(bytes); this.#queuedBytes += bytes.length;
    if (this.#queuedBytes >= RTSP_BROKER_LIMITS.pauseBytes) context.socket.pause();
    if (!this.#consuming) void this.#drain();
  }
  async #drain(): Promise<void> {
    this.#consuming = true;
    try {
      while (!this.#stopping && this.#queue.length) {
        const bytes = this.#queue.shift()!;
        const timer = globalThis.setTimeout(() => this.#fail(), RTSP_BROKER_LIMITS.consumeMs);
        try { await this.consumer.write(bytes, this.#cancel.signal); }
        finally { globalThis.clearTimeout(timer); this.#queuedBytes -= bytes.length; bytes.fill(0); }
        if (!this.#stopping && this.#queuedBytes < RTSP_BROKER_LIMITS.resumeBytes) this.#connection?.socket.resume();
      }
    } catch { this.#fail(); }
    finally { this.#consuming = false; this.#closed(); }
  }
  stop(): Promise<void> {
    if (!this.#stopping) {
      this.#stopping = true; this.#cancel.abort(); this.#settleReady(new Error('RTSP transport refused'));
      globalThis.clearTimeout(this.#life); globalThis.clearTimeout(this.#idle);
      const context = this.#connection;
      if (context) { globalThis.clearTimeout(context.timer); globalThis.clearTimeout(context.grace); context.socket.destroy(); }
      for (const request of this.#writes) request.fill(0);
      this.#writes.clear();
      for (const bytes of this.#queue.splice(0)) { this.#queuedBytes -= bytes.length; bytes.fill(0); }
      this.#target = ''; this.#wireTarget = '';
      void Promise.resolve().then(() => this.consumer.close()).then(() => { this.#retired = true; this.#closed(); }, () => {
        // A failed close cannot establish actual consumer retirement.
      });
      this.#closed();
    }
    return this.whenClosed;
  }
  #closed(): void {
    if (this.#stopping && !this.#connection && this.#chains === 0 && !this.#consuming && this.#retired) this.#finish();
  }
}
