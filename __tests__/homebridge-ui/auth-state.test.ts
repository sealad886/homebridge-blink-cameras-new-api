import { loadPersistedAuthStateFromFiles } from '../../src/homebridge-ui/auth-state';
import { BlinkAuthState } from '../../src/types';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('homebridge UI persisted auth state loading', () => {
  let tmpDir: string;
  let primaryPath: string;
  let legacyPath: string;
  const logDebug = jest.fn();
  const now = (): number => new Date('2026-05-06T00:00:00.000Z').getTime();
  const state: BlinkAuthState = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    tokenAuth: 'token-auth',
    tokenExpiry: '2026-05-06T01:00:00.000Z',
    email: 'user@example.com',
    accountId: 123,
    tier: 'prod',
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-ui-auth-'));
    primaryPath = path.join(tmpDir, '.blink-auth.json');
    legacyPath = path.join(tmpDir, 'blink-auth', 'auth-state.json');
    logDebug.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('loads a valid primary persisted auth state', async () => {
    await fs.writeFile(primaryPath, JSON.stringify(state, null, 2), 'utf8');
    await fs.chmod(primaryPath, 0o600);

    const result = await loadPersistedAuthStateFromFiles([primaryPath, legacyPath], logDebug, now);

    expect(result).toEqual({ state });
  });

  it('skips expired auth state instead of restoring it', async () => {
    await fs.writeFile(
      primaryPath,
      JSON.stringify({ ...state, tokenExpiry: '2026-05-05T23:59:00.000Z' }, null, 2),
      'utf8',
    );
    await fs.chmod(primaryPath, 0o600);

    const result = await loadPersistedAuthStateFromFiles([primaryPath], logDebug, now);

    expect(result.state).toBeNull();
    expect(result.message).toContain('saved token');
    expect(result.message).toContain('expired');
    expect(logDebug).toHaveBeenCalledWith(result.message);
  });

  it('reports malformed persisted auth state instead of returning a generic logged-out status', async () => {
    await fs.writeFile(primaryPath, '{not-json', 'utf8');
    await fs.chmod(primaryPath, 0o600);

    const result = await loadPersistedAuthStateFromFiles([primaryPath], logDebug, now);

    expect(result.state).toBeNull();
    expect(result.message).toContain('failed to read');
    expect(logDebug).toHaveBeenCalledWith(result.message);
  });

  it('reports invalid token expiry instead of restoring unusable persisted auth state', async () => {
    await fs.writeFile(
      primaryPath,
      JSON.stringify({ ...state, tokenExpiry: 'not-a-date' }, null, 2),
      'utf8',
    );
    await fs.chmod(primaryPath, 0o600);

    const result = await loadPersistedAuthStateFromFiles([primaryPath], logDebug, now);

    expect(result.state).toBeNull();
    expect(result.message).toContain('invalid expiry');
    expect(logDebug).toHaveBeenCalledWith(result.message);
  });

  it('reports rejected auth state security errors instead of falling through silently', async () => {
    await fs.mkdir(path.dirname(legacyPath), { recursive: true });
    await fs.writeFile(legacyPath, JSON.stringify(state, null, 2), 'utf8');
    await fs.chmod(legacyPath, 0o600);
    await fs.symlink(legacyPath, primaryPath);

    const result = await loadPersistedAuthStateFromFiles([primaryPath, legacyPath], logDebug, now);

    expect(result.state).toBeNull();
    expect(result.message).toContain('Persisted Blink authentication was ignored');
    expect(result.message).toContain('symlinked auth state file');
    expect(logDebug).toHaveBeenCalledWith(result.message);
  });
});
