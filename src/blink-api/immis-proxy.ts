/**
 * IMMIS Protocol Proxy Server
 *
 * Implements a private child-process stream that translates Blink's proprietary `immis://` protocol
 * to a standard MPEG-TS stream that FFmpeg consumes through stdin.
 *
 * The IMMIS protocol is a TLS-based proprietary streaming protocol used by modern Blink cameras.
 * It wraps MPEG-TS video data in custom packets with a 9-byte header.
 *
 * Protocol Reference:
 * - https://github.com/fronzbot/blinkpy/pull/1078
 * - https://github.com/jakecrowley/blink-immis-proxy
 * - https://github.com/amattu2/blink-liveview-middleware
 */

import { Buffer } from 'node:buffer';
import { Readable, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as tls from 'node:tls';
import { describeMediaDestination, resolveMediaDestination, MediaDestination, MediaAddress } from './media-destination';
import { URL } from 'node:url';
import { recordSecurityBoundaryEvent } from './network-diagnostics';

export interface ImmisProxyConfig {
  /** The immis:// URL from the liveview API response */
  immisUrl: string;
  /** Camera serial number for authentication */
  serial: string;
  /** Logger function */
  log?: (message: string) => void;
  errorLog?: (message: string) => void;
  /** Debug logging enabled */
  debug?: boolean;
  /** Save the raw MPEG-TS stream to disk for debugging (path to save directory) */
  saveStreamPath?: string;
  /** @deprecated Ignored: upstream TLS certificate and hostname verification is mandatory. */
  verifyTls?: boolean;
  /**
   * Promise that resolves when the Blink command is ready.
   * The proxy will wait for this before connecting to the immis server.
   * This prevents connection failures when the camera hasn't finished initializing.
   */
  waitForReady?: Promise<void>;
}

export interface ImmisProxyEvents {
  ready: [url: string];
  data: [chunk: Buffer];
  error: [error: Error];
  close: [];
  sessionMessage: [payload: Buffer];
}

/**
 * IMMIS Protocol message types
 */
const enum ImmisMessageType {
  /** Video stream data (MPEG-TS) */
  VIDEO = 0x00,
  /** Keep-alive packet */
  KEEPALIVE = 0x0a,
  /** Latency statistics */
  LATENCY_STATS = 0x12,
  /** Inline command (device control) */
  INLINE_COMMAND = 0x14,
  /** Accessory message */
  ACCESSORY_MESSAGE = 0x15,
  /** Session command (e.g., Start/Stop audio) */
  SESSION_COMMAND = 0x17,
  /** Session message (ACKs/updates) */
  SESSION_MESSAGE = 0x18,
}

/**
 * MPEG-TS sync byte - all MPEG-TS packets start with this
 */
const MPEGTS_SYNC_BYTE = 0x47;
const LOAS_SYNCWORD_BYTE_0 = 0x56;
const LOAS_SYNCWORD_MASK = 0xe0;
const LOAS_SYNCWORD_VALUE = 0xe0;
const LOAS_HEADER_LENGTH = 3;
const MAX_AUDIO_BUFFER_BYTES = 256 * 1024;
const IDLE_SHUTDOWN_GRACE_MS = 2000;
let recordingAdmission: Promise<void> = Promise.resolve();
const DEBUG_RECORDING_DIR = 'blink-stream-recordings';
const RECORDING_CAPTURE_BYTES = 64 * 1024 * 1024;
const RECORDING_TOTAL_BYTES = 256 * 1024 * 1024;
const RECORDING_NAME = /^blink-stream-[a-f0-9]{16}-.+-[a-f0-9]{16}\.ts$/;
const NO_FOLLOW_FLAG = fs.constants.O_NOFOLLOW ?? 0;
const DIRECTORY_OPEN_FLAGS = fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0) | NO_FOLLOW_FLAG;
type FileHandle = Awaited<ReturnType<typeof fs.promises.open>>;
type FsStats = Awaited<ReturnType<typeof fs.promises.lstat>>;

export interface LatmParseResult {
  frames: Buffer[];
  remainder: Buffer;
  discardedBytes: number;
}

const isSameFsEntry = (left: FsStats, right: FsStats): boolean => {
  return left.dev === right.dev && left.ino === right.ino;
};

/**
 * Extract LOAS/LATM frames from a buffer.
 *
 * LOAS header format:
 * - 11-bit syncword (0x2B7) => 0x56 + top 3 bits (0xE0)
 * - 13-bit frame length (audioMuxElement length, excludes 3-byte header)
 */
export function parseLatmFrames(buffer: Buffer): LatmParseResult {
  const frames: Buffer[] = [];
  let offset = 0;
  let discardedBytes = 0;

  const length = buffer.length;
  while (offset + LOAS_HEADER_LENGTH <= length) {
    if (
      buffer[offset] !== LOAS_SYNCWORD_BYTE_0 ||
      (buffer[offset + 1] & LOAS_SYNCWORD_MASK) !== LOAS_SYNCWORD_VALUE
    ) {
      offset += 1;
      discardedBytes += 1;
      continue;
    }

    const framePayloadLength =
      ((buffer[offset + 1] & 0x1f) << 8) | buffer[offset + 2];
    const frameLength = framePayloadLength + LOAS_HEADER_LENGTH;

    if (offset + frameLength > length) {
      break;
    }

    frames.push(Buffer.from(buffer.subarray(offset, offset + frameLength)));
    offset += frameLength;
  }

  const remainder = Buffer.from(buffer.subarray(offset));
  return { frames, remainder, discardedBytes };
}

