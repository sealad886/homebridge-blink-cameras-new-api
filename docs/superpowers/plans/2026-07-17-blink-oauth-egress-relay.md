# Blink OAuth Egress-Matched Acceptance Implementation Plan

> Historical design/execution evidence, not current operational instructions.
> [ADR-001](../../adr/001-authentication.md) owns authentication decisions;
> [RELEASE.md](../../RELEASE.md) owns release and installation procedures.
> Any temporary relay, tunnel, service change or live acceptance recipe below
> remains historical and requires separate explicit authorization before reuse.
> See the [documentation map](../../README.md). Original outcomes and incomplete
> acceptance cases are preserved below; no later completion is inferred.

> Historical implementation recipe. Beads was retired on 2026-09-15; use GitHub issues and `docs/RELEASE.md` for current tracking and release commands.
> Historical checkboxes record the original scope. They do not activate a workflow
> or authorize execution; follow current repository instructions for new work.

**Goal:** Determine whether Blink accepts the Homebridge-hosted authorization-code flow when browser authorization and Pi-side token exchange share one public egress, persist any successful session through the real plugin path, roll back all temporary routing, and update canonical authentication documentation with the result.

**Architecture:** A tested, git-ignored Node HTTP `CONNECT` relay binds only to Mac loopback. An authenticated reverse SSH forward exposes it only on Raspberry Pi loopback, and a temporary systemd drop-in enables Node 24's built-in HTTPS proxy support for the Homebridge process. TLS stays end to end between Homebridge and Blink; the relay never decrypts or records OAuth traffic. One live Brave flow is allowed only after isolated relay, tunnel, egress, service, and rollback preflights pass.

**Tech Stack:** Node.js 24 built-in `net`, built-in test runner, OpenSSH reverse forwarding, systemd, Homebridge custom UI, Brave through Computer Use, Jest documentation contract tests, Markdown. Node proxy behavior is grounded in the official [Node.js 24 built-in proxy documentation](https://nodejs.org/download/release/latest-v24.x/docs/api/http.html#built-in-proxy-support).

## Global Constraints

- Historical tracker reference: `homebridge-blinkcameras-2yh`; current outstanding work is reconciled in GitHub.
- The live account is European-region. Non-EU conclusions remain APK-derived and parameterized/static unless separately live-tested.
- Never emit, inspect, persist in diagnostics, or document credentials, MFA values, callback URLs or query parameters, authorization codes, state, PKCE material, tokens, account/email/phone/device identifiers, auth-file contents, or public IP addresses.
- Never decrypt TLS. The relay may observe only a fixed allowlisted CONNECT authority and connection lifecycle.
- Do not clear or replace the official Blink app, Brave profile, Keychain data, Homebridge configuration, or existing auth files.
- Preserve user-owned `.vscode/` and `__tests__/.DS_Store` unchanged.
- Permit at most one fresh live OAuth attempt in this plan. If a CAPTCHA appears, stop for action-time user confirmation.
- No live login starts until the relay tests, reverse tunnel, matched-egress probe, Blink-only live-mode probe, systemd validation, Homebridge restart, proxy-environment check, and rollback assets all pass.
- Roll back the systemd drop-in and both relay processes after success, failure, interruption, or cancellation.
- Match the service runtime when reproducing the experiment; its historical runtime was Node 24.18.0.
- The historical experiment used loopback port `18765`; any reproduction must independently verify availability.
- The relay source, tests, and run card live under ignored `logs/blink-oauth-egress-relay/` and must not be staged or committed.
- Every Git commit follows Conventional Commits. Do not push until the full acceptance task and documentation gates are complete.

---

### Task 1: Build the secret-blind loopback CONNECT relay

**Files:**
- Create, ignored: `logs/blink-oauth-egress-relay/connect-proxy.test.mjs`
- Create, ignored: `logs/blink-oauth-egress-relay/connect-proxy.mjs`
- Create, ignored: `logs/blink-oauth-egress-relay/run-card.md`

**Interfaces:**
- Consumes: Node.js 24 built-in `net`, `process`, and `node:test` APIs.
- Produces: `parseConnectRequest(input, { allowProbe })`, `isAllowedHostname(hostname, { allowProbe })`, and `createRelay({ host, port, allowProbe })`; CLI environment variables `BLINK_OAUTH_RELAY_PORT` and `BLINK_OAUTH_RELAY_ALLOW_PROBE`.

- [ ] **Step 1: Write the failing parser and allowlist tests**

Create `connect-proxy.test.mjs` with fixed, non-secret fixtures:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_CONNECT_HEADER_BYTES,
  isAllowedHostname,
  parseConnectRequest,
} from './connect-proxy.mjs';

