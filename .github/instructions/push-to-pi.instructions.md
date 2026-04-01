---
applyTo: '**'
---
Only apply this workflow when the assigned task changes the published plugin package, release metadata, deployment path, or another behavior that must be verified on the Raspberry Pi Homebridge instance. For Beads-only, documentation-only, or other repo-internal maintenance tasks, do not force a version bump or Pi deployment.

When this workflow applies, and **BEFORE** returning control to the User, you MUST do **ALL** of the following:

1. Bump the package version with `npm version <patch|minor|major>` per `docs/RELEASE.md`, update release notes as needed, and then use the repo's release workflow so `package.json`, `package-lock.json`, and release metadata stay consistent.
2. If a Beads Dolt remote is configured for the environment, push Beads state with `bd dolt push`.
3. Commit all changes to git.
4. Push the commit to the remote.
5. Make sure that the updated and version-bumped code is installed on the Homebridge instance on my Raspberry Pi 5 device.
