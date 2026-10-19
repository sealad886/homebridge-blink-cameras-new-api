# Sign-in and account verification

This guide owns operator sign-in and stored-session recovery. Architecture and
vendor routing belong to [ADR-001](adr/001-authentication.md).

## Hosted Blink sign-in

1. Open this plugin's settings in the remote Homebridge UI and choose **Sign in
   securely with Blink**. Keep the Homebridge settings tab open. If Brave blocks
   the new tab, choose the revealed **Open Blink Sign-In** fallback.
2. Finish the account-credential and MFA steps only in the separate
   Blink-hosted Brave tab. Homebridge never receives either value.
3. After Blink reaches its desktop **Unsupported Browser** page, copy the full
   address beginning with
   `https://applinks.blink.com/signin/callback` from Brave's address bar.
4. Return to Homebridge and choose **Paste Blink Result and Finish**. This reads
   the clipboard only from that click. If Brave denies clipboard access, reveal
   the manual field, paste the complete address, and choose **Finish with Pasted Address**.
   Clipboard cleanup after completion is best effort: if the browser denies
   clipboard write access, clear the copied callback address manually.
5. If Blink asks for client or account verification after issuing tokens, enter
   that distinct post-token code in Homebridge. This is not Blink's hosted MFA.
6. Wait for stored-token connection verification, then continue to the normal
   plugin schema. Restart Homebridge and confirm the stored session reconnects.

For PKCE, callback validation, owner-only token storage, OAuth routing and
validation boundaries, see [ADR-001](adr/001-authentication.md).

## Hosted MFA

Blink's sign-in page owns the account credential and hosted MFA steps. Do not
put either value in Homebridge configuration.

## Client verification (new device approval)

After tokens exist, Blink may require one-time **client verification** for the
new Homebridge device. The custom UI identifies this post-token requirement,
accepts the code through its verification form, and never saves it in plugin
configuration. Leave **Trust this device** enabled unless you intentionally want
Blink to ask again.

## Account or phone verification

Some accounts require an additional **account or phone verification** after
token issuance. Complete it only when the custom UI labels the request as
account verification. If Blink asks for another PIN, request a new one and use
the same form; the token state remains authenticated while verification is
pending.

## Re-authentication and token reset

If you need to re-authenticate or switch Blink accounts, choose **Unlock &
Re-authenticate** in the custom UI, then start hosted sign-in again. Unlocking
clears the current token file, legacy auth state, and any pending transaction
before returning to the signed-out screen. The custom-UI server's `/logout`
route has the same local storage-clearing semantics for integrations, but the
current operator UI does not expose a separate logout button. Neither action
revokes tokens at Blink; it removes the plugin's local ability to reuse them.

## Sign-in verification checklist

- Open Homebridge UI → Plugins → this plugin → Settings.
- Confirm there is one hosted flow and no Homebridge username, password, or
  hosted-MFA input.
- Confirm Brave reaches the exact HTTPS App-Link and the clipboard/manual finish
  returns to an authenticated status.
- Confirm the saved plugin config contains no credentials or verification codes.
- Restart Homebridge and confirm `.blink-auth.json` supplies the same account;
  refresh uses its persisted OAuth profile.

## Validation boundary

[ADR-001](adr/001-authentication.md#status) records the bounded live evidence and
incomplete fresh packaged authorization-code acceptance. Non-EU accounts have
static/routing-test coverage, not live-account acceptance. Current delivery and
security dispositions belong to the [hardening ledger](plans/security-hardening.md).

## Stored-session recovery and legacy configuration

Stored JSON is validated before use; supported OAuth profiles are `android` and
`ios`. A stored token is not proof that Blink still accepts it: **Test Connection**
performs that check. Temporary refresh outages retain the current token and advise
retrying; a confirmed rejected refresh grant requires sign-in again.

Credential writes use a short cross-process lock and compare the saved session
before replacing it. Logout also updates `.blink-auth.json.generation.json`, so
an older child bridge cannot recreate cleared credentials or overwrite a new
account. Restart the child bridge after changing accounts. Requests already sent
and established streams can finish; logout does not revoke tokens at Blink.

New authenticated sign-in can replace damaged JSON after preserving its exact
contents in an owner-only `.invalid-<id>.json` backup (encoded as a JSON string).
Treat those backups as credentials. If a crash leaves `.blink-auth.json.lock`
behind, storage fails closed after five seconds. Stop the child bridge and the
custom-UI process, confirm neither is running, remove only that empty lock
directory, then restart. Do not remove the generation file during routine reset.

For compatibility with older installations, the runtime still accepts a
paired `username` and `password` in manually edited configuration and can use
them for the legacy iOS-profile sign-in path when compatible token state is
missing or unusable. That hidden fallback sends the credentials through
Homebridge and is deprecated; it is not part of the supported custom-UI flow.
Remove those fields after migrating to hosted sign-in.
