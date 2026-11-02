# Configuration UX and camera-feed capacity design

Status: approved for local implementation. Publication and device installation
are separate actions. Baseline: `a23124e4875cb3fa21d9baedeedddb9b830cdc30`,
Homebridge UI 5.29.0 and Plugin UI Utils 2.2.5.

## Outcome and constraints

Users must be able to choose cameras, understand live viewing versus HomeKit
recording, edit settings and know what saving requires without working through
authentication maintenance first. The authenticated review confirmed that the
current custom connection interface and native schema form are stacked in one
long modal, that recording is grouped with live streaming, and that precise
values use unmarked sliders. A plugin-authored failure banner can coexist with
stored-sign-in content and continuing progress indicators.

The approved scope also removes the artificial four-camera HSV selection limit
and adds independent limits for actual Sync Modules. The implementation permits
more local feeds; it cannot guarantee that Blink will sustain them.

Retain the existing authentication boundary, configuration keys, unknown fields,
additional plugin blocks and `_bridge` metadata. No running settings, Homebridge
processes or cameras are changed by implementing or reviewing this editor. Do
not add a frontend framework, a second settings schema, automatic restart, new
capture behavior or new real-camera load probes.

## One settings interface

Use one compact custom interface in the existing Homebridge settings iframe.
Five wrapping navigation buttons select one section at a time:

| Section | Responsibility |
| --- | --- |
| Overview & connection | Connection facts, first sign-in, connection check and recovery; account maintenance is secondary. |
| Cameras in Home | Discovered camera inclusion, Home names, per-camera overrides and clearly identified Blink systems/Sync Modules. |
| HomeKit recording | Discovered-camera opt-in, Home permissions, pre-event capture and motion/privacy explanations. |
| Live viewing & sound | Live view, ordinary picture-quality choices and the shared camera-audio permission. |
| Advanced & troubleshooting | Exact viewer/bitrate/module limits, polling, snapshots, codecs, encoder tuning, diagnostics, identity and unusual account recovery. |

Keep module capacity visible beside the discovered topology, with the exact
integer editor in the relevant camera/module details rather than a range slider.
The ordinary path uses named quality choices and a small viewer-count selector.
Do not force five long section labels onto one row in the narrow modal.

`config.schema.json` remains authoritative for setting names, defaults,
constraints and grouping. Its five top-level layout fieldsets define navigation
and section ownership. Read properties directly from the canonical inner schema.
Implement only the controls this plugin needs: booleans, text, exact integers,
existing enums and the existing domain arrays. Discovered-camera and module
controls may have specialized presentation, but must use the same draft and
validation path. Use Homebridge's injected theme and preserve semantic labels,
visible focus and existing reduced-motion support.

### Why authored controls

Homebridge's standalone `createForm` initially appeared to avoid authored scalar
controls. Its actual 5.29 implementation has two relevant limitations: standalone
validity is not exposed to the iframe or the outer Save action, and changes reach
the iframe after a 100 ms debounce. A fast Save or section switch can precede the
latest value reaching `pluginConfig`. A separate “Update draft” action would add
another apply step.

Therefore use a small schema-driven renderer inside the iframe. Do not invoke
`createForm` or stack `showSchemaForm` beneath it. This is not a general form
engine: support the actual schema types and domain controls, and fail clearly
on unsupported definitions.

