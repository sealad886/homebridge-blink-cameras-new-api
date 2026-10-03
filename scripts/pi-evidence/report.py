#!/usr/bin/env python3
"""Create and verify self-contained Pi evidence bundles."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import shutil
import sys
import tempfile
import time
import csv
import io
import platform
import stat
from pathlib import Path
from typing import Any


class BundleError(RuntimeError):
    """Bundle creation, verification, or reproduction failed."""


_BUNDLED_SOURCES = ("normalize.py",)
_TRUSTED_REPORT = "/trusted/install/scripts/pi-evidence/report.py"


def _json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def _safe_output(store: Any, output: os.PathLike[str] | str) -> Path:
    target = Path(output)
    if target.exists() or target.is_symlink():
        raise BundleError(f"output already exists: {target}")
    exports = Path(store.root) / "exports"
    if exports.exists() and (exports.is_symlink() or not exports.is_dir()):
        raise BundleError(f"unsafe exports directory: {exports}")
    exports.mkdir(mode=0o700, exist_ok=True)
    os.chmod(exports, 0o700)
    parent = target.parent.resolve()
    if parent != exports.resolve() or not parent.is_dir():
        raise BundleError(f"output must be a direct child of {exports}")
    if target.name in {"", ".", ".."}:
        raise BundleError(f"unsafe output parent: {parent}")
    return target


def _write(path: Path, data: bytes, reserved_writer=None) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        if reserved_writer is None:
            os.write(fd, data)
        else:
            reserved_writer(fd, data)
        os.fsync(fd)
    finally:
        os.close(fd)


def _load_normalizer():
    # Bundle source files are evidence only, never executable input.
    base = Path(__file__).resolve().parent
    path = base / "normalize.py"
    if not path.is_file() or path.is_symlink():
        raise BundleError(f"normalizer unavailable: {path}")
    name = f"pi_evidence_normalize_{hash(path)}"
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise BundleError(f"cannot load normalizer: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous
    if not callable(getattr(module, "build_report", None)):
        raise BundleError("normalizer does not expose build_report")
    return module


def _hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _csv_safe(value: Any) -> str:
    if value is None:
        return ""
    text = json.dumps(value, ensure_ascii=False, sort_keys=True) if isinstance(value, (dict, list)) else str(value)
    if text.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + text
    return text


def _sessions_csv(sessions: list[dict[str, Any]]) -> bytes:
    required = {
        "session_id", "kind", "start", "end", "duration_seconds", "duration_basis",
        "boundary_state", "boot_id", "pid", "uid", "evidence_ids",
    }
    fields = sorted(required | {key for row in sessions for key in row})
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for row in sessions:
        writer.writerow({key: _csv_safe(row.get(key)) for key in fields})
    return stream.getvalue().encode("utf-8")


def export_bundle(
    store: Any,
    start: float,
    end: float,
    output: os.PathLike[str] | str,
    provenance: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Export retained records and a deterministic derived report into a private directory."""
    start, end = float(start), float(end)
    if not start < end:
        raise ValueError("start must be earlier than end")
    target = _safe_output(store, output)
    normalizer = _load_normalizer()
    # Size and materialize one immutable read snapshot. A second Store read can
    # include appends that were never covered by this export's reservation.
    snapshot = [
        (json.dumps(event, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8") + b"\n",
         float(event["received_at"]))
        for event in store.read_events()
    ]
    raw_size = sum(len(data) for data, _received in snapshot)

    parent = target.parent
    source_size = sum(
        p.stat().st_size for p in (Path(__file__).resolve().parent / name for name in _BUNDLED_SOURCES)
    )
    estimated = raw_size * 4 + source_size + 10 * 1024 * 1024
    try:
        reservation = store.reserve(estimated)
        reservation_id = reservation.__enter__()
    except Exception as exc:
        raise BundleError(f"export capacity reservation failed: {exc}") from exc
    staging = None
    try:
        staging = Path(tempfile.mkdtemp(prefix=f".{target.name}.tmp-", dir=parent))
        os.chmod(staging, 0o700)
        raw_dir = staging / "raw"
        raw_dir.mkdir(mode=0o700)
        raw_path = raw_dir / "events.jsonl"
        raw_fd = os.open(raw_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
        event_count = 0
        earliest = None
        raw_budget = estimated - source_size - 10 * 1024 * 1024
        raw_written = 0
        raw_buffer = bytearray()
        try:
            for data, received in snapshot:
                if raw_written + len(data) > raw_budget:
                    raise BundleError(
                        f"raw export exceeded reserved capacity: next={raw_written + len(data)} budget={raw_budget}"
                    )
                raw_buffer.extend(data)
                if len(raw_buffer) >= 1024 * 1024:
                    store.write_reserved(reservation_id, raw_fd, raw_buffer)
                    raw_buffer.clear()
                raw_written += len(data)
                event_count += 1
                earliest = received if earliest is None else min(earliest, received)
            if raw_buffer:
                store.write_reserved(reservation_id, raw_fd, raw_buffer)
            os.fsync(raw_fd)
        finally:
            os.close(raw_fd)

        # Normalization has its own materialization phase; do not retain both.
        del snapshot

        def raw_events():
            with raw_path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    if line.strip():
                        yield json.loads(line)

        derived = normalizer.build_report(raw_events(), start, end)
        if not isinstance(derived, dict) or not {"sessions", "activity", "timeline", "coverage"}.issubset(derived):
            raise BundleError("normalizer returned an incomplete report")
        generated_at = time.time()
        evidence_expires_at = earliest + int(store.retention_seconds) if earliest is not None else generated_at
        report_document = {
            "schema_version": 1,
            "requested_window": {"start": start, "end": end},
            "generated_at": generated_at,
            "evidence_expires_at": evidence_expires_at,
            "retention_notice": "Export does not extend source retention. Delete downloaded copies according to this expiry.",
            "event_count": event_count,
            **derived,
        }
        provenance_document = {
            "schema_version": 1,
            "generated_at": generated_at,
            "requested_window": {"start": start, "end": end},
            "store_status": store.status(),
            "parameters": {"all_retained_context_included": True},
            "reproduction": {
                "verify_command": f"python3 {_TRUSTED_REPORT} verify /path/to/bundle",
                "reproduce_command": f"python3 {_TRUSTED_REPORT} reproduce /path/to/bundle",
                "normalizer_sha256": _hash(Path(__file__).resolve().parent / "normalize.py"),
                "python_version": platform.python_version(),
                "platform": platform.platform(),
            },
            "operator_provenance": provenance or {},
        }
        report_bytes = _json_bytes(report_document)
        sessions_bytes = _json_bytes(derived["sessions"])
        sessions_csv = _sessions_csv(derived["sessions"])
        activity_bytes = b"".join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8") + b"\n" for row in derived["activity"])
        timeline_bytes = b"".join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8") + b"\n" for row in derived["timeline"])
        coverage_bytes = _json_bytes(derived["coverage"])
        provenance_bytes = _json_bytes(provenance_document)
        projected = (
            raw_path.stat().st_size + source_size + len(report_bytes) + len(sessions_bytes)
            + len(sessions_csv) + len(activity_bytes) + len(timeline_bytes)
            + len(coverage_bytes) + len(provenance_bytes) + 1024 * 1024
        )
        if projected > estimated:
            raise BundleError(f"bundle exceeded reserved capacity: projected={projected} reserved={estimated}")
        reserved_writer = lambda fd, data: store.write_reserved(reservation_id, fd, data)
        _write(staging / "report.json", report_bytes, reserved_writer)
        _write(staging / "sessions.json", sessions_bytes, reserved_writer)
        _write(staging / "sessions.csv", sessions_csv, reserved_writer)
        _write(staging / "activity.jsonl", activity_bytes, reserved_writer)
        _write(staging / "timeline.jsonl", timeline_bytes, reserved_writer)
        _write(staging / "coverage.json", coverage_bytes, reserved_writer)
        _write(staging / "expiry.json", _json_bytes({"expires_at": evidence_expires_at}), reserved_writer)
        _write(staging / "provenance.json", provenance_bytes, reserved_writer)
        markdown = (
            "# Pi session evidence report\n\n"
            f"Requested Unix UTC window: `{start}` to `{end}`.\n\n"
            f"Observed sessions: {len(derived['sessions'])}. Activity records: {len(derived['activity'])}. "
            f"Timeline records: {len(derived['timeline'])}.\n\n"
            f"Coverage state: `{derived['coverage'].get('state', 'unknown')}`. "
            "See `coverage.json` for gaps and limits. Time overlap alone does not establish attribution.\n"
        ).encode("utf-8")
        _write(staging / "report.md", markdown, reserved_writer)
        readme = (
            "Pi session evidence bundle\n\n"
            "Files are owner-only and may contain sensitive raw command arguments.\n"
            "Capacity limits govern pi-evidence writes; they are not a filesystem quota for external processes.\n"
            "Verify with trusted installed report.py; bundled sources are provenance data only.\n"
            f"Reproduce: python3 {_TRUSTED_REPORT} reproduce /path/to/bundle\n"
            f"Evidence retention deadline (Unix UTC): {evidence_expires_at}\n"
        ).encode("utf-8")
        _write(staging / "README.txt", readme, reserved_writer)


        source_dir = Path(__file__).resolve().parent
        for name in _BUNDLED_SOURCES:
            source = source_dir / name
            if not source.is_file() or source.is_symlink():
                raise BundleError(f"required reproduction source unavailable: {source}")
            _write(staging / name, source.read_bytes(), reserved_writer)

        files = sorted(
            path for path in staging.rglob("*") if path.is_file() and path != staging / "manifest.sha256"
        )
        manifest = "".join(
            f"{_hash(path)}  {path.relative_to(staging).as_posix()}\n" for path in files
        ).encode("ascii")
        _write(staging / "manifest.sha256", manifest, reserved_writer)
        dir_fd = os.open(staging, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
        os.rename(staging, target)
        parent_fd = os.open(parent, os.O_RDONLY)
        try:
            os.fsync(parent_fd)
        finally:
            os.close(parent_fd)
    except Exception:
        if staging is not None:
            shutil.rmtree(staging, ignore_errors=True)
        raise
    finally:
        reservation.__exit__(None, None, None)

    result = verify_bundle(target)
    result.update({"path": str(target), "evidence_expires_at": evidence_expires_at})
    return result


def _bundle_dir(bundle: os.PathLike[str] | str) -> Path:
    root = Path(bundle)
    if root.is_symlink() or not root.is_dir():
        raise BundleError(f"bundle must be a real directory: {root}")
    return root.resolve()


def verify_bundle(bundle: os.PathLike[str] | str) -> dict[str, Any]:
    root = _bundle_dir(bundle)
    manifest_path = root / "manifest.sha256"
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise BundleError("manifest missing or unsafe")
    expected: dict[str, str] = {}
    for number, line in enumerate(manifest_path.read_text("ascii").splitlines(), 1):
        try:
            digest, name = line.split("  ", 1)
        except ValueError as exc:
            raise BundleError(f"invalid manifest line {number}") from exc
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise BundleError(f"invalid manifest digest at line {number}")
        candidate = Path(name)
        if not name or candidate.is_absolute() or ".." in candidate.parts or name in expected:
            raise BundleError(f"unsafe or duplicate manifest name at line {number}")
        expected[name] = digest
    entries = list(root.rglob("*"))
    unsafe = [str(p.relative_to(root)) for p in entries
              if not (stat.S_ISREG(p.lstat().st_mode) or stat.S_ISDIR(p.lstat().st_mode))]
    if unsafe:
        raise BundleError(f"bundle contains unsafe entries: {sorted(unsafe)}")
    actual_names = {
        p.relative_to(root).as_posix() for p in entries if p.is_file() and p != manifest_path
    }
    if actual_names != set(expected):
        raise BundleError(f"bundle file set differs from manifest: expected={sorted(expected)} actual={sorted(actual_names)}")
    expected_dirs = {
        str(parent)
        for name in expected
        for parent in Path(name).parents
        if str(parent) != "."
    }
    actual_dirs = {p.relative_to(root).as_posix() for p in entries if p.is_dir()}
    if actual_dirs != expected_dirs:
        raise BundleError(f"bundle directory set differs from manifest: expected={sorted(expected_dirs)} actual={sorted(actual_dirs)}")
    for name, digest in expected.items():
        path = root / name
        if path.is_symlink() or _hash(path) != digest:
            raise BundleError(f"hash mismatch: {name}")
    return {"valid": True, "files": len(expected), "manifest": str(manifest_path)}


def reproduce(bundle: os.PathLike[str] | str) -> dict[str, Any]:
    root = _bundle_dir(bundle)
    verify_bundle(root)
    try:
        stored = json.loads((root / "report.json").read_text("utf-8"))
        window = stored["requested_window"]
    except (OSError, KeyError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BundleError(f"cannot read bundle evidence: {exc}") from exc
    normalizer = _load_normalizer()
    def events():
        with (root / "raw" / "events.jsonl").open("r", encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    yield json.loads(line)
    rebuilt = normalizer.build_report(events(), float(window["start"]), float(window["end"]))
    comparable = {key: stored[key] for key in ("sessions", "activity", "timeline", "coverage")}
    if rebuilt != comparable:
        raise BundleError("reproduced normalized report differs from stored report")
    return {"reproduced": True, "event_count": int(stored.get("event_count", 0)), "report": rebuilt}


# Descriptive alias used by the main CLI; keep reproduce() for the documented
# standalone command and existing callers.
reproduce_bundle = reproduce


def _main(argv: list[str]) -> int:
    if len(argv) != 3 or argv[1] not in {"verify", "reproduce"}:
        print("usage: report.py {verify|reproduce} BUNDLE", file=sys.stderr)
        return 2
    try:
        result = verify_bundle(argv[2]) if argv[1] == "verify" else reproduce(argv[2])
    except BundleError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv))