const request = (authority, method = 'CONNECT') =>
  Buffer.from(`${method} ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`, 'latin1');

test('accepts only the Blink OAuth host and four-character REST tiers', () => {
  assert.equal(isAllowedHostname('api.oauth.blink.com'), true);
  assert.equal(isAllowedHostname('rest-prod.immedia-semi.com'), true);
  assert.equal(isAllowedHostname('rest-prde.immedia-semi.com'), true);
  assert.equal(isAllowedHostname('rest-e001.immedia-semi.com'), true);
  assert.equal(isAllowedHostname('oauth.blink.com'), false);
  assert.equal(isAllowedHostname('rest-production.immedia-semi.com'), false);
  assert.equal(isAllowedHostname('rest-prod.immedia-semi.com.example.org'), false);
});

test('permits the egress probe host only in explicit probe mode', () => {
  assert.equal(isAllowedHostname('api.ipify.org'), false);
  assert.equal(isAllowedHostname('api.ipify.org', { allowProbe: true }), true);
});

test('parses a canonical CONNECT request and preserves buffered tunnel bytes', () => {
  const head = Buffer.from('tls-placeholder');
  const parsed = parseConnectRequest(Buffer.concat([
    request('api.oauth.blink.com:443'),
    head,
  ]));
  assert.deepEqual(parsed, {
    hostname: 'api.oauth.blink.com',
    port: 443,
    remainder: head,
  });
});

test('returns null for a bounded incomplete request', () => {
  assert.equal(parseConnectRequest(Buffer.from('CONNECT api.oauth.blink.com:443')), null);
});

for (const [name, raw] of [
  ['non-CONNECT method', request('api.oauth.blink.com:443', 'GET')],
  ['non-TLS port', request('api.oauth.blink.com:80')],
  ['userinfo authority', request('user@api.oauth.blink.com:443')],
  ['path-bearing authority', request('api.oauth.blink.com:443/path')],
  ['lookalike host', request('api.oauth.blink.com.example.org:443')],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(() => parseConnectRequest(raw), /Relay request rejected/);
  });
}

test('rejects an oversized header before forwarding', () => {
  const raw = Buffer.from(`CONNECT api.oauth.blink.com:443 HTTP/1.1\r\nX: ${'a'.repeat(MAX_CONNECT_HEADER_BYTES)}\r\n\r\n`);
  assert.throws(() => parseConnectRequest(raw), /Relay request rejected/);
});
```

- [ ] **Step 2: Run the test and verify the expected red state**

Run:

```bash
node --test logs/blink-oauth-egress-relay/connect-proxy.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `connect-proxy.mjs`.

- [ ] **Step 3: Implement the minimal bounded relay**

Create `connect-proxy.mjs` with this structure and no per-request logging:

```js
import net from 'node:net';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const MAX_CONNECT_HEADER_BYTES = 8192;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 18765;

class RelayRequestError extends Error {
  constructor(publicStatus) {
    super('Relay request rejected');
    this.publicStatus = publicStatus;
  }
}

export function isAllowedHostname(hostname, { allowProbe = false } = {}) {
  const normalized = hostname.toLowerCase();
  return normalized === 'api.oauth.blink.com'
    || /^rest-[a-z0-9]{4}\.immedia-semi\.com$/.test(normalized)
    || (allowProbe && normalized === 'api.ipify.org');
}

export function parseConnectRequest(input, { allowProbe = false } = {}) {
  const raw = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const marker = raw.indexOf('\r\n\r\n');
  if (marker === -1) {
    if (raw.length > MAX_CONNECT_HEADER_BYTES) {
      throw new RelayRequestError(431);
    }
    return null;
  }

  const headerBytes = marker + 4;
  if (headerBytes > MAX_CONNECT_HEADER_BYTES) {
    throw new RelayRequestError(431);
  }

  const lines = raw.subarray(0, marker).toString('latin1').split('\r\n');
  const match = /^CONNECT ([A-Za-z0-9.-]+):([0-9]{1,5}) HTTP\/1\.1$/.exec(lines[0]);
  if (!match) {
    throw new RelayRequestError(400);
  }

  const hostname = match[1].toLowerCase();
  const port = Number(match[2]);
  if (port !== 443 || !isAllowedHostname(hostname, { allowProbe })) {
    throw new RelayRequestError(403);
  }

  return { hostname, port, remainder: raw.subarray(headerBytes) };
}

const fixedResponse = (status) =>
  Buffer.from(`HTTP/1.1 ${status} Relay Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, 'latin1');

