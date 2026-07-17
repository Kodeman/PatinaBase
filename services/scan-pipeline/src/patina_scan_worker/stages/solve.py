"""scan_pipeline.solve — anchor scale fit + tolerance model + accuracy
certificate + UNVERIFIED propagation (design §2.1; package item 10; R108.5).

Solves in the SOURCE frame (model-space metres): downloads captured_room.json +
the manifest (its validated inline anchors[] are the model-space anchor set —
equivalent to the redundant anchors.json artifact; the manifest is authoritative
and always present, blessed call). Fits a scalar scale, snaps anchored spans to
their typed values, classes every dimension, writes room_file_measurements + the
certificate, flips room_files → 'solved', and enqueues drawings.
"""

from __future__ import annotations

import json
import os
import shutil
import time
from typing import Any

from ..errors import PermanentError, TransientError
from ..keys import (
    OwnershipError,
    artifact_object_key,
    assert_owner_prefix,
    object_key_from_url,
)
from .base import BaseStage, Context, StageOutcome
from .captured_room import parse_captured_room_meters
from .dimensions import build_measurements
from .solve_math import (
    MIN_VERIFIED_ANCHORS,
    build_certificate,
    fit_scale,
    parse_anchors,
    refit_at_scale,
    scale_is_plausible,
    validate_certificate,
)


