# Blink Hosted OAuth Login Implementation Plan

> Historical execution artifact. The implemented release is now `0.9.1`; use
> `docs/adr/001-authentication.md`, `blink_api_map.md`, and
> `docs/integration_checklist.md` for the current runtime contract and
> validation boundary. The original single-`prod` bootstrap examples below are
> superseded by the bounded `prod`, `prde`, `prsg`, `a001` fallback that advances
> only on HTTP 406. Fresh packaged authorization-code exchange acceptance
> remains open.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Homebridge user authenticate through Blink's hosted Android OAuth UI in Brave, securely return the registered App-Link callback to the Raspberry Pi, and keep working after token refresh and restart in every APK-supported region.

**Architecture:** The Raspberry Pi owns a restart-safe, owner-only Authorization Code with PKCE transaction; Brave handles Blink credentials and MFA; the Homebridge UI submits only the final callback. A focused coordinator validates and consumes the callback, `BlinkAuth` performs the exact Android AppAuth exchange and durable token persistence, and `BlinkApi` discovers the authoritative tier before account and homescreen calls. The Ireland account provides the live EU proof; non-EU support is verified best-effort through Blink Android 57.1 code traces and parameterized routing tests.

**Tech Stack:** TypeScript 5.9, Node.js 20/22/24 Web Fetch API and `node:crypto`, Jest 30 with ts-jest, Homebridge Plugin UI Utils 2.1.2, HTML/CSS/vanilla JavaScript, Raspberry Pi Homebridge 2.1.1, Brave.

## Global Constraints

- Beads issue `homebridge-blinkcameras-2yh` is the authoritative work tracker; these checkboxes are the execution recipe required by the planning workflow, not a second issue tracker.
- Follow red-green-refactor: every production change begins with a focused failing Jest assertion whose failure is observed before implementation.
- Blink Android 57.1 build 29715642 is the exact protocol authority; retain source references to `UnifiedSignInUtils.java`, `TokenRequest.java`, `NoClientAuthentication.java`, `OauthApi.java`, `BaseUrls.java`, `TierRepository.java`, and `ProductionTier.java` in tests and documentation.
- The hosted profile is `client_id=android`, `redirect_uri=https://applinks.blink.com/signin/callback`, `scope=client`, `prompt=login`, 64 random verifier bytes, S256, 32 random state bytes, and 32 random flow-ID bytes.
- Authorization-code exchange sends exactly `grant_type`, `redirect_uri`, `code`, `code_verifier`, and `client_id`; it sends no scope, app metadata, hardware ID, cookie, client secret, Blink REST header, or browser user agent.
- Hosted refresh sends exactly `refresh_token`, `grant_type=refresh_token`, `client_id=android`, and `scope=client`; legacy state without `oauthClientId` defaults to the current `ios` refresh contract.
- The pending transaction lifetime is exactly 15 minutes; callback input is at most 2,048 UTF-8 bytes; only one transaction may exist; it is consumed before token exchange.
- A structurally malformed or partial callback retains the pending transaction; flow mismatch, state mismatch, expiry, OAuth error, valid callback, logout, unlock, and replacement consume it.
- Pending and final auth files are adjacent Homebridge dot-files, atomically replaced, owner-only mode `0600`, and rejected when symlinked, non-regular, swapped during open, or left group/world-accessible.
- Never log or echo password, MFA/PIN, callback URL, authorization code, PKCE verifier, OAuth state, access token, refresh token, cookies, or upstream token response bodies.
- The browser receives only authorization URL, opaque flow ID, expiry, and redacted account status; access and refresh tokens never enter browser JavaScript or Homebridge config.
- The supported UI contains no Blink username, password, hosted-flow MFA, or region selector. It stores `deviceId`, discovered `tier`, and `persistAuth=true`, and removes legacy credential/code fields.
- Ireland/EU is the only account authorized for live acceptance. Non-EU claims must say APK-evidenced and mocked/parameterized, not live-tested.
- The end-user flow is region-independent. Production accounts authorize at `api.oauth.blink.com`; `v1/users/tier_info` selects `rest-{tier}.immedia-semi.com` after token issuance.
- Preserve the existing post-token client/account verification route; do not ask Homebridge for the hosted OAuth MFA code.
- Preserve user-owned untracked `.vscode/` and `__tests__/.DS_Store` files.
- Do not commit APKs, decompilation output, callback/token artifacts, Raspberry Pi backups, or `/tmp` proof files.
- Target release version `0.9.0` only after automated and live acceptance gates pass.
- Use the installed Homebridge Plugin UI Utils 2.1.2 request/event surface; do not add a new runtime dependency.

---

## File map

### New focused modules

- `src/blink-api/secure-json-file.ts` — one canonical atomic owner-only JSON primitive shared by token and pending-transaction storage.
- `src/blink-api/oauth-profile.ts` — explicit hosted Android and legacy iOS client profiles plus exact authorize/refresh form builders.
- `src/blink-api/hosted-oauth.ts` — pending transaction lifecycle, strict callback parsing, constant-time state validation, expiry, and replay prevention.
- `src/homebridge-ui/hosted-auth-service.ts` — testable request-domain service that creates `BlinkApi`, starts/completes/cancels hosted auth, and returns redacted status.
- `__tests__/blink-api/secure-json-file.test.ts` — reusable storage security and atomic-write contract.
- `__tests__/blink-api/hosted-oauth.test.ts` — authorization URL and callback transaction state machine.
- `__tests__/blink-api/auth-hosted.test.ts` — exact exchange, persistence ordering, profile-aware refresh, and bearer-only headers.
- `__tests__/homebridge-ui/hosted-auth-service.test.ts` — start/complete/logout/test-connection payload and status behavior.
- `__tests__/authentication-docs.test.ts` — regression guard against obsolete password-grant, credential-entry, and Homebridge-hosted MFA instructions.

### Existing files changed

- `src/types/blink-api.ts` — `BlinkOAuthClientId`, persisted `oauthClientId`, pending transaction/result types, and pending file path config.
- `src/blink-api/oauth-pkce.ts` — 64-byte verifier and reusable 32-byte opaque-value generation.
- `src/blink-api/headers.ts` — current Android 57.1/build 29715642 REST identity; legacy browser headers remain legacy-only.
- `src/blink-api/auth.ts` — reuse secure JSON storage, hosted exchange, awaited token writes, profile-aware refresh, and metadata persistence.
- `src/blink-api/client.ts` — hosted wrappers and tier-first post-token discovery.
- `src/blink-api/urls.ts` — export normalized tier validation and keep OAuth environment selection separate from account REST tier.
- `src/homebridge-ui/server.ts` — `/auth/start` and `/auth/complete`, no credential `/login`, pending cleanup, bounded errors, and token-only connection test.
- `src/homebridge-ui/public/index.html` — hosted launch, blocked-popup link, clipboard finish, manual paste, post-token verification, and credential-free config save.
- `src/homebridge-ui/auth-state.ts` — import the canonical secure-file error/read API.
- `src/platform.ts` — accept credential-free persisted hosted auth and route with the discovered tier.
- `__tests__/blink-api/auth.test.ts` — preserve explicit legacy iOS migration coverage after hosted auth becomes primary.
- `__tests__/blink-api/client.test.ts` — tier-first ordering, persistence, homescreen proof, and regional matrix.
- `__tests__/blink-api/urls.test.ts` — APK-derived production/non-EU/numbered-tier target matrix.
- `__tests__/homebridge-ui/auth-state.test.ts` — canonical secure-file error compatibility.
- `__tests__/schema-auth-ui.test.ts` — no credentials/MFA/login route, popup/clipboard/manual-paste/config cleanup assertions.
- `__tests__/platform.test.ts` — startup from persisted hosted tokens without username/password.
- `README.md` — replace direct credential flow with hosted sign-in and clipboard finish.
- `docs/adr/001-authentication.md` — canonical current auth architecture and risk boundary.
- `docs/integration_checklist.md` — executable hosted-flow and restart checklist.
- `docs/blink_api_dossier.md` — exact Android 57.1 authorization, exchange, refresh, and tier-construction traces with updated target table.
- `CHANGELOG.md`, `package.json`, `package-lock.json` — `0.9.0` hosted-auth release record.

