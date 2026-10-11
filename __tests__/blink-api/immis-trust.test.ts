import { X509Certificate } from 'node:crypto';
import * as tls from 'node:tls';
import { IMMIS_VENDOR_CA } from '../../src/blink-api/immis-trust';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Trust-anchor identity and real socket rejection are security contracts.
describe('official IMMIS trust', () => {
  it('contains ten distinct valid self-signed vendor CAs, with matching vendor identity only', () => {
    const certificates = IMMIS_VENDOR_CA.map(pem => new X509Certificate(pem));
    expect(certificates).toHaveLength(10);
    expect(new Set(certificates.map(cert => cert.fingerprint256)).size).toBe(10);
    expect(certificates[0].fingerprint256.replaceAll(':', '').toLowerCase())
      .toBe('b1bfa71ba445f0de14172a1382db19e8848f93b850eb78bd13fdabc1be7e2481');
    for (const cert of certificates) {
      expect(cert.ca).toBe(true);
      expect(cert.verify(cert.publicKey)).toBe(true);
      expect(cert.issuer).toBe(cert.subject);
      expect(Date.parse(cert.validFrom)).toBeLessThan(Date.now());
      expect(Date.parse(cert.validTo)).toBeGreaterThan(Date.now());
      expect(tls.checkServerIdentity('*.immedia-semi.com', cert.toLegacyObject())).toBeUndefined();
      expect(tls.checkServerIdentity('media.immedia-semi.com', cert.toLegacyObject())).toBeUndefined();
      expect(tls.checkServerIdentity('evil.example', cert.toLegacyObject())).toMatchObject({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
      expect(tls.checkServerIdentity('8.8.8.8', cert.toLegacyObject())).toMatchObject({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
    }
    const defaultFingerprints = new Set(tls.rootCertificates.map(pem => new X509Certificate(pem).fingerprint256));
    expect(certificates.every(cert => !defaultFingerprints.has(cert.fingerprint256))).toBe(true);
  });

  it('rejects a real untrusted peer even when its hostname matches the vendor wildcard', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'immis-negative-tls-'));
    let server: tls.Server | undefined;
    try {
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1',
        '-subj', '/CN=*.immedia-semi.com', '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem')],
      { stdio: 'ignore', timeout: 10000 });
      server = tls.createServer({ key: readFileSync(join(directory, 'key.pem')), cert: readFileSync(join(directory, 'cert.pem')) });
      server.on('tlsClientError', () => undefined);
      await new Promise<void>((resolve, reject) => { server!.once('error', reject); server!.listen(0, '127.0.0.1', resolve); });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('TLS test listener unavailable');
      const code = await new Promise<string | undefined>((resolve, reject) => {
        const socket = tls.connect({ host: '127.0.0.1', port: address.port, servername: '*.immedia-semi.com',
          ca: [...tls.rootCertificates, ...IMMIS_VENDOR_CA], rejectUnauthorized: true, minVersion: 'TLSv1.2' });
        socket.setTimeout(5000, () => { socket.destroy(); reject(new Error('TLS test timeout')); });
        socket.on('secureConnect', () => { socket.destroy(); reject(new Error('Foreign certificate accepted')); });
        socket.on('error', error => { socket.destroy(); resolve((error as NodeJS.ErrnoException).code); });
      });
      expect(code).toBe('DEPTH_ZERO_SELF_SIGNED_CERT');
    } finally {
      if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
