import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  HostedOAuthCoordinator,
  HostedOAuthValidationError,
  HOSTED_OAUTH_TTL_MS,
  MAX_HOSTED_CALLBACK_BYTES,
} from '../../src/blink-api/hosted-oauth';
import {
  buildHostedAuthorizationUrl,
  buildRefreshForm,
  HOSTED_ANDROID_OAUTH_PROFILE,
  LEGACY_IOS_OAUTH_PROFILE,
  resolveOAuthProfile,
} from '../../src/blink-api/oauth-profile';
import {
  readOwnerOnlyJsonFile,
  writeOwnerOnlyJsonFile,
} from '../../src/blink-api/secure-json-file';
import type { BlinkHostedOAuthTransaction } from '../../src/types';

const FIXED_NOW = Date.parse('2026-07-16T09:00:00.000Z');
const HARDWARE_ID = 'homebridge-blink';
const CALLBACK_BASE = 'https://applinks.blink.com/signin/callback';
const VALID_CODE = 'one-time-code';
const WRONG_FLOW_ID = Buffer.alloc(32, 0x41).toString('base64url');
const WRONG_STATE = Buffer.alloc(32, 0x42).toString('base64url');

type CallbackFactory = (pending: BlinkHostedOAuthTransaction) => string;
type PendingMutation = (pending: BlinkHostedOAuthTransaction) => unknown;

const callbackFor = (
  pending: BlinkHostedOAuthTransaction,
  options: { state?: string; code?: string } = {},
): string => {
  const callback = new URL(CALLBACK_BASE);
  callback.searchParams.set('state', options.state ?? pending.state);
  callback.searchParams.set('code', options.code ?? VALID_CODE);
  return callback.toString();
};

const expectPendingMissing = async (pendingPath: string): Promise<void> => {
  await expect(fs.access(pendingPath)).rejects.toMatchObject({ code: 'ENOENT' });
};

const expectValidationError = async (
  operation: Promise<unknown>,
  category: HostedOAuthValidationError['category'],
  secrets: readonly string[] = [],
): Promise<HostedOAuthValidationError> => {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(HostedOAuthValidationError);
    const validationError = error as HostedOAuthValidationError;
    expect(validationError.category).toBe(category);
    for (const secret of secrets.filter(Boolean)) {
      expect(validationError.message).not.toContain(secret);
    }
    return validationError;
  }
  throw new Error('Expected HostedOAuthValidationError');
};

