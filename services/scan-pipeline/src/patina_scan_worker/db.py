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

    # ── solve-stage writes (item 10) ──────────────────────────────────────────
    def _delete(self, path: str) -> None:
        try:
            resp = self._s.delete(
                f"/rest/v1/{path}", headers={"Prefer": "return=minimal"}
            )
        except httpx.HTTPError as exc:
            raise TransientError(f"DELETE {path}: {exc}") from exc
        if resp.status_code >= 500:
            raise TransientError(f"DELETE {path} -> {resp.status_code}")
        if resp.status_code >= 400:
            raise RuntimeError(f"DELETE {path} -> {resp.status_code}: {resp.text[:300]}")

    def get_room_file(self, room_file_id: str) -> dict[str, Any]:
        rows = self._get("room_files?id=eq.{}&select=*".format(room_file_id))
        if not rows:
            raise PermanentError(f"room_files row not found: {room_file_id}")
        return rows[0]

    def upsert_anchors(self, scan_id: str, anchor_rows: list[dict[str, Any]]) -> dict[str, str]:
        """Upsert scan_anchors on (scan_id, client_anchor_id) and return a
        {client_anchor_id: id} map. Idempotent: mirrors the device owner-write
        (bundle spec §8) so a verified measurement can FK a real anchor row."""
        if not anchor_rows:
            return {}
        created = self._post(
            "scan_anchors?on_conflict=scan_id,client_anchor_id",
            anchor_rows,
            prefer="resolution=merge-duplicates,return=representation",
        )
        out: dict[str, str] = {}
        for r in created or []:
            cid = r.get("client_anchor_id")
            if isinstance(cid, str):
                out[cid] = r["id"]
        # merge-duplicates may omit unchanged rows; backfill via a read.
        missing = {r["client_anchor_id"] for r in anchor_rows} - set(out)
        if missing:
            existing = self._get(
                "scan_anchors?scan_id=eq.{}&select=id,client_anchor_id".format(scan_id)
            )
            for r in existing or []:
                cid = r.get("client_anchor_id")
                if isinstance(cid, str):
                    out[cid] = r["id"]
        return out

    def replace_measurements(
        self, room_file_id: str, rows: list[dict[str, Any]]
    ) -> None:
        """Delete-then-insert the measurement set for a room_file (idempotent
        re-run: room_file_measurements has no natural unique key, so a re-solve
        must clear its own prior rows before writing)."""
        self._delete("room_file_measurements?room_file_id=eq.{}".format(room_file_id))
        if rows:
            self._post(
                "room_file_measurements", rows, prefer="return=minimal"
            )

    def finalize_room_file_solved(
        self,
        room_file_id: str,
        certificate: dict[str, Any],
        unverified: bool,
        tolerance_class: str,
        anchor_count: int,
    ) -> bool:
        """Forward-only (F1): the PATCH is scoped to status in (pending, solved),
        so a replayed solve can NEVER regress a room_file the drawings stage
        already advanced to 'generated'. Returns True if it wrote, False if the
        guard skipped (the caller logs the skip)."""
        updated = self._patch(
            "room_files?id=eq.{}&status=in.(pending,solved)".format(room_file_id),
            {
                "certificate": certificate,
                "unverified": unverified,
                "tolerance_class": tolerance_class,
                "anchor_count": anchor_count,
                "status": "solved",
                "generation_error": None,
            },
            prefer="return=representation",
        )
        return bool(updated)
