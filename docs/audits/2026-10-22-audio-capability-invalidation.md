# Audio capability invalidation — 22 October 2026

## Observed boundary

RC.17 source 46024d19e7ec8db4f62cfbf5b47d5d1614f5e8de on the Pi uses the operator-selected Homebrew FFmpeg 8.1.3 binary with libx264/libopus but no libfdk_aac. Saved audio is Opus. Logs show Opus advertisement and four AAC-ELD startup refusals. These establish a mismatch, not the controller's internal cache state. No Pi configuration, binary, pairing or installation changes are part of this correction.

## Reproduced cause

The locally pinned HAP-NodeJS 0.14.0 correctly updates the restored SupportedAudioStreamConfiguration TLV. Its configuration hash excludes characteristic values, so AAC-ELD→Opus changes alone do not increment the advertised configuration number. A plugin version bump does not substitute for that cue: HAP's firmware check uses its own library version. The previous restoration regression checked only server TLV contents. The Pi actually runs @homebridge/hap-nodejs 2.2.4-beta.2; read-only inspection confirms the same value exclusion and public description behavior in that version.

References: upstream [characteristic configuration representation](https://github.com/homebridge/HAP-NodeJS/blob/v0.14.0/src/lib/Characteristic.ts), [configuration identity](https://github.com/homebridge/HAP-NodeJS/blob/v0.14.0/src/lib/model/AccessoryInfo.ts), [service events](https://github.com/homebridge/HAP-NodeJS/blob/v0.14.0/src/lib/Service.ts) and [accessory advertisement](https://github.com/homebridge/HAP-NodeJS/blob/v0.14.0/src/lib/Accessory.ts). Context7 did not provide this Node library; the installed pinned source and primary API documentation were used.

## Correction

After the shared motion-device owner configures a new or restored camera controller, read the actual audio offer from its public accessory services. Set a deterministic SHA256 capability digest in SupportedAudioStreamConfiguration's public description property. Only on change, emit the publicly typed service-configurationChange event so HAP performs its existing debounced configuration hash/number and advertisement update. setProps alone does not schedule that update after publication; Homebridge updatePlatformAccessories only persists cache data.

No private configuration counter, controller internals, service UUID, subtype, IID or custom Home name is rewritten. There is no pairing reset. Unchanged capability metadata is idempotent; changes in encoder availability or offered codec/rates change the digest. The offer contains codec metadata, not credentials or media. Unsupported AAC-ELD selections still fail before vendor allocation; Opus is never sent under an AAC-ELD selection.

## Verification and release limits

A real-HAP restoration regression first fails with a no-op helper because the configuration number remains unchanged. It passes after the correction, covering AAC→Opus, stable restoration, AAC availability returning and identity preservation. A bridged-accessory regression also exercises the actual post-publication debounce and advertisement path. An isolated in-memory probe against the Pi’s installed 2.2.4-beta.2 library confirms that a changed offer increments configuration and advertises, while an unchanged offer does not. The probe writes no host files and opens no listener. Its retained receipt is `logs/rc18-development-2026-10-22/pi-hap-probe.json`. Existing early-refusal/session-cleanup tests remain required. Release receipts own final CI/review/package evidence.

This proves a configuration-invalidation defect and its local correction. It does not prove that caching caused every physical Home request. Operator installation, live audio/video, STOP/reopen and snapshot/reset acceptance are still required. Keep the Homebrew binary; no insecure codec substitution or host mutation is authorized. F05/F06 and issue52 remain open.