export function createRelay({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  allowProbe = false,
} = {}) {
  return net.createServer((client) => {
    let buffered = Buffer.alloc(0);
    client.setTimeout(15_000, () => client.destroy());
    client.on('error', () => undefined);
    client.on('data', function onData(chunk) {
      buffered = Buffer.concat([buffered, chunk]);
      let parsed;
      try {
        parsed = parseConnectRequest(buffered, { allowProbe });
      } catch (error) {
        const status = error instanceof RelayRequestError ? error.publicStatus : 400;
        client.end(fixedResponse(status));
        return;
      }
      if (!parsed) return;

      client.off('data', onData);
      const upstream = net.connect({
        host: parsed.hostname,
        port: parsed.port,
        timeout: 15_000,
      });
      upstream.on('error', () => client.destroy());
      upstream.on('timeout', () => upstream.destroy());
      upstream.once('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (parsed.remainder.length > 0) upstream.write(parsed.remainder);
        client.pipe(upstream);
        upstream.pipe(client);
      });
    });
  }).listen(port, host);
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const port = Number(process.env.BLINK_OAUTH_RELAY_PORT ?? DEFAULT_PORT);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    process.stderr.write('RELAY_CONFIG_INVALID\n');
    process.exitCode = 2;
  } else {
    const relay = createRelay({
      port,
      allowProbe: process.env.BLINK_OAUTH_RELAY_ALLOW_PROBE === '1',
    });
    relay.once('listening', () => process.stdout.write('RELAY_READY\n'));
    relay.once('error', () => {
      process.stderr.write('RELAY_START_FAILED\n');
      process.exitCode = 1;
    });
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => relay.close(() => process.exit(0)));
    }
  }
}
```

- [ ] **Step 4: Run focused tests and static safety checks**

Run:

```bash
node --test logs/blink-oauth-egress-relay/connect-proxy.test.mjs
node --check logs/blink-oauth-egress-relay/connect-proxy.mjs
rg -n "console\.|authorization|code_verifier|access_token|refresh_token|callback|state" logs/blink-oauth-egress-relay
```

Expected: all tests PASS; syntax check exits 0; the scan finds only fixed test/source terminology and no logging statement or secret-bearing runtime value.

- [ ] **Step 5: Create the ignored run card and prove Git isolation**

Create `run-card.md` with exactly this non-secret state skeleton:

```markdown
# Blink OAuth Egress Relay Run Card

- Relay session: NOT_STARTED
- Tunnel session: NOT_STARTED
- Relay port: 18765
- Protected backup location: OPERATOR_SELECTED
- Override state: NOT_CAPTURED
- Current phase: HELPER_TESTED
- Next transition: PROBE_RELAY_START
- Rollback status: NOT_REQUIRED
- Live OAuth attempts used: 0 of 1
```

Update only these fixed fields as the run advances. Do not include any account,
callback, URL-query, IP, or token value.

Run:

```bash
git check-ignore -v logs/blink-oauth-egress-relay/connect-proxy.mjs
git status --short
```

Expected: `.gitignore` matches the helper; Git status still contains only the pre-existing user-owned untracked files and any tracked plan/documentation work.

---

### Tasks 2–3: Matched-egress experiment and rollback (retired recipe)

The original experiment combined a loopback CONNECT relay, reverse SSH tunnel
and temporary service proxy environment so browser authorization and server-side
token exchange used the same public egress. It required bounded origin checks,
secret-free connection receipts, a protected metadata-only rollback record and
unconditional removal of temporary routing after one authorized attempt.

The host-specific tunnel, service override, installation, credential-manager and
rollback commands have been removed. They are not a supported sign-in procedure
or standing authorization to change a host. Follow [authentication](../../authentication.md)
for current operator guidance and [RELEASE.md](../../RELEASE.md) for installation,
backup and rollback. The outcome and its limitations remain recorded below.
The relay test design above is historical evidence, not a deployed feature.

---

### Task 4: Reconcile canonical authentication documentation with APK and live evidence

**Files:**
- Modify: `__tests__/authentication-docs.test.ts`
- Modify: `README.md`
- Modify: `docs/adr/001-authentication.md`
- Modify: `docs/blink_api_dossier.md`
- Modify: `docs/integration_checklist.md`
- Modify when user-visible release notes require it: `CHANGELOG.md`

**Interfaces:**
- Consumes: the fixed live result from Task 3, APK Android 57.1 evidence, and existing hosted-auth terminology.
- Produces: documentation that separates production OAuth deployment environment from account REST region, records manufacturer-dependent native client selection, states the exact live acceptance boundary, and removes superseded claims.

- [ ] **Step 1: Write the failing documentation contract assertions**

Extend `authentication-docs.test.ts` with:

```ts
expect(docs).toMatch(/same production OAuth host/i);
expect(docs).toContain('Build.MANUFACTURER');
expect(docs).toMatch(/`amazon`.*`android`|`android`.*`amazon`/s);
// Check that geographic validation limits are documented without account details.
expect(docs).toMatch(/authorization.*token exchange.*egress/is);
expect(docs).not.toMatch(/non-EU.*live[- ]validated/i);
```

Run:

```bash
npm test -- --runInBand __tests__/authentication-docs.test.ts
```

Expected: FAIL until canonical docs contain the new evidence and boundaries.

- [ ] **Step 2: Correct the APK workflow and regional model everywhere**

Each canonical document must state these exact facts in its appropriate level of detail:

- Production EU, US, AP, and AU accounts use the same client-constructed authorize endpoint `https://api.oauth.blink.com/oauth/v2/authorize` and token endpoint `https://api.oauth.blink.com/oauth/token`.
- QA and development change the OAuth deployment subdomain; account geography does not.
- The account REST tier and AWS region are learned after token issuance through tier/account APIs.
- Blink Android selects native `client_id=amazon` only when `Build.MANUFACTURER == "Amazon"`; otherwise it uses `android`. Homebridge intentionally uses the Android public-client profile and must not claim the APK always hardcodes `android`.
- Native AppAuth sends no scope, cookie, client secret, or Authorization header in the authorization-code token POST beyond the evidenced five form fields.
- Authorization occurs in an external browser; native token exchange occurs on the same Android device. Homebridge separates Brave on the operator machine from token exchange on the Pi.
- European-region is the only live account tested. Non-EU compatibility is APK-derived plus parameterized/static coverage.