describe('HostedOAuthCoordinator', () => {
  let directory: string;
  let pendingPath: string;

  const createCoordinator = (now = FIXED_NOW, tier?: string): HostedOAuthCoordinator => {
    return new HostedOAuthCoordinator({
      pendingFilePath: pendingPath,
      hardwareId: HARDWARE_ID,
      tier,
      now: () => now,
    });
  };

  const startTransaction = async (): Promise<{
    coordinator: HostedOAuthCoordinator;
    pending: BlinkHostedOAuthTransaction;
  }> => {
    const coordinator = createCoordinator();
    await coordinator.start();
    const pending = await readOwnerOnlyJsonFile<BlinkHostedOAuthTransaction>(pendingPath);
    return { coordinator, pending };
  };

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-hosted-oauth-'));
    pendingPath = path.join(directory, '.blink-hosted-oauth.json');
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('starts the exact Android hosted authorization transaction and persists its secrets', async () => {
    const coordinator = createCoordinator();

    const start = await coordinator.start();
    const url = new URL(start.authorizationUrl);
    const pending = await readOwnerOnlyJsonFile<BlinkHostedOAuthTransaction>(pendingPath);

    expect(url.origin + url.pathname).toBe('https://api.oauth.blink.com/oauth/v2/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'android',
      redirect_uri: 'https://applinks.blink.com/signin/callback',
      response_type: 'code',
      scope: 'client',
      state: pending.state,
      code_challenge_method: 'S256',
      prompt: 'login',
      hardware_id: 'homebridge-blink',
      app_brand: 'blink',
      app_version: 'Version 57.1',
      device_brand: 'Raspberry Pi',
      device_model: 'Homebridge',
      device_os_version: 'Android 14',
      dark_mode: 'false',
    });
    expect(Buffer.from(pending.codeVerifier, 'base64url')).toHaveLength(64);
    expect(Buffer.from(pending.state, 'base64url')).toHaveLength(32);
    expect(Buffer.from(pending.flowId, 'base64url')).toHaveLength(32);
    expect(pending.codeChallenge).toBe(
      createHash('sha256').update(pending.codeVerifier).digest('base64url'),
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'android',
      redirect_uri: 'https://applinks.blink.com/signin/callback',
      response_type: 'code',
      scope: 'client',
      state: pending.state,
      code_challenge: pending.codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'login',
      hardware_id: HARDWARE_ID,
      app_brand: 'blink',
      app_version: 'Version 57.1',
      device_brand: 'Raspberry Pi',
      device_model: 'Homebridge',
      device_os_version: 'Android 14',
      dark_mode: 'false',
    });
    for (const key of url.searchParams.keys()) {
      expect(url.searchParams.getAll(key)).toHaveLength(1);
    }
    expect(pending).toEqual({
      version: 1,
      flowId: start.flowId,
      state: expect.any(String),
      codeVerifier: expect.any(String),
      codeChallenge: expect.any(String),
      oauthClientId: 'android',
      redirectUri: CALLBACK_BASE,
      hardwareId: HARDWARE_ID,
      createdAt: new Date(FIXED_NOW).toISOString(),
      expiresAt: new Date(FIXED_NOW + HOSTED_OAUTH_TTL_MS).toISOString(),
    });
    expect(start.expiresAt).toBe(pending.expiresAt);
    if (process.platform !== 'win32') {
      expect((await fs.stat(pendingPath)).mode & 0o777).toBe(0o600);
    }
  });

  it('uses the QA OAuth host only for sqa1', async () => {
    const coordinator = createCoordinator(FIXED_NOW, 'sqa1');
    const start = await coordinator.start();

    expect(new URL(start.authorizationUrl).origin).toBe('https://api.qa.oauth.blink.com');
  });

  it('replaces the only pending transaction when a new flow starts', async () => {
    const coordinator = createCoordinator();
    const first = await coordinator.start();
    const second = await coordinator.start();
    const pending = await readOwnerOnlyJsonFile<BlinkHostedOAuthTransaction>(pendingPath);

    expect(second.flowId).not.toBe(first.flowId);
    expect(pending.flowId).toBe(second.flowId);
  });

  const malformedCallbacks: Array<[string, CallbackFactory]> = [
    ['http scheme', pending => `http://applinks.blink.com/signin/callback?state=${pending.state}&code=${VALID_CODE}`],
    ['wrong hostname', pending => `https://example.com/signin/callback?state=${pending.state}&code=${VALID_CODE}`],
    ['explicit port', pending => `https://applinks.blink.com:443/signin/callback?state=${pending.state}&code=${VALID_CODE}`],
    ['wrong path', pending => `https://applinks.blink.com/signin/other?state=${pending.state}&code=${VALID_CODE}`],
    ['literal dot-segment path', pending => `https://applinks.blink.com/signin/./callback?state=${pending.state}&code=${VALID_CODE}`],
    ['percent-encoded dot-segment path', pending => `https://applinks.blink.com/signin/%2e/callback?state=${pending.state}&code=${VALID_CODE}`],
    ['backslash path separator', pending => `https://applinks.blink.com/signin\\callback?state=${pending.state}&code=${VALID_CODE}`],
    ['TAB normalized from path', pending => `https://applinks.blink.com/sig\tnin/callback?state=${pending.state}&code=${VALID_CODE}`],
    ['CR normalized from path', pending => `https://applinks.blink.com/sig\rnin/callback?state=${pending.state}&code=${VALID_CODE}`],
    ['LF normalized from path', pending => `https://applinks.blink.com/sig\nnin/callback?state=${pending.state}&code=${VALID_CODE}`],
    ['fragment', pending => `${callbackFor(pending)}#fragment`],
    ['empty fragment marker', pending => `${callbackFor(pending)}#`],
    ['fragment containing only stripped TAB', pending => `${callbackFor(pending)}#\t`],
    ['fragment containing only stripped CR', pending => `${callbackFor(pending)}#\r`],
    ['fragment containing only stripped LF', pending => `${callbackFor(pending)}#\n`],
    ['username and password', pending => `https://user:password@applinks.blink.com/signin/callback?state=${pending.state}&code=${VALID_CODE}`],
    ['TAB normalized from code parameter name', pending => `${CALLBACK_BASE}?state=${pending.state}&co\tde=${VALID_CODE}`],
    ['CR normalized from code parameter name', pending => `${CALLBACK_BASE}?state=${pending.state}&co\rde=${VALID_CODE}`],
    ['LF normalized from code parameter name', pending => `${CALLBACK_BASE}?state=${pending.state}&co\nde=${VALID_CODE}`],
    ['duplicate state', pending => `${callbackFor(pending)}&state=${pending.state}`],
    ['duplicate code', pending => `${callbackFor(pending)}&code=second-code`],
    ['duplicate error', pending => `${CALLBACK_BASE}?state=${pending.state}&error=access_denied&error=server_error`],
    ['duplicate error_description', pending => `${CALLBACK_BASE}?state=${pending.state}&error=access_denied&error_description=first&error_description=second`],
    ['missing state', () => `${CALLBACK_BASE}?code=${VALID_CODE}`],
    ['empty code', pending => `${CALLBACK_BASE}?state=${pending.state}&code=`],
    ['code plus error', pending => `${callbackFor(pending)}&error=access_denied`],
    ['empty code plus error', pending => `${CALLBACK_BASE}?state=${pending.state}&code=&error=access_denied`],
    ['code plus empty error', pending => `${callbackFor(pending)}&error=`],
    ['trailing NUL', pending => `${callbackFor(pending)}\0`],
    ['trailing vertical tab', pending => `${callbackFor(pending)}\v`],
    ['trailing form feed', pending => `${callbackFor(pending)}\f`],
    ['trailing space', pending => `${callbackFor(pending)} `],
    ['trailing DEL', pending => `${callbackFor(pending)}\x7f`],
    ['more than 2,048 UTF-8 bytes', pending => `${CALLBACK_BASE}?state=${pending.state}&code=${'£'.repeat(MAX_HOSTED_CALLBACK_BYTES)}`],
    ['malformed URL', () => 'not a URL'],
  ];

  it.each(malformedCallbacks)('retains pending state for malformed callback: %s', async (_name, makeCallback) => {
    const { pending } = await startTransaction();
    const callbackUrl = makeCallback(pending);
    const restartedCoordinator = createCoordinator();

    await expectValidationError(
      restartedCoordinator.consumeCallback(pending.flowId, callbackUrl),
      'malformed',
      [callbackUrl, pending.flowId, pending.state, pending.codeVerifier, VALID_CODE],
    );
    expect(await readOwnerOnlyJsonFile<BlinkHostedOAuthTransaction>(pendingPath)).toEqual(pending);
  });

  it('classifies a normalized raw callback as malformed before loading pending state', async () => {
    const callbackUrl = `${CALLBACK_BASE}?state=${WRONG_STATE}&code=${VALID_CODE}#`;

    await expectValidationError(
      createCoordinator().consumeCallback(WRONG_FLOW_ID, callbackUrl),
      'malformed',
      [callbackUrl, WRONG_FLOW_ID, WRONG_STATE, VALID_CODE],
    );
    await expectPendingMissing(pendingPath);
  });

  const securityFailures: Array<[
    string,
    (pending: BlinkHostedOAuthTransaction) => { flowId: string; callbackUrl: string },
  ]> = [
    ['invalid flow format', pending => ({ flowId: 'invalid-flow', callbackUrl: callbackFor(pending) })],
    ['wrong flow', pending => ({ flowId: WRONG_FLOW_ID, callbackUrl: callbackFor(pending) })],
    ['wrong state', pending => ({ flowId: pending.flowId, callbackUrl: callbackFor(pending, { state: WRONG_STATE }) })],
  ];

  it.each(securityFailures)('consumes pending state for security failure: %s', async (_name, makeInput) => {
    const { pending } = await startTransaction();
    const input = makeInput(pending);
    const restartedCoordinator = createCoordinator();

    await expectValidationError(
      restartedCoordinator.consumeCallback(input.flowId, input.callbackUrl),
      'security',
      [input.callbackUrl, input.flowId, pending.flowId, pending.state, pending.codeVerifier, WRONG_STATE],
    );
    await expectPendingMissing(pendingPath);
  });

  it('validates state before consuming and reporting an OAuth error', async () => {
    const { pending } = await startTransaction();
    const callbackUrl = `${CALLBACK_BASE}?state=${WRONG_STATE}&error=access_denied&error_description=user+cancelled`;

    await expectValidationError(
      createCoordinator().consumeCallback(pending.flowId, callbackUrl),
      'security',
      [callbackUrl, pending.flowId, pending.state, pending.codeVerifier, WRONG_STATE, 'access_denied'],
    );
    await expectPendingMissing(pendingPath);
  });

  it('consumes a validated OAuth error without exposing its values', async () => {
    const { pending } = await startTransaction();
    const callbackUrl = `${CALLBACK_BASE}?state=${pending.state}&error=access_denied&error_description=user+cancelled`;

    await expectValidationError(
      createCoordinator().consumeCallback(pending.flowId, callbackUrl),
      'oauth',
      [callbackUrl, pending.flowId, pending.state, pending.codeVerifier, 'access_denied', 'user cancelled'],
    );
    await expectPendingMissing(pendingPath);
  });

  it('consumes an expired transaction', async () => {
    const { pending } = await startTransaction();
    const callbackUrl = callbackFor(pending);
    const restartedCoordinator = createCoordinator(FIXED_NOW + HOSTED_OAUTH_TTL_MS + 1);

    await expectValidationError(
      restartedCoordinator.consumeCallback(pending.flowId, callbackUrl),
      'expired',
      [callbackUrl, pending.flowId, pending.state, pending.codeVerifier, VALID_CODE],
    );
    await expectPendingMissing(pendingPath);
  });

  it('loads a valid transaction after restart, consumes it, and returns the token request', async () => {
    const { pending } = await startTransaction();
    const callbackUrl = callbackFor(pending);
    const restartedCoordinator = createCoordinator();

    await expect(restartedCoordinator.consumeCallback(pending.flowId, callbackUrl)).resolves.toEqual({
      authorizationCode: VALID_CODE,
      codeVerifier: pending.codeVerifier,
      oauthClientId: 'android',
      redirectUri: CALLBACK_BASE,
    });
    await expectPendingMissing(pendingPath);
  });

  it('accepts correctly percent-encoded query values', async () => {
    const { pending } = await startTransaction();
    const callbackUrl = `${CALLBACK_BASE}?state=${pending.state}&code=one%20time%2Bcode%23value`;

    await expect(createCoordinator().consumeCallback(pending.flowId, callbackUrl)).resolves.toEqual({
      authorizationCode: 'one time+code#value',
      codeVerifier: pending.codeVerifier,
      oauthClientId: 'android',
      redirectUri: CALLBACK_BASE,
    });
    await expectPendingMissing(pendingPath);
  });

  it('rejects replay after consuming a valid callback', async () => {
    const { pending } = await startTransaction();
    const callbackUrl = callbackFor(pending);
    const restartedCoordinator = createCoordinator();

    await restartedCoordinator.consumeCallback(pending.flowId, callbackUrl);
    await expectValidationError(
      restartedCoordinator.consumeCallback(pending.flowId, callbackUrl),
      'missing',
      [callbackUrl, pending.flowId, pending.state, pending.codeVerifier, VALID_CODE],
    );
    await expectPendingMissing(pendingPath);
  });

  it('cancels and removes a pending transaction', async () => {
    const { coordinator } = await startTransaction();

    await coordinator.cancel();

    await expectPendingMissing(pendingPath);
  });

  const malformedPendingCases: Array<[string, PendingMutation]> = [
    ['wrong version', pending => ({ ...pending, version: 2 })],
    ['missing field', pending => {
      const { hardwareId: _hardwareId, ...withoutHardwareId } = pending;
      return withoutHardwareId;
    }],
    ['extra field', pending => ({ ...pending, extra: true })],
    ['wrong OAuth client', pending => ({ ...pending, oauthClientId: 'ios' })],
    ['wrong redirect URI', pending => ({ ...pending, redirectUri: 'https://example.com/callback' })],
    ['wrong hardware ID', pending => ({ ...pending, hardwareId: 'other-device' })],
    ['invalid creation timestamp', pending => ({ ...pending, createdAt: 'not-a-date' })],
    ['non-canonical creation timestamp', pending => ({ ...pending, createdAt: '2026-07-16T09:00:00Z' })],
    ['invalid expiry timestamp', pending => ({ ...pending, expiresAt: 'not-a-date' })],
    ['wrong transaction lifetime', pending => ({ ...pending, expiresAt: new Date(FIXED_NOW + HOSTED_OAUTH_TTL_MS + 1).toISOString() })],
    ['future creation timestamp', pending => ({
      ...pending,
      createdAt: new Date(FIXED_NOW + 1).toISOString(),
      expiresAt: new Date(FIXED_NOW + HOSTED_OAUTH_TTL_MS + 1).toISOString(),
    })],
    ['invalid flow base64url', pending => ({ ...pending, flowId: `${'x'.repeat(42)}*` })],
    ['wrong flow decoded length', pending => ({ ...pending, flowId: Buffer.alloc(31).toString('base64url') })],
    ['invalid state base64url', pending => ({ ...pending, state: `${'x'.repeat(42)}*` })],
    ['wrong state decoded length', pending => ({ ...pending, state: Buffer.alloc(31).toString('base64url') })],
    ['invalid verifier base64url', pending => ({ ...pending, codeVerifier: '*'.repeat(86) })],
    ['wrong verifier decoded length', pending => ({ ...pending, codeVerifier: Buffer.alloc(63).toString('base64url') })],
    ['invalid challenge base64url', pending => ({ ...pending, codeChallenge: `${'x'.repeat(42)}*` })],
    ['wrong challenge decoded length', pending => ({ ...pending, codeChallenge: Buffer.alloc(31).toString('base64url') })],
    ['challenge and verifier mismatch', pending => ({ ...pending, codeChallenge: Buffer.alloc(32, 0x43).toString('base64url') })],
  ];

  it.each(malformedPendingCases)('removes malformed persisted state with a fixed missing error: %s', async (_name, mutate) => {
    const { pending } = await startTransaction();
    await writeOwnerOnlyJsonFile(pendingPath, mutate(pending));
    const callbackUrl = callbackFor(pending);

    const error = await expectValidationError(
      createCoordinator().consumeCallback(pending.flowId, callbackUrl),
      'missing',
      [callbackUrl, pending.flowId, pending.state, pending.codeVerifier, VALID_CODE],
    );

    expect(error.message).toBe('No pending Blink sign-in transaction was found. Start sign-in again.');
    await expectPendingMissing(pendingPath);
  });

  it('removes invalid persisted JSON with the fixed missing error', async () => {
    const { pending } = await startTransaction();
    await fs.writeFile(pendingPath, '{', { encoding: 'utf8', mode: 0o600 });
    const callbackUrl = callbackFor(pending);

    const error = await expectValidationError(
      createCoordinator().consumeCallback(pending.flowId, callbackUrl),
      'missing',
      [callbackUrl, pending.flowId, pending.state, pending.codeVerifier, VALID_CODE],
    );

    expect(error.message).toBe('No pending Blink sign-in transaction was found. Start sign-in again.');
    await expectPendingMissing(pendingPath);
  });
});

