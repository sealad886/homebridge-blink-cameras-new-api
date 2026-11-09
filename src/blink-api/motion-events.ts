import type { NativeRecordingObservation } from '../native-recording-coordinator';

/** Authoritative homescreen/configuration binding, not notification display text. */
export interface BlinkMotionDevice {
  accountId: number;
  networkId: number;
  providerId: number;
  target: string;
  cameraId: string;
  nativeName: string;
}
export interface NativeMotionDevice extends BlinkMotionDevice { syncModuleId: number; moduleId: string; }

export interface BlinkMotionIdentity {
  providerId: number;
  networkId?: number;
  target: string;
}

export interface BlinkMotionMessage {
  persistentMessageId: string;
  data: Readonly<Record<string, string>>;
}

export interface BlinkMotionContext {
  accountId: number;
  tier: string;
  /** Resolves the exact provider ID, target kind and network using known devices. */
  resolveDevice(identity: BlinkMotionIdentity): BlinkMotionDevice | undefined;
}

export type BlinkMotionResult = {
  status: 'motion';
  observation: Omit<NativeRecordingObservation, 'moduleId'>;
  device: BlinkMotionDevice;
  eventType: 'native-usb' | 'cloud-media';
  originalCreatedAt: string;
  timestampBasis: 'notification-created-at';
} | {
  status: 'ignored';
  reason: 'invalid-message' | 'unsupported-event' | 'foreign-scope' | 'unknown-device' | 'invalid-device-binding';
};

const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;
const remoteId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const decodeRemoteId = (value: unknown): number | null => {
  if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value)) return null;
  const parsed = Number(value);
  return remoteId(parsed) ? parsed : null;
};

export function isNativeMotionDevice(value: unknown): value is NativeMotionDevice {
  return isBlinkMotionDevice(value) && remoteId((value as NativeMotionDevice).syncModuleId) && identifier((value as NativeMotionDevice).moduleId);
}

export function isBlinkMotionDevice(value: unknown): value is BlinkMotionDevice {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const device = value as BlinkMotionDevice;
  return remoteId(device.accountId) && remoteId(device.networkId) && remoteId(device.providerId)
    && identifier(device.cameraId) && identifier(device.target) && identifier(device.nativeName);
}

/**
 * APK61's notification handler parses created_at using OffsetDateTime. Keep an
 * explicit offset and reject calendar rollover instead of accepting local time.
 */
export function parseBlinkOffsetTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || value.length > 40) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) return null;
  if (parts[8] !== 'Z') {
    const offsetHours = Number(parts[9]);
    const offsetMinutes = Number(parts[10]);
    if (offsetHours > 18 || offsetMinutes > 59 || (offsetHours === 18 && offsetMinutes !== 0)) return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : null;
}

/**
 * Call only from the authenticated Blink push transport. This decodes the
 * APK61 cam2sm_motion data contract; it is neither a receiver nor a clip proof.
 * Target-to-device-kind mapping stays with the authoritative device resolver.
 */
export function decodeBlinkMotionMessage(message: BlinkMotionMessage, context: BlinkMotionContext): BlinkMotionResult {
  const ignored = (reason: Extract<BlinkMotionResult, { status: 'ignored' }>['reason']): BlinkMotionResult => ({ status: 'ignored', reason });
  if (!message || !identifier(message.persistentMessageId) || /\p{Cc}/u.test(message.persistentMessageId)
    || !message.data || typeof message.data !== 'object' || Array.isArray(message.data)) return ignored('invalid-message');
  const entries = Object.entries(message.data);
  if (entries.length > 64 || entries.some(([, value]) => typeof value !== 'string' || value.length > 4_096)) return ignored('invalid-message');
  const data = message.data;
  const eventType = data.event_type?.toLowerCase() ?? '';
  if (data.category?.toLowerCase() !== 'motion' || !['cam2sm_motion', 'cloud_motion'].includes(eventType)) return ignored('unsupported-event');
  const networkId = data.network === undefined ? undefined : decodeRemoteId(data.network);
  const providerId = decodeRemoteId(data.camera);
  const occurredAt = parseBlinkOffsetTimestamp(data.created_at);
  if ((eventType === 'cam2sm_motion' && !networkId) || (data.network !== undefined && !networkId)
    || !providerId || occurredAt === null || !identifier(data.target)) return ignored('invalid-message');
  // Account/client/tier binding comes from the authenticated receiver. Native
  // payloads need not repeat it, but present fields must agree with that scope.
  if (!remoteId(context.accountId) || !/^[a-z0-9]{4}$/i.test(context.tier)
    || (data.account_id !== undefined && decodeRemoteId(data.account_id) !== context.accountId)
    || (data.tier !== undefined && data.tier !== context.tier)) {
    return ignored('foreign-scope');
  }
  const device = context.resolveDevice({ providerId, target: data.target, ...(networkId ? { networkId } : {}) });
  if (!device) return ignored('unknown-device');
  if (!isBlinkMotionDevice(device) || device.accountId !== context.accountId || (networkId !== undefined && device.networkId !== networkId)
    || device.providerId !== providerId || device.target !== data.target) return ignored('invalid-device-binding');
  return {
    status: 'motion',
    device: { ...device },
    eventType: eventType === 'cam2sm_motion' ? 'native-usb' : 'cloud-media',
    observation: {
      source: 'provider', kind: 'motion-start', eventId: message.persistentMessageId,
      cameraId: device.cameraId, occurredAt,
    },
    originalCreatedAt: data.created_at,
    timestampBasis: 'notification-created-at',
  };
}