### Ignored evidence retained locally only

- `logs/blink-apk/57.1-29715642/decompiled/jadx/sources/...` — decompiled APK evidence used during implementation, never staged or packed.

---

### Task 1: Canonical owner-only JSON storage and OAuth protocol types

**Files:**
- Create: `src/blink-api/secure-json-file.ts`
- Create: `__tests__/blink-api/secure-json-file.test.ts`
- Modify: `src/blink-api/auth.ts:40-220`
- Modify: `src/homebridge-ui/auth-state.ts:1-6`
- Modify: `src/types/blink-api.ts:20-47,386-462`
- Test: `__tests__/blink-api/auth.test.ts`
- Test: `__tests__/homebridge-ui/auth-state.test.ts`

**Interfaces:**
- Consumes: Node `fs.promises`, `fs.constants`, `randomUUID`, and the existing auth-state security behavior.
- Produces: `SecureJsonFileSecurityError`, `readOwnerOnlyJsonFile<T>(filePath)`, `writeOwnerOnlyJsonFile<T>(filePath, value)`, `removeOwnerOnlyFile(filePath)`, `BlinkOAuthClientId`, `BlinkHostedOAuthTransaction`, `BlinkHostedOAuthStart`, `BlinkHostedOAuthTokenRequest`, and `BlinkConfig.hostedOAuthPendingPath`.

- [ ] **Step 1: Add failing canonical-storage and type-contract tests**

Create `__tests__/blink-api/secure-json-file.test.ts` with concrete regular-file, mode, symlink, and replacement assertions:

```ts
import {
  readOwnerOnlyJsonFile,
  removeOwnerOnlyFile,
  SecureJsonFileSecurityError,
  writeOwnerOnlyJsonFile,
} from '../../src/blink-api/secure-json-file';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('owner-only JSON files', () => {
  let directory: string;
  let filePath: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-secure-json-'));
    filePath = path.join(directory, '.state.json');
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('atomically writes and reads a regular owner-only file', async () => {
    await writeOwnerOnlyJsonFile(filePath, { value: 7 });
    expect(await readOwnerOnlyJsonFile<{ value: number }>(filePath)).toEqual({ value: 7 });
    if (process.platform !== 'win32') {
      expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
    }
    expect((await fs.readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('rejects a symlink without reading its target', async () => {
    const target = path.join(directory, 'target.json');
    await fs.writeFile(target, JSON.stringify({ secret: true }), { mode: 0o600 });
    await fs.symlink(target, filePath);
    await expect(readOwnerOnlyJsonFile(filePath)).rejects.toThrow(SecureJsonFileSecurityError);
  });

  it('rejects a regular file not owned by the effective process user', async () => {
    await fs.writeFile(filePath, JSON.stringify({ value: 1 }), { mode: 0o600 });
    if (process.platform === 'win32' || typeof process.getuid !== 'function') return;
    const fileUid = (await fs.stat(filePath)).uid;
    jest.spyOn(process, 'getuid').mockReturnValue(fileUid + 1);
    await expect(readOwnerOnlyJsonFile(filePath)).rejects.toThrow('not owned by the current process user');
  });

  it('removes an existing file and ignores ENOENT', async () => {
    await writeOwnerOnlyJsonFile(filePath, { value: 1 });
    await removeOwnerOnlyFile(filePath);
    await removeOwnerOnlyFile(filePath);
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
```

Extend `__tests__/blink-api/auth.test.ts` so the existing `AuthStateFileSecurityError`, `hardenAuthStateFileMode`, and `readPersistedAuthStateFile` imports remain source-compatible after extraction.

- [ ] **Step 2: Run the focused tests and observe the missing-module failure**

Run:

```bash
npm test -- --runInBand __tests__/blink-api/secure-json-file.test.ts __tests__/blink-api/auth.test.ts __tests__/homebridge-ui/auth-state.test.ts
```

Expected: Jest fails because `src/blink-api/secure-json-file.ts` does not exist; the pre-existing auth-state tests still pass before extraction.

- [ ] **Step 3: Implement the canonical secure-file primitive and preserve compatibility exports**

Implement `src/blink-api/secure-json-file.ts` around the existing no-follow, inode-equality, regular-file, hardening, exclusive-temp, and atomic-rename logic. Its public surface is exact:

```ts
import type { FileHandle } from 'node:fs/promises';

export class SecureJsonFileSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecureJsonFileSecurityError';
  }
}

export async function readOwnerOnlyJsonFile<T>(filePath: string): Promise<T>;
export async function writeOwnerOnlyJsonFile<T>(filePath: string, value: T): Promise<void>;
export async function removeOwnerOnlyFile(filePath: string): Promise<void>;
export async function hardenOwnerOnlyFileMode(
  target: string | Pick<FileHandle, 'chmod' | 'stat'>,
  filePath?: string,
): Promise<void>;
```

`writeOwnerOnlyJsonFile` must serialize `JSON.stringify(value, null, 2)`, create the parent with `0700`, open a UUID temp file with `O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW` and `0600`, write, harden, close, rename, and remove only its own temp file on failure. `readOwnerOnlyJsonFile` must open with `O_RDONLY | O_NOFOLLOW`, compare `lstat` and handle `stat` device/inode, require `stats.uid === process.getuid()` where POSIX ownership APIs exist, harden before reading, parse JSON, and convert `ELOOP` into `SecureJsonFileSecurityError`.

In `src/blink-api/auth.ts`, replace the duplicated implementation with imports and compatibility aliases:

```ts
import {
  hardenOwnerOnlyFileMode,
  readOwnerOnlyJsonFile,
  removeOwnerOnlyFile,
  SecureJsonFileSecurityError,
  writeOwnerOnlyJsonFile,
} from './secure-json-file';

export { SecureJsonFileSecurityError as AuthStateFileSecurityError } from './secure-json-file';
export const hardenAuthStateFileMode = hardenOwnerOnlyFileMode;
export const readPersistedAuthStateFile = readOwnerOnlyJsonFile<BlinkAuthState>;
```

Keep `FileAuthStorage` as the migration adapter, but implement `save`, `readJsonFile`, and `unlinkQuiet` by calling the canonical functions.

- [ ] **Step 4: Add the explicit OAuth and hosted transaction types**

Add these exact declarations to `src/types/blink-api.ts`:

```ts
export type BlinkOAuthClientId = 'android' | 'amazon' | 'ios';

export interface BlinkHostedOAuthTransaction {
  version: 1;
  flowId: string;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  oauthClientId: 'android';
  redirectUri: 'https://applinks.blink.com/signin/callback';
  hardwareId: string;
  createdAt: string;
  expiresAt: string;
}

export interface BlinkHostedOAuthStart {
  authorizationUrl: string;
  flowId: string;
  expiresAt: string;
}

export interface BlinkHostedOAuthTokenRequest {
  authorizationCode: string;
  codeVerifier: string;
  oauthClientId: 'android';
  redirectUri: 'https://applinks.blink.com/signin/callback';
}
```

Add `oauthClientId?: BlinkOAuthClientId | null` to `BlinkAuthState`; rename the unused `BlinkConfig.clientId?: 'android' | 'amazon'` field to `oauthClientId?: BlinkOAuthClientId`; add `hostedOAuthPendingPath?: string`. Existing persisted objects without the new field remain valid.

