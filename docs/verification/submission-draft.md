# Verification submission draft — held for stable 2.0.0

Local drafting instructions; **not ready to submit**. See the
[research and readiness record](README.md) for blockers and release gates.
Homebridge currently uses an issue form rather than a verification PR.
The [external FFmpeg change](../plans/2026-11-16-external-ffmpeg.md) is published
in independently accepted **2.0.0-alpha.0**, source
[`1074a6587542fc6caf3ad8c3a3611004026aaabb`](https://github.com/sealad886/homebridge-blink-cameras-new-api/commit/1074a6587542fc6caf3ad8c3a3611004026aaabb).
Its [public prerelease](https://github.com/sealad886/homebridge-blink-cameras-new-api/releases/tag/v2.0.0-alpha.0),
[receipt](https://github.com/sealad886/homebridge-blink-cameras-new-api/releases/download/v2.0.0-alpha.0/release-receipt.json)
and [publication run](https://github.com/sealad886/homebridge-blink-cameras-new-api/actions/runs/44013144690)
establish alpha packaging and five-target installed qualification. npm `latest`
remains **1.1.0**; stable **2.0.0** and physical acceptance of the external backend
remain pending. The old bundled-backend playback does not qualify this backend.
Recheck every declaration against the final published stable package.

Submission and feedback follow-up are already conditionally authorized once
stable 2.0.0 is properly released and accepted. The alpha does not clear that
gate; production Homebridge installation has its separate approval boundary.

Destination: [`homebridge/plugins` verification form](https://github.com/homebridge/plugins/issues/new?template=1_verification-request.yml).

Proposed title:

```text
Verification Request: @sealad886/homebridge-blink-cameras-new-api
```

## Generated form body — pending

Use the [official form](https://github.com/homebridge/plugins/blob/a3f60aa7dc535fa2ab638a1684888c682294379d/.github/ISSUE_TEMPLATE/1_verification-request.yml)
and all six dropdowns. The field headings below match the form inspected on
17 November 2026; they replace the earlier local mapping table. **PENDING is a
draft marker, not a valid dropdown answer.** After the stable gate and evidence
are complete, select exactly `🟢 Yes` or
`🟠 No (please explain in the more information box at the end)` for each field.
Do not submit with unresolved preparation blockers.

The actual issue body starts at **Plugin Name** below, with the package name on
line 3. Do not prepend this document's title/instructions or append the local
filing checklist. Leave the optional icon empty unless a suitable square PNG
with appropriate rights has been approved. No Verified badge before approval.

---

### Plugin Name

@sealad886/homebridge-blink-cameras-new-api

### Link To GitHub Repo

https://github.com/sealad886/homebridge-blink-cameras-new-api

### Plugin Icon (Optional)

_No response_

### The plugin does not offer the same nor less functionality than that of any existing verified plugin.

PENDING — Final stable recording acceptance and refreshed comparison; reviewer
judgment remains with Homebridge.

### The plugin successfully installs and does not start unless it is configured.

PENDING — Stable 2.0.0 clean install, no-config inactivity and final hook check.

### The plugin does not require the user to run Homebridge in a TTY or with non-standard startup parameters, even for initial configuration.

PENDING — Final-package normal Homebridge UI sign-in, startup and restart checks.

### The plugin does not contain any analytics or calls that enable you to track the user.

PENDING — Final code, dependency and outbound-service review.

### If the plugin needs to write files to disk (cache, keys, etc.), it stores them inside the Homebridge storage directory.

PENDING — Final normal/error/media storage and migration-backup observations.

### The plugin does not throw unhandled exceptions, the plugin must catch and log its own errors.

PENDING — Final configuration, provider/network and media failure/recovery checks.

### More Information

I am requesting verification of the stable 2.0.0 release of
`@sealad886/homebridge-blink-cameras-new-api`.

This is a fresh request following
[#990](https://github.com/homebridge/plugins/issues/990). That request closed
while the question about differences from existing verified Blink plugins was
unanswered. The maintainer invited a new request with that explanation. This
request addresses it directly and provides current release evidence.

#### What this plugin adds

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

- `@jackietreeh0rn/homebridge-blink-security`, inspected at main
  `84db632d186744fbe26df8324d37025454f9c901`, already documents OAuth/PKCE,
  live video and one-way audio, USB-manifest motion detection, and optional push
  for doorbell presses. Its [camera controller setup](https://github.com/BitWise-0x/homebridge-blink-security/blob/84db632d186744fbe26df8324d37025454f9c901/src/accessories/camera.ts#L145-L215)
  configures streaming without a recording controller option, and its separate
  Record Clip switch starts a Blink recording. Its
  [maintainer's HKSV response](https://github.com/BitWise-0x/homebridge-blink-security/issues/35#issuecomment-4464889397)
  corroborates that distinction. Our added workflow delivers the
  saved clip into HomeKit Secure Video rather than only detecting it or starting
  a new Blink recording.
- `homebridge-blink-for-home-new` 0.2.1 provides overlapping security-system,
  motion and temperature functions. In the
  [inspected recording delegate](https://github.com/Flomentum-Solutions/homebridge-blink-for-home-new/blob/0d3c100e462991be8e1849aeefb4bfb999c5681e/src/homebridge/blink-hap.js),
  the recording stream handler returns no recording data. The added workflow
  here supplies a finite prepared recording through the existing camera
  accessory. I have not device-tested the competing plugin or treated its
  conflicting live-view documentation as proof that live view is unavailable.

The examined pre-API-change history also contains no functioning recording
delivery: Colin Bendell's 2022
[v3.9.0](https://github.com/colinbendell/homebridge-blink-for-home/blob/v3.9.0/src/homebridge/blink-hap.js#L47-L54)
and [v3.9.2](https://github.com/colinbendell/homebridge-blink-for-home/blob/a4058deeb4e4c281c04115aeec1fa6040a002506/src/homebridge/blink-hap.js#L47-L54)
callbacks return no media; the related forks examined retain that placeholder.
Among the public Blink Homebridge implementations examined, no other functional
delivery of completed clips through HKSV was found. This supports the added
workflow relative to the reviewed alternatives and historical predecessors,
without claiming exhaustive uniqueness or “first ever.” Sources were checked on
17 November 2026; the [comparison record](https://github.com/sealad886/homebridge-blink-cameras-new-api/blob/main/docs/verification/README.md#differentiation-supported-by-current-sources)
records scope and limits. Refresh the comparison before submission.

The platform also provides network arm/disarm through a SecuritySystem service,
per-device motion controls, snapshots, live video/audio, and optional temperature
where the device reports it. Those shared features are context, not the basis
for the additional-functionality claim.

#### Configuration and distribution

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
accepted alpha declares
`(MIT AND GPL-3.0-or-later AND BSD-3-Clause AND ZPL-2.1)`, with corresponding
helper source and dependency notices verified. [PENDING: recheck the expression,
source and notices against the final stable 2.0.0 artifact.]

Installation leaves Homebridge configuration unchanged. Legacy settings use the
documented explicit converter: an absolute configuration path previews the plan,
and `--apply` authorizes conversion with a private exact-byte backup and guarded
atomic replacement. Already-canonical files are unchanged without another backup.
Windows follows the documented manual mapping. The historical migration command
delegates to the same converter; neither command contacts Blink or restarts Homebridge.
The accepted alpha verifies `supports-hap`, absence of install/uninstall hooks
and the explicit migration tools. [PENDING: repeat these checks against the
final published 2.0.0 tarball; alpha checks do not qualify unpublished stable bytes.]

#### Privacy, storage and earlier review note

Blink cloud APIs and Google/Firebase registration and push transport are needed
for plugin operation. The latter delivers functional device events; it should
not be mistaken for a Blink-only network footprint.

[PENDING: summarize final no-tracking and storage-boundary review, including
confirmation that raw diagnostic capture is retired, retained redacted logs,
native temporary media and migration backups. Provide the evidence supporting
the corresponding form declarations. Do not include credentials, device IDs,
private endpoints, raw event payloads or camera footage.]

The earlier #990 automated result highlighted environment-file access in an
uninstall script. Stable 1.1.0 retired that unsupported hook, and this change
preserves its removal. Uninstallation does not run plugin-owned authentication
or accessory cleanup. Explicit migration is separate from npm installation.
[PENDING: confirm hook absence and retained auth/accessory persistence against
the final package; complete the broader runtime storage-boundary review.]

#### Stable release and acceptance evidence

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

#### Known limits

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
- [ ] Current source, npm latest and all evidence agree; no `PENDING` markers remain.
- [ ] Both verified alternatives checked again and comparison remains accurate.
- [ ] Six form answers selected from actual final evidence.
- [ ] Private operational data excluded; optional icon rights settled or omitted.

Conditional submission and feedback authority already exists. It becomes
actionable only after the stable-release gate above; it does not authorize
production installation.

No upstream issue or PR has been created by this draft.
