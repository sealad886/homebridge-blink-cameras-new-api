import { Buffer } from 'node:buffer';
import { createECDH } from 'node:crypto';
import { encrypt } from 'http_ece';
import { EventEmitter } from 'node:events';
import type { TLSSocket, PeerCertificate, ConnectionOptions } from 'node:tls';
import { mcs_proto } from '@eneris/push-receiver/dist/protos';
import { MCSProtoTag, Variables } from '@eneris/push-receiver/dist/constants';
import { decodeMcsData, McsConnection, McsFrameDecoder } from '../../../src/blink-api/fcm/wire';
import { FCM_BUNDLE_ID, FCM_LIMITS, type Credentials } from '../../../src/blink-api/fcm/types';

const credentials: Credentials = {
  gcm: { androidId: '12345', securityToken: '67890', appId: 'owned-instance', token: 'owned-gcm-token' },
  fcm: { token: 'owned-fcm', installation: { token: 'owned-install', refreshToken: 'owned-refresh', fid: 'owned-fid', createdAt: 1, expiresIn: 600000 } },
  keys: { privateKey: 'fixture', publicKey: 'fixture', authSecret: 'fixture' },
  config: { projectId: 'test-project', vapidKey: '', bundleId: FCM_BUNDLE_ID },
};
const motion = { category: 'motion', event_type: 'cam2sm_motion', created_at: '2026-11-09T10:00:00Z' };