Remove wording that claims regional OAuth hosts, full non-EU live validation, browser-side token exchange, or unconditional end-to-end hosted-flow success.

- [ ] **Step 3: Record the live result using exactly one evidence branch**

If Task 3 succeeds, use this substance without inserting runtime identifiers:

```text
Live European-region acceptance succeeded only after the browser authorization and
Pi token exchange were routed through the same public egress. Earlier
cross-egress attempts reached the canonical callback but Blink returned
invalid_grant. This demonstrates that Blink's hosted UI and public-client PKCE
flow can issue usable tokens, while also exposing an observed network-context
constraint for remotely hosted Homebridge instances. Normal-Pi access-token
reconnect was verified after the relay was removed; refresh-token rotation and
non-EU accounts remain bounded live-test gaps.
```

If Task 3 still returns `invalid_grant`, use this substance instead:

```text
A controlled European-region retry routed browser authorization and Pi token exchange
through one public egress, but Blink still returned invalid_grant. The earlier
network split is therefore ruled out as the sufficient cause. The hosted page
and callback are proven, but successful native-style token issuance is not.
Android manufacturer/client selection, device identity, browser identity, and
AppAuth transport remain the next evidence targets. Non-EU accounts remain
APK-derived only.
```

Do not mix the two branches or imply success from reaching the callback alone.

- [ ] **Step 4: Run documentation and repository quality gates**

Run:

```bash
npm test -- --runInBand __tests__/authentication-docs.test.ts
npm test -- --runInBand
npm run lint
npm run build
npm audit --audit-level=high
npm pack --dry-run
git diff --check
```

Expected: documentation test PASS; full Jest PASS; lint/build PASS; audit has no high-or-greater vulnerability; dry pack contains no `logs/` helper, APK, auth artifact, or relay run card; diff check clean.

- [ ] **Step 5: Independently review and commit the evidence update**

Review for secret leakage, accidental runtime identifiers, incorrect EU/non-EU claims, contradictions between the README/ADR/dossier/checklist, stale credential-flow guidance, and unsupported claims about refresh rotation. Then stage only intended tracked documentation/tests and commit:

```bash
git add README.md CHANGELOG.md __tests__/authentication-docs.test.ts \
  docs/adr/001-authentication.md docs/blink_api_dossier.md \
  docs/integration_checklist.md
git commit -m "docs(auth): record hosted OAuth acceptance evidence"
```

If `CHANGELOG.md` did not require an edit, omit it from `git add`.

- [ ] **Step 6: Close or update the GitHub issue and land the session**

Add a secret-free GitHub issue comment with the bounded outcome, rollback verification, test counts, and residual gaps. Close the related GitHub issue only if usable tokens were persisted, normal unproxied reconnect passed, docs are correct, and no required work remains. Otherwise leave it in progress and create a linked GitHub issue for the Android AppAuth harness.

Then run:

Follow the reviewed integration and push procedure in [RELEASE.md](../../RELEASE.md).
Historical planning does not authorize rewriting an existing branch.

Expected: push succeeds and Git reports the branch up to date with `origin`, with only the preserved user-owned untracked files.
