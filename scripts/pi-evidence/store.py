#!/usr/bin/env python3
"""Durable, bounded storage for Raspberry Pi session evidence.

Capacity admission covers collector-managed writes. It is not a filesystem
quota against unrelated administrators or processes. Expiry and crash recovery
may perform small control writes needed to preserve or remove managed evidence.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import threading
import time
import uuid
import fcntl
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Iterator


DEFAULT_RETENTION_SECONDS = 14 * 24 * 60 * 60
DEFAULT_MAX_BYTES = 16_000_000_000
DEFAULT_MIN_FREE_BYTES = 10_000_000_000
_INTERNAL_WRITE_HEADROOM = 64 * 1024**2
_INDEX_WRITE_ESTIMATE = 64 * 1024
_FAULT_SLOT_BYTES = 64 * 1024
_NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)


class StoreError(RuntimeError):
    """Base store failure."""


class CapacityError(StoreError):
    """Capture stopped to protect retained evidence and filesystem reserve."""


class CorruptEventError(StoreError):
    """An indexed raw event no longer matches its durable record."""


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _indexed_write_estimate(encoded_bytes: int) -> int:
    """Bound B-tree, rollback/WAL, and page-image amplification for one value."""
    return _INDEX_WRITE_ESTIMATE + 4 * max(0, int(encoded_bytes))


def _safe_root(path: os.PathLike[str] | str) -> Path:
    root = Path(path)
    if root.exists() and root.is_symlink():
        raise StoreError(f"store root must not be a symlink: {root}")
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root.is_symlink() or not root.is_dir():
        raise StoreError(f"store root is not a directory: {root}")
    os.chmod(root, 0o700)
    return root.resolve()


class Store:
    def __init__(
        self,
        root: os.PathLike[str] | str,
        retention_seconds: int = DEFAULT_RETENTION_SECONDS,
        max_bytes: int = DEFAULT_MAX_BYTES,
        min_free_bytes: int = DEFAULT_MIN_FREE_BYTES,
    ) -> None:
        if retention_seconds <= 0 or max_bytes <= 0 or min_free_bytes < 0:
            raise ValueError("retention and capacity values must be positive")
        self.root = _safe_root(root)
        self.retention_seconds = int(retention_seconds)
        self.max_bytes = int(max_bytes)
        self.min_free_bytes = int(min_free_bytes)
        self.segments = self.root / "segments"
        if self.segments.exists() and self.segments.is_symlink():
            raise StoreError("segments path must not be a symlink")
        self.segments.mkdir(mode=0o700, exist_ok=True)
        os.chmod(self.segments, 0o700)
        self._lock = threading.RLock()
        self._flock_depth = 0
        self._closed = False
        self._last_wall = time.time()
        self._last_mono = time.monotonic()

        self._fault_path = self.root / "health-ledger"
        if self._fault_path.exists() and self._fault_path.is_symlink():
            raise StoreError("health ledger must not be a symlink")
        fd = os.open(self._fault_path, os.O_RDWR | os.O_CREAT | _NOFOLLOW, 0o600)
        try:
            os.fchmod(fd, 0o600)
            if os.fstat(fd).st_size < _FAULT_SLOT_BYTES:
                os.ftruncate(fd, _FAULT_SLOT_BYTES)
                os.fsync(fd)
        finally:
            os.close(fd)

        lock_path = self.root / "store.lock"
        self._lock_fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | _NOFOLLOW, 0o600)
        os.fchmod(self._lock_fd, 0o600)
        fcntl.flock(self._lock_fd, fcntl.LOCK_EX)

        db_path = self.root / "index.sqlite3"
        self._db_path = db_path
        if db_path.exists() and db_path.is_symlink():
            raise StoreError("index path must not be a symlink")
        try:
            self._db = sqlite3.connect(db_path, timeout=30, check_same_thread=False)
            os.chmod(db_path, 0o600)
            self._db.execute("PRAGMA journal_mode=WAL")
            self._db.execute("PRAGMA synchronous=FULL")
            self._db.execute("PRAGMA secure_delete=ON")
            self._db.executescript(
            """
            CREATE TABLE IF NOT EXISTS events (
                event_id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                source_id TEXT,
                received_at REAL NOT NULL,
                source_time REAL,
                boot_id TEXT,
                monotonic REAL NOT NULL,
                metadata_json TEXT NOT NULL,
                segment TEXT NOT NULL,
                offset INTEGER NOT NULL,
                length INTEGER NOT NULL,
                digest TEXT NOT NULL,
                UNIQUE(source, source_id)
            );
            CREATE INDEX IF NOT EXISTS events_received ON events(received_at, event_id);
            CREATE TABLE IF NOT EXISTS checkpoints (
                name TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS pending_deletions (
                segment TEXT PRIMARY KEY,
                marked_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reservations (
                reservation_id TEXT PRIMARY KEY,
                bytes INTEGER NOT NULL,
                created_at REAL NOT NULL,
                owner_pid INTEGER,
                owner_start_ticks INTEGER,
                owner_boot_id TEXT
            );
            CREATE TABLE IF NOT EXISTS source_health (
                source TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                detail_json TEXT NOT NULL,
                received_at REAL NOT NULL,
                event_id TEXT NOT NULL
            );
            """
            )
            self._db.commit()
            columns = {row[1] for row in self._db.execute("PRAGMA table_info(reservations)")}
            if "owner_pid" not in columns:
                self._db.execute("ALTER TABLE reservations ADD COLUMN owner_pid INTEGER")
            if "owner_start_ticks" not in columns:
                self._db.execute("ALTER TABLE reservations ADD COLUMN owner_start_ticks INTEGER")
            if "owner_boot_id" not in columns:
                self._db.execute("ALTER TABLE reservations ADD COLUMN owner_boot_id TEXT")
            self._db.commit()
            self._clear_stale_reservations()
            self._resume_deletions()
            self._recover_segments()
        finally:
            fcntl.flock(self._lock_fd, fcntl.LOCK_UN)

    def _resume_deletions(self) -> None:
        rows = self._db.execute("SELECT segment FROM pending_deletions").fetchall()
        for (segment_name,) in rows:
            path = self.segments / segment_name
            if path.is_symlink():
                self._fault("corruption", {"segment": segment_name, "reason": "pending deletion is symlink"})
                continue
            try:
                path.unlink()
            except FileNotFoundError:
                pass
            self._db.execute("DELETE FROM events WHERE segment=?", (segment_name,))
            self._db.execute("DELETE FROM pending_deletions WHERE segment=?", (segment_name,))
        self._db.commit()

    @staticmethod
    def _process_start_ticks(pid: int) -> int | None:
        try:
            # Field 22 follows a parenthesized command that may contain spaces.
            fields = Path(f"/proc/{pid}/stat").read_text("ascii").rsplit(")", 1)[1].split()
            return int(fields[19])
        except (OSError, IndexError, ValueError):
            return None

    def _clear_stale_reservations(self) -> None:
        rows = self._db.execute(
            "SELECT reservation_id,owner_pid,owner_start_ticks,owner_boot_id FROM reservations"
        ).fetchall()
        current_boot = self._boot_id()
        for reservation_id, pid, start_ticks, boot_id in rows:
            if (
                pid is None or start_ticks is None
                or self._process_start_ticks(int(pid)) != int(start_ticks)
                or (current_boot is not None and boot_id != current_boot)
            ):
                self._db.execute("DELETE FROM reservations WHERE reservation_id=?", (reservation_id,))
        self._db.commit()

    @staticmethod
    def _boot_id() -> str | None:
        try:
            return Path("/proc/sys/kernel/random/boot_id").read_text("ascii").strip()
        except OSError:
            return None

    def _recover_segments(self) -> None:
        """Re-index complete durable records left by a crash before DB commit."""
        recovered = 0
        for path in sorted(self.segments.glob("*.jsonl")):
            if path.is_symlink() or not path.is_file():
                self._fault("corruption", {"segment": path.name, "reason": "unsafe segment"})
                continue
            row = self._db.execute(
                "SELECT max(offset + length) FROM events WHERE segment=?", (path.name,)
            ).fetchone()
            offset = int(row[0] or 0)
            with path.open("rb") as handle:
                handle.seek(offset)
                for line in handle:
                    length = len(line)
                    if not line.endswith(b"\n"):
                        self._fault(
                            "corruption", {"segment": path.name, "offset": offset, "reason": "partial tail truncated"}
                        )
                        with path.open("r+b") as repair:
                            repair.truncate(offset)
                            repair.flush()
                            os.fsync(repair.fileno())
                        break
                    digest = hashlib.sha256(line).hexdigest()
                    try:
                        event = json.loads(line)
                        required = {"event_id", "source", "received_at", "monotonic", "metadata", "raw"}
                        if not isinstance(event, dict) or not required.issubset(event):
                            raise ValueError("missing event fields")
                    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
                        self._fault(
                            "corruption",
                            {"segment": path.name, "offset": offset, "reason": type(exc).__name__},
                        )
                        offset += length
                        continue
                    existing = self._db.execute(
                        "SELECT segment,offset,length,digest FROM events WHERE event_id=?", (event["event_id"],)
                    ).fetchone()
                    if existing is None:
                        try:
                            self._db.execute(
                                """INSERT INTO events
                                   (event_id,source,source_id,received_at,source_time,boot_id,monotonic,
                                    metadata_json,segment,offset,length,digest)
                                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                                (
                                    event["event_id"], event["source"], event.get("source_id"),
                                    float(event["received_at"]), event.get("source_time"), event.get("boot_id"),
                                    float(event["monotonic"]), json.dumps(event.get("metadata", {}), sort_keys=True),
                                    path.name, offset, length, digest,
                                ),
                            )
                            recovered += 1
                        except (sqlite3.IntegrityError, TypeError, ValueError):
                            # A source identity already committed under another event ID.
                            # Keep original bytes; do not replace committed evidence.
                            pass
                    elif tuple(existing) != (path.name, offset, length, digest):
                        self._fault(
                            "corruption",
                            {"segment": path.name, "offset": offset, "reason": "duplicate event_id"},
                        )
                    offset += length
        if recovered:
            self._db.commit()

    def _assert_open(self) -> None:
        if self._closed:
            raise StoreError("store is closed")

    @contextmanager
    def _locked(self, exclusive: bool) -> Iterator[None]:
        with self._lock:
            self._assert_open()
            if self._flock_depth == 0:
                fcntl.flock(self._lock_fd, fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
            self._flock_depth += 1
            try:
                yield
            finally:
                self._flock_depth -= 1
                if self._flock_depth == 0:
                    fcntl.flock(self._lock_fd, fcntl.LOCK_UN)

    def _managed_bytes(self) -> int:
        total = 0
        for base, dirs, files in os.walk(self.root, followlinks=False):
            dirs[:] = [d for d in dirs if not (Path(base) / d).is_symlink()]
            for name in files:
                path = Path(base) / name
                if not path.is_symlink():
                    try:
                        total += path.stat().st_size
                    except FileNotFoundError:
                        pass
        return total

    def _reserved_bytes(self) -> int:
        row = self._db.execute("SELECT coalesce(sum(bytes),0) FROM reservations").fetchone()
        return int(row[0])

    def _ensure_capacity(self, proposed_bytes: int, operation: str) -> None:
        """Keep bounded internal write room inside the configured total."""
        proposed_bytes = max(0, int(proposed_bytes))
        managed = self._managed_bytes()
        reserved = self._reserved_bytes()
        free = shutil.disk_usage(self.root).free
        required = proposed_bytes + _INTERNAL_WRITE_HEADROOM
        if managed + reserved + required > self.max_bytes or free - reserved - required < self.min_free_bytes:
            detail = {
                "operation": operation,
                "managed_bytes": managed,
                "reserved_bytes": reserved,
                "proposed_bytes": proposed_bytes,
                "internal_headroom_bytes": _INTERNAL_WRITE_HEADROOM,
                "max_bytes": self.max_bytes,
                "free_bytes": free,
                "min_free_bytes": self.min_free_bytes,
            }
            self._fault("capacity", detail)
            raise CapacityError(f"{operation} would violate evidence capacity limits")

    @contextmanager
    def reserve(self, byte_count: int) -> Iterator[str]:
        """Reserve managed capacity across collector/export processes."""
        byte_count = int(byte_count)
        if byte_count <= 0:
            raise ValueError("reservation must be positive")
        reservation_id = str(uuid.uuid4())
        with self._locked(True):
            self._db.execute("BEGIN IMMEDIATE")
            try:
                self._ensure_capacity(byte_count + _indexed_write_estimate(256), "capacity reservation")
                pid = os.getpid()
                self._db.execute(
                    """INSERT INTO reservations
                       (reservation_id,bytes,created_at,owner_pid,owner_start_ticks,owner_boot_id)
                       VALUES(?,?,?,?,?,?)""",
                    (reservation_id, byte_count, time.time(), pid, self._process_start_ticks(pid), self._boot_id()),
                )
                self._db.commit()
            except Exception:
                self._db.rollback()
                raise
        try:
            yield reservation_id
        finally:
            with self._locked(True):
                if not self._closed:
                    self._db.execute("DELETE FROM reservations WHERE reservation_id=?", (reservation_id,))
                    self._db.commit()

    def write_reserved(self, reservation_id: str, fd: int, data: bytes | bytearray | memoryview) -> int:
        """Materialize reserved export bytes without double-counting capacity."""
        view = memoryview(data)
        size = len(view)
        if size == 0:
            return 0
        with self._locked(True):
            row = self._db.execute(
                "SELECT bytes FROM reservations WHERE reservation_id=?", (reservation_id,)
            ).fetchone()
            if row is None:
                raise CapacityError("export reservation is unavailable")
            remaining = int(row[0])
            if size > remaining:
                raise CapacityError(f"export write exceeds reservation: write={size} remaining={remaining}")
            offset = os.lseek(fd, 0, os.SEEK_CUR)
            written = 0
            try:
                while view:
                    count = os.write(fd, view)
                    if count <= 0:
                        raise StoreError("short reserved export write")
                    written += count
                    view = view[count:]
                self._db.execute(
                    "UPDATE reservations SET bytes=bytes-? WHERE reservation_id=?",
                    (written, reservation_id),
                )
                self._db.commit()
                return written
            except Exception:
                self._db.rollback()
                os.ftruncate(fd, offset)
                os.lseek(fd, offset, os.SEEK_SET)
                raise

    def _fault(self, kind: str, detail: dict[str, Any]) -> None:
        record = _canonical_json({"kind": kind, "at": time.time(), "detail": detail})
        if len(record) + 1 > _FAULT_SLOT_BYTES:
            record = _canonical_json({"kind": kind, "at": time.time(), "detail": {"error": "detail too large"}})
        fd = os.open(self._fault_path, os.O_WRONLY | _NOFOLLOW)
        try:
            os.pwrite(fd, record + b"\n" + b" " * (_FAULT_SLOT_BYTES - len(record) - 1), 0)
            os.fsync(fd)
        finally:
            os.close(fd)

    def _read_fault(self) -> dict[str, Any] | None:
        raw = self._fault_path.read_bytes()
        if not raw.strip(b"\x00 \t\r\n"):
            return None
        data = raw.split(b"\n", 1)[0].strip(b"\x00 \t\r")
        try:
            return json.loads(data)
        except (UnicodeDecodeError, json.JSONDecodeError):
            return {"kind": "corrupt_health_ledger", "detail": {}}

    def _check_clock(self, wall: float, mono: float) -> None:
        wall_delta = wall - self._last_wall
        mono_delta = mono - self._last_mono
        self._last_wall, self._last_mono = wall, mono
        if abs(wall_delta - mono_delta) > 300:
            self.set_checkpoint(
                "expiry_paused",
                {"reason": "wall_clock_step", "detected_at": wall, "wall_delta": wall_delta, "monotonic_delta": mono_delta},
            )

    def append(
        self,
        source: str,
        raw: dict[str, Any] | str,
        source_id: str | None = None,
        source_time: float | None = None,
        boot_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not isinstance(source, str) or not source or len(source) > 128:
            raise ValueError("source must be a non-empty string up to 128 characters")
        if not isinstance(raw, (dict, str)):
            raise TypeError("raw must be a dict or exact string")
        if source_id is not None and (not isinstance(source_id, str) or len(source_id) > 1024):
            raise ValueError("source_id must be a string up to 1024 characters")
        if metadata is not None and not isinstance(metadata, dict):
            raise TypeError("metadata must be a dict")
        with self._locked(True):
            if source_id is not None:
                found = self._db.execute(
                    "SELECT event_id FROM events WHERE source=? AND source_id=?", (source, source_id)
                ).fetchone()
                if found:
                    return self.get_event(found[0])

            received = time.time()
            monotonic = time.monotonic()
            self._check_clock(received, monotonic)
            event_id = str(uuid.uuid4())
            event = {
                "event_id": event_id,
                "source": source,
                "source_id": source_id,
                "received_at": received,
                "source_time": float(source_time) if source_time is not None else None,
                "boot_id": boot_id,
                "metadata": metadata or {},
                "raw": raw,
                "monotonic": monotonic,
            }
            payload = _canonical_json(event) + b"\n"
            indexed_bytes = len(_canonical_json(event["metadata"])) + len(source.encode("utf-8"))
            if source_id is not None:
                indexed_bytes += len(source_id.encode("utf-8"))
            self._ensure_capacity(len(payload) + _indexed_write_estimate(indexed_bytes), "event append")

            segment_name = time.strftime("%Y%m%dT%H.jsonl", time.gmtime(received))
            segment = self.segments / segment_name
            if segment.exists() and segment.is_symlink():
                raise StoreError(f"segment must not be a symlink: {segment_name}")
            fd = os.open(segment, os.O_WRONLY | os.O_CREAT | os.O_APPEND | _NOFOLLOW, 0o600)
            try:
                os.fchmod(fd, 0o600)
                offset = os.lseek(fd, 0, os.SEEK_END)
                written = 0
                try:
                    while written < len(payload):
                        count = os.write(fd, payload[written:])
                        if count <= 0:
                            raise StoreError("short segment write")
                        written += count
                except Exception:
                    os.ftruncate(fd, offset)
                    os.fsync(fd)
                    raise
                os.fsync(fd)
            finally:
                os.close(fd)
            digest = hashlib.sha256(payload).hexdigest()
            try:
                self._db.execute(
                    """INSERT INTO events
                       (event_id,source,source_id,received_at,source_time,boot_id,monotonic,
                        metadata_json,segment,offset,length,digest)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        event_id, source, source_id, received, event["source_time"], boot_id, monotonic,
                        json.dumps(event["metadata"], sort_keys=True), segment_name, offset, len(payload), digest,
                    ),
                )
                self._db.commit()
            except sqlite3.IntegrityError:
                self._db.rollback()
                if source_id is None:
                    raise
                found = self._db.execute(
                    "SELECT event_id FROM events WHERE source=? AND source_id=?", (source, source_id)
                ).fetchone()
                if not found:
                    raise
                return self.get_event(found[0])
            return event

    def _read_row(self, row: sqlite3.Row | tuple[Any, ...]) -> dict[str, Any]:
        segment_name, offset, length, digest = row[-4:]
        path = self.segments / segment_name
        if path.is_symlink():
            raise CorruptEventError(f"segment replaced by symlink: {segment_name}")
        try:
            with path.open("rb") as handle:
                handle.seek(offset)
                payload = handle.read(length)
        except OSError as exc:
            raise CorruptEventError(f"cannot read segment {segment_name}: {exc}") from exc
        if len(payload) != length or hashlib.sha256(payload).hexdigest() != digest:
            raise CorruptEventError(f"event data failed integrity check in {segment_name} at {offset}")
        try:
            return json.loads(payload)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise CorruptEventError(f"event data is invalid JSON in {segment_name} at {offset}") from exc

    def get_event(self, event_id: str) -> dict[str, Any]:
        with self._locked(False):
            row = self._db.execute(
                "SELECT segment,offset,length,digest FROM events WHERE event_id=?", (event_id,)
            ).fetchone()
            if row is None:
                raise KeyError(event_id)
            return self._read_row(row)

    @contextmanager
    def read_snapshot(
        self, since: float | None = None, until: float | None = None,
    ) -> Iterator[Callable[[], Iterator[dict[str, Any]]]]:
        """Repeatable streaming reads without blocking appends or extending segment retention."""
        with self._locked(False):
            clauses, args = [], []
            if since is not None:
                clauses.append("received_at>=?")
                args.append(float(since))
            if until is not None:
                clauses.append("received_at<=?")
                args.append(float(until))
            where = " WHERE " + " AND ".join(clauses) if clauses else ""
            query = (
                "SELECT segment,offset,length,digest FROM events" + where
                + " ORDER BY coalesce(source_time,received_at),event_id"
            )

        snapshot = sqlite3.connect(f"file:{self._db_path}?mode=ro", uri=True, timeout=30)
        try:
            snapshot.execute("BEGIN")
            # Pin the WAL view now, including an empty corpus, before yielding the factory.
            snapshot.execute("SELECT event_id FROM events LIMIT 1").fetchone()

            def generate() -> Iterator[dict[str, Any]]:
                cursor = snapshot.execute(query, args)
                try:
                    for row in cursor:
                        with self._locked(False):
                            event = self._read_row(row)
                        yield event
                finally:
                    cursor.close()

            yield generate
        finally:
            snapshot.close()

    def read_events(self, since: float | None = None, until: float | None = None) -> Iterator[dict[str, Any]]:
        def generate() -> Iterator[dict[str, Any]]:
            with self.read_snapshot(since, until) as read:
                yield from read()
        return generate()

    def get_checkpoint(self, name: str, default: Any = None) -> Any:
        with self._locked(False):
            row = self._db.execute("SELECT value_json FROM checkpoints WHERE name=?", (name,)).fetchone()
            return default if row is None else json.loads(row[0])

    def set_checkpoint(self, name: str, value: Any) -> None:
        if not name or len(name) > 256:
            raise ValueError("checkpoint name must be 1-256 characters")
        encoded = json.dumps(value, ensure_ascii=False, sort_keys=True)
        with self._locked(True):
            self._ensure_capacity(_indexed_write_estimate(len(encoded.encode("utf-8"))), "checkpoint update")
            self._db.execute(
                """INSERT INTO checkpoints(name,value_json,updated_at) VALUES(?,?,?)
                   ON CONFLICT(name) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at""",
                (name, encoded, time.time()),
            )
            self._db.commit()

    def health(self, source: str, state: str, detail: Any) -> dict[str, Any]:
        event = self.append(
            "health",
            {"source": source, "state": state, "detail": detail},
            metadata={"health_source": source, "health_state": state},
        )
        with self._locked(True):
            detail_json = json.dumps(detail, ensure_ascii=False, sort_keys=True)
            indexed_bytes = len(detail_json.encode("utf-8")) + len(source.encode("utf-8")) + len(state.encode("utf-8"))
            self._ensure_capacity(_indexed_write_estimate(indexed_bytes), "health index update")
            self._db.execute(
                """INSERT INTO source_health(source,state,detail_json,received_at,event_id) VALUES(?,?,?,?,?)
                   ON CONFLICT(source) DO UPDATE SET state=excluded.state,detail_json=excluded.detail_json,
                   received_at=excluded.received_at,event_id=excluded.event_id""",
                (source, state, detail_json, event["received_at"], event["event_id"]),
            )
            self._db.commit()
        return event

    def resume_expiry(self, reason: str) -> dict[str, Any]:
        """Record operator verification and resume age-based deletion."""
        if not isinstance(reason, str) or not reason.strip():
            raise ValueError("a non-empty verification reason is required")
        with self._locked(True):
            self._last_wall, self._last_mono = time.time(), time.monotonic()
            event = self.health("store", "clock_verified", reason[:512])
            self.set_checkpoint("expiry_paused", None)
            return event

    def status(self) -> dict[str, Any]:
        with self._locked(False):
            count, earliest, latest = self._db.execute(
                "SELECT count(*),min(received_at),max(received_at) FROM events"
            ).fetchone()
            managed = self._managed_bytes()
            reserved = self._reserved_bytes()
            health_rows = self._db.execute(
                "SELECT source,state,detail_json,received_at,event_id FROM source_health ORDER BY source"
            ).fetchall()
            source_health = {
                source: {"state": state, "detail": json.loads(detail), "received_at": received, "event_id": event_id}
                for source, state, detail, received, event_id in health_rows
            }
            ratio = (managed + reserved) / self.max_bytes
            free_bytes = shutil.disk_usage(self.root).free
            fault = self._read_fault()
            capacity_state = (
                "critical" if ratio >= 0.85 or free_bytes <= self.min_free_bytes or (fault or {}).get("kind") == "capacity"
                else "warning" if ratio >= 0.70 else "ok"
            )
            latest_age = None if latest is None else max(0.0, time.time() - latest)
            heartbeat = self._db.execute(
                "SELECT max(received_at) FROM events WHERE source IN ('probe','collector')"
            ).fetchone()[0]
            return {
                "root": str(self.root),
                "event_count": count,
                "earliest_received_at": earliest,
                "latest_received_at": latest,
                "managed_bytes": managed,
                "reserved_bytes": reserved,
                "max_bytes": self.max_bytes,
                "free_bytes": free_bytes,
                "min_free_bytes": self.min_free_bytes,
                "retention_seconds": self.retention_seconds,
                "expiry_paused": self.get_checkpoint("expiry_paused"),
                "persistent_fault": fault,
                "capacity_state": capacity_state,
                "capacity_ratio": ratio,
                "latest_event_age_seconds": latest_age,
                "collector_heartbeat_age_seconds": None if heartbeat is None else max(0.0, time.time() - heartbeat),
                "source_health": source_health,
            }

    def expire(self, now: float | None = None) -> dict[str, Any]:
        with self._locked(True):
            wall, mono = (time.time() if now is None else float(now)), time.monotonic()
            if now is None:
                self._check_clock(wall, mono)
            paused = self.get_checkpoint("expiry_paused")
            if paused:
                return {"paused": True, "reason": paused, "segments": 0, "events": 0, "bytes": 0}
            cutoff = wall - self.retention_seconds
            candidates = self._db.execute(
                """SELECT segment,count(*),max(received_at) FROM events
                   GROUP BY segment HAVING max(received_at) < ?""", (cutoff,)
            ).fetchall()
            deleted_segments = deleted_events = deleted_bytes = 0
            for segment_name, event_count, _ in candidates:
                path = self.segments / segment_name
                if path.is_symlink():
                    self._fault("corruption", {"segment": segment_name, "reason": "symlink"})
                    continue
                try:
                    size = path.stat().st_size
                except FileNotFoundError:
                    size = 0
                self._db.execute(
                    "INSERT OR IGNORE INTO pending_deletions(segment,marked_at) VALUES(?,?)",
                    (segment_name, wall),
                )
                self._db.commit()
                try:
                    path.unlink()
                except FileNotFoundError:
                    pass
                self._db.execute("DELETE FROM events WHERE segment=?", (segment_name,))
                self._db.execute("DELETE FROM pending_deletions WHERE segment=?", (segment_name,))
                self._db.commit()
                deleted_segments += 1
                deleted_events += event_count
                deleted_bytes += size
            if deleted_segments:
                self._db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            expired_exports = 0
            exports = self.root / "exports"
            if exports.is_dir() and not exports.is_symlink():
                for bundle in exports.iterdir():
                    if bundle.is_symlink() or not bundle.is_dir():
                        continue
                    expiry = bundle / "expiry.json"
                    try:
                        expires_at = float(json.loads(expiry.read_text("utf-8"))["expires_at"])
                    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
                        continue
                    if expires_at < wall:
                        shutil.rmtree(bundle)
                        expired_exports += 1
            return {
                "paused": False,
                "cutoff": cutoff,
                "segments": deleted_segments,
                "events": deleted_events,
                "bytes": deleted_bytes,
                "exports": expired_exports,
            }

    def close(self) -> None:
        with self._lock:
            if not self._closed:
                self._db.commit()
                self._db.close()
                os.close(self._lock_fd)
                self._closed = True

    def __enter__(self) -> "Store":
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self.close()
