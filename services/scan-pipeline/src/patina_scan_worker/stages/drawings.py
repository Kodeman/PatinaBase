"""scan_pipeline.drawings — dimensioned floor plan + four elevations → SVG
(native), PDF (cairosvg), layered DXF (ezdxf), IFC4 (ifcopenshell) per R108.6 +
the W2 IFC lane (`docs/architecture/CAD Generation Pipeline/DELIVERY-PLAN.md`
§3). Terminal stage: no successor (portal delivery is item 12). Design §2.1/§2.3.

Pulls the solved room_file's measurements + certificate + captured_room geometry,
renders the sheet set to WORK_DIR, uploads under room_file/{uid}/{scanId}/v{n}/…,
records the artifact URLs + sha256 on room_files, flips status → 'generated'
(forward-only).

IFC is the ONE optional artifact in an otherwise all-or-nothing stage: it is
new and additive (drawings shipped svg/pdf/dxf long before IFC existed), so a
generation failure there must not take down the core sheet set — the stage
degrades by recording drawings.artifacts[] with kind 'ifc' and status
'skipped' (plus a logged warning + telemetry event) rather than raising.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import logging
import os
import shutil
import time
from typing import Any

from ..drawing import dxf as dxf_mod
from ..drawing import ifc as ifc_mod
from ..drawing import model as drawing_model
from ..drawing import pdf as pdf_mod
from ..drawing import svg as svg_mod
from ..errors import PermanentError, TransientError
from ..keys import (
    OwnershipError,
    artifact_object_key,
    assert_owner_prefix,
    object_key_from_url,
)
from .base import BaseStage, Context, StageOutcome
from .captured_room import parse_captured_room_meters

log = logging.getLogger("patina_scan_worker.stages.drawings")

# room-scans bucket MIME allowlist excludes svg/pdf/dxf/ifc → transport as
# octet-stream.
_OCTET = "application/octet-stream"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class DrawingsStage(BaseStage):
    stage = "drawing"

    def run(self, ctx: Context, task: dict[str, Any]) -> StageOutcome:
        t0 = time.monotonic()
        payload = task.get("payload") or {}
        scan_id = payload.get("scan_id")
        room_file_id = payload.get("room_file_id")
        version = payload.get("room_file_version")
        if not scan_id or not room_file_id or version is None:
            raise PermanentError(
                f"drawings payload missing scan_id/room_file_id/room_file_version: {payload!r}"
            )

        ctx.telemetry.emit(
            scan_id, "drawing", "drawings.started", "started",
            room_file_id=room_file_id, detail={"version": version},
        )
        work = os.path.join(ctx.settings.work_dir, scan_id, f"drawings-v{int(version)}")
        try:
            try:
                summary = self._render(ctx, task, scan_id, room_file_id, int(version), work)
            except (PermanentError, TransientError) as exc:
                ctx.telemetry.emit(
                    scan_id, "drawing", "drawings.failed", "failed",
                    room_file_id=room_file_id,
                    duration_ms=int((time.monotonic() - t0) * 1000),
                    detail={"failure_token": getattr(exc, "token", None),
                            "error": str(exc), "fatal": exc.fatal},
                )
                if exc.fatal:
                    ctx.db.mark_room_file_error(room_file_id, str(exc))
                raise

            ctx.telemetry.emit(
                scan_id, "drawing", "drawings.rendered", "info",
                room_file_id=room_file_id, detail=summary["render"],
            )
            ctx.telemetry.emit(
                scan_id, "delivery", "delivery.published", "succeeded",
                room_file_id=room_file_id,
                duration_ms=int((time.monotonic() - t0) * 1000),
                detail=summary["delivery"],
            )
            return StageOutcome(artifacts={
                "room_file_id": room_file_id,
                "svg_url": summary["delivery"]["svg_url"],
                "pdf_url": summary["delivery"]["pdf_url"],
                "dxf_url": summary["delivery"]["dxf_url"],
                "ifc_url": summary["delivery"].get("ifc_url"),
                "sheets": summary["render"]["sheet_count"],
            })
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def _render(self, ctx, task, scan_id, room_file_id, version, work) -> dict[str, Any]:
        os.makedirs(work, exist_ok=True)
        scan_row = ctx.db.get_room_scan(scan_id)
        room_file = ctx.db.get_room_file(room_file_id)
        if room_file.get("status") not in ("solved", "generated"):
            # solve hasn't committed yet (or errored) — retry; don't render junk.
            raise TransientError(
                f"room_file {room_file_id} is {room_file.get('status')} (need solved)"
            )
        certificate = room_file.get("certificate") or {}
        measurements = ctx.db.get_measurements(room_file_id)

        # captured_room (owner-anchored B-18 key), model-space geometry
        user_id = scan_row.get("user_id")
        room_id = scan_row.get("room_id")
        manifest_url = scan_row.get("bundle_manifest_url")
        manifest_key = object_key_from_url(manifest_url) if isinstance(manifest_url, str) else None
        if not manifest_key:
            raise PermanentError("bundle_manifest_url missing", token="MISSING_MANIFEST")
        try:
            cr_key = artifact_object_key(manifest_key, "captured_room.json", "capturedRoomJson", scan_row)
            assert_owner_prefix(cr_key, user_id, room_id)
        except OwnershipError as exc:
            raise PermanentError(str(exc), token="OWNERSHIP_VIOLATION") from exc
        cr_path = os.path.join(work, "captured_room.json")
        ctx.storage.download_to(cr_key, cr_path)
        with open(cr_path, encoding="utf-8") as fh:
            room = parse_captured_room_meters(json.load(fh))

        # ── build the sheet set + render SVG / PDF / DXF ───────────────────────
        date_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        sheet_set = drawing_model.build_sheet_set(
            room, measurements, certificate,
            project="Patina Field Capture",
            room_name=str(scan_row.get("name") or scan_id[:8]),
            date_str=date_str,
            tolerance_class=room_file.get("tolerance_class") or "estimated",
        )
        svgs = svg_mod.render_set(sheet_set)  # {sheet_id: svg}

        # D2 verdict (evidence: supabase/migrations/00287, "Designers can read
        # shared scan artifacts"): the policy matches segment [2] = room_scans.user_id
        # AND segment [3] = (rs.id::text OR rs.room_id::text). This prefix puts the
        # SCAN id at [3], satisfying the FIRST branch (rs.id::text = [3]) — the same
        # segment the iOS bundle uploader writes — so a designer with an active/full
        # association can read the drawings. scanId at [3] is CORRECT; no room_id
        # prefix needed. (00306/00320 do not override this policy.)
        prefix = f"room_file/{user_id}/{scan_id}/v{version}"
        base = f"{ctx.settings.supabase_url}/storage/v1/object/public/{ctx.settings.room_scans_bucket}"
        sheets_manifest: list[dict[str, Any]] = []
        total_bytes = 0
        for sheet in sheet_set.sheets:
            svg = svgs[sheet.id]
            svg_bytes = svg.encode("utf-8")
            pdf_bytes = pdf_mod.svg_to_pdf(svg)
            svg_key = f"{prefix}/{sheet.id}.svg"
            pdf_key = f"{prefix}/{sheet.id}.pdf"
            ctx.storage.upload_bytes(svg_key, svg_bytes, _OCTET)
            ctx.storage.upload_bytes(pdf_key, pdf_bytes, _OCTET)
            total_bytes += len(svg_bytes) + len(pdf_bytes)
            sheets_manifest.append({
                "id": sheet.id, "title": sheet.title,
                "svg_url": f"{base}/{svg_key}", "svg_sha256": _sha256(svg_bytes),
                "pdf_url": f"{base}/{pdf_key}", "pdf_sha256": _sha256(pdf_bytes),
            })
            with open(os.path.join(work, f"{sheet.id}.svg"), "wb") as fh:
                fh.write(svg_bytes)
            with open(os.path.join(work, f"{sheet.id}.pdf"), "wb") as fh:
                fh.write(pdf_bytes)

        doc = dxf_mod.build_dxf(sheet_set)
        dxf_path = os.path.join(work, "room.dxf")
        doc.saveas(dxf_path)
        with open(dxf_path, "rb") as fh:
            dxf_bytes = fh.read()
        dxf_key = f"{prefix}/room.dxf"
        ctx.storage.upload_bytes(dxf_key, dxf_bytes, _OCTET)
        total_bytes += len(dxf_bytes)

        # ── IFC4 (W2 IFC lane) — the one optional artifact; see module docstring.
        ifc_manifest_entry: dict[str, Any] = {"kind": "ifc", "status": "skipped"}
        ifc_url: str | None = None
        try:
            ifc_bytes = ifc_mod.build_ifc(room, {
                "scan_id": scan_id,
                "project": "Patina Field Capture",
                "room": str(scan_row.get("name") or scan_id[:8]),
                "generated_at": date_str,
                "scale": float(certificate.get("scale", 1.0)),
            })
            ifc_key = f"{prefix}/room.ifc"
            ctx.storage.upload_bytes(ifc_key, ifc_bytes, _OCTET)
            total_bytes += len(ifc_bytes)
            ifc_url = f"{base}/{ifc_key}"
            ifc_manifest_entry = {
                "kind": "ifc", "status": "generated",
                "url": ifc_url, "sha256": _sha256(ifc_bytes),
            }
        except Exception as exc:  # noqa: BLE001 — degrade, don't fail the stage.
            reason = str(exc)[:500]
            ifc_manifest_entry = {"kind": "ifc", "status": "skipped", "error": reason}
            log.warning("drawings: IFC export skipped for room_file %s: %s", room_file_id, reason)
            # scan_pipeline_events.status is CHECK-bounded to
            # ('started','succeeded','failed','info') — 'info' here, never
            # 'failed': the stage itself did not fail. The degrade signal is
            # the detail flag, not the status column.
            ctx.telemetry.emit(
                scan_id, "drawing", "drawings.ifc_skipped", "info",
                room_file_id=room_file_id, detail={"ifc_skipped": True, "error": reason},
            )

        # canonical pointers = plan sheet + the dxf
        plan = next((s for s in sheets_manifest if s["id"] == "plan"), sheets_manifest[0])
        svg_url, pdf_url = plan["svg_url"], plan["pdf_url"]
        dxf_url = f"{base}/{dxf_key}"
        drawings_json = {
            "sheets": sheets_manifest,
            "dxf_url": dxf_url,
            "dxf_sha256": _sha256(dxf_bytes),
            "generated_at": date_str,
            "sheet_count": len(sheets_manifest),
            "artifacts": [ifc_manifest_entry],
        }

        wrote = ctx.db.finalize_room_file_generated(
            room_file_id, svg_url, pdf_url, dxf_url, drawings_json,
        )
        if not wrote:
            raise TransientError(
                f"room_file {room_file_id} not in solved/generated at finalize — retry"
            )

        formats = ["svg", "pdf", "dxf"]
        if ifc_manifest_entry["status"] == "generated":
            formats.append("ifc")
        return {
            "render": {
                "sheet_count": len(sheets_manifest),
                "formats": formats,
                "total_bytes": total_bytes,
                "unverified": bool(certificate.get("unverified")),
                "ifc_skipped": ifc_manifest_entry["status"] != "generated",
            },
            "delivery": {
                "room_file_id": room_file_id, "version": version,
                "svg_url": svg_url, "pdf_url": pdf_url, "dxf_url": dxf_url,
                "ifc_url": ifc_url,
            },
        }