/**
 * Auth header constants
 */
const SERIAL_MAX_LENGTH = 16;
const TOKEN_FIELD_MAX_LENGTH = 64;
const CONN_ID_MAX_LENGTH = 16;

/**
 * ImmisProxyServer owns a private MPEG-TS consumer and upstream TLS session.
 */
export class ImmisProxyServer extends EventEmitter<ImmisProxyEvents> {
  private readonly config: Required<Omit<ImmisProxyConfig, 'log' | 'errorLog' | 'debug' | 'saveStreamPath' | 'waitForReady'>> & Pick<ImmisProxyConfig, 'log' | 'errorLog' | 'debug' | 'saveStreamPath' | 'waitForReady'>;
  private readonly parsedUrl: URL;

  private consumer: Writable | null = null;
  private consumerCleanup: (() => void) | null = null;
  private incompleteTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private recordingTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private releaseRecording: (() => Promise<void>) | null = null;
  private readonly clientId: number;
  private streamFile: fs.WriteStream | null = null;
  private streamBytesWritten = 0;
  private targetSocket: tls.TLSSocket | null = null;
  private verifiedSocket: tls.TLSSocket | null = null;
  private candidates: readonly MediaAddress[] = [];
  private candidateIndex = 0;
  private reconnectChains = 0;
  private cancelHandshake: (() => void) | null = null;
  private readonly destination: MediaDestination;
  private resolving: Promise<void> | null = null;
  private resolutionController: globalThis.AbortController | null = null;
  private isRunning = false;
  private keepAliveInterval: ReturnType<typeof globalThis.setInterval> | null = null;
  private keepAliveSequence = 0;
  private isCommandReady = false;
  private readinessFailed = false;
  private recordingStart: Promise<void> | null = null;
  private readonly closingHandles = new Set<Promise<void>>();
  private reconnectTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;
  private idleShutdownTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;

