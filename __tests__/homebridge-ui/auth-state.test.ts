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
    expect(logDebug).toHaveBeenCalledWith(
      'Persisted Blink auth scan progress: 1/2 (50%) file=.blink-auth.json ETA 0ms',
    );
    expect(logDebug).toHaveBeenCalledWith(
      'Persisted Blink auth scan complete: 1/2 (100%) ETA 0ms',
    );
  });

  it('returns expired auth state with a usable refresh token for server-side refresh', async () => {
    await fs.writeFile(
      primaryPath,
      JSON.stringify({ ...state, tokenExpiry: '2026-05-05T23:59:00.000Z' }, null, 2),
      'utf8',
    );
    await fs.chmod(primaryPath, 0o600);

    const result = await loadPersistedAuthStateFromFiles([primaryPath], logDebug, now);

    expect(result).toEqual({
      state: { ...state, tokenExpiry: '2026-05-05T23:59:00.000Z' },
      requiresRefresh: true,
    });
    expect(logDebug).toHaveBeenCalledWith(expect.stringContaining('.blink-auth.json'));
    expect(logDebug.mock.calls.flat().join('\n')).not.toContain(tmpDir);
  });

  it('ignores expired auth state without a refresh token', async () => {
    await fs.writeFile(
      primaryPath,
      JSON.stringify({
        ...state,
        refreshToken: null,
        tokenExpiry: '2026-05-05T23:59:00.000Z',
      }, null, 2),
      'utf8',
    );
    await fs.chmod(primaryPath, 0o600);

    const result = await loadPersistedAuthStateFromFiles([primaryPath], logDebug, now);

    expect(result.state).toBeNull();
    expect(result.message).toContain('saved token');
    expect(result.message).toContain('expired');
    expect(result.message).not.toContain('2026-05-05T23:59:00.000Z');
    expect(result.message).not.toContain(tmpDir);
    expect(logDebug).toHaveBeenCalledWith(expect.stringContaining('.blink-auth.json'));
    expect(logDebug.mock.calls.flat().join('\n')).not.toContain(tmpDir);
  });

  it('reports missing access tokens without exposing full auth paths', async () => {
    await fs.writeFile(
      primaryPath,
      JSON.stringify({ ...state, accessToken: undefined }, null, 2),
      'utf8',
    );
    await fs.chmod(primaryPath, 0o600);

    const result = await loadPersistedAuthStateFromFiles([primaryPath], logDebug, now);

    expect(result.state).toBeNull();
    expect(result.message).toContain('does not contain an access token');
    expect(result.message).not.toContain(tmpDir);
    expect(logDebug).toHaveBeenCalledWith(expect.stringContaining('.blink-auth.json'));
    expect(logDebug.mock.calls.flat().join('\n')).not.toContain(tmpDir);
  });

  it('reports malformed persisted auth state instead of returning a generic logged-out status', async () => {
    await fs.writeFile(primaryPath, '{not-json', 'utf8');
    await fs.chmod(primaryPath, 0o600);

    const result = await loadPersistedAuthStateFromFiles([primaryPath], logDebug, now);

    expect(result.state).toBeNull();
    expect(result.message).toContain('failed to read');
    expect(result.message).not.toContain(tmpDir);
    expect(logDebug).toHaveBeenCalledWith(expect.stringContaining('.blink-auth.json'));
    expect(logDebug.mock.calls.flat().join('\n')).not.toContain(tmpDir);
  });

  it('reports invalid token expiry instead of restoring unusable persisted auth state', async () => {
    const invalidExpirySentinel = 'invalidExpirySentinel_6Qw9';
    await fs.writeFile(
      primaryPath,
      JSON.stringify({ ...state, tokenExpiry: invalidExpirySentinel }, null, 2),
      'utf8',
    );
    await fs.chmod(primaryPath, 0o600);

    const result = await loadPersistedAuthStateFromFiles([primaryPath], logDebug, now);

    expect(result.state).toBeNull();
    expect(result.message).toContain('invalid expiry');
    expect(JSON.stringify(result)).not.toContain(invalidExpirySentinel);
    expect(result.message).not.toContain(tmpDir);
    expect(logDebug).toHaveBeenCalledWith(expect.stringContaining('.blink-auth.json'));
    expect(logDebug.mock.calls.flat().join('\n')).not.toContain(invalidExpirySentinel);
    expect(logDebug.mock.calls.flat().join('\n')).not.toContain(tmpDir);
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
    expect(result.message).not.toContain(tmpDir);
    expect(logDebug).toHaveBeenCalledWith(expect.stringContaining('.blink-auth.json'));
    expect(logDebug.mock.calls.flat().join('\n')).not.toContain(tmpDir);
  });

  it('reports progress with ETA for every candidate and a completion record', async () => {
    await fs.mkdir(path.dirname(legacyPath), { recursive: true });
    await fs.writeFile(legacyPath, JSON.stringify(state), { mode: 0o600 });
    await fs.chmod(legacyPath, 0o600);

    const result = await loadPersistedAuthStateFromFiles([primaryPath, legacyPath], logDebug, now);

    expect(result).toEqual({ state });
    expect(logDebug).toHaveBeenCalledWith(
      'Persisted Blink auth scan progress: 1/2 (50%) file=.blink-auth.json ETA 0ms',
    );
    expect(logDebug).toHaveBeenCalledWith(
      'Persisted Blink auth scan progress: 2/2 (100%) file=auth-state.json ETA 0ms',
    );
    expect(logDebug).toHaveBeenCalledWith(
      'Persisted Blink auth scan complete: 2/2 (100%) ETA 0ms',
    );
  });

  it.each([
    null,
    [],
    'state',
    { ...state, accessToken: 42 },
    { ...state, accessToken: '   ' },
    { ...state, refreshToken: 42 },
    { ...state, tokenExpiry: 42 },
  ])('rejects malformed persisted state %# without leaking values', async (malformedState) => {
    const secret = 'persistedSecretSentinel_9Vn3';
    await fs.writeFile(
      primaryPath,
      JSON.stringify(
        malformedState && typeof malformedState === 'object' && !Array.isArray(malformedState)
          ? { ...malformedState, untrusted: secret }
          : malformedState,
      ),
      { mode: 0o600 },
    );
    await fs.chmod(primaryPath, 0o600);

    const result = await loadPersistedAuthStateFromFiles([primaryPath], logDebug, now);

    expect(result.state).toBeNull();
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(logDebug.mock.calls.flat().join('\n')).not.toContain(secret);
    expect(logDebug.mock.calls.flat().join('\n')).not.toContain(tmpDir);
  });
});
