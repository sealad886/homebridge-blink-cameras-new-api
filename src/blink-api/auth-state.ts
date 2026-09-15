import type { BlinkAuthState } from '../types';

/** Validate both runtime storage adapters and the UI's untrusted JSON input. */
export function isPersistedAuthState(value: unknown): value is BlinkAuthState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (typeof state.accessToken !== 'string' || !state.accessToken.trim()) return false;
  for (const key of ['refreshToken', 'tokenAuth', 'email', 'hardwareId', 'region'] as const) {
    if (state[key] != null && typeof state[key] !== 'string') return false;
  }
  for (const key of ['tokenExpiry', 'updatedAt'] as const) {
    if (state[key] != null && (typeof state[key] !== 'string' || !Number.isFinite(Date.parse(state[key])))) return false;
  }
  for (const key of ['accountId', 'clientId'] as const) {
    if (state[key] != null && (!Number.isSafeInteger(state[key]) || (state[key] as number) <= 0)) return false;
  }
  if (state.tier != null && (typeof state.tier !== 'string' || !/^[a-zA-Z0-9]{4}$/.test(state.tier))) return false;
  return state.oauthClientId == null || state.oauthClientId === 'android' || state.oauthClientId === 'ios';
}

export class InvalidAuthStateError extends Error {
  constructor() {
    super('Blink authentication state could not be loaded.');
    this.name = 'InvalidAuthStateError';
  }
}
