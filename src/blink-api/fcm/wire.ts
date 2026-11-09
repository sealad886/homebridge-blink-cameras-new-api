import { Buffer } from 'node:buffer';
import * as tls from 'node:tls';
import { mcs_proto } from '@eneris/push-receiver/dist/protos';
import { MCSProtoTag, Variables } from '@eneris/push-receiver/dist/constants';
import decrypt from '@eneris/push-receiver/dist/utils/decrypt';
import { FCM_LIMITS, validData, validPersistentId, type Credentials, type FcmFailure } from './types';

export interface McsFrame { tag: number; payload: Buffer; }

/** Bounded incremental MCS framing; the pinned MIT package supplies protobuf/encryption codecs. */
export class McsFrameDecoder {
  private buffer = Buffer.alloc(0);
  private first = true;
  push(chunk: Buffer): McsFrame[] {
    if (!Buffer.isBuffer(chunk) || this.buffer.length + chunk.length > FCM_LIMITS.frameBytes * 2) throw new Error('MCS buffer limit');
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames: McsFrame[] = [];
    while (this.buffer.length) {
      const offset = this.first ? 1 : 0;
      if (this.buffer.length < offset + 2) break;
      if (this.first && ![38, Variables.kMCSVersion].includes(this.buffer[0])) throw new Error('MCS version rejected');
      const tag = this.buffer[offset];
      let length = 0, shift = 0, cursor = offset + 1, complete = false;
      for (; cursor < this.buffer.length; cursor++) {
        const byte = this.buffer[cursor];
        if (shift >= 28) throw new Error('MCS length rejected');
        length += (byte & 0x7f) * 2 ** shift;
        if (length > FCM_LIMITS.frameBytes) throw new Error('MCS frame limit');
        shift += 7;
        if (!(byte & 0x80)) { complete = true; cursor++; break; }
      }
      if (!complete || this.buffer.length < cursor + length) break;
      if (frames.length >= 128) throw new Error('MCS frame count limit');
      frames.push({ tag, payload: this.buffer.subarray(cursor, cursor + length) });
      this.buffer = this.buffer.subarray(cursor + length);
      this.first = false;
    }
    return frames;
  }
}

export interface McsConnectionOptions {
  credentials: Credentials;
  senderId: string;
  persistentIds: string[];
  onReady(): void;
  onNotification(message: { persistentId: string; data: Record<string, string> | null; receivedAt: number }): void;
  onFailure(reason: FcmFailure): void;
  connect?: (options: tls.ConnectionOptions) => tls.TLSSocket;
  now?: () => number;
}

/** Google-only transport. It never receives Blink credentials or endpoints. */
export class McsConnection {
  private socket?: tls.TLSSocket;
  private readonly decoder = new McsFrameDecoder();
  private stopped = false;
  private ready = false;
  private verifiedTls = false;
  private sequence = 0;
  private acknowledgedThrough = 0;
  private readonly completed = new Set<number>();
  private readonly pending = new Map<string, { sequences: number[]; timer: ReturnType<typeof globalThis.setTimeout> }>();
  private readonly acknowledged: string[];
  private connectTimer?: ReturnType<typeof globalThis.setTimeout>;
  private heartbeat?: ReturnType<typeof globalThis.setTimeout>;
  private heartbeatDeadline?: ReturnType<typeof globalThis.setTimeout>;
  constructor(private readonly options: McsConnectionOptions) { this.acknowledged = [...options.persistentIds]; }

