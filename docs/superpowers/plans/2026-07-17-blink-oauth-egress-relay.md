# Blink OAuth Egress-Matched Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine whether Blink accepts the Homebridge-hosted authorization-code flow when browser authorization and Pi-side token exchange share one public egress, persist any successful session through the real plugin path, roll back all temporary routing, and update canonical authentication documentation with the result.

**Architecture:** A tested, git-ignored Node HTTP `CONNECT` relay binds only to Mac loopback. An authenticated reverse SSH forward exposes it only on Raspberry Pi loopback, and a temporary systemd drop-in enables Node 24's built-in HTTPS proxy support for the Homebridge process. TLS stays end to end between Homebridge and Blink; the relay never decrypts or records OAuth traffic. One live Brave flow is allowed only after isolated relay, tunnel, egress, service, and rollback preflights pass.

**Tech Stack:** Node.js 24 built-in `net`, built-in test runner, OpenSSH reverse forwarding, systemd, Homebridge custom UI, Brave through Computer Use, Jest documentation contract tests, Markdown. Node proxy behavior is grounded in the official [Node.js 24 built-in proxy documentation](https://nodejs.org/download/release/latest-v24.x/docs/api/http.html#built-in-proxy-support).

## Global Constraints

- Beads issue `homebridge-blinkcameras-2yh` remains the canonical task record; plan checkboxes are implementation-runbook structure required by the planning skill, not a second issue tracker.
- The live account is EU/Ireland. Non-EU conclusions remain APK-derived and parameterized/static unless separately live-tested.
- Never emit, inspect, persist in diagnostics, or document credentials, MFA values, callback URLs or query parameters, authorization codes, state, PKCE material, tokens, account/email/phone/device identifiers, auth-file contents, or public IP addresses.
- Never decrypt TLS. The relay may observe only a fixed allowlisted CONNECT authority and connection lifecycle.
- Do not clear or replace the official Blink app, Brave profile, Keychain data, Homebridge configuration, or existing auth files.
- Preserve user-owned `.vscode/` and `__tests__/.DS_Store` unchanged.
- Permit at most one fresh live OAuth attempt in this plan. If a CAPTCHA appears, stop for action-time user confirmation.
- No live login starts until the relay tests, reverse tunnel, matched-egress probe, Blink-only live-mode probe, systemd validation, Homebridge restart, proxy-environment check, and rollback assets all pass.
- Roll back the systemd drop-in and both relay processes after success, failure, interruption, or cancellation.
- Use `/opt/homebridge/bin/node` for service-equivalent Pi probes; the live service is Node 24.18.0.
- Use loopback port `18765`, already verified free on the Mac and Pi before this plan was written.
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
- Pi backup path: /home/andrew/blink-oauth-egress-relay-backup
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

### Task 2: Prove the tunnel and prepare reversible Homebridge proxying

**Files:**
- Read: `logs/blink-oauth-egress-relay/connect-proxy.mjs`
- Update, ignored: `logs/blink-oauth-egress-relay/run-card.md`
- Create temporarily on Pi: `/etc/systemd/system/homebridge.service.d/90-blink-oauth-egress-relay.conf`
- Create temporarily on Pi: `/home/andrew/blink-oauth-egress-relay-backup/`

**Interfaces:**
- Consumes: relay port `18765`, SSH host `andrew@raspberrypi.local`, service Node `/opt/homebridge/bin/node` 24.18.0.
- Produces: a live-mode Blink-only HTTPS tunnel, an active Homebridge service inheriting proxy environment variables, and a verified rollback record.

- [ ] **Step 1: Start the relay in probe mode and record its process session**

Run the relay as a supervised long-running process:

```bash
BLINK_OAUTH_RELAY_PORT=18765 \
BLINK_OAUTH_RELAY_ALLOW_PROBE=1 \
node logs/blink-oauth-egress-relay/connect-proxy.mjs
```

Expected: exactly `RELAY_READY`, a persistent session ID, and a loopback listener owned by the current user. Record the session ID and phase in the run card.

- [ ] **Step 2: Start the reverse SSH forward and record its process session**

Run:

```bash
ssh -NT \
  -o BatchMode=yes \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=15 \
  -o ServerAliveCountMax=3 \
  -R 127.0.0.1:18765:127.0.0.1:18765 \
  andrew@raspberrypi.local
```

Expected: a persistent session with no output, and `ss` on the Pi reports one listener on `127.0.0.1:18765`. Record the session ID.

- [ ] **Step 3: Prove egress matching without emitting any address**

Capture all three values only in shell variables, compare them, print a fixed result, then unset them:

```bash
mac_ip=$(curl -4 -fsS --max-time 10 https://api.ipify.org)
direct_pi_ip=$(ssh -o BatchMode=yes andrew@raspberrypi.local \
  'curl -4 -fsS --max-time 10 https://api.ipify.org' 2>/dev/null)
proxied_pi_ip=$(ssh -o BatchMode=yes andrew@raspberrypi.local \
  "env NODE_USE_ENV_PROXY=1 \
    HTTPS_PROXY=http://127.0.0.1:18765 \
    https_proxy=http://127.0.0.1:18765 \
    /opt/homebridge/bin/node -e \
    \"fetch('https://api.ipify.org').then(r=>r.ok?r.text():Promise.reject()).then(v=>process.stdout.write(v)).catch(()=>process.exit(1))\"" \
  2>/dev/null)

if [[ -n "$mac_ip" && "$mac_ip" == "$proxied_pi_ip" && "$mac_ip" != "$direct_pi_ip" ]]; then
  print 'EGRESS_PRECHECK_PASS'
else
  print 'EGRESS_PRECHECK_FAIL'
  false
fi
unset mac_ip direct_pi_ip proxied_pi_ip
```

Expected: only `EGRESS_PRECHECK_PASS`. On any other result, stop the tunnel and relay and do not modify systemd.

- [ ] **Step 4: Restart the relay in live Blink-only mode**

Terminate only the recorded relay session, verify port `18765` closes on Mac while SSH remains alive, then restart without `BLINK_OAUTH_RELAY_ALLOW_PROBE`:

```bash
BLINK_OAUTH_RELAY_PORT=18765 \
node logs/blink-oauth-egress-relay/connect-proxy.mjs
```

Expected: exactly `RELAY_READY`; the prior probe host is now denied, while Blink OAuth and four-character REST-tier hosts remain allowed.

- [ ] **Step 5: Verify live-mode TLS forwarding with a non-secret invalid grant**

From a one-off Pi Node process, POST fixed dummy values through the relay and output only the HTTP status:

```bash
ssh -o BatchMode=yes andrew@raspberrypi.local \
  "env NODE_USE_ENV_PROXY=1 \
    HTTPS_PROXY=http://127.0.0.1:18765 \
    https_proxy=http://127.0.0.1:18765 \
    /opt/homebridge/bin/node -e \"
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        redirect_uri: 'https://applinks.blink.com/signin/callback',
        code: 'fixed-invalid-diagnostic',
        code_verifier: 'fixed-invalid-diagnostic-verifier',
        client_id: 'android',
      });
      fetch('https://api.oauth.blink.com/oauth/token', {
        method: 'POST',
        headers: {'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
        body: body.toString(),
      }).then(r => process.stdout.write(String(r.status)))
        .catch(() => process.exit(1));
    \""
```

Expected: `401`. Do not read or print the body.

- [ ] **Step 6: Create rollback state and the temporary systemd drop-in**

First verify both already-preserved package artifacts without printing their
contents:

```bash
ssh -o BatchMode=yes andrew@raspberrypi.local '
  set -euo pipefail
  rollback=/home/andrew/sealad886-homebridge-blink-cameras-new-api-0.8.1.tgz
  diagnostic=/home/andrew/blink-oauth-support-a332366.tgz
  [[ $(sha256sum "$rollback" | awk "{print \$1}") == 8849030febe29f8b712aac76e48fe3177774f97da80a0a8821dde34c6ffca5f6 ]]
  [[ $(sha256sum "$diagnostic" | awk "{print \$1}") == 83de6e41fecd35a279ef4f520949981993d1fb731f7195fb0694230349850b80 ]]
  printf "PACKAGE_ROLLBACK_PRECHECK_PASS\n"
'
```

Expected: only `PACKAGE_ROLLBACK_PRECHECK_PASS`.

First create a mode-0700 backup directory. If the target override already exists, copy it byte-for-byte and record `present`; otherwise record `absent`. Abort if the backup directory already exists.

Run:

```bash
ssh -o BatchMode=yes andrew@raspberrypi.local '
  set -euo pipefail
  backup=/home/andrew/blink-oauth-egress-relay-backup
  target=/etc/systemd/system/homebridge.service.d/90-blink-oauth-egress-relay.conf
  test ! -e "$backup"
  install -d -m 0700 "$backup"
  if sudo test -e "$target"; then
    sudo cp -p "$target" "$backup/original.conf"
    printf "present\n" | install -m 0600 /dev/stdin "$backup/state"
  else
    printf "absent\n" | install -m 0600 /dev/stdin "$backup/state"
  fi
'
```

Install this exact drop-in through `sudo install`, never by editing the vendor unit:

```ini
[Service]
Environment="NODE_USE_ENV_PROXY=1"
Environment="HTTPS_PROXY=http://127.0.0.1:18765"
Environment="https_proxy=http://127.0.0.1:18765"
Environment="NO_PROXY=localhost,127.0.0.1,::1,raspberrypi.local"
Environment="no_proxy=localhost,127.0.0.1,::1,raspberrypi.local"
```

Install and activate it with:

```bash
printf '%s\n' \
  '[Service]' \
  'Environment="NODE_USE_ENV_PROXY=1"' \
  'Environment="HTTPS_PROXY=http://127.0.0.1:18765"' \
  'Environment="https_proxy=http://127.0.0.1:18765"' \
  'Environment="NO_PROXY=localhost,127.0.0.1,::1,raspberrypi.local"' \
  'Environment="no_proxy=localhost,127.0.0.1,::1,raspberrypi.local"' \
| ssh -o BatchMode=yes andrew@raspberrypi.local \
    'sudo install -D -m 0644 /dev/stdin /etc/systemd/system/homebridge.service.d/90-blink-oauth-egress-relay.conf'

ssh -o BatchMode=yes andrew@raspberrypi.local '
  set -euo pipefail
  sudo systemd-analyze verify homebridge.service >/dev/null
  sudo systemctl daemon-reload
  sudo systemctl restart homebridge
  for attempt in {1..15}; do
    if systemctl is-active --quiet homebridge; then
      printf "HOMEBRIDGE_RESTART_PASS\n"
      exit 0
    fi
    sleep 2
  done
  printf "HOMEBRIDGE_RESTART_FAIL\n"
  exit 1
'
```

Expected: verification exits 0 and the only output is
`HOMEBRIDGE_RESTART_PASS` within 30 seconds.

- [ ] **Step 7: Verify service inheritance and rollback readiness**

Inspect `/proc/<MainPID>/environ` under `sudo` using exact fixed-value
comparisons and output only fixed categories:

```bash
ssh -o BatchMode=yes andrew@raspberrypi.local '
  set -euo pipefail
  pid=$(systemctl show homebridge --property=MainPID --value)
  env_file=/proc/$pid/environ
  sudo grep -zFxq "NODE_USE_ENV_PROXY=1" "$env_file"
  sudo grep -zFxq "HTTPS_PROXY=http://127.0.0.1:18765" "$env_file"
  sudo grep -zFxq "https_proxy=http://127.0.0.1:18765" "$env_file"
  sudo grep -zFxq "NO_PROXY=localhost,127.0.0.1,::1,raspberrypi.local" "$env_file"
  sudo grep -zFxq "no_proxy=localhost,127.0.0.1,::1,raspberrypi.local" "$env_file"
  test -r /home/andrew/blink-oauth-egress-relay-backup/state
  ui_status=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:8581/)
  case "$ui_status" in
    200|301|302|401|403) printf "PROXY_ENV_PASS\n" ;;
    *) printf "PROXY_ENV_FAIL\n"; exit 1 ;;
  esac
'
```

Separately poll both recorded long-running sessions once. Verify the backup
marker can be read but do not emit its contents or any copied file content.

Expected: `PROXY_ENV_PASS`, active Homebridge, reachable UI, active relay, active SSH forward. If any check fails, execute Task 3 Step 5 immediately without starting OAuth.

---

### Task 3: Run one live hosted login and unconditionally roll back

**Files:**
- Update, ignored: `logs/blink-oauth-egress-relay/run-card.md`
- Consume through existing UI: Pi pending transaction and auth state files, without inspecting their contents.
- Remove/restore on completion: `/etc/systemd/system/homebridge.service.d/90-blink-oauth-egress-relay.conf`

**Interfaces:**
- Consumes: the existing Brave Homebridge session, existing Blink-hosted UI, one Pi-owned PKCE transaction, the live-mode relay.
- Produces: one bounded result (`authenticated and verified`, `authenticated but unverified`, or one existing `BHO-*` support code), followed by normal unproxied Homebridge operation.

- [ ] **Step 1: Re-open the existing Blink line item and start exactly one fresh flow**

Use Computer Use through `@oai/sky` only. Reuse the logged-in Homebridge tab in Brave, open the existing Blink plugin settings line item, and start hosted sign-in once. Do not inspect the authorization URL or browser storage. Record only `LIVE_FLOW_STARTED` in the run card.

- [ ] **Step 2: Complete Blink-hosted credential and MFA UI**

Use the saved Blink entry through Brave/iCloud Keychain as already authorized. If a CAPTCHA appears, stop and request action-time user confirmation. The user enters any MFA value directly into Blink's page; do not read, repeat, copy, or submit it through tool output.

- [ ] **Step 3: Transfer the callback without reading it**

When the browser reaches Blink's registered callback, focus the address bar, copy, return to the Homebridge Blink settings tab, focus `Paste Blink Result and Finish`, paste once, and submit once. Never emit accessibility text containing the callback; use aggressively sanitized state checks that report only page role and fixed booleans.

- [ ] **Step 4: Record only the bounded result and verify persistence indirectly**

Accept only these observable outcomes:

- Homebridge reports authenticated and verified with bounded camera/network counts.
- Homebridge reports authenticated but unverified with a fixed verification category.
- Homebridge reports the fixed generic failure plus an allowlisted `BHO-*` support code.

Never inspect auth-file contents. On authentication success, verify only that the owner-only auth file exists, is a regular file, and has mode `0600`; report fixed booleans. Do not start another OAuth attempt, even after failure.

- [ ] **Step 5: Execute rollback in a finally-style sequence**

Using the backup marker:

1. Restore the original override byte-for-byte if it was present, or remove only `90-blink-oauth-egress-relay.conf` if it was absent.
2. Run `sudo systemctl daemon-reload` and restart Homebridge.
3. Verify Homebridge is active and the proxy variables are absent or restored to their exact pre-test state without printing values.
4. Terminate only the recorded SSH-forward session.
5. Terminate only the recorded relay session.
6. Verify port `18765` has no listener on either machine.
7. Remove the temporary backup directory only after successful service verification.
8. Mark rollback `COMPLETE` in the ignored run card.

Restore the remote service state first with this fixed-output command:

```bash
ssh -o BatchMode=yes andrew@raspberrypi.local '
  set -euo pipefail
  backup=/home/andrew/blink-oauth-egress-relay-backup
  target=/etc/systemd/system/homebridge.service.d/90-blink-oauth-egress-relay.conf
  state=$(<"$backup/state")
  if [[ "$state" == present ]]; then
    sudo cp -a "$backup/original.conf" "$target"
  elif [[ "$state" == absent ]]; then
    sudo rm -f "$target"
  else
    printf "ROLLBACK_STATE_INVALID\n"
    exit 1
  fi
  sudo systemctl daemon-reload
  sudo systemctl restart homebridge
  for attempt in {1..15}; do
    if systemctl is-active --quiet homebridge; then break; fi
    sleep 2
  done
  systemctl is-active --quiet homebridge
  if [[ "$state" == present ]]; then
    sudo cmp -s "$backup/original.conf" "$target"
  else
    ! sudo test -e "$target"
    pid=$(systemctl show homebridge --property=MainPID --value)
    ! sudo grep -zFxq "HTTPS_PROXY=http://127.0.0.1:18765" "/proc/$pid/environ"
    ! sudo grep -zFxq "https_proxy=http://127.0.0.1:18765" "/proc/$pid/environ"
  fi
  printf "SERVICE_ROLLBACK_PASS\n"
'
```

Only after `SERVICE_ROLLBACK_PASS`, terminate the recorded SSH and relay
sessions. Then run:

```bash
if lsof -nP -iTCP:18765 -sTCP:LISTEN 2>/dev/null | grep -q .; then
  print 'LOCAL_RELAY_CLEANUP_FAIL'
  false
else
  print 'LOCAL_RELAY_CLEANUP_PASS'
fi

ssh -o BatchMode=yes andrew@raspberrypi.local '
  if ss -ltnH "sport = :18765" 2>/dev/null | grep -q .; then
    printf "REMOTE_RELAY_CLEANUP_FAIL\n"
    exit 1
  fi
  sudo rm -rf /home/andrew/blink-oauth-egress-relay-backup
  printf "REMOTE_RELAY_CLEANUP_PASS\n"
'
```

Expected: Homebridge active, no temporary drop-in, no relay/tunnel process, no port listener.

- [ ] **Step 6: Verify normal unproxied behavior after rollback**

Reopen the Blink line item in the existing Homebridge UI. If authentication succeeded, run the credential-free reconnect/status action and verify it uses persisted state without requesting credentials or MFA. This proves the access token and REST session work from normal Pi egress; it does not claim refresh-token rotation has been live-tested.

If the matched-egress token exchange still returned `BHO-HTTP-INVALID-GRANT`, record that egress mismatch is ruled out and make Android AppAuth/device identity the next diagnostic. Do not perform a second login in this plan.

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
expect(docs).toMatch(/EU\/Ireland/i);
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
- EU/Ireland is the only live account tested. Non-EU compatibility is APK-derived plus parameterized/static coverage.

Remove wording that claims regional OAuth hosts, full non-EU live validation, browser-side token exchange, or unconditional end-to-end hosted-flow success.

- [ ] **Step 3: Record the live result using exactly one evidence branch**

If Task 3 succeeds, use this substance without inserting runtime identifiers:

```text
Live EU/Ireland acceptance succeeded only after the browser authorization and
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
A controlled EU/Ireland retry routed browser authorization and Pi token exchange
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

- [ ] **Step 6: Close or update Beads and land the session**

Add a secret-free Beads comment with the bounded outcome, rollback verification, test counts, and residual gaps. Close `homebridge-blinkcameras-2yh` only if usable tokens were persisted, normal unproxied reconnect passed, docs are correct, and no required work remains. Otherwise leave it in progress and create a linked discovered-from issue for the Android AppAuth harness.

Then run:

```bash
git pull --rebase
bd dolt push
git push
git status --short --branch
```

Expected: push succeeds and Git reports the branch up to date with `origin`, with only the preserved user-owned untracked files. If no Beads Dolt remote is configured, record that fixed condition and continue with Git push rather than treating it as a code failure.