class SolveStage(BaseStage):
    stage = "solve"

    def run(self, ctx: Context, task: dict[str, Any]) -> StageOutcome:
        t0 = time.monotonic()
        payload = task.get("payload") or {}
        scan_id = payload.get("scan_id")
        room_file_id = payload.get("room_file_id")
        version = payload.get("room_file_version")
        if not scan_id or not room_file_id or version is None:
            raise PermanentError(
                f"solve payload missing scan_id/room_file_id/room_file_version: {payload!r}"
            )

        ctx.telemetry.emit(
            scan_id, "solve", "solve.started", "started",
            room_file_id=room_file_id, detail={"version": version},
        )

        work = os.path.join(ctx.settings.work_dir, scan_id, f"solve-v{int(version)}")
        try:
            try:
                summary = self._solve(ctx, task, scan_id, room_file_id, int(version), work)
            except (PermanentError, TransientError) as exc:
                ctx.telemetry.emit(
                    scan_id, "solve", "solve.failed", "failed",
                    room_file_id=room_file_id,
                    duration_ms=int((time.monotonic() - t0) * 1000),
                    detail={
                        "failure_token": getattr(exc, "token", None),
                        "error": str(exc),
                        "fatal": exc.fatal,
                        **getattr(exc, "detail_extra", {}),
                    },
                )
                if exc.fatal:
                    ctx.db.mark_room_file_error(room_file_id, str(exc))
                raise

            # enqueue drawings BEFORE completing (crash-safe, idempotent) — §2.3
            ctx.queue.enqueue_successor(
                task_type="scan_pipeline.drawings",
                payload={
                    "scan_id": scan_id,
                    "room_file_id": room_file_id,
                    "room_file_version": version,
                },
                entity_id=scan_id,
                idempotency_key=f"{scan_id}:drawings:{version}",
                parent_task_id=task["id"],
            )

            ctx.telemetry.emit(
                scan_id, "solve", "solve.succeeded", "succeeded",
                room_file_id=room_file_id,
                duration_ms=int((time.monotonic() - t0) * 1000),
                detail=summary,
            )
            return StageOutcome(artifacts={
                "room_file_id": room_file_id,
                "scale": summary["scale"],
                "rms_residual_mm": summary["rms_residual_mm"],
                "tolerance_counts": summary["dimension_counts"],
                "unverified": summary["unverified"],
                "successor_enqueued": "scan_pipeline.drawings",
            })
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def _solve(self, ctx, task, scan_id, room_file_id, version, work) -> dict[str, Any]:
        os.makedirs(work, exist_ok=True)
        scan_row = ctx.db.get_room_scan(scan_id)
        user_id = scan_row.get("user_id")
        room_id = scan_row.get("room_id")

        # ── download manifest + captured_room (owner-anchored keys) ────────────
        manifest_url = scan_row.get("bundle_manifest_url")
        manifest_key = object_key_from_url(manifest_url) if isinstance(manifest_url, str) else None
        if not manifest_key:
            raise PermanentError("bundle_manifest_url missing", token="MISSING_MANIFEST")
        try:
            assert_owner_prefix(manifest_key, user_id, room_id)
            cr_key = artifact_object_key(manifest_key, "captured_room.json", "capturedRoomJson", scan_row)
            assert_owner_prefix(cr_key, user_id, room_id)
        except OwnershipError as exc:
            raise PermanentError(str(exc), token="OWNERSHIP_VIOLATION") from exc

        manifest = self._download_json(ctx, manifest_key, os.path.join(work, "manifest.json"), "MANIFEST_PARSE")
        captured = self._download_json(ctx, cr_key, os.path.join(work, "captured_room.json"), "SCHEMA_VIOLATION")

        # ── anchors (manifest inline) + geometry (metres) ──────────────────────
        anchors = parse_anchors(manifest.get("anchors"))
        anchor_count = len(anchors)
        room = parse_captured_room_meters(captured)
        # re-assert UNVERIFIED (never recompute differently): manifest flag OR <3.
        unverified = bool(manifest.get("unverified")) or anchor_count < MIN_VERIFIED_ANCHORS

        # ── scale fit + plausibility guard (F4) ────────────────────────────────
        fit = fit_scale(anchors)
        scale_ignored = False
        if anchor_count >= MIN_VERIFIED_ANCHORS:
            # a verified room's implausible fit is fatal — never silently rescale
            if not scale_is_plausible(fit.scale):
                exc = PermanentError(
                    f"scale {fit.scale:.4f} outside plausible bounds — a fat-thumbed "
                    f"anchor must not silently rescale a room",
                    token="SOLVE_IMPLAUSIBLE",
                )
                exc.detail_extra = {"scale": fit.scale, "anchors": fit.per_anchor}
                raise exc
        elif anchor_count >= 1 and not scale_is_plausible(fit.scale):
            # UNVERIFIED room with a sloppy 1–2-anchor fit: ignore it and fall back
            # to s=1 — a bad anchor must not produce a WORSE outcome than no anchor.
            fit = refit_at_scale(anchors, 1.0)
            scale_ignored = True

        # ── dimensions + tolerance classes ─────────────────────────────────────
        built = build_measurements(room, anchors, fit, unverified)

        # ── persist anchors → scan_anchors, resolve verified anchor_ids ────────
        anchor_rows = [{
            "scan_id": scan_id,
            "client_anchor_id": a.client_anchor_id,
            "anchor_index": a.index,
            "label": a.label,
            "span_kind": a.span_kind,
            "entry_method": "typed",
            "endpoint_a": {"x": a.endpoint_a[0], "y": a.endpoint_a[1], "z": a.endpoint_a[2]},
            "endpoint_b": {"x": a.endpoint_b[0], "y": a.endpoint_b[1], "z": a.endpoint_b[2]},
            "model_span_m": a.model_span_m if a.model_span_m == a.model_span_m else None,  # drop NaN
            "measured_value_mm": a.measured_value_mm,
        } for a in anchors]
        client_to_id = ctx.db.upsert_anchors(scan_id, anchor_rows)

        # ── build measurement rows ─────────────────────────────────────────────
        rows: list[dict[str, Any]] = []
        for sp in built.specs:
            anchor_id = None
            if sp.anchor_client_id is not None:
                anchor_id = client_to_id.get(sp.anchor_client_id)
                if anchor_id is None:
                    # cannot ground a 'verified' row without its anchor row —
                    # internal inconsistency, fail loudly rather than violate the CHECK
                    raise PermanentError(
                        f"verified dimension {sp.label!r} references anchor "
                        f"{sp.anchor_client_id} with no scan_anchors row",
                        token="SOLVE_IMPLAUSIBLE",
                    )
            rows.append({
                "room_file_id": room_file_id,
                "scan_id": scan_id,
                "label": sp.label,
                "element_ref": sp.element_ref,
                "value_mm": sp.value_mm,
                "source": sp.source,
                "tolerance_mm": sp.tolerance_mm,
                "tolerance_class": sp.tolerance_class,
                "anchor_id": anchor_id,
            })

        # ── certificate (built + validated BEFORE persisting) ──────────────────
        cert = build_certificate(
            fit=fit,
            used_anchor_ids=built.used_anchor_ids,
            unverified=unverified,
            dimension_counts=built.dimension_counts,
            floor_area_sqft=built.floor_area_sqft,
            anchor_count=anchor_count,
            scale_ignored=scale_ignored,
        )
        cert_errors = validate_certificate(cert)
        if cert_errors:
            exc = PermanentError(
                f"certificate failed validation: {cert_errors}", token="CERTIFICATE_INVALID"
            )
            exc.detail_extra = {"certificate_errors": cert_errors}
            raise exc

        # ── write measurements + finalize room_files → 'solved' (forward-only) ─
        ctx.db.replace_measurements(room_file_id, rows)
        wrote = ctx.db.finalize_room_file_solved(
            room_file_id=room_file_id,
            certificate=cert,
            unverified=unverified,
            tolerance_class=built.rollup_class,
            anchor_count=anchor_count,
        )
        if not wrote:
            # F1: the room_file had already advanced past 'solved' (e.g. drawings
            # ran); the forward-only guard skipped the regress. Record it, don't fail.
            ctx.telemetry.emit(
                scan_id, "solve", "solve.finalize_skipped", "info",
                room_file_id=room_file_id,
                detail={"reason": "room_file already past 'solved' (forward-only guard)"},
            )

        ctx.telemetry.emit(
            scan_id, "solve", "solve.fit", "info", room_file_id=room_file_id,
            detail={
                "scale": cert["scale"], "scale_ignored": scale_ignored,
                "rms_residual_mm": fit.rms_residual_mm,
                "anchors_used": len(built.used_anchor_ids),
            },
        )
        return {
            "scale": cert["scale"],
            "rms_residual_mm": fit.rms_residual_mm,
            "dimension_counts": built.dimension_counts,
            "unverified": unverified,
            "measurement_rows": len(rows),
            "warnings": room.warnings[:10],
        }

    def _download_json(self, ctx, key: str, dest: str, parse_token: str) -> Any:
        ctx.storage.download_to(key, dest)
        try:
            with open(dest, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise PermanentError(f"{key} parse: {exc}", token=parse_token) from exc
