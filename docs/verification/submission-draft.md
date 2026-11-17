# Verification submission draft — held for stable 2.0.0

Local drafting instructions; **not ready to submit**. See the
[research and readiness record](README.md) for blockers and release gates.
Homebridge currently uses an issue form rather than a verification PR.
The maintainer has also requested [unbundling FFmpeg](../plans/2026-11-16-external-ffmpeg.md).
Distribution wording below targets that external backend. Stable 1.1.0 is now
published, but its artifact retains the bundled codecs and automatic install
migration. The maintainer selected 2.0.0 for the combined change; local preparation
starts at 2.0.0-alpha.0. Recheck every claim against the final published package;
1.1.0 and earlier RCs do not qualify the changed backend or install behavior.

Destination: [`homebridge/plugins` verification form](https://github.com/homebridge/plugins/issues/new?template=1_verification-request.yml).

Proposed title:

```text
Verification Request: @sealad886/homebridge-blink-cameras-new-api
```

## Form fields

**Plugin Name**

```text
@sealad886/homebridge-blink-cameras-new-api
```

**Link To GitHub Repo**

```text
https://github.com/sealad886/homebridge-blink-cameras-new-api
```

**Plugin Icon (Optional)**

Leave empty for the initial request unless a square PNG with appropriate rights
has been approved. No Verified badge should be added before Homebridge approval.

The following table maps the six form declarations in their current order.
It paraphrases their labels; use the actual generated dropdowns when filing.
No Yes answer is pre-certified by this draft.

| Form declaration | Draft disposition | Evidence needed to select Yes |
| --- | --- | --- |
| Functionality beyond existing verified alternatives | Planned Yes, subject to comparison and reviewer judgment | Explain native USB clip delivery into each camera's HomeKit Secure Video timeline and distinguish both alternatives named in #990. Recheck their current capabilities before submission. |
| Installation succeeds; no plugin activity without configuration | Pending final-package checks | Clean install, absent config and unconfigured startup using stable 2.0.0. Confirm the published manifest has no install hooks. |
| Standard startup without TTY or unusual parameters | Planned Yes, pending published-package smoke | Normal Homebridge UI hosted sign-in, configuration, restart and recovery. |
| No analytics or user tracking | Pending final review | Review final code, dependencies and outbound services; distinguish functional Blink/Google push traffic from analytics. |
| Disk writes confined to Homebridge storage | Pending storage/cleanup review | Normal, error and native-media paths plus explicit migration backups; confirm the package has no uninstall cleanup hook. |
| Errors caught and logged without unhandled exceptions | Pending runtime checks | Missing/invalid configuration, provider/network failures, media failures and recovery with the final artifact. |

If a declaration cannot truthfully be affirmed, select the form's No option and
explain it in More Information. Do not submit with unresolved preparation
blockers merely because the form accepts an explanation.

## More Information — proposed text

The section below is the draft for the form's final textarea. Replace every
`[PENDING: ...]` item and refresh the comparison before submission. Keep the
generated package-name field first in the actual issue; do not prepend these
local drafting instructions to the generated form body.

---

I am requesting verification of the stable 2.0.0 release of
`@sealad886/homebridge-blink-cameras-new-api`.

This is a fresh request following
[#990](https://github.com/homebridge/plugins/issues/990). That request closed
while the question about differences from existing verified Blink plugins was
unanswered. The maintainer invited a new request with that explanation. This
request addresses it directly and provides current release evidence.

### What this plugin adds

The principal additional capability is opt-in delivery of **completed native
Blink Local Storage USB motion clips into HomeKit Secure Video through each
camera's existing Home accessory**. The plugin receives motion events through
its own push receiver, finds the corresponding native clip, downloads and
prepares it with the externally installed FFmpeg, and offers a finite recording to
the home hub. Existing camera identities and the independent live-view path are
preserved; users do not pair a separate replay camera.

This is delayed delivery of Blink's completed recordings. It does not provide
continuous or pre-event recording, promise a historical Home timeline timestamp,
or bypass Apple's recording permissions. The home hub controls whether an
offered recording is requested and retained. Native Blink USB recording must
already work, and a compatible Apple home hub and eligible iCloud+ plan are
required.

For the two verified plugins named in #990:

- `@jackietreeh0rn/homebridge-blink-security` v2.1.2 already documents OAuth/PKCE,
  live video and one-way audio, USB-manifest motion detection, and optional push
  for doorbell presses. Its [camera controller setup](https://github.com/BitWise-0x/homebridge-blink-security/blob/v2.1.2/src/accessories/camera.ts)
  configures streaming without a recording controller option, and its separate
  Record Clip switch starts a Blink recording. Its
  [USB integration](https://github.com/BitWise-0x/homebridge-blink-security/blob/v2.1.2/src/devices/localStorage.ts)
  turns catalog entries into motion metadata. Our added workflow delivers the
  saved clip into HomeKit Secure Video rather than only detecting it or starting
  a new Blink recording.
- `homebridge-blink-for-home-new` 0.2.1 provides overlapping security-system,
  motion and temperature functions. In the
  [inspected recording delegate](https://github.com/Flomentum-Solutions/homebridge-blink-for-home-new/blob/0d3c100e462991be8e1849aeefb4bfb999c5681e/src/homebridge/blink-hap.js),
  the recording stream handler returns no recording data. The added workflow
  here supplies a finite prepared recording through the existing camera
  accessory. I have not device-tested the competing plugin or treated its
  conflicting live-view documentation as proof that live view is unavailable.

These comparisons were researched on 16 November 2026 and must be refreshed
before this request is submitted. The recording acceptance evidence below is
provided so the additional functionality can be assessed directly.

The platform also provides network arm/disarm through a SecuritySystem service,
per-device motion controls, snapshots, live video/audio, and optional temperature
where the device reports it. Those shared features are context, not the basis
for the additional-functionality claim.

### Configuration and distribution

Configuration and Blink-hosted OAuth/MFA run through the normal Homebridge UI
workflow. Passwords and hosted MFA are entered on Blink's page. The plugin
includes a schema and custom settings UI and uses the dynamic platform APIs to
restore its existing accessories.

The npm package includes protection/launch helpers for Linux arm64/x64, macOS
arm64/x64 and Windows x64, plus corresponding native source and license notices.
It requires users to install FFmpeg 6.1+ separately and supports configuring its
executable path. No FFmpeg, x264 or Opus libraries, executables or source archives
are bundled. The helper links only libSRTP. These are the supported architecture
targets; I am not claiming 32-bit ARM or universal OS-version support. The
distribution's declared license expression is
[PENDING: insert the final published license expression after helper source and
dependency notices have been verified; retaining GPL-labelled helper code does
not make the package MIT-only].

Installation leaves Homebridge configuration unchanged. Legacy settings use the
documented explicit converter: an absolute configuration path previews the plan,
and `--apply` authorizes conversion with a private exact-byte backup and guarded
atomic replacement. Already-canonical files are unchanged without another backup.
Windows follows the documented manual mapping. The historical migration command
delegates to the same converter; neither command contacts Blink or restarts Homebridge.
[PENDING: verify this arrangement, `supports-hap`, absence of install hooks and
the migration tools against the final published 2.0.0 tarball.]

### Privacy, storage and earlier review note

Blink cloud APIs and Google/Firebase registration and push transport are needed
for plugin operation. The latter delivers functional device events; it should
not be mistaken for a Blink-only network footprint.

[PENDING: summarize final no-tracking and storage-boundary review, including
native temporary media and migration backups. Provide the evidence supporting
the corresponding form declarations. Do not include credentials, device IDs,
private endpoints, raw event payloads or camera footage.]

The earlier #990 automated result highlighted environment-file access in an
uninstall script. Stable 1.1.0 retired that unsupported hook, and this change
preserves its removal. Uninstallation does not run plugin-owned authentication
or accessory cleanup. Explicit migration is separate from npm installation.
[PENDING: confirm hook absence and retained auth/accessory persistence against
the final package; complete the broader runtime storage-boundary review.]

### Stable release and acceptance evidence

- npm package: [@sealad886/homebridge-blink-cameras-new-api](https://www.npmjs.com/package/@sealad886/homebridge-blink-cameras-new-api)
- Stable version and npm latest: [PENDING: verify both are 2.0.0]
- Published GitHub release: [PENDING: insert verified v2.0.0 release URL]
- Final source commit: [PENDING: insert immutable commit URL]
- Package integrity and release receipt: [PENDING: insert public receipt URL]
- Node 22/24/26 and latest Homebridge checks: [PENDING: link exact-source results,
  name actual Homebridge and Node versions]
- All five installed-artifact qualifications: [PENDING: link receipts bound to
  the final source and npm integrity]
- Normal installation, authentication, restarts and failure recovery:
  [PENDING: dated, sanitized acceptance record]
- Fresh saved Home recording playback and stable observation:
  [PENDING: dated acceptance record, tested cameras/configuration, at least
  24 hours and one natural token refresh; distinguish prior RC evidence]

### Known limits

This uses private Blink interfaces, which can change without notice. Live-account
evidence currently covers an EU account; other regions have static contract and
automated routing coverage. Automatic doorbell ring delivery and two-way talk
are not implemented. Recording requires completed native Local Storage clips,
appropriate plugin and Apple Home settings, and Apple prerequisites. Unsupported
or malformed media may be rejected; a bounded recovery may substitute silence
when video is recoverable and source audio is not. Apple Home controls retention
and playback.

I maintain the public repository and its
[issue tracker](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues)
and can address feedback against the published package.

---

## Final filing check

- [ ] Stable release accepted and all preparation blockers resolved.
- [ ] Current source, npm latest and all evidence agree; no `[PENDING: ...]` remains.
- [ ] Both verified alternatives checked again and comparison remains accurate.
- [ ] Six form answers selected from actual final evidence.
- [ ] Private operational data excluded; optional icon rights settled or omitted.
- [ ] User authorization obtained for the external submission after release.

No upstream issue or PR has been created by this draft.
