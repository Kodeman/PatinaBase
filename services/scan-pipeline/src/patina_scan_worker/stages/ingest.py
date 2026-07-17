"""scan_pipeline.ingest — validate the uploaded bundle; reconcile checksums;
reserve the deliverable version; enqueue solve (design §2.1/§2.3/§2.4).

Reuses the reference validator (vendored byte-identical from
scripts/validate_capture_bundle.py, single canonical source stays scripts/), so
the device-side and server-side verdicts run the SAME code path.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

from ..errors import PermanentError, TransientError, classify_failures
from ..keys import (
    artifact_object_key,
    bundle_prefix_from_manifest_url,
    object_key_from_url,
)
from ..untar import safe_extract_tar
from .base import BaseStage, Context, StageOutcome
from .validator import validate_bundle

# Transport archives (capture-bundle-spec Part 3 / B-16): kind → bundle filename.
# Untarred (safely) into a scratch subdir so later stages / P2 see the logical
# per-file layout; the .tar files themselves stay on disk for the checksum walk.
TRANSPORT_ARCHIVE_KINDS = {
    "depthArchive": "depth.tar",
    "keyframesArchive": "keyframes.tar",
}


class DownloadItem:
    __slots__ = ("object_key", "rel_path", "kind", "declared_sha")

    def __init__(self, object_key: str, rel_path: str, kind: str | None, declared_sha: str | None):
        self.object_key = object_key
        self.rel_path = rel_path
        self.kind = kind
        self.declared_sha = declared_sha


# ── pure helpers (unit-tested without IO) ────────────────────────────────────

def plan_downloads(
    manifest: dict[str, Any], prefix: str | None, scan_row: dict[str, Any]
) -> list[DownloadItem]:
    """Build the ordered download plan from the manifest's artifact inventory.

    Each artifact resolves to a storage key (dedicated URL column preferred,
    bundle-prefix fallback) and a scratch relative path (its manifest
    relativePath, so the scratch dir reconstructs the on-device bundle the
    validator expects). A relativePath that fails containment raises here
    (PATH_VIOLATION) before any IO.
    """
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list):
        raise PermanentError(
            "manifest.artifacts is not an array", token="SCHEMA_VIOLATION"
        )
    plan: list[DownloadItem] = []
    for a in artifacts:
        if not isinstance(a, dict):
            continue
        rel = a.get("relativePath")
        kind = a.get("kind")
        if not isinstance(rel, str) or not rel:
            # The validator will name SCHEMA_VIOLATION for this; skip the fetch.
            continue
        try:
            key = artifact_object_key(prefix, rel, kind, scan_row)
        except ValueError as exc:
            raise PermanentError(str(exc), token="PATH_VIOLATION") from exc
        plan.append(DownloadItem(key, rel, kind, a.get("sha256")))
    return plan


def reconcile_artifacts_sha256(
    manifest: dict[str, Any], artifacts_sha256: dict[str, Any] | None
) -> list[str]:
    """Cross-check the manifest's self-declared per-artifact hashes against the
    uploader's per-PUT ledger (room_scans.artifacts_sha256, keyed by
    ArtifactKind.rawValue — 00082). A disagreement means the manifest and the
    upload record diverge → a poison bundle. Returns a list of token strings
    (empty == reconciled)."""
    if not isinstance(artifacts_sha256, dict) or not artifacts_sha256:
        return []
    tokens: list[str] = []
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list):
        return []
    for a in artifacts:
        if not isinstance(a, dict):
            continue
        kind = a.get("kind")
        declared = a.get("sha256")
        ledger = artifacts_sha256.get(kind) if isinstance(kind, str) else None
        if not isinstance(declared, str) or not isinstance(ledger, str):
            continue
        if declared.lower() != ledger.lower():
            tokens.append(
                f"ARTIFACTS_SHA256_MISMATCH: kind {kind!r} manifest "
                f"{declared[:12]}… != ledger {ledger[:12]}…"
            )
    return tokens


def _summarize(manifest: dict[str, Any]) -> dict[str, Any]:
    artifacts = manifest.get("artifacts") or []
    anchors = manifest.get("anchors") or []
    total_bytes = 0
    for a in artifacts:
        if isinstance(a, dict) and isinstance(a.get("sizeBytes"), int):
            total_bytes += a["sizeBytes"]
    return {
        "artifact_count": len(artifacts) if isinstance(artifacts, list) else 0,
        "total_bytes": total_bytes,
        "anchor_count": len(anchors) if isinstance(anchors, list) else 0,
        "unverified": bool(manifest.get("unverified")),
    }


# ── the stage ────────────────────────────────────────────────────────────────

class IngestStage(BaseStage):
    stage = "ingest"

    def run(self, ctx: Context, task: dict[str, Any]) -> StageOutcome:
        t0 = time.monotonic()
        payload = task.get("payload") or {}
        scan_id = payload.get("scan_id")
        version = payload.get("room_file_version")
        attempts = int(task.get("attempts") or 1)
        if not scan_id or version is None:
            raise PermanentError(
                f"ingest payload missing scan_id/room_file_version: {payload!r}"
            )

        scan_row = ctx.db.get_room_scan(scan_id)
        room_file = ctx.db.reserve_room_file(scan_id, int(version))
        room_file_id = room_file["id"]

        ctx.telemetry.emit(
            scan_id, "ingest", "ingest.started", "started",
            room_file_id=room_file_id,
            detail={"version": version, "attempt": attempts},
        )

        try:
            summary = self._validate(ctx, task, scan_row, scan_id, int(version))
        except (PermanentError, TransientError) as exc:
            ctx.telemetry.emit(
                scan_id, "ingest", "ingest.failed", "failed",
                room_file_id=room_file_id,
                duration_ms=int((time.monotonic() - t0) * 1000),
                detail={
                    "failure_token": getattr(exc, "token", None),
                    "error": str(exc),
                    "fatal": exc.fatal,
                    "attempt": attempts,
                },
            )
            if exc.fatal:
                ctx.db.mark_room_file_error(room_file_id, str(exc))
            raise

        # ── success: enqueue solve BEFORE completing done (crash-safe, §2.3) ──
        successor_key = f"{scan_id}:solve:{version}"
        ctx.queue.enqueue_successor(
            task_type="scan_pipeline.solve",
            payload={
                "scan_id": scan_id,
                "room_file_id": room_file_id,
                "room_file_version": version,
            },
            entity_id=scan_id,
            idempotency_key=successor_key,
            parent_task_id=task["id"],
        )

        duration_ms = int((time.monotonic() - t0) * 1000)
        ctx.telemetry.emit(
            scan_id, "ingest", "ingest.succeeded", "succeeded",
            room_file_id=room_file_id,
            duration_ms=duration_ms,
            detail=summary,
        )
        return StageOutcome(
            artifacts={
                "validated": True,
                "artifact_count": summary["artifact_count"],
                "unverified": summary["unverified"],
                "room_file_id": room_file_id,
                "successor_enqueued": "scan_pipeline.solve",
            }
        )

    # ── the download → untar → validate → reconcile body ──────────────────────
    def _validate(
        self,
        ctx: Context,
        task: dict[str, Any],
        scan_row: dict[str, Any],
        scan_id: str,
        version: int,
    ) -> dict[str, Any]:
        work = os.path.join(ctx.settings.work_dir, scan_id, f"v{version}")
        os.makedirs(work, exist_ok=True)

        manifest_url = scan_row.get("bundle_manifest_url")
        manifest_key = object_key_from_url(manifest_url) if isinstance(manifest_url, str) else None
        if not manifest_key:
            raise PermanentError(
                "room_scans.bundle_manifest_url missing/unparseable",
                token="MISSING_MANIFEST",
            )
        prefix = bundle_prefix_from_manifest_url(manifest_url)

        manifest_path = os.path.join(work, "manifest.json")
        ctx.storage.download_to(manifest_key, manifest_path)
        try:
            with open(manifest_path, "r", encoding="utf-8") as fh:
                manifest = json.load(fh)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise PermanentError(f"manifest parse: {exc}", token="MANIFEST_PARSE") from exc
        if not isinstance(manifest, dict):
            raise PermanentError("manifest top-level is not an object", token="MANIFEST_PARSE")

        # Download every listed artifact into the scratch bundle. A 404
        # (MISSING_FILE) is left for the validator to name so classification runs
        # once, over the full token set; a network/5xx blip propagates as
        # TransientError and retries the whole task.
        plan = plan_downloads(manifest, prefix, scan_row)
        for item in plan:
            dest = os.path.join(work, item.rel_path)
            try:
                ctx.storage.download_to(item.object_key, dest)
            except PermanentError as exc:
                if exc.token == "MISSING_FILE":
                    continue  # validator will report it against the manifest
                raise

        # Safe untar of the transport archives (item 3) — into a scratch subdir so
        # the .tar files stay intact for the checksum walk. A malicious/corrupt
        # archive raises PATH_VIOLATION / SCHEMA_VIOLATION (fatal) here.
        for kind, fname in TRANSPORT_ARCHIVE_KINDS.items():
            tar_path = os.path.join(work, fname)
            if os.path.isfile(tar_path):
                safe_extract_tar(tar_path, os.path.join(work, "_untar", kind))

        # Full checksum walk + consistency checks (vendored reference validator).
        failures = validate_bundle(work)
        tokens = [f.split(":", 1)[0] for f in failures]
        tokens += [t.split(":", 1)[0] for t in reconcile_artifacts_sha256(
            manifest, scan_row.get("artifacts_sha256")
        )]

        if tokens:
            fatal, reason = classify_failures(tokens, int(task.get("attempts") or 1))
            detail = "; ".join(failures) or reason
            if fatal:
                raise PermanentError(f"{reason} :: {detail}", token=sorted(set(tokens))[0])
            raise TransientError(f"{reason} :: {detail}", token=sorted(set(tokens))[0])

        ctx.telemetry.emit(
            scan_id, "ingest", "ingest.validated", "info",
            detail=_summarize(manifest),
        )
        return _summarize(manifest)
