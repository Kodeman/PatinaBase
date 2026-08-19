"""Dual-write shadow mode (storage_shadow.py): primary success is never put at
risk by the shadow leg, sha256 matching decides `matched`, and the JSONL
ledger + optional record_hook both receive exactly what happened — including
when the shadow leg itself fails.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import pytest

from patina_scan_worker.storage_shadow import ShadowLedger, ShadowStorageBackend


class _FakeBackend:
    """download/download_to/exists/upload over an in-memory dict — enough to
    stand in for either the primary or the shadow leg."""

    def __init__(self):
        self.store: dict[str, bytes] = {}
        self.upload_calls: list[tuple[str, bytes, str]] = []
        self.download_calls: list[str] = []
        self.exists_calls: list[str] = []
        self.upload_error: Exception | None = None
        self.download_error: Exception | None = None
        #: When set, `download` returns this instead of the stored bytes —
        #: models a shadow write whose readback disagrees with what was sent.
        self.readback_override: bytes | None = None

    def download(self, key: str) -> bytes:
        self.download_calls.append(key)
        if self.download_error is not None:
            raise self.download_error
        if self.readback_override is not None:
            return self.readback_override
        return self.store[key]

    def download_to(self, key: str, dest_path: str) -> int:
        data = self.download(key)
        with open(dest_path, "wb") as handle:
            handle.write(data)
        return len(data)

    def exists(self, key: str) -> bool:
        self.exists_calls.append(key)
        return key in self.store

    def upload(self, key: str, data: bytes, content_type: str) -> None:
        self.upload_calls.append((key, data, content_type))
        if self.upload_error is not None:
            raise self.upload_error
        self.store[key] = data


def _ledger_entries(path: str) -> list[dict[str, Any]]:
    text = Path(path).read_text(encoding="utf-8")
    return [json.loads(line) for line in text.splitlines() if line]


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ── ShadowLedger ──────────────────────────────────────────────────────────


def test_ledger_appends_one_jsonl_line_per_record(tmp_path):
    ledger = ShadowLedger(str(tmp_path / "shadow.jsonl"))
    ledger.record({"key": "a", "sha256": "x", "matched": True})
    ledger.record({"key": "b", "sha256": "y", "matched": False})
    entries = _ledger_entries(ledger.path)
    assert [e["key"] for e in entries] == ["a", "b"]


def test_ledger_creates_missing_parent_directory(tmp_path):
    ledger = ShadowLedger(str(tmp_path / "nested" / "dir" / "shadow.jsonl"))
    ledger.record({"key": "a", "sha256": "x", "matched": True})
    assert Path(ledger.path).exists()


# ── ShadowStorageBackend: reads always primary-only ─────────────────────────


def test_download_and_exists_never_touch_the_shadow_backend(tmp_path):
    primary = _FakeBackend()
    primary.store["k"] = b"payload"
    shadow = _FakeBackend()
    backend = ShadowStorageBackend(
        primary=primary,
        shadow=shadow,
        ledger=ShadowLedger(str(tmp_path / "shadow.jsonl")),
    )

    assert backend.download("k") == b"payload"
    assert backend.exists("k") is True
    dest = tmp_path / "out.bin"
    assert backend.download_to("k", str(dest)) == len(b"payload")

    assert shadow.download_calls == []
    assert shadow.exists_calls == []
    assert shadow.upload_calls == []


# ── upload: primary success + shadow success ────────────────────────────────


def test_upload_mirrors_to_shadow_and_records_a_positive_match(tmp_path):
    primary = _FakeBackend()
    shadow = _FakeBackend()
    ledger_path = str(tmp_path / "shadow.jsonl")
    hooked: list[dict[str, Any]] = []
    backend = ShadowStorageBackend(
        primary=primary,
        shadow=shadow,
        ledger=ShadowLedger(ledger_path),
        record_hook=hooked.append,
    )

    backend.upload("room_file/u/s/v1/plan.svg", b"svg-bytes", "image/svg+xml")

    assert primary.store["room_file/u/s/v1/plan.svg"] == b"svg-bytes"
    assert shadow.store["room_file/u/s/v1/plan.svg"] == b"svg-bytes"
    assert shadow.upload_calls == [
        ("room_file/u/s/v1/plan.svg", b"svg-bytes", "image/svg+xml")
    ]

    entries = _ledger_entries(ledger_path)
    assert len(entries) == 1
    assert entries[0]["key"] == "room_file/u/s/v1/plan.svg"
    assert entries[0]["sha256"] == _sha(b"svg-bytes")
    assert entries[0]["matched"] is True
    assert "error" not in entries[0]
    assert isinstance(entries[0]["ts"], (int, float))

    assert hooked == entries
    assert backend.shadow_successes == 1
    assert backend.shadow_failures == 0


# ── upload: primary success, shadow write fails — isolation ────────────────


def test_shadow_upload_failure_never_raises_and_never_touches_primary_result(tmp_path):
    primary = _FakeBackend()
    shadow = _FakeBackend()
    shadow.upload_error = RuntimeError("shadow endpoint unreachable")
    ledger_path = str(tmp_path / "shadow.jsonl")
    backend = ShadowStorageBackend(
        primary=primary, shadow=shadow, ledger=ShadowLedger(ledger_path)
    )

    # Must not raise.
    backend.upload("k", b"data", "application/octet-stream")

    assert primary.store["k"] == b"data"  # the primary write is unaffected
    entries = _ledger_entries(ledger_path)
    assert entries[0]["matched"] is False
    assert "shadow endpoint unreachable" in entries[0]["error"]
    assert backend.shadow_failures == 1
    assert backend.shadow_successes == 0


def test_shadow_readback_failure_is_isolated_the_same_way(tmp_path):
    primary = _FakeBackend()
    shadow = _FakeBackend()
    shadow.download_error = RuntimeError("readback GET failed")
    ledger_path = str(tmp_path / "shadow.jsonl")
    backend = ShadowStorageBackend(
        primary=primary, shadow=shadow, ledger=ShadowLedger(ledger_path)
    )

    backend.upload("k", b"data", "application/octet-stream")

    assert primary.store["k"] == b"data"
    assert shadow.store["k"] == b"data"  # the shadow PUT itself did succeed
    entries = _ledger_entries(ledger_path)
    assert entries[0]["matched"] is False
    assert "readback GET failed" in entries[0]["error"]


# ── upload: primary failure — shadow never runs ─────────────────────────────


def test_primary_upload_failure_propagates_and_shadow_never_runs(tmp_path):
    primary = _FakeBackend()
    primary.upload_error = RuntimeError("primary is down")
    shadow = _FakeBackend()
    ledger_path = str(tmp_path / "shadow.jsonl")
    backend = ShadowStorageBackend(
        primary=primary, shadow=shadow, ledger=ShadowLedger(ledger_path)
    )

    with pytest.raises(RuntimeError, match="primary is down"):
        backend.upload("k", b"data", "application/octet-stream")

    assert shadow.upload_calls == []
    assert not Path(ledger_path).exists()


# ── sha256 matching: a verified mismatch is not an error ───────────────────


def test_shadow_content_mismatch_is_recorded_as_unmatched_without_an_error(tmp_path):
    primary = _FakeBackend()
    shadow = _FakeBackend()
    shadow.readback_override = b"corrupted-in-transit"
    ledger_path = str(tmp_path / "shadow.jsonl")
    backend = ShadowStorageBackend(
        primary=primary, shadow=shadow, ledger=ShadowLedger(ledger_path)
    )

    backend.upload("k", b"original-bytes", "application/octet-stream")

    entries = _ledger_entries(ledger_path)
    assert entries[0]["sha256"] == _sha(b"original-bytes")
    assert entries[0]["matched"] is False
    # No exception occurred on this path — a positive comparison that failed,
    # not a broken operation — so there is nothing to report as an error.
    assert "error" not in entries[0]
    assert backend.shadow_failures == 1


# ── ledger write failure never propagates either ────────────────────────────


def test_ledger_write_failure_never_raises_and_record_hook_still_runs(tmp_path, monkeypatch):
    primary = _FakeBackend()
    shadow = _FakeBackend()
    ledger = ShadowLedger(str(tmp_path / "shadow.jsonl"))

    def _broken_record(entry):
        raise OSError("disk full")

    monkeypatch.setattr(ledger, "record", _broken_record)
    hooked: list[dict[str, Any]] = []
    backend = ShadowStorageBackend(
        primary=primary, shadow=shadow, ledger=ledger, record_hook=hooked.append
    )

    backend.upload("k", b"data", "application/octet-stream")  # must not raise

    assert hooked and hooked[0]["matched"] is True


# ── record_hook failure never propagates ────────────────────────────────────


def test_record_hook_failure_never_raises_and_ledger_still_written(tmp_path):
    primary = _FakeBackend()
    shadow = _FakeBackend()
    ledger_path = str(tmp_path / "shadow.jsonl")

    def _broken_hook(entry):
        raise RuntimeError("rpc seam not wired yet")

    backend = ShadowStorageBackend(
        primary=primary,
        shadow=shadow,
        ledger=ShadowLedger(ledger_path),
        record_hook=_broken_hook,
    )

    backend.upload("k", b"data", "application/octet-stream")  # must not raise

    entries = _ledger_entries(ledger_path)
    assert entries[0]["matched"] is True


def test_no_record_hook_is_fine(tmp_path):
    primary = _FakeBackend()
    shadow = _FakeBackend()
    backend = ShadowStorageBackend(
        primary=primary,
        shadow=shadow,
        ledger=ShadowLedger(str(tmp_path / "shadow.jsonl")),
    )
    backend.upload("k", b"data", "application/octet-stream")  # must not raise


# ── multiple uploads accumulate counters and ledger lines ───────────────────


def test_multiple_uploads_accumulate_counters_and_ledger_lines(tmp_path):
    primary = _FakeBackend()
    shadow = _FakeBackend()
    shadow.upload_error = RuntimeError("down")
    ledger_path = str(tmp_path / "shadow.jsonl")
    backend = ShadowStorageBackend(
        primary=primary, shadow=shadow, ledger=ShadowLedger(ledger_path)
    )

    backend.upload("a", b"1", "text/plain")
    shadow.upload_error = None
    backend.upload("b", b"2", "text/plain")

    assert backend.shadow_failures == 1
    assert backend.shadow_successes == 1
    assert len(_ledger_entries(ledger_path)) == 2
