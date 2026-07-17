"""``scan_pipeline_events`` emitter (00341) + optional ``job_runs`` heartbeat.

The worker is a service_role writer of scan_pipeline_events. ``stage`` is the
coarse CHECK-bounded phase; ``event`` is a free-form name within the stage (new
instrumentation needs no migration); ``detail`` carries the structured payload;
``duration_ms`` times the work (design §8). The events stream + agent_tasks give
full inspectability; job_runs is a secondary, optional ops signal.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from .config import Settings

log = logging.getLogger("patina_scan_worker.telemetry")


class Telemetry:
    def __init__(self, session: httpx.Client, settings: Settings):
        self._s = session
        self._cfg = settings

    def emit(
        self,
        scan_id: str,
        stage: str,
        event: str,
        status: str = "info",
        room_file_id: str | None = None,
        duration_ms: int | None = None,
        detail: dict[str, Any] | None = None,
    ) -> None:
        """Insert one scan_pipeline_events row. Telemetry is best-effort: a
        failed insert is logged, never raised — losing an event must not fail an
        otherwise-successful stage (agent_tasks remains the authoritative
        transition record)."""
        row: dict[str, Any] = {
            "scan_id": scan_id,
            "stage": stage,
            "event": event,
            "status": status,
            "detail": detail or {},
        }
        if room_file_id is not None:
            row["room_file_id"] = room_file_id
        if duration_ms is not None:
            row["duration_ms"] = duration_ms
        try:
            resp = self._s.post(
                "/rest/v1/scan_pipeline_events",
                json=row,
                headers={"Prefer": "return=minimal"},
            )
            if resp.status_code >= 400:
                log.warning(
                    "scan_pipeline_events insert -> %s: %s",
                    resp.status_code,
                    resp.text[:200],
                )
        except httpx.HTTPError as exc:
            log.warning("scan_pipeline_events insert failed: %s", exc)

    def job_run(self, job_name: str, status: str, detail: dict[str, Any]) -> None:
        """Optional ops heartbeat into job_runs (design §8.3). Best-effort."""
        try:
            self._s.post(
                "/rest/v1/job_runs",
                json={
                    "job_name": job_name,
                    "status": status,
                    "finished_at": "now()",
                    "detail": detail,
                },
                headers={"Prefer": "return=minimal"},
            )
        except httpx.HTTPError as exc:
            log.warning("job_runs insert failed: %s", exc)