  /** Buffer for accumulating incoming data from the immis server */
  private receiveBuffer = Buffer.alloc(0);
  /** Attached upstream audio source stream (LATM) */
  private audioInput: Readable | null = null;
  private audioCleanup: (() => void) | null = null;
  /** Buffer for assembling LOAS/LATM frames from audio input */
  private audioBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);

  constructor(config: ImmisProxyConfig) {
    super();

    this.destination = describeMediaDestination(config.immisUrl);
    this.parsedUrl = new URL(config.immisUrl);
    const clientId = this.parsedUrl.searchParams.get('client_id');
    if (clientId === null || !/^(0|[1-9][0-9]*)$/.test(clientId) || Number(clientId) > 0xffffffff) {
      throw new Error('IMMIS client_id must be a canonical uint32');
    }
    this.clientId = Number(clientId);

    this.config = {
      immisUrl: config.immisUrl,
      serial: config.serial,
      log: config.log,
      errorLog: config.errorLog,
      saveStreamPath: config.saveStreamPath,
      debug: config.debug,
      waitForReady: config.waitForReady,
      verifyTls: true,
    };

    // If a waitForReady promise is provided, set up the ready state handler
    if (this.config.waitForReady) {
      this.config.waitForReady.then(() => {
        this.log('Blink command is ready, enabling immis connections');
        this.isCommandReady = true;
        // Process any pending clients that were waiting
        if (this.isRunning && this.consumer && !this.targetSocket) this.connectToImmisServer();
      }).catch(() => {
        this.readinessFailed = true;
        if (this.isRunning) this.fail('Blink command readiness failed', 'worker_failure');
      });
    } else {
      // No waitForReady provided, assume ready immediately
      this.isCommandReady = true;
    }
  }

  /**
   * Log a message if logging is enabled
   */
  private log(message: string): void {
    try { this.config.log?.(`[ImmisProxy] ${message}`); } catch { /* Logging must not crash streaming. */ }
  }

  /**
   * Log a debug message if debug logging is enabled
   */
  private logError(message: string): void {
    try { (this.config.errorLog ?? this.config.log)?.(`[ImmisProxy] ${message}`); } catch { /* Ignore logger failure. */ }
  }

  private debug(message: string): void {
    if (this.config.debug) {
      this.log(`[DEBUG] ${message}`);
    }
  }

  /**
   * Start the proxy server
   * @returns The child process stdin URL when ready
   */
  async start(): Promise<string> {
    if (this.isRunning) throw new Error('Proxy server is already running');
    if (this.readinessFailed) throw new Error('Blink command readiness failed');
    this.isRunning = true;
    if (this.config.saveStreamPath) {
      this.recordingStart = this.startStreamRecording();
      try { await this.recordingStart; } finally { this.recordingStart = null; }
    }
    if (!this.isRunning) { this.stopStreamRecording(); throw new Error('Proxy stopped during startup'); }
    this.safeEmit('ready', 'pipe:0');
    return 'pipe:0';
  }

  /** Attach only the child process stdin owned by this session. No socket is exposed. */
  attachConsumer(consumer: Writable): void {
    if (!this.isRunning) throw new Error('Proxy is not running');
    if (consumer.destroyed || consumer.writableEnded) throw new Error('Consumer is closed');
    if (this.consumer) this.blockedWriters.get(this.consumer)?.();
    this.detachConsumer();
    this.cancelIdleShutdown();
    this.consumer = consumer;
    const detach = () => { if (this.consumer === consumer) this.detachConsumer(); };
    consumer.on('close', detach);
    consumer.on('error', detach);
    this.consumerCleanup = () => { consumer.off('close', detach); consumer.off('error', detach); };
    if (this.isCommandReady && !this.targetSocket) this.connectToImmisServer();
  }

  /** After stop(), resolves only after startup and owned transport/file handles close. */
  get whenClosed(): Promise<void> {
    return (async () => {
      while (this.recordingStart || this.resolving || this.closingHandles.size) {
        if (this.recordingStart) await this.recordingStart.catch(() => undefined);
        if (this.resolving) await this.resolving;
        await Promise.all([...this.closingHandles]);
      }
    })();
  }

  private trackClosure(handle: EventEmitter, afterClose?: () => Promise<void>): void {
    let closed!: Promise<void>;
    closed = new Promise<void>((resolve) => {
      handle.once('close', () => {
        void (afterClose?.() ?? Promise.resolve()).catch(() => {
          recordSecurityBoundaryEvent('recorder_refusal');
        }).finally(() => { this.closingHandles.delete(closed); resolve(); });
      });
    });
    this.closingHandles.add(closed);
  }

  detachConsumer(): void {
    if (this.consumer) this.blockedWriters.get(this.consumer)?.();
    this.consumerCleanup?.();
    this.consumerCleanup = null;
    this.consumer = null;
    if (this.isRunning) this.scheduleIdleShutdown();
  }

  private safeEmit(event: keyof ImmisProxyEvents, ...args: unknown[]): void {
    try { (this.emit as (...values: unknown[]) => boolean)(event, ...args); }
    catch { this.logError('IMMIS callback failed.'); }
  }

  private fail(message: string, reason: 'overflow' | 'worker_failure' = 'overflow'): void {
    recordSecurityBoundaryEvent(reason);
    this.safeEmit('error', new Error(message));
    this.stop();
  }

  /** Node Writable owns its queue; enforce its bound before each write. */
  private boundedWrite(writer: Writable, data: Buffer, limit: number, failure: () => void): void {
    if (writer.destroyed || writer.writableEnded || (writer.writableLength || 0) + data.length > limit) {
      failure(); return;
    }
    try {
      if (writer.write(data) === false && !this.blockedWriters.has(writer)) {
        const timer = globalThis.setTimeout(() => { cleanup(); failure(); }, 2000);
        const cleanup = () => {
          globalThis.clearTimeout(timer); writer.off('drain', cleanup); writer.off('close', cleanup);
          this.blockedWriters.delete(writer);
        };
        this.blockedWriters.set(writer, cleanup);
        writer.once('drain', cleanup); writer.once('close', cleanup);
      }
    } catch { failure(); }
  }
  private blockedWriters = new Map<Writable, () => void>();

  private writeUpstream(data: Buffer): void {
    if (this.isRunning && this.targetSocket && this.targetSocket === this.verifiedSocket) this.boundedWrite(this.targetSocket, data, 1024 * 1024,
      () => this.fail('IMMIS upstream writer exceeded its budget'));
  }

  /**
   * Start recording the stream to a file
   */
  private async startStreamRecording(): Promise<void> {
    if (!this.config.saveStreamPath) {
      return;
    }

    const previousAdmission = recordingAdmission;
    let releaseAdmission!: () => void;
    recordingAdmission = new Promise<void>((resolve) => { releaseAdmission = resolve; });
    await previousAdmission;
    let recordingDirHandle: FileHandle | null = null;
    let admissionHandle: FileHandle | null = null;
    let removeAdmission: (() => Promise<void>) | null = null;
    try {
      const recordingDir = path.join(this.config.saveStreamPath, DEBUG_RECORDING_DIR);
      await fs.promises.mkdir(recordingDir, { recursive: true, mode: 0o700 });
      const recordingDirPathStats = await fs.promises.lstat(recordingDir);
      if (recordingDirPathStats.isSymbolicLink() || !recordingDirPathStats.isDirectory()) {
        throw new Error('Debug stream recording directory must be a real directory');
      }
      recordingDirHandle = await fs.promises.open(recordingDir, DIRECTORY_OPEN_FLAGS);
      const recordingDirStats = await recordingDirHandle.stat();
      if (!recordingDirStats.isDirectory() || !isSameFsEntry(recordingDirPathStats, recordingDirStats)) {
        throw new Error('Debug stream recording directory changed while opening');
      }
      try {
        await recordingDirHandle.chmod(0o700);
      } catch {
        this.logError('Failed to set debug recording directory permissions.');
      }

      // Exclusive lock coordinates every process sharing this owned directory.
      // Busy or crashed locks refuse recording immediately; never steal a lock.
      const admissionPath = path.join(recordingDir, '.admission.lock');
      admissionHandle = await fs.promises.open(admissionPath,
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NO_FOLLOW_FLAG, 0o600);
      const admissionStats = await admissionHandle.stat();
      const removeOwnedMetadata = async (filename: string, createdStats: FsStats): Promise<void> => {
        const directory = await fs.promises.lstat(recordingDir);
        const entry = await fs.promises.lstat(filename);
        if (!directory.isDirectory() || directory.isSymbolicLink() || !isSameFsEntry(directory, recordingDirStats)
          || !entry.isFile() || entry.isSymbolicLink() || !isSameFsEntry(entry, createdStats)) {
          throw new Error('Recording metadata ownership changed');
        }
        await fs.promises.unlink(filename);
      };
      removeAdmission = () => removeOwnedMetadata(admissionPath, admissionStats);
      const entries = await fs.promises.readdir(recordingDir);
      const captures = new Map<string, number>();
      const reservations = new Set<string>();
      for (const entry of entries) {
        const reservation = entry.endsWith('.reserve') && RECORDING_NAME.test(entry.slice(0, -8));
        if (!RECORDING_NAME.test(entry) && !reservation) continue;
        const stats = await fs.promises.lstat(path.join(recordingDir, entry));
        if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('Unsafe recording quota entry');
        if (reservation) reservations.add(entry.slice(0, -8));
        else captures.set(entry, stats.size);
      }
      let committedBytes = 0;
      for (const [entry, bytes] of captures) committedBytes += reservations.has(entry)
        ? Math.max(RECORDING_CAPTURE_BYTES, bytes) : bytes;
      for (const entry of reservations) if (!captures.has(entry)) committedBytes += RECORDING_CAPTURE_BYTES;
      if (committedBytes + RECORDING_CAPTURE_BYTES > RECORDING_TOTAL_BYTES) {
        throw new Error('Debug recording aggregate budget exhausted');
      }
      // Reserve the whole permitted capture before opening it. Empty persistent
      // markers remain charged after crashes; recording cannot exceed that charge.
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const serialHash = createHash('sha256').update(this.config.serial).digest('hex').slice(0, 16);
      const randomSuffix = randomBytes(8).toString('hex');
      const filename = path.join(recordingDir, `blink-stream-${serialHash}-${timestamp}-${randomSuffix}.ts`);
      const reservationPath = `${filename}.reserve`;
      const reservationHandle = await fs.promises.open(reservationPath,
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NO_FOLLOW_FLAG, 0o600);
      let reservationStats: FsStats;
      try { reservationStats = await reservationHandle.stat(); } finally { await reservationHandle.close(); }
      let released = false;
      const releaseRecording = async (): Promise<void> => {
        if (released) return;
        released = true;
        await removeOwnedMetadata(reservationPath, reservationStats);
      };
      this.releaseRecording = releaseRecording;

      let recordingFd: number | null = null;
      try {
        recordingFd = await new Promise<number>((resolve, reject) => {
          fs.open(
            filename,
            fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NO_FOLLOW_FLAG,
            0o600,
            (error, fd) => {
              if (error) {
                reject(error);
                return;
              }
              resolve(fd);
            },
          );
        });
        const currentRecordingDirStats = await fs.promises.lstat(recordingDir);
        if (
          currentRecordingDirStats.isSymbolicLink() ||
          !currentRecordingDirStats.isDirectory() ||
          currentRecordingDirStats.dev !== recordingDirStats.dev ||
          currentRecordingDirStats.ino !== recordingDirStats.ino
        ) {
          throw new Error('Debug stream recording directory changed while opening recording file');
        }

        this.streamFile = fs.createWriteStream(filename, { fd: recordingFd, autoClose: true });
        this.trackClosure(this.streamFile, releaseRecording);
        Object.defineProperty(this.streamFile, 'path', { value: filename });
        recordingFd = null;
      } catch (error) {
        const fdToClose = recordingFd;
        if (fdToClose !== null) {
          await new Promise<void>((resolve) => fs.close(fdToClose, () => resolve()));
        }

        throw error;
      }
      this.streamBytesWritten = 0;
      this.recordingTimer = globalThis.setTimeout(() => this.stopStreamRecording(), 5 * 60 * 1000);
      this.recordingTimer.unref();

      this.log(`Recording stream to: ${filename}`);

      this.streamFile.on('error', () => {
        this.logError('Stream recording error.');
        this.stopStreamRecording();
      });
    } catch {
      await this.releaseRecording?.().catch(() => undefined);
      this.releaseRecording = null;
      recordSecurityBoundaryEvent('recorder_refusal');
      this.logError('Failed to start stream recording.');
    } finally {
      await admissionHandle?.close().catch(() => undefined);
      await removeAdmission?.().catch(() => { recordSecurityBoundaryEvent('recorder_refusal'); });
      await recordingDirHandle?.close().catch(() => undefined);
      releaseAdmission();
    }
  }

  /**
   * Stop recording the stream
   */
  private stopStreamRecording(): void {
    if (this.recordingTimer) globalThis.clearTimeout(this.recordingTimer);
    this.recordingTimer = null;
    if (this.streamFile) {
      const stream = this.streamFile;
      this.releaseRecording = null;
      this.blockedWriters.get(stream)?.();
      stream.destroy();
      this.log(`Stream recording stopped. Total bytes written: ${this.streamBytesWritten}`);
      this.streamFile = null;
    }
  }

  /**
   * Get the local URL of the proxy server
   */
  get url(): string | null { return this.isRunning ? 'pipe:0' : null; }
  get isServing(): boolean { return this.isRunning; }

  private cancelIdleShutdown(): void {
    if (this.idleShutdownTimeout) {
      globalThis.clearTimeout(this.idleShutdownTimeout);
      this.idleShutdownTimeout = null;
    }
  }

  private scheduleIdleShutdown(): void {
    this.cancelIdleShutdown();
    this.idleShutdownTimeout = globalThis.setTimeout(() => {
      this.idleShutdownTimeout = null;
      if (!this.consumer && this.isRunning) {
        this.log('Idle reconnect grace expired, stopping proxy');
        this.stop();
      }
    }, IDLE_SHUTDOWN_GRACE_MS);
  }

  /**
   * Connect to the Blink immis server via TLS
   */
  private connectToImmisServer(): void {
    if (!this.isRunning || !this.isCommandReady || !this.consumer || this.targetSocket || this.resolving) return;
    const controller = new globalThis.AbortController();
    this.resolutionController = controller;
    const pending = (async () => {
      try {
        const destination = await resolveMediaDestination(this.destination, controller.signal);
        if (controller.signal.aborted || !this.isRunning || !this.consumer) return;
        const distinct = destination.addresses.filter((item, index, all) =>
          all.findIndex(other => other.address === item.address) === index);
        const otherFamily = distinct.find(item => item.family !== distinct[0].family);
        this.candidates = [distinct[0], ...(otherFamily ? [otherFamily] : []),
          ...distinct.filter(item => item !== distinct[0] && item !== otherFamily)].slice(0, 3);
        this.candidateIndex = 0;
        this.openImmisSocket(this.candidates[0].address, destination.servername);
      } catch {
        if (!controller.signal.aborted && this.isRunning) {
          recordSecurityBoundaryEvent('destination_rejection');
          this.safeEmit('error', new Error('IMMIS destination connection refused'));
          this.stop();
        }
      } finally {
        if (this.resolutionController === controller) {
          this.resolutionController = null;
          this.resolving = null;
        }
      }
    })();
    this.resolving = pending;
  }

  private openImmisSocket(address: string, hostname: string): void {
    if (!this.isRunning || !this.consumer) return;
    let verified = false;
    let handshakeFailed = false;
    let socket: tls.TLSSocket;
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const clearHandshake = () => {
      globalThis.clearTimeout(timer);
      if (this.cancelHandshake === clearHandshake) this.cancelHandshake = null;
    };
    const refuseHandshake = () => {
      if (handshakeFailed || verified) return;
      handshakeFailed = true;
      clearHandshake();
      this.cancelHandshake = clearHandshake;
      timer = globalThis.setTimeout(() => {
        if (this.isRunning && this.targetSocket === socket) {
          this.fail('IMMIS failed handshake did not close', 'worker_failure');
        }
      }, 2000);
      socket.destroy();
    };
    try { socket = tls.connect(
      {
        host: address,
        port: 443,
        rejectUnauthorized: true,
        servername: hostname,
        minVersion: 'TLSv1.2',
      },
      () => {
        if (!this.isRunning || this.targetSocket !== socket || handshakeFailed) return;
        if (socket.authorized !== true) { refuseHandshake(); return; }
        verified = true;
        this.verifiedSocket = socket;
        clearHandshake();
        this.log('TLS connection established');

        // Send authentication header
        const authHeader = this.buildAuthHeader();
        this.debug(`Sending auth header (${authHeader.length} bytes)`);
        if (!this.isRunning || this.targetSocket !== socket) return;
        this.writeUpstream(authHeader);

        // Start keep-alive timer
        if (this.isRunning) this.startKeepAlive();
      },
    ); } catch {
      this.fail('IMMIS TLS connection failed', 'worker_failure');
      return;
    }
    this.cancelHandshake = clearHandshake;
    timer = globalThis.setTimeout(refuseHandshake, 5000);
    this.targetSocket = socket;
    this.trackClosure(socket);
    socket.on('data', (data: Buffer) => {
      if (verified && this.isRunning && this.targetSocket === socket) this.handleImmisData(data);
    });

    socket.on('error', (error) => {
      if (!this.isRunning || this.targetSocket !== socket) return;
      if (!verified) { refuseHandshake(); return; }
      // Ignore APPLICATION_DATA_AFTER_CLOSE_NOTIFY SSL errors
      if (error.message.includes('APPLICATION_DATA_AFTER_CLOSE_NOTIFY')) {
        this.debug('Ignoring SSL close notify error');
        return;
      }
      this.log('IMMIS TLS connection failed');
      this.safeEmit('error', new Error('IMMIS TLS connection failed'));
    });

    socket.on('close', () => {
      clearHandshake();
      if (this.verifiedSocket === socket) this.verifiedSocket = null;
      if (this.targetSocket !== socket) return;
      this.blockedWriters.get(socket)?.();
      this.debug('Immis connection closed');
      if (this.keepAliveInterval) globalThis.clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      this.receiveBuffer = Buffer.alloc(0);
      if (this.incompleteTimer) globalThis.clearTimeout(this.incompleteTimer);
      this.incompleteTimer = null;
      // Clear current socket reference
      this.targetSocket = null;
      if (!verified && this.isRunning && this.consumer) {
        this.candidateIndex++;
        if (this.candidateIndex < this.candidates.length) {
          this.openImmisSocket(this.candidates[this.candidateIndex].address, hostname);
        } else {
          this.fail('IMMIS TLS candidates exhausted', 'worker_failure');
        }
        return;
      }
      // If clients are still connected, retry connecting after a short delay
      if (this.isRunning && this.consumer !== null) {
        if (++this.reconnectChains > 3) {
          this.fail('IMMIS reconnect budget exhausted', 'worker_failure');
          return;
        }
        if (this.reconnectTimeout) {
          globalThis.clearTimeout(this.reconnectTimeout);
        }
        this.reconnectTimeout = globalThis.setTimeout(() => {
          // Avoid multiple retries if a connection was established in the meantime
          if (!this.targetSocket && this.isRunning && this.consumer !== null) {
            this.log('Retrying immis connection...');
            this.connectToImmisServer();
          }
        }, 2000);
      } else if (this.isRunning) {
        this.debug(`Immis connection closed with no active clients; waiting ${IDLE_SHUTDOWN_GRACE_MS}ms for reconnect`);
        this.scheduleIdleShutdown();
      }
    });
  }

  /**
   * Build the 122-byte authentication header for the immis protocol
   */
  private buildAuthHeader(): Buffer {
    const header = Buffer.alloc(122);
    let offset = 0;

    // Magic number (4 bytes)
    header.writeUInt32BE(0x00000028, offset);
    offset += 4;

    // Device Serial field (4-byte length prefix + 16-byte serial)
    header.writeUInt32BE(SERIAL_MAX_LENGTH, offset);
    offset += 4;
    const serialBytes = Buffer.alloc(SERIAL_MAX_LENGTH);
    serialBytes.write(this.config.serial.substring(0, SERIAL_MAX_LENGTH), 'utf-8');
    serialBytes.copy(header, offset);
    offset += SERIAL_MAX_LENGTH;

    // Client ID field (4 bytes, big-endian)
    const clientId = this.clientId;
    this.debug('Client ID: <redacted>');
    header.writeUInt32BE(clientId, offset);
    offset += 4;

    // Static field (2 bytes)
    header.writeUInt8(0x01, offset);
    offset += 1;
    header.writeUInt8(0x08, offset);
    offset += 1;

    // Auth Token field (4-byte length prefix + 64 null bytes)
    header.writeUInt32BE(TOKEN_FIELD_MAX_LENGTH, offset);
    offset += 4;
    // Token bytes are already zero from Buffer.alloc
    offset += TOKEN_FIELD_MAX_LENGTH;

    // Connection ID field (4-byte length prefix + 16-byte conn_id)
    header.writeUInt32BE(CONN_ID_MAX_LENGTH, offset);
    offset += 4;
    const pathParts = this.parsedUrl.pathname.split('/');
    const fullConnId = pathParts[pathParts.length - 1]?.split('__')[0] ?? '';
    const connIdBytes = Buffer.alloc(CONN_ID_MAX_LENGTH);
    connIdBytes.write(fullConnId.substring(0, CONN_ID_MAX_LENGTH), 'utf-8');
    this.debug('Connection ID: <redacted>');
    connIdBytes.copy(header, offset);
    offset += CONN_ID_MAX_LENGTH;

    // Trailer (4 bytes)
    header.writeUInt32BE(0x00000001, offset);

    this.debug(`Auth header built: ${header.length} bytes`);
    return header;
  }

  /**
   * Handle incoming data from the immis server
   */
  private handleImmisData(data: Buffer): void {
    if (this.receiveBuffer.length + data.length > 2 * 1024 * 1024) {
      this.fail('IMMIS receive buffer exceeded its budget'); return;
    }
    // Append to receive buffer
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);

    // Process complete packets
    while (this.receiveBuffer.length >= 9) {
      // Read 9-byte header
      const msgtype = this.receiveBuffer.readUInt8(0);
      const sequence = this.receiveBuffer.readUInt32BE(1);
      const payloadLength = this.receiveBuffer.readUInt32BE(5);

      this.debug(`Packet: msgtype=${msgtype}, sequence=${sequence}, payloadLength=${payloadLength}`);

      if (payloadLength > 1024 * 1024) {
        this.fail('IMMIS frame exceeded its budget'); return;
      }
      // Check if we have the complete packet
      if (this.receiveBuffer.length < 9 + payloadLength) {
        // Wait for more data
        break;
      }

      // Extract payload
      const payload = this.receiveBuffer.subarray(9, 9 + payloadLength);

      // Remove processed packet from buffer
      this.receiveBuffer = this.receiveBuffer.subarray(9 + payloadLength);

      if (this.incompleteTimer) globalThis.clearTimeout(this.incompleteTimer);
      this.incompleteTimer = null;
      // Handle different message types
      if (msgtype === ImmisMessageType.VIDEO) {
        // Skip packets without valid MPEG-TS sync byte
        if (payloadLength > 0 && payload[0] === MPEGTS_SYNC_BYTE) {
          this.forwardToClients(payload);
        } else if (payloadLength > 0) {
          this.debug(`Skipping video payload missing MPEG-TS sync byte`);
        }
      } else if (msgtype === ImmisMessageType.SESSION_MESSAGE) {
        // Session messages are control-plane updates/ACKs.
        // We don't parse the payload yet; log for telemetry.
        this.debug(`Received SESSION_MESSAGE (sequence=${sequence}, len=${payloadLength})`);
        this.safeEmit('sessionMessage', Buffer.from(payload));
      } else if (msgtype === ImmisMessageType.SESSION_COMMAND) {
        // Rare: server-originated session commands (mirror or multi-client scenarios)
        this.debug(`Received SESSION_COMMAND (sequence=${sequence}, len=${payloadLength})`);
      } else if (msgtype === ImmisMessageType.INLINE_COMMAND) {
        this.debug(`Received INLINE_COMMAND (sequence=${sequence}, len=${payloadLength})`);
      } else if (msgtype === ImmisMessageType.ACCESSORY_MESSAGE) {
        this.debug(`Received ACCESSORY_MESSAGE (sequence=${sequence}, len=${payloadLength})`);
      } else {
        this.debug(`Skipping non-video msgtype: ${msgtype}`);
      }
    }
    if (this.receiveBuffer.length && !this.incompleteTimer) {
      this.incompleteTimer = globalThis.setTimeout(() => this.fail('IMMIS incomplete frame timed out'), 5000);
    }
  }

  /**
   * Forward MPEG-TS data to the private child and optional bounded recorder
   */
  private forwardToClients(data: Buffer): void {
    this.safeEmit('data', data);
    if (this.streamFile && !this.streamFile.destroyed) {
      if (this.streamBytesWritten + data.length > 64 * 1024 * 1024) {
        recordSecurityBoundaryEvent('recorder_refusal');
        this.stopStreamRecording();
      }
      else {
        this.boundedWrite(this.streamFile, data, 256 * 1024, () => {
          recordSecurityBoundaryEvent('recorder_refusal');
          this.stopStreamRecording();
        });
        this.streamBytesWritten += data.length;
      }
    }
    if (this.consumer) this.boundedWrite(this.consumer, data, 1024 * 1024,
      () => this.fail('IMMIS consumer exceeded its budget'));
  }

  /**
   * Start the keep-alive timer
   */
  private startKeepAlive(): void {
    // Send latency stats every second and keep-alive every 10 seconds
    let secondCounter = 0;
    this.keepAliveInterval = globalThis.setInterval(() => {
      secondCounter++;
      if (secondCounter % 10 === 0) {
        this.keepAliveSequence++;
        this.sendKeepAlive();
      }
      this.sendLatencyStats();
    }, 1000);
  }

  /**
   * Send a keep-alive packet to the immis server
   */
  private sendKeepAlive(): void {
    if (!this.targetSocket || this.targetSocket.destroyed) {
      return;
    }

    const packet = Buffer.alloc(9);
    packet.writeUInt8(ImmisMessageType.KEEPALIVE, 0);
    packet.writeUInt32BE(this.keepAliveSequence, 1);
    packet.writeUInt32BE(0, 5); // No payload

    this.debug(`Sending keep-alive (sequence=${this.keepAliveSequence})`);
    this.writeUpstream(packet);
  }

  /**
   * Send latency statistics packet to the immis server
   */
  private sendLatencyStats(): void {
    if (!this.targetSocket || this.targetSocket.destroyed) {
      return;
    }

    // 9-byte header + 24-byte payload
    const packet = Buffer.alloc(33);
    packet.writeUInt8(ImmisMessageType.LATENCY_STATS, 0);
    packet.writeUInt32BE(1000, 1); // Static sequence
    packet.writeUInt32BE(24, 5); // Payload length
    // Payload is all zeros (stats we don't track)

    this.debug('Sending latency stats');
    this.writeUpstream(packet);
  }

  /**
   * Send a SESSION_COMMAND to the immis server.
   * Note: Payload structure is not yet confirmed for Start/Stop audio; we always prefix
   * the payload with the command ID to ensure the server can route the request.
   * @param commandId Numeric command ID (e.g., 3 = StartAudio, 4 = StopAudio)
   * @param payload Optional payload buffer (default: empty)
   */
  private sendSessionCommand(commandId: number, payload?: Buffer): void {
    if (!this.targetSocket || this.targetSocket.destroyed) {
      return;
    }

    const body = payload ?? Buffer.alloc(0);
    const commandPrefix = Buffer.from([commandId & 0xff]);
    const fullPayload = body.length > 0 ? Buffer.concat([commandPrefix, body]) : commandPrefix;
    // Build 9-byte header for SESSION_COMMAND
    const packet = Buffer.alloc(9 + fullPayload.length);
    packet.writeUInt8(ImmisMessageType.SESSION_COMMAND, 0);
    // Sequence can reuse keepAliveSequence for monotonicity
    packet.writeUInt32BE(++this.keepAliveSequence, 1);
    packet.writeUInt32BE(fullPayload.length, 5);
    if (fullPayload.length) {
      fullPayload.copy(packet, 9);
    }

    this.debug(`Sending SESSION_COMMAND (id=${commandId}, len=${fullPayload.length})`);
    this.writeUpstream(packet);
  }

  /** Request to start two-way audio (scaffold). */
  startAudio(): void {
    // Known command IDs: StartAudio = 3
    // Payload structure TBD; send empty body for now and rely on device to complete via microphone request.
    this.audioBuffer = Buffer.alloc(0);
    this.sendSessionCommand(3);
  }

  /** Request to stop two-way audio (scaffold). */
  stopAudio(): void {
    // Known command IDs: StopAudio = 4
    this.sendSessionCommand(4);
    this.audioBuffer = Buffer.alloc(0);
  }

  /**
   * Attach a readable stream that provides AAC-LATM (LOAS/LATM) frames to be uplinked.
   * Chunks are re-framed into complete LOAS frames before being sent as SESSION_MESSAGE
   * payloads to preserve frame boundaries and sequencing.
   *
   * @param stream Readable stream producing LOAS/LATM frames
   */
  attachAudioInput(stream: Readable): void {
    if (this.audioInput === stream) {
      return;
    }
    this.audioCleanup?.();
    this.audioBuffer = Buffer.alloc(0);
    this.audioInput = stream;
    this.debug('Attached upstream audio input stream (LATM)');

    let totalBytes = 0;
    const onData = (chunk: Buffer) => {
      if (!this.isRunning || this.audioInput !== stream) return;
      totalBytes += chunk.length;
      if (chunk.length + this.audioBuffer.length > MAX_AUDIO_BUFFER_BYTES) {
        this.audioBuffer = Buffer.alloc(0); return;
      }
      this.audioBuffer = Buffer.concat([this.audioBuffer, chunk]);
      if (this.audioBuffer.length > MAX_AUDIO_BUFFER_BYTES) {
        this.debug(`Audio buffer exceeded ${MAX_AUDIO_BUFFER_BYTES} bytes; dropping buffered audio`);
        this.audioBuffer = Buffer.alloc(0);
      }

      const { frames, remainder, discardedBytes } = parseLatmFrames(this.audioBuffer);
      if (discardedBytes > 0) {
        this.debug(`Discarded ${discardedBytes} bytes before LOAS sync`);
      }
      this.audioBuffer = remainder;

      for (const frame of frames) {
        try {
          this.sendLatmFrame(frame);
        } catch (error) {
          this.debug(`Failed to send LATM frame: ${(error as Error).message}`);
        }
      }
    };

    const onError = (error: Error) => {
      this.debug(`Audio input stream error: ${error.message}`);
    };

    const onClose = () => {
      this.debug(`Audio input stream closed after ${totalBytes} bytes`);
      if (this.audioInput === stream) {
        this.audioInput = null;
      }
      if (this.audioBuffer.length > 0) {
        this.debug(`Dropping ${this.audioBuffer.length} buffered bytes after stream close`);
        this.audioBuffer = Buffer.alloc(0);
      }
      this.audioCleanup?.();
    };
    stream.on('data', onData);
    stream.on('error', onError);
    stream.on('close', onClose);
    this.audioCleanup = () => {
      stream.off('data', onData); stream.off('error', onError); stream.off('close', onClose);
      this.audioCleanup = null;
    };
  }

  /**
   * Forward a single LOAS/LATM frame to the immis server.
   * NOTE: Payload structure is provisional. We encapsulate LOAS frames
   * inside a SESSION_MESSAGE (type=0x18) packet with monotonically increasing sequence numbers.
   */
  private sendLatmFrame(latm: Buffer): void {
    if (!this.targetSocket || this.targetSocket.destroyed) {
      return;
    }
    const header = Buffer.alloc(9);
    header.writeUInt8(ImmisMessageType.SESSION_MESSAGE, 0);
    header.writeUInt32BE(++this.keepAliveSequence, 1);
    header.writeUInt32BE(latm.length, 5);
    const packet = Buffer.concat([header, latm]);
    this.writeUpstream(packet);
    this.debug(`Sent LATM frame (${latm.length} bytes)`);
  }

  /**
   * Stop the proxy server and clean up all connections
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.resolutionController?.abort();
    this.cancelHandshake?.();
    this.candidates = [];
    this.verifiedSocket = null;
    this.log('Stopping proxy server');

    // Stop stream recording
    this.stopStreamRecording();

    // Stop keep-alive timer
    if (this.keepAliveInterval) {
      globalThis.clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    // Cancel any pending reconnect
    if (this.reconnectTimeout) {
      globalThis.clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.cancelIdleShutdown();

    // Close target connection
    const socket = this.targetSocket;
    this.targetSocket = null;
    if (socket && !socket.destroyed) socket.destroy();

    this.detachConsumer();
    for (const cleanup of this.blockedWriters.values()) cleanup();
    if (this.incompleteTimer) globalThis.clearTimeout(this.incompleteTimer);
    this.incompleteTimer = null;
    this.audioCleanup?.();
    this.audioInput = null;
    this.audioBuffer = Buffer.alloc(0);

    this.receiveBuffer = Buffer.alloc(0);
    this.safeEmit('close');
    this.log('Proxy server stopped');
  }
}