- [ ] **Step 5: Run storage regressions and commit the extraction**

Run:

```bash
npm test -- --runInBand __tests__/blink-api/secure-json-file.test.ts __tests__/blink-api/auth.test.ts __tests__/homebridge-ui/auth-state.test.ts
npm run lint
npm run build
git add src/blink-api/secure-json-file.ts src/blink-api/auth.ts src/homebridge-ui/auth-state.ts src/types/blink-api.ts __tests__/blink-api/secure-json-file.test.ts __tests__/blink-api/auth.test.ts __tests__/homebridge-ui/auth-state.test.ts
git commit -m "refactor(auth): share owner-only JSON persistence"
```

Expected: focused Jest suites pass, ESLint reports no errors, TypeScript build succeeds, and only the listed files enter the commit.

---

### Task 2: Android OAuth profile and restart-safe callback coordinator

**Files:**
- Create: `src/blink-api/oauth-profile.ts`
- Create: `src/blink-api/hosted-oauth.ts`
- Create: `__tests__/blink-api/hosted-oauth.test.ts`
- Modify: `src/blink-api/oauth-pkce.ts:15-65`
- Modify: `src/blink-api/headers.ts:10-36`
- Modify: `src/blink-api/urls.ts:10-91`
- Test: `__tests__/blink-api/urls.test.ts`

**Interfaces:**
- Consumes: Task 1 owner-only JSON functions and hosted transaction types; `getOAuthAuthorizeUrl`; Android 57.1 `UnifiedSignInUtils.signInIntent` metadata.
- Produces: `HOSTED_ANDROID_OAUTH_PROFILE`, `LEGACY_IOS_OAUTH_PROFILE`, `resolveOAuthProfile(clientId)`, `buildHostedAuthorizationUrl(transaction, tier)`, `buildRefreshForm(clientId, refreshToken)`, and `HostedOAuthCoordinator.start/consumeCallback/cancel`.

- [ ] **Step 1: Write failing authorize URL, restart, validation, and replay tests**

Create `__tests__/blink-api/hosted-oauth.test.ts` with a temp pending path and fixed clock. The first assertion must inspect both the browser URL and the persisted transaction:

```ts
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
```

Use `it.each` for exact callback rejection cases: `http`, wrong hostname, explicit port, wrong path, fragment, username/password, duplicate state/code/error/error_description, missing state, empty code, code plus error, more than 2,048 bytes, malformed URL, invalid flow format, expired transaction, wrong flow, wrong state, and replay. Assert file retention only for malformed structural cases; assert removal for expired/flow/state/OAuth/valid cases. Instantiate a second coordinator against the same file before consuming to prove process-restart continuity.

- [ ] **Step 2: Run the coordinator test and observe missing exports**

Run:

```bash
npm test -- --runInBand __tests__/blink-api/hosted-oauth.test.ts __tests__/blink-api/urls.test.ts
```

Expected: compilation fails on missing `HostedOAuthCoordinator` and OAuth profile exports.

- [ ] **Step 3: Implement current PKCE generation and explicit profiles**

Change `generateCodeVerifier()` to `crypto.randomBytes(64).toString('base64url')`; change `generateOAuthState()` to 32 bytes; add `generateOAuthFlowId()` with an independent 32-byte draw. Update REST identity constants to `APP_VERSION='57.1'`, `APP_BUILD='29715642'`, and `APP_BUILD_HEADER='ANDROID_29715642'`.

Create `src/blink-api/oauth-profile.ts` with these concrete profile values:

```ts
export const HOSTED_ANDROID_OAUTH_PROFILE = Object.freeze({
  clientId: 'android' as const,
  redirectUri: 'https://applinks.blink.com/signin/callback' as const,
  scope: 'client',
  refreshIncludesScope: true,
});

export const LEGACY_IOS_OAUTH_PROFILE = Object.freeze({
  clientId: 'ios' as const,
  redirectUri: 'immedia-blink://applinks.blink.com/signin/callback',
  scope: 'client',
  refreshIncludesScope: false,
});
```

`buildHostedAuthorizationUrl` must set every Global Constraints authorization field exactly once. `buildRefreshForm` must append scope only when `refreshIncludesScope` is true. `resolveOAuthProfile(undefined)` must return the legacy iOS profile to protect old refresh tokens.

- [ ] **Step 4: Implement the strict pending transaction state machine**

Create `src/blink-api/hosted-oauth.ts` with:

```ts
export const HOSTED_OAUTH_TTL_MS = 15 * 60 * 1000;
export const MAX_HOSTED_CALLBACK_BYTES = 2048;
const FLOW_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class HostedOAuthValidationError extends Error {
  constructor(
    message: string,
    public readonly category: 'malformed' | 'security' | 'expired' | 'oauth' | 'missing',
  ) {
    super(message);
    this.name = 'HostedOAuthValidationError';
  }
}

export class HostedOAuthCoordinator {
  constructor(private readonly options: {
    pendingFilePath: string;
    hardwareId: string;
    tier?: string;
    now?: () => number;
  }) {}

  async start(): Promise<BlinkHostedOAuthStart>;
  async consumeCallback(flowId: string, callbackUrl: string): Promise<BlinkHostedOAuthTokenRequest>;
  async cancel(): Promise<void>;
}
```

Parse and structurally validate the callback before loading/removing the pending file so an incomplete paste is retryable. After structure succeeds: load and schema-check the transaction, consume on expiry/flow/state failure, compare state only after checking equal byte lengths and then using `timingSafeEqual`, consume on a validated OAuth error, and remove before returning the code request. Never include supplied URL, state, code, verifier, or flow value in an error message.

If the pending file parses but fails its exact `version`, field, timestamp, client, redirect, or base64url schema, remove it and return the fixed `missing` category; never attempt to recover individual secret fields from malformed persisted state.

- [ ] **Step 5: Prove the complete callback matrix and commit**

Run:

```bash
npm test -- --runInBand __tests__/blink-api/hosted-oauth.test.ts __tests__/blink-api/urls.test.ts
npm run lint
npm run build
git add src/blink-api/oauth-profile.ts src/blink-api/hosted-oauth.ts src/blink-api/oauth-pkce.ts src/blink-api/headers.ts src/blink-api/urls.ts __tests__/blink-api/hosted-oauth.test.ts __tests__/blink-api/urls.test.ts
git commit -m "feat(auth): add hosted OAuth transaction coordinator"
```

Expected: every malformed/security/expiry/replay case has an explicit passing assertion and no secret value appears in Jest output.

---

### Task 3: Exact Android AppAuth exchange, durable capture, and profile-aware refresh

**Files:**
- Create: `__tests__/blink-api/auth-hosted.test.ts`
- Modify: `src/blink-api/auth.ts:386-620,1037-1250,1380-1460`
- Modify: `src/blink-api/http.ts:170-225`
- Modify: `__tests__/blink-api/auth.test.ts`
- Modify: `__tests__/blink-api/http.test.ts`

**Interfaces:**
- Consumes: `HostedOAuthCoordinator`, `BlinkHostedOAuthStart`, `BlinkHostedOAuthTokenRequest`, profile resolution/form builder, and Task 1 auth storage.
- Produces: `BlinkAuth.beginHostedLogin()`, `BlinkAuth.completeHostedLogin(flowId, callbackUrl)`, `BlinkAuth.cancelHostedLogin()`, `BlinkAuth.persistCurrentState()`, `BlinkHostedReauthenticationRequiredError`, persisted `oauthClientId`, and awaited token capture.

- [ ] **Step 1: Write failing exact-exchange and persistence-order tests**