describe('OAuth profiles', () => {
  it('preserves the legacy iOS profile as the default', () => {
    expect(resolveOAuthProfile(undefined)).toBe(LEGACY_IOS_OAUTH_PROFILE);
    expect(resolveOAuthProfile(null)).toBe(LEGACY_IOS_OAUTH_PROFILE);
    expect(resolveOAuthProfile('ios')).toBe(LEGACY_IOS_OAUTH_PROFILE);
    expect(resolveOAuthProfile('android')).toBe(HOSTED_ANDROID_OAUTH_PROFILE);
  });

  it('builds hosted and legacy refresh forms with their exact fields', () => {
    expect(Object.fromEntries(buildRefreshForm('android', 'hosted-refresh-token'))).toEqual({
      refresh_token: 'hosted-refresh-token',
      grant_type: 'refresh_token',
      client_id: 'android',
      scope: 'client',
    });
    expect(Object.fromEntries(buildRefreshForm(undefined, 'legacy-refresh-token'))).toEqual({
      refresh_token: 'legacy-refresh-token',
      grant_type: 'refresh_token',
      client_id: 'ios',
    });
  });

  it('builds an authorization URL with each Android metadata field exactly once', () => {
    const transaction: BlinkHostedOAuthTransaction = {
      version: 1,
      flowId: Buffer.alloc(32, 1).toString('base64url'),
      state: Buffer.alloc(32, 2).toString('base64url'),
      codeVerifier: Buffer.alloc(64, 3).toString('base64url'),
      codeChallenge: Buffer.alloc(32, 4).toString('base64url'),
      oauthClientId: 'android',
      redirectUri: CALLBACK_BASE,
      hardwareId: HARDWARE_ID,
      createdAt: new Date(FIXED_NOW).toISOString(),
      expiresAt: new Date(FIXED_NOW + HOSTED_OAUTH_TTL_MS).toISOString(),
    };

    const url = new URL(buildHostedAuthorizationUrl(transaction, 'prde'));

    expect(url.origin + url.pathname).toBe('https://api.oauth.blink.com/oauth/v2/authorize');
    expect([...new Set(url.searchParams.keys())]).toHaveLength(15);
    for (const key of url.searchParams.keys()) {
      expect(url.searchParams.getAll(key)).toHaveLength(1);
    }
  });
});