function encryptedMessage(payload: unknown = { from: '123', data: motion }, outerSender = 'web-push-transport') {
  const receiver = createECDH('prime256v1'); receiver.setPrivateKey(Buffer.alloc(32, 1));
  const sender = createECDH('prime256v1'); sender.setPrivateKey(Buffer.alloc(32, 2));
  const keys = { privateKey: receiver.getPrivateKey('base64'), publicKey: receiver.getPublicKey('base64'), authSecret: Buffer.alloc(16, 3).toString('base64') };
  const salt = Buffer.alloc(16, 4).toString('base64');
  const ciphertext = encrypt(Buffer.from(JSON.stringify(payload)), {
    version: 'aesgcm', privateKey: sender, dh: keys.publicKey, authSecret: keys.authSecret, salt,
  });
  const envelope: mcs_proto.IDataMessageStanza = { from: outerSender, category: 'org.chromium.linux',
    persistentId: 'encrypted-1', rawData: ciphertext,
    appData: [{ key: 'crypto-key', value: `dh=${sender.getPublicKey('base64')}; p256ecdsa=unused-parameter` },
      { key: 'encryption', value: `salt=${salt}` }] };
  return { credentials: { ...credentials, keys }, envelope };
}
class Socket extends EventEmitter {
  authorized = true;
  readonly write = jest.fn<boolean, [Buffer]>().mockReturnValue(true);
  readonly destroy = jest.fn();
  readonly pause = jest.fn();
  readonly resume = jest.fn();
  getPeerCertificate() { return { subjectaltname: 'DNS:mtalk.google.com', subject: { CN: 'mtalk.google.com' } } as PeerCertificate; }
}
const packet = (tag: number, payload: Uint8Array, first = false) => Buffer.concat([
  Buffer.from(first ? [Variables.kMCSVersion, tag] : [tag]), Buffer.from(payload),
]);
const login = () => packet(MCSProtoTag.kLoginResponseTag, mcs_proto.LoginResponse.encodeDelimited({ id: 'server' }).finish(), true);
function data(id = 'event-1', sender = '123', extras: Partial<mcs_proto.IDataMessageStanza> = {}) {
  return packet(MCSProtoTag.kDataMessageStanzaTag, mcs_proto.DataMessageStanza.encodeDelimited({
    from: sender, category: 'homebridge.blink.motion', persistentId: id,
    appData: [{ key: 'category', value: 'motion' }, { key: 'event_type', value: 'cam2sm_motion' },
      { key: 'created_at', value: '2026-11-09T10:00:00Z' }], ...extras,
  }).finish());
}
function fixture(persistentIds: string[] = [], ownedCredentials = credentials) {
  const socket = new Socket();
  const connect = jest.fn<TLSSocket, [ConnectionOptions]>().mockReturnValue(socket as unknown as TLSSocket);
  const ready = jest.fn(), notification = jest.fn(), failure = jest.fn();
  const connection = new McsConnection({ credentials: ownedCredentials, senderId: '123', persistentIds,
    connect, onReady: ready, onNotification: notification, onFailure: failure });
  connection.start();
  return { socket, connect, ready, notification, failure, connection };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('parses fragmented headers/bodies and multiple messages without recursion', () => {
  const decoder = new McsFrameDecoder();
  const bytes = Buffer.concat([login(), data()]);
  const frames = [];
  for (const byte of bytes) frames.push(...decoder.push(Buffer.from([byte])));
  expect(frames.map(frame => frame.tag)).toEqual([MCSProtoTag.kLoginResponseTag, MCSProtoTag.kDataMessageStanzaTag]);
  expect(mcs_proto.DataMessageStanza.decode(frames[1].payload).persistentId).toBe('event-1');
});

it('rejects oversized, invalid-version and overlong frame headers before allocating a declared body', () => {
  expect(() => new McsFrameDecoder().push(Buffer.alloc(FCM_LIMITS.frameBytes * 2 + 1))).toThrow('buffer limit');
  expect(() => new McsFrameDecoder().push(Buffer.from([1, 3, 0]))).toThrow('version rejected');
  expect(() => new McsFrameDecoder().push(Buffer.from([41, 3, 255, 255, 255, 255, 255]))).toThrow();
  expect(() => new McsFrameDecoder().push(Buffer.concat([login(), ...Array.from({ length: 128 }, () => packet(1, Buffer.from([0])))]))).toThrow('count limit');
});

it('requires verified hostname TLS and sends no login before secureConnect', () => {
  const f = fixture();
  expect(f.connect).toHaveBeenCalledWith(expect.objectContaining({ host: 'mtalk.google.com', servername: 'mtalk.google.com', rejectUnauthorized: true }));
  expect(f.socket.write).not.toHaveBeenCalled();
  f.socket.authorized = false; f.socket.emit('secureConnect');
  expect(f.socket.write).not.toHaveBeenCalled(); expect(f.failure).toHaveBeenCalledWith('transport-error');
  expect(f.socket.destroy).toHaveBeenCalledTimes(1);
});

it('rejects application packets received before the authenticated TLS state', () => {
  const f = fixture(); f.socket.emit('data', login());
  expect(f.ready).not.toHaveBeenCalled(); expect(f.socket.write).not.toHaveBeenCalled();
  expect(f.failure).toHaveBeenCalledWith('protocol-error');
});

it('rejects a certificate for another hostname', () => {
  const f = fixture();
  jest.spyOn(f.socket, 'getPeerCertificate').mockReturnValue({ subjectaltname: 'DNS:unrelated.example' } as PeerCertificate);
  f.socket.emit('secureConnect');
  expect(f.socket.write).not.toHaveBeenCalled(); expect(f.failure).toHaveBeenCalledWith('transport-error');
});

it('authenticates the owned Google identity and forwards only messages from the configured sender project', () => {
  const f = fixture(); f.socket.emit('secureConnect');
  expect(f.socket.write).toHaveBeenCalledTimes(1);
  const bytes = f.socket.write.mock.calls[0][0];
  const request = mcs_proto.LoginRequest.decodeDelimited(bytes.subarray(2));
  expect(request.user).toBe('12345'); expect(request.deviceId).toBe('android-3039');
  f.socket.emit('data', login()); expect(f.ready).toHaveBeenCalledTimes(1);
  f.socket.emit('data', data('foreign', '999')); expect(f.notification).not.toHaveBeenCalled();
  f.socket.emit('data', data('unused', 'system-sender', { persistentId: null }));
  expect(f.failure).not.toHaveBeenCalled();
  f.socket.emit('data', data());
  expect(f.notification).toHaveBeenCalledWith(expect.objectContaining({ persistentId: 'event-1', data: expect.objectContaining({ event_type: 'cam2sm_motion' }) }));
  f.connection.stop();
});

it('does not advance stream acknowledgment past an uncommitted notification', () => {
  const f = fixture(); f.socket.emit('secureConnect'); f.socket.emit('data', login()); f.socket.emit('data', data());
  f.socket.emit('data', packet(MCSProtoTag.kHeartbeatPingTag, mcs_proto.HeartbeatPing.encodeDelimited({}).finish()));
  const heartbeat = f.socket.write.mock.calls.at(-1)![0];
  expect(mcs_proto.HeartbeatAck.decodeDelimited(heartbeat.subarray(1)).lastStreamIdReceived).toBe(1);
  f.connection.acknowledge('event-1');
  const committed = f.socket.write.mock.calls.at(-1)![0];
  expect(committed[0]).toBe(MCSProtoTag.kHeartbeatPingTag);
  expect(mcs_proto.HeartbeatPing.decodeDelimited(committed.subarray(1)).lastStreamIdReceived).toBe(3);
  f.connection.stop();
});

it('deduplicates pending/redelivered messages only after durable IDs establish acceptance', () => {
  const f = fixture(['already-durable']); f.socket.emit('secureConnect'); f.socket.emit('data', login());
  f.socket.emit('data', data('already-durable')); f.socket.emit('data', data('pending')); f.socket.emit('data', data('pending'));
  expect(f.notification).toHaveBeenCalledTimes(1);
  f.connection.acknowledge('pending'); f.socket.emit('data', data('pending'));
  expect(f.notification).toHaveBeenCalledTimes(1);
  f.connection.stop();
});

it('bounds unacknowledged work and closes a stalled downstream handler', async () => {
  const f = fixture(); f.socket.emit('secureConnect'); f.socket.emit('data', login());
  for (let i = 0; i < FCM_LIMITS.pendingMessages; i++) f.socket.emit('data', data(`event-${i}`));
  expect(f.socket.pause).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(FCM_LIMITS.acknowledgmentMs);
  expect(f.failure).toHaveBeenCalledTimes(1); expect(f.failure).toHaveBeenCalledWith('acknowledgment-timeout');
  f.socket.emit('data', data('late')); expect(f.notification).toHaveBeenCalledTimes(FCM_LIMITS.pendingMessages);
});

it('closes an idle initialization or missing heartbeat response with no reconnect inside the transport', async () => {
  const pending = fixture(); await jest.advanceTimersByTimeAsync(FCM_LIMITS.connectMs);
  expect(pending.failure).toHaveBeenCalledWith('initialization-timeout'); expect(pending.connect).toHaveBeenCalledTimes(1);
  const ready = fixture(); ready.socket.emit('secureConnect'); ready.socket.emit('data', login());
  await jest.advanceTimersByTimeAsync(FCM_LIMITS.heartbeatMs + 60_000);
  expect(ready.failure).toHaveBeenCalledWith('transport-error'); expect(ready.connect).toHaveBeenCalledTimes(1);
});

it('rejects malformed/unsupported payloads without passing unbounded or untrusted JSON to the parent', () => {
  expect(decodeMcsData({ from: '123', category: 'fixture', appData: [{ key: 'x', value: 'a' }, { key: 'x', value: 'b' }] }, credentials, '123')).toBeNull();
  expect(decodeMcsData({ from: '123', category: 'fixture', appData: [{ key: '__proto__', value: 'b' }] }, credentials, '123')).toBeNull();
  expect(decodeMcsData({ from: '123', category: 'fixture', appData: [{ key: 'x', value: 'a'.repeat(4097) }] }, credentials, '123')).toBeNull();
  expect(decodeMcsData({ from: '123', category: 'fixture', appData: [{ key: 'crypto-key', value: 'invalid' }], rawData: Buffer.from('invalid') }, credentials, '123')).toBeNull();
});

it('accepts an owned-key Web Push envelope with the configured inner project and a different outer transport sender', () => {
  const encrypted = encryptedMessage(); const f = fixture([], encrypted.credentials);
  f.socket.emit('secureConnect'); f.socket.emit('data', login());
  f.socket.emit('data', packet(MCSProtoTag.kDataMessageStanzaTag, mcs_proto.DataMessageStanza.encodeDelimited(encrypted.envelope).finish()));
  expect(f.notification).toHaveBeenCalledTimes(1);
  expect(f.notification).toHaveBeenCalledWith(expect.objectContaining({ persistentId: 'encrypted-1', data: motion }));
  f.socket.emit('data', packet(MCSProtoTag.kHeartbeatPingTag, mcs_proto.HeartbeatPing.encodeDelimited({}).finish()));
  expect(mcs_proto.HeartbeatAck.decodeDelimited(f.socket.write.mock.calls.at(-1)![0].subarray(1)).lastStreamIdReceived).toBe(1);
  f.connection.acknowledge('encrypted-1');
  expect(mcs_proto.HeartbeatPing.decodeDelimited(f.socket.write.mock.calls.at(-1)![0].subarray(1)).lastStreamIdReceived).toBe(3);
  expect(f.failure).not.toHaveBeenCalled(); f.connection.stop();
});

it.each([
  { from: '999', data: motion }, { data: motion }, { from: 123, data: motion },
  { from: null, data: motion }, { from: '123' }, { from: '123', data: [] }, null, [],
])('rejects a wrong, missing or malformed inner project/payload even when the outer sender matches: %j', payload => {
  const encrypted = encryptedMessage(payload, '123'); const f = fixture([], encrypted.credentials);
  f.socket.emit('secureConnect'); f.socket.emit('data', login());
  f.socket.emit('data', packet(MCSProtoTag.kDataMessageStanzaTag, mcs_proto.DataMessageStanza.encodeDelimited(encrypted.envelope).finish()));
  expect(f.notification).toHaveBeenCalledWith(expect.objectContaining({ persistentId: 'encrypted-1', data: null }));
  expect(f.failure).not.toHaveBeenCalled(); f.connection.stop();
});

it('keeps plaintext project validation inside the decoder as well as the connection boundary', () => {
  const value = { from: '999', category: 'fixture', appData: Object.entries(motion).map(([key, value]) => ({ key, value })) };
  expect(decodeMcsData(value, credentials, '123')).toBeNull();
  expect(decodeMcsData({ ...value, from: '123' }, credentials, '123')).toEqual(motion);
  expect(decodeMcsData({ ...value, from: '123' }, credentials, '')).toBeNull();
});

it.each(['ciphertext', 'auth-secret', 'receiver-key'])('rejects Web Push encrypted data with an owned-key AEAD mismatch: %s', mismatch => {
  const encrypted = encryptedMessage();
  const keys = { ...encrypted.credentials.keys };
  const envelope = { ...encrypted.envelope };
  if (mismatch === 'ciphertext') {
    const changed = Buffer.from(envelope.rawData!); changed[0] ^= 1; envelope.rawData = changed;
  } else if (mismatch === 'auth-secret') keys.authSecret = Buffer.alloc(16, 5).toString('base64');
  else {
    const other = createECDH('prime256v1'); other.setPrivateKey(Buffer.alloc(32, 6));
    keys.privateKey = other.getPrivateKey('base64'); keys.publicKey = other.getPublicKey('base64');
  }
  const f = fixture([], { ...encrypted.credentials, keys });
  f.socket.emit('secureConnect'); f.socket.emit('data', login());
  f.socket.emit('data', packet(MCSProtoTag.kDataMessageStanzaTag, mcs_proto.DataMessageStanza.encodeDelimited(envelope).finish()));
  expect(f.notification).toHaveBeenCalledWith(expect.objectContaining({ persistentId: 'encrypted-1', data: null }));
  expect(f.failure).not.toHaveBeenCalled(); f.connection.stop();
});

it('removes timers/listeners on stop and does not accept later socket events', async () => {
  const f = fixture(); f.socket.emit('secureConnect'); f.socket.emit('data', login());
  f.connection.stop(); f.connection.stop();
  f.socket.emit('data', data()); await jest.advanceTimersByTimeAsync(3600000);
  expect(f.notification).not.toHaveBeenCalled(); expect(f.failure).not.toHaveBeenCalled(); expect(f.socket.destroy).toHaveBeenCalledTimes(1);
});
