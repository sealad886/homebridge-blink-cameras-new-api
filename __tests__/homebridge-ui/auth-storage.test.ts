import { resolveUiAuthStoragePath } from '../../src/homebridge-ui/auth-storage';

describe('homebridge-ui auth storage path', () => {
  it('is stable for the same email + hardware id', () => {
    const first = resolveUiAuthStoragePath('/var/lib/homebridge/storage', 'user@example.com', 'device-1');
    const second = resolveUiAuthStoragePath('/var/lib/homebridge/storage', 'user@example.com', 'device-1');
    expect(first).toBe(second);
    expect(first).toContain('blink-auth');
    expect(first.endsWith('.json')).toBe(true);
  });

  it('changes when email changes', () => {
    const first = resolveUiAuthStoragePath('/var/lib/homebridge/storage', 'user-a@example.com', 'device-1');
    const second = resolveUiAuthStoragePath('/var/lib/homebridge/storage', 'user-b@example.com', 'device-1');
    expect(first).not.toBe(second);
  });

  it('changes when hardware id changes', () => {
    const first = resolveUiAuthStoragePath('/var/lib/homebridge/storage', 'user@example.com', 'device-1');
    const second = resolveUiAuthStoragePath('/var/lib/homebridge/storage', 'user@example.com', 'device-2');
    expect(first).not.toBe(second);
  });
});
