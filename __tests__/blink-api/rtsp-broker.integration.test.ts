import { test } from '@jest/globals';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as tls from 'node:tls';
import { OwnedRtspBroker } from '../../src/blink-api/rtsp-broker';

/** Actual local TLS verification, not production numeric-dial acceptance.
 * The test adapter checks admitted numeric options, redirects only its synthetic
 * transport to loopback, adds a synthetic CA when requested, and presents that
 * admitted peer identity to the broker. Production dial/peer enforcement is covered
 * separately by sink-capture unit tests. Original SNI and Node certificate checks
 * remain real. OpenSSL is a test-fixture prerequisite; no packages are installed.
 * Ephemeral private keys stay inside an owner-only directory and never reach output.
 */
const hostname = 'stream.immedia-semi.com';
const capability = `rtsps://${hostname}:332/fixture-session?blinkRTSP=true`;
let directory: string;
let ca: Buffer;
let good: { key: Buffer; cert: Buffer };
let wrong: { key: Buffer; cert: Buffer };

function openssl(args: string[]): void {
  try { execFileSync('openssl', args, { stdio: 'ignore', timeout: 10000 }); }
  catch { throw new Error('Synthetic TLS fixture requires a working openssl executable'); }
}

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'blink-rtsp-tls-'));
  chmodSync(directory, 0o700);
  const config = join(directory, 'ca.conf');
  writeFileSync(config, '[req]\ndistinguished_name=dn\n[dn]\n[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n');
  const caKey = join(directory, 'ca.key'); const caCert = join(directory, 'ca.crt');
  openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-config', config,
    '-extensions', 'v3_ca', '-subj', '/CN=Owned-RTSP-Test-CA', '-keyout', caKey, '-out', caCert]);
  chmodSync(caKey, 0o600); ca = readFileSync(caCert);
  const certificate = (name: string, domain: string, serial: string) => {
    const key = join(directory, `${name}.key`); const csr = join(directory, `${name}.csr`);
    const cert = join(directory, `${name}.crt`); const extensions = join(directory, `${name}.ext`);
    writeFileSync(extensions, `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:${domain}\n`);
    openssl(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-config', config,
      '-subj', `/CN=${domain}`, '-keyout', key, '-out', csr]);
    chmodSync(key, 0o600);
    openssl(['x509', '-req', '-in', csr, '-CA', caCert, '-CAkey', caKey, '-set_serial', serial,
      '-out', cert, '-days', '1', '-extfile', extensions]);
    return { key: readFileSync(key), cert: readFileSync(cert) };
  };
  good = certificate('good', hostname, '1'); wrong = certificate('wrong', 'wrong.immedia-semi.com', '2');
});
afterAll(() => {
  good?.key.fill(0); wrong?.key.fill(0);
  if (directory) rmSync(directory, { recursive: true, force: true });
});

async function deadline<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = globalThis.setTimeout(() => reject(new Error('Synthetic TLS integration deadline exceeded')), 2000);
    })]);
  } finally { globalThis.clearTimeout(timer); }
}

function media(): Buffer {
  const frame = Buffer.alloc(16 + 188); frame[0] = 36; frame.writeUInt16BE(200, 2);
  frame[4] = 0x80; frame[5] = 33; frame.writeUInt32BE(1, 12); frame[16] = 0x47;
  return frame;
}

