"""PostgREST table access (service-role) for the tables the worker reads and
writes directly — as opposed to queue.py (RPCs) and telemetry.py (events).

  * room_scans   — read the bundle row (URL columns + artifacts_sha256 + user_id
                   + scan_schema_version).
  * room_files   — reserve/return the pending deliverable row for a version
                   (design §2.2: append-only, UNIQUE(scan_id, version)); mark it
                   'error' on a fatal ingest failure.

All writes go through the service-role key, which bypasses RLS (room_files is
server-generated: delegated read, service-role write only — 00341).
"""

from __future__ import annotations

from typing import Any

import httpx

from .config import Settings
from .errors import PermanentError, TransientError


class DbClient:
    def __init__(self, session: httpx.Client, settings: Settings):
        self._s = session
        self._cfg = settings

    def _get(self, path: str) -> Any:
        try:
            resp = self._s.get(f"/rest/v1/{path}")
        except httpx.HTTPError as exc:
            raise TransientError(f"GET {path}: {exc}") from exc
        if resp.status_code >= 500:
            raise TransientError(f"GET {path} -> {resp.status_code}")
        if resp.status_code >= 400:
            raise RuntimeError(f"GET {path} -> {resp.status_code}: {resp.text[:300]}")
        return resp.json()

    def _post(self, path: str, body: Any, prefer: str) -> Any:
        try:
            resp = self._s.post(
                f"/rest/v1/{path}", json=body, headers={"Prefer": prefer}
            )
        except httpx.HTTPError as exc:
            raise TransientError(f"POST {path}: {exc}") from exc
        if resp.status_code >= 500:
            raise TransientError(f"POST {path} -> {resp.status_code}")
        if resp.status_code >= 400:
            raise RuntimeError(f"POST {path} -> {resp.status_code}: {resp.text[:300]}")
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    def _patch(self, path: str, body: Any, prefer: str = "return=representation") -> Any:
        try:
            resp = self._s.patch(
                f"/rest/v1/{path}", json=body, headers={"Prefer": prefer}
            )
        except httpx.HTTPError as exc:
            raise TransientError(f"PATCH {path}: {exc}") from exc
        if resp.status_code >= 500:
            raise TransientError(f"PATCH {path} -> {resp.status_code}")
        if resp.status_code >= 400:
            raise RuntimeError(f"PATCH {path} -> {resp.status_code}: {resp.text[:300]}")
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    # ── room_scans ────────────────────────────────────────────────────────────
    def get_room_scan(self, scan_id: str) -> dict[str, Any]:
        rows = self._get(
            "room_scans?id=eq.{}&select=*".format(scan_id)
        )
        if not rows:
            raise PermanentError(f"room_scans row not found: {scan_id}")
        return rows[0]

    # ── room_files (append-only versioned deliverable) ─────────────────────────
    def reserve_room_file(self, scan_id: str, version: int) -> dict[str, Any]:
        """Return the pending room_files row for (scan_id, version), creating it
        if absent. On a re-run of a previously-errored version, reset it to
        'pending' (idempotent). Never clobbers a row already 'generated'."""
        created = self._post(
            "room_files?on_conflict=scan_id,version",
            {"scan_id": scan_id, "version": version, "status": "pending"},
            prefer="resolution=ignore-duplicates,return=representation",
        )
        if created:
            return created[0]

        existing = self._get(
            "room_files?scan_id=eq.{}&version=eq.{}&select=*".format(scan_id, version)
        )
        if not existing:
            raise TransientError(
                f"room_files ({scan_id}, v{version}) neither inserted nor found — retry"
            )
        row = existing[0]
        if row.get("status") == "error":
            reset = self._patch(
                "room_files?id=eq.{}".format(row["id"]),
                {"status": "pending", "generation_error": None},
            )
            if reset:
                return reset[0]
        return row

    def mark_room_file_error(self, room_file_id: str, error: str) -> None:
        self._patch(
            "room_files?id=eq.{}".format(room_file_id),
            {"status": "error", "generation_error": error[:2000]},
            prefer="return=minimal",
        )
