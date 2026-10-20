# Command retirement and HTTP 406 investigation — 19 October 2026

RC.14 Front door initially played smooth live video/audio with human confirmation.
Its command GETs returned 406, upstream media later closed, and immediate reopen
POSTs repeatedly failed 406. Current Corner testing is blocked by dead batteries.
Private evidence: `logs/rc14-2026-10-19-home/analysis.md`.

## Findings and changes

1. A behavioral regression reproduced a new live-view POST while previous remote
   retirement was pending, including when STOP preceded the allocation response.
   Pending allocation remains owned until any late command cleanup settles.
   START now waits for those duties with owner cancellation,
   ownership recheck and a four-second startup bound. Remote cleanup retains its
   separate five-second deadline and cannot hold local capacity forever.
2. Android 59.2 `CommandApi.terminateCommand` returns `Call<Unit>`, while the plugin
   unconditionally parsed JSON. Empty 200/204 responses now succeed through bounded
   body consumption. Command completion disables ambiguous 5xx POST replay.
3. Read-only probes on the exact logged official command URL observed 200 JSON,
   then 406 (156-byte HTML), then 200 again with existing stored authentication.
   Adding the plugin's language header and using current Android identity did not
   establish a causal difference. No routing/header/version change is justified.
   A single one-second GET retry is allowed, independently of token-refresh attempts; POSTs and persistent refusals remain
   bounded failures. No token refresh is forced by 406.
4. Finite retirement receipts distinguish acknowledged, not_found and failed
   cleanup. A 404 is not confirmed retirement. No command IDs or bodies are logged.

## Contract evidence

Android 59.2 `CommandApi.java:25–43` declares leading-slash command routes.
`SharedUsersRestApiModule.java:54–69,105–107` constructs the shared-tier Retrofit
and injects it into CommandApi. Existing shared-root routing is correct. The
historic claim that `/done` was deprecated in late 2025 lacked support and was
removed. The generated contract is static evidence, not proof of server behavior.

## Limits and release treatment

Neither the remote server's internal 406 cause nor a live fix on the Pi is proven.
Do not claim a provider busy/offline cause, comprehensive security closure, or
physical acceptance from synthetic tests. RC.15 requires operator installation
and renewed Home acceptance/observation. Keep issue #52 and F05/F06 open. No Pi
configuration, restart, installation, pairing or persistence mutation was made.
Rollback uses an exact previously verified registry artifact under the release
guide; do not restore insecure transport or certificate bypasses.
