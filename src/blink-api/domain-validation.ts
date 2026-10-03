import { BlinkHomescreen } from '../types';

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
