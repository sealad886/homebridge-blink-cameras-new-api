# Scoped offline evidence reporting

This directory restores the offline report, normalizer, and required storage dependency from commit `8930748ef1297dd46e516b2b338a1d4c9a5797c3`. Collector CLI, service, installation, configuration, and deployment files are intentionally outside this slice.

Verify or reproduce bundles with this trusted installed script:

```sh
python3 /trusted/install/scripts/pi-evidence/report.py verify /path/to/bundle
python3 /trusted/install/scripts/pi-evidence/report.py reproduce /path/to/bundle
```

Bundle `normalize.py` is provenance data. Verification checks internal checksums; it does not authenticate a bundle author or authorize bundled Python. Reproduction always executes the trusted installed normalizer, never source from the input bundle. Bundles no longer contain executable reproduction entry points. Keep the trusted installation separate from downloaded bundles.

Raw events, requested window, operator provenance, source hashes, and deterministic derived results remain available. A changed trusted normalizer can legitimately produce a mismatch against an older report; inspect that mismatch rather than executing the bundled historical source.

Run focused tests through the repository environment:

```sh
.venv/bin/python -m unittest discover -s scripts/pi-evidence/tests -v
```
