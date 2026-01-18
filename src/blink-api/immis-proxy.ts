/**
 * IMMIS Protocol Proxy Server
 *
 * Implements a local TCP proxy that translates Blink's proprietary `immis://` protocol
 * to a standard MPEG-TS stream that FFmpeg can consume.
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
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { setInterval, clearInterval, setTimeout, clearTimeout } from 'node:timers';
import * as tls from 'node:tls';
import { URL } from 'node:url';

export interface ImmisProxyConfig {
  /** The immis:// URL from the liveview API response */
  immisUrl: string;
  /** Camera serial number for authentication */
  serial: string;
  /** Local host to bind the proxy server to */
  host?: string;
  /** Local port to bind the proxy server to (0 = random) */
  port?: number;
  /** Logger function */
  log?: (message: string) => void;
  /** Debug logging enabled */
  debug?: boolean;
  /** Save the raw MPEG-TS stream to disk for debugging (path to save directory) */
  saveStreamPath?: string;
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

/**
 * Auth header constants
 */
const SERIAL_MAX_LENGTH = 16;
const TOKEN_FIELD_MAX_LENGTH = 64;
const CONN_ID_MAX_LENGTH = 16;

/**
 * ImmisProxyServer - Local TCP proxy for Blink's immis:// protocol
 *
 * Creates a local TCP server that FFmpeg can connect to. When a client connects,
 * establishes a TLS connection to Blink's immis server, sends the authentication
 * header, and proxies the decoded MPEG-TS stream to the client.
 */
export class ImmisProxyServer extends EventEmitter<ImmisProxyEvents> {
  private readonly config: Required<Omit<ImmisProxyConfig, 'log' | 'debug' | 'saveStreamPath' | 'waitForReady'>> & Pick<ImmisProxyConfig, 'log' | 'debug' | 'saveStreamPath' | 'waitForReady'>;
  private readonly parsedUrl: URL;

  private server: net.Server | null = null;
  private clients: net.Socket[] = [];
  private streamFile: fs.WriteStream | null = null;
  private streamBytesWritten = 0;
  private targetSocket: tls.TLSSocket | null = null;
  private isRunning = false;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private keepAliveSequence = 0;
  private isCommandReady = false;
  private pendingClients: net.Socket[] = [];
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Buffer for accumulating incoming data from the immis server */
  private receiveBuffer = Buffer.alloc(0);
  /** Attached upstream audio source stream (LATM) */
  private audioInput: Readable | null = null;