Create `__tests__/blink-api/auth-hosted.test.ts`. Start through `BlinkAuth`, read only the test pending state, construct a matching callback, and mock one token response. Assert:

```ts
const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
expect(url).toBe('https://api.oauth.blink.com/oauth/token');
expect(init.headers).toEqual(expect.any(Headers));
expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
  grant_type: 'authorization_code',
  redirect_uri: 'https://applinks.blink.com/signin/callback',
  code: 'one-time-code',
  code_verifier: pending.codeVerifier,
  client_id: 'android',
});
expect((init.headers as Headers).get('content-type')).toBe('application/x-www-form-urlencoded');
expect((init.headers as Headers).get('accept')).toBe('application/json');
expect(Array.from((init.headers as Headers).keys()).sort()).toEqual(['accept', 'content-type']);
```

Use a deferred `BlinkAuthStorage.save` promise and assert `completeHostedLogin` remains unsettled until `save` resolves. Add tests that persistence rejection rejects completion and rolls back the in-memory token set, hosted bearer headers omit `TOKEN-AUTH`, a hosted refresh sends the exact four Android fields, and a loaded legacy state without `oauthClientId` sends the legacy iOS form without scope. Add a hosted refresh-failure assertion proving `ensureValidToken()` raises a fixed `BlinkHostedReauthenticationRequiredError` without invoking the direct email/password login path.

- [ ] **Step 2: Run the new suite and observe absent hosted methods**

Run:

```bash
npm test -- --runInBand __tests__/blink-api/auth-hosted.test.ts __tests__/blink-api/auth.test.ts
```

Expected: TypeScript compilation fails because `beginHostedLogin`, `completeHostedLogin`, `cancelHostedLogin`, `persistCurrentState`, and `BlinkHostedReauthenticationRequiredError` are not defined.

- [ ] **Step 3: Add hosted coordinator ownership and exact token exchange**

Initialize a coordinator only when `config.hostedOAuthPendingPath` is present. Add these exact public signatures:

```ts
async beginHostedLogin(): Promise<BlinkHostedOAuthStart>;
async completeHostedLogin(flowId: string, callbackUrl: string): Promise<void>;
async cancelHostedLogin(): Promise<void>;
async persistCurrentState(): Promise<void>;
```

`completeHostedLogin` must call `consumeCallback` once, then exchange the returned request. The hosted form is:

```ts
const formData = new URLSearchParams({
  grant_type: 'authorization_code',
  redirect_uri: request.redirectUri,
  code: request.authorizationCode,
  code_verifier: request.codeVerifier,
  client_id: request.oauthClientId,
});

const headers = new Headers({
  'Content-Type': 'application/x-www-form-urlencoded',
  Accept: 'application/json',
});
```

Do not call `buildOAuthHeaders`, attach cookies, or read `TOKEN-AUTH` for the hosted exchange. Call `await captureTokens(body, null, request.oauthClientId)`.

Add the fixed, non-secret error used when a hosted refresh token is no longer usable:

```ts
export class BlinkHostedReauthenticationRequiredError extends Error {
  constructor() {
    super('Blink sign-in has expired. Open the plugin settings and sign in securely with Blink again.');
    this.name = 'BlinkHostedReauthenticationRequiredError';
  }
}
```

- [ ] **Step 4: Make capture/persistence awaited and refresh client-specific**

Define the complete rollback snapshot next to `FetchResponse`:

```ts
interface CapturedTokenState {
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: Date | null;
  tokenAuth: string | null;
  oauthClientId: BlinkOAuthClientId | null;
  accountId: number | null;
  clientId: number | null;
  region: string | null;
  tier: string | null;
}
```

Implement `private snapshotTokenState(): CapturedTokenState` and `private restoreTokenState(snapshot: CapturedTokenState): void` by copying exactly those nine fields. Then change token capture to:

```ts
private async captureTokens(
  body: BlinkOAuthV2TokenResponse,
  tokenAuthHeader: string | null,
  oauthClientId?: BlinkOAuthClientId,
): Promise<void> {
  const previous = this.snapshotTokenState();
  this.accessToken = body.access_token;
  this.refreshToken = body.refresh_token ?? this.refreshToken;
  this.tokenExpiry = new Date(Date.now() + body.expires_in * 1000);
  this.tokenAuth = tokenAuthHeader;
  this.oauthClientId = oauthClientId ?? this.oauthClientId ?? 'ios';
  this.accountId = body.account_id ?? this.accountId;
  this.clientId = body.client_id ?? this.clientId;
  this.region = body.region ?? this.region;
  this.tier = body.tier ?? this.tier;
  try {
    await this.persistCurrentState();
  } catch (error) {
    this.restoreTokenState(previous);
    throw error;
  }
}
```

`snapshotTokenState` and `restoreTokenState` copy every field assigned by `captureTokens`, so a failed durable write cannot leave a browser-visible in-memory login. `persistCurrentState` must let storage errors propagate after a bounded log line; it must include `oauthClientId`. `applyState` must set `this.oauthClientId = state.oauthClientId ?? 'ios'`. Every legacy `captureTokens` call becomes `await captureTokens(..., 'ios')`; refresh resolves the loaded profile and awaits capture. Hosted refresh must use `buildRefreshForm('android', refreshToken)`.

When `ensureValidToken` cannot refresh an Android-hosted session, throw `BlinkHostedReauthenticationRequiredError` immediately; do not fall back to `login()` because that path requires credentials the hosted configuration intentionally does not have. In `src/blink-api/http.ts`, replace the 403 direct-login retry with one refresh retry, matching the 401 path; propagate the fixed reauthentication error when refresh is rejected. Preserve direct-login fallback only for a legacy iOS session that actually has both email and password.

- [ ] **Step 5: Run auth tests, verify no secret diagnostics, and commit**

Run:

```bash
npm test -- --runInBand __tests__/blink-api/auth-hosted.test.ts __tests__/blink-api/auth.test.ts __tests__/blink-api/http.test.ts
npm run lint
npm run build
git diff --check
git add src/blink-api/auth.ts src/blink-api/http.ts __tests__/blink-api/auth-hosted.test.ts __tests__/blink-api/auth.test.ts __tests__/blink-api/http.test.ts
git commit -m "feat(auth): exchange and persist hosted tokens"
```

Expected: exact form equality passes, deferred save proves ordering, storage failure rolls back memory, hosted and legacy refresh tests both pass, 403 never invokes direct hosted credential login, and `git diff --check` is empty.

---

### Task 4: Tier-first account bootstrap and APK-derived worldwide routing matrix

**Files:**
- Modify: `src/blink-api/client.ts:80-180,240-315,360-378`
- Modify: `src/types/blink-api.ts:65-97`
- Modify: `src/platform.ts:40-72,165-220`
- Modify: `__tests__/blink-api/client.test.ts`
- Modify: `__tests__/blink-api/urls.test.ts`
- Modify: `__tests__/platform.test.ts`

**Interfaces:**
- Consumes: Task 3 hosted auth methods and persisted OAuth profile; `v1/users/tier_info`, `v2/users/info`, and `v4/accounts/{id}/homescreen`.
- Produces: `BlinkApi.beginHostedLogin()`, `BlinkApi.completeHostedLogin(flowId, callbackUrl): Promise<BlinkHostedLoginResult>`, `BlinkApi.cancelHostedLogin()`, `BlinkRestVerificationRequiredError`, tier-first `syncAccountInfoAndVerify()`, and redacted verified/unverified result metadata.

- [ ] **Step 1: Write failing discovery-order and regional target tests**

Extend `__tests__/blink-api/client.test.ts` with ordered mocks that return `tier_info={account_id: 42,tier:'prde'}`, account info, then homescreen. Assert the first three post-token paths and base URLs are:

```ts
expect(events).toEqual([
  'https://rest-prod.immedia-semi.com/api/v1/users/tier_info',
  'https://rest-prde.immedia-semi.com/api/v2/users/info',
  'https://rest-prde.immedia-semi.com/api/v4/accounts/42/homescreen',
  'persist',
]);
```

Extend `__tests__/blink-api/urls.test.ts` with an APK-evidence matrix:

```ts
it.each([
  ['prod', 'https://rest-prod.immedia-semi.com/api/'],
  ['prde', 'https://rest-prde.immedia-semi.com/api/'],
  ['prsg', 'https://rest-prsg.immedia-semi.com/api/'],
  ['a001', 'https://rest-a001.immedia-semi.com/api/'],
  ['cemp', 'https://rest-cemp.immedia-semi.com/api/'],
  ['srf1', 'https://rest-srf1.immedia-semi.com/api/'],
  ['e001', 'https://rest-e001.immedia-semi.com/api/'],
  ['e002', 'https://rest-e002.immedia-semi.com/api/'],
  ['e003', 'https://rest-e003.immedia-semi.com/api/'],
  ['e004', 'https://rest-e004.immedia-semi.com/api/'],
  ['e005', 'https://rest-e005.immedia-semi.com/api/'],
  ['e006', 'https://rest-e006.immedia-semi.com/api/'],
])('routes APK-accepted tier %s to %s', (tier, expected) => {
  expect(getRestBaseUrl({ ...baseConfig, tier })).toBe(expected);
});
```

The test comment must distinguish explicit `ProductionTier` constants (`prod/prde/prsg/a001/cemp/srf1`) from `TierRepository`'s four-alphanumeric-character acceptance (`e001`-`e006`).

Add a second parameterized assertion showing that `prod`, `prde`, `prsg`, `a001`, `cemp`, `srf1`, and `e001`-`e006` all use `https://api.oauth.blink.com/oauth/token`, while only the APK staging tier `sqa1` maps to `https://api.qa.oauth.blink.com/oauth/token`. This is the automated proof that production users get the same hosted sign-in target before account-specific REST discovery.

Add client tests for both post-token branches: a typed client/account verification requirement returns `authenticated:true`, `verified:false`, and the matching requirement; an arbitrary homescreen failure returns `verificationRequirement:'connection'` while the already-written token state remains available. Assert neither result contains the upstream error string.

- [ ] **Step 2: Run client/platform/URL suites and observe the current wrong ordering**

Run:

```bash
npm test -- --runInBand __tests__/blink-api/client.test.ts __tests__/blink-api/urls.test.ts __tests__/platform.test.ts
```

Expected: the discovery-order assertion fails because `v2/users/info` currently runs before `v1/users/tier_info`; hosted wrapper/result tests fail because the methods and typed verification error are absent.

- [ ] **Step 3: Implement hosted wrappers and tier-first bootstrap**

Add:

```ts
export class BlinkRestVerificationRequiredError extends Error {
  constructor(public readonly type: 'client' | 'account') {
    super(`Blink ${type} verification required`);
    this.name = 'BlinkRestVerificationRequiredError';
  }
}

export interface BlinkHostedLoginResult {
  authenticated: true;
  verified: boolean;
  verificationRequirement?: 'client' | 'account' | 'connection';
  accountId?: number;
  clientId?: number;
  email?: string;
  tier?: string;
  networkCount: number;
  cameraCount: number;
}
```

Add `private buildUnverifiedHostedResult(error: unknown): BlinkHostedLoginResult`; it returns existing redacted account/email/tier metadata, `networkCount:0`, `cameraCount:0`, and a requirement selected only by `error instanceof BlinkRestVerificationRequiredError` (otherwise `connection`).

The client methods are:

```ts
async beginHostedLogin(): Promise<BlinkHostedOAuthStart> {
  return this.auth.beginHostedLogin();
}

async completeHostedLogin(flowId: string, callbackUrl: string): Promise<BlinkHostedLoginResult> {
  await this.auth.completeHostedLogin(flowId, callbackUrl);
  try {
    await this.syncAccountInfoAndVerify();
    const homescreen = await this.getHomescreen();
    await this.auth.persistCurrentState();
    return {
      authenticated: true,
      verified: true,
      accountId: this.accountId ?? undefined,
      clientId: this.clientId ?? undefined,
      email: this.config.email || undefined,
      tier: this.config.tier,
      networkCount: homescreen.networks?.length ?? 0,
      cameraCount: homescreen.cameras?.length ?? 0,
    };
  } catch (error) {
    await this.auth.persistCurrentState();
    return this.buildUnverifiedHostedResult(error);
  }
}
```

Introduce `BlinkRestVerificationRequiredError` with public `type: 'client' | 'account'`; throw it from the two existing verification handlers instead of matching error-message substrings. `buildUnverifiedHostedResult` maps that typed error to its corresponding requirement and maps every other post-token error to `verificationRequirement: 'connection'`, always with `verified:false`, zero counts, and no upstream message. This preserves the already-durable tokens and accurately reports “signed in, connection not yet verified.”

Reorder `syncAccountInfoAndVerify`: fetch tier info first through bootstrap `prod`; update all base URLs; then fetch account info; copy account/client/email/region/tier into auth/config; run existing client/account verification handlers; persist metadata. Leave a warning and bootstrap fallback when tier lookup fails.

- [ ] **Step 4: Keep platform startup credential-free and region-neutral**

Ensure `BlinkPlatformConfig` no longer constrains tier to a closed union; use `tier?: string` and `sharedTier?: string`, because the APK accepts any four-alphanumeric tier returned by the service. Keep the paired-credential validation only for legacy manual config: no username/password remains valid and logs token-auth startup. Pass `hostedOAuthPendingPath` only from the UI server, not the long-running platform.

- [ ] **Step 5: Run regional, platform, and client gates and commit**

Run:

```bash
npm test -- --runInBand __tests__/blink-api/client.test.ts __tests__/blink-api/urls.test.ts __tests__/platform.test.ts
npm run lint
npm run build
git add src/blink-api/client.ts src/types/blink-api.ts src/platform.ts __tests__/blink-api/client.test.ts __tests__/blink-api/urls.test.ts __tests__/platform.test.ts
git commit -m "feat(auth): discover and persist Blink account tier"
```

Expected: EU and non-EU matrix passes without a non-EU live-account claim; the client order proves the discovered tier controls account and homescreen hosts.

---

### Task 5: Credential-free Homebridge UI server API

**Files:**
- Create: `src/homebridge-ui/hosted-auth-service.ts`
- Create: `__tests__/homebridge-ui/hosted-auth-service.test.ts`
- Modify: `src/homebridge-ui/server.ts:1-550`
- Modify: `src/homebridge-ui/auth-state.ts:1-75`
- Modify: `__tests__/homebridge-ui/auth-state.test.ts`

**Interfaces:**
- Consumes: Task 4 `BlinkApi` hosted methods, Homebridge storage root, Plugin UI Utils `onRequest`, `RequestError`, and redacted status events.
- Produces: `POST /auth/start`, `POST /auth/complete`, refresh-aware `/status`, retained `/verify` for `client|account`, token-only `/test-connection`, and cleanup of `.blink-auth-pending.json` on logout/unlock.

- [ ] **Step 1: Write failing domain-service tests with a fake BlinkApi**

Create `__tests__/homebridge-ui/hosted-auth-service.test.ts` and inject an API factory. Assert exact normalized config and payload boundaries:

```ts
expect(apiFactory).toHaveBeenCalledWith(expect.objectContaining({
  email: '',
  password: '',
  hardwareId: 'homebridge-blink',
  tier: 'prod',
  authStoragePath: path.join(storageRoot, '.blink-auth.json'),
  hostedOAuthPendingPath: path.join(storageRoot, '.blink-auth-pending.json'),
}));
expect(await service.start({ deviceId: ' homebridge-blink ' })).toEqual({
  authorizationUrl: 'https://api.oauth.blink.com/oauth/v2/authorize?...',
  flowId: 'opaque-flow-id',
  expiresAt: '2026-07-16T12:15:00.000Z',
});
```

Add invalid device ID, invalid/extra flow, blank/oversized callback, verified success, signed-in-but-unverified status, post-token verification-required, token-only connection test, logout, and unlock tests. Add a restart test whose saved access token is expired but whose Android refresh token is valid: `status()` must create a credential-free API, await `login()`/refresh, and return authenticated status. Assert returned errors do not contain fake callback/code/state/token strings.

Modify `__tests__/homebridge-ui/auth-state.test.ts` so an expired state with a refresh token returns `{ state, requiresRefresh: true }`, while an expired state without a refresh token remains ignored. The state object stays server-side and is never returned by a UI route.

- [ ] **Step 2: Run service tests and observe the missing module**

Run:

```bash
npm test -- --runInBand __tests__/homebridge-ui/hosted-auth-service.test.ts
```

Expected: compilation fails because `hosted-auth-service.ts` is absent.

- [ ] **Step 3: Implement the testable hosted-auth service**

Create the service with exact request types:

```ts
export interface HostedAuthStartRequest {
  deviceId?: string;
}

export interface HostedAuthCompleteRequest {
  flowId: string;
  callbackUrl: string;
}

export interface VerifyRequest {
  code: string;
  type: 'client' | 'account';
  trustDevice?: boolean;
}

export interface AuthStatus {
  authenticated: boolean;
  verified?: boolean;
  requiresClientVerification?: boolean;
  requiresAccountVerification?: boolean;
  email?: string;
  accountId?: number;
  tier?: string;
  message?: string;
}

export class HostedAuthService {
  constructor(private readonly options: {
    storageRoot: string;
    logger: BlinkLogger;
    apiFactory?: (config: BlinkConfig) => BlinkApi;
  }) {}

  async start(payload: HostedAuthStartRequest): Promise<BlinkHostedOAuthStart>;
  async complete(payload: HostedAuthCompleteRequest): Promise<AuthStatus>;
  async status(): Promise<AuthStatus>;
  async verify(payload: VerifyRequest): Promise<AuthStatus>;
  async testConnection(payload: { deviceId?: string }): Promise<{ success: boolean; message: string }>;
  async clear(): Promise<void>;
}
```

Allow device IDs matching `^[A-Za-z0-9._-]{1,128}$`, default to `homebridge-blink`, and always begin hosted OAuth with bootstrap tier `prod`. Retain the same `BlinkApi` instance for immediate post-token client/account verification. Map Task 4 results so `authenticated:true, verified:false` remains signed in and displays either distinct verification guidance or the bounded “tokens stored; connection verification failed” message. Convert internal categories to fixed user-facing messages; never embed `error.message` when it can contain upstream data.

Extend `PersistedAuthStateLoadResult` with `requiresRefresh?: boolean`. `status()` loads the owner-only file; when a state has expired but includes `refreshToken`, build the API using only its persisted `hardwareId`/`tier` plus the storage paths, call `api.login()` to refresh and rediscover, then return redacted status. A `BlinkHostedReauthenticationRequiredError` returns logged-out status with the fixed fresh-sign-in instruction. A valid non-expired state may return redacted metadata without exposing token fields.

- [ ] **Step 4: Replace credential routes in `BlinkUiServer`**

Register:

```ts
this.registerRequest('/auth/start', this.handleAuthStart.bind(this));
this.registerRequest('/auth/complete', this.handleAuthComplete.bind(this));
this.registerRequest('/verify', this.handleVerify.bind(this));
this.registerRequest('/status', this.handleStatus.bind(this));
this.registerRequest('/logout', this.handleLogout.bind(this));
this.registerRequest('/lock', this.handleLock.bind(this));
this.registerRequest('/unlock', this.handleUnlock.bind(this));
this.registerRequest('/test-connection', this.handleTestConnection.bind(this));
```

Delete `/login`, `LoginRequest`, email/password validation, and random device ID generation. `/verify` rejects `type='2fa'`; it accepts only post-token `client` or `account`. `registerRequest` logs route and a bounded category only, never raw callback-bearing errors. Extend redaction to query-style `code`, `state`, and `error_description`. Logout/unlock clear auth, legacy auth, and pending transaction files.

Delegate `/status` to `HostedAuthService.status()` so an expired access token with a usable refresh token is refreshed rather than incorrectly displayed as logged out.

- [ ] **Step 5: Run server-domain and auth-state gates and commit**

Run:

```bash
npm test -- --runInBand __tests__/homebridge-ui/hosted-auth-service.test.ts __tests__/homebridge-ui/auth-state.test.ts
npm run lint
npm run build
git add src/homebridge-ui/hosted-auth-service.ts src/homebridge-ui/server.ts src/homebridge-ui/auth-state.ts __tests__/homebridge-ui/hosted-auth-service.test.ts __tests__/homebridge-ui/auth-state.test.ts
git commit -m "feat(ui): expose hosted Blink authentication routes"
```

Expected: server build contains no `/login` registration, service tests prove no credential input, expired hosted state refreshes correctly, and the UI server compiles against Plugin UI Utils 2.1.2.

---

### Task 6: Brave hosted launch and clipboard finish UI

**Files:**
- Modify: `src/homebridge-ui/public/index.html:1-906`
- Modify: `__tests__/schema-auth-ui.test.ts`

**Interfaces:**
- Consumes: `/auth/start`, `/auth/complete`, `/verify`, `/status`, Homebridge request/config APIs, browser `window.open`, and Clipboard API.
- Produces: signed-out start screen, waiting/callback screen, manual paste fallback, post-token verification screen, success screen, and sanitized plugin config.

- [ ] **Step 1: Replace stale static assertions with failing hosted-flow assertions**

In `__tests__/schema-auth-ui.test.ts`, assert all of the following exact contracts:

```ts
expect(html).not.toMatch(/type=["']password["']/i);
expect(html).not.toContain("homebridge.request('/login'");
expect(html).not.toContain("type: '2fa'");
expect(html).not.toMatch(/id=["']username["']/i);
expect(html).toContain("homebridge.request('/auth/start'");
expect(html).toContain("homebridge.request('/auth/complete'");
expect(html).toContain("window.open('about:blank', '_blank'");
expect(html).toContain('blinkWindow.opener = null');
expect(html).toContain('navigator.clipboard.readText()');
expect(html).toContain('manualCallbackForm');
expect(html).toContain('callbackInput.value =');
expect(html).toContain("delete config.username");
expect(html).toContain("delete config.password");
expect(html).toContain("delete config.twoFactorCode");
expect(html).toContain("delete config.clientVerificationCode");
expect(html).toContain("delete config.accountVerificationCode");
expect(html).toContain('Blink tokens are stored');
expect(html).toContain('data.verified === false');
expect(html).not.toContain('Your credentials have been saved');
```

Also assert the Clipboard read appears inside the click handler body, the fallback link receives only `response.authorizationUrl`, and no callback is assigned to localStorage/sessionStorage/config.

- [ ] **Step 2: Run the static UI suite and observe the direct-login failures**

Run:

```bash
npm test -- --runInBand __tests__/schema-auth-ui.test.ts
```

Expected: failures identify the password input, `/login`, hosted 2FA option, stale copy, and missing clipboard/popup contracts.

- [ ] **Step 3: Implement the signed-out and waiting screens**

Replace email/password/region fields with optional advanced device ID and one button, **Sign in securely with Blink**. Its click sequence is exact:

```js
let blinkWindow = window.open('about:blank', '_blank');
if (blinkWindow) blinkWindow.opener = null;
try {
  const response = await homebridge.request('/auth/start', {
    deviceId: deviceIdValue || 'homebridge-blink'
  });
  activeFlowId = response.flowId;
  if (blinkWindow) {
    blinkWindow.location.replace(response.authorizationUrl);
  } else {
    fallbackLink.href = response.authorizationUrl;
    fallbackLink.classList.remove('hidden');
  }
  showStep('callback');
} catch (error) {
  if (blinkWindow) blinkWindow.close();
  showError('Blink sign-in could not be started. Please try again.');
}
```

The waiting screen explains: finish Blink password/MFA in Brave, copy the complete final address after the Unsupported Browser page appears, return to Homebridge, and click **Paste Blink Result and Finish**.

- [ ] **Step 4: Implement clipboard and manual completion with immediate clearing**

Use one completion function:

```js
async function completeHostedAuth(callbackUrl) {
  let submitted = callbackUrl;
  callbackUrl = '';
  callbackInput.value = '';
  try {
    const completionRequest = homebridge.request('/auth/complete', {
      flowId: activeFlowId,
      callbackUrl: submitted
    });
    submitted = '';
    const response = await completionRequest;
    activeFlowId = '';
    try { await navigator.clipboard.writeText(''); } catch { /* best effort */ }
    handleAuthResponse(response);
  } finally {
    submitted = '';
    callbackUrl = '';
    callbackInput.value = '';
  }
}
```

The clipboard button calls `navigator.clipboard.readText()` only inside its direct click callback. On permission/read failure, reveal `manualCallbackForm`, focus its textarea, and preserve `activeFlowId`. A malformed callback keeps the waiting screen and enables retry; a security/expired error clears `activeFlowId` and returns to the fresh-start screen.

- [ ] **Step 5: Preserve only distinct post-token verification and sanitize config**

The verification screen accepts only `client` and `account`. On successful hosted completion:

```js
const config = pluginConfig[0] || { platform: 'BlinkCameras', name: 'Blink' };
config.deviceId = deviceIdValue || config.deviceId || 'homebridge-blink';
config.tier = data.tier || config.tier || 'prod';
config.persistAuth = true;
delete config.username;
delete config.email;
delete config.password;
delete config.twoFactorCode;
delete config.clientVerificationCode;
delete config.accountVerificationCode;
```

Await `updatePluginConfig`; show “Blink tokens are stored and verified”; then show the schema form. Do not display account counts from the live test in general UI copy.

When `data.authenticated === true` and `data.verified === false`, still save the sanitized token-only configuration. Show a warning badge and either the client/account verification screen or “Blink tokens are stored, but the connection could not yet be verified”; keep **Test Connection** available. Show the fully successful copy only when `verified !== false`.

- [ ] **Step 6: Build copied assets, inspect generated UI, and commit**

Run:

```bash
npm test -- --runInBand __tests__/schema-auth-ui.test.ts
npm run lint
npm run build
cmp src/homebridge-ui/public/index.html dist/homebridge-ui/public/index.html
rg -n "password|/login|type: '2fa'|credentials have been saved" src/homebridge-ui/public/index.html dist/homebridge-ui/public/index.html
git add src/homebridge-ui/public/index.html __tests__/schema-auth-ui.test.ts
git commit -m "feat(ui): launch Blink hosted sign-in from Homebridge"
```

Expected: `cmp` exits 0; the final `rg` has no credential-flow matches except bounded explanatory copy that explicitly says Homebridge never receives the password/MFA.

---

### Task 7: Authentication documentation, release version, and repository-wide quality gates

**Files:**
- Create: `__tests__/authentication-docs.test.ts`
- Modify: `README.md`
- Modify: `docs/adr/001-authentication.md`
- Modify: `docs/integration_checklist.md`
- Modify: `docs/blink_api_dossier.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: passing implementation/tests, approved design, APK 57.1 trace, live EU proof, and the non-EU evidence boundary.
- Produces: accurate operator instructions, canonical architecture record, target table, residual-risk statement, and version `0.9.0`.

- [ ] **Step 1: Add a failing documentation regression test before rewriting prose**

Create `__tests__/authentication-docs.test.ts` with a local `readText(relativePath)` helper and these assertions:

```ts
const docs = ['README.md', 'docs/adr/001-authentication.md', 'docs/integration_checklist.md']
  .map(readText)
  .join('\n');