async function fixture(leaf: { key: Buffer; cert: Buffer }, trust: boolean) {
  const peers = new Set<Socket>(); const clients: tls.TLSSocket[] = []; const errors: string[] = [];
  const serverNames: unknown[] = []; const tlsErrors: Array<string | undefined> = [];
  const received: Buffer[] = []; let applicationBytes = 0; let plays = 0;
  let consumed!: () => void; const firstMedia = new Promise<void>(resolve => { consumed = resolve; });
  const server = tls.createServer({ ...leaf, minVersion: 'TLSv1.2' }, socket => {
    serverNames.push(Reflect.get(socket, 'servername'));
    let request = Buffer.alloc(0); let replied = false;
    socket.on('error', () => {});
    socket.on('data', (bytes: Buffer) => {
      applicationBytes += bytes.length;
      if (request.length + bytes.length > 16384) { socket.destroy(); return; }
      request = Buffer.concat([request, bytes]);
      if (!replied && request.includes('\r\n\r\n')) {
        replied = true;
        if (request.toString('ascii').startsWith('PLAY ')) plays++;
        socket.write(Buffer.concat([Buffer.from('RTSP/1.0 200 OK\r\nCSeq: 1\r\nContent-Length: 0\r\n\r\n'), media()]));
        request.fill(0);
      }
    });
  });
  server.on('tlsClientError', () => {});
  server.on('connection', socket => { peers.add(socket); socket.once('close', () => peers.delete(socket)); });
  await deadline(new Promise<void>((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  }));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Synthetic TLS listener unavailable');
  const broker = new OwnedRtspBroker(capability, {
    write: async bytes => { received.push(Buffer.from(bytes)); consumed(); }, close: async () => {},
  }, {
    lookup: async () => [{ address: '8.8.8.8', family: 4 }], error: error => errors.push(error.message),
    connect: options => {
      expect(options.host).toBe('8.8.8.8'); expect(options.port).toBe(332);
      expect(options.servername).toBe(hostname); expect(options.rejectUnauthorized).toBe(true);
      const socket = tls.connect({ ...options, host: '127.0.0.1', port: address.port, ca: trust ? ca : options.ca });
      socket.once('error', (error: Error & { code?: string }) => tlsErrors.push(error.code));
      // Only the adapter's physical route differs; do not mislabel this as a real
      // production numeric-peer check. TLS hostname verification still uses SNI.
      Object.defineProperty(socket, 'remoteAddress', { get: () => options.host });
      clients.push(socket); return socket;
    },
  });
  return { broker, clients, errors, tlsErrors, serverNames, received, firstMedia, plays: () => plays, bytes: () => applicationBytes,
    async cleanup() {
      void broker.stop(); for (const socket of clients) socket.destroy();
      for (const socket of peers) socket.destroy();
      await deadline(broker.whenClosed);
      await deadline(new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
    },
  };
}

test('real trusted TLS hostname reaches PLAY and delivers MPEG-TS; STOP confirms socket close', async () => {
  const f = await fixture(good, true);
  try {
    await deadline(f.broker.start()); await deadline(f.firstMedia);
    expect(f.plays()).toBe(1); expect(f.received).toHaveLength(1);
    expect(f.serverNames).toEqual([hostname]);
    expect(f.received[0]).toEqual(media().subarray(16)); expect(f.errors).toEqual([]);
    await deadline(f.broker.stop()); expect(f.clients.every(socket => socket.closed)).toBe(true);
  } finally { await f.cleanup(); }
});

test.each(['wrong hostname', 'untrusted chain'])('real %s handshake sends zero application bytes and exposes fixed errors', async reason => {
  const f = await fixture(reason === 'wrong hostname' ? wrong : good, reason === 'wrong hostname');
  try {
    await expect(deadline(f.broker.start())).rejects.toThrow('RTSP transport refused');
    await deadline(f.broker.whenClosed);
    expect(f.bytes()).toBe(0); expect(f.plays()).toBe(0); expect(f.received).toEqual([]);
    if (reason === 'wrong hostname') expect(f.tlsErrors).toEqual(['ERR_TLS_CERT_ALTNAME_INVALID']);
    else {
      expect(f.tlsErrors).toHaveLength(1);
      expect(['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'CERT_UNTRUSTED'])
        .toContain(f.tlsErrors[0]);
    }
    expect(f.errors).toEqual(['RTSP transport refused']); expect(f.clients.every(socket => socket.closed)).toBe(true);
  } finally { await f.cleanup(); }
});
