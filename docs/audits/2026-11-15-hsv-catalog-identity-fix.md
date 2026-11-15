# Issue 109: saved Blink clip camera identity

## Observed cause

Issue [#109](https://github.com/sealad886/homebridge-blink-cameras-new-api/issues/109)
reports native Blink recordings available in the Blink app but missing from HSV.
The old matcher required raw catalog device_name to equal the full authoritative
homescreen camera name. The recorded 2026-11-13 investigation showed all four
catalog names equal a case-sensitive ASCII-alphanumeric compacted full name.

A fresh read-only Pi probe at 2026-11-15 03:39:59 UTC confirmed installed beta.4,
four cameras, 1,000 cached catalog rows and the same four name relationships.
The probe used one homescreen GET with existing cached authentication and read
projected saved catalog relationships. It performed no refresh, mutation,
installation, service action or production file write. Retained evidence omits
names, provider identifiers, serials, credentials and media locations.

## Smallest complete change

The matcher accepts the authoritative full raw name or that exact nonempty
compacted form. Catalog strings are compared exactly: no incoming normalization,
case folding, partial/suffix match, display-alias or URL-derived identity.
Overlapping raw/compacted aliases among distinct devices in the same accepted
account/network/Sync Module cause rejection, including excluded/HSV-disabled
cameras. Empty compacted names are not aliases. Exact Unicode names remain valid;
this is not transliteration or a universal vendor naming specification.

Native consumed-clip identities keep the original provider name. Existing scope,
authoritative-inventory, timestamp tolerance, conflicting-media-ID and consumed
identity guards remain unchanged. No stored-state or configuration migration is
needed, and no runtime setting, dependency or native source pin changes.

The existing delivery path already uses each matched event's camera/module and
that camera's recording delegate. Installed HAP-NodeJS 0.14.0 and its pinned
[upstream CameraController contract](https://github.com/homebridge/HAP-NodeJS/blob/v0.14.0/src/lib/controller/CameraController.ts)
confirm separate streaming and recording delegates on the same camera controller. Full discovery inventory is built before
consumer exclusions. No additional camera accessory, replay helper or live-view
replacement is needed.

## Focused verification

- 32 matcher cases passed, including raw/compacted names, alias collisions across
  device kinds, foreign scope, exact case/Unicode, partial-name rejection and
  unchanged consumed/time/conflicting-ID behavior.
- 181 runtime and real-HAP assembly tests passed. A two-camera regression acquires
  distinct downloaded markers, invokes preparation and feeds each marker through
  its own real recording delegate's final packet and acknowledgement lifecycle.
  An excluded colliding camera blocks download, preparation and recording offer.
- TypeScript, matcher source lint and diff checks passed. Frozen hashes and logs
  are retained in logs/hsv109/matcher-final.json and pipeline-final.json.

The downloader and media preparation in these integration tests are synthetic.
They establish routing and handoff contracts, not live codecs, vendor downloads,
a Home hub's timeline/iCloud decision or physical camera acceptance. Full local
qualification and fresh independent verification are separate integration gates.
Publication, Pi installation and physical acceptance have not been performed.
