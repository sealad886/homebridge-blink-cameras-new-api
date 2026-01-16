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
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { setInterval, clearInterval } from 'node:timers';
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

  /** Buffer for accumulating incoming data from the immis server */
  private receiveBuffer = Buffer.alloc(0);

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

    // If the Blink command isn't ready yet, queue this client
    if (!this.isCommandReady) {
      this.debug('Blink command not ready yet, queueing client');
      this.pendingClients.push(clientSocket);
      return;
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
      this.stop();
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
    // Send keep-alive and latency stats every 10 seconds
    this.keepAliveInterval = setInterval(() => {
      this.sendKeepAlive();
      this.sendLatencyStats();
    }, 1000);

    // Counter for 10-second intervals
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
