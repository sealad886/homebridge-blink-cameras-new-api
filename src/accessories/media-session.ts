import { Buffer } from 'node:buffer';
import { isAbsolute } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { withinRequestBudget, budgetedDelay } from '../operation-budget';
import { ProtectedRtpStream, MEDIA_OUTPUT_LIMITS, validateMediaOutput, type MediaOutputOptions, type MediaPacketProtector } from './media-output';
import { openMediaSocket, type OwnedMediaSocket } from './media-socket';
import { PrivateMediaWorker, MEDIA_WORKER_LIMITS, type MediaWorkerCallbacks, type CodecPacket, type SourceVideoInfo } from './media-worker';

export interface MediaSessionOptions {
  /** Must be resolved and verified by the packaged-artifact owner before this call. */
  workerPath: string;
  onSourceInfo?: (info: SourceVideoInfo) => void;
  video: { output: MediaOutputOptions; localPort: number; width: number; height: number;
    bitrate: number; maxFrames: number; profile: 0 | 1 | 2; level: 0 | 1 | 2; softwarePreset?: 'veryfast' | 'ultrafast' };
  audio?: { output: MediaOutputOptions; localPort: number; codec: 'opus' | 'pcma' | 'pcmu';
    rate: 8000 | 16000 | 24000; bitrate: number; packetTime?: 10 | 20 | 40 | 60 };
}
export type MediaSessionWorker = Pick<PrivateMediaWorker, 'whenClosed' | 'whenReady' | 'whenMediaDrained' | 'failed' |
  'configure' | 'initialize' | 'media' | 'endMedia' | 'finishInput' | 'stop'>;
export interface MediaSessionDependencies {
  createWorker?: (path: string, callbacks: MediaWorkerCallbacks) => MediaSessionWorker;
  openSocket?: typeof openMediaSocket;
}
export interface OwnedMediaSession {
  readonly whenClosed: Promise<void>;
  readonly failed: boolean;
  readonly audioTiming: Readonly<{ initialPaddingSamples: number; skipStartSamples: number; skipEndSamples: number }>;
  write(bytes: Buffer): Promise<void>;
  end(): Promise<void>;
  stop(): Promise<void>;
}
export const MEDIA_SESSION_LIMITS = Object.freeze({ startupMs: 100, queuedPackets: 256,
  queuedBytes: MEDIA_WORKER_LIMITS.frameBytes, vendorFrameBytes: 1024 * 1024 });
interface SessionStream {
  options: MediaOutputOptions; codec: 'h264' | 'opus' | 'pcma' | 'pcmu'; protector: MediaPacketProtector;
  socket: OwnedMediaSocket; rtp?: ProtectedRtpStream; sent: boolean; nextReport: number;
}
const unavailable = (): Error => new Error('Media session unavailable');
function integer(n: number, min: number, max: number): void {
  if (!Number.isInteger(n) || n < min || n > max) throw unavailable();
}
function validate(options: MediaSessionOptions): void {
  if (!isAbsolute(options.workerPath) || options.workerPath.includes('\0')) throw unavailable();
  const v = options.video;
  validateMediaOutput(v.output); integer(v.localPort, 1, 65535); integer(v.width, 2, 1920); integer(v.height, 2, 1080);
  integer(v.output.fps, 1, 30); integer(v.bitrate, 20000, 8000000); integer(v.maxFrames, 1, 9000);
  integer(v.profile, 0, 2); integer(v.level, 0, 2);
  if (v.softwarePreset !== undefined && !['veryfast', 'ultrafast'].includes(v.softwarePreset)) throw unavailable();
  const blocks = Math.ceil(v.width / 16) * Math.ceil(v.height / 16);
  if ((v.width & 1) || (v.height & 1) || blocks > [3600, 5120, 8192][v.level] || blocks * v.output.fps > [108000, 216000, 245760][v.level]) throw unavailable();
  if (options.audio) {
    const a = options.audio; validateMediaOutput(a.output); integer(a.localPort, 1, 65535); integer(a.bitrate, 8000, 128000);
    if (!['opus', 'pcma', 'pcmu'].includes(a.codec) || a.localPort === v.localPort ||
        (a.codec === 'opus' ? ![16000, 24000].includes(a.rate) || ![10, 20, 40, 60].includes(a.packetTime ?? 20) : a.rate !== 8000 || a.packetTime !== undefined)) throw unavailable();
  }
}
function ownOutput(output: MediaOutputOptions): MediaOutputOptions {
  return { ...output, key: Buffer.from(output.key), salt: Buffer.from(output.salt) };
}
function annexB(data: Buffer): Buffer[] {
  const nals: Buffer[] = []; let start = -1;
  const append = (end: number) => {
    while (end > start && data[end - 1] === 0) end--;
    if (end <= start || nals.length >= MEDIA_OUTPUT_LIMITS.accessUnitPackets) throw unavailable(); nals.push(data.subarray(start, end));
  };
  for (let i = 0; i + 2 < data.length; i++) {
    if (data[i] !== 0 || data[i + 1] !== 0) continue;
    const prefix = data[i + 2] === 1 ? 3 : i + 3 < data.length && data[i + 2] === 0 && data[i + 3] === 1 ? 4 : 0;
    if (!prefix) continue;
    if (start < 0) { if (data.subarray(0, i).some(byte => byte !== 0)) throw unavailable(); }
    else append(i);
    start = i + prefix; i = start - 1;
  }
  if (start < 0) throw unavailable(); append(data.length); return nals;
}