expect(docs).toContain('Paste Blink Result and Finish');
expect(docs).toContain('https://applinks.blink.com/signin/callback');
expect(docs).toContain('oauthClientId');
expect(docs).not.toMatch(/password grant/i);
expect(docs).not.toMatch(/enter your Blink password (?:in|into) Homebridge/i);
expect(docs).not.toMatch(/Homebridge.*OAuth MFA code/i);
```

Run the focused suite and observe failure on stale documentation.

- [ ] **Step 2: Rewrite the README and canonical ADR**

README authentication instructions must cover: open plugin settings at the remote Homebridge UI, click hosted sign-in, complete credentials/MFA only on Blink, copy the final App-Link address, click clipboard finish, manual paste fallback, token storage, restart behavior, logout, and private-API risk.

Replace `docs/adr/001-authentication.md` with the accepted hosted architecture: Pi trust boundary, Android profile, callback validation, pending/final file lifecycle, exact exchange/refresh forms, tier-first discovery, post-token verification, legacy iOS refresh migration, and no public callback service. Remove statements that password grant is initial auth, credentials are stored plaintext, token persistence is absent, or Homebridge consumes hosted MFA.

- [ ] **Step 3: Rebuild the integration checklist and APK dossier evidence**

The checklist must separate automated gates, EU live acceptance, restart/refresh, rollback, and best-effort regional coverage.

In `docs/blink_api_dossier.md`, add a concise trace table:

| Behavior | APK 57.1 source | Repository contract |
|---|---|---|
| Hosted authorize path/metadata | `UnifiedSignInUtils.signInIntent` | Android profile and coordinator URL |
| HTTPS callback | `AppLinkUrls.SIGN_IN_CALLBACK` | strict callback allow-list |
| AppAuth code form | `TokenRequest` + `NoClientAuthentication` | exact five fields, no extras |
| Refresh form | `OauthApi.postRefreshTokens` | Android client + scope |
| Dynamic REST host | `BaseUrls.REST` / `SHARED_REST` | `rest-{tier}` / `rest-{shared_tier}` |
| Explicit production tiers | `ProductionTier` | prod, prde, prsg, a001, cemp, srf1 |
| Service-returned tier acceptance | `TierRepository` regex `[a-zA-Z\\d]{4}` | numbered e-tier routing without UI guess |

State: only `prde` was live-tested through the owner’s Ireland account; all other listed targets are APK-evidenced and covered by mocks. Explain that the user journey is the same and only post-token REST routing changes.

- [ ] **Step 4: Version to 0.9.0 and add the changelog entry**

Run:

```bash
npm version 0.9.0 --no-git-tag-version
```

Add a dated `0.9.0` changelog section with hosted Blink sign-in, exact Android refresh, secure restart-safe pending state, tier-first global routing, removal of direct credentials/MFA from UI, and documentation correction. Do not call the feature fully live-verified outside EU.

- [ ] **Step 5: Run full local quality, audit, and package-content gates**

Run:

```bash
npm test -- --runInBand
npm run lint
npm run build
npm audit --omit=dev
npm pack --dry-run --json > /tmp/homebridge-blink-pack-dry-run.json
node -e "const p=require('/tmp/homebridge-blink-pack-dry-run.json')[0]; const bad=p.files.map(f=>f.path).filter(f=>/(^|\/)(logs|decompiled|\.blink-auth|\.vscode)(\/|$)|\.apk$|callback|token-response/i.test(f)); if(bad.length){console.error(bad.join('\\n'));process.exit(1)} console.log(p.filename, p.files.length)"
git diff --check
```

Expected: all Jest suites pass, lint/build pass, production audit reports zero known vulnerabilities, package inspection finds no forbidden artifact, and whitespace check is empty.

- [ ] **Step 6: Run a focused secret and stale-claim scan, then commit**

Run:

```bash
rg -n "access_token|refresh_token|authorization code|code_verifier|state=" README.md docs src __tests__ --glob '!docs/superpowers/**'
rg -n "password grant|credentials have been saved|enter your Blink password|OAuth MFA" README.md docs src/homebridge-ui
git status --short
git add README.md docs/adr/001-authentication.md docs/integration_checklist.md docs/blink_api_dossier.md CHANGELOG.md package.json package-lock.json __tests__/authentication-docs.test.ts
git commit -m "docs(auth): document Blink hosted OAuth workflow"
```

Review every secret-scan match as protocol prose or fixture placeholder; no live value may remain. Expected status still lists the two unrelated untracked user files.

---

### Task 8: Package, deploy, live EU acceptance, rollback safety, and landing

**Files:**
- Verify only: repository working tree and packed tarball
- Remote runtime: `andrew@raspberrypi.local:/var/lib/homebridge`
- Remote auth state: `/var/lib/homebridge/.blink-auth.json`
- Remote pending state: `/var/lib/homebridge/.blink-auth-pending.json`
- Temporary package: repository-generated `.tgz`, removed after successful installation

**Interfaces:**
- Consumes: version 0.9.0 package, Homebridge service commands, Brave, iCloud Keychain operator action, Messages MFA operator action, and the owner’s EU/Ireland account.
- Produces: live hosted login proof, file-mode/restart/refresh/device-discovery evidence, rollback capability, final Beads closure, conventional commit(s), and pushed `main`.

- [ ] **Step 1: Create a metadata-only protected rollback backup on the Pi**

Run without reading auth contents:

```bash
ssh andrew@raspberrypi.local 'set -eu; stamp=$(date -u +%Y%m%dT%H%M%SZ); if sudo test -f /var/lib/homebridge/.blink-auth.json; then sudo install -o root -g root -m 600 /var/lib/homebridge/.blink-auth.json /home/andrew/.blink-auth.json.pre-hosted-$stamp; sudo stat -c "%n %U:%G %a %s" /home/andrew/.blink-auth.json.pre-hosted-$stamp; else echo "no existing auth state"; fi'
```

Expected: only filename, ownership, mode, and byte count are printed; no JSON or token material appears.

- [ ] **Step 2: Build, pack, transfer, and install the exact local commit**

Run:

```bash
npm ci
npm test -- --runInBand
npm run lint
npm run build
npm pack
PACKAGE=$(ls -1t sealad886-homebridge-blink-cameras-new-api-0.9.0.tgz | head -n 1)
scp "$PACKAGE" andrew@raspberrypi.local:/home/andrew/
ssh andrew@raspberrypi.local "sudo /usr/local/bin/hb-service add /home/andrew/$PACKAGE && sudo /usr/local/bin/hb-service restart"
ssh andrew@raspberrypi.local '/opt/homebridge/bin/node /var/lib/homebridge/node_modules/homebridge/bin/homebridge.js -V; sudo systemctl is-active homebridge; sudo /usr/local/bin/hb-service status'
```

Expected: Homebridge version prints, service is active, and installed package reports 0.9.0. Do not print environment or config files.

- [ ] **Step 3: Complete the authorized EU/Ireland hosted flow in Brave**

Open `http://raspberrypi.local:8581` in Brave, open **Homebridge Blink Cameras (New API)** settings, click **Sign in securely with Blink**, use iCloud Keychain’s Amazon.co.uk/Blink credential only inside Blink’s hosted page, read the newest Blink MFA from Messages and enter it only into Blink, copy the final `https://applinks.blink.com/signin/callback?...` address, and click **Paste Blink Result and Finish**.

Record only bounded outcomes: hosted page reached, MFA accepted, callback accepted, success displayed, tier label `prde`, and device discovery count equality with the pre-test installation. Never record the callback, code, state, token, email, device names, or message contents.

- [ ] **Step 4: Verify durable owner-only state and no stranded pending transaction**

Run:

```bash
ssh andrew@raspberrypi.local 'sudo stat -c "%n %U:%G %a %s" /var/lib/homebridge/.blink-auth.json; if sudo test -e /var/lib/homebridge/.blink-auth-pending.json; then sudo stat -c "%n %U:%G %a %s" /var/lib/homebridge/.blink-auth-pending.json; exit 1; else echo "pending transaction absent"; fi'
```

Expected: final auth state belongs to `homebridge:homebridge` with mode `600`; pending transaction is absent. Do not read file contents.

- [ ] **Step 5: Restart Homebridge and prove persisted Android refresh/discovery**

Run:

```bash
ssh andrew@raspberrypi.local 'sudo /usr/local/bin/hb-service restart; sudo systemctl is-active homebridge'
```

Reopen plugin settings in Brave; confirm it restores authenticated status without username/password/MFA and the same EU tier and device inventory. Use **Test Connection** and confirm homescreen access. Inspect only redacted service log lines for successful refresh/discovery; never request raw auth-state or debug bodies.

- [ ] **Step 6: Execute rollback only if a live acceptance gate fails**

If a gate fails, reinstall the known 0.8.1 package, stop Homebridge before restoring the untouched backup with `homebridge:homebridge` ownership and mode `0600`, remove pending state, restart, and verify service/device recovery. Record the failure category without secret-bearing data, create a Beads issue linked with `discovered-from:homebridge-blinkcameras-2yh`, and leave the main issue open.

If all gates pass, retain the new hosted token state and delete the temporary transferred tarball; retain the root-owned rollback backup until the user explicitly asks to remove it.

- [ ] **Step 7: Update Beads, inspect the final diff, commit any acceptance-only correction, and push**

Run:

```bash
bd update homebridge-blinkcameras-2yh --notes "EU/Ireland live hosted OAuth accepted on raspberrypi.local: Homebridge UI launch, Blink-hosted credentials/MFA, clipboard callback completion, prde tier discovery, owner-only token persistence, restart, Android refresh, homescreen, and device rediscovery verified. Non-EU targets remain APK-evidenced plus parameterized/mocked, not live-account tested." --json
bd close homebridge-blinkcameras-2yh --reason "Hosted OAuth implemented, documented, locally verified, and live-tested on the authorized EU account" --json
git status --short --branch
git log --oneline --decorate -8
git pull --rebase
bd dolt push
git push
git status --short --branch
```

If live acceptance required a tracked correction, run the focused failing test first, implement it, rerun full gates, and commit it with a scoped Conventional Commit before closing Beads. Final status must show `main...origin/main` with only `.vscode/` and `__tests__/.DS_Store` untracked.

---

## Completion evidence to report

- Exact commits and changed files for each task.
- Red/green test command evidence plus full Jest, lint, build, audit, package inspection, and `git diff --check` outcomes.
- EU/Ireland live result on `raspberrypi.local`, including hosted flow, `prde` discovery, owner/mode metadata, restart, refresh, homescreen, and unchanged device discovery, without account secrets.
- Non-EU evidence statement: explicit APK production tier constants and four-character dynamic tier acceptance, plus passing target matrix; no non-EU live-account claim.
- Remaining bounded risk: Blink OAuth and REST APIs are private/undocumented and may change independently of this plugin.
- Final Beads state, pushed commit hash, and confirmation that unrelated untracked files were untouched.