  start(): void {
    if (this.socket || this.stopped) throw new Error('MCS connection already used');
    const socket = (this.options.connect ?? tls.connect)({ host: 'mtalk.google.com', port: 5228,
      servername: 'mtalk.google.com', rejectUnauthorized: true, minVersion: 'TLSv1.2' });
    this.socket = socket;
    this.connectTimer = globalThis.setTimeout(() => this.fail('initialization-timeout'), FCM_LIMITS.connectMs);
    socket.once('secureConnect', () => {
      if (this.stopped) return;
      if (!socket.authorized || tls.checkServerIdentity('mtalk.google.com', socket.getPeerCertificate())) {
        this.fail('transport-error'); return;
      }
      this.verifiedTls = true;
      const gcm = this.options.credentials.gcm;
      const login: mcs_proto.ILoginRequest = { adaptiveHeartbeat: false, authService: 2, authToken: gcm.securityToken,
        id: 'chrome-94.0.4606.51', domain: 'mcs.android.com', deviceId: `android-${BigInt(gcm.androidId).toString(16)}`,
        networkType: 1, resource: gcm.androidId, user: gcm.androidId, useRmq2: true,
        setting: [{ name: 'new_vc', value: '1' }], clientEvent: [], receivedPersistentId: this.acknowledged };
      if (mcs_proto.LoginRequest.verify(login)) { this.fail('protocol-error'); return; }
      socket.write(Buffer.concat([Buffer.from([Variables.kMCSVersion, MCSProtoTag.kLoginRequestTag]),
        Buffer.from(mcs_proto.LoginRequest.encodeDelimited(login).finish())]));
    });
    socket.on('data', chunk => {
      if (this.stopped) return;
      if (!this.verifiedTls) { this.fail('protocol-error'); return; }
      try { for (const frame of this.decoder.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)) { if (!this.stopped) this.handle(frame); } }
      catch { this.fail('protocol-error'); }
    });
    socket.once('error', () => this.fail('transport-error'));
    socket.once('close', () => this.fail('transport-error'));
  }

  acknowledge(persistentId: string): void {
    const message = this.pending.get(persistentId);
    if (!message || this.stopped) return;
    globalThis.clearTimeout(message.timer);
    this.pending.delete(persistentId);
    for (const sequence of message.sequences) this.complete(sequence);
    this.acknowledged.push(persistentId);
    if (this.acknowledged.length > FCM_LIMITS.persistentIds) this.acknowledged.splice(0, this.acknowledged.length - FCM_LIMITS.persistentIds);
    this.socket?.resume();
    this.ping();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.connectTimer) globalThis.clearTimeout(this.connectTimer);
    if (this.heartbeat) globalThis.clearTimeout(this.heartbeat);
    if (this.heartbeatDeadline) globalThis.clearTimeout(this.heartbeatDeadline);
    for (const pending of this.pending.values()) globalThis.clearTimeout(pending.timer);
    this.pending.clear();
    this.socket?.removeAllListeners();
    // Keep an error listener while an asynchronously failed socket is destroyed.
    this.socket?.on('error', () => undefined);
    this.socket?.destroy();
  }

  private handle(frame: McsFrame): void {
    const sequence = ++this.sequence;
    if (this.heartbeatDeadline) globalThis.clearTimeout(this.heartbeatDeadline);
    this.heartbeatDeadline = undefined;
    if (frame.tag === MCSProtoTag.kLoginResponseTag) {
      const response = mcs_proto.LoginResponse.decode(frame.payload);
      if (this.ready || response.error) { this.fail('protocol-error'); return; }
      this.ready = true;
      if (this.connectTimer) globalThis.clearTimeout(this.connectTimer);
      this.options.onReady();
    } else if (!this.ready) { this.fail('protocol-error'); return; }
    else if (frame.tag === MCSProtoTag.kDataMessageStanzaTag) {
      const value = mcs_proto.DataMessageStanza.decode(frame.payload);
      if (value.from !== this.options.senderId) {
        this.complete(sequence); this.scheduleHeartbeat(); return;
      }
      if (!validPersistentId(value.persistentId)) { this.fail('protocol-error'); return; }
      if (this.acknowledged.includes(value.persistentId)) {
        this.complete(sequence); this.scheduleHeartbeat(); return;
      }
      const previous = this.pending.get(value.persistentId);
      if (previous) {
        if (previous.sequences.length >= 128) { this.fail('protocol-error'); return; }
        previous.sequences.push(sequence); return;
      }
      if (this.pending.size >= FCM_LIMITS.pendingMessages) { this.fail('protocol-error'); return; }
      const timer = globalThis.setTimeout(() => this.fail('acknowledgment-timeout'), FCM_LIMITS.acknowledgmentMs);
      this.pending.set(value.persistentId, { sequences: [sequence], timer });
      if (this.pending.size === FCM_LIMITS.pendingMessages) this.socket?.pause();
      this.options.onNotification({ persistentId: value.persistentId,
        data: decodeMcsData(value, this.options.credentials), receivedAt: (this.options.now ?? Date.now)() });
      this.scheduleHeartbeat();
      return;
    } else if (frame.tag === MCSProtoTag.kHeartbeatPingTag) {
      mcs_proto.HeartbeatPing.decode(frame.payload);
      this.complete(sequence);
      this.write(MCSProtoTag.kHeartbeatAckTag, mcs_proto.HeartbeatAck.encodeDelimited({ lastStreamIdReceived: this.acknowledgedThrough }).finish());
      this.scheduleHeartbeat(); return;
    } else if (frame.tag === MCSProtoTag.kHeartbeatAckTag) { mcs_proto.HeartbeatAck.decode(frame.payload); }
    else if (frame.tag === MCSProtoTag.kCloseTag || frame.tag === MCSProtoTag.kStreamErrorStanzaTag) { this.fail('transport-error'); return; }
    else if (frame.tag === MCSProtoTag.kIqStanzaTag) { mcs_proto.IqStanza.decode(frame.payload); }
    else { this.fail('protocol-error'); return; }
    this.complete(sequence);
    this.scheduleHeartbeat();
  }
  private complete(sequence: number): void {
    this.completed.add(sequence);
    while (this.completed.delete(this.acknowledgedThrough + 1)) this.acknowledgedThrough++;
    if (this.completed.size > 256) this.fail('protocol-error');
  }
  private scheduleHeartbeat(): void {
    if (this.stopped) return;
    if (this.heartbeat) globalThis.clearTimeout(this.heartbeat);
    this.heartbeat = globalThis.setTimeout(() => this.ping(), FCM_LIMITS.heartbeatMs);
  }
  private ping(): void {
    if (this.stopped || !this.ready) return;
    this.write(MCSProtoTag.kHeartbeatPingTag, mcs_proto.HeartbeatPing.encodeDelimited({ lastStreamIdReceived: this.acknowledgedThrough }).finish());
    if (this.heartbeatDeadline) globalThis.clearTimeout(this.heartbeatDeadline);
    this.heartbeatDeadline = globalThis.setTimeout(() => this.fail('transport-error'), 60_000);
    this.scheduleHeartbeat();
  }
  private write(tag: number, payload: Uint8Array): void {
    if (!this.stopped) this.socket?.write(Buffer.concat([Buffer.from([tag]), Buffer.from(payload)]));
  }
  private fail(reason: FcmFailure): void {
    if (this.stopped) return;
    this.stop();
    this.options.onFailure(reason);
  }
}

/** Decrypt Web Push with the dependency's vetted ECE implementation; native data stays inside verified TLS. */
export function decodeMcsData(value: mcs_proto.IDataMessageStanza, credentials: Credentials): Record<string, string> | null {
  try {
    if (!Array.isArray(value.appData) || value.appData.length > 64) return null;
    const pairs = value.appData.map(item => [item.key, item.value]);
    if (pairs.some(([key, item]) => typeof key !== 'string' || typeof item !== 'string')
      || new Set(pairs.map(([key]) => key)).size !== pairs.length) return null;
    const headers = Object.fromEntries(pairs);
    if (headers['crypto-key'] || headers.encryption) {
      if (!value.rawData || value.rawData.length > FCM_LIMITS.notificationBytes) return null;
      const decoded = decrypt<unknown>(value as unknown as Parameters<typeof decrypt>[0], credentials.keys);
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
      const data = (decoded as { data?: unknown }).data;
      return validData(data) ? data : null;
    }
    return validData(headers) ? headers : null;
  } catch { return null; }
}