Primary contracts:
[Plugin UI Utils 2.2.5](https://github.com/homebridge/plugin-ui-utils/blob/v2.2.5/README.md),
[Homebridge UI 5.29 custom plugin component](https://github.com/homebridge/homebridge-config-ui-x/blob/v5.29.0/ui/src/app/core/plugins/custom-plugins/custom-plugins.component.ts).

## One draft and the host Save action

Load the complete plugin-block array and identify the current platform block.
Keep one in-memory draft. Raw input updates it synchronously, including invalid
or incomplete values, and immediately disables Homebridge's outer Save. Section
changes retain raw values and errors. Unowned fields and other blocks survive.

Serialize full-draft validation and `updatePluginConfig(fullBlocks)`. Use a
monotonically increasing draft revision so an old response cannot validate or
stage a newer draft. Enable Save only when the latest revision is valid and its
host-staging acknowledgement has returned. Failed validation or staging remains
visible and retryable; no stale success may re-enable Save. Do not make a provider
request on each keystroke.

Retain the single outer Save action. The host saves, closes the modal and opens
its restart flow. The iframe explains “Save, then restart the Blink child bridge”
and shows unsaved edits; it does not invent a `configSaved` callback or claim
Applied, Recording or iCloud ready. Saving does not prove runtime application or
a saved recording.

Authentication operations remain explicitly immediate. Prevent account
maintenance from implicitly persisting unrelated draft edits: complete first
sign-in before general editing, and require an existing dirty draft to be saved
or discarded before an account action that persists configuration. Do not
automatically restart Homebridge.

## Read-only inventory and canonical validation

Extend the existing authenticated settings-server service with one inventory
projection shared by runtime and settings validation. It contains networks,
actual Sync Modules and cameras from the camera, owl and doorbell lists. Camera
identity is qualified by kind (`camera:123`, `owl:123`, `doorbell:123`) to avoid
unproven numeric-ID uniqueness. Names, network context and module association
make duplicate names distinguishable in the editor.

Expose only configuration-relevant identity/state data, a snapshot revision and
fetch time; never credentials or raw provider responses. Failed discovery is an
error, not a successful empty inventory. Preserve saved selections and visibly
retain a last-good snapshot as stale if refresh fails. Never silently remove
unmatched or ambiguous existing selections. New selections use qualified
identities in existing configuration arrays; runtime matching understands them.

Add `/settings/validate` for the full platform draft and its client revision.
Compile the canonical inner JSON schema once with the existing Ajv 8 dependency,
promoted to runtime. Do not coerce values, insert defaults or remove additional
properties. Resolve any Homebridge-only schema metadata deliberately rather than
weakening canonical constraints. Add semantic validation for selectors, module
overrides and runtime requirements that JSON schema alone cannot express.

Validate references against the server-owned inventory snapshot, never a
client-invented camera list. The response echoes the revision and reports
validity plus safe field paths, codes and messages. It may include the derived
effective capacity needed by the editor. Do not echo rejected values or log
credentials. Discovery and validation never save, restart, arm, enable motion or
open a live feed.

## Camera-feed capacity

The existing explicit four-camera ceiling applies to `hksvCameras` selection;
there is no existing global four-vendor-feed admission gate. Remove the schema
`maxItems: 4` and runtime list-length rejection. Keep HomeKit viewers per camera
separate, including the supported per-camera session and shared-consumer bounds.

The derived global feed capacity is the number of distinct known, nonexcluded
cameras across all camera kinds. Offline cameras remain known cameras; a failed
start is handled separately. Excluded cameras do not allocate capacity. No
independently editable global number is required.

Add:

```ts
syncModuleFeedLimits?: Array<{
  syncModuleId: string;
  maxFeeds: number; // positive safe integer
}>;
```

Each actual module defaults to its associated nonexcluded camera count. An
explicit limit is bounded by the available associated cameras and the global
capacity. No zero/disable interpretation is added; camera inclusion already owns
that behavior. Unknown IDs, duplicate overrides, invalid integers and unresolved
associations receive actionable validation failures rather than ignored limits.

### Association is explicit and limited by evidence

The recovered camera records expose `network_id`; Sync Modules have their own
`id` and `network_id`. The available module-status response does not add camera
membership. Do not equate a network ID with a module ID or fabricate a camera's
physical module connection.

- Exactly one module in a network: expose a **network association** to that real
  module. This does not claim its video uses that module as transport.
- No module reported: no synthetic module; cameras remain under global capacity.
- Multiple modules in a network: association is ambiguous. Reject an explicit
  module override affected by that ambiguity at save and runtime; never guess or
  silently bypass the configured cap.

Keep the same projection and semantic rules in runtime and the settings server.
Module metadata must be validated; the existing homescreen validator does not
currently validate it.

### Admission belongs to the upstream generation

One live viewer and HSV can share one camera's upstream feed. Count that as one
lease, not two consumers. Acquire atomically before provider allocation. Hold the
lease across pending allocation, active transport and retirement; release it
once the actual owned source capability has closed, including late allocation
cleanup. Repeated stop and failure paths must be idempotent.

Extend the existing shared-feed authority rather than adding a parallel stream
manager. A local early STOP response while provider allocation is pending is not
enough to release a cross-camera slot. Do not claim that local closure or a
bounded command-completion attempt proves remote provider termination.

Retain 32 MiB per-camera and 64 MiB aggregate recording budgets, fragment bounds,
per-worker queues/lifetimes/output limits and diagnostic disk quotas. Diagnostic
file recording can refuse its separate quota while the live feed continues.
Larger camera inventory must not multiply the shared byte budget or create an
unbounded wait queue. Resource exhaustion must fail clearly.

## Motion and recording language

The editor must state the current runtime behavior precisely:

- `enableMotionPolling` reads Blink clip events; HSV uses local video motion.
- Blink disarming or camera motion-off suppresses new local recording events;
  continuous capture and the pre-event buffer may remain active while permitted.
- Home recording-off cancels recording capture and clears its buffer. Home camera
  active-off also blocks live viewing and snapshots.
- Live-view enablement is independent from HSV camera selection.
- Camera audio gates live viewing and recording; Home recording-audio permission
  also applies. Live picture presets do not set HSV recording quality.
- Raw diagnostic video is saved on the Homebridge host, not to iCloud and not as
  an HSV recording destination.

Do not infer camera health or recording readiness from stored credentials.

## Initialization and recovery

Register the documented host `ready` handler synchronously and use one idempotent
initialization owner. Distinguish required schema/config failure from recoverable
status, connection-check and inventory failure. Every loading phase ends with
content or a named error and retry. Remove decorative continuing progress dots
from settled account screens.

The observed fatal banner is authored by the plugin's global error handlers. A
global browser error can latch it while later status work renders content.
Safari's console also reports an invalid HTML pattern (`[A-Za-z0-9._-]+`) and two
occurrences of `SyntaxError: Unexpected token '{'. Expected ')' to end a compound
expression.` during settings load/configuration navigation. Trace the actual
generated source/parser failure before claiming the startup defect corrected.
Pre-login CSP and session errors are separate observations; do not weaken CSP to
address a plugin parser error. Surface unexpected errors safely without turning
an unrelated recoverable error into a permanent blanket failure over a
functioning editor. Include real Safari parsing/interaction evidence, since a
jsdom or Chromium-only pass does not establish this regression is fixed.

## Verification and integration

Focused UI checks cover final-keystroke preservation, invalid drafts across
navigation, out-of-order replies, latest-revision Save gating, staging failure,
unknown-field/other-block preservation, unavailable inventory, stale selectors,
duplicate names and dirty-draft authentication boundaries. Inspect the actual
modal width, light/dark appearance, keyboard focus and a narrow/zoomed layout.

Runtime tests cover at least six HSV selectors and six distinct synthetic feeds,
module isolation, same-camera sharing, atomic admission, start failure,
cancellation and late allocation, delayed/rejected closure, exclusions,
standalone/ambiguous inventories and unchanged resource exhaustion.

After focused checks run the full build, lint and Jest gate. Independent
code/TypeScript review covers data loss, identity matching, Save races and feed
retirement; the privacy/security lens covers discovery/error data and unchanged
capture-permission boundaries. No new real-feed probe, device installation,
restart or publication is included in this design's local acceptance.

Preserving existing keys means no running-config conversion is required. The
implementation changes files only; a future user save uses Homebridge's normal
configuration persistence. Rolling back the local source requires no production
data rewrite. Publication/install and its rollback plan require their own scope.