class Session implements OwnedMediaSession {
  readonly whenClosed: Promise<void>; #finishClosed!: () => void;
  #failed = false; get failed(): boolean { return this.#failed; }
  #cancel = new globalThis.AbortController(); #starting: Promise<void>; #finishStarting!: () => void;
  #worker?: MediaSessionWorker; #sockets: OwnedMediaSocket[] = [];
  #streams: SessionStream[] = []; #queue: CodecPacket[] = []; #bytes = 0; #count = 0;
  #pumping?: Promise<void>; #ending = false; #wake?: () => void; #space?: () => void;
  #origin = 0n; #anchor = 0; #audioInfoSeen = false;
  #audioTiming = { initialPaddingSamples: 0, skipStartSamples: 0, skipEndSamples: 0 };
  get audioTiming(): OwnedMediaSession['audioTiming'] { return { ...this.#audioTiming }; }
  #feeding = false; #inputEnded = false; #finishing = false; #stopping = false; #stop?: Promise<void>;
  #ownerAbort: () => void;
  readonly options: MediaSessionOptions;
  constructor(options: MediaSessionOptions, private readonly owner: globalThis.AbortSignal, private readonly dependencies: MediaSessionDependencies) {
    this.options = { ...options, video: { ...options.video, output: ownOutput(options.video.output) },
      audio: options.audio ? { ...options.audio, output: ownOutput(options.audio.output) } : undefined };
    this.whenClosed = new Promise(resolve => { this.#finishClosed = resolve; });
    this.#starting = new Promise(resolve => { this.#finishStarting = resolve; });
    this.#ownerAbort = () => { void this.stop(); }; owner.addEventListener('abort', this.#ownerAbort, { once: true });
  }
  #check(): void { if (this.#stopping || this.#cancel.signal.aborted || this.owner.aborted) throw unavailable(); }
  fail(): void { if (!this.#stopping) this.#failed = true; void this.stop(); }
  async start(): Promise<void> {
    const { video: v, audio: a } = this.options;
    try {
      this.#check();
      this.#worker = (this.dependencies.createWorker ?? ((path, callbacks) => new PrivateMediaWorker(path, callbacks)))(this.options.workerPath, {
        packet: (packet, signal) => this.#enqueue(packet, signal),
        sourceInfo: info => { try { this.#check(); this.options.onSourceInfo?.(info); } catch { this.fail(); throw unavailable(); } },
        audioInfo: info => {
          if (!a || this.#audioInfoSeen || info.codec !== (a.codec === 'opus' ? 1 : a.codec === 'pcma' ? 2 : 3) || info.rate !== a.rate || info.channels !== 1 || info.padding > a.rate * 2) {
            this.fail(); throw unavailable();
          }
          this.#audioInfoSeen = true; this.#audioTiming.initialPaddingSamples = info.padding;
        },
      });
      this.#check();
      this.#worker.whenClosed.then(() => { if (!this.#finishing && !this.#stopping) this.fail(); });
      const protectors = [await this.#worker.initialize(1, v.output.ssrc, v.output.key, v.output.salt)]; this.#check();
      if (a) { protectors.push(await this.#worker.initialize(2, a.output.ssrc, a.output.key, a.output.salt)); this.#check(); }
      await this.#worker.configure([v.width, v.height, v.output.fps, v.bitrate, v.maxFrames, v.softwarePreset === 'ultrafast' ? 1 : 0,
        a ? a.codec === 'opus' ? 1 : a.codec === 'pcma' ? 2 : 3 : 0, a?.rate ?? 0, a ? 1 : 0, a?.bitrate ?? 0,
        v.profile, v.level, a?.codec === 'opus' ? a.packetTime ?? 20 : 0]);
      await this.#worker.whenReady; this.#check();
      for (const stream of [v, ...(a ? [a] : [])]) {
        const socket = await (this.dependencies.openSocket ?? openMediaSocket)(stream.output, stream.localPort, this.#cancel.signal);
        this.#sockets.push(socket); this.#check();
        this.#streams.push({ options: stream.output, codec: this.#streams.length ? a!.codec : 'h264',
          protector: protectors[this.#streams.length], socket, sent: false, nextReport: Number.POSITIVE_INFINITY });
        socket.whenClosed.then(() => { if (!this.#stopping) this.fail(); });
      }
    } finally {
      for (const stream of [v, ...(a ? [a] : [])]) { stream.output.key.fill(0); stream.output.salt.fill(0); }
      this.#finishStarting();
    }
  }
  async #enqueue(packet: CodecPacket, signal: globalThis.AbortSignal): Promise<void> {
    const cancelled = () => this.fail(); signal.addEventListener('abort', cancelled, { once: true });
    try {
      this.#check(); signal.throwIfAborted(); const size = packet.data.length + 48;
      if (!packet.data.length || size > MEDIA_SESSION_LIMITS.queuedBytes || (packet.stream !== 1 && packet.stream !== 2) ||
          (packet.stream === 2 && (!this.options.audio || !this.#audioInfoSeen || packet.duration <= 0n))) throw unavailable();
      const deadline = Date.now() + MEDIA_WORKER_LIMITS.requestMs;
      while (this.#count >= MEDIA_SESSION_LIMITS.queuedPackets || this.#bytes + size > MEDIA_SESSION_LIMITS.queuedBytes) {
        if (this.#space) throw unavailable();
        let wake!: () => void; const space = new Promise<void>(resolve => { wake = resolve; this.#space = resolve; });
        try { await withinRequestBudget(space, { signal: this.#cancel.signal, deadline }); }
        finally { if (this.#space === wake) this.#space = undefined; }
        this.#check();
      }
      this.#bytes += size; this.#count++;
      this.#queue.push({ ...packet, data: Buffer.from(packet.data) }); this.#queue.sort((a, b) => a.pts < b.pts ? -1 : a.pts > b.pts ? 1 : 0);
      if (packet.stream === 2) { this.#audioTiming.skipStartSamples += packet.skipStart; this.#audioTiming.skipEndSamples += packet.skipEnd; }
      this.#wake?.();
      if (!this.#pumping) this.#pumping = this.#pump().catch(() => { this.fail(); });
    } catch { this.fail(); throw unavailable(); }
    finally { signal.removeEventListener('abort', cancelled); }
  }
  #sourceNow(): bigint { return this.#origin + BigInt(Math.floor((globalThis.performance.now() - this.#anchor) * 1000)); }
  async #execute(operation: Promise<void>): Promise<void> {
    await withinRequestBudget(operation, { signal: this.#cancel.signal, deadline: Date.now() + MEDIA_WORKER_LIMITS.requestMs }); this.#check();
  }
  async #reports(final = false): Promise<void> {
    const mono = globalThis.performance.now(), unix = Date.now(), pts = this.#sourceNow();
    for (const stream of this.#streams) if (stream.sent && (final || stream.nextReport <= mono)) {
      this.#check(); await this.#execute(stream.rtp!.report(unix, pts)); stream.nextReport = mono + stream.options.rtcpInterval * 1000;
    }
  }
  #wait(ms: number): Promise<void> {
    this.#check();
    return new Promise((resolve, reject) => {
      const finish = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(unavailable()); };
      const cleanup = () => { globalThis.clearTimeout(timer); this.#cancel.signal.removeEventListener('abort', abort); if (this.#wake === finish) this.#wake = undefined; };
      const timer = globalThis.setTimeout(finish, Math.max(1, Math.min(1000, Math.ceil(ms))));
      this.#wake = finish; this.#cancel.signal.addEventListener('abort', abort, { once: true });
    });
  }
  async #pump(): Promise<void> {
    await budgetedDelay(MEDIA_SESSION_LIMITS.startupMs, { signal: this.#cancel.signal }); this.#check();
    this.#origin = this.#queue[0].pts; this.#anchor = globalThis.performance.now(); const cname = randomUUID();
    for (const stream of this.#streams) stream.rtp = new ProtectedRtpStream(stream.options, stream.codec,
      this.#origin, randomBytes(4).readUInt32BE(), randomBytes(2).readUInt16BE(), cname, stream.protector, stream.socket);
    for (;;) {
      this.#check(); if (this.#ending && !this.#queue.length) return;
      await this.#reports(); const mono = globalThis.performance.now(); const next = this.#queue[0];
      const reportDelay = Math.min(...this.#streams.filter(stream => stream.sent).map(stream => stream.nextReport - mono));
      if (!next) { await this.#wait(reportDelay); continue; }
      const offset = next.pts - this.#origin;
      if (offset > BigInt(MEDIA_WORKER_LIMITS.lifetimeMs) * 1000n || offset < -BigInt(MEDIA_WORKER_LIMITS.lifetimeMs) * 1000n) throw unavailable();
      const delay = this.#anchor + Number(offset) / 1000 - mono;
      if (delay > 0) { await this.#wait(Math.min(delay, reportDelay)); continue; }
      this.#queue.shift();
      try {
        const stream = this.#streams[next.stream - 1]; this.#check();
        await this.#execute(next.stream === 1 ? stream.rtp!.sendVideo(annexB(next.data), next.pts) : stream.rtp!.sendAudio(next.data, next.pts));
        if (!stream.sent) stream.nextReport = 0; stream.sent = true;
      } finally {
        this.#bytes -= next.data.length + 48; this.#count--; next.data.fill(0); this.#space?.();
      }
    }
  }
  async write(bytes: Buffer): Promise<void> {
    this.#check();
    if (this.#inputEnded || this.#feeding || !bytes.length || bytes.length > MEDIA_SESSION_LIMITS.vendorFrameBytes) throw unavailable();
    this.#feeding = true; const owned = Buffer.from(bytes);
    try {
      for (let offset = 0; offset < owned.length; offset += MEDIA_WORKER_LIMITS.inputBytes) {
        this.#check(); await this.#worker!.media(owned.subarray(offset, offset + MEDIA_WORKER_LIMITS.inputBytes));
      }
    } catch { this.fail(); await this.stop(); throw unavailable(); }
    finally { owned.fill(0); this.#feeding = false; }
  }
  async end(): Promise<void> {
    this.#check(); if (this.#inputEnded || this.#feeding) throw unavailable(); this.#inputEnded = true; this.#finishing = true;
    try {
      await this.#worker!.endMedia(); await this.#worker!.whenMediaDrained;
      this.#check(); this.#ending = true; this.#wake?.(); await this.#pumping; this.#check(); await this.#reports(true);
      await this.#worker!.finishInput(); if (this.#worker!.failed) throw unavailable(); await this.stop();
    } catch { this.fail(); await this.stop(); throw unavailable(); }
  }
  stop(): Promise<void> {
    if (!this.#stop) {
      this.#stop = this.whenClosed;
      this.#stopping = true; this.#cancel.abort();
      for (const packet of this.#queue.splice(0)) { this.#bytes -= packet.data.length + 48; this.#count--; packet.data.fill(0); }
      for (const stream of this.#streams) stream.rtp?.close();
      void this.#worker?.stop(); for (const socket of this.#sockets) socket.close();
      void (async () => {
        await this.#starting;
        void this.#worker?.stop(); for (const socket of this.#sockets) socket.close();
        await Promise.all([this.#worker?.whenClosed, ...this.#sockets.map(socket => socket.whenClosed)]);
        this.owner.removeEventListener('abort', this.#ownerAbort); this.#finishClosed();
      })().catch(() => { this.#failed = true; });
    }
    return this.#stop;
  }
}

/** Own one generation's private codec process and admitted controller transports. */
export async function createOwnedMediaSession(options: MediaSessionOptions, signal: globalThis.AbortSignal,
  dependencies: MediaSessionDependencies = {}): Promise<OwnedMediaSession> {
  try { signal.throwIfAborted(); validate(options); } catch { throw unavailable(); }
  const session = new Session(options, signal, dependencies);
  try { await session.start(); return session; }
  catch { session.fail(); await session.stop(); throw unavailable(); }
}
