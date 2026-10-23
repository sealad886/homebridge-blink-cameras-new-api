# Historical layout migration proposal

The proposed alternate custom-UI tree and dual build outputs were not adopted.
The earlier file-move and packaging recipe is obsolete; Git history preserves it.
Do not use it as an installation or migration procedure.

- [Repository conventions](CONVENTIONS.md#custom-ui-packaging) owns the current
  `src/homebridge-ui` → `dist/homebridge-ui` packaging contract.
- [Contributing](../CONTRIBUTING.md) owns development and local validation.
- [Release guide](RELEASE.md) owns versioning, registry upgrades and rollback.
- [Authentication](authentication.md) owns sign-in state and recovery.

No host configuration or stored authentication conversion is prescribed by this
historical proposal. See the [documentation map](README.md) for current owners.
