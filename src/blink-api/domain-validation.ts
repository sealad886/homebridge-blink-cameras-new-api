import { BlinkCameraKind, BlinkHomescreen, BlinkVideoQuality, BlinkVideoQualityState } from '../types';

export function isBlinkVideoQuality(value: unknown): value is BlinkVideoQuality {
  return value === 'saver' || value === 'standard' || value === 'best';
}

/** Android camera config signals.temp is Fahrenheit; HAP CurrentTemperature is Celsius. */
export function validateCameraTemperature(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Blink returned invalid temperature metadata.');
  }
  const signals = (value as Record<string, unknown>).signals;
  if (signals === undefined || signals === null) return undefined;
  if (typeof signals !== 'object' || Array.isArray(signals)) {
    throw new Error('Blink returned invalid temperature metadata.');
  }
  const fahrenheit = (signals as Record<string, unknown>).temp;
  if (fahrenheit === undefined || fahrenheit === null) return undefined;
  if (typeof fahrenheit !== 'number' || !Number.isFinite(fahrenheit)) {
    throw new Error('Blink returned invalid temperature metadata.');
  }
  const celsius = (fahrenheit - 32) * 5 / 9;
  if (celsius < -270 || celsius > 100) {
    throw new Error('Blink returned out-of-range temperature metadata.');
  }
  return Math.round(celsius * 10) / 10;
}

/** Decode only the documented config owner, never traverse arbitrary provider data. */
export function validateVideoQualityState(value: unknown, kind: BlinkCameraKind): BlinkVideoQualityState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Blink returned invalid video quality metadata.');
  }
  const response = value as Record<string, unknown>;
  const config = kind === 'camera' ? response.camera : response;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Blink returned invalid video quality metadata.');
  }
  const fields = config as Record<string, unknown>;
  const quality = fields.video_quality;
  if (quality !== undefined && quality !== null && !isBlinkVideoQuality(quality)) {
    throw new Error('Blink returned unsupported video quality metadata.');
  }
  const decodeList = (key: string): BlinkVideoQuality[] | undefined => {
    const list = fields[key];
    if (list === undefined || list === null) return undefined;
    if (!Array.isArray(list) || list.length > 16 || list.some(item => !isBlinkVideoQuality(item))) {
      throw new Error('Blink returned invalid video quality capabilities.');
    }
    return [...new Set(list)] as BlinkVideoQuality[];
  };
  return {
    quality: isBlinkVideoQuality(quality) ? quality : undefined,
    supported: decodeList('video_quality_support'),
    restricted: decodeList('video_quality_restricted'),
  };
}

export function requireRemoteId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Blink returned an invalid remote identifier.');
  }
  return value;
}

export function validateHomescreen(value: unknown): BlinkHomescreen {
  if (!value || typeof value !== 'object') throw new Error('Blink returned an invalid homescreen.');
  const screen = value as Record<string, unknown>;
  let total = 0;
  for (const key of ['networks', 'cameras', 'owls', 'doorbells']) {
    const devices = screen[key];
    if (!Array.isArray(devices) || (total += devices.length) > 1000) throw new Error('Blink returned an invalid homescreen.');
    for (const device of devices) {
      if (!device || typeof device !== 'object') throw new Error('Blink returned an invalid homescreen.');
      requireRemoteId(device.id);
      if (key !== 'networks') requireRemoteId(device.network_id);
      if (typeof device.name !== 'string' || device.name.length > 256) throw new Error('Blink returned an invalid homescreen.');
    }
  }
  if (screen.account && typeof screen.account === 'object') {
    const id = (screen.account as Record<string, unknown>).account_id;
    if (id !== undefined) requireRemoteId(id);
  }
  return value as BlinkHomescreen;
}