  constructor(config: ImmisProxyConfig) {
    super();

    this.parsedUrl = new URL(config.immisUrl.replace('immis://', 'https://'));

    this.config = {
      immisUrl: config.immisUrl,
      serial: config.serial,
      host: config.host ?? '127.0.0.1',
      port: config.port ?? 0,
      log: config.log,
      saveStreamPath: config.saveStreamPath,
      debug: config.debug,
      waitForReady: config.waitForReady,
    };

    // If a waitForReady promise is provided, set up the ready state handler
    if (this.config.waitForReady) {
      this.config.waitForReady.then(() => {
        this.log('Blink command is ready, enabling immis connections');
        this.isCommandReady = true;
        // Process any pending clients that were waiting
        this.processPendingClients();
      }).catch((error) => {
        this.log(`Blink command ready check failed: ${error}`);
        // Still allow connections even if ready check fails
        this.isCommandReady = true;
        this.processPendingClients();
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
    this.config.log?.(`[ImmisProxy] ${message}`);
  }

  /**
   * Log a debug message if debug logging is enabled
   */
  private debug(message: string): void {
    if (this.config.debug) {
      this.log(`[DEBUG] ${message}`);
    }
  }

  /**
   * Start the proxy server
   * @returns Promise that resolves with the local TCP URL when ready
   */
  async start(): Promise<string> {
    if (this.isRunning) {
      throw new Error('Proxy server is already running');
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((clientSocket) => {
        this.handleClient(clientSocket);
      });

      this.server.on('error', (error) => {
        this.log(`Server error: ${error.message}`);
        reject(error);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        const address = this.server!.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to get server address'));
          return;
        }

        this.isRunning = true;
        const url = `tcp://${address.address}:${address.port}`;
        this.log(`Proxy server listening on ${url}`);

        // Create stream recording file if saveStreamPath is configured
        if (this.config.saveStreamPath) {
          this.startStreamRecording();
        }

        this.emit('ready', url);
        resolve(url);
      });
    });
  }

  /**
   * Start recording the stream to a file
   */
  private startStreamRecording(): void {
    if (!this.config.saveStreamPath) {
      return;
    }

    try {
      // Create directory if it doesn't exist
      fs.mkdirSync(this.config.saveStreamPath, { recursive: true });

      // Create timestamped filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = path.join(this.config.saveStreamPath, `blink-stream-${this.config.serial}-${timestamp}.ts`);

      this.streamFile = fs.createWriteStream(filename);
      this.streamBytesWritten = 0;

      this.log(`Recording stream to: ${filename}`);

      this.streamFile.on('error', (error) => {
        this.log(`Stream recording error: ${error.message}`);
        this.stopStreamRecording();
      });
    } catch (error) {
      this.log(`Failed to start stream recording: ${error}`);
    }
  }

  /**
   * Stop recording the stream
   */
  private stopStreamRecording(): void {
    if (this.streamFile) {
      this.streamFile.end();
      this.log(`Stream recording stopped. Total bytes written: ${this.streamBytesWritten}`);
      this.streamFile = null;
    }
  }

  /**
   * Get the local URL of the proxy server
   */
  get url(): string | null {
    if (!this.server || !this.isRunning) {
      return null;
    }

    const address = this.server.address();
    if (!address || typeof address === 'string') {
      return null;
    }

    return `tcp://${address.address}:${address.port}`;
  }

  /**
   * Check if the proxy server is running
   */
  get isServing(): boolean {
    return this.isRunning && this.server !== null;
  }

  /**
   * Handle a new client connection
   */
  private handleClient(clientSocket: net.Socket): void {
    this.log('Client connected');
    this.clients.push(clientSocket);

    clientSocket.on('close', () => {
      this.debug('Client disconnected');
      this.clients = this.clients.filter((c) => c !== clientSocket);
      this.pendingClients = this.pendingClients.filter((c) => c !== clientSocket);

      // Stop everything if no clients remain
      if (this.clients.length === 0) {
        this.log('Last client disconnected, stopping proxy');
        this.stop();
      }
    });

    clientSocket.on('error', (error) => {
      this.debug(`Client error: ${error.message}`);
    });

    // If the Blink command isn't ready yet, still attempt the immis connection.
    // The immis server may close early; we'll retry until the command is ready.
    if (!this.isCommandReady) {
      this.debug('Blink command not ready yet; attempting immis connection and will retry until ready');
    }

    // Start the connection to the immis server if not already connected
    if (!this.targetSocket) {
      this.connectToImmisServer();
    }
  }

  /**
   * Process pending clients once the Blink command is ready
   */
  private processPendingClients(): void {
    if (this.pendingClients.length === 0) {
      return;
    }

    this.debug(`Processing ${this.pendingClients.length} pending clients`);

    // Start the connection to the immis server if not already connected
    if (!this.targetSocket) {
      this.connectToImmisServer();
    }

    // Clear the pending queue
    this.pendingClients = [];
  }

  /**
   * Connect to the Blink immis server via TLS
   */
  private connectToImmisServer(): void {
    const hostname = this.parsedUrl.hostname;
    const port = parseInt(this.parsedUrl.port, 10) || 443;

    this.log(`Connecting to immis server: ${hostname}:${port}`);

    this.targetSocket = tls.connect(
      {
        host: hostname,
        port: port,
        rejectUnauthorized: false, // Blink uses self-signed certs
      },
      () => {
        this.log('TLS connection established');

        // Send authentication header
        const authHeader = this.buildAuthHeader();
        this.debug(`Sending auth header (${authHeader.length} bytes)`);
        this.targetSocket!.write(authHeader);

        // Start keep-alive timer
        this.startKeepAlive();
      },
    );

    this.targetSocket.on('data', (data: Buffer) => {
      this.handleImmisData(data);
    });

    this.targetSocket.on('error', (error) => {
      // Ignore APPLICATION_DATA_AFTER_CLOSE_NOTIFY SSL errors
      if (error.message.includes('APPLICATION_DATA_AFTER_CLOSE_NOTIFY')) {
        this.debug('Ignoring SSL close notify error');
        return;
      }
      this.log(`Immis connection error: ${error.message}`);
      this.emit('error', error);
    });

    this.targetSocket.on('close', () => {
      this.debug('Immis connection closed');
      // Clear current socket reference
      this.targetSocket = null;
      // If clients are still connected, retry connecting after a short delay
      if (this.isRunning && this.clients.length > 0) {
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
        }
        this.reconnectTimeout = setTimeout(() => {
          // Avoid multiple retries if a connection was established in the meantime
          if (!this.targetSocket && this.isRunning && this.clients.length > 0) {
            this.log('Retrying immis connection...');
            this.connectToImmisServer();
          }
        }, 2000);
      } else {
        // No clients or not running, stop the proxy entirely
        this.stop();
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
    const clientIdStr = this.parsedUrl.searchParams.get('client_id') ?? '0';
    const clientId = parseInt(clientIdStr, 10);
    this.debug(`Client ID: ${clientId}`);
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
    this.debug(`Connection ID: ${fullConnId.substring(0, CONN_ID_MAX_LENGTH)}`);
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
    // Append to receive buffer
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);

    // Process complete packets
    while (this.receiveBuffer.length >= 9) {
      // Read 9-byte header
      const msgtype = this.receiveBuffer.readUInt8(0);
      const sequence = this.receiveBuffer.readUInt32BE(1);
      const payloadLength = this.receiveBuffer.readUInt32BE(5);

      this.debug(`Packet: msgtype=${msgtype}, sequence=${sequence}, payloadLength=${payloadLength}`);

      // Check if we have the complete packet
      if (this.receiveBuffer.length < 9 + payloadLength) {
        // Wait for more data
        break;
      }

      // Extract payload
      const payload = this.receiveBuffer.subarray(9, 9 + payloadLength);

      // Remove processed packet from buffer
      this.receiveBuffer = this.receiveBuffer.subarray(9 + payloadLength);

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
  }

  /**
   * Forward MPEG-TS data to all connected clients
   */
  private forwardToClients(data: Buffer): void {
    this.emit('data', data);

    // Write to recording file if active
    if (this.streamFile && !this.streamFile.destroyed) {
      this.streamFile.write(data);
      this.streamBytesWritten += data.length;
    }

    for (const client of this.clients) {
      if (!client.destroyed) {
        client.write(data);
      }
    }
  }

  /**
   * Start the keep-alive timer
   */
  private startKeepAlive(): void {
    // Send latency stats every second and keep-alive every 10 seconds
    let secondCounter = 0;
    this.keepAliveInterval = setInterval(() => {
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
    this.targetSocket.write(packet);
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
    this.targetSocket.write(packet);
  }

  /**
   * Send a SESSION_COMMAND to the immis server.
   * Note: Payload structure is not yet confirmed for Start/Stop audio; send empty payload for scaffolding.
   * @param commandId Numeric command ID (e.g., 3 = StartAudio, 4 = StopAudio)
   * @param payload Optional payload buffer (default: empty)
   */
  private sendSessionCommand(commandId: number, payload?: Buffer): void {
    if (!this.targetSocket || this.targetSocket.destroyed) {
      return;
    }

    const body = payload ?? Buffer.alloc(0);
    // Build 9-byte header for SESSION_COMMAND
    const packet = Buffer.alloc(9 + body.length);
    packet.writeUInt8(ImmisMessageType.SESSION_COMMAND, 0);
    // Sequence can reuse keepAliveSequence for monotonicity
    packet.writeUInt32BE(++this.keepAliveSequence, 1);
    packet.writeUInt32BE(body.length, 5);
    if (body.length) {
      body.copy(packet, 9);
    }

    this.debug(`Sending SESSION_COMMAND (id=${commandId}, len=${body.length})`);
    this.targetSocket.write(packet);
  }

  /** Request to start two-way audio (scaffold). */
  startAudio(): void {
    // Known command IDs: StartAudio = 3
    // Payload structure TBD; send empty body for now and rely on device to complete via microphone request.
    this.sendSessionCommand(3);
  }

  /** Request to stop two-way audio (scaffold). */
  stopAudio(): void {
    // Known command IDs: StopAudio = 4
    this.sendSessionCommand(4);
  }

  /**
   * Attach a readable stream that provides AAC-LATM frames to be uplinked.
   * This method will read chunks and forward them to the immis server using
   * proprietary framing. The exact payload structure is not fully known, so
   * we currently encapsulate raw LATM chunks as SESSION_MESSAGE payloads.
   *
   * @param stream Readable stream producing LATM frames
   */
  attachAudioInput(stream: Readable): void {
    if (this.audioInput === stream) {
      return;
    }
    this.audioInput = stream;
    this.debug('Attached upstream audio input stream (LATM)');

    let totalBytes = 0;
    stream.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      // Forward LATM chunk to immis server
      try {
        this.sendLatmChunk(chunk);
      } catch (error) {
        this.debug(`Failed to send LATM chunk: ${(error as Error).message}`);
      }
    });

    stream.on('error', (error) => {
      this.debug(`Audio input stream error: ${error.message}`);
    });

    stream.on('close', () => {
      this.debug(`Audio input stream closed after ${totalBytes} bytes`);
      if (this.audioInput === stream) {
        this.audioInput = null;
      }
    });
  }

  /**
   * Forward a single LATM chunk to the immis server.
   * NOTE: Payload structure is provisional. We encapsulate raw LATM data
   * inside a SESSION_MESSAGE (type=0x18) packet. Sequence uses keepAliveSequence.
   */
  private sendLatmChunk(latm: Buffer): void {
    if (!this.targetSocket || this.targetSocket.destroyed) {
      return;
    }
    const header = Buffer.alloc(9);
    header.writeUInt8(ImmisMessageType.SESSION_MESSAGE, 0);
    header.writeUInt32BE(++this.keepAliveSequence, 1);
    header.writeUInt32BE(latm.length, 5);
    const packet = Buffer.concat([header, latm]);
    this.targetSocket.write(packet);
    this.debug(`Sent LATM chunk (${latm.length} bytes)`);
  }

  /**
   * Stop the proxy server and clean up all connections
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.log('Stopping proxy server');

    // Stop stream recording
    this.stopStreamRecording();

    // Stop keep-alive timer
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    // Cancel any pending reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Close target connection
    if (this.targetSocket && !this.targetSocket.destroyed) {
      this.targetSocket.destroy();
      this.targetSocket = null;
    }

    // Close all client connections
    for (const client of this.clients) {
      if (!client.destroyed) {
        client.destroy();
      }
    }
    this.clients = [];

    // Close server
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    this.receiveBuffer = Buffer.alloc(0);
    this.emit('close');
    this.log('Proxy server stopped');
  }
}
