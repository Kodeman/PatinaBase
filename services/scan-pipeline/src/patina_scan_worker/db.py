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
            # 23505 unique_violation (D3): a concurrent solve raced us on the
            # UNIQUE(room_file_id, element_ref) guard. Benign — treat as transient
            # so it logs as a quiet retry, not an "unexpected error".
            if resp.status_code == 409 and '"23505"' in resp.text:
                raise TransientError(f"POST {path} -> 23505 unique_violation (concurrent race)")
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

    def get_measurements(self, room_file_id: str) -> list[dict[str, Any]]:
        return self._get(
            "room_file_measurements?room_file_id=eq.{}"
            "&select=label,element_ref,value_mm,tolerance_mm,tolerance_class,source"
            "&order=id".format(room_file_id)
        ) or []

    def finalize_room_file_generated(
        self, room_file_id: str, svg_url: str, pdf_url: str, dxf_url: str,
        drawings: dict[str, Any],
    ) -> bool:
        """Forward-only (item 11): scoped to status in (solved, generated) so a
        replayed drawings run is idempotent and never regresses. Returns True if
        it wrote, False if the guard skipped (room_file not yet 'solved')."""
        updated = self._patch(
            "room_files?id=eq.{}&status=in.(solved,generated)".format(room_file_id),
            {
                "svg_url": svg_url, "pdf_url": pdf_url, "dxf_url": dxf_url,
                "drawings": drawings, "status": "generated",
                "generated_at": "now()", "generation_error": None,
            },
            prefer="return=representation",
        )
        return bool(updated)

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
        re-run). UNIQUE(room_file_id, element_ref) (00341 F3) now guards against
        doubled rows: this delete clears the prior set first, and a CONCURRENT
        second solve that races the insert hits 23505 → TransientError (a quiet
        retry via _post), never a silent double-write."""
        self._delete("room_file_measurements?room_file_id=eq.{}".format(room_file_id))
        if rows:
            self._post(
                "room_file_measurements", rows, prefer="return=minimal"
            )

    # ── Present-Layer record (00376/00377) ────────────────────────────────────
    def record_room_file_refine(
        self,
        room_file_id: str,
        *,
        scan_id: str,
        version: int,
        present_patch: dict[str, Any],
        present_status: str,
        allowed_present_status: tuple[str, ...],
        record_observation_fields: tuple[str, ...] = (),
    ) -> str:
        """Merge one Refine delivery record into ``room_files.present``.

        Returns ``'written'``, ``'replayed'`` (an identical record is already
        there and nothing was written) or ``'skipped'`` (the forward-only guard
        declined, because the version has already moved past the Present states
        Refine may advance).

        THREE DISCIPLINES, EACH BORROWED FROM WORKING CODE IN THIS FILE.

        1. A DIVERGENT EXISTING RECORD REFUSES RATHER THAN OVERWRITING.  The
           eleven artifacts it points at are create-only and immutable; a row
           that could be silently rewritten to point somewhere else would be the
           one mutable thing in an immutable chain.  An IDENTICAL record writes
           nothing at all, so a replay leaves the row byte-for-byte as the first
           delivery left it.
        2. THE PATCH IS FORWARD-ONLY via a PostgREST filter, the same idiom as
           ``finalize_room_file_generated``: the update is scoped to
           ``present_status IS NULL`` or one of ``allowed_present_status``, so a
           replay can never regress a version that Fuse or Splat has advanced.
        3. READ-MODIFY-WRITE, WITH ITS LIMIT NAMED.  PostgREST cannot merge a
           jsonb object server-side, so this reads ``present``, merges, and
           PATCHes the whole column.  That is safe TODAY only because Refine is
           the sole writer of ``present``; the moment a second Present-layer
           stage writes it, this needs a server-side merge RPC
           (``jsonb_set``/``||`` inside a SECURITY DEFINER function) or two
           writers will clobber each other's keys.  Flagged here rather than
           pre-built, because building the RPC now would be a production
           migration for a second writer that does not exist.
        """

        rows = self._get(
            "room_files?id=eq.{}&select=id,scan_id,version,present,present_status".format(
                room_file_id
            )
        )
        if not rows:
            raise PermanentError(f"room_files row not found: {room_file_id}")
        row = rows[0]
        if str(row.get("scan_id")) != str(scan_id) or int(row.get("version")) != int(
            version
        ):
            raise PermanentError(
                "room_files row {} is (scan {}, v{}), the delivery names "
                "(scan {}, v{})".format(
                    room_file_id,
                    row.get("scan_id"),
                    row.get("version"),
                    scan_id,
                    version,
                ),
                token="REFINE_DELIVERY_IDENTITY",
            )
        existing = row.get("present")
        if not isinstance(existing, dict):
            existing = {}
        incoming_record = present_patch.get("refine")
        existing_record = existing.get("refine")
        if existing_record is not None:
            # ``record_observation_fields`` names the parts of a record that are
            # observations of ONE delivery (which keys this run created and
            # which it replayed) rather than properties of the artifact set.
            # They are excluded from the comparison, and because an identical
            # replay writes nothing at all, the row keeps the FIRST delivery's
            # observation instead of being rewritten with the latest.  The list
            # is a PARAMETER so this method stays free of the record's
            # semantics; ``refine_delivery`` owns the shape and names the
            # exceptions.
            def _core(value: Any) -> Any:
                if not isinstance(value, dict):
                    return value
                return {
                    key: inner
                    for key, inner in value.items()
                    if key not in record_observation_fields
                }

            if _core(existing_record) != _core(incoming_record):
                raise PermanentError(
                    "room_files.present already carries a DIFFERENT refine "
                    "delivery record for {}; immutable artifacts do not get a "
                    "mutable row".format(room_file_id),
                    token="REFINE_DELIVERY_RECORD_CONFLICT",
                )
            return "replayed"

        merged = dict(existing)
        merged.update(present_patch)
        updated = self._patch(
            "room_files?id=eq.{}&or=(present_status.is.null,present_status.in.({}))".format(
                room_file_id, ",".join(allowed_present_status)
            ),
            {"present": merged, "present_status": present_status},
            prefer="return=representation",
        )
        return "written" if updated else "skipped"

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
