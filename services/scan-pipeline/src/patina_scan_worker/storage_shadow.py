"""Dual-write shadow mode for the storage cutover (DELIVERY-PLAN R6: shadow or
canary with positive match evidence before any cutover).

``ShadowStorageBackend`` wraps a primary ``StorageBackend`` and, when enabled
(``SCAN_STORAGE_SHADOW=r2``), mirrors every UPLOAD to a second ("shadow")
backend, then records a ``{key, sha256, matched}`` verdict for the write.
Reads never shadow — downloads stay primary-only, per DELIVERY-PLAN W3's scope
("Does not... touch scan originals or the iOS upload path" ahead of the
dedicated cutover; a read against a not-yet-promoted shadow object would just
404).

A shadow-leg failure — the mirror upload itself, or the readback verification
that decides ``matched`` — is logged and counted, and NEVER raised: the whole
point of a shadow leg is that it can never be allowed to take down the primary
operation it is validating.

The ledger is JSONL to a configurable path today. The plan's actual cutover
also promotes matched writes through an RPC (R2: "Completion and progress are
written over direct Postgres by a new scan-worker-scoped role pair"); a
``record_hook`` seam is wired here for that so this module's shape doesn't
change when it lands — but this module does NOT invent a schema for it. It
stays an inert callable, given the same dict the ledger receives, until the
cutover wave supplies the real one.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable

log = logging.getLogger("patina_scan_worker.storage_shadow")

#: One row this module ever writes to the ledger / hands to ``record_hook``:
#: ``{"ts": float, "key": str, "sha256": str, "matched": bool, "error"?: str}``.
ShadowRecord = dict[str, Any]


class ShadowLedger:
    """Append-only JSONL sink for shadow-write verdicts.

    One lock per instance: shadow writes are infrequent relative to the
    worker's actual I/O, so serializing them is not a throughput concern, and
    it keeps concurrent appends from interleaving partial lines.
    """

    def __init__(self, path: str) -> None:
        self._path = path
        self._lock = threading.Lock()

    @property
    def path(self) -> str:
        return self._path

    def record(self, entry: ShadowRecord) -> None:
        line = json.dumps(entry, sort_keys=True)
        directory = os.path.dirname(self._path)
        with self._lock:
            if directory:
                os.makedirs(directory, exist_ok=True)
            with open(self._path, "a", encoding="utf-8") as handle:
                handle.write(line + "\n")


@dataclass
class ShadowStorageBackend:
    """Dual-writes uploads to ``shadow`` after ``primary`` succeeds.

    ``primary`` is the only backend on the read path and the only one whose
    failure can fail a caller; ``shadow`` and ``ledger`` are best-effort
    observers reachable only from ``upload``. Untyped as ``Any`` rather than
    ``StorageBackend`` to avoid importing storage_backend.py here — this
    module only needs the ``download``/``upload`` methods structurally, and
    staying import-free of that module keeps the dependency direction the
    factory (storage_backend.build_storage_backend) already establishes from
    growing a cycle.
    """

    primary: Any
    shadow: Any
    ledger: ShadowLedger
    record_hook: Callable[[ShadowRecord], None] | None = None
    shadow_successes: int = field(default=0, init=False)
    shadow_failures: int = field(default=0, init=False)

    def download(self, key: str) -> bytes:
        return self.primary.download(key)

    def download_to(self, key: str, dest_path: str) -> int:
        return self.primary.download_to(key, dest_path)

    def exists(self, key: str) -> bool:
        return self.primary.exists(key)

    def upload(self, key: str, data: bytes, content_type: str) -> None:
        # Primary first, unguarded: its exception must propagate exactly as it
        # would with no shadow configured at all. Only once it has succeeded
        # does the shadow leg run, and nothing past this point may raise.
        self.primary.upload(key, data, content_type)
        self._shadow_write(key, data, content_type)

    def _shadow_write(self, key: str, data: bytes, content_type: str) -> None:
        expected_sha256 = hashlib.sha256(data).hexdigest()
        matched = False
        error: str | None = None
        try:
            self.shadow.upload(key, data, content_type)
            readback = self.shadow.download(key)
            matched = hashlib.sha256(readback).hexdigest() == expected_sha256
        except Exception as exc:  # noqa: BLE001 — a shadow leg must never propagate
            error = f"{type(exc).__name__}: {exc}"[:200]
            log.warning("shadow storage write failed key=%s error=%s", key, error)

        entry: ShadowRecord = {
            "ts": time.time(),
            "key": key,
            "sha256": expected_sha256,
            "matched": matched,
        }
        if error is not None:
            entry["error"] = error
        if matched:
            self.shadow_successes += 1
        else:
            self.shadow_failures += 1

        try:
            self.ledger.record(entry)
        except Exception as exc:  # noqa: BLE001 — never fail the primary op
            log.warning(
                "shadow storage ledger write failed key=%s error=%s",
                key,
                f"{type(exc).__name__}: {exc}"[:200],
            )

        if self.record_hook is not None:
            try:
                self.record_hook(entry)
            except Exception as exc:  # noqa: BLE001 — never fail the primary op
                log.warning(
                    "shadow storage record_hook failed key=%s error=%s",
                    key,
                    f"{type(exc).__name__}: {exc}"[:200],
                )
