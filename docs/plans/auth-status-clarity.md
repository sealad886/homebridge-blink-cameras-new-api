# Plugin Config authentication status

## Problem and status contract

The Plugin Config panel currently interprets an untested stored Blink token as a failed verification. Opening the panel then raises a warning even when the child bridge is operating normally. The custom UI also writes the Homebridge plugin configuration and shows a success toast during a read-only status refresh.

| Blink credential state | Connection evidence | Plugin Config presentation | Homebridge action |
|---|---|---|---|
| No usable stored sign-in | None | Sign-in form | Do not change child bridge or accessory status |
| Usable tokens stored | No check in this UI service session | Stored sign-in; connection not checked | Show schema form; offer Test Connection |
| Usable tokens stored | Successful API login and homescreen check | Connected | Show schema form |
| Usable tokens stored | Connection check failed | Connection check failed with retry guidance | Keep stored tokens and schema form |
| Blink requests client or account verification | Explicit Blink response | Show the corresponding code form | Do not infer a challenge from token age or network errors |

`authenticated` means usable stored credentials exist. `verified: true` records a successful connection check for the current stored session; `verified: false` records a failed check or explicit Blink challenge. An absent `verified` value means no check was made. These UI results do not set Homebridge accessory health or change the runtime child bridge's independent Blink session.

## Design

The hosted auth service keeps the last connection result in memory and binds it to the durable stored session identity. Replacing or clearing that session discards the result. A fresh UI service process reports stored tokens as unchecked without contacting Blink on every panel open. Test Connection records a successful or failed check, and a following `/status` read returns that result. Only an explicit Blink verification exception produces client or account verification fields.

The custom UI renders unchecked status without a warning, error message, or toast. Opening the panel reads `/status` and does not save plugin configuration. User initiated sign-in completion or verification may save token-only Homebridge configuration and report its result. A failed connection check leaves existing credentials available for retry; it does not imply that Blink requested a code. Homebridge's schema form remains available for any stored session.

## Implementation and evidence plan

1. Update the hosted auth service's status and Test Connection behavior; cover session reuse, process reopen, failed check, and replacement in service tests.
2. Update the Plugin Config presentation and read-only refresh path; verify that unchecked and explicit verification states have distinct UI behavior.
3. Run focused tests, full tests, lint, and build. Review the diff for credential exposure and Homebridge configuration side effects.
4. Review and merge the `0.10.0-alpha.2` source PR after clean review rounds and CI. After separate publication and installation authorization, verify the panel on the Pi with fresh redacted logs. Runtime accessory health and the UI's connection check should be assessed separately.

The critical path is service contract → UI handling → tests and review → merge → authorized publication and installation → Pi observation. The current PR prepares the next alpha version; publishing and installing it require separate release authorization. Rollback is reverting the UI and service change together; no credential migration is needed.

## Risks and boundaries

- A connection can fail after a successful check. The panel's result is evidence from the last UI check, not a continuous health monitor. A new UI process returns to unchecked.
- Blink can require verification during a later API call. Only that call's explicit response opens the code form.
- Avoid extra API traffic on panel open, which could increase authentication failures or rate limits.
- Do not log or persist tokens, callback URLs, verification codes, or upstream error bodies for this status feature.
